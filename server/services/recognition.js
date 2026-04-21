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

module.exports = { recognizeDocument };
