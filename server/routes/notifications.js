const express = require('express');
const pool = require('../db');

const router = express.Router();

function mapNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body || null,
    refType: row.ref_type || null,
    refId: row.ref_id || null,
    readAt: row.read_at instanceof Date ? row.read_at.toISOString() : row.read_at || null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

// GET /
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND read_at IS NULL`,
      [req.user.id]
    );
    res.json({
      notifications: rows.map(mapNotification),
      unreadCount: countRows[0].cnt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /read-all  — MUST be before /:id/read
router.put('/read-all', async (req, res) => {
  try {
    await pool.execute(
      `UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL`,
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /:id/read
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute(
      `UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
