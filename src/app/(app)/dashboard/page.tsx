"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, TrendingDown, Target, Shield, Activity, Percent, Award, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import TopBar from "@/components/layout/TopBar";
import { createClient } from "@/lib/supabase/client";
import { useAccountStore } from "@/store/account";

type Trade = {
  id: string;
  instrument: string;
  direction: "LONG" | "SHORT";
  net_pnl: number | null;
  return_r: number | null;
  open_time: string;
  session: string | null;
  followed_plan: boolean | null;
};

const INITIAL_BALANCE = 100000;
const DD_LIMIT = 10000;
const PROFIT_TARGET = 5000;

function fmtUsd(n: number, sign = false) {
  const s = sign && n > 0 ? "+" : "";
  return `${s}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function KpiCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub?: string; color?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="card-light p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-text-secondary">{label}</p>
        <Icon className="size-4 text-text-disabled" />
      </div>
      <p className={cn("text-2xl font-mono font-semibold", color ?? "text-text-primary")}>{value}</p>
      {sub && <p className="text-[11px] text-text-disabled mt-1">{sub}</p>}
    </div>
  );
}

// ─── SVG Equity Curve ─────────────────────────────────────────
function EquityCurve({ data }: { data: { balance: number; date: string }[] }) {
  const W = 800, H = 240, padL = 8, padR = 8, padT = 12, padB = 22;
  const points = [{ balance: INITIAL_BALANCE, date: "Start" }, ...data];
  const balances = points.map(p => p.balance);
  const min = Math.min(...balances, INITIAL_BALANCE);
  const max = Math.max(...balances, INITIAL_BALANCE);
  const range = max - min || 1;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const x = (i: number) => padL + (i / (points.length - 1 || 1)) * innerW;
  const y = (v: number) => padT + (1 - (v - min) / range) * innerH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.balance).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${(H - padB).toFixed(1)} L ${padL} ${(H - padB).toFixed(1)} Z`;
  const baselineY = y(INITIAL_BALANCE);
  const lastBalance = points[points.length - 1].balance;
  const lineColor = lastBalance >= INITIAL_BALANCE ? "#34d399" : "#f87171";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 240 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity={0.28} />
          <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* baseline (initial balance) */}
      <line x1={padL} y1={baselineY} x2={W - padR} y2={baselineY} stroke="#6b6688" strokeWidth={1} strokeDasharray="4 4" />
      <path d={areaPath} fill="url(#eqGrad)" />
      <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" />
      {/* last point dot */}
      <circle cx={x(points.length - 1)} cy={y(lastBalance)} r={3.5} fill={lineColor} />
    </svg>
  );
}

// ─── SVG Discipline Gauge ─────────────────────────────────────
function DisciplineGauge({ rate }: { rate: number }) {
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
        <span className="text-[10px] text-text-disabled">followed plan</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeAccountId, accounts } = useAccountStore();
  const account = accounts.find(a => a.id === activeAccountId) ?? null;
  const initialBalance = account?.initial_balance ?? INITIAL_BALANCE;

  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeAccountId) { setLoading(false); return; }
    setLoading(true);
    supabase
      .from("trades")
      .select("id, instrument, direction, net_pnl, return_r, open_time, session, followed_plan")
      .eq("account_id", activeAccountId)
      .not("net_pnl", "is", null)
      .order("open_time", { ascending: true })
      .then(({ data: rows }) => {
        setTrades((rows as unknown as Trade[]) ?? []);
        setLoading(false);
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
      return { balance: running, date: new Date(t.open_time).toLocaleDateString("en-US", { day: "2-digit", month: "short" }) };
    });

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
    const progressToTarget = Math.max(0, Math.min(100, (totalPnl / PROFIT_TARGET) * 100));

    return {
      totalPnl, winRate, profitFactor, avgWin, avgLoss, avgR, expectancy,
      tradeCount: closed.length, winCount: wins.length, lossCount: losses.length,
      equity, maxDD, balance, disciplineRate, evaluatedCount: evaluated.length,
      sessionData, instrData, progressToTarget,
    };
  }, [trades, initialBalance]);

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Dashboard" />
        <div className="flex-1 flex items-center justify-center text-text-disabled text-sm">Loading…</div>
      </div>
    );
  }

  const hasData = stats.tradeCount > 0;
  const maxSessionAbs = Math.max(...stats.sessionData.map(d => Math.abs(d.pnl)), 1);
  const maxInstrAbs = Math.max(...stats.instrData.map(d => Math.abs(d.pnl)), 1);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Dashboard" />
      <main className="flex-1 overflow-y-auto p-6 space-y-4">

        {/* ── KPI row ───────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-4">
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
        </div>

        {/* ── Phase 2 progress ──────────────────────────── */}
        <div className="card-light p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="size-4 text-accent" />
              <p className="text-sm font-medium text-text-primary">Phase 2 Progress</p>
            </div>
            <span className="text-xs text-text-secondary">
              ${fmtUsd(Math.max(0, stats.totalPnl))} / ${fmtUsd(PROFIT_TARGET)} target
            </span>
          </div>
          <div className="h-2.5 bg-surface-hi rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-700" style={{ width: `${stats.progressToTarget}%` }} />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-text-disabled">{stats.progressToTarget.toFixed(1)}% of target</span>
            <span className={cn("text-[11px]", stats.maxDD > DD_LIMIT * 0.7 ? "text-loss" : "text-text-disabled")}>
              Max DD: ${fmtUsd(stats.maxDD)} / ${fmtUsd(DD_LIMIT)}
            </span>
          </div>
        </div>

        {/* ── Equity curve + discipline ─────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 card p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-text-primary">Equity curve</p>
              {hasData && (
                <span className="text-xs font-mono text-text-secondary">
                  {stats.equity[0]?.date} → {stats.equity[stats.equity.length - 1]?.date}
                </span>
              )}
            </div>
            {hasData ? (
              <EquityCurve data={stats.equity} />
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
                <div className="flex flex-col items-center py-2">
                  <DisciplineGauge rate={stats.disciplineRate} />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-secondary">Evaluated trades</span>
                    <span className="font-mono text-text-primary">{stats.evaluatedCount}/{stats.tradeCount}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-text-secondary">Avg winner</span>
                    <span className="font-mono text-profit">${fmtUsd(stats.avgWin)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-text-secondary">Avg loser</span>
                    <span className="font-mono text-loss">-${fmtUsd(stats.avgLoss)}</span>
                  </div>
                </div>
                {stats.disciplineRate < 80 && stats.evaluatedCount > 0 && (
                  <div className="flex items-start gap-1.5 text-[11px] text-warning bg-warning/10 rounded-lg p-2">
                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                    <span>Discipline below 80%. Review the trades where you didn&apos;t follow the plan.</span>
                  </div>
                )}
              </>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-text-disabled text-xs text-center">
                Evaluate your trades in the journal to see your discipline
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

        {!hasData && (
          <div className="card p-12 text-center">
            <p className="text-sm text-text-disabled">Register trades in the Journal to see your stats here.</p>
          </div>
        )}
      </main>
    </div>
  );
}
