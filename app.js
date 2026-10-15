/**
 * BARANGAY RESIDENT MANAGEMENT SYSTEM
 * Entry point (Express + Supabase). Designed for deployment on Render + Supabase.
 * Run locally with:  npm run dev   (or: node app.js)
 */
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { PORT } = require('./config');
const setupGuard = require('./middleware/setupGuard');

const app = express();

// Body parsing, cookies, CORS
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(cors());

// Send everyone to /setup until first-time setup is completed
app.use(setupGuard);

// Routes (each file in /routes handles one part of the system)
app.use(require('./routes/setup'));
app.use(require('./routes/auth'));
app.use(require('./routes/register'));
app.use(require('./routes/admin/dashboard'));
app.use(require('./routes/admin/residents'));
app.use(require('./routes/admin/puroks'));
app.use(require('./routes/admin/households'));
app.use(require('./routes/admin/certificates'));
app.use(require('./routes/admin/idGenerator'));
app.use(require('./routes/scanner'));
app.use(require('./routes/admin/sectors'));
app.use(require('./routes/admin/blotters'));
app.use(require('./routes/admin/assistance'));
app.use(require('./routes/admin/appointments'));
app.use(require('./routes/admin/announcements'));
app.use(require('./routes/admin/officials'));
app.use(require('./routes/admin/users'));
app.use(require('./routes/admin/reports'));
app.use(require('./routes/admin/activityLogs'));
app.use(require('./routes/admin/settings'));
app.use(require('./routes/resident'));
app.use(require('./routes/admin/aid'));
app.use(require('./routes/terms'));
app.use(require('./routes/account'));

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.listen(PORT, () => {
  console.log(`[BARANGAY SYSTEM RUNNING] Listening on port ${PORT}`);
});
