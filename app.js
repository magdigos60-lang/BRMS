const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware setup
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'brgy-mgmt-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if HTTPS on Render with proxy trust
}));

// Database Initialization (SQLite file-based persistent storage)
const dbFile = path.join(__dirname, 'barangay.db');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('Database opening error: ' + err.message);
    } else {
        console.log('Connected to SQLite database.');
        initDatabase();
    }
});

function initDatabase() {
    db.serialize(() => {
        // 1. Settings Table
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            barangay_name TEXT,
            municipality TEXT,
            province TEXT,
            captain TEXT,
            contact TEXT,
            email TEXT,
            address TEXT,
            logo_url TEXT
        )`, () => {
            db.get(`SELECT COUNT(*) as count FROM settings`, (err, row) => {
                if (row && row.count === 0) {
                    db.run(`INSERT INTO settings (barangay_name, municipality, province, captain, contact, email, address, logo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        ['Barangay San Isidro', 'Quezon City', 'Metro Manila', 'Hon. Roberto M. Santos', '0917-123-4567', 'sanisidro@qc.gov.ph', '123 Main Street, Quezon City', 'https://placehold.co/150x150/1e40af/ffffff?text=BRGY']);
                }
            });
        });

        // 2. Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT, -- Admin, Barangay Secretary, Staff, Resident
            full_name TEXT,
            email TEXT,
            contact TEXT,
            resident_id TEXT,
            status TEXT DEFAULT 'Active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, () => {
            db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'Admin'`, async (err, row) => {
                if (row && row.count === 0) {
                    const hashedPassword = await bcrypt.hash('admin123', 10);
                    db.run(`INSERT INTO users (username, password, role, full_name, email, contact) VALUES (?, ?, ?, ?, ?, ?)`,
                        ['admin', hashedPassword, 'Admin', 'System Administrator', 'admin@brgy.gov.ph', '09189998877']);
                }
            });
        });

        // 3. Puroks Table
        db.run(`CREATE TABLE IF NOT EXISTS puroks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purok_name TEXT UNIQUE,
            leader_name TEXT,
            description TEXT
        )`);

        // 4. Households Table
        db.run(`CREATE TABLE IF NOT EXISTS households (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            household_number TEXT UNIQUE,
            head_name TEXT,
            address TEXT,
            purok TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 5. Residents Table
        db.run(`CREATE TABLE IF NOT EXISTS residents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id TEXT UNIQUE,
            first_name TEXT,
            middle_name TEXT,
            last_name TEXT,
            suffix TEXT,
            photo_url TEXT,
            dob TEXT,
            age INTEGER,
            gender TEXT,
            civil_status TEXT,
            nationality TEXT,
            religion TEXT,
            contact TEXT,
            email TEXT,
            address TEXT,
            purok TEXT,
            occupation TEXT,
            educational_attainment TEXT,
            voter_status TEXT, -- Yes/No
            is_senior TEXT, -- Yes/No
            is_pwd TEXT, -- Yes/No
            is_solo_parent TEXT, -- Yes/No
            is_minor TEXT, -- Yes/No
            household_number TEXT,
            status TEXT DEFAULT 'Active', -- Active, Archived, Inactive
            date_registered TEXT
        )`);

        // 6. Certificate Requests Table
        db.run(`CREATE TABLE IF NOT EXISTS certificate_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cert_number TEXT,
            resident_id TEXT,
            resident_name TEXT,
            cert_type TEXT,
            purpose TEXT,
            status TEXT DEFAULT 'Pending', -- Pending, Processing, Approved, Ready for Release, Released, Rejected
            remarks TEXT,
            release_date TEXT,
            authorized_official TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 7. Appointments Table
        db.run(`CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id TEXT,
            resident_name TEXT,
            service TEXT,
            appointment_date TEXT,
            appointment_time TEXT,
            status TEXT DEFAULT 'Pending', -- Pending, Approved, Completed, Cancelled, Rejected
            remarks TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 8. Blotter Records Table
        db.run(`CREATE TABLE IF NOT EXISTS blotters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_number TEXT UNIQUE,
            complainant TEXT,
            respondent TEXT,
            witness TEXT,
            incident_date TEXT,
            incident_time TEXT,
            location TEXT,
            description TEXT,
            action_taken TEXT,
            status TEXT DEFAULT 'Open', -- Open, Under Investigation, Settled, Resolved, Closed
            settlement_info TEXT,
            date_resolved TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 9. Assistance Requests Table
        db.run(`CREATE TABLE IF NOT EXISTS assistance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id TEXT,
            resident_name TEXT,
            assistance_type TEXT, -- Financial, Medical, Educational, Food, Emergency
            reason TEXT,
            status TEXT DEFAULT 'Pending', -- Pending, Approved, Released, Rejected
            remarks TEXT,
            amount_given TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 10. Business Records Table
        db.run(`CREATE TABLE IF NOT EXISTS businesses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            business_id TEXT UNIQUE,
            business_name TEXT,
            owner_name TEXT,
            address TEXT,
            purok TEXT,
            business_type TEXT,
            contact TEXT,
            permit_number TEXT,
            permit_status TEXT DEFAULT 'Active', -- Active, Expired, Revoked
            date_registered TEXT,
            expiration_date TEXT
        )`);

        // 11. Announcements Table
        db.run(`CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            category TEXT, -- Announcement, Event, Meeting, Emergency, Program, Public Notice
            content TEXT,
            author TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 12. Notifications Table
        db.run(`CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipient_username TEXT,
            title TEXT,
            message TEXT,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 13. Feedback Table
        db.run(`CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_name TEXT,
            rating INTEGER,
            comments TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 14. Activity Logs Table
        db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            action TEXT,
            date TEXT,
            time TEXT
        )`);
    });
}

function logActivity(username, action) {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString();
    db.run(`INSERT INTO activity_logs (username, action, date, time) VALUES (?, ?, ?, ?)`, [username || 'System', action, dateStr, timeStr]);
}

function addNotification(username, title, message) {
    db.run(`INSERT INTO notifications (recipient_username, title, message) VALUES (?, ?, ?)`, [username, title, message]);
}

async function generateResidentId() {
    return new Promise((resolve, reject) => {
        db.get(`SELECT resident_id FROM residents ORDER BY id DESC LIMIT 1`, (err, row) => {
            if (err) return reject(err);
            let nextNum = 1;
            if (row && row.resident_id) {
                const parts = row.resident_id.split('-');
                if (parts.length === 2) {
                    nextNum = parseInt(parts[1], 10) + 1;
                }
            }
            const padded = String(nextNum).padStart(6, '0');
            resolve(`RES-${padded}`);
        });
    });
}

// Authentication Middleware
function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
}

function isAdminOrStaff(req, res, next) {
    if (req.session && req.session.user && ['Admin', 'Barangay Secretary', 'Staff'].includes(req.session.user.role)) {
        return next();
    }
    res.status(403).send('Access Denied: Staff privileges required.');
}

function isAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'Admin') {
        return next();
    }
    res.status(403).send('Access Denied: Admin privileges required.');
}

function renderLayout(title, content, user, settings, activeTab = '') {
    const isStaff = user && ['Admin', 'Barangay Secretary', 'Staff'].includes(user.role);
    const logo = (settings && settings.logo_url) ? settings.logo_url : 'https://placehold.co/150x150/1e40af/ffffff?text=BRGY';
    const brgyName = (settings && settings.barangay_name) ? settings.barangay_name : 'Barangay Management System';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - ${brgyName}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body { font-family: 'Inter', sans-serif; }
    </style>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen flex flex-col">
    ${user ? `
    <header class="bg-blue-900 text-white shadow-md sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
            <div class="flex items-center space-x-3">
                <img src="${logo}" alt="Logo" class="w-10 h-10 rounded-full object-cover bg-white p-0.5">
                <div>
                    <h1 class="font-bold text-lg leading-tight">${brgyName}</h1>
                    <p class="text-xs text-blue-200">Resident Management Portal</p>
                </div>
            </div>
            <div class="flex items-center space-x-4">
                <div class="text-right hidden sm:block">
                    <p class="text-sm font-semibold">${user.full_name || user.username}</p>
                    <span class="text-xs bg-blue-800 text-blue-200 px-2 py-0.5 rounded-full">${user.role}</span>
                </div>
                <a href="/logout" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center space-x-1">
                    <i class="fa-solid fa-right-from-bracket"></i> <span class="hidden md:inline">Logout</span>
                </a>
            </div>
        </div>
    </header>
    ` : ''}

    <main class="flex-grow">
        ${content}
    </main>

    <footer class="bg-slate-800 text-slate-400 py-6 text-center text-sm border-t border-slate-700">
        <p>&copy; 2026 ${brgyName}. All rights reserved. Barangay Resident Management System.</p>
    </footer>
</body>
</html>`;
}

app.get('/login', (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        const html = `
        <div class="min-h-[85vh] flex items-center justify-center px-4 py-12">
            <div class="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
                <div class="bg-gradient-to-r from-blue-900 to-blue-800 p-6 text-center text-white">
                    <img src="${settings ? settings.logo_url : 'https://placehold.co/150'}" alt="Logo" class="w-20 h-20 mx-auto rounded-full object-cover border-4 border-white/20 mb-3 bg-white p-1 shadow-md">
                    <h2 class="text-2xl font-bold">${settings ? settings.barangay_name : 'Barangay Portal'}</h2>
                    <p class="text-blue-200 text-sm mt-1">Sign in to access your dashboard</p>
                </div>
                <div class="p-8">
                    <form action="/login" method="POST" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Username or Resident ID</label>
                            <input type="text" name="username" required class="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:outline-none">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Password</label>
                            <input type="password" name="password" required class="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:outline-none">
                        </div>
                        <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition shadow-md">Sign In</button>
                    </form>
                    <div class="mt-6 text-center border-t border-slate-100 pt-4">
                        <p class="text-sm text-slate-600">Resident without an account? <a href="/register-resident" class="text-blue-600 font-semibold hover:underline">Register here</a></p>
                        <p class="text-xs text-slate-400 mt-2">Default Admin: admin / admin123</p>
                    </div>
                </div>
            </div>
        </div>`;
        res.send(renderLayout('Login', html, null, settings));
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? OR resident_id = ?`, [username, username], async (err, user) => {
        if (err || !user) {
            return res.send(renderLayout('Login Error', `<div class="p-8 text-center"><div class="bg-red-100 text-red-700 p-4 rounded-lg max-w-md mx-auto mb-4">Invalid username or password.</div><a href="/login" class="text-blue-600 underline font-semibold">Back to Login</a></div>`, null, null));
        }
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.send(renderLayout('Login Error', `<div class="p-8 text-center"><div class="bg-red-100 text-red-700 p-4 rounded-lg max-w-md mx-auto mb-4">Invalid username or password.</div><a href="/login" class="text-blue-600 underline font-semibold">Back to Login</a></div>`, null, null));
        }
        req.session.user = user;
        logActivity(user.username, 'User logged in');
        if (['Admin', 'Barangay Secretary', 'Staff'].includes(user.role)) {
            res.redirect('/staff/dashboard');
        } else {
            res.redirect('/resident/dashboard');
        }
    });
});

