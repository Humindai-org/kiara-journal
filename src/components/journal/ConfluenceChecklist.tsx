"use client";

import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

export const CONFLUENCE_ITEMS = [
  "Market Structure",
  "Liquidity",
  "Order Block",
  "FVG",
  "Imbalance",
  "Trendline",
  "Moving Average",
  "HTF Bias",
  "News Catalyst",
  "Session Timing",
  "Others",
];

interface ConfluenceChecklistProps {
  selected: string[];
  onChange: (selected: string[]) => void;
  readonly?: boolean;
}

export default function ConfluenceChecklist({ selected, onChange, readonly }: ConfluenceChecklistProps) {
  function toggle(item: string) {
    if (readonly) return;
    onChange(
      selected.includes(item)
        ? selected.filter(i => i !== item)
        : [...selected, item]
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {CONFLUENCE_ITEMS.map(item => {
          const isSelected = selected.includes(item);
          return (
            <button
              key={item}
              type="button"
              disabled={readonly}
              onClick={() => toggle(item)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-2 text-left border transition-colors",
                isSelected
                  ? "border-accent/40 bg-accent-glow"
                  : "border-border bg-surface-hi",
                !readonly && "cursor-pointer hover:bg-surface-hover"
              )}
            >
              <span
                className={cn(
                  "size-4 rounded flex items-center justify-center shrink-0 border transition-colors",
                  isSelected
                    ? "bg-accent border-accent"
                    : "border-border-light bg-transparent"
                )}
              >
                {isSelected && <Check className="size-3 text-white" strokeWidth={3} />}
              </span>
              <span className={cn(
                "text-xs truncate",
                isSelected ? "text-text-primary" : "text-text-secondary"
              )}>
                {item}
              </span>
            </button>
          );
        })}
      </div>
      {!readonly && (
        <button
          type="button"
          className="mt-3 flex items-center gap-1 text-accent text-sm hover:text-action-hover transition-colors"
        >
          <Plus className="size-3.5" />
          Add note
        </button>
      )}
    </div>
  );
}
