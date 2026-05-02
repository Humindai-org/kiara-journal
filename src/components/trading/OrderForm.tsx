"use client";

import { useState, useEffect } from "react";
import { Lock, AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  calcLots,
  calcRR,
  getGradeColor,
  type SetupGrade,
} from "./RiskCalculator";

const INSTRUMENTS = [
  "EURUSD", "GBPUSD", "USDJPY", "XAUUSD",
  "AUDUSD", "USDCAD", "USDCHF", "EURJPY", "GBPJPY",
];

type Direction = "LONG" | "SHORT";
type OrderType = "MARKET" | "LIMIT" | "STOP";

interface OrderFormProps {
  onSymbolChange?: (symbol: string) => void;
  tradesUsed?: number;
  maxTrades?: number;
  newsBlock?: { eventName: string; minutesLeft: number } | null;
}

export default function OrderForm({
  onSymbolChange,
  tradesUsed = 0,
  maxTrades = 3,
  newsBlock = null,
}: OrderFormProps) {
  const [instrument, setInstrument] = useState("EURUSD");
  const [direction, setDirection] = useState<Direction>("LONG");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [grade, setGrade] = useState<SetupGrade>("A");
  const [calc, setCalc] = useState<{
    lots: number; riskUsd: number; slPips: number; rr: number;
  } | null>(null);
  const [inlineRR, setInlineRR] = useState<number | null>(null);

  useEffect(() => {
    onSymbolChange?.(instrument);
  }, [instrument, onSymbolChange]);

  useEffect(() => {
    const e = parseFloat(entry) || 0;
    const s = parseFloat(sl);
    const t = parseFloat(tp);

    // Inline R:R — shows as soon as SL + TP are set
    if (s > 0 && t > 0 && e > 0) {
      setInlineRR(calcRR(e, s, t));
    } else if (s > 0 && t > 0 && orderType === "MARKET") {
      // For market orders use a placeholder entry
      setInlineRR(null);
    } else {
      setInlineRR(null);
    }

    if (e > 0 && s > 0 && grade !== "C") {
      const { lots, riskUsd, slPips } = calcLots(instrument, e, s, grade);
      const rr = t > 0 ? calcRR(e, s, t) : 0;
      setCalc({ lots, riskUsd, slPips, rr });
    } else {
      setCalc(null);
    }
  }, [entry, sl, tp, grade, instrument, orderType]);

  const tradeLimitReached = tradesUsed >= maxTrades;
  const isBlocked = newsBlock !== null || tradeLimitReached;

  return (
    <div className="relative flex flex-col gap-3">
      {/* NEWS BLOCK overlay */}
      {newsBlock && (
        <div className="absolute inset-0 z-10 rounded-lg news-block-overlay backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 border border-loss/30">
          <Lock className="size-6 text-loss" />
          <p className="text-sm font-medium text-loss">{newsBlock.eventName}</p>
          <p className="text-xs text-text-secondary">
            Trading bloqueado · {newsBlock.minutesLeft} min restantes
          </p>
        </div>
      )}

      {/* Instrument + Grade */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <select
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            className="w-full appearance-none bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          >
            {INSTRUMENTS.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-3 text-text-secondary pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value as SetupGrade)}
            className={cn(
              "appearance-none bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-accent",
              getGradeColor(grade)
            )}
          >
            {(["A+", "A", "B", "C"] as SetupGrade[]).map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Direction */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setDirection("LONG")}
          className={cn(
            "py-2 rounded-lg text-sm font-medium transition-colors border",
            direction === "LONG"
              ? "bg-profit/20 border-profit text-profit"
              : "bg-transparent border-border text-text-secondary hover:border-profit/50"
          )}
        >
          ▲ BUY / LONG
        </button>
        <button
          onClick={() => setDirection("SHORT")}
          className={cn(
            "py-2 rounded-lg text-sm font-medium transition-colors border",
            direction === "SHORT"
              ? "bg-loss/20 border-loss text-loss"
              : "bg-transparent border-border text-text-secondary hover:border-loss/50"
          )}
        >
          ▼ SELL / SHORT
        </button>
      </div>

      {/* Order type */}
      <div className="flex gap-1 bg-surface-2 rounded-lg p-1">
        {(["MARKET", "LIMIT", "STOP"] as OrderType[]).map((t) => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            className={cn(
              "flex-1 py-1.5 rounded-md text-xs font-medium transition-colors",
              orderType === t
                ? "bg-surface text-text-primary"
                : "text-text-disabled hover:text-text-secondary"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Price fields */}
      <div className="space-y-2">
        {orderType !== "MARKET" && (
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Entry Price</label>
            <input
              type="number" step="0.00001" value={entry}
              onChange={(e) => setEntry(e.target.value)}
              placeholder="0.00000"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Stop Loss</label>
            <input
              type="number" step="0.00001" value={sl}
              onChange={(e) => setSl(e.target.value)}
              placeholder="0.00000"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-loss focus:border"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Take Profit</label>
            <input
              type="number" step="0.00001" value={tp}
              onChange={(e) => setTp(e.target.value)}
              placeholder="0.00000"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-profit focus:border"
            />
          </div>
        </div>

        {/* Inline R:R preview */}
        {inlineRR !== null && (
          <div className={cn(
            "flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs font-mono font-medium",
            inlineRR >= 2
              ? "border-profit/30 bg-profit/5 text-profit"
              : inlineRR >= 1
              ? "border-warning/30 bg-warning/5 text-warning"
              : "border-loss/30 bg-loss/5 text-loss"
          )}>
            <span className="text-text-secondary font-sans font-normal">R:R</span>
            <span>1:{inlineRR}R {inlineRR < 2 && "⚠ mín 1:2"}</span>
          </div>
        )}
      </div>

      {/* Risk calc result */}
      {calc && (
        <div className="bg-surface-2 rounded-lg p-3 space-y-1.5 border border-border">
          <div className="flex justify-between">
            <span className="text-xs text-text-secondary">Lots</span>
            <span className="text-sm font-mono text-text-primary">{calc.lots.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-text-secondary">Riesgo</span>
            <span className="text-sm font-mono text-warning">${calc.riskUsd}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-text-secondary">SL Pips</span>
            <span className="text-sm font-mono text-text-primary">{calc.slPips.toFixed(1)}</span>
          </div>
        </div>
      )}

      {/* Warnings */}
      {tradeLimitReached && (
        <div className="warning-banner rounded-lg px-3 py-2 flex items-center gap-2 text-xs">
          <AlertTriangle className="size-3.5 shrink-0" />
          Límite diario ({tradesUsed}/{maxTrades} trades)
        </div>
      )}

      {/* Submit */}
      <button
        disabled={isBlocked || !sl || grade === "C"}
        className={cn(
          "w-full py-2.5 rounded-lg text-sm font-medium transition-colors",
          direction === "LONG"
            ? "bg-profit text-bg hover:bg-profit/90 disabled:bg-profit/20 disabled:text-profit/40"
            : "bg-loss text-bg hover:bg-loss/90 disabled:bg-loss/20 disabled:text-loss/40",
          "disabled:cursor-not-allowed"
        )}
      >
        {isBlocked
          ? newsBlock ? "🔒 Bloqueado por noticias" : "Límite alcanzado"
          : `Abrir ${direction} · ${instrument}`}
      </button>
    </div>
  );
}
