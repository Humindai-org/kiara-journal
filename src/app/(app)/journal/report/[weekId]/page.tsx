"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Lock,
  TrendingUp,
  TrendingDown,
  Loader2,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
} from "recharts";
import { cn } from "@/lib/cn";
import TopBar from "@/components/layout/TopBar";
import { createClient } from "@/lib/supabase/client";
import { useAccountStore } from "@/store/account";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// recharts can't resolve CSS variables — brand hex values from globals.css
const C = {
  profit: "#44e4b2",
  loss: "#ff6b8a",
  accent: "#9d8bff",
  accentDim: "#7c5cff",
  warning: "#fbbf24",
  info: "#60a5fa",
  grid: "rgba(255,255,255,0.06)",
  axis: "#7f789b",
  surface2: "#262237",
  tooltipBg: "#1f1c2e",
};

type Trade = {
  id: string;
  instrument: string;
  direction: "LONG" | "SHORT";
  net_pnl: number | null;
  open_time: string;
  session: string | null;
  return_r: number | null;
  risk_percent: number | null;
  tags: string[] | null;
  followed_plan: boolean | null;
};

type PrevTrade = { net_pnl: number | null; return_r: number | null };

type Violation = {
  id: string;
  violation_type: "MAX_TRADES" | "OUTSIDE_WINDOW" | "DAILY_LOSS" | "AFTER_PROFIT_TARGET" | "HIGH_IMPACT_NEWS";
  date: string;
  description: string | null;
};

type Plan = {
  max_trades_per_day: number | null;
  max_daily_loss: number | null;
  risk_per_trade_percent: number | null;
};

type AiAnalysis = { worked: string[]; didntWork: string[]; focus: string };

const VIOLATION_LABELS: Record<Violation["violation_type"], string> = {
  MAX_TRADES: "Exceeded max trades per day",
  OUTSIDE_WINDOW: "Traded outside allowed trading window",
  DAILY_LOSS: "Exceeded max daily loss",
  AFTER_PROFIT_TARGET: "Traded after profit target reached",
  HIGH_IMPACT_NEWS: "Traded during high-impact news",
};

const VIOLATION_COLORS: Record<Violation["violation_type"], string> = {
  MAX_TRADES: "text-warning",
  OUTSIDE_WINDOW: "text-info",
  DAILY_LOSS: "text-loss",
  AFTER_PROFIT_TARGET: "text-warning",
  HIGH_IMPACT_NEWS: "text-loss",
};

const CONFLUENCE_CATEGORIES: { label: string; keywords: string[] }[] = [
  { label: "Trend", keywords: ["trend", "tendencia", "estructura", "structure", "bias", "direcc", "hh", "hl", "ema", "narrativa", "ritmo"] },
  { label: "Support/Resistance", keywords: ["support", "resist", "soporte", "resistencia", "pivot", "pivote", "zona", "area", "área", "level", "nivel", "poc", "vah", "val", "dva", "origen", "destino", "neutral"] },
  { label: "Price Action", keywords: ["price action", "vela", "candle", "wick", "mecha", "engulf", "envolvente", "pin", "rejection", "rechazo", "ruptura", "break", "retest", "patron", "patrón", "timing", "t3", "aceptacion", "aceptación"] },
  { label: "Volume", keywords: ["volume", "volumen", "delta", "imbalance", "desequilibrio", "absorption", "absorcion", "absorción", "profile", "perfil"] },
  { label: "Indicators", keywords: ["rsi", "macd", "indicator", "indicador", "divergen", "stoch", "atr", "vwap", "bollinger", "fib", "media", "ma "] },
];

// ── Formatting ──────────────────────────────────────────────
function fmtMoney(n: number) {
  return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
}
function fmtMoneyPlain(n: number) {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
}
function clamp(n: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, n));
}

// ── Stats ───────────────────────────────────────────────────
type Stats = {
  netPnL: number;
  count: number;
  winners: number;
  losers: number;
  winRate: number | null;
  profitFactor: number | null;
  avgRR: number | null;
  expectancy: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  best: number | null;
  worst: number | null;
};

