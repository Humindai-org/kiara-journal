"use client";

import { useState, useEffect, useMemo } from "react";
import { ExternalLink, RefreshCw, X, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Tab = "open" | "pending" | "closed";

type TradeRow = {
  id: string;
  instrument: string;
  direction: "LONG" | "SHORT";
  lot_size: number;
  entry_price: number;
  exit_price: number | null;
  sl: number | null;
  tp: number | null;
  gross_pnl: number | null;
  net_pnl: number | null;
  fees: number | null;
  swap: number | null;
  open_time: string;
  close_time: string | null;
  duration_minutes: number | null;
  return_r: number | null;
  source: string;
  mt5_ticket: string | null;
  journal_entries?: { id: string }[];
};

type Filters = {
  par: string;
  dia: string;
  direction: "" | "LONG" | "SHORT";
  resultado: "" | "pos" | "neg";
  volMin: string;
  ticket: string;
};

const EMPTY_FILTERS: Filters = {
  par: "",
  dia: "",
  direction: "",
  resultado: "",
  volMin: "",
  ticket: "",
};

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return { day, time };
}

function calcChange(t: TradeRow): number | null {
  if (t.exit_price == null || t.entry_price === 0) return null;
  return ((t.exit_price - t.entry_price) / t.entry_price) * 100;
}

function hasActiveFilters(f: Filters) {
  return Object.values(f).some(Boolean);
}

