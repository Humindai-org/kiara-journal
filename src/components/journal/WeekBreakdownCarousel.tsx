"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type Trade = {
  id: string;
  open_time: string;
  net_pnl: number | null;
  return_r: number | null;
  followed_plan: boolean | null;
};

interface WeekBreakdownCarouselProps {
  year: number;
  month: number; // 0–11
  trades: Trade[];
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

export default function WeekBreakdownCarousel({ year, month, trades }: WeekBreakdownCarouselProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [violationsByWeek, setViolationsByWeek] = useState<Record<number, number>>({});

  const totalDays = daysInMonth(year, month);

  // Week 1 = days 1–7, Week 2 = 8–14, Week 3 = 15–21, Week 4 = 22–end
  const weeks = useMemo(() => {
    return [1, 2, 3, 4].map(n => {
      const startDay = (n - 1) * 7 + 1;
      const endDay = n === 4 ? totalDays : Math.min(n * 7, totalDays);
      const weekTrades = trades.filter(t => {
        const d = new Date(t.open_time);
        const day = d.getDate();
        return day >= startDay && day <= endDay;
      });
      const pnl = weekTrades.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
      const winners = weekTrades.filter(t => (t.net_pnl ?? 0) > 0).length;
      return {
        num: n,
        startDay,
        endDay,
        trades: weekTrades,
        pnl,
        winRate: weekTrades.length > 0 ? Math.round((winners / weekTrades.length) * 100) : null,
      };
    });
  }, [trades, totalDays]);

  useEffect(() => {
    const fromDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const toDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(totalDays).padStart(2, "0")}`;
    supabase
      .from("discipline_violations")
      .select("date")
      .gte("date", fromDate)
      .lte("date", toDate)
      .then(({ data }) => {
        const byWeek: Record<number, number> = {};
        for (const v of (data as { date: string }[] | null) ?? []) {
          const day = parseInt(v.date.slice(8, 10), 10);
          const wk = day >= 22 ? 4 : Math.ceil(day / 7);
          byWeek[wk] = (byWeek[wk] ?? 0) + 1;
        }
        setViolationsByWeek(byWeek);
      });
  }, [supabase, year, month, totalDays]);

  const monthTag = `${year}-${String(month + 1).padStart(2, "0")}`;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">Week Breakdown</h3>
        <span className="text-xs text-text-disabled">{MONTHS[month]} {year}</span>
      </div>

      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1">
        {weeks.map(w => {
          const violations = violationsByWeek[w.num] ?? 0;
          const hasTrades = w.trades.length > 0;
          return (
            <div
              key={w.num}
              onClick={() => router.push(`/journal/report/${monthTag}-W${w.num}`)}
              className="min-w-[220px] flex-1 bg-surface border border-border rounded-2xl p-4 snap-start cursor-pointer hover:border-accent/50 transition-colors group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-muted uppercase tracking-wider font-medium">
                  Week {w.num}
                </span>
                <ChevronRight className="size-3.5 text-text-disabled group-hover:text-accent transition-colors" />
              </div>
              <p className="text-sm text-text-secondary mb-3">
                {MONTHS_SHORT[month]} {w.startDay}–{w.endDay}
              </p>

              {hasTrades ? (
                <>
                  <p className={cn(
                    "text-2xl font-mono font-bold tabular-nums",
                    w.pnl >= 0 ? "text-profit" : "text-loss"
                  )}>
                    {w.pnl >= 0 ? "+" : "-"}${Math.abs(w.pnl).toFixed(2)}
                  </p>
                  <p className="text-xs text-text-disabled mt-1.5">
                    {w.trades.length} trade{w.trades.length !== 1 ? "s" : ""} · {w.winRate}% win
                  </p>
                </>
              ) : (
                <p className="text-sm text-text-disabled py-2">No trades</p>
              )}

              {violations > 0 && (
                <p className="flex items-center gap-1 text-warning text-xs mt-2">
                  <AlertTriangle className="size-3" />
                  {violations} violation{violations !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
