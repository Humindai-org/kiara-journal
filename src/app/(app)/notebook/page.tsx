"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import UnderlineTT from "@tiptap/extension-underline";
import LinkTT from "@tiptap/extension-link";
import ImageTT from "@tiptap/extension-image";
import PlaceholderTT from "@tiptap/extension-placeholder";
import TextAlignTT from "@tiptap/extension-text-align";
import HighlightTT from "@tiptap/extension-highlight";
import {
  Brain, TrendingUp, Clock, Shield, FileText, BookOpen,
  Star, Pin, MoreHorizontal, Grid3x3, List, Search, Plus,
  ChevronRight, Check, X, Trash2, Copy, FolderOpen, Flame,
  Bold, Italic, Underline, Strikethrough, ListOrdered,
  Quote, Code, Code2, Link2, Image as LucideImage,
  AlignLeft, AlignCenter, AlignRight, Highlighter, Minus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import TopBar from "@/components/layout/TopBar";
import { createClient } from "@/lib/supabase/client";

// ─── Types ──────────────────────────────────────────────────────────────────

type Category = "MINDSET" | "STRATEGY" | "ROUTINE" | "RISK" | "TEMPLATE" | "PLAYBOOK";

type Note = {
  id: string;
  title: string;
  category: Category;
  content: string | null;
  is_pinned: boolean;
  is_favorite: boolean;
  tags: string[];
  folder: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
};

type Trade = {
  id: string;
  instrument: string;
  direction: "LONG" | "SHORT";
  net_pnl: number | null;
  open_time: string;
};

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_META: Record<Category, { label: string; color: string; icon: typeof Brain }> = {
  MINDSET:  { label: "Mindset",   color: "#44e4b2", icon: Brain },
  STRATEGY: { label: "Strategy",  color: "#9d8bff", icon: TrendingUp },
  ROUTINE:  { label: "Routine",   color: "#fbbf24", icon: Clock },
  RISK:     { label: "Risk",      color: "#ff6b8a", icon: Shield },
  TEMPLATE: { label: "Template",  color: "#60a5fa", icon: FileText },
  PLAYBOOK: { label: "Playbook",  color: "#f97316", icon: BookOpen },
};

const DEFAULT_FOLDERS: { name: string; category: Category }[] = [
  { name: "Playbook",        category: "PLAYBOOK" },
  { name: "Mindset",         category: "MINDSET"  },
  { name: "Strategies",      category: "STRATEGY" },
  { name: "Risk Management", category: "RISK"     },
  { name: "Templates",       category: "TEMPLATE" },
];

const CATEGORY_TABS = [
  { key: "ALL",      label: "All"      },
  { key: "MINDSET",  label: "Mindset"  },
  { key: "STRATEGY", label: "Strategy" },
  { key: "ROUTINE",  label: "Routine"  },
  { key: "RISK",     label: "Risk"     },
  { key: "TEMPLATE", label: "Template" },
];

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Today, ${new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  if (h < 48) return "Yesterday";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeContent(content: string | null): string {
  if (!content) return "";
  const trimmed = content.trim();
  if (trimmed.startsWith("<")) return trimmed;
  return trimmed.split(/\n\n+/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}

// ─── Hoisted components ──────────────────────────────────────────────────────

function OverviewItem({ icon: Icon, label, count, active, onClick }: {
  icon: typeof Star; label: string; count: number; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors active:scale-95", focusRing, active ? "bg-accent-soft text-accent" : "text-text-secondary hover:text-text-primary hover:bg-surface-2")}>
      <Icon className="size-3.5 shrink-0" />
      <span className="flex-1 text-left truncate">{label}</span>
      <span className={cn("text-[10px] tabular-nums px-1.5 py-0.5 rounded-md", active ? "bg-accent/20 text-accent" : "bg-surface-2 text-text-disabled")}>{count}</span>
    </button>
  );
}

function TBtn({ onClick, active, label, children, disabled }: {
  onClick: () => void; active?: boolean; label: string; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button onMouseDown={(e) => { e.preventDefault(); onClick(); }} aria-label={label} disabled={disabled}
      className={cn("size-7 flex items-center justify-center rounded-md text-xs font-bold transition-colors", focusRing, active ? "bg-accent-soft text-accent" : "text-text-muted hover:text-text-primary hover:bg-surface-2", disabled && "opacity-30 cursor-not-allowed")}>
      {children}
    </button>
  );
}

function TDivider() {
  return <span className="h-4 w-px bg-border-light mx-0.5 shrink-0" />;
}

function EditorToolbar({ editor, onImageClick, onTradeClick }: {
  editor: Editor | null; onImageClick: () => void; onTradeClick: () => void;
}) {
  if (!editor) return null;

  function insertLink() {
    if (!editor) return;
    const url = window.prompt("URL:", "https://");
    if (!url) return;
    if (editor.state.selection.empty) {
      editor.chain().focus().setLink({ href: url }).insertContent(url).run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }

  return (
    <div className="flex items-center gap-0.5 px-4 py-2 border-b border-border bg-surface-light flex-wrap shrink-0">
      <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} label="H1"><span className="text-[10px]">H1</span></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} label="H2"><span className="text-[10px]">H2</span></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} label="H3"><span className="text-[10px]">H3</span></TBtn>
      <TDivider />
      <TBtn onClick={() => editor.chain().focus().toggleBold().run()}          active={editor.isActive("bold")}        label="Bold"><Bold className="size-3.5" /></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleItalic().run()}        active={editor.isActive("italic")}      label="Italic"><Italic className="size-3.5" /></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()}     active={editor.isActive("underline")}   label="Underline"><Underline className="size-3.5" /></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleStrike().run()}        active={editor.isActive("strike")}      label="Strikethrough"><Strikethrough className="size-3.5" /></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleHighlight().run()}     active={editor.isActive("highlight")}   label="Highlight"><Highlighter className="size-3.5" /></TBtn>
      <TDivider />
      <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()}    active={editor.isActive("bulletList")}  label="Bullet list"><List className="size-3.5" /></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()}   active={editor.isActive("orderedList")} label="Ordered list"><ListOrdered className="size-3.5" /></TBtn>
      <TDivider />
      <TBtn onClick={() => editor.chain().focus().toggleBlockquote().run()}    active={editor.isActive("blockquote")}  label="Blockquote"><Quote className="size-3.5" /></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()}     active={editor.isActive("codeBlock")}   label="Code block"><Code2 className="size-3.5" /></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleCode().run()}          active={editor.isActive("code")}        label="Inline code"><Code className="size-3.5" /></TBtn>
      <TBtn onClick={() => editor.chain().focus().setHorizontalRule().run()}   label="Divider"><Minus className="size-3.5" /></TBtn>
      <TDivider />
      <TBtn onClick={() => editor.chain().focus().setTextAlign("left").run()}  active={editor.isActive({ textAlign: "left" })}   label="Align left"><AlignLeft className="size-3.5" /></TBtn>
      <TBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} label="Align center"><AlignCenter className="size-3.5" /></TBtn>
      <TBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })}  label="Align right"><AlignRight className="size-3.5" /></TBtn>
      <TDivider />
      <TBtn onClick={insertLink}   active={editor.isActive("link")} label="Link"><Link2 className="size-3.5" /></TBtn>
      <TBtn onClick={onImageClick} label="Image"><LucideImage className="size-3.5" /></TBtn>
      <TDivider />
      <TBtn onClick={onTradeClick} label="Trade reference"><TrendingUp className="size-3.5" /></TBtn>
    </div>
  );
}

