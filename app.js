/**
 * Barangay Resident Management System - app.js
 * Comprehensive, production-ready full-stack Node.js application.
 * Contains database initialization, authentication, roles, staff portal,
 * resident portal, certificate workflow, digital IDs, printable 8-up ID sheets,
 * household management, purok management, blotter, assistance, reports, settings, and UI.
 */

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|pdf|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only images and PDF files are allowed!'));
    }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'brgy-super-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true if using HTTPS in production
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

const dbFile = path.join(__dirname, 'barangay.db');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initializeDatabaseTables();
    }
});

function initializeDatabaseTables() {
    db.serialize(() => {
        // Barangay Settings
        db.run(`CREATE TABLE IF NOT EXISTS barangay_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            barangay_name TEXT DEFAULT 'Barangay San Jose',
            municipality TEXT DEFAULT 'Municipality of Metropolis',
            province TEXT DEFAULT 'Province of Central',
            region TEXT DEFAULT 'Region IV-A',
            address TEXT DEFAULT '123 Main Street, Barangay Hall',
            contact_number TEXT DEFAULT '+63 912 345 6789',
            email TEXT DEFAULT 'contact@sanjose.gov.ph',
            captain_name TEXT DEFAULT 'Hon. Juaning Capitan',
            secretary_name TEXT DEFAULT 'Maria Sekretarya',
            logo_url TEXT DEFAULT '',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT CHECK(role IN ('Admin', 'Staff', 'Resident')) NOT NULL,
            status TEXT CHECK(status IN ('Active', 'Inactive', 'Pending')) DEFAULT 'Active',
            resident_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Puroks Table
        db.run(`CREATE TABLE IF NOT EXISTS puroks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Households Table
        db.run(`CREATE TABLE IF NOT EXISTS households (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            household_number TEXT UNIQUE NOT NULL,
            address TEXT NOT NULL,
            purok_id INTEGER,
            head_resident_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(purok_id) REFERENCES puroks(id)
        )`);

        // Residents Table (Complete profile fields)
        db.run(`CREATE TABLE IF NOT EXISTS residents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id_number TEXT UNIQUE NOT NULL,
            first_name TEXT NOT NULL,
            middle_name TEXT,
            last_name TEXT NOT NULL,
            suffix TEXT,
            date_of_birth TEXT NOT NULL,
            gender TEXT NOT NULL,
            civil_status TEXT NOT NULL,
            address TEXT NOT NULL,
            purok_id INTEGER,
            household_id INTEGER,
            contact_number TEXT,
            email TEXT,
            occupation TEXT,
            educational_attainment TEXT,
            nationality TEXT DEFAULT 'Filipino',
            voter_status TEXT CHECK(voter_status IN ('Registered', 'Not Registered')) DEFAULT 'Registered',
            senior_citizen TEXT CHECK(senior_citizen IN ('Yes', 'No')) DEFAULT 'No',
            pwd TEXT CHECK(pwd IN ('Yes', 'No')) DEFAULT 'No',
            solo_parent TEXT CHECK(solo_parent IN ('Yes', 'No')) DEFAULT 'No',
            four_ps TEXT CHECK(four_ps IN ('Yes', 'No')) DEFAULT 'No',
            photo_url TEXT DEFAULT '',
            qr_code TEXT DEFAULT '',
            status TEXT CHECK(status IN ('Active', 'Archived', 'Pending')) DEFAULT 'Active',
            archive_reason TEXT,
            date_registered DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(purok_id) REFERENCES puroks(id),
            FOREIGN KEY(household_id) REFERENCES households(id)
        )`);

        // Certificate Requests Table
        db.run(`CREATE TABLE IF NOT EXISTS certificate_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_number TEXT UNIQUE NOT NULL,
            resident_id INTEGER NOT NULL,
            certificate_type TEXT NOT NULL,
            purpose TEXT NOT NULL,
            additional_info TEXT,
            status TEXT CHECK(status IN ('Pending', 'Processing', 'Approved', 'Ready for Release', 'Released', 'Rejected')) DEFAULT 'Pending',
            staff_remarks TEXT,
            certificate_file TEXT,
            processed_by INTEGER,
            date_requested DATETIME DEFAULT CURRENT_TIMESTAMP,
            date_processed DATETIME,
            date_released DATETIME,
            FOREIGN KEY(resident_id) REFERENCES residents(id),
            FOREIGN KEY(processed_by) REFERENCES users(id)
        )`);

        // Appointments Table
        db.run(`CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id INTEGER NOT NULL,
            service TEXT NOT NULL,
            appointment_date TEXT NOT NULL,
            appointment_time TEXT NOT NULL,
            purpose TEXT NOT NULL,
            notes TEXT,
            status TEXT CHECK(status IN ('Pending', 'Approved', 'Rescheduled', 'Cancelled', 'Completed')) DEFAULT 'Pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(resident_id) REFERENCES residents(id)
        )`);

        // Complaints Table
        db.run(`CREATE TABLE IF NOT EXISTS complaints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id INTEGER NOT NULL,
            concern_type TEXT NOT NULL,
            description TEXT NOT NULL,
            incident_date TEXT NOT NULL,
            location TEXT NOT NULL,
            attachment TEXT,
            status TEXT CHECK(status IN ('Submitted', 'Under Review', 'Investigating', 'Resolved', 'Closed')) DEFAULT 'Submitted',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(resident_id) REFERENCES residents(id)
        )`);

        // Blotter Cases Table
        db.run(`CREATE TABLE IF NOT EXISTS blotter_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_number TEXT UNIQUE NOT NULL,
            complainant TEXT NOT NULL,
            respondent TEXT NOT NULL,
            incident_date TEXT NOT NULL,
            incident_time TEXT NOT NULL,
            location TEXT NOT NULL,
            description TEXT NOT NULL,
            witnesses TEXT,
            action_taken TEXT,
            settlement TEXT,
            status TEXT CHECK(status IN ('Open', 'Under Investigation', 'Settled', 'Closed')) DEFAULT 'Open',
            attachments TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Assistance Requests Table
        db.run(`CREATE TABLE IF NOT EXISTS assistance_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id INTEGER NOT NULL,
            assistance_type TEXT NOT NULL,
            reason TEXT NOT NULL,
            supporting_doc TEXT,
            status TEXT CHECK(status IN ('Pending', 'Under Review', 'Approved', 'Rejected', 'Released')) DEFAULT 'Pending',
            remarks TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(resident_id) REFERENCES residents(id)
        )`);

        // Announcements Table
        db.run(`CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            image_url TEXT,
            priority TEXT CHECK(priority IN ('Normal', 'Important', 'Emergency')) DEFAULT 'Normal',
            expiration_date TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Notifications Table
        db.run(`CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // Feedback Table
        db.run(`CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id INTEGER NOT NULL,
            service TEXT NOT NULL,
            rating INTEGER CHECK(rating BETWEEN 1 AND 5) NOT NULL,
            comment TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(resident_id) REFERENCES residents(id)
        )`);

        // Businesses Table
        db.run(`CREATE TABLE IF NOT EXISTS businesses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            business_name TEXT NOT NULL,
            owner_name TEXT NOT NULL,
            address TEXT NOT NULL,
            purok_id INTEGER,
            business_type TEXT NOT NULL,
            contact_number TEXT NOT NULL,
            permit_number TEXT UNIQUE NOT NULL,
            permit_status TEXT CHECK(permit_status IN ('Active', 'Expired', 'Pending Revocation')) DEFAULT 'Active',
            expiration_date TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(purok_id) REFERENCES puroks(id)
        )`);

        // Activity Logs Table
        db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Information Update Requests (for residents)
        db.run(`CREATE TABLE IF NOT EXISTS info_update_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id INTEGER NOT NULL,
            updated_fields TEXT NOT NULL,
            status TEXT CHECK(status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(resident_id) REFERENCES residents(id)
        )`);

        // Seed initial admin if none exists
        setTimeout(seedInitialAdminAndSettings, 500);
    });
}

function seedInitialAdminAndSettings() {
    db.get("SELECT COUNT(*) as count FROM users WHERE role = 'Admin'", async (err, row) => {
        if (row && row.count === 0) {
            const hashedPassword = await bcrypt.hash('admin12345', 10);
            db.run(`INSERT INTO users (username, email, password, role, status) VALUES (?, ?, ?, 'Admin', 'Active')`,
                ['admin', 'admin@barangay.gov.ph', hashedPassword], (err) => {
                    if (!err) console.log("Default admin created: username 'admin', password 'admin12345'");
                });
        }
    });

    db.get("SELECT COUNT(*) as count FROM barangay_settings", (err, row) => {
        if (row && row.count === 0) {
            db.run(`INSERT INTO barangay_settings (barangay_name, municipality, province, region, address, contact_number, email, captain_name, secretary_name) 
                    VALUES ('Barangay San Jose', 'Metropolis', 'Central', 'Region IV-A', 'Main Hall, San Jose', '+639123456789', 'admin@sanjose.gov.ph', 'Hon. Juaning Capitan', 'Maria Sekretarya')`);
        }
    });

    db.get("SELECT COUNT(*) as count FROM puroks", (err, row) => {
        if (row && row.count === 0) {
            const defaultPuroks = ['Purok 1 - Centro', 'Purok 2 - Riverside', 'Purok 3 - Hillside', 'Purok 4 - Sunrise'];
            defaultPuroks.forEach(p => {
                db.run(`INSERT INTO puroks (name, description) VALUES (?, ?)`, [p, 'Standard residential purok zone']);
            });
        }
    });
}

function logActivity(username, action, details, req) {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : '127.0.0.1';
    db.run(`INSERT INTO activity_logs (username, action, details, ip_address) VALUES (?, ?, ?, ?)`,
        [username || 'System', action, details, ip]);
}

function requireAuth(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
}

function requireStaff(req, res, next) {
    if (req.session && req.session.user && (req.session.user.role === 'Admin' || req.session.user.role === 'Staff')) {
        return next();
    }
    res.status(403).send(renderErrorPage("Access Denied: Staff or Administrator privileges required.", req));
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'Admin') {
        return next();
    }
    res.status(403).send(renderErrorPage("Access Denied: Administrator privileges required.", req));
}

function requireResident(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'Resident') {
        return next();
    }
    res.status(403).send(renderErrorPage("Access Denied: Resident portal access required.", req));
}

function generateResidentIdNumber(callback) {
    const year = new Date().getFullYear();
    db.get(`SELECT COUNT(*) as count FROM residents`, async (err, row) => {
        const seq = (row ? row.count : 0) + 1;
        const formattedSeq = String(seq).padStart(6, '0');
        const resId = `BRGY-${year}-${formattedSeq}`;
        callback(resId);
    });
}

async function generateQRCodeDataURL(text) {
    try {
        return await QRCode.toDataURL(text);
    } catch (err) {
        return '';
    }
}

function sendNotification(userId, title, message) {
    db.run(`INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)`, [userId, title, message]);
}

function renderErrorPage(message, req) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error - Barangay Resident Management System</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-100 flex items-center justify-center h-screen">
        <div class="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
            <div class="text-red-500 text-5xl mb-4">⚠️</div>
            <h1 class="text-2xl font-bold text-slate-800 mb-2">Access Restricted</h1>
            <p class="text-slate-600 mb-6">${message}</p>
            <a href="/" class="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition">Return Home</a>
        </div>
    </body>
    </html>
    `;
}

app.get('/login', (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        const brgyName = settings ? settings.barangay_name : 'Barangay Resident Management System';
        const logo = settings && settings.logo_url ? settings.logo_url : 'https://placehold.co/100x100/1e40af/ffffff?text=BRGY';
        res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Login - ${brgyName}</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 min-h-screen flex items-center justify-center p-4">
            <div class="bg-white/10 backdrop-blur-lg border border-white/20 p-8 rounded-3xl shadow-2xl max-w-md w-full text-white">
                <div class="text-center mb-8">
                    <img src="${logo}" alt="Logo" class="w-20 h-20 mx-auto rounded-full object-cover border-2 border-blue-400 mb-3 shadow-lg">
                    <h1 class="text-2xl font-extrabold">${brgyName}</h1>
                    <p class="text-slate-300 text-sm mt-1">Resident & Staff Management Portal</p>
                </div>
                ${req.query.error ? `<div class="bg-red-500/20 border border-red-500 text-red-200 px-4 py-3 rounded-xl mb-6 text-sm text-center">${req.query.error}</div>` : ''}
                ${req.query.success ? `<div class="bg-green-500/20 border border-green-500 text-green-200 px-4 py-3 rounded-xl mb-6 text-sm text-center">${req.query.success}</div>` : ''}
                <form action="/login" method="POST" class="space-y-5">
                    <div>
                        <label class="block text-xs uppercase tracking-wider font-semibold text-slate-300 mb-2">Username or Email</label>
                        <input type="text" name="username" required class="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition">
                    </div>
                    <div>
                        <label class="block text-xs uppercase tracking-wider font-semibold text-slate-300 mb-2">Password</label>
                        <input type="password" name="password" required class="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition">
                    </div>
                    <button type="submit" class="w-full py-3.5 bg-blue-600 hover:bg-blue-500 font-bold rounded-xl shadow-lg transition duration-200">Secure Sign In</button>
                </form>
                <div class="mt-6 text-center text-sm text-slate-400">
                    Resident without an account? <a href="/register" class="text-blue-400 hover:underline font-semibold">Register here</a>
                </div>
                <div class="mt-4 text-center">
                    <a href="/verify-id" class="text-xs text-slate-400 hover:text-white underline">Verify Barangay Resident ID QR</a>
                </div>
            </div>
        </body>
        </html>
        `);
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? OR email = ?`, [username, username], async (err, user) => {
        if (err || !user) {
            return res.redirect('/login?error=Invalid username or password');
        }
        if (user.status === 'Inactive' || user.status === 'Pending') {
            return res.redirect('/login?error=Account is inactive or pending staff approval.');
        }
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.redirect('/login?error=Invalid username or password');
        }
        
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            resident_id: user.resident_id
        };

        logActivity(user.username, 'LOGIN', 'User signed into the system', req);

        if (user.role === 'Admin' || user.role === 'Staff') {
            res.redirect('/staff/dashboard');
        } else {
            res.redirect('/resident/dashboard');
        }
    });
});

