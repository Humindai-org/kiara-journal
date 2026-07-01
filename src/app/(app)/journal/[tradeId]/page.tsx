"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, TrendingUp, TrendingDown, Save, Sparkles, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import TopBar from "@/components/layout/TopBar";
import { createClient } from "@/lib/supabase/client";

const INSTRUMENTS = ["EURUSD","GBPUSD","USDJPY","XAUUSD","AUDUSD","USDCAD","USDCHF","EURJPY","GBPJPY","NAS100","SP500"];
const SESSIONS = ["LONDON","NEW_YORK","OVERLAP","TOKYO"] as const;

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
function fmtCost(n: number) {
  return `${n >= 0 ? "+" : ""}$${n.toFixed(2)}`;
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
  trade_management_notes: string | null;
  entry_emotion: string | null;
  exit_emotion: string | null;
  ai_analysis: string | null;
};

const EMOTIONS = ["Calmo","Confiado","Ansioso","FOMO","Vengativo","Aburrido","Impaciente","Enfocado","Dudoso","Eufórico"];
const MISTAKES = ["Moví el SL","Cerré en pánico","Entré sin confluencias","Ignoré la narrativa","Sobredimensioné","Operé en noticia","FOMO","Revenge trade","No seguí TP1","Operé fuera de horario"];

