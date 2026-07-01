"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { RefreshCw, AlertOctagon, Clock, CalendarDays, Filter, CalendarRange, Sunrise, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/cn";
import TopBar from "@/components/layout/TopBar";
import MacroBriefing from "@/components/news/MacroBriefing";
import type { NewsEvent } from "@/app/api/news/route";

type View = "CALENDAR" | "EUROPEAN" | "AMERICAN" | "ASIAN";
const VIEW_TABS: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "CALENDAR", label: "Calendar", icon: CalendarRange },
  { id: "EUROPEAN", label: "European Open", icon: Sunrise },
  { id: "AMERICAN", label: "American", icon: Sun },
  { id: "ASIAN", label: "Asian", icon: Moon },
];

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"];
const IMPACT_META: Record<NewsEvent["impact"], { label: string; dot: string; badge: string }> = {
  HIGH:    { label: "High",    dot: "bg-loss",    badge: "bg-loss/15 text-loss border-loss/30" },
  MEDIUM:  { label: "Medium",  dot: "bg-warning", badge: "bg-warning/15 text-warning border-warning/30" },
  LOW:     { label: "Low",     dot: "bg-info",    badge: "bg-info/15 text-info border-info/30" },
  HOLIDAY: { label: "Holiday", dot: "bg-text-disabled", badge: "bg-surface-2 text-text-disabled border-border" },
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long" });
}
function isToday(iso: string) {
  const d = new Date(iso); const n = new Date();
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}

// Parse a calendar number (handles %, K/M/B/T suffixes, commas) for comparison.
function parseNum(s: string): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/(-?\d+(?:\.\d+)?)\s*([KMBT%]?)/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const suf = m[2].toUpperCase();
  if (suf === "K") n *= 1e3;
  else if (suf === "M") n *= 1e6;
  else if (suf === "B") n *= 1e9;
  else if (suf === "T") n *= 1e12;
  return n;
}

// Green if actual beats forecast, red if it misses, neutral if equal/unknown.
function actualColor(actual: string, forecast: string): string {
  const a = parseNum(actual), f = parseNum(forecast);
  if (a == null || f == null) return "text-text-primary";
  if (a > f) return "text-profit";
  if (a < f) return "text-loss";
  return "text-text-primary";
}

