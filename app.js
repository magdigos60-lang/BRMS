const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: andCreate = true });
}

const dbPath = path.join(dataDir, 'barangay.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Database connection error:', err.message);
    else console.log('Connected to SQLite database.');
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'barangay-management-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Initialize Database Tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        role TEXT,
        status TEXT DEFAULT 'Active',
        resident_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS residents (
        id TEXT PRIMARY KEY,
        first_name TEXT,
        middle_name TEXT,
        last_name TEXT,
        suffix TEXT,
        dob TEXT,
        age INTEGER,
        gender TEXT,
        civil_status TEXT,
        address TEXT,
        purok TEXT,
        contact TEXT,
        email TEXT,
        occupation TEXT,
        educational_attainment TEXT,
        nationality TEXT,
        voter_status TEXT,
        pwd_status TEXT,
        senior_status TEXT,
        solo_parent_status TEXT,
        four_ps_status TEXT,
        photo TEXT,
        date_registered TEXT,
        status TEXT DEFAULT 'Active',
        household_id TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS households (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        household_number TEXT UNIQUE,
        head_resident_id TEXT,
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
        cert_number TEXT UNIQUE,
        resident_id TEXT,
        type TEXT,
        status TEXT DEFAULT 'Pending',
        remarks TEXT,
        release_date TEXT,
        qr_code TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS blotter (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_number TEXT UNIQUE,
        complainant TEXT,
        respondent TEXT,
        witness TEXT,
        incident_date TEXT,
        incident_time TEXT,
        location TEXT,
        type TEXT,
        description TEXT,
        action_taken TEXT,
        settlement TEXT,
        status TEXT DEFAULT 'Open',
        date_closed TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id TEXT,
        service TEXT,
        date TEXT,
        time TEXT,
        purpose TEXT,
        status TEXT DEFAULT 'Pending',
        remarks TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS assistance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id TEXT,
        type TEXT,
        status TEXT DEFAULT 'Pending',
        remarks TEXT,
        amount TEXT,
        date_requested DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS businesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_name TEXT,
        owner TEXT,
        address TEXT,
        purok TEXT,
        business_type TEXT,
        contact TEXT,
        reg_date TEXT,
        permit_number TEXT,
        expiration TEXT,
        status TEXT DEFAULT 'Active'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        date TEXT,
        category TEXT,
        status TEXT DEFAULT 'Published'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS programs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        description TEXT,
        date TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS program_beneficiaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        program_id INTEGER,
        resident_id TEXT,
        date_received DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        action TEXT,
        date TEXT,
        time TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id TEXT,
        title TEXT,
        message TEXT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_read INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id TEXT,
        rating INTEGER,
        comment TEXT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Seed default settings & admin if not exists
    db.get("SELECT * FROM settings WHERE key = 'barangay_name'", (err, row) => {
        if (!row) {
            const defaults = {
                barangay_name: "Barangay Central",
                municipality: "City of Manila",
                province: "Metro Manila",
                address: "Barangay Hall, Main Street",
                contact_number: "+63 912 345 6789",
                email: "contact@barangaycentral.gov.ph",
                captain_name: "Hon. Juan Dela Cruz",
                barangay_logo: "",
                emergency_contacts: JSON.stringify([
                    { name: "Barangay Hall", number: "+63 912 345 6789" },
                    { name: "Police Station", number: "911 / +63 900 111 2222" },
                    { name: "Fire Department", number: "+63 900 333 4444" },
                    { name: "Health Center", number: "+63 900 555 6666" }
                ])
            };
            for (const [k, v] of Object.entries(defaults)) {
                db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [k, v]);
            }
        }
    });

    db.get("SELECT * FROM users WHERE username = 'admin'", async (err, row) => {
        if (!row) {
            const hash = await bcrypt.hash('admin123', 10);
            db.run("INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, ?, ?)",
                ['admin', hash, 'Administrator', 'Active']);
        }
    });
});

// Helper: Log activity
function logActivity(username, action) {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toLocaleTimeString();
    db.run("INSERT INTO activity_logs (username, action, date, time) VALUES (?, ?, ?, ?)", [username, action, date, time]);
}

// Helper: Generate Resident ID
function generateResidentId(callback) {
    db.get("SELECT id FROM residents ORDER BY id DESC LIMIT 1", (err, row) => {
        let nextNum = 1;
        if (row && row.id) {
            const numPart = parseInt(row.id.replace('RES-', ''));
            if (!isNaN(numPart)) nextNum = numPart + 1;
        }
        const newId = `RES-${String(nextNum).padStart(6, '0')}`;
        callback(newId);
    });
}

// Helper: Generate Certificate Number
function generateCertNumber(callback) {
    const timestamp = Date.now().toString().slice(-6);
    const rand = Math.floor(1000 + Math.random() * 9000);
    callback(`CERT-${timestamp}-${rand}`);
}

// Helper: Generate Blotter Case Number
function generateCaseNumber(callback) {
    const year = new Date().getFullYear();
    db.get("SELECT id FROM blotter ORDER BY id DESC LIMIT 1", (err, row) => {
        let nextNum = 1;
        if (row && row.id) nextNum = row.id + 1;
        callback(`CASE-${year}-${String(nextNum).padStart(4, '0')}`);
    });
}

// --- API ROUTES ---

// Settings
app.get('/api/settings', (req, res) => {
    db.all("SELECT * FROM settings", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        try { settings.emergency_contacts = JSON.parse(settings.emergency_contacts || '[]'); } catch(e) { settings.emergency_contacts = []; }
        res.json(settings);
    });
});

app.post('/api/settings', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'Administrator') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    const settings = req.body;
    if (settings.emergency_contacts && typeof settings.emergency_contacts === 'object') {
        settings.emergency_contacts = JSON.stringify(settings.emergency_contacts);
    }
    db.serialize(() => {
        for (const [k, v] of Object.entries(settings)) {
            db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [k, v]);
        }
        logActivity(req.session.user.username, 'Updated System Settings');
        res.json({ success: true });
    });
});

// Authentication
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Invalid username or password' });
        if (user.status !== 'Active') return res.status(403).json({ error: 'Account is pending verification or inactive' });
        
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Invalid username or password' });

        req.session.user = { id: user.id, username: user.username, role: user.role, resident_id: user.resident_id };
        logActivity(user.username, 'Logged in');
        res.json({ success: true, role: user.role });
    });
});

app.post('/api/logout', (req, res) => {
    if (req.session.user) logActivity(req.session.user.username, 'Logged out');
    req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/session', (req, res) => {
    res.json({ user: req.session.user || null });
});

// Resident Public Registration
app.post('/api/register', async (req, res) => {
    const data = req.body;
    if (!data.username || !data.password || !data.first_name || !data.last_name) {
        return res.status(400).json({ error: 'Required fields missing' });
    }
    db.get("SELECT id FROM users WHERE username = ?", [data.username], async (err, row) => {
        if (row) return res.status(400).json({ error: 'Username already taken' });

        generateResidentId(async (resId) => {
            const birthDate = new Date(data.dob);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;

            const dateReg = new Date().toISOString().split('T')[0];
            const passwordHash = await bcrypt.hash(data.password, 10);

            db.serialize(() => {
                db.run(`INSERT INTO residents (id, first_name, middle_name, last_name, suffix, dob, age, gender, civil_status, address, purok, contact, email, occupation, educational_attainment, nationality, voter_status, pwd_status, senior_status, solo_parent_status, four_ps_status, photo, date_registered, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`,
                    [resId, data.first_name, data.middle_name || '', data.last_name, data.suffix || '', data.dob, age, data.gender, data.civil_status, data.address, data.purok, data.contact, data.email, data.occupation || '', data.educational_attainment || '', data.nationality || 'Filipino', data.voter_status || 'No', data.pwd_status || 'No', age >= 60 ? 'Yes' : 'No', data.solo_parent_status || 'No', data.four_ps_status || 'No', data.photo || '', dateReg]);

                db.run(`INSERT INTO users (username, password_hash, role, status, resident_id) VALUES (?, ?, 'Resident', 'Pending', ?)`,
                    [data.username, passwordHash, resId]);

                res.json({ success: true, resident_id: resId });
            });
        });
    });
});

