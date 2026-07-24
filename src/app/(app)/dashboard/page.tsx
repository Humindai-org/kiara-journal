"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, TrendingDown, Target, Shield, Activity, Percent, Award, AlertTriangle, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import TopBar from "@/components/layout/TopBar";
import { createClient } from "@/lib/supabase/client";
import { useAccountStore } from "@/store/account";
import PnlCalendar from "@/components/dashboard/PnlCalendar";

type Trade = {
  id: string;
  instrument: string;
  direction: "LONG" | "SHORT";
  net_pnl: number | null;
  return_r: number | null;
  open_time: string;
  close_time: string | null;
  session: string | null;
  followed_plan: boolean | null;
  notes: string | null;
};

type DisciplineGroup = {
  name: string;
  total: number;
  rate: number;
  violations: Trade[];
};

function buildDisciplineGroups(
  trades: Trade[],
  keyFn: (t: Trade) => string,
): DisciplineGroup[] {
  const map: Record<string, { total: number; violations: Trade[] }> = {};
  for (const t of trades) {
    if (t.followed_plan === null) continue;
    const k = keyFn(t);
    if (!map[k]) map[k] = { total: 0, violations: [] };
    map[k].total++;
    if (!t.followed_plan) map[k].violations.push(t);
  }
  return Object.entries(map)
    .map(([name, v]) => ({
      name,
      total: v.total,
      violations: v.violations,
      rate: ((v.total - v.violations.length) / v.total) * 100,
    }))
    .filter(g => g.total >= 2)
    .sort((a, b) => a.rate - b.rate);
}

function DisciplineRow({ group, onClick }: { group: DisciplineGroup; onClick: () => void }) {
  const color = group.rate >= 80 ? "bg-profit" : group.rate >= 60 ? "bg-warning" : "bg-loss";
  const textColor = group.rate >= 80 ? "text-profit" : group.rate >= 60 ? "text-warning" : "text-loss";
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 hover:bg-surface-hi rounded-lg px-2 py-1.5 transition-colors group"
    >
      <span className="text-[11px] font-mono text-text-secondary w-20 text-left shrink-0 truncate">
        {group.name}
      </span>
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${group.rate}%` }} />
      </div>
      <span className={cn("text-[11px] font-mono w-10 text-right shrink-0", textColor)}>
        {group.rate.toFixed(0)}%
      </span>
      {group.violations.length > 0 ? (
        <span className="text-[10px] text-loss bg-loss/10 rounded px-1.5 py-0.5 shrink-0 w-8 text-center">
          {group.violations.length}✗
        </span>
      ) : (
        <span className="w-8 shrink-0" />
      )}
    </button>
  );
}

type TradeListDetail = { title: string; subtitle: string; trades: Trade[] };

function TradeListModal({ detail, onClose }: { detail: TradeListDetail; onClose: () => void }) {
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "2-digit" });
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg mx-4 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{detail.title}</h3>
            <p className="text-[11px] text-text-disabled mt-0.5">{detail.subtitle}</p>
          </div>
          <button onClick={onClose} className="text-text-disabled hover:text-text-secondary mt-0.5">
            <X className="size-4" />
          </button>
        </div>

        {detail.trades.length === 0 ? (
          <p className="text-sm text-text-disabled text-center py-6">No trades to show</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {detail.trades.map((t) => (
              <div key={t.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-surface-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-text-disabled font-mono">{fmtDate(t.open_time)}</span>
                    <span className={cn(
                      "text-[10px] font-semibold",
                      t.direction === "LONG" ? "text-profit" : "text-loss"
                    )}>
                      {t.direction}
                    </span>
                    <span className="text-[10px] text-text-secondary font-mono">{t.instrument}</span>
                    {t.session && (
                      <span className="text-[10px] text-text-disabled">
                        {t.session.replace("_", " ")}
                      </span>
                    )}
                  </div>
                  {t.notes && (
                    <p className="text-[11px] text-text-secondary mt-1 leading-tight">{t.notes}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className={cn(
                    "text-xs font-mono font-medium",
                    (t.net_pnl ?? 0) >= 0 ? "text-profit" : "text-loss"
                  )}>
                    {(t.net_pnl ?? 0) >= 0 ? "+" : ""}${(t.net_pnl ?? 0).toFixed(2)}
                  </span>
                  {t.return_r != null && (
                    <p className="text-[10px] text-text-disabled font-mono">
                      {t.return_r >= 0 ? "+" : ""}{t.return_r.toFixed(2)}R
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function fmtUsd(n: number, sign = false) {
  const s = sign && n > 0 ? "+" : "";
  return `${s}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function KpiCard({ label, value, sub, color, icon: Icon, onClick }: {
  label: string; value: string; sub?: string; color?: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-text-secondary">{label}</p>
        <Icon className="size-4 text-text-disabled" />
      </div>
      <p className={cn("text-2xl font-mono font-semibold", color ?? "text-text-primary")}>{value}</p>
      {sub && <p className="text-[11px] text-text-disabled mt-1">{sub}</p>}
    </>
  );
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="card-light p-4 text-left hover:bg-surface-hi transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        {inner}
      </button>
    );
  }
  return <div className="card-light p-4">{inner}</div>;
}

