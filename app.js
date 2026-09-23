/**
 * BARANGAY RESIDENT MANAGEMENT SYSTEM (BRMS)
 * Monolithic Express.js + PostgreSQL Application
 */

const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

// Initialize Express App
const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL Connection Setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('render.com') 
    ? { rejectUnauthorized: false } 
    : false
});

// Helper for Parameterized Queries
const db = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect()
};

// Ensure Local Storage Upload Dir Exists (Fallback Storage Abstraction)
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB Limit
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('Only images (JPG, PNG) and PDF files are allowed.'));
  }
});

// Middleware Configuration
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOAD_DIR));

// Express Session Configuration
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'super-secret-barangay-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 Days
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// ==========================================
// DATABASE INITIALIZATION & MIGRATIONS
// ==========================================
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // System Settings Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        barangay_name VARCHAR(150) NOT NULL DEFAULT 'Barangay Central',
        address TEXT NOT NULL DEFAULT '123 Main Street, City',
        contact_number VARCHAR(50) NOT NULL DEFAULT '+63 912 345 6789',
        email VARCHAR(100) NOT NULL DEFAULT 'info@barangaycentral.gov.ph',
        logo_url TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'STAFF', 'RESIDENT')),
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'PENDING', 'REJECTED')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Residents Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS residents (
        id SERIAL PRIMARY KEY,
        user_id INT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
        resident_id_number VARCHAR(50) UNIQUE,
        first_name VARCHAR(100) NOT NULL,
        middle_name VARCHAR(100),
        last_name VARCHAR(100) NOT NULL,
        suffix VARCHAR(20),
        birthdate DATE NOT NULL,
        sex VARCHAR(10) NOT NULL CHECK (sex IN ('Male', 'Female')),
        civil_status VARCHAR(20) NOT NULL,
        address TEXT NOT NULL,
        contact_number VARCHAR(20) NOT NULL,
        email VARCHAR(100),
        occupation VARCHAR(100),
        educational_attainment VARCHAR(100),
        nationality VARCHAR(50) DEFAULT 'Filipino',
        is_voter BOOLEAN DEFAULT FALSE,
        is_pwd BOOLEAN DEFAULT FALSE,
        is_senior BOOLEAN DEFAULT FALSE,
        is_4ps BOOLEAN DEFAULT FALSE,
        emergency_contact_name VARCHAR(150),
        emergency_contact_number VARCHAR(20),
        photo_url TEXT,
        valid_id_url TEXT,
        qr_token VARCHAR(100) UNIQUE,
        status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Staff Profile & Permissions Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS staff_permissions (
        id SERIAL PRIMARY KEY,
        user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        full_name VARCHAR(150) NOT NULL,
        position VARCHAR(100) NOT NULL,
        can_manage_residents BOOLEAN DEFAULT TRUE,
        can_manage_documents BOOLEAN DEFAULT TRUE,
        can_manage_blotter BOOLEAN DEFAULT FALSE,
        can_scan_qr BOOLEAN DEFAULT TRUE,
        can_generate_reports BOOLEAN DEFAULT FALSE
      );
    `);

    // Households Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS households (
        id SERIAL PRIMARY KEY,
        household_number VARCHAR(50) UNIQUE NOT NULL,
        head_resident_id INT REFERENCES residents(id) ON DELETE SET NULL,
        address TEXT NOT NULL,
        classification VARCHAR(50) DEFAULT 'Residential',
        status VARCHAR(20) DEFAULT 'ACTIVE',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Household Members Junction Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS household_members (
        id SERIAL PRIMARY KEY,
        household_id INT REFERENCES households(id) ON DELETE CASCADE,
        resident_id INT UNIQUE REFERENCES residents(id) ON DELETE CASCADE,
        relationship_to_head VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Barangay Officials Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS officials (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(150) NOT NULL,
        position VARCHAR(100) NOT NULL,
        contact_number VARCHAR(20),
        term_start DATE,
        term_end DATE,
        signature_url TEXT,
        is_active BOOLEAN DEFAULT TRUE
      );
    `);

    // Document Types Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_types (
        id SERIAL PRIMARY KEY,
        title VARCHAR(150) NOT NULL,
        requirements TEXT,
        fee DECIMAL(10, 2) DEFAULT 0.00,
        is_active BOOLEAN DEFAULT TRUE
      );
    `);

    // Document Requests Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_requests (
        id SERIAL PRIMARY KEY,
        request_number VARCHAR(50) UNIQUE NOT NULL,
        resident_id INT REFERENCES residents(id) ON DELETE CASCADE,
        document_type_id INT REFERENCES document_types(id) ON DELETE RESTRICT,
        purpose TEXT NOT NULL,
        status VARCHAR(30) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Under Review', 'Approved', 'Rejected', 'Ready', 'Completed', 'Cancelled')),
        requirements_file_url TEXT,
        remarks TEXT,
        processed_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Blotter Records Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS blotter_records (
        id SERIAL PRIMARY KEY,
        case_number VARCHAR(50) UNIQUE NOT NULL,
        complainant_name VARCHAR(150) NOT NULL,
        respondent_name VARCHAR(150) NOT NULL,
        incident_type VARCHAR(100) NOT NULL,
        incident_date DATE NOT NULL,
        incident_time TIME NOT NULL,
        location TEXT NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(30) DEFAULT 'Open' CHECK (status IN ('Open', 'Under Investigation', 'Resolved', 'Closed')),
        action_taken TEXT,
        created_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Announcements Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        is_published BOOLEAN DEFAULT TRUE,
        created_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Notifications Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(150) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Resident Concerns Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS resident_concerns (
        id SERIAL PRIMARY KEY,
        resident_id INT REFERENCES residents(id) ON DELETE CASCADE,
        subject VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        attachment_url TEXT,
        status VARCHAR(30) DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Under Review', 'Processing', 'Resolved', 'Closed')),
        response TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Activity Logs Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE SET NULL,
        username VARCHAR(100),
        role VARCHAR(20),
        action VARCHAR(255) NOT NULL,
        details TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Initialize Default Settings
    const settingsCheck = await client.query('SELECT COUNT(*) FROM system_settings');
    if (parseInt(settingsCheck.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO system_settings (barangay_name, address, contact_number, email) 
        VALUES ('Barangay San Jose', '123 Rizal Street, Poblacion', '+63 917 123 4567', 'admin@sanjose.gov.ph')
      `);
    }

    // Seed Initial Document Types
    const docsCheck = await client.query('SELECT COUNT(*) FROM document_types');
    if (parseInt(docsCheck.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO document_types (title, requirements, fee) VALUES
        ('Barangay Clearance', 'Valid ID, Proof of Residency', 50.00),
        ('Certificate of Indigency', 'Valid ID', 0.00),
        ('Certificate of Residency', 'Valid ID, Barangay ID', 30.00),
        ('Certificate of Good Moral Character', 'Valid ID, Police Clearance', 50.00),
        ('Business Clearance', 'DTI Registration, Mayor''s Permit Application', 200.00)
      `);
    }

    // Seed Initial Admin User (If None Exists)
    const adminCheck = await client.query("SELECT COUNT(*) FROM users WHERE role = 'ADMIN'");
    if (parseInt(adminCheck.rows[0].count) === 0) {
      const defaultPassword = process.env.INITIAL_ADMIN_PASSWORD || 'admin123';
      const hash = await bcrypt.hash(defaultPassword, 10);
      await client.query(
        "INSERT INTO users (username, password_hash, role, status) VALUES ($1, $2, 'ADMIN', 'ACTIVE')",
        ['admin', hash]
      );
      console.log('--------------------------------------------------');
      console.log('DEFAULT ADMIN ACCOUNT CREATED:');
      console.log('Username: admin');
      console.log(`Password: ${defaultPassword}`);
      console.log('--------------------------------------------------');
    }

    await client.query('COMMIT');
    console.log('Database Schema Initialized Successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error Initializing Database Schema:', err);
  } finally {
    client.release();
  }
}

// Utility Function: Log System Activity
async function logActivity(userId, username, role, action, details) {
  try {
    await db.query(
      'INSERT INTO activity_logs (user_id, username, role, action, details) VALUES ($1, $2, $3, $4, $5)',
      [userId || null, username || 'System', role || 'SYSTEM', action, details || '']
    );
  } catch (e) {
    console.error('Activity Log Error:', e);
  }
}

// Utility Function: Calculate Age from Birthdate
function calculateAge(birthdate) {
  const birth = new Date(birthdate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

// ==========================================
// AUTHORIZATION MIDDLEWARES
// ==========================================
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login-choice');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'ADMIN') {
    return next();
  }
  return res.status(403).send(renderErrorPage('Access Denied', 'Administrator permissions required.'));
}

function requireStaff(req, res, next) {
  if (req.session && (req.session.role === 'STAFF' || req.session.role === 'ADMIN')) {
    return next();
  }
  return res.status(403).send(renderErrorPage('Access Denied', 'Staff access authorization required.'));
}

function requireResident(req, res, next) {
  if (req.session && req.session.role === 'RESIDENT') {
    return next();
  }
  return res.status(403).send(renderErrorPage('Access Denied', 'Resident account authorization required.'));
}

// Check Resident Ownership
async function checkResidentOwnership(req, res, next) {
  if (req.session.role === 'ADMIN' || req.session.role === 'STAFF') {
    return next();
  }
  if (req.session.role === 'RESIDENT' && req.session.residentId) {
    const targetId = req.params.residentId || req.body.resident_id || req.query.resident_id;
    if (!targetId || parseInt(targetId) === parseInt(req.session.residentId)) {
      return next();
    }
  }
  return res.status(403).send(renderErrorPage('Privacy Violation', 'You can only access your own resident records.'));
}

// ==========================================
// HTML TEMPLATE WRAPPERS & LAYOUTS
// ==========================================

function renderBaseHTML(title, bodyContent, navType = 'guest', sessionUser = null) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - Barangay Resident Management System</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
      <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" rel="stylesheet">
      <script src="https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
      <style>
        :root {
          --primary-gov: #0a3663;
          --secondary-gov: #1d5b96;
          --accent-gold: #f39c12;
          --bg-light: #f4f6f9;
        }
        body { background-color: var(--bg-light); font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        .navbar-gov { background-color: var(--primary-gov); }
        .sidebar { min-height: calc(100vh - 56px); background-color: #ffffff; border-right: 1px solid #dee2e6; }
        .card-custom { border-radius: 10px; border: none; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
        .btn-gov { background-color: var(--primary-gov); color: white; }
        .btn-gov:hover { background-color: var(--secondary-gov); color: white; }
        .badge-status { font-size: 0.85rem; padding: 0.4em 0.8em; }
        .id-card-wrap {
          max-width: 450px; background: linear-gradient(135deg, #0a3663 0%, #1d5b96 100%);
          color: white; border-radius: 15px; padding: 20px; box-shadow: 0 8px 16px rgba(0,0,0,0.2);
        }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background-color: white; }
        }
      </style>
    </head>
    <body>
      ${renderNavbar(navType, sessionUser)}
      <div class="container-fluid">
        <div class="row">
          ${renderSidebar(navType, sessionUser)}
          <main class="${navType === 'guest' ? 'col-12' : 'col-md-9 col-lg-10'} ms-sm-auto px-md-4 py-4">
            ${bodyContent}
          </main>
        </div>
      </div>
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
    </body>
    </html>
  `;
}

function renderNavbar(type, user) {
  let title = "Barangay Resident Management System";
  if (type === 'admin') title = "BRMS - Admin Portal";
  if (type === 'staff') title = "BRMS - Staff Portal";
  if (type === 'resident') title = "BRMS - Resident Portal";

  return `
    <nav class="navbar navbar-expand-lg navbar-dark navbar-gov sticky-top no-print">
      <div class="container-fluid">
        <a class="navbar-brand fw-bold" href="/"><i class="bi bi-shield-check me-2"></i>${title}</a>
        ${user ? `
          <div class="d-flex align-items-center text-white me-3">
            <span class="me-3"><i class="bi bi-person-circle me-1"></i> ${user.username} (${user.role})</span>
            <a href="/logout" class="btn btn-outline-light btn-sm"><i class="bi bi-box-arrow-right me-1"></i>Logout</a>
          </div>
        ` : ''}
      </div>
    </nav>
  `;
}

function renderSidebar(type, user) {
  if (type === 'guest') return '';
  
  let links = '';
  if (type === 'admin') {
    links = `
      <li class="nav-item"><a class="nav-link text-dark" href="/admin/dashboard"><i class="bi bi-speedometer2 me-2"></i>Dashboard</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/admin/residents"><i class="bi bi-people me-2"></i>Residents</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/admin/households"><i class="bi bi-house-door me-2"></i>Households</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/admin/document-requests"><i class="bi bi-file-earmark-text me-2"></i>Document Requests</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/admin/blotter"><i class="bi bi-journal-text me-2"></i>Blotter Records</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/admin/announcements"><i class="bi bi-megaphone me-2"></i>Announcements</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/admin/staff"><i class="bi bi-person-badge me-2"></i>Staff Accounts</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/admin/officials"><i class="bi bi-person-workspace me-2"></i>Officials</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/admin/qr-scanner"><i class="bi bi-qr-code-scan me-2"></i>QR Scanner</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/admin/reports"><i class="bi bi-graph-up me-2"></i>Reports</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/admin/activity-logs"><i class="bi bi-clock-history me-2"></i>Activity Logs</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/admin/settings"><i class="bi bi-gear me-2"></i>System Settings</a></li>
    `;
  } else if (type === 'staff') {
    links = `
      <li class="nav-item"><a class="nav-link text-dark" href="/staff/dashboard"><i class="bi bi-speedometer2 me-2"></i>Dashboard</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/staff/residents"><i class="bi bi-people me-2"></i>Residents</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/staff/document-requests"><i class="bi bi-file-earmark-text me-2"></i>Document Requests</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/staff/blotter"><i class="bi bi-journal-text me-2"></i>Blotter Records</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/staff/qr-scanner"><i class="bi bi-qr-code-scan me-2"></i>QR Scanner</a></li>
    `;
  } else if (type === 'resident') {
    links = `
      <li class="nav-item"><a class="nav-link text-dark" href="/resident/dashboard"><i class="bi bi-house-door me-2"></i>My Dashboard</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/resident/profile"><i class="bi bi-person me-2"></i>My Profile</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/resident/id"><i class="bi bi-card-heading me-2"></i>Digital Resident ID</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/resident/documents"><i class="bi bi-file-earmark-plus me-2"></i>Request Documents</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/resident/household"><i class="bi bi-people me-2"></i>My Household</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/resident/notifications"><i class="bi bi-bell me-2"></i>Notifications</a></li>
      <li class="nav-item"><a class="nav-link text-dark" href="/resident/concerns"><i class="bi bi-chat-left-dots me-2"></i>Concerns & Feedback</a></li>
    `;
  }

  return `
    <div class="col-md-3 col-lg-2 sidebar d-none d-md-block py-3 no-print">
      <ul class="nav flex-column gap-1">
        ${links}
      </ul>
    </div>
  `;
}

function renderErrorPage(title, message) {
  return renderBaseHTML(title, `
    <div class="text-center py-5">
      <i class="bi bi-exclamation-triangle text-danger display-1"></i>
      <h2 class="mt-3">${title}</h2>
      <p class="lead text-muted">${message}</p>
      <a href="/" class="btn btn-gov mt-3"><i class="bi bi-arrow-left me-1"></i>Return to Home</a>
    </div>
  `);
}

// ==========================================
// PUBLIC & AUTHENTICATION ROUTES
// ==========================================

// Landing Choice Page
app.get('/', (req, res) => {
  if (req.session.userId) {
    if (req.session.role === 'ADMIN') return res.redirect('/admin/dashboard');
    if (req.session.role === 'STAFF') return res.redirect('/staff/dashboard');
    if (req.session.role === 'RESIDENT') return res.redirect('/resident/dashboard');
  }
  
  res.send(renderBaseHTML('Welcome', `
    <div class="row justify-content-center py-5">
      <div class="col-md-10 text-center">
        <h1 class="display-4 fw-bold text-dark mb-3">Barangay Resident Management System</h1>
        <p class="lead text-muted mb-5">Select your portal destination to continue.</p>
        
        <div class="row g-4">
          <div class="col-md-4">
            <div class="card card-custom h-100 p-4">
              <div class="card-body">
                <i class="bi bi-people-fill text-primary display-3 mb-3"></i>
                <h3 class="card-title h4">Resident Portal</h3>
                <p class="card-text text-muted">Access services, request documents, and view your digital ID.</p>
                <div class="d-grid gap-2 mt-4">
                  <a href="/resident-login" class="btn btn-gov">Resident Login</a>
                  <a href="/resident-register" class="btn btn-outline-primary">New Resident Register</a>
                </div>
              </div>
            </div>
          </div>

          <div class="col-md-4">
            <div class="card card-custom h-100 p-4">
              <div class="card-body">
                <i class="bi bi-person-badge-fill text-success display-3 mb-3"></i>
                <h3 class="card-title h4">Staff Portal</h3>
                <p class="card-text text-muted">Process document requests, verify QR codes, and manage blotters.</p>
                <div class="d-grid gap-2 mt-4">
                  <a href="/staff-login" class="btn btn-success">Staff Portal Access</a>
                </div>
              </div>
            </div>
          </div>

          <div class="col-md-4">
            <div class="card card-custom h-100 p-4">
              <div class="card-body">
                <i class="bi bi-shield-lock-fill text-danger display-3 mb-3"></i>
                <h3 class="card-title h4">Admin Portal</h3>
                <p class="card-text text-muted">Full management of residents, system configurations, and reports.</p>
                <div class="d-grid gap-2 mt-4">
                  <a href="/admin-login" class="btn btn-danger">Admin Portal Access</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `));
});

// Resident Login Page
app.get('/resident-login', (req, res) => {
  res.send(renderBaseHTML('Resident Login', `
    <div class="row justify-content-center py-5">
      <div class="col-md-5">
        <div class="card card-custom p-4">
          <h3 class="fw-bold mb-3 text-center">Resident Login</h3>
          ${req.query.error ? `<div class="alert alert-danger">${req.query.error}</div>` : ''}
          ${req.query.registered ? `<div class="alert alert-success">Registration submitted! Pending admin approval.</div>` : ''}
          <form action="/api/login" method="POST">
            <input type="hidden" name="expectedRole" value="RESIDENT">
            <div class="mb-3">
              <label class="form-label">Username or Email</label>
              <input type="text" name="username" class="form-control" required>
            </div>
            <div class="mb-3">
              <label class="form-label">Password</label>
              <input type="password" name="password" class="form-control" required>
            </div>
            <button type="submit" class="btn btn-gov w-100 py-2 fw-bold">Sign In</button>
          </form>
          <div class="text-center mt-3">
            <a href="/resident-register">Don't have an account? Register here</a>
          </div>
        </div>
      </div>
    </div>
  `));
});

// Staff Login Page
app.get('/staff-login', (req, res) => {
  res.send(renderBaseHTML('Staff Login', `
    <div class="row justify-content-center py-5">
      <div class="col-md-5">
        <div class="card card-custom p-4">
          <h3 class="fw-bold mb-3 text-center text-success">Staff Portal Access</h3>
          ${req.query.error ? `<div class="alert alert-danger">${req.query.error}</div>` : ''}
          <form action="/api/login" method="POST">
            <input type="hidden" name="expectedRole" value="STAFF">
            <div class="mb-3">
              <label class="form-label">Staff Username</label>
              <input type="text" name="username" class="form-control" required>
            </div>
            <div class="mb-3">
              <label class="form-label">Password</label>
              <input type="password" name="password" class="form-control" required>
            </div>
            <button type="submit" class="btn btn-success w-100 py-2 fw-bold">Sign In to Staff Portal</button>
          </form>
        </div>
      </div>
    </div>
  `));
});

// Admin Login Page
app.get('/admin-login', (req, res) => {
  res.send(renderBaseHTML('Admin Login', `
    <div class="row justify-content-center py-5">
      <div class="col-md-5">
        <div class="card card-custom p-4">
          <h3 class="fw-bold mb-3 text-center text-danger">Admin Portal Access</h3>
          ${req.query.error ? `<div class="alert alert-danger">${req.query.error}</div>` : ''}
          <form action="/api/login" method="POST">
            <input type="hidden" name="expectedRole" value="ADMIN">
            <div class="mb-3">
              <label class="form-label">Admin Username</label>
              <input type="text" name="username" class="form-control" required>
            </div>
            <div class="mb-3">
              <label class="form-label">Password</label>
              <input type="password" name="password" class="form-control" required>
            </div>
            <button type="submit" class="btn btn-danger w-100 py-2 fw-bold">Sign In to Admin Portal</button>
          </form>
        </div>
      </div>
    </div>
  `));
});

// Unified Login Endpoint
app.post('/api/login', async (req, res) => {
  const { username, password, expectedRole } = req.body;
  try {
    const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.redirect(`/${expectedRole.toLowerCase()}-login?error=Invalid username or password`);
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.redirect(`/${expectedRole.toLowerCase()}-login?error=Invalid username or password`);
    }

    if (user.role !== expectedRole) {
      return res.redirect(`/${expectedRole.toLowerCase()}-login?error=Unauthorized role portal attempt`);
    }

    if (user.status !== 'ACTIVE') {
      return res.redirect(`/${expectedRole.toLowerCase()}-login?error=Account is ${user.status.toLowerCase()}. Please contact administrator.`);
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;

    if (user.role === 'RESIDENT') {
      const resResult = await db.query('SELECT id, status FROM residents WHERE user_id = $1', [user.id]);
      if (resResult.rows.length > 0) {
        req.session.residentId = resResult.rows[0].id;
      }
    }

    await logActivity(user.id, user.username, user.role, 'LOGIN', 'User logged in successfully.');

    if (user.role === 'ADMIN') return res.redirect('/admin/dashboard');
    if (user.role === 'STAFF') return res.redirect('/staff/dashboard');
    return res.redirect('/resident/dashboard');

  } catch (err) {
    console.error('Login error:', err);
    res.redirect(`/${expectedRole.toLowerCase()}-login?error=System error encountered`);
  }
});

// Logout Route
app.get('/logout', async (req, res) => {
  if (req.session) {
    await logActivity(req.session.userId, req.session.username, req.session.role, 'LOGOUT', 'User logged out.');
    req.session.destroy();
  }
  res.redirect('/');
});

// Resident Registration Page
app.get('/resident-register', (req, res) => {
  res.send(renderBaseHTML('Resident Registration', `
    <div class="row justify-content-center py-4">
      <div class="col-md-9">
        <div class="card card-custom p-4">
          <h2 class="fw-bold text-center mb-4">Barangay Resident Registration</h2>
          <form action="/api/resident-register" method="POST" enctype="multipart/form-data">
            
            <h5 class="text-primary border-bottom pb-2 mb-3">1. Account Information</h5>
            <div class="row g-3 mb-4">
              <div class="col-md-6">
                <label class="form-label">Username *</label>
                <input type="text" name="username" class="form-control" required>
              </div>
              <div class="col-md-6">
                <label class="form-label">Password *</label>
                <input type="password" name="password" class="form-control" required>
              </div>
            </div>

            <h5 class="text-primary border-bottom pb-2 mb-3">2. Personal Details</h5>
            <div class="row g-3 mb-3">
              <div class="col-md-3">
                <label class="form-label">First Name *</label>
                <input type="text" name="first_name" class="form-control" required>
              </div>
              <div class="col-md-3">
                <label class="form-label">Middle Name</label>
                <input type="text" name="middle_name" class="form-control">
              </div>
              <div class="col-md-3">
                <label class="form-label">Last Name *</label>
                <input type="text" name="last_name" class="form-control" required>
              </div>
              <div class="col-md-3">
                <label class="form-label">Suffix (Jr, Sr, III)</label>
                <input type="text" name="suffix" class="form-control">
              </div>
            </div>

            <div class="row g-3 mb-3">
              <div class="col-md-3">
                <label class="form-label">Birthdate *</label>
                <input type="date" name="birthdate" class="form-control" required>
              </div>
              <div class="col-md-3">
                <label class="form-label">Sex *</label>
                <select name="sex" class="form-select" required>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label">Civil Status *</label>
                <select name="civil_status" class="form-select" required>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Widowed">Widowed</option>
                  <option value="Separated">Separated</option>
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label">Nationality</label>
                <input type="text" name="nationality" class="form-control" value="Filipino">
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label">Complete Address *</label>
              <textarea name="address" class="form-control" rows="2" required></textarea>
            </div>

            <div class="row g-3 mb-4">
              <div class="col-md-4">
                <label class="form-label">Contact Number *</label>
                <input type="text" name="contact_number" class="form-control" required>
              </div>
              <div class="col-md-4">
                <label class="form-label">Email Address</label>
                <input type="email" name="email" class="form-control">
              </div>
              <div class="col-md-4">
                <label class="form-label">Occupation</label>
                <input type="text" name="occupation" class="form-control">
              </div>
            </div>

            <h5 class="text-primary border-bottom pb-2 mb-3">3. Status & Classifications</h5>
            <div class="row g-3 mb-4">
              <div class="col-md-3">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" name="is_voter" value="true" id="voterCheck">
                  <label class="form-check-label" for="voterCheck">Registered Voter</label>
                </div>
              </div>
              <div class="col-md-3">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" name="is_pwd" value="true" id="pwdCheck">
                  <label class="form-check-label" for="pwdCheck">PWD Person</label>
                </div>
              </div>
              <div class="col-md-3">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" name="is_4ps" value="true" id="4psCheck">
                  <label class="form-check-label" for="4psCheck">4Ps Beneficiary</label>
                </div>
              </div>
            </div>

            <h5 class="text-primary border-bottom pb-2 mb-3">4. Emergency Contact & Verification Docs</h5>
            <div class="row g-3 mb-3">
              <div class="col-md-6">
                <label class="form-label">Emergency Contact Name</label>
                <input type="text" name="emergency_contact_name" class="form-control">
              </div>
              <div class="col-md-6">
                <label class="form-label">Emergency Contact Number</label>
                <input type="text" name="emergency_contact_number" class="form-control">
              </div>
            </div>

            <div class="row g-3 mb-4">
              <div class="col-md-6">
                <label class="form-label">Resident Photo (JPG/PNG)</label>
                <input type="file" name="photo" class="form-control" accept="image/*">
              </div>
              <div class="col-md-6">
                <label class="form-label">Valid ID Document (JPG/PNG/PDF)</label>
                <input type="file" name="valid_id" class="form-control" accept="image/*,.pdf">
              </div>
            </div>

            <button type="submit" class="btn btn-gov w-100 py-3 fw-bold fs-5">Submit Resident Registration</button>
          </form>
        </div>
      </div>
    </div>
  `));
});

// Handle Registration API
app.post('/api/resident-register', upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'valid_id', maxCount: 1 }]), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { username, password, first_name, middle_name, last_name, suffix, birthdate, sex, civil_status, address, contact_number, email, occupation, nationality, is_voter, is_pwd, is_4ps, emergency_contact_name, emergency_contact_number } = req.body;

    const userCheck = await client.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).send(renderErrorPage('Registration Error', 'Username already exists.'));
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userRes = await client.query(
      "INSERT INTO users (username, password_hash, role, status) VALUES ($1, $2, 'RESIDENT', 'PENDING') RETURNING id",
      [username, passwordHash]
    );
    const userId = userRes.rows[0].id;

    const photoUrl = req.files && req.files['photo'] ? `/uploads/${req.files['photo'][0].filename}` : null;
    const validIdUrl = req.files && req.files['valid_id'] ? `/uploads/${req.files['valid_id'][0].filename}` : null;

    const age = calculateAge(birthdate);
    const isSenior = age >= 60;

    await client.query(`
      INSERT INTO residents (
        user_id, first_name, middle_name, last_name, suffix, birthdate, sex, civil_status,
        address, contact_number, email, occupation, nationality, is_voter, is_pwd, is_senior, is_4ps,
        emergency_contact_name, emergency_contact_number, photo_url, valid_id_url, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 'PENDING')
    `, [
      userId, first_name, middle_name, last_name, suffix, birthdate, sex, civil_status,
      address, contact_number, email, occupation, nationality || 'Filipino',
      is_voter === 'true', is_pwd === 'true', isSenior, is_4ps === 'true',
      emergency_contact_name, emergency_contact_number, photoUrl, validIdUrl
    ]);

    await client.query('COMMIT');
    await logActivity(userId, username, 'RESIDENT', 'REGISTER', 'New resident submitted registration.');
    res.redirect('/resident-login?registered=true');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Registration Exception:', err);
    res.status(500).send(renderErrorPage('Server Error', 'Failed to complete registration process.'));
  } finally {
    client.release();
  }
});

