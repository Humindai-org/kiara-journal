"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Building2,
  Wallet,
  GraduationCap,
  Check,
  Info,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { useAccountStore } from "@/store/account";
import type { AccountType } from "@/types/supabase";

// ─── Shared styling ──────────────────────────────────────────────

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

const inputClass = cn(
  "w-full bg-surface-hi border border-border-light rounded-lg px-3 py-2.5 text-sm text-text-primary",
  "placeholder:text-text-disabled focus:outline-none focus:border-accent transition-colors",
  focusRing
);

const labelClass = "text-xs text-text-secondary block mb-1.5";

// ─── Types & constants ───────────────────────────────────────────

type AccountKind = "FUNDED" | "PERSONAL" | "DEMO";
type Currency = "USD" | "EUR" | "USDT";
type DdMode = "percent" | "amount";
type Instrument = "FOREX" | "METALS" | "INDICES" | "STOCKS" | "CRYPTO";

const TOTAL_STEPS = 6;

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "MT5", label: "MetaTrader 5" },
  { value: "BITGET", label: "Bitget" },
  { value: "BYBIT", label: "Bybit" },
  { value: "BINANCE", label: "Binance" },
  { value: "MANUAL", label: "Manual" },
];

const CURRENCIES: Currency[] = ["USD", "EUR", "USDT"];

const INSTRUMENTS: { value: Instrument; label: string }[] = [
  { value: "FOREX", label: "Forex" },
  { value: "METALS", label: "Metals" },
  { value: "INDICES", label: "Indices" },
  { value: "STOCKS", label: "Stocks" },
  { value: "CRYPTO", label: "Crypto" },
];

const PROP_FIRM_PRESETS: {
  label: string;
  totalDdPercent: string;
  dailyDdPercent: string;
  profitTargetPercent: string;
}[] = [
  { label: "The Trading Pit", totalDdPercent: "10", dailyDdPercent: "5", profitTargetPercent: "8" },
  { label: "FTMO", totalDdPercent: "10", dailyDdPercent: "5", profitTargetPercent: "10" },
  { label: "5%ers", totalDdPercent: "6", dailyDdPercent: "3", profitTargetPercent: "8" },
];

interface WizardState {
  kind: AccountKind;

  name: string;
  type: AccountType;
  broker: string; // also doubles as "prop firm name" when kind === FUNDED
  phase: string; // only relevant when kind === FUNDED
  accountNumber: string;
  currency: Currency;
  initialBalance: string;

  totalDdMode: DdMode;
  totalDdPercent: string;
  totalDdAmount: string;
  dailyDdEnabled: boolean;
  dailyDdMode: DdMode;
  dailyDdPercent: string;
  dailyDdAmount: string;
  ddWarningPercent: string;
  profitTarget: string;

  riskPerTradePercent: string;
  dailyStopUsd: string;
  maxTradesPerDay: string;
  maxConsecutiveLosses: string;
  tradingWindowEnabled: boolean;
  tradingWindowStart: string;
  tradingWindowEnd: string;
  fridayAPlusOnly: boolean;

  instruments: Instrument[];
}

const INITIAL_STATE: WizardState = {
  kind: "FUNDED",

  name: "",
  type: "MT5",
  broker: "",
  phase: "",
  accountNumber: "",
  currency: "USD",
  initialBalance: "",

  totalDdMode: "percent",
  totalDdPercent: "",
  totalDdAmount: "",
  dailyDdEnabled: false,
  dailyDdMode: "percent",
  dailyDdPercent: "",
  dailyDdAmount: "",
  ddWarningPercent: "20",
  profitTarget: "",

  riskPerTradePercent: "",
  dailyStopUsd: "",
  maxTradesPerDay: "",
  maxConsecutiveLosses: "",
  tradingWindowEnabled: false,
  tradingWindowStart: "08:00",
  tradingWindowEnd: "17:00",
  fridayAPlusOnly: false,

  instruments: [],
};

