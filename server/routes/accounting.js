const express = require('express');
const crypto = require('crypto');
const fs   = require('fs');
const path = require('path');
const pool = require('../db');

const router = express.Router();

// Répertoire de stockage des fichiers bancaires importés
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'accounting');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

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
  // Order matters: check PRLV before VIR, FACTURE CARTE before generic CARTE
  if (/\bPRLV\b/.test(u)) return 'direct_debit';
  if (/FACTURE CARTE/.test(u)) return 'card';
  if (/\b(VIR|VIREMENT)\b/.test(u)) return 'transfer';
  if (/REMISE CHEQUES/.test(u) || /^CHEQUE\s+\d/.test(u)) return 'check';
  if (/VRST ESPECES/.test(u) || /\bRETRAIT\b/.test(u)) return 'cash';
  if (/\bCB\b|TPE|PAIEMENT CB/.test(u)) return 'card';
  if (/\bCHQ\b|CHEQUE|CHÈQUE/.test(u)) return 'check';
  if (/ESPECE|ESPÈCE/.test(u)) return 'cash';
  return 'other';
}

function extractBlocks(label) {
  if (!label) return { mdt: null, lib: null, motif: null, rnf: null };
  const result = { mdt: null, lib: null, motif: null, rnf: null };

  // Format A — Prélèvements SEPA: KEYWORD/value (no space, slash directly after keyword)
  // e.g. "MDT/SLMP016979860 REF/... LIB/FFT - PRELEVEMENT..."
  const mdtMatch = label.match(/\bMDT\/(\S+)/i);
  if (mdtMatch) result.mdt = mdtMatch[1];

  // LIB/ — value goes to end of string
  const libMatch = label.match(/\bLIB\/(.+)$/i);
  if (libMatch) result.lib = libMatch[1].trim();

  // Format B — Virements SEPA: /KEYWORD value (slash prefix before keyword)
  // e.g. "/MOTIF PAIE JSA AVR26 /BEN DUPONT /REFDO ..."
  // /MOTIF value — captured until next /WORD or end
  const motifMatch = label.match(/\/MOTIF\s+(.+?)(?=\s+\/[A-Z]{2,}|$)/i);
  if (motifMatch) result.motif = motifMatch[1].trim();

  // /RNF value — until next /WORD or end (sometimes empty)
  const rnfMatch = label.match(/\/RNF\s+(.+?)(?=\s+\/[A-Z]{2,}|$)/i);
  if (rnfMatch && rnfMatch[1].trim()) result.rnf = rnfMatch[1].trim();

  return result;
}

function extractThirdParty(label, method, direction) {
  if (!label) return null;

  // Virement crédit: /FRM value until /EID or next /TAG
  if (method === 'transfer' && direction === 'credit') {
    const m = label.match(/\/FRM\s+(.+?)(?=\s+\/[A-Z]{2,}|$)/i);
    return m ? m[1].trim() : null;
  }

  // Virement débit: /BEN value until /REFDO or next /TAG
  if (method === 'transfer' && direction === 'debit') {
    const m = label.match(/\/BEN\s+(.+?)(?=\s+\/[A-Z]{2,}|$)/i);
    return m ? m[1].trim() : null;
  }

  // Prélèvement SEPA: text after "PRLV SEPA [B2B ]" until " ECH/" or " ID EMETTEUR/"
  if (method === 'direct_debit') {
    const m = label.match(/PRLV\s+SEPA\s+(?:B2B\s+)?(.+?)(?=\s+ECH\/|\s+ID\s+EMETTEUR\/|$)/i);
    return m ? m[1].trim() : null;
  }

  // Carte: merchant after "FACTURE CARTE DU DDMMYY " — trim at 2+ spaces or CARTE keyword
  if (method === 'card') {
    const m = label.match(/FACTURE CARTE DU \d{6}\s+(.+?)(?:\s{2,}|\s+CARTE\s+\d{4}|$)/i);
    return m ? m[1].trim() : null;
  }

  // Chèque
  if (method === 'check') {
    if (/REMISE CHEQUES/i.test(label)) return 'Remise de chèques';
    const m = label.match(/CHEQUE\s+(\d+)/i);
    return m ? `Chèque n°${m[1]}` : null;
  }

  // Espèces
  if (/VRST ESPECES/i.test(label)) return 'Versement espèces';
  if (/INTERETS ET COMMISSIONS/i.test(label)) return 'Intérêts et commissions';

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

// ─── rawRows helpers ──────────────────────────────────────────────────────────

// Find the row index that contains the actual column headers (skip bank metadata rows)
function findHeaderRow(rawRows) {
  for (let i = 0; i < Math.min(rawRows.length, 8); i++) {
    const cells = rawRows[i].map(c => normalizeStr(String(c || '')));
    const hasDate = cells.some(c => (c.includes('date') && c.length < 25) || c === 'date operation');
    const hasAmount = cells.some(c =>
      c.includes('montant') || c === 'debit' || c === 'credit' ||
      c.includes('debit') || c.includes('credit')
    );
    if (hasDate && hasAmount) return i;
  }
  return 0;
}

// Convert rawRows (string[][]) to [{header: value, ...}] using detected header row
function rawRowsToMapped(rawRows) {
  const headerIdx = findHeaderRow(rawRows);
  const headers = rawRows[headerIdx].map(c => String(c || '').trim());
  const dataRows = rawRows.slice(headerIdx + 1)
    .filter(row => row.some(c => c !== null && c !== undefined && String(c).trim() !== ''));
  const rows = dataRows.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = String(row[i] !== undefined && row[i] !== null ? row[i] : '').trim(); });
    return obj;
  });
  return { headers, rows };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /accounting/import/parse-file