// ==========================================
// RESIDENT PORTAL ROUTES
// ==========================================

app.get('/resident/dashboard', requireAuth, requireResident, async (req, res) => {
  try {
    const residentRes = await db.query('SELECT * FROM residents WHERE user_id = $1', [req.session.userId]);
    const resident = residentRes.rows[0];

    if (!resident) {
      return res.send(renderBaseHTML('Pending Approval', `
        <div class="alert alert-warning py-4">Your resident application is currently undergoing admin review. Please check back later.</div>
      `, 'resident', req.session));
    }

    const pendingDocs = await db.query("SELECT COUNT(*) FROM document_requests WHERE resident_id = $1 AND status != 'Completed'", [resident.id]);
    const unreadNotifs = await db.query("SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false", [req.session.userId]);
    const announcements = await db.query("SELECT * FROM announcements WHERE is_published = true ORDER BY created_at DESC LIMIT 3");

    res.send(renderBaseHTML('Resident Dashboard', `
      <div class="card card-custom p-4 mb-4">
        <div class="d-flex align-items-center gap-3">
          <img src="${resident.photo_url || 'https://via.placeholder.com/100'}" class="rounded-circle border" width="80" height="80" style="object-fit:cover;">
          <div>
            <h3 class="fw-bold mb-1">Welcome, ${resident.first_name} ${resident.last_name}!</h3>
            <p class="text-muted mb-0">Resident ID: <strong>${resident.resident_id_number || 'Pending Approval'}</strong> | Status: <span class="badge bg-${resident.status === 'APPROVED' ? 'success' : 'warning'}">${resident.status}</span></p>
          </div>
        </div>
      </div>

      <div class="row g-3 mb-4">
        <div class="col-md-4">
          <div class="card card-custom p-3 border-start border-primary border-4">
            <div class="text-muted">Pending Document Requests</div>
            <div class="display-6 fw-bold text-primary">${pendingDocs.rows[0].count}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card card-custom p-3 border-start border-warning border-4">
            <div class="text-muted">Unread Notifications</div>
            <div class="display-6 fw-bold text-warning">${unreadNotifs.rows[0].count}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card card-custom p-3 border-start border-success border-4">
            <div class="text-muted">Calculated Age</div>
            <div class="display-6 fw-bold text-success">${calculateAge(resident.birthdate)} yrs</div>
          </div>
        </div>
      </div>

      <div class="card card-custom p-4">
        <h4 class="fw-bold mb-3"><i class="bi bi-megaphone me-2"></i>Barangay Announcements</h4>
        ${announcements.rows.map(a => `
          <div class="border-bottom pb-3 mb-3">
            <h5 class="fw-bold">${a.title}</h5>
            <small class="text-muted">${new Date(a.created_at).toLocaleDateString()}</small>
            <p class="mt-2 mb-0">${a.content}</p>
          </div>
        `).join('') || '<p class="text-muted">No recent announcements.</p>'}
      </div>
    `, 'resident', req.session));

  } catch (err) {
    console.error(err);
    res.status(500).send(renderErrorPage('Error', 'Failed to load dashboard.'));
  }
});

