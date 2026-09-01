-- Add a 'draft' status to the trades lifecycle:
--   draft   → user is evaluating a setup (checking entry criteria in the
--             pre-trade checklist) — NOT a real trade attempt yet.
--   pending → logged via Risk Guardian, not yet confirmed open in MT5.
--   open    → confirmed open in MT5 (webhook received, no close_time).
--   closed  → trade closed.
--
-- Draft rows must never count toward daily trade limits, discipline stats,
-- or show up in trade lists — every query that reads `trades` broadly is
-- expected to add `.neq("status", "draft")` (see the app-side changes that
-- ship alongside this migration).

do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.trades'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%pending%open%closed%';

  if con_name is not null then
    execute format('alter table public.trades drop constraint %I', con_name);
  end if;
end $$;

alter table public.trades
  add constraint trades_status_check check (status in ('draft', 'pending', 'open', 'closed'));
