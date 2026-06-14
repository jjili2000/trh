const Anthropic = require('@anthropic-ai/sdk');
const crypto    = require('crypto');
const pool      = require('../db');

// Initialisation lazy : le module charge même si la clé est absente.
let _client = null;
function getClient() {
  if (!_client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY non configurée sur ce serveur');
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

// Tarifs USD par million de tokens (mis à jour le 2026-06-14)
const PRICING = {
  'claude-opus-4-5':           { in: 15.00, out: 75.00 },
  'claude-opus-4-8':           { in: 15.00, out: 75.00 },
  'claude-sonnet-4-6':         { in:  3.00, out: 15.00 },
  'claude-haiku-4-5-20251001': { in:  0.80, out:  4.00 },
};

// Cache du modèle sélectionné (60 s max)
let _modelCache = { model: null, ts: 0 };
async function getAiModel() {
  const now = Date.now();
  if (_modelCache.model && now - _modelCache.ts < 60_000) return _modelCache.model;
  try {
    const [rows] = await pool.execute('SELECT ai_model FROM app_settings WHERE id = 1');
    const model = rows[0]?.ai_model || 'claude-opus-4-5';
    _modelCache = { model, ts: now };
    return model;
  } catch {
    return _modelCache.model || 'claude-opus-4-5';
  }
}

async function logUsage(functionType, model, usage, context = {}) {
  try {
    const p = PRICING[model] || { in: 15.00, out: 75.00 };
    const costUsd = (usage.input_tokens * p.in + usage.output_tokens * p.out) / 1_000_000;
    await pool.execute(
      `INSERT INTO ai_usage_logs
         (id, function_type, model, input_tokens, output_tokens, cost_usd, user_id, ref_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        functionType,
        model,
        usage.input_tokens,
        usage.output_tokens,
        costUsd,
        context.userId || null,
        context.refId  || null,
      ]
    );
  } catch (err) {
    console.error('[ai-costs log]', err.message);
  }
}

/**
 * Analyze a document and extract metadata
 * @param {string} fileData - base64 encoded file content
 * @param {string} fileType - MIME type (application/pdf, image/jpeg, etc.)
 * @param {string} fileName - original filename
 * @param {{ userId?: string, refId?: string }} [context]
 */
async function recognizeDocument(fileData, fileType, fileName, context = {}) {
  try {
    const model   = await getAiModel();
    const isImage = fileType.startsWith('image/');
    const isPdf   = fileType === 'application/pdf';

    let content;
    if (isImage) {
      content = [
        {
          type: 'image',
          source: { type: 'base64', media_type: fileType, data: fileData },
        },
        {
          type: 'text',
          text: `Analyse ce document RH et extrais les informations suivantes au format JSON strict:
{
  "documentType": "fiche de paie" | "contrat de travail" | "avenant" | "attestation" | "certificat" | "autre",
  "detectedEmployeeName": "Prénom Nom du salarié ou null",
  "periodStart": "YYYY-MM-DD ou null (début de la période couverte)",
  "periodEnd": "YYYY-MM-DD ou null (fin de la période couverte)",
  "notes": "résumé court du document en 1 phrase"
}
Réponds UNIQUEMENT avec le JSON, sans markdown.`,
        },
      ];
    } else if (isPdf) {
      content = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: fileData },
        },
        {
          type: 'text',
          text: `Analyse ce document RH et extrais les informations suivantes au format JSON strict:
{
  "documentType": "fiche de paie" | "contrat de travail" | "avenant" | "attestation" | "certificat" | "autre",
  "detectedEmployeeName": "Prénom Nom du salarié ou null",
  "periodStart": "YYYY-MM-DD ou null (début de la période couverte)",
  "periodEnd": "YYYY-MM-DD ou null (fin de la période couverte)",
  "notes": "résumé court du document en 1 phrase"
}
Réponds UNIQUEMENT avec le JSON, sans markdown.`,
        },
      ];
    } else {
      return { documentType: 'autre', detectedEmployeeName: null, periodStart: null, periodEnd: null, notes: `Fichier: ${fileName}` };
    }

    const response = await getClient().messages.create({
      model,
      max_tokens: 500,
      messages: [{ role: 'user', content }],
    });

    logUsage('recognize_document', model, response.usage, context);

    const text   = response.content[0].text.trim();
    const parsed = JSON.parse(text);
    return {
      documentType:          parsed.documentType          || 'autre',
      detectedEmployeeName:  parsed.detectedEmployeeName  || null,
      periodStart:           parsed.periodStart           || null,
      periodEnd:             parsed.periodEnd             || null,
      notes:                 parsed.notes                 || null,
    };
  } catch (err) {
    console.error('Recognition error:', err.message);
    return { documentType: 'autre', detectedEmployeeName: null, periodStart: null, periodEnd: null, notes: null };
  }
}

/**
 * Analyze an expense receipt and extract accounting data
 * @param {string} fileData - base64 encoded file (may include data-URL prefix)
 * @param {string} fileType - MIME type (image/jpeg, image/png, application/pdf, …)
 * @param {{ userId?: string, refId?: string }} [context]
 */
async function recognizeExpense(fileData, fileType, context = {}) {
  const base64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;

  const isImage = fileType.startsWith('image/');
  const isPdf   = fileType === 'application/pdf';

  if (!isImage && !isPdf) {
    throw new Error(`Type de fichier non supporté : ${fileType}`);
  }

  const model = await getAiModel();

  const prompt = `Analyse ce justificatif de dépense (ticket de caisse, facture…) et extrais les informations suivantes au format JSON strict :
{
  "vendor": "Nom du prestataire / fournisseur ou null",
  "date": "YYYY-MM-DD ou null (date de la facture ou du ticket)",
  "amountHt": 0.00,
  "vatLines": [{"rate": "20", "amount": 10.00}],
  "amountTtc": 0.00
}
Règles :
- amountHt : montant hors taxes (null si non présent)
- vatLines : tableau de toutes les lignes TVA trouvées (rate = taux en %, amount = montant de TVA). Tableau vide [] si pas de TVA.
- amountTtc : montant total toutes taxes comprises (null si non trouvé)
- Si un champ est introuvable, utilise null (sauf vatLines qui reste []).
Réponds UNIQUEMENT avec le JSON, sans markdown ni explication.`;

  let content;
  if (isImage) {
    content = [
      { type: 'image', source: { type: 'base64', media_type: fileType, data: base64 } },
      { type: 'text', text: prompt },
    ];
  } else {
    content = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      { type: 'text', text: prompt },
    ];
  }

  const response = await getClient().messages.create({
    model,
    max_tokens: 600,
    messages: [{ role: 'user', content }],
  });

  logUsage('recognize_expense', model, response.usage, context);

  const text      = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Réponse IA invalide : JSON non trouvé');
  const parsed = JSON.parse(jsonMatch[0]);

  return {
    vendor:    parsed.vendor    ?? null,
    date:      parsed.date      ?? null,
    amountHt:  parsed.amountHt  != null ? parseFloat(parsed.amountHt)  : null,
    vatLines:  Array.isArray(parsed.vatLines)
                 ? parsed.vatLines.map(l => ({ rate: String(l.rate), amount: parseFloat(l.amount) }))
                 : [],
    amountTtc: parsed.amountTtc != null ? parseFloat(parsed.amountTtc) : null,
  };
}

module.exports = { recognizeDocument, recognizeExpense };
