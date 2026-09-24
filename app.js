/**
 * Barangay Resident Management System - Single File Application
 * Node.js + Express + SQLite + Embedded Vanilla JS / Tailwind CSS Frontend
 */

const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory exists for SQLite
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbFile = path.join(dataDir, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initDatabase();
    }
});

// Configure Multer for in-memory file uploads (stored as base64 in DB for simplicity & portability)
const upload = multer({
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Middleware setup
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'brgy-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Helper function for logging activities
function logActivity(db, userId, userRole, action, details) {
    const stmt = db.prepare(`INSERT INTO activity_logs (user_id, user_role, action, details, timestamp) VALUES (?, ?, ?, ?, datetime('now', 'localtime'))`);
    stmt.run(userId || 'System', userRole || 'System', action, details);
    stmt.finalize();
}

// Initialize Database Tables
function initDatabase() {
    db.serialize(() => {
        // Settings table for Barangay customization
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            barangay_name TEXT DEFAULT 'Barangay San Isidro',
            municipality TEXT DEFAULT 'Municipality of Sample',
            province TEXT DEFAULT 'Province of Laguna',
            captain TEXT DEFAULT 'Hon. Juan Dela Cruz',
            contact_number TEXT DEFAULT '09123456789',
            email TEXT DEFAULT 'brgy.sanisidro@example.com',
            address TEXT DEFAULT 'Poblacion, San Isidro',
            primary_color TEXT DEFAULT '#1e40af',
            secondary_color TEXT DEFAULT '#3b82f6',
            id_validity_years TEXT DEFAULT '2',
            logo_base64 TEXT DEFAULT ''
        )`);

        // Users table (Staff / Admins)
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT CHECK(role IN ('Super Admin', 'Barangay Admin', 'Barangay Staff')) NOT NULL,
            email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Puroks table
        db.run(`CREATE TABLE IF NOT EXISTS puroks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT
        )`);

        // Households table
        db.run(`CREATE TABLE IF NOT EXISTS households (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            household_number TEXT UNIQUE NOT NULL,
            head_name TEXT NOT NULL,
            address TEXT NOT NULL,
            purok TEXT NOT NULL
        )`);

        // Residents table
        db.run(`CREATE TABLE IF NOT EXISTS residents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id TEXT UNIQUE,
            first_name TEXT NOT NULL,
            middle_name TEXT,
            last_name TEXT NOT NULL,
            suffix TEXT,
            dob TEXT NOT NULL,
            gender TEXT NOT NULL,
            civil_status TEXT NOT NULL,
            address TEXT NOT NULL,
            purok TEXT NOT NULL,
            contact_number TEXT,
            email TEXT,
            occupation TEXT,
            educational_attainment TEXT,
            nationality TEXT DEFAULT 'Filipino',
            voter_status TEXT DEFAULT 'No',
            pwd_status TEXT DEFAULT 'No',
            senior_citizen_status TEXT DEFAULT 'No',
            solo_parent_status TEXT DEFAULT 'No',
            four_ps_status TEXT DEFAULT 'No',
            household_number TEXT,
            password TEXT,
            photo TEXT,
            status TEXT CHECK(status IN ('Pending', 'Active', 'Inactive', 'Moved Out', 'Deceased', 'Archived', 'Rejected')) DEFAULT 'Pending',
            registration_date DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Profile update requests table
        db.run(`CREATE TABLE IF NOT EXISTS profile_updates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id TEXT NOT NULL,
            update_data TEXT NOT NULL,
            status TEXT DEFAULT 'Pending',
            requested_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Certificates table
        db.run(`CREATE TABLE IF NOT EXISTS certificates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cert_number TEXT UNIQUE,
            resident_id TEXT NOT NULL,
            cert_type TEXT NOT NULL,
            purpose TEXT,
            status TEXT CHECK(status IN ('Pending', 'Processing', 'Approved', 'Ready for Release', 'Released', 'Rejected')) DEFAULT 'Pending',
            remarks TEXT,
            release_date TEXT,
            requested_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Blotter cases table
        db.run(`CREATE TABLE IF NOT EXISTS blotters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_number TEXT UNIQUE,
            complainant TEXT NOT NULL,
            respondent TEXT NOT NULL,
            witness TEXT,
            incident_date TEXT NOT NULL,
            incident_time TEXT NOT NULL,
            location TEXT NOT NULL,
            incident_type TEXT NOT NULL,
            description TEXT NOT NULL,
            action_taken TEXT,
            settlement TEXT,
            status TEXT CHECK(status IN ('Open', 'Under Investigation', 'Settled', 'Referred', 'Closed')) DEFAULT 'Open',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Appointments table
        db.run(`CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id TEXT NOT NULL,
            service_type TEXT NOT NULL,
            appointment_date TEXT NOT NULL,
            appointment_time TEXT NOT NULL,
            purpose TEXT,
            status TEXT CHECK(status IN ('Pending', 'Approved', 'Rescheduled', 'Cancelled', 'Completed')) DEFAULT 'Pending',
            remarks TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Assistance requests table
        db.run(`CREATE TABLE IF NOT EXISTS assistance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id TEXT NOT NULL,
            assistance_type TEXT NOT NULL,
            reason TEXT NOT NULL,
            status TEXT CHECK(status IN ('Pending', 'Approved', 'Rejected', 'Released')) DEFAULT 'Pending',
            remarks TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Businesses table
        db.run(`CREATE TABLE IF NOT EXISTS businesses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            business_name TEXT NOT NULL,
            owner_name TEXT NOT NULL,
            address TEXT NOT NULL,
            business_type TEXT NOT NULL,
            contact_number TEXT,
            permit_number TEXT UNIQUE,
            permit_status TEXT CHECK(status IN ('Active', 'Pending Renewal', 'Expired', 'Revoked')) DEFAULT 'Active',
            expiration_date TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Announcements table
        db.run(`CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            content TEXT NOT NULL,
            date_posted TEXT DEFAULT CURRENT_TIMESTAMP
        )`);

        // Complaints table
        db.run(`CREATE TABLE IF NOT EXISTS complaints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id TEXT NOT NULL,
            subject TEXT NOT NULL,
            details TEXT NOT NULL,
            status TEXT CHECK(status IN ('Pending', 'Reviewing', 'Resolved', 'Dismissed')) DEFAULT 'Pending',
            remarks TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Activity Logs table
        db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            user_role TEXT,
            action TEXT NOT NULL,
            details TEXT,
            timestamp TEXT NOT NULL
        )`);

        // Seed default settings if empty
        db.get(`SELECT COUNT(*) as count FROM settings`, (err, row) => {
            if (row && row.count === 0) {
                db.run(`INSERT INTO settings (barangay_name, municipality, province, captain, contact_number, email, address) VALUES ('Barangay San Isidro', 'Municipality of Sample', 'Province of Laguna', 'Hon. Juan Dela Cruz', '09123456789', 'brgy.sanisidro@example.com', 'Poblacion, San Isidro')`);
            }
        });

        // Seed default super admin if empty
        db.get(`SELECT COUNT(*) as count FROM users`, (err, row) => {
            if (row && row.count === 0) {
                const hashedPass = bcrypt.hashSync('password123', 10);
                db.run(`INSERT INTO users (username, password, full_name, role, email) VALUES ('admin', ?, 'Super Administrator', 'Super Admin', 'admin@brgy.gov.ph')`, [hashedPass], () => {
                    console.log('Default super admin account created (username: admin, password: password123)');
                });
            }
        });

        // Seed default puroks if empty
        db.get(`SELECT COUNT(*) as count FROM puroks`, (err, row) => {
            if (row && row.count === 0) {
                const defaultPuroks = ['Purok 1 - Centro', 'Purok 2 - Riverside', 'Purok 3 - Hillside', 'Purok 4 - Lakeside'];
                const stmt = db.prepare(`INSERT INTO puroks (name, description) VALUES (?, ?)`);
                defaultPuroks.forEach(p => stmt.run(p, 'Standard barangay purok'));
                stmt.finalize();
            }
        });
    });
}

// Authentication Middleware
function requireStaff(req, res, next) {
    if (req.session && req.session.user && ['Super Admin', 'Barangay Admin', 'Barangay Staff'].includes(req.session.user.role)) {
        return next();
    }
    if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(401).json({ error: 'Unauthorized. Please login as staff.' });
    }
    res.redirect('/login');
}

function requireSuperAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'Super Admin') {
        return next();
    }
    if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(403).json({ error: 'Forbidden. Super Admin access required.' });
    }
    res.redirect('/staff');
}

function requireResident(req, res, next) {
    if (req.session && req.session.resident) {
        return next();
    }
    if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(401).json({ error: 'Unauthorized. Please login as resident.' });
    }
    res.redirect('/login');
}

// ==================== API ROUTES ====================

// Settings API
app.get('/api/settings', (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
    });
});

app.post('/api/settings', requireStaff, (req, res) => {
    const { barangay_name, municipality, province, captain, contact_number, email, address, primary_color, secondary_color, id_validity_years, logo_base64 } = req.body;
    db.run(`UPDATE settings SET barangay_name = ?, municipality = ?, province = ?, captain = ?, contact_number = ?, email = ?, address = ?, primary_color = ?, secondary_color = ?, id_validity_years = ?, logo_base64 = COALESCE(NULLIF(?, ''), logo_base64) WHERE id = 1`,
        [barangay_name, municipality, province, captain, contact_number, email, address, primary_color, secondary_color, id_validity_years, logo_base64],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logActivity(db, req.session.user.username, req.session.user.role, 'Update Settings', 'Updated barangay configuration settings.');
            res.json({ success: true, message: 'Settings updated successfully' });
        }
    );
});

// Authentication Routes
app.post('/api/login/staff', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(400).json({ error: 'Invalid username or password' });
        }
        req.session.user = { id: user.id, username: user.username, full_name: user.full_name, role: user.role };
        logActivity(db, user.username, user.role, 'Staff Login', `Staff ${user.username} logged in.`);
        res.json({ success: true, role: user.role });
    });
});

