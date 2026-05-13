const express = require('express');
const pool = require('../db');

const router = express.Router();

// ── Helper : exécute un DELETE silencieux si la table n'existe pas ──────────
async function safeDelete(conn, table, where = '1=1') {
  try {
    const [result] = await conn.execute(`DELETE FROM \`${table}\` WHERE ${where}`);
    return result.affectedRows;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') return 0;
    throw err;
  }
}

// ── Helper : dédoublonner les noms de fichiers dans une archive ─────────────
function uniqueName(counters, rawName) {
  let name = rawName || 'fichier';
  if (counters[name] === undefined) {
    counters[name] = 0;
    return name;
  }
  counters[name]++;
  const ext  = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const base = name.slice(0, name.length - ext.length);
  return `${base}_${counters[name]}${ext}`;
}

// GET /api/admin/reset/documents-zip
// Génère un ZIP de sauvegarde :
//   documents/   → tous les documents RH
//   justificatifs/ → justificatifs de notes de frais (avec justificatif joint)
router.get('/documents-zip', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const [docRows] = await pool.execute(
      'SELECT id, file_name, file_data FROM documents ORDER BY created_at DESC'
    );

    const [expRows] = await pool.execute(
      `SELECT e.id, e.date, e.reason, e.amount,
              e.receipt_file, e.receipt_file_name,
              u.first_name, u.last_name
       FROM expenses e
       LEFT JOIN users u ON u.id = e.user_id
       WHERE e.receipt_file IS NOT NULL AND e.receipt_file != ''
       ORDER BY e.date DESC`
    );

    const hasContent = docRows.length > 0 || expRows.length > 0;
    if (!hasContent) {
      return res.status(404).json({ error: 'Aucun fichier à exporter' });
    }

    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 6 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sauvegarde_${new Date().toISOString().slice(0, 10)}.zip"`
    );
    res.setHeader('Cache-Control', 'no-cache');

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) res.status(500).end();
    });

    archive.pipe(res);

    // ── Dossier documents/ ───────────────────────────────────────────────────
    if (docRows.length > 0) {
      const docCounters = {};
      for (const doc of docRows) {
        const buffer = Buffer.from(doc.file_data, 'base64');
        const name   = uniqueName(docCounters, doc.file_name || `document_${doc.id}`);
        archive.append(buffer, { name: `documents/${name}` });
      }
    }

    // ── Dossier justificatifs/ ───────────────────────────────────────────────
    if (expRows.length > 0) {
      const rcptCounters = {};
      for (const exp of expRows) {
        const buffer = Buffer.from(exp.receipt_file, 'base64');
        // Nom lisible : YYYY-MM-DD_Nom_Prénom_Motif.ext
        const safeName = (s) => (s || '').replace(/[^a-zA-Z0-9À-ÿ._-]/g, '_').slice(0, 40);
        const ext      = exp.receipt_file_name
          ? exp.receipt_file_name.slice(exp.receipt_file_name.lastIndexOf('.'))
          : '';
        const base     = `${exp.date ? String(exp.date).slice(0, 10) : 'date'}_${safeName(exp.last_name)}_${safeName(exp.first_name)}_${safeName(exp.reason)}${ext}`;
        const name     = uniqueName(rcptCounters, base);
        archive.append(buffer, { name: `justificatifs/${name}` });
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error('documents-zip error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erreur lors de la génération du ZIP' });
    }
  }
});

// GET /api/admin/reset/preview
// Renvoie le nombre d'enregistrements qui seront supprimés
router.get('/preview', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const count = async (table, where = '1=1') => {
      try {
        const [[row]] = await pool.execute(`SELECT COUNT(*) AS n FROM \`${table}\` WHERE ${where}`);
        return row.n;
      } catch { return 0; }
    };

    const [[userRow]] = await pool.execute(
      "SELECT COUNT(*) AS n FROM users WHERE role != 'admin'"
    );

    // Justificatifs (frais avec pièce jointe)
    const [[rcptRow]] = await pool.execute(
      "SELECT COUNT(*) AS n FROM expenses WHERE receipt_file IS NOT NULL AND receipt_file != ''"
    ).catch(() => [[{ n: 0 }]]);

    res.json({
      timeEntries:       await count('time_entries'),
      absenceRequests:   await count('absence_requests'),
      expenses:          await count('expenses'),
      expenseReceipts:   rcptRow.n,
      payrollPeriods:    await count('payroll_periods'),
      budgetRequests:    await count('budget_requests'),
      realBudgets:       await count('real_budgets'),
      bankOperations:    await count('bank_operations'),
      bankImports:       await count('bank_imports'),
      notifications:     await count('notifications'),
      seasons:           await count('seasons'),
      documents:         await count('documents'),
      nonAdminUsers:     userRow.n,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/reset
// Body : { deleteUsers: boolean, deleteDocuments: boolean, confirm: "SUPPRIMER" }
router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { deleteUsers = false, deleteDocuments = false, confirm } = req.body;

    if (confirm !== 'SUPPRIMER') {
      return res.status(400).json({ error: 'Confirmation incorrecte' });
    }

    const conn = await pool.getConnection();
    const deleted = {};

    try {
      await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
      await conn.beginTransaction();

      // ── Données transactionnelles (toujours supprimées) ──────────────────
      deleted.timeEntries     = await safeDelete(conn, 'time_entries');
      deleted.absenceRequests = await safeDelete(conn, 'absence_requests');
      deleted.expenses        = await safeDelete(conn, 'expenses');
      deleted.payrollPeriods  = await safeDelete(conn, 'payroll_periods');

      // Budget
      deleted.budgetLineDetails  = await safeDelete(conn, 'budget_line_details');
      deleted.budgetRequestLines = await safeDelete(conn, 'budget_request_lines');
      deleted.realBudgetLines    = await safeDelete(conn, 'real_budget_lines');
      deleted.realBudgets        = await safeDelete(conn, 'real_budgets');
      deleted.budgetRequests     = await safeDelete(conn, 'budget_requests');
      deleted.budgetAccessGrants = await safeDelete(conn, 'budget_access_grants');

      // Comptabilité transactionnelle (règles/catégories conservées)
      deleted.bankOperations = await safeDelete(conn, 'bank_operations');
      deleted.bankImports    = await safeDelete(conn, 'bank_imports');

      // Saisons et calendriers (cascade : assignments → courses → weeks → seasons)
      deleted.seasons = await safeDelete(conn, 'seasons');

      // Divers
      deleted.notifications       = await safeDelete(conn, 'notifications');
      deleted.passwordResetTokens = await safeDelete(conn, 'password_reset_tokens');

      // ── Documents (optionnel) ────────────────────────────────────────────
      if (deleteDocuments) {
        deleted.documents = await safeDelete(conn, 'documents');
      }

      // ── Utilisateurs non-admin (optionnel) ──────────────────────────────
      if (deleteUsers) {
        await safeDelete(conn, 'user_module_access',
          `user_id IN (SELECT id FROM (SELECT id FROM users WHERE role != 'admin') AS tmp)`
        );
        const [result] = await conn.execute(
          "DELETE FROM users WHERE role != 'admin'"
        );
        deleted.users = result.affectedRows;
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
      conn.release();
    }

    res.json({ success: true, deleted });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Erreur lors de la remise à zéro : ' + err.message });
  }
});

module.exports = router;
