"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { Plus, RefreshCw, Check, X, Zap, Unplug, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import TopBar from "@/components/layout/TopBar";
import { createClient } from "@/lib/supabase/client";
import { useAccountStore } from "@/store/account";
import type { AccountType } from "@/types/supabase";

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
};

const ACCOUNT_TYPES: { value: AccountType; label: string; color: string }[] = [
  { value: "MT5",     label: "MetaTrader 5",  color: "text-accent"  },
  { value: "BITGET",  label: "Bitget",         color: "text-[#f7a600]" },
  { value: "BYBIT",   label: "Bybit",          color: "text-[#f7a600]" },
  { value: "BINANCE", label: "Binance",         color: "text-[#f3ba2f]" },
  { value: "MANUAL",  label: "Manual",         color: "text-text-secondary" },
];

const CURRENCIES = ["USD", "EUR", "USDT"];

const EMPTY_FORM = {
  name: "", type: "MT5" as AccountType, broker: "",
  account_number: "", currency: "USD", initial_balance: "",
};

function typeLabel(type: AccountType) {
  return ACCOUNT_TYPES.find(t => t.value === type)?.label ?? type;
}
function typeColor(type: AccountType) {
  return ACCOUNT_TYPES.find(t => t.value === type)?.color ?? "text-text-secondary";
}

