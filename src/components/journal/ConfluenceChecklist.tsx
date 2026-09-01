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

export interface ChecklistItem {
  id: string;
  label: string;
}

interface ConfluenceChecklistProps {
  selected: string[];
  onChange: (selected: string[]) => void;
  readonly?: boolean;
  // When omitted, falls back to the generic CONFLUENCE_ITEMS list keyed by
  // label (today's behavior — used when the trade has no plan linked).
  // When provided, renders the linked plan's own rules instead, keyed by id.
  items?: ChecklistItem[];
  emptyLabel?: string;
  // "grid" (default): 2-3 column grid with truncated labels — for wide
  // layouts like the trade review page, where labels are short-ish.
  // "list": single column, labels wrap instead of truncating — for narrow
  // sidebars (e.g. the pre-trade order form) where a real plan rule's full
  // text needs to stay readable.
  layout?: "grid" | "list";
}

export default function ConfluenceChecklist({ selected, onChange, readonly, items, emptyLabel, layout = "grid" }: ConfluenceChecklistProps) {
  const options: ChecklistItem[] = items ?? CONFLUENCE_ITEMS.map(label => ({ id: label, label }));
  const isList = layout === "list";

  function toggle(id: string) {
    if (readonly) return;
    onChange(
      selected.includes(id)
        ? selected.filter(i => i !== id)
        : [...selected, id]
    );
  }

  if (options.length === 0) {
    return <p className="text-xs text-text-disabled py-2">{emptyLabel ?? "No rules defined for this plan yet."}</p>;
  }

  return (
    <div>
      <div className={isList ? "flex flex-col gap-1.5" : "grid grid-cols-2 sm:grid-cols-3 gap-2"}>
        {options.map(({ id, label }) => {
          const isSelected = selected.includes(id);
          return (
            <button
              key={id}
              type="button"
              disabled={readonly}
              onClick={() => toggle(id)}
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
                "text-xs",
                isList ? "leading-snug" : "truncate",
                isSelected ? "text-text-primary" : "text-text-secondary"
              )}>
                {label}
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
