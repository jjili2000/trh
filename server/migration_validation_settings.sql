-- ============================================================
--  Migration : paramétrage de la chaîne de validation
--  À exécuter une seule fois sur la base de production.
-- ============================================================

-- Colonnes de validation par type sur chaque utilisateur
ALTER TABLE users
  ADD COLUMN validates_time      TINYINT NOT NULL DEFAULT 1,
  ADD COLUMN validates_absences  TINYINT NOT NULL DEFAULT 1,
  ADD COLUMN validates_expenses  TINYINT NOT NULL DEFAULT 1;

-- Rôle de valideur global dans les paramètres de l'application
ALTER TABLE app_settings
  ADD COLUMN global_validator_role VARCHAR(50) NULL DEFAULT NULL;
