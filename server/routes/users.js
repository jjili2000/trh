const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

const router = express.Router();

const DEFAULT_MODULES = ['time', 'absences', 'expenses', 'documents'];

async function getUserModules(userId) {
  try {
    const [rows] = await pool.execute(
      'SELECT module FROM user_module_access WHERE user_id = ?',
      [userId]
    );
    // Si aucune ligne : migration pas encore exécutée ou utilisateur créé avant migration
    if (rows.length === 0) return [...DEFAULT_MODULES];
    return rows.map(r => r.module);
  } catch {
    // Table user_module_access inexistante : retourner les modules par défaut
    return [...DEFAULT_MODULES];
  }
}

async function setUserModules(userId, modules) {
  try {
    await pool.execute('DELETE FROM user_module_access WHERE user_id = ?', [userId]);
    for (const mod of modules) {
      await pool.execute(
        'INSERT IGNORE INTO user_module_access (user_id, module) VALUES (?, ?)',
        [userId, mod]
      );
    }
  } catch (err) {
    console.error('setUserModules error:', err);
  }
}

function mapUser(row, modules) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    role: row.role,
    managerId: row.manager_id || undefined,
    position: row.position || undefined,
    moduleAccess: modules || DEFAULT_MODULES,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at,
  };
}

// GET /api/users/me — current user
router.get('/me', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    const modules = rows[0].role === 'admin'
      ? ['time', 'absences', 'expenses', 'documents', 'budget', 'accounting', 'seasons']
      : await getUserModules(req.user.id);
    res.json(mapUser(rows[0], modules));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/users — all users (admin only)
router.get('/', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const [rows] = await pool.execute('SELECT * FROM users ORDER BY first_name, last_name');
    const [moduleRows] = await pool.execute('SELECT user_id, module FROM user_module_access');
    const modulesByUser = {};
    for (const r of moduleRows) {
      if (!modulesByUser[r.user_id]) modulesByUser[r.user_id] = [];
      modulesByUser[r.user_id].push(r.module);
    }
    res.json(rows.map(row => mapUser(
      row,
      row.role === 'admin'
        ? ['time', 'absences', 'expenses', 'documents', 'budget', 'accounting', 'seasons']
        : (modulesByUser[row.id] || DEFAULT_MODULES)
    )));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/users — create user (admin only)
router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { firstName, lastName, email, password, role, managerId, position, moduleAccess } = req.body;
    if (!firstName || !lastName || !email || !password || !role) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }
    const id = uuidv4();
    const hash = await bcrypt.hash(password, 10);
    await pool.execute(
      `INSERT INTO users (id, first_name, last_name, email, password, role, manager_id, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, firstName, lastName, email, hash, role || 'user', managerId || null, position || null]
    );

    // Set module access (default if not provided)
    const modules = Array.isArray(moduleAccess) ? moduleAccess : DEFAULT_MODULES;
    await setUserModules(id, modules);

    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
    res.status(201).json(mapUser(rows[0], modules));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email déjà utilisé' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/users/:id — update user (admin only)
router.put('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { id } = req.params;
    const { firstName, lastName, email, password, role, managerId, position, moduleAccess } = req.body;

    const updates = [];
    const values = [];

    if (firstName !== undefined) { updates.push('first_name = ?'); values.push(firstName); }
    if (lastName !== undefined)  { updates.push('last_name = ?');  values.push(lastName); }
    if (email !== undefined)     { updates.push('email = ?');      values.push(email); }
    if (role !== undefined)      { updates.push('role = ?');       values.push(role); }
    if (managerId !== undefined) { updates.push('manager_id = ?'); values.push(managerId || null); }
    if (position !== undefined)  { updates.push('position = ?');   values.push(position || null); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      values.push(hash);
    }

    if (updates.length > 0) {
      values.push(id);
      await pool.execute(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    // Update module access if provided
    if (Array.isArray(moduleAccess)) {
      await setUserModules(id, moduleAccess);
    }

    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    const modules = await getUserModules(id);
    res.json(mapUser(rows[0], modules));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email déjà utilisé' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/users/:id — delete user (admin only)
router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Impossible de supprimer votre propre compte' });
    }
    const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