app.get('/resident/profile', requireAuth, requireResident, async (req, res) => {
  const residentRes = await db.query('SELECT * FROM residents WHERE user_id = $1', [req.session.userId]);
  const resident = residentRes.rows[0];
  const age = calculateAge(resident.birthdate);

  res.send(renderBaseHTML('My Profile', `
    <div class="card card-custom p-4">
      <h3 class="fw-bold mb-4">My Resident Profile</h3>
      <div class="row g-3">
        <div class="col-md-4 text-center">
          <img src="${resident.photo_url || 'https://via.placeholder.com/150'}" class="img-thumbnail rounded mb-3" style="max-height: 200px;">
          <br>
          <span class="badge bg-primary fs-6">${resident.resident_id_number || 'Unassigned'}</span>
        </div>
        <div class="col-md-8">
          <table class="table table-striped">
            <tr><th>Full Name:</th><td>${resident.first_name} ${resident.middle_name || ''} ${resident.last_name} ${resident.suffix || ''}</td></tr>
            <tr><th>Birthdate / Age:</th><td>${new Date(resident.birthdate).toLocaleDateString()} (${age} years old)</td></tr>
            <tr><th>Sex:</th><td>${resident.sex}</td></tr>
            <tr><th>Civil Status:</th><td>${resident.civil_status}</td></tr>
            <tr><th>Address:</th><td>${resident.address}</td></tr>
            <tr><th>Contact:</th><td>${resident.contact_number}</td></tr>
            <tr><th>Email:</th><td>${resident.email || 'N/A'}</td></tr>
            <tr><th>Classifications:</th><td>
              ${resident.is_voter ? '<span class="badge bg-info me-1">Voter</span>' : ''}
              ${resident.is_senior ? '<span class="badge bg-warning me-1">Senior</span>' : ''}
              ${resident.is_pwd ? '<span class="badge bg-danger me-1">PWD</span>' : ''}
              ${resident.is_4ps ? '<span class="badge bg-success me-1">4Ps</span>' : ''}
            </td></tr>
          </table>
        </div>
      </div>
    </div>
  `, 'resident', req.session));
});

