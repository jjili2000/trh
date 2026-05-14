const express = require('express');
const crypto = require('crypto');
const pool = require('../db');

const router = express.Router();

// GET /api/activity-types
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM activity_types ORDER BY name');
    const [links] = await pool.execute('SELECT * FROM activity_type_departments').catch(() => [[]]);
    const deptMap = {};
    for (const l of links) {
      if (!deptMap[l.activity_type_id]) deptMap[l.activity_type_id] = [];
      deptMap[l.activity_type_id].push(l.department_id);
    }
    res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      color: r.color,
      isGlobal: r.is_global !== 0,
      departmentIds: deptMap[r.id] || [],
    })));
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
    const { name, color, isGlobal = true, departmentIds } = req.body;
    if (!name || !color) {
      return res.status(400).json({ error: 'Nom et couleur requis' });
    }
    const id = crypto.randomUUID();
    const isGlobalVal = isGlobal ? 1 : 0;
    await pool.execute(
      'INSERT INTO activity_types (id, name, color, is_global) VALUES (?, ?, ?, ?)',
      [id, name, color, isGlobalVal]
    );

    // Gérer les liaisons departments
    if (Array.isArray(departmentIds) && departmentIds.length > 0) {
      try {
        await pool.execute('DELETE FROM activity_type_departments WHERE activity_type_id = ?', [id]);
        for (const deptId of departmentIds) {
          await pool.execute(
            'INSERT IGNORE INTO activity_type_departments (activity_type_id, department_id) VALUES (?, ?)',
            [id, deptId]
          );
        }
      } catch (linkErr) {
        console.error('activity_type_departments insert error (ignored):', linkErr.message);
      }
    }

    const [links] = await pool.execute(
      'SELECT department_id FROM activity_type_departments WHERE activity_type_id = ?', [id]
    ).catch(() => [[]]);

    res.status(201).json({
      id, name, color,
      isGlobal: isGlobalVal !== 0,
      departmentIds: links.map(l => l.department_id),
    });
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
    const { name, color, isGlobal, departmentIds } = req.body;

    const updates = [];
    const values = [];
    if (name !== undefined)     { updates.push('name = ?');      values.push(name); }
    if (color !== undefined)    { updates.push('color = ?');     values.push(color); }
    if (isGlobal !== undefined) { updates.push('is_global = ?'); values.push(isGlobal ? 1 : 0); }

    if (updates.length === 0 && !Array.isArray(departmentIds)) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    }

    if (updates.length > 0) {
      values.push(id);
      await pool.execute(
        `UPDATE activity_types SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    // Mettre à jour les liaisons departments
    if (Array.isArray(departmentIds)) {
      try {
        await pool.execute('DELETE FROM activity_type_departments WHERE activity_type_id = ?', [id]);
        for (const deptId of departmentIds) {
          await pool.execute(
            'INSERT IGNORE INTO activity_type_departments (activity_type_id, department_id) VALUES (?, ?)',
            [id, deptId]
          );
        }
      } catch (linkErr) {
        console.error('activity_type_departments update error (ignored):', linkErr.message);
      }
    }

    const [rows] = await pool.execute('SELECT * FROM activity_types WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Type non trouvé' });
    const r = rows[0];

    const [links] = await pool.execute(
      'SELECT department_id FROM activity_type_departments WHERE activity_type_id = ?', [id]
    ).catch(() => [[]]);

    res.json({
      id: r.id, name: r.name, color: r.color,
      isGlobal: r.is_global !== 0,
      departmentIds: links.map(l => l.department_id),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/activity-types/:id/departments
router.get('/:id/departments', async (req, res) => {
  try {
    const [links] = await pool.execute(
      'SELECT department_id FROM activity_type_departments WHERE activity_type_id = ?',
      [req.params.id]
    ).catch(() => [[]]);
    res.json(links.map(l => l.department_id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/activity-types/:id/departments (admin/manager)
router.put('/:id/departments', async (req, res) => {
  try {
    if (req.user.role === 'user') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { id } = req.params;
    const { departmentIds } = req.body;
    if (!Array.isArray(departmentIds)) {
      return res.status(400).json({ error: 'departmentIds (array) requis' });
    }
    await pool.execute('DELETE FROM activity_type_departments WHERE activity_type_id = ?', [id]);
    for (const deptId of departmentIds) {
      await pool.execute(
        'INSERT IGNORE INTO activity_type_departments (activity_type_id, department_id) VALUES (?, ?)',
        [id, deptId]
      );
    }
    const [links] = await pool.execute(
      'SELECT department_id FROM activity_type_departments WHERE activity_type_id = ?', [id]
    ).catch(() => [[]]);
    res.json(links.map(l => l.department_id));
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
