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

// Configuration Defaults
const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || 'super-secret-barangay-key-2026';
const ADMIN_SETUP_SECRET = process.env.ADMIN_SETUP_SECRET || 'admin123';

if (!DATABASE_URL) {
  console.error('FATAL ERROR: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

// Ensure local uploads directory exists (fallback storage abstraction)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage Abstraction (Local Disk vs External Object Storage Mock/Hook)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, and PDF files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

// Database Connection
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || DATABASE_URL.includes('render.com') 
    ? { rejectUnauthorized: false } 
    : false
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDir));

// Express Session Middleware with PostgreSQL Storage
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 Days
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    httpOnly: true
  }
}));

// Core Database Initialization
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // System Settings Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        barangay_name VARCHAR(255) DEFAULT 'Barangay San Jose',
        municipality VARCHAR(255) DEFAULT 'City of Angeles',
        province VARCHAR(255) DEFAULT 'Pampanga',
        contact_number VARCHAR(50) DEFAULT '+63 912 345 6789',
        email VARCHAR(255) DEFAULT 'info@barangaysanjose.gov.ph',
        address TEXT DEFAULT '123 Main Street, Barangay San Jose',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'STAFF', 'RESIDENT')),
        status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'REJECTED', 'DISABLED', 'ARCHIVED')),
        permissions JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Households Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS households (
        id SERIAL PRIMARY KEY,
        household_number VARCHAR(50) UNIQUE NOT NULL,
        head_resident_id INT,
        address TEXT NOT NULL,
        classification VARCHAR(100) DEFAULT 'Residential',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Residents Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS residents (
        id SERIAL PRIMARY KEY,
        user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        resident_id_number VARCHAR(50) UNIQUE NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        middle_name VARCHAR(100),
        last_name VARCHAR(100) NOT NULL,
        suffix VARCHAR(20),
        birthdate DATE NOT NULL,
        sex VARCHAR(20) NOT NULL,
        civil_status VARCHAR(50) NOT NULL,
        address TEXT NOT NULL,
        contact_number VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        occupation VARCHAR(100),
        educational_attainment VARCHAR(100),
        nationality VARCHAR(100) DEFAULT 'Filipino',
        voter_status BOOLEAN DEFAULT FALSE,
        pwd_status BOOLEAN DEFAULT FALSE,
        senior_status BOOLEAN DEFAULT FALSE,
        four_ps_status BOOLEAN DEFAULT FALSE,
        emergency_contact_name VARCHAR(255),
        emergency_contact_number VARCHAR(50),
        photo_url TEXT,
        valid_id_url TEXT,
        household_id INT REFERENCES households(id) ON DELETE SET NULL,
        household_relationship VARCHAR(100),
        qr_token VARCHAR(255) UNIQUE NOT NULL,
        qr_status VARCHAR(20) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Foreign key link back to Residents for Household head
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE constraint_name = 'fk_household_head') THEN
          ALTER TABLE households ADD CONSTRAINT fk_household_head FOREIGN KEY (head_resident_id) REFERENCES residents(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Documents Catalog
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_types (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        requirements JSONB DEFAULT '[]'::jsonb,
        fee DECIMAL(10, 2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Document Requests
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_requests (
        id SERIAL PRIMARY KEY,
        request_number VARCHAR(50) UNIQUE NOT NULL,
        resident_id INT REFERENCES residents(id) ON DELETE CASCADE,
        document_type_id INT REFERENCES document_types(id),
        purpose TEXT NOT NULL,
        requirements_url TEXT,
        status VARCHAR(30) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Under Review', 'Approved', 'Rejected', 'Ready', 'Completed', 'Cancelled')),
        remarks TEXT,
        processed_by_user_id INT REFERENCES users(id),
        issued_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Blotter Records
    await client.query(`
      CREATE TABLE IF NOT EXISTS blotter_records (
        id SERIAL PRIMARY KEY,
        case_number VARCHAR(50) UNIQUE NOT NULL,
        complainant_name VARCHAR(255) NOT NULL,
        respondent_name VARCHAR(255) NOT NULL,
        incident_type VARCHAR(100) NOT NULL,
        incident_date DATE NOT NULL,
        incident_time TIME NOT NULL,
        location TEXT NOT NULL,
        description TEXT NOT NULL,
        witnesses TEXT,
        action_taken TEXT,
        resolution TEXT,
        status VARCHAR(30) DEFAULT 'Open' CHECK (status IN ('Open', 'Under Investigation', 'Resolved', 'Closed')),
        attachment_url TEXT,
        created_by INT REFERENCES users(id),
        updated_by INT REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Announcements
    await client.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        publication_date DATE DEFAULT CURRENT_DATE,
        is_published BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Notifications
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'INFO',
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Resident Concerns / Service Requests
    await client.query(`
      CREATE TABLE IF NOT EXISTS resident_concerns (
        id SERIAL PRIMARY KEY,
        resident_id INT REFERENCES residents(id) ON DELETE CASCADE,
        subject VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        attachment_url TEXT,
        status VARCHAR(30) DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Under Review', 'Processing', 'Resolved', 'Closed')),
        response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Officials
    await client.query(`
      CREATE TABLE IF NOT EXISTS barangay_officials (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        position VARCHAR(100) NOT NULL,
        contact_number VARCHAR(50),
        term VARCHAR(100),
        photo_url TEXT,
        signature_url TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Activity Logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE SET NULL,
        user_role VARCHAR(50),
        action VARCHAR(255) NOT NULL,
        module VARCHAR(100) NOT NULL,
        record_id VARCHAR(100),
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed System Settings if Empty
    const checkSettings = await client.query('SELECT COUNT(*) FROM system_settings');
    if (parseInt(checkSettings.rows[0].count) === 0) {
      await client.query('INSERT INTO system_settings (barangay_name) VALUES ($1)', ['Barangay San Jose']);
    }

    // Seed Initial Admin User if none exists
    const checkAdmin = await client.query("SELECT COUNT(*) FROM users WHERE role = 'ADMIN'");
    if (parseInt(checkAdmin.rows[0].count) === 0) {
      const hashedPassword = await bcrypt.hash(ADMIN_SETUP_SECRET, 10);
      await client.query(
        `INSERT INTO users (username, email, password_hash, role, status, permissions) 
         VALUES ($1, $2, $3, 'ADMIN', 'ACTIVE', '["all"]')`,
        ['admin', 'admin@barangay.gov.ph', hashedPassword]
      );
      console.log('--- DEFAULT ADMIN CREATED ---');
      console.log('Username: admin');
      console.log(`Password: ${ADMIN_SETUP_SECRET}`);
      console.log('-----------------------------');
    }

    // Seed Default Document Types
    const checkDocTypes = await client.query('SELECT COUNT(*) FROM document_types');
    if (parseInt(checkDocTypes.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO document_types (title, description, requirements, fee) VALUES
        ('Barangay Clearance', 'Clearance for employment, business, or official transactions.', '["Valid ID", "Proof of Residency"]'::jsonb, 50.00),
        ('Certificate of Residency', 'Proof that resident lives in the barangay.', '["Valid ID"]'::jsonb, 30.00),
        ('Certificate of Indigency', 'Issued to low-income residents for financial assistance.', '["Valid ID", "Barangay Interview"]'::jsonb, 0.00),
        ('Certificate of Good Moral Character', 'Certificate of good community standing.', '["Valid ID"]'::jsonb, 50.00),
        ('Business Clearance', 'Clearance required to operate a business within the barangay.', '["Business Permit Form", "DTI Registration"]'::jsonb, 200.00);
      `);
    }

    await client.query('COMMIT');
    console.log('Database tables, constraints, and initial state initialized successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error initializing database setup:', err);
  } finally {
    client.release();
  }
}

// Utility Helpers & Calculation Logic
function calculateAge(birthdateStr) {
  const birthdate = new Date(birthdateStr);
  const diff = Date.now() - birthdate.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

async function logActivity(userId, role, action, moduleName, recordId, req) {
  try {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : '127.0.0.1';
    await pool.query(
      `INSERT INTO activity_logs (user_id, user_role, action, module, record_id, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId || null, role || 'SYSTEM', action, moduleName, String(recordId || ''), ip]
    );
  } catch (err) {
    console.error('Activity Logging Error:', err);
  }
}

// Global Authentication & Role-Based Security Middlewares
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.status(401).json({ error: 'Unauthorized access. Please login.' });
    }
    return res.redirect('/resident-login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/admin-login');
  }
  if (req.session.role !== 'ADMIN') {
    return res.status(403).send(getAccessDeniedHTML('Admin Authorization Required'));
  }
  next();
}

function requireStaff(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/staff-login');
  }
  if (req.session.role !== 'STAFF' && req.session.role !== 'ADMIN') {
    return res.status(403).send(getAccessDeniedHTML('Staff Authorization Required'));
  }
  next();
}

function requireResident(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/resident-login');
  }
  if (req.session.role !== 'RESIDENT') {
    return res.status(403).send(getAccessDeniedHTML('Resident Authorization Required'));
  }
  next();
}

function requirePermission(moduleName) {
  return (req, res, next) => {
    if (req.session.role === 'ADMIN') return next();
    if (req.session.role === 'STAFF') {
      const perms = req.session.permissions || [];
      if (perms.includes('all') || perms.includes(moduleName)) {
        return next();
      }
    }
    return res.status(403).send(getAccessDeniedHTML(`Access Denied to Module: ${moduleName}`));
  };
}

// Master HTML Shell Renderer
function renderLayout({ title, portal, user, content, activeNav }) {
  const isResident = portal === 'RESIDENT';
  const isAdmin = portal === 'ADMIN';
  const isStaff = portal === 'STAFF';

  const themeClass = isResident ? 'theme-resident' : isAdmin ? 'theme-admin' : 'theme-staff';
  const portalName = isResident ? 'Resident Portal' : isAdmin ? 'Admin Portal' : 'Staff Portal';

  let navLinks = '';
  if (isResident) {
    navLinks = `
      <a href="/resident/dashboard" class="${activeNav==='dashboard'?'active':''}"><i class="icon">🏠</i> Dashboard</a>
      <a href="/resident/profile" class="${activeNav==='profile'?'active':''}"><i class="icon">👤</i> My Profile</a>
      <a href="/resident/household" class="${activeNav==='household'?'active':''}"><i class="icon">👨‍👩‍👧‍👦</i> My Household</a>
      <a href="/resident/id" class="${activeNav==='id'?'active':''}"><i class="icon">🪪</i> My Resident ID</a>
      <a href="/resident/qr" class="${activeNav==='qr'?'active':''}"><i class="icon">📱</i> My QR Code</a>
      <a href="/resident/documents/request" class="${activeNav==='doc-req'?'active':''}"><i class="icon">📄</i> Request Document</a>
      <a href="/resident/documents/history" class="${activeNav==='doc-hist'?'active':''}"><i class="icon">📑</i> My Requests</a>
      <a href="/resident/concerns" class="${activeNav==='concerns'?'active':''}"><i class="icon">💬</i> Concerns & Requests</a>
      <a href="/resident/announcements" class="${activeNav==='announcements'?'active':''}"><i class="icon">📢</i> Announcements</a>
      <a href="/resident/notifications" class="${activeNav==='notifications'?'active':''}"><i class="icon">🔔</i> Notifications</a>
      <a href="/resident/settings" class="${activeNav==='settings'?'active':''}"><i class="icon">⚙️</i> Settings</a>
    `;
  } else if (isAdmin) {
    navLinks = `
      <a href="/admin/dashboard" class="${activeNav==='dashboard'?'active':''}"><i class="icon">📊</i> Dashboard</a>
      <a href="/admin/residents" class="${activeNav==='residents'?'active':''}"><i class="icon">👥</i> Resident Management</a>
      <a href="/admin/accounts" class="${activeNav==='accounts'?'active':''}"><i class="icon">✅</i> Pending Approvals</a>
      <a href="/admin/households" class="${activeNav==='households'?'active':''}"><i class="icon">🏠</i> Households</a>
      <a href="/admin/staff" class="${activeNav==='staff'?'active':''}"><i class="icon">🛡️</i> Staff Management</a>
      <a href="/admin/officials" class="${activeNav==='officials'?'active':''}"><i class="icon">🏛️</i> Barangay Officials</a>
      <a href="/admin/document-requests" class="${activeNav==='doc-requests'?'active':''}"><i class="icon">📑</i> Document Requests</a>
      <a href="/admin/documents" class="${activeNav==='documents'?'active':''}"><i class="icon">📜</i> Document Templates</a>
      <a href="/admin/blotter" class="${activeNav==='blotter'?'active':''}"><i class="icon">⚖️</i> Blotter Records</a>
      <a href="/admin/announcements" class="${activeNav==='announcements'?'active':''}"><i class="icon">📢</i> Announcements</a>
      <a href="/admin/qr" class="${activeNav==='qr'?'active':''}"><i class="icon">📷</i> QR Verification</a>
      <a href="/admin/reports" class="${activeNav==='reports'?'active':''}"><i class="icon">📈</i> System Reports</a>
      <a href="/admin/logs" class="${activeNav==='logs'?'active':''}"><i class="icon">📋</i> Activity Logs</a>
      <a href="/admin/backup" class="${activeNav==='backup'?'active':''}"><i class="icon">💾</i> Database Backup</a>
      <a href="/admin/settings" class="${activeNav==='settings'?'active':''}"><i class="icon">⚙️</i> System Settings</a>
    `;
  } else if (isStaff) {
    const perms = user?.permissions || [];
    const hasAll = perms.includes('all');
    navLinks = `
      <a href="/staff/dashboard" class="${activeNav==='dashboard'?'active':''}"><i class="icon">📊</i> Dashboard</a>
      ${(hasAll || perms.includes('residents')) ? `<a href="/staff/residents" class="${activeNav==='residents'?'active':''}"><i class="icon">👥</i> Residents</a>` : ''}
      ${(hasAll || perms.includes('households')) ? `<a href="/staff/households" class="${activeNav==='households'?'active':''}"><i class="icon">🏠</i> Households</a>` : ''}
      ${(hasAll || perms.includes('documents')) ? `<a href="/staff/document-requests" class="${activeNav==='doc-requests'?'active':''}"><i class="icon">📑</i> Document Requests</a>` : ''}
      ${(hasAll || perms.includes('blotter')) ? `<a href="/staff/blotter" class="${activeNav==='blotter'?'active':''}"><i class="icon">⚖️</i> Blotter Cases</a>` : ''}
      ${(hasAll || perms.includes('qr')) ? `<a href="/staff/qr" class="${activeNav==='qr'?'active':''}"><i class="icon">📷</i> QR Scanner</a>` : ''}
      ${(hasAll || perms.includes('reports')) ? `<a href="/staff/reports" class="${activeNav==='reports'?'active':''}"><i class="icon">📈</i> Reports</a>` : ''}
      <a href="/staff/notifications" class="${activeNav==='notifications'?'active':''}"><i class="icon">🔔</i> Notifications</a>
      <a href="/staff/settings" class="${activeNav==='settings'?'active':''}"><i class="icon">⚙️</i> Settings</a>
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
        :root {
          --primary-admin: #1e293b;
          --primary-staff: #0f766e;
          --primary-resident: #2563eb;
          --accent: #3b82f6;
          --bg-gray: #f8fafc;
          --card-bg: #ffffff;
          --text-dark: #0f172a;
          --text-light: #64748b;
          --border: #e2e8f0;
          --success: #16a34a;
          --warning: #d97706;
          --danger: #dc2626;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        body { background-color: var(--bg-gray); color: var(--text-dark); display: flex; flex-direction: column; min-height: 100vh; }

        /* Top Header */
        header {
          background: var(--card-bg);
          border-bottom: 1px solid var(--border);
          padding: 0.8rem 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .brand { display: flex; align-items: center; gap: 0.75rem; text-decoration: none; color: inherit; }
        .brand-logo { width: 38px; height: 38px; background: #0284c7; color: white; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.2rem; }
        .brand-text h1 { font-size: 1.1rem; font-weight: 700; line-height: 1.2; }
        .brand-text span { font-size: 0.75rem; color: var(--text-light); }

        .user-nav { display: flex; align-items: center; gap: 1rem; }
        .user-badge { font-size: 0.85rem; padding: 0.25rem 0.6rem; border-radius: 9999px; background: #e0f2fe; color: #0369a1; font-weight: 600; }
        .btn-logout { font-size: 0.85rem; color: var(--danger); text-decoration: none; border: 1px solid var(--danger); padding: 0.3rem 0.75rem; border-radius: 6px; transition: all 0.2s; }
        .btn-logout:hover { background: var(--danger); color: white; }

        /* App Container Layout */
        .app-container { display: flex; flex: 1; }

        /* Sidebar Navigation */
        aside {
          width: 260px;
          background: var(--card-bg);
          border-right: 1px solid var(--border);
          padding: 1.5rem 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        aside a {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.65rem 0.85rem;
          color: var(--text-dark);
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 500;
          border-radius: 6px;
          transition: background 0.15s;
        }
        aside a:hover { background: #f1f5f9; }
        aside a.active { background: #e0f2fe; color: #0284c7; font-weight: 600; }
        aside .icon { font-style: normal; font-size: 1.1rem; }

        /* Main Content View */
        main { flex: 1; padding: 2rem; max-width: 1400px; margin: 0 auto; width: 100%; }

        /* General Card & Grid Layouts */
        .page-header { margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
        .page-title { font-size: 1.5rem; font-weight: 700; color: var(--text-dark); }
        .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem; margin-bottom: 1.5rem; }
        .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .stat-card { display: flex; flex-direction: column; gap: 0.5rem; }
        .stat-card .stat-title { font-size: 0.85rem; color: var(--text-light); text-transform: uppercase; font-weight: 600; }
        .stat-card .stat-value { font-size: 1.8rem; font-weight: 700; color: var(--text-dark); }

        /* Table Design */
        .table-responsive { width: 100%; overflow-x: auto; background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 1.5rem; }
        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem; }
        th, td { padding: 0.85rem 1rem; border-bottom: 1px solid var(--border); }
        th { background: #f8fafc; font-weight: 600; color: var(--text-light); }
        tr:last-child td { border-bottom: none; }
        tr:hover { background: #f8fafc; }

        /* Buttons & Controls */
        .btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.5rem 1rem; font-size: 0.875rem; font-weight: 600; border-radius: 6px; border: none; cursor: pointer; text-decoration: none; transition: all 0.2s; }
        .btn-primary { background: var(--accent); color: white; }
        .btn-primary:hover { background: #2563eb; }
        .btn-secondary { background: #e2e8f0; color: var(--text-dark); }
        .btn-secondary:hover { background: #cbd5e1; }
        .btn-success { background: var(--success); color: white; }
        .btn-danger { background: var(--danger); color: white; }
        .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.775rem; }

        /* Form Components */
        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem; color: var(--text-dark); }
        .form-control { width: 100%; padding: 0.6rem 0.75rem; font-size: 0.9rem; border: 1px solid var(--border); border-radius: 6px; outline: none; background: white; }
        .form-control:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
        .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }

        /* Badges */
        .badge { display: inline-block; padding: 0.2rem 0.5rem; font-size: 0.75rem; font-weight: 600; border-radius: 9999px; }
        .badge-pending { background: #fef3c7; color: #d97706; }
        .badge-active, .badge-approved, .badge-resolved, .badge-completed { background: #dcfce7; color: #16a34a; }
        .badge-rejected, .badge-disabled { background: #fee2e2; color: #dc2626; }

        /* Mobile Responsive Navigation (Resident Focus) */
        @media (max-width: 768px) {
          .app-container { flex-direction: column; }
          aside { width: 100%; border-right: none; border-bottom: 1px solid var(--border); padding: 0.75rem; flex-direction: row; overflow-x: auto; white-space: nowrap; }
          aside a { padding: 0.5rem 0.75rem; font-size: 0.8rem; }
          main { padding: 1rem; }
          .page-header { flex-direction: column; align-items: flex-start; }
        }

        /* Digital ID Styling */
        .id-card {
          width: 380px;
          height: 230px;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          color: white;
          border-radius: 12px;
          padding: 1.25rem;
          position: relative;
          box-shadow: 0 10px 25px rgba(0,0,0,0.2);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          margin: 0 auto;
        }
        .id-header { display: flex; align-items: center; gap: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
        .id-header img { width: 35px; height: 35px; border-radius: 50%; }
        .id-body { display: flex; gap: 1rem; align-items: center; margin-top: 0.5rem; }
        .id-photo { width: 80px; height: 80px; border-radius: 8px; border: 2px solid white; object-fit: cover; background: #334155; }
        .id-details h3 { font-size: 1rem; margin-bottom: 0.2rem; }
        .id-details p { font-size: 0.75rem; color: #cbd5e1; margin-bottom: 0.15rem; }
        .id-footer { display: flex; justify-content: space-between; align-items: center; font-size: 0.65rem; color: #94a3b8; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 0.4rem; }

        /* Printable Area Customizations */
        @media print {
          body * { visibility: hidden; }
          .printable, .printable * { visibility: visible; }
          .printable { position: absolute; left: 0; top: 0; width: 100%; }
          aside, header, .no-print { display: none !important; }
        }
      </style>
    </head>
    <body class="${themeClass}">
      <header>
        <a href="#" class="brand">
          <div class="brand-logo">B</div>
          <div class="brand-text">
            <h1>BARANGAY SYSTEM</h1>
            <span>${portalName}</span>
          </div>
        </a>
        <div class="user-nav">
          ${user ? `
            <span class="user-badge">${user.username} (${user.role})</span>
            <a href="/logout" class="btn-logout">Logout</a>
          ` : ''}
        </div>
      </header>

      <div class="app-container">
        <aside class="no-print">
          ${navLinks}
        </aside>

        <main>
          ${content}
        </main>
      </div>
    </body>
    </html>
  `;
}

// Access Denied Renderer Helper
function getAccessDeniedHTML(message) {
  return renderLayout({
    title: 'Access Denied',
    portal: 'RESIDENT',
    user: null,
    activeNav: '',
    content: `
      <div class="card" style="text-align: center; padding: 3rem; max-width: 500px; margin: 2rem auto;">
        <h2 style="color: var(--danger); margin-bottom: 1rem;">🚫 403 Access Denied</h2>
        <p style="color: var(--text-light); margin-bottom: 1.5rem;">${message || 'You do not have permission to view or execute this resource.'}</p>
        <a href="javascript:history.back()" class="btn btn-primary">Go Back</a>
      </div>
    `
  });
}

// PUBLIC & AUTHENTICATION ROUTES
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Barangay Management Portal</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1rem; }
        .portal-card { background: white; border-radius: 12px; padding: 2.5rem; max-width: 480px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.08); text-align: center; }
        .portal-card h1 { font-size: 1.75rem; color: #0f172a; margin-bottom: 0.5rem; }
        .portal-card p { color: #64748b; font-size: 0.95rem; margin-bottom: 2rem; }
        .portal-btn { display: block; width: 100%; padding: 0.85rem; margin-bottom: 1rem; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 0.95rem; transition: transform 0.15s; }
        .portal-btn:hover { transform: translateY(-2px); }
        .btn-res { background: #2563eb; color: white; }
        .btn-staff { background: #0f766e; color: white; }
        .btn-admin { background: #1e293b; color: white; }
      </style>
    </head>
    <body>
      <div class="portal-card">
        <h1>Barangay Digital Portal</h1>
        <p>Select your entry access portal to continue</p>
        <a href="/resident-login" class="portal-btn btn-res">Resident Portal Login</a>
        <a href="/staff-login" class="portal-btn btn-staff">Barangay Staff Access</a>
        <a href="/admin-login" class="portal-btn btn-admin">Administrator Access</a>
      </div>
    </body>
    </html>
  `);
});

// RESIDENT REGISTRATION PAGE
app.get('/resident-register', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Resident Account Registration</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: #f8fafc; padding: 2rem 1rem; display: flex; justify-content: center; }
        .reg-container { background: white; border-radius: 12px; padding: 2rem; max-width: 800px; width: 100%; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        h2 { margin-bottom: 0.5rem; color: #0f172a; }
        p { color: #64748b; margin-bottom: 1.5rem; font-size: 0.9rem; }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.25rem; }
        .form-group { display: flex; flex-direction: column; gap: 0.35rem; }
        label { font-size: 0.85rem; font-weight: 600; color: #334155; }
        input, select { padding: 0.65rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.9rem; outline: none; }
        input:focus, select:focus { border-color: #2563eb; }
        .section-title { font-size: 1rem; font-weight: 700; color: #1e293b; margin: 1.25rem 0 0.75rem 0; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem; grid-column: 1 / -1; }
        .btn-submit { background: #2563eb; color: white; border: none; padding: 0.85rem 1.5rem; font-size: 1rem; font-weight: 600; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 1rem; }
        .btn-submit:hover { background: #1d4ed8; }
        .error-msg { background: #fee2e2; color: #dc2626; padding: 0.75rem; border-radius: 6px; font-size: 0.85rem; margin-bottom: 1rem; display: none; }
      </style>
    </head>
    <body>
      <div class="reg-container">
        <h2>Resident Portal Registration</h2>
        <p>Complete the form below to apply for official barangay resident registration.</p>
        
        <form action="/resident-register" method="POST" enctype="multipart/form-data">
          <div class="form-grid">
            <div class="section-title">Account Credentials</div>
            <div class="form-group">
              <label>Username *</label>
              <input type="text" name="username" required>
            </div>
            <div class="form-group">
              <label>Email Address *</label>
              <input type="email" name="email" required>
            </div>
            <div class="form-group">
              <label>Password *</label>
              <input type="password" name="password" required>
            </div>
            <div class="form-group">
              <label>Confirm Password *</label>
              <input type="password" name="confirm_password" required>
            </div>

            <div class="section-title">Personal Details</div>
            <div class="form-group">
              <label>First Name *</label>
              <input type="text" name="first_name" required>
            </div>
            <div class="form-group">
              <label>Middle Name</label>
              <input type="text" name="middle_name">
            </div>
            <div class="form-group">
              <label>Last Name *</label>
              <input type="text" name="last_name" required>
            </div>
            <div class="form-group">
              <label>Suffix (e.g. Jr., III)</label>
              <input type="text" name="suffix">
            </div>
            <div class="form-group">
              <label>Birthdate *</label>
              <input type="date" name="birthdate" required>
            </div>
            <div class="form-group">
              <label>Sex *</label>
              <select name="sex" required>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div class="form-group">
              <label>Civil Status *</label>
              <select name="civil_status" required>
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Widowed">Widowed</option>
                <option value="Separated">Separated</option>
              </select>
            </div>
            <div class="form-group">
              <label>Contact Number *</label>
              <input type="text" name="contact_number" required>
            </div>

            <div class="section-title">Address & Demographics</div>
            <div class="form-group" style="grid-column: 1 / -1;">
              <label>Complete Barangay Address *</label>
              <input type="text" name="address" placeholder="House No., Street Name, Zone/Purok" required>
            </div>
            <div class="form-group">
              <label>Occupation</label>
              <input type="text" name="occupation">
            </div>
            <div class="form-group">
              <label>Educational Attainment</label>
              <input type="text" name="educational_attainment">
            </div>
            <div class="form-group">
              <label>Nationality</label>
              <input type="text" name="nationality" value="Filipino">
            </div>

            <div class="section-title">Special Sector Status</div>
            <div class="form-group">
              <label>Registered Voter?</label>
              <select name="voter_status">
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>
            <div class="form-group">
              <label>PWD Status</label>
              <select name="pwd_status">
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>
            <div class="form-group">
              <label>4Ps Beneficiary?</label>
              <select name="four_ps_status">
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>

            <div class="section-title">Emergency Contact</div>
            <div class="form-group">
              <label>Contact Person Name</label>
              <input type="text" name="emergency_contact_name">
            </div>
            <div class="form-group">
              <label>Contact Person Number</label>
              <input type="text" name="emergency_contact_number">
            </div>

            <div class="section-title">Verification Documents</div>
            <div class="form-group">
              <label>Resident 2x2 Photo (JPG/PNG) *</label>
              <input type="file" name="photo" accept="image/*" required>
            </div>
            <div class="form-group">
              <label>Valid Government ID (JPG/PNG/PDF) *</label>
              <input type="file" name="valid_id" accept="image/*,application/pdf" required>
            </div>
          </div>

          <button type="submit" class="btn-submit">Submit Registration Application</button>
        </form>
        <div style="margin-top: 1rem; text-align: center; font-size: 0.85rem;">
          Already registered? <a href="/resident-login" style="color: #2563eb;">Log in here</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// HANDLE RESIDENT REGISTRATION SUBMISSION
app.post('/resident-register', upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'valid_id', maxCount: 1 }]), async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      username, email, password, confirm_password,
      first_name, middle_name, last_name, suffix,
      birthdate, sex, civil_status, address, contact_number,
      occupation, educational_attainment, nationality,
      voter_status, pwd_status, four_ps_status,
      emergency_contact_name, emergency_contact_number
    } = req.body;

    if (password !== confirm_password) {
      return res.status(400).send('Passwords do not match. <a href="javascript:history.back()">Go Back</a>');
    }

    const photoFile = req.files['photo'] ? `/uploads/${req.files['photo'][0].filename}` : null;
    const validIdFile = req.files['valid_id'] ? `/uploads/${req.files['valid_id'][0].filename}` : null;

    if (!photoFile || !validIdFile) {
      return res.status(400).send('Photo and Valid ID are required. <a href="javascript:history.back()">Go Back</a>');
    }

    await client.query('BEGIN');

    // Check duplicate username or email
    const dupCheck = await client.query('SELECT id FROM users WHERE username = $1 OR email = $2', [username, email]);
    if (dupCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).send('Username or Email is already registered. <a href="javascript:history.back()">Go Back</a>');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userResult = await client.query(
      `INSERT INTO users (username, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'RESIDENT', 'PENDING') RETURNING id`,
      [username, email, hashedPassword]
    );
    const newUserId = userResult.rows[0].id;

    // Generate unique Resident ID (Format: BRGY-2026-XXXXXX)
    const countRes = await client.query('SELECT COUNT(*) FROM residents');
    const nextSeq = String(parseInt(countRes.rows[0].count) + 1).padStart(6, '0');
    const year = new Date().getFullYear();
    const residentIdNum = `BRGY-${year}-${nextSeq}`;

    // Calculate Senior Status
    const calculatedAge = calculateAge(birthdate);
    const isSenior = calculatedAge >= 60;

    const qrToken = `QR-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    await client.query(
      `INSERT INTO residents (
        user_id, resident_id_number, first_name, middle_name, last_name, suffix,
        birthdate, sex, civil_status, address, contact_number, email,
        occupation, educational_attainment, nationality, voter_status,
        pwd_status, senior_status, four_ps_status, emergency_contact_name,
        emergency_contact_number, photo_url, valid_id_url, qr_token
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
      [
        newUserId, residentIdNum, first_name, middle_name || null, last_name, suffix || null,
        birthdate, sex, civil_status, address, contact_number, email,
        occupation || null, educational_attainment || null, nationality || 'Filipino', voter_status === 'true',
        pwd_status === 'true', isSenior, four_ps_status === 'true', emergency_contact_name || null,
        emergency_contact_number || null, photoFile, validIdFile, qrToken
      ]
    );

    // Initial system notification for the resident
    await client.query(
      `INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, 'INFO')`,
      [newUserId, 'Your registration application has been submitted and is pending administrator approval.']
    );

    await client.query('COMMIT');

    await logActivity(newUserId, 'RESIDENT', 'Registration Submitted', 'RESIDENT_REGISTRATION', residentIdNum, req);

    res.send(`
      <div style="font-family: sans-serif; text-align: center; margin-top: 4rem;">
        <h2 style="color: #16a34a;">Registration Submitted Successfully!</h2>
        <p style="margin-top: 1rem; color: #475569;">Your account status is currently <strong>PENDING APPROVAL</strong>.</p>
        <p style="color: #475569;">An administrator will review your submitted profile and valid ID.</p>
        <a href="/resident-login" style="display: inline-block; margin-top: 1.5rem; padding: 0.6rem 1.2rem; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Return to Login</a>
      </div>
    `);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Registration error:', err);
    res.status(500).send('Error processing registration. Please try again.');
  } finally {
    client.release();
  }
});

// UNIVERSAL LOGIN PAGE CREATOR
function renderLoginPage(portalTitle, formAction, themeColor, bgGradient) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${portalTitle} - Login</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: ${bgGradient}; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1rem; }
        .login-card { background: white; border-radius: 12px; padding: 2.5rem; max-width: 400px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.15); }
        .login-card h2 { text-align: center; color: #0f172a; font-size: 1.5rem; margin-bottom: 0.5rem; }
        .login-card p { text-align: center; color: #64748b; font-size: 0.85rem; margin-bottom: 1.75rem; }
        .form-group { margin-bottom: 1.25rem; }
        label { display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 0.35rem; }
        input { width: 100%; padding: 0.7rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.9rem; outline: none; }
        input:focus { border-color: ${themeColor}; }
        .btn-submit { width: 100%; padding: 0.75rem; background: ${themeColor}; color: white; border: none; font-size: 0.95rem; font-weight: 600; border-radius: 6px; cursor: pointer; transition: background 0.2s; }
        .btn-submit:hover { opacity: 0.9; }
        .footer-links { text-align: center; margin-top: 1.25rem; font-size: 0.85rem; color: #64748b; }
        .footer-links a { color: ${themeColor}; text-decoration: none; font-weight: 500; }
      </style>
    </head>
    <body>
      <div class="login-card">
        <h2>${portalTitle}</h2>
        <p>Enter your credentials to access your account</p>
        <form action="${formAction}" method="POST">
          <div class="form-group">
            <label>Username or Email</label>
            <input type="text" name="login_identifier" required autocomplete="username">
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" name="password" required autocomplete="current-password">
          </div>
          <button type="submit" class="btn-submit">Sign In</button>
        </form>
        ${formAction.includes('resident') ? `
          <div class="footer-links">
            New Resident? <a href="/resident-register">Register here</a>
          </div>
        ` : ''}
        <div class="footer-links" style="margin-top: 0.5rem;">
          <a href="/">← Return to Portal Switcher</a>
        </div>
      </div>
    </body>
    </html>
  `;
}

app.get('/resident-login', (req, res) => res.send(renderLoginPage('Resident Portal', '/resident-login', '#2563eb', 'linear-gradient(135deg, #1e3a8a, #3b82f6)')));
app.get('/staff-login', (req, res) => res.send(renderLoginPage('Staff Portal', '/staff-login', '#0f766e', 'linear-gradient(135deg, #134e4a, #0d9488)')));
app.get('/admin-login', (req, res) => res.send(renderLoginPage('Admin Portal', '/admin-login', '#1e293b', 'linear-gradient(135deg, #0f172a, #334155)')));

// AUTHENTICATION LOGIC POST HANDLER
async function processLogin(req, res, expectedRole, redirectPath) {
  const { login_identifier, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE (username = $1 OR email = $1)',
      [login_identifier]
    );

    if (result.rows.length === 0) {
      return res.status(401).send('Invalid credentials. <a href="javascript:history.back()">Try again</a>');
    }

    const user = result.rows[0];

    if (expectedRole !== 'ANY' && user.role !== expectedRole) {
      return res.status(403).send(`Unauthorized for this portal. <a href="javascript:history.back()">Go back</a>`);
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).send('Invalid credentials. <a href="javascript:history.back()">Try again</a>');
    }

    if (user.status === 'PENDING') {
      return res.status(403).send('Your account registration is still PENDING administrator approval. Please wait for verification.');
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).send(`Account state is ${user.status}. Access denied.`);
    }

    // Set Session Variables
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.permissions = user.permissions || [];

    if (user.role === 'RESIDENT') {
      const resInfo = await pool.query('SELECT id, resident_id_number FROM residents WHERE user_id = $1', [user.id]);
      if (resInfo.rows.length > 0) {
        req.session.residentId = resInfo.rows[0].id;
        req.session.residentIdNumber = resInfo.rows[0].resident_id_number;
      }
    }

    await logActivity(user.id, user.role, 'User Login Success', 'AUTH', user.id, req);
    res.redirect(redirectPath);
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).send('Internal system login error.');
  }
}

app.post('/resident-login', (req, res) => processLogin(req, res, 'RESIDENT', '/resident/dashboard'));
app.post('/staff-login', (req, res) => processLogin(req, res, 'STAFF', '/staff/dashboard'));
app.post('/admin-login', (req, res) => processLogin(req, res, 'ADMIN', '/admin/dashboard'));

app.get('/logout', async (req, res) => {
  if (req.session?.userId) {
    await logActivity(req.session.userId, req.session.role, 'User Logout', 'AUTH', req.session.userId, req);
  }
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// A. RESIDENT PORTAL ROUTES
app.get('/resident/dashboard', requireResident, async (req, res) => {
  try {
    const residentRes = await pool.query('SELECT * FROM residents WHERE user_id = $1', [req.session.userId]);
    const resident = residentRes.rows[0];

    const pendingReqs = await pool.query('SELECT COUNT(*) FROM document_requests WHERE resident_id = $1 AND status IN (\'Pending\', \'Under Review\')', [resident.id]);
    const completedDocs = await pool.query('SELECT COUNT(*) FROM document_requests WHERE resident_id = $1 AND status = \'Completed\'', [resident.id]);
    const unreadNotifs = await pool.query('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE', [req.session.userId]);

    const announcements = await pool.query('SELECT * FROM announcements WHERE is_published = TRUE ORDER BY created_at DESC LIMIT 3');
    const recentRequests = await pool.query(`
      SELECT dr.*, dt.title as doc_title 
      FROM document_requests dr 
      JOIN document_types dt ON dr.document_type_id = dt.id 
      WHERE dr.resident_id = $1 
      ORDER BY dr.created_at DESC LIMIT 5
    `, [resident.id]);

    const qrDataUrl = await QRCode.toDataURL(resident.qr_token);

    const content = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Welcome back, ${resident.first_name}!</h1>
          <p style="color: var(--text-light); font-size: 0.9rem;">Resident ID: <strong>${resident.resident_id_number}</strong></p>
        </div>
        <div>
          <a href="/resident/documents/request" class="btn btn-primary">+ Request Document</a>
        </div>
      </div>

      <div class="card-grid">
        <div class="card stat-card">
          <span class="stat-title">Pending Requests</span>
          <span class="stat-value">${pendingReqs.rows[0].count}</span>
        </div>
        <div class="card stat-card">
          <span class="stat-title">Completed Documents</span>
          <span class="stat-value">${completedDocs.rows[0].count}</span>
        </div>
        <div class="card stat-card">
          <span class="stat-title">Unread Notifications</span>
          <span class="stat-value">${unreadNotifs.rows[0].count}</span>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 1.5rem;">
        <div class="card">
          <h2 style="font-size: 1.1rem; margin-bottom: 1rem; font-weight: 700;">Digital Barangay ID Quick Access</h2>
          <div style="text-align: center; padding: 1rem;">
            <img src="${qrDataUrl}" style="width: 150px; height: 150px; border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem;" alt="QR Code">
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: center;">
              <a href="/resident/id" class="btn btn-secondary btn-sm">View ID Card</a>
              <a href="/resident/qr" class="btn btn-secondary btn-sm">Show Full QR</a>
            </div>
          </div>
        </div>

        <div class="card">
          <h2 style="font-size: 1.1rem; margin-bottom: 1rem; font-weight: 700;">Recent Announcements</h2>
          ${announcements.rows.length === 0 ? '<p style="color: var(--text-light); font-size: 0.85rem;">No announcements available.</p>' : ''}
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${announcements.rows.map(a => `
              <div style="border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">
                <strong style="font-size: 0.9rem; color: var(--text-dark);">${a.title}</strong>
                <p style="font-size: 0.8rem; color: var(--text-light); margin-top: 0.2rem;">${a.content.substring(0, 90)}...</p>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="card">
        <h2 style="font-size: 1.1rem; margin-bottom: 1rem; font-weight: 700;">My Recent Document Requests</h2>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Document</th>
                <th>Purpose</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${recentRequests.rows.length === 0 ? '<tr><td colspan="5" style="text-align:center;">No recent requests found.</td></tr>' : ''}
              ${recentRequests.rows.map(r => `
                <tr>
                  <td><strong>${r.request_number}</strong></td>
                  <td>${r.doc_title}</td>
                  <td>${r.purpose}</td>
                  <td>${new Date(r.created_at).toLocaleDateString()}</td>
                  <td><span class="badge badge-${r.status.toLowerCase().replace(' ', '')}">${r.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    res.send(renderLayout({
      title: 'Resident Dashboard',
      portal: 'RESIDENT',
      user: { username: req.session.username, role: req.session.role },
      activeNav: 'dashboard',
      content: content
    }));
  } catch (err) {
    console.error(err);
    res.status(500).send('Error rendering dashboard.');
  }
});

app.get('/resident/profile', requireResident, async (req, res) => {
  const result = await pool.query('SELECT * FROM residents WHERE user_id = $1', [req.session.userId]);
  const r = result.rows[0];
  const age = calculateAge(r.birthdate);

  const content = `
    <div class="page-header">
      <h1 class="page-title">My Profile</h1>
    </div>
    <div class="card" style="max-width: 900px;">
      <div style="display: flex; gap: 1.5rem; align-items: center; margin-bottom: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; flex-wrap: wrap;">
        <img src="${r.photo_url || 'https://via.placeholder.com/120'}" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid var(--accent);" alt="Photo">
        <div>
          <h2>${r.first_name} ${r.middle_name || ''} ${r.last_name} ${r.suffix || ''}</h2>
          <p style="color: var(--text-light);">Resident ID: <strong>${r.resident_id_number}</strong></p>
          <span class="badge badge-approved" style="margin-top: 0.5rem;">Verified Resident</span>
        </div>
      </div>

      <div class="form-row" style="row-gap: 1.25rem;">
        <div><label style="font-weight:600; color:var(--text-light); font-size:0.8rem;">BIRTHDATE & AGE</label><div>${new Date(r.birthdate).toLocaleDateString()} (${age} years old)</div></div>
        <div><label style="font-weight:600; color:var(--text-light); font-size:0.8rem;">SEX</label><div>${r.sex}</div></div>
        <div><label style="font-weight:600; color:var(--text-light); font-size:0.8rem;">CIVIL STATUS</label><div>${r.civil_status}</div></div>
        <div><label style="font-weight:600; color:var(--text-light); font-size:0.8rem;">CONTACT NUMBER</label><div>${r.contact_number}</div></div>
        <div><label style="font-weight:600; color:var(--text-light); font-size:0.8rem;">EMAIL</label><div>${r.email}</div></div>
        <div><label style="font-weight:600; color:var(--text-light); font-size:0.8rem;">ADDRESS</label><div>${r.address}</div></div>
        <div><label style="font-weight:600; color:var(--text-light); font-size:0.8rem;">OCCUPATION</label><div>${r.occupation || 'N/A'}</div></div>
        <div><label style="font-weight:600; color:var(--text-light); font-size:0.8rem;">EDUCATION</label><div>${r.educational_attainment || 'N/A'}</div></div>
        <div><label style="font-weight:600; color:var(--text-light); font-size:0.8rem;">VOTER STATUS</label><div>${r.voter_status ? 'Yes' : 'No'}</div></div>
        <div><label style="font-weight:600; color:var(--text-light); font-size:0.8rem;">SENIOR CITIZEN</label><div>${r.senior_status ? 'Yes' : 'No'}</div></div>
        <div><label style="font-weight:600; color:var(--text-light); font-size:0.8rem;">PWD STATUS</label><div>${r.pwd_status ? 'Yes' : 'No'}</div></div>
        <div><label style="font-weight:600; color:var(--text-light); font-size:0.8rem;">4Ps BENEFICIARY</label><div>${r.four_ps_status ? 'Yes' : 'No'}</div></div>
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'My Profile', portal: 'RESIDENT', user: req.session, activeNav: 'profile', content }));
});

app.get('/resident/household', requireResident, async (req, res) => {
  const residentRes = await pool.query('SELECT household_id FROM residents WHERE user_id = $1', [req.session.userId]);
  const hhId = residentRes.rows[0]?.household_id;

  let content = '';
  if (!hhId) {
    content = `
      <div class="page-header"><h1 class="page-title">My Household</h1></div>
      <div class="card"><p style="color: var(--text-light);">You are not currently linked to any registered household record. Please visit the Barangay Hall to update your household membership.</p></div>
    `;
  } else {
    const hhRes = await pool.query('SELECT * FROM households WHERE id = $1', [hhId]);
    const membersRes = await pool.query('SELECT * FROM residents WHERE household_id = $1', [hhId]);
    const household = hhRes.rows[0];

    content = `
      <div class="page-header">
        <h1 class="page-title">Household No: ${household.household_number}</h1>
      </div>
      <div class="card" style="margin-bottom: 1.5rem;">
        <p><strong>Address:</strong> ${household.address}</p>
        <p><strong>Classification:</strong> ${household.classification}</p>
        <p><strong>Total Registered Members:</strong> ${membersRes.rows.length}</p>
      </div>

      <div class="card">
        <h2 style="font-size: 1.1rem; margin-bottom: 1rem;">Household Members</h2>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Member Name</th>
                <th>Sex</th>
                <th>Civil Status</th>
                <th>Relationship</th>
              </tr>
            </thead>
            <tbody>
              ${membersRes.rows.map(m => `
                <tr>
                  <td><strong>${m.first_name} ${m.last_name}</strong> ${m.id === household.head_resident_id ? '<span class="badge badge-approved">Head</span>' : ''}</td>
                  <td>${m.sex}</td>
                  <td>${m.civil_status}</td>
                  <td>${m.household_relationship || 'Member'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  res.send(renderLayout({ title: 'My Household', portal: 'RESIDENT', user: req.session, activeNav: 'household', content }));
});

app.get('/resident/id', requireResident, async (req, res) => {
  const residentRes = await pool.query('SELECT * FROM residents WHERE user_id = $1', [req.session.userId]);
  const resident = residentRes.rows[0];
  const settingsRes = await pool.query('SELECT * FROM system_settings LIMIT 1');
  const sys = settingsRes.rows[0];

  const qrDataUrl = await QRCode.toDataURL(resident.qr_token);

  const content = `
    <div class="page-header no-print">
      <h1 class="page-title">Digital Barangay Resident ID</h1>
      <button onclick="window.print()" class="btn btn-primary">🖨️ Print ID Card</button>
    </div>

    <div class="printable">
      <div class="id-card">
        <div class="id-header">
          <div style="background: white; color: black; font-weight: bold; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">B</div>
          <div>
            <h4 style="font-size: 0.8rem; font-weight: 700;">${sys.barangay_name.toUpperCase()}</h4>
            <p style="font-size: 0.65rem; color: #cbd5e1;">${sys.municipality}, ${sys.province}</p>
          </div>
        </div>
        <div class="id-body">
          <img src="${resident.photo_url || 'https://via.placeholder.com/80'}" class="id-photo" alt="Photo">
          <div class="id-details">
            <h3>${resident.first_name} ${resident.last_name}</h3>
            <p>ID: <strong>${resident.resident_id_number}</strong></p>
            <p>${resident.address}</p>
            <p>DOB: ${new Date(resident.birthdate).toLocaleDateString()}</p>
          </div>
        </div>
        <div class="id-footer">
          <span>Official Digital ID</span>
          <img src="${qrDataUrl}" style="width: 35px; height: 35px; background: white; padding: 2px; border-radius: 4px;" alt="QR">
        </div>
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'My Resident ID', portal: 'RESIDENT', user: req.session, activeNav: 'id', content }));
});

app.get('/resident/qr', requireResident, async (req, res) => {
  const residentRes = await pool.query('SELECT qr_token, resident_id_number FROM residents WHERE user_id = $1', [req.session.userId]);
  const resident = residentRes.rows[0];
  const qrDataUrl = await QRCode.toDataURL(resident.qr_token, { width: 300 });

  const content = `
    <div class="page-header">
      <h1 class="page-title">My Personal Verification QR</h1>
    </div>
    <div class="card" style="text-align: center; max-width: 450px; margin: 0 auto; padding: 2rem;">
      <p style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 1.5rem;">Present this secure QR code to barangay personnel for instant identity verification and document requests.</p>
      <img src="${qrDataUrl}" style="width: 250px; height: 250px; border: 1px solid var(--border); border-radius: 12px; padding: 1rem;" alt="QR">
      <p style="margin-top: 1rem; font-weight: 600;">Resident ID: ${resident.resident_id_number}</p>
    </div>
  `;

  res.send(renderLayout({ title: 'My QR Code', portal: 'RESIDENT', user: req.session, activeNav: 'qr', content }));
});

app.get('/resident/documents/request', requireResident, async (req, res) => {
  const docTypes = await pool.query('SELECT * FROM document_types ORDER BY title ASC');

  const content = `
    <div class="page-header">
      <h1 class="page-title">Request Official Document</h1>
    </div>
    <div class="card" style="max-width: 600px;">
      <form action="/resident/documents/request" method="POST" enctype="multipart/form-data">
        <div class="form-group">
          <label>Document Type *</label>
          <select name="document_type_id" class="form-control" required>
            <option value="">-- Select Document --</option>
            ${docTypes.rows.map(d => `<option value="${d.id}">${d.title} (Fee: ₱${parseFloat(d.fee).toFixed(2)})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Purpose of Request *</label>
          <textarea name="purpose" class="form-control" rows="3" placeholder="State reason (e.g. Employment, Scholarship, Bank Application)" required></textarea>
        </div>
        <div class="form-group">
          <label>Attach Supporting Document/Requirement (Optional, PDF/JPG)</label>
          <input type="file" name="requirement_file" class="form-control" accept="image/*,application/pdf">
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 1rem;">Submit Request</button>
      </form>
    </div>
  `;

  res.send(renderLayout({ title: 'Request Document', portal: 'RESIDENT', user: req.session, activeNav: 'doc-req', content }));
});

app.post('/resident/documents/request', requireResident, upload.single('requirement_file'), async (req, res) => {
  try {
    const { document_type_id, purpose } = req.body;
    const residentRes = await pool.query('SELECT id FROM residents WHERE user_id = $1', [req.session.userId]);
    const residentId = residentRes.rows[0].id;

    const countRes = await pool.query('SELECT COUNT(*) FROM document_requests');
    const reqNum = `REQ-${new Date().getFullYear()}-${String(parseInt(countRes.rows[0].count) + 1).padStart(5, '0')}`;
    const reqFile = req.file ? `/uploads/${req.file.filename}` : null;

    await pool.query(`
      INSERT INTO document_requests (request_number, resident_id, document_type_id, purpose, requirements_url)
      VALUES ($1, $2, $3, $4, $5)
    `, [reqNum, residentId, document_type_id, purpose, reqFile]);

    await logActivity(req.session.userId, 'RESIDENT', 'Document Requested', 'DOCUMENTS', reqNum, req);

    res.redirect('/resident/documents/history');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error submitting document request.');
  }
});

app.get('/resident/documents/history', requireResident, async (req, res) => {
  const residentRes = await pool.query('SELECT id FROM residents WHERE user_id = $1', [req.session.userId]);
  const requests = await pool.query(`
    SELECT dr.*, dt.title as doc_title, dt.fee 
    FROM document_requests dr 
    JOIN document_types dt ON dr.document_type_id = dt.id 
    WHERE dr.resident_id = $1 
    ORDER BY dr.created_at DESC
  `, [residentRes.rows[0].id]);

  const content = `
    <div class="page-header">
      <h1 class="page-title">My Document Requests</h1>
      <a href="/resident/documents/request" class="btn btn-primary">+ New Request</a>
    </div>

    <div class="card">
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Request No</th>
              <th>Document</th>
              <th>Purpose</th>
              <th>Date Requested</th>
              <th>Status</th>
              <th>Remarks</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${requests.rows.length === 0 ? '<tr><td colspan="7" style="text-align:center;">No document requests found.</td></tr>' : ''}
            ${requests.rows.map(r => `
              <tr>
                <td><strong>${r.request_number}</strong></td>
                <td>${r.doc_title}</td>
                <td>${r.purpose}</td>
                <td>${new Date(r.created_at).toLocaleDateString()}</td>
                <td><span class="badge badge-${r.status.toLowerCase().replace(' ', '')}">${r.status}</span></td>
                <td>${r.remarks || '—'}</td>
                <td>
                  ${(r.status === 'Approved' || r.status === 'Ready' || r.status === 'Completed') 
                    ? `<a href="/resident/documents/print/${r.id}" target="_blank" class="btn btn-secondary btn-sm">🖨️ View & Print</a>`
                    : '—'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'My Requests', portal: 'RESIDENT', user: req.session, activeNav: 'doc-hist', content }));
});

// RESIDENT PRINT GENERATION ROUTE WITH DIRECT OWNERSHIP CHECK
app.get('/resident/documents/print/:id', requireResident, async (req, res) => {
  try {
    const residentRes = await pool.query('SELECT id, first_name, middle_name, last_name, address, civil_status FROM residents WHERE user_id = $1', [req.session.userId]);
    const resident = residentRes.rows[0];

    const reqRes = await pool.query(`
      SELECT dr.*, dt.title as doc_title 
      FROM document_requests dr 
      JOIN document_types dt ON dr.document_type_id = dt.id 
      WHERE dr.id = $1
    `, [req.params.id]);

    if (reqRes.rows.length === 0) return res.status(404).send('Request not found.');

    const docReq = reqRes.rows[0];

    // PRIVACY ENFORCEMENT
    if (docReq.resident_id !== resident.id) {
      return res.status(403).send(getAccessDeniedHTML('Unauthorized access. You can only view your own document records.'));
    }

    const settingsRes = await pool.query('SELECT * FROM system_settings LIMIT 1');
    const sys = settingsRes.rows[0];

    const officialRes = await pool.query("SELECT full_name, position FROM barangay_officials WHERE position LIKE '%Captain%' AND is_active = TRUE LIMIT 1");
    const captain = officialRes.rows[0] ? officialRes.rows[0].full_name : 'HON. BARANGAY CAPTAIN';

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${docReq.doc_title} - ${docReq.request_number}</title>
        <style>
          body { font-family: "Times New Roman", Times, serif; padding: 3rem; background: white; color: black; }
          .header { text-align: center; border-bottom: 2px solid black; padding-bottom: 1rem; margin-bottom: 2rem; }
          .header h3 { font-size: 1.1rem; margin: 0; font-weight: normal; }
          .header h2 { font-size: 1.4rem; margin: 0.2rem 0; font-weight: bold; }
          .doc-title { text-align: center; font-size: 1.8rem; font-weight: bold; text-transform: uppercase; margin: 2rem 0; text-decoration: underline; }
          .body-content { font-size: 1.1rem; line-height: 1.8; text-align: justify; text-indent: 2rem; margin-bottom: 3rem; }
          .signature-section { display: flex; justify-content: space-between; margin-top: 4rem; }
          .sig-box { text-align: center; width: 220px; }
          .sig-line { border-top: 1px solid black; margin-top: 3rem; font-weight: bold; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 2rem; text-align: right;">
          <button onclick="window.print()" style="padding: 0.5rem 1rem; font-size: 1rem; cursor: pointer;">Print Document</button>
        </div>

        <div class="header">
          <h3>Republic of the Philippines</h3>
          <h3>Province of ${sys.province}</h3>
          <h3>${sys.municipality}</h3>
          <h2>OFFICE OF THE BARANGAY CAPTAIN</h2>
          <h3>${sys.barangay_name.toUpperCase()}</h3>
        </div>

        <div class="doc-title">${docReq.doc_title}</div>

        <div class="body-content">
          <p>
            TO WHOM IT MAY CONCERN:
          </p>
          <p style="margin-top: 1.5rem;">
            This is to certify that <strong>${resident.first_name.toUpperCase()} ${resident.middle_name ? resident.middle_name.toUpperCase() + ' ' : ''}${resident.last_name.toUpperCase()}</strong>, 
            of legal age, ${resident.civil_status}, and a bona fide resident of <strong>${resident.address}</strong>, 
            is a person of good moral character and has no derogatory record on file in this barangay.
          </p>
          <p style="margin-top: 1.5rem;">
            This certification is issued upon the request of the above-named person for the purpose of: 
            <strong>${docReq.purpose.toUpperCase()}</strong>.
          </p>
          <p style="margin-top: 1.5rem;">
            Given this <strong>${new Date().getDate()}th</strong> day of <strong>${new Date().toLocaleString('default', { month: 'long' })}</strong>, <strong>${new Date().getFullYear()}</strong> at ${sys.barangay_name}.
          </p>
        </div>

        <div class="signature-section">
          <div class="sig-box">
            <p>Control No: <strong>${docReq.request_number}</strong></p>
            <p>Date Issued: ${new Date().toLocaleDateString()}</p>
          </div>
          <div class="sig-box">
            <div class="sig-line">${captain}</div>
            <p>Punong Barangay</p>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error generating document print view.');
  }
});

app.get('/resident/concerns', requireResident, async (req, res) => {
  const residentRes = await pool.query('SELECT id FROM residents WHERE user_id = $1', [req.session.userId]);
  const concerns = await pool.query('SELECT * FROM resident_concerns WHERE resident_id = $1 ORDER BY created_at DESC', [residentRes.rows[0].id]);

  const content = `
    <div class="page-header">
      <h1 class="page-title">My Service Requests & Concerns</h1>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem;">
      <div class="card">
        <h2 style="font-size: 1.1rem; margin-bottom: 1rem;">Submit New Concern</h2>
        <form action="/resident/concerns" method="POST" enctype="multipart/form-data">
          <div class="form-group">
            <label>Subject / Topic *</label>
            <input type="text" name="subject" class="form-control" placeholder="Brief title" required>
          </div>
          <div class="form-group">
            <label>Detailed Description *</label>
            <textarea name="description" class="form-control" rows="4" placeholder="Describe your inquiry or concern in detail" required></textarea>
          </div>
          <div class="form-group">
            <label>Attachment (Optional)</label>
            <input type="file" name="attachment" class="form-control" accept="image/*,application/pdf">
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;">Submit Inquiry</button>
        </form>
      </div>

      <div class="card">
        <h2 style="font-size: 1.1rem; margin-bottom: 1rem;">My Submitted Records</h2>
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          ${concerns.rows.length === 0 ? '<p style="color:var(--text-light);">No concerns submitted.</p>' : ''}
          ${concerns.rows.map(c => `
            <div style="border: 1px solid var(--border); border-radius: 8px; padding: 0.85rem;">
              <div style="display:flex; justify-between; align-items:center;">
                <strong>${c.subject}</strong>
                <span class="badge badge-${c.status.toLowerCase().replace(' ', '')}">${c.status}</span>
              </div>
              <p style="font-size: 0.85rem; color: var(--text-dark); margin-top: 0.4rem;">${c.description}</p>
              ${c.response ? `<div style="margin-top:0.5rem; background:#f1f5f9; padding:0.5rem; border-radius:4px; font-size:0.8rem;"><strong>Barangay Response:</strong> ${c.response}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'Concerns', portal: 'RESIDENT', user: req.session, activeNav: 'concerns', content }));
});

app.post('/resident/concerns', requireResident, upload.single('attachment'), async (req, res) => {
  const { subject, description } = req.body;
  const residentRes = await pool.query('SELECT id FROM residents WHERE user_id = $1', [req.session.userId]);
  const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;

  await pool.query(
    'INSERT INTO resident_concerns (resident_id, subject, description, attachment_url) VALUES ($1, $2, $3, $4)',
    [residentRes.rows[0].id, subject, description, fileUrl]
  );

  await logActivity(req.session.userId, 'RESIDENT', 'Submitted Concern', 'CONCERNS', '', req);
  res.redirect('/resident/concerns');
});

app.get('/resident/announcements', requireResident, async (req, res) => {
  const announcements = await pool.query('SELECT * FROM announcements WHERE is_published = TRUE ORDER BY created_at DESC');

  const content = `
    <div class="page-header">
      <h1 class="page-title">Community Announcements</h1>
    </div>
    <div style="display: flex; flex-direction: column; gap: 1rem; max-width: 800px;">
      ${announcements.rows.length === 0 ? '<p>No published announcements.</p>' : ''}
      ${announcements.rows.map(a => `
        <div class="card">
          <h2 style="font-size: 1.2rem; color: var(--accent);">${a.title}</h2>
          <p style="font-size: 0.75rem; color: var(--text-light); margin-bottom: 0.75rem;">Published on ${new Date(a.publication_date).toLocaleDateString()}</p>
          <p style="font-size: 0.95rem; line-height: 1.5;">${a.content}</p>
        </div>
      `).join('')}
    </div>
  `;

  res.send(renderLayout({ title: 'Announcements', portal: 'RESIDENT', user: req.session, activeNav: 'announcements', content }));
});

app.get('/resident/notifications', requireResident, async (req, res) => {
  const notifs = await pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [req.session.userId]);
  await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.session.userId]);

  const content = `
    <div class="page-header">
      <h1 class="page-title">Notifications</h1>
    </div>
    <div class="card" style="max-width: 700px;">
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${notifs.rows.length === 0 ? '<p style="color:var(--text-light);">No notifications.</p>' : ''}
        ${notifs.rows.map(n => `
          <div style="padding: 0.75rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between;">
            <div>
              <p style="font-size:0.9rem;">${n.message}</p>
              <span style="font-size:0.75rem; color: var(--text-light);">${new Date(n.created_at).toLocaleString()}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'Notifications', portal: 'RESIDENT', user: req.session, activeNav: 'notifications', content }));
});

app.get('/resident/settings', requireResident, async (req, res) => {
  const content = `
    <div class="page-header">
      <h1 class="page-title">Account Settings</h1>
    </div>
    <div class="card" style="max-width: 500px;">
      <h2 style="font-size: 1.1rem; margin-bottom: 1rem;">Change Password</h2>
      <form action="/resident/settings/password" method="POST">
        <div class="form-group">
          <label>Current Password</label>
          <input type="password" name="current_password" class="form-control" required>
        </div>
        <div class="form-group">
          <label>New Password</label>
          <input type="password" name="new_password" class="form-control" required>
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Update Password</button>
      </form>
    </div>
  `;

  res.send(renderLayout({ title: 'Settings', portal: 'RESIDENT', user: req.session, activeNav: 'settings', content }));
});

app.post('/resident/settings/password', requireResident, async (req, res) => {
  const { current_password, new_password } = req.body;
  const userRes = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);

  const match = await bcrypt.compare(current_password, userRes.rows[0].password_hash);
  if (!match) return res.status(400).send('Incorrect current password. <a href="javascript:history.back()">Go Back</a>');

  const hashed = await bcrypt.hash(new_password, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashed, req.session.userId]);

  res.send('<script>alert("Password updated successfully!"); window.location.href="/resident/settings";</script>');
});


// B & C. ADMIN & STAFF PORTAL IMPLEMENTATION
app.get('/admin/dashboard', requireAdmin, async (req, res) => {
  const totalResidents = await pool.query('SELECT COUNT(*) FROM residents');
  const pendingApps = await pool.query("SELECT COUNT(*) FROM users WHERE status = 'PENDING'");
  const totalHouseholds = await pool.query('SELECT COUNT(*) FROM households');
  const pendingDocs = await pool.query("SELECT COUNT(*) FROM document_requests WHERE status IN ('Pending', 'Under Review')");
  const openBlotter = await pool.query("SELECT COUNT(*) FROM blotter_records WHERE status IN ('Open', 'Under Investigation')");

  const recentLogs = await pool.query('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 5');

  const content = `
    <div class="page-header">
      <h1 class="page-title">System Overview Dashboard</h1>
    </div>

    <div class="card-grid">
      <div class="card stat-card">
        <span class="stat-title">Total Residents</span>
        <span class="stat-value">${totalResidents.rows[0].count}</span>
      </div>
      <div class="card stat-card">
        <span class="stat-title">Pending Approvals</span>
        <span class="stat-value" style="color: var(--warning);">${pendingApps.rows[0].count}</span>
      </div>
      <div class="card stat-card">
        <span class="stat-title">Total Households</span>
        <span class="stat-value">${totalHouseholds.rows[0].count}</span>
      </div>
      <div class="card stat-card">
        <span class="stat-title">Pending Document Requests</span>
        <span class="stat-value">${pendingDocs.rows[0].count}</span>
      </div>
      <div class="card stat-card">
        <span class="stat-title">Active Blotter Cases</span>
        <span class="stat-value" style="color: var(--danger);">${openBlotter.rows[0].count}</span>
      </div>
    </div>

    <div class="card">
      <h2 style="font-size: 1.1rem; margin-bottom: 1rem;">Recent System Activity Logs</h2>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Role</th>
              <th>Action</th>
              <th>Module</th>
              <th>IP Address</th>
            </tr>
          </thead>
          <tbody>
            ${recentLogs.rows.map(l => `
              <tr>
                <td>${new Date(l.created_at).toLocaleString()}</td>
                <td><span class="badge badge-pending">${l.user_role || 'SYSTEM'}</span></td>
                <td>${l.action}</td>
                <td>${l.module}</td>
                <td>${l.ip_address}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'Admin Dashboard', portal: 'ADMIN', user: req.session, activeNav: 'dashboard', content }));
});

// STAFF DASHBOARD
app.get('/staff/dashboard', requireStaff, async (req, res) => {
  const totalResidents = await pool.query('SELECT COUNT(*) FROM residents');
  const pendingDocs = await pool.query("SELECT COUNT(*) FROM document_requests WHERE status IN ('Pending', 'Under Review')");

  const content = `
    <div class="page-header">
      <h1 class="page-title">Staff Dashboard</h1>
    </div>
    <div class="card-grid">
      <div class="card stat-card">
        <span class="stat-title">Total Registered Residents</span>
        <span class="stat-value">${totalResidents.rows[0].count}</span>
      </div>
      <div class="card stat-card">
        <span class="stat-title">Pending Document Requests</span>
        <span class="stat-value">${pendingDocs.rows[0].count}</span>
      </div>
    </div>
    <div class="card">
      <p style="color: var(--text-light);">Welcome to the Staff Management Interface. Use the sidebar to access your permitted module operations.</p>
    </div>
  `;

  res.send(renderLayout({ title: 'Staff Dashboard', portal: 'STAFF', user: req.session, activeNav: 'dashboard', content }));
});

// ADMIN/STAFF: RESIDENT MANAGEMENT ROUTE WITH FULL PAGINATION & SEARCH
const handleResidentList = async (req, res, portalType) => {
  const search = req.query.search || '';
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  let query = 'SELECT r.*, u.status as account_status FROM residents r JOIN users u ON r.user_id = u.id WHERE 1=1';
  let countQuery = 'SELECT COUNT(*) FROM residents r JOIN users u ON r.user_id = u.id WHERE 1=1';
  const queryParams = [];

  if (search) {
    queryParams.push(`%${search}%`);
    const searchFilter = ` AND (r.first_name ILIKE $${queryParams.length} OR r.last_name ILIKE $${queryParams.length} OR r.resident_id_number ILIKE $${queryParams.length})`;
    query += searchFilter;
    countQuery += searchFilter;
  }

  query += ` ORDER BY r.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

  const residents = await pool.query(query, queryParams);
  const totalCountRes = await pool.query(countQuery, queryParams);
  const totalPages = Math.ceil(parseInt(totalCountRes.rows[0].count) / limit);

  const content = `
    <div class="page-header">
      <h1 class="page-title">Resident Records</h1>
      <form style="display:flex; gap:0.5rem;" method="GET">
        <input type="text" name="search" class="form-control" placeholder="Search name or ID..." value="${search}">
        <button type="submit" class="btn btn-primary">Search</button>
      </form>
    </div>

    <div class="card">
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Resident ID</th>
              <th>Full Name</th>
              <th>Sex</th>
              <th>Civil Status</th>
              <th>Contact Number</th>
              <th>Account Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${residents.rows.length === 0 ? '<tr><td colspan="7" style="text-align:center;">No records found.</td></tr>' : ''}
            ${residents.rows.map(r => `
              <tr>
                <td><strong>${r.resident_id_number}</strong></td>
                <td>${r.first_name} ${r.last_name}</td>
                <td>${r.sex}</td>
                <td>${r.civil_status}</td>
                <td>${r.contact_number}</td>
                <td><span class="badge badge-${r.account_status.toLowerCase()}">${r.account_status}</span></td>
                <td>
                  <a href="/${portalType.toLowerCase()}/residents/${r.id}" class="btn btn-secondary btn-sm">View Details</a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Pagination Controls -->
      <div style="display:flex; justify-between; align-items:center; margin-top: 1rem;">
        <span>Page ${page} of ${totalPages || 1}</span>
        <div style="display:flex; gap:0.5rem;">
          ${page > 1 ? `<a href="?page=${page-1}&search=${search}" class="btn btn-secondary btn-sm">Previous</a>` : ''}
          ${page < totalPages ? `<a href="?page=${page+1}&search=${search}" class="btn btn-secondary btn-sm">Next</a>` : ''}
        </div>
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'Resident Management', portal: portalType, user: req.session, activeNav: 'residents', content }));
};

app.get('/admin/residents', requireAdmin, (req, res) => handleResidentList(req, res, 'ADMIN'));
app.get('/staff/residents', requireStaff, requirePermission('residents'), (req, res) => handleResidentList(req, res, 'STAFF'));

// VIEW SINGLE RESIDENT PROFILE
const handleSingleResidentView = async (req, res, portalType) => {
  const result = await pool.query('SELECT r.*, u.status as account_status, u.username FROM residents r JOIN users u ON r.user_id = u.id WHERE r.id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).send('Resident record not found.');
  const r = result.rows[0];

  const content = `
    <div class="page-header">
      <h1 class="page-title">Resident Profile: ${r.first_name} ${r.last_name}</h1>
      <a href="javascript:history.back()" class="btn btn-secondary">Back</a>
    </div>

    <div class="card">
      <div style="display:flex; gap:2rem; flex-wrap:wrap; margin-bottom: 1.5rem;">
        <img src="${r.photo_url || 'https://via.placeholder.com/150'}" style="width:150px; height:150px; border-radius:8px; object-fit:cover;" alt="Photo">
        <div>
          <h2>${r.first_name} ${r.middle_name || ''} ${r.last_name} ${r.suffix || ''}</h2>
          <p>Resident ID Number: <strong>${r.resident_id_number}</strong></p>
          <p>Username: ${r.username}</p>
          <p>Account Status: <span class="badge badge-${r.account_status.toLowerCase()}">${r.account_status}</span></p>
          ${r.valid_id_url ? `<a href="${r.valid_id_url}" target="_blank" class="btn btn-secondary btn-sm" style="margin-top:0.5rem;">View Uploaded Valid ID</a>` : ''}
        </div>
      </div>

      <div class="form-row">
        <div><strong>Birthdate:</strong> ${new Date(r.birthdate).toLocaleDateString()} (${calculateAge(r.birthdate)} yrs)</div>
        <div><strong>Sex:</strong> ${r.sex}</div>
        <div><strong>Civil Status:</strong> ${r.civil_status}</div>
        <div><strong>Contact:</strong> ${r.contact_number}</div>
        <div><strong>Email:</strong> ${r.email}</div>
        <div><strong>Address:</strong> ${r.address}</div>
        <div><strong>Occupation:</strong> ${r.occupation || 'N/A'}</div>
        <div><strong>Education:</strong> ${r.educational_attainment || 'N/A'}</div>
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'Resident View', portal: portalType, user: req.session, activeNav: 'residents', content }));
};

app.get('/admin/residents/:id', requireAdmin, (req, res) => handleSingleResidentView(req, res, 'ADMIN'));
app.get('/staff/residents/:id', requireStaff, requirePermission('residents'), (req, res) => handleSingleResidentView(req, res, 'STAFF'));

// ADMIN: PENDING USER APPROVALS
app.get('/admin/accounts', requireAdmin, async (req, res) => {
  const pendingUsers = await pool.query(`
    SELECT u.id as user_id, u.username, u.email, u.created_at, r.id as resident_id, r.first_name, r.last_name, r.valid_id_url, r.photo_url 
    FROM users u 
    LEFT JOIN residents r ON u.id = r.user_id 
    WHERE u.status = 'PENDING'
  `);

  const content = `
    <div class="page-header">
      <h1 class="page-title">Pending Resident Approvals</h1>
    </div>

    <div class="card">
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Applicant</th>
              <th>Username / Email</th>
              <th>Registration Date</th>
              <th>Submitted Documents</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${pendingUsers.rows.length === 0 ? '<tr><td colspan="5" style="text-align:center;">No pending account approvals.</td></tr>' : ''}
            ${pendingUsers.rows.map(u => `
              <tr>
                <td><strong>${u.first_name \vert{}\vert{} 'N/A'}${u.last_name || ''}</strong></td>
                <td>${u.username}<br><span style="font-size:0.8rem; color:var(--text-light);">${u.email}</span></td>
                <td>${new Date(u.created_at).toLocaleDateString()}</td>
                <td>
                  ${u.photo_url ? `<a href="${u.photo_url}" target="_blank" class="btn btn-secondary btn-sm">Photo</a>` : ''}
                  ${u.valid_id_url ? `<a href="${u.valid_id_url}" target="_blank" class="btn btn-secondary btn-sm">Valid ID</a>` : ''}
                </td>
                <td>
                  <form action="/admin/accounts/approve/${u.user_id}" method="POST" style="display:inline;">
                    <button type="submit" class="btn btn-success btn-sm">Approve</button>
                  </form>
                  <form action="/admin/accounts/reject/${u.user_id}" method="POST" style="display:inline;">
                    <button type="submit" class="btn btn-danger btn-sm">Reject</button>
                  </form>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'Pending Approvals', portal: 'ADMIN', user: req.session, activeNav: 'accounts', content }));
});

app.post('/admin/accounts/approve/:userId', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [req.params.userId]);
    await client.query("INSERT INTO notifications (user_id, message, type) VALUES ($1, 'Your resident registration account has been APPROVED. You can now access full portal services.', 'SUCCESS')", [req.params.userId]);
    await client.query('COMMIT');

    await logActivity(req.session.userId, 'ADMIN', 'Approved Resident User Account', 'USER_MANAGEMENT', req.params.userId, req);
    res.redirect('/admin/accounts');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).send('Error approving account.');
  } finally {
    client.release();
  }
});

app.post('/admin/accounts/reject/:userId', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE users SET status = 'REJECTED' WHERE id = $1", [req.params.userId]);
    await client.query("INSERT INTO notifications (user_id, message, type) VALUES ($1, 'Your resident registration application was REJECTED. Please contact the barangay hall for details.', 'DANGER')", [req.params.userId]);
    await client.query('COMMIT');

    await logActivity(req.session.userId, 'ADMIN', 'Rejected Resident User Account', 'USER_MANAGEMENT', req.params.userId, req);
    res.redirect('/admin/accounts');
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).send('Error rejecting account.');
  } finally {
    client.release();
  }
});

// HOUSEHOLD MANAGEMENT (ADMIN/STAFF)
const handleHouseholdList = async (req, res, portalType) => {
  const households = await pool.query(`
    SELECT h.*, r.first_name as head_first, r.last_name as head_last 
    FROM households h 
    LEFT JOIN residents r ON h.head_resident_id = r.id 
    ORDER BY h.created_at DESC
  `);

  const content = `
    <div class="page-header">
      <h1 class="page-title">Barangay Households</h1>
      ${portalType === 'ADMIN' ? '<a href="/admin/households/create" class="btn btn-primary">+ Register Household</a>' : ''}
    </div>

    <div class="card">
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Household No</th>
              <th>Head of Household</th>
              <th>Address</th>
              <th>Classification</th>
              <th>Date Created</th>
            </tr>
          </thead>
          <tbody>
            ${households.rows.length === 0 ? '<tr><td colspan="5" style="text-align:center;">No households registered.</td></tr>' : ''}
            ${households.rows.map(h => `
              <tr>
                <td><strong>${h.household_number}</strong></td>
                <td>${h.head_first ? `${h.head_first} ${h.head_last}` : 'Unassigned'}</td>
                <td>${h.address}</td>
                <td>${h.classification}</td>
                <td>${new Date(h.created_at).toLocaleDateString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'Households', portal: portalType, user: req.session, activeNav: 'households', content }));
};

app.get('/admin/households', requireAdmin, (req, res) => handleHouseholdList(req, res, 'ADMIN'));
app.get('/staff/households', requireStaff, requirePermission('households'), (req, res) => handleHouseholdList(req, res, 'STAFF'));

app.get('/admin/households/create', requireAdmin, async (req, res) => {
  const residents = await pool.query('SELECT id, first_name, last_name, resident_id_number FROM residents ORDER BY first_name ASC');

  const content = `
    <div class="page-header"><h1 class="page-title">Register New Household</h1></div>
    <div class="card" style="max-width: 600px;">
      <form action="/admin/households/create" method="POST">
        <div class="form-group">
          <label>Household Number *</label>
          <input type="text" name="household_number" class="form-control" value="HH-${Date.now().toString().substring(6)}" required>
        </div>
        <div class="form-group">
          <label>Head of Household *</label>
          <select name="head_resident_id" class="form-control" required>
            <option value="">-- Select Resident --</option>
            ${residents.rows.map(r => `<option value="${r.id}">${r.first_name} ${r.last_name} (${r.resident_id_number})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Address *</label>
          <input type="text" name="address" class="form-control" required>
        </div>
        <div class="form-group">
          <label>Classification</label>
          <select name="classification" class="form-control">
            <option value="Residential">Residential</option>
            <option value="Commercial/Residential">Commercial/Residential</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Save Household</button>
      </form>
    </div>
  `;

  res.send(renderLayout({ title: 'Create Household', portal: 'ADMIN', user: req.session, activeNav: 'households', content }));
});

app.post('/admin/households/create', requireAdmin, async (req, res) => {
  const { household_number, head_resident_id, address, classification } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hhRes = await client.query(
      `INSERT INTO households (household_number, head_resident_id, address, classification)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [household_number, head_resident_id, address, classification]
    );

    // Link head resident to household
    await client.query('UPDATE residents SET household_id = $1, household_relationship = $2 WHERE id = $3', [hhRes.rows[0].id, 'Head', head_resident_id]);

    await client.query('COMMIT');
    await logActivity(req.session.userId, 'ADMIN', 'Created Household Record', 'HOUSEHOLDS', household_number, req);
    res.redirect('/admin/households');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).send('Error creating household.');
  } finally {
    client.release();
  }
});

// ADMIN: STAFF MANAGEMENT & ROLE PERMISSIONS
app.get('/admin/staff', requireAdmin, async (req, res) => {
  const staffUsers = await pool.query("SELECT * FROM users WHERE role = 'STAFF' ORDER BY created_at DESC");

  const content = `
    <div class="page-header">
      <h1 class="page-title">Staff Account Management</h1>
      <a href="/admin/staff/create" class="btn btn-primary">+ Create Staff Account</a>
    </div>

    <div class="card">
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Permissions</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            ${staffUsers.rows.length === 0 ? '<tr><td colspan="5" style="text-align:center;">No staff accounts configured.</td></tr>' : ''}
            ${staffUsers.rows.map(s => `
              <tr>
                <td><strong>${s.username}</strong></td>
                <td>${s.email}</td>
                <td>${JSON.stringify(s.permissions)}</td>
                <td><span class="badge badge-${s.status.toLowerCase()}">${s.status}</span></td>
                <td>${new Date(s.created_at).toLocaleDateString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'Staff Management', portal: 'ADMIN', user: req.session, activeNav: 'staff', content }));
});

app.get('/admin/staff/create', requireAdmin, (req, res) => {
  const content = `
    <div class="page-header"><h1 class="page-title">Create Staff Account</h1></div>
    <div class="card" style="max-width: 500px;">
      <form action="/admin/staff/create" method="POST">
        <div class="form-group">
          <label>Username *</label>
          <input type="text" name="username" class="form-control" required>
        </div>
        <div class="form-group">
          <label>Email *</label>
          <input type="email" name="email" class="form-control" required>
        </div>
        <div class="form-group">
          <label>Password *</label>
          <input type="password" name="password" class="form-control" required>
        </div>
        <div class="form-group">
          <label>Module Permissions</label>
          <div style="display:flex; flex-direction:column; gap:0.35rem; margin-top:0.35rem;">
            <label><input type="checkbox" name="permissions" value="residents"> Residents Management</label>
            <label><input type="checkbox" name="permissions" value="households"> Households</label>
            <label><input type="checkbox" name="permissions" value="documents"> Documents & Requests</label>
            <label><input type="checkbox" name="permissions" value="blotter"> Blotter Management</label>
            <label><input type="checkbox" name="permissions" value="qr"> QR Verification</label>
            <label><input type="checkbox" name="permissions" value="reports"> Reports</label>
          </div>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;">Create Account</button>
      </form>
    </div>
  `;

  res.send(renderLayout({ title: 'Create Staff', portal: 'ADMIN', user: req.session, activeNav: 'staff', content }));
});

app.post('/admin/staff/create', requireAdmin, async (req, res) => {
  const { username, email, password, permissions } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const permArray = Array.isArray(permissions) ? permissions : (permissions ? [permissions] : []);

    await pool.query(
      `INSERT INTO users (username, email, password_hash, role, status, permissions)
       VALUES ($1, $2, $3, 'STAFF', 'ACTIVE', $4)`,
      [username, email, hashed, JSON.stringify(permArray)]
    );

    await logActivity(req.session.userId, 'ADMIN', 'Created Staff Account', 'STAFF_MANAGEMENT', username, req);
    res.redirect('/admin/staff');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error creating staff account.');
  }
});

// DOCUMENT REQUEST PROCESSING (ADMIN & STAFF)
const handleDocumentRequestList = async (req, res, portalType) => {
  const requests = await pool.query(`
    SELECT dr.*, dt.title as doc_title, r.first_name, r.last_name, r.resident_id_number
    FROM document_requests dr 
    JOIN document_types dt ON dr.document_type_id = dt.id 
    JOIN residents r ON dr.resident_id = r.id 
    ORDER BY dr.created_at DESC
  `);

  const content = `
    <div class="page-header">
      <h1 class="page-title">Document Processing Requests</h1>
    </div>

    <div class="card">
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Request ID</th>
              <th>Resident</th>
              <th>Document</th>
              <th>Purpose</th>
              <th>Status</th>
              <th>Actions / Update</th>
            </tr>
          </thead>
          <tbody>
            ${requests.rows.length === 0 ? '<tr><td colspan="6" style="text-align:center;">No document requests found.</td></tr>' : ''}
            ${requests.rows.map(r => `
              <tr>
                <td><strong>${r.request_number}</strong></td>
                <td>${r.first_name}${r.last_name}<br><span style="font-size:0.75rem; color:var(--text-light);">${r.resident_id_number}</span></td>
                <td>${r.doc_title}</td>
                <td>${r.purpose}</td>
                <td><span class="badge badge-${r.status.toLowerCase().replace(' ', '')}">${r.status}</span></td>
                <td>
                  <form action="/${portalType.toLowerCase()}/document-requests/status/${r.id}" method="POST" style="display:inline-flex; gap:0.25rem;">
                    <select name="status" style="font-size:0.8rem; padding:0.2rem;">
                      <option value="Pending" ${r.status==='Pending'?'selected':''}>Pending</option>
                      <option value="Under Review" ${r.status==='Under Review'?'selected':''}>Under Review</option>
                      <option value="Approved" ${r.status==='Approved'?'selected':''}>Approved</option>
                      <option value="Ready" ${r.status==='Ready'?'selected':''}>Ready</option>
                      <option value="Completed" ${r.status==='Completed'?'selected':''}>Completed</option>
                      <option value="Rejected" ${r.status==='Rejected'?'selected':''}>Rejected</option>
                    </select>
                    <button type="submit" class="btn btn-secondary btn-sm">Update</button>
                  </form>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'Document Requests', portal: portalType, user: req.session, activeNav: 'doc-requests', content }));
};

app.get('/admin/document-requests', requireAdmin, (req, res) => handleDocumentRequestList(req, res, 'ADMIN'));
app.get('/staff/document-requests', requireStaff, requirePermission('documents'), (req, res) => handleDocumentRequestList(req, res, 'STAFF'));

const handleDocumentStatusUpdate = async (req, res) => {
  const { status } = req.body;
  const requestId = req.params.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE document_requests SET status = $1, processed_by_user_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [status, req.session.userId, requestId]);

    // Retrieve resident user_id to notify
    const reqRes = await client.query('SELECT r.user_id, dr.request_number FROM document_requests dr JOIN residents r ON dr.resident_id = r.id WHERE dr.id = $1', [requestId]);
    if (reqRes.rows.length > 0) {
      const { user_id, request_number } = reqRes.rows[0];
      await client.query('INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, $3)', [user_id, `Your document request ${request_number} status has been updated to: ${status}.`, 'INFO']);
    }

    await client.query('COMMIT');
    await logActivity(req.session.userId, req.session.role, `Updated Request Status to ${status}`, 'DOCUMENTS', requestId, req);

    res.redirect('back');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).send('Error updating request status.');
  } finally {
    client.release();
  }
};

app.post('/admin/document-requests/status/:id', requireAdmin, handleDocumentStatusUpdate);
app.post('/staff/document-requests/status/:id', requireStaff, requirePermission('documents'), handleDocumentStatusUpdate);

// BLOTTER MANAGEMENT (ADMIN/STAFF ONLY)
const handleBlotterList = async (req, res, portalType) => {
  const records = await pool.query('SELECT * FROM blotter_records ORDER BY created_at DESC');

  const content = `
    <div class="page-header">
      <h1 class="page-title">Barangay Incident & Blotter Records</h1>
      <a href="/${portalType.toLowerCase()}/blotter/create" class="btn btn-primary">+ File Blotter Case</a>
    </div>

    <div class="card">
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Case No</th>
              <th>Complainant</th>
              <th>Respondent</th>
              <th>Incident Type</th>
              <th>Date & Time</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${records.rows.length === 0 ? '<tr><td colspan="7" style="text-align:center;">No blotter records filed.</td></tr>' : ''}
            ${records.rows.map(b => `
              <tr>
                <td><strong>${b.case_number}</strong></td>
                <td>${b.complainant_name}</td>
                <td>${b.respondent_name}</td>
                <td>${b.incident_type}</td>
                <td>${new Date(b.incident_date).toLocaleDateString()}${b.incident_time}</td>
                <td><span class="badge badge-${b.status.toLowerCase().replace(' ', '')}">${b.status}</span></td>
                <td>
                  <a href="/${portalType.toLowerCase()}/blotter/${b.id}" class="btn btn-secondary btn-sm">View Case</a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'Blotter Records', portal: portalType, user: req.session, activeNav: 'blotter', content }));
};

app.get('/admin/blotter', requireAdmin, (req, res) => handleBlotterList(req, res, 'ADMIN'));
app.get('/staff/blotter', requireStaff, requirePermission('blotter'), (req, res) => handleBlotterList(req, res, 'STAFF'));

const handleBlotterCreateView = (req, res, portalType) => {
  const content = `
    <div class="page-header"><h1 class="page-title">File New Incident Blotter</h1></div>
    <div class="card" style="max-width: 700px;">
      <form action="/${portalType.toLowerCase()}/blotter/create" method="POST" enctype="multipart/form-data">
        <div class="form-row">
          <div class="form-group">
            <label>Complainant Name *</label>
            <input type="text" name="complainant_name" class="form-control" required>
          </div>
          <div class="form-group">
            <label>Respondent Name *</label>
            <input type="text" name="respondent_name" class="form-control" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Incident Type *</label>
            <input type="text" name="incident_type" class="form-control" placeholder="e.g. Noise Complaint, Property Dispute, Physical Altercation" required>
          </div>
          <div class="form-group">
            <label>Incident Date *</label>
            <input type="date" name="incident_date" class="form-control" required>
          </div>
          <div class="form-group">
            <label>Incident Time *</label>
            <input type="time" name="incident_time" class="form-control" required>
          </div>
        </div>
        <div class="form-group">
          <label>Location *</label>
          <input type="text" name="location" class="form-control" required>
        </div>
        <div class="form-group">
          <label>Detailed Incident Description *</label>
          <textarea name="description" class="form-control" rows="4" required></textarea>
        </div>
        <div class="form-group">
          <label>Witnesses (Optional)</label>
          <input type="text" name="witnesses" class="form-control">
        </div>
        <div class="form-group">
          <label>Attachment Document/Photo (Optional)</label>
          <input type="file" name="attachment" class="form-control" accept="image/*,application/pdf">
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;">Record Blotter Case</button>
      </form>
    </div>
  `;

  res.send(renderLayout({ title: 'New Blotter', portal: portalType, user: req.session, activeNav: 'blotter', content }));
};

app.get('/admin/blotter/create', requireAdmin, (req, res) => handleBlotterCreateView(req, res, 'ADMIN'));
app.get('/staff/blotter/create', requireStaff, requirePermission('blotter'), (req, res) => handleBlotterCreateView(req, res, 'STAFF'));

const handleBlotterCreateSubmit = async (req, res, portalType) => {
  const { complainant_name, respondent_name, incident_type, incident_date, incident_time, location, description, witnesses } = req.body;
  const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;

  const countRes = await pool.query('SELECT COUNT(*) FROM blotter_records');
  const caseNum = `BLOT-${new Date().getFullYear()}-${String(parseInt(countRes.rows[0].count) + 1).padStart(5, '0')}`;

  await pool.query(`
    INSERT INTO blotter_records (
      case_number, complainant_name, respondent_name, incident_type,
      incident_date, incident_time, location, description, witnesses,
      attachment_url, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, [caseNum, complainant_name, respondent_name, incident_type, incident_date, incident_time, location, description, witnesses || null, fileUrl, req.session.userId]);

  await logActivity(req.session.userId, req.session.role, 'Filed Incident Blotter', 'BLOTTER', caseNum, req);
  res.redirect(`/${portalType.toLowerCase()}/blotter`);
};

app.post('/admin/blotter/create', requireAdmin, upload.single('attachment'), (req, res) => handleBlotterCreateSubmit(req, res, 'ADMIN'));
app.post('/staff/blotter/create', requireStaff, requirePermission('blotter'), upload.single('attachment'), (req, res) => handleBlotterCreateSubmit(req, res, 'STAFF'));

// QR VERIFICATION SCANNER (ADMIN & STAFF)
const handleQRScannerView = (req, res, portalType) => {
  const content = `
    <div class="page-header">
      <h1 class="page-title">Barangay Resident QR Verification</h1>
    </div>

    <div class="card" style="max-width: 500px; margin: 0 auto; text-align: center;">
      <p style="color: var(--text-light); margin-bottom: 1.5rem;">Enter or scan the Resident's QR Verification Token to verify authentic registry details.</p>
      
      <form id="qr-form" onsubmit="event.preventDefault(); verifyQR();">
        <div class="form-group">
          <input type="text" id="qr_token" class="form-control" placeholder="Scan or enter QR Code Token (e.g. QR-123...)" required style="text-align:center; font-weight:bold;">
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Verify QR Token</button>
      </form>

      <div id="qr-result" style="margin-top: 1.5rem; text-align: left; display: none;"></div>
    </div>

    <script>
      async function verifyQR() {
        const token = document.getElementById('qr_token').value;
        const resultDiv = document.getElementById('qr-result');
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<p>Verifying token...</p>';

        try {
          const res = await fetch('/api/verify-qr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qr_token: token })
          });
          const data = await res.json();

          if (res.ok && data.valid) {
            resultDiv.innerHTML = \`
              <div style="border: 2px solid var(--success); border-radius: 8px; padding: 1rem; background: #f0fdf4;">
                <h3 style="color: var(--success); margin-bottom: 0.5rem;">✅ Valid Resident QR</h3>
                <p><strong>Resident ID:</strong> \${data.resident.resident_id_number}</p>
                <p><strong>Name:</strong> \${data.resident.first_name} \${data.resident.last_name}</p>
                <p><strong>Address:</strong> \${data.resident.address}</p>
                <p><strong>Account Status:</strong> \${data.resident.status}</p>
              </div>
            \`;
          } else {
            resultDiv.innerHTML = \`
              <div style="border: 2px solid var(--danger); border-radius: 8px; padding: 1rem; background: #fef2f2;">
                <h3 style="color: var(--danger);">❌ Invalid / Unrecognized QR</h3>
                <p>\${data.error || 'The scanned QR identifier does not match any valid record.'}</p>
              </div>
            \`;
          }
        } catch (e) {
          resultDiv.innerHTML = '<p style="color:var(--danger)">Error processing QR request.</p>';
        }
      }
    </script>
  `;

  res.send(renderLayout({ title: 'QR Verification', portal: portalType, user: req.session, activeNav: 'qr', content }));
};

app.get('/admin/qr', requireAdmin, (req, res) => handleQRScannerView(req, res, 'ADMIN'));
app.get('/staff/qr', requireStaff, requirePermission('qr'), (req, res) => handleQRScannerView(req, res, 'STAFF'));

// QR VERIFICATION API
app.post('/api/verify-qr', requireStaff, async (req, res) => {
  const { qr_token } = req.body;
  try {
    const result = await pool.query(`
      SELECT r.*, u.status 
      FROM residents r 
      JOIN users u ON r.user_id = u.id 
      WHERE r.qr_token = $1
    `, [qr_token]);

    if (result.rows.length === 0) {
      await logActivity(req.session.userId, req.session.role, 'Scanned Invalid QR Token', 'QR_SCANNER', qr_token, req);
      return res.status(404).json({ valid: false, error: 'Token not found in system.' });
    }

    const r = result.rows[0];
    await logActivity(req.session.userId, req.session.role, `Scanned Valid QR for ${r.resident_id_number}`, 'QR_SCANNER', r.resident_id_number, req);

    res.json({
      valid: true,
      resident: {
        resident_id_number: r.resident_id_number,
        first_name: r.first_name,
        last_name: r.last_name,
        address: r.address,
        status: r.status
      }
    });
  } catch (err) {
    res.status(500).json({ valid: false, error: 'Internal QR verification error.' });
  }
});

// REPORTS & CSV EXPORT SYSTEM (ADMIN & STAFF)
const handleReportsView = async (req, res, portalType) => {
  const totalResidents = await pool.query('SELECT COUNT(*) FROM residents');
  const totalSeniors = await pool.query('SELECT COUNT(*) FROM residents WHERE senior_status = TRUE');
  const totalPWDs = await pool.query('SELECT COUNT(*) FROM residents WHERE pwd_status = TRUE');
  const total4Ps = await pool.query('SELECT COUNT(*) FROM residents WHERE four_ps_status = TRUE');

  const content = `
    <div class="page-header">
      <h1 class="page-title">Barangay Demographic & System Reports</h1>
      <a href="/${portalType.toLowerCase()}/reports/export-csv" class="btn btn-primary">📥 Export Master List CSV</a>
    </div>

    <div class="card-grid">
      <div class="card stat-card">
        <span class="stat-title">Total Residents</span>
        <span class="stat-value">${totalResidents.rows[0].count}</span>
      </div>
      <div class="card stat-card">
        <span class="stat-title">Senior Citizens</span>
        <span class="stat-value">${totalSeniors.rows[0].count}</span>
      </div>
      <div class="card stat-card">
        <span class="stat-title">PWD Residents</span>
        <span class="stat-value">${totalPWDs.rows[0].count}</span>
      </div>
      <div class="card stat-card">
        <span class="stat-title">4Ps Beneficiaries</span>
        <span class="stat-value">${total4Ps.rows[0].count}</span>
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'Reports', portal: portalType, user: req.session, activeNav: 'reports', content }));
};

app.get('/admin/reports', requireAdmin, (req, res) => handleReportsView(req, res, 'ADMIN'));
app.get('/staff/reports', requireStaff, requirePermission('reports'), (req, res) => handleReportsView(req, res, 'STAFF'));

// CSV EXPORT IMPLEMENTATION
const handleCSVExport = async (req, res) => {
  try {
    const residents = await pool.query('SELECT resident_id_number, first_name, last_name, sex, civil_status, address, contact_number, email FROM residents ORDER BY last_name ASC');

    let csvContent = 'Resident ID,First Name,Last Name,Sex,Civil Status,Address,Contact Number,Email\n';
    residents.rows.forEach(r => {
      csvContent += `"${r.resident_id_number}","${r.first_name}","${r.last_name}","${r.sex}","${r.civil_status}","${r.address}","${r.contact_number}","${r.email}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="Barangay_Residents_MasterList.csv"');
    res.status(200).send(csvContent);
  } catch (err) {
    res.status(500).send('Error generating CSV export.');
  }
};

app.get('/admin/reports/export-csv', requireAdmin, handleCSVExport);
app.get('/staff/reports/export-csv', requireStaff, requirePermission('reports'), handleCSVExport);

// ADMIN: ANNOUNCEMENT MANAGEMENT
app.get('/admin/announcements', requireAdmin, async (req, res) => {
  const announcements = await pool.query('SELECT * FROM announcements ORDER BY created_at DESC');

  const content = `
    <div class="page-header">
      <h1 class="page-title">Community Announcements</h1>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem;">
      <div class="card">
        <h2 style="font-size: 1.1rem; margin-bottom: 1rem;">Post Announcement</h2>
        <form action="/admin/announcements/create" method="POST">
          <div class="form-group">
            <label>Title *</label>
            <input type="text" name="title" class="form-control" required>
          </div>
          <div class="form-group">
            <label>Content *</label>
            <textarea name="content" class="form-control" rows="4" required></textarea>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;">Publish Announcement</button>
        </form>
      </div>

      <div class="card">
        <h2 style="font-size: 1.1rem; margin-bottom: 1rem;">Published Records</h2>
        <div style="display:flex; flex-direction:column; gap:0.75rem;">
          ${announcements.rows.map(a => `
            <div style="border-bottom:1px solid var(--border); padding-bottom:0.5rem;">
              <strong>${a.title}</strong>
              <p style="font-size:0.8rem; color:var(--text-light);">${new Date(a.publication_date).toLocaleDateString()}</p>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'Announcements', portal: 'ADMIN', user: req.session, activeNav: 'announcements', content }));
});

app.post('/admin/announcements/create', requireAdmin, async (req, res) => {
  const { title, content } = req.body;
  await pool.query('INSERT INTO announcements (title, content) VALUES ($1, $2)', [title, content]);
  await logActivity(req.session.userId, 'ADMIN', 'Published Announcement', 'ANNOUNCEMENTS', title, req);
  res.redirect('/admin/announcements');
});

// ADMIN: BARANGAY OFFICIALS
app.get('/admin/officials', requireAdmin, async (req, res) => {
  const officials = await pool.query('SELECT * FROM barangay_officials ORDER BY id ASC');

  const content = `
    <div class="page-header">
      <h1 class="page-title">Barangay Officials</h1>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem;">
      <div class="card">
        <h2 style="font-size: 1.1rem; margin-bottom: 1rem;">Add Official</h2>
        <form action="/admin/officials/create" method="POST">
          <div class="form-group">
            <label>Full Name *</label>
            <input type="text" name="full_name" class="form-control" required>
          </div>
          <div class="form-group">
            <label>Position *</label>
            <input type="text" name="position" class="form-control" placeholder="e.g. Barangay Captain, Councilor, Secretary" required>
          </div>
          <div class="form-group">
            <label>Term / Years</label>
            <input type="text" name="term" class="form-control" placeholder="e.g. 2023 - 2026">
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;">Save Official</button>
        </form>
      </div>

      <div class="card">
        <h2 style="font-size: 1.1rem; margin-bottom: 1rem;">Active Officials</h2>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th>Term</th>
              </tr>
            </thead>
            <tbody>
              ${officials.rows.map(o => `
                <tr>
                  <td><strong>${o.full_name}</strong></td>
                  <td>${o.position}</td>
                  <td>${o.term || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'Officials', portal: 'ADMIN', user: req.session, activeNav: 'officials', content }));
});

app.post('/admin/officials/create', requireAdmin, async (req, res) => {
  const { full_name, position, term } = req.body;
  await pool.query('INSERT INTO barangay_officials (full_name, position, term) VALUES ($1, $2, $3)', [full_name, position, term]);
  await logActivity(req.session.userId, 'ADMIN', 'Added Official', 'OFFICIALS', full_name, req);
  res.redirect('/admin/officials');
});

// ADMIN: DOCUMENT TEMPLATES
app.get('/admin/documents', requireAdmin, async (req, res) => {
  const docTypes = await pool.query('SELECT * FROM document_types ORDER BY id ASC');

  const content = `
    <div class="page-header">
      <h1 class="page-title">Document Clearance Templates & Fees</h1>
    </div>

    <div class="card">
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Description</th>
              <th>Fee</th>
            </tr>
          </thead>
          <tbody>
            ${docTypes.rows.map(d => `
              <tr>
                <td><strong>${d.title}</strong></td>
                <td>${d.description}</td>
                <td>₱${parseFloat(d.fee).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'Document Types', portal: 'ADMIN', user: req.session, activeNav: 'documents', content }));
});

// ADMIN: ACTIVITY LOGS
app.get('/admin/logs', requireAdmin, async (req, res) => {
  const logs = await pool.query('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 50');

  const content = `
    <div class="page-header">
      <h1 class="page-title">System Audit & Activity Logs</h1>
    </div>

    <div class="card">
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Role</th>
              <th>Action</th>
              <th>Module</th>
              <th>Record Identifier</th>
              <th>IP Address</th>
            </tr>
          </thead>
          <tbody>
            ${logs.rows.map(l => `
              <tr>
                <td>${new Date(l.created_at).toLocaleString()}</td>
                <td><span class="badge badge-pending">${l.user_role || 'SYSTEM'}</span></td>
                <td>${l.action}</td>
                <td>${l.module}</td>
                <td>${l.record_id || '—'}</td>
                <td>${l.ip_address}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderLayout({ title: 'Activity Logs', portal: 'ADMIN', user: req.session, activeNav: 'logs', content }));
});

// ADMIN: DATABASE BACKUP INFORMATION
app.get('/admin/backup', requireAdmin, (req, res) => {
  const content = `
    <div class="page-header">
      <h1 class="page-title">Database Backup Instructions</h1>
    </div>

    <div class="card" style="max-width: 750px;">
      <h2 style="font-size: 1.2rem; margin-bottom: 1rem;">Render Managed PostgreSQL Backup Procedures</h2>
      <p style="margin-bottom: 1rem; line-height: 1.6;">
        This application relies on a permanent Render PostgreSQL database instance. For enterprise production data persistence, 
        Render handles managed automated daily database backups.
      </p>

      <h3 style="font-size: 1rem; margin: 1rem 0 0.5rem 0;">Manual CLI Backup Command (pg_dump):</h3>
      <pre style="background: #1e293b; color: #f8fafc; padding: 1rem; border-radius: 6px; font-size: 0.85rem; overflow-x: auto;">
pg_dump "${DATABASE_URL}" > barangay_db_backup_\$(date +%Y%m%d).sql
      </pre>

      <h3 style="font-size: 1rem; margin: 1.5rem 0 0.5rem 0;">Restore Command:</h3>
      <pre style="background: #1e293b; color: #f8fafc; padding: 1rem; border-radius: 6px; font-size: 0.85rem; overflow-x: auto;">
psql "${DATABASE_URL}" < barangay_db_backup.sql
      </pre>
    </div>
  `;

  res.send(renderLayout({ title: 'Database Backup', portal: 'ADMIN', user: req.session, activeNav: 'backup', content }));
});

// ADMIN & STAFF: SETTINGS
const handleSettingsView = async (req, res, portalType) => {
  const settingsRes = await pool.query('SELECT * FROM system_settings LIMIT 1');
  const sys = settingsRes.rows[0];

  const content = `
    <div class="page-header">
      <h1 class="page-title">System Settings</h1>
    </div>

    <div class="card" style="max-width: 650px;">
      ${portalType === 'ADMIN' ? `
        <form action="/admin/settings" method="POST">
          <div class="form-group">
            <label>Barangay Name *</label>
            <input type="text" name="barangay_name" class="form-control" value="${sys.barangay_name}" required>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Municipality / City *</label>
              <input type="text" name="municipality" class="form-control" value="${sys.municipality}" required>
            </div>
            <div class="form-group">
              <label>Province *</label>
              <input type="text" name="province" class="form-control" value="${sys.province}" required>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Contact Number *</label>
              <input type="text" name="contact_number" class="form-control" value="${sys.contact_number}" required>
            </div>
            <div class="form-group">
              <label>Email *</label>
              <input type="email" name="email" class="form-control" value="${sys.email}" required>
            </div>
          </div>
          <div class="form-group">
            <label>Address *</label>
            <input type="text" name="address" class="form-control" value="${sys.address}" required>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;">Save Configuration</button>
        </form>
      ` : `
        <p><strong>Barangay Name:</strong> ${sys.barangay_name}</p>
        <p><strong>Municipality:</strong> ${sys.municipality}</p>
        <p><strong>Province:</strong> ${sys.province}</p>
        <p><strong>Contact:</strong> ${sys.contact_number}</p>
        <p><strong>Email:</strong> ${sys.email}</p>
      `}
    </div>
  `;

  res.send(renderLayout({ title: 'Settings', portal: portalType, user: req.session, activeNav: 'settings', content }));
};

app.get('/admin/settings', requireAdmin, (req, res) => handleSettingsView(req, res, 'ADMIN'));
app.get('/staff/settings', requireStaff, (req, res) => handleSettingsView(req, res, 'STAFF'));

app.post('/admin/settings', requireAdmin, async (req, res) => {
  const { barangay_name, municipality, province, contact_number, email, address } = req.body;
  await pool.query(`
    UPDATE system_settings 
    SET barangay_name = $1, municipality = $2, province = $3, contact_number = $4, email = $5, address = $6, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `, [barangay_name, municipality, province, contact_number, email, address]);

  await logActivity(req.session.userId, 'ADMIN', 'Updated System Settings', 'SETTINGS', '1', req);
  res.redirect('/admin/settings');
});

// START SERVER AND INITIALIZE DATABASE TABLES
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`Barangay Resident Management System running on port ${PORT}`);
    console.log(`Node Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`=======================================================`);
  });
}).catch(err => {
  console.error('Failed to initialize database and server startup:', err);
});
