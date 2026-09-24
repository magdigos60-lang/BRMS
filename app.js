const express = require('express');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'barangay_system_secret_key_2026_secure';
const DB_FILE = process.env.DB_PATH || path.join(__dirname, 'barangay.sqlite');

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) console.error('Database connection error:', err.message);
    else console.log('Connected to SQLite persistent database at', DB_FILE);
});

// Helper for promise-based SQL operations
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

// Initialize DB schema
async function initDB() {
    await dbRun(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        barangay_name TEXT DEFAULT 'Barangay Central',
        municipality TEXT DEFAULT 'Sample City',
        province TEXT DEFAULT 'Metro Region',
        address TEXT DEFAULT 'Main St., Barangay Central',
        contact TEXT DEFAULT '09123456789',
        email TEXT DEFAULT 'contact@barangay.gov.ph',
        captain TEXT DEFAULT 'Hon. Barangay Captain',
        secretary TEXT DEFAULT 'Barangay Secretary',
        logo TEXT DEFAULT ''
    )`);

    await dbRun(`INSERT OR IGNORE INTO settings (id) VALUES (1)`);

    await dbRun(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL, -- Admin, Captain, Secretary, Staff, Resident
        resident_id INTEGER UNIQUE,
        full_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await dbRun(`CREATE TABLE IF NOT EXISTS residents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_code TEXT UNIQUE NOT NULL,
        first_name TEXT NOT NULL,
        middle_name TEXT,
        last_name TEXT NOT NULL,
        suffix TEXT,
        dob DATE NOT NULL,
        gender TEXT NOT NULL,
        civil_status TEXT NOT NULL,
        contact TEXT,
        email TEXT,
        address TEXT NOT NULL,
        purok TEXT NOT NULL,
        occupation TEXT,
        education TEXT,
        nationality TEXT DEFAULT 'Filipino',
        voter_status TEXT DEFAULT 'No',
        pwd_status TEXT DEFAULT 'No',
        senior_status TEXT DEFAULT 'No',
        solo_parent TEXT DEFAULT 'No',
        four_ps TEXT DEFAULT 'No',
        photo TEXT,
        status TEXT DEFAULT 'Active', -- Active, Archived
        household_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await dbRun(`CREATE TABLE IF NOT EXISTS households (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        household_number TEXT UNIQUE NOT NULL,
        head_resident_id INTEGER,
        address TEXT,
        purok TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await dbRun(`CREATE TABLE IF NOT EXISTS puroks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT
    )`);

    await dbRun(`CREATE TABLE IF NOT EXISTS certificates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cert_number TEXT UNIQUE NOT NULL,
        resident_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        purpose TEXT,
        status TEXT DEFAULT 'Pending', -- Pending, Processing, Approved, Ready for Release, Released, Rejected
        remarks TEXT,
        release_date DATE,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await dbRun(`CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id INTEGER NOT NULL,
        service TEXT NOT NULL,
        app_date DATE NOT NULL,
        app_time TEXT NOT NULL,
        status TEXT DEFAULT 'Pending', -- Pending, Approved, Rejected, Cancelled, Completed
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await dbRun(`CREATE TABLE IF NOT EXISTS blotter (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_number TEXT UNIQUE NOT NULL,
        complainant TEXT NOT NULL,
        respondent TEXT NOT NULL,
        witness TEXT,
        incident_date DATE NOT NULL,
        incident_time TEXT,
        location TEXT,
        description TEXT NOT NULL,
        action_taken TEXT,
        status TEXT DEFAULT 'Open', -- Open, Under Investigation, Settled, Resolved, Closed
        resident_id INTEGER, -- Optional if filed via Resident Portal
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await dbRun(`CREATE TABLE IF NOT EXISTS assistance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id INTEGER NOT NULL,
        type TEXT NOT NULL, -- Financial, Medical, Educational, Food, Emergency
        details TEXT,
        status TEXT DEFAULT 'Pending', -- Pending, Approved, Rejected, Fulfilled
        remarks TEXT,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await dbRun(`CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'General', -- General, Event, Emergency, Notice
        published INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await dbRun(`CREATE TABLE IF NOT EXISTS profile_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id INTEGER NOT NULL,
        changes_json TEXT NOT NULL,
        status TEXT DEFAULT 'Pending', -- Pending, Approved, Rejected
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await dbRun(`CREATE TABLE IF NOT EXISTS businesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_name TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        type TEXT NOT NULL,
        address TEXT NOT NULL,
        contact TEXT,
        permit_number TEXT,
        permit_status TEXT DEFAULT 'Pending', -- Active, Expired, Pending
        expiration_date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await dbRun(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await dbRun(`CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_name TEXT NOT NULL,
        role TEXT NOT NULL,
        action TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
}

initDB().catch(console.error);

const logActivity = async (user_name, role, action, description) => {
    try {
        await dbRun(`INSERT INTO activity_logs (user_name, role, action, description) VALUES (?, ?, ?, ?)`,
            [user_name || 'System', role || 'N/A', action, description]);
    } catch (e) {
        console.error('Logging failed:', e);
    }
};

const notifyUser = async (user_id, title, message) => {
    try {
        await dbRun(`INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)`, [user_id, title, message]);
    } catch (e) {
        console.error('Notify error:', e);
    }
};

const authenticateToken = (req, res, next) => {
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized: Access Denied' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or Expired Token' });
        req.user = user;
        next();
    });
};

const requireRole = (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Forbidden: Insufficient Privileges' });
    }
    next();
};


// System Setup Check
app.get('/api/system/status', async (req, res) => {
    const adminCount = await dbGet(`SELECT COUNT(*) as count FROM users WHERE role = 'Administrator'`);
    const settings = await dbGet(`SELECT * FROM settings WHERE id = 1`);
    res.json({ setup_required: adminCount.count === 0, settings });
});

// Admin Initial Setup
app.post('/api/system/setup', async (req, res) => {
    const adminCount = await dbGet(`SELECT COUNT(*) as count FROM users WHERE role = 'Administrator'`);
    if (adminCount.count > 0) return res.status(400).json({ error: 'Setup already completed.' });

    const { username, password, full_name, barangay_name, municipality, province } = req.body;
    if (!username || !password || !full_name) return res.status(400).json({ error: 'All fields required.' });

    const hash = await bcrypt.hash(password, 10);
    await dbRun(`INSERT INTO users (username, password, role, full_name) VALUES (?, ?, 'Administrator', ?)`,
        [username, hash, full_name]);

    if (barangay_name) {
        await dbRun(`UPDATE settings SET barangay_name = ?, municipality = ?, province = ? WHERE id = 1`,
            [barangay_name, municipality || '', province || '']);
    }

    await logActivity(full_name, 'Administrator', 'INITIAL_SETUP', 'Initial System Admin Account Created');
    res.json({ message: 'System Setup Successful! You can now log in.' });
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await dbGet(`SELECT * FROM users WHERE username = ?`, [username]);
    if (!user) return res.status(400).json({ error: 'Invalid username or password.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid username or password.' });

    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, resident_id: user.resident_id, name: user.full_name },
        JWT_SECRET,
        { expiresIn: '12h' }
    );

    res.cookie('token', token, { httpOnly: true, maxAge: 12 * 3600 * 1000 });
    await logActivity(user.full_name, user.role, 'LOGIN', 'User Logged In');
    res.json({ message: 'Login successful', role: user.role, name: user.full_name, resident_id: user.resident_id });
});

// Logout
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    await logActivity(req.user.name, req.user.role, 'LOGOUT', 'User Logged Out');
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
});

// Get Current User Profile
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    res.json({ user: req.user });
});

app.get('/api/settings', async (req, res) => {
    const settings = await dbGet(`SELECT * FROM settings WHERE id = 1`);
    res.json(settings || {});
});

app.put('/api/settings', authenticateToken, requireRole(['Administrator', 'Captain']), async (req, res) => {
    const { barangay_name, municipality, province, address, contact, email, captain, secretary, logo } = req.body;
    await dbRun(`UPDATE settings SET 
        barangay_name = ?, municipality = ?, province = ?, address = ?, 
        contact = ?, email = ?, captain = ?, secretary = ?, logo = ? WHERE id = 1`,
        [barangay_name, municipality, province, address, contact, email, captain, secretary, logo]);

    await logActivity(req.user.name, req.user.role, 'UPDATE_SETTINGS', 'Barangay Profile & Settings Updated');
    res.json({ message: 'Barangay Settings Updated Successfully' });
});


// Calculate auto age helper
function getAge(dobString) {
    const today = new Date();
    const birthDate = new Date(dobString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
}

// Generate unique resident code BRGY-000001
async function generateResidentCode() {
    const lastRes = await dbGet(`SELECT id FROM residents ORDER BY id DESC LIMIT 1`);
    const nextId = (lastRes ? lastRes.id : 0) + 1;
    return `BRGY-${String(nextId).padStart(6, '0')}`;
}

app.get('/api/residents', authenticateToken, requireRole(['Administrator', 'Captain', 'Secretary', 'Staff']), async (req, res) => {
    const { status = 'Active', search = '', purok = '' } = req.query;
    let query = `SELECT * FROM residents WHERE status = ?`;
    let params = [status];

    if (search) {
        query += ` AND (first_name LIKE ? OR last_name LIKE ? OR resident_code LIKE ? OR contact LIKE ?)`;
        const term = `%${search}%`;
        params.push(term, term, term, term);
    }
    if (purok) {
        query += ` AND purok = ?`;
        params.push(purok);
    }

    query += ` ORDER BY id DESC`;
    const rows = await dbAll(query, params);
    const result = rows.map(r => ({ ...r, age: getAge(r.dob) }));
    res.json(result);
});

app.post('/api/residents', authenticateToken, requireRole(['Administrator', 'Captain', 'Secretary', 'Staff']), async (req, res) => {
    try {
        const {
            first_name, middle_name, last_name, suffix, dob, gender, civil_status, contact, email,
            address, purok, occupation, education, nationality, voter_status, pwd_status, senior_status, solo_parent, four_ps, photo, household_id
        } = req.body;

        if (!first_name || !last_name || !dob || !gender || !address || !purok) {
            return res.status(400).json({ error: 'Missing required resident details.' });
        }

        const resident_code = await generateResidentCode();
        const calculatedSenior = getAge(dob) >= 60 ? 'Yes' : (senior_status || 'No');

        const result = await dbRun(`INSERT INTO residents (
            resident_code, first_name, middle_name, last_name, suffix, dob, gender, civil_status, contact, email,
            address, purok, occupation, education, nationality, voter_status, pwd_status, senior_status, solo_parent, four_ps, photo, household_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            resident_code, first_name, middle_name || '', last_name, suffix || '', dob, gender, civil_status, contact || '', email || '',
            address, purok, occupation || '', education || '', nationality || 'Filipino', voter_status || 'No', pwd_status || 'No',
            calculatedSenior, solo_parent || 'No', four_ps || 'No', photo || '', household_id || null
        ]);

        // Automatically create a Resident User Portal account
        const defaultUsername = resident_code.toLowerCase();
        const defaultPasswordHash = await bcrypt.hash('123456', 10); // Default pass: 123456
        const fullName = `${first_name} ${last_name}`;

        await dbRun(`INSERT INTO users (username, password, role, resident_id, full_name) VALUES (?, ?, 'Resident', ?, ?)`,
            [defaultUsername, defaultPasswordHash, result.lastID, fullName]);

        await logActivity(req.user.name, req.user.role, 'ADD_RESIDENT', `Registered resident ${fullName} (${resident_code})`);

        res.json({ message: 'Resident registered successfully!', resident_id: result.lastID, resident_code, default_username: defaultUsername });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/residents/:id', authenticateToken, async (req, res) => {
    const resident = await dbGet(`SELECT * FROM residents WHERE id = ?`, [req.params.id]);
    if (!resident) return res.status(404).json({ error: 'Resident not found' });
    if (req.user.role === 'Resident' && req.user.resident_id !== resident.id) {
        return res.status(403).json({ error: 'Access denied.' });
    }
    resident.age = getAge(resident.dob);
    res.json(resident);
});

app.put('/api/residents/:id', authenticateToken, requireRole(['Administrator', 'Captain', 'Secretary', 'Staff']), async (req, res) => {
    const {
        first_name, middle_name, last_name, suffix, dob, gender, civil_status, contact, email,
        address, purok, occupation, education, nationality, voter_status, pwd_status, senior_status, solo_parent, four_ps, photo
    } = req.body;

    const calculatedSenior = dob ? (getAge(dob) >= 60 ? 'Yes' : (senior_status || 'No')) : senior_status;

    await dbRun(`UPDATE residents SET 
        first_name = ?, middle_name = ?, last_name = ?, suffix = ?, dob = ?, gender = ?, civil_status = ?, contact = ?, email = ?,
        address = ?, purok = ?, occupation = ?, education = ?, nationality = ?, voter_status = ?, pwd_status = ?, senior_status = ?, solo_parent = ?, four_ps = ?, photo = ?
        WHERE id = ?`, [
        first_name, middle_name, last_name, suffix, dob, gender, civil_status, contact, email,
        address, purok, occupation, education, nationality, voter_status, pwd_status, calculatedSenior, solo_parent, four_ps, photo, req.params.id
    ]);

    await logActivity(req.user.name, req.user.role, 'UPDATE_RESIDENT', `Updated details for resident ID ${req.params.id}`);
    res.json({ message: 'Resident information updated.' });
});

// Resident Archive / Restore / Permanent Delete
app.patch('/api/residents/:id/archive', authenticateToken, requireRole(['Administrator', 'Captain', 'Secretary']), async (req, res) => {
    await dbRun(`UPDATE residents SET status = 'Archived' WHERE id = ?`, [req.params.id]);
    await logActivity(req.user.name, req.user.role, 'ARCHIVE_RESIDENT', `Archived resident ID ${req.params.id}`);
    res.json({ message: 'Resident record archived successfully.' });
});

app.patch('/api/residents/:id/restore', authenticateToken, requireRole(['Administrator', 'Captain', 'Secretary']), async (req, res) => {
    await dbRun(`UPDATE residents SET status = 'Active' WHERE id = ?`, [req.params.id]);
    await logActivity(req.user.name, req.user.role, 'RESTORE_RESIDENT', `Restored resident ID ${req.params.id}`);
    res.json({ message: 'Resident record restored to active list.' });
});

app.delete('/api/residents/:id', authenticateToken, requireRole(['Administrator']), async (req, res) => {
    await dbRun(`DELETE FROM residents WHERE id = ?`, [req.params.id]);
    await dbRun(`DELETE FROM users WHERE resident_id = ?`, [req.params.id]);
    await logActivity(req.user.name, req.user.role, 'DELETE_RESIDENT', `Permanently deleted resident ID ${req.params.id}`);
    res.json({ message: 'Resident permanently deleted from database.' });
});

app.get('/api/dashboard/stats', authenticateToken, requireRole(['Administrator', 'Captain', 'Secretary', 'Staff']), async (req, res) => {
    const totalResidents = (await dbGet(`SELECT COUNT(*) as c FROM residents WHERE status = 'Active'`)).c;
    const totalHouseholds = (await dbGet(`SELECT COUNT(*) as c FROM households`)).c;
    const maleResidents = (await dbGet(`SELECT COUNT(*) as c FROM residents WHERE status = 'Active' AND gender = 'Male'`)).c;
    const femaleResidents = (await dbGet(`SELECT COUNT(*) as c FROM residents WHERE status = 'Active' AND gender = 'Female'`)).c;

    const allResidents = await dbAll(`SELECT dob FROM residents WHERE status = 'Active'`);
    let seniorCitizens = 0;
    let minors = 0;

    allResidents.forEach(r => {
        const age = getAge(r.dob);
        if (age >= 60) seniorCitizens++;
        if (age < 18) minors++;
    });

    const pwdResidents = (await dbGet(`SELECT COUNT(*) as c FROM residents WHERE status = 'Active' AND pwd_status = 'Yes'`)).c;
    const soloParents = (await dbGet(`SELECT COUNT(*) as c FROM residents WHERE status = 'Active' AND solo_parent = 'Yes'`)).c;
    const voters = (await dbGet(`SELECT COUNT(*) as c FROM residents WHERE status = 'Active' AND voter_status = 'Yes'`)).c;
    const pendingRequests = (await dbGet(`SELECT COUNT(*) as c FROM certificates WHERE status = 'Pending'`)).c;

    const todayStr = new Date().toISOString().split('T')[0];
    const todayAppointments = (await dbGet(`SELECT COUNT(*) as c FROM appointments WHERE app_date = ?`, [todayStr])).c;

    const recentActivities = await dbAll(`SELECT * FROM activity_logs ORDER BY id DESC LIMIT 8`);

    res.json({
        totalResidents, totalHouseholds, maleResidents, femaleResidents,
        seniorCitizens, pwdResidents, soloParents, minors, voters,
        pendingRequests, todayAppointments, recentActivities
    });
});

app.get('/api/households', authenticateToken, async (req, res) => {
    const rows = await dbAll(`SELECT h.*, r.first_name, r.last_name, (SELECT COUNT(*) FROM residents WHERE household_id = h.id) as member_count 
        FROM households h LEFT JOIN residents r ON h.head_resident_id = r.id ORDER BY h.id DESC`);
    res.json(rows);
});

app.post('/api/households', authenticateToken, requireRole(['Administrator', 'Captain', 'Secretary', 'Staff']), async (req, res) => {
    const { household_number, head_resident_id, address, purok } = req.body;
    const result = await dbRun(`INSERT INTO households (household_number, head_resident_id, address, purok) VALUES (?, ?, ?, ?)`,
        [household_number, head_resident_id || null, address, purok]);
    await logActivity(req.user.name, req.user.role, 'ADD_HOUSEHOLD', `Created household #${household_number}`);
    res.json({ message: 'Household registered successfully', id: result.lastID });
});

app.get('/api/puroks', authenticateToken, async (req, res) => {
    const puroks = await dbAll(`SELECT p.*, (SELECT COUNT(*) FROM residents WHERE purok = p.name AND status = 'Active') as resident_count,
        (SELECT COUNT(*) FROM households WHERE purok = p.name) as household_count FROM puroks p`);
    res.json(puroks);
});

app.post('/api/puroks', authenticateToken, requireRole(['Administrator', 'Captain']), async (req, res) => {
    const { name, description } = req.body;
    await dbRun(`INSERT INTO puroks (name, description) VALUES (?, ?)`, [name, description]);
    await logActivity(req.user.name, req.user.role, 'ADD_PUROK', `Added Purok ${name}`);
    res.json({ message: 'Purok added successfully' });
});

app.get('/api/certificates', authenticateToken, async (req, res) => {
    let sql = `SELECT c.*, r.first_name, r.last_name, r.resident_code, r.purok, r.address FROM certificates c JOIN residents r ON c.resident_id = r.id`;
    let params = [];
    if (req.user.role === 'Resident') {
        sql += ` WHERE c.resident_id = ?`;
        params.push(req.user.resident_id);
    }
    sql += ` ORDER BY c.id DESC`;
    const rows = await dbAll(sql, params);
    res.json(rows);
});

app.post('/api/certificates', authenticateToken, async (req, res) => {
    const { type, purpose, resident_id } = req.body;
    const targetResidentId = req.user.role === 'Resident' ? req.user.resident_id : resident_id;

    if (!targetResidentId) return res.status(400).json({ error: 'Valid resident ID is required.' });

    const count = (await dbGet(`SELECT COUNT(*) as c FROM certificates`)).c + 1;
    const cert_number = `CERT-${new Date().getFullYear()}-${String(count).padStart(5, '0')}`;

    await dbRun(`INSERT INTO certificates (cert_number, resident_id, type, purpose, status) VALUES (?, ?, ?, ?, 'Pending')`,
        [cert_number, targetResidentId, type, purpose]);

    await logActivity(req.user.name, req.user.role, 'REQUEST_CERTIFICATE', `Certificate request submitted (${cert_number})`);
    res.json({ message: 'Certificate requested successfully!', cert_number });
});

app.patch('/api/certificates/:id/status', authenticateToken, requireRole(['Administrator', 'Captain', 'Secretary', 'Staff']), async (req, res) => {
    const { status, remarks, release_date } = req.body;
    await dbRun(`UPDATE certificates SET status = ?, remarks = ?, release_date = ? WHERE id = ?`,
        [status, remarks || '', release_date || null, req.params.id]);

    const cert = await dbGet(`SELECT * FROM certificates WHERE id = ?`, [req.params.id]);
    if (cert) {
        const user = await dbGet(`SELECT id FROM users WHERE resident_id = ?`, [cert.resident_id]);
        if (user) {
            await notifyUser(user.id, 'Certificate Request Updated', `Your certificate request (${cert.cert_number}) status is now: ${status}`);
        }
    }

    await logActivity(req.user.name, req.user.role, 'UPDATE_CERTIFICATE', `Updated cert #${req.params.id} to ${status}`);
    res.json({ message: 'Certificate status updated successfully.' });
});

app.get('/api/appointments', authenticateToken, async (req, res) => {
    let sql = `SELECT a.*, r.first_name, r.last_name, r.contact FROM appointments a JOIN residents r ON a.resident_id = r.id`;
    let params = [];
    if (req.user.role === 'Resident') {
        sql += ` WHERE a.resident_id = ?`;
        params.push(req.user.resident_id);
    }
    sql += ` ORDER BY a.app_date DESC, a.app_time ASC`;
    const rows = await dbAll(sql, params);
    res.json(rows);
});

app.post('/api/appointments', authenticateToken, async (req, res) => {
    const { service, app_date, app_time } = req.body;
    const targetResidentId = req.user.resident_id || req.body.resident_id;

    if (!targetResidentId) return res.status(400).json({ error: 'Resident ID missing.' });

    // Anti-double booking check
    const existing = await dbGet(`SELECT id FROM appointments WHERE app_date = ? AND app_time = ? AND status != 'Cancelled' AND status != 'Rejected'`,
        [app_date, app_time]);

    if (existing) {
        return res.status(400).json({ error: 'This time slot is already booked. Please choose another date or time.' });
    }

    await dbRun(`INSERT INTO appointments (resident_id, service, app_date, app_time, status) VALUES (?, ?, ?, ?, 'Pending')`,
        [targetResidentId, service, app_date, app_time]);

    await logActivity(req.user.name, req.user.role, 'CREATE_APPOINTMENT', `Scheduled appointment for ${app_date} ${app_time}`);
    res.json({ message: 'Appointment scheduled successfully!' });
});

app.patch('/api/appointments/:id/status', authenticateToken, requireRole(['Administrator', 'Captain', 'Secretary', 'Staff']), async (req, res) => {
    const { status, remarks } = req.body;
    await dbRun(`UPDATE appointments SET status = ?, remarks = ? WHERE id = ?`, [status, remarks || '', req.params.id]);

    const appt = await dbGet(`SELECT * FROM appointments WHERE id = ?`, [req.params.id]);
    if (appt) {
        const user = await dbGet(`SELECT id FROM users WHERE resident_id = ?`, [appt.resident_id]);
        if (user) {
            await notifyUser(user.id, 'Appointment Status Updated', `Your appointment on ${appt.app_date} is now ${status}.`);
        }
    }
    res.json({ message: 'Appointment status updated.' });
});

app.get('/api/blotter', authenticateToken, async (req, res) => {
    let sql = `SELECT * FROM blotter`;
    let params = [];
    if (req.user.role === 'Resident') {
        sql += ` WHERE resident_id = ?`;
        params.push(req.user.resident_id);
    }
    sql += ` ORDER BY id DESC`;
    const rows = await dbAll(sql, params);
    res.json(rows);
});

app.post('/api/blotter', authenticateToken, async (req, res) => {
    const { complainant, respondent, witness, incident_date, incident_time, location, description, action_taken } = req.body;
    const count = (await dbGet(`SELECT COUNT(*) as c FROM blotter`)).c + 1;
    const case_number = `CASE-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;

    await dbRun(`INSERT INTO blotter (case_number, complainant, respondent, witness, incident_date, incident_time, location, description, action_taken, resident_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        case_number, complainant, respondent || 'Unknown/N/A', witness || '', incident_date, incident_time || '',
        location || '', description, action_taken || '', req.user.role === 'Resident' ? req.user.resident_id : null
    ]);

    await logActivity(req.user.name, req.user.role, 'FILE_BLOTTER', `Blotter/Complaint filed (${case_number})`);
    res.json({ message: 'Complaint/Blotter record logged successfully.', case_number });
});

app.patch('/api/blotter/:id/status', authenticateToken, requireRole(['Administrator', 'Captain', 'Secretary', 'Staff']), async (req, res) => {
    const { status, action_taken } = req.body;
    await dbRun(`UPDATE blotter SET status = ?, action_taken = ? WHERE id = ?`, [status, action_taken || '', req.params.id]);
    res.json({ message: 'Blotter status updated.' });
});

app.get('/api/assistance', authenticateToken, async (req, res) => {
    let sql = `SELECT a.*, r.first_name, r.last_name, r.purok, r.contact FROM assistance a JOIN residents r ON a.resident_id = r.id`;
    let params = [];
    if (req.user.role === 'Resident') {
        sql += ` WHERE a.resident_id = ?`;
        params.push(req.user.resident_id);
    }
    sql += ` ORDER BY a.id DESC`;
    const rows = await dbAll(sql, params);
    res.json(rows);
});

app.post('/api/assistance', authenticateToken, async (req, res) => {
    const { type, details } = req.body;
    const targetResidentId = req.user.resident_id;
    if (!targetResidentId) return res.status(400).json({ error: 'Only residents can request assistance.' });

    await dbRun(`INSERT INTO assistance (resident_id, type, details) VALUES (?, ?, ?)`, [targetResidentId, type, details]);
    await logActivity(req.user.name, req.user.role, 'REQUEST_ASSISTANCE', `Requested ${type} assistance`);
    res.json({ message: 'Assistance request submitted.' });
});

app.patch('/api/assistance/:id/status', authenticateToken, requireRole(['Administrator', 'Captain', 'Secretary', 'Staff']), async (req, res) => {
    const { status, remarks } = req.body;
    await dbRun(`UPDATE assistance SET status = ?, remarks = ? WHERE id = ?`, [status, remarks || '', req.params.id]);
    res.json({ message: 'Assistance request status updated.' });
});

app.get('/api/announcements', async (req, res) => {
    const rows = await dbAll(`SELECT * FROM announcements WHERE published = 1 ORDER BY id DESC`);
    res.json(rows);
});

app.post('/api/announcements', authenticateToken, requireRole(['Administrator', 'Captain', 'Secretary']), async (req, res) => {
    const { title, content, category } = req.body;
    await dbRun(`INSERT INTO announcements (title, content, category) VALUES (?, ?, ?)`, [title, content, category || 'General']);
    await logActivity(req.user.name, req.user.role, 'ADD_ANNOUNCEMENT', `Posted announcement: ${title}`);
    res.json({ message: 'Announcement posted successfully.' });
});

app.delete('/api/announcements/:id', authenticateToken, requireRole(['Administrator', 'Captain']), async (req, res) => {
    await dbRun(`DELETE FROM announcements WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Announcement deleted.' });
});

app.get('/api/businesses', authenticateToken, async (req, res) => {
    const rows = await dbAll(`SELECT * FROM businesses ORDER BY id DESC`);
    res.json(rows);
});

app.post('/api/businesses', authenticateToken, requireRole(['Administrator', 'Captain', 'Secretary']), async (req, res) => {
    const { business_name, owner_name, type, address, contact, permit_number, permit_status, expiration_date } = req.body;
    await dbRun(`INSERT INTO businesses (business_name, owner_name, type, address, contact, permit_number, permit_status, expiration_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [business_name, owner_name, type, address, contact, permit_number, permit_status || 'Active', expiration_date]);
    await logActivity(req.user.name, req.user.role, 'ADD_BUSINESS', `Registered business: ${business_name}`);
    res.json({ message: 'Business record created.' });
});

app.get('/api/users', authenticateToken, requireRole(['Administrator']), async (req, res) => {
    const users = await dbAll(`SELECT id, username, role, full_name, resident_id, created_at FROM users ORDER BY id DESC`);
    res.json(users);
});

app.post('/api/users', authenticateToken, requireRole(['Administrator']), async (req, res) => {
    const { username, password, role, full_name } = req.body;
    if (!username || !password || !role || !full_name) return res.status(400).json({ error: 'All fields required.' });

    const hash = await bcrypt.hash(password, 10);
    await dbRun(`INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)`, [username, hash, role, full_name]);
    await logActivity(req.user.name, req.user.role, 'CREATE_USER', `Created user account: ${username} (${role})`);
    res.json({ message: 'Staff user created successfully.' });
});

app.get('/api/notifications', authenticateToken, async (req, res) => {
    const rows = await dbAll(`SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 20`, [req.user.id]);
    res.json(rows);
});

app.get('/api/logs', authenticateToken, requireRole(['Administrator', 'Captain']), async (req, res) => {
    const rows = await dbAll(`SELECT * FROM activity_logs ORDER BY id DESC LIMIT 100`);
    res.json(rows);
});

app.get('/verify/:code', async (req, res) => {
    const resCode = req.params.code;
    const resident = await dbGet(`SELECT resident_code, first_name, last_name, purok, status, dob FROM residents WHERE resident_code = ?`, [resCode]);
    const settings = await dbGet(`SELECT barangay_name, municipality, province FROM settings WHERE id = 1`);

    if (!resident) {
        return res.status(404).send(`
            <html>
                <body style="font-family:sans-serif; text-align:center; padding:50px; background:#f8fafc;">
                    <h1 style="color:#ef4444;">INVALID RESIDENT ID</h1>
                    <p>The scanned QR Code or Resident Identifier does not exist in our official Barangay database.</p>
                </body>
            </html>
        `);
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Resident Verification - ${settings.barangay_name}</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-slate-100 flex items-center justify-center min-h-screen p-4">
            <div class="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full text-center border border-slate-200">
                <div class="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold mb-3">✓</div>
                <h2 class="text-xl font-bold text-slate-800">${settings.barangay_name}</h2>
                <p class="text-xs text-slate-500 mb-4">${settings.municipality}, ${settings.province}</p>
                
                <div class="bg-slate-50 p-4 rounded-xl text-left space-y-2 text-sm border border-slate-100">
                    <div><span class="text-slate-400 text-xs block">RESIDENT CODE</span> <strong class="text-slate-800">${resident.resident_code}</strong></div>
                    <div><span class="text-slate-400 text-xs block">FULL NAME</span> <strong class="text-slate-800">${resident.first_name} ${resident.last_name}</strong></div>
                    <div><span class="text-slate-400 text-xs block">PUROK</span> <strong class="text-slate-800">${resident.purok}</strong></div>
                    <div><span class="text-slate-400 text-xs block">STATUS</span> <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${resident.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">${resident.status}</span></div>
                </div>
                <p class="text-xs text-emerald-600 mt-4 font-medium">Official & Verified Resident Record</p>
            </div>
        </body>
        </html>
    `);
});

app.get('*', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Barangay Resident Management System</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; }
        @media print {
            .no-print { display: none !important; }
            .print-only { display: block !important; }
            body { background: white !important; }
        }
        .print-only { display: none; }
    </style>
</head>
<body class="bg-slate-50 text-slate-800 antialiased min-h-screen flex flex-col">

    <!-- Toast Notification Overlay -->
    <div id="toast-container" class="fixed top-5 right-5 z-50 flex flex-col gap-2"></div>

    <!-- Main Container -->
    <div id="app" class="flex-1 flex flex-col min-h-screen">
        <div id="loading" class="flex items-center justify-center min-h-screen">
            <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
        </div>
    </div>

    <script>
        let state = {
            user: null,
            settings: {},
            setupRequired: false,
            activeTab: 'dashboard',
            residents: [],
            certificates: [],
            appointments: [],
            blotter: [],
            assistance: [],
            announcements: [],
            households: [],
            puroks: [],
            businesses: [],
            users: [],
            logs: [],
            modal: null
        };

        // Utility Toast
        function showToast(msg, type = 'success') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            const bgColor = type === 'success' ? 'bg-emerald-600' : 'bg-rose-600';
            toast.className = \`\${bgColor} text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 transform transition-all duration-300 ease-out translate-y-2 opacity-0\`;
            toast.innerHTML = \`<span>\${msg}</span>\`;
            container.appendChild(toast);
            setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 10);
            setTimeout(() => {
                toast.classList.add('opacity-0');
                setTimeout(() => toast.remove(), 300);
            }, 3500);
        }

        async function api(url, method = 'GET', data = null) {
            const opts = { method, headers: { 'Content-Type': 'application/json' } };
            if (data) opts.body = JSON.stringify(data);
            const res = await fetch(url, opts);
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Server error occurred.');
            return json;
        }

        // System Init
        async function initApp() {
            try {
                const status = await api('/api/system/status');
                state.setupRequired = status.setup_required;
                state.settings = status.settings || {};

                if (state.setupRequired) {
                    renderSetupWizard();
                    return;
                }

                try {
                    const me = await api('/api/auth/me');
                    state.user = me.user;
                    renderMainApp();
                } catch (e) {
                    renderLogin();
                }
            } catch (err) {
                console.error(err);
                showToast(err.message, 'error');
            }
        }

        function renderSetupWizard() {
            document.getElementById('app').innerHTML = \`
                <div class="min-h-screen flex items-center justify-center p-4 bg-slate-100">
                    <div class="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-200">
                        <div class="text-center mb-6">
                            <h1 class="text-2xl font-bold text-slate-800">Initial System Setup</h1>
                            <p class="text-sm text-slate-500 mt-1">Configure your Barangay details and create the Administrator account.</p>
                        </div>
                        <form id="setup-form" onsubmit="handleSetup(event)" class="space-y-4">
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Barangay Name</label>
                                <input type="text" id="setup_brgy" required value="Barangay Central" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">City / Municipality</label>
                                <input type="text" id="setup_muni" required value="Sample City" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Province</label>
                                <input type="text" id="setup_prov" required value="Metro Province" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <hr class="my-4">
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Admin Full Name</label>
                                <input type="text" id="setup_name" required placeholder="e.g., Juan Dela Cruz" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Admin Username</label>
                                <input type="text" id="setup_user" required placeholder="admin" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Admin Password</label>
                                <input type="password" id="setup_pass" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl shadow transition-all">
                                Initialize Barangay System
                            </button>
                        </form>
                    </div>
                </div>
            \`;
        }

        async function handleSetup(e) {
            e.preventDefault();
            try {
                const res = await api('/api/system/setup', 'POST', {
                    barangay_name: document.getElementById('setup_brgy').value,
                    municipality: document.getElementById('setup_muni').value,
                    province: document.getElementById('setup_prov').value,
                    full_name: document.getElementById('setup_name').value,
                    username: document.getElementById('setup_user').value,
                    password: document.getElementById('setup_pass').value
                });
                showToast(res.message);
                initApp();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        function renderLogin() {
            const logo = state.settings.logo || 'https://placehold.co/120x120/1e293b/ffffff?text=LOGO';
            document.getElementById('app').innerHTML = \`
                <div class="min-h-screen flex items-center justify-center p-4 bg-slate-900">
                    <div class="bg-white p-8 rounded-2xl shadow-2xl max-w-sm w-full border border-slate-100">
                        <div class="text-center mb-6">
                            <img src="\${logo}" class="w-20 h-20 mx-auto rounded-full object-cover mb-3 shadow" alt="Barangay Logo">
                            <h1 class="text-xl font-bold text-slate-800">\${state.settings.barangay_name || 'Barangay System'}</h1>
                            <p class="text-xs text-slate-500">\${state.settings.municipality || ''}, \${state.settings.province || ''}</p>
                        </div>
                        <form onsubmit="handleLogin(event)" class="space-y-4">
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Username / Resident Code</label>
                                <input type="text" id="login_user" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Password</label>
                                <input type="password" id="login_pass" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl shadow transition-all">
                                Sign In
                            </button>
                        </form>
                    </div>
                </div>
            \`;
        }

        async function handleLogin(e) {
            e.preventDefault();
            try {
                const res = await api('/api/auth/login', 'POST', {
                    username: document.getElementById('login_user').value,
                    password: document.getElementById('login_pass').value
                });
                showToast('Welcome back, ' + res.name);
                initApp();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        function renderMainApp() {
            const isStaff = state.user.role !== 'Resident';
            const logo = state.settings.logo || 'https://placehold.co/80x80/1e293b/ffffff?text=BRGY';

            document.getElementById('app').innerHTML = \`
                <div class="flex h-screen overflow-hidden bg-slate-100">
                    <!-- Sidebar -->
                    <aside class="w-64 bg-slate-900 text-slate-300 flex flex-col no-print">
                        <div class="p-5 flex items-center gap-3 border-b border-slate-800">
                            <img src="\${logo}" class="w-10 h-10 rounded-full object-cover">
                            <div class="overflow-hidden">
                                <h2 class="font-bold text-white text-sm truncate">\${state.settings.barangay_name}</h2>
                                <span class="text-xs text-blue-400 font-medium px-2 py-0.5 rounded bg-blue-950/60 inline-block mt-0.5">\${state.user.role} Portal</span>
                            </div>
                        </div>

                        <nav class="flex-1 p-3 space-y-1 overflow-y-auto text-sm font-medium">
                            \${isStaff ? getStaffNav() : getResidentNav()}
                        </nav>

                        <div class="p-4 border-t border-slate-800 flex items-center justify-between text-xs">
                            <div class="truncate">
                                <p class="text-white font-semibold truncate">\${state.user.name}</p>
                                <p class="text-slate-500 truncate">@\${state.user.username}</p>
                            </div>
                            <button onclick="handleLogout()" class="text-rose-400 hover:text-rose-300 font-semibold px-2 py-1 bg-rose-950/40 rounded">Logout</button>
                        </div>
                    </aside>

                    <!-- Content Area -->
                    <main class="flex-1 flex flex-col overflow-y-auto">
                        <!-- Topbar -->
                        <header class="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center no-print">
                            <h1 class="text-lg font-bold text-slate-800 uppercase tracking-wide" id="page-title">\${state.activeTab.replace('-', ' ')}</h1>
                            <div class="flex items-center gap-4">
                                <span class="text-xs font-semibold px-3 py-1 bg-slate-100 text-slate-600 rounded-full border">
                                    \${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                            </div>
                        </header>

                        <!-- Page Body -->
                        <div id="content-body" class="p-6 flex-1">
                            <!-- Dynamic Content Rendered Here -->
                        </div>
                    </main>
                </div>
            \`;

            loadTabContent(state.activeTab);
        }

        function getStaffNav() {
            return \`
                <button onclick="switchTab('dashboard')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">📊 Dashboard</button>
                <button onclick="switchTab('residents')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">👥 Residents</button>
                <button onclick="switchTab('households')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">🏠 Households</button>
                <button onclick="switchTab('puroks')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">📍 Puroks</button>
                <button onclick="switchTab('certificates')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">📜 Certificates</button>
                <button onclick="switchTab('appointments')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">📅 Appointments</button>
                <button onclick="switchTab('blotter')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">⚖️ Blotter & Cases</button>
                <button onclick="switchTab('assistance')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">🤝 Financial Assistance</button>
                <button onclick="switchTab('announcements')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">📢 Announcements</button>
                <button onclick="switchTab('businesses')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">🏪 Businesses</button>
                \${state.user.role === 'Administrator' ? \`
                    <button onclick="switchTab('users')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">🔑 Staff Users</button>
                    <button onclick="switchTab('settings')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">⚙️ Barangay Settings</button>
                    <button onclick="switchTab('logs')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">📋 System Audit Logs</button>
                \` : ''}
            \`;
        }

        function getResidentNav() {
            return \`
                <button onclick="switchTab('res-dashboard')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">🏠 My Dashboard</button>
                <button onclick="switchTab('res-profile')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">👤 My ID & Profile</button>
                <button onclick="switchTab('res-certs')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">📜 Request Certificates</button>
                <button onclick="switchTab('res-appointments')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">📅 Schedule Appointment</button>
                <button onclick="switchTab('res-assistance')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">🤝 Request Assistance</button>
                <button onclick="switchTab('res-complaints')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">⚖️ File Complaint</button>
                <button onclick="switchTab('res-announcements')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 transition">📢 Announcements</button>
            \`;
        }

        function switchTab(tab) {
            state.activeTab = tab;
            document.getElementById('page-title').innerText = tab.replace('-', ' ');
            loadTabContent(tab);
        }

        async function handleLogout() {
            await api('/api/auth/logout', 'POST');
            state.user = null;
            renderLogin();
        }

        async function loadTabContent(tab) {
            const body = document.getElementById('content-body');
            body.innerHTML = \`<div class="flex justify-center p-12"><div class="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div></div>\`;

            try {
                if (tab === 'dashboard') await renderStaffDashboard(body);
                else if (tab === 'residents') await renderResidentsView(body);
                else if (tab === 'certificates') await renderCertificatesView(body);
                else if (tab === 'appointments') await renderAppointmentsView(body);
                else if (tab === 'blotter') await renderBlotterView(body);
                else if (tab === 'assistance') await renderAssistanceView(body);
                else if (tab === 'announcements') await renderAnnouncementsView(body);
                else if (tab === 'households') await renderHouseholdsView(body);
                else if (tab === 'puroks') await renderPuroksView(body);
                else if (tab === 'businesses') await renderBusinessesView(body);
                else if (tab === 'users') await renderUsersView(body);
                else if (tab === 'settings') await renderSettingsView(body);
                else if (tab === 'logs') await renderLogsView(body);
                // Resident Views
                else if (tab === 'res-dashboard') await renderResidentDashboard(body);
                else if (tab === 'res-profile') await renderResidentProfile(body);
                else if (tab === 'res-certs') await renderCertificatesView(body);
                else if (tab === 'res-appointments') await renderAppointmentsView(body);
                else if (tab === 'res-assistance') await renderAssistanceView(body);
                else if (tab === 'res-complaints') await renderBlotterView(body);
                else if (tab === 'res-announcements') await renderAnnouncementsView(body);
            } catch (err) {
                body.innerHTML = \`<div class="p-6 bg-rose-50 text-rose-700 rounded-xl border border-rose-200">Error loading tab: \${err.message}</div>\`;
            }
        }

        async function renderStaffDashboard(container) {
            const stats = await api('/api/dashboard/stats');
            container.innerHTML = \`
                <div class="space-y-6">
                    <!-- Key Metric Cards -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Residents</span>
                            <div class="text-3xl font-extrabold text-slate-800 mt-2">\${stats.totalResidents}</div>
                        </div>
                        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Households</span>
                            <div class="text-3xl font-extrabold text-blue-600 mt-2">\${stats.totalHouseholds}</div>
                        </div>
                        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Pending Requests</span>
                            <div class="text-3xl font-extrabold text-amber-500 mt-2">\${stats.pendingRequests}</div>
                        </div>
                        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Appointments Today</span>
                            <div class="text-3xl font-extrabold text-emerald-600 mt-2">\${stats.todayAppointments}</div>
                        </div>
                    </div>

                    <!-- Demographic Breakdown -->
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                        <div class="bg-slate-800 text-white p-3.5 rounded-xl">
                            <span class="text-xs text-slate-400 block">Male</span>
                            <strong class="text-lg">\${stats.maleResidents}</strong>
                        </div>
                        <div class="bg-slate-800 text-white p-3.5 rounded-xl">
                            <span class="text-xs text-slate-400 block">Female</span>
                            <strong class="text-lg">\${stats.femaleResidents}</strong>
                        </div>
                        <div class="bg-slate-800 text-white p-3.5 rounded-xl">
                            <span class="text-xs text-slate-400 block">Senior Citizens</span>
                            <strong class="text-lg">\${stats.seniorCitizens}</strong>
                        </div>
                        <div class="bg-slate-800 text-white p-3.5 rounded-xl">
                            <span class="text-xs text-slate-400 block">PWD Residents</span>
                            <strong class="text-lg">\${stats.pwdResidents}</strong>
                        </div>
                        <div class="bg-slate-800 text-white p-3.5 rounded-xl">
                            <span class="text-xs text-slate-400 block">Solo Parents</span>
                            <strong class="text-lg">\${stats.soloParents}</strong>
                        </div>
                        <div class="bg-slate-800 text-white p-3.5 rounded-xl">
                            <span class="text-xs text-slate-400 block">Minors</span>
                            <strong class="text-lg">\${stats.minors}</strong>
                        </div>
                    </div>

                    <!-- Activity Stream -->
                    <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 class="font-bold text-slate-800 mb-4">Recent Audit Activity</h3>
                        \${stats.recentActivities.length === 0 ? '<p class="text-slate-400 text-sm">No activity recorded yet.</p>' : \`
                            <div class="space-y-3">
                                \${stats.recentActivities.map(a => \`
                                    <div class="flex justify-between items-center text-xs border-b border-slate-100 pb-2">
                                        <div>
                                            <span class="font-bold text-slate-700">\${a.user_name}</span> 
                                            <span class="text-slate-500">(\${a.action}): \${a.description}</span>
                                        </div>
                                        <span class="text-slate-400">\${new Date(a.created_at).toLocaleString()}</span>
                                    </div>
                                \`).join('')}
                            </div>
                        \`}
                    </div>
                </div>
            \`;
        }

        async function renderResidentsView(container) {
            const residents = await api('/api/residents');
            state.residents = residents;

            container.innerHTML = \`
                <div class="space-y-4">
                    <div class="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200">
                        <div class="flex items-center gap-2 w-full md:w-auto">
                            <input type="text" id="res-search" placeholder="Search name or ID..." onkeyup="filterResidents()" class="px-3 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-64">
                            <select id="res-filter-status" onchange="filterResidents()" class="px-3 py-2 border rounded-xl text-sm outline-none">
                                <option value="Active">Active</option>
                                <option value="Archived">Archived</option>
                            </select>
                        </div>
                        <button onclick="openAddResidentModal()" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm shadow transition">
                            + Register New Resident
                        </button>
                    </div>

                    <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <table class="w-full text-left border-collapse text-sm">
                            <thead class="bg-slate-50 text-slate-500 font-semibold text-xs uppercase border-b">
                                <tr>
                                    <th class="p-4">Resident Code</th>
                                    <th class="p-4">Full Name</th>
                                    <th class="p-4">Age/Gender</th>
                                    <th class="p-4">Purok</th>
                                    <th class="p-4">Contact</th>
                                    <th class="p-4">Status</th>
                                    <th class="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="res-table-body" class="divide-y divide-slate-100">
                                \${renderResidentRows(residents)}
                            </tbody>
                        </table>
                    </div>
                </div>
            \`;
        }

        function renderResidentRows(list) {
            if (list.length === 0) {
                return \`<tr><td colspan="7" class="text-center p-8 text-slate-400">No resident records found. Add your first resident to get started.</td></tr>\`;
            }
            return list.map(r => \`
                <tr class="hover:bg-slate-50 transition">
                    <td class="p-4 font-bold text-blue-600">\${r.resident_code}</td>
                    <td class="p-4 font-semibold text-slate-800">\${r.first_name} \${r.middle_name ? r.middle_name[0] + '.' : ''} \${r.last_name} \${r.suffix || ''}</td>
                    <td class="p-4">\${r.age} yrs / \${r.gender}</td>
                    <td class="p-4">\${r.purok}</td>
                    <td class="p-4 text-slate-500">\${r.contact || 'N/A'}</td>
                    <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold \${r.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}">\${r.status}</span></td>
                    <td class="p-4 text-right space-x-2">
                        <button onclick="printResidentID(\${r.id})" class="text-xs bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg text-slate-700 font-medium">🪪 ID Card</button>
                        \${r.status === 'Active' ? \`
                            <button onclick="archiveResident(\${r.id})" class="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg font-medium">Archive</button>
                        \` : \`
                            <button onclick="restoreResident(\${r.id})" class="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-lg font-medium">Restore</button>
                            <button onclick="deleteResident(\${r.id})" class="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 px-2.5 py-1 rounded-lg font-medium">Delete</button>
                        \`}
                    </td>
                </tr>
            \`).join('');
        }

        async function filterResidents() {
            const search = document.getElementById('res-search').value;
            const status = document.getElementById('res-filter-status').value;
            const list = await api(\`/api/residents?status=\${status}&search=\${search}\`);
            document.getElementById('res-table-body').innerHTML = renderResidentRows(list);
        }

        function openAddResidentModal() {
            const modalHtml = \`
                <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
                    <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 my-8">
                        <h2 class="text-lg font-bold text-slate-800">Register New Resident</h2>
                        <form onsubmit="saveNewResident(event)" class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">First Name *</label><input type="text" id="add_fn" required class="w-full px-3 py-2 border rounded-lg"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Middle Name</label><input type="text" id="add_mn" class="w-full px-3 py-2 border rounded-lg"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Last Name *</label><input type="text" id="add_ln" required class="w-full px-3 py-2 border rounded-lg"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Suffix</label><input type="text" id="add_suf" placeholder="e.g. Jr., III" class="w-full px-3 py-2 border rounded-lg"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Date of Birth *</label><input type="date" id="add_dob" required class="w-full px-3 py-2 border rounded-lg"></div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Gender *</label>
                                <select id="add_gender" required class="w-full px-3 py-2 border rounded-lg"><option value="Male">Male</option><option value="Female">Female</option></select>
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Civil Status *</label>
                                <select id="add_civil" required class="w-full px-3 py-2 border rounded-lg">
                                    <option value="Single">Single</option><option value="Married">Married</option><option value="Widowed">Widowed</option><option value="Separated">Separated</option>
                                </select>
                            </div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Contact Number</label><input type="text" id="add_contact" class="w-full px-3 py-2 border rounded-lg"></div>
                            <div class="md:col-span-2"><label class="block text-xs font-semibold text-slate-600 mb-1">Full Street Address *</label><input type="text" id="add_address" required class="w-full px-3 py-2 border rounded-lg"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Purok / Zone *</label><input type="text" id="add_purok" required placeholder="Purok 1" class="w-full px-3 py-2 border rounded-lg"></div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Voter Status</label>
                                <select id="add_voter" class="w-full px-3 py-2 border rounded-lg"><option value="Yes">Registered Voter</option><option value="No">No</option></select>
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">PWD Status</label>
                                <select id="add_pwd" class="w-full px-3 py-2 border rounded-lg"><option value="No">No</option><option value="Yes">Yes</option></select>
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Solo Parent</label>
                                <select id="add_solo" class="w-full px-3 py-2 border rounded-lg"><option value="No">No</option><option value="Yes">Yes</option></select>
                            </div>

                            <div class="md:col-span-2 flex justify-end gap-2 mt-4">
                                <button type="button" onclick="closeModal()" class="px-4 py-2 border rounded-xl text-slate-600 hover:bg-slate-50">Cancel</button>
                                <button type="submit" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold">Save Resident</button>
                            </div>
                        </form>
                    </div>
                </div>
            \`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        function closeModal() {
            const modals = document.querySelectorAll('.fixed.inset-0');
            modals.forEach(m => m.remove());
        }

        async function saveNewResident(e) {
            e.preventDefault();
            try {
                const res = await api('/api residents'.replace(' ', '/'), 'POST', {
                    first_name: document.getElementById('add_fn').value,
                    middle_name: document.getElementById('add_mn').value,
                    last_name: document.getElementById('add_ln').value,
                    suffix: document.getElementById('add_suf').value,
                    dob: document.getElementById('add_dob').value,
                    gender: document.getElementById('add_gender').value,
                    civil_status: document.getElementById('add_civil').value,
                    contact: document.getElementById('add_contact').value,
                    address: document.getElementById('add_address').value,
                    purok: document.getElementById('add_purok').value,
                    voter_status: document.getElementById('add_voter').value,
                    pwd_status: document.getElementById('add_pwd').value,
                    solo_parent: document.getElementById('add_solo').value
                });
                showToast(res.message);
                closeModal();
                loadTabContent('residents');
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        async function archiveResident(id) {
            if (!confirm('Are you sure you want to archive this resident?')) return;
            await api(\`/api/residents/\${id}/archive\`, 'PATCH');
            showToast('Resident archived');
            filterResidents();
        }

        async function restoreResident(id) {
            await api(\`/api/residents/\${id}/restore\`, 'PATCH');
            showToast('Resident restored');
            filterResidents();
        }

        async function deleteResident(id) {
            if (!confirm('PERMANENT ACTION: Are you sure you want to permanently delete this record?')) return;
            await api(\`/api/residents/\${id}\`, 'DELETE');
            showToast('Resident permanently deleted');
            filterResidents();
        }

        async function printResidentID(id) {
            const res = await api(\`/api/residents/\${id}\`);
            const logo = state.settings.logo || 'https://placehold.co/80x80/1e293b/ffffff?text=BRGY';

            const modalHtml = \`
                <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
                        <div class="flex justify-between items-center no-print">
                            <h3 class="font-bold text-slate-800">Printable Resident ID Card</h3>
                            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600">✕</button>
                        </div>

                        <!-- ID Card Container -->
                        <div id="printable-id-card" class="w-[340px] h-[215px] mx-auto bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-4 shadow-xl flex flex-col justify-between relative overflow-hidden border-2 border-blue-400/30">
                            <!-- Background Emblem -->
                            <div class="absolute -right-10 -bottom-10 opacity-10 text-9xl font-black select-none">BRGY</div>
                            
                            <!-- Header -->
                            <div class="flex items-center gap-3 border-b border-white/20 pb-2">
                                <img src="\${logo}" class="w-10 h-10 rounded-full bg-white p-0.5 object-cover">
                                <div>
                                    <h4 class="text-xs font-bold uppercase tracking-wider text-blue-200">\${state.settings.barangay_name}</h4>
                                    <p class="text-[9px] text-slate-300">\${state.settings.municipality}, \${state.settings.province}</p>
                                </div>
                            </div>

                            <!-- Body -->
                            <div class="flex gap-3 items-center my-1">
                                <div class="w-20 h-24 bg-slate-700 rounded-xl border border-white/30 overflow-hidden flex-shrink-0 flex items-center justify-center text-xs text-slate-400">
                                    \${res.photo ? \`<img src="\${res.photo}" class="w-full h-full object-cover">\` : 'NO PHOTO'}
                                </div>
                                <div class="space-y-1 text-left flex-1 min-w-0">
                                    <p class="text-[10px] text-blue-300 font-semibold uppercase tracking-wider">RESIDENT IDENTIFIER</p>
                                    <h3 class="text-sm font-black truncate leading-tight">\${res.first_name} \${res.last_name}</h3>
                                    <p class="text-[10px] text-slate-300">ID: <strong class="text-yellow-400 font-mono">\${res.resident_code}</strong></p>
                                    <p class="text-[10px] text-slate-300 truncate">Purok: \${res.purok}</p>
                                    <p class="text-[10px] text-slate-300 truncate">DOB: \${res.dob}</p>
                                </div>
                            </div>

                            <!-- Footer -->
                            <div class="flex justify-between items-end border-t border-white/20 pt-2 text-[8px] text-slate-300">
                                <div>
                                    <p>Issued by: Barangay Authority</p>
                                    <p class="font-bold text-white mt-0.5">\${state.settings.captain || 'Barangay Captain'}</p>
                                </div>
                                <div id="qrcode-container" class="bg-white p-1 rounded"></div>
                            </div>
                        </div>

                        <div class="flex justify-end gap-2 no-print">
                            <button onclick="window.print()" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm">Print ID Card</button>
                        </div>
                    </div>
                </div>
            \`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Generate Verification QR Code
            setTimeout(() => {
                const qrContainer = document.getElementById('qrcode-container');
                if (qrContainer) {
                    new QRCode(qrContainer, {
                        text: window.location.origin + '/verify/' + res.resident_code,
                        width: 36,
                        height: 36
                    });
                }
            }, 100);
        }

        async function renderCertificatesView(container) {
            const certs = await api('/api/certificates');
            const isResident = state.user.role === 'Resident';

            container.innerHTML = \`
                <div class="space-y-4">
                    <div class="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200">
                        <h3 class="font-bold text-slate-800">Certificate Records & Applications</h3>
                        <button onclick="openRequestCertModal()" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition">
                            + Request New Certificate
                        </button>
                    </div>

                    <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <table class="w-full text-left border-collapse text-sm">
                            <thead class="bg-slate-50 text-slate-500 font-semibold text-xs uppercase border-b">
                                <tr>
                                    <th class="p-4">Control #</th>
                                    <th class="p-4">Resident</th>
                                    <th class="p-4">Certificate Type</th>
                                    <th class="p-4">Purpose</th>
                                    <th class="p-4">Status</th>
                                    <th class="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                \${certs.length === 0 ? '<tr><td colspan="6" class="text-center p-8 text-slate-400">No certificate requests found.</td></tr>' : 
                                    certs.map(c => \`
                                        <tr class="hover:bg-slate-50">
                                            <td class="p-4 font-mono font-bold text-slate-700">\${c.cert_number}</td>
                                            <td class="p-4 font-semibold text-slate-800">\${c.first_name} \${c.last_name}</td>
                                            <td class="p-4 font-medium text-blue-600">\${c.type}</td>
                                            <td class="p-4 text-slate-500">\${c.purpose || 'N/A'}</td>
                                            <td class="p-4">
                                                <span class="px-2.5 py-1 rounded-full text-xs font-semibold 
                                                    \${c.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 
                                                      c.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}">
                                                    \${c.status}
                                                </span>
                                            </td>
                                            <td class="p-4 text-right space-x-1">
                                                \${!isResident ? \`
                                                    <button onclick="updateCertStatus(\${c.id}, 'Approved')" class="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded font-medium">Approve</button>
                                                    <button onclick="updateCertStatus(\${c.id}, 'Rejected')" class="text-xs bg-rose-50 text-rose-700 px-2 py-1 rounded font-medium">Reject</button>
                                                    <button onclick="printCertificate('\${c.type}', '\${c.first_name} \${c.last_name}', '\${c.cert_number}', '\${c.purpose}')" class="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded font-medium">Print</button>
                                                \` : ''}
                                            </td>
                                        </tr>
                                    \`).join('')
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            \`;
        }

        function openRequestCertModal() {
            const modalHtml = \`
                <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div class="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
                        <h3 class="font-bold text-slate-800">Request Barangay Certificate</h3>
                        <form onsubmit="submitCertRequest(event)" class="space-y-3 text-sm">
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Certificate Type</label>
                                <select id="cert_type" required class="w-full px-3 py-2 border rounded-xl">
                                    <option value="Barangay Clearance">Barangay Clearance</option>
                                    <option value="Certificate of Residency">Certificate of Residency</option>
                                    <option value="Certificate of Indigency">Certificate of Indigency</option>
                                    <option value="Certificate of Good Moral">Certificate of Good Moral</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Purpose / Reason</label>
                                <textarea id="cert_purpose" required rows="3" placeholder="e.g. Employment, Scholarship, ID application" class="w-full px-3 py-2 border rounded-xl"></textarea>
                            </div>
                            <div class="flex justify-end gap-2 pt-2">
                                <button type="button" onclick="closeModal()" class="px-4 py-2 border rounded-xl text-slate-600">Cancel</button>
                                <button type="submit" class="px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold">Submit Request</button>
                            </div>
                        </form>
                    </div>
                </div>
            \`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        async function submitCertRequest(e) {
            e.preventDefault();
            try {
                const res = await api('/api/certificates', 'POST', {
                    type: document.getElementById('cert_type').value,
                    purpose: document.getElementById('cert_purpose').value
                });
                showToast(res.message);
                closeModal();
                loadTabContent(state.activeTab);
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        async function updateCertStatus(id, status) {
            await api(\`/api/certificates/\${id}/status\`, 'PATCH', { status });
            showToast('Certificate status updated to ' + status);
            loadTabContent('certificates');
        }

        function printCertificate(type, residentName, certNum, purpose) {
            const printWindow = window.open('', '_blank');
            printWindow.document.write(\`
                <html>
                <head>
                    <title>\${type} - \${residentName}</title>
                    <style>
                        body { font-family: serif; padding: 40px; text-align: center; }
                        .header { border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 30px; }
                        .title { font-size: 24px; font-weight: bold; text-transform: uppercase; margin: 40px 0; }
                        .content { font-size: 18px; line-height: 1.8; text-align: justify; margin-bottom: 60px; }
                        .footer { margin-top: 80px; text-align: right; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h2>Republic of the Philippines</h2>
                        <h3>\${state.settings.province || 'Province'}, \${state.settings.municipality || 'City'}</h3>
                        <h1>OFFICE OF THE BARANGAY CAPTAIN</h1>
                        <p>\${state.settings.barangay_name}</p>
                    </div>

                    <div class="title">\${type}</div>

                    <div class="content">
                        <p><strong>TO WHOM IT MAY CONCERN:</strong></p>
                        <br>
                        <p>This is to certify that <strong>\${residentName}</strong> is a bonafide resident of \${state.settings.barangay_name}. Based on official records, the resident bears good moral character and has no derogatory record filed in this office.</p>
                        <br>
                        <p>This certificate is issued upon request for the purpose of: <strong>\${purpose || 'General Clearance'}</strong>.</p>
                        <br>
                        <p>Issued this <strong>\${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</strong> at \${state.settings.barangay_name}.</p>
                    </div>

                    <div class="footer">
                        <p>___________________________</p>
                        <p><strong>\${state.settings.captain || 'Hon. Barangay Captain'}</strong></p>
                        <p>Barangay Captain</p>
                    </div>
                </body>
                </html>
            \`);
            printWindow.document.close();
            printWindow.print();
        }

        async function renderAppointmentsView(container) {
            const appts = await api('/api/appointments');
            const isResident = state.user.role === 'Resident';

            container.innerHTML = \`
                <div class="space-y-4">
                    <div class="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200">
                        <h3 class="font-bold text-slate-800">Scheduled Appointments</h3>
                        <button onclick="openAppointmentModal()" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition">
                            + Schedule Appointment
                        </button>
                    </div>

                    <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <table class="w-full text-left border-collapse text-sm">
                            <thead class="bg-slate-50 text-slate-500 font-semibold text-xs uppercase border-b">
                                <tr>
                                    <th class="p-4">Resident</th>
                                    <th class="p-4">Service</th>
                                    <th class="p-4">Date & Time</th>
                                    <th class="p-4">Status</th>
                                    <th class="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                \${appts.length === 0 ? '<tr><td colspan="5" class="text-center p-8 text-slate-400">No scheduled appointments.</td></tr>' :
                                    appts.map(a => \`
                                        <tr class="hover:bg-slate-50">
                                            <td class="p-4 font-semibold text-slate-800">\${a.first_name} \${a.last_name}</td>
                                            <td class="p-4 text-blue-600 font-medium">\${a.service}</td>
                                            <td class="p-4">\${a.app_date} @ \${a.app_time}</td>
                                            <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">\${a.status}</span></td>
                                            <td class="p-4 text-right">
                                                \${!isResident ? \`
                                                    <button onclick="updateApptStatus(\${a.id}, 'Approved')" class="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded">Approve</button>
                                                    <button onclick="updateApptStatus(\${a.id}, 'Rejected')" class="text-xs bg-rose-50 text-rose-700 px-2 py-1 rounded">Reject</button>
                                                \` : ''}
                                            </td>
                                        </tr>
                                    \`).join('')
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            \`;
        }

        function openAppointmentModal() {
            const modalHtml = \`
                <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div class="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
                        <h3 class="font-bold text-slate-800">Book Appointment</h3>
                        <form onsubmit="submitAppointment(event)" class="space-y-3 text-sm">
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Service Needed</label>
                                <input type="text" id="app_service" required placeholder="e.g. Consult, Dispute Hearing" class="w-full px-3 py-2 border rounded-xl">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Date</label>
                                <input type="date" id="app_date" required class="w-full px-3 py-2 border rounded-xl">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Preferred Time</label>
                                <select id="app_time" required class="w-full px-3 py-2 border rounded-xl">
                                    <option value="09:00 AM">09:00 AM</option>
                                    <option value="10:00 AM">10:00 AM</option>
                                    <option value="02:00 PM">02:00 PM</option>
                                    <option value="03:00 PM">03:00 PM</option>
                                </select>
                            </div>
                            <div class="flex justify-end gap-2 pt-2">
                                <button type="button" onclick="closeModal()" class="px-4 py-2 border rounded-xl text-slate-600">Cancel</button>
                                <button type="submit" class="px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold">Book Appointment</button>
                            </div>
                        </form>
                    </div>
                </div>
            \`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        async function submitAppointment(e) {
            e.preventDefault();
            try {
                const res = await api('/api/appointments', 'POST', {
                    service: document.getElementById('app_service').value,
                    app_date: document.getElementById('app_date').value,
                    app_time: document.getElementById('app_time').value
                });
                showToast(res.message);
                closeModal();
                loadTabContent(state.activeTab);
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        async function updateApptStatus(id, status) {
            await api(\`/api/appointments/\${id}/status\`, 'PATCH', { status });
            showToast('Appointment ' + status);
            loadTabContent(state.activeTab);
        }

        async function renderBlotterView(container) {
            const blotter = await api('/api/blotter');
            container.innerHTML = \`
                <div class="space-y-4">
                    <div class="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200">
                        <h3 class="font-bold text-slate-800">Blotter & Incident Reports</h3>
                        <button onclick="openFileBlotterModal()" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm shadow transition">+ File Blotter/Complaint</button>
                    </div>

                    <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <table class="w-full text-left border-collapse text-sm">
                            <thead class="bg-slate-50 text-slate-500 font-semibold text-xs uppercase border-b">
                                <tr>
                                    <th class="p-4">Case #</th>
                                    <th class="p-4">Complainant</th>
                                    <th class="p-4">Respondent</th>
                                    <th class="p-4">Incident Date</th>
                                    <th class="p-4">Status</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                \${blotter.length === 0 ? '<tr><td colspan="5" class="text-center p-8 text-slate-400">No blotter cases recorded.</td></tr>' :
                                    blotter.map(b => \`
                                        <tr class="hover:bg-slate-50">
                                            <td class="p-4 font-mono font-bold text-rose-600">\${b.case_number}</td>
                                            <td class="p-4 font-semibold text-slate-800">\${b.complainant}</td>
                                            <td class="p-4 text-slate-600">\${b.respondent}</td>
                                            <td class="p-4 text-slate-500">\${b.incident_date}</td>
                                            <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700">\${b.status}</span></td>
                                        </tr>
                                    \`).join('')
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            \`;
        }

        function openFileBlotterModal() {
            const modalHtml = \`
                <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div class="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4">
                        <h3 class="font-bold text-slate-800">Log Incident / Blotter Report</h3>
                        <form onsubmit="submitBlotter(event)" class="space-y-3 text-sm">
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Complainant Name</label><input type="text" id="bl_comp" required class="w-full px-3 py-2 border rounded-xl"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Respondent Name</label><input type="text" id="bl_resp" class="w-full px-3 py-2 border rounded-xl"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Incident Date</label><input type="date" id="bl_date" required class="w-full px-3 py-2 border rounded-xl"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Description / Narrative</label><textarea id="bl_desc" required rows="3" class="w-full px-3 py-2 border rounded-xl"></textarea></div>
                            <div class="flex justify-end gap-2 pt-2">
                                <button type="button" onclick="closeModal()" class="px-4 py-2 border rounded-xl text-slate-600">Cancel</button>
                                <button type="submit" class="px-5 py-2 bg-rose-600 text-white rounded-xl font-semibold">Log Complaint</button>
                            </div>
                        </form>
                    </div>
                </div>
            \`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        async function submitBlotter(e) {
            e.preventDefault();
            try {
                const res = await api('/api/blotter', 'POST', {
                    complainant: document.getElementById('bl_comp').value,
                    respondent: document.getElementById('bl_resp').value,
                    incident_date: document.getElementById('bl_date').value,
                    description: document.getElementById('bl_desc').value
                });
                showToast(res.message);
                closeModal();
                loadTabContent(state.activeTab);
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        async function renderAssistanceView(container) {
            const list = await api('/api/assistance');
            container.innerHTML = \`
                <div class="space-y-4">
                    <div class="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200">
                        <h3 class="font-bold text-slate-800">Financial & Social Assistance Requests</h3>
                        \${state.user.role === 'Resident' ? '<button onclick="openAssistanceModal()" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">+ Apply for Assistance</button>' : ''}
                    </div>
                    <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-slate-50 border-b text-xs uppercase text-slate-500 font-semibold">
                                <tr>
                                    <th class="p-4">Resident</th>
                                    <th class="p-4">Assistance Type</th>
                                    <th class="p-4">Details</th>
                                    <th class="p-4">Status</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y">
                                \${list.length === 0 ? '<tr><td colspan="4" class="text-center p-8 text-slate-400">No assistance records found.</td></tr>' :
                                    list.map(a => \`
                                        <tr>
                                            <td class="p-4 font-bold text-slate-800">\${a.first_name} \${a.last_name}</td>
                                            <td class="p-4 font-medium text-emerald-600">\${a.type}</td>
                                            <td class="p-4 text-slate-500">\${a.details || 'N/A'}</td>
                                            <td class="p-4"><span class="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">\${a.status}</span></td>
                                        </tr>
                                    \`).join('')
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            \`;
        }

        function openAssistanceModal() {
            const modalHtml = \`
                <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div class="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
                        <h3 class="font-bold text-slate-800">Request Financial / Social Assistance</h3>
                        <form onsubmit="submitAssistance(event)" class="space-y-3 text-sm">
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Type of Assistance</label>
                                <select id="ast_type" required class="w-full px-3 py-2 border rounded-xl">
                                    <option value="Financial">Financial Assistance</option>
                                    <option value="Medical">Medical Assistance</option>
                                    <option value="Educational">Educational Assistance</option>
                                    <option value="Food">Food / Relief Supplies</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Details / Explanation</label>
                                <textarea id="ast_details" required rows="3" class="w-full px-3 py-2 border rounded-xl"></textarea>
                            </div>
                            <div class="flex justify-end gap-2 pt-2">
                                <button type="button" onclick="closeModal()" class="px-4 py-2 border rounded-xl text-slate-600">Cancel</button>
                                <button type="submit" class="px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold">Submit Request</button>
                            </div>
                        </form>
                    </div>
                </div>
            \`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        async function submitAssistance(e) {
            e.preventDefault();
            try {
                const res = await api('/api/assistance', 'POST', {
                    type: document.getElementById('ast_type').value,
                    details: document.getElementById('ast_details').value
                });
                showToast(res.message);
                closeModal();
                loadTabContent(state.activeTab);
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        async function renderAnnouncementsView(container) {
            const ann = await api('/api/announcements');
            const isStaff = state.user.role !== 'Resident';

            container.innerHTML = \`
                <div class="space-y-4">
                    <div class="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200">
                        <h3 class="font-bold text-slate-800">Barangay Announcements Bulletin</h3>
                        \${isStaff ? '<button onclick="openAddAnnouncementModal()" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">+ Post Announcement</button>' : ''}
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        \${ann.length === 0 ? '<div class="col-span-2 text-center p-8 bg-white rounded-2xl border text-slate-400">No public announcements posted.</div>' : 
                            ann.map(a => \`
                                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                                    <div class="flex justify-between items-start">
                                        <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">\${a.category}</span>
                                        <span class="text-xs text-slate-400">\${new Date(a.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <h4 class="font-bold text-slate-800">\${a.title}</h4>
                                    <p class="text-xs text-slate-600 leading-relaxed">\${a.content}</p>
                                </div>
                            \`).join('')
                        }
                    </div>
                </div>
            \`;
        }

        function openAddAnnouncementModal() {
            const modalHtml = \`
                <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div class="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
                        <h3 class="font-bold text-slate-800">Publish Announcement</h3>
                        <form onsubmit="submitAnnouncement(event)" class="space-y-3 text-sm">
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Title</label><input type="text" id="anc_title" required class="w-full px-3 py-2 border rounded-xl"></div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Category</label>
                                <select id="anc_cat" class="w-full px-3 py-2 border rounded-xl">
                                    <option value="General">General</option>
                                    <option value="Event">Community Event</option>
                                    <option value="Emergency">Emergency Notice</option>
                                </select>
                            </div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Content</label><textarea id="anc_content" required rows="4" class="w-full px-3 py-2 border rounded-xl"></textarea></div>
                            <div class="flex justify-end gap-2 pt-2">
                                <button type="button" onclick="closeModal()" class="px-4 py-2 border rounded-xl text-slate-600">Cancel</button>
                                <button type="submit" class="px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold">Publish</button>
                            </div>
                        </form>
                    </div>
                </div>
            \`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        async function submitAnnouncement(e) {
            e.preventDefault();
            try {
                const res = await api('/api/announcements', 'POST', {
                    title: document.getElementById('anc_title').value,
                    category: document.getElementById('anc_cat').value,
                    content: document.getElementById('anc_content').value
                });
                showToast(res.message);
                closeModal();
                loadTabContent(state.activeTab);
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        async function renderSettingsView(container) {
            const settings = await api('/api/settings');
            container.innerHTML = \`
                <div class="bg-white p-6 rounded-2xl border border-slate-200 max-w-2xl mx-auto shadow-sm space-y-4">
                    <h3 class="font-bold text-slate-800 text-lg border-b pb-3">Barangay Official Configuration</h3>
                    <form onsubmit="saveSettings(event)" class="space-y-4 text-sm">
                        <div class="grid grid-cols-2 gap-4">
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Barangay Name</label><input type="text" id="set_brgy" value="\${settings.barangay_name || ''}" required class="w-full px-3 py-2 border rounded-xl"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Municipality / City</label><input type="text" id="set_muni" value="\${settings.municipality || ''}" required class="w-full px-3 py-2 border rounded-xl"></div>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Province</label><input type="text" id="set_prov" value="\${settings.province || ''}" required class="w-full px-3 py-2 border rounded-xl"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Contact Phone</label><input type="text" id="set_contact" value="\${settings.contact || ''}" class="w-full px-3 py-2 border rounded-xl"></div>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Barangay Captain</label><input type="text" id="set_capt" value="\${settings.captain || ''}" class="w-full px-3 py-2 border rounded-xl"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Barangay Secretary</label><input type="text" id="set_sec" value="\${settings.secretary || ''}" class="w-full px-3 py-2 border rounded-xl"></div>
                        </div>
                        <div><label class="block text-xs font-semibold text-slate-600 mb-1">Barangay Logo Image URL</label><input type="text" id="set_logo" value="\${settings.logo || ''}" placeholder="https://..." class="w-full px-3 py-2 border rounded-xl"></div>
                        <button type="submit" class="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl">Save Barangay Settings</button>
                    </form>
                </div>
            \`;
        }

        async function saveSettings(e) {
            e.preventDefault();
            try {
                await api('/api/settings', 'PUT', {
                    barangay_name: document.getElementById('set_brgy').value,
                    municipality: document.getElementById('set_muni').value,
                    province: document.getElementById('set_prov').value,
                    contact: document.getElementById('set_contact').value,
                    captain: document.getElementById('set_capt').value,
                    secretary: document.getElementById('set_sec').value,
                    logo: document.getElementById('set_logo').value
                });
                showToast('Barangay settings updated!');
                initApp();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        async function renderHouseholdsView(container) {
            const list = await api('/api/households');
            container.innerHTML = \`
                <div class="space-y-4">
                    <div class="flex justify-between items-center bg-white p-4 rounded-2xl border">
                        <h3 class="font-bold text-slate-800">Barangay Households</h3>
                        <button onclick="openAddHouseholdModal()" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">+ Add Household</button>
                    </div>
                    <div class="bg-white rounded-2xl border overflow-hidden">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-slate-50 border-b text-xs uppercase text-slate-500 font-semibold">
                                <tr><th class="p-4">Household #</th><th class="p-4">Address</th><th class="p-4">Purok</th><th class="p-4">Members</th></tr>
                            </thead>
                            <tbody class="divide-y">
                                \${list.length === 0 ? '<tr><td colspan="4" class="text-center p-8 text-slate-400">No households registered.</td></tr>' :
                                    list.map(h => \`
                                        <tr>
                                            <td class="p-4 font-bold text-blue-600">#\${h.household_number}</td>
                                            <td class="p-4">\${h.address || 'N/A'}</td>
                                            <td class="p-4">\${h.purok || 'N/A'}</td>
                                            <td class="p-4 font-semibold">\${h.member_count} residents</td>
                                        </tr>
                                    \`).join('')
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            \`;
        }

        function openAddHouseholdModal() {
            const modalHtml = \`
                <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div class="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
                        <h3 class="font-bold text-slate-800">Register Household</h3>
                        <form onsubmit="submitHousehold(event)" class="space-y-3 text-sm">
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Household Number</label><input type="text" id="hh_num" required placeholder="HH-001" class="w-full px-3 py-2 border rounded-xl"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Street Address</label><input type="text" id="hh_addr" required class="w-full px-3 py-2 border rounded-xl"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Purok</label><input type="text" id="hh_purok" required class="w-full px-3 py-2 border rounded-xl"></div>
                            <div class="flex justify-end gap-2 pt-2">
                                <button type="button" onclick="closeModal()" class="px-4 py-2 border rounded-xl text-slate-600">Cancel</button>
                                <button type="submit" class="px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold">Save Household</button>
                            </div>
                        </form>
                    </div>
                </div>
            \`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        async function submitHousehold(e) {
            e.preventDefault();
            try {
                const res = await api('/api/households', 'POST', {
                    household_number: document.getElementById('hh_num').value,
                    address: document.getElementById('hh_addr').value,
                    purok: document.getElementById('hh_purok').value
                });
                showToast(res.message);
                closeModal();
                loadTabContent('households');
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        async function renderPuroksView(container) {
            const list = await api('/api/puroks');
            container.innerHTML = \`
                <div class="space-y-4">
                    <div class="flex justify-between items-center bg-white p-4 rounded-2xl border">
                        <h3 class="font-bold text-slate-800">Purok / Zone Directory</h3>
                        <button onclick="openAddPurokModal()" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">+ Add Purok</button>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        \${list.length === 0 ? '<div class="col-span-3 text-center p-8 bg-white border rounded-2xl text-slate-400">No puroks defined.</div>' :
                            list.map(p => \`
                                <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                                    <h4 class="font-bold text-slate-800 text-lg">\${p.name}</h4>
                                    <p class="text-xs text-slate-500">\${p.description || 'No description'}</p>
                                    <div class="flex justify-between text-xs pt-2 border-t font-semibold text-slate-600">
                                        <span>Residents: \${p.resident_count}</span>
                                        <span>Households: \${p.household_count}</span>
                                    </div>
                                </div>
                            \`).join('')
                        }
                    </div>
                </div>
            \`;
        }

        function openAddPurokModal() {
            const modalHtml = \`
                <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div class="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
                        <h3 class="font-bold text-slate-800">Add New Purok</h3>
                        <form onsubmit="submitPurok(event)" class="space-y-3 text-sm">
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Purok Name</label><input type="text" id="pk_name" required placeholder="e.g. Purok Sampaguita" class="w-full px-3 py-2 border rounded-xl"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Description</label><input type="text" id="pk_desc" class="w-full px-3 py-2 border rounded-xl"></div>
                            <div class="flex justify-end gap-2 pt-2">
                                <button type="button" onclick="closeModal()" class="px-4 py-2 border rounded-xl text-slate-600">Cancel</button>
                                <button type="submit" class="px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold">Save Purok</button>
                            </div>
                        </form>
                    </div>
                </div>
            \`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        async function submitPurok(e) {
            e.preventDefault();
            try {
                const res = await api('/api/puroks', 'POST', {
                    name: document.getElementById('pk_name').value,
                    description: document.getElementById('pk_desc').value
                });
                showToast(res.message);
                closeModal();
                loadTabContent('puroks');
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        async function renderBusinessesView(container) {
            const list = await api('/api/businesses');
            container.innerHTML = \`
                <div class="space-y-4">
                    <div class="flex justify-between items-center bg-white p-4 rounded-2xl border">
                        <h3 class="font-bold text-slate-800">Commercial & Business Management</h3>
                        <button onclick="openAddBusinessModal()" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">+ Register Business</button>
                    </div>
                    <div class="bg-white rounded-2xl border overflow-hidden">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-slate-50 border-b text-xs uppercase text-slate-500 font-semibold">
                                <tr><th class="p-4">Business Name</th><th class="p-4">Owner</th><th class="p-4">Type</th><th class="p-4">Permit #</th></tr>
                            </thead>
                            <tbody class="divide-y">
                                \${list.length === 0 ? '<tr><td colspan="4" class="text-center p-8 text-slate-400">No registered businesses found.</td></tr>' :
                                    list.map(b => \`
                                        <tr>
                                            <td class="p-4 font-bold text-slate-800">\${b.business_name}</td>
                                            <td class="p-4 text-slate-600">\${b.owner_name}</td>
                                            <td class="p-4">\${b.type}</td>
                                            <td class="p-4 font-mono text-emerald-600 font-semibold">\${b.permit_number || 'Pending'}</td>
                                        </tr>
                                    \`).join('')
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            \`;
        }

        function openAddBusinessModal() {
            const modalHtml = \`
                <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div class="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
                        <h3 class="font-bold text-slate-800">Register Business Establishment</h3>
                        <form onsubmit="submitBusiness(event)" class="space-y-3 text-sm">
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Business Name</label><input type="text" id="bz_name" required class="w-full px-3 py-2 border rounded-xl"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Owner Name</label><input type="text" id="bz_owner" required class="w-full px-3 py-2 border rounded-xl"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Business Type</label><input type="text" id="bz_type" required placeholder="Sari-Sari Store, Bakery" class="w-full px-3 py-2 border rounded-xl"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Address</label><input type="text" id="bz_addr" required class="w-full px-3 py-2 border rounded-xl"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Barangay Permit #</label><input type="text" id="bz_permit" class="w-full px-3 py-2 border rounded-xl"></div>
                            <div class="flex justify-end gap-2 pt-2">
                                <button type="button" onclick="closeModal()" class="px-4 py-2 border rounded-xl text-slate-600">Cancel</button>
                                <button type="submit" class="px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold">Save Business</button>
                            </div>
                        </form>
                    </div>
                </div>
            \`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        async function submitBusiness(e) {
            e.preventDefault();
            try {
                const res = await api('/api/businesses', 'POST', {
                    business_name: document.getElementById('bz_name').value,
                    owner_name: document.getElementById('bz_owner').value,
                    type: document.getElementById('bz_type').value,
                    address: document.getElementById('bz_addr').value,
                    permit_number: document.getElementById('bz_permit').value
                });
                showToast(res.message);
                closeModal();
                loadTabContent('businesses');
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        async function renderUsersView(container) {
            const list = await api('/api/users');
            container.innerHTML = \`
                <div class="space-y-4">
                    <div class="flex justify-between items-center bg-white p-4 rounded-2xl border">
                        <h3 class="font-bold text-slate-800">System Staff & Role Accounts</h3>
                        <button onclick="openAddUserModal()" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">+ Create Staff Account</button>
                    </div>
                    <div class="bg-white rounded-2xl border overflow-hidden">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-slate-50 border-b text-xs uppercase text-slate-500 font-semibold">
                                <tr><th class="p-4">Full Name</th><th class="p-4">Username</th><th class="p-4">Role</th></tr>
                            </thead>
                            <tbody class="divide-y">
                                \${list.map(u => \`
                                    <tr>
                                        <td class="p-4 font-bold text-slate-800">\${u.full_name}</td>
                                        <td class="p-4 text-slate-600">@\${u.username}</td>
                                        <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">\${u.role}</span></td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            \`;
        }

        function openAddUserModal() {
            const modalHtml = \`
                <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div class="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
                        <h3 class="font-bold text-slate-800">Create Staff User</h3>
                        <form onsubmit="submitUser(event)" class="space-y-3 text-sm">
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Full Name</label><input type="text" id="usr_name" required class="w-full px-3 py-2 border rounded-xl"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Username</label><input type="text" id="usr_user" required class="w-full px-3 py-2 border rounded-xl"></div>
                            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Password</label><input type="password" id="usr_pass" required class="w-full px-3 py-2 border rounded-xl"></div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Role Privilege</label>
                                <select id="usr_role" class="w-full px-3 py-2 border rounded-xl">
                                    <option value="Staff">Barangay Staff</option>
                                    <option value="Secretary">Barangay Secretary</option>
                                    <option value="Captain">Barangay Captain</option>
                                    <option value="Administrator">Administrator</option>
                                </select>
                            </div>
                            <div class="flex justify-end gap-2 pt-2">
                                <button type="button" onclick="closeModal()" class="px-4 py-2 border rounded-xl text-slate-600">Cancel</button>
                                <button type="submit" class="px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold">Create Account</button>
                            </div>
                        </form>
                    </div>
                </div>
            \`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        async function submitUser(e) {
            e.preventDefault();
            try {
                const res = await api('/api/users', 'POST', {
                    full_name: document.getElementById('usr_name').value,
                    username: document.getElementById('usr_user').value,
                    password: document.getElementById('usr_pass').value,
                    role: document.getElementById('usr_role').value
                });
                showToast(res.message);
                closeModal();
                loadTabContent('users');
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        async function renderLogsView(container) {
            const logs = await api('/api/logs');
            container.innerHTML = \`
                <div class="bg-white p-6 rounded-2xl border shadow-sm">
                    <h3 class="font-bold text-slate-800 mb-4">System Activity Audit Trail</h3>
                    <div class="space-y-3">
                        \${logs.map(l => \`
                            <div class="p-3 bg-slate-50 rounded-xl border text-xs flex justify-between items-center">
                                <div>
                                    <span class="font-bold text-slate-800">\${l.user_name}</span> 
                                    <span class="text-blue-600 font-semibold">[\${l.role}]</span>: 
                                    <span class="text-slate-600">\${l.action} - \${l.description}</span>
                                </div>
                                <span class="text-slate-400">\${new Date(l.created_at).toLocaleString()}</span>
                            </div>
                        \`).join('')}
                    </div>
                </div>
            \`;
        }

        async function renderResidentDashboard(container) {
            const certs = await api('/api/certificates');
            const appts = await api('/api/appointments');

            container.innerHTML = \`
                <div class="space-y-6">
                    <div class="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6 rounded-2xl shadow-lg">
                        <h2 class="text-2xl font-bold">Welcome back, \${state.user.name}!</h2>
                        <p class="text-xs text-blue-100 mt-1">Official Resident Portal • \${state.settings.barangay_name}</p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="bg-white p-5 rounded-2xl border shadow-sm space-y-3">
                            <h3 class="font-bold text-slate-800 border-b pb-2">Your Certificate Applications</h3>
                            \${certs.length === 0 ? '<p class="text-xs text-slate-400">No active applications.</p>' : 
                                certs.map(c => \`
                                    <div class="flex justify-between text-xs p-2 bg-slate-50 rounded-lg">
                                        <span class="font-semibold text-slate-700">\${c.type}</span>
                                        <span class="font-bold text-blue-600">\${c.status}</span>
                                    </div>
                                \`).join('')
                            }
                        </div>

                        <div class="bg-white p-5 rounded-2xl border shadow-sm space-y-3">
                            <h3 class="font-bold text-slate-800 border-b pb-2">Your Appointments</h3>
                            \${appts.length === 0 ? '<p class="text-xs text-slate-400">No upcoming appointments.</p>' : 
                                appts.map(a => \`
                                    <div class="flex justify-between text-xs p-2 bg-slate-50 rounded-lg">
                                        <span class="font-semibold text-slate-700">\${a.service} (\${a.app_date})</span>
                                        <span class="font-bold text-emerald-600">\${a.status}</span>
                                    </div>
                                \`).join('')
                            }
                        </div>
                    </div>
                </div>
            \`;
        }

        async function renderResidentProfile(container) {
            if (!state.user.resident_id) {
                container.innerHTML = \`<div class="p-6 bg-amber-50 text-amber-800 rounded-xl">No resident record associated with this account.</div>\`;
                return;
            }
            const res = await api(\`/api/residents/\${state.user.resident_id}\`);
            container.innerHTML = \`
                <div class="bg-white p-6 rounded-2xl border shadow-sm max-w-xl mx-auto space-y-4">
                    <div class="flex items-center gap-4 border-b pb-4">
                        <div class="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xl">
                            \${res.first_name[0]}\${res.last_name[0]}
                        </div>
                        <div>
                            <h2 class="text-xl font-bold text-slate-800">\${res.first_name} \${res.last_name}</h2>
                            <p class="text-xs text-blue-600 font-mono font-bold">Resident ID: \${res.resident_code}</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4 text-xs">
                        <div><span class="text-slate-400 block">AGE / GENDER</span><strong class="text-slate-800 text-sm">\${res.age} yrs / \${res.gender}</strong></div>
                        <div><span class="text-slate-400 block">PUROK</span><strong class="text-slate-800 text-sm">\${res.purok}</strong></div>
                        <div><span class="text-slate-400 block">CIVIL STATUS</span><strong class="text-slate-800 text-sm">\${res.civil_status}</strong></div>
                        <div><span class="text-slate-400 block">CONTACT</span><strong class="text-slate-800 text-sm">\${res.contact || 'N/A'}</strong></div>
                        <div class="col-span-2"><span class="text-slate-400 block">ADDRESS</span><strong class="text-slate-800 text-sm">\${res.address}</strong></div>
                    </div>

                    <div class="pt-4 border-t flex justify-end">
                        <button onclick="printResidentID(\${res.id})" class="bg-blue-600 text-white font-semibold px-4 py-2 rounded-xl text-xs">Print Physical ID Card</button>
                    </div>
                </div>
            \`;
        }

        // Initialize application on page load
        window.onload = initApp;
    </script>
</body>
</html>
    `);
});

app.listen(PORT, () => {
    console.log(`Barangay Management System Server running on port ${PORT}`);
});
