const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../db');
const { recognizeExpense } = require('../services/recognition');
const { notify } = require('../services/notifications');

const router = express.Router();

// ── Stockage fichiers ─────────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'expenses');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/webp',
      'image/heic', 'image/heif',
      'application/pdf',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

/** Supprime le fichier physique d'un justificatif (ignore les erreurs). */
function deleteReceiptFile(filePath) {
  if (!filePath) return;
  const fullPath = path.join(UPLOADS_DIR, path.basename(filePath));
  try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath); } catch {}
}

// ── Mapping ───────────────────────────────────────────────────────────────────

function mapExpense(row) {
  let vatDetails;
  try { vatDetails = row.vat_details ? JSON.parse(row.vat_details) : undefined; } catch { vatDetails = undefined; }
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date instanceof Date
      ? row.date.toISOString().slice(0, 10)
      : String(row.date).slice(0, 10),
    amount: parseFloat(row.amount),
    reason: row.reason,
    vendor: row.vendor || undefined,
    amountHt: row.amount_ht != null ? parseFloat(row.amount_ht) : undefined,
    vatDetails,
    receiptFilePath: row.receipt_file_path || undefined,
    receiptFileName: row.receipt_file_name || undefined,
    receiptFileType: row.receipt_file_type || undefined,
    // Rétrocompatibilité : anciens justificatifs stockés en base64
    receiptFile: row.receipt_file || undefined,
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

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/expenses/my-stats — montants en attente et sur la prochaine paie
router.get('/my-stats', async (req, res) => {
  try {
    const userId = req.user.id;

    const [periodRows] = await pool.execute(
      `SELECT * FROM payroll_periods WHERE status = 'validated' ORDER BY end_date DESC LIMIT 1`
    );

    let pendingAmount    = 0;
    let nextPayrollAmount = 0;
    let nextPayrollLabel  = null;

    const fmtFr = (s) => { if (!s) return ''; const [y,m,d] = s.slice(0,10).split('-'); return `${d}/${m}/${y}`; };
    const mapDate = (v) => v instanceof Date ? v.toISOString().slice(0,10) : String(v).slice(0,10);

    if (periodRows.length > 0) {
      const p = periodRows[0];
      const startStr    = mapDate(p.start_date);
      const endStr      = mapDate(p.end_date);
      const endDatetime = endStr + ' 23:59:59';

      const [[inPeriod]] = await pool.execute(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
         WHERE user_id = ? AND status = 'approved'
           AND validated_at BETWEEN ? AND ?`,
        [userId, startStr, endDatetime]
      );
      nextPayrollAmount = parseFloat(inPeriod.total) || 0;
      nextPayrollLabel  = `${fmtFr(startStr)} – ${fmtFr(endStr)}`;

      const [[afterPeriod]] = await pool.execute(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
         WHERE user_id = ? AND status = 'approved'
           AND validated_at > ?`,
        [userId, endDatetime]
      );
      pendingAmount = parseFloat(afterPeriod.total) || 0;
    } else {
      const [[allApproved]] = await pool.execute(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
         WHERE user_id = ? AND status = 'approved'`,
        [userId]
      );
      pendingAmount = parseFloat(allApproved.total) || 0;
    }

    res.json({ pendingAmount, nextPayrollAmount, nextPayrollLabel });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/expenses/recognize — extraction IA depuis un justificatif (base64)
// Reste en JSON : utilisé uniquement pour la reconnaissance, pas pour le stockage
router.post('/recognize', async (req, res) => {
  try {
    const { fileData, fileType } = req.body;
    if (!fileData || !fileType) return res.status(400).json({ error: 'fileData et fileType requis' });
    const result = await recognizeExpense(fileData, fileType);
    res.json(result);
  } catch (err) {
    const msg = err?.message || String(err);
    console.error('[recognize]', msg);
    res.status(500).json({ error: `Reconnaissance impossible : ${msg}` });
  }
});

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

// POST /api/expenses — multipart/form-data
router.post('/', upload.single('receipt'), async (req, res) => {
  try {
    const { date, amount, reason, vendor, amountHt, vatDetails } = req.body;
    if (!date || amount === undefined || !reason) {
      if (req.file) deleteReceiptFile(req.file.filename);
      return res.status(400).json({ error: 'Date, montant et motif requis' });
    }

    const id = crypto.randomUUID();
    const vatJson = vatDetails ? (typeof vatDetails === 'string' ? vatDetails : JSON.stringify(vatDetails)) : null;

    const receiptFilePath = req.file ? req.file.filename : null;
    const receiptFileName = req.file ? req.file.originalname : null;
    const receiptFileType = req.file ? req.file.mimetype : null;

    await pool.execute(
      `INSERT INTO expenses (id, user_id, date, amount, reason, vendor, amount_ht, vat_details,
        receipt_file_path, receipt_file_name, receipt_file_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        id, req.user.id, date, amount, reason,
        vendor || null,
        amountHt != null && amountHt !== '' ? amountHt : null,
        vatJson,
        receiptFilePath, receiptFileName, receiptFileType,
      ]
    );

    const [rows] = await pool.execute('SELECT * FROM expenses WHERE id = ?', [id]);
    res.status(201).json(mapExpense(rows[0]));

    // Notifier le manager
    const [[submitter]] = await pool.execute(
      'SELECT first_name, last_name, manager_id FROM users WHERE id = ?', [req.user.id]
    );
    if (submitter?.manager_id) {
      await notify(submitter.manager_id, 'expense_submitted', 'Note de frais à valider',
        `${submitter.first_name} a soumis une note de frais.`,
        'expense', id, 'expenses', 'action');
    }
  } catch (err) {
    if (req.file) deleteReceiptFile(req.file.filename);
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/expenses/:id — multipart/form-data
router.put('/:id', upload.single('receipt'), async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM expenses WHERE id = ?', [id]);
    if (existing.length === 0) {
      if (req.file) deleteReceiptFile(req.file.filename);
      return res.status(404).json({ error: 'Dépense non trouvée' });
    }

    const record = existing[0];
    if (record.user_id !== req.user.id) {
      if (req.file) deleteReceiptFile(req.file.filename);
      return res.status(403).json({ error: 'Accès refusé' });
    }
    if (record.status === 'approved') {
      if (req.file) deleteReceiptFile(req.file.filename);
      return res.status(400).json({ error: 'Une dépense approuvée ne peut pas être modifiée' });
    }

    const { date, amount, reason, vendor, amountHt, vatDetails } = req.body;
    const updates = [];
    const values = [];

    if (date !== undefined)       { updates.push('date = ?');       values.push(date); }
    if (amount !== undefined)     { updates.push('amount = ?');     values.push(amount); }
    if (reason !== undefined)     { updates.push('reason = ?');     values.push(reason); }
    if (vendor !== undefined)     { updates.push('vendor = ?');     values.push(vendor || null); }
    if (amountHt !== undefined)   { updates.push('amount_ht = ?'); values.push(amountHt !== '' ? amountHt : null); }
    if (vatDetails !== undefined) {
      const vatJson = vatDetails ? (typeof vatDetails === 'string' ? vatDetails : JSON.stringify(vatDetails)) : null;
      updates.push('vat_details = ?');
      values.push(vatJson);
    }

    // Nouveau fichier uploadé → remplacer l'ancien
    if (req.file) {
      if (record.receipt_file_path) deleteReceiptFile(record.receipt_file_path);
      updates.push('receipt_file_path = ?'); values.push(req.file.filename);
      updates.push('receipt_file_name = ?'); values.push(req.file.originalname);
      updates.push('receipt_file_type = ?'); values.push(req.file.mimetype);
    }

    if (updates.length > 0) {
      values.push(id);
      await pool.execute(`UPDATE expenses SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    const [rows] = await pool.execute('SELECT * FROM expenses WHERE id = ?', [id]);
    res.json(mapExpense(rows[0]));
  } catch (err) {
    if (req.file) deleteReceiptFile(req.file.filename);
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM expenses WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Dépense non trouvée' });

    const record = existing[0];
    if (record.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    if (record.status === 'approved') {
      return res.status(400).json({ error: 'Une dépense approuvée ne peut pas être supprimée' });
    }

    await pool.execute('DELETE FROM expenses WHERE id = ?', [id]);
    deleteReceiptFile(record.receipt_file_path);
    res.json({ success: true });
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

    const [[validator]] = await pool.execute('SELECT first_name, last_name FROM users WHERE id = ?', [req.user.id]);
    const vName = validator ? validator.first_name : 'Votre responsable';
    await notify(existing[0].user_id, 'expense_approved', 'Note de frais approuvée',
      `Votre note de frais a été approuvée par ${vName}.`,
      'expense', id, 'expenses', 'response');
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

    const [[validator]] = await pool.execute('SELECT first_name, last_name FROM users WHERE id = ?', [req.user.id]);
    const vName = validator ? validator.first_name : 'Votre responsable';
    await notify(existing[0].user_id, 'expense_rejected', 'Note de frais refusée',
      `Votre note de frais a été refusée par ${vName}.`,
      'expense', id, 'expenses', 'response');
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