// Digital Resident ID Card & QR Display
app.get('/resident/id', requireAuth, requireResident, async (req, res) => {
  const residentRes = await db.query('SELECT * FROM residents WHERE user_id = $1', [req.session.userId]);
  const resident = residentRes.rows[0];

  if (resident.status !== 'APPROVED') {
    return res.send(renderBaseHTML('Digital ID', '<div class="alert alert-info">Your account must be APPROVED by admin before generating Digital ID and QR code.</div>', 'resident', req.session));
  }

  const qrDataUrl = await QRCode.toDataURL(resident.qr_token || 'INVALID');

  res.send(renderBaseHTML('Digital Resident ID', `
    <div class="d-flex flex-column align-items-center py-4">
      <div class="id-card-wrap mb-4" id="printableCard">
        <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
          <div>
            <h6 class="fw-bold mb-0 text-uppercase">Republic of the Philippines</h6>
            <small>Barangay Resident Identity Card</small>
          </div>
          <i class="bi bi-shield-fill-check display-6"></i>
        </div>
        <div class="row align-items-center">
          <div class="col-4 text-center">
            <img src="${resident.photo_url || 'https://via.placeholder.com/100'}" class="rounded border border-2 border-white" width="90" height="90" style="object-fit:cover;">
          </div>
          <div class="col-8">
            <h5 class="fw-bold mb-1">${resident.first_name} ${resident.last_name}</h5>
            <small class="d-block text-light">ID: ${resident.resident_id_number}</small>
            <small class="d-block text-light">${resident.address}</small>
          </div>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-3 pt-2 border-top">
          <img src="${qrDataUrl}" width="65" height="65" class="bg-white p-1 rounded">
          <div class="text-end">
            <span class="badge bg-success">OFFICIAL VERIFIED</span>
          </div>
        </div>
      </div>

      <button onclick="window.print()" class="btn btn-gov no-print"><i class="bi bi-printer me-2"></i>Print Digital ID Card</button>
    </div>
  `, 'resident', req.session));
});

// Document Request Page for Residents
app.get('/resident/documents', requireAuth, requireResident, async (req, res) => {
  const residentRes = await db.query('SELECT id FROM residents WHERE user_id = $1', [req.session.userId]);
  const residentId = residentRes.rows[0].id;

  const docTypes = await db.query('SELECT * FROM document_types WHERE is_active = true');
  const myRequests = await db.query(`
    SELECT dr.*, dt.title as doc_title 
    FROM document_requests dr 
    JOIN document_types dt ON dr.document_type_id = dt.id 
    WHERE dr.resident_id = $1 ORDER BY dr.created_at DESC
  `, [residentId]);

  res.send(renderBaseHTML('Request Documents', `
    <div class="row g-4">
      <div class="col-md-5">
        <div class="card card-custom p-4">
          <h4 class="fw-bold mb-3">New Document Request</h4>
          <form action="/api/resident/request-document" method="POST" enctype="multipart/form-data">
            <div class="mb-3">
              <label class="form-label">Document Type *</label>
              <select name="document_type_id" class="form-select" required>
                ${docTypes.rows.map(d => `<option value="${d.id}">${d.title} (Fee: ₱${d.fee})</option>`).join('')}
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label">Purpose *</label>
              <textarea name="purpose" class="form-control" rows="3" required placeholder="Specify purpose of clearance/certificate"></textarea>
            </div>
            <div class="mb-3">
              <label class="form-label">Upload Requirement Document (JPG/PNG/PDF)</label>
              <input type="file" name="requirements" class="form-control" accept="image/*,.pdf">
            </div>
            <button type="submit" class="btn btn-gov w-100 fw-bold">Submit Document Request</button>
          </form>
        </div>
      </div>

      <div class="col-md-7">
        <div class="card card-custom p-4">
          <h4 class="fw-bold mb-3">My Request History</h4>
          <div class="table-responsive">
            <table class="table table-hover align-middle">
              <thead>
                <tr>
                  <th>Req #</th>
                  <th>Document</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${myRequests.rows.map(r => `
                  <tr>
                    <td><small class="fw-bold">${r.request_number}</small></td>
                    <td>${r.doc_title}</td>
                    <td><span class="badge bg-${r.status === 'Completed' ? 'success' : r.status === 'Approved' ? 'primary' : 'warning'}">${r.status}</span></td>
                    <td><small>${new Date(r.created_at).toLocaleDateString()}</small></td>
                  </tr>
                `).join('') || '<tr><td colspan="4" class="text-center text-muted">No requests found.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `, 'resident', req.session));
});

// Post Request API
app.post('/api/resident/request-document', requireAuth, requireResident, upload.single('requirements'), async (req, res) => {
  try {
    const residentRes = await db.query('SELECT id FROM residents WHERE user_id = $1', [req.session.userId]);
    const residentId = residentRes.rows[0].id;
    const { document_type_id, purpose } = req.body;
    const reqNum = 'REQ-' + Date.now().toString().slice(-6);
    const reqFileUrl = req.file ? `/uploads/${req.file.filename}` : null;

    await db.query(`
      INSERT INTO document_requests (request_number, resident_id, document_type_id, purpose, requirements_file_url)
      VALUES ($1, $2, $3, $4, $5)
    `, [reqNum, residentId, document_type_id, purpose, reqFileUrl]);

    await logActivity(req.session.userId, req.session.username, 'RESIDENT', 'REQUEST_DOCUMENT', `Requested document req #${reqNum}`);
    res.redirect('/resident/documents');
  } catch (err) {
    console.error(err);
    res.status(500).send(renderErrorPage('Error', 'Failed to process document request.'));
  }
});

