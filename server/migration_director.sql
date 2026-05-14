-- Migration : ajout du directeur sur une direction
-- À exécuter via phpMyAdmin sur trh_tennis
ALTER TABLE departments
  ADD COLUMN director_id VARCHAR(36) NULL AFTER parent_id,
  ADD CONSTRAINT fk_dept_director FOREIGN KEY (director_id) REFERENCES users(id) ON DELETE SET NULL;
