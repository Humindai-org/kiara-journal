# Kiara Journal — Handoff para Fable

> **Actualizado: 2026-07-23.** Este documento describe el estado **real** del repo.
> Si algo aquí no coincide con el código, gana el código — y actualiza este archivo.

## Qué es esto

Trading journal multiusuario. Empezó como journal personal para una cuenta fondeada
(The Trading Pit CFD Prime $100K) y ahora lo usa más de una persona, con cuentas de
distinto tamaño y de distinto tipo (prop firm en MT5, exchanges de cripto, cuentas
personales). **Nada debe asumir un balance, una firma ni un objetivo concreto.**

**URL producción:** https://kiara-journal.vercel.app
**Repo:** https://github.com/Humindai-org/kiara-journal
**Local:** `/Users/kiag/Desktop/HumindIA/trading/kiara-journal/`
**Supabase project:** en el org de Vercel `kagariasb-3642s-projects`

---

## Stack técnico

- **Framework:** Next.js 16.2.4, App Router, `"use client"` en páginas interactivas
- **Auth:** Supabase SSR (`@supabase/ssr`). El middleware vive en **`src/proxy.ts`**
  (exporta `proxy()` + `config.matcher`) — **no** en `src/middleware.ts`
- **DB:** Supabase (Postgres) con RLS por `user_id` en todas las tablas
- **Workaround crítico:** `const db = supabase as any` para write ops — los tipos
  generados están desactualizados y las columnas JSONB rompen el tipo de `update()`
- **Estilos:** Tailwind v4 con `@theme inline` en `globals.css` — NO usar colores
  default de Tailwind (nada de `indigo-500`, `blue-600`…)
- **Editor de texto rico:** Tiptap 3 (usado en `/notebook`)
- **Package manager:** `bun`
- **Deploy:** push a `main` → Vercel despliega solo
- **Prerender fix:** `export const dynamic = "force-dynamic"` en páginas que usan Supabase

## Colores de marca (fuente: `src/app/globals.css`)

```css
--color-bg:             #14121f   /* fondo del área de contenido */
--color-sidebar:        #100e18   /* sidebar, más oscuro que bg */
--color-surface:        #1f1c2e   /* cards */
--color-surface-2:      #262237   /* input por defecto / hover */
--color-surface-light:  #221e32   /* card elevada / rail izquierdo */
--color-surface-hi:     #2b2740   /* inputs de formulario */
--color-surface-hover:  #332e4b   /* hover de input */
--color-border:         rgba(255,255,255,0.06)
--color-border-light:   rgba(255,255,255,0.10)
--color-accent:         #9d8bff
--color-accent-dim:     #7c5cff
--color-accent-glow:    rgba(157,139,255,0.14)
--color-accent-soft:    rgba(157,139,255,0.18)
--color-profit:         #44e4b2
--color-loss:           #ff6b8a
--color-warning:        #fbbf24
--color-info:           #60a5fa
--color-text-primary:   #ffffff
--color-text-secondary: #b4aecf
--color-text-muted:     #a9a2c9
--color-text-disabled:  #7f789b
```

Utilidades disponibles: `.card`, `.card-light`, `cn()` desde `@/lib/cn`.
Iconos: `lucide-react` (import individual). Toasts: `sonner`.

---

## Regla de oro para código nuevo

**Nada de valores fijos de cuenta.** El journal ya no es de una sola persona.

| ❌ Nunca | ✅ Siempre |
|---|---|
| `const INITIAL_BALANCE = 100000` | `account.initial_balance` |
| `const PROFIT_TARGET = 5000` | `account.profit_target` (llega con `0012`) |
| `const DD_LIMIT = 10000` | `account.initial_balance - account.total_dd_floor` |
| Riesgo en dólares fijos (`$300`) | `riskForGrade(balance, plan.risk_per_trade_percent, grade)` |
| `redirectTo: "https://kiara-journal.vercel.app/…"` | `` `${window.location.origin}/…` `` |
| "Kiara", "TTP", "Fase 2" en la UI | Copy neutro; el nombre sale de `account.name` |

