const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

const router = express.Router();

// Check if a user can validate budgets (admin always can; others by position config)
async function isBudgetValidator(userId, role) {
  if (role === 'admin') return true;
  try {
    const [userRows] = await pool.execute('SELECT position FROM users WHERE id = ?', [userId]);
    const position = userRows[0]?.position;
    if (!position) return false;
    const [cfgRows] = await pool.execute(
      'SELECT 1 FROM validation_config_positions WHERE config_type = ? AND position_name = ?',
      ['budget', position]
    );
    return cfgRows.length > 0;
  } catch { return false; }
}

// Get all users who can validate budgets (for notifications)
async function getBudgetValidators() {
  try {
    const [adminRows] = await pool.execute(`SELECT id FROM users WHERE role = 'admin'`);
    const [cfgRows] = await pool.execute(
      `SELECT DISTINCT u.id FROM users u
       JOIN validation_config_positions vcp ON vcp.position_name = u.position
       WHERE vcp.config_type = 'budget' AND u.position IS NOT NULL`
    );
    const ids = new Set([...adminRows.map(r => r.id), ...cfgRows.map(r => r.id)]);
    return [...ids];
  } catch { return []; }
}

async function createNotification(userId, type, title, body, refType, refId) {
  try {
    const id = uuidv4();
    await pool.execute(
      `INSERT INTO notifications (id, user_id, type, title, body, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, type, title, body || null, refType || null, refId || null]
    );
  } catch (err) {
    console.error('Notification creation failed (silent):', err);
  }
}

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

function mapRequest(row) {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    startDate: mapDate(row.start_date),
    endDate: mapDate(row.end_date),
    comment: row.comment || null,
    status: row.status,
    approverId: row.approver_id || null,
    approverComment: row.approver_comment || null,
    approvedAt: mapDateTime(row.approved_at),
    createdAt: mapDateTime(row.created_at),
    updatedAt: mapDateTime(row.updated_at),
  };
}

function mapRequestLine(row) {
  return {
    id: row.id,
    requestId: row.request_id,
    type: row.type,
    label: row.label,
    qty: parseFloat(row.qty) || 1,
    unitPrice: parseFloat(row.unit_price) || 0,
    amount: parseFloat(row.amount),
    sortOrder: row.sort_order,
    createdAt: mapDateTime(row.created_at),
  };
}

function mapRealBudget(row) {
  return {
    id: row.id,
    requestId: row.request_id,
    userId: row.user_id,
    label: row.label,
    startDate: mapDate(row.start_date),
    endDate: mapDate(row.end_date),
    status: row.status,
    createdAt: mapDateTime(row.created_at),
  };
}

function mapRealBudgetLine(row) {
  return {
    id: row.id,
    realBudgetId: row.real_budget_id,
    sourceLineId: row.source_line_id || null,
    type: row.type,
    label: row.label,
    forecastAmount: parseFloat(row.forecast_amount),
    sortOrder: row.sort_order,
    createdAt: mapDateTime(row.created_at),
  };
}

function mapDetail(row) {
  return {
    id: row.id,
    lineId: row.line_id,
    detailDate: mapDate(row.detail_date),
    label: row.label,
    paymentMethod: row.payment_method,
    qty: parseFloat(row.qty) || 1,
    unitPrice: parseFloat(row.unit_price) || 0,
    amount: parseFloat(row.amount),
    receiptFile: row.receipt_file || null,
    receiptFileName: row.receipt_file_name || null,
    receiptFileType: row.receipt_file_type || null,
    userId: row.user_id,
    createdAt: mapDateTime(row.created_at),
  };
}

// ─── Budget Requests ──────────────────────────────────────────────────────────

// GET /requests
router.get('/requests', async (req, res) => {
  try {
    let rows;
    if (await isBudgetValidator(req.user.id, req.user.role)) {
      [rows] = await pool.execute(
        `SELECT * FROM budget_requests WHERE status != 'cancelled' ORDER BY created_at DESC`
      );
    } else {
      [rows] = await pool.execute(
        `SELECT * FROM budget_requests WHERE user_id = ? ORDER BY created_at DESC`,
        [req.user.id]
      );
    }
    res.json(rows.map(mapRequest));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /requests
router.post('/requests', async (req, res) => {
  try {
    const { label, startDate, endDate, comment, lines } = req.body;
    if (!label || !startDate || !endDate) {
      return res.status(400).json({ error: 'Libellé, date de début et date de fin requis' });
    }
    const id = uuidv4();
    await pool.execute(
      `INSERT INTO budget_requests (id, user_id, label, start_date, end_date, comment, status) VALUES (?, ?, ?, ?, ?, ?, 'draft')`,
      [id, req.user.id, label, startDate, endDate, comment || null]
    );
    if (Array.isArray(lines) && lines.length > 0) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineId = uuidv4();
        const qty = parseFloat(line.qty) || 1;
        const unitPrice = parseFloat(line.unitPrice) || 0;
        await pool.execute(
          `INSERT INTO budget_request_lines (id, request_id, type, label, qty, unit_price, amount, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [lineId, id, line.type, line.label, qty, unitPrice, line.amount || 0, i]
        );
      }
    }
    const [requestRows] = await pool.execute('SELECT * FROM budget_requests WHERE id = ?', [id]);
    const [lineRows] = await pool.execute('SELECT * FROM budget_request_lines WHERE request_id = ? ORDER BY sort_order', [id]);
    const result = mapRequest(requestRows[0]);
    result.lines = lineRows.map(mapRequestLine);
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /requests/:id
router.get('/requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM budget_requests WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Demande non trouvée' });
    const request = rows[0];
    // Autoriser aussi les utilisateurs ayant un accès partagé sur le budget réel associé
    const hasAccess = await isBudgetValidator(req.user.id, req.user.role)
      || request.user_id === req.user.id;
    if (!hasAccess) {
      const [grantRows] = await pool.execute(
        'SELECT 1 FROM budget_access_grants bag JOIN real_budgets rb ON rb.id = bag.real_budget_id WHERE rb.request_id = ? AND bag.user_id = ?',
        [id, req.user.id]
      );
      if (grantRows.length === 0) return res.status(403).json({ error: 'Accès refusé' });
    }
    const [lineRows] = await pool.execute(
      'SELECT * FROM budget_request_lines WHERE request_id = ? ORDER BY sort_order',
      [id]
    );
    // If approved, look for real budget
    let realBudgetId = null;
    if (request.status === 'approved') {
      const [rb] = await pool.execute('SELECT id FROM real_budgets WHERE request_id = ?', [id]);
      if (rb.length > 0) realBudgetId = rb[0].id;
    }
    const result = mapRequest(request);
    result.lines = lineRows.map(mapRequestLine);
    if (realBudgetId) result.realBudgetId = realBudgetId;
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /requests/:id
router.put('/requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM budget_requests WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Demande non trouvée' });
    const request = rows[0];
    if (request.user_id !== req.user.id) return res.status(403).json({ error: 'Accès refusé' });
    if (request.status !== 'draft') return res.status(400).json({ error: 'Seuls les brouillons peuvent être modifiés' });

    const { label, startDate, endDate, comment, lines } = req.body;
    const updates = [];
    const values = [];
    if (label !== undefined) { updates.push('label = ?'); values.push(label); }
    if (startDate !== undefined) { updates.push('start_date = ?'); values.push(startDate); }
    if (endDate !== undefined) { updates.push('end_date = ?'); values.push(endDate); }
    if (comment !== undefined) { updates.push('comment = ?'); values.push(comment || null); }
    if (updates.length > 0) {
      values.push(id);
      await pool.execute(`UPDATE budget_requests SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    if (Array.isArray(lines)) {
      await pool.execute('DELETE FROM budget_request_lines WHERE request_id = ?', [id]);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineId = uuidv4();
        const qty = parseFloat(line.qty) || 1;
        const unitPrice = parseFloat(line.unitPrice) || 0;
        await pool.execute(
          `INSERT INTO budget_request_lines (id, request_id, type, label, qty, unit_price, amount, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [lineId, id, line.type, line.label, qty, unitPrice, line.amount || 0, i]
        );
      }
    }
    const [updatedRows] = await pool.execute('SELECT * FROM budget_requests WHERE id = ?', [id]);
    const [lineRows] = await pool.execute('SELECT * FROM budget_request_lines WHERE request_id = ? ORDER BY sort_order', [id]);
    const result = mapRequest(updatedRows[0]);
    result.lines = lineRows.map(mapRequestLine);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /requests/:id/submit
