const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const { sendPasswordResetEmail } = require('../services/email');

const router = express.Router();

const DEFAULT_MODULES = ['time', 'absences', 'expenses', 'documents'];

async function getUserModules(userId, role) {
  if (role === 'admin') {
    return ['time', 'absences', 'expenses', 'documents', 'budget', 'accounting', 'seasons', 'payroll'];
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

    // Enregistrement de la date/heure de dernière connexion
    await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [dbUser.id]);

    const modules = await getUserModules(dbUser.id, dbUser.role);
    res.json({ token, user: mapUser(dbUser, modules) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis' });

    // Always return success to avoid user enumeration
    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.json({ success: true });
    }

    const user = rows[0];
    if (user.blocked) {
      return res.json({ success: true }); // silently ignore blocked users
    }

    // Invalidate any existing tokens for this user
    await pool.execute(
      'UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0',
      [user.id]
    );

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await pool.execute(
      'INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
      [crypto.randomUUID(), user.id, token, expiresAt]
    );

    const appUrl = process.env.APP_URL || 'https://trh.neos.live';
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    // Fetch club name from settings
    let clubName = 'Tennis Club RH';
    try {
      const [settings] = await pool.execute('SELECT club_name FROM app_settings LIMIT 1');
      if (settings.length > 0 && settings[0].club_name) clubName = settings[0].club_name;
    } catch { /* ignore */ }

    await sendPasswordResetEmail({
      toEmail: user.email,
      toName: `${user.first_name} ${user.last_name}`,
      resetUrl,
      clubName,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token et mot de passe requis' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    const [rows] = await pool.execute(
      `SELECT prt.*, u.id AS uid FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token = ? AND prt.used = 0 AND prt.expires_at > NOW()`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Lien invalide ou expiré. Veuillez faire une nouvelle demande.' });
    }

    const resetToken = rows[0];
    const hash = await bcrypt.hash(password, 10);

    await pool.execute('UPDATE users SET password = ? WHERE id = ?', [hash, resetToken.user_id]);
    await pool.execute('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', [resetToken.id]);

    res.json({ success: true });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
