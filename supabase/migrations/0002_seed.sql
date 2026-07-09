-- ─── Seed inicial — ejemplo de cuenta (opcional) ─────────────
-- Solo ejecutar si quieres una cuenta de ejemplo.
-- Reemplaza el UUID por el tuyo: Auth → Users → tu usuario → User UID

insert into public.accounts (
  user_id,
  name,
  type,
  broker,
  account_number,
  currency,
  initial_balance,
  current_balance,
  is_active
)
values (
  'REEMPLAZA-CON-TU-USER-UUID',
  'Mi Cuenta — $100K',
  'MANUAL',
  'The Trading Pit',
  'Phase 2',
  'USD',
  100000.00,
  100000.00,
  true
)
on conflict do nothing;

-- ─── Plan MATVARD activo ──────────────────────────────────────
insert into public.plans (
  user_id,
  name,
  plan_type,
  is_active,
  charting_process,
  entry_criteria,
  max_trades_per_day,
  max_daily_loss,
  risk_per_trade_percent,
  trading_notes
)
values (
  'REEMPLAZA-CON-TU-USER-UUID',
  'MATVARD — Fase 2',
  'MATVARD',
  true,
  '[
    "Revisar DVA-ETH y DVA-W para contexto macro",
    "Identificar PRAC: ritmo, narrativa, aceptación, condición",
    "Marcar áreas pivote (Origen, Destino, Neutral)",
    "Definir hipótesis direccional (máx 3)",
    "Confirmar timing T3 antes de entrar"
  ]'::jsonb,
  '[
    "Setup con ≥12/22 confluencias MATVARD",
    "R:R mínimo 1:2 (preferido 1:3)",
    "Sin evento HIGH IMPACT en ventana de 30 min",
    "DD diario restante > $90",
    "Máx 2 operaciones simultáneas"
  ]'::jsonb,
  3,
  300.00,
  0.300,
  'Lun–Jue. Viernes solo setups A+. Stop diario: 2 pérdidas o $300.'
)
on conflict do nothing;