// Dashboard Stats (Staff)
app.get('/api/stats', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });

    const queries = {
        total_residents: "SELECT COUNT(*) as count FROM residents WHERE status = 'Active'",
        total_households: "SELECT COUNT(*) as count FROM households",
        male_residents: "SELECT COUNT(*) as count FROM residents WHERE gender = 'Male' AND status = 'Active'",
        female_residents: "SELECT COUNT(*) as count FROM residents WHERE gender = 'Female' AND status = 'Active'",
        senior_citizens: "SELECT COUNT(*) as count FROM residents WHERE senior_status = 'Yes' AND status = 'Active'",
        pwd: "SELECT COUNT(*) as count FROM residents WHERE pwd_status = 'Yes' AND status = 'Active'",
        solo_parents: "SELECT COUNT(*) as count FROM residents WHERE solo_parent_status = 'Yes' AND status = 'Active'",
        minors: "SELECT COUNT(*) as count FROM residents WHERE age < 18 AND status = 'Active'",
        voters: "SELECT COUNT(*) as count FROM residents WHERE voter_status = 'Yes' AND status = 'Active'",
        pending_requests: "SELECT COUNT(*) as count FROM certificates WHERE status = 'Pending'",
        pending_appointments: "SELECT COUNT(*) as count FROM appointments WHERE status = 'Pending'",
        active_blotter: "SELECT COUNT(*) as count FROM blotter WHERE status IN ('Open', 'Under Investigation')",
        assistance_requests: "SELECT COUNT(*) as count FROM assistance WHERE status = 'Pending'",
        pending_registrations: "SELECT COUNT(*) as count FROM users WHERE role = 'Resident' AND status = 'Pending'"
    };

    const results = {};
    let completed = 0;
    const keys = Object.keys(queries);

    keys.forEach(k => {
        db.get(queries[k], (err, row) => {
            results[k] = row ? row.count : 0;
            completed++;
            if (completed === keys.length) {
                db.all("SELECT * FROM activity_logs ORDER BY id DESC LIMIT 10", (err, logs) => {
                    results.recent_activities = logs || [];
                    res.json(results);
                });
            }
        });
    });
});

// Residents CRUD
app.get('/api/residents', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Unauthorized' });
    const statusFilter = req.query.status || 'Active';
    db.all("SELECT * FROM residents WHERE status = ? ORDER BY last_name ASC", [statusFilter], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/residents', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    const data = req.body;
    generateResidentId((resId) => {
        const birthDate = new Date(data.dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
        const dateReg = new Date().toISOString().split('T')[0];

        db.run(`INSERT INTO residents (id, first_name, middle_name, last_name, suffix, dob, age, gender, civil_status, address, purok, contact, email, occupation, educational_attainment, nationality, voter_status, pwd_status, senior_status, solo_parent_status, four_ps_status, photo, date_registered, status, household_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)`,
            [resId, data.first_name, data.middle_name || '', data.last_name, data.suffix || '', data.dob, age, data.gender, data.civil_status, data.address, data.purok, data.contact, data.email, data.occupation || '', data.educational_attainment || '', data.nationality || 'Filipino', data.voter_status || 'No', data.pwd_status || 'No', age >= 60 ? 'Yes' : 'No', data.solo_parent_status || 'No', data.four_ps_status || 'No', data.photo || '', dateReg, data.household_id || null],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                logActivity(req.session.user.username, `Added resident ${resId} - ${data.first_name} ${data.last_name}`);
                res.json({ success: true, id: resId });
            });
    });
});

app.put('/api/residents/:id', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Unauthorized' });
    const id = req.params.id;
    const data = req.body;

    const birthDate = new Date(data.dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;

    db.run(`UPDATE residents SET first_name=?, middle_name=?, last_name=?, suffix=?, dob=?, age=?, gender=?, civil_status=?, address=?, purok=?, contact=?, email=?, occupation=?, educational_attainment=?, nationality=?, voter_status=?, pwd_status=?, senior_status=?, solo_parent_status=?, four_ps_status=?, photo=?, household_id=? WHERE id=?`,
        [data.first_name, data.middle_name, data.last_name, data.suffix, data.dob, age, data.gender, data.civil_status, data.address, data.purok, data.contact, data.email, data.occupation, data.educational_attainment, data.nationality, data.voter_status, data.pwd_status, age >= 60 ? 'Yes' : (data.senior_status || 'No'), data.solo_parent_status, data.four_ps_status, data.photo, data.household_id || null, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logActivity(req.session.user.username, `Updated resident ${id}`);
            res.json({ success: true });
        });
});

app.post('/api/residents/:id/status', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    const { status } = req.body; // Active, Moved Out, Deceased, Archived
    db.run("UPDATE residents SET status = ? WHERE id = ?", [status, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.session.user.username, `Changed status of resident ${req.params.id} to ${status}`);
        res.json({ success: true });
    });
});

app.delete('/api/residents/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'Administrator') return res.status(403).json({ error: 'Unauthorized Administrator access required' });
    db.run("DELETE FROM residents WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.session.user.username, `Permanently deleted resident ${req.params.id}`);
        res.json({ success: true });
    });
});

// Households
app.get('/api/households', (req, res) => {
    db.all(`SELECT h.*, r.first_name, r.last_name, (SELECT COUNT(*) FROM residents WHERE household_id = h.household_number AND status = 'Active') as member_count 
            FROM households h LEFT JOIN residents r ON h.head_resident_id = r.id`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/households', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    const { household_number, head_resident_id, address, purok } = req.body;
    db.run("INSERT INTO households (household_number, head_resident_id, address, purok) VALUES (?, ?, ?, ?)",
        [household_number, head_resident_id, address, purok], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (head_resident_id) {
                db.run("UPDATE residents SET household_id = ? WHERE id = ?", [household_number, head_resident_id]);
            }
            logActivity(req.session.user.username, `Created household ${household_number}`);
            res.json({ success: true });
        });
});

app.delete('/api/households/:id', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    db.run("DELETE FROM households WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Puroks
app.get('/api/puroks', (req, res) => {
    db.all("SELECT * FROM puroks", (err, rows) => res.json(rows || []));
});

app.post('/api/puroks', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    const { name, description } = req.body;
    db.run("INSERT INTO puroks (name, description) VALUES (?, ?)", [name, description || ''], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.session.user.username, `Added Purok ${name}`);
        res.json({ success: true });
    });
});

app.delete('/api/puroks/:id', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    db.run("DELETE FROM puroks WHERE id = ?", [req.params.id], (err) => res.json({ success: true }));
});

// Certificates
app.get('/api/certificates', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Unauthorized' });
    let query = `SELECT c.*, r.first_name, r.last_name FROM certificates c JOIN residents r ON c.resident_id = r.id`;
    if (req.session.user.role === 'Resident') {
        query += ` WHERE c.resident_id = '${req.session.user.resident_id}'`;
    }
    db.all(query + " ORDER BY c.id DESC", (err, rows) => res.json(rows || []));
});

