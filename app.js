/**
 * =============================================================================
 * BARANGAY RESIDENT MANAGEMENT SYSTEM (BRMS)
 * Monolithic JavaScript Application
 * 
 * Tech Stack: Node.js, Express.js, Supabase, Native CSS/HTML Generation
 * Deployment: Render Compatible
 * =============================================================================
 */

require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');

// -----------------------------------------------------------------------------
// 1. SYSTEM CONFIGURATION & INITIALIZATION
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'barangay_secure_jwt_secret_key_2026_prod';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(fileUpload({ limits: { fileSize: 10 * 1024 * 1024 } }));

const DEFAULT_BG = 'https://scontent.fcrk3-3.fna.fbcdn.net/v/t39.30808-6/467984538_122130208178389200_2470999473131951042_n.jpg?stp=dst-jpg_tt6&cstp=mx1857x2048&ctp=s1857x2048&_nc_cat=107&ccb=1-7&_nc_sid=cc71e4&_nc_eui2=AeH-CrVk3UW0Tqq0z_SDhKwemnbseM68ydCadux4zrzJ0I4R6gykVtH1GEMMnjk_E0vUUupJBZ3vwMdzuIfYXMgZ&_nc_ohc=fKl5LR1-2YwQ7kNvwH7PIf8&_nc_oc=AdqAy1CtUXak56hu0R2Ufzy_6npapuoitUaMuup0g9veAD0bOy9PFjySTvVXJasGWis&_nc_zt=23&_nc_ht=scontent.fcrk3-3.fna&_nc_gid=SU-DBALnvlE-vtQ4KjJx4g&_nc_ss=7b2a8&oh=00_AQK7MxJys6gqu1LJrVhDYZ2WNBpKcThfTEtIUXEWUeB_Qw&oe=6ABBAEB1';

// -----------------------------------------------------------------------------
// 2. MIDDLEWARE & AUTHENTICATION
// -----------------------------------------------------------------------------
const authMiddleware = async (req, res, next) => {
    const token = req.cookies.auth_token;
    if (!token) {
        return res.redirect('/login');
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Retrieve fresh user profile
        const { data: user, error } = await supabase
            .from('users')
            .select('*, barangays(*)')
            .eq('id', decoded.id)
            .eq('is_active', true)
            .single();

        if (error || !user) {
            res.clearCookie('auth_token');
            return res.redirect('/login');
        }

        req.user = user;
        req.barangay = user.barangays;
        next();
    } catch (err) {
        res.clearCookie('auth_token');
        return res.redirect('/login');
    }
};

const roleGuard = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).send(generateErrorPage('403 Forbidden', 'You do not have administrative privilege to access this page.'));
        }
        next();
    };
};

const logActivity = async (barangayId, userId, action, description, ip) => {
    try {
        await supabase.from('activity_logs').insert([{
            barangay_id: barangayId,
            user_id: userId,
            action: action,
            description: description,
            ip_address: ip || '127.0.0.1'
        }]);
    } catch (e) {
        console.error('Activity Logging Error:', e.message);
    }
};

// -----------------------------------------------------------------------------
// 3. GLOBAL UI CSS THEME GENERATOR
// -----------------------------------------------------------------------------
function getGlobalStyles(primaryColor = '#1b5e20', secondaryColor = '#0d47a1') {
    return `
    <style>
        :root {
            --primary: ${primaryColor};
            --primary-dark: #0f3d13;
            --secondary: ${secondaryColor};
            --secondary-dark: #082a63;
            --bg-light: #f4f6f9;
            --text-dark: #2c3e50;
            --text-muted: #6c757d;
            --white: #ffffff;
            --border: #e2e8f0;
            --success: #2e7d32;
            --warning: #ed6c02;
            --danger: #d32f2f;
            --shadow: 0 4px 12px rgba(0,0,0,0.08);
            --radius: 8px;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background-color: var(--bg-light); color: var(--text-dark); display: flex; min-height: 100vh; flex-direction: column; }
        
        a { color: var(--secondary); text-decoration: none; }
        a:hover { text-decoration: underline; }

        /* Layout Structure */
        .app-container { display: flex; flex: 1; }
        .sidebar { width: 260px; background: var(--primary-dark); color: var(--white); display: flex; flex-direction: column; transition: all 0.3s; }
        .sidebar-header { padding: 20px; background: rgba(0,0,0,0.2); text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .sidebar-header img { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-bottom: 10px; border: 2px solid var(--white); }
        .sidebar-header h3 { font-size: 16px; font-weight: 600; }
        .sidebar-menu { list-style: none; padding: 15px 0; flex: 1; overflow-y: auto; }
        .sidebar-menu li a { display: flex; align-items: center; padding: 12px 20px; color: rgba(255,255,255,0.8); font-size: 14px; gap: 12px; transition: 0.2s; }
        .sidebar-menu li a:hover, .sidebar-menu li.active a { background: var(--secondary); color: var(--white); border-left: 4px solid #fff; }

        .main-wrapper { flex: 1; display: flex; flex-direction: column; overflow-x: hidden; }
        .top-navbar { height: 60px; background: var(--white); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 25px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
        .navbar-user { display: flex; align-items: center; gap: 15px; }
        .user-badge { background: #e8f5e9; color: var(--primary); padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; }

        .content-body { padding: 25px; flex: 1; }

        /* Dashboard UI Elements */
        .page-header { margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; }
        .page-title { font-size: 24px; color: var(--text-dark); font-weight: 700; }
        
        .grid-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 25px; }
        .card-stat { background: var(--white); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); border-left: 4px solid var(--primary); }
        .card-stat.blue { border-left-color: var(--secondary); }
        .card-stat.orange { border-left-color: var(--warning); }
        .card-stat.red { border-left-color: var(--danger); }
        .card-stat .title { font-size: 12px; color: var(--text-muted); text-transform: uppercase; font-weight: bold; }
        .card-stat .value { font-size: 28px; font-weight: bold; margin-top: 5px; color: var(--text-dark); }

        .panel { background: var(--white); border-radius: var(--radius); box-shadow: var(--shadow); margin-bottom: 25px; border: 1px solid var(--border); overflow: hidden; }
        .panel-header { padding: 15px 20px; background: #fafafa; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .panel-title { font-size: 16px; font-weight: 600; color: var(--text-dark); }
        .panel-body { padding: 20px; }

        /* Tables & Inputs */
        .table-responsive { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
        th { background: #f8fafc; padding: 12px 15px; color: var(--text-muted); font-weight: 600; border-bottom: 2px solid var(--border); }
        td { padding: 12px 15px; border-bottom: 1px solid var(--border); vertical-align: middle; }
        tr:hover { background-color: #f1f5f9; }

        .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
        .badge-success { background: #d4edda; color: #155724; }
        .badge-warning { background: #fff3cd; color: #856404; }
        .badge-danger { background: #f8d7da; color: #721c24; }
        .badge-info { background: #d1ecf1; color: #0c5460; }

        .btn { padding: 8px 16px; border-radius: 4px; border: none; cursor: pointer; font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; gap: 8px; transition: 0.2s; }
        .btn-primary { background: var(--primary); color: var(--white); }
        .btn-primary:hover { background: var(--primary-dark); }
        .btn-secondary { background: var(--secondary); color: var(--white); }
        .btn-secondary:hover { background: var(--secondary-dark); }
        .btn-danger { background: var(--danger); color: var(--white); }
        .btn-sm { padding: 4px 8px; font-size: 12px; }

        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; color: var(--text-dark); }
        .form-control { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 4px; font-size: 14px; outline: none; }
        .form-control:focus { border-color: var(--secondary); box-shadow: 0 0 0 2px rgba(13, 71, 161, 0.1); }

        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; }
        .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }

        /* Login Layout */
        .login-body { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: url('${DEFAULT_BG}') no-repeat center center/cover; position: relative; }
        .login-overlay { position: absolute; inset: 0; background: linear-gradient(135deg, rgba(27, 94, 32, 0.85), rgba(13, 71, 161, 0.85)); }
        .login-card { position: relative; z-index: 10; background: rgba(255,255,255,0.95); width: 100%; max-width: 440px; padding: 35px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); backdrop-filter: blur(5px); }
        .login-header { text-align: center; margin-bottom: 25px; }
        .login-header img { width: 80px; height: 80px; border-radius: 50%; margin-bottom: 10px; object-fit: cover; }

        /* Printable ID Card CSS Layout */
        @media print {
            body * { visibility: hidden; }
            .print-area, .print-area * { visibility: visible; }
            .print-area { position: absolute; left: 0; top: 0; width: 100%; }
            .no-print { display: none !important; }
        }

        /* 8 IDs Per Sheet Layout Grid */
        .id-sheet-grid {
            display: grid;
            grid-template-columns: repeat(2, 3.375in);
            gap: 0.2in 0.2in;
            justify-content: center;
            padding: 0.2in;
            background: white;
        }

        .id-card-frame {
            width: 3.375in;
            height: 2.125in;
            border: 1px dashed #999;
            border-radius: 8px;
            position: relative;
            background: #fff;
            box-sizing: border-box;
            overflow: hidden;
            padding: 8px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }

        .id-card-header {
            display: flex;
            align-items: center;
            gap: 6px;
            border-bottom: 2px solid var(--primary);
            padding-bottom: 4px;
        }

        .id-card-header img { width: 32px; height: 32px; border-radius: 50%; }
        .id-card-title { font-size: 8px; font-weight: bold; color: var(--primary-dark); text-transform: uppercase; line-height: 1; }
        .id-card-body { display: flex; gap: 8px; margin-top: 4px; }
        .id-card-photo { width: 65px; height: 65px; border-radius: 4px; object-fit: cover; border: 1px solid #ccc; }
        .id-card-details { font-size: 7.5px; flex: 1; line-height: 1.2; }
        .id-card-details strong { font-weight: bold; color: #000; }
        .id-card-footer { display: flex; justify-content: space-between; align-items: flex-end; font-size: 6px; border-top: 1px solid #ddd; padding-top: 2px; }

        @media (max-width: 768px) {
            .app-container { flex-direction: column; }
            .sidebar { width: 100%; }
            .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
        }
    </style>
    `;
}

