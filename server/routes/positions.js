const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

const router = express.Router();

// GET /api/positions
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM positions ORDER BY name');
    res.json(rows.map(r => ({ id: r.id, name: r.name })));
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
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nom requis' });
    }
    const id = uuidv4();
    await pool.execute('INSERT INTO positions (id, name) VALUES (?, ?)', [id, name.trim()]);
    res.status(201).json({ id, name: name.trim() });
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
    const [result] = await pool.execute('UPDATE positions SET name = ? WHERE id = ?', [name.trim(), id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Poste non trouvé' });
    res.json({ id, name: name.trim() });
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
    const [result] = await pool.execute('DELETE FROM positions WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Poste non trouvé' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
