# Auditoría multiusuario — kiara-journal

**Fecha:** 2026-07-23
**Contexto:** se dio acceso a un segundo usuario (socio). Reportó 2 síntomas: equity curve rota en el dashboard y "versión anterior" del notebook.
**Commit auditado:** `e4d52e1` (todo pusheado a `origin/main`)

---

## Qué pude verificar y qué no

| | |
|---|---|
| ✅ Verificado | Código local completo, migraciones en `supabase/migrations/`, estado de git, respuesta de producción vía HTTP |
| ❌ **No** verificado | Estado real del schema en Supabase producción y estado de deployments en Vercel — `.env.local` sólo tiene `VERCEL_OIDC_TOKEN` (sin claves de Supabase) y el CLI de Vercel no está autenticado en esta sesión |

Las afirmaciones sobre migraciones no aplicadas son **inferencia desde el código**, no confirmación contra la BD. Al final hay los comandos exactos para confirmarlo.

---

## 1 · Equity curve rota — CAUSA RAÍZ CONFIRMADA 🔴

`src/app/(app)/dashboard/page.tsx:184-201`

```ts
const INITIAL_BALANCE = 100000;   // línea 158

function EquityCurve({ data, startBalance = INITIAL_BALANCE }) {
  const min = Math.min(...balances, INITIAL_BALANCE);   // ← 188
  const max = Math.max(...balances, INITIAL_BALANCE);   // ← 189
  ...
  const baselineY = y(INITIAL_BALANCE);                                    // ← 199
  const lineColor = lastBalance >= INITIAL_BALANCE ? "#34d399" : "#f87171"; // ← 201
}
```

El componente **recibe** `startBalance` (que sí viene del balance real de la cuenta) pero **no lo usa para la escala**. Fuerza `100000` dentro del min/max, dibuja la línea base ahí y compara el color contra ese valor.

Efecto para el socio: si su cuenta no es exactamente de $100.000, el rango vertical se estira a la distancia entre su balance y 100.000. Con una cuenta de, por ejemplo, $10K el rango pasa a ser ~90.000 y toda la curva queda aplastada contra el borde inferior — una línea plana. Además la línea sale siempre roja (porque `balance < 100000`) y la línea punteada de referencia queda fuera de la vista.

**Mismo problema en la tarjeta "Phase 2 Progress"** (líneas 158-160, 418-437):

```ts
const DD_LIMIT = 10000;      // el DD de TTP, para todos
const PROFIT_TARGET = 5000;  // el objetivo de tu fase 2, para todos
```

Al socio le muestra progreso hacia *tu* objetivo de $5.000 y su DD contra *tu* límite de $10.000.

**Fix:** que `EquityCurve` use el `startBalance` que ya recibe, y derivar `DD_LIMIT`/`PROFIT_TARGET` de la cuenta. Ojo: `accounts` **no tiene columna de profit target** — hay que añadirla en una migración nueva.

---

## 2 · Notebook "versión anterior" 🔴

**El deploy NO está viejo.** Verificado por HTTP: `https://kiara-journal.vercel.app/login` devuelve `age: 957239` en el header de CDN (≈11,1 días → deploy del ~12 jul), que coincide con la fecha del último commit `e4d52e1` (12 jul 23:50). Y no hay commits sin pushear. Producción sirve el código más reciente.

Lo que sí está desactualizado es **el schema de la base de datos**. Las migraciones `0010_tags_screenshots.sql` y `0011_notebooks_v2.sql` no aparecen en la tabla del README (que corta en `0009`), y todo apunta a que nunca se corrieron en el proyecto Supabase de producción.

Sin `0011`, el notebook v2 se degrada **en silencio** (todas las llamadas usan `supabase as any`, así que nada falla en compilación):

| Acción | Qué pasa sin la migración |
|---|---|
| Fijar / favorito | `update({ is_pinned })` falla — columna inexistente |
| Cambiar categoría a STRATEGY / RISK / TEMPLATE | Rechazado por el CHECK viejo (`PLANNED_TEMPLATE, MY_TEMPLATE, PLAYBOOK, MINDSET, PRODUCTIVITY`) |
| Duplicar nota | Falla (`tags`, `folder`, `color`) |
| Mover a carpeta | Falla (`folder`) |
| Guardar con tags | Falla y cae al fallback sin tags |
| Contadores Favorites / Pinned | Siempre 0 |

