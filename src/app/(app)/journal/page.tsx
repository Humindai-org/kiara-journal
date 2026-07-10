"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, TrendingUp, TrendingDown, Trash2, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import TopBar from "@/components/layout/TopBar";
import { createClient } from "@/lib/supabase/client";
import MonthlyPnLBars from "@/components/journal/MonthlyPnLBars";
import WeekBreakdownCarousel from "@/components/journal/WeekBreakdownCarousel";

type Trade = {
  id: string;
  instrument: string;
  direction: "LONG" | "SHORT";
  net_pnl: number | null;
  open_time: string;
  session: string | null;
  return_r: number | null;
  followed_plan: boolean | null;
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function inferMarket(instrument: string) {
  if (instrument === "XAUUSD") return "METALS";
  if (instrument === "NAS100" || instrument === "SP500") return "INDICES";
  return "FOREX";
}

function firstDayOfMonth(y: number, m: number) {
  return (new Date(y, m, 1).getDay() + 6) % 7; // Monday = 0
}
function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

export default function JournalPage() {
  const router = useRouter();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [directionFilter, setDirectionFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");

  // Calendar filter state
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDir, setFilterDir] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [filterMarket, setFilterMarket] = useState<"ALL" | "FOREX" | "METALS" | "INDICES">("ALL");
  const [filterSession, setFilterSession] = useState<"ALL" | "LONDON" | "NEW_YORK" | "OVERLAP" | "TOKYO">("ALL");

  const supabase = useMemo(() => createClient(), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const fetchTrades = useCallback(async (uid: string, y: number, m: number) => {
    setLoading(true);
    const from = new Date(y, m, 1).toISOString();
    const to = new Date(y, m + 1, 0, 23, 59, 59).toISOString();
    const { data } = await supabase
      .from("trades")
      .select("id, instrument, direction, net_pnl, open_time, session, return_r, followed_plan")
      .eq("user_id", uid)
      .gte("open_time", from)
      .lte("open_time", to)
      .order("open_time", { ascending: true });
    setTrades((data as Trade[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserId(data.user.id);
        fetchTrades(data.user.id, year, month);
      } else {
        setLoading(false);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (userId) fetchTrades(userId, year, month);
  }, [year, month, userId, fetchTrades]);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this trade? This action cannot be undone.")) return;
    const { error } = await db.from("trades").delete().eq("id", id);
    if (error) { toast.error("Error deleting"); return; }
    setTrades(prev => prev.filter(t => t.id !== id));
    toast.success("Trade deleted");
  }

  function prevMonth() {
    setSelectedDay(null);
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    setSelectedDay(null);
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  const byDay = useMemo(() => {
    const map: Record<number, Trade[]> = {};
    for (const t of trades) {
      const d = new Date(t.open_time).getDate();
      if (!map[d]) map[d] = [];
      map[d].push(t);
    }
    return map;
  }, [trades]);

  const selectedTrades = selectedDay ? (byDay[selectedDay] ?? []) : [];
  const filteredTrades = directionFilter === "ALL"
    ? selectedTrades
    : selectedTrades.filter(t => t.direction === directionFilter);
  const filteredPnL = filteredTrades.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
  const filteredMonthTrades = useMemo(() => trades.filter(t => {
    if (filterDir !== "ALL" && t.direction !== filterDir) return false;
    if (filterMarket !== "ALL" && inferMarket(t.instrument) !== filterMarket) return false;
    if (filterSession !== "ALL" && t.session !== filterSession) return false;
    return true;
  }), [trades, filterDir, filterMarket, filterSession]);

  const statsBase = filteredMonthTrades;
  const monthPnL = statsBase.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
  const winners = statsBase.filter(t => (t.net_pnl ?? 0) > 0).length;
  const winRate = statsBase.length > 0 ? Math.round((winners / statsBase.length) * 100) : null;
  const bestTrade = statsBase.length > 0 ? Math.max(...statsBase.map(t => t.net_pnl ?? 0)) : null;
  const worstTrade = statsBase.length > 0 ? Math.min(...statsBase.map(t => t.net_pnl ?? 0)) : null;
  const hasActiveFilter = filterDir !== "ALL" || filterMarket !== "ALL" || filterSession !== "ALL";

  const totalDays = daysInMonth(year, month);
  const startOffset = firstDayOfMonth(year, month);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Journal" />

      <div className="flex-1 flex overflow-hidden">
        {/* ── Calendar ─────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-surface-2 text-text-secondary transition-colors">
                <ChevronLeft className="size-4" />
              </button>
              <h2 className="text-base font-semibold text-text-primary w-44 text-center">
                {MONTHS[month]} {year}
              </h2>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-surface-2 text-text-secondary transition-colors">
                <ChevronRight className="size-4" />
              </button>
            </div>

            <button
              onClick={() => router.push("/journal/new")}
              className="btn-action flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs"
            >
              <Plus className="size-3.5" />
              Register trade
            </button>
          </div>

          {/* Stats row */}
          <div className="relative mb-6">
            <div className="flex items-center gap-2 bg-surface border border-border rounded-2xl px-5 py-3 overflow-x-auto">
              {[
                {
                  label: "Net P&L",
                  value: statsBase.length > 0 ? `${monthPnL >= 0 ? "+" : "-"}$${Math.abs(monthPnL).toFixed(2)}` : "—",
                  color: statsBase.length > 0 ? (monthPnL >= 0 ? "text-profit" : "text-loss") : "text-text-disabled",
                },
                {
                  label: "Win Rate",
                  value: winRate !== null ? `${winRate}%` : "—",
                  color: "text-text-primary",
                },
                {
                  label: "Trades",
                  value: statsBase.length > 0 ? String(statsBase.length) : "—",
                  color: "text-text-primary",
                },
                {
                  label: "Best Trade",
                  value: bestTrade !== null ? `${bestTrade >= 0 ? "+" : "-"}$${Math.abs(bestTrade).toFixed(2)}` : "—",
                  color: bestTrade !== null && bestTrade >= 0 ? "text-profit" : "text-text-disabled",
                },
                {
                  label: "Worst Trade",
                  value: worstTrade !== null ? `${worstTrade >= 0 ? "+" : "-"}$${Math.abs(worstTrade).toFixed(2)}` : "—",
                  color: worstTrade !== null && worstTrade < 0 ? "text-loss" : "text-text-disabled",
                },
              ].map(({ label, value, color }, i) => (
                <div key={label} className={cn("flex flex-col px-4 shrink-0", i > 0 && "border-l border-border")}>
                  <span className="text-[10px] text-text-disabled uppercase tracking-wide">{label}</span>
                  <span className={cn("text-sm font-mono font-semibold", color)}>{value}</span>
                </div>
              ))}
              <button
                onClick={() => setFilterOpen(o => !o)}
                className={cn(
                  "ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors shrink-0",
                  hasActiveFilter
                    ? "border-accent/40 bg-accent-soft text-accent"
                    : "border-border-light text-text-secondary hover:bg-surface-2"
                )}
              >
                <SlidersHorizontal className="size-3.5" />
                Filters{hasActiveFilter && " •"}
              </button>
            </div>

            {/* Filter dropdown */}
            {filterOpen && (
              <div className="absolute top-full right-0 mt-2 bg-surface border border-border rounded-2xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] z-20 w-72 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-text-primary uppercase tracking-wider">Filters</p>
                  <button onClick={() => setFilterOpen(false)} className="p-1 text-text-disabled hover:text-text-primary transition-colors">
                    <X className="size-3.5" />
                  </button>
                </div>

                {/* Direction */}
                <div className="space-y-1.5">
                  <p className="text-[10px] text-text-muted uppercase tracking-wide">Direction</p>
                  <div className="flex gap-1.5">
                    {(["ALL","LONG","SHORT"] as const).map(v => (
                      <button key={v} onClick={() => setFilterDir(v)}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition-colors",
                          filterDir === v
                            ? v === "LONG" ? "bg-profit/15 border-profit/40 text-profit"
                              : v === "SHORT" ? "bg-loss/15 border-loss/40 text-loss"
                              : "bg-accent-soft border-accent/40 text-accent"
                            : "bg-surface-hi border-border-light text-text-disabled hover:text-text-secondary"
                        )}
                      >{v}</button>
                    ))}
                  </div>
                </div>

                {/* Market */}
                <div className="space-y-1.5">
                  <p className="text-[10px] text-text-muted uppercase tracking-wide">Market</p>
                  <div className="flex gap-1.5">
                    {(["ALL","FOREX","METALS","INDICES"] as const).map(v => (
                      <button key={v} onClick={() => setFilterMarket(v)}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition-colors",
                          filterMarket === v
                            ? "bg-accent-soft border-accent/40 text-accent"
                            : "bg-surface-hi border-border-light text-text-disabled hover:text-text-secondary"
                        )}
                      >{v === "ALL" ? "All" : v}</button>
                    ))}
                  </div>
                </div>

                {/* Session */}
                <div className="space-y-1.5">
                  <p className="text-[10px] text-text-muted uppercase tracking-wide">Session</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      { v: "ALL", label: "All" },
                      { v: "LONDON", label: "London" },
                      { v: "NEW_YORK", label: "New York" },
                      { v: "OVERLAP", label: "Overlap" },
                      { v: "TOKYO", label: "Tokyo" },
                    ] as const).map(({ v, label }) => (
                      <button key={v} onClick={() => setFilterSession(v)}
                        className={cn(
                          "py-1.5 rounded-lg text-[11px] font-medium border transition-colors",
                          filterSession === v
                            ? "bg-accent-soft border-accent/40 text-accent"
                            : "bg-surface-hi border-border-light text-text-disabled hover:text-text-secondary"
                        )}
                      >{label}</button>
                    ))}
                  </div>
                </div>

                {hasActiveFilter && (
                  <button
                    onClick={() => { setFilterDir("ALL"); setFilterMarket("ALL"); setFilterSession("ALL"); }}
                    className="w-full text-xs text-text-secondary hover:text-accent transition-colors py-1.5 border border-border-light rounded-lg"
                  >
                    Reset filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[11px] text-text-disabled py-2 font-medium">{d}</div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: startOffset }).map((_, i) => <div key={`e${i}`} />)}

            {Array.from({ length: totalDays }).map((_, i) => {
              const day = i + 1;
              const dayTrades = byDay[day] ?? [];
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              const isSelected = day === selectedDay;
              const dayPnL = dayTrades.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
              const isProfitDay = dayTrades.length > 0 && dayPnL > 0;
              const isLossDay = dayTrades.length > 0 && dayPnL < 0;

              return (
                <div
                  key={day}
                  onClick={() => dayTrades.length > 0 ? setSelectedDay(isSelected ? null : day) : undefined}
                  className={cn(
                    "min-h-[88px] rounded-xl p-2.5 border transition-colors",
                    dayTrades.length > 0 && "cursor-pointer",
                    isSelected
                      ? "border-accent/50 bg-accent-glow"
                      : isProfitDay
                        ? "border-profit/20 bg-profit/5 hover:border-profit/40"
                        : isLossDay
                          ? "border-loss/20 bg-loss/5 hover:border-loss/40"
                          : isToday
                            ? "border-accent/20 bg-surface"
                            : "border-transparent bg-surface/60 hover:border-border"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <span className={cn(
                      "text-xs font-medium leading-none",
                      isToday ? "text-accent" : "text-text-secondary"
                    )}>
                      {day}
                    </span>
                    {dayTrades.length > 0 && (
                      <span className={cn(
                        "text-[10px] font-mono font-semibold leading-none",
                        dayPnL >= 0 ? "text-profit" : "text-loss"
                      )}>
                        {dayPnL >= 0 ? "+" : ""}{dayPnL.toFixed(0)}
                      </span>
                    )}
                  </div>

                  {dayTrades.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {dayTrades.slice(0, 3).map(t => (
                        <div key={t.id} className="flex items-center gap-1">
                          <div className={cn(
                            "size-1.5 rounded-full shrink-0",
                            (t.net_pnl ?? 0) > 0 ? "bg-profit" : (t.net_pnl ?? 0) < 0 ? "bg-loss" : "bg-text-disabled"
                          )} />
                          <span className="text-[10px] text-text-disabled truncate">{t.instrument}</span>
                        </div>
                      ))}
                      {dayTrades.length > 3 && (
                        <p className="text-[10px] text-text-disabled pl-2.5">+{dayTrades.length - 3}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!loading && trades.length === 0 && (
            <div className="text-center mt-10 mb-6 space-y-3">
              <p className="text-sm text-text-disabled">No trades this month</p>
              <button
                onClick={() => router.push("/journal/new")}
                className="btn-action inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm"
              >
                <Plus className="size-4" />
                Register first trade
              </button>
            </div>
          )}

          {/* ── Bottom section: monthly summary + week breakdown ── */}
          <div className="mt-8 space-y-6 pb-6">
            {userId && <MonthlyPnLBars userId={userId} />}
            <WeekBreakdownCarousel year={year} month={month} trades={trades} />
          </div>
        </div>

        {/* ── Right panel — day detail ──────────────────── */}
        <div className="w-72 border-l border-border-light bg-surface-light flex flex-col shrink-0 overflow-y-auto">
          {selectedDay && selectedTrades.length > 0 ? (
            <div className="flex flex-col h-full">
              {/* Trades list */}
              <div className="p-4 space-y-2 flex-1">
                <p className="text-[11px] font-medium text-text-secondary uppercase tracking-wider mb-3">
                  {MONTHS[month].slice(0, 3)} {selectedDay} · {selectedTrades.length} trade{selectedTrades.length !== 1 ? "s" : ""}
                </p>
                {filteredTrades.map(t => (
                  <div
                    key={t.id}
                    onClick={() => router.push(`/journal/${t.id}`)}
                    className="group bg-surface-hi border border-border-light rounded-xl p-3 cursor-pointer hover:border-accent/50 transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {t.direction === "LONG"
                          ? <TrendingUp className="size-3.5 text-profit shrink-0" />
                          : <TrendingDown className="size-3.5 text-loss shrink-0" />}
                        <span className="text-sm font-medium text-text-primary">{t.instrument}</span>
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-medium",
                          t.direction === "LONG" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"
                        )}>
                          {t.direction}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn(
                          "text-sm font-mono font-semibold",
                          (t.net_pnl ?? 0) >= 0 ? "text-profit" : "text-loss"
                        )}>
                          {(t.net_pnl ?? 0) >= 0 ? "+" : ""}{(t.net_pnl ?? 0).toFixed(2)}
                        </span>
                        <button
                          onClick={(e) => handleDelete(t.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-text-disabled hover:text-loss hover:bg-loss/10 transition-all"
                          title="Delete trade"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-text-disabled">
                      <span>{t.session?.replace("_", " ") ?? "—"}</span>
                      <span>{t.return_r != null ? `${t.return_r > 0 ? "+" : ""}${t.return_r.toFixed(2)}R` : "—"}</span>
                      <span className={t.followed_plan === true ? "text-profit" : t.followed_plan === false ? "text-loss" : ""}>
                        {t.followed_plan === true ? "✓ plan" : t.followed_plan === false ? "✗ plan" : "—"}
                      </span>
                    </div>
                  </div>
                ))}
                {filteredTrades.length === 0 && (
                  <p className="text-xs text-text-disabled text-center pt-4">No {directionFilter} trades this day</p>
                )}
              </div>

              {/* ── Trades Taken summary block ── */}
              <div className="border-t border-border-light p-4 space-y-3 shrink-0">
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Trades Taken</p>
                <div className="flex items-center gap-1.5">
                  {(["ALL", "LONG", "SHORT"] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setDirectionFilter(f)}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition-colors",
                        directionFilter === f
                          ? f === "LONG"
                            ? "bg-profit/15 border-profit/40 text-profit"
                            : f === "SHORT"
                              ? "bg-loss/15 border-loss/40 text-loss"
                              : "bg-accent-soft border-accent/40 text-accent"
                          : "bg-surface-hi border-border-light text-text-disabled hover:text-text-secondary"
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">
                    {filteredTrades.length} trade{filteredTrades.length !== 1 ? "s" : ""}
                    {directionFilter !== "ALL" && ` ${directionFilter}`}
                  </span>
                  <span className={cn(
                    "text-base font-mono font-bold",
                    filteredPnL >= 0 ? "text-profit" : "text-loss"
                  )}>
                    {filteredPnL >= 0 ? "+" : ""}{filteredPnL.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <p className="text-xs text-text-disabled leading-relaxed">
                {selectedDay ? "No trades this day" : "Select a day with trades to see them here"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
