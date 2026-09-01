"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { Lock, AlertTriangle, Loader2, RefreshCw, CheckCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  calcLots,
  calcRR,
  calcDollarsAtDistance,
  getPips,
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
import ConfluenceChecklist from "@/components/journal/ConfluenceChecklist";
import { createClient } from "@/lib/supabase/client";

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
  /** Active plan id — tags the trade so Plan Mode Statistics can find it. */
  planId?: string;
  /** Active plan's entry criteria (enabled rules only). Empty = no checklist shown. */
  entryCriteria?: { id: string; label: string }[];
  /** Active plan's minimum confluences required before taking a setup. */
  minConfluences?: number;
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
  planId,
  entryCriteria = [],
  minConfluences,
}: OrderFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, [supabase]);
  const [instrument, setInstrument] = useState(instruments[0] ?? "EURUSD");
  const [direction, setDirection] = useState<Direction>("LONG");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  // null = trader hasn't touched the Lots field yet, so it shows the
  // recommendation live; any manual edit (even clearing it) switches this to
  // a plain string and the recommendation stops overwriting it.
  const [userLots, setUserLots] = useState<string | null>(null);
  const [grade, setGrade] = useState<SetupGrade>("A");

  const [quoteError, setQuoteError] = useState<string | null>(null);
  // Ref, not state — read inside the polling interval without needing it as
  // a dependency, so a focus/blur doesn't restart the poll timer.
  const entryFocusedRef = useRef(false);

  // Guardian modal flow
  const [guardianState, setGuardianState] = useState<"idle" | "checking" | "modal" | "submitting" | "done">("idle");
  const [guardianResult, setGuardianResult] = useState<GuardianResult | null>(null);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Pre-trade entry-criteria checklist. Checking a box lazily creates a
  // 'draft' trade row (excluded from every trade count/stat in the app) so
  // the check is saved for real from the first click — same journal_entries
  // mechanism the trade-detail page already uses, just triggered earlier.
  const [entryChecks, setEntryChecks] = useState<string[]>([]);
  const [draftTradeId, setDraftTradeId] = useState<string | null>(null);
  const [journalEntryId, setJournalEntryId] = useState<string | null>(null);
  const [loggedTradeId, setLoggedTradeId] = useState<string | null>(null);
  const draftInitRef = useRef<Promise<{ tradeId: string; entryId: string } | null> | null>(null);

  // Unused but kept to avoid breaking the TradeCounter prop contract
  void tradesUsed;
  void maxTrades;

  useEffect(() => {
    onSymbolChange?.(instrument);
  }, [instrument, onSymbolChange]);

  // MARKET orders execute at whatever the market is doing right now, so the
  // "entry" field auto-fills from a live quote instead of being typed in —
  // pauses while the field is focused so it doesn't fight a manual override.
  useEffect(() => {
    if (orderType !== "MARKET") { setQuoteError(null); return; }
    let cancelled = false;
    async function fetchPrice() {
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(instrument)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.price) {
          setQuoteError(null);
          if (!entryFocusedRef.current) setEntry(String(data.price));
        } else {
          setQuoteError(data.error ?? "Quote unavailable");
        }
      } catch {
        if (!cancelled) setQuoteError("Quote feed unreachable");
      }
    }
    fetchPrice();
    const interval = setInterval(fetchPrice, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [orderType, instrument]);

  // Creates the draft trade + its journal_entries row on the first entry-
  // criteria check, seeded with `initialConfluences` so there's no redundant
  // second write. Ref-guarded so rapid-fire clicks share one in-flight
  // creation instead of racing into duplicate rows.
  const ensureDraftAndEntry = useCallback(async (
    initialConfluences: Record<string, boolean>
  ): Promise<{ tradeId: string; entryId: string } | null> => {
    if (draftInitRef.current) return draftInitRef.current;
    if (!accountId || !userId) return null;

    const p = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: tradeData, error: tradeErr } = await (supabase as any)
        .from("trades")
        .insert({
          account_id: accountId,
          user_id: userId,
          instrument,
          direction,
          lot_size: 0,
          entry_price: parseFloat(entry) || 0,
          open_time: new Date().toISOString(),
          status: "draft",
          source: "MANUAL",
          plan_id: planId ?? null,
        })
        .select("id")
        .single();
      if (tradeErr || !tradeData) return null;
      const tradeId = (tradeData as { id: string }).id;
      setDraftTradeId(tradeId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: entryData, error: entryErr } = await (supabase as any)
        .from("journal_entries")
        .insert({ trade_id: tradeId, user_id: userId, entry_confluences: initialConfluences })
        .select("id")
        .single();
      if (entryErr || !entryData) return null;
      const entryId = (entryData as { id: string }).id;
      setJournalEntryId(entryId);

      return { tradeId, entryId };
    })();

    draftInitRef.current = p;
    const result = await p;
    draftInitRef.current = null;
    return result;
  }, [accountId, userId, instrument, direction, entry, planId, supabase]);

  const handleEntryChecksChange = useCallback(async (sel: string[]) => {
    setEntryChecks(sel);
    const obj: Record<string, boolean> = {};
    for (const s of sel) obj[s] = true;

    if (draftTradeId && journalEntryId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("journal_entries").update({ entry_confluences: obj }).eq("id", journalEntryId);
      return;
    }
    await ensureDraftAndEntry(obj);
  }, [draftTradeId, journalEntryId, ensureDraftAndEntry, supabase]);

  // Keep the draft's instrument/direction current if the trader changes their
  // mind mid-evaluation, instead of leaving a stale record behind.
  useEffect(() => {
    if (!draftTradeId) return;
    (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from("trades")
      .update({ instrument, direction })
      .eq("id", draftTradeId)
      .eq("status", "draft")
      .then(() => {});
  }, [instrument, direction, draftTradeId, supabase]);

  const inlineRR = useMemo(() => {
    const e = parseFloat(entry) || 0;
    const s = parseFloat(sl);
    const t = parseFloat(tp);
    return (s > 0 && t > 0 && e > 0) ? calcRR(e, s, t) : null;
  }, [entry, sl, tp]);

  // Suggested lots depend only on SL distance + the grade's risk budget — never
  // on the trader's own lots input, so this can't create a feedback loop with
  // the "effective lots" derivation below.
  const suggestion = useMemo(() => {
    const e = parseFloat(entry) || 0;
    const s = parseFloat(sl);
    if (!(s > 0) || grade === "C") return null;
    const refPrice = e > 0 ? e : s; // SL-only preview falls back to SL as the reference point
    const budget = riskForGrade(balance, riskPercent, grade);
    const { lots: suggestedLots, slPips } = calcLots(instrument, refPrice, s, budget);
    return { refPrice, budget, suggestedLots, slPips };
  }, [entry, sl, grade, instrument, balance, riskPercent]);

  // Only worth recommending a size once the trade clears this plan's own
  // minimum R:R (1:2) — a trade that misses it shouldn't be sized encouragingly.
  const recommendedLots = suggestion && inlineRR != null && inlineRR >= 2 && suggestion.suggestedLots > 0
    ? suggestion.suggestedLots.toFixed(2)
    : "";
  const lots = userLots ?? recommendedLots;

  const calc = useMemo(() => {
    if (!suggestion) return null;
    const t = parseFloat(tp) || 0;
    const enteredLots = parseFloat(lots) || 0;
    const tpPips = t > 0 ? getPips(instrument, suggestion.refPrice, t) : 0;
    const riskUsd = calcDollarsAtDistance(instrument, suggestion.refPrice, parseFloat(sl), enteredLots);
    const rewardUsd = t > 0 ? calcDollarsAtDistance(instrument, suggestion.refPrice, t, enteredLots) : 0;
    return {
      suggestedLots: suggestion.suggestedLots, budget: suggestion.budget, slPips: suggestion.slPips,
      tpPips, riskUsd, rewardUsd, rr: inlineRR ?? 0,
    };
  }, [suggestion, sl, tp, lots, instrument, inlineRR]);

  // Reset guardian when any form input changes
  useEffect(() => {
    if (guardianState !== "idle" && guardianState !== "done") {
      setGuardianState("idle");
      setGuardianResult(null);
      setOverrideConfirmed(false);
      setSubmitError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument, direction, entry, sl, tp, lots, grade, orderType]);

  const runRiskCheck = useCallback(async () => {
    if (!accountId) {
      setSubmitError("No account selected. Configure an account in Settings.");
      return;
    }
    if (!sl) {
      setSubmitError("Stop Loss is required.");
      return;
    }
    if (!lots || parseFloat(lots) <= 0) {
      setSubmitError("Lot size is required.");
      return;
    }

    const entryValue = parseFloat(entry) || 0;
    const slValue = parseFloat(sl);
    const tpValue = parseFloat(tp) || 0;
    const lotsValue = parseFloat(lots);

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
          lots: lotsValue,
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
  }, [accountId, instrument, direction, entry, sl, tp, lots, grade, orderType]);

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
          lots: parseFloat(lots) || undefined,
          grade,
          confirmed_warnings: guardianResult.discipline_warnings.map(w => w.type),
          // Promotes the draft the trader was already checking entry criteria
          // against instead of logging a second, duplicate row.
          draft_id: draftTradeId ?? undefined,
          plan_id: planId ?? undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setGuardianState("modal");
        setSubmitError(data.error ?? "Error logging trade.");
        return;
      }

      setGuardianState("done");
      setLoggedTradeId(data.trade?.id ?? draftTradeId ?? null);
      onTradeLogged?.();
    } catch {
      setGuardianState("modal");
      setSubmitError("Connection error. Try again.");
    }
  }, [guardianResult, accountId, overrideConfirmed, entry, sl, tp, lots, instrument, direction, orderType, grade, onTradeLogged, draftTradeId, planId]);

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
    setUserLots(null);
    setGuardianState("idle");
    setGuardianResult(null);
    setOverrideConfirmed(false);
    setSubmitError(null);
    setEntryChecks([]);
    setDraftTradeId(null);
    setJournalEntryId(null);
    setLoggedTradeId(null);
  };

  const newsBlocked = newsBlock !== null;
  const gradeBlocked = grade === "C";
  const noSl = !sl;
  const noLots = !lots || parseFloat(lots) <= 0;
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
            <div className="flex items-center gap-2">
              <button
                onClick={resetForm}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-2 border border-border text-xs text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
              >
                <RefreshCw className="size-3.5" />
                New trade
              </button>
              {loggedTradeId && (
                <Link
                  href={`/journal/${loggedTradeId}`}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent/10 border border-accent/30 text-xs text-accent hover:bg-accent/20 transition-colors"
                >
                  <ExternalLink className="size-3.5" />
                  View in Journal
                </Link>
              )}
            </div>
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

            {/* Entry criteria — check the setup against your plan before you
                size it. Checking a box saves immediately (draft trade). */}
            {entryCriteria.length > 0 && (
              <div className="bg-surface-2 rounded-lg p-3 space-y-2 border border-border">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-text-secondary">Entry criteria</p>
                  {minConfluences != null && (
                    <span className={cn(
                      "text-[10px] font-mono",
                      entryChecks.length >= minConfluences ? "text-profit" : "text-text-disabled"
                    )}>
                      {entryChecks.length}/{entryCriteria.length} · min {minConfluences}
                    </span>
                  )}
                </div>
                <ConfluenceChecklist
                  selected={entryChecks}
                  onChange={handleEntryChecksChange}
                  items={entryCriteria}
                />
              </div>
            )}

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
                  onFocus={() => { entryFocusedRef.current = true; }}
                  onBlur={() => { entryFocusedRef.current = false; }}
                  placeholder="0.00000"
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
                />
                {orderType === "MARKET" && quoteError && (
                  <p className="text-[10px] text-warning mt-1">{quoteError} — enter the price manually.</p>
                )}
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

              {/* Lots — you set this; Risk Guardian checks it against the grade's budget below */}
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Lots</label>
                <input
                  type="number" step="0.01" value={lots}
                  onChange={(e) => setUserLots(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
                />
                {calc && calc.suggestedLots > 0 && parseFloat(lots || "0") !== calc.suggestedLots && (
                  <p className="text-[10px] text-text-disabled mt-1">
                    Suggested for grade {grade}: {calc.suggestedLots.toFixed(2)} lots (needs R:R ≥ 1:2 to auto-fill)
                  </p>
                )}
              </div>

              {/* Inline R:R preview — shows the actual $ behind the ratio, not just the number */}
              {inlineRR !== null && (
                <div className={cn(
                  "px-3 py-1.5 rounded-lg border text-xs font-mono font-medium space-y-1",
                  inlineRR >= 2
                    ? "border-profit/30 bg-profit/5 text-profit"
                    : inlineRR >= 1
                    ? "border-warning/30 bg-warning/5 text-warning"
                    : "border-loss/30 bg-loss/5 text-loss"
                )}>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary font-sans font-normal">R:R</span>
                    <span>1:{inlineRR}R {inlineRR < 2 && "⚠ min 1:2"}</span>
                  </div>
                  {calc && parseFloat(lots || "0") > 0 && (
                    <div className="flex items-center justify-between text-[10px] font-sans font-normal text-text-secondary">
                      <span>risking ${calc.riskUsd} ({calc.slPips.toFixed(1)} pips)</span>
                      <span>to make ${calc.rewardUsd} ({calc.tpPips.toFixed(1)} pips)</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Risk calc box */}
            {calc && (
              <div className="bg-surface-2 rounded-lg p-3 space-y-1.5 border border-border">
                <div className="flex justify-between">
                  <span className="text-xs text-text-secondary">Risk (this trade)</span>
                  <span className={cn(
                    "text-sm font-mono font-semibold",
                    calc.riskUsd > calc.budget ? "text-loss" : "text-warning"
                  )}>
                    ${calc.riskUsd}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-text-secondary">Budget (grade {grade})</span>
                  <span className="text-sm font-mono text-text-primary">${calc.budget}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-text-secondary">SL Pips</span>
                  <span className="text-sm font-mono text-text-primary">{calc.slPips.toFixed(1)}</span>
                </div>
                {calc.tpPips > 0 && (
                  <div className="flex justify-between">
                    <span className="text-xs text-text-secondary">TP Pips</span>
                    <span className="text-sm font-mono text-text-primary">{calc.tpPips.toFixed(1)}</span>
                  </div>
                )}
                {calc.riskUsd > calc.budget && (
                  <p className="text-[10px] text-loss pt-1 border-t border-border">
                    ⚠ This lot size risks more than grade {grade}&apos;s ${calc.budget} budget.
                  </p>
                )}
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
              disabled={hardBlocked || noSl || noLots || gradeBlocked || guardianState === "checking"}
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
                : noLots
                ? "Set lot size first"
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
