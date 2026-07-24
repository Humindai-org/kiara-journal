# Fable 5 Prompt — Onboarding Wizard

You are building the **onboarding wizard** for a multi-user trading journal, **Trading Journal**. When someone opens the app for the first time (no accounts yet), a full-screen guided form walks them through setting up their trading account and rules. The same form is reachable later from Settings → "Add account".

**Why this matters:** the app used to be a single-person journal with one funded $100K account, and its numbers (balance, drawdown limit, profit target, dollar-risk-per-trade) were hardcoded. That's been removed — every one of those values now comes from the account row and the active plan. **This wizard is the only place those values get set.** If a value isn't captured here, the feature that depends on it silently degrades. So the job is as much data modelling as UI: ask the right questions, write complete rows.

---

## Tech Stack (DO NOT change these)

- **Next.js 16.2.4** App Router, `"use client"` on interactive components, `export const dynamic = "force-dynamic"` on pages that use Supabase
- **Supabase** SSR auth + Postgres. Browser client: `import { createClient } from "@/lib/supabase/client"`
- Auth middleware lives in **`src/proxy.ts`** (not `middleware.ts`)
- **CRITICAL — writes:** the generated Supabase types are out of date, so for every write use `const db = supabase as any` (this is the app-wide convention; the typed client rejects JSONB and the newer columns)
- Active-account state: `import { useAccountStore } from "@/store/account"` → `{ activeAccountId, accounts, setAccounts, setActiveAccount }`
- **Tailwind v4** with CSS custom properties — NEVER default Tailwind palette (no `indigo-500`, `blue-600`), only the brand tokens below
- **lucide-react** icons (import individually), **sonner** toasts (`import { toast } from "sonner"`), **`cn`** from `@/lib/cn`
- Package manager: **bun**
- **No hardcoded account numbers anywhere in what you write** — no `100000`, no `5000`, no fixed dollar risk. This is the whole point of the feature.

## Brand Design Tokens (ONLY these — never invent colors)

```css
--color-bg:             #14121f   /* app background */
--color-sidebar:        #100e18
--color-surface:        #1f1c2e   /* cards */
--color-surface-2:      #262237   /* inputs / hover */
--color-surface-light:  #221e32
--color-surface-hi:     #2b2740   /* form inputs */
--color-surface-hover:  #332e4b
--color-border:         rgba(255,255,255,0.06)
--color-border-light:   rgba(255,255,255,0.10)
--color-accent:         #9d8bff   /* lavender — primary CTA, active step */
--color-accent-dim:     #7c5cff
--color-accent-glow:    rgba(157,139,255,0.14)
--color-accent-soft:    rgba(157,139,255,0.18)
--color-profit:         #44e4b2   /* green */
--color-loss:           #ff6b8a   /* red */
--color-warning:        #fbbf24
--color-info:           #60a5fa
--color-text-primary:   #ffffff
--color-text-secondary: #b4aecf
--color-text-muted:     #a9a2c9
--color-text-disabled:  #7f789b
```

**Existing CSS classes** (use freely): `.card`, `.card-light`. Interactive elements need hover, focus-visible (`focus-visible:ring-2 focus-visible:ring-accent/50`), and active states. Only animate `transform`/`opacity`.

---

## Database — what the wizard writes

