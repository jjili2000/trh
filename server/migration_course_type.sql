-- Migration : ajout du type de cours dans la semaine type
-- À exécuter via phpMyAdmin sur trh_tennis
ALTER TABLE template_courses
  ADD COLUMN course_type VARCHAR(100) NULL AFTER teacher_id;
