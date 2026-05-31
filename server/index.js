require('dotenv').config();

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

const isDev = process.env.NODE_ENV !== 'production';
app.use(cors({
  origin: isDev ? 'http://localhost:5173' : 'https://trh.neos.live',
}));
app.use(express.json({ limit: '5mb' }));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', v: '2026-05-19' }));

// API routes
app.use('/api/files', require('./routes/files'));          // fichiers protégés (pas de middleware auth global — gère son propre JWT)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./middleware/auth'), require('./routes/users'));
app.use('/api/activity-types', require('./middleware/auth'), require('./routes/activityTypes'));
app.use('/api/time-entries', require('./middleware/auth'), require('./routes/timeEntries'));
app.use('/api/absence-requests', require('./middleware/auth'), require('./routes/absenceRequests'));
app.use('/api/expenses', require('./middleware/auth'), require('./routes/expenses'));
app.use('/api/settings', require('./middleware/auth'), require('./routes/settings'));
app.use('/api/documents', require('./middleware/auth'), require('./routes/documents'));
app.use('/api/positions',       require('./middleware/auth'), require('./routes/positions'));
app.use('/api/seasons',         require('./middleware/auth'), require('./routes/seasons'));
app.use('/api/school-holidays', require('./middleware/auth'), require('./routes/schoolHolidays'));
app.use('/api/budgets',         require('./middleware/auth'), require('./routes/budgets'));
app.use('/api/notifications',   require('./middleware/auth'), require('./routes/notifications'));
app.use('/api/accounting',         require('./middleware/auth'), require('./routes/accounting'));
app.use('/api/validation-config', require('./middleware/auth'), require('./routes/validationConfig'));
app.use('/api/payroll',           require('./middleware/auth'), require('./routes/payroll'));
app.use('/api/admin/reset',       require('./middleware/auth'), require('./routes/adminReset'));
app.use('/api/departments',       require('./middleware/auth'), require('./routes/departments'));

// Serve React frontend in production
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  // Static assets (JS/CSS have content hashes) → cacheable longtemps
  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        // index.html ne doit jamais être mis en cache
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    },
  }));
  app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
