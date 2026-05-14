-- Migration : plage horaire configurable du calendrier
-- À exécuter via phpMyAdmin sur trh_tennis
ALTER TABLE app_settings
  ADD COLUMN calendar_start_hour TINYINT NOT NULL DEFAULT 8,
  ADD COLUMN calendar_end_hour   TINYINT NOT NULL DEFAULT 21;
