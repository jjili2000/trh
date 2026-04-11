require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

const isDev = process.env.NODE_ENV !== 'production';
app.use(cors({
  origin: isDev ? 'http://localhost:5173' : 'https://trh.neos.live',
}));
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./middleware/auth'), require('./routes/users'));
app.use('/api/activity-types', require('./middleware/auth'), require('./routes/activityTypes'));
app.use('/api/time-entries', require('./middleware/auth'), require('./routes/timeEntries'));
app.use('/api/absence-requests', require('./middleware/auth'), require('./routes/absenceRequests'));
app.use('/api/expenses', require('./middleware/auth'), require('./routes/expenses'));
app.use('/api/settings', require('./middleware/auth'), require('./routes/settings'));

// Serve React frontend in production
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
