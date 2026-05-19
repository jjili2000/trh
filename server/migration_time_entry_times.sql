-- Migration : heure de début et heure de fin sur les saisies de temps
-- À exécuter via phpMyAdmin sur trh_tennis

ALTER TABLE time_entries
  ADD COLUMN start_time TIME NULL DEFAULT NULL,
  ADD COLUMN end_time   TIME NULL DEFAULT NULL;
