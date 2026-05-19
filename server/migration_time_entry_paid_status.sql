-- Migration : ajout du statut 'paid' pour les saisies d'heures prises en compte dans une paie validée
ALTER TABLE time_entries
  MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'paid') NOT NULL DEFAULT 'pending';
