-- Add status lifecycle to trades:
--   pending → trade logged in app, not yet opened in MT5
--   open    → confirmed open in MT5 (webhook received, no close_time)
--   closed  → trade closed (webhook received close_time, or manually updated)
-- Default 'closed' keeps backward compatibility with all existing rows.

alter table public.trades
  add column if not exists status text not null default 'closed'
    check (status in ('pending', 'open', 'closed'));

-- Back-fill: rows with no close_time that were upserted as open positions
-- should be 'open'; rows with close_time stay 'closed'.
update public.trades
  set status = 'open'
  where close_time is null and mt5_ticket is not null;

-- Pending trades will have no mt5_ticket yet (created from the app pre-trade).
-- New pending rows inserted by POST /api/trades will already have status='pending'.

create index if not exists trades_status_idx on public.trades(status);