function ImageDialog({ onInsert, onClose }: { onInsert: (url: string, alt: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-80 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-text-primary">Insert Image</p>
          <button onClick={onClose} className={cn("size-6 flex items-center justify-center rounded text-text-disabled hover:text-text-primary transition-colors", focusRing)}><X className="size-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-muted mb-1.5 block">Image URL</label>
            <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && url && onInsert(url, alt)} placeholder="https://example.com/image.png"
              className={cn("w-full bg-surface-hi border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-disabled", focusRing)} />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1.5 block">Alt text (optional)</label>
            <input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Description"
              className={cn("w-full bg-surface-hi border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-disabled", focusRing)} />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className={cn("px-3 py-1.5 text-xs text-text-muted hover:text-text-primary border border-border rounded-lg transition-colors", focusRing)}>Cancel</button>
          <button onClick={() => url && onInsert(url, alt)} disabled={!url} className={cn("btn-action px-3 py-1.5 text-xs rounded-lg", focusRing)}>Insert</button>
        </div>
      </div>
    </div>
  );
}

function TradeRefDialog({ trades, loading, onInsert, onClose }: {
  trades: Trade[]; loading: boolean; onInsert: (t: Trade) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = trades.filter((t) =>
    t.instrument.toLowerCase().includes(q.toLowerCase()) || t.direction.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-96 p-5 space-y-3 max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <p className="text-sm font-semibold text-text-primary">Insert Trade Reference</p>
          <button onClick={onClose} className={cn("size-6 flex items-center justify-center rounded text-text-disabled hover:text-text-primary transition-colors", focusRing)}><X className="size-4" /></button>
        </div>
        <div className="relative shrink-0">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-disabled" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search trades…"
            className={cn("w-full bg-surface-hi border border-border rounded-lg pl-8 pr-3 py-2 text-xs text-text-primary placeholder:text-text-disabled", focusRing)} />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {loading ? <p className="text-xs text-text-disabled text-center py-4">Loading…</p>
            : filtered.length === 0 ? <p className="text-xs text-text-disabled text-center py-4">No trades found</p>
            : filtered.map((t) => {
              const pnl = t.net_pnl ?? 0;
              const win = pnl > 0;
              return (
                <button key={t.id} onClick={() => onInsert(t)}
                  className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-colors text-left", focusRing)}>
                  <span className={cn("size-7 rounded-lg flex items-center justify-center text-xs font-bold", win ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss")}>
                    {t.direction[0]}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-semibold text-text-primary">{t.instrument}</span>
                    <span className="block text-[10px] text-text-muted">{formatDate(t.open_time)}</span>
                  </span>
                  <span className={cn("text-xs font-bold tabular-nums", win ? "text-profit" : "text-loss")}>
                    {win ? "+" : ""}{pnl.toFixed(2)}$
                  </span>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function NotebookPage() {
  // ── Supabase (defined first so useEditor's async callbacks can close over db) ──
  const supabase = useMemo(() => createClient(), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // ── All state (must come before useEditor so its onUpdate can close over setters) ──
  const [userId,         setUserId]         = useState<string | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [notes,          setNotes]          = useState<Note[]>([]);
  const [selectedNote,   setSelectedNote]   = useState<Note | null>(null);
  const [isEditing,      setIsEditing]      = useState(false);
  const [viewMode,       setViewMode]       = useState<"grid" | "list">("grid");
  const [activeFolder,   setActiveFolder]   = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [searchQuery,    setSearchQuery]    = useState("");
  const [editTitle,      setEditTitle]      = useState("");
  const [editTags,       setEditTags]       = useState<string[]>([]);
  const [tagInput,       setTagInput]       = useState("");
  const [saving,         setSaving]         = useState(false);
  const [savedAt,        setSavedAt]        = useState<Date | null>(null);
  const [openMenuId,     setOpenMenuId]     = useState<string | null>(null);
  const [moveMenuId,     setMoveMenuId]     = useState<string | null>(null);
  const [showImageDlg,   setShowImageDlg]   = useState(false);
  const [showTradeDlg,   setShowTradeDlg]   = useState(false);
  const [tradeList,      setTradeList]      = useState<Trade[]>([]);
  const [tradesLoading,  setTradesLoading]  = useState(false);
  const [now,            setNow]            = useState(0);

  // ── All refs ──────────────────────────────────────────────────────────────
  const saveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteIdRef    = useRef<string | null>(null);
  const titleRef     = useRef("");
  const tagsRef      = useRef<string[]>([]);
  const isLoadingRef = useRef(false);

  // ── Tiptap — onUpdate closes over db, setters, refs (all defined above) ──
  const editor = useEditor({
    extensions: [
      StarterKit,
      UnderlineTT,
      HighlightTT,
      LinkTT.configure({ openOnClick: false }),
      ImageTT.configure({ inline: false }),
      PlaceholderTT.configure({ placeholder: "Start writing your note…" }),
      TextAlignTT.configure({ types: ["heading", "paragraph"] }),
    ],
    editorProps: { attributes: { class: "tiptap-editor focus:outline-none" } },
    onUpdate: ({ editor: e }) => {
      if (isLoadingRef.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const html = e.getHTML();
      saveTimer.current = setTimeout(async () => {
        const noteId = noteIdRef.current;
        if (!noteId) return;
        const title      = titleRef.current.trim() || "Untitled Note";
        const tags       = tagsRef.current;
        const updated_at = new Date().toISOString();
        setSaving(true);
        // Try with tags (requires migration 0011); fallback without
        const { error } = await db.from("notebooks").update({ title, content: html, tags, updated_at }).eq("id", noteId);
        if (error) {
          const { error: e2 } = await db.from("notebooks").update({ title, content: html, updated_at }).eq("id", noteId);
          if (e2) { toast.error("Error saving note"); setSaving(false); return; }
        }
        setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, title, content: html, tags, updated_at } : n));
        setSaving(false);
        setSavedAt(new Date());
      }, 800);
    },
    immediatelyRender: false,
  });

  // ── Keep refs in sync with state ─────────────────────────────────────────
  useEffect(() => { titleRef.current = editTitle; }, [editTitle]);
  useEffect(() => { tagsRef.current  = editTags;  }, [editTags]);

  // ── Load editor content when switching notes ──────────────────────────────
  useEffect(() => {
    if (!editor || !selectedNote) return;
    isLoadingRef.current = true;
    editor.commands.setContent(normalizeContent(selectedNote.content));
    setTimeout(() => { isLoadingRef.current = false; }, 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNote?.id]);

  // ── Fetch notes on mount ──────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) { setLoading(false); return; }
      setUserId(data.user.id);
      const { data: rows, error } = await supabase
        .from("notebooks").select("*").eq("user_id", data.user.id).order("updated_at", { ascending: false });
      if (error) toast.error("Error loading notes");
      setNotes(((rows as unknown) as Note[]) ?? []);
      setNow(Date.now());
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cmd/Ctrl+S ────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && noteIdRef.current) {
        e.preventDefault();
        saveNow();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const cut = now - 7 * 24 * 60 * 60 * 1000;
    return {
      all:       notes.length,
      favorites: notes.filter((n) => n.is_favorite).length,
      recent:    notes.filter((n) => new Date(n.updated_at).getTime() > cut).length,
      pinned:    notes.filter((n) => n.is_pinned).length,
    };
  }, [notes, now]);

  const customFolders = useMemo(() => {
    const defaults = new Set(DEFAULT_FOLDERS.map((f) => f.name));
    const names    = new Set<string>();
    for (const n of notes) if (n.folder && !defaults.has(n.folder)) names.add(n.folder);
    return [...names].sort();
  }, [notes]);

  const folderCount = useCallback(
    (name: string, category?: Category) =>
      notes.filter((n) => n.folder === name || (category && n.category === category)).length,
    [notes]
  );

  const displayedNotes = useMemo(() => {
    let f = notes;
    if (activeFolder === "FAVORITES") f = f.filter((n) => n.is_favorite);
    else if (activeFolder === "PINNED")  f = f.filter((n) => n.is_pinned);
    else if (activeFolder === "RECENT")  f = f.filter((n) => now - new Date(n.updated_at).getTime() < 7 * 24 * 60 * 60 * 1000);
    else if (activeFolder) {
      const def = DEFAULT_FOLDERS.find((x) => x.name === activeFolder);
      f = f.filter((n) => n.folder === activeFolder || (def && n.category === def.category));
    }
    if (activeCategory !== "ALL") f = f.filter((n) => n.category === activeCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      f = f.filter((n) => n.title.toLowerCase().includes(q) || stripHtml(n.content ?? "").toLowerCase().includes(q));
    }
    return [...f].sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned));
  }, [notes, activeFolder, activeCategory, searchQuery, now]);

  const recentActivity = useMemo(
    () => [...notes].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 5),
    [notes]
  );

  const categoryDist = useMemo(() =>
    (Object.keys(CATEGORY_META) as Category[])
      .map((c) => ({ category: c, ...CATEGORY_META[c], count: notes.filter((n) => n.category === c).length }))
      .filter((c) => c.count > 0).sort((a, b) => b.count - a.count).slice(0, 5),
    [notes]
  );

  const donutGradient = useMemo(() => {
    const total = categoryDist.reduce((s, c) => s + c.count, 0);
    if (total === 0) return "conic-gradient(#2b2740 0% 100%)";
    let acc = 0;
    const stops = categoryDist.map((c) => {
      const start = (acc / total) * 100;
      acc += c.count;
      return `${c.color} ${start}% ${(acc / total) * 100}%`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [categoryDist]);

  const streakData = useMemo(() => {
    const active = new Set<string>();
    for (const n of notes) { active.add(dayKey(new Date(n.created_at))); active.add(dayKey(new Date(n.updated_at))); }
    let streak = 0;
    const cur  = new Date();
    if (!active.has(dayKey(cur))) cur.setDate(cur.getDate() - 1);
    while (active.has(dayKey(cur))) { streak++; cur.setDate(cur.getDate() - 1); }
    const today = new Date();
    const mo    = (today.getDay() + 6) % 7;
    const week  = WEEKDAYS.map((label, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - mo + i);
      return { label, done: active.has(dayKey(d)), future: d.getTime() > today.getTime() };
    });
    return { streak, week };
  }, [notes]);

  const totalFolders = DEFAULT_FOLDERS.length + customFolders.length;

  // ── Mutations ─────────────────────────────────────────────────────────────

  const openEditor = useCallback((note: Note) => {
    noteIdRef.current = note.id;
    setSelectedNote(note);
    setEditTitle(note.title);
    setEditTags(note.tags ?? []);
    setTagInput("");
    setSavedAt(null);
    setIsEditing(true);
    setOpenMenuId(null);
  }, []);

  async function saveNow() {
    const noteId = noteIdRef.current;
    if (!noteId || !editor) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const html       = editor.getHTML();
    const title      = titleRef.current.trim() || "Untitled Note";
    const tags       = tagsRef.current;
    const updated_at = new Date().toISOString();
    setSaving(true);
    const { error } = await db.from("notebooks").update({ title, content: html, tags, updated_at }).eq("id", noteId);
    if (error) {
      const { error: e2 } = await db.from("notebooks").update({ title, content: html, updated_at }).eq("id", noteId);
      if (e2) { toast.error("Error saving note"); setSaving(false); return; }
    }
    setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, title, content: html, tags, updated_at } : n));
    setSaving(false);
    setSavedAt(new Date());
  }

  async function createNote() {
    if (!userId) return;
    const { data, error } = await db.from("notebooks")
      .insert({ user_id: userId, title: "Untitled Note", category: "MINDSET", content: "" })
      .select().single();
    if (error || !data) { toast.error("Error creating note"); return; }
    setNotes((prev) => [data as Note, ...prev]);
    openEditor(data as Note);
  }

  async function changeCategory(category: Category) {
    if (!selectedNote) return;
    const { error } = await db.from("notebooks").update({ category }).eq("id", selectedNote.id);
    if (error) { toast.error("Error updating category"); return; }
    setSelectedNote((prev) => prev ? { ...prev, category } : prev);
    setNotes((prev) => prev.map((n) => n.id === selectedNote.id ? { ...n, category } : n));
  }

  async function toggleFavorite(noteId: string) {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const v = !note.is_favorite;
    const { error } = await db.from("notebooks").update({ is_favorite: v }).eq("id", noteId);
    if (error) { toast.error("Error updating favorite"); return; }
    setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, is_favorite: v } : n));
  }

  async function togglePin(noteId: string) {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const v = !note.is_pinned;
    const { error } = await db.from("notebooks").update({ is_pinned: v }).eq("id", noteId);
    if (error) { toast.error("Error updating pin"); return; }
    setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, is_pinned: v } : n));
    setOpenMenuId(null);
  }

  async function duplicateNote(noteId: string) {
    const note = notes.find((n) => n.id === noteId);
    if (!note || !userId) return;
    const { data, error } = await db.from("notebooks")
      .insert({ user_id: userId, title: `${note.title} (copy)`, category: note.category, content: note.content, tags: note.tags, folder: note.folder, color: note.color })
      .select().single();
    if (error || !data) { toast.error("Error duplicating"); return; }
    setNotes((prev) => [data as Note, ...prev]);
    setOpenMenuId(null);
    toast.success("Note duplicated");
  }

  async function moveToFolder(noteId: string, folderName: string) {
    const def   = DEFAULT_FOLDERS.find((f) => f.name === folderName);
    const patch: Record<string, unknown> = { folder: folderName };
    if (def) patch.category = def.category;
    const { error } = await db.from("notebooks").update(patch).eq("id", noteId);
    if (error) { toast.error("Error moving note"); return; }
    setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, folder: folderName, ...(def ? { category: def.category } : {}) } : n));
    setOpenMenuId(null);
    setMoveMenuId(null);
    toast.success(`Moved to ${folderName}`);
  }

  async function deleteNote(noteId: string) {
    if (!confirm("Delete this note? This action cannot be undone.")) return;
    const { error } = await db.from("notebooks").delete().eq("id", noteId);
    if (error) { toast.error("Error deleting note"); return; }
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    if (selectedNote?.id === noteId) { setSelectedNote(null); setIsEditing(false); noteIdRef.current = null; }
    setOpenMenuId(null);
    toast.success("Note deleted");
  }

  function addTag() {
    const tag = tagInput.trim().replace(/^#/, "");
    if (!tag || editTags.includes(tag)) { setTagInput(""); return; }
    setEditTags((prev) => [...prev, tag]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setEditTags((prev) => prev.filter((t) => t !== tag));
  }

  function closeEditor() {
    saveNow();
    setSelectedNote(null);
    setIsEditing(false);
    noteIdRef.current = null;
  }

  function closeEditorIfOpen() { if (isEditing) closeEditor(); }

  function selectOverview(id: string | null) {
    setActiveFolder(id);
    setActiveCategory("ALL");
    closeEditorIfOpen();
  }

  async function openTradeDialog() {
    setShowTradeDlg(true);
    setTradesLoading(true);
    const { data } = await supabase.from("trades")
      .select("id, instrument, direction, net_pnl, open_time")
      .order("open_time", { ascending: false }).limit(50);
    setTradeList(((data as unknown) as Trade[]) ?? []);
    setTradesLoading(false);
  }

  function insertTradeRef(trade: Trade) {
    if (!editor) return;
    const pnl  = trade.net_pnl ?? 0;
    const sign = pnl > 0 ? "+" : "";
    const icon = trade.direction === "LONG" ? "📈" : "📉";
    editor.chain().focus()
      .insertContent(`<span class="trade-ref" contenteditable="false">${icon} ${trade.instrument} ${trade.direction} ${sign}${pnl.toFixed(2)}$ · ${formatDate(trade.open_time)}</span> `)
      .run();
    setShowTradeDlg(false);
  }

  function insertImage(url: string, alt: string) {
    if (!editor) return;
    editor.chain().focus().setImage({ src: url, alt }).run();
    setShowImageDlg(false);
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const headerTitle =
    activeFolder === "FAVORITES" ? "Favorites"
    : activeFolder === "PINNED"  ? "Pinned"
    : activeFolder === "RECENT"  ? "Recent"
    : activeFolder ?? "All Notes";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <TopBar title="Notebook" />

      {showImageDlg && <ImageDialog onInsert={insertImage} onClose={() => setShowImageDlg(false)} />}
      {showTradeDlg && <TradeRefDialog trades={tradeList} loading={tradesLoading} onInsert={insertTradeRef} onClose={() => setShowTradeDlg(false)} />}

      {/* Click-away overlay to close menus */}
      {(openMenuId || moveMenuId) && (
        <div className="fixed inset-0 z-10" onClick={() => { setOpenMenuId(null); setMoveMenuId(null); }} />
      )}

      <main className="flex-1 overflow-hidden flex">

        {/* ═══ LEFT ═══ */}
        <aside className="w-56 shrink-0 bg-sidebar border-r border-border flex flex-col overflow-y-auto">
          <div className="p-3 space-y-5">
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider px-2.5 mb-1.5">Overview</p>
              <div className="space-y-0.5">
                <OverviewItem icon={FileText} label="All Notes" count={counts.all}       active={activeFolder === null}        onClick={() => selectOverview(null)} />
                <OverviewItem icon={Star}     label="Favorites" count={counts.favorites} active={activeFolder === "FAVORITES"} onClick={() => selectOverview("FAVORITES")} />
                <OverviewItem icon={Clock}    label="Recent"    count={counts.recent}    active={activeFolder === "RECENT"}    onClick={() => selectOverview("RECENT")} />
                <OverviewItem icon={Pin}      label="Pinned"    count={counts.pinned}    active={activeFolder === "PINNED"}    onClick={() => selectOverview("PINNED")} />
              </div>
            </div>

            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider px-2.5 mb-1.5">Folders</p>
              <div className="space-y-0.5">
                {DEFAULT_FOLDERS.map((f) => {
                  const meta = CATEGORY_META[f.category]; const Icon = meta.icon; const active = activeFolder === f.name;
                  return (
                    <button key={f.name} onClick={() => { setActiveFolder(f.name); setActiveCategory("ALL"); closeEditorIfOpen(); }}
                      className={cn("relative w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors active:scale-95", focusRing, active ? "bg-accent-soft text-text-primary" : "text-text-secondary hover:text-text-primary hover:bg-surface-2")}>
                      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />}
                      <Icon className="size-3.5 shrink-0" style={{ color: meta.color }} />
                      <span className="flex-1 text-left truncate">{f.name}</span>
                      <span className="text-[10px] tabular-nums text-text-disabled">{folderCount(f.name, f.category)}</span>
                    </button>
                  );
                })}
                {customFolders.map((name) => {
                  const active = activeFolder === name;
                  return (
                    <button key={name} onClick={() => { setActiveFolder(name); setActiveCategory("ALL"); closeEditorIfOpen(); }}
                      className={cn("relative w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors active:scale-95", focusRing, active ? "bg-accent-soft text-text-primary" : "text-text-secondary hover:text-text-primary hover:bg-surface-2")}>
                      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />}
                      <FolderOpen className="size-3.5 shrink-0 text-text-muted" />
                      <span className="flex-1 text-left truncate">{name}</span>
                      <span className="text-[10px] tabular-nums text-text-disabled">{folderCount(name)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider px-2.5 mb-1.5">Quick Actions</p>
              <button onClick={createNote} className={cn("btn-action w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 active:scale-95", focusRing)}>
                <Plus className="size-4" /> New Note
              </button>
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => { setActiveFolder(null); setActiveCategory("MINDSET"); closeEditorIfOpen(); }} className={cn("flex-1 px-2 py-1.5 rounded-lg text-xs text-text-muted border border-border hover:text-text-primary hover:bg-surface-2 transition-colors active:scale-95", focusRing)}>Daily Journal</button>
                <button onClick={() => { setActiveFolder("Templates"); setActiveCategory("ALL"); closeEditorIfOpen(); }}  className={cn("flex-1 px-2 py-1.5 rounded-lg text-xs text-text-muted border border-border hover:text-text-primary hover:bg-surface-2 transition-colors active:scale-95", focusRing)}>Template</button>
              </div>
            </div>
          </div>
        </aside>

        {/* ═══ CENTER ═══ */}
        <section className="flex-1 min-w-0 bg-bg flex flex-col overflow-hidden">
          {isEditing && selectedNote ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Editor top bar */}
              <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0">
                <button onClick={closeEditor} className={cn("flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors active:scale-95 rounded-lg px-2 py-1", focusRing)}>
                  <ChevronRight className="size-4 rotate-180" /> Back
                </button>
                <div className="flex-1" />
                <span className="text-xs text-text-disabled">
                  {saving ? "Saving…" : savedAt ? (
                    <span className="inline-flex items-center gap-1 text-profit">Saved <Check className="size-3" /></span>
                  ) : null}
                </span>
                <button onClick={saveNow} className={cn("btn-action px-4 py-1.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 active:scale-95", focusRing)}>Save</button>
              </div>

              {/* Category pills */}
              <div className="flex items-center gap-1.5 flex-wrap px-6 pt-4 pb-2 shrink-0">
                {(Object.keys(CATEGORY_META) as Category[]).map((c) => {
                  const meta = CATEGORY_META[c]; const Icon = meta.icon; const active = selectedNote.category === c;
                  return (
                    <button key={c} onClick={() => changeCategory(c)}
                      className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors active:scale-95", focusRing, !active && "border-border text-text-disabled hover:text-text-secondary hover:bg-surface-2")}
                      style={active ? { borderColor: meta.color, backgroundColor: `${meta.color}1f`, color: meta.color } : undefined}>
                      <Icon className="size-3" /> {meta.label}
                    </button>
                  );
                })}
              </div>

              {/* Title */}
              <input value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={saveNow}
                placeholder="Untitled Note"
                className="w-full bg-transparent text-2xl font-bold tracking-tight text-text-primary placeholder:text-text-disabled focus:outline-none px-6 py-2 shrink-0" />
              <div className="h-px bg-border-light mx-6 shrink-0" />

              {/* Tiptap toolbar */}
              <EditorToolbar editor={editor} onImageClick={() => setShowImageDlg(true)} onTradeClick={openTradeDialog} />

              {/* Editor body */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="tiptap-editor max-w-3xl w-full mx-auto">
                  <EditorContent editor={editor} />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center gap-4 px-6 py-3 border-t border-border text-xs text-text-disabled shrink-0">
                <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                  {editTags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-soft text-accent">
                      #{tag}
                      <button onClick={() => removeTag(tag)} className={cn("hover:text-text-primary transition-colors rounded-full", focusRing)} aria-label={`Remove ${tag}`}><X className="size-2.5" /></button>
                    </span>
                  ))}
                  <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                    onBlur={addTag} placeholder="#tag"
                    className="bg-transparent w-20 text-xs text-text-secondary placeholder:text-text-disabled focus:outline-none" />
                </div>
                <span className="shrink-0">
                  {savedAt ? `Last saved ${savedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "Not saved yet"}
                </span>
              </div>
            </div>
          ) : (
            <>
              {/* Browser header */}
              <div className="sticky top-0 z-10 bg-bg px-6 py-4 border-b border-border space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold tracking-tight text-text-primary">
                    {headerTitle} <span className="text-sm font-normal text-text-disabled">({displayedNotes.length} {displayedNotes.length === 1 ? "note" : "notes"})</span>
                  </h2>
                  <div className="flex-1" />
                  <div className="relative">
                    <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-disabled" />
                    <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search notes…"
                      className={cn("w-48 bg-surface-hi hover:bg-surface-hover rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-disabled border border-border transition-colors", focusRing)} />
                  </div>
                  <div className="flex rounded-lg border border-border overflow-hidden">
                    <button onClick={() => setViewMode("grid")} aria-label="Grid" className={cn("size-8 flex items-center justify-center transition-colors", focusRing, viewMode === "grid" ? "bg-accent-soft text-accent" : "text-text-disabled hover:bg-surface-2")}><Grid3x3 className="size-3.5" /></button>
                    <button onClick={() => setViewMode("list")} aria-label="List" className={cn("size-8 flex items-center justify-center transition-colors", focusRing, viewMode === "list" ? "bg-accent-soft text-accent" : "text-text-disabled hover:bg-surface-2")}><List className="size-3.5" /></button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
                  {CATEGORY_TABS.map((tab) => {
                    const active = activeCategory === tab.key;
                    return (
                      <button key={tab.key} onClick={() => setActiveCategory(tab.key)}
                        className={cn("px-3 py-1 rounded-full text-xs border whitespace-nowrap transition-colors active:scale-95", focusRing, active ? "bg-accent-soft border-accent text-accent" : "border-transparent text-text-disabled hover:text-text-secondary")}>
                        {tab.label}
                      </button>
                    );
                  })}
                  <button onClick={createNote} aria-label="New note" className={cn("size-6 shrink-0 flex items-center justify-center rounded-full border border-border text-text-disabled hover:text-text-secondary hover:bg-surface-2 transition-colors", focusRing)}><Plus className="size-3" /></button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="grid grid-cols-3 gap-4 p-6">
                    {[0,1,2].map((i) => (
                      <div key={i} className="card p-4 h-40 animate-pulse">
                        <div className="h-3 w-16 rounded bg-surface-hi mb-4" />
                        <div className="h-4 w-3/4 rounded bg-surface-hi mb-2" />
                        <div className="h-3 w-full rounded bg-surface-hi mb-1.5" />
                        <div className="h-3 w-2/3 rounded bg-surface-hi" />
                      </div>
                    ))}
                  </div>
                ) : displayedNotes.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
                    <div className="size-16 rounded-2xl bg-surface flex items-center justify-center border border-border shadow-[0_2px_10px_rgba(0,0,0,0.15),_0_12px_40px_rgba(0,0,0,0.20)]">
                      <BookOpen className="size-7 text-text-disabled" />
                    </div>
                    <p className="text-sm font-medium text-text-primary">No notes yet</p>
                    <p className="text-xs text-text-muted max-w-56">Capture strategies, mindset notes, routines and templates.</p>
                    <button onClick={createNote} className={cn("btn-action mt-1 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 active:scale-95", focusRing)}>Create your first note</button>
                  </div>
                ) : viewMode === "grid" ? (
                  <div className="grid grid-cols-3 gap-4 p-6">
                    {displayedNotes.map((note) => {
                      const meta    = CATEGORY_META[note.category] ?? CATEGORY_META.MINDSET;
                      const Icon    = meta.icon;
                      const excerpt = stripHtml(note.content ?? "");
                      const accent  = note.color ?? meta.color;
                      return (
                        /* overflow-visible so the z-20 dropdown can escape the card */
                        <div key={note.id} role="button" tabIndex={0}
                          onClick={() => openEditor(note)} onKeyDown={(e) => e.key === "Enter" && openEditor(note)}
                          className={cn("card relative pt-5 p-4 cursor-pointer group hover:bg-surface-2 transition-colors", focusRing)}
                          style={{ borderTop: `3px solid ${accent}` }}>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="size-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${meta.color}1f` }}>
                              <Icon className="size-3.5" style={{ color: meta.color }} />
                            </span>
                            <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}>
                              {meta.label}
                            </span>
                            <div className="flex-1" />

                            {/* ⋯ menu — z-20 + relative so it escapes card stacking context */}
                            <div className="relative z-20" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => { setMoveMenuId(null); setOpenMenuId(openMenuId === note.id ? null : note.id); }} aria-label="Actions"
                                className={cn("size-6 flex items-center justify-center rounded-md text-text-disabled hover:text-text-primary hover:bg-surface-hi transition-colors active:scale-95", focusRing)}>
                                <MoreHorizontal className="size-3.5" />
                              </button>
                              {openMenuId === note.id && (
                                <div className="absolute right-0 top-8 z-30 w-44 rounded-xl bg-surface-light border border-border-light shadow-[0_4px_24px_rgba(0,0,0,0.4)] p-1">
                                  <button onClick={() => duplicateNote(note.id)} className={cn("w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors", focusRing)}>
                                    <Copy className="size-3.5" /> Duplicate
                                  </button>
                                  <button onClick={() => togglePin(note.id)} className={cn("w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors", focusRing)}>
                                    <Pin className="size-3.5" /> {note.is_pinned ? "Unpin" : "Pin"}
                                  </button>
                                  {/* Move to folder — submenu opens to the left */}
                                  <div className="relative">
                                    <button onClick={(e) => { e.stopPropagation(); setMoveMenuId(moveMenuId === note.id ? null : note.id); }}
                                      className={cn("w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors", focusRing)}>
                                      <FolderOpen className="size-3.5" />
                                      <span className="flex-1 text-left">Move to folder</span>
                                      <ChevronRight className="size-3" />
                                    </button>
                                    {moveMenuId === note.id && (
                                      <div className="absolute right-full top-0 mr-2 w-44 rounded-xl bg-surface-light border border-border-light shadow-[0_4px_24px_rgba(0,0,0,0.4)] p-1 z-40">
                                        {DEFAULT_FOLDERS.map((f) => (
                                          <button key={f.name} onClick={() => moveToFolder(note.id, f.name)}
                                            className={cn("w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors", focusRing)}>
                                            {f.name}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="h-px bg-border my-1" />
                                  <button onClick={() => deleteNote(note.id)} className={cn("w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-loss hover:bg-loss/10 transition-colors", focusRing)}>
                                    <Trash2 className="size-3.5" /> Delete
                                  </button>
                                </div>
                              )}
                            </div>

                            <button onClick={(e) => { e.stopPropagation(); toggleFavorite(note.id); }} aria-label="Toggle favorite"
                              className={cn("size-6 flex items-center justify-center rounded-md transition-colors active:scale-95", focusRing, note.is_favorite ? "text-warning" : "text-text-disabled hover:text-warning")}>
                              <Star className={cn("size-3.5", note.is_favorite && "fill-current")} />
                            </button>
                          </div>

                          <h3 className="text-sm font-bold tracking-tight text-text-primary mb-1 truncate">{note.title}</h3>
                          <p className="text-xs leading-relaxed text-text-secondary line-clamp-2 min-h-8">{excerpt || "No content yet"}</p>
                          <div className="flex items-center gap-2 mt-3">
                            <span className="text-[10px] text-text-disabled">{formatDate(note.updated_at)}</span>
                            <div className="flex-1" />
                            {note.is_pinned && <Pin className="size-3 text-accent" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 space-y-1.5">
                    <div className="grid grid-cols-[28px_1fr_100px_120px_50px_70px] gap-3 px-3 pb-2 text-[10px] uppercase tracking-wider text-text-muted">
                      <span /><span>Title</span><span>Category</span><span>Date</span><span>Pin</span><span className="text-right">Actions</span>
                    </div>
                    {displayedNotes.map((note) => {
                      const meta = CATEGORY_META[note.category] ?? CATEGORY_META.MINDSET; const Icon = meta.icon;
                      return (
                        <div key={note.id} role="button" tabIndex={0} onClick={() => openEditor(note)} onKeyDown={(e) => e.key === "Enter" && openEditor(note)}
                          className={cn("grid grid-cols-[28px_1fr_100px_120px_50px_70px] gap-3 items-center px-3 py-2.5 rounded-xl bg-surface border border-border cursor-pointer hover:bg-surface-2 transition-colors", focusRing)}>
                          <span className="size-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${meta.color}1f` }}><Icon className="size-3.5" style={{ color: meta.color }} /></span>
                          <span className="text-sm font-medium text-text-primary truncate">{note.title}</span>
                          <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full w-fit" style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}>{meta.label}</span>
                          <span className="text-xs text-text-disabled">{formatDate(note.updated_at)}</span>
                          <span>{note.is_pinned && <Pin className="size-3 text-accent" />}</span>
                          <span className="flex items-center justify-end gap-1">
                            <button onClick={(e) => { e.stopPropagation(); toggleFavorite(note.id); }} aria-label="Favorite"
                              className={cn("size-6 flex items-center justify-center rounded-md transition-colors active:scale-95", focusRing, note.is_favorite ? "text-warning" : "text-text-disabled hover:text-warning")}>
                              <Star className={cn("size-3.5", note.is_favorite && "fill-current")} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} aria-label="Delete"
                              className={cn("size-6 flex items-center justify-center rounded-md text-text-disabled hover:text-loss transition-colors active:scale-95", focusRing)}>
                              <Trash2 className="size-3.5" />
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* ═══ RIGHT ═══ */}
        <aside className="w-72 shrink-0 bg-surface-light border-l border-border overflow-y-auto p-4 space-y-4">
          <div className="card p-5">
            <p className="text-xs font-medium text-text-muted mb-4">Notebook Overview</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-2xl font-bold tracking-tight text-text-primary tabular-nums">{counts.all}</p><p className="text-[10px] text-text-muted mt-0.5">Total Notes</p></div>
              <div><p className="text-2xl font-bold tracking-tight text-text-primary tabular-nums">{totalFolders}</p><p className="text-[10px] text-text-muted mt-0.5">Folders</p></div>
              <div><p className="text-2xl font-bold tracking-tight text-accent tabular-nums">{counts.pinned}</p><p className="text-[10px] text-text-muted mt-0.5">Pinned</p></div>
            </div>
          </div>

          <div className="card p-4 space-y-1">
            <p className="text-xs font-medium text-text-muted mb-2">Recent Activity</p>
            {recentActivity.length === 0 ? <p className="text-xs text-text-disabled">No activity yet</p>
              : recentActivity.map((note) => {
                const meta = CATEGORY_META[note.category] ?? CATEGORY_META.MINDSET; const Icon = meta.icon;
                return (
                  <button key={note.id} onClick={() => openEditor(note)}
                    className={cn("w-full flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-surface-2 transition-colors active:scale-95", focusRing)}>
                    <span className="size-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: `${meta.color}1f` }}><Icon className="size-3" style={{ color: meta.color }} /></span>
                    <span className="flex-1 text-left text-xs text-text-secondary truncate">{note.title}</span>
                    <span className="text-[10px] text-text-disabled shrink-0">{relativeTime(note.updated_at)}</span>
                  </button>
                );
              })}
            <button onClick={() => { setActiveFolder("RECENT"); setActiveCategory("ALL"); closeEditorIfOpen(); }}
              className={cn("w-full text-left text-[10px] text-accent hover:text-accent-dim transition-colors px-1.5 pt-1 rounded", focusRing)}>
              View all activity
            </button>
          </div>

          <div className="card p-4">
            <p className="text-xs font-medium text-text-muted mb-3">Top Tags</p>
            <div className="flex items-center gap-4">
              <div className="relative size-24 rounded-full shrink-0" style={{ background: donutGradient }}>
                <div className="absolute inset-3 rounded-full bg-surface flex flex-col items-center justify-center">
                  <span className="text-lg font-bold tracking-tight text-text-primary tabular-nums">{counts.all}</span>
                  <span className="text-[9px] text-text-muted -mt-0.5">notes</span>
                </div>
              </div>
              <div className="flex-1 space-y-1.5 min-w-0">
                {categoryDist.length === 0 ? <p className="text-xs text-text-disabled">No notes yet</p>
                  : categoryDist.map((c) => (
                    <div key={c.category} className="flex items-center gap-1.5 text-xs">
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <span className="text-text-secondary truncate flex-1">{c.label}</span>
                      <span className="text-text-disabled tabular-nums">{c.count}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Streak — number and "days in a row" clearly separated */}
          <div className="card p-4">
            <p className="text-xs font-medium text-text-muted mb-3">Journaling Streak</p>
            <div className="flex items-center gap-3 mb-4">
              <div className="size-12 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
                <Flame className="size-6 text-warning" />
              </div>
              <div className="flex flex-col">
                <span className="text-3xl font-bold tracking-tight text-text-primary leading-none tabular-nums">
                  {streakData.streak}
                </span>
                <span className="text-xs text-text-muted mt-1">
                  {streakData.streak === 1 ? "day" : "days"} in a row
                </span>
              </div>
            </div>
            <div className="flex justify-between">
              {streakData.week.map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span className="text-[9px] text-text-muted">{d.label}</span>
                  <span className={cn("size-6 rounded-full flex items-center justify-center border transition-colors", d.done ? "bg-accent-soft border-accent text-accent" : "border-border text-transparent")}>
                    <Check className="size-3" />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </>
  );
}
