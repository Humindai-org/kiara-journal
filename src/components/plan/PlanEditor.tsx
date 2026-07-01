"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, Wand2, Pencil, Lock, Plus, X, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import EditableChecklist from "./EditableChecklist";
import {
  matvardChartingItems,
  matvardConfluenceItems,
  matvardModelItems,
  matvardManagementItems,
  matvardExitItems,
  matvardNoteItems,
  type RuleItem,
} from "./planData";

// ─── PlanFormData ─────────────────────────────────────────────

export interface PlanFormData {
  name: string;
  plan_type: string;
  is_active: boolean;
  // All sections fully editable — empty by default, load MATVARD with button
  charting_items: RuleItem[];
  confluence_items: RuleItem[];
  model_items: RuleItem[];
  trade_management_items: RuleItem[];
  exit_criteria_items: RuleItem[];
  notes_items: RuleItem[];
  // Risk / discipline
  trading_window_start: string;
  trading_window_end: string;
  min_confluences: number;
  max_consecutive_losses: number;
  max_trades_per_day: number;
  max_daily_loss: number;
  max_daily_profit: number;
  risk_per_trade_percent: number;
}

export function defaultPlanForm(): PlanFormData {
  return {
    name: "",
    plan_type: "CUSTOM",
    is_active: false,
    charting_items: [],
    confluence_items: [],
    model_items: [],
    trade_management_items: [],
    exit_criteria_items: [],
    notes_items: [],
    trading_window_start: "08:00",
    trading_window_end: "17:00",
    min_confluences: 10,
    max_consecutive_losses: 2,
    max_trades_per_day: 3,
    max_daily_loss: 300,
    max_daily_profit: 500,
    risk_per_trade_percent: 0.3,
  };
}

export function loadMATVARD(form: PlanFormData): PlanFormData {
  return {
    ...form,
    plan_type: "MATVARD_PHASE2",
    charting_items: matvardChartingItems(),
    confluence_items: matvardConfluenceItems(),
    model_items: matvardModelItems(),
    trade_management_items: matvardManagementItems(),
    exit_criteria_items: matvardExitItems(),
    notes_items: matvardNoteItems(),
  };
}

// ─── ModelCardGrid ────────────────────────────────────────────

function parseModelLabel(label: string) {
  const dashIdx = label.indexOf(" — ");
  if (dashIdx === -1) return { acronym: label.slice(0, 6), rest: label };
  const acronym = label.slice(0, dashIdx);
  const rest = label.slice(dashIdx + 3);
  const colonIdx = rest.indexOf(": ");
  if (colonIdx === -1) return { acronym, name: rest, desc: "" };
  return { acronym, name: rest.slice(0, colonIdx), desc: rest.slice(colonIdx + 2) };
}

interface ModelCardProps {
  item: RuleItem;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: (newLabel: string) => void;
  editMode: boolean;
}

function ModelCard({ item, onToggle, onDelete, onEdit, editMode }: ModelCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setDraft(item.label); }, [item.label]);

  function commitEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.label) onEdit(trimmed);
    else setDraft(item.label);
    setEditing(false);
  }

  const { acronym, name } = parseModelLabel(item.label);

  if (editing) {
    return (
      <div className="rounded-xl border border-accent/40 bg-surface-2 p-3 space-y-2">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") { setDraft(item.label); setEditing(false); } }}
          onBlur={commitEdit}
          className="w-full bg-surface border border-accent rounded-md px-2.5 py-1.5 text-xs text-text-primary focus:outline-none"
        />
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={commitEdit} className="text-profit transition-colors" title="Save">
            <Check className="size-3.5" />
          </button>
          <button type="button" onClick={() => { setDraft(item.label); setEditing(false); }} className="text-text-disabled transition-colors" title="Cancel">
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Edit controls — float above card, only in edit mode */}
      {editMode && (
        <div className="absolute -top-2 -right-2 z-10 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="size-5 flex items-center justify-center rounded-full bg-surface-2 border border-border text-text-disabled transition-colors"
            title="Edit"
          >
            <Pencil className="size-2.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="size-5 flex items-center justify-center rounded-full bg-surface-2 border border-border text-text-disabled transition-colors"
            title="Delete"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      {/* 3D tile button */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full text-left rounded-xl border px-4 py-3 cursor-pointer transition-transform active:translate-y-[2px]",
          item.enabled
            ? "bg-[#2a2242] border-[#a78bfa55] shadow-[0_4px_0_#7c5fd4]"
            : "bg-surface-2 border-border shadow-[0_4px_0_#13111e]"
        )}
      >
        <p className={cn(
          "text-lg font-black font-mono tracking-tight leading-none",
          item.enabled ? "text-accent" : "text-text-disabled"
        )}>
          {acronym}
        </p>
        {name && (
          <p className={cn(
            "text-[11px] font-medium mt-1 leading-snug",
            item.enabled ? "text-text-secondary" : "text-text-disabled"
          )}>
            {name}
          </p>
        )}
      </button>
    </div>
  );
}

