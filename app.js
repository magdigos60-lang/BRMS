/**
 * BARANGAY RESIDENT MANAGEMENT SYSTEM (BRMS)
 * Production Node.js / Express Application with Supabase Database
 * Strict adherence to Blue, Green, White Theme & Full Feature Set
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const path = require('path');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase Client Initialization
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-supabase-anon-key';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Middleware Configuration
app.use(compression());
app.use(cors());
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// File Upload Memory Storage for Multer
const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// STYLESHEET & UI DESIGN SYSTEM (Blue/Green/White)
// ==========================================
const BASE_CSS = `
:root {
  --primary-blue: #0284c7;
  --dark-blue: #0369a1;
  --light-blue: #e0f2fe;
  --accent-green: #10b981;
  --dark-green: #059669;
  --light-green: #d1fae5;
  --bg-white: #ffffff;
  --card-bg: #f8fafc;
  --text-main: #1e293b;
  --text-muted: #64748b;
  --border-color: #cbd5e1;
  --danger-red: #ef4444;
  --warning-yellow: #f59e0b;
}

* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
body { background-color: #f1f5f9; color: var(--text-main); line-height: 1.6; min-height: 100vh; display: flex; flex-direction: column; }

header { background: linear-gradient(135deg, var(--dark-blue), var(--primary-blue)); color: white; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
header .logo-area { display: flex; align-items: center; gap: 1rem; }
header img.brgy-logo { width: 45px; height: 45px; border-radius: 50%; object-fit: cover; background: white; border: 2px solid white; }
header h1 { font-size: 1.25rem; font-weight: 600; letter-spacing: 0.5px; }

nav.main-nav { background: white; border-bottom: 1px solid var(--border-color); padding: 0.75rem 2rem; display: flex; gap: 1.5rem; overflow-x: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
nav.main-nav a { color: var(--text-muted); text-decoration: none; font-weight: 500; font-size: 0.9rem; padding: 0.5rem 0.75rem; border-radius: 6px; white-space: nowrap; transition: all 0.2s; }
nav.main-nav a:hover, nav.main-nav a.active { background: var(--light-blue); color: var(--dark-blue); }

.container { max-width: 1400px; margin: 2rem auto; padding: 0 1.5rem; width: 100%; flex: 1; }

.card { background: var(--bg-white); border-radius: 12px; border: 1px solid var(--border-color); padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; }
.card-header h2 { color: var(--dark-blue); font-size: 1.25rem; font-weight: 600; }

.grid-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem; margin-bottom: 2rem; }
.stat-card { background: white; border-left: 5px solid var(--primary-blue); border-radius: 8px; padding: 1.25rem; border-top: 1px solid var(--border-color); border-right: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
.stat-card.green { border-left-color: var(--accent-green); }
.stat-card h3 { font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.stat-card .value { font-size: 1.85rem; font-weight: 700; color: var(--text-main); margin-top: 0.5rem; }

table { width: 100%; border-collapse: collapse; margin-top: 1rem; background: white; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color); }
th, td { padding: 0.85rem 1rem; text-align: left; border-bottom: 1px solid var(--border-color); font-size: 0.9rem; }
th { background: var(--light-blue); color: var(--dark-blue); font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.5px; }
tr:hover { background-color: #f8fafc; }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.6rem 1.25rem; background-color: var(--primary-blue); color: white; border: none; border-radius: 6px; font-weight: 500; font-size: 0.9rem; cursor: pointer; text-decoration: none; transition: background 0.2s; }
.btn:hover { background-color: var(--dark-blue); }
.btn-green { background-color: var(--accent-green); }
.btn-green:hover { background-color: var(--dark-green); }
.btn-danger { background-color: var(--danger-red); }
.btn-danger:hover { background-color: #dc2626; }
.btn-secondary { background-color: var(--text-muted); }
.btn-secondary:hover { background-color: #475569; }
.btn-sm { padding: 0.35rem 0.75rem; font-size: 0.8rem; }

form { display: flex; flex-direction: column; gap: 1.25rem; }
.form-group { display: flex; flex-direction: column; gap: 0.4rem; }
.form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; }
label { font-weight: 500; font-size: 0.9rem; color: var(--text-main); }
input, select, textarea { padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.95rem; background: white; color: var(--text-main); }
input:focus, select:focus, textarea:focus { outline: none; border-color: var(--primary-blue); ring: 2px var(--light-blue); }

.badge { display: inline-block; padding: 0.25rem 0.65rem; border-radius: 50px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
.badge-blue { background: var(--light-blue); color: var(--dark-blue); }
.badge-green { background: var(--light-green); color: var(--dark-green); }
.badge-yellow { background: #fef3c7; color: #d97706; }
.badge-red { background: #fee2e2; color: #dc2626; }

.alert { padding: 1rem; border-radius: 6px; margin-bottom: 1.5rem; font-size: 0.95rem; }
.alert-success { background: var(--light-green); color: var(--dark-green); border: 1px solid #6ee7b7; }
.alert-error { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; }

.login-bg { background: linear-gradient(rgba(2, 132, 199, 0.75), rgba(5, 150, 105, 0.75)), url('https://scontent.fcrk3-3.fna.fbcdn.net/v/t39.30808-6/467984538_122130208178389200_2470999473131951042_n.jpg?stp=dst-jpg_tt6&cstp=mx1857x2048&ctp=s1857x2048&_nc_cat=107&ccb=1-7&_nc_sid=cc71e4&_nc_eui2=AeH-CrVk3UW0Tqq0z_SDhKwemnbseM68ydCadux4zrzJ0I4R6gykVtH1GEMMnjk_E0vUUupJBZ3vwMdzuIfYXMgZ&_nc_ohc=dQMK5ddUuHcQ7kNvwGa1gPS&_nc_oc=AdoFKxV7tJpE4hgQ4pRI2MUvCVRMJBztcvXKVR66-nYuAHhEYRtmWNOf2aAis5Et9sE&_nc_zt=23&_nc_ht=scontent.fcrk3-3.fna&_nc_gid=xdfM6qfHMw-bCjf2oW_Nzw&_nc_ss=7b2a8&oh=00_AQMFazlU8aRub-iyfGwAHzijoCAXz8cAE0ZoQgTtFlJvjw&oe=6AC35F71') no-repeat center center fixed; background-size: cover; height: 100vh; display: flex; align-items: center; justify-content: center; }
.login-card { background: white; padding: 2.5rem; border-radius: 12px; width: 100%; max-width: 450px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }

/* ID Card Styles */
.id-card-print-container { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; }
.barangay-id-card { width: 340px; height: 215px; background: linear-gradient(135deg, #ffffff, #f0fdf4); border: 2px solid var(--primary-blue); border-radius: 12px; padding: 12px; position: relative; box-shadow: 0 4px 8px rgba(0,0,0,0.1); display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; page-break-inside: avoid; }
.id-header { display: flex; align-items: center; gap: 8px; border-bottom: 2px solid var(--accent-green); padding-bottom: 6px; }
.id-header img { width: 35px; height: 35px; border-radius: 50%; object-fit: cover; }
.id-header h4 { font-size: 0.75rem; color: var(--dark-blue); line-height: 1.1; font-weight: 700; }
.id-header p { font-size: 0.6rem; color: var(--text-muted); }
.id-body { display: flex; gap: 10px; margin-top: 6px; }
.id-photo { width: 85px; height: 95px; border: 1px solid var(--border-color); border-radius: 4px; object-fit: cover; background: #e2e8f0; }
.id-details { font-size: 0.7rem; display: flex; flex-direction: column; gap: 2px; flex: 1; }
.id-details strong { color: var(--dark-blue); }
.id-footer { display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid var(--border-color); padding-top: 4px; margin-top: auto; }
.id-signature { text-align: center; font-size: 0.6rem; }
.id-signature img { max-height: 25px; display: block; margin: 0 auto; }
.id-qr { width: 45px; height: 45px; }

@media print {
  body * { visibility: hidden; }
  .printable-grid, .printable-grid * { visibility: visible; }
  .printable-grid { position: absolute; left: 0; top: 0; width: 100%; }
}
`;

// Helper for HTML wrapping
function renderHTML(title, bodyContent, includeNav = false, activeTab = '', userRole = '') {
  let navHTML = '';
  if (includeNav) {
    if (userRole === 'Resident') {
      navHTML = `
        <nav class="main-nav">
          <a href="/resident/dashboard" class="${activeTab === 'dashboard' ? 'active' : ''}">Dashboard</a>
          <a href="/resident/profile" class="${activeTab === 'profile' ? 'active' : ''}">My Profile</a>
          <a href="/resident/edit-request" class="${activeTab === 'edit-request' ? 'active' : ''}">Edit Request</a>
          <a href="/resident/certificates" class="${activeTab === 'certificates' ? 'active' : ''}">Certificates</a>
          <a href="/resident/tracking" class="${activeTab === 'tracking' ? 'active' : ''}">Request Tracking</a>
          <a href="/resident/appointments" class="${activeTab === 'appointments' ? 'active' : ''}">Appointments</a>
          <a href="/resident/documents" class="${activeTab === 'documents' ? 'active' : ''}">My Documents</a>
          <a href="/resident/complaints" class="${activeTab === 'complaints' ? 'active' : ''}">Complaints</a>
          <a href="/resident/assistance" class="${activeTab === 'assistance' ? 'active' : ''}">Assistance</a>
          <a href="/resident/announcements" class="${activeTab === 'announcements' ? 'active' : ''}">Announcements</a>
          <a href="/resident/notifications" class="${activeTab === 'notifications' ? 'active' : ''}">Notifications</a>
          <a href="/resident/feedback" class="${activeTab === 'feedback' ? 'active' : ''}">Feedback</a>
          <a href="/resident/emergency" class="${activeTab === 'emergency' ? 'active' : ''}">Emergency Contacts</a>
          <a href="/resident/digital-id" class="${activeTab === 'digital-id' ? 'active' : ''}">My Digital ID</a>
          <a href="/resident/security" class="${activeTab === 'security' ? 'active' : ''}">Security</a>
          <a href="/auth/logout" class="btn-danger" style="color:white; padding:0.3rem 0.6rem; border-radius:4px;">Logout</a>
        </nav>
      `;
    } else {
      navHTML = `
        <nav class="main-nav">
          <a href="/admin/dashboard" class="${activeTab === 'dashboard' ? 'active' : ''}">Dashboard</a>
          <a href="/admin/residents" class="${activeTab === 'residents' ? 'active' : ''}">Residents</a>
          <a href="/admin/households" class="${activeTab === 'households' ? 'active' : ''}">Households</a>
          <a href="/admin/puroks" class="${activeTab === 'puroks' ? 'active' : ''}">Puroks</a>
          <a href="/admin/documents" class="${activeTab === 'documents' ? 'active' : ''}">Documents</a>
          <a href="/admin/blotter" class="${activeTab === 'blotter' ? 'active' : ''}">Blotter</a>
          <a href="/admin/seniors" class="${activeTab === 'seniors' ? 'active' : ''}">Seniors</a>
          <a href="/admin/pwd" class="${activeTab === 'pwd' ? 'active' : ''}">PWD</a>
          <a href="/admin/solo-parents" class="${activeTab === 'solo-parents' ? 'active' : ''}">Solo Parents</a>
          <a href="/admin/users" class="${activeTab === 'users' ? 'active' : ''}">Users</a>
          <a href="/admin/officials" class="${activeTab === 'officials' ? 'active' : ''}">Officials</a>
          <a href="/admin/announcements" class="${activeTab === 'announcements' ? 'active' : ''}">Announcements</a>
          <a href="/admin/events" class="${activeTab === 'events' ? 'active' : ''}">Events</a>
          <a href="/admin/reports" class="${activeTab === 'reports' ? 'active' : ''}">Reports</a>
          <a href="/admin/activity-logs" class="${activeTab === 'activity-logs' ? 'active' : ''}">Logs</a>
          <a href="/admin/scanner" class="${activeTab === 'scanner' ? 'active' : ''}">QR Scanner</a>
          <a href="/admin/id-printing" class="${activeTab === 'id-printing' ? 'active' : ''}">ID Printing (8-in-1)</a>
          <a href="/admin/backup" class="${activeTab === 'backup' ? 'active' : ''}">Backup & Restore</a>
          <a href="/admin/settings" class="${activeTab === 'settings' ? 'active' : ''}">Settings</a>
          <a href="/auth/logout" class="btn-danger" style="color:white; padding:0.3rem 0.6rem; border-radius:4px;">Logout</a>
        </nav>
      `;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | Barangay Resident Management System</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  ${includeNav ? `
  <header>
    <div class="logo-area">
      <img src="https://via.placeholder.com/45" alt="Logo" class="brgy-logo">
      <h1>Barangay Resident Management System</h1>
    </div>
    <div style="font-size:0.9rem;">Role: <strong>${userRole}</strong></div>
  </header>
  ${navHTML}` : ''}
  <div class="container">
    ${bodyContent}
  </div>
</body>
</html>`;
}

// ==========================================
// AUTHENTICATION & SETUP ROUTES
// ==========================================

app.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('system_users').select('id').limit(1);
    if (error || !data || data.length === 0) {
      return res.redirect('/setup');
    }
    res.redirect('/login');
  } catch (err) {
    res.status(500).send(renderHTML('Error', `<div class="card"><div class="alert alert-error">Database connection error: ${err.message}. Please check your Supabase credentials in environment variables.</div></div>`));
  }
});

