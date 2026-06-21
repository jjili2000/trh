const express = require('express');
const pool = require('../db');

const router = express.Router();

function mapSettings(row) {
  return {
    clubName: row.club_name,
    calendarStartHour:    row.calendar_start_hour ?? 8,
    calendarEndHour:      row.calendar_end_hour   ?? 21,
    appUrl:               row.app_url || null,
    globalValidatorRole:  row.global_validator_role || null,
  };
}

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM app_settings WHERE id = 1');
    if (rows.length === 0) return res.json({ clubName: 'Tennis Club' });
    res.json(mapSettings(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/settings (admin only)
router.put('/', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { clubName, calendarStartHour, calendarEndHour, appUrl, globalValidatorRole } = req.body;
    if (!clubName) {
      return res.status(400).json({ error: 'Nom du club requis' });
    }
    const startH = (calendarStartHour !== undefined) ? Number(calendarStartHour) : null;
    const endH   = (calendarEndHour   !== undefined) ? Number(calendarEndHour)   : null;
    const url    = appUrl !== undefined ? (appUrl || null) : null;
    await pool.execute(
      `INSERT INTO app_settings (id, club_name, calendar_start_hour, calendar_end_hour, app_url)
       VALUES (1, ?, COALESCE(?, 8), COALESCE(?, 21), ?)
       ON DUPLICATE KEY UPDATE
         club_name = VALUES(club_name),
         calendar_start_hour = COALESCE(?, calendar_start_hour),
         calendar_end_hour   = COALESCE(?, calendar_end_hour),
         app_url = COALESCE(VALUES(app_url), app_url)`,
      [clubName, startH, endH, url, startH, endH]
    );
    if (globalValidatorRole !== undefined) {
      await pool.execute(
        'UPDATE app_settings SET global_validator_role = ? WHERE id = 1',
        [globalValidatorRole || null]
      );
    }
    const [rows] = await pool.execute('SELECT * FROM app_settings WHERE id = 1');
    res.json(mapSettings(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
