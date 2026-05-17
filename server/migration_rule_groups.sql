-- Migration : groupes de conditions (parenthèses) dans les règles de catégorisation
-- À exécuter via phpMyAdmin sur trh_tennis

ALTER TABLE accounting_rules
  ADD COLUMN rootOperator VARCHAR(3) NOT NULL DEFAULT 'AND' AFTER conditionOperator,
  ADD COLUMN groupsJson    LONGTEXT   NULL     AFTER rootOperator;
