const express = require('express');
const crypto  = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');
const pool    = require('../db');

const router = express.Router();

// Tarifs Anthropic — USD par million de tokens (mis à jour le 2026-06-14)
const PRICING = {
  'claude-opus-4-5':           { inputPerMTok: 15.00, outputPerMTok: 75.00 },
  'claude-opus-4-8':           { inputPerMTok: 15.00, outputPerMTok: 75.00 },
  'claude-sonnet-4-6':         { inputPerMTok:  3.00, outputPerMTok: 15.00 },
  'claude-haiku-4-5-20251001': { inputPerMTok:  0.80, outputPerMTok:  4.00 },
};

// GET /api/ai-costs/models — liste les modèles disponibles depuis l'API Anthropic + tarifs
router.get('/models', async (req, res) => {
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY non configurée' });

    const client = new Anthropic({ apiKey: key });
    const { data: models } = await client.models.list({ limit: 50 });

    const result = models
      .filter(m => m.id.startsWith('claude-'))
      .map(m => ({
        id:            m.id,
        displayName:   m.display_name || m.id,
        inputPerMTok:  PRICING[m.id]?.inputPerMTok  ?? null,
        outputPerMTok: PRICING[m.id]?.outputPerMTok ?? null,
        pricingKnown:  !!PRICING[m.id],
      }));

    res.json({ models: result, pricingUpdatedAt: '2026-06-14' });
  } catch (err) {
    console.error('[ai-costs/models]', err.message);
    res.status(500).json({ error: 'Impossible de récupérer la liste des modèles Anthropic' });
  }
});

// GET /api/ai-costs/config — modèle actuellement sélectionné
router.get('/config', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT ai_model FROM app_settings WHERE id = 1');
    res.json({ model: rows[0]?.ai_model || 'claude-opus-4-5' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/ai-costs/config — changer le modèle (admin only)
router.put('/config', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    const { model } = req.body;
    if (!model) return res.status(400).json({ error: 'model requis' });

    await pool.execute(
      `INSERT INTO app_settings (id, ai_model) VALUES (1, ?)
       ON DUPLICATE KEY UPDATE ai_model = VALUES(ai_model)`,
      [model]
    );
    res.json({ model });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/ai-costs/stats — statistiques d'utilisation (admin only)
router.get('/stats', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });

    const [[totals]] = await pool.execute(`
      SELECT
        COUNT(*)              AS total_calls,
        SUM(input_tokens)     AS total_input,
        SUM(output_tokens)    AS total_output,
        SUM(cost_usd)         AS total_cost
      FROM ai_usage_logs
    `);

    const [monthly] = await pool.execute(`
      SELECT
        DATE_FORMAT(called_at, '%Y-%m') AS month,
        COUNT(*)                         AS calls,
        SUM(input_tokens)                AS input_tokens,
        SUM(output_tokens)               AS output_tokens,
        SUM(cost_usd)                    AS cost_usd
      FROM ai_usage_logs
      WHERE called_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(called_at, '%Y-%m')
      ORDER BY month DESC
    `);

    const [byFunction] = await pool.execute(`
      SELECT
        function_type,
        COUNT(*)      AS calls,
        SUM(cost_usd) AS cost_usd
      FROM ai_usage_logs
      GROUP BY function_type
    `);

    const [byModel] = await pool.execute(`
      SELECT
        model,
        COUNT(*)      AS calls,
        SUM(cost_usd) AS cost_usd
      FROM ai_usage_logs
      GROUP BY model
      ORDER BY cost_usd DESC
    `);

    // Mois en cours
    const [[thisMonth]] = await pool.execute(`
      SELECT SUM(cost_usd) AS cost_usd, COUNT(*) AS calls
      FROM ai_usage_logs
      WHERE DATE_FORMAT(called_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')
    `);

    res.json({
      totals: {
        calls:        totals.total_calls   || 0,
        inputTokens:  totals.total_input   || 0,
        outputTokens: totals.total_output  || 0,
        costUsd:      parseFloat(totals.total_cost || 0),
      },
      thisMonth: {
        costUsd: parseFloat(thisMonth.cost_usd || 0),
        calls:   thisMonth.calls || 0,
      },
      monthly: monthly.map(r => ({
        month:        r.month,
        calls:        r.calls,
        inputTokens:  r.input_tokens,
        outputTokens: r.output_tokens,
        costUsd:      parseFloat(r.cost_usd || 0),
      })),
      byFunction: byFunction.map(r => ({
        functionType: r.function_type,
        calls:        r.calls,
        costUsd:      parseFloat(r.cost_usd || 0),
      })),
      byModel: byModel.map(r => ({
        model:   r.model,
        calls:   r.calls,
        costUsd: parseFloat(r.cost_usd || 0),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