**Filtrado de datos:** las vistas de performance se filtran por **`account_id`**
(la cuenta seleccionada en el `AccountSelector`), no solo por `user_id`. RLS ya
garantiza el aislamiento entre usuarios; `account_id` es lo que hace que dashboard,
journal y reporte semanal muestren la misma cifra. Excepción: `/notebook` es a nivel
de usuario a propósito — las notas no pertenecen a una cuenta.

**Cuenta activa:** `useAccountStore()` desde `@/store/account` (zustand + persist).
Da `{ activeAccountId, accounts, setActiveAccount }`.

---

## Base de datos

### Migraciones — estado real

Viven en `supabase/migrations/` y se corren **en orden**:

| Archivo | Qué hace |
|---|---|
| `0001_init.sql` | accounts, plans, trades, journal_entries, discipline_violations, notebooks, news_blocks + RLS |
| `0002_seed.sql` | ⚠️ obsoleta — tiene un UUID placeholder literal, no la ejecutes |
| `0003_plan_settings.sql` | ventana horaria, min_confluences, max_consecutive_losses, notes_items |
| `0004_briefings.sql` | briefings macro diarios cacheados |
| `0005_webhook_token.sql` | `accounts.webhook_token`, `accounts.last_synced_at` |
| `0006_recalculate_balance.sql` | amplía `accounts.type` a MT5/BITGET/BYBIT/BINANCE/MANUAL + fn `recalculate_account_balance` |
| `0007_metaapi.sql` | `accounts.metaapi_account_id` |
| `0008_dd_limits.sql` | `daily_dd_floor`, `total_dd_floor`, `personal_daily_stop_usd`, `metaapi_region` |
| `0009_trade_status.sql` | `trades.status` (pending/open/closed) |
| `0010_tags_screenshots.sql` | `trades.tags`, `journal_entries.screenshots` |
| `0011_notebooks_v2.sql` | categorías nuevas + `is_pinned`, `is_favorite`, `tags`, `folder`, `color` |

`0001`–`0011` están **aplicadas en producción** (verificado 2026-07-23 contra
`information_schema.columns`). Lo que falta es `0012`, que añade los campos que
el wizard de onboarding necesita:

```sql
alter table public.accounts
  add column if not exists profit_target     numeric(14,2),  -- objetivo de beneficio (opcional)
  add column if not exists dd_warning_percent numeric(5,2) default 20,  -- alerta al quedar este % del margen
  add column if not exists instruments       text[] default '{}';       -- clases de activo que opera

alter table public.plans
  add column if not exists friday_a_plus_only boolean default false;
```

### Tablas

**`accounts`** — una fila por cuenta de trading del usuario
```
id, user_id, name, type(MT5|BITGET|BYBIT|BINANCE|MANUAL), broker, account_number,
currency, initial_balance, current_balance, is_active, mt5_server,
webhook_token, last_synced_at, metaapi_account_id, metaapi_region,
daily_dd_floor, total_dd_floor, personal_daily_stop_usd
```

**`plans`** — reglas de trading del usuario (JSONB para checklists)
```
id, user_id, name, plan_type, is_active
charting_process JSONB → RuleItem[]
entry_criteria   JSONB → RuleItem[]
entry_models     JSONB → RuleItem[]
trade_management_rules TEXT → JSON.stringify(RuleItem[])
exit_criteria          TEXT → JSON.stringify(RuleItem[])
notes_items      JSONB → RuleItem[]
max_trades_per_day, max_daily_loss, max_daily_profit, risk_per_trade_percent
trading_window_start, trading_window_end, min_confluences, max_consecutive_losses
last_reviewed_at, created_at, updated_at
```

**`trades`**
```
id, account_id, user_id, instrument, direction(LONG|SHORT)
lot_size, entry_price, exit_price, sl, tp
open_time, close_time, duration_minutes, session(TOKYO|LONDON|NEW_YORK|OVERLAP)
gross_pnl, net_pnl, fees, swap, risk_r, return_r, risk_percent
plan_id, entry_emotion, exit_emotion, mistakes[], notes, followed_plan
status(pending|open|closed), tags text[], source(MT5|MANUAL), mt5_ticket
```