function computeStats(pnls: number[], rrs: (number | null)[]): Stats {
  const count = pnls.length;
  const netPnL = pnls.reduce((s, p) => s + p, 0);
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p < 0);
  const grossWin = wins.reduce((s, p) => s + p, 0);
  const grossLoss = Math.abs(losses.reduce((s, p) => s + p, 0));
  const validRR = rrs.filter((r): r is number => r != null);
  return {
    netPnL,
    count,
    winners: wins.length,
    losers: losses.length,
    winRate: count > 0 ? (wins.length / count) * 100 : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    avgRR: validRR.length > 0 ? validRR.reduce((s, r) => s + r, 0) / validRR.length : null,
    expectancy: count > 0 ? netPnL / count : null,
    avgWin: wins.length > 0 ? grossWin / wins.length : null,
    avgLoss: losses.length > 0 ? -grossLoss / losses.length : null,
    best: count > 0 ? Math.max(...pnls) : null,
    worst: count > 0 ? Math.min(...pnls) : null,
  };
}

// ── Week range helpers ──────────────────────────────────────
function weekRange(year: number, month: number, weekNum: number) {
  const totalDays = new Date(year, month + 1, 0).getDate();
  const startDay = (weekNum - 1) * 7 + 1;
  const endDay = weekNum === 4 ? totalDays : Math.min(weekNum * 7, totalDays);
  return { startDay, endDay };
}

function prevWeek(year: number, month: number, weekNum: number) {
  if (weekNum > 1) return { year, month, weekNum: weekNum - 1 };
  const pm = month === 0 ? 11 : month - 1;
  const py = month === 0 ? year - 1 : year;
  return { year: py, month: pm, weekNum: 4 };
}

// ── Small UI primitives ─────────────────────────────────────
function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("card p-5 flex flex-col", className)}>
      <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}

function EmptyChart({ label = "No trades this week" }: { label?: string }) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[160px] text-xs text-text-disabled">
      {label}
    </div>
  );
}

function Gauge({ value, size = 104, label }: { value: number | null; size?: number; label: string }) {
  const v = value != null ? clamp(Math.round(value)) : null;
  const color = v == null ? C.axis : v >= 70 ? C.profit : v >= 40 ? C.warning : C.loss;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = v != null ? (v / 100) * circ : 0;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.surface2} strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${filled} ${circ - filled}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-mono font-bold text-text-primary tabular-nums">{v ?? "—"}</span>
          <span className="text-[9px] text-text-disabled uppercase tracking-wide">/ 100</span>
        </div>
      </div>
      <span className="text-[10px] text-text-muted uppercase tracking-wider">{label}</span>
    </div>
  );
}