// ─── Objective rule adherence ─────────────────────────────────
// Derived straight from the trades + the active plan — no manual tagging
// needed, so it means something even before the user marks "followed plan".
type PlanRules = {
  max_trades_per_day: number | null;
  trading_window_start: string | null;
  trading_window_end: string | null;
};
type RuleRow = { id: string; name: string; rate: number };

function computeRuleAdherence(
  closed: Trade[],
  plan: PlanRules | null,
  dailyStop: number | null,
): { rules: RuleRow[]; overall: number | null } {
  if (closed.length === 0) return { rules: [], overall: null };

  // Bucket trades by their local calendar day.
  const byDay = new Map<string, Trade[]>();
  for (const t of closed) {
    const d = new Date(t.open_time);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const arr = byDay.get(key) ?? [];
    arr.push(t);
    byDay.set(key, arr);
  }
  const days = [...byDay.values()];
  const rules: RuleRow[] = [];

  if (plan?.max_trades_per_day && plan.max_trades_per_day > 0) {
    const ok = days.filter(d => d.length <= plan.max_trades_per_day!).length;
    rules.push({ id: "MAX_TRADES", name: "Max trades/day", rate: (ok / days.length) * 100 });
  }

  if (dailyStop && dailyStop > 0) {
    const ok = days.filter(d => {
      const dayPnl = d.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
      return Math.abs(Math.min(0, dayPnl)) <= dailyStop;
    }).length;
    rules.push({ id: "DAILY_STOP", name: "Daily stop", rate: (ok / days.length) * 100 });
  }

  // Trading window — compared in the browser's local time. The window is stored
  // without a timezone, so this is an approximation until the wizard captures one.
  if (plan?.trading_window_start && plan?.trading_window_end) {
    const [sh, sm] = plan.trading_window_start.split(":").map(Number);
    const [eh, em] = plan.trading_window_end.split(":").map(Number);
    const startMin = sh * 60 + (sm || 0);
    const endMin = eh * 60 + (em || 0);
    if (Number.isFinite(startMin) && Number.isFinite(endMin) && endMin > startMin) {
      let ok = 0;
      for (const t of closed) {
        const d = new Date(t.open_time);
        const min = d.getHours() * 60 + d.getMinutes();
        if (min >= startMin && min <= endMin) ok++;
      }
      rules.push({ id: "WINDOW", name: "Trading window", rate: (ok / closed.length) * 100 });
    }
  }

  const overall = rules.length > 0
    ? rules.reduce((s, r) => s + r.rate, 0) / rules.length
    : null;
  return { rules, overall };
}

