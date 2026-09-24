const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'brgy_secret_key_2026_secure';

// Ensure upload directories exist
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage setup for documents, photos, and logos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname.replace(/\s+/g, '_'));
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only images, PDFs, and document files are allowed!'));
        }
    }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Initialize SQLite database
const dbFile = path.join(__dirname, 'barangay.db');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('Error opening SQLite database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.serialize(() => {
        // Barangay Settings table
        db.run(`CREATE TABLE IF NOT EXISTS barangay_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            barangay_name TEXT DEFAULT 'Barangay San Jose',
            municipality TEXT DEFAULT 'City of Manila',
            province TEXT DEFAULT 'Metro Manila',
            region TEXT DEFAULT 'National Capital Region',
            address TEXT DEFAULT '123 Main Street, Barangay San Jose',
            contact_number TEXT DEFAULT '+63 912 345 6789',
            email TEXT DEFAULT 'contact@brgysanjose.gov.ph',
            captain_name TEXT DEFAULT 'Hon. Juan Carlos',
            secretary_name TEXT DEFAULT 'Maria Santos',
            logo_path TEXT DEFAULT '',
            seal_path TEXT DEFAULT '',
            id_validity_years INTEGER DEFAULT 3,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Users table (Admin, Staff, Resident)
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT CHECK(role IN ('admin', 'staff', 'resident')),
            status TEXT CHECK(status IN ('active', 'inactive', 'pending')) DEFAULT 'pending',
            resident_id_link TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Puroks table
        db.run(`CREATE TABLE IF NOT EXISTS puroks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purok_name TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Households table
        db.run(`CREATE TABLE IF NOT EXISTS households (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            household_number TEXT UNIQUE NOT NULL,
            address TEXT NOT NULL,
            purok_id INTEGER,
            head_resident_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(purok_id) REFERENCES puroks(id),
            FOREIGN KEY(head_resident_id) REFERENCES residents(id)
        )`);

        // Residents table
        db.run(`CREATE TABLE IF NOT EXISTS residents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id_number TEXT UNIQUE NOT NULL,
            first_name TEXT NOT NULL,
            middle_name TEXT,
            last_name TEXT NOT NULL,
            suffix TEXT,
            gender TEXT,
            dob DATE,
            civil_status TEXT,
            address TEXT,
            purok_id INTEGER,
            household_id INTEGER,
            contact_number TEXT,
            email TEXT,
            occupation TEXT,
            educational_attainment TEXT,
            nationality TEXT DEFAULT 'Filipino',
            voter_status TEXT CHECK(voter_status IN ('Registered', 'Not Registered')) DEFAULT 'Not Registered',
            senior_citizen TEXT CHECK(senior_citizen IN ('Yes', 'No')) DEFAULT 'No',
            pwd_status TEXT CHECK(pwd_status IN ('Yes', 'No')) DEFAULT 'No',
            solo_parent TEXT CHECK(solo_parent IN ('Yes', 'No')) DEFAULT 'No',
            four_ps TEXT CHECK(four_ps IN ('Yes', 'No')) DEFAULT 'No',
            photo_path TEXT,
            account_status TEXT CHECK(account_status IN ('Active', 'Archived', 'Pending')) DEFAULT 'Active',
            archive_reason TEXT,
            date_registered DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(purok_id) REFERENCES puroks(id),
            FOREIGN KEY(household_id) REFERENCES households(id)
        )`);

        // Household members mapping if needed or relational via household_id
        
        // Certificate Requests table
        db.run(`CREATE TABLE IF NOT EXISTS certificate_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_number TEXT UNIQUE NOT NULL,
            resident_id INTEGER,
            certificate_type TEXT NOT NULL,
            purpose TEXT NOT NULL,
            additional_info TEXT,
            status TEXT CHECK(status IN ('Pending', 'Processing', 'Approved', 'Ready for Release', 'Released', 'Rejected')) DEFAULT 'Pending',
            remarks TEXT,
            certificate_file TEXT,
            processed_by TEXT,
            release_date DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(resident_id) REFERENCES residents(id)
        )`);

        // Appointments table
        db.run(`CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id INTEGER,
            service TEXT NOT NULL,
            appointment_date DATE NOT NULL,
            appointment_time TIME NOT NULL,
            purpose TEXT,
            notes TEXT,
            status TEXT CHECK(status IN ('Pending', 'Approved', 'Rescheduled', 'Cancelled', 'Completed')) DEFAULT 'Pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(resident_id) REFERENCES residents(id)
        )`);

        // Complaints & Blotter Cases table
        db.run(`CREATE TABLE IF NOT EXISTS blotter_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_number TEXT UNIQUE NOT NULL,
            complainant_name TEXT,
            complainant_id INTEGER,
            respondent TEXT NOT NULL,
            incident_date DATE,
            incident_time TIME,
            location TEXT,
            description TEXT NOT NULL,
            witnesses TEXT,
            action_taken TEXT,
            settlement TEXT,
            status TEXT CHECK(status IN ('Open', 'Under Investigation', 'Settled', 'Closed')) DEFAULT 'Open',
            attachment TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(complainant_id) REFERENCES residents(id)
        )`);

        // Assistance Requests table
        db.run(`CREATE TABLE IF NOT EXISTS assistance_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id INTEGER,
            assistance_type TEXT CHECK(assistance_type IN ('Financial', 'Medical', 'Educational', 'Food', 'Emergency')) NOT NULL,
            description TEXT NOT NULL,
            supporting_doc TEXT,
            status TEXT CHECK(status IN ('Pending', 'Review', 'Approved', 'Released', 'Rejected')) DEFAULT 'Pending',
            remarks TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(resident_id) REFERENCES residents(id)
        )`);

        // Announcements table
        db.run(`CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            image_path TEXT,
            priority TEXT CHECK(priority IN ('Normal', 'Important', 'Emergency')) DEFAULT 'Normal',
            expiration_date DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Notifications table
        db.run(`CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // Feedback table
        db.run(`CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id INTEGER,
            service TEXT NOT NULL,
            rating INTEGER CHECK(rating BETWEEN 1 AND 5),
            comment TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(resident_id) REFERENCES residents(id)
        )`);

        // Businesses table
        db.run(`CREATE TABLE IF NOT EXISTS businesses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            business_name TEXT NOT NULL,
            owner_name TEXT NOT NULL,
            address TEXT NOT NULL,
            purok_id INTEGER,
            business_type TEXT,
            contact_number TEXT,
            permit_number TEXT UNIQUE,
            permit_status TEXT CHECK(permit_status IN ('Active', 'Expired', 'Revoked', 'Pending')) DEFAULT 'Pending',
            expiration_date DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(purok_id) REFERENCES puroks(id)
        )`);

        // Activity Logs table
        db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            action TEXT NOT NULL,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Seed default settings and initial admin if none exist
        db.get(`SELECT COUNT(*) as count FROM barangay_settings`, (err, row) => {
            if (row && row.count === 0) {
                db.run(`INSERT INTO barangay_settings (barangay_name, municipality, province, region, address, contact_number, email, captain_name, secretary_name) 
                        VALUES ('Barangay San Jose', 'City of Manila', 'Metro Manila', 'National Capital Region', '123 Main Street', '+63 912 345 6789', 'contact@brgysanjose.gov.ph', 'Hon. Juan Carlos', 'Maria Santos')`);
            }
        });

        db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'admin'`, async (err, row) => {
            if (row && row.count === 0) {
                const hashedPassword = await bcrypt.hash('admin123', 10);
                db.run(`INSERT INTO users (username, password, role, status) VALUES ('admin', ?, 'admin', 'active')`, [hashedPassword], (err) => {
                    if (!err) console.log('Default administrator created (Username: admin, Password: admin123). Please change credentials in production.');
                });
            }
        });
    });
}

function logActivity(username, action, req) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    db.run(`INSERT INTO activity_logs (username, action, ip_address) VALUES (?, ?, ?)`, [username || 'Guest', action, ip]);
}

function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
}

function isAdminOrStaff(req, res, next) {
    if (req.session && req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'staff')) {
        return next();
    }
    res.status(403).send('Access Denied: Staff/Admin privilege required.');
}

function isResident(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'resident') {
        return next();
    }
    res.status(403).send('Access Denied: Resident portal access only.');
}

// Global middleware to pass settings to all templates/views
app.use((req, res, next) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        res.locals.settings = settings || {
            barangay_name: 'Barangay System',
            municipality: 'Municipality',
            province: 'Province',
            region: 'Region',
            address: 'Address',
            contact_number: 'Contact',
            email: 'Email',
            captain_name: 'Captain',
            secretary_name: 'Secretary',
            logo_path: ''
        };
        res.locals.currentUser = req.session.user || null;
        next();
    });
});


// Login page
app.get('/login', (req, res) => {
    res.send(renderLayout('Login Portal', `
        <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 p-4">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 border border-slate-100">
                <div class="text-center mb-8">
                    <img src="${res.locals.settings.logo_path || 'https://placehold.co/100x100/1e3a8a/ffffff?text=BRGY'}" alt="Logo" class="w-20 h-20 mx-auto rounded-full object-cover shadow-md mb-4 border-2 border-blue-600">
                    <h2 class="text-2xl font-bold text-slate-800">${res.locals.settings.barangay_name}</h2>
                    <p class="text-sm text-slate-500 mt-1">Resident Management System Portal</p>
                </div>
                <form action="/login" method="POST" class="space-y-5">
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1">Username / Email</label>
                        <input type="text" name="username" required class="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:outline-none text-slate-800">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1">Password</label>
                        <input type="password" name="password" required class="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:outline-none text-slate-800">
                    </div>
                    <button type="submit" class="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 rounded-lg shadow-lg transition duration-200">Secure Sign In</button>
                </form>
                <div class="mt-6 text-center text-sm text-slate-600">
                    Don't have a resident account? <a href="/register-public" class="text-blue-600 font-semibold hover:underline">Register Online</a>
                </div>
            </div>
        </div>
    `, { hideNav: true }));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err || !user) {
            return res.send(renderAlertPage('Login Failed', 'Invalid username or password.', '/login'));
        }
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.send(renderAlertPage('Login Failed', 'Invalid username or password.', '/login'));
        }
        if (user.status !== 'active') {
            return res.send(renderAlertPage('Account Inactive', 'Your account is pending approval or inactive.', '/login'));
        }

        req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            resident_id_link: user.resident_id_link
        };
        logActivity(user.username, `User logged in as ${user.role}`, req);

        if (user.role === 'admin' || user.role === 'staff') {
            res.redirect('/staff/dashboard');
        } else {
            res.redirect('/resident/dashboard');
        }
    });
});

app.get('/logout', (req, res) => {
    if (req.session.user) {
        logActivity(req.session.user.username, 'User logged out', req);
    }
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

app.get('/register-public', (req, res) => {
    db.all(`SELECT * FROM puroks`, [], (err, puroks) => {
        res.send(renderLayout('Public Resident Registration', `
            <div class="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
                <div class="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
                    <div class="text-center mb-8">
                        <img src="${res.locals.settings.logo_path || 'https://placehold.co/80x80/1e3a8a/ffffff?text=BRGY'}" class="w-16 h-16 mx-auto rounded-full object-cover mb-3">
                        <h1 class="text-2xl font-bold text-slate-800">Barangay Resident Registration</h1>
                        <p class="text-sm text-slate-500">Submit your registration for staff review and account activation.</p>
                    </div>
                    <form action="/register-public" method="POST" enctype="multipart/form-data" class="space-y-4">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-slate-700">First Name</label>
                                <input type="text" name="first_name" required class="mt-1 w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700">Middle Name</label>
                                <input type="text" name="middle_name" class="mt-1 w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700">Last Name</label>
                                <input type="text" name="last_name" required class="mt-1 w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700">Suffix (Optional)</label>
                                <input type="text" name="suffix" class="mt-1 w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700">Date of Birth</label>
                                <input type="date" name="dob" required class="mt-1 w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700">Gender</label>
                                <select name="gender" class="mt-1 w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700">Civil Status</label>
                                <select name="civil_status" class="mt-1 w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <option value="Single">Single</option>
                                    <option value="Married">Married</option>
                                    <option value="Widowed">Widowed</option>
                                    <option value="Separated">Separated</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700">Purok</label>
                                <select name="purok_id" required class="mt-1 w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500">
                                    ${puroks.map(p => `<option value="${p.id}">${p.purok_name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-slate-700">Complete Address</label>
                            <input type="text" name="address" required class="mt-1 w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-slate-700">Contact Number</label>
                                <input type="text" name="contact_number" required class="mt-1 w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700">Email Address (Username)</label>
                                <input type="email" name="email" required class="mt-1 w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700">Occupation</label>
                                <input type="text" name="occupation" class="mt-1 w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700">Educational Attainment</label>
                                <input type="text" name="educational_attainment" class="mt-1 w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700">Voter Status</label>
                                <select name="voter_status" class="mt-1 w-full p-2.5 border rounded-lg">
                                    <option value="Registered">Registered Voter</option>
                                    <option value="Not Registered">Not Registered</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700">Password for Portal</label>
                                <input type="password" name="password" required class="mt-1 w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-slate-700">Resident Photo</label>
                            <input type="file" name="photo" accept="image/*" class="mt-1 w-full p-2 border rounded-lg">
                        </div>
                        <button type="submit" class="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 shadow-md">Submit Registration</button>
                    </form>
                    <div class="mt-4 text-center">
                        <a href="/login" class="text-sm text-blue-600 hover:underline">Already have an account? Sign in</a>
                    </div>
                </div>
            </div>
        `, { hideNav: true }));
    });
});

