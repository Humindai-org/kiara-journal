# Trading Journal

Journal de trading personal con gestión de cuentas, análisis de setups y seguimiento de drawdown en tiempo real.

**Stack:** Next.js 16 · Supabase · Vercel · Anthropic Claude

---

## Acceso rápido (recomendado para testers)

Si alguien ya tiene el proyecto desplegado, puede invitarte sin que necesites configurar nada de infraestructura.

**Pide al administrador:**
1. Que vaya a su proyecto en [supabase.com](https://supabase.com) → **Authentication → Users → Add user**
2. Que ingrese tu email y una contraseña temporal
3. Te comparte la URL del app (ejemplo: `https://tu-proyecto.vercel.app`)

Con eso ya puedes entrar, crear tus propias cuentas de trading y registrar trades. Tus datos están aislados del resto de usuarios por RLS.

---

## Setup completo (instancia propia)

Sigue estos pasos si quieres desplegar tu propia versión del journal.

### Requisitos

- [Bun](https://bun.sh) instalado
- Cuenta en [Supabase](https://supabase.com) (gratuita)
- Cuenta en [Vercel](https://vercel.com) (gratuita)
- API key de [Anthropic](https://console.anthropic.com) (para Risk Guardian)

---

### 1. Clonar el repositorio

```bash
git clone https://github.com/Humindai-org/kiara-journal.git
cd kiara-journal
bun install
```

---

### 2. Crear el proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) → **New project**
2. Elige un nombre, región y contraseña de base de datos
3. Espera a que termine de provisionar (~1 min)

#### Correr las migraciones

Con el [CLI de Supabase](https://supabase.com/docs/guides/cli) (recomendado):

```bash
brew install supabase/tap/supabase
supabase link --project-ref <tu-project-ref>
supabase db push
```

| Archivo | Qué hace |
|---|---|
| `0001_init.sql` | Tablas principales (accounts, plans, trades, journal_entries, notebooks) |
| `0002_seed.sql` | Desactivada — el wizard de onboarding la reemplaza |
| `0003_plan_settings.sql` | Configuración de plan de trading |
| `0004_briefings.sql` | Briefings diarios |
| `0005_webhook_token.sql` | Token para webhooks MT5 |
| `0006_recalculate_balance.sql` | Tipos de cuenta (MT5/Bitget/Bybit/Binance) + recálculo de balance |
| `0007_metaapi.sql` | Integración MetaAPI |
| `0008_dd_limits.sql` | Límites de drawdown y stop diario por cuenta |
| `0009_trade_status.sql` | Estados del ciclo de vida de trades |
| `0010_tags_screenshots.sql` | Tags en trades y screenshots en el journal |
| `0011_notebooks_v2.sql` | Notebook v2: categorías, carpetas, pin/favorito, tags, color |

Las migraciones se aplican **desde tu máquina**, no desde CI: automatizarlas en
GitHub Actions obligaría a guardar la contraseña de la base de datos como secret
del repo, y cualquiera con permiso de escritura podría extraerla — es acceso
directo a Postgres saltándose RLS.

Flujo de trabajo al añadir una migración:

```bash
# 1. escribe supabase/migrations/00XX_lo_que_sea.sql
supabase migration list   # confirma qué está pendiente
supabase db push          # aplícala
# 2. commit + push → Vercel despliega el código
```

> También puedes pegar cada archivo en el **SQL Editor** de Supabase, pero entonces
> el CLI no se entera de que se aplicó. Si lo haces así, avísale después con
> `supabase migration repair --status applied 00XX`.

#### Crear tu usuario

En Supabase ve a **Authentication → Users → Add user** e ingresa tu email y contraseña.

#### Obtener las credenciales

En **Project Settings → API** copia:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** → `SUPABASE_SERVICE_ROLE_KEY`

---

### 3. Configurar variables de entorno

```bash
cp .env.local.example .env.local
```

Edita `.env.local` con tus valores:

```env
# Supabase — obligatorio
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Anthropic — obligatorio (Risk Guardian)
ANTHROPIC_API_KEY=sk-ant-...

# Noticias de mercado — opcional
NEWS_API_KEY=...

# Alertas Telegram — opcional
TELEGRAM_BOT_TOKEN=...
TELEGRAM_USER_ID=...
```

---

### 4. Correr en local

```bash
bun dev
```

Abre [http://localhost:3000](http://localhost:3000) → inicia sesión con el usuario que creaste en Supabase.

---

### 5. Desplegar en Vercel

```bash
npx vercel
```

Sigue el wizard. Cuando pida las variables de entorno, agrégalas desde el panel de Vercel (**Settings → Environment Variables**) o con:

```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
npx vercel env add SUPABASE_SERVICE_ROLE_KEY
npx vercel env add ANTHROPIC_API_KEY
```

Luego redespliega para que tomen efecto:

```bash
npx vercel --prod
```

---

## Crear tu primera cuenta de trading

Una vez dentro del app:

1. Ve a **Settings → Accounts → Add account**
2. Ingresa el nombre de tu firma, balance inicial y límites de drawdown
3. El dashboard mostrará tus métricas en tiempo real

Cada usuario solo ve sus propias cuentas y trades — el aislamiento es automático.

---

## Funcionalidades principales

- Dashboard con P&L diario, drawdown y progreso hacia objetivo
- Risk Guardian: valida cada setup antes de operar (powered by Claude)
- Registro manual de trades con análisis R:R
- Importación de trades desde CSV de MT5
- Briefing diario de mercado
- Alertas opcionales vía Telegram

---

## Credenciales opcionales

| Servicio | Para qué | Dónde obtenerla |
|---|---|---|
| Anthropic | Risk Guardian (análisis de setups) | [console.anthropic.com](https://console.anthropic.com) |
| NewsAPI | Noticias de mercado en el dashboard | [newsapi.org](https://newsapi.org) |
| Telegram Bot | Alertas de riesgo en tiempo real | [@BotFather](https://t.me/BotFather) en Telegram |
