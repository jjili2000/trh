const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { notify } = require('../services/notifications');
const { findValidator, isDesignatedValidator } = require('../services/validatorFinder');

const router = express.Router();

function fmtTime(t) {
  if (!t) return undefined;
  if (t instanceof Date) return t.toTimeString().slice(0, 5); // "HH:MM"
  return String(t).slice(0, 5); // "HH:MM:SS" → "HH:MM"
}

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
    startTime: fmtTime(row.start_time),
    endTime:   fmtTime(row.end_time),
    status: row.status,
    rejectionReason: row.rejection_reason || null,
    validatedBy: row.validated_by || undefined,
    validatedAt: row.validated_at instanceof Date
      ? row.validated_at.toISOString()
      : row.validated_at || undefined,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at,
  };
}


// GET /api/time-entries/calendar-suggestions
router.get('/calendar-suggestions', async (req, res) => {
  try {
    // On récupère toutes les dates planifiées jusqu'à aujourd'hui (saisons publiées/clôturées).
    // Pas de borne inférieure arbitraire : c'est existingDates qui filtre les jours déjà saisis.
    // Borne inférieure : date de la dernière saisie issue du calendrier pour cet utilisateur.
    // Les saisies manuelles (source IS NULL) sont ignorées pour ce calcul.
    const [lastCalRows] = await pool.execute(
      `SELECT MAX(date) AS last_cal_date
       FROM time_entries
       WHERE user_id = ? AND source = 'calendar'`,
      [req.user.id]
    );
    const lastCalDate = lastCalRows[0]?.last_cal_date
      ? (lastCalRows[0].last_cal_date instanceof Date
          ? lastCalRows[0].last_cal_date.toISOString().slice(0, 10)
          : String(lastCalRows[0].last_cal_date).slice(0, 10))
      : null;

    const [rows] = await pool.execute(
      `SELECT
         DATE_ADD(swa.week_start_date, INTERVAL (tc.day_of_week - 1) DAY) AS actual_date,
         tc.label,
         tc.start_time,
         tc.end_time,
         tc.course_type
       FROM season_week_assignments swa
       JOIN template_courses tc ON tc.template_week_id = swa.template_week_id
       JOIN seasons s ON s.id = swa.season_id
       WHERE tc.teacher_id = ?
         AND s.status IN ('published', 'closed')
         AND DATE_ADD(swa.week_start_date, INTERVAL (tc.day_of_week - 1) DAY) <= CURDATE()
         ${lastCalDate ? 'AND DATE_ADD(swa.week_start_date, INTERVAL (tc.day_of_week - 1) DAY) > ?' : ''}
       ORDER BY actual_date ASC`,
      lastCalDate ? [req.user.id, lastCalDate] : [req.user.id]
    );

    // Get dates that already have time entries for this user (toutes origines confondues)
    const [existingEntryRows] = await pool.execute(
      'SELECT DISTINCT date FROM time_entries WHERE user_id = ?',
      [req.user.id]
    );
    const existingDates = new Set(
      existingEntryRows.map(r =>
        r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10)
      )
    );

    // Group by date
    const byDate = new Map();
    for (const row of rows) {
      const dateStr = row.actual_date instanceof Date
        ? row.actual_date.toISOString().slice(0, 10)
        : String(row.actual_date).slice(0, 10);

      if (existingDates.has(dateStr)) continue;

      if (!byDate.has(dateStr)) {
        byDate.set(dateStr, { date: dateStr, courses: [] });
      }
      byDate.get(dateStr).courses.push({
        label: row.label,
        startTime: row.start_time,
        endTime: row.end_time,
        courseType: row.course_type || null,
      });
    }

    // Build response
    const parseMinutes = (timeStr) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    const result = [];
    for (const [dateStr, entry] of byDate) {
      const totalHours = entry.courses.reduce((sum, c) => {
        return sum + (parseMinutes(c.endTime) - parseMinutes(c.startTime)) / 60;
      }, 0);

      const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      const dayLabel = label.charAt(0).toUpperCase() + label.slice(1);

      // courseType dominant du jour : le premier non-null (les cours d'une même journée
      // ont généralement le même type ; sinon on laisse l'utilisateur choisir)
      const dominantCourseType = (entry.courses.find(c => c.courseType)?.courseType) || null;

      result.push({
        date: dateStr,
        dayLabel,
        courses: entry.courses.map(c => ({ label: c.label, startTime: c.startTime, endTime: c.endTime, courseType: c.courseType || null })),
        totalHours,
        courseType: dominantCourseType,
      });
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/time-entries/bulk
router.post('/bulk', async (req, res) => {
  const createdIds = [];
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries requis' });
    }
    if (entries.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 entrées' });
    }

    for (const entry of entries) {
      const { date, hours, activityTypeId, description } = entry;
      if (!date || hours === undefined) {
        return res.status(400).json({ error: 'Date et heures requis pour chaque entrée' });
      }
      const id = crypto.randomUUID();
      await pool.execute(
        `INSERT INTO time_entries (id, user_id, date, hours, activity_type_id, description, status, source)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 'calendar')`,
        [id, req.user.id, date, hours, activityTypeId || null, description || null]
      );
      createdIds.push(id);
    }

    const placeholders = createdIds.map(() => '?').join(', ');
    const [rows] = await pool.execute(
      `SELECT * FROM time_entries WHERE id IN (${placeholders})`,
      createdIds
    );
    res.status(201).json(rows.map(mapEntry));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
    return;
  }

  // Notifier le valideur désigné — une seule notification groupée
  try {
    const [[user]] = await pool.execute('SELECT first_name FROM users WHERE id = ?', [req.user.id]);
    const validatorId = await findValidator(req.user.id, 'time');
    if (user && validatorId) {
      const n = createdIds.length;
      await notify(
        validatorId,
        'time_entry_submitted',
        'Heures à valider',
        `${user.first_name} a soumis ${n} saisie${n > 1 ? 's' : ''} d'heures.`,
        'time_entry',
        null,
        'time',
        'action'
      );
    }
  } catch (notifErr) {
    console.error('[time-entries bulk POST] notification error:', notifErr.message);
  }
});

// GET /api/time-entries
router.get('/', async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      [rows] = await pool.execute('SELECT * FROM time_entries ORDER BY date DESC, created_at DESC');
    } else {
      // Own entries + entries of subordinates (works whether role is manager or user)
      [rows] = await pool.execute(
        `SELECT te.* FROM time_entries te
         WHERE te.user_id = ?
            OR te.user_id IN (SELECT id FROM users WHERE manager_id = ?)
         ORDER BY te.date DESC, te.created_at DESC`,
        [req.user.id, req.user.id]
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
  let id, date;
  try {
    ({ date } = req.body);
    const { hours, activityTypeId, description, startTime, endTime } = req.body;
    if (!date || hours === undefined) {
      return res.status(400).json({ error: 'Date et heures requis' });
    }
    id = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO time_entries (id, user_id, date, hours, activity_type_id, description, status, start_time, end_time)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [id, req.user.id, date, hours, activityTypeId || null, description || null, startTime || null, endTime || null]
    );
    const [rows] = await pool.execute('SELECT * FROM time_entries WHERE id = ?', [id]);
    res.status(201).json(mapEntry(rows[0]));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
    return;
  }

  // Notifier le valideur désigné
  try {
    const [[user]] = await pool.execute('SELECT first_name FROM users WHERE id = ?', [req.user.id]);
    const validatorId = await findValidator(req.user.id, 'time');
    if (user && validatorId) {
      const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      await notify(
        validatorId,
        'time_entry_submitted',
        'Heures à valider',
        `${user.first_name} a soumis une saisie d'heures pour le ${dateLabel}.`,
        'time_entry',
        id,
        'time',
        'action'
      );
    }
  } catch (notifErr) {
    console.error('[time-entries POST] notification error:', notifErr.message);
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

    const { date, hours, activityTypeId, description, startTime, endTime } = req.body;
    const updates = [];
    const values = [];
    if (date !== undefined)           { updates.push('date = ?');             values.push(date); }
    if (hours !== undefined)          { updates.push('hours = ?');            values.push(hours); }
    if (activityTypeId !== undefined) { updates.push('activity_type_id = ?'); values.push(activityTypeId || null); }
    if (description !== undefined)    { updates.push('description = ?');      values.push(description || null); }
    if (startTime !== undefined)      { updates.push('start_time = ?');       values.push(startTime || null); }
    if (endTime !== undefined)        { updates.push('end_time = ?');         values.push(endTime || null); }

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

// PUT /api/time-entries/bulk/approve — approbation groupée (1 notif par utilisateur)
router.put('/bulk/approve', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids requis' });
  }

  let approved = [];
  try {
    // Récupérer toutes les entrées concernées
    const placeholders = ids.map(() => '?').join(', ');
    const [existing] = await pool.execute(
      `SELECT * FROM time_entries WHERE id IN (${placeholders})`, ids
    );

    // Vérifier droits sur chacune
    for (const entry of existing) {
      if (req.user.role !== 'admin') {
        const ok = await isDesignatedValidator(req.user.id, entry.user_id, 'time');
        if (!ok) return res.status(403).json({ error: 'Accès refusé sur certaines entrées' });
      }
    }

    // Mise à jour batch
    await pool.execute(
      `UPDATE time_entries SET status = 'approved', validated_by = ?, validated_at = NOW() WHERE id IN (${placeholders})`,
      [req.user.id, ...ids]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM time_entries WHERE id IN (${placeholders})`, ids
    );
    approved = rows;
    res.json(rows.map(mapEntry));
  } catch (err) {
    console.error('[time-entries bulk approve]', err);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
    return;
  }

  // Une seule notification par utilisateur concerné
  try {
    const [[validator]] = await pool.execute('SELECT first_name FROM users WHERE id = ?', [req.user.id]);
    const validatorName = validator?.first_name ?? 'Votre responsable';

    // Regrouper par user_id
    const byUser = {};
    for (const e of approved) {
      if (!byUser[e.user_id]) byUser[e.user_id] = [];
      byUser[e.user_id].push(e);
    }

    for (const [userId, entries] of Object.entries(byUser)) {
      const n = entries.length;
      const body = n === 1
        ? (() => {
            const d = entries[0].date instanceof Date ? entries[0].date.toISOString().slice(0, 10) : String(entries[0].date).slice(0, 10);
            const label = new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            return `Votre saisie du ${label} a été validée par ${validatorName}.`;
          })()
        : `${n} saisies d'heures ont été validées par ${validatorName}.`;
      await notify(userId, 'time_entry_approved', 'Saisies d\'heures validées', body, 'time_entry', null, 'time', 'response');
    }
  } catch (notifErr) {
    console.error('[time-entries bulk approve] notification error:', notifErr.message);
  }
});

// PUT /api/time-entries/bulk/reject — rejet groupé (1 notif par utilisateur)
router.put('/bulk/reject', async (req, res) => {
  const { ids, rejectionReason } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids requis' });
  }

  let rejected = [];
  try {
    const placeholders = ids.map(() => '?').join(', ');
    const [existing] = await pool.execute(
      `SELECT * FROM time_entries WHERE id IN (${placeholders})`, ids
    );

    for (const entry of existing) {
      if (req.user.role !== 'admin') {
        const ok = await isDesignatedValidator(req.user.id, entry.user_id, 'time');
        if (!ok) return res.status(403).json({ error: 'Accès refusé sur certaines entrées' });
      }
    }

    await pool.execute(
      `UPDATE time_entries SET status = 'rejected', rejection_reason = ?, validated_by = ?, validated_at = NOW() WHERE id IN (${placeholders})`,
      [rejectionReason || null, req.user.id, ...ids]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM time_entries WHERE id IN (${placeholders})`, ids
    );
    rejected = rows;
    res.json(rows.map(mapEntry));
  } catch (err) {
    console.error('[time-entries bulk reject]', err);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
    return;
  }

  // Une seule notification par utilisateur concerné
  try {
    const [[validator]] = await pool.execute('SELECT first_name FROM users WHERE id = ?', [req.user.id]);
    const validatorName = validator?.first_name ?? 'Votre responsable';

    const byUser = {};
    for (const e of rejected) {
      if (!byUser[e.user_id]) byUser[e.user_id] = [];
      byUser[e.user_id].push(e);
    }

    for (const [userId, entries] of Object.entries(byUser)) {
      const n = entries.length;
      const motif = rejectionReason ? ` Motif : ${rejectionReason}` : '';
      const body = n === 1
        ? (() => {
            const d = entries[0].date instanceof Date ? entries[0].date.toISOString().slice(0, 10) : String(entries[0].date).slice(0, 10);
            const label = new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            return `Votre saisie du ${label} a été rejetée par ${validatorName}.${motif}`;
          })()
        : `${n} saisies d'heures ont été rejetées par ${validatorName}.${motif}`;
      await notify(userId, 'time_entry_rejected', 'Saisies d\'heures rejetées', body, 'time_entry', null, 'time', 'response');
    }
  } catch (notifErr) {
    console.error('[time-entries bulk reject] notification error:', notifErr.message);
  }
});

