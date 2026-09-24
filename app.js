/**
 * Barangay Resident Management System
 * Complete Backend and Frontend in a Single app.js File
 * Stack: Node.js, Express, SQLite3, bcrypt, express-session, multer, qrcode
 */

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'brgy-super-secret-key-2026';

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage config for document and image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware setup
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(uploadDir));
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Initialize SQLite Database
const dbFile = path.join(__dirname, 'barangay.db');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initDatabase();
    }
});

// Database Schema Initialization
function initDatabase() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS barangay_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            barangay_name TEXT DEFAULT 'Barangay San Jose',
            municipality TEXT DEFAULT 'Quezon City',
            province TEXT DEFAULT 'Metro Manila',
            region TEXT DEFAULT 'National Capital Region',
            address TEXT DEFAULT '123 Barangay Hall St.',
            contact_number TEXT DEFAULT '09123456789',
            email TEXT DEFAULT 'sanjose@barangay.gov.ph',
            captain_name TEXT DEFAULT 'Hon. Juan D. Santos',
            secretary_name TEXT DEFAULT 'Maria R. Reyes',
            logo TEXT DEFAULT '',
            official_seal TEXT DEFAULT ''
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL, -- Admin, Staff, Resident
            status TEXT DEFAULT 'Active', -- Active, Inactive, Pending
            resident_id TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS residents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id TEXT UNIQUE NOT NULL,
            first_name TEXT NOT NULL,
            middle_name TEXT DEFAULT '',
            last_name TEXT NOT NULL,
            suffix TEXT DEFAULT '',
            dob TEXT NOT NULL,
            gender TEXT NOT NULL,
            civil_status TEXT NOT NULL,
            address TEXT NOT NULL,
            purok TEXT NOT NULL,
            contact_number TEXT NOT NULL,
            email TEXT DEFAULT '',
            occupation TEXT DEFAULT '',
            educational_attainment TEXT DEFAULT '',
            nationality TEXT DEFAULT 'Filipino',
            voter_status TEXT DEFAULT 'No',
            senior_citizen_status TEXT DEFAULT 'No',
            pwd_status TEXT DEFAULT 'No',
            solo_parent_status TEXT DEFAULT 'No',
            status_4ps TEXT DEFAULT 'No',
            resident_photo TEXT DEFAULT '',
            date_registered TEXT DEFAULT CURRENT_TIMESTAMP,
            account_status TEXT DEFAULT 'Active', -- Active, Archived
            archive_reason TEXT DEFAULT ''
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS households (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            household_number TEXT UNIQUE NOT NULL,
            address TEXT NOT NULL,
            purok TEXT NOT NULL,
            head_resident_id TEXT NOT NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS household_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            household_id INTEGER NOT NULL,
            resident_id TEXT NOT NULL,
            relationship TEXT DEFAULT 'Member'
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS puroks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purok_name TEXT UNIQUE NOT NULL,
            description TEXT DEFAULT ''
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS certificate_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_number TEXT UNIQUE NOT NULL,
            resident_id TEXT NOT NULL,
            certificate_type TEXT NOT NULL,
            purpose TEXT NOT NULL,
            additional_info TEXT DEFAULT '',
            status TEXT DEFAULT 'Pending', -- Pending, Processing, Approved, Ready for Release, Released, Rejected
            remarks TEXT DEFAULT '',
            uploaded_file TEXT DEFAULT '',
            date_requested DATETIME DEFAULT CURRENT_TIMESTAMP,
            date_processed DATETIME DEFAULT '',
            date_released DATETIME DEFAULT '',
            processed_by TEXT DEFAULT ''
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id TEXT NOT NULL,
            service TEXT NOT NULL,
            appointment_date TEXT NOT NULL,
            appointment_time TEXT NOT NULL,
            purpose TEXT NOT NULL,
            notes TEXT DEFAULT '',
            status TEXT DEFAULT 'Pending' -- Pending, Approved, Rejected, Completed, Cancelled
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS complaints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id TEXT NOT NULL,
            concern_type TEXT NOT NULL,
            description TEXT NOT NULL,
            incident_date TEXT NOT NULL,
            location TEXT NOT NULL,
            attachment TEXT DEFAULT '',
            status TEXT DEFAULT 'Submitted' -- Submitted, Under Review, Investigating, Resolved, Closed
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS blotter_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_number TEXT UNIQUE NOT NULL,
            complainant TEXT NOT NULL,
            respondent TEXT NOT NULL,
            incident_date TEXT NOT NULL,
            incident_time TEXT NOT NULL,
            location TEXT NOT NULL,
            description TEXT NOT NULL,
            witnesses TEXT DEFAULT '',
            action_taken TEXT DEFAULT '',
            settlement TEXT DEFAULT '',
            status TEXT DEFAULT 'Open', -- Open, Under Investigation, Settled, Closed
            attachments TEXT DEFAULT ''
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS assistance_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id TEXT NOT NULL,
            assistance_type TEXT NOT NULL,
            reason TEXT NOT NULL,
            supporting_doc TEXT DEFAULT '',
            status TEXT DEFAULT 'Pending', -- Pending, Approved, Rejected, Released
            remarks TEXT DEFAULT ''
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            image TEXT DEFAULT '',
            priority TEXT DEFAULT 'Normal', -- Normal, Important, Emergency
            expiration_date TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipient_username TEXT NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id TEXT NOT NULL,
            service TEXT NOT NULL,
            rating INTEGER NOT NULL,
            comment TEXT DEFAULT '',
            date_submitted DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS businesses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            business_name TEXT NOT NULL,
            owner_name TEXT NOT NULL,
            address TEXT NOT NULL,
            purok TEXT NOT NULL,
            business_type TEXT NOT NULL,
            contact_number TEXT NOT NULL,
            permit_number TEXT UNIQUE NOT NULL,
            permit_status TEXT DEFAULT 'Active', -- Active, Expired, Revoked
            expiration_date TEXT NOT NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            action TEXT NOT NULL,
            ip_address TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Seed default settings if empty
        db.get(`SELECT COUNT(*) as count FROM barangay_settings`, (err, row) => {
            if (row && row.count === 0) {
                db.run(`INSERT INTO barangay_settings (barangay_name, municipality, province, region, address, contact_number, email, captain_name, secretary_name) 
                        VALUES ('Barangay San Jose', 'Quezon City', 'Metro Manila', 'NCR', '123 Barangay Hall St.', '09123456789', 'sanjose@barangay.gov.ph', 'Hon. Juan D. Santos', 'Maria R. Reyes')`);
            }
        });

        // Seed default Admin user if empty
        db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'Admin'`, async (err, row) => {
            if (row && row.count === 0) {
                const hashedPass = await bcrypt.hash('admin123', 10);
                db.run(`INSERT INTO users (username, password, role, status) VALUES ('admin', ?, 'Admin', 'Active')`, [hashedPass], () => {
                    console.log('Default Admin user created: username: admin, password: admin123');
                });
            }
        });
    });
}

// Helper function to log activities
function logActivity(username, action, req) {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : '';
    db.run(`INSERT INTO activity_logs (username, action, ip_address) VALUES (?, ?, ?)`, [username, action, ip]);
}

// Helper to create notification
function sendNotification(username, message) {
    db.run(`INSERT INTO notifications (recipient_username, message) VALUES (?, ?)`, [username, message]);
}

// Helper to generate unique Resident ID
function generateResidentID(callback) {
    const year = new Date().getFullYear();
    db.get(`SELECT COUNT(*) as count FROM residents`, (err, row) => {
        const nextNum = (row ? row.count : 0) + 1;
        const paddedNum = String(nextNum).padStart(6, '0');
        callback(`BRGY-${year}-${paddedNum}`);
    });
}

// Auth Middleware
function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
}

function isStaffOrAdmin(req, res, next) {
    if (req.session && req.session.user && (req.session.user.role === 'Admin' || req.session.user.role === 'Staff')) {
        return next();
    }
    res.status(403).send(renderErrorPage('Access Denied', 'You do not have permission to access the Staff Portal.'));
}

function isAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'Admin') {
        return next();
    }
    res.status(403).send(renderErrorPage('Access Denied', 'Administrator privileges required.'));
}

function isResident(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'Resident') {
        return next();
    }
    res.status(403).send(renderErrorPage('Access Denied', 'Resident portal access only.'));
}

// UI Template wrapper with modern government professional design & styling
function renderLayout(title, content, user, settings) {
    const logoUrl = settings && settings.logo ? `/uploads/${settings.logo}` : '';
    const brgyName = settings ? settings.barangay_name : 'Barangay System';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - ${brgyName}</title>
    <style>
        :root {
            --primary: #1b365d;
            --primary-dark: #122340;
            --accent: #2b6cb0;
            --success: #2f855a;
            --warning: #c05621;
            --danger: #9b2c2c;
            --light: #f7fafc;
            --dark: #2d3748;
            --border: #e2e8f0;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background: #f0f4f8; color: var(--dark); display: flex; height: 100vh; overflow: hidden; }
        
        /* Sidebar Navigation */
        sidebar { width: 280px; background: var(--primary); color: white; display: flex; flex-direction: column; height: 100%; border-right: 1px solid var(--border); box-shadow: 2px 0 10px rgba(0,0,0,0.1); }
        .sidebar-header { padding: 20px; display: flex; align-items: center; gap: 12px; background: var(--primary-dark); border-bottom: 1px solid rgba(255,255,255,0.1); }
        .sidebar-header img { width: 45px; height: 45px; border-radius: 50%; object-fit: cover; background: white; }
        .sidebar-header h2 { font-size: 1.1rem; line-height: 1.2; }
        .sidebar-header p { font-size: 0.75rem; color: #a0aec0; }
        
        .sidebar-menu { flex: 1; overflow-y: auto; padding: 15px 0; }
        .sidebar-menu a { display: flex; align-items: center; gap: 12px; padding: 12px 20px; color: #cbd5e0; text-decoration: none; font-size: 0.95rem; transition: all 0.2s; border-left: 4px solid transparent; }
        .sidebar-menu a:hover, .sidebar-menu a.active { background: rgba(255,255,255,0.08); color: white; border-left-color: #63b3ed; }
        .sidebar-menu .menu-category { font-size: 0.7rem; text-transform: uppercase; color: #a0aec0; padding: 15px 20px 5px 20px; letter-spacing: 1px; }

        /* Main Content Wrapper */
        .main-container { flex: 1; display: flex; flex-direction: column; height: 100%; overflow: hidden; }
        header { background: white; padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .user-info { display: flex; align-items: center; gap: 15px; }
        .user-badge { background: #ebf8ff; color: var(--accent); padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; }
        .btn-logout { background: var(--danger); color: white; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; text-decoration: none; font-size: 0.85rem; }
        .btn-logout:hover { background: #822727; }

        .content-body { flex: 1; overflow-y: auto; padding: 30px; background: #f8fafc; }

        /* UI Elements */
        h1 { font-size: 1.8rem; color: var(--primary); margin-bottom: 20px; }
        h2 { font-size: 1.4rem; color: var(--primary); margin-bottom: 15px; }
        .card { background: white; border-radius: 8px; border: 1px solid var(--border); padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 20px; }
        .grid-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 25px; }
        .stat-card { background: white; padding: 20px; border-radius: 8px; border: 1px solid var(--border); border-left: 5px solid var(--accent); box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .stat-card h3 { font-size: 0.85rem; color: #718096; text-transform: uppercase; margin-bottom: 5px; }
        .stat-card .number { font-size: 1.8rem; font-weight: 700; color: var(--primary); }

        table { width: 100%; border-collapse: collapse; margin-top: 10px; background: white; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
        th { background: #edf2f7; color: var(--primary); font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.5px; }
        tr:hover { background: #f7fafc; }

        .btn { background: var(--accent); color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; font-size: 0.9rem; font-weight: 500; transition: background 0.2s; }
        .btn:hover { background: #2c5282; }
        .btn-success { background: var(--success); }
        .btn-success:hover { background: #22543d; }
        .btn-warning { background: var(--warning); }
        .btn-warning:hover { background: #9c4221; }
        .btn-danger { background: var(--danger); }
        .btn-danger:hover { background: #742a2a; }
        .btn-secondary { background: #4a5568; }
        .btn-secondary:hover { background: #2d3748; }

        .form-group { margin-bottom: 15px; }
        label { display: block; font-weight: 600; margin-bottom: 5px; font-size: 0.85rem; color: #4a5568; }
        input[type="text"], input[type="email"], input[type="password"], input[type="date"], input[type="time"], input[type="file"], select, textarea {
            width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 4px; font-size: 0.9rem; background: #fff;
        }
        input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(43,108,176,0.1); }
        
        .badge { padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
        .badge-active, .badge-approved, .badge-settled { background: #c6f6d5; color: #22543d; }
        .badge-pending, .badge-processing { background: #feebc8; color: #744210; }
        .badge-rejected, .badge-archived, .badge-closed { background: #fed7d7; color: #742a2a; }
        
        .flex-row { display: flex; gap: 15px; align-items: center; }
        .flex-between { display: flex; justify-content: space-between; align-items: center; }
        .mb-20 { margin-bottom: 20px; }
        
        /* Print Styles */
        @media print {
            sidebar, header, .no-print, .btn { display: none !important; }
            body, .main-container, .content-body { background: white !important; overflow: visible !important; height: auto !important; padding: 0 !important; }
            .print-container { width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: none !important; }
        }
    </style>
</head>
<body>
    ${user ? `
    <sidebar>
        <div class="sidebar-header">
            <img src="${logoUrl || 'https://via.placeholder.com/45'}" alt="Logo">
            <div>
                <h2>${brgyName}</h2>
                <p>${user.role} Portal</p>
            </div>
        </div>
        <div class="sidebar-menu">
            ${user.role === 'Resident' ? `
                <div class="menu-category">Resident Portal</div>
                <a href="/resident/dashboard">Dashboard</a>
                <a href="/resident/profile">My Profile & ID</a>
                <a href="/resident/certificates">Certificate Requests</a>
                <a href="/resident/appointments">Appointments</a>
                <a href="/resident/complaints">Complaints & Reports</a>
                <a href="/resident/assistance">Financial / Assistance</a>
                <a href="/resident/announcements">Announcements</a>
                <a href="/resident/feedback">Service Feedback</a>
            ` : `
                <div class="menu-category">Staff Navigation</div>
                <a href="/staff/dashboard">Dashboard</a>
                <a href="/staff/residents">Resident Directory</a>
                <a href="/staff/households">Households</a>
                <a href="/staff/puroks">Puroks / Zones</a>
                <a href="/staff/certificates">Certificate Requests</a>
                <a href="/staff/id-printing">ID Batch Printing</a>
                <a href="/staff/appointments">Appointments</a>
                <a href="/staff/complaints">Complaints</a>
                <a href="/staff/blotter">Blotter Records</a>
                <a href="/staff/assistance">Assistance Requests</a>
                <a href="/staff/businesses">Business Permits</a>
                <a href="/staff/announcements">Announcements</a>
                <a href="/staff/reports">Official Reports</a>
                <a href="/staff/activity-logs">Activity Logs</a>
                ${user.role === 'Admin' ? '<div class="menu-category">Administration</div><a href="/staff/settings">Barangay Settings</a><a href="/staff/users">User Management</a>' : ''}
            `}
        </div>
    </sidebar>
    ` : ''}

    <div class="main-container">
        ${user ? `
        <header>
            <div class="flex-row">
                <span style="font-weight: 600; color: var(--primary);">Welcome, ${user.username}</span>
                <span class="user-badge">${user.role}</span>
            </div>
            <div class="flex-row">
                ${user.role === 'Resident' ? `<a href="/resident/registration-link-info" class="btn" style="font-size: 0.8rem; padding: 5px 10px;">Public Reg Info</a>` : `<button onclick="navigator.clipboard.writeText(window.location.origin + '/register'); alert('Registration Link Copied!');" class="btn" style="font-size: 0.8rem; padding: 5px 10px;">Copy Reg Link</button>`}
                <a href="/logout" class="btn-logout">Logout</a>
            </div>
        </header>
        ` : ''}
        <div class="content-body">
            ${content}
        </div>
    </div>
</body>
</html>`;
}