app.post('/register-public', upload.single('photo'), async (req, res) => {
    const { first_name, middle_name, last_name, suffix, dob, gender, civil_status, address, purok_id, contact_number, email, occupation, educational_attainment, voter_status, password } = req.body;
    const photo_path = req.file ? '/uploads/' + req.file.filename : '';
    
    // Auto-generate Resident ID: BRGY-YYYY-XXXXXX
    const year = new Date().getFullYear();
    db.get(`SELECT COUNT(*) as count FROM residents`, async (err, row) => {
        const count = (row ? row.count : 0) + 1;
        const residentIdNum = `BRGY-${year}-${String(count).padStart(6, '0')}`;
        
        db.run(`INSERT INTO residents (resident_id_number, first_name, middle_name, last_name, suffix, gender, dob, civil_status, address, purok_id, contact_number, email, occupation, educational_attainment, voter_status, photo_path, account_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
                [residentIdNum, first_name, middle_name, last_name, suffix, gender, dob, civil_status, address, purok_id, contact_number, email, occupation, educational_attainment, voter_status, photo_path], async function(err) {
            if (err) {
                return res.send(renderAlertPage('Registration Error', err.message, '/register-public'));
            }
            const residentId = this.lastID;
            const hashedPassword = await bcrypt.hash(password, 10);
            
            db.run(`INSERT INTO users (username, password, role, status, resident_id_link) VALUES (?, ?, 'resident', 'pending', ?)`, [email, hashedPassword, residentId], (err) => {
                logActivity(email, 'New public resident registration submitted', req);
                res.send(renderAlertPage('Registration Submitted', 'Your registration has been successfully submitted and is pending staff review and approval.', '/login'));
            });
        });
    });
});

app.get('/staff/dashboard', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.serialize(() => {
        db.get(`SELECT 
            (SELECT COUNT(*) FROM residents WHERE account_status = 'Active') as total_residents,
            (SELECT COUNT(*) FROM households) as total_households,
            (SELECT COUNT(*) FROM residents WHERE gender = 'Male' AND account_status = 'Active') as total_male,
            (SELECT COUNT(*) FROM residents WHERE gender = 'Female' AND account_status = 'Active') as total_female,
            (SELECT COUNT(*) FROM residents WHERE senior_citizen = 'Yes' AND account_status = 'Active') as total_seniors,
            (SELECT COUNT(*) FROM residents WHERE pwd_status = 'Yes' AND account_status = 'Active') as total_pwd,
            (SELECT COUNT(*) FROM residents WHERE solo_parent = 'Yes' AND account_status = 'Active') as total_solo_parents,
            (SELECT COUNT(*) FROM residents WHERE (strftime('%Y', 'now') - strftime('%Y', dob)) < 18 AND account_status = 'Active') as total_minors,
            (SELECT COUNT(*) FROM residents WHERE voter_status = 'Registered' AND account_status = 'Active') as total_voters,
            (SELECT COUNT(*) FROM certificate_requests WHERE status = 'Pending') as pending_certificates,
            (SELECT COUNT(*) FROM appointments WHERE status = 'Pending') as pending_appointments,
            (SELECT COUNT(*) FROM blotter_cases WHERE status = 'Open') as open_blotters`, (err, stats) => {
                
                db.all(`SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 10`, (err, logs) => {
                    db.all(`SELECT * FROM residents WHERE account_status = 'Pending'`, (err, pendingResidents) => {
                        res.send(renderStaffLayout('Staff Dashboard', `
                            <div class="space-y-6">
                                <h1 class="text-3xl font-bold text-slate-800">Staff Dashboard & Analytics</h1>
                                
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div class="bg-white p-6 rounded-xl shadow border-l-4 border-blue-600 flex items-center justify-between">
                                        <div>
                                            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Residents</p>
                                            <h3 class="text-3xl font-extrabold text-slate-800 mt-1">${stats.total_residents || 0}</h3>
                                        </div>
                                        <div class="p-3 bg-blue-50 text-blue-600 rounded-full"><i class="fas fa-users text-xl"></i></div>
                                    </div>
                                    <div class="bg-white p-6 rounded-xl shadow border-l-4 border-emerald-600 flex items-center justify-between">
                                        <div>
                                            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Households</p>
                                            <h3 class="text-3xl font-extrabold text-slate-800 mt-1">${stats.total_households || 0}</h3>
                                        </div>
                                        <div class="p-3 bg-emerald-50 text-emerald-600 rounded-full"><i class="fas fa-home text-xl"></i></div>
                                    </div>
                                    <div class="bg-white p-6 rounded-xl shadow border-l-4 border-amber-500 flex items-center justify-between">
                                        <div>
                                            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Pending Certificates</p>
                                            <h3 class="text-3xl font-extrabold text-slate-800 mt-1">${stats.pending_certificates || 0}</h3>
                                        </div>
                                        <div class="p-3 bg-amber-50 text-amber-600 rounded-full"><file-text class="fas fa-file-alt text-xl"></file-text></div>
                                    </div>
                                    <div class="bg-white p-6 rounded-xl shadow border-l-4 border-rose-600 flex items-center justify-between">
                                        <div>
                                            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Open Blotter Cases</p>
                                            <h3 class="text-3xl font-extrabold text-slate-800 mt-1">${stats.open_blotters || 0}</h3>
                                        </div>
                                        <div class="p-3 bg-rose-50 text-rose-600 rounded-full"><i class="fas fa-gavel text-xl"></i></div>
                                    </div>
                                </div>

                                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <div class="bg-white p-6 rounded-xl shadow lg:col-span-2">
                                        <h3 class="text-lg font-bold text-slate-800 mb-4">Demographic Overview</h3>
                                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                                            <div class="bg-slate-50 p-4 rounded-lg"><p class="text-sm text-slate-500">Male</p><p class="text-xl font-bold text-slate-700">${stats.total_male}</p></div>
                                            <div class="bg-slate-50 p-4 rounded-lg"><p class="text-sm text-slate-500">Female</p><p class="text-xl font-bold text-slate-700">${stats.total_female}</p></div>
                                            <div class="bg-slate-50 p-4 rounded-lg"><p class="text-sm text-slate-500">Seniors</p><p class="text-xl font-bold text-slate-700">${stats.total_seniors}</p></div>
                                            <div class="bg-slate-50 p-4 rounded-lg"><p class="text-sm text-slate-500">PWD</p><p class="text-xl font-bold text-slate-700">${stats.total_pwd}</p></div>
                                            <div class="bg-slate-50 p-4 rounded-lg"><p class="text-sm text-slate-500">Solo Parents</p><p class="text-xl font-bold text-slate-700">${stats.total_solo_parents}</p></div>
                                            <div class="bg-slate-50 p-4 rounded-lg"><p class="text-sm text-slate-500">Minors</p><p class="text-xl font-bold text-slate-700">${stats.total_minors}</p></div>
                                            <div class="bg-slate-50 p-4 rounded-lg"><p class="text-sm text-slate-500">Registered Voters</p><p class="text-xl font-bold text-slate-700">${stats.total_voters}</p></div>
                                            <div class="bg-slate-50 p-4 rounded-lg"><p class="text-sm text-slate-500">Pending Appts</p><p class="text-xl font-bold text-slate-700">${stats.pending_appointments}</p></div>
                                        </div>
                                    </div>

                                    <div class="bg-white p-6 rounded-xl shadow">
                                        <h3 class="text-lg font-bold text-slate-800 mb-4">Pending Registrations (${pendingResidents.length})</h3>
                                        ${pendingResidents.length === 0 ? '<p class="text-sm text-slate-400">No pending registrations.</p>' : `
                                            <div class="space-y-3">
                                                ${pendingResidents.map(r => `
                                                    <div class="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                                        <div>
                                                            <p class="font-semibold text-sm text-slate-800">${r.first_name} ${r.last_name}</p>
                                                            <p class="text-xs text-slate-500">${r.email}</p>
                                                        </div>
                                                        <a href="/staff/residents/approve/${r.id}" class="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700">Approve</a>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        `}
                                    </div>
                                </div>

                                <div class="bg-white p-6 rounded-xl shadow">
                                    <h3 class="text-lg font-bold text-slate-800 mb-4">Recent Activity Logs</h3>
                                    <div class="overflow-x-auto">
                                        <table class="w-full text-left text-sm text-slate-600">
                                            <thead class="bg-slate-100 uppercase text-xs text-slate-700">
                                                <tr><th class="p-3">User</th><th class="p-3">Action</th><th class="p-3">IP Address</th><th class="p-3">Timestamp</th></tr>
                                            </thead>
                                            <tbody>
                                                ${logs.map(l => `<tr class="border-b"><td class="p-3 font-medium">${l.username}</td><td class="p-3">${l.action}</td><td class="p-3">${l.ip_address}</td><td class="p-3">${l.created_at}</td></tr>`).join('')}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        `, req));
                    });
                });
        });
    });
});

