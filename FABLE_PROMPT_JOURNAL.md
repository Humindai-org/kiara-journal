# FABLE 5 — PROMPT: Journal completo (Sesión 1)

> Copia todo este documento y pégalo directamente como prompt en Fable 5.

---

## TU TAREA

Eres un experto en Next.js 16 App Router + Tailwind v4 + Supabase. Vas a construir el sistema completo de Journal para una app de trading personal. Tienes que crear/reemplazar los siguientes archivos manteniendo todo lo demás intacto:

**CREAR (componentes nuevos):**
- `src/components/journal/EmotionSelector.tsx`
- `src/components/journal/ConfluenceChecklist.tsx`
- `src/components/journal/MonthlyPnLBars.tsx`
- `src/components/journal/WeekBreakdownCarousel.tsx`

**REEMPLAZAR completamente:**
- `src/app/(app)/journal/page.tsx` (calendario + sección inferior nueva)
- `src/app/(app)/journal/[tradeId]/page.tsx` (vista de trade individual completa)
- `src/app/(app)/journal/report/[weekId]/page.tsx` (reporte semanal completo)

**NO TOCAR NUNCA:**
- `src/app/globals.css`
- `src/app/(app)/trading/page.tsx`
- `src/app/(app)/plan-mode/page.tsx`
- `src/components/layout/*`
- `src/lib/*`
- `src/types/supabase.ts`
- `src/middleware.ts`
- `src/app/(app)/layout.tsx`

---

## STACK TÉCNICO — REGLAS CRÍTICAS

- **Framework:** Next.js 16.2.4, App Router, `"use client"` en todas las páginas interactivas
- **Auth/DB:** Supabase SSR — importar cliente así: `import { createClient } from "@/lib/supabase/client"`
- **Workaround crítico:** Para writes (update/insert/delete): `const db = supabase as any` — las columnas JSONB rompen el tipo nativo de update(). Usar `db` en vez de `supabase` para estas operaciones.
- **Estilos:** Tailwind v4 con variables CSS (`var(--color-accent)` etc.) — NUNCA usar colores default de Tailwind (indigo-500, blue-600, etc.)
- **Package manager:** bun
- **Prerender:** Agregar `export const dynamic = "force-dynamic"` en páginas que usan Supabase
- **Tipos:** Importar de `@/types/supabase` cuando sea posible
- **Icons:** lucide-react
- **Toast:** `import { toast } from "sonner"`
- **cn utility:** `import { cn } from "@/lib/cn"`
- **NO instalar librerías de charts** — usar barras CSS puras para gráficas simples

---

## BRAND COLORS (Tailwind v4 — usar como clases o variables CSS)

```
bg-bg           → #14121f  (fondo de la app)
bg-sidebar      → #100e18
bg-surface      → #1f1c2e  (tarjetas)
bg-surface-2    → #262237  (inputs / hover)
bg-surface-light → #221e32 (rail izquierdo elevado)
bg-surface-hi   → #2b2740  (inputs de formulario)
bg-surface-hover → #332e4b

border-border       → rgba(255,255,255,0.06)
border-border-light → rgba(255,255,255,0.10)

text-accent        → #9d8bff  (violeta — estados activos/focus)
text-accent-dim    → #7c5cff
bg-accent-glow     → rgba(157,139,255,0.14)
bg-accent-soft     → rgba(157,139,255,0.18)
text-action        → #9d8bff
text-action-hover  → #ae9eff

text-profit → #44e4b2  (verde — ganancias)
text-loss   → #ff6b8a  (rojo — pérdidas)
text-warning → #fbbf24
text-info    → #60a5fa

text-text-primary   → #ffffff
text-text-secondary → #b4aecf
text-text-muted     → #a9a2c9
text-text-disabled  → #7f789b

shadow-card: 0 2px 10px rgba(0,0,0,0.15), 0 12px 40px rgba(0,0,0,0.20)
```

**Clases CSS ya definidas (usar sin redefinir):**
- `.card` → bg-surface, border-border, rounded-2xl, shadow-card
- `.btn-action` → fondo accent, texto blanco, hover más claro
- `.btn-ghost` → sin fondo, hover bg-surface-2

---

## BASE DE DATOS — TABLAS RELEVANTES

