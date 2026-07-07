-- Add drawdown floor fields and personal daily stop to accounts.
-- These mirror challenge_state.json values so the Next.js app can run
-- Risk Guardian checks without reading the local filesystem.

alter table public.accounts
  add column if not exists daily_dd_floor        numeric(14, 2),
  add column if not exists total_dd_floor        numeric(14, 2),
  add column if not exists personal_daily_stop_usd numeric(10, 2) default 300,
  add column if not exists metaapi_region        text;