app.get('/staff/residents', isAuthenticated, isAdminOrStaff, (req, res) => {
    const search = req.query.search || '';
    const purokFilter = req.query.purok || '';
    const statusFilter = req.query.status || 'Active';

    let query = `SELECT r.*, p.purok_name FROM residents r LEFT JOIN puroks p ON r.purok_id = p.id WHERE r.account_status = ?`;
    let params = [statusFilter];

    if (search) {
        query += ` AND (r.first_name LIKE ? OR r.last_name LIKE ? OR r.resident_id_number LIKE ? OR r.contact_number LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (purokFilter) {
        query += ` AND r.purok_id = ?`;
        params.push(purokFilter);
    }
    query += ` ORDER BY r.created_at DESC`;

    db.all(query, params, (err, residents) => {
        db.all(`SELECT * FROM puroks`, (err, puroks) => {
            res.send(renderStaffLayout('Resident Management', `
                <div class="space-y-6">
                    <div class="flex flex-col sm:flex-row justify-between items-center gap-4">
                        <h1 class="text-2xl font-bold text-slate-800">Resident Management</h1>
                        <div class="flex gap-2">
                            <a href="/staff/residents/add" class="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 shadow"><i class="fas fa-user-plus mr-2"></i>Add Resident</a>
                            <a href="/staff/residents/print-ids" target="_blank" class="px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 shadow"><i class="fas fa-id-card mr-2"></i>Print Physical IDs (8-up)</a>
                        </div>
                    </div>

                    <div class="bg-white p-4 rounded-xl shadow flex flex-col sm:flex-row gap-4 justify-between items-center">
                        <form method="GET" class="flex flex-wrap gap-3 w-full sm:w-auto">
                            <input type="text" name="search" value="${search}" placeholder="Search name, ID, contact..." class="px-3 py-2 border rounded-lg text-sm w-full sm:w-64">
                            <select name="purok" class="px-3 py-2 border rounded-lg text-sm">
                                <option value="">All Puroks</option>
                                ${puroks.map(p => `<option value="${p.id}" ${purokFilter == p.id ? 'selected' : ''}>${p.purok_name}</option>`).join('')}
                            </select>
                            <select name="status" class="px-3 py-2 border rounded-lg text-sm">
                                <option value="Active" ${statusFilter === 'Active' ? 'selected' : ''}>Active</option>
                                <option value="Archived" ${statusFilter === 'Archived' ? 'selected' : ''}>Archived</option>
                                <option value="Pending" ${statusFilter === 'Pending' ? 'selected' : ''}>Pending</option>
                            </select>
                            <button type="submit" class="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold">Filter</button>
                        </form>
                    </div>

                    <div class="bg-white rounded-xl shadow overflow-hidden">
                        <table class="w-full text-left text-sm text-slate-600">
                            <thead class="bg-slate-100 uppercase text-xs text-slate-700">
                                <tr>
                                    <th class="p-3">Resident ID</th>
                                    <th class="p-3">Full Name</th>
                                    <th class="p-3">Purok</th>
                                    <th class="p-3">Contact</th>
                                    <th class="p-3">Status</th>
                                    <th class="p-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${residents.length === 0 ? `<tr><td colspan="6" class="p-6 text-center text-slate-400">No residents found.</td></tr>` : 
                                    residents.map(r => `
                                        <tr class="border-b hover:bg-slate-50">
                                            <td class="p-3 font-semibold text-blue-600">${r.resident_id_number}</td>
                                            <td class="p-3 font-medium text-slate-800">${r.first_name} ${r.middle_name || ''} ${r.last_name} ${r.suffix || ''}</td>
                                            <td class="p-3">${r.purok_name || 'N/A'}</td>
                                            <td class="p-3">${r.contact_number}</td>
                                            <td class="p-3"><span class="px-2 py-1 text-xs rounded-full ${r.account_status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${r.account_status}</span></td>
                                            <td class="p-3 text-right space-x-2">
                                                <a href="/staff/residents/view/${r.id}" class="text-blue-600 hover:underline font-semibold">View</a>
                                                <a href="/staff/residents/edit/${r.id}" class="text-amber-600 hover:underline font-semibold">Edit</a>
                                                ${r.account_status === 'Active' ? `<a href="/staff/residents/archive/${r.id}" class="text-rose-600 hover:underline font-semibold">Archive</a>` : `<a href="/staff/residents/restore/${r.id}" class="text-emerald-600 hover:underline font-semibold">Restore</a>`}
                                            </td>
                                        </tr>
                                    `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `, req));
        });
    });
});

app.get('/staff/residents/add', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.all(`SELECT * FROM puroks`, (err, puroks) => {
        db.all(`SELECT * FROM households`, (err, households) => {
            res.send(renderStaffLayout('Add Resident', `
                <div class="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow">
                    <h1 class="text-2xl font-bold text-slate-800 mb-6">Add New Resident</h1>
                    <form action="/staff/residents/add" method="POST" enctype="multipart/form-data" class="space-y-4">
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div><label class="block text-sm font-medium">First Name</label><input type="text" name="first_name" required class="w-full p-2 border rounded-lg"></div>
                            <div><label class="block text-sm font-medium">Middle Name</label><input type="text" name="middle_name" class="w-full p-2 border rounded-lg"></div>
                            <div><label class="block text-sm font-medium">Last Name</label><input type="text" name="last_name" required class="w-full p-2 border rounded-lg"></div>
                            <div><label class="block text-sm font-medium">Suffix</label><input type="text" name="suffix" class="w-full p-2 border rounded-lg"></div>
                            <div><label class="block text-sm font-medium">Gender</label><select name="gender" class="w-full p-2 border rounded-lg"><option>Male</option><option>Female</option></select></div>
                            <div><label class="block text-sm font-medium">Date of Birth</label><input type="date" name="dob" required class="w-full p-2 border rounded-lg"></div>
                            <div><label class="block text-sm font-medium">Civil Status</label><select name="civil_status" class="w-full p-2 border rounded-lg"><option>Single</option><option>Married</option><option>Widowed</option><option>Separated</option></select></div>
                            <div><label class="block text-sm font-medium">Purok</label><select name="purok_id" class="w-full p-2 border rounded-lg">${puroks.map(p => `<option value="${p.id}">${p.purok_name}</option>`).join('')}</select></div>
                            <div><label class="block text-sm font-medium">Household</label><select name="household_id" class="w-full p-2 border rounded-lg"><option value="">None</option>${households.map(h => `<option value="${h.id}">${h.household_number} - ${h.address}</option>`).join('')}</select></div>
                        </div>
                        <div><label class="block text-sm font-medium">Complete Address</label><input type="text" name="address" required class="w-full p-2 border rounded-lg"></div>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div><label class="block text-sm font-medium">Contact Number</label><input type="text" name="contact_number" required class="w-full p-2 border rounded-lg"></div>
                            <div><label class="block text-sm font-medium">Email</label><input type="email" name="email" class="w-full p-2 border rounded-lg"></div>
                            <div><label class="block text-sm font-medium">Occupation</label><input type="text" name="occupation" class="w-full p-2 border rounded-lg"></div>
                            <div><label class="block text-sm font-medium">Educational Attainment</label><input type="text" name="educational_attainment" class="w-full p-2 border rounded-lg"></div>
                            <div><label class="block text-sm font-medium">Voter Status</label><select name="voter_status" class="w-full p-2 border rounded-lg"><option>Registered</option><option>Not Registered</option></select></div>
                            <div><label class="block text-sm font-medium">Senior Citizen</label><select name="senior_citizen" class="w-full p-2 border rounded-lg"><option>No</option><option>Yes</option></select></div>
                            <div><label class="block text-sm font-medium">PWD Status</label><select name="pwd_status" class="w-full p-2 border rounded-lg"><option>No</option><option>Yes</option></select></div>
                            <div><label class="block text-sm font-medium">Solo Parent</label><select name="solo_parent" class="w-full p-2 border rounded-lg"><option>No</option><option>Yes</option></select></div>
                            <div><label class="block text-sm font-medium">4Ps Beneficiary</label><select name="four_ps" class="w-full p-2 border rounded-lg"><option>No</option><option>Yes</option></select></div>
                        </div>
                        <div><label class="block text-sm font-medium">Resident Photo</label><input type="file" name="photo" accept="image/*" class="w-full p-2 border rounded-lg"></div>
                        <div class="flex justify-end gap-3 pt-4">
                            <a href="/staff/residents" class="px-4 py-2 bg-slate-200 rounded-lg text-slate-700 font-semibold">Cancel</a>
                            <button type="submit" class="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">Save Resident</button>
                        </div>
                    </form>
                </div>
            `, req));
        });
    });
});

app.post('/staff/residents/add', upload.single('photo'), (req, res) => {
    const { first_name, middle_name, last_name, suffix, gender, dob, civil_status, address, purok_id, household_id, contact_number, email, occupation, educational_attainment, voter_status, senior_citizen, pwd_status, solo_parent, four_ps } = req.body;
    const photo_path = req.file ? '/uploads/' + req.file.filename : '';
    
    const year = new Date().getFullYear();
    db.get(`SELECT COUNT(*) as count FROM residents`, (err, row) => {
        const count = (row ? row.count : 0) + 1;
        const residentIdNum = `BRGY-${year}-${String(count).padStart(6, '0')}`;
        
        db.run(`INSERT INTO residents (resident_id_number, first_name, middle_name, last_name, suffix, gender, dob, civil_status, address, purok_id, household_id, contact_number, email, occupation, educational_attainment, voter_status, senior_citizen, pwd_status, solo_parent, four_ps, photo_path, account_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`,
                [residentIdNum, first_name, middle_name, last_name, suffix, gender, dob, civil_status, address, purok_id || null, household_id || null, contact_number, email, occupation, educational_attainment, voter_status, senior_citizen, pwd_status, solo_parent, four_ps, photo_path], (err) => {
            logActivity(req.session.user.username, `Added resident ${residentIdNum}`, req);
            res.redirect('/staff/residents');
        });
    });
});

app.get('/staff/residents/view/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    const residentId = req.params.id;
    db.get(`SELECT r.*, p.purok_name, h.household_number FROM residents r LEFT JOIN puroks p ON r.purok_id = p.id LEFT JOIN households h ON r.household_id = h.id WHERE r.id = ?`, [residentId], (err, resident) => {
        if (!resident) return res.status(404).send('Resident not found');
        db.all(`SELECT * FROM certificate_requests WHERE resident_id = ?`, [residentId], (err, requests) => {
            res.send(renderStaffLayout('Resident Profile', `
                <div class="space-y-6">
                    <div class="flex justify-between items-center">
                        <h1 class="text-2xl font-bold text-slate-800">Resident Profile: ${resident.resident_id_number}</h1>
                        <a href="/staff/residents" class="px-4 py-2 bg-slate-200 rounded-lg text-sm font-semibold">Back to List</a>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div class="bg-white p-6 rounded-xl shadow text-center">
                            <img src="${resident.photo_path || 'https://placehold.co/150x150/e2e8f0/64748b?text=No+Photo'}" class="w-32 h-32 mx-auto rounded-full object-cover mb-4 shadow border">
                            <h2 class="text-xl font-bold text-slate-800">${resident.first_name} ${resident.middle_name || ''} ${resident.last_name} ${resident.suffix || ''}</h2>
                            <p class="text-sm text-blue-600 font-semibold mt-1">${resident.resident_id_number}</p>
                            <span class="inline-block mt-3 px-3 py-1 text-xs rounded-full ${resident.account_status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${resident.account_status}</span>
                        </div>
                        <div class="bg-white p-6 rounded-xl shadow md:col-span-2 space-y-4">
                            <h3 class="text-lg font-bold text-slate-800 border-b pb-2">Personal Information</h3>
                            <div class="grid grid-cols-2 gap-4 text-sm">
                                <div><span class="font-semibold text-slate-500">Gender:</span> ${resident.gender}</div>
                                <div><span class="font-semibold text-slate-500">Date of Birth:</span> ${resident.dob}</div>
                                <div><span class="font-semibold text-slate-500">Civil Status:</span> ${resident.civil_status}</div>
                                <div><span class="font-semibold text-slate-500">Purok:</span> ${resident.purok_name || 'N/A'}</div>
                                <div><span class="font-semibold text-slate-500">Address:</span> ${resident.address}</div>
                                <div><span class="font-semibold text-slate-500">Contact:</span> ${resident.contact_number}</div>
                                <div><span class="font-semibold text-slate-500">Email:</span> ${resident.email || 'N/A'}</div>
                                <div><span class="font-semibold text-slate-500">Occupation:</span> ${resident.occupation || 'N/A'}</div>
                                <div><span class="font-semibold text-slate-500">Voter Status:</span> ${resident.voter_status}</div>
                                <div><span class="font-semibold text-slate-500">Senior Citizen:</span> ${resident.senior_citizen}</div>
                                <div><span class="font-semibold text-slate-500">PWD Status:</span> ${resident.pwd_status}</div>
                                <div><span class="font-semibold text-slate-500">Solo Parent:</span> ${resident.solo_parent}</div>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white p-6 rounded-xl shadow">
                        <h3 class="text-lg font-bold text-slate-800 mb-4">Certificate Request History</h3>
                        <table class="w-full text-left text-sm text-slate-600">
                            <thead class="bg-slate-100 uppercase text-xs">
                                <tr><th class="p-2">Request No</th><th class="p-2">Type</th><th class="p-2">Purpose</th><th class="p-2">Status</th><th class="p-2">Date</th></tr>
                            </thead>
                            <tbody>
                                ${requests.length === 0 ? '<tr><td colspan="5" class="p-4 text-center text-slate-400">No requests found.</td></tr>' :
                                    requests.map(req => `<tr class="border-b"><td class="p-2">${req.request_number}</td><td class="p-2">${req.certificate_type}</td><td class="p-2">${req.purpose}</td><td class="p-2">${req.status}</td><td class="p-2">${req.created_at}</td></tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `, req));
        });
    });
});

