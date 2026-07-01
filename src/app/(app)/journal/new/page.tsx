"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import TopBar from "@/components/layout/TopBar";
import { createClient } from "@/lib/supabase/client";

const INSTRUMENTS = ["EURUSD","GBPUSD","USDJPY","XAUUSD","AUDUSD","USDCAD","USDCHF","EURJPY","GBPJPY","NAS100","SP500"];
const SESSIONS = ["LONDON","NEW_YORK","OVERLAP","TOKYO"] as const;

function toLocalDateTimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function calcPips(instrument: string, entry: number, exit: number, direction: "LONG" | "SHORT") {
  const diff = direction === "LONG" ? exit - entry : entry - exit;
  const pipSize = instrument === "XAUUSD" ? 0.1 : instrument.includes("JPY") ? 0.01 : 0.0001;
  return diff / pipSize;
}

function calcPnL(instrument: string, lots: number, pips: number) {
  const pipValue = instrument === "XAUUSD" ? 10 : instrument.includes("JPY") ? 9.1 : 10;
  return lots * pips * pipValue;
}

export default function NewTradePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const now = new Date();
  const [instrument, setInstrument] = useState("EURUSD");
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [lotSize, setLotSize] = useState("0.10");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [openTime, setOpenTime] = useState(toLocalDateTimeValue(now));
  const [closeTime, setCloseTime] = useState("");
  const [session, setSession] = useState<typeof SESSIONS[number]>("LONDON");
  const [followedPlan, setFollowedPlan] = useState<boolean | null>(null);
  const [notes, setNotes] = useState("");
  const [mt5Ticket, setMt5Ticket] = useState("");
  const [saving, setSaving] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: accs } = await (supabase as any).from("accounts").select("id").eq("user_id", data.user.id).eq("is_active", true).limit(1);
      if (accs && accs.length > 0) setAccountId(accs[0].id);
    });
  }, [supabase]);

  // Auto-calculate P&L preview
  const preview = useMemo(() => {
    const e = parseFloat(entryPrice);
    const x = parseFloat(exitPrice);
    const lots = parseFloat(lotSize);
    if (!e || !x || !lots) return null;
    const pips = calcPips(instrument, e, x, direction);
    const pnl = calcPnL(instrument, lots, pips);
    return { pips: pips.toFixed(1), pnl: pnl.toFixed(2) };
  }, [entryPrice, exitPrice, lotSize, instrument, direction]);

  // Auto-calculate R
  const rPreview = useMemo(() => {
    const e = parseFloat(entryPrice);
    const x = parseFloat(exitPrice);
    const s = parseFloat(sl);
    if (!e || !x || !s) return null;
    const risk = Math.abs(e - s);
    const ret = direction === "LONG" ? x - e : e - x;
    return (ret / risk).toFixed(2);
  }, [entryPrice, exitPrice, sl, direction]);

  async function handleSave() {
    if (!userId) { toast.error("Not authenticated"); return; }
    if (!accountId) { toast.error("No active account — create an account first"); return; }
    if (!entryPrice) { toast.error("Entry price is required"); return; }
    if (!openTime) { toast.error("Open time is required"); return; }

    setSaving(true);
    try {
      const e = parseFloat(entryPrice);
      const x = exitPrice ? parseFloat(exitPrice) : null;
      const lots = parseFloat(lotSize) || 0.1;
      const openDt = new Date(openTime).toISOString();
      const closeDt = closeTime ? new Date(closeTime).toISOString() : null;

      let netPnl = null;
      let returnR = null;
      let durationMin = null;

      if (x) {
        const pips = calcPips(instrument, e, x, direction);
        netPnl = parseFloat(calcPnL(instrument, lots, pips).toFixed(2));
      }
      if (x && sl) {
        const risk = Math.abs(e - parseFloat(sl));
        const ret = direction === "LONG" ? x - e : e - x;
        returnR = parseFloat((ret / risk).toFixed(3));
      }
      if (closeDt) {
        durationMin = Math.round((new Date(closeDt).getTime() - new Date(openDt).getTime()) / 60000);
      }

      const { data, error } = await db.from("trades").insert({
        user_id: userId,
        account_id: accountId,
        instrument,
        direction,
        lot_size: lots,
        entry_price: e,
        exit_price: x,
        sl: sl ? parseFloat(sl) : null,
        tp: tp ? parseFloat(tp) : null,
        open_time: openDt,
        close_time: closeDt,
        duration_minutes: durationMin,
        session,
        net_pnl: netPnl,
        gross_pnl: netPnl,
        return_r: returnR,
        followed_plan: followedPlan,
        notes: notes || null,
        source: "MANUAL",
        mt5_ticket: mt5Ticket.trim() || null,
      }).select().single();

      if (error) throw error;
      toast.success("Trade registered");
      router.push(`/journal/${(data as { id: string }).id}`);
    } catch {
      toast.error("Error saving trade");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Register trade" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-4">

          <button onClick={() => router.back()}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors">
            <ArrowLeft className="size-3.5" /> Back to journal
          </button>

          {/* Instrumento + dirección */}
          <div className="card-light p-4 space-y-3">
            <p className="section-title">Instrument</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-disabled block mb-1.5">Pair / Instrument</label>
                <select value={instrument} onChange={e => setInstrument(e.target.value)}
                  className="w-full bg-surface-hi border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent">
                  {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-disabled block mb-1.5">Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["LONG","SHORT"] as const).map(d => (
                    <button key={d} type="button" onClick={() => setDirection(d)}
                      className={cn(
                        "py-2 rounded-lg text-sm font-medium border transition-colors",
                        direction === d
                          ? d === "LONG" ? "bg-profit/10 border-profit/30 text-profit" : "bg-loss/10 border-loss/30 text-loss"
                          : "bg-surface-2 border-border text-text-disabled"
                      )}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Precios */}
          <div className="card-light p-4 space-y-3">
            <p className="section-title">Prices</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Entry *", value: entryPrice, set: setEntryPrice },
                { label: "Exit", value: exitPrice, set: setExitPrice },
                { label: "Stop Loss", value: sl, set: setSl },
                { label: "Take Profit", value: tp, set: setTp },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <label className="text-xs text-text-disabled block mb-1.5">{label}</label>
                  <input type="number" step="0.00001" value={value}
                    onChange={e => set(e.target.value)}
                    placeholder="0.00000"
                    className="w-full bg-surface-hi border border-border-light rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent" />
                </div>
              ))}
            </div>

            {/* P&L preview */}
            {preview && (
              <div className={cn(
                "flex items-center justify-between px-3 py-2 rounded-lg text-sm font-mono",
                parseFloat(preview.pnl) >= 0 ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"
              )}>
                <span>{preview.pips} pips</span>
                <span>{parseFloat(preview.pnl) >= 0 ? "+" : ""}{preview.pnl} USD</span>
                {rPreview && <span>{parseFloat(rPreview) >= 0 ? "+" : ""}{rPreview}R</span>}
              </div>
            )}
          </div>

          {/* Lotes + sesión + tiempos */}
          <div className="card-light p-4 space-y-3">
            <p className="section-title">Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-disabled block mb-1.5">Lots</label>
                <input type="number" step="0.01" min="0.01" value={lotSize}
                  onChange={e => setLotSize(e.target.value)}
                  className="w-full bg-surface-hi border border-border-light rounded-lg px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-xs text-text-disabled block mb-1.5">Session</label>
                <select value={session} onChange={e => setSession(e.target.value as typeof SESSIONS[number])}
                  className="w-full bg-surface-hi border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent">
                  {SESSIONS.map(s => <option key={s} value={s}>{s.replace("_"," ")}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-disabled block mb-1.5">Open *</label>
                <input type="datetime-local" value={openTime}
                  onChange={e => setOpenTime(e.target.value)}
                  className="w-full bg-surface-hi border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-xs text-text-disabled block mb-1.5">Close</label>
                <input type="datetime-local" value={closeTime}
                  onChange={e => setCloseTime(e.target.value)}
                  className="w-full bg-surface-hi border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent" />
              </div>
            </div>
            <div>
              <label className="text-xs text-text-disabled block mb-1.5">
                Ticket MT5{" "}
                <span className="text-text-disabled/60 font-normal">(optional — avoids duplicates if the EA also closes this trade)</span>
              </label>
              <input
                type="text"
                value={mt5Ticket}
                onChange={e => setMt5Ticket(e.target.value)}
                placeholder="e.g. 108302089"
                className="w-full bg-surface-hi border border-border-light rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Plan + notas */}
          <div className="card-light p-4 space-y-3">
            <p className="section-title">Evaluation</p>
            <div>
              <p className="text-xs text-text-disabled mb-2">Did you follow the plan?</p>
              <div className="grid grid-cols-3 gap-2">
                {([true, false, null] as const).map(v => (
                  <button key={String(v)} type="button"
                    onClick={() => setFollowedPlan(v)}
                    className={cn(
                      "py-2 rounded-lg text-xs font-medium border transition-colors",
                      followedPlan === v
                        ? v === true ? "bg-profit/10 border-profit/30 text-profit"
                          : v === false ? "bg-loss/10 border-loss/30 text-loss"
                          : "bg-surface-2 border-accent/30 text-accent"
                        : "bg-surface-2 border-border text-text-disabled"
                    )}>
                    {v === true ? "✓ Yes" : v === false ? "✗ No" : "Not evaluated"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-disabled block mb-1.5">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Setup, confluences, market context…"
                rows={3}
                className="w-full bg-surface-hi border border-border-light rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent resize-none" />
            </div>
          </div>

          <button onClick={handleSave} disabled={saving}
            className="btn-action w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm">
            <Save className="size-4" />
            {saving ? "Saving…" : "Save trade"}
          </button>
        </div>
      </div>
    </div>
  );
}
