const express = require('express');
const router = express.Router();

// GET /api/school-holidays?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Returns Zone C school holidays (France) overlapping the given date range
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const conditions = ['zones like "Zone C"'];
    if (startDate) conditions.push(`end_date >= "${startDate}"`);
    if (endDate)   conditions.push(`start_date <= "${endDate}"`);

    const url =
      `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/` +
      `fr-en-calendrier-scolaire/records?where=${encodeURIComponent(conditions.join(' and '))}` +
      `&limit=100&order_by=start_date`;

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    // Deduplicate by start+end date
    const seen = new Set();
    const holidays = [];
    for (const r of (data.results || [])) {
      const sd = (r.start_date || '').substring(0, 10);
      const ed = (r.end_date   || '').substring(0, 10);
      const key = `${sd}_${ed}`;
      if (sd && ed && !seen.has(key)) {
        seen.add(key);
        holidays.push({ label: r.description || 'Vacances scolaires', startDate: sd, endDate: ed });
      }
    }
    res.json(holidays);
  } catch (err) {
    console.error('School holidays error:', err.message);
    res.status(503).json({ error: 'Service calendrier scolaire temporairement indisponible' });
  }
});

module.exports = router;