app.get('/logout', requireAuth, (req, res) => {
    const uname = req.session.user ? req.session.user.username : 'Unknown';
    logActivity(uname, 'LOGOUT', 'User signed out', req);
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

app.get('/register', (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM puroks`, (err, puroks) => {
            const brgyName = settings ? settings.barangay_name : 'Barangay Portal';
            res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Resident Registration - ${brgyName}</title>
                <script src="https://cdn.tailwindcss.com"></script>
            </head>
            <body class="bg-slate-100 min-h-screen py-10 px-4">
                <div class="max-w-3xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden">
                    <div class="bg-blue-900 text-white p-8 text-center">
                        <h1 class="text-3xl font-extrabold">Barangay Resident Registration</h1>
                        <p class="text-blue-200 mt-1">Submit your profile for verification by Barangay Staff</p>
                    </div>
                    ${req.query.error ? `<div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 m-6">${req.query.error}</div>` : ''}
                    <form action="/register" method="POST" enctype="multipart/form-data" class="p-8 space-y-6">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">First Name *</label>
                                <input type="text" name="first_name" required class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-600">
                            </div>
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Middle Name</label>
                                <input type="text" name="middle_name" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-600">
                            </div>
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Last Name *</label>
                                <input type="text" name="last_name" required class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-600">
                            </div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Suffix</label>
                                <input type="text" name="suffix" placeholder="Jr., III, etc." class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-600">
                            </div>
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Date of Birth *</label>
                                <input type="date" name="date_of_birth" required class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-600">
                            </div>
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Gender *</label>
                                <select name="gender" required class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-600">
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Civil Status *</label>
                                <select name="civil_status" required class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-600">
                                    <option value="Single">Single</option>
                                    <option value="Married">Married</option>
                                    <option value="Widowed">Widowed</option>
                                    <option value="Separated">Separated</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Purok *</label>
                                <select name="purok_id" required class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-600">
                                    ${puroks.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Contact Number *</label>
                                <input type="text" name="contact_number" required placeholder="09123456789" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-600">
                            </div>
                        </div>
                        <div>
                            <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Complete Street Address *</label>
                            <input type="text" name="address" required placeholder="House No., Street" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-600">
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Email Address (Login Username) *</label>
                                <input type="email" name="email" required class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-600">
                            </div>
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Password *</label>
                                <input type="password" name="password" required class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-600">
                            </div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Occupation</label>
                                <input type="text" name="occupation" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-600">
                            </div>
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Resident Photo ID / Selfie *</label>
                                <input type="file" name="photo" required accept="image/*" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100">
                            </div>
                        </div>
                        <div class="pt-4 flex items-center justify-between border-t border-slate-200">
                            <a href="/login" class="text-blue-600 hover:underline font-semibold text-sm">Already have an account? Sign In</a>
                            <button type="submit" class="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition">Submit Registration</button>
                        </div>
                    </form>
                </div>
            </body>
            </html>
            `);
        });
    });
});

app.post('/register', upload.single('photo'), async (req, res) => {
    const { first_name, middle_name, last_name, suffix, date_of_birth, gender, civil_status, address, purok_id, contact_number, email, password, occupation } = req.body;
    
    // Calculate age & categories
    const birthDate = new Date(date_of_birth);
    const ageDifMs = Date.now() - birthDate.getTime();
    const ageDate = new Date(ageDifMs);
    const age = Math.abs(ageDate.getUTCFullYear() - 1970);
    const senior = age >= 60 ? 'Yes' : 'No';

    generateResidentIdNumber(async (resident_id_number) => {
        const photoUrl = req.file ? `/uploads/${req.file.filename}` : '';
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(`INSERT INTO residents (resident_id_number, first_name, middle_name, last_name, suffix, date_of_birth, gender, civil_status, address, purok_id, contact_number, email, occupation, senior_citizen, photo_url, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
            [resident_id_number, first_name, middle_name, last_name, suffix, date_of_birth, gender, civil_status, address, purok_id, contact_number, email, occupation, senior, photoUrl], function(err) {
                if (err) {
                    return res.redirect('/register?error=Email or details already registered in the system.');
                }
                const residentId = this.lastID;
                db.run(`INSERT INTO users (username, email, password, role, status, resident_id) VALUES (?, ?, ?, 'Resident', 'Pending', ?)`,
                    [email, email, hashedPassword, residentId], (err2) => {
                        res.redirect('/login?success=Registration submitted successfully! Please wait for staff approval before signing in.');
                    });
            });
    });
});

app.get('/verify-id', (req, res) => {
    const rId = req.query.id;
    if (!rId) {
        return res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><script src="https://cdn.tailwindcss.com"></script><title>ID Verification</title></head>
        <body class="bg-slate-100 flex items-center justify-center h-screen p-4">
            <div class="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
                <h1 class="text-2xl font-bold text-slate-800 mb-4">Barangay ID Verification</h1>
                <form action="/verify-id" method="GET" class="space-y-4">
                    <input type="text" name="id" placeholder="Enter Resident ID (e.g. BRGY-2026-000001)" required class="w-full border rounded-xl px-4 py-3 text-center font-mono">
                    <button type="submit" class="w-full py-3 bg-blue-600 text-white font-bold rounded-xl">Verify ID</button>
                </form>
            </div>
        </body>
        </html>
        `);
    }

    db.get(`SELECT r.*, p.name as purok_name FROM residents r LEFT JOIN puroks p ON r.purok_id = p.id WHERE r.resident_id_number = ?`, [rId], (err, resident) => {
        db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err2, settings) => {
            const brgyName = settings ? settings.barangay_name : 'Barangay San Jose';
            res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head><meta charset="UTF-8"><script src="https://cdn.tailwindcss.com"></script><title>Verification Result</title></head>
            <body class="bg-slate-100 flex items-center justify-center h-screen p-4">
                <div class="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
                    <h1 class="text-xl font-bold text-slate-800 mb-1">${brgyName}</h1>
                    <p class="text-xs text-slate-500 uppercase tracking-widest mb-6">Official ID Verification</p>
                    ${resident ? `
                        <img src="${resident.photo_url || 'https://placehold.co/120x120'}" class="w-28 h-28 mx-auto rounded-full object-cover border-4 border-blue-600 mb-4 shadow-md">
                        <h2 class="text-2xl font-extrabold text-slate-900">${resident.first_name} ${resident.middle_name || ''} ${resident.last_name} ${resident.suffix || ''}</h2>
                        <p class="font-mono text-blue-600 font-bold mb-4">${resident.resident_id_number}</p>
                        <div class="bg-slate-50 p-4 rounded-2xl text-left space-y-2 text-sm text-slate-700 mb-6">
                            <div><strong>Address:</strong> ${resident.address}, ${resident.purok_name || ''}</div>
                            <div><strong>Status:</strong> <span class="px-2 py-0.5 bg-green-100 text-green-800 font-bold rounded">${resident.status}</span></div>
                        </div>
                    ` : `
                        <div class="text-red-500 font-bold text-lg mb-4">❌ Resident ID Not Found or Invalid</div>
                    `}
                    <a href="/verify-id" class="text-blue-600 hover:underline font-semibold text-sm">Verify Another ID</a>
                </div>
            </body>
            </html>
            `);
        });
    });
});

