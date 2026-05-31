const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../db');
const { recognizeDocument } = require('../services/recognition');
const { sendDocumentNotification } = require('../services/email');
const { notify } = require('../services/notifications');

const router = express.Router();

// ── Stockage fichiers ─────────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'documents');
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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 Mo
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp', 'image/tiff',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

/** Supprime le fichier physique d'un document (ignore les erreurs). */
function deleteDocumentFile(filePath) {
  if (!filePath) return;
  const fullPath = path.join(UPLOADS_DIR, path.basename(filePath));
  try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath); } catch {}
}

// ── Mapping ───────────────────────────────────────────────────────────────────

function mapDocument(row) {
  return {
    id: row.id,
    fileName: row.file_name,
    fileType: row.file_type,
    filePath: row.file_path || undefined,
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

// Helper: check if user has document admin access (upload/validate)
async function hasDocAdminAccess(userId, role) {
  if (role === 'admin') return true;
  try {
    const [rows] = await pool.execute(
      "SELECT 1 FROM user_module_access WHERE user_id = ? AND module = 'documents_admin'",
      [userId]
    );
    return rows.length > 0;
  } catch { return false; }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET / — admin sees all, user sees own validated docs
router.get('/', async (req, res) => {
  try {
    const { id, role } = req.user;
    let rows;
    if (role === 'admin') {
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

// POST / — upload multipart/form-data + auto-recognize
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      if (req.file) deleteDocumentFile(req.file.filename);
      return res.status(403).json({ error: 'Accès refusé' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Fichier requis' });
    }

    const { originalname: fileName, mimetype: fileType, filename: filePath } = req.file;

    // Auto-recognize : on lit le fichier en base64 pour l'envoyer à l'IA
    const fileBuffer = fs.readFileSync(path.join(UPLOADS_DIR, filePath));
    const fileData = fileBuffer.toString('base64');
    const recognized = await recognizeDocument(fileData, fileType, fileName);

    const id = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO documents
         (id, file_name, file_type, file_path, document_type,
          detected_employee_name, period_start, period_end, notes, status, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_validation', ?)`,
      [
        id, fileName, fileType, filePath,
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
    if (req.file) deleteDocumentFile(req.file.filename);
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /:id — update metadata + validate
router.put('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
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

    // Email si vient d'être validé
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
      await notify(userId, 'document_available', 'Nouveau document disponible',
        `Un document "${documentType || existing.document_type}" est disponible dans votre espace.`,
        'document', id, 'documents', 'response');
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
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { id } = req.params;
    const [[existing]] = await pool.execute('SELECT * FROM documents WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Document non trouvé' });

    await pool.execute('DELETE FROM documents WHERE id = ?', [id]);
    deleteDocumentFile(existing.file_path);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /:id/download — sert le fichier depuis le disque
router.get('/:id/download', async (req, res) => {
  try {
    const { id, role } = req.user;
    const [[doc]] = await pool.execute('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ error: 'Document non trouvé' });
    if (role === 'user' && (doc.user_id !== id || doc.status !== 'validated')) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    if (!doc.file_path) {
      return res.status(404).json({ error: 'Fichier non disponible' });
    }

    const safeName = path.basename(doc.file_path);
    const filePath = path.join(UPLOADS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier non trouvé sur le disque' });
    }

    res.set('Content-Type', doc.file_type);
    res.set('Content-Disposition', `attachment; filename="${doc.file_name}"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
