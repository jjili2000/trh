const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

const router = express.Router();

const checkAM = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  next();
};

// ─── Mappers ──────────────────────────────────────────────────────────────────

function fmtDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().substring(0, 10);
  return String(v).substring(0, 10);
}

function mapSeason(r) {
  return { id: r.id, name: r.name, startDate: fmtDate(r.start_date), endDate: fmtDate(r.end_date), status: r.status, createdAt: r.created_at };
}

function mapTW(r) {
  return { id: r.id, seasonId: r.season_id, label: r.label, createdAt: r.created_at };
}

function mapCourse(r) {
  return {
    id: r.id, templateWeekId: r.template_week_id, label: r.label,
    dayOfWeek: r.day_of_week,
    startTime: String(r.start_time).substring(0, 5),
    endTime:   String(r.end_time).substring(0, 5),
    teacherId: r.teacher_id || null, createdAt: r.created_at,
  };
}

async function twWithCourses(twId) {
  const [rows] = await pool.execute('SELECT * FROM template_weeks WHERE id = ?', [twId]);
  if (!rows.length) return null;
  const [courses] = await pool.execute(
    'SELECT * FROM template_courses WHERE template_week_id = ? ORDER BY day_of_week, start_time', [twId]
  );
  return { ...mapTW(rows[0]), courses: courses.map(mapCourse) };
}