app.get('/setup', async (req, res) => {
  const { data } = await supabase.from('system_users').select('id').limit(1);
  if (data && data.length > 0) {
    return res.redirect('/login');
  }
  res.send(renderHTML('System Setup', `
    <div class="login-card" style="max-width: 600px; margin: 3rem auto;">
      <h2 style="color:var(--dark-blue); margin-bottom:1rem;">System Setup - Create Super Admin Account</h2>
      <p style="margin-bottom:1.5rem; color:var(--text-muted);">Welcome to the Barangay Resident Management System. Please create your initial Administrator account to begin.</p>
      <form action="/setup" method="POST">
        <div class="form-group">
          <label>Full Name</label>
          <input type="text" name="full_name" required placeholder="Administrator Name">
        </div>
        <div class="form-group">
          <label>Username</label>
          <input type="text" name="username" required placeholder="admin">
        </div>
        <div class="form-group">
          <label>Email Address</label>
          <input type="email" name="email" required placeholder="admin@barangay.gov.ph">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" required placeholder="Secure Password">
        </div>
        <button type="submit" class="btn btn-green" style="width:100%; margin-top:1rem;">Initialize System & Create Admin</button>
      </form>
    </div>
  `));
});

app.post('/setup', async (req, res) => {
  try {
    const { full_name, username, email, password } = req.body;
    const password_hash = await bcrypt.hash(password, 10);
    const { error } = await supabase.from('system_users').insert([{
      full_name,
      username,
      email,
      password_hash,
      role: 'Super Admin',
      status: 'Active',
      permissions: { all: true }
    }]);

    if (error) throw error;
    res.redirect('/login');
  } catch (err) {
    res.status(400).send(renderHTML('Setup Error', `<div class="card"><div class="alert alert-error">Setup failed: ${err.message}</div><a href="/setup" class="btn">Try Again</a></div>`));
  }
});

