"use client";

import { useState, useRef } from "react";
import { PenLine } from "lucide-react";
import { cn } from "@/lib/cn";

interface DailyPnLBarProps {
  pnl: number;
  maxLoss: number;       // e.g. -300
  maxProfit?: number;    // e.g. 500
  onEditMaxLoss?: (val: number) => void;
  onEditMaxProfit?: (val: number) => void;
}

export default function DailyPnLBar({
  pnl,
  maxLoss,
  maxProfit,
  onEditMaxLoss,
  onEditMaxProfit,
}: DailyPnLBarProps) {
  const [editing, setEditing] = useState<"loss" | "profit" | null>(null);
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const absMax = Math.abs(maxLoss);
  const lossPct = Math.min(Math.max(pnl < 0 ? Math.abs(pnl) / absMax : 0, 0), 1);
  const profitPct = maxProfit ? Math.min(Math.max(pnl > 0 ? pnl / maxProfit : 0, 0), 1) : 0;

  const lossColor =
    lossPct >= 0.9 ? "bg-loss" : lossPct >= 0.6 ? "bg-warning" : "bg-profit";

  function startEdit(field: "loss" | "profit") {
    const current = field === "loss" ? absMax : (maxProfit ?? 500);
    setEditing(field);
    setInputVal(String(Math.round(current)));
    setTimeout(() => inputRef.current?.select(), 20);
  }

  function commitEdit() {
    const num = parseFloat(inputVal);
    if (!isNaN(num) && num > 0) {
      if (editing === "loss") onEditMaxLoss?.(num);
      else if (editing === "profit") onEditMaxProfit?.(num);
    }
    setEditing(null);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    if (e.key === "Escape") setEditing(null);
  }

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-secondary">Daily P&L</p>
        <span className={cn(
          "text-sm font-mono font-medium",
          pnl > 0 ? "text-profit" : pnl < 0 ? "text-loss" : "text-text-disabled"
        )}>
          {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
        </span>
      </div>

      {/* Loss bar */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-text-disabled">Max loss</span>
            {onEditMaxLoss && editing !== "loss" && (
              <button
                onClick={() => startEdit("loss")}
                className="text-text-disabled hover:text-text-secondary"
                title="Edit max loss"
              >
                <PenLine size={9} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono text-text-secondary">
              ${Math.abs(pnl < 0 ? pnl : 0).toFixed(0)} /
            </span>
            {editing === "loss" ? (
              <input
                ref={inputRef}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleKey}
                className="w-14 text-[10px] font-mono bg-surface-2 border border-border rounded px-1 py-0.5 text-right outline-none focus:border-text-secondary"
                inputMode="numeric"
              />
            ) : (
              <span className="text-[10px] font-mono text-text-secondary">${absMax}</span>
            )}
          </div>
        </div>
        <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500", lossColor)}
            style={{ width: `${lossPct * 100}%` }}
          />
        </div>
      </div>

      {/* Profit bar */}
      {(maxProfit != null || onEditMaxProfit) && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-disabled">Daily target</span>
              {onEditMaxProfit && editing !== "profit" && (
                <button
                  onClick={() => startEdit("profit")}
                  className="text-text-disabled hover:text-text-secondary"
                  title="Edit daily target"
                >
                  <PenLine size={9} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono text-text-secondary">
                ${pnl > 0 ? pnl.toFixed(0) : 0} /
              </span>
              {editing === "profit" ? (
                <input
                  ref={inputRef}
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleKey}
                  className="w-14 text-[10px] font-mono bg-surface-2 border border-border rounded px-1 py-0.5 text-right outline-none focus:border-text-secondary"
                  inputMode="numeric"
                />
              ) : (
                <span className="text-[10px] font-mono text-text-secondary">${maxProfit ?? 0}</span>
              )}
            </div>
          </div>
          <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-profit transition-all duration-500"
              style={{ width: `${profitPct * 100}%` }}
            />
          </div>
        </div>
      )}

      {lossPct >= 0.6 && pnl < 0 && (
        <p className={cn(
          "text-[10px] font-medium",
          lossPct >= 0.9 ? "text-loss" : "text-warning"
        )}>
          {lossPct >= 0.9
            ? "⛔ Near daily stop — close the platform"
            : "⚠ More than 60% of daily DD consumed"}
        </p>
      )}
    </div>
  );
}