app.get('/logout', (req, res) => {
    if (req.session && req.session.user) {
        logActivity(req.session.user.username, 'User logged out');
    }
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Self-Registration for Residents
app.get('/register-resident', (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM puroks`, (err, puroks) => {
            const html = `
            <div class="max-w-2xl mx-auto px-4 py-10">
                <div class="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
                    <h2 class="text-2xl font-bold text-slate-800 mb-2">Resident Self-Registration</h2>
                    <p class="text-slate-500 text-sm mb-6">Create your resident portal account and request your unique Resident ID.</p>
                    <form action="/register-resident" method="POST" class="space-y-4">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">First Name</label>
                                <input type="text" name="first_name" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Middle Name</label>
                                <input type="text" name="middle_name" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                                <input type="text" name="last_name" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Suffix</label>
                                <input type="text" name="suffix" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
                                <input type="date" name="dob" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                                <select name="gender" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none">
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Contact Number</label>
                                <input type="text" name="contact" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                <input type="email" name="email" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Purok</label>
                                <select name="purok" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none">
                                    ${puroks.map(p => `<option value="${p.purok_name}">${p.purok_name}</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Password</label>
                                <input type="password" name="password" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none">
                            </div>
                        </div>
                        <div class="mt-6 flex justify-end space-x-3">
                            <a href="/login" class="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-100">Cancel</a>
                            <button type="submit" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow">Register & Get ID</button>
                        </div>
                    </form>
                </div>
            </div>`;
            res.send(renderLayout('Resident Registration', html, null, settings));
        });
    });
});