app.get('/staff/residents/archive/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    const residentId = req.params.id;
    db.run(`UPDATE residents SET account_status = 'Archived' WHERE id = ?`, [residentId], (err) => {
        logActivity(req.session.user.username, `Archived resident ID ${residentId}`, req);
        res.redirect('/staff/residents');
    });
});

app.get('/staff/residents/restore/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    const residentId = req.params.id;
    db.run(`UPDATE residents SET account_status = 'Active' WHERE id = ?`, [residentId], (err) => {
        logActivity(req.session.user.username, `Restored resident ID ${residentId}`, req);
        res.redirect('/staff/residents');
    });
});

app.get('/staff/residents/approve/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    const residentId = req.params.id;
    db.run(`UPDATE residents SET account_status = 'Active' WHERE id = ?`, [residentId], (err) => {
        db.run(`UPDATE users SET status = 'active' WHERE resident_id_link = ?`, [residentId], (err) => {
            logActivity(req.session.user.username, `Approved resident registration ID ${residentId}`, req);
            res.redirect('/staff/dashboard');
        });
    });
});

app.get('/staff/residents/print-ids', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.all(`SELECT r.*, p.purok_name FROM residents r LEFT JOIN puroks p ON r.purok_id = p.id WHERE r.account_status = 'Active'`, async (err, residents) => {
        // Generate QR codes for each resident
        const residentsWithQR = await Promise.all(residents.map(async (r) => {
            const qrData = `https://brgysanjose.gov.ph/verify/${r.resident_id_number}`;
            const qrCodeUrl = await QRCode.toDataURL(qrData);
            return { ...r, qrCodeUrl };
        }));

        res.send(`<!DOCTYPE html>
        <html>
        <head>
            <title>Print Resident IDs (8-up)</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                @media print {
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
                    .no-print { display: none !important; }
                    .page-break { page-break-after: always; }
                }
                .id-card {
                    width: 85.6mm;
                    height: 54mm;
                    border: 1px dashed #cbd5e1;
                    border-radius: 6px;
                    padding: 8px;
                    background: white;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    box-sizing: border-box;
                    page-break-inside: avoid;
                }
            </style>
        </head>
        <body class="bg-slate-100 p-8">
            <div class="no-print max-w-4xl mx-auto mb-6 flex justify-between items-center bg-white p-4 rounded-xl shadow">
                <h1 class="text-xl font-bold text-slate-800">Physical ID Batch Printing (8 Cards per Page)</h1>
                <button onclick="window.print()" class="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 shadow">Print IDs</button>
            </div>

            <div class="max-w-[215.9mm] mx-auto bg-white p-[10mm] shadow-lg grid grid-cols-2 gap-[5mm]">
                ${residentsWithQR.map((r, index) => `
                    <div class="id-card shadow-sm">
                        <div class="flex items-center gap-2 border-b pb-1">
                            <img src="${res.locals.settings.logo_path || 'https://placehold.co/40x40/1e3a8a/ffffff?text=BRGY'}" class="w-8 h-8 rounded-full object-cover">
                            <div>
                                <h4 class="text-[10px] font-bold text-blue-900 leading-tight">${res.locals.settings.barangay_name}</h4>
                                <p class="text-[8px] text-slate-500">${res.locals.settings.municipality}</p>
                            </div>
                        </div>
                        <div class="flex gap-2 items-center my-1">
                            <img src="${r.photo_path || 'https://placehold.co/80x80/e2e8f0/64748b?text=Photo'}" class="w-16 h-16 rounded-md object-cover border">
                            <div class="text-[9px] space-y-0.5">
                                <p class="font-bold text-slate-800 text-[10px]">${r.last_name}, ${r.first_name} ${r.middle_name || ''}</p>
                                <p><span class="font-semibold">ID No:</span> <span class="text-blue-700 font-bold">${r.resident_id_number}</span></p>
                                <p><span class="font-semibold">DOB:</span> ${r.dob}</p>
                                <p><span class="font-semibold">Purok:</span> ${r.purok_name || 'N/A'}</p>
                            </div>
                            <img src="${r.qrCodeUrl}" class="w-14 h-14 ml-auto">
                        </div>
                        <div class="flex justify-between items-end border-t pt-1 text-[7px] text-slate-500">
                            <div>
                                <p class="font-bold text-slate-700">${res.locals.settings.captain_name}</p>
                                <p>Punong Barangay</p>
                            </div>
                            <div class="text-right">
                                <p>Emergency: ${res.locals.settings.contact_number}</p>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </body>
        </html>`);
    });
});

app.get('/staff/households', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.all(`SELECT h.*, p.purok_name, r.first_name as head_first, r.last_name as head_last FROM households h LEFT JOIN puroks p ON h.purok_id = p.id LEFT JOIN residents r ON h.head_resident_id = r.id`, (err, households) => {
        db.all(`SELECT * FROM puroks`, (err, puroks) => {
            db.all(`SELECT * FROM residents WHERE account_status = 'Active'`, (err, residents) => {
                res.send(renderStaffLayout('Household Management', `
                    <div class="space-y-6">
                        <div class="flex justify-between items-center">
                            <h1 class="text-2xl font-bold text-slate-800">Household Management</h1>
                        </div>
                        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div class="bg-white p-6 rounded-xl shadow">
                                <h3 class="text-lg font-bold text-slate-800 mb-4">Add Household</h3>
                                <form action="/staff/households/add" method="POST" class="space-y-4">
                                    <div><label class="block text-sm font-medium">Household Number</label><input type="text" name="household_number" required class="w-full p-2 border rounded-lg"></div>
                                    <div><label class="block text-sm font-medium">Address</label><input type="text" name="address" required class="w-full p-2 border rounded-lg"></div>
                                    <div><label class="block text-sm font-medium">Purok</label><select name="purok_id" class="w-full p-2 border rounded-lg">${puroks.map(p => `<option value="${p.id}">${p.purok_name}</option>`).join('')}</select></div>
                                    <div><label class="block text-sm font-medium">Household Head</label><select name="head_resident_id" class="w-full p-2 border rounded-lg"><option value="">Select Head</option>${residents.map(r => `<option value="${r.id}">${r.last_name}, ${r.first_name}</option>`).join('')}</select></div>
                                    <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700">Create Household</button>
                                </form>
                            </div>
                            <div class="bg-white p-6 rounded-xl shadow lg:col-span-2">
                                <h3 class="text-lg font-bold text-slate-800 mb-4">Household Directory</h3>
                                <div class="overflow-x-auto">
                                    <table class="w-full text-left text-sm text-slate-600">
                                        <thead class="bg-slate-100 uppercase text-xs">
                                            <tr><th class="p-3">HH No.</th><th class="p-3">Address</th><th class="p-3">Purok</th><th class="p-3">Household Head</th><th class="p-3">Action</th></tr>
                                        </thead>
                                        <tbody>
                                            ${households.map(h => `<tr class="border-b"><td class="p-3 font-semibold text-blue-600">${h.household_number}</td><td class="p-3">${h.address}</td><td class="p-3">${h.purok_name || 'N/A'}</td><td class="p-3">${h.head_first ? `${h.head_first} ${h.head_last}` : 'Not Assigned'}</td><td class="p-3"><a href="/staff/households/view/${h.id}" class="text-blue-600 font-semibold hover:underline">View Members</a></td></tr>`).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                `, req));
            });
        });
    });
});

app.post('/staff/households/add', isAuthenticated, isAdminOrStaff, (req, res) => {
    const { household_number, address, purok_id, head_resident_id } = req.body;
    db.run(`INSERT INTO households (household_number, address, purok_id, head_resident_id) VALUES (?, ?, ?, ?)`, [household_number, address, purok_id, head_resident_id || null], (err) => {
        logActivity(req.session.user.username, `Added household ${household_number}`, req);
        res.redirect('/staff/households');
    });
});

app.get('/staff/households/view/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    const hhId = req.params.id;
    db.get(`SELECT h.*, p.purok_name, r.first_name as head_first, r.last_name as head_last FROM households h LEFT JOIN puroks p ON h.purok_id = p.id LEFT JOIN residents r ON h.head_resident_id = r.id WHERE h.id = ?`, [hhId], (err, household) => {
        db.all(`SELECT * FROM residents WHERE household_id = ? AND account_status = 'Active'`, [hhId], (err, members) => {
            db.all(`SELECT * FROM residents WHERE household_id IS NULL AND account_status = 'Active'`, (err, availableResidents) => {
                res.send(renderStaffLayout('Household Details', `
                    <div class="space-y-6">
                        <div class="flex justify-between items-center">
                            <h1 class="text-2xl font-bold text-slate-800">Household: ${household.household_number}</h1>
                            <a href="/staff/households" class="px-4 py-2 bg-slate-200 rounded-lg text-sm font-semibold">Back</a>
                        </div>
                        <div class="bg-white p-6 rounded-xl shadow grid grid-cols-2 gap-4">
                            <div><p class="text-sm text-slate-500 font-semibold">Address:</p><p class="text-lg text-slate-800">${household.address}</p></div>
                            <div><p class="text-sm text-slate-500 font-semibold">Purok:</p><p class="text-lg text-slate-800">${household.purok_name || 'N/A'}</p></div>
                            <div><p class="text-sm text-slate-500 font-semibold">Household Head:</p><p class="text-lg text-blue-700 font-bold">${household.head_first ? `${household.head_first} ${household.head_last}` : 'None Assigned'}</p></div>
                        </div>

                        <div class="bg-white p-6 rounded-xl shadow space-y-4">
                            <h3 class="text-lg font-bold text-slate-800">Family Members (${members.length})</h3>
                            <table class="w-full text-left text-sm text-slate-600">
                                <thead class="bg-slate-100 uppercase text-xs">
                                    <tr><th class="p-3">Resident ID</th><th class="p-3">Full Name</th><th class="p-3">Contact</th><th class="p-3">Action</th></tr>
                                </thead>
                                <tbody>
                                    ${members.map(m => `<tr class="border-b"><td class="p-3 font-semibold text-blue-600">${m.resident_id_number}</td><td class="p-3">${m.first_name} ${m.last_name}</td><td class="p-3">${m.contact_number}</td><td class="p-3"><a href="/staff/households/remove-member/${m.id}" class="text-rose-600 hover:underline">Remove</a></td></tr>`).join('')}
                                </tbody>
                            </table>
                            <form action="/staff/households/add-member" method="POST" class="flex gap-4 mt-4 pt-4 border-t">
                                <input type="hidden" name="household_id" value="${hhId}">
                                <select name="resident_id" class="p-2 border rounded-lg flex-1"><option value="">Assign Resident to Household</option>${availableResidents.map(ar => `<option value="${ar.id}">${ar.last_name}, ${ar.first_name} (${ar.resident_id_number})</option>`).join('')}</select>
                                <button type="submit" class="px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold">Add Member</button>
                            </form>
                        </div>
                    </div>
                `, req));
            });
        });
    });
});

app.post('/staff/households/add-member', isAuthenticated, isAdminOrStaff, (req, res) => {
    const { household_id, resident_id } = req.body;
    db.run(`UPDATE residents SET household_id = ? WHERE id = ?`, [household_id, resident_id], (err) => {
        res.redirect(`/staff/households/view/${household_id}`);
    });
});

app.get('/staff/households/remove-member/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    const residentId = req.params.id;
    db.get(`SELECT household_id FROM residents WHERE id = ?`, [residentId], (err, row) => {
        const hhId = row ? row.household_id : null;
        db.run(`UPDATE residents SET household_id = NULL WHERE id = ?`, [residentId], (err) => {
            res.redirect(hhId ? `/staff/households/view/${hhId}` : '/staff/households');
        });
    });
});

app.get('/staff/puroks', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.all(`SELECT p.*, (SELECT COUNT(*) FROM residents r WHERE r.purok_id = p.id AND r.account_status = 'Active') as resident_count FROM puroks p`, (err, puroks) => {
        res.send(renderStaffLayout('Purok Management', `
            <div class="space-y-6">
                <h1 class="text-2xl font-bold text-slate-800">Purok Management</h1>
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div class="bg-white p-6 rounded-xl shadow">
                        <h3 class="text-lg font-bold text-slate-800 mb-4">Add Purok</h3>
                        <form action="/staff/puroks/add" method="POST" class="space-y-4">
                            <div><label class="block text-sm font-medium">Purok Name</label><input type="text" name="purok_name" required class="w-full p-2 border rounded-lg"></div>
                            <div><label class="block text-sm font-medium">Description</label><textarea name="description" class="w-full p-2 border rounded-lg"></textarea></div>
                            <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold">Save Purok</button>
                        </form>
                    </div>
                    <div class="bg-white p-6 rounded-xl shadow lg:col-span-2">
                        <h3 class="text-lg font-bold text-slate-800 mb-4">Purok List & Statistics</h3>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            ${puroks.map(p => `
                                <div class="bg-slate-50 p-4 rounded-xl border flex justify-between items-center">
                                    <div>
                                        <h4 class="font-bold text-slate-800">${p.purok_name}</h4>
                                        <p class="text-xs text-slate-500 mt-1">${p.description || 'No description'}</p>
                                        <p class="text-sm font-semibold text-blue-600 mt-2">Residents: ${p.resident_count}</p>
                                    </div>
                                    <a href="/staff/residents?purok=${p.id}" class="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-semibold">View</a>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `, req));
    });
});

app.post('/staff/puroks/add', isAuthenticated, isAdminOrStaff, (req, res) => {
    const { purok_name, description } = req.body;
    db.run(`INSERT INTO puroks (purok_name, description) VALUES (?, ?)`, [purok_name, description], (err) => {
        res.redirect('/staff/puroks');
    });
});

app.get('/staff/certificates', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.all(`SELECT c.*, r.first_name, r.last_name, r.resident_id_number FROM certificate_requests c JOIN residents r ON c.resident_id = r.id ORDER BY c.created_at DESC`, (err, requests) => {
        res.send(renderStaffLayout('Certificate Management', `
            <div class="space-y-6">
                <h1 class="text-2xl font-bold text-slate-800">Certificate Requests Management</h1>
                <div class="bg-white rounded-xl shadow overflow-hidden">
                    <table class="w-full text-left text-sm text-slate-600">
                        <thead class="bg-slate-100 uppercase text-xs">
                            <tr><th class="p-3">Request No.</th><th class="p-3">Resident</th><th class="p-3">Type</th><th class="p-3">Purpose</th><th class="p-3">Status</th><th class="p-3 text-right">Action</th></tr>
                        </thead>
                        <tbody>
                            ${requests.length === 0 ? '<tr><td colspan="6" class="p-6 text-center text-slate-400">No requests found.</td></tr>' :
                                requests.map(req => `
                                    <tr class="border-b hover:bg-slate-50">
                                        <td class="p-3 font-semibold text-blue-600">${req.request_number}</td>
                                        <td class="p-3 font-medium text-slate-800">${req.last_name}, ${req.first_name}</td>
                                        <td class="p-3">${req.certificate_type}</td>
                                        <td class="p-3">${req.purpose}</td>
                                        <td class="p-3"><span class="px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-800">${req.status}</span></td>
                                        <td class="p-3 text-right">
                                            <a href="/staff/certificates/review/${req.id}" class="px-3 py-1 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700">Review & Process</a>
                                        </td>
                                    </tr>
                                `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `, req));
    });
});