**`journal_entries`** — reflexión post-trade (1:1 con trade)
```
id, trade_id, user_id, hft_chart_url, mft_chart_url, lft_chart_url,
review_plan, entry_confluences JSONB, trade_management_notes,
entry_emotion, exit_emotion, voice_note_url, ai_analysis,
screenshots JSONB → {url, note}[]
```

**`discipline_violations`**
`id, trade_id, user_id, account_id, violation_type(MAX_TRADES|OUTSIDE_WINDOW|DAILY_LOSS|AFTER_PROFIT_TARGET|HIGH_IMPACT_NEWS), date, description`

**`notebooks`**
`id, user_id, title, category(MINDSET|STRATEGY|ROUTINE|RISK|TEMPLATE|PLAYBOOK), content, is_pinned, is_favorite, tags text[], folder, color`

**`briefings`** — `id, region(EUROPEAN|AMERICAN|ASIAN), brief_date, content JSONB`

**`news_blocks`** — `id, event_name, currency, impact(HIGH|MEDIUM|LOW), event_time, block_minutes_before, block_minutes_after, is_active`

> ⚠️ **`src/types/supabase.ts` está escrito a mano y va por detrás del schema.**
> Le faltan los campos de `0007`–`0011`. Por eso todo el código usa `supabase as any`
> para escrituras. Se regenera con `supabase gen types typescript`.

---

## Páginas — estado real (todas implementadas)

| Ruta | Estado | Notas |
|---|---|---|
| `/dashboard` | ✅ | KPIs, equity curve SVG relativa al balance de la cuenta, disciplina, breakdown por sesión/instrumento |
| `/trading` | ✅ | TradingView + OrderForm con Risk Guardian, contador de trades, P&L diario, PreMarketModal |
| `/journal` | ✅ | Calendario mensual, filtros, barras mensuales, carrusel semanal |
| `/journal/[tradeId]` | ✅ | Detalle de trade, confluencias, emociones, screenshots, nota de voz, análisis AI |
| `/journal/new` | ✅ | Alta manual de trade |
| `/journal/report/[weekId]` | ✅ | Reporte semanal con analytics + análisis AI estructurado |
| `/plan-mode` | ✅ | CRUD de planes, checklists editables, diagramas SVG por tipo de estrategia |
| `/notebook` | ✅ | Notas con editor Tiptap, carpetas, tags, pin/favorito, analytics |
| `/news` | ✅ | Calendario económico (feed Forex Factory) + briefing macro |
| `/ai-bot` | ✅ | Chat con Claude |
| `/settings` | ✅ | CRUD de cuentas, MetaAPI, recálculo de balance |
| `/login`, `/update-password` | ✅ | |

**Pendiente principal:** wizard de onboarding (ver abajo).

---

## Motor de riesgo — `src/components/trading/RiskCalculator.ts`

Es la pieza que hay que entender antes de tocar nada de sizing.

```ts
GRADE_RISK_FACTOR = { "A+": 1, "A": 0.7, "B": 0.5, "C": 0 }

riskForGrade(balance, riskPercent, grade)  // presupuesto en USD para ese setup
maxRiskPerTrade(balance, riskPercent)      // el presupuesto de un A+
calcLots(instrument, entry, sl, riskUsd)   // → { lots, riskUsd, slPips }
getPips(instrument, p1, p2)                // forex / JPY / oro / cripto
isCrypto(instrument)                       // detecta BTCUSDT, ETHUSDT…
```

El riesgo **siempre** sale de `balance × risk_per_trade_percent`, nunca de un número
fijo. `DEFAULT_RISK_PERCENT = 0.3` solo se usa cuando el usuario todavía no tiene plan.

El Risk Guardian (`POST /api/risk-guardian/check`) corre 4 checks —
riesgo del trade, stop diario, DD de la firma, R:R — más avisos de disciplina.
Todos sus umbrales son relativos a la cuenta (p. ej. "zona crítica" = último 20%
del margen de drawdown, no `$2,000`).