app.post('/register-resident', async (req, res) => {
    const { first_name, middle_name, last_name, suffix, dob, gender, contact, email, purok, password } = req.body;
    try {
        const residentId = await generateResidentId();
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        const isMinor = age < 18 ? 'Yes' : 'No';
        const isSenior = age >= 60 ? 'Yes' : 'No';
        const hashedPassword = await bcrypt.hash(password, 10);
        const fullName = `${first_name} ${middle_name ? middle_name + ' ' : ''}${last_name}${suffix ? ' ' + suffix : ''}`;
        const dateRegistered = new Date().toISOString().split('T')[0];

        db.run(`INSERT INTO residents (resident_id, first_name, middle_name, last_name, suffix, dob, age, gender, contact, email, purok, is_minor, is_senior, status, date_registered) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)`,
            [residentId, first_name, middle_name, last_name, suffix, dob, age, gender, contact, email, purok, isMinor, isSenior, dateRegistered], (err) => {
                if (err) {
                    return res.send(renderLayout('Error', `<div class="p-8 text-center"><div class="bg-red-100 text-red-700 p-4 rounded-lg">Error registering: ${err.message}</div><a href="/register-resident" class="text-blue-600 underline">Try Again</a></div>`, null, null));
                }
                db.run(`INSERT INTO users (username, password, role, full_name, email, contact, resident_id) VALUES (?, ?, 'Resident', ?, ?, ?, ?)`,
                    [email, hashedPassword, fullName, email, contact, residentId], (err2) => {
                        logActivity(email, 'Resident self-registered: ' + residentId);
                        res.send(renderLayout('Registration Successful', `<div class="max-w-md mx-auto my-12 bg-white p-8 rounded-xl shadow text-center"><div class="text-green-600 text-5xl mb-3"><i class="fa-solid fa-circle-check"></i></div><h2 class="text-2xl font-bold mb-2">Registration Successful!</h2><p class="text-slate-600 mb-4">Your automatically generated Resident ID is:</p><div class="bg-blue-50 text-blue-900 font-mono text-xl font-bold p-3 rounded-lg mb-6 border border-blue-200">${residentId}</div><a href="/login" class="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700">Proceed to Login</a></div>`, null, null));
                    });
            });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// QR Verification Public Page
app.get('/verify/certificate/:certNumber', (req, res) => {
    const certNumber = req.params.certNumber;
    db.get(`SELECT * FROM certificate_requests WHERE cert_number = ?`, [certNumber], (err, cert) => {
        db.get(`SELECT * FROM settings LIMIT 1`, (err2, settings) => {
            const html = `
            <div class="max-w-xl mx-auto px-4 py-16">
                <div class="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 text-center p-8">
                    <img src="${settings ? settings.logo_url : ''}" class="w-20 h-20 mx-auto rounded-full object-cover mb-4 shadow" alt="Logo">
                    <h2 class="text-xl font-bold text-slate-800">${settings ? settings.barangay_name : 'Barangay'} Official Verification</h2>
                    <p class="text-xs text-slate-500 mb-6">${settings ? settings.municipality + ', ' + settings.province : ''}</p>
                    
                    ${cert ? `
                        <div class="bg-green-50 border border-green-200 text-green-800 p-4 rounded-xl mb-6 flex items-center justify-center space-x-2">
                            <i class="fa-solid fa-circle-check text-2xl"></i>
                            <div class="text-left">
                                <p class="font-bold text-lg">✓ VERIFIED & VALID</p>
                                <p class="text-xs">This certificate is genuine and officially issued.</p>
                            </div>
                        </div>
                        <div class="bg-slate-50 rounded-xl p-6 text-left space-y-3 text-sm border">
                            <div class="flex justify-between border-b pb-2"><span class="text-slate-500">Certificate No:</span><span class="font-mono font-bold">${cert.cert_number}</span></div>
                            <div class="flex justify-between border-b pb-2"><span class="text-slate-500">Certificate Type:</span><span class="font-semibold">${cert.cert_type}</span></div>
                            <div class="flex justify-between border-b pb-2"><span class="text-slate-500">Resident Name:</span><span class="font-semibold">${cert.resident_name}</span></div>
                            <div class="flex justify-between border-b pb-2"><span class="text-slate-500">Resident ID:</span><span class="font-mono font-bold">${cert.resident_id}</span></div>
                            <div class="flex justify-between border-b pb-2"><span class="text-slate-500">Status:</span><span class="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-bold">${cert.status}</span></div>
                            <div class="flex justify-between"><span class="text-slate-500">Date Issued:</span><span>${cert.release_date || cert.created_at}</span></div>
                        </div>
                    ` : `
                        <div class="bg-red-50 border border-red-200 text-red-800 p-6 rounded-xl mb-6">
                            <i class="fa-solid fa-triangle-exclamation text-3xl mb-2"></i>
                            <p class="font-bold text-lg">INVALID CERTIFICATE</p>
                            <p class="text-sm">No record found matching certificate number: <span class="font-mono">${certNumber}</span></p>
                        </div>
                    `}
                    <div class="mt-8">
                        <a href="/login" class="text-blue-600 hover:underline text-sm font-semibold"><i class="fa-solid fa-arrow-left"></i> Go to Portal Login</a>
                    </div>
                </div>
            </div>`;
            res.send(renderLayout('Certificate Verification', html, null, settings));
        });
    });
});

app.get('/staff/dashboard', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT purok_name FROM puroks`, (err, puroks) => {
            db.get(`SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN gender='Male' THEN 1 ELSE 0 END) as males,
                SUM(CASE WHEN gender='Female' THEN 1 ELSE 0 END) as females,
                SUM(CASE WHEN is_senior='Yes' THEN 1 ELSE 0 END) as seniors,
                SUM(CASE WHEN is_pwd='Yes' THEN 1 ELSE 0 END) as pwds,
                SUM(CASE WHEN is_solo_parent='Yes' THEN 1 ELSE 0 END) as solo_parents,
                SUM(CASE WHEN is_minor='Yes' THEN 1 ELSE 0 END) as minors,
                SUM(CASE WHEN voter_status='Yes' THEN 1 ELSE 0 END) as voters
                FROM residents WHERE status='Active'`, (err, rStats) => {
                db.get(`SELECT COUNT(*) as total FROM households`, (err, hStats) => {
                    db.get(`SELECT COUNT(*) as pending_req FROM certificate_requests WHERE status='Pending'`, (err, reqStats) => {
                        db.get(`SELECT COUNT(*) as pending_app FROM appointments WHERE status='Pending'`, (err, appStats) => {
                            db.all(`SELECT * FROM activity_logs ORDER BY id DESC LIMIT 5`, (err, logs) => {
                                db.all(`SELECT purok, COUNT(*) as count FROM residents WHERE status='Active' GROUP BY purok`, (err, purokCounts) => {
                                    
                                    const staffNav = `
                                    <div class="bg-white border-b shadow-sm">
                                        <div class="max-w-7xl mx-auto px-4 flex overflow-x-auto space-x-6 py-3 text-sm font-medium">
                                            <a href="/staff/dashboard" class="text-blue-600 border-b-2 border-blue-600 pb-1 flex items-center space-x-1"><i class="fa-solid fa-chart-pie"></i><span>Dashboard</span></a>
                                            <a href="/staff/residents" class="text-slate-600 hover:text-blue-600 pb-1 flex items-center space-x-1"><i class="fa-solid fa-users"></i><span>Residents</span></a>
                                            <a href="/staff/households" class="text-slate-600 hover:text-blue-600 pb-1 flex items-center space-x-1"><i class="fa-solid fa-house-chimney"></i><span>Households</span></a>
                                            <a href="/staff/puroks" class="text-slate-600 hover:text-blue-600 pb-1 flex items-center space-x-1"><i class="fa-solid fa-map-location-dot"></i><span>Puroks</span></a>
                                            <a href="/staff/certificates" class="text-slate-600 hover:text-blue-600 pb-1 flex items-center space-x-1"><i class="fa-solid fa-file-shield"></i><span>Certificates</span></a>
                                            <a href="/staff/appointments" class="text-slate-600 hover:text-blue-600 pb-1 flex items-center space-x-1"><i class="fa-solid fa-calendar-check"></i><span>Appointments</span></a>
                                            <a href="/staff/blotter" class="text-slate-600 hover:text-blue-600 pb-1 flex items-center space-x-1"><i class="fa-solid fa-scale-balanced"></i><span>Blotter</span></a>
                                            <a href="/staff/assistance" class="text-slate-600 hover:text-blue-600 pb-1 flex items-center space-x-1"><i class="fa-solid fa-hand-holding-heart"></i><span>Assistance</span></a>
                                            <a href="/staff/businesses" class="text-slate-600 hover:text-blue-600 pb-1 flex items-center space-x-1"><i class="fa-solid fa-store"></i><span>Businesses</span></a>
                                            <a href="/staff/announcements" class="text-slate-600 hover:text-blue-600 pb-1 flex items-center space-x-1"><i class="fa-solid fa-bullhorn"></i><span>Announcements</span></a>
                                            <a href="/staff/reports" class="text-slate-600 hover:text-blue-600 pb-1 flex items-center space-x-1"><i class="fa-solid fa-print"></i><span>Reports</span></a>
                                            ${req.session.user.role === 'Admin' ? '<a href="/staff/settings" class="text-slate-600 hover:text-blue-600 pb-1 flex items-center space-x-1"><i class="fa-solid fa-gear"></i><span>Settings</span></a>' : ''}
                                            ${req.session.user.role === 'Admin' ? '<a href="/staff/users" class="text-slate-600 hover:text-blue-600 pb-1 flex items-center space-x-1"><i class="fa-solid fa-user-shield"></i><span>Users</span></a>' : ''}
                                        </div>
                                    </div>`;

                                    const html = `
                                    ${staffNav}
                                    <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
                                        <div class="flex justify-between items-center">
                                            <div>
                                                <h2 class="text-2xl font-bold text-slate-800">Staff Dashboard</h2>
                                                <p class="text-sm text-slate-500">Overview of barangay statistics and recent activity.</p>
                                            </div>
                                            <div class="flex space-x-2">
                                                <a href="/staff/residents/new" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow flex items-center space-x-2"><i class="fa-solid fa-user-plus"></i><span>Add Resident</span></a>
                                                <a href="/staff/certificates" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow flex items-center space-x-2"><i class="fa-solid fa-file-circle-plus"></i><span>Requests (${reqStats.pending_req})</span></a>
                                            </div>
                                        </div>

                                        <!-- Stat Cards Grid -->
                                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
                                                <div><p class="text-xs text-slate-500 uppercase font-bold tracking-wider">Total Residents</p><h3 class="text-3xl font-extrabold text-blue-900 mt-1">${rStats.total || 0}</h3></div>
                                                <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl"><i class="fa-solid fa-users"></i></div>
                                            </div>
                                            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
                                                <div><p class="text-xs text-slate-500 uppercase font-bold tracking-wider">Households</p><h3 class="text-3xl font-extrabold text-emerald-900 mt-1">${hStats.total || 0}</h3></div>
                                                <div class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl"><i class="fa-solid fa-house-chimney"></i></div>
                                            </div>
                                            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
                                                <div><p class="text-xs text-slate-500 uppercase font-bold tracking-wider">Senior Citizens</p><h3 class="text-3xl font-extrabold text-amber-900 mt-1">${rStats.seniors || 0}</h3></div>
                                                <div class="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-xl"><i class="fa-solid fa-person-cane"></i></div>
                                            </div>
                                            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
                                                <div><p class="text-xs text-slate-500 uppercase font-bold tracking-wider">Voters</p><h3 class="text-3xl font-extrabold text-indigo-900 mt-1">${rStats.voters || 0}</h3></div>
                                                <div class="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-xl"><i class="fa-solid fa-check-to-slot"></i></div>
                                            </div>
                                        </div>

                                        <!-- Secondary Demographics -->
                                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                            <div class="bg-white p-4 rounded-xl border text-center"><p class="text-xs text-slate-500">Male / Female</p><p class="text-lg font-bold">${rStats.males || 0} / ${rStats.females || 0}</p></div>
                                            <div class="bg-white p-4 rounded-xl border text-center"><p class="text-xs text-slate-500">PWDs</p><p class="text-lg font-bold">${rStats.pwds || 0}</p></div>
                                            <div class="bg-white p-4 rounded-xl border text-center"><p class="text-xs text-slate-500">Solo Parents</p><p class="text-lg font-bold">${rStats.solo_parents || 0}</p></div>
                                            <div class="bg-white p-4 rounded-xl border text-center"><p class="text-xs text-slate-500">Minors</p><p class="text-lg font-bold">${rStats.minors || 0}</p></div>
                                        </div>

                                        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                            <!-- Purok Population Breakdown -->
                                            <div class="bg-white p-6 rounded-xl shadow-sm border col-span-1">
                                                <h3 class="font-bold text-slate-800 mb-4 flex items-center space-x-2"><i class="fa-solid fa-chart-bar text-blue-600"></i><span>Population per Purok</span></h3>
                                                <div class="space-y-3">
                                                    ${purokCounts.length > 0 ? purokCounts.map(p => `
                                                        <div>
                                                            <div class="flex justify-between text-sm mb-1 font-medium"><span class="text-slate-600">${p.purok}</span><span class="text-slate-800">${p.count} residents</span></div>
                                                            <div class="w-full bg-slate-100 rounded-full h-2.5"><div class="bg-blue-600 h-2.5 rounded-full" style="width: ${Math.min(100, (p.count / (rStats.total || 1)) * 100)}%"></div></div>
                                                        </div>
                                                    `).join('') : '<p class="text-slate-400 text-sm italic">No purok population data recorded yet.</p>'}
                                                </div>
                                            </div>

                                            <!-- Recent Activity Logs -->
                                            <div class="bg-white p-6 rounded-xl shadow-sm border col-span-2">
                                                <h3 class="font-bold text-slate-800 mb-4 flex items-center space-x-2"><i class="fa-solid fa-clock-rotate-left text-blue-600"></i><span>Recent System Activities</span></h3>
                                                <div class="space-y-3">
                                                    ${logs.length > 0 ? logs.map(l => `
                                                        <div class="flex items-center justify-between text-sm p-3 bg-slate-50 rounded-lg border">
                                                            <div><span class="font-semibold text-blue-900">${l.username}:</span> <span class="text-slate-700">${l.action}</span></div>
                                                            <span class="text-xs text-slate-400">${l.date} ${l.time}</span>
                                                        </div>
                                                    `).join('') : '<p class="text-slate-400 text-sm italic">No recent activities logged.</p>'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>`;
                                    res.send(renderLayout('Staff Dashboard', html, req.session.user, settings));
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

app.get('/staff/residents', isAuthenticated, isAdminOrStaff, (req, res) => {
    const { search = '', purok = '', gender = '', status = 'Active' } = req.query;
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM puroks`, (err, puroksList) => {
            let query = `SELECT * FROM residents WHERE 1=1`;
            let params = [];
            if (status) {
                query += ` AND status = ?`;
                params.push(status);
            }
            if (purok) {
                query += ` AND purok = ?`;
                params.push(purok);
            }
            if (gender) {
                query += ` AND gender = ?`;
                params.push(gender);
            }
            if (search) {
                query += ` AND (first_name LIKE ? OR last_name LIKE ? OR resident_id LIKE ? OR contact LIKE ? OR middle_name LIKE ?)`;
                const s = `%${search}%`;
                params.push(s, s, s, s, s);
            }
            query += ` ORDER BY id DESC`;

            db.all(query, params, (err, residents) => {
                const staffNav = `<div class="bg-white border-b shadow-sm"><div class="max-w-7xl mx-auto px-4 flex overflow-x-auto space-x-6 py-3 text-sm font-medium"><a href="/staff/dashboard" class="text-slate-600 hover:text-blue-600">Dashboard</a><a href="/staff/residents" class="text-blue-600 border-b-2 border-blue-600 pb-1">Residents</a><a href="/staff/households" class="text-slate-600 hover:text-blue-600">Households</a><a href="/staff/puroks" class="text-slate-600 hover:text-blue-600">Puroks</a><a href="/staff/certificates" class="text-slate-600 hover:text-blue-600">Certificates</a><a href="/staff/appointments" class="text-slate-600 hover:text-blue-600">Appointments</a><a href="/staff/blotter" class="text-slate-600 hover:text-blue-600">Blotter</a><a href="/staff/assistance" class="text-slate-600 hover:text-blue-600">Assistance</a><a href="/staff/businesses" class="text-slate-600 hover:text-blue-600">Businesses</a><a href="/staff/announcements" class="text-slate-600 hover:text-blue-600">Announcements</a><a href="/staff/reports" class="text-slate-600 hover:text-blue-600">Reports</a></div></div>`;

                const html = `
                ${staffNav}
                <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <h2 class="text-2xl font-bold text-slate-800">Resident Management</h2>
                            <p class="text-sm text-slate-500">Manage registered residents, profiles, and statuses.</p>
                        </div>
                        <a href="/staff/residents/new" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow flex items-center space-x-2"><i class="fa-solid fa-user-plus"></i><span>Add Resident</span></a>
                    </div>

                    <!-- Search and Filters Form -->
                    <form method="GET" action="/staff/residents" class="bg-white p-4 rounded-xl shadow-sm border grid grid-cols-1 sm:grid-cols-5 gap-3">
                        <input type="text" name="search" value="${search}" placeholder="Search name, ID, contact..." class="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 sm:col-span-2">
                        <select name="purok" class="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                            <option value="">All Puroks</option>
                            ${puroksList.map(p => `<option value="${p.purok_name}" ${purok === p.purok_name ? 'selected' : ''}>${p.purok_name}</option>`).join('')}
                        </select>
                        <select name="gender" class="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                            <option value="">All Genders</option>
                            <option value="Male" ${gender === 'Male' ? 'selected' : ''}>Male</option>
                            <option value="Female" ${gender === 'Female' ? 'selected' : ''}>Female</option>
                        </select>
                        <select name="status" class="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                            <option value="Active" ${status === 'Active' ? 'selected' : ''}>Active</option>
                            <option value="Archived" ${status === 'Archived' ? 'selected' : ''}>Archived</option>
                            <option value="Inactive" ${status === 'Inactive' ? 'selected' : ''}>Inactive</option>
                        </select>
                        <div class="sm:col-span-5 flex justify-end space-x-2">
                            <a href="/staff/residents" class="px-4 py-2 border rounded-lg text-sm text-slate-600 hover:bg-slate-100">Reset</a>
                            <button type="submit" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">Filter Records</button>
                        </div>
                    </form>

                    <!-- Residents Table -->
                    <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-slate-100 text-slate-600 text-xs uppercase font-semibold">
                                    <tr>
                                        <th class="p-4">Resident ID</th>
                                        <th class="p-4">Full Name</th>
                                        <th class="p-4">Age / Gender</th>
                                        <th class="p-4">Purok / Address</th>
                                        <th class="p-4">Contact</th>
                                        <th class="p-4">Status</th>
                                        <th class="p-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 text-sm">
                                    ${residents.length > 0 ? residents.map(r => `
                                        <tr class="hover:bg-slate-50 transition">
                                            <td class="p-4 font-mono font-bold text-blue-900">${r.resident_id}</td>
                                            <td class="p-4 font-semibold text-slate-800">${r.first_name} ${r.middle_name || ''} ${r.last_name} ${r.suffix || ''}</td>
                                            <td class="p-4 text-slate-600">${r.age} yrs / ${r.gender}</td>
                                            <td class="p-4 text-slate-600">${r.purok || 'N/A'}</td>
                                            <td class="p-4 text-slate-600">${r.contact || 'N/A'}</td>
                                            <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ${r.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}">${r.status}</span></td>
                                            <td class="p-4 text-right space-x-2 whitespace-nowrap">
                                                <a href="/staff/residents/view/${r.id}" class="text-blue-600 hover:text-blue-800 font-medium" title="View"><i class="fa-solid fa-eye"></i></a>
                                                <a href="/staff/residents/edit/${r.id}" class="text-indigo-600 hover:text-indigo-800 font-medium" title="Edit"><i class="fa-solid fa-pen-to-square"></i></a>
                                                ${r.status === 'Active' ? `
                                                    <a href="/staff/residents/archive/${r.id}" onclick="return confirm('Are you sure you want to archive this resident?');" class="text-amber-600 hover:text-amber-800 font-medium" title="Archive"><i class="fa-solid fa-box-archive"></i></a>
                                                ` : `
                                                    <a href="/staff/residents/restore/${r.id}" class="text-green-600 hover:text-green-800 font-medium" title="Restore"><i class="fa-solid fa-rotate-left"></i></a>
                                                `}
                                                <a href="/staff/residents/delete/${r.id}" onclick="return confirm('Permanently delete this resident record? This cannot be undone.');" class="text-red-600 hover:text-red-800 font-medium" title="Delete"><i class="fa-solid fa-trash"></i></a>
                                            </td>
                                        </tr>
                                    `).join('') : `
                                        <tr><td colspan="7" class="p-8 text-center text-slate-400 italic">No residents found.<br>Add your first resident to get started.</td></tr>
                                    `}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>`;
                res.send(renderLayout('Resident Management', html, req.session.user, settings));
            });
        });
    });
});

