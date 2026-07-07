import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calcLots, calcRR, type SetupGrade } from "@/components/trading/RiskCalculator";

// POST /api/trades — register a trade as 'pending' after Risk Guardian approval.
// Called from the OrderForm after the user confirms they will execute in MT5.
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    account_id: string;
    symbol: string;
    direction: "LONG" | "SHORT";
    order_type: "MARKET" | "LIMIT" | "STOP";
    entry: number;
    sl: number;
    tp?: number;
    grade: SetupGrade;
    confirmed_warnings?: string[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { account_id, symbol, direction, entry, sl, tp, grade } = body;

  // Verify this account belongs to the user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account, error: accErr } = await (supabase as any)
    .from("accounts")
    .select("id, current_balance")
    .eq("id", account_id)
    .eq("user_id", user.id)
    .single();

  if (accErr || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const { lots, riskUsd } = calcLots(symbol, entry, sl, grade);
  const rr = tp ? calcRR(entry, sl, tp) : 0;
  const riskPercent = account.current_balance
    ? Math.round((riskUsd / account.current_balance) * 10000) / 100
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: trade, error: insertErr } = await (supabase as any)
    .from("trades")
    .insert({
      account_id,
      user_id: user.id,
      instrument: symbol,
      direction,
      lot_size: lots,
      entry_price: entry,
      sl: sl || null,
      tp: tp || null,
      open_time: new Date().toISOString(),
      status: "pending",
      source: "MANUAL",
      risk_r: rr > 0 ? rr : null,
      risk_percent: riskPercent,
      notes: `Grade: ${grade} | Pre-validado por Risk Guardian`,
    })
    .select("id, instrument, direction, lot_size, entry_price, sl, tp, status")
    .single();

  if (insertErr) {
    console.error("[trades] insert error:", insertErr.message);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Log discipline violations if any confirmed_warnings exist
  if (body.confirmed_warnings && body.confirmed_warnings.length > 0) {
    const violationMap: Record<string, string> = {
      MAX_TRADES: "MAX_TRADES",
      CONSECUTIVE_LOSSES: "DAILY_LOSS",
      FRIDAY_GRADE: "OUTSIDE_WINDOW",
      PROTECTION_MODE: "MAX_TRADES",
    };

    const violations = body.confirmed_warnings
      .map(type => violationMap[type])
      .filter(Boolean)
      .map(type => ({
        trade_id: trade.id,
        user_id: user.id,
        account_id,
        violation_type: type,
        date: new Date().toISOString().split("T")[0],
        description: `Auto-logged: user confirmed ${type} override`,
      }));

    if (violations.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("discipline_violations").insert(violations);
    }
  }

  return NextResponse.json({ ok: true, trade });
}
