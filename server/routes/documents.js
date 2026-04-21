const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { recognizeDocument } = require('../services/recognition');
const { sendDocumentNotification } = require('../services/email');

const router = express.Router();

function mapDocument(row) {
  return {
    id: row.id,
    fileName: row.file_name,
    fileType: row.file_type,
    fileData: row.file_data,
    documentType: row.document_type,
    userId: row.user_id || null,
    detectedEmployeeName: row.detected_employee_name || null,
    periodStart: row.period_start ? row.period_start.toISOString().split('T')[0] : null,
    periodEnd: row.period_end ? row.period_end.toISOString().split('T')[0] : null,
    notes: row.notes || null,
    status: row.status,
    uploadedBy: row.uploaded_by,
    validatedAt: row.validated_at ? row.validated_at.toISOString() : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

// GET / — admin sees all, user sees own validated docs
router.get('/', async (req, res) => {
  try {
    const { id, role } = req.user;
    let rows;
    if (role === 'admin' || role === 'manager') {
      [rows] = await pool.execute('SELECT * FROM documents ORDER BY created_at DESC');
    } else {
      [rows] = await pool.execute(
        "SELECT * FROM documents WHERE user_id = ? AND status = 'validated' ORDER BY created_at DESC",
        [id]
      );
    }
    res.json(rows.map(mapDocument));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST / — upload + auto-recognize
router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { fileName, fileType, fileData } = req.body;
    if (!fileName || !fileType || !fileData) {
      return res.status(400).json({ error: 'Fichier requis' });
    }

    // Auto-recognize
    const recognized = await recognizeDocument(fileData, fileType, fileName);

    const id = uuidv4();
    await pool.execute(
      `INSERT INTO documents (id, file_name, file_type, file_data, document_type, detected_employee_name, period_start, period_end, notes, status, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_validation', ?)`,
      [
        id, fileName, fileType, fileData,
        recognized.documentType,
        recognized.detectedEmployeeName,
        recognized.periodStart || null,
        recognized.periodEnd || null,
        recognized.notes,
        req.user.id,
      ]
    );

    const [[row]] = await pool.execute('SELECT * FROM documents WHERE id = ?', [id]);
    res.status(201).json(mapDocument(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /:id — update metadata + validate
router.put('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { documentType, userId, periodStart, periodEnd, notes, status } = req.body;
    const { id } = req.params;

    const [[existing]] = await pool.execute('SELECT * FROM documents WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Document non trouvé' });

    const isValidating = status === 'validated' && existing.status !== 'validated';

    await pool.execute(
      `UPDATE documents SET document_type=?, user_id=?, period_start=?, period_end=?, notes=?, status=?,
       validated_at=? WHERE id=?`,
      [
        documentType || existing.document_type,
        userId || null,
        periodStart || null,
        periodEnd || null,
        notes !== undefined ? notes : existing.notes,
        status || existing.status,
        isValidating ? new Date() : existing.validated_at,
        id,
      ]
    );

    // Send email notification if just validated and user assigned
    if (isValidating && userId) {
      try {
        const [[user]] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
        const [[settings]] = await pool.execute('SELECT * FROM app_settings WHERE id = 1');
        if (user) {
          await sendDocumentNotification({
            toEmail: user.email,
            toName: `${user.first_name} ${user.last_name}`,
            documentType: documentType || existing.document_type,
            periodStart: periodStart || existing.period_start,
            periodEnd: periodEnd || existing.period_end,
            clubName: settings?.club_name,
          });
        }
      } catch (emailErr) {
        console.error('Email error:', emailErr.message);
      }
    }

    const [[row]] = await pool.execute('SELECT * FROM documents WHERE id = ?', [id]);
    res.json(mapDocument(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { id } = req.params;
    const [[existing]] = await pool.execute('SELECT id FROM documents WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Document non trouvé' });
    await pool.execute('DELETE FROM documents WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /:id/download — serve file data
router.get('/:id/download', async (req, res) => {
  try {
    const { id, role } = req.user;
    const [[doc]] = await pool.execute('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ error: 'Document non trouvé' });
    if (role === 'user' && (doc.user_id !== id || doc.status !== 'validated')) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const buffer = Buffer.from(doc.file_data, 'base64');
    res.set('Content-Type', doc.file_type);
    res.set('Content-Disposition', `inline; filename="${doc.file_name}"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
