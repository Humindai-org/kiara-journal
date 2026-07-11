# Fable 5 Prompt — Notebook Page

You are rebuilding the **Notebook** page of a premium dark-mode trading journal app called **Kiara Journal**. The goal is a beautiful, functional note-taking system for a funded trader to store strategies, mindset notes, templates, and routines.

---

## Tech Stack (DO NOT change these)

- **Next.js 16.2.4** App Router, `"use client"`, `export const dynamic = "force-dynamic"`
- **Supabase** SSR auth + Postgres — import client: `import { createClient } from "@/lib/supabase/client"`
- **CRITICAL**: For ALL write operations (insert, update, delete): `const db = supabase as any` — do NOT use typed client for writes
- **Tailwind v4** with CSS custom properties — NO default Tailwind palette, only brand tokens below
- **lucide-react** for icons — import individually
- **sonner** for toasts: `import { toast } from "sonner"`
- **`cn`** utility: `import { cn } from "@/lib/cn"`
- Package manager: **bun**

---

## Brand Design Tokens (ONLY use these — never indigo-500, blue-600, etc.)

```css
--color-bg:             #14121f   /* app background */
--color-sidebar:        #100e18   /* darker sidebar */
--color-surface:        #1f1c2e   /* cards */
--color-surface-2:      #262237   /* hover surfaces */
--color-surface-light:  #221e32   /* elevated panels */
--color-surface-hi:     #2b2740   /* inputs */
--color-surface-hover:  #332e4b   /* input hover */
--color-border:         rgba(255,255,255,0.06)
--color-border-light:   rgba(255,255,255,0.10)
--color-accent:         #9d8bff   /* lavender — primary CTA, active states */
--color-accent-dim:     #7c5cff
--color-accent-glow:    rgba(157,139,255,0.14)
--color-accent-soft:    rgba(157,139,255,0.18)
--color-profit:         #44e4b2   /* green */
--color-loss:           #ff6b8a   /* red/rose */
--color-warning:        #fbbf24
--color-text-primary:   #ffffff
--color-text-secondary: #b4aecf
--color-text-muted:     #a9a2c9
--color-text-disabled:  #7f789b
--shadow-card: 0 2px 10px rgba(0,0,0,0.15), 0 12px 40px rgba(0,0,0,0.20)
```

**Existing CSS classes** (use freely):
- `.card` → bg-surface + border + border-radius + shadow-card
- `.btn-action` → accent gradient button

---

## Database Schema

### Existing `notebooks` table
```sql
id          uuid PK
user_id     uuid (FK auth.users)
title       text NOT NULL
category    text CHECK (category IN ('PLANNED_TEMPLATE','MY_TEMPLATE','PLAYBOOK','MINDSET','PRODUCTIVITY'))
content     text
created_at  timestamptz
updated_at  timestamptz
```

### Migration to create: `supabase/migrations/0011_notebooks_v2.sql`
```sql
-- Expand category to support new types (drop old constraint, add flexible check)
ALTER TABLE notebooks DROP CONSTRAINT IF EXISTS notebooks_category_check;
ALTER TABLE notebooks ADD CONSTRAINT notebooks_category_check
  CHECK (category IN ('MINDSET','STRATEGY','ROUTINE','RISK','TEMPLATE','PLAYBOOK'));

-- New columns
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS is_pinned   boolean   DEFAULT false;
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS is_favorite boolean   DEFAULT false;
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS tags        text[]    DEFAULT '{}';
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS folder      text;     -- user-defined folder name
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS color       text;     -- hex color for card accent
```

---

## File to create / replace

### 1. `supabase/migrations/0011_notebooks_v2.sql`
The migration SQL above exactly.

### 2. `src/app/(app)/notebook/page.tsx`
The full Notebook page (complete replacement). This is a `"use client"` page.

---

## UI Layout — 3 Columns, Full Height