El propio código lo delata — `notebook/page.tsx:333-338` tiene un fallback explícito comentado *"Try with tags (requires migration 0011)"*.

Sin `0010`: `journal/[tradeId]` no puede guardar tags ni screenshots, y el **reporte semanal** (`journal/report/[weekId]/page.tsx:325`) hace `select(... tags ...)` sin fallback → si la columna no existe, la query devuelve error y el reporte sale vacío.

**Segunda hipótesis a descartar (30 segundos):** confirmar que el socio entra por `kiara-journal.vercel.app` y no por una URL de preview antigua (`kiara-journal-git-*.vercel.app` o `kiara-journal-<hash>.vercel.app`), y pedirle un hard-reload.

---

## 3 · Crear una cuenta nueva queda incompleta 🔴

`POST /api/accounts` (`src/app/api/accounts/route.ts:22-49`) inserta sólo `name, type, broker, account_number, currency, initial_balance, current_balance, is_active`.

**Nunca setea** `daily_dd_floor`, `total_dd_floor` ni `personal_daily_stop_usd` (migración 0008). El formulario de Settings tampoco tiene esos campos.

Consecuencia — el Risk Guardian del socio corre con tus valores por defecto:

```ts
// api/risk-guardian/check/route.ts:78-79
const personalDailyStop = account.personal_daily_stop_usd ?? 300;              // tu stop diario
const totalDdFloor      = account.total_dd_floor ?? initial_balance * 0.90;    // asume 10% de DD
```

Además **no se crea ningún plan** para un usuario nuevo. `plans` queda vacío hasta que él edite un límite en la página de Trading, y en ese momento `trading/page.tsx:172` le crea un plan literalmente llamado **"MATVARD — Fase 2"** con 3 trades / $300 / $500.

---

## 4 · Risk Guardian cableado a una cuenta TTP de $100K 🟠

`src/components/trading/RiskCalculator.ts:11-16`

```ts
const GRADE_RISK = { "A+": 300, "A": 210, "B": 150, "C": 0 };  // USD fijos
```

El riesgo por trade no se deriva del balance ni del `risk_per_trade_percent` del plan — son dólares fijos calculados sobre $100K. Para el socio, el tamaño de lote sugerido es directamente incorrecto.

En la ruta del check, más valores tuyos aplicados a todos:

- `totalDdRemaining < 2000` → zona crítica fija (línea 156). En una cuenta chica, siempre CAUTION.
- `totalDdUsed > 5000 && grade === "B"` → modo protección fijo (línea 219).
- `initial_balance ?? 100000` (línea 218).
- Regla "viernes sólo A+" (línea 205) — es *tu* regla, no configurable.

**Y para cuentas cripto:** Settings deja elegir BITGET / BYBIT / BINANCE, pero `PIP_VALUES` sólo cubre forex mayores + XAUUSD, y `getPips()` hace `diff * 10000` por defecto. Cualquier par cripto da lotaje y riesgo sin sentido.

---

## 5 · Inconsistencia account_id vs user_id 🟠

| Vista | Filtro |
|---|---|
| Dashboard (`dashboard/page.tsx:260`) | `account_id` |
| Journal (`journal/page.tsx:84`) | `user_id` |
| Reporte semanal (`report/[weekId]:326`) | `user_id` |
| MonthlyPnLBars (`:33`) | `user_id` |
| Notebook (`:366`) | `user_id` |
| WeekBreakdownCarousel (`:64`) | sólo fecha (depende de RLS) |
| PositionsTable / PreMarketModal | `account_id` |

Con una sola cuenta no se nota. En cuanto el socio tenga dos (o cargue TTP + Bitget como tú), el dashboard y el journal muestran números distintos para el mismo periodo. No es un fallo de aislamiento entre usuarios — RLS sigue protegiendo — pero sí de coherencia.

---

## 6 · Branding y copy personal 🟡

