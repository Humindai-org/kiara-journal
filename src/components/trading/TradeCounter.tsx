"use client";

import { cn } from "@/lib/cn";

interface TradeCounterProps {
  used: number;
  max: number;
}

export default function TradeCounter({ used, max }: TradeCounterProps) {
  const pct = max > 0 ? used / max : 0;
  const color =
    pct >= 1 ? "text-loss" : pct >= 0.67 ? "text-warning" : "text-profit";

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-text-secondary">Trades hoy</p>
        <span className={cn("text-xl font-mono font-medium", color)}>
          {used}
          <span className="text-text-disabled text-sm font-normal"> / {max}</span>
        </span>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 h-1.5 rounded-full transition-colors",
              i < used
                ? i < max * 0.67 ? "bg-profit" : i < max ? "bg-warning" : "bg-loss"
                : "bg-surface-2"
            )}
          />
        ))}
      </div>
      {used >= max && (
        <p className="text-xs text-loss mt-2">
          Límite diario alcanzado — no más trades hoy.
        </p>
      )}
    </div>
  );
}