### `trades`
```typescript
{
  id: string
  account_id: string
  user_id: string
  instrument: string          // "EURUSD", "XAUUSD", "USDJPY", etc.
  direction: "LONG" | "SHORT"
  lot_size: number
  entry_price: number
  exit_price: number | null
  sl: number | null
  tp: number | null
  open_time: string           // ISO timestamp
  close_time: string | null
  duration_minutes: number | null
  session: "TOKYO"|"LONDON"|"NEW_YORK"|"OVERLAP" | null
  gross_pnl: number | null
  net_pnl: number | null
  fees: number | null
  swap: number | null
  risk_r: number | null
  return_r: number | null
  risk_percent: number | null
  plan_id: string | null
  entry_emotion: string | null
  exit_emotion: string | null
  mistakes: string[] | null
  notes: string | null
  followed_plan: boolean | null
  source: "MT5" | "MANUAL"
  mt5_ticket: string | null
}
```

### `journal_entries` (1:1 con un trade)
```typescript
{
  id: string
  trade_id: string
  user_id: string
  hft_chart_url: string | null     // chart screenshot alta TF
  mft_chart_url: string | null     // media TF
  lft_chart_url: string | null     // baja TF
  review_plan: string | null       // texto libre — revisión del plan
  entry_confluences: Json | null   // { [key: string]: boolean }
  trade_management_notes: string | null
  entry_emotion: string | null
  exit_emotion: string | null
  voice_note_url: string | null
  ai_analysis: string | null
}
```

### `plans`
```typescript
{
  id: string
  user_id: string
  name: string
  is_active: boolean
  // ...otras columnas que no son relevantes aquí
}
```

### `discipline_violations`
```typescript
{
  id: string
  trade_id: string | null
  user_id: string
  account_id: string
  violation_type: "MAX_TRADES"|"OUTSIDE_WINDOW"|"DAILY_LOSS"|"AFTER_PROFIT_TARGET"|"HIGH_IMPACT_NEWS"
  date: string   // "YYYY-MM-DD"
  description: string | null
}
```

---

## ARCHIVO 1: `src/components/journal/EmotionSelector.tsx`

Selector de emoción como pills horizontales. Se usa en el formulario de reflexión y en la vista de trade.

**Props:**
```typescript
interface EmotionSelectorProps {
  label: string          // "On Entry" | "On Exit"
  selected: string | null
  onChange: (emotion: string | null) => void
  readonly?: boolean
}
```

**Emociones disponibles** (con emoji como icono, mostrar el emoji antes del texto):
- Entry: `Calm 😌`, `Confident 💪`, `Anxious 😰`, `FOMO 😤`, `Impatient ⏰`, `Bored 😑`, `Excited 🔥`, `Fearful 😨`
- Exit: `Calm 😌`, `Relieved 😮‍💨`, `Excited 🔥`, `Anxious 😰`, `Bored 😑`, `Disappointed 😞`, `Satisfied ✅`, `Regretful 😔`
- (En la práctica usar las mismas 8 para ambos — el prop `label` diferencia)

**Diseño:** Pills con `bg-surface-hi border border-border rounded-full px-3 py-1.5 text-sm`. Seleccionado: `border-accent bg-accent-soft text-accent`. Hover: `bg-surface-hover`. Si `readonly=true`, no mostrar cursor-pointer ni emitir onChange.

---

## ARCHIVO 2: `src/components/journal/ConfluenceChecklist.tsx`

Checklist de confluencias de entrada. Checkboxes en grid 3 columnas.

**Props:**
```typescript
interface ConfluenceChecklistProps {
  selected: string[]
  onChange: (selected: string[]) => void
  readonly?: boolean
}
```

**Items disponibles:**
`Market Structure`, `Liquidity`, `Order Block`, `FVG`, `Imbalance`, `Trendline`, `Moving Average`, `HTF Bias`, `News Catalyst`, `Session Timing`, `Others`

**Diseño:** Grid 3 columnas. Cada item: checkbox cuadrado + label. Seleccionado: checkbox con fondo `bg-accent` y check blanco, label `text-text-primary`. No seleccionado: `border border-border-light rounded` vacío, label `text-text-secondary`. Botón `+ Add note` al final en `text-accent text-sm`.

---

## ARCHIVO 3: `src/components/journal/MonthlyPnLBars.tsx`

Gráfico de barras CSS simple mostrando el P&L mensual de los últimos 12 meses.

**Props:**
```typescript
interface MonthlyPnLBarsProps {
  userId: string
}
```

**Datos:** Query a Supabase — `trades` del último año, agrupar por mes, sumar `net_pnl`.