export default function SettingsPage() {
  const supabase  = useMemo(() => createClient(), []);
  const { setAccounts, activeAccountId, setActiveAccount } = useAccountStore();

  const [accounts, setLocal]  = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState({ ...EMPTY_FORM });
  const [recalcId, setRecalcId] = useState<string | null>(null);

  // MetaApi state
  const [connectingId,    setConnectingId]    = useState<string | null>(null);
  const [syncingId,       setSyncingId]       = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [metaapiForm, setMetaapiForm] = useState<Record<string, { server: string; password: string }>>({});

  async function load() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("accounts").select("*").order("created_at");
    const rows = (data as Account[]) ?? [];
    setLocal(rows);
    setAccounts(rows as never[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd() {
    if (!form.name || !form.initial_balance) {
      toast.error("Name and initial balance are required");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        initial_balance: parseFloat(form.initial_balance),
      }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error); setSaving(false); return; }
    toast.success("Account created");
    setForm({ ...EMPTY_FORM });
    setAdding(false);
    setSaving(false);
    await load();
  }

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

  async function handleMetaApiConnect(accountId: string) {
    const f = metaapiForm[accountId];
    if (!f?.password) { toast.error("Password is required"); return; }
    setConnectingId(accountId);
    const res = await fetch("/api/metaapi/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId, mt5_password: f.password, mt5_server: f.server || undefined }),
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
              onClick={() => setAdding(v => !v)}
              className="btn-action flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
            >
              {adding ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
              {adding ? "Cancel" : "New account"}
            </button>
          </div>

          {/* Add account form */}
          {adding && (
            <div className="card p-4 space-y-4 border-accent/30">
              <p className="text-xs font-medium text-accent uppercase tracking-wider">New account</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-disabled block mb-1.5">Name *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="TTP $100K — Fase 2"
                    className="w-full bg-surface-hi border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-disabled block mb-1.5">Type *</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as AccountType }))}
                    className="w-full bg-surface-hi border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                  >
                    {ACCOUNT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-disabled block mb-1.5">Broker / Exchange</label>
                  <input
                    value={form.broker}
                    onChange={e => setForm(f => ({ ...f, broker: e.target.value }))}
                    placeholder="The Trading Pit / Bitget"
                    className="w-full bg-surface-hi border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-disabled block mb-1.5">Account number</label>
                  <input
                    value={form.account_number}
                    onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))}
                    placeholder="570416698"
                    className="w-full bg-surface-hi border border-border-light rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-disabled block mb-1.5">Initial balance *</label>
                  <input
                    type="number"
                    value={form.initial_balance}
                    onChange={e => setForm(f => ({ ...f, initial_balance: e.target.value }))}
                    placeholder="100000"
                    className="w-full bg-surface-hi border border-border-light rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-disabled block mb-1.5">Currency</label>
                  <select
                    value={form.currency}
                    onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                    className="w-full bg-surface-hi border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <button
                onClick={handleAdd}
                disabled={saving}
                className="btn-action w-full py-2.5 rounded-lg text-sm"
              >
                {saving ? "Saving…" : "Create account"}
              </button>
            </div>
          )}

          {/* Account list */}
          {loading ? (
            <div className="text-center py-12 text-text-disabled text-sm">Loading…</div>
          ) : (
            <div className="space-y-3">
              {accounts.map(acc => {
                const pnl = acc.current_balance - acc.initial_balance;
                const pnlPct = (pnl / acc.initial_balance) * 100;
                const isActive = acc.id === activeAccountId;

                return (
                  <div key={acc.id} className={cn(
                    "card p-4 space-y-3 transition-colors",
                    isActive && "border-accent/40"
                  )}>
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

                      <div className="text-right shrink-0">
                        <p className="text-base font-mono font-semibold text-text-primary">
                          {acc.currency} {acc.current_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </p>
                        <p className={cn("text-xs font-mono", pnl >= 0 ? "text-profit" : "text-loss")}>
                          {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)
                        </p>
                      </div>
                    </div>

                    {/* Balance bar */}
                    <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", pnl >= 0 ? "bg-profit/60" : "bg-loss/60")}
                        style={{ width: `${Math.min(Math.abs(pnlPct) * 2, 100)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {/* Recalculate */}
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

                    {/* MT5 webhook info */}
                    {acc.type === "MT5" && acc.webhook_token && (
                      <div className="pt-2 border-t border-border">
                        <p className="text-[10px] text-text-disabled mb-1.5">EA Configuration (MT5)</p>
                        <div className="space-y-1">
                          {[
                            { label: "WebhookURL", value: `${typeof window !== "undefined" ? window.location.origin : ""}/api/mt5/webhook` },
                            { label: "WebhookToken", value: acc.webhook_token },
                          ].map(({ label, value }) => (
                            <div key={label} className="flex items-center gap-2 bg-surface-2 rounded-lg px-2.5 py-1.5">
                              <span className="text-[9px] text-text-disabled w-24 shrink-0">{label}</span>
                              <code className="text-[9px] text-text-secondary flex-1 truncate font-mono">{value}</code>
                              <button
                                onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}
                                className="text-[9px] text-accent hover:text-accent/70 shrink-0"
                              >
                                Copy
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* MetaApi Auto Sync */}
                    {acc.type === "MT5" && (
                      <div className="pt-2 border-t border-border">
                        <p className="text-[10px] text-text-disabled mb-2">MetaApi Auto Sync</p>

                        {acc.metaapi_account_id ? (
                          /* Connected state */
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-[9px] font-medium bg-profit/10 text-profit px-2 py-0.5 rounded-full">
                                <span className="size-1.5 rounded-full bg-profit inline-block" />
                                Connected
                              </span>
                              <code className="text-[9px] text-text-disabled font-mono truncate">
                                {acc.metaapi_account_id.slice(0, 8)}…{acc.metaapi_account_id.slice(-4)}
                              </code>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleMetaApiSync(acc.id)}
                                disabled={syncingId === acc.id}
                                className="flex items-center gap-1 text-[10px] text-accent hover:text-accent/70 transition-colors disabled:opacity-50"
                              >
                                <RotateCw className={cn("size-3", syncingId === acc.id && "animate-spin")} />
                                {syncingId === acc.id ? "Syncing…" : "Sync now"}
                              </button>
                              <span className="text-text-disabled text-[9px]">·</span>
                              <button
                                onClick={() => handleMetaApiDisconnect(acc.id)}
                                disabled={disconnectingId === acc.id}
                                className="flex items-center gap-1 text-[10px] text-loss/70 hover:text-loss transition-colors disabled:opacity-50"
                              >
                                <Unplug className="size-3" />
                                {disconnectingId === acc.id ? "Disconnecting…" : "Disconnect"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Not connected — show connect form */
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[9px] text-text-disabled block mb-1">
                                  MT5 Server{acc.mt5_server ? ` (${acc.mt5_server})` : ""}
                                </label>
                                <input
                                  value={metaapiForm[acc.id]?.server ?? ""}
                                  onChange={e => setMetaapiForm(prev => ({
                                    ...prev,
                                    [acc.id]: { ...prev[acc.id], server: e.target.value, password: prev[acc.id]?.password ?? "" },
                                  }))}
                                  placeholder={acc.mt5_server ?? "TheTradingPit-Live"}
                                  className="w-full bg-surface-2 border border-border-light rounded px-2 py-1 text-[10px] font-mono text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-text-disabled block mb-1">
                                  Investor password *
                                </label>
                                <input
                                  type="password"
                                  value={metaapiForm[acc.id]?.password ?? ""}
                                  onChange={e => setMetaapiForm(prev => ({
                                    ...prev,
                                    [acc.id]: { ...prev[acc.id], password: e.target.value, server: prev[acc.id]?.server ?? "" },
                                  }))}
                                  placeholder="read-only password"
                                  className="w-full bg-surface-2 border border-border-light rounded px-2 py-1 text-[10px] text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
                                />
                              </div>
                            </div>
                            <button
                              onClick={() => handleMetaApiConnect(acc.id)}
                              disabled={connectingId === acc.id || !metaapiForm[acc.id]?.password}
                              className="flex items-center gap-1.5 text-[10px] text-accent border border-accent/30 hover:border-accent/60 rounded px-2.5 py-1 transition-colors disabled:opacity-50"
                            >
                              <Zap className="size-3" />
                              {connectingId === acc.id ? "Connecting…" : "Connect MetaTrader"}
                            </button>
                          </div>
                        )}
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
  );
}
