-- ============================================================
--  Migration : traçabilité de la période de paie par saisie
--  À exécuter une seule fois sur la base de production.
-- ============================================================

ALTER TABLE time_entries
  ADD COLUMN payroll_period_id VARCHAR(36) NULL DEFAULT NULL;