---

## Lo que falta: wizard de onboarding

**El hueco más importante ahora mismo.** Al crear una cuenta, `POST /api/accounts`
solo guarda `name, type, broker, account_number, currency, initial_balance`. No pide
ni guarda límites de drawdown, stop diario ni objetivo de beneficio — así que el
Risk Guardian de un usuario nuevo corre con defaults que no son suyos.

Se dispara al detectar `accounts.length === 0` (bloqueante) y está también
disponible desde Settings → Add account.

### Principio: el wizard es la única fuente de los números de riesgo

Cada constante que se eliminó del código tiene que salir de una pregunta de este
formulario. Si un valor no se pregunta aquí, no existe en ningún sitio.

| Valor que el código ya no fija | Lo pregunta el wizard como… | Se guarda en |
|---|---|---|
| Balance inicial | "¿Con cuánto empieza esta cuenta?" | `accounts.initial_balance` |
| Límite de drawdown total | "¿Cuánto puedes perder en total antes de que te cierren la cuenta?" — se acepta en % o en importe, y se guarda el **suelo** | `accounts.total_dd_floor` |
| Límite de drawdown diario | "¿Y en un solo día?" | `accounts.daily_dd_floor` |
| Objetivo de beneficio | "¿Tienes un objetivo que alcanzar?" (opcional — las cuentas propias suelen no tenerlo) | `accounts.profit_target` *(nuevo en `0012`)* |
| Umbral de alerta de DD | "¿Cuándo quieres que te avise de que te queda poco margen?" — por defecto **el último 20%** del margen, editable | `accounts.dd_warning_percent` *(nuevo en `0012`)* |
| Stop diario personal | "¿Cuánto es lo máximo que aceptas perder en un día antes de parar?" | `accounts.personal_daily_stop_usd` |
| Riesgo por trade | "¿Qué % del balance arriesgas en tu mejor setup?" | `plans.risk_per_trade_percent` |
| Máx. trades/día | | `plans.max_trades_per_day` |
| Máx. pérdidas consecutivas | | `plans.max_consecutive_losses` |
| Ventana horaria | | `plans.trading_window_start/end` |
| Instrumentos que opera | Multi-select — ver nota sobre exchanges abajo | `accounts.instruments` *(nuevo en `0012`)* |
| Regla "viernes solo A+" | **Se ofrece como recomendación, no como default.** Toggle con texto tipo *"Muchos traders evitan operar setups mediocres los viernes por la baja liquidez de cierre. ¿Quieres que el Risk Guardian te avise?"* | `plans.friday_a_plus_only` *(nuevo en `0012`)* |

**Cómo explicar el drawdown en la UI.** Es el concepto que más confunde. El formulario
debe aceptar la forma en que la firma se lo comunica al trader (normalmente un
porcentaje: "10% de DD total") y mostrar en vivo el importe resultante — *"Con
$100.000 de balance inicial y 10% de DD, tu suelo es $90.000: si la cuenta baja
de ahí, la pierdes."* Guardar el suelo en dólares, no el porcentaje, porque es lo
que el Risk Guardian compara contra el balance.

Para cuentas propias (dinero real, sin firma) el DD no es una regla externa sino un
límite que el usuario se pone: la copy debe cambiar a *"¿Cuánto estás dispuesto a
perder de esta cuenta antes de parar y replantearte el sistema?"*.

### Instrumentos: los exchanges son multiactivo

**No asumas que un exchange = solo cripto.** Bitget opera cripto, forex y acciones
en la misma cuenta. La pregunta de instrumentos es un multi-select
(Forex · Metales · Índices · Acciones · Cripto) independiente del `type` de la
cuenta, y de ahí sale la lista del selector del `OrderForm` y el prefijo de
TradingView de cada símbolo (`isCrypto(symbol)` decide, no el tipo de cuenta).

### Pasos