**Diseño:**
- Fondo: `bg-surface rounded-2xl p-6 border border-border`
- Título: "Monthly P&L" a la izquierda, total del año `text-profit/text-loss` a la derecha
- 12 columnas (ene–dic), cada una:
  - Barra vertical CSS (altura proporcional al valor absoluto de PnL, máx 80px)
  - Color: `bg-profit/70` si positivo, `bg-loss/70` si negativo
  - Mes abreviado debajo (Ene, Feb, ...) en `text-text-disabled text-[10px]`
  - Valor `$X` encima/debajo en `text-[10px] font-mono`
  - Mes actual resaltado con border-accent en la base
- Si no hay datos un mes: barra neutra de 2px `bg-border`
- Las barras crecen desde el centro (eje 0 en la mitad vertical del contenedor)

---

## ARCHIVO 4: `src/components/journal/WeekBreakdownCarousel.tsx`

Carrusel de semanas (Sem 1–4) del mes actual. Cada tarjeta es clickeable y va al reporte semanal.

**Props:**
```typescript
interface WeekBreakdownCarouselProps {
  year: number
  month: number    // 0–11
  trades: Trade[]  // trades del mes ya cargados
}
type Trade = { id: string; open_time: string; net_pnl: number|null; return_r: number|null; followed_plan: boolean|null }
```

**Diseño:**
- Título de sección: "Week Breakdown" con subtítulo del mes
- 4 tarjetas en fila con `overflow-x-auto snap-x snap-mandatory` (carrusel horizontal en móvil, fila en desktop)
- Cada tarjeta (`min-w-[220px] bg-surface border border-border rounded-2xl p-4 snap-start cursor-pointer hover:border-accent/50 transition-colors`):
  - Header: "Week 1" / "Week 2" / "Week 3" / "Week 4" en `text-xs text-text-muted uppercase tracking-wider`
  - Rango de fechas: "Jul 1–7" en `text-sm text-text-secondary`
  - P&L grande: `text-2xl font-mono font-bold text-profit/text-loss`
  - Fila secundaria: `{N} trades · {win%}% win`
  - Badge de disciplina: si hay violaciones esa semana → `⚠ {N} violations` en `text-warning text-xs`
  - Si no hay trades: "No trades" en `text-text-disabled`
- Al hacer click: `router.push('/journal/report/{YYYY-W{wk}')` donde wk es el número de semana ISO

**Lógica de semanas:** Semana 1 = días 1–7, Semana 2 = 8–14, Semana 3 = 15–21, Semana 4 = 22–fin de mes. (Simple, no ISO semana del año.)

---

## ARCHIVO 5: `src/app/(app)/journal/page.tsx` — REEMPLAZAR COMPLETO

Mantener la lógica del calendario que ya existe (ya funciona bien — copiarlo) y agregar una sección inferior.

**Estructura de la página:**
```
TopBar (existente, título "Journal", botón "+ New Trade" en el lado derecho)
│
├── SECCIÓN SUPERIOR: Calendario (EXACTAMENTE igual al actual — copiar y no cambiar)
│    ├── Stats row: Net P&L del mes, Win Rate, # Trades, Best Trade, Worst Trade — con icono de filtros
│    ├── Grid calendario 7 columnas (Mon–Sun)
│    ├── Panel derecho (w-72): detalle del día seleccionado con trade cards
│    └── [igual al código actual]
│
└── SECCIÓN INFERIOR (nueva): dentro del scroll del calendario, debajo del grid
     ├── <MonthlyPnLBars userId={userId} />    ← gráfico 12 meses
     └── <WeekBreakdownCarousel year month trades />  ← carousel 4 semanas
```

**Cambios en el TopBar row:** Agregar stats del mes en la barra superior del calendario:
- `Net P&L: +$XXX.XX` en verde/rojo
- `Win Rate: XX%`
- `Trades: N`
- `Best Trade: +$XX.XX`
- `Worst Trade: -$XX.XX`
- Botón "Filters" (icono filter, no funcional por ahora — solo UI)

**IMPORTANTE:** El código del calendario, byDay, selectedDay, fetchTrades, etc. debe quedar IDÉNTICO al actual. Solo añadir la sección inferior y el stats row.

---

## ARCHIVO 6: `src/app/(app)/journal/[tradeId]/page.tsx` — REEMPLAZAR COMPLETO

Vista de detalle de un trade individual. Layout de 3 columnas.