function generateSeasonWeeks(startDate, endDate) {
  const weeks = [];
  const d = new Date(startDate + 'T00:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  const end = new Date(endDate + 'T00:00:00');
  while (d <= end) { weeks.push(new Date(d)); d.setDate(d.getDate() + 7); }
  return weeks;
}

// ─── Seasons ──────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM seasons WHERE status != 'deleted' ORDER BY start_date DESC");
    res.json(rows.map(mapSeason));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', checkAM, async (req, res) => {
  try {
    const { name, startDate, endDate } = req.body;
    if (!name || !startDate || !endDate) return res.status(400).json({ error: 'Champs requis manquants' });
    const id = uuidv4();
    await pool.execute('INSERT INTO seasons (id, name, start_date, end_date) VALUES (?, ?, ?, ?)', [id, name, startDate, endDate]);
    const [rows] = await pool.execute('SELECT * FROM seasons WHERE id = ?', [id]);
    res.status(201).json(mapSeason(rows[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM seasons WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Saison non trouvée' });
    res.json(mapSeason(rows[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:id', checkAM, async (req, res) => {
  try {
    const { name, startDate, endDate, status } = req.body;
    const upd = []; const vals = [];
    if (name      !== undefined) { upd.push('name = ?');       vals.push(name); }
    if (startDate !== undefined) { upd.push('start_date = ?'); vals.push(startDate); }
    if (endDate   !== undefined) { upd.push('end_date = ?');   vals.push(endDate); }
    if (status    !== undefined) { upd.push('status = ?');     vals.push(status); }
    if (!upd.length) return res.status(400).json({ error: 'Rien à mettre à jour' });
    vals.push(req.params.id);
    await pool.execute(`UPDATE seasons SET ${upd.join(', ')} WHERE id = ?`, vals);
    const [rows] = await pool.execute('SELECT * FROM seasons WHERE id = ?', [req.params.id]);
    res.json(mapSeason(rows[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Template Weeks ───────────────────────────────────────────────────────────

router.get('/:seasonId/template-weeks', async (req, res) => {
  try {
    const [weeks] = await pool.execute(
      'SELECT * FROM template_weeks WHERE season_id = ? ORDER BY label', [req.params.seasonId]
    );
    const result = await Promise.all(weeks.map(w => twWithCourses(w.id)));
    res.json(result.filter(Boolean));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/:seasonId/template-weeks', checkAM, async (req, res) => {
  try {
    const { label } = req.body;
    if (!label) return res.status(400).json({ error: 'Libellé requis' });
    const id = uuidv4();
    await pool.execute('INSERT INTO template_weeks (id, season_id, label) VALUES (?, ?, ?)', [id, req.params.seasonId, label]);
    res.status(201).json(await twWithCourses(id));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Copy template week from any season — must be before /:twId routes
router.post('/:seasonId/template-weeks/copy', checkAM, async (req, res) => {
  try {
    const { sourceTemplateWeekId } = req.body;
    if (!sourceTemplateWeekId) return res.status(400).json({ error: 'sourceTemplateWeekId requis' });
    const [srcRows] = await pool.execute('SELECT * FROM template_weeks WHERE id = ?', [sourceTemplateWeekId]);
    if (!srcRows.length) return res.status(404).json({ error: 'Semaine type source non trouvée' });
    const newId = uuidv4();
    await pool.execute(
      'INSERT INTO template_weeks (id, season_id, label) VALUES (?, ?, ?)',
      [newId, req.params.seasonId, srcRows[0].label + ' (copie)']
    );
    const [srcCourses] = await pool.execute(
      'SELECT * FROM template_courses WHERE template_week_id = ?', [sourceTemplateWeekId]
    );
    for (const c of srcCourses) {
      await pool.execute(
        'INSERT INTO template_courses (id, template_week_id, label, day_of_week, start_time, end_time, teacher_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuidv4(), newId, c.label, c.day_of_week, c.start_time, c.end_time, c.teacher_id]
      );
    }
    res.status(201).json(await twWithCourses(newId));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:seasonId/template-weeks/:twId', checkAM, async (req, res) => {
  try {
    const { label } = req.body;
    if (!label) return res.status(400).json({ error: 'Libellé requis' });
    await pool.execute('UPDATE template_weeks SET label = ? WHERE id = ?', [label, req.params.twId]);
    res.json(await twWithCourses(req.params.twId));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:seasonId/template-weeks/:twId', checkAM, async (req, res) => {
  try {
    await pool.execute('DELETE FROM template_weeks WHERE id = ?', [req.params.twId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Courses ──────────────────────────────────────────────────────────────────

router.post('/:seasonId/template-weeks/:twId/courses', checkAM, async (req, res) => {
  try {
    const { label, dayOfWeek, startTime, endTime, teacherId } = req.body;
    if (!label || !dayOfWeek || !startTime || !endTime) return res.status(400).json({ error: 'Champs requis manquants' });
    const id = uuidv4();
    await pool.execute(
      'INSERT INTO template_courses (id, template_week_id, label, day_of_week, start_time, end_time, teacher_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, req.params.twId, label, dayOfWeek, startTime, endTime, teacherId || null]
    );
    const [rows] = await pool.execute('SELECT * FROM template_courses WHERE id = ?', [id]);
    res.status(201).json(mapCourse(rows[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:seasonId/template-weeks/:twId/courses/:cId', checkAM, async (req, res) => {
  try {
    const { label, dayOfWeek, startTime, endTime, teacherId } = req.body;
    const upd = []; const vals = [];
    if (label     !== undefined) { upd.push('label = ?');       vals.push(label); }
    if (dayOfWeek !== undefined) { upd.push('day_of_week = ?'); vals.push(dayOfWeek); }
    if (startTime !== undefined) { upd.push('start_time = ?');  vals.push(startTime); }
    if (endTime   !== undefined) { upd.push('end_time = ?');    vals.push(endTime); }
    if (teacherId !== undefined) { upd.push('teacher_id = ?');  vals.push(teacherId || null); }
    if (!upd.length) return res.status(400).json({ error: 'Rien à mettre à jour' });
    vals.push(req.params.cId);
    await pool.execute(`UPDATE template_courses SET ${upd.join(', ')} WHERE id = ?`, vals);
    const [rows] = await pool.execute('SELECT * FROM template_courses WHERE id = ?', [req.params.cId]);
    res.json(mapCourse(rows[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:seasonId/template-weeks/:twId/courses/:cId', checkAM, async (req, res) => {
  try {
    await pool.execute('DELETE FROM template_courses WHERE id = ?', [req.params.cId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Assignments ──────────────────────────────────────────────────────────────

router.get('/:seasonId/assignments', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM season_week_assignments WHERE season_id = ? ORDER BY week_start_date',
      [req.params.seasonId]
    );
    res.json(rows.map(r => ({
      id: r.id, seasonId: r.season_id, templateWeekId: r.template_week_id,
      weekStartDate: fmtDate(r.week_start_date),
    })));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Upsert or delete a single week assignment
router.put('/:seasonId/assignments', checkAM, async (req, res) => {
  try {
    const { weekStartDate, templateWeekId } = req.body;
    if (!weekStartDate) return res.status(400).json({ error: 'weekStartDate requis' });
    if (!templateWeekId) {
      await pool.execute(
        'DELETE FROM season_week_assignments WHERE season_id = ? AND week_start_date = ?',
        [req.params.seasonId, weekStartDate]
      );
      return res.json({ success: true, removed: true });
    }
    const id = uuidv4();
    await pool.execute(
      `INSERT INTO season_week_assignments (id, season_id, template_week_id, week_start_date)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE template_week_id = ?`,
      [id, req.params.seasonId, templateWeekId, weekStartDate, templateWeekId]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Apply Zone C holiday rule
router.post('/:seasonId/assignments/apply-rule', checkAM, async (req, res) => {
  try {
    const { templateWeekId, holidays } = req.body;
    if (!templateWeekId || !Array.isArray(holidays)) {
      return res.status(400).json({ error: 'templateWeekId et holidays requis' });
    }
    const [seasons] = await pool.execute('SELECT * FROM seasons WHERE id = ?', [req.params.seasonId]);
    if (!seasons.length) return res.status(404).json({ error: 'Saison non trouvée' });
    const s = seasons[0];
    const weeks = generateSeasonWeeks(fmtDate(s.start_date), fmtDate(s.end_date));
    let count = 0;
    for (const weekStart of weeks) {
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
      const isHoliday = holidays.some(h => {
        const hs = new Date(h.startDate + 'T00:00:00');
        const he = new Date(h.endDate + 'T00:00:00');
        return weekStart <= he && weekEnd >= hs;
      });
      if (!isHoliday) {
        const ws = weekStart.toISOString().substring(0, 10);
        await pool.execute(
          `INSERT INTO season_week_assignments (id, season_id, template_week_id, week_start_date)
           VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE template_week_id = ?`,
          [uuidv4(), req.params.seasonId, templateWeekId, ws, templateWeekId]
        );
        count++;
      }
    }
    res.json({ success: true, assignedWeeks: count });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
