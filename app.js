/*************************************************************
 * BARANGAY RESIDENT MANAGEMENT SYSTEM (BRMS)
 * Fully functional Node.js + Express + SQLite Application
 *************************************************************/

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(uploadDir));
app.use(session({
    secret: process.env.SESSION_SECRET || 'brgy-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Database Initialization
const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) console.error('Database connection error:', err.message);
    else console.log('Connected to SQLite database.');
});

db.serialize(() => {
    // 1. Settings Table
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    // Default settings
    const defaultSettings = {
        brgy_name: 'Barangay San Jose',
        brgy_address: 'Main Street',
        municipality: 'Sample Municipality',
        province: 'Sample Province',
        contact_number: '09123456789',
        email: 'sanjose@barangay.gov.ph',
        captain: 'Hon. Juaning Capitan',
        secretary: 'Maria Sekretarya',
        logo: ''
    };
    Object.keys(defaultSettings).forEach(k => {
        db.get(`SELECT value FROM settings WHERE key = ?`, [k], (err, row) => {
            if (!row) {
                db.run(`INSERT INTO settings (key, value) VALUES (?, ?)`, [k, defaultSettings[k]]);
            }
        });
    });

    // 2. Staff Table
    db.run(`CREATE TABLE IF NOT EXISTS staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        full_name TEXT,
        role TEXT, -- Administrator, Barangay Captain, Barangay Secretary, Staff
        status TEXT DEFAULT 'Active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
        // Default Admin Account
        db.get(`SELECT id FROM staff WHERE username = 'admin'`, async (err, row) => {
            if (!row) {
                const hashed = await bcrypt.hash('admin123', 10);
                db.run(`INSERT INTO staff (username, password, full_name, role) VALUES (?, ?, ?, ?)`,
                    ['admin', hashed, 'System Administrator', 'Administrator']);
            }
        });
    });

    // 3. Residents Table
    db.run(`CREATE TABLE IF NOT EXISTS residents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id TEXT UNIQUE,
        first_name TEXT,
        middle_name TEXT,
        last_name TEXT,
        suffix TEXT,
        dob TEXT,
        gender TEXT,
        civil_status TEXT,
        address TEXT,
        purok TEXT,
        contact_number TEXT,
        email TEXT,
        occupation TEXT,
        educational_attainment TEXT,
        nationality TEXT,
        voter_status TEXT,
        pwd_status TEXT,
        senior_citizen_status TEXT,
        solo_parent_status TEXT,
        four_ps_status TEXT,
        photo TEXT,
        date_registered TEXT,
        resident_status TEXT DEFAULT 'Active', -- Active, Archived
        password TEXT, -- For resident portal
        account_status TEXT DEFAULT 'Pending' -- Pending, Approved, Rejected
    )`);

    // 4. Households Table
    db.run(`CREATE TABLE IF NOT EXISTS households (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        household_id TEXT UNIQUE,
        household_head_id INTEGER,
        address TEXT,
        purok TEXT,
        date_registered TEXT,
        status TEXT DEFAULT 'Active'
    )`);

    // 5. Puroks Table
    db.run(`CREATE TABLE IF NOT EXISTS puroks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        description TEXT
    )`);

    // 6. Certificates Table
    db.run(`CREATE TABLE IF NOT EXISTS certificates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cert_number TEXT UNIQUE,
        resident_id TEXT,
        cert_type TEXT,
        purpose TEXT,
        status TEXT DEFAULT 'Pending', -- Pending, Processing, Approved, Rejected, Ready for Release, Released
        remarks TEXT,
        date_issued TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 7. Appointments Table
    db.run(`CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id TEXT,
        service TEXT,
        appointment_date TEXT,
        appointment_time TEXT,
        purpose TEXT,
        status TEXT DEFAULT 'Pending', -- Pending, Approved, Rescheduled, Completed, Cancelled
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 8. Blotter Table
    db.run(`CREATE TABLE IF NOT EXISTS blotter (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_number TEXT UNIQUE,
        complainant TEXT,
        respondent TEXT,
        witness TEXT,
        incident_date TEXT,
        incident_time TEXT,
        location TEXT,
        incident_type TEXT,
        description TEXT,
        action_taken TEXT,
        settlement TEXT,
        status TEXT DEFAULT 'Open' -- Open, Under Investigation, Settled, Closed
    )`);

    // 9. Assistance Table
    db.run(`CREATE TABLE IF NOT EXISTS assistance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id TEXT,
        assistance_type TEXT,
        details TEXT,
        status TEXT DEFAULT 'Pending', -- Pending, Approved, Rejected, Released
        remarks TEXT,
        date_requested DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 10. Businesses Table
    db.run(`CREATE TABLE IF NOT EXISTS businesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_name TEXT,
        owner_name TEXT,
        address TEXT,
        purok TEXT,
        business_type TEXT,
        contact_number TEXT,
        registration_date TEXT,
        permit_number TEXT UNIQUE,
        permit_expiration TEXT,
        status TEXT DEFAULT 'Active'
    )`);

    // 11. Announcements Table
    db.run(`CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        category TEXT,
        content TEXT,
        date_posted DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 12. Notifications Table
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id TEXT,
        message TEXT,
        is_read INTEGER DEFAULT 0,
        date_created DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 13. Activity Logs Table
    db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_name TEXT,
        action TEXT,
        details TEXT,
        date_time DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Helper function to log activities
function logActivity(userName, action, details) {
    db.run(`INSERT INTO activity_logs (user_name, action, details) VALUES (?, ?, ?)`, [userName, action, details]);
}

// Helper to notify a resident
function sendNotification(residentId, message) {
    db.run(`INSERT INTO notifications (resident_id, message) VALUES (?, ?)`, [residentId, message]);
}

// Helper to calculate age
function calculateAge(dob) {
    if (!dob) return 0;
    const diff = Date.now() - new Date(dob).getTime();
    const ageDate = new Date(diff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
}

// Helper to generate unique Resident ID
function generateResidentId(callback) {
    db.get(`SELECT resident_id FROM residents ORDER BY id DESC LIMIT 1`, (err, row) => {
        let nextNum = 1;
        if (row && row.resident_id) {
            const parts = row.resident_id.split('-');
            if (parts.length === 2) {
                nextNum = parseInt(parts[1], 10) + 1;
            }
        }
        const newId = 'BRGY-' + String(nextNum).padStart(6, '0');
        callback(newId);
    });
}

// Helper to generate Certificate Number
function generateCertNumber(callback) {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    const certNo = 'CERT-' + new Date().getFullYear() + '-' + randomNum;
    db.get(`SELECT id FROM certificates WHERE cert_number = ?`, [certNo], (err, row) => {
        if (row) generateCertNumber(callback);
        else callback(certNo);
    });
}

// Helper to render HTML wrapper
function renderHTML(title, bodyContent, userRole, userName) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Barangay Resident Management System</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary: #1e3a8a;
            --primary-dark: #172554;
            --accent: #3b82f6;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
            --bg-light: #f8fafc;
            --text-dark: #1e293b;
            --border: #cbd5e1;
            --sidebar-width: 260px;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
        body { background-color: var(--bg-light); color: var(--text-dark); display: flex; min-height: 100vh; }
        
        /* Sidebar */
        aside { width: var(--sidebar-width); background: var(--primary-dark); color: #fff; display: flex; flex-direction: column; position: fixed; height: 100vh; overflow-y: auto; z-index: 100; transition: all 0.3s; }
        .sidebar-brand { padding: 20px; font-size: 1.1rem; font-weight: 700; display: flex; align-items: center; gap: 10px; background: rgba(0,0,0,0.2); border-bottom: 1px solid rgba(255,255,255,0.1); }
        .sidebar-brand img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
        .sidebar-menu { list-style: none; padding: 15px 0; flex: 1; }
        .sidebar-menu li a { display: flex; align-items: center; gap: 12px; padding: 12px 20px; color: #cbd5e1; text-decoration: none; font-size: 0.95rem; font-weight: 500; transition: 0.2s; }
        .sidebar-menu li a:hover, .sidebar-menu li a.active { background: var(--accent); color: #fff; }
        .sidebar-menu li a i { width: 20px; text-align: center; }

        /* Main Content */
        .main-container { flex: 1; margin-left: var(--sidebar-width); display: flex; flex-direction: column; }
        header { background: #fff; padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .header-title { font-size: 1.25rem; font-weight: 600; color: var(--primary); }
        .user-profile { display: flex; align-items: center; gap: 15px; }
        .user-profile span { font-weight: 500; font-size: 0.9rem; }
        .logout-btn { background: var(--danger); color: #fff; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 500; }

        .content-body { padding: 30px; flex: 1; }

        /* Cards & Grids */
        .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border-left: 4px solid var(--accent); display: flex; justify-content: space-between; align-items: center; }
        .stat-card.green { border-color: var(--success); }
        .stat-card.yellow { border-color: var(--warning); }
        .stat-card.red { border-color: var(--danger); }
        .stat-info h3 { font-size: 1.8rem; font-weight: 700; color: var(--text-dark); margin-bottom: 5px; }
        .stat-info p { font-size: 0.85rem; color: #64748b; font-weight: 500; text-transform: uppercase; }
        .stat-icon { font-size: 2.2rem; color: #cbd5e1; }

        /* Tables & Forms */
        .card { background: #fff; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); padding: 25px; margin-bottom: 30px; }
        .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--border); }
        .card-header h2 { font-size: 1.15rem; font-weight: 600; color: var(--text-dark); }
        
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.9rem; }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid var(--border); }
        th { background: #f1f5f9; font-weight: 600; color: #475569; }
        tr:hover { background: #f8fafc; }

        .btn { background: var(--accent); color: #fff; padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-weight: 500; font-size: 0.9rem; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; }
        .btn:hover { opacity: 0.9; }
        .btn-success { background: var(--success); }
        .btn-danger { background: var(--danger); }
        .btn-warning { background: var(--warning); color: #fff; }
        .btn-secondary { background: #64748b; }
        .btn-sm { padding: 5px 10px; font-size: 0.8rem; }

        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .form-group label { font-size: 0.85rem; font-weight: 600; color: #475569; }
        .form-control { padding: 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.9rem; outline: none; transition: 0.2s; }
        .form-control:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }

        .badge { padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; display: inline-block; text-transform: uppercase; }
        .badge-success { background: #d1fae5; color: #065f46; }
        .badge-warning { background: #fef3c7; color: #92400e; }
        .badge-danger { background: #fee2e2; color: #991b1b; }
        .badge-info { background: #dbeafe; color: #1e40af; }

        .filters-bar { display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
        
        /* Modal */
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); justify-content: center; align-items: center; z-index: 1000; overflow-y: auto; padding: 20px; }
        .modal-content { background: #fff; padding: 30px; border-radius: 10px; width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; position: relative; }
        .close-modal { position: absolute; top: 20px; right: 20px; font-size: 1.2rem; cursor: pointer; color: #64748b; }

        /* Print Layout for 8 IDs on 1 Bond Paper (8.5 x 11 inches) */
        @media print {
            body { background: #fff; display: block; }
            aside, header, .no-print { display: none !important; }
            .main-container { margin: 0; padding: 0; }
            .print-grid { display: grid; grid-template-columns: repeat(2, 3.375in); grid-template-rows: repeat(4, 2.125in); gap: 0.2in; justify-content: center; align-content: center; width: 8.5in; height: 11in; margin: 0 auto; page-break-after: always; }
            .id-card-print { width: 3.375in; height: 2.125in; border: 1px dashed #999; padding: 10px; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; background: #fff; font-size: 10pt; }
        }

        .id-card-ui { width: 340px; height: 215px; border: 1px solid var(--border); border-radius: 12px; background: #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.1); padding: 15px; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden; }
        .id-header { display: flex; align-items: center; gap: 10px; border-bottom: 2px solid var(--primary); padding-bottom: 8px; }
        .id-header img { width: 35px; height: 35px; border-radius: 50%; object-fit: cover; }
        .id-header h4 { font-size: 0.85rem; color: var(--primary); font-weight: 700; line-height: 1.1; }
        .id-header p { font-size: 0.65rem; color: #64748b; }
        .id-body { display: flex; gap: 12px; align-items: center; margin-top: 8px; }
        .id-body img.res-photo { width: 75px; height: 85px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border); }
        .id-details p { font-size: 0.75rem; margin-bottom: 2px; }
        .id-details strong { color: var(--text-dark); }
        .id-footer { display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid var(--border); padding-top: 6px; margin-top: auto; }
        .id-footer p { font-size: 0.6rem; color: #64748b; }

        @media (max-width: 768px) {
            aside { width: 70px; }
            aside .sidebar-brand span, aside .sidebar-menu span { display: none; }
            .main-container { margin-left: 70px; }
        }
    </style>
</head>
<body>
    ${userRole ? `
    <aside>
        <div class="sidebar-brand">
            <img src="/uploads/logo.png" onerror="this.src='https://via.placeholder.com/40'" alt="Logo">
            <span>Barangay BRMS</span>
        </div>
        <ul class="sidebar-menu">
            ${userRole === 'Resident' ? `
                <li><a href="/resident/dashboard" ${title.includes('Dashboard') ? 'class="active"' : ''}><i class="fa-solid fa-house"></i><span>Dashboard</span></a></li>
                <li><a href="/resident/profile" ${title.includes('Profile') ? 'class="active"' : ''}><i class="fa-solid fa-id-card"></i><span>My Digital ID</span></a></li>
                <li><a href="/resident/certificates" ${title.includes('Certificate') ? 'class="active"' : ''}><i class="fa-solid fa-file-lines"></i><span>Certificates</span></a></li>
                <li><a href="/resident/appointments" ${title.includes('Appointment') ? 'class="active"' : ''}><i class="fa-solid fa-calendar-check"></i><span>Appointments</span></a></li>
                <li><a href="/resident/complaints" ${title.includes('Complaint') ? 'class="active"' : ''}><i class="fa-solid fa-triangle-exclamation"></i><span>Complaints</span></a></li>
                <li><a href="/resident/assistance" ${title.includes('Assistance') ? 'class="active"' : ''}><i class="fa-solid fa-hand-holding-heart"></i><span>Assistance</span></a></li>
                <li><a href="/resident/announcements" ${title.includes('Announcement') ? 'class="active"' : ''}><i class="fa-solid fa-bullhorn"></i><span>Announcements</span></a></li>
            ` : `
                <li><a href="/staff/dashboard" ${title.includes('Dashboard') ? 'class="active"' : ''}><i class="fa-solid fa-chart-pie"></i><span>Dashboard</span></a></li>
                <li><a href="/staff/residents" ${title.includes('Resident') ? 'class="active"' : ''}><i class="fa-solid fa-users"></i><span>Residents</span></a></li>
                <li><a href="/staff/households" ${title.includes('Household') ? 'class="active"' : ''}><i class="fa-solid fa-house-chimney"></i><span>Households</span></a></li>
                <li><a href="/staff/puroks" ${title.includes('Purok') ? 'class="active"' : ''}><i class="fa-solid fa-map-location-dot"></i><span>Puroks</span></a></li>
                <li><a href="/staff/certificates" ${title.includes('Certificate') ? 'class="active"' : ''}><i class="fa-solid fa-file-invoice"></i><span>Certificates</span></a></li>
                <li><a href="/staff/appointments" ${title.includes('Appointment') ? 'class="active"' : ''}><i class="fa-solid fa-calendar-days"></i><span>Appointments</span></a></li>
                <li><a href="/staff/blotter" ${title.includes('Blotter') ? 'class="active"' : ''}><i class="fa-solid fa-scale-balanced"></i><span>Blotter</span></a></li>
                <li><a href="/staff/assistance" ${title.includes('Assistance') ? 'class="active"' : ''}><i class="fa-solid fa-hand-holding-medical"></i><span>Assistance</span></a></li>
                <li><a href="/staff/businesses" ${title.includes('Business') ? 'class="active"' : ''}><i class="fa-solid fa-store"></i><span>Businesses</span></a></li>
                <li><a href="/staff/announcements" ${title.includes('Announcement') ? 'class="active"' : ''}><i class="fa-solid fa-bullhorn"></i><span>Announcements</span></a></li>
                <li><a href="/staff/print-ids" ${title.includes('Print IDs') ? 'class="active"' : ''}><i class="fa-solid fa-print"></i><span>Print IDs</span></a></li>
                <li><a href="/staff/reports" ${title.includes('Report') ? 'class="active"' : ''}><i class="fa-solid fa-chart-bar"></i><span>Reports</span></a></li>
                <li><a href="/staff/archives" ${title.includes('Archive') ? 'class="active"' : ''}><i class="fa-solid fa-box-archive"></i><span>Archives</span></a></li>
                ${userRole === 'Administrator' ? `
                    <li><a href="/staff/accounts" ${title.includes('Account') ? 'class="active"' : ''}><i class="fa-solid fa-user-shield"></i><span>Staff Accounts</span></a></li>
                    <li><a href="/staff/settings" ${title.includes('Settings') ? 'class="active"' : ''}><i class="fa-solid fa-gears"></i><span>Settings</span></a></li>
                    <li><a href="/staff/logs" ${title.includes('Logs') ? 'class="active"' : ''}><i class="fa-solid fa-clock-rotate-left"></i><span>Activity Logs</span></a></li>
                ` : ''}
            `}
        </ul>
    </aside>
    <div class="main-container">
        <header class="no-print">
            <div class="header-title">${title}</div>
            <div class="user-profile">
                <span><i class="fa-solid fa-user-circle"></i> ${userName} (${userRole})</span>
                <a href="/logout" class="logout-btn">Logout</a>
            </div>
        </header>
        <div class="content-body">
            ${bodyContent}
        </div>
    </div>
    ` : bodyContent}
</body>
</html>`;
}

// ================= PUBLIC ROUTES =================

// Login selection / Staff Login Page
app.get('/login', (req, res) => {
    db.all(`SELECT key, value FROM settings`, (err, rows) => {
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        
        const html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Staff Login - ${settings.brgy_name || 'BRMS'}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                body { background: #f1f5f9; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .login-card { background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); width: 100%; max-width: 400px; text-align: center; }
                .login-card img { width: 70px; height: 70px; border-radius: 50%; object-fit: cover; margin-bottom: 15px; }
                .login-card h2 { color: #1e3a8a; margin-bottom: 5px; font-size: 1.3rem; }
                .login-card p { color: #64748b; font-size: 0.85rem; margin-bottom: 25px; }
                .form-group { text-align: left; margin-bottom: 15px; }
                .form-group label { display: block; font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 5px; }
                .form-control { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.9rem; box-sizing: border-box; }
                .btn { width: 100%; background: #1e3a8a; color: #fff; padding: 12px; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; margin-top: 10px; }
                .links { margin-top: 20px; font-size: 0.85rem; display: flex; justify-content: space-between; }
                .links a { color: #3b82f6; text-decoration: none; }
            </style>
        </head>
        <body>
            <div class="login-card">
                <h2>${settings.brgy_name}</h2>
                <p>Staff & Administrator Portal</p>
                ${req.query.error ? `<p style="color:red; font-size:0.8rem; margin-bottom:15px;">Invalid username or password</p>` : ''}
                <form action="/login" method="POST">
                    <div class="form-group">
                        <label>Username</label>
                        <input type="text" name="username" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>Password</label>
                        <input type="password" name="password" class="form-control" required>
                    </div>
                    <button type="submit" class="btn">Login to Staff Portal</button>
                </form>
                <div class="links">
                    <a href="/resident-login">Resident Portal</a>
                    <a href="/register">Register Online</a>
                </div>
            </div>
        </body>
        </html>`;
        res.send(html);
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM staff WHERE username = ? AND status = 'Active'`, [username], async (err, user) => {
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.userId = user.id;
            req.session.userName = user.full_name;
            req.session.userRole = user.role;
            logActivity(user.full_name, 'Login', 'Staff logged into the system.');
            res.redirect('/staff/dashboard');
        } else {
            res.redirect('/login?error=1');
        }
    });
});

// Resident Login Page
app.get('/resident-login', (req, res) => {
    db.all(`SELECT key, value FROM settings`, (err, rows) => {
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        
        const html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Resident Login - ${settings.brgy_name || 'BRMS'}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                body { background: #f1f5f9; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .login-card { background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); width: 100%; max-width: 400px; text-align: center; }
                .login-card h2 { color: #1e3a8a; margin-bottom: 5px; font-size: 1.3rem; }
                .login-card p { color: #64748b; font-size: 0.85rem; margin-bottom: 25px; }
                .form-group { text-align: left; margin-bottom: 15px; }
                .form-group label { display: block; font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 5px; }
                .form-control { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.9rem; box-sizing: border-box; }
                .btn { width: 100%; background: #10b981; color: #fff; padding: 12px; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; margin-top: 10px; }
                .links { margin-top: 20px; font-size: 0.85rem; display: flex; justify-content: space-between; }
                .links a { color: #3b82f6; text-decoration: none; }
            </style>
        </head>
        <body>
            <div class="login-card">
                <h2>${settings.brgy_name}</h2>
                <p>Resident Portal Login</p>
                ${req.query.error ? `<p style="color:red; font-size:0.8rem; margin-bottom:15px;">Invalid email/ID or password, or account pending approval</p>` : ''}
                <form action="/resident-login" method="POST">
                    <div class="form-group">
                        <label>Resident ID or Email</label>
                        <input type="text" name="identifier" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>Password</label>
                        <input type="password" name="password" class="form-control" required>
                    </div>
                    <button type="submit" class="btn">Login to Resident Portal</button>
                </form>
                <div class="links">
                    <a href="/login">Staff Portal</a>
                    <a href="/register">Register Online</a>
                </div>
            </div>
        </body>
        </html>`;
        res.send(html);
    });
});

app.post('/resident-login', (req, res) => {
    const { identifier, password } = req.body;
    db.get(`SELECT * FROM residents WHERE (resident_id = ? OR email = ?) AND account_status = 'Approved'`, [identifier, identifier], async (err, resident) => {
        if (resident && resident.password && await bcrypt.compare(password, resident.password)) {
            req.session.residentId = resident.resident_id;
            req.session.userName = `${resident.first_name} ${resident.last_name}`;
            req.session.userRole = 'Resident';
            res.redirect('/resident/dashboard');
        } else {
            res.redirect('/resident-login?error=1');
        }
    });
});

// Public Registration Page
app.get('/register', (req, res) => {
    db.all(`SELECT name FROM puroks`, (err, puroks) => {
        db.all(`SELECT key, value FROM settings`, (err2, rows) => {
            const settings = {};
            rows.forEach(r => settings[r.key] = r.value);

            const html = `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Online Resident Registration - ${settings.brgy_name}</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
                <style>
                    body { background: #f1f5f9; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
                    .reg-card { background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); width: 100%; max-width: 600px; }
                    .reg-card h2 { color: #1e3a8a; text-align: center; margin-bottom: 5px; }
                    .reg-card p { color: #64748b; text-align: center; font-size: 0.85rem; margin-bottom: 25px; }
                    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                    .form-group { margin-bottom: 15px; }
                    .form-group.full { grid-column: span 2; }
                    .form-group label { display: block; font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 5px; }
                    .form-control { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.9rem; box-sizing: border-box; }
                    .btn { width: 100%; background: #3b82f6; color: #fff; padding: 12px; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; margin-top: 10px; }
                    .footer-links { text-align: center; margin-top: 15px; font-size: 0.85rem; }
                    .footer-links a { color: #3b82f6; text-decoration: none; }
                </style>
            </head>
            <body>
                <div class="reg-card">
                    <h2>${settings.brgy_name}</h2>
                    <p>Online Resident Registration Form</p>
                    ${req.query.success ? `<div style="background:#d1fae5; color:#065f46; padding:15px; border-radius:6px; margin-bottom:20px; text-align:center; font-weight:500;">Registration submitted successfully! Your account is pending staff verification and approval.</div>` : ''}
                    <form action="/register" method="POST" enctype="multipart/form-data">
                        <div class="form-grid">
                            <div class="form-group">
                                <label>First Name</label>
                                <input type="text" name="first_name" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Middle Name</label>
                                <input type="text" name="middle_name" class="form-control">
                            </div>
                            <div class="form-group">
                                <label>Last Name</label>
                                <input type="text" name="last_name" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Suffix</label>
                                <input type="text" name="suffix" class="form-control">
                            </div>
                            <div class="form-group">
                                <label>Date of Birth</label>
                                <input type="date" name="dob" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Gender</label>
                                <select name="gender" class="form-control" required>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Civil Status</label>
                                <select name="civil_status" class="form-control">
                                    <option value="Single">Single</option>
                                    <option value="Married">Married</option>
                                    <option value="Widowed">Widowed</option>
                                    <option value="Divorced">Divorced</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Purok</label>
                                <select name="purok" class="form-control" required>
                                    ${puroks.map(p => `<option value="${p.name}">${p.name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group full">
                                <label>Complete Address</label>
                                <input type="text" name="address" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Contact Number</label>
                                <input type="text" name="contact_number" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Email Address</label>
                                <input type="email" name="email" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Password for Portal</label>
                                <input type="password" name="password" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Resident Photo</label>
                                <input type="file" name="photo" class="form-control" accept="image/*" required>
                            </div>
                        </div>
                        <button type="submit" class="btn">Submit Registration</button>
                    </form>
                    <div class="footer-links">
                        <a href="/resident-login">Already have an account? Login here</a>
                    </div>
                </div>
            </body>
            </html>`;
            res.send(html);
        });
    });
});

app.post('/register', upload.single('photo'), async (req, res) => {
    const { first_name, middle_name, last_name, suffix, dob, gender, civil_status, address, purok, contact_number, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const photoPath = req.file ? '/uploads/' + req.file.filename : '';
    const dateReg = new Date().toISOString().split('T')[0];

    generateResidentId((residentId) => {
        db.run(`INSERT INTO residents (resident_id, first_name, middle_name, last_name, suffix, dob, gender, civil_status, address, purok, contact_number, email, photo, date_registered, password, account_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
            [residentId, first_name, middle_name, last_name, suffix, dob, gender, civil_status, address, purok, contact_number, email, photoPath, dateReg, hashedPassword],
            (err) => {
                if (err) console.error(err);
                res.redirect('/register?success=1');
            }
        );
    });
});

// Public Certificate Verification Route
app.get('/verify/:certNo', (req, res) => {
    const certNo = req.params.certNo;
    db.get(`SELECT c.*, r.first_name, r.last_name, r.resident_id FROM certificates c JOIN residents r ON c.resident_id = r.resident_id WHERE c.cert_number = ?`, [certNo], (err, cert) => {
        db.all(`SELECT key, value FROM settings`, (err2, rows) => {
            const settings = {};
            rows.forEach(r => settings[r.key] = r.value);

            const html = `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Certificate Verification - ${settings.brgy_name}</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
                <style>
                    body { background: #f1f5f9; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    .verify-card { background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); width: 100%; max-width: 500px; text-align: center; }
                    .badge { padding: 8px 16px; border-radius: 20px; font-weight: 700; display: inline-block; margin: 15px 0; }
                    .valid { background: #d1fae5; color: #065f46; }
                    .invalid { background: #fee2e2; color: #991b1b; }
                </style>
            </head>
            <body>
                <div class="verify-card">
                    <h2>${settings.brgy_name}</h2>
                    <p>${settings.municipality}, ${settings.province}</p>
                    <hr style="margin:20px 0; border:0; border-top:1px solid #cbd5e1;">
                    ${cert ? `
                        <h3>Certificate Verification</h3>
                        <div class="badge valid">AUTHENTIC & VALID</div>
                        <p><strong>Certificate Number:</strong> ${cert.cert_number}</p>
                        <p><strong>Resident Name:</strong> ${cert.first_name}${cert.last_name}</p>
                        <p><strong>Certificate Type:</strong> ${cert.cert_type}</p>
                        <p><strong>Purpose:</strong> ${cert.purpose}</p>
                        <p><strong>Date Issued:</strong> ${cert.date_issued || cert.created_at}</p>
                    ` : `
                        <h3>Certificate Verification</h3>
                        <div class="badge invalid">INVALID OR NOT FOUND</div>
                        <p>The certificate number you provided does not exist in our official records.</p>
                    `}
                </div>
            </body>
            </html>`;
            res.send(html);
        });
    });
});

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// ================= STAFF / ADMIN ROUTES =================

app.use('/staff', (req, res, next) => {
    if (req.session.userRole && req.session.userRole !== 'Resident') {
        next();
    } else {
        res.redirect('/login');
    }
});

// Staff Dashboard
app.get('/staff/dashboard', (req, res) => {
    db.all(`SELECT * FROM residents WHERE resident_status = 'Active'`, (err, residents) => {
        db.all(`SELECT * FROM households WHERE status = 'Active'`, (err2, households) => {
            db.all(`SELECT * FROM certificates`, (err3, certs) => {
                db.all(`SELECT * FROM appointments`, (err4, appointments) => {
                    db.all(`SELECT * FROM activity_logs ORDER BY id DESC LIMIT 5`, (err5, logs) => {
                        db.all(`SELECT key, value FROM settings`, (err6, settingsRows) => {
                            const settings = {};
                            settingsRows.forEach(r => settings[r.key] = r.value);

                            const totalResidents = residents.length;
                            const totalHouseholds = households.length;
                            const maleResidents = residents.filter(r => r.gender === 'Male').length;
                            const femaleResidents = residents.filter(r => r.gender === 'Female').length;
                            const seniorCitizens = residents.filter(r => calculateAge(r.dob) >= 60).length;
                            const pwdResidents = residents.filter(r => r.pwd_status === 'Yes').length;
                            const soloParents = residents.filter(r => r.solo_parent_status === 'Yes').length;
                            const minors = residents.filter(r => calculateAge(r.dob) < 18).length;
                            const registeredVoters = residents.filter(r => r.voter_status === 'Yes').length;
                            const pendingRequests = certs.filter(c => c.status === 'Pending').length;
                            const approvedRequests = certs.filter(c => c.status === 'Approved' || c.status === 'Ready for Release').length;
                            const pendingAppointments = appointments.filter(a => a.status === 'Pending').length;

                            const body = `
                            <div class="card-grid">
                                <div class="stat-card">
                                    <div class="stat-info"><h3>${totalResidents}</h3><p>Total Residents</p></div>
                                    <div class="stat-icon"><i class="fa-solid fa-users"></i></div>
                                </div>
                                <div class="stat-card green">
                                    <div class="stat-info"><h3>${totalHouseholds}</h3><p>Total Households</p></div>
                                    <div class="stat-icon"><i class="fa-solid fa-house-chimney"></i></div>
                                </div>
                                <div class="stat-card yellow">
                                    <div class="stat-info"><h3>${seniorCitizens}</h3><p>Senior Citizens</p></div>
                                    <div class="stat-icon"><i class="fa-solid fa-person-cane"></i></div>
                                </div>
                                <div class="stat-card red">
                                    <div class="stat-info"><h3>${pendingRequests}</h3><p>Pending Requests</p></div>
                                    <div class="stat-icon"><i class="fa-solid fa-file-clock"></i></div>
                                </div>
                                <div class="stat-card">
                                    <div class="stat-info"><h3>${registeredVoters}</h3><p>Registered Voters</p></div>
                                    <div class="stat-icon"><i class="fa-solid fa-check-to-slot"></i></div>
                                </div>
                                <div class="stat-card green">
                                    <div class="stat-info"><h3>${pendingAppointments}</h3><p>Pending Appointments</p></div>
                                    <div class="stat-icon"><i class="fa-solid fa-calendar"></i></div>
                                </div>
                            </div>

                            <div class="card">
                                <div class="card-header"><h2>Recent System Activities</h2></div>
                                <table>
                                    <thead>
                                        <tr><th>User</th><th>Action</th><th>Details</th><th>Date & Time</th></tr>
                                    </thead>
                                    <tbody>
                                        ${logs.map(l => `<tr><td>${l.user_name}</td><td>${l.action}</td><td>${l.details}</td><td>${l.date_time}</td></tr>`).join('')}
                                    </tbody>
                                </table>
                            </div>
                            `;
                            res.send(renderHTML('Staff Dashboard', body, req.session.userRole, req.session.userName));
                        });
                    });
                });
            });
        });
    });
});

// Resident Management
app.get('/staff/residents', (req, res) => {
    const { search, purok, gender, status } = req.query;
    let query = `SELECT * FROM residents WHERE resident_status = 'Active'`;
    const params = [];

    if (search) {
        query += ` AND (first_name LIKE ? OR last_name LIKE ? OR resident_id LIKE ? OR contact_number LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (purok) {
        query += ` AND purok = ?`;
        params.push(purok);
    }
    if (gender) {
        query += ` AND gender = ?`;
        params.push(gender);
    }
    if (status === 'Senior') {
        query += ` AND (strftime('%Y', 'now') - strftime('%Y', dob)) >= 60`;
    }

    db.all(query, params, (err, residents) => {
        db.all(`SELECT name FROM puroks`, (err2, puroks) => {
            const body = `
            <div class="card">
                <div class="card-header">
                    <h2>Resident Management</h2>
                    <a href="/staff/residents/add" class="btn"><i class="fa-solid fa-user-plus"></i> Add Resident</a>
                </div>
                <form method="GET" class="filters-bar">
                    <input type="text" name="search" placeholder="Search name, ID, contact..." value="${search || ''}" class="form-control" style="flex:2;">
                    <select name="purok" class="form-control" style="flex:1;">
                        <option value="">All Puroks</option>
                        ${puroks.map(p => `<option value="${p.name}" ${purok === p.name ? 'selected' : ''}>${p.name}</option>`).join('')}
                    </select>
                    <select name="gender" class="form-control" style="flex:1;">
                        <option value="">All Genders</option>
                        <option value="Male" ${gender === 'Male' ? 'selected' : ''}>Male</option>
                        <option value="Female" ${gender === 'Female' ? 'selected' : ''}>Female</option>
                    </select>
                    <button type="submit" class="btn"><i class="fa-solid fa-search"></i> Filter</button>
                    <a href="/staff/residents" class="btn btn-secondary">Reset</a>
                </form>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Photo</th>
                            <th>Full Name</th>
                            <th>Age / Gender</th>
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
                                <td><img src="${r.photo || 'https://via.placeholder.com/40'}" style="width:35px; height:35px; border-radius:50%; object-fit:cover;"></td>
                                <td>${r.first_name}${r.middle_name || ''} ${r.last_name}${r.suffix || ''}</td>
                                <td>${calculateAge(r.dob)} /${r.gender}</td>
                                <td>${r.purok} -${r.address}</td>
                                <td>${r.contact_number}</td>
                                <td><span class="badge ${r.account_status === 'Approved' ? 'badge-success' : 'badge-warning'}">${r.account_status}</span></td>
                                <td>
                                    <a href="/staff/residents/view/${r.id}" class="btn btn-sm" title="View"><i class="fa-solid fa-eye"></i></a>
                                    <a href="/staff/residents/edit/${r.id}" class="btn btn-sm btn-warning" title="Edit"><i class="fa-solid fa-pen"></i></a>
                                    <a href="/staff/residents/archive/${r.id}" class="btn btn-sm btn-danger" onclick="return confirm('Are you sure you want to archive this resident?')" title="Archive"><i class="fa-solid fa-box-archive"></i></a>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            `;
            res.send(renderHTML('Resident Management', body, req.session.userRole, req.session.userName));
        });
    });
});

// Add Resident Form
app.get('/staff/residents/add', (req, res) => {
    db.all(`SELECT name FROM puroks`, (err, puroks) => {
        const body = `
        <div class="card">
            <div class="card-header"><h2>Add New Resident</h2></div>
            <form action="/staff/residents/add" method="POST" enctype="multipart/form-data">
                <div class="form-grid">
                    <div class="form-group"><label>First Name</label><input type="text" name="first_name" class="form-control" required></div>
                    <div class="form-group"><label>Middle Name</label><input type="text" name="middle_name" class="form-control"></div>
                    <div class="form-group"><label>Last Name</label><input type="text" name="last_name" class="form-control" required></div>
                    <div class="form-group"><label>Suffix</label><input type="text" name="suffix" class="form-control"></div>
                    <div class="form-group"><label>Date of Birth</label><input type="date" name="dob" class="form-control" required></div>
                    <div class="form-group"><label>Gender</label><select name="gender" class="form-control"><option value="Male">Male</option><option value="Female">Female</option></select></div>
                    <div class="form-group"><label>Civil Status</label><select name="civil_status" class="form-control"><option value="Single">Single</option><option value="Married">Married</option><option value="Widowed">Widowed</option></select></div>
                    <div class="form-group"><label>Purok</label><select name="purok" class="form-control">${puroks.map(p => `<option value="${p.name}">${p.name}</option>`).join('')}</select></div>
                    <div class="form-group"><label>Address</label><input type="text" name="address" class="form-control" required></div>
                    <div class="form-group"><label>Contact Number</label><input type="text" name="contact_number" class="form-control" required></div>
                    <div class="form-group"><label>Email</label><input type="email" name="email" class="form-control"></div>
                    <div class="form-group"><label>Occupation</label><input type="text" name="occupation" class="form-control"></div>
                    <div class="form-group"><label>Voter Status</label><select name="voter_status" class="form-control"><option value="No">No</option><option value="Yes">Yes</option></select></div>
                    <div class="form-group"><label>PWD Status</label><select name="pwd_status" class="form-control"><option value="No">No</option><option value="Yes">Yes</option></select></div>
                    <div class="form-group"><label>Solo Parent Status</label><select name="solo_parent_status" class="form-control"><option value="No">No</option><option value="Yes">Yes</option></select></div>
                    <div class="form-group"><label>Resident Photo</label><input type="file" name="photo" class="form-control" accept="image/*"></div>
                </div>
                <button type="submit" class="btn">Save Resident</button>
            </form>
        </div>
        `;
        res.send(renderHTML('Add Resident', body, req.session.userRole, req.session.userName));
    });
});

app.post('/staff/residents/add', upload.single('photo'), async (req, res) => {
    const { first_name, middle_name, last_name, suffix, dob, gender, civil_status, address, purok, contact_number, email, occupation, voter_status, pwd_status, solo_parent_status } = req.body;
    const photoPath = req.file ? '/uploads/' + req.file.filename : '';
    const dateReg = new Date().toISOString().split('T')[0];
    const hashedPassword = await bcrypt.hash('password123', 10);

    generateResidentId((residentId) => {
        db.run(`INSERT INTO residents (resident_id, first_name, middle_name, last_name, suffix, dob, gender, civil_status, address, purok, contact_number, email, occupation, voter_status, pwd_status, solo_parent_status, photo, date_registered, password, account_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Approved')`,
            [residentId, first_name, middle_name, last_name, suffix, dob, gender, civil_status, address, purok, contact_number, email, occupation, voter_status, pwd_status, solo_parent_status, photoPath, dateReg, hashedPassword],
            (err) => {
                logActivity(req.session.userName, 'Add Resident', `Added resident ${first_name} ${last_name} (${residentId})`);
                res.redirect('/staff/residents');
            }
        );
    });
});

// View Resident Details & Digital ID
app.get('/staff/residents/view/:id', (req, res) => {
    db.get(`SELECT * FROM residents WHERE id = ?`, [req.params.id], async (err, r) => {
        if (!r) return res.redirect('/staff/residents');
        const qrDataUrl = await QRCode.toDataURL(JSON.stringify({ resident_id: r.resident_id, name: `${r.first_name} ${r.last_name}`, barangay: 'San Jose' }));

        const body = `
        <div class="card">
            <div class="card-header">
                <h2>Resident Profile & Digital ID</h2>
                <a href="/staff/residents" class="btn btn-secondary">Back to List</a>
            </div>
            <div style="display:flex; gap:30px; flex-wrap:wrap; align-items:flex-start;">
                <div>
                    <img src="${r.photo || 'https://via.placeholder.com/150'}" style="width:150px; height:180px; object-fit:cover; border-radius:8px; border:1px solid #cbd5e1;">
                </div>
                <div style="flex:1;">
                    <h3>${r.first_name} ${r.middle_name || ''} ${r.last_name} ${r.suffix || ''}</h3>
                    <p style="color:#64748b; margin-bottom:15px;">Resident ID: <strong>${r.resident_id}</strong></p>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:0.9rem;">
                        <p><strong>Date of Birth:</strong> ${r.dob} (${calculateAge(r.dob)} yrs old)</p>
                        <p><strong>Gender:</strong> ${r.gender}</p>
                        <p><strong>Civil Status:</strong> ${r.civil_status}</p>
                        <p><strong>Purok & Address:</strong> ${r.purok}, ${r.address}</p>
                        <p><strong>Contact Number:</strong> ${r.contact_number}</p>
                        <p><strong>Email:</strong> ${r.email}</p>
                        <p><strong>Voter Status:</strong> ${r.voter_status}</p>
                        <p><strong>PWD Status:</strong> ${r.pwd_status}</p>
                    </div>
                </div>
                <div>
                    <div class="id-card-ui">
                        <div class="id-header">
                            <img src="${r.photo || 'https://via.placeholder.com/35'}" alt="Photo">
                            <div>
                                <h4>Barangay San Jose</h4>
                                <p>Digital Resident ID</p>
                            </div>
                        </div>
                        <div class="id-body">
                            <img src="${r.photo || 'https://via.placeholder.com/75'}" class="res-photo" alt="Photo">
                            <div class="id-details">
                                <p><strong>${r.resident_id}</strong></p>
                                <p>${r.first_name} ${r.last_name}</p>
                                <p>${r.purok}, ${r.address}</p>
                                <p>DOB: ${r.dob}</p>
                            </div>
                        </div>
                        <div class="id-footer">
                            <p>Valid 2026</p>
                            <img src="${qrDataUrl}" style="width:35px; height:35px;">
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
        res.send(renderHTML('Resident Profile', body, req.session.userRole, req.session.userName));
    });
});

// Edit Resident
app.get('/staff/residents/edit/:id', (req, res) => {
    db.get(`SELECT * FROM residents WHERE id = ?`, [req.params.id], (err, r) => {
        db.all(`SELECT name FROM puroks`, (err2, puroks) => {
            if (!r) return res.redirect('/staff/residents');
            const body = `
            <div class="card">
                <div class="card-header"><h2>Edit Resident</h2></div>
                <form action="/staff/residents/edit/${r.id}" method="POST" enctype="multipart/form-data">
                    <div class="form-grid">
                        <div class="form-group"><label>First Name</label><input type="text" name="first_name" value="${r.first_name}" class="form-control" required></div>
                        <div class="form-group"><label>Middle Name</label><input type="text" name="middle_name" value="${r.middle_name || ''}" class="form-control"></div>
                        <div class="form-group"><label>Last Name</label><input type="text" name="last_name" value="${r.last_name}" class="form-control" required></div>
                        <div class="form-group"><label>Date of Birth</label><input type="date" name="dob" value="${r.dob}" class="form-control" required></div>
                        <div class="form-group"><label>Gender</label><select name="gender" class="form-control"><option value="Male" ${r.gender==='Male'?'selected':''}>Male</option><option value="Female" ${r.gender==='Female'?'selected':''}>Female</option></select></div>
                        <div class="form-group"><label>Purok</label><select name="purok" class="form-control">${puroks.map(p => `<option value="${p.name}" ${r.purok===p.name?'selected':''}>${p.name}</option>`).join('')}</select></div>
                        <div class="form-group"><label>Address</label><input type="text" name="address" value="${r.address}" class="form-control" required></div>
                        <div class="form-group"><label>Contact Number</label><input type="text" name="contact_number" value="${r.contact_number}" class="form-control" required></div>
                        <div class="form-group"><label>Account Status</label><select name="account_status" class="form-control"><option value="Approved" ${r.account_status==='Approved'?'selected':''}>Approved</option><option value="Pending" ${r.account_status==='Pending'?'selected':''}>Pending</option></select></div>
                        <div class="form-group"><label>New Photo (Optional)</label><input type="file" name="photo" class="form-control" accept="image/*"></div>
                    </div>
                    <button type="submit" class="btn">Update Resident</button>
                </form>
            </div>
            `;
            res.send(renderHTML('Edit Resident', body, req.session.userRole, req.session.userName));
        });
    });
});

app.post('/staff/residents/edit/:id', upload.single('photo'), (req, res) => {
    const { first_name, middle_name, last_name, dob, gender, address, purok, contact_number, account_status } = req.body;
    const photoUpdate = req.file ? `, photo = '/uploads/${req.file.filename}'` : '';
    db.run(`UPDATE residents SET first_name = ?, middle_name = ?, last_name = ?, dob = ?, gender = ?, address = ?, purok = ?, contact_number = ?, account_status = ? ${photoUpdate} WHERE id = ?`,
        [first_name, middle_name, last_name, dob, gender, address, purok, contact_number, account_status, req.params.id],
        (err) => {
            logActivity(req.session.userName, 'Edit Resident', `Updated resident ID ${req.params.id}`);
            res.redirect('/staff/residents');
        }
    );
});

// Archive Resident
app.get('/staff/residents/archive/:id', (req, res) => {
    db.run(`UPDATE residents SET resident_status = 'Archived' WHERE id = ?`, [req.params.id], () => {
        logActivity(req.session.userName, 'Archive Resident', `Archived resident ID ${req.params.id}`);
        res.redirect('/staff/residents');
    });
});

// Print IDs Page (8-up Bond Paper layout)
app.get('/staff/print-ids', (req, res) => {
    db.all(`SELECT * FROM residents WHERE resident_status = 'Active' LIMIT 8`, async (err, residents) => {
        const body = `
        <div class="card no-print">
            <div class="card-header">
                <h2>Print Physical IDs (8 IDs per Bond Paper)</h2>
                <button onclick="window.print()" class="btn"><i class="fa-solid fa-print"></i> Print Now</button>
            </div>
            <p>This page automatically formats resident IDs to fit 8 standard ID cards on one 8.5 x 11 inch bond paper.</p>
        </div>
        <div class="print-grid">
            ${residents.map(r => `
                <div class="id-card-print">
                    <div class="id-header" style="border-bottom:1px solid #1e3a8a; padding-bottom:4px; display:flex; gap:8px; align-items:center;">
                        <img src="${r.photo || 'https://via.placeholder.com/30'}" style="width:30px; height:30px; border-radius:50%; object-fit:cover;">
                        <div>
                            <h4 style="font-size:8pt; color:#1e3a8a; margin:0;">Barangay San Jose</h4>
                            <p style="font-size:6pt; color:#555; margin:0;">Official Barangay ID</p>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; margin-top:4px;">
                        <img src="${r.photo || 'https://via.placeholder.com/50'}" style="width:50px; height:60px; object-fit:cover; border:1px solid #ccc;">
                        <div style="font-size:7pt; line-height:1.2;">
                            <strong>${r.resident_id}</strong><br>
                            ${r.first_name}${r.last_name}<br>
                            ${r.purok},${r.address}<br>
                            DOB: ${r.dob}
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:flex-end; border-top:1px solid #eee; padding-top:2px;">
                        <span style="font-size:5pt; color:#777;">Valid 2026</span>
                        <span style="font-size:5pt; font-weight:bold;">BRGY OFFICIAL</span>
                    </div>
                </div>
            `).join('')}
        </div>
        `;
        res.send(renderHTML('Print IDs', body, req.session.userRole, req.session.userName));
    });
});

// Household Management
app.get('/staff/households', (req, res) => {
    db.all(`SELECT h.*, r.first_name, r.last_name FROM households h LEFT JOIN residents r ON h.household_head_id = r.id WHERE h.status = 'Active'`, (err, households) => {
        db.all(`SELECT * FROM residents WHERE resident_status = 'Active'`, (err2, residents) => {
            db.all(`SELECT name FROM puroks`, (err3, puroks) => {
                const body = `
                <div class="card">
                    <div class="card-header">
                        <h2>Household Management</h2>
                        <a href="#addModal" onclick="document.getElementById('addModal').style.display='flex'" class="btn"><i class="fa-solid fa-house-chimney-medical"></i> Add Household</a>
                    </div>
                    <table>
                        <thead>
                            <tr><th>Household ID</th><th>Household Head</th><th>Purok / Address</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            ${households.map(h => `
                                <tr>
                                    <td><strong>${h.household_id}</strong></td>
                                    <td>${h.first_name ? `${h.first_name} ${h.last_name}` : 'Not Assigned'}</td>
                                    <td>${h.purok} -${h.address}</td>
                                    <td><a href="/staff/households/archive/${h.id}" class="btn btn-sm btn-danger" onclick="return confirm('Archive this household?')"><i class="fa-solid fa-box-archive"></i></a></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <div id="addModal" class="modal">
                    <div class="modal-content">
                        <span class="close-modal" onclick="document.getElementById('addModal').style.display='none'">&times;</span>
                        <h2>Add New Household</h2>
                        <form action="/staff/households/add" method="POST" style="margin-top:15px;">
                            <div class="form-group"><label>Household ID</label><input type="text" name="household_id" value="HH-${Math.floor(10000+Math.random()*90000)}" class="form-control" required></div>
                            <div class="form-group"><label>Household Head</label><select name="household_head_id" class="form-control">${residents.map(r => `<option value="${r.id}">${r.first_name}${r.last_name}</option>`).join('')}</select></div>
                            <div class="form-group"><label>Purok</label><select name="purok" class="form-control">${puroks.map(p => `<option value="${p.name}">${p.name}</option>`).join('')}</select></div>
                            <div class="form-group"><label>Address</label><input type="text" name="address" class="form-control" required></div>
                            <button type="submit" class="btn" style="margin-top:15px;">Save Household</button>
                        </form>
                    </div>
                </div>
                `;
                res.send(renderHTML('Household Management', body, req.session.userRole, req.session.userName));
            });
        });
    });
});

app.post('/staff/households/add', (req, res) => {
    const { household_id, household_head_id, address, purok } = req.body;
    const dateReg = new Date().toISOString().split('T')[0];
    db.run(`INSERT INTO households (household_id, household_head_id, address, purok, date_registered) VALUES (?, ?, ?, ?, ?)`,
        [household_id, household_head_id, address, purok, dateReg], () => {
            logActivity(req.session.userName, 'Add Household', `Added household ${household_id}`);
            res.redirect('/staff/households');
        }
    );
});

app.get('/staff/households/archive/:id', (req, res) => {
    db.run(`UPDATE households SET status = 'Archived' WHERE id = ?`, [req.params.id], () => {
        res.redirect('/staff/households');
    });
});

// Purok Management
app.get('/staff/puroks', (req, res) => {
    db.all(`SELECT * FROM puroks`, (err, puroks) => {
        const body = `
        <div class="card">
            <div class="card-header">
                <h2>Purok Management</h2>
                <form action="/staff/puroks/add" method="POST" style="display:flex; gap:10px;">
                    <input type="text" name="name" placeholder="Purok Name" class="form-control" required>
                    <button type="submit" class="btn">Add Purok</button>
                </form>
            </div>
            <table>
                <thead><tr><th>Purok Name</th><th>Action</th></tr></thead>
                <tbody>
                    ${puroks.map(p => `<tr><td><strong>${p.name}</strong></td><td><a href="/staff/puroks/delete/${p.id}" class="btn btn-sm btn-danger" onclick="return confirm('Delete purok?')"><i class="fa-solid fa-trash"></i></a></td></tr>`).join('')}
                </tbody>
            </table>
        </div>
        `;
        res.send(renderHTML('Purok Management', body, req.session.userRole, req.session.userName));
    });
});

app.post('/staff/puroks/add', (req, res) => {
    db.run(`INSERT INTO puroks (name) VALUES (?)`, [req.body.name], () => { res.redirect('/staff/puroks'); });
});

app.get('/staff/puroks/delete/:id', (req, res) => {
    db.run(`DELETE FROM puroks WHERE id = ?`, [req.params.id], () => { res.redirect('/staff/puroks'); });
});

// Certificate Management
app.get('/staff/certificates', (req, res) => {
    db.all(`SELECT c.*, r.first_name, r.last_name FROM certificates c JOIN residents r ON c.resident_id = r.resident_id`, (err, certs) => {
        const body = `
        <div class="card">
            <div class="card-header"><h2>Certificate Requests & Issuance</h2></div>
            <table>
                <thead>
                    <tr><th>Cert #</th><th>Resident</th><th>Type</th><th>Purpose</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                    ${certs.map(c => `
                        <tr>
                            <td><strong>${c.cert_number}</strong></td>
                            <td>${c.first_name}${c.last_name}</td>
                            <td>${c.cert_type}</td>
                            <td>${c.purpose}</td>
                            <td><span class="badge badge-info">${c.status}</span></td>
                            <td>
                                <a href="/staff/certificates/approve/${c.id}" class="btn btn-sm btn-success" title="Approve"><i class="fa-solid fa-check"></i></a>
                                <a href="/staff/certificates/print/${c.id}" target="_blank" class="btn btn-sm" title="Print"><i class="fa-solid fa-print"></i></a>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        `;
        res.send(renderHTML('Certificate Management', body, req.session.userRole, req.session.userName));
    });
});

app.get('/staff/certificates/approve/:id', (req, res) => {
    db.run(`UPDATE certificates SET status = 'Approved' WHERE id = ?`, [req.params.id], () => {
        res.redirect('/staff/certificates');
    });
});

app.get('/staff/certificates/print/:id', (req, res) => {
    db.get(`SELECT c.*, r.first_name, r.last_name, r.address, r.purok FROM certificates c JOIN residents r ON c.resident_id = r.resident_id WHERE c.id = ?`, [req.params.id], async (err, cert) => {
        db.all(`SELECT key, value FROM settings`, async (err2, rows) => {
            const settings = {};
            rows.forEach(r => settings[r.key] = r.value);
            const qrDataUrl = await QRCode.toDataURL(`https://${req.get('host')}/verify/${cert.cert_number}`);

            const html = `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>${cert.cert_type} - ${settings.brgy_name}</title>
                <style>
                    body { font-family: 'Times New Roman', serif; padding: 40px; line-height: 1.6; }
                    .header { text-align: center; margin-bottom: 30px; }
                    .header h2, .header h3, .header p { margin: 2px; }
                    .content { margin: 40px 0; font-size: 1.1rem; text-align: justify; }
                    .footer { display: flex; justify-content: space-between; margin-top: 80px; align-items: center; }
                    .sig { text-align: center; border-top: 1px solid #000; width: 250px; padding-top: 5px; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="no-print" style="margin-bottom:20px;"><button onclick="window.print()" style="padding:10px 20px; background:#1e3a8a; color:#fff; border:none; border-radius:5px; cursor:pointer;">Print Certificate</button></div>
                <div class="header">
                    <h3>Republic of the Philippines</h3>
                    <h3>${settings.municipality}, ${settings.province}</h3>
                    <h2>${settings.brgy_name}</h2>
                    <h1 style="margin-top:30px; letter-spacing:2px; color:#1e3a8a;">${cert.cert_type.toUpperCase()}</h1>
                </div>
                <div class="content">
                    <p><strong>TO WHOM IT MAY CONCERN:</strong></p>
                    <p>This is to certify that <strong>${cert.first_name} ${cert.last_name}</strong>, of legal age, is a permanent resident of ${cert.purok}, ${cert.address}, ${settings.brgy_name}, ${settings.municipality}.</p>
                    <p>This certification is issued upon the request of the above-named person for <strong>${cert.purpose}</strong> and for whatever legal purpose it may serve.</p>
                    <p>Given this ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} at ${settings.brgy_name}, ${settings.municipality}.</p>
                </div>
                <div class="footer">
                    <div><img src="${qrDataUrl}" style="width:90px; height:90px;"><br><small>Cert #: ${cert.cert_number}</small></div>
                    <div class="sig">
                        <strong>${settings.captain}</strong><br>
                        Punong Barangay
                    </div>
                </div>
            </body>
            </html>`;
            res.send(html);
        });
    });
});

// Appointment Management
app.get('/staff/appointments', (req, res) => {
    db.all(`SELECT a.*, r.first_name, r.last_name FROM appointments a JOIN residents r ON a.resident_id = r.resident_id`, (err, appts) => {
        const body = `
        <div class="card">
            <div class="card-header"><h2>Appointments Management</h2></div>
            <table>
                <thead><tr><th>Resident</th><th>Service</th><th>Date & Time</th><th>Purpose</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                    ${appts.map(a => `
                        <tr>
                            <td>${a.first_name}${a.last_name}</td>
                            <td>${a.service}</td>
                            <td>${a.appointment_date}${a.appointment_time}</td>
                            <td>${a.purpose}</td>
                            <td><span class="badge badge-warning">${a.status}</span></td>
                            <td><a href="/staff/appointments/approve/${a.id}" class="btn btn-sm btn-success"><i class="fa-solid fa-check"></i></a></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        `;
        res.send(renderHTML('Appointments', body, req.session.userRole, req.session.userName));
    });
});

app.get('/staff/appointments/approve/:id', (req, res) => {
    db.run(`UPDATE appointments SET status = 'Approved' WHERE id = ?`, [req.params.id], () => { res.redirect('/staff/appointments'); });
});

// Blotter Management
app.get('/staff/blotter', (req, res) => {
    db.all(`SELECT * FROM blotter`, (err, cases) => {
        const body = `
        <div class="card">
            <div class="card-header">
                <h2>Barangay Blotter Records</h2>
                <a href="#blotterModal" onclick="document.getElementById('blotterModal').style.display='flex'" class="btn"><i class="fa-solid fa-plus"></i> File Case</a>
            </div>
            <table>
                <thead><tr><th>Case #</th><th>Complainant</th><th>Respondent</th><th>Type</th><th>Status</th></tr></thead>
                <tbody>
                    ${cases.map(b => `<tr><td><strong>${b.case_number}</strong></td><td>${b.complainant}</td><td>${b.respondent}</td><td>${b.incident_type}</td><td><span class="badge badge-danger">${b.status}</span></td></tr>`).join('')}
                </tbody>
            </table>
        </div>
        <div id="blotterModal" class="modal">
            <div class="modal-content">
                <span class="close-modal" onclick="document.getElementById('blotterModal').style.display='none'">&times;</span>
                <h2>File Blotter Case</h2>
                <form action="/staff/blotter/add" method="POST" style="margin-top:15px;">
                    <div class="form-group"><label>Case Number</label><input type="text" name="case_number" value="CASE-${Math.floor(1000+Math.random()*9000)}" class="form-control" required></div>
                    <div class="form-group"><label>Complainant</label><input type="text" name="complainant" class="form-control" required></div>
                    <div class="form-group"><label>Respondent</label><input type="text" name="respondent" class="form-control" required></div>
                    <div class="form-group"><label>Incident Type</label><input type="text" name="incident_type" class="form-control" required></div>
                    <div class="form-group"><label>Description</label><textarea name="description" class="form-control" rows="3" required></textarea></div>
                    <button type="submit" class="btn" style="margin-top:15px;">Save Case</button>
                </form>
            </div>
        </div>
        `;
        res.send(renderHTML('Blotter Management', body, req.session.userRole, req.session.userName));
    });
});

app.post('/staff/blotter/add', (req, res) => {
    const { case_number, complainant, respondent, incident_type, description } = req.body;
    db.run(`INSERT INTO blotter (case_number, complainant, respondent, incident_type, description) VALUES (?, ?, ?, ?, ?)`,
        [case_number, complainant, respondent, incident_type, description], () => { res.redirect('/staff/blotter'); });
});

// Assistance Management
app.get('/staff/assistance', (req, res) => {
    db.all(`SELECT a.*, r.first_name, r.last_name FROM assistance a JOIN residents r ON a.resident_id = r.resident_id`, (err, items) => {
        const body = `
        <div class="card">
            <div class="card-header"><h2>Assistance Requests</h2></div>
            <table>
                <thead><tr><th>Resident</th><th>Type</th><th>Details</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                    ${items.map(i => `<tr><td>${i.first_name}${i.last_name}</td><td>${i.assistance_type}</td><td>${i.details}</td><td><span class="badge badge-warning">${i.status}</span></td><td><a href="/staff/assistance/approve/${i.id}" class="btn btn-sm btn-success"><i class="fa-solid fa-check"></i></a></td></tr>`).join('')}
                </tbody>
            </table>
        </div>
        `;
        res.send(renderHTML('Assistance Management', body, req.session.userRole, req.session.userName));
    });
});

app.get('/staff/assistance/approve/:id', (req, res) => {
    db.run(`UPDATE assistance SET status = 'Approved' WHERE id = ?`, [req.params.id], () => { res.redirect('/staff/assistance'); });
});

// Business Management
app.get('/staff/businesses', (req, res) => {
    db.all(`SELECT * FROM businesses`, (err, businesses) => {
        const body = `
        <div class="card">
            <div class="card-header">
                <h2>Barangay Businesses</h2>
                <a href="#bizModal" onclick="document.getElementById('bizModal').style.display='flex'" class="btn"><i class="fa-solid fa-store"></i> Register Business</a>
            </div>
            <table>
                <thead><tr><th>Business Name</th><th>Owner</th><th>Type</th><th>Permit #</th><th>Status</th></tr></thead>
                <tbody>
                    ${businesses.map(b => `<tr><td><strong>${b.business_name}</strong></td><td>${b.owner_name}</td><td>${b.business_type}</td><td>${b.permit_number}</td><td><span class="badge badge-success">${b.status}</span></td></tr>`).join('')}
                </tbody>
            </table>
        </div>
        <div id="bizModal" class="modal">
            <div class="modal-content">
                <span class="close-modal" onclick="document.getElementById('bizModal').style.display='none'">&times;</span>
                <h2>Register Business</h2>
                <form action="/staff/businesses/add" method="POST" style="margin-top:15px;">
                    <div class="form-group"><label>Business Name</label><input type="text" name="business_name" class="form-control" required></div>
                    <div class="form-group"><label>Owner Name</label><input type="text" name="owner_name" class="form-control" required></div>
                    <div class="form-group"><label>Business Type</label><input type="text" name="business_type" class="form-control" required></div>
                    <div class="form-group"><label>Permit Number</label><input type="text" name="permit_number" value="BP-${Math.floor(1000+Math.random()*9000)}" class="form-control" required></div>
                    <button type="submit" class="btn" style="margin-top:15px;">Save Business</button>
                </form>
            </div>
        </div>
        `;
        res.send(renderHTML('Business Management', body, req.session.userRole, req.session.userName));
    });
});

app.post('/staff/businesses/add', (req, res) => {
    const { business_name, owner_name, business_type, permit_number } = req.body;
    db.run(`INSERT INTO businesses (business_name, owner_name, business_type, permit_number) VALUES (?, ?, ?, ?)`,
        [business_name, owner_name, business_type, permit_number], () => { res.redirect('/staff/businesses'); });
});

// Announcement System
app.get('/staff/announcements', (req, res) => {
    db.all(`SELECT * FROM announcements ORDER BY id DESC`, (err, items) => {
        const body = `
        <div class="card">
            <div class="card-header">
                <h2>Barangay Announcements</h2>
                <form action="/staff/announcements/add" method="POST" style="display:flex; gap:10px; width:100%; margin-top:15px;">
                    <input type="text" name="title" placeholder="Announcement Title" class="form-control" required style="flex:1;">
                    <input type="text" name="category" placeholder="Category" class="form-control" style="width:150px;" required>
                    <input type="text" name="content" placeholder="Content details..." class="form-control" required style="flex:2;">
                    <button type="submit" class="btn">Post</button>
                </form>
            </div>
            <table>
                <thead><tr><th>Title</th><th>Category</th><th>Content</th><th>Date</th></tr></thead>
                <tbody>
                    ${items.map(a => `<tr><td><strong>${a.title}</strong></td><td><span class="badge badge-info">${a.category}</span></td><td>${a.content}</td><td>${a.date_posted}</td></tr>`).join('')}
                </tbody>
            </table>
        </div>
        `;
        res.send(renderHTML('Announcements', body, req.session.userRole, req.session.userName));
    });
});

app.post('/staff/announcements/add', (req, res) => {
    const { title, category, content } = req.body;
    db.run(`INSERT INTO announcements (title, category, content) VALUES (?, ?, ?)`, [title, category, content], () => {
        db.all(`SELECT resident_id FROM residents`, (err, residents) => {
            residents.forEach(r => sendNotification(r.resident_id, `New Announcement: ${title}`));
            res.redirect('/staff/announcements');
        });
    });
});

// Reports
app.get('/staff/reports', (req, res) => {
    db.all(`SELECT * FROM residents WHERE resident_status = 'Active'`, (err, residents) => {
        const body = `
        <div class="card">
            <div class="card-header">
                <h2>Barangay Comprehensive Reports</h2>
                <button onclick="window.print()" class="btn"><i class="fa-solid fa-print"></i> Print Report</button>
            </div>
            <p>Total Active Residents in Database: <strong>${residents.length}</strong></p>
            <p>Male: <strong>${residents.filter(r=>r.gender==='Male').length}</strong> | Female: <strong>${residents.filter(r=>r.gender==='Female').length}</strong></p>
            <p>Senior Citizens: <strong>${residents.filter(r=>calculateAge(r.dob)>=60).length}</strong> | Voters: <strong>${residents.filter(r=>r.voter_status==='Yes').length}</strong></p>
        </div>
        `;
        res.send(renderHTML('Reports', body, req.session.userRole, req.session.userName));
    });
});

// Archive System
app.get('/staff/archives', (req, res) => {
    db.all(`SELECT * FROM residents WHERE resident_status = 'Archived'`, (err, residents) => {
        const body = `
        <div class="card">
            <div class="card-header"><h2>Archived Residents</h2></div>
            <table>
                <thead><tr><th>ID</th><th>Name</th><th>Action</th></tr></thead>
                <tbody>
                    ${residents.map(r => `<tr><td>${r.resident_id}</td><td>${r.first_name}${r.last_name}</td><td><a href="/staff/residents/restore/${r.id}" class="btn btn-sm btn-success">Restore</a></td></tr>`).join('')}
                </tbody>
            </table>
        </div>
        `;
        res.send(renderHTML('Archives', body, req.session.userRole, req.session.userName));
    });
});

app.get('/staff/residents/restore/:id', (req, res) => {
    db.run(`UPDATE residents SET resident_status = 'Active' WHERE id = ?`, [req.params.id], () => { res.redirect('/staff/archives'); });
});

// Staff Accounts (Admin only)
app.get('/staff/accounts', (req, res) => {
    if (req.session.userRole !== 'Administrator') return res.redirect('/staff/dashboard');
    db.all(`SELECT * FROM staff`, (err, staffList) => {
        const body = `
        <div class="card">
            <div class="card-header">
                <h2>Staff Accounts Management</h2>
                <a href="#staffModal" onclick="document.getElementById('staffModal').style.display='flex'" class="btn"><i class="fa-solid fa-user-shield"></i> Add Staff</a>
            </div>
            <table>
                <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th></tr></thead>
                <tbody>
                    ${staffList.map(s => `<tr><td>${s.full_name}</td><td>${s.username}</td><td><span class="badge badge-info">${s.role}</span></td><td>${s.status}</td></tr>`).join('')}
                </tbody>
            </table>
        </div>
        <div id="staffModal" class="modal">
            <div class="modal-content">
                <span class="close-modal" onclick="document.getElementById('staffModal').style.display='none'">&times;</span>
                <h2>Add Staff Account</h2>
                <form action="/staff/accounts/add" method="POST" style="margin-top:15px;">
                    <div class="form-group"><label>Full Name</label><input type="text" name="full_name" class="form-control" required></div>
                    <div class="form-group"><label>Username</label><input type="text" name="username" class="form-control" required></div>
                    <div class="form-group"><label>Password</label><input type="password" name="password" class="form-control" required></div>
                    <div class="form-group"><label>Role</label><select name="role" class="form-control"><option value="Staff">Staff</option><option value="Barangay Secretary">Barangay Secretary</option><option value="Administrator">Administrator</option></select></div>
                    <button type="submit" class="btn" style="margin-top:15px;">Create Staff</button>
                </form>
            </div>
        </div>
        `;
        res.send(renderHTML('Staff Accounts', body, req.session.userRole, req.session.userName));
    });
});

app.post('/staff/accounts/add', async (req, res) => {
    if (req.session.userRole !== 'Administrator') return res.redirect('/staff/dashboard');
    const { full_name, username, password, role } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO staff (full_name, username, password, role) VALUES (?, ?, ?, ?)`, [full_name, username, hashed, role], () => {
        res.redirect('/staff/accounts');
    });
});

// Barangay Settings (Admin only)
app.get('/staff/settings', (req, res) => {
    if (req.session.userRole !== 'Administrator') return res.redirect('/staff/dashboard');
    db.all(`SELECT key, value FROM settings`, (err, rows) => {
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);

        const body = `
        <div class="card">
            <div class="card-header"><h2>Barangay Settings & Customization</h2></div>
            <form action="/staff/settings" method="POST" enctype="multipart/form-data">
                <div class="form-grid">
                    <div class="form-group"><label>Barangay Name</label><input type="text" name="brgy_name" value="${settings.brgy_name || ''}" class="form-control" required></div>
                    <div class="form-group"><label>Municipality / City</label><input type="text" name="municipality" value="${settings.municipality || ''}" class="form-control" required></div>
                    <div class="form-group"><label>Province</label><input type="text" name="province" value="${settings.province || ''}" class="form-control" required></div>
                    <div class="form-group"><label>Address</label><input type="text" name="brgy_address" value="${settings.brgy_address || ''}" class="form-control" required></div>
                    <div class="form-group"><label>Barangay Captain</label><input type="text" name="captain" value="${settings.captain || ''}" class="form-control" required></div>
                    <div class="form-group"><label>Contact Number</label><input type="text" name="contact_number" value="${settings.contact_number || ''}" class="form-control" required></div>
                    <div class="form-group"><label>Email</label><input type="email" name="email" value="${settings.email || ''}" class="form-control" required></div>
                    <div class="form-group"><label>Barangay Logo</label><input type="file" name="logo" class="form-control" accept="image/*"></div>
                </div>
                <button type="submit" class="btn" style="margin-top:20px;">Save Settings</button>
            </form>
        </div>
        `;
        res.send(renderHTML('Barangay Settings', body, req.session.userRole, req.session.userName));
    });
});

app.post('/staff/settings', upload.single('logo'), (req, res) => {
    if (req.session.userRole !== 'Administrator') return res.redirect('/staff/dashboard');
    const fields = req.body;
    if (req.file) {
        fields.logo = '/uploads/' + req.file.filename;
        // Also save as static logo.png for sidebar if needed
        fs.copyFileSync(req.file.path, path.join(uploadDir, 'logo.png'));
    }
    Object.keys(fields).forEach(key => {
        db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, fields[key]]);
    });
    res.redirect('/staff/settings');
});

// Activity Logs
app.get('/staff/logs', (req, res) => {
    if (req.session.userRole !== 'Administrator') return res.redirect('/staff/dashboard');
    db.all(`SELECT * FROM activity_logs ORDER BY id DESC`, (err, logs) => {
        const body = `
        <div class="card">
            <div class="card-header"><h2>System Activity Logs</h2></div>
            <table>
                <thead><tr><th>User</th><th>Action</th><th>Details</th><th>Date & Time</th></tr></thead>
                <tbody>
                    ${logs.map(l => `<tr><td>${l.user_name}</td><td>${l.action}</td><td>${l.details}</td><td>${l.date_time}</td></tr>`).join('')}
                </tbody>
            </table>
        </div>
        `;
        res.send(renderHTML('Activity Logs', body, req.session.userRole, req.session.userName));
    });
});

// ================= RESIDENT PORTAL ROUTES =================

app.use('/resident', (req, res, next) => {
    if (req.session.userRole === 'Resident') {
        next();
    } else {
        res.redirect('/resident-login');
    }
});

app.get('/resident/dashboard', (req, res) => {
    db.get(`SELECT * FROM residents WHERE resident_id = ?`, [req.session.residentId], (err, r) => {
        db.all(`SELECT * FROM certificates WHERE resident_id = ?`, [req.session.residentId], (err2, certs) => {
            db.all(`SELECT * FROM appointments WHERE resident_id = ?`, [req.session.residentId], (err3, appts) => {
                db.all(`SELECT * FROM notifications WHERE resident_id = ? ORDER BY id DESC`, [req.session.residentId], (err4, notifs) => {
                    const body = `
                    <div class="card">
                        <h2>Welcome, ${r.first_name} ${r.last_name}!</h2>
                        <p>Resident ID: <strong>${r.resident_id}</strong> | Purok: <strong>${r.purok}</strong></p>
                    </div>

                    <div class="card-grid">
                        <div class="stat-card">
                            <div class="stat-info"><h3>${certs.filter(c=>c.status==='Pending').length}</h3><p>Pending Requests</p></div>
                        </div>
                        <div class="stat-card green">
                            <div class="stat-info"><h3>${certs.filter(c=>c.status==='Approved').length}</h3><p>Approved Certificates</p></div>
                        </div>
                        <div class="stat-card yellow">
                            <div class="stat-info"><h3>${appts.length}</h3><p>Appointments</p></div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header"><h2>My Notifications</h2></div>
                        <ul>
                            ${notifs.map(n => `<li style="padding:8px 0; border-bottom:1px solid #cbd5e1;">${n.message} <small style="color:#64748b; float:right;">${n.date_created}</small></li>`).join('')}
                        </ul>
                    </div>
                    `;
                    res.send(renderHTML('Resident Dashboard', body, req.session.userRole, req.session.userName));
                });
            });
        });
    });
});

app.get('/resident/profile', (req, res) => {
    db.get(`SELECT * FROM residents WHERE resident_id = ?`, [req.session.residentId], async (err, r) => {
        const qrDataUrl = await QRCode.toDataURL(JSON.stringify({ resident_id: r.resident_id, name: `${r.first_name} ${r.last_name}`, barangay: 'San Jose' }));

        const body = `
        <div class="card" style="text-align:center;">
            <div class="card-header"><h2>My Digital Resident ID</h2></div>
            <div style="display:inline-block; margin:20px auto;">
                <div class="id-card-ui" style="margin:0 auto;">
                    <div class="id-header">
                        <img src="${r.photo || 'https://via.placeholder.com/35'}" alt="Photo">
                        <div>
                            <h4>Barangay San Jose</h4>
                            <p>Digital Resident ID</p>
                        </div>
                    </div>
                    <div class="id-body">
                        <img src="${r.photo || 'https://via.placeholder.com/75'}" class="res-photo" alt="Photo">
                        <div class="id-details" style="text-align:left;">
                            <p><strong>${r.resident_id}</strong></p>
                            <p>${r.first_name} ${r.last_name}</p>
                            <p>${r.purok}, ${r.address}</p>
                            <p>DOB: ${r.dob}</p>
                        </div>
                    </div>
                    <div class="id-footer">
                        <p>Valid 2026</p>
                        <img src="${qrDataUrl}" style="width:35px; height:35px;">
                    </div>
                </div>
            </div>
        </div>
        `;
        res.send(renderHTML('My Digital ID', body, req.session.userRole, req.session.userName));
    });
});

app.get('/resident/certificates', (req, res) => {
    db.all(`SELECT * FROM certificates WHERE resident_id = ?`, [req.session.residentId], (err, certs) => {
        const body = `
        <div class="card">
            <div class="card-header">
                <h2>My Certificate Requests</h2>
                <a href="#certModal" onclick="document.getElementById('certModal').style.display='flex'" class="btn"><i class="fa-solid fa-file-circle-plus"></i> Request Certificate</a>
            </div>
            <table>
                <thead><tr><th>Cert #</th><th>Type</th><th>Purpose</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                    ${certs.map(c => `<tr><td>${c.cert_number}</td><td>${c.cert_type}</td><td>${c.purpose}</td><td><span class="badge badge-info">${c.status}</span></td><td>${c.status==='Approved' ? `<a href="/staff/certificates/print/${c.id}" target="_blank" class="btn btn-sm"><i class="fa-solid fa-print"></i> Print</a>` : ''}</td></tr>`).join('')}
                </tbody>
            </table>
        </div>
        <div id="certModal" class="modal">
            <div class="modal-content">
                <span class="close-modal" onclick="document.getElementById('certModal').style.display='none'">&times;</span>
                <h2>Request Barangay Certificate</h2>
                <form action="/resident/certificates/request" method="POST" style="margin-top:15px;">
                    <div class="form-group"><label>Certificate Type</label><select name="cert_type" class="form-control"><option value="Barangay Clearance">Barangay Clearance</option><option value="Certificate of Residency">Certificate of Residency</option><option value="Certificate of Indigency">Certificate of Indigency</option></select></div>
                    <div class="form-group"><label>Purpose</label><input type="text" name="purpose" class="form-control" required></div>
                    <button type="submit" class="btn" style="margin-top:15px;">Submit Request</button>
                </form>
            </div>
        </div>
        `;
        res.send(renderHTML('Certificates', body, req.session.userRole, req.session.userName));
    });
});

app.post('/resident/certificates/request', (req, res) => {
    const { cert_type, purpose } = req.body;
    generateCertNumber((certNumber) => {
        db.run(`INSERT INTO certificates (cert_number, resident_id, cert_type, purpose, date_issued) VALUES (?, ?, ?, ?, ?)`,
            [certNumber, req.session.residentId, cert_type, purpose, new Date().toISOString().split('T')[0]], () => {
                sendNotification(req.session.residentId, `Certificate request for ${cert_type} submitted successfully.`);
                res.redirect('/resident/certificates');
            }
        );
    });
});

app.get('/resident/appointments', (req, res) => {
    db.all(`SELECT * FROM appointments WHERE resident_id = ?`, [req.session.residentId], (err, appts) => {
        const body = `
        <div class="card">
            <div class="card-header">
                <h2>My Appointments</h2>
                <a href="#apptModal" onclick="document.getElementById('apptModal').style.display='flex'" class="btn"><i class="fa-solid fa-calendar-plus"></i> Book Appointment</a>
            </div>
            <table>
                <thead><tr><th>Service</th><th>Date & Time</th><th>Purpose</th><th>Status</th></tr></thead>
                <tbody>
                    ${appts.map(a => `<tr><td>${a.service}</td><td>${a.appointment_date} ${a.appointment_time}</td><td>${a.purpose}</td><td><span class="badge badge-warning">${a.status}</span></td></tr>`).join('')}
                </tbody>
            </table>
        </div>
        <div id="apptModal" class="modal">
            <div class="modal-content">
                <span class="close-modal" onclick="document.getElementById('apptModal').style.display='none'">&times;</span>
                <h2>Book Appointment</h2>
                <form action="/resident/appointments/book" method="POST" style="margin-top:15px;">
                    <div class="form-group"><label>Service</label><input type="text" name="service" class="form-control" required></div>
                    <div class="form-group"><label>Date</label><input type="date" name="appointment_date" class="form-control" required></div>
                    <div class="form-group"><label>Time</label><input type="time" name="appointment_time" class="form-control" required></div>
                    <div class="form-group"><label>Purpose</label><input type="text" name="purpose" class="form-control" required></div>
                    <button type="submit" class="btn" style="margin-top:15px;">Book Appointment</button>
                </form>
            </div>
        </div>
        `;
        res.send(renderHTML('Appointments', body, req.session.userRole, req.session.userName));
    });
});

app.post('/resident/appointments/book', (req, res) => {
    const { service, appointment_date, appointment_time, purpose } = req.body;
    db.run(`INSERT INTO appointments (resident_id, service, appointment_date, appointment_time, purpose) VALUES (?, ?, ?, ?, ?)`,
        [req.session.residentId, service, appointment_date, appointment_time, purpose], () => {
            res.redirect('/resident/appointments');
        }
    );
});

app.get('/resident/complaints', (req, res) => {
    const body = `
    <div class="card">
        <div class="card-header"><h2>File a Complaint / Blotter</h2></div>
        <form action="/resident/complaints" method="POST">
            <div class="form-group"><label>Respondent / Against Whom</label><input type="text" name="respondent" class="form-control" required></div>
            <div class="form-group"><label>Incident Type</label><input type="text" name="incident_type" class="form-control" required></div>
            <div class="form-group"><label>Description</label><textarea name="description" class="form-control" rows="4" required></textarea></div>
            <button type="submit" class="btn" style="margin-top:15px;">Submit Complaint</button>
        </form>
    </div>
    `;
    res.send(renderHTML('Complaints', body, req.session.userRole, req.session.userName));
});

app.post('/resident/complaints', (req, res) => {
    const { respondent, incident_type, description } = req.body;
    db.get(`SELECT first_name, last_name FROM residents WHERE resident_id = ?`, [req.session.residentId], (err, r) => {
        const caseNo = 'CASE-' + Math.floor(1000 + Math.random() * 9000);
        db.run(`INSERT INTO blotter (case_number, complainant, respondent, incident_type, description) VALUES (?, ?, ?, ?, ?)`,
            [caseNo, `${r.first_name} ${r.last_name}`, respondent, incident_type, description], () => {
                res.redirect('/resident/dashboard');
            }
        );
    });
});

app.get('/resident/assistance', (req, res) => {
    const body = `
    <div class="card">
        <div class="card-header"><h2>Request Financial/Medical Assistance</h2></div>
        <form action="/resident/assistance" method="POST">
            <div class="form-group"><label>Assistance Type</label><select name="assistance_type" class="form-control"><option value="Financial">Financial Assistance</option><option value="Medical">Medical Assistance</option><option value="Educational">Educational Assistance</option><option value="Food">Food Assistance</option></select></div>
            <div class="form-group"><label>Details / Reason</label><textarea name="details" class="form-control" rows="4" required></textarea></div>
            <button type="submit" class="btn" style="margin-top:15px;">Submit Request</button>
        </form>
    </div>
    `;
    res.send(renderHTML('Assistance', body, req.session.userRole, req.session.userName));
});

app.post('/resident/assistance', (req, res) => {
    const { assistance_type, details } = req.body;
    db.run(`INSERT INTO assistance (resident_id, assistance_type, details) VALUES (?, ?, ?)`,
        [req.session.residentId, assistance_type, details], () => {
            res.redirect('/resident/dashboard');
        }
    );
});

app.get('/resident/announcements', (req, res) => {
    db.all(`SELECT * FROM announcements ORDER BY id DESC`, (err, items) => {
        const body = `
        <div class="card">
            <div class="card-header"><h2>Barangay Announcements & Events</h2></div>
            ${items.map(a => `<div style="padding:15px 0; border-bottom:1px solid #cbd5e1;"><h3>${a.title} <span class="badge badge-info">${a.category}</span></h3><p style="margin:5px 0;">${a.content}</p><small style="color:#64748b;">Posted on: ${a.date_posted}</small></div>`).join('')}
        </div>
        `;
        res.send(renderHTML('Announcements', body, req.session.userRole, req.session.userName));
    });
});

// Root redirect
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Start Server
app.listen(PORT, () => {
    console.log(`Barangay Resident Management System running on port ${PORT}`);
});
