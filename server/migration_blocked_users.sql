-- =============================================================================
-- Migration TRH — Blocage des utilisateurs + réinitialisation mot de passe
-- Compatible MySQL 5.7+
-- À exécuter UNE SEULE FOIS via phpMyAdmin sur la base trh_tennis
-- =============================================================================

ALTER TABLE users
  ADD COLUMN blocked TINYINT(1) NOT NULL DEFAULT 0;

-- =============================================================================
-- FIN DE LA MIGRATION
-- =============================================================================
