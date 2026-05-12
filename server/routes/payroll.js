const express = require('express');
const crypto = require('crypto');
const pool = require('../db');

const router = express.Router();

function mapDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

function mapDateTime(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return val;
}

function mapPeriod(row) {
  return {
    id: row.id,
    startDate: mapDate(row.start_date),
    endDate: mapDate(row.end_date),
    status: row.status,
    createdBy: row.created_by,
    validatedBy: row.validated_by || null,
    validatedAt: mapDateTime(row.validated_at),
    createdAt: mapDateTime(row.created_at),
  };
}

// GET / — liste toutes les périodes (admin only), triées par start_date desc
router.get('/', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    const [rows] = await pool.execute(
      'SELECT * FROM payroll_periods ORDER BY start_date DESC'
    );
    res.json(rows.map(mapPeriod));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /latest-end-date — renvoie { endDate } de la période la plus récente (ou null)
router.get('/latest-end-date', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    const [rows] = await pool.execute(
      'SELECT end_date FROM payroll_periods ORDER BY end_date DESC LIMIT 1'
    );
    if (rows.length === 0) return res.json({ endDate: null });
    res.json({ endDate: mapDate(rows[0].end_date) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST / — crée une période (admin only)
router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Date de début et date de fin requises' });
    }
    const id = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO payroll_periods (id, start_date, end_date, status, created_by) VALUES (?, ?, ?, 'draft', ?)`,
      [id, startDate, endDate, req.user.id]
    );
    const [rows] = await pool.execute('SELECT * FROM payroll_periods WHERE id = ?', [id]);
    res.status(201).json(mapPeriod(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /:id — détail période + agrégation par user
router.get('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    const { id } = req.params;
    const [periodRows] = await pool.execute('SELECT * FROM payroll_periods WHERE id = ?', [id]);
    if (periodRows.length === 0) return res.status(404).json({ error: 'Période non trouvée' });
    const period = periodRows[0];

    const startStr = mapDate(period.start_date);
    const endStr = mapDate(period.end_date);
    const endDatetime = endStr + ' 23:59:59';

    // Time entries validées dans la période (par validated_at)
    const [timeRows] = await pool.execute(
      `SELECT te.*, u.first_name, u.last_name
       FROM time_entries te
       JOIN users u ON u.id = te.user_id
       WHERE te.status = 'approved'
         AND te.validated_at BETWEEN ? AND ?`,
      [startStr, endDatetime]
    );

    // Absences validées dans la période (par validated_at)
    const [absenceRows] = await pool.execute(
      `SELECT ar.*, u.first_name, u.last_name
       FROM absence_requests ar
       JOIN users u ON u.id = ar.user_id
       WHERE ar.status = 'approved'
         AND ar.validated_at BETWEEN ? AND ?`,
      [startStr, endDatetime]
    );

    // Frais validés dans la période (par validated_at)
    const [expenseRows] = await pool.execute(
      `SELECT e.*, u.first_name, u.last_name
       FROM expenses e
       JOIN users u ON u.id = e.user_id
       WHERE e.status = 'approved'
         AND e.validated_at BETWEEN ? AND ?`,
      [startStr, endDatetime]
    );

    // Regrouper par userId
    const userMap = {};

    const ensureUser = (row) => {
      if (!userMap[row.user_id]) {
        userMap[row.user_id] = {
          userId: row.user_id,
          firstName: row.first_name,
          lastName: row.last_name,
          totalHours: 0,
          absenceDays: 0,
          totalExpenses: 0,
          timeEntries: [],
          absenceRequests: [],
          expenses: [],
        };
      }
    };

    for (const row of timeRows) {
      ensureUser(row);
      userMap[row.user_id].totalHours += parseFloat(row.hours) || 0;
      userMap[row.user_id].timeEntries.push({
        id: row.id,
        userId: row.user_id,
        date: mapDate(row.date),
        hours: parseFloat(row.hours) || 0,
        activityTypeId: row.activity_type_id,
        description: row.description || null,
        status: row.status,
        validatedBy: row.validated_by || null,
        validatedAt: mapDateTime(row.validated_at),
        createdAt: mapDateTime(row.created_at),
      });
    }

    for (const row of absenceRows) {
      ensureUser(row);
      // Nombre de jours = DATEDIFF(end_date, start_date) + 1
      const start = new Date(mapDate(row.start_date));
      const end = new Date(mapDate(row.end_date));
      const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
      userMap[row.user_id].absenceDays += days;
      userMap[row.user_id].absenceRequests.push({
        id: row.id,
        userId: row.user_id,
        startDate: mapDate(row.start_date),
        endDate: mapDate(row.end_date),
        type: row.type,
        reason: row.reason || null,
        status: row.status,
        validatedBy: row.validated_by || null,
        validatedAt: mapDateTime(row.validated_at),
        createdAt: mapDateTime(row.created_at),
      });
    }

    for (const row of expenseRows) {
      ensureUser(row);
      userMap[row.user_id].totalExpenses += parseFloat(row.amount) || 0;
      userMap[row.user_id].expenses.push({
        id: row.id,
        userId: row.user_id,
        date: mapDate(row.date),
        amount: parseFloat(row.amount) || 0,
        reason: row.reason,
        receiptFile: row.receipt_file || null,
        receiptFileName: row.receipt_file_name || null,
        receiptFileType: row.receipt_file_type || null,
        status: row.status,
        validatedBy: row.validated_by || null,
        validatedAt: mapDateTime(row.validated_at),
        createdAt: mapDateTime(row.created_at),
      });
    }

    res.json({
      period: mapPeriod(period),
      rows: Object.values(userMap),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /:id/validate — valide la période (admin only)
router.put('/:id/validate', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM payroll_periods WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Période non trouvée' });
    if (rows[0].status === 'validated') return res.status(400).json({ error: 'La période est déjà validée' });

    await pool.execute(
      `UPDATE payroll_periods SET status = 'validated', validated_by = ?, validated_at = NOW() WHERE id = ?`,
      [req.user.id, id]
    );
    const [updatedRows] = await pool.execute('SELECT * FROM payroll_periods WHERE id = ?', [id]);
    res.json(mapPeriod(updatedRows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /:id — met à jour les dates d'une période (admin only, status=draft uniquement)
router.put('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM payroll_periods WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Période non trouvée' });
    if (rows[0].status !== 'draft') return res.status(400).json({ error: 'Seules les périodes en brouillon peuvent être modifiées' });

    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ error: 'Date de début et date de fin requises' });

    await pool.execute(
      'UPDATE payroll_periods SET start_date = ?, end_date = ? WHERE id = ?',
      [startDate, endDate, id]
    );
    const [updatedRows] = await pool.execute('SELECT * FROM payroll_periods WHERE id = ?', [id]);
    res.json(mapPeriod(updatedRows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /:id/export — génère et renvoie un fichier Excel
router.get('/:id/export', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    const { id } = req.params;
    const [periodRows] = await pool.execute('SELECT * FROM payroll_periods WHERE id = ?', [id]);
    if (periodRows.length === 0) return res.status(404).json({ error: 'Période non trouvée' });
    const period = periodRows[0];

    const startStr = mapDate(period.start_date);
    const endStr = mapDate(period.end_date);
    const endDatetime = endStr + ' 23:59:59';

    const [timeRows] = await pool.execute(
      `SELECT te.user_id, te.hours, u.first_name, u.last_name
       FROM time_entries te
       JOIN users u ON u.id = te.user_id
       WHERE te.status = 'approved' AND te.validated_at BETWEEN ? AND ?`,
      [startStr, endDatetime]
    );
    const [absenceRows] = await pool.execute(
      `SELECT ar.user_id, ar.start_date, ar.end_date, u.first_name, u.last_name
       FROM absence_requests ar
       JOIN users u ON u.id = ar.user_id
       WHERE ar.status = 'approved' AND ar.validated_at BETWEEN ? AND ?`,
      [startStr, endDatetime]
    );
    const [expenseRows] = await pool.execute(
      `SELECT e.user_id, e.amount, u.first_name, u.last_name
       FROM expenses e
       JOIN users u ON u.id = e.user_id
       WHERE e.status = 'approved' AND e.validated_at BETWEEN ? AND ?`,
      [startStr, endDatetime]
    );

    const userMap = {};
    const ensureUser = (row) => {
      if (!userMap[row.user_id]) {
        userMap[row.user_id] = {
          firstName: row.first_name,
          lastName: row.last_name,
          totalHours: 0,
          absenceDays: 0,
          totalExpenses: 0,
        };
      }
    };
    for (const row of timeRows) {
      ensureUser(row);
      userMap[row.user_id].totalHours += parseFloat(row.hours) || 0;
    }
    for (const row of absenceRows) {
      ensureUser(row);
      const s = new Date(mapDate(row.start_date));
      const e = new Date(mapDate(row.end_date));
      const days = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
      userMap[row.user_id].absenceDays += days;
    }
    for (const row of expenseRows) {
      ensureUser(row);
      userMap[row.user_id].totalExpenses += parseFloat(row.amount) || 0;
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Paie');

    // Titre de la période
    const periodLabel = `Période du ${startStr} au ${endStr}`;
    sheet.mergeCells('A1:D1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = periodLabel;
    titleCell.font = { bold: true, size: 13 };
    titleCell.alignment = { horizontal: 'center' };
    sheet.addRow([]);

    // En-têtes
    const headerRow = sheet.addRow(['Employé', 'Total heures', "Jours d'absence", 'Montant frais']);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2d6a4f' } };
      cell.alignment = { horizontal: 'center' };
    });

    // Colonnes largeur
    sheet.columns = [
      { key: 'employe', width: 28 },
      { key: 'heures', width: 16 },
      { key: 'absences', width: 18 },
      { key: 'frais', width: 18 },
    ];

    // Lignes de données avec alternance
    const userList = Object.values(userMap);
    userList.forEach((u, idx) => {
      const row = sheet.addRow([
        `${u.lastName} ${u.firstName}`,
        u.totalHours,
        u.absenceDays,
        u.totalExpenses,
      ]);
      const bgColor = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF0F4F0';
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.alignment = { horizontal: 'center' };
      });
      // Nom en left
      row.getCell(1).alignment = { horizontal: 'left' };
      // Montant en currency
      const fraisCell = row.getCell(4);
      fraisCell.numFmt = '#,##0.00 €';
    });

    // Fixer les largeurs après ajout des lignes
    sheet.getColumn(1).width = 28;
    sheet.getColumn(2).width = 16;
    sheet.getColumn(3).width = 18;
    sheet.getColumn(4).width = 18;

    const filename = `paie_${startStr}_${endStr}.xlsx`.replace(/\s/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la génération du fichier Excel' });
  }
});

// PUT /:id/reopen — réouvre une période validée (admin only)
router.put('/:id/reopen', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT status FROM payroll_periods WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Période non trouvée' });
    if (rows[0].status !== 'validated') {
      return res.status(400).json({ error: 'Seules les périodes validées peuvent être réouvertes' });
    }
    await pool.execute(
      'UPDATE payroll_periods SET status = ?, validated_by = NULL, validated_at = NULL WHERE id = ?',
      ['draft', id]
    );
    const [updated] = await pool.execute('SELECT * FROM payroll_periods WHERE id = ?', [id]);
    res.json(mapPeriod(updated[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /:id — supprime une période brouillon (admin only)
router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT status FROM payroll_periods WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Période non trouvée' });
    if (rows[0].status !== 'draft') {
      return res.status(400).json({ error: 'Seules les périodes en brouillon peuvent être supprimées' });
    }
    await pool.execute('DELETE FROM payroll_periods WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
