/**
 * Barangay Resident Management System - app.js
 * Complete, fully-functional monolithic Node.js & Express application
 * with embedded Tailwind CSS frontend, Neon PostgreSQL persistence,
 * secure sessions, bcrypt hashing, file uploads, role-based access,
 * dynamic ID card printing (8-up layout), and comprehensive modules.
 */

const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(express.session);
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Database Connection via Neon PostgreSQL Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Configure file uploads directory
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, ''));
  }
});
const upload = multer({ 
  storage, 
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit 
});

// Middleware Setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOAD_DIR));

// Rate Limiting on Auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'Too many login attempts from this IP, please try again after 15 minutes.'
});

// Session Management with PostgreSQL Store
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'brgy-super-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

// ==========================================
// DATABASE INITIALIZATION & SCHEMA SETUP
// ==========================================
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Barangay Settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS barangay_settings (
        id SERIAL PRIMARY KEY,
        barangay_name VARCHAR(255) DEFAULT 'Barangay San Jose',
        barangay_logo VARCHAR(512) DEFAULT '',
        barangay_address VARCHAR(512) DEFAULT 'Main St., City',
        contact_number VARCHAR(64) DEFAULT '09123456789',
        email VARCHAR(255) DEFAULT 'brgy.sanjose@gov.ph',
        barangay_captain VARCHAR(255) DEFAULT 'Hon. Juan Dela Cruz',
        secretary VARCHAR(255) DEFAULT 'Maria Santos',
        id_prefix VARCHAR(32) DEFAULT 'BRGY-2026-',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure default settings row
    const settingsCheck = await client.query('SELECT COUNT(*) FROM barangay_settings');
    if (parseInt(settingsCheck.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO barangay_settings (barangay_name, barangay_address, contact_number, email, barangay_captain, secretary, id_prefix)
        VALUES ('Barangay San Jose', 'Main St., Central City', '09123456789', 'contact@sanjose.gov.ph', 'Hon. Juan Dela Cruz', 'Maria Santos', 'BRGY-2026-');
      `);
    }

    // 2. Users (Staff and Resident Accounts)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(150) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'BARANGAY_SECRETARY', 'STAFF', 'RESIDENT')),
        resident_id INT,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure default ADMIN account
    const adminCheck = await client.query("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (adminCheck.rows.length === 0) {
      const hashedPass = await bcrypt.hash('admin123', 10);
      await client.query(`
        INSERT INTO users (username, email, password, role, status)
        VALUES ('admin', 'admin@brgy.gov.ph', $1, 'ADMIN', 'ACTIVE')
      `, [hashedPass]);
    }

    // 3. Puroks
    await client.query(`
      CREATE TABLE IF NOT EXISTS puroks (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Households
    await client.query(`
      CREATE TABLE IF NOT EXISTS households (
        id SERIAL PRIMARY KEY,
        household_number VARCHAR(100) UNIQUE NOT NULL,
        head_name VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        purok_id INT REFERENCES puroks(id) ON DELETE SET NULL,
        date_registered DATE DEFAULT CURRENT_DATE,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. Residents
    await client.query(`
      CREATE TABLE IF NOT EXISTS residents (
        id SERIAL PRIMARY KEY,
        resident_id_number VARCHAR(100) UNIQUE NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        middle_name VARCHAR(100),
        last_name VARCHAR(100) NOT NULL,
        suffix VARCHAR(20),
        date_of_birth DATE NOT NULL,
        gender VARCHAR(30) NOT NULL,
        civil_status VARCHAR(50) NOT NULL,
        address TEXT NOT NULL,
        purok_id INT REFERENCES puroks(id) ON DELETE SET NULL,
        household_id INT REFERENCES households(id) ON DELETE SET NULL,
        contact_number VARCHAR(50) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        occupation VARCHAR(150),
        educational_attainment VARCHAR(100),
        nationality VARCHAR(100) DEFAULT 'Filipino',
        voter_status VARCHAR(30) DEFAULT 'No',
        senior_citizen_status VARCHAR(10) DEFAULT 'No',
        pwd_status VARCHAR(10) DEFAULT 'No',
        solo_parent_status VARCHAR(10) DEFAULT 'No',
        four_ps_status VARCHAR(10) DEFAULT 'No',
        resident_status VARCHAR(50) DEFAULT 'PENDING',
        rejection_reason TEXT,
        profile_photo VARCHAR(512),
        date_registered TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 6. Certificates / Requests
    await client.query(`
      CREATE TABLE IF NOT EXISTS certificates (
        id SERIAL PRIMARY KEY,
        resident_id INT REFERENCES residents(id) ON DELETE CASCADE,
        certificate_type VARCHAR(150) NOT NULL,
        purpose TEXT,
        request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'Pending',
        staff_remarks TEXT,
        approved_date TIMESTAMP,
        released_date TIMESTAMP,
        uploaded_file VARCHAR(512),
        processed_by INT REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 7. Appointments
    await client.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        resident_id INT REFERENCES residents(id) ON DELETE CASCADE,
        service VARCHAR(150) NOT NULL,
        appointment_date DATE NOT NULL,
        appointment_time TIME NOT NULL,
        reason TEXT,
        status VARCHAR(50) DEFAULT 'Pending',
        staff_remarks VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 8. Blotters
    await client.query(`
      CREATE TABLE IF NOT EXISTS blotters (
        id SERIAL PRIMARY KEY,
        case_number VARCHAR(100) UNIQUE NOT NULL,
        complainant VARCHAR(255) NOT NULL,
        respondent VARCHAR(255) NOT NULL,
        witness TEXT,
        incident_date DATE NOT NULL,
        incident_time TIME NOT NULL,
        location TEXT NOT NULL,
        incident_description TEXT NOT NULL,
        action_taken TEXT,
        settlement TEXT,
        status VARCHAR(50) DEFAULT 'Open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 9. Complaints (Resident to Staff)
    await client.query(`
      CREATE TABLE IF NOT EXISTS complaints (
        id SERIAL PRIMARY KEY,
        resident_id INT REFERENCES residents(id) ON DELETE CASCADE,
        subject VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        date_submitted TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        location TEXT,
        category VARCHAR(100) NOT NULL,
        attachment VARCHAR(512),
        status VARCHAR(50) DEFAULT 'Submitted',
        staff_response TEXT
      );
    `);

    // 10. Assistance Requests
    await client.query(`
      CREATE TABLE IF NOT EXISTS assistance_requests (
        id SERIAL PRIMARY KEY,
        resident_id INT REFERENCES residents(id) ON DELETE CASCADE,
        assistance_type VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'Pending',
        remarks TEXT,
        document_url VARCHAR(512),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 11. Announcements
    await client.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        date_posted TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        category VARCHAR(100) DEFAULT 'General',
        attachment VARCHAR(512),
        status VARCHAR(50) DEFAULT 'Published'
      );
    `);

    // 12. Notifications
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        resident_id INT REFERENCES residents(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 13. Businesses
    await client.query(`
      CREATE TABLE IF NOT EXISTS businesses (
        id SERIAL PRIMARY KEY,
        business_name VARCHAR(255) NOT NULL,
        owner_name VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        purok_id INT REFERENCES puroks(id) ON DELETE SET NULL,
        business_type VARCHAR(150) NOT NULL,
        contact_number VARCHAR(50) NOT NULL,
        permit_number VARCHAR(100) UNIQUE NOT NULL,
        permit_status VARCHAR(50) DEFAULT 'Active',
        registration_date DATE DEFAULT CURRENT_DATE,
        expiration_date DATE NOT NULL
      );
    `);

    // 14. Activity Logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(255) NOT NULL,
        details TEXT,
        ip_address VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query('COMMIT');
    console.log('Database tables verified and initialized successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
}

initDatabase();

// Helper: Log Activity
async function logActivity(userId, action, details, ip) {
  try {
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
      [userId || null, action, details, ip || '127.0.0.1']
    );
  } catch (err) {
    console.error('Logging error:', err);
  }
}

// Helper: Notify Resident
async function sendNotification(residentId, title, message) {
  try {
    await pool.query(
      'INSERT INTO notifications (resident_id, title, message) VALUES ($1, $2, $3)',
      [residentId, title, message]
    );
  } catch (err) {
    console.error('Notification error:', err);
  }
}

// Authentication Middleware
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  if (req.headers['content-type'] && req.headers['content-type'].includes('json')) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
  res.redirect('/login');
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.redirect('/login');
    }
    if (roles.includes(req.session.user.role)) {
      return next();
    }
    res.status(403).send('Forbidden: You do not have permission to access this resource.');
  };
}

// ==========================================
// API & WEB ROUTING (ALL IN app.js)
// ==========================================

// --- PUBLIC PAGES & AUTHENTICATION ---

app.get('/login', (req, res) => {
  res.send(renderHtmlLayout('Login Portal', `
    <div class="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-slate-800">Barangay Portal</h1>
          <p class="text-slate-500 text-sm mt-1">Sign in to your account</p>
        </div>
        <form action="/api/login" method="POST" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700">Username or Email</label>
            <input type="text" name="identifier" required class="mt-1 w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none">
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700">Password</label>
            <input type="password" name="password" required class="mt-1 w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none">
          </div>
          <button type="submit" class="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition">Sign In</button>
        </form>
        <div class="mt-6 text-center text-sm text-slate-600">
          Resident? <a href="/register" class="text-blue-600 font-semibold hover:underline">Register as Resident</a>
        </div>
      </div>
    </div>
  `));
});

app.get('/register', async (req, res) => {
  try {
    const puroks = await pool.query('SELECT * FROM puroks WHERE status = $1', ['ACTIVE']);
    const purokOptions = puroks.rows.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    res.send(renderHtmlLayout('Resident Registration', `
      <div class="min-h-screen bg-slate-100 py-12 px-4">
        <div class="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg p-8">
          <div class="text-center mb-8">
            <h1 class="text-3xl font-bold text-slate-800">Resident Registration</h1>
            <p class="text-slate-500 text-sm mt-1">Submit your details for barangay verification and approval.</p>
          </div>
          <form action="/api/register" method="POST" enctype="multipart/form-data" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700">First Name *</label>
                <input type="text" name="first_name" required class="mt-1 w-full px-3 py-2 border rounded-lg">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700">Middle Name</label>
                <input type="text" name="middle_name" class="mt-1 w-full px-3 py-2 border rounded-lg">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700">Last Name *</label>
                <input type="text" name="last_name" required class="mt-1 w-full px-3 py-2 border rounded-lg">
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700">Suffix</label>
                <input type="text" name="suffix" placeholder="Jr., III" class="mt-1 w-full px-3 py-2 border rounded-lg">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700">Date of Birth *</label>
                <input type="date" name="date_of_birth" required class="mt-1 w-full px-3 py-2 border rounded-lg">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700">Gender *</label>
                <select name="gender" required class="mt-1 w-full px-3 py-2 border rounded-lg">
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700">Civil Status *</label>
                <select name="civil_status" required class="mt-1 w-full px-3 py-2 border rounded-lg">
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Widowed">Widowed</option>
                  <option value="Separated">Separated</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700">Purok *</label>
                <select name="purok_id" required class="mt-1 w-full px-3 py-2 border rounded-lg">
                  ${purokOptions}
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700">Contact Number *</label>
                <input type="text" name="contact_number" required placeholder="09XXXXXXXXX" class="mt-1 w-full px-3 py-2 border rounded-lg">
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700">Complete Address *</label>
              <textarea name="address" required rows="2" class="mt-1 w-full px-3 py-2 border rounded-lg"></textarea>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700">Email (for Login) *</label>
                <input type="email" name="email" required class="mt-1 w-full px-3 py-2 border rounded-lg">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700">Password *</label>
                <input type="password" name="password" required class="mt-1 w-full px-3 py-2 border rounded-lg">
              </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg border">
              <div>
                <label class="block text-sm font-medium text-slate-700">Registered Voter?</label>
                <select name="voter_status" class="mt-1 w-full px-2 py-1 border rounded"><option value="Yes">Yes</option><option value="No" selected>No</option></select>
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700">Senior Citizen?</label>
                <select name="senior_citizen_status" class="mt-1 w-full px-2 py-1 border rounded"><option value="Yes">Yes</option><option value="No" selected>No</option></select>
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700">PWD?</label>
                <select name="pwd_status" class="mt-1 w-full px-2 py-1 border rounded"><option value="Yes">Yes</option><option value="No" selected>No</option></select>
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700">Solo Parent?</label>
                <select name="solo_parent_status" class="mt-1 w-full px-2 py-1 border rounded"><option value="Yes">Yes</option><option value="No" selected>No</option></select>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700">Profile Photo (Optional)</label>
              <input type="file" name="profile_photo" accept="image/*" class="mt-1 w-full text-sm">
            </div>
            <button type="submit" class="w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 transition">Submit Registration</button>
            <div class="text-center text-sm">
              Already have an account? <a href="/login" class="text-blue-600 font-semibold hover:underline">Sign In</a>
            </div>
          </form>
        </div>
      </div>
    `));
  } catch (err) {
    res.status(500).send('Error loading registration page: ' + err.message);
  }
});

// POST Login Handler
app.post('/api/login', authLimiter, async (req, res) => {
  const { identifier, password } = req.body;
  try {
    const userResult = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
      [identifier]
    );
    if (userResult.rows.length === 0) {
      return res.send(renderAlertPage('Login Failed', 'Invalid username/email or password.', '/login'));
    }
    const user = userResult.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.send(renderAlertPage('Login Failed', 'Invalid username/email or password.', '/login'));
    }

    if (user.role === 'RESIDENT') {
      const resCheck = await pool.query('SELECT resident_status FROM residents WHERE id = $1', [user.resident_id]);
      if (resCheck.rows.length > 0 && resCheck.rows[0].resident_status !== 'APPROVED') {
        return res.send(renderAlertPage('Account Pending', 'Your resident registration is still pending barangay staff approval.', '/login'));
      }
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      resident_id: user.resident_id
    };

    await logActivity(user.id, 'LOGIN', 'User logged into system', req.ip);

    if (user.role === 'RESIDENT') {
      res.redirect('/resident/dashboard');
    } else {
      res.redirect('/staff/dashboard');
    }
  } catch (err) {
    res.status(500).send('Server error during login: ' + err.message);
  }
});

// POST Register Handler
app.post('/api/register', upload.single('profile_photo'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      first_name, middle_name, last_name, suffix, date_of_birth,
      gender, civil_status, address, purok_id, contact_number,
      email, password, voter_status, senior_citizen_status,
      pwd_status, solo_parent_status
    } = req.body;

    const emailCheck = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.send(renderAlertPage('Registration Error', 'Email is already registered.', '/register'));
    }

    const settingsRes = await client.query('SELECT id_prefix FROM barangay_settings LIMIT 1');
    const prefix = settingsRes.rows[0]?.id_prefix || 'BRGY-2026-';
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    const residentIdNumber = `${prefix}${randomNum}`;

    const profilePhotoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const residentInsert = await client.query(`
      INSERT INTO residents (
        resident_id_number, first_name, middle_name, last_name, suffix,
        date_of_birth, gender, civil_status, address, purok_id,
        contact_number, email, voter_status, senior_citizen_status,
        pwd_status, solo_parent_status, resident_status, profile_photo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'PENDING', $17)
      RETURNING id
    `, [
      residentIdNumber, first_name, middle_name, last_name, suffix,
      date_of_birth, gender, civil_status, address, purok_id,
      contact_number, email, voter_status, senior_citizen_status,
      pwd_status, solo_parent_status, profilePhotoUrl
    ]);

    const newResidentId = residentInsert.rows[0].id;
    const hashedPassword = await bcrypt.hash(password, 10);

    await client.query(`
      INSERT INTO users (username, email, password, role, resident_id, status)
      VALUES ($1, $2, $3, 'RESIDENT', $4, 'ACTIVE')
    `, [email, email, hashedPassword, newResidentId]);

    await client.query('COMMIT');
    res.send(renderAlertPage('Registration Submitted', 'Your registration has been submitted and is waiting for Barangay Staff approval.', '/login'));
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).send('Registration failed: ' + err.message);
  } finally {
    client.release();
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// --- QR VERIFICATION PAGE (Public) ---
app.get('/verify/id/:idNumber', async (req, res) => {
  const idNumber = req.params.idNumber;
  try {
    const resResult = await pool.query(`
      SELECT r.*, p.name as purok_name, b.barangay_name, b.barangay_logo, b.barangay_captain
      FROM residents r
      LEFT JOIN puroks p ON r.purok_id = p.id
      CROSS JOIN barangay_settings b
      WHERE r.resident_id_number = $1
    `, [idNumber]);

    if (resResult.rows.length === 0) {
      return res.send(renderHtmlLayout('ID Verification', '<div class="p-12 text-center"><h1 class="text-2xl font-bold text-red-600">Invalid Resident ID</h1><p class="text-slate-600 mt-2">This ID number does not exist in our database.</p></div>'));
    }

    const resident = resResult.rows[0];
    const isValid = resident.resident_status === 'APPROVED';

    res.send(renderHtmlLayout('ID Verification', `
      <div class="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div class="mb-4">
            ${resident.barangay_logo ? `<img src="${resident.barangay_logo}" class="w-20 h-20 mx-auto rounded-full object-cover mb-2">` : ''}
            <h2 class="text-xl font-bold text-slate-800">${resident.barangay_name}</h2>
            <p class="text-xs text-slate-500 uppercase tracking-wider">Official Digital ID Verification</p>
          </div>
          <div class="my-6">
            ${resident.profile_photo ? `<img src="${resident.profile_photo}" class="w-32 h-32 mx-auto rounded-full object-cover border-4 border-slate-200 mb-4">` : '<div class="w-32 h-32 mx-auto rounded-full bg-slate-200 flex items-center justify-center text-slate-400 mb-4">No Photo</div>'}
            <h3 class="text-2xl font-bold text-slate-900">${resident.first_name} ${resident.middle_name || ''} ${resident.last_name} ${resident.suffix || ''}</h3>
            <p class="text-sm font-mono text-blue-600 font-semibold mt-1">${resident.resident_id_number}</p>
          </div>
          <div class="bg-slate-50 p-4 rounded-xl text-left space-y-2 text-sm text-slate-700 border mb-6">
            <p><strong>Address:</strong> ${resident.address}, Purok ${resident.purok_name || 'N/A'}</p>
            <p><strong>Date of Birth:</strong> ${new Date(resident.date_of_birth).toLocaleDateString()}</p>
            <p><strong>Status:</strong> <span class="px-2 py-0.5 rounded text-xs font-bold ${isValid ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}">${resident.resident_status}</span></p>
          </div>
          <div class="p-4 rounded-xl ${isValid ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}">
            <p class="font-bold">${isValid ? '✓ VERIFIED OFFICIAL RESIDENT ID' : '⚠ ID IS NOT ACTIVE OR VALID'}</p>
          </div>
        </div>
      </div>
    `));
  } catch (err) {
    res.status(500).send('Error verifying ID: ' + err.message);
  }
});

// --- STAFF PORTAL ROUTES ---

app.get('/staff/dashboard', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const stats = await getStaffDashboardStats();
    const recentActivities = await pool.query(`
      SELECT a.*, u.username FROM activity_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC LIMIT 10
    `);

    res.send(renderStaffLayout('Dashboard', req.session.user, `
      <div class="space-y-6">
        <h1 class="text-2xl font-bold text-slate-800">Staff Dashboard</h1>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          ${renderStatCard('Total Residents', stats.totalResidents, 'bg-blue-500')}
          ${renderStatCard('Pending Residents', stats.pendingResidents, 'bg-amber-500')}
          ${renderStatCard('Approved Residents', stats.approvedResidents, 'bg-emerald-500')}
          ${renderStatCard('Total Households', stats.totalHouseholds, 'bg-indigo-500')}
          ${renderStatCard('Male Residents', stats.maleResidents, 'bg-cyan-500')}
          ${renderStatCard('Female Residents', stats.femaleResidents, 'bg-pink-500')}
          ${renderStatCard('Senior Citizens', stats.seniorResidents, 'bg-purple-500')}
          ${renderStatCard('PWD Residents', stats.pwdResidents, 'bg-rose-500')}
          ${renderStatCard('Solo Parents', stats.soloResidents, 'bg-teal-500')}
          ${renderStatCard('Minors', stats.minorResidents, 'bg-orange-500')}
          ${renderStatCard('Registered Voters', stats.voterResidents, 'bg-emerald-600')}
          ${renderStatCard('Pending Certificates', stats.pendingCerts, 'bg-yellow-600')}
        </div>
        <div class="bg-white rounded-xl shadow p-6">
          <h3 class="text-lg font-bold text-slate-800 mb-4">Recent System Activities</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-50 text-slate-600 uppercase text-xs">
                <tr>
                  <th class="p-3">User</th>
                  <th class="p-3">Action</th>
                  <th class="p-3">Details</th>
                  <th class="p-3">IP</th>
                  <th class="p-3">Date</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${recentActivities.rows.map(a => `
                  <tr>
                    <td class="p-3 font-medium">${a.username || 'System'}</td>
                    <td class="p-3"><span class="px-2 py-0.5 rounded text-xs bg-slate-100 font-semibold">${a.action}</span></td>
                    <td class="p-3 text-slate-600">${a.details || ''}</td>
                    <td class="p-3 text-slate-400 font-mono text-xs">${a.ip_address || ''}</td>
                    <td class="p-3 text-slate-500">${new Date(a.created_at).toLocaleString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `));
  } catch (err) {
    res.status(500).send('Dashboard Error: ' + err.message);
  }
});

// Resident Management
app.get('/staff/residents', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  const { search, purok, status, gender } = req.query;
  try {
    let query = `
      SELECT r.*, p.name as purok_name, h.household_number 
      FROM residents r
      LEFT JOIN puroks p ON r.purok_id = p.id
      LEFT JOIN households h ON r.household_id = h.id
      WHERE 1=1
    `;
    let params = [];
    let idx = 1;

    if (search) {
      query += ` AND (r.first_name ILIKE $${idx} OR r.last_name ILIKE $${idx} OR r.resident_id_number ILIKE $${idx} OR r.contact_number ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    if (purok) {
      query += ` AND r.purok_id = $${idx}`;
      params.push(purok);
      idx++;
    }
    if (status) {
      query += ` AND r.resident_status = $${idx}`;
      params.push(status);
      idx++;
    }
    if (gender) {
      query += ` AND r.gender = $${idx}`;
      params.push(gender);
      idx++;
    }

    query += ` ORDER BY r.date_registered DESC`;

    const residents = await pool.query(query, params);
    const puroks = await pool.query('SELECT * FROM puroks WHERE status = $1', ['ACTIVE']);

    res.send(renderStaffLayout('Residents Management', req.session.user, `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 class="text-2xl font-bold text-slate-800">Resident Management</h1>
          <div class="flex gap-2">
            <a href="/staff/residents/print-ids" target="_blank" class="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition">🖨 Print All Approved IDs (8-Up)</a>
            <button onclick="openAddResidentModal()" class="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition">+ Add Resident</button>
          </div>
        </div>
        <form method="GET" class="bg-white p-4 rounded-xl shadow grid grid-cols-1 sm:grid-cols-5 gap-4">
          <input type="text" name="search" value="${search || ''}" placeholder="Search name, ID..." class="px-3 py-2 border rounded-lg text-sm">
          <select name="purok" class="px-3 py-2 border rounded-lg text-sm">
            <option value="">All Puroks</option>
            ${puroks.rows.map(p => `<option value="${p.id}" ${purok == p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
          </select>
          <select name="status" class="px-3 py-2 border rounded-lg text-sm">
            <option value="">All Status</option>
            <option value="PENDING" ${status === 'PENDING' ? 'selected' : ''}>Pending</option>
            <option value="APPROVED" ${status === 'APPROVED' ? 'selected' : ''}>Approved</option>
            <option value="REJECTED" ${status === 'REJECTED' ? 'selected' : ''}>Rejected</option>
            <option value="ARCHIVED" ${status === 'ARCHIVED' ? 'selected' : ''}>Archived</option>
          </select>
          <select name="gender" class="px-3 py-2 border rounded-lg text-sm">
            <option value="">All Genders</option>
            <option value="Male" ${gender === 'Male' ? 'selected' : ''}>Male</option>
            <option value="Female" ${gender === 'Female' ? 'selected' : ''}>Female</option>
          </select>
          <button type="submit" class="bg-slate-800 text-white py-2 rounded-lg text-sm font-semibold hover:bg-slate-900">Filter Records</button>
        </form>
        <div class="bg-white rounded-xl shadow overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th class="p-3">ID Number</th>
                <th class="p-3">Full Name</th>
                <th class="p-3">Purok</th>
                <th class="p-3">Contact</th>
                <th class="p-3">Status</th>
                <th class="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${residents.rows.map(r => `
                <tr>
                  <td class="p-3 font-mono font-semibold text-blue-600">${r.resident_id_number}</td>
                  <td class="p-3 font-medium">${r.first_name}${r.middle_name || ''} ${r.last_name}${r.suffix || ''}</td>
                  <td class="p-3">${r.purok_name || 'N/A'}</td>
                  <td class="p-3">${r.contact_number}</td>
                  <td class="p-3"><span class="px-2 py-0.5 rounded text-xs font-bold ${r.resident_status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : r.resident_status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}">${r.resident_status}</span></td>
                  <td class="p-3 text-right space-x-2">
                    ${r.resident_status === 'PENDING' ? `
                      <form action="/staff/residents/${r.id}/approve" method="POST" class="inline"><button class="text-emerald-600 font-semibold hover:underline">Approve</button></form>
                      <button onclick="openRejectModal(${r.id})" class="text-red-600 font-semibold hover:underline">Reject</button>
                    ` : ''}
                    <a href="/staff/residents/${r.id}" class="text-blue-600 font-semibold hover:underline">View</a>
                    <a href="/staff/residents/${r.id}/print-id" target="_blank" class="text-indigo-600 font-semibold hover:underline">ID</a>
                    <form action="/staff/residents/${r.id}/archive" method="POST" class="inline"><button class="text-amber-600 hover:underline">Archive</button></form>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <!-- Add Resident Modal -->
      <div id="addResidentModal" class="fixed inset-0 bg-black/50 hidden flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold text-slate-800">Add New Resident</h3>
            <button onclick="closeAddResidentModal()" class="text-slate-500 font-bold">✕</button>
          </div>
          <form action="/staff/residents/add" method="POST" enctype="multipart/form-data" class="space-y-4">
            <div class="grid grid-cols-3 gap-3">
              <input type="text" name="first_name" placeholder="First Name *" required class="px-3 py-2 border rounded">
              <input type="text" name="middle_name" placeholder="Middle Name" class="px-3 py-2 border rounded">
              <input type="text" name="last_name" placeholder="Last Name *" required class="px-3 py-2 border rounded">
            </div>
            <div class="grid grid-cols-3 gap-3">
              <input type="text" name="suffix" placeholder="Suffix (Jr, III)" class="px-3 py-2 border rounded">
              <input type="date" name="date_of_birth" required class="px-3 py-2 border rounded">
              <select name="gender" required class="px-3 py-2 border rounded">
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <select name="civil_status" required class="px-3 py-2 border rounded">
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Widowed">Widowed</option>
                <option value="Separated">Separated</option>
              </select>
              <select name="purok_id" required class="px-3 py-2 border rounded">
                <option value="">Select Purok *</option>
                ${puroks.rows.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
              </select>
              <input type="text" name="contact_number" placeholder="Contact Number *" required class="px-3 py-2 border rounded">
            </div>
            <textarea name="address" placeholder="Complete Address *" required rows="2" class="w-full px-3 py-2 border rounded"></textarea>
            <div class="grid grid-cols-2 gap-3">
              <input type="email" name="email" placeholder="Email Address *" required class="px-3 py-2 border rounded">
              <input type="password" name="password" placeholder="Initial Password *" required class="px-3 py-2 border rounded">
            </div>
            <div>
              <label class="block text-sm text-slate-600 mb-1">Profile Photo</label>
              <input type="file" name="profile_photo" accept="image/*" class="text-sm">
            </div>
            <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700">Save Resident Record</button>
          </form>
        </div>
      </div>
      <!-- Reject Modal -->
      <div id="rejectModal" class="fixed inset-0 bg-black/50 hidden flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
          <h3 class="text-lg font-bold text-slate-800 mb-3">Reject Resident Registration</h3>
          <form id="rejectForm" method="POST" class="space-y-4">
            <textarea name="rejection_reason" placeholder="Enter reason for rejection..." required rows="3" class="w-full px-3 py-2 border rounded"></textarea>
            <button type="submit" class="w-full bg-red-600 text-white py-2 rounded font-semibold hover:bg-red-700">Confirm Rejection</button>
          </form>
        </div>
      </div>
      <script>
        function openAddResidentModal() { document.getElementById('addResidentModal').classList.remove('hidden'); }
        function closeAddResidentModal() { document.getElementById('addResidentModal').classList.add('hidden'); }
        function openRejectModal(id) {
          document.getElementById('rejectForm').action = '/staff/residents/' + id + '/reject';
          document.getElementById('rejectModal').classList.remove('hidden');
        }
      </script>
    `));
  } catch (err) {
    res.status(500).send('Error loading residents: ' + err.message);
  }
});

// Print Single ID
app.get('/staff/residents/:id/print-id', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  const residentId = req.params.id;
  try {
    const resResult = await pool.query(`
      SELECT r.*, p.name as purok_name, b.*
      FROM residents r
      LEFT JOIN puroks p ON r.purok_id = p.id
      CROSS JOIN barangay_settings b
      WHERE r.id = $1
    `, [residentId]);

    if (resResult.rows.length === 0) return res.status(404).send('Resident not found');
    const r = resResult.rows[0];

    res.send(renderIdCardPrintLayout([r], 'Single Resident ID'));
  } catch (err) {
    res.status(500).send('Error printing ID: ' + err.message);
  }
});

// Print All Approved IDs (8-up on bond paper format)
app.get('/staff/residents/print-ids', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const resResult = await pool.query(`
      SELECT r.*, p.name as purok_name, b.*
      FROM residents r
      LEFT JOIN puroks p ON r.purok_id = p.id
      CROSS JOIN barangay_settings b
      WHERE r.resident_status = 'APPROVED'
      ORDER BY r.last_name ASC
    `);

    res.send(renderIdCardPrintLayout(resResult.rows, 'Batch Approved IDs (8-Up)'));
  } catch (err) {
    res.status(500).send('Error printing batch IDs: ' + err.message);
  }
});

// Resident Approval POST
app.post('/staff/residents/:id/approve', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query("UPDATE residents SET resident_status = 'APPROVED' WHERE id = $1", [id]);
    await sendNotification(id, 'Registration Approved', 'Your resident registration has been approved by barangay staff. You now have full access.');
    await logActivity(req.session.user.id, 'APPROVE_RESIDENT', `Approved resident ID ${id}`, req.ip);
    res.redirect('/staff/residents');
  } catch (err) {
    res.status(500).send('Error approving resident: ' + err.message);
  }
});

app.post('/staff/residents/:id/reject', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  const id = req.params.id;
  const { rejection_reason } = req.body;
  try {
    await pool.query("UPDATE residents SET resident_status = 'REJECTED', rejection_reason = $1 WHERE id = $2", [rejection_reason, id]);
    await sendNotification(id, 'Registration Rejected', `Your resident registration was rejected. Reason: ${rejection_reason}`);
    await logActivity(req.session.user.id, 'REJECT_RESIDENT', `Rejected resident ID ${id}`, req.ip);
    res.redirect('/staff/residents');
  } catch (err) {
    res.status(500).send('Error rejecting resident: ' + err.message);
  }
});

app.post('/staff/residents/:id/archive', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query("UPDATE residents SET resident_status = 'ARCHIVED' WHERE id = $1", [id]);
    await logActivity(req.session.user.id, 'ARCHIVE_RESIDENT', `Archived resident ID ${id}`, req.ip);
    res.redirect('/staff/residents');
  } catch (err) {
    res.status(500).send('Error archiving resident: ' + err.message);
  }
});

app.post('/staff/residents/add', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), upload.single('profile_photo'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      first_name, middle_name, last_name, suffix, date_of_birth,
      gender, civil_status, address, purok_id, contact_number,
      email, password
    } = req.body;

    const settingsRes = await client.query('SELECT id_prefix FROM barangay_settings LIMIT 1');
    const prefix = settingsRes.rows[0]?.id_prefix || 'BRGY-2026-';
    const residentIdNumber = `${prefix}${Math.floor(100000 + Math.random() * 900000)}`;
    const profilePhotoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const resInsert = await client.query(`
      INSERT INTO residents (
        resident_id_number, first_name, middle_name, last_name, suffix,
        date_of_birth, gender, civil_status, address, purok_id,
        contact_number, email, resident_status, profile_photo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'APPROVED', $13)
      RETURNING id
    `, [
      residentIdNumber, first_name, middle_name, last_name, suffix,
      date_of_birth, gender, civil_status, address, purok_id,
      contact_number, email, profilePhotoUrl
    ]);

    const newId = resInsert.rows[0].id;
    const hashedPass = await bcrypt.hash(password || 'password123', 10);
    await client.query(`
      INSERT INTO users (username, email, password, role, resident_id)
      VALUES ($1, $2, $3, 'RESIDENT', $4)
    `, [email, email, hashedPass, newId]);

    await client.query('COMMIT');
    await logActivity(req.session.user.id, 'ADD_RESIDENT', `Added resident ${first_name} ${last_name}`, req.ip);
    res.redirect('/staff/residents');
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).send('Error adding resident: ' + err.message);
  } finally {
    client.release();
  }
});

// View Individual Resident Profile (Staff)
app.get('/staff/residents/:id', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  const id = req.params.id;
  try {
    const resResult = await pool.query(`
      SELECT r.*, p.name as purok_name, h.household_number
      FROM residents r
      LEFT JOIN puroks p ON r.purok_id = p.id
      LEFT JOIN households h ON r.household_id = h.id
      WHERE r.id = $1
    `, [id]);

    if (resResult.rows.length === 0) return res.status(404).send('Resident not found');
    const r = resResult.rows[0];

    res.send(renderStaffLayout('Resident Details', req.session.user, `
      <div class="space-y-6 max-w-4xl mx-auto">
        <div class="flex justify-between items-center">
          <h1 class="text-2xl font-bold text-slate-800">Resident Profile</h1>
          <a href="/staff/residents" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-semibold hover:bg-slate-300">Back to List</a>
        </div>
        <div class="bg-white rounded-xl shadow p-6 flex flex-col md:flex-row gap-6 items-center md:items-start">
          ${r.profile_photo ? `<img src="${r.profile_photo}" class="w-40 h-40 rounded-xl object-cover border-4 border-slate-100">` : '<div class="w-40 h-40 rounded-xl bg-slate-200 flex items-center justify-center text-slate-400">No Photo</div>'}
          <div class="space-y-2 flex-1 text-center md:text-left">
            <h2 class="text-3xl font-bold text-slate-900">${r.first_name} ${r.middle_name || ''} ${r.last_name} ${r.suffix || ''}</h2>
            <p class="font-mono text-blue-600 font-bold text-lg">${r.resident_id_number}</p>
            <p class="text-slate-600"><strong>Status:</strong> <span class="px-2 py-0.5 rounded text-xs font-bold ${r.resident_status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${r.resident_status}</span></p>
            <p class="text-slate-600"><strong>Contact:</strong> ${r.contact_number} | <strong>Email:</strong> ${r.email}</p>
          </div>
        </div>
        <div class="bg-white rounded-xl shadow p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-700">
          <p><strong>Date of Birth:</strong> ${new Date(r.date_of_birth).toLocaleDateString()}</p>
          <p><strong>Gender:</strong> ${r.gender}</p>
          <p><strong>Civil Status:</strong> ${r.civil_status}</p>
          <p><strong>Purok:</strong> ${r.purok_name || 'N/A'}</p>
          <p class="md:col-span-2"><strong>Address:</strong> ${r.address}</p>
          <p><strong>Voter:</strong> ${r.voter_status}</p>
          <p><strong>Senior Citizen:</strong> ${r.senior_citizen_status}</p>
          <p><strong>PWD:</strong> ${r.pwd_status}</p>
          <p><strong>Solo Parent:</strong> ${r.solo_parent_status}</p>
        </div>
      </div>
    `));
  } catch (err) {
    res.status(500).send('Error loading resident profile: ' + err.message);
  }
});

// Households Management
app.get('/staff/households', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const households = await pool.query(`
      SELECT h.*, p.name as purok_name, COUNT(r.id) as member_count
      FROM households h
      LEFT JOIN puroks p ON h.purok_id = p.id
      LEFT JOIN residents r ON r.household_id = h.id
      GROUP BY h.id, p.name
      ORDER BY h.created_at DESC
    `);
    const puroks = await pool.query('SELECT * FROM puroks WHERE status = $1', ['ACTIVE']);

    res.send(renderStaffLayout('Household Management', req.session.user, `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <h1 class="text-2xl font-bold text-slate-800">Household Management</h1>
          <button onclick="openAddHouseholdModal()" class="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700">+ Create Household</button>
        </div>
        <div class="bg-white rounded-xl shadow overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th class="p-3">Household No.</th>
                <th class="p-3">Head Name</th>
                <th class="p-3">Purok</th>
                <th class="p-3">Address</th>
                <th class="p-3">Members</th>
                <th class="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${households.rows.map(h => `
                <tr>
                  <td class="p-3 font-mono font-bold text-indigo-600">${h.household_number}</td>
                  <td class="p-3 font-medium">${h.head_name}</td>
                  <td class="p-3">${h.purok_name || 'N/A'}</td>
                  <td class="p-3 text-slate-600">${h.address}</td>
                  <td class="p-3"><span class="px-2 py-0.5 bg-slate-100 font-semibold rounded">${h.member_count}</span></td>
                  <td class="p-3 text-right"><a href="/staff/households/${h.id}" class="text-blue-600 font-semibold hover:underline">View Members</a></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <!-- Add Household Modal -->
      <div id="addHouseholdModal" class="fixed inset-0 bg-black/50 hidden flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
          <h3 class="text-lg font-bold text-slate-800 mb-4">Create Household</h3>
          <form action="/staff/households/add" method="POST" class="space-y-4">
            <input type="text" name="household_number" placeholder="Household Number (e.g. HH-001)" required class="w-full px-3 py-2 border rounded">
            <input type="text" name="head_name" placeholder="Household Head Name *" required class="w-full px-3 py-2 border rounded">
            <select name="purok_id" required class="w-full px-3 py-2 border rounded">
              <option value="">Select Purok *</option>
              ${puroks.rows.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
            </select>
            <textarea name="address" placeholder="Complete Address *" required rows="2" class="w-full px-3 py-2 border rounded"></textarea>
            <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700">Save Household</button>
          </form>
        </div>
      </div>
      <script>
        function openAddHouseholdModal() { document.getElementById('addHouseholdModal').classList.remove('hidden'); }
      </script>
    `));
  } catch (err) {
    res.status(500).send('Error loading households: ' + err.message);
  }
});

app.post('/staff/households/add', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  const { household_number, head_name, address, purok_id } = req.body;
  try {
    await pool.query(
      'INSERT INTO households (household_number, head_name, address, purok_id) VALUES ($1, $2, $3, $4)',
      [household_number, head_name, address, purok_id]
    );
    await logActivity(req.session.user.id, 'ADD_HOUSEHOLD', `Created household ${household_number}`, req.ip);
    res.redirect('/staff/households');
  } catch (err) {
    res.status(500).send('Error adding household: ' + err.message);
  }
});

// Puroks Management
app.get('/staff/puroks', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const puroks = await pool.query(`
      SELECT p.*, COUNT(r.id) as resident_count
      FROM puroks p
      LEFT JOIN residents r ON r.purok_id = p.id
      GROUP BY p.id
      ORDER BY p.name ASC
    `);

    res.send(renderStaffLayout('Purok Management', req.session.user, `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <h1 class="text-2xl font-bold text-slate-800">Purok Management</h1>
          <button onclick="openAddPurokModal()" class="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700">+ Add Purok</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          ${puroks.rows.map(p => `
            <div class="bg-white rounded-xl shadow p-6 border-l-4 border-blue-600">
              <h3 class="text-xl font-bold text-slate-800">${p.name}</h3>
              <p class="text-slate-500 text-sm mt-1">${p.description || 'No description'}</p>
              <div class="mt-4 pt-4 border-t flex justify-between items-center">
                <span class="text-sm font-semibold text-slate-700">Residents: ${p.resident_count}</span>
                <span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded">${p.status}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <!-- Add Purok Modal -->
      <div id="addPurokModal" class="fixed inset-0 bg-black/50 hidden flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
          <h3 class="text-lg font-bold text-slate-800 mb-4">Add Purok</h3>
          <form action="/staff/puroks/add" method="POST" class="space-y-4">
            <input type="text" name="name" placeholder="Purok Name (e.g. Purok 1)" required class="w-full px-3 py-2 border rounded">
            <textarea name="description" placeholder="Description / Area details" rows="2" class="w-full px-3 py-2 border rounded"></textarea>
            <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700">Save Purok</button>
          </form>
        </div>
      </div>
      <script>
        function openAddPurokModal() { document.getElementById('addPurokModal').classList.remove('hidden'); }
      </script>
    `));
  } catch (err) {
    res.status(500).send('Error loading puroks: ' + err.message);
  }
});

app.post('/staff/puroks/add', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  const { name, description } = req.body;
  try {
    await pool.query('INSERT INTO puroks (name, description) VALUES ($1, $2)', [name, description]);
    await logActivity(req.session.user.id, 'ADD_PUROK', `Added purok ${name}`, req.ip);
    res.redirect('/staff/puroks');
  } catch (err) {
    res.status(500).send('Error adding purok: ' + err.message);
  }
});

// Certificate Requests Management & File Upload
app.get('/staff/certificates', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const certs = await pool.query(`
      SELECT c.*, r.first_name, r.last_name, r.resident_id_number
      FROM certificates c
      JOIN residents r ON c.resident_id = r.id
      ORDER BY c.request_date DESC
    `);

    res.send(renderStaffLayout('Certificate Requests', req.session.user, `
      <div class="space-y-6">
        <h1 class="text-2xl font-bold text-slate-800">Certificate Requests Management</h1>
        <div class="bg-white rounded-xl shadow overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th class="p-3">Resident</th>
                <th class="p-3">Certificate Type</th>
                <th class="p-3">Purpose</th>
                <th class="p-3">Status</th>
                <th class="p-3">File</th>
                <th class="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${certs.rows.map(c => `
                <tr>
                  <td class="p-3 font-medium">${c.first_name}${c.last_name}<br><span class="text-xs text-slate-500">${c.resident_id_number}</span></td>
                  <td class="p-3 font-semibold text-blue-600">${c.certificate_type}</td>
                  <td class="p-3 text-slate-600">${c.purpose || ''}</td>
                  <td class="p-3"><span class="px-2 py-0.5 rounded text-xs font-bold ${c.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${c.status}</span></td>
                  <td class="p-3">${c.uploaded_file ? `<a href="${c.uploaded_file}" target="_blank" class="text-blue-600 font-semibold underline">Download</a>` : '<span class="text-slate-400">Not Uploaded</span>'}</td>
                  <td class="p-3 text-right space-x-2">
                    <form action="/staff/certificates/${c.id}/status" method="POST" class="inline">
                      <input type="hidden" name="status" value="Approved">
                      <button class="text-emerald-600 font-semibold hover:underline">Approve</button>
                    </form>
                    <button onclick="openUploadModal(${c.id})" class="text-indigo-600 font-semibold hover:underline">Upload File</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <!-- Upload Certificate Modal -->
      <div id="uploadCertModal" class="fixed inset-0 bg-black/50 hidden flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
          <h3 class="text-lg font-bold text-slate-800 mb-4">Upload Official Certificate Document</h3>
          <form id="uploadCertForm" method="POST" enctype="multipart/form-data" class="space-y-4">
            <input type="file" name="certificate_file" accept=".pdf,image/*" required class="w-full text-sm">
            <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700">Upload & Mark Ready</button>
          </form>
        </div>
      </div>
      <script>
        function openUploadModal(id) {
          document.getElementById('uploadCertForm').action = '/staff/certificates/' + id + '/upload';
          document.getElementById('uploadCertModal').classList.remove('hidden');
        }
      </script>
    `));
  } catch (err) {
    res.status(500).send('Error loading certificates: ' + err.message);
  }
});

app.post('/staff/certificates/:id/status', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  try {
    await pool.query('UPDATE certificates SET status = $1, approved_date = CURRENT_TIMESTAMP WHERE id = $2', [status, id]);
    const cert = await pool.query('SELECT resident_id, certificate_type FROM certificates WHERE id = $1', [id]);
    if (cert.rows.length > 0) {
      await sendNotification(cert.rows[0].resident_id, 'Certificate Update', `Your request for ${cert.rows[0].certificate_type} has been updated to ${status}.`);
    }
    await logActivity(req.session.user.id, 'UPDATE_CERTIFICATE', `Updated certificate request ${id} to ${status}`, req.ip);
    res.redirect('/staff/certificates');
  } catch (err) {
    res.status(500).send('Error updating certificate: ' + err.message);
  }
});

app.post('/staff/certificates/:id/upload', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), upload.single('certificate_file'), async (req, res) => {
  const id = req.params.id;
  try {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const fileUrl = `/uploads/${req.file.filename}`;
    await pool.query("UPDATE certificates SET uploaded_file = $1, status = 'Ready for Release' WHERE id = $2", [fileUrl, id]);
    const cert = await pool.query('SELECT resident_id, certificate_type FROM certificates WHERE id = $1', [id]);
    if (cert.rows.length > 0) {
      await sendNotification(cert.rows[0].resident_id, 'Certificate Ready', `Your ${cert.rows[0].certificate_type} document has been uploaded and is ready for download.`);
    }
    await logActivity(req.session.user.id, 'UPLOAD_CERTIFICATE', `Uploaded file for certificate request ${id}`, req.ip);
    res.redirect('/staff/certificates');
  } catch (err) {
    res.status(500).send('Error uploading certificate file: ' + err.message);
  }
});

// Appointments Management
app.get('/staff/appointments', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const appts = await pool.query(`
      SELECT a.*, r.first_name, r.last_name, r.contact_number
      FROM appointments a
      JOIN residents r ON a.resident_id = r.id
      ORDER BY a.appointment_date DESC
    `);

    res.send(renderStaffLayout('Appointment Management', req.session.user, `
      <div class="space-y-6">
        <h1 class="text-2xl font-bold text-slate-800">Appointment Management</h1>
        <div class="bg-white rounded-xl shadow overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th class="p-3">Resident</th>
                <th class="p-3">Service</th>
                <th class="p-3">Date & Time</th>
                <th class="p-3">Reason</th>
                <th class="p-3">Status</th>
                <th class="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${appts.rows.map(a => `
                <tr>
                  <td class="p-3 font-medium">${a.first_name}${a.last_name}<br><span class="text-xs text-slate-500">${a.contact_number}</span></td>
                  <td class="p-3 font-semibold text-indigo-600">${a.service}</td>
                  <td class="p-3">${new Date(a.appointment_date).toLocaleDateString()}${a.appointment_time}</td>
                  <td class="p-3 text-slate-600">${a.reason || ''}</td>
                  <td class="p-3"><span class="px-2 py-0.5 rounded text-xs font-bold ${a.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${a.status}</span></td>
                  <td class="p-3 text-right space-x-2">
                    <form action="/staff/appointments/${a.id}/status" method="POST" class="inline">
                      <input type="hidden" name="status" value="Approved">
                      <button class="text-emerald-600 font-semibold hover:underline">Approve</button>
                    </form>
                    <form action="/staff/appointments/${a.id}/status" method="POST" class="inline">
                      <input type="hidden" name="status" value="Completed">
                      <button class="text-blue-600 font-semibold hover:underline">Complete</button>
                    </form>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `));
  } catch (err) {
    res.status(500).send('Error loading appointments: ' + err.message);
  }
});

app.post('/staff/appointments/:id/status', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  try {
    await pool.query('UPDATE appointments SET status = $1 WHERE id = $2', [status, id]);
    res.redirect('/staff/appointments');
  } catch (err) {
    res.status(500).send('Error updating appointment: ' + err.message);
  }
});

// Blotter Management
app.get('/staff/blotters', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const blotters = await pool.query('SELECT * FROM blotters ORDER BY created_at DESC');

    res.send(renderStaffLayout('Blotter Management', req.session.user, `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <h1 class="text-2xl font-bold text-slate-800">Blotter & Incident Records</h1>
          <button onclick="openAddBlotterModal()" class="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700">+ New Blotter Record</button>
        </div>
        <div class="bg-white rounded-xl shadow overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th class="p-3">Case No.</th>
                <th class="p-3">Complainant</th>
                <th class="p-3">Respondent</th>
                <th class="p-3">Incident Date</th>
                <th class="p-3">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${blotters.rows.map(b => `
                <tr>
                  <td class="p-3 font-mono font-bold text-red-600">${b.case_number}</td>
                  <td class="p-3 font-medium">${b.complainant}</td>
                  <td class="p-3 font-medium">${b.respondent}</td>
                  <td class="p-3">${new Date(b.incident_date).toLocaleDateString()}${b.incident_time}</td>
                  <td class="p-3"><span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">${b.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <!-- Add Blotter Modal -->
      <div id="addBlotterModal" class="fixed inset-0 bg-black/50 hidden flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
          <h3 class="text-lg font-bold text-slate-800 mb-4">New Blotter Entry</h3>
          <form action="/staff/blotters/add" method="POST" class="space-y-3">
            <input type="text" name="case_number" placeholder="Case Number (e.g. BLT-2026-001)" required class="w-full px-3 py-2 border rounded">
            <input type="text" name="complainant" placeholder="Complainant Name *" required class="w-full px-3 py-2 border rounded">
            <input type="text" name="respondent" placeholder="Respondent Name *" required class="w-full px-3 py-2 border rounded">
            <div class="grid grid-cols-2 gap-2">
              <input type="date" name="incident_date" required class="px-3 py-2 border rounded">
              <input type="time" name="incident_time" required class="px-3 py-2 border rounded">
            </div>
            <input type="text" name="location" placeholder="Location of Incident *" required class="w-full px-3 py-2 border rounded">
            <textarea name="incident_description" placeholder="Incident Description *" required rows="3" class="w-full px-3 py-2 border rounded"></textarea>
            <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700">Save Blotter Record</button>
          </form>
        </div>
      </div>
      <script>
        function openAddBlotterModal() { document.getElementById('addBlotterModal').classList.remove('hidden'); }
      </script>
    `));
  } catch (err) {
    res.status(500).send('Error loading blotters: ' + err.message);
  }
});

app.post('/staff/blotters/add', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  const { case_number, complainant, respondent, incident_date, incident_time, location, incident_description } = req.body;
  try {
    await pool.query(
      'INSERT INTO blotters (case_number, complainant, respondent, incident_date, incident_time, location, incident_description) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [case_number, complainant, respondent, incident_date, incident_time, location, incident_description]
    );
    await logActivity(req.session.user.id, 'ADD_BLOTTER', `Created blotter case ${case_number}`, req.ip);
    res.redirect('/staff/blotters');
  } catch (err) {
    res.status(500).send('Error adding blotter: ' + err.message);
  }
});

// Announcements Management
app.get('/staff/announcements', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const ann = await pool.query('SELECT * FROM announcements ORDER BY date_posted DESC');

    res.send(renderStaffLayout('Announcements', req.session.user, `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <h1 class="text-2xl font-bold text-slate-800">Barangay Announcements</h1>
          <button onclick="openAddAnnModal()" class="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700">+ Post Announcement</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${ann.rows.map(a => `
            <div class="bg-white rounded-xl shadow p-6 space-y-2">
              <span class="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-bold rounded">${a.category}</span>
              <h3 class="text-xl font-bold text-slate-800">${a.title}</h3>
              <p class="text-slate-600 text-sm">${a.content}</p>
              <p class="text-xs text-slate-400 pt-2 border-t">${new Date(a.date_posted).toLocaleString()}</p>
            </div>
          `).join('')}
        </div>
      </div>
      <!-- Add Announcement Modal -->
      <div id="addAnnModal" class="fixed inset-0 bg-black/50 hidden flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
          <h3 class="text-lg font-bold text-slate-800 mb-4">Post Announcement</h3>
          <form action="/staff/announcements/add" method="POST" class="space-y-3">
            <input type="text" name="title" placeholder="Announcement Title *" required class="w-full px-3 py-2 border rounded">
            <select name="category" class="w-full px-3 py-2 border rounded">
              <option value="General">General</option>
              <option value="Event">Event</option>
              <option value="Emergency">Emergency</option>
              <option value="Public Notice">Public Notice</option>
            </select>
            <textarea name="content" placeholder="Announcement content..." required rows="4" class="w-full px-3 py-2 border rounded"></textarea>
            <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700">Publish Announcement</button>
          </form>
        </div>
      </div>
      <script>
        function openAddAnnModal() { document.getElementById('addAnnModal').classList.remove('hidden'); }
      </script>
    `));
  } catch (err) {
    res.status(500).send('Error loading announcements: ' + err.message);
  }
});

app.post('/staff/announcements/add', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
  const { title, content, category } = req.body;
  try {
    await pool.query('INSERT INTO announcements (title, content, category) VALUES ($1, $2, $3)', [title, content, category]);
    await logActivity(req.session.user.id, 'ADD_ANNOUNCEMENT', `Posted announcement ${title}`, req.ip);
    res.redirect('/staff/announcements');
  } catch (err) {
    res.status(500).send('Error adding announcement: ' + err.message);
  }
});

// Barangay Settings
app.get('/staff/settings', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY']), async (req, res) => {
  try {
    const settings = await pool.query('SELECT * FROM barangay_settings LIMIT 1');
    const s = settings.rows[0] || {};

    res.send(renderStaffLayout('Barangay Settings', req.session.user, `
      <div class="space-y-6 max-w-2xl mx-auto">
        <h1 class="text-2xl font-bold text-slate-800">Barangay Settings & Information</h1>
        <form action="/staff/settings" method="POST" enctype="multipart/form-data" class="bg-white rounded-xl shadow p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700">Barangay Name</label>
            <input type="text" name="barangay_name" value="${s.barangay_name || ''}" required class="mt-1 w-full px-3 py-2 border rounded-lg">
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700">Barangay Address</label>
            <input type="text" name="barangay_address" value="${s.barangay_address || ''}" required class="mt-1 w-full px-3 py-2 border rounded-lg">
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-slate-700">Contact Number</label>
              <input type="text" name="contact_number" value="${s.contact_number || ''}" required class="mt-1 w-full px-3 py-2 border rounded-lg">
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700">Email Address</label>
              <input type="email" name="email" value="${s.email || ''}" required class="mt-1 w-full px-3 py-2 border rounded-lg">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-slate-700">Barangay Captain</label>
              <input type="text" name="barangay_captain" value="${s.barangay_captain || ''}" required class="mt-1 w-full px-3 py-2 border rounded-lg">
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700">Barangay Secretary</label>
              <input type="text" name="secretary" value="${s.secretary || ''}" required class="mt-1 w-full px-3 py-2 border rounded-lg">
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700">Barangay Logo (Image File)</label>
            ${s.barangay_logo ? `<div class="my-2"><img src="${s.barangay_logo}" class="w-16 h-16 rounded-full object-cover border"></div>` : ''}
            <input type="file" name="barangay_logo" accept="image/*" class="mt-1 w-full text-sm">
          </div>
          <button type="submit" class="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition">Save Settings</button>
        </form>
      </div>
    `));
  } catch (err) {
    res.status(500).send('Error loading settings: ' + err.message);
  }
});

app.post('/staff/settings', isAuthenticated, requireRole(['ADMIN', 'BARANGAY_SECRETARY']), upload.single('barangay_logo'), async (req, res) => {
  const { barangay_name, barangay_address, contact_number, email, barangay_captain, secretary } = req.body;
  try {
    let logoQueryPart = '';
    let params = [barangay_name, barangay_address, contact_number, email, barangay_captain, secretary];

    if (req.file) {
      logoQueryPart = ', barangay_logo = $7';
      params.push(`/uploads/${req.file.filename}`);
    }

    await pool.query(`
      UPDATE barangay_settings 
      SET barangay_name = $1, barangay_address = $2, contact_number = $3, email = $4, barangay_captain = $5, secretary = $6 ${logoQueryPart}
      WHERE id = 1
    `, params);

    await logActivity(req.session.user.id, 'UPDATE_SETTINGS', 'Updated barangay settings', req.ip);
    res.redirect('/staff/settings');
  } catch (err) {
    res.status(500).send('Error updating settings: ' + err.message);
  }
});

// --- RESIDENT PORTAL ROUTES ---

app.get('/resident/dashboard', isAuthenticated, requireRole(['RESIDENT']), async (req, res) => {
  const residentId = req.session.user.resident_id;
  try {
    const resResult = await pool.query(`
      SELECT r.*, p.name as purok_name, h.household_number, b.*
      FROM residents r
      LEFT JOIN puroks p ON r.purok_id = p.id
      LEFT JOIN households h ON r.household_id = h.id
      CROSS JOIN barangay_settings b
      WHERE r.id = $1
    `, [residentId]);

    if (resResult.rows.length === 0) return res.redirect('/login');
    const resident = resResult.rows[0];

    const certs = await pool.query('SELECT * FROM certificates WHERE resident_id = $1 ORDER BY request_date DESC', [residentId]);
    const notifications = await pool.query('SELECT * FROM notifications WHERE resident_id = $1 ORDER BY created_at DESC LIMIT 5', [residentId]);

    res.send(renderResidentLayout('Resident Dashboard', resident, `
      <div class="space-y-6">
        <div class="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 class="text-3xl font-bold">Welcome, ${resident.first_name}!</h1>
            <p class="text-blue-100 mt-1">${resident.barangay_name} Resident Portal</p>
            <p class="font-mono text-sm bg-blue-800/50 px-3 py-1 rounded-full inline-block mt-3">ID: ${resident.resident_id_number}</p>
          </div>
          ${resident.profile_photo ? `<img src="${resident.profile_photo}" class="w-24 h-24 rounded-full object-cover border-4 border-white/20">` : ''}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-white rounded-xl shadow p-6 space-y-4">
            <h3 class="text-lg font-bold text-slate-800">My Certificate Requests</h3>
            <a href="/resident/certificates" class="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700">+ Request New Certificate</a>
            <div class="space-y-2 mt-4">
              ${certs.rows.map(c => `
                <div class="p-3 bg-slate-50 rounded-lg flex justify-between items-center text-sm">
                  <div>
                    <p class="font-semibold text-slate-800">${c.certificate_type}</p>
                    <p class="text-xs text-slate-500">${new Date(c.request_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <span class="px-2 py-0.5 rounded text-xs font-bold ${c.status === 'Ready for Release' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${c.status}</span>${c.uploaded_file ? `<a href="${c.uploaded_file}" target="_blank" class="ml-2 text-blue-600 font-semibold underline">Download</a>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="bg-white rounded-xl shadow p-6 space-y-4">
            <h3 class="text-lg font-bold text-slate-800">Notifications</h3>
            <div class="space-y-2">
              ${notifications.rows.length === 0 ? '<p class="text-slate-500 text-sm">No new notifications.</p>' : ''}
              {notifications.rows.map(n => `
                <div class="p-3 bg-slate-50 rounded-lg text-sm space-y-1">
                  <p class="font-semibold text-slate-800">${n.title}</p>
                  <p class="text-slate-600">${n.message}</p>
                  <p class="text-xs text-slate-400">${new Date(n.created_at).toLocaleString()}</p>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `));
  } catch (err) {
    res.status(500).send('Resident Dashboard Error: ' + err.message);
  }
});

// Resident Digital ID Page
app.get('/resident/id', isAuthenticated, requireRole(['RESIDENT']), async (req, res) => {
  const residentId = req.session.user.resident_id;
  try {
    const resResult = await pool.query(`
      SELECT r.*, p.name as purok_name, b.*
      FROM residents r
      LEFT JOIN puroks p ON r.purok_id = p.id
      CROSS JOIN barangay_settings b
      WHERE r.id = $1
    `, [residentId]);

    if (resResult.rows.length === 0) return res.redirect('/login');
    const resident = resResult.rows[0];

    res.send(renderResidentLayout('My Digital ID', resident, `
      <div class="space-y-6 max-w-xl mx-auto text-center">
        <h1 class="text-2xl font-bold text-slate-800">My Digital Resident ID</h1>
        <div class="bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-slate-200">
          <div class="bg-blue-900 text-white p-4 flex items-center justify-between">
            <div class="flex items-center space-x-2">
              ${resident.barangay_logo ? `<img src="${resident.barangay_logo}" class="w-10 h-10 rounded-full object-cover">` : ''}
              <div class="text-left">
                <h4 class="font-bold text-sm">${resident.barangay_name}</h4>
                <p class="text-xs text-blue-200">Official Resident ID</p>
              </div>
            </div>
            <span class="px-2 py-0.5 bg-emerald-500 text-white text-xs font-bold rounded">${resident.resident_status}</span>
          </div>
          <div class="p-6 space-y-4">
            ${resident.profile_photo ? `<img src="${resident.profile_photo}" class="w-36 h-36 mx-auto rounded-full object-cover border-4 border-slate-100 shadow">` : '<div class="w-36 h-36 mx-auto rounded-full bg-slate-200 flex items-center justify-center text-slate-400">Photo</div>'}
            <div>
              <h2 class="text-2xl font-bold text-slate-900">${resident.first_name} ${resident.middle_name || ''} ${resident.last_name} ${resident.suffix || ''}</h2>
              <p class="font-mono text-blue-600 font-bold text-lg mt-1">${resident.resident_id_number}</p>
            </div>
            <div class="bg-slate-50 p-4 rounded-xl text-left text-sm space-y-2 border">
              <p><strong>Address:</strong> ${resident.address}</p>
              <p><strong>Purok:</strong> ${resident.purok_name || 'N/A'}</p>
              <p><strong>Date of Birth:</strong> ${new Date(resident.date_of_birth).toLocaleDateString()}</p>
              <p><strong>Contact:</strong> ${resident.contact_number}</p>
            </div>
            <div class="pt-4 border-t flex justify-center">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent('https://' + req.get('host') + '/verify/id/' + resident.resident_id_number)}" class="w-28 h-28 border p-1 bg-white rounded">
            </div>
            <p class="text-xs text-slate-400">Scan QR code to verify official resident identity.</p>
          </div>
        </div>
        <button onclick="window.print()" class="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700 shadow">Print Digital ID</button>
      </div>
    `));
  } catch (err) {
    res.status(500).send('Error loading digital ID: ' + err.message);
  }
});

// Resident Certificate Request Page
app.get('/resident/certificates', isAuthenticated, requireRole(['RESIDENT']), async (req, res) => {
  const residentId = req.session.user.resident_id;
  try {
    const certs = await pool.query('SELECT * FROM certificates WHERE resident_id = $1 ORDER BY request_date DESC', [residentId]);
    const resRes = await pool.query('SELECT * FROM barangay_settings LIMIT 1');

    res.send(renderResidentLayout('Certificate Requests', resRes.rows[0], `
      <div class="space-y-6 max-w-4xl mx-auto">
        <div class="flex justify-between items-center">
          <h1 class="text-2xl font-bold text-slate-800">Certificate Requests</h1>
          <button onclick="openReqModal()" class="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700">+ Request Certificate</button>
        </div>
        <div class="bg-white rounded-xl shadow overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th class="p-3">Certificate Type</th>
                <th class="p-3">Purpose</th>
                <th class="p-3">Request Date</th>
                <th class="p-3">Status</th>
                <th class="p-3 text-right">Document</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${certs.rows.map(c => `
                <tr>
                  <td class="p-3 font-semibold text-blue-600">${c.certificate_type}</td>
                  <td class="p-3 text-slate-600">${c.purpose || ''}</td>
                  <td class="p-3">${new Date(c.request_date).toLocaleDateString()}</td>
                  <td class="p-3"><span class="px-2 py-0.5 rounded text-xs font-bold ${c.status === 'Ready for Release' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${c.status}</span></td>
                  <td class="p-3 text-right">${c.uploaded_file ? `<a href="${c.uploaded_file}" target="_blank" class="text-blue-600 font-semibold underline">Download Document</a>` : '<span class="text-slate-400">Pending Staff Upload</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <!-- Request Modal -->
      <div id="reqModal" class="fixed inset-0 bg-black/50 hidden flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
          <h3 class="text-lg font-bold text-slate-800 mb-4">Request Certificate</h3>
          <form action="/resident/certificates/add" method="POST" class="space-y-4">
            <select name="certificate_type" required class="w-full px-3 py-2 border rounded">
              <option value="Barangay Clearance">Barangay Clearance</option>
              <option value="Certificate of Residency">Certificate of Residency</option>
              <option value="Certificate of Indigency">Certificate of Indigency</option>
              <option value="Certificate of Good Moral">Certificate of Good Moral</option>
              <option value="Certificate of No Income">Certificate of No Income</option>
            </select>
            <textarea name="purpose" placeholder="State purpose of request *" required rows="3" class="w-full px-3 py-2 border rounded"></textarea>
            <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700">Submit Request</button>
          </form>
        </div>
      </div>
      <script>
        function openReqModal() { document.getElementById('reqModal').classList.remove('hidden'); }
      </script>
    `));
  } catch (err) {
    res.status(500).send('Error loading resident certificates: ' + err.message);
  }
});

app.post('/resident/certificates/add', isAuthenticated, requireRole(['RESIDENT']), async (req, res) => {
  const residentId = req.session.user.resident_id;
  const { certificate_type, purpose } = req.body;
  try {
    await pool.query(
      'INSERT INTO certificates (resident_id, certificate_type, purpose, status) VALUES ($1, $2, $3, $4)',
      [residentId, certificate_type, purpose, 'Pending']
    );
    res.redirect('/resident/certificates');
  } catch (err) {
    res.status(500).send('Error requesting certificate: ' + err.message);
  }
});

// Root Route Redirect
app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    if (req.session.user.role === 'RESIDENT') return res.redirect('/resident/dashboard');
    return res.redirect('/staff/dashboard');
  }
  res.redirect('/login');
});

// ==========================================
// HTML TEMPLATES & LAYOUT GENERATORS
// ==========================================

function renderHtmlLayout(title, bodyContent) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - Barangay Management System</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-50 font-sans text-slate-800">
      ${bodyContent}
    </body>
    </html>
  `;
}

function renderAlertPage(title, message, backUrl) {
  return renderHtmlLayout(title, `
    <div class="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center space-y-4">
        <h1 class="text-2xl font-bold text-slate-800">${title}</h1>
        <p class="text-slate-600 text-sm">${message}</p>
        <a href="${backUrl}" class="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700">Back</a>
      </div>
    </div>
  `);
}

function renderStaffLayout(title, user, content) {
  return renderHtmlLayout(title, `
    <div class="min-h-screen flex flex-col md:flex-row">
      <!-- Sidebar -->
      <aside class="w-full md:w-64 bg-slate-900 text-slate-300 flex flex-col">
        <div class="p-6 border-b border-slate-800">
          <h2 class="text-xl font-bold text-white">Barangay System</h2>
          <p class="text-xs text-slate-400 mt-1">Staff Portal (${user.role})</p>
        </div>
        <nav class="flex-1 p-4 space-y-1 text-sm overflow-y-auto">
          <a href="/staff/dashboard" class="block px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition">Dashboard</a>
          <a href="/staff/residents" class="block px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition">Residents</a>
          <a href="/staff/households" class="block px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition">Households</a>
          <a href="/staff/puroks" class="block px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition">Puroks</a>
          <a href="/staff/certificates" class="block px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition">Certificates</a>
          <a href="/staff/appointments" class="block px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition">Appointments</a>
          <a href="/staff/blotters" class="block px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition">Blotter Records</a>
          <a href="/staff/announcements" class="block px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition">Announcements</a>
          ${user.role === 'ADMIN' || user.role === 'BARANGAY_SECRETARY' ? `<a href="/staff/settings" class="block px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white transition">Barangay Settings</a>` : ''}
        </nav>
        <div class="p-4 border-t border-slate-800">
          <a href="/logout" class="block text-center bg-red-600/20 text-red-400 py-2 rounded-lg font-semibold hover:bg-red-600 hover:text-white transition">Sign Out</a>
        </div>
      </aside>
      <!-- Main Content -->
      <main class="flex-1 p-6 md:p-10 overflow-y-auto">
        ${content}
      </main>
    </div>
  `);
}

function renderResidentLayout(title, resident, content) {
  return renderHtmlLayout(title, `
    <div class="min-h-screen flex flex-col md:flex-row">
      <!-- Sidebar -->
      <aside class="w-full md:w-64 bg-blue-900 text-blue-100 flex flex-col">
        <div class="p-6 border-b border-blue-800">
          <h2 class="text-xl font-bold text-white">Resident Portal</h2>
          <p class="text-xs text-blue-300 mt-1">${resident.first_name} ${resident.last_name}</p>
        </div>
        <nav class="flex-1 p-4 space-y-1 text-sm">
          <a href="/resident/dashboard" class="block px-4 py-2.5 rounded-lg hover:bg-blue-800 hover:text-white transition">Dashboard</a>
          <a href="/resident/id" class="block px-4 py-2.5 rounded-lg hover:bg-blue-800 hover:text-white transition">My Digital ID</a>
          <a href="/resident/certificates" class="block px-4 py-2.5 rounded-lg hover:bg-blue-800 hover:text-white transition">Certificate Requests</a>
        </nav>
        <div class="p-4 border-t border-blue-800">
          <a href="/logout" class="block text-center bg-red-600/20 text-red-300 py-2 rounded-lg font-semibold hover:bg-red-600 hover:text-white transition">Sign Out</a>
        </div>
      </aside>
      <!-- Main Content -->
      <main class="flex-1 p-6 md:p-10 overflow-y-auto">
        ${content}
      </main>
    </div>
  `);
}

function renderStatCard(title, value, colorClass) {
  return `
    <div class="bg-white rounded-xl shadow p-5 flex items-center justify-between border-l-4 ${colorClass.replace('bg-', 'border-')}">
      <div>
        <p class="text-xs text-slate-500 uppercase font-semibold">${title}</p>
        <p class="text-3xl font-bold text-slate-800 mt-1">${value}</p>
      </div>
      <div class="w-12 h-12 rounded-xl ${colorClass} flex items-center justify-center text-white font-bold text-lg">📊</div>
    </div>
  `;
}

// 8-Up ID Card Print Layout (Fits exactly 8 IDs in 4 columns x 2 rows per bond paper page)
function renderIdCardPrintLayout(residents, pageTitle) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${pageTitle}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        @media print {
          body { background: white; -webkit-print-color-adjust: exact; }
          .no-print { display: none; }
          .page-break { page-break-after: always; }
        }
        .id-card {
          width: 3.375in;
          height: 2.125in;
          border: 1px solid #cbd5e1;
          border-radius: 0.5in;
          overflow: hidden;
          background: white;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 8px;
          page-break-inside: avoid;
        }
      </style>
    </head>
    <body class="bg-slate-100 p-6">
      <div class="no-print max-w-4xl mx-auto mb-6 flex justify-between items-center bg-white p-4 rounded-xl shadow">
        <h1 class="font-bold text-lg text-slate-800">${pageTitle} (${residents.length} IDs)</h1>
        <button onclick="window.print()" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700">Print 8-Up Bond Paper</button>
      </div>
      <div class="max-w-[11in] mx-auto grid grid-cols-4 gap-4">
        ${residents.map(r => `
          <div class="id-card">
            <div class="flex items-center space-x-2 border-b pb-1">
              ${r.barangay_logo ? `<img src="${r.barangay_logo}" class="w-8 h-8 rounded-full object-cover">` : ''}
              <div>
                <h3 class="text-[10px] font-bold text-slate-900 leading-tight">${r.barangay_name}</h3>
                <p class="text-[8px] text-slate-500">Official Resident ID</p>
              </div>
            </div>
            <div class="flex items-center space-x-3 my-auto">
              ${r.profile_photo ? `<img src="${r.profile_photo}" class="w-14 h-14 rounded-full object-cover border">` : '<div class="w-14 h-14 rounded-full bg-slate-200"></div>'}
              <div class="overflow-hidden">
                <h4 class="text-xs font-bold text-slate-900 truncate">${r.first_name}${r.last_name}</h4>
                <p class="text-[10px] font-mono text-blue-600 font-semibold">${r.resident_id_number}</p>
                <p class="text-[8px] text-slate-600 truncate">${r.address}</p>
              </div>
            </div>
            <div class="flex justify-between items-end border-t pt-1">
              <span class="text-[8px] font-semibold text-slate-500">Purok: ${r.purok_name || 'N/A'}</span>
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=50x50&data=${encodeURIComponent('https://' + r.resident_id_number)}" class="w-10 h-10">
            </div>
          </div>
        `).join('')}
      </div>
    </body>
    </html>
  `;
}

// Database stats calculation helper
async function getStaffDashboardStats() {
  const totalRes = await pool.query('SELECT COUNT(*) FROM residents');
  const pendingRes = await pool.query("SELECT COUNT(*) FROM residents WHERE resident_status = 'PENDING'");
  const approvedRes = await pool.query("SELECT COUNT(*) FROM residents WHERE resident_status = 'APPROVED'");
  const households = await pool.query('SELECT COUNT(*) FROM households');
  const male = await pool.query("SELECT COUNT(*) FROM residents WHERE gender = 'Male'");
  const female = await pool.query("SELECT COUNT(*) FROM residents WHERE gender = 'Female'");
  const seniors = await pool.query("SELECT COUNT(*) FROM residents WHERE senior_citizen_status = 'Yes'");
  const pwd = await pool.query("SELECT COUNT(*) FROM residents WHERE pwd_status = 'Yes'");
  const solo = await pool.query("SELECT COUNT(*) FROM residents WHERE solo_parent_status = 'Yes'");
  const minors = await pool.query("SELECT COUNT(*) FROM residents WHERE date_of_birth > CURRENT_DATE - INTERVAL '18 years'");
  const voters = await pool.query("SELECT COUNT(*) FROM residents WHERE voter_status = 'Yes'");
  const pendingCerts = await pool.query("SELECT COUNT(*) FROM certificates WHERE status = 'Pending'");

  return {
    totalResidents: totalRes.rows[0].count,
    pendingResidents: pendingRes.rows[0].count,
    approvedResidents: approvedRes.rows[0].count,
    totalHouseholds: households.rows[0].count,
    maleResidents: male.rows[0].count,
    femaleResidents: female.rows[0].count,
    seniorResidents: seniors.rows[0].count,
    pwdResidents: pwd.rows[0].count,
    soloResidents: solo.rows[0].count,
    minorResidents: minors.rows[0].count,
    voterResidents: voters.rows[0].count,
    pendingCerts: pendingCerts.rows[0].count
  };
}

// Start Server
app.listen(PORT, () => {
  console.log(`Barangay Resident Management System running on port ${PORT}`);
});
