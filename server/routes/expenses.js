const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

const router = express.Router();

function mapExpense(row) {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date instanceof Date
      ? row.date.toISOString().slice(0, 10)
      : String(row.date).slice(0, 10),
    amount: parseFloat(row.amount),
    reason: row.reason,
    receiptFile: row.receipt_file || undefined,
    receiptFileName: row.receipt_file_name || undefined,
    receiptFileType: row.receipt_file_type || undefined,
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

// Returns true if the current user's position is listed in the expenses validation config
async function canValidateExpenses(userId) {
  try {
    const [userRows] = await pool.execute('SELECT position FROM users WHERE id = ?', [userId]);
    const position = userRows[0]?.position;
    if (!position) return false;
    const [cfgRows] = await pool.execute(
      'SELECT 1 FROM validation_config_positions WHERE config_type = ? AND position_name = ?',
      ['expenses', position]
    );
    return cfgRows.length > 0;
  } catch { return false; }
}

// GET /api/expenses
router.get('/', async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      [rows] = await pool.execute('SELECT * FROM expenses ORDER BY date DESC, created_at DESC');
    } else {
      const isValidator = await canValidateExpenses(req.user.id);
      if (isValidator) {
        [rows] = await pool.execute('SELECT * FROM expenses ORDER BY date DESC, created_at DESC');
      } else {
        [rows] = await pool.execute(
          'SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC, created_at DESC',
          [req.user.id]
        );
      }
    }
    res.json(rows.map(mapExpense));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/expenses
router.post('/', async (req, res) => {
  try {
    const { date, amount, reason, receiptFile, receiptFileName, receiptFileType } = req.body;
    if (!date || amount === undefined || !reason) {
      return res.status(400).json({ error: 'Date, montant et motif requis' });
    }
    const id = uuidv4();
    await pool.execute(
      `INSERT INTO expenses (id, user_id, date, amount, reason, receipt_file, receipt_file_name, receipt_file_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, req.user.id, date, amount, reason, receiptFile || null, receiptFileName || null, receiptFileType || null]
    );
    const [rows] = await pool.execute('SELECT * FROM expenses WHERE id = ?', [id]);
    res.status(201).json(mapExpense(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/expenses/:id — update own pending expense
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM expenses WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Dépense non trouvée' });

    const record = existing[0];
    if (record.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    if (record.status !== 'pending') {
      return res.status(400).json({ error: 'Seules les dépenses en attente peuvent être modifiées' });
    }

    const { date, amount, reason, receiptFile, receiptFileName, receiptFileType } = req.body;
    const updates = [];
    const values = [];
    if (date !== undefined)            { updates.push('date = ?');              values.push(date); }
    if (amount !== undefined)          { updates.push('amount = ?');            values.push(amount); }
    if (reason !== undefined)          { updates.push('reason = ?');            values.push(reason); }
    if (receiptFile !== undefined)     { updates.push('receipt_file = ?');      values.push(receiptFile || null); }
    if (receiptFileName !== undefined) { updates.push('receipt_file_name = ?'); values.push(receiptFileName || null); }
    if (receiptFileType !== undefined) { updates.push('receipt_file_type = ?'); values.push(receiptFileType || null); }

    if (updates.length > 0) {
      values.push(id);
      await pool.execute(`UPDATE expenses SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    const [rows] = await pool.execute('SELECT * FROM expenses WHERE id = ?', [id]);
    res.json(mapExpense(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/expenses/:id/approve
router.put('/:id/approve', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      const ok = await canValidateExpenses(req.user.id);
      if (!ok) return res.status(403).json({ error: 'Accès refusé' });
    }
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM expenses WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Dépense non trouvée' });

    await pool.execute(
      `UPDATE expenses SET status = 'approved', validated_by = ?, validated_at = NOW() WHERE id = ?`,
      [req.user.id, id]
    );
    const [rows] = await pool.execute('SELECT * FROM expenses WHERE id = ?', [id]);
    res.json(mapExpense(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/expenses/:id/reject
router.put('/:id/reject', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      const ok = await canValidateExpenses(req.user.id);
      if (!ok) return res.status(403).json({ error: 'Accès refusé' });
    }
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM expenses WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Dépense non trouvée' });

    await pool.execute(
      `UPDATE expenses SET status = 'rejected', validated_by = ?, validated_at = NOW() WHERE id = ?`,
      [req.user.id, id]
    );
    const [rows] = await pool.execute('SELECT * FROM expenses WHERE id = ?', [id]);
    res.json(mapExpense(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