// Household Profile View for Resident
app.get('/resident/household', requireAuth, requireResident, async (req, res) => {
  const residentRes = await db.query('SELECT id FROM residents WHERE user_id = $1', [req.session.userId]);
  const residentId = residentRes.rows[0].id;

  const hhRes = await db.query(`
    SELECT h.*, hm.relationship_to_head 
    FROM household_members hm 
    JOIN households h ON hm.household_id = h.id 
    WHERE hm.resident_id = $1
  `, [residentId]);

  if (hhRes.rows.length === 0) {
    return res.send(renderBaseHTML('Household Information', `
      <div class="card card-custom p-4 text-center">
        <h4>No Household Profile Assigned</h4>
        <p class="text-muted">You are currently not associated with a registered household record in the barangay database.</p>
      </div>
    `, 'resident', req.session));
  }

  const household = hhRes.rows[0];
  const members = await db.query(`
    SELECT r.first_name, r.last_name, hm.relationship_to_head 
    FROM household_members hm 
    JOIN residents r ON hm.resident_id = r.id 
    WHERE hm.household_id = $1
  `, [household.id]);

  res.send(renderBaseHTML('Household Profile', `
    <div class="card card-custom p-4">
      <h3 class="fw-bold mb-3">Household #: ${household.household_number}</h3>
      <p class="text-muted">Address: ${household.address}</p>
      
      <h5 class="fw-bold mt-4 mb-3">Household Members</h5>
      <ul class="list-group">
        ${members.rows.map(m => `
          <li class="list-group-item d-flex justify-content-between align-items-center">
            ${m.first_name}${m.last_name}
            <span class="badge bg-secondary">${m.relationship_to_head}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  `, 'resident', req.session));
});

// Notifications View
app.get('/resident/notifications', requireAuth, requireResident, async (req, res) => {
  const notifs = await db.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [req.session.userId]);
  await db.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.session.userId]);

  res.send(renderBaseHTML('Notifications', `
    <div class="card card-custom p-4">
      <h3 class="fw-bold mb-3">System Notifications</h3>
      <div class="list-group">
        ${notifs.rows.map(n => `
          <div class="list-group-item">
            <h6 class="fw-bold mb-1">${n.title}</h6>
            <p class="mb-1">${n.message}</p>
            <small class="text-muted">${new Date(n.created_at).toLocaleString()}</small>
          </div>
        `).join('') || '<div class="text-muted p-3 text-center">No notifications available.</div>'}
      </div>
    </div>
  `, 'resident', req.session));
});

// Resident Concerns & Feedback View
app.get('/resident/concerns', requireAuth, requireResident, async (req, res) => {
  const residentRes = await db.query('SELECT id FROM residents WHERE user_id = $1', [req.session.userId]);
  const residentId = residentRes.rows[0].id;

  const concerns = await db.query('SELECT * FROM resident_concerns WHERE resident_id = $1 ORDER BY created_at DESC', [residentId]);

  res.send(renderBaseHTML('Resident Concerns', `
    <div class="row g-4">
      <div class="col-md-5">
        <div class="card card-custom p-4">
          <h4 class="fw-bold mb-3">Submit Concern / Feedback</h4>
          <form action="/api/resident/submit-concern" method="POST">
            <div class="mb-3">
              <label class="form-label">Subject *</label>
              <input type="text" name="subject" class="form-control" required>
            </div>
            <div class="mb-3">
              <label class="form-label">Detailed Description *</label>
              <textarea name="description" class="form-control" rows="4" required></textarea>
            </div>
            <button type="submit" class="btn btn-gov w-100 fw-bold">Submit Concern</button>
          </form>
        </div>
      </div>

      <div class="col-md-7">
        <div class="card card-custom p-4">
          <h4 class="fw-bold mb-3">Submitted Concerns History</h4>
          <div class="list-group">
            ${concerns.rows.map(c => `
              <div class="list-group-item">
                <div class="d-flex justify-content-between">
                  <h6 class="fw-bold">${c.subject}</h6>
                  <span class="badge bg-info">${c.status}</span>
                </div>
                <p class="mb-1">${c.description}</p>${c.response ? `<div class="bg-light p-2 rounded mt-2"><small><strong>Response:</strong> ${c.response}</small></div>` : ''}
              </div>
            `).join('') || '<p class="text-muted">No concerns recorded.</p>'}
          </div>
        </div>
      </div>
    </div>
  `, 'resident', req.session));
});

app.post('/api/resident/submit-concern', requireAuth, requireResident, async (req, res) => {
  const residentRes = await db.query('SELECT id FROM residents WHERE user_id = $1', [req.session.userId]);
  const residentId = residentRes.rows[0].id;
  const { subject, description } = req.body;

  await db.query('INSERT INTO resident_concerns (resident_id, subject, description) VALUES ($1, $2, $3)', [residentId, subject, description]);
  res.redirect('/resident/concerns');
});

// ==========================================
// ADMIN PORTAL ROUTES
// ==========================================

app.get('/admin/dashboard', requireAuth, requireAdmin, async (req, res) => {
  const totalResidents = await db.query('SELECT COUNT(*) FROM residents');
  const pendingRegs = await db.query("SELECT COUNT(*) FROM residents WHERE status = 'PENDING'");
  const totalHouseholds = await db.query('SELECT COUNT(*) FROM households');
  const pendingDocs = await db.query("SELECT COUNT(*) FROM document_requests WHERE status = 'Pending'");
  const openBlotters = await db.query("SELECT COUNT(*) FROM blotter_records WHERE status = 'Open'");

  res.send(renderBaseHTML('Admin Dashboard', `
    <h2 class="fw-bold mb-4">Barangay Administration Dashboard</h2>
    
    <div class="row g-3 mb-4">
      <div class="col-md-3">
        <div class="card card-custom p-3 border-start border-primary border-4">
          <div class="text-muted">Total Residents</div>
          <div class="display-6 fw-bold text-primary">${totalResidents.rows[0].count}</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card card-custom p-3 border-start border-warning border-4">
          <div class="text-muted">Pending Registrations</div>
          <div class="display-6 fw-bold text-warning">${pendingRegs.rows[0].count}</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card card-custom p-3 border-start border-success border-4">
          <div class="text-muted">Households</div>
          <div class="display-6 fw-bold text-success">${totalHouseholds.rows[0].count}</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card card-custom p-3 border-start border-danger border-4">
          <div class="text-muted">Pending Document Requests</div>
          <div class="display-6 fw-bold text-danger">${pendingDocs.rows[0].count}</div>
        </div>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-md-6">
        <div class="card card-custom p-4">
          <h5 class="fw-bold mb-3">Quick Navigation</h5>
          <div class="d-grid gap-2">
            <a href="/admin/residents" class="btn btn-outline-primary text-start"><i class="bi bi-people me-2"></i>Manage Resident Approvals & Records</a>
            <a href="/admin/document-requests" class="btn btn-outline-success text-start"><i class="bi bi-file-earmark-check me-2"></i>Process Document Requests (${pendingDocs.rows[0].count})</a>
            <a href="/admin/blotter" class="btn btn-outline-danger text-start"><i class="bi bi-shield-exclamation me-2"></i>View Active Blotter Cases (${openBlotters.rows[0].count})</a>
          </div>
        </div>
      </div>

      <div class="col-md-6">
        <div class="card card-custom p-4">
          <h5 class="fw-bold mb-3">System Information</h5>
          <p class="mb-1"><strong>Environment:</strong> ${process.env.NODE_ENV || 'Production/Render'}</p>
          <p class="mb-1"><strong>Database:</strong> PostgreSQL Persistent Engine</p>
          <p class="mb-0"><strong>Status:</strong> Active & Fully Operational</p>
        </div>
      </div>
    </div>
  `, 'admin', req.session));
});

// Admin Resident Management
app.get('/admin/residents', requireAuth, requireAdmin, async (req, res) => {
  const search = req.query.search || '';
  const filterStatus = req.query.status || '';

  let query = 'SELECT * FROM residents WHERE 1=1';
  let params = [];

  if (search) {
    params.push(`%${search}%`);
    query += ` AND (first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR resident_id_number ILIKE $${params.length})`;
  }

  if (filterStatus) {
    params.push(filterStatus);
    query += ` AND status = $${params.length}`;
  }

  query += ' ORDER BY created_at DESC';
  const residents = await db.query(query, params);

  res.send(renderBaseHTML('Resident Management', `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h3 class="fw-bold mb-0">Resident Database Management</h3>
      </div>

      <form method="GET" action="/admin/residents" class="row g-2 mb-4">
        <div class="col-md-6">
          <input type="text" name="search" class="form-control" placeholder="Search by name or Resident ID..." value="${search}">
        </div>
        <div class="col-md-4">
          <select name="status" class="form-select">
            <option value="">All Statuses</option>
            <option value="PENDING" ${filterStatus === 'PENDING' ? 'selected' : ''}>PENDING</option>
            <option value="APPROVED" ${filterStatus === 'APPROVED' ? 'selected' : ''}>APPROVED</option>
            <option value="REJECTED" ${filterStatus === 'REJECTED' ? 'selected' : ''}>REJECTED</option>
          </select>
        </div>
        <div class="col-md-2">
          <button type="submit" class="btn btn-gov w-100">Filter</button>
        </div>
      </form>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead>
            <tr>
              <th>ID Number</th>
              <th>Full Name</th>
              <th>Sex</th>
              <th>Contact</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${residents.rows.map(r => `
              <tr>
                <td><strong>${r.resident_id_number || 'N/A'}</strong></td>
                <td>${r.first_name}${r.last_name}</td>
                <td>${r.sex}</td>
                <td>${r.contact_number}</td>
                <td><span class="badge bg-${r.status === 'APPROVED' ? 'success' : r.status === 'PENDING' ? 'warning' : 'danger'}">${r.status}</span></td>
                <td>
                  ${r.status === 'PENDING' ? `
                    <a href="/api/admin/approve-resident/${r.id}" class="btn btn-sm btn-success me-1">Approve</a>
                    <a href="/api/admin/reject-resident/${r.id}" class="btn btn-sm btn-danger me-1">Reject</a>
                  ` : ''}
                  <a href="/admin/residents/${r.id}" class="btn btn-sm btn-outline-primary">View/Edit</a>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="6" class="text-center text-muted">No resident records found.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `, 'admin', req.session));
});

// Admin Approve Resident
app.get('/api/admin/approve-resident/:id', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const residentId = req.params.id;

    // Generate Unique Resident ID
    const year = new Date().getFullYear();
    const resIdNumber = `BRGY-${year}-${String(residentId).padStart(6, '0')}`;
    const qrToken = `BRGY-QR-${Date.now()}-${Math.floor(Math.random()*1000)}`;

    const residentRes = await client.query(`
      UPDATE residents 
      SET status = 'APPROVED', resident_id_number = $1, qr_token = $2 
      WHERE id = $3 RETURNING user_id
    `, [resIdNumber, qrToken, residentId]);

    const userId = residentRes.rows[0]?.user_id;
    if (userId) {
      await client.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [userId]);
      await client.query(
        "INSERT INTO notifications (user_id, title, message) VALUES ($1, 'Account Approved', 'Your resident account registration has been approved!')",
        [userId]
      );
    }

    await client.query('COMMIT');
    await logActivity(req.session.userId, req.session.username, 'ADMIN', 'APPROVE_RESIDENT', `Approved resident ID ${residentId}`);
    res.redirect('/admin/residents');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).send(renderErrorPage('Error', 'Failed to approve resident.'));
  } finally {
    client.release();
  }
});