app.get('/staff/dashboard', requireAuth, requireStaff, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        db.get(`SELECT 
            (SELECT COUNT(*) FROM residents WHERE status='Active') as total_residents,
            (SELECT COUNT(*) FROM households) as total_households,
            (SELECT COUNT(*) FROM residents WHERE status='Active' AND gender='Male') as male_count,
            (SELECT COUNT(*) FROM residents WHERE status='Active' AND gender='Female') as female_count,
            (SELECT COUNT(*) FROM residents WHERE status='Active' AND senior_citizen='Yes') as senior_count,
            (SELECT COUNT(*) FROM residents WHERE status='Active' AND pwd='Yes') as pwd_count,
            (SELECT COUNT(*) FROM residents WHERE status='Active' AND solo_parent='Yes') as solo_count,
            (SELECT COUNT(*) FROM residents WHERE status='Active' AND voter_status='Registered') as voter_count,
            (SELECT COUNT(*) FROM certificate_requests WHERE status='Pending') as pending_certs,
            (SELECT COUNT(*) FROM appointments WHERE status='Pending') as pending_appts,
            (SELECT COUNT(*) FROM blotter_cases WHERE status='Open') as open_blotters
        `, (err2, stats) => {
            db.all(`SELECT * FROM activity_logs ORDER BY id DESC LIMIT 8`, (err3, logs) => {
                db.all(`SELECT * FROM residents WHERE status='Pending' LIMIT 5`, (err4, pendingResidents) => {
                    res.send(renderStaffLayout('Dashboard', req.session.user, settings, `
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                            <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex items-center justify-between">
                                <div><p class="text-xs font-bold uppercase text-slate-400">Total Residents</p><h3 class="text-3xl font-extrabold text-slate-800 mt-1">${stats.total_residents}</h3></div>
                                <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-xl">👥</div>
                            </div>
                            <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex items-center justify-between">
                                <div><p class="text-xs font-bold uppercase text-slate-400">Total Households</p><h3 class="text-3xl font-extrabold text-slate-800 mt-1">${stats.total_households}</h3></div>
                                <div class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-xl">🏠</div>
                            </div>
                            <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex items-center justify-between">
                                <div><p class="text-xs font-bold uppercase text-slate-400">Pending Certificates</p><h3 class="text-3xl font-extrabold text-amber-600 mt-1">${stats.pending_certs}</h3></div>
                                <div class="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center text-xl">📄</div>
                            </div>
                            <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex items-center justify-between">
                                <div><p class="text-xs font-bold uppercase text-slate-400">Open Blotter Cases</p><h3 class="text-3xl font-extrabold text-rose-600 mt-1">${stats.open_blotters}</h3></div>
                                <div class="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center text-xl">⚖️</div>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div class="lg:col-span-2 space-y-8">
                                <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                                    <h3 class="text-lg font-bold text-slate-800 mb-4">Demographic Statistics</h3>
                                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                                        <div class="bg-slate-50 p-4 rounded-2xl"><div class="text-xl font-bold text-blue-600">${stats.male_count}</div><div class="text-xs text-slate-500 uppercase mt-1">Male</div></div>
                                        <div class="bg-slate-50 p-4 rounded-2xl"><div class="text-xl font-bold text-pink-600">${stats.female_count}</div><div class="text-xs text-slate-500 uppercase mt-1">Female</div></div>
                                        <div class="bg-slate-50 p-4 rounded-2xl"><div class="text-xl font-bold text-emerald-600">${stats.senior_count}</div><div class="text-xs text-slate-500 uppercase mt-1">Seniors</div></div>
                                        <div class="bg-slate-50 p-4 rounded-2xl"><div class="text-xl font-bold text-purple-600">${stats.voter_count}</div><div class="text-xs text-slate-500 uppercase mt-1">Voters</div></div>
                                    </div>
                                </div>

                                <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                                    <h3 class="text-lg font-bold text-slate-800 mb-4">Pending Resident Registrations</h3>
                                    ${pendingResidents.length === 0 ? '<p class="text-slate-500 text-sm">No pending registrations.</p>' : `
                                        <div class="overflow-x-auto">
                                            <table class="w-full text-left text-sm">
                                                <thead class="bg-slate-50 text-slate-600 uppercase text-xs">
                                                    <tr><th class="p-3">Name</th><th class="p-3">Gender</th><th class="p-3">Contact</th><th class="p-3">Action</th></tr>
                                                </thead>
                                                <tbody class="divide-y divide-slate-100">
                                                    ${pendingResidents.map(r => `
                                                        <tr>
                                                            <td class="p-3 font-semibold">${r.first_name} ${r.last_name}</td>
                                                            <td class="p-3">${r.gender}</td>
                                                            <td class="p-3">${r.contact_number}</td>
                                                            <td class="p-3"><a href="/staff/residents/view/${r.id}" class="text-blue-600 font-bold hover:underline">Review</a></td>
                                                        </tr>
                                                    `).join('')}
                                                </tbody>
                                            </table>
                                        </div>
                                    `}
                                </div>
                            </div>

                            <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                                <h3 class="text-lg font-bold text-slate-800 mb-4">Recent Activity Log</h3>
                                <div class="space-y-4">
                                    ${logs.map(l => `
                                        <div class="flex items-start space-x-3 text-sm">
                                            <div class="w-2 h-2 mt-2 bg-blue-600 rounded-full"></div>
                                            <div>
                                                <p class="font-semibold text-slate-800">${l.action} <span class="text-xs font-normal text-slate-500">(${l.username})</span></p>
                                                <p class="text-xs text-slate-600">${l.details}</p>
                                                <span class="text-[10px] text-slate-400">${l.created_at}</span>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    `));
                });
            });
        });
    });
});

app.get('/staff/residents', requireAuth, requireStaff, (req, res) => {
    const search = req.query.search || '';
    const purok = req.query.purok || '';
    const status = req.query.status || 'Active';

    let query = `SELECT r.*, p.name as purok_name FROM residents r LEFT JOIN puroks p ON r.purok_id = p.id WHERE r.status = ?`;
    let params = [status];

    if (search) {
        query += ` AND (r.first_name LIKE ? OR r.last_name LIKE ? OR r.resident_id_number LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (purok) {
        query += ` AND r.purok_id = ?`;
        params.push(purok);
    }
    query += ` ORDER BY r.id DESC`;

    db.all(query, params, (err, residents) => {
        db.all(`SELECT * FROM puroks`, (err2, puroks) => {
            db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err3, settings) => {
                res.send(renderStaffLayout('Residents Management', req.session.user, settings, `
                    <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 mb-8">
                        <form method="GET" class="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <input type="text" name="search" value="${search}" placeholder="Search name or ID..." class="bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                            <select name="purok" class="bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                                <option value="">All Puroks</option>
                                ${puroks.map(p => `<option value="${p.id}" ${p.id == purok ? 'selected' : ''}>${p.name}</option>`).join('')}
                            </select>
                            <select name="status" class="bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                                <option value="Active" ${status === 'Active' ? 'selected' : ''}>Active Residents</option>
                                <option value="Pending" ${status === 'Pending' ? 'selected' : ''}>Pending Verification</option>
                                <option value="Archived" ${status === 'Archived' ? 'selected' : ''}>Archived Residents</option>
                            </select>
                            <div class="flex space-x-2">
                                <button type="submit" class="flex-1 bg-blue-600 text-white font-bold rounded-xl py-2.5 text-sm">Filter</button>
                                <a href="/staff/residents/add" class="bg-emerald-600 text-white font-bold rounded-xl px-4 py-2.5 text-sm flex items-center justify-center">+ Add</a>
                            </div>
                        </form>
                    </div>

                    <div class="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-sm">
                                <thead class="bg-slate-50 text-slate-600 uppercase text-xs">
                                    <tr>
                                        <th class="p-4">Resident ID</th>
                                        <th class="p-4">Photo</th>
                                        <th class="p-4">Full Name</th>
                                        <th class="p-4">Purok & Address</th>
                                        <th class="p-4">Contact</th>
                                        <th class="p-4">Status</th>
                                        <th class="p-4">Actions</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    ${residents.map(r => `
                                        <tr>
                                            <td class="p-4 font-mono font-bold text-blue-600">${r.resident_id_number}</td>
                                            <td class="p-4"><img src="${r.photo_url || 'https://placehold.co/40x40'}" class="w-10 h-10 rounded-full object-cover"></td>
                                            <td class="p-4 font-bold text-slate-800">${r.first_name} ${r.middle_name || ''} ${r.last_name} ${r.suffix || ''}</td>
                                            <td class="p-4 text-slate-600">${r.purok_name || ''}, ${r.address}</td>
                                            <td class="p-4 text-slate-600">${r.contact_number}</td>
                                            <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-bold ${r.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}">${r.status}</span></td>
                                            <td class="p-4 space-x-2">
                                                <a href="/staff/residents/view/${r.id}" class="text-blue-600 font-bold hover:underline">View</a>
                                                <a href="/staff/residents/edit/${r.id}" class="text-emerald-600 font-bold hover:underline">Edit</a>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `));
            });
        });
    });
});

app.get('/staff/residents/add', requireAuth, requireStaff, (req, res) => {
    db.all(`SELECT * FROM puroks`, (err, puroks) => {
        db.all(`SELECT * FROM households`, (err2, households) => {
            db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err3, settings) => {
                res.send(renderStaffLayout('Add New Resident', req.session.user, settings, `
                    <div class="max-w-4xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                        <form action="/staff/residents/add" method="POST" enctype="multipart/form-data" class="space-y-6">
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">First Name *</label>
                                    <input type="text" name="first_name" required class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Middle Name</label>
                                    <input type="text" name="middle_name" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Last Name *</label>
                                    <input type="text" name="last_name" required class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5">
                                </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Suffix</label>
                                    <input type="text" name="suffix" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Date of Birth *</label>
                                    <input type="date" name="date_of_birth" required class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Gender *</label>
                                    <select name="gender" required class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5">
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Civil Status *</label>
                                    <select name="civil_status" required class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5">
                                        <option value="Single">Single</option>
                                        <option value="Married">Married</option>
                                        <option value="Widowed">Widowed</option>
                                        <option value="Separated">Separated</option>
                                    </select>
                                </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Purok *</label>
                                    <select name="purok_id" required class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5">
                                        ${puroks.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Household</label>
                                    <select name="household_id" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5">
                                        <option value="">None / Unassigned</option>
                                        ${households.map(h => `<option value="${h.id}">House #${h.household_number}</option>`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Contact Number</label>
                                    <input type="text" name="contact_number" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5">
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Address *</label>
                                <input type="text" name="address" required class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5">
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Voter Status</label>
                                    <select name="voter_status" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5">
                                        <option value="Registered">Registered</option>
                                        <option value="Not Registered">Not Registered</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">PWD Status</label>
                                    <select name="pwd" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5">
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Solo Parent</label>
                                    <select name="solo_parent" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5">
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">4Ps Beneficiary</label>
                                    <select name="four_ps" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5">
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                    </select>
                                </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Occupation</label>
                                    <input type="text" name="occupation" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Resident Photo *</label>
                                    <input type="file" name="photo" required accept="image/*" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2">
                                </div>
                            </div>
                            <div class="flex justify-end space-x-4 border-t pt-6">
                                <a href="/staff/residents" class="px-6 py-2.5 bg-slate-200 text-slate-700 font-bold rounded-xl">Cancel</a>
                                <button type="submit" class="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl">Save Resident</button>
                            </div>
                        </form>
                    </div>
                `));
            });
        });
    });
});

app.post('/staff/residents/add', requireAuth, requireStaff, upload.single('photo'), (req, res) => {
    const { first_name, middle_name, last_name, suffix, date_of_birth, gender, civil_status, address, purok_id, household_id, contact_number, occupation, voter_status, pwd, solo_parent, four_ps } = req.body;
    
    const birthDate = new Date(date_of_birth);
    const age = Math.abs(new Date(Date.now() - birthDate.getTime()).getUTCFullYear() - 1970);
    const senior = age >= 60 ? 'Yes' : 'No';
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : '';

    generateResidentIdNumber((resident_id_number) => {
        db.run(`INSERT INTO residents (resident_id_number, first_name, middle_name, last_name, suffix, date_of_birth, gender, civil_status, address, purok_id, household_id, contact_number, occupation, voter_status, senior_citizen, pwd, solo_parent, four_ps, photo_url, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`,
            [resident_id_number, first_name, middle_name, last_name, suffix, date_of_birth, gender, civil_status, address, purok_id, household_id || null, contact_number, occupation, voter_status, senior, pwd, solo_parent, four_ps, photoUrl], function(err) {
                logActivity(req.session.user.username, 'ADD_RESIDENT', `Added resident ${first_name} ${last_name} (${resident_id_number})`, req);
                res.redirect('/staff/residents');
            });
    });
});

app.get('/staff/residents/view/:id', requireAuth, requireStaff, (req, res) => {
    const rId = req.params.id;
    db.get(`SELECT r.*, p.name as purok_name, h.household_number FROM residents r LEFT JOIN puroks p ON r.purok_id = p.id LEFT JOIN households h ON r.household_id = h.id WHERE r.id = ?`, [rId], (err, resident) => {
        db.all(`SELECT * FROM certificate_requests WHERE resident_id = ?`, [rId], (err2, certs) => {
            db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err3, settings) => {
                res.send(renderStaffLayout('Resident Profile', req.session.user, settings, `
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 text-center">
                            <img src="${resident.photo_url || 'https://placehold.co/150x150'}" class="w-36 h-36 mx-auto rounded-full object-cover border-4 border-blue-600 mb-4 shadow-md">
                            <h2 class="text-2xl font-bold text-slate-800">${resident.first_name} ${resident.middle_name || ''} ${resident.last_name} ${resident.suffix || ''}</h2>
                            <p class="font-mono text-blue-600 font-bold mb-4">${resident.resident_id_number}</p>
                            <div class="flex justify-center space-x-2 mb-6">
                                <span class="px-3 py-1 rounded-full text-xs font-bold ${resident.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}">${resident.status}</span>
                                ${resident.status === 'Pending' ? `<a href="/staff/residents/approve/${resident.id}" class="px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-bold">Approve Registration</a>` : ''}
                            </div>
                            <div class="text-left space-y-3 text-sm border-t pt-4">
                                <div><strong>Date of Birth:</strong> ${resident.date_of_birth}</div>
                                <div><strong>Gender:</strong> ${resident.gender}</div>
                                <div><strong>Civil Status:</strong> ${resident.civil_status}</div>
                                <div><strong>Purok:</strong> ${resident.purok_name}</div>
                                <div><strong>Address:</strong> ${resident.address}</div>
                                <div><strong>Contact:</strong> ${resident.contact_number}</div>
                                <div><strong>Senior Citizen:</strong> ${resident.senior_citizen}</div>
                                <div><strong>PWD:</strong> ${resident.pwd}</div>
                            </div>
                        </div>
                        <div class="lg:col-span-2 space-y-8">
                            <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                                <h3 class="text-lg font-bold text-slate-800 mb-4">Certificate Requests History</h3>
                                <div class="overflow-x-auto">
                                    <table class="w-full text-left text-sm">
                                        <thead class="bg-slate-50 text-slate-600 uppercase text-xs">
                                            <tr><th class="p-3">Type</th><th class="p-3">Date</th><th class="p-3">Status</th><th class="p-3">File</th></tr>
                                        </thead>
                                        <tbody class="divide-y">
                                            ${certs.map(c => `
                                                <tr>
                                                    <td class="p-3 font-semibold">${c.certificate_type}</td>
                                                    <td class="p-3">${c.date_requested}</td>
                                                    <td class="p-3"><span class="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700">${c.status}</span></td>
                                                    <td class="p-3">${c.certificate_file ? `<a href="${c.certificate_file}" target="_blank" class="text-blue-600 font-bold underline">Download</a>` : 'None'}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                `));
            });
        });
    });
});

app.get('/staff/residents/approve/:id', requireAuth, requireStaff, (req, res) => {
    const rId = req.params.id;
    db.run(`UPDATE residents SET status = 'Active' WHERE id = ?`, [rId], () => {
        db.run(`UPDATE users SET status = 'Active' WHERE resident_id = ?`, [rId], () => {
            logActivity(req.session.user.username, 'APPROVE_RESIDENT', `Approved resident registration ID ${rId}`, req);
            res.redirect('/staff/residents');
        });
    });
});

app.get('/staff/households', requireAuth, requireStaff, (req, res) => {
    db.all(`SELECT h.*, p.name as purok_name, r.first_name, r.last_name FROM households h LEFT JOIN puroks p ON h.purok_id = p.id LEFT JOIN residents r ON h.head_resident_id = r.id`, (err, households) => {
        db.all(`SELECT * FROM puroks`, (err2, puroks) => {
            db.all(`SELECT * FROM residents WHERE status = 'Active'`, (err3, residents) => {
                db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err4, settings) => {
                    res.send(renderStaffLayout('Household Management', req.session.user, settings, `
                        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                                <h3 class="text-lg font-bold text-slate-800 mb-4">Add Household</h3>
                                <form action="/staff/households/add" method="POST" class="space-y-4">
                                    <div>
                                        <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Household Number *</label>
                                        <input type="text" name="household_number" required placeholder="HH-2026-001" class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Purok *</label>
                                        <select name="purok_id" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                                            ${puroks.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Household Head *</label>
                                        <select name="head_resident_id" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                                            ${residents.map(r => `<option value="${r.id}">${r.first_name} ${r.last_name} (${r.resident_id_number})</option>`).join('')}
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Address *</label>
                                        <input type="text" name="address" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                                    </div>
                                    <button type="submit" class="w-full bg-blue-600 text-white font-bold rounded-xl py-3 text-sm">Create Household</button>
                                </form>
                            </div>
                            <div class="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                                <h3 class="text-lg font-bold text-slate-800 mb-4">Household Directory</h3>
                                <div class="overflow-x-auto">
                                    <table class="w-full text-left text-sm">
                                        <thead class="bg-slate-50 text-slate-600 uppercase text-xs">
                                            <tr><th class="p-3">HH Number</th><th class="p-3">Head</th><th class="p-3">Purok</th><th class="p-3">Address</th><th class="p-3">Action</th></tr>
                                        </thead>
                                        <tbody class="divide-y">
                                            ${households.map(h => `
                                                <tr>
                                                    <td class="p-3 font-mono font-bold text-blue-600">${h.household_number}</td>
                                                    <td class="p-3 font-semibold">${h.first_name || ''} ${h.last_name || ''}</td>
                                                    <td class="p-3">${h.purok_name || ''}</td>
                                                    <td class="p-3">${h.address}</td>
                                                    <td class="p-3"><a href="/staff/households/view/${h.id}" class="text-blue-600 font-bold hover:underline">View Members</a></td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    `));
                });
            });
        });
    });
});

app.post('/staff/households/add', requireAuth, requireStaff, (req, res) => {
    const { household_number, purok_id, head_resident_id, address } = req.body;
    db.run(`INSERT INTO households (household_number, purok_id, head_resident_id, address) VALUES (?, ?, ?, ?)`,
        [household_number, purok_id, head_resident_id, address], function(err) {
            const hId = this.lastID;
            db.run(`UPDATE residents SET household_id = ? WHERE id = ?`, [hId, head_resident_id], () => {
                logActivity(req.session.user.username, 'ADD_HOUSEHOLD', `Created household ${household_number}`, req);
                res.redirect('/staff/households');
            });
        });
});

app.get('/staff/households/view/:id', requireAuth, requireStaff, (req, res) => {
    const hId = req.params.id;
    db.get(`SELECT h.*, p.name as purok_name, r.first_name as head_first, r.last_name as head_last FROM households h LEFT JOIN puroks p ON h.purok_id = p.id LEFT JOIN residents r ON h.head_resident_id = r.id WHERE h.id = ?`, [hId], (err, household) => {
        db.all(`SELECT * FROM residents WHERE household_id = ?`, [hId], (err2, members) => {
            db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err3, settings) => {
                res.send(renderStaffLayout('Household Details', req.session.user, settings, `
                    <div class="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 mb-8">
                        <h2 class="text-2xl font-bold text-slate-800 mb-2">Household #${household.household_number}</h2>
                        <p class="text-slate-600">Head: ${household.head_first} ${household.head_last} | Purok: ${household.purok_name} | Address: ${household.address}</p>
                    </div>
                    <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                        <h3 class="text-lg font-bold text-slate-800 mb-4">Family Members</h3>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-sm">
                                <thead class="bg-slate-50 text-slate-600 uppercase text-xs">
                                    <tr><th class="p-3">Resident ID</th><th class="p-3">Name</th><th class="p-3">Gender</th><th class="p-3">Contact</th></tr>
                                </thead>
                                <tbody class="divide-y">
                                    ${members.map(m => `
                                        <tr>
                                            <td class="p-3 font-mono font-bold text-blue-600">${m.resident_id_number}</td>
                                            <td class="p-3 font-bold">${m.first_name} ${m.last_name}</td>
                                            <td class="p-3">${m.gender}</td>
                                            <td class="p-3">${m.contact_number}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `));
            });
        });
    });
});

app.get('/staff/certificates', requireAuth, requireStaff, (req, res) => {
    db.all(`SELECT c.*, r.first_name, r.last_name, r.resident_id_number FROM certificate_requests c JOIN residents r ON c.resident_id = r.id ORDER BY c.id DESC`, (err, requests) => {
        db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err2, settings) => {
            res.send(renderStaffLayout('Certificate Management', req.session.user, settings, `
                <div class="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                    <div class="p-6 border-b border-slate-100 flex justify-between items-center">
                        <h3 class="text-lg font-bold text-slate-800">Certificate Requests</h3>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-slate-50 text-slate-600 uppercase text-xs">
                                <tr>
                                    <th class="p-4">Req #</th>
                                    <th class="p-4">Resident</th>
                                    <th class="p-4">Certificate Type</th>
                                    <th class="p-4">Purpose</th>
                                    <th class="p-4">Status</th>
                                    <th class="p-4">File / Action</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${requests.map(reqItem => `
                                    <tr>
                                        <td class="p-4 font-mono font-bold text-blue-600">${reqItem.request_number}</td>
                                        <td class="p-4 font-semibold">${reqItem.first_name} ${reqItem.last_name}</td>
                                        <td class="p-4">${reqItem.certificate_type}</td>
                                        <td class="p-4 text-slate-600">${reqItem.purpose}</td>
                                        <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700">${reqItem.status}</span></td>
                                        <td class="p-4 space-x-2">
                                            ${reqItem.certificate_file ? `<a href="${reqItem.certificate_file}" target="_blank" class="text-blue-600 font-bold underline">View File</a>` : ''}
                                            <button onclick="openProcessModal(${reqItem.id}, '${reqItem.status}')" class="px-3 py-1 bg-slate-800 text-white font-bold rounded-xl text-xs">Manage</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div id="processModal" class="fixed inset-0 bg-black/50 hidden items-center justify-center p-4">
                    <div class="bg-white p-6 rounded-3xl max-w-lg w-full">
                        <h3 class="text-lg font-bold mb-4">Process Certificate Request</h3>
                        <form id="processForm" action="/staff/certificates/process" method="POST" enctype="multipart/form-data" class="space-y-4">
                            <input type="hidden" name="id" id="modalReqId">
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Update Status</label>
                                <select name="status" id="modalStatus" class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                                    <option value="Pending">Pending</option>
                                    <option value="Processing">Processing</option>
                                    <option value="Approved">Approved</option>
                                    <option value="Ready for Release">Ready for Release</option>
                                    <option value="Released">Released</option>
                                    <option value="Rejected">Rejected</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Staff Remarks</label>
                                <textarea name="staff_remarks" class="w-full bg-slate-50 border rounded-xl p-3 text-sm"></textarea>
                            </div>
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Upload Certificate File (PDF/Image)</label>
                                <input type="file" name="certificate_file" class="w-full bg-slate-50 border rounded-xl p-2 text-sm">
                            </div>
                            <div class="flex justify-end space-x-3 pt-4">
                                <button type="button" onclick="closeProcessModal()" class="px-4 py-2 bg-slate-200 rounded-xl font-bold text-sm">Cancel</button>
                                <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm">Update Request</button>
                            </div>
                        </form>
                    </div>
                </div>

                <script>
                    function openProcessModal(id, status) {
                        document.getElementById('modalReqId').value = id;
                        document.getElementById('modalStatus').value = status;
                        document.getElementById('processModal').classList.remove('hidden');
                        document.getElementById('processModal').classList.add('flex');
                    }
                    function closeProcessModal() {
                        document.getElementById('processModal').classList.remove('flex');
                        document.getElementById('processModal').classList.add('hidden');
                    }
                </script>
            `));
        });
    });
});

app.post('/staff/certificates/process', requireAuth, requireStaff, upload.single('certificate_file'), (req, res) => {
    const { id, status, staff_remarks } = req.body;
    const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;

    let query = `UPDATE certificate_requests SET status = ?, staff_remarks = ?, processed_by = ?, date_processed = CURRENT_TIMESTAMP`;
    let params = [status, staff_remarks, req.session.user.id];

    if (fileUrl) {
        query += `, certificate_file = ?`;
        params.push(fileUrl);
    }
    if (status === 'Released') {
        query += `, date_released = CURRENT_TIMESTAMP`;
    }
    query += ` WHERE id = ?`;
    params.push(id);

    db.run(query, params, () => {
        db.get(`SELECT resident_id FROM certificate_requests WHERE id = ?`, [id], (err, reqRow) => {
            if (reqRow) {
                db.get(`SELECT user_id FROM users WHERE resident_id = ?`, [reqRow.resident_id], (err2, uRow) => {
                    if (uRow) {
                        sendNotification(uRow.id, 'Certificate Update', `Your certificate request status is now: ${status}`);
                    }
                });
            }
            logActivity(req.session.user.username, 'PROCESS_CERTIFICATE', `Updated certificate request ID ${id} to ${status}`, req);
            res.redirect('/staff/certificates');
        });
    });
});

app.get('/staff/print-ids', requireAuth, requireStaff, (req, res) => {
    db.all(`SELECT r.*, p.name as purok_name FROM residents r LEFT JOIN puroks p ON r.purok_id = p.id WHERE r.status = 'Active'`, (err, residents) => {
        db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err2, settings) => {
            const brgyName = settings ? settings.barangay_name : 'Barangay San Jose';
            const brgyLogo = settings && settings.logo_url ? settings.logo_url : 'https://placehold.co/80x80';
            const captain = settings ? settings.captain_name : 'Barangay Captain';
            
            res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Printable 8-up Resident IDs - ${brgyName}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                    @media print {
                        body { background: white; -webkit-print-color-adjust: exact; }
                        .no-print { display: none !important; }
                        .page-sheet { page-break-after: always; box-shadow: none !important; margin: 0 !important; }
                    }
                    .id-card {
                        width: 85.6mm;
                        height: 53.98mm;
                        border: 1px dashed #cbd5e1;
                        background: white;
                        box-sizing: border-box;
                        padding: 10px;
                        display: flex;
                        flex-direction: column;
                        justify-content: space-between;
                        position: relative;
                        overflow: hidden;
                    }
                </style>
            </head>
            <body class="bg-slate-200 font-sans">
                <div class="no-print bg-blue-900 text-white py-4 px-8 flex justify-between items-center shadow-md mb-6">
                    <h1 class="text-xl font-bold">Barangay ID Batch Printing (8 IDs per Page)</h1>
                    <button onclick="window.print()" class="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 font-bold rounded-xl shadow">Print IDs Now</button>
                </div>

                <div class="max-w-[210mm] mx-auto space-y-8">
                    ${chunkArray(residents, 8).map((pageResidents, pageIndex) => `
                        <div class="page-sheet bg-white p-[10mm] shadow-xl grid grid-cols-2 gap-[5mm] mx-auto w-[210mm] h-[297mm]">
                            ${pageResidents.map(r => `
                                <div class="id-card rounded-xl shadow-sm border border-slate-300">
                                    <div class="flex items-center space-x-2 border-b pb-1">
                                        <img src="${brgyLogo}" class="w-8 h-8 rounded-full object-cover">
                                        <div>
                                            <h4 class="text-[10px] font-bold text-blue-900 leading-tight">${brgyName}</h4>
                                            <p class="text-[7px] text-slate-500 uppercase tracking-wider">Official Resident ID</p>
                                        </div>
                                    </div>
                                    <div class="flex items-center space-x-3 my-1">
                                        <img src="${r.photo_url || 'https://placehold.co/80x80'}" class="w-14 h-14 rounded-lg object-cover border border-blue-600">
                                        <div>
                                            <h3 class="text-xs font-extrabold text-slate-800">${r.first_name} ${r.middle_name || ''} ${r.last_name} ${r.suffix || ''}</h3>
                                            <p class="text-[9px] font-mono font-bold text-blue-600">${r.resident_id_number}</p>
                                            <p class="text-[8px] text-slate-600 mt-0.5">Purok: ${r.purok_name || ''}</p>
                                            <p class="text-[8px] text-slate-600 truncate max-w-[140px]">Address: ${r.address}</p>
                                        </div>
                                    </div>
                                    <div class="flex justify-between items-end border-t pt-1">
                                        <div>
                                            <p class="text-[7px] text-slate-400">Issued by Barangay Office</p>
                                            <p class="text-[8px] font-bold text-slate-800">${captain}</p>
                                        </div>
                                        <div class="text-[7px] bg-slate-100 px-2 py-0.5 rounded font-mono">VALID ID</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
            </body>
            </html>
            `);
        });
    });
});

function chunkArray(array, size) {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
}

app.get('/staff/blotter', requireAuth, requireStaff, (req, res) => {
    db.all(`SELECT * FROM blotter_cases ORDER BY id DESC`, (err, cases) => {
        db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err2, settings) => {
            res.send(renderStaffLayout('Blotter Management', req.session.user, settings, `
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                        <h3 class="text-lg font-bold text-slate-800 mb-4">Record Blotter Case</h3>
                        <form action="/staff/blotter/add" method="POST" class="space-y-4">
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Case Number *</label>
                                <input type="text" name="case_number" required placeholder="BLT-2026-001" class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                            </div>
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Complainant *</label>
                                <input type="text" name="complainant" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                            </div>
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Respondent *</label>
                                <input type="text" name="respondent" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Incident Date *</label>
                                    <input type="date" name="incident_date" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Incident Time *</label>
                                    <input type="time" name="incident_time" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Location *</label>
                                <input type="text" name="location" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                            </div>
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Description *</label>
                                <textarea name="description" required class="w-full bg-slate-50 border rounded-xl p-3 text-sm"></textarea>
                            </div>
                            <button type="submit" class="w-full bg-blue-600 text-white font-bold rounded-xl py-3 text-sm">Save Blotter Case</button>
                        </form>
                    </div>
                    <div class="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                        <h3 class="text-lg font-bold text-slate-800 mb-4">Blotter Records</h3>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-sm">
                                <thead class="bg-slate-50 text-slate-600 uppercase text-xs">
                                    <tr><th class="p-3">Case #</th><th class="p-3">Complainant vs Respondent</th><th class="p-3">Date</th><th class="p-3">Status</th></tr>
                                </thead>
                                <tbody class="divide-y">
                                    ${cases.map(c => `
                                        <tr>
                                            <td class="p-3 font-mono font-bold text-rose-600">${c.case_number}</td>
                                            <td class="p-3 font-semibold">${c.complainant} vs ${c.respondent}</td>
                                            <td class="p-3">${c.incident_date}</td>
                                            <td class="p-3"><span class="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700">${c.status}</span></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `));
        });
    });
});

app.post('/staff/blotter/add', requireAuth, requireStaff, (req, res) => {
    const { case_number, complainant, respondent, incident_date, incident_time, location, description } = req.body;
    db.run(`INSERT INTO blotter_cases (case_number, complainant, respondent, incident_date, incident_time, location, description) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [case_number, complainant, respondent, incident_date, incident_time, location, description], () => {
            logActivity(req.session.user.username, 'ADD_BLOTTER', `Recorded blotter case ${case_number}`, req);
            res.redirect('/staff/blotter');
        });
});

app.get('/staff/settings', requireAuth, requireAdmin, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        res.send(renderStaffLayout('Barangay Settings', req.session.user, settings, `
            <div class="max-w-3xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                <h3 class="text-xl font-bold text-slate-800 mb-6">Barangay Configuration & Settings</h3>
                <form action="/staff/settings" method="POST" enctype="multipart/form-data" class="space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Barangay Name *</label>
                            <input type="text" name="barangay_name" value="${settings.barangay_name}" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Municipality / City *</label>
                            <input type="text" name="municipality" value="${settings.municipality}" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                        </div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Province *</label>
                            <input type="text" name="province" value="${settings.province}" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Region *</label>
                            <input type="text" name="region" value="${settings.region}" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                        </div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Barangay Captain *</label>
                            <input type="text" name="captain_name" value="${settings.captain_name}" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Barangay Secretary *</label>
                            <input type="text" name="secretary_name" value="${settings.secretary_name}" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                        </div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Contact Number *</label>
                            <input type="text" name="contact_number" value="${settings.contact_number}" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Official Email *</label>
                            <input type="email" name="email" value="${settings.email}" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Barangay Hall Address *</label>
                        <input type="text" name="address" value="${settings.address}" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                    </div>
                    <div>
                        <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Upload Barangay Logo</label>
                        <input type="file" name="logo" accept="image/*" class="w-full bg-slate-50 border rounded-xl p-2 text-sm">
                    </div>
                    <div class="flex justify-end pt-4">
                        <button type="submit" class="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl text-sm shadow-lg">Save Settings</button>
                    </div>
                </form>
            </div>
        `));
    });
});

app.post('/staff/settings', requireAuth, requireAdmin, upload.single('logo'), (req, res) => {
    const { barangay_name, municipality, province, region, address, contact_number, email, captain_name, secretary_name } = req.body;
    
    db.get(`SELECT logo_url FROM barangay_settings LIMIT 1`, (err, current) => {
        const logoUrl = req.file ? `/uploads/${req.file.filename}` : (current ? current.logo_url : '');
        db.run(`UPDATE barangay_settings SET barangay_name = ?, municipality = ?, province = ?, region = ?, address = ?, contact_number = ?, email = ?, captain_name = ?, secretary_name = ?, logo_url = ?`,
            [barangay_name, municipality, province, region, address, contact_number, email, captain_name, secretary_name, logoUrl], () => {
                logActivity(req.session.user.username, 'UPDATE_SETTINGS', 'Updated barangay configuration settings', req);
                res.redirect('/staff/settings');
            });
    });
});

app.get('/resident/dashboard', requireAuth, requireResident, (req, res) => {
    db.get(`SELECT * FROM residents WHERE id = ?`, [req.session.user.resident_id], (err, resident) => {
        db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err2, settings) => {
            db.all(`SELECT * FROM announcements ORDER BY id DESC LIMIT 3`, (err3, announcements) => {
                db.all(`SELECT * FROM certificate_requests WHERE resident_id = ?`, [req.session.user.resident_id], (err4, certs) => {
                    res.send(renderResidentLayout('Resident Dashboard', req.session.user, settings, `
                        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 text-center">
                                <img src="${resident.photo_url || 'https://placehold.co/120x120'}" class="w-32 h-32 mx-auto rounded-full object-cover border-4 border-blue-600 mb-4 shadow-md">
                                <h2 class="text-xl font-extrabold text-slate-800">${resident.first_name} ${resident.last_name}</h2>
                                <p class="font-mono text-blue-600 font-bold mb-4">${resident.resident_id_number}</p>
                                <a href="/resident/digital-id" class="inline-block w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow hover:bg-blue-700 transition">View My Digital ID</a>
                            </div>
                            <div class="lg:col-span-2 space-y-8">
                                <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                                    <h3 class="text-lg font-bold text-slate-800 mb-4">Announcements from Barangay</h3>
                                    <div class="space-y-4">
                                        ${announcements.map(a => `
                                            <div class="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                                                <h4 class="font-bold text-blue-900">${a.title}</h4>
                                                <p class="text-sm text-slate-600 mt-1">${a.description}</p>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `));
                });
            });
        });
    });
});

app.get('/resident/digital-id', requireAuth, requireResident, async (req, res) => {
    db.get(`SELECT r.*, p.name as purok_name FROM residents r LEFT JOIN puroks p ON r.purok_id = p.id WHERE r.id = ?`, [req.session.user.resident_id], async (err, resident) => {
        db.get(`SELECT * FROM barangay_settings LIMIT 1`, async (err2, settings) => {
            const brgyName = settings ? settings.barangay_name : 'Barangay San Jose';
            const brgyLogo = settings && settings.logo_url ? settings.logo_url : 'https://placehold.co/80x80';
            const captain = settings ? settings.captain_name : 'Barangay Captain';
            const verifyUrl = `https://${req.get('host')}/verify-id?id=${resident.resident_id_number}`;
            const qrDataUrl = await generateQRCodeDataURL(verifyUrl);

            res.send(renderResidentLayout('My Digital ID', req.session.user, settings, `
                <div class="max-w-md mx-auto bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 text-white p-8 rounded-3xl shadow-2xl border border-blue-500/30">
                    <div class="flex items-center space-x-3 border-b border-white/20 pb-4 mb-6">
                        <img src="${brgyLogo}" class="w-12 h-12 rounded-full object-cover border-2 border-white">
                        <div>
                            <h2 class="font-extrabold text-lg">${brgyName}</h2>
                            <p class="text-xs text-blue-300">Official Digital Barangay Resident ID</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-4 mb-6">
                        <img src="${resident.photo_url || 'https://placehold.co/100x100'}" class="w-24 h-24 rounded-2xl object-cover border-2 border-blue-400 shadow-md">
                        <div>
                            <h3 class="text-xl font-extrabold">${resident.first_name} ${resident.middle_name || ''} ${resident.last_name}</h3>
                            <p class="font-mono text-blue-300 font-bold text-sm">${resident.resident_id_number}</p>
                            <p class="text-xs text-slate-300 mt-1">Purok: ${resident.purok_name || ''}</p>
                        </div>
                    </div>
                    <div class="bg-white/10 p-4 rounded-2xl backdrop-blur-md flex items-center justify-between">
                        <div>
                            <p class="text-xs text-slate-300">Scan to Verify Authenticity</p>
                            <p class="text-xs font-bold text-green-400 mt-1">STATUS: ${resident.status.toUpperCase()}</p>
                        </div>
                        <img src="${qrDataUrl}" class="w-20 h-20 bg-white p-1 rounded-xl">
                    </div>
                </div>
            `));
        });
    });
});

app.get('/resident/certificates', requireAuth, requireResident, (req, res) => {
    db.all(`SELECT * FROM certificate_requests WHERE resident_id = ? ORDER BY id DESC`, [req.session.user.resident_id], (err, requests) => {
        db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err2, settings) => {
            res.send(renderResidentLayout('Request Certificates', req.session.user, settings, `
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                        <h3 class="text-lg font-bold text-slate-800 mb-4">New Request</h3>
                        <form action="/resident/certificates/request" method="POST" class="space-y-4">
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Certificate Type *</label>
                                <select name="certificate_type" required class="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm">
                                    <option value="Barangay Clearance">Barangay Clearance</option>
                                    <option value="Certificate of Residency">Certificate of Residency</option>
                                    <option value="Certificate of Indigency">Certificate of Indigency</option>
                                    <option value="Certificate of Good Moral">Certificate of Good Moral</option>
                                    <option value="Certificate of No Income">Certificate of No Income</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs font-bold uppercase text-slate-600 mb-2">Purpose *</label>
                                <textarea name="purpose" required class="w-full bg-slate-50 border rounded-xl p-3 text-sm"></textarea>
                            </div>
                            <button type="submit" class="w-full bg-blue-600 text-white font-bold rounded-xl py-3 text-sm">Submit Request</button>
                        </form>
                    </div>
                    <div class="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                        <h3 class="text-lg font-bold text-slate-800 mb-4">My Requests</h3>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-sm">
                                <thead class="bg-slate-50 text-slate-600 uppercase text-xs">
                                    <tr><th class="p-3">Req #</th><th class="p-3">Type</th><th class="p-3">Status</th><th class="p-3">File</th></tr>
                                </thead>
                                <tbody class="divide-y">
                                    ${requests.map(r => `
                                        <tr>
                                            <td class="p-3 font-mono font-bold text-blue-600">${r.request_number}</td>
                                            <td class="p-3 font-semibold">${r.certificate_type}</td>
                                            <td class="p-3"><span class="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700">${r.status}</span></td>
                                            <td class="p-3">${r.certificate_file ? `<a href="${r.certificate_file}" target="_blank" class="text-blue-600 font-bold underline">Download</a>` : 'Waiting Staff'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `));
        });
    });
});

app.post('/resident/certificates/request', requireAuth, requireResident, (req, res) => {
    const { certificate_type, purpose } = req.body;
    const reqNum = 'REQ-' + Date.now().toString().slice(-6);
    db.run(`INSERT INTO certificate_requests (request_number, resident_id, certificate_type, purpose) VALUES (?, ?, ?, ?)`,
        [reqNum, req.session.user.resident_id, certificate_type, purpose], () => {
            res.redirect('/resident/certificates');
        });
});

function renderStaffLayout(title, user, settings, content) {
    const brgyName = settings ? settings.barangay_name : 'Barangay System';
    const logo = settings && settings.logo_url ? settings.logo_url : 'https://placehold.co/40x40';
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - Staff Portal</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-100 font-sans antialiased">
        <div class="flex h-screen overflow-hidden">
            <aside class="w-64 bg-slate-900 text-slate-300 flex flex-col hidden md:flex">
                <div class="p-6 flex items-center space-x-3 border-b border-slate-800">
                    <img src="${logo}" class="w-10 h-10 rounded-full object-cover">
                    <div>
                        <h1 class="font-bold text-white text-sm leading-tight">${brgyName}</h1>
                        <p class="text-[10px] text-slate-400">Staff Portal</p>
                    </div>
                </div>
                <nav class="flex-1 p-4 space-y-1 overflow-y-auto text-sm">
                    <a href="/staff/dashboard" class="flex items-center space-x-3 px-4 py-3 rounded-xl hover:bg-slate-800 text-white font-medium"><span>📊</span><span>Dashboard</span></a>
                    <a href="/staff/residents" class="flex items-center space-x-3 px-4 py-3 rounded-xl hover:bg-slate-800 text-white font-medium"><span>👥</span><span>Residents</span></a>
                    <a href="/staff/households" class="flex items-center space-x-3 px-4 py-3 rounded-xl hover:bg-slate-800 text-white font-medium"><span>🏠</span><span>Households</span></a>
                    <a href="/staff/certificates" class="flex items-center space-x-3 px-4 py-3 rounded-xl hover:bg-slate-800 text-white font-medium"><span>📄</span><span>Certificates</span></a>
                    <a href="/staff/print-ids" class="flex items-center space-x-3 px-4 py-3 rounded-xl hover:bg-slate-800 text-white font-medium"><span>🪪</span><span>Print ID Sheets</span></a>
                    <a href="/staff/blotter" class="flex items-center space-x-3 px-4 py-3 rounded-xl hover:bg-slate-800 text-white font-medium"><span>⚖️</span><span>Blotter Cases</span></a>
                    ${user.role === 'Admin' ? `<a href="/staff/settings" class="flex items-center space-x-3 px-4 py-3 rounded-xl hover:bg-slate-800 text-white font-medium"><span>⚙️</span><span>Barangay Settings</span></a>` : ''}
                </nav>
                <div class="p-4 border-t border-slate-800">
                    <a href="/logout" class="block w-full py-2.5 text-center bg-red-600/20 text-red-400 font-bold rounded-xl text-sm hover:bg-red-600/30 transition">Sign Out</a>
                </div>
            </aside>
            <main class="flex-1 flex flex-col h-screen overflow-y-auto">
                <header class="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center shadow-sm">
                    <h2 class="text-xl font-extrabold text-slate-800">${title}</h2>
                    <div class="flex items-center space-x-4">
                        <span class="text-sm font-semibold text-slate-600">${user.username} (${user.role})</span>
                    </div>
                </header>
                <div class="p-8 flex-1">${content}</div>
            </main>
        </div>
    </body>
    </html>
    `;
}

function renderResidentLayout(title, user, settings, content) {
    const brgyName = settings ? settings.barangay_name : 'Barangay System';
    const logo = settings && settings.logo_url ? settings.logo_url : 'https://placehold.co/40x40';
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - Resident Portal</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-100 font-sans antialiased">
        <div class="min-h-screen flex flex-col">
            <header class="bg-blue-900 text-white shadow-md">
                <div class="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div class="flex items-center space-x-3">
                        <img src="${logo}" class="w-10 h-10 rounded-full object-cover">
                        <h1 class="font-bold text-lg">${brgyName} Portal</h1>
                    </div>
                    <nav class="flex items-center space-x-6 text-sm font-semibold">
                        <a href="/resident/dashboard" class="hover:text-blue-300">Dashboard</a>
                        <a href="/resident/digital-id" class="hover:text-blue-300">My Digital ID</a>
                        <a href="/resident/certificates" class="hover:text-blue-300">Certificates</a>
                        <a href="/logout" class="text-red-300 hover:text-red-200">Sign Out</a>
                    </nav>
                </div>
            </header>
            <main class="flex-1 max-w-6xl w-full mx-auto p-6">${content}</main>
        </div>
    </body>
    </html>
    `;
}

app.get('/', (req, res) => {
    if (req.session && req.session.user) {
        if (req.session.user.role === 'Admin' || req.session.user.role === 'Staff') {
            return res.redirect('/staff/dashboard');
        }
        return res.redirect('/resident/dashboard');
    }
    res.redirect('/login');
});

app.listen(PORT, () => {
    console.log(`Barangay Resident Management System running on port ${PORT}`);
});