// Add Resident Form
app.get('/staff/residents/new', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM puroks`, (err, puroks) => {
            const html = `
            <div class="max-w-3xl mx-auto px-4 py-8">
                <div class="bg-white rounded-xl shadow-sm border p-8">
                    <h2 class="text-xl font-bold text-slate-800 mb-1">Add New Resident</h2>
                    <p class="text-sm text-slate-500 mb-6">A unique Resident ID will be automatically generated upon submission.</p>
                    <form action="/staff/residents/new" method="POST" class="space-y-4">
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                                <input type="text" name="first_name" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Middle Name</label>
                                <input type="text" name="middle_name" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
                                <input type="text" name="last_name" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Suffix (Jr, Sr, III)</label>
                                <input type="text" name="suffix" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Date of Birth *</label>
                                <input type="date" name="dob" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Gender *</label>
                                <select name="gender" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600">
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Civil Status</label>
                                <select name="civil_status" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600">
                                    <option value="Single">Single</option>
                                    <option value="Married">Married</option>
                                    <option value="Widowed">Widowed</option>
                                    <option value="Separated">Separated</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Contact Number</label>
                                <input type="text" name="contact" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                <input type="email" name="email" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Purok *</label>
                                <select name="purok" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600">
                                    ${puroks.map(p => `<option value="${p.purok_name}">${p.purok_name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="sm:col-span-2">
                                <label class="block text-sm font-medium text-slate-700 mb-1">Full Address</label>
                                <input type="text" name="address" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Occupation</label>
                                <input type="text" name="occupation" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Voter Status</label>
                                <select name="voter_status" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600">
                                    <option value="Yes">Yes</option>
                                    <option value="No">No</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">PWD Status</label>
                                <select name="is_pwd" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600">
                                    <option value="No">No</option>
                                    <option value="Yes">Yes</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Solo Parent</label>
                                <select name="is_solo_parent" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600">
                                    <option value="No">No</option>
                                    <option value="Yes">Yes</option>
                                </select>
                            </div>
                        </div>
                        <div class="flex justify-end space-x-3 pt-4 border-t">
                            <a href="/staff/residents" class="px-4 py-2 border rounded-lg text-slate-600">Cancel</a>
                            <button type="submit" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow">Save Resident</button>
                        </div>
                    </form>
                </div>
            </div>`;
            res.send(renderLayout('Add Resident', html, req.session.user, settings));
        });
    });
});

app.post('/staff/residents/new', isAuthenticated, isAdminOrStaff, async (req, res) => {
    const { first_name, middle_name, last_name, suffix, dob, gender, civil_status, contact, email, address, purok, occupation, voter_status, is_pwd, is_solo_parent } = req.body;
    try {
        const residentId = await generateResidentId();
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
        const isMinor = age < 18 ? 'Yes' : 'No';
        const isSenior = age >= 60 ? 'Yes' : 'No';
        const dateRegistered = new Date().toISOString().split('T')[0];

        db.run(`INSERT INTO residents (resident_id, first_name, middle_name, last_name, suffix, dob, age, gender, civil_status, contact, email, address, purok, occupation, voter_status, is_pwd, is_solo_parent, is_minor, is_senior, status, date_registered) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)`,
            [residentId, first_name, middle_name, last_name, suffix, dob, age, gender, civil_status, contact, email, address, purok, occupation, voter_status, is_pwd, is_solo_parent, is_minor, is_senior, dateRegistered], (err) => {
                logActivity(req.session.user.username, `Added resident: ${residentId} - ${first_name} ${last_name}`);
                res.redirect('/staff/residents');
            });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// View Resident Profile
app.get('/staff/residents/view/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    const id = req.params.id;
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.get(`SELECT * FROM residents WHERE id = ?`, [id], (err, resident) => {
            if (!resident) return res.redirect('/staff/residents');
            const html = `
            <div class="max-w-4xl mx-auto px-4 py-8 space-y-6">
                <div class="flex justify-between items-center">
                    <div>
                        <a href="/staff/residents" class="text-blue-600 hover:underline text-sm font-medium mb-1 inline-block"><i class="fa-solid fa-arrow-left"></i> Back to Residents</a>
                        <h2 class="text-2xl font-bold text-slate-800">Resident Profile</h2>
                    </div>
                    <div class="space-x-2">
                        <button onclick="window.print()" class="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow hover:bg-slate-700"><i class="fa-solid fa-print"></i> Print</button>
                        <a href="/staff/residents/edit/${resident.id}" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow hover:bg-blue-700"><i class="fa-solid fa-pen"></i> Edit</a>
                    </div>
                </div>

                <div class="bg-white rounded-2xl shadow-sm border p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div class="text-center border-r md:pr-8 border-slate-100 flex flex-col items-center justify-center">
                        <img src="https://placehold.co/150x150/e2e8f0/475569?text=${resident.first_name[0]}${resident.last_name[0]}" class="w-32 h-32 rounded-full object-cover shadow mb-4 border-4 border-slate-100" alt="Avatar">
                        <h3 class="text-xl font-bold text-slate-800">${resident.first_name} ${resident.middle_name || ''} ${resident.last_name} ${resident.suffix || ''}</h3>
                        <p class="text-blue-600 font-mono font-bold text-lg mt-1">${resident.resident_id}</p>
                        <span class="mt-3 px-3 py-1 rounded-full text-xs font-semibold ${resident.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}">${resident.status}</span>
                    </div>
                    <div class="md:col-span-2 grid grid-cols-2 gap-4 text-sm">
                        <div><p class="text-slate-400 text-xs uppercase font-bold">Date of Birth / Age</p><p class="font-semibold text-slate-800">${resident.dob} (${resident.age} yrs)</p></div>
                        <div><p class="text-slate-400 text-xs uppercase font-bold">Gender</p><p class="font-semibold text-slate-800">${resident.gender}</p></div>
                        <div><p class="text-slate-400 text-xs uppercase font-bold">Civil Status</p><p class="font-semibold text-slate-800">${resident.civil_status || 'N/A'}</p></div>
                        <div><p class="text-slate-400 text-xs uppercase font-bold">Contact Number</p><p class="font-semibold text-slate-800">${resident.contact || 'N/A'}</p></div>
                        <div><p class="text-slate-400 text-xs uppercase font-bold">Email Address</p><p class="font-semibold text-slate-800">${resident.email || 'N/A'}</p></div>
                        <div><p class="text-slate-400 text-xs uppercase font-bold">Purok</p><p class="font-semibold text-slate-800">${resident.purok || 'N/A'}</p></div>
                        <div class="col-span-2"><p class="text-slate-400 text-xs uppercase font-bold">Full Address</p><p class="font-semibold text-slate-800">${resident.address || 'N/A'}</p></div>
                        <div><p class="text-slate-400 text-xs uppercase font-bold">Occupation</p><p class="font-semibold text-slate-800">${resident.occupation || 'N/A'}</p></div>
                        <div><p class="text-slate-400 text-xs uppercase font-bold">Voter Status</p><p class="font-semibold text-slate-800">${resident.voter_status}</p></div>
                        <div><p class="text-slate-400 text-xs uppercase font-bold">Senior Citizen</p><p class="font-semibold text-slate-800">${resident.is_senior}</p></div>
                        <div><p class="text-slate-400 text-xs uppercase font-bold">PWD Status</p><p class="font-semibold text-slate-800">${resident.is_pwd}</p></div>
                    </div>
                </div>
            </div>`;
            res.send(renderLayout('Resident Profile', html, req.session.user, settings));
        });
    });
});

// Archive & Restore & Delete Resident
app.get('/staff/residents/archive/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.run(`UPDATE residents SET status = 'Archived' WHERE id = ?`, [req.params.id], () => {
        logActivity(req.session.user.username, `Archived resident record ID: ${req.params.id}`);
        res.redirect('/staff/residents');
    });
});