The migration `supabase/migrations/0012_account_onboarding.sql` **already exists** (don't recreate it). It adds the last columns the wizard needs. The full target schema:

### `accounts` (one row per trading account)
```
id                      uuid PK
user_id                 uuid  -- auth.uid()
name                    text NOT NULL
type                    text CHECK IN ('MT5','BITGET','BYBIT','BINANCE','MANUAL')
broker                  text
account_number          text
currency                text  -- 'USD' | 'EUR' | 'USDT'
initial_balance         numeric NOT NULL
current_balance         numeric NOT NULL   -- = initial_balance at creation
is_active               boolean            -- true for the new one; set others false
total_dd_floor          numeric   -- balance floor: if the account drops below this it's blown
daily_dd_floor          numeric   -- same idea, per day (nullable)
personal_daily_stop_usd numeric   -- the trader's own "stop for the day" in account currency
profit_target           numeric   -- nullable; the objective, when there is one
dd_warning_percent      numeric   -- warn when only this % of the DD allowance is left (default 20)
instruments             text[]    -- asset classes: 'FOREX','METALS','INDICES','STOCKS','CRYPTO'
```

### `plans` (one active row per user — the trading rules)
```
id                      uuid PK
user_id                 uuid
name                    text
is_active               boolean            -- true; deactivate the user's other plans
risk_per_trade_percent  numeric   -- % of balance risked on an A+ setup (e.g. 0.5, 1, 2)
max_trades_per_day      integer
max_consecutive_losses  integer
max_daily_loss          numeric   -- mirror of personal_daily_stop_usd, kept in sync
trading_window_start    text      -- 'HH:MM'
trading_window_end      text      -- 'HH:MM'
min_confluences         integer
friday_a_plus_only      boolean   -- opt-in rule, default false
```

**On finish, write both rows** (browser client, `const db = supabase as any`):
1. Set every existing account of this user to `is_active = false`, then insert the new `accounts` row with `is_active = true` and `current_balance = initial_balance`.
2. Set every existing plan of this user to `is_active = false`, then insert the new active `plans` row.
3. Refresh the account store (`setAccounts` from a re-fetch, then `setActiveAccount(newId)`).

Do this directly from the client — the rest of the app writes this way. RLS scopes everything to `auth.uid()`; always include `user_id: (await supabase.auth.getUser()).data.user.id`.

---

## The core principle: every screen maps a value to a column

Do not leave a risk value unasked. This table is the contract — the left column is a question, the right column is where the answer lands. If the user skips an optional field, the dependent feature hides itself (that's already how the dashboard behaves) — never fall back to a default that pretends to be their number.

| The user tells us… | Column |
|---|---|
| Starting balance | `accounts.initial_balance` |
| How much they can lose in total before the account is gone | `accounts.total_dd_floor` (store the floor, not the %) |
| …and in a single day | `accounts.daily_dd_floor` |
| The most they'll accept losing in a day before stopping | `accounts.personal_daily_stop_usd` (+ mirror to `plans.max_daily_loss`) |
| Profit objective, if any | `accounts.profit_target` (nullable) |
| When to warn them they're near the drawdown floor | `accounts.dd_warning_percent` (default 20) |
| % of balance risked on their best setup | `plans.risk_per_trade_percent` |
| Max trades/day, max losses in a row | `plans.max_trades_per_day`, `plans.max_consecutive_losses` |
| Trading hours | `plans.trading_window_start` / `_end` |
| Asset classes they trade | `accounts.instruments` |
| Whether to warn on non-A+ setups on Fridays | `plans.friday_a_plus_only` |

---

## Two things to get right

### 1. Drawdown, explained live
Drawdown is the concept people misread. Prop firms communicate it as a **percentage** ("10% total DD"), but the app compares a **dollar floor** against the balance. So:

- Ask for the balance first, then the DD as a **%** (with a toggle to enter a dollar amount instead).
- **Show the resulting floor live, in plain words**, e.g.:
  *"With $100,000 and 10% total drawdown, your floor is $90,000 — if the account drops below that, it's gone."*
- Store `total_dd_floor = initial_balance − (initial_balance × dd% / 100)` (or `initial_balance − ddAmount`). Same for the daily floor.

For a **personal** account (own money, no firm), the copy changes — DD isn't an external rule but a self-imposed limit:
*"How much of this account are you willing to lose before you stop and rethink the system?"* Same math, gentler framing, and it's optional.

### 2. Exchanges are multi-asset — don't equate account type with asset class
A Bitget/Bybit/Binance account can trade **crypto, forex and stocks** in the same place (the user's real money account is Bitget, trading FX). So the asset-class question is an independent **multi-select** (Forex · Metals · Indices · Stocks · Crypto), not derived from `type`. Store the selected classes in `accounts.instruments`; the trading screen reads this later to build its symbol list.

---

## The six screens

A stepper (progress dots or a top bar showing step N of 6). Back/Next, validation before advancing, a review before finish. Keep it calm and readable — big type, one idea per screen, generous spacing. It's the first thing a new user sees.

**Step 1 — Account type.** Three big choices, each reframes later copy:
- **Funded (prop firm)** — evaluation or funded account with external rules
- **Personal** — your own capital
- **Demo** — practice

**Step 2 — The account.** Name, broker/exchange (`type`: MetaTrader 5 · Bitget · Bybit · Binance · Manual), currency (USD/EUR/USDT), starting balance. If funded: firm name and phase/stage (free text is fine). Offer quick presets for common prop firms (The Trading Pit, FTMO, etc.) that just prefill the DD %/target defaults in the next step — presets are conveniences, never locked values.

**Step 3 — Account limits.** Total DD (% with $ toggle, live floor shown), daily DD (optional), the DD-warning threshold (default 20%, with a one-line explanation: *"We'll warn you when only this much of your drawdown room is left"*), and profit target (optional; default empty for personal accounts).

**Step 4 — Risk & discipline.** Risk per trade (% of balance — show the live dollar amount it works out to on their balance, e.g. *"1% of $100,000 = $1,000 per trade"*), daily stop in $, max trades/day, max consecutive losses. Then **optional recommended rules**, presented as suggestions with a short "why", off by default:
- Trading window (start/end) — *"Only trade during your planned session hours."*
- Friday A+ only — *"Many traders skip mediocre setups on Fridays because of thin end-of-week liquidity. Want the Risk Guardian to warn you?"* → `friday_a_plus_only`

**Step 5 — Instruments.** Multi-select of asset classes (Forex · Metals · Indices · Stocks · Crypto). Explain it feeds position sizing and the trading screen's symbol list.

**Step 6 — Review & finish.** Recap every value with its resulting interpretation (balance, floor in $, target, risk in $, rules). A clear "Create account" button that writes both rows, closes the wizard, and lands on the dashboard.

---

## Files to create

1. **`src/components/onboarding/OnboardingWizard.tsx`** — the full-screen wizard (fixed overlay, `z-50`, `bg-bg`). Props: `mode: "first-run" | "add-account"`, `onComplete: (accountId: string) => void`, `onCancel?: () => void` (only shown in add-account mode; first-run can't be dismissed).
2. **`src/components/onboarding/OnboardingGate.tsx`** — a small `"use client"` wrapper that reads the account store, and if the signed-in user has **zero accounts**, renders `<OnboardingWizard mode="first-run" .../>` over the app. Mount it inside `src/app/(app)/layout.tsx` so it covers every authenticated page.

**Integration notes (do these too):**
- In `src/app/(app)/layout.tsx`, render `<OnboardingGate />` alongside the existing layout.
- In `src/app/(app)/settings/page.tsx`, wire the existing "Add account" action to open `<OnboardingWizard mode="add-account" .../>` instead of the current inline form (leave the inline form if simpler, but the wizard is the primary path).

## Validation & behavior

- Required to finish: type, name, currency, `initial_balance > 0`, `risk_per_trade_percent > 0`, at least one instrument class.
- Everything else is optional; skipped optional values are written as `null` (or default), never as a made-up number.
- Numeric inputs: sane parsing, no negatives, `current_balance = initial_balance`.
- Persist wizard progress in local state only (no draft rows in the DB until finish).
- On write error, `toast.error` and stay on the review step — don't half-create.
- Money/percent formatting consistent with the app (`toLocaleString("en-US", { minimumFractionDigits: 2 })` for dollars).

## Do NOT

- Reference "Kiara", "TTP", "The Trading Pit", "Phase 2", or any specific person/firm as a default or placeholder.
- Hardcode any balance, target, drawdown or dollar-risk value.
- Assume a crypto account only trades crypto.
- Create migration `0012` (it already exists) or edit other migrations.
