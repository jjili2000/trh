const express = require('express');
const crypto = require('crypto');
const pool = require('../db');

const router = express.Router();

// GET /api/validation-config
// Returns { budget: { mode, positions }, expenses: { mode, positions } }
router.get('/', async (req, res) => {
  try {
    const [cfgRows] = await pool.execute('SELECT * FROM validation_config');
    const [posRows] = await pool.execute('SELECT * FROM validation_config_positions');

    const result = {
      budget:   { mode: 'OR', positions: [] },
      expenses: { mode: 'OR', positions: [] },
    };

    for (const row of cfgRows) {
      if (result[row.config_type]) {
        result[row.config_type].mode = row.mode;
      }
    }
    for (const row of posRows) {
      if (result[row.config_type]) {
        result[row.config_type].positions.push(row.position_name);
      }
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    // Table may not exist yet — return defaults
    res.json({
      budget:   { mode: 'OR', positions: [] },
      expenses: { mode: 'OR', positions: [] },
    });
  }
});

// PUT /api/validation-config/:type  (admin only)
// Body: { mode: 'AND'|'OR', positions: string[] }
router.put('/:type', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { type } = req.params;
    if (!['budget', 'expenses'].includes(type)) {
      return res.status(400).json({ error: 'Type invalide' });
    }
    const { mode, positions } = req.body;
    const safeMode = mode === 'AND' ? 'AND' : 'OR';

    // Upsert config row
    await pool.execute(
      `INSERT INTO validation_config (config_type, mode) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE mode = VALUES(mode)`,
      [type, safeMode]
    );

    // Replace positions
    await pool.execute(
      'DELETE FROM validation_config_positions WHERE config_type = ?',
      [type]
    );
    const safePositions = Array.isArray(positions) ? positions : [];
    for (const pos of safePositions) {
      await pool.execute(
        'INSERT INTO validation_config_positions (id, config_type, position_name) VALUES (?, ?, ?)',
        [crypto.randomUUID(), type, pos]
      );
    }

    res.json({ config_type: type, mode: safeMode, positions: safePositions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
