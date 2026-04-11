require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');

async function seed() {
  const adminHash = await bcrypt.hash('admin123', 10);
  const managerHash = await bcrypt.hash('manager123', 10);
  const userHash = await bcrypt.hash('user123', 10);

  await pool.execute(
    `INSERT INTO users (id, first_name, last_name, email, password, role, position) VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE password = VALUES(password), role = VALUES(role)`,
    ['admin-001', 'Admin', 'Système', 'admin@tennisclub.fr', adminHash, 'admin', 'Administrateur']
  );

  await pool.execute(
    `INSERT INTO users (id, first_name, last_name, email, password, role, position) VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE password = VALUES(password), role = VALUES(role)`,
    ['manager-001', 'Sophie', 'Martin', 'manager@tennisclub.fr', managerHash, 'manager', 'Responsable terrain']
  );

  await pool.execute(
    `INSERT INTO users (id, first_name, last_name, email, password, role, manager_id, position) VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE password = VALUES(password), role = VALUES(role)`,
    ['user-001', 'Thomas', 'Dupont', 'user@tennisclub.fr', userHash, 'user', 'manager-001', 'Moniteur']
  );

  const activities = [
    ['Cours particuliers', '#2d6a4f'],
    ['Cours collectifs', '#52b788'],
    ['Tournoi', '#d4e157'],
    ['Administration', '#6b7280'],
    ['Entretien terrain', '#8db570'],
    ['Accueil', '#f59e0b'],
  ];

  for (const [name, color] of activities) {
    await pool.execute(
      `INSERT IGNORE INTO activity_types (id, name, color) VALUES (?,?,?)`,
      [uuidv4(), name, color]
    );
  }

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
