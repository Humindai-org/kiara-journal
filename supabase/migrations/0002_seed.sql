-- ─── Seed inicial — DESACTIVADO ──────────────────────────────
--
-- Esta migración creaba una cuenta y un plan de ejemplo con un UUID literal
-- ('REEMPLAZA-CON-TU-USER-UUID') que no es un UUID válido: ejecutarla falla.
--
-- Ya no hace falta. El wizard de onboarding crea la cuenta y el plan del
-- usuario con sus valores reales la primera vez que entra.
--
-- Se conserva el archivo (vacío) para no romper el orden de versiones ni el
-- historial de migraciones de Supabase.

select 1;
