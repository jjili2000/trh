-- Détails comptables sur les notes de frais (HT / TVA / TTC)
ALTER TABLE expenses
  ADD COLUMN vendor      VARCHAR(255)   NULL AFTER reason,
  ADD COLUMN amount_ht   DECIMAL(10,2)  NULL AFTER vendor,
  ADD COLUMN vat_details TEXT           NULL AFTER amount_ht;
-- vat_details : JSON array  [{"rate":"20","amount":10.00}, ...]
-- amount reste le montant TTC (compatibilité paie / stats existants)