app.get('/staff/certificates/review/:id', isAuthenticated, isAdminOrStaff, (req, res) => {
    const reqId = req.params.id;
    db.get(`SELECT c.*, r.first_name, r.last_name, r.resident_id_number, r.address FROM certificate_requests c JOIN residents r ON c.resident_id = r.id WHERE c.id = ?`, [reqId], (err, request) => {
        res.send(renderStaffLayout('Process Certificate', `
            <div class="max-w-xl mx-auto bg-white p-8 rounded-xl shadow space-y-6">
                <h1 class="text-2xl font-bold text-slate-800">Process Certificate Request</h1>
                <div class="bg-slate-50 p-4 rounded-lg space-y-2 text-sm">
                    <p><span class="font-semibold">Request No:</span> ${request.request_number}</p>
                    <p><span class="font-semibold">Resident:</span> ${request.first_name} ${request.last_name} (${request.resident_id_number})</p>
                    <p><span class="font-semibold">Type:</span> ${request.certificate_type}</p>
                    <p><span class="font-semibold">Purpose:</span> ${request.purpose}</p>
                </div>
                <form action="/staff/certificates/process/${request.id}" method="POST" enctype="multipart/form-data" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium">Status</label>
                        <select name="status" class="w-full p-2 border rounded-lg">
                            <option value="Processing" ${request.status === 'Processing' ? 'selected' : ''}>Processing</option>
                            <option value="Approved" ${request.status === 'Approved' ? 'selected' : ''}>Approved</option>
                            <option value="Ready for Release" ${request.status === 'Ready for Release' ? 'selected' : ''}>Ready for Release</option>
                            <option value="Released" ${request.status === 'Released' ? 'selected' : ''}>Released</option>
                            <option value="Rejected" ${request.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium">Remarks / Notes</label>
                        <textarea name="remarks" class="w-full p-2 border rounded-lg">${request.remarks || ''}</textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium">Upload Official Certificate Document (PDF/Image)</label>
                        <input type="file" name="certificate_file" class="w-full p-2 border rounded-lg">
                        ${request.certificate_file ? `<p class="text-xs text-emerald-600 mt-1">Current file uploaded. Upload new to replace.</p>` : ''}
                    </div>
                    <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700">Update Request</button>
                </form>
            </div>
        `, req));
    });
});

