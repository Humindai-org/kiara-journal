import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createWebhookClient } from "@/lib/supabase/server";
import {
  getAccountInfo,
  getHistoryDeals,
  getOpenPositions,
  type MetaApiDeal,
  type MetaApiPosition,
} from "@/lib/metaapi-client";

// ── Session detection ───────────────────────────────────────────────────────

type Session = "TOKYO" | "LONDON" | "NEW_YORK" | "OVERLAP";

function detectSession(isoUtc: string): Session {
  const h = new Date(isoUtc).getUTCHours();
  if (h >= 7  && h < 12) return "LONDON";
  if (h >= 12 && h < 16) return "OVERLAP";
  if (h >= 16 && h < 21) return "NEW_YORK";
  return "TOKYO";
}

// ── Deal → trade conversion ─────────────────────────────────────────────────

function dealsToTrades(
  deals:     MetaApiDeal[],
  accountId: string,
  userId:    string,
): Record<string, unknown>[] {
  // Group by positionId
  const groups = new Map<string, { open?: MetaApiDeal; close?: MetaApiDeal }>();
  for (const d of deals) {
    if (!["DEAL_TYPE_BUY", "DEAL_TYPE_SELL"].includes(d.type)) continue;
    if (!d.positionId) continue;
    if (!groups.has(d.positionId)) groups.set(d.positionId, {});
    const g = groups.get(d.positionId)!;
    if (d.entryType === "DEAL_ENTRY_IN") {
      g.open = d;
    } else if (["DEAL_ENTRY_OUT", "DEAL_ENTRY_OUT_BY", "DEAL_ENTRY_INOUT"].includes(d.entryType)) {
      g.close = d;
    }
  }

  const rows: Record<string, unknown>[] = [];

  for (const [positionId, { open, close }] of groups) {
    if (!close) continue; // open-only deals handled via positions endpoint

    const ref       = open ?? close;
    const direction = ref.type === "DEAL_TYPE_BUY" ? "LONG" : "SHORT";
    const profit    = close.profit    ?? 0;
    const commOpen  = open?.commission ?? 0;
    const commClose = close.commission ?? 0;
    const swap      = close.swap      ?? 0;
    const netPnl    = Math.round((profit + commOpen + commClose + swap) * 100) / 100;
    const openTime  = open?.time ?? close.time;
    const closeTime = close.time;
    const openMs    = new Date(openTime).getTime();
    const closeMs   = new Date(closeTime).getTime();
    const duration  = isNaN(openMs) || isNaN(closeMs) ? null : Math.round((closeMs - openMs) / 60000);

    rows.push({
      account_id:       accountId,
      user_id:          userId,
      instrument:       close.symbol ?? open?.symbol ?? "",
      direction,
      lot_size:         close.volume ?? open?.volume ?? 0,
      entry_price:      open?.price  ?? 0,
      exit_price:       close.price  ?? 0,
      sl:               null, // MetaApi deals don't carry SL/TP
      tp:               null,
      open_time:        openTime,
      close_time:       closeTime,
      duration_minutes: duration,
      session:          detectSession(openTime),
      gross_pnl:        Math.round(profit * 100) / 100,
      net_pnl:          netPnl,
      fees:             Math.round((commOpen + commClose) * 100) / 100,
      swap:             Math.round(swap * 100) / 100,
      return_r:         null,
      source:           "MT5",
      mt5_ticket:       positionId,
    });
  }

  return rows;
}

// ── Position → open trade ───────────────────────────────────────────────────

function positionToOpenTrade(
  pos:       MetaApiPosition,
  accountId: string,
  userId:    string,
): Record<string, unknown> {
  const direction = pos.type === "POSITION_TYPE_BUY" ? "LONG" : "SHORT";
  const openTime  = pos.time ?? new Date().toISOString();

  return {
    account_id:       accountId,
    user_id:          userId,
    instrument:       pos.symbol,
    direction,
    lot_size:         pos.volume,
    entry_price:      pos.openPrice,
    exit_price:       null,
    sl:               pos.sl || null,
    tp:               pos.tp || null,
    open_time:        openTime,
    close_time:       null,
    duration_minutes: null,
    session:          detectSession(openTime),
    gross_pnl:        null,
    net_pnl:          null,
    fees:             Math.round((pos.commission ?? 0) * 100) / 100,
    swap:             Math.round((pos.swap ?? 0) * 100) / 100,
    return_r:         null,
    source:           "MT5",
    mt5_ticket:       pos.id,
  };
}

