"use client";

import { useState, useEffect, useMemo } from "react";
import {
  X, CheckCircle2, AlertTriangle, Clock,
  TrendingUp, Shield, Calendar, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { useAccountStore } from "@/store/account";
import { parseRuleArray } from "@/components/plan/planData";

// ─── Types ────────────────────────────────────────────────────────

type NewsEvent = {
  id: string;
  title: string;
  currency: string;
  date: string;
  impact: "HIGH" | "MEDIUM" | "LOW" | "HOLIDAY";
};

type ActivePlan = {
  id: string;
  name: string;
  max_trades_per_day: number;
  max_daily_loss: number;
  max_daily_profit: number | null;
  entry_models: unknown;
};

export type PreMarketSession = "LONDON" | "NEW_YORK" | "BOTH";

const SESSIONS: { id: PreMarketSession; label: string; time: string }[] = [
  { id: "LONDON",   label: "London",       time: "08:00–12:00 CET" },
  { id: "NEW_YORK", label: "New York",      time: "14:00–18:00 CET" },
  { id: "BOTH",     label: "Both sessions", time: "Full day"        },
];

// ─── LocalStorage helpers ─────────────────────────────────────────

const LS_KEY = () => `premarket_done_${new Date().toISOString().slice(0, 10)}`;

export function isPreMarketDoneToday(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(LS_KEY()) === "1";
}

export function markPreMarketDone(session: PreMarketSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY(), "1");
  localStorage.setItem("premarket_session_today", session);
}

export function getTodaySession(): PreMarketSession | null {
  if (typeof window === "undefined") return null;
  const s = localStorage.getItem("premarket_session_today");
  return (s as PreMarketSession) || null;
}

// ─── Component ────────────────────────────────────────────────────

interface Props {
  onComplete: (session: PreMarketSession) => void;
  onDismiss: () => void;
}