app.post('/api/login/resident', (req, res) => {
    const { resident_id, password } = req.body;
    db.get(`SELECT * FROM residents WHERE resident_id = ?`, [resident_id], (err, resident) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!resident || resident.status !== 'Active' || !bcrypt.compareSync(password, resident.password)) {
            return res.status(400).json({ error: 'Invalid Resident ID, password, or account not yet active/approved' });
        }
        req.session.resident = { id: resident.id, resident_id: resident.resident_id, full_name: `${resident.first_name} ${resident.last_name}` };
        logActivity(db, resident.resident_id, 'Resident', 'Resident Login', `Resident ${resident.resident_id} logged in.`);
        res.json({ success: true });
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

app.get('/api/session', (req, res) => {
    if (req.session.user) {
        res.json({ type: 'staff', user: req.session.user });
    } else if (req.session.resident) {
        res.json({ type: 'resident', resident: req.session.resident });
    } else {
        res.json({ type: null });
    }
});

// Public Resident Registration
app.post('/api/register', upload.single('photo'), (req, res) => {
    const data = req.body;
    const photoBase64 = req.file ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}` : '';
    const hashedPassword = bcrypt.hashSync(data.password || 'default123', 10);

    const query = `INSERT INTO residents (first_name, middle_name, last_name, suffix, dob, gender, civil_status, address, purok, contact_number, email, occupation, educational_attainment, nationality, voter_status, pwd_status, senior_citizen_status, solo_parent_status, four_ps_status, household_number, password, photo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`;
    
    db.run(query, [
        data.first_name, data.middle_name, data.last_name, data.suffix, data.dob, data.gender, data.civil_status,
        data.address, data.purok, data.contact_number, data.email, data.occupation, data.educational_attainment,
        data.nationality || 'Filipino', data.voter_status || 'No', data.pwd_status || 'No', data.senior_citizen_status || 'No',
        data.solo_parent_status || 'No', data.four_ps_status || 'No', data.household_number, hashedPassword, photoBase64
    ], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(db, 'Public', 'Guest', 'Resident Registration', `New registration submitted for ${data.first_name} ${data.last_name}`);
        res.json({ success: true, message: 'Registration submitted successfully. Pending staff review.' });
    });
});

// ==================== STAFF PORTAL APIs ====================

// Dashboard Statistics
app.get('/api/staff/stats', requireStaff, (req, res) => {
    const stats = {};
    db.serialize(() => {
        db.get(`SELECT COUNT(*) as count FROM residents WHERE status = 'Active'`, (err, row) => { stats.total_residents = row.count; });
        db.get(`SELECT COUNT(*) as count FROM households`, (err, row) => { stats.total_households = row.count; });
        db.get(`SELECT COUNT(*) as count FROM residents WHERE status = 'Active' AND gender = 'Male'`, (err, row) => { stats.male = row.count; });
        db.get(`SELECT COUNT(*) as count FROM residents WHERE status = 'Active' AND gender = 'Female'`, (err, row) => { stats.female = row.count; });
        db.get(`SELECT COUNT(*) as count FROM residents WHERE status = 'Active' AND (strftime('%Y', 'now') - strftime('%Y', dob)) < 18`, (err, row) => { stats.minors = row.count; });
        db.get(`SELECT COUNT(*) as count FROM residents WHERE status = 'Active' AND (strftime('%Y', 'now') - strftime('%Y', dob)) >= 18`, (err, row) => { stats.adults = row.count; });
        db.get(`SELECT COUNT(*) as count FROM residents WHERE status = 'Active' AND senior_citizen_status = 'Yes'`, (err, row) => { stats.senior_citizens = row.count; });
        db.get(`SELECT COUNT(*) as count FROM residents WHERE status = 'Active' AND pwd_status = 'Yes'`, (err, row) => { stats.pwd = row.count; });
        db.get(`SELECT COUNT(*) as count FROM residents WHERE status = 'Active' AND solo_parent_status = 'Yes'`, (err, row) => { stats.solo_parents = row.count; });
        db.get(`SELECT COUNT(*) as count FROM residents WHERE status = 'Active' AND voter_status = 'Yes'`, (err, row) => { stats.voters = row.count; });
        db.get(`SELECT COUNT(*) as count FROM residents WHERE status = 'Pending'`, (err, row) => { stats.pending_registrations = row.count; });
        db.get(`SELECT COUNT(*) as count FROM certificates WHERE status = 'Pending'`, (err, row) => { stats.pending_certificates = row.count; });
        db.get(`SELECT COUNT(*) as count FROM appointments WHERE status = 'Pending'`, (err, row) => { stats.pending_appointments = row.count; });
        db.get(`SELECT COUNT(*) as count FROM profile_updates WHERE status = 'Pending'`, (err, row), () => {
            db.get(`SELECT COUNT(*) as count FROM profile_updates WHERE status = 'Pending'`, (err2, row2) => {
                stats.pending_requests = (row ? row.count : 0) + (row2 ? row2.count : 0);
                res.json(stats);
            });
        });
    });
});

// Resident CRUD & Management
app.get('/api/staff/residents', requireStaff, (req, res) => {
    const { status = 'Active', search = '', purok = '' } = req.query;
    let query = `SELECT * FROM residents WHERE 1=1`;
    let params = [];

    if (status === 'Archived') {
        query += ` AND status IN ('Archived', 'Inactive', 'Moved Out', 'Deceased')`;
    } else if (status) {
        query += ` AND status = ?`;
        params.push(status);
    }

    if (search) {
        query += ` AND (first_name LIKE ? OR last_name LIKE ? OR resident_id LIKE ? OR household_number LIKE ?)`;
        const s = `%${search}%`;
        params.push(s, s, s, s);
    }

    if (purok) {
        query += ` AND purok = ?`;
        params.push(purok);
    }

    query += ` ORDER BY last_name ASC`;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/staff/residents/approve', requireStaff, (req, res) => {
    const { id } = req.body;
    // Generate unique resident ID e.g., BRGY-2026-000001
    const year = new Date().getFullYear();
    db.get(`SELECT COUNT(*) as count FROM residents WHERE resident_id IS NOT NULL`, (err, row) => {
        const seq = String((row?.count || 0) + 1).padStart(6, '0');
        const resident_id = `BRGY-${year}-${seq}`;

        db.run(`UPDATE residents SET status = 'Active', resident_id = ? WHERE id = ?`, [resident_id, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logActivity(db, req.session.user.username, req.session.user.role, 'Approve Resident', `Approved resident registration with ID ${resident_id}`);
            res.json({ success: true, resident_id });
        });
    });
});

app.post('/api/staff/residents/reject', requireStaff, (req, res) => {
    const { id } = req.body;
    db.run(`UPDATE residents SET status = 'Rejected' WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(db, req.session.user.username, req.session.user.role, 'Reject Resident', `Rejected resident ID ${id}`);
        res.json({ success: true });
    });
});

app.post('/api/staff/residents/status', requireStaff, (req, res) => {
    const { id, status } = req.body;
    db.run(`UPDATE residents SET status = ? WHERE id = ?`, [status, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(db, req.session.user.username, req.session.user.role, 'Update Resident Status', `Updated resident ${id} status to ${status}`);
        res.json({ success: true });
    });
});

app.put('/api/staff/residents/:id', requireStaff, upload.single('photo'), (req, res) => {
    const id = req.params.id;
    const data = req.body;
    const photoClause = req.file ? `, photo = 'data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}'` : '';

    const query = `UPDATE residents SET first_name = ?, middle_name = ?, last_name = ?, suffix = ?, dob = ?, gender = ?, civil_status = ?, address = ?, purok = ?, contact_number = ?, email = ?, occupation = ?, educational_attainment = ?, nationality = ?, voter_status = ?, pwd_status = ?, senior_citizen_status = ?, solo_parent_status = ?, four_ps_status = ?, household_number = ? ${photoClause} WHERE id = ?`;

    db.run(query, [
        data.first_name, data.middle_name, data.last_name, data.suffix, data.dob, data.gender, data.civil_status,
        data.address, data.purok, data.contact_number, data.email, data.occupation, data.educational_attainment,
        data.nationality, data.voter_status, data.pwd_status, data.senior_citizen_status, data.solo_parent_status,
        data.four_ps_status, data.household_number, id
    ], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(db, req.session.user.username, req.session.user.role, 'Edit Resident', `Updated resident record ID ${id}`);
        res.json({ success: true });
    });
});

// Household Management
app.get('/api/staff/households', requireStaff, (req, res) => {
    db.all(`SELECT * FROM households ORDER BY household_number ASC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/staff/households', requireStaff, (req, res) => {
    const { household_number, head_name, address, purok } = req.body;
    db.run(`INSERT INTO households (household_number, head_name, address, purok) VALUES (?, ?, ?, ?)`,
        [household_number, head_name, address, purok], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logActivity(db, req.session.user.username, req.session.user.role, 'Create Household', `Created household ${household_number}`);
            res.json({ success: true });
        }
    );
});

// Purok Management
app.get('/api/staff/puroks', requireStaff, (req, res) => {
    db.all(`SELECT p.*, (SELECT COUNT(*) FROM residents r WHERE r.purok = p.name AND r.status = 'Active') as resident_count, (SELECT COUNT(*) FROM households h WHERE h.purok = p.name) as household_count FROM puroks p`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/staff/puroks', requireStaff, (req, res) => {
    const { name, description } = req.body;
    db.run(`INSERT INTO puroks (name, description) VALUES (?, ?)`, [name, description], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(db, req.session.user.username, req.session.user.role, 'Add Purok', `Added purok ${name}`);
        res.json({ success: true });
    });
});

app.delete('/api/staff/puroks/:id', requireStaff, (req, res) => {
    const id = req.params.id;
    db.get(`SELECT name FROM puroks WHERE id = ?`, [id], (err, purok) => {
        if (!purok) return res.status(404).json({ error: 'Purok not found' });
        db.get(`SELECT COUNT(*) as count FROM residents WHERE purok = ?`, [purok.name], (err, row) => {
            if (row.count > 0) return res.status(400).json({ error: 'Cannot delete purok with assigned residents.' });
            db.run(`DELETE FROM puroks WHERE id = ?`, [id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
        });
    });
});

// Certificate Management
app.get('/api/staff/certificates', requireStaff, (req, res) => {
    db.all(`SELECT c.*, r.first_name, r.last_name, r.resident_id as res_id FROM certificates c JOIN residents r ON c.resident_id = r.resident_id ORDER BY c.id DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/staff/certificates', requireStaff, (req, res) => {
    const { resident_id, cert_type, purpose, release_date } = req.body;
    const year = new Date().getFullYear();
    db.get(`SELECT COUNT(*) as count FROM certificates`, (err, row) => {
        const cert_number = `CERT-${year}-${String((row?.count || 0) + 1).padStart(6, '0')}`;
        db.run(`INSERT INTO certificates (cert_number, resident_id, cert_type, purpose, status, release_date) VALUES (?, ?, ?, ?, 'Pending', ?)`,
            [cert_number, resident_id, cert_type, purpose, release_date], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, cert_number });
            }
        );
    });
});