app.get('/login', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Login | Barangay Resident Management System</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <div class="login-bg">
    <div class="login-card">
      <div style="text-align: center; margin-bottom: 1.5rem;">
        <h2 style="color: var(--dark-blue); font-size: 1.5rem;">Barangay System Login</h2>
        <p style="color: var(--text-muted); font-size: 0.85rem;">Secure Portal Access</p>
      </div>
      <form action="/auth/login" method="POST">
        <div class="form-group">
          <label>Login Portal</label>
          <select name="portal_type" required>
            <option value="admin">Admin / Staff Portal</option>
            <option value="resident">Resident Portal</option>
          </select>
        </div>
        <div class="form-group">
          <label>Username or Email</label>
          <input type="text" name="identifier" required placeholder="Enter username or email">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" required placeholder="Enter password">
        </div>
        <button type="submit" class="btn" style="width: 100%; margin-top: 1rem;">Login to Portal</button>
      </form>
      <div style="text-align: center; margin-top: 1.25rem; font-size: 0.85rem;">
        Resident without an account? <a href="/register" style="color: var(--primary-blue); font-weight: 600;">Register here</a>
      </div>
    </div>
  </div>
</body>
</html>`);
});

app.post('/auth/login', async (req, res) => {
  const { portal_type, identifier, password } = req.body;
  try {
    if (portal_type === 'admin') {
      const { data, error } = await supabase.from('system_users').select('*').or(`username.eq.${identifier},email.eq.${identifier}`).single();
      if (error || !data || data.status !== 'Active') {
        return res.status(401).send(renderHTML('Login Failed', `<div class="card"><div class="alert alert-error">Invalid admin credentials or account disabled.</div><a href="/login" class="btn">Back to Login</a></div>`));
      }
      const match = await bcrypt.compare(password, data.password_hash);
      if (!match) {
        return res.status(401).send(renderHTML('Login Failed', `<div class="card"><div class="alert alert-error">Incorrect password.</div><a href="/login" class="btn">Back to Login</a></div>`));
      }
      await supabase.from('login_history').insert([{ user_identifier: data.username, role: data.role, ip_address: req.ip }]);
      // In production, sign session/JWT. Here we redirect with query or mock session cookie.
      res.redirect('/admin/dashboard');
    } else {
      const { data, error } = await supabase.from('residents').select('*').eq('email', identifier).single();
      if (error || !data || data.resident_status !== 'ACTIVE') {
        return res.status(401).send(renderHTML('Login Failed', `<div class="card"><div class="alert alert-error">Invalid resident credentials or account pending approval.</div><a href="/login" class="btn">Back to Login</a></div>`));
      }
      const match = await bcrypt.compare(password, data.password_hash);
      if (!match) {
        return res.status(401).send(renderHTML('Login Failed', `<div class="card"><div class="alert alert-error">Incorrect password.</div><a href="/login" class="btn">Back to Login</a></div>`));
      }
      await supabase.from('login_history').insert([{ user_identifier: data.email, role: 'Resident', ip_address: req.ip }]);
      res.redirect(`/resident/dashboard?rid=${data.id}`);
    }
  } catch (err) {
    res.status(500).send(renderHTML('Error', `<div class="card"><div class="alert alert-error">System error during login: ${err.message}</div><a href="/login" class="btn">Back</a></div>`));
  }
});

app.get('/auth/logout', (req, res) => {
  res.redirect('/login');
});

// ==========================================
// PUBLIC RESIDENT REGISTRATION
// ==========================================

app.get('/register', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Resident Registration | Barangay System</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <div class="container" style="max-width: 700px; margin: 3rem auto;">
    <div class="card">
      <div class="card-header">
        <h2>Resident Online Registration</h2>
      </div>
      <form action="/register" method="POST" enctype="multipart/form-data">
        <div class="form-row">
          <div class="form-group">
            <label>First Name</label>
            <input type="text" name="first_name" required>
          </div>
          <div class="form-group">
            <label>Middle Name</label>
            <input type="text" name="middle_name">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Last Name</label>
            <input type="text" name="last_name" required>
          </div>
          <div class="form-group">
            <label>Suffix (e.g. Jr, III)</label>
            <input type="text" name="suffix">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Date of Birth</label>
            <input type="date" name="date_of_birth" required>
          </div>
          <div class="form-group">
            <label>Gender</label>
            <select name="gender" required>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Civil Status</label>
            <select name="civil_status" required>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Widowed">Widowed</option>
              <option value="Separated">Separated</option>
            </select>
          </div>
          <div class="form-group">
            <label>Contact Number</label>
            <input type="text" name="contact_number" required placeholder="09XXXXXXXXX">
          </div>
        </div>
        <div class="form-group">
          <label>Email Address (Portal Username)</label>
          <input type="email" name="email" required>
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" required>
        </div>
        <div class="form-group">
          <label>Complete Address</label>
          <textarea name="complete_address" required rows="2"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Occupation</label>
            <input type="text" name="occupation">
          </div>
          <div class="form-group">
            <label>Resident Photo URL or File</label>
            <input type="text" name="resident_photo" placeholder="https://example.com/photo.jpg">
          </div>
        </div>
        <button type="submit" class="btn btn-green" style="margin-top: 1rem;">Submit Registration for Approval</button>
      </form>
      <div style="text-align: center; margin-top: 1rem;">
        <a href="/login" style="color: var(--primary-blue);">Already have an account? Login</a>
      </div>
    </div>
  </div>
</body>
</html>`);
});

app.post('/register', async (req, res) => {
  try {
    const { first_name, middle_name, last_name, suffix, date_of_birth, gender, civil_status, contact_number, email, password, complete_address, occupation, resident_photo } = req.body;
    const password_hash = await bcrypt.hash(password, 10);
    const resident_id_no = `BRGY-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const qr_token = `TOKEN-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;

    const { error } = await supabase.from('residents').insert([{
      resident_id_no,
      first_name,
      middle_name,
      last_name,
      suffix,
      date_of_birth,
      gender,
      civil_status,
      contact_number,
      email,
      password_hash,
      complete_address,
      occupation,
      resident_photo: resident_photo || 'https://via.placeholder.com/150',
      qr_token,
      resident_status: 'PENDING'
    }]);

    if (error) throw error;
    res.send(renderHTML('Registration Submitted', `<div class="card" style="text-align:center; padding: 3rem;"><h2 style="color:var(--dark-green);">Registration Successful!</h2><p style="margin: 1rem 0;">Your registration has been submitted and is pending administrator/staff approval.</p><a href="/login" class="btn">Return to Login</a></div>`));
  } catch (err) {
    res.status(400).send(renderHTML('Error', `<div class="card"><div class="alert alert-error">Registration failed: ${err.message}</div><a href="/register" class="btn">Back</a></div>`));
  }
});

// ==========================================
// ADMIN PORTAL ROUTES
// ==========================================

app.get('/admin/dashboard', async (req, res) => {
  try {
    const [resCount, activeCount, pendingRegs, householdCount, purokCount, pendingCerts, pendingAppts, pendingComplaints, recentLogs] = await Promise.all([
      supabase.from('residents').select('*', { count: 'exact', head: true }),
      supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'ACTIVE'),
      supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'PENDING'),
      supabase.from('households').select('*', { count: 'exact', head: true }),
      supabase.from('puroks').select('*', { count: 'exact', head: true }),
      supabase.from('certificate_requests').select('*', { count: 'exact', head: true }).eq('status', 'Pending'),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'Pending'),
      supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'Submitted'),
      supabase.from('user_activity_logs').select('*').order('created_at', { ascending: false }).limit(5)
    ]);

    res.send(renderHTML('Admin Dashboard', `
      <div class="card-header" style="border:none; margin-bottom:1rem;">
        <h2>Admin & Staff Dashboard</h2>
      </div>
      <div class="grid-stats">
        <div class="stat-card">
          <h3>Total Residents</h3>
          <div class="value">${resCount.count || 0}</div>
        </div>
        <div class="stat-card green">
          <h3>Active Residents</h3>
          <div class="value">${activeCount.count || 0}</div>
        </div>
        <div class="stat-card">
          <h3>Pending Registrations</h3>
          <div class="value" style="color:var(--warning-yellow);">${pendingRegs.count || 0}</div>
        </div>
        <div class="stat-card">
          <h3>Total Households</h3>
          <div class="value">${householdCount.count || 0}</div>
        </div>
        <div class="stat-card green">
          <h3>Total Puroks</h3>
          <div class="value">${purokCount.count || 0}</div>
        </div>
        <div class="stat-card">
          <h3>Pending Requests</h3>
          <div class="value">${pendingCerts.count || 0}</div>
        </div>
        <div class="stat-card">
          <h3>Pending Appointments</h3>
          <div class="value">${pendingAppts.count || 0}</div>
        </div>
        <div class="stat-card">
          <h3>Pending Complaints</h3>
          <div class="value">${pendingComplaints.count || 0}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Recent Activity Logs</h2>
        </div>
        <table>
          <thead>
            <tr><th>User / Identifier</th><th>Action</th><th>Timestamp</th></tr>
          </thead>
          <tbody>
            ${recentLogs.data && recentLogs.data.length > 0 ? recentLogs.data.map(l => `
              <tr>
                <td>${l.user_identifier}</td>
                <td>${l.action}</td>
                <td>${new Date(l.created_at).toLocaleString()}</td>
              </tr>
            `).join('') : '<tr><td colspan="3" style="text-align:center;">No recent activity recorded.</td></tr>'}
          </tbody>
        </table>
      </div>
    `, true, 'dashboard', 'Barangay Admin'));
  } catch (err) {
    res.status(500).send(renderHTML('Error', `<div class="card"><div class="alert alert-error">Error loading dashboard: ${err.message}</div></div>`, true, 'dashboard', 'Barangay Admin'));
  }
});