- `components/layout/Sidebar.tsx:54` → "Kiara / Journal"
- `app/layout.tsx:18` → `<title>Trading Kiara Journal`
- `(auth)/login/page.tsx:56,131` → "Trading Kiara", "Trading Kiara Journal · Phase 2"
- `(auth)/update-password/page.tsx:35` → "Trading Kiara"
- `(auth)/login/page.tsx:41` → `redirectTo: "https://kiara-journal.vercel.app/update-password"` **hardcodeado**: el reset de contraseña se rompe en cualquier preview o dominio propio.
- `dashboard/page.tsx:423` → "Phase 2 Progress"

---

## 7 · Tipos desincronizados 🟡

`src/types/supabase.ts` va por detrás de las migraciones:

- `accounts` → faltan `daily_dd_floor`, `total_dd_floor`, `personal_daily_stop_usd`, `metaapi_account_id`, `metaapi_region` (0007, 0008)
- `trades` → falta `tags` (0010), revisar `status` (0009)
- `journal_entries` → falta `screenshots` (0010)
- `notebooks` → faltan `is_pinned`, `is_favorite`, `tags`, `folder`, `color`, y el union de categorías sigue siendo el viejo (0011)

Esto es la causa de fondo de por qué todo esto falla en silencio: como los tipos no existen, el código recurre a `supabase as any` en todas partes y TypeScript no puede avisar de nada.

---

## 8 · Documentación 🟡

- README: la tabla de migraciones termina en `0009`. Quien siga el README deja la BD a medias — exactamente el estado que sospecho en producción.
- `0002_seed.sql` sigue con `'REEMPLAZA-CON-TU-USER-UUID'` como literal.
- No existe `0012` para: profit target por cuenta, límites de DD editables, ni reglas de disciplina por usuario.

---

## Cómo confirmar el estado real

**Schema de producción** — en el SQL Editor de Supabase:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'notebooks'       and column_name in ('is_pinned','is_favorite','tags','folder','color')) or
    (table_name = 'trades'          and column_name = 'tags') or
    (table_name = 'journal_entries' and column_name = 'screenshots') or
    (table_name = 'accounts'        and column_name in ('total_dd_floor','daily_dd_floor','personal_daily_stop_usd'))
  );
```

Si devuelve menos de 10 filas, faltan migraciones. Y para el CHECK de categorías:

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid = 'public.notebooks'::regclass;
```

**Cuenta del socio:**

```sql
select name, type, initial_balance, current_balance,
       total_dd_floor, daily_dd_floor, personal_daily_stop_usd
from accounts where user_id = '<uuid-del-socio>';
```

**Deployment:** en el dashboard de Vercel, confirmar que el alias de producción apunta al commit `e4d52e1`.

---

## Orden sugerido de arreglo

| # | Qué | Dónde | Impacto |
|---|---|---|---|
| 1 | Correr `0010` y `0011` en Supabase prod | SQL Editor | Desbloquea notebook v2 y el reporte semanal |
| 2 | `EquityCurve` usa `startBalance` en vez de `INITIAL_BALANCE` | `dashboard/page.tsx:184-201` | Arregla el síntoma reportado |
| 3 | Migración `0012`: `profit_target` en `accounts` + DD floors con default sensato | nueva | Habilita 4 y 5 |
| 4 | Campos de DD / stop diario / profit target en Settings, y que `POST /api/accounts` los persista | `settings/page.tsx`, `api/accounts/route.ts` | Cada usuario con sus reglas |
| 5 | `DD_LIMIT` / `PROFIT_TARGET` desde la cuenta | `dashboard/page.tsx:158-160` | Dashboard correcto para cualquiera |
| 6 | `GRADE_RISK` derivado de balance × `risk_per_trade_percent` | `RiskCalculator.ts` | Risk Guardian usable por el socio |
| 7 | Unificar todo a `account_id` (o añadir un toggle explícito "todas las cuentas") | journal, report, MonthlyPnLBars, notebook | Coherencia dashboard ↔ journal |
| 8 | Regenerar `src/types/supabase.ts` y quitar los `as any` | `types/supabase.ts` | Los próximos fallos salen en compilación |
| 9 | `redirectTo` desde `window.location.origin` | `login/page.tsx:41` | Reset de contraseña en cualquier dominio |
| 10 | Branding neutro + README con migraciones 0010/0011 | varios | Presentable para el socio |