function ChartTooltip({ active, payload, label, money = true }: {
  active?: boolean;
  payload?: { value: number; name?: string }[];
  label?: string | number;
  money?: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const v = payload[0].value;
  return (
    <div className="rounded-lg border border-border-light px-3 py-2 text-xs shadow-lg" style={{ backgroundColor: C.tooltipBg }}>
      {label != null && label !== "" && <p className="text-text-disabled mb-0.5">{label}</p>}
      <p className={cn("font-mono font-semibold", v >= 0 ? "text-profit" : "text-loss")}>
        {money ? fmtMoney(v) : v}
      </p>
    </div>
  );
}

// ── KPI card ────────────────────────────────────────────────
function KpiCard({ label, value, delta, deltaFmt, higherIsBetter = true, neutral = false }: {
  label: string;
  value: string;
  delta: number | null;
  deltaFmt: (n: number) => string;
  higherIsBetter?: boolean;
  neutral?: boolean;
}) {
  const improved = delta != null && (higherIsBetter ? delta > 0 : delta < 0);
  const worsened = delta != null && (higherIsBetter ? delta < 0 : delta > 0);
  return (
    <div className="card p-4">
      <p className="text-[10px] text-text-disabled uppercase tracking-wider">{label}</p>
      <p className="text-xl font-mono font-bold text-text-primary tabular-nums mt-1 truncate">{value}</p>
      <div className="mt-2 h-5">
        {delta != null && delta !== 0 ? (
          <span className={cn(
            "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
            neutral
              ? "bg-surface-2 text-text-secondary border-border-light"
              : improved
                ? "bg-profit/10 text-profit border-profit/30"
                : worsened
                  ? "bg-loss/10 text-loss border-loss/30"
                  : "bg-surface-2 text-text-secondary border-border-light"
          )}>
            {delta > 0 ? <TrendingUp className="size-2.5" /> : <TrendingDown className="size-2.5" />}
            {deltaFmt(Math.abs(delta))} vs prev week
          </span>
        ) : (
          <span className="text-[10px] text-text-disabled">— vs prev week</span>
        )}
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────
export default function WeekReportPage() {
  const { weekId } = useParams<{ weekId: string }>();
  const supabase = useMemo(() => createClient(), []);

  // Parse weekId: "YYYY-MM-W{N}" (e.g. "2026-07-W2")
  const parsed = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-W([1-4])$/.exec(weekId ?? "");
    if (!m) return null;
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const weekNum = parseInt(m[3], 10);
    return { year, month, weekNum, ...weekRange(year, month, weekNum) };
  }, [weekId]);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [prevTrades, setPrevTrades] = useState<PrevTrade[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [confluences, setConfluences] = useState<Record<string, boolean>[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(!!parsed);

  const [ai, setAi] = useState<AiAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const activeAccountId = useAccountStore((s) => s.activeAccountId);

  useEffect(() => {
    if (!parsed) return;
    const { year, month, weekNum, startDay, endDay } = parsed;
    const fromISO = new Date(year, month, startDay).toISOString();
    const toISO = new Date(year, month, endDay, 23, 59, 59).toISOString();
    const fromDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;
    const toDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

    const pw = prevWeek(year, month, weekNum);
    const pwRange = weekRange(pw.year, pw.month, pw.weekNum);
    const pwFromISO = new Date(pw.year, pw.month, pwRange.startDay).toISOString();
    const pwToISO = new Date(pw.year, pw.month, pwRange.endDay, 23, 59, 59).toISOString();

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) { setLoading(false); return; }
      const uid = data.user.id;

      // Scope every query to the selected account so the weekly report matches
      // the dashboard and the journal calendar.
      const scoped = <T,>(q: T): T =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activeAccountId ? (q as any).eq("account_id", activeAccountId) : q;

      const [{ data: tr }, { data: ptr }, { data: vi }, { data: pl }] = await Promise.all([
        scoped(supabase.from("trades")
          .select("id, instrument, direction, net_pnl, open_time, session, return_r, risk_percent, tags, followed_plan")
          .eq("user_id", uid)
          .gte("open_time", fromISO)
          .lte("open_time", toISO))
          .order("open_time", { ascending: true }),
        scoped(supabase.from("trades")
          .select("net_pnl, return_r")
          .eq("user_id", uid)
          .gte("open_time", pwFromISO)
          .lte("open_time", pwToISO)),
        scoped(supabase.from("discipline_violations")
          .select("id, violation_type, date, description")
          .eq("user_id", uid)
          .gte("date", fromDate)
          .lte("date", toDate)),
        supabase.from("plans")
          .select("max_trades_per_day, max_daily_loss, risk_per_trade_percent")
          .eq("user_id", uid)
          .eq("is_active", true)
          .maybeSingle(),
      ]);

      const weekTrades = (tr as Trade[]) ?? [];
      setTrades(weekTrades);
      setPrevTrades((ptr as PrevTrade[]) ?? []);
      setViolations((vi as Violation[]) ?? []);
      setPlan((pl as Plan | null) ?? null);

      if (weekTrades.length > 0) {
        const { data: je } = await supabase
          .from("journal_entries")
          .select("entry_confluences")
          .in("trade_id", weekTrades.map(t => t.id))
          .not("entry_confluences", "is", null);
        const rows = (je as { entry_confluences: Record<string, boolean> | null }[] | null) ?? [];
        setConfluences(rows.map(r => r.entry_confluences).filter((c): c is Record<string, boolean> => !!c));
      }
      setLoading(false);
    });
  }, [supabase, parsed, activeAccountId]);

  // ── Derived data ──────────────────────────────────────────
  const pnls = useMemo(() => trades.map(t => t.net_pnl ?? 0), [trades]);
  const stats = useMemo(() => computeStats(pnls, trades.map(t => t.return_r)), [pnls, trades]);
  const prevStats = useMemo(
    () => computeStats(prevTrades.map(t => t.net_pnl ?? 0), prevTrades.map(t => t.return_r)),
    [prevTrades],
  );

  const equityCurve = useMemo(() => {
    const pts = [{ i: 0, equity: 0 }];
    for (const [i, t] of trades.entries()) {
      pts.push({ i: i + 1, equity: Math.round((pts[i].equity + (t.net_pnl ?? 0)) * 100) / 100 });
    }
    return pts;
  }, [trades]);

  const maxDrawdown = useMemo(() => {
    let peak = 0, dd = 0;
    for (const p of equityCurve) {
      peak = Math.max(peak, p.equity);
      dd = Math.max(dd, peak - p.equity);
    }
    return dd;
  }, [equityCurve]);

  const dailyPnL = useMemo(() => {
    if (!parsed) return [];
    const { year, month, startDay, endDay } = parsed;
    return Array.from({ length: endDay - startDay + 1 }).map((_, i) => {
      const day = startDay + i;
      const date = new Date(year, month, day);
      const dayTrades = trades.filter(t => new Date(t.open_time).getDate() === day);
      return {
        label: `${DAY_NAMES[date.getDay()]} ${day}`,
        pnl: Math.round(dayTrades.reduce((s, t) => s + (t.net_pnl ?? 0), 0) * 100) / 100,
        count: dayTrades.length,
      };
    });
  }, [parsed, trades]);

  const streaks = useMemo(() => {
    let ws = 0, ls = 0, maxWs = 0, maxLs = 0;
    for (const p of pnls) {
      if (p > 0) { ws++; ls = 0; } else if (p < 0) { ls++; ws = 0; } else { ws = 0; ls = 0; }
      maxWs = Math.max(maxWs, ws);
      maxLs = Math.max(maxLs, ls);
    }
    return { win: maxWs, loss: maxLs };
  }, [pnls]);

  // Risk metrics
  const riskMetrics = useMemo(() => {
    const risks = trades.map(t => t.risk_percent).filter((r): r is number => r != null);
    const rrs = trades.map(t => t.return_r).filter((r): r is number => r != null);
    const avgRisk = risks.length > 0 ? risks.reduce((s, r) => s + r, 0) / risks.length : null;
    const maxRisk = risks.length > 0 ? Math.max(...risks) : null;
    const avgR = rrs.length > 0 ? rrs.reduce((s, r) => s + r, 0) / rrs.length : null;

    const planRisk = plan?.risk_per_trade_percent ?? null;
    const adherence = avgRisk != null && planRisk
      ? clamp((planRisk / Math.max(avgRisk, 0.0001)) * 100)
      : null;
    const ddCap = (plan?.max_daily_loss ?? 300) * 2;
    const ddScore = trades.length > 0 ? clamp(100 - (maxDrawdown / ddCap) * 100) : null;
    const parts = [adherence, ddScore].filter((s): s is number => s != null);
    const riskScore = parts.length > 0 ? parts.reduce((s, v) => s + v, 0) / parts.length : null;
    return { avgRisk, maxRisk, avgR, adherence, riskScore };
  }, [trades, plan, maxDrawdown]);

  // Performance radar (all axes normalized 0–100)
  const radar = useMemo(() => {
    if (trades.length === 0) return null;
    const winRateScore = stats.winRate ?? 0;
    const pf = stats.profitFactor;
    const pfScore = pf == null ? 0 : pf === Infinity ? 100 : clamp((pf / 3) * 100);
    const riskScore = riskMetrics.adherence ?? 50;
    const tradingDays = dailyPnL.filter(d => d.count > 0);
    const consistencyScore = tradingDays.length > 0
      ? (tradingDays.filter(d => d.pnl > 0).length / tradingDays.length) * 100
      : 0;
    const avgLossAbs = Math.abs(stats.avgLoss ?? 0);
    const expScore = stats.expectancy != null && stats.expectancy > 0
      ? clamp((stats.expectancy / Math.max(avgLossAbs, 1)) * 100)
      : 0;
    const axes = [
      { axis: "Win Rate", value: Math.round(winRateScore) },
      { axis: "Profit Factor", value: Math.round(pfScore) },
      { axis: "Risk Mgmt", value: Math.round(riskScore) },
      { axis: "Consistency", value: Math.round(consistencyScore) },
      { axis: "Expectancy", value: Math.round(expScore) },
    ];
    const score = Math.round(axes.reduce((s, a) => s + a.value, 0) / axes.length);
    return { axes, score };
  }, [trades.length, stats, riskMetrics.adherence, dailyPnL]);

  // Confluence breakdown
  const confluenceData = useMemo(() => {
    const counts = CONFLUENCE_CATEGORIES.map(c => ({ label: c.label, count: 0 }));
    let total = 0;
    for (const entry of confluences) {
      for (const [key, on] of Object.entries(entry)) {
        if (!on) continue;
        const k = key.toLowerCase();
        const idx = CONFLUENCE_CATEGORIES.findIndex(c => c.keywords.some(kw => k.includes(kw)));
        if (idx >= 0) { counts[idx].count++; total++; }
      }
    }
    return { counts, total };
  }, [confluences]);

  // Setup performance (grouped by tags[0])
  const setups = useMemo(() => {
    const groups = new Map<string, Trade[]>();
    for (const t of trades) {
      const key = t.tags?.[0] ?? "Untagged";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    return Array.from(groups.entries())
      .map(([name, list]) => ({
        name,
        stats: computeStats(list.map(t => t.net_pnl ?? 0), list.map(t => t.return_r)),
      }))
      .sort((a, b) => b.stats.netPnL - a.stats.netPnL);
  }, [trades]);

  const violationGroups = useMemo(() => {
    const groups: Partial<Record<Violation["violation_type"], number>> = {};
    for (const v of violations) groups[v.violation_type] = (groups[v.violation_type] ?? 0) + 1;
    return groups;
  }, [violations]);

  // ── AI analysis ───────────────────────────────────────────
  const generateAnalysis = useCallback(async () => {
    if (trades.length === 0 || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/report/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekId,
          trades: trades.map(t => ({
            instrument: t.instrument,
            direction: t.direction,
            netPnL: t.net_pnl ?? 0,
            returnR: t.return_r,
            riskPercent: t.risk_percent,
            session: t.session,
            setup: t.tags?.[0] ?? null,
            followedPlan: t.followed_plan,
          })),
          stats: {
            netPnL: stats.netPnL,
            winRate: stats.winRate,
            profitFactor: stats.profitFactor === Infinity ? 99 : stats.profitFactor,
            expectancy: stats.expectancy,
            avgRR: stats.avgRR,
            bestTrade: stats.best,
            worstTrade: stats.worst,
            maxDrawdown,
          },
          violations: violations.map(v => ({ type: v.violation_type, date: v.date })),
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setAi(await res.json());
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAiLoading(false);
    }
  }, [trades, stats, violations, maxDrawdown, weekId, aiLoading]);

  // ── Render ────────────────────────────────────────────────
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
  const hasTrades = trades.length > 0;
  const equityPositive = stats.netPnL >= 0;
  const maxTradeAbs = Math.max(
    Math.abs(stats.best ?? 0), Math.abs(stats.worst ?? 0),
    Math.abs(stats.avgWin ?? 0), Math.abs(stats.avgLoss ?? 0), 1,
  );

  const pfDisplay = stats.profitFactor == null ? "—" : stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title={`Weekly Report — Week ${weekNum}`} />

      <main className="flex-1 overflow-y-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <Link href="/journal" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary focus-visible:text-text-primary transition-colors mb-3">
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
          <div className="space-y-4 max-w-[1400px]">

            {/* ── Row 1: KPIs ─────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <KpiCard
                label="Net P&L"
                value={hasTrades ? fmtMoney(stats.netPnL) : "—"}
                delta={hasTrades && prevTrades.length > 0 ? stats.netPnL - prevStats.netPnL : null}
                deltaFmt={n => fmtMoneyPlain(n)}
              />
              <KpiCard
                label="Total Trades"
                value={hasTrades ? String(stats.count) : "—"}
                delta={hasTrades && prevTrades.length > 0 ? stats.count - prevStats.count : null}
                deltaFmt={n => String(n)}
                neutral
              />
              <KpiCard
                label="Win Rate"
                value={stats.winRate != null ? `${Math.round(stats.winRate)}%` : "—"}
                delta={stats.winRate != null && prevStats.winRate != null ? stats.winRate - prevStats.winRate : null}
                deltaFmt={n => `${n.toFixed(0)}pp`}
              />
              <KpiCard
                label="Profit Factor"
                value={pfDisplay}
                delta={
                  stats.profitFactor != null && prevStats.profitFactor != null &&
                  stats.profitFactor !== Infinity && prevStats.profitFactor !== Infinity
                    ? stats.profitFactor - prevStats.profitFactor : null
                }
                deltaFmt={n => n.toFixed(2)}
              />
              <KpiCard
                label="Avg R:R"
                value={stats.avgRR != null ? `${stats.avgRR.toFixed(2)}R` : "—"}
                delta={stats.avgRR != null && prevStats.avgRR != null ? stats.avgRR - prevStats.avgRR : null}
                deltaFmt={n => `${n.toFixed(2)}R`}
              />
              <KpiCard
                label="Expectancy"
                value={stats.expectancy != null ? fmtMoney(stats.expectancy) : "—"}
                delta={stats.expectancy != null && prevStats.expectancy != null ? stats.expectancy - prevStats.expectancy : null}
                deltaFmt={n => fmtMoneyPlain(n)}
              />
            </div>

            {/* ── Row 2: Charts ───────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Equity curve */}
              <Panel title="Equity Curve" className="lg:col-span-6 min-h-[260px]">
                {hasTrades ? (
                  <div className="flex-1 min-h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={equityCurve} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={equityPositive ? C.profit : C.loss} stopOpacity={0.25} />
                            <stop offset="100%" stopColor={equityPositive ? C.profit : C.loss} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={C.grid} vertical={false} />
                        <XAxis dataKey="i" tick={{ fill: C.axis, fontSize: 10 }} tickLine={false} axisLine={{ stroke: C.grid }} />
                        <YAxis tick={{ fill: C.axis, fontSize: 10 }} tickLine={false} axisLine={false} width={54} tickFormatter={(v: number) => `$${v}`} />
                        <Tooltip content={<ChartTooltip />} />
                        <ReferenceLine y={0} stroke={C.axis} strokeDasharray="4 4" strokeOpacity={0.4} />
                        <Area
                          type="monotone" dataKey="equity"
                          stroke={equityPositive ? C.profit : C.loss} strokeWidth={2}
                          fill="url(#equityFill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyChart />}
              </Panel>

              {/* Donut */}
              <Panel title="P&L Distribution" className="lg:col-span-3 min-h-[260px]">
                {hasTrades ? (
                  <div className="flex-1 relative min-h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: "Profitable", value: stats.winners },
                            { name: "Losing", value: stats.losers },
                            ...(stats.count - stats.winners - stats.losers > 0
                              ? [{ name: "Breakeven", value: stats.count - stats.winners - stats.losers }]
                              : []),
                          ]}
                          dataKey="value" nameKey="name"
                          innerRadius="65%" outerRadius="85%"
                          paddingAngle={3} strokeWidth={0}
                        >
                          <Cell fill={C.profit} />
                          <Cell fill={C.loss} />
                          <Cell fill={C.axis} />
                        </Pie>
                        <Tooltip content={<ChartTooltip money={false} />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl font-mono font-bold text-text-primary">{stats.count}</span>
                      <span className="text-[10px] text-text-disabled uppercase tracking-wide">trades</span>
                    </div>
                  </div>
                ) : <EmptyChart />}
                {hasTrades && (
                  <div className="flex justify-center gap-4 mt-3 text-[10px]">
                    <span className="flex items-center gap-1.5 text-text-secondary">
                      <span className="size-2 rounded-full" style={{ backgroundColor: C.profit }} /> {stats.winners} profitable
                    </span>
                    <span className="flex items-center gap-1.5 text-text-secondary">
                      <span className="size-2 rounded-full" style={{ backgroundColor: C.loss }} /> {stats.losers} losing
                    </span>
                  </div>
                )}
              </Panel>

              {/* Daily bars */}
              <Panel title="P&L by Day" className="lg:col-span-3 min-h-[260px]">
                {hasTrades ? (
                  <div className="flex-1 min-h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyPnL} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                        <CartesianGrid stroke={C.grid} vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: C.axis, fontSize: 9 }} tickLine={false} axisLine={{ stroke: C.grid }} interval={0} angle={-30} textAnchor="end" height={40} />
                        <YAxis tick={{ fill: C.axis, fontSize: 10 }} tickLine={false} axisLine={false} width={50} tickFormatter={(v: number) => `$${v}`} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                        <ReferenceLine y={0} stroke={C.axis} strokeOpacity={0.4} />
                        <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={28}>
                          {dailyPnL.map((d, i) => (
                            <Cell key={i} fill={d.pnl >= 0 ? C.profit : C.loss} fillOpacity={d.count > 0 ? 1 : 0.15} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyChart />}
              </Panel>
            </div>

            {/* ── Row 3: Analysis panels ──────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Performance breakdown */}
              <Panel title="Performance Breakdown" className="min-h-[280px]">
                {radar ? (
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 min-h-[200px] h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={radar.axes} outerRadius="70%">
                          <PolarGrid stroke={C.grid} />
                          <PolarAngleAxis dataKey="axis" tick={{ fill: C.axis, fontSize: 9 }} />
                          <Radar dataKey="value" stroke={C.accent} fill={C.accent} fillOpacity={0.25} strokeWidth={2} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    <Gauge value={radar.score} label="Score" size={92} />
                  </div>
                ) : <EmptyChart />}
              </Panel>

              {/* Trades analysis */}
              <Panel title="Trades Analysis" className="min-h-[280px]">
                {hasTrades ? (
                  <div className="flex-1 flex flex-col justify-between gap-3">
                    {[
                      { label: "Best Trade", value: stats.best ?? 0 },
                      { label: "Worst Trade", value: stats.worst ?? 0 },
                      { label: "Average Win", value: stats.avgWin ?? 0 },
                      { label: "Average Loss", value: stats.avgLoss ?? 0 },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-text-secondary">{label}</span>
                          <span className={cn("font-mono font-semibold", value >= 0 ? "text-profit" : "text-loss")}>
                            {fmtMoney(value)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${clamp((Math.abs(value) / maxTradeAbs) * 100, 2)}%`,
                              backgroundColor: value >= 0 ? C.profit : C.loss,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="bg-surface-2 rounded-xl p-3 text-center">
                        <p className="text-lg font-mono font-bold text-profit">{streaks.win}</p>
                        <p className="text-[9px] text-text-disabled uppercase tracking-wide mt-0.5">Largest Win Streak</p>
                      </div>
                      <div className="bg-surface-2 rounded-xl p-3 text-center">
                        <p className="text-lg font-mono font-bold text-loss">{streaks.loss}</p>
                        <p className="text-[9px] text-text-disabled uppercase tracking-wide mt-0.5">Largest Loss Streak</p>
                      </div>
                    </div>
                  </div>
                ) : <EmptyChart />}
              </Panel>

              {/* Confluence analysis */}
              <Panel title="Confluence Analysis" className="min-h-[280px]">
                {confluenceData.total > 0 ? (
                  <div className="flex-1 flex flex-col justify-center gap-4">
                    {confluenceData.counts.map(c => {
                      const pct = Math.round((c.count / confluenceData.total) * 100);
                      return (
                        <div key={c.label}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-text-secondary">{c.label}</span>
                            <span className="font-mono text-text-muted">{c.count} · {pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: C.accent }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
                    <Lock className="size-6 text-text-disabled" />
                    <p className="text-xs text-text-disabled max-w-[220px]">
                      No confluence data yet — log entry confluences in your trade journal to unlock this breakdown.
                    </p>
                  </div>
                )}
              </Panel>
            </div>

            {/* ── Row 4 ───────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Setup performance */}
              <Panel title="Setup Performance" className="min-h-[240px]">
                {hasTrades ? (
                  <div className="flex-1 overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[9px] text-text-disabled uppercase tracking-wide">
                          <th className="pb-2 pr-3 font-medium">Setup</th>
                          <th className="pb-2 pr-3 font-medium text-right">Trades</th>
                          <th className="pb-2 pr-3 font-medium text-right">Win Rate</th>
                          <th className="pb-2 pr-3 font-medium text-right">Net P&L</th>
                          <th className="pb-2 pr-3 font-medium text-right">Expectancy</th>
                          <th className="pb-2 font-medium text-right">PF</th>
                        </tr>
                      </thead>
                      <tbody>
                        {setups.map((s, i) => (
                          <tr key={s.name} className={cn("text-xs", i % 2 === 0 && "bg-surface-2/50")}>
                            <td className="py-2 pr-3 pl-2 rounded-l-lg text-text-primary max-w-[100px] truncate">{s.name}</td>
                            <td className="py-2 pr-3 font-mono text-text-secondary text-right">{s.stats.count}</td>
                            <td className="py-2 pr-3 font-mono text-text-secondary text-right">
                              {s.stats.winRate != null ? `${Math.round(s.stats.winRate)}%` : "—"}
                            </td>
                            <td className={cn("py-2 pr-3 font-mono font-medium text-right", s.stats.netPnL >= 0 ? "text-profit" : "text-loss")}>
                              {fmtMoney(s.stats.netPnL)}
                            </td>
                            <td className={cn("py-2 pr-3 font-mono text-right", (s.stats.expectancy ?? 0) >= 0 ? "text-profit" : "text-loss")}>
                              {s.stats.expectancy != null ? fmtMoney(s.stats.expectancy) : "—"}
                            </td>
                            <td className="py-2 pr-2 rounded-r-lg font-mono text-text-secondary text-right">
                              {s.stats.profitFactor == null ? "—" : s.stats.profitFactor === Infinity ? "∞" : s.stats.profitFactor.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <EmptyChart />}
              </Panel>

              {/* Risk management */}
              <Panel title="Risk Management" className="min-h-[240px]">
                {hasTrades ? (
                  <div className="flex-1 flex items-center gap-4">
                    <div className="flex-1 space-y-3">
                      {[
                        { label: "Avg Risk per Trade", value: riskMetrics.avgRisk != null ? `${riskMetrics.avgRisk.toFixed(2)}%` : "—" },
                        { label: "Avg R Multiple", value: riskMetrics.avgR != null ? `${riskMetrics.avgR.toFixed(2)}R` : "—" },
                        { label: "Max Risk per Trade", value: riskMetrics.maxRisk != null ? `${riskMetrics.maxRisk.toFixed(2)}%` : "—" },
                        { label: "Max Drawdown", value: fmtMoneyPlain(-maxDrawdown) },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between text-xs">
                          <span className="text-text-secondary">{label}</span>
                          <span className="font-mono font-semibold text-text-primary">{value}</span>
                        </div>
                      ))}
                      {plan?.risk_per_trade_percent != null && (
                        <p className="text-[10px] text-text-disabled pt-1">
                          Plan limit: {plan.risk_per_trade_percent}% per trade
                        </p>
                      )}
                    </div>
                    <Gauge value={riskMetrics.riskScore} label="Risk Score" size={92} />
                  </div>
                ) : <EmptyChart />}
              </Panel>

              {/* Notes & takeaways */}
              <Panel title="Notes & Takeaways" className="min-h-[240px]">
                <div className="flex-1 flex flex-col gap-3">
                  {violations.length > 0 ? (
                    <ul className="space-y-2">
                      {(Object.entries(violationGroups) as [Violation["violation_type"], number][]).map(([type, count]) => (
                        <li key={type} className="flex items-start gap-2 text-xs text-text-secondary">
                          <span className={cn("mt-0.5", VIOLATION_COLORS[type])}>●</span>
                          <span>
                            {VIOLATION_LABELS[type]}
                            {count > 1 && <span className="font-mono text-loss"> ×{count}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs text-profit">
                      <CheckCircle2 className="size-3.5" /> Clean week — no discipline violations
                    </p>
                  )}

                  {ai?.focus ? (
                    <div className="mt-auto rounded-xl border border-accent/30 bg-accent-glow p-3">
                      <p className="text-[10px] text-accent uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Sparkles className="size-3" /> Focus for next week
                      </p>
                      <p className="text-xs text-text-primary leading-relaxed">{ai.focus}</p>
                    </div>
                  ) : (
                    <div className="mt-auto rounded-xl border border-dashed border-border-light p-3">
                      <p className="text-[10px] text-text-disabled">
                        Generate the AI analysis below to get a focus recommendation for next week.
                      </p>
                    </div>
                  )}
                </div>
              </Panel>
            </div>

            {/* ── AI Analysis ─────────────────────────────── */}
            <div className="card p-5">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-accent" />
                    <h3 className="text-sm font-semibold text-text-primary">AI Analysis</h3>
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">Generated from your trades, stats and discipline data</p>
                </div>
                <button
                  onClick={generateAnalysis}
                  disabled={!hasTrades || aiLoading}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                    hasTrades && !aiLoading
                      ? "bg-action text-bg hover:bg-action-hover active:opacity-90"
                      : "border border-border-light text-text-disabled cursor-not-allowed"
                  )}
                >
                  {aiLoading
                    ? <><Loader2 className="size-3.5 animate-spin" /> Analyzing…</>
                    : <><Sparkles className="size-3.5" /> {ai ? "Regenerate AI Analysis" : "Generate AI Analysis"}</>}
                </button>
              </div>

              {aiError && (
                <p className="flex items-center gap-1.5 text-xs text-loss mb-3">
                  <AlertTriangle className="size-3.5" /> {aiError}
                </p>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border border-profit/20 bg-profit/5 p-4 min-h-[120px]">
                  <p className="text-sm font-medium text-profit mb-2">What worked?</p>
                  {ai ? (
                    <ul className="space-y-1.5">
                      {ai.worked.map((item, i) => (
                        <li key={i} className="text-xs text-text-secondary leading-relaxed flex gap-1.5">
                          <span className="text-profit mt-px">•</span>{item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-text-disabled italic">
                      {hasTrades ? "Generate the analysis to see insights here." : "No trades this week to analyze."}
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-loss/20 bg-loss/5 p-4 min-h-[120px]">
                  <p className="text-sm font-medium text-loss mb-2">What didn&apos;t work?</p>
                  {ai ? (
                    <ul className="space-y-1.5">
                      {ai.didntWork.map((item, i) => (
                        <li key={i} className="text-xs text-text-secondary leading-relaxed flex gap-1.5">
                          <span className="text-loss mt-px">•</span>{item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-text-disabled italic">
                      {hasTrades ? "Generate the analysis to see insights here." : "No trades this week to analyze."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
