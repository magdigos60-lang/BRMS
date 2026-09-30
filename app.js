/**
 * BARANGAY RESIDENT MANAGEMENT SYSTEM
 * Entire application backend and server-rendered modular frontend.
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase Initialization
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('CRITICAL ERROR: SUPABASE_URL or SUPABASE_ANON_KEY environment variables missing.');
}

const supabase = createClient(SUPABASE_URL || 'https://placeholder.supabase.co', SUPABASE_ANON_KEY || 'placeholder');

// Express Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'barangay_management_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 Hours
}));

// Multer Storage setup for file handling
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Helper Functions
async function logActivity(userId, username, action, details, ip) {
    try {
        await supabase.from('user_activity_logs').insert([{
            user_id: userId || null,
            username: username || 'System',
            action: action,
            details: details,
            ip_address: ip || '127.0.0.1'
        }]);
    } catch (e) {
        console.error('Log Activity Error:', e);
    }
}

async function getBarangaySettings() {
    const { data } = await supabase.from('barangay_settings').select('*').limit(1).single();
    return data || {
        barangay_name: 'Barangay Central',
        municipality: 'City Center',
        province: 'Main Province',
        system_name: 'Barangay Resident Management System',
        logo_url: '',
        captain_signature_url: '',
        id_background_url: ''
    };
}

// Authentication & Authorization Middlewares
function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user || !['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff'].includes(req.session.user.role)) {
        return res.status(403).send('Forbidden: Administrative access required.');
    }
    next();
}

function requireResident(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'Resident') {
        return res.status(403).send('Forbidden: Resident access required.');
    }
    next();
}

// --- CORE SYSTEM SETUP & ROUTING ---

app.get('/', async (req, res) => {
    // Check initial system setup
    const { data: setup } = await supabase.from('system_settings').select('*').limit(1).single();
    if (!setup || !setup.is_setup_complete) {
        return res.redirect('/setup');
    }
    if (req.session.user) {
        if (req.session.user.role === 'Resident') {
            return res.redirect('/resident/dashboard');
        } else {
            return res.redirect('/admin/dashboard');
        }
    }
    res.redirect('/login');
});

// INITIAL ADMIN SETUP PAGE
app.get('/setup', async (req, res) => {
    const { data: setup } = await supabase.from('system_settings').select('*').limit(1).single();
    if (setup && setup.is_setup_complete) {
        return res.redirect('/login');
    }

    const settings = await getBarangaySettings();
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Initial System Setup - ${settings.system_name}</title>
        <style>
            :root { --primary-blue: #1e3a8a; --accent-green: #059669; --bg-white: #ffffff; --light-bg: #f3f4f6; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: var(--light-bg); margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
            .setup-card { background: white; padding: 2.5rem; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 100%; max-width: 480px; border-top: 6px solid var(--primary-blue); }
            h2 { color: var(--primary-blue); margin-bottom: 0.5rem; text-align: center; }
            p { color: #6b7280; text-align: center; font-size: 0.9rem; margin-bottom: 1.5rem; }
            .form-group { margin-bottom: 1.2rem; }
            label { display: block; margin-bottom: 0.4rem; font-weight: 600; color: #374151; font-size: 0.85rem; }
            input { width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 0.95rem; }
            input:focus { outline: none; border-color: var(--accent-green); box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.2); }
            .btn-submit { width: 100%; background: var(--primary-blue); color: white; border: none; padding: 0.8rem; font-size: 1rem; border-radius: 6px; font-weight: bold; cursor: pointer; transition: background 0.2s; }
            .btn-submit:hover { background: #1e40af; }
            .alert { padding: 0.75rem; background: #fee2e2; border-left: 4px solid #ef4444; color: #b91c1c; margin-bottom: 1rem; border-radius: 4px; font-size: 0.85rem; display: none; }
        </style>
    </head>
    <body>
        <div class="setup-card">
            <h2>System Initial Setup</h2>
            <p>Create the primary Super Administrator account to initialize your Barangay System.</p>
            <div id="error-alert" class="alert"></div>
            <form id="setup-form">
                <div class="form-group">
                    <label>Administrator Username</label>
                    <input type="text" name="username" required placeholder="admin">
                </div>
                <div class="form-group">
                    <label>Administrator Email Address</label>
                    <input type="email" name="email" required placeholder="admin@barangay.gov.ph">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" name="password" required minlength="8" placeholder="••••••••">
                </div>
                <div class="form-group">
                    <label>Confirm Password</label>
                    <input type="password" name="confirm_password" required minlength="8" placeholder="••••••••">
                </div>
                <button type="submit" class="btn-submit">Initialize Application</button>
            </form>
        </div>
        <script>
            document.getElementById('setup-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());
                const alert = document.getElementById('error-alert');
                
                if(data.password !== data.confirm_password) {
                    alert.innerText = "Passwords do not match.";
                    alert.style.display = "block";
                    return;
                }

                const res = await fetch('/api/setup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if(result.success) {
                    window.location.href = '/login?setup=complete';
                } else {
                    alert.innerText = result.message || "Setup failed.";
                    alert.style.display = "block";
                }
            });
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

app.post('/api/setup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const { data: setup } = await supabase.from('system_settings').select('*').limit(1).single();
        if (setup && setup.is_setup_complete) {
            return res.status(400).json({ success: false, message: 'Setup has already been completed.' });
        }

        const password_hash = await bcrypt.hash(password, 10);
        const { data: newUser, error: userErr } = await supabase.from('users').insert([{
            username,
            email,
            password_hash,
            role: 'Super Admin',
            is_active: true
        }]).select().single();

        if (userErr) throw userErr;

        await supabase.from('system_settings').update({ is_setup_complete: true }).eq('id', setup.id);
        await logActivity(newUser.id, username, 'INITIAL_SETUP', 'Created Super Admin account during system setup', req.ip);

        res.json({ success: true });
    } catch (err) {
        console.error('Setup Endpoint Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// SYSTEM LOGIN PAGE
app.get('/login', async (req, res) => {
    const settings = await getBarangaySettings();
    const bgImage = "https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1920&q=80";

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login - ${settings.system_name}</title>
        <style>
            :root { --primary-blue: #1e3a8a; --accent-green: #059669; --bg-white: #ffffff; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: url('${bgImage}') no-repeat center center fixed; background-size: cover; position: relative; }
            body::before { content: ''; position: absolute; top:0; left:0; right:0; bottom:0; background: linear-gradient(135deg, rgba(30, 58, 138, 0.85), rgba(5, 150, 105, 0.75)); z-index: 1; }
            .login-container { position: relative; z-index: 2; width: 100%; max-width: 420px; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); padding: 2.5rem; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.3); }
            .logo-header { text-align: center; margin-bottom: 1.5rem; }
            .logo-header img { width: 80px; height: 80px; object-fit: contain; margin-bottom: 0.5rem; border-radius: 50%; background: white; padding: 4px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
            .logo-header h1 { font-size: 1.25rem; color: var(--primary-blue); margin: 0; text-transform: uppercase; font-weight: 800; }
            .logo-header p { font-size: 0.85rem; color: #4b5563; margin: 4px 0 0 0; }
            .form-group { margin-bottom: 1.2rem; }
            label { display: block; margin-bottom: 0.3rem; font-weight: 600; color: #374151; font-size: 0.85rem; }
            input, select { width: 100%; padding: 0.75rem; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; font-size: 0.95rem; }
            input:focus, select:focus { outline: none; border-color: var(--accent-green); box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.2); }
            .btn-login { width: 100%; background: var(--primary-blue); color: white; border: none; padding: 0.85rem; font-size: 1rem; border-radius: 8px; font-weight: bold; cursor: pointer; transition: all 0.2s ease; margin-top: 0.5rem; }
            .btn-login:hover { background: var(--accent-green); transform: translateY(-1px); }
            .alert { padding: 0.75rem; background: #fee2e2; border-left: 4px solid #ef4444; color: #b91c1c; margin-bottom: 1rem; border-radius: 6px; font-size: 0.85rem; display: none; }
            .links { text-align: center; margin-top: 1.5rem; font-size: 0.85rem; color: #4b5563; }
            .links a { color: var(--primary-blue); text-decoration: none; font-weight: 600; }
            .links a:hover { text-decoration: underline; color: var(--accent-green); }
        </style>
    </head>
    <body>
        <div class="login-container">
            <div class="logo-header">
                <img src="${settings.logo_url || 'https://via.placeholder.com/80?text=Logo'}" alt="Barangay Logo">
                <h1>${settings.barangay_name}</h1>
                <p>${settings.system_name}</p>
            </div>
            <div id="login-alert" class="alert"></div>
            <form id="login-form">
                <div class="form-group">
                    <label>Username or Email Address</label>
                    <input type="text" name="identifier" required placeholder="Enter your credential">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" name="password" required placeholder="••••••••">
                </div>
                <button type="submit" class="btn-login">Sign In</button>
            </form>
            <div class="links">
                Are you a resident? <a href="/register">Register for Resident Portal</a>
            </div>
        </div>
        <script>
            document.getElementById('login-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());
                const alert = document.getElementById('login-alert');

                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if (result.success) {
                    window.location.href = result.redirect;
                } else {
                    alert.innerText = result.message || 'Invalid authentication credentials.';
                    alert.style.display = 'block';
                }
            });
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

app.post('/api/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;
        const { data: user, error } = await supabase.from('users')
            .select('*')
            .or(`username.eq.${identifier},email.eq.${identifier}`)
            .limit(1)
            .single();

        if (error || !user || !user.is_active) {
            await supabase.from('login_history').insert([{ username: identifier, login_status: 'FAILED_INVALID_USER', ip_address: req.ip }]);
            return res.status(401).json({ success: false, message: 'Invalid credentials or inactive account.' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            await supabase.from('login_history').insert([{ user_id: user.id, username: identifier, login_status: 'FAILED_BAD_PASSWORD', ip_address: req.ip }]);
            return res.status(401).json({ success: false, message: 'Invalid credentials or password.' });
        }

        // Fetch Resident record if user is a Resident
        let resident = null;
        if (user.role === 'Resident') {
            const { data: resData } = await supabase.from('residents').select('*').eq('user_id', user.id).single();
            resident = resData;
            if (resident && resident.resident_status !== 'ACTIVE') {
                return res.status(403).json({ success: false, message: `Account pending or invalid. Status: ${resident.resident_status}` });
            }
        }

        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            resident_id: resident ? resident.id : null
        };

        await supabase.from('login_history').insert([{ user_id: user.id, username: user.username, login_status: 'SUCCESS', ip_address: req.ip }]);
        await logActivity(user.id, user.username, 'LOGIN', 'User successfully logged in', req.ip);

        const redirect = user.role === 'Resident' ? '/resident/dashboard' : '/admin/dashboard';
        res.json({ success: true, redirect });
    } catch (err) {
        console.error('Login Endpoint Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/logout', async (req, res) => {
    if (req.session.user) {
        await logActivity(req.session.user.id, req.session.user.username, 'LOGOUT', 'User logged out', req.ip);
        req.session.destroy();
    }
    res.redirect('/login');
});

// PUBLIC RESIDENT REGISTRATION PAGE
app.get('/register', async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: puroks } = await supabase.from('puroks').select('*').order('name');

    let purokOptions = (puroks || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Resident Registration - ${settings.system_name}</title>
        <style>
            :root { --primary-blue: #1e3a8a; --accent-green: #059669; --light-bg: #f8fafc; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: var(--light-bg); margin: 0; padding: 2rem 1rem; color: #334155; }
            .reg-container { max-width: 800px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); overflow: hidden; border-top: 6px solid var(--accent-green); }
            .reg-header { background: var(--primary-blue); color: white; padding: 2rem; text-align: center; }
            .reg-header h2 { margin: 0; font-size: 1.5rem; }
            .reg-header p { margin: 0.5rem 0 0 0; opacity: 0.9; font-size: 0.9rem; }
            form { padding: 2rem; }
            .section-title { font-size: 1.1rem; color: var(--primary-blue); border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; margin-top: 1.5rem; margin-bottom: 1rem; font-weight: 700; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
            .form-group { margin-bottom: 1rem; }
            label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.3rem; color: #475569; }
            input, select, textarea { width: 100%; padding: 0.65rem; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; font-size: 0.9rem; }
            input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent-green); box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15); }
            .btn-submit { background: var(--accent-green); color: white; border: none; padding: 0.85rem 2rem; font-size: 1rem; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 1.5rem; transition: background 0.2s; }
            .btn-submit:hover { background: #047857; }
            .alert { padding: 0.75rem; background: #fee2e2; border-left: 4px solid #ef4444; color: #b91c1c; margin-bottom: 1rem; border-radius: 6px; font-size: 0.85rem; display: none; }
        </style>
    </head>
    <body>
        <div class="reg-container">
            <div class="reg-header">
                <h2>Barangay Resident Registration</h2>
                <p>Fill out the official form below to register for an official Barangay Account & Resident Card.</p>
            </div>
            <form id="register-form">
                <div id="reg-alert" class="alert"></div>
                <div class="section-title">1. Personal Information</div>
                <div class="grid">
                    <div class="form-group"><label>First Name *</label><input type="text" name="first_name" required></div>
                    <div class="form-group"><label>Middle Name</label><input type="text" name="middle_name"></div>
                    <div class="form-group"><label>Last Name *</label><input type="text" name="last_name" required></div>
                    <div class="form-group"><label>Suffix</label><input type="text" name="suffix" placeholder="e.g. Jr., Sr., III"></div>
                </div>
                <div class="grid">
                    <div class="form-group"><label>Date of Birth *</label><input type="date" name="date_of_birth" required></div>
                    <div class="form-group">
                        <label>Gender *</label>
                        <select name="gender" required>
                            <option value="">Select Gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Civil Status *</label>
                        <select name="civil_status" required>
                            <option value="Single">Single</option>
                            <option value="Married">Married</option>
                            <option value="Widowed">Widowed</option>
                            <option value="Separated">Separated</option>
                        </select>
                    </div>
                    <div class="form-group"><label>Occupation</label><input type="text" name="occupation"></div>
                </div>

                <div class="section-title">2. Contact & Address Details</div>
                <div class="grid">
                    <div class="form-group"><label>Contact Number *</label><input type="text" name="contact_number" required placeholder="09123456789"></div>
                    <div class="form-group"><label>Email Address *</label><input type="email" name="email" required placeholder="name@domain.com"></div>
                    <div class="form-group">
                        <label>Purok *</label>
                        <select name="purok_id" required>
                            <option value="">Select Purok</option>
                            ${purokOptions}
                        </select>
                    </div>
                </div>
                <div class="form-group"><label>Complete Address *</label><textarea name="address" rows="2" required placeholder="House No., Street Name"></textarea></div>

                <div class="section-title">3. Account Credentials</div>
                <div class="grid">
                    <div class="form-group"><label>Account Username *</label><input type="text" name="username" required></div>
                    <div class="form-group"><label>Account Password *</label><input type="password" name="password" minlength="8" required></div>
                </div>

                <button type="submit" class="btn-submit">Submit Registration Request</button>
            </form>
        </div>
        <script>
            document.getElementById('register-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());
                const alert = document.getElementById('reg-alert');

                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if (result.success) {
                    alert.style.background = '#d1fae5';
                    alert.style.borderColor = '#10b981';
                    alert.style.color = '#065f46';
                    alert.innerText = "Registration submitted successfully! Your account is pending Barangay Admin approval.";
                    alert.style.display = 'block';
                    e.target.reset();
                } else {
                    alert.style.background = '#fee2e2';
                    alert.style.borderColor = '#ef4444';
                    alert.style.color = '#b91c1c';
                    alert.innerText = result.message || "Registration failed.";
                    alert.style.display = 'block';
                }
            });
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, first_name, middle_name, last_name, suffix, date_of_birth, gender, civil_status, occupation, contact_number, purok_id, address } = req.body;

        const password_hash = await bcrypt.hash(password, 10);
        
        // 1. Create User
        const { data: newUser, error: uErr } = await supabase.from('users').insert([{
            username,
            email,
            password_hash,
            role: 'Resident',
            is_active: true
        }]).select().single();

        if (uErr) return res.status(400).json({ success: false, message: 'Username or Email already registered.' });

        // 2. Create Pending Resident Record
        const { error: rErr } = await supabase.from('residents').insert([{
            user_id: newUser.id,
            first_name,
            middle_name,
            last_name,
            suffix,
            date_of_birth,
            gender,
            civil_status,
            occupation,
            contact_number,
            email,
            purok_id: purok_id || null,
            address,
            resident_status: 'PENDING_APPROVAL'
        }]);

        if (rErr) throw rErr;

        res.json({ success: true });
    } catch (err) {
        console.error('Registration Endpoint Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});
// --- ADMIN DASHBOARD & MODULE TEMPLATES ---

function renderAdminLayout(title, content, activeTab, user) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - Barangay Admin Portal</title>
        <style>
            :root { --primary-blue: #1e3a8a; --accent-green: #059669; --bg-light: #f8fafc; --sidebar-width: 260px; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin:0; padding:0; background: var(--bg-light); color: #334155; display: flex; min-height: 100vh; }
            .sidebar { width: var(--sidebar-width); background: var(--primary-blue); color: white; flex-shrink: 0; display: flex; flex-direction: column; }
            .sidebar-header { padding: 1.5rem; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1); }
            .sidebar-header h3 { margin: 0; font-size: 1.1rem; text-transform: uppercase; tracking: 1px; }
            .sidebar-menu { list-style: none; padding: 0; margin: 1rem 0; flex-grow: 1; overflow-y: auto; }
            .sidebar-menu li a { display: block; padding: 0.75rem 1.5rem; color: #cbd5e1; text-decoration: none; font-size: 0.9rem; border-left: 4px solid transparent; transition: all 0.2s; }
            .sidebar-menu li a:hover, .sidebar-menu li a.active { background: rgba(255,255,255,0.1); color: white; border-left-color: var(--accent-green); }
            .main-content { flex-grow: 1; display: flex; flex-direction: column; overflow-x: hidden; }
            .top-bar { background: white; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; }
            .user-info { font-size: 0.9rem; font-weight: 600; color: #475569; }
            .content-area { padding: 2rem; flex-grow: 1; }
            .card { background: white; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); padding: 1.5rem; margin-bottom: 1.5rem; }
            .card-title { font-size: 1.1rem; font-weight: 700; color: var(--primary-blue); margin-bottom: 1rem; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; }
            .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
            .stat-card { background: white; border-radius: 8px; border-left: 4px solid var(--accent-green); padding: 1.2rem; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
            .stat-value { font-size: 1.8rem; font-weight: 800; color: var(--primary-blue); margin-top: 0.3rem; }
            .stat-label { font-size: 0.8rem; text-transform: uppercase; color: #64748b; font-weight: 600; }
            table { width: 100%; border-collapse: collapse; font-size: 0.9rem; text-align: left; }
            th { background: #f1f5f9; padding: 0.75rem 1rem; color: #475569; font-weight: 700; border-bottom: 2px solid #e2e8f0; }
            td { padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; }
            .btn { display: inline-block; padding: 0.5rem 1rem; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600; cursor: pointer; border: none; transition: background 0.2s; }
            .btn-primary { background: var(--primary-blue); color: white; }
            .btn-success { background: var(--accent-green); color: white; }
            .btn-danger { background: #dc2626; color: white; }
            .badge { padding: 0.25rem 0.6rem; border-radius: 50px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
            .badge-active { background: #d1fae5; color: #065f46; }
            .badge-pending { background: #fef3c7; color: #92400e; }
        </style>
    </head>
    <body>
        <div class="sidebar">
            <div class="sidebar-header">
                <h3>Admin Portal</h3>
            </div>
            <ul class="sidebar-menu">
                <li><a href="/admin/dashboard" class="${activeTab==='dashboard'?'active':''}">Dashboard</a></li>
                <li><a href="/admin/residents" class="${activeTab==='residents'?'active':''}">Resident Management</a></li>
                <li><a href="/admin/registrations" class="${activeTab==='registrations'?'active':''}">Pending Registrations</a></li>
                <li><a href="/admin/households" class="${activeTab==='households'?'active':''}">Household Management</a></li>
                <li><a href="/admin/puroks" class="${activeTab==='puroks'?'active':''}">Purok Management</a></li>
                <li><a href="/admin/certificates" class="${activeTab==='certificates'?'active':''}">Certificate Requests</a></li>
                <li><a href="/admin/blotter" class="${activeTab==='blotter'?'active':''}">Blotter & Complaints</a></li>
                <li><a href="/admin/assistance" class="${activeTab==='assistance'?'active':''}">Assistance Requests</a></li>
                <li><a href="/admin/appointments" class="${activeTab==='appointments'?'active':''}">Appointments</a></li>
                <li><a href="/admin/seniors" class="${activeTab==='seniors'?'active':''}">Senior Citizens</a></li>
                <li><a href="/admin/pwd" class="${activeTab==='pwd'?'active':''}">PWD Management</a></li>
                <li><a href="/admin/soloparents" class="${activeTab==='soloparents'?'active':''}">Solo Parents</a></li>
                <li><a href="/admin/announcements" class="${activeTab==='announcements'?'active':''}">Announcements & Events</a></li>
                <li><a href="/admin/officials" class="${activeTab==='officials'?'active':''}">Barangay Officials</a></li>
                <li><a href="/scanner" target="_blank">QR Code Verification</a></li>
                <li><a href="/admin/id-print" class="${activeTab==='id-print'?'active':''}">Bulk ID Printing (8/Page)</a></li>
                <li><a href="/admin/users" class="${activeTab==='users'?'active':''}">User Management</a></li>
                <li><a href="/admin/logs" class="${activeTab==='logs'?'active':''}">Activity & Login Logs</a></li>
                <li><a href="/admin/settings" class="${activeTab==='settings'?'active':''}">System & Barangay Settings</a></li>
            </ul>
        </div>
        <div class="main-content">
            <div class="top-bar">
                <div><strong>${title}</strong></div>
                <div class="user-info">
                    Logged in as: <strong>${user.username}</strong> (${user.role}) | <a href="/logout" style="color:#dc2626;">Logout</a>
                </div>
            </div>
            <div class="content-area">
                ${content}
            </div>
        </div>
    </body>
    </html>
    `;
}

// ADMIN DASHBOARD ROUTE
app.get('/admin/dashboard', requireAdmin, async (req, res) => {
    // Query statistics live from Supabase
    const { count: totalResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'ACTIVE');
    const { count: pendingRegs } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'PENDING_APPROVAL');
    const { count: totalHouseholds } = await supabase.from('households').select('*', { count: 'exact', head: true });
    const { count: totalPuroks } = await supabase.from('puroks').select('*', { count: 'exact', head: true });
    const { count: pendingCerts } = await supabase.from('certificate_requests').select('*', { count: 'exact', head: true }).eq('status', 'SUBMITTED');
    const { count: pendingAssistance } = await supabase.from('assistance_requests').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');

    const content = `
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-label">Active Residents</div>
            <div class="stat-value">${totalResidents || 0}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Pending Registrations</div>
            <div class="stat-value">${pendingRegs || 0}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Households</div>
            <div class="stat-value">${totalHouseholds || 0}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Puroks</div>
            <div class="stat-value">${totalPuroks || 0}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Pending Document Requests</div>
            <div class="stat-value">${pendingCerts || 0}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Pending Assistance Requests</div>
            <div class="stat-value">${pendingAssistance || 0}</div>
        </div>
    </div>

    <div class="card">
        <div class="card-title">Barangay Resident Management Information</div>
        <p>Welcome to the production dashboard. Real-time statistics are synchronized directly with your Supabase PostgreSQL cluster.</p>
    </div>
    `;

    res.send(renderAdminLayout('Dashboard', content, 'dashboard', req.session.user));
});

// RESIDENT MANAGEMENT ROUTE
app.get('/admin/residents', requireAdmin, async (req, res) => {
    const { data: residents } = await supabase.from('residents')
        .select('*, puroks(name)')
        .eq('resident_status', 'ACTIVE')
        .order('last_name');

    let rows = (residents || []).map(r => `
        <tr>
            <td><strong>${r.resident_id_number || 'N/A'}</strong></td>
            <td>${r.last_name}, ${r.first_name} ${r.middle_name || ''}</td>
            <td>${r.gender}</td>
            <td>${r.puroks ? r.puroks.name : 'Unassigned'}</td>
            <td>${r.contact_number || 'N/A'}</td>
            <td><span class="badge badge-active">${r.resident_status}</span></td>
            <td>
                <a href="/admin/residents/view/${r.id}" class="btn btn-primary">View / ID</a>
            </td>
        </tr>
    `).join('');

    if(!rows) {
        rows = `<tr><td colspan="7" style="text-align:center; color:#64748b;">No active residents found. Approve registered residents to populate the database.</td></tr>`;
    }

    const content = `
    <div class="card">
        <div class="card-title">Resident Management</div>
        <table>
            <thead>
                <tr>
                    <th>Resident ID</th>
                    <th>Full Name</th>
                    <th>Gender</th>
                    <th>Purok</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    </div>
    `;

    res.send(renderAdminLayout('Resident Management', content, 'residents', req.session.user));
});

// PENDING REGISTRATIONS APPROVAL ROUTE
app.get('/admin/registrations', requireAdmin, async (req, res) => {
    const { data: pending } = await supabase.from('residents')
        .select('*')
        .eq('resident_status', 'PENDING_APPROVAL')
        .order('created_at', { ascending: false });

    let rows = (pending || []).map(r => `
        <tr>
            <td>${r.last_name}, ${r.first_name} ${r.middle_name || ''}</td>
            <td>${r.email}</td>
            <td>${r.contact_number}</td>
            <td>${r.address}</td>
            <td>
                <button onclick="approveResident('${r.id}')" class="btn btn-success">Approve</button>
                <button onclick="rejectResident('${r.id}')" class="btn btn-danger">Reject</button>
            </td>
        </tr>
    `).join('');

    if(!rows) {
        rows = `<tr><td colspan="5" style="text-align:center; color:#64748b;">No pending registration requests.</td></tr>`;
    }

    const content = `
    <div class="card">
        <div class="card-title">Pending Resident Registration Approvals</div>
        <table>
            <thead>
                <tr>
                    <th>Full Name</th>
                    <th>Email</th>
                    <th>Contact</th>
                    <th>Address</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    </div>
    <script>
        async function approveResident(id) {
            if(!confirm('Approve this resident and generate official Barangay ID?')) return;
            const res = await fetch('/api/admin/residents/approve/' + id, { method: 'POST' });
            const data = await res.json();
            if(data.success) location.reload();
            else alert(data.message);
        }
        async function rejectResident(id) {
            const reason = prompt('Reason for rejection:');
            if(!reason) return;
            const res = await fetch('/api/admin/residents/reject/' + id, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });
            const data = await res.json();
            if(data.success) location.reload();
            else alert(data.message);
        }
    </script>
    `;

    res.send(renderAdminLayout('Pending Registrations', content, 'registrations', req.session.user));
});

app.post('/api/admin/residents/approve/:id', requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const year = new Date().getFullYear();
        const randNum = Math.floor(100000 + Math.random() * 900000);
        const residentIdNum = `BRGY-${year}-${randNum}`;

        const { error } = await supabase.from('residents').update({
            resident_status: 'ACTIVE',
            resident_id_number: residentIdNum
        }).eq('id', id);

        if (error) throw error;

        await logActivity(req.session.user.id, req.session.user.username, 'APPROVE_RESIDENT', `Approved resident registration ID: ${residentIdNum}`, req.ip);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

app.post('/api/admin/residents/reject/:id', requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const { reason } = req.body;

        const { error } = await supabase.from('residents').update({
            resident_status: 'REJECTED',
            rejection_reason: reason
        }).eq('id', id);

        if (error) throw error;

        await logActivity(req.session.user.id, req.session.user.username, 'REJECT_RESIDENT', `Rejected resident registration. Reason: ${reason}`, req.ip);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// PUROK MANAGEMENT ROUTE WITH LIVE RESIDENT COUNT
app.get('/admin/puroks', requireAdmin, async (req, res) => {
    const { data: puroks } = await supabase.from('puroks').select('*').order('name');
    const { data: residents } = await supabase.from('residents').select('purok_id').eq('resident_status', 'ACTIVE');

    // Calculate count dynamically from resident dataset
    const countMap = {};
    (residents || []).forEach(r => {
        if(r.purok_id) countMap[r.purok_id] = (countMap[r.purok_id] || 0) + 1;
    });

    let cards = (puroks || []).map(p => `
        <div class="stat-card" style="border-left-color: var(--primary-blue);">
            <div class="stat-label">${p.name}</div>
            <div class="stat-value">${countMap[p.id] || 0} Residents</div>
            <p style="font-size:0.8rem; color:#64748b; margin-top:0.5rem;">${p.description || 'No description provided.'}</p>
        </div>
    `).join('');

    const content = `
    <div class="card">
        <div class="card-title">Purok Management & Population Counts</div>
        <form id="add-purok-form" style="display:flex; gap:1rem; margin-bottom:1.5rem;">
            <input type="text" name="name" placeholder="Purok Name (e.g. Purok 1)" required style="flex:1;">
            <input type="text" name="description" placeholder="Description" style="flex:2;">
            <button type="submit" class="btn btn-success">Add Purok</button>
        </form>
    </div>
    <div class="stats-grid">
        ${cards}
    </div>
    <script>
        document.getElementById('add-purok-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            const res = await fetch('/api/admin/puroks/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if(result.success) location.reload();
            else alert(result.message);
        });
    </script>
    `;

    res.send(renderAdminLayout('Purok Management', content, 'puroks', req.session.user));
});

app.post('/api/admin/puroks/add', requireAdmin, async (req, res) => {
    try {
        const { name, description } = req.body;
        const { error } = await supabase.from('puroks').insert([{ name, description }]);
        if(error) throw error;
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ success: false, message: e.message });
    }
});
// --- RESIDENT PORTAL ---

function renderResidentLayout(title, content, activeTab, user) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - Resident Portal</title>
        <style>
            :root { --primary-blue: #1e3a8a; --accent-green: #059669; --bg-light: #f8fafc; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin:0; padding:0; background: var(--bg-light); color: #334155; }
            .navbar { background: var(--primary-blue); color: white; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
            .navbar h2 { margin: 0; font-size: 1.2rem; }
            .nav-links { display: flex; gap: 1rem; }
            .nav-links a { color: white; text-decoration: none; font-size: 0.9rem; font-weight: 600; padding: 0.4rem 0.8rem; border-radius: 4px; }
            .nav-links a.active, .nav-links a:hover { background: var(--accent-green); }
            .container { max-width: 1000px; margin: 2rem auto; padding: 0 1rem; }
            .card { background: white; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); padding: 1.5rem; margin-bottom: 1.5rem; }
            .card-title { font-size: 1.1rem; font-weight: 700; color: var(--primary-blue); margin-bottom: 1rem; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; }
            .btn { display: inline-block; padding: 0.6rem 1.2rem; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 600; cursor: pointer; border: none; }
            .btn-primary { background: var(--primary-blue); color: white; }
            .btn-success { background: var(--accent-green); color: white; }
        </style>
    </head>
    <body>
        <div class="navbar">
            <h2>Barangay Resident Portal</h2>
            <div class="nav-links">
                <a href="/resident/dashboard" class="${activeTab==='dashboard'?'active':''}">Dashboard</a>
                <a href="/resident/profile" class="${activeTab==='profile'?'active':''}">My Profile</a>
                <a href="/resident/digital-id" class="${activeTab==='id'?'active':''}">Digital ID</a>
                <a href="/resident/certificates" class="${activeTab==='certificates'?'active':''}">Request Documents</a>
                <a href="/logout" style="background:#dc2626;">Logout</a>
            </div>
        </div>
        <div class="container">
            ${content}
        </div>
    </body>
    </html>
    `;
}

app.get('/resident/dashboard', requireResident, async (req, res) => {
    const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('id', req.session.user.resident_id).single();

    const content = `
    <div class="card">
        <div class="card-title">Welcome, ${resident.first_name}!</div>
        <p><strong>Resident ID:</strong> ${resident.resident_id_number || 'PENDING'}</p>
        <p><strong>Purok:</strong> ${resident.puroks ? resident.puroks.name : 'Unassigned'}</p>
        <p><strong>Status:</strong> <span style="color:var(--accent-green); font-weight:bold;">${resident.resident_status}</span></p>
    </div>
    `;

    res.send(renderResidentLayout('Resident Dashboard', content, 'dashboard', req.session.user));
});

// DIGITAL RESIDENT ID PAGE & PHYSICAL ID MATCHING DESIGN
app.get('/resident/digital-id', requireResident, async (req, res) => {
    const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('id', req.session.user.resident_id).single();
    const settings = await getBarangaySettings();

    // Generate Verification QR Code
    const qrDataUrl = await QRCode.toDataURL(`${req.protocol}://${req.get('host')}/verify/resident/${resident.qr_secure_token}`);

    const content = `
    <div class="card" style="text-align: center;">
        <div class="card-title">Official Digital Barangay Resident Card</div>
        <p style="font-size:0.85rem; color:#64748b;">This card is an officially issued Barangay Identification Document.</p>
        
        <!-- BARANGAY ID CARD CONTAINER -->
        <div style="width: 350px; height: 220px; background: linear-gradient(135deg, #1e3a8a, #059669); color: white; border-radius: 12px; margin: 2rem auto; padding: 12px; box-shadow: 0 10px 20px rgba(0,0,0,0.2); position: relative; text-align: left; box-sizing: border-box;">
            <div style="display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 6px;">
                <img src="${settings.logo_url || 'https://via.placeholder.com/40'}" style="width: 36px; height: 36px; border-radius: 50%; background: white;">
                <div>
                    <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.5px;">${settings.barangay_name}</div>
                    <div style="font-size: 0.8rem; font-weight: 800;">BARANGAY RESIDENT CARD</div>
                </div>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <img src="${resident.photo_url || 'https://via.placeholder.com/80?text=Photo'}" style="width: 70px; height: 70px; object-fit: cover; border-radius: 6px; border: 2px solid white;">
                <div style="font-size: 0.7rem; line-height: 1.3;">
                    <div style="font-size: 0.85rem; font-weight: bold; color: #fef08a;">${resident.last_name}, ${resident.first_name}</div>
                    <div><strong>ID:</strong> ${resident.resident_id_number}</div>
                    <div><strong>DOB:</strong> ${resident.date_of_birth}</div>
                    <div><strong>Purok:</strong> ${resident.puroks ? resident.puroks.name : 'N/A'}</div>
                </div>
                <img src="${qrDataUrl}" style="width: 50px; height: 50px; background: white; padding: 2px; border-radius: 4px; margin-left: auto;">
            </div>
            <div style="position: absolute; bottom: 8px; right: 12px; font-size: 0.55rem; opacity: 0.8; text-align: right;">
                Official Barangay Issued Document
            </div>
        </div>
    </div>
    `;

    res.send(renderResidentLayout('Digital Resident ID', content, 'id', req.session.user));
});

// DEDICATED QR SCANNER PAGE
app.get('/scanner', requireAdmin, async (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>QR Verification & Service Terminal</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f8fafc; padding: 2rem; text-align: center; }
            .card { max-width: 500px; margin: 0 auto; background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
            input { width: 80%; padding: 0.75rem; font-size: 1rem; border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 1rem; }
            button { background: #059669; color: white; border: none; padding: 0.75rem 1.5rem; font-size: 1rem; border-radius: 6px; cursor: pointer; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>QR Verification Terminal</h2>
            <p>Scan resident QR token or manually input token key below:</p>
            <input type="text" id="token" placeholder="Paste or Scan Secure Token">
            <button onclick="verifyToken()">Verify Token</button>
            <div id="result" style="margin-top: 1.5rem; text-align: left;"></div>
        </div>
        <script>
            async function verifyToken() {
                const token = document.getElementById('token').value;
                const res = await fetch('/api/verify/' + token);
                const data = await res.json();
                const div = document.getElementById('result');
                if(data.success) {
                    div.innerHTML = \`<div style="padding:1rem; background:#d1fae5; color:#065f46; border-radius:6px;">
                        <h3>✓ VERIFIED RESIDENT</h3>
                        <p><strong>Name:</strong> \${data.resident.last_name}, \${data.resident.first_name}</p>
                        <p><strong>Resident ID:</strong> \${data.resident.resident_id_number}</p>
                        <p><strong>Status:</strong> \${data.resident.resident_status}</p>
                    </div>\`;
                } else {
                    div.innerHTML = \`<div style="padding:1rem; background:#fee2e2; color:#b91c1c; border-radius:6px;">INVALID TOKEN</div>\`;
                }
            }
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

app.get('/api/verify/:token', async (req, res) => {
    const { data: resident } = await supabase.from('residents').select('*').eq('qr_secure_token', req.params.token).single();
    if(resident) {
        res.json({ success: true, resident });
    } else {
        res.json({ success: false });
    }
});

// BULK PRINT 8 BARANGAY RESIDENT IDS ON ONE BOND PAPER SHEET
app.get('/admin/id-print', requireAdmin, async (req, res) => {
    const { data: residents } = await supabase.from('residents').select('*, puroks(name)').eq('resident_status', 'ACTIVE').limit(8);
    const settings = await getBarangaySettings();

    let cardsHtml = '';

    for (let r of (residents || [])) {
        const qrDataUrl = await QRCode.toDataURL(`${req.protocol}://${req.get('host')}/verify/resident/${r.qr_secure_token}`);
        cardsHtml += `
        <div class="id-card">
            <div class="id-header">
                <img src="${settings.logo_url || 'https://via.placeholder.com/30'}" class="logo">
                <div>
                    <div class="b-name">${settings.barangay_name}</div>
                    <div class="id-title">BARANGAY RESIDENT CARD</div>
                </div>
            </div>
            <div class="id-body">
                <img src="${r.photo_url || 'https://via.placeholder.com/60?text=Photo'}" class="photo">
                <div class="info">
                    <div class="name">${r.last_name}, ${r.first_name}</div>
                    <div><strong>ID:</strong> ${r.resident_id_number}</div>
                    <div><strong>DOB:</strong> ${r.date_of_birth}</div>
                    <div><strong>Purok:</strong> ${r.puroks ? r.puroks.name : 'N/A'}</div>
                </div>
                <img src="${qrDataUrl}" class="qr">
            </div>
        </div>
        `;
    }

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Print 8 Resident IDs - Letter / Bond Paper</title>
        <style>
            @page { size: letter; margin: 0.5in; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: white; }
            .print-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; width: 100%; max-width: 7.5in; margin: 0 auto; }
            .id-card { width: 3.4in; height: 2.1in; background: linear-gradient(135deg, #1e3a8a, #059669); color: white; border-radius: 8px; padding: 8px; box-sizing: border-box; position: relative; border: 1px solid #cbd5e1; }
            .id-header { display: flex; align-items: center; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.4); padding-bottom: 4px; }
            .logo { width: 28px; height: 28px; border-radius: 50%; background: white; }
            .b-name { font-size: 0.55rem; text-transform: uppercase; }
            .id-title { font-size: 0.7rem; font-weight: 800; }
            .id-body { display: flex; gap: 6px; margin-top: 6px; }
            .photo { width: 55px; height: 55px; object-fit: cover; border-radius: 4px; border: 1px solid white; }
            .info { font-size: 0.6rem; line-height: 1.2; }
            .name { font-size: 0.7rem; font-weight: bold; color: #fef08a; }
            .qr { width: 40px; height: 40px; background: white; padding: 2px; border-radius: 4px; margin-left: auto; }
            .btn-print { background: #1e3a8a; color: white; padding: 10px 20px; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; margin: 1rem; }
            @media print { .no-print { display: none; } }
        </style>
    </head>
    <body>
        <div class="no-print" style="text-align: center;">
            <button onclick="window.print()" class="btn-print">Print Sheet (8 IDs / Page)</button>
        </div>
        <div class="print-grid">
            ${cardsHtml}
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

// SYSTEM SETTINGS ROUTE
app.get('/admin/settings', requireAdmin, async (req, res) => {
    const settings = await getBarangaySettings();
    const content = `
    <div class="card">
        <div class="card-title">Barangay & System Configuration</div>
        <form id="settings-form">
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div><label>Barangay Name</label><input type="text" name="barangay_name" value="${settings.barangay_name}"></div>
                <div><label>Municipality/City</label><input type="text" name="municipality" value="${settings.municipality}"></div>
                <div><label>Province</label><input type="text" name="province" value="${settings.province}"></div>
                <div><label>System Name</label><input type="text" name="system_name" value="${settings.system_name}"></div>
            </div>
            <button type="submit" class="btn btn-success" style="margin-top:1rem;">Save Settings</button>
        </form>
    </div>
    <script>
        document.getElementById('settings-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            const res = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if(result.success) alert('Settings saved persistently!');
        });
    </script>
    `;
    res.send(renderAdminLayout('System Settings', content, 'settings', req.session.user));
});

app.post('/api/admin/settings', requireAdmin, async (req, res) => {
    try {
        const { barangay_name, municipality, province, system_name } = req.body;
        const { data: existing } = await supabase.from('barangay_settings').select('id').limit(1).single();

        if(existing) {
            await supabase.from('barangay_settings').update({ barangay_name, municipality, province, system_name }).eq('id', existing.id);
        } else {
            await supabase.from('barangay_settings').insert([{ barangay_name, municipality, province, system_name }]);
        }

        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// START EXPRESS ENGINE
app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` Barangay Management System active on port ${PORT}`);
    console.log(` Deployment ready for Render & Supabase Cloud Cluster`);
    console.log(`=======================================================`);
});
