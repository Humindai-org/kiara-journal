"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus, Trash2, Clock, CheckCircle2, AlertTriangle,
  Copy, BarChart2, Calendar, Shield, Search,
  Pencil, Lock, Wand2, LayoutDashboard, ListChecks,
  ArrowUpRight, SlidersHorizontal, ArrowDownLeft,
  FileText, BookOpen, ImagePlus, X, Check, Save, Maximize2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import EditableChecklist from "@/components/plan/EditableChecklist";
import {
  loadMATVARD,
  type PlanFormData,
  defaultPlanForm,
} from "@/components/plan/PlanEditor";
import { parseRuleArray, importPlanFromJSON } from "@/components/plan/planData";
import type { RuleItem } from "@/components/plan/planData";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/supabase";
import { ModelDiagram, DiagramTypePicker, detectDiagramType } from "@/components/plan/ModelDiagram";
import type { DiagramType } from "@/components/plan/ModelDiagram";

type Plan = Database["public"]["Tables"]["plans"]["Row"];
type TabKey = "overview" | "proceso" | "entrada" | "gestion" | "salida" | "notas" | "stats";

const TABS: { key: TabKey; label: string; Icon: React.ElementType }[] = [
  { key: "overview",  label: "Summary",           Icon: LayoutDashboard },
  { key: "proceso",   label: "Process",           Icon: ListChecks },
  { key: "entrada",   label: "Entry",             Icon: ArrowUpRight },
  { key: "gestion",   label: "Trade Management",  Icon: SlidersHorizontal },
  { key: "salida",    label: "Exit",              Icon: ArrowDownLeft },
  { key: "notas",     label: "Plan Notes",        Icon: FileText },
  { key: "stats",     label: "Statistics",        Icon: BarChart2 },
];

// ─── DB ↔ Form converters ────────────────────────────────────

function formToDbPayload(form: PlanFormData, userId: string, chartingImage?: string | null) {
  return {
    user_id: userId,
    name: form.name,
    plan_type: form.plan_type,
    is_active: form.is_active,
    charting_process: form.charting_items,
    entry_criteria: form.confluence_items,
    entry_models: form.model_items,
    trade_management_rules: JSON.stringify(form.trade_management_items),
    exit_criteria: JSON.stringify(form.exit_criteria_items),
    notes_items: form.notes_items,
    max_trades_per_day: form.max_trades_per_day,
    max_daily_loss: form.max_daily_loss,
    max_daily_profit: form.max_daily_profit,
    risk_per_trade_percent: form.risk_per_trade_percent,
    trading_window_start: form.trading_window_start,
    trading_window_end: form.trading_window_end,
    min_confluences: form.min_confluences,
    max_consecutive_losses: form.max_consecutive_losses,
    trading_notes: chartingImage ? JSON.stringify({ charting_image: chartingImage }) : null,
  };
}

function dbToForm(plan: Plan): PlanFormData {
  return {
    name: plan.name,
    plan_type: plan.plan_type,
    is_active: plan.is_active,
    charting_items: parseRuleArray(plan.charting_process),
    confluence_items: parseRuleArray(plan.entry_criteria),
    model_items: parseRuleArray(plan.entry_models),
    trade_management_items: parseRuleArray(plan.trade_management_rules),
    exit_criteria_items: parseRuleArray(plan.exit_criteria),
    notes_items: parseRuleArray(plan.notes_items),
    trading_window_start: plan.trading_window_start ?? "08:00",
    trading_window_end: plan.trading_window_end ?? "17:00",
    min_confluences: plan.min_confluences ?? 10,
    max_consecutive_losses: plan.max_consecutive_losses ?? 2,
    max_trades_per_day: plan.max_trades_per_day ?? 3,
    max_daily_loss: plan.max_daily_loss ?? 300,
    max_daily_profit: plan.max_daily_profit ?? 500,
    risk_per_trade_percent: plan.risk_per_trade_percent ?? 0.3,
  };
}

function fmtDate(iso: string | null | undefined, short = false) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    day: "2-digit", month: short ? "short" : "long", year: "numeric",
  });
}

