import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calcLots, calcRR, type SetupGrade } from "@/components/trading/RiskCalculator";

type CheckResult = "PASS" | "CAUTION" | "STOP";

interface Check {
  id: string;
  label: string;
  result: CheckResult;
  message: string;
}

interface DisciplineWarning {
  type: string;
  message: string;
}

interface RiskGuardianResponse {
  verdict: "GO" | "CAUTION" | "STOP";
  checks: Check[];
  discipline_warnings: DisciplineWarning[];
  debug: {
    balance: number;
    daily_cap_remaining: number;
    total_dd_remaining: number;
    risk_usd: number;
    rr: number;
    trades_today: number;
    open_trades: number;
    consecutive_losses: number;
  };
}

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
    entry: number;
    sl: number;
    tp?: number;
    grade: SetupGrade;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { account_id, symbol, direction, entry, sl, tp, grade } = body;
  if (!account_id || !symbol || !direction || !sl || !grade) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // ── Load account state ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account, error: accErr } = await (supabase as any)
    .from("accounts")
    .select("id, current_balance, initial_balance, total_dd_floor, personal_daily_stop_usd")
    .eq("id", account_id)
    .eq("user_id", user.id)
    .single();

  if (accErr || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const balance: number = account.current_balance ?? 0;
  const personalDailyStop: number = account.personal_daily_stop_usd ?? 300;
  const totalDdFloor: number = account.total_dd_floor ?? (account.initial_balance ?? balance) * 0.90;
  const totalDdRemaining = Math.max(0, balance - totalDdFloor);

  // ── Load today's trades ───────────────────────────────────────────────────
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: todayTrades } = await (supabase as any)
    .from("trades")
    .select("net_pnl, close_time, status, open_time")
    .eq("account_id", account_id)
    .gte("open_time", todayStart.toISOString())
    .order("open_time", { ascending: true });

  const trades: Array<{ net_pnl: number | null; close_time: string | null; status: string; open_time: string }> = todayTrades ?? [];

  const closedToday = trades.filter(t => t.status === "closed" || t.close_time !== null);
  const openTrades = trades.filter(t => t.status === "open" || (t.status === "pending" && !t.close_time));
  const tradeCountToday = trades.length;

  const realizedPnlToday = closedToday.reduce((sum, t) => sum + (t.net_pnl ?? 0), 0);
  const realizedLossToday = Math.abs(Math.min(0, realizedPnlToday));

  // How much of the personal daily cap is left
  const dailyCapRemaining = Math.max(0, personalDailyStop - realizedLossToday);

  // Consecutive losses: walk backward through closed trades
  let consecutiveLosses = 0;
  for (let i = closedToday.length - 1; i >= 0; i--) {
    if ((closedToday[i].net_pnl ?? 0) < 0) consecutiveLosses++;
    else break;
  }

  // ── Calculate trade risk ──────────────────────────────────────────────────
  const { riskUsd } = calcLots(symbol, entry || sl, sl, grade);

  // Max risk per trade = personal daily stop (e.g. $300 for TTP)
  const maxAllowedRisk = personalDailyStop;

  // Detect real entry price (MARKET orders send entry=sl as fallback)
  const hasRealEntry = entry > 0 && Math.abs(entry - sl) > 0.000001;
  const hasTp = tp != null && tp > 0 && Math.abs(tp - sl) > 0.000001;
  const rr = (hasRealEntry && hasTp) ? calcRR(entry, sl, tp!) : 0;

  // ── Run Risk Guardian checks ──────────────────────────────────────────────
  const checks: Check[] = [];

  // Check A — Trade risk
  if (riskUsd > maxAllowedRisk) {
    checks.push({ id: "A", label: "Trade risk", result: "STOP",
      message: `$${riskUsd} exceeds your max of $${maxAllowedRisk} per trade` });
  } else if (riskUsd > maxAllowedRisk * 0.8) {
    checks.push({ id: "A", label: "Trade risk", result: "CAUTION",
      message: `$${riskUsd} is ${Math.round(riskUsd / maxAllowedRisk * 100)}% of your $${maxAllowedRisk} limit` });
  } else {
    checks.push({ id: "A", label: "Trade risk", result: "PASS",
      message: `$${riskUsd} of $${maxAllowedRisk} allowed` });
  }

  // Check B — Daily stop cap (personal)
  const dailyLossIfHit = realizedLossToday + riskUsd;
  if (dailyLossIfHit > personalDailyStop) {
    checks.push({ id: "B", label: "Daily stop", result: "STOP",
      message: `Loss today ($${realizedLossToday.toFixed(0)}) + this trade ($${riskUsd}) = $${dailyLossIfHit.toFixed(0)} — cap is $${personalDailyStop}` });
  } else if (dailyCapRemaining - riskUsd < personalDailyStop * 0.2) {
    checks.push({ id: "B", label: "Daily stop", result: "CAUTION",
      message: `$${(dailyCapRemaining - riskUsd).toFixed(0)} left of daily cap after this trade (<20% buffer)` });
  } else {
    checks.push({ id: "B", label: "Daily stop", result: "PASS",
      message: `$${dailyCapRemaining.toFixed(0)} of $${personalDailyStop} daily cap remaining` });
  }

  // Check C — Firm account total DD floor
  const afterTotalRisk = totalDdRemaining - riskUsd;
  if (afterTotalRisk < 0) {
    checks.push({ id: "C", label: "Firm DD limit", result: "STOP",
      message: `This trade would breach the firm's floor ($${totalDdFloor.toLocaleString("en-US", { maximumFractionDigits: 0 })})` });
  } else if (totalDdRemaining < 2000) {
    checks.push({ id: "C", label: "Firm DD limit", result: "CAUTION",
      message: `$${totalDdRemaining.toFixed(0)} left on firm account — critical zone (<$2,000)` });
  } else {
    checks.push({ id: "C", label: "Firm DD limit", result: "PASS",
      message: `$${totalDdRemaining.toFixed(0)} buffer above firm's floor ($${totalDdFloor.toLocaleString("en-US", { maximumFractionDigits: 0 })})` });
  }

  // Check D — R:R ratio
  if (!hasRealEntry) {
    checks.push({ id: "D", label: "R:R ratio", result: "CAUTION",
      message: "Enter approx. entry price to calculate R:R" });
  } else if (!hasTp) {
    checks.push({ id: "D", label: "R:R ratio", result: "CAUTION",
      message: "No TP set — R:R not calculated" });
  } else if (rr < 1.5) {
    checks.push({ id: "D", label: "R:R ratio", result: "STOP",
      message: `R:R 1:${rr} is below minimum 1:1.5` });
  } else if (rr < 2.0) {
    checks.push({ id: "D", label: "R:R ratio", result: "CAUTION",
      message: `R:R 1:${rr} — optimal is ≥1:2.0` });
  } else {
    checks.push({ id: "D", label: "R:R ratio", result: "PASS",
      message: `R:R 1:${rr}` });
  }

  // ── Discipline warnings ───────────────────────────────────────────────────
  const disciplineWarnings: DisciplineWarning[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: plan } = await (supabase as any)
    .from("plans")
    .select("max_trades_per_day")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  const maxTradesPerDay: number = plan?.max_trades_per_day ?? 3;

  if (tradeCountToday >= maxTradesPerDay) {
    disciplineWarnings.push({
      type: "MAX_TRADES",
      message: `This would be trade #${tradeCountToday + 1} today. Your personal limit is ${maxTradesPerDay}/day.`,
    });
  }

  if (consecutiveLosses >= 2) {
    disciplineWarnings.push({
      type: "CONSECUTIVE_LOSSES",
      message: `${consecutiveLosses} consecutive losses today. Your rule says close the session after 2 stop losses in a row.`,
    });
  }

  const dayOfWeek = new Date().getDay();
  if (dayOfWeek === 5 && grade !== "A+") {
    disciplineWarnings.push({
      type: "FRIDAY_GRADE",
      message: `It's Friday — your rules allow only A+ setups. This setup is grade ${grade}.`,
    });
  }

  const totalDdUsed = (account.initial_balance ?? 100000) - balance;
  if (totalDdUsed > 5000 && grade === "B") {
    disciplineWarnings.push({
      type: "PROTECTION_MODE",
      message: `Protection mode: only A/A+ setups when more than $5,000 of total DD is consumed ($${totalDdUsed.toFixed(0)} used).`,
    });
  }

  // ── Verdict ───────────────────────────────────────────────────────────────
  const hasStop = checks.some(c => c.result === "STOP");
  const hasCaution = checks.some(c => c.result === "CAUTION");

  const verdict: "GO" | "CAUTION" | "STOP" = hasStop
    ? "STOP"
    : hasCaution
    ? "CAUTION"
    : "GO";

  const response: RiskGuardianResponse = {
    verdict,
    checks,
    discipline_warnings: disciplineWarnings,
    debug: {
      balance,
      daily_cap_remaining: dailyCapRemaining,
      total_dd_remaining: totalDdRemaining,
      risk_usd: riskUsd,
      rr,
      trades_today: tradeCountToday,
      open_trades: openTrades.length,
      consecutive_losses: consecutiveLosses,
    },
  };

  return NextResponse.json(response);
}
