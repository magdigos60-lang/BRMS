/**
 * BARANGAY RESIDENT MANAGEMENT SYSTEM (BRMS)
 * Node.js + Express.js + PostgreSQL (Single File Production App)
 */

const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------------------------------------------------------
// DATABASE CONFIGURATION & CONNECTION POOL
// -----------------------------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// -----------------------------------------------------------------------------
// STORAGE CONFIGURATION (Local Uploads with Abstract Readiness)
// -----------------------------------------------------------------------------
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images (jpg, jpeg, png) and PDF documents are allowed!'));
  }
});

// -----------------------------------------------------------------------------
// EXPRESS MIDDLEWARE
// -----------------------------------------------------------------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'brgy-super-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 }
}));

// -----------------------------------------------------------------------------
// DATABASE INITIALIZATION & MIGRATIONS (Safe: CREATE TABLE IF NOT EXISTS)
// -----------------------------------------------------------------------------
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        barangay_name VARCHAR(255) DEFAULT 'Barangay San Jose',
        barangay_address VARCHAR(255) DEFAULT 'Main St, City, Province',
        contact_number VARCHAR(50) DEFAULT '123-4567',
        email VARCHAR(100) DEFAULT 'contact@sanjose.gov.ph',
        system_name VARCHAR(255) DEFAULT 'Barangay Resident Management System',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'staff', 'resident')),
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived', 'pending')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS residents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        resident_id VARCHAR(50) UNIQUE NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        middle_name VARCHAR(100),
        last_name VARCHAR(100) NOT NULL,
        suffix VARCHAR(20),
        birthdate DATE NOT NULL,
        sex VARCHAR(20) NOT NULL,
        civil_status VARCHAR(50) NOT NULL,
        complete_address TEXT NOT NULL,
        contact_number VARCHAR(50) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        occupation VARCHAR(100),
        educational_attainment VARCHAR(100),
        nationality VARCHAR(50) DEFAULT 'Filipino',
        voter_status BOOLEAN DEFAULT false,
        pwd_status BOOLEAN DEFAULT false,
        senior_citizen_status BOOLEAN DEFAULT false,
        four_ps_status BOOLEAN DEFAULT false,
        emergency_contact_name VARCHAR(150),
        emergency_contact_number VARCHAR(50),
        valid_id_path TEXT,
        resident_photo_path TEXT,
        qr_token VARCHAR(255) UNIQUE,
        account_status VARCHAR(50) DEFAULT 'pending' CHECK (account_status IN ('pending', 'approved', 'rejected', 'archived')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS households (
        id SERIAL PRIMARY KEY,
        household_number VARCHAR(50) UNIQUE NOT NULL,
        household_head_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
        address TEXT NOT NULL,
        classification VARCHAR(50) DEFAULT 'Private',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS household_members (
        id SERIAL PRIMARY KEY,
        household_id INTEGER REFERENCES households(id) ON DELETE CASCADE,
        resident_id INTEGER REFERENCES residents(id) ON DELETE CASCADE,
        relationship VARCHAR(50) NOT NULL,
        household_position VARCHAR(50) DEFAULT 'Member',
        UNIQUE(household_id, resident_id)
      );

      CREATE TABLE IF NOT EXISTS officials (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(150) NOT NULL,
        position VARCHAR(100) NOT NULL,
        photo_path TEXT,
        contact VARCHAR(50),
        term_start DATE,
        term_end DATE,
        signature_path TEXT,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        title VARCHAR(150) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        requirements TEXT,
        fee DECIMAL(10,2) DEFAULT 0.00,
        status VARCHAR(20) DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS document_requirements_config (
        id SERIAL PRIMARY KEY,
        document_type_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
        requirement_name VARCHAR(150) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS document_requests (
        id SERIAL PRIMARY KEY,
        request_id VARCHAR(50) UNIQUE NOT NULL,
        resident_id INTEGER REFERENCES residents(id) ON DELETE CASCADE,
        document_type_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL,
        requirements_path TEXT,
        status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Under Review', 'Approved', 'Rejected', 'Ready', 'Completed', 'Cancelled')),
        remarks TEXT,
        processing_staff_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        document_number VARCHAR(100) UNIQUE,
        date_requested TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approval_date TIMESTAMP,
        completion_date TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS blotter_records (
        id SERIAL PRIMARY KEY,
        case_number VARCHAR(50) UNIQUE NOT NULL,
        complainant VARCHAR(150) NOT NULL,
        respondent VARCHAR(150) NOT NULL,
        incident_type VARCHAR(100) NOT NULL,
        incident_date DATE NOT NULL,
        incident_time TIME NOT NULL,
        location TEXT NOT NULL,
        description TEXT NOT NULL,
        witnesses TEXT,
        action_taken TEXT,
        resolution TEXT,
        status VARCHAR(50) DEFAULT 'Open' CHECK (status IN ('Open', 'Under Investigation', 'Resolved', 'Closed')),
        attachment_path TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        image_path TEXT,
        publish_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expiration_date TIMESTAMP,
        status VARCHAR(20) DEFAULT 'Published',
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'general',
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS concerns (
        id SERIAL PRIMARY KEY,
        resident_id INTEGER REFERENCES residents(id) ON DELETE CASCADE,
        subject VARCHAR(150) NOT NULL,
        description TEXT NOT NULL,
        attachment_path TEXT,
        status VARCHAR(50) DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Under Review', 'Processing', 'Resolved', 'Closed')),
        response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS staff_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        module_name VARCHAR(100) NOT NULL,
        can_access BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        role VARCHAR(50),
        action TEXT NOT NULL,
        module VARCHAR(100),
        record_id INTEGER,
        ip_address VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Default System Settings Check
    const settingsCheck = await client.query('SELECT * FROM system_settings WHERE id = 1');
    if (settingsCheck.rows.length === 0) {
      await client.query(`INSERT INTO system_settings (id, barangay_name, barangay_address) VALUES (1, 'Barangay San Jose', 'Main St, City, Province')`);
    }

    // Default Admin User Check
    const adminCheck = await client.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
    if (adminCheck.rows.length === 0) {
      const defaultPass = await bcrypt.hash('admin123', 10);
      await client.query(`
        INSERT INTO users (username, password_hash, role, status) 
        VALUES ('admin', $1, 'admin', 'active')
      `, [defaultPass]);
    }

    // Seed default document types if empty
    const docCheck = await client.query("SELECT * FROM documents LIMIT 1");
    if (docCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO documents (title, code, description, fee) VALUES 
        ('Barangay Clearance', 'BC', 'General clearance for employment or local purposes.', 50.00),
        ('Certificate of Residency', 'CR', 'Certifies residency status within the barangay.', 30.00),
        ('Certificate of Indigency', 'CI', 'Certifies indigency status for medical or financial aid.', 0.00),
        ('Certificate of Good Moral Character', 'CGMC', 'Certifies good standing in the community.', 40.00),
        ('Business Clearance', 'BSC', 'Clearance for local business establishment.', 150.00);
      `);
    }

    await client.query('COMMIT');
    console.log('Database successfully initialized.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Database initialization error:', err);
  } finally {
    client.release();
  }
}

// -----------------------------------------------------------------------------
// AUTHORIZATION & SECURITY MIDDLEWARES
// -----------------------------------------------------------------------------
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  const urlPath = req.originalUrl;
  if (urlPath.startsWith('/admin')) return res.redirect('/admin-login');
  if (urlPath.startsWith('/staff')) return res.redirect('/staff-login');
  return res.redirect('/resident-login');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  res.status(403).send(renderErrorPage('Access Denied', 'Administrative privileges required.'));
}

function requireStaff(req, res, next) {
  if (req.session && (req.session.role === 'staff' || req.session.role === 'admin')) {
    return next();
  }
  res.status(403).send(renderErrorPage('Access Denied', 'Staff authorization required.'));
}

function requireResident(req, res, next) {
  if (req.session && req.session.role === 'resident') {
    return next();
  }
  res.redirect('/resident-login');
}

// Helper: Log system activity
async function logActivity(userId, role, action, module, recordId, ip) {
  try {
    await pool.query(`
      INSERT INTO activity_logs (user_id, role, action, module, record_id, ip_address) 
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [userId, role, action, module, recordId, ip]);
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

// Helper: Calculate age from birthdate
function calculateAge(birthdate) {
  if (!birthdate) return 0;
  const diff = Date.now() - new Date(birthdate).getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

// -----------------------------------------------------------------------------
// CORE HTML LAYOUT & COMPONENTS GENERATOR
// -----------------------------------------------------------------------------
function renderLayout(title, content, portalType = 'public', user = null) {
  let navLinks = '';
  if (portalType === 'admin') {
    navLinks = `
      <a href="/admin/dashboard">Dashboard</a>
      <a href="/admin/residents">Residents</a>
      <a href="/admin/accounts">Accounts</a>
      <a href="/admin/households">Households</a>
      <a href="/admin/staff">Staff & Roles</a>
      <a href="/admin/officials">Officials</a>
      <a href="/admin/documents">Document Types</a>
      <a href="/admin/document-requests">Requests</a>
      <a href="/admin/blotter">Blotter</a>
      <a href="/admin/announcements">Announcements</a>
      <a href="/admin/notifications">Notifications</a>
      <a href="/admin/qr">QR Scanner</a>
      <a href="/admin/reports">Reports</a>
      <a href="/admin/logs">Activity Logs</a>
      <a href="/admin/backup">Backup Info</a>
      <a href="/admin/settings">Settings</a>
      <a href="/logout" class="logout-btn">Logout</a>
    `;
  } else if (portalType === 'staff') {
    navLinks = `
      <a href="/staff/dashboard">Dashboard</a>
      <a href="/staff/residents">Residents</a>
      <a href="/staff/households">Households</a>
      <a href="/staff/documents">Documents</a>
      <a href="/staff/document-requests">Requests</a>
      <a href="/staff/blotter">Blotter</a>
      <a href="/staff/qr">QR Scanner</a>
      <a href="/staff/reports">Reports</a>
      <a href="/staff/notifications">Notifications</a>
      <a href="/staff/settings">Settings</a>
      <a href="/logout" class="logout-btn">Logout</a>
    `;
  } else if (portalType === 'resident') {
    navLinks = `
      <a href="/resident/dashboard">Dashboard</a>
      <a href="/resident/profile">My Profile</a>
      <a href="/resident/household">My Household</a>
      <a href="/resident/id">Resident ID</a>
      <a href="/resident/qr">QR Code</a>
      <a href="/resident/documents/request">Request Doc</a>
      <a href="/resident/requests">My Requests</a>
      <a href="/resident/documents">My Documents</a>
      <a href="/resident/notifications">Notifications</a>
      <a href="/resident/announcements">Announcements</a>
      <a href="/resident/concerns">Concerns</a>
      <a href="/resident/settings">Settings</a>
      <a href="/logout" class="logout-btn">Logout</a>
    `;
  } else {
    navLinks = `
      <a href="/">Home</a>
      <a href="/resident-login">Resident Login</a>
      <a href="/resident-register">Register</a>
      <a href="/admin-login">Admin Login</a>
      <a href="/staff-login">Staff Login</a>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | Barangay System</title>
  <style>
    :root {
      --primary: #1e3a8a;
      --primary-dark: #172554;
      --accent: #2563eb;
      --bg-color: #f8fafc;
      --card-bg: #ffffff;
      --text-main: #334155;
      --border-color: #cbd5e1;
      --success: #16a34a;
      --danger: #dc2626;
      --warning: #d97706;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
    body { background-color: var(--bg-color); color: var(--text-main); display: flex; flex-direction: column; min-height: 100vh; }
    header { background-color: var(--primary); color: white; padding: 1rem; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    header h1 { font-size: 1.25rem; }
    .container { display: flex; flex: 1; width: 100%; max-width: 1400px; margin: 0 auto; }
    sidebar, .sidebar { width: 260px; background: var(--card-bg); border-right: 1px solid var(--border-color); padding: 1.5rem 1rem; display: flex; flex-direction: column; gap: 0.5rem; overflow-y: auto; }
    .sidebar a { padding: 0.75rem 1rem; color: var(--text-main); text-decoration: none; border-radius: 6px; font-weight: 500; transition: background 0.2s; }
    .sidebar a:hover, .sidebar a.active { background: var(--primary); color: white; }
    .sidebar a.logout-btn { color: var(--danger); margin-top: auto; }
    .sidebar a.logout-btn:hover { background: var(--danger); color: white; }
    main { flex: 1; padding: 2rem; overflow-y: auto; }
    .card { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    h2, h3 { margin-bottom: 1rem; color: var(--primary-dark); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; margin-bottom: 1.5rem; }
    .stat-card { background: white; padding: 1.5rem; border-radius: 8px; border-left: 5px solid var(--primary); box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .stat-card h4 { font-size: 0.9rem; color: #64748b; margin-bottom: 0.5rem; }
    .stat-card .value { font-size: 1.8rem; font-weight: bold; color: var(--primary-dark); }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; background: white; border-radius: 8px; overflow: hidden; }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 0.95rem; }
    th { background: #f1f5f9; color: var(--primary-dark); font-weight: 600; }
    form { display: flex; flex-direction: column; gap: 1rem; }
    .form-group { display: flex; flex-direction: column; gap: 0.3rem; }
    label { font-weight: 500; font-size: 0.9rem; }
    input, select, textarea { padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; font-size: 1rem; width: 100%; }
    button, .btn { background: var(--primary); color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; text-align: center; }
    button:hover, .btn:hover { background: var(--primary-dark); }
    .btn-danger { background: var(--danger); }
    .btn-danger:hover { background: #b91c1c; }
    .btn-success { background: var(--success); }
    .btn-success:hover { background: #15803d; }
    .badge { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; text-transform: uppercase; }
    .badge-success { background: #dcfce7; color: var(--success); }
    .badge-danger { background: #fee2e2; color: var(--danger); }
    .badge-warning { background: #fef3c7; color: var(--warning); }
    @media (max-width: 768px) {
      .container { flex-direction: column; }
      sidebar, .sidebar { width: 100%; height: auto; flex-direction: row; flex-wrap: wrap; gap: 0.25rem; padding: 0.5rem; }
      .sidebar a { padding: 0.5rem; font-size: 0.85rem; }
      main { padding: 1rem; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Barangay Resident Management System</h1>
    <div>${user ? `<span>User: <strong>${user.username}</strong> (${user.role})</span>` : ''}</div>
  </header>
  <div class="container">
    ${portalType !== 'public' ? `<div class="sidebar">${navLinks}</div>` : ''}
    <main>
      ${content}
    </main>
  </div>
</body>
</html>`;
}

function renderErrorPage(title, message) {
  return renderLayout(title, `
    <div class="card" style="text-align: center; padding: 3rem;">
      <h2 style="color: var(--danger);">${title}</h2>
      <p style="margin: 1rem 0; font-size: 1.1rem;">${message}</p>
      <a href="/" class="btn">Return Home</a>
    </div>
  `);
}

// -----------------------------------------------------------------------------
// PUBLIC & AUTHENTICATION ROUTES
// -----------------------------------------------------------------------------
app.get('/', async (req, res) => {
  try {
    const settings = (await pool.query('SELECT * FROM system_settings WHERE id = 1')).rows[0];
    res.send(renderLayout('Welcome', `
      <div class="card" style="text-align: center; padding: 3rem;">
        <h2 style="font-size: 2rem; color: var(--primary);">${settings.barangay_name}</h2>
        <p style="margin: 1rem 0; font-size: 1.1rem;">${settings.system_name}</p>
        <p style="color: #64748b; margin-bottom: 2rem;">${settings.barangay_address}</p>
        <div style="display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap;">
          <a href="/resident-login" class="btn">Resident Portal</a>
          <a href="/resident-register" class="btn btn-success">Register as Resident</a>
          <a href="/staff-login" class="btn" style="background: #0f766e;">Staff Portal</a>
          <a href="/admin-login" class="btn" style="background: #334155;">Admin Portal</a>
        </div>
      </div>
    `));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', 'Internal server error.'));
  }
});

// Resident Login
app.get('/resident-login', (req, res) => {
  res.send(renderLayout('Resident Login', `
    <div style="max-width: 400px; margin: 2rem auto;" class="card">
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
        <button type="submit">Login to Portal</button>
      </form>
      <p style="margin-top: 1rem; text-align: center; font-size: 0.9rem;">
        Don't have an account? <a href="/resident-register">Register here</a>
      </p>
    </div>
  `));
});

app.post('/resident-login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userRes = await pool.query("SELECT * FROM users WHERE (username = $1 OR id IN (SELECT user_id FROM residents WHERE email = $1)) AND role = 'resident'", [username]);
    if (userRes.rows.length === 0) return res.send(renderErrorPage('Login Failed', 'Invalid credentials or account not found.'));
    const user = userRes.rows[0];
    
    if (user.status !== 'active') {
      return res.send(renderErrorPage('Account Inactive', 'Your account is pending approval or inactive.'));
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.send(renderErrorPage('Login Failed', 'Invalid password.'));

    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.username = user.username;

    const resRec = await pool.query("SELECT id, resident_id FROM residents WHERE user_id = $1", [user.id]);
    if (resRec.rows.length > 0) {
      req.session.residentId = resRec.rows[0].id;
      req.session.residentCode = resRec.rows[0].resident_id;
    }

    await logActivity(user.id, 'resident', 'Resident logged into portal', 'auth', user.id, req.ip);
    res.redirect('/resident/dashboard');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

// Resident Registration
app.get('/resident-register', (req, res) => {
  res.send(renderLayout('Resident Registration', `
    <div style="max-width: 700px; margin: 2rem auto;" class="card">
      <h2>Resident Registration Form</h2>
      <form action="/resident-register" method="POST" enctype="multipart/form-data">
        <div class="grid">
          <div class="form-group"><label>First Name</label><input type="text" name="first_name" required></div>
          <div class="form-group"><label>Middle Name</label><input type="text" name="middle_name"></div>
          <div class="form-group"><label>Last Name</label><input type="text" name="last_name" required></div>
          <div class="form-group"><label>Suffix</label><input type="text" name="suffix" placeholder="Jr, III, etc."></div>
        </div>
        <div class="grid">
          <div class="form-group"><label>Birthdate</label><input type="date" name="birthdate" required></div>
          <div class="form-group"><label>Sex</label><select name="sex" required><option>Male</option><option>Female</option></select></div>
          <div class="form-group"><label>Civil Status</label><select name="civil_status" required><option>Single</option><option>Married</option><option>Widowed</option><option>Separated</option></select></div>
          <div class="form-group"><label>Nationality</label><input type="text" name="nationality" value="Filipino" required></div>
        </div>
        <div class="form-group"><label>Complete Address</label><textarea name="complete_address" required rows="2"></textarea></div>
        <div class="grid">
          <div class="form-group"><label>Contact Number</label><input type="text" name="contact_number" required></div>
          <div class="form-group"><label>Email Address</label><input type="email" name="email" required></div>
          <div class="form-group"><label>Occupation</label><input type="text" name="occupation"></div>
          <div class="form-group"><label>Educational Attainment</label><input type="text" name="educational_attainment"></div>
        </div>
        <div class="grid">
          <div class="form-group"><label>Voter Status</label><select name="voter_status"><option value="false">Non-Voter</option><option value="true">Registered Voter</option></select></div>
          <div class="form-group"><label>PWD Status</label><select name="pwd_status"><option value="false">No</option><option value="true">Yes</option></select></div>
          <div class="form-group"><label>Senior Citizen Status</label><select name="senior_citizen_status"><option value="false">No</option><option value="true">Yes</option></select></div>
          <div class="form-group"><label>4Ps Beneficiary</label><select name="four_ps_status"><option value="false">No</option><option value="true">Yes</option></select></div>
        </div>
        <div class="grid">
          <div class="form-group"><label>Emergency Contact Name</label><input type="text" name="emergency_contact_name" required></div>
          <div class="form-group"><label>Emergency Contact Number</label><input type="text" name="emergency_contact_number" required></div>
        </div>
        <div class="grid">
          <div class="form-group"><label>Valid ID File (Image/PDF)</label><input type="file" name="valid_id" required></div>
          <div class="form-group"><label>Resident Photo</label><input type="file" name="resident_photo" required></div>
        </div>
        <div class="grid">
          <div class="form-group"><label>Username</label><input type="text" name="username" required></div>
          <div class="form-group"><label>Password</label><input type="password" name="password" required></div>
        </div>
        <button type="submit" class="btn-success">Submit Registration</button>
      </form>
    </div>
  `));
});

const cpUpload = upload.fields([{ name: 'valid_id', maxCount: 1 }, { name: 'resident_photo', maxCount: 1 }]);
app.post('/resident-register', cpUpload, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      first_name, middle_name, last_name, suffix, birthdate, sex, civil_status,
      complete_address, contact_number, email, occupation, educational_attainment,
      nationality, voter_status, pwd_status, senior_citizen_status, four_ps_status,
      emergency_contact_name, emergency_contact_number, username, password
    } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);
    const userResult = await client.query(`
      INSERT INTO users (username, password_hash, role, status) 
      VALUES ($1, $2, 'resident', 'pending') RETURNING id
    `, [username, hashedPassword]);
    const userId = userResult.rows[0].id;

    // Generate unique Resident ID
    const year = new Date().getFullYear();
    const countRes = await client.query("SELECT COUNT(*) FROM residents");
    const seq = parseInt(countRes.rows[0].count) + 1;
    const residentId = `BRGY-${year}-${String(seq).padStart(6, '0')}`;
    const qrToken = 'QR-' + Math.random().toString(36).substring(2) + Date.now().toString(36);

    const validIdPath = req.files['valid_id'] ? req.files['valid_id'][0].filename : null;
    const photoPath = req.files['resident_photo'] ? req.files['resident_photo'][0].filename : null;

    await client.query(`
      INSERT INTO residents (
        user_id, resident_id, first_name, middle_name, last_name, suffix, birthdate, sex,
        civil_status, complete_address, contact_number, email, occupation, educational_attainment,
        nationality, voter_status, pwd_status, senior_citizen_status, four_ps_status,
        emergency_contact_name, emergency_contact_number, valid_id_path, resident_photo_path,
        qr_token, account_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, 'pending')
    `, [
      userId, residentId, first_name, middle_name, last_name, suffix, birthdate, sex,
      civil_status, complete_address, contact_number, email, occupation, educational_attainment,
      nationality, voter_status === 'true', pwd_status === 'true', senior_citizen_status === 'true', four_ps_status === 'true',
      emergency_contact_name, emergency_contact_number, validIdPath, photoPath, qrToken
    ]);

    await client.query('COMMIT');
    res.send(renderLayout('Registration Submitted', `
      <div class="card" style="text-align: center; padding: 3rem;">
        <h2>Registration Successful!</h2>
        <p style="margin: 1rem 0;">Your registration has been submitted and is currently <strong>Pending Approval</strong> by barangay administrators.</p>
        <a href="/" class="btn">Return Home</a>
      </div>
    `));
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).send(renderErrorPage('Registration Error', err.message));
  } finally {
    client.release();
  }
});

// Staff Login
app.get('/staff-login', (req, res) => {
  res.send(renderLayout('Staff Login', `
    <div style="max-width: 400px; margin: 2rem auto;" class="card">
      <h2>Staff Portal Login</h2>
      <form action="/staff-login" method="POST">
        <div class="form-group"><label>Username</label><input type="text" name="username" required></div>
        <div class="form-group"><label>Password</label><input type="password" name="password" required></div>
        <button type="submit" style="background: #0f766e;">Login to Staff Portal</button>
      </form>
    </div>
  `));
});

app.post('/staff-login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userRes = await pool.query("SELECT * FROM users WHERE username = $1 AND role = 'staff'", [username]);
    if (userRes.rows.length === 0) return res.send(renderErrorPage('Login Failed', 'Invalid staff credentials.'));
    const user = userRes.rows[0];
    if (user.status !== 'active') return res.send(renderErrorPage('Account Inactive', 'Staff account is disabled.'));

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.send(renderErrorPage('Login Failed', 'Invalid password.'));

    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.username = user.username;

    await logActivity(user.id, 'staff', 'Staff logged into portal', 'auth', user.id, req.ip);
    res.redirect('/staff/dashboard');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

// Admin Login
app.get('/admin-login', (req, res) => {
  res.send(renderLayout('Admin Login', `
    <div style="max-width: 400px; margin: 2rem auto;" class="card">
      <h2>Admin Portal Login</h2>
      <form action="/admin-login" method="POST">
        <div class="form-group"><label>Username</label><input type="text" name="username" required></div>
        <div class="form-group"><label>Password</label><input type="password" name="password" required></div>
        <button type="submit" style="background: #334155;">Login to Admin Portal</button>
      </form>
    </div>
  `));
});

app.post('/admin-login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userRes = await pool.query("SELECT * FROM users WHERE username = $1 AND role = 'admin'", [username]);
    if (userRes.rows.length === 0) return res.send(renderErrorPage('Login Failed', 'Invalid administrator credentials.'));
    const user = userRes.rows[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.send(renderErrorPage('Login Failed', 'Invalid password.'));

    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.username = user.username;

    await logActivity(user.id, 'admin', 'Admin logged into portal', 'auth', user.id, req.ip);
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// -----------------------------------------------------------------------------
// RESIDENT PORTAL ROUTES
// -----------------------------------------------------------------------------
app.get('/resident/dashboard', requireAuth, requireResident, async (req, res) => {
  try {
    const residentId = req.session.residentId;
    const residentRes = await pool.query("SELECT * FROM residents WHERE id = $1", [residentId]);
    const resident = residentRes.rows[0];

    const pendingReq = await pool.query("SELECT COUNT(*) FROM document_requests WHERE resident_id = $1 AND status != 'Completed'", [residentId]);
    const completedReq = await pool.query("SELECT COUNT(*) FROM document_requests WHERE resident_id = $1 AND status = 'Completed'", [residentId]);
    const unreadNotif = await pool.query("SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false", [req.session.userId]);
    const announcements = await pool.query("SELECT * FROM announcements WHERE status = 'Published' ORDER BY publish_date DESC LIMIT 3");

    res.send(renderLayout('Resident Dashboard', `
      <div class="card">
        <h2>Welcome, ${resident.first_name} ${resident.last_name}!</h2>
        <p>Resident ID: <strong>${resident.resident_id}</strong> | Status: <span class="badge badge-success">${resident.account_status}</span></p>
      </div>
      <div class="grid">
        <div class="stat-card"><h4>Pending Requests</h4><div class="value">${pendingReq.rows[0].count}</div></div>
        <div class="stat-card"><h4>Completed Documents</h4><div class="value">${completedReq.rows[0].count}</div></div>
        <div class="stat-card"><h4>Unread Notifications</h4><div class="value">${unreadNotif.rows[0].count}</div></div>
      </div>
      <div class="card">
        <h3>Quick Actions</h3>
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          <a href="/resident/documents/request" class="btn">Request New Document</a>
          <a href="/resident/id" class="btn btn-success">View Digital ID</a>
          <a href="/resident/qr" class="btn" style="background: #0f766e;">My QR Code</a>
        </div>
      </div>
      <div class="card">
        <h3>Recent Announcements</h3>
        ${announcements.rows.map(a => `
          <div style="padding: 0.75rem 0; border-bottom: 1px solid #e2e8f0;">
            <strong>${a.title}</strong><p style="font-size: 0.9rem; color: #64748b;">${a.content}</p>
          </div>
        `).join('')}
      </div>
    `, 'resident', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/resident/profile', requireAuth, requireResident, async (req, res) => {
  try {
    const resident = (await pool.query("SELECT * FROM residents WHERE id = $1", [req.session.residentId])).rows[0];
    res.send(renderLayout('My Profile', `
      <div class="card">
        <h2>My Resident Profile</h2>
        <table style="max-width: 800px;">
          <tr><th>Full Name</th><td>${resident.first_name} ${resident.middle_name || ''} ${resident.last_name} ${resident.suffix || ''}</td></tr>
          <tr><th>Resident ID</th><td>${resident.resident_id}</td></tr>
          <tr><th>Birthdate</th><td>${resident.birthdate.toISOString().split('T')[0]} (Age: ${calculateAge(resident.birthdate)})</td></tr>
          <tr><th>Sex / Civil Status</th><td>${resident.sex} / ${resident.civil_status}</td></tr>
          <tr><th>Address</th><td>${resident.complete_address}</td></tr>
          <tr><th>Contact Number</th><td>${resident.contact_number}</td></tr>
          <tr><th>Email</th><td>${resident.email}</td></tr>
          <tr><th>Occupation</th><td>${resident.occupation || 'N/A'}</td></tr>
          <tr><th>Emergency Contact</th><td>${resident.emergency_contact_name} (${resident.emergency_contact_number})</td></tr>
        </table>
      </div>
    `, 'resident', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/resident/id', requireAuth, requireResident, async (req, res) => {
  try {
    const resident = (await pool.query("SELECT * FROM residents WHERE id = $1", [req.session.residentId])).rows[0];
    const settings = (await pool.query("SELECT * FROM system_settings WHERE id = 1")).rows[0];
    res.send(renderLayout('Digital Resident ID', `
      <div class="card" style="max-width: 450px; margin: auto; border: 2px solid var(--primary); text-align: center; padding: 2rem;">
        <h3 style="color: var(--primary);">${settings.barangay_name}</h3>
        <p style="font-size: 0.8rem; color: #64748b;">OFFICIAL DIGITAL RESIDENT ID</p>
        <div style="margin: 1.5rem 0;">
          <img src="/uploads/${resident.resident_photo_path || 'default.png'}" alt="Photo" style="width: 120px; height: 120px; object-fit: cover; border-radius: 50%; border: 3px solid var(--primary);">
        </div>
        <h2>${resident.first_name} ${resident.last_name}</h2>
        <p style="font-weight: bold; color: var(--accent); margin-bottom: 1rem;">${resident.resident_id}</p>
        <p style="font-size: 0.9rem;">${resident.complete_address}</p>
        <div style="margin-top: 1.5rem; font-size: 0.8rem; border-top: 1px dashed #cbd5e1; pt: 1rem;">
          Emergency: ${resident.emergency_contact_name} (${resident.emergency_contact_number})
        </div>
      </div>
      <div style="text-align: center; margin-top: 1rem;">
        <button onclick="window.print()" class="btn">Print / Save ID Card</button>
      </div>
    `, 'resident', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/resident/qr', requireAuth, requireResident, async (req, res) => {
  try {
    const resident = (await pool.query("SELECT * FROM residents WHERE id = $1", [req.session.residentId])).rows[0];
    res.send(renderLayout('My QR Code', `
      <div class="card" style="max-width: 400px; margin: auto; text-align: center;">
        <h2>Resident QR Verification Code</h2>
        <p style="color: #64748b; margin-bottom: 1.5rem;">Present this secure QR code for official barangay transactions.</p>
        <div style="background: #f1f5f9; padding: 2rem; border-radius: 8px; display: inline-block;">
          <h3 style="font-family: monospace; font-size: 1.2rem; color: var(--primary);">${resident.qr_token}</h3>
        </div>
        <p style="margin-top: 1.5rem; font-size: 0.85rem; color: #64748b;">Secure Identifier Hash</p>
      </div>
    `, 'resident', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/resident/household', requireAuth, requireResident, async (req, res) => {
  try {
    const householdRes = await pool.query(`
      SELECT h.* FROM households h 
      JOIN household_members hm ON h.id = hm.household_id 
      WHERE hm.resident_id = $1
    `, [req.session.residentId]);

    let membersHtml = '<p>You are not currently assigned to a household.</p>';
    if (householdRes.rows.length > 0) {
      const h = householdRes.rows[0];
      const members = await pool.query(`
        SELECT r.first_name, r.last_name, hm.relationship, hm.household_position 
        FROM household_members hm JOIN residents r ON hm.resident_id = r.id 
        WHERE hm.household_id = $1
      `, [h.id]);

      membersHtml = `
        <div class="card">
          <h3>Household #: ${h.household_number}</h3>
          <p>Address: ${h.address}</p>
          <table>
            <tr><th>Name</th><th>Relationship</th><th>Position</th></tr>
            ${members.rows.map(m => `<tr><td>${m.first_name}${m.last_name}</td><td>${m.relationship}</td><td>${m.household_position}</td></tr>`).join('')}
          </table>
        </div>
      `;
    }

    res.send(renderLayout('My Household', membersHtml, 'resident', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/resident/documents/request', requireAuth, requireResident, async (req, res) => {
  try {
    const docs = await pool.query("SELECT * FROM documents WHERE status = 'active'");
    res.send(renderLayout('Request Document', `
      <div class="card" style="max-width: 600px; margin: auto;">
        <h2>Request Barangay Document</h2>
        <form action="/resident/documents/request" method="POST" enctype="multipart/form-data">
          <div class="form-group">
            <label>Document Type</label>
            <select name="document_type_id" required>
              ${docs.rows.map(d => `<option value="${d.id}">${d.title} (Fee: ₱${d.fee})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Purpose of Request</label>
            <textarea name="purpose" required rows="3" placeholder="Specify complete purpose..."></textarea>
          </div>
          <div class="form-group">
            <label>Upload Supporting Requirement (Valid ID/Proof)</label>
            <input type="file" name="requirements_file" required>
          </div>
          <button type="submit">Submit Request</button>
        </form>
      </div>
    `, 'resident', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/resident/documents/request', upload.single('requirements_file'), async (req, res) => {
  try {
    const { document_type_id, purpose } = req.body;
    const residentId = req.session.residentId;
    const requestId = 'REQ-' + Date.now();
    const reqPath = req.file ? req.file.filename : null;

    await pool.query(`
      INSERT INTO document_requests (request_id, resident_id, document_type_id, purpose, requirements_path, status) 
      VALUES ($1, $2, $3, $4, $5, 'Pending')
    `, [requestId, residentId, document_type_id, purpose, reqPath]);

    await logActivity(req.session.userId, 'resident', 'Requested document ' + requestId, 'documents', residentId, req.ip);
    res.redirect('/resident/requests');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/resident/requests', requireAuth, requireResident, async (req, res) => {
  try {
    const requests = await pool.query(`
      SELECT dr.*, d.title as doc_title FROM document_requests dr 
      JOIN documents d ON dr.document_type_id = d.id 
      WHERE dr.resident_id = $1 ORDER BY dr.date_requested DESC
    `, [req.session.residentId]);

    res.send(renderLayout('My Requests', `
      <div class="card">
        <h2>My Document Requests</h2>
        <table>
          <tr><th>Request ID</th><th>Document</th><th>Purpose</th><th>Status</th><th>Date</th></tr>
          ${requests.rows.map(r => `
            <tr>
              <td>${r.request_id}</td>
              <td>${r.doc_title}</td>
              <td>${r.purpose}</td>
              <td><span class="badge badge-warning">${r.status}</span></td>
              <td>${r.date_requested.toISOString().split('T')[0]}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    `, 'resident', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/resident/documents', requireAuth, requireResident, async (req, res) => {
  try {
    const completed = await pool.query(`
      SELECT dr.*, d.title as doc_title FROM document_requests dr 
      JOIN documents d ON dr.document_type_id = d.id 
      WHERE dr.resident_id = $1 AND dr.status = 'Completed'
    `, [req.session.residentId]);

    res.send(renderLayout('My Documents', `
      <div class="card">
        <h2>Completed & Issued Documents</h2>
        <table>
          <tr><th>Document No.</th><th>Type</th><th>Completed Date</th><th>Action</th></tr>
          ${completed.rows.map(c => `
            <tr>
              <td>${c.document_number || 'N/A'}</td>
              <td>${c.doc_title}</td>
              <td>${c.completion_date ? c.completion_date.toISOString().split('T')[0] : 'N/A'}</td>
              <td><a href="/resident/documents/view/${c.id}" class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">View Document</a></td>
            </tr>
          `).join('')}
        </table>
      </div>
    `, 'resident', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/resident/documents/view/:id', requireAuth, requireResident, async (req, res) => {
  try {
    const reqId = req.params.id;
    const docData = await pool.query(`
      SELECT dr.*, d.title as doc_title, r.first_name, r.last_name, r.complete_address, r.resident_id 
      FROM document_requests dr 
      JOIN documents d ON dr.document_type_id = d.id 
      JOIN residents r ON dr.resident_id = r.id 
      WHERE dr.id = $1 AND dr.resident_id = $2 AND dr.status = 'Completed'
    `, [reqId, req.session.residentId]);

    if (docData.rows.length === 0) return res.status(404).send(renderErrorPage('Not Found', 'Document not found or unauthorized.'));
    const doc = docData.rows[0];
    const settings = (await pool.query("SELECT * FROM system_settings WHERE id = 1")).rows[0];

    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>${doc.doc_title}</title>
      <style>
        body { font-family: serif; padding: 3rem; max-width: 800px; margin: auto; background: white; color: black; }
        .header { text-align: center; border-bottom: 2px solid black; padding-bottom: 1rem; margin-bottom: 2rem; }
        .content { line-height: 1.8; font-size: 1.1rem; }
        .footer { margin-top: 4rem; display: flex; justify-content: space-between; }
        @media print { .no-print { display: none; } }
      </style>
      </head>
      <body>
        <div class="header">
          <h3>Republic of the Philippines</h3>
          <h4>${settings.barangay_name}</h4>
          <p>${settings.barangay_address}</p>
          <h2 style="margin-top: 1rem; text-transform: uppercase;">${doc.doc_title}</h2>
        </div>
        <div class="content">
          <p><strong>TO WHOM IT MAY CONCERN:</strong></p>
          <p style="text-indent: 2rem; margin: 1.5rem 0;">This is to certify that <strong>${doc.first_name} ${doc.last_name}</strong>, with Resident ID <strong>${doc.resident_id}</strong>, is a permanent resident of ${doc.complete_address}.</p>
          <p style="text-indent: 2rem; margin: 1.5rem 0;">This certification is issued upon the request of the above-named person for the purpose of <strong>${doc.purpose}</strong>.</p>
          <p>Given this ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at ${settings.barangay_name}.</p>
        </div>
        <div class="footer">
          <div>Document No: <strong>${doc.document_number}</strong></div>
          <div style="text-align: center;">___________________________<br><strong>Barangay Captain</strong></div>
        </div>
        <div class="no-print" style="margin-top: 3rem; text-align: center;">
          <button onclick="window.print()" style="padding: 0.75rem 1.5rem; font-size: 1rem; cursor: pointer;">Print Document</button>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/resident/notifications', requireAuth, requireResident, async (req, res) => {
  try {
    const notifs = await pool.query("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC", [req.session.userId]);
    res.send(renderLayout('Notifications', `
      <div class="card">
        <h2>Notifications</h2>
        <table>
          <tr><th>Message</th><th>Date</th></tr>
          ${notifs.rows.map(n => `<tr><td>${n.message}</td><td>${n.created_at.toISOString().split('T')[0]}</td></tr>`).join('')}
        </table>
      </div>
    `, 'resident', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/resident/announcements', requireAuth, requireResident, async (req, res) => {
  try {
    const ann = await pool.query("SELECT * FROM announcements WHERE status = 'Published' ORDER BY publish_date DESC");
    res.send(renderLayout('Announcements', `
      <div class="card">
        <h2>Barangay Announcements</h2>
        ${ann.rows.map(a => `
          <div style="padding: 1rem 0; border-bottom: 1px solid #e2e8f0;">
            <h3>${a.title}</h3>
            <p style="font-size: 0.85rem; color: #64748b; margin-bottom: 0.5rem;">Published: ${a.publish_date.toISOString().split('T')[0]}</p>
            <p>${a.content}</p>
          </div>
        `).join('')}
      </div>
    `, 'resident', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/resident/concerns', requireAuth, requireResident, async (req, res) => {
  try {
    const concerns = await pool.query("SELECT * FROM concerns WHERE resident_id = $1 ORDER BY created_at DESC", [req.session.residentId]);
    res.send(renderLayout('Concerns & Requests', `
      <div class="card">
        <h2>Submit Concern or Service Request</h2>
        <form action="/resident/concerns" method="POST">
          <div class="form-group"><label>Subject</label><input type="text" name="subject" required></div>
          <div class="form-group"><label>Description / Details</label><textarea name="description" required rows="3"></textarea></div>
          <button type="submit">Submit Concern</button>
        </form>
      </div>
      <div class="card">
        <h2>My Submitted Concerns</h2>
        <table>
          <tr><th>Subject</th><th>Status</th><th>Response</th></tr>
          ${concerns.rows.map(c => `<tr><td>${c.subject}</td><td><span class="badge badge-warning">${c.status}</span></td><td>${c.response || 'Pending review'}</td></tr>`).join('')}
        </table>
      </div>
    `, 'resident', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/resident/concerns', requireAuth, requireResident, async (req, res) => {
  try {
    const { subject, description } = req.body;
    await pool.query("INSERT INTO concerns (resident_id, subject, description) VALUES ($1, $2, $3)", [req.session.residentId, subject, description]);
    res.redirect('/resident/concerns');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/resident/settings', requireAuth, requireResident, async (req, res) => {
  res.send(renderLayout('Account Settings', `
    <div class="card" style="max-width: 500px;">
      <h2>Change Password</h2>
      <form action="/resident/settings/password" method="POST">
        <div class="form-group"><label>Current Password</label><input type="password" name="current_password" required></div>
        <div class="form-group"><label>New Password</label><input type="password" name="new_password" required></div>
        <button type="submit">Update Password</button>
      </form>
    </div>
  `, 'resident', req.session));
});

app.post('/resident/settings/password', requireAuth, requireResident, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userRes = await pool.query("SELECT * FROM users WHERE id = $1", [req.session.userId]);
    const user = userRes.rows[0];
    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match) return res.send(renderErrorPage('Error', 'Incorrect current password.'));

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hashed, req.session.userId]);
    res.send(renderLayout('Success', '<div class="card"><h2>Password Updated Successfully!</h2><a href="/resident/dashboard" class="btn">Dashboard</a></div>', 'resident', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

// -----------------------------------------------------------------------------
// ADMIN PORTAL ROUTES
// -----------------------------------------------------------------------------
app.get('/admin/dashboard', requireAuth, requireAdmin, async (req, res) => {
  try {
    const totalRes = (await pool.query("SELECT COUNT(*) FROM residents")).rows[0].count;
    const totalHouse = (await pool.query("SELECT COUNT(*) FROM households")).rows[0].count;
    const maleRes = (await pool.query("SELECT COUNT(*) FROM residents WHERE sex = 'Male'")).rows[0].count;
    const femaleRes = (await pool.query("SELECT COUNT(*) FROM residents WHERE sex = 'Female'")).rows[0].count;
    const seniorRes = (await pool.query("SELECT COUNT(*) FROM residents WHERE senior_citizen_status = true")).rows[0].count;
    const pwdRes = (await pool.query("SELECT COUNT(*) FROM residents WHERE pwd_status = true")).rows[0].count;
    const voterRes = (await pool.query("SELECT COUNT(*) FROM residents WHERE voter_status = true")).rows[0].count;
    const pendingReg = (await pool.query("SELECT COUNT(*) FROM residents WHERE account_status = 'pending'")).rows[0].count;
    const pendingDoc = (await pool.query("SELECT COUNT(*) FROM document_requests WHERE status = 'Pending'")).rows[0].count;
    const blotterOpen = (await pool.query("SELECT COUNT(*) FROM blotter_records WHERE status = 'Open'")).rows[0].count;

    res.send(renderLayout('Admin Dashboard', `
      <h2>Admin Dashboard Overview</h2>
      <div class="grid">
        <div class="stat-card"><h4>Total Residents</h4><div class="value">${totalRes}</div></div>
        <div class="stat-card"><h4>Total Households</h4><div class="value">${totalHouse}</div></div>
        <div class="stat-card"><h4>Male / Female</h4><div class="value">${maleRes} / ${femaleRes}</div></div>
        <div class="stat-card"><h4>Senior Citizens</h4><div class="value">${seniorRes}</div></div>
        <div class="stat-card"><h4>PWD Residents</h4><div class="value">${pwdRes}</div></div>
        <div class="stat-card"><h4>Registered Voters</h4><div class="value">${voterRes}</div></div>
        <div class="stat-card"><h4>Pending Registrations</h4><div class="value">${pendingReg}</div></div>
        <div class="stat-card"><h4>Pending Document Requests</h4><div class="value">${pendingDoc}</div></div>
        <div class="stat-card"><h4>Active Blotter Cases</h4><div class="value">${blotterOpen}</div></div>
      </div>
    `, 'admin', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/admin/residents', requireAuth, requireAdmin, async (req, res) => {
  try {
    const search = req.query.search || '';
    const residents = await pool.query(`
      SELECT * FROM residents 
      WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR resident_id ILIKE $1 
      ORDER BY created_at DESC LIMIT 50
    `, [`%${search}%`]);

    res.send(renderLayout('Resident Management', `
      <div class="card">
        <h2>Resident Management</h2>
        <form method="GET" style="flex-direction: row; gap: 0.5rem; margin-bottom: 1rem;">
          <input type="text" name="search" placeholder="Search by name or ID..." value="${search}">
          <button type="submit" style="width: auto;">Search</button>
        </form>
        <table>
          <tr><th>Resident ID</th><th>Name</th><th>Sex</th><th>Contact</th><th>Status</th><th>Actions</th></tr>
          ${residents.rows.map(r => `
            <tr>
              <td>${r.resident_id}</td>
              <td>${r.first_name}${r.last_name}</td>
              <td>${r.sex}</td>
              <td>${r.contact_number}</td>
              <td><span class="badge badge-success">${r.account_status}</span></td>
              <td><a href="/admin/residents/${r.id}" class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">View / Approve</a></td>
            </tr>
          `).join('')}
        </table>
      </div>
    `, 'admin', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/admin/residents/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = (await pool.query("SELECT * FROM residents WHERE id = $1", [req.params.id])).rows[0];
    res.send(renderLayout('Resident Details', `
      <div class="card">
        <h2>Resident Review: ${r.first_name} ${r.last_name}</h2>
        <p>Status: <span class="badge badge-warning">${r.account_status}</span></p>
        <p>Resident ID: ${r.resident_id}</p>
        <p>Address: ${r.complete_address}</p>
        <p>Contact: ${r.contact_number} | Email: ${r.email}</p>
        ${r.account_status === 'pending' ? `
          <div style="margin-top: 1.5rem; display: flex; gap: 1rem;">
            <a href="/admin/residents/${r.id}/approve" class="btn btn-success">Approve Registration</a>
            <a href="/admin/residents/${r.id}/reject" class="btn btn-danger">Reject Registration</a>
          </div>
        ` : ''}
      </div>
    `, 'admin', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/admin/residents/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resId = req.params.id;
    await client.query("UPDATE residents SET account_status = 'approved' WHERE id = $1", [resId]);
    const rData = (await client.query("SELECT user_id FROM residents WHERE id = $1", [resId])).rows[0];
    if (rData && rData.user_id) {
      await client.query("UPDATE users SET status = 'active' WHERE id = $1", [rData.user_id]);
      await client.query("INSERT INTO notifications (user_id, message) VALUES ($1, $2)", [rData.user_id, 'Your resident registration has been approved!']);
    }
    await client.query('COMMIT');
    await logActivity(req.session.userId, 'admin', 'Approved resident ID ' + resId, 'residents', resId, req.ip);
    res.redirect('/admin/residents');
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).send(renderErrorPage('Error', err.message));
  } finally {
    client.release();
  }
});

app.get('/admin/accounts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await pool.query("SELECT * FROM users ORDER BY created_at DESC");
    res.send(renderLayout('User Accounts', `
      <div class="card">
        <h2>System User Accounts</h2>
        <table>
          <tr><th>Username</th><th>Role</th><th>Status</th><th>Created</th></tr>
          ${users.rows.map(u => `<tr><td>${u.username}</td><td>${u.role}</td><td>${u.status}</td><td>${u.created_at.toISOString().split('T')[0]}</td></tr>`).join('')}
        </table>
      </div>
    `, 'admin', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/admin/households', requireAuth, requireAdmin, async (req, res) => {
  try {
    const households = await pool.query("SELECT * FROM households");
    res.send(renderLayout('Household Management', `
      <div class="card">
        <h2>Households</h2>
        <form action="/admin/households" method="POST" style="max-width: 500px; margin-bottom: 2rem;">
          <h3>Create Household</h3>
          <div class="form-group"><label>Household Number</label><input type="text" name="household_number" required></div>
          <div class="form-group"><label>Address</label><textarea name="address" required rows="2"></textarea></div>
          <button type="submit">Create Household</button>
        </form>
        <table>
          <tr><th>Household No.</th><th>Address</th></tr>
          ${households.rows.map(h => `<tr><td>${h.household_number}</td><td>${h.address}</td></tr>`).join('')}
        </table>
      </div>
    `, 'admin', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/admin/households', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { household_number, address } = req.body;
    await pool.query("INSERT INTO households (household_number, address) VALUES ($1, $2)", [household_number, address]);
    res.redirect('/admin/households');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/admin/staff', requireAuth, requireAdmin, async (req, res) => {
  try {
    res.send(renderLayout('Staff Management', `
      <div class="card" style="max-width: 500px;">
        <h2>Create Staff Account</h2>
        <form action="/admin/staff" method="POST">
          <div class="form-group"><label>Username</label><input type="text" name="username" required></div>
          <div class="form-group"><label>Password</label><input type="password" name="password" required></div>
          <button type="submit" style="background: #0f766e;">Create Staff</button>
        </form>
      </div>
    `, 'admin', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/admin/staff', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO users (username, password_hash, role, status) VALUES ($1, $2, 'staff', 'active')", [username, hashed]);
    res.redirect('/admin/staff');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/admin/officials', requireAuth, requireAdmin, async (req, res) => {
  try {
    const officials = await pool.query("SELECT * FROM officials");
    res.send(renderLayout('Barangay Officials', `
      <div class="card">
        <h2>Officials</h2>
        <form action="/admin/officials" method="POST" style="max-width: 500px; margin-bottom: 2rem;">
          <h3>Add Official</h3>
          <div class="form-group"><label>Full Name</label><input type="text" name="full_name" required></div>
          <div class="form-group"><label>Position</label><input type="text" name="position" required></div>
          <div class="form-group"><label>Contact</label><input type="text" name="contact"></div>
          <button type="submit">Add Official</button>
        </form>
        <table>
          <tr><th>Name</th><th>Position</th><th>Contact</th></tr>
          ${officials.rows.map(o => `<tr><td>${o.full_name}</td><td>${o.position}</td><td>${o.contact || 'N/A'}</td></tr>`).join('')}
        </table>
      </div>
    `, 'admin', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/admin/officials', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { full_name, position, contact } = req.body;
    await pool.query("INSERT INTO officials (full_name, position, contact) VALUES ($1, $2, $3)", [full_name, position, contact]);
    res.redirect('/admin/officials');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/admin/documents', requireAuth, requireAdmin, async (req, res) => {
  try {
    const docs = await pool.query("SELECT * FROM documents");
    res.send(renderLayout('Document Types', `
      <div class="card">
        <h2>Manage Document Types</h2>
        <table>
          <tr><th>Title</th><th>Code</th><th>Fee</th></tr>
          ${docs.rows.map(d => `<tr><td>${d.title}</td><td>${d.code}</td><td>₱${d.fee}</td></tr>`).join('')}
        </table>
      </div>
    `, 'admin', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/admin/document-requests', requireAuth, requireAdmin, async (req, res) => {
  try {
    const requests = await pool.query(`
      SELECT dr.*, d.title as doc_title, r.first_name, r.last_name 
      FROM document_requests dr 
      JOIN documents d ON dr.document_type_id = d.id 
      JOIN residents r ON dr.resident_id = r.id 
      ORDER BY dr.date_requested DESC
    `);

    res.send(renderLayout('Document Requests', `
      <div class="card">
        <h2>Document Requests Management</h2>
        <table>
          <tr><th>Request ID</th><th>Resident</th><th>Document</th><th>Status</th><th>Action</th></tr>
          ${requests.rows.map(r => `
            <tr>
              <td>${r.request_id}</td>
              <td>${r.first_name}${r.last_name}</td>
              <td>${r.doc_title}</td>
              <td><span class="badge badge-warning">${r.status}</span></td>
              <td><a href="/admin/document-requests/${r.id}" class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">Process</a></td>
            </tr>
          `).join('')}
        </table>
      </div>
    `, 'admin', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/admin/document-requests/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rId = req.params.id;
    const reqData = (await pool.query(`
      SELECT dr.*, d.title as doc_title, r.first_name, r.last_name 
      FROM document_requests dr 
      JOIN documents d ON dr.document_type_id = d.id 
      JOIN residents r ON dr.resident_id = r.id 
      WHERE dr.id = $1
    `, [rId])).rows[0];

    res.send(renderLayout('Process Request', `
      <div class="card" style="max-width: 600px;">
        <h2>Process Request: ${reqData.request_id}</h2>
        <p>Resident: ${reqData.first_name} ${reqData.last_name}</p>
        <p>Document: ${reqData.doc_title}</p>
        <p>Purpose: ${reqData.purpose}</p>
        <form action="/admin/document-requests/${rId}/complete" method="POST" style="margin-top: 1.5rem;">
          <button type="submit" class="btn-success">Approve & Complete Document</button>
        </form>
      </div>
    `, 'admin', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/admin/document-requests/:id/complete', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rId = req.params.id;
    const docNum = 'DOC-' + Date.now();
    await client.query(`
      UPDATE document_requests 
      SET status = 'Completed', document_number = $1, completion_date = CURRENT_TIMESTAMP 
      WHERE id = $2
    `, [docNum, rId]);

    const reqInfo = (await client.query("SELECT resident_id, user_id FROM residents WHERE id = (SELECT resident_id FROM document_requests WHERE id = $1)", [rId])).rows[0];
    if (reqInfo) {
      await client.query("INSERT INTO notifications (user_id, message) VALUES ($1, $2)", [reqInfo.user_id, 'Your requested document has been completed and is ready!']);
    }

    await client.query('COMMIT');
    res.redirect('/admin/document-requests');
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).send(renderErrorPage('Error', err.message));
  } finally {
    client.release();
  }
});

app.get('/admin/blotter', requireAuth, requireAdmin, async (req, res) => {
  try {
    const blotters = await pool.query("SELECT * FROM blotter_records ORDER BY created_at DESC");
    res.send(renderLayout('Blotter Records', `
      <div class="card">
        <h2>Blotter Management</h2>
        <form action="/admin/blotter" method="POST" style="max-width: 600px; margin-bottom: 2rem;">
          <h3>File Blotter Record</h3>
          <div class="grid">
            <div class="form-group"><label>Complainant</label><input type="text" name="complainant" required></div>
            <div class="form-group"><label>Respondent</label><input type="text" name="respondent" required></div>
          </div>
          <div class="grid">
            <div class="form-group"><label>Incident Type</label><input type="text" name="incident_type" required></div>
            <div class="form-group"><label>Date / Time</label><input type="date" name="incident_date" required></div>
          </div>
          <div class="form-group"><label>Location</label><input type="text" name="location" required></div>
          <div class="form-group"><label>Description</label><textarea name="description" required rows="2"></textarea></div>
          <button type="submit">File Case</button>
        </form>
        <table>
          <tr><th>Case No.</th><th>Complainant</th><th>Respondent</th><th>Type</th><th>Status</th></tr>
          ${blotters.rows.map(b => `<tr><td>${b.case_number}</td><td>${b.complainant}</td><td>${b.respondent}</td><td>${b.incident_type}</td><td><span class="badge badge-warning">${b.status}</span></td></tr>`).join('')}
        </table>
      </div>
    `, 'admin', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/admin/blotter', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { complainant, respondent, incident_type, incident_date, location, description } = req.body;
    const caseNum = 'BLT-' + Date.now();
    await pool.query(`
      INSERT INTO blotter_records (case_number, complainant, respondent, incident_type, incident_date, incident_time, location, description, created_by) 
      VALUES ($1, $2, $3, $4, $5, '00:00:00', $6, $7, $8)
    `, [caseNum, complainant, respondent, incident_type, incident_date, location, description, req.session.userId]);
    res.redirect('/admin/blotter');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/admin/announcements', requireAuth, requireAdmin, async (req, res) => {
  try {
    const anns = await pool.query("SELECT * FROM announcements ORDER BY created_at DESC");
    res.send(renderLayout('Announcements', `
      <div class="card">
        <h2>Announcements</h2>
        <form action="/admin/announcements" method="POST" style="max-width: 600px; margin-bottom: 2rem;">
          <h3>Create Announcement</h3>
          <div class="form-group"><label>Title</label><input type="text" name="title" required></div>
          <div class="form-group"><label>Content</label><textarea name="content" required rows="3"></textarea></div>
          <button type="submit">Publish Announcement</button>
        </form>
        <table>
          <tr><th>Title</th><th>Date</th><th>Status</th></tr>
          ${anns.rows.map(a => `<tr><td>${a.title}</td><td>${a.publish_date.toISOString().split('T')[0]}</td><td><span class="badge badge-success">${a.status}</span></td></tr>`).join('')}
        </table>
      </div>
    `, 'admin', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/admin/announcements', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, content } = req.body;
    await pool.query("INSERT INTO announcements (title, content, created_by) VALUES ($1, $2, $3)", [title, content, req.session.userId]);
    res.redirect('/admin/announcements');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/admin/notifications', requireAuth, requireAdmin, (req, res) => {
  res.send(renderLayout('Admin Notifications', '<div class="card"><h2>Notifications Control</h2><p>System notification broadcast hub.</p></div>', 'admin', req.session));
});

app.get('/admin/qr', requireAuth, requireAdmin, (req, res) => {
  res.send(renderLayout('QR Scanner', `
    <div class="card" style="max-width: 500px; text-align: center;">
      <h2>Resident QR Verification Scanner</h2>
      <p style="color: #64748b; margin-bottom: 1.5rem;">Enter or scan resident QR token hash to verify profile identity.</p>
      <form action="/admin/qr/verify" method="POST">
        <div class="form-group"><input type="text" name="qr_token" placeholder="Paste QR Hash Token..." required></div>
        <button type="submit">Verify Resident QR</button>
      </form>
    </div>
  `, 'admin', req.session));
});

app.post('/admin/qr/verify', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { qr_token } = req.body;
    const resData = await pool.query("SELECT * FROM residents WHERE qr_token = $1", [qr_token]);
    if (resData.rows.length === 0) {
      return res.send(renderErrorPage('Invalid QR', 'Unrecognized or invalid resident QR token.'));
    }
    const r = resData.rows[0];
    res.send(renderLayout('Verification Result', `
      <div class="card" style="max-width: 500px; text-align: center;">
        <h2 style="color: var(--success);">Valid Resident Verified</h2>
        <h3>${r.first_name} ${r.last_name}</h3>
        <p>Resident ID: <strong>${r.resident_id}</strong></p>
        <p>Status: <span class="badge badge-success">${r.account_status}</span></p>
        <p>Address: ${r.complete_address}</p>
      </div>
    `, 'admin', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/admin/reports', requireAuth, requireAdmin, async (req, res) => {
  try {
    const count = (await pool.query("SELECT COUNT(*) FROM residents")).rows[0].count;
    res.send(renderLayout('Reports', `
      <div class="card">
        <h2>Demographic & System Reports</h2>
        <p>Total Registered Residents in Master List: <strong>${count}</strong></p>
        <div style="margin-top: 1.5rem;">
          <button onclick="window.print()" class="btn">Print Report</button>
        </div>
      </div>
    `, 'admin', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/admin/logs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const logs = await pool.query("SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 50");
    res.send(renderLayout('Activity Logs', `
      <div class="card">
        <h2>System Activity Logs</h2>
        <table>
          <tr><th>Action</th><th>Role</th><th>Module</th><th>Date/Time</th></tr>
          ${logs.rows.map(l => `<tr><td>${l.action}</td><td>${l.role}</td><td>${l.module}</td><td>${l.created_at.toISOString()}</td></tr>`).join('')}
        </table>
      </div>
    `, 'admin', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/admin/backup', requireAuth, requireAdmin, (req, res) => {
  res.send(renderLayout('Backup Instructions', `
    <div class="card">
      <h2>Database Backup & Persistence Information</h2>
      <p>This system utilizes <strong>Render PostgreSQL</strong> as its permanent storage source of truth.</p>
      <p style="margin-top: 1rem;">For automated production database backups, use Render's built-in PostgreSQL backup capabilities or standard <code>pg_dump</code> utilities.</p>
    </div>
  `, 'admin', req.session));
});

app.get('/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const settings = (await pool.query("SELECT * FROM system_settings WHERE id = 1")).rows[0];
    res.send(renderLayout('System Settings', `
      <div class="card" style="max-width: 600px;">
        <h2>Barangay Settings</h2>
        <form action="/admin/settings" method="POST">
          <div class="form-group"><label>Barangay Name</label><input type="text" name="barangay_name" value="${settings.barangay_name}" required></div>
          <div class="form-group"><label>Barangay Address</label><input type="text" name="barangay_address" value="${settings.barangay_address}" required></div>
          <div class="form-group"><label>Contact Number</label><input type="text" name="contact_number" value="${settings.contact_number}"></div>
          <button type="submit">Save Settings</button>
        </form>
      </div>
    `, 'admin', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { barangay_name, barangay_address, contact_number } = req.body;
    await pool.query("UPDATE system_settings SET barangay_name = $1, barangay_address = $2, contact_number = $3 WHERE id = 1", [barangay_name, barangay_address, contact_number]);
    res.redirect('/admin/settings');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

// -----------------------------------------------------------------------------
// STAFF PORTAL ROUTES
// -----------------------------------------------------------------------------
app.get('/staff/dashboard', requireAuth, requireStaff, (req, res) => {
  res.send(renderLayout('Staff Dashboard', `
    <div class="card">
      <h2>Staff Portal Dashboard</h2>
      <p>Welcome to the authorized staff module dashboard. Use the sidebar to manage records, requests, and QR scanning.</p>
    </div>
  `, 'staff', req.session));
});

app.get('/staff/residents', requireAuth, requireStaff, async (req, res) => {
  try {
    const residents = await pool.query("SELECT * FROM residents ORDER BY created_at DESC LIMIT 50");
    res.send(renderLayout('Staff Residents', `
      <div class="card">
        <h2>Resident Records</h2>
        <table>
          <tr><th>Resident ID</th><th>Name</th><th>Sex</th><th>Contact</th></tr>
          ${residents.rows.map(r => `<tr><td>${r.resident_id}</td><td>${r.first_name}${r.last_name}</td><td>${r.sex}</td><td>${r.contact_number}</td></tr>`).join('')}
        </table>
      </div>
    `, 'staff', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/households', requireAuth, requireStaff, async (req, res) => {
  try {
    const households = await pool.query("SELECT * FROM households");
    res.send(renderLayout('Staff Households', `
      <div class="card">
        <h2>Household Records</h2>
        <table>
          <tr><th>Household No.</th><th>Address</th></tr>
          ${households.rows.map(h => `<tr><td>${h.household_number}</td><td>${h.address}</td></tr>`).join('')}
        </table>
      </div>
    `, 'staff', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/documents', requireAuth, requireStaff, (req, res) => {
  res.send(renderLayout('Staff Documents', '<div class="card"><h2>Document Types</h2><p>Staff view of available barangay documents.</p></div>', 'staff', req.session));
});

app.get('/staff/document-requests', requireAuth, requireStaff, async (req, res) => {
  try {
    const requests = await pool.query(`
      SELECT dr.*, d.title as doc_title, r.first_name, r.last_name 
      FROM document_requests dr 
      JOIN documents d ON dr.document_type_id = d.id 
      JOIN residents r ON dr.resident_id = r.id 
      ORDER BY dr.date_requested DESC
    `);
    res.send(renderLayout('Staff Document Requests', `
      <div class="card">
        <h2>Document Requests</h2>
        <table>
          <tr><th>Request ID</th><th>Resident</th><th>Document</th><th>Status</th></tr>
          ${requests.rows.map(r => `<tr><td>${r.request_id}</td><td>${r.first_name} ${r.last_name}</td><td>${r.doc_title}</td><td><span class="badge badge-warning">${r.status}</span></td></tr>`).join('')}
        </table>
      </div>
    `, 'staff', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/blotter', requireAuth, requireStaff, async (req, res) => {
  try {
    const blotters = await pool.query("SELECT * FROM blotter_records ORDER BY created_at DESC");
    res.send(renderLayout('Staff Blotter', `
      <div class="card">
        <h2>Blotter Records</h2>
        <table>
          <tr><th>Case No.</th><th>Complainant</th><th>Respondent</th><th>Status</th></tr>
          ${blotters.rows.map(b => `<tr><td>${b.case_number}</td><td>${b.complainant}</td><td>${b.respondent}</td><td>${b.status}</td></tr>`).join('')}
        </table>
      </div>
    `, 'staff', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/qr', requireAuth, requireStaff, (req, res) => {
  res.send(renderLayout('Staff QR Scanner', `
    <div class="card" style="max-width: 500px; text-align: center;">
      <h2>QR Scanner Module</h2>
      <form action="/staff/qr/verify" method="POST">
        <div class="form-group"><input type="text" name="qr_token" placeholder="Enter QR Token Hash..." required></div>
        <button type="submit">Verify Resident</button>
      </form>
    </div>
  `, 'staff', req.session));
});

app.post('/staff/qr/verify', requireAuth, requireStaff, async (req, res) => {
  try {
    const { qr_token } = req.body;
    const resData = await pool.query("SELECT * FROM residents WHERE qr_token = $1", [qr_token]);
    if (resData.rows.length === 0) return res.send(renderErrorPage('Invalid QR', 'Unrecognized QR token.'));
    const r = resData.rows[0];
    res.send(renderLayout('Verification Success', `
      <div class="card" style="max-width: 500px; text-align: center;">
        <h3 style="color: var(--success);">Resident Verified</h3>
        <p>${r.first_name} ${r.last_name} (${r.resident_id})</p>
      </div>
    `, 'staff', req.session));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/reports', requireAuth, requireStaff, (req, res) => {
  res.send(renderLayout('Staff Reports', '<div class="card"><h2>Reports</h2><p>Standard demographic and operational reports.</p></div>', 'staff', req.session));
});

app.get('/staff/notifications', requireAuth, requireStaff, (req, res) => {
  res.send(renderLayout('Staff Notifications', '<div class="card"><h2>Notifications</h2><p>Staff operational notifications.</p></div>', 'staff', req.session));
});

app.get('/staff/settings', requireAuth, requireStaff, (req, res) => {
  res.send(renderLayout('Staff Settings', '<div class="card"><h2>Settings</h2><p>Staff account management.</p></div>', 'staff', req.session));
});

// -----------------------------------------------------------------------------
// SERVER INITIALIZATION
// -----------------------------------------------------------------------------
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Barangay Resident Management System running on port ${PORT}`);
  });
});