router.post('/requests/:id/submit', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM budget_requests WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Demande non trouvée' });
    const request = rows[0];
    if (request.user_id !== req.user.id) return res.status(403).json({ error: 'Accès refusé' });
    if (request.status !== 'draft') return res.status(400).json({ error: 'Seuls les brouillons peuvent être soumis' });

    const [lineCount] = await pool.execute(
      'SELECT COUNT(*) as cnt FROM budget_request_lines WHERE request_id = ?',
      [id]
    );
    if (lineCount[0].cnt < 1) {
      return res.status(400).json({ error: 'La demande doit avoir au moins une ligne' });
    }

    await pool.execute(`UPDATE budget_requests SET status = 'submitted' WHERE id = ?`, [id]);

    // Notify all budget validators
    const validatorIds = await getBudgetValidators();
    for (const vid of validatorIds) {
      if (vid !== req.user.id) {
        await createNotification(
          vid,
          'budget_request_submitted',
          'Nouvelle demande de budget soumise',
          `La demande "${request.label}" a été soumise et attend votre approbation.`,
          'budget_request',
          id
        );
      }
    }

    const [updatedRows] = await pool.execute('SELECT * FROM budget_requests WHERE id = ?', [id]);
    const [lineRows] = await pool.execute('SELECT * FROM budget_request_lines WHERE request_id = ? ORDER BY sort_order', [id]);
    const result = mapRequest(updatedRows[0]);
    result.lines = lineRows.map(mapRequestLine);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /requests/:id/approve
router.post('/requests/:id/approve', async (req, res) => {
  try {
    if (!(await isBudgetValidator(req.user.id, req.user.role))) return res.status(403).json({ error: 'Accès refusé' });
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM budget_requests WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Demande non trouvée' });
    const request = rows[0];
    if (request.status !== 'submitted') return res.status(400).json({ error: 'Seules les demandes soumises peuvent être approuvées' });

    await pool.execute(
      `UPDATE budget_requests SET status = 'approved', approver_id = ?, approved_at = NOW() WHERE id = ?`,
      [req.user.id, id]
    );

    // Create real budget
    const realBudgetId = uuidv4();
    await pool.execute(
      `INSERT INTO real_budgets (id, request_id, user_id, label, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [realBudgetId, id, request.user_id, request.label, request.start_date, request.end_date]
    );

    // Copy lines
    const [lineRows] = await pool.execute(
      'SELECT * FROM budget_request_lines WHERE request_id = ? ORDER BY sort_order',
      [id]
    );
    for (const line of lineRows) {
      const realLineId = uuidv4();
      await pool.execute(
        `INSERT INTO real_budget_lines (id, real_budget_id, source_line_id, type, label, forecast_amount, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [realLineId, realBudgetId, line.id, line.type, line.label, line.amount, line.sort_order]
      );
    }

    // Notify requester
    await createNotification(
      request.user_id,
      'budget_request_approved',
      'Demande de budget approuvée',
      `Votre demande "${request.label}" a été approuvée. Le budget réel a été créé.`,
      'real_budget',
      realBudgetId
    );

    const [updatedRows] = await pool.execute('SELECT * FROM budget_requests WHERE id = ?', [id]);
    const result = mapRequest(updatedRows[0]);
    result.realBudgetId = realBudgetId;
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /requests/:id/return-to-draft
router.post('/requests/:id/return-to-draft', async (req, res) => {
  try {
    if (!(await isBudgetValidator(req.user.id, req.user.role))) return res.status(403).json({ error: 'Accès refusé' });
    const { id } = req.params;
    const { approverComment } = req.body;
    const [rows] = await pool.execute('SELECT * FROM budget_requests WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Demande non trouvée' });
    const request = rows[0];
    if (request.status !== 'submitted') return res.status(400).json({ error: 'Seules les demandes soumises peuvent être renvoyées en brouillon' });

    await pool.execute(
      `UPDATE budget_requests SET status = 'draft', approver_id = ?, approver_comment = ? WHERE id = ?`,
      [req.user.id, approverComment || null, id]
    );

    await createNotification(
      request.user_id,
      'budget_request_returned',
      'Demande de budget renvoyée en brouillon',
      `Votre demande "${request.label}" a été renvoyée en brouillon${approverComment ? ': ' + approverComment : '.'}`,
      'budget_request',
      id
    );

    const [updatedRows] = await pool.execute('SELECT * FROM budget_requests WHERE id = ?', [id]);
    const [lineRows] = await pool.execute('SELECT * FROM budget_request_lines WHERE request_id = ? ORDER BY sort_order', [id]);
    const result = mapRequest(updatedRows[0]);
    result.lines = lineRows.map(mapRequestLine);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /requests/:id/cancel
router.post('/requests/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM budget_requests WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Demande non trouvée' });
    const request = rows[0];
    if (request.user_id !== req.user.id) return res.status(403).json({ error: 'Accès refusé' });
    if (!['draft', 'submitted'].includes(request.status)) {
      return res.status(400).json({ error: 'Seuls les brouillons et demandes soumises peuvent être annulés' });
    }
    await pool.execute(`UPDATE budget_requests SET status = 'cancelled' WHERE id = ?`, [id]);
    const [updatedRows] = await pool.execute('SELECT * FROM budget_requests WHERE id = ?', [id]);
    res.json(mapRequest(updatedRows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Real Budgets ─────────────────────────────────────────────────────────────

// GET /real
router.get('/real', async (req, res) => {
  try {
    let rows;
    if (await isBudgetValidator(req.user.id, req.user.role)) {
      [rows] = await pool.execute('SELECT * FROM real_budgets ORDER BY created_at DESC');
    } else {
      [rows] = await pool.execute(
        `SELECT rb.* FROM real_budgets rb
         WHERE rb.user_id = ?
            OR rb.id IN (SELECT real_budget_id FROM budget_access_grants WHERE user_id = ?)
         ORDER BY rb.created_at DESC`,
        [req.user.id, req.user.id]
      );
    }
    res.json(rows.map(mapRealBudget));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /real/:id
router.get('/real/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM real_budgets WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Budget non trouvé' });
    const budget = rows[0];

    // Access check
    const canAccess = (await isBudgetValidator(req.user.id, req.user.role)) || budget.user_id === req.user.id;
    if (!canAccess) {
      const [grant] = await pool.execute(
        'SELECT id FROM budget_access_grants WHERE real_budget_id = ? AND user_id = ?',
        [id, req.user.id]
      );
      if (grant.length === 0) return res.status(403).json({ error: 'Accès refusé' });
    }

    const [lineRows] = await pool.execute(
      'SELECT * FROM real_budget_lines WHERE real_budget_id = ? ORDER BY sort_order',
      [id]
    );
    const [detailRows] = await pool.execute(
      `SELECT bld.* FROM budget_line_details bld
       JOIN real_budget_lines rbl ON rbl.id = bld.line_id
       WHERE rbl.real_budget_id = ?
       ORDER BY bld.detail_date DESC, bld.created_at DESC`,
      [id]
    );
    const [grantRows] = await pool.execute(
      `SELECT bag.*, u.first_name, u.last_name, u.email
       FROM budget_access_grants bag
       JOIN users u ON u.id = bag.user_id
       WHERE bag.real_budget_id = ?`,
      [id]
    );

    const detailsByLine = {};
    for (const d of detailRows) {
      if (!detailsByLine[d.line_id]) detailsByLine[d.line_id] = [];
      detailsByLine[d.line_id].push(mapDetail(d));
    }

    const result = mapRealBudget(budget);
    result.lines = lineRows.map((l) => {
      const line = mapRealBudgetLine(l);
      line.details = detailsByLine[l.id] || [];
      return line;
    });
    result.accessGrants = grantRows.map((g) => ({
      id: g.id,
      userId: g.user_id,
      grantedBy: g.granted_by,
      userName: `${g.first_name} ${g.last_name}`,
      userEmail: g.email,
      createdAt: mapDateTime(g.created_at),
    }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /real/:id/status
router.put('/real/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['active', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }
    const [rows] = await pool.execute('SELECT * FROM real_budgets WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Budget non trouvé' });
    const budget = rows[0];
    if (!(await isBudgetValidator(req.user.id, req.user.role)) && budget.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    await pool.execute('UPDATE real_budgets SET status = ? WHERE id = ?', [status, id]);
    const [updatedRows] = await pool.execute('SELECT * FROM real_budgets WHERE id = ?', [id]);
    res.json(mapRealBudget(updatedRows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /real/:id/lines
router.post('/real/:id/lines', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM real_budgets WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Budget non trouvé' });
    const budget = rows[0];
    if (!(await isBudgetValidator(req.user.id, req.user.role)) && budget.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { type, label, forecastAmount } = req.body;
    if (!type || !label) return res.status(400).json({ error: 'Type et libellé requis' });

    const [maxOrder] = await pool.execute(
      'SELECT MAX(sort_order) as mo FROM real_budget_lines WHERE real_budget_id = ?',
      [id]
    );
    const sortOrder = (maxOrder[0].mo || 0) + 1;
    const lineId = uuidv4();
    await pool.execute(
      `INSERT INTO real_budget_lines (id, real_budget_id, type, label, forecast_amount, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
      [lineId, id, type, label, forecastAmount || 0, sortOrder]
    );
    const [lineRows] = await pool.execute('SELECT * FROM real_budget_lines WHERE id = ?', [lineId]);
    const line = mapRealBudgetLine(lineRows[0]);
    line.details = [];
    res.status(201).json(line);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /real/:id/lines/:lineId
router.delete('/real/:id/lines/:lineId', async (req, res) => {
  try {
    const { id, lineId } = req.params;
    const [rows] = await pool.execute('SELECT * FROM real_budgets WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Budget non trouvé' });
    const budget = rows[0];
    if (!(await isBudgetValidator(req.user.id, req.user.role)) && budget.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    await pool.execute('DELETE FROM real_budget_lines WHERE id = ? AND real_budget_id = ?', [lineId, id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /real/:id/lines/:lineId/details
router.post('/real/:id/lines/:lineId/details', async (req, res) => {
  try {
    const { id, lineId } = req.params;
    const [rows] = await pool.execute('SELECT * FROM real_budgets WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Budget non trouvé' });
    const budget = rows[0];

    const canEdit = (await isBudgetValidator(req.user.id, req.user.role)) || budget.user_id === req.user.id;
    if (!canEdit) {
      const [grant] = await pool.execute(
        'SELECT id FROM budget_access_grants WHERE real_budget_id = ? AND user_id = ?',
        [id, req.user.id]
      );
      if (grant.length === 0) return res.status(403).json({ error: 'Accès refusé' });
    }

    const { detailDate, label, paymentMethod, qty, unitPrice, amount, receiptFile, receiptFileName, receiptFileType } = req.body;
    if (!detailDate || !label || !paymentMethod || amount === undefined) {
      return res.status(400).json({ error: 'Date, libellé, mode de paiement et montant requis' });
    }
    const detailId = uuidv4();
    await pool.execute(
      `INSERT INTO budget_line_details (id, line_id, detail_date, label, payment_method, qty, unit_price, amount, receipt_file, receipt_file_name, receipt_file_type, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [detailId, lineId, detailDate, label, paymentMethod, parseFloat(qty) || 1, parseFloat(unitPrice) || 0, amount, receiptFile || null, receiptFileName || null, receiptFileType || null, req.user.id]
    );
    const [detailRows] = await pool.execute('SELECT * FROM budget_line_details WHERE id = ?', [detailId]);
    res.status(201).json(mapDetail(detailRows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /real/:id/lines/:lineId/details/:detailId
router.put('/real/:id/lines/:lineId/details/:detailId', async (req, res) => {
  try {
    const { id, lineId, detailId } = req.params;
    const [rows] = await pool.execute('SELECT * FROM real_budgets WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Budget non trouvé' });
    const budget = rows[0];
    const [detailRows] = await pool.execute('SELECT * FROM budget_line_details WHERE id = ? AND line_id = ?', [detailId, lineId]);
    if (detailRows.length === 0) return res.status(404).json({ error: 'Détail non trouvé' });
    const detail = detailRows[0];

    const canEdit = (await isBudgetValidator(req.user.id, req.user.role)) || budget.user_id === req.user.id || detail.user_id === req.user.id;
    if (!canEdit) return res.status(403).json({ error: 'Accès refusé' });

    const { detailDate, label, paymentMethod, qty, unitPrice, amount, receiptFile, receiptFileName, receiptFileType } = req.body;
    const updates = [];
    const values = [];
    if (detailDate !== undefined) { updates.push('detail_date = ?'); values.push(detailDate); }
    if (label !== undefined) { updates.push('label = ?'); values.push(label); }
    if (paymentMethod !== undefined) { updates.push('payment_method = ?'); values.push(paymentMethod); }
    if (qty !== undefined) { updates.push('qty = ?'); values.push(parseFloat(qty) || 1); }
    if (unitPrice !== undefined) { updates.push('unit_price = ?'); values.push(parseFloat(unitPrice) || 0); }
    if (amount !== undefined) { updates.push('amount = ?'); values.push(amount); }
    if (receiptFile !== undefined) { updates.push('receipt_file = ?'); values.push(receiptFile || null); }
    if (receiptFileName !== undefined) { updates.push('receipt_file_name = ?'); values.push(receiptFileName || null); }
    if (receiptFileType !== undefined) { updates.push('receipt_file_type = ?'); values.push(receiptFileType || null); }

    if (updates.length > 0) {
      values.push(detailId);
      await pool.execute(`UPDATE budget_line_details SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    const [updated] = await pool.execute('SELECT * FROM budget_line_details WHERE id = ?', [detailId]);
    res.json(mapDetail(updated[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /real/:id/lines/:lineId/details/:detailId
router.delete('/real/:id/lines/:lineId/details/:detailId', async (req, res) => {
  try {
    const { id, lineId, detailId } = req.params;
    const [rows] = await pool.execute('SELECT * FROM real_budgets WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Budget non trouvé' });
    const budget = rows[0];
    const [detailRows] = await pool.execute('SELECT * FROM budget_line_details WHERE id = ? AND line_id = ?', [detailId, lineId]);
    if (detailRows.length === 0) return res.status(404).json({ error: 'Détail non trouvé' });
    const detail = detailRows[0];

    const canEdit = (await isBudgetValidator(req.user.id, req.user.role)) || budget.user_id === req.user.id || detail.user_id === req.user.id;
    if (!canEdit) return res.status(403).json({ error: 'Accès refusé' });

    await pool.execute('DELETE FROM budget_line_details WHERE id = ?', [detailId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /real/:id/access
router.post('/real/:id/access', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM real_budgets WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Budget non trouvé' });
    const budget = rows[0];
    if (!(await isBudgetValidator(req.user.id, req.user.role)) && budget.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId requis' });

    const grantId = uuidv4();
    await pool.execute(
      `INSERT IGNORE INTO budget_access_grants (id, real_budget_id, user_id, granted_by) VALUES (?, ?, ?, ?)`,
      [grantId, id, userId, req.user.id]
    );
    const [grantRows] = await pool.execute(
      `SELECT bag.*, u.first_name, u.last_name, u.email
       FROM budget_access_grants bag
       JOIN users u ON u.id = bag.user_id
       WHERE bag.real_budget_id = ? AND bag.user_id = ?`,
      [id, userId]
    );
    const g = grantRows[0];
    res.status(201).json({
      id: g.id,
      userId: g.user_id,
      grantedBy: g.granted_by,
      userName: `${g.first_name} ${g.last_name}`,
      userEmail: g.email,
      createdAt: mapDateTime(g.created_at),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /real/:id/access/:grantId
router.delete('/real/:id/access/:grantId', async (req, res) => {
  try {
    const { id, grantId } = req.params;
    const [rows] = await pool.execute('SELECT * FROM real_budgets WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Budget non trouvé' });
    const budget = rows[0];
    if (!(await isBudgetValidator(req.user.id, req.user.role)) && budget.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    await pool.execute('DELETE FROM budget_access_grants WHERE id = ? AND real_budget_id = ?', [grantId, id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
