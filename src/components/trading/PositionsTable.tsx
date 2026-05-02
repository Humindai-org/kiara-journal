"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import Link from "next/link";

type Tab = "open" | "pending" | "closed";

interface Position {
  id: string;
  instrument: string;
  direction: "LONG" | "SHORT";
  size: number;
  entryPrice: number;
  currentPrice?: number;
  sl?: number;
  tp?: number;
  pnl?: number;
  openTime: string;
  durationMin?: number;
  status: Tab;
}

const DEMO_CLOSED: Position[] = [
  {
    id: "1",
    instrument: "EURUSD",
    direction: "LONG",
    size: 0.30,
    entryPrice: 1.08520,
    currentPrice: 1.08850,
    sl: 1.08200,
    tp: 1.09150,
    pnl: 99,
    openTime: "09:15",
    durationMin: 47,
    status: "closed",
  },
];

export default function PositionsTable() {
  const [tab, setTab] = useState<Tab>("open");

  const tabs: { key: Tab; label: string }[] = [
    { key: "open", label: "Abiertas" },
    { key: "pending", label: "Pendientes" },
    { key: "closed", label: "Cerradas" },
  ];

  const positions = tab === "closed" ? DEMO_CLOSED : [];

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex gap-4 px-4 border-b border-border">
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
          </button>
        ))}
      </div>

      {/* Table */}
      {positions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-disabled text-sm">
          Sin posiciones {tab === "open" ? "abiertas" : tab === "pending" ? "pendientes" : "cerradas"}
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {["Instrumento", "Dir.", "Tamaño", "Entrada", "Precio", "SL", "TP", "P&L", "Hora", "Duración", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-text-secondary font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-surface-2/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-text-primary">{p.instrument}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-xs font-medium",
                      p.direction === "LONG" ? "badge-profit" : "badge-loss"
                    )}>
                      {p.direction}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-text-primary">{p.size.toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono text-text-primary">{p.entryPrice.toFixed(5)}</td>
                  <td className="px-4 py-3 font-mono text-text-secondary">{p.currentPrice?.toFixed(5) ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-loss">{p.sl?.toFixed(5) ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-profit">{p.tp?.toFixed(5) ?? "—"}</td>
                  <td className={cn("px-4 py-3 font-mono font-medium", p.pnl != null && p.pnl >= 0 ? "text-profit" : "text-loss")}>
                    {p.pnl != null ? `${p.pnl >= 0 ? "+" : ""}$${p.pnl.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{p.openTime}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {p.durationMin != null ? `${p.durationMin}m` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {tab === "closed" && (
                      <Link
                        href={`/journal/${p.id}`}
                        className="flex items-center gap-1 text-accent hover:text-accent-dim transition-colors text-xs"
                      >
                        Journal <ExternalLink className="size-3" />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