// ─── SVG Equity Curve ─────────────────────────────────────────
// Everything here is relative to `startBalance` — the balance the account had
// when the visible period began. That keeps the curve readable whether the
// account holds $400 or $100,000.
function EquityCurve({ data, startBalance }: { data: { balance: number; date: string }[]; startBalance: number }) {
  const W = 800, H = 240, padL = 8, padR = 8, padT = 12, padB = 22;
  const points = [{ balance: startBalance, date: "Start" }, ...data];
  const balances = points.map(p => p.balance);

  // Scale to the data's own range, with 8% headroom so the line never touches
  // the edges. Guard the flat case (one trade, or a period with no movement).
  const rawMin = Math.min(...balances);
  const rawMax = Math.max(...balances);
  const spread = rawMax - rawMin;
  const pad = spread > 0 ? spread * 0.08 : Math.max(Math.abs(startBalance) * 0.01, 1);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min || 1;

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const x = (i: number) => padL + (i / (points.length - 1 || 1)) * innerW;
  const y = (v: number) => padT + (1 - (v - min) / range) * innerH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.balance).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${(H - padB).toFixed(1)} L ${padL} ${(H - padB).toFixed(1)} Z`;
  const baselineY = y(startBalance);
  const lastBalance = points[points.length - 1].balance;
  const lineColor = lastBalance >= startBalance ? "#34d399" : "#f87171";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 240 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity={0.28} />
          <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* baseline — where this period started */}
      <line x1={padL} y1={baselineY} x2={W - padR} y2={baselineY} stroke="#6b6688" strokeWidth={1} strokeDasharray="4 4" />
      <path d={areaPath} fill="url(#eqGrad)" />
      <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" />
      {/* last point dot */}
      <circle cx={x(points.length - 1)} cy={y(lastBalance)} r={3.5} fill={lineColor} />
    </svg>
  );
}

// ─── SVG Discipline Gauge ─────────────────────────────────────
function DisciplineGauge({ rate, label }: { rate: number; label: string }) {
  const color = rate >= 80 ? "#34d399" : rate >= 60 ? "#fbbf24" : "#f87171";
  const circ = 2 * Math.PI * 42;
  return (
    <div className="relative size-28 flex items-center justify-center">
      <svg className="size-28 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" fill="none" stroke="#463f6b" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${(rate / 100) * circ} ${circ}`}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-mono font-bold text-text-primary">{rate.toFixed(0)}%</span>
        <span className="text-[10px] text-text-disabled">{label}</span>
      </div>
    </div>
  );
}