app.get('/staff/residents/restore/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.run(`UPDATE residents SET status = 'Active' WHERE id = ?`, [req.params.id], () => {
        logActivity(req.session.user.username, `Restored resident record ID: ${req.params.id}`);
        res.redirect('/staff/residents');
    });
});

app.get('/staff/residents/delete/:id', isAuthenticated, isAdmin, (req, res) => {
    db.run(`DELETE FROM residents WHERE id = ?`, [req.params.id], () => {
        logActivity(req.session.user.username, `Permanently deleted resident record ID: ${req.params.id}`);
        res.redirect('/staff/residents');
    });
});

app.get('/staff/households', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM households`, (err, households) => {
            const html = `
            <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
                <div class="flex justify-between items-center">
                    <div>
                        <a href="/staff/dashboard" class="text-blue-600 hover:underline text-sm font-medium mb-1 inline-block"><i class="fa-solid fa-arrow-left"></i> Dashboard</a>
                        <h2 class="text-2xl font-bold text-slate-800">Household Management</h2>
                    </div>
                    <a href="/staff/households/new" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow"><i class="fa-solid fa-house-medical"></i> Create Household</a>
                </div>
                <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-slate-100 text-slate-600 text-xs uppercase font-semibold">
                            <tr>
                                <th class="p-4">Household No.</th>
                                <th class="p-4">Household Head</th>
                                <th class="p-4">Purok</th>
                                <th class="p-4">Address</th>
                                <th class="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 text-sm">
                            ${households.length > 0 ? households.map(h => `
                                <tr class="hover:bg-slate-50">
                                    <td class="p-4 font-mono font-bold text-blue-900">${h.household_number}</td>
                                    <td class="p-4 font-semibold">${h.head_name}</td>
                                    <td class="p-4">${h.purok}</td>
                                    <td class="p-4">${h.address}</td>
                                    <td class="p-4 text-right">
                                        <a href="/staff/households/delete/${h.id}" onclick="return confirm('Delete this household record?');" class="text-red-600 hover:underline"><i class="fa-solid fa-trash"></i> Delete</a>
                                    </td>
                                </tr>
                            `).join('') : '<tr><td colspan="5" class="p-8 text-center text-slate-400 italic">No households recorded yet.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>`;
            res.send(renderLayout('Household Management', html, req.session.user, settings));
        });
    });
});

app.get('/staff/households/new', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM puroks`, (err, puroks) => {
            const html = `
            <div class="max-w-xl mx-auto px-4 py-8">
                <div class="bg-white rounded-xl shadow-sm border p-8">
                    <h2 class="text-xl font-bold mb-4">Create Household</h2>
                    <form action="/staff/households/new" method="POST" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Household Number *</label>
                            <input type="text" name="household_number" required placeholder="HH-001" class="w-full px-3 py-2 border rounded-lg">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Household Head Name *</label>
                            <input type="text" name="head_name" required class="w-full px-3 py-2 border rounded-lg">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Purok *</label>
                            <select name="purok" class="w-full px-3 py-2 border rounded-lg">
                                ${puroks.map(p => `<option value="${p.purok_name}">${p.purok_name}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Address</label>
                            <input type="text" name="address" class="w-full px-3 py-2 border rounded-lg">
                        </div>
                        <div class="flex justify-end space-x-2 pt-4">
                            <a href="/staff/households" class="px-4 py-2 border rounded-lg">Cancel</a>
                            <button type="submit" class="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg">Save Household</button>
                        </div>
                    </form>
                </div>
            </div>`;
            res.send(renderLayout('New Household', html, req.session.user, settings));
        });
    });
});

app.post('/staff/households/new', isAuthenticated, isAdminOrStaff, (req, res) => {
    const { household_number, head_name, address, purok } = req.body;
    db.run(`INSERT INTO households (household_number, head_name, address, purok) VALUES (?, ?, ?, ?)`, [household_number, head_name, address, purok], () => {
        logActivity(req.session.user.username, `Created household: ${household_number}`);
        res.redirect('/staff/households');
    });
});

app.get('/staff/households/delete/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.run(`DELETE FROM households WHERE id = ?`, [req.params.id], () => {
        res.redirect('/staff/households');
    });
});

app.get('/staff/puroks', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM puroks`, (err, puroks) => {
            const html = `
            <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
                <div class="flex justify-between items-center">
                    <div>
                        <a href="/staff/dashboard" class="text-blue-600 hover:underline text-sm font-medium mb-1 inline-block"><i class="fa-solid fa-arrow-left"></i> Dashboard</a>
                        <h2 class="text-2xl font-bold text-slate-800">Purok Management</h2>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="bg-white p-6 rounded-xl shadow-sm border">
                        <h3 class="font-bold text-lg mb-4">Add New Purok</h3>
                        <form action="/staff/puroks/new" method="POST" class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium mb-1">Purok Name *</label>
                                <input type="text" name="purok_name" required placeholder="Purok 1" class="w-full px-3 py-2 border rounded-lg">
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-1">Purok Leader</label>
                                <input type="text" name="leader_name" class="w-full px-3 py-2 border rounded-lg">
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-1">Description</label>
                                <textarea name="description" class="w-full px-3 py-2 border rounded-lg"></textarea>
                            </div>
                            <button type="submit" class="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg">Add Purok</button>
                        </form>
                    </div>
                    <div class="bg-white p-6 rounded-xl shadow-sm border md:col-span-2">
                        <h3 class="font-bold text-lg mb-4">Purok List</h3>
                        <div class="space-y-3">
                            ${puroks.length > 0 ? puroks.map(p => `
                                <div class="p-4 border rounded-lg flex justify-between items-center">
                                    <div>
                                        <h4 class="font-bold text-blue-900">${p.purok_name}</h4>
                                        <p class="text-sm text-slate-600">Leader: ${p.leader_name || 'None'}</p>
                                        <p class="text-xs text-slate-400 mt-1">${p.description || ''}</p>
                                    </div>
                                    <a href="/staff/puroks/delete/${p.id}" onclick="return confirm('Delete this purok?');" class="text-red-600 text-sm font-medium"><i class="fa-solid fa-trash"></i></a>
                                </div>
                            `).join('') : '<p class="text-slate-400 text-sm italic">No puroks registered yet.</p>'}
                        </div>
                    </div>
                </div>
            </div>`;
            res.send(renderLayout('Purok Management', html, req.session.user, settings));
        });
    });
});

app.post('/staff/puroks/new', isAuthenticated, isAdminOrStaff, (req, res) => {
    const { purok_name, leader_name, description } = req.body;
    db.run(`INSERT INTO puroks (purok_name, leader_name, description) VALUES (?, ?, ?)`, [purok_name, leader_name, description], () => {
        logActivity(req.session.user.username, `Added purok: ${purok_name}`);
        res.redirect('/staff/puroks');
    });
});

app.get('/staff/puroks/delete/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.run(`DELETE FROM puroks WHERE id = ?`, [req.params.id], () => {
        res.redirect('/staff/puroks');
    });
});

app.get('/staff/certificates', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM certificate_requests ORDER BY id DESC`, (err, certs) => {
            const html = `
            <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
                <div class="flex justify-between items-center">
                    <div>
                        <a href="/staff/dashboard" class="text-blue-600 hover:underline text-sm font-medium mb-1 inline-block"><i class="fa-solid fa-arrow-left"></i> Dashboard</a>
                        <h2 class="text-2xl font-bold text-slate-800">Barangay Certificates & Requests</h2>
                    </div>
                    <a href="/staff/certificates/new" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow"><i class="fa-solid fa-file-circle-plus"></i> Issue Certificate</a>
                </div>
                <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-slate-100 text-slate-600 text-xs uppercase font-semibold">
                            <tr>
                                <th class="p-4">Cert No.</th>
                                <th class="p-4">Resident Name</th>
                                <th class="p-4">Certificate Type</th>
                                <th class="p-4">Status</th>
                                <th class="p-4">Date / Official</th>
                                <th class="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 text-sm">
                            ${certs.length > 0 ? certs.map(c => `
                                <tr class="hover:bg-slate-50">
                                    <td class="p-4 font-mono font-bold text-blue-900">${c.cert_number || 'PENDING'}</td>
                                    <td class="p-4 font-semibold">${c.resident_name}</td>
                                    <td class="p-4">${c.cert_type}</td>
                                    <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ${c.status === 'Released' || c.status === 'Approved' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}">${c.status}</span></td>
                                    <td class="p-4 text-xs text-slate-500">${c.release_date || c.created_at}</td>
                                    <td class="p-4 text-right space-x-2">
                                        <a href="/staff/certificates/print/${c.id}" target="_blank" class="text-blue-600 hover:underline font-medium" title="Print"><i class="fa-solid fa-print"></i></a>
                                        <a href="/staff/certificates/status/${c.id}" class="text-indigo-600 hover:underline font-medium" title="Update"><i class="fa-solid fa-pen-to-square"></i></a>
                                    </td>
                                </tr>
                            `).join('') : '<tr><td colspan="6" class="p-8 text-center text-slate-400 italic">No certificate requests found.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>`;
            res.send(renderLayout('Certificates', html, req.session.user, settings));
        });
    });
});

app.get('/staff/certificates/new', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM residents WHERE status = 'Active'`, (err, residents) => {
            const html = `
            <div class="max-w-xl mx-auto px-4 py-8">
                <div class="bg-white rounded-xl shadow-sm border p-8">
                    <h2 class="text-xl font-bold mb-4">Issue Barangay Certificate</h2>
                    <form action="/staff/certificates/new" method="POST" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Select Resident *</label>
                            <select name="resident_id" required class="w-full px-3 py-2 border rounded-lg">
                                ${residents.map(r => `<option value="${r.resident_id}">${r.first_name} ${r.last_name} (${r.resident_id})</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Certificate Type *</label>
                            <select name="cert_type" class="w-full px-3 py-2 border rounded-lg">
                                <option value="Barangay Clearance">Barangay Clearance</option>
                                <option value="Certificate of Residency">Certificate of Residency</option>
                                <option value="Certificate of Indigency">Certificate of Indigency</option>
                                <option value="Certificate of Good Moral">Certificate of Good Moral</option>
                                <option value="Business Clearance">Business Clearance</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Purpose *</label>
                            <input type="text" name="purpose" required placeholder="Employment, Scholarship, etc." class="w-full px-3 py-2 border rounded-lg">
                        </div>
                        <div class="flex justify-end space-x-2 pt-4">
                            <a href="/staff/certificates" class="px-4 py-2 border rounded-lg">Cancel</a>
                            <button type="submit" class="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg">Issue & Generate</button>
                        </div>
                    </form>
                </div>
            </div>`;
            res.send(renderLayout('Issue Certificate', html, req.session.user, settings));
        });
    });
});

