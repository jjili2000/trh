const express = require('express');
const crypto = require('crypto');
const pool = require('../db');

const router = express.Router();

function mapDept(r) {
  return {
    id: r.id,
    name: r.name,
    parentId: r.parent_id || null,
    createdAt: r.created_at,
  };
}

// GET /api/departments — liste plate de toutes les directions
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM departments ORDER BY name');
    res.json(rows.map(mapDept));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/departments — créer une direction (admin seulement)
router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { name, parentId } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    const id = crypto.randomUUID();
    await pool.execute(
      'INSERT INTO departments (id, name, parent_id) VALUES (?, ?, ?)',
      [id, name, parentId || null]
    );
    const [rows] = await pool.execute('SELECT * FROM departments WHERE id = ?', [id]);
    res.status(201).json(mapDept(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/departments/:id — modifier une direction (admin seulement)
router.put('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { id } = req.params;
    const { name, parentId } = req.body;

    const updates = [];
    const values = [];
    if (name !== undefined)     { updates.push('name = ?');      values.push(name); }
    if (parentId !== undefined) { updates.push('parent_id = ?'); values.push(parentId || null); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    }

    values.push(id);
    await pool.execute(
      `UPDATE departments SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const [rows] = await pool.execute('SELECT * FROM departments WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Direction non trouvée' });
    res.json(mapDept(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/departments/:id — supprimer une direction (admin seulement)
router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { id } = req.params;

    // Récupérer la direction à supprimer (pour connaître son parent_id)
    const [deptRows] = await pool.execute('SELECT * FROM departments WHERE id = ?', [id]);
    if (deptRows.length === 0) return res.status(404).json({ error: 'Direction non trouvée' });

    const parentId = deptRows[0].parent_id || null;

    // Remonter les enfants directs au parent du supprimé
    await pool.execute(
      'UPDATE departments SET parent_id = ? WHERE parent_id = ?',
      [parentId, id]
    );

    // Mettre à null les users liés
    await pool.execute(
      'UPDATE users SET department_id = NULL WHERE department_id = ?',
      [id]
    ).catch(() => {}); // Ignorer si colonne absente

    // Mettre à null les saisons liées
    await pool.execute(
      'UPDATE seasons SET department_id = NULL WHERE department_id = ?',
      [id]
    ).catch(() => {}); // Ignorer si colonne absente

    await pool.execute('DELETE FROM departments WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
