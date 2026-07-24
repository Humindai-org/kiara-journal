"use client";

import { useState, useEffect, useCallback } from "react";
import { Lock, AlertTriangle, Loader2, RefreshCw, CheckCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  calcLots,
  calcRR,
  getGradeColor,
  riskForGrade,
  hasPreciseSizing,
  DEFAULT_RISK_PERCENT,
  FOREX_MAJORS,
  type SetupGrade,
} from "./RiskCalculator";
import RiskGuardianModal from "./RiskGuardianModal";
import type { GuardianResult } from "./RiskGuardianModal";
import InstrumentCombobox from "./InstrumentCombobox";

type Direction = "LONG" | "SHORT";
type OrderType = "MARKET" | "LIMIT" | "STOP";

interface OrderFormProps {
  accountId?: string;
  onSymbolChange?: (symbol: string) => void;
  tradesUsed?: number;
  maxTrades?: number;
  newsBlock?: { eventName: string; minutesLeft: number } | null;
  onTradeLogged?: () => void;
  /** Account balance — drives the position-size preview. */
  balance?: number;
  /** Plan's risk per trade, as a percentage of balance. */
  riskPercent?: number;
  /** Tradeable symbols for this account (forex majors by default). */
  instruments?: string[];
}

export default function OrderForm({
  accountId,
  onSymbolChange,
  tradesUsed = 0,
  maxTrades = 3,
  newsBlock = null,
  onTradeLogged,
  balance = 0,
  riskPercent = DEFAULT_RISK_PERCENT,
  instruments = FOREX_MAJORS,
}: OrderFormProps) {
  const [instrument, setInstrument] = useState(instruments[0] ?? "EURUSD");
  const [direction, setDirection] = useState<Direction>("LONG");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [grade, setGrade] = useState<SetupGrade>("A");

  const [calc, setCalc] = useState<{ lots: number; riskUsd: number; slPips: number; rr: number } | null>(null);
  const [inlineRR, setInlineRR] = useState<number | null>(null);

  // Guardian modal flow
  const [guardianState, setGuardianState] = useState<"idle" | "checking" | "modal" | "submitting" | "done">("idle");
  const [guardianResult, setGuardianResult] = useState<GuardianResult | null>(null);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Unused but kept to avoid breaking the TradeCounter prop contract
  void tradesUsed;
  void maxTrades;

  useEffect(() => {
    onSymbolChange?.(instrument);
  }, [instrument, onSymbolChange]);

  useEffect(() => {
    const e = parseFloat(entry) || 0;
    const s = parseFloat(sl);
    const t = parseFloat(tp);

    if (s > 0 && t > 0 && e > 0) {
      setInlineRR(calcRR(e, s, t));
    } else {
      setInlineRR(null);
    }

    const budget = riskForGrade(balance, riskPercent, grade);

    if (e > 0 && s > 0 && grade !== "C") {
      const { lots, riskUsd, slPips } = calcLots(instrument, e, s, budget);
      const rr = t > 0 ? calcRR(e, s, t) : 0;
      setCalc({ lots, riskUsd, slPips, rr });
    } else if (s > 0 && grade !== "C") {
      // SL without entry — show risk only
      const { lots, riskUsd, slPips } = calcLots(instrument, s, s, budget);
      setCalc({ lots, riskUsd, slPips, rr: 0 });
    } else {
      setCalc(null);
    }
  }, [entry, sl, tp, grade, instrument, orderType, balance, riskPercent]);

  // Reset guardian when any form input changes
  useEffect(() => {
    if (guardianState !== "idle" && guardianState !== "done") {
      setGuardianState("idle");
      setGuardianResult(null);
      setOverrideConfirmed(false);
      setSubmitError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument, direction, entry, sl, tp, grade, orderType]);

  const runRiskCheck = useCallback(async () => {
    if (!accountId) {
      setSubmitError("No account selected. Configure an account in Settings.");
      return;
    }
    if (!sl) {
      setSubmitError("Stop Loss is required.");
      return;
    }

    const entryValue = parseFloat(entry) || 0;
    const slValue = parseFloat(sl);
    const tpValue = parseFloat(tp) || 0;

    if ((orderType === "LIMIT" || orderType === "STOP") && !entryValue) {
      setSubmitError("Entry price required for Limit/Stop orders.");
      return;
    }

    setGuardianState("checking");
    setSubmitError(null);

    try {
      const res = await fetch("/api/risk-guardian/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          symbol: instrument,
          direction,
          entry: entryValue || 0,  // send 0 for MARKET; API detects no real entry
          sl: slValue,
          tp: tpValue > 0 ? tpValue : undefined,
          grade,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setGuardianState("idle");
        setSubmitError(data.error ?? "Error validating trade.");
        return;
      }

      setGuardianResult(data);
      setGuardianState("modal");
    } catch {
      setGuardianState("idle");
      setSubmitError("Connection error — Risk Guardian unavailable.");
    }
  }, [accountId, instrument, direction, entry, sl, tp, grade, orderType]);

  const handleOverride = useCallback(async () => {
    if (!guardianResult || !accountId) return;

    setGuardianState("submitting");
    setSubmitError(null);

    const entryValue = parseFloat(entry) || parseFloat(sl);
    const slValue = parseFloat(sl);
    const tpValue = parseFloat(tp) || undefined;

    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          symbol: instrument,
          direction,
          order_type: orderType,
          entry: entryValue,
          sl: slValue,
          tp: tpValue,
          grade,
          confirmed_warnings: guardianResult.discipline_warnings.map(w => w.type),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setGuardianState("modal");
        setSubmitError(data.error ?? "Error logging trade.");
        return;
      }

      setGuardianState("done");
      onTradeLogged?.();
    } catch {
      setGuardianState("modal");
      setSubmitError("Connection error. Try again.");
    }
  }, [guardianResult, accountId, overrideConfirmed, entry, sl, tp, instrument, direction, orderType, grade, onTradeLogged]);

  const handleStop = useCallback(() => {
    setGuardianState("idle");
    setGuardianResult(null);
    setOverrideConfirmed(false);
    setSubmitError(null);
  }, []);

  const resetForm = () => {
    setEntry("");
    setSl("");
    setTp("");
    setGuardianState("idle");
    setGuardianResult(null);
    setOverrideConfirmed(false);
    setSubmitError(null);
  };

  const newsBlocked = newsBlock !== null;
  const gradeBlocked = grade === "C";
  const noSl = !sl;
  const hardBlocked = newsBlocked || gradeBlocked;

  return (
    <>
      {/* Risk Guardian Modal */}
      {(guardianState === "modal" || guardianState === "submitting") && guardianResult && (
        <RiskGuardianModal
          result={guardianResult}
          instrument={instrument}
          direction={direction}
          grade={grade}
          overrideConfirmed={overrideConfirmed}
          onToggleOverride={() => setOverrideConfirmed(prev => !prev)}
          onStop={handleStop}
          onOverride={handleOverride}
          isSubmitting={guardianState === "submitting"}
        />
      )}

      <div className="relative flex flex-col gap-3">
        {/* NEWS BLOCK overlay */}
        {newsBlock && (
          <div className="absolute inset-0 z-10 rounded-lg backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 bg-bg/70 border border-loss/30">
            <Lock className="size-6 text-loss" />
            <p className="text-sm font-medium text-loss">{newsBlock.eventName}</p>
            <p className="text-xs text-text-secondary">
              Trading blocked · {newsBlock.minutesLeft} min
            </p>
          </div>
        )}

        {/* DONE state */}
        {guardianState === "done" && (
          <div className="flex flex-col items-center gap-3 py-4 px-2">
            <CheckCircle className="size-8 text-profit" />
            <p className="text-sm font-medium text-text-primary text-center">
              Trade logged
            </p>
            <p className="text-xs text-text-secondary text-center">
              Open the order in MT5 now.
              <br />The webhook will mark it as open once the EA fires.
            </p>
            <button
              onClick={resetForm}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-2 border border-border text-xs text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
            >
              <RefreshCw className="size-3.5" />
              New trade
            </button>
          </div>
        )}

        {/* Main form */}
        {guardianState !== "done" && (
          <>
            {/* Instrument + Grade */}
            <div className="flex items-center gap-2">
              <InstrumentCombobox
                value={instrument}
                onChange={setInstrument}
                options={instruments}
                isImprecise={(s) => !hasPreciseSizing(s)}
              />
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
              {/* Entry price — always shown, labeled differently for MARKET */}
              <div>
                <label className="text-xs text-text-secondary mb-1 block">
                  {orderType === "MARKET" ? "Entry / Current price (for R:R)" : "Entry Price"}
                </label>
                <input
                  type="number" step="0.00001" value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  placeholder="0.00000"
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
                />
              </div>

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
                  <span>1:{inlineRR}R {inlineRR < 2 && "⚠ min 1:2"}</span>
                </div>
              )}
            </div>

            {/* Risk calc box */}
            {calc && (
              <div className="bg-surface-2 rounded-lg p-3 space-y-1.5 border border-border">
                <div className="flex justify-between">
                  <span className="text-xs text-text-secondary">Lots</span>
                  <span className="text-sm font-mono text-text-primary">{calc.lots.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-text-secondary">Risk</span>
                  <span className="text-sm font-mono text-warning">${calc.riskUsd}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-text-secondary">SL Pips</span>
                  <span className="text-sm font-mono text-text-primary">{calc.slPips.toFixed(1)}</span>
                </div>
                {!hasPreciseSizing(instrument) && (
                  <p className="text-[10px] text-warning pt-1 border-t border-border">
                    ≈ Approximate sizing — {instrument} isn&apos;t in the verified pip table. Double-check lot size manually.
                  </p>
                )}
              </div>
            )}

            {/* Error feedback */}
            {submitError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-loss/10 border border-loss/30">
                <AlertTriangle className="size-3.5 text-loss shrink-0" />
                <p className="text-xs text-loss">{submitError}</p>
              </div>
            )}

            {/* Validate button */}
            <button
              onClick={runRiskCheck}
              disabled={hardBlocked || noSl || gradeBlocked || guardianState === "checking"}
              className={cn(
                "w-full py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2",
                direction === "LONG"
                  ? "bg-profit text-bg hover:bg-profit/90 disabled:bg-profit/20 disabled:text-profit/40"
                  : "bg-loss text-bg hover:bg-loss/90 disabled:bg-loss/20 disabled:text-loss/40",
                "disabled:cursor-not-allowed"
              )}
            >
              {guardianState === "checking" && <Loader2 className="size-3.5 animate-spin" />}
              {newsBlocked
                ? "🔒 Blocked — news event"
                : gradeBlocked
                ? "Grade C — no trading"
                : noSl
                ? "Set Stop Loss first"
                : guardianState === "checking"
                ? "Validating..."
                : `Validate ${direction} · ${instrument}`}
            </button>
          </>
        )}
      </div>
    </>
  );
}
