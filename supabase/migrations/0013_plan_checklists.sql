-- ─── Checklists de Trade Management y Exit por trade ─────────
-- entry_confluences ya guardaba qué criterios de entrada se marcaron en un
-- trade. Estas dos columnas hacen lo mismo para Trade Management y Exit, así
-- el review de cada trade puede verificarse contra las reglas reales del plan
-- (no solo notas libres) y Plan Mode > Statistics puede agregar el % de
-- cumplimiento por regla.

alter table public.journal_entries
  add column if not exists trade_management_checklist jsonb, -- Record<rule_id, boolean>
  add column if not exists exit_checklist               jsonb; -- Record<rule_id, boolean>