// -----------------------------------------------------------------------------
// 4. HTML LAYOUT TEMPLATE WRAPPER
// -----------------------------------------------------------------------------
function renderShell(title, content, user, activePath, barangay) {
    const primary = barangay?.official_colors?.primary || '#1b5e20';
    const secondary = barangay?.official_colors?.secondary || '#0d47a1';
    const logo = barangay?.logo_url || 'https://via.placeholder.com/80?text=BRGY';
    const barangayName = barangay?.name ? `Brgy. ${barangay.name}` : 'Barangay System';

    const isStaff = ['SUPER_ADMIN', 'BARANGAY_ADMIN', 'BARANGAY_SECRETARY', 'STAFF'].includes(user?.role);

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - ${barangayName}</title>
        ${getGlobalStyles(primary, secondary)}
    </head>
    <body>
        <div class="app-container">
            <aside class="sidebar no-print">
                <div class="sidebar-header">
                    <img src="${logo}" alt="Logo">
                    <h3>${barangayName}</h3>
                    <small>${barangay?.municipality || 'Government System'}</small>
                </div>
                <ul class="sidebar-menu">
                    ${isStaff ? `
                        <li class="${activePath === '/dashboard' ? 'active' : ''}"><a href="/dashboard">📊 Staff Dashboard</a></li>
                        <li class="${activePath === '/residents' ? 'active' : ''}"><a href="/residents">👥 Residents Management</a></li>
                        <li class="${activePath === '/households' ? 'active' : ''}"><a href="/households">🏠 Household Directory</a></li>
                        <li class="${activePath === '/puroks' ? 'active' : ''}"><a href="/puroks">📍 Purok System</a></li>
                        <li class="${activePath === '/certificates' ? 'active' : ''}"><a href="/certificates">📜 Certificates System</a></li>
                        <li class="${activePath === '/appointments' ? 'active' : ''}"><a href="/appointments">📅 Appointments</a></li>
                        <li class="${activePath === '/blotter' ? 'active' : ''}"><a href="/blotter">⚖️ Blotter Cases</a></li>
                        <li class="${activePath === '/assistance' ? 'active' : ''}"><a href="/assistance">🤝 Assistance Records</a></li>
                        <li class="${activePath === '/businesses' ? 'active' : ''}"><a href="/businesses">💼 Business Registry</a></li>
                        <li class="${activePath === '/announcements' ? 'active' : ''}"><a href="/announcements">📢 Announcements</a></li>
                        <li class="${activePath === '/print-ids' ? 'active' : ''}"><a href="/print-ids">🪪 ID Print Center (8/Sheet)</a></li>
                        <li class="${activePath === '/reports' ? 'active' : ''}"><a href="/reports">📈 System Reports</a></li>
                        ${['SUPER_ADMIN', 'BARANGAY_ADMIN'].includes(user.role) ? `<li class="${activePath === '/settings' ? 'active' : ''}"><a href="/settings">⚙️ Barangay Settings</a></li>` : ''}
                    ` : `
                        <li class="${activePath === '/resident/portal' ? 'active' : ''}"><a href="/resident/portal">🏠 My Portal</a></li>
                        <li class="${activePath === '/resident/digital-id' ? 'active' : ''}"><a href="/resident/digital-id">🪪 My Digital ID</a></li>
                        <li class="${activePath === '/resident/certificates' ? 'active' : ''}"><a href="/resident/certificates">📜 Request Certificate</a></li>
                        <li class="${activePath === '/resident/appointments' ? 'active' : ''}"><a href="/resident/appointments">📅 Book Appointment</a></li>
                        <li class="${activePath === '/resident/assistance' ? 'active' : ''}"><a href="/resident/assistance">🤝 Assistance Program</a></li>
                    `}
                    <li><a href="/logout">🚪 Sign Out</a></li>
                </ul>
            </aside>
            <div class="main-wrapper">
                <header class="top-navbar no-print">
                    <div><strong>${title}</strong></div>
                    <div class="navbar-user">
                        <span class="user-badge">${user?.role?.replace('_', ' ')}</span>
                        <span>👋 ${user?.full_name}</span>
                    </div>
                </header>
                <main class="content-body">
                    ${content}
                </main>
            </div>
        </div>
    </body>
    </html>
    `;
}

function generateErrorPage(title, message) {
    return `
    <!DOCTYPE html>
    <html>
    <head><title>${title}</title>${getGlobalStyles()}</head>
    <body class="login-body">
        <div class="login-card" style="text-align:center;">
            <h1 style="color:var(--danger); font-size:48px;">⚠️</h1>
            <h2>${title}</h2>
            <p style="margin:15px 0; color:var(--text-muted);">${message}</p>
            <a href="/dashboard" class="btn btn-primary">Return to Safety</a>
        </div>
    </body>
    </html>
    `;
}

// -----------------------------------------------------------------------------
// 5. PUBLIC SYSTEM ROUTES (SETUP & LOGIN)
// -----------------------------------------------------------------------------

// System Setup Check Middleware
app.use(async (req, res, next) => {
    if (req.path === '/setup' || req.path.startsWith('/public')) return next();
    
    // Check if any barangay exists
    const { count, error } = await supabase.from('barangays').select('*', { count: 'exact', head: true });
    if (!error && count === 0 && req.path !== '/setup') {
        return res.redirect('/setup');
    }
    next();
});

// Setup Initial First Admin Page
app.get('/setup', async (req, res) => {
    const { count } = await supabase.from('barangays').select('*', { count: 'exact', head: true });
    if (count > 0) return res.redirect('/login');

    const html = `
    <!DOCTYPE html>
    <html>
    <head><title>First-Time Administrator Setup</title>${getGlobalStyles()}</head>
    <body class="login-body">
        <div class="login-overlay"></div>
        <div class="login-card" style="max-width: 600px;">
            <div class="login-header">
                <h2>🏛️ System Setup</h2>
                <p>Initialize First Barangay & Administrator Account</p>
            </div>
            <form action="/setup" method="POST" enctype="multipart/form-data">
                <h4 style="margin-bottom:10px; color:var(--primary);">1. Barangay Information</h4>
                <div class="grid-2">
                    <div class="form-group">
                        <label>Barangay Name</label>
                        <input type="text" name="barangay_name" class="form-control" placeholder="e.g. San Jose" required>
                    </div>
                    <div class="form-group">
                        <label>Municipality/City</label>
                        <input type="text" name="municipality" class="form-control" placeholder="e.g. Angeles City" required>
                    </div>
                </div>
                <div class="grid-2">
                    <div class="form-group">
                        <label>Province</label>
                        <input type="text" name="province" class="form-control" placeholder="e.g. Pampanga" required>
                    </div>
                    <div class="form-group">
                        <label>Barangay Logo (Image)</label>
                        <input type="file" name="logo" class="form-control" accept="image/*">
                    </div>
                </div>

                <h4 style="margin:15px 0 10px; color:var(--primary);">2. Super Admin Credentials</h4>
                <div class="form-group">
                    <label>Full Administrator Name</label>
                    <input type="text" name="full_name" class="form-control" placeholder="e.g. Chief Admin" required>
                </div>
                <div class="grid-2">
                    <div class="form-group">
                        <label>Username</label>
                        <input type="text" name="username" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>Email Address</label>
                        <input type="email" name="email" class="form-control" required>
                    </div>
                </div>
                <div class="grid-2">
                    <div class="form-group">
                        <label>Password</label>
                        <input type="password" name="password" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>Confirm Password</label>
                        <input type="password" name="confirm_password" class="form-control" required>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%; justify-content:center; margin-top:15px;">Complete System Initialization</button>
            </form>
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

app.post('/setup', async (req, res) => {
    try {
        const { barangay_name, municipality, province, full_name, username, email, password, confirm_password } = req.body;

        if (password !== confirm_password) {
            return res.send('<script>alert("Passwords do not match"); history.back();</script>');
        }

        let logo_url = 'https://via.placeholder.com/150?text=Barangay+Logo';

        if (req.files && req.files.logo) {
            const logoFile = req.files.logo;
            const fileName = `logo-${Date.now()}-${logoFile.name}`;
            const { data, error } = await supabase.storage.from('barangay-assets').upload(fileName, logoFile.data, {
                contentType: logoFile.mimetype
            });
            if (!error) {
                const { data: publicUrl } = supabase.storage.from('barangay-assets').getPublicUrl(fileName);
                logo_url = publicUrl.publicUrl;
            }
        }

        // Create Barangay
        const { data: barangay, error: bErr } = await supabase.from('barangays').insert([{
            name: barangay_name,
            municipality: municipality,
            province: province,
            logo_url: logo_url
        }]).select().single();

        if (bErr) throw bErr;

        // Hash password
        const password_hash = await bcrypt.hash(password, 10);

        // Create Admin User
        const { error: uErr } = await supabase.from('users').insert([{
            barangay_id: barangay.id,
            email: email,
            username: username,
            password_hash: password_hash,
            full_name: full_name,
            role: 'SUPER_ADMIN'
        }]);

        if (uErr) throw uErr;

        res.send('<script>alert("System Setup Complete! Please login."); window.location.href="/login";</script>');
    } catch (e) {
        res.status(500).send(generateErrorPage('Setup Error', e.message));
    }
});

// Login Page
app.get('/login', async (req, res) => {
    // Retrieve list of Barangays for drop down selection
    const { data: barangays } = await supabase.from('barangays').select('id, name, municipality, logo_url');

    const html = `
    <!DOCTYPE html>
    <html>
    <head><title>System Login - Barangay Resident Management System</title>${getGlobalStyles()}</head>
    <body class="login-body">
        <div class="login-overlay"></div>
        <div class="login-card">
            <div class="login-header">
                <img src="${barangays && barangays[0]?.logo_url ? barangays[0].logo_url : 'https://via.placeholder.com/80'}" alt="Barangay Logo">
                <h2>Barangay Portal</h2>
                <p>Resident & Administrative Management System</p>
            </div>
            <form action="/login" method="POST">
                <div class="form-group">
                    <label>Select Barangay</label>
                    <select name="barangay_id" class="form-control" required>
                        ${barangays?.map(b => `<option value="${b.id}">${b.name}, ${b.municipality}</option>`).join('') || '<option value="">No Barangays Found</option>'}
                    </select>
                </div>
                <div class="form-group">
                    <label>Username or Email</label>
                    <input type="text" name="login_id" class="form-control" required placeholder="Enter your credential">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" name="password" class="form-control" required placeholder="••••••••">
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%; justify-content:center;">Sign In to Portal</button>
            </form>
            <hr style="margin:20px 0; border:0; border-top:1px solid var(--border);">
            <div style="text-align:center; font-size:13px;">
                <p>Are you a local resident?</p>
                <a href="/register" style="font-weight:bold; color:var(--secondary);">Register for New Resident Account</a>
            </div>
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

app.post('/login', async (req, res) => {
    const { barangay_id, login_id, password } = req.body;

    const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('barangay_id', barangay_id)
        .or(`username.eq.${login_id},email.eq.${login_id}`)
        .single();

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.send('<script>alert("Invalid Username, Password, or Barangay Selection!"); history.back();</script>');
    }

    const token = jwt.sign({ id: user.id, role: user.role, barangay_id: user.barangay_id }, JWT_SECRET, { expiresIn: '1d' });
    res.cookie('auth_token', token, { httpOnly: true });

    await logActivity(user.barangay_id, user.id, 'LOGIN', `User ${user.username} logged in`, req.ip);

    if (user.role === 'RESIDENT') {
        res.redirect('/resident/portal');
    } else {
        res.redirect('/dashboard');
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('auth_token');
    res.redirect('/login');
});

// Resident Public Registration
app.get('/register', async (req, res) => {
    const { data: barangays } = await supabase.from('barangays').select('id, name, municipality');
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head><title>Resident Registration</title>${getGlobalStyles()}</head>
    <body class="login-body">
        <div class="login-overlay"></div>
        <div class="login-card" style="max-width:700px;">
            <div class="login-header">
                <h2>📝 Resident Online Registration</h2>
                <p>Submit application for Barangay Verification & Digital ID</p>
            </div>
            <form action="/register" method="POST" enctype="multipart/form-data">
                <div class="form-group">
                    <label>Select Barangay Jurisdiction</label>
                    <select name="barangay_id" class="form-control" required>
                        ${barangays?.map(b => `<option value="${b.id}">${b.name}, ${b.municipality}</option>`).join('')}
                    </select>
                </div>
                <div class="grid-3">
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
                </div>
                <div class="grid-3">
                    <div class="form-group">
                        <label>Date of Birth</label>
                        <input type="date" name="date_of_birth" class="form-control" required>
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
                        <select name="civil_status" class="form-control" required>
                            <option value="Single">Single</option>
                            <option value="Married">Married</option>
                            <option value="Widowed">Widowed</option>
                            <option value="Separated">Separated</option>
                        </select>
                    </div>
                </div>
                <div class="grid-2">
                    <div class="form-group">
                        <label>Contact Number</label>
                        <input type="text" name="contact_number" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>Email Address</label>
                        <input type="email" name="email" class="form-control" required>
                    </div>
                </div>
                <div class="form-group">
                    <label>Home Street Address</label>
                    <input type="text" name="address" class="form-control" required placeholder="House No., Street Name">
                </div>
                <div class="grid-2">
                    <div class="form-group">
                        <label>Upload Profile Photo (1x1 or 2x2)</label>
                        <input type="file" name="photo" class="form-control" accept="image/*" required>
                    </div>
                    <div class="form-group">
                        <label>Account Password</label>
                        <input type="password" name="password" class="form-control" required>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%; justify-content:center;">Submit Registration Application</button>
            </form>
            <div style="text-align:center; margin-top:15px;">
                <a href="/login">Already registered? Log in here</a>
            </div>
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

app.post('/register', async (req, res) => {
    try {
        const { barangay_id, first_name, middle_name, last_name, date_of_birth, gender, civil_status, contact_number, email, address, password } = req.body;

        let photo_url = 'https://via.placeholder.com/150';

        if (req.files && req.files.photo) {
            const file = req.files.photo;
            const fileName = `res-${Date.now()}-${file.name}`;
            const { data, error } = await supabase.storage.from('resident-documents').upload(fileName, file.data, {
                contentType: file.mimetype
            });
            if (!error) {
                const { data: publicUrl } = supabase.storage.from('resident-documents').getPublicUrl(fileName);
                photo_url = publicUrl.publicUrl;
            }
        }

        // Create Resident User Account
        const password_hash = await bcrypt.hash(password, 10);
        const username = `${first_name.toLowerCase()}.${last_name.toLowerCase()}${Math.floor(Math.random() * 8999 + 1000)}`;

        const { data: user, error: uErr } = await supabase.from('users').insert([{
            barangay_id: barangay_id,
            email: email,
            username: username,
            password_hash: password_hash,
            full_name: `${first_name} ${last_name}`,
            role: 'RESIDENT'
        }]).select().single();

        if (uErr) throw uErr;

        // Auto Generate Unique Resident ID Format
        const resIdNumber = `BRGY-${Math.floor(100000 + Math.random() * 900000)}`;

        // Create Resident Profile with PENDING status
        const { error: rErr } = await supabase.from('residents').insert([{
            barangay_id: barangay_id,
            user_id: user.id,
            resident_id_number: resIdNumber,
            first_name: first_name,
            middle_name: middle_name,
            last_name: last_name,
            date_of_birth: date_of_birth,
            gender: gender,
            civil_status: civil_status,
            contact_number: contact_number,
            email: email,
            address: address,
            profile_photo_url: photo_url,
            approval_status: 'PENDING'
        }]);

        if (rErr) throw rErr;

        res.send(`<script>alert("Registration Successful! Your username is: ${username}. Your registration is now pending review by Barangay Staff."); window.location.href="/login";</script>`);
    } catch (e) {
        res.status(500).send(generateErrorPage('Registration Error', e.message));
    }
});

// -----------------------------------------------------------------------------
// 6. PUBLIC QR VERIFICATION MODULE
// -----------------------------------------------------------------------------
app.get('/verify/resident/:token', async (req, res) => {
    const { token } = req.params;

    const { data: resident } = await supabase
        .from('residents')
        .select('*, barangays(*)')
        .eq('qr_verification_token', token)
        .single();

    if (!resident) {
        return res.status(404).send(generateErrorPage('Verification Failed', 'Invalid QR Verification Token or Resident Record Not Found.'));
    }

    const html = `
    <!DOCTYPE html>
    <html>
    <head><title>Resident Digital Identity Verification</title>${getGlobalStyles()}</head>
    <body class="login-body">
        <div class="login-card" style="max-width:500px; text-align:center;">
            <img src="${resident.barangays.logo_url}" style="width:70px; height:70px; border-radius:50%;" />
            <h3 style="margin-top:10px;">Barangay ${resident.barangays.name}</h3>
            <p style="color:var(--text-muted); font-size:12px;">Official Resident Identity Verification Portal</p>
            <hr style="margin:15px 0; border:0; border-top:1px solid var(--border);">
            
            <div style="background:#e8f5e9; padding:10px; border-radius:6px; color:#155724; font-weight:bold; margin-bottom:15px;">
                ✓ OFFICIAL VERIFIED RESIDENT
            </div>

            <img src="${resident.profile_photo_url}" style="width:100px; height:100px; border-radius:8px; object-fit:cover; margin-bottom:15px;" />

            <table style="text-align:left;">
                <tr><th>Full Name:</th><td>${resident.first_name} ${resident.middle_name || ''} ${resident.last_name}</td></tr>
                <tr><th>Resident ID:</th><td><strong>${resident.resident_id_number}</strong></td></tr>
                <tr><th>Gender / Status:</th><td>${resident.gender} / ${resident.civil_status}</td></tr>
                <tr><th>Address:</th><td>${resident.address}</td></tr>
                <tr><th>Status:</th><td><span class="badge badge-success">${resident.approval_status}</span></td></tr>
            </table>
            <p style="font-size:11px; color:var(--text-muted); margin-top:20px;">Verification Timestamp: ${new Date().toLocaleString()}</p>
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

// Certificate Claim Verification Scanner Endpoint
app.get('/verify/certificate/:token', authMiddleware, async (req, res) => {
    const { token } = req.params;

    const { data: cert } = await supabase
        .from('certificate_requests')
        .select('*, residents(*)')
        .eq('barangay_id', req.user.barangay_id)
        .eq('qr_code_token', token)
        .single();

    if (!cert) {
        return res.status(404).send(generateErrorPage('Certificate Verification', 'Certificate request token not found.'));
    }

    const html = `
    <div class="panel">
        <div class="panel-header">
            <span class="panel-title">Certificate Request Verification</span>
        </div>
        <div class="panel-body" style="text-align:center;">
            <h3>Request Number: ${cert.request_number}</h3>
            <p><strong>Resident Name:</strong> ${cert.residents.first_name} ${cert.residents.last_name}</p>
            <p><strong>Document Requested:</strong> ${cert.certificate_type}</p>
            <p><strong>Status:</strong> <span class="badge badge-info">${cert.status}</span></p>
            
            ${cert.status === 'READY_FOR_RELEASE' ? `
                <form action="/certificates/release/${cert.id}" method="POST" style="margin-top:20px;">
                    <button type="submit" class="btn btn-primary">Mark as RELEASED to Resident</button>
                </form>
            ` : `<p style="margin-top:15px; color:var(--text-muted);">This certificate is currently in ${cert.status} state.</p>`}
        </div>
    </div>
    `;
    res.send(renderShell('QR Verification', html, req.user, '/certificates', req.barangay));
});

// -----------------------------------------------------------------------------
// 7. STAFF DASHBOARD & SYSTEM MODULES
// -----------------------------------------------------------------------------
app.get('/dashboard', authMiddleware, roleGuard(['SUPER_ADMIN', 'BARANGAY_ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
    const barangayId = req.user.barangay_id;

    // Fetch Analytics Metrics in Parallel
    const [
        { count: totalResidents },
        { count: pendingResidents },
        { count: totalHouseholds },
        { count: maleCount },
        { count: femaleCount },
        { count: seniorCount },
        { count: pwdCount },
        { count: certPending }
    ] = await Promise.all([
        supabase.from('residents').select('*', { count: 'exact', head: true }).eq('barangay_id', barangayId).eq('approval_status', 'APPROVED'),
        supabase.from('residents').select('*', { count: 'exact', head: true }).eq('barangay_id', barangayId).eq('approval_status', 'PENDING'),
        supabase.from('households').select('*', { count: 'exact', head: true }).eq('barangay_id', barangayId),
        supabase.from('residents').select('*', { count: 'exact', head: true }).eq('barangay_id', barangayId).eq('gender', 'Male'),
        supabase.from('residents').select('*', { count: 'exact', head: true }).eq('barangay_id', barangayId).eq('gender', 'Female'),
        supabase.from('residents').select('*', { count: 'exact', head: true }).eq('barangay_id', barangayId).eq('is_senior_citizen', true),
        supabase.from('residents').select('*', { count: 'exact', head: true }).eq('barangay_id', barangayId).eq('is_pwd', true),
        supabase.from('certificate_requests').select('*', { count: 'exact', head: true }).eq('barangay_id', barangayId).eq('status', 'SUBMITTED')
    ]);

    const { data: recentLogs } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('barangay_id', barangayId)
        .order('created_at', { ascending: false })
        .limit(8);

    const html = `
    <div class="page-header">
        <div>
            <h1 class="page-title">Barangay Executive Dashboard</h1>
            <p style="color:var(--text-muted); font-size:13px;">Real-time overview & resident management statistics</p>
        </div>
    </div>

    <div class="grid-cards">
        <div class="card-stat">
            <div class="title">Total Approved Residents</div>
            <div class="value">${totalResidents || 0}</div>
        </div>
        <div class="card-stat orange">
            <div class="title">Pending Registration Verification</div>
            <div class="value">${pendingResidents || 0}</div>
        </div>
        <div class="card-stat blue">
            <div class="title">Registered Households</div>
            <div class="value">${totalHouseholds || 0}</div>
        </div>
        <div class="card-stat red">
            <div class="title">Pending Certificate Requests</div>
            <div class="value">${certPending || 0}</div>
        </div>
    </div>

    <div class="grid-cards">
        <div class="card-stat">
            <div class="title">Male Demographics</div>
            <div class="value">${maleCount || 0}</div>
        </div>
        <div class="card-stat">
            <div class="title">Female Demographics</div>
            <div class="value">${femaleCount || 0}</div>
        </div>
        <div class="card-stat">
            <div class="title">Senior Citizens</div>
            <div class="value">${seniorCount || 0}</div>
        </div>
        <div class="card-stat">
            <div class="title">Persons with Disability (PWD)</div>
            <div class="value">${pwdCount || 0}</div>
        </div>
    </div>

    <div class="panel">
        <div class="panel-header">
            <span class="panel-title">📋 Recent System Audit Logs</span>
        </div>
        <div class="panel-body">
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Action</th>
                            <th>Description</th>
                            <th>IP Address</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recentLogs?.map(log => `
                            <tr>
                                <td>${new Date(log.created_at).toLocaleString()}</td>
                                <td><span class="badge badge-info">${log.action}</span></td>
                                <td>${log.description}</td>
                                <td>${log.ip_address}</td>
                            </tr>
                        `).join('') || '<tr><td colspan="4">No recent activity logs recorded.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;

    res.send(renderShell('Dashboard', html, req.user, '/dashboard', req.barangay));
});

// -----------------------------------------------------------------------------
// 8. RESIDENT MANAGEMENT MODULE (FULL CRUD + APPROVAL WORKFLOW)
// -----------------------------------------------------------------------------
app.get('/residents', authMiddleware, roleGuard(['SUPER_ADMIN', 'BARANGAY_ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
    const barangayId = req.user.barangay_id;
    const search = req.query.search || '';
    const statusFilter = req.query.status || 'APPROVED';

    let query = supabase
        .from('residents')
        .select('*, puroks(name)')
        .eq('barangay_id', barangayId)
        .eq('approval_status', statusFilter);

    if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,resident_id_number.ilike.%${search}%`);
    }

    const { data: residents } = await query.order('registered_at', { ascending: false });

    const html = `
    <div class="page-header">
        <h1 class="page-title">Resident Directory</h1>
        <a href="/residents/new" class="btn btn-primary">+ Register New Resident</a>
    </div>

    <div class="panel">
        <div class="panel-header">
            <form style="display:flex; gap:10px; width:100%;" method="GET">
                <input type="text" name="search" class="form-control" placeholder="Search by name or Resident ID..." value="${search}">
                <select name="status" class="form-control" style="width:200px;" onchange="this.form.submit()">
                    <option value="APPROVED" ${statusFilter === 'APPROVED' ? 'selected' : ''}>Approved Residents</option>
                    <option value="PENDING" ${statusFilter === 'PENDING' ? 'selected' : ''}>Pending Verifications</option>
                    <option value="REJECTED" ${statusFilter === 'REJECTED' ? 'selected' : ''}>Rejected Applications</option>
                    <option value="ARCHIVED" ${statusFilter === 'ARCHIVED' ? 'selected' : ''}>Archived Records</option>
                </select>
                <button type="submit" class="btn btn-secondary">Search</button>
            </form>
        </div>
        <div class="panel-body">
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Photo</th>
                            <th>Resident ID</th>
                            <th>Full Name</th>
                            <th>Age / Sex</th>
                            <th>Purok</th>
                            <th>Special Categories</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${residents?.map(r => {
                            const age = Math.floor((new Date() - new Date(r.date_of_birth)) / 31557600000);
                            return `
                            <tr>
                                <td><img src="${r.profile_photo_url || 'https://via.placeholder.com/40'}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;"></td>
                                <td><strong>${r.resident_id_number}</strong></td>
                                <td>${r.first_name} ${r.middle_name || ''} ${r.last_name}</td>
                                <td>${age} yrs / ${r.gender}</td>
                                <td>${r.puroks?.name || 'Unassigned'}</td>
                                <td>
                                    ${r.is_senior_citizen ? '<span class="badge badge-info">Senior</span>' : ''}
                                    ${r.is_pwd ? '<span class="badge badge-warning">PWD</span>' : ''}
                                    ${r.is_voter ? '<span class="badge badge-success">Voter</span>' : ''}
                                </td>
                                <td><span class="badge ${r.approval_status === 'APPROVED' ? 'badge-success' : r.approval_status === 'PENDING' ? 'badge-warning' : 'badge-danger'}">${r.approval_status}</span></td>
                                <td>
                                    <div style="display:flex; gap:5px;">
                                        ${r.approval_status === 'PENDING' ? `
                                            <form action="/residents/approve/${r.id}" method="POST"><button class="btn btn-primary btn-sm">Approve</button></form>
                                            <form action="/residents/reject/${r.id}" method="POST"><button class="btn btn-danger btn-sm">Reject</button></form>
                                        ` : `
                                            <a href="/residents/edit/${r.id}" class="btn btn-secondary btn-sm">Edit</a>
                                            <form action="/residents/archive/${r.id}" method="POST"><button class="btn btn-danger btn-sm">Archive</button></form>
                                        `}
                                    </div>
                                </td>
                            </tr>
                            `;
                        }).join('') || '<tr><td colspan="8">No resident records match the selected filter.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;

    res.send(renderShell('Residents Management', html, req.user, '/residents', req.barangay));
});

// Register Resident Manual Form
app.get('/residents/new', authMiddleware, roleGuard(['SUPER_ADMIN', 'BARANGAY_ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
    const { data: puroks } = await supabase.from('puroks').select('*').eq('barangay_id', req.user.barangay_id);

    const html = `
    <div class="page-header">
        <h1 class="page-title">Manual Resident Registration</h1>
    </div>
    <div class="panel">
        <div class="panel-body">
            <form action="/residents/new" method="POST" enctype="multipart/form-data">
                <div class="grid-3">
                    <div class="form-group"><label>First Name</label><input type="text" name="first_name" class="form-control" required></div>
                    <div class="form-group"><label>Middle Name</label><input type="text" name="middle_name" class="form-control"></div>
                    <div class="form-group"><label>Last Name</label><input type="text" name="last_name" class="form-control" required></div>
                </div>
                <div class="grid-3">
                    <div class="form-group"><label>Date of Birth</label><input type="date" name="date_of_birth" class="form-control" required></div>
                    <div class="form-group"><label>Gender</label>
                        <select name="gender" class="form-control" required><option value="Male">Male</option><option value="Female">Female</option></select>
                    </div>
                    <div class="form-group"><label>Civil Status</label>
                        <select name="civil_status" class="form-control"><option value="Single">Single</option><option value="Married">Married</option><option value="Widowed">Widowed</option></select>
                    </div>
                </div>
                <div class="grid-2">
                    <div class="form-group"><label>Purok Location</label>
                        <select name="purok_id" class="form-control">
                            <option value="">-- Select Purok --</option>
                            ${puroks?.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group"><label>Street Address</label><input type="text" name="address" class="form-control" required></div>
                </div>
                <div class="grid-4" style="margin:15px 0;">
                    <label><input type="checkbox" name="is_voter" value="true"> Registered Voter</label>
                    <label><input type="checkbox" name="is_senior_citizen" value="true"> Senior Citizen</label>
                    <label><input type="checkbox" name="is_pwd" value="true"> Person with Disability (PWD)</label>
                    <label><input type="checkbox" name="is_solo_parent" value="true"> Solo Parent</label>
                </div>
                <div class="form-group"><label>Upload Profile Photo</label><input type="file" name="photo" class="form-control" accept="image/*"></div>
                <button type="submit" class="btn btn-primary">Save Resident Record</button>
            </form>
        </div>
    </div>
    `;
    res.send(renderShell('Add Resident', html, req.user, '/residents', req.barangay));
});

app.post('/residents/new', authMiddleware, roleGuard(['SUPER_ADMIN', 'BARANGAY_ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
    try {
        const barangayId = req.user.barangay_id;
        const body = req.body;

        let photo_url = 'https://via.placeholder.com/150';
        if (req.files && req.files.photo) {
            const file = req.files.photo;
            const fileName = `res-${Date.now()}-${file.name}`;
            await supabase.storage.from('resident-documents').upload(fileName, file.data, { contentType: file.mimetype });
            photo_url = supabase.storage.from('resident-documents').getPublicUrl(fileName).data.publicUrl;
        }

        const resIdNumber = `BRGY-${Math.floor(100000 + Math.random() * 900000)}`;

        await supabase.from('residents').insert([{
            barangay_id: barangayId,
            resident_id_number: resIdNumber,
            first_name: body.first_name,
            middle_name: body.middle_name,
            last_name: body.last_name,
            date_of_birth: body.date_of_birth,
            gender: body.gender,
            civil_status: body.civil_status,
            purok_id: body.purok_id || null,
            address: body.address,
            is_voter: body.is_voter === 'true',
            is_senior_citizen: body.is_senior_citizen === 'true',
            is_pwd: body.is_pwd === 'true',
            is_solo_parent: body.is_solo_parent === 'true',
            profile_photo_url: photo_url,
            approval_status: 'APPROVED',
            approved_at: new Date()
        }]);

        await logActivity(barangayId, req.user.id, 'ADD_RESIDENT', `Created resident record ${resIdNumber}`);
        res.redirect('/residents');
    } catch (e) {
        res.status(500).send(generateErrorPage('Insert Error', e.message));
    }
});

// Approve & Reject Endpoints
app.post('/residents/approve/:id', authMiddleware, roleGuard(['SUPER_ADMIN', 'BARANGAY_ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
    await supabase.from('residents').update({ approval_status: 'APPROVED', approved_at: new Date() }).eq('id', req.params.id);
    res.redirect('/residents');
});

app.post('/residents/reject/:id', authMiddleware, roleGuard(['SUPER_ADMIN', 'BARANGAY_ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
    await supabase.from('residents').update({ approval_status: 'REJECTED' }).eq('id', req.params.id);
    res.redirect('/residents');
});

app.post('/residents/archive/:id', authMiddleware, roleGuard(['SUPER_ADMIN', 'BARANGAY_ADMIN']), async (req, res) => {
    await supabase.from('residents').update({ approval_status: 'ARCHIVED' }).eq('id', req.params.id);
    res.redirect('/residents');
});

// -----------------------------------------------------------------------------
// 9. CERTIFICATE MANAGEMENT & FILE UPLOADS
// -----------------------------------------------------------------------------
app.get('/certificates', authMiddleware, roleGuard(['SUPER_ADMIN', 'BARANGAY_ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
    const barangayId = req.user.barangay_id;

    const { data: requests } = await supabase
        .from('certificate_requests')
        .select('*, residents(*)')
        .eq('barangay_id', barangayId)
        .order('requested_at', { ascending: false });

    const html = `
    <div class="page-header">
        <h1 class="page-title">Certificate Requests & Processing</h1>
    </div>

    <div class="panel">
        <div class="panel-body">
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Request #</th>
                            <th>Resident</th>
                            <th>Certificate Type</th>
                            <th>Purpose</th>
                            <th>Status</th>
                            <th>Attached Document</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${requests?.map(c => `
                            <tr>
                                <td><strong>${c.request_number}</strong></td>
                                <td>${c.residents?.first_name} ${c.residents?.last_name}</td>
                                <td>${c.certificate_type}</td>
                                <td>${c.purpose}</td>
                                <td><span class="badge badge-info">${c.status}</span></td>
                                <td>${c.attached_file_url ? `<a href="${c.attached_file_url}" target="_blank" class="btn btn-sm btn-secondary">View File</a>` : 'No file'}</td>
                                <td>
                                    <button class="btn btn-primary btn-sm" onclick="document.getElementById('modal-${c.id}').style.display='block'">Process Request</button>

                                    <!-- Processing Modal Dialog -->
                                    <div id="modal-${c.id}" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:100; align-items:center; justify-content:center;">
                                        <div style="background:#fff; padding:25px; border-radius:8px; width:450px; margin:100px auto;">
                                            <h3>Process Request #${c.request_number}</h3>
                                            <form action="/certificates/process/${c.id}" method="POST" enctype="multipart/form-data" style="margin-top:15px;">
                                                <div class="form-group">
                                                    <label>Update Status</label>
                                                    <select name="status" class="form-control">
                                                        <option value="PROCESSING">Processing</option>
                                                        <option value="READY_FOR_RELEASE">Ready for Release</option>
                                                        <option value="RELEASED">Released</option>
                                                        <option value="REJECTED">Rejected</option>
                                                    </select>
                                                </div>
                                                <div class="form-group">
                                                    <label>Upload Signed Certificate (PDF/Image)</label>
                                                    <input type="file" name="cert_file" class="form-control" accept=".pdf,image/*">
                                                </div>
                                                <div style="display:flex; justify-content:flex-end; gap:10px;">
                                                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-${c.id}').style.display='none'">Cancel</button>
                                                    <button type="submit" class="btn btn-primary">Save Changes</button>
                                                </div>
                                            </form>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        `).join('') || '<tr><td colspan="7">No certificate requests found.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;

    res.send(renderShell('Certificates', html, req.user, '/certificates', req.barangay));
});

app.post('/certificates/process/:id', authMiddleware, roleGuard(['SUPER_ADMIN', 'BARANGAY_ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
    try {
        const { status } = req.body;
        let updatePayload = { status: status, processed_at: new Date() };

        if (status === 'RELEASED') {
            updatePayload.released_at = new Date();
        }

        if (req.files && req.files.cert_file) {
            const file = req.files.cert_file;
            const fileName = `cert-${Date.now()}-${file.name}`;
            await supabase.storage.from('resident-documents').upload(fileName, file.data, { contentType: file.mimetype });
            updatePayload.attached_file_url = supabase.storage.from('resident-documents').getPublicUrl(fileName).data.publicUrl;
        }

        await supabase.from('certificate_requests').update(updatePayload).eq('id', req.params.id);
        res.redirect('/certificates');
    } catch (e) {
        res.status(500).send(generateErrorPage('Certificate Update Error', e.message));
    }
});

app.post('/certificates/release/:id', authMiddleware, async (req, res) => {
    await supabase.from('certificate_requests').update({ status: 'RELEASED', released_at: new Date() }).eq('id', req.params.id);
    res.redirect('/certificates');
});

// -----------------------------------------------------------------------------
// 10. PHYSICAL ID PRINTING CENTER (8 CARDS PER BOND SHEET)
// -----------------------------------------------------------------------------
app.get('/print-ids', authMiddleware, roleGuard(['SUPER_ADMIN', 'BARANGAY_ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
    const barangayId = req.user.barangay_id;

    // Fetch up to 8 approved residents for print batch layout preview
    const { data: residents } = await supabase
        .from('residents')
        .select('*, puroks(name)')
        .eq('barangay_id', barangayId)
        .eq('approval_status', 'APPROVED')
        .limit(8);

    // Pre-generate QR Data URIs for each resident ID card
    const cardsWithQR = await Promise.all((residents || []).map(async r => {
        const qrDataUrl = await QRCode.toDataURL(`${req.protocol}://${req.get('host')}/verify/resident/${r.qr_verification_token}`);
        return { ...r, qrCode: qrDataUrl };
    }));

    const html = `
    <div class="page-header no-print">
        <h1 class="page-title">🪪 Barangay ID Card Batch Printing (8 per Sheet)</h1>
        <button onclick="window.print()" class="btn btn-primary">🖨️ Print Sheet Now</button>
    </div>

    <div class="panel no-print">
        <div class="panel-body">
            <p style="font-size:13px; color:var(--text-muted);">
                This printing engine formats exactly 8 CR80 standard-sized Barangay Identification Cards onto an 8.5" x 11" Letter/Bond Paper grid with trim guides.
            </p>
        </div>
    </div>

    <div class="print-area">
        <div class="id-sheet-grid">
            ${cardsWithQR.map(r => `
                <div class="id-card-frame">
                    <div class="id-card-header">
                        <img src="${req.barangay.logo_url || 'https://via.placeholder.com/32'}" />
                        <div>
                            <div class="id-card-title">Barangay ${req.barangay.name}</div>
                            <div style="font-size:6px; color:#555;">${req.barangay.municipality},${req.barangay.province}</div>
                        </div>
                    </div>
                    <div class="id-card-body">
                        <img src="${r.profile_photo_url}" class="id-card-photo" />
                        <div class="id-card-details">
                            <div><strong>ID NO:</strong> ${r.resident_id_number}</div>
                            <div><strong>NAME:</strong> ${r.first_name}${r.last_name}</div>
                            <div><strong>DOB:</strong> ${r.date_of_birth}</div>
                            <div><strong>ADDRESS:</strong> ${r.address.substring(0,25)}...</div>
                            <div><strong>PUROK:</strong> ${r.puroks?.name || 'N/A'}</div>
                        </div>
                    </div>
                    <div class="id-card-footer">
                        <span>OFFICIAL BARANGAY IDENTIFICATION CARD</span>
                        <img src="${r.qrCode}" style="width:30px; height:30px;" />
                    </div>
                </div>
            `).join('')}
        </div>
    </div>
    `;

    res.send(renderShell('Print IDs', html, req.user, '/print-ids', req.barangay));
});

// -----------------------------------------------------------------------------
// 11. HOUSEHOLD & PUROK MANAGEMENT
// -----------------------------------------------------------------------------
app.get('/households', authMiddleware, roleGuard(['SUPER_ADMIN', 'BARANGAY_ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
    const barangayId = req.user.barangay_id;

    const { data: households } = await supabase
        .from('households')
        .select('*, puroks(name), residents!fk_household_head(first_name, last_name)')
        .eq('barangay_id', barangayId);

    const { data: puroks } = await supabase.from('puroks').select('*').eq('barangay_id', barangayId);

    const html = `
    <div class="page-header">
        <h1 class="page-title">Household Registry</h1>
        <button class="btn btn-primary" onclick="document.getElementById('add-hh-modal').style.display='block'">+ Create Household Record</button>
    </div>

    <div id="add-hh-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:100;">
        <div style="background:#fff; padding:25px; border-radius:8px; width:450px; margin:100px auto;">
            <h3>Create New Household</h3>
            <form action="/households/new" method="POST" style="margin-top:15px;">
                <div class="form-group">
                    <label>Household Number</label>
                    <input type="text" name="household_number" class="form-control" required placeholder="e.g. HH-2026-001">
                </div>
                <div class="form-group">
                    <label>Purok</label>
                    <select name="purok_id" class="form-control">
                        ${puroks?.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Address</label>
                    <input type="text" name="address" class="form-control" required>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('add-hh-modal').style.display='none'">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save Household</button>
                </div>
            </form>
        </div>
    </div>

    <div class="panel">
        <div class="panel-body">
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Household #</th>
                            <th>Purok</th>
                            <th>Address</th>
                            <th>Head of Household</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${households?.map(h => `
                            <tr>
                                <td><strong>${h.household_number}</strong></td>
                                <td>${h.puroks?.name || 'N/A'}</td>
                                <td>${h.address}</td>
                                <td>${h.residents ? `${h.residents.first_name} ${h.residents.last_name}` : 'Unassigned'}</td>
                            </tr>
                        `).join('') || '<tr><td colspan="4">No households registered.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;

    res.send(renderShell('Households', html, req.user, '/households', req.barangay));
});

app.post('/households/new', authMiddleware, roleGuard(['SUPER_ADMIN', 'BARANGAY_ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
    const { household_number, purok_id, address } = req.body;
    await supabase.from('households').insert([{
        barangay_id: req.user.barangay_id,
        household_number: household_number,
        purok_id: purok_id,
        address: address
    }]);
    res.redirect('/households');
});

app.get('/puroks', authMiddleware, roleGuard(['SUPER_ADMIN', 'BARANGAY_ADMIN', 'BARANGAY_SECRETARY', 'STAFF']), async (req, res) => {
    const barangayId = req.user.barangay_id;
    const { data: puroks } = await supabase.from('puroks').select('*').eq('barangay_id', barangayId);

    const html = `
    <div class="page-header">
        <h1 class="page-title">Purok Management</h1>
    </div>
    <div class="grid-2">
        <div class="panel">
            <div class="panel-header"><span class="panel-title">Add New Purok</span></div>
            <div class="panel-body">
                <form action="/puroks/new" method="POST">
                    <div class="form-group">
                        <label>Purok Name</label>
                        <input type="text" name="name" class="form-control" placeholder="e.g. Purok 1 - Sampaguita" required>
                    </div>
                    <div class="form-group">
                        <label>Description / Boundary</label>
                        <textarea name="description" class="form-control"></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary">Create Purok</button>
                </form>
            </div>
        </div>
        <div class="panel">
            <div class="panel-header"><span class="panel-title">Active Barangay Puroks</span></div>
            <div class="panel-body">
                <table>
                    <thead><tr><th>Name</th><th>Description</th></tr></thead>
                    <tbody>
                        ${puroks?.map(p => `<tr><td><strong>${p.name}</strong></td><td>${p.description || 'N/A'}</td></tr>`).join('') || '<tr><td colspan="2">No puroks defined.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;
    res.send(renderShell('Puroks', html, req.user, '/puroks', req.barangay));
});

app.post('/puroks/new', authMiddleware, async (req, res) => {
    await supabase.from('puroks').insert([{
        barangay_id: req.user.barangay_id,
        name: req.body.name,
        description: req.body.description
    }]);
    res.redirect('/puroks');
});

// -----------------------------------------------------------------------------
// 12. APPOINTMENTS, BLOTTER, ASSISTANCE, BUSINESSES, ANNOUNCEMENTS
// -----------------------------------------------------------------------------

// Appointments Module
app.get('/appointments', authMiddleware, async (req, res) => {
    const { data: list } = await supabase.from('appointments').select('*, residents(first_name, last_name)').eq('barangay_id', req.user.barangay_id);
    
    const html = `
    <div class="page-header"><h1 class="page-title">Resident Appointments Schedule</h1></div>
    <div class="panel"><div class="panel-body"><div class="table-responsive">
        <table>
            <thead><tr><th>Resident</th><th>Service</th><th>Date & Time</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
                ${list?.map(a => `
                    <tr>
                        <td>${a.residents?.first_name} ${a.residents?.last_name}</td>
                        <td>${a.service_type}</td>
                        <td>${a.appointment_date} @${a.appointment_time}</td>
                        <td><span class="badge badge-info">${a.status}</span></td>
                        <td>
                            <form action="/appointments/update/${a.id}" method="POST" style="display:inline;">
                                <input type="hidden" name="status" value="APPROVED">
                                <button class="btn btn-primary btn-sm">Approve</button>
                            </form>
                        </td>
                    </tr>
                `).join('') || '<tr><td colspan="5">No appointment schedules found.</td></tr>'}
            </tbody>
        </table>
    </div></div></div>
    `;
    res.send(renderShell('Appointments', html, req.user, '/appointments', req.barangay));
});

app.post('/appointments/update/:id', authMiddleware, async (req, res) => {
    await supabase.from('appointments').update({ status: req.body.status }).eq('id', req.params.id);
    res.redirect('/appointments');
});

// Blotter Management
app.get('/blotter', authMiddleware, async (req, res) => {
    const { data: cases } = await supabase.from('blotter_cases').select('*').eq('barangay_id', req.user.barangay_id);

    const html = `
    <div class="page-header">
        <h1 class="page-title">Barangay Blotter Records</h1>
        <button class="btn btn-primary" onclick="document.getElementById('blotter-modal').style.display='block'">+ Record Incident / Case</button>
    </div>

    <div id="blotter-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:100;">
        <div style="background:#fff; padding:25px; border-radius:8px; width:500px; margin:50px auto;">
            <h3>Record New Case</h3>
            <form action="/blotter/new" method="POST" style="margin-top:15px;">
                <div class="form-group"><label>Complainant Name</label><input type="text" name="complainant_name" class="form-control" required></div>
                <div class="form-group"><label>Respondent Name</label><input type="text" name="respondent_name" class="form-control" required></div>
                <div class="grid-2">
                    <div class="form-group"><label>Incident Date</label><input type="date" name="incident_date" class="form-control" required></div>
                    <div class="form-group"><label>Location</label><input type="text" name="location" class="form-control" required></div>
                </div>
                <div class="form-group"><label>Narrative Description</label><textarea name="description" class="form-control" required></textarea></div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('blotter-modal').style.display='none'">Cancel</button>
                    <button type="submit" class="btn btn-primary">File Blotter Case</button>
                </div>
            </form>
        </div>
    </div>

    <div class="panel"><div class="panel-body"><div class="table-responsive">
        <table>
            <thead><tr><th>Case #</th><th>Complainant</th><th>Respondent</th><th>Incident Date</th><th>Status</th></tr></thead>
            <tbody>
                ${cases?.map(c => `
                    <tr>
                        <td><strong>${c.case_number}</strong></td>
                        <td>${c.complainant_name}</td>
                        <td>${c.respondent_name}</td>
                        <td>${c.incident_date}</td>
                        <td><span class="badge badge-warning">${c.case_status}</span></td>
                    </tr>
                `).join('') || '<tr><td colspan="5">No blotter records filed.</td></tr>'}
            </tbody>
        </table>
    </div></div></div>
    `;
    res.send(renderShell('Blotter System', html, req.user, '/blotter', req.barangay));
});

app.post('/blotter/new', authMiddleware, async (req, res) => {
    const caseNum = `BLT-${Date.now().toString().slice(-6)}`;
    await supabase.from('blotter_cases').insert([{
        barangay_id: req.user.barangay_id,
        case_number: caseNum,
        complainant_name: req.body.complainant_name,
        respondent_name: req.body.respondent_name,
        incident_date: req.body.incident_date,
        location: req.body.location,
        description: req.body.description,
        case_status: 'OPEN'
    }]);
    res.redirect('/blotter');
});

// Assistance Records
app.get('/assistance', authMiddleware, async (req, res) => {
    const { data: list } = await supabase.from('assistance_requests').select('*, residents(first_name, last_name)').eq('barangay_id', req.user.barangay_id);

    const html = `
    <div class="page-header"><h1 class="page-title">Financial & Social Assistance Directory</h1></div>
    <div class="panel"><div class="panel-body"><div class="table-responsive">
        <table>
            <thead><tr><th>Resident</th><th>Type</th><th>Reason</th><th>Requested Amount</th><th>Status</th></tr></thead>
            <tbody>
                ${list?.map(a => `
                    <tr>
                        <td>${a.residents?.first_name} ${a.residents?.last_name}</td>
                        <td>${a.assistance_type}</td>
                        <td>${a.reason}</td>
                        <td>₱${a.amount_requested || '0.00'}</td>
                        <td><span class="badge badge-info">${a.status}</span></td>
                    </tr>
                `).join('') || '<tr><td colspan="5">No assistance records on file.</td></tr>'}
            </tbody>
        </table>
    </div></div></div>
    `;
    res.send(renderShell('Assistance', html, req.user, '/assistance', req.barangay));
});

// Business Registry
app.get('/businesses', authMiddleware, async (req, res) => {
    const { data: list } = await supabase.from('businesses').select('*').eq('barangay_id', req.user.barangay_id);

    const html = `
    <div class="page-header">
        <h1 class="page-title">Barangay Commercial & Business Permits</h1>
        <button class="btn btn-primary" onclick="document.getElementById('biz-modal').style.display='block'">+ Register Business</button>
    </div>

    <div id="biz-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:100;">
        <div style="background:#fff; padding:25px; border-radius:8px; width:450px; margin:100px auto;">
            <h3>Register New Enterprise</h3>
            <form action="/businesses/new" method="POST" style="margin-top:15px;">
                <div class="form-group"><label>Business Name</label><input type="text" name="business_name" class="form-control" required></div>
                <div class="form-group"><label>Owner Name</label><input type="text" name="owner_name" class="form-control" required></div>
                <div class="form-group"><label>Business Type</label><input type="text" name="business_type" class="form-control" placeholder="e.g. Sari-Sari Store" required></div>
                <div class="form-group"><label>Address</label><input type="text" name="address" class="form-control" required></div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('biz-modal').style.display='none'">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save Business</button>
                </div>
            </form>
        </div>
    </div>

    <div class="panel"><div class="panel-body"><div class="table-responsive">
        <table>
            <thead><tr><th>Business Name</th><th>Owner</th><th>Type</th><th>Address</th><th>Permit Status</th></tr></thead>
            <tbody>
                ${list?.map(b => `
                    <tr>
                        <td><strong>${b.business_name}</strong></td>
                        <td>${b.owner_name}</td>
                        <td>${b.business_type}</td>
                        <td>${b.address}</td>
                        <td><span class="badge badge-success">${b.permit_status}</span></td>
                    </tr>
                `).join('') || '<tr><td colspan="5">No business permits issued.</td></tr>'}
            </tbody>
        </table>
    </div></div></div>
    `;
    res.send(renderShell('Businesses', html, req.user, '/businesses', req.barangay));
});

app.post('/businesses/new', authMiddleware, async (req, res) => {
    await supabase.from('businesses').insert([{
        barangay_id: req.user.barangay_id,
        business_name: req.body.business_name,
        owner_name: req.body.owner_name,
        business_type: req.body.business_type,
        address: req.body.address,
        permit_status: 'ACTIVE'
    }]);
    res.redirect('/businesses');
});

// Announcements Module
app.get('/announcements', authMiddleware, async (req, res) => {
    const { data: list } = await supabase.from('announcements').select('*').eq('barangay_id', req.user.barangay_id).order('created_at', { ascending: false });

    const html = `
    <div class="page-header">
        <h1 class="page-title">Public Bulletin & Announcements</h1>
        <button class="btn btn-primary" onclick="document.getElementById('anc-modal').style.display='block'">+ Create Announcement</button>
    </div>

    <div id="anc-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:100;">
        <div style="background:#fff; padding:25px; border-radius:8px; width:500px; margin:50px auto;">
            <h3>Post Public Announcement</h3>
            <form action="/announcements/new" method="POST" style="margin-top:15px;">
                <div class="form-group"><label>Title</label><input type="text" name="title" class="form-control" required></div>
                <div class="grid-2">
                    <div class="form-group"><label>Category</label>
                        <select name="category" class="form-control">
                            <option value="General">General</option>
                            <option value="Event">Event</option>
                            <option value="Emergency Notice">Emergency Notice</option>
                        </select>
                    </div>
                    <div class="form-group"><label>Priority Level</label>
                        <select name="priority" class="form-control">
                            <option value="Normal">Normal</option>
                            <option value="High">High</option>
                            <option value="Urgent">Urgent</option>
                        </select>
                    </div>
                </div>
                <div class="form-group"><label>Content Body</label><textarea name="content" class="form-control" style="height:100px;" required></textarea></div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('anc-modal').style.display='none'">Cancel</button>
                    <button type="submit" class="btn btn-primary">Broadcast Announcement</button>
                </div>
            </form>
        </div>
    </div>

    <div class="grid-2">
        ${list?.map(a => `
            <div class="panel">
                <div class="panel-header">
                    <span class="panel-title">${a.title}</span>
                    <span class="badge ${a.priority === 'Urgent' ? 'badge-danger' : 'badge-info'}">${a.category}</span>
                </div>
                <div class="panel-body">
                    <p>${a.content}</p>
                    <small style="color:var(--text-muted); display:block; margin-top:10px;">Posted on: ${new Date(a.created_at).toLocaleString()}</small>
                </div>
            </div>
        `).join('') || '<p>No public announcements broadcasted.</p>'}
    </div>
    `;
    res.send(renderShell('Announcements', html, req.user, '/announcements', req.barangay));
});

app.post('/announcements/new', authMiddleware, async (req, res) => {
    await supabase.from('announcements').insert([{
        barangay_id: req.user.barangay_id,
        title: req.body.title,
        category: req.body.category,
        priority: req.body.priority,
        content: req.body.content,
        created_by: req.user.id
    }]);
    res.redirect('/announcements');
});

// -----------------------------------------------------------------------------
// 13. SYSTEM REPORTS MODULE
// -----------------------------------------------------------------------------
app.get('/reports', authMiddleware, roleGuard(['SUPER_ADMIN', 'BARANGAY_ADMIN', 'BARANGAY_SECRETARY']), async (req, res) => {
    const barangayId = req.user.barangay_id;

    const [
        { count: totalRes },
        { count: seniorRes },
        { count: pwdRes },
        { count: voterRes },
        { count: certCount }
    ] = await Promise.all([
        supabase.from('residents').select('*', { count: 'exact', head: true }).eq('barangay_id', barangayId).eq('approval_status', 'APPROVED'),
        supabase.from('residents').select('*', { count: 'exact', head: true }).eq('barangay_id', barangayId).eq('is_senior_citizen', true),
        supabase.from('residents').select('*', { count: 'exact', head: true }).eq('barangay_id', barangayId).eq('is_pwd', true),
        supabase.from('residents').select('*', { count: 'exact', head: true }).eq('barangay_id', barangayId).eq('is_voter', true),
        supabase.from('certificate_requests').select('*', { count: 'exact', head: true }).eq('barangay_id', barangayId)
    ]);

    const html = `
    <div class="page-header no-print">
        <h1 class="page-title">Executive Demographic Reports</h1>
        <button onclick="window.print()" class="btn btn-primary">🖨️ Print Summary</button>
    </div>

    <div class="panel print-area">
        <div class="panel-header"><span class="panel-title">Barangay Demographic Summary Breakdown</span></div>
        <div class="panel-body">
            <table>
                <thead>
                    <tr><th>Demographic Metric Category</th><th>Total Count</th><th>Percentage of Population</th></tr>
                </thead>
                <tbody>
                    <tr><td>Total Population (Approved Residents)</td><td><strong>${totalRes}</strong></td><td>100%</td></tr>
                    <tr><td>Senior Citizens (60+)</td><td>${seniorRes}</td><td>${totalRes ? ((seniorRes/totalRes)*100).toFixed(1) : 0}%</td></tr>
                    <tr><td>Persons with Disabilities (PWD)</td><td>${pwdRes}</td><td>${totalRes ? ((pwdRes/totalRes)*100).toFixed(1) : 0}%</td></tr>
                    <tr><td>Registered Voters</td><td>${voterRes}</td><td>${totalRes ? ((voterRes/totalRes)*100).toFixed(1) : 0}%</td></tr>
                    <tr><td>Total Certificates Processed</td><td>${certCount}</td><td>N/A</td></tr>
                </tbody>
            </table>
        </div>
    </div>
    `;
    res.send(renderShell('Reports', html, req.user, '/reports', req.barangay));
});

// -----------------------------------------------------------------------------
// 14. ADMIN BARANGAY SETTINGS & CUSTOMIZATION
// -----------------------------------------------------------------------------
app.get('/settings', authMiddleware, roleGuard(['SUPER_ADMIN', 'BARANGAY_ADMIN']), async (req, res) => {
    const barangay = req.barangay;

    const html = `
    <div class="page-header"><h1 class="page-title">Barangay Administration Settings</h1></div>

    <div class="panel">
        <div class="panel-header"><span class="panel-title">Customization & Official Details</span></div>
        <div class="panel-body">
            <form action="/settings" method="POST" enctype="multipart/form-data">
                <div class="grid-3">
                    <div class="form-group">
                        <label>Barangay Name</label>
                        <input type="text" name="name" class="form-control" value="${barangay.name}" required>
                    </div>
                    <div class="form-group">
                        <label>Municipality/City</label>
                        <input type="text" name="municipality" class="form-control" value="${barangay.municipality}" required>
                    </div>
                    <div class="form-group">
                        <label>Province</label>
                        <input type="text" name="province" class="form-control" value="${barangay.province}" required>
                    </div>
                </div>
                <div class="grid-2">
                    <div class="form-group">
                        <label>Contact Number</label>
                        <input type="text" name="contact_number" class="form-control" value="${barangay.contact_number || ''}">
                    </div>
                    <div class="form-group">
                        <label>Email Address</label>
                        <input type="email" name="email" class="form-control" value="${barangay.email || ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Update Barangay Official Logo</label>
                    <input type="file" name="logo" class="form-control" accept="image/*">
                </div>
                <button type="submit" class="btn btn-primary">Save Settings Updates</button>
            </form>
        </div>
    </div>
    `;
    res.send(renderShell('Settings', html, req.user, '/settings', req.barangay));
});

app.post('/settings', authMiddleware, roleGuard(['SUPER_ADMIN', 'BARANGAY_ADMIN']), async (req, res) => {
    try {
        const barangayId = req.user.barangay_id;
        const { name, municipality, province, contact_number, email } = req.body;

        let updateData = { name, municipality, province, contact_number, email };

        if (req.files && req.files.logo) {
            const logoFile = req.files.logo;
            const fileName = `logo-${Date.now()}-${logoFile.name}`;
            await supabase.storage.from('barangay-assets').upload(fileName, logoFile.data, { contentType: logoFile.mimetype });
            updateData.logo_url = supabase.storage.from('barangay-assets').getPublicUrl(fileName).data.publicUrl;
        }

        await supabase.from('barangays').update(updateData).eq('id', barangayId);
        res.redirect('/settings');
    } catch (e) {
        res.status(500).send(generateErrorPage('Settings Error', e.message));
    }
});

// -----------------------------------------------------------------------------
// 15. RESIDENT PORTAL & SELF-SERVICE SUITE
// -----------------------------------------------------------------------------
app.get('/resident/portal', authMiddleware, async (req, res) => {
    const barangayId = req.user.barangay_id;

    // Fetch Resident details
    const { data: resident } = await supabase
        .from('residents')
        .select('*, households(household_number), puroks(name)')
        .eq('user_id', req.user.id)
        .single();

    const { data: announcements } = await supabase
        .from('announcements')
        .select('*')
        .eq('barangay_id', barangayId)
        .order('created_at', { ascending: false })
        .limit(3);

    const { data: myCerts } = await supabase
        .from('certificate_requests')
        .select('*')
        .eq('resident_id', resident?.id || '00000000-0000-0000-0000-000000000000');

    const html = `
    <div class="page-header">
        <h1 class="page-title">Welcome, ${req.user.full_name}!</h1>
    </div>

    ${resident?.approval_status === 'PENDING' ? `
        <div style="background:#fff3cd; color:#856404; padding:15px; border-radius:8px; margin-bottom:20px; border-left:4px solid #ffc107;">
            ⚠️ <strong>Verification Pending:</strong> Your account registration is currently under review by Barangay Staff. Your Digital ID and certificate requests will be fully activated upon verification.
        </div>
    ` : ''}

    <div class="grid-cards">
        <div class="card-stat">
            <div class="title">My Resident ID</div>
            <div class="value" style="font-size:20px;">${resident?.resident_id_number || 'PENDING'}</div>
        </div>
        <div class="card-stat blue">
            <div class="title">Assigned Household #</div>
            <div class="value" style="font-size:20px;">${resident?.households?.household_number || 'Unassigned'}</div>
        </div>
        <div class="card-stat orange">
            <div class="title">Active Certificate Requests</div>
            <div class="value">${myCerts?.length || 0}</div>
        </div>
    </div>

    <div class="panel">
        <div class="panel-header"><span class="panel-title">📢 Latest Barangay Announcements</span></div>
        <div class="panel-body">
            ${announcements?.map(a => `
                <div style="margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
                    <h4 style="color:var(--primary);">${a.title}</h4>
                    <p style="font-size:14px; margin-top:5px;">${a.content}</p>
                    <small style="color:var(--text-muted);">${new Date(a.created_at).toLocaleDateString()}</small>
                </div>
            `).join('') || '<p>No current announcements.</p>'}
        </div>
    </div>
    `;

    res.send(renderShell('Resident Portal', html, req.user, '/resident/portal', req.barangay));
});

// Digital ID Display Page
app.get('/resident/digital-id', authMiddleware, async (req, res) => {
    const { data: resident } = await supabase
        .from('residents')
        .select('*, puroks(name)')
        .eq('user_id', req.user.id)
        .single();

    if (!resident || resident.approval_status !== 'APPROVED') {
        return res.send(renderShell('Digital ID', '<div class="panel"><div class="panel-body">Your Digital ID will be issued once your account is verified.</div></div>', req.user, '/resident/digital-id', req.barangay));
    }

    const qrDataUrl = await QRCode.toDataURL(`${req.protocol}://${req.get('host')}/verify/resident/${resident.qr_verification_token}`);

    const html = `
    <div class="page-header">
        <h1 class="page-title">Official Digital Barangay ID Card</h1>
        <button onclick="window.print()" class="btn btn-primary no-print">🖨️ Print Digital ID</button>
    </div>

    <div class="print-area" style="display:flex; justify-content:center;">
        <div class="id-card-frame" style="width:380px; height:240px; padding:15px;">
            <div class="id-card-header">
                <img src="${req.barangay.logo_url}" />
                <div>
                    <div class="id-card-title" style="font-size:12px;">Barangay ${req.barangay.name}</div>
                    <div style="font-size:9px; color:#555;">${req.barangay.municipality}, ${req.barangay.province}</div>
                </div>
            </div>
            <div class="id-card-body" style="margin-top:10px;">
                <img src="${resident.profile_photo_url}" class="id-card-photo" style="width:85px; height:85px;" />
                <div class="id-card-details" style="font-size:10px; line-height:1.4;">
                    <div><strong>ID NO:</strong> ${resident.resident_id_number}</div>
                    <div><strong>NAME:</strong> ${resident.first_name} ${resident.middle_name || ''} ${resident.last_name}</div>
                    <div><strong>DOB:</strong> ${resident.date_of_birth}</div>
                    <div><strong>GENDER:</strong> ${resident.gender}</div>
                    <div><strong>PUROK:</strong> ${resident.puroks?.name || 'N/A'}</div>
                </div>
            </div>
            <div class="id-card-footer" style="font-size:8px;">
                <span>VERIFIED DIGITAL RESIDENT IDENTIFICATION</span>
                <img src="${qrDataUrl}" style="width:40px; height:40px;" />
            </div>
        </div>
    </div>
    `;

    res.send(renderShell('Digital ID', html, req.user, '/resident/digital-id', req.barangay));
});

// Resident Request Certificate
app.get('/resident/certificates', authMiddleware, async (req, res) => {
    const { data: resident } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
    const { data: myRequests } = await supabase.from('certificate_requests').select('*').eq('resident_id', resident?.id || '00000000-0000-0000-0000-000000000000');

    const html = `
    <div class="page-header"><h1 class="page-title">Request Barangay Clearance / Certificate</h1></div>

    <div class="grid-2">
        <div class="panel">
            <div class="panel-header"><span class="panel-title">New Certificate Request</span></div>
            <div class="panel-body">
                <form action="/resident/certificates/new" method="POST">
                    <div class="form-group">
                        <label>Certificate Type</label>
                        <select name="certificate_type" class="form-control" required>
                            <option value="Barangay Clearance">Barangay Clearance</option>
                            <option value="Certificate of Residency">Certificate of Residency</option>
                            <option value="Certificate of Indigency">Certificate of Indigency</option>
                            <option value="Certificate of Good Moral">Certificate of Good Moral</option>
                            <option value="Certificate of Solo Parent">Certificate of Solo Parent</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Purpose of Request</label>
                        <textarea name="purpose" class="form-control" placeholder="e.g. Employment / Local Application" required></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary">Submit Document Request</button>
                </form>
            </div>
        </div>

        <div class="panel">
            <div class="panel-header"><span class="panel-title">Request History & Tracking</span></div>
            <div class="panel-body">
                <table>
                    <thead><tr><th>Request #</th><th>Type</th><th>Status</th><th>Download Document</th></tr></thead>
                    <tbody>
                        ${myRequests?.map(r => `
                            <tr>
                                <td><strong>${r.request_number}</strong></td>
                                <td>${r.certificate_type}</td>
                                <td><span class="badge badge-info">${r.status}</span></td>
                                <td>${r.attached_file_url ? `<a href="${r.attached_file_url}" target="_blank" class="btn btn-sm btn-secondary">Get File</a>` : 'Processing'}</td>
                            </tr>
                        `).join('') || '<tr><td colspan="4">No requests submitted.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;

    res.send(renderShell('Certificates', html, req.user, '/resident/certificates', req.barangay));
});

app.post('/resident/certificates/new', authMiddleware, async (req, res) => {
    const { data: resident } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
    const reqNumber = `REQ-${Date.now().toString().slice(-6)}`;

    await supabase.from('certificate_requests').insert([{
        barangay_id: req.user.barangay_id,
        resident_id: resident.id,
        request_number: reqNumber,
        certificate_type: req.body.certificate_type,
        purpose: req.body.purpose,
        status: 'SUBMITTED'
    }]);

    res.redirect('/resident/certificates');
});

// Resident Book Appointments & Assistance
app.get('/resident/appointments', authMiddleware, async (req, res) => {
    const html = `
    <div class="page-header"><h1 class="page-title">Book Desk Appointment</h1></div>
    <div class="panel" style="max-width:600px;">
        <div class="panel-body">
            <form action="/resident/appointments/new" method="POST">
                <div class="form-group">
                    <label>Service Type</label>
                    <input type="text" name="service_type" class="form-control" placeholder="e.g. Lupon Hearing, Inquiries" required>
                </div>
                <div class="grid-2">
                    <div class="form-group"><label>Appointment Date</label><input type="date" name="appointment_date" class="form-control" required></div>
                    <div class="form-group"><label>Preferred Time</label><input type="time" name="appointment_time" class="form-control" required></div>
                </div>
                <div class="form-group"><label>Purpose Notes</label><textarea name="purpose" class="form-control" required></textarea></div>
                <button type="submit" class="btn btn-primary">Book Appointment</button>
            </form>
        </div>
    </div>
    `;
    res.send(renderShell('Book Appointment', html, req.user, '/resident/appointments', req.barangay));
});

app.post('/resident/appointments/new', authMiddleware, async (req, res) => {
    const { data: resident } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
    await supabase.from('appointments').insert([{
        barangay_id: req.user.barangay_id,
        resident_id: resident.id,
        service_type: req.body.service_type,
        appointment_date: req.body.appointment_date,
        appointment_time: req.body.appointment_time,
        purpose: req.body.purpose,
        status: 'PENDING'
    }]);
    res.redirect('/resident/portal');
});

app.get('/resident/assistance', authMiddleware, async (req, res) => {
    const html = `
    <div class="page-header"><h1 class="page-title">Apply for Social / Financial Assistance</h1></div>
    <div class="panel" style="max-width:600px;">
        <div class="panel-body">
            <form action="/resident/assistance/new" method="POST">
                <div class="form-group">
                    <label>Type of Assistance Requested</label>
                    <select name="assistance_type" class="form-control">
                        <option value="Financial Assistance">Financial Assistance</option>
                        <option value="Medical Assistance">Medical Assistance</option>
                        <option value="Educational Assistance">Educational Assistance</option>
                        <option value="Emergency Food Assistance">Emergency Food Assistance</option>
                    </select>
                </div>
                <div class="form-group"><label>Amount Requested (if applicable)</label><input type="number" name="amount_requested" class="form-control"></div>
                <div class="form-group"><label>Detailed Reason</label><textarea name="reason" class="form-control" required></textarea></div>
                <button type="submit" class="btn btn-primary">Submit Assistance Claim</button>
            </form>
        </div>
    </div>
    `;
    res.send(renderShell('Assistance Program', html, req.user, '/resident/assistance', req.barangay));
});

app.post('/resident/assistance/new', authMiddleware, async (req, res) => {
    const { data: resident } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
    await supabase.from('assistance_requests').insert([{
        barangay_id: req.user.barangay_id,
        resident_id: resident.id,
        assistance_type: req.body.assistance_type,
        amount_requested: req.body.amount_requested || null,
        reason: req.body.reason,
        status: 'SUBMITTED'
    }]);
    res.redirect('/resident/portal');
});

// Root Redirect Rule
app.get('/', (req, res) => {
    res.redirect('/login');
});

// 404 Fallback Handler
app.use((req, res) => {
    res.status(404).send(generateErrorPage('404 Not Found', 'The requested resource or endpoint does not exist.'));
});

// -----------------------------------------------------------------------------
// 16. APPLICATION SERVER STARTUP
// -----------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`🚀 BARANGAY RESIDENT MANAGEMENT SYSTEM SERVER ONLINE`);
    console.log(`📡 Listening on Port: ${PORT}`);
    console.log(`🌐 System URL: http://localhost:${PORT}`);
    console.log(`================================================================`);
});
