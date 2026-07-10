"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Save, ExternalLink, Trash2,
  AlertCircle, CheckCircle2, Copy, Bookmark, Upload, Mic, Play, Plus,
  MoreHorizontal, Pencil,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import AccountSelector from "@/components/layout/AccountSelector";
import { createClient } from "@/lib/supabase/client";
import EmotionSelector from "@/components/journal/EmotionSelector";
import ConfluenceChecklist from "@/components/journal/ConfluenceChecklist";

const INSTRUMENTS = ["EURUSD","GBPUSD","USDJPY","XAUUSD","AUDUSD","USDCAD","USDCHF","EURJPY","GBPJPY","NAS100","SP500"];
const SESSIONS = ["LONDON","NEW_YORK","OVERLAP","TOKYO"] as const;
const MARKETS = ["FOREX","METALS","INDICES"] as const;
const TIMEFRAMES = ["1m","5m","15m","1h","4h","D"] as const;

function calcPips(instrument: string, entry: number, exit: number, direction: "LONG" | "SHORT") {
  const diff = direction === "LONG" ? exit - entry : entry - exit;
  const pipSize = instrument === "XAUUSD" ? 0.1 : instrument.includes("JPY") ? 0.01 : 0.0001;
  return diff / pipSize;
}
function calcPnL(instrument: string, lots: number, pips: number) {
  const pipValue = instrument === "XAUUSD" ? 10 : instrument.includes("JPY") ? 9.1 : 10;
  return lots * pips * pipValue;
}
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function inferMarket(instrument: string) {
  if (instrument === "XAUUSD") return "METALS";
  if (instrument === "NAS100" || instrument === "SP500") return "INDICES";
  return "FOREX";
}
function fmtMoney(n: number) {
  return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
}
function fmtDuration(min: number | null) {
  if (min == null) return "—";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

type Trade = {
  id: string;
  instrument: string;
  direction: "LONG" | "SHORT";
  lot_size: number;
  entry_price: number;
  exit_price: number | null;
  sl: number | null;
  tp: number | null;
  open_time: string;
  close_time: string | null;
  duration_minutes: number | null;
  session: string | null;
  gross_pnl: number | null;
  net_pnl: number | null;
  fees: number | null;
  swap: number | null;
  risk_r: number | null;
  return_r: number | null;
  risk_percent: number | null;
  plan_id: string | null;
  entry_emotion: string | null;
  exit_emotion: string | null;
  mistakes: string[] | null;
  notes: string | null;
  followed_plan: boolean | null;
};

type JournalEntry = {
  id?: string;
  hft_chart_url: string | null;
  mft_chart_url: string | null;
  lft_chart_url: string | null;
  review_plan: string | null;
  entry_confluences: Record<string, boolean> | null;
  trade_management_notes: string | null;
  entry_emotion: string | null;
  exit_emotion: string | null;
  ai_analysis: string | null;
};

type Plan = { id: string; name: string; is_active: boolean };

type GlobalStats = { pnl: number; winRate: number | null; expectancy: number | null };

export default function TradeDetailPage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [trade, setTrade] = useState<Trade | null>(null);
  const [entry, setEntry] = useState<JournalEntry>({
    hft_chart_url: null, mft_chart_url: null, lft_chart_url: null,
    review_plan: null, entry_confluences: null, trade_management_notes: null,
    entry_emotion: null, exit_emotion: null, ai_analysis: null,
  });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [prevId, setPrevId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<"overview" | "reflection">("overview");
  const [timeframe, setTimeframe] = useState<string>("5m");

  // Editable core trade fields
  const [instrument, setInstrument] = useState("EURUSD");
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [lotSize, setLotSize] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [session, setSession] = useState<string>("LONDON");
  const [market, setMarket] = useState<string>("FOREX");
  const [followedPlan, setFollowedPlan] = useState<boolean | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [mistakesText, setMistakesText] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) return;
      const uid = data.user.id;
      setUserId(uid);

      const { data: t } = await supabase.from("trades").select("*").eq("id", tradeId).single();
      if (t) {
        const tr = t as Trade;
        setTrade(tr);
        setFollowedPlan(tr.followed_plan);
        setPlanId(tr.plan_id);
        setMistakesText((tr.mistakes ?? []).join("\n"));
        setNotes(tr.notes ?? "");
        setInstrument(tr.instrument);
        setDirection(tr.direction);
        setLotSize(tr.lot_size.toString());
        setEntryPrice(tr.entry_price.toString());
        setExitPrice(tr.exit_price?.toString() ?? "");
        setSl(tr.sl?.toString() ?? "");
        setTp(tr.tp?.toString() ?? "");
        setOpenTime(toLocalInput(tr.open_time));
        setCloseTime(toLocalInput(tr.close_time));
        setSession(tr.session ?? "LONDON");
        setMarket(inferMarket(tr.instrument));
      }

      const { data: je } = await supabase.from("journal_entries").select("*").eq("trade_id", tradeId).maybeSingle();
      if (je) setEntry(je as JournalEntry);

      const { data: pl } = await supabase.from("plans").select("id, name, is_active").eq("user_id", uid);
      if (pl) setPlans(pl as Plan[]);

      // Adjacent trades + global stats from all closed trades
      const { data: all } = await supabase
        .from("trades")
        .select("id, net_pnl, return_r")
        .eq("user_id", uid)
        .order("open_time", { ascending: true });
      if (all) {
        const rows = all as { id: string; net_pnl: number | null; return_r: number | null }[];
        const idx = rows.findIndex(r => r.id === tradeId);
        setPrevId(idx > 0 ? rows[idx - 1].id : null);
        setNextId(idx >= 0 && idx < rows.length - 1 ? rows[idx + 1].id : null);

        const closed = rows.filter(r => r.net_pnl != null);
        const pnl = closed.reduce((s, r) => s + (r.net_pnl ?? 0), 0);
        const wins = closed.filter(r => (r.net_pnl ?? 0) > 0).length;
        setGlobalStats({
          pnl,
          winRate: closed.length > 0 ? Math.round((wins / closed.length) * 100) : null,
          expectancy: closed.length > 0 ? pnl / closed.length : null,
        });
      }
    });
  }, [supabase, tradeId]);

  // Live P&L / R preview
  const preview = useMemo(() => {
    const e = parseFloat(entryPrice), x = parseFloat(exitPrice), lots = parseFloat(lotSize);
    if (!e || !x || !lots) return null;
    const pips = calcPips(instrument, e, x, direction);
    const gross = calcPnL(instrument, lots, pips);
    const sw = trade?.swap ?? 0;
    const fee = trade?.fees ?? 0;
    const net = parseFloat((gross + sw + fee).toFixed(2));
    const s = parseFloat(sl);
    const r = s ? (direction === "LONG" ? x - e : e - x) / Math.abs(e - s) : null;
    return { gross, net, pips, r };
  }, [entryPrice, exitPrice, lotSize, sl, instrument, direction, trade]);

  const displayNet = preview?.net ?? trade?.net_pnl ?? 0;
  const displayGross = preview?.gross ?? trade?.gross_pnl ?? null;
  const displayR = preview?.r ?? trade?.return_r ?? null;
  const costs = (trade?.swap ?? 0) + (trade?.fees ?? 0);

  const durationMin = useMemo(() => {
    if (openTime && closeTime) {
      return Math.round((new Date(closeTime).getTime() - new Date(openTime).getTime()) / 60000);
    }
    return trade?.duration_minutes ?? null;
  }, [openTime, closeTime, trade]);

  const rrText = useMemo(() => {
    const e = parseFloat(entryPrice), s = parseFloat(sl), t = parseFloat(tp);
    if (!e || !s || !t) return "—";
    const risk = Math.abs(e - s);
    const reward = Math.abs(t - e);
    if (!risk) return "—";
    return `1:${(reward / risk).toFixed(2)}`;
  }, [entryPrice, sl, tp]);

  const selectedConfluences = useMemo(() => {
    if (!entry.entry_confluences) return [];
    return Object.entries(entry.entry_confluences).filter(([, v]) => v).map(([k]) => k);
  }, [entry.entry_confluences]);

  const mistakesList = mistakesText.split("\n").map(s => s.trim()).filter(Boolean);
  const lessonsList = (entry.trade_management_notes ?? "").split("\n").map(s => s.trim()).filter(Boolean).slice(0, 4);
  const screenshots = [entry.hft_chart_url, entry.mft_chart_url, entry.lft_chart_url].filter(Boolean) as string[];

  // ── Persistence ─────────────────────────────────────────────
  const saveTradeField = useCallback(async (patch: Record<string, unknown>) => {
    const { error } = await db.from("trades").update(patch).eq("id", tradeId);
    if (error) toast.error("Error saving");
  }, [db, tradeId]);

  const saveEntryField = useCallback(async (patch: Partial<JournalEntry>) => {
    if (!userId) return;
    if (entry.id) {
      const { error } = await db.from("journal_entries").update(patch).eq("id", entry.id);
      if (error) toast.error("Error saving");
    } else {
      const { data: created, error } = await db.from("journal_entries")
        .insert({ trade_id: tradeId, user_id: userId, ...patch })
        .select().single();
      if (error) { toast.error("Error saving"); return; }
      if (created) setEntry(e => ({ ...e, id: (created as { id: string }).id }));
    }
  }, [db, tradeId, userId, entry.id]);

  async function handleSaveTrade() {
    if (!trade) return;
    if (!entryPrice) { toast.error("Entry price is required"); return; }
    setSaving(true);
    try {
      const e = parseFloat(entryPrice);
      const x = exitPrice ? parseFloat(exitPrice) : null;
      const lots = parseFloat(lotSize) || 0.1;
      const sw = trade.swap ?? 0;
      const fee = trade.fees ?? 0;
      const openDt = openTime ? new Date(openTime).toISOString() : trade.open_time;
      const closeDt = closeTime ? new Date(closeTime).toISOString() : null;

      let grossPnl: number | null = null;
      let netPnl: number | null = null;
      let returnR: number | null = null;
      let durMin: number | null = null;

      if (x) {
        const pips = calcPips(instrument, e, x, direction);
        grossPnl = parseFloat(calcPnL(instrument, lots, pips).toFixed(2));
        netPnl = parseFloat((grossPnl + sw + fee).toFixed(2));
      }
      if (x && sl) {
        const ret = direction === "LONG" ? x - e : e - x;
        returnR = parseFloat((ret / Math.abs(e - parseFloat(sl))).toFixed(3));
      }
      if (closeDt) {
        durMin = Math.round((new Date(closeDt).getTime() - new Date(openDt).getTime()) / 60000);
      }

      await db.from("trades").update({
        instrument, direction, lot_size: lots,
        entry_price: e, exit_price: x,
        sl: sl ? parseFloat(sl) : null,
        tp: tp ? parseFloat(tp) : null,
        open_time: openDt, close_time: closeDt,
        duration_minutes: durMin, session,
        gross_pnl: grossPnl, net_pnl: netPnl, return_r: returnR,
      }).eq("id", tradeId);

      setTrade(prev => prev ? {
        ...prev, instrument, direction, lot_size: lots, entry_price: e, exit_price: x,
        sl: sl ? parseFloat(sl) : null, tp: tp ? parseFloat(tp) : null,
        open_time: openDt, close_time: closeDt, duration_minutes: durMin,
        session, gross_pnl: grossPnl, net_pnl: netPnl, return_r: returnR,
      } : prev);
      toast.success("Trade saved");
    } catch {
      toast.error("Error saving");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this trade? This action cannot be undone.")) return;
    setDeleting(true);
    const { error } = await db.from("trades").delete().eq("id", tradeId);
    if (error) { toast.error("Error deleting"); setDeleting(false); return; }
    toast.success("Trade deleted");
    router.push("/journal");
  }

  async function handleConfluencesChange(sel: string[]) {
    const obj: Record<string, boolean> = {};
    for (const s of sel) obj[s] = true;
    setEntry(e => ({ ...e, entry_confluences: obj }));
    await saveEntryField({ entry_confluences: obj });
  }

  if (!trade) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <header className="h-14 flex items-center px-6 border-b border-border bg-[rgba(20,18,31,0.75)] backdrop-blur-md shrink-0">
          <Link href="/journal" className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors">
            <ArrowLeft className="size-3.5" /> Back to journal
          </Link>
        </header>
        <div className="flex-1 flex items-center justify-center text-text-disabled text-sm">Loading…</div>
      </div>
    );
  }

  const openDate = new Date(trade.open_time);
  const closeDate = trade.close_time ? new Date(trade.close_time) : null;
  const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dateLine = `${openDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · ${fmtTime(openDate)}${closeDate ? ` – ${fmtTime(closeDate)}` : ""} · ${(session ?? "").replace("_", " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())} Session`;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Custom top bar ─────────────────────────────── */}
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-[rgba(20,18,31,0.75)] backdrop-blur-md shrink-0">
        <Link href="/journal" className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors">
          <ArrowLeft className="size-3.5" /> Back to journal
        </Link>

        <div className="flex items-center gap-2">
          <button
            disabled={!prevId}
            onClick={() => prevId && router.push(`/journal/${prevId}`)}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border-light text-xs transition-colors",
              prevId ? "text-text-secondary hover:bg-surface-2 hover:text-text-primary" : "text-text-disabled cursor-not-allowed opacity-50"
            )}
          >
            <ChevronLeft className="size-3.5" /> Previous
          </button>
          <button
            disabled={!nextId}
            onClick={() => nextId && router.push(`/journal/${nextId}`)}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border-light text-xs transition-colors",
              nextId ? "text-text-secondary hover:bg-surface-2 hover:text-text-primary" : "text-text-disabled cursor-not-allowed opacity-50"
            )}
          >
            Next <ChevronRight className="size-3.5" />
          </button>
        </div>

        <AccountSelector />
      </header>

      {/* ── Trade header + global stats ────────────────── */}
      <div className="px-6 py-4 border-b border-border shrink-0 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-text-primary tracking-tight">
              {instrument} {direction}
            </h1>
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-semibold border",
              direction === "LONG"
                ? "bg-profit/10 text-profit border-profit/30"
                : "bg-loss/10 text-loss border-loss/30"
            )}>
              {direction}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-1">{dateLine}</p>
        </div>

        <div className="flex items-center gap-4">
          {globalStats && (
            <div className="hidden lg:flex items-center bg-surface border border-border rounded-xl px-4 py-2 gap-4">
              {[
                { label: "P&L", value: fmtMoney(globalStats.pnl), color: globalStats.pnl >= 0 ? "text-profit" : "text-loss" },
                { label: "R Multiple", value: displayR != null ? `${displayR >= 0 ? "+" : ""}${displayR.toFixed(2)}R` : "—", color: displayR != null && displayR >= 0 ? "text-profit" : "text-loss" },
                { label: "Win Rate", value: globalStats.winRate != null ? `${globalStats.winRate}%` : "—", color: "text-text-primary" },
                { label: "Expectancy", value: globalStats.expectancy != null ? fmtMoney(globalStats.expectancy) : "—", color: globalStats.expectancy != null && globalStats.expectancy >= 0 ? "text-profit" : "text-loss" },
              ].map(({ label, value, color }, i) => (
                <div key={label} className={cn("flex flex-col px-2", i > 0 && "border-l border-border pl-4")}>
                  <span className="text-[10px] text-text-disabled">{label}</span>
                  <span className={cn("text-xs font-mono font-semibold", color)}>{value}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleSaveTrade}
            disabled={saving}
            className="btn-action flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs"
          >
            <Pencil className="size-3.5" />
            {saving ? "Saving…" : "Save Trade"}
          </button>
          <button className="p-2 rounded-lg text-text-secondary hover:bg-surface-2 transition-colors">
            <MoreHorizontal className="size-4" />
          </button>
        </div>
      </div>

      {/* ── 3-column body ──────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT PANEL */}
        <div className="w-[280px] border-r border-border bg-surface-light shrink-0 overflow-y-auto">
          <div className="p-4 space-y-4">

            {/* Net P&L */}
            <div className="card p-4">
              <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Net P&L</p>
              <p className={cn(
                "text-4xl font-mono font-bold tabular-nums tracking-tight",
                displayNet >= 0 ? "text-profit" : "text-loss"
              )}>
                {fmtMoney(displayNet)}
              </p>
              <p className="text-sm text-text-secondary mt-1">
                {displayR != null ? `${displayR >= 0 ? "+" : ""}${displayR.toFixed(2)}R` : "—"}
                {preview && <span> · {preview.pips >= 0 ? "+" : ""}{preview.pips.toFixed(1)} pips</span>}
              </p>
              <div className="mt-3 pt-3 border-t border-border space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-text-disabled">Gross P&L</span>
                  <span className={cn("font-mono", (displayGross ?? 0) >= 0 ? "text-profit" : "text-loss")}>
                    {displayGross != null ? fmtMoney(displayGross) : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-text-disabled">Costs</span>
                  <span className={cn("font-mono", costs >= 0 ? "text-profit" : "text-loss")}>
                    {fmtMoney(costs)}
                  </span>
                </div>
              </div>
            </div>

            {/* Trade metadata */}
            <div className="card p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-text-muted block mb-1">Instrument</label>
                  <select value={instrument} onChange={e => { setInstrument(e.target.value); setMarket(inferMarket(e.target.value)); }}
                    className="w-full bg-surface-hi border border-border-light rounded-lg px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent">
                    {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-text-muted block mb-1">Direction</label>
                  <button
                    type="button"
                    onClick={() => setDirection(d => d === "LONG" ? "SHORT" : "LONG")}
                    className={cn(
                      "w-full py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                      direction === "LONG"
                        ? "bg-profit/15 border-profit/40 text-profit"
                        : "bg-loss/15 border-loss/40 text-loss"
                    )}
                  >
                    {direction}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Entry", value: entryPrice, set: setEntryPrice },
                  { label: "Exit", value: exitPrice, set: setExitPrice },
                  { label: "Stop Loss", value: sl, set: setSl },
                  { label: "Take Profit", value: tp, set: setTp },
                ].map(({ label, value, set }) => (
                  <div key={label}>
                    <label className="text-[11px] text-text-muted block mb-1">{label}</label>
                    <input type="number" step="0.00001" value={value} onChange={e => set(e.target.value)}
                      placeholder="0.00000"
                      className="w-full bg-surface-hi border border-border-light rounded-lg px-2.5 py-1.5 text-sm font-mono text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent" />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-text-muted block mb-1">Lots</label>
                  <input type="number" step="0.01" min="0.01" value={lotSize} onChange={e => setLotSize(e.target.value)}
                    className="w-full bg-surface-hi border border-border-light rounded-lg px-2.5 py-1.5 text-sm font-mono text-text-primary focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[11px] text-text-muted block mb-1">Session</label>
                  <select value={session} onChange={e => setSession(e.target.value)}
                    className="w-full bg-surface-hi border border-border-light rounded-lg px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent">
                    {SESSIONS.map(s => <option key={s} value={s}>{s.replace("_"," ")}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-text-muted block mb-1">Open</label>
                <input type="datetime-local" value={openTime} onChange={e => setOpenTime(e.target.value)}
                  className="w-full bg-surface-hi border border-border-light rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-[11px] text-text-muted block mb-1">Close</label>
                <input type="datetime-local" value={closeTime} onChange={e => setCloseTime(e.target.value)}
                  className="w-full bg-surface-hi border border-border-light rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[11px] text-text-muted block mb-0.5">Duration</label>
                  <p className="text-sm text-text-primary font-mono">{fmtDuration(durationMin)}</p>
                </div>
                <div>
                  <label className="text-[11px] text-text-muted block mb-0.5">RR</label>
                  <p className="text-sm text-text-primary font-mono">{rrText}</p>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-text-muted block mb-1">Market</label>
                <select value={market} onChange={e => setMarket(e.target.value)}
                  className="w-full bg-surface-hi border border-border-light rounded-lg px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent">
                  {MARKETS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <button onClick={handleSaveTrade} disabled={saving}
              className="btn-action w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm">
              <Save className="size-4" />
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>

        {/* CENTER PANEL */}
        <div className="flex-1 overflow-y-auto">
          {/* Tabs */}
          <div className="flex items-center gap-1 px-6 pt-4 border-b border-border sticky top-0 bg-bg z-10">
            {(["overview","reflection"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors",
                  tab === t
                    ? "border-accent text-accent"
                    : "border-transparent text-text-secondary hover:text-text-primary"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="p-6 space-y-4">
            {tab === "overview" ? (
              <>
                {/* Emotions */}
                <div className="card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-text-primary">Emotions</h3>
                    <span className="text-xs px-2.5 py-1 rounded-lg bg-surface-2 border border-border text-text-secondary">
                      Control Score <span className="text-accent font-semibold">8/10</span>
                    </span>
                  </div>
                  <EmotionSelector
                    label="On Entry"
                    selected={trade.entry_emotion}
                    onChange={em => {
                      setTrade(t => t ? { ...t, entry_emotion: em } : t);
                      saveTradeField({ entry_emotion: em });
                    }}
                  />
                  <EmotionSelector
                    label="On Exit"
                    selected={trade.exit_emotion}
                    onChange={em => {
                      setTrade(t => t ? { ...t, exit_emotion: em } : t);
                      saveTradeField({ exit_emotion: em });
                    }}
                  />
                </div>

                {/* Trade Chart */}
                <div className="card p-5 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-sm font-semibold text-text-primary">Trade Chart</h3>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        {TIMEFRAMES.map(tf => (
                          <button
                            key={tf}
                            onClick={() => setTimeframe(tf)}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-xs border transition-colors",
                              timeframe === tf
                                ? "bg-surface-hi border-border-light text-text-primary"
                                : "border-transparent text-text-disabled hover:text-text-secondary"
                            )}
                          >
                            {tf}
                          </button>
                        ))}
                      </div>
                      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-light text-xs text-text-secondary hover:bg-surface-2 transition-colors">
                        Open in charts <ExternalLink className="size-3" />
                      </button>
                    </div>
                  </div>

                  {entry.hft_chart_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={entry.hft_chart_url} alt="Trade chart" className="rounded-xl border border-border w-full object-cover max-h-96" />
                  ) : (
                    <div className="bg-surface-2 rounded-xl h-64 flex flex-col items-center justify-center gap-3">
                      <p className="text-sm text-text-disabled">No chart uploaded</p>
                      <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border-light text-xs text-text-secondary hover:bg-surface-hover transition-colors">
                        <Upload className="size-3.5" /> Upload chart
                      </button>
                    </div>
                  )}
                </div>

                {/* Trade Plan & Review */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="card p-5 space-y-2">
                    <h3 className="text-sm font-semibold text-text-primary">Trade Plan</h3>
                    <div className="bg-surface-2 rounded-xl p-3 text-sm text-text-secondary leading-relaxed min-h-[100px] whitespace-pre-wrap">
                      {entry.review_plan || trade.notes || <span className="text-text-disabled italic">No plan recorded</span>}
                    </div>
                    <Link href="/plan-mode" className="inline-flex items-center gap-1 text-xs text-accent hover:text-action-hover transition-colors">
                      View full plan →
                    </Link>
                  </div>
                  <div className="card p-5 space-y-2">
                    <h3 className="text-sm font-semibold text-text-primary">Plan Review</h3>
                    <textarea
                      value={entry.trade_management_notes ?? ""}
                      onChange={e => setEntry(en => ({ ...en, trade_management_notes: e.target.value || null }))}
                      onBlur={() => saveEntryField({ trade_management_notes: entry.trade_management_notes })}
                      placeholder="How did the execution compare to your plan?"
                      className="w-full bg-surface-hi border border-border-light rounded-xl p-3 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent resize-none min-h-[100px]"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Reflection */}
                <div className="card p-5 space-y-1">
                  <h3 className="text-sm font-semibold text-text-primary">Review & Reflection</h3>
                  <p className="text-xs text-text-secondary">Take a moment to review your trade and document insights.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Did you follow your plan? */}
                  <div className="card p-5 space-y-3">
                    <h4 className="text-sm font-medium text-text-primary">Did you follow your plan?</h4>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          const v = followedPlan === true ? null : true;
                          setFollowedPlan(v);
                          saveTradeField({ followed_plan: v });
                        }}
                        className={cn(
                          "w-full flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm transition-colors",
                          followedPlan === true
                            ? "border-profit bg-profit/5 text-text-primary"
                            : "border-border bg-surface-hi text-text-secondary hover:bg-surface-hover"
                        )}
                      >
                        <span className={cn(
                          "size-4 rounded flex items-center justify-center border shrink-0",
                          followedPlan === true ? "bg-profit border-profit" : "border-border-light"
                        )}>
                          {followedPlan === true && <CheckCircle2 className="size-3 text-white" />}
                        </span>
                        Yes, I followed my plan
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const v = followedPlan === false ? null : false;
                          setFollowedPlan(v);
                          saveTradeField({ followed_plan: v });
                        }}
                        className={cn(
                          "w-full flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm transition-colors",
                          followedPlan === false
                            ? "border-loss bg-loss/5 text-text-primary"
                            : "border-border bg-surface-hi text-text-secondary hover:bg-surface-hover"
                        )}
                      >
                        <span className={cn(
                          "size-4 rounded flex items-center justify-center border shrink-0",
                          followedPlan === false ? "bg-loss border-loss" : "border-border-light"
                        )}>
                          {followedPlan === false && <span className="text-white text-[10px] leading-none">✗</span>}
                        </span>
                        No, I didn&apos;t follow my plan
                      </button>
                    </div>
                  </div>

                  {/* Which plan? */}
                  <div className="card p-5 space-y-3">
                    <h4 className="text-sm font-medium text-text-primary">Which plan did you intend to follow?</h4>
                    <select
                      value={planId ?? ""}
                      onChange={e => {
                        const v = e.target.value || null;
                        setPlanId(v);
                        saveTradeField({ plan_id: v });
                      }}
                      className="w-full bg-surface-hi border border-border-light rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
                    >
                      <option value="">— No plan —</option>
                      {plans.map(p => (
                        <option key={p.id} value={p.id}>{p.name}{p.is_active ? " (active)" : ""}</option>
                      ))}
                    </select>
                    <Link href="/plan-mode" className="inline-flex items-center gap-1 text-xs text-accent hover:text-action-hover transition-colors">
                      View plan <ExternalLink className="size-3" />
                    </Link>
                  </div>
                </div>

                {/* Entry Confluences */}
                <div className="card p-5 space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-text-primary">Entry Confluences</h4>
                    <p className="text-xs text-text-secondary">Select all that apply</p>
                  </div>
                  <ConfluenceChecklist selected={selectedConfluences} onChange={handleConfluencesChange} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Trade Management */}
                  <div className="card p-5 space-y-3">
                    <div>
                      <h4 className="text-sm font-medium text-text-primary">Trade Management</h4>
                      <p className="text-xs text-text-secondary">How did you manage this trade?</p>
                    </div>
                    <textarea
                      value={entry.trade_management_notes ?? ""}
                      onChange={e => setEntry(en => ({ ...en, trade_management_notes: e.target.value || null }))}
                      onBlur={() => saveEntryField({ trade_management_notes: entry.trade_management_notes })}
                      placeholder="Moved SL to BE after structure break…"
                      className="w-full bg-surface-hi border border-border-light rounded-xl p-3 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent resize-none min-h-[100px]"
                    />
                  </div>

                  {/* Mistakes */}
                  <div className="card p-5 space-y-3">
                    <div>
                      <h4 className="text-sm font-medium text-text-primary">Mistakes</h4>
                      <p className="text-xs text-text-secondary">What could have been improved?</p>
                    </div>
                    <textarea
                      value={mistakesText}
                      onChange={e => setMistakesText(e.target.value)}
                      onBlur={() => {
                        const arr = mistakesText.split("\n").map(s => s.trim()).filter(Boolean);
                        saveTradeField({ mistakes: arr });
                        setTrade(t => t ? { ...t, mistakes: arr } : t);
                      }}
                      placeholder={"One mistake per line…"}
                      className="w-full bg-surface-hi border border-border-light rounded-xl p-3 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent resize-none min-h-[100px]"
                    />
                  </div>
                </div>

                {/* Emotions */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="card p-5">
                    <h4 className="text-sm font-medium text-text-primary mb-1">Entry Emotion</h4>
                    <p className="text-xs text-text-secondary mb-3">How did you feel when entering?</p>
                    <EmotionSelector
                      label="On Entry"
                      selected={entry.entry_emotion}
                      onChange={em => {
                        setEntry(en => ({ ...en, entry_emotion: em }));
                        saveEntryField({ entry_emotion: em });
                      }}
                    />
                  </div>
                  <div className="card p-5">
                    <h4 className="text-sm font-medium text-text-primary mb-1">Exit Emotion</h4>
                    <p className="text-xs text-text-secondary mb-3">How did you feel when exiting?</p>
                    <EmotionSelector
                      label="On Exit"
                      selected={entry.exit_emotion}
                      onChange={em => {
                        setEntry(en => ({ ...en, exit_emotion: em }));
                        saveEntryField({ exit_emotion: em });
                      }}
                    />
                  </div>
                </div>

                {/* Additional Notes */}
                <div className="card p-5 space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-text-primary">Additional Notes</h4>
                    <p className="text-xs text-text-secondary">Anything else you want to note?</p>
                  </div>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    onBlur={() => {
                      saveTradeField({ notes });
                      setTrade(t => t ? { ...t, notes } : t);
                    }}
                    placeholder="Good trade overall. Stuck to most rules…"
                    className="w-full bg-surface-hi border border-border-light rounded-xl p-3 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent resize-none min-h-[80px]"
                  />
                </div>

                {/* Voice Reflection — decorative UI */}
                <div className="card p-5">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-[200px]">
                      <Mic className="size-4 text-text-secondary" />
                      <div>
                        <h4 className="text-sm font-medium text-text-primary">Voice Reflection</h4>
                        <p className="text-xs text-text-secondary">Record a quick voice note about this trade</p>
                      </div>
                    </div>
                    <div className="flex-1 flex items-center gap-3">
                      <button className="size-9 rounded-full bg-accent-soft border border-accent/30 flex items-center justify-center text-accent hover:bg-accent-glow transition-colors shrink-0">
                        <Play className="size-3.5 ml-0.5" />
                      </button>
                      <svg className="flex-1 h-8 text-text-disabled" viewBox="0 0 200 32" preserveAspectRatio="none">
                        {Array.from({ length: 50 }).map((_, i) => {
                          const h = 4 + ((i * 7919) % 20);
                          return <rect key={i} x={i * 4} y={16 - h / 2} width="2" height={h} rx="1" fill="currentColor" />;
                        })}
                      </svg>
                      <span className="text-xs font-mono text-text-secondary shrink-0">00:45</span>
                      <button className="p-1.5 rounded-lg text-text-disabled hover:text-loss hover:bg-loss/10 transition-colors shrink-0">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="w-[300px] border-l border-border bg-surface-light shrink-0 overflow-y-auto hidden xl:block">
          <div className="p-4 space-y-4">

            {/* Mistakes */}
            <div className="card p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 text-loss" />
                <h4 className="text-sm font-medium text-text-primary">Mistakes</h4>
              </div>
              {mistakesList.length > 0 ? (
                <ul className="space-y-1.5">
                  {mistakesList.map((m, i) => (
                    <li key={i} className="text-xs text-text-secondary flex gap-1.5">
                      <span className="text-loss">•</span> {m}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-text-disabled">No mistakes recorded</p>
              )}
            </div>

            {/* Lessons & Improvements */}
            <div className="card p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-profit" />
                <h4 className="text-sm font-medium text-text-primary">Lessons & Improvements</h4>
              </div>
              {lessonsList.length > 0 ? (
                <ul className="space-y-1.5">
                  {lessonsList.map((l, i) => (
                    <li key={i} className="text-xs text-text-secondary flex gap-1.5">
                      <span className="text-profit">•</span> {l}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-text-disabled">No lessons recorded yet</p>
              )}
            </div>

            {/* Screenshots */}
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-text-primary">Screenshots</h4>
                <button className="text-xs text-accent hover:text-action-hover transition-colors">View all</button>
              </div>
              {screenshots.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {screenshots.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Screenshot ${i + 1}`} className="rounded-lg object-cover aspect-video border border-border hover:border-accent/50 transition-colors" />
                    </a>
                  ))}
                </div>
              )}
              <button className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-border-light text-xs text-text-disabled hover:text-text-secondary hover:border-border-light transition-colors">
                <Plus className="size-3.5" /> Add screenshot
              </button>
            </div>

            {/* Tags */}
            <div className="card p-4 space-y-3">
              <h4 className="text-sm font-medium text-text-primary">Tags</h4>
              <div className="flex flex-wrap gap-1.5">
                {session && (
                  <span className="text-[10px] px-2 py-1 rounded-full bg-accent-glow text-accent border border-accent/20">
                    {session.replace("_", " ")} Session
                  </span>
                )}
                {mistakesList.slice(0, 3).map((m, i) => (
                  <span key={i} className="text-[10px] px-2 py-1 rounded-full bg-surface-hi text-text-secondary border border-border-light">
                    {m.length > 24 ? m.slice(0, 24) + "…" : m}
                  </span>
                ))}
                <button className="flex items-center gap-0.5 text-[10px] px-2 py-1 rounded-full border border-dashed border-border-light text-text-disabled hover:text-text-secondary transition-colors">
                  <Plus className="size-2.5" /> Add tag
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="card p-4 space-y-3">
              <h4 className="text-sm font-medium text-text-primary">Quick Actions</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => toast.info("Duplicate coming soon")}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border bg-surface-hi text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                >
                  <Copy className="size-4" />
                  <span className="text-[10px]">Duplicate Trade</span>
                </button>
                <button
                  onClick={() => toast.info("Watchlist coming soon")}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border bg-surface-hi text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                >
                  <Bookmark className="size-4" />
                  <span className="text-[10px]">Add to Watchlist</span>
                </button>
                <button
                  onClick={() => toast.info("Export coming soon")}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border bg-surface-hi text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                >
                  <Upload className="size-4" />
                  <span className="text-[10px]">Export Trade</span>
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-loss/30 bg-loss/5 text-loss hover:bg-loss/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                  <span className="text-[10px]">{deleting ? "Deleting…" : "Delete Trade"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
