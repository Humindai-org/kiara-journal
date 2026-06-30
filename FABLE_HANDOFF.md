# Kiara Journal — Handoff para Fable

## Qué es esto

Trading journal personal para Kiara, cuenta fondeada The Trading Pit CFD Prime $100K Fase 2. Y tambien una integración para agregar mas cuentas de trading.
App Next.js 16 + Supabase + Tailwind v4, deployed en Vercel.

**URL producción:** https://kiara-journal.vercel.app  
**Repo local:** `/Users/kiag/Desktop/HumindIA/trading/kiara-journal/`  
**Supabase project:** en el org de Vercel `kagariasb-3642s-projects`

---

## Stack técnico

- **Framework:** Next.js 16.2.4, App Router, `"use client"` en páginas interactivas
- **Auth:** Supabase SSR (`@supabase/ssr`), middleware en `/src/middleware.ts`
- **DB:** Supabase (Postgres), cliente via `createBrowserClient<Database>` desde `@/lib/supabase/client`
- **Workaround crítico:** `const db = supabase as any` para write ops — las columnas JSONB rompen el tipo de `update()`
- **Estilos:** Tailwind v4 con `@theme inline` en `globals.css` — NO usar colores default Tailwind
- **Package manager:** `bun`
- **Build:** `bash scripts/build.sh` (carga .env desde macOS Keychain)
- **Deploy:** `PATH="/Users/kiag/.bun/bin:$PATH" vercel --prod --yes`
- **Prerender fix:** `export const dynamic = "force-dynamic"` en páginas que usan Supabase

## Colores de marca (globals.css)

```css
--color-bg:             #1c1928
--color-surface:        #252235
--color-surface-2:      #2e2a44
--color-border:         #342f4a
--color-accent:         #a78bfa  /* violeta principal */
--color-accent-dim:     #7c5fd4
--color-accent-glow:    #a78bfa22
--color-profit:         #34d399
--color-loss:           #f87171
--color-warning:        #fbbf24
--color-text-primary:   #ede9ff
--color-text-secondary: #8b87a8
--color-text-disabled:  #5a5670
```

---

## Base de datos — tablas principales

### `accounts`
Balance de cuentas de trading. La cuenta activa es TTP CFD Prime $100K.
`id, user_id, name, type(MT5|MANUAL), broker, currency, initial_balance, current_balance, is_active`

### `plans`
Plan de trading MATVARD. Columnas JSONB para checklists:
```
id, user_id, name, plan_type, is_active
charting_process   JSONB  → RuleItem[]
entry_criteria     JSONB  → RuleItem[]
entry_models       JSONB  → RuleItem[]
trade_management_rules TEXT → JSON.stringify(RuleItem[])
exit_criteria          TEXT → JSON.stringify(RuleItem[])
notes_items            JSONB  → RuleItem[]
max_trades_per_day, max_daily_loss, max_daily_profit, risk_per_trade_percent
trading_window_start TEXT, trading_window_end TEXT
min_confluences INT, max_consecutive_losses INT
last_reviewed_at, created_at, updated_at
```

### `trades`
Trades manuales o importados de MT5:
```
id, account_id, user_id, instrument, direction(LONG|SHORT)
lot_size, entry_price, exit_price, sl, tp
open_time, close_time, duration_minutes
session(TOKYO|LONDON|NEW_YORK|OVERLAP)
gross_pnl, net_pnl, fees, swap, risk_r, return_r, risk_percent
plan_id, entry_emotion, exit_emotion, mistakes[], notes, followed_plan
source(MT5|MANUAL), mt5_ticket
```

### `journal_entries`
Reflexión post-trade (1:1 con trade):
```
id, trade_id, user_id
hft_chart_url, mft_chart_url, lft_chart_url
review_plan, entry_confluences JSONB
trade_management_notes
entry_emotion, exit_emotion
voice_note_url, ai_analysis
```