app.post('/staff/certificates/process/:id', upload.single('certificate_file'), (req, res) => {
    const reqId = req.params.id;
    const { status, remarks } = req.body;
    const staffName = req.session.user.username;

    if (req.file) {
        const file_path = '/uploads/' + req.file.filename;
        db.run(`UPDATE certificate_requests SET status = ?, remarks = ?, certificate_file = ?, processed_by = ? WHERE id = ?`, [status, remarks, file_path, staffName, reqId], (err) => {
            logActivity(staffName, `Processed certificate request ID ${reqId} as ${status}`, req);
            res.redirect('/staff/certificates');
        });
    } else {
        db.run(`UPDATE certificate_requests SET status = ?, remarks = ?, processed_by = ? WHERE id = ?`, [status, remarks, staffName, reqId], (err) => {
            logActivity(staffName, `Processed certificate request ID ${reqId} as ${status}`, req);
            res.redirect('/staff/certificates');
        });
    }
});

app.get('/staff/appointments', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.all(`SELECT a.*, r.first_name, r.last_name, r.contact_number FROM appointments a JOIN residents r ON a.resident_id = r.id ORDER BY a.appointment_date DESC`, (err, appointments) => {
        res.send(renderStaffLayout('Appointment Management', `
            <div class="space-y-6">
                <h1 class="text-2xl font-bold text-slate-800">Appointment Management</h1>
                <div class="bg-white rounded-xl shadow overflow-hidden">
                    <table class="w-full text-left text-sm text-slate-600">
                        <thead class="bg-slate-100 uppercase text-xs">
                            <tr><th class="p-3">Resident</th><th class="p-3">Service</th><th class="p-3">Date & Time</th><th class="p-3">Purpose</th><th class="p-3">Status</th><th class="p-3 text-right">Action</th></tr>
                        </thead>
                        <tbody>
                            ${appointments.length === 0 ? '<tr><td colspan="6" class="p-6 text-center text-slate-400">No appointments scheduled.</td></tr>' :
                                appointments.map(a => `
                                    <tr class="border-b">
                                        <td class="p-3 font-semibold text-slate-800">${a.last_name}, ${a.first_name}</td>
                                        <td class="p-3">${a.service}</td>
                                        <td class="p-3">${a.appointment_date} ${a.appointment_time}</td>
                                        <td class="p-3">${a.purpose}</td>
                                        <td class="p-3"><span class="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">${a.status}</span></td>
                                        <td class="p-3 text-right space-x-2">
                                            <a href="/staff/appointments/status/${a.id}/Approved" class="text-emerald-600 font-semibold hover:underline">Approve</a>
                                            <a href="/staff/appointments/status/${a.id}/Cancelled" class="text-rose-600 font-semibold hover:underline">Cancel</a>
                                        </td>
                                    </tr>
                                `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `, req));
    });
});

app.get('/staff/appointments/status/:id/:status', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.run(`UPDATE appointments SET status = ? WHERE id = ?`, [req.params.status, req.params.id], () => {
        res.redirect('/staff/appointments');
    });
});

app.get('/staff/blotter', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.all(`SELECT * FROM blotter_cases ORDER BY created_at DESC`, (err, cases) => {
        db.all(`SELECT * FROM residents WHERE account_status = 'Active'`, (err, residents) => {
            res.send(renderStaffLayout('Blotter & Incident Management', `
                <div class="space-y-6">
                    <h1 class="text-2xl font-bold text-slate-800">Blotter & Incident Management</h1>
                    <div class="bg-white p-6 rounded-xl shadow">
                        <h3 class="text-lg font-bold text-slate-800 mb-4">File New Blotter Case</h3>
                        <form action="/staff/blotter/add" method="POST" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div><label class="block text-sm font-medium">Case Number</label><input type="text" name="case_number" value="BLOTTER-${Date.now().toString().slice(-6)}" required class="w-full p-2 border rounded-lg"></div>
                            <div><label class="block text-sm font-medium">Complainant Name</label><input type="text" name="complainant_name" required class="w-full p-2 border rounded-lg"></div>
                            <div><label class="block text-sm font-medium">Respondent</label><input type="text" name="respondent" required class="w-full p-2 border rounded-lg"></div>
                            <div><label class="block text-sm font-medium">Incident Date</label><input type="date" name="incident_date" required class="w-full p-2 border rounded-lg"></div>
                            <div><label class="block text-sm font-medium">Location</label><input type="text" name="location" required class="w-full p-2 border rounded-lg"></div>
                            <div class="sm:col-span-3"><label class="block text-sm font-medium">Description</label><textarea name="description" required class="w-full p-2 border rounded-lg"></textarea></div>
                            <button type="submit" class="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold">Save Blotter Case</button>
                        </form>
                    </div>
                    <div class="bg-white rounded-xl shadow overflow-hidden">
                        <table class="w-full text-left text-sm text-slate-600">
                            <thead class="bg-slate-100 uppercase text-xs">
                                <tr><th class="p-3">Case No.</th><th class="p-3">Complainant</th><th class="p-3">Respondent</th><th class="p-3">Incident Date</th><th class="p-3">Status</th></tr>
                            </thead>
                            <tbody>
                                ${cases.map(b => `<tr class="border-b"><td class="p-3 font-semibold text-rose-600">${b.case_number}</td><td class="p-3">${b.complainant_name}</td><td class="p-3">${b.respondent}</td><td class="p-3">${b.incident_date}</td><td class="p-3"><span class="px-2 py-1 text-xs rounded-full bg-slate-100">${b.status}</span></td></tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `, req));
        });
    });
});

app.post('/staff/blotter/add', isAuthenticated, isAdminOrStaff, (req, res) => {
    const { case_number, complainant_name, respondent, incident_date, location, description } = req.body;
    db.run(`INSERT INTO blotter_cases (case_number, complainant_name, respondent, incident_date, location, description) VALUES (?, ?, ?, ?, ?, ?)`, [case_number, complainant_name, respondent, incident_date, location, description], () => {
        res.redirect('/staff/blotter');
    });
});

app.get('/staff/assistance', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.all(`SELECT a.*, r.first_name, r.last_name FROM assistance_requests a JOIN residents r ON a.resident_id = r.id`, (err, requests) => {
        res.send(renderStaffLayout('Assistance Requests', `
            <div class="space-y-6">
                <h1 class="text-2xl font-bold text-slate-800">Assistance Requests Management</h1>
                <div class="bg-white rounded-xl shadow overflow-hidden">
                    <table class="w-full text-left text-sm text-slate-600">
                        <thead class="bg-slate-100 uppercase text-xs">
                            <tr><th class="p-3">Resident</th><th class="p-3">Type</th><th class="p-3">Description</th><th class="p-3">Status</th><th class="p-3 text-right">Action</th></tr>
                        </thead>
                        <tbody>
                            ${requests.map(ar => `<tr class="border-b"><td class="p-3 font-semibold">${ar.last_name}, ${ar.first_name}</td><td class="p-3">${ar.assistance_type}</td><td class="p-3">${ar.description}</td><td class="p-3"><span class="px-2 py-1 text-xs rounded-full bg-blue-100">${ar.status}</span></td><td class="p-3 text-right"><a href="/staff/assistance/status/${ar.id}/Released" class="text-emerald-600 font-semibold hover:underline">Mark Released</a></td></tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `, req));
    });
});

app.get('/staff/assistance/status/:id/:status', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.run(`UPDATE assistance_requests SET status = ? WHERE id = ?`, [req.params.status, req.params.id], () => {
        res.redirect('/staff/assistance');
    });
});

app.get('/staff/announcements', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.all(`SELECT * FROM announcements ORDER BY created_at DESC`, (err, announcements) => {
        res.send(renderStaffLayout('Announcements Management', `
            <div class="space-y-6">
                <h1 class="text-2xl font-bold text-slate-800">Announcements</h1>
                <div class="bg-white p-6 rounded-xl shadow">
                    <h3 class="text-lg font-bold text-slate-800 mb-4">Post Announcement</h3>
                    <form action="/staff/announcements/add" method="POST" class="space-y-4">
                        <div><label class="block text-sm font-medium">Title</label><input type="text" name="title" required class="w-full p-2 border rounded-lg"></div>
                        <div><label class="block text-sm font-medium">Description</label><textarea name="description" required class="w-full p-2 border rounded-lg"></textarea></div>
                        <div><label class="block text-sm font-medium">Priority</label><select name="priority" class="w-full p-2 border rounded-lg"><option>Normal</option><option>Important</option><option>Emergency</option></select></div>
                        <button type="submit" class="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold">Post Announcement</button>
                    </form>
                </div>
            </div>
        `, req));
    });
});

app.post('/staff/announcements/add', isAuthenticated, isAdminOrStaff, (req, res) => {
    const { title, description, priority } = req.body;
    db.run(`INSERT INTO announcements (title, description, priority) VALUES (?, ?, ?)`, [title, description, priority], () => {
        res.redirect('/staff/announcements');
    });
});

app.get('/staff/businesses', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.all(`SELECT b.*, p.purok_name FROM businesses b LEFT JOIN puroks p ON b.purok_id = p.id`, (err, businesses) => {
        db.all(`SELECT * FROM puroks`, (err, puroks) => {
            res.send(renderStaffLayout('Business Permit Management', `
                <div class="space-y-6">
                    <h1 class="text-2xl font-bold text-slate-800">Business Permits Management</h1>
                    <div class="bg-white p-6 rounded-xl shadow">
                        <h3 class="text-lg font-bold text-slate-800 mb-4">Register Business</h3>
                        <form action="/staff/businesses/add" method="POST" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div><label class="block text-sm font-medium">Business Name</label><input type="text" name="business_name" required class="w-full p-2 border rounded-lg"></div>
                            <div><label class="block text-sm font-medium">Owner Name</label><input type="text" name="owner_name" required class="w-full p-2 border rounded-lg"></div>
                            <div><label class="block text-sm font-medium">Permit Number</label><input type="text" name="permit_number" required class="w-full p-2 border rounded-lg"></div>
                            <div class="sm:col-span-3"><label class="block text-sm font-medium">Address</label><input type="text" name="address" required class="w-full p-2 border rounded-lg"></div>
                            <button type="submit" class="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold">Register Business</button>
                        </form>
                    </div>
                </div>
            `, req));
        });
    });
});