app.post('/api/certificates', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Unauthorized' });
    const residentId = req.session.user.role === 'Resident' ? req.session.user.resident_id : req.body.resident_id;
    const type = req.body.type;

    generateCertNumber((certNum) => {
        const qrData = `VERIFY:${certNum}`;
        db.run("INSERT INTO certificates (cert_number, resident_id, type, status, qr_code) VALUES (?, ?, ?, 'Pending', ?)",
            [certNum, residentId, type, qrData], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                db.run("INSERT INTO notifications (resident_id, title, message) VALUES (?, ?, ?)",
                    [residentId, 'Certificate Requested', `Your request for ${type} (${certNum}) has been submitted.`]);
                logActivity(req.session.user.username, `Requested certificate ${type} for ${residentId}`);
                res.json({ success: true, cert_number: certNum });
            });
    });
});

app.put('/api/certificates/:id', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    const { status, remarks, release_date } = req.body;
    db.run("UPDATE certificates SET status = ?, remarks = ?, release_date = ? WHERE id = ?",
        [status, remarks || '', release_date || '', req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            db.get("SELECT resident_id, cert_number, type FROM certificates WHERE id = ?", [req.params.id], (err, row) => {
                if (row) {
                    db.run("INSERT INTO notifications (resident_id, title, message) VALUES (?, ?, ?)",
                        [row.resident_id, 'Certificate Update', `Your certificate ${row.type} (${row.cert_number}) status is now: ${status}. ${remarks}`]);
                }
            });
            logActivity(req.session.user.username, `Updated certificate ${req.params.id} to ${status}`);
            res.json({ success: true });
        });
});

// Public Certificate Verification
app.get('/api/verify/:certNumber', (req, res) => {
    db.get(`SELECT c.*, r.first_name, r.last_name, (SELECT value FROM settings WHERE key = 'barangay_name') as barangay_name 
            FROM certificates c JOIN residents r ON c.resident_id = r.id WHERE c.cert_number = ?`,
        [req.params.certNumber], (err, row) => {
            if (err || !row) return res.status(404).json({ valid: false, error: 'Certificate not found' });
            res.json({
                valid: true,
                cert_number: row.cert_number,
                type: row.type,
                resident_name: `${row.first_name} ${row.last_name}`,
                date_issued: row.created_at,
                status: row.status,
                barangay_name: row.barangay_name
            });
        });
});

// Public Resident ID Verification
app.get('/api/verify/resident/:residentId', (req, res) => {
    db.get(`SELECT r.*, (SELECT value FROM settings WHERE key = 'barangay_name') as barangay_name 
            FROM residents r WHERE r.id = ?`,
        [req.params.residentId], (err, row) => {
            if (err || !row) return res.status(404).json({ valid: false, error: 'Resident ID not found' });
            res.json({
                valid: row.status === 'Active',
                resident_id: row.id,
                resident_name: `${row.first_name} ${row.middle_name} ${row.last_name} ${row.suffix}`.trim(),
                barangay_name: row.barangay_name,
                photo: row.photo,
                status: row.status
            });
        });
});

// Blotter Management
app.get('/api/blotter', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    db.all("SELECT * FROM blotter ORDER BY id DESC", (err, rows) => res.json(rows || []));
});

