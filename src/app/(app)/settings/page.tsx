"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { Plus, RefreshCw, Check, X, Zap, Unplug, RotateCw, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import TopBar from "@/components/layout/TopBar";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import { createClient } from "@/lib/supabase/client";
import { useAccountStore } from "@/store/account";
import { computeFloor, computeTargetDollar, type LimitMode } from "@/components/trading/RiskCalculator";
import type { AccountType } from "@/types/supabase";

type InstrumentClass = "FOREX" | "METALS" | "INDICES" | "STOCKS" | "CRYPTO";

const INSTRUMENT_CLASSES: { value: InstrumentClass; label: string }[] = [
  { value: "FOREX", label: "Forex" },
  { value: "METALS", label: "Metals" },
  { value: "INDICES", label: "Indices" },
  { value: "STOCKS", label: "Stocks" },
  { value: "CRYPTO", label: "Crypto" },
];

type Account = {
  id: string;
  name: string;
  type: AccountType;
  broker: string;
  account_number: string | null;
  currency: string;
  initial_balance: number;
  current_balance: number;
  is_active: boolean;
  last_synced_at: string | null;
  webhook_token: string;
  mt5_server: string | null;
  metaapi_account_id: string | null;
  // Set by the onboarding wizard (migration 0012) — optional because rows
  // created before it exists won't have these.
  total_dd_floor: number | null;
  daily_dd_floor: number | null;
  personal_daily_stop_usd: number | null;
  profit_target: number | null;
  dd_warning_percent: number | null;
  instruments: InstrumentClass[] | null;
};

const EMPTY_LIMITS = {
  totalDdMode: "amount" as LimitMode,
  totalDdPercent: "",
  totalDdAmount: "",
  dailyDdEnabled: false,
  dailyDdMode: "amount" as LimitMode,
  dailyDdPercent: "",
  dailyDdAmount: "",
  ddWarningPercent: "20",
  profitTargetMode: "amount" as LimitMode,
  profitTargetPercent: "",
  profitTargetAmount: "",
  personalDailyStopUsd: "",
  riskPerTradePercent: "",
  instruments: [] as InstrumentClass[],
};

const ACCOUNT_TYPES: { value: AccountType; label: string; color: string }[] = [
  { value: "MT5",     label: "MetaTrader 5",  color: "text-accent"  },
  { value: "BITGET",  label: "Bitget",         color: "text-[#f7a600]" },
  { value: "BYBIT",   label: "Bybit",          color: "text-[#f7a600]" },
  { value: "BINANCE", label: "Binance",         color: "text-[#f3ba2f]" },
  { value: "MANUAL",  label: "Manual",         color: "text-text-secondary" },
];

const CURRENCIES = ["USD", "EUR", "USDT"];

function typeLabel(type: AccountType) {
  return ACCOUNT_TYPES.find(t => t.value === type)?.label ?? type;
}
function typeColor(type: AccountType) {
  return ACCOUNT_TYPES.find(t => t.value === type)?.color ?? "text-text-secondary";
}

/** A labeled input with a %/$ mode toggle, for editing a drawdown or profit-target field. */
function EditLimitField({ label, mode, onModeChange, value, onChange }: {
  label: string;
  mode: LimitMode;
  onModeChange: (m: LimitMode) => void;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        {label && <label className="text-[9px] text-text-disabled">{label}</label>}
        <div className="inline-flex rounded border border-border-light bg-surface-2 p-0.5 text-[9px] ml-auto">
          {(["percent", "amount"] as LimitMode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={cn(
                "px-1.5 py-0.5 rounded transition-colors",
                mode === m ? "bg-accent text-bg font-medium" : "text-text-disabled hover:text-text-secondary"
              )}
            >
              {m === "percent" ? "%" : "$"}
            </button>
          ))}
        </div>
      </div>
      <input
        type="number"
        min={0}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-surface-2 border border-border-light rounded px-2 py-1.5 text-xs font-mono text-text-primary focus:outline-none focus:border-accent"
      />
    </div>
  );
}