### Data fetching al cargar:
```typescript
// 1. Fetch trade
const { data: trade } = await supabase.from("trades").select("*").eq("id", tradeId).single()

// 2. Fetch journal entry (puede no existir)
const { data: entry } = await supabase.from("journal_entries").select("*").eq("trade_id", tradeId).maybeSingle()

// 3. Fetch planes del usuario (para el dropdown)
const { data: plans } = await supabase.from("plans").select("id, name, is_active").eq("user_id", userId)

// 4. Fetch IDs adyacentes para Previous/Next
// (query todos los trade ids del usuario ordenados por open_time DESC, encontrar los adyacentes)
```

### TopBar personalizado para esta página:
NO usar el componente TopBar genérico. En su lugar, crear un header custom con:
- Izquierda: `← Back to journal` (router.push('/journal'))
- Centro: `← Previous` / `Next →` (navegar entre trades por fecha)
- Derecha: AccountSelector + badge de cuenta

Debajo del topbar, una barra de stats de contexto global (toda la cuenta):
`P&L: +$XX.XX | R Multiple: +X.XXR | Win Rate: XX% | Expectancy: -$XX.XX`
— estos se calculan desde TODOS los trades del usuario (no solo el actual).

### Layout principal (3 columnas):
```
┌──────────────────────────────────────────────────────────────────┐
│  ← Back to journal          ← Previous | Next →      Account    │  (h-14 header)
├──────────────────────────────────────────────────────────────────┤
│  EURUSD SHORT [badge]   Jul 2 · 10:42 AM – 11:15 AM · London   ▲ Edit  ⋮ │
│  P&L: +$25.12  |  R Multiple: +0.98R  |  Win Rate: 50%  |  Expectancy: -$17.68  │
├────────────┬─────────────────────────────────────────┬───────────┤
│            │  [Overview] [Reflection]                │           │
│  LEFT      │                                         │  RIGHT    │
│  PANEL     │  CONTENT AREA                           │  PANEL    │
│  280px     │  (flex-1)                               │  300px    │
│            │                                         │           │
└────────────┴─────────────────────────────────────────┴───────────┘
```

### LEFT PANEL (280px, bg-surface-light, border-r border-border):

**Bloque 1 — Net P&L** (tarjeta con padding):
- Label: "Net P&L" en `text-xs text-text-muted uppercase tracking-wider`
- Valor: `+$25.12` en `text-4xl font-mono font-bold text-profit/text-loss`
- Sublinea: `+0.98R · +4.0 pips` en `text-sm text-text-secondary`
- Debajo: `Gross P&L: +$29.12` (verde) y `Costs: -$4.00` (rojo) en dos filas pequeñas

**Bloque 2 — Trade Metadata** (formulario editable):
Cada campo: label en `text-[11px] text-text-muted` arriba, valor en `text-sm text-text-primary`.
- Instrument: select dropdown con opciones EURUSD,GBPUSD,USDJPY,XAUUSD,AUDUSD,USDCAD,USDCHF,EURJPY,GBPJPY,NAS100,SP500
- Direction: badge pill `LONG` verde / `SHORT` rojo (toggle clickeable)
- Entry: input número
- Exit: input número
- Stop Loss / Take Profit: inputs número en grid 2 cols
- Lots: input número
- Session: select LONDON/NEW_YORK/OVERLAP/TOKYO
- Open: datetime-local input
- Close: datetime-local input
- Duration: texto calculado automáticamente (read-only, ej: "33m")
- RR: texto calculado (read-only, ej: "1:1.02")
- Market: select FOREX/METALS/INDICES

Botón "Save changes" al fondo del panel izquierdo. Guarda en `db.from("trades").update({...}).eq("id", tradeId)`.

### CENTER PANEL (flex-1, overflow-y-auto):

Tabs: `[Overview] [Reflection]` — estilo pills, activo con `bg-accent-soft text-accent border-b-2 border-accent`.

**Tab Overview:**

*Sección "Emotions"* (tarjeta card):
- Header: "Emotions" label + "Control Score: 8/10" badge (hardcoded por ahora) a la derecha
- `<EmotionSelector label="On Entry" selected={trade.entry_emotion} onChange={...} />`
- `<EmotionSelector label="On Exit" selected={trade.exit_emotion} onChange={...} />`
- Guardar en `db.from("trades").update({ entry_emotion, exit_emotion }).eq("id", tradeId)` al cambiar

