const express = require('express');
const crypto = require('crypto');
const pool = require('../db');

const router = express.Router();

function mapPosition(r) {
  return { id: r.id, name: r.name, isProtected: !!r.is_protected };
}

// Protected post names that can never be deleted
const PROTECTED_NAMES = ['Président', 'Trésorier', 'Secrétaire Général'];

// GET /api/positions
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM positions ORDER BY name');
    res.json(rows.map(mapPosition));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/positions (admin only)
router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { name, isProtected } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nom requis' });
    }
    const id = crypto.randomUUID();
    const protected_flag = isProtected ? 1 : 0;
    await pool.execute(
      'INSERT INTO positions (id, name, is_protected) VALUES (?, ?, ?)',
      [id, name.trim(), protected_flag]
    );
    res.status(201).json({ id, name: name.trim(), isProtected: !!protected_flag });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/positions/:id (admin only)
router.put('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { id } = req.params;
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nom requis' });
    }
    const [result] = await pool.execute(
      'UPDATE positions SET name = ? WHERE id = ?',
      [name.trim(), id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Poste non trouvé' });
    const [rows] = await pool.execute('SELECT * FROM positions WHERE id = ?', [id]);
    res.json(mapPosition(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/positions/:id (admin only)
router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { id } = req.params;

    // Fetch the position
    const [posRows] = await pool.execute('SELECT * FROM positions WHERE id = ?', [id]);
    if (posRows.length === 0) return res.status(404).json({ error: 'Poste non trouvé' });
    const pos = posRows[0];

    // Block if system-protected name
    if (pos.is_protected || PROTECTED_NAMES.includes(pos.name)) {
      return res.status(409).json({ error: 'Ce poste est protégé et ne peut pas être supprimé.' });
    }

    // Block if assigned to any user
    const [userRows] = await pool.execute(
      'SELECT COUNT(*) as cnt FROM users WHERE position = ?',
      [pos.name]
    );
    if (userRows[0].cnt > 0) {
      return res.status(409).json({
        error: 'Ce poste est affecté à un ou plusieurs utilisateurs et ne peut pas être supprimé.',
      });
    }

    await pool.execute('DELETE FROM positions WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