app.put('/api/staff/certificates/:id', requireStaff, (req, res) => {
    const id = req.params.id;
    const { status, remarks, release_date } = req.body;
    db.run(`UPDATE certificates SET status = ?, remarks = ?, release_date = ? WHERE id = ?`,
        [status, remarks, release_date, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// Blotter Management
app.get('/api/staff/blotters', requireStaff, (req, res) => {
    db.all(`SELECT * FROM blotters ORDER BY id DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/staff/blotters', requireStaff, (req, res) => {
    const data = req.body;
    const year = new Date().getFullYear();
    db.get(`SELECT COUNT(*) as count FROM blotters`, (err, row) => {
        const case_number = `BLOT-${year}-${String((row?.count || 0) + 1).padStart(4, '0')}`;
        db.run(`INSERT INTO blotters (case_number, complainant, respondent, witness, incident_date, incident_time, location, incident_type, description, action_taken, settlement, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [case_number, data.complainant, data.respondent, data.witness, data.incident_date, data.incident_time, data.location, data.incident_type, data.description, data.action_taken, data.settlement, data.status || 'Open'],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, case_number });
            }
        );
    });
});

app.put('/api/staff/blotters/:id', requireStaff, (req, res) => {
    const id = req.params.id;
    const data = req.body;
    db.run(`UPDATE blotters SET complainant = ?, respondent = ?, witness = ?, incident_date = ?, incident_time = ?, location = ?, incident_type = ?, description = ?, action_taken = ?, settlement = ?, status = ? WHERE id = ?`,
        [data.complainant, data.respondent, data.witness, data.incident_date, data.incident_time, data.location, data.incident_type, data.description, data.action_taken, data.settlement, data.status, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// Appointment Management
app.get('/api/staff/appointments', requireStaff, (req, res) => {
    db.all(`SELECT a.*, r.first_name, r.last_name FROM appointments a JOIN residents r ON a.resident_id = r.resident_id ORDER BY a.id DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.put('/api/staff/appointments/:id', requireStaff, (req, res) => {
    const id = req.params.id;
    const { status, remarks } = req.body;
    db.run(`UPDATE appointments SET status = ?, remarks = ? WHERE id = ?`, [status, remarks, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Assistance Management
app.get('/api/staff/assistance', requireStaff, (req, res) => {
    db.all(`SELECT a.*, r.first_name, r.last_name FROM assistance a JOIN residents r ON a.resident_id = r.resident_id ORDER BY a.id DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.put('/api/staff/assistance/:id', requireStaff, (req, res) => {
    const id = req.params.id;
    const { status, remarks } = req.body;
    db.run(`UPDATE assistance SET status = ?, remarks = ? WHERE id = ?`, [status, remarks, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Business Management
app.get('/api/staff/businesses', requireStaff, (req, res) => {
    db.all(`SELECT * FROM businesses ORDER BY id DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/staff/businesses', requireStaff, (req, res) => {
    const data = req.body;
    db.run(`INSERT INTO businesses (business_name, owner_name, address, business_type, contact_number, permit_number, permit_status, expiration_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.business_name, data.owner_name, data.address, data.business_type, data.contact_number, data.permit_number, data.permit_status || 'Active', data.expiration_date],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// Announcements
app.get('/api/staff/announcements', requireStaff, (req, res) => {
    db.all(`SELECT * FROM announcements ORDER BY id DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/staff/announcements', requireStaff, (req, res) => {
    const { title, category, content } = req.body;
    db.run(`INSERT INTO announcements (title, category, content) VALUES (?, ?, ?)`, [title, category, content], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/staff/announcements/:id', requireStaff, (req, res) => {
    db.run(`DELETE FROM announcements WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Resident Complaints
app.get('/api/staff/complaints', requireStaff, (req, res) => {
    db.all(`SELECT c.*, r.first_name, r.last_name FROM complaints c JOIN residents r ON c.resident_id = r.resident_id ORDER BY c.id DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.put('/api/staff/complaints/:id', requireStaff, (req, res) => {
    const { status, remarks } = req.body;
    db.run(`UPDATE complaints SET status = ?, remarks = ? WHERE id = ?`, [status, remarks, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// User Management (Super Admin only)
app.get('/api/staff/users', requireSuperAdmin, (req, res) => {
    db.all(`SELECT id, username, full_name, role, email, created_at FROM users`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/staff/users', requireSuperAdmin, (req, res) => {
    const { username, password, full_name, role, email } = req.body;
    const hashed = bcrypt.hashSync(password, 10);
    db.run(`INSERT INTO users (username, password, full_name, role, email) VALUES (?, ?, ?, ?, ?)`,
        [username, hashed, full_name, role, email], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.delete('/api/staff/users/:id', requireSuperAdmin, (req, res) => {
    db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Activity Logs
app.get('/api/staff/logs', requireStaff, (req, res) => {
    db.all(`SELECT * FROM activity_logs ORDER BY id DESC LIMIT 100`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Profile update requests approval
app.get('/api/staff/profile-updates', requireStaff, (req, res) => {
    db.all(`SELECT p.*, r.first_name, r.last_name FROM profile_updates p JOIN residents r ON p.resident_id = r.resident_id WHERE p.status = 'Pending'`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/staff/profile-updates/approve', requireStaff, (req, res) => {
    const { id } = req.body;
    db.get(`SELECT * FROM profile_updates WHERE id = ?`, [id], (err, reqRow) => {
        if (!reqRow) return res.status(404).json({ error: 'Request not found' });
        const updateData = JSON.parse(reqRow.update_data);
        
        let fields = [];
        let values = [];
        for (const [key, val] of Object.entries(updateData)) {
            fields.push(`${key} = ?`);
            values.push(val);
        }
        values.push(reqRow.resident_id);

        db.run(`UPDATE residents SET ${fields.join(', ')} WHERE resident_id = ?`, values, function(err) {
            if (err) return res.status(500).json({ error: err.message });
            db.run(`UPDATE profile_updates SET status = 'Approved' WHERE id = ?`, [id], () => {
                res.json({ success: true });
            });
        });
    });
});

// ==================== RESIDENT PORTAL APIs ====================

app.get('/api/resident/profile', requireResident, (req, res) => {
    db.get(`SELECT * FROM residents WHERE resident_id = ?`, [req.session.resident.resident_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) delete row.password;
        res.json(row || {});
    });
});

app.post('/api/resident/profile-update-request', requireResident, (req, res) => {
    const updateData = JSON.stringify(req.body);
    db.run(`INSERT INTO profile_updates (resident_id, update_data, status) VALUES (?, ?, 'Pending')`,
        [req.session.resident.resident_id, updateData], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.get('/api/resident/certificates', requireResident, (req, res) => {
    db.all(`SELECT * FROM certificates WHERE resident_id = ? ORDER BY id DESC`, [req.session.resident.resident_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/resident/certificates', requireResident, (req, res) => {
    const { cert_type, purpose } = req.body;
    const year = new Date().getFullYear();
    db.get(`SELECT COUNT(*) as count FROM certificates`, (err, row) => {
        const cert_number = `CERT-${year}-${String((row?.count || 0) + 1).padStart(6, '0')}`;
        db.run(`INSERT INTO certificates (cert_number, resident_id, cert_type, purpose, status) VALUES (?, ?, ?, ?, 'Pending')`,
            [cert_number, req.session.resident.resident_id, cert_type, purpose], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    });
});

app.get('/api/resident/appointments', requireResident, (req, res) => {
    db.all(`SELECT * FROM appointments WHERE resident_id = ? ORDER BY id DESC`, [req.session.resident.resident_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/resident/appointments', requireResident, (req, res) => {
    const { service_type, appointment_date, appointment_time, purpose } = req.body;
    db.run(`INSERT INTO appointments (resident_id, service_type, appointment_date, appointment_time, purpose, status) VALUES (?, ?, ?, ?, ?, 'Pending')`,
        [req.session.resident.resident_id, service_type, appointment_date, appointment_time, purpose], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.get('/api/resident/assistance', requireResident, (req, res) => {
    db.all(`SELECT * FROM assistance WHERE resident_id = ? ORDER BY id DESC`, [req.session.resident.resident_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/resident/assistance', requireResident, (req, res) => {
    const { assistance_type, reason } = req.body;
    db.run(`INSERT INTO assistance (resident_id, assistance_type, reason, status) VALUES (?, ?, ?, 'Pending')`,
        [req.session.resident.resident_id, assistance_type, reason], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.get('/api/resident/complaints', requireResident, (req, res) => {
    db.all(`SELECT * FROM complaints WHERE resident_id = ? ORDER BY id DESC`, [req.session.resident.resident_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/resident/complaints', requireResident, (req, res) => {
    const { subject, details } = req.body;
    db.run(`INSERT INTO complaints (resident_id, subject, details, status) VALUES (?, ?, ?, 'Pending')`,
        [req.session.resident.resident_id, subject, details], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.get('/api/resident/announcements', requireResident, (req, res) => {
    db.all(`SELECT * FROM announcements ORDER BY id DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// QR Code Verification Endpoint (Public)
app.get('/api/verify/:resident_id', (req, res) => {
    const resident_id = req.params.resident_id;
    db.get(`SELECT r.resident_id, r.first_name, r.middle_name, r.last_name, r.suffix, r.status, s.barangay_name FROM residents r, settings s WHERE r.resident_id = ?`, [resident_id], (err, row) => {
        if (err || !row) {
            return res.status(404).json({ valid: false, message: 'Resident ID not found.' });
        }
        res.json({
            valid: row.status === 'Active',
            resident_id: row.resident_id,
            name: `${row.first_name} ${row.middle_name ? row.middle_name[0] + '.' : ''} ${row.last_name} ${row.suffix || ''}`,
            barangay: row.barangay_name,
            status: row.status
        });
    });
});


// ==================== HTML FRONTEND VIEWS ====================

// Serve Verification Page
app.get('/verify/:resident_id', (req, res) => {
    const resident_id = req.params.resident_id;
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ID Verification - Barangay Management System</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-100 flex items-center justify-center min-h-screen p-4">
    <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center" id="verification-card">
        <div class="animate-pulse">Loading verification details...</div>
    </div>
    <script>
        fetch('/api/verify/${resident_id}')
            .then(res => res.json())
            .then(data => {
                const card = document.getElementById('verification-card');
                if (data.valid) {
                    card.innerHTML = \`
                        <div class="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-bold">✓</div>
                        <h2 class="text-2xl font-bold text-slate-800 mb-1">VALID RESIDENT ID</h2>
                        <p class="text-sm text-green-600 font-semibold mb-6">Status: \${data.status}</p>
                        <div class="bg-slate-50 rounded-xl p-4 text-left space-y-2 mb-6 border border-slate-200">
                            <div><span class="text-xs text-slate-400 block">Resident ID</span><span class="font-mono font-bold text-slate-700">\${data.resident_id}</span></div>
                            <div><span class="text-xs text-slate-400 block">Full Name</span><span class="font-bold text-slate-700">\${data.name}</span></div>
                            <div><span class="text-xs text-slate-400 block">Barangay</span><span class="font-semibold text-slate-700">\${data.barangay}</span></div>
                        </div>
                        <p class="text-xs text-slate-400">Official verified record from Barangay Resident Management System.</p>
                    \`;
                } else {
                    card.innerHTML = \`
                        <div class="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-bold">✕</div>
                        <h2 class="text-2xl font-bold text-slate-800 mb-1">INVALID OR INACTIVE ID</h2>
                        <p class="text-sm text-red-500 mb-4">\${data.message || 'This ID is not currently active.'}</p>
                        <p class="text-xs text-slate-400">Please contact the barangay hall for assistance.</p>
                    \`;
                }
            })
            .catch(() => {
                document.getElementById('verification-card').innerHTML = '<p class="text-red-500">Error verifying ID.</p>';
            });
    </script>
</body>
</html>`);
});

// Serve Registration Page (/register)
app.get('/register', (req, res) => {
    res.send(renderHTMLPage('Resident Registration', 'register'));
});

// Serve Login Page (/login)
app.get('/login', (req, res) => {
    res.send(renderHTMLPage('Login Portal', 'login'));
});

// Serve Staff Portal (/staff)
app.get('/staff', (req, res) => {
    res.send(renderHTMLPage('Staff Portal', 'staff'));
});

// Serve Resident Portal (/resident)
app.get('/resident', (req, res) => {
    res.send(renderHTMLPage('Resident Portal', 'resident'));
});

// Root route redirects to login
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Master HTML & Frontend Single File Render Engine
function renderHTMLPage(title, view) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Barangay Management System</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        @media print {
            .no-print { display: none !important; }
            body { background: white !important; }
        }
    </style>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen flex flex-col">
    <div id="app" class="flex-1 flex flex-col">
        <!-- Dynamic App Content Loaded via Vanilla JS -->
        <div class="flex items-center justify-center flex-1 p-6">
            <div class="text-center">
                <i class="fa-solid fa-spinner fa-spin text-4xl text-blue-600 mb-3"></i>
                <p class="text-slate-500 font-medium">Loading Barangay System...</p>
            </div>
        </div>
    </div>

    <script>
        const currentView = '${view}';

        // Load Settings and Render View
        document.addEventListener('DOMContentLoaded', () => {
            fetch('/api/settings')
                .then(res => res.json())
                .then(settings => {
                    window.brgySettings = settings;
                    initRouter(currentView);
                })
                .catch(() => initRouter(currentView));
        });

        function initRouter(view) {
            const app = document.getElementById('app');
            if (view === 'login') renderLogin(app);
            else if (view === 'register') renderRegister(app);
            else if (view === 'staff') checkAuthAndRenderStaff(app);
            else if (view === 'resident') checkAuthAndRenderResident(app);
            else app.innerHTML = '<div class="p-12 text-center text-red-500">Page not found</div>';
        }

        // ================= LOGIN PAGE =================
        function renderLogin(container) {
            container.innerHTML = \`
                <div class="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-900 to-slate-900">
                    <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 border border-slate-100">
                        <div class="text-center mb-8">
                            <div class="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-bold shadow-inner">
                                \${window.brgySettings?.logo_base64 ? '<img src="'+window.brgySettings.logo_base64+'" class="w-full h-full object-cover rounded-full"/>' : '<i class="fa-solid fa-landmark"></i>'}
                            </div>
                            <h1 class="text-2xl font-bold text-slate-800">\${window.brgySettings?.barangay_name || 'Barangay System'}</h1>
                            <p class="text-sm text-slate-500 mt-1">Resident & Staff Management Portal</p>
                        </div>

                        <div class="flex border-b border-slate-200 mb-6">
                            <button onclick="switchLoginTab('staff')" id="tab-staff" class="flex-1 pb-3 font-semibold text-blue-600 border-b-2 border-blue-600 transition">Staff Login</button>
                            <button onclick="switchLoginTab('resident')" id="tab-resident" class="flex-1 pb-3 font-medium text-slate-400 hover:text-slate-600 transition">Resident Login</button>
                        </div>

                        <!-- Staff Form -->
                        <form id="form-staff" onsubmit="handleStaffLogin(event)" class="space-y-4">
                            <div>
                                <label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Username</label>
                                <input type="text" name="username" required class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Password</label>
                                <input type="password" name="password" required class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl shadow-lg transition">Staff Sign In</button>
                        </form>

                        <!-- Resident Form -->
                        <form id="form-resident" onsubmit="handleResidentLogin(event)" class="space-y-4 hidden">
                            <div>
                                <label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Resident ID (e.g. BRGY-2026-000001)</label>
                                <input type="text" name="resident_id" required placeholder="BRGY-YYYY-######" class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none uppercase">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Password</label>
                                <input type="password" name="password" required class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl shadow-lg transition">Resident Sign In</button>
                            <div class="text-center mt-4">
                                <a href="/register" class="text-sm text-blue-600 hover:underline">Don't have an account? Register here</a>
                            </div>
                        </form>
                    </div>
                </div>
            \`;
        }

        function switchLoginTab(tab) {
            const isStaff = tab === 'staff';
            document.getElementById('form-staff').classList.toggle('hidden', !isStaff);
            document.getElementById('form-resident').classList.toggle('hidden', isStaff);
            document.getElementById('tab-staff').className = isStaff ? 'flex-1 pb-3 font-semibold text-blue-600 border-b-2 border-blue-600 transition' : 'flex-1 pb-3 font-medium text-slate-400 hover:text-slate-600 transition';
            document.getElementById('tab-resident').className = !isStaff ? 'flex-1 pb-3 font-semibold text-emerald-600 border-b-2 border-emerald-600 transition' : 'flex-1 pb-3 font-medium text-slate-400 hover:text-slate-600 transition';
        }

        function handleStaffLogin(e) {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target));
            fetch('/api/login/staff', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }).then(res => res.json()).then(res => {
                if (res.success) window.location.href = '/staff';
                else alert(res.error || 'Login failed');
            });
        }

        function handleResidentLogin(e) {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target));
            fetch('/api/login/resident', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }).then(res => res.json()).then(res => {
                if (res.success) window.location.href = '/resident';
                else alert(res.error || 'Login failed');
            });
        }

        // ================= REGISTRATION PAGE =================
        function renderRegister(container) {
            container.innerHTML = \`
                <div class="min-h-screen py-12 px-4 bg-slate-100 flex items-center justify-center">
                    <div class="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-8 border border-slate-200">
                        <div class="text-center mb-6">
                            <h1 class="text-2xl font-bold text-slate-800">Barangay Resident Registration</h1>
                            <p class="text-sm text-slate-500">Fill in your complete official details for verification.</p>
                        </div>
                        <form onsubmit="handleRegistrationSubmit(event)" class="space-y-4">
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">First Name *</label><input type="text" name="first_name" required class="w-full px-3 py-2 rounded-lg border border-slate-200"></div>
                                <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Middle Name</label><input type="text" name="middle_name" class="w-full px-3 py-2 rounded-lg border border-slate-200"></div>
                                <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Last Name *</label><input type="text" name="last_name" required class="w-full px-3 py-2 rounded-lg border border-slate-200"></div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Suffix</label><input type="text" name="suffix" placeholder="Jr., III" class="w-full px-3 py-2 rounded-lg border border-slate-200"></div>
                                <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Date of Birth *</label><input type="date" name="dob" required class="w-full px-3 py-2 rounded-lg border border-slate-200"></div>
                                <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Gender *</label><select name="gender" class="w-full px-3 py-2 rounded-lg border border-slate-200"><option>Male</option><option>Female</option></select></div>
                                <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Civil Status *</label><select name="civil_status" class="w-full px-3 py-2 rounded-lg border border-slate-200"><option>Single</option><option>Married</option><option>Widowed</option><option>Divorced</option></select></div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Street Address *</label><input type="text" name="address" required class="w-full px-3 py-2 rounded-lg border border-slate-200"></div>
                                <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Purok/Zone *</label><input type="text" name="purok" required placeholder="Purok 1 - Centro" class="w-full px-3 py-2 rounded-lg border border-slate-200"></div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Contact Number</label><input type="text" name="contact_number" placeholder="09XXXXXXXXX" class="w-full px-3 py-2 rounded-lg border border-slate-200"></div>
                                <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Email Address</label><input type="email" name="email" class="w-full px-3 py-2 rounded-lg border border-slate-200"></div>
                                <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Household Number</label><input type="text" name="household_number" placeholder="HH-001" class="w-full px-3 py-2 rounded-lg border border-slate-200"></div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Occupation</label><input type="text" name="occupation" class="w-full px-3 py-2 rounded-lg border border-slate-200"></div>
                                <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Educational Attainment</label><select name="educational_attainment" class="w-full px-3 py-2 rounded-lg border border-slate-200"><option>Elementary Undergraduate</option><option>Elementary Graduate</option><option>High School Undergraduate</option><option>High School Graduate</option><option>College Undergraduate</option><option>College Graduate</option><option>Vocational</option><option>None</option></select></div>
                                <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Password for Portal *</label><input type="password" name="password" required class="w-full px-3 py-2 rounded-lg border border-slate-200"></div>
                            </div>
                            <div class="grid grid-cols-2 md:grid-cols-6 gap-3 pt-2">
                                <div><label class="block text-xs text-slate-500">Registered Voter</label><select name="voter_status" class="w-full p-2 border rounded text-sm"><option>No</option><option>Yes</option></select></div>
                                <div><label class="block text-xs text-slate-500">PWD Status</label><select name="pwd_status" class="w-full p-2 border rounded text-sm"><option>No</option><option>Yes</option></select></div>
                                <div><label class="block text-xs text-slate-500">Senior Citizen</label><select name="senior_citizen_status" class="w-full p-2 border rounded text-sm"><option>No</option><option>Yes</option></select></div>
                                <div><label class="block text-xs text-slate-500">Solo Parent</label><select name="solo_parent_status" class="w-full p-2 border rounded text-sm"><option>No</option><option>Yes</option></select></div>
                                <div><label class="block text-xs text-slate-500">4Ps Beneficiary</label><select name="four_ps_status" class="w-full p-2 border rounded text-sm"><option>No</option><option>Yes</option></select></div>
                                <div><label class="block text-xs text-slate-500">Resident Photo</label><input type="file" name="photo" accept="image/*" class="w-full text-xs"></div>
                            </div>
                            <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl shadow transition mt-6">Submit Registration</button>
                            <div class="text-center pt-2"><a href="/login" class="text-sm text-blue-600 hover:underline">Already registered? Back to Login</a></div>
                        </form>
                    </div>
                </div>
            \`;
        }

        function handleRegistrationSubmit(e) {
            e.preventDefault();
            const formData = new FormData(e.target);
            fetch('/api/register', {
                method: 'POST',
                body: formData
            }).then(res => res.json()).then(res => {
                if (res.success) {
                    alert('Registration submitted successfully! Pending staff verification.');
                    window.location.href = '/login';
                } else {
                    alert(res.error || 'Registration failed');
                }
            });
        }

        // ================= STAFF PORTAL =================
        function checkAuthAndRenderStaff(container) {
            fetch('/api/session').then(res => res.json()).then(session => {
                if (!session.user) { window.location.href = '/login'; return; }
                renderStaffDashboard(container, session.user);
            });
        }

        function renderStaffDashboard(container, user) {
            container.innerHTML = \`
                <div class="flex h-screen overflow-hidden bg-slate-100">
                    <!-- Sidebar -->
                    <aside class="w-64 bg-slate-900 text-slate-300 flex flex-col no-print">
                        <div class="p-6 border-b border-slate-800 flex items-center space-x-3">
                            <div class="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
                                <i class="fa-solid fa-landmark"></i>
                            </div>
                            <div>
                                <h2 class="font-bold text-white text-sm truncate">\${window.brgySettings?.barangay_name || 'Barangay'}</h2>
                                <p class="text-xs text-slate-400">Staff Portal</p>
                            </div>
                        </div>
                        <nav class="flex-1 overflow-y-auto p-4 space-y-1 text-sm">
                            <button onclick="loadStaffSection('dashboard')" class="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 text-left transition"><i class="fa-solid fa-chart-pie w-5"></i><span>Dashboard</span></button>
                            <button onclick="loadStaffSection('residents')" class="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 text-left transition"><i class="fa-solid fa-users w-5"></i><span>Resident Management</span></button>
                            <button onclick="loadStaffSection('households')" class="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 text-left transition"><i class="fa-solid fa-house w-5"></i><span>Households</span></button>
                            <button onclick="loadStaffSection('puroks')" class="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 text-left transition"><i class="fa-solid fa-map-location-dot w-5"></i><span>Puroks</span></button>
                            <button onclick="loadStaffSection('certificates')" class="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 text-left transition"><i class="fa-solid fa-file-contract w-5"></i><span>Certificates</span></button>
                            <button onclick="loadStaffSection('blotters')" class="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 text-left transition"><i class="fa-solid fa-scale-balanced w-5"></i><span>Blotter Cases</span></button>
                            <button onclick="loadStaffSection('appointments')" class="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 text-left transition"><i class="fa-solid fa-calendar-check w-5"></i><span>Appointments</span></button>
                            <button onclick="loadStaffSection('assistance')" class="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 text-left transition"><i class="fa-solid fa-hand-holding-heart w-5"></i><span>Assistance</span></button>
                            <button onclick="loadStaffSection('businesses')" class="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 text-left transition"><i class="fa-solid fa-store w-5"></i><span>Businesses</span></button>
                            <button onclick="loadStaffSection('announcements')" class="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 text-left transition"><i class="fa-solid fa-bullhorn w-5"></i><span>Announcements</span></button>
                            <button onclick="loadStaffSection('complaints')" class="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 text-left transition"><i class="fa-solid fa-triangle-exclamation w-5"></i><span>Complaints</span></button>
                            <button onclick="loadStaffSection('print_ids')" class="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 text-left transition"><i class="fa-solid fa-id-card w-5"></i><span>Print ID Sheets</span></button>
                            <button onclick="loadStaffSection('reports')" class="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 text-left transition"><i class="fa-solid fa-file-excel w-5"></i><span>Reports</span></button>
                            \${user.role === 'Super Admin' ? '<button onclick="loadStaffSection(\\'users\\')" class="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 text-left transition"><i class="fa-solid fa-user-shield w-5"></i><span>User Management</span></button>' : ''}
                            <button onclick="loadStaffSection('settings')" class="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 text-left transition"><i class="fa-solid fa-gear w-5"></i><span>Settings</span></button>
                        </nav>
                        <div class="p-4 border-t border-slate-800">
                            <button onclick="logout()" class="w-full flex items-center justify-center space-x-2 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white py-2 rounded-lg transition"><i class="fa-solid fa-right-from-bracket"></i><span>Logout</span></button>
                        </div>
                    </aside>

                    <!-- Main Content Area -->
                    <main class="flex-1 flex flex-col overflow-y-auto">
                        <header class="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center no-print">
                            <h1 id="page-title" class="text-xl font-bold text-slate-800">Dashboard</h1>
                            <div class="flex items-center space-x-4">
                                <span class="text-sm font-medium text-slate-600">\${user.full_name} (<span class="text-blue-600">\${user.role}</span>)</span>
                            </div>
                        </header>
                        <div id="staff-content" class="p-8 flex-1">
                            <!-- Section Content Loaded Here -->
                        </div>
                    </main>
                </div>
            \`;
            loadStaffSection('dashboard');
        }

        function logout() {
            fetch('/api/logout', { method: 'POST' }).then(() => window.location.href = '/login');
        }

        function loadStaffSection(section) {
            const content = document.getElementById('staff-content');
            const title = document.getElementById('page-title');
            if (title) title.innerText = section.replace('_', ' ').toUpperCase();

            if (section === 'dashboard') renderStaffDashboardHome(content);
            else if (section === 'residents') renderStaffResidents(content);
            else if (section === 'households') renderStaffHouseholds(content);
            else if (section === 'puroks') renderStaffPuroks(content);
            else if (section === 'certificates') renderStaffCertificates(content);
            else if (section === 'blotters') renderStaffBlotters(content);
            else if (section === 'appointments') renderStaffAppointments(content);
            else if (section === 'assistance') renderStaffAssistance(content);
            else if (section === 'businesses') renderStaffBusinesses(content);
            else if (section === 'announcements') renderStaffAnnouncements(content);
            else if (section === 'complaints') renderStaffComplaints(content);
            else if (section === 'print_ids') renderStaffPrintIDs(content);
            else if (section === 'reports') renderStaffReports(content);
            else if (section === 'users') renderStaffUsers(content);
            else if (section === 'settings') renderStaffSettings(content);
        }

        // Dashboard Home Statistics
        function renderStaffDashboardHome(container) {
            fetch('/api/staff/stats').then(res => res.json()).then(stats => {
                container.innerHTML = \`
                    <div class="space-y-6">
                        <!-- Registration Link Banner -->
                        <div class="bg-blue-50 border border-blue-200 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                            <div>
                                <h3 class="font-bold text-blue-900 text-lg">Public Resident Registration Link</h3>
                                <p class="text-sm text-blue-700">Share this link with residents so they can register their accounts online.</p>
                                <code class="bg-white px-3 py-1 rounded border border-blue-200 text-xs font-mono mt-2 inline-block">\${window.location.origin}/register</code>
                            </div>
                            <button onclick="navigator.clipboard.writeText(window.location.origin + '/register'); alert('Registration link copied to clipboard!');" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl shadow transition text-sm">Copy Link</button>
                        </div>

                        <!-- Stats Grid -->
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <div class="text-slate-400 text-xs font-semibold uppercase mb-1">Total Residents</div>
                                <div class="text-3xl font-bold text-slate-800">\${stats.total_residents || 0}</div>
                            </div>
                            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <div class="text-slate-400 text-xs font-semibold uppercase mb-1">Households</div>
                                <div class="text-3xl font-bold text-slate-800">\${stats.total_households || 0}</div>
                            </div>
                            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <div class="text-slate-400 text-xs font-semibold uppercase mb-1">Senior Citizens</div>
                                <div class="text-3xl font-bold text-slate-800">\${stats.senior_citizens || 0}</div>
                            </div>
                            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <div class="text-slate-400 text-xs font-semibold uppercase mb-1">Registered Voters</div>
                                <div class="text-3xl font-bold text-slate-800">\${stats.voters || 0}</div>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <div class="text-slate-400 text-xs font-semibold uppercase mb-1">Male / Female</div>
                                <div class="text-xl font-bold text-slate-800">\${stats.male || 0} / \${stats.female || 0}</div>
                            </div>
                            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <div class="text-slate-400 text-xs font-semibold uppercase mb-1">Minors / Adults</div>
                                <div class="text-xl font-bold text-slate-800">\${stats.minors || 0} / \${stats.adults || 0}</div>
                            </div>
                            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <div class="text-slate-400 text-xs font-semibold uppercase mb-1">PWD / Solo Parent</div>
                                <div class="text-xl font-bold text-slate-800">\${stats.pwd || 0} / \${stats.solo_parents || 0}</div>
                            </div>
                            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <div class="text-slate-400 text-xs font-semibold uppercase mb-1">Pending Approvals</div>
                                <div class="text-xl font-bold text-amber-600">\${stats.pending_registrations || 0} Reg / \${stats.pending_certificates || 0} Cert</div>
                            </div>
                        </div>
                    </div>
                \`;
            });
        }

        // Resident Management Section
        function renderStaffResidents(container) {
            container.innerHTML = \`
                <div class="space-y-6">
                    <div class="flex flex-col md:flex-row justify-between gap-4 items-center">
                        <div class="flex gap-2 w-full md:w-auto">
                            <input type="text" id="res-search" placeholder="Search name, ID, household..." class="px-4 py-2 rounded-xl border border-slate-200 text-sm w-full md:w-64" oninput="loadResidentsList()">
                            <select id="res-status" class="px-4 py-2 rounded-xl border border-slate-200 text-sm" onchange="loadResidentsList()">
                                <option value="Active">Active</option>
                                <option value="Pending">Pending</option>
                                <option value="Archived">Archived / Inactive</option>
                                <option value="Rejected">Rejected</option>
                            </select>
                        </div>
                        <button onclick="openAddResidentModal()" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm shadow transition">+ Add Resident</button>
                    </div>

                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                                    <th class="p-4">ID</th>
                                    <th class="p-4">Name</th>
                                    <th class="p-4">Purok / Address</th>
                                    <th class="p-4">Household</th>
                                    <th class="p-4">Status</th>
                                    <th class="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="residents-tbody" class="divide-y divide-slate-100 text-sm">
                                <tr><td colspan="6" class="p-8 text-center text-slate-400">Loading residents...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            \`;
            loadResidentsList();
        }

        function loadResidentsList() {
            const search = document.getElementById('res-search')?.value || '';
            const status = document.getElementById('res-status')?.value || 'Active';
            fetch(\`/api/staff/residents?status=\${status}&search=\${search}\`)
                .then(res => res.json())
                .then(rows => {
                    const tbody = document.getElementById('residents-tbody');
                    if (!tbody) return;
                    if (rows.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-400">No residents found.</td></tr>';
                        return;
                    }
                    tbody.innerHTML = rows.map(r => \`
                        <tr class="hover:bg-slate-50 transition">
                            <td class="p-4 font-mono font-medium text-slate-600">\${r.resident_id || 'Pending'}</td>
                            <td class="p-4 font-semibold text-slate-800">\${r.first_name} \\${r.last_name} \${r.suffix || ''}</td>
                            <td class="p-4 text-slate-600">\${r.purok}</td>
                            <td class="p-4 text-slate-600">\${r.household_number || 'N/A'}</td>
                            <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold \${r.status === 'Active' ? 'bg-green-100 text-green-700' : r.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-650'}">\${r.status}</span></td>
                            <td class="p-4 text-right space-x-2">
                                \${r.status === 'Pending' ? \`<button onclick="approveResident(\${r.id})" class="text-green-600 hover:underline font-semibold">Approve</button><button onclick="rejectResident(\${r.id})" class="text-red-600 hover:underline">Reject</button>\` : ''}
                                <select onchange="updateResidentStatus(\${r.id}, this.value)" class="text-xs border rounded p-1">
                                    <option value="" disabled selected>Status...</option>
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                    <option value="Moved Out">Moved Out</option>
                                    <option value="Deceased">Deceased</option>
                                    <option value="Archived">Archive</option>
                                </select>
                            </td>
                        </tr>
                    \`).join('');
                });
        }

        function approveResident(id) {
            fetch('/api/staff/residents/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            }).then(res => res.json()).then(res => {
                if (res.success) { alert('Resident approved with ID: ' + res.resident_id); loadResidentsList(); }
            });
        }

        function rejectResident(id) {
            if (!confirm('Reject this registration?')) return;
            fetch('/api/staff/residents/reject', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            }).then(res => res.json()).then(() => loadResidentsList());
        }

        function updateResidentStatus(id, status) {
            fetch('/api/staff/residents/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status })
            }).then(res => res.json()).then(() => loadResidentsList());
        }

        function openAddResidentModal() {
            // Redirect or open modal for adding resident (or use register form functionality)
            window.location.href = '/register';
        }

        // Household Section
        function renderStaffHouseholds(container) {
            container.innerHTML = \`
                <div class="space-y-6">
                    <div class="flex justify-between items-center">
                        <h2 class="text-lg font-bold">Household Records</h2>
                        <button onclick="promptAddHousehold()" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">+ Add Household</button>
                    </div>
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <table class="w-full text-left border-collapse">
                            <thead><tr class="bg-slate-50 border-b text-xs text-slate-500 uppercase"><th class="p-4">Household No.</th><th class="p-4">Household Head</th><th class="p-4">Address</th><th class="p-4">Purok</th></tr></thead>
                            <tbody id="household-tbody" class="divide-y text-sm"><tr><td colspan="4" class="p-6 text-center text-slate-400">Loading households...</td></tr></tbody>
                        </table>
                    </div>
                </div>
            \`;
            fetch('/api/staff/households').then(res => res.json()).then(rows => {
                const tbody = document.getElementById('household-tbody');
                if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-slate-400">No households recorded.</td></tr>'; return; }
                tbody.innerHTML = rows.map(h => \`<tr><td class="p-4 font-mono font-bold">\${h.household_number}</td><td class="p-4 font-semibold">\${h.head_name}</td><td class="p-4">\${h.address}</td><td class="p-4">\${h.purok}</td></tr>\`).join('');
            });
        }

        function promptAddHousehold() {
            const num = prompt('Enter Household Number (e.g., HH-001):');
            if (!num) return;
            const head = prompt('Enter Household Head Name:');
            const address = prompt('Enter Street Address:');
            const purok = prompt('Enter Purok:');
            fetch('/api/staff/households', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ household_number: num, head_name: head, address, purok })
            }).then(() => loadStaffSection('households'));
        }

        // Purok Section
        function renderStaffPuroks(container) {
            container.innerHTML = \`
                <div class="space-y-6">
                    <div class="flex justify-between items-center">
                        <h2 class="text-lg font-bold">Purok Management</h2>
                        <button onclick="promptAddPurok()" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">+ Add Purok</button>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" id="puroks-grid">
                        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">Loading puroks...</div>
                    </div>
                </div>
            \`;
            fetch('/api/staff/puroks').then(res => res.json()).then(rows => {
                const grid = document.getElementById('puroks-grid');
                grid.innerHTML = rows.map(p => \`
                    <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                        <div>
                            <h3 class="font-bold text-slate-800 text-lg mb-1">\${p.name}</h3>
                            <p class="text-xs text-slate-500 mb-4">\${p.description || 'Barangay Purok Zone'}</p>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between"><span class="text-slate-400">Residents:</span><span class="font-bold text-slate-700">\${p.resident_count}</span></div>
                                <div class="flex justify-between"><span class="text-slate-400">Households:</span><span class="font-bold text-slate-700">\${p.household_count}</span></div>
                            </div>
                        </div>
                        <button onclick="deletePurok(\${p.id})" class="mt-6 text-xs text-red-500 hover:underline text-left">Delete Purok</button>
                    </div>
                \`).join('');
            });
        }

        function promptAddPurok() {
            const name = prompt('Enter Purok Name (e.g., Purok 5 - Orchard):');
            if (!name) return;
            const desc = prompt('Enter Description:');
            fetch('/api/staff/puroks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description: desc })
            }).then(() => loadStaffSection('puroks'));
        }

        function deletePurok(id) {
            if (!confirm('Delete purok?')) return;
            fetch('/api/staff/puroks/' + id, { method: 'DELETE' }).then(res => res.json()).then(res => {
                if (res.error) alert(res.error);
                else loadStaffSection('puroks');
            });
        }

        // Certificate Management Section
        function renderStaffCertificates(container) {
            container.innerHTML = \`
                <div class="space-y-6">
                    <div class="flex justify-between items-center">
                        <h2 class="text-lg font-bold">Certificate Requests</h2>
                    </div>
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <table class="w-full text-left border-collapse">
                            <thead><tr class="bg-slate-50 border-b text-xs text-slate-500 uppercase"><th class="p-4">Cert #</th><th class="p-4">Resident</th><th class="p-4">Type & Purpose</th><th class="p-4">Status</th><th class="p-4 text-right">Actions</th></tr></thead>
                            <tbody id="cert-tbody" class="divide-y text-sm"><tr><td colspan="5" class="p-6 text-center text-slate-400">Loading certificates...</td></tr></tbody>
                        </table>
                    </div>
                </div>
            \`;
            fetch('/api/staff/certificates').then(res => res.json()).then(rows => {
                const tbody = document.getElementById('cert-tbody');
                if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-400">No certificate requests.</td></tr>'; return; }
                tbody.innerHTML = rows.map(c => \`
                    <tr>
                        <td class="p-4 font-mono font-bold">\${c.cert_number}</td>
                        <td class="p-4 font-semibold">\${c.first_name} \${c.last_name}</td>
                        <td class="p-4"><span class="font-medium text-slate-800">\${c.cert_type}</span><br><span class="text-xs text-slate-500">\${c.purpose || ''}</span></td>
                        <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold \${c.status === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}">\${c.status}</span></td>
                        <td class="p-4 text-right space-x-2">
                            <button onclick="updateCertStatus(\${c.id}, 'Approved')" class="text-green-600 font-semibold hover:underline">Approve</button>
                            <button onclick="updateCertStatus(\${c.id}, 'Released')" class="text-blue-600 font-semibold hover:underline">Release</button>
                        </td>
                    </tr>
                \`).join('');
            });
        }

        function updateCertStatus(id, status) {
            fetch('/api/staff/certificates/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, remarks: 'Updated by staff' })
            }).then(() => loadStaffSection('certificates'));
        }

        // Blotter Section
        function renderStaffBlotters(container) {
            container.innerHTML = \`
                <div class="space-y-6">
                    <div class="flex justify-between items-center">
                        <h2 class="text-lg font-bold">Blotter Cases</h2>
                        <button onclick="promptAddBlotter()" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">+ File Blotter</button>
                    </div>
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <table class="w-full text-left border-collapse">
                            <thead><tr class="bg-slate-50 border-b text-xs text-slate-500 uppercase"><th class="p-4">Case #</th><th class="p-4">Complainant vs Respondent</th><th class="p-4">Incident Type</th><th class="p-4">Status</th></tr></thead>
                            <tbody id="blotter-tbody" class="divide-y text-sm"><tr><td colspan="4" class="p-6 text-center text-slate-400">Loading blotter cases...</td></tr></tbody>
                        </table>
                    </div>
                </div>
            \`;
            fetch('/api/staff/blotters').then(res => res.json()).then(rows => {
                const tbody = document.getElementById('blotter-tbody');
                if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-slate-400">No blotter records.</td></tr>'; return; }
                tbody.innerHTML = rows.map(b => \`<tr><td class="p-4 font-mono font-bold">\${b.case_number}</td><td class="p-4 font-semibold">\${b.complainant} vs \${b.respondent}</td><td class="p-4">\${b.incident_type}</td><td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">\${b.status}</span></td></tr>\`).join('');
            });
        }

        function promptAddBlotter() {
            const comp = prompt('Complainant Name:');
            if (!comp) return;
            const resp = prompt('Respondent Name:');
            const type = prompt('Incident Type (e.g. Disputed Boundaries, Noise Complaint):');
            const desc = prompt('Incident Description:');
            fetch('/api/staff/blotters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ complainant: comp, respondent: resp, witness: '', incident_date: new Date().toISOString().split('T')[0], incident_time: '12:00', location: 'Barangay Hall', incident_type: type, description: desc, action_taken: 'Recorded', settlement: '', status: 'Open' })
            }).then(() => loadStaffSection('blotters'));
        }

        // Appointment Section
        function renderStaffAppointments(container) {
            container.innerHTML = \`
                <div class="space-y-6">
                    <h2 class="text-lg font-bold">Appointments</h2>
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <table class="w-full text-left border-collapse">
                            <thead><tr class="bg-slate-50 border-b text-xs text-slate-500 uppercase"><th class="p-4">Resident</th><th class="p-4">Service</th><th class="p-4">Date & Time</th><th class="p-4">Status</th><th class="p-4 text-right">Actions</th></tr></thead>
                            <tbody id="appt-tbody" class="divide-y text-sm"><tr><td colspan="5" class="p-6 text-center text-slate-400">Loading appointments...</td></tr></tbody>
                        </table>
                    </div>
                </div>
            \`;
            fetch('/api/staff/appointments').then(res => res.json()).then(rows => {
                const tbody = document.getElementById('appt-tbody');
                if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-400">No appointments.</td></tr>'; return; }
                tbody.innerHTML = rows.map(a => \`
                    <tr>
                        <td class="p-4 font-semibold">\${a.first_name} \${a.last_name}</td>
                        <td class="p-4">\${a.service_type}</td>
                        <td class="p-4">\${a.appointment_date} \${a.appointment_time}</td>
                        <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">\${a.status}</span></td>
                        <td class="p-4 text-right"><button onclick="updateAppt(\${a.id}, 'Approved')" class="text-green-600 font-semibold hover:underline">Approve</button></td>
                    </tr>
                \`).join('');
            });
        }

        function updateAppt(id, status) {
            fetch('/api/staff/appointments/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, remarks: 'Approved' })
            }).then(() => loadStaffSection('appointments'));
        }

        // Assistance Section
        function renderStaffAssistance(container) {
            container.innerHTML = \`
                <div class="space-y-6">
                    <h2 class="text-lg font-bold">Assistance Requests</h2>
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <table class="w-full text-left border-collapse">
                            <thead><tr class="bg-slate-50 border-b text-xs text-slate-500 uppercase"><th class="p-4">Resident</th><th class="p-4">Type</th><th class="p-4">Reason</th><th class="p-4">Status</th><th class="p-4 text-right">Actions</th></tr></thead>
                            <tbody id="assist-tbody" class="divide-y text-sm"><tr><td colspan="5" class="p-6 text-center text-slate-400">Loading assistance requests...</td></tr></tbody>
                        </table>
                    </div>
                </div>
            \`;
            fetch('/api/staff/assistance').then(res => res.json()).then(rows => {
                const tbody = document.getElementById('assist-tbody');
                if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-400">No requests.</td></tr>'; return; }
                tbody.innerHTML = rows.map(a => \`
                    <tr>
                        <td class="p-4 font-semibold">\${a.first_name} \${a.last_name}</td>
                        <td class="p-4">\${a.assistance_type}</td>
                        <td class="p-4">\${a.reason}</td>
                        <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">\${a.status}</span></td>
                        <td class="p-4 text-right"><button onclick="updateAssist(\${a.id}, 'Approved')" class="text-green-600 font-semibold hover:underline">Approve</button></td>
                    </tr>
                \`).join('');
            });
        }

        function updateAssist(id, status) {
            fetch('/api/staff/assistance/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, remarks: 'Approved' })
            }).then(() => loadStaffSection('assistance'));
        }

        // Business Section
        function renderStaffBusinesses(container) {
            container.innerHTML = \`
                <div class="space-y-6">
                    <div class="flex justify-between items-center"><h2 class="text-lg font-bold">Local Businesses</h2><button onclick="promptAddBusiness()" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">+ Register Business</button></div>
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <table class="w-full text-left border-collapse">
                            <thead><tr class="bg-slate-50 border-b text-xs text-slate-500 uppercase"><th class="p-4">Business Name</th><th class="p-4">Owner</th><th class="p-4">Type</th><th class="p-4">Permit #</th></tr></thead>
                            <tbody id="biz-tbody" class="divide-y text-sm"><tr><td colspan="4" class="p-6 text-center text-slate-400">Loading businesses...</td></tr></tbody>
                        </table>
                    </div>
                </div>
            \`;
            fetch('/api/staff/businesses').then(res => res.json()).then(rows => {
                const tbody = document.getElementById('biz-tbody');
                if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-slate-400">No businesses registered.</td></tr>'; return; }
                tbody.innerHTML = rows.map(b => \`<tr><td class="p-4 font-bold">\${b.business_name}</td><td class="p-4">\${b.owner_name}</td><td class="p-4">\${b.business_type}</td><td class="p-4 font-mono">\${b.permit_number}</td></tr>\`).join('');
            });
        }

        function promptAddBusiness() {
            const name = prompt('Business Name:');
            if (!name) return;
            const owner = prompt('Owner Name:');
            const type = prompt('Business Type (e.g. Sari-Sari Store):');
            const permit = prompt('Permit Number:');
            fetch('/api/staff/businesses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ business_name: name, owner_name: owner, address: 'Barangay', business_type: type, contact_number: '09000000000', permit_number: permit, permit_status: 'Active', expiration_date: '2026-12-31' })
            }).then(() => loadStaffSection('businesses'));
        }

        // Announcements Section
        function renderStaffAnnouncements(container) {
            container.innerHTML = \`
                <div class="space-y-6">
                    <div class="flex justify-between items-center"><h2 class="text-lg font-bold">Announcements</h2><button onclick="promptAddAnnouncement()" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">+ Post Announcement</button></div>
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <table class="w-full text-left border-collapse">
                            <thead><tr class="bg-slate-50 border-b text-xs text-slate-500 uppercase"><th class="p-4">Title</th><th class="p-4">Category</th><th class="p-4">Content</th><th class="p-4 text-right">Actions</th></tr></thead>
                            <tbody id="ann-tbody" class="divide-y text-sm"><tr><td colspan="4" class="p-6 text-center text-slate-400">Loading announcements...</td></tr></tbody>
                        </table>
                    </div>
                </div>
            \`;
            fetch('/api/staff/announcements').then(res => res.json()).then(rows => {
                const tbody = document.getElementById('ann-tbody');
                if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-slate-400">No announcements.</td></tr>'; return; }
                tbody.innerHTML = rows.map(a => \`<tr><td class="p-4 font-bold">\${a.title}</td><td class="p-4">\${a.category}</td><td class="p-4">\${a.content}</td><td class="p-4 text-right"><button onclick="deleteAnn(\${a.id})" class="text-red-500">Delete</button></td></tr>\`).join('');
            });
        }

        function promptAddAnnouncement() {
            const title = prompt('Announcement Title:');
            if (!title) return;
            const category = prompt('Category (e.g., General, Event, Emergency):');
            const content = prompt('Content / Details:');
            fetch('/api/staff/announcements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, category, content })
            }).then(() => loadStaffSection('announcements'));
        }

        function deleteAnn(id) {
            fetch('/api/staff/announcements/' + id, { method: 'DELETE' }).then(() => loadStaffSection('announcements'));
        }

        // Complaints Section
        function renderStaffComplaints(container) {
            container.innerHTML = \`
                <div class="space-y-6">
                    <h2 class="text-lg font-bold">Resident Community Complaints</h2>
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <table class="w-full text-left border-collapse">
                            <thead><tr class="bg-slate-50 border-b text-xs text-slate-500 uppercase"><th class="p-4">Resident</th><th class="p-4">Subject</th><th class="p-4">Details</th><th class="p-4">Status</th></tr></thead>
                            <tbody id="comp-tbody" class="divide-y text-sm"><tr><td colspan="4" class="p-6 text-center text-slate-400">Loading complaints...</td></tr></tbody>
                        </table>
                    </div>
                </div>
            \`;
            fetch('/api/staff/complaints').then(res => res.json()).then(rows => {
                const tbody = document.getElementById('comp-tbody');
                if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-slate-400">No complaints.</td></tr>'; return; }
                tbody.innerHTML = rows.map(c => \`<tr><td class="p-4 font-semibold">\${c.first_name} \${c.last_name}</td><td class="p-4 font-bold">\${c.subject}</td><td class="p-4">\${c.details}</td><td class="p-4"><span class="px-2 py-1 rounded bg-amber-100 text-amber-700 text-xs">\${c.status}</span></td></tr>\`).join('');
            });
        }

        // Print ID Sheets Section (8 IDs on 8.5x11 bond paper grid)
        function renderStaffPrintIDs(container) {
            container.innerHTML = \`
                <div class="space-y-6">
                    <div class="flex justify-between items-center no-print">
                        <div>
                            <h2 class="text-lg font-bold">Printable Resident ID Sheet</h2>
                            <p class="text-sm text-slate-500">Generates exactly 8 standard ID cards in a 2x4 grid optimized for 8.5 x 11 inch paper.</p>
                        </div>
                        <button onclick="window.print()" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl shadow transition">Print ID Sheet</button>
                    </div>

                    <!-- 8-Up ID Grid Sheet (Letter Paper proportion) -->
                    <div class="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 mx-auto max-w-4xl" style="width: 8.5in; min-height: 11in;">
                        <div id="print-grid" class="grid grid-cols-2 gap-4">
                            <div class="text-center p-8 text-slate-400">Loading active residents for ID generation...</div>
                        </div>
                    </div>
                </div>
            \`;

            fetch('/api/staff/residents?status=Active').then(res => res.json()).then(rows => {
                const grid = document.getElementById('print-grid');
                if (rows.length === 0) { grid.innerHTML = '<div class="col-span-2 text-center text-slate-400 p-8">No active residents found.</div>'; return; }
                
                // Take up to 8 residents for the page sheet
                const pageResidents = rows.slice(0, 8);
                grid.innerHTML = pageResidents.map((r, i) => \`
                    <div class="border-2 border-dashed border-slate-300 rounded-xl p-3 flex flex-col justify-between bg-white relative overflow-hidden" style="height: 2.3in;">
                        <div class="flex items-center space-x-2 border-b pb-2">
                            <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xs">BRGY</div>
                            <div>
                                <h4 class="font-bold text-xs uppercase text-slate-800">\${window.brgySettings?.barangay_name || 'Barangay'}</h4>
                                <p class="text-[9px] text-slate-500">OFFICIAL RESIDENT ID</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-3 my-2">
                            <div class="w-12 h-14 bg-slate-200 rounded overflow-hidden flex-shrink-0">
                                \${r.photo ? '<img src="'+r.photo+'" class="w-full h-full object-cover"/>' : '<div class="w-full h-full flex items-center justify-center text-[10px] text-slate-400">PHOTO</div>'}
                            </div>
                            <div class="text-left overflow-hidden">
                                <div class="font-bold text-xs truncate">\${r.last_name}, \${r.first_name}</div>
                                <div class="text-[10px] font-mono text-blue-600 font-bold">\${r.resident_id}</div>
                                <div class="text-[9px] text-slate-600 truncate">Purok: \${r.purok}</div>
                                <div class="text-[9px] text-slate-600 truncate">DOB: \${r.dob}</div>
                            </div>
                        </div>
                        <div class="flex justify-between items-end border-t pt-1">
                            <span class="text-[8px] text-slate-400">Valid: \${new Date().getFullYear() + 2}</span>
                            <div class="w-12 h-4 border-b border-slate-800"></div>
                        </div>
                    </div>
                \`).join('');
            });
        }

        // Reports Section
        function renderStaffReports(container) {
            container.innerHTML = \`
                <div class="space-y-6">
                    <h2 class="text-lg font-bold">Barangay Reports & Export</h2>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                            <h3 class="font-bold mb-2">Master Resident Report</h3>
                            <p class="text-xs text-slate-500 mb-4">Complete list of all active residents with demographics.</p>
                            <button onclick="window.print()" class="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-semibold">Print Report</button>
                        </div>
                        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                            <h3 class="font-bold mb-2">Household & Purok Report</h3>
                            <p class="text-xs text-slate-500 mb-4">Household groupings and population per purok.</p>
                            <button onclick="window.print()" class="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-semibold">Print Report</button>
                        </div>
                        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                            <h3 class="font-bold mb-2">Blotter & Case Report</h3>
                            <p class="text-xs text-slate-500 mb-4">Summary of community blotters and incident status.</p>
                            <button onclick="window.print()" class="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-semibold">Print Report</button>
                        </div>
                    </div>
                </div>
            \`;
        }

        // User Management Section
        function renderStaffUsers(container) {
            container.innerHTML = \`
                <div class="space-y-6">
                    <div class="flex justify-between items-center"><h2 class="text-lg font-bold">Staff User Management</h2><button onclick="promptAddUser()" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">+ Add Staff User</button></div>
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <table class="w-full text-left border-collapse">
                            <thead><tr class="bg-slate-50 border-b text-xs text-slate-500 uppercase"><th class="p-4">Username</th><th class="p-4">Full Name</th><th class="p-4">Role</th><th class="p-4 text-right">Actions</th></tr></thead>
                            <tbody id="user-tbody" class="divide-y text-sm"><tr><td colspan="4" class="p-6 text-center text-slate-400">Loading users...</td></tr></tbody>
                        </table>
                    </div>
                </div>
            \`;
            fetch('/api/staff/users').then(res => res.json()).then(rows => {
                const tbody = document.getElementById('user-tbody');
                tbody.innerHTML = rows.map(u => \`<tr><td class="p-4 font-mono">\${u.username}</td><td class="p-4 font-semibold">\${u.full_name}</td><td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">\${u.role}</span></td><td class="p-4 text-right"><button onclick="deleteUser(\${u.id})" class="text-red-500">Delete</button></td></tr>\`).join('');
            });
        }

        function promptAddUser() {
            const username = prompt('Username:');
            if (!username) return;
            const password = prompt('Password:');
            const full_name = prompt('Full Name:');
            const role = prompt('Role (Super Admin, Barangay Admin, Barangay Staff):');
            fetch('/api/staff/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, full_name, role, email: 'admin@brgy.gov.ph' })
            }).then(() => loadStaffSection('users'));
        }

        function deleteUser(id) {
            fetch('/api/staff/users/' + id, { method: 'DELETE' }).then(() => loadStaffSection('users'));
        }

        // Settings Section
        function renderStaffSettings(container) {
            container.innerHTML = \`
                <div class="max-w-xl bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                    <h2 class="text-lg font-bold mb-6">Barangay Customization Settings</h2>
                    <form onsubmit="saveSettings(event)" class="space-y-4">
                        <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Barangay Name</label><input type="text" name="barangay_name" value="\${window.brgySettings?.barangay_name || ''}" class="w-full p-2.5 border rounded-xl"></div>
                        <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Municipality / City</label><input type="text" name="municipality" value="\${window.brgySettings?.municipality || ''}" class="w-full p-2.5 border rounded-xl"></div>
                        <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Province</label><input type="text" name="province" value="\${window.brgySettings?.province || ''}" class="w-full p-2.5 border rounded-xl"></div>
                        <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Barangay Captain</label><input type="text" name="captain" value="\${window.brgySettings?.captain || ''}" class="w-full p-2.5 border rounded-xl"></div>
                        <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Contact Number</label><input type="text" name="contact_number" value="\${window.brgySettings?.contact_number || ''}" class="w-full p-2.5 border rounded-xl"></div>
                        <div><label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Barangay Logo Image</label><input type="file" id="logo-file" accept="image/*" class="w-full text-sm"></div>
                        <button type="submit" class="bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-xl shadow">Save Settings</button>
                    </form>
                </div>
            \`;
        }

        function saveSettings(e) {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target));
            const fileInput = document.getElementById('logo-file');
            
            const submitData = (logoBase64) => {
                if (logoBase64) data.logo_base64 = logoBase64;
                fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                }).then(res => res.json()).then(res => {
                    if (res.success) { alert('Settings saved successfully!'); window.location.reload(); }
                });
            };

            if (fileInput.files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => submitData(e.target.result);
                reader.readAsDataURL(fileInput.files[0]);
            } else {
                submitData(null);
            }
        }


        // ================= RESIDENT PORTAL =================
        function checkAuthAndRenderResident(container) {
            fetch('/api/session').then(res => res.json()).then(session => {
                if (!session.resident) { window.location.href = '/login'; return; }
                renderResidentPortal(container, session.resident);
            });
        }

        function renderResidentPortal(container, resident) {
            container.innerHTML = \`
                <div class="min-h-screen bg-slate-100 flex flex-col">
                    <header class="bg-white border-b px-8 py-4 flex justify-between items-center shadow-sm">
                        <div class="flex items-center space-x-3">
                            <div class="w-10 h-10 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold">
                                <i class="fa-solid fa-user"></i>
                            </div>
                            <div>
                                <h2 class="font-bold text-slate-800" id="res-name-hdr">\${resident.full_name}</h2>
                                <p class="text-xs text-emerald-600 font-mono" id="res-id-hdr">\${resident.resident_id}</p>
                            </div>
                        </div>
                        <button onclick="logoutResident()" class="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white px-4 py-2 rounded-xl text-sm font-semibold transition">Logout</button>
                    </header>

                    <main class="flex-1 max-w-5xl w-full mx-auto p-6 space-y-6">
                        <!-- Digital ID Card Section -->
                        <div class="bg-gradient-to-r from-blue-900 to-slate-900 text-white rounded-2xl shadow-xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                            <div class="space-y-2">
                                <div class="text-xs uppercase tracking-widest text-blue-400 font-semibold">\${window.brgySettings?.barangay_name || 'Barangay'}</div>
                                <h3 class="text-2xl font-bold">Digital Resident ID</h3>
                                <p class="text-sm text-slate-300">Show this digital ID for official barangay transactions and verification.</p>
                                <div class="pt-2"><span class="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold">Active Status</span></div>
                            </div>
                            <div class="bg-white text-slate-800 rounded-xl p-4 shadow-lg w-72 text-center" id="digital-id-card">
                                <div class="font-bold text-xs uppercase text-blue-900 mb-1">\${window.brgySettings?.barangay_name || 'Barangay'}</div>
                                <div class="w-20 h-24 bg-slate-200 mx-auto rounded overflow-hidden my-2" id="id-photo-container"></div>
                                <div class="font-bold text-sm" id="id-full-name">Loading...</div>
                                <div class="text-xs font-mono font-bold text-blue-600 mb-2" id="id-number">\${resident.resident_id}</div>
                                <div id="qrcode" class="flex justify-center my-2"></div>
                                <div class="text-[9px] text-slate-400">Scan QR Code to Verify</div>
                            </div>
                        </div>

                        <!-- Services Grid -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                                <div>
                                    <h4 class="font-bold text-slate-800 text-lg mb-1">Request Certificate</h4>
                                    <p class="text-xs text-slate-500 mb-4">Request Barangay Clearance, Indigency, Residency, etc.</p>
                                </div>
                                <button onclick="promptRequestCert()" class="bg-blue-600 text-white py-2 rounded-xl text-sm font-semibold">Request Now</button>
                            </div>
                            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                                <div>
                                    <h4 class="font-bold text-slate-800 text-lg mb-1">Book Appointment</h4>
                                    <p class="text-xs text-slate-500 mb-4">Schedule consultation or official appointment.</p>
                                </div>
                                <button onclick="promptBookAppt()" class="bg-emerald-600 text-white py-2 rounded-xl text-sm font-semibold">Book Appointment</button>
                            </div>
                            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                                <div>
                                    <h4 class="font-bold text-slate-800 text-lg mb-1">Submit Complaint</h4>
                                    <p class="text-xs text-slate-500 mb-4">File community concerns or neighbor disputes.</p>
                                </div>
                                <button onclick="promptComplaint()" class="bg-amber-600 text-white py-2 rounded-xl text-sm font-semibold">File Complaint</button>
                            </div>
                        </div>
                    </main>
                </div>
            \`;

            // Load Resident Profile details for ID Card & QR code
            fetch('/api/resident/profile').then(res => res.json()).then(p => {
                document.getElementById('id-full-name').innerText = \`\\${p.first_name} \\${p.last_name}\`;
                if (p.photo) {
                    document.getElementById('id-photo-container').innerHTML = \`<img src="\${p.photo}" class="w-full h-full object-cover"/>\`;
                }
                // Generate QR Code pointing to verification URL
                const verifyUrl = window.location.origin + '/verify/' + p.resident_id;
                new QRCode(document.getElementById('qrcode'), {
                    text: verifyUrl,
                    width: 80,
                    height: 80
                });
            });
        }

        function logoutResident() {
            fetch('/api/logout', { method: 'POST' }).then(() => window.location.href = '/login');
        }

        function promptRequestCert() {
            const type = prompt('Select Certificate Type:\n1. Barangay Clearance\n2. Certificate of Residency\n3. Certificate of Indigency');
            if (!type) return;
            const purpose = prompt('State Purpose:');
            fetch('/api/resident/certificates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cert_type: type, purpose })
            }).then(res => res.json()).then(() => alert('Certificate request submitted successfully!'));
        }

        function promptBookAppt() {
            const service = prompt('Service Type (e.g. Consultation, Clearance Processing):');
            if (!service) return;
            const date = prompt('Appointment Date (YYYY-MM-DD):');
            const time = prompt('Appointment Time (e.g. 10:00 AM):');
            fetch('/api/resident/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ service_type: service, appointment_date: date, appointment_time: time, purpose: 'General' })
            }).then(() => alert('Appointment booked successfully!'));
        }

        function promptComplaint() {
            const subject = prompt('Complaint Subject:');
            if (!subject) return;
            const details = prompt('Complaint Details:');
            fetch('/api/resident/complaints', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject, details })
            }).then(() => alert('Complaint submitted successfully!'));
        }
    </script>
</body>
</html>`;
}

// Start Server
app.listen(PORT, () => {
    console.log(`Barangay Resident Management System running on port ${PORT}`);
});
