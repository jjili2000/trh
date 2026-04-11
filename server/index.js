require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? ['https://trh.neos.live']
  : ['http://localhost:5173'];
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '50mb' }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./middleware/auth'), require('./routes/users'));
app.use('/api/activity-types', require('./middleware/auth'), require('./routes/activityTypes'));
app.use('/api/time-entries', require('./middleware/auth'), require('./routes/timeEntries'));
app.use('/api/absence-requests', require('./middleware/auth'), require('./routes/absenceRequests'));
app.use('/api/expenses', require('./middleware/auth'), require('./routes/expenses'));
app.use('/api/settings', require('./middleware/auth'), require('./routes/settings'));

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../dist');
  app.use(express.static(distPath));
  // Catch-all: serve index.html for React Router
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`TRH server running on port ${PORT}`));