app.post('/staff/certificates/new', isAuthenticated, isAdminOrStaff, (req, res) => {
    const { resident_id, cert_type, purpose } = req.body;
    db.get(`SELECT * FROM residents WHERE resident_id = ?`, [resident_id], (err, resident) => {
        if (!resident) return res.redirect('/staff/certificates');
        const residentName = `${resident.first_name} ${resident.middle_name ? resident.middle_name + ' ' : ''}${resident.last_name} ${resident.suffix || ''}`;
        const certNumber = 'BC-' + Math.floor(100000 + Math.random() * 900000);
        const releaseDate = new Date().toISOString().split('T')[0];
        db.run(`INSERT INTO certificate_requests (cert_number, resident_id, resident_name, cert_type, purpose, status, release_date, authorized_official) VALUES (?, ?, ?, ?, ?, 'Released', ?, ?)`,
            [certNumber, resident_id, residentName, cert_type, purpose, releaseDate, req.session.user.full_name || 'Punong Barangay'], () => {
                logActivity(req.session.user.username, `Issued certificate: ${certNumber} (${cert_type})`);
                res.redirect('/staff/certificates');
            });
    });
});

// Update Certificate Status Form
app.get('/staff/certificates/status/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.get(`SELECT * FROM certificate_requests WHERE id = ?`, [req.params.id], (err, cert) => {
            const html = `
            <div class="max-w-md mx-auto px-4 py-8">
                <div class="bg-white rounded-xl shadow border p-8">
                    <h2 class="text-xl font-bold mb-4">Update Certificate Status</h2>
                    <form action="/staff/certificates/status/${cert.id}" method="POST" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Status</label>
                            <select name="status" class="w-full px-3 py-2 border rounded-lg">
                                <option value="Pending" ${cert.status === 'Pending' ? 'selected' : ''}>Pending</option>
                                <option value="Processing" ${cert.status === 'Processing' ? 'selected' : ''}>Processing</option>
                                <option value="Approved" ${cert.status === 'Approved' ? 'selected' : ''}>Approved</option>
                                <option value="Ready for Release" ${cert.status === 'Ready for Release' ? 'selected' : ''}>Ready for Release</option>
                                <option value="Released" ${cert.status === 'Released' ? 'selected' : ''}>Released</option>
                                <option value="Rejected" ${cert.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Remarks / Rejection Reason</label>
                            <textarea name="remarks" class="w-full px-3 py-2 border rounded-lg">${cert.remarks || ''}</textarea>
                        </div>
                        <div class="flex justify-end space-x-2">
                            <a href="/staff/certificates" class="px-4 py-2 border rounded-lg">Cancel</a>
                            <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold">Update Status</button>
                        </div>
                    </form>
                </div>
            </div>`;
            res.send(renderLayout('Update Status', html, req.session.user, settings));
        });
    });
});

app.post('/staff/certificates/status/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    const { status, remarks } = req.body;
    db.get(`SELECT * FROM certificate_requests WHERE id = ?`, [req.params.id], (err, cert) => {
        let certNumber = cert.cert_number;
        if (!certNumber && status === 'Released') {
            certNumber = 'BC-' + Math.floor(100000 + Math.random() * 900000);
        }
        db.run(`UPDATE certificate_requests SET status = ?, remarks = ?, cert_number = ? WHERE id = ?`, [status, remarks, certNumber, req.params.id], () => {
            addNotification(cert.resident_id, 'Certificate Update', `Your certificate request (${cert.cert_type}) status is now: ${status}`);
            res.redirect('/staff/certificates');
        });
    });
});

// Printable Certificate with QR Code Verification
app.get('/staff/certificates/print/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.get(`SELECT * FROM certificate_requests WHERE id = ?`, [req.params.id], (err, cert) => {
            if (!cert) return res.send('Certificate not found');
            const verifyUrl = `${req.protocol}://${req.get('host')}/verify/certificate/${cert.cert_number}`;
            const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>${cert.cert_type} - ${cert.cert_number}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                    @media print { body { print-color-adjust: exact; } }
                </style>
            </head>
            <body class="bg-slate-100 p-8 flex justify-center items-center min-h-screen">
                <div class="bg-white w-[800px] p-12 shadow-2xl rounded-xl border-8 border-double border-blue-900 relative">
                    <div class="text-center space-y-2 border-b-2 border-blue-900 pb-6">
                        <img src="${settings ? settings.logo_url : ''}" class="w-24 h-24 mx-auto rounded-full object-cover">
                        <p class="text-sm font-bold uppercase tracking-wider text-slate-600">Republic of the Philippines</p>
                        <p class="text-sm font-bold text-slate-600">${settings ? settings.municipality + ', ' + settings.province : ''}</p>
                        <h1 class="text-3xl font-extrabold text-blue-900 uppercase">${settings ? settings.barangay_name : 'Barangay'}</h1>
                        <h2 class="text-xl font-bold uppercase text-slate-800 mt-4 tracking-widest">${cert.cert_type}</h2>
                    </div>

                    <div class="my-10 text-justify text-slate-800 space-y-6 leading-relaxed">
                        <p class="font-bold text-lg">TO WHOM IT MAY CONCERN:</p>
                        <p class="indent-12 text-lg">This is to certify that <span class="font-bold uppercase underline">${cert.resident_name}</span>, whose signature and right thumbmark appear hereon, is a permanent resident of <span class="font-bold">${settings ? settings.address : 'Barangay'}</span> and is known to be of good moral character and law-abiding citizen.</p>
                        <p class="indent-12 text-lg">This certification is issued upon the request of the above-named person for <span class="font-bold uppercase">${cert.purpose || 'any legal purpose'}</span>.</p>
                        <p class="indent-12 text-lg">Given this <span class="font-bold">${cert.release_date || cert.created_at}</span> at ${settings ? settings.barangay_name : 'Barangay'}, ${settings ? settings.municipality : ''}.</p>
                    </div>

                    <div class="flex justify-between items-end mt-16 pt-8 border-t">
                        <div class="text-center">
                            <div class="border border-slate-400 p-2 bg-slate-50 inline-block mb-2">
                                <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(verifyUrl)}" alt="QR" class="w-24 h-24">
                            </div>
                            <p class="text-xs font-mono text-slate-500">Cert No: ${cert.cert_number}</p>
                        </div>
                        <div class="text-center">
                            <div class="h-12"></div>
                            <p class="font-bold uppercase border-t border-slate-800 px-8 pt-1">${cert.authorized_official || (settings ? settings.captain : 'Punong Barangay')}</p>
                            <p class="text-xs text-slate-500 uppercase">Punong Barangay</p>
                        </div>
                    </div>
                </div>
                <script>window.onload = function() { window.print(); }</script>
            </body>
            </html>`;
            res.send(html);
        });
    });
});

app.get('/staff/appointments', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM appointments ORDER BY id DESC`, (err, apps) => {
            const html = `
            <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
                <h2 class="text-2xl font-bold text-slate-800">Appointment Management</h2>
                <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-slate-100 text-slate-600 text-xs uppercase font-semibold">
                            <tr><th class="p-4">Resident</th><th class="p-4">Service</th><th class="p-4">Date & Time</th><th class="p-4">Status</th><th class="p-4 text-right">Actions</th></tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 text-sm">
                            ${apps.length > 0 ? apps.map(a => `
                                <tr class="hover:bg-slate-50">
                                    <td class="p-4 font-semibold">${a.resident_name}</td>
                                    <td class="p-4">${a.service}</td>
                                    <td class="p-4">${a.appointment_date} @ ${a.appointment_time}</td>
                                    <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ${a.status === 'Approved' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}">${a.status}</span></td>
                                    <td class="p-4 text-right space-x-2">
                                        <a href="/staff/appointments/status/${a.id}/Approved" class="text-green-600 font-semibold hover:underline">Approve</a>
                                        <a href="/staff/appointments/status/${a.id}/Cancelled" class="text-red-600 font-semibold hover:underline">Cancel</a>
                                    </td>
                                </tr>
                            `).join('') : '<tr><td colspan="5" class="p-8 text-center text-slate-400 italic">No appointments booked.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>`;
            res.send(renderLayout('Appointments', html, req.session.user, settings));
        });
    });
});

app.get('/staff/appointments/status/:id/:status', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.run(`UPDATE appointments SET status = ? WHERE id = ?`, [req.params.status, req.params.id], () => {
        res.redirect('/staff/appointments');
    });
});

app.get('/staff/blotter', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM blotters ORDER BY id DESC`, (err, blotters) => {
            const html = `
            <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
                <div class="flex justify-between items-center">
                    <h2 class="text-2xl font-bold text-slate-800">Blotter & Incident Records</h2>
                    <a href="/staff/blotter/new" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Record Incident</a>
                </div>
                <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-slate-100 text-slate-600 text-xs uppercase font-semibold">
                            <tr><th class="p-4">Case No.</th><th class="p-4">Complainant / Respondent</th><th class="p-4">Incident Date</th><th class="p-4">Status</th><th class="p-4 text-right">Action</th></tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 text-sm">
                            ${blotters.length > 0 ? blotters.map(b => `
                                <tr class="hover:bg-slate-50">
                                    <td class="p-4 font-mono font-bold text-blue-900">${b.case_number}</td>
                                    <td class="p-4">${b.complainant} vs ${b.respondent}</td>
                                    <td class="p-4">${b.incident_date}</td>
                                    <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">${b.status}</span></td>
                                    <td class="p-4 text-right"><a href="/staff/blotter/delete/${b.id}" onclick="return confirm('Delete record?');" class="text-red-600"><i class="fa-solid fa-trash"></i></a></td>
                                </tr>
                            `).join('') : '<tr><td colspan="5" class="p-8 text-center text-slate-400 italic">No blotter records found.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>`;
            res.send(renderLayout('Blotter', html, req.session.user, settings));
        });
    });
});