// Admin Document Processing
app.get('/admin/document-requests', requireAuth, requireAdmin, async (req, res) => {
  const requests = await db.query(`
    SELECT dr.*, r.first_name, r.last_name, dt.title as doc_title
    FROM document_requests dr
    JOIN residents r ON dr.resident_id = r.id
    JOIN document_types dt ON dr.document_type_id = dt.id
    ORDER BY dr.created_at DESC
  `);

  res.send(renderBaseHTML('Document Processing', `
    <div class="card card-custom p-4">
      <h3 class="fw-bold mb-4">Document Request Processing</h3>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead>
            <tr>
              <th>Req #</th>
              <th>Resident Name</th>
              <th>Document</th>
              <th>Purpose</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${requests.rows.map(r => `
              <tr>
                <td><strong>${r.request_number}</strong></td>
                <td>${r.first_name}${r.last_name}</td>
                <td>${r.doc_title}</td>
                <td>${r.purpose}</td>
                <td><span class="badge bg-${r.status === 'Completed' ? 'success' : 'warning'}">${r.status}</span></td>
                <td>
                  <form action="/api/admin/update-doc-status" method="POST" class="d-flex gap-1">
                    <input type="hidden" name="request_id" value="${r.id}">
                    <select name="status" class="form-select form-select-sm" style="width: auto;">
                      <option value="Pending" ${r.status === 'Pending' ? 'selected' : ''}>Pending</option>
                      <option value="Approved" ${r.status === 'Approved' ? 'selected' : ''}>Approved</option>
                      <option value="Completed" ${r.status === 'Completed' ? 'selected' : ''}>Completed</option>
                      <option value="Rejected" ${r.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
                    </select>
                    <button type="submit" class="btn btn-sm btn-gov">Update</button>
                    ${r.status === 'Completed' || r.status === 'Approved' ? `<a href="/admin/print-document/${r.id}" target="_blank" class="btn btn-sm btn-outline-secondary"><i class="bi bi-printer"></i></a>` : ''}
                  </form>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="6" class="text-center text-muted">No document requests found.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `, 'admin', req.session));
});

app.post('/api/admin/update-doc-status', requireAuth, requireAdmin, async (req, res) => {
  const { request_id, status } = req.body;
  await db.query('UPDATE document_requests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, request_id]);
  await logActivity(req.session.userId, req.session.username, 'ADMIN', 'UPDATE_DOC_STATUS', `Updated document req ${request_id} to ${status}`);
  res.redirect('/admin/document-requests');
});

// Document Printable Generation
app.get('/admin/print-document/:id', requireAuth, requireStaff, async (req, res) => {
  const reqRes = await db.query(`
    SELECT dr.*, r.first_name, r.middle_name, r.last_name, r.address, dt.title as doc_title
    FROM document_requests dr
    JOIN residents r ON dr.resident_id = r.id
    JOIN document_types dt ON dr.document_type_id = dt.id
    WHERE dr.id = $1
  `, [req.params.id]);

  if (reqRes.rows.length === 0) return res.status(404).send('Document not found');

  const doc = reqRes.rows[0];
  const settings = (await db.query('SELECT * FROM system_settings LIMIT 1')).rows[0];

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Official Document - ${doc.doc_title}</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
      <style>
        body { padding: 40px; font-family: 'Times New Roman', Times, serif; }
        .cert-border { border: 10px double #0a3663; padding: 40px; height: 90vh; }
      </style>
    </head>
    <body onload="window.print()">
      <div class="cert-border text-center">
        <h4 class="fw-bold text-uppercase">Republic of the Philippines</h4>
        <h3 class="fw-bold text-uppercase">${settings.barangay_name}</h3>
        <p>${settings.address}</p>
        <hr class="my-4">
        
        <h1 class="fw-bold my-5 text-uppercase">${doc.doc_title}</h1>
        
        <p class="fs-5 text-start lh-lg my-5">
          TO WHOM IT MAY CONCERN:<br><br>
          This is to certify that <strong>${doc.first_name} ${doc.middle_name || ''} ${doc.last_name}</strong>, legal age, residing at <strong>${doc.address}</strong>, is a bonafide resident of this barangay.<br><br>
          This certification is issued upon request for the purpose of: <strong>${doc.purpose}</strong>.
        </p>

        <div class="row mt-5 pt-5">
          <div class="col-6 text-start">
            <small>Document #: ${doc.request_number}</small><br>
            <small>Date Issued: ${new Date().toLocaleDateString()}</small>
          </div>
          <div class="col-6 text-center">
            <div class="border-bottom border-dark mb-1 fw-bold">PUNONG BARANGAY</div>
            <small>Authorized Official Signature</small>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Household Management Route
app.get('/admin/households', requireAuth, requireAdmin, async (req, res) => {
  const households = await db.query(`
    SELECT h.*, r.first_name, r.last_name, (SELECT COUNT(*) FROM household_members WHERE household_id = h.id) as total_members
    FROM households h
    LEFT JOIN residents r ON h.head_resident_id = r.id
  `);

  res.send(renderBaseHTML('Household Management', `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h3 class="fw-bold mb-0">Barangay Household Records</h3>
        <button class="btn btn-gov" data-bs-toggle="modal" data-bs-target="#addHouseholdModal">+ Create Household</button>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead>
            <tr>
              <th>HH Number</th>
              <th>Address</th>
              <th>Head of Family</th>
              <th>Members</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${households.rows.map(h => `
              <tr>
                <td><strong>${h.household_number}</strong></td>
                <td>${h.address}</td>
                <td>${h.first_name ? `${h.first_name} ${h.last_name}` : 'Unassigned'}</td>
                <td><span class="badge bg-secondary">${h.total_members} Members</span></td>
                <td><button class="btn btn-sm btn-outline-primary">View Details</button></td>
              </tr>
            `).join('') || '<tr><td colspan="5" class="text-center text-muted">No households registered.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal -->
    <div class="modal fade" id="addHouseholdModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/admin/create-household" method="POST">
            <div class="modal-header">
              <h5 class="modal-title fw-bold">Create New Household</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Household Number *</label>
                <input type="text" name="household_number" class="form-control" required placeholder="HH-2026-001">
              </div>
              <div class="mb-3">
                <label class="form-label">Address *</label>
                <textarea name="address" class="form-control" required></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-gov">Save Household</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `, 'admin', req.session));
});

app.post('/api/admin/create-household', requireAuth, requireAdmin, async (req, res) => {
  const { household_number, address } = req.body;
  await db.query('INSERT INTO households (household_number, address) VALUES ($1, $2)', [household_number, address]);
  res.redirect('/admin/households');
});

// Blotter Records Management
app.get('/admin/blotter', requireAuth, requireAdmin, async (req, res) => {
  const blotters = await db.query('SELECT * FROM blotter_records ORDER BY created_at DESC');

  res.send(renderBaseHTML('Blotter Management', `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h3 class="fw-bold mb-0">Barangay Incident & Blotter Records</h3>
        <button class="btn btn-danger" data-bs-toggle="modal" data-bs-target="#addBlotterModal">+ File New Incident</button>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead>
            <tr>
              <th>Case #</th>
              <th>Complainant</th>
              <th>Respondent</th>
              <th>Incident Type</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${blotters.rows.map(b => `
              <tr>
                <td><strong>${b.case_number}</strong></td>
                <td>${b.complainant_name}</td>
                <td>${b.respondent_name}</td>
                <td>${b.incident_type}</td>
                <td><span class="badge bg-${b.status === 'Open' ? 'danger' : 'success'}">${b.status}</span></td>
                <td>${new Date(b.incident_date).toLocaleDateString()}</td>
              </tr>
            `).join('') || '<tr><td colspan="6" class="text-center text-muted">No blotter cases registered.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal -->
    <div class="modal fade" id="addBlotterModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <form action="/api/admin/create-blotter" method="POST">
            <div class="modal-header">
              <h5 class="modal-title fw-bold text-danger">File Incident Blotter</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label">Complainant Name *</label>
                  <input type="text" name="complainant_name" class="form-control" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Respondent Name *</label>
                  <input type="text" name="respondent_name" class="form-control" required>
                </div>
                <div class="col-md-4">
                  <label class="form-label">Incident Type *</label>
                  <input type="text" name="incident_type" class="form-control" required placeholder="Noise Disturbance, Theft, etc.">
                </div>
                <div class="col-md-4">
                  <label class="form-label">Incident Date *</label>
                  <input type="date" name="incident_date" class="form-control" required>
                </div>
                <div class="col-md-4">
                  <label class="form-label">Incident Time *</label>
                  <input type="time" name="incident_time" class="form-control" required>
                </div>
                <div class="col-md-12">
                  <label class="form-label">Location *</label>
                  <input type="text" name="location" class="form-control" required>
                </div>
                <div class="col-md-12">
                  <label class="form-label">Description *</label>
                  <textarea name="description" class="form-control" rows="3" required></textarea>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-danger">File Blotter Record</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `, 'admin', req.session));
});

app.post('/api/admin/create-blotter', requireAuth, requireAdmin, async (req, res) => {
  const { complainant_name, respondent_name, incident_type, incident_date, incident_time, location, description } = req.body;
  const caseNum = 'BLOT-' + Date.now().toString().slice(-6);

  await db.query(`
    INSERT INTO blotter_records (case_number, complainant_name, respondent_name, incident_type, incident_date, incident_time, location, description, created_by_user_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [caseNum, complainant_name, respondent_name, incident_type, incident_date, incident_time, location, description, req.session.userId]);

  await logActivity(req.session.userId, req.session.username, 'ADMIN', 'CREATE_BLOTTER', `Filed blotter case #${caseNum}`);
  res.redirect('/admin/blotter');
});

// Announcements Route
app.get('/admin/announcements', requireAuth, requireAdmin, async (req, res) => {
  const announcements = await db.query('SELECT * FROM announcements ORDER BY created_at DESC');

  res.send(renderBaseHTML('Announcements', `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h3 class="fw-bold mb-0">Manage Community Announcements</h3>
        <button class="btn btn-gov" data-bs-toggle="modal" data-bs-target="#addAnnouncementModal">+ Post Announcement</button>
      </div>

      <div class="list-group">
        ${announcements.rows.map(a => `
          <div class="list-group-item">
            <h5 class="fw-bold">${a.title}</h5>
            <p>${a.content}</p>
            <small class="text-muted">Posted: ${new Date(a.created_at).toLocaleString()}</small>
          </div>
        `).join('') || '<p class="text-muted">No announcements posted.</p>'}
      </div>
    </div>

    <!-- Modal -->
    <div class="modal fade" id="addAnnouncementModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/admin/create-announcement" method="POST">
            <div class="modal-header">
              <h5 class="modal-title fw-bold">New Community Announcement</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Title *</label>
                <input type="text" name="title" class="form-control" required>
              </div>
              <div class="mb-3">
                <label class="form-label">Content *</label>
                <textarea name="content" class="form-control" rows="4" required></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-gov">Publish Announcement</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `, 'admin', req.session));
});

app.post('/api/admin/create-announcement', requireAuth, requireAdmin, async (req, res) => {
  const { title, content } = req.body;
  await db.query('INSERT INTO announcements (title, content, created_by_user_id) VALUES ($1, $2, $3)', [title, content, req.session.userId]);
  res.redirect('/admin/announcements');
});

// Staff Management Route
app.get('/admin/staff', requireAuth, requireAdmin, async (req, res) => {
  const staffList = await db.query(`
    SELECT u.id, u.username, u.status, sp.full_name, sp.position 
    FROM users u 
    JOIN staff_permissions sp ON u.id = sp.user_id 
    WHERE u.role = 'STAFF'
  `);

  res.send(renderBaseHTML('Staff Accounts', `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h3 class="fw-bold mb-0">Barangay Staff Account Management</h3>
        <button class="btn btn-gov" data-bs-toggle="modal" data-bs-target="#addStaffModal">+ Register Staff Account</button>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead>
            <tr>
              <th>Staff Name</th>
              <th>Position</th>
              <th>Username</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${staffList.rows.map(s => `
              <tr>
                <td><strong>${s.full_name}</strong></td>
                <td>${s.position}</td>
                <td>${s.username}</td>
                <td><span class="badge bg-${s.status === 'ACTIVE' ? 'success' : 'danger'}">${s.status}</span></td>
              </tr>
            `).join('') || '<tr><td colspan="4" class="text-center text-muted">No staff accounts found.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal -->
    <div class="modal fade" id="addStaffModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/admin/create-staff" method="POST">
            <div class="modal-header">
              <h5 class="modal-title fw-bold">Create Staff Account</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Full Name *</label>
                <input type="text" name="full_name" class="form-control" required>
              </div>
              <div class="mb-3">
                <label class="form-label">Position *</label>
                <input type="text" name="position" class="form-control" required placeholder="Document Staff, Clerk, etc.">
              </div>
              <div class="mb-3">
                <label class="form-label">Username *</label>
                <input type="text" name="username" class="form-control" required>
              </div>
              <div class="mb-3">
                <label class="form-label">Password *</label>
                <input type="password" name="password" class="form-control" required>
              </div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-gov">Create Staff User</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `, 'admin', req.session));
});

app.post('/api/admin/create-staff', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { full_name, position, username, password } = req.body;
    const hash = await bcrypt.hash(password, 10);

    const userRes = await client.query(
      "INSERT INTO users (username, password_hash, role, status) VALUES ($1, $2, 'STAFF', 'ACTIVE') RETURNING id",
      [username, hash]
    );

    await client.query(
      'INSERT INTO staff_permissions (user_id, full_name, position) VALUES ($1, $2, $3)',
      [userRes.rows[0].id, full_name, position]
    );

    await client.query('COMMIT');
    res.redirect('/admin/staff');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).send(renderErrorPage('Error', 'Failed to create staff account.'));
  } finally {
    client.release();
  }
});

// Officials Management
app.get('/admin/officials', requireAuth, requireAdmin, async (req, res) => {
  const officials = await db.query('SELECT * FROM officials ORDER BY id ASC');

  res.send(renderBaseHTML('Officials Management', `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h3 class="fw-bold mb-0">Barangay Officials Roster</h3>
        <button class="btn btn-gov" data-bs-toggle="modal" data-bs-target="#addOfficialModal">+ Add Official</button>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead>
            <tr>
              <th>Full Name</th>
              <th>Position</th>
              <th>Contact</th>
            </tr>
          </thead>
          <tbody>
            ${officials.rows.map(o => `
              <tr>
                <td><strong>${o.full_name}</strong></td>
                <td>${o.position}</td>
                <td>${o.contact_number || 'N/A'}</td>
              </tr>
            `).join('') || '<tr><td colspan="3" class="text-center text-muted">No officials configured.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal -->
    <div class="modal fade" id="addOfficialModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/admin/create-official" method="POST">
            <div class="modal-header">
              <h5 class="modal-title fw-bold">Add Barangay Official</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Full Name *</label>
                <input type="text" name="full_name" class="form-control" required>
              </div>
              <div class="mb-3">
                <label class="form-label">Position *</label>
                <input type="text" name="position" class="form-control" required placeholder="Punong Barangay, Councilor">
              </div>
              <div class="mb-3">
                <label class="form-label">Contact Number</label>
                <input type="text" name="contact_number" class="form-control">
              </div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-gov">Save Official</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `, 'admin', req.session));
});

app.post('/api/admin/create-official', requireAuth, requireAdmin, async (req, res) => {
  const { full_name, position, contact_number } = req.body;
  await db.query('INSERT INTO officials (full_name, position, contact_number) VALUES ($1, $2, $3)', [full_name, position, contact_number]);
  res.redirect('/admin/officials');
});

// Activity Logs Route
app.get('/admin/activity-logs', requireAuth, requireAdmin, async (req, res) => {
  const logs = await db.query('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 100');

  res.send(renderBaseHTML('Activity Logs', `
    <div class="card card-custom p-4">
      <h3 class="fw-bold mb-4">System Activity Audit Trail</h3>
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Role</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${logs.rows.map(l => `
              <tr>
                <td><small>${new Date(l.created_at).toLocaleString()}</small></td>
                <td><strong>${l.username}</strong></td>
                <td><span class="badge bg-secondary">${l.role}</span></td>
                <td><code>${l.action}</code></td>
                <td><small>${l.details}</small></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `, 'admin', req.session));
});

// System Settings Route
app.get('/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  const settings = (await db.query('SELECT * FROM system_settings LIMIT 1')).rows[0];

  res.send(renderBaseHTML('System Settings', `
    <div class="card card-custom p-4">
      <h3 class="fw-bold mb-4">Barangay System Configuration</h3>
      <form action="/api/admin/update-settings" method="POST">
        <div class="mb-3">
          <label class="form-label">Barangay Name *</label>
          <input type="text" name="barangay_name" class="form-control" value="${settings.barangay_name}" required>
        </div>
        <div class="mb-3">
          <label class="form-label">Barangay Address *</label>
          <textarea name="address" class="form-control" rows="2" required>${settings.address}</textarea>
        </div>
        <div class="row g-3 mb-4">
          <div class="col-md-6">
            <label class="form-label">Contact Number *</label>
            <input type="text" name="contact_number" class="form-control" value="${settings.contact_number}" required>
          </div>
          <div class="col-md-6">
            <label class="form-label">Email Address *</label>
            <input type="email" name="email" class="form-control" value="${settings.email}" required>
          </div>
        </div>
        <button type="submit" class="btn btn-gov fw-bold">Save System Settings</button>
      </form>
    </div>
  `, 'admin', req.session));
});

app.post('/api/admin/update-settings', requireAuth, requireAdmin, async (req, res) => {
  const { barangay_name, address, contact_number, email } = req.body;
  await db.query('UPDATE system_settings SET barangay_name=$1, address=$2, contact_number=$3, email=$4, updated_at=CURRENT_TIMESTAMP', [barangay_name, address, contact_number, email]);
  res.redirect('/admin/settings');
});

// Demographics & Master Reports
app.get('/admin/reports', requireAuth, requireAdmin, async (req, res) => {
  const stats = await db.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE sex = 'Male') as male,
      COUNT(*) FILTER (WHERE sex = 'Female') as female,
      COUNT(*) FILTER (WHERE is_voter = true) as voters,
      COUNT(*) FILTER (WHERE is_senior = true) as seniors,
      COUNT(*) FILTER (WHERE is_pwd = true) as pwd,
      COUNT(*) FILTER (WHERE is_4ps = true) as fourps
    FROM residents WHERE status = 'APPROVED'
  `);

  const s = stats.rows[0];

  res.send(renderBaseHTML('System Reports', `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h3 class="fw-bold mb-0">Demographic & Statistical Reports</h3>
        <a href="/api/admin/export-residents-csv" class="btn btn-outline-success"><i class="bi bi-file-earmark-spreadsheet me-1"></i>Export Masterlist CSV</a>
      </div>

      <div class="row g-3 mb-4">
        <div class="col-md-3"><div class="p-3 border rounded text-center"><h5>Total Residents</h5><strong class="fs-3">${s.total}</strong></div></div>
        <div class="col-md-3"><div class="p-3 border rounded text-center"><h5>Male / Female</h5><strong class="fs-3">${s.male} / ${s.female}</strong></div></div>
        <div class="col-md-3"><div class="p-3 border rounded text-center"><h5>Voters</h5><strong class="fs-3">${s.voters}</strong></div></div>
        <div class="col-md-3"><div class="p-3 border rounded text-center"><h5>Seniors</h5><strong class="fs-3">${s.seniors}</strong></div></div>
      </div>
    </div>
  `, 'admin', req.session));
});

// CSV Export Endpoint
app.get('/api/admin/export-residents-csv', requireAuth, requireAdmin, async (req, res) => {
  const residents = await db.query('SELECT resident_id_number, first_name, last_name, sex, address, contact_number, status FROM residents');
  
  let csv = 'Resident ID,First Name,Last Name,Sex,Address,Contact,Status\n';
  residents.rows.forEach(r => {
    csv += `"${r.resident_id_number || ''}","${r.first_name}","${r.last_name}","${r.sex}","${r.address}","${r.contact_number}","${r.status}"\n`;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="residents_masterlist.csv"');
  res.status(200).send(csv);
});

// ==========================================
// SHARED QR SCANNER ROUTE (ADMIN & STAFF)
// ==========================================

app.get(['/admin/qr-scanner', '/staff/qr-scanner'], requireAuth, requireStaff, async (req, res) => {
  const portalType = req.session.role === 'ADMIN' ? 'admin' : 'staff';
  res.send(renderBaseHTML('QR Code Verification', `
    <div class="row justify-content-center">
      <div class="col-md-8">
        <div class="card card-custom p-4 text-center">
          <h3 class="fw-bold mb-3"><i class="bi bi-qr-code-scan me-2"></i>Resident QR Verification Scanner</h3>
          <p class="text-muted">Scan a resident's QR code using camera or enter QR token manually to verify authenticity.</p>
          
          <div id="reader" class="mx-auto border rounded mb-4" style="max-width: 400px;"></div>

          <form action="/api/verify-qr" method="POST" class="row g-2 justify-content-center">
            <div class="col-8">
              <input type="text" name="qr_token" id="qrTokenInput" class="form-control" placeholder="Manual QR Token Input" required>
            </div>
            <div class="col-4">
              <button type="submit" class="btn btn-gov w-100">Verify QR</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <script>
      function onScanSuccess(decodedText, decodedResult) {
        document.getElementById('qrTokenInput').value = decodedText;
      }
      let html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 250} }, false);
      html5QrcodeScanner.render(onScanSuccess);
    </script>
  `, portalType, req.session));
});

// Handle QR Verification API
app.post('/api/verify-qr', requireAuth, requireStaff, async (req, res) => {
  const { qr_token } = req.body;
  const result = await db.query('SELECT * FROM residents WHERE qr_token = $1', [qr_token]);

  const portalType = req.session.role === 'ADMIN' ? 'admin' : 'staff';

  if (result.rows.length === 0) {
    return res.send(renderBaseHTML('QR Scan Result', `
      <div class="card card-custom p-5 text-center">
        <i class="bi bi-x-circle text-danger display-1 mb-3"></i>
        <h2 class="fw-bold text-danger">INVALID OR UNRECOGNIZED QR CODE</h2>
        <p class="lead text-muted">The scanned QR code token does not match any registered resident in PostgreSQL.</p>
        <a href="/${portalType}/qr-scanner" class="btn btn-gov mt-3">Scan Another QR Code</a>
      </div>
    `, portalType, req.session));
  }

  const resident = result.rows[0];
  await logActivity(req.session.userId, req.session.username, req.session.role, 'SCAN_QR', `Verified QR for resident ${resident.first_name} ${resident.last_name}`);

  res.send(renderBaseHTML('QR Scan Result', `
    <div class="card card-custom p-5 text-center">
      <i class="bi bi-check-circle-fill text-success display-1 mb-3"></i>
      <h2 class="fw-bold text-success mb-3">VERIFIED RESIDENT RECORD</h2>
      <div class="row align-items-center justify-content-center text-start">
        <div class="col-md-3 text-center">
          <img src="${resident.photo_url || 'https://via.placeholder.com/150'}" class="rounded img-thumbnail" width="120">
        </div>
        <div class="col-md-6">
          <h4>${resident.first_name} ${resident.last_name}</h4>
          <p class="mb-1"><strong>ID:</strong> ${resident.resident_id_number}</p>
          <p class="mb-1"><strong>Address:</strong> ${resident.address}</p>
          <p class="mb-0"><strong>Status:</strong> <span class="badge bg-success">${resident.status}</span></p>
        </div>
      </div>
      <a href="/${portalType}/qr-scanner" class="btn btn-gov mt-4">Scan Next Code</a>
    </div>
  `, portalType, req.session));
});

// ==========================================
// STAFF PORTAL DASHBOARD & ROUTES
// ==========================================

app.get('/staff/dashboard', requireAuth, requireStaff, async (req, res) => {
  const pendingDocs = await db.query("SELECT COUNT(*) FROM document_requests WHERE status = 'Pending'");
  const totalResidents = await db.query("SELECT COUNT(*) FROM residents WHERE status = 'APPROVED'");

  res.send(renderBaseHTML('Staff Dashboard', `
    <h2 class="fw-bold mb-4">Barangay Staff Operations Dashboard</h2>
    <div class="row g-3 mb-4">
      <div class="col-md-6">
        <div class="card card-custom p-3 border-start border-primary border-4">
          <div class="text-muted">Total Approved Residents</div>
          <div class="display-6 fw-bold text-primary">${totalResidents.rows[0].count}</div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card card-custom p-3 border-start border-warning border-4">
          <div class="text-muted">Pending Documents To Process</div>
          <div class="display-6 fw-bold text-warning">${pendingDocs.rows[0].count}</div>
        </div>
      </div>
    </div>

    <div class="card card-custom p-4">
      <h5 class="fw-bold mb-3">Quick Staff Tasks</h5>
      <div class="d-flex gap-2">
        <a href="/staff/document-requests" class="btn btn-gov"><i class="bi bi-file-earmark-text me-1"></i>Process Document Requests</a>
        <a href="/staff/qr-scanner" class="btn btn-outline-success"><i class="bi bi-qr-code-scan me-1"></i>Launch QR Scanner</a>
      </div>
    </div>
  `, 'staff', req.session));
});

app.get('/staff/residents', requireAuth, requireStaff, async (req, res) => {
  const residents = await db.query("SELECT * FROM residents WHERE status = 'APPROVED' ORDER BY first_name ASC");
  res.send(renderBaseHTML('Residents List', `
    <div class="card card-custom p-4">
      <h3 class="fw-bold mb-4">Approved Barangay Resident Directory</h3>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead>
            <tr>
              <th>Resident ID</th>
              <th>Name</th>
              <th>Address</th>
              <th>Contact</th>
            </tr>
          </thead>
          <tbody>
            ${residents.rows.map(r => `
              <tr>
                <td><strong>${r.resident_id_number}</strong></td>
                <td>${r.first_name}${r.last_name}</td>
                <td>${r.address}</td>
                <td>${r.contact_number}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `, 'staff', req.session));
});

app.get('/staff/document-requests', requireAuth, requireStaff, async (req, res) => {
  const requests = await db.query(`
    SELECT dr.*, r.first_name, r.last_name, dt.title as doc_title
    FROM document_requests dr
    JOIN residents r ON dr.resident_id = r.id
    JOIN document_types dt ON dr.document_type_id = dt.id
    ORDER BY dr.created_at DESC
  `);

  res.send(renderBaseHTML('Staff Document Processing', `
    <div class="card card-custom p-4">
      <h3 class="fw-bold mb-4">Staff Document Request Processing</h3>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead>
            <tr>
              <th>Req #</th>
              <th>Resident</th>
              <th>Document</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${requests.rows.map(r => `
              <tr>
                <td><strong>${r.request_number}</strong></td>
                <td>${r.first_name}${r.last_name}</td>
                <td>${r.doc_title}</td>
                <td><span class="badge bg-info">${r.status}</span></td>
                <td>
                  <a href="/admin/print-document/${r.id}" target="_blank" class="btn btn-sm btn-outline-secondary"><i class="bi bi-printer me-1"></i>Print Document</a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `, 'staff', req.session));
});

app.get('/staff/blotter', requireAuth, requireStaff, async (req, res) => {
  const blotters = await db.query('SELECT * FROM blotter_records ORDER BY created_at DESC');
  res.send(renderBaseHTML('Blotter View', `
    <div class="card card-custom p-4">
      <h3 class="fw-bold mb-4">Blotter Incident Records</h3>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead>
            <tr>
              <th>Case #</th>
              <th>Complainant</th>
              <th>Respondent</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${blotters.rows.map(b => `
              <tr>
                <td><strong>${b.case_number}</strong></td>
                <td>${b.complainant_name}</td>
                <td>${b.respondent_name}</td>
                <td><span class="badge bg-warning">${b.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `, 'staff', req.session));
});

// Fallback Route for Undefined Paths
app.use((req, res) => {
  res.status(404).send(renderErrorPage('404 - Page Not Found', 'The requested page or route does not exist.'));
});

// Start Application Server
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`Barangay Resident Management System Running`);
    console.log(`Server Port: ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`==================================================`);
  });
});
