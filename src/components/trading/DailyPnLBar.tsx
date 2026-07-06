"use client";

import { useState } from "react";
import { PenLine, Check, X } from "lucide-react";
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
  const [editMode, setEditMode] = useState(false);
  const [draftLoss, setDraftLoss] = useState("");
  const [draftProfit, setDraftProfit] = useState("");

  const absMax = Math.abs(maxLoss);
  const effectiveProfit = maxProfit ?? 500;
  const lossPct = Math.min(Math.max(pnl < 0 ? Math.abs(pnl) / absMax : 0, 0), 1);
  const profitPct = Math.min(Math.max(pnl > 0 ? pnl / effectiveProfit : 0, 0), 1);

  const lossColor =
    lossPct >= 0.9 ? "bg-loss" : lossPct >= 0.6 ? "bg-warning" : "bg-profit";

  const canEdit = !!(onEditMaxLoss || onEditMaxProfit);

  function enterEdit() {
    setDraftLoss(String(Math.round(absMax)));
    setDraftProfit(String(Math.round(effectiveProfit)));
    setEditMode(true);
  }

  function saveEdit() {
    const lossVal = parseFloat(draftLoss);
    const profitVal = parseFloat(draftProfit);
    if (!isNaN(lossVal) && lossVal > 0) onEditMaxLoss?.(lossVal);
    if (!isNaN(profitVal) && profitVal > 0) onEditMaxProfit?.(profitVal);
    setEditMode(false);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") setEditMode(false);
  }

  return (
    <div className="card p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-secondary">Daily P&L</p>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-sm font-mono font-medium",
            pnl > 0 ? "text-profit" : pnl < 0 ? "text-loss" : "text-text-disabled"
          )}>
            {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
          </span>
          {canEdit && (
            editMode ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={saveEdit}
                  className="text-profit hover:opacity-80"
                  title="Save"
                >
                  <Check size={12} />
                </button>
                <button
                  onClick={() => setEditMode(false)}
                  className="text-text-disabled hover:text-text-secondary"
                  title="Cancel"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={enterEdit}
                className="text-text-disabled hover:text-text-secondary"
                title="Edit limits"
              >
                <PenLine size={11} />
              </button>
            )
          )}
        </div>
      </div>

      {/* Loss bar */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] text-text-disabled">Max loss</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono text-text-secondary">
              ${Math.abs(pnl < 0 ? pnl : 0).toFixed(0)} /
            </span>
            {editMode ? (
              <input
                value={draftLoss}
                onChange={(e) => setDraftLoss(e.target.value)}
                onKeyDown={handleKey}
                autoFocus
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
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] text-text-disabled">Daily target</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono text-text-secondary">
              ${pnl > 0 ? pnl.toFixed(0) : 0} /
            </span>
            {editMode ? (
              <input
                value={draftProfit}
                onChange={(e) => setDraftProfit(e.target.value)}
                onKeyDown={handleKey}
                className="w-14 text-[10px] font-mono bg-surface-2 border border-border rounded px-1 py-0.5 text-right outline-none focus:border-text-secondary"
                inputMode="numeric"
              />
            ) : (
              <span className="text-[10px] font-mono text-text-secondary">${effectiveProfit}</span>
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
