-- ─── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── accounts ────────────────────────────────────────────────
create table if not exists public.accounts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  type            text not null check (type in ('MT5', 'MANUAL')),
  broker          text not null default '',
  account_number  text,
  currency        text not null default 'USD',
  initial_balance numeric(14, 2) not null default 0,
  current_balance numeric(14, 2) not null default 0,
  is_active       boolean not null default true,
  mt5_server      text,
  created_at      timestamptz not null default now()
);

alter table public.accounts enable row level security;
create policy "Users manage own accounts"
  on public.accounts for all using (auth.uid() = user_id);

-- ─── plans ───────────────────────────────────────────────────
create table if not exists public.plans (
  id                      uuid primary key default uuid_generate_v4(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  name                    text not null,
  plan_type               text not null default 'MATVARD',
  is_active               boolean not null default false,
  charting_process        jsonb,
  entry_criteria          jsonb,
  entry_models            jsonb,
  trade_management_rules  text,
  exit_criteria           text,
  max_trades_per_day      integer default 3,
  max_daily_loss          numeric(10, 2) default 300,
  max_daily_profit        numeric(10, 2),
  risk_per_trade_percent  numeric(5, 3) default 0.3,
  trading_notes           text,
  last_reviewed_at        timestamptz,
  created_at              timestamptz not null default now()
);

alter table public.plans enable row level security;
create policy "Users manage own plans"
  on public.plans for all using (auth.uid() = user_id);

-- ─── trades ──────────────────────────────────────────────────
create table if not exists public.trades (
  id               uuid primary key default uuid_generate_v4(),
  account_id       uuid not null references public.accounts(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  instrument       text not null,
  direction        text not null check (direction in ('LONG', 'SHORT')),
  lot_size         numeric(10, 4) not null,
  entry_price      numeric(12, 5) not null,
  exit_price       numeric(12, 5),
  sl               numeric(12, 5),
  tp               numeric(12, 5),
  open_time        timestamptz not null,
  close_time       timestamptz,
  duration_minutes integer,
  session          text check (session in ('TOKYO', 'LONDON', 'NEW_YORK', 'OVERLAP')),
  gross_pnl        numeric(10, 2),
  net_pnl          numeric(10, 2),
  fees             numeric(10, 2) default 0,
  swap             numeric(10, 2) default 0,
  risk_r           numeric(8, 3),
  return_r         numeric(8, 3),
  risk_percent     numeric(6, 3),
  plan_id          uuid references public.plans(id),
  entry_emotion    text,
  exit_emotion     text,
  mistakes         text[],
  notes            text,
  followed_plan    boolean,
  source           text not null check (source in ('MT5', 'MANUAL')) default 'MANUAL',
  mt5_ticket       text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.trades enable row level security;
create policy "Users manage own trades"
  on public.trades for all using (auth.uid() = user_id);

-- auto-update updated_at
create or replace function public.update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trades_updated_at
  before update on public.trades
  for each row execute procedure public.update_updated_at_column();

-- ─── journal_entries ─────────────────────────────────────────
create table if not exists public.journal_entries (
  id                      uuid primary key default uuid_generate_v4(),
  trade_id                uuid not null references public.trades(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  hft_chart_url           text,
  mft_chart_url           text,
  lft_chart_url           text,
  review_plan             text,
  entry_confluences       jsonb,
  trade_management_notes  text,
  entry_emotion           text,
  exit_emotion            text,
  voice_note_url          text,
  ai_analysis             text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.journal_entries enable row level security;
create policy "Users manage own journal entries"
  on public.journal_entries for all using (auth.uid() = user_id);

create trigger journal_entries_updated_at
  before update on public.journal_entries
  for each row execute procedure public.update_updated_at_column();

-- ─── discipline_violations ───────────────────────────────────
create table if not exists public.discipline_violations (
  id             uuid primary key default uuid_generate_v4(),
  trade_id       uuid references public.trades(id) on delete set null,
  user_id        uuid not null references auth.users(id) on delete cascade,
  account_id     uuid not null references public.accounts(id) on delete cascade,
  violation_type text not null check (
    violation_type in (
      'MAX_TRADES', 'OUTSIDE_WINDOW', 'DAILY_LOSS',
      'AFTER_PROFIT_TARGET', 'HIGH_IMPACT_NEWS'
    )
  ),
  date           date not null,
  description    text,
  created_at     timestamptz not null default now()
);

alter table public.discipline_violations enable row level security;
create policy "Users manage own violations"
  on public.discipline_violations for all using (auth.uid() = user_id);

-- ─── notebooks ───────────────────────────────────────────────
create table if not exists public.notebooks (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  category   text not null check (
    category in (
      'PLANNED_TEMPLATE', 'MY_TEMPLATE', 'PLAYBOOK', 'MINDSET', 'PRODUCTIVITY'
    )
  ),
  content    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notebooks enable row level security;
create policy "Users manage own notebooks"
  on public.notebooks for all using (auth.uid() = user_id);

create trigger notebooks_updated_at
  before update on public.notebooks
  for each row execute procedure public.update_updated_at_column();

-- ─── news_blocks ─────────────────────────────────────────────
create table if not exists public.news_blocks (
  id                   uuid primary key default uuid_generate_v4(),
  event_name           text not null,
  currency             text not null,
  impact               text not null check (impact in ('HIGH', 'MEDIUM', 'LOW')),
  event_time           timestamptz not null,
  block_minutes_before integer not null default 30,
  block_minutes_after  integer not null default 30,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now()
);

alter table public.news_blocks enable row level security;
create policy "All authenticated users can read news_blocks"
  on public.news_blocks for select using (auth.role() = 'authenticated');
create policy "Users manage own news_blocks"
  on public.news_blocks for all using (auth.uid() in (
    select id from auth.users where email = current_setting('app.admin_email', true)
  ));

-- ─── Indexes ─────────────────────────────────────────────────
create index if not exists trades_account_id_idx on public.trades(account_id);
create index if not exists trades_user_id_open_time_idx on public.trades(user_id, open_time desc);
create index if not exists trades_mt5_ticket_idx on public.trades(mt5_ticket) where mt5_ticket is not null;
create index if not exists journal_entries_trade_id_idx on public.journal_entries(trade_id);
create index if not exists violations_user_date_idx on public.discipline_violations(user_id, date desc);