export default function NewsPage() {
  const [view, setView] = useState<View>("CALENDAR");
  const [events, setEvents] = useState<NewsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currencyFilter, setCurrencyFilter] = useState<string[]>([]);
  const [impactFilter, setImpactFilter] = useState<NewsEvent["impact"][]>(["HIGH", "MEDIUM"]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/news");
      const data = await res.json();
      if (data.error) setError(data.error);
      setEvents(data.events ?? []);
    } catch {
      setError("Could not load the calendar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return events.filter(e => {
      if (impactFilter.length > 0 && !impactFilter.includes(e.impact)) return false;
      if (currencyFilter.length > 0 && !currencyFilter.includes(e.currency)) return false;
      return true;
    });
  }, [events, impactFilter, currencyFilter]);

  // Upcoming high/medium-impact events in next 24h
  const upcoming = useMemo(() => {
    const now = Date.now();
    const in24h = now + 24 * 60 * 60 * 1000;
    return events
      .filter(e => {
        const t = new Date(e.date).getTime();
        return t >= now && t <= in24h && (e.impact === "HIGH" || e.impact === "MEDIUM");
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events]);

  // Group filtered events by day
  const grouped = useMemo(() => {
    const map = new Map<string, NewsEvent[]>();
    for (const e of [...filtered].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())) {
      const k = dayKey(e.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return Array.from(map.entries());
  }, [filtered]);

  function toggleCurrency(c: string) {
    setCurrencyFilter(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  }
  function toggleImpact(i: NewsEvent["impact"]) {
    setImpactFilter(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  }

  function minutesUntil(iso: string) {
    const diff = new Date(iso).getTime() - Date.now();
    const mins = Math.round(diff / 60000);
    if (mins < 60) return `in ${mins} min`;
    const h = Math.floor(mins / 60);
    return `in ${h}h ${mins % 60}m`;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="News & Calendar" />

      <main className="flex-1 overflow-y-auto p-6 space-y-4">

        {/* ── View switcher ─────────────────────────────── */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {VIEW_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors",
                view === id
                  ? "bg-accent/15 border-accent/40 text-accent"
                  : "bg-surface-2 border-border text-text-secondary hover:text-text-primary hover:border-accent/30"
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Briefing views ────────────────────────────── */}
        {view !== "CALENDAR" && <MacroBriefing region={view} />}

        {/* ── Calendar view ─────────────────────────────── */}
        {view === "CALENDAR" && <>

        {/* ── Próximas 24h alert ────────────────────────── */}
        {upcoming.length > 0 && (
          <div className="card-light p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertOctagon className="size-4 text-warning" />
              <p className="text-sm font-medium text-text-primary">Next 24 hours · high/medium impact</p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {upcoming.slice(0, 6).map(e => (
                <div key={e.id} className="flex items-center gap-2.5 bg-surface-hi rounded-lg px-3 py-2 border border-border-light">
                  <span className={cn("size-2 rounded-full shrink-0", IMPACT_META[e.impact].dot)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-semibold text-text-secondary">{e.currency}</span>
                      <span className="text-xs text-text-primary truncate">{e.title}</span>
                    </div>
                    <span className="text-[10px] text-warning">{fmtTime(e.date)} · {minutesUntil(e.date)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Filters ───────────────────────────────────── */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="size-3.5 text-text-secondary" />
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">Filters</p>
            </div>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent transition-colors disabled:opacity-50">
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              Refresh
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-text-disabled uppercase tracking-wider w-16">Impact</span>
            {(Object.keys(IMPACT_META) as NewsEvent["impact"][]).filter(i => i !== "HOLIDAY").map(i => (
              <button key={i} onClick={() => toggleImpact(i)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] border transition-colors",
                  impactFilter.includes(i) ? IMPACT_META[i].badge : "bg-surface-2 border-border text-text-disabled"
                )}>
                <span className={cn("size-1.5 rounded-full", IMPACT_META[i].dot)} />
                {IMPACT_META[i].label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-text-disabled uppercase tracking-wider w-16">Currency</span>
            {CURRENCIES.map(c => (
              <button key={c} onClick={() => toggleCurrency(c)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-mono border transition-colors",
                  currencyFilter.includes(c)
                    ? "bg-accent/15 border-accent/40 text-accent"
                    : "bg-surface-2 border-border text-text-disabled"
                )}>
                {c}
              </button>
            ))}
            {currencyFilter.length > 0 && (
              <button onClick={() => setCurrencyFilter([])} className="text-[11px] text-text-disabled hover:text-text-secondary underline">
                clear
              </button>
            )}
          </div>
        </div>

        {/* ── Calendar ──────────────────────────────────── */}
        {loading ? (
          <div className="card p-12 text-center text-text-disabled text-sm">Loading calendar…</div>
        ) : error ? (
          <div className="card p-8 text-center space-y-2">
            <p className="text-sm text-loss">Could not load the economic calendar</p>
            <p className="text-xs text-text-disabled">{error}</p>
            <button onClick={load} className="btn-action inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs mt-2">
              <RefreshCw className="size-3.5" /> Retry
            </button>
          </div>
        ) : grouped.length === 0 ? (
          <div className="card p-12 text-center text-text-disabled text-sm">
            No events with current filters. Adjust the filters above.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([day, dayEvents]) => (
              <div key={day} className="card overflow-hidden">
                <div className={cn(
                  "flex items-center gap-2 px-4 py-2.5 border-b border-border",
                  dayEvents.some(e => isToday(e.date)) ? "bg-accent/10" : "bg-surface-2"
                )}>
                  <CalendarDays className="size-3.5 text-text-secondary" />
                  <span className="text-xs font-medium text-text-primary capitalize">{day}</span>
                  {dayEvents.some(e => isToday(e.date)) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">TODAY</span>
                  )}
                  <span className="ml-auto text-[10px] text-text-disabled">{dayEvents.length} events</span>
                </div>
                <div className="divide-y divide-border/50">
                  {dayEvents.map(e => (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/50 transition-colors">
                      <span className="flex items-center gap-1.5 text-xs font-mono text-text-secondary w-16 shrink-0">
                        <Clock className="size-3 text-text-disabled" />
                        {fmtTime(e.date)}
                      </span>
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border w-12 text-center shrink-0 bg-surface-2 border-border text-text-secondary">
                        {e.currency}
                      </span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded border shrink-0 hidden sm:inline-flex items-center gap-1",
                        IMPACT_META[e.impact].badge
                      )}>
                        <span className={cn("size-1.5 rounded-full", IMPACT_META[e.impact].dot)} />
                        {IMPACT_META[e.impact].label}
                      </span>
                      <span className="text-xs text-text-primary flex-1 min-w-0 truncate">{e.title}</span>
                      <div className="hidden md:flex items-center gap-3 shrink-0 text-[10px] font-mono">
                        {e.actual && (
                          <span className={cn("font-semibold", actualColor(e.actual, e.forecast))}>A: {e.actual}</span>
                        )}
                        {e.forecast && <span className="text-text-secondary">F: {e.forecast}</span>}
                        {e.previous && <span className="text-text-disabled">P: {e.previous}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-text-disabled text-center pb-2">
          Weekly Forex Factory calendar data · updates every 30 min
        </p>
        </>}
      </main>
    </div>
  );
}
