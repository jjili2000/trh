const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

const router = express.Router();

function mapEntry(row) {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date instanceof Date
      ? row.date.toISOString().slice(0, 10)
      : String(row.date).slice(0, 10),
    hours: parseFloat(row.hours),
    activityTypeId: row.activity_type_id || undefined,
    description: row.description || undefined,
    status: row.status,
    validatedBy: row.validated_by || undefined,
    validatedAt: row.validated_at instanceof Date
      ? row.validated_at.toISOString()
      : row.validated_at || undefined,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at,
  };
}

// GET /api/time-entries
router.get('/', async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      [rows] = await pool.execute('SELECT * FROM time_entries ORDER BY date DESC, created_at DESC');
    } else if (req.user.role === 'manager') {
      // Own entries + entries of subordinates
      [rows] = await pool.execute(
        `SELECT te.* FROM time_entries te
         WHERE te.user_id = ?
            OR te.user_id IN (SELECT id FROM users WHERE manager_id = ?)
         ORDER BY te.date DESC, te.created_at DESC`,
        [req.user.id, req.user.id]
      );
    } else {
      [rows] = await pool.execute(
        'SELECT * FROM time_entries WHERE user_id = ? ORDER BY date DESC, created_at DESC',
        [req.user.id]
      );
    }
    res.json(rows.map(mapEntry));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/time-entries
router.post('/', async (req, res) => {
  try {
    const { date, hours, activityTypeId, description } = req.body;
    if (!date || hours === undefined) {
      return res.status(400).json({ error: 'Date et heures requis' });
    }
    const id = uuidv4();
    await pool.execute(
      `INSERT INTO time_entries (id, user_id, date, hours, activity_type_id, description, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [id, req.user.id, date, hours, activityTypeId || null, description || null]
    );
    const [rows] = await pool.execute('SELECT * FROM time_entries WHERE id = ?', [id]);
    res.status(201).json(mapEntry(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/time-entries/:id — update own pending entry
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM time_entries WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Entrée non trouvée' });

    const entry = existing[0];
    if (entry.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    if (entry.status !== 'pending') {
      return res.status(400).json({ error: 'Seules les entrées en attente peuvent être modifiées' });
    }

    const { date, hours, activityTypeId, description } = req.body;
    const updates = [];
    const values = [];
    if (date !== undefined) { updates.push('date = ?'); values.push(date); }
    if (hours !== undefined) { updates.push('hours = ?'); values.push(hours); }
    if (activityTypeId !== undefined) { updates.push('activity_type_id = ?'); values.push(activityTypeId || null); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description || null); }

    if (updates.length > 0) {
      values.push(id);
      await pool.execute(`UPDATE time_entries SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    const [rows] = await pool.execute('SELECT * FROM time_entries WHERE id = ?', [id]);
    res.json(mapEntry(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/time-entries/:id/approve
router.put('/:id/approve', async (req, res) => {
  try {
    if (req.user.role === 'user') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM time_entries WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Entrée non trouvée' });

    const entry = existing[0];

    // Manager can only approve subordinates' entries
    if (req.user.role === 'manager') {
      const [sub] = await pool.execute(
        'SELECT id FROM users WHERE id = ? AND manager_id = ?',
        [entry.user_id, req.user.id]
      );
      if (sub.length === 0 && entry.user_id !== req.user.id) {
        // Allow manager to approve own entries too — actually restrict to subordinates only
        return res.status(403).json({ error: 'Vous ne pouvez approuver que les entrées de vos subordonnés' });
      }
    }

    await pool.execute(
      `UPDATE time_entries SET status = 'approved', validated_by = ?, validated_at = NOW() WHERE id = ?`,
      [req.user.id, id]
    );
    const [rows] = await pool.execute('SELECT * FROM time_entries WHERE id = ?', [id]);
    res.json(mapEntry(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/time-entries/:id/reject
router.put('/:id/reject', async (req, res) => {
  try {
    if (req.user.role === 'user') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM time_entries WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Entrée non trouvée' });

    const entry = existing[0];

    if (req.user.role === 'manager') {
      const [sub] = await pool.execute(
        'SELECT id FROM users WHERE id = ? AND manager_id = ?',
        [entry.user_id, req.user.id]
      );
      if (sub.length === 0) {
        return res.status(403).json({ error: 'Vous ne pouvez rejeter que les entrées de vos subordonnés' });
      }
    }

    await pool.execute(
      `UPDATE time_entries SET status = 'rejected', validated_by = ?, validated_at = NOW() WHERE id = ?`,
      [req.user.id, id]
    );
    const [rows] = await pool.execute('SELECT * FROM time_entries WHERE id = ?', [id]);
    res.json(mapEntry(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/time-entries/:id — delete own pending entry
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM time_entries WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Entrée non trouvée' });

    const entry = existing[0];
    if (entry.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    if (entry.status !== 'pending' && req.user.role !== 'admin') {
      return res.status(400).json({ error: 'Seules les entrées en attente peuvent être supprimées' });
    }

    await pool.execute('DELETE FROM time_entries WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
