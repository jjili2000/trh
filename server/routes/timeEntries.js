const express = require('express');
const crypto = require('crypto');
const pool = require('../db');

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
    validatedBy: row.validated_by || undefined,
    validatedAt: row.validated_at instanceof Date
      ? row.validated_at.toISOString()
      : row.validated_at || undefined,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at,
  };
}

// Returns true if userId is the manager of targetUserId
async function isManagerOf(managerId, targetUserId) {
  const [rows] = await pool.execute(
    'SELECT id FROM users WHERE id = ? AND manager_id = ?',
    [targetUserId, managerId]
  );
  return rows.length > 0;
}

// Returns true if userId has at least one subordinate (i.e. is someone's manager)
async function isAnyonesManager(userId) {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) as cnt FROM users WHERE manager_id = ?',
    [userId]
  );
  return rows[0].cnt > 0;
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
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries requis' });
    }
    if (entries.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 entrées' });
    }

    const createdIds = [];
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
    res.status(500).json({ error: 'Erreur serveur' });
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
  try {
    const { date, hours, activityTypeId, description, startTime, endTime } = req.body;
    if (!date || hours === undefined) {
      return res.status(400).json({ error: 'Date et heures requis' });
    }
    const id = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO time_entries (id, user_id, date, hours, activity_type_id, description, status, start_time, end_time)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [id, req.user.id, date, hours, activityTypeId || null, description || null, startTime || null, endTime || null]
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

// PUT /api/time-entries/:id/approve
router.put('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM time_entries WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Entrée non trouvée' });

    const entry = existing[0];

    if (req.user.role !== 'admin') {
      // Only the direct manager of this user can approve
      const managerOk = await isManagerOf(req.user.id, entry.user_id);
      if (!managerOk) {
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
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM time_entries WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Entrée non trouvée' });

    const entry = existing[0];

    if (req.user.role !== 'admin') {
      const managerOk = await isManagerOf(req.user.id, entry.user_id);
      if (!managerOk) {
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

// Vérifie si une entrée est protégée par une paie validée
// (la date de travail tombe dans une période de paie au statut 'validated')
async function isLockedByPayroll(entry) {
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
  console.log('[isLockedByPayroll] entryDate:', entryDate, '→ locked:', rows.length > 0);
  if (rows.length === 0) {
    const [allPeriods] = await pool.execute(
      `SELECT id, start_date, end_date, status FROM payroll_periods ORDER BY start_date DESC`
    );
    console.log('[isLockedByPayroll] périodes connues:', JSON.stringify(allPeriods));
  }
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

// GET /api/time-entries/payroll-debug — diagnostic temporaire (liste les périodes + saisies récentes)
router.get('/payroll-debug', async (req, res) => {
  try {
    const [periods] = await pool.execute(
      'SELECT id, start_date, end_date, status FROM payroll_periods ORDER BY start_date DESC'
    );
    const [entries] = await pool.execute(
      `SELECT te.id, te.user_id, te.date, te.status as entry_status,
              u.first_name, u.last_name
       FROM time_entries te
       JOIN users u ON u.id = te.user_id
       ORDER BY te.date DESC LIMIT 20`
    );
    res.json({ periods, recentEntries: entries });
  } catch (err) {
    res.status(500).json({ error: String(err) });
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