function renderErrorPage(title, message) {
    return `<!DOCTYPE html>
<html>
<head><title>${title}</title><style>body{font-family:sans-serif;text-align:center;padding:50px;background:#f0f4f8;}h1{color:#9b2c2c;}</style></head>
<body><h1>${title}</h1><p>${message}</p><p><a href="/login">Back to Login</a></p></body>
</html>`;
}

// ==================== AUTHENTICATION & INITIAL SETUP ROUTES ====================

app.get('/login', (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Login - ${settings ? settings.barangay_name : 'Barangay System'}</title>
    <style>
        body { background: #1b365d; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        .login-card { background: white; padding: 40px; border-radius: 8px; width: 100%; max-width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); text-align: center; }
        .login-card img { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 15px; background: #edf2f7; }
        .login-card h2 { color: #1b365d; margin-bottom: 5px; font-size: 1.5rem; }
        .login-card p { color: #718096; font-size: 0.85rem; margin-bottom: 25px; }
        .form-group { margin-bottom: 20px; text-align: left; }
        label { display: block; font-weight: 600; margin-bottom: 5px; font-size: 0.85rem; color: #4a5568; }
        input { width: 100%; padding: 12px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 0.95rem; }
        input:focus { outline: none; border-color: #2b6cb0; box-shadow: 0 0 0 3px rgba(43,108,176,0.1); }
        .btn { width: 100%; background: #2b6cb0; color: white; padding: 12px; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 1rem; }
        .btn:hover { background: #2c5282; }
        .links { margin-top: 20px; font-size: 0.9rem; }
        .links a { color: #2b6cb0; text-decoration: none; }
        .links a:hover { text-decoration: underline; }
        .error { background: #fed7d7; color: #742a2a; padding: 10px; border-radius: 4px; margin-bottom: 15px; font-size: 0.85rem; }
    </style>
</head>
<body>
    <div class="login-card">
        <img src="${settings && settings.logo ? '/uploads/' + settings.logo : 'https://via.placeholder.com/80'}" alt="Logo">
        <h2>${settings ? settings.barangay_name : 'Barangay System'}</h2>
        <p>Resident & Staff Management Portal</p>
        ${req.query.error ? `<div class="error">${req.query.error}</div>` : ''}
        <form action="/login" method="POST">
            <div class="form-group">
                <label>Username or Email</label>
                <input type="text" name="username" required placeholder="Enter username or email">
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" name="password" required placeholder="Enter password">
            </div>
            <button type="submit" class="btn">Login to Portal</button>
        </form>
        <div class="links">
            <p>Don't have a resident account? <a href="/register">Register Online</a></p>
        </div>
    </div>
</body>
</html>`);
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? OR username = ?`, [username, username], async (err, user) => {
        if (err || !user) {
            return res.redirect('/login?error=Invalid username or password');
        }
        if (user.status !== 'Active') {
            return res.redirect('/login?error=Account is inactive or pending approval.');
        }
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.redirect('/login?error=Invalid username or password');
        }

        req.session.user = { id: user.id, username: user.username, role: user.role, resident_id: user.resident_id };
        logActivity(user.username, 'User Logged In', req);

        if (user.role === 'Admin' || user.role === 'Staff') {
            res.redirect('/staff/dashboard');
        } else {
            res.redirect('/resident/dashboard');
        }
    });
});

app.get('/logout', (req, res) => {
    if (req.session && req.session.user) {
        logActivity(req.session.user.username, 'User Logged Out', req);
    }
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// ==================== PUBLIC RESIDENT REGISTRATION ====================

app.get('/register', (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM puroks`, (err, puroks) => {
            res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Resident Registration - ${settings ? settings.barangay_name : 'Barangay'}</title>
    <style>
        body { background: #f0f4f8; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; }
        .reg-container { max-width: 700px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        h1 { color: #1b365d; text-align: center; margin-bottom: 10px; }
        p.subtitle { text-align: center; color: #718096; margin-bottom: 30px; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .form-group { margin-bottom: 15px; }
        .full-width { grid-column: span 2; }
        label { display: block; font-weight: 600; margin-bottom: 5px; font-size: 0.85rem; color: #4a5568; }
        input, select, textarea { width: 100%; padding: 10px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 0.9rem; }
        .btn { width: 100%; background: #2b6cb0; color: white; padding: 12px; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 1rem; margin-top: 15px; }
        .btn:hover { background: #2c5282; }
        .success { background: #c6f6d5; color: #22543d; padding: 15px; border-radius: 4px; margin-bottom: 20px; text-align: center; }
    </style>
</head>
<body>
    <div class="reg-container">
        <h1>${settings ? settings.barangay_name : 'Barangay'} Resident Registration</h1>
        <p class="subtitle">Submit your details for official barangay verification and account creation.</p>
        ${req.query.success ? `<div class="success">Registration submitted successfully! Please wait for staff verification before logging in. <br><a href="/login">Go to Login</a></div>` : ''}
        <form action="/register" method="POST" enctype="multipart/form-data">
            <div class="form-grid">
                <div class="form-group"><label>First Name *</label><input type="text" name="first_name" required></div>
                <div class="form-group"><label>Middle Name</label><input type="text" name="middle_name"></div>
                <div class="form-group"><label>Last Name *</label><input type="text" name="last_name" required></div>
                <div class="form-group"><label>Suffix</label><input type="text" name="suffix" placeholder="Jr., III, etc."></div>
                
                <div class="form-group"><label>Date of Birth *</label><input type="date" name="dob" required></div>
                <div class="form-group"><label>Gender *</label>
                    <select name="gender" required>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                    </select>
                </div>
                
                <div class="form-group"><label>Civil Status *</label>
                    <select name="civil_status" required>
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Widowed">Widowed</option>
                        <option value="Separated">Separated</option>
                    </select>
                </div>
                <div class="form-group"><label>Purok / Zone *</label>
                    <select name="purok" required>
                        ${puroks.map(p => `<option value="${p.purok_name}">${p.purok_name}</option>`).join('')}
                    </select>
                </div>

                <div class="form-group full-width"><label>Complete Address *</label><input type="text" name="address" required placeholder="House No., Street, Subdivision"></div>
                
                <div class="form-group"><label>Contact Number *</label><input type="text" name="contact_number" required placeholder="09XXXXXXXXX"></div>
                <div class="form-group"><label>Email Address *</label><input type="email" name="email" required></div>

                <div class="form-group"><label>Occupation</label><input type="text" name="occupation"></div>
                <div class="form-group"><label>Educational Attainment</label>
                    <select name="educational_attainment">
                        <option value="Elementary">Elementary</option>
                        <option value="High School">High School</option>
                        <option value="Vocational">Vocational</option>
                        <option value="College Undergraduate">College Undergraduate</option>
                        <option value="College Graduate">College Graduate</option>
                        <option value="Post Graduate">Post Graduate</option>
                        <option value="None">None</option>
                    </select>
                </div>

                <div class="form-group"><label>Registered Voter? *</label>
                    <select name="voter_status"><option value="Yes">Yes</option><option value="No">No</option></select>
                </div>
                <div class="form-group"><label>Senior Citizen? *</label>
                    <select name="senior_citizen_status"><option value="No">No</option><option value="Yes">Yes</option></select>
                </div>
                <div class="form-group"><label>PWD? *</label>
                    <select name="pwd_status"><option value="No">No</option><option value="Yes">Yes</option></select>
                </div>
                <div class="form-group"><label>Solo Parent? *</label>
                    <select name="solo_parent_status"><option value="No">No</option><option value="Yes">Yes</option></select>
                </div>
                <div class="form-group"><label>4Ps Beneficiary? *</label>
                    <select name="status_4ps"><option value="No">No</option><option value="Yes">Yes</option></select>
                </div>

                <div class="form-group"><label>Resident Photo (ID Picture)</label><input type="file" name="resident_photo" accept="image/*"></div>
                <div class="form-group"><label>Portal Password *</label><input type="password" name="password" required placeholder="Create secure password"></div>
            </div>
            <button type="submit" class="btn">Submit Registration for Verification</button>
        </form>
        <div style="text-align: center; margin-top: 20px;">
            <a href="/login" style="color: #2b6cb0; text-decoration: none;">Already have an account? Login here</a>
        </div>
    </div>
</body>
</html>`);
        });
    });
});

app.post('/register', upload.single('resident_photo'), async (req, res) => {
    const data = req.body;
    const photo = req.file ? req.file.filename : '';
    
    // Calculate Age / Senior Status
    const birthDate = new Date(data.dob);
    const age = new Date().getFullYear() - birthDate.getFullYear();
    const senior = age >= 60 ? 'Yes' : data.senior_citizen_status;

    generateResidentID(async (newResidentId) => {
        db.run(`INSERT INTO residents (resident_id, first_name, middle_name, last_name, suffix, dob, gender, civil_status, address, purok, contact_number, email, occupation, educational_attainment, voter_status, senior_citizen_status, pwd_status, solo_parent_status, status_4ps, resident_photo, account_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`,
                [newResidentId, data.first_name, data.middle_name, data.last_name, data.suffix, data.dob, data.gender, data.civil_status, data.address, data.purok, data.contact_number, data.email, data.occupation, data.educational_attainment, data.voter_status, senior, data.pwd_status, data.solo_parent_status, data.status_4ps, photo],
                async (err) => {
                    if (err) {
                        return res.status(400).send(renderErrorPage('Registration Error', err.message));
                    }
                    const hashedPassword = await bcrypt.hash(data.password, 10);
                    db.run(`INSERT INTO users (username, password, role, status, resident_id) VALUES (?, ?, 'Resident', 'Pending', ?)`,
                        [data.email, hashedPassword, newResidentId], () => {
                            res.redirect('/register?success=1');
                        });
                });
    });
});

// ==================== STAFF PORTAL & DASHBOARD ====================

app.get('/staff/dashboard', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.get(`SELECT 
            (SELECT COUNT(*) FROM residents WHERE account_status = 'Active') as total_residents,
            (SELECT COUNT(*) FROM households) as total_households,
            (SELECT COUNT(*) FROM residents WHERE gender = 'Male' AND account_status = 'Active') as male_count,
            (SELECT COUNT(*) FROM residents WHERE gender = 'Female' AND account_status = 'Active') as female_count,
            (SELECT COUNT(*) FROM residents WHERE senior_citizen_status = 'Yes' AND account_status = 'Active') as senior_count,
            (SELECT COUNT(*) FROM residents WHERE pwd_status = 'Yes' AND account_status = 'Active') as pwd_count,
            (SELECT COUNT(*) FROM residents WHERE solo_parent_status = 'Yes' AND account_status = 'Active') as solo_count,
            (SELECT COUNT(*) FROM residents WHERE (strftime('%Y', 'now') - strftime('%Y', dob)) < 18 AND account_status = 'Active') as minor_count,
            (SELECT COUNT(*) FROM residents WHERE voter_status = 'Yes' AND account_status = 'Active') as voter_count,
            (SELECT COUNT(*) FROM certificate_requests WHERE status = 'Pending') as pending_certs,
            (SELECT COUNT(*) FROM appointments WHERE status = 'Pending') as pending_appts,
            (SELECT COUNT(*) FROM blotter_cases WHERE status = 'Open') as open_blotters`, (err, stats) => {
            
            db.all(`SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 10`, (err, logs) => {
                db.all(`SELECT * FROM residents WHERE account_status = 'Active' ORDER BY id DESC LIMIT 5`, (err, recentResidents) => {
                    
                    const content = `
                        <h1>Staff & Admin Dashboard</h1>
                        <p class="mb-20" style="color: #718096;">Real-time analytics and overview of ${settings.barangay_name}.</p>
                        
                        <div class="grid-stats">
                            <div class="stat-card"><h3>Total Residents</h3><div class="number">${stats.total_residents}</div></div>
                            <div class="stat-card" style="border-left-color: #319795;"><h3>Total Households</h3><div class="number">${stats.total_households}</div></div>
                            <div class="stat-card" style="border-left-color: #d69e2e;"><h3>Senior Citizens</h3><div class="number">${stats.senior_count}</div></div>
                            <div class="stat-card" style="border-left-color: #e53e3e;"><h3>PWD Residents</h3><div class="number">${stats.pwd_count}</div></div>
                            <div class="stat-card" style="border-left-color: #38a169;"><h3>Registered Voters</h3><div class="number">${stats.voter_count}</div></div>
                            <div class="stat-card" style="border-left-color: #805ad5;"><h3>Pending Certificates</h3><div class="number">${stats.pending_certs}</div></div>
                            <div class="stat-card" style="border-left-color: #dd6b20;"><h3>Pending Appointments</h3><div class="number">${stats.pending_appts}</div></div>
                            <div class="stat-card" style="border-left-color: #c53030;"><h3>Open Blotter Cases</h3><div class="number">${stats.open_blotters}</div></div>
                        </div>

                        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
                            <div class="card">
                                <h2>Recent Resident Registrations</h2>
                                <table>
                                    <thead><tr><th>Resident ID</th><th>Name</th><th>Purok</th><th>Contact</th><th>Action</th></tr></thead>
                                    <tbody>
                                        ${recentResidents.map(r => `
                                            <tr>
                                                <td>${r.resident_id}</td>
                                                <td>${r.first_name} ${r.last_name}</td>
                                                <td>${r.purok}</td>
                                                <td>${r.contact_number}</td>
                                                <td><a href="/staff/residents/view/${r.id}" class="btn" style="padding: 4px 8px; font-size: 0.8rem;">View</a></td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>

                            <div class="card">
                                <h2>System Activity Log</h2>
                                <div style="font-size: 0.85rem; max-height: 350px; overflow-y: auto;">
                                    ${logs.map(l => `
                                        <div style="padding: 8px 0; border-bottom: 1px solid #edf2f7;">
                                            <strong>${l.username}</strong>: ${l.action}<br>
                                            <span style="color: #a0aec0; font-size: 0.75rem;">${l.created_at}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    `;
                    res.send(renderLayout('Staff Dashboard', content, req.session.user, settings));
                });
            });
        });
    });
});

// ==================== RESIDENT MANAGEMENT (STAFF) ====================

app.get('/staff/residents', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        const search = req.query.search || '';
        const purokFilter = req.query.purok || '';
        const statusFilter = req.query.status || 'Active';
        
        let query = `SELECT * FROM residents WHERE account_status = ?`;
        let params = [statusFilter];

        if (search) {
            query += ` AND (first_name LIKE ? OR last_name LIKE ? OR resident_id LIKE ? OR contact_number LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (purokFilter) {
            query += ` AND purok = ?`;
            params.push(purokFilter);
        }
        query += ` ORDER BY id DESC`;

        db.all(query, params, (err, residents) => {
            db.all(`SELECT * FROM puroks`, (err, puroks) => {
                const content = `
                    <div class="flex-between mb-20">
                        <h1>Resident Directory</h1>
                        <a href="/staff/residents/add" class="btn btn-success">+ Add New Resident</a>
                    </div>
                    
                    <div class="card mb-20">
                        <form method="GET" action="/staff/residents" class="flex-row" style="gap: 10px; flex-wrap: wrap;">
                            <input type="text" name="search" placeholder="Search name, ID, contact..." value="${search}" style="flex: 2;">
                            <select name="purok" style="flex: 1;">
                                <option value="">All Puroks</option>
                                ${puroks.map(p => `<option value="${p.purok_name}" ${purokFilter === p.purok_name ? 'selected' : ''}>${p.purok_name}</option>`).join('')}
                            </select>
                            <select name="status" style="flex: 1;">
                                <option value="Active" ${statusFilter === 'Active' ? 'selected' : ''}>Active Residents</option>
                                <option value="Archived" ${statusFilter === 'Archived' ? 'selected' : ''}>Archived Residents</option>
                            </select>
                            <button type="submit" class="btn">Filter</button>
                            <a href="/staff/residents" class="btn btn-secondary">Reset</a>
                        </form>
                    </div>

                    <div class="card">
                        <table>
                            <thead>
                                <tr>
                                    <th>Resident ID</th>
                                    <th>Full Name</th>
                                    <th>Gender</th>
                                    <th>Purok / Address</th>
                                    <th>Contact</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${residents.map(r => `
                                    <tr>
                                        <td><strong>${r.resident_id}</strong></td>
                                        <td>${r.first_name} ${r.middle_name || ''} ${r.last_name} ${r.suffix || ''}</td>
                                        <td>${r.gender}</td>
                                        <td>${r.purok} - ${r.address}</td>
                                        <td>${r.contact_number}</td>
                                        <td><span class="badge badge-${r.account_status.toLowerCase()}">${r.account_status}</span></td>
                                        <td>
                                            <a href="/staff/residents/view/${r.id}" class="btn" style="padding: 4px 8px; font-size: 0.8rem;">View</a>
                                            <a href="/staff/residents/edit/${r.id}" class="btn btn-warning" style="padding: 4px 8px; font-size: 0.8rem;">Edit</a>
                                            ${r.account_status === 'Active' ? 
                                                `<a href="/staff/residents/archive/${r.id}" class="btn btn-danger" style="padding: 4px 8px; font-size: 0.8rem;" onclick="return confirm('Are you sure you want to archive this resident?');">Archive</a>` : 
                                                `<a href="/staff/residents/restore/${r.id}" class="btn btn-success" style="padding: 4px 8px; font-size: 0.8rem;">Restore</a>`
                                            }
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
                res.send(renderLayout('Resident Directory', content, req.session.user, settings));
            });
        });
    });
});

app.get('/staff/residents/add', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM puroks`, (err, puroks) => {
            const content = `
                <h1>Add New Resident</h1>
                <div class="card">
                    <form action="/staff/residents/add" method="POST" enctype="multipart/form-data">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div class="form-group"><label>First Name *</label><input type="text" name="first_name" required></div>
                            <div class="form-group"><label>Middle Name</label><input type="text" name="middle_name"></div>
                            <div class="form-group"><label>Last Name *</label><input type="text" name="last_name" required></div>
                            <div class="form-group"><label>Suffix</label><input type="text" name="suffix"></div>
                            
                            <div class="form-group"><label>Date of Birth *</label><input type="date" name="dob" required></div>
                            <div class="form-group"><label>Gender *</label>
                                <select name="gender"><option value="Male">Male</option><option value="Female">Female</option></select>
                            </div>
                            
                            <div class="form-group"><label>Civil Status *</label>
                                <select name="civil_status">
                                    <option value="Single">Single</option><option value="Married">Married</option>
                                    <option value="Widowed">Widowed</option><option value="Separated">Separated</option>
                                </select>
                            </div>
                            <div class="form-group"><label>Purok *</label>
                                <select name="purok">
                                    ${puroks.map(p => `<option value="${p.purok_name}">${p.purok_name}</option>`).join('')}
                                </select>
                            </div>

                            <div class="form-group" style="grid-column: span 2;"><label>Address *</label><input type="text" name="address" required></div>
                            
                            <div class="form-group"><label>Contact Number *</label><input type="text" name="contact_number" required></div>
                            <div class="form-group"><label>Email</label><input type="email" name="email"></div>

                            <div class="form-group"><label>Occupation</label><input type="text" name="occupation"></div>
                            <div class="form-group"><label>Educational Attainment</label>
                                <select name="educational_attainment">
                                    <option value="Elementary">Elementary</option><option value="High School">High School</option>
                                    <option value="Vocational">Vocational</option><option value="College Undergraduate">College Undergraduate</option>
                                    <option value="College Graduate">College Graduate</option><option value="Post Graduate">Post Graduate</option>
                                    <option value="None">None</option>
                                </select>
                            </div>

                            <div class="form-group"><label>Voter Status</label><select name="voter_status"><option value="Yes">Yes</option><option value="No">No</option></select></div>
                            <div class="form-group"><label>Senior Citizen</label><select name="senior_citizen_status"><option value="No">No</option><option value="Yes">Yes</option></select></div>
                            <div class="form-group"><label>PWD Status</label><select name="pwd_status"><option value="No">No</option><option value="Yes">Yes</option></select></div>
                            <div class="form-group"><label>Solo Parent</label><select name="solo_parent_status"><option value="No">No</option><option value="Yes">Yes</option></select></div>
                            <div class="form-group"><label>4Ps Status</label><select name="status_4ps"><option value="No">No</option><option value="Yes">Yes</option></select></div>
                            <div class="form-group"><label>Resident Photo</label><input type="file" name="resident_photo" accept="image/*"></div>
                        </div>
                        <button type="submit" class="btn btn-success" style="margin-top: 20px;">Save Resident</button>
                        <a href="/staff/residents" class="btn btn-secondary" style="margin-top: 20px;">Cancel</a>
                    </form>
                </div>
            `;
            res.send(renderLayout('Add Resident', content, req.session.user, settings));
        });
    });
});

app.post('/staff/residents/add', upload.single('resident_photo'), (req, res) => {
    const data = req.body;
    const photo = req.file ? req.file.filename : '';
    generateResidentID((newId) => {
        db.run(`INSERT INTO residents (resident_id, first_name, middle_name, last_name, suffix, dob, gender, civil_status, address, purok, contact_number, email, occupation, educational_attainment, voter_status, senior_citizen_status, pwd_status, solo_parent_status, status_4ps, resident_photo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [newId, data.first_name, data.middle_name, data.last_name, data.suffix, data.dob, data.gender, data.civil_status, data.address, data.purok, data.contact_number, data.email, data.occupation, data.educational_attainment, data.voter_status, data.senior_citizen_status, data.pwd_status, data.solo_parent_status, data.status_4ps, photo],
                () => {
                    logActivity(req.session.user.username, `Added resident: ${newId} (${data.first_name} ${data.last_name})`, req);
                    res.redirect('/staff/residents');
                });
    });
});

app.get('/staff/residents/view/:id', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.get(`SELECT * FROM residents WHERE id = ?`, [req.params.id], (err, r) => {
            if (!r) return res.status(404).send('Resident not found');
            db.all(`SELECT * FROM certificate_requests WHERE resident_id = ?`, [r.resident_id], (err, certs) => {
                
                // Generate QR code for ID verification link
                const verifyUrl = `${req.protocol}://${req.get('host')}/verify/id/${r.resident_id}`;
                qrcode.toDataURL(verifyUrl, (err, qrCodeUrl) => {
                    
                    const content = `
                        <div class="flex-between mb-20 no-print">
                            <h1>Resident Profile: ${r.first_name} ${r.last_name}</h1>
                            <div>
                                <a href="/staff/residents/edit/${r.id}" class="btn btn-warning">Edit Profile</a>
                                <button onclick="window.print()" class="btn btn-secondary">Print ID Card</button>
                                <a href="/staff/residents" class="btn btn-secondary">Back to List</a>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
                            <div class="card" style="text-align: center;">
                                <img src="${r.resident_photo ? '/uploads/' + r.resident_photo : 'https://via.placeholder.com/150'}" alt="Resident Photo" style="width: 140px; height: 140px; border-radius: 50%; object-fit: cover; margin-bottom: 15px; border: 3px solid #2b6cb0;">
                                <h3>${r.first_name} ${r.last_name}</h3>
                                <p style="color: #718096; font-size: 0.9rem; margin-bottom: 15px;">ID: <strong>${r.resident_id}</strong></p>
                                <div style="margin: 15px auto; background: white; padding: 10px; display: inline-block; border: 1px solid #e2e8f0; border-radius: 6px;">
                                    <img src="${qrCodeUrl}" alt="QR Code" style="width: 120px; height: 120px;">
                                    <p style="font-size: 0.7rem; color: #718096; margin-top: 5px;">Scan for Official ID Verification</p>
                                </div>
                            </div>

                            <div class="card">
                                <h2>Official Information</h2>
                                <table style="margin-bottom: 20px;">
                                    <tr><th>Date of Birth</th><td>${r.dob}</td><th>Gender</th><td>${r.gender}</td></tr>
                                    <tr><th>Civil Status</th><td>${r.civil_status}</td><th>Purok</th><td>${r.purok}</td></tr>
                                    <tr><th>Complete Address</th><td colspan="3">${r.address}</td></tr>
                                    <tr><th>Contact Number</th><td>${r.contact_number}</td><th>Email</th><td>${r.email || 'N/A'}</td></tr>
                                    <tr><th>Occupation</th><td>${r.occupation || 'N/A'}</td><th>Education</th><td>${r.educational_attainment}</td></tr>
                                    <tr><th>Voter</th><td>${r.voter_status}</td><th>Senior</th><td>${r.senior_citizen_status}</td></tr>
                                    <tr><th>PWD</th><td>${r.pwd_status}</td><th>Solo Parent</th><td>${r.solo_parent_status}</td></tr>
                                    <tr><th>4Ps Beneficiary</th><td>${r.status_4ps}</td><th>Account Status</th><td><span class="badge badge-${r.account_status.toLowerCase()}">${r.account_status}</span></td></tr>
                                </table>
                            </div>
                        </div>

                        <div class="card" style="margin-top: 20px;">
                            <h2>Certificate Request History</h2>
                            <table>
                                <thead><tr><th>Request No.</th><th>Type</th><th>Purpose</th><th>Status</th><th>Date</th></tr></thead>
                                <tbody>
                                    ${certs.map(c => `
                                        <tr>
                                            <td>${c.request_number}</td>
                                            <td>${c.certificate_type}</td>
                                            <td>${c.purpose}</td>
                                            <td><span class="badge badge-${c.status.toLowerCase().replace(/\s+/g, '')}">${c.status}</span></td>
                                            <td>${c.date_requested}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `;
                    res.send(renderLayout('Resident Profile', content, req.session.user, settings));
                });
            });
        });
    });
});

app.get('/staff/residents/edit/:id', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.get(`SELECT * FROM residents WHERE id = ?`, [req.params.id], (err, r) => {
            if (!r) return res.status(404).send('Resident not found');
            db.all(`SELECT * FROM puroks`, (err, puroks) => {
                const content = `
                    <h1>Edit Resident: ${r.resident_id}</h1>
                    <div class="card">
                        <form action="/staff/residents/edit/${r.id}" method="POST" enctype="multipart/form-data">
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                <div class="form-group"><label>First Name *</label><input type="text" name="first_name" value="${r.first_name}" required></div>
                                <div class="form-group"><label>Middle Name</label><input type="text" name="middle_name" value="${r.middle_name || ''}"></div>
                                <div class="form-group"><label>Last Name *</label><input type="text" name="last_name" value="${r.last_name}" required></div>
                                <div class="form-group"><label>Suffix</label><input type="text" name="suffix" value="${r.suffix || ''}"></div>
                                
                                <div class="form-group"><label>Date of Birth *</label><input type="date" name="dob" value="${r.dob}" required></div>
                                <div class="form-group"><label>Gender *</label>
                                    <select name="gender"><option value="Male" ${r.gender === 'Male' ? 'selected' : ''}>Male</option><option value="Female" ${r.gender === 'Female' ? 'selected' : ''}>Female</option></select>
                                </div>
                                
                                <div class="form-group"><label>Civil Status *</label>
                                    <select name="civil_status">
                                        <option value="Single" ${r.civil_status === 'Single' ? 'selected' : ''}>Single</option>
                                        <option value="Married" ${r.civil_status === 'Married' ? 'selected' : ''}>Married</option>
                                        <option value="Widowed" ${r.civil_status === 'Widowed' ? 'selected' : ''}>Widowed</option>
                                        <option value="Separated" ${r.civil_status === 'Separated' ? 'selected' : ''}>Separated</option>
                                    </select>
                                </div>
                                <div class="form-group"><label>Purok *</label>
                                    <select name="purok">
                                        ${puroks.map(p => `<option value="${p.purok_name}" ${r.purok === p.purok_name ? 'selected' : ''}>${p.purok_name}</option>`).join('')}
                                    </select>
                                </div>

                                <div class="form-group" style="grid-column: span 2;"><label>Address *</label><input type="text" name="address" value="${r.address}" required></div>
                                
                                <div class="form-group"><label>Contact Number *</label><input type="text" name="contact_number" value="${r.contact_number}" required></div>
                                <div class="form-group"><label>Email</label><input type="email" name="email" value="${r.email || ''}"></div>

                                <div class="form-group"><label>Occupation</label><input type="text" name="occupation" value="${r.occupation || ''}"></div>
                                <div class="form-group"><label>Educational Attainment</label>
                                    <select name="educational_attainment">
                                        <option value="Elementary" ${r.educational_attainment === 'Elementary' ? 'selected' : ''}>Elementary</option>
                                        <option value="High School" ${r.educational_attainment === 'High School' ? 'selected' : ''}>High School</option>
                                        <option value="Vocational" ${r.educational_attainment === 'Vocational' ? 'selected' : ''}>Vocational</option>
                                        <option value="College Undergraduate" ${r.educational_attainment === 'College Undergraduate' ? 'selected' : ''}>College Undergraduate</option>
                                        <option value="College Graduate" ${r.educational_attainment === 'College Graduate' ? 'selected' : ''}>College Graduate</option>
                                        <option value="Post Graduate" ${r.educational_attainment === 'Post Graduate' ? 'selected' : ''}>Post Graduate</option>
                                        <option value="None" ${r.educational_attainment === 'None' ? 'selected' : ''}>None</option>
                                    </select>
                                </div>

                                <div class="form-group"><label>Voter Status</label><select name="voter_status"><option value="Yes" ${r.voter_status === 'Yes' ? 'selected' : ''}>Yes</option><option value="No" ${r.voter_status === 'No' ? 'selected' : ''}>No</option></select></div>
                                <div class="form-group"><label>Senior Citizen</label><select name="senior_citizen_status"><option value="No" ${r.senior_citizen_status === 'No' ? 'selected' : ''}>No</option><option value="Yes" ${r.senior_citizen_status === 'Yes' ? 'selected' : ''}>Yes</option></select></div>
                                <div class="form-group"><label>PWD Status</label><select name="pwd_status"><option value="No" ${r.pwd_status === 'No' ? 'selected' : ''}>No</option><option value="Yes" ${r.pwd_status === 'Yes' ? 'selected' : ''}>Yes</option></select></div>
                                <div class="form-group"><label>Solo Parent</label><select name="solo_parent_status"><option value="No" ${r.solo_parent_status === 'No' ? 'selected' : ''}>No</option><option value="Yes" ${r.solo_parent_status === 'Yes' ? 'selected' : ''}>Yes</option></select></div>
                                <div class="form-group"><label>4Ps Status</label><select name="status_4ps"><option value="No" ${r.status_4ps === 'No' ? 'selected' : ''}>No</option><option value="Yes" ${r.status_4ps === 'Yes' ? 'selected' : ''}>Yes</option></select></div>
                                <div class="form-group"><label>Update Photo (Leave blank to keep current)</label><input type="file" name="resident_photo" accept="image/*"></div>
                            </div>
                            <button type="submit" class="btn btn-warning" style="margin-top: 20px;">Update Resident</button>
                            <a href="/staff/residents" class="btn btn-secondary" style="margin-top: 20px;">Cancel</a>
                        </form>
                    </div>
                `;
                res.send(renderLayout('Edit Resident', content, req.session.user, settings));
            });
        });
    });
});

app.post('/staff/residents/edit/:id', upload.single('resident_photo'), (req, res) => {
    const data = req.body;
    db.get(`SELECT resident_photo FROM residents WHERE id = ?`, [req.params.id], (err, oldR) => {
        const photo = req.file ? req.file.filename : oldR.resident_photo;
        db.run(`UPDATE residents SET first_name=?, middle_name=?, last_name=?, suffix=?, dob=?, gender=?, civil_status=?, address=?, purok=?, contact_number=?, email=?, occupation=?, educational_attainment=?, voter_status=?, senior_citizen_status=?, pwd_status=?, solo_parent_status=?, status_4ps=?, resident_photo=? WHERE id=?`,
            [data.first_name, data.middle_name, data.last_name, data.suffix, data.dob, data.gender, data.civil_status, data.address, data.purok, data.contact_number, data.email, data.occupation, data.educational_attainment, data.voter_status, data.senior_citizen_status, data.pwd_status, data.solo_parent_status, data.status_4ps, photo, req.params.id],
            () => {
                logActivity(req.session.user.username, `Updated resident ID record: ${req.params.id}`, req);
                res.redirect('/staff/residents');
            });
    });
});

app.get('/staff/residents/archive/:id', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.run(`UPDATE residents SET account_status = 'Archived' WHERE id = ?`, [req.params.id], () => {
        logActivity(req.session.user.username, `Archived resident record: ${req.params.id}`, req);
        res.redirect('/staff/residents');
    });
});

app.get('/staff/residents/restore/:id', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.run(`UPDATE residents SET account_status = 'Active' WHERE id = ?`, [req.params.id], () => {
        logActivity(req.session.user.username, `Restored resident record: ${req.params.id}`, req);
        res.redirect('/staff/residents?status=Archived');
    });
});

// ==================== HOUSEHOLD & PUROK MANAGEMENT ====================

app.get('/staff/households', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT h.*, r.first_name, r.last_name FROM households h JOIN residents r ON h.head_resident_id = r.resident_id`, (err, households) => {
            db.all(`SELECT * FROM residents WHERE account_status = 'Active'`, (err, residents) => {
                db.all(`SELECT * FROM puroks`, (err, puroks) => {
                    const content = `
                        <div class="flex-between mb-20">
                            <h1>Household Management</h1>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
                            <div class="card">
                                <h2>Add Household</h2>
                                <form action="/staff/households/add" method="POST">
                                    <div class="form-group"><label>Household Number *</label><input type="text" name="household_number" required placeholder="HH-2026-001"></div>
                                    <div class="form-group"><label>Purok *</label>
                                        <select name="purok" required>
                                            ${puroks.map(p => `<option value="${p.purok_name}">${p.purok_name}</option>`).join('')}
                                        </select>
                                    </div>
                                    <div class="form-group"><label>Address *</label><input type="text" name="address" required></div>
                                    <div class="form-group"><label>Household Head *</label>
                                        <select name="head_resident_id" required>
                                            ${residents.map(r => `<option value="${r.resident_id}">${r.first_name} ${r.last_name} (${r.resident_id})</option>`).join('')}
                                        </select>
                                    </div>
                                    <button type="submit" class="btn btn-success">Create Household</button>
                                </form>
                            </div>

                            <div class="card">
                                <h2>Registered Households</h2>
                                <table>
                                    <thead><tr><th>HH Number</th><th>Purok</th><th>Address</th><th>Household Head</th><th>Action</th></tr></thead>
                                    <tbody>
                                        ${households.map(h => `
                                            <tr>
                                                <td><strong>${h.household_number}</strong></td>
                                                <td>${h.purok}</td>
                                                <td>${h.address}</td>
                                                <td>${h.first_name} ${h.last_name}</td>
                                                <td><a href="/staff/households/view/${h.id}" class="btn" style="padding: 4px 8px; font-size: 0.8rem;">View Members</a></td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                    res.send(renderLayout('Household Management', content, req.session.user, settings));
                });
            });
        });
    });
});

app.post('/staff/households/add', isAuthenticated, isStaffOrAdmin, (req, res) => {
    const data = req.body;
    db.run(`INSERT INTO households (household_number, address, purok, head_resident_id) VALUES (?, ?, ?, ?)`,
        [data.household_number, data.address, data.purok, data.head_resident_id], () => {
            logActivity(req.session.user.username, `Created household: ${data.household_number}`, req);
            res.redirect('/staff/households');
        });
});

app.get('/staff/households/view/:id', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.get(`SELECT h.*, r.first_name as head_fname, r.last_name as head_lname FROM households h JOIN residents r ON h.head_resident_id = r.resident_id WHERE h.id = ?`, [req.params.id], (err, h) => {
            db.all(`SELECT hm.*, r.first_name, r.last_name, r.gender, r.dob FROM household_members hm JOIN residents r ON hm.resident_id = r.resident_id WHERE hm.household_id = ?`, [h.id], (err, members) => {
                db.all(`SELECT * FROM residents WHERE account_status = 'Active'`, (err, allResidents) => {
                    const content = `
                        <h1>Household: ${h.household_number}</h1>
                        <p class="mb-20">Head of Family: <strong>${h.head_fname} ${h.head_lname}</strong> | Purok: ${h.purok} | Address: ${h.address}</p>
                        
                        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
                            <div class="card">
                                <h2>Family Members</h2>
                                <table>
                                    <thead><tr><th>Resident ID</th><th>Name</th><th>Relationship</th><th>Gender</th><th>Action</th></tr></thead>
                                    <tbody>
                                        ${members.map(m => `
                                            <tr>
                                                <td>${m.resident_id}</td>
                                                <td>${m.first_name} ${m.last_name}</td>
                                                <td>${m.relationship}</td>
                                                <td>${m.gender}</td>
                                                <td><a href="/staff/households/remove-member/${m.id}/${h.id}" class="btn btn-danger" style="padding: 3px 6px; font-size: 0.75rem;">Remove</a></td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>

                            <div class="card">
                                <h2>Add Member</h2>
                                <form action="/staff/households/add-member" method="POST">
                                    <input type="hidden" name="household_id" value="${h.id}">
                                    <div class="form-group"><label>Select Resident</label>
                                        <select name="resident_id" required>
                                            ${allResidents.map(ar => `<option value="${ar.resident_id}">${ar.first_name} ${ar.last_name} (${ar.resident_id})</option>`).join('')}
                                        </select>
                                    </div>
                                    <div class="form-group"><label>Relationship</label>
                                        <select name="relationship">
                                            <option value="Spouse">Spouse</option>
                                            <option value="Child">Child</option>
                                            <option value="Parent">Parent</option>
                                            <option value="Sibling">Sibling</option>
                                            Relative/Other
                                        </select>
                                    </div>
                                    <button type="submit" class="btn btn-success">Add to Household</button>
                                </form>
                            </div>
                        </div>
                    `;
                    res.send(renderLayout('Household Details', content, req.session.user, settings));
                });
            });
        });
    });
});

app.post('/staff/households/add-member', isAuthenticated, isStaffOrAdmin, (req, res) => {
    const { household_id, resident_id, relationship } = req.body;
    db.run(`INSERT INTO household_members (household_id, resident_id, relationship) VALUES (?, ?, ?)`, [household_id, resident_id, relationship], () => {
        res.redirect(`/staff/households/view/${household_id}`);
    });
});

app.get('/staff/households/remove-member/:memberId/:hhId', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.run(`DELETE FROM household_members WHERE id = ?`, [req.params.memberId], () => {
        res.redirect(`/staff/households/view/${req.params.hhId}`);
    });
});

app.get('/staff/puroks', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT p.*, (SELECT COUNT(*) FROM residents r WHERE r.purok = p.purok_name AND r.account_status = 'Active') as res_count FROM puroks p`, (err, puroks) => {
            const content = `
                <h1>Purok / Zone Management</h1>
                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
                    <div class="card">
                        <h2>Add Purok</h2>
                        <form action="/staff/puroks/add" method="POST">
                            <div class="form-group"><label>Purok Name *</label><input type="text" name="purok_name" required placeholder="Purok 1 - Maharlika"></div>
                            <div class="form-group"><label>Description</label><textarea name="description" rows="3"></textarea></div>
                            <button type="submit" class="btn btn-success">Save Purok</button>
                        </form>
                    </div>

                    <div class="card">
                        <h2>Purok Directory & Population</h2>
                        <table>
                            <thead><tr><th>Purok Name</th><th>Description</th><th>Active Residents</th></tr></thead>
                            <tbody>
                                ${puroks.map(p => `
                                    <tr>
                                        <td><strong>${p.purok_name}</strong></td>
                                        <td>${p.description || 'N/A'}</td>
                                        <td><span class="user-badge">${p.res_count} residents</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            res.send(renderLayout('Purok Management', content, req.session.user, settings));
        });
    });
});

app.post('/staff/puroks/add', isAuthenticated, isStaffOrAdmin, (req, res) => {
    const { purok_name, description } = req.body;
    db.run(`INSERT INTO puroks (purok_name, description) VALUES (?, ?)`, [purok_name, description], () => {
        logActivity(req.session.user.username, `Added Purok: ${purok_name}`, req);
        res.redirect('/staff/puroks');
    });
});

// ==================== CERTIFICATE MANAGEMENT & STAFF UPLOADS ====================

app.get('/staff/certificates', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT c.*, r.first_name, r.last_name FROM certificate_requests c JOIN residents r ON c.resident_id = r.resident_id ORDER BY c.id DESC`, (err, requests) => {
            const content = `
                <h1>Certificate Requests Management</h1>
                <div class="card">
                    <table>
                        <thead>
                            <tr>
                                <th>Req No.</th>
                                <th>Resident</th>
                                <th>Certificate Type</th>
                                <th>Purpose</th>
                                <th>Status</th>
                                <th>Requested Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${requests.map(reqItem => `
                                <tr>
                                    <td><strong>${reqItem.request_number}</strong></td>
                                    <td>${reqItem.first_name} ${reqItem.last_name}</td>
                                    <td>${reqItem.certificate_type}</td>
                                    <td>${reqItem.purpose}</td>
                                    <td><span class="badge badge-${reqItem.status.toLowerCase().replace(/\s+/g, '')}">${reqItem.status}</span></td>
                                    <td>${reqItem.date_requested}</td>
                                    <td>
                                        <a href="/staff/certificates/process/${reqItem.id}" class="btn" style="padding: 4px 8px; font-size: 0.8rem;">Process / Upload</a>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            res.send(renderLayout('Certificate Requests', content, req.session.user, settings));
        });
    });
});

app.get('/staff/certificates/process/:id', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.get(`SELECT c.*, r.first_name, r.last_name, r.address, r.purok FROM certificate_requests c JOIN residents r ON c.resident_id = r.resident_id WHERE c.id = ?`, [req.params.id], (err, reqItem) => {
            if (!reqItem) return res.status(404).send('Request not found');
            const content = `
                <h1>Process Request: ${reqItem.request_number}</h1>
                <div class="card">
                    <p><strong>Resident:</strong> ${reqItem.first_name} ${reqItem.last_name} (${reqItem.resident_id})</p>
                    <p><strong>Certificate Type:</strong> ${reqItem.certificate_type}</p>
                    <p><strong>Purpose:</strong> ${reqItem.purpose}</p>
                    <p><strong>Additional Info:</strong> ${reqItem.additional_info || 'None'}</p>
                    <p><strong>Current Status:</strong> <span class="badge badge-${reqItem.status.toLowerCase().replace(/\s+/g, '')}">${reqItem.status}</span></p>
                    ${reqItem.uploaded_file ? `<p><strong>Uploaded File:</strong> <a href="/uploads/${reqItem.uploaded_file}" target="_blank" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;">Download Current File</a></p>` : ''}
                    
                    <form action="/staff/certificates/process/${reqItem.id}" method="POST" enctype="multipart/form-data" style="margin-top: 20px;">
                        <div class="form-group"><label>Update Status</label>
                            <select name="status" required>
                                <option value="Pending" ${reqItem.status === 'Pending' ? 'selected' : ''}>Pending</option>
                                <option value="Processing" ${reqItem.status === 'Processing' ? 'selected' : ''}>Processing</option>
                                <option value="Approved" ${reqItem.status === 'Approved' ? 'selected' : ''}>Approved</option>
                                <option value="Ready for Release" ${reqItem.status === 'Ready for Release' ? 'selected' : ''}>Ready for Release</option>
                                <option value="Released" ${reqItem.status === 'Released' ? 'selected' : ''}>Released</option>
                                <option value="Rejected" ${reqItem.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
                            </select>
                        </div>
                        <div class="form-group"><label>Staff Remarks</label><textarea name="remarks" rows="3">${reqItem.remarks || ''}</textarea></div>
                        <div class="form-group"><label>Upload Official Certificate File (PDF / Image)</label><input type="file" name="certificate_file" accept=".pdf,image/*"></div>
                        <button type="submit" class="btn btn-success">Save & Process Request</button>
                        <a href="/staff/certificates" class="btn btn-secondary">Back</a>
                    </form>
                </div>
            `;
            res.send(renderLayout('Process Certificate', content, req.session.user, settings));
        });
    });
});

app.post('/staff/certificates/process/:id', upload.single('certificate_file'), (req, res) => {
    const { status, remarks } = req.body;
    db.get(`SELECT uploaded_file, resident_id FROM certificate_requests WHERE id = ?`, [req.params.id], (err, oldReq) => {
        const file = req.file ? req.file.filename : oldReq.uploaded_file;
        const now = new Date().toISOString();
        db.run(`UPDATE certificate_requests SET status = ?, remarks = ?, uploaded_file = ?, date_processed = ?, processed_by = ? WHERE id = ?`,
            [status, remarks, file, now, req.session.user.username, req.params.id], () => {
                sendNotification(oldReq.resident_id, `Your certificate request status has been updated to: ${status}`);
                logActivity(req.session.user.username, `Processed certificate request ID ${req.params.id} as ${status}`, req);
                res.redirect('/staff/certificates');
            });
    });
});

// ==================== PHYSICAL ID BATCH PRINTING (8 IDS PER PAGE) ====================

app.get('/staff/id-printing', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM residents WHERE account_status = 'Active' ORDER BY last_name ASC`, (err, residents) => {
            const content = `
                <div class="flex-between mb-20 no-print">
                    <h1>Barangay Resident ID - Batch Printing</h1>
                    <button onclick="window.print()" class="btn btn-success">🖨️ Print 8 IDs on Page</button>
                </div>
                <p class="no-print" style="color: #718096; margin-bottom: 20px;">Optimized print view renders 8 standard ID cards per 8.5 x 11 inch Bond Paper page.</p>

                <div class="print-container" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; max-width: 900px; margin: 0 auto;">
                    ${residents.map((r, index) => `
                        <div style="border: 2px solid #1b365d; border-radius: 8px; padding: 12px; background: white; width: 325px; height: 195px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden; page-break-inside: avoid;">
                            <div style="display: flex; align-items: center; gap: 8px; border-bottom: 2px solid #1b365d; padding-bottom: 5px;">
                                <img src="${settings.logo ? '/uploads/' + settings.logo : 'https://via.placeholder.com/35'}" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover;">
                                <div>
                                    <h4 style="font-size: 0.75rem; color: #1b365d; line-height: 1;">${settings.barangay_name}</h4>
                                    <p style="font-size: 0.6rem; color: #4a5568;">${settings.municipality}, ${settings.province}</p>
                                </div>
                            </div>
                            <div style="display: flex; gap: 10px; align-items: center; margin-top: 5px;">
                                <img src="${r.resident_photo ? '/uploads/' + r.resident_photo : 'https://via.placeholder.com/80'}" style="width: 65px; height: 75px; object-fit: cover; border: 1px solid #cbd5e0; border-radius: 4px;">
                                <div style="font-size: 0.75rem; line-height: 1.3;">
                                    <strong style="font-size: 0.85rem; color: #1b365d; display: block; margin-bottom: 2px;">${r.last_name}, ${r.first_name} ${r.middle_name ? r.middle_name[0] + '.' : ''}</strong>
                                    <span>ID No: <strong>${r.resident_id}</strong></span><br>
                                    <span>Address: ${r.purok}, ${r.address}</span><br>
                                    <span>DOB: ${r.dob}</span>
                                </div>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #e2e8f0; pt-2; font-size: 0.6rem;">
                                <div>
                                    <span style="font-weight: 700; color: #2b6cb0;">OFFICIAL RESIDENT ID</span><br>
                                    <span>Emergency: ${settings.contact_number}</span>
                                </div>
                                <div style="text-align: center;">
                                    <div style="border-bottom: 1px solid #2d3748; width: 90px; margin-bottom: 2px;"></div>
                                    <span style="font-size: 0.55rem; font-weight: bold;">${settings.captain_name}</span><br>
                                    <span style="font-size: 0.5rem; color: #718096;">Punong Barangay</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            res.send(renderLayout('ID Batch Printing', content, req.session.user, settings));
        });
    });
});

// ==================== APPOINTMENTS, COMPLAINTS, BLOTTERS, ASSISTANCE ====================

app.get('/staff/appointments', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT a.*, r.first_name, r.last_name, r.contact_number FROM appointments a JOIN residents r ON a.resident_id = r.resident_id ORDER BY a.id DESC`, (err, appts) => {
            const content = `
                <h1>Appointments Management</h1>
                <div class="card">
                    <table>
                        <thead><tr><th>Resident</th><th>Service</th><th>Date & Time</th><th>Purpose</th><th>Status</th><th>Action</th></tr></thead>
                        <tbody>
                            ${appts.map(a => `
                                <tr>
                                    <td>${a.first_name} ${a.last_name}</td>
                                    <td><strong>${a.service}</strong></td>
                                    <td>${a.appointment_date} ${a.appointment_time}</td>
                                    <td>${a.purpose}</td>
                                    <td><span class="badge badge-${a.status.toLowerCase()}">${a.status}</span></td>
                                    <td>
                                        <a href="/staff/appointments/status/${a.id}/Approved" class="btn btn-success" style="padding: 3px 6px; font-size: 0.75rem;">Approve</a>
                                        <a href="/staff/appointments/status/${a.id}/Completed" class="btn" style="padding: 3px 6px; font-size: 0.75rem;">Complete</a>
                                        <a href="/staff/appointments/status/${a.id}/Rejected" class="btn btn-danger" style="padding: 3px 6px; font-size: 0.75rem;">Reject</a>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            res.send(renderLayout('Appointments', content, req.session.user, settings));
        });
    });
});

app.get('/staff/appointments/status/:id/:status', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.run(`UPDATE appointments SET status = ? WHERE id = ?`, [req.params.status, req.params.id], () => {
        res.redirect('/staff/appointments');
    });
});

app.get('/staff/complaints', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT c.*, r.first_name, r.last_name FROM complaints c JOIN residents r ON c.resident_id = r.resident_id ORDER BY c.id DESC`, (err, complaints) => {
            const content = `
                <h1>Community Complaints & Concerns</h1>
                <div class="card">
                    <table>
                        <thead><tr><th>Resident</th><th>Type</th><th>Incident Date</th><th>Location</th><th>Description</th><th>Status</th><th>Action</th></tr></thead>
                        <tbody>
                            ${complaints.map(c => `
                                <tr>
                                    <td>${c.first_name} ${c.last_name}</td>
                                    <td><strong>${c.concern_type}</strong></td>
                                    <td>${c.incident_date}</td>
                                    <td>${c.location}</td>
                                    <td>${c.description}</td>
                                    <td><span class="badge badge-${c.status.toLowerCase().replace(/\s+/g, '')}">${c.status}</span></td>
                                    <td>
                                        <a href="/staff/complaints/status/${c.id}/Investigating" class="btn btn-warning" style="padding: 3px 6px; font-size: 0.75rem;">Investigate</a>
                                        <a href="/staff/complaints/status/${c.id}/Resolved" class="btn btn-success" style="padding: 3px 6px; font-size: 0.75rem;">Resolve</a>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            res.send(renderLayout('Complaints', content, req.session.user, settings));
        });
    });
});

app.get('/staff/complaints/status/:id/:status', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.run(`UPDATE complaints SET status = ? WHERE id = ?`, [req.params.status, req.params.id], () => {
        res.redirect('/staff/complaints');
    });
});

app.get('/staff/blotter', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM blotter_cases ORDER BY id DESC`, (err, cases) => {
            const content = `
                <div class="flex-between mb-20">
                    <h1>Blotter & Incident Records</h1>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
                    <div class="card">
                        <h2>File New Blotter Case</h2>
                        <form action="/staff/blotter/add" method="POST">
                            <div class="form-group"><label>Case Number *</label><input type="text" name="case_number" required placeholder="BLT-2026-001"></div>
                            <div class="form-group"><label>Complainant *</label><input type="text" name="complainant" required></div>
                            <div class="form-group"><label>Respondent *</label><input type="text" name="respondent" required></div>
                            <div class="form-group"><label>Incident Date *</label><input type="date" name="incident_date" required></div>
                            <div class="form-group"><label>Incident Time *</label><input type="time" name="incident_time" required></div>
                            <div class="form-group"><label>Location *</label><input type="text" name="location" required></div>
                            <div class="form-group"><label>Description *</label><textarea name="description" rows="3" required></textarea></div>
                            <div class="form-group"><label>Witnesses</label><input type="text" name="witnesses"></div>
                            <button type="submit" class="btn btn-success">File Blotter Case</button>
                        </form>
                    </div>

                    <div class="card">
                        <h2>Blotter Records</h2>
                        <table>
                            <thead><tr><th>Case No.</th><th>Complainant vs Respondent</th><th>Date</th><th>Location</th><th>Status</th><th>Action</th></tr></thead>
                            <tbody>
                                ${cases.map(b => `
                                    <tr>
                                        <td><strong>${b.case_number}</strong></td>
                                        <td>${b.complainant} vs ${b.respondent}</td>
                                        <td>${b.incident_date}</td>
                                        <td>${b.location}</td>
                                        <td><span class="badge badge-${b.status.toLowerCase().replace(/\s+/g, '')}">${b.status}</span></td>
                                        <td><a href="/staff/blotter/settle/${b.id}" class="btn btn-success" style="padding: 3px 6px; font-size: 0.75rem;">Mark Settled</a></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            res.send(renderLayout('Blotter Management', content, req.session.user, settings));
        });
    });
});

app.post('/staff/blotter/add', isAuthenticated, isStaffOrAdmin, (req, res) => {
    const d = req.body;
    db.run(`INSERT INTO blotter_cases (case_number, complainant, respondent, incident_date, incident_time, location, description, witnesses) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.case_number, d.complainant, d.respondent, d.incident_date, d.incident_time, d.location, d.description, d.witnesses], () => {
            logActivity(req.session.user.username, `Filed blotter case: ${d.case_number}`, req);
            res.redirect('/staff/blotter');
        });
});

app.get('/staff/blotter/settle/:id', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.run(`UPDATE blotter_cases SET status = 'Settled' WHERE id = ?`, [req.params.id], () => {
        res.redirect('/staff/blotter');
    });
});

app.get('/staff/assistance', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT a.*, r.first_name, r.last_name FROM assistance_requests a JOIN residents r ON a.resident_id = r.resident_id ORDER BY a.id DESC`, (err, reqs) => {
            const content = `
                <h1>Financial & Social Assistance Requests</h1>
                <div class="card">
                    <table>
                        <thead><tr><th>Resident</th><th>Assistance Type</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead>
                        <tbody>
                            ${reqs.map(ar => `
                                <tr>
                                    <td>${ar.first_name} ${ar.last_name}</td>
                                    <td><strong>${ar.assistance_type}</strong></td>
                                    <td>${ar.reason}</td>
                                    <td><span class="badge badge-${ar.status.toLowerCase()}">${ar.status}</span></td>
                                    <td>
                                        <a href="/staff/assistance/status/${ar.id}/Approved" class="btn btn-success" style="padding: 3px 6px; font-size: 0.75rem;">Approve</a>
                                        <a href="/staff/assistance/status/${ar.id}/Released" class="btn" style="padding: 3px 6px; font-size: 0.75rem;">Release</a>
                                        <a href="/staff/assistance/status/${ar.id}/Rejected" class="btn btn-danger" style="padding: 3px 6px; font-size: 0.75rem;">Reject</a>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            res.send(renderLayout('Assistance Requests', content, req.session.user, settings));
        });
    });
});

app.get('/staff/assistance/status/:id/:status', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.run(`UPDATE assistance_requests SET status = ? WHERE id = ?`, [req.params.status, req.params.id], () => {
        res.redirect('/staff/assistance');
    });
});

app.get('/staff/businesses', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM businesses`, (err, biz) => {
            const content = `
                <div class="flex-between mb-20">
                    <h1>Local Business Permit Management</h1>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
                    <div class="card">
                        <h2>Register Business</h2>
                        <form action="/staff/businesses/add" method="POST">
                            <div class="form-group"><label>Business Name *</label><input type="text" name="business_name" required></div>
                            <div class="form-group"><label>Owner Name *</label><input type="text" name="owner_name" required></div>
                            <div class="form-group"><label>Purok *</label><input type="text" name="purok" required></div>
                            <div class="form-group"><label>Address *</label><input type="text" name="address" required></div>
                            <div class="form-group"><label>Business Type *</label><input type="text" name="business_type" required placeholder="Retail, Food, etc."></div>
                            <div class="form-group"><label>Contact Number *</label><input type="text" name="contact_number" required></div>
                            <div class="form-group"><label>Permit Number *</label><input type="text" name="permit_number" required placeholder="BP-2026-001"></div>
                            <div class="form-group"><label>Expiration Date *</label><input type="date" name="expiration_date" required></div>
                            <button type="submit" class="btn btn-success">Register Business</button>
                        </form>
                    </div>

                    <div class="card">
                        <h2>Registered Businesses</h2>
                        <table>
                            <thead><tr><th>Permit No.</th><th>Business Name</th><th>Owner</th><th>Type</th><th>Status</th><th>Expires</th></tr></thead>
                            <tbody>
                                ${biz.map(b => `
                                    <tr>
                                        <td><strong>${b.permit_number}</strong></td>
                                        <td>${b.business_name}</td>
                                        <td>${b.owner_name}</td>
                                        <td>${b.business_type}</td>
                                        <td><span class="badge badge-active">${b.permit_status}</span></td>
                                        <td>${b.expiration_date}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            res.send(renderLayout('Business Management', content, req.session.user, settings));
        });
    });
});