app.post('/staff/businesses/add', isAuthenticated, isAdminOrStaff, (req, res) => {
    const { business_name, owner_name, address, permit_number } = req.body;
    db.run(`INSERT INTO businesses (business_name, owner_name, address, permit_number, permit_status) VALUES (?, ?, ?, ?, 'Active')`, [business_name, owner_name, address, permit_number], () => {
        res.redirect('/staff/businesses');
    });
});

app.get('/staff/settings', isAuthenticated, isAdminOrStaff, (req, res) => {
    db.get(`SELECT * FROM barangay_settings LIMIT 1`, (err, settings) => {
        res.send(renderStaffLayout('Barangay Settings', `
            <div class="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow space-y-6">
                <h1 class="text-2xl font-bold text-slate-800">Barangay Settings & Configuration</h1>
                <form action="/staff/settings" method="POST" enctype="multipart/form-data" class="space-y-4">
                    <div><label class="block text-sm font-medium">Barangay Name</label><input type="text" name="barangay_name" value="${settings.barangay_name}" required class="w-full p-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium">Municipality / City</label><input type="text" name="municipality" value="${settings.municipality}" required class="w-full p-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium">Province</label><input type="text" name="province" value="${settings.province}" required class="w-full p-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium">Barangay Captain Name</label><input type="text" name="captain_name" value="${settings.captain_name}" required class="w-full p-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium">Barangay Secretary Name</label><input type="text" name="secretary_name" value="${settings.secretary_name}" required class="w-full p-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium">Contact Number</label><input type="text" name="contact_number" value="${settings.contact_number}" required class="w-full p-2 border rounded-lg"></div>
                    <div><label class="block text-sm font-medium">Barangay Logo</label><input type="file" name="logo" class="w-full p-2 border rounded-lg"></div>
                    <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700">Save Settings</button>
                </form>
            </div>
        `, req));
    });
});

app.post('/staff/settings', upload.single('logo'), (req, res) => {
    const { barangay_name, municipality, province, captain_name, secretary_name, contact_number } = req.body;
    const logo_path = req.file ? '/uploads/' + req.file.filename : req.body.existing_logo;

    db.run(`UPDATE barangay_settings SET barangay_name = ?, municipality = ?, province = ?, captain_name = ?, secretary_name = ?, contact_number = ?, logo_path = COALESCE(?, logo_path)`, 
        [barangay_name, municipality, province, captain_name, secretary_name, contact_number, req.file ? '/uploads/' + req.file.filename : null], () => {
        logActivity(req.session.user.username, 'Updated barangay settings', req);
        res.redirect('/staff/settings');
    });
});

