INSERT INTO users (id, first_name, last_name, email, password, role, position) VALUES
('admin-001', 'Admin', 'Système', 'admin@tennisclub.fr', '$2a$10$UluJ9qdqkMlXeXmZrXf7d.izF07k.EzKvsslm2YlEwP.uE/NOOziS', 'admin', 'Administrateur'),
('manager-001', 'Sophie', 'Martin', 'manager@tennisclub.fr', '$2a$10$IjUAoLpJ9y.ITE51rbAzNuCSGWXgVXJpe2vP.xXprrKTPlCPGr95C', 'manager', 'Responsable terrain');

INSERT INTO users (id, first_name, last_name, email, password, role, manager_id, position) VALUES
('user-001', 'Thomas', 'Dupont', 'user@tennisclub.fr', '$2a$10$OdcKpZy6L9d2nWJx84yiU.rpvxKs9NB8Ut4L3Z03CjN7u79OM9NDm', 'user', 'manager-001', 'Moniteur');

INSERT INTO activity_types (id, name, color) VALUES
('90bb7934-73e3-46cc-99e2-13818f54a07a', 'Cours particuliers', '#2d6a4f'),
('3a50c4e2-a302-48ed-962b-4741505e4db7', 'Cours collectifs', '#52b788'),
('8ecfa3cc-39af-4913-bb3e-485781c3a3b6', 'Tournoi', '#d4e157'),
('1fcf4ac1-61af-4f60-b20d-75480ccaf176', 'Administration', '#6b7280'),
('51aa23e2-a63d-4be8-b07f-693a4ddb49be', 'Entretien terrain', '#8db570'),
('22cc5b8f-5b93-40fc-9781-36f0d49d630b', 'Accueil', '#f59e0b');