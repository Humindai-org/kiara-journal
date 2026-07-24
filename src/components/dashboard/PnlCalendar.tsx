"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/cn";

type CalTrade = { open_time: string; net_pnl: number | null };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dayKey(y: number, m: number, d: number) {
  return `${y}-${m}-${d}`;
}

/**
 * Monthly P&L calendar. Each day cell is tinted by that day's net P&L —
 * green for a winning day, red for a losing one, intensity scaled to the
 * biggest day of the visible month. Pure presentation: it derives everything
 * from the trades it's handed, so it stays in sync with the rest of the
 * dashboard (same account-scoped list).
 */
export default function PnlCalendar({ trades }: { trades: CalTrade[] }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11

  const { cells, monthTotal, tradingDays, maxAbs } = useMemo(() => {
    // Sum net P&L per calendar day for the visible month.
    const byDay = new Map<string, { pnl: number; count: number }>();
    for (const t of trades) {
      const d = new Date(t.open_time);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const key = dayKey(d.getFullYear(), d.getMonth(), d.getDate());
      const bucket = byDay.get(key) ?? { pnl: 0, count: 0 };
      bucket.pnl += t.net_pnl ?? 0;
      bucket.count += 1;
      byDay.set(key, bucket);
    }

    const firstDow = new Date(year, month, 1).getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const maxAbs = Math.max(1, ...[...byDay.values()].map((b) => Math.abs(b.pnl)));

    // Leading blanks so day 1 lands under its weekday, then one cell per day.
    const cells: ({ day: number; pnl: number; count: number } | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const bucket = byDay.get(dayKey(year, month, d));
      cells.push({ day: d, pnl: bucket?.pnl ?? 0, count: bucket?.count ?? 0 });
    }

    const monthTotal = [...byDay.values()].reduce((s, b) => s + b.pnl, 0);
    return { cells, monthTotal, tradingDays: byDay.size, maxAbs };
  }, [trades, year, month]);

  function prev() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function next() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }
  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-accent" />
          <p className="text-sm font-medium text-text-primary">Calendar</p>
          {tradingDays > 0 && (
            <span className={cn(
              "text-[11px] font-mono ml-1",
              monthTotal >= 0 ? "text-profit" : "text-loss"
            )}>
              {monthTotal >= 0 ? "+" : "-"}${Math.abs(monthTotal).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-text-disabled ml-1.5">· {tradingDays} day{tradingDays !== 1 ? "s" : ""}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={goToday}
            className="text-[11px] text-accent hover:text-accent-dim px-2 py-1 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            Today
          </button>
          <button onClick={prev} aria-label="Previous month" className="size-6 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors">
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-xs font-medium text-text-primary w-28 text-center tabular-nums">
            {MONTHS[month]} {year}
          </span>
          <button onClick={next} aria-label="Next month" className="size-6 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[10px] text-text-disabled text-center pb-1 font-medium">{w}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={`b${i}`} />;
          const isToday = isCurrentMonth && cell.day === today.getDate();
          const hasTrades = cell.count > 0;
          // Opacity floors at 0.18 so a small winning day is still visibly tinted.
          const intensity = hasTrades ? 0.18 + 0.42 * (Math.abs(cell.pnl) / maxAbs) : 0;
          const bg = !hasTrades
            ? undefined
            : cell.pnl >= 0
            ? `rgba(68,228,178,${intensity})`
            : `rgba(255,107,138,${intensity})`;
          return (
            <div
              key={cell.day}
              style={bg ? { backgroundColor: bg } : undefined}
              className={cn(
                "aspect-square rounded-md flex flex-col items-center justify-center px-1 py-1 min-h-[42px]",
                !hasTrades && "bg-surface-2/40",
                isToday && "ring-1 ring-accent",
              )}
              title={hasTrades
                ? `${cell.count} trade${cell.count !== 1 ? "s" : ""} · ${cell.pnl >= 0 ? "+" : "-"}$${Math.abs(cell.pnl).toFixed(2)}`
                : undefined}
            >
              <span className={cn(
                "text-[11px] leading-none",
                hasTrades ? "text-text-primary font-medium" : "text-text-disabled",
              )}>
                {cell.day}
              </span>
              {hasTrades && (
                <span className={cn(
                  "text-[9px] font-mono leading-none mt-1 tabular-nums",
                  cell.pnl >= 0 ? "text-profit" : "text-loss",
                )}>
                  {cell.pnl >= 0 ? "+" : "-"}{Math.abs(cell.pnl) >= 1000
                    ? `${(Math.abs(cell.pnl) / 1000).toFixed(1)}k`
                    : Math.abs(cell.pnl).toFixed(0)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
