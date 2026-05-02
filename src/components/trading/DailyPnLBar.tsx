"use client";

import { cn } from "@/lib/cn";

interface DailyPnLBarProps {
  pnl: number;
  maxLoss: number;       // e.g. -300
  maxProfit?: number;    // e.g. 500
}

export default function DailyPnLBar({
  pnl,
  maxLoss,
  maxProfit,
}: DailyPnLBarProps) {
  const absMax = Math.abs(maxLoss);
  const lossPct = Math.min(Math.max(pnl < 0 ? Math.abs(pnl) / absMax : 0, 0), 1);
  const profitPct = maxProfit ? Math.min(Math.max(pnl > 0 ? pnl / maxProfit : 0, 0), 1) : 0;

  const lossColor =
    lossPct >= 0.9 ? "bg-loss" : lossPct >= 0.6 ? "bg-warning" : "bg-profit";

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-secondary">P&L diario</p>
        <span className={cn(
          "text-sm font-mono font-medium",
          pnl > 0 ? "text-profit" : pnl < 0 ? "text-loss" : "text-text-disabled"
        )}>
          {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
        </span>
      </div>

      {/* Loss bar */}
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-[10px] text-text-disabled">Max pérdida</span>
          <span className="text-[10px] font-mono text-text-secondary">
            ${Math.abs(pnl < 0 ? pnl : 0).toFixed(0)} / ${absMax}
          </span>
        </div>
        <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500", lossColor)}
            style={{ width: `${lossPct * 100}%` }}
          />
        </div>
      </div>

      {/* Profit bar (optional) */}
      {maxProfit && (
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-text-disabled">Objetivo día</span>
            <span className="text-[10px] font-mono text-text-secondary">
              ${pnl > 0 ? pnl.toFixed(0) : 0} / ${maxProfit}
            </span>
          </div>
          <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-profit transition-all duration-500"
              style={{ width: `${profitPct * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Warning when near limit */}
      {lossPct >= 0.6 && pnl < 0 && (
        <p className={cn(
          "text-[10px] font-medium",
          lossPct >= 0.9 ? "text-loss" : "text-warning"
        )}>
          {lossPct >= 0.9
            ? "⛔ Cerca del stop diario — cierra la plataforma"
            : "⚠ Más del 60% del DD diario consumido"}
        </p>
      )}
    </div>
  );
}
