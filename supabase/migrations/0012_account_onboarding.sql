-- ─── Campos del wizard de onboarding ─────────────────────────
-- Todo lo que el formulario inicial pregunta y que hasta ahora no tenía
-- dónde guardarse. El código ya lee estas columnas (dashboard, risk-guardian,
-- trading) con un fallback, así que aplicar esta migración las "enciende".

-- Cuenta: objetivo, umbral de alerta de DD, e instrumentos que opera.
alter table public.accounts
  add column if not exists profit_target       numeric(14, 2),           -- objetivo de beneficio (opcional; null = sin objetivo)
  add column if not exists dd_warning_percent   numeric(5, 2) default 20, -- avisar al quedar este % del margen de drawdown
  add column if not exists instruments          text[] default '{}';      -- clases de activo: FOREX, METALS, INDICES, STOCKS, CRYPTO

-- Plan: regla opcional "viernes solo A+" (recomendación, apagada por defecto).
alter table public.plans
  add column if not exists friday_a_plus_only   boolean default false;
