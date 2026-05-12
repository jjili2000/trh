const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

const DEFAULT_MODULES = ['time', 'absences', 'expenses', 'documents'];

async function getUserModules(userId, role) {
  if (role === 'admin') {
    return ['time', 'absences', 'expenses', 'documents', 'budget', 'accounting', 'seasons'];
  }
  try {
    const [rows] = await pool.execute(
      'SELECT module FROM user_module_access WHERE user_id = ?',
      [userId]
    );
    if (rows.length === 0) return [...DEFAULT_MODULES];
    return rows.map(r => r.module);
  } catch {
    return [...DEFAULT_MODULES];
  }
}

// Map DB row (snake_case) → frontend object (camelCase), omit password
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

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const dbUser = rows[0];
    const valid = await bcrypt.compare(password, dbUser.password);
    if (!valid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    if (dbUser.blocked) {
      return res.status(403).json({ error: 'Ce compte a été désactivé. Contactez un administrateur.' });
    }

    const payload = { id: dbUser.id, role: dbUser.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'secret', {
      expiresIn: '24h',
    });

    const modules = await getUserModules(dbUser.id, dbUser.role);
    res.json({ token, user: mapUser(dbUser, modules) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