export default function SettingsPage() {
  const supabase  = useMemo(() => createClient(), []);
  const { setAccounts, activeAccountId, setActiveAccount } = useAccountStore();

  const [accounts, setLocal]  = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [recalcId, setRecalcId] = useState<string | null>(null);

  // The active plan's risk-per-trade is shared across all accounts (the plan
  // is per-user, not per-account) — fetched once, prefilled into whichever
  // account's edit form is open.
  const [activeRiskPercent, setActiveRiskPercent] = useState<number | null>(null);

  // Edit state
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editForm,    setEditForm]    = useState({
    name: "", type: "MT5" as AccountType, broker: "", account_number: "", currency: "USD", initial_balance: "",
    ...EMPTY_LIMITS,
  });
  const [editSaving,  setEditSaving]  = useState(false);
  const [showLimits,  setShowLimits]  = useState(false);

  // Delete state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting,        setDeleting]        = useState(false);

  // MetaApi state
  const [connectingId,    setConnectingId]    = useState<string | null>(null);
  const [syncingId,       setSyncingId]       = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [metaapiExpandedId, setMetaapiExpandedId] = useState<string | null>(null);
  const [metaapiForm, setMetaapiForm] = useState<Record<string, { server: string; password: string; login: string }>>({});

  async function load() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const [{ data }, { data: { user } }] = await Promise.all([
      db.from("accounts").select("*").order("created_at"),
      supabase.auth.getUser(),
    ]);
    const rows = (data as Account[]) ?? [];
    setLocal(rows);
    setAccounts(rows as never[]);

    if (user) {
      const { data: plan } = await db
        .from("plans")
        .select("risk_per_trade_percent")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      setActiveRiskPercent(plan?.risk_per_trade_percent ?? null);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRecalculate(accountId: string) {
    setRecalcId(accountId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("recalculate_account_balance", { p_account_id: accountId });
    if (error) { toast.error("Error recalculating"); }
    else { toast.success("Balance updated"); await load(); }
    setRecalcId(null);
  }

  async function handleSetActive(accountId: string) {
    setActiveAccount(accountId);
    await fetch("/api/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: accountId, is_active: true }),
    });
    // Set others inactive
    for (const acc of accounts.filter(a => a.id !== accountId && a.is_active)) {
      await fetch("/api/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: acc.id, is_active: false }),
      });
    }
    await load();
  }

  function startEdit(acc: Account) {
    setDeleteConfirmId(null);
    setEditingId(acc.id);
    setShowLimits(false);

    // Stored floors are $ amounts on the balance; show them as the "how much
    // you're willing to lose" amount the wizard uses, not the raw floor.
    const totalDdAmount = acc.total_dd_floor != null ? acc.initial_balance - acc.total_dd_floor : null;
    const dailyDdAmount = acc.daily_dd_floor != null ? acc.initial_balance - acc.daily_dd_floor : null;

    setEditForm({
      name:            acc.name,
      type:            acc.type,
      broker:          acc.broker,
      account_number:  acc.account_number ?? "",
      currency:        acc.currency,
      initial_balance: String(acc.initial_balance),

      totalDdMode:     "amount",
      totalDdPercent:  "",
      totalDdAmount:   totalDdAmount != null ? String(totalDdAmount) : "",
      dailyDdEnabled:  acc.daily_dd_floor != null,
      dailyDdMode:     "amount",
      dailyDdPercent:  "",
      dailyDdAmount:   dailyDdAmount != null ? String(dailyDdAmount) : "",
      ddWarningPercent: acc.dd_warning_percent != null ? String(acc.dd_warning_percent) : "20",
      profitTargetMode: "amount",
      profitTargetPercent: "",
      profitTargetAmount: acc.profit_target != null ? String(acc.profit_target) : "",
      personalDailyStopUsd: acc.personal_daily_stop_usd != null ? String(acc.personal_daily_stop_usd) : "",
      riskPerTradePercent: activeRiskPercent != null ? String(activeRiskPercent) : "",
      instruments: acc.instruments ?? [],
    });
  }

  function toggleEditInstrument(v: InstrumentClass) {
    setEditForm(f => ({
      ...f,
      instruments: f.instruments.includes(v) ? f.instruments.filter(i => i !== v) : [...f.instruments, v],
    }));
  }

  async function handleSaveEdit() {
    if (!editingId || !editForm.name || !editForm.initial_balance) {
      toast.error("Name and initial balance are required");
      return;
    }
    setEditSaving(true);

    const balance = parseFloat(editForm.initial_balance);
    const totalDdFloor = computeFloor(balance, editForm.totalDdMode, editForm.totalDdPercent, editForm.totalDdAmount);
    const dailyDdFloor = editForm.dailyDdEnabled
      ? computeFloor(balance, editForm.dailyDdMode, editForm.dailyDdPercent, editForm.dailyDdAmount)
      : null;
    const profitTarget = computeTargetDollar(balance, editForm.profitTargetMode, editForm.profitTargetPercent, editForm.profitTargetAmount);
    const ddWarningPercent = editForm.ddWarningPercent.trim() ? parseFloat(editForm.ddWarningPercent) : null;
    const personalDailyStop = editForm.personalDailyStopUsd.trim() ? parseFloat(editForm.personalDailyStopUsd) : null;

    const res = await fetch("/api/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id:              editingId,
        name:            editForm.name,
        type:            editForm.type,
        broker:          editForm.broker,
        account_number:  editForm.account_number || null,
        currency:        editForm.currency,
        initial_balance: balance,
        total_dd_floor:  totalDdFloor,
        daily_dd_floor:  dailyDdFloor,
        dd_warning_percent: ddWarningPercent,
        profit_target:   profitTarget,
        personal_daily_stop_usd: personalDailyStop,
        instruments:     editForm.instruments,
      }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Failed to update"); setEditSaving(false); return; }

    // Risk per trade lives on the active plan, shared across accounts — write
    // it separately, and only if it actually changed.
    const newRiskPercent = editForm.riskPerTradePercent.trim() ? parseFloat(editForm.riskPerTradePercent) : null;
    if (newRiskPercent != null && newRiskPercent !== activeRiskPercent) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("plans")
          .update({ risk_per_trade_percent: newRiskPercent })
          .eq("user_id", user.id)
          .eq("is_active", true);
      }
    }

    toast.success("Account updated");
    setEditingId(null);
    await load();
    setEditSaving(false);
  }

  async function handleDelete(accountId: string) {
    setDeleting(true);
    const res = await fetch("/api/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: accountId }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Failed to delete"); }
    else {
      toast.success("Account deleted");
      setDeleteConfirmId(null);
      if (accountId === activeAccountId) setActiveAccount("");
      await load();
    }
    setDeleting(false);
  }

  async function handleMetaApiConnect(accountId: string) {
    const f = metaapiForm[accountId];
    if (!f?.password) { toast.error("Password is required"); return; }
    setConnectingId(accountId);
    const res = await fetch("/api/metaapi/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id:   accountId,
        mt5_password: f.password,
        mt5_server:   f.server || undefined,
        mt5_login:    f.login  || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Connection failed");
    } else {
      toast.success("MetaApi connecting… takes ~2 min. Then click Sync.");
      setMetaapiForm(prev => { const next = { ...prev }; delete next[accountId]; return next; });
      await load();
    }
    setConnectingId(null);
  }

  async function handleMetaApiSync(accountId: string) {
    setSyncingId(accountId);
    const res = await fetch("/api/metaapi/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Sync failed");
    } else if (!json.ok) {
      const reason = json.state === "DEPLOYING" ? "Still connecting, try again in ~2 min" : (json.reason ?? json.state);
      toast.warning(reason);
    } else {
      toast.success(`Synced: ${json.imported} closed, ${json.open} open`);
      await load();
    }
    setSyncingId(null);
  }

  async function handleMetaApiDisconnect(accountId: string) {
    setDisconnectingId(accountId);
    const res = await fetch("/api/metaapi/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Disconnect failed"); }
    else { toast.success("MetaApi disconnected"); await load(); }
    setDisconnectingId(null);
  }

  return (
    <>
      {wizardOpen && (
        <OnboardingWizard
          mode="add-account"
          onCancel={() => setWizardOpen(false)}
          onComplete={async () => {
            setWizardOpen(false);
            await load();
          }}
        />
      )}
      <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Accounts" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-text-primary">My accounts</h2>
              <p className="text-xs text-text-disabled mt-0.5">
                Connect all your trading accounts to track them in one place
              </p>
            </div>
            <button
              onClick={() => setWizardOpen(true)}
              className="btn-action flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
            >
              <Plus className="size-3.5" />
              New account
            </button>
          </div>

          {/* Account list */}
          {loading ? (
            <div className="text-center py-12 text-text-disabled text-sm">Loading…</div>
          ) : (
            <div className="space-y-3">
              {accounts.map(acc => {
                const pnl = acc.current_balance - acc.initial_balance;
                const pnlPct = (pnl / acc.initial_balance) * 100;
                const isActive = acc.id === activeAccountId;

                const isEditing = editingId === acc.id;
                const isDeleteConfirm = deleteConfirmId === acc.id;

                return (
                  <div key={acc.id} className={cn(
                    "card p-4 space-y-3 transition-colors",
                    isActive && "border-accent/40"
                  )}>

                    {/* Edit form — replaces card content when editing */}
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] font-medium text-accent uppercase tracking-wider">Edit account</p>
                          <button onClick={() => setEditingId(null)} className="text-text-disabled hover:text-text-primary">
                            <X className="size-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          {[
                            { label: "Name *", key: "name", placeholder: "My funded account", mono: false },
                            { label: "Broker / Exchange", key: "broker", placeholder: "Broker / exchange", mono: false },
                            { label: "Account number", key: "account_number", placeholder: "570416698", mono: true },
                            { label: "Initial balance *", key: "initial_balance", placeholder: "10000", mono: true },
                          ].map(({ label, key, placeholder, mono }) => (
                            <div key={key}>
                              <label className="text-[9px] text-text-disabled block mb-1">{label}</label>
                              <input
                                type={key === "initial_balance" ? "number" : "text"}
                                value={(editForm as never)[key]}
                                onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                                placeholder={placeholder}
                                className={cn(
                                  "w-full bg-surface-2 border border-border-light rounded px-2 py-1.5 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent",
                                  mono && "font-mono"
                                )}
                              />
                            </div>
                          ))}
                          <div>
                            <label className="text-[9px] text-text-disabled block mb-1">Type *</label>
                            <select
                              value={editForm.type}
                              onChange={e => setEditForm(f => ({ ...f, type: e.target.value as AccountType }))}
                              className="w-full bg-surface-2 border border-border-light rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
                            >
                              {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[9px] text-text-disabled block mb-1">Currency</label>
                            <select
                              value={editForm.currency}
                              onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))}
                              className="w-full bg-surface-2 border border-border-light rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
                            >
                              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowLimits(v => !v)}
                          className="text-[10px] text-accent hover:text-accent-dim transition-colors"
                        >
                          {showLimits ? "Hide risk & limits ▴" : "Risk & limits ▾"}
                        </button>

                        {showLimits && (
                          <div className="space-y-3 border-t border-border pt-3">
                            <EditLimitField
                              label="Total drawdown — how much you can lose"
                              mode={editForm.totalDdMode}
                              onModeChange={m => setEditForm(f => ({ ...f, totalDdMode: m }))}
                              value={editForm.totalDdMode === "percent" ? editForm.totalDdPercent : editForm.totalDdAmount}
                              onChange={v => setEditForm(f => ({ ...f, [f.totalDdMode === "percent" ? "totalDdPercent" : "totalDdAmount"]: v }))}
                            />

                            <div>
                              <label className="flex items-center gap-1.5 text-[9px] text-text-disabled mb-1">
                                <input
                                  type="checkbox"
                                  checked={editForm.dailyDdEnabled}
                                  onChange={e => setEditForm(f => ({ ...f, dailyDdEnabled: e.target.checked }))}
                                  className="accent-accent"
                                />
                                Daily drawdown limit
                              </label>
                              {editForm.dailyDdEnabled && (
                                <EditLimitField
                                  label=""
                                  mode={editForm.dailyDdMode}
                                  onModeChange={m => setEditForm(f => ({ ...f, dailyDdMode: m }))}
                                  value={editForm.dailyDdMode === "percent" ? editForm.dailyDdPercent : editForm.dailyDdAmount}
                                  onChange={v => setEditForm(f => ({ ...f, [f.dailyDdMode === "percent" ? "dailyDdPercent" : "dailyDdAmount"]: v }))}
                                />
                              )}
                            </div>

                            <EditLimitField
                              label="Profit target (optional)"
                              mode={editForm.profitTargetMode}
                              onModeChange={m => setEditForm(f => ({ ...f, profitTargetMode: m }))}
                              value={editForm.profitTargetMode === "percent" ? editForm.profitTargetPercent : editForm.profitTargetAmount}
                              onChange={v => setEditForm(f => ({ ...f, [f.profitTargetMode === "percent" ? "profitTargetPercent" : "profitTargetAmount"]: v }))}
                            />

                            <div className="grid grid-cols-2 gap-2.5">
                              <div>
                                <label className="text-[9px] text-text-disabled block mb-1">DD warning threshold (%)</label>
                                <input
                                  type="number" min={0} max={100}
                                  value={editForm.ddWarningPercent}
                                  onChange={e => setEditForm(f => ({ ...f, ddWarningPercent: e.target.value }))}
                                  className="w-full bg-surface-2 border border-border-light rounded px-2 py-1.5 text-xs font-mono text-text-primary focus:outline-none focus:border-accent"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-text-disabled block mb-1">Daily stop ($)</label>
                                <input
                                  type="number" min={0}
                                  value={editForm.personalDailyStopUsd}
                                  onChange={e => setEditForm(f => ({ ...f, personalDailyStopUsd: e.target.value }))}
                                  className="w-full bg-surface-2 border border-border-light rounded px-2 py-1.5 text-xs font-mono text-text-primary focus:outline-none focus:border-accent"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[9px] text-text-disabled block mb-1">
                                Risk per trade (%) — applies to all your accounts, set on your active plan
                              </label>
                              <input
                                type="number" min={0} step={0.1}
                                value={editForm.riskPerTradePercent}
                                onChange={e => setEditForm(f => ({ ...f, riskPerTradePercent: e.target.value }))}
                                className="w-full bg-surface-2 border border-border-light rounded px-2 py-1.5 text-xs font-mono text-text-primary focus:outline-none focus:border-accent"
                              />
                            </div>

                            <div>
                              <label className="text-[9px] text-text-disabled block mb-1.5">Instruments</label>
                              <div className="flex flex-wrap gap-1.5">
                                {INSTRUMENT_CLASSES.map(({ value, label }) => {
                                  const active = editForm.instruments.includes(value);
                                  return (
                                    <button
                                      key={value}
                                      type="button"
                                      onClick={() => toggleEditInstrument(value)}
                                      className={cn(
                                        "px-2 py-1 rounded-full text-[10px] border transition-colors",
                                        active
                                          ? "border-accent bg-accent-glow text-text-primary"
                                          : "border-border-light text-text-disabled hover:text-text-secondary"
                                      )}
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}

                        <button
                          onClick={handleSaveEdit}
                          disabled={editSaving}
                          className="btn-action w-full py-2 rounded-lg text-xs"
                        >
                          {editSaving ? "Saving…" : "Save changes"}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-text-primary">{acc.name}</span>
                              <span className={cn("text-[10px] font-medium uppercase tracking-wide", typeColor(acc.type))}>
                                {typeLabel(acc.type)}
                              </span>
                              {isActive && (
                                <span className="text-[9px] font-medium bg-accent/10 text-accent px-1.5 py-0.5 rounded-full">
                                  Active
                                </span>
                              )}
                            </div>
                            {acc.broker && (
                              <p className="text-xs text-text-disabled">{acc.broker}{acc.account_number ? ` · #${acc.account_number}` : ""}</p>
                            )}
                          </div>

                          <div className="flex items-start gap-3">
                            <div className="text-right shrink-0">
                              <p className="text-base font-mono font-semibold text-text-primary">
                                {acc.currency} {acc.current_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                              </p>
                              <p className={cn("text-xs font-mono", pnl >= 0 ? "text-profit" : "text-loss")}>
                                {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)
                              </p>
                            </div>
                            <div className="flex flex-col gap-1 pt-0.5">
                              <button
                                onClick={() => startEdit(acc)}
                                className="text-text-disabled hover:text-text-primary transition-colors"
                                title="Edit account"
                              >
                                <Pencil className="size-3.5" />
                              </button>
                              <button
                                onClick={() => { setEditingId(null); setDeleteConfirmId(acc.id); }}
                                className="text-text-disabled hover:text-loss transition-colors"
                                title="Delete account"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Balance bar */}
                        <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full", pnl >= 0 ? "bg-profit/60" : "bg-loss/60")}
                            style={{ width: `${Math.min(Math.abs(pnlPct) * 2, 100)}%` }}
                          />
                        </div>

                        {/* Delete confirmation */}
                        {isDeleteConfirm && (
                          <div className="bg-loss/5 border border-loss/20 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
                            <p className="text-[10px] text-text-secondary">
                              Delete <strong>{acc.name}</strong> and all its trades permanently?
                            </p>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="text-[10px] text-text-disabled hover:text-text-primary transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleDelete(acc.id)}
                                disabled={deleting}
                                className="text-[10px] text-loss font-medium hover:text-loss/70 transition-colors disabled:opacity-50"
                              >
                                {deleting ? "Deleting…" : "Delete"}
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => handleRecalculate(acc.id)}
                              disabled={recalcId === acc.id}
                              className="flex items-center gap-1 text-[10px] text-text-disabled hover:text-text-primary transition-colors"
                              title="Recalculate balance from trades"
                            >
                              <RefreshCw className={cn("size-3", recalcId === acc.id && "animate-spin")} />
                              Recalculate
                            </button>
                            {acc.last_synced_at && (
                              <span className="text-[10px] text-text-disabled">
                                · Sync: {new Date(acc.last_synced_at).toLocaleDateString("es-ES")}
                              </span>
                            )}

                            {/* MetaApi inline controls */}
                            {acc.type === "MT5" && (
                              acc.metaapi_account_id ? (
                                <>
                                  <span className="text-text-disabled text-[9px]">·</span>
                                  <span className="inline-flex items-center gap-1 text-[9px] text-profit">
                                    <span className="size-1.5 rounded-full bg-profit inline-block" />
                                    MT5
                                  </span>
                                  <button
                                    onClick={() => handleMetaApiSync(acc.id)}
                                    disabled={syncingId === acc.id}
                                    className="flex items-center gap-1 text-[10px] text-accent hover:text-accent/70 transition-colors disabled:opacity-50"
                                  >
                                    <RotateCw className={cn("size-3", syncingId === acc.id && "animate-spin")} />
                                    {syncingId === acc.id ? "Syncing…" : "Sync"}
                                  </button>
                                  <button
                                    onClick={() => handleMetaApiDisconnect(acc.id)}
                                    disabled={disconnectingId === acc.id}
                                    className="flex items-center gap-1 text-[10px] text-text-disabled hover:text-loss transition-colors disabled:opacity-50"
                                  >
                                    <Unplug className="size-3" />
                                    {disconnectingId === acc.id ? "…" : "Disconnect"}
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="text-text-disabled text-[9px]">·</span>
                                  <button
                                    onClick={() => setMetaapiExpandedId(id => id === acc.id ? null : acc.id)}
                                    className="flex items-center gap-1 text-[10px] text-text-disabled hover:text-accent transition-colors"
                                  >
                                    <Zap className="size-3" />
                                    Connect MT5
                                  </button>
                                </>
                              )
                            )}
                          </div>

                          {!isActive && (
                            <button
                              onClick={() => handleSetActive(acc.id)}
                              className="flex items-center gap-1 text-[10px] text-accent hover:text-accent/70 transition-colors"
                            >
                              <Check className="size-3" />
                              Activate
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    {/* MetaApi connect form — expandable, only when not connected */}
                    {!isEditing && acc.type === "MT5" && !acc.metaapi_account_id && metaapiExpandedId === acc.id && (
                      <div className="pt-2 border-t border-border space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[9px] text-text-disabled block mb-1">MT5 Login *</label>
                            <input
                              value={metaapiForm[acc.id]?.login ?? ""}
                              onChange={e => setMetaapiForm(prev => ({ ...prev, [acc.id]: { ...prev[acc.id], login: e.target.value, server: prev[acc.id]?.server ?? "", password: prev[acc.id]?.password ?? "" } }))}
                              placeholder={acc.account_number ?? "570416698"}
                              className="w-full bg-surface-2 border border-border-light rounded px-2 py-1 text-[10px] font-mono text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-text-disabled block mb-1">MT5 Server</label>
                            <input
                              value={metaapiForm[acc.id]?.server ?? ""}
                              onChange={e => setMetaapiForm(prev => ({ ...prev, [acc.id]: { ...prev[acc.id], server: e.target.value, login: prev[acc.id]?.login ?? "", password: prev[acc.id]?.password ?? "" } }))}
                              placeholder={acc.mt5_server ?? "OrbexGlobal-Server"}
                              className="w-full bg-surface-2 border border-border-light rounded px-2 py-1 text-[10px] font-mono text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-text-disabled block mb-1">Investor password *</label>
                            <input
                              type="password"
                              value={metaapiForm[acc.id]?.password ?? ""}
                              onChange={e => setMetaapiForm(prev => ({ ...prev, [acc.id]: { ...prev[acc.id], password: e.target.value, login: prev[acc.id]?.login ?? "", server: prev[acc.id]?.server ?? "" } }))}
                              placeholder="read-only password"
                              className="w-full bg-surface-2 border border-border-light rounded px-2 py-1 text-[10px] text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => handleMetaApiConnect(acc.id)}
                          disabled={connectingId === acc.id || !metaapiForm[acc.id]?.password || !metaapiForm[acc.id]?.login}
                          className="flex items-center gap-1.5 text-[10px] text-accent border border-accent/30 hover:border-accent/60 rounded px-2.5 py-1 transition-colors disabled:opacity-50"
                        >
                          <Zap className="size-3" />
                          {connectingId === acc.id ? "Connecting…" : "Connect MetaTrader"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