*Sección "Trade Chart"* (tarjeta card):
- Header: "Trade Chart" + selector de timeframe `[1m] [5m] [15m] [1h] [4h] [D]` + botón "Open in charts" (icon ExternalLink)
- Si `entry.hft_chart_url` existe: `<img>` con la URL
- Si no: placeholder con fondo `bg-surface-2 rounded-xl h-64 flex items-center justify-center` con texto "No chart uploaded" + botón "Upload chart" (no funcional — solo UI)
- Timeframe seleccionado: estado local, resaltado con `bg-surface-hi border border-border-light text-text-primary`

*Sección "Trade Plan & Review"* (dos columnas):
- Izquierda "Trade Plan": textarea read-only con el `entry.review_plan` o `trade.notes`. Label + contenido o "No plan recorded"
- Derecha "Plan Review": textarea editable para `entry.trade_management_notes`. Botón pequeño "View full plan →" como link a /plan-mode

**Tab Reflection:**

Formulario completo de reflexión. Auto-guardado al hacer blur en cada campo.

*¿Seguiste tu plan?*
- Dos radio cards lado a lado:
  - "Yes, I followed my plan" con checkbox verde cuando seleccionado (`border-profit bg-profit/5`)
  - "No, I didn't follow my plan" con checkbox cuando seleccionado (`border-loss bg-loss/5`)
- Guardar en `db.from("trades").update({ followed_plan }).eq("id", tradeId)`

*¿Qué plan seguiste?*
- Select dropdown con los planes del usuario
- Link "View plan →" al lado
- Guardar `plan_id` en trades

*Entry Confluences:*
- `<ConfluenceChecklist selected={selectedConfluences} onChange={handleSaveConfluences} />`
- Datos en `entry.entry_confluences` como `{ "Market Structure": true, "Liquidity": true, ... }`

*Trade Management (textarea):*
- Label "Trade Management" + sublabel "How did you manage this trade?"
- `textarea` con `entry.trade_management_notes`, fondo `bg-surface-hi border border-border-light rounded-xl p-3 text-sm resize-none min-h-[100px]`
- Auto-save on blur

*Mistakes (textarea):*
- Label "Mistakes" + sublabel "What could have been improved?"
- `trade.mistakes` es `string[]` — mostrar/editar como texto separado por líneas
- Auto-save on blur → parsear en array por newlines

*Entry Emotion / Exit Emotion:*
- Dos `<EmotionSelector>` lado a lado
- Guardar en `journal_entries` table (`entry_emotion`, `exit_emotion`)

*Additional Notes (textarea):*
- `trade.notes` libre
- Auto-save on blur

*Voice Reflection (UI placeholder):*
- Fila con icono mic, texto "Record a quick voice note", botón play circular (▶), waveform placeholder (SVG de líneas), timer "00:45", botón trash
- No hay funcionalidad real — solo UI decorativa

### RIGHT PANEL (300px, bg-surface-light, border-l border-border, overflow-y-auto):

**Sección "Mistakes"** (si `trade.mistakes` tiene items):
- Ícono de círculo rojo ⚠, título "Mistakes"
- Lista de bullets: `• Moved stop loss too early`
- Si no hay: "No mistakes recorded"

**Sección "Lessons & Improvements"** (si hay `entry.trade_management_notes`):
- Ícono check verde ✓, título "Lessons & Improvements"
- Bullets derivados del texto (mostrar las primeras líneas)

**Sección "Screenshots"**:
- Título "Screenshots" + botón "View all" link
- Grid 3 columnas de thumbnails:
  - Si `entry.hft_chart_url`: `<img className="rounded-lg object-cover aspect-video" />`
  - Si `entry.mft_chart_url`: igual
  - Si `entry.lft_chart_url`: igual
  - Siempre mostrar un botón `+ Add screenshot` al final (no funcional — solo UI)

**Sección "Tags"**:
- Título "Tags"
- Pills: chips de los items en `trade.mistakes` (usarlos como tags de contexto — por ahora)
- Botón `+ Add tag` (no funcional)

**Sección "Quick Actions"**:
- Grid 2x2 de botones iconos:
  - Copy "Duplicate Trade" (Lucide: Copy)
  - Bookmark "Add to Watchlist" (Lucide: Bookmark)
  - Upload "Export Trade" (Lucide: Upload)
  - Trash "Delete Trade" (Lucide: Trash2) → rojo, confirm + delete + router.push('/journal')

---

## ARCHIVO 7: `src/app/(app)/journal/report/[weekId]/page.tsx` — REEMPLAZAR COMPLETO