```
┌─────────────────────────────────────────────────────────────────────┐
│  TopBar (existing component — import from "@/components/layout/TopBar") │
├──────────────┬──────────────────────────────────┬───────────────────┤
│  LEFT PANEL  │        CENTER PANEL              │   RIGHT PANEL     │
│  w-56        │        flex-1                    │   w-72            │
│  bg-sidebar  │        bg-bg                     │   bg-surface-light│
│  border-r    │                                  │   border-l        │
│              │                                  │                   │
│  OVERVIEW    │  ┌ Header: title + note count ┐  │  Notebook Overview│
│  · All Notes │  │ Category tabs + Grid/List  │  │  (3 stats)        │
│  · Favorites │  └─────────────────────────── ┘  │                   │
│  · Recent    │                                  │  Recent Activity  │
│  · Pinned    │  Grid (3-col) or List of notes   │                   │
│              │  Each card: colored top border,  │  Top Tags         │
│  FOLDERS     │  icon, category badge, title,    │  (donut chart)    │
│  · Playbook  │  excerpt, date, star, menu       │                   │
│  · Mindset   │                                  │  Journaling Streak│
│  · Strategies│  OR — if a note is selected:     │                   │
│  · Risk Mgmt │  Note editor (title input +      │                   │
│  · Templates │  textarea + metadata sidebar)    │                   │
│              │                                  │                   │
│  QUICK ACTS  │                                  │                   │
│  [+ New Note]│                                  │                   │
└──────────────┴──────────────────────────────────┴───────────────────┘
```

---

## LEFT PANEL — Detailed spec

**OVERVIEW section** (label: "OVERVIEW" in text-[10px] text-text-muted uppercase tracking-wider):
Each nav item is a row with icon + label + count badge. Active item has `bg-accent-soft text-accent` pill background. Items:
- 📋 All Notes — total count
- ⭐ Favorites — `is_favorite = true` count
- 🕐 Recent — last 7 days count
- 📌 Pinned — `is_pinned = true` count

**FOLDERS section** (label: "FOLDERS"):
- List of user-created folders PLUS the 5 default folders derived from category:
  - 📖 Playbook
  - 🧠 Mindset
  - 📈 Strategies
  - 🛡 Risk Management
  - 📄 Templates
- Each row: colored icon + name + note count
- Active folder has accent left border indicator

**QUICK ACTIONS section**:
- Large `+ New Note` button (btn-action style, full width, accent gradient)
- Below: two shortcut links "Daily Journal" and "Template" as small ghost buttons

Clicking "All Notes" clears folder selection and shows all.
Clicking a folder filters to that category.

---

## CENTER PANEL — Detailed spec

**Header row** (sticky, py-4 px-6):
- Left: heading text like "All Notes" or folder name + "(35 notes)" in text-text-disabled
- Right: category filter tabs pill row + Grid/List toggle + Filter button

**Category filter tabs** (horizontal scrollable pill row):
`All | Mindset | Strategy | Routine | Risk | Template` + `+` button (to add custom)
Active tab: `bg-accent-soft border-accent text-accent`
Inactive: `border-transparent text-text-disabled hover:text-text-secondary`

**Grid view** (default, grid grid-cols-3 gap-4 p-6):
Each note card:
```
┌─ colored top border 3px (by category) ───────────────┐
│ [CategoryIcon]  [CategoryBadge]        [⋯ menu] [★]   │
│                                                        │
│ **Note Title**                                         │
│ Excerpt text (2 lines, clamp) in text-text-secondary  │
│                                                        │
│ May 18, 2024                    [📌 if pinned]        │
└────────────────────────────────────────────────────────┘
```
- Card click → opens note editor in center panel
- Star (⭐) click → toggle `is_favorite` without opening note
- `⋯` menu → Duplicate, Pin/Unpin, Move to folder, Delete

**Category colors** (for top border and badge):
```
MINDSET:  #44e4b2 (profit green)
STRATEGY: #9d8bff (accent lavender)
ROUTINE:  #fbbf24 (warning yellow)
RISK:     #ff6b8a (loss red)
TEMPLATE: #60a5fa (info blue)
PLAYBOOK: #f97316 (orange)
```

**List view** (when list toggle active):
Rows instead of cards, same info but horizontal. Columns: Icon | Title | Category | Date | Pinned | Actions