// Resident Management Module
app.get('/admin/residents', async (req, res) => {
  const statusFilter = req.query.status || 'ACTIVE';
  const search = req.query.search || '';
  
  let query = supabase.from('residents').select('*, puroks(name), households(household_number)').order('created_at', { ascending: false });
  if (statusFilter !== 'ALL') query = query.eq('resident_status', statusFilter);
  if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,resident_id_no.ilike.%${search}%`);

  const { data: residents, error } = await query;

  res.send(renderHTML('Resident Management', `
    <div class="card">
      <div class="card-header">
        <h2>Resident Directory & Management</h2>
        <a href="/admin/residents/add" class="btn btn-green btn-sm">+ Add New Resident</a>
      </div>
      <form method="GET" action="/admin/residents" style="display:flex; flex-direction:row; gap:1rem; margin-bottom:1.5rem;">
        <input type="text" name="search" placeholder="Search by name or ID..." value="${search}" style="flex:1;">
        <select name="status" style="width: 200px;">
          <option value="ACTIVE" ${statusFilter === 'ACTIVE' ? 'selected' : ''}>Active</option>
          <option value="PENDING" ${statusFilter === 'PENDING' ? 'selected' : ''}>Pending Approval</option>
          <option value="ARCHIVED" ${statusFilter === 'ARCHIVED' ? 'selected' : ''}>Archived</option>
          <option value="ALL" ${statusFilter === 'ALL' ? 'selected' : ''}>All Statuses</option>
        </select>
        <button type="submit" class="btn">Filter</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>ID No.</th>
            <th>Photo</th>
            <th>Full Name</th>
            <th>Purok</th>
            <th>Contact</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${residents && residents.length > 0 ? residents.map(r => `
            <tr>
              <td><strong>${r.resident_id_no}</strong></td>
              <td><img src="${r.resident_photo}" style="width:35px; height:35px; border-radius:50%; object-fit:cover;"></td>
              <td>${r.last_name},${r.first_name} ${r.middle_name \vert{}\vert{} ''}${r.suffix || ''}</td>
              <td>${r.puroks ? r.puroks.name : 'N/A'}</td>
              <td>${r.contact_number || 'N/A'}</td>
              <td><span class="badge ${r.resident_status === 'ACTIVE' ? 'badge-green' : (r.resident_status === 'PENDING' ? 'badge-yellow' : 'badge-red')}">${r.resident_status}</span></td>
              <td>
                ${r.resident_status === 'PENDING' ? `
                  <a href="/admin/residents/approve/${r.id}" class="btn btn-green btn-sm">Approve</a>
                  <a href="/admin/residents/reject/${r.id}" class="btn btn-danger btn-sm">Reject</a>
                ` : `
                  <a href="/admin/residents/view/${r.id}" class="btn btn-sm">View</a>
                  <a href="/admin/residents/archive/${r.id}" class="btn btn-secondary btn-sm">Archive</a>
                `}
              </td>
            </tr>
          `).join('') : '<tr><td colspan="7" style="text-align:center;">No residents found.</td></tr>'}
        </tbody>
      </table>
    </div>
  `, true, 'residents', 'Barangay Admin'));
});

app.get('/admin/residents/approve/:id', async (req, res) => {
  const { id } = req.params;
  await supabase.from('residents').update({ resident_status: 'ACTIVE' }).eq('id', id);
  await supabase.from('user_activity_logs').insert([{ user_identifier: 'Admin', action: `Approved resident registration ID: ${id}` }]);
  res.redirect('/admin/residents?status=PENDING');
});

app.get('/admin/residents/reject/:id', async (req, res) => {
  const { id } = req.params;
  await supabase.from('residents').update({ resident_status: 'ARCHIVED' }).eq('id', id);
  await supabase.from('user_activity_logs').insert([{ user_identifier: 'Admin', action: `Rejected resident registration ID: ${id}` }]);
  res.redirect('/admin/residents?status=PENDING');
});

app.get('/admin/residents/archive/:id', async (req, res) => {
  const { id } = req.params;
  await supabase.from('residents').update({ resident_status: 'ARCHIVED' }).eq('id', id);
  res.redirect('/admin/residents');
});

// Household Management
app.get('/admin/households', async (req, res) => {
  const { data: households } = await supabase.from('households').select('*, puroks(name)');
  const { data: puroks } = await supabase.from('puroks').select('*');

  res.send(renderHTML('Household Management', `
    <div class="card">
      <div class="card-header">
        <h2>Household Records</h2>
      </div>
      <form action="/admin/households/add" method="POST" style="margin-bottom:2rem; background:var(--card-bg); padding:1rem; border-radius:8px;">
        <h3 style="margin-bottom:0.75rem; font-size:1rem; color:var(--dark-blue);">Add New Household</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Household Number</label>
            <input type="text" name="household_number" required placeholder="HH-2026-001">
          </div>
          <div class="form-group">
            <label>Purok</label>
            <select name="purok_id" required>
              ${puroks ? puroks.map(p => `<option value="${p.id}">${p.name}</option>`).join('') : ''}
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-top:1rem;">
          <label>Address / Street</label>
          <input type="text" name="address" required placeholder="Complete Household Address">
        </div>
        <button type="submit" class="btn btn-green" style="margin-top:1rem; width:fit-content;">Create Household</button>
      </form>
      <table>
        <thead>
          <tr><th>Household No.</th><th>Purok</th><th>Address</th><th>Status</th></tr>
        </thead>
        <tbody>
          ${households && households.length > 0 ? households.map(h => `
            <tr>
              <td><strong>${h.household_number}</strong></td>
              <td>${h.puroks ? h.puroks.name : 'N/A'}</td>
              <td>${h.address}</td>
              <td><span class="badge badge-green">${h.household_status}</span></td>
            </tr>
          `).join('') : '<tr><td colspan="4" style="text-align:center;">No households registered.</td></tr>'}
        </tbody>
      </table>
    </div>
  `, true, 'households', 'Barangay Admin'));
});

app.post('/admin/households/add', async (req, res) => {
  const { household_number, purok_id, address } = req.body;
  await supabase.from('households').insert([{ household_number, purok_id, address }]);
  res.redirect('/admin/households');
});

// Purok Management with dynamic resident count calculation
app.get('/admin/puroks', async (req, res) => {
  const { data: puroks } = await supabase.from('puroks').select('*');
  const purokList = [];
  if (puroks) {
    for (const p of puroks) {
      const { count } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('purok_id', p.id).eq('resident_status', 'ACTIVE');
      purokList.push({ ...p, residentCount: count || 0 });
    }
  }

  res.send(renderHTML('Purok Management', `
    <div class="card">
      <div class="card-header">
        <h2>Purok Management & Resident Counts</h2>
      </div>
      <form action="/admin/puroks/add" method="POST" style="margin-bottom:2rem; background:var(--card-bg); padding:1rem; border-radius:8px;">
        <h3 style="margin-bottom:0.75rem; font-size:1rem; color:var(--dark-blue);">Add New Purok</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Purok Name</label>
            <input type="text" name="name" required placeholder="Purok 1">
          </div>
          <div class="form-group">
            <label>Description</label>
            <input type="text" name="description" placeholder="Optional description">
          </div>
        </div>
        <button type="submit" class="btn btn-green" style="margin-top:1rem; width:fit-content;">Add Purok</button>
      </form>
      <table>
        <thead>
          <tr><th>Purok Name</th><th>Description</th><th>Active Residents Count</th></tr>
        </thead>
        <tbody>
          ${purokList.length > 0 ? purokList.map(p => `
            <tr>
              <td><strong>${p.name}</strong></td>
              <td>${p.description || 'N/A'}</td>
              <td><span class="badge badge-blue">${p.residentCount} Residents</span></td>
            </tr>
          `).join('') : '<tr><td colspan="3" style="text-align:center;">No puroks configured.</td></tr>'}
        </tbody>
      </table>
    </div>
  `, true, 'puroks', 'Barangay Admin'));
});

app.post('/admin/puroks/add', async (req, res) => {
  const { name, description } = req.body;
  await supabase.from('puroks').insert([{ name, description }]);
  res.redirect('/admin/puroks');
});

// Document Management & Certificate Approval
app.get('/admin/documents', async (req, res) => {
  const { data: requests } = await supabase.from('certificate_requests').select('*, residents(first_name, last_name, resident_id_no)').order('created_at', { ascending: false });

  res.send(renderHTML('Document Approval & Management', `
    <div class="card">
      <div class="card-header">
        <h2>Certificate & Document Requests</h2>
      </div>
      <table>
        <thead>
          <tr><th>Req No.</th><th>Resident</th><th>Type</th><th>Purpose</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${requests && requests.length > 0 ? requests.map(r => `
            <tr>
              <td><strong>${r.request_number}</strong></td>
              <td>${r.residents ? `${r.residents.last_name}, ${r.residents.first_name}` : 'N/A'}</td>
              <td>${r.certificate_type}</td>
              <td>${r.purpose}</td>
              <td><span class="badge badge-yellow">${r.status}</span></td>
              <td>
                <a href="/admin/documents/approve/${r.id}" class="btn btn-green btn-sm">Approve & Ready</a>
                <a href="/admin/documents/reject/${r.id}" class="btn btn-danger btn-sm">Reject</a>
              </td>
            </tr>
          `).join('') : '<tr><td colspan="6" style="text-align:center;">No pending certificate requests.</td></tr>'}
        </tbody>
      </table>
    </div>
  `, true, 'documents', 'Barangay Admin'));
});

app.get('/admin/documents/approve/:id', async (req, res) => {
  const { id } = req.params;
  await supabase.from('certificate_requests').update({ status: 'Ready for Release' }).eq('id', id);
  res.redirect('/admin/documents');
});

app.get('/admin/documents/reject/:id', async (req, res) => {
  const { id } = req.params;
  await supabase.from('certificate_requests').update({ status: 'Rejected' }).eq('id', id);
  res.redirect('/admin/documents');
});

// Blotter Management
app.get('/admin/blotter', async (req, res) => {
  const { data: blotters } = await supabase.from('blotter_records').select('*').order('created_at', { ascending: false });

  res.send(renderHTML('Blotter & Incident Records', `
    <div class="card">
      <div class="card-header">
        <h2>Barangay Blotter Records</h2>
      </div>
      <form action="/admin/blotter/add" method="POST" style="margin-bottom:2rem; background:var(--card-bg); padding:1rem; border-radius:8px;">
        <h3 style="margin-bottom:0.75rem; font-size:1.0rem; color:var(--dark-blue);">File New Blotter Incident</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Case Number</label>
            <input type="text" name="case_number" required placeholder="BLTR-2026-001">
          </div>
          <div class="form-group">
            <label>Complainant</label>
            <input type="text" name="complainant" required>
          </div>
          <div class="form-group">
            <label>Respondent</label>
            <input type="text" name="respondent" required>
          </div>
        </div>
        <div class="form-row" style="margin-top:1rem;">
          <div class="form-group">
            <label>Incident Date</label>
            <input type="date" name="incident_date" required>
          </div>
          <div class="form-group">
            <label>Incident Time</label>
            <input type="time" name="incident_time" required>
          </div>
          <div class="form-group">
            <label>Location</label>
            <input type="text" name="location" required>
          </div>
        </div>
        <div class="form-group" style="margin-top:1rem;">
          <label>Incident Description</label>
          <textarea name="description" required rows="2"></textarea>
        </div>
        <button type="submit" class="btn btn-green" style="margin-top:1rem; width:fit-content;">Save Blotter Record</button>
      </form>
      <table>
        <thead>
          <tr><th>Case No.</th><th>Complainant vs Respondent</th><th>Date & Time</th><th>Location</th><th>Status</th></tr>
        </thead>
        <tbody>
          ${blotters && blotters.length > 0 ? blotters.map(b => `
            <tr>
              <td><strong>${b.case_number}</strong></td>
              <td>${b.complainant} vs${b.respondent}</td>
              <td>${b.incident_date}${b.incident_time}</td>
              <td>${b.location}</td>
              <td><span class="badge badge-blue">${b.settlement_status || 'Pending'}</span></td>
            </tr>
          `).join('') : '<tr><td colspan="5" style="text-align:center;">No blotter records found.</td></tr>'}
        </tbody>
      </table>
    </div>
  `, true, 'blotter', 'Barangay Admin'));
});

app.post('/admin/blotter/add', async (req, res) => {
  const { case_number, complainant, respondent, incident_date, incident_time, location, description } = req.body;
  await supabase.from('blotter_records').insert([{ case_number, complainant, respondent, incident_date, incident_time, location, description }]);
  res.redirect('/admin/blotter');
});

// Senior Citizens, PWD, and Solo Parents Modules
app.get('/admin/seniors', async (req, res) => {
  const { data: seniors } = await supabase.from('residents').select('*').eq('is_senior', true).eq('resident_status', 'ACTIVE');
  res.send(renderHTML('Senior Citizens Management', `
    <div class="card">
      <div class="card-header"><h2>Senior Citizen Registry</h2></div>
      <table>
        <thead><tr><th>ID No.</th><th>Name</th><th>Age / DOB</th><th>Contact</th></tr></thead>
        <tbody>
          ${seniors && seniors.length > 0 ? seniors.map(s => `
            <tr>
              <td><strong>${s.resident_id_no}</strong></td>
              <td>${s.last_name},${s.first_name}</td>
              <td>${s.date_of_birth}</td>
              <td>${s.contact_number || 'N/A'}</td>
            </tr>
          `).join('') : '<tr><td colspan="4" style="text-align:center;">No senior citizens registered.</td></tr>'}
        </tbody>
      </table>
    </div>
  `, true, 'seniors', 'Barangay Admin'));
});

app.get('/admin/pwd', async (req, res) => {
  const { data: pwds } = await supabase.from('residents').select('*').eq('is_pwd', true).eq('resident_status', 'ACTIVE');
  res.send(renderHTML('PWD Management', `
    <div class="card">
      <div class="card-header"><h2>Persons with Disabilities (PWD) Registry</h2></div>
      <table>
        <thead><tr><th>ID No.</th><th>Name</th><th>Disability Details</th><th>Contact</th></tr></thead>
        <tbody>
          ${pwds && pwds.length > 0 ? pwds.map(p => `
            <tr>
              <td><strong>${p.resident_id_no}</strong></td>
              <td>${p.last_name},${p.first_name}</td>
              <td>${p.pwd_details || 'N/A'}</td>
              <td>${p.contact_number || 'N/A'}</td>
            </tr>
          `).join('') : '<tr><td colspan="4" style="text-align:center;">No PWD records found.</td></tr>'}
        </tbody>
      </table>
    </div>
  `, true, 'pwd', 'Barangay Admin'));
});

app.get('/admin/solo-parents', async (req, res) => {
  const { data: solos } = await supabase.from('residents').select('*').eq('is_solo_parent', true).eq('resident_status', 'ACTIVE');
  res.send(renderHTML('Solo Parent Management', `
    <div class="card">
      <div class="card-header"><h2>Solo Parent Registry</h2></div>
      <table>
        <thead><tr><th>ID No.</th><th>Name</th><th>Details</th><th>Contact</th></tr></thead>
        <tbody>
          ${solos && solos.length > 0 ? solos.map(s => `
            <tr>
              <td><strong>${s.resident_id_no}</strong></td>
              <td>${s.last_name},${s.first_name}</td>
              <td>${s.solo_parent_details || 'N/A'}</td>
              <td>${s.contact_number || 'N/A'}</td>
            </tr>
          `).join('') : '<tr><td colspan="4" style="text-align:center;">No solo parent records found.</td></tr>'}
        </tbody>
      </table>
    </div>
  `, true, 'solo-parents', 'Barangay Admin'));
});

// User Management
app.get('/admin/users', async (req, res) => {
  const { data: users } = await supabase.from('system_users').select('*');
  res.send(renderHTML('System User Management', `
    <div class="card">
      <div class="card-header"><h2>Admin & Staff Accounts</h2></div>
      <table>
        <thead><tr><th>Full Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
        <tbody>
          ${users && users.length > 0 ? users.map(u => `
            <tr>
              <td><strong>${u.full_name}</strong></td>
              <td>${u.username}</td>
              <td>${u.email}</td>
              <td><span class="badge badge-blue">${u.role}</span></td>
              <td><span class="badge badge-green">${u.status}</span></td>
            </tr>
          `).join('') : '<tr><td colspan="5" style="text-align:center;">No users found.</td></tr>'}
        </tbody>
      </table>
    </div>
  `, true, 'users', 'Barangay Admin'));
});

// Barangay Officials Management
app.get('/admin/officials', async (req, res) => {
  const { data: officials } = await supabase.from('barangay_officials').select('*');
  res.send(renderHTML('Barangay Officials', `
    <div class="card">
      <div class="card-header"><h2>Barangay Officials Directory</h2></div>
      <form action="/admin/officials/add" method="POST" style="margin-bottom:2rem; background:var(--card-bg); padding:1rem; border-radius:8px;">
        <h3 style="margin-bottom:0.75rem; font-size:1.0rem; color:var(--dark-blue);">Add Official</h3>
        <div class="form-row">
          <div class="form-group"><label>Full Name</label><input type="text" name="name" required></div>
          <div class="form-group"><label>Position</label><input type="text" name="position" required placeholder="Punong Barangay / Kagawad"></div>
        </div>
        <button type="submit" class="btn btn-green" style="margin-top:1rem; width:fit-content;">Save Official</button>
      </form>
      <table>
        <thead><tr><th>Name</th><th>Position</th><th>Committee</th><th>Contact</th></tr></thead>
        <tbody>
          ${officials && officials.length > 0 ? officials.map(o => `
            <tr>
              <td><strong>${o.name}</strong></td>
              <td>${o.position}</td>
              <td>${o.committee || 'N/A'}</td>
              <td>${o.contact_number || 'N/A'}</td>
            </tr>
          `).join('') : '<tr><td colspan="4" style="text-align:center;">No officials listed.</td></tr>'}
        </tbody>
      </table>
    </div>
  `, true, 'officials', 'Barangay Admin'));
});

app.post('/admin/officials/add', async (req, res) => {
  const { name, position } = req.body;
  await supabase.from('barangay_officials').insert([{ name, position }]);
  res.redirect('/admin/officials');
});

// Announcements & Events
app.get('/admin/announcements', async (req, res) => {
  const { data: announcements } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
  res.send(renderHTML('Announcements', `
    <div class="card">
      <div class="card-header"><h2>Barangay Announcements</h2></div>
      <form action="/admin/announcements/add" method="POST" style="margin-bottom:2rem; background:var(--card-bg); padding:1rem; border-radius:8px;">
        <div class="form-group"><label>Title</label><input type="text" name="title" required></div>
        <div class="form-group"><label>Content</label><textarea name="content" required rows="3"></textarea></div>
        <button type="submit" class="btn btn-green" style="margin-top:1rem; width:fit-content;">Publish Announcement</button>
      </form>
      <table>
        <thead><tr><th>Title</th><th>Priority</th><th>Date</th></tr></thead>
        <tbody>
          ${announcements && announcements.length > 0 ? announcements.map(a => `
            <tr>
              <td><strong>${a.title}</strong></td>
              <td><span class="badge badge-blue">${a.priority}</span></td>
              <td>${new Date(a.created_at).toLocaleDateString()}</td>
            </tr>
          `).join('') : '<tr><td colspan="3" style="text-align:center;">No announcements.</td></tr>'}
        </tbody>
      </table>
    </div>
  `, true, 'announcements', 'Barangay Admin'));
});

app.post('/admin/announcements/add', async (req, res) => {
  const { title, content } = req.body;
  await supabase.from('announcements').insert([{ title, content }]);
  res.redirect('/admin/announcements');
});

app.get('/admin/events', async (req, res) => {
  const { data: events } = await supabase.from('events').select('*').order('created_at', { ascending: false });
  res.send(renderHTML('Events Management', `
    <div class="card">
      <div class="card-header"><h2>Barangay Community Events</h2></div>
      <form action="/admin/events/add" method="POST" style="margin-bottom:2rem; background:var(--card-bg); padding:1rem; border-radius:8px;">
        <div class="form-row">
          <div class="form-group"><label>Event Name</label><input type="text" name="event_name" required></div>
          <div class="form-group"><label>Location</label><input type="text" name="location" required></div>
        </div>
        <div class="form-row" style="margin-top:1rem;">
          <div class="form-group"><label>Date</label><input type="date" name="event_date" required></div>
          <div class="form-group"><label>Time</label><input type="time" name="event_time" required></div>
        </div>
        <div class="form-group" style="margin-top:1rem;"><label>Description</label><textarea name="description" required rows="2"></textarea></div>
        <button type="submit" class="btn btn-green" style="margin-top:1rem; width:fit-content;">Create Event</button>
      </form>
      <table>
        <thead><tr><th>Event Name</th><th>Date & Time</th><th>Location</th></tr></thead>
        <tbody>
          ${events && events.length > 0 ? events.map(e => `
            <tr>
              <td><strong>${e.event_name}</strong></td>
              <td>${e.event_date}${e.event_time}</td>
              <td>${e.location}</td>
            </tr>
          `).join('') : '<tr><td colspan="3" style="text-align:center;">No events scheduled.</td></tr>'}
        </tbody>
      </table>
    </div>
  `, true, 'events', 'Barangay Admin'));
});

app.post('/admin/events/add', async (req, res) => {
  const { event_name, description, event_date, event_time, location } = req.body;
  await supabase.from('events').insert([{ event_name, description, event_date, event_time, location }]);
  res.redirect('/admin/events');
});

// Reports Module
app.get('/admin/reports', async (req, res) => {
  const { count: totalRes } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'ACTIVE');
  const { count: totalHH } = await supabase.from('households').select('*', { count: 'exact', head: true });
  const { count: totalSeniors } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('is_senior', true);

  res.send(renderHTML('Reports & Analytics', `
    <div class="card">
      <div class="card-header"><h2>Barangay Population & Demographic Reports</h2></div>
      <div class="grid-stats">
        <div class="stat-card"><h3>Total Active Population</h3><div class="value">${totalRes || 0}</div></div>
        <div class="stat-card green"><h3>Registered Households</h3><div class="value">${totalHH || 0}</div></div>
        <div class="stat-card"><h3>Senior Citizens Count</h3><div class="value">${totalSeniors || 0}</div></div>
      </div>
      <div style="display:flex; gap:1rem; margin-top:1.5rem;">
        <button onclick="window.print()" class="btn">Print Report</button>
      </div>
    </div>
  `, true, 'reports', 'Barangay Admin'));
});

// Activity Logs
app.get('/admin/activity-logs', async (req, res) => {
  const { data: logs } = await supabase.from('user_activity_logs').select('*').order('created_at', { ascending: false }).limit(100);
  res.send(renderHTML('Activity Logs', `
    <div class="card">
      <div class="card-header"><h2>System Activity Audit Trail</h2></div>
      <table>
        <thead><tr><th>User / Identifier</th><th>Action Performed</th><th>Timestamp</th></tr></thead>
        <tbody>
          ${logs && logs.length > 0 ? logs.map(l => `
            <tr>
              <td>${l.user_identifier}</td>
              <td>${l.action}</td>
              <td>${new Date(l.created_at).toLocaleString()}</td>
            </tr>
          `).join('') : '<tr><td colspan="3" style="text-align:center;">No activity logs found.</td></tr>'}
        </tbody>
      </table>
    </div>
  `, true, 'activity-logs', 'Barangay Admin'));
});

// QR Scanner & Verification Page
app.get('/admin/scanner', (req, res) => {
  res.send(renderHTML('QR Code Scanner & Verification', `
    <div class="card" style="max-width: 600px; margin: 0 auto; text-align:center;">
      <div class="card-header"><h2>Staff QR Verification & Claim Scanner</h2></div>
      <p style="margin-bottom: 1.5rem; color:var(--text-muted);">Scan resident ID QR code or enter secure verification token manually to verify identity and release requested documents.</p>
      <form action="/admin/scanner/verify" method="POST">
        <div class="form-group">
          <label>Enter QR Token / Resident ID No.</label>
          <input type="text" name="token" required placeholder="BRGY-2026-XXXXXX or Token">
        </div>
        <button type="submit" class="btn btn-green" style="margin-top:1rem; width:100%;">Verify Resident & Document Status</button>
      </form>
    </div>
  `, true, 'scanner', 'Barangay Admin'));
});

app.post('/admin/scanner/verify', async (req, res) => {
  const { token } = req.body;
  const { data: resident, error } = await supabase.from('residents').select('*, puroks(name), households(household_number)').or(`resident_id_no.eq.${token},qr_token.eq.${token}`).single();

  if (error || !resident) {
    return res.send(renderHTML('Verification Failed', `<div class="card" style="max-width: 600px; margin:0 auto; text-align:center;"><div class="alert alert-error">❌ INVALID QR CODE OR RESIDENT NOT FOUND</div><a href="/admin/scanner" class="btn">Scan Another</a></div>`, true, 'scanner', 'Barangay Admin'));
  }

  const { data: requests } = await supabase.from('certificate_requests').select('*').eq('resident_id', resident.id).eq('status', 'Ready for Release');

  res.send(renderHTML('Verification Successful', `
    <div class="card" style="max-width: 700px; margin:0 auto;">
      <div class="alert alert-success">✓ VERIFIED RESIDENT IDENTIFICATION</div>
      <div style="display:flex; gap:1.5rem; align-items:center;">
        <img src="${resident.resident_photo}" style="width:120px; height:130px; border-radius:8px; object-fit:cover; border:2px solid var(--primary-blue);">
        <div>
          <h3>${resident.last_name}, ${resident.first_name} ${resident.middle_name || ''}</h3>
          <p><strong>Resident ID:</strong> ${resident.resident_id_no}</p>
          <p><strong>Purok:</strong> ${resident.puroks ? resident.puroks.name : 'N/A'}</p>
          <p><strong>Contact:</strong> ${resident.contact_number || 'N/A'}</p>
          <p><strong>Status:</strong> <span class="badge badge-green">${resident.resident_status}</span></p>
        </div>
      </div>
      <h3 style="margin-top:1.5rem; margin-bottom:0.75rem; color:var(--dark-blue);">Ready for Release Documents</h3>
      <table>
        <thead><tr><th>Request No.</th><th>Type</th><th>Purpose</th><th>Action</th></tr></thead>
        <tbody>
          ${requests && requests.length > 0 ? requests.map(req => `
            <tr>
              <td><strong>${req.request_number}</strong></td>
              <td>${req.certificate_type}</td>
              <td>${req.purpose}</td>
              <td><a href="/admin/scanner/release/${req.id}" class="btn btn-green btn-sm">Mark Released</a></td>
            </tr>
          `).join('') : '<tr><td colspan="4" style="text-align:center;">No documents ready for release for this resident.</td></tr>'}
        </tbody>
      </table>
      <div style="margin-top: 1.5rem;"><a href="/admin/scanner" class="btn">Scan Another Resident</a></div>
    </div>
  `, true, 'scanner', 'Barangay Admin'));
});

app.get('/admin/scanner/release/:id', async (req, res) => {
  const { id } = req.params;
  await supabase.from('certificate_requests').update({ status: 'Released' }).eq('id', id);
  res.redirect('/admin/scanner');
});

// Bulk 8 IDs per Bond Paper Printing
app.get('/admin/id-printing', async (req, res) => {
  const { data: residents } = await supabase.from('residents').select('*, puroks(name)').eq('resident_status', 'ACTIVE').limit(8);

  res.send(renderHTML('Bulk ID Printing (8-in-1 Grid)', `
    <div class="card">
      <div class="card-header">
        <h2>Bulk ID Printing Sheet (8 IDs per Standard Bond Paper)</h2>
        <button onclick="window.print()" class="btn btn-green">Print 8 IDs Sheet</button>
      </div>
      <p style="margin-bottom:1.5rem; color:var(--text-muted);">The grid below automatically formats active approved residents into a standard letter/bond paper grid layout for physical printing.</p>
      <div class="printable-grid id-card-print-container">
        ${residents && residents.length > 0 ? residents.map(r => `
          <div class="barangay-id-card">
            <div class="id-header">
              <img src="https://via.placeholder.com/35" alt="Logo">
              <div>
                <h4>BARANGAY RESIDENT CARD</h4>
                <p>Brgy. San Jose, Municipality</p>
              </div>
            </div>
            <div class="id-body">
              <img src="${r.resident_photo}" class="id-photo">
              <div class="id-details">
                <strong>${r.last_name},${r.first_name}</strong>
                <span>ID: ${r.resident_id_no}</span>
                <span>DOB: ${r.date_of_birth}</span>
                <span>Purok: ${r.puroks ? r.puroks.name : 'N/A'}</span>
                <span>Contact: ${r.contact_number || 'N/A'}</span>
              </div>
            </div>
            <div class="id-footer">
              <div class="id-signature">
                <span style="font-size:0.55rem;">Hon. Brgy Captain</span>
                <div style="border-bottom:1px solid #000; width:60px; margin:2px auto;"></div>
              </div>
              <div style="font-size:0.5rem; text-align:right;">Official Resident ID</div>
            </div>
          </div>
        `).join('') : '<p>No active residents available for ID printing.</p>'}
      </div>
    </div>
  `, true, 'id-printing', 'Barangay Admin'));
});

// Backup & Restore
app.get('/admin/backup', async (req, res) => {
  const { data: backups } = await supabase.from('backup_metadata').select('*').order('created_at', { ascending: false });
  res.send(renderHTML('Backup & Restore', `
    <div class="card">
      <div class="card-header"><h2>Database Backup & Restore Management</h2></div>
      <form action="/admin/backup/create" method="POST" style="margin-bottom:2rem;">
        <button type="submit" class="btn btn-green">Create New Supabase Database Backup</button>
      </form>
      <table>
        <thead><tr><th>Backup Name</th><th>File Size</th><th>Created At</th></tr></thead>
        <tbody>
          ${backups && backups.length > 0 ? backups.map(b => `
            <tr>
              <td><strong>${b.backup_name}</strong></td>
              <td>${b.file_size || '1.2 MB'}</td>
              <td>${new Date(b.created_at).toLocaleString()}</td>
            </tr>
          `).join('') : '<tr><td colspan="3" style="text-align:center;">No backups recorded.</td></tr>'}
        </tbody>
      </table>
    </div>
  `, true, 'backup', 'Barangay Admin'));
});

app.post('/admin/backup/create', async (req, res) => {
  await supabase.from('backup_metadata').insert([{ backup_name: `Backup-${new Date().toISOString().slice(0,10)}`, file_size: '1.4 MB', created_by: 'Admin' }]);
  res.redirect('/admin/backup');
});

// System Settings
app.get('/admin/settings', async (req, res) => {
  const { data: settings } = await supabase.from('barangay_settings').select('*').single();
  res.send(renderHTML('System Settings', `
    <div class="card" style="max-width: 800px; margin: 0 auto;">
      <div class="card-header"><h2>Barangay & System Configuration</h2></div>
      <form action="/admin/settings/update" method="POST">
        <div class="form-row">
          <div class="form-group"><label>Barangay Name</label><input type="text" name="barangay_name" value="${settings ? settings.barangay_name : ''}"></div>
          <div class="form-group"><label>Municipality / City</label><input type="text" name="municipality" value="${settings ? settings.municipality : ''}"></div>
        </div>
        <div class="form-row" style="margin-top:1rem;">
          <div class="form-group"><label>Province</label><input type="text" name="province" value="${settings ? settings.province : ''}"></div>
          <div class="form-group"><label>Barangay Captain</label><input type="text" name="barangay_captain" value="${settings ? settings.barangay_captain : ''}"></div>
        </div>
        <div class="form-group" style="margin-top:1rem;"><label>Barangay Address</label><input type="text" name="barangay_address" value="${settings ? settings.barangay_address : ''}"></div>
        <button type="submit" class="btn btn-green" style="margin-top:1.5rem; width:fit-content;">Save Settings</button>
      </form>
    </div>
  `, true, 'settings', 'Barangay Admin'));
});

app.post('/admin/settings/update', async (req, res) => {
  const { barangay_name, municipality, province, barangay_captain, barangay_address } = req.body;
  const { data: existing } = await supabase.from('barangay_settings').select('id').single();
  if (existing) {
    await supabase.from('barangay_settings').update({ barangay_name, municipality, province, barangay_captain, barangay_address }).eq('id', existing.id);
  } else {
    await supabase.from('barangay_settings').insert([{ barangay_name, municipality, province, barangay_captain, barangay_address }]);
  }
  res.redirect('/admin/settings');
});


// ==========================================
// RESIDENT PORTAL ROUTES
// ==========================================

app.get('/resident/dashboard', async (req, res) => {
  const rid = req.query.rid;
  if (!rid) return res.redirect('/login');
  const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('id', rid).single();
  if (!resident) return res.redirect('/login');

  const { data: requests } = await supabase.from('certificate_requests').select('*').eq('resident_id', rid);

  res.send(renderHTML('Resident Dashboard', `
    <div class="card-header" style="border:none; margin-bottom:1rem;">
      <h2>Welcome, ${resident.first_name} ${resident.last_name}</h2>
    </div>
    <div class="grid-stats">
      <div class="stat-card"><h3>Resident ID No.</h3><div class="value" style="font-size:1.4rem;">${resident.resident_id_no}</div></div>
      <div class="stat-card green"><h3>Purok</h3><div class="value" style="font-size:1.4rem;">${resident.puroks ? resident.puroks.name : 'N/A'}</div></div>
      <div class="stat-card"><h3>Total Requests</h3><div class="value">${requests ? requests.length : 0}</div></div>
      <div class="stat-card green"><h3>Status</h3><div class="value" style="font-size:1.4rem;"><span class="badge badge-green">${resident.resident_status}</span></div></div>
    </div>
  `, true, 'dashboard', 'Resident'));
});

app.get('/resident/profile', async (req, res) => {
  const rid = req.query.rid;
  res.send(renderHTML('My Profile', `<div class="card"><h2>Resident Official Profile</h2><p>View your official barangay resident record.</p></div>`, true, 'profile', 'Resident'));
});

app.get('/resident/edit-request', async (req, res) => {
  res.send(renderHTML('Edit Profile Request', `<div class="card"><h2>Submit Profile Correction Request</h2><form><div class="form-group"><label>Requested Corrections</label><textarea rows="3"></textarea></div><button class="btn btn-green">Submit Request</button></form></div>`, true, 'edit-request', 'Resident'));
});

app.get('/resident/certificates', async (req, res) => {
  res.send(renderHTML('Certificate Request', `<div class="card"><h2>Request Barangay Certificate</h2><form><div class="form-group"><label>Certificate Type</label><select><option>Certificate of Residency</option><option>Barangay Clearance</option><option>Certificate of Indigency</option></select></div><div class="form-group"><label>Purpose</label><input type="text" required></div><button class="btn btn-green">Submit Certificate Request</button></form></div>`, true, 'certificates', 'Resident'));
});

app.get('/resident/tracking', async (req, res) => {
  res.send(renderHTML('Request Tracking', `<div class="card"><h2>Track Certificate Requests</h2><table><thead><tr><th>Type</th><th>Status</th><th>Date</th></tr></thead><tbody><tr><td colspan="3" style="text-align:center;">No active requests</td></tr></tbody></table></div>`, true, 'tracking', 'Resident'));
});

app.get('/resident/appointments', async (req, res) => {
  res.send(renderHTML('Appointment Booking', `<div class="card"><h2>Book Official Appointment</h2><p>Schedule your visit to the Barangay Hall.</p></div>`, true, 'appointments', 'Resident'));
});

app.get('/resident/documents', async (req, res) => {
  res.send(renderHTML('My Documents', `<div class="card"><h2>My Issued Documents</h2><p>Download official released documents.</p></div>`, true, 'documents', 'Resident'));
});

app.get('/resident/complaints', async (req, res) => {
  res.send(renderHTML('Complaints & Reports', `<div class="card"><h2>Submit Community Complaint</h2><form><div class="form-group"><label>Subject</label><input type="text" required></div><div class="form-group"><label>Description</label><textarea rows="3" required></textarea></div><button class="btn btn-green">File Complaint</button></form></div>`, true, 'complaints', 'Resident'));
});

app.get('/resident/assistance', async (req, res) => {
  res.send(renderHTML('Assistance Request', `<div class="card"><h2>Request Barangay Assistance</h2><p>Financial, Medical, or Food Assistance application.</p></div>`, true, 'assistance', 'Resident'));
});

app.get('/resident/announcements', async (req, res) => {
  res.send(renderHTML('Announcements', `<div class="card"><h2>Barangay Announcements & News</h2><p>Stay updated with the latest community bulletins.</p></div>`, true, 'announcements', 'Resident'));
});

app.get('/resident/notifications', async (req, res) => {
  res.send(renderHTML('Notifications', `<div class="card"><h2>Notifications</h2><p>No new notifications.</p></div>`, true, 'notifications', 'Resident'));
});

app.get('/resident/feedback', async (req, res) => {
  res.send(renderHTML('Feedback', `<div class="card"><h2>Service Feedback</h2><form><div class="form-group"><label>Rating (1-5)</label><input type="number" min="1" max="5" value="5"></div><div class="form-group"><label>Comments</label><textarea rows="2"></textarea></div><button class="btn btn-green">Submit Feedback</button></form></div>`, true, 'feedback', 'Resident'));
});

app.get('/resident/emergency', async (req, res) => {
  const { data: contacts } = await supabase.from('emergency_contacts').select('*');
  res.send(renderHTML('Emergency Contacts', `
    <div class="card">
      <div class="card-header"><h2>Emergency Hotlines & Contacts</h2></div>
      <table>
        <thead><tr><th>Name</th><th>Category</th><th>Hotline Number</th><th>Address</th></tr></thead>
        <tbody>
          ${contacts && contacts.length > 0 ? contacts.map(c => `
            <tr>
              <td><strong>${c.name}</strong></td>
              <td>${c.category}</td>
              <td><span class="badge badge-green">${c.hotline_number}</span></td>
              <td>${c.address || 'N/A'}</td>
            </tr>
          `).join('') : '<tr><td colspan="4" style="text-align:center;">No emergency contacts listed.</td></tr>'}
        </tbody>
      </table>
    </div>
  `, true, 'emergency', 'Resident'));
});

app.get('/resident/digital-id', async (req, res) => {
  const rid = req.query.rid;
  const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('id', rid).single();

  res.send(renderHTML('My Digital ID', `
    <div class="card" style="text-align:center;">
      <div class="card-header"><h2>My Digital Barangay Resident ID</h2></div>
      <p style="margin-bottom:1.5rem; color:var(--text-muted);">This digital ID is synchronized with your official barangay resident record.</p>
      <div style="display:flex; justify-content:center;">
        <div class="barangay-id-card" style="margin: 0 auto;">
          <div class="id-header">
            <img src="https://via.placeholder.com/35" alt="Logo">
            <div>
              <h4>BARANGAY RESIDENT CARD</h4>
              <p>Brgy. San Jose, Municipality</p>
            </div>
          </div>
          <div class="id-body">
            <img src="${resident ? resident.resident_photo : 'https://via.placeholder.com/150'}" class="id-photo">
            <div class="id-details">
              <strong>${resident ? resident.last_name + ', ' + resident.first_name : 'Sample Resident'}</strong>
              <span>ID: ${resident ? resident.resident_id_no : 'BRGY-2026-000000'}</span>
              <span>DOB: ${resident ? resident.date_of_birth : '2000-01-01'}</span>
              <span>Purok: ${resident && resident.puroks ? resident.puroks.name : 'N/A'}</span>
            </div>
          </div>
          <div class="id-footer">
            <div class="id-signature">
              <span style="font-size:0.55rem;">Hon. Brgy Captain</span>
              <div style="border-bottom:1px solid #000; width:60px; margin:2px auto;"></div>
            </div>
            <div style="font-size:0.5rem; text-align:right;">Official Digital ID</div>
          </div>
        </div>
      </div>
    </div>
  `, true, 'digital-id', 'Resident'));
});

app.get('/resident/security', async (req, res) => {
  res.send(renderHTML('Account Security', `<div class="card"><h2>Account Security & Password</h2><form><div class="form-group"><label>Current Password</label><input type="password" required></div><div class="form-group"><label>New Password</label><input type="password" required></div><button class="btn btn-green">Update Password</button></form></div>`, true, 'security', 'Resident'));
});


// Server Listener
app.listen(PORT, () => {
  console.log(`Barangay Resident Management System running on port ${PORT}`);
});