// PUT /api/time-entries/:id/approve
router.put('/:id/approve', async (req, res) => {
  let entry, entryId;
  try {
    entryId = req.params.id;
    const [existing] = await pool.execute('SELECT * FROM time_entries WHERE id = ?', [entryId]);
    if (existing.length === 0) return res.status(404).json({ error: 'Entrée non trouvée' });

    entry = existing[0];

    if (req.user.role !== 'admin') {
      const managerOk = await isDesignatedValidator(req.user.id, entry.user_id, 'time');
      if (!managerOk) {
        return res.status(403).json({ error: 'Vous ne pouvez approuver que les entrées de vos subordonnés' });
      }
    }

    await pool.execute(
      `UPDATE time_entries SET status = 'approved', validated_by = ?, validated_at = NOW() WHERE id = ?`,
      [req.user.id, entryId]
    );
    const [rows] = await pool.execute('SELECT * FROM time_entries WHERE id = ?', [entryId]);
    res.json(mapEntry(rows[0]));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
    return;
  }

  // Notifier l'employé
  try {
    const [[validator]] = await pool.execute('SELECT first_name, last_name FROM users WHERE id = ?', [req.user.id]);
    const validatorName = validator ? validator.first_name : 'Votre responsable';
    const entryDate = (entry.date instanceof Date ? entry.date.toISOString().slice(0, 10) : String(entry.date).slice(0, 10));
    const dateLabel = new Date(entryDate + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    await notify(
      entry.user_id,
      'time_entry_approved',
      'Saisie d\'heures validée',
      `Votre saisie du ${dateLabel} a été validée par ${validatorName}.`,
      'time_entry',
      entryId,
      'time',
      'response'
    );
  } catch (notifErr) {
    console.error('[time-entries approve] notification error:', notifErr.message);
  }
});

// PUT /api/time-entries/:id/reject
router.put('/:id/reject', async (req, res) => {
  let entry, entryId, rejectionReason;
  try {
    entryId = req.params.id;
    const [existing] = await pool.execute('SELECT * FROM time_entries WHERE id = ?', [entryId]);
    if (existing.length === 0) return res.status(404).json({ error: 'Entrée non trouvée' });

    entry = existing[0];

    if (req.user.role !== 'admin') {
      const managerOk = await isDesignatedValidator(req.user.id, entry.user_id, 'time');
      if (!managerOk) {
        return res.status(403).json({ error: 'Vous ne pouvez rejeter que les entrées de vos subordonnés' });
      }
    }

    ({ rejectionReason } = req.body);
    await pool.execute(
      `UPDATE time_entries SET status = 'rejected', rejection_reason = ?, validated_by = ?, validated_at = NOW() WHERE id = ?`,
      [rejectionReason || null, req.user.id, entryId]
    );
    const [rows] = await pool.execute('SELECT * FROM time_entries WHERE id = ?', [entryId]);
    res.json(mapEntry(rows[0]));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
    return;
  }

  // Notifier l'employé
  try {
    const [[validator]] = await pool.execute('SELECT first_name, last_name FROM users WHERE id = ?', [req.user.id]);
    const validatorName = validator ? validator.first_name : 'Votre responsable';
    const entryDate = (entry.date instanceof Date ? entry.date.toISOString().slice(0, 10) : String(entry.date).slice(0, 10));
    const dateLabel = new Date(entryDate + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const notifBody = rejectionReason
      ? `Votre saisie du ${dateLabel} a été rejetée par ${validatorName}. Motif : ${rejectionReason}`
      : `Votre saisie du ${dateLabel} a été rejetée par ${validatorName}.`;
    await notify(
      entry.user_id,
      'time_entry_rejected',
      'Saisie d\'heures rejetée',
      notifBody,
      'time_entry',
      entryId,
      'time',
      'response'
    );
  } catch (notifErr) {
    console.error('[time-entries reject] notification error:', notifErr.message);
  }
});

// Vérifie si une entrée est protégée par une paie validée
// (la date de travail tombe dans une période de paie au statut 'validated')
async function isLockedByPayroll(entry) {
  // Chemin rapide : statut 'paid' signifie déjà intégré dans une paie validée
  if (entry.status === 'paid') return true;
  // Fallback : vérifier si la date tombe dans une période validée
  const entryDate = entry.date instanceof Date
    ? entry.date.toISOString().slice(0, 10)
    : String(entry.date).slice(0, 10);
  const [rows] = await pool.execute(
    `SELECT id FROM payroll_periods
     WHERE status = 'validated'
       AND ? BETWEEN start_date AND end_date
     LIMIT 1`,
    [entryDate]
  );
  return rows.length > 0;
}

// DELETE /api/time-entries/bulk — suppression multiple (DOIT être avant /:id)
router.delete('/bulk', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids (array) requis' });
    }

    const placeholders = ids.map(() => '?').join(', ');
    const [entries] = await pool.execute(
      `SELECT * FROM time_entries WHERE id IN (${placeholders})`,
      ids
    );

    const locked = [];
    const deletable = [];
    for (const entry of entries) {
      if (entry.user_id !== req.user.id && req.user.role !== 'admin') continue; // skip unauthorized
      if (await isLockedByPayroll(entry)) {
        locked.push(entry.id);
      } else {
        deletable.push(entry.id);
      }
    }

    if (deletable.length > 0) {
      const ph = deletable.map(() => '?').join(', ');
      await pool.execute(`DELETE FROM time_entries WHERE id IN (${ph})`, deletable);
    }

    res.json({
      deleted: deletable.length,
      locked: locked.length,
      lockedIds: locked,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


// DELETE /api/time-entries/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM time_entries WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Entrée non trouvée' });

    const entry = existing[0];
    if (entry.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    if (await isLockedByPayroll(entry)) {
      return res.status(400).json({ error: 'Cette saisie a été prise en compte dans une paie validée et ne peut pas être supprimée.' });
    }

    await pool.execute('DELETE FROM time_entries WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