app.get('/staff/blotter/new', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        const html = `
        <div class="max-w-xl mx-auto px-4 py-8">
            <div class="bg-white rounded-xl shadow border p-8">
                <h2 class="text-xl font-bold mb-4">Record Incident / Blotter</h2>
                <form action="/staff/blotter/new" method="POST" class="space-y-4">
                    <div><label class="block text-sm font-medium mb-1">Complainant *</label><input type="text" name="complainant" required class="w-full px-3 py-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium mb-1">Respondent *</label><input type="text" name="respondent" required class="w-full px-3 py-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium mb-1">Incident Date *</label><input type="date" name="incident_date" required class="w-full px-3 py-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium mb-1">Description *</label><textarea name="description" required class="w-full px-3 py-2 border rounded-lg"></textarea></div>
                    <div class="flex justify-end space-x-2"><a href="/staff/blotter" class="px-4 py-2 border rounded-lg">Cancel</a><button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold">Save Record</button></div>
                </form>
            </div>
        </div>`;
        res.send(renderLayout('New Blotter', html, req.session.user, settings));
    });
});

app.post('/staff/blotter/new', isAuthenticated, isAdminOrStaff, (req, res) => {
    const { complainant, respondent, incident_date, description } = req.body;
    const caseNum = 'BLT-' + Math.floor(100000 + Math.random() * 900000);
    db.run(`INSERT INTO blotters (case_number, complainant, respondent, incident_date, description) VALUES (?, ?, ?, ?, ?)`, [caseNum, complainant, respondent, incident_date, description], () => {
        logActivity(req.session.user.username, `Recorded blotter case: ${caseNum}`);
        res.redirect('/staff/blotter');
    });
});

app.get('/staff/blotter/delete/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.run(`DELETE FROM blotters WHERE id = ?`, [req.params.id], () => { res.redirect('/staff/blotter'); });
});

app.get('/staff/assistance', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM assistance ORDER BY id DESC`, (err, ass) => {
            const html = `
            <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
                <h2 class="text-2xl font-bold text-slate-800">Assistance Requests</h2>
                <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-slate-100 text-slate-600 text-xs uppercase font-semibold">
                            <tr><th class="p-4">Resident</th><th class="p-4">Type</th><th class="p-4">Reason</th><th class="p-4">Status</th><th class="p-4 text-right">Action</th></tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 text-sm">
                            ${ass.length > 0 ? ass.map(a => `
                                <tr class="hover:bg-slate-50">
                                    <td class="p-4 font-semibold">${a.resident_name}</td>
                                    <td class="p-4">${a.assistance_type}</td>
                                    <td class="p-4">${a.reason}</td>
                                    <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">${a.status}</span></td>
                                    <td class="p-4 text-right"><a href="/staff/assistance/approve/${a.id}" class="text-green-600 font-semibold hover:underline">Approve</a></td>
                                </tr>
                            `).join('') : '<tr><td colspan="5" class="p-8 text-center text-slate-400 italic">No assistance requests found.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>`;
            res.send(renderLayout('Assistance', html, req.session.user, settings));
        });
    });
});

app.get('/staff/assistance/approve/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.run(`UPDATE assistance SET status = 'Approved' WHERE id = ?`, [req.params.id], () => { res.redirect('/staff/assistance'); });
});

app.get('/staff/businesses', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM businesses ORDER BY id DESC`, (err, biz) => {
            const html = `
            <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
                <div class="flex justify-between items-center"><h2 class="text-2xl font-bold text-slate-800">Business Registry</h2><a href="/staff/businesses/new" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Register Business</a></div>
                <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-slate-100 text-slate-600 text-xs uppercase font-semibold">
                            <tr><th class="p-4">Business Name</th><th class="p-4">Owner</th><th class="p-4">Type</th><th class="p-4">Permit Status</th><th class="p-4 text-right">Action</th></tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 text-sm">
                            ${biz.length > 0 ? biz.map(b => `
                                <tr class="hover:bg-slate-50"><td class="p-4 font-bold text-blue-900">${b.business_name}</td><td class="p-4">${b.owner_name}</td><td class="p-4">${b.business_type}</td><td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">${b.permit_status}</span></td><td class="p-4 text-right"><a href="/staff/businesses/delete/${b.id}" class="text-red-600"><i class="fa-solid fa-trash"></i></a></td></tr>
                            `).join('') : '<tr><td colspan="5" class="p-8 text-center text-slate-400 italic">No businesses registered.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>`;
            res.send(renderLayout('Businesses', html, req.session.user, settings));
        });
    });
});

app.get('/staff/businesses/new', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        const html = `
        <div class="max-w-xl mx-auto px-4 py-8">
            <div class="bg-white rounded-xl shadow border p-8">
                <h2 class="text-xl font-bold mb-4">Register Local Business</h2>
                <form action="/staff/businesses/new" method="POST" class="space-y-4">
                    <div><label class="block text-sm font-medium mb-1">Business Name *</label><input type="text" name="business_name" required class="w-full px-3 py-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium mb-1">Owner Name *</label><input type="text" name="owner_name" required class="w-full px-3 py-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium mb-1">Business Type *</label><input type="text" name="business_type" required class="w-full px-3 py-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium mb-1">Permit Number *</label><input type="text" name="permit_number" required class="w-full px-3 py-2 border rounded-lg"></div>
                    <div class="flex justify-end space-x-2"><a href="/staff/businesses" class="px-4 py-2 border rounded-lg">Cancel</a><button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold">Save Business</button></div>
                </form>
            </div>
        </div>`;
        res.send(renderLayout('New Business', html, req.session.user, settings));
    });
});

app.post('/staff/businesses/new', isAuthenticated, isAdminOrStaff, (req, res) => {
    const { business_name, owner_name, business_type, permit_number } = req.body;
    const bizId = 'BIZ-' + Math.floor(100000 + Math.random() * 900000);
    db.run(`INSERT INTO businesses (business_id, business_name, owner_name, business_type, permit_number) VALUES (?, ?, ?, ?, ?)`, [bizId, business_name, owner_name, business_type, permit_number], () => {
        res.redirect('/staff/businesses');
    });
});

app.get('/staff/businesses/delete/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.run(`DELETE FROM businesses WHERE id = ?`, [req.params.id], () => { res.redirect('/staff/businesses'); });
});

app.get('/staff/announcements', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM announcements ORDER BY id DESC`, (err, anns) => {
            const html = `
            <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
                <div class="flex justify-between items-center"><h2 class="text-2xl font-bold text-slate-800">Barangay Announcements</h2><a href="/staff/announcements/new" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Post Announcement</a></div>
                <div class="space-y-4">
                    ${anns.length > 0 ? anns.map(a => `
                        <div class="bg-white p-6 rounded-xl shadow-sm border"><h3 class="font-bold text-lg text-blue-900">${a.title}</h3><p class="text-xs text-slate-400 mt-0.5">${a.created_at}</p><p class="mt-3 text-slate-700">${a.content}</p></div>
                    `).join('') : '<p class="text-slate-400 italic">No announcements posted.</p>'}
                </div>
            </div>`;
            res.send(renderLayout('Announcements', html, req.session.user, settings));
        });
    });
});

app.get('/staff/announcements/new', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        const html = `
        <div class="max-w-xl mx-auto px-4 py-8">
            <div class="bg-white rounded-xl shadow border p-8">
                <h2 class="text-xl font-bold mb-4">Post Announcement</h2>
                <form action="/staff/announcements/new" method="POST" class="space-y-4">
                    <div><label class="block text-sm font-medium mb-1">Title *</label><input type="text" name="title" required class="w-full px-3 py-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium mb-1">Content *</label><textarea name="content" required class="w-full px-3 py-2 border rounded-lg"></textarea></div>
                    <div class="flex justify-end space-x-2"><a href="/staff/announcements" class="px-4 py-2 border rounded-lg">Cancel</a><button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold">Post</button></div>
                </form>
            </div>
        </div>`;
        res.send(renderLayout('New Announcement', html, req.session.user, settings));
    });
});

app.post('/staff/announcements/new', isAuthenticated, isAdminOrStaff, (req, res) => {
    const { title, content } = req.body;
    db.run(`INSERT INTO announcements (title, content, author) VALUES (?, ?, ?)`, [title, content, req.session.user.full_name], () => {
        logActivity(req.session.user.username, `Posted announcement: ${title}`);
        res.redirect('/staff/announcements');
    });
});

app.get('/staff/reports', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM residents WHERE status = 'Active'`, (err, residents) => {
            const html = `
            <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
                <div class="flex justify-between items-center"><h2 class="text-2xl font-bold text-slate-800">Barangay Reports & Export</h2><button onclick="window.print()" class="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-semibold"><i class="fa-solid fa-print"></i> Print Report</button></div>
                <div class="bg-white rounded-xl shadow-sm border p-6">
                    <h3 class="font-bold text-lg mb-4 text-blue-900">Master Resident Report</h3>
                    <table class="w-full text-left border-collapse text-sm">
                        <thead class="bg-slate-100 text-slate-600 text-xs uppercase"><tr><th class="p-3">ID</th><th class="p-3">Name</th><th class="p-3">Age</th><th class="p-3">Gender</th><th class="p-3">Purok</th></tr></thead>
                        <tbody class="divide-y">
                            ${residents.map(r => `<tr><td class="p-3 font-mono">${r.resident_id}</td><td class="p-3 font-semibold">${r.first_name} ${r.last_name}</td><td class="p-3">${r.age}</td><td class="p-3">${r.gender}</td><td class="p-3">${r.purok}</td></tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
            res.send(renderLayout('Reports', html, req.session.user, settings));
        });
    });
});

// Admin System Settings
app.get('/staff/settings', isAuthenticated, isAdmin, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        const html = `
        <div class="max-w-xl mx-auto px-4 py-8">
            <div class="bg-white rounded-xl shadow border p-8">
                <h2 class="text-xl font-bold mb-4">Barangay System Settings</h2>
                <form action="/staff/settings" method="POST" class="space-y-4">
                    <div><label class="block text-sm font-medium mb-1">Barangay Name</label><input type="text" name="barangay_name" value="${settings.barangay_name || ''}" class="w-full px-3 py-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium mb-1">Municipality / City</label><input type="text" name="municipality" value="${settings.municipality || ''}" class="w-full px-3 py-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium mb-1">Province</label><input type="text" name="province" value="${settings.province || ''}" class="w-full px-3 py-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium mb-1">Barangay Captain</label><input type="text" name="captain" value="${settings.captain || ''}" class="w-full px-3 py-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium mb-1">Barangay Logo URL</label><input type="text" name="logo_url" value="${settings.logo_url || ''}" class="w-full px-3 py-2 border rounded-lg"></div>
                    <div class="flex justify-end"><button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold">Save Settings</button></div>
                </form>
            </div>
        </div>`;
        res.send(renderLayout('Settings', html, req.session.user, settings));
    });
});