// Reçoit { fileData: string (base64 data-URL), fileName: string }
// Retourne { rawRows: string[][] }
router.post('/import/parse-file', async (req, res) => {
  try {
    const { fileData, fileName } = req.body;
    if (!fileData) return res.status(400).json({ error: 'fileData requis' });

    // Séparer le préfixe data-URL du contenu base64
    const base64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const buffer = Buffer.from(base64, 'base64');
    const ext = (fileName || '').split('.').pop().toLowerCase();

    let rawRows;

    if (ext === 'xlsx' || ext === 'xls') {
      // Parsing Excel avec SheetJS (supporte .xls BIFF et .xlsx)
      const XLSX = require('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const ws = workbook.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      rawRows = aoa.map(row =>
        row.map(v => {
          if (v == null) return '';
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          return String(v);
        })
      ).filter(row => row.some(c => c !== ''));
    } else {
      // Parsing CSV / TXT
      const text = buffer.toString('utf8').replace(/^﻿/, ''); // strip BOM
      const lines = text.split(/\r?\n/);
      rawRows = lines.map(line => {
        // Gère les séparateurs , et ; et les champs entre guillemets
        const sep = line.includes(';') ? ';' : ',';
        const cells = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"') { inQ = !inQ; }
          else if (c === sep && !inQ) { cells.push(cur.trim()); cur = ''; }
          else { cur += c; }
        }
        cells.push(cur.trim());
        return cells;
      }).filter(row => row.some(c => c !== ''));
    }

    res.json({ rawRows });
  } catch (err) {
    console.error('[parse-file]', err.message);
    res.status(500).json({ error: `Impossible de lire le fichier : ${err.message}` });
  }
});

