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
    daily_dd_remaining: number;
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
    tp: number;
    grade: SetupGrade;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { account_id, symbol, direction, entry, sl, tp, grade } = body;
  if (!account_id || !symbol || !direction || !entry || !sl || !grade) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // ── Load account state ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account, error: accErr } = await (supabase as any)
    .from("accounts")
    .select("id, current_balance, initial_balance, daily_dd_floor, total_dd_floor, personal_daily_stop_usd")
    .eq("id", account_id)
    .eq("user_id", user.id)
    .single();

  if (accErr || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const balance: number = account.current_balance ?? 0;
  const personalDailyStop: number = account.personal_daily_stop_usd ?? 300;

  // DD floors: fall back to safe defaults if not yet seeded
  const dailyDdFloor: number = account.daily_dd_floor ?? balance * 0.997;
  const totalDdFloor: number = account.total_dd_floor ?? (account.initial_balance ?? balance) * 0.90;

  const dailyDdRemaining = Math.max(0, balance - dailyDdFloor);
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

  // Consecutive losses: walk backward through closed trades
  let consecutiveLosses = 0;
  for (let i = closedToday.length - 1; i >= 0; i--) {
    if ((closedToday[i].net_pnl ?? 0) < 0) consecutiveLosses++;
    else break;
  }

  // ── Calculate trade risk ──────────────────────────────────────────────────
  const { riskUsd } = calcLots(symbol, entry, sl, grade);
  const rr = tp ? calcRR(entry, sl, tp) : 0;

  // Max risk = 0.3% of current balance (dynamic) but also capped by personal stop
  const maxRiskByBalance = Math.round(balance * 0.003 * 100) / 100;
  const maxAllowedRisk = Math.min(personalDailyStop, maxRiskByBalance);

  // ── Run the 5 Risk Guardian checks ───────────────────────────────────────
  const checks: Check[] = [];

  // Check A — Trade risk limit
  if (riskUsd > maxAllowedRisk) {
    checks.push({ id: "A", label: "Riesgo por trade", result: "STOP",
      message: `Riesgo $${riskUsd} supera el máximo $${maxAllowedRisk.toFixed(2)} (0.3% de $${balance.toLocaleString("en-US", { maximumFractionDigits: 0 })})` });
  } else if (riskUsd > maxAllowedRisk * 0.8) {
    checks.push({ id: "A", label: "Riesgo por trade", result: "CAUTION",
      message: `Riesgo $${riskUsd} es ${Math.round(riskUsd / maxAllowedRisk * 100)}% del límite ($${maxAllowedRisk.toFixed(2)})` });
  } else {
    checks.push({ id: "A", label: "Riesgo por trade", result: "PASS",
      message: `$${riskUsd} de $${maxAllowedRisk.toFixed(2)} permitido` });
  }

  // Check B — Daily DD headroom
  const afterDailyRisk = dailyDdRemaining - riskUsd;
  const realizedDailyLoss = Math.abs(Math.min(0, realizedPnlToday));
  const dailyLossIfHit = realizedDailyLoss + riskUsd;

  if (dailyLossIfHit > personalDailyStop) {
    checks.push({ id: "B", label: "Headroom DD diario", result: "STOP",
      message: `Este trade + pérdidas de hoy = $${dailyLossIfHit.toFixed(2)}. Stop diario: $${personalDailyStop}` });
  } else if (afterDailyRisk < 90) {
    checks.push({ id: "B", label: "Headroom DD diario", result: "CAUTION",
      message: `DD diario restante quedaría en $${afterDailyRisk.toFixed(2)} — zona de precaución (<$90)` });
  } else {
    checks.push({ id: "B", label: "Headroom DD diario", result: "PASS",
      message: `$${dailyDdRemaining.toFixed(2)} restante hoy` });
  }

  // Check C — Total DD headroom
  const afterTotalRisk = totalDdRemaining - riskUsd;
  if (afterTotalRisk < 0) {
    checks.push({ id: "C", label: "Headroom DD total", result: "STOP",
      message: `Este trade violaría el floor total de $${totalDdFloor.toLocaleString("en-US", { maximumFractionDigits: 0 })}` });
  } else if (totalDdRemaining < 2000) {
    checks.push({ id: "C", label: "Headroom DD total", result: "CAUTION",
      message: `DD total restante: $${totalDdRemaining.toFixed(2)} — zona crítica (<$2,000)` });
  } else {
    checks.push({ id: "C", label: "Headroom DD total", result: "PASS",
      message: `$${totalDdRemaining.toFixed(2)} restante total` });
  }

  // Check D — R:R ratio
  if (!tp || rr === 0) {
    checks.push({ id: "D", label: "R:R ratio", result: "CAUTION",
      message: "Sin TP definido — no se puede calcular R:R" });
  } else if (rr < 1.5) {
    checks.push({ id: "D", label: "R:R ratio", result: "STOP",
      message: `R:R 1:${rr} está por debajo del mínimo 1:1.5` });
  } else if (rr < 2.0) {
    checks.push({ id: "D", label: "R:R ratio", result: "CAUTION",
      message: `R:R 1:${rr} — óptimo es ≥1:2.0` });
  } else {
    checks.push({ id: "D", label: "R:R ratio", result: "PASS",
      message: `R:R 1:${rr}` });
  }

  // Check E — Simultaneous trades
  if (openTrades.length >= 2) {
    checks.push({ id: "E", label: "Trades simultáneos", result: "STOP",
      message: `Ya hay ${openTrades.length} posiciones abiertas. Máximo: 1` });
  } else if (openTrades.length === 1) {
    checks.push({ id: "E", label: "Trades simultáneos", result: "CAUTION",
      message: "Hay 1 posición abierta — este sería el 2do simultáneo" });
  } else {
    checks.push({ id: "E", label: "Trades simultáneos", result: "PASS",
      message: "Sin posiciones abiertas" });
  }

  // ── Discipline warnings (soft — require explicit user confirmation) ────────
  const disciplineWarnings: DisciplineWarning[] = [];

  // Load active plan limits
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
      message: `Este sería el trade #${tradeCountToday + 1} del día. Tu límite personal es ${maxTradesPerDay}/día.`,
    });
  }

  if (consecutiveLosses >= 2) {
    disciplineWarnings.push({
      type: "CONSECUTIVE_LOSSES",
      message: `Tienes ${consecutiveLosses} pérdidas consecutivas hoy. Tu regla dice cerrar la sesión después de 2 SL seguidos.`,
    });
  }

  const dayOfWeek = new Date().getDay(); // 0=Sun, 5=Fri
  if (dayOfWeek === 5 && grade !== "A+") {
    disciplineWarnings.push({
      type: "FRIDAY_GRADE",
      message: `Es viernes. Tus reglas permiten solo setups A+ los viernes. Este setup es grado ${grade}.`,
    });
  }

  const totalDdUsed = (account.initial_balance ?? 100000) - balance;
  if (totalDdUsed > 5000 && grade === "B") {
    disciplineWarnings.push({
      type: "PROTECTION_MODE",
      message: `Modo protección activo (DD total usado: $${totalDdUsed.toFixed(0)}). Solo A/A+ cuando se ha consumido más de $5,000 de DD.`,
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
      daily_dd_remaining: dailyDdRemaining,
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
