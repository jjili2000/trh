const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeStr(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function parseCSV(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  // Remove empty trailing lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length === 0) return { headers: [], rows: [] };

  // Detect delimiter from first line
  const firstLine = lines[0];
  const delimiters = [';', ',', '\t', '|'];
  let delimiter = ';';
  let maxCount = 0;
  for (const d of delimiters) {
    const count = firstLine.split(d).length - 1;
    if (count > maxCount) {
      maxCount = count;
      delimiter = d;
    }
  }

  function parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    const values = parseLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx] : '';
    });
    rows.push(row);
  }
  return { headers, rows };
}

function detectColumnMapping(headers) {
  const patterns = {
    date: ['date', 'date operation', 'date operacion', 'dateop', 'date op'],
    label: ['libelle', 'libelle operation', 'description', 'label', 'operation', 'intitule', 'intitule operation'],
    debit: ['debit', 'montant debit', 'sortie', 'depense'],
    credit: ['credit', 'montant credit', 'entree', 'recette'],
    amount: ['montant', 'amount', 'valeur'],
  };

  const mapping = {};
  for (const [key, candidates] of Object.entries(patterns)) {
    for (const header of headers) {
      const norm = normalizeStr(header);
      if (candidates.some(c => norm === c || norm.includes(c))) {
        if (!mapping[key]) mapping[key] = header;
        break;
      }
    }
  }
  // If we found both debit and credit, don't use amount
  if (mapping.debit && mapping.credit) {
    delete mapping.amount;
  }
  return mapping;
}

function parseAmount(str) {
  if (!str || str.trim() === '') return null;
  // Remove thousand separators (spaces or dots used as thousand sep)
  let s = String(str).trim();
  // Remove currency symbols
  s = s.replace(/[€$£]/g, '').trim();
  // Replace French decimal comma — but only if there's a comma and the part after is <= 2 digits
  // First check if it looks like French format: "1 234,56" or "1234,56"
  if (s.includes(',') && !s.includes('.')) {
    // French format: comma is decimal separator
    s = s.replace(/\s/g, '').replace(',', '.');
  } else if (s.includes(',') && s.includes('.')) {
    // Both: dots are thousand separators, comma is decimal
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Remove spaces (thousand separators)
    s = s.replace(/\s/g, '');
  }
  const val = parseFloat(s);
  return isNaN(val) ? null : val;
}

function detectPaymentMethod(label) {
  if (!label) return 'other';
  const u = label.toUpperCase();
  if (/PRLV|PRELEVEMENT|PRÉLÈVEMENT/.test(u)) return 'direct_debit';
  if (/\bVIR\b|VIREMENT/.test(u)) return 'transfer';
  if (/\bCB\b|CARTE|TPE|PAIEMENT CB/.test(u)) return 'card';
  if (/\bCHQ\b|CHEQUE|CHÈQUE/.test(u)) return 'check';
  if (/ESPECE|ESPÈCE|RETRAIT/.test(u)) return 'cash';
  return 'other';
}

function extractBlocks(label) {
  if (!label) return { mdt: null, lib: null, motif: null, rnf: null };
  const blockRegex = /(MDT|LIB|MOTIF|RNF)\s*[:\-]?\s*/gi;
  const result = { mdt: null, lib: null, motif: null, rnf: null };

  // Split on block keywords (keep delimiters)
  const parts = label.split(/(MDT|LIB|MOTIF|RNF)\s*[:\-]?\s*/i);
  // parts: [before, keyword1, value_until_next_keyword_or_end, keyword2, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const keyword = parts[i].toUpperCase().trim();
    const value = parts[i + 1] ? parts[i + 1].trim() : null;
    if (!value) continue;
    // value might contain the start of the next block — trim at the next keyword occurrence
    const trimmed = value.replace(/(MDT|LIB|MOTIF|RNF)\s*[:\-]?\s*.*$/i, '').trim();
    if (keyword === 'MDT') result.mdt = trimmed || null;
    else if (keyword === 'LIB') result.lib = trimmed || null;
    else if (keyword === 'MOTIF') result.motif = trimmed || null;
    else if (keyword === 'RNF') result.rnf = trimmed || null;
  }

  // Suppress the blockRegex warning — we defined it but used split with inline regex
  void blockRegex;
  return result;
}

