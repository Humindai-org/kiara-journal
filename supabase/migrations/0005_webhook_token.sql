-- ─── webhook_token en accounts ───────────────────────────────
-- Cada cuenta recibe un token único auto-generado.
-- El EA de MT5 incluye este token en el header Authorization.

alter table public.accounts
  add column if not exists webhook_token uuid not null default gen_random_uuid();

create unique index if not exists accounts_webhook_token_idx
  on public.accounts(webhook_token);

-- ─── last_sync_at para mostrar estado de conexión ─────────────
alter table public.accounts
  add column if not exists last_synced_at timestamptz;
