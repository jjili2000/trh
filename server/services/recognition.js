const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Analyze a document and extract metadata
 * @param {string} fileData - base64 encoded file content
 * @param {string} fileType - MIME type (application/pdf, image/jpeg, etc.)
 * @param {string} fileName - original filename
 * @returns {Promise<{documentType, detectedEmployeeName, periodStart, periodEnd, notes}>}
 */
async function recognizeDocument(fileData, fileType, fileName) {
  try {
    const isImage = fileType.startsWith('image/');
    const isPdf = fileType === 'application/pdf';

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

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 500,
      messages: [{ role: 'user', content }],
    });

    const text = response.content[0].text.trim();
    const parsed = JSON.parse(text);
    return {
      documentType: parsed.documentType || 'autre',
      detectedEmployeeName: parsed.detectedEmployeeName || null,
      periodStart: parsed.periodStart || null,
      periodEnd: parsed.periodEnd || null,
      notes: parsed.notes || null,
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
 * @returns {Promise<{vendor, date, amountHt, vatLines, amountTtc}>}
 */
async function recognizeExpense(fileData, fileType) {
  try {
    // Strip data-URL prefix if present  (data:image/jpeg;base64,XXXX → XXXX)
    const base64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;

    const isImage = fileType.startsWith('image/');
    const isPdf   = fileType === 'application/pdf';

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
    } else if (isPdf) {
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: prompt },
      ];
    } else {
      return { vendor: null, date: null, amountHt: null, vatLines: [], amountTtc: null };
    }

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 600,
      messages: [{ role: 'user', content }],
    });

    const text   = response.content[0].text.trim();
    const parsed = JSON.parse(text);
    return {
      vendor:    parsed.vendor    ?? null,
      date:      parsed.date      ?? null,
      amountHt:  parsed.amountHt  != null ? parseFloat(parsed.amountHt)  : null,
      vatLines:  Array.isArray(parsed.vatLines)
                   ? parsed.vatLines.map(l => ({ rate: String(l.rate), amount: parseFloat(l.amount) }))
                   : [],
      amountTtc: parsed.amountTtc != null ? parseFloat(parsed.amountTtc) : null,
    };
  } catch (err) {
    console.error('recognizeExpense error:', err.message);
    return { vendor: null, date: null, amountHt: null, vatLines: [], amountTtc: null };
  }
}

module.exports = { recognizeDocument, recognizeExpense };
