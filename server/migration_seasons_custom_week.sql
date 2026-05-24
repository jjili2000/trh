-- Migration : ajout du flag is_custom sur les semaines type
-- Permet de distinguer les semaines type partagées des semaines personnalisées
-- créées via "Créer une semaine personnalisée" dans le calendrier.
-- Compatible MySQL 5.x / 8.x et MariaDB

ALTER TABLE template_weeks
  ADD COLUMN is_custom TINYINT(1) NOT NULL DEFAULT 0;
