const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

const router = express.Router();

// GET /api/activity-types
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM activity_types ORDER BY name');
    res.json(rows.map(r => ({ id: r.id, name: r.name, color: r.color })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/activity-types (admin/manager)
router.post('/', async (req, res) => {
  try {
    if (req.user.role === 'user') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { name, color } = req.body;
    if (!name || !color) {
      return res.status(400).json({ error: 'Nom et couleur requis' });
    }
    const id = uuidv4();
    await pool.execute(
      'INSERT INTO activity_types (id, name, color) VALUES (?, ?, ?)',
      [id, name, color]
    );
    res.status(201).json({ id, name, color });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/activity-types/:id (admin/manager)
router.put('/:id', async (req, res) => {
  try {
    if (req.user.role === 'user') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { id } = req.params;
    const { name, color } = req.body;

    const updates = [];
    const values = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (color !== undefined) { updates.push('color = ?'); values.push(color); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    }

    values.push(id);
    await pool.execute(
      `UPDATE activity_types SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const [rows] = await pool.execute('SELECT * FROM activity_types WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Type non trouvé' });
    const r = rows[0];
    res.json({ id: r.id, name: r.name, color: r.color });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/activity-types/:id (admin/manager)
router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role === 'user') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { id } = req.params;
    const [result] = await pool.execute('DELETE FROM activity_types WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Type non trouvé' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