app.get('/resident/dashboard', isAuthenticated, isResident, (req, res) => {
    const residentIdLink = req.session.user.resident_id_link;
    db.get(`SELECT r.*, p.purok_name FROM residents r LEFT JOIN puroks p ON r.purok_id = p.id WHERE r.id = ?`, [residentIdLink], (err, resident) => {
        db.all(`SELECT * FROM certificate_requests WHERE resident_id = ?`, [residentIdLink], (err, requests) => {
            db.all(`SELECT * FROM announcements ORDER BY created_at DESC LIMIT 5`, (err, announcements) => {
                
                QRCode.toDataURL(`https://brgysanjose.gov.ph/verify/${resident.resident_id_number}`, (err, qrCodeUrl) => {
                    res.send(renderResidentLayout('Resident Portal Dashboard', `
                        <div class="space-y-6">
                            <div class="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-8 rounded-2xl shadow-lg flex flex-col sm:flex-row justify-between items-center gap-6">
                                <div class="flex items-center gap-4">
                                    <img src="${resident.photo_path || 'https://placehold.co/100x100/ffffff/1e3a8a?text=Photo'}" class="w-20 h-20 rounded-full object-cover border-2 border-white shadow">
                                    <div>
                                        <h1 class="text-2xl font-bold">Welcome, ${resident.first_name} ${resident.last_name}!</h1>
                                        <p class="text-blue-200 text-sm mt-1">Resident ID: <span class="font-mono font-bold">${resident.resident_id_number}</span></p>
                                        <p class="text-blue-200 text-xs">Purok: ${resident.purok_name || 'N/A'}</p>
                                    </div>
                                </div>
                                <a href="/resident/digital-id" class="px-6 py-3 bg-white text-blue-900 rounded-xl font-bold shadow hover:bg-blue-50 transition">View Digital ID</a>
                            </div>

                            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div class="bg-white p-6 rounded-xl shadow space-y-4">
                                    <div class="flex justify-between items-center">
                                        <h3 class="text-lg font-bold text-slate-800">My Certificate Requests</h3>
                                        <a href="/resident/request-certificate" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">+ Request New</a>
                                    </div>
                                    <table class="w-full text-left text-sm text-slate-600">
                                        <thead class="bg-slate-100 uppercase text-xs">
                                            <tr><th class="p-2">Type</th><th class="p-2">Purpose</th><th class="p-2">Status</th><th class="p-2">File</th></tr>
                                        </thead>
                                        <tbody>
                                            ${requests.map(r => `
                                                <tr class="border-b">
                                                    <td class="p-2 font-semibold">${r.certificate_type}</td>
                                                    <td class="p-2">${r.purpose}</td>
                                                    <td class="p-2"><span class="px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-800">${r.status}</span></td>
                                                    <td class="p-2">${r.certificate_file ? `<a href="${r.certificate_file}" target="_blank" class="text-blue-600 font-semibold underline">Download</a>` : 'Pending'}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>

                                <div class="bg-white p-6 rounded-xl shadow space-y-4">
                                    <h3 class="text-lg font-bold text-slate-800">Barangay Announcements</h3>
                                    <div class="space-y-3">
                                        ${announcements.map(a => `
                                            <div class="p-4 bg-slate-50 rounded-xl border-l-4 border-blue-600">
                                                <h4 class="font-bold text-slate-800">${a.title}</h4>
                                                <p class="text-xs text-slate-600 mt-1">${a.description}</p>
                                                <span class="inline-block mt-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] rounded font-bold">${a.priority}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `, req));
                });
            });
        });
    });
});

app.get('/resident/digital-id', isAuthenticated, isResident, (req, res) => {
    const residentIdLink = req.session.user.resident_id_link;
    db.get(`SELECT r.*, p.purok_name FROM residents r LEFT JOIN puroks p ON r.purok_id = p.id WHERE r.id = ?`, [residentIdLink], (err, resident) => {
        QRCode.toDataURL(`https://brgysanjose.gov.ph/verify/${resident.resident_id_number}`, (err, qrCodeUrl) => {
            res.send(renderResidentLayout('My Digital ID', `
                <div class="max-w-md mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
                    <div class="bg-blue-900 text-white p-6 text-center relative">
                        <img src="${res.locals.settings.logo_path || 'https://placehold.co/60x60/ffffff/1e3a8a?text=BRGY'}" class="w-16 h-16 mx-auto rounded-full object-cover mb-2 border-2 border-white">
                        <h2 class="text-lg font-bold">${res.locals.settings.barangay_name}</h2>
                        <p class="text-xs text-blue-200">${res.locals.settings.municipality}</p>
                    </div>
                    <div class="p-6 text-center space-y-4">
                        <img src="${resident.photo_path || 'https://placehold.co/120x120/e2e8f0/64748b?text=Photo'}" class="w-32 h-32 mx-auto rounded-full object-cover border-4 border-blue-100 shadow">
                        <div>
                            <h3 class="text-xl font-bold text-slate-800">${resident.first_name} ${resident.middle_name || ''} ${resident.last_name} ${resident.suffix || ''}</h3>
                            <p class="text-blue-600 font-mono font-bold text-sm mt-1">${resident.resident_id_number}</p>
                        </div>
                        <div class="bg-slate-50 p-4 rounded-xl text-left text-sm space-y-1">
                            <p><span class="font-semibold text-slate-500">Address:</span> ${resident.address}</p>
                            <p><span class="font-semibold text-slate-500">Purok:</span> ${resident.purok_name || 'N/A'}</p>
                            <p><span class="font-semibold text-slate-500">Date of Birth:</span> ${resident.dob}</p>
                            <p><span class="font-semibold text-slate-500">Contact:</span> ${resident.contact_number}</p>
                        </div>
                        <div>
                            <img src="${qrCodeUrl}" class="w-32 h-32 mx-auto">
                            <p class="text-[10px] text-slate-400 mt-1">Scan QR code for secure ID verification.</p>
                        </div>
                    </div>
                </div>
            `, req));
        });
    });
});

app.get('/resident/request-certificate', isAuthenticated, isResident, (req, res) => {
    res.send(renderResidentLayout('Request Certificate', `
        <div class="max-w-xl mx-auto bg-white p-8 rounded-xl shadow">
            <h1 class="text-2xl font-bold text-slate-800 mb-6">Request Barangay Certificate</h1>
            <form action="/resident/request-certificate" method="POST" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium">Certificate Type</label>
                    <select name="certificate_type" class="w-full p-2 border rounded-lg">
                        <option value="Barangay Clearance">Barangay Clearance</option>
                        <option value="Certificate of Residency">Certificate of Residency</option>
                        <option value="Certificate of Indigency">Certificate of Indigency</option>
                        <option value="Certificate of Good Moral Character">Certificate of Good Moral Character</option>
                        <option value="Certificate of No Income">Certificate of No Income</option>
                    </select>
                </div>
                <div><label class="block text-sm font-medium">Purpose</label><input type="text" name="purpose" required class="w-full p-2 border rounded-lg"></div>
                <div><label class="block text-sm font-medium">Additional Information</label><textarea name="additional_info" class="w-full p-2 border rounded-lg"></textarea></div>
                <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700">Submit Request</button>
            </form>
        </div>
    `, req));
});

app.post('/resident/request-certificate', isAuthenticated, isResident, (req, res) => {
    const { certificate_type, purpose, additional_info } = req.body;
    const residentId = req.session.user.resident_id_link;
    const reqNum = `REQ-${Date.now().toString().slice(-6)}`;

    db.run(`INSERT INTO certificate_requests (request_number, resident_id, certificate_type, purpose, additional_info) VALUES (?, ?, ?, ?, ?)`,
        [reqNum, residentId, certificate_type, purpose, additional_info], () => {
            res.redirect('/resident/dashboard');
        });
});

app.get('/verify/:resident_id_number', (req, res) => {
    const idNumber = req.params.resident_id_number;
    db.get(`SELECT r.*, p.purok_name FROM residents r LEFT JOIN puroks p ON r.purok_id = p.id WHERE r.resident_id_number = ?`, [idNumber], (err, resident) => {
        if (!resident) {
            return res.send(renderAlertPage('Verification Failed', 'Invalid or non-existent Resident ID number.', '/login'));
        }
        res.send(renderLayout('ID Verification', `
            <div class="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center space-y-4 border border-slate-100">
                    <div class="inline-flex p-3 bg-emerald-100 text-emerald-600 rounded-full mb-2">
                        <i class="fas fa-check-circle text-3xl"></i>
                    </div>
                    <h1 class="text-2xl font-bold text-slate-800">Barangay ID Verification</h1>
                    <img src="${resident.photo_path || 'https://placehold.co/100x100/e2e8f0/64748b?text=Photo'}" class="w-24 h-24 mx-auto rounded-full object-cover shadow border">
                    <h2 class="text-xl font-bold text-slate-800">${resident.first_name} ${resident.last_name}</h2>
                    <p class="text-blue-600 font-mono font-bold">${resident.resident_id_number}</p>
                    <div class="bg-slate-50 p-4 rounded-xl text-left text-sm space-y-2">
                        <p><span class="font-semibold">Purok:</span> ${resident.purok_name || 'N/A'}</p>
                        <p><span class="font-semibold">Status:</span> <span class="text-emerald-600 font-bold">${resident.account_status}</span></p>
                    </div>
                    <p class="text-xs text-slate-400">Official Barangay ID issued by ${res.locals.settings.barangay_name}</p>
                </div>
            </div>
        `, { hideNav: true }));
    });
});

function renderLayout(title, content, options = {}) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} | Barangay System</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    </head>
    <body class="bg-slate-100 font-sans text-slate-800 antialiased">
        ${content}
    </body>
    </html>`;
}

function renderStaffLayout(title, content, req) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} | Staff Portal</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    </head>
    <body class="bg-slate-100 font-sans text-slate-800 antialiased">
        <div class="flex h-screen overflow-hidden">
            <aside class="w-64 bg-slate-900 text-slate-300 flex flex-col hidden md:flex">
                <div class="p-6 border-b border-slate-800 text-center">
                    <img src="${res.locals.settings.logo_path || 'https://placehold.co/60x60/1e3a8a/ffffff?text=BRGY'}" class="w-12 h-12 mx-auto rounded-full object-cover mb-2">
                    <h2 class="font-bold text-white text-sm">${res.locals.settings.barangay_name}</h2>
                    <p class="text-xs text-slate-400">Staff Portal</p>
                </div>
                <nav class="flex-1 p-4 space-y-1 overflow-y-auto text-sm">
                    <a href="/staff/dashboard" class="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white"><i class="fas fa-chart-pie w-5"></i> Dashboard</a>
                    <a href="/staff/residents" class="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white"><i class="fas fa-users w-5"></i> Residents</a>
                    <a href="/staff/households" class="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white"><i class="fas fa-home w-5"></i> Households</a>
                    <a href="/staff/puroks" class="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white"><i class="fas fa-map-marker-alt w-5"></i> Puroks</a>
                    <a href="/staff/certificates" class="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white"><i class="fas fa-file-alt w-5"></i> Certificates</a>
                    <a href="/staff/appointments" class="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white"><i class="fas fa-calendar-check w-5"></i> Appointments</a>
                    <a href="/staff/blotter" class="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white"><i class="fas fa-gavel w-5"></i> Blotter Cases</a>
                    <a href="/staff/assistance" class="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white"><i class="fas fa-hands-helping w-5"></i> Assistance</a>
                    <a href="/staff/announcements" class="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white"><i class="fas fa-bullhorn w-5"></i> Announcements</a>
                    <a href="/staff/businesses" class="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white"><i class="fas fa-store w-5"></i> Businesses</a>
                    <a href="/staff/settings" class="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-800 hover:text-white"><i class="fas fa-cogs w-5"></i> Settings</a>
                </nav>
                <div class="p-4 border-t border-slate-800">
                    <a href="/logout" class="flex items-center gap-3 px-4 py-2 text-rose-400 hover:bg-slate-800 rounded-lg text-sm"><i class="fas fa-sign-out-alt w-5"></i> Logout</a>
                </div>
            </aside>
            <main class="flex-1 flex flex-col overflow-y-auto">
                <header class="bg-white shadow-sm h-16 flex items-center justify-between px-6">
                    <h1 class="text-lg font-bold text-slate-800">${title}</h1>
                    <div class="flex items-center gap-3">
                        <span class="text-sm font-semibold text-slate-600">${req.session.user.username} (${req.session.user.role})</span>
                    </div>
                </header>
                <div class="p-8">${content}</div>
            </main>
        </div>
    </body>
    </html>`;
}

function renderResidentLayout(title, content, req) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} | Resident Portal</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    </head>
    <body class="bg-slate-100 font-sans text-slate-800 antialiased">
        <nav class="bg-blue-900 text-white shadow-md">
            <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <h1 class="font-bold text-lg">${res.locals.settings.barangay_name} Resident Portal</h1>
                </div>
                <div class="flex items-center gap-6 text-sm">
                    <a href="/resident/dashboard" class="hover:underline">Dashboard</a>
                    <a href="/resident/digital-id" class="hover:underline">Digital ID</a>
                    <a href="/resident/request-certificate" class="hover:underline">Request Certificate</a>
                    <a href="/logout" class="text-rose-300 font-semibold">Logout</a>
                </div>
            </div>
        </nav>
        <main class="max-w-7xl mx-auto p-6 md:p-8">${content}</main>
    </body>
    </html>`;
}

function renderAlertPage(title, message, redirectUrl) {
    return `<!DOCTYPE html>
    <html>
    <head><title>${title}</title><script src="https://cdn.tailwindcss.com"></script></head>
    <body class="bg-slate-100 flex items-center justify-center h-screen">
        <div class="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-4">
            <h1 class="text-xl font-bold text-slate-800">${title}</h1>
            <p class="text-sm text-slate-600">${message}</p>
            <a href="${redirectUrl}" class="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">Continue</a>
        </div>
    </body>
    </html>`;
}

app.listen(PORT, () => {
    console.log(`Barangay Resident Management System running on port ${PORT}`);
});
