"use client";

import { cn } from "@/lib/cn";

interface TradeCounterProps {
  used: number;
  max: number;
}

export default function TradeCounter({ used, max }: TradeCounterProps) {
  const pct = max > 0 ? used / max : 0;
  const valueColor =
    pct >= 1 ? "text-loss" : pct >= 0.67 ? "text-warning" : "text-profit";

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-text-secondary">Trades today</p>
        <span className={cn("text-lg font-mono font-medium", valueColor)}>
          {used}
          <span className="text-text-disabled text-xs font-normal"> / {max}</span>
        </span>
      </div>

      {/* Dot indicators */}
      <div className="flex gap-2 items-center">
        {Array.from({ length: max }).map((_, i) => {
          const filled = i < used;
          const dotColor = filled
            ? i < Math.floor(max * 0.5)
              ? "bg-profit shadow-[0_0_6px_rgba(52,211,153,0.5)]"
              : i < Math.floor(max * 0.84)
              ? "bg-warning shadow-[0_0_6px_rgba(251,191,36,0.5)]"
              : "bg-loss shadow-[0_0_6px_rgba(248,113,113,0.5)]"
            : "bg-surface-2 border border-border";
          return (
            <div
              key={i}
              className={cn("size-3 rounded-full transition-all duration-300", dotColor)}
            />
          );
        })}
        {used >= max && (
          <span className="text-xs text-loss ml-1">stop</span>
        )}
      </div>
    </div>
  );
}
