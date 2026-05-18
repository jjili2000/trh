-- Migration : traçabilité de l'origine d'une saisie de temps
-- À exécuter via phpMyAdmin sur trh_tennis

ALTER TABLE time_entries
  ADD COLUMN source VARCHAR(20) NULL DEFAULT NULL
    COMMENT 'NULL = saisie manuelle, ''calendar'' = saisie depuis le calendrier';