### `discipline_violations`
`id, trade_id, user_id, account_id, violation_type(MAX_TRADES|OUTSIDE_WINDOW|DAILY_LOSS|AFTER_PROFIT_TARGET|HIGH_IMPACT_NEWS), date, description`

### `notebooks`
`id, user_id, title, category(PLANNED_TEMPLATE|MY_TEMPLATE|PLAYBOOK|MINDSET|PRODUCTIVITY), content`

### `news_blocks`
`id, event_name, currency, impact(HIGH|MEDIUM|LOW), event_time, block_minutes_before, block_minutes_after, is_active`

Migrations en `supabase/migrations/`: `0001_init.sql`, `0002_seed.sql`, `0003_plan_settings.sql`

---

## Páginas — estado actual

### ✅ COMPLETO: `/trading`
TradingView chart embebido + panel derecho con:
- `OrderForm`: selector instrumento, dirección LONG/SHORT, tipo orden, entry/SL/TP, cálculo automático de lotes por riesgo ($300 = 0.3%), grade A+/A/B/C, inline R:R
- `TradeCounter`: contador trades del día vs máximo
- `DailyPnLBar`: P&L diario vs stop/objetivo
- `SessionIndicator`: sesión activa actual
- `PositionsTable`: tabla posiciones abiertas (placeholder, sin MT5)
- Bloqueo por noticias: prop `newsBlock` en OrderForm (no conectado aún)

### ✅ COMPLETO: `/plan-mode`
CRUD completo de planes de trading:
- Lista de planes izquierda (nuevo, duplicar, seleccionar)
- Editor central con 5 secciones accordion:
  - Proceso de Charting → `EditableChecklist`
  - Criterios de Entrada → `EditableChecklist` (22 items MATVARD = scoring A+/A/B/C)
  - Modelos de Entrada → `ModelCardGrid` (tarjetas 3D con acrónimo + nombre)
  - Gestión del Trade → `EditableChecklist`
  - Criterios de Salida → `EditableChecklist`
- Toggle "Editar/Editando" — lápiz+X+add solo visibles en modo edición
- Nuevos planes inician en modo edición automáticamente
- Botón "Plantilla MATVARD" carga defaults completos
- Panel derecho: Plan Stats (placeholder), Criteria Score, Risk Controls, Trading Rules, Notes
- `editorKey` counter garantiza remount completo al cambiar de plan

**Componentes clave:**
- `src/components/plan/PlanEditor.tsx` — editor principal con ModelCardGrid
- `src/components/plan/EditableChecklist.tsx` — checklist inline-editable
- `src/components/plan/planData.ts` — datos MATVARD + `parseRuleArray()` para backward compat

**RuleItem type:**
```typescript
interface RuleItem { id: string; label: string; enabled: boolean; isCustom?: boolean; }
```

**MATVARD scoring (22 confluencias):**
- ≥18/22 → A+ ($300 riesgo)
- ≥12/22 → A ($210)
- ≥10/22 → B ($150)
- <10 → no operar

### 🚧 PLACEHOLDER: `/dashboard`
KPIs estáticos hardcodeados. Necesita:
- Conectar a Supabase y calcular desde `trades`
- Equity curve real (recharts/lightweight-charts)
- Win rate, profit factor, avg R, discipline score

### 🚧 STUB: `/journal`
Solo TopBar + "Coming soon". Es el **próximo paso prioritario**.

Diseño esperado:
- Calendario mensual de trades (grid 7 cols, días con dots de P&L)
- Click en día → lista de trades de ese día
- Click en trade → `/journal/[tradeId]`

### 🚧 STUB: `/journal/[tradeId]`
Solo TopBar + "Loading…". Necesita:
- Panel izquierdo: detalles del trade (precio, P&L, R, sesión, etc.)
- Panel derecho: 3 chart URLs (HFT/MFT/LFT), reflexión, emoción entrada/salida, confluencias marcadas, notas
- Botón "Análisis AI" → llama a Claude con contexto del trade

