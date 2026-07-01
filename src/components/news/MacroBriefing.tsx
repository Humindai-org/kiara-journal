"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

type Ticker = { symbol: string; value: string; change: string; dir?: "up" | "down" | "flat" };
type PulseRow = { name: string; value: string; change?: string };
type SectionItem = { headline: string; tags?: string[]; body: string; link?: string };
type Section = { title: string; tag?: string; items: SectionItem[] };
type LookaheadItem = { time: string; event: string; detail?: string };

type BriefingContent = {
  regime?: string;
  tickers?: Ticker[];
  pulse?: {
    equities?: PulseRow[];
    rates?: PulseRow[];
    fx?: PulseRow[];
    commodities?: PulseRow[];
    crypto?: PulseRow[];
  };
  sections?: Section[];
  lookahead?: LookaheadItem[];
};

type BriefingResponse = {
  region: string;
  meta: { label: string; subtitle: string };
  content: BriefingContent;
  generatedAt: string;
  cached: boolean;
};

function changeColor(change?: string) {
  if (!change) return "text-text-secondary";
  if (change.trim().startsWith("-")) return "text-loss";
  if (change.trim().startsWith("+")) return "text-profit";
  return "text-text-secondary";
}

function PulseTable({ title, rows }: { title: string; rows?: PulseRow[] }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-wider text-accent mb-1.5">{title}</p>
      <div className="space-y-0.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-2 text-xs font-mono">
            <span className="text-text-secondary truncate">{r.name}</span>
            <span className="flex items-baseline gap-2 shrink-0">
              <span className="text-text-primary">{r.value}</span>
              {r.change && <span className={cn("text-[10px]", changeColor(r.change))}>{r.change}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MacroBriefing({ region }: { region: "EUROPEAN" | "AMERICAN" | "ASIAN" }) {
  const [data, setData] = useState<BriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/briefing?region=${region}${force ? "&force=1" : ""}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Error generating the briefing"); setData(null); }
      else setData(json);
    } catch {
      setError("Could not load the briefing");
    } finally {
      setLoading(false);
    }
  }, [region]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center gap-3 text-text-disabled">
        <RefreshCw className="size-5 animate-spin text-accent" />
        <p className="text-sm">Loading live market data…</p>
        <p className="text-[11px]">Quotes, calendar, and headlines</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-8 text-center space-y-3">
        <AlertTriangle className="size-6 text-loss mx-auto" />
        <p className="text-sm text-loss">{error}</p>
        <button onClick={() => load(true)} className="btn-action inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs">
          <RefreshCw className="size-3.5" /> Retry
        </button>
      </div>
    );
  }

  if (!data) return null;
  const c = data.content;

  return (
    <div className="space-y-3">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="card-light overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-light">
          <div className="flex items-baseline gap-3">
            <span className="text-base font-mono font-bold tracking-tight text-text-primary uppercase">Market Macro Hub</span>
            <span className="text-[11px] font-mono uppercase tracking-wider text-text-secondary hidden sm:inline">{data.meta.subtitle}</span>
          </div>
          <div className="flex items-center gap-3">
            {c.regime && (
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded bg-warning/15 text-warning border border-warning/30">
                {c.regime}
              </span>
            )}
            <button onClick={() => load(true)} className="text-text-disabled hover:text-accent transition-colors" title="Regenerar briefing">
              <RefreshCw className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Ticker strip */}
        {c.tickers && c.tickers.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 text-[11px] font-mono">
            {c.tickers.map((t, i) => (
              <span key={i} className="flex items-baseline gap-1.5">
                <span className="text-text-secondary">{t.symbol}</span>
                <span className="text-text-primary">{t.value}</span>
                <span className={changeColor(t.change)}>{t.change}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Market Pulse + Lookahead ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Market Pulse tables */}
        <div className="card p-4">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">Market Pulse</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <PulseTable title="Equities" rows={c.pulse?.equities} />
            <PulseTable title="Rates" rows={c.pulse?.rates} />
            <PulseTable title="FX" rows={c.pulse?.fx} />
            <PulseTable title="Commodities" rows={c.pulse?.commodities} />
            <PulseTable title="Crypto" rows={c.pulse?.crypto} />
          </div>
        </div>

        {/* Lookahead — today's calendar */}
        <div className="card p-4 lg:col-span-2">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">Looking Ahead · Today&apos;s Calendar</p>
          {c.lookahead && c.lookahead.length > 0 ? (
            <div className="space-y-2">
              {c.lookahead.map((l, i) => (
                <div key={i} className="flex items-start gap-3 text-xs">
                  <span className="font-mono text-accent w-12 shrink-0 flex items-center gap-1">
                    <Clock className="size-3 text-text-disabled" />{l.time}
                  </span>
                  <div className="min-w-0">
                    <span className="text-text-primary font-medium">{l.event}</span>
                    {l.detail && <span className="text-text-disabled"> — {l.detail}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-disabled">No key events today.</p>
          )}
        </div>
      </div>

      {/* ── Sections ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {(c.sections ?? []).map((s, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-surface-2 border-b border-border">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-accent">{s.title}</span>
              {s.tag && (
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-accent/15 text-accent">{s.tag}</span>
              )}
            </div>
            <div className="divide-y divide-border/50">
              {s.items.map((it, j) => (
                <div key={j} className="px-4 py-3 space-y-1.5">
                  {it.link ? (
                    <a href={it.link} target="_blank" rel="noopener noreferrer"
                      className="text-sm font-medium text-text-primary leading-snug hover:text-accent transition-colors block">
                      {it.headline}
                    </a>
                  ) : (
                    <p className="text-sm font-medium text-text-primary leading-snug">{it.headline}</p>
                  )}
                  {it.tags && it.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {it.tags.map((tg, k) => (
                        <span key={k} className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-surface-2 text-text-secondary border border-border">{tg}</span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-text-secondary leading-relaxed">{it.body}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <p className="text-[10px] text-text-disabled text-center pb-2">
        Live data · Yahoo Finance, Forex Factory, Google News ·{" "}
        {new Date(data.generatedAt).toLocaleString("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        {" "}· For informational purposes only, not financial advice
      </p>
    </div>
  );
}
