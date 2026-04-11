const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

const router = express.Router();

function mapRequest(row) {
  return {
    id: row.id,
    userId: row.user_id,
    startDate: row.start_date instanceof Date
      ? row.start_date.toISOString().slice(0, 10)
      : String(row.start_date).slice(0, 10),
    endDate: row.end_date instanceof Date
      ? row.end_date.toISOString().slice(0, 10)
      : String(row.end_date).slice(0, 10),
    type: row.type,
    reason: row.reason || undefined,
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

// GET /api/absence-requests
router.get('/', async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      [rows] = await pool.execute('SELECT * FROM absence_requests ORDER BY start_date DESC, created_at DESC');
    } else if (req.user.role === 'manager') {
      [rows] = await pool.execute(
        `SELECT ar.* FROM absence_requests ar
         WHERE ar.user_id = ?
            OR ar.user_id IN (SELECT id FROM users WHERE manager_id = ?)
         ORDER BY ar.start_date DESC, ar.created_at DESC`,
        [req.user.id, req.user.id]
      );
    } else {
      [rows] = await pool.execute(
        'SELECT * FROM absence_requests WHERE user_id = ? ORDER BY start_date DESC, created_at DESC',
        [req.user.id]
      );
    }
    res.json(rows.map(mapRequest));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/absence-requests
router.post('/', async (req, res) => {
  try {
    const { startDate, endDate, type, reason } = req.body;
    if (!startDate || !endDate || !type) {
      return res.status(400).json({ error: 'Dates et type requis' });
    }
    const id = uuidv4();
    await pool.execute(
      `INSERT INTO absence_requests (id, user_id, start_date, end_date, type, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [id, req.user.id, startDate, endDate, type, reason || null]
    );
    const [rows] = await pool.execute('SELECT * FROM absence_requests WHERE id = ?', [id]);
    res.status(201).json(mapRequest(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/absence-requests/:id — update own pending request
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM absence_requests WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Demande non trouvée' });

    const record = existing[0];
    if (record.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    if (record.status !== 'pending') {
      return res.status(400).json({ error: 'Seules les demandes en attente peuvent être modifiées' });
    }

    const { startDate, endDate, type, reason } = req.body;
    const updates = [];
    const values = [];
    if (startDate !== undefined) { updates.push('start_date = ?'); values.push(startDate); }
    if (endDate !== undefined) { updates.push('end_date = ?'); values.push(endDate); }
    if (type !== undefined) { updates.push('type = ?'); values.push(type); }
    if (reason !== undefined) { updates.push('reason = ?'); values.push(reason || null); }

    if (updates.length > 0) {
      values.push(id);
      await pool.execute(`UPDATE absence_requests SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    const [rows] = await pool.execute('SELECT * FROM absence_requests WHERE id = ?', [id]);
    res.json(mapRequest(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/absence-requests/:id/approve
router.put('/:id/approve', async (req, res) => {
  try {
    if (req.user.role === 'user') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM absence_requests WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Demande non trouvée' });

    const record = existing[0];
    if (req.user.role === 'manager') {
      const [sub] = await pool.execute(
        'SELECT id FROM users WHERE id = ? AND manager_id = ?',
        [record.user_id, req.user.id]
      );
      if (sub.length === 0) {
        return res.status(403).json({ error: 'Vous ne pouvez approuver que les demandes de vos subordonnés' });
      }
    }

    await pool.execute(
      `UPDATE absence_requests SET status = 'approved', validated_by = ?, validated_at = NOW() WHERE id = ?`,
      [req.user.id, id]
    );
    const [rows] = await pool.execute('SELECT * FROM absence_requests WHERE id = ?', [id]);
    res.json(mapRequest(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/absence-requests/:id/reject
router.put('/:id/reject', async (req, res) => {
  try {
    if (req.user.role === 'user') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM absence_requests WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Demande non trouvée' });

    const record = existing[0];
    if (req.user.role === 'manager') {
      const [sub] = await pool.execute(
        'SELECT id FROM users WHERE id = ? AND manager_id = ?',
        [record.user_id, req.user.id]
      );
      if (sub.length === 0) {
        return res.status(403).json({ error: 'Vous ne pouvez rejeter que les demandes de vos subordonnés' });
      }
    }

    await pool.execute(
      `UPDATE absence_requests SET status = 'rejected', validated_by = ?, validated_at = NOW() WHERE id = ?`,
      [req.user.id, id]
    );
    const [rows] = await pool.execute('SELECT * FROM absence_requests WHERE id = ?', [id]);
    res.json(mapRequest(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