app.post('/staff/businesses/add', isAuthenticated, isStaffOrAdmin, (req, res) => {
    const d = req.body;
    db.run(`INSERT INTO businesses (business_name, owner_name, address, purok, business_type, contact_number, permit_number, expiration_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.business_name, d.owner_name, d.address, d.purok, d.business_type, d.contact_number, d.permit_number, d.expiration_date], () => {
            res.redirect('/staff/businesses');
        });
});

app.get('/staff/announcements', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM announcements ORDER BY id DESC`, (err, ann) => {
            const content = `
                <div class="flex-between mb-20">
                    <h1>Barangay Announcements</h1>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
                    <div class="card">
                        <h2>Post Announcement</h2>
                        <form action="/staff/announcements/add" method="POST">
                            <div class="form-group"><label>Title *</label><input type="text" name="title" required></div>
                            <div class="form-group"><label>Priority</label>
                                <select name="priority"><option value="Normal">Normal</option><option value="Important">Important</option><option value="Emergency">Emergency</option></select>
                            </div>
                            <div class="form-group"><label>Expiration Date *</label><input type="date" name="expiration_date" required></div>
                            <div class="form-group"><label>Description *</label><textarea name="description" rows="4" required></textarea></div>
                            <button type="submit" class="btn btn-success">Publish Announcement</button>
                        </form>
                    </div>
                    <div class="card">
                        <h2>Published Announcements</h2>
                        <table>
                            <thead><tr><th>Title</th><th>Priority</th><th>Expires</th><th>Action</th></tr></thead>
                            <tbody>
                                ${ann.map(a => `
                                    <tr>
                                        <td><strong>${a.title}</strong><br><small>${a.description.substring(0, 50)}...</small></td>
                                        <td><span class="badge badge-${a.priority.toLowerCase() === 'emergency' ? 'rejected' : 'approved'}">${a.priority}</span></td>
                                        <td>${a.expiration_date}</td>
                                        <td><a href="/staff/announcements/delete/${a.id}" class="btn btn-danger" style="padding: 3px 6px; font-size: 0.75rem;">Delete</a></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            res.send(renderLayout('Announcements', content, req.session.user, settings));
        });
    });
});

