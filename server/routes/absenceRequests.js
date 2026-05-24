const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { notify } = require('../services/notifications');

const router = express.Router();

function mapRequest(row) {
  const startStr = row.start_date instanceof Date
    ? row.start_date.toISOString().slice(0, 10)
    : String(row.start_date).slice(0, 10);
  const endStr = row.end_date instanceof Date
    ? row.end_date.toISOString().slice(0, 10)
    : String(row.end_date).slice(0, 10);

  // duration_days : valeur stockée ou fallback calculé depuis les dates
  let durationDays;
  if (row.duration_days != null) {
    durationDays = parseFloat(row.duration_days);
  } else {
    const s = new Date(startStr), e = new Date(endStr);
    durationDays = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
  }

  return {
    id: row.id,
    userId: row.user_id,
    startDate: startStr,
    endDate: endStr,
    durationDays,
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

async function isManagerOf(managerId, targetUserId) {
  const [rows] = await pool.execute(
    'SELECT id FROM users WHERE id = ? AND manager_id = ?',
    [targetUserId, managerId]
  );
  return rows.length > 0;
}

// GET /api/absence-requests
router.get('/', async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      [rows] = await pool.execute('SELECT * FROM absence_requests ORDER BY start_date DESC, created_at DESC');
    } else {
      // Own + subordinates
      [rows] = await pool.execute(
        `SELECT ar.* FROM absence_requests ar
         WHERE ar.user_id = ?
            OR ar.user_id IN (SELECT id FROM users WHERE manager_id = ?)
         ORDER BY ar.start_date DESC, ar.created_at DESC`,
        [req.user.id, req.user.id]
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
    const { startDate, endDate, durationDays, type, reason } = req.body;
    if (!startDate || !endDate || !type) {
      return res.status(400).json({ error: 'Dates et type requis' });
    }
    // Calcul fallback si durationDays non fourni
    const duration = durationDays != null
      ? parseFloat(durationDays)
      : (() => {
          const s = new Date(startDate), e = new Date(endDate);
          return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
        })();

    const id = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO absence_requests (id, user_id, start_date, end_date, duration_days, type, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, req.user.id, startDate, endDate, duration, type, reason || null]
    );
    const [rows] = await pool.execute('SELECT * FROM absence_requests WHERE id = ?', [id]);
    res.status(201).json(mapRequest(rows[0]));
    // Notifier le manager
    const [[submitter]] = await pool.execute('SELECT first_name, last_name, manager_id FROM users WHERE id = ?', [req.user.id]);
    if (submitter?.manager_id) {
      const startLabel = new Date(startDate + 'T12:00:00').toLocaleDateString('fr-FR');
      await notify(submitter.manager_id, 'absence_submitted', 'Absence à valider',
        `${submitter.first_name} ${submitter.last_name} a soumis une demande d'absence à partir du ${startLabel}.`,
        'absence_request', id);
    }
  } catch (err) {
    // Si la colonne n'existe pas encore (migration non jouée), fallback sans duration_days
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      try {
        const id = crypto.randomUUID();
        const { startDate, endDate, type, reason } = req.body;
        await pool.execute(
          `INSERT INTO absence_requests (id, user_id, start_date, end_date, type, reason, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
          [id, req.user.id, startDate, endDate, type, reason || null]
        );
        const [rows] = await pool.execute('SELECT * FROM absence_requests WHERE id = ?', [id]);
        return res.status(201).json(mapRequest(rows[0]));
      } catch (e2) {
        console.error(e2);
        return res.status(500).json({ error: 'Erreur serveur' });
      }
    }
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

    const { startDate, endDate, durationDays, type, reason } = req.body;
    const updates = [];
    const values = [];
    if (startDate !== undefined)     { updates.push('start_date = ?');    values.push(startDate); }
    if (endDate !== undefined)       { updates.push('end_date = ?');      values.push(endDate); }
    if (durationDays !== undefined)  { updates.push('duration_days = ?'); values.push(parseFloat(durationDays)); }
    if (type !== undefined)          { updates.push('type = ?');          values.push(type); }
    if (reason !== undefined)        { updates.push('reason = ?');        values.push(reason || null); }

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
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM absence_requests WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Demande non trouvée' });

    const record = existing[0];

    if (req.user.role !== 'admin') {
      const managerOk = await isManagerOf(req.user.id, record.user_id);
      if (!managerOk) {
        return res.status(403).json({ error: 'Vous ne pouvez approuver que les demandes de vos subordonnés' });
      }
    }

    await pool.execute(
      `UPDATE absence_requests SET status = 'approved', validated_by = ?, validated_at = NOW() WHERE id = ?`,
      [req.user.id, id]
    );
    const [rows] = await pool.execute('SELECT * FROM absence_requests WHERE id = ?', [id]);
    res.json(mapRequest(rows[0]));
    const [[validator]] = await pool.execute('SELECT first_name, last_name FROM users WHERE id = ?', [req.user.id]);
    const vName = validator ? `${validator.first_name} ${validator.last_name}` : 'Votre responsable';
    const startLabel = new Date(String(record.start_date).slice(0,10) + 'T12:00:00').toLocaleDateString('fr-FR');
    await notify(record.user_id, 'absence_approved', 'Absence approuvée',
      `Votre demande d'absence du ${startLabel} a été approuvée par ${vName}.`,
      'absence_request', id);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/absence-requests/:id/reject
router.put('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM absence_requests WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Demande non trouvée' });

    const record = existing[0];

    if (req.user.role !== 'admin') {
      const managerOk = await isManagerOf(req.user.id, record.user_id);
      if (!managerOk) {
        return res.status(403).json({ error: 'Vous ne pouvez rejeter que les demandes de vos subordonnés' });
      }
    }

    await pool.execute(
      `UPDATE absence_requests SET status = 'rejected', validated_by = ?, validated_at = NOW() WHERE id = ?`,
      [req.user.id, id]
    );
    const [rows] = await pool.execute('SELECT * FROM absence_requests WHERE id = ?', [id]);
    res.json(mapRequest(rows[0]));
    const [[validator]] = await pool.execute('SELECT first_name, last_name FROM users WHERE id = ?', [req.user.id]);
    const vName = validator ? `${validator.first_name} ${validator.last_name}` : 'Votre responsable';
    const startLabel = new Date(String(record.start_date).slice(0,10) + 'T12:00:00').toLocaleDateString('fr-FR');
    await notify(record.user_id, 'absence_rejected', 'Absence refusée',
      `Votre demande d'absence du ${startLabel} a été refusée par ${vName}.`,
      'absence_request', id);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