export interface ModelCardGridProps {
  items: RuleItem[];
  onChange: (items: RuleItem[]) => void;
  editMode: boolean;
}

export function ModelCardGrid({ items, onChange, editMode }: ModelCardGridProps) {
  const [newLabel, setNewLabel] = useState("");
  const addRef = useRef<HTMLInputElement>(null);

  function toggle(id: string) {
    onChange(items.map((i) => i.id === id ? { ...i, enabled: !i.enabled } : i));
  }
  function remove(id: string) {
    onChange(items.filter((i) => i.id !== id));
  }
  function edit(id: string, text: string) {
    onChange(items.map((i) => i.id === id ? { ...i, label: text } : i));
  }
  function add() {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    onChange([...items, { id: `model_${Date.now()}`, label: trimmed, enabled: true, isCustom: true }]);
    setNewLabel("");
    addRef.current?.focus();
  }

  const enabledCount = items.filter((i) => i.enabled).length;

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-xs text-text-disabled py-2 text-center">No models — add one below</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <ModelCard
            key={item.id}
            item={item}
            onToggle={() => toggle(item.id)}
            onDelete={() => remove(item.id)}
            onEdit={(text) => edit(item.id, text)}
            editMode={editMode}
          />
        ))}
      </div>

      {editMode && (
        <div className="flex items-center gap-2 pt-1 border-t border-border/50">
          <input
            ref={addRef}
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="Add model (e.g.: RPB — Return Pullback: description)..."
            className="flex-1 bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={add}
            disabled={!newLabel.trim()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Plus className="size-3" />
            Add
          </button>
        </div>
      )}

      {items.length > 0 && (
        <p className="text-[10px] text-text-disabled">{enabledCount}/{items.length} active</p>
      )}
    </div>
  );
}

// ─── Accordion ────────────────────────────────────────────────

interface SectionProps {
  title: string;
  badge?: string | number;
  badgeColor?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, badge, badgeColor = "text-text-secondary", children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface hover:bg-surface-2 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open
            ? <ChevronDown className="size-3.5 text-text-secondary shrink-0" />
            : <ChevronRight className="size-3.5 text-text-secondary shrink-0" />}
          <span className="text-sm font-medium text-text-primary">{title}</span>
        </div>
        {badge !== undefined && (
          <span className={cn("text-xs font-mono", badgeColor)}>{badge}</span>
        )}
      </button>
      {open && <div className="px-4 pb-4 pt-3 bg-surface">{children}</div>}
    </div>
  );
}

// ─── PlanEditor ───────────────────────────────────────────────

interface PlanEditorProps {
  form: PlanFormData;
  onChange: (form: PlanFormData) => void;
  initialEditMode?: boolean;
}