function extractThirdParty(label, method, direction) {
  if (!label) return null;

  if (method === 'card') {
    // Remove prefix
    let s = label.replace(/^(PAIEMENT CB|CARTE|CB)\s*/i, '').trim();
    // Remove trailing date-like patterns and block markers
    s = s.replace(/\s+(MDT|LIB|MOTIF|RNF)\s*[:\-]?.*/i, '').trim();
    return s || null;
  }

  if (method === 'direct_debit') {
    const m = label.match(/(?:PRLV SEPA|PRLV)\s+(.+?)(?:\s+(?:MDT|LIB|MOTIF|RNF)\s*[:\-]|$)/i);
    return m ? m[1].trim() : null;
  }

  if (method === 'transfer') {
    if (direction === 'credit') {
      const m = label.match(/RECU DE\s*:?\s*(.+?)(?:\s+(?:MDT|LIB|MOTIF|RNF)\s*[:\-]|$)/i);
      return m ? m[1].trim() : null;
    } else {
      const m = label.match(/POUR\s*:?\s*(.+?)(?:\s+(?:MDT|LIB|MOTIF|RNF)\s*[:\-]|$)/i);
      return m ? m[1].trim() : null;
    }
  }

  return null;
}

function testCondition(op, cond) {
  const fieldVal = op[cond.field];
  if (fieldVal === null || fieldVal === undefined) {
    return cond.operator === 'notContains';
  }
  const a = String(fieldVal).toLowerCase();
  const b = String(cond.value).toLowerCase();
  switch (cond.operator) {
    case 'contains': return a.includes(b);
    case 'equals': return a === b;
    case 'startsWith': return a.startsWith(b);
    case 'endsWith': return a.endsWith(b);
    case 'notContains': return !a.includes(b);
    default: return false;
  }
}

function applyRulesToOp(op, rules) {
  for (const rule of rules) {
    const conditions = rule.conditions || [];
    if (conditions.length === 0) continue;
    let match;
    if (rule.conditionOperator === 'OR') {
      match = conditions.some(c => testCondition(op, c));
    } else {
      match = conditions.every(c => testCondition(op, c));
    }
    if (match) return rule;
  }
  return null;
}

function parseDate(str) {
  if (!str) return null;
  // Try DD/MM/YYYY
  const ddmmyyyy = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  // Try YYYY-MM-DD
  const yyyymmdd = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymmdd) return str;
  // Try DD-MM-YYYY
  const ddmmyyyy2 = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy2) return `${ddmmyyyy2[3]}-${ddmmyyyy2[2]}-${ddmmyyyy2[1]}`;
  return null;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /accounting/import/preview
router.post('/import/preview', async (req, res) => {
  try {
    const { content, filename } = req.body;
    if (!content) return res.status(400).json({ error: 'Contenu CSV requis' });

    const { headers, rows } = parseCSV(content);
    const detectedMapping = detectColumnMapping(headers);
    const preview = rows.slice(0, 5);

    res.json({
      headers,
      rows: preview,
      detectedMapping,
      totalRows: rows.length,
      filename: filename || '',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de l\'analyse du fichier' });
  }
});