app.post('/staff/announcements/add', isAuthenticated, isStaffOrAdmin, (req, res) => {
    const d = req.body;
    db.run(`INSERT INTO announcements (title, description, priority, expiration_date) VALUES (?, ?, ?, ?)`, [d.title, d.description, d.priority, d.expiration_date], () => {
        res.redirect('/staff/announcements');
    });
});

app.get('/staff/announcements/delete/:id', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.run(`DELETE FROM announcements WHERE id = ?`, [req.params.id], () => {
        res.redirect('/staff/announcements');
    });
});

app.get('/staff/reports', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM residents WHERE account_status = 'Active'`, (err, residents) => {
            const content = `
                <div class="flex-between mb-20 no-print">
                    <h1>Official Barangay Reports</h1>
                    <button onclick="window.print()" class="btn btn-success">🖨️ Print Report</button>
                </div>
                <div class="card">
                    <h2>Master Resident Population Report</h2>
                    <p style="color: #718096; margin-bottom: 15px;">Total Active Residents: <strong>${residents.length}</strong></p>
                    <table>
                        <thead><tr><th>ID</th><th>Full Name</th><th>Gender</th><th>Purok</th><th>Voter</th><th>Senior</th><th>PWD</th></tr></thead>
                        <tbody>
                            ${residents.map(r => `
                                <tr>
                                    <td>${r.resident_id}</td>
                                    <td>${r.last_name},${r.first_name}</td>
                                    <td>${r.gender}</td>
                                    <td>${r.purok}</td>
                                    <td>${r.voter_status}</td>
                                    <td>${r.senior_citizen_status}</td>
                                    <td>${r.pwd_status}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            res.send(renderLayout('Reports', content, req.session.user, settings));
        });
    });
});

app.get('/staff/activity-logs', isAuthenticated, isStaffOrAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM activity_logs ORDER BY id DESC LIMIT 100`, (err, logs) => {
            const content = `
                <h1>System Activity Logs</h1>
                <div class="card">
                    <table>
                        <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>IP Address</th></tr></thead>
                        <tbody>
                            ${logs.map(l => `
                                <tr>
                                    <td>${l.created_at}</td>
                                    <td><strong>${l.username}</strong></td>
                                    <td>${l.action}</td>
                                    <td>${l.ip_address}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            res.send(renderLayout('Activity Logs', content, req.session.user, settings));
        });
    });
});