export default function PreMarketModal({ onComplete, onDismiss }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const activeAccount = useAccountStore((s) => s.activeAccount());

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [planChecked, setPlanChecked] = useState(false);
  const [session, setSession] = useState<PreMarketSession>("LONDON");

  const [plan, setPlan] = useState<ActivePlan | null>(null);
  const [todayPnL, setTodayPnL] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [newsEvents, setNewsEvents] = useState<NewsEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const [{ data: planData }, { data: tradesToday }, newsRes] = await Promise.all([
        supabase
          .from("plans")
          .select("id, name, max_trades_per_day, max_daily_loss, max_daily_profit, entry_models")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle(),
        activeAccount
          ? supabase
              .from("trades")
              .select("net_pnl, status, close_time")
              .eq("account_id", activeAccount.id)
              .gte("open_time", todayStart.toISOString())
          : Promise.resolve({ data: null }),
        fetch("/api/news").catch(() => null),
      ]);

      if (planData) setPlan(planData as ActivePlan);

      if (tradesToday) {
        const closed = tradesToday.filter(
          (t: { net_pnl: number | null; close_time: string | null }) => t.close_time !== null,
        );
        setTodayPnL(
          closed.reduce((s: number, t: { net_pnl: number | null }) => s + (t.net_pnl ?? 0), 0),
        );
        setTodayCount(tradesToday.length);
      }

      if (newsRes?.ok) {
        try {
          const { events } = await newsRes.json();
          const today = new Date().toISOString().slice(0, 10);
          setNewsEvents(
            (events as NewsEvent[]).filter(
              (e) => e.impact === "HIGH" && e.date.slice(0, 10) === today,
            ),
          );
        } catch { /* ignore parse errors */ }
      }

      setLoading(false);
    }
    load();
  }, [supabase, activeAccount]);

  // Derived values
  const maxLoss = plan?.max_daily_loss ?? 300;
  const lossUsed = Math.abs(Math.min(0, todayPnL));
  const remainingBudget = maxLoss - lossUsed;
  const lossUsedPct = (lossUsed / maxLoss) * 100;
  const balance = activeAccount?.current_balance ?? null;

  const enabledModels = useMemo(
    () => parseRuleArray(plan?.entry_models).filter((m) => m.enabled).slice(0, 5),
    [plan],
  );

  const now = Date.now();
  const imminent = newsEvents.filter((e) => {
    const ms = new Date(e.date).getTime() - now;
    return ms > 0 && ms < 30 * 60 * 1000;
  });

  function handleComplete() {
    markPreMarketDone(session);
    onComplete(session);
  }

  // ── Shared nav buttons ──────────────────────────────────────────
  function NavBack({ to }: { to: 1 | 2 | 3 }) {
    return (
      <button
        onClick={() => setStep(to)}
        className="py-2.5 px-4 rounded-xl text-text-secondary text-sm hover:bg-surface-2 transition-colors"
      >
        ← Back
      </button>
    );
  }

  function NavNext({ to, disabled = false }: { to: 2 | 3 | 4; disabled?: boolean }) {
    return (
      <button
        onClick={() => !disabled && setStep(to)}
        disabled={disabled}
        className={cn(
          "flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5",
          disabled
            ? "bg-surface-2 text-text-disabled cursor-not-allowed"
            : "bg-accent/20 hover:bg-accent/30 text-accent",
        )}
      >
        Next <ChevronRight className="size-3.5" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="relative w-full sm:max-w-md bg-[#1a1728] border border-[rgba(157,139,255,0.18)] rounded-t-2xl sm:rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.65)] overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-[rgba(157,139,255,0.08)]">
          <div>
            <p className="text-[10px] text-[rgba(157,139,255,0.5)] uppercase tracking-widest mb-0.5">
              Pre-Market Review
            </p>
            <h2 className="text-base font-bold text-white leading-tight">
              {new Date().toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </h2>
          </div>
          <button
            onClick={onDismiss}
            className="p-1.5 rounded-lg text-text-disabled hover:text-text-secondary hover:bg-surface-2 transition-colors shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 px-6 pt-4 pb-1">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={cn(
                "h-1 rounded-full flex-1 transition-all duration-300",
                step > s
                  ? "bg-profit"
                  : step === s
                  ? "bg-accent"
                  : "bg-[rgba(157,139,255,0.12)]",
              )}
            />
          ))}
        </div>

        {/* Step labels */}
        <div className="grid grid-cols-4 px-6 mb-4 text-[9px] text-text-disabled">
          {["Account", "News", "Plan", "Session"].map((l, i) => (
            <span key={l} className={cn("text-center", step === i + 1 && "text-accent font-medium")}>
              {l}
            </span>
          ))}
        </div>

        {loading ? (
          <div className="px-6 pb-10 text-center text-text-disabled text-sm py-10">
            Loading…
          </div>
        ) : (
          <div className="px-6 pb-6">

            {/* ── Step 1: Account State ─────────────────────────── */}
            {step === 1 && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="size-4 text-accent" />
                  <p className="text-sm font-semibold text-text-primary">Account State</p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 mb-4">
                  <div className="bg-[#262237] rounded-xl p-3">
                    <p className="text-[10px] text-text-disabled uppercase tracking-wide mb-1">Balance</p>
                    <p className="text-sm font-mono font-semibold text-text-primary">
                      {balance !== null
                        ? `$${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "—"}
                    </p>
                  </div>

                  <div className="bg-[#262237] rounded-xl p-3">
                    <p className="text-[10px] text-text-disabled uppercase tracking-wide mb-1">Today P&L</p>
                    <p className={cn("text-sm font-mono font-semibold", todayPnL >= 0 ? "text-profit" : "text-loss")}>
                      {todayPnL >= 0 ? "+" : ""}${Math.abs(todayPnL).toFixed(2)}
                    </p>
                  </div>

                  <div className="bg-[#262237] rounded-xl p-3">
                    <p className="text-[10px] text-text-disabled uppercase tracking-wide mb-1">Trades Today</p>
                    <p className="text-sm font-mono font-semibold text-text-primary">
                      {todayCount} / {plan?.max_trades_per_day ?? 3}
                    </p>
                  </div>

                  <div className={cn("rounded-xl p-3", lossUsedPct > 60 ? "bg-loss/10" : "bg-[#262237]")}>
                    <p className="text-[10px] text-text-disabled uppercase tracking-wide mb-1">Daily Budget</p>
                    <p className={cn("text-sm font-mono font-semibold", remainingBudget < maxLoss * 0.4 ? "text-loss" : "text-profit")}>
                      ${remainingBudget.toFixed(0)} left
                    </p>
                  </div>
                </div>

                {/* Loss bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-[10px] text-text-disabled mb-1.5">
                    <span>Daily loss limit</span>
                    <span>${lossUsed.toFixed(2)} / ${maxLoss}</span>
                  </div>
                  <div className="h-1.5 bg-[rgba(255,107,138,0.08)] rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        lossUsedPct > 80 ? "bg-loss" : lossUsedPct > 50 ? "bg-warning" : "bg-[rgba(255,107,138,0.35)]",
                      )}
                      style={{ width: `${Math.min(lossUsedPct, 100)}%` }}
                    />
                  </div>
                </div>

                {lossUsedPct >= 80 && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-loss/10 border border-loss/20 mb-4 text-xs text-loss">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    Daily limit almost reached — consider skipping today.
                  </div>
                )}

                <NavNext to={2} />
              </>
            )}

            {/* ── Step 2: High Impact News ──────────────────────── */}
            {step === 2 && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="size-4 text-accent" />
                  <p className="text-sm font-semibold text-text-primary">
                    HIGH Impact News
                    {newsEvents.length > 0 && (
                      <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-loss/15 text-loss font-normal">
                        {newsEvents.length} today
                      </span>
                    )}
                  </p>
                </div>

                {imminent.length > 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-loss/10 border border-loss/20 mb-3 text-xs text-loss">
                    <AlertTriangle className="size-3.5 shrink-0 animate-pulse" />
                    {imminent.length} event{imminent.length > 1 ? "s" : ""} in &lt;30 min — avoid trading now!
                  </div>
                )}

                {newsEvents.length === 0 ? (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-profit/5 border border-profit/15 mb-4 text-xs text-profit">
                    <CheckCircle2 className="size-4 shrink-0" />
                    No HIGH impact news today. Clean window.
                  </div>
                ) : (
                  <ul className="space-y-2 mb-4 max-h-48 overflow-y-auto pr-1">
                    {newsEvents.map((e) => {
                      const t = new Date(e.date);
                      const minsUntil = (t.getTime() - now) / 60000;
                      const isClose = minsUntil > 0 && minsUntil < 30;
                      const isPast = minsUntil < 0;
                      return (
                        <li
                          key={e.id}
                          className={cn(
                            "flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-xs",
                            isClose
                              ? "bg-loss/10 border border-loss/20"
                              : isPast
                              ? "bg-surface-2/40 opacity-50"
                              : "bg-[#262237]",
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded font-mono shrink-0",
                                isClose ? "bg-loss/20 text-loss" : "bg-accent/15 text-accent",
                              )}
                            >
                              {e.currency}
                            </span>
                            <span className="text-text-primary truncate">{e.title}</span>
                          </div>
                          <span className={cn("font-mono shrink-0 text-[11px]", isClose ? "text-loss" : "text-text-secondary")}>
                            {t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="flex gap-2">
                  <NavBack to={1} />
                  <NavNext to={3} />
                </div>
              </>
            )}

            {/* ── Step 3: Active Plan ───────────────────────────── */}
            {step === 3 && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="size-4 text-accent" />
                  <p className="text-sm font-semibold text-text-primary">Active Plan</p>
                </div>

                {plan ? (
                  <>
                    <div className="bg-[#262237] rounded-xl p-4 mb-3">
                      <p className="text-[10px] text-text-disabled uppercase tracking-wide mb-0.5">Plan</p>
                      <p className="text-sm font-semibold text-text-primary mb-3">{plan.name}</p>

                      {enabledModels.length > 0 && (
                        <>
                          <p className="text-[10px] text-text-disabled uppercase tracking-wide mb-2">Entry models activos</p>
                          <div className="space-y-1.5">
                            {enabledModels.map((m) => (
                              <div key={m.id} className="flex items-center gap-2 text-xs">
                                <div className="size-1.5 rounded-full bg-accent shrink-0" />
                                <span className="text-text-secondary leading-snug">
                                  {m.label.includes("—") ? m.label.split("—")[0].trim() : m.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <label className="flex items-start gap-3 p-3 rounded-xl bg-accent/5 border border-accent/12 cursor-pointer mb-4 hover:bg-accent/8 transition-colors">
                      <input
                        type="checkbox"
                        checked={planChecked}
                        onChange={(e) => setPlanChecked(e.target.checked)}
                        className="mt-0.5 accent-[#9d8bff] shrink-0 cursor-pointer"
                      />
                      <span className="text-xs text-text-secondary leading-relaxed">
                        He revisado el plan, conozco mis modelos de entrada, reglas de gestión y criterios de salida.
                      </span>
                    </label>
                  </>
                ) : (
                  <div className="bg-[#262237] rounded-xl p-4 mb-4 text-xs text-text-disabled">
                    No hay plan activo. Créalo en Plan Mode antes de operar.
                  </div>
                )}

                <div className="flex gap-2">
                  <NavBack to={2} />
                  <NavNext to={4} disabled={!!plan && !planChecked} />
                </div>
              </>
            )}

            {/* ── Step 4: Session ───────────────────────────────── */}
            {step === 4 && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="size-4 text-accent" />
                  <p className="text-sm font-semibold text-text-primary">Sesión del día</p>
                </div>

                <div className="space-y-2 mb-5">
                  {SESSIONS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSession(s.id)}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-all",
                        session === s.id
                          ? "border-accent bg-accent/10 text-text-primary"
                          : "border-[rgba(157,139,255,0.1)] bg-[#262237] text-text-secondary hover:border-accent/25 hover:bg-accent/5",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {session === s.id && (
                          <div className="size-1.5 rounded-full bg-accent" />
                        )}
                        <span className="font-medium">{s.label}</span>
                      </div>
                      <span className="text-[11px] text-text-disabled font-mono">{s.time}</span>
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <NavBack to={3} />
                  <button
                    onClick={handleComplete}
                    className="flex-1 py-2.5 rounded-xl bg-profit/15 hover:bg-profit/25 text-profit text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-profit/20"
                  >
                    <CheckCircle2 className="size-4" />
                    Comenzar sesión
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
