-- Migration : ajout des colonnes qty et unit_price
-- À exécuter une seule fois via phpMyAdmin ou MySQL CLI
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Lignes de détail du budget réel
ALTER TABLE budget_line_details
  ADD COLUMN qty        DECIMAL(10,2) NOT NULL DEFAULT 1 AFTER payment_method,
  ADD COLUMN unit_price DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER qty;

-- Initialiser unit_price = amount pour les enregistrements existants (qty reste à 1)
UPDATE budget_line_details SET unit_price = amount WHERE unit_price = 0;

-- 2. Lignes de la demande de budget
ALTER TABLE budget_request_lines
  ADD COLUMN qty        DECIMAL(10,2) NOT NULL DEFAULT 1 AFTER label,
  ADD COLUMN unit_price DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER qty;

-- Initialiser unit_price = amount pour les enregistrements existants (qty reste à 1)
UPDATE budget_request_lines SET unit_price = amount WHERE unit_price = 0;