// ==================== ADMIN SETTINGS & USER MANAGEMENT ====================

app.get('/staff/settings', isAuthenticated, isAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        const content = `
            <h1>Barangay Settings & Configuration</h1>
            <div class="card">
                <form action="/staff/settings" method="POST" enctype="multipart/form-data">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group"><label>Barangay Name *</label><input type="text" name="barangay_name" value="${settings.barangay_name}" required></div>
                        <div class="form-group"><label>Municipality / City *</label><input type="text" name="municipality" value="${settings.municipality}" required></div>
                        <div class="form-group"><label>Province *</label><input type="text" name="province" value="${settings.province}" required></div>
                        <div class="form-group"><label>Region *</label><input type="text" name="region" value="${settings.region}" required></div>
                        
                        <div class="form-group" style="grid-column: span 2;"><label>Complete Address *</label><input type="text" name="address" value="${settings.address}" required></div>
                        
                        <div class="form-group"><label>Contact Number *</label><input type="text" name="contact_number" value="${settings.contact_number}" required></div>
                        <div class="form-group"><label>Email Address *</label><input type="email" name="email" value="${settings.email}" required></div>

                        <div class="form-group"><label>Punong Barangay (Captain Name) *</label><input type="text" name="captain_name" value="${settings.captain_name}" required></div>
                        <div class="form-group"><label>Barangay Secretary Name *</label><input type="text" name="secretary_name" value="${settings.secretary_name}" required></div>

                        <div class="form-group"><label>Barangay Logo</label><input type="file" name="logo" accept="image/*"></div>
                        <div>
                            ${settings.logo ? `<img src="/uploads/${settings.logo}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-top: 5px;">` : 'No logo uploaded'}
                        </div>
                    </div>
                    <button type="submit" class="btn btn-success" style="margin-top: 20px;">Save Settings</button>
                </form>
            </div>
        `;
        res.send(renderLayout('Barangay Settings', content, req.session.user, settings));
    });
});