Reporte semanal. El `weekId` tiene formato `YYYY-W{1|2|3|4}` (ej: `2026-W2` = semana 2 del mes actual).
Hay que parsear el año y número de semana simple (1–4) para calcular el rango de fechas.

### Data fetching:
- Parsear `weekId`: `const [yearStr, weekStr] = weekId.split('-W')` → year, weekNum (1-4)
- Calcular `startDay = (weekNum-1)*7 + 1` y `endDay = Math.min(weekNum*7, daysInMonth)`
- Necesito saber el mes. El weekId no lleva mes → buscar el mes actual o el más reciente que tenga datos.
  **Solución pragmática:** El weekId que llegará desde el carrusel tendrá formato `YYYY-MM-W{N}` (ej: `2026-07-W2`). Ajustar el CarouselCarousel y este componente para usar este formato.
- Query trades del rango de la semana
- Query discipline_violations de esa semana (filter por `date BETWEEN startISO AND endISO`)

### Layout:

**Header:**
- `← Back to Journal` (link)
- Título: "Week 2 — July 2026" o similar
- Rango de fechas: "July 8–14, 2026"

**Layout principal 2 columnas (izquierda 55%, derecha 45%):**

**LEFT — "Week Details"**:
- Net P&L: grande, verde/rojo, con formato `+$349.55`
- Grid 2x2: Total Trades | Win Rate | Best Trade | Worst Trade
- Sección "Daily Review" (tabla):
  ```
  Día | Total Trades / Max | Net P&L | Nota
  Mon Jul 8 | 2/3 | +$180.00 | —
  Tue Jul 9 | 1/3 | +$169.55 | Good session
  ...
  ```
  Filas con alternancia de fondo. Días sin trades: mostrar "—" en todas las columnas. La columna "Net P&L" en verde/rojo.

**RIGHT — "Discipline Report"**:
- Título en rojo/warning: "⚠ Discipline Report" + badge `{N} violations`
- Lista de violaciones agrupadas por tipo:
  ```
  • Exceed max trades per day ×N → Mon, Tue, Thu
  • Traded outside allowed trading window ×N → Mon, Thu
  • Exceed max daily loss ×N → Mon
  • Traded after profit target reached ×N → Tue, Thu
  ```
  Cada violación: bullet, descripción en `text-text-primary`, días en `text-text-secondary text-xs`
  Si no hay violaciones: badge verde "Clean week — no violations ✓"

**Sección inferior — "AI Analysis"**:
- Tarjeta full width
- Título "AI Analysis" + sublabel "Auto-generated based on your trades and guardrails"
- Dos columnas:
  - "What worked?" (fondo `bg-profit/5 border-profit/20`): bullet list
  - "What didn't work?" (fondo `bg-loss/5 border-loss/20`): bullet list
- Si hay contenido en `ai_analysis` de algún journal_entry de la semana: mostrar el texto
- Si no: placeholder con botón "Generate AI Analysis" (no funcional — solo UI con `text-text-disabled`)
- Debajo: recomendaciones generadas desde las violations:
  - MAX_TRADES → "• Consider reducing to 2 trades on high-volatility sessions"
  - OUTSIDE_WINDOW → "• Review your trading schedule — 3 trades were taken outside your window"
  - etc.

---

## INSTRUCCIONES FINALES PARA FABLE

1. **Cada archivo es autónomo** — no crear imports que no existan.
2. **No inventar colores** — solo usar los del design system listados arriba.
3. **No instalar dependencias** — si necesitas gráficos usa barras CSS.
4. **El calendario existente** en `journal/page.tsx` ya funciona perfectamente — copiar su lógica de fetchTrades, byDay, selectedDay, grid, rightPanel exactamente, solo agregar la sección inferior.
5. **Guardar siempre con `db = supabase as any`** para writes.
6. **`export const dynamic = "force-dynamic"`** en todas las páginas que usen Supabase.
7. **Los campos de formulario no necesitan validación** — son para uso personal, el usuario sabe lo que hace.
8. **Animaciones:** solo `transition-colors`, `transition-opacity`, `transition-transform` — nunca `transition-all`.
9. **Modo responsive:** el diseño es desktop-first, pero los paneles laterales deben poder ocultarse en mobile con un toggle simple.
10. El formato de weekId en el carrusel y en la ruta: usar `YYYY-MM-W{N}` (ejemplo: `2026-07-W2`) para que el reporte sepa el mes exacto.