export default function PlanEditor({ form, onChange, initialEditMode = false }: PlanEditorProps) {
  const [editMode, setEditMode] = useState(initialEditMode);
  function set<K extends keyof PlanFormData>(key: K, value: PlanFormData[K]) {
    onChange({ ...form, [key]: value });
  }

  function activeBadge(items: RuleItem[]) {
    const enabled = items.filter((i) => i.enabled).length;
    return `${enabled}/${items.length}`;
  }

  const hasAnyContent =
    form.charting_items.length > 0 ||
    form.confluence_items.length > 0 ||
    form.model_items.length > 0 ||
    form.trade_management_items.length > 0 ||
    form.exit_criteria_items.length > 0;

  return (
    <div className="space-y-3">

      {/* ── Header ──────────────────────────────────────── */}
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Plan name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="My trading plan"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Plan type</label>
            <select
              value={form.plan_type}
              onChange={(e) => set("plan_type", e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="CUSTOM">Custom</option>
              <option value="MATVARD_PHASE2">MATVARD Phase 2</option>
              <option value="MATVARD_PHASE1">MATVARD Phase 1</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          {/* Active toggle */}
          <div
            onClick={() => set("is_active", !form.is_active)}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <div className={cn(
              "w-9 h-5 rounded-full transition-colors relative shrink-0",
              form.is_active ? "bg-accent" : "bg-surface-2 border border-border"
            )}>
              <div className={cn(
                "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
                form.is_active ? "translate-x-4" : "translate-x-0.5"
              )} />
            </div>
            <span className={cn("text-sm", form.is_active ? "text-accent font-medium" : "text-text-secondary")}>
              {form.is_active ? "Plan active" : "Plan inactive"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Edit mode toggle */}
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors",
                editMode
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-text-secondary hover:border-accent/40 hover:text-accent"
              )}
              title={editMode ? "Disable edit mode" : "Enable edit mode"}
            >
              {editMode ? <Pencil className="size-3" /> : <Lock className="size-3" />}
              {editMode ? "Editing" : "Edit"}
            </button>

            {/* Load MATVARD template button */}
            <button
              type="button"
              onClick={() => {
                const confirmed = hasAnyContent
                  ? confirm("Load the MATVARD template? This will replace the current content.")
                  : true;
                if (confirmed) onChange(loadMATVARD(form));
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/40 text-accent text-xs hover:bg-accent/10 transition-colors"
              title="Fill all fields with MATVARD defaults"
            >
              <Wand2 className="size-3" />
              MATVARD Template
            </button>
          </div>
        </div>
      </div>

      {/* ── Proceso de Charting ──────────────────────────── */}
      <Section
        title="Charting Process (Pre-market)"
        badge={form.charting_items.length > 0 ? activeBadge(form.charting_items) : "empty"}
        badgeColor={form.charting_items.length > 0 ? "text-text-secondary" : "text-text-disabled"}
        defaultOpen
      >
        <EditableChecklist
          items={form.charting_items}
          onChange={(items) => set("charting_items", items)}
          addPlaceholder="Add charting step..."
          editMode={editMode}
        />
      </Section>

      {/* ── Entry Criteria (confluences) ─────────── */}
      <Section
        title="Entry Criteria"
        badge={form.confluence_items.length > 0 ? activeBadge(form.confluence_items) : "empty"}
        badgeColor={form.confluence_items.length > 0 ? "text-text-secondary" : "text-text-disabled"}
        defaultOpen
      >
        <EditableChecklist
          items={form.confluence_items}
          onChange={(items) => set("confluence_items", items)}
          addPlaceholder="Add entry criterion..."
          editMode={editMode}
        />
      </Section>

      {/* ── Entry Models ──────────────────────────── */}
      <Section
        title="Entry Models"
        badge={form.model_items.length > 0 ? activeBadge(form.model_items) : "empty"}
        badgeColor={form.model_items.length > 0 ? "text-text-secondary" : "text-text-disabled"}
        defaultOpen
      >
        <ModelCardGrid
          items={form.model_items}
          onChange={(items) => set("model_items", items)}
          editMode={editMode}
        />
      </Section>

      {/* ── Trade Management ──────────────────────────── */}
      <Section
        title="Trade Management"
        badge={form.trade_management_items.length > 0 ? activeBadge(form.trade_management_items) : "empty"}
        badgeColor={form.trade_management_items.length > 0 ? "text-text-secondary" : "text-text-disabled"}
        defaultOpen
      >
        <EditableChecklist
          items={form.trade_management_items}
          onChange={(items) => set("trade_management_items", items)}
          addPlaceholder="Add management rule..."
          editMode={editMode}
        />
      </Section>

      {/* ── Exit Criteria ────────────────────────── */}
      <Section
        title="Exit Criteria"
        badge={form.exit_criteria_items.length > 0 ? activeBadge(form.exit_criteria_items) : "empty"}
        badgeColor={form.exit_criteria_items.length > 0 ? "text-text-secondary" : "text-text-disabled"}
        defaultOpen
      >
        <EditableChecklist
          items={form.exit_criteria_items}
          onChange={(items) => set("exit_criteria_items", items)}
          addPlaceholder="Add exit criterion..."
          editMode={editMode}
        />
      </Section>

    </div>
  );
}