export default function PositionsTable() {
  const supabase = useMemo(() => createClient(), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [tab, setTab]               = useState<Tab>("closed");
  const [trades, setTrades]         = useState<TradeRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [userId, setUserId]         = useState<string | null>(null);
  const [filters, setFilters]       = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id);
    });
  }, [supabase]);

  useEffect(() => {
    if (!userId) return;
    fetchTrades(userId, tab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tab]);

  async function fetchTrades(uid: string, currentTab: Tab) {
    setLoading(true);

    let query = db
      .from("trades")
      .select("id, instrument, direction, lot_size, entry_price, exit_price, sl, tp, gross_pnl, net_pnl, fees, swap, open_time, close_time, duration_minutes, return_r, source, mt5_ticket, journal_entries(id)")
      .eq("user_id", uid)
      .order("open_time", { ascending: false })
      .limit(200);

    if (currentTab === "open") {
      query = query.is("close_time", null);
    } else if (currentTab === "pending") {
      query = query.not("close_time", "is", null);
    } else {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      query = query.not("close_time", "is", null).gte("open_time", since);
    }

    const { data } = await query;
    let rows = (data as TradeRow[]) ?? [];

    if (currentTab === "pending") {
      rows = rows.filter(t => !t.journal_entries || t.journal_entries.length === 0);
    }

    setTrades(rows);
    setLoading(false);
  }

  function refresh() {
    if (userId) fetchTrades(userId, tab);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
  }

  const filteredTrades = useMemo(() => {
    return trades.filter(t => {
      if (filters.par && !t.instrument.toLowerCase().includes(filters.par.toLowerCase())) return false;
      if (filters.dia) {
        const tradeDate = new Date(t.open_time).toISOString().slice(0, 10);
        if (tradeDate !== filters.dia) return false;
      }
      if (filters.direction && t.direction !== filters.direction) return false;
      if (filters.resultado === "pos" && (t.net_pnl == null || t.net_pnl <= 0)) return false;
      if (filters.resultado === "neg" && (t.net_pnl == null || t.net_pnl > 0)) return false;
      if (filters.volMin !== "" && t.lot_size < parseFloat(filters.volMin)) return false;
      if (filters.ticket && !t.mt5_ticket?.toLowerCase().includes(filters.ticket.toLowerCase())) return false;
      return true;
    });
  }, [trades, filters]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "open",    label: "Abiertas" },
    { key: "pending", label: "Sin journal" },
    { key: "closed",  label: "Cerradas (7d)" },
  ];

  const decimals = (instrument: string) =>
    instrument.includes("JPY") || instrument.includes("XAU") || instrument.includes("XAG") ? 3 : 5;

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const active = hasActiveFilters(filters);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs + actions */}
      <div className="flex items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex gap-4">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "py-3 text-xs font-medium border-b-2 transition-colors -mb-px",
                tab === key
                  ? "border-accent text-accent"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              )}
            >
              {label}
              {key === "pending" && trades.length > 0 && tab !== "pending" && (
                <span className="ml-1.5 bg-accent text-bg text-[9px] font-bold px-1 py-0.5 rounded-full">
                  {trades.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {active && (
            <span className="text-[10px] text-text-disabled tabular-nums">
              {filteredTrades.length}/{trades.length}
            </span>
          )}
          <button
            onClick={() => setShowFilters(v => !v)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors",
              showFilters || active
                ? "bg-accent/20 text-accent"
                : "text-text-secondary hover:text-text-primary"
            )}
            title="Filtros"
          >
            <SlidersHorizontal className="size-3" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="bg-accent text-bg text-[9px] font-bold px-1 py-0.5 rounded-full leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={refresh}
            className="p-1.5 text-text-disabled hover:text-text-primary transition-colors"
            title="Actualizar"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border bg-surface-2/40 shrink-0">
          <input
            type="text"
            placeholder="Par…"
            value={filters.par}
            onChange={e => setFilters(f => ({ ...f, par: e.target.value }))}
            className="h-6 w-20 bg-surface-hi text-[10px] text-text-primary px-2 rounded border border-border-light placeholder:text-text-disabled focus:outline-none focus:border-accent"
          />
          <input
            type="date"
            value={filters.dia}
            onChange={e => setFilters(f => ({ ...f, dia: e.target.value }))}
            className="h-6 bg-surface-hi text-[10px] text-text-primary px-2 rounded border border-border-light focus:outline-none focus:border-accent"
          />
          <select
            value={filters.direction}
            onChange={e => setFilters(f => ({ ...f, direction: e.target.value as Filters["direction"] }))}
            className="h-6 bg-surface-hi text-[10px] text-text-primary px-2 rounded border border-border-light focus:outline-none focus:border-accent"
          >
            <option value="">Dir. (todas)</option>
            <option value="LONG">LONG</option>
            <option value="SHORT">SHORT</option>
          </select>
          <select
            value={filters.resultado}
            onChange={e => setFilters(f => ({ ...f, resultado: e.target.value as Filters["resultado"] }))}
            className="h-6 bg-surface-hi text-[10px] text-text-primary px-2 rounded border border-border-light focus:outline-none focus:border-accent"
          >
            <option value="">P&amp;L (todos)</option>
            <option value="pos">Ganadoras</option>
            <option value="neg">Perdedoras</option>
          </select>
          <input
            type="number"
            placeholder="Vol. mín…"
            value={filters.volMin}
            step="0.01"
            min="0"
            onChange={e => setFilters(f => ({ ...f, volMin: e.target.value }))}
            className="h-6 w-20 bg-surface-hi text-[10px] text-text-primary px-2 rounded border border-border-light placeholder:text-text-disabled focus:outline-none focus:border-accent"
          />
          <input
            type="text"
            placeholder="Ticket…"
            value={filters.ticket}
            onChange={e => setFilters(f => ({ ...f, ticket: e.target.value }))}
            className="h-6 w-20 bg-surface-hi text-[10px] text-text-primary px-2 rounded border border-border-light placeholder:text-text-disabled focus:outline-none focus:border-accent"
          />
          {active && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 h-6 px-2 text-[10px] text-text-secondary hover:text-text-primary bg-surface-hi rounded border border-border-light transition-colors"
            >
              <X className="size-3" />
              Limpiar
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-text-disabled text-xs">
          Cargando…
        </div>
      ) : filteredTrades.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-disabled text-sm">
          {active
            ? "Sin resultados con estos filtros"
            : tab === "open"    ? "Sin posiciones abiertas"
            : tab === "pending" ? "Todos los trades están journalizados ✓"
            :                    "Sin trades en los últimos 7 días"}
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface z-10">
              <tr className="border-b border-border">
                {["Par", "Dir.", "Lotes", "Entrada", "Salida", "SL", "TP", "P&L", "R", "Chg%", "Fecha/Hora", "Dur.", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-text-secondary font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((t) => {
                const d = decimals(t.instrument);
                const hasJournal = t.journal_entries && t.journal_entries.length > 0;
                const change = calcChange(t);
                const { day, time } = fmtDateTime(t.open_time);
                return (
                  <tr key={t.id} className="border-b border-border/40 hover:bg-surface-2/50 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-text-primary whitespace-nowrap">
                      {t.instrument}
                      {t.source === "MT5" && (
                        <span className="ml-1 text-[9px] text-text-disabled font-normal">MT5</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-medium",
                        t.direction === "LONG" ? "badge-profit" : "badge-loss"
                      )}>
                        {t.direction}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-text-primary">{t.lot_size.toFixed(2)}</td>
                    <td className="px-3 py-2.5 font-mono text-text-primary">{t.entry_price.toFixed(d)}</td>
                    <td className="px-3 py-2.5 font-mono text-text-secondary">
                      {t.exit_price ? t.exit_price.toFixed(d) : "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-loss">{t.sl ? t.sl.toFixed(d) : "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-profit">{t.tp ? t.tp.toFixed(d) : "—"}</td>
                    <td className={cn(
                      "px-3 py-2.5 font-mono font-medium",
                      t.net_pnl == null ? "text-text-disabled"
                        : t.net_pnl >= 0 ? "text-profit" : "text-loss"
                    )}>
                      {t.net_pnl != null ? (
                        <span
                          title={[
                            t.gross_pnl != null ? `Bruto: ${t.gross_pnl >= 0 ? "+" : ""}$${t.gross_pnl.toFixed(2)}` : null,
                            t.swap ? `Swap: ${t.swap >= 0 ? "+" : ""}$${t.swap.toFixed(2)}` : null,
                            t.fees ? `Com.: ${t.fees >= 0 ? "+" : ""}$${t.fees.toFixed(2)}` : null,
                          ].filter(Boolean).join("  |  ") || undefined}
                        >
                          {t.net_pnl >= 0 ? "+" : ""}${t.net_pnl.toFixed(2)}
                          {(t.swap || t.fees) ? (
                            <span className="ml-0.5 text-[9px] text-text-disabled">*</span>
                          ) : null}
                        </span>
                      ) : "—"}
                    </td>
                    <td className={cn(
                      "px-3 py-2.5 font-mono",
                      t.return_r == null ? "text-text-disabled"
                        : t.return_r >= 0 ? "text-profit" : "text-loss"
                    )}>
                      {t.return_r != null ? `${t.return_r >= 0 ? "+" : ""}${t.return_r.toFixed(2)}R` : "—"}
                    </td>
                    <td className={cn(
                      "px-3 py-2.5 font-mono",
                      change == null ? "text-text-disabled"
                        : change >= 0 ? "text-profit" : "text-loss"
                    )}>
                      {change != null
                        ? `${change >= 0 ? "+" : ""}${change.toFixed(3)}%`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="text-text-disabled text-[10px]">{day}</span>
                      <span className="ml-1 text-text-secondary">{time}</span>
                    </td>
                    <td className="px-3 py-2.5 text-text-secondary">
                      {t.duration_minutes != null ? `${t.duration_minutes}m` : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/journal/${t.id}`}
                        className={cn(
                          "flex items-center gap-1 transition-colors text-[10px] whitespace-nowrap",
                          hasJournal ? "text-text-disabled hover:text-text-primary" : "text-accent hover:text-accent/70"
                        )}
                      >
                        {hasJournal ? "Ver" : "Journalizar"}
                        <ExternalLink className="size-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
