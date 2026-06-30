"use client";

import { useState, useEffect, useMemo } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
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
  net_pnl: number | null;
  open_time: string;
  close_time: string | null;
  duration_minutes: number | null;
  return_r: number | null;
  source: string;
  mt5_ticket: string | null;
  // join: si tiene entrada de journal
  journal_entries?: { id: string }[];
};

function fmt5(n: number | null) {
  return n != null ? n.toFixed(5) : "—";
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export default function PositionsTable() {
  const supabase = useMemo(() => createClient(), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [tab, setTab]         = useState<Tab>("closed");
  const [trades, setTrades]   = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId]   = useState<string | null>(null);

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
      .select("id, instrument, direction, lot_size, entry_price, exit_price, sl, tp, net_pnl, open_time, close_time, duration_minutes, return_r, source, mt5_ticket, journal_entries(id)")
      .eq("user_id", uid)
      .order("open_time", { ascending: false })
      .limit(50);

    if (currentTab === "open") {
      // Trades sin close_time = todavía abiertos (creados manualmente sin cerrar)
      query = query.is("close_time", null);
    } else if (currentTab === "pending") {
      // Trades cerrados que no tienen entrada de journal aún
      query = query.not("close_time", "is", null);
    } else {
      // Cerrados: últimos 7 días
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      query = query.not("close_time", "is", null).gte("open_time", since);
    }

    const { data } = await query;
    let rows = (data as TradeRow[]) ?? [];

    // Para "pendientes": filtrar los que no tienen journal
    if (currentTab === "pending") {
      rows = rows.filter(t => !t.journal_entries || t.journal_entries.length === 0);
    }

    setTrades(rows);
    setLoading(false);
  }

  function refresh() {
    if (userId) fetchTrades(userId, tab);
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "open",    label: "Abiertas" },
    { key: "pending", label: "Sin journal" },
    { key: "closed",  label: "Cerradas (7d)" },
  ];

  const decimals = (instrument: string) =>
    instrument.includes("JPY") || instrument.includes("XAU") || instrument.includes("XAG") ? 3 : 5;

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex items-center justify-between px-4 border-b border-border">
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
        <button
          onClick={refresh}
          className="p-1.5 text-text-disabled hover:text-text-primary transition-colors"
          title="Actualizar"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-text-disabled text-xs">
          Cargando…
        </div>
      ) : trades.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-disabled text-sm">
          {tab === "open"    && "Sin posiciones abiertas"}
          {tab === "pending" && "Todos los trades están journalizados ✓"}
          {tab === "closed"  && "Sin trades en los últimos 7 días"}
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {["Par", "Dir.", "Lotes", "Entrada", "Salida", "SL", "TP", "P&L", "R", "Hora", "Dur.", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-text-secondary font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const d = decimals(t.instrument);
                const hasJournal = t.journal_entries && t.journal_entries.length > 0;
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
                    <td className="px-3 py-2.5 font-mono text-text-secondary">{t.exit_price ? t.exit_price.toFixed(d) : "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-loss">{t.sl ? t.sl.toFixed(d) : "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-profit">{t.tp ? t.tp.toFixed(d) : "—"}</td>
                    <td className={cn(
                      "px-3 py-2.5 font-mono font-medium",
                      t.net_pnl == null ? "text-text-disabled"
                        : t.net_pnl >= 0 ? "text-profit" : "text-loss"
                    )}>
                      {t.net_pnl != null
                        ? `${t.net_pnl >= 0 ? "+" : ""}$${t.net_pnl.toFixed(2)}`
                        : "—"}
                    </td>
                    <td className={cn(
                      "px-3 py-2.5 font-mono",
                      t.return_r == null ? "text-text-disabled"
                        : t.return_r >= 0 ? "text-profit" : "text-loss"
                    )}>
                      {t.return_r != null ? `${t.return_r >= 0 ? "+" : ""}${t.return_r.toFixed(2)}R` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-text-secondary whitespace-nowrap">{fmtTime(t.open_time)}</td>
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
