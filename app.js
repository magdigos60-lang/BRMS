/**
 * Barangay Resident Management System
 * Complete Node.js / Express / SQLite Application
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const multer = require('multer');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage configuration for uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// Database Setup
const dbFile = path.join(__dirname, 'barangay.db');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) console.error('Database opening error: ', err.message);
    else console.log('Connected to SQLite database.');
});

// Initialize Tables and Default Admin
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barangay_name TEXT,
        municipality TEXT,
        province TEXT,
        address TEXT,
        contact TEXT,
        email TEXT,
        logo TEXT,
        captain TEXT,
        secretary TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        role TEXT,
        resident_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS residents (
        id TEXT PRIMARY KEY,
        first_name TEXT,
        middle_name TEXT,
        last_name TEXT,
        suffix TEXT,
        full_name TEXT,
        dob TEXT,
        age INTEGER,
        sex TEXT,
        civil_status TEXT,
        contact TEXT,
        email TEXT,
        address TEXT,
        purok TEXT,
        house_number TEXT,
        occupation TEXT,
        educational_attainment TEXT,
        nationality TEXT,
        voter_status TEXT,
        senior_status TEXT,
        pwd_status TEXT,
        solo_parent_status TEXT,
        four_ps_status TEXT,
        photo TEXT,
        date_registered TEXT,
        registration_status TEXT DEFAULT 'PENDING',
        rejection_reason TEXT,
        approval_date TEXT,
        approved_by TEXT,
        active_status TEXT DEFAULT 'ACTIVE',
        archive_reason TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS households (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        household_number TEXT UNIQUE,
        household_head_id TEXT,
        address TEXT,
        purok TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS puroks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        description TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS certificates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id TEXT,
        certificate_type TEXT,
        purpose TEXT,
        quantity INTEGER,
        preferred_date TEXT,
        notes TEXT,
        status TEXT DEFAULT 'PENDING',
        request_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_date TEXT,
        processed_by TEXT,
        rejection_reason TEXT,
        certificate_file TEXT,
        release_date TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id TEXT,
        service TEXT,
        date TEXT,
        time TEXT,
        purpose TEXT,
        notes TEXT,
        status TEXT DEFAULT 'PENDING',
        staff_remarks TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS complaints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id TEXT,
        complaint_type TEXT,
        date TEXT,
        location TEXT,
        description TEXT,
        status TEXT DEFAULT 'SUBMITTED',
        remarks TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS assistance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id TEXT,
        assistance_type TEXT,
        amount_or_details TEXT,
        status TEXT DEFAULT 'PENDING',
        date_requested DATETIME DEFAULT CURRENT_TIMESTAMP,
        remarks TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS businesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_name TEXT,
        owner_name TEXT,
        address TEXT,
        business_type TEXT,
        contact TEXT,
        permit_number TEXT,
        permit_status TEXT DEFAULT 'ACTIVE',
        expiration_date TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        category TEXT,
        content TEXT,
        date_posted DATETIME DEFAULT CURRENT_TIMESTAMP,
        posted_by TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id TEXT,
        title TEXT,
        message TEXT,
        date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_read INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        action TEXT,
        date TEXT,
        time TEXT,
        ip TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS profile_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id TEXT,
        current_data_json TEXT,
        requested_data_json TEXT,
        reason TEXT,
        status TEXT DEFAULT 'PENDING'
    )`);

    // Seed default settings if empty
    db.get(`SELECT COUNT(*) as count FROM settings`, (err, row) => {
        if (row && row.count === 0) {
            db.run(`INSERT INTO settings (barangay_name, municipality, province, address, contact, email, logo, captain, secretary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                ['Barangay San Jose', 'Sample Municipality', 'Sample Province', 'San Jose Main Road', '09123456789', 'sanjose@barangay.gov.ph', '/default-logo.png', 'Juan D. Capitan', 'Maria S. Sekretarya']);
        }
    });

    // Seed default Admin user if empty
    db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'`, async (err, row) => {
        if (row && row.count === 0) {
            const hash = await bcrypt.hash('admin123', 10);
            db.run(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`, ['admin', hash, 'ADMIN']);
        }
    });
});

// Middleware Configuration
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(uploadDir));
app.use(session({
    secret: 'barangay-system-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set true if HTTPS in production
}));

// Helper to log activities
function logActivity(username, action, ip) {
    const date = new Date().toISOString().split('T')[0];
    const time = new Date().toTimeString().split(' ')[0];
    db.run(`INSERT INTO activity_logs (username, action, date, time, ip) VALUES (?, ?, ?, ?, ?)`,
        [username || 'System', action, date, time, ip || '127.0.0.1']);
}

// Middleware to inject global Barangay settings & notifications into views
app.use((req, res, next) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        res.locals.settings = settings || {
            barangay_name: 'Barangay Central',
            municipality: 'Municipality',
            province: 'Province',
            address: 'Main St.',
            contact: '09000000000',
            email: 'info@barangay.gov.ph',
            logo: '',
            captain: 'Barangay Captain',
            secretary: 'Barangay Secretary'
        };
        res.locals.user = req.session.user || null;
        next();
    });
});

// Auth Middlewares
function requireStaff(req, res, next) {
    if (req.session.user && ['ADMIN', 'SECRETARY', 'STAFF'].includes(req.session.user.role)) {
        return next();
    }
    res.redirect('/login');
}

function requireAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'ADMIN') {
        return next();
    }
    res.redirect('/login');
}

function requireResident(req, res, next) {
    if (req.session.user && req.session.user.role === 'RESIDENT') {
        return next();
    }
    res.redirect('/login');
}

// Utility Layout Renderer
function renderLayout(title, content, userRole, req) {
    const barangayName = req.app.locals.settings?.barangay_name || 'Barangay Management System';
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - ${barangayName}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background: #f4f7f6; color: #333; display: flex; height: 100vh; overflow: hidden; }
        .sidebar { width: 260px; background: #2c3e50; color: #fff; display: flex; flex-direction: column; height: 100%; box-shadow: 2px 0 5px rgba(0,0,0,0.1); z-index: 10; }
        .sidebar-header { padding: 20px; background: #1a252f; text-align: center; border-bottom: 1px solid #34495e; }
        .sidebar-header h2 { font-size: 1.1rem; color: #ecf0f1; margin-top: 5px; }
        .sidebar-menu { flex: 1; overflow-y: auto; padding: 15px 0; }
        .sidebar-menu a { display: block; padding: 12px 20px; color: #bdc3c7; text-decoration: none; font-size: 0.95rem; transition: 0.2s; border-left: 4px solid transparent; }
        .sidebar-menu a:hover, .sidebar-menu a.active { background: #34495e; color: #fff; border-left-color: #3498db; }
        .main-container { flex: 1; display: flex; flex-direction: column; height: 100%; overflow: hidden; }
        .topbar { height: 60px; background: #fff; border-bottom: 1px solid #e0e0e0; display: flex; align-items: center; justify-content: space-between; padding: 0 30px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .topbar h1 { font-size: 1.3rem; color: #2c3e50; }
        .user-info { display: flex; align-items: center; gap: 15px; font-size: 0.9rem; font-weight: 600; color: #555; }
        .btn-logout { background: #e74c3c; color: #fff; padding: 6px 14px; border-radius: 4px; text-decoration: none; font-size: 0.85rem; transition: 0.2s; }
        .btn-logout:hover { background: #c0392b; }
        .content-body { flex: 1; overflow-y: auto; padding: 30px; background: #f8f9fa; }
        .card { background: #fff; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border: 1px solid #e1e8ed; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 25px; }
        .stat-card { background: #fff; padding: 20px; border-radius: 8px; border-left: 5px solid #3498db; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .stat-card h3 { font-size: 0.85rem; color: #7f8c8d; text-transform: uppercase; margin-bottom: 8px; }
        .stat-card p { font-size: 1.8rem; font-weight: bold; color: #2c3e50; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; background: #fff; border-radius: 6px; overflow: hidden; }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #edf2f7; font-size: 0.9rem; }
        th { background: #f1f5f9; color: #475569; font-weight: 600; }
        tr:hover { background: #f8fafc; }
        .btn { display: inline-block; padding: 8px 16px; background: #3498db; color: #fff; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; font-size: 0.85rem; transition: 0.2s; font-weight: 500; }
        .btn:hover { background: #2980b9; }
        .btn-success { background: #2ecc71; } .btn-success:hover { background: #27ae60; }
        .btn-danger { background: #e74c3c; } .btn-danger:hover { background: #c0392b; }
        .btn-warning { background: #f39c12; color: #fff; } .btn-warning:hover { background: #d68910; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 6px; font-weight: 600; font-size: 0.9rem; color: #333; }
        .form-control { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.95rem; }
        .form-control:focus { border-color: #3498db; outline: none; box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.15); }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
        .badge-success { background: #d1fae5; color: #065f46; }
        .badge-warning { background: #fef3c7; color: #92400e; }
        .badge-danger { background: #fee2e2; color: #991b1b; }
        .badge-info { background: #e0f2fe; color: #0369a1; }
        @media(max-width: 768px) { body { flex-direction: column; overflow: auto; } .sidebar { width: 100%; height: auto; } .main-container { height: auto; overflow: visible; } }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="sidebar-header">
            <h2>${barangayName}</h2>
        </div>
        <div class="sidebar-menu">
            ${userRole === 'STAFF' || userRole === 'SECRETARY' || userRole === 'ADMIN' ? `
                <a href="/staff">Dashboard</a>
                <a href="/staff/residents">Residents</a>
                <a href="/staff/approvals">Resident Approvals</a>
                <a href="/staff/households">Households</a>
                <a href="/staff/purok">Purok Management</a>
                <a href="/staff/certificates">Certificates</a>
                <a href="/staff/id-printing">Physical ID Printing</a>
                <a href="/staff/appointments">Appointments</a>
                <a href="/staff/blotter">Blotter & Complaints</a>
                <a href="/staff/assistance">Assistance Requests</a>
                <a href="/staff/businesses">Businesses</a>
                <a href="/staff/announcements">Announcements</a>
                <a href="/staff/reports">Reports</a>
                ${userRole === 'ADMIN' ? '<a href="/staff/users">User Management</a><a href="/staff/activity-logs">Activity Logs</a><a href="/staff/settings">Barangay Settings</a>' : ''}
            ` : `
                <a href="/resident">Dashboard</a>
                <a href="/resident/profile">My Profile</a>
                <a href="/resident/digital-id">My Digital ID</a>
                <a href="/resident/certificates">Certificate Requests</a>
                <a href="/resident/appointments">Appointments</a>
                <a href="/resident/complaints">Complaints / Blotter</a>
                <a href="/resident/assistance">Assistance Requests</a>
                <a href="/resident/announcements">Announcements</a>
                <a href="/resident/notifications">Notifications</a>
                <a href="/resident/settings">Account Settings</a>
            `}
        </div>
    </div>
    <div class="main-container">
        <div class="topbar">
            <h1>${title}</h1>
            <div class="user-info">
                <span>Welcome, ${req.session.user ? req.session.user.username : 'Guest'} (${userRole})</span>
                <a href="/logout" class="btn-logout">Logout</a>
            </div>
        </div>
        <div class="content-body">
            ${content}
        </div>
    </div>
</body>
</html>`;
}

// ==================== AUTH ROUTES ====================

app.get('/login', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Login - Barangay Resident Management System</title>
    <style>
        body { background: #2c3e50; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        .login-card { background: #fff; padding: 40px; border-radius: 8px; width: 100%; max-width: 400px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
        .login-card h2 { margin-bottom: 25px; color: #2c3e50; text-align: center; }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: 600; color: #333; }
        .form-control { width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem; }
        .btn-login { width: 100%; padding: 12px; background: #3498db; color: #fff; border: none; border-radius: 4px; font-size: 1rem; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .btn-login:hover { background: #2980b9; }
        .links { margin-top: 20px; text-align: center; font-size: 0.9rem; }
        .links a { color: #3498db; text-decoration: none; }
        .links a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="login-card">
        <h2>Barangay Portal Login</h2>
        <form action="/login" method="POST">
            <div class="form-group">
                <label>Username / Resident ID</label>
                <input type="text" name="username" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" name="password" class="form-control" required>
            </div>
            <button type="submit" class="btn-login">Login</button>
        </form>
        <div class="links">
            <p>New Resident? <a href="/register">Register here</a></p>
        </div>
    </div>
</body>
</html>`);
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err || !user) {
            return res.send(`<script>alert('Invalid username or password'); window.location.href='/login';</script>`);
        }
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.send(`<script>alert('Invalid username or password'); window.location.href='/login';</script>`);
        }
        req.session.user = { id: user.id, username: user.username, role: user.role, resident_id: user.resident_id };
        logActivity(user.username, 'Logged in', req.ip);

        if (user.role === 'RESIDENT') {
            res.redirect('/resident');
        } else {
            res.redirect('/staff');
        }
    });
});

app.get('/logout', (req, res) => {
    if (req.session.user) logActivity(req.session.user.username, 'Logged out', req.ip);
    req.session.destroy(() => res.redirect('/login'));
});

// ==================== PUBLIC REGISTRATION ====================

app.get('/register', (req, res) => {
    db.all(`SELECT * FROM puroks`, (err, puroks) => {
        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Resident Registration - Barangay Management System</title>
    <style>
        body { background: #f4f7f6; padding: 40px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        .register-container { max-width: 800px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        h2 { color: #2c3e50; margin-bottom: 25px; text-align: center; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 6px; font-weight: 600; font-size: 0.9rem; }
        .form-control { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.95rem; }
        .btn-submit { background: #2ecc71; color: #fff; padding: 12px 25px; border: none; border-radius: 4px; font-size: 1rem; font-weight: bold; cursor: pointer; width: 100%; }
        .btn-submit:hover { background: #27ae60; }
        .back-link { display: block; text-align: center; margin-top: 15px; color: #3498db; text-decoration: none; }
    </style>
</head>
<body>
    <div class="register-container">
        <h2>Barangay Resident Online Registration</h2>
        <form action="/register" method="POST" enctype="multipart/form-data">
            <div class="grid-2">
                <div class="form-group">
                    <label>First Name *</label>
                    <input type="text" name="first_name" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Middle Name</label>
                    <input type="text" name="middle_name" class="form-control">
                </div>
            </div>
            <div class="grid-2">
                <div class="form-group">
                    <label>Last Name *</label>
                    <input type="text" name="last_name" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Suffix (Jr., III, etc.)</label>
                    <input type="text" name="suffix" class="form-control">
                </div>
            </div>
            <div class="grid-2">
                <div class="form-group">
                    <label>Date of Birth *</label>
                    <input type="date" name="dob" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Sex *</label>
                    <select name="sex" class="form-control" required>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                    </select>
                </div>
            </div>
            <div class="grid-2">
                <div class="form-group">
                    <label>Civil Status *</label>
                    <select name="civil_status" class="form-control" required>
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Widowed">Widowed</option>
                        <option value="Separated">Separated</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Contact Number *</label>
                    <input type="text" name="contact" class="form-control" required>
                </div>
            </div>
            <div class="grid-2">
                <div class="form-group">
                    <label>Email Address *</label>
                    <input type="email" name="email" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Purok *</label>
                    <select name="purok" class="form-control" required>
                        ${puroks.map(p => `<option value="${p.name}">${p.name}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="grid-2">
                <div class="form-group">
                    <label>House Number / Street *</label>
                    <input type="text" name="house_number" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Occupation</label>
                    <input type="text" name="occupation" class="form-control">
                </div>
            </div>
            <div class="grid-2">
                <div class="form-group">
                    <label>Educational Attainment</label>
                    <select name="educational_attainment" class="form-control">
                        <option value="Elementary">Elementary</option>
                        <option value="High School">High School</option>
                        <option value="College Undergraduate">College Undergraduate</option>
                        <option value="College Graduate">College Graduate</option>
                        <option value="Vocational">Vocational</option>
                        <option value="None">None</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Nationality</label>
                    <input type="text" name="nationality" class="form-control" value="Filipino">
                </div>
            </div>
            <div class="grid-2">
                <div class="form-group">
                    <label>Registered Voter?</label>
                    <select name="voter_status" class="form-control">
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Senior Citizen?</label>
                    <select name="senior_status" class="form-control">
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                    </select>
                </div>
            </div>
            <div class="grid-2">
                <div class="form-group">
                    <label>PWD Status?</label>
                    <select name="pwd_status" class="form-control">
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Solo Parent?</label>
                    <select name="solo_parent_status" class="form-control">
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>4Ps Beneficiary?</label>
                <select name="four_ps_status" class="form-control">
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                </select>
            </div>
            <div class="form-group">
                <label>Resident Photo *</label>
                <input type="file" name="photo" class="form-control" accept="image/*" required>
            </div>
            <button type="submit" class="btn-submit">Submit Registration Application</button>
        </form>
        <a href="/login" class="back-link">Already have an account? Login here</a>
    </div>
</body>
</html>`);
    });
});

app.post('/register', upload.single('photo'), (req, res) => {
    const { first_name, middle_name, last_name, suffix, dob, sex, civil_status, contact, email, purok, house_number, occupation, educational_attainment, nationality, voter_status, senior_status, pwd_status, solo_parent_status, four_ps_status } = req.body;
    const tempId = 'TEMP-' + Math.floor(100000 + Math.random() * 900000);
    const fullName = `${first_name} ${middle_name ? middle_name + ' ' : ''}${last_name}${suffix ? ' ' + suffix : ''}`;
    const photo = req.file ? `/uploads/${req.file.filename}` : '';
    const dateRegistered = new Date().toISOString().split('T')[0];
    
    // Calculate Age
    const birthDate = new Date(dob);
    const ageDifMs = Date.now() - birthDate.getTime();
    const ageDate = new Date(ageDifMs);
    const age = Math.abs(ageDate.getUTCFullYear() - 1970);

    db.run(`INSERT INTO residents (id, first_name, middle_name, last_name, suffix, full_name, dob, age, sex, civil_status, contact, email, address, purok, house_number, occupation, educational_attainment, nationality, voter_status, senior_status, pwd_status, solo_parent_status, four_ps_status, photo, date_registered, registration_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        [tempId, first_name, middle_name || '', last_name, suffix || '', fullName, dob, age, sex, civil_status, contact, email, `${house_number}, ${purok}`, purok, house_number, occupation || '', educational_attainment || '', nationality || 'Filipino', voter_status || 'No', senior_status || 'No', pwd_status || 'No', solo_parent_status || 'No', four_ps_status || 'No', photo, dateRegistered], (err) => {
            if (err) {
                return res.send(`<script>alert('Registration failed. Please check inputs.'); window.location.href='/register';</script>`);
            }
            res.send(`<script>alert('Registration submitted successfully! Please wait for staff approval.'); window.location.href='/login';</script>');`);
        });
});

// ==================== PUBLIC QR VERIFICATION ====================

app.get('/verify/resident/:residentId', (req, res) => {
    const { residentId } = req.params;
    db.get(`SELECT * FROM residents WHERE id = ?`, [residentId], (err, resident) => {
        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Resident ID Verification</title>
    <style>
        body { background: #e2e8f0; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        .verify-card { background: #fff; padding: 40px; border-radius: 12px; width: 100%; max-width: 450px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .status-badge { font-size: 1.2rem; font-weight: bold; padding: 10px 20px; border-radius: 30px; display: inline-block; margin-bottom: 20px; }
        .valid { background: #d1fae5; color: #065f46; }
        .invalid { background: #fee2e2; color: #991b1b; }
        .details { text-align: left; margin-top: 20px; border-top: 1px solid #cbd5e1; padding-top: 20px; }
        .details p { margin-bottom: 10px; font-size: 0.95rem; }
        .photo { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; margin-bottom: 15px; border: 3px solid #3498db; }
    </style>
</head>
<body>
    <div class="verify-card">
        <h2>Barangay Resident ID Verification</h2>
        <hr style="margin: 15px 0; border:0; border-top:1px solid #cbd5e1;">
        ${resident && resident.registration_status === 'APPROVED' && resident.active_status === 'ACTIVE' ? `
            <div class="status-badge valid">✓ VALID RESIDENT ID</div>
            ${resident.photo ? `<img src="${resident.photo}" class="photo">` : ''}
            <div class="details">
                <p><strong>Resident ID:</strong> ${resident.id}</p>
                <p><strong>Full Name:</strong> ${resident.full_name}</p>
                <p><strong>Address:</strong> ${resident.address}</p>
                <p><strong>Purok:</strong> ${resident.purok}</p>
                <p><strong>Status:</strong> Active & Official</p>
            </div>
        ` : `
            <div class="status-badge invalid">✗ INVALID OR INACTIVE ID</div>
            <p>This resident ID is either not found, pending approval, or archived.</p>
        `}
    </div>
</body>
</html>`);
    });
});

// ==================== STAFF PORTAL ROUTES ====================

app.get('/staff', requireStaff, (req, res) => {
    db.serialize(() => {
        db.get(`SELECT 
            (SELECT COUNT(*) FROM residents WHERE registration_status='APPROVED' AND active_status='ACTIVE') as approved_residents,
            (SELECT COUNT(*) FROM residents WHERE registration_status='PENDING') as pending_residents,
            (SELECT COUNT(*) FROM residents WHERE registration_status='REJECTED') as rejected_residents,
            (SELECT COUNT(*) FROM households) as total_households,
            (SELECT COUNT(*) FROM residents WHERE sex='Male' AND registration_status='APPROVED') as male_residents,
            (SELECT COUNT(*) FROM residents WHERE sex='Female' AND registration_status='APPROVED') as female_residents,
            (SELECT COUNT(*) FROM residents WHERE senior_status='Yes' AND registration_status='APPROVED') as senior_citizens,
            (SELECT COUNT(*) FROM residents WHERE pwd_status='Yes' AND registration_status='APPROVED') as pwd_residents,
            (SELECT COUNT(*) FROM residents WHERE solo_parent_status='Yes' AND registration_status='APPROVED') as solo_parents,
            (SELECT COUNT(*) FROM residents WHERE voter_status='Yes' AND registration_status='APPROVED') as registered_voters,
            (SELECT COUNT(*) FROM residents WHERE age < 18 AND registration_status='APPROVED') as minors,
            (SELECT COUNT(*) FROM certificates WHERE status='PENDING') as pending_certificates,
            (SELECT COUNT(*) FROM appointments WHERE status='PENDING') as pending_appointments,
            (SELECT COUNT(*) FROM complaints WHERE status='SUBMITTED') as pending_complaints
        `, (err, stats) => {
            db.all(`SELECT * FROM activity_logs ORDER BY id DESC LIMIT 10`, (err, logs) => {
                const content = `
                    <h2>Staff Dashboard</h2>
                    <p style="margin-bottom: 20px; color: #64748b;">Live overview of barangay statistics and records.</p>
                    <div class="stats-grid">
                        <div class="stat-card"><h3>Approved Residents</h3><p>${stats.approved_residents || 0}</p></div>
                        <div class="stat-card" style="border-left-color: #f39c12;"><h3>Pending Applications</h3><p>${stats.pending_residents || 0}</p></div>
                        <div class="stat-card" style="border-left-color: #2ecc71;"><h3>Total Households</h3><p>${stats.total_households || 0}</p></div>
                        <div class="stat-card" style="border-left-color: #9b59b6;"><h3>Senior Citizens</h3><p>${stats.senior_citizens || 0}</p></div>
                        <div class="stat-card" style="border-left-color: #e74c3c;"><h3>PWD Residents</h3><p>${stats.pwd_residents || 0}</p></div>
                        <div class="stat-card" style="border-left-color: #e67e22;"><h3>Solo Parents</h3><p>${stats.solo_parents || 0}</p></div>
                        <div class="stat-card" style="border-left-color: #1abc9c;"><h3>Registered Voters</h3><p>${stats.registered_voters || 0}</p></div>
                        <div class="stat-card" style="border-left-color: #34495e;"><h3>Pending Certificates</h3><p>${stats.pending_certificates || 0}</p></div>
                    </div>
                    <div class="card">
                        <h3>Recent Activity Logs</h3>
                        <table>
                            <tr><th>User</th><th>Action</th><th>Date</th><th>Time</th><th>IP</th></tr>
                            ${logs.map(l => `<tr><td>${l.username}</td><td>${l.action}</td><td>${l.date}</td><td>${l.time}</td><td>${l.ip}</td></tr>`).join('')}
                        </table>
                    </div>
                `;
                res.send(renderLayout('Staff Dashboard', content, req.session.user.role, req));
            });
        });
    });
});

// Resident Management
app.get('/staff/residents', requireStaff, (req, res) => {
    const { search, purok, sex, civil_status, voter, senior, pwd } = req.query;
    let query = `SELECT * FROM residents WHERE registration_status = 'APPROVED' AND active_status = 'ACTIVE'`;
    let params = [];

    if (search) {
        query += ` AND (full_name LIKE ? OR id LIKE ? OR contact LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (purok) { query += ` AND purok = ?`; params.push(purok); }
    if (sex) { query += ` AND sex = ?`; params.push(sex); }
    if (civil_status) { query += ` AND civil_status = ?`; params.push(civil_status); }
    if (voter) { query += ` AND voter_status = ?`; params.push(voter); }
    if (senior) { query += ` AND senior_status = ?`; params.push(senior); }
    if (pwd) { query += ` AND pwd_status = ?`; params.push(pwd); }

    db.all(query, params, (err, residents) => {
        db.all(`SELECT * FROM puroks`, (err, puroks) => {
            const content = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2>Resident Management</h2>
                    <a href="/staff/residents/add" class="btn btn-success">+ Add Resident</a>
                </div>
                <div class="card" style="padding: 15px;">
                    <form method="GET" action="/staff/residents" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
                        <input type="text" name="search" placeholder="Search name/ID..." value="${search || ''}" class="form-control">
                        <select name="purok" class="form-control">
                            <option value="">All Puroks</option>
                            ${puroks.map(p => `<option value="${p.name}" ${purok === p.name ? 'selected' : ''}>${p.name}</option>`).join('')}
                        </select>
                        <select name="sex" class="form-control">
                            <option value="">All Sex</option>
                            <option value="Male" ${sex === 'Male' ? 'selected' : ''}>Male</option>
                            <option value="Female" ${sex === 'Female' ? 'selected' : ''}>Female</option>
                        </select>
                        <select name="senior" class="form-control">
                            <option value="">Senior Citizen?</option>
                            <option value="Yes" ${senior === 'Yes' ? 'selected' : ''}>Yes</option>
                            <option value="No" ${senior === 'No' ? 'selected' : ''}>No</option>
                        </select>
                        <button type="submit" class="btn">Filter</button>
                        <a href="/staff/residents" class="btn btn-warning" style="text-align: center; line-height: 20px;">Reset</a>
                    </form>
                </div>
                <div class="card">
                    <table>
                        <tr><th>ID</th><th>Photo</th><th>Full Name</th><th>Age</th><th>Sex</th><th>Purok</th><th>Contact</th><th>Actions</th></tr>
                        ${residents.map(r => `
                            <tr>
                                <td>${r.id}</td>
                                <td><img src="${r.photo || '/default.png'}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;"></td>
                                <td>${r.full_name}</td>
                                <td>${r.age}</td>
                                <td>${r.sex}</td>
                                <td>${r.purok}</td>
                                <td>${r.contact}</td>
                                <td>
                                    <a href="/staff/residents/${r.id}" class="btn" style="padding: 4px 8px; font-size: 0.75rem;">View</a>
                                    <a href="/staff/residents/${r.id}/edit" class="btn btn-warning" style="padding: 4px 8px; font-size: 0.75rem;">Edit</a>
                                </td>
                            </tr>
                        `).join('')}
                    </table>
                </div>
            `;
            res.send(renderLayout('Resident Management', content, req.session.user.role, req));
        });
    });
});

app.get('/staff/residents/add', requireStaff, (req, res) => {
    db.all(`SELECT * FROM puroks`, (err, puroks) => {
        const content = `
            <h2>Add New Resident</h2>
            <div class="card">
                <form action="/staff/residents/add" method="POST" enctype="multipart/form-data">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group"><label>First Name *</label><input type="text" name="first_name" class="form-control" required></div>
                        <div class="form-group"><label>Middle Name</label><input type="text" name="middle_name" class="form-control"></div>
                        <div class="form-group"><label>Last Name *</label><input type="text" name="last_name" class="form-control" required></div>
                        <div class="form-group"><label>Suffix</label><input type="text" name="suffix" class="form-control"></div>
                        <div class="form-group"><label>Date of Birth *</label><input type="date" name="dob" class="form-control" required></div>
                        <div class="form-group"><label>Sex *</label><select name="sex" class="form-control"><option value="Male">Male</option><option value="Female">Female</option></select></div>
                        <div class="form-group"><label>Civil Status</label><select name="civil_status" class="form-control"><option value="Single">Single</option><option value="Married">Married</option><option value="Widowed">Widowed</option><option value="Separated">Separated</option></select></div>
                        <div class="form-group"><label>Contact Number *</label><input type="text" name="contact" class="form-control" required></div>
                        <div class="form-group"><label>Email *</label><input type="email" name="email" class="form-control" required></div>
                        <div class="form-group"><label>Purok *</label><select name="purok" class="form-control">${puroks.map(p => `<option value="${p.name}">${p.name}</option>`).join('')}</select></div>
                        <div class="form-group"><label>House Number *</label><input type="text" name="house_number" class="form-control" required></div>
                        <div class="form-group"><label>Photo *</label><input type="file" name="photo" class="form-control" required></div>
                    </div>
                    <button type="submit" class="btn btn-success" style="margin-top: 15px;">Save Resident</button>
                </form>
            </div>
        `;
        res.send(renderLayout('Add Resident', content, req.session.user.role, req));
    });
});

app.post('/staff/residents/add', requireStaff, upload.single('photo'), (req, res) => {
    const { first_name, middle_name, last_name, suffix, dob, sex, civil_status, contact, email, purok, house_number } = req.body;
    db.get(`SELECT COUNT(*) as cnt FROM residents`, (err, row) => {
        const idNum = (row ? row.cnt : 0) + 1;
        const residentId = `BRGY-${String(idNum).padStart(6, '0')}`;
        const fullName = `${first_name} ${middle_name ? middle_name + ' ' : ''}${last_name}${suffix ? ' ' + suffix : ''}`;
        const photo = req.file ? `/uploads/${req.file.filename}` : '';
        const birthDate = new Date(dob);
        const age = Math.abs(new Date(Date.now() - birthDate.getTime()).getUTCFullYear() - 1970);
        const dateRegistered = new Date().toISOString().split('T')[0];

        db.run(`INSERT INTO residents (id, first_name, middle_name, last_name, suffix, full_name, dob, age, sex, civil_status, contact, email, address, purok, house_number, photo, date_registered, registration_status, active_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', 'ACTIVE')`,
            [residentId, first_name, middle_name || '', last_name, suffix || '', fullName, dob, age, sex, civil_status, contact, email, `${house_number}, ${purok}`, purok, house_number, photo, dateRegistered], async (err) => {
                if (err) return res.send(`<script>alert('Error adding resident.'); window.location.href='/staff/residents';</script>`);
                
                // Create user account for resident
                const hash = await bcrypt.hash('resident123', 10);
                db.run(`INSERT INTO users (username, password_hash, role, resident_id) VALUES (?, ?, 'RESIDENT', ?)`, [residentId, hash, residentId]);
                logActivity(req.session.user.username, `Added resident ${residentId}`, req.ip);
                res.redirect('/staff/residents');
            });
    });
});

// Resident Approvals Management
app.get('/staff/approvals', requireStaff, (req, res) => {
    db.all(`SELECT * FROM residents WHERE registration_status != 'APPROVED'`, (err, pending) => {
        const content = `
            <h2>Resident Approval Management</h2>
            <div class="card">
                <table>
                    <tr><th>Temp ID / Name</th><th>DOB</th><th>Sex</th><th>Purok</th><th>Contact</th><th>Actions</th></tr>
                    ${pending.map(r => `
                        <tr>
                            <td><strong>${r.full_name}</strong><br><small>${r.id}</small></td>
                            <td>${r.dob}</td>
                            <td>${r.sex}</td>
                            <td>${r.purok}</td>
                            <td>${r.contact}</td>
                            <td>
                                <form action="/staff/approvals/${r.id}/approve" method="POST" style="display:inline;"><button type="submit" class="btn btn-success" style="padding:4px 8px; font-size:0.75rem;">Approve</button></form>
                                <form action="/staff/approvals/${r.id}/reject" method="POST" style="display:inline; margin-left:5px;">
                                    <input type="hidden" name="reason" value="Does not meet barangay criteria">
                                    <button type="submit" class="btn btn-danger" style="padding:4px 8px; font-size:0.75rem;">Reject</button>
                                </form>
                            </td>
                        </tr>
                    `).join('')}
                </table>
            </div>
        `;
        res.send(renderLayout('Resident Approvals', content, req.session.user.role, req));
    });
});

app.post('/staff/approvals/:id/approve', requireStaff, (req, res) => {
    const tempId = req.params.id;
    db.get(`SELECT COUNT(*) as cnt FROM residents WHERE registration_status='APPROVED'`, (err, row) => {
        const idNum = (row ? row.cnt : 0) + 1;
        const newResidentId = `BRGY-${String(idNum).padStart(6, '0')}`;
        const approvalDate = new Date().toISOString().split('T')[0];

        db.run(`UPDATE residents SET id = ?, registration_status = 'APPROVED', approval_date = ?, approved_by = ? WHERE id = ?`,
            [newResidentId, approvalDate, req.session.user.username, tempId], async (err) => {
                if (err) return res.send(`<script>alert('Approval failed'); window.location.href='/staff/approvals';</script>`);
                
                // Create user account
                const hash = await bcrypt.hash('resident123', 10);
                db.run(`INSERT INTO users (username, password_hash, role, resident_id) VALUES (?, ?, 'RESIDENT', ?)`, [newResidentId, hash, newResidentId]);
                logActivity(req.session.user.username, `Approved resident application ${newResidentId}`, req.ip);
                res.redirect('/staff/approvals');
            });
    });
});

app.post('/staff/approvals/:id/reject', requireStaff, (req, res) => {
    const { reason } = req.body;
    db.run(`UPDATE residents SET registration_status = 'REJECTED', rejection_reason = ? WHERE id = ?`, [reason, req.params.id], (err) => {
        logActivity(req.session.user.username, `Rejected resident application ${req.params.id}`, req.ip);
        res.redirect('/staff/approvals');
    });
});

// Household Management
app.get('/staff/households', requireStaff, (req, res) => {
    db.all(`SELECT h.*, r.full_name as head_name FROM households h LEFT JOIN residents r ON h.household_head_id = r.id`, (err, households) => {
        db.all(`SELECT * FROM residents WHERE registration_status='APPROVED' AND active_status='ACTIVE'`, (err, residents) => {
            db.all(`SELECT * FROM puroks`, (err, puroks) => {
                const content = `
                    <h2>Household Management</h2>
                    <div class="card">
                        <h3>Add Household</h3>
                        <form action="/staff/households" method="POST" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:10px; margin-top:10px;">
                            <input type="text" name="household_number" placeholder="Household Number" class="form-control" required>
                            <select name="household_head_id" class="form-control" required>
                                <option value="">Select Household Head</option>
                                ${residents.map(r => `<option value="${r.id}">${r.full_name}</option>`).join('')}
                            </select>
                            <select name="purok" class="form-control" required>
                                <option value="">Select Purok</option>
                                ${puroks.map(p => `<option value="${p.name}">${p.name}</option>`).join('')}
                            </select>
                            <input type="text" name="address" placeholder="Address" class="form-control" required>
                            <button type="submit" class="btn btn-success">Add Household</button>
                        </form>
                    </div>
                    <div class="card">
                        <table>
                            <tr><th>Household #</th><th>Head</th><th>Purok</th><th>Address</th></tr>
                            ${households.map(h => `<tr><td>${h.household_number}</td><td>${h.head_name || 'N/A'}</td><td>${h.purok}</td><td>${h.address}</td></tr>`).join('')}
                        </table>
                    </div>
                `;
                res.send(renderLayout('Household Management', content, req.session.user.role, req));
            });
        });
    });
});

app.post('/staff/households', requireStaff, (req, res) => {
    const { household_number, household_head_id, address, purok } = req.body;
    db.run(`INSERT INTO households (household_number, household_head_id, address, purok) VALUES (?, ?, ?, ?)`,
        [household_number, household_head_id, address, purok], (err) => {
            logActivity(req.session.user.username, `Added household ${household_number}`, req.ip);
            res.redirect('/staff/households');
        });
});

// Purok Management
app.get('/staff/purok', requireStaff, (req, res) => {
    db.all(`SELECT * FROM puroks`, (err, puroks) => {
        const content = `
            <h2>Purok Management</h2>
            <div class="card">
                <h3>Add Purok</h3>
                <form action="/staff/purok" method="POST" style="display:flex; gap:10px; margin-top:10px;">
                    <input type="text" name="name" placeholder="Purok Name (e.g. Purok 1)" class="form-control" required>
                    <input type="text" name="description" placeholder="Description" class="form-control">
                    <button type="submit" class="btn btn-success">Add Purok</button>
                </form>
            </div>
            <div class="card">
                <table>
                    <tr><th>Purok Name</th><th>Description</th></tr>
                    ${puroks.map(p => `<tr><td>${p.name}</td><td>${p.description}</td></tr>`).join('')}
                </table>
            </div>
        `;
        res.send(renderLayout('Purok Management', content, req.session.user.role, req));
    });
});

app.post('/staff/purok', requireStaff, (req, res) => {
    const { name, description } = req.body;
    db.run(`INSERT INTO puroks (name, description) VALUES (?, ?)`, [name, description], () => {
        logActivity(req.session.user.username, `Added purok ${name}`, req.ip);
        res.redirect('/staff/purok');
    });
});

// Certificate Management
app.get('/staff/certificates', requireStaff, (req, res) => {
    db.all(`SELECT c.*, r.full_name FROM certificates c JOIN residents r ON c.resident_id = r.id`, (err, certs) => {
        const content = `
            <h2>Certificate Requests Management</h2>
            <div class="card">
                <table>
                    <tr><th>ID</th><th>Resident</th><th>Type</th><th>Purpose</th><th>Status</th><th>File / Action</th></tr>
                    ${certs.map(c => `
                        <tr>
                            <td>${c.id}</td>
                            <td>${c.full_name}</td>
                            <td>${c.certificate_type}</td>
                            <td>${c.purpose}</td>
                            <td><span class="badge badge-info">${c.status}</span></td>
                            <td>
                                ${c.certificate_file ? `<a href="${c.certificate_file}" target="_blank" class="btn" style="padding:4px 8px; font-size:0.75rem;">Download File</a>` : ''}
                                <form action="/staff/certificates/${c.id}/update" method="POST" enctype="multipart/form-data" style="margin-top:5px; display:flex; gap:5px;">
                                    <select name="status" class="form-control" style="font-size:0.75rem; padding:4px;">
                                        <option value="PENDING" ${c.status === 'PENDING' ? 'selected' : ''}>PENDING</option>
                                        <option value="APPROVED" ${c.status === 'APPROVED' ? 'selected' : ''}>APPROVED</option>
                                        <option value="READY FOR RELEASE" ${c.status === 'READY FOR RELEASE' ? 'selected' : ''}>READY</option>
                                        <option value="RELEASED" ${c.status === 'RELEASED' ? 'selected' : ''}>RELEASED</option>
                                        <option value="REJECTED" ${c.status === 'REJECTED' ? 'selected' : ''}>REJECTED</option>
                                    </select>
                                    <input type="file" name="certificate_file" class="form-control" style="font-size:0.75rem; padding:2px;">
                                    <button type="submit" class="btn btn-success" style="padding:4px 8px; font-size:0.75rem;">Update</button>
                                </form>
                            </td>
                        </tr>
                    `).join('')}
                </table>
            </div>
        `;
        res.send(renderLayout('Certificate Management', content, req.session.user.role, req));
    });
});

app.post('/staff/certificates/:id/update', requireStaff, upload.single('certificate_file'), (req, res) => {
    const { status } = req.body;
    const file = req.file ? `/uploads/${req.file.filename}` : null;
    const processedDate = new Date().toISOString().split('T')[0];

    if (file) {
        db.run(`UPDATE certificates SET status = ?, certificate_file = ?, processed_date = ?, processed_by = ? WHERE id = ?`,
            [status, file, processedDate, req.session.user.username, req.params.id], () => {
                logActivity(req.session.user.username, `Updated certificate #${req.params.id} to ${status}`, req.ip);
                res.redirect('/staff/certificates');
            });
    } else {
        db.run(`UPDATE certificates SET status = ?, processed_date = ?, processed_by = ? WHERE id = ?`,
            [status, processedDate, req.session.user.username, req.params.id], () => {
                logActivity(req.session.user.username, `Updated certificate #${req.params.id} to ${status}`, req.ip);
                res.redirect('/staff/certificates');
            });
    }
});

// Physical ID Printing System (8 IDs per bond paper)
app.get('/staff/id-printing', requireStaff, (req, res) => {
    db.all(`SELECT * FROM residents WHERE registration_status='APPROVED' AND active_status='ACTIVE'`, async (err, residents) => {
        const content = `
            <h2>Physical ID Card Printing (8 IDs per Bond Paper)</h2>
            <div class="card">
                <button onclick="window.print()" class="btn btn-success" style="margin-bottom: 20px;">Print ID Layout</button>
                <div class="id-sheet">
                    ${residents.map(r => `
                        <div class="id-card-print">
                            <div class="id-header">
                                <h3>${res.locals.settings.barangay_name}</h3>
                                <small>${res.locals.settings.municipality},${res.locals.settings.province}</small>
                            </div>
                            <div class="id-body">
                                <img src="${r.photo || '/default.png'}" class="id-photo">
                                <div class="id-details">
                                    <p><strong>ID:</strong> ${r.id}</p>
                                    <p><strong>Name:</strong> ${r.full_name}</p>
                                    <p><strong>DOB:</strong> ${r.dob}</p>
                                    <p><strong>Address:</strong> ${r.address}</p>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <style>
                .id-sheet { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
                .id-card-print { width: 85.60mm; height: 53.98mm; border: 1px dashed #999; padding: 8px; background: #fff; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; page-break-inside: avoid; }
                .id-header { text-align: center; border-bottom: 1px solid #333; padding-bottom: 4px; }
                .id-header h3 { font-size: 0.8rem; margin: 0; }
                .id-header small { font-size: 0.6rem; }
                .id-body { display: flex; gap: 10px; align-items: center; }
                .id-photo { width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 1px solid #333; }
                .id-details p { font-size: 0.65rem; margin: 2px 0; }
                @media print {
                    body * { visibility: hidden; }
                    .id-sheet, .id-sheet * { visibility: visible; }
                    .id-sheet { position: absolute; left: 0; top: 0; width: 100%; }
                }
            </style>
        `;
        res.send(renderLayout('ID Printing', content, req.session.user.role, req));
    });
});

// Appointments Management
app.get('/staff/appointments', requireStaff, (req, res) => {
    db.all(`SELECT a.*, r.full_name FROM appointments a JOIN residents r ON a.resident_id = r.id`, (err, appts) => {
        const content = `
            <h2>Appointment Management</h2>
            <div class="card">
                <table>
                    <tr><th>Resident</th><th>Service</th><th>Date & Time</th><th>Purpose</th><th>Status</th><th>Action</th></tr>
                    ${appts.map(a => `
                        <tr>
                            <td>${a.full_name}</td>
                            <td>${a.service}</td>
                            <td>${a.date}${a.time}</td>
                            <td>${a.purpose}</td>
                            <td><span class="badge badge-info">${a.status}</span></td>
                            <td>
                                <form action="/staff/appointments/${a.id}/status" method="POST" style="display:flex; gap:5px;">
                                    <select name="status" class="form-control" style="font-size:0.75rem; padding:4px;">
                                        <option value="APPROVED" ${a.status === 'APPROVED' ? 'selected' : ''}>APPROVED</option>
                                        <option value="COMPLETED" ${a.status === 'COMPLETED' ? 'selected' : ''}>COMPLETED</option>
                                        <option value="REJECTED" ${a.status === 'REJECTED' ? 'selected' : ''}>REJECTED</option>
                                    </select>
                                    <button type="submit" class="btn" style="padding:4px 8px; font-size:0.75rem;">Update</button>
                                </form>
                            </td>
                        </tr>
                    `).join('')}
                </table>
            </div>
        `;
        res.send(renderLayout('Appointments', content, req.session.user.role, req));
    });
});

app.post('/staff/appointments/:id/status', requireStaff, (req, res) => {
    db.run(`UPDATE appointments SET status = ? WHERE id = ?`, [req.body.status, req.params.id], () => {
        res.redirect('/staff/appointments');
    });
});

// Blotter / Complaints Management
app.get('/staff/blotter', requireStaff, (req, res) => {
    db.all(`SELECT c.*, r.full_name FROM complaints c JOIN residents r ON c.resident_id = r.id`, (err, complaints) => {
        const content = `
            <h2>Blotter & Complaints Management</h2>
            <div class="card">
                <table>
                    <tr><th>Complainant</th><th>Type</th><th>Date / Location</th><th>Description</th><th>Status</th><th>Action</th></tr>
                    ${complaints.map(c => `
                        <tr>
                            <td>${c.full_name}</td>
                            <td>${c.complaint_type}</td>
                            <td>${c.date}<br><small>${c.location}</small></td>
                            <td>${c.description}</td>
                            <td><span class="badge badge-warning">${c.status}</span></td>
                            <td>
                                <form action="/staff/blotter/${c.id}/status" method="POST" style="display:flex; gap:5px;">
                                    <select name="status" class="form-control" style="font-size:0.75rem; padding:4px;">
                                        <option value="UNDER_REVIEW" ${c.status === 'UNDER_REVIEW' ? 'selected' : ''}>UNDER REVIEW</option>
                                        <option value="INVESTIGATION" ${c.status === 'INVESTIGATION' ? 'selected' : ''}>INVESTIGATION</option>
                                        <option value="RESOLVED" ${c.status === 'RESOLVED' ? 'selected' : ''}>RESOLVED</option>
                                        <option value="CLOSED" ${c.status === 'CLOSED' ? 'selected' : ''}>CLOSED</option>
                                    </select>
                                    <button type="submit" class="btn" style="padding:4px 8px; font-size:0.75rem;">Update</button>
                                </form>
                            </td>
                        </tr>
                    `).join('')}
                </table>
            </div>
        `;
        res.send(renderLayout('Blotter & Complaints', content, req.session.user.role, req));
    });
});

app.post('/staff/blotter/:id/status', requireStaff, (req, res) => {
    db.run(`UPDATE complaints SET status = ? WHERE id = ?`, [req.body.status, req.params.id], () => {
        res.redirect('/staff/blotter');
    });
});

// Assistance Requests Management
app.get('/staff/assistance', requireStaff, (req, res) => {
    db.all(`SELECT a.*, r.full_name FROM assistance a JOIN residents r ON a.resident_id = r.id`, (err, list) => {
        const content = `
            <h2>Assistance Requests Management</h2>
            <div class="card">
                <table>
                    <tr><th>Resident</th><th>Type</th><th>Details</th><th>Status</th><th>Action</th></tr>
                    ${list.map(a => `
                        <tr>
                            <td>${a.full_name}</td>
                            <td>${a.assistance_type}</td>
                            <td>${a.amount_or_details}</td>
                            <td><span class="badge badge-info">${a.status}</span></td>
                            <td>
                                <form action="/staff/assistance/${a.id}/status" method="POST" style="display:flex; gap:5px;">
                                    <select name="status" class="form-control" style="font-size:0.75rem; padding:4px;">
                                        <option value="APPROVED" ${a.status === 'APPROVED' ? 'selected' : ''}>APPROVED</option>
                                        <option value="RELEASED" ${a.status === 'RELEASED' ? 'selected' : ''}>RELEASED</option>
                                        <option value="REJECTED" ${a.status === 'REJECTED' ? 'selected' : ''}>REJECTED</option>
                                    </select>
                                    <button type="submit" class="btn" style="padding:4px 8px; font-size:0.75rem;">Update</button>
                                </form>
                            </td>
                        </tr>
                    `).join('')}
                </table>
            </div>
        `;
        res.send(renderLayout('Assistance Requests', content, req.session.user.role, req));
    });
});

app.post('/staff/assistance/:id/status', requireStaff, (req, res) => {
    db.run(`UPDATE assistance SET status = ? WHERE id = ?`, [req.body.status, req.params.id], () => {
        res.redirect('/staff/assistance');
    });
});

// Business Management
app.get('/staff/businesses', requireStaff, (req, res) => {
    db.all(`SELECT * FROM businesses`, (err, businesses) => {
        const content = `
            <h2>Business Permit Management</h2>
            <div class="card">
                <h3>Register Business</h3>
                <form action="/staff/businesses" method="POST" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:10px; margin-top:10px;">
                    <input type="text" name="business_name" placeholder="Business Name" class="form-control" required>
                    <input type="text" name="owner_name" placeholder="Owner Name" class="form-control" required>
                    <input type="text" name="address" placeholder="Address" class="form-control" required>
                    <input type="text" name="business_type" placeholder="Business Type" class="form-control" required>
                    <input type="text" name="contact" placeholder="Contact" class="form-control" required>
                    <input type="text" name="permit_number" placeholder="Permit Number" class="form-control" required>
                    <input type="date" name="expiration_date" class="form-control" required>
                    <button type="submit" class="btn btn-success">Add Business</button>
                </form>
            </div>
            <div class="card">
                <table>
                    <tr><th>Business Name</th><th>Owner</th><th>Type</th><th>Permit #</th><th>Status</th><th>Expires</th></tr>
                    ${businesses.map(b => `<tr><td>${b.business_name}</td><td>${b.owner_name}</td><td>${b.business_type}</td><td>${b.permit_number}</td><td>${b.permit_status}</td><td>${b.expiration_date}</td></tr>`).join('')}
                </table>
            </div>
        `;
        res.send(renderLayout('Businesses', content, req.session.user.role, req));
    });
});

app.post('/staff/businesses', requireStaff, (req, res) => {
    const { business_name, owner_name, address, business_type, contact, permit_number, expiration_date } = req.body;
    db.run(`INSERT INTO businesses (business_name, owner_name, address, business_type, contact, permit_number, expiration_date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [business_name, owner_name, address, business_type, contact, permit_number, expiration_date], () => {
            res.redirect('/staff/businesses');
        });
});

// Announcements
app.get('/staff/announcements', requireStaff, (req, res) => {
    db.all(`SELECT * FROM announcements`, (err, list) => {
        const content = `
            <h2>Announcements Management</h2>
            <div class="card">
                <h3>Post Announcement</h3>
                <form action="/staff/announcements" method="POST" style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
                    <input type="text" name="title" placeholder="Title" class="form-control" required>
                    <input type="text" name="category" placeholder="Category (e.g. Event, Emergency)" class="form-control" required>
                    <textarea name="content" placeholder="Announcement content..." class="form-control" rows="4" required></textarea>
                    <button type="submit" class="btn btn-success">Post Announcement</button>
                </form>
            </div>
            <div class="card">
                <table>
                    <tr><th>Title</th><th>Category</th><th>Content</th><th>Date</th></tr>
                    ${list.map(a => `<tr><td>${a.title}</td><td>${a.category}</td><td>${a.content}</td><td>${a.date_posted}</td></tr>`).join('')}
                </table>
            </div>
        `;
        res.send(renderLayout('Announcements', content, req.session.user.role, req));
    });
});

app.post('/staff/announcements', requireStaff, (req, res) => {
    const { title, category, content } = req.body;
    db.run(`INSERT INTO announcements (title, category, content, posted_by) VALUES (?, ?, ?, ?)`,
        [title, category, content, req.session.user.username], () => {
            res.redirect('/staff/announcements');
        });
});

// Reports
app.get('/staff/reports', requireStaff, (req, res) => {
    db.serialize(() => {
        db.get(`SELECT COUNT(*) as total FROM residents WHERE registration_status='APPROVED'`, (err, r) => {
            db.get(`SELECT COUNT(*) as total FROM households`, (err, h) => {
                db.get(`SELECT COUNT(*) as total FROM businesses`, (err, b) => {
                    const content = `
                        <h2>Database Reports</h2>
                        <div class="card">
                            <button onclick="window.print()" class="btn btn-success" style="margin-bottom:20px;">Print Report Summary</button>
                            <h3>Barangay Summary Report</h3>
                            <table>
                                <tr><th>Metric</th><th>Total Count</th></tr>
                                <tr><td>Total Approved Residents</td><td>${r ? r.total : 0}</td></tr>
                                <tr><td>Total Households</td><td>${h ? h.total : 0}</td></tr>
                                <tr><td>Total Registered Businesses</td><td>${b ? b.total : 0}</td></tr>
                            </table>
                        </div>
                    `;
                    res.send(renderLayout('Reports', content, req.session.user.role, req));
                });
            });
        });
    });
});

// User Management (Admin only)
app.get('/staff/users', requireAdmin, (req, res) => {
    db.all(`SELECT * FROM users`, (err, users) => {
        const content = `
            <h2>User Management</h2>
            <div class="card">
                <table>
                    <tr><th>Username</th><th>Role</th><th>Resident ID</th><th>Created</th></tr>
                    ${users.map(u => `<tr><td>${u.username}</td><td><span class="badge badge-info">${u.role}</span></td><td>${u.resident_id \vert{}\vert{} 'N/A'}</td><td>${u.created_at}</td></tr>`).join('')}
                </table>
            </div>
        `;
        res.send(renderLayout('User Management', content, req.session.user.role, req));
    });
});

// Activity Logs
app.get('/staff/activity-logs', requireAdmin, (req, res) => {
    db.all(`SELECT * FROM activity_logs ORDER BY id DESC`, (err, logs) => {
        const content = `
            <h2>System Activity Logs</h2>
            <div class="card">
                <table>
                    <tr><th>User</th><th>Action</th><th>Date</th><th>Time</th><th>IP</th></tr>
                    ${logs.map(l => `<tr><td>${l.username}</td><td>${l.action}</td><td>${l.date}</td><td>${l.time}</td><td>${l.ip}</td></tr>`).join('')}
                </table>
            </div>
        `;
        res.send(renderLayout('Activity Logs', content, req.session.user.role, req));
    });
});

// Barangay Settings
app.get('/staff/settings', requireAdmin, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, s) => {
        const content = `
            <h2>Barangay Settings</h2>
            <div class="card">
                <form action="/staff/settings" method="POST">
                    <div class="form-group"><label>Barangay Name</label><input type="text" name="barangay_name" class="form-control" value="${s.barangay_name}" required></div>
                    <div class="form-group"><label>Municipality / City</label><input type="text" name="municipality" class="form-control" value="${s.municipality}" required></div>
                    <div class="form-group"><label>Province</label><input type="text" name="province" class="form-control" value="${s.province}" required></div>
                    <div class="form-group"><label>Barangay Address</label><input type="text" name="address" class="form-control" value="${s.address}" required></div>
                    <div class="form-group"><label>Contact Number</label><input type="text" name="contact" class="form-control" value="${s.contact}" required></div>
                    <div class="form-group"><label>Email Address</label><input type="email" name="email" class="form-control" value="${s.email}" required></div>
                    <div class="form-group"><label>Barangay Captain</label><input type="text" name="captain" class="form-control" value="${s.captain}" required></div>
                    <div class="form-group"><label>Barangay Secretary</label><input type="text" name="secretary" class="form-control" value="${s.secretary}" required></div>
                    <button type="submit" class="btn btn-success">Save Settings</button>
                </form>
            </div>
        `;
        res.send(renderLayout('Barangay Settings', content, req.session.user.role, req));
    });
});

app.post('/staff/settings', requireAdmin, (req, res) => {
    const { barangay_name, municipality, province, address, contact, email, captain, secretary } = req.body;
    db.run(`UPDATE settings SET barangay_name = ?, municipality = ?, province = ?, address = ?, contact = ?, email = ?, captain = ?, secretary = ?`,
        [barangay_name, municipality, province, address, contact, email, captain, secretary], () => {
            logActivity(req.session.user.username, 'Updated barangay settings', req.ip);
            res.redirect('/staff/settings');
        });
});

// ==================== RESIDENT PORTAL ROUTES ====================

app.get('/resident', requireResident, (req, res) => {
    db.get(`SELECT * FROM residents WHERE id = ?`, [req.session.user.resident_id], (err, resident) => {
        db.all(`SELECT * FROM announcements ORDER BY id DESC LIMIT 5`, (err, announcements) => {
            const content = `
                <h2>Resident Dashboard</h2>
                <div class="card">
                    <h3>Welcome, ${resident ? resident.full_name : 'Resident'}!</h3>
                    <p>Resident ID: <strong>${req.session.user.resident_id}</strong></p>
                </div>
                <div class="card">
                    <h3>Latest Barangay Announcements</h3>
                    ${announcements.map(a => `<div style="border-bottom:1px solid #eee; padding:10px 0;"><h4>${a.title}</h4><p>${a.content}</p><small>${a.date_posted}</small></div>`).join('')}
                </div>
            `;
            res.send(renderLayout('Resident Dashboard', content, req.session.user.role, req));
        });
    });
});

app.get('/resident/profile', requireResident, (req, res) => {
    db.get(`SELECT * FROM residents WHERE id = ?`, [req.session.user.resident_id], (err, r) => {
        const content = `
            <h2>My Profile</h2>
            <div class="card" style="display:flex; gap:20px; align-items:center;">
                <img src="${r.photo || '/default.png'}" style="width:120px; height:120px; border-radius:50%; object-fit:cover; border:3px solid #3498db;">
                <div>
                    <h3>${r.full_name}</h3>
                    <p><strong>Resident ID:</strong> ${r.id}</p>
                    <p><strong>Address:</strong> ${r.address}</p>
                    <p><strong>Contact:</strong> ${r.contact}</p>
                    <p><strong>Email:</strong> ${r.email}</p>
                </div>
            </div>
        `;
        res.send(renderLayout('My Profile', content, req.session.user.role, req));
    });
});

app.get('/resident/digital-id', requireResident, async (req, res) => {
    db.get(`SELECT * FROM residents WHERE id = ?`, [req.session.user.resident_id], async (err, r) => {
        const verifyUrl = `${req.protocol}://${req.get('host')}/verify/resident/${r.id}`;
        const qrCodeDataUrl = await qrcode.toDataURL(verifyUrl);

        const content = `
            <h2>My Digital ID</h2>
            <div class="card" style="max-width:400px; margin:0 auto; text-align:center; border:2px solid #3498db; border-radius:12px; padding:20px;">
                <h3>${res.locals.settings.barangay_name}</h3>
                <small>${res.locals.settings.municipality}, ${res.locals.settings.province}</small>
                <hr style="margin:15px 0;">
                <img src="${r.photo}" style="width:120px; height:120px; border-radius:50%; object-fit:cover; border:3px solid #2ecc71;">
                <h2 style="margin-top:10px;">${r.full_name}</h2>
                <p><strong>ID Number:</strong> ${r.id}</p>
                <p><strong>Address:</strong> ${r.address}</p>
                <div style="margin-top:20px;">
                    <img src="${qrCodeDataUrl}" style="width:150px; height:150px;">
                    <p><small>Scan to verify ID status</small></p>
                </div>
            </div>
        `;
        res.send(renderLayout('Digital ID', content, req.session.user.role, req));
    });
});

app.get('/resident/certificates', requireResident, (req, res) => {
    db.all(`SELECT * FROM certificates WHERE resident_id = ?`, [req.session.user.resident_id], (err, certs) => {
        const content = `
            <h2>Certificate Requests</h2>
            <div class="card">
                <h3>Request Certificate</h3>
                <form action="/resident/certificates/request" method="POST" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                    <select name="certificate_type" class="form-control" required>
                        <option value="Barangay Clearance">Barangay Clearance</option>
                        <option value="Certificate of Residency">Certificate of Residency</option>
                        <option value="Certificate of Indigency">Certificate of Indigency</option>
                        <option value="Certificate of Good Moral">Certificate of Good Moral</option>
                    </select>
                    <input type="text" name="purpose" placeholder="Purpose" class="form-control" required>
                    <input type="number" name="quantity" placeholder="Quantity" value="1" class="form-control" required>
                    <input type="date" name="preferred_date" class="form-control" required>
                    <button type="submit" class="btn btn-success" style="grid-column: span 2;">Submit Request</button>
                </form>
            </div>
            <div class="card">
                <table>
                    <tr><th>Type</th><th>Purpose</th><th>Status</th><th>File</th></tr>
                    ${certs.map(c => `<tr><td>${c.certificate_type}</td><td>${c.purpose}</td><td><span class="badge badge-info">${c.status}</span></td><td>${c.certificate_file ? `<a href="${c.certificate_file}" target="_blank" class="btn" style="padding:4px 8px; font-size:0.75rem;">Download</a>` : 'Pending release'}</td></tr>`).join('')}
                </table>
            </div>
        `;
        res.send(renderLayout('Certificates', content, req.session.user.role, req));
    });
});

app.post('/resident/certificates/request', requireResident, (req, res) => {
    const { certificate_type, purpose, quantity, preferred_date } = req.body;
    db.run(`INSERT INTO certificates (resident_id, certificate_type, purpose, quantity, preferred_date) VALUES (?, ?, ?, ?, ?)`,
        [req.session.user.resident_id, certificate_type, purpose, quantity, preferred_date], () => {
            res.redirect('/resident/certificates');
        });
});

app.get('/resident/appointments', requireResident, (req, res) => {
    db.all(`SELECT * FROM appointments WHERE resident_id = ?`, [req.session.user.resident_id], (err, appts) => {
        const content = `
            <h2>Appointments</h2>
            <div class="card">
                <h3>Book Appointment</h3>
                <form action="/resident/appointments/book" method="POST" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                    <input type="text" name="service" placeholder="Service (e.g. Consultation)" class="form-control" required>
                    <input type="date" name="date" class="form-control" required>
                    <input type="time" name="time" class="form-control" required>
                    <input type="text" name="purpose" placeholder="Purpose" class="form-control" required>
                    <button type="submit" class="btn btn-success" style="grid-column: span 2;">Book Appointment</button>
                </form>
            </div>
            <div class="card">
                <table>
                    <tr><th>Service</th><th>Date & Time</th><th>Status</th></tr>
                    ${appts.map(a => `<tr><td>${a.service}</td><td>${a.date}${a.time}</td><td><span class="badge badge-info">${a.status}</span></td></tr>`).join('')}
                </table>
            </div>
        `;
        res.send(renderLayout('Appointments', content, req.session.user.role, req));
    });
});

app.post('/resident/appointments/book', requireResident, (req, res) => {
    const { service, date, time, purpose } = req.body;
    db.run(`INSERT INTO appointments (resident_id, service, date, time, purpose) VALUES (?, ?, ?, ?, ?)`,
        [req.session.user.resident_id, service, date, time, purpose], () => {
            res.redirect('/resident/appointments');
        });
});

app.get('/resident/complaints', requireResident, (req, res) => {
    db.all(`SELECT * FROM complaints WHERE resident_id = ?`, [req.session.user.resident_id], (err, list) => {
        const content = `
            <h2>Complaints & Blotter</h2>
            <div class="card">
                <h3>Submit Complaint</h3>
                <form action="/resident/complaints/submit" method="POST" style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
                    <input type="text" name="complaint_type" placeholder="Complaint Type (e.g. Noise, Dispute)" class="form-control" required>
                    <input type="date" name="date" class="form-control" required>
                    <input type="text" name="location" placeholder="Location" class="form-control" required>
                    <textarea name="description" placeholder="Description..." class="form-control" rows="3" required></textarea>
                    <button type="submit" class="btn btn-success">Submit Complaint</button>
                </form>
            </div>
            <div class="card">
                <table>
                    <tr><th>Type</th><th>Location</th><th>Description</th><th>Status</th></tr>
                    ${list.map(c => `<tr><td>${c.complaint_type}</td><td>${c.location}</td><td>${c.description}</td><td><span class="badge badge-warning">${c.status}</span></td></tr>`).join('')}
                </table>
            </div>
        `;
        res.send(renderLayout('Complaints', content, req.session.user.role, req));
    });
});

app.post('/resident/complaints/submit', requireResident, (req, res) => {
    const { complaint_type, date, location, description } = req.body;
    db.run(`INSERT INTO complaints (resident_id, complaint_type, date, location, description) VALUES (?, ?, ?, ?, ?)`,
        [req.session.user.resident_id, complaint_type, date, location, description], () => {
            res.redirect('/resident/complaints');
        });
});

app.get('/resident/assistance', requireResident, (req, res) => {
    db.all(`SELECT * FROM assistance WHERE resident_id = ?`, [req.session.user.resident_id], (err, list) => {
        const content = `
            <h2>Assistance Requests</h2>
            <div class="card">
                <h3>Request Assistance</h3>
                <form action="/resident/assistance/request" method="POST" style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
                    <select name="assistance_type" class="form-control" required>
                        <option value="Financial Assistance">Financial Assistance</option>
                        <option value="Medical Assistance">Medical Assistance</option>
                        <option value="Educational Assistance">Educational Assistance</option>
                        <option value="Food Assistance">Food Assistance</option>
                    </select>
                    <textarea name="amount_or_details" placeholder="Details or reason for assistance..." class="form-control" rows="3" required></textarea>
                    <button type="submit" class="btn btn-success">Submit Request</button>
                </form>
            </div>
            <div class="card">
                <table>
                    <tr><th>Type</th><th>Details</th><th>Status</th></tr>
                    ${list.map(a => `<tr><td>${a.assistance_type}</td><td>${a.amount_or_details}</td><td><span class="badge badge-info">${a.status}</span></td></tr>`).join('')}
                </table>
            </div>
        `;
        res.send(renderLayout('Assistance', content, req.session.user.role, req));
    });
});

app.post('/resident/assistance/request', requireResident, (req, res) => {
    const { assistance_type, amount_or_details } = req.body;
    db.run(`INSERT INTO assistance (resident_id, assistance_type, amount_or_details) VALUES (?, ?, ?)`,
        [req.session.user.resident_id, assistance_type, amount_or_details], () => {
            res.redirect('/resident/assistance');
        });
});

app.get('/resident/announcements', requireResident, (req, res) => {
    db.all(`SELECT * FROM announcements ORDER BY id DESC`, (err, list) => {
        const content = `
            <h2>Announcements</h2>
            <div class="card">
                ${list.map(a => `<div style="border-bottom:1px solid #eee; padding:15px 0;"><h3>${a.title}</h3><p style="margin:5px 0;">${a.content}</p><small>Posted on${a.date_posted}</small></div>`).join('')}
            </div>
        `;
        res.send(renderLayout('Announcements', content, req.session.user.role, req));
    });
});

app.get('/resident/notifications', requireResident, (req, res) => {
    const content = `
        <h2>Notifications</h2>
        <div class="card">
            <p>No new notifications at this time.</p>
        </div>
    `;
    res.send(renderLayout('Notifications', content, req.session.user.role, req));
});

app.get('/resident/settings', requireResident, (req, res) => {
    const content = `
        <h2>Account Settings</h2>
        <div class="card">
            <form action="/resident/settings" method="POST">
                <div class="form-group"><label>New Password</label><input type="password" name="password" class="form-control" required></div>
                <button type="submit" class="btn btn-success">Update Password</button>
            </form>
        </div>
    `;
    res.send(renderLayout('Account Settings', content, req.session.user.role, req));
});

app.post('/resident/settings', requireResident, async (req, res) => {
    const hash = await bcrypt.hash(req.body.password, 10);
    db.run(`UPDATE users SET password_hash = ? WHERE resident_id = ?`, [hash, req.session.user.resident_id], () => {
        res.send(`<script>alert('Password updated successfully'); window.location.href='/resident/settings';</script>`);
    });
});

// Default redirection root
app.get('/', (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'RESIDENT') res.redirect('/resident');
        else res.redirect('/staff');
    } else {
        res.redirect('/login');
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Barangay Resident Management System running on port ${PORT}`);
});