// POST /accounting/import/preview
// Accepts: { rawRows: string[][], filename } (parsed server-side via /import/parse-file)
router.post('/import/preview', async (req, res) => {
  try {
    const { rawRows, filename } = req.body;
    if (!rawRows || !Array.isArray(rawRows)) return res.status(400).json({ error: 'rawRows requis' });

    const { headers, rows } = rawRowsToMapped(rawRows);
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
// Accepts: { rawRows: string[][], filename, label, mapping }
router.post('/import/confirm', async (req, res) => {
  try {
    const { rawRows, fileData, filename, label, mapping, periodId } = req.body;
    if (!rawRows || !label || !mapping) {
      return res.status(400).json({ error: 'rawRows, libellé et mapping requis' });
    }

    // Vérifier que la période appartient à l'utilisateur si fournie
    if (periodId) {
      const [pRows] = await pool.execute(
        'SELECT id FROM accounting_periods WHERE id = ? AND userId = ?',
        [periodId, req.user.id]
      );
      if (pRows.length === 0) return res.status(400).json({ error: 'Période introuvable' });
    }

    const { rows } = rawRowsToMapped(rawRows);

    const importId = crypto.randomUUID();
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
        id: crypto.randomUUID(),
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

    // Compute a dedup hash per operation (userId + date + direction + amount + rawLabel)
    for (const op of operations) {
      const hashInput = [req.user.id, op.operationDate, op.direction, op.amount.toFixed(2), op.rawLabel || ''].join('|');
      op.operationHash = crypto.createHash('sha256').update(hashInput).digest('hex');
    }

    // Load all existing hashes for this user to detect duplicates in memory
    const [existingHashRows] = await pool.execute(
      `SELECT bo.operationHash FROM bank_operations bo
       JOIN bank_imports bi ON bi.id = bo.importId
       WHERE bi.userId = ? AND bo.operationHash IS NOT NULL`,
      [req.user.id]
    );
    const existingHashes = new Set(existingHashRows.map(r => r.operationHash));

    // Partition into new vs duplicate
    const toInsert = operations.filter(op => !existingHashes.has(op.operationHash));
    const skipped  = operations.length - toInsert.length;

    // Sauvegarder le fichier source sur disque (piste d'audit)
    let storedFileName = null;
    if (fileData && toInsert.length > 0) {
      try {
        const base64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;
        const buf = Buffer.from(base64, 'base64');
        storedFileName = `${importId}_${(filename || 'import').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, storedFileName), buf);
      } catch (e) {
        console.warn('[import/confirm] impossible de sauvegarder le fichier :', e.message);
      }
    }

    // Insert import record (only if at least one new operation)
    if (toInsert.length > 0) {
      await pool.execute(
        `INSERT INTO bank_imports (id, userId, periodId, label, fileName, storedFileName, importedAt, operationCount) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)`,
        [importId, req.user.id, periodId || null, label, filename || '', storedFileName, toInsert.length]
      );
    }

    // Insert non-duplicate operations
    for (const op of toInsert) {
      await pool.execute(
        `INSERT INTO bank_operations (id, importId, operationDate, direction, paymentMethod, amount, rawLabel, thirdParty, blockMDT, blockLIB, blockMOTIF, blockRNF, category, categorySource, ruleId, operationHash, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [op.id, op.importId, op.operationDate, op.direction, op.paymentMethod, op.amount,
         op.rawLabel, op.thirdParty, op.blockMDT, op.blockLIB, op.blockMOTIF, op.blockRNF,
         op.category, op.categorySource, op.ruleId, op.operationHash, op.createdAt]
      );
    }

    const totalRows   = rawRows.length;
    const invalidRows = totalRows - operations.length; // rows skipped at parse time (no date/amount)

    res.status(201).json({
      importId: toInsert.length > 0 ? importId : null,
      total:    totalRows,
      parsed:   operations.length,
      imported: toInsert.length,
      skipped,
      invalid:  invalidRows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de l\'import' });
  }
});

// GET /accounting/operations
router.get('/operations', async (req, res) => {
  try {
    const { importId, periodId, direction, paymentMethod, category, search, dateFrom, dateTo } = req.query;

    let sql = `SELECT bo.*, ar.label as ruleName, ap.label as periodLabel, ap.id as periodId
               FROM bank_operations bo
               JOIN bank_imports bi ON bi.id = bo.importId
               LEFT JOIN accounting_rules ar ON ar.id = bo.ruleId
               LEFT JOIN accounting_periods ap ON ap.id = bi.periodId
               WHERE bi.userId = ?`;
    const params = [req.user.id];

    if (importId)  { sql += ' AND bo.importId = ?'; params.push(importId); }
    if (periodId)  { sql += ' AND bi.periodId = ?'; params.push(periodId); }
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
    if (dateTo)   { sql += ' AND bo.operationDate <= ?'; params.push(dateTo); }

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

// DELETE /accounting/operations  — delete ALL operations (and their imports) for this user
router.delete('/operations', async (req, res) => {
  try {
    const [imports] = await pool.execute('SELECT storedFileName FROM bank_imports WHERE userId = ?', [req.user.id]);
    for (const imp of imports) {
      if (imp.storedFileName) {
        try { fs.unlinkSync(path.join(UPLOADS_DIR, imp.storedFileName)); } catch (_) {}
      }
    }
    await pool.execute('DELETE FROM bank_imports WHERE userId = ?', [req.user.id]);
    res.json({ success: true });
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

    // Supprimer le fichier stocké
    if (rows[0].storedFileName) {
      try { fs.unlinkSync(path.join(UPLOADS_DIR, rows[0].storedFileName)); } catch (_) {}
    }
    await pool.execute('DELETE FROM bank_imports WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Accounting Periods ───────────────────────────────────────────────────────

// GET /accounting/periods
router.get('/periods', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT ap.*,
              COUNT(bi.id) AS importCount
       FROM accounting_periods ap
       LEFT JOIN bank_imports bi ON bi.periodId = ap.id
       WHERE ap.userId = ?
       GROUP BY ap.id
       ORDER BY ap.startDate DESC`,
      [req.user.id]
    );
    res.json(rows.map(mapPeriod));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /accounting/periods
router.post('/periods', async (req, res) => {
  try {
    const { label, startDate, endDate } = req.body;
    if (!label || !startDate || !endDate) {
      return res.status(400).json({ error: 'Libellé, date début et date fin requis' });
    }
    if (startDate >= endDate) {
      return res.status(400).json({ error: 'La date de fin doit être postérieure à la date de début' });
    }
    const id = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO accounting_periods (id, userId, label, startDate, endDate, createdAt) VALUES (?, ?, ?, ?, ?, NOW())`,
      [id, req.user.id, label, startDate, endDate]
    );
    const [rows] = await pool.execute('SELECT *, 0 AS importCount FROM accounting_periods WHERE id = ?', [id]);
    res.status(201).json(mapPeriod(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /accounting/periods/:id
router.put('/periods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { label, startDate, endDate } = req.body;
    const [rows] = await pool.execute('SELECT * FROM accounting_periods WHERE id = ? AND userId = ?', [id, req.user.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Période non trouvée' });
    if (!label || !startDate || !endDate) {
      return res.status(400).json({ error: 'Libellé, date début et date fin requis' });
    }
    if (startDate >= endDate) {
      return res.status(400).json({ error: 'La date de fin doit être postérieure à la date de début' });
    }
    await pool.execute(
      `UPDATE accounting_periods SET label = ?, startDate = ?, endDate = ? WHERE id = ?`,
      [label, startDate, endDate, id]
    );
    const [updated] = await pool.execute(
      `SELECT ap.*, COUNT(bi.id) AS importCount FROM accounting_periods ap LEFT JOIN bank_imports bi ON bi.periodId = ap.id WHERE ap.id = ? GROUP BY ap.id`,
      [id]
    );
    res.json(mapPeriod(updated[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /accounting/periods/:id — only if no imports linked
router.delete('/periods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM accounting_periods WHERE id = ? AND userId = ?', [id, req.user.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Période non trouvée' });

    const [imports] = await pool.execute('SELECT COUNT(*) as cnt FROM bank_imports WHERE periodId = ?', [id]);
    if (imports[0].cnt > 0) {
      return res.status(400).json({ error: 'Impossible de supprimer une période ayant des imports rattachés' });
    }
    await pool.execute('DELETE FROM accounting_periods WHERE id = ?', [id]);
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

    const ruleId = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO accounting_rules (id, userId, label, conditionOperator, category, priority, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [ruleId, req.user.id, label, conditionOperator || 'AND', category, priority || 0]
    );

    if (Array.isArray(conditions)) {
      for (const cond of conditions) {
        await pool.execute(
          `INSERT INTO accounting_rule_conditions (id, ruleId, field, operator, value) VALUES (?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), ruleId, cond.field, cond.operator, cond.value]
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
          [crypto.randomUUID(), id, cond.field, cond.operator, cond.value]
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

// DELETE /accounting/rules/bulk  — delete multiple rules by id array in body { ids: [...] }
router.delete('/rules/bulk', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids requis' });
    for (const id of ids) {
      const [rows] = await pool.execute(
        'SELECT id FROM accounting_rules WHERE id = ? AND userId = ?',
        [id, req.user.id]
      );
      if (rows.length > 0) {
        await pool.execute('DELETE FROM accounting_rules WHERE id = ?', [id]);
      }
    }
    res.json({ success: true });
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
// Body optionnel : { ruleId } pour comptabiliser séparément les opérations matchées par cette règle
router.post('/rules/apply-all', async (req, res) => {
  try {
    const { ruleId: targetRuleId } = req.body || {};

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
    let updatedByRule = 0;
    for (const op of ops) {
      const opObj = mapOperation(op);
      const matchedRule = applyRulesToOp(opObj, rulesWithConds);
      if (matchedRule) {
        await pool.execute(
          `UPDATE bank_operations SET category = ?, categorySource = 'rule', ruleId = ? WHERE id = ?`,
          [matchedRule.category, matchedRule.id, op.id]
        );
        updated++;
        if (targetRuleId && matchedRule.id === targetRuleId) updatedByRule++;
      }
    }

    res.json({ updated, updatedByRule: targetRuleId ? updatedByRule : updated });
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

function mapPeriod(row) {
  return {
    id: row.id,
    userId: row.userId,
    label: row.label,
    startDate: row.startDate instanceof Date ? row.startDate.toISOString().slice(0, 10) : String(row.startDate).slice(0, 10),
    endDate:   row.endDate   instanceof Date ? row.endDate.toISOString().slice(0, 10)   : String(row.endDate).slice(0, 10),
    importCount: Number(row.importCount ?? 0),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

function mapImport(row) {
  return {
    id: row.id,
    userId: row.userId,
    periodId: row.periodId || null,
    label: row.label,
    fileName: row.fileName,
    storedFileName: row.storedFileName || null,
    importedAt: row.importedAt instanceof Date ? row.importedAt.toISOString() : row.importedAt,
    operationCount: row.operationCount,
  };
}

function mapOperation(row) {
  return {
    id: row.id,
    importId: row.importId,
    periodId: row.periodId || null,
    periodLabel: row.periodLabel || null,
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
    ruleName: row.ruleName || null,
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
