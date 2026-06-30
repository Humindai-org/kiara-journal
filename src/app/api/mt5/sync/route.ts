import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TradeSession } from "@/types/supabase";

// Formato de salida de mt5_exporter.py --json
type MT5ExporterTrade = {
  ticket: string;
  symbol: string;
  type: string;         // "buy" | "sell" | "buy stop" | etc.
  lots: number;
  open_time: string;    // "2026.06.24 09:30:00"
  close_time: string;
  open_price: number;
  close_price: number;
  sl: number;
  tp: number;
  profit: number;
  commission: number;
  swap: number;
  net_pnl: number;
  duration_minutes: number;
  pips: number;
};

type SyncBody = {
  account_id: string;
  trades: MT5ExporterTrade[];
};

function normalizeMT5Time(raw: string): string {
  // "2026.06.24 09:30:00" → "2026-06-24T09:30:00Z"
  return raw.replace(/\./g, "-").replace(" ", "T") + "Z";
}

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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: SyncBody = await req.json();

  if (!body.account_id || !Array.isArray(body.trades)) {
    return NextResponse.json({ error: "account_id and trades[] required" }, { status: 400 });
  }

  // Validate account belongs to this user
  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", body.account_id)
    .eq("user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const rows = body.trades.map((t) => {
    const direction: "LONG" | "SHORT" = t.type.toLowerCase().includes("buy") ? "LONG" : "SHORT";
    const openTime  = normalizeMT5Time(t.open_time);
    const closeTime = normalizeMT5Time(t.close_time);

    return {
      account_id:       body.account_id,
      user_id:          user.id,
      instrument:       t.symbol,
      direction,
      lot_size:         t.lots,
      entry_price:      t.open_price,
      exit_price:       t.close_price,
      sl:               t.sl || null,
      tp:               t.tp || null,
      open_time:        openTime,
      close_time:       closeTime,
      duration_minutes: Math.round(t.duration_minutes) || null,
      session:          detectSession(openTime),
      gross_pnl:        Math.round(t.profit * 100) / 100,
      net_pnl:          Math.round(t.net_pnl * 100) / 100,
      fees:             Math.round((t.commission + t.swap) * 100) / 100,
      swap:             Math.round(t.swap * 100) / 100,
      return_r:         calcReturnR(direction, t.open_price, t.close_price, t.sl),
      source:           "MT5" as const,
      mt5_ticket:       t.ticket,
    };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error, count } = await (supabase as any)
    .from("trades")
    .upsert(rows, { onConflict: "mt5_ticket", count: "exact" });

  if (error) {
    console.error("[mt5/sync] upsert error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("accounts")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", body.account_id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc("recalculate_account_balance", { p_account_id: body.account_id });

  return NextResponse.json({ ok: true, imported: count ?? rows.length });
}
