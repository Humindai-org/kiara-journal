-- Daily AI-generated macro briefings, cached per region per day.
create table if not exists public.briefings (
  id          uuid primary key default uuid_generate_v4(),
  region      text not null check (region in ('EUROPEAN', 'AMERICAN', 'ASIAN')),
  brief_date  date not null default current_date,
  content     jsonb not null,
  created_at  timestamptz not null default now(),
  unique (region, brief_date)
);

alter table public.briefings enable row level security;

-- Any authenticated user can read briefings
create policy "Authenticated users can read briefings"
  on public.briefings for select using (auth.role() = 'authenticated');

-- Writes happen server-side via the service role (bypasses RLS), so no insert policy is needed.

create index if not exists briefings_region_date_idx on public.briefings(region, brief_date desc);
