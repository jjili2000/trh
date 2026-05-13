-- Ajout de la colonne duration_days sur absence_requests
-- Valeurs existantes initialisées depuis les dates (DATEDIFF + 1)

ALTER TABLE absence_requests
  ADD COLUMN IF NOT EXISTS duration_days DECIMAL(4,2) NOT NULL DEFAULT 1.00
  AFTER end_date;

UPDATE absence_requests
SET duration_days = DATEDIFF(end_date, start_date) + 1
WHERE duration_days = 1.00;
