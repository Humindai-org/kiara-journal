"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Plus, Check } from "lucide-react";
import { cn } from "@/lib/cn";

interface InstrumentComboboxProps {
  value: string;
  onChange: (symbol: string) => void;
  options: string[];
  /** Symbols outside the known pip/lot table — shown with a caution mark. */
  isImprecise?: (symbol: string) => boolean;
}

/**
 * Searchable symbol picker: filters the account's default instrument list as
 * you type, and lets you add any symbol that isn't in it (TradingView-style
 * "type to search, or add your own"). Selecting or adding just calls
 * onChange — there's no separate "custom instruments" list to manage.
 */
export default function InstrumentCombobox({ value, onChange, options, isImprecise }: InstrumentComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const q = query.trim().toUpperCase();
  const filtered = q ? options.filter((o) => o.includes(q)) : options;
  const exactMatch = options.some((o) => o === q);
  const showAddRow = q.length >= 2 && !exactMatch;
  const rowCount = filtered.length + (showAddRow ? 1 : 0);

  function commitAt(index: number) {
    if (index < filtered.length) {
      onChange(filtered[index]);
    } else if (showAddRow) {
      onChange(q);
    } else {
      return;
    }
    setOpen(false);
    setQuery("");
  }

  function openDropdown() {
    setOpen(true);
    setHighlight(0);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  return (
    <div ref={rootRef} className="relative flex-1">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className="w-full flex items-center justify-between bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary hover:border-border-light transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <span className="font-mono">{value}</span>
        <Search className="size-3.5 text-text-secondary shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-full min-w-[220px] bg-surface-2 border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(rowCount - 1, h + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); commitAt(highlight); }
              else if (e.key === "Escape") { setOpen(false); setQuery(""); }
            }}
            placeholder="Search or type a symbol…"
            className="w-full bg-surface-hi border-b border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none font-mono"
          />
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && !showAddRow && (
              <p className="px-3 py-2 text-xs text-text-disabled">No matches</p>
            )}
            {filtered.map((opt, i) => (
              <button
                key={opt}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => commitAt(i)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 text-sm font-mono text-left transition-colors",
                  i === highlight ? "bg-surface-hi text-text-primary" : "text-text-secondary"
                )}
              >
                <span className="flex items-center gap-1.5">
                  {opt}
                  {isImprecise?.(opt) && (
                    <span title="Position size is an approximation for this symbol" className="text-warning text-[10px]">≈</span>
                  )}
                </span>
                {opt === value && <Check className="size-3.5 text-accent" />}
              </button>
            ))}
            {showAddRow && (
              <button
                type="button"
                onMouseEnter={() => setHighlight(filtered.length)}
                onClick={() => commitAt(filtered.length)}
                className={cn(
                  "w-full flex items-center gap-1.5 px-3 py-2 text-sm text-left transition-colors border-t border-border",
                  filtered.length === highlight ? "bg-surface-hi text-accent" : "text-accent/80"
                )}
              >
                <Plus className="size-3.5 shrink-0" />
                <span>Add <span className="font-mono">{q}</span></span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