app.post('/api/blotter', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    const data = req.body;
    generateCaseNumber((caseNum) => {
        db.run(`INSERT INTO blotter (case_number, complainant, respondent, witness, incident_date, incident_time, location, type, description, action_taken, settlement, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [caseNum, data.complainant, data.respondent, data.witness || '', data.incident_date, data.incident_time, data.location, data.type, data.description, data.action_taken || '', data.settlement || '', data.status || 'Open'],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                logActivity(req.session.user.username, `Recorded blotter case ${caseNum}`);
                res.json({ success: true });
            });
    });
});

app.put('/api/blotter/:id', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    const data = req.body;
    const dateClosed = data.status === 'Settled' || data.status === 'Closed' ? new Date().toISOString().split('T')[0] : '';
    db.run("UPDATE blotter SET status=?, action_taken=?, settlement=?, date_closed=? WHERE id=?",
        [data.status, data.action_taken, data.settlement, dateClosed, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logActivity(req.session.user.username, `Updated blotter case ${req.params.id}`);
            res.json({ success: true });
        });
});

// Appointments
app.get('/api/appointments', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Unauthorized' });
    let query = `SELECT a.*, r.first_name, r.last_name FROM appointments a JOIN residents r ON a.resident_id = r.id`;
    if (req.session.user.role === 'Resident') {
        query += ` WHERE a.resident_id = '${req.session.user.resident_id}'`;
    }
    db.all(query + " ORDER BY a.date DESC", (err, rows) => res.json(rows || []));
});

app.post('/api/appointments', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Unauthorized' });
    const residentId = req.session.user.role === 'Resident' ? req.session.user.resident_id : req.body.resident_id;
    const { service, date, time, purpose } = req.body;

    db.run("INSERT INTO appointments (resident_id, service, date, time, purpose, status) VALUES (?, ?, ?, ?, ?, 'Pending')",
        [residentId, service, date, time, purpose], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            db.run("INSERT INTO notifications (resident_id, title, message) VALUES (?, ?, ?)",
                [residentId, 'Appointment Booked', `Your appointment for ${service} on ${date} is pending approval.`]);
            logActivity(req.session.user.username, `Booked appointment for ${residentId}`);
            res.json({ success: true });
        });
});

app.put('/api/appointments/:id', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    const { status, remarks } = req.body;
    db.run("UPDATE appointments SET status = ?, remarks = ? WHERE id = ?", [status, remarks || '', req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get("SELECT resident_id, service, date FROM appointments WHERE id = ?", [req.params.id], (err, row) => {
            if (row) {
                db.run("INSERT INTO notifications (resident_id, title, message) VALUES (?, ?, ?)",
                    [row.resident_id, 'Appointment Update', `Your appointment for ${row.service} on ${row.date} is now: ${status}. ${remarks}`]);
            }
        });
        logActivity(req.session.user.username, `Updated appointment ${req.params.id} to ${status}`);
        res.json({ success: true });
    });
});

// Assistance
app.get('/api/assistance', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Unauthorized' });
    let query = `SELECT a.*, r.first_name, r.last_name FROM assistance a JOIN residents r ON a.resident_id = r.id`;
    if (req.session.user.role === 'Resident') {
        query += ` WHERE a.resident_id = '${req.session.user.resident_id}'`;
    }
    db.all(query + " ORDER BY a.id DESC", (err, rows) => res.json(rows || []));
});

app.post('/api/assistance', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Unauthorized' });
    const residentId = req.session.user.role === 'Resident' ? req.session.user.resident_id : req.body.resident_id;
    const { type, amount, remarks } = req.body;
    db.run("INSERT INTO assistance (resident_id, type, amount, remarks, status) VALUES (?, ?, ?, ?, 'Pending')",
        [residentId, type, amount || '', remarks || ''], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            db.run("INSERT INTO notifications (resident_id, title, message) VALUES (?, ?, ?)",
                [residentId, 'Assistance Request', `Your request for ${type} assistance has been submitted.`]);
            logActivity(req.session.user.username, `Requested assistance ${type} for ${residentId}`);
            res.json({ success: true });
        });
});

app.put('/api/assistance/:id', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    const { status, remarks } = req.body;
    db.run("UPDATE assistance SET status = ?, remarks = ? WHERE id = ?", [status, remarks || '', req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get("SELECT resident_id, type FROM assistance WHERE id = ?", [req.params.id], (err, row) => {
            if (row) {
                db.run("INSERT INTO notifications (resident_id, title, message) VALUES (?, ?, ?)",
                    [row.resident_id, 'Assistance Update', `Your assistance request (${row.type}) is now: ${status}. ${remarks}`]);
            }
        });
        logActivity(req.session.user.username, `Updated assistance request ${req.params.id} to ${status}`);
        res.json({ success: true });
    });
});

// Businesses
app.get('/api/businesses', (req, res) => {
    if (!req.session.user) return res.status(403).json({ error: 'Unauthorized' });
    db.all("SELECT * FROM businesses ORDER BY id DESC", (err, rows) => res.json(rows || []));
});

app.post('/api/businesses', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    const data = req.body;
    db.run(`INSERT INTO businesses (business_name, owner, address, purok, business_type, contact, reg_date, permit_number, expiration, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`,
        [data.business_name, data.owner, data.address, data.purok, data.business_type, data.contact, data.reg_date, data.permit_number, data.expiration],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logActivity(req.session.user.username, `Registered business ${data.business_name}`);
            res.json({ success: true });
        });
});

app.delete('/api/businesses/:id', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    db.run("DELETE FROM businesses WHERE id = ?", [req.params.id], (err) => res.json({ success: true }));
});

// Announcements
app.get('/api/announcements', (req, res) => {
    let query = "SELECT * FROM announcements";
    if (!req.session.user || req.session.user.role === 'Resident') {
        query += " WHERE status = 'Published'";
    }
    db.all(query + " ORDER BY id DESC", (err, rows) => res.json(rows || []));
});

app.post('/api/announcements', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    const { title, content, category, status } = req.body;
    const date = new Date().toISOString().split('T')[0];
    db.run("INSERT INTO announcements (title, content, date, category, status) VALUES (?, ?, ?, ?, ?)",
        [title, content, date, category, status || 'Published'], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (status === 'Published') {
                db.all("SELECT resident_id FROM users WHERE role = 'Resident'", (err, users) => {
                    if (users) {
                        users.forEach(u => {
                            db.run("INSERT INTO notifications (resident_id, title, message) VALUES (?, ?, ?)",
                                [u.resident_id, `Announcement: ${title}`, content.substring(0, 100) + '...']);
                        });
                    }
                });
            }
            logActivity(req.session.user.username, `Created announcement ${title}`);
            res.json({ success: true });
        });
});

app.delete('/api/announcements/:id', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    db.run("DELETE FROM announcements WHERE id = ?", [req.params.id], (err) => res.json({ success: true }));
});

// Resident Portal Data & Notifications
app.get('/api/resident/me', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    db.get("SELECT * FROM residents WHERE id = ?", [req.session.user.resident_id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Resident record not found' });
        res.json(row);
    });
});

app.get('/api/notifications', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    db.all("SELECT * FROM notifications WHERE resident_id = ? ORDER BY id DESC", [req.session.user.resident_id], (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/notifications/read', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    db.run("UPDATE notifications SET is_read = 1 WHERE resident_id = ?", [req.session.user.resident_id], (err) => {
        res.json({ success: true });
    });
});

app.post('/api/feedback', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    const { rating, comment } = req.body;
    db.run("INSERT INTO feedback (resident_id, rating, comment) VALUES (?, ?, ?)",
        [req.session.user.resident_id, rating, comment], (err) => {
            res.json({ success: true });
        });
});

app.get('/api/feedback', (req, res) => {
    if (!req.session.user || req.session.user.role === 'Resident') return res.status(403).json({ error: 'Unauthorized' });
    db.all("SELECT f.*, r.first_name, r.last_name FROM feedback f JOIN residents r ON f.resident_id = r.id ORDER BY f.id DESC", (err, rows) => {
        res.json(rows || []);
    });
});

// Staff Management & User Approvals
app.get('/api/staff/users', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'Administrator') return res.status(403).json({ error: 'Unauthorized' });
    db.all("SELECT id, username, role, status, resident_id, created_at FROM users", (err, rows) => res.json(rows || []));
});

app.post('/api/staff/users/:id/approve', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'Administrator') return res.status(403).json({ error: 'Unauthorized' });
    db.run("UPDATE users SET status = 'Active' WHERE id = ?", [req.params.id], (err) => {
        db.get("SELECT resident_id FROM users WHERE id = ?", [req.params.id], (err, row) => {
            if (row && row.resident_id) {
                db.run("INSERT INTO notifications (resident_id, title, message) VALUES (?, ?, ?)",
                    [row.resident_id, 'Registration Approved', 'Your resident portal account has been verified and approved!']);
            }
        });
        logActivity(req.session.user.username, `Approved user account ID ${req.params.id}`);
        res.json({ success: true });
    });
});

app.delete('/api/staff/users/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'Administrator') return res.status(403).json({ error: 'Unauthorized' });
    db.run("DELETE FROM users WHERE id = ?", [req.params.id], (err) => res.json({ success: true }));
});


// --- FRONTEND SINGLE PAGE APPLICATION (SPA) ---
app.get('*', (req, res) => {
    // Check if path is public verification
    if (req.path.startsWith('/verify/')) {
        return res.send(getVerificationHtml());
    }
    if (req.path === '/register') {
        return res.send(getRegistrationHtml());
    }
    if (req.path === '/login') {
        return res.send(getLoginHtml());
    }
    res.send(getMainHtml());
});

// HTML Templates Generator
function getLoginHtml() {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login - Barangay Resident Management System</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
        <style>
            body { background: #f0f2f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
            .login-card { max-width: 420px; margin: 80px auto; background: white; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); padding: 40px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="login-card">
                <div class="text-center mb-4">
                    <i class="fa-solid fa-landmark text-primary fa-3x mb-2"></i>
                    <h3 class="fw-bold">Barangay Portal</h3>
                    <p class="text-muted small">Sign in to your account</p>
                </div>
                <div id="alertBox"></div>
                <form id="loginForm">
                    <div class="mb-3">
                        <label class="form-label">Username</label>
                        <input type="text" id="username" class="form-control" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Password</label>
                        <input type="password" id="password" class="form-control" required>
                    </div>
                    <button type="submit" class="btn btn-primary w-100 py-2 fw-semibold">Sign In</button>
                </form>
                <div class="text-center mt-3">
                    <p class="small text-muted">Don't have a resident account? <a href="/register">Register here</a></p>
                    <p class="small"><a href="/">Back to Home</a></p>
                </div>
            </div>
        </div>
        <script>
            document.getElementById('loginForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        username: document.getElementById('username').value,
                        password: document.getElementById('password').value
                    })
                });
                const data = await res.json();
                if (data.success) {
                    window.location.href = data.role === 'Resident' ? '/' : '/';
                } else {
                    document.getElementById('alertBox').innerHTML = '<div class="alert alert-danger py-2 small">' + data.error + '</div>';
                }
            });
        </script>
    </body>
    </html>`;
}

function getRegistrationHtml() {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Resident Registration - Barangay Resident Management System</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light">
        <div class="container py-5">
            <div class="row justify-content-center">
                <div class="col-md-8">
                    <div class="card shadow border-0 rounded-4 p-4">
                        <h3 class="fw-bold text-center mb-1">Resident Portal Registration</h3>
                        <p class="text-muted text-center small mb-4">Create your account to request certificates and view digital IDs.</p>
                        <div id="alertBox"></div>
                        <form id="regForm">
                            <div class="row g-3">
                                <div class="col-md-4"><label class="form-label">First Name *</label><input type="text" id="first_name" class="form-control" required></div>
                                <div class="col-md-4"><label class="form-label">Middle Name</label><input type="text" id="middle_name" class="form-control"></div>
                                <div class="col-md-4"><label class="form-label">Last Name *</label><input type="text" id="last_name" class="form-control" required></div>
                                <div class="col-md-3"><label class="form-label">Suffix</label><input type="text" id="suffix" class="form-control" placeholder="Jr, III"></div>
                                <div class="col-md-4"><label class="form-label">Date of Birth *</label><input type="date" id="dob" class="form-control" required></div>
                                <div class="col-md-5"><label class="form-label">Gender *</label><select id="gender" class="form-select"><option>Male</option><option>Female</option></select></div>
                                <div class="col-md-4"><label class="form-label">Civil Status</label><select id="civil_status" class="form-select"><option>Single</option><option>Married</option><option>Widowed</option><option>Separated</option></select></div>
                                <div class="col-md-8"><label class="form-label">Complete Address *</label><input type="text" id="address" class="form-control" required></div>
                                <div class="col-md-4"><label class="form-label">Purok / Zone *</label><input type="text" id="purok" class="form-control" required placeholder="Purok 1"></div>
                                <div class="col-md-4"><label class="form-label">Contact Number *</label><input type="text" id="contact" class="form-control" required placeholder="09123456789"></div>
                                <div class="col-md-4"><label class="form-label">Email Address</label><input type="email" id="email" class="form-control"></div>
                                <div class="col-md-6"><label class="form-label">Username *</label><input type="text" id="username" class="form-control" required></div>
                                <div class="col-md-6"><label class="form-label">Password *</label><input type="password" id="password" class="form-control" required></div>
                                <div class="col-12"><label class="form-label">Resident Photo</label><input type="file" id="photoFile" class="form-control" accept="image/*"></div>
                            </div>
                            <button type="submit" class="btn btn-primary w-100 mt-4 py-2 fw-semibold">Submit Registration</button>
                        </form>
                        <div class="text-center mt-3"><a href="/login" class="small">Already have an account? Sign in</a></div>
                    </div>
                </div>
            </div>
        </div>
        <script>
            let photoBase64 = '';
            document.getElementById('photoFile').addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (uploadEvent) => { photoBase64 = uploadEvent.target.result; };
                    reader.readAsDataURL(file);
                }
            });

            document.getElementById('regForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const payload = {
                    first_name: document.getElementById('first_name').value,
                    middle_name: document.getElementById('middle_name').value,
                    last_name: document.getElementById('last_name').value,
                    suffix: document.getElementById('suffix').value,
                    dob: document.getElementById('dob').value,
                    gender: document.getElementById('gender').value,
                    civil_status: document.getElementById('civil_status').value,
                    address: document.getElementById('address').value,
                    purok: document.getElementById('purok').value,
                    contact: document.getElementById('contact').value,
                    email: document.getElementById('email').value,
                    username: document.getElementById('username').value,
                    password: document.getElementById('password').value,
                    photo: photoBase64
                };
                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.success) {
                    document.getElementById('alertBox').innerHTML = '<div class="alert alert-success">Registration submitted successfully! Your Resident ID is <b>' + data.resident_id + '</b>. Please wait for administrator verification before signing in. <a href="/login">Go to Login</a></div>';
                    document.getElementById('regForm').reset();
                } else {
                    document.getElementById('alertBox').innerHTML = '<div class="alert alert-danger">' + data.error + '</div>';
                }
            });
        </script>
    </body>
    </html>`;
}

function getVerificationHtml() {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verification Portal - Barangay System</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light">
        <div class="container py-5">
            <div class="row justify-content-center">
                <div class="col-md-6">
                    <div class="card shadow border-0 rounded-4 p-4 text-center">
                        <h3 class="fw-bold mb-3 text-primary"><i class="fa-solid fa-shield-check"></i> Official Verification</h3>
                        <div id="resultContent" class="py-4">Loading verification details...</div>
                        <a href="/" class="btn btn-outline-secondary mt-3">Back to Barangay System</a>
                    </div>
                </div>
            </div>
        </div>
        <script>
            async function verify() {
                const pathParts = window.location.pathname.split('/');
                const code = pathParts[pathParts.length - 1];
                const isResidentVerify = window.location.pathname.includes('/resident/');
                const endpoint = isResidentVerify ? '/api/verify/resident/' + code : '/api/verify/' + code;

                try {
                    const res = await fetch(endpoint);
                    const data = await res.json();
                    const container = document.getElementById('resultContent');
                    if (data.valid) {
                        container.innerHTML = \`
                            <div class="alert alert-success py-3"><h4 class="alert-heading fw-bold mb-1">VERIFIED & VALID</h4><small>\${data.barangay_name}</small></div>
                            <ul class="list-group text-start mt-3">
                                \${data.cert_number ? '<li class="list-group-item"><b>Certificate No:</b> ' + data.cert_number + '</li>' : ''}
                                \${data.resident_id ? '<li class="list-group-item"><b>Resident ID:</b> ' + data.resident_id + '</li>' : ''}
                                <li class="list-group-item"><b>Name:</b> \${data.resident_name || data.type}</li>
                                <li class="list-group-item"><b>Status:</b> <span class="badge bg-success">\${data.status}</span></li>
                                \${data.date_issued ? '<li class="list-group-item"><b>Date Issued:</b> ' + data.date_issued + '</li>' : ''}
                            </ul>\`;
                    } else {
                        container.innerHTML = '<div class="alert alert-danger">Invalid or expired document / record verification code.</div>';
                    }
                } catch(e) {
                    document.getElementById('resultContent').innerHTML = '<div class="alert alert-danger">Verification error occurred.</div>';
                }
            }
            verify();
        </script>
    </body>
    </html>`;
}