app.post('/staff/settings', isAuthenticated, isAdmin, upload.single('logo'), (req, res) => {
    const d = req.body;
    db.get(`SELECT logo FROM barangay_settings LIMIT 1`, (err, oldS) => {
        const logo = req.file ? req.file.filename : oldS.logo;
        db.run(`UPDATE barangay_settings SET barangay_name=?, municipality=?, province=?, region=?, address=?, contact_number=?, email=?, captain_name=?, secretary_name=?, logo=?`,
            [d.barangay_name, d.municipality, d.province, d.region, d.address, d.contact_number, d.email, d.captain_name, d.secretary_name, logo], () => {
                logActivity(req.session.user.username, 'Updated Barangay Settings', req);
                res.redirect('/staff/settings');
            });
    });
});

app.get('/staff/users', isAuthenticated, isAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM users`, (err, users) => {
            const content = `
                <div class="flex-between mb-20">
                    <h1>User Management & Accounts</h1>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
                    <div class="card">
                        <h2>Create Staff Account</h2>
                        <form action="/staff/users/add" method="POST">
                            <div class="form-group"><label>Username / Email *</label><input type="text" name="username" required></div>
                            <div class="form-group"><label>Password *</label><input type="password" name="password" required></div>
                            <div class="form-group"><label>Role *</label>
                                <select name="role"><option value="Staff">Staff</option><option value="Admin">Admin</option></select>
                            </div>
                            <button type="submit" class="btn btn-success">Create Account</button>
                        </form>
                    </div>

                    <div class="card">
                        <h2>System Users</h2>
                        <table>
                            <thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Resident ID</th><th>Action</th></tr></thead>
                            <tbody>
                                ${users.map(u => `
                                    <tr>
                                        <td><strong>${u.username}</strong></td>
                                        <td><span class="user-badge">${u.role}</span></td>
                                        <td><span class="badge badge-${u.status.toLowerCase()}">${u.status}</span></td>
                                        <td>${u.resident_id || 'N/A'}</td>
                                        <td>
                                            ${u.status === 'Pending' ? `<a href="/staff/users/approve/${u.id}" class="btn btn-success" style="padding: 3px 6px; font-size: 0.75rem;">Approve</a>` : ''}
                                            <a href="/staff/users/toggle/${u.id}" class="btn btn-warning" style="padding: 3px 6px; font-size: 0.75rem;">Toggle Status</a>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            res.send(renderLayout('User Management', content, req.session.user, settings));
        });
    });
});

app.post('/staff/users/add', isAuthenticated, isAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO users (username, password, role, status) VALUES (?, ?, ?, 'Active')`, [username, hashed, role], () => {
        res.redirect('/staff/users');
    });
});

