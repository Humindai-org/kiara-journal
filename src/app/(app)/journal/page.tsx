"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, TrendingUp, TrendingDown, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import TopBar from "@/components/layout/TopBar";
import { createClient } from "@/lib/supabase/client";

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

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

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
    if (!confirm("¿Eliminar este trade? Esta acción no se puede deshacer.")) return;
    const { error } = await db.from("trades").delete().eq("id", id);
    if (error) { toast.error("Error al eliminar"); return; }
    setTrades(prev => prev.filter(t => t.id !== id));
    toast.success("Trade eliminado");
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
  const monthPnL = trades.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
  const winners = trades.filter(t => (t.net_pnl ?? 0) > 0).length;
  const winRate = trades.length > 0 ? Math.round((winners / trades.length) * 100) : null;

  const totalDays = daysInMonth(year, month);
  const startOffset = firstDayOfMonth(year, month);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Journal" />

      <div className="flex-1 flex overflow-hidden">
        {/* ── Calendar ─────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
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

              {trades.length > 0 && (
                <div className="flex items-center gap-4 ml-4 pl-4 border-l border-border">
                  <span className={cn("text-sm font-mono font-medium", monthPnL >= 0 ? "text-profit" : "text-loss")}>
                    {monthPnL >= 0 ? "+" : ""}{monthPnL.toFixed(2)} USD
                  </span>
                  <span className="text-xs text-text-disabled">{trades.length} trades</span>
                  {winRate !== null && (
                    <span className="text-xs text-text-disabled">{winRate}% win rate</span>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => router.push("/journal/new")}
              className="btn-action flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs"
            >
              <Plus className="size-3.5" />
              Registrar trade
            </button>
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
            <div className="text-center mt-16 space-y-3">
              <p className="text-sm text-text-disabled">Sin trades este mes</p>
              <button
                onClick={() => router.push("/journal/new")}
                className="btn-action inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm"
              >
                <Plus className="size-4" />
                Registrar primer trade
              </button>
            </div>
          )}
        </div>

        {/* ── Right panel — day detail ──────────────────── */}
        <div className="w-72 border-l border-border-light bg-surface-light flex flex-col shrink-0 overflow-y-auto">
          {selectedDay && selectedTrades.length > 0 ? (
            <div className="p-4 space-y-2">
              <p className="text-[11px] font-medium text-text-secondary uppercase tracking-wider mb-3">
                {MONTHS[month].slice(0, 3)} {selectedDay} · {selectedTrades.length} trade{selectedTrades.length !== 1 ? "s" : ""}
              </p>
              {selectedTrades.map(t => (
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
                        title="Eliminar trade"
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
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <p className="text-xs text-text-disabled leading-relaxed">
                {selectedDay ? "Sin trades este día" : "Seleccioná un día con trades para verlos aquí"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