app.post('/staff/settings', isAuthenticated, isAdmin, (req, res) => {
    const { barangay_name, municipality, province, captain, logo_url } = req.body;
    db.run(`UPDATE settings SET barangay_name = ?, municipality = ?, province = ?, captain = ?, logo_url = ? WHERE id = 1`, [barangay_name, municipality, province, captain, logo_url], () => {
        logActivity(req.session.user.username, 'Updated barangay system settings');
        res.redirect('/staff/settings');
    });
});

app.get('/staff/users', isAuthenticated, isAdmin, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.all(`SELECT * FROM users`, (err, users) => {
            const html = `
            <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
                <h2 class="text-2xl font-bold text-slate-800">User Management</h2>
                <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-slate-100 text-slate-600 text-xs uppercase font-semibold"><tr><th class="p-4">Username</th><th class="p-4">Full Name</th><th class="p-4">Role</th><th class="p-4">Status</th></tr></thead>
                        <tbody class="divide-y text-sm">
                            ${users.map(u => `<tr><td class="p-4 font-bold text-blue-900">${u.username}</td><td class="p-4">${u.full_name}</td><td class="p-4"><span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">${u.role}</span></td><td class="p-4">${u.status}</td></tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
            res.send(renderLayout('Users', html, req.session.user, settings));
        });
    });
});

app.get('/resident/dashboard', isAuthenticated, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.get(`SELECT * FROM residents WHERE resident_id = ? OR email = ?`, [req.session.user.resident_id, req.session.user.email], (err, resident) => {
            db.all(`SELECT * FROM certificate_requests WHERE resident_id = ?`, [resident ? resident.resident_id : ''], (err, certs) => {
                db.all(`SELECT * FROM announcements ORDER BY id DESC LIMIT 3`, (err, anns) => {
                    db.all(`SELECT * FROM notifications WHERE recipient_username = ? ORDER BY id DESC`, [req.session.user.resident_id || req.session.user.email], (err, notifs) => {
                        
                        const residentNav = `
                        <div class="bg-blue-900 text-white">
                            <div class="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
                                <div class="flex items-center space-x-3">
                                    <h2 class="font-bold text-lg">Resident Portal</h2>
                                </div>
                                <div class="space-x-4 text-sm font-medium">
                                    <a href="/resident/dashboard" class="hover:underline">Dashboard</a>
                                    <a href="/resident/request-cert" class="hover:underline">Request Certificate</a>
                                    <a href="/resident/appointments" class="hover:underline">Appointments</a>
                                </div>
                            </div>
                        </div>`;

                        const html = `
                        ${residentNav}
                        <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
                            <div class="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl p-8 shadow-xl flex flex-col sm:flex-row justify-between items-center">
                                <div>
                                    <h2 class="text-3xl font-extrabold">Welcome, ${resident ? resident.first_name : req.session.user.full_name}!</h2>
                                    <p class="text-blue-100 mt-1">Resident ID: <span class="font-mono font-bold">${resident ? resident.resident_id : 'N/A'}</span></p>
                                </div>
                                <a href="/resident/request-cert" class="mt-4 sm:mt-0 bg-white text-blue-900 px-6 py-3 rounded-xl font-bold shadow hover:bg-blue-50 transition">Request Certificate</a>
                            </div>

                            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div class="bg-white p-6 rounded-xl shadow-sm border lg:col-span-2 space-y-4">
                                    <h3 class="font-bold text-lg text-slate-800">My Certificate Requests</h3>
                                    <div class="space-y-3">
                                        ${certs.length > 0 ? certs.map(c => `
                                            <div class="p-4 border rounded-lg flex justify-between items-center">
                                                <div>
                                                    <p class="font-bold text-blue-900">${c.cert_type}</p>
                                                    <p class="text-xs text-slate-500">Purpose: ${c.purpose}</p>
                                                    <p class="text-xs text-slate-400 mt-1">Date: ${c.created_at}</p>
                                                </div>
                                                <span class="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">${c.status}</span>
                                            </div>
                                        `).join('') : '<p class="text-slate-400 italic">No certificate requests submitted yet.</p>'}
                                    </div>
                                </div>
                                <div class="space-y-6">
                                    <div class="bg-white p-6 rounded-xl shadow-sm border">
                                        <h3 class="font-bold text-lg text-slate-800 mb-4">Announcements</h3>
                                        <div class="space-y-3">
                                            ${anns.length > 0 ? anns.map(a => `
                                                <div class="border-b pb-3"><h4 class="font-bold text-sm text-blue-900">${a.title}</h4><p class="text-xs text-slate-600 mt-1">${a.content}</p></div>
                                            `).join('') : '<p class="text-slate-400 text-xs italic">No announcements.</p>'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>`;
                        res.send(renderLayout('Resident Dashboard', html, req.session.user, settings));
                    });
                });
            });
        });
    });
});

app.get('/resident/request-cert', isAuthenticated, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.get(`SELECT * FROM residents WHERE resident_id = ? OR email = ?`, [req.session.user.resident_id, req.session.user.email], (err, resident) => {
            const html = `
            <div class="max-w-xl mx-auto px-4 py-8">
                <div class="bg-white rounded-xl shadow border p-8">
                    <h2 class="text-xl font-bold mb-4">Request Barangay Certificate</h2>
                    <form action="/resident/request-cert" method="POST" class="space-y-4">
                        <div><label class="block text-sm font-medium mb-1">Certificate Type *</label>
                            <select name="cert_type" class="w-full px-3 py-2 border rounded-lg">
                                <option value="Barangay Clearance">Barangay Clearance</option>
                                <option value="Certificate of Residency">Certificate of Residency</option>
                                <option value="Certificate of Indigency">Certificate of Indigency</option>
                                <option value="Certificate of Good Moral">Certificate of Good Moral</option>
                            </select>
                        </div>
                        <div><label class="block text-sm font-medium mb-1">Purpose *</label><input type="text" name="purpose" required class="w-full px-3 py-2 border rounded-lg" placeholder="Employment, Scholarship, etc."></div>
                        <div class="flex justify-end space-x-2"><a href="/resident/dashboard" class="px-4 py-2 border rounded-lg">Cancel</a><button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold">Submit Request</button></div>
                    </form>
                </div>
            </div>`;
            res.send(renderLayout('Request Certificate', html, req.session.user, settings));
        });
    });
});

app.post('/resident/request-cert', isAuthenticated, (req, res) => {
    const { cert_type, purpose } = req.body;
    db.get(`SELECT * FROM residents WHERE resident_id = ? OR email = ?`, [req.session.user.resident_id, req.session.user.email], (err, resident) => {
        if (!resident) return res.redirect('/resident/dashboard');
        const residentName = `${resident.first_name} ${resident.last_name}`;
        db.run(`INSERT INTO certificate_requests (resident_id, resident_name, cert_type, purpose, status) VALUES (?, ?, ?, ?, 'Pending')`,
            [resident.resident_id, residentName, cert_type, purpose], () => {
                res.redirect('/resident/dashboard');
            });
    });
});

app.get('/resident/appointments', isAuthenticated, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        db.get(`SELECT * FROM residents WHERE resident_id = ? OR email = ?`, [req.session.user.resident_id, req.session.user.email], (err, resident) => {
            db.all(`SELECT * FROM appointments WHERE resident_id = ?`, [resident ? resident.resident_id : ''], (err, apps) => {
                const html = `
                <div class="max-w-4xl mx-auto px-4 py-8 space-y-6">
                    <div class="flex justify-between items-center"><h2 class="text-2xl font-bold">My Appointments</h2><a href="/resident/appointments/new" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Book Appointment</a></div>
                    <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
                        <table class="w-full text-left border-collapse text-sm">
                            <thead class="bg-slate-100 text-slate-600 uppercase text-xs"><tr><th class="p-4">Service</th><th class="p-4">Date & Time</th><th class="p-4">Status</th></tr></thead>
                            <tbody class="divide-y">
                                ${apps.length > 0 ? apps.map(a => `<tr><td class="p-4 font-semibold">${a.service}</td><td class="p-4">${a.appointment_date} @ ${a.appointment_time}</td><td class="p-4"><span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-semibold">${a.status}</span></td></tr>`).join('') : '<tr><td colspan="3" class="p-8 text-center text-slate-400 italic">No appointments booked.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>`;
                res.send(renderLayout('Appointments', html, req.session.user, settings));
            });
        });
    });
});

app.get('/resident/appointments/new', isAuthenticated, (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, settings) => {
        const html = `
        <div class="max-w-xl mx-auto px-4 py-8">
            <div class="bg-white rounded-xl shadow border p-8">
                <h2 class="text-xl font-bold mb-4">Book Appointment</h2>
                <form action="/resident/appointments/new" method="POST" class="space-y-4">
                    <div><label class="block text-sm font-medium mb-1">Service *</label><input type="text" name="service" required placeholder="Consultation with Captain, ID Renewal" class="w-full px-3 py-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium mb-1">Date *</label><input type="date" name="appointment_date" required class="w-full px-3 py-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium mb-1">Time *</label><input type="time" name="appointment_time" required class="w-full px-3 py-2 border rounded-lg"></div>
                    <div class="flex justify-end space-x-2"><a href="/resident/appointments" class="px-4 py-2 border rounded-lg">Cancel</a><button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold">Book</button></div>
                </form>
            </div>
        </div>`;
        res.send(renderLayout('Book Appointment', html, req.session.user, settings));
    });
});

app.post('/resident/appointments/new', isAuthenticated, (req, res) => {
    const { service, appointment_date, appointment_time } = req.body;
    db.get(`SELECT * FROM residents WHERE resident_id = ? OR email = ?`, [req.session.user.resident_id, req.session.user.email], (err, resident) => {
        if (!resident) return res.redirect('/resident/dashboard');
        db.run(`INSERT INTO appointments (resident_id, resident_name, service, appointment_date, appointment_time) VALUES (?, ?, ?, ?, ?)`,
            [resident.resident_id, `${resident.first_name} ${resident.last_name}`, service, appointment_date, appointment_time], () => {
                res.redirect('/resident/appointments');
            });
    });
});

// Root Redirect
app.get('/', (req, res) => {
    res.redirect('/login');
});

app.listen(PORT, () => {
    console.log(`Barangay Management System server is running on port ${PORT}`);
});