// ─── Helpers ──────────────────────────────────────────────────────

function toNumber(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function fmtMoney(n: number, currency: string) {
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function computeFloor(balance: number | null, mode: DdMode, percent: string, amount: string): number | null {
  if (balance == null) return null;
  if (mode === "percent") {
    const p = toNumber(percent);
    if (p == null) return null;
    return balance - (balance * p) / 100;
  }
  const a = toNumber(amount);
  if (a == null) return null;
  return balance - a;
}

// ─── Small building blocks ───────────────────────────────────────

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all",
            i + 1 === step ? "w-6 bg-accent" : i + 1 < step ? "w-1.5 bg-accent/50" : "w-1.5 bg-surface-hi"
          )}
        />
      ))}
    </div>
  );
}

function ScreenHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-1.5 mb-8">
      <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
      <p className="text-sm text-text-secondary leading-relaxed">{subtitle}</p>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0",
        checked ? "bg-accent" : "bg-surface-hi",
        focusRing
      )}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <span
        className={cn(
          "inline-block size-3.5 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-4.5" : "translate-x-1"
        )}
      />
    </button>
  );
}

function DdModeToggle({ mode, onChange }: { mode: DdMode; onChange: (m: DdMode) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border-light bg-surface-hi p-0.5 text-xs">
      {(["percent", "amount"] as DdMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            "px-2.5 py-1 rounded-md transition-colors",
            mode === m ? "bg-accent text-bg font-medium" : "text-text-disabled hover:text-text-secondary",
            focusRing
          )}
        >
          {m === "percent" ? "%" : "$"}
        </button>
      ))}
    </div>
  );
}