**Note Editor** (replaces grid when a note is selected or "New Note" clicked):
```
┌─ Back button ──────────────────────────────────────────┐
│ [Category icon]  [category selector dropdown]  [Save]  │
│                                                        │
│ # Title input (large, borderless, text-2xl font-bold)  │
│                                                        │
│ ─────────────────────────────────────────────────────  │
│                                                        │
│  Content textarea (flex-1, borderless, text-sm,        │
│  font-sans, leading-relaxed, placeholder: "Start       │
│  writing your note…")                                  │
│                                                        │
│ ─ Footer: Tags | Word count | Last saved ─────────────│
└────────────────────────────────────────────────────────┘
```
- Title and content auto-save on blur (debounced 800ms is fine too)
- On "New Note": insert row immediately with title="Untitled Note", then enter editor
- Category selector: pill grid below the title area
- Tags: inline `#tag` chip input at the footer
- Ctrl+S or Cmd+S shortcut to save manually
- Show "Saved ✓" / "Saving…" status

---

## RIGHT PANEL — Detailed spec

**Notebook Overview card** (`card p-5`):
3-stat row:
```
[ 35         ] [ 7          ] [ 12         ]
  Total Notes    Folders       Pinned
  text-2xl       text-2xl      text-accent
  font-bold      font-bold     font-bold
```
These are live counts from the fetched notes.

**Recent Activity** (`card p-4 space-y-2`):
List of 5 most recently `updated_at` notes:
- Row: `[CategoryIcon] [title 12px] [relative time 10px text-text-disabled]`
- Clicking opens that note in editor
- "View all activity" link at bottom

**Top Tags** (`card p-4`):
- Section title + total count in center
- CSS donut chart using `conic-gradient` (NO recharts, NO chart library)
- Show 4-5 categories with colored dots and counts
- Use the same category colors defined above

Donut chart technique:
```tsx
// conic-gradient segments from category counts
const total = notes.length;
const segments = categories.map(c => ({ ...c, pct: (c.count / total) * 100 }));
// Build: background: `conic-gradient(${color1} 0% ${pct1}%, ${color2} ${pct1}% ${pct1+pct2}%, ...)`
// Inner circle: absolute positioned white/bg circle for donut hole
```

**Journaling Streak** (`card p-4`):
- 🔥 icon + "X Days in a row" in large text
- 7-day mini calendar strip: Mon–Sun with check/empty circles
- Streak = consecutive days with at least one note `created_at` or `updated_at`
- Query last 7 notes and check dates

---

## State & Data Flow

```typescript
type Note = {
  id: string;
  title: string;
  category: "MINDSET" | "STRATEGY" | "ROUTINE" | "RISK" | "TEMPLATE" | "PLAYBOOK";
  content: string | null;
  is_pinned: boolean;
  is_favorite: boolean;
  tags: string[];
  folder: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
};
```

**State variables**:
```typescript
const [notes, setNotes] = useState<Note[]>([]);
const [selectedNote, setSelectedNote] = useState<Note | null>(null);
const [isEditing, setIsEditing] = useState(false);
const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = All Notes
const [activeCategory, setActiveCategory] = useState<string>("ALL");
const [searchQuery, setSearchQuery] = useState("");
const [editTitle, setEditTitle] = useState("");
const [editContent, setEditContent] = useState("");
const [saving, setSaving] = useState(false);
const [savedAt, setSavedAt] = useState<Date | null>(null);
```

**Filtering logic**:
```typescript
const displayedNotes = useMemo(() => {
  let filtered = notes;
  if (activeFolder === "FAVORITES") filtered = filtered.filter(n => n.is_favorite);
  else if (activeFolder === "PINNED") filtered = filtered.filter(n => n.is_pinned);
  else if (activeFolder === "RECENT") filtered = filtered.filter(n => {
    const d = new Date(n.updated_at);
    return (Date.now() - d.getTime()) < 7 * 24 * 60 * 60 * 1000;
  });
  else if (activeFolder) filtered = filtered.filter(n => n.category === activeFolder || n.folder === activeFolder);
  if (activeCategory !== "ALL") filtered = filtered.filter(n => n.category === activeCategory);
  if (searchQuery) filtered = filtered.filter(n =>
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (n.content ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );
  return filtered;
}, [notes, activeFolder, activeCategory, searchQuery]);
```