// ── Core sync logic ─────────────────────────────────────────────────────────

async function syncAccount(
  metaapiToken: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:     any,
  account:      { id: string; user_id: string; metaapi_account_id: string; last_synced_at: string | null },
): Promise<{ imported: number; open: number; state: string }> {
  const info = await getAccountInfo(metaapiToken, account.metaapi_account_id);

  if (info.state !== "DEPLOYED") {
    return { imported: 0, open: 0, state: info.state };
  }

  // Window: since last sync (minus 1-day overlap) or last 90 days for first sync
  const endTime   = new Date().toISOString();
  const startDate = account.last_synced_at
    ? new Date(new Date(account.last_synced_at).getTime() - 86400_000)
    : new Date(Date.now() - 90 * 86400_000);
  const startTime = startDate.toISOString();

  const [deals, positions] = await Promise.all([
    getHistoryDeals(metaapiToken, info.region, account.metaapi_account_id, startTime, endTime),
    getOpenPositions(metaapiToken, info.region, account.metaapi_account_id),
  ]);

  const closedRows = dealsToTrades(deals, account.id, account.user_id);
  const openRows   = positions.map(p => positionToOpenTrade(p, account.id, account.user_id));

  let importedCount = 0;
  let openCount     = 0;

  if (closedRows.length > 0) {
    const { error } = await supabase
      .from("trades")
      .upsert(closedRows, { onConflict: "mt5_ticket" });
    if (!error) importedCount = closedRows.length;
  }

  if (openRows.length > 0) {
    const { error } = await supabase
      .from("trades")
      .upsert(openRows, { onConflict: "mt5_ticket" });
    if (!error) openCount = openRows.length;
  }

  // Recalculate realized balance
  if (importedCount > 0) {
    await supabase.rpc("recalculate_account_balance", { p_account_id: account.id });
  }

  await supabase
    .from("accounts")
    .update({ last_synced_at: endTime })
    .eq("id", account.id);

  return { imported: importedCount, open: openCount, state: "DEPLOYED" };
}

// ── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const metaapiToken = process.env.METAAPI_TOKEN;
  if (!metaapiToken) {
    return NextResponse.json({ error: "METAAPI_TOKEN not configured" }, { status: 503 });
  }

  // Check if called by Vercel cron
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isCron = cronSecret ? authHeader === `Bearer ${cronSecret}` : false;

  const serviceSupabase = createWebhookClient();

  if (isCron) {
    // Sync all accounts that have MetaApi connected
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: accounts } = await (serviceSupabase as any)
      .from("accounts")
      .select("id, user_id, metaapi_account_id, last_synced_at")
      .not("metaapi_account_id", "is", null);

    const results = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const acc of (accounts as any[]) ?? []) {
      try {
        const r = await syncAccount(metaapiToken, serviceSupabase, acc);
        results.push({ account_id: acc.id, ...r });
      } catch (err) {
        results.push({ account_id: acc.id, error: String(err) });
      }
    }

    return NextResponse.json({ ok: true, results });
  }

  // Manual sync — user must be authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { account_id: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { account_id } = body;
  if (!account_id) return NextResponse.json({ error: "account_id required" }, { status: 400 });

  // Verify ownership
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account } = await (supabase as any)
    .from("accounts")
    .select("id, user_id, metaapi_account_id, last_synced_at")
    .eq("id", account_id)
    .eq("user_id", user.id)
    .single();

  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (!account.metaapi_account_id) {
    return NextResponse.json({ error: "MetaApi not connected for this account" }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await syncAccount(metaapiToken, serviceSupabase, account as any);

    if (result.state !== "DEPLOYED") {
      return NextResponse.json({ ok: false, reason: result.state.toLowerCase(), state: result.state });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[metaapi/sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