function FloorHint({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="flex items-start gap-1.5 text-xs text-text-secondary bg-surface-hi border border-border-light rounded-lg px-3 py-2 mt-2">
      <Info className="size-3.5 text-accent mt-0.5 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

// ─── Main component ───────────────────────────────────────────────

interface OnboardingWizardProps {
  mode: "first-run" | "add-account";
  onComplete: (accountId: string) => void;
  onCancel?: () => void;
}

export default function OnboardingWizard({ mode, onComplete, onCancel }: OnboardingWizardProps) {
  const supabase = useMemo(() => createClient(), []);
  const { setAccounts, setActiveAccount } = useAccountStore();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardState>({ ...INITIAL_STATE });
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleInstrument(v: Instrument) {
    setForm((f) => ({
      ...f,
      instruments: f.instruments.includes(v) ? f.instruments.filter((i) => i !== v) : [...f.instruments, v],
    }));
  }

  function applyPreset(preset: (typeof PROP_FIRM_PRESETS)[number]) {
    setForm((f) => ({
      ...f,
      broker: preset.label,
      totalDdMode: "percent",
      totalDdPercent: preset.totalDdPercent,
      dailyDdEnabled: true,
      dailyDdMode: "percent",
      dailyDdPercent: preset.dailyDdPercent,
      profitTarget: f.profitTarget || preset.profitTargetPercent,
    }));
  }

  const balance = toNumber(form.initialBalance);
  const totalFloor = computeFloor(balance, form.totalDdMode, form.totalDdPercent, form.totalDdAmount);
  const dailyFloor = form.dailyDdEnabled
    ? computeFloor(balance, form.dailyDdMode, form.dailyDdPercent, form.dailyDdAmount)
    : null;
  const riskPercent = toNumber(form.riskPerTradePercent);
  const riskDollar = balance != null && riskPercent != null ? (balance * riskPercent) / 100 : null;

  const finalName = form.kind === "FUNDED" && form.phase.trim() ? `${form.name.trim()} (${form.phase.trim()})` : form.name.trim();

  // ─── Validation ───────────────────────────────────────────────

  function canAdvance(fromStep: number): boolean {
    switch (fromStep) {
      case 1:
        return true;
      case 2:
        return form.name.trim().length > 0 && balance != null && balance > 0;
      case 3:
        return true;
      case 4:
        return riskPercent != null && riskPercent > 0;
      case 5:
        return form.instruments.length > 0;
      default:
        return true;
    }
  }

  const canFinish =
    form.name.trim().length > 0 &&
    balance != null &&
    balance > 0 &&
    riskPercent != null &&
    riskPercent > 0 &&
    form.instruments.length > 0;

  function goNext() {
    if (!canAdvance(step)) {
      toast.error("Please complete the required fields before continuing");
      return;
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }

  function goBack() {
    setStep((s) => Math.max(1, s - 1));
  }

  // ─── Submit ─────────────────────────────────────────────────────

  async function handleFinish() {
    if (!canFinish || balance == null || riskPercent == null) {
      toast.error("Please complete the required fields before finishing");
      return;
    }
    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      const dailyStop = toNumber(form.dailyStopUsd);
      const profitTarget = toNumber(form.profitTarget);
      const ddWarningPercent = toNumber(form.ddWarningPercent) ?? 20;
      const maxTradesPerDay = form.maxTradesPerDay.trim() ? parseInt(form.maxTradesPerDay, 10) : null;
      const maxConsecutiveLosses = form.maxConsecutiveLosses.trim() ? parseInt(form.maxConsecutiveLosses, 10) : null;

      // 1. Deactivate existing accounts, insert the new active one.
      await db.from("accounts").update({ is_active: false }).eq("user_id", user.id);

      const { data: accountRow, error: accountError } = await db
        .from("accounts")
        .insert({
          user_id: user.id,
          name: finalName,
          type: form.type,
          broker: form.broker.trim(),
          account_number: form.accountNumber.trim() || null,
          currency: form.currency,
          initial_balance: balance,
          current_balance: balance,
          is_active: true,
          total_dd_floor: totalFloor,
          daily_dd_floor: dailyFloor,
          personal_daily_stop_usd: dailyStop,
          profit_target: profitTarget,
          dd_warning_percent: ddWarningPercent,
          instruments: form.instruments,
        })
        .select()
        .single();

      if (accountError || !accountRow) throw accountError ?? new Error("Failed to create account");

      // 2. Deactivate existing plans, insert the new active one.
      await db.from("plans").update({ is_active: false }).eq("user_id", user.id);

      const { error: planError } = await db.from("plans").insert({
        user_id: user.id,
        name: "Trading Plan",
        plan_type: "CUSTOM",
        is_active: true,
        risk_per_trade_percent: riskPercent,
        max_trades_per_day: maxTradesPerDay,
        max_consecutive_losses: maxConsecutiveLosses,
        max_daily_loss: dailyStop,
        trading_window_start: form.tradingWindowEnabled ? form.tradingWindowStart : null,
        trading_window_end: form.tradingWindowEnabled ? form.tradingWindowEnd : null,
        min_confluences: null,
        friday_a_plus_only: form.fridayAPlusOnly,
      });

      if (planError) throw planError;

      // 3. Refresh the account store.
      const { data: freshAccounts } = await db.from("accounts").select("*").order("created_at");
      setAccounts((freshAccounts ?? []) as never[]);
      setActiveAccount(accountRow.id);

      toast.success("Account created");
      onComplete(accountRow.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StepDots step={step} />
          <span className="text-xs text-text-disabled">Step {step} of {TOTAL_STEPS}</span>
        </div>
        {mode === "add-account" && onCancel && (
          <button
            onClick={onCancel}
            className={cn("text-text-disabled hover:text-text-primary transition-colors rounded-lg p-1", focusRing)}
            aria-label="Cancel"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto w-full px-6 py-10">
          {step === 1 && <StepKind form={form} update={update} />}
          {step === 2 && <StepAccount form={form} update={update} />}
          {step === 3 && (
            <StepLimits form={form} update={update} balance={balance} totalFloor={totalFloor} dailyFloor={dailyFloor} />
          )}
          {step === 4 && <StepRisk form={form} update={update} balance={balance} riskDollar={riskDollar} />}
          {step === 5 && <StepInstruments form={form} toggleInstrument={toggleInstrument} />}
          {step === 6 && (
            <StepReview
              form={form}
              finalName={finalName}
              balance={balance}
              totalFloor={totalFloor}
              dailyFloor={dailyFloor}
              riskDollar={riskDollar}
            />
          )}

          {step === 2 && form.kind === "FUNDED" && (
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-xs text-text-disabled mb-2.5">Quick presets — prefill the next step, edit freely after</p>
              <div className="flex flex-wrap gap-2">
                {PROP_FIRM_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-full border border-border-light text-text-secondary hover:border-accent/50 hover:text-accent transition-colors",
                      focusRing
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-border px-6 py-4">
        <div className="max-w-xl mx-auto w-full flex items-center justify-between">
          <button
            onClick={goBack}
            disabled={step === 1}
            className={cn(
              "flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-0 disabled:pointer-events-none px-3 py-2 rounded-lg",
              focusRing
            )}
          >
            <ChevronLeft className="size-4" />
            Back
          </button>

          {step < TOTAL_STEPS ? (
            <button onClick={goNext} className="btn-action flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm">
              Next
              <ChevronRight className="size-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={submitting || !canFinish}
              className="btn-action flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {submitting ? "Creating…" : "Create account"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 1 — Account kind ─────────────────────────────────────────

function StepKind({ form, update }: { form: WizardState; update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void }) {
  const options: { value: AccountKind; label: string; desc: string; icon: React.ReactNode }[] = [
    { value: "FUNDED", label: "Funded (prop firm)", desc: "Evaluation or funded account with external rules", icon: <Building2 className="size-5" /> },
    { value: "PERSONAL", label: "Personal", desc: "Your own capital, your own rules", icon: <Wallet className="size-5" /> },
    { value: "DEMO", label: "Demo", desc: "Practice account", icon: <GraduationCap className="size-5" /> },
  ];

  return (
    <div>
      <ScreenHeader title="What kind of account is this?" subtitle="This shapes how we talk about limits and rules later — nothing here is locked in." />
      <div className="space-y-3">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => update("kind", o.value)}
            className={cn(
              "w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-colors",
              form.kind === o.value ? "border-accent bg-accent-glow" : "border-border-light bg-surface hover:bg-surface-2",
              focusRing
            )}
          >
            <div className={cn("shrink-0", form.kind === o.value ? "text-accent" : "text-text-disabled")}>{o.icon}</div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">{o.label}</p>
              <p className="text-xs text-text-disabled mt-0.5">{o.desc}</p>
            </div>
            {form.kind === o.value && <Check className="size-4 text-accent shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step 2 — The account ─────────────────────────────────────────

function StepAccount({ form, update }: { form: WizardState; update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void }) {
  return (
    <div>
      <ScreenHeader title="Tell us about the account" subtitle="The basics — you can add more accounts later from Settings." />
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Account name *</label>
          <input
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. Main funded account"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Broker / platform</label>
            <select value={form.type} onChange={(e) => update("type", e.target.value as AccountType)} className={inputClass}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Currency</label>
            <select value={form.currency} onChange={(e) => update("currency", e.target.value as Currency)} className={inputClass}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>{form.kind === "FUNDED" ? "Prop firm name" : "Broker / exchange"}</label>
          <input
            value={form.broker}
            onChange={(e) => update("broker", e.target.value)}
            placeholder={form.kind === "FUNDED" ? "e.g. The Trading Pit, FTMO…" : "e.g. IC Markets, Bitget…"}
            className={inputClass}
          />
        </div>

        {form.kind === "FUNDED" && (
          <div>
            <label className={labelClass}>Phase / stage</label>
            <input
              value={form.phase}
              onChange={(e) => update("phase", e.target.value)}
              placeholder="e.g. Evaluation, Phase 2, Funded…"
              className={inputClass}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Account number</label>
            <input
              value={form.accountNumber}
              onChange={(e) => update("accountNumber", e.target.value)}
              placeholder="Optional"
              className={cn(inputClass, "font-mono")}
            />
          </div>
          <div>
            <label className={labelClass}>Starting balance *</label>
            <input
              type="number"
              min={0}
              value={form.initialBalance}
              onChange={(e) => update("initialBalance", e.target.value)}
              placeholder="10000"
              className={cn(inputClass, "font-mono")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3 — Account limits ───────────────────────────────────────

function StepLimits({
  form,
  update,
  balance,
  totalFloor,
  dailyFloor,
}: {
  form: WizardState;
  update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  balance: number | null;
  totalFloor: number | null;
  dailyFloor: number | null;
}) {
  const isPersonal = form.kind === "PERSONAL";
  const subtitle = isPersonal
    ? "There's no external rule here — it's the line you draw for yourself."
    : form.kind === "FUNDED"
    ? "Your prop firm's drawdown rules. Breach the floor and the account is closed."
    : "Set limits if you want to rehearse the discipline, or skip them for now.";

  return (
    <div>
      <ScreenHeader title="Account limits" subtitle={subtitle} />
      <div className="space-y-6">
        {/* Total DD */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={cn(labelClass, "mb-0")}>
              {isPersonal ? "How much are you willing to lose before you stop and rethink the system?" : "Total drawdown"}
            </label>
            <DdModeToggle mode={form.totalDdMode} onChange={(m) => update("totalDdMode", m)} />
          </div>
          <input
            type="number"
            min={0}
            value={form.totalDdMode === "percent" ? form.totalDdPercent : form.totalDdAmount}
            onChange={(e) => update(form.totalDdMode === "percent" ? "totalDdPercent" : "totalDdAmount", e.target.value)}
            placeholder={form.totalDdMode === "percent" ? "10" : "10000"}
            className={cn(inputClass, "font-mono")}
          />
          <FloorHint
            text={
              balance != null && totalFloor != null
                ? `With ${fmtMoney(balance, form.currency)} and this drawdown, your floor is ${fmtMoney(totalFloor, form.currency)} — if the account drops below that, it's gone.`
                : null
            }
          />
        </div>

        {/* Daily DD */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2.5">
              <Toggle checked={form.dailyDdEnabled} onChange={(v) => update("dailyDdEnabled", v)} label="Enable daily drawdown limit" />
              <label className={cn(labelClass, "mb-0")}>Daily drawdown (optional)</label>
            </div>
            {form.dailyDdEnabled && <DdModeToggle mode={form.dailyDdMode} onChange={(m) => update("dailyDdMode", m)} />}
          </div>
          {form.dailyDdEnabled && (
            <>
              <input
                type="number"
                min={0}
                value={form.dailyDdMode === "percent" ? form.dailyDdPercent : form.dailyDdAmount}
                onChange={(e) => update(form.dailyDdMode === "percent" ? "dailyDdPercent" : "dailyDdAmount", e.target.value)}
                placeholder={form.dailyDdMode === "percent" ? "5" : "5000"}
                className={cn(inputClass, "font-mono")}
              />
              <FloorHint
                text={
                  balance != null && dailyFloor != null
                    ? `Daily floor: ${fmtMoney(dailyFloor, form.currency)}.`
                    : null
                }
              />
            </>
          )}
        </div>

        {/* DD warning threshold */}
        <div>
          <label className={labelClass}>Drawdown warning threshold</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              max={100}
              value={form.ddWarningPercent}
              onChange={(e) => update("ddWarningPercent", e.target.value)}
              className={cn(inputClass, "font-mono w-28")}
            />
            <p className="text-xs text-text-disabled">We&apos;ll warn you when only this much of your drawdown room is left</p>
          </div>
        </div>

        {/* Profit target */}
        <div>
          <label className={labelClass}>Profit target (optional)</label>
          <input
            type="number"
            min={0}
            value={form.profitTarget}
            onChange={(e) => update("profitTarget", e.target.value)}
            placeholder={isPersonal ? "No target" : "e.g. 8"}
            className={cn(inputClass, "font-mono")}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Step 4 — Risk & discipline ────────────────────────────────────

function StepRisk({
  form,
  update,
  balance,
  riskDollar,
}: {
  form: WizardState;
  update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  balance: number | null;
  riskDollar: number | null;
}) {
  return (
    <div>
      <ScreenHeader title="Risk & discipline" subtitle="The rules that keep you in the game." />
      <div className="space-y-5">
        <div>
          <label className={labelClass}>Risk per trade (% of balance) *</label>
          <input
            type="number"
            min={0}
            step="0.1"
            value={form.riskPerTradePercent}
            onChange={(e) => update("riskPerTradePercent", e.target.value)}
            placeholder="1"
            className={cn(inputClass, "font-mono")}
          />
          <FloorHint
            text={
              balance != null && riskDollar != null
                ? `${form.riskPerTradePercent}% of ${fmtMoney(balance, form.currency)} = ${fmtMoney(riskDollar, form.currency)} per trade.`
                : null
            }
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Daily stop ($)</label>
            <input
              type="number"
              min={0}
              value={form.dailyStopUsd}
              onChange={(e) => update("dailyStopUsd", e.target.value)}
              placeholder="Optional"
              className={cn(inputClass, "font-mono")}
            />
          </div>
          <div>
            <label className={labelClass}>Max trades/day</label>
            <input
              type="number"
              min={0}
              value={form.maxTradesPerDay}
              onChange={(e) => update("maxTradesPerDay", e.target.value)}
              placeholder="Optional"
              className={cn(inputClass, "font-mono")}
            />
          </div>
          <div>
            <label className={labelClass}>Max losses in a row</label>
            <input
              type="number"
              min={0}
              value={form.maxConsecutiveLosses}
              onChange={(e) => update("maxConsecutiveLosses", e.target.value)}
              placeholder="Optional"
              className={cn(inputClass, "font-mono")}
            />
          </div>
        </div>

        <div className="pt-2 border-t border-border space-y-4">
          <p className="text-xs text-text-disabled">Recommended rules — off by default, turn on what fits your process</p>

          <div className="flex items-start justify-between gap-4 card-light p-3.5">
            <div>
              <p className="text-sm text-text-primary">Trading window</p>
              <p className="text-xs text-text-disabled mt-0.5">Only trade during your planned session hours.</p>
              {form.tradingWindowEnabled && (
                <div className="flex items-center gap-2 mt-2.5">
                  <input
                    type="time"
                    value={form.tradingWindowStart}
                    onChange={(e) => update("tradingWindowStart", e.target.value)}
                    className={cn(inputClass, "w-auto py-1.5")}
                  />
                  <span className="text-text-disabled text-xs">to</span>
                  <input
                    type="time"
                    value={form.tradingWindowEnd}
                    onChange={(e) => update("tradingWindowEnd", e.target.value)}
                    className={cn(inputClass, "w-auto py-1.5")}
                  />
                </div>
              )}
            </div>
            <Toggle checked={form.tradingWindowEnabled} onChange={(v) => update("tradingWindowEnabled", v)} label="Enable trading window" />
          </div>

          <div className="flex items-start justify-between gap-4 card-light p-3.5">
            <div>
              <p className="text-sm text-text-primary">Friday A+ only</p>
              <p className="text-xs text-text-disabled mt-0.5">
                Many traders skip mediocre setups on Fridays because of thin end-of-week liquidity. Want the Risk Guardian to warn you?
              </p>
            </div>
            <Toggle checked={form.fridayAPlusOnly} onChange={(v) => update("fridayAPlusOnly", v)} label="Enable Friday A+ only" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 5 — Instruments ──────────────────────────────────────────

function StepInstruments({ form, toggleInstrument }: { form: WizardState; toggleInstrument: (v: Instrument) => void }) {
  return (
    <div>
      <ScreenHeader
        title="What do you trade on this account?"
        subtitle="An exchange account can trade more than one asset class in the same place. This feeds position sizing and the trading screen's symbol list."
      />
      <div className="grid grid-cols-2 gap-3">
        {INSTRUMENTS.map((i) => {
          const active = form.instruments.includes(i.value);
          return (
            <button
              key={i.value}
              type="button"
              onClick={() => toggleInstrument(i.value)}
              className={cn(
                "flex items-center justify-between p-3.5 rounded-xl border text-left transition-colors",
                active ? "border-accent bg-accent-glow" : "border-border-light bg-surface hover:bg-surface-2",
                focusRing
              )}
            >
              <span className={cn("text-sm font-medium", active ? "text-text-primary" : "text-text-secondary")}>{i.label}</span>
              {active && <Check className="size-4 text-accent shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 6 — Review ───────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-xs text-text-disabled">{label}</span>
      <span className="text-sm text-text-primary font-medium text-right">{value}</span>
    </div>
  );
}

function StepReview({
  form,
  finalName,
  balance,
  totalFloor,
  dailyFloor,
  riskDollar,
}: {
  form: WizardState;
  finalName: string;
  balance: number | null;
  totalFloor: number | null;
  dailyFloor: number | null;
  riskDollar: number | null;
}) {
  const dailyStop = toNumber(form.dailyStopUsd);
  const profitTarget = toNumber(form.profitTarget);

  return (
    <div>
      <ScreenHeader title="Review & finish" subtitle="Make sure this looks right — you can go back and change anything." />
      <div className="card p-4 space-y-0.5">
        <ReviewRow label="Account" value={finalName || "—"} />
        <ReviewRow label="Type" value={ACCOUNT_TYPES.find((t) => t.value === form.type)?.label ?? form.type} />
        {form.broker && <ReviewRow label={form.kind === "FUNDED" ? "Prop firm" : "Broker / exchange"} value={form.broker} />}
        <ReviewRow label="Starting balance" value={balance != null ? fmtMoney(balance, form.currency) : "—"} />
        <ReviewRow label="Total drawdown floor" value={totalFloor != null ? fmtMoney(totalFloor, form.currency) : "Not set"} />
        <ReviewRow label="Daily drawdown floor" value={dailyFloor != null ? fmtMoney(dailyFloor, form.currency) : "Not set"} />
        <ReviewRow label="Profit target" value={profitTarget != null ? `${profitTarget}%` : "No target"} />
        <ReviewRow
          label="Risk per trade"
          value={riskDollar != null && balance != null ? `${form.riskPerTradePercent}% (${fmtMoney(riskDollar, form.currency)})` : "—"}
        />
        <ReviewRow label="Daily stop" value={dailyStop != null ? fmtMoney(dailyStop, form.currency) : "Not set"} />
        <ReviewRow label="Max trades/day" value={form.maxTradesPerDay || "Not set"} />
        <ReviewRow label="Max losses in a row" value={form.maxConsecutiveLosses || "Not set"} />
        <ReviewRow
          label="Trading window"
          value={form.tradingWindowEnabled ? `${form.tradingWindowStart} – ${form.tradingWindowEnd}` : "Not set"}
        />
        <ReviewRow label="Friday A+ only" value={form.fridayAPlusOnly ? "Yes" : "No"} />
        <ReviewRow
          label="Instruments"
          value={form.instruments.length ? form.instruments.map((i) => INSTRUMENTS.find((x) => x.value === i)?.label).join(", ") : "—"}
        />
      </div>
    </div>
  );
}
