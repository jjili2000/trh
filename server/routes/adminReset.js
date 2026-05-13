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

// GET /api/admin/reset/documents-zip
// Génère un ZIP de sauvegarde de tous les documents
router.get('/documents-zip', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const [rows] = await pool.execute(
      'SELECT id, file_name, file_type, file_data FROM documents ORDER BY created_at DESC'
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Aucun document à exporter' });
    }

    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 6 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="documents_backup_${new Date().toISOString().slice(0, 10)}.zip"`
    );
    res.setHeader('Cache-Control', 'no-cache');

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) res.status(500).end();
    });

    archive.pipe(res);

    // Dédoublonner les noms de fichiers
    const nameCounts = {};
    for (const doc of rows) {
      const buffer = Buffer.from(doc.file_data, 'base64');
      let name = doc.file_name || `document_${doc.id}`;
      if (nameCounts[name] !== undefined) {
        nameCounts[name]++;
        const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
        const base = name.slice(0, name.length - ext.length);
        name = `${base}_${nameCounts[name]}${ext}`;
      } else {
        nameCounts[name] = 0;
      }
      archive.append(buffer, { name });
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

    const [result] = await pool.execute(
      "SELECT COUNT(*) AS n FROM users WHERE role != 'admin'"
    );

    res.json({
      timeEntries:       await count('time_entries'),
      absenceRequests:   await count('absence_requests'),
      expenses:          await count('expenses'),
      payrollPeriods:    await count('payroll_periods'),
      budgetRequests:    await count('budget_requests'),
      realBudgets:       await count('real_budgets'),
      bankOperations:    await count('bank_operations'),
      bankImports:       await count('bank_imports'),
      notifications:     await count('notifications'),
      documents:         await count('documents'),
      nonAdminUsers:     result[0].n,
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
      deleted.budgetLineDetails   = await safeDelete(conn, 'budget_line_details');
      deleted.budgetRequestLines  = await safeDelete(conn, 'budget_request_lines');
      deleted.realBudgetLines     = await safeDelete(conn, 'real_budget_lines');
      deleted.realBudgets         = await safeDelete(conn, 'real_budgets');
      deleted.budgetRequests      = await safeDelete(conn, 'budget_requests');
      deleted.budgetAccessGrants  = await safeDelete(conn, 'budget_access_grants');

      // Comptabilité transactionnelle (règles/catégories conservées)
      deleted.bankOperations = await safeDelete(conn, 'bank_operations');
      deleted.bankImports    = await safeDelete(conn, 'bank_imports');

      // Divers
      deleted.notifications       = await safeDelete(conn, 'notifications');
      deleted.passwordResetTokens = await safeDelete(conn, 'password_reset_tokens');

      // ── Documents (optionnel) ────────────────────────────────────────────
      if (deleteDocuments) {
        deleted.documents = await safeDelete(conn, 'documents');
      }

      // ── Utilisateurs non-admin (optionnel) ──────────────────────────────
      if (deleteUsers) {
        // NULLer les manager_id qui pointent vers des non-admins
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
