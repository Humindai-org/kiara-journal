"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import TopBar from "@/components/layout/TopBar";
import { createClient } from "@/lib/supabase/client";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

type Trade = {
  id: string;
  instrument: string;
  net_pnl: number | null;
  open_time: string;
  notes: string | null;
};

type Violation = {
  id: string;
  violation_type: "MAX_TRADES" | "OUTSIDE_WINDOW" | "DAILY_LOSS" | "AFTER_PROFIT_TARGET" | "HIGH_IMPACT_NEWS";
  date: string;
  description: string | null;
};

const VIOLATION_LABELS: Record<Violation["violation_type"], string> = {
  MAX_TRADES: "Exceeded max trades per day",
  OUTSIDE_WINDOW: "Traded outside allowed trading window",
  DAILY_LOSS: "Exceeded max daily loss",
  AFTER_PROFIT_TARGET: "Traded after profit target reached",
  HIGH_IMPACT_NEWS: "Traded during high-impact news",
};

const VIOLATION_RECOMMENDATIONS: Record<Violation["violation_type"], string> = {
  MAX_TRADES: "Consider reducing to fewer trades on high-volatility sessions — lock the platform when the daily cap is hit.",
  OUTSIDE_WINDOW: "Review your trading schedule — trades were taken outside your allowed window.",
  DAILY_LOSS: "After hitting the daily loss limit, stop for the day. Take a 30-minute break after two consecutive losses.",
  AFTER_PROFIT_TARGET: "Once the profit target is reached, close the platform — protect what you made.",
  HIGH_IMPACT_NEWS: "Check the economic calendar before every session and respect news blocks.",
};

function fmtMoney(n: number) {
  return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
}