### 🚧 PLACEHOLDER: `/notebook`
Sidebar estático sin funcionalidad. Necesita:
- CRUD de notas conectado a tabla `notebooks`
- Editor markdown simple
- Categorías: Playbook, Mindset, Templates, Productivity

### 🚧 STUB: `/news`
Vacío. Necesita:
- Calendario económico (API: Investing.com, ForexFactory, o mock)
- Badges HIGH/MEDIUM/LOW
- Vista de próximas 24h

### 🚧 PLACEHOLDER: `/ai-bot`
Input UI pero sin Claude conectado. Necesita:
- Streaming chat con `claude-sonnet-4-6` o Fable
- Context system con plan activo + estado de cuenta + MATVARD rules
- Comandos: `/check EURUSD LONG 1.0850 1.0820 1.0920`

---

## Pasos pendientes (en orden de prioridad)

1. **Paso 7 — /journal** (NEXT): calendario mensual + vista individual de trade
2. **Paso 8 — /dashboard**: KPIs reales desde Supabase, equity curve con recharts
3. **Paso 9 — /news**: calendario económico, badges de impacto
4. **Paso 10 — /ai-bot**: Claude streaming con contexto MATVARD
5. **Paso 11 — Integración MT5**: parseo CSV de MT5 para importar trades
6. **Paso 12 — news-block**: reglas automáticas de bloqueo en OrderForm + violation log
7. **Paso 13 — AI analysis por trade**: análisis post-trade en journal_entries.ai_analysis
8. **Paso 14 — Seed data**: trades de ejemplo para ver el dashboard funcionar
9. **Paso 15 — Mobile polish**: responsive, bottom nav, PWA

---

## Arquitectura de archivos clave

```
src/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx          ← sidebar + auth guard
│   │   ├── trading/page.tsx    ← ✅ completo
│   │   ├── plan-mode/page.tsx  ← ✅ completo (574 líneas)
│   │   ├── dashboard/page.tsx  ← 🚧 placeholder
│   │   ├── journal/
│   │   │   ├── page.tsx        ← 🚧 stub
│   │   │   ├── [tradeId]/page.tsx ← 🚧 stub
│   │   │   └── report/[weekId]/page.tsx ← 🚧 stub
│   │   ├── notebook/page.tsx   ← 🚧 placeholder
│   │   ├── news/page.tsx       ← 🚧 stub
│   │   └── ai-bot/page.tsx     ← 🚧 placeholder
│   ├── (auth)/login/page.tsx   ← ✅ completo
│   └── globals.css             ← tema de colores
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx         ← nav con 7 items
│   │   ├── TopBar.tsx
│   │   └── AccountSelector.tsx
│   ├── plan/
│   │   ├── PlanEditor.tsx      ← editor completo con ModelCardGrid
│   │   ├── EditableChecklist.tsx
│   │   └── planData.ts         ← MATVARD data + parseRuleArray
│   └── trading/
│       ├── OrderForm.tsx       ← con RiskCalculator
│       ├── TradingViewWidget.tsx
│       ├── PositionsTable.tsx
│       ├── DailyPnLBar.tsx
│       ├── SessionIndicator.tsx
│       └── TradeCounter.tsx
├── lib/
│   ├── supabase/client.ts
│   └── cn.ts
└── types/
    └── supabase.ts             ← tipos completos de todas las tablas
```

---

## Contexto de la cuenta (Kiara / TTP)

| Campo | Valor |
|---|---|
| Firma | The Trading Pit |
| Producto | CFD Prime $100K — Fase 2 |
| Balance aprox | $96,867 |
| Objetivo Fase 2 | +$5,000 |
| Stop diario personal | $300 |
| Riesgo máx/trade | $300 (0.3%) |
| Metodología | MATVARD Fase 2 |

Instrumentos principales: EURUSD, XAUUSD, GBPUSD
Sesiones: London (08:00-12:00 UTC), NY (13:00-17:00 UTC)
