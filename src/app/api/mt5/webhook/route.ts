import { NextRequest, NextResponse } from "next/server";
import { createWebhookClient } from "@/lib/supabase/server";
import type { TradeSession } from "@/types/supabase";

type MT5Payload = {
  position_id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  lots: number;
  open_price: number;
  close_price?: number;      // absent for open positions
  sl: number;
  tp: number;
  open_time: string;         // ISO 8601 UTC
  close_time?: string;       // absent for open positions
  profit?: number;           // absent for open positions
  commission: number;
  swap: number;
  unrealized_pnl?: number;   // present for open positions
};

function detectSession(isoUtc: string): TradeSession | null {
  const h = new Date(isoUtc).getUTCHours();
  if (h >= 7  && h < 12) return "LONDON";
  if (h >= 12 && h < 16) return "OVERLAP";
  if (h >= 16 && h < 21) return "NEW_YORK";
  return "TOKYO";
}

function calcReturnR(
  direction: "LONG" | "SHORT",
  openPrice: number,
  closePrice: number,
  sl: number,
): number | null {
  if (!sl || !openPrice) return null;
  const slDist = Math.abs(openPrice - sl);
  if (slDist === 0) return null;
  const tradeDist = direction === "LONG"
    ? closePrice - openPrice
    : openPrice - closePrice;
  return Math.round((tradeDist / slDist) * 100) / 100;
}

export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  const supabase = createWebhookClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account, error: accErr } = await (supabase as any)
    .from("accounts")
    .select("id, user_id")
    .eq("webhook_token", token)
    .single();

  if (accErr || !account) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  let body: MT5Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const isOpen = !body.close_time || body.close_time.trim() === "";

  let tradeRow: Record<string, unknown>;

  if (isOpen) {
    // ── Open position — upsert partial row, close fields stay null ──
    tradeRow = {
      account_id:  account.id,
      user_id:     account.user_id,
      instrument:  body.symbol,
      direction:   body.direction,
      lot_size:    body.lots,
      entry_price: body.open_price,
      exit_price:  null,
      sl:          body.sl || null,
      tp:          body.tp || null,
      open_time:   body.open_time,
      close_time:  null,
      duration_minutes: null,
      session:     detectSession(body.open_time),
      gross_pnl:   null,
      net_pnl:     null,
      fees:        Math.round(body.commission * 100) / 100,
      swap:        Math.round(body.swap * 100) / 100,
      return_r:    null,
      source:      "MT5" as const,
      mt5_ticket:  body.position_id,
    };
  } else {
    // ── Closed trade — full row ─────────────────────────────────────
    const profit   = body.profit ?? 0;
    const netPnl   = Math.round((profit + body.commission + body.swap) * 100) / 100;
    const openMs   = new Date(body.open_time).getTime();
    const closeMs  = new Date(body.close_time!).getTime();
    const duration = isNaN(openMs) || isNaN(closeMs) ? null : Math.round((closeMs - openMs) / 60000);

    tradeRow = {
      account_id:       account.id,
      user_id:          account.user_id,
      instrument:       body.symbol,
      direction:        body.direction,
      lot_size:         body.lots,
      entry_price:      body.open_price,
      exit_price:       body.close_price ?? null,
      sl:               body.sl || null,
      tp:               body.tp || null,
      open_time:        body.open_time,
      close_time:       body.close_time,
      duration_minutes: duration,
      session:          detectSession(body.open_time),
      gross_pnl:        Math.round(profit * 100) / 100,
      net_pnl:          netPnl,
      fees:             Math.round((body.commission + body.swap) * 100) / 100,
      swap:             Math.round(body.swap * 100) / 100,
      return_r:         calcReturnR(body.direction, body.open_price, body.close_price ?? 0, body.sl),
      source:           "MT5" as const,
      mt5_ticket:       body.position_id,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upsertErr } = await (supabase as any)
    .from("trades")
    .upsert(tradeRow, { onConflict: "mt5_ticket" });

  if (upsertErr) {
    console.error("[mt5/webhook] upsert error:", upsertErr.message);
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("accounts")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", account.id);

  // Recalculate balance only on close (open positions don't affect realized balance)
  if (!isOpen) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc("recalculate_account_balance", { p_account_id: account.id });
  }

  // ── Match pending trade with this MT5 event ───────────────────────────────
  // When the user logs a trade via the app (status='pending'), the webhook links
  // it to the real MT5 ticket as soon as the EA fires.
  if (isOpen) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pendingTrades } = await (supabase as any)
      .from("trades")
      .select("id")
      .eq("account_id", account.id)
      .eq("instrument", body.symbol)
      .eq("direction", body.direction)
      .eq("status", "pending")
      .is("mt5_ticket", null)
      .order("open_time", { ascending: false })
      .limit(1);

    if (pendingTrades && pendingTrades.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("trades")
        .update({ status: "open", mt5_ticket: body.position_id, entry_price: body.open_price })
        .eq("id", pendingTrades[0].id);
    }
  }

  // ── Check daily exposure and send Telegram alert if needed ───────────────
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: accLimits } = await (supabase as any)
      .from("accounts")
      .select("personal_daily_stop_usd")
      .eq("id", account.id)
      .single();

    const personalStop: number = accLimits?.personal_daily_stop_usd ?? 300;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: todayTrades } = await (supabase as any)
      .from("trades")
      .select("net_pnl, close_time")
      .eq("account_id", account.id)
      .gte("open_time", todayStart.toISOString());

    const rows: Array<{ net_pnl: number | null; close_time: string | null }> = todayTrades ?? [];
    const realizedPnL = rows
      .filter(t => t.close_time !== null)
      .reduce((sum, t) => sum + (t.net_pnl ?? 0), 0);

    const unrealizedFromEvent = isOpen ? (body.unrealized_pnl ?? 0) : 0;
    const totalExposure = realizedPnL + unrealizedFromEvent;
    const absLoss = Math.abs(Math.min(0, totalExposure));
    const pct = absLoss / personalStop;

    const appBase = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    if (pct >= 1.0) {
      await fetch(`${appBase}/api/notify/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `🛑 *STOP DIARIO ALCANZADO*\n\nPérdida del día: *$${absLoss.toFixed(2)}* de $${personalStop} límite.\nCierra todas las posiciones abiertas.`,
          throttle_key: `breach-${account.id}`,
        }),
      });
    } else if (pct >= 0.8) {
      await fetch(`${appBase}/api/notify/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `⚠️ *Alerta de riesgo diario*\n\nLlevas *$${absLoss.toFixed(2)}* en pérdidas hoy (${Math.round(pct * 100)}% de tu límite de $${personalStop}).\n\nPrecaución: queda solo $${(personalStop - absLoss).toFixed(2)} de margen.`,
          throttle_key: `danger-${account.id}`,
        }),
      });
    }
  } catch (alertErr) {
    console.error("[mt5/webhook] alert error:", alertErr);
  }

  return NextResponse.json({ ok: true, ticket: body.position_id, type: isOpen ? "open" : "closed" });
}