export default function WeekReportPage() {
  const { weekId } = useParams<{ weekId: string }>();
  const supabase = useMemo(() => createClient(), []);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [maxTradesPerDay, setMaxTradesPerDay] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Parse weekId: "YYYY-MM-W{N}" (e.g. "2026-07-W2")
  const parsed = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-W([1-4])$/.exec(weekId ?? "");
    if (!m) return null;
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1; // 0-based
    const weekNum = parseInt(m[3], 10);
    const totalDays = new Date(year, month + 1, 0).getDate();
    const startDay = (weekNum - 1) * 7 + 1;
    const endDay = weekNum === 4 ? totalDays : Math.min(weekNum * 7, totalDays);
    return { year, month, weekNum, startDay, endDay };
  }, [weekId]);

  useEffect(() => {
    if (!parsed) { setLoading(false); return; }
    const { year, month, startDay, endDay } = parsed;
    const fromISO = new Date(year, month, startDay).toISOString();
    const toISO = new Date(year, month, endDay, 23, 59, 59).toISOString();
    const fromDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;
    const toDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) { setLoading(false); return; }
      const uid = data.user.id;

      const [{ data: tr }, { data: vi }, { data: plan }] = await Promise.all([
        supabase.from("trades")
          .select("id, instrument, net_pnl, open_time, notes")
          .eq("user_id", uid)
          .gte("open_time", fromISO)
          .lte("open_time", toISO)
          .order("open_time", { ascending: true }),
        supabase.from("discipline_violations")
          .select("id, violation_type, date, description")
          .eq("user_id", uid)
          .gte("date", fromDate)
          .lte("date", toDate),
        supabase.from("plans")
          .select("max_trades_per_day")
          .eq("user_id", uid)
          .eq("is_active", true)
          .maybeSingle(),
      ]);

      const weekTrades = (tr as Trade[]) ?? [];
      setTrades(weekTrades);
      setViolations((vi as Violation[]) ?? []);
      if (plan) setMaxTradesPerDay((plan as { max_trades_per_day: number | null }).max_trades_per_day);

      // AI analysis from any journal entry of the week's trades
      if (weekTrades.length > 0) {
        const { data: je } = await supabase
          .from("journal_entries")
          .select("ai_analysis")
          .in("trade_id", weekTrades.map(t => t.id))
          .not("ai_analysis", "is", null)
          .limit(1);
        const rows = je as { ai_analysis: string | null }[] | null;
        if (rows && rows.length > 0) setAiAnalysis(rows[0].ai_analysis);
      }
      setLoading(false);
    });
  }, [supabase, parsed]);

  // ── Derived stats ─────────────────────────────────────────
  const netPnL = trades.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
  const winners = trades.filter(t => (t.net_pnl ?? 0) > 0).length;
  const winRate = trades.length > 0 ? Math.round((winners / trades.length) * 100) : null;
  const bestTrade = trades.length > 0 ? Math.max(...trades.map(t => t.net_pnl ?? 0)) : null;
  const worstTrade = trades.length > 0 ? Math.min(...trades.map(t => t.net_pnl ?? 0)) : null;

  const dailyRows = useMemo(() => {
    if (!parsed) return [];
    const { year, month, startDay, endDay } = parsed;
    return Array.from({ length: endDay - startDay + 1 }).map((_, i) => {
      const day = startDay + i;
      const date = new Date(year, month, day);
      const dayTrades = trades.filter(t => new Date(t.open_time).getDate() === day);
      const pnl = dayTrades.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
      const note = dayTrades.map(t => t.notes).find(Boolean) ?? null;
      return { day, dayName: DAY_NAMES[date.getDay()], count: dayTrades.length, pnl, note };
    });
  }, [parsed, trades]);

  const violationGroups = useMemo(() => {
    const groups: Partial<Record<Violation["violation_type"], { count: number; days: string[] }>> = {};
    for (const v of violations) {
      const d = new Date(v.date + "T12:00:00");
      const dayName = DAY_NAMES[d.getDay()];
      if (!groups[v.violation_type]) groups[v.violation_type] = { count: 0, days: [] };
      groups[v.violation_type]!.count++;
      if (!groups[v.violation_type]!.days.includes(dayName)) groups[v.violation_type]!.days.push(dayName);
    }
    return groups;
  }, [violations]);

  const violationDays = new Set(violations.map(v => v.date)).size;

  if (!parsed) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Weekly Report" />
        <div className="flex-1 flex items-center justify-center text-text-disabled text-sm">
          Invalid week — expected format YYYY-MM-W1..W4
        </div>
      </div>
    );
  }

  const { year, month, weekNum, startDay, endDay } = parsed;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title={`Weekly Report — Week ${weekNum}`} />

      <main className="flex-1 overflow-y-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <Link href="/journal" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors mb-3">
            <ArrowLeft className="size-3.5" /> Back to Journal
          </Link>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">
            Week {weekNum} — {MONTHS[month]} {year}
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {MONTHS[month]} {startDay}–{endDay}, {year}
          </p>
        </div>

        {loading ? (
          <div className="card p-6 flex items-center justify-center text-text-disabled text-sm h-96">
            Loading…
          </div>
        ) : (
          <div className="space-y-4 max-w-6xl">
            <div className="grid grid-cols-1 lg:grid-cols-[55fr_45fr] gap-4">

              {/* ── LEFT: Week Details ─────────────────── */}
              <div className="space-y-4">
                <div className="card p-5">
                  <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Week Details — Net P&L</p>
                  <p className={cn(
                    "text-4xl font-mono font-bold tabular-nums tracking-tight",
                    netPnL >= 0 ? "text-profit" : "text-loss"
                  )}>
                    {trades.length > 0 ? fmtMoney(netPnL) : "—"}
                  </p>

                  <div className="grid grid-cols-2 gap-3 mt-5">
                    {[
                      { label: "Total Trades", value: trades.length > 0 ? String(trades.length) : "—", color: "text-text-primary" },
                      { label: "Win Rate", value: winRate !== null ? `${winRate}%` : "—", color: "text-text-primary" },
                      { label: "Best Trade", value: bestTrade !== null ? fmtMoney(bestTrade) : "—", color: bestTrade !== null && bestTrade >= 0 ? "text-profit" : "text-loss" },
                      { label: "Worst Trade", value: worstTrade !== null ? fmtMoney(worstTrade) : "—", color: worstTrade !== null && worstTrade < 0 ? "text-loss" : "text-profit" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-surface-2 rounded-xl p-3">
                        <p className="text-[10px] text-text-disabled uppercase tracking-wide">{label}</p>
                        <p className={cn("text-lg font-mono font-semibold mt-0.5", color)}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Daily Review */}
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-text-primary mb-4">Daily Review</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[10px] text-text-disabled uppercase tracking-wide">
                          <th className="pb-2 pr-4 font-medium">Day</th>
                          <th className="pb-2 pr-4 font-medium">Total Trades</th>
                          <th className="pb-2 pr-4 font-medium">Net P&L</th>
                          <th className="pb-2 font-medium">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyRows.map((r, i) => (
                          <tr key={r.day} className={cn("text-xs", i % 2 === 0 && "bg-surface-2/50")}>
                            <td className="py-2.5 pr-4 pl-2 rounded-l-lg text-text-primary whitespace-nowrap">
                              {r.dayName}, {MONTHS[month].slice(0, 3)} {r.day}
                            </td>
                            <td className="py-2.5 pr-4 text-text-secondary font-mono">
                              {r.count > 0 ? `${r.count}${maxTradesPerDay ? `/${maxTradesPerDay}` : ""}` : "—"}
                            </td>
                            <td className={cn(
                              "py-2.5 pr-4 font-mono font-medium",
                              r.count > 0 ? (r.pnl >= 0 ? "text-profit" : "text-loss") : "text-text-disabled"
                            )}>
                              {r.count > 0 ? fmtMoney(r.pnl) : "—"}
                            </td>
                            <td className="py-2.5 pr-2 rounded-r-lg text-text-disabled max-w-[160px] truncate">
                              {r.note ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ── RIGHT: Discipline Report ───────────── */}
              <div className="card p-5 h-fit">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={cn("size-4", violations.length > 0 ? "text-loss" : "text-profit")} />
                    <h3 className="text-sm font-semibold text-text-primary">Discipline Report</h3>
                  </div>
                  {violations.length > 0 ? (
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-loss/10 text-loss border border-loss/30 font-medium">
                      {violations.length} violation{violations.length !== 1 ? "s" : ""} across {violationDays} day{violationDays !== 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full bg-profit/10 text-profit border border-profit/30 font-medium">
                      <CheckCircle2 className="size-3" /> Clean week — no violations
                    </span>
                  )}
                </div>

                {violations.length > 0 ? (
                  <ul className="space-y-3">
                    {(Object.entries(violationGroups) as [Violation["violation_type"], { count: number; days: string[] }][]).map(([type, g]) => (
                      <li key={type} className="flex items-start justify-between gap-3 bg-surface-2 rounded-xl p-3">
                        <div className="flex gap-2">
                          <span className="text-loss mt-0.5">•</span>
                          <div>
                            <p className="text-sm text-text-primary">
                              {VIOLATION_LABELS[type]} <span className="text-loss font-mono">×{g.count}</span>
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-text-secondary shrink-0 mt-0.5">{g.days.join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-text-disabled">
                    No discipline violations recorded this week. Keep protecting the rules.
                  </p>
                )}
              </div>
            </div>

            {/* ── AI Analysis ──────────────────────────── */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="size-4 text-accent" />
                <h3 className="text-sm font-semibold text-text-primary">AI Analysis</h3>
              </div>
              <p className="text-xs text-text-secondary mb-4">Auto-generated based on your trades and guardrails</p>

              {aiAnalysis ? (
                <div className="bg-surface-2 rounded-xl p-4 text-sm text-text-secondary leading-relaxed whitespace-pre-wrap mb-4">
                  {aiAnalysis}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                  <div className="rounded-xl border border-profit/20 bg-profit/5 p-4 min-h-[120px]">
                    <p className="text-sm font-medium text-profit mb-2">What worked?</p>
                    <p className="text-xs text-text-disabled italic">Generate the analysis to see insights here.</p>
                  </div>
                  <div className="rounded-xl border border-loss/20 bg-loss/5 p-4 min-h-[120px]">
                    <p className="text-sm font-medium text-loss mb-2">What didn&apos;t work?</p>
                    <p className="text-xs text-text-disabled italic">Generate the analysis to see insights here.</p>
                  </div>
                </div>
              )}

              {!aiAnalysis && (
                <button
                  disabled
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border-light text-xs text-text-disabled cursor-not-allowed mb-4"
                >
                  <Sparkles className="size-3.5" />
                  Generate AI Analysis
                </button>
              )}

              {/* Rule-based recommendations from violations */}
              {Object.keys(violationGroups).length > 0 && (
                <div className="border-t border-border pt-4">
                  <p className="text-[11px] text-text-muted uppercase tracking-wider mb-2">Recommendations</p>
                  <ul className="space-y-1.5">
                    {(Object.keys(violationGroups) as Violation["violation_type"][]).map(type => (
                      <li key={type} className="text-xs text-text-secondary flex gap-1.5">
                        <span className="text-warning">•</span>
                        {VIOLATION_RECOMMENDATIONS[type]}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