// POST /accounting/import/confirm
router.post('/import/confirm', async (req, res) => {
  try {
    const { content, filename, label, mapping } = req.body;
    if (!content || !label || !mapping) {
      return res.status(400).json({ error: 'Contenu, libellé et mapping requis' });
    }

    const { headers, rows } = parseCSV(content);
    void headers;

    const importId = uuidv4();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Parse all rows
    const operations = [];
    for (const row of rows) {
      const rawDateStr = mapping.date ? row[mapping.date] : null;
      const operationDate = parseDate(rawDateStr);
      if (!operationDate) continue; // skip rows without valid date

      const rawLabel = mapping.label ? row[mapping.label] : null;

      let direction;
      let amount;

      if (mapping.debit && mapping.credit) {
        // Separate debit/credit columns
        const debitVal = parseAmount(row[mapping.debit]);
        const creditVal = parseAmount(row[mapping.credit]);
        if (creditVal !== null && creditVal !== 0) {
          direction = 'credit';
          amount = Math.abs(creditVal);
        } else if (debitVal !== null && debitVal !== 0) {
          direction = 'debit';
          amount = Math.abs(debitVal);
        } else {
          continue; // skip zero/empty rows
        }
      } else if (mapping.amount) {
        const amountVal = parseAmount(row[mapping.amount]);
        if (amountVal === null) continue;
        if (mapping.direction && row[mapping.direction]) {
          direction = String(row[mapping.direction]).toLowerCase().includes('debit') ? 'debit' : 'credit';
          amount = Math.abs(amountVal);
        } else {
          direction = amountVal >= 0 ? 'credit' : 'debit';
          amount = Math.abs(amountVal);
        }
      } else {
        continue;
      }

      const paymentMethod = detectPaymentMethod(rawLabel);
      const blocks = extractBlocks(rawLabel);
      const thirdParty = extractThirdParty(rawLabel, paymentMethod, direction);

      operations.push({
        id: uuidv4(),
        importId,
        operationDate,
        direction,
        paymentMethod,
        amount,
        rawLabel: rawLabel || null,
        thirdParty,
        blockMDT: blocks.mdt,
        blockLIB: blocks.lib,
        blockMOTIF: blocks.motif,
        blockRNF: blocks.rnf,
        category: null,
        categorySource: 'none',
        ruleId: null,
        createdAt: now,
      });
    }

    // Insert import record
    await pool.execute(
      `INSERT INTO bank_imports (id, userId, label, fileName, importedAt, operationCount) VALUES (?, ?, ?, ?, NOW(), ?)`,
      [importId, req.user.id, label, filename || '', operations.length]
    );

    // Insert operations in batches
    for (const op of operations) {
      await pool.execute(
        `INSERT INTO bank_operations (id, importId, operationDate, direction, paymentMethod, amount, rawLabel, thirdParty, blockMDT, blockLIB, blockMOTIF, blockRNF, category, categorySource, ruleId, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [op.id, op.importId, op.operationDate, op.direction, op.paymentMethod, op.amount,
         op.rawLabel, op.thirdParty, op.blockMDT, op.blockLIB, op.blockMOTIF, op.blockRNF,
         op.category, op.categorySource, op.ruleId, op.createdAt]
      );
    }

    res.status(201).json({ importId, count: operations.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de l\'import' });
  }
});

// GET /accounting/operations
router.get('/operations', async (req, res) => {
  try {
    const { importId, direction, paymentMethod, category, search, dateFrom, dateTo } = req.query;

    let sql = `SELECT bo.* FROM bank_operations bo
               JOIN bank_imports bi ON bi.id = bo.importId
               WHERE bi.userId = ?`;
    const params = [req.user.id];

    if (importId) { sql += ' AND bo.importId = ?'; params.push(importId); }
    if (direction) { sql += ' AND bo.direction = ?'; params.push(direction); }
    if (paymentMethod) { sql += ' AND bo.paymentMethod = ?'; params.push(paymentMethod); }
    if (category === '__none__') {
      sql += ' AND (bo.category IS NULL OR bo.category = \'\')';
    } else if (category) {
      sql += ' AND bo.category = ?'; params.push(category);
    }
    if (search) {
      sql += ' AND (bo.rawLabel LIKE ? OR bo.thirdParty LIKE ? OR bo.blockLIB LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    if (dateFrom) { sql += ' AND bo.operationDate >= ?'; params.push(dateFrom); }
    if (dateTo) { sql += ' AND bo.operationDate <= ?'; params.push(dateTo); }

    sql += ' ORDER BY bo.operationDate DESC, bo.createdAt DESC';

    const [rows] = await pool.execute(sql, params);
    res.json(rows.map(mapOperation));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /accounting/operations/:id
router.put('/operations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { category, categorySource } = req.body;

    // Verify ownership
    const [rows] = await pool.execute(
      `SELECT bo.* FROM bank_operations bo JOIN bank_imports bi ON bi.id = bo.importId WHERE bo.id = ? AND bi.userId = ?`,
      [id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Opération non trouvée' });

    await pool.execute(
      `UPDATE bank_operations SET category = ?, categorySource = ? WHERE id = ?`,
      [category || null, categorySource || 'manual', id]
    );
    const [updated] = await pool.execute('SELECT * FROM bank_operations WHERE id = ?', [id]);
    res.json(mapOperation(updated[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /accounting/imports
router.get('/imports', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM bank_imports WHERE userId = ? ORDER BY importedAt DESC`,
      [req.user.id]
    );
    res.json(rows.map(mapImport));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /accounting/imports/:id
router.delete('/imports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT * FROM bank_imports WHERE id = ? AND userId = ?`,
      [id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Import non trouvé' });

    await pool.execute('DELETE FROM bank_imports WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /accounting/rules
router.get('/rules', async (req, res) => {
  try {
    const [rules] = await pool.execute(
      `SELECT * FROM accounting_rules WHERE userId = ? ORDER BY priority DESC, createdAt DESC`,
      [req.user.id]
    );
    const [conditions] = await pool.execute(
      `SELECT arc.* FROM accounting_rule_conditions arc
       JOIN accounting_rules ar ON ar.id = arc.ruleId
       WHERE ar.userId = ?`,
      [req.user.id]
    );

    const condsByRule = {};
    for (const c of conditions) {
      if (!condsByRule[c.ruleId]) condsByRule[c.ruleId] = [];
      condsByRule[c.ruleId].push(mapCondition(c));
    }

    res.json(rules.map(r => ({ ...mapRule(r), conditions: condsByRule[r.id] || [] })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /accounting/rules
router.post('/rules', async (req, res) => {
  try {
    const { label, conditionOperator, category, conditions, priority } = req.body;
    if (!label || !category) return res.status(400).json({ error: 'Libellé et catégorie requis' });

    const ruleId = uuidv4();
    await pool.execute(
      `INSERT INTO accounting_rules (id, userId, label, conditionOperator, category, priority, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [ruleId, req.user.id, label, conditionOperator || 'AND', category, priority || 0]
    );

    if (Array.isArray(conditions)) {
      for (const cond of conditions) {
        await pool.execute(
          `INSERT INTO accounting_rule_conditions (id, ruleId, field, operator, value) VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), ruleId, cond.field, cond.operator, cond.value]
        );
      }
    }

    const [ruleRows] = await pool.execute('SELECT * FROM accounting_rules WHERE id = ?', [ruleId]);
    const [condRows] = await pool.execute('SELECT * FROM accounting_rule_conditions WHERE ruleId = ?', [ruleId]);
    res.status(201).json({ ...mapRule(ruleRows[0]), conditions: condRows.map(mapCondition) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /accounting/rules/:id
router.put('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT * FROM accounting_rules WHERE id = ? AND userId = ?`,
      [id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Règle non trouvée' });

    const { label, conditionOperator, category, conditions, priority } = req.body;
    await pool.execute(
      `UPDATE accounting_rules SET label = ?, conditionOperator = ?, category = ?, priority = ? WHERE id = ?`,
      [label, conditionOperator || 'AND', category, priority || 0, id]
    );

    // Replace conditions
    await pool.execute('DELETE FROM accounting_rule_conditions WHERE ruleId = ?', [id]);
    if (Array.isArray(conditions)) {
      for (const cond of conditions) {
        await pool.execute(
          `INSERT INTO accounting_rule_conditions (id, ruleId, field, operator, value) VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), id, cond.field, cond.operator, cond.value]
        );
      }
    }

    const [ruleRows] = await pool.execute('SELECT * FROM accounting_rules WHERE id = ?', [id]);
    const [condRows] = await pool.execute('SELECT * FROM accounting_rule_conditions WHERE ruleId = ?', [id]);
    res.json({ ...mapRule(ruleRows[0]), conditions: condRows.map(mapCondition) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /accounting/rules/:id
router.delete('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT * FROM accounting_rules WHERE id = ? AND userId = ?`,
      [id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Règle non trouvée' });

    await pool.execute('DELETE FROM accounting_rules WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /accounting/rules/apply-all
router.post('/rules/apply-all', async (req, res) => {
  try {
    // Load all rules with conditions for this user, sorted by priority desc
    const [rules] = await pool.execute(
      `SELECT * FROM accounting_rules WHERE userId = ? ORDER BY priority DESC, createdAt DESC`,
      [req.user.id]
    );
    const [allConds] = await pool.execute(
      `SELECT arc.* FROM accounting_rule_conditions arc
       JOIN accounting_rules ar ON ar.id = arc.ruleId
       WHERE ar.userId = ?`,
      [req.user.id]
    );

    const condsByRule = {};
    for (const c of allConds) {
      if (!condsByRule[c.ruleId]) condsByRule[c.ruleId] = [];
      condsByRule[c.ruleId].push(c);
    }
    const rulesWithConds = rules.map(r => ({ ...r, conditions: condsByRule[r.id] || [] }));

    // Load all operations for this user that don't have a manual category
    const [ops] = await pool.execute(
      `SELECT bo.* FROM bank_operations bo
       JOIN bank_imports bi ON bi.id = bo.importId
       WHERE bi.userId = ? AND (bo.categorySource != 'manual' OR bo.categorySource IS NULL)`,
      [req.user.id]
    );

    let updated = 0;
    for (const op of ops) {
      const opObj = mapOperation(op);
      const matchedRule = applyRulesToOp(opObj, rulesWithConds);
      if (matchedRule) {
        await pool.execute(
          `UPDATE bank_operations SET category = ?, categorySource = 'rule', ruleId = ? WHERE id = ?`,
          [matchedRule.category, matchedRule.id, op.id]
        );
        updated++;
      }
    }

    res.json({ updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /accounting/categories
router.get('/categories', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT bo.category FROM bank_operations bo
       JOIN bank_imports bi ON bi.id = bo.importId
       WHERE bi.userId = ? AND bo.category IS NOT NULL AND bo.category != ''
       ORDER BY bo.category`,
      [req.user.id]
    );
    res.json(rows.map(r => r.category));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapImport(row) {
  return {
    id: row.id,
    userId: row.userId,
    label: row.label,
    fileName: row.fileName,
    importedAt: row.importedAt instanceof Date ? row.importedAt.toISOString() : row.importedAt,
    operationCount: row.operationCount,
  };
}

function mapOperation(row) {
  return {
    id: row.id,
    importId: row.importId,
    operationDate: row.operationDate instanceof Date ? row.operationDate.toISOString().slice(0, 10) : String(row.operationDate).slice(0, 10),
    direction: row.direction,
    paymentMethod: row.paymentMethod,
    amount: parseFloat(row.amount),
    rawLabel: row.rawLabel || null,
    thirdParty: row.thirdParty || null,
    blockMDT: row.blockMDT || null,
    blockLIB: row.blockLIB || null,
    blockMOTIF: row.blockMOTIF || null,
    blockRNF: row.blockRNF || null,
    category: row.category || null,
    categorySource: row.categorySource || 'none',
    ruleId: row.ruleId || null,
  };
}

function mapRule(row) {
  return {
    id: row.id,
    userId: row.userId,
    label: row.label,
    conditionOperator: row.conditionOperator,
    category: row.category,
    priority: row.priority,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

function mapCondition(row) {
  return {
    id: row.id,
    ruleId: row.ruleId,
    field: row.field,
    operator: row.operator,
    value: row.value,
  };
}

module.exports = router;