1. **Tipo de cuenta:** fondeada (prop firm) · personal · demo — cambia la copy de todo lo demás
2. **La cuenta:** nombre, broker/exchange, moneda, balance inicial; si es fondeada, firma y fase
3. **Límites de la cuenta:** DD total, DD diario, umbral de alerta, objetivo de beneficio
4. **Riesgo y disciplina:** % por trade, stop diario, máx. trades/día, máx. pérdidas seguidas, reglas opcionales recomendadas (viernes solo A+, ventana horaria)
5. **Instrumentos:** multi-select
6. **Metodología:** nombre del plan y mínimo de confluencias

Al terminar escribe una fila completa en `accounts` y una fila activa en `plans`.
Nada de defaults silenciosos: si el usuario salta un campo opcional, la feature que
depende de él se oculta (como hace hoy la tarjeta de objetivo del dashboard).

---

## Arquitectura de archivos

```
src/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx                     ← sidebar + guard de auth
│   │   ├── dashboard/page.tsx
│   │   ├── trading/page.tsx
│   │   ├── journal/page.tsx
│   │   ├── journal/new/page.tsx
│   │   ├── journal/[tradeId]/page.tsx
│   │   ├── journal/report/[weekId]/page.tsx
│   │   ├── plan-mode/page.tsx
│   │   ├── notebook/page.tsx
│   │   ├── news/page.tsx
│   │   ├── ai-bot/page.tsx
│   │   └── settings/page.tsx
│   ├── (auth)/login/page.tsx
│   ├── (auth)/update-password/page.tsx
│   ├── api/
│   │   ├── accounts/route.ts              ← ⚠️ no guarda los límites de riesgo
│   │   ├── trades/route.ts
│   │   ├── trades/import/route.ts         ← import CSV de MT5
│   │   ├── risk-guardian/check/route.ts
│   │   ├── briefing/route.ts
│   │   ├── news/route.ts
│   │   ├── notify/telegram/route.ts
│   │   ├── metaapi/{connect,disconnect,sync}/route.ts
│   │   └── mt5/{webhook,sync,pending}/route.ts
│   ├── globals.css                        ← tokens del tema
│   └── layout.tsx
├── components/
│   ├── layout/{Sidebar,TopBar,AccountSelector}.tsx
│   ├── journal/{ConfluenceChecklist,EmotionSelector,MonthlyPnLBars,WeekBreakdownCarousel}.tsx
│   ├── plan/{PlanEditor,EditableChecklist,ModelDiagram,planData}.ts(x)
│   ├── news/MacroBriefing.tsx
│   └── trading/
│       ├── RiskCalculator.ts              ← motor de sizing
│       ├── RiskGuardianModal.tsx
│       ├── OrderForm.tsx
│       ├── PreMarketModal.tsx
│       ├── PositionsTable.tsx
│       ├── ImportCSVModal.tsx
│       ├── MT5ConnectionCard.tsx
│       ├── TradingViewWidget.tsx
│       ├── DailyPnLBar.tsx
│       ├── SessionIndicator.tsx
│       └── TradeCounter.tsx
├── lib/{cn.ts, metaapi-client.ts, parse-mt5-csv.ts, supabase/{client,server}.ts}
├── store/account.ts                       ← cuenta activa (zustand)
├── proxy.ts                               ← middleware de auth
└── types/supabase.ts                      ← ⚠️ desactualizado, regenerar
```

---

## Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY          # Risk Guardian, briefings, análisis de trades
NEWS_API_KEY               # opcional
TELEGRAM_BOT_TOKEN         # opcional
TELEGRAM_USER_ID           # opcional
```

---

## Metodología MATVARD (la de Kiara — no la asumas para otros usuarios)

Es *un* plan posible, no el plan de la app. Sistema de 22 confluencias que puntúa
cada setup:

| Confluencias | Grado | Presupuesto de riesgo |
|---|---|---|
| ≥18/22 | A+ | 100% del riesgo por trade |
| ≥12/22 | A | 70% |
| ≥10/22 | B | 50% |
| <10 | C | no operar |

Los porcentajes viven en `GRADE_RISK_FACTOR`. El importe en dólares lo pone el
balance de cada cuenta.