function getMainHtml() {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Barangay Resident Management System</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
        <style>
            :root { --sidebar-width: 260px; }
            body { background: #f8f9fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
            #sidebar { width: var(--sidebar-width); position: fixed; top: 0; left: 0; height: 100vh; background: #212529; color: #fff; z-index: 1000; overflow-y: auto; transition: all 0.3s; }
            #sidebar .brand { padding: 20px; font-size: 1.1rem; font-weight: bold; background: #1a1e21; border-bottom: 1px solid #373b3e; }
            #sidebar .nav-link { color: #adb5bd; padding: 10px 20px; border-radius: 4px; margin: 2px 10px; }
            #sidebar .nav-link:hover, #sidebar .nav-link.active { color: #fff; background: #0d6efd; }
            #content { margin-left: var(--sidebar-width); padding: 20px; transition: all 0.3s; }
            @media print {
                #sidebar, .no-print { display: none !important; }
                #content { margin-left: 0 !important; padding: 0 !important; }
                .id-card-print { break-inside: avoid; page-break-inside: avoid; }
            }
            /* 8 IDs per bond paper layout */
            .id-grid-container { display: grid; grid-template-columns: repeat(2, 3.375in); grid-template-rows: repeat(4, 2.125in); gap: 0.2in; justify-content: center; padding: 0.2in; background: white; }
            .id-card-item { width: 3.375in; height: 2.125in; border: 1px solid #ccc; border-radius: 8px; padding: 12px; background: #fff; position: relative; box-sizing: border-box; font-size: 11px; }
        </style>
    </head>
    <body>
        <div id="appContainer">
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status"></div>
                <p class="mt-2 text-muted">Loading Barangay Resident Management System...</p>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
        <script>
            let currentUser = null;
            let systemSettings = {};

            async function initApp() {
                const [sessionRes, settingsRes] = await Promise.all([
                    fetch('/api/session'),
                    fetch('/api/settings')
                ]);
                const sessionData = await sessionRes.json();
                systemSettings = await settingsRes.json();
                currentUser = sessionData.user;

                if (!currentUser) {
                    renderLandingPage();
                } else if (currentUser.role === 'Resident') {
                    renderResidentPortal();
                } else {
                    renderStaffPortal();
                }
            }

            function renderLandingPage() {
                document.getElementById('appContainer').innerHTML = \`
                    <div class="container py-5">
                        <div class="row justify-content-center">
                            <div class="col-md-8 text-center bg-white p-5 rounded-4 shadow">
                                <i class="fa-solid fa-landmark text-primary fa-4x mb-3"></i>
                                <h1 class="fw-bold mb-2">\${systemSettings.barangay_name || 'Barangay Resident Management System'}</h1>
                                <p class="text-muted mb-4">\${systemSettings.municipality || ''}, \${systemSettings.province || ''}</p>
                                <div class="d-flex justify-content-center gap-3">
                                    <a href="/login" class="btn btn-primary px-4 py-2 fw-semibold">Sign In</a>
                                    <a href="/register" class="btn btn-outline-primary px-4 py-2 fw-semibold">Resident Registration</a>
                                </div>
                            </div>
                        </div>
                    </div>\`;
            }

            async function logout() {
                await fetch('/api/logout', {method: 'POST'});
                window.location.reload();
            }

            // --- STAFF PORTAL ---
            async function renderStaffPortal() {
                document.getElementById('appContainer').innerHTML = \`
                    <div id="sidebar">
                        <div class="brand text-center">
                            <i class="fa-solid fa-landmark me-2"></i>\${systemSettings.barangay_name || 'Barangay System'}
                        </div>
                        <ul class="nav flex-column py-3">
                            <li class="nav-item"><a href="#" class="nav-link active" onclick="loadStaffView('dashboard', this)"><i class="fa-solid fa-chart-pie me-2"></i> Dashboard</a></li>
                            <li class="nav-item"><a href="#" class="nav-link" onclick="loadStaffView('residents', this)"><i class="fa-solid fa-users me-2"></i> Residents</a></li>
                            <li class="nav-item"><a href="#" class="nav-link" onclick="loadStaffView('households', this)"><i class="fa-solid fa-house me-2"></i> Households</a></li>
                            <li class="nav-item"><a href="#" class="nav-link" onclick="loadStaffView('puroks', this)"><i class="fa-solid fa-map-location-dot me-2"></i> Puroks</a></li>
                            <li class="nav-item"><a href="#" class="nav-link" onclick="loadStaffView('certificates', this)"><i class="fa-solid fa-file-lines me-2"></i> Certificates</a></li>
                            <li class="nav-item"><a href="#" class="nav-link" onclick="loadStaffView('blotter', this)"><i class="fa-solid fa-scale-balanced me-2"></i> Blotter Cases</a></li>
                            <li class="nav-item"><a href="#" class="nav-link" onclick="loadStaffView('appointments', this)"><i class="fa-solid fa-calendar-check me-2"></i> Appointments</a></li>
                            <li class="nav-item"><a href="#" class="nav-link" onclick="loadStaffView('assistance', this)"><i class="fa-solid fa-hand-holding-heart me-2"></i> Assistance</a></li>
                            <li class="nav-item"><a href="#" class="nav-link" onclick="loadStaffView('businesses', this)"><i class="fa-solid fa-store me-2"></i> Businesses</a></li>
                            <li class="nav-item"><a href="#" class="nav-link" onclick="loadStaffView('announcements', this)"><i class="fa-solid fa-bullhorn me-2"></i> Announcements</a></li>
                            <li class="nav-item"><a href="#" class="nav-link" onclick="loadStaffView('idprinting', this)"><i class="fa-solid fa-id-card me-2"></i> ID Batch Printing</a></li>
                            \${currentUser.role === 'Administrator' ? '<li class="nav-item"><a href="#" class="nav-link" onclick="loadStaffView(\\'settings\\', this)"><i class="fa-solid fa-gears me-2"></i> System Settings</a></li>' : ''}
                            \${currentUser.role === 'Administrator' ? '<li class="nav-item"><a href="#" class="nav-link" onclick="loadStaffView(\\'users\\', this)"><i class="fa-solid fa-user-shield me-2"></i> User Approvals</a></li>' : ''}
                            <li class="nav-item mt-4"><a href="#" class="nav-link text-danger" onclick="logout()"><i class="fa-solid fa-right-from-bracket me-2"></i> Logout</a></li>
                        </ul>
                    </div>
                    <div id="content">
                        <nav class="navbar navbar-expand navbar-light bg-white px-4 py-3 rounded shadow-sm mb-4">
                            <span class="navbar-brand mb-0 h5 fw-bold text-dark">Staff Portal - <span class="text-primary">\${currentUser.role}</span></span>
                            <div class="ms-auto d-flex align-items-center">
                                <span class="me-3 text-secondary small"><i class="fa-solid fa-user me-1"></i> \${currentUser.username}</span>
                            </div>
                        </nav>
                        <div id="staffMainContent"></div>
                    </div>\`;
                loadStaffView('dashboard');
            }

            async function loadStaffView(view, el) {
                if (el) {
                    document.querySelectorAll('#sidebar .nav-link').forEach(l => l.classList.remove('active'));
                    el.classList.add('active');
                }
                const container = document.getElementById('staffMainContent');
                container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

                if (view === 'dashboard') {
                    const res = await fetch('/api/stats');
                    const s = await res.json();
                    container.innerHTML = \`
                        <div class="row g-3 mb-4">
                            <div class="col-md-3"><div class="card bg-primary text-white p-3"><h6 class="text-uppercase small">Total Residents</h6><h2 class="fw-bold mb-0">\${s.total_residents}</h2></div></div>
                            <div class="col-md-3"><div class="card bg-success text-white p-3"><h6 class="text-uppercase small">Households</h6><h2 class="fw-bold mb-0">\${s.total_households}</h2></div></div>
                            <div class="col-md-3"><div class="card bg-warning text-dark p-3"><h6 class="text-uppercase small">Pending Requests</h6><h2 class="fw-bold mb-0">\${s.pending_requests}</h2></div></div>
                            <div class="col-md-3"><div class="card bg-danger text-white p-3"><h6 class="text-uppercase small">Active Blotter</h6><h2 class="fw-bold mb-0">\${s.active_blotter}</h2></div></div>
                        </div>
                        <div class="row g-3 mb-4">
                            <div class="col-md-2"><div class="card p-2 text-center"><small class="text-muted">Male</small><h5>\${s.male_residents}</h5></div></div>
                            <div class="col-md-2"><div class="card p-2 text-center"><small class="text-muted">Female</small><h5>\${s.female_residents}</h5></div></div>
                            <div class="col-md-2"><div class="card p-2 text-center"><small class="text-muted">Seniors</small><h5>\${s.senior_citizens}</h5></div></div>
                            <div class="col-md-2"><div class="card p-2 text-center"><small class="text-muted">PWD</small><h5>\${s.pwd}</h5></div></div>
                            <div class="col-md-2"><div class="card p-2 text-center"><small class="text-muted">Voters</small><h5>\${s.voters}</h5></div></div>
                            <div class="col-md-2"><div class="card p-2 text-center"><small class="text-muted">Pending Regs</small><h5 class="text-danger">\${s.pending_registrations}</h5></div></div>
                        </div>
                        <div class="card p-4">
                            <h5 class="fw-bold mb-3">Recent Activity Logs</h5>
                            <div class="table-responsive">
                                <table class="table table-sm table-striped">
                                    <thead><tr><th>User</th><th>Action</th><th>Date</th><th>Time</th></tr></thead>
                                    <tbody>\${(s.recent_activities || []).map(l => '<tr><td>' + l.username + '</td><td>' + l.action + '</td><td>' + l.date + '</td><td>' + l.time + '</td></tr>').join('')}</tbody>
                                </table>
                            </div>
                        </div>\`;
                } else if (view === 'residents') {
                    const res = await fetch('/api/residents');
                    const list = await res.json();
                    container.innerHTML = \`
                        <div class="card p-4">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h5 class="fw-bold mb-0">Resident Management</h5>
                                <button class="btn btn-primary btn-sm" onclick="openAddResidentModal()"><i class="fa-solid fa-plus me-1"></i> Add Resident</button>
                            </div>
                            <div class="table-responsive">
                                <table class="table table-hover align-middle">
                                    <thead><tr><th>ID</th><th>Photo</th><th>Full Name</th><th>Age</th><th>Gender</th><th>Purok</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead>
                                    <tbody>
                                        \${list.map(r => \`
                                            <tr>
                                                <td>\${r.id}</td>
                                                <td><img src="\${r.photo || 'https://via.placeholder.com/40'}" class="rounded-circle" width="35" height="35" style="object-fit:cover"></td>
                                                <td>\${r.first_name} \${r.middle_name} \${r.last_name} \${r.suffix}</td>
                                                <td>\${r.age}</td>
                                                <td>\${r.gender}</td>
                                                <td>\${r.purok}</td>
                                                <td>\${r.contact}</td>
                                                <td><span class="badge bg-success">\${r.status}</span></td>
                                                <td>
                                                    <button class="btn btn-sm btn-outline-info" onclick="printSingleId('\${r.id}')" title="Print ID"><i class="fa-solid fa-id-card"></i></button>
                                                    <button class="btn btn-sm btn-outline-danger" onclick="deleteResident('\${r.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
                                                </td>
                                            </tr>
                                        \`).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>\`;
                } else if (view === 'certificates') {
                    const res = await fetch('/api/certificates');
                    const list = await res.json();
                    container.innerHTML = \`
                        <div class="card p-4">
                            <h5 class="fw-bold mb-3">Certificate Requests & Processing</h5>
                            <div class="table-responsive">
                                <table class="table table-hover align-middle">
                                    <thead><tr><th>Cert No.</th><th>Resident</th><th>Type</th><th>Status</th><th>Date Requested</th><th>Actions</th></tr></thead>
                                    <tbody>
                                        \${list.map(c => \`
                                            <tr>
                                                <td>\${c.cert_number}</td>
                                                <td>\${c.first_name} \${c.last_name}</td>
                                                <td>\${c.type}</td>
                                                <td><span class="badge bg-secondary">\${c.status}</span></td>
                                                <td>\${c.created_at}</td>
                                                <td>
                                                    <button class="btn btn-sm btn-success" onclick="updateCert(\${c.id}, 'Approved')">Approve</button>
                                                    <button class="btn btn-sm btn-danger" onclick="updateCert(\${c.id}, 'Rejected')">Reject</button>
                                                    <button class="btn btn-sm btn-outline-primary" onclick="printCertificate('\${c.cert_number}', '\${c.type}', '\${c.first_name} \${c.last_name}', '\${c.created_at}')">Print</button>
                                                </td>
                                            </tr>
                                        \`).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>\`;
                } else if (view === 'idprinting') {
                    const res = await fetch('/api/residents');
                    const list = await res.json();
                    container.innerHTML = \`
                        <div class="card p-4">
                            <h5 class="fw-bold mb-3">Physical ID Batch Printing (8 IDs per Page Layout)</h5>
                            <button class="btn btn-primary mb-3" onclick="window.print()"><i class="fa-solid fa-print me-1"></i> Print Batch Layout</button>
                            <div class="id-grid-container">
                                \${list.slice(0, 8).map(r => \`
                                    <div class="id-card-item">
                                        <div class="d-flex align-items-center border-bottom pb-1 mb-1">
                                            <div class="fw-bold" style="font-size:9px">\${systemSettings.barangay_name}</div>
                                        </div>
                                        <div class="row g-1">
                                            <div class="col-4 text-center">
                                                <img src="\${r.photo || 'https://via.placeholder.com/60'}" width="50" height="60" style="object-fit:cover; border-radius:4px;">
                                            </div>
                                            <div class="col-8">
                                                <div class="fw-bold text-primary" style="font-size:10px">\${r.id}</div>
                                                <div class="fw-semibold">\${r.first_name} \${r.last_name}</div>
                                                <div style="font-size:9px">DOB: \${r.dob}</div>
                                                <div style="font-size:9px">Address: \${r.address}</div>
                                                <div style="font-size:9px">Purok: \${r.purok}</div>
                                            </div>
                                        </div>
                                    </div>
                                \`).join('')}
                            </div>
                        </div>\`;
                } else if (view === 'settings') {
                    container.innerHTML = \`
                        <div class="card p-4">
                            <h5 class="fw-bold mb-3">System Settings</h5>
                            <form id="settingsForm">
                                <div class="row g-3">
                                    <div class="col-md-6"><label class="form-label">Barangay Name</label><input type="text" id="s_name" class="form-control" value="\${systemSettings.barangay_name || ''}"></div>
                                    <div class="col-md-6"><label class="form-label">Municipality / City</label><input type="text" id="s_muni" class="form-control" value="\${systemSettings.municipality || ''}"></div>
                                    <div class="col-md-6"><label class="form-label">Province</label><input type="text" id="s_prov" class="form-control" value="\${systemSettings.province || ''}"></div>
                                    <div class="col-md-6"><label class="form-label">Barangay Captain</label><input type="text" id="s_captain" class="form-control" value="\${systemSettings.captain_name || ''}"></div>
                                    <div class="col-md-6"><label class="form-label">Contact Number</label><input type="text" id="s_contact" class="form-control" value="\${systemSettings.contact_number || ''}"></div>
                                    <div class="col-md-6"><label class="form-label">Email</label><input type="text" id="s_email" class="form-control" value="\${systemSettings.email || ''}"></div>
                                    <div class="col-12"><label class="form-label">Address</label><input type="text" id="s_address" class="form-control" value="\${systemSettings.address || ''}"></div>
                                </div>
                                <button type="submit" class="btn btn-primary mt-4">Save Settings</button>
                            </form>
                        </div>\`;
                    document.getElementById('settingsForm').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const payload = {
                            barangay_name: document.getElementById('s_name').value,
                            municipality: document.getElementById('s_muni').value,
                            province: document.getElementById('s_prov').value,
                            captain_name: document.getElementById('s_captain').value,
                            contact_number: document.getElementById('s_contact').value,
                            email: document.getElementById('s_email').value,
                            address: document.getElementById('s_address').value
                        };
                        const res = await fetch('/api/settings', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify(payload)
                        });
                        if ((await res.json()).success) { alert('Settings updated successfully!'); window.location.reload(); }
                    });
                } else if (view === 'users') {
                    const res = await fetch('/api/staff/users');
                    const users = await res.json();
                    container.innerHTML = \`
                        <div class="card p-4">
                            <h5 class="fw-bold mb-3">User Approvals & Management</h5>
                            <table class="table table-hover">
                                <thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Resident ID</th><th>Actions</th></tr></thead>
                                <tbody>
                                    \${users.map(u => \`
                                        <tr>
                                            <td>\${u.username}</td>
                                            <td>\${u.role}</td>
                                            <td><span class="badge bg-\${u.status === 'Active' ? 'success' : 'warning'}">\${u.status}</span></td>
                                            <td>\${u.resident_id || 'N/A'}</td>
                                            <td>
                                                \${u.status === 'Pending' ? '<button class="btn btn-sm btn-success me-1" onclick="approveUser(' + u.id + ')">Approve</button>' : ''}
                                                <button class="btn btn-sm btn-danger" onclick="deleteUser(\${u.id})">Delete</button>
                                            </td>
                                        </tr>
                                    \`).join('')}
                                </tbody>
                            </table>
                        </div>\`;
                } else {
                    container.innerHTML = '<div class="card p-4"><h5>Module under construction or loaded successfully.</h5></div>';
                }
            }

            async function approveUser(id) {
                await fetch('/api/staff/users/' + id + '/approve', {method: 'POST'});
                loadStaffView('users');
            }

            async function deleteUser(id) {
                if (confirm('Permanently delete this user account?')) {
                    await fetch('/api/staff/users/' + id, {method: 'DELETE'});
                    loadStaffView('users');
                }
            }

            async function updateCert(id, status) {
                const remarks = prompt('Enter remarks (optional):', '');
                await fetch('/api/certificates/' + id, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ status, remarks })
                });
                loadStaffView('certificates');
            }

            function printCertificate(certNum, type, name, date) {
                const win = window.open('', '_blank');
                win.document.write(\`
                    <html><head><title>Print Certificate</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet"></head>
                    <body class="p-5 text-center">
                        <h2>\${systemSettings.barangay_name}</h2>
                        <p>\${systemSettings.municipality}, \${systemSettings.province}</p>
                        <hr class="my-4">
                        <h1 class="fw-bold text-uppercase mb-4">\${type}</h1>
                        <p class="fs-5">This is to certify that <b>\${name}</b> is a permanent resident of this barangay and is of good moral character.</p>
                        <div class="mt-5 text-end"><p><b>\${systemSettings.captain_name}</b><br>Punong Barangay</p></div>
                        <div class="text-start mt-5 small text-muted">Cert No: \${certNum}<br>Date Issued: \${date}</div>
                        <script>window.print();<\/script>
                    </body></html>\`);
                win.document.close();
            }

            async function deleteResident(id) {
                if (confirm('Permanently delete this resident record?')) {
                    const res = await fetch('/api/residents/' + id, {method: 'DELETE'});
                    if ((await res.json()).success) loadStaffView('residents');
                    else alert('Unauthorized or error deleting resident.');
                }
            }

            function openAddResidentModal() {
                const fn = prompt('First Name:');
                if (!fn) return;
                const ln = prompt('Last Name:');
                const dob = prompt('Date of Birth (YYYY-MM-DD):', '1990-01-01');
                const gender = prompt('Gender (Male/Female):', 'Male');
                const purok = prompt('Purok:', 'Purok 1');
                const address = prompt('Address:', 'Main St.');
                const contact = prompt('Contact Number:', '09123456789');

                fetch('/api/residents', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ first_name: fn, last_name: ln, dob, gender, purok, address, contact })
                }).then(res => res.json()).then(d => {
                    if (d.success) loadStaffView('residents');
                    else alert('Error adding resident.');
                });
            }

            // --- RESIDENT PORTAL ---
            async function renderResidentPortal() {
                const res = await fetch('/api/resident/me');
                const resident = await res.json();
                const notifRes = await fetch('/api/notifications');
                const notifications = await notifRes.json();

                document.getElementById('appContainer').innerHTML = \`
                    <nav class="navbar navbar-expand navbar-dark bg-dark px-4 py-3">
                        <a class="navbar-brand fw-bold" href="#"><i class="fa-solid fa-landmark me-2"></i>\${systemSettings.barangay_name} - Resident Portal</a>
                        <div class="ms-auto d-flex align-items-center">
                            <span class="text-white me-3">\${resident.first_name} \${resident.last_name} (\${resident.id})</span>
                            <button class="btn btn-outline-light btn-sm" onclick="logout()">Logout</button>
                        </div>
                    </nav>
                    <div class="container py-4">
                        <div class="row g-4">
                            <div class="col-md-4">
                                <div class="card shadow border-0 p-4 text-center mb-4">
                                    <img src="\${resident.photo || 'https://via.placeholder.com/120'}" class="rounded-circle mx-auto mb-3" width="100" height="100" style="object-fit:cover">
                                    <h4 class="fw-bold mb-1">\${resident.first_name} \${resident.last_name}</h4>
                                    <p class="text-primary fw-semibold">\${resident.id}</p>
                                    <hr>
                                    <p class="mb-1 small text-start"><b>Address:</b> \${resident.address}</p>
                                    <p class="mb-1 small text-start"><b>Purok:</b> \${resident.purok}</p>
                                    <p class="mb-1 small text-start"><b>Contact:</b> \${resident.contact}</p>
                                    <button class="btn btn-outline-primary btn-sm mt-3" onclick="viewDigitalId()"><i class="fa-solid fa-id-card me-1"></i> View Digital ID</button>
                                </div>
                                <div class="card shadow border-0 p-3">
                                    <h6 class="fw-bold mb-3"><i class="fa-solid fa-bell me-2 text-warning"></i> Notifications</h6>
                                    <div style="max-height: 250px; overflow-y: auto;">
                                        \${notifications.length === 0 ? '<p class="small text-muted">No notifications.</p>' : notifications.map(n => '<div class="border-bottom pb-2 mb-2"><small class="fw-bold d-block">' + n.title + '</small><small class="text-muted">' + n.message + '</small></div>').join('')}
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-8">
                                <div class="card shadow border-0 p-4 mb-4">
                                    <h5 class="fw-bold mb-3">Request Certificate</h5>
                                    <form id="certReqForm">
                                        <div class="mb-3">
                                            <label class="form-label">Certificate Type</label>
                                            <select id="certType" class="form-select">
                                                <option>Barangay Clearance</option>
                                                <option>Certificate of Residency</option>
                                                <option>Certificate of Indigency</option>
                                                <option>Certificate of Good Moral</option>
                                            </select>
                                        </div>
                                        <button type="submit" class="btn btn-primary btn-sm">Submit Request</button>
                                    </form>
                                </div>
                                <div class="card shadow border-0 p-4">
                                    <h5 class="fw-bold mb-3">My Requests & History</h5>
                                    <div id="myRequestsList">Loading requests...</div>
                                </div>
                            </div>
                        </div>
                    </div>\`;

                loadResidentRequests();
                document.getElementById('certReqForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const type = document.getElementById('certType').value;
                    const res = await fetch('/api/certificates', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ type })
                    });
                    if ((await res.json()).success) {
                        alert('Certificate requested successfully!');
                        renderResidentPortal();
                    }
                });
            }

            async function loadResidentRequests() {
                const res = await fetch('/api/certificates');
                const list = await res.json();
                const container = document.getElementById('myRequestsList');
                if (!container) return;
                container.innerHTML = \`
                    <table class="table table-sm">
                        <thead><tr><th>Cert No.</th><th>Type</th><th>Status</th><th>Date</th></tr></thead>
                        <tbody>\${list.map(c => '<tr><td>' + c.cert_number + '</td><td>' + c.type + '</td><td><span class="badge bg-info">' + c.status + '</span></td><td>' + c.created_at + '</td></tr>').join('')}</tbody>
                    </table>\`;
            }

            async function viewDigitalId() {
                const res = await fetch('/api/resident/me');
                const r = await res.json();
                const win = window.open('', '_blank');
                win.document.write(\`
                    <html><head><title>Digital Resident ID</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet"></head>
                    <body class="bg-light p-5 text-center">
                        <div class="card shadow mx-auto p-4" style="max-width: 400px; border-radius: 15px;">
                            <h5 class="fw-bold text-primary mb-1">\${systemSettings.barangay_name}</h5>
                            <p class="small text-muted">\${systemSettings.municipality}</p>
                            <img src="\${r.photo || 'https://via.placeholder.com/120'}" class="rounded-circle mx-auto my-3" width="110" height="110" style="object-fit:cover">
                            <h4 class="fw-bold mb-0">\${r.first_name} \${r.middle_name} \${r.last_name}</h4>
                            <p class="text-danger fw-bold">\${r.id}</p>
                            <hr>
                            <p class="small text-start mb-1"><b>DOB:</b> \${r.dob}</p>
                            <p class="small text-start mb-1"><b>Address:</b> \${r.address}, \${r.purok}</p>
                            <p class="small text-start mb-1"><b>Contact:</b> \${r.contact}</p>
                            <div class="mt-3"><button class="btn btn-primary btn-sm no-print" onclick="window.print()">Print ID</button></div>
                        </div>
                    </body></html>\`);
                win.document.close();
            }

            function printSingleId(id) {
                alert('Use ID Batch Printing or Resident Portal Digital ID view for printing individual cards.');
            }

            initApp();
        </script>
    </body>
    </html>`;
}

// Start Server
app.listen(PORT, () => {
    console.log(`Barangay Resident Management System running on port ${PORT}`);
});