function RuleBar({ name, rate }: { name: string; rate: number }) {
  const bar = rate >= 80 ? "bg-profit" : rate >= 60 ? "bg-warning" : "bg-loss";
  const txt = rate >= 80 ? "text-profit" : rate >= 60 ? "text-warning" : "text-loss";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-text-secondary w-24 shrink-0 truncate">{name}</span>
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${rate}%` }} />
      </div>
      <span className={cn("text-[11px] font-mono w-9 text-right shrink-0", txt)}>{rate.toFixed(0)}%</span>
    </div>
  );
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeAccountId, accounts } = useAccountStore();
  const account = accounts.find(a => a.id === activeAccountId) ?? null;
  const initialBalance = account?.initial_balance ?? 0;

  // Risk fields live on the row but not yet in the generated Supabase types.
  // `profit_target` arrives with migration 0012 — until then the target card
  // simply hides rather than showing someone else's objective.
  const risk = account as unknown as {
    total_dd_floor?: number | null;
    profit_target?: number | null;
  } | null;
  const ddFloor = risk?.total_dd_floor ?? null;
  const ddLimit = ddFloor != null ? Math.max(0, initialBalance - ddFloor) : null;
  const profitTarget = risk?.profit_target ?? null;
  const personalDailyStop = (account as unknown as { personal_daily_stop_usd?: number | null } | null)
    ?.personal_daily_stop_usd ?? null;

  const [trades, setTrades] = useState<Trade[]>([]);
  const [plan, setPlan] = useState<PlanRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [equityPeriod, setEquityPeriod] = useState<"1W" | "1M" | "3M" | "all">("all");
  const [detail, setDetail] = useState<TradeListDetail | null>(null);

  useEffect(() => {
    if (!activeAccountId) { setLoading(false); return; }
    setLoading(true);
    supabase
      .from("trades")
      .select("id, instrument, direction, net_pnl, return_r, open_time, close_time, session, followed_plan, notes")
      .eq("account_id", activeAccountId)
      .not("net_pnl", "is", null)
      .order("open_time", { ascending: true })
      .then(({ data: rows }) => {
        setTrades((rows as unknown as Trade[]) ?? []);
        setLoading(false);
      });
  }, [supabase, activeAccountId]);

  // Active plan drives the objective discipline checks (rules the trader set for
  // themselves). Scoped by user; the plan isn't per-account today.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      supabase
        .from("plans")
        .select("max_trades_per_day, trading_window_start, trading_window_end")
        .eq("user_id", data.user.id)
        .eq("is_active", true)
        .maybeSingle()
        .then(({ data: p }) => setPlan((p as unknown as PlanRules) ?? null));
    });
  }, [supabase, activeAccountId]);

  const stats = useMemo(() => {
    const closed = trades.filter(t => t.net_pnl != null);
    const totalPnl = closed.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
    const wins = closed.filter(t => (t.net_pnl ?? 0) > 0);
    const losses = closed.filter(t => (t.net_pnl ?? 0) < 0);
    const grossWin = wins.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.net_pnl ?? 0), 0));
    const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    const avgWin = wins.length > 0 ? grossWin / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const rValues = closed.filter(t => t.return_r != null).map(t => t.return_r!);
    const avgR = rValues.length > 0 ? rValues.reduce((s, r) => s + r, 0) / rValues.length : 0;
    const expectancy = closed.length > 0 ? totalPnl / closed.length : 0;

    let running = initialBalance, peak = initialBalance, maxDD = 0;
    const equity = closed.map((t) => {
      running += t.net_pnl ?? 0;
      if (running > peak) peak = running;
      const dd = peak - running;
      if (dd > maxDD) maxDD = dd;
      return {
        balance: running,
        date: new Date(t.open_time).toLocaleDateString("en-US", { day: "2-digit", month: "short" }),
        isoDate: t.open_time,
      };
    });

    const streak = (() => {
      if (closed.length === 0) return { count: 0, type: "none" as const };
      const type = (closed[closed.length - 1].net_pnl ?? 0) >= 0 ? "win" as const : "loss" as const;
      let count = 0;
      for (let i = closed.length - 1; i >= 0; i--) {
        const isWin = (closed[i].net_pnl ?? 0) >= 0;
        if ((type === "win") === isWin) count++;
        else break;
      }
      return { count, type };
    })();

    const evaluated = closed.filter(t => t.followed_plan != null);
    const followedCount = evaluated.filter(t => t.followed_plan === true).length;
    const disciplineRate = evaluated.length > 0 ? (followedCount / evaluated.length) * 100 : 0;

    const sessionMap: Record<string, { count: number; pnl: number }> = {};
    for (const t of closed) {
      const s = t.session ?? "—";
      if (!sessionMap[s]) sessionMap[s] = { count: 0, pnl: 0 };
      sessionMap[s].count++;
      sessionMap[s].pnl += t.net_pnl ?? 0;
    }
    const sessionData = Object.entries(sessionMap).map(([name, v]) => ({
      name: name.replace("_", " "), pnl: parseFloat(v.pnl.toFixed(2)), count: v.count,
    })).sort((a, b) => b.pnl - a.pnl);

    const instrMap: Record<string, number> = {};
    for (const t of closed) instrMap[t.instrument] = (instrMap[t.instrument] ?? 0) + (t.net_pnl ?? 0);
    const instrData = Object.entries(instrMap)
      .map(([name, pnl]) => ({ name, pnl: parseFloat(pnl.toFixed(2)) }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));

    const balance = initialBalance + totalPnl;
    const progressToTarget = profitTarget && profitTarget > 0
      ? Math.max(0, Math.min(100, (totalPnl / profitTarget) * 100))
      : null;

    const instrGroups = buildDisciplineGroups(closed, t => t.instrument);
    const sessionGroups = buildDisciplineGroups(closed, t => t.session?.replace("_", " ") ?? "—");

    // Biggest wins first, biggest losses first — for the drill-down popups.
    const winsSorted = [...wins].sort((a, b) => (b.net_pnl ?? 0) - (a.net_pnl ?? 0));
    const lossesSorted = [...losses].sort((a, b) => (a.net_pnl ?? 0) - (b.net_pnl ?? 0));

    const ruleAdherence = computeRuleAdherence(closed, plan, personalDailyStop);

    return {
      totalPnl, winRate, profitFactor, avgWin, avgLoss, avgR, expectancy,
      tradeCount: closed.length, winCount: wins.length, lossCount: losses.length,
      equity, maxDD, balance, disciplineRate, evaluatedCount: evaluated.length,
      followedCount, sessionData, instrData, progressToTarget, streak,
      instrGroups, sessionGroups, winsSorted, lossesSorted, ruleAdherence,
    };
  }, [trades, initialBalance, profitTarget, plan, personalDailyStop]);

  const { equityForDisplay, equityStartBalance } = useMemo(() => {
    if (equityPeriod === "all" || stats.equity.length === 0) {
      return { equityForDisplay: stats.equity, equityStartBalance: initialBalance };
    }
    const cutoff = new Date();
    if (equityPeriod === "1W") cutoff.setDate(cutoff.getDate() - 7);
    else if (equityPeriod === "1M") cutoff.setMonth(cutoff.getMonth() - 1);
    else if (equityPeriod === "3M") cutoff.setMonth(cutoff.getMonth() - 3);
    const filtered = stats.equity.filter(p => new Date(p.isoDate) >= cutoff);
    const before = stats.equity.filter(p => new Date(p.isoDate) < cutoff);
    const startBal = before.length > 0 ? before[before.length - 1].balance : initialBalance;
    return { equityForDisplay: filtered, equityStartBalance: startBal };
  }, [stats.equity, equityPeriod, initialBalance]);

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Dashboard" />
        <div className="flex-1 flex items-center justify-center text-text-disabled text-sm">Loading…</div>
      </div>
    );
  }

  const hasData = stats.tradeCount > 0;
  const periodEndBalance = equityForDisplay.length > 0
    ? equityForDisplay[equityForDisplay.length - 1].balance
    : equityStartBalance;
  const periodDelta = periodEndBalance - equityStartBalance;
  const maxSessionAbs = Math.max(...stats.sessionData.map(d => Math.abs(d.pnl)), 1);
  const maxInstrAbs = Math.max(...stats.instrData.map(d => Math.abs(d.pnl)), 1);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Dashboard" />
      <main className="flex-1 overflow-y-auto p-6 space-y-4">

        {/* ── KPI row ───────────────────────────────────── */}
        <div className="grid grid-cols-7 gap-4">
          <KpiCard label="Balance" value={`$${fmtUsd(stats.balance)}`} sub={account?.name ?? "—"} icon={Activity} />
          <KpiCard
            label="P&L total" value={`$${fmtUsd(stats.totalPnl, true)}`}
            sub={`${stats.tradeCount} closed trades`}
            color={stats.totalPnl >= 0 ? "text-profit" : "text-loss"}
            icon={stats.totalPnl >= 0 ? TrendingUp : TrendingDown}
          />
          <KpiCard
            label="Win rate" value={hasData ? `${stats.winRate.toFixed(0)}%` : "—"}
            sub={hasData ? `${stats.winCount}W · ${stats.lossCount}L` : "No trades"}
            color={stats.winRate >= 50 ? "text-profit" : stats.winRate > 0 ? "text-warning" : "text-text-secondary"}
            icon={Percent}
          />
          <KpiCard
            label="Profit factor"
            value={hasData ? (stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)) : "—"}
            sub={hasData ? "gain / loss" : "No trades"}
            color={stats.profitFactor >= 1.5 ? "text-profit" : stats.profitFactor >= 1 ? "text-warning" : stats.profitFactor > 0 ? "text-loss" : "text-text-secondary"}
            icon={Award}
          />
          <KpiCard
            label="Avg R" value={hasData ? `${stats.avgR >= 0 ? "+" : ""}${stats.avgR.toFixed(2)}R` : "—"}
            sub={hasData ? `Expectancy $${fmtUsd(stats.expectancy, true)}` : "No trades"}
            color={stats.avgR >= 0 ? "text-profit" : "text-loss"}
            icon={Target}
          />
          <KpiCard
            label="Avg winner" value={hasData && stats.avgWin > 0 ? `$${fmtUsd(stats.avgWin)}` : "—"}
            sub={hasData ? `${stats.winCount} wins${stats.winCount > 0 ? " · view" : ""}` : "No trades"}
            color="text-profit"
            icon={TrendingUp}
            onClick={stats.winCount > 0 ? () => setDetail({
              title: "Winning trades",
              subtitle: `${stats.winCount} winner${stats.winCount !== 1 ? "s" : ""} · avg $${fmtUsd(stats.avgWin)}`,
              trades: stats.winsSorted,
            }) : undefined}
          />
          <KpiCard
            label="Avg loser" value={hasData && stats.avgLoss > 0 ? `-$${fmtUsd(stats.avgLoss)}` : "—"}
            sub={hasData ? `${stats.lossCount} losses${stats.lossCount > 0 ? " · view" : ""}` : "No trades"}
            color="text-loss"
            icon={TrendingDown}
            onClick={stats.lossCount > 0 ? () => setDetail({
              title: "Losing trades",
              subtitle: `${stats.lossCount} loser${stats.lossCount !== 1 ? "s" : ""} · avg -$${fmtUsd(stats.avgLoss)}`,
              trades: stats.lossesSorted,
            }) : undefined}
          />
        </div>

        {/* ── Objective progress ────────────────────────── */}
        {(profitTarget != null || ddLimit != null) && (
          <div className="card-light p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="size-4 text-accent" />
                <p className="text-sm font-medium text-text-primary">Objective progress</p>
              </div>
              {profitTarget != null && (
                <span className="text-xs text-text-secondary">
                  ${fmtUsd(Math.max(0, stats.totalPnl))} / ${fmtUsd(profitTarget)} target
                </span>
              )}
            </div>
            {stats.progressToTarget != null && (
              <div className="h-2.5 bg-surface-hi rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all duration-700" style={{ width: `${stats.progressToTarget}%` }} />
              </div>
            )}
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-text-disabled">
                {stats.progressToTarget != null
                  ? `${stats.progressToTarget.toFixed(1)}% of target`
                  : "No profit target set for this account"}
              </span>
              {ddLimit != null && (
                <span className={cn("text-[11px]", stats.maxDD > ddLimit * 0.7 ? "text-loss" : "text-text-disabled")}>
                  Max DD: ${fmtUsd(stats.maxDD)} / ${fmtUsd(ddLimit)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Equity curve + discipline ─────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 card p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-text-primary">Equity curve</p>
                {hasData && equityForDisplay.length > 0 && (
                  <p className="text-[11px] text-text-disabled font-mono mt-0.5">
                    Start ${fmtUsd(equityStartBalance)}
                    <span className={cn(
                      "ml-2",
                      periodDelta >= 0 ? "text-profit" : "text-loss"
                    )}>
                      {periodDelta >= 0 ? "+" : "-"}${fmtUsd(Math.abs(periodDelta))}
                      {equityStartBalance > 0 && (
                        <> · {periodDelta >= 0 ? "+" : ""}{((periodDelta / equityStartBalance) * 100).toFixed(2)}%</>
                      )}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {hasData && equityForDisplay.length > 0 && (
                  <span className="text-xs font-mono text-text-secondary">
                    {equityForDisplay[0]?.date} → {equityForDisplay[equityForDisplay.length - 1]?.date}
                  </span>
                )}
                <div className="flex items-center gap-0.5">
                  {(["1W", "1M", "3M", "all"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setEquityPeriod(p)}
                      className={cn(
                        "px-2 py-0.5 text-[10px] rounded transition-colors",
                        equityPeriod === p
                          ? "bg-accent/20 text-accent"
                          : "text-text-secondary hover:text-text-primary"
                      )}
                    >
                      {p === "all" ? "All" : p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {hasData && equityForDisplay.length > 0 ? (
              <EquityCurve data={equityForDisplay} startBalance={equityStartBalance} />
            ) : hasData ? (
              <div className="h-[240px] flex items-center justify-center text-text-disabled text-sm">No trades in this period</div>
            ) : (
              <div className="h-[240px] flex items-center justify-center text-text-disabled text-sm">No trade data yet</div>
            )}
          </div>

          {/* Discipline */}
          <div className="card-light p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-accent" />
              <p className="text-sm font-medium text-text-primary">Discipline</p>
            </div>
            {hasData ? (
              <>
                {/* Objective: rules respected — always computable from the data */}
                {stats.ruleAdherence.overall != null ? (
                  <>
                    <div className="flex flex-col items-center py-1">
                      <DisciplineGauge rate={stats.ruleAdherence.overall} label="rules respected" />
                    </div>
                    <div className="space-y-1.5">
                      {stats.ruleAdherence.rules.map((r) => (
                        <RuleBar key={r.id} name={r.name} rate={r.rate} />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-text-disabled bg-surface-2/60 rounded-lg p-3 text-center">
                    Set up a trading plan (max trades/day, hours, daily stop) to track
                    how well you respect your own rules.
                  </div>
                )}

                <div className="h-px bg-border" />

                {/* Subjective: your own "did I follow the plan?" tag */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-secondary">Plan adherence</span>
                    {stats.evaluatedCount > 0 ? (
                      <span className={cn(
                        "font-mono",
                        stats.disciplineRate >= 80 ? "text-profit"
                          : stats.disciplineRate >= 60 ? "text-warning" : "text-loss"
                      )}>
                        {stats.disciplineRate.toFixed(0)}% · {stats.followedCount}/{stats.evaluatedCount}
                      </span>
                    ) : (
                      <span className="font-mono text-text-disabled">not evaluated</span>
                    )}
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-text-secondary">Current streak</span>
                    <span className={cn(
                      "font-mono",
                      stats.streak.count === 0 ? "text-text-disabled"
                        : stats.streak.type === "win" ? "text-profit" : "text-loss"
                    )}>
                      {stats.streak.count > 0
                        ? `${stats.streak.count} ${stats.streak.type === "win" ? "W" : "L"}`
                        : "—"}
                    </span>
                  </div>
                </div>

                {stats.evaluatedCount === 0 && (
                  <div className="flex items-start gap-1.5 text-[11px] text-text-disabled bg-surface-2/60 rounded-lg p-2">
                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                    <span>Mark whether you followed your plan on each trade in the journal to track plan adherence.</span>
                  </div>
                )}
              </>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-text-disabled text-xs text-center">
                Register trades to see your discipline
              </div>
            )}
          </div>
        </div>

        {/* ── Session + instrument breakdown ────────────── */}
        {hasData && (
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4">
              <p className="text-sm font-medium text-text-primary mb-4">P&L by session</p>
              <div className="space-y-3">
                {stats.sessionData.map(d => (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-text-secondary w-20 shrink-0">{d.name}</span>
                    <div className="flex-1 h-6 bg-surface-2 rounded-md overflow-hidden relative flex items-center">
                      <div
                        className={cn("h-full rounded-md", d.pnl >= 0 ? "bg-profit/60" : "bg-loss/60")}
                        style={{ width: `${(Math.abs(d.pnl) / maxSessionAbs) * 100}%` }}
                      />
                      <span className="absolute right-2 text-[10px] text-text-disabled">{d.count} trades</span>
                    </div>
                    <span className={cn("text-xs font-mono w-20 text-right shrink-0", d.pnl >= 0 ? "text-profit" : "text-loss")}>
                      ${fmtUsd(d.pnl, true)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-4">
              <p className="text-sm font-medium text-text-primary mb-4">P&L by instrument</p>
              <div className="space-y-3">
                {stats.instrData.slice(0, 6).map(d => (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-text-secondary w-16 shrink-0">{d.name}</span>
                    <div className="flex-1 h-6 bg-surface-2 rounded-md overflow-hidden relative">
                      <div
                        className={cn("h-full rounded-md", d.pnl >= 0 ? "bg-profit/60" : "bg-loss/60")}
                        style={{ width: `${(Math.abs(d.pnl) / maxInstrAbs) * 100}%` }}
                      />
                    </div>
                    <span className={cn("text-xs font-mono w-20 text-right shrink-0", d.pnl >= 0 ? "text-profit" : "text-loss")}>
                      ${fmtUsd(d.pnl, true)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Discipline breakdown ──────────────────── */}
        {hasData && (stats.instrGroups.length > 0 || stats.sessionGroups.length > 0) && (
          <div className="grid grid-cols-2 gap-4">
            {stats.instrGroups.length > 0 && (
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="size-4 text-accent" />
                  <p className="text-sm font-medium text-text-primary">Discipline by instrument</p>
                  <span className="text-[10px] text-text-disabled ml-auto">click to see details</span>
                </div>
                <div className="space-y-0.5">
                  {stats.instrGroups.map((g) => (
                    <DisciplineRow
                      key={g.name}
                      group={g}
                      onClick={() => setDetail({
                        title: g.name,
                        subtitle: `${g.violations.length} trade${g.violations.length !== 1 ? "s" : ""} where the plan wasn't followed`,
                        trades: g.violations,
                      })}
                    />
                  ))}
                </div>
              </div>
            )}
            {stats.sessionGroups.length > 0 && (
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="size-4 text-accent" />
                  <p className="text-sm font-medium text-text-primary">Discipline by session</p>
                  <span className="text-[10px] text-text-disabled ml-auto">click to see details</span>
                </div>
                <div className="space-y-0.5">
                  {stats.sessionGroups.map((g) => (
                    <DisciplineRow
                      key={g.name}
                      group={g}
                      onClick={() => setDetail({
                        title: g.name,
                        subtitle: `${g.violations.length} trade${g.violations.length !== 1 ? "s" : ""} where the plan wasn't followed`,
                        trades: g.violations,
                      })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Calendar ──────────────────────────────────── */}
        {hasData && <PnlCalendar trades={trades} />}

        {!hasData && (
          <div className="card p-12 text-center">
            <p className="text-sm text-text-disabled">Register trades in the Journal to see your stats here.</p>
          </div>
        )}

      </main>

      {detail && (
        <TradeListModal detail={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}