export default function TradeDetailPage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [trade, setTrade] = useState<Trade | null>(null);
  const [entry, setEntry] = useState<JournalEntry>({
    hft_chart_url: null, mft_chart_url: null, lft_chart_url: null,
    review_plan: null, trade_management_notes: null,
    entry_emotion: null, exit_emotion: null, ai_analysis: null,
  });
  const [followedPlan, setFollowedPlan] = useState<boolean | null>(null);
  const [selectedMistakes, setSelectedMistakes] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

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

  // Costs — signed values (negative = cost)
  const [swapValue, setSwapValue] = useState("0");
  const [feesValue, setFeesValue] = useState("0");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      const { data: t } = await supabase.from("trades").select("*").eq("id", tradeId).single();
      if (t) {
        const tr = t as Trade;
        setTrade(tr);
        setFollowedPlan(tr.followed_plan);
        setSelectedMistakes(tr.mistakes ?? []);
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
        setSwapValue(tr.swap?.toString() ?? "0");
        setFeesValue(tr.fees?.toString() ?? "0");
      }
      const { data: je } = await supabase.from("journal_entries").select("*").eq("trade_id", tradeId).single();
      if (je) setEntry(je as JournalEntry);
    });
  }, [supabase, tradeId]);

  // Live P&L / R preview — gross from prices, net includes swap + fees
  const preview = useMemo(() => {
    const e = parseFloat(entryPrice), x = parseFloat(exitPrice), lots = parseFloat(lotSize);
    if (!e || !x || !lots) return null;
    const pips = calcPips(instrument, e, x, direction);
    const gross = calcPnL(instrument, lots, pips);
    const sw = parseFloat(swapValue) || 0;
    const fee = parseFloat(feesValue) || 0;
    const net = parseFloat((gross + sw + fee).toFixed(2));
    const s = parseFloat(sl);
    const r = s ? (direction === "LONG" ? x - e : e - x) / Math.abs(e - s) : null;
    return { gross, net, pips, r };
  }, [entryPrice, exitPrice, lotSize, sl, swapValue, feesValue, instrument, direction]);

  const displayNet   = preview?.net   ?? trade?.net_pnl   ?? 0;
  const displayGross = preview?.gross ?? trade?.gross_pnl ?? null;
  const displaySwap  = parseFloat(swapValue) || trade?.swap  || 0;
  const displayFees  = parseFloat(feesValue) || trade?.fees  || 0;
  const hasCosts     = displaySwap !== 0 || displayFees !== 0;

  async function handleDelete() {
    if (!confirm("¿Eliminar este trade? Esta acción no se puede deshacer.")) return;
    setDeleting(true);
    const { error } = await db.from("trades").delete().eq("id", tradeId);
    if (error) { toast.error("Error al eliminar"); setDeleting(false); return; }
    toast.success("Trade eliminado");
    router.push("/journal");
  }

  async function handleSave() {
    if (!trade || !userId) return;
    if (!entryPrice) { toast.error("La entrada es obligatoria"); return; }
    setSaving(true);
    try {
      const e = parseFloat(entryPrice);
      const x = exitPrice ? parseFloat(exitPrice) : null;
      const lots = parseFloat(lotSize) || 0.1;
      const sw = parseFloat(swapValue) || 0;
      const fee = parseFloat(feesValue) || 0;
      const openDt = openTime ? new Date(openTime).toISOString() : trade.open_time;
      const closeDt = closeTime ? new Date(closeTime).toISOString() : null;

      let grossPnl: number | null = null;
      let netPnl: number | null = null;
      let returnR: number | null = null;
      let durationMin: number | null = null;

      if (x) {
        const pips = calcPips(instrument, e, x, direction);
        grossPnl = parseFloat(calcPnL(instrument, lots, pips).toFixed(2));
        netPnl   = parseFloat((grossPnl + sw + fee).toFixed(2));
      }
      if (x && sl) {
        const ret = direction === "LONG" ? x - e : e - x;
        returnR = parseFloat((ret / Math.abs(e - parseFloat(sl))).toFixed(3));
      }
      if (closeDt) {
        durationMin = Math.round((new Date(closeDt).getTime() - new Date(openDt).getTime()) / 60000);
      }

      await db.from("trades").update({
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
        gross_pnl: grossPnl,
        net_pnl:   netPnl,
        fees:      fee || null,
        swap:      sw  || null,
        return_r: returnR,
        followed_plan: followedPlan,
        mistakes: selectedMistakes,
        notes,
        entry_emotion: entry.entry_emotion,
        exit_emotion: entry.exit_emotion,
      }).eq("id", tradeId);

      setTrade(prev => prev ? {
        ...prev, instrument, direction, lot_size: lots, entry_price: e, exit_price: x,
        sl: sl ? parseFloat(sl) : null, tp: tp ? parseFloat(tp) : null,
        open_time: openDt, close_time: closeDt, duration_minutes: durationMin,
        session, gross_pnl: grossPnl, net_pnl: netPnl, fees: fee || null, swap: sw || null,
        return_r: returnR,
      } : prev);

      const jePayload = {
        trade_id: tradeId,
        user_id: userId,
        hft_chart_url: entry.hft_chart_url,
        mft_chart_url: entry.mft_chart_url,
        lft_chart_url: entry.lft_chart_url,
        review_plan: entry.review_plan,
        trade_management_notes: entry.trade_management_notes,
        entry_emotion: entry.entry_emotion,
        exit_emotion: entry.exit_emotion,
      };

      if (entry.id) {
        await db.from("journal_entries").update(jePayload).eq("id", entry.id);
      } else {
        const { data: created } = await db.from("journal_entries").insert(jePayload).select().single();
        if (created) setEntry(e => ({ ...e, id: (created as { id: string }).id }));
      }
      toast.success("Journal guardado");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (!trade) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Trade" />
        <div className="flex-1 flex items-center justify-center text-text-disabled text-sm">Cargando…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title={`${trade.instrument} · ${trade.direction}`} />

      <div className="flex-1 flex overflow-hidden">
        {/* ── Left — trade summary (editable) ──────────── */}
        <div className="w-80 border-r border-border-light bg-surface-light shrink-0 overflow-y-auto">
          <div className="p-4 space-y-4">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              <ArrowLeft className="size-3.5" /> Volver al journal
            </button>

            {/* P&L card — live from editable fields */}
            <div className={cn(
              "card-light p-4 text-center space-y-1",
              displayNet >= 0 ? "border-profit/30 bg-profit/10" : "border-loss/30 bg-loss/10"
            )}>
              <div className="flex items-center justify-center gap-2">
                {direction === "LONG"
                  ? <TrendingUp className="size-4 text-profit" />
                  : <TrendingDown className="size-4 text-loss" />}
                <span className="text-xs text-text-secondary">{instrument} {direction}</span>
              </div>

              {/* Net P&L — big number */}
              <p className={cn(
                "text-4xl font-mono font-bold tabular-nums tracking-tight",
                displayNet >= 0 ? "text-profit" : "text-loss"
              )}>
                {displayNet >= 0 ? "+" : ""}{displayNet.toFixed(2)}
              </p>

              {/* R + pips */}
              <p className="text-xs text-text-disabled">
                {preview?.r != null ? `${preview.r > 0 ? "+" : ""}${preview.r.toFixed(2)}R`
                  : trade.return_r != null ? `${trade.return_r > 0 ? "+" : ""}${trade.return_r.toFixed(2)}R` : "—"}
                {preview && <span className="ml-2">· {preview.pips.toFixed(0)} pips</span>}
              </p>

              {/* Cost breakdown — only shown when there are costs */}
              {hasCosts && (
                <div className="flex justify-center flex-wrap gap-x-3 gap-y-0.5 pt-1 border-t border-white/10">
                  {displayGross != null && (
                    <span className="text-[10px] text-text-disabled">
                      Bruto <span className="font-mono">{fmtCost(displayGross)}</span>
                    </span>
                  )}
                  {displaySwap !== 0 && (
                    <span className={cn("text-[10px]", displaySwap >= 0 ? "text-profit/70" : "text-loss/70")}>
                      Swap <span className="font-mono">{fmtCost(displaySwap)}</span>
                    </span>
                  )}
                  {displayFees !== 0 && (
                    <span className={cn("text-[10px]", displayFees >= 0 ? "text-profit/70" : "text-loss/70")}>
                      Com. <span className="font-mono">{fmtCost(displayFees)}</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Editable instrument + direction */}
            <div className="card-light p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-text-disabled block mb-1">Instrumento</label>
                  <select value={instrument} onChange={e => setInstrument(e.target.value)}
                    className="w-full bg-surface-hi border border-border-light rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent">
                    {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-text-disabled block mb-1">Dirección</label>
                  <div className="grid grid-cols-2 gap-1">
                    {(["LONG","SHORT"] as const).map(d => (
                      <button key={d} type="button" onClick={() => setDirection(d)}
                        className={cn(
                          "py-1.5 rounded-lg text-[11px] font-medium border transition-colors",
                          direction === d
                            ? d === "LONG" ? "bg-profit/15 border-profit/40 text-profit" : "bg-loss/15 border-loss/40 text-loss"
                            : "bg-surface-hi border-border-light text-text-disabled"
                        )}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Editable prices */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Entrada", value: entryPrice, set: setEntryPrice },
                  { label: "Salida", value: exitPrice, set: setExitPrice },
                  { label: "Stop Loss", value: sl, set: setSl },
                  { label: "Take Profit", value: tp, set: setTp },
                ].map(({ label, value, set }) => (
                  <div key={label}>
                    <label className="text-[10px] text-text-disabled block mb-1">{label}</label>
                    <input type="number" step="0.00001" value={value} onChange={e => set(e.target.value)}
                      placeholder="0.00000"
                      className="w-full bg-surface-hi border border-border-light rounded-lg px-2.5 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent" />
                  </div>
                ))}
              </div>

              {/* Lotes + sesión */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-text-disabled block mb-1">Lotes</label>
                  <input type="number" step="0.01" min="0.01" value={lotSize} onChange={e => setLotSize(e.target.value)}
                    className="w-full bg-surface-hi border border-border-light rounded-lg px-2.5 py-1.5 text-xs font-mono text-text-primary focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[10px] text-text-disabled block mb-1">Sesión</label>
                  <select value={session} onChange={e => setSession(e.target.value)}
                    className="w-full bg-surface-hi border border-border-light rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent">
                    {SESSIONS.map(s => <option key={s} value={s}>{s.replace("_"," ")}</option>)}
                  </select>
                </div>
              </div>

              {/* Tiempos */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-text-disabled block mb-1">Apertura</label>
                  <input type="datetime-local" value={openTime} onChange={e => setOpenTime(e.target.value)}
                    className="w-full bg-surface-hi border border-border-light rounded-lg px-2 py-1.5 text-[11px] text-text-primary focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[10px] text-text-disabled block mb-1">Cierre</label>
                  <input type="datetime-local" value={closeTime} onChange={e => setCloseTime(e.target.value)}
                    className="w-full bg-surface-hi border border-border-light rounded-lg px-2 py-1.5 text-[11px] text-text-primary focus:outline-none focus:border-accent" />
                </div>
              </div>

              {/* Swap + Comisión */}
              <div>
                <p className="text-[10px] text-text-disabled mb-1.5 uppercase tracking-wide">Costes</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-text-disabled block mb-1">
                      Swap <span className="normal-case">(– si pagas)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={swapValue}
                      onChange={e => setSwapValue(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-surface-hi border border-border-light rounded-lg px-2.5 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-disabled block mb-1">
                      Comisión <span className="normal-case">(– siempre)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={feesValue}
                      onChange={e => setFeesValue(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-surface-hi border border-border-light rounded-lg px-2.5 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>
                {/* Live net reminder */}
                {preview && hasCosts && (
                  <p className="mt-1.5 text-[10px] text-text-disabled text-right">
                    Neto: <span className={cn("font-mono", preview.net >= 0 ? "text-profit" : "text-loss")}>
                      {fmtCost(preview.net)}
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* Followed plan */}
            <div className="card-light p-3 space-y-2">
              <p className="text-xs text-text-secondary">¿Seguiste el plan?</p>
              <div className="grid grid-cols-2 gap-2">
                {([true, false] as const).map(v => (
                  <button key={String(v)} type="button"
                    onClick={() => setFollowedPlan(followedPlan === v ? null : v)}
                    className={cn(
                      "py-2 rounded-lg text-xs font-medium border transition-colors",
                      followedPlan === v
                        ? v ? "bg-profit/15 border-profit/40 text-profit" : "bg-loss/15 border-loss/40 text-loss"
                        : "bg-surface-hi border-border-light text-text-disabled"
                    )}
                  >
                    {v ? "✓ Sí" : "✗ No"}
                  </button>
                ))}
              </div>
            </div>

            {/* Mistakes */}
            <div className="card-light p-3 space-y-2">
              <p className="text-xs text-text-secondary">Errores cometidos</p>
              <div className="flex flex-wrap gap-1.5">
                {MISTAKES.map(m => (
                  <button key={m} type="button"
                    onClick={() => setSelectedMistakes(prev =>
                      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
                    )}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] border transition-colors",
                      selectedMistakes.includes(m)
                        ? "bg-loss/15 border-loss/40 text-loss"
                        : "chip"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="card-light p-3 space-y-2">
              <p className="text-xs text-text-secondary">Notas</p>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="¿Qué pasó? ¿Qué harías diferente?"
                rows={4}
                className="w-full bg-surface-hi border border-border-light rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent resize-none"
              />
            </div>

            <button onClick={handleSave} disabled={saving}
              className="btn-action w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm"
            >
              <Save className="size-4" />
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>

            <button onClick={handleDelete} disabled={deleting}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-loss/30 text-loss text-xs hover:bg-loss/10 transition-colors disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
              {deleting ? "Eliminando…" : "Eliminar trade"}
            </button>
          </div>
        </div>

        {/* ── Right — journal annotation ───────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* Emociones */}
          <div className="card p-4 space-y-3">
            <p className="section-title">Emociones</p>
            <div className="grid grid-cols-2 gap-6">
              {(["entry_emotion", "exit_emotion"] as const).map(field => (
                <div key={field}>
                  <p className="text-xs text-text-disabled mb-2">{field === "entry_emotion" ? "Al entrar" : "Al salir"}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {EMOTIONS.map(em => (
                      <button key={em} type="button"
                        onClick={() => setEntry(e => ({ ...e, [field]: e[field] === em ? null : em }))}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[10px]",
                          entry[field] === em ? "chip-selected" : "chip"
                        )}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Charts */}
          <div className="card p-4 space-y-4">
            <p className="section-title">Screenshots de charts</p>
            {([
              { key: "hft_chart_url", label: "HFT — Alta temporalidad (1D / 4H)" },
              { key: "mft_chart_url", label: "MFT — Media temporalidad (1H / 15M)" },
              { key: "lft_chart_url", label: "LFT — Baja temporalidad (5M / 1M)" },
            ] as const).map(({ key, label }) => (
              <div key={key}>
                <label className="text-[10px] text-text-disabled block mb-1.5">{label}</label>
                <div className="flex gap-2">
                  <input type="url" value={entry[key] ?? ""}
                    onChange={e => setEntry(en => ({ ...en, [key]: e.target.value || null }))}
                    placeholder="https://… URL de imagen o screenshot"
                    className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
                  />
                  {entry[key] && (
                    <a href={entry[key]!} target="_blank" rel="noopener noreferrer"
                      className="p-2 rounded-lg border border-border text-text-secondary hover:text-accent transition-colors">
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
                {entry[key] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry[key]!} alt={label} className="mt-2 rounded-lg border border-border w-full object-cover max-h-48" />
                )}
              </div>
            ))}
          </div>

          {/* Revisión del plan */}
          <div className="card p-4 space-y-2">
            <p className="section-title">Revisión del plan</p>
            <textarea value={entry.review_plan ?? ""}
              onChange={e => setEntry(en => ({ ...en, review_plan: e.target.value || null }))}
              placeholder="¿Qué confluencias tenías? ¿El setup era válido según MATVARD? ¿Dónde estaba el precio respecto al DVA?"
              rows={4}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent resize-none"
            />
          </div>

          {/* Gestión */}
          <div className="card p-4 space-y-2">
            <p className="section-title">Gestión del trade</p>
            <textarea value={entry.trade_management_notes ?? ""}
              onChange={e => setEntry(en => ({ ...en, trade_management_notes: e.target.value || null }))}
              placeholder="¿Moviste el SL? ¿Cerraste parciales en TP1? ¿Cómo manejaste la posición durante el trade?"
              rows={4}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent resize-none"
            />
          </div>

          {/* AI Analysis */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="section-title">Análisis AI</p>
              <button
                onClick={() => toast.info("Análisis AI disponible en el Paso 13")}
                className="btn-action flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
              >
                <Sparkles className="size-3" />
                Generar análisis
              </button>
            </div>
            {entry.ai_analysis ? (
              <div className="bg-surface-2 rounded-lg p-3 text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                {entry.ai_analysis}
              </div>
            ) : (
              <p className="text-xs text-text-disabled italic">
                El análisis AI evaluará el setup, la gestión y las emociones usando contexto MATVARD completo.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
