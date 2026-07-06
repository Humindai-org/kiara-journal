"use client";

import { useState, useRef } from "react";
import { PenLine } from "lucide-react";
import { cn } from "@/lib/cn";

interface TradeCounterProps {
  used: number;
  max: number;
  onEditMax?: (val: number) => void;
}

export default function TradeCounter({ used, max, onEditMax }: TradeCounterProps) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const pct = max > 0 ? used / max : 0;
  const valueColor =
    pct >= 1 ? "text-loss" : pct >= 0.67 ? "text-warning" : "text-profit";

  // Cap dots at 10 to avoid overflow
  const dotCount = Math.min(max, 10);

  function startEdit() {
    setEditing(true);
    setInputVal(String(max));
    setTimeout(() => inputRef.current?.select(), 20);
  }

  function commitEdit() {
    const num = parseInt(inputVal, 10);
    if (!isNaN(num) && num > 0) onEditMax?.(num);
    setEditing(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-text-secondary">Trades today</p>
        <div className="flex items-center gap-1">
          <span className={cn("text-lg font-mono font-medium", valueColor)}>
            {used}
          </span>
          <span className="text-text-disabled text-xs font-normal"> / </span>
          {editing ? (
            <input
              ref={inputRef}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKey}
              className="w-10 text-sm font-mono bg-surface-2 border border-border rounded px-1 py-0.5 text-center outline-none focus:border-text-secondary"
              inputMode="numeric"
            />
          ) : (
            <>
              <span className="text-text-disabled text-xs font-normal">{max}</span>
              {onEditMax && (
                <button
                  onClick={startEdit}
                  className="text-text-disabled hover:text-text-secondary ml-1"
                  title="Edit max trades"
                >
                  <PenLine size={9} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex gap-2 items-center flex-wrap">
        {Array.from({ length: dotCount }).map((_, i) => {
          const filled = i < used;
          const dotColor = filled
            ? i < Math.floor(dotCount * 0.5)
              ? "bg-profit shadow-[0_0_6px_rgba(52,211,153,0.5)]"
              : i < Math.floor(dotCount * 0.84)
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