app.get('/staff/users/approve/:id', isAuthenticated, isAdmin, (req, res) => {
    db.run(`UPDATE users SET status = 'Active' WHERE id = ?`, [req.params.id], () => {
        res.redirect('/staff/users');
    });
});

app.get('/staff/users/toggle/:id', isAuthenticated, isAdmin, (req, res) => {
    db.get(`SELECT status FROM users WHERE id = ?`, [req.params.id], (err, u) => {
        const newStatus = u.status === 'Active' ? 'Inactive' : 'Active';
        db.run(`UPDATE users SET status = ? WHERE id = ?`, [newStatus, req.params.id], () => {
            res.redirect('/staff/users');
        });
    });
});

// ==================== RESIDENT PORTAL ====================

app.get('/resident/dashboard', isAuthenticated, isResident, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.get(`SELECT * FROM residents WHERE resident_id = ?`, [req.session.user.resident_id], (err, r) => {
            if (!r) return res.status(404).send('Resident record not found');
            db.all(`SELECT * FROM announcements ORDER BY id DESC LIMIT 3`, (err, announcements) => {
                db.all(`SELECT * FROM certificate_requests WHERE resident_id = ? ORDER BY id DESC`, [r.resident_id], (err, requests) => {
                    const content = `
                        <h1>Resident Portal Dashboard</h1>
                        <p class="mb-20" style="color: #718096;">Welcome back, <strong>${r.first_name} ${r.last_name}</strong>! Resident ID: ${r.resident_id}</p>
                        
                        <div class="grid-stats">
                            <div class="stat-card"><h3>My Resident ID</h3><div class="number" style="font-size: 1.2rem;">${r.resident_id}</div></div>
                            <div class="stat-card" style="border-left-color: #319795;"><h3>Purok</h3><div class="number" style="font-size: 1.2rem;">${r.purok}</div></div>
                            <div class="stat-card" style="border-left-color: #d69e2e;"><h3>Certificate Requests</h3><div class="number">${requests.length}</div></div>
                            <div class="stat-card" style="border-left-color: #38a169;"><h3>Account Status</h3><div class="number" style="font-size: 1.2rem;">${r.account_status}</div></div>
                        </div>

                        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
                            <div class="card">
                                <h2>Recent Certificate Requests</h2>
                                <table>
                                    <thead><tr><th>Request No.</th><th>Type</th><th>Status</th><th>Date</th></tr></thead>
                                    <tbody>
                                        ${requests.slice(0, 5).map(reqItem => `
                                            <tr>
                                                <td>${reqItem.request_number}</td>
                                                <td>${reqItem.certificate_type}</td>
                                                <td><span class="badge badge-${reqItem.status.toLowerCase().replace(/\s+/g, '')}">${reqItem.status}</span></td>
                                                <td>${reqItem.date_requested}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>

                            <div class="card">
                                <h2>Barangay Announcements</h2>
                                ${announcements.map(a => `
                                    <div style="padding: 10px 0; border-bottom: 1px solid #edf2f7;">
                                        <strong>${a.title}</strong><br>
                                        <p style="font-size: 0.8rem; color: #4a5568;">${a.description}</p>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                    res.send(renderLayout('Resident Dashboard', content, req.session.user, settings));
                });
            });
        });
    });
});

app.get('/resident/profile', isAuthenticated, isResident, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.get(`SELECT * FROM residents WHERE resident_id = ?`, [req.session.user.resident_id], (err, r) => {
            const verifyUrl = `${req.protocol}://${req.get('host')}/verify/id/${r.resident_id}`;
            qrcode.toDataURL(verifyUrl, (err, qrCodeUrl) => {
                const content = `
                    <h1>My Digital Resident ID & Profile</h1>
                    <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
                        <div class="card" style="text-align: center; background: #1b365d; color: white;">
                            <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 15px;">
                                <img src="${settings.logo ? '/uploads/' + settings.logo : 'https://via.placeholder.com/40'}" style="width: 40px; height: 40px; border-radius: 50%;">
                                <div style="text-align: left;">
                                    <h4 style="font-size: 0.85rem;">${settings.barangay_name}</h4>
                                    <p style="font-size: 0.65rem; color: #cbd5e0;">Official Digital ID</p>
                                </div>
                            </div>
                            <img src="${r.resident_photo ? '/uploads/' + r.resident_photo : 'https://via.placeholder.com/120'}" style="width: 110px; height: 120px; border-radius: 6px; object-fit: cover; border: 3px solid white; margin-bottom: 10px;">
                            <h3 style="font-size: 1.1rem;">${r.first_name} ${r.last_name}</h3>
                            <p style="font-size: 0.85rem; color: #63b3ed; margin-bottom: 10px;">ID: ${r.resident_id}</p>
                            <div style="background: white; padding: 10px; display: inline-block; border-radius: 6px;">
                                <img src="${qrCodeUrl}" style="width: 130px; height: 130px;">
                            </div>
                            <p style="font-size: 0.65rem; color: #a0aec0; margin-top: 8px;">Scan for official verification</p>
                        </div>

                        <div class="card">
                            <h2>My Official Details</h2>
                            <table>
                                <tr><th>Date of Birth</th><td>${r.dob}</td><th>Gender</th><td>${r.gender}</td></tr>
                                <tr><th>Civil Status</th><td>${r.civil_status}</td><th>Purok</th><td>${r.purok}</td></tr>
                                <tr><th>Address</th><td colspan="3">${r.address}</td></tr>
                                <tr><th>Contact</th><td>${r.contact_number}</td><th>Email</th><td>${r.email}</td></tr>
                                <tr><th>Occupation</th><td>${r.occupation || 'N/A'}</td><th>Voter</th><td>${r.voter_status}</td></tr>
                                <tr><th>Senior Citizen</th><td>${r.senior_citizen_status}</td><th>PWD</th><td>${r.pwd_status}</td></tr>
                            </table>
                        </div>
                    </div>
                `;
                res.send(renderLayout('My Digital ID', content, req.session.user, settings));
            });
        });
    });
});

app.get('/resident/certificates', isAuthenticated, isResident, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM certificate_requests WHERE resident_id = ? ORDER BY id DESC`, [req.session.user.resident_id], (err, requests) => {
            const content = `
                <div class="flex-between mb-20">
                    <h1>My Certificate Requests</h1>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
                    <div class="card">
                        <h2>Request New Certificate</h2>
                        <form action="/resident/certificates/request" method="POST">
                            <div class="form-group"><label>Certificate Type *</label>
                                <select name="certificate_type" required>
                                    <option value="Barangay Clearance">Barangay Clearance</option>
                                    <option value="Certificate of Residency">Certificate of Residency</option>
                                    <option value="Certificate of Indigency">Certificate of Indigency</option>
                                    <option value="Certificate of Good Moral Character">Certificate of Good Moral Character</option>
                                    <option value="Certificate of No Income">Certificate of No Income</option>
                                    <option value="Certificate of Solo Parent">Certificate of Solo Parent</option>
                                    <option value="Other Barangay Certificate">Other Barangay Certificate</option>
                                </select>
                            </div>
                            <div class="form-group"><label>Purpose *</label><input type="text" name="purpose" required placeholder="Employment, Bank, etc."></div>
                            <div class="form-group"><label>Additional Information</label><textarea name="additional_info" rows="3"></textarea></div>
                            <button type="submit" class="btn btn-success">Submit Request</button>
                        </form>
                    </div>

                    <div class="card">
                        <h2>Request Tracking History</h2>
                        <table>
                            <thead><tr><th>Request No.</th><th>Type</th><th>Status</th><th>Staff Remarks</th><th>File Download</th></tr></thead>
                            <tbody>
                                ${requests.map(reqItem => `
                                    <tr>
                                        <td><strong>${reqItem.request_number}</strong></td>
                                        <td>${reqItem.certificate_type}</td>
                                        <td><span class="badge badge-${reqItem.status.toLowerCase().replace(/\s+/g, '')}">${reqItem.status}</span></td>
                                        <td>${reqItem.remarks || 'None'}</td>
                                        <td>
                                            ${reqItem.uploaded_file ? `<a href="/uploads/${reqItem.uploaded_file}" target="_blank" class="btn" style="padding: 3px 6px; font-size: 0.75rem;">Download</a>` : 'Processing'}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            res.send(renderLayout('Certificate Requests', content, req.session.user, settings));
        });
    });
});

app.post('/resident/certificates/request', isAuthenticated, isResident, (req, res) => {
    const { certificate_type, purpose, additional_info } = req.body;
    const reqNo = 'REQ-' + Date.now().toString().slice(-6);
    db.run(`INSERT INTO certificate_requests (request_number, resident_id, certificate_type, purpose, additional_info) VALUES (?, ?, ?, ?, ?)`,
        [reqNo, req.session.user.resident_id, certificate_type, purpose, additional_info], () => {
            res.redirect('/resident/certificates');
        });
});

app.get('/resident/appointments', isAuthenticated, isResident, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM appointments WHERE resident_id = ? ORDER BY id DESC`, [req.session.user.resident_id], (err, appts) => {
            const content = `
                <div class="flex-between mb-20">
                    <h1>My Appointments</h1>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
                    <div class="card">
                        <h2>Book Appointment</h2>
                        <form action="/resident/appointments/book" method="POST">
                            <div class="form-group"><label>Service *</label>
                                <select name="service" required>
                                    <option value="Consultation with Captain">Consultation with Captain</option>
                                    <option value="Blotter / Conciliation Hearing">Blotter / Conciliation Hearing</option>
                                    <option value="Social Welfare Assistance">Social Welfare Assistance</option>
                                    <option value="Business Permit Consultation">Business Permit Consultation</option>
                                </select>
                            </div>
                            <div class="form-group"><label>Date *</label><input type="date" name="appointment_date" required></div>
                            <div class="form-group"><label>Time *</label><input type="time" name="appointment_time" required></div>
                            <div class="form-group"><label>Purpose *</label><input type="text" name="purpose" required></div>
                            <button type="submit" class="btn btn-success">Book Appointment</button>
                        </form>
                    </div>

                    <div class="card">
                        <h2>Appointment History</h2>
                        <table>
                            <thead><tr><th>Service</th><th>Date & Time</th><th>Purpose</th><th>Status</th></tr></thead>
                            <tbody>
                                ${appts.map(a => `
                                    <tr>
                                        <td><strong>${a.service}</strong></td>
                                        <td>${a.appointment_date}${a.appointment_time}</td>
                                        <td>${a.purpose}</td>
                                        <td><span class="badge badge-${a.status.toLowerCase()}">${a.status}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            res.send(renderLayout('Appointments', content, req.session.user, settings));
        });
    });
});

app.post('/resident/appointments/book', isAuthenticated, isResident, (req, res) => {
    const d = req.body;
    db.run(`INSERT INTO appointments (resident_id, service, appointment_date, appointment_time, purpose) VALUES (?, ?, ?, ?, ?)`,
        [req.session.user.resident_id, d.service, d.appointment_date, d.appointment_time, d.purpose], () => {
            res.redirect('/resident/appointments');
        });
});

app.get('/resident/complaints', isAuthenticated, isResident, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM complaints WHERE resident_id = ? ORDER BY id DESC`, [req.session.user.resident_id], (err, comps) => {
            const content = `
                <div class="flex-between mb-20">
                    <h1>My Complaints & Community Reports</h1>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
                    <div class="card">
                        <h2>Submit Concern</h2>
                        <form action="/resident/complaints/add" method="POST">
                            <div class="form-group"><label>Concern Type *</label>
                                <select name="concern_type" required>
                                    <option value="Noise Disturbance">Noise Disturbance</option>
                                    <option value="Garbage Collection">Garbage Collection</option>
                                    <option value="Public Safety Hazard">Public Safety Hazard</option>
                                    <option value="Neighborhood Dispute">Neighborhood Dispute</option>
                                    <option value="Streetlight Issue">Streetlight Issue</option>
                                </select>
                            </div>
                            <div class="form-group"><label>Incident Date *</label><input type="date" name="incident_date" required></div>
                            <div class="form-group"><label>Location *</label><input type="text" name="location" required></div>
                            <div class="form-group"><label>Description *</label><textarea name="description" rows="4" required></textarea></div>
                            <button type="submit" class="btn btn-success">Submit Concern</button>
                        </form>
                    </div>

                    <div class="card">
                        <h2>Submitted Concerns</h2>
                        <table>
                            <thead><tr><th>Type</th><th>Incident Date</th><th>Location</th><th>Status</th></tr></thead>
                            <tbody>
                                ${comps.map(c => `
                                    <tr>
                                        <td><strong>${c.concern_type}</strong></td>
                                        <td>${c.incident_date}</td>
                                        <td>${c.location}</td>
                                        <td><span class="badge badge-${c.status.toLowerCase().replace(/\s+/g, '')}">${c.status}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            res.send(renderLayout('Complaints', content, req.session.user, settings));
        });
    });
});

app.post('/resident/complaints/add', isAuthenticated, isResident, (req, res) => {
    const d = req.body;
    db.run(`INSERT INTO complaints (resident_id, concern_type, description, incident_date, location) VALUES (?, ?, ?, ?, ?)`,
        [req.session.user.resident_id, d.concern_type, d.description, d.incident_date, d.location], () => {
            res.redirect('/resident/complaints');
        });
});

app.get('/resident/assistance', isAuthenticated, isResident, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM assistance_requests WHERE resident_id = ? ORDER BY id DESC`, [req.session.user.resident_id], (err, reqs) => {
            const content = `
                <div class="flex-between mb-20">
                    <h1>Request Financial or Social Assistance</h1>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
                    <div class="card">
                        <h2>Assistance Request Form</h2>
                        <form action="/resident/assistance/add" method="POST">
                            <div class="form-group"><label>Assistance Type *</label>
                                <select name="assistance_type" required>
                                    <option value="Financial Assistance">Financial Assistance</option>
                                    <option value="Medical Assistance">Medical Assistance</option>
                                    <option value="Educational Assistance">Educational Assistance</option>
                                    <option value="Food Assistance">Food Assistance</option>
                                    <option value="Emergency Assistance">Emergency Assistance</option>
                                </select>
                            </div>
                            <div class="form-group"><label>Reason / Details *</label><textarea name="reason" rows="4" required></textarea></div>
                            <button type="submit" class="btn btn-success">Submit Request</button>
                        </form>
                    </div>

                    <div class="card">
                        <h2>My Assistance Requests</h2>
                        <table>
                            <thead><tr><th>Type</th><th>Reason</th><th>Status</th></tr></thead>
                            <tbody>
                                ${reqs.map(ar => `
                                    <tr>
                                        <td><strong>${ar.assistance_type}</strong></td>
                                        <td>${ar.reason}</td>
                                        <td><span class="badge badge-${ar.status.toLowerCase()}">${ar.status}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            res.send(renderLayout('Assistance', content, req.session.user, settings));
        });
    });
});

