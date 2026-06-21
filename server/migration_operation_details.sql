-- ============================================================
--  Migration : détail des opérations bancaires
--  À exécuter une seule fois sur la base de production.
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_operation_details (
  id          VARCHAR(36)    NOT NULL PRIMARY KEY,
  operation_id VARCHAR(36)   NOT NULL,
  label       VARCHAR(500)   NOT NULL,
  amount      DECIMAL(12,2)  NOT NULL DEFAULT 0,
  created_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (operation_id) REFERENCES bank_operations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
