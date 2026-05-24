-- Migration : préférences de notifications par module
-- Compatible MySQL 5.x / 8.x et MariaDB
-- Remplace l'approche colonnes globales par une table dédiée

CREATE TABLE IF NOT EXISTS user_notification_prefs (
  user_id    CHAR(36)    NOT NULL,
  module     VARCHAR(32) NOT NULL,
  direction  VARCHAR(16) NOT NULL,   -- 'action'   = notification demandant une action de ma part
                                     -- 'response' = retour sur une demande que j'ai initiée
  in_app     TINYINT(1)  NOT NULL DEFAULT 1,
  email      TINYINT(1)  NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, module, direction)
);