app.post('/resident/assistance/add', isAuthenticated, isResident, (req, res) => {
    const d = req.body;
    db.run(`INSERT INTO assistance_requests (resident_id, assistance_type, reason) VALUES (?, ?, ?)`, [req.session.user.resident_id, d.assistance_type, d.reason], () => {
        res.redirect('/resident/assistance');
    });
});

app.get('/resident/announcements', isAuthenticated, isResident, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM announcements ORDER BY id DESC`, (err, ann) => {
            const content = `
                <h1>Barangay Announcements</h1>
                <div class="card">
                    ${ann.map(a => `
                        <div style="padding: 15px 0; border-bottom: 1px solid #edf2f7;">
                            <h3>${a.title} <span class="badge badge-${a.priority.toLowerCase() === 'emergency' ? 'rejected' : 'approved'}">${a.priority}</span></h3>
                            <p style="color: #4a5568; margin: 8px 0;">${a.description}</p>
                            <small style="color: #a0aec0;">Published: ${a.created_at}</small>
                        </div>
                    `).join('')}
                </div>
            `;
            res.send(renderLayout('Announcements', content, req.session.user, settings));
        });
    });
});

app.get('/resident/feedback', isAuthenticated, isResident, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM feedback WHERE resident_id = ? ORDER BY id DESC`, [req.session.user.resident_id], (err, fb) => {
            const content = `
                <div class="flex-between mb-20">
                    <h1>Service Feedback</h1>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
                    <div class="card">
                        <h2>Submit Feedback</h2>
                        <form action="/resident/feedback/add" method="POST">
                            <div class="form-group"><label>Service Evaluated *</label><input type="text" name="service" required placeholder="Certificate Issuance, etc."></div>
                            <div class="form-group"><label>Rating (1 to 5 Stars) *</label>
                                <select name="rating" required><option value="5">⭐⭐⭐⭐⭐ (5 - Excellent)</option><option value="4">⭐⭐⭐⭐ (4 - Good)</option><option value="3">⭐⭐⭐ (3 - Average)</option><option value="2">⭐⭐ (2 - Poor)</option><option value="1">⭐ (1 - Very Poor)</option></select>
                            </div>
                            <div class="form-group"><label>Comments</label><textarea name="comment" rows="3"></textarea></div>
                            <button type="submit" class="btn btn-success">Submit Feedback</button>
                        </form>
                    </div>

                    <div class="card">
                        <h2>My Submitted Feedback</h2>
                        <table>
                            <thead><tr><th>Service</th><th>Rating</th><th>Comment</th></tr></thead>
                            <tbody>
                                ${fb.map(f => `
                                    <tr>
                                        <td><strong>${f.service}</strong></td>
                                        <td>${f.rating} / 5</td>
                                        <td>${f.comment || 'N/A'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            res.send(renderLayout('Feedback', content, req.session.user, settings));
        });
    });
});

app.post('/resident/feedback/add', isAuthenticated, isResident, (req, res) => {
    const d = req.body;
    db.run(`INSERT INTO feedback (resident_id, service, rating, comment) VALUES (?, ?, ?, ?)`, [req.session.user.resident_id, d.service, d.rating, d.comment], () => {
        res.redirect('/resident/feedback');
    });
});

app.get('/resident/registration-link-info', isAuthenticated, isResident, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        const regUrl = `${req.protocol}://${req.get('host')}/register`;
        const content = `
            <h1>Public Resident Registration Link</h1>
            <div class="card">
                <p>Share this link with family members or neighbors who need to submit their resident registration to ${settings.barangay_name}:</p>
                <div style="margin: 20px 0; padding: 15px; background: #edf2f7; border-radius: 4px; font-family: monospace;">
                    <a href="${regUrl}" target="_blank">${regUrl}</a>
                </div>
                <button onclick="navigator.clipboard.writeText('${regUrl}'); alert('Link copied to clipboard!');" class="btn">Copy Registration Link</button>
            </div>
        `;
        res.send(renderLayout('Registration Link', content, req.session.user, settings));
    });
});

// ==================== PUBLIC QR ID VERIFICATION PAGE ====================

app.get('/verify/id/:residentId', (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.get(`SELECT * FROM residents WHERE resident_id = ?`, [req.params.residentId], (err, r) => {
            res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><title>ID Verification - ${settings ? settings.barangay_name : 'Barangay'}</title>
    <style>body{background:#f0f4f8;font-family:sans-serif;padding:40px;display:flex;justify-content:center;align-items:center;height:100vh;}
    .card{background:white;padding:30px;border-radius:8px;box-shadow:0 4px 15px rgba(0,0,0,0.1);max-width:450px;width:100%;text-align:center;}
    h2{color:#1b365d;margin-bottom:10px;}
    .status-active{background:#c6f6d5;color:#22543d;padding:8px 16px;border-radius:20px;font-weight:bold;display:inline-block;margin:15px 0;}
    </style>
</head>
<body>
    <div class="card">
        <h2>${settings ? settings.barangay_name : 'Barangay'} ID Verification</h2>
        <p style="color:#718096;font-size:0.85rem;margin-bottom:20px;">Official Barangay Government Verification Gateway</p>
        ${r ? `
            <img src="${r.resident_photo ? '/uploads/' + r.resident_photo : 'https://via.placeholder.com/100'}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;border:3px solid #2b6cb0;margin-bottom:15px;">
            <h3>${r.first_name}${r.middle_name || ''} ${r.last_name}${r.suffix || ''}</h3>
            <p>ID Number: <strong>${r.resident_id}</strong></p>
            <p>Purok: ${r.purok}</p>
            <div><span class="status-active">Status: ${r.account_status.toUpperCase()}</span></div>
        ` : `<h3 style="color:#9b2c2c;">Invalid or Expired Resident ID</h3>`}
    </div>
</body>
</html>`);
        });
    });
});

// Root route redirect
app.get('/', (req, res) => {
    if (req.session && req.session.user) {
        if (req.session.user.role === 'Resident') return res.redirect('/resident/dashboard');
        return res.redirect('/staff/dashboard');
    }
    res.redirect('/login');
});

// Start Server
app.listen(PORT, () => {
    console.log(`Barangay Resident Management System running on port ${PORT}`);
});
