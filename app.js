const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') 
    ? { rejectUnauthorized: false } 
    : false
});

// Create uploads folder locally (fallback/temporary)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('Only images (JPG, PNG) and PDFs are allowed'));
  }
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

app.use(session({
  store: new pgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'default_barangay_secret_2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, secure: false } // Set secure: true if using HTTPS in prod
}));

// Global Helper Functions
function calculateAge(birthdate) {
  if (!birthdate) return 0;
  const today = new Date();
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatDate(d) {
  if (!d) return 'N/A';
  return new Date(d).toISOString().split('T')[0];
}

// Activity Logging Helper
async function logActivity(userId, role, action, moduleName, recordId, ip = '') {
  try {
    await pool.query(
      `INSERT INTO activity_logs (user_id, role, action, module_name, record_id, ip_address) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId || null, role, action, moduleName, recordId ? String(recordId) : null, ip]
    );
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

// Database Initialization
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        barangay_name VARCHAR(255) DEFAULT 'Barangay San Jose',
        municipality VARCHAR(255) DEFAULT 'City of Angeles',
        province VARCHAR(255) DEFAULT 'Pampanga',
        contact_number VARCHAR(50) DEFAULT '(045) 123-4567',
        email VARCHAR(255) DEFAULT 'info@barangaysanjose.gov.ph',
        logo_url VARCHAR(255) DEFAULT '',
        system_title VARCHAR(255) DEFAULT 'Barangay Resident Management System'
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'STAFF', 'RESIDENT')),
        status VARCHAR(20) DEFAULT 'ACTIVE',
        permissions JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS residents (
        id SERIAL PRIMARY KEY,
        user_id INT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
        resident_id_number VARCHAR(50) UNIQUE,
        first_name VARCHAR(100) NOT NULL,
        middle_name VARCHAR(100),
        last_name VARCHAR(100) NOT NULL,
        suffix VARCHAR(20),
        birthdate DATE NOT NULL,
        sex VARCHAR(10) NOT NULL,
        civil_status VARCHAR(20) NOT NULL,
        address TEXT NOT NULL,
        contact_number VARCHAR(50),
        email VARCHAR(255),
        occupation VARCHAR(100),
        educational_attainment VARCHAR(100),
        nationality VARCHAR(50) DEFAULT 'Filipino',
        voter_status BOOLEAN DEFAULT false,
        pwd_status BOOLEAN DEFAULT false,
        senior_citizen_status BOOLEAN DEFAULT false,
        four_ps_status BOOLEAN DEFAULT false,
        emergency_contact_name VARCHAR(200),
        emergency_contact_number VARCHAR(50),
        photo_url TEXT,
        valid_id_url TEXT,
        qr_token VARCHAR(255) UNIQUE,
        qr_status VARCHAR(20) DEFAULT 'ACTIVE',
        approval_status VARCHAR(20) DEFAULT 'PENDING',
        archived BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS households (
        id SERIAL PRIMARY KEY,
        household_number VARCHAR(50) UNIQUE NOT NULL,
        head_resident_id INT REFERENCES residents(id) ON DELETE SET NULL,
        address TEXT NOT NULL,
        classification VARCHAR(100) DEFAULT 'Residential',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS household_members (
        id SERIAL PRIMARY KEY,
        household_id INT REFERENCES households(id) ON DELETE CASCADE,
        resident_id INT REFERENCES residents(id) ON DELETE CASCADE,
        relationship VARCHAR(50) NOT NULL,
        UNIQUE(household_id, resident_id)
      );

      CREATE TABLE IF NOT EXISTS officials (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(200) NOT NULL,
        position VARCHAR(100) NOT NULL,
        contact VARCHAR(50),
        term VARCHAR(100),
        photo_url TEXT,
        signature_url TEXT,
        active BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS document_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        requirements TEXT,
        fee NUMERIC(10,2) DEFAULT 0.00
      );

      CREATE TABLE IF NOT EXISTS document_requests (
        id SERIAL PRIMARY KEY,
        request_number VARCHAR(50) UNIQUE NOT NULL,
        resident_id INT REFERENCES residents(id) ON DELETE CASCADE,
        document_type_id INT REFERENCES document_types(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'PENDING',
        remarks TEXT,
        uploaded_file_url TEXT,
        processor_id INT REFERENCES users(id) ON DELETE SET NULL,
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS blotter_records (
        id SERIAL PRIMARY KEY,
        case_number VARCHAR(50) UNIQUE NOT NULL,
        complainant_name VARCHAR(200) NOT NULL,
        respondent_name VARCHAR(200) NOT NULL,
        incident_type VARCHAR(100) NOT NULL,
        incident_date DATE NOT NULL,
        incident_time TIME NOT NULL,
        location TEXT NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'OPEN',
        action_taken TEXT,
        created_by INT REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        published BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS concerns (
        id SERIAL PRIMARY KEY,
        resident_id INT REFERENCES residents(id) ON DELETE CASCADE,
        subject VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'SUBMITTED',
        response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INT,
        role VARCHAR(20),
        action TEXT NOT NULL,
        module_name VARCHAR(50),
        record_id VARCHAR(50),
        ip_address VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure Default Settings
    const settingsCheck = await client.query('SELECT id FROM system_settings LIMIT 1');
    if (settingsCheck.rowCount === 0) {
      await client.query('INSERT INTO system_settings (barangay_name) VALUES ($1)', ['Barangay San Jose']);
    }

    // Ensure Initial Document Types
    const docsCheck = await client.query('SELECT id FROM document_types LIMIT 1');
    if (docsCheck.rowCount === 0) {
      await client.query(`
        INSERT INTO document_types (name, description, requirements) VALUES 
        ('Barangay Clearance', 'Clearance for employment or general business', 'Valid ID, Proof of Residency'),
        ('Certificate of Residency', 'Proof of staying in the barangay', 'Valid ID'),
        ('Certificate of Indigency', 'Proof of financial qualification for assistance', 'Valid ID, Barangay Assessment')
      `);
    }

    // Initial Default Admin Setup
    const adminCheck = await client.query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (adminCheck.rowCount === 0) {
      const hashedPass = await bcrypt.hash('admin123', 10);
      await client.query(
        "INSERT INTO users (username, password_hash, role, status) VALUES ($1, $2, $3, $4)",
        ['admin', hashedPass, 'ADMIN', 'ACTIVE']
      );
      console.log('Default Administrator Created: admin / admin123');
    }

    await client.query('COMMIT');
    console.log('Database schema successfully initialized.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
}

// Authentication & Route Protection Middleware
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/admin-login');
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user || req.session.user.role !== role) {
      return res.status(403).send('Access Denied: Unauthorized Role Access');
    }
    next();
  };
}

function requireStaffOrAdmin(req, res, next) {
  if (!req.session.user || (req.session.user.role !== 'ADMIN' && req.session.user.role !== 'STAFF')) {
    return res.status(403).send('Access Denied: Staff or Admin Access Required');
  }
  next();
}

function requireStaffPermission(permission) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/staff-login');
    if (req.session.user.role === 'ADMIN') return next();
    if (req.session.user.role === 'STAFF') {
      const perms = req.session.user.permissions || [];
      if (perms.includes(permission) || perms.includes('ALL')) return next();
    }
    return res.status(403).send(`Access Denied: Requires ${permission} Permission`);
  };
}

// UI Wrapper Helpers
function renderLayout(title, portalType, content, user = null) {
  let navLinks = '';
  let themeColor = '#1e3a8a';

  if (portalType === 'ADMIN') {
    themeColor = '#1e3a8a';
    navLinks = `
      <a href="/admin/dashboard" class="nav-link">Dashboard</a>
      <a href="/admin/residents" class="nav-link">Residents</a>
      <a href="/admin/households" class="nav-link">Households</a>
      <a href="/admin/accounts" class="nav-link">Accounts & Staff</a>
      <a href="/admin/officials" class="nav-link">Officials</a>
      <a href="/admin/document-requests" class="nav-link">Doc Requests</a>
      <a href="/admin/blotter" class="nav-link">Blotter</a>
      <a href="/admin/announcements" class="nav-link">Announcements</a>
      <a href="/admin/qr" class="nav-link">QR Scanner</a>
      <a href="/admin/reports" class="nav-link">Reports</a>
      <a href="/admin/logs" class="nav-link">Logs</a>
      <a href="/admin/settings" class="nav-link">Settings</a>
      <a href="/logout" class="nav-link logout">Logout</a>
    `;
  } else if (portalType === 'STAFF') {
    themeColor = '#0d9488';
    navLinks = `
      <a href="/staff/dashboard" class="nav-link">Dashboard</a>
      <a href="/staff/residents" class="nav-link">Residents</a>
      <a href="/staff/households" class="nav-link">Households</a>
      <a href="/staff/document-requests" class="nav-link">Doc Requests</a>
      <a href="/staff/blotter" class="nav-link">Blotter</a>
      <a href="/staff/qr" class="nav-link">QR Scanner</a>
      <a href="/staff/reports" class="nav-link">Reports</a>
      <a href="/logout" class="nav-link logout">Logout</a>
    `;
  } else if (portalType === 'RESIDENT') {
    themeColor = '#15803d';
    navLinks = `
      <a href="/resident/dashboard" class="nav-link">Dashboard</a>
      <a href="/resident/profile" class="nav-link">My Profile</a>
      <a href="/resident/household" class="nav-link">My Household</a>
      <a href="/resident/id" class="nav-link">My Resident ID</a>
      <a href="/resident/qr" class="nav-link">My QR Code</a>
      <a href="/resident/documents" class="nav-link">Request Documents</a>
      <a href="/resident/concerns" class="nav-link">Concerns & Requests</a>
      <a href="/resident/announcements" class="nav-link">Announcements</a>
      <a href="/resident/notifications" class="nav-link">Notifications</a>
      <a href="/logout" class="nav-link logout">Logout</a>
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - Barangay Resident Management System</title>
      <style>
        :root { --primary-color: ${themeColor}; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background-color: #f4f6f9; color: #333; display: flex; flex-direction: column; min-height: 100vh; }
        header { background-color: var(--primary-color); color: #fff; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
        header h1 { font-size: 1.25rem; font-weight: 600; }
        .wrapper { display: flex; flex: 1; }
        nav { width: 250px; background: #fff; border-right: 1px solid #e5e7eb; padding: 1rem 0; flex-shrink: 0; }
        .nav-link { display: block; padding: 0.75rem 1.5rem; color: #4b5563; text-decoration: none; font-weight: 500; font-size: 0.95rem; border-left: 4px solid transparent; }
        .nav-link:hover, .nav-link.active { background-color: #f3f4f6; color: var(--primary-color); border-left-color: var(--primary-color); }
        .nav-link.logout { color: #dc2626; border-top: 1px solid #e5e7eb; margin-top: 1rem; }
        main { flex: 1; padding: 2rem; overflow-x: auto; }
        .card { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 1.5rem; margin-bottom: 1.5rem; }
        .card h2 { font-size: 1.2rem; margin-bottom: 1rem; color: #111827; border-bottom: 2px solid #f3f4f6; padding-bottom: 0.5rem; }
        .grid-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
        .stat-card { background: #fff; border-radius: 8px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border-left: 5px solid var(--primary-color); }
        .stat-card h3 { font-size: 0.85rem; text-transform: uppercase; color: #6b7280; font-weight: 600; }
        .stat-card p { font-size: 1.75rem; font-weight: bold; color: #111827; margin-top: 0.25rem; }
        table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
        th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; }
        th { background-color: #f9fafb; font-weight: 600; color: #374151; }
        tr:hover { background-color: #f9fafb; }
        .btn { display: inline-block; padding: 0.5rem 1rem; background-color: var(--primary-color); color: #fff; border-radius: 6px; text-decoration: none; border: none; cursor: pointer; font-size: 0.9rem; font-weight: 500; }
        .btn-danger { background-color: #dc2626; }
        .btn-secondary { background-color: #6b7280; }
        .btn-success { background-color: #16a34a; }
        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.25rem; color: #374151; }
        .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.9rem; }
        .badge { padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
        .badge-success { background-color: #dcfce7; color: #166534; }
        .badge-warning { background-color: #fef3c7; color: #92400e; }
        .badge-danger { background-color: #fee2e2; color: #991b1b; }
        @media (max-width: 768px) {
          .wrapper { flex-direction: column; }
          nav { width: 100%; border-right: none; border-bottom: 1px solid #e5e7eb; }
          main { padding: 1rem; }
        }
      </style>
    </head>
    <body>
      <header>
        <h1>${title}</h1>
        <div>${user ? `<span>Logged in as: <strong>${user.username}</strong> (${user.role})</span>` : ''}</div>
      </header>
      <div class="wrapper">
        ${navLinks ? `<nav>${navLinks}</nav>` : ''}
        <main>
          ${content}
        </main>
      </div>
    </body>
    </html>
  `;
}

// ----------------------------------------------------
// PUBLIC & AUTHENTICATION ROUTES
// ----------------------------------------------------

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Barangay Portal Portal Portal</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: sans-serif; background: #f3f4f6; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .portal-card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 100%; }
        .btn { display: block; width: 100%; margin: 10rem 0; padding: 0.75rem; background: #1e3a8a; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; }
        .btn-staff { background: #0d9488; }
        .btn-resident { background: #15803d; }
      </style>
    </head>
    <body>
      <div class="portal-card">
        <h2>Barangay Portal Portal</h2>
        <p style="color: #6b7280; margin-bottom: 1.5rem;">Select your entry point</p>
        <a href="/admin-login" class="btn">Admin Portal</a>
        <a href="/staff-login" class="btn btn-staff">Staff Portal</a>
        <a href="/resident-login" class="btn btn-resident">Resident Portal</a>
        <a href="/resident-register" style="display: block; margin-top: 1rem; color: #374151; text-decoration: none;">New Resident? Register Here</a>
      </div>
    </body>
    </html>
  `);
});

// Admin Login
app.get('/admin-login', (req, res) => {
  res.send(renderLayout('Admin Login', 'PUBLIC', `
    <div style="max-width:400px; margin:4rem auto;" class="card">
      <h2>Admin Login</h2>
      <form action="/admin-login" method="POST">
        <div class="form-group">
          <label>Username</label>
          <input type="text" name="username" required>
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" required>
        </div>
        <button type="submit" class="btn" style="width:100%;">Login</button>
      </form>
    </div>
  `));
});

app.post('/admin-login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1 AND role = 'ADMIN'", [username]);
    if (result.rowCount === 0) return res.send('Invalid credentials');
    
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.send('Invalid credentials');

    req.session.user = { id: user.id, username: user.username, role: user.role };
    await logActivity(user.id, user.role, 'LOGIN', 'AUTH', user.id, req.ip);
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Staff Login
app.get('/staff-login', (req, res) => {
  res.send(renderLayout('Staff Login', 'PUBLIC', `
    <div style="max-width:400px; margin:4rem auto;" class="card">
      <h2>Staff Login</h2>
      <form action="/staff-login" method="POST">
        <div class="form-group">
          <label>Username</label>
          <input type="text" name="username" required>
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" required>
        </div>
        <button type="submit" class="btn btn-secondary" style="width:100%; background:#0d9488;">Login as Staff</button>
      </form>
    </div>
  `));
});

app.post('/staff-login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1 AND role = 'STAFF'", [username]);
    if (result.rowCount === 0) return res.send('Invalid staff credentials');
    
    const user = result.rows[0];
    if (user.status !== 'ACTIVE') return res.send('Account disabled');

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.send('Invalid staff credentials');

    req.session.user = { id: user.id, username: user.username, role: user.role, permissions: user.permissions };
    await logActivity(user.id, user.role, 'LOGIN', 'AUTH', user.id, req.ip);
    res.redirect('/staff/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Resident Login
app.get('/resident-login', (req, res) => {
  res.send(renderLayout('Resident Login', 'PUBLIC', `
    <div style="max-width:400px; margin:4rem auto;" class="card">
      <h2>Resident Login</h2>
      <form action="/resident-login" method="POST">
        <div class="form-group">
          <label>Username / Email</label>
          <input type="text" name="username" required>
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" required>
        </div>
        <button type="submit" class="btn btn-success" style="width:100%;">Login as Resident</button>
      </form>
      <p style="margin-top:1rem; font-size:0.85rem; text-align:center;">Don't have an account? <a href="/resident-register">Register Here</a></p>
    </div>
  `));
});

app.post('/resident-login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1 AND role = 'RESIDENT'", [username]);
    if (result.rowCount === 0) return res.send('Invalid resident credentials');

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.send('Invalid resident credentials');

    const resRecord = await pool.query("SELECT * FROM residents WHERE user_id = $1", [user.id]);
    if (resRecord.rowCount === 0) return res.send('Resident details missing');

    const resident = resRecord.rows[0];
    if (resident.approval_status === 'PENDING') {
      return res.send('Your account registration is currently PENDING approval from the Barangay Admin.');
    }
    if (resident.approval_status === 'REJECTED') {
      return res.send('Your account registration request was rejected.');
    }

    req.session.user = { id: user.id, username: user.username, role: user.role, residentId: resident.id };
    await logActivity(user.id, user.role, 'LOGIN', 'AUTH', resident.id, req.ip);
    res.redirect('/resident/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Resident Registration
app.get('/resident-register', (req, res) => {
  res.send(renderLayout('Resident Registration', 'PUBLIC', `
    <div style="max-width:700px; margin:2rem auto;" class="card">
      <h2>New Resident Registration</h2>
      <form action="/resident-register" method="POST" enctype="multipart/form-data">
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
          <div class="form-group"><label>First Name*</label><input type="text" name="first_name" required></div>
          <div class="form-group"><label>Middle Name</label><input type="text" name="middle_name"></div>
          <div class="form-group"><label>Last Name*</label><input type="text" name="last_name" required></div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
          <div class="form-group"><label>Suffix</label><input type="text" name="suffix"></div>
          <div class="form-group"><label>Birthdate*</label><input type="date" name="birthdate" required></div>
          <div class="form-group">
            <label>Sex*</label>
            <select name="sex" required><option value="Male">Male</option><option value="Female">Female</option></select>
          </div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label>Civil Status*</label>
            <select name="civil_status" required>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Widowed">Widowed</option>
              <option value="Separated">Separated</option>
            </select>
          </div>
          <div class="form-group"><label>Contact Number*</label><input type="text" name="contact_number" required></div>
        </div>
        <div class="form-group"><label>Complete Address*</label><input type="text" name="address" required></div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group"><label>Occupation</label><input type="text" name="occupation"></div>
          <div class="form-group"><label>Educational Attainment</label><input type="text" name="educational_attainment"></div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
          <div class="form-group"><label><input type="checkbox" name="voter_status" value="true"> Registered Voter</label></div>
          <div class="form-group"><label><input type="checkbox" name="pwd_status" value="true"> PWD</label></div>
          <div class="form-group"><label><input type="checkbox" name="four_ps_status" value="true"> 4Ps Beneficiary</label></div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group"><label>Emergency Contact Name</label><input type="text" name="emergency_contact_name"></div>
          <div class="form-group"><label>Emergency Contact Number</label><input type="text" name="emergency_contact_number"></div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group"><label>Resident Photo (JPG/PNG)*</label><input type="file" name="photo" accept="image/*" required></div>
          <div class="form-group"><label>Valid ID Upload (JPG/PNG/PDF)*</label><input type="file" name="valid_id" accept="image/*,.pdf" required></div>
        </div>
        <hr style="margin: 1rem 0;">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group"><label>Username*</label><input type="text" name="username" required></div>
          <div class="form-group"><label>Email*</label><input type="email" name="email" required></div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group"><label>Password*</label><input type="password" name="password" required></div>
          <div class="form-group"><label>Confirm Password*</label><input type="password" name="confirm_password" required></div>
        </div>
        <button type="submit" class="btn btn-success" style="width:100%; margin-top: 1rem;">Submit Registration</button>
      </form>
    </div>
  `));
});

app.post('/resident-register', upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'valid_id', maxCount: 1 }]), async (req, res) => {
  const {
    first_name, middle_name, last_name, suffix, birthdate, sex, civil_status,
    address, contact_number, email, occupation, educational_attainment,
    voter_status, pwd_status, four_ps_status, emergency_contact_name,
    emergency_contact_number, username, password, confirm_password
  } = req.body;

  if (password !== confirm_password) {
    return res.send('Passwords do not match');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check existing username
    const userExists = await client.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userExists.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.send('Username already registered.');
    }

    const hashedPass = await bcrypt.hash(password, 10);
    const userRes = await client.query(
      "INSERT INTO users (username, password_hash, role, status) VALUES ($1, $2, 'RESIDENT', 'ACTIVE') RETURNING id",
      [username, hashedPass]
    );
    const userId = userRes.rows[0].id;

    const photoUrl = req.files['photo'] ? '/uploads/' + req.files['photo'][0].filename : '';
    const validIdUrl = req.files['valid_id'] ? '/uploads/' + req.files['valid_id'][0].filename : '';

    const age = calculateAge(birthdate);
    const isSenior = age >= 60;
    const qrToken = 'QR-' + Date.now() + '-' + Math.round(Math.random() * 10000);

    await client.query(`
      INSERT INTO residents (
        user_id, first_name, middle_name, last_name, suffix, birthdate, sex, civil_status,
        address, contact_number, email, occupation, educational_attainment, voter_status,
        pwd_status, senior_citizen_status, four_ps_status, emergency_contact_name,
        emergency_contact_number, photo_url, valid_id_url, qr_token, approval_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, 'PENDING')
    `, [
      userId, first_name, middle_name, last_name, suffix, birthdate, sex, civil_status,
      address, contact_number, email, occupation, educational_attainment, voter_status === 'true',
      pwd_status === 'true', isSenior, four_ps_status === 'true', emergency_contact_name,
      emergency_contact_number, photoUrl, validIdUrl, qrToken
    ]);

    await client.query('COMMIT');
    res.send('Registration submitted successfully! Please wait for Admin approval before logging in. <a href="/resident-login">Go to Login</a>');
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).send('Registration failed: ' + err.message);
  } finally {
    client.release();
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ----------------------------------------------------
// RESIDENT PORTAL ROUTES
// ----------------------------------------------------

app.get('/resident/dashboard', requireAuth, requireRole('RESIDENT'), async (req, res) => {
  try {
    const residentRes = await pool.query('SELECT * FROM residents WHERE user_id = $1', [req.session.user.id]);
    const resident = residentRes.rows[0];

    const requestsRes = await pool.query(
      'SELECT dr.*, dt.name as doc_name FROM document_requests dr JOIN document_types dt ON dr.document_type_id = dt.id WHERE dr.resident_id = $1 ORDER BY dr.requested_at DESC LIMIT 5',
      [resident.id]
    );

    const notificationsRes = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
      [req.session.user.id]
    );

    const announcementsRes = await pool.query('SELECT * FROM announcements WHERE published = true ORDER BY created_at DESC LIMIT 3');

    const content = `
      <h2>Welcome, ${resident.first_name}!</h2>
      <div class="grid-stats">
        <div class="stat-card">
          <h3>Resident ID</h3>
          <p style="font-size: 1.2rem;">${resident.resident_id_number || 'Pending'}</p>
        </div>
        <div class="stat-card">
          <h3>Account Status</h3>
          <p style="font-size: 1.2rem;"><span class="badge badge-success">${resident.approval_status}</span></p>
        </div>
      </div>

      <div class="card">
        <h2>Recent Document Requests</h2>
        <table>
          <thead>
            <tr><th>Request #</th><th>Document</th><th>Date</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${requestsRes.rows.map(r => `
              <tr>
                <td>${r.request_number}</td>
                <td>${r.doc_name}</td>
                <td>${formatDate(r.requested_at)}</td>
                <td><span class="badge badge-${r.status === 'COMPLETED' ? 'success' : 'warning'}">${r.status}</span></td>
              </tr>
            `).join('') || '<tr><td colspan="4">No requests found</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="card">
        <h2>Barangay Announcements</h2>
        ${announcementsRes.rows.map(a => `
          <div style="margin-bottom:1rem; border-bottom:1px solid #eee; padding-bottom:0.5rem;">
            <h4>${a.title}</h4>
            <p style="font-size:0.9rem; color:#555;">${a.content}</p>
            <small style="color:#888;">${formatDate(a.created_at)}</small>
          </div>
        `).join('') || '<p>No announcements.</p>'}
      </div>
    `;

    res.send(renderLayout('Resident Dashboard', 'RESIDENT', content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/resident/profile', requireAuth, requireRole('RESIDENT'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM residents WHERE user_id = $1', [req.session.user.id]);
    const r = result.rows[0];
    const age = calculateAge(r.birthdate);

    const content = `
      <div class="card">
        <h2>My Resident Profile</h2>
        <div style="display:flex; gap:2rem; align-items:flex-start;">
          ${r.photo_url ? `<img src="${r.photo_url}" style="width:150px; height:150px; object-fit:cover; border-radius:8px;">` : ''}
          <div>
            <h3>${r.first_name} ${r.middle_name || ''} ${r.last_name} ${r.suffix || ''}</h3>
            <p><strong>Resident ID:</strong> ${r.resident_id_number || 'Not Assigned'}</p>
            <p><strong>Age:</strong> ${age} | <strong>Sex:</strong> ${r.sex}</p>
            <p><strong>Civil Status:</strong> ${r.civil_status}</p>
            <p><strong>Address:</strong> ${r.address}</p>
            <p><strong>Contact:</strong> ${r.contact_number}</p>
            <p><strong>Email:</strong> ${r.email}</p>
            <p><strong>Occupation:</strong> ${r.occupation || 'N/A'}</p>
            <p><strong>Voter:</strong> ${r.voter_status ? 'Yes' : 'No'} | <strong>Senior:</strong> ${r.senior_citizen_status ? 'Yes' : 'No'} | <strong>PWD:</strong> ${r.pwd_status ? 'Yes' : 'No'}</p>
          </div>
        </div>
      </div>
    `;
    res.send(renderLayout('My Profile', 'RESIDENT', content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/resident/id', requireAuth, requireRole('RESIDENT'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM residents WHERE user_id = $1', [req.session.user.id]);
    const r = result.rows[0];
    const qrDataUrl = await QRCode.toDataURL(r.qr_token || 'INVALID');

    const content = `
      <div class="card" style="max-width:500px; margin:auto; border:2px solid #15803d; border-radius:12px; padding:1.5rem; background:#fff;">
        <div style="text-align:center; border-bottom:2px solid #15803d; padding-bottom:0.5rem; margin-bottom:1rem;">
          <h3 style="color:#15803d;">BARANGAY SAN JOSE</h3>
          <p style="font-size:0.8rem; color:#666;">OFFICIAL RESIDENT IDENTIFICATION CARD</p>
        </div>
        <div style="display:flex; gap:1rem;">
          <img src="${r.photo_url || 'https://via.placeholder.com/100'}" style="width:100px; height:100px; object-fit:cover; border-radius:6px; border:1px solid #ccc;">
          <div>
            <h4 style="margin-bottom:0.25rem;">${r.first_name} ${r.last_name}</h4>
            <p style="font-size:0.85rem;"><strong>ID:</strong> ${r.resident_id_number || 'PENDING'}</p>
            <p style="font-size:0.85rem;"><strong>Address:</strong> ${r.address}</p>
            <p style="font-size:0.85rem;"><strong>Status:</strong> Approved</p>
          </div>
        </div>
        <div style="text-align:center; margin-top:1rem;">
          <img src="${qrDataUrl}" style="width:120px; height:120px;">
          <p style="font-size:0.75rem; color:#888;">Scan to verify residency</p>
        </div>
        <button onclick="window.print()" class="btn btn-secondary" style="margin-top:1rem; width:100%;">Print ID Card</button>
      </div>
    `;
    res.send(renderLayout('Digital Resident ID', 'RESIDENT', content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/resident/qr', requireAuth, requireRole('RESIDENT'), async (req, res) => {
  try {
    const result = await pool.query('SELECT qr_token FROM residents WHERE user_id = $1', [req.session.user.id]);
    const r = result.rows[0];
    const qrDataUrl = await QRCode.toDataURL(r.qr_token || 'INVALID');

    const content = `
      <div class="card" style="text-align:center; max-width:400px; margin:auto;">
        <h2>My Secure Resident QR Code</h2>
        <p style="font-size:0.85rem; color:#666; margin-bottom:1rem;">Present this QR code for Barangay services and validation.</p>
        <img src="${qrDataUrl}" style="width:200px; height:200px;">
        <p style="margin-top:1rem; font-family:monospace; font-size:0.8rem;">Token: ${r.qr_token}</p>
      </div>
    `;
    res.send(renderLayout('My QR Code', 'RESIDENT', content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/resident/documents', requireAuth, requireRole('RESIDENT'), async (req, res) => {
  try {
    const resident = (await pool.query('SELECT id FROM residents WHERE user_id = $1', [req.session.user.id])).rows[0];
    const docTypes = await pool.query('SELECT * FROM document_types');
    const myRequests = await pool.query(
      'SELECT dr.*, dt.name as doc_name FROM document_requests dr JOIN document_types dt ON dr.document_type_id = dt.id WHERE dr.resident_id = $1 ORDER BY dr.requested_at DESC',
      [resident.id]
    );

    const content = `
      <div class="card">
        <h2>Request a Document</h2>
        <form action="/resident/documents/request" method="POST" enctype="multipart/form-data">
          <div class="form-group">
            <label>Document Type</label>
            <select name="document_type_id" required>
              ${docTypes.rows.map(d => `<option value="${d.id}">${d.name} - ₱${d.fee}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Purpose</label>
            <textarea name="purpose" required rows="3"></textarea>
          </div>
          <div class="form-group">
            <label>Upload Supporting Document / Requirements</label>
            <input type="file" name="requirement_file" accept="image/*,.pdf">
          </div>
          <button type="submit" class="btn btn-success">Submit Request</button>
        </form>
      </div>

      <div class="card">
        <h2>My Document Requests History</h2>
        <table>
          <thead>
            <tr><th>Req #</th><th>Type</th><th>Purpose</th><th>Status</th><th>Date</th><th>Action</th></tr>
          </thead>
          <tbody>
            ${myRequests.rows.map(r => `
              <tr>
                <td>${r.request_number}</td>
                <td>${r.doc_name}</td>
                <td>${r.purpose}</td>
                <td><span class="badge badge-${r.status === 'COMPLETED' ? 'success' : 'warning'}">${r.status}</span></td>
                <td>${formatDate(r.requested_at)}</td>
                <td>
                  ${r.status === 'COMPLETED' ? `<a href="/document/print/${r.id}" target="_blank" class="btn btn-secondary">Print</a>` : 'Processing'}
                </td>
              </tr>
            `).join('') || '<tr><td colspan="6">No requests found</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
    res.send(renderLayout('Document Requests', 'RESIDENT', content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/resident/documents/request', requireAuth, requireRole('RESIDENT'), upload.single('requirement_file'), async (req, res) => {
  try {
    const resident = (await pool.query('SELECT id FROM residents WHERE user_id = $1', [req.session.user.id])).rows[0];
    const { document_type_id, purpose } = req.body;
    const reqNum = 'REQ-' + Date.now().toString().slice(-6);
    const fileUrl = req.file ? '/uploads/' + req.file.filename : '';

    await pool.query(
      'INSERT INTO document_requests (request_number, resident_id, document_type_id, purpose, uploaded_file_url) VALUES ($1, $2, $3, $4, $5)',
      [reqNum, resident.id, document_type_id, purpose, fileUrl]
    );

    await logActivity(req.session.user.id, 'RESIDENT', 'REQUEST_DOCUMENT', 'DOCUMENTS', reqNum, req.ip);
    res.redirect('/resident/documents');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/resident/household', requireAuth, requireRole('RESIDENT'), async (req, res) => {
  try {
    const resident = (await pool.query('SELECT id FROM residents WHERE user_id = $1', [req.session.user.id])).rows[0];
    const memberRes = await pool.query(`
      SELECT h.*, hm.relationship 
      FROM household_members hm 
      JOIN households h ON hm.household_id = h.id 
      WHERE hm.resident_id = $1
    `, [resident.id]);

    let content = '<div class="card"><h2>My Household</h2>';

    if (memberRes.rowCount === 0) {
      content += '<p>You are currently not associated with any household.</p></div>';
    } else {
      const household = memberRes.rows[0];
      const allMembers = await pool.query(`
        SELECT r.first_name, r.last_name, hm.relationship 
        FROM household_members hm 
        JOIN residents r ON hm.resident_id = r.id 
        WHERE hm.household_id = $1
      `, [household.id]);

      content += `
        <p><strong>Household #:</strong> ${household.household_number}</p>
        <p><strong>Address:</strong> ${household.address}</p>
        <h3 style="margin-top:1rem;">Household Members:</h3>
        <table>
          <thead><tr><th>Name</th><th>Relationship</th></tr></thead>
          <tbody>
            ${allMembers.rows.map(m => `<tr><td>${m.first_name} ${m.last_name}</td><td>${m.relationship}</td></tr>`).join('')}
          </tbody>
        </table>
        </div>
      `;
    }

    res.send(renderLayout('My Household', 'RESIDENT', content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/resident/concerns', requireAuth, requireRole('RESIDENT'), async (req, res) => {
  try {
    const resident = (await pool.query('SELECT id FROM residents WHERE user_id = $1', [req.session.user.id])).rows[0];
    const concerns = await pool.query('SELECT * FROM concerns WHERE resident_id = $1 ORDER BY created_at DESC', [resident.id]);

    const content = `
      <div class="card">
        <h2>Submit a Concern / Inquiry</h2>
        <form action="/resident/concerns" method="POST">
          <div class="form-group"><label>Subject</label><input type="text" name="subject" required></div>
          <div class="form-group"><label>Description</label><textarea name="description" rows="3" required></textarea></div>
          <button type="submit" class="btn btn-success">Submit Concern</button>
        </form>
      </div>

      <div class="card">
        <h2>My Submitted Concerns</h2>
        <table>
          <thead><tr><th>Subject</th><th>Status</th><th>Response</th><th>Date</th></tr></thead>
          <tbody>
            ${concerns.rows.map(c => `
              <tr>
                <td>${c.subject}</td>
                <td><span class="badge badge-warning">${c.status}</span></td>
                <td>${c.response || 'Pending Response'}</td>
                <td>${formatDate(c.created_at)}</td>
              </tr>
            `).join('') || '<tr><td colspan="4">No concerns submitted</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
    res.send(renderLayout('Concerns & Inquiries', 'RESIDENT', content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/resident/concerns', requireAuth, requireRole('RESIDENT'), async (req, res) => {
  try {
    const resident = (await pool.query('SELECT id FROM residents WHERE user_id = $1', [req.session.user.id])).rows[0];
    const { subject, description } = req.body;
    await pool.query('INSERT INTO concerns (resident_id, subject, description) VALUES ($1, $2, $3)', [resident.id, subject, description]);
    res.redirect('/resident/concerns');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/resident/announcements', requireAuth, requireRole('RESIDENT'), async (req, res) => {
  try {
    const list = await pool.query('SELECT * FROM announcements WHERE published = true ORDER BY created_at DESC');
    const content = `
      <div class="card">
        <h2>Barangay Announcements</h2>
        ${list.rows.map(a => `
          <div style="border-bottom:1px solid #eee; padding: 1rem 0;">
            <h3>${a.title}</h3>
            <p style="margin-top:0.5rem; color:#444;">${a.content}</p>
            <small style="color:#888;">Published on: ${formatDate(a.created_at)}</small>
          </div>
        `).join('') || '<p>No active announcements.</p>'}
      </div>
    `;
    res.send(renderLayout('Announcements', 'RESIDENT', content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/resident/notifications', requireAuth, requireRole('RESIDENT'), async (req, res) => {
  try {
    const notifs = await pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [req.session.user.id]);
    await pool.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.session.user.id]);

    const content = `
      <div class="card">
        <h2>Notifications</h2>
        ${notifs.rows.map(n => `
          <div style="border-bottom: 1px solid #eee; padding: 0.75rem 0;">
            <h4>${n.title}</h4>
            <p style="color:#555;">${n.message}</p>
            <small style="color:#888;">${formatDate(n.created_at)}</small>
          </div>
        `).join('') || '<p>No notifications.</p>'}
      </div>
    `;
    res.send(renderLayout('Notifications', 'RESIDENT', content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ----------------------------------------------------
// ADMIN & STAFF SHARED/SPECIFIC PORTAL ROUTES
// ----------------------------------------------------

// Admin Dashboard
app.get('/admin/dashboard', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM residents WHERE approval_status = 'APPROVED' AND archived = false) as total_residents,
        (SELECT COUNT(*) FROM residents WHERE approval_status = 'PENDING') as pending_residents,
        (SELECT COUNT(*) FROM households) as total_households,
        (SELECT COUNT(*) FROM document_requests WHERE status = 'PENDING') as pending_docs,
        (SELECT COUNT(*) FROM blotter_records WHERE status = 'OPEN') as open_blotters
    `);

    const s = stats.rows[0];

    const content = `
      <h2>Administrator Dashboard</h2>
      <div class="grid-stats">
        <div class="stat-card"><h3>Approved Residents</h3><p>${s.total_residents}</p></div>
        <div class="stat-card"><h3>Pending Registrations</h3><p style="color:#d97706;">${s.pending_residents}</p></div>
        <div class="stat-card"><h3>Households</h3><p>${s.total_households}</p></div>
        <div class="stat-card"><h3>Pending Requests</h3><p style="color:#d97706;">${s.pending_docs}</p></div>
        <div class="stat-card"><h3>Open Blotters</h3><p style="color:#dc2626;">${s.open_blotters}</p></div>
      </div>
    `;
    res.send(renderLayout('Admin Dashboard', 'ADMIN', content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Staff Dashboard
app.get('/staff/dashboard', requireAuth, requireRole('STAFF'), async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM residents WHERE approval_status = 'APPROVED') as total_residents,
        (SELECT COUNT(*) FROM document_requests WHERE status = 'PENDING') as pending_docs,
        (SELECT COUNT(*) FROM blotter_records WHERE status = 'OPEN') as open_blotters
    `);
    const s = stats.rows[0];

    const content = `
      <h2>Staff Workstation Dashboard</h2>
      <div class="grid-stats">
        <div class="stat-card"><h3>Total Residents</h3><p>${s.total_residents}</p></div>
        <div class="stat-card"><h3>Pending Document Requests</h3><p>${s.pending_docs}</p></div>
        <div class="stat-card"><h3>Open Blotters</h3><p>${s.open_blotters}</p></div>
      </div>
    `;
    res.send(renderLayout('Staff Dashboard', 'STAFF', content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Resident Management (Admin / Staff)
app.get(['/admin/residents', '/staff/residents'], requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const portal = req.session.user.role;
    const search = req.query.search || '';
    
    let query = "SELECT * FROM residents WHERE archived = false";
    let params = [];

    if (search) {
      query += " AND (first_name ILIKE $1 OR last_name ILIKE $1 OR resident_id_number ILIKE $1)";
      params.push(`%${search}%`);
    }

    query += " ORDER BY created_at DESC";
    const result = await pool.query(query, params);

    const pending = await pool.query("SELECT * FROM residents WHERE approval_status = 'PENDING'");

    const content = `
      ${portal === 'ADMIN' && pending.rowCount > 0 ? `
        <div class="card" style="border-left: 5px solid #d97706;">
          <h2 style="color:#d97706;">Pending Registration Approvals (${pending.rowCount})</h2>
          <table>
            <thead><tr><th>Name</th><th>Sex</th><th>Address</th><th>Date Registered</th><th>Actions</th></tr></thead>
            <tbody>
              ${pending.rows.map(p => `
                <tr>
                  <td>${p.first_name} ${p.last_name}</td>
                  <td>${p.sex}</td>
                  <td>${p.address}</td>
                  <td>${formatDate(p.created_at)}</td>
                  <td>
                    <a href="/admin/residents/approve/${p.id}" class="btn btn-success">Approve</a>
                    <a href="/admin/residents/reject/${p.id}" class="btn btn-danger">Reject</a>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <div class="card">
        <h2>Resident Directory</h2>
        <form method="GET" style="margin-bottom:1rem; display:flex; gap:0.5rem;">
          <input type="text" name="search" placeholder="Search by name or Resident ID..." value="${search}" style="max-width:300px;">
          <button type="submit" class="btn">Search</button>
        </form>
        <table>
          <thead>
            <tr><th>ID Number</th><th>Full Name</th><th>Age</th><th>Sex</th><th>Address</th><th>Voter</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${result.rows.map(r => `
              <tr>
                <td>${r.resident_id_number || 'N/A'}</td>
                <td>${r.first_name}${r.last_name}</td>
                <td>${calculateAge(r.birthdate)}</td>
                <td>${r.sex}</td>
                <td>${r.address}</td>
                <td>${r.voter_status ? 'Yes' : 'No'}</td>
                <td>
                  <a href="/${portal.toLowerCase()}/residents/view/${r.id}" class="btn btn-secondary">View</a>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="7">No records found</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    res.send(renderLayout('Resident Management', portal, content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Resident Approval System
app.get('/admin/residents/approve/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resId = req.params.id;

    // Generate Unique Resident ID Number
    const year = new Date().getFullYear();
    const countRes = await client.query("SELECT COUNT(*) FROM residents WHERE resident_id_number IS NOT NULL");
    const num = String(parseInt(countRes.rows[0].count) + 1).padStart(6, '0');
    const residentIdNum = `BRGY-${year}-${num}`;

    const updateRes = await client.query(
      "UPDATE residents SET approval_status = 'APPROVED', resident_id_number = $1 WHERE id = $2 RETURNING user_id",
      [residentIdNum, resId]
    );

    const userId = updateRes.rows[0].user_id;
    await client.query(
      "INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)",
      [userId, 'Account Approved', `Your resident registration has been approved. Your Resident ID is ${residentIdNum}.`]
    );

    await client.query('COMMIT');
    await logActivity(req.session.user.id, 'ADMIN', 'APPROVE_RESIDENT', 'RESIDENTS', resId, req.ip);
    res.redirect('/admin/residents');
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).send(err.message);
  } finally {
    client.release();
  }
});

app.get('/admin/residents/reject/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    await pool.query("UPDATE residents SET approval_status = 'REJECTED' WHERE id = $1", [req.params.id]);
    await logActivity(req.session.user.id, 'ADMIN', 'REJECT_RESIDENT', 'RESIDENTS', req.params.id, req.ip);
    res.redirect('/admin/residents');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Household Management
app.get(['/admin/households', '/staff/households'], requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const portal = req.session.user.role;
    const households = await pool.query(`
      SELECT h.*, r.first_name, r.last_name 
      FROM households h 
      LEFT JOIN residents r ON h.head_resident_id = r.id
    `);

    const residents = await pool.query("SELECT id, first_name, last_name FROM residents WHERE approval_status = 'APPROVED'");

    const content = `
      <div class="card">
        <h2>Create Household</h2>
        <form action="/${portal.toLowerCase()}/households/create" method="POST" style="display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:1rem; align-items:end;">
          <div class="form-group"><label>Household #</label><input type="text" name="household_number" required></div>
          <div class="form-group"><label>Address</label><input type="text" name="address" required></div>
          <div class="form-group">
            <label>Household Head</label>
            <select name="head_resident_id">
              <option value="">None</option>
              ${residents.rows.map(r => `<option value="${r.id}">${r.first_name}${r.last_name}</option>`).join('')}
            </select>
          </div>
          <button type="submit" class="btn btn-success" style="height:38px; margin-bottom:1rem;">Save</button>
        </form>
      </div>

      <div class="card">
        <h2>Household Directory</h2>
        <table>
          <thead><tr><th>Household #</th><th>Address</th><th>Household Head</th><th>Created At</th></tr></thead>
          <tbody>
            ${households.rows.map(h => `
              <tr>
                <td>${h.household_number}</td>
                <td>${h.address}</td>
                <td>${h.first_name ? h.first_name + ' ' + h.last_name : 'N/A'}</td>
                <td>${formatDate(h.created_at)}</td>
              </tr>
            `).join('') || '<tr><td colspan="4">No households found</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    res.send(renderLayout('Household Management', portal, content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post(['/admin/households/create', '/staff/households/create'], requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const { household_number, address, head_resident_id } = req.body;
    await pool.query(
      'INSERT INTO households (household_number, address, head_resident_id) VALUES ($1, $2, $3)',
      [household_number, address, head_resident_id || null]
    );
    res.redirect(`/${req.session.user.role.toLowerCase()}/households`);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Document Request Processing
app.get(['/admin/document-requests', '/staff/document-requests'], requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const portal = req.session.user.role;
    const requests = await pool.query(`
      SELECT dr.*, dt.name as doc_name, r.first_name, r.last_name 
      FROM document_requests dr 
      JOIN document_types dt ON dr.document_type_id = dt.id 
      JOIN residents r ON dr.resident_id = r.id 
      ORDER BY dr.requested_at DESC
    `);

    const content = `
      <div class="card">
        <h2>Document Processing Queue</h2>
        <table>
          <thead>
            <tr><th>Req #</th><th>Resident</th><th>Document</th><th>Purpose</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${requests.rows.map(r => `
              <tr>
                <td>${r.request_number}</td>
                <td>${r.first_name}${r.last_name}</td>
                <td>${r.doc_name}</td>
                <td>${r.purpose}</td>
                <td><span class="badge badge-${r.status === 'COMPLETED' ? 'success' : 'warning'}">${r.status}</span></td>
                <td>
                  ${r.status === 'PENDING' ? `<a href="/${portal.toLowerCase()}/document-requests/approve/${r.id}" class="btn btn-success">Approve & Generate</a>` : ''}
                  ${r.status === 'COMPLETED' ? `<a href="/document/print/${r.id}" target="_blank" class="btn btn-secondary">Print Document</a>` : ''}
                </td>
              </tr>
            `).join('') || '<tr><td colspan="6">No document requests found</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    res.send(renderLayout('Document Requests', portal, content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get(['/admin/document-requests/approve/:id', '/staff/document-requests/approve/:id'], requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    await pool.query(
      "UPDATE document_requests SET status = 'COMPLETED', processed_at = CURRENT_TIMESTAMP, processor_id = $1 WHERE id = $2",
      [req.session.user.id, req.params.id]
    );
    res.redirect(`/${req.session.user.role.toLowerCase()}/document-requests`);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Document Printable View
app.get('/document/print/:id', requireAuth, async (req, res) => {
  try {
    const docRes = await pool.query(`
      SELECT dr.*, dt.name as doc_name, r.first_name, r.middle_name, r.last_name, r.address, r.civil_status 
      FROM document_requests dr 
      JOIN document_types dt ON dr.document_type_id = dt.id 
      JOIN residents r ON dr.resident_id = r.id 
      WHERE dr.id = $1
    `, [req.params.id]);

    if (docRes.rowCount === 0) return res.send('Document not found');
    const d = docRes.rows[0];

    const sys = (await pool.query('SELECT * FROM system_settings LIMIT 1')).rows[0];
    const official = (await pool.query("SELECT full_name, position FROM officials WHERE active = true LIMIT 1")).rows[0] || { full_name: 'HON. BARANGAY CAPTAIN', position: 'Barangay Captain' };

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${d.doc_name} - ${d.first_name} ${d.last_name}</title>
        <style>
          body { font-family: 'Georgia', serif; padding: 3rem; background: #fff; }
          .cert-container { border: 10px double #1e3a8a; padding: 3rem; max-width: 800px; margin: auto; text-align: center; }
          .header h2 { font-size: 1.5rem; text-transform: uppercase; margin: 0; }
          .header h3 { font-size: 1.1rem; text-transform: uppercase; margin-bottom: 2rem; color: #555; }
          .title { font-size: 2rem; font-weight: bold; text-transform: uppercase; text-decoration: underline; margin: 2rem 0; }
          .content { text-align: justify; font-size: 1.1rem; line-height: 1.8; margin: 2rem 0; }
          .footer { margin-top: 4rem; display: flex; justify-content: space-between; align-items: flex-end; }
          .sig-box { text-align: center; }
          .sig-box p { font-weight: bold; border-top: 1px solid #000; padding-top: 0.25rem; margin-top: 2rem; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom:1rem; text-align:center;">
          <button onclick="window.print()" style="padding:0.5rem 1rem; font-size:1rem; cursor:pointer;">Print Document</button>
        </div>
        <div class="cert-container">
          <div class="header">
            <h2>Republic of the Philippines</h2>
            <h3>${sys.barangay_name}, ${sys.municipality}</h3>
          </div>
          <div class="title">${d.doc_name}</div>
          <div class="content">
            <p><strong>TO WHOM IT MAY CONCERN:</strong></p>
            <br>
            <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;This is to certify that <strong>${d.first_name} ${d.middle_name || ''} ${d.last_name}</strong>, of legal age, <strong>${d.civil_status}</strong>, is a bona fide resident of <strong>${d.address}</strong>, ${sys.barangay_name}.</p>
            <br>
            <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;This certification is issued upon the request of the above-named person for the purpose of: <strong>${d.purpose}</strong>.</p>
            <br>
            <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Issued this <strong>${new Date().getDate()}th</strong> day of <strong>${new Date().toLocaleString('default', { month: 'long' })}</strong>, <strong>${new Date().getFullYear()}</strong>.</p>
          </div>
          <div class="footer">
            <div><p>Control No: ${d.request_number}</p></div>
            <div class="sig-box">
              <p>${official.full_name}<br><small>${official.position}</small></p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Blotter Management
app.get(['/admin/blotter', '/staff/blotter'], requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const portal = req.session.user.role;
    const blotters = await pool.query('SELECT * FROM blotter_records ORDER BY created_at DESC');

    const content = `
      <div class="card">
        <h2>File New Blotter Incident</h2>
        <form action="/${portal.toLowerCase()}/blotter/create" method="POST">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
            <div class="form-group"><label>Complainant Name</label><input type="text" name="complainant_name" required></div>
            <div class="form-group"><label>Respondent Name</label><input type="text" name="respondent_name" required></div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:1rem;">
            <div class="form-group"><label>Incident Type</label><input type="text" name="incident_type" required></div>
            <div class="form-group"><label>Date</label><input type="date" name="incident_date" required></div>
            <div class="form-group"><label>Time</label><input type="time" name="incident_time" required></div>
          </div>
          <div class="form-group"><label>Location</label><input type="text" name="location" required></div>
          <div class="form-group"><label>Description</label><textarea name="description" rows="3" required></textarea></div>
          <button type="submit" class="btn btn-danger">Record Blotter Case</button>
        </form>
      </div>

      <div class="card">
        <h2>Blotter Records</h2>
        <table>
          <thead>
            <tr><th>Case #</th><th>Complainant</th><th>Respondent</th><th>Incident</th><th>Date</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${blotters.rows.map(b => `
              <tr>
                <td>${b.case_number}</td>
                <td>${b.complainant_name}</td>
                <td>${b.respondent_name}</td>
                <td>${b.incident_type}</td>
                <td>${formatDate(b.incident_date)}</td>
                <td><span class="badge badge-${b.status === 'OPEN' ? 'danger' : 'success'}">${b.status}</span></td>
              </tr>
            `).join('') || '<tr><td colspan="6">No blotter records</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    res.send(renderLayout('Blotter Management', portal, content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post(['/admin/blotter/create', '/staff/blotter/create'], requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const { complainant_name, respondent_name, incident_type, incident_date, incident_time, location, description } = req.body;
    const caseNum = 'BLOT-' + Date.now().toString().slice(-6);

    await pool.query(`
      INSERT INTO blotter_records (case_number, complainant_name, respondent_name, incident_type, incident_date, incident_time, location, description, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [caseNum, complainant_name, respondent_name, incident_type, incident_date, incident_time, location, description, req.session.user.id]);

    res.redirect(`/${req.session.user.role.toLowerCase()}/blotter`);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Accounts & Staff Management (Admin Only)
app.get('/admin/accounts', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const staff = await pool.query("SELECT * FROM users WHERE role = 'STAFF'");

    const content = `
      <div class="card">
        <h2>Create Staff Account</h2>
        <form action="/admin/staff/create" method="POST" style="display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:1rem; align-items:end;">
          <div class="form-group"><label>Username</label><input type="text" name="username" required></div>
          <div class="form-group"><label>Password</label><input type="password" name="password" required></div>
          <div class="form-group">
            <label>Permission Role</label>
            <select name="permission">
              <option value="ALL">All Modules</option>
              <option value="DOCUMENTS">Documents Only</option>
              <option value="BLOTTER">Blotter Only</option>
            </select>
          </div>
          <button type="submit" class="btn btn-success" style="height:38px; margin-bottom:1rem;">Add Staff</button>
        </form>
      </div>

      <div class="card">
        <h2>Staff Directory</h2>
        <table>
          <thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Permissions</th><th>Action</th></tr></thead>
          <tbody>
            ${staff.rows.map(s => `
              <tr>
                <td>${s.username}</td>
                <td>${s.role}</td>
                <td><span class="badge badge-${s.status === 'ACTIVE' ? 'success' : 'danger'}">${s.status}</span></td>
                <td>${JSON.stringify(s.permissions)}</td>
                <td>
                  <a href="/admin/staff/toggle/${s.id}" class="btn btn-secondary">${s.status === 'ACTIVE' ? 'Disable' : 'Enable'}</a>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="5">No staff accounts</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    res.send(renderLayout('Staff Accounts Management', 'ADMIN', content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/admin/staff/create', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { username, password, permission } = req.body;
    const passHash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, password_hash, role, status, permissions) VALUES ($1, $2, 'STAFF', 'ACTIVE', $3)",
      [username, passHash, JSON.stringify([permission])]
    );
    res.redirect('/admin/accounts');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/admin/staff/toggle/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    await pool.query("UPDATE users SET status = CASE WHEN status = 'ACTIVE' THEN 'DISABLED' ELSE 'ACTIVE' END WHERE id = $1", [req.params.id]);
    res.redirect('/admin/accounts');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Officials Management (Admin Only)
app.get('/admin/officials', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const list = await pool.query('SELECT * FROM officials ORDER BY id ASC');

    const content = `
      <div class="card">
        <h2>Add Barangay Official</h2>
        <form action="/admin/officials/create" method="POST" style="display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:1rem; align-items:end;">
          <div class="form-group"><label>Full Name</label><input type="text" name="full_name" required></div>
          <div class="form-group"><label>Position</label><input type="text" name="position" required></div>
          <div class="form-group"><label>Term</label><input type="text" name="term" placeholder="2023-2026"></div>
          <button type="submit" class="btn btn-success" style="height:38px; margin-bottom:1rem;">Add Official</button>
        </form>
      </div>

      <div class="card">
        <h2>Current Officials</h2>
        <table>
          <thead><tr><th>Full Name</th><th>Position</th><th>Term</th><th>Status</th></tr></thead>
          <tbody>
            ${list.rows.map(o => `
              <tr>
                <td>${o.full_name}</td>
                <td>${o.position}</td>
                <td>${o.term}</td>
                <td><span class="badge badge-success">${o.active ? 'Active' : 'Inactive'}</span></td>
              </tr>
            `).join('') || '<tr><td colspan="4">No officials configured</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    res.send(renderLayout('Officials Management', 'ADMIN', content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/admin/officials/create', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { full_name, position, term } = req.body;
    await pool.query('INSERT INTO officials (full_name, position, term) VALUES ($1, $2, $3)', [full_name, position, term]);
    res.redirect('/admin/officials');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Announcements System (Admin)
app.get('/admin/announcements', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const list = await pool.query('SELECT * FROM announcements ORDER BY created_at DESC');

    const content = `
      <div class="card">
        <h2>Post Announcement</h2>
        <form action="/admin/announcements/create" method="POST">
          <div class="form-group"><label>Title</label><input type="text" name="title" required></div>
          <div class="form-group"><label>Content</label><textarea name="content" rows="4" required></textarea></div>
          <button type="submit" class="btn btn-success">Publish Announcement</button>
        </form>
      </div>

      <div class="card">
        <h2>Previous Announcements</h2>
        <table>
          <thead><tr><th>Title</th><th>Date</th><th>Published</th></tr></thead>
          <tbody>
            ${list.rows.map(a => `
              <tr>
                <td>${a.title}</td>
                <td>${formatDate(a.created_at)}</td>
                <td>${a.published ? 'Yes' : 'No'}</td>
              </tr>
            `).join('') || '<tr><td colspan="3">No announcements</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    res.send(renderLayout('Announcements', 'ADMIN', content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/admin/announcements/create', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { title, content } = req.body;
    await pool.query('INSERT INTO announcements (title, content) VALUES ($1, $2)', [title, content]);
    res.redirect('/admin/announcements');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// QR Code Scanner Module (Admin / Staff)
app.get(['/admin/qr', '/staff/qr'], requireAuth, requireStaffOrAdmin, (req, res) => {
  const portal = req.session.user.role;
  const content = `
    <div class="card" style="max-width:500px; margin:auto; text-align:center;">
      <h2>QR Code Verification Module</h2>
      <p style="font-size:0.85rem; color:#666; margin-bottom:1rem;">Enter or scan the Resident's QR token code below:</p>
      <form action="/${portal.toLowerCase()}/qr/verify" method="POST">
        <div class="form-group">
          <input type="text" name="qr_token" placeholder="QR Token string..." required style="font-size:1.1rem; text-align:center;">
        </div>
        <button type="submit" class="btn btn-success" style="width:100%;">Verify Token</button>
      </form>
    </div>
  `;
  res.send(renderLayout('QR Scanner Verification', portal, content, req.session.user));
});

app.post(['/admin/qr/verify', '/staff/qr/verify'], requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const portal = req.session.user.role;
    const { qr_token } = req.body;
    const result = await pool.query('SELECT * FROM residents WHERE qr_token = $1', [qr_token]);

    let content = '';
    if (result.rowCount === 0) {
      content = `
        <div class="card" style="border-left: 5px solid #dc2626;">
          <h2 style="color:#dc2626;">INVALID QR CODE</h2>
          <p>No resident matching token: <code>${qr_token}</code></p>
          <a href="/${portal.toLowerCase()}/qr" class="btn" style="margin-top:1rem;">Scan Another</a>
        </div>
      `;
    } else {
      const r = result.rows[0];
      content = `
        <div class="card" style="border-left: 5px solid #16a34a;">
          <h2 style="color:#16a34a;">VALID RESIDENT RECORD</h2>
          <div style="display:flex; gap:1.5rem; margin-top:1rem;">
            ${r.photo_url ? `<img src="${r.photo_url}" style="width:120px; height:120px; object-fit:cover; border-radius:6px;">` : ''}
            <div>
              <h3>${r.first_name} ${r.last_name}</h3>
              <p><strong>Resident ID:</strong> ${r.resident_id_number || 'N/A'}</p>
              <p><strong>Address:</strong> ${r.address}</p>
              <p><strong>Status:</strong> <span class="badge badge-success">${r.approval_status}</span></p>
            </div>
          </div>
          <a href="/${portal.toLowerCase()}/qr" class="btn" style="margin-top:1rem;">Scan Another</a>
        </div>
      `;
    }

    res.send(renderLayout('QR Code Result', portal, content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Reports Module with CSV Export
app.get(['/admin/reports', '/staff/reports'], requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const portal = req.session.user.role;
    const content = `
      <div class="card">
        <h2>Demographics & Activity Reports</h2>
        <p style="margin-bottom:1rem;">Export persistent database records directly as CSV.</p>
        <div style="display:flex; gap:1rem;">
          <a href="/${portal.toLowerCase()}/reports/export/residents" class="btn">Export Resident List (CSV)</a>
          <a href="/${portal.toLowerCase()}/reports/export/documents" class="btn btn-secondary">Export Document Log (CSV)</a>
        </div>
      </div>
    `;
    res.send(renderLayout('System Reports', portal, content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get(['/admin/reports/export/residents', '/staff/reports/export/residents'], requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT resident_id_number, first_name, last_name, sex, civil_status, address FROM residents WHERE approval_status = \'APPROVED\'');
    let csv = 'ID Number,First Name,Last Name,Sex,Civil Status,Address\n';
    result.rows.forEach(r => {
      csv += `"${r.resident_id_number}","${r.first_name}","${r.last_name}","${r.sex}","${r.civil_status}","${r.address}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="residents-report.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// System Activity Logs (Admin Only)
app.get('/admin/logs', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const logs = await pool.query('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 50');

    const content = `
      <div class="card">
        <h2>Audit & Activity Logs</h2>
        <table>
          <thead><tr><th>User ID</th><th>Role</th><th>Action</th><th>Module</th><th>Date/Time</th></tr></thead>
          <tbody>
            ${logs.rows.map(l => `
              <tr>
                <td>${l.user_id || 'System'}</td>
                <td>${l.role}</td>
                <td>${l.action}</td>
                <td>${l.module_name}</td>
                <td>${formatDate(l.created_at)}</td>
              </tr>
            `).join('') || '<tr><td colspan="5">No logs found</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
    res.send(renderLayout('Activity Logs', 'ADMIN', content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// System Settings (Admin Only)
app.get('/admin/settings', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const sys = (await pool.query('SELECT * FROM system_settings LIMIT 1')).rows[0];

    const content = `
      <div class="card">
        <h2>System Settings Configuration</h2>
        <form action="/admin/settings" method="POST">
          <div class="form-group"><label>Barangay Name</label><input type="text" name="barangay_name" value="${sys.barangay_name}"></div>
          <div class="form-group"><label>Municipality/City</label><input type="text" name="municipality" value="${sys.municipality}"></div>
          <div class="form-group"><label>Province</label><input type="text" name="province" value="${sys.province}"></div>
          <div class="form-group"><label>Contact Number</label><input type="text" name="contact_number" value="${sys.contact_number}"></div>
          <div class="form-group"><label>Email Address</label><input type="email" name="email" value="${sys.email}"></div>
          <button type="submit" class="btn btn-success">Update Settings</button>
        </form>
      </div>
    `;
    res.send(renderLayout('Settings', 'ADMIN', content, req.session.user));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/admin/settings', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { barangay_name, municipality, province, contact_number, email } = req.body;
    await pool.query(`
      UPDATE system_settings 
      SET barangay_name = $1, municipality = $2, province = $3, contact_number = $4, email = $5 
      WHERE id = (SELECT id FROM system_settings LIMIT 1)
    `, [barangay_name, municipality, province, contact_number, email]);
    res.redirect('/admin/settings');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Start Application Server
async function startServer() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
