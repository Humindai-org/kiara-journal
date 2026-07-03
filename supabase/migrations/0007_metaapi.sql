alter table public.accounts
  add column if not exists metaapi_account_id text;
