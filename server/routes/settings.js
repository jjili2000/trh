const express = require('express');
const pool = require('../db');

const router = express.Router();

function mapSettings(row) {
  return {
    clubName: row.club_name,
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
    const { clubName } = req.body;
    if (!clubName) {
      return res.status(400).json({ error: 'Nom du club requis' });
    }
    await pool.execute(
      'INSERT INTO app_settings (id, club_name) VALUES (1, ?) ON DUPLICATE KEY UPDATE club_name = ?',
      [clubName, clubName]
    );
    const [rows] = await pool.execute('SELECT * FROM app_settings WHERE id = 1');
    res.json(mapSettings(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