function fmtDateShort(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 900;
      const scale = img.width > MAX ? MAX / img.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function getModelAcronym(label: string): string {
  const d = label.indexOf(" — ");
  return d >= 0 ? label.slice(0, d) : label.slice(0, 10);
}

// ─── Strategy Card ───────────────────────────────────────────

interface StrategyCardProps {
  plan: Plan;
  stat?: { count: number; winRate: number; adherence: number | null };
  selected: boolean;
  onClick: () => void;
  onDuplicate: (e: React.MouseEvent) => void;
}

// Replaces the old decorative sparkline: % of this plan's linked trades
// marked "followed plan" — same definition the Dashboard uses for discipline.
function AdherenceBar({ adherence }: { adherence: number | null }) {
  if (adherence == null) {
    return <div className="h-1.5 rounded-full bg-surface-hi" />;
  }
  const color = adherence >= 80 ? "bg-profit" : adherence >= 60 ? "bg-warning" : "bg-loss";
  return (
    <div className="h-1.5 rounded-full bg-surface-hi overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${adherence}%` }} />
    </div>
  );
}

function StrategyCard({ plan, stat, selected, onClick, onDuplicate }: StrategyCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative shrink-0 w-48 rounded-2xl border p-4 text-left",
        "flex flex-col gap-2 transition-all duration-200",
        selected
          ? "border-accent/70 bg-[rgba(157,139,255,0.10)] shadow-[0_0_32px_rgba(157,139,255,0.18)]"
          : "border-border bg-surface hover:border-accent/30 hover:bg-surface-2"
      )}
    >
      <button
        onClick={onDuplicate}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-surface-hi border border-border text-text-disabled hover:text-accent transition-all"
        title="Duplicate"
      >
        <Copy className="size-2.5" />
      </button>

      {/* Name + status */}
      <div className="pr-6">
        <p className={cn(
          "text-sm font-semibold leading-snug line-clamp-1",
          selected ? "text-accent" : "text-text-primary"
        )}>
          {plan.name}
        </p>
        <p className="text-[10px] text-text-disabled mt-0.5">{plan.plan_type}</p>
      </div>

      {/* Adherence — % of linked trades where the plan was actually followed */}
      <div className="py-0.5 space-y-1">
        <AdherenceBar adherence={stat?.adherence ?? null} />
        <p className="text-[9px] text-text-disabled">
          {!stat || stat.count === 0 ? "No trades yet" : stat.adherence == null ? "Not yet reviewed" : `${stat.adherence.toFixed(0)}% adherence`}
        </p>
      </div>

      {/* Metrics row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] text-text-disabled">Win Rate</p>
          <p className={cn("text-xs font-bold font-mono", selected ? "text-accent" : "text-text-secondary")}>
            {stat && stat.count > 0 ? `${stat.winRate.toFixed(0)}%` : "—%"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-text-disabled">Trades</p>
          <p className={cn("text-xs font-bold font-mono", selected ? "text-accent" : "text-text-secondary")}>
            {stat?.count ?? 0}
          </p>
        </div>
        <span className={cn(
          "self-end text-[9px] font-bold px-1.5 py-0.5 rounded-full tracking-wider",
          plan.is_active ? "bg-profit/15 text-profit" : "bg-surface-hi text-text-disabled"
        )}>
          {plan.is_active ? "ACTIVE" : "INAC."}
        </span>
      </div>
    </button>
  );
}

// ─── Charting Process Diagram ─────────────────────────────────

function ChartingDiagram({ items }: { items: RuleItem[] }) {
  const active = items.filter(i => i.enabled);
  return (
    <div>
      <svg viewBox="0 0 300 170" className="w-full" style={{ height: "auto" }}>
        {/* Session box */}
        <rect x="30" y="8" width="170" height="118" fill="rgba(139,92,246,0.04)"
          stroke="rgba(139,92,246,0.18)" strokeWidth="1" rx="3" strokeDasharray="5,3" />
        <text x="36" y="22" fontSize="7.5" fill="rgba(139,92,246,0.65)" fontFamily="sans-serif">London Session</text>

        {/* Bearish candles */}
        {[
          { cx: 55,  wy: 25, wh: 28, by: 28, bh: 17, bear: true  },
          { cx: 77,  wy: 35, wh: 28, by: 38, bh: 17, bear: true  },
          { cx: 99,  wy: 47, wh: 28, by: 50, bh: 18, bear: true  },
          { cx: 121, wy: 60, wh: 28, by: 63, bh: 17, bear: false },
        ].map(({ cx, wy, wh, by, bh, bear }) => (
          <g key={cx}>
            <line x1={cx} y1={wy} x2={cx} y2={wy + wh} stroke="rgba(180,174,207,0.4)" strokeWidth="1" />
            <rect x={cx - 5} y={by} width={10} height={bh}
              fill={bear ? "rgba(255,107,138,0.65)" : "rgba(157,139,255,0.55)"}
              stroke={bear ? "rgba(255,107,138,0.85)" : "rgba(157,139,255,0.85)"}
              strokeWidth="0.5" />
          </g>
        ))}

        {/* OB zone */}
        <rect x="105" y="63" width="36" height="15" fill="rgba(139,92,246,0.2)"
          stroke="rgba(139,92,246,0.65)" strokeWidth="1" rx="1" />
        <text x="110" y="74" fontSize="7" fill="#9d8bff" fontFamily="sans-serif" fontWeight="600">OB</text>

        {/* FVG zone */}
        <rect x="105" y="79" width="36" height="9" fill="rgba(139,92,246,0.08)"
          stroke="rgba(139,92,246,0.3)" strokeWidth="1" rx="1" strokeDasharray="3,2" />
        <text x="110" y="87" fontSize="7" fill="rgba(157,139,255,0.65)" fontFamily="sans-serif">FVG</text>

        {/* Bullish impulse */}
        <line x1="140" y1="84" x2="218" y2="20" stroke="#44e4b2" strokeWidth="2" strokeLinecap="round" />
        <polygon points="215,17 222,24 213,25" fill="#44e4b2" />

        {/* HTF / MTF / LTF labels */}
        {([
          { x: 8,   label: "HTF: 4H",  sub: "Bullish Bias",       sc: "#44e4b2" },
          { x: 103, label: "MTF: 15m", sub: "Bullish Structure",  sc: "#44e4b2" },
          { x: 198, label: "LTF: 1m",  sub: "Confirmed Setup",    sc: "#9d8bff" },
        ] as const).map(({ x, label, sub, sc }) => (
          <g key={x}>
            <rect x={x} y="136" width="90" height="27" fill="rgba(20,18,31,0.85)"
              stroke="rgba(255,255,255,0.06)" rx="3" />
            <text x={x + 5} y="147" fontSize="7.5" fill="#7f789b" fontFamily="sans-serif">{label}</text>
            <text x={x + 5} y="158" fontSize="7.5" fill={sc} fontFamily="sans-serif" fontWeight="500">{sub}</text>
          </g>
        ))}
      </svg>

      {/* Active criteria tags */}
      {active.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {active.slice(0, 3).map((item) => (
            <span key={item.id}
              className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent-glow border border-accent/20 text-accent truncate max-w-[100px]">
              {item.label.split(" ").slice(0, 2).join(" ")}…
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Entry Model Mini-Card ────────────────────────────────────

function ModelMiniCard({ item, active, onToggle, onExpand }: { item: RuleItem; active: boolean; onToggle?: () => void; onExpand?: () => void }) {
  const acronym = getModelAcronym(item.label);
  const effectiveType = (item.diagramType as DiagramType) || detectDiagramType(item.label);
  return (
    <div
      className={cn(
        "group relative w-full rounded-xl border px-2 pt-2.5 pb-2 text-center transition-all",
        item.enabled
          ? "border-accent/40 bg-[#1c1836] shadow-[0_4px_0_#2a1f5a]"
          : "border-border bg-surface-2 opacity-50"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn("w-full text-center", onToggle && "cursor-pointer active:scale-[0.98]")}
      >
        {active && (
          <div className="absolute top-1.5 left-1.5 z-10 size-4 rounded-full bg-accent/90 flex items-center justify-center">
            <CheckCircle2 className="size-2.5 text-bg" />
          </div>
        )}
        {item.image ? (
          <div className="relative w-full mb-2 rounded-lg overflow-hidden bg-black/30" style={{ height: 140 }}>
            <img src={item.image} alt="" className="w-full h-full object-contain" />
            <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(157,139,255,0.06)" }} />
          </div>
        ) : (
          <ModelDiagram
            type={effectiveType}
            enabled={item.enabled}
            className="w-full mb-2"
            style={{ height: 140 }}
          />
        )}
        <p className={cn(
          "text-[11px] font-bold font-mono leading-tight",
          item.enabled ? "text-accent" : "text-text-disabled"
        )}>
          {acronym}
        </p>
      </button>

      {item.image && onExpand && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onExpand(); }}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-bg/70 border border-border text-text-secondary opacity-0 group-hover:opacity-100 hover:text-accent hover:border-accent/40 transition-all"
          title="Expand image"
        >
          <Maximize2 className="size-3" />
        </button>
      )}
    </div>
  );
}

// ─── Checklist Row (read-only for Resumen view) ───────────────

function CheckRow({ item }: { item: RuleItem }) {
  return (
    <div className="flex items-start gap-2 py-1.5 min-w-0">
      <CheckCircle2 className={cn(
        "size-3.5 shrink-0 mt-0.5",
        item.enabled ? "text-accent" : "text-text-disabled"
      )} />
      <span className={cn(
        "text-xs leading-snug min-w-0 flex-1 break-words",
        item.enabled ? "text-text-primary" : "text-text-disabled line-through"
      )}>
        {item.label}
      </span>
    </div>
  );
}

// ─── Trade Management Row ─────────────────────────────────────

function MgmtRow({ item }: { item: RuleItem }) {
  // Try to parse "Key: value" or "Key — value" format — but only treat it as a
  // short stat badge (e.g. "Risk per trade: 0.3%") when the value is actually short.
  // Longer descriptive rules (e.g. "SL: below the candle that swept liquidity...")
  // render as a normal wrapped line instead, otherwise the badge overflows the card.
  const colonIdx = item.label.indexOf(": ");
  const dashIdx = item.label.indexOf(" — ");
  let key = item.label, value = "";
  if (colonIdx > 0) {
    key = item.label.slice(0, colonIdx);
    value = item.label.slice(colonIdx + 2);
  } else if (dashIdx > 0) {
    key = item.label.slice(0, dashIdx);
    value = item.label.slice(dashIdx + 3);
  }
  // A stat badge parks the value on the right edge on a single unwrapped line, so
  // it only works for genuinely short values ("0.3%", "$300 (0.3%)") AND a short key.
  const isShortStat = value.length > 0 && value.length <= 18 && key.length <= 28;

  if (isShortStat) {
    return (
      <div className="flex items-start justify-between py-1.5 gap-2 min-w-0">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <CheckCircle2 className={cn("size-3.5 shrink-0 mt-0.5", item.enabled ? "text-accent" : "text-text-disabled")} />
          <span className="text-xs leading-snug text-text-secondary min-w-0 break-words">{key}</span>
        </div>
        <span className="text-xs font-mono font-semibold text-text-primary shrink-0 whitespace-nowrap mt-px">{value}</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 py-1.5 min-w-0">
      <CheckCircle2 className={cn("size-3.5 shrink-0 mt-0.5", item.enabled ? "text-accent" : "text-text-disabled")} />
      <span className="text-xs leading-snug min-w-0 flex-1 break-words text-text-secondary">
        {value ? (
          <>
            <span className="font-medium text-text-primary">{key}: </span>
            {value}
          </>
        ) : item.label}
      </span>
    </div>
  );
}

// ─── Statistics: per-rule compliance bar ───────────────────────
function ComplianceRow({ label, rate }: { label: string; rate: number }) {
  const bar = rate >= 80 ? "bg-profit" : rate >= 60 ? "bg-warning" : "bg-loss";
  const txt = rate >= 80 ? "text-profit" : rate >= 60 ? "text-warning" : "text-loss";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs text-text-secondary flex-1 min-w-0 truncate">{label}</span>
      <div className="w-24 h-1.5 bg-surface-2 rounded-full overflow-hidden shrink-0">
        <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${rate}%` }} />
      </div>
      <span className={cn("text-xs font-mono w-10 text-right shrink-0", txt)}>{rate.toFixed(0)}%</span>
    </div>
  );
}

// ─── Charting Image Upload Zone ───────────────────────────────

interface ChartingImageZoneProps {
  image: string | null;
  editMode: boolean;
  onChange: (img: string | null) => void;
}

function ChartingImageZone({ image, editMode, onChange }: ChartingImageZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    try { onChange(await compressImage(file)); } catch { /* ignore */ }
  }

  if (image) {
    return (
      <div className="relative group">
        <img src={image} alt="Chart" className="w-full rounded-lg object-contain max-h-48" />
        {editMode && (
          <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="p-1.5 rounded-lg bg-surface/90 border border-border text-text-secondary hover:text-accent transition-colors"
              title="Change image"
            >
              <ImagePlus className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="p-1.5 rounded-lg bg-surface/90 border border-border text-text-secondary hover:text-loss transition-colors"
              title="Remove image"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      </div>
    );
  }

  if (!editMode) {
    return <ChartingDiagram items={[]} />;
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer py-8 transition-colors",
        dragging ? "border-accent bg-accent/10" : "border-border hover:border-accent/40 hover:bg-accent/5"
      )}
    >
      <ImagePlus className="size-6 text-text-disabled" />
      <p className="text-xs text-text-disabled">Drag or tap to upload your chart</p>
      <p className="text-[10px] text-text-disabled/60">JPG, PNG, WEBP — max. 5MB</p>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
    </div>
  );
}

// ─── Model Card Manager (Entrada tab) ─────────────────────────

interface ModelCardManagerProps {
  items: RuleItem[];
  onChange: (items: RuleItem[]) => void;
  editMode: boolean;
  onModelToggle?: (id: string) => void;
  onImageExpand?: (image: string) => void;
}

function ModelCardManager({ items, onChange, editMode, onModelToggle, onImageExpand }: ModelCardManagerProps) {
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [localEditMode, setLocalEditMode] = useState(false);

  const canEdit = editMode || localEditMode;

  function toggle(id: string) {
    if (onModelToggle) { onModelToggle(id); return; }
    onChange(items.map((i) => i.id === id ? { ...i, enabled: !i.enabled } : i));
  }
  function remove(id: string) { onChange(items.filter((i) => i.id !== id)); }
  function commitEdit(id: string) {
    const trimmed = draft.trim();
    if (trimmed) onChange(items.map((i) => i.id === id ? { ...i, label: trimmed } : i));
    setEditing(null);
  }
  function add() {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    onChange([...items, { id: `model_${Date.now()}`, label: trimmed, enabled: true, isCustom: true }]);
    setNewLabel("");
  }
  function setDiagramType(id: string, type: string | undefined) {
    onChange(items.map((i) => i.id === id ? { ...i, diagramType: type } : i));
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-text-disabled uppercase tracking-wider font-semibold">
          {items.filter(i => i.enabled).length}/{items.length} active — tap to enable/disable
        </p>
        <button
          type="button"
          onClick={() => setLocalEditMode((v) => !v)}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] transition-colors",
            localEditMode
              ? "border-accent/50 bg-accent/10 text-accent"
              : "border-border text-text-disabled hover:text-accent hover:border-accent/30"
          )}
        >
          <Pencil className="size-2.5" />
          {localEditMode ? "Done" : "Edit models"}
        </button>
      </div>

      {items.length === 0 && (
        <p className="text-xs text-text-disabled text-center py-6">No models — add one below</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item) => {
          const acronym = getModelAcronym(item.label);
          const restIdx = item.label.indexOf(" — ");
          const name = restIdx >= 0 ? item.label.slice(restIdx + 3).split(":")[0].trim() : "";
          const detectedType = detectDiagramType(item.label);
          const effectiveType = (item.diagramType as DiagramType) || detectedType;

          if (editing === item.id) {
            return (
              <div key={item.id} className="rounded-xl border border-accent/40 bg-surface-2 p-3">
                <input autoFocus value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") commitEdit(item.id); if (e.key === "Escape") setEditing(null); }}
                  onBlur={() => commitEdit(item.id)}
                  placeholder="Model name..."
                  className="w-full bg-surface border border-accent rounded-md px-2 py-1.5 text-xs text-text-primary focus:outline-none" />
                <p className="text-[10px] text-text-disabled mt-1.5">Enter to save · Esc to cancel</p>
              </div>
            );
          }

          return (
            <div key={item.id} className={cn(
              "group relative rounded-xl border overflow-hidden transition-all",
              item.enabled
                ? "border-accent/50 bg-[#1e1940] shadow-[0_4px_0_#5b45a8,0_0_20px_rgba(157,139,255,0.15)]"
                : "border-border bg-surface-2 shadow-[0_4px_0_#13111e]"
            )}>
              {item.image && onImageExpand && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onImageExpand(item.image!); }}
                  className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-bg/70 border border-border text-text-secondary opacity-0 group-hover:opacity-100 hover:text-accent hover:border-accent/40 transition-all"
                  title="Expand image"
                >
                  <Maximize2 className="size-3" />
                </button>
              )}
              {/* Toggle area */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggle(item.id)}
                onKeyDown={(e) => e.key === "Enter" && toggle(item.id)}
                className="w-full p-3 text-left cursor-pointer select-none active:scale-95 transition-transform"
              >
                {/* Diagram or uploaded image */}
                {item.image ? (
                  <div className="relative w-full mb-2 rounded-lg overflow-hidden bg-black/30" style={{ height: 110 }}>
                    <img src={item.image} alt="" className="w-full h-full object-contain" />
                    <div className="absolute inset-0 rounded-lg pointer-events-none" style={{ background: "rgba(157,139,255,0.06)" }} />
                  </div>
                ) : (
                  <ModelDiagram
                    type={effectiveType}
                    enabled={item.enabled}
                    className="w-full mb-2"
                    style={{ height: 110 }}
                  />
                )}

                <p className={cn("text-sm font-black font-mono tracking-tight",
                  item.enabled ? "text-accent" : "text-text-disabled")}>{acronym}</p>
                {name && <p className={cn("text-[10px] mt-0.5 leading-snug truncate",
                  item.enabled ? "text-text-secondary" : "text-text-disabled")}>{name}</p>}
                {item.enabled && (
                  <div className="mt-1.5 flex items-center gap-1">
                    <div className="size-1.5 rounded-full bg-profit animate-pulse" />
                    <span className="text-[9px] text-profit font-semibold tracking-wider">ACTIVE</span>
                  </div>
                )}
              </div>

              {/* Edit controls */}
              {canEdit && (
                <div className="border-t border-border/60">
                  {/* Diagram type picker — always shown in edit mode */}
                  <DiagramTypePicker
                    value={item.diagramType}
                    detectedType={detectedType}
                    onChange={(t) => setDiagramType(item.id, t)}
                  />
                  {/* Image / Name / Delete row */}
                  <div className="grid grid-cols-3 divide-x divide-border/60">
                    <label
                      htmlFor={`img-${item.id}`}
                      className="flex flex-col items-center gap-0.5 py-1.5 text-text-disabled hover:text-accent hover:bg-accent/5 cursor-pointer transition-colors"
                    >
                      <ImagePlus className="size-3" />
                      <span className="text-[8px]">{item.image ? "Change" : "Image"}</span>
                      <input id={`img-${item.id}`} type="file" accept="image/*" className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f || !f.type.startsWith("image/")) return;
                          try {
                            const img = await compressImage(f);
                            onChange(items.map((i) => i.id === item.id ? { ...i, image: img } : i));
                          } catch { /* ignore */ }
                          e.target.value = "";
                        }} />
                    </label>
                    <button type="button"
                      onClick={() => { setEditing(item.id); setDraft(item.label); }}
                      className="flex flex-col items-center gap-0.5 py-1.5 text-text-disabled hover:text-accent hover:bg-accent/5 transition-colors">
                      <Pencil className="size-3" />
                      <span className="text-[8px]">Name</span>
                    </button>
                    <button type="button"
                      onClick={() => remove(item.id)}
                      className="flex flex-col items-center gap-0.5 py-1.5 text-text-disabled hover:text-loss hover:bg-loss/5 transition-colors">
                      <Trash2 className="size-3" />
                      <span className="text-[8px]">Delete</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && (
        <div className="flex gap-2 pt-1">
          <input
            type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
            placeholder='E.g.: MSS — Model: short description'
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent transition-colors"
          />
          <button type="button" onClick={add}
            className="px-3 py-1.5 rounded-lg bg-accent/20 border border-accent/40 text-accent text-xs hover:bg-accent/30 transition-colors">
            <Plus className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────

export default function PlanModePage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanFormData>(defaultPlanForm());
  const [isNew, setIsNew] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMarkingReviewed, setIsMarkingReviewed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [editMode, setEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [chartingImage, setChartingImage] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  // Ref to guard fetchPlans from overriding form when in new-plan mode
  const isNewRef = useRef(false);

  // Real per-plan numbers — replaces the decorative sparkline/placeholder
  // Win Rate/Trades on each StrategyCard, and feeds the Statistics tab.
  type PlanStat = { count: number; winRate: number; adherence: number | null };
  const [planStats, setPlanStats] = useState<Record<string, PlanStat>>({});
  type Compliance = { entry: Record<string, number>; management: Record<string, number>; exit: Record<string, number> };
  // Keyed by the plan it was computed for, so a stale result from the
  // previously-open plan is never rendered while the next one is loading —
  // without needing a synchronous setState(null) reset inside the effect.
  const [itemComplianceFor, setItemComplianceFor] = useState<{ planId: string; data: Compliance } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = useMemo(() => createClient(), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  useEffect(() => {
    if (!lightboxImage) return;
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") setLightboxImage(null); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxImage]);

  const fetchPlans = useCallback(async (uid: string, keepSelection?: string) => {
    const { data, error } = await supabase
      .from("plans").select("*").eq("user_id", uid).order("created_at", { ascending: false });
    if (error) { toast.error("Error loading plans"); return; }
    const rows = data as Plan[] | null;
    setPlans(rows ?? []);
    // Never auto-select when user is actively creating a new plan
    if (rows && rows.length > 0 && !keepSelection && !selectedId && !isNewRef.current) {
      const active = rows.find((p) => p.is_active) ?? rows[0];
      setSelectedId(active.id);
      setForm(dbToForm(active));
      setIsNew(false);
    }
  }, [supabase, selectedId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserId(data.user.id);
        fetchPlans(data.user.id).finally(() => setLoading(false));
      } else { setLoading(false); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One lightweight query covers every plan card's Win Rate/Trades/Adherence.
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("trades")
      .select("plan_id, net_pnl, followed_plan")
      .eq("user_id", userId)
      .not("plan_id", "is", null)
      .neq("status", "draft")
      .then(({ data, error }) => {
        if (error || !data) return;
        const rows = data as { plan_id: string; net_pnl: number | null; followed_plan: boolean | null }[];
        const byPlan: Record<string, typeof rows> = {};
        for (const r of rows) (byPlan[r.plan_id] ??= []).push(r);
        const stats: Record<string, PlanStat> = {};
        for (const [pid, trades] of Object.entries(byPlan)) {
          const wins = trades.filter(t => (t.net_pnl ?? 0) > 0).length;
          const evaluated = trades.filter(t => t.followed_plan != null);
          const followed = evaluated.filter(t => t.followed_plan === true).length;
          stats[pid] = {
            count: trades.length,
            winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
            adherence: evaluated.length > 0 ? (followed / evaluated.length) * 100 : null,
          };
        }
        setPlanStats(stats);
      });
  }, [supabase, userId]);

  // Per-item compliance for the plan currently open in the Statistics tab —
  // scoped to one plan (unlike planStats above) since it needs journal_entries too.
  useEffect(() => {
    if (activeTab !== "stats" || !selectedId || isNew) return;
    let cancelled = false;
    setStatsLoading(true);
    (async () => {
      const { data: tr } = await supabase.from("trades").select("id").eq("plan_id", selectedId).neq("status", "draft");
      const tradeIds = (tr as { id: string }[] | null)?.map(t => t.id) ?? [];
      if (tradeIds.length === 0) {
        if (!cancelled) { setItemComplianceFor({ planId: selectedId, data: { entry: {}, management: {}, exit: {} } }); setStatsLoading(false); }
        return;
      }
      const { data: je } = await supabase
        .from("journal_entries")
        .select("entry_confluences, trade_management_checklist, exit_checklist")
        .in("trade_id", tradeIds);
      const entries = (je as {
        entry_confluences: Record<string, boolean> | null;
        trade_management_checklist: Record<string, boolean> | null;
        exit_checklist: Record<string, boolean> | null;
      }[] | null) ?? [];
      const total = entries.length;
      function rate(items: RuleItem[], field: "entry_confluences" | "trade_management_checklist" | "exit_checklist") {
        const out: Record<string, number> = {};
        if (total === 0) return out;
        for (const item of items) {
          const hits = entries.filter(e => e[field]?.[item.id]).length;
          out[item.id] = (hits / total) * 100;
        }
        return out;
      }
      if (!cancelled) {
        setItemComplianceFor({
          planId: selectedId,
          data: {
            entry: rate(form.confluence_items, "entry_confluences"),
            management: rate(form.trade_management_items, "trade_management_checklist"),
            exit: rate(form.exit_criteria_items, "exit_checklist"),
          },
        });
        setStatsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedId, isNew, supabase]);

  function selectPlan(plan: Plan) {
    isNewRef.current = false;
    setSelectedId(plan.id);
    setForm(dbToForm(plan));
    try {
      const notes = plan.trading_notes ? JSON.parse(plan.trading_notes as string) : null;
      setChartingImage(notes?.charting_image ?? null);
    } catch { setChartingImage(null); }
    setIsNew(false); setEditMode(false); setActiveTab("overview");
  }
  function startNew() {
    isNewRef.current = true;
    setSelectedId(null);
    setIsNew(true);
    setForm(defaultPlanForm());
    setChartingImage(null);
    setEditMode(true);
    setActiveTab("overview");
  }
  function set<K extends keyof PlanFormData>(key: K, value: PlanFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-seleccionar el mismo archivo después
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const imported = importPlanFromJSON(parsed, form);
        setForm(imported);
        if (!editMode) setEditMode(true);
        toast.success(`Plan "${imported.name || "sin nombre"}" importado — revisa y pulsa Save para guardarlo`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo importar el archivo");
      }
    };
    reader.onerror = () => toast.error("No se pudo leer el archivo");
    reader.readAsText(file);
  }

  async function handleSave() {
    if (!userId || !form.name.trim()) { toast.error("Plan name is required"); return; }
    setIsSaving(true);
    try {
      const payload = formToDbPayload(form, userId, chartingImage);
      if (form.is_active) await db.from("plans").update({ is_active: false }).eq("user_id", userId);
      if (isNew) {
        const { data, error } = await db.from("plans").insert(payload).select().single();
        if (error) throw error;
        const created = data as Plan;
        isNewRef.current = false;
        setPlans((p) => [created, ...p]); setSelectedId(created.id);
        setIsNew(false); setEditMode(false); toast.success("Plan created");
      } else if (selectedId) {
        const { data, error } = await db.from("plans").update(payload).eq("id", selectedId).select().single();
        if (error) throw error;
        const updated = data as Plan;
        setPlans((p) => p.map((x) => (x.id === selectedId ? updated : x))); toast.success("Plan saved");
      }
      if (userId) fetchPlans(userId, selectedId ?? "keep");
    } catch { toast.error("Error saving plan"); }
    finally { setIsSaving(false); }
  }

  async function handleDelete() {
    if (!selectedId || isNew) return;
    if (!confirm("Delete this plan? This action cannot be undone.")) return;
    setIsDeleting(true);
    try {
      const { error } = await db.from("plans").delete().eq("id", selectedId);
      if (error) throw error;
      setPlans((p) => p.filter((x) => x.id !== selectedId)); startNew(); toast.success("Plan deleted");
    } catch { toast.error("Error deleting"); }
    finally { setIsDeleting(false); }
  }

  async function handleDuplicate(plan: Plan) {
    if (!userId) return;
    const copy = dbToForm(plan); copy.name = `${copy.name} (copy)`; copy.is_active = false;
    try {
      const { data, error } = await db.from("plans").insert(formToDbPayload(copy, userId)).select().single();
      if (error) throw error;
      const created = data as Plan;
      setPlans((p) => [created, ...p]); setSelectedId(created.id);
      setForm(dbToForm(created)); setIsNew(false); toast.success("Plan duplicated");
    } catch { toast.error("Error duplicating plan"); }
  }

  async function handleMarkReviewed() {
    if (!selectedId || isNew) return;
    setIsMarkingReviewed(true);
    try {
      const now = new Date().toISOString();
      const { error } = await db.from("plans").update({ last_reviewed_at: now }).eq("id", selectedId);
      if (error) throw error;
      setPlans((p) => p.map((x) => (x.id === selectedId ? { ...x, last_reviewed_at: now } : x)));
      toast.success("Plan marked as reviewed");
    } catch { toast.error("Error marking as reviewed"); }
    finally { setIsMarkingReviewed(false); }
  }

  async function toggleModelEnabled(id: string) {
    const updated = form.model_items.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m);
    set("model_items", updated);
    if (userId && selectedId && !isNew) {
      try {
        await db.from("plans").update({ entry_models: updated }).eq("id", selectedId);
      } catch { /* silent — main save will catch it */ }
    }
  }

  async function updateModelItems(items: RuleItem[]) {
    set("model_items", items);
    if (userId && selectedId && !isNew) {
      try {
        await db.from("plans").update({ entry_models: items }).eq("id", selectedId);
      } catch { /* silent */ }
    }
  }

  const selectedPlan   = plans.find((p) => p.id === selectedId);
  const totalCriteria  = form.confluence_items.length;
  const enabledCount   = form.confluence_items.filter((i) => i.enabled).length;
  const isMATVARD22    = totalCriteria === 22;
  const grade          = isMATVARD22
    ? (enabledCount >= 18 ? "A+" : enabledCount >= 12 ? "A" : enabledCount >= 10 ? "B" : "C")
    : null;
  const gradeColor     = grade === "A+" ? "text-profit" : grade === "A" ? "text-accent" : grade === "B" ? "text-warning" : grade === "C" ? "text-loss" : "text-text-secondary";
  const meetsMin       = totalCriteria === 0 || enabledCount >= form.min_confluences;

  const hasAnyContent  = form.charting_items.length > 0 || form.confluence_items.length > 0 ||
    form.model_items.length > 0 || form.trade_management_items.length > 0 || form.exit_criteria_items.length > 0;

  const filteredPlans  = searchQuery
    ? plans.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : plans;

  const showWorkspace  = selectedId !== null || isNew;

  // ─── Resumen tab — multi-column dashboard grid ────────────

  const ResumenGrid = () => (
    <div className="p-4 space-y-3">
      {/* Row 1: process inputs — Charting Process only appears once an image is uploaded */}
      <div className={cn("grid gap-3 min-w-0", chartingImage ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2")}>

        {chartingImage && (
          <div className="card p-4 min-h-0 min-w-0">
            <p className="section-title mb-3">CHARTING PROCESS</p>
            <img src={chartingImage} alt="Chart" className="w-full rounded-lg object-contain max-h-44" />
          </div>
        )}

        {/* Criterios de Entrada */}
        <div className="card p-4 min-w-0">
          <p className="section-title mb-3">ENTRY CRITERIA</p>
          {form.confluence_items.length > 0 ? (
            <div className="space-y-0.5">
              {form.confluence_items.slice(0, 6).map((item) => (
                <CheckRow key={item.id} item={item} />
              ))}
              {form.confluence_items.length > 6 && (
                <button onClick={() => setActiveTab("entrada")}
                  className="text-[10px] text-accent mt-1 hover:underline">
                  +{form.confluence_items.length - 6} more →
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-text-disabled text-center py-6">No criteria defined</p>
          )}
        </div>

        {/* Gestión del Trade */}
        <div className="card p-4 min-w-0">
          <p className="section-title mb-3">TRADE MANAGEMENT</p>
          <div className="space-y-0.5 min-w-0">
            {/* Risk row from form */}
            <div className="flex items-start justify-between py-1.5 gap-2 min-w-0 border-b border-border/50 mb-1">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <div className="size-3.5 rounded-full bg-accent/30 border border-accent/60 shrink-0 mt-0.5" />
                <span className="text-xs leading-snug text-text-secondary min-w-0 break-words">Risk per trade</span>
              </div>
              <span className="text-xs font-mono font-semibold text-accent shrink-0 whitespace-nowrap">{form.risk_per_trade_percent}%</span>
            </div>
            {form.trade_management_items.length > 0 ? (
              form.trade_management_items.slice(0, 6).map((item) => (
                <MgmtRow key={item.id} item={item} />
              ))
            ) : (
              <p className="text-xs text-text-disabled py-4 text-center">No rules defined</p>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: constraints & notes — same width as row 1, no more cramped sidebar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 min-w-0">
        {/* Controles de Riesgo */}
        <div className="card p-4 min-w-0">
          <div className="flex items-center gap-1.5 mb-3">
            <Shield className="size-3.5 text-accent" />
            <p className="section-title">RISK CONTROLS</p>
          </div>
          <div className="space-y-1.5">
            {[
              { label: "Max. daily risk",       value: `$${form.max_daily_loss}` },
              { label: "Max. risk per trade",   value: `${form.risk_per_trade_percent}%` },
              { label: "Max. daily trades",     value: String(form.max_trades_per_day) },
              { label: "Max. drawdown",         value: "10%" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start justify-between gap-2 min-w-0">
                <span className="text-xs leading-snug text-text-disabled min-w-0 break-words">{label}</span>
                <span className="text-xs font-mono font-semibold text-text-secondary shrink-0 whitespace-nowrap">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Reglas de Disciplina */}
        <div className="card p-4 min-w-0">
          <div className="flex items-center gap-1.5 mb-3">
            <BookOpen className="size-3.5 text-accent" />
            <p className="section-title">DISCIPLINE RULES</p>
          </div>
          <div className="space-y-1.5">
            {(form.notes_items.length > 0 ? form.notes_items.slice(0, 5) : [
              { id: "d1", label: "Follow the plan 100%",            enabled: true },
              { id: "d2", label: "Don't trade outside Killzones",   enabled: true },
              { id: "d3", label: "Don't average losing positions",  enabled: true },
              { id: "d4", label: "Accept the stop loss",            enabled: true },
              { id: "d5", label: "Review and improve the plan weekly", enabled: true },
            ] as RuleItem[]).map((item) => (
              <p key={item.id} className="text-xs text-text-secondary leading-snug break-words">{item.label}</p>
            ))}
          </div>
        </div>

        {/* Notas del Plan */}
        <div className="card p-4 min-w-0">
          <div className="flex items-center gap-1.5 mb-3">
            <FileText className="size-3.5 text-accent" />
            <p className="section-title">PLAN NOTES</p>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed break-words">
            {form.notes_items.length > 0
              ? form.notes_items.slice(0, 3).map(i => i.label).join(" · ")
              : "Add notes in the Plan Notes tab to remind yourself before trading."}
          </p>
        </div>
      </div>

      {/* Row 3: entry models + exit criteria */}
      <div className="grid gap-3 min-w-0" style={{ gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)" }}>

        {/* Modelos de Entrada */}
        <div className="card p-4 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">ENTRY MODELS</p>
            <button
              type="button"
              onClick={() => { setActiveTab("entrada"); setEditMode(true); }}
              className="p-1 rounded-md text-text-disabled hover:text-accent transition-colors"
              title="Edit models"
            >
              <Pencil className="size-3.5" />
            </button>
          </div>
          {form.model_items.length > 0 ? (() => {
            const n = form.model_items.length;
            const cols = n <= 4 ? n : Math.ceil(n / 2);
            return (
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
              >
                {form.model_items.map((item, i) => (
                  <ModelMiniCard
                    key={item.id}
                    item={item}
                    active={i === 0 && item.enabled}
                    onToggle={() => toggleModelEnabled(item.id)}
                    onExpand={item.image ? () => setLightboxImage(item.image!) : undefined}
                  />
                ))}
              </div>
            );
          })() : (
            <p className="text-xs text-text-disabled text-center py-6">No models defined</p>
          )}
        </div>

        {/* Criterios de Salida */}
        <div className="card p-4 min-w-0">
          <p className="section-title mb-3">EXIT CRITERIA</p>
          {form.exit_criteria_items.length > 0 ? (
            <div className="space-y-0.5">
              {form.exit_criteria_items.slice(0, 5).map((item) => (
                <CheckRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-disabled text-center py-6">No criteria defined</p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Page Header ─────────────────────────────────── */}
      <header className="shrink-0 h-16 flex items-center justify-between px-6 border-b border-border bg-surface/30 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="size-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
            <LayoutDashboard className="size-5 text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wide uppercase text-text-primary leading-none">
              Plan Mode
            </h1>
            <p className="text-[11px] text-text-disabled mt-0.5">
              Design, plan and execute your strategies with precision.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-text-disabled pointer-events-none" />
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search plans..."
              className="w-40 pl-8 pr-3 py-1.5 bg-surface-2 border border-border rounded-lg text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <button onClick={startNew}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-bg text-xs font-semibold hover:bg-accent-dim transition-colors shadow-[0_4px_14px_rgba(157,139,255,0.3)]">
            <Plus className="size-3.5" />
            New Plan
          </button>
        </div>
      </header>

      {/* ── Strategy Explorer ────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-surface/20">
        <div className="px-6 pb-4 pt-3 flex gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="shrink-0 w-48 h-36 rounded-2xl border border-border bg-surface animate-pulse" />
            ))
          ) : (
            <>
              {filteredPlans.map((plan) => (
                <StrategyCard
                  key={plan.id} plan={plan} stat={planStats[plan.id]}
                  selected={selectedId === plan.id && !isNew}
                  onClick={() => selectPlan(plan)}
                  onDuplicate={(e) => { e.stopPropagation(); handleDuplicate(plan); }}
                />
              ))}

              {isNew && (
                <div className="shrink-0 w-48 rounded-2xl border border-accent/60 bg-accent-glow/30 p-4 flex flex-col gap-2 justify-between">
                  <div>
                    <p className="text-[10px] text-text-disabled">DRAFT</p>
                    <p className="text-sm font-semibold text-accent mt-0.5">{form.name || "New plan..."}</p>
                  </div>
                  <span className="self-start text-[9px] font-bold px-2 py-0.5 rounded-full bg-surface-2 text-text-disabled">
                    PENDING
                  </span>
                </div>
              )}

              <button onClick={startNew}
                className="shrink-0 w-48 h-36 rounded-2xl border border-dashed border-border text-text-disabled hover:border-accent/40 hover:text-accent hover:bg-accent-glow/20 transition-all flex flex-col items-center justify-center gap-2 group">
                <div className="size-8 rounded-full border border-current flex items-center justify-center group-hover:bg-accent/10 transition-colors">
                  <Plus className="size-4" />
                </div>
                <span className="text-xs">Create new plan</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Strategy Workspace ───────────────────────────── */}
      {showWorkspace ? (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">

          {/* Plan Detail Bar */}
          <div className="shrink-0 px-6 py-3 border-b border-border bg-surface/10">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
              {/* Left: name + type + status — full width until lg, so a long name
                  wraps at most onto a couple of lines instead of being squeezed
                  word-by-word against the metadata/action buttons on the right. */}
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  {editMode ? (
                    <input
                      type="text" value={form.name} onChange={(e) => set("name", e.target.value)}
                      autoFocus placeholder="Plan name..."
                      className="text-base font-bold text-text-primary bg-transparent border-b border-accent/50 focus:outline-none focus:border-accent pb-px max-w-xs"
                    />
                  ) : (
                    <h2 className="text-base font-bold text-text-primary">{form.name || "New plan"}</h2>
                  )}
                  <span className={cn(
                    "flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full cursor-pointer border tracking-wider transition-colors",
                    form.is_active ? "bg-profit/10 text-profit border-profit/25" : "bg-surface-2 text-text-disabled border-border"
                  )} onClick={() => set("is_active", !form.is_active)}>
                    <span className={cn("size-1.5 rounded-full", form.is_active ? "bg-profit" : "bg-text-disabled")} />
                    {form.is_active ? "ACTIVE" : "INACTIVE"}
                  </span>
                  {editMode && (
                    <button type="button" className="text-text-disabled hover:text-accent transition-colors">
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </div>

                {/* Tags */}
                {editMode && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <select value={form.plan_type} onChange={(e) => set("plan_type", e.target.value)}
                      className="bg-surface-2 border border-border rounded-md px-2 py-0.5 text-xs text-text-primary focus:outline-none focus:border-accent">
                      <option value="CUSTOM">Custom</option>
                      <option value="MATVARD_PHASE2">MATVARD Phase 2</option>
                      <option value="MATVARD_PHASE1">MATVARD Phase 1</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Right: metadata + actions */}
              <div className="flex items-center gap-4 flex-wrap lg:flex-nowrap lg:shrink-0">
                {/* Metadata columns */}
                {selectedPlan && !isNew && (
                  <div className="hidden md:flex items-center gap-5">
                    {[
                      { label: "CREATED",       value: fmtDateShort(selectedPlan.created_at),  icon: Calendar },
                      { label: "LAST EDITED",   value: fmtDateShort(selectedPlan.updated_at),  icon: Clock },
                      { label: "TRADES",          value: "—",                                     icon: null },
                      { label: "WIN RATE",        value: "—%",                                    icon: null },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="text-center">
                        <p className="text-[9px] text-text-disabled uppercase tracking-wider">{label}</p>
                        <div className="flex items-center gap-1 mt-0.5 justify-center">
                          {Icon && <Icon className="size-3 text-text-disabled" />}
                          <p className="text-xs font-medium text-text-secondary">{value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  {editMode && (
                    <button type="button"
                      onClick={() => {
                        const ok = hasAnyContent ? confirm("Load the MATVARD template?") : true;
                        if (ok) setForm(loadMATVARD(form));
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/40 text-accent text-xs hover:bg-accent/10 transition-colors">
                      <Wand2 className="size-3" />
                      MATVARD
                    </button>
                  )}

                  {editMode && (
                    <>
                      <input
                        ref={importFileInputRef}
                        type="file"
                        accept="application/json,.json"
                        onChange={handleImportFile}
                        className="hidden"
                      />
                      <button type="button"
                        onClick={() => {
                          const ok = hasAnyContent ? confirm("Import a plan? This overwrites the fields present in the file.") : true;
                          if (ok) importFileInputRef.current?.click();
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/40 text-accent text-xs hover:bg-accent/10 transition-colors">
                        <Upload className="size-3" />
                        Import JSON
                      </button>
                    </>
                  )}

                  <button type="button"
                    onClick={() => setEditMode((v) => !v)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors",
                      editMode
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-text-secondary hover:border-accent/40"
                    )}>
                    {editMode ? <Pencil className="size-3" /> : <Lock className="size-3" />}
                    {editMode ? "Editing" : "Edit Plan"}
                  </button>

                  {!isNew && selectedPlan && (
                    <button onClick={() => handleDuplicate(selectedPlan)} title="Duplicar"
                      className="p-1.5 rounded-lg border border-border text-text-secondary hover:border-accent/40 hover:text-accent transition-colors">
                      <Copy className="size-4" />
                    </button>
                  )}
                  {!isNew && selectedId && (
                    <button onClick={handleDelete} disabled={isDeleting} title="Delete"
                      className="p-1.5 rounded-lg border border-border text-text-secondary hover:border-loss hover:text-loss transition-colors disabled:opacity-50">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                  <button onClick={handleSave} disabled={isSaving || !form.name.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent text-bg text-xs font-semibold hover:bg-accent-dim disabled:opacity-50 transition-colors shadow-[0_4px_12px_rgba(157,139,255,0.25)]">
                    <Save className="size-3" />
                    {isSaving ? "Saving..." : isNew ? "Create plan" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Tab Bar */}
          <div className="shrink-0 px-6 border-b border-border flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden bg-surface/10">
            {TABS.map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-4 py-3 text-xs font-medium transition-colors border-b-2 -mb-px",
                  activeTab === key
                    ? "text-accent border-accent bg-accent/5"
                    : "text-text-disabled border-transparent hover:text-text-secondary hover:bg-surface/30"
                )}>
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto min-h-0">

            {/* ── RESUMEN (full dashboard grid) */}
            {activeTab === "overview" && <ResumenGrid />}

            {/* ── Other tabs: centered narrow layout */}
            {activeTab !== "overview" && (
              <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">

                {/* PROCESO */}
                {activeTab === "proceso" && (
                  <>
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary mb-1">Setup Chart</h3>
                      <p className="text-xs text-text-disabled">Attach the chart image for the setup you plan to trade</p>
                    </div>
                    <div className="card p-4">
                      <ChartingImageZone
                        image={chartingImage}
                        editMode={editMode}
                        onChange={setChartingImage}
                      />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary mb-1">Charting Process</h3>
                      <p className="text-xs text-text-disabled">Pre-market — steps to follow before trading</p>
                    </div>
                    <div className="card p-4">
                      <EditableChecklist
                        key={selectedId ?? "new"}
                        items={form.charting_items}
                        onChange={(items) => set("charting_items", items)}
                        addPlaceholder="Add charting step..."
                        editMode={editMode}
                      />
                    </div>
                  </>
                )}

                {/* ENTRADA */}
                {activeTab === "entrada" && (
                  <>
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary mb-1">Entry Models</h3>
                      <p className="text-xs text-text-disabled">Valid setups to execute</p>
                    </div>
                    <div className="card p-4">
                      <ModelCardManager
                        items={form.model_items}
                        onChange={updateModelItems}
                        editMode={editMode}
                        onModelToggle={toggleModelEnabled}
                        onImageExpand={setLightboxImage}
                      />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary mb-1">Entry Criteria</h3>
                      <p className="text-xs text-text-disabled">Confluences needed to validate the setup</p>
                    </div>
                    <div className="card p-4">
                      <EditableChecklist
                        key={selectedId ?? "new"}
                        items={form.confluence_items}
                        onChange={(items) => set("confluence_items", items)}
                        addPlaceholder="Add entry criterion..."
                        editMode={editMode}
                      />
                    </div>
                  </>
                )}

                {/* GESTIÓN */}
                {activeTab === "gestion" && (
                  <>
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary mb-1">Trade Management</h3>
                      <p className="text-xs text-text-disabled">Execution rules during the trade</p>
                    </div>
                    <div className="card p-4">
                      {editMode ? (
                        <EditableChecklist
                          key={selectedId ?? "new"}
                          items={form.trade_management_items}
                          onChange={(items) => set("trade_management_items", items)}
                          addPlaceholder="Add management rule (e.g.: SL: 1R)"
                          editMode={true}
                        />
                      ) : form.trade_management_items.length > 0 ? (
                        <div className="space-y-0.5">
                          {form.trade_management_items.map((item) => (
                            <MgmtRow key={item.id} item={item} />
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-text-disabled text-center py-6">
                          No rules — enable edit mode to add
                        </p>
                      )}
                    </div>
                  </>
                )}

                {/* SALIDA */}
                {activeTab === "salida" && (
                  <>
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary mb-1">Exit Criteria</h3>
                      <p className="text-xs text-text-disabled">When to close the position</p>
                    </div>
                    <div className="card p-4">
                      <EditableChecklist
                        key={selectedId ?? "new"}
                        items={form.exit_criteria_items}
                        onChange={(items) => set("exit_criteria_items", items)}
                        addPlaceholder="Add exit criterion..."
                        editMode={editMode}
                      />
                    </div>
                  </>
                )}

                {/* NOTAS */}
                {activeTab === "notas" && (
                  <>
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary mb-1">Plan Notes</h3>
                      <p className="text-xs text-text-disabled">Reminders to read before trading</p>
                    </div>
                    <div className="card p-4">
                      <EditableChecklist
                        key={selectedId ?? "new"}
                        items={form.notes_items}
                        onChange={(items) => set("notes_items", items)}
                        addPlaceholder="Add reminder..."
                        editMode={editMode}
                      />
                    </div>
                    {selectedPlan && !isNew && (
                      <div className="card p-4 space-y-3">
                        <p className="section-title">History</p>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs text-text-disabled">
                            <Calendar className="size-3.5 shrink-0" />
                            Created: {fmtDate(selectedPlan.created_at)}
                          </div>
                          {selectedPlan.last_reviewed_at ? (
                            <div className="flex items-center gap-2 text-xs text-profit">
                              <CheckCircle2 className="size-3.5 shrink-0" />
                              Reviewed: {fmtDate(selectedPlan.last_reviewed_at)}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-xs text-warning">
                              <AlertTriangle className="size-3.5 shrink-0" />
                              Not reviewed yet
                            </div>
                          )}
                        </div>
                        <button onClick={handleMarkReviewed} disabled={isMarkingReviewed}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-profit/30 text-profit text-xs hover:bg-profit/5 transition-colors disabled:opacity-50">
                          <CheckCircle2 className="size-3.5" />
                          Mark as reviewed
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* STATS */}
                {activeTab === "stats" && (() => {
                  const stat = selectedId ? planStats[selectedId] : undefined;
                  const hasTrades = (stat?.count ?? 0) > 0;
                  const itemCompliance = itemComplianceFor?.planId === selectedId ? itemComplianceFor.data : null;
                  return (
                  <>
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary mb-1">Statistics</h3>
                      <p className="text-xs text-text-disabled">Performance of this plan in the Journal</p>
                    </div>

                    {!hasTrades ? (
                      <div className="card p-10 text-center space-y-3">
                        <BarChart2 className="size-8 text-text-disabled mx-auto" />
                        <p className="text-text-secondary text-sm">No data available</p>
                        <p className="text-xs text-text-disabled max-w-xs mx-auto">
                          Statistics will be enabled when you link trades from your Journal to this plan.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Real numbers from linked trades */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="card p-4">
                            <p className="text-[10px] text-text-disabled uppercase tracking-wider">Trades</p>
                            <p className="text-2xl font-mono font-semibold text-text-primary mt-1">{stat!.count}</p>
                          </div>
                          <div className="card p-4">
                            <p className="text-[10px] text-text-disabled uppercase tracking-wider">Win Rate</p>
                            <p className={cn("text-2xl font-mono font-semibold mt-1", stat!.winRate >= 50 ? "text-profit" : "text-warning")}>
                              {stat!.winRate.toFixed(0)}%
                            </p>
                          </div>
                          <div className="card p-4">
                            <p className="text-[10px] text-text-disabled uppercase tracking-wider">Adherence</p>
                            <p className={cn(
                              "text-2xl font-mono font-semibold mt-1",
                              stat!.adherence == null ? "text-text-disabled" : stat!.adherence >= 80 ? "text-profit" : stat!.adherence >= 60 ? "text-warning" : "text-loss"
                            )}>
                              {stat!.adherence == null ? "—" : `${stat!.adherence.toFixed(0)}%`}
                            </p>
                          </div>
                        </div>

                        {/* Per-rule compliance, from the Entry/Trade Management/Exit checklists checked off per trade */}
                        {statsLoading ? (
                          <p className="text-xs text-text-disabled">Loading rule compliance…</p>
                        ) : itemCompliance && (
                          <div className="space-y-3">
                            {([
                              ["Entry Criteria", form.confluence_items, itemCompliance.entry],
                              ["Trade Management", form.trade_management_items, itemCompliance.management],
                              ["Exit Criteria", form.exit_criteria_items, itemCompliance.exit],
                            ] as const).map(([title, items, rates]) => items.length > 0 && (
                              <div key={title} className="card p-4 space-y-2">
                                <p className="section-title">{title}</p>
                                <div className="space-y-1.5">
                                  {items.map(item => (
                                    <ComplianceRow key={item.id} label={item.label} rate={rates[item.id] ?? 0} />
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {/* Score summary */}
                    {totalCriteria > 0 && (
                      <div className="card p-4 space-y-3">
                        <p className="section-title">Criteria Score</p>
                        <div className="flex items-end gap-3">
                          <p className={cn("text-4xl font-bold font-mono", gradeColor)}>
                            {enabledCount}
                          </p>
                          <p className="text-text-disabled text-lg font-mono mb-1">/{totalCriteria}</p>
                          {grade && (
                            <p className={cn("text-2xl font-bold ml-auto mb-0.5", gradeColor)}>{grade}</p>
                          )}
                        </div>
                        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", meetsMin ? "bg-profit" : "bg-loss")}
                            style={{ width: `${(enabledCount / Math.max(totalCriteria, 1)) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </>
                  );
                })()}

              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <LayoutDashboard className="size-10 text-text-disabled mx-auto mb-3" />
            <p className="text-text-secondary text-sm">Select a strategy</p>
            <p className="text-xs text-text-disabled">or create a new plan from the explorer</p>
          </div>
        </div>
      )}

      {/* Image lightbox — full-size view of an entry model's chart */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-bg/90 backdrop-blur-sm"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 p-2 rounded-lg bg-surface/80 border border-border text-text-secondary hover:text-accent hover:border-accent/40 transition-colors"
            title="Close"
          >
            <X className="size-5" />
          </button>
          <img
            src={lightboxImage}
            alt="Model chart — full size"
            className="max-w-[92vw] max-h-[88vh] object-contain rounded-xl border border-border shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
