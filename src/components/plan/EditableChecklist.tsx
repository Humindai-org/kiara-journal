"use client";

import { useState, useRef, useEffect } from "react";
import { CheckSquare, Square, Trash2, Plus, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { RuleItem } from "./planData";

// ─── Inline-editable item ────────────────────────────────────

interface ItemRowProps {
  item: RuleItem;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: (newLabel: string) => void;
  editMode: boolean;
}

function ItemRow({ item, onToggle, onDelete, onEdit, editMode }: ItemRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Keep draft in sync when item.label changes from parent (e.g. plan switch)
  useEffect(() => {
    setDraft(item.label);
  }, [item.label]);

  function commitEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.label) onEdit(trimmed);
    else setDraft(item.label);
    setEditing(false);
  }

  function cancelEdit() {
    setDraft(item.label);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-1">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") cancelEdit();
          }}
          onBlur={commitEdit}
          className="flex-1 bg-surface-2 border border-accent rounded-md px-2.5 py-1 text-xs text-text-primary focus:outline-none"
        />
        <button type="button" onClick={commitEdit} className="shrink-0 text-profit hover:text-profit/80 transition-colors" title="Save">
          <Check className="size-3.5" />
        </button>
        <button type="button" onClick={cancelEdit} className="shrink-0 text-text-disabled hover:text-text-secondary transition-colors" title="Cancel">
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 py-1.5 rounded-lg hover:bg-surface-2 px-1 -mx-1 transition-colors">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "mt-0.5 shrink-0 transition-colors",
          item.enabled ? "text-accent" : "text-text-disabled"
        )}
        title={item.enabled ? "Disable" : "Enable"}
      >
        {item.enabled
          ? <CheckSquare className="size-4" />
          : <Square className="size-4" />}
      </button>

      <span
        className={cn(
          "flex-1 text-xs leading-snug select-none",
          item.enabled ? "text-text-primary" : "text-text-disabled line-through"
        )}
      >
        {item.label}
      </span>

      {editMode && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => { setDraft(item.label); setEditing(true); }}
            className="p-1 rounded text-text-disabled hover:text-accent hover:bg-accent/10 transition-colors"
            title="Edit text"
          >
            <Pencil className="size-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1 rounded text-text-disabled hover:text-loss hover:bg-loss/10 transition-colors"
            title="Delete"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── EditableChecklist ────────────────────────────────────────

interface EditableChecklistProps {
  items: RuleItem[];
  onChange: (items: RuleItem[]) => void;
  addPlaceholder?: string;
  editMode?: boolean;
}

export default function EditableChecklist({
  items,
  onChange,
  addPlaceholder = "Add item...",
  editMode = false,
}: EditableChecklistProps) {
  const [newLabel, setNewLabel] = useState("");
  const addRef = useRef<HTMLInputElement>(null);

  function toggle(id: string) {
    onChange(items.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item));
  }

  function remove(id: string) {
    onChange(items.filter((item) => item.id !== id));
  }

  function edit(id: string, newText: string) {
    onChange(items.map((item) => item.id === id ? { ...item, label: newText } : item));
  }

  function add() {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const id = `custom_${Date.now()}`;
    onChange([...items, { id, label: trimmed, enabled: true, isCustom: true }]);
    setNewLabel("");
    addRef.current?.focus();
  }

  const enabledCount = items.filter((i) => i.enabled).length;

  return (
    <div className="space-y-0.5">
      {items.length === 0 && (
        <p className="text-xs text-text-disabled py-2 text-center">No items — add one below</p>
      )}

      {items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          onToggle={() => toggle(item.id)}
          onDelete={() => remove(item.id)}
          onEdit={(text) => edit(item.id, text)}
          editMode={editMode}
        />
      ))}

      {/* Add row — only visible in edit mode */}
      {editMode && (
        <div className="flex items-center gap-2 pt-3 mt-1 border-t border-border/50">
          <input
            ref={addRef}
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder={addPlaceholder}
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
        <p className="text-[10px] text-text-disabled pt-1">{enabledCount}/{items.length} active</p>
      )}
    </div>
  );
}