**Creating a note**:
```typescript
async function createNote() {
  const { data, error } = await db.from("notebooks")
    .insert({ user_id: userId, title: "Untitled Note", category: "MINDSET", content: "" })
    .select().single();
  if (error || !data) { toast.error("Error creating note"); return; }
  const newNote = data as Note;
  setNotes(prev => [newNote, ...prev]);
  openEditor(newNote);
}
```

**Auto-saving note** (on title/content blur or debounced):
```typescript
async function saveNote() {
  if (!selectedNote) return;
  setSaving(true);
  await db.from("notebooks").update({
    title: editTitle || "Untitled Note",
    content: editContent,
    updated_at: new Date().toISOString(),
  }).eq("id", selectedNote.id);
  setNotes(prev => prev.map(n => n.id === selectedNote.id
    ? { ...n, title: editTitle || "Untitled Note", content: editContent }
    : n
  ));
  setSaving(false);
  setSavedAt(new Date());
}
```

**Toggling favorite/pin**:
```typescript
async function toggleFavorite(noteId: string) {
  const note = notes.find(n => n.id === noteId);
  if (!note) return;
  const newVal = !note.is_favorite;
  await db.from("notebooks").update({ is_favorite: newVal }).eq("id", noteId);
  setNotes(prev => prev.map(n => n.id === noteId ? { ...n, is_favorite: newVal } : n));
}
```

---

## Category metadata

```typescript
const CATEGORY_META = {
  MINDSET:  { label: "Mindset",   color: "#44e4b2", icon: Brain },
  STRATEGY: { label: "Strategy",  color: "#9d8bff", icon: TrendingUp },
  ROUTINE:  { label: "Routine",   color: "#fbbf24", icon: Clock },
  RISK:     { label: "Risk",      color: "#ff6b8a", icon: Shield },
  TEMPLATE: { label: "Template",  color: "#60a5fa", icon: FileText },
  PLAYBOOK: { label: "Playbook",  color: "#f97316", icon: BookOpen },
} as const;

const FOLDER_TO_CATEGORY: Record<string, string> = {
  Mindset: "MINDSET",
  Strategies: "STRATEGY",
  "Risk Management": "RISK",
  Templates: "TEMPLATE",
  Playbook: "PLAYBOOK",
};
```

Icons to import from lucide-react: `Brain, TrendingUp, Clock, Shield, FileText, BookOpen, Star, Pin, MoreHorizontal, Grid3x3, List, Search, Plus, ChevronRight, Check, X, Trash2, Copy, FolderOpen, Flame`

---

## Relative time formatting

```typescript
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
```

---

## Design details (must match)

1. **Shadows**: Use `shadow-[0_2px_10px_rgba(0,0,0,0.15),_0_12px_40px_rgba(0,0,0,0.20)]` or the `.card` class — never flat `shadow-md`
2. **Typography**: Headings use `font-bold tracking-tight`, body `text-sm leading-relaxed`
3. **Animations**: Only `transition-colors` and `transition-opacity` — never `transition-all`
4. **Every clickable** element needs `hover:` state, `focus-visible:ring-2 focus-visible:ring-accent/50`, and `active:scale-95` for buttons
5. **Scrollable areas**: Use `overflow-y-auto` with `scrollbar-thin` or hidden scrollbar styling
6. **Note card excerpt**: Use CSS `-webkit-line-clamp: 2` via `line-clamp-2` class or inline style
7. **Empty state** (no notes): Centered illustration placeholder + "No notes yet" + "Create your first note" button
8. **Loading state**: Skeleton cards (3 cards with pulse animation) while fetching

---

## What NOT to do

- Do NOT use recharts, chart.js, or any chart library — use CSS conic-gradient for the donut
- Do NOT use `shadow-md`, `shadow-lg` — use the design tokens
- Do NOT use default Tailwind colors (blue-500, indigo-600, etc.)
- Do NOT add unused imports
- Do NOT create extra files — only the 2 files listed above
- Do NOT use `transition-all`
- Do NOT skip the TopBar import

---

## Output

Produce exactly **2 files** with complete code (no ellipsis, no TODOs):

1. `supabase/migrations/0011_notebooks_v2.sql` — migration SQL
2. `src/app/(app)/notebook/page.tsx` — full page component

The page must be fully functional: fetch notes on mount, create/edit/delete notes with real Supabase calls, all filters working, the donut chart rendering real category distribution, and the streak calculated from real data.
