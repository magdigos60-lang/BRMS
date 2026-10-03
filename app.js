/**
 * BARANGAY RESIDENT MANAGEMENT SYSTEM
 * Single Monolithic Server Application (Express.js + Supabase JavaScript Client)
 * Designed for Deployment on Render + Supabase Database
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');
const multer = require('multer');

// ==========================================
// ENVIRONMENT & SYSTEM INITIALIZATION
// ==========================================
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-supabase-id.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-supabase-anon-key';
const JWT_SECRET = process.env.JWT_SECRET || 'barangay-system-super-secure-jwt-secret-key-2026';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[WARNING] Supabase credentials missing! Set SUPABASE_URL and SUPABASE_ANON_KEY in environment variables.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const app = express();

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// Universal Body Parsing Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(cors());

// ==========================================
// MIDDLEWARES (Auth & Role Validation)
// ==========================================
const authenticateToken = async (req, res, next) => {
  const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) {
    if (req.accepts('html')) return res.redirect('/login');
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { data: user, error } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
    if (error || !user || user.status !== 'Active') {
      res.clearCookie('token');
      if (req.accepts('html')) return res.redirect('/login');
      return res.status(403).json({ success: false, message: 'User account disabled or invalid.' });
    }
    req.user = user;
    next();
  } catch (err) {
    res.clearCookie('token');
    if (req.accepts('html')) return res.redirect('/login');
    return res.status(403).json({ success: false, message: 'Session expired or invalid.' });
  }
};

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized access for your user role.' });
    }
    next();
  };
};

const logActivity = async (userId, action, details = '', ip = '') => {
  try {
    await supabase.from('user_activity_logs').insert([{ user_id: userId, action, details, ip_address: ip }]);
  } catch (err) {
    console.error('Error writing activity log:', err);
  }
};

// ==========================================
// CONSTANTS & LOGIC CONSTANTS
// ==========================================
const DEFAULT_LOGIN_BG = 'https://scontent.fmnl33-4.fna.fbcdn.net/v/t39.30808-6/825351115_2246821486242027_8708722577315615068_n.jpg?stp=dst-jpg_tt6&cstp=mx1060x992&ctp=s1060x992&_nc_cat=110&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=127cfc&_nc_eui2=AeHpk_cBk3_TrQDPpACbx68fjQwB0jaJYXWNDAHSNolhdfR3vwGsh31cD5-A7Nb3qzplS4aAfDftzWcsmyDXAsnf&_nc_ohc=zPWWgjIxijoQ7kNvwFRKLVb&_nc_oc=AdpZBQL9o8MZk4xIiBL9pR6vKPkB7bvmqkM4R26op6LLy9SHE6Qd009laEUr-_vlHfE&_nc_zt=23&_nc_ht=scontent.fmnl33-4.fna&_nc_gid=A3E_5De3Kcc14pam4H4mgA&_nc_ss=7b2a8&oh=00_AQN0FSG7xTxJGzBY3rAhHoIZqJoNuUuFP2P_2cdm47NTxw&oe=6AC4DD7C';

// ==========================================
// INLINE CORE HTML/CSS SYSTEM STYLES ENGINE
// Palette Refined with Light Green & Light Blue Themes
// ==========================================
const renderSystemHead = (title) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Barangay Resident System</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css" rel="stylesheet">
  <style>
    :root {
      --primary-navy: #0b2545;
      --primary-blue: #205493;
      --light-blue: #d9edf7;
      --accent-green: #2ecc71;
      --light-green: #e1f5fe;
      --soft-mint: #d4edda;
      --pure-white: #ffffff;
      --bg-light: #f4f9f6;
      --text-dark: #1d2d44;
    }
    body {
      background-color: var(--bg-light);
      color: var(--text-dark);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    .bg-primary-blue { background-color: var(--primary-blue) !important; }
    .bg-dark-blue { background-color: var(--primary-navy) !important; }
    .bg-accent-green { background-color: var(--accent-green) !important; }
    .bg-light-green { background-color: var(--light-green) !important; }
    .bg-light-blue { background-color: var(--light-blue) !important; }
    
    .text-primary-blue { color: var(--primary-blue) !important; }
    .text-accent-green { color: var(--accent-green) !important; }
    
    .btn-primary-custom {
      background-color: var(--primary-blue);
      color: white;
      border: none;
    }
    .btn-primary-custom:hover {
      background-color: var(--primary-navy);
      color: white;
    }
    .btn-accent-custom {
      background-color: var(--accent-green);
      color: white;
      border: none;
    }
    .btn-accent-custom:hover {
      background-color: #27ae60;
      color: white;
    }
    .sidebar {
      min-height: 100vh;
      background: linear-gradient(180deg, var(--primary-navy) 0%, var(--primary-blue) 100%);
      color: white;
    }
    .sidebar .nav-link {
      color: rgba(255, 255, 255, 0.85);
      font-weight: 500;
      padding: 10px 18px;
      margin: 2px 10px;
      border-radius: 6px;
    }
    .sidebar .nav-link:hover, .sidebar .nav-link.active {
      background-color: var(--accent-green);
      color: white;
    }
    .card-custom {
      background-color: var(--pure-white);
      border-radius: 12px;
      border: 1px solid #d1e7dd;
      box-shadow: 0 4px 10px rgba(32, 84, 147, 0.05);
    }
    .stat-card {
      border-left: 5px solid var(--primary-blue);
      background: linear-gradient(135deg, #ffffff 0%, var(--light-blue) 100%);
    }
    .stat-card.green {
      border-left: 5px solid var(--accent-green);
      background: linear-gradient(135deg, #ffffff 0%, var(--light-green) 100%);
    }

    /* Standardized CR80 ID Card Frame (3.375in x 2.125in) */
    .id-card-frame {
      width: 3.375in;
      height: 2.125in;
      border-radius: 10px;
      border: 2px solid var(--primary-blue);
      background: #ffffff;
      position: relative;
      overflow: hidden;
      font-size: 8pt;
      box-shadow: 0 6px 12px rgba(0,0,0,0.12);
      display: inline-block;
      margin: 6px;
      box-sizing: border-box;
    }
    .id-card-header {
      background: linear-gradient(90deg, var(--primary-navy) 0%, var(--accent-green) 100%);
      color: white;
      padding: 4px 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 0.42in;
    }
    .id-header-logo {
      width: 0.42in;
      height: 0.42in;
      object-fit: cover;
      border-radius: 50%;
    }
    .id-card-body {
      padding: 6px;
      display: flex;
      gap: 8px;
      height: calc(2.125in - 0.72in);
    }
    .id-photo {
      width: 1.05in;
      height: 1.05in;
      object-fit: cover;
      border: 2px solid var(--primary-blue);
      border-radius: 6px;
      flex-shrink: 0;
    }
    .id-details {
      flex-grow: 1;
      font-size: 7.2pt;
      line-height: 1.2;
      overflow: hidden;
    }
    .id-qr {
      width: 1.05in;
      height: 1.05in;
      object-fit: contain;
      flex-shrink: 0;
    }
    .id-card-footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 0.30in;
      padding: 0 8px 3px 8px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      background: #ffffff;
    }
    .print-sheet-8 {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      width: 8.5in;
      margin: auto;
    }

    @media print {
      .no-print { display: none !important; }
      body { background: white !important; }
      .print-sheet-8 { page-break-after: always; }
    }
  </style>
</head>
<body>
`;

const renderSystemFooter = () => `
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script>
    function showNotification(title, message, isError = false) {
      alert((isError ? 'Error: ' : 'Info: ') + message);
    }
  </script>
</body>
</html>
`;

// Layout Wrapper with Responsive Sidebar (Pinalaki ang Logos)
const renderAppLayout = (req, activeModule, contentHtml, settings = {}) => {
  const user = req.user || {};
  const isAdmin = ['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff'].includes(user.role);

  const adminMenu = [
    { id: 'dashboard', label: 'Dashboard', icon: 'bi-speedometer2', link: '/admin/dashboard' },
    { id: 'residents', label: 'Resident Management', icon: 'bi-people', link: '/admin/residents' },
    { id: 'households', label: 'Households', icon: 'bi-house-door', link: '/admin/households' },
    { id: 'puroks', label: 'Puroks', icon: 'bi-geo-alt', link: '/admin/puroks' },
    { id: 'certificates', label: 'Certificate Requests', icon: 'bi-file-earmark-text', link: '/admin/certificates' },
    { id: 'blotters', label: 'Blotter Management', icon: 'bi-shield-exclamation', link: '/admin/blotters' },
    { id: 'assistance', label: 'Assistance Requests', icon: 'bi-hand-thumbs-up', link: '/admin/assistance' },
    { id: 'appointments', label: 'Appointments', icon: 'bi-calendar-check', link: '/admin/appointments' },
    { id: 'seniors', label: 'Senior Citizens', icon: 'bi-person-heart', link: '/admin/seniors' },
    { id: 'pwds', label: 'PWD Management', icon: 'bi-universal-access', link: '/admin/pwds' },
    { id: 'soloparents', label: 'Solo Parents', icon: 'bi-person-badge', link: '/admin/solo-parents' },
    { id: 'id-gen', label: 'Barangay ID Gen', icon: 'bi-card-heading', link: '/admin/id-generator' },
    { id: 'qr-scanner', label: 'QR Scanner', icon: 'bi-qr-code-scan', link: '/scanner' },
    { id: 'announcements', label: 'Announcements', icon: 'bi-megaphone', link: '/admin/announcements' },
    { id: 'events', label: 'Events', icon: 'bi-calendar-event', link: '/admin/events' },
    { id: 'officials', label: 'Barangay Officials', icon: 'bi-person-lines-fill', link: '/admin/officials' },
    { id: 'users', label: 'User Accounts', icon: 'bi-person-gear', link: '/admin/users' },
    { id: 'reports', label: 'Reports', icon: 'bi-bar-chart-line', link: '/admin/reports' },
    { id: 'activity-logs', label: 'Activity Logs', icon: 'bi-clock-history', link: '/admin/activity-logs' },
    { id: 'settings', label: 'System Settings', icon: 'bi-sliders', link: '/admin/settings' },
  ];

  const residentMenu = [
    { id: 'res-dashboard', label: 'Dashboard', icon: 'bi-speedometer2', link: '/resident/dashboard' },
    { id: 'res-profile', label: 'My Profile & Photo', icon: 'bi-person-circle', link: '/resident/profile' },
    { id: 'res-digital-id', label: 'My Digital ID', icon: 'bi-card-checklist', link: '/resident/digital-id' },
    { id: 'res-certificates', label: 'Request Certificate', icon: 'bi-file-earmark-plus', link: '/resident/certificates' },
    { id: 'res-appointments', label: 'Book Appointment', icon: 'bi-calendar-plus', link: '/resident/appointments' },
    { id: 'res-complaints', label: 'Submit Complaint', icon: 'bi-exclamation-triangle', link: '/resident/complaints' },
    { id: 'res-assistance', label: 'Request Assistance', icon: 'bi-heart-pulse', link: '/resident/assistance' },
    { id: 'res-announcements', label: 'Announcements', icon: 'bi-bell', link: '/resident/announcements' },
    { id: 'res-contacts', label: 'Emergency Contacts', icon: 'bi-telephone', link: '/resident/emergency-contacts' },
    { id: 'res-feedback', label: 'Submit Feedback', icon: 'bi-chat-left-text', link: '/resident/feedback' },
  ];

  const menuItems = isAdmin ? adminMenu : residentMenu;

  return `
    ${renderSystemHead(settings.barangay_name || 'Barangay Portal')}
    <div class="container-fluid p-0">
      <div class="row g-0">
        <!-- Sidebar Navigation -->
        <div class="col-md-3 col-lg-2 sidebar d-flex flex-column p-3 no-print">
          <div class="d-flex align-items-center mb-4 px-2">
            ${settings.barangay_logo ? `<img src="${settings.barangay_logo}" class="me-2 rounded-circle shadow-sm" style="width: 70px; height: 70px; object-fit: cover;">` : '<i class="bi bi-building fs-1 me-2 text-accent-green"></i>'}
            <div>
              <h6 class="m-0 fw-bold">${settings.barangay_name || 'BARANGAY PORTAL'}</h6>
              <small class="text-white-50">${user.full_name || user.role || 'User'}</small>
            </div>
          </div>
          <hr class="text-white-50 mt-0">
          <ul class="nav nav-pills flex-column mb-auto overflow-y-auto" style="max-height: calc(100vh - 180px);">
            ${menuItems.map(item => `
              <li class="nav-item">
                <a href="${item.link}" class="nav-link ${activeModule === item.id ? 'active' : ''}">
                  <i class="bi ${item.icon} me-2"></i> ${item.label}
                </a>
              </li>
            `).join('')}
          </ul>
          <hr class="text-white-50">
          <div class="dropdown">
            <a href="#" class="d-flex align-items-center text-white text-decoration-none dropdown-toggle px-2" id="dropdownUser1" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="bi bi-person-circle fs-4 me-2"></i>
              <strong>${user.full_name || user.username}</strong>
            </a>
            <ul class="dropdown-menu dropdown-menu-dark text-small shadow">
              <li><a class="dropdown-item" href="/logout"><i class="bi bi-box-arrow-right me-2"></i> Sign out</a></li>
            </ul>
          </div>
        </div>

        <!-- Main Content Area -->
        <div class="col-md-9 col-lg-10 p-4 overflow-y-auto" style="height: 100vh; background-color: #f4f9f6;">
          <div class="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom no-print">
            <h4 class="fw-bold text-primary-blue m-0">${settings.system_name || 'Barangay Resident Management System'}</h4>
            <span class="badge bg-accent-green px-3 py-2 text-white"><i class="bi bi-check-circle me-1"></i> System Online</span>
          </div>
          ${contentHtml}
        </div>
      </div>
    </div>
    ${renderSystemFooter()}
  `;
};

// ==========================================
// SYSTEM SETUP & INITIAL ADMISSION GUARD
// ==========================================
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/public/')) return next();
  try {
    const { data: settings } = await supabase.from('system_settings').select('*').single();
    if ((!settings || !settings.setup_completed) && req.path !== '/setup') {
      return res.redirect('/setup');
    }
  } catch (e) {
    console.error('Setup Check Error:', e);
  }
  next();
});

// Helper: Fetch Global Barangay Settings
const getSettings = async () => {
  const { data } = await supabase.from('system_settings').select('*').single();
  return data || {};
};

// ==========================================
// ROUTE 1: SYSTEM SETUP
// ==========================================
app.get('/setup', async (req, res) => {
  const settings = await getSettings();
  if (settings && settings.setup_completed) return res.redirect('/login');

  res.send(`
    ${renderSystemHead('Initial Setup')}
    <div class="container d-flex justify-content-center align-items-center min-vh-100" style="background: linear-gradient(135deg, #e1f5fe 0%, #d9edf7 100%);">
      <div class="card card-custom p-4 shadow-lg" style="max-width: 550px; width: 100%;">
        <div class="text-center mb-4">
          <i class="bi bi-gear-fill text-primary-blue fs-1"></i>
          <h3 class="fw-bold text-primary-blue mt-2">Initial System Setup</h3>
          <p class="text-muted">Configure your Barangay details and create the Super Administrator account.</p>
        </div>
        <form action="/api/setup" method="POST">
          <h6 class="fw-bold text-accent-green border-bottom pb-2 mb-3">1. Barangay Details</h6>
          <div class="mb-3">
            <label class="form-label">Barangay Name</label>
            <input type="text" name="barangay_name" class="form-control" required placeholder="e.g. Barangay Central">
          </div>
          <div class="row">
            <div class="col-md-6 mb-3">
              <label class="form-label">Municipality / City</label>
              <input type="text" name="municipality" class="form-control" required placeholder="Angeles City">
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">Province</label>
              <input type="text" name="province" class="form-control" required placeholder="Pampanga">
            </div>
          </div>
          <h6 class="fw-bold text-accent-green border-bottom pb-2 mb-3 mt-4">2. Super Admin Credentials</h6>
          <div class="mb-3">
            <label class="form-label">Full Name</label>
            <input type="text" name="full_name" class="form-control" required placeholder="Hon. Admin Name">
          </div>
          <div class="mb-3">
            <label class="form-label">Username</label>
            <input type="text" name="username" class="form-control" required placeholder="admin">
          </div>
          <div class="mb-3">
            <label class="form-label">Email Address</label>
            <input type="email" name="email" class="form-control" required placeholder="admin@barangay.gov.ph">
          </div>
          <div class="mb-3">
            <label class="form-label">Password</label>
            <input type="password" name="password" class="form-control" required minlength="6">
          </div>
          <button type="submit" class="btn btn-primary-custom w-100 py-2 mt-3 fw-bold">Complete System Setup</button>
        </form>
      </div>
    </div>
    ${renderSystemFooter()}
  `);
});

app.post('/api/setup', async (req, res) => {
  const { barangay_name, municipality, province, full_name, username, email, password } = req.body;
  try {
    const { data: existingSettings } = await supabase.from('system_settings').select('*').single();
    if (existingSettings && existingSettings.setup_completed) {
      return res.status(400).send('Setup has already been completed.');
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const { data: user, error: userError } = await supabase.from('users').insert([{
      username, email, password_hash, full_name, role: 'Super Admin', status: 'Active'
    }]).select().single();

    if (userError) throw userError;

    if (existingSettings) {
      await supabase.from('system_settings').update({
        barangay_name, municipality, province, setup_completed: true, updated_at: new Date()
      }).eq('id', existingSettings.id);
    } else {
      await supabase.from('system_settings').insert([{
        barangay_name, municipality, province, setup_completed: true
      }]);
    }

    await supabase.from('puroks').insert([
      { name: 'Purok 1', description: 'Zone 1' },
      { name: 'Purok 2', description: 'Zone 2' },
      { name: 'Purok 3', description: 'Zone 3' }
    ]);

    res.send(`
      ${renderSystemHead('Setup Complete')}
      <div class="container text-center pt-5">
        <div class="card p-5 shadow-lg d-inline-block bg-light-green">
          <i class="bi bi-check-circle-fill text-accent-green display-1"></i>
          <h2 class="mt-3 text-primary-blue fw-bold">System Successfully Setup!</h2>
          <p class="text-muted">Administrator account has been initialized.</p>
          <a href="/login" class="btn btn-primary-custom px-4 py-2 mt-3 fw-bold">Go to Login Page</a>
        </div>
      </div>
      ${renderSystemFooter()}
    `);
  } catch (err) {
    console.error('Setup Post Error:', err);
    res.status(500).send('Error completing setup: ' + err.message);
  }
});

// ==========================================
// ROUTE 2: REDESIGNED LOGIN PAGE (GREEN UPPER & BLUE LOWER GRADIENT + HORIZONTAL SPLIT RECTANGLE)
// ==========================================
app.get('/login', async (req, res) => {
  const settings = await getSettings();
  const bgImg = 'https://scontent.fmnl33-4.fna.fbcdn.net/v/t39.30808-6/825351115_2246821486242027_8708722577315615068_n.jpg?stp=dst-jpg_tt6&cstp=mx1060x992&ctp=s1060x992&_nc_cat=110&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=127cfc&_nc_eui2=AeHpk_cBk3_TrQDPpACbx68fjQwB0jaJYXWNDAHSNolhdfR3vwGsh31cD5-A7Nb3qzplS4aAfDftzWcsmyDXAsnf&_nc_ohc=zPWWgjIxijoQ7kNvwFRKLVb&_nc_oc=AdpZBQL9o8MZk4xIiBL9pR6vKPkB7bvmqkM4R26op6LLy9SHE6Qd009laEUr-_vlHfE&_nc_zt=23&_nc_ht=scontent.fmnl33-4.fna&_nc_gid=A3E_5De3Kcc14pam4H4mgA&_nc_ss=7b2a8&oh=00_AQN0FSG7xTxJGzBY3rAhHoIZqJoNuUuFP2P_2cdm47NTxw&oe=6AC4DD7C';
  
  const { data: officials } = await supabase.from('barangay_officials').select('*');

  res.send(`
    ${renderSystemHead('Login')}
    <style>
      html {
        scroll-behavior: smooth;
      }
      body {
        background-color: #0b2545;
        overflow-x: hidden;
      }
      .login-section {
        min-height: 100vh;
        /* Green sa taas, Blue sa baba (Hindi masyadong madilim) */
        background: linear-gradient(180deg, rgba(46, 204, 113, 0.75), rgba(32, 84, 147, 0.85)), url('${bgImg}');
        background-size: cover;
        background-position: center;
        background-attachment: fixed;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        position: relative;
      }
      /* Horizontal rectangle login fields with blue and green styling and split in middle */
      .glass-login-card-horizontal {
        background: linear-gradient(135deg, rgba(225, 245, 254, 0.95) 0%, rgba(217, 237, 247, 0.95) 100%);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 2px solid rgba(46, 204, 113, 0.4);
        border-radius: 20px;
        box-shadow: 0 20px 40px rgba(32, 84, 147, 0.2);
        max-width: 850px;
        width: 100%;
        overflow: hidden;
      }
      .brand-logo-img {
        width: 120px;
        height: 120px;
        object-fit: cover;
        border-radius: 50%;
        box-shadow: 0 4px 12px rgba(32, 84, 147, 0.2);
      }
      .form-control-horizontal {
        height: 48px;
        border-radius: 8px;
        font-size: 1rem;
      }
      .input-group-horizontal {
        border-radius: 8px;
        overflow: hidden;
      }
      .input-group-text {
        background-color: #d9edf7 !important;
        color: #205493 !important;
        border: 1px solid #ced4da;
        width: 48px;
        justify-content: center;
      }
      .btn-glow {
        background: linear-gradient(90deg, #205493 0%, #2ecc71 100%);
        border: none;
        border-radius: 10px;
        padding: 12px;
        font-size: 1.05rem;
        letter-spacing: 0.5px;
        color: white;
        box-shadow: 0 4px 15px rgba(32, 84, 147, 0.4);
        transition: all 0.25s ease;
      }
      .btn-glow:hover {
        opacity: 0.9;
        box-shadow: 0 6px 20px rgba(11, 37, 69, 0.6);
      }
      .scroll-down-hint {
        position: absolute;
        bottom: 25px;
        color: #ffffff;
        text-align: center;
        animation: bounce 2s infinite;
        text-decoration: none;
        font-weight: 700;
        background: rgba(32, 84, 147, 0.8);
        padding: 8px 18px;
        border-radius: 30px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1);
      }
      @keyframes bounce {
        0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-8px); }
        60% { transform: translateY(-4px); }
      }
      .officials-section {
        padding: 90px 20px;
        background: linear-gradient(180deg, #d9edf7 0%, #e1f5fe 100%);
      }
      .official-card {
        border-radius: 16px;
        border: 1px solid #a3e4d7;
        background: white;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
      }
      .official-card:hover {
        transform: translateY(-6px);
        box-shadow: 0 12px 24px rgba(32, 84, 147, 0.15);
      }
      .official-photo {
        width: 130px;
        height: 130px;
        object-fit: cover;
        border-radius: 50%;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1);
      }
    </style>

    <!-- SECTION 1: LOGIN CARD CONTAINER WITH SPLIT HORIZONTAL RECTANGLE -->
    <div class="login-section">
      <div class="glass-login-card-horizontal">
        <div class="row g-0">
          <!-- Left Side: Logo and Information -->
          <div class="col-md-5 p-4 d-flex flex-column align-items-center justify-content-center text-center bg-white bg-opacity-75 border-end">
            ${settings.barangay_logo ? `<img src="${settings.barangay_logo}" class="brand-logo-img mb-3">` : '<i class="bi bi-building-fill text-primary-blue display-3 mb-2"></i>'}
            <h4 class="fw-bold m-0" style="color: #0b2545 !important;">${settings.barangay_name || 'BARANGAY PORTAL'}</h4>
            <p class="text-muted small mt-1">Resident & Administration System</p>
            <span class="badge bg-accent-green px-3 py-2 rounded-pill mt-2 text-white"><i class="bi bi-shield-check me-1"></i> Official Portal</span>
          </div>

          <!-- Right Side: Username, Password, Are you a resident without an account? Register as Resident -->
          <div class="col-md-7 p-4 p-md-5 d-flex flex-column justify-content-center">
            <h4 class="fw-bold mb-3 text-primary-blue">Sign In</h4>
            <form action="/api/login" method="POST">
              <div class="mb-3">
                <label class="form-label fw-semibold text-secondary small">USERNAME OR EMAIL</label>
                <div class="input-group input-group-horizontal">
                  <span class="input-group-text"><i class="bi bi-person-fill fs-5"></i></span>
                  <input type="text" name="identifier" class="form-control form-control-horizontal border-start-0" required placeholder="Enter username or email">
                </div>
              </div>
              <div class="mb-4">
                <label class="form-label fw-semibold text-secondary small">PASSWORD</label>
                <div class="input-group input-group-horizontal">
                  <span class="input-group-text"><i class="bi bi-lock-fill fs-5"></i></span>
                  <input type="password" name="password" class="form-control form-control-horizontal border-start-0" required placeholder="Enter your password">
                </div>
              </div>
              <button type="submit" class="btn btn-glow w-100 fw-bold text-white"><i class="bi bi-box-arrow-in-right me-2"></i>Sign In to Account</button>
            </form>

            <div class="text-center mt-4 border-top pt-3">
              <p class="small text-muted mb-1">Are you a resident without an account?</p>
              <a href="/register" class="text-accent-green fw-bold text-decoration-none"><i class="bi bi-person-plus-fill me-1"></i> Register as Resident</a>
            </div>
          </div>
        </div>
      </div>

      <a href="#officials-section" class="scroll-down-hint">
        <span class="d-block small">Scroll down to view Barangay Officials & Pictures</span>
        <i class="bi bi-chevron-down fs-5"></i>
      </a>
    </div>

    <!-- SECTION 2: SCROLLABLE BARANGAY OFFICIALS SHOWCASE WITH PICTURES -->
    <div id="officials-section" class="officials-section">
      <div class="container">
        <div class="text-center mb-5">
          <h2 class="fw-bold" style="color: #0b2545;"><i class="bi bi-person-lines-fill me-2 text-accent-green"></i>Barangay Officials & Council</h2>
          <p class="text-muted">Dedicated leaders serving our community with transparency, diligence, and care.</p>
          <div class="mx-auto bg-accent-green" style="height: 4px; width: 80px; border-radius: 2px;"></div>
        </div>

        <div class="row g-4 justify-content-center">
          ${(officials || []).map(o => `
            <div class="col-md-4 col-lg-3">
              <div class="card official-card p-4 text-center h-100 shadow-sm">
                <img src="${o.photo_url || 'https://via.placeholder.com/130'}" class="official-photo mx-auto mb-3" alt="${o.name}">
                <h5 class="fw-bold text-dark mb-1">${o.name}</h5>
                <span class="badge bg-primary-blue px-3 py-2 rounded-pill mt-1 mb-2 text-white">${o.position}</span>
                ${o.signature_url ? `<img src="${o.signature_url}" class="d-block mx-auto mt-2" style="height: 32px; object-fit: contain;" alt="Signature">` : ''}
              </div>
            </div>
          `).join('') || `
            <div class="col-12 text-center text-muted py-5">
              <i class="bi bi-people fs-1 text-secondary"></i>
              <p class="mt-2">No official records available at this time. Admin can add officials in the dashboard.</p>
            </div>
          `}
        </div>
      </div>
    </div>
    ${renderSystemFooter()}
  `);
});

app.post('/api/login', async (req, res) => {
  const { identifier, password } = req.body;
  try {
    const { data: user, error } = await supabase.from('users').select('*').or(`username.eq.${identifier},email.eq.${identifier}`).single();
    if (error || !user) {
      return res.status(400).send('<script>alert("Invalid identifier or password."); window.location="/login";</script>');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).send('<script>alert("Invalid identifier or password."); window.location="/login";</script>');
    }

    if (user.status !== 'Active') {
      return res.status(403).send('<script>alert("Your account is pending approval or disabled."); window.location="/login";</script>');
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    res.cookie('token', token, { httpOnly: true, maxAge: 12 * 3600 * 1000 });

    await supabase.from('login_history').insert([{ user_id: user.id, status: 'Success' }]);
    await logActivity(user.id, 'User Login', 'User authenticated successfully.');

    if (['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff'].includes(user.role)) {
      return res.redirect('/admin/dashboard');
    } else {
      return res.redirect('/resident/dashboard');
    }
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).send('Server error during authentication.');
  }
});

app.get('/register', async (req, res) => {
  const { data: puroks } = await supabase.from('puroks').select('*');
  const settings = await getSettings();

  res.send(`
    ${renderSystemHead('Resident Registration')}
    <div class="container py-5">
      <div class="row justify-content-center">
        <div class="col-md-8">
          <div class="card card-custom p-4 shadow">
            <div class="text-center mb-4">
              <h3 class="fw-bold text-primary-blue"><i class="bi bi-person-badge me-2"></i>Resident Public Registration</h3>
              <p class="text-muted">Complete the official form. Registrations undergo approval by Barangay Officials.</p>
            </div>
            <form action="/api/register" method="POST">
              <h6 class="fw-bold text-accent-green border-bottom pb-2 mb-3">Personal Information</h6>
              <div class="row">
                <div class="col-md-4 mb-3">
                  <label class="form-label">First Name *</label>
                  <input type="text" name="first_name" class="form-control" required placeholder="First Name">
                </div>
                <div class="col-md-4 mb-3">
                  <label class="form-label">Middle Name</label>
                  <input type="text" name="middle_name" class="form-control" placeholder="Middle Name">
                </div>
                <div class="col-md-4 mb-3">
                  <label class="form-label">Last Name *</label>
                  <input type="text" name="last_name" class="form-control" required placeholder="Last Name">
                </div>
              </div>
              <div class="row">
                <div class="col-md-3 mb-3">
                  <label class="form-label">Suffix</label>
                  <input type="text" name="suffix" class="form-control" placeholder="e.g. Jr., III">
                </div>
                <div class="col-md-3 mb-3">
                  <label class="form-label">Date of Birth *</label>
                  <input type="date" name="date_of_birth" class="form-control" required>
                </div>
                <div class="col-md-3 mb-3">
                  <label class="form-label">Gender *</label>
                  <select name="gender" class="form-select" required>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div class="col-md-3 mb-3">
                  <label class="form-label">Civil Status *</label>
                  <select name="civil_status" class="form-select" required>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Widowed">Widowed</option>
                    <option value="Separated">Separated</option>
                  </select>
                </div>
              </div>

              <h6 class="fw-bold text-accent-green border-bottom pb-2 mb-3 mt-3">Address & Contact</h6>
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">Purok *</label>
                  <select name="purok_id" class="form-select" required>
                    ${(puroks || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                  </select>
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">Complete House Address *</label>
                  <input type="text" name="address" class="form-control" required placeholder="House No., Street Name">
                </div>
              </div>
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">Contact Number *</label>
                  <input type="text" name="contact_number" class="form-control" required placeholder="09XXXXXXXXX">
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">Occupation</label>
                  <input type="text" name="occupation" class="form-control" placeholder="Occupation">
                </div>
              </div>

              <h6 class="fw-bold text-accent-green border-bottom pb-2 mb-3 mt-3">Account Credentials</h6>
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">Email Address (Username) *</label>
                  <input type="email" name="email" class="form-control" required placeholder="name@email.com">
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">Account Password *</label>
                  <input type="password" name="password" class="form-control" required minlength="6">
                </div>
              </div>

              <button type="submit" class="btn btn-accent-custom w-100 py-2 mt-3 fw-bold">Submit Registration Request</button>
              <div class="text-center mt-3">
                <a href="/login" class="text-decoration-none text-primary-blue">Back to Login</a>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
    ${renderSystemFooter()}
  `);
});

app.post('/api/register', async (req, res) => {
  try {
    const first_name = (req.body.first_name || '').trim();
    const middle_name = (req.body.middle_name || '').trim();
    const last_name = (req.body.last_name || '').trim();
    const suffix = (req.body.suffix || '').trim();
    const date_of_birth = req.body.date_of_birth;
    const gender = req.body.gender || 'Male';
    const civil_status = req.body.civil_status || 'Single';
    const purok_id = req.body.purok_id || null;
    const address = (req.body.address || '').trim();
    const contact_number = (req.body.contact_number || '').trim();
    const occupation = (req.body.occupation || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password;

    if (!first_name || !last_name || !date_of_birth || !address || !email || !password) {
      return res.status(400).send('<script>alert("Please fill in all required fields."); window.history.back();</script>');
    }

    const { data: existingUser } = await supabase.from('users').select('*').eq('email', email).single();
    if (existingUser) {
      return res.status(400).send('<script>alert("Email is already registered."); window.location="/register";</script>');
    }

    const year = new Date().getFullYear();
    const countRes = await supabase.from('residents').select('id', { count: 'exact' });
    const sequenceNum = String((countRes.count || 0) + 1).padStart(6, '0');
    const resident_number = `BRGY-${year}-${sequenceNum}`;

    const dob = new Date(date_of_birth);
    const age = new Date().getFullYear() - dob.getFullYear();
    const is_senior_citizen = age >= 60;

    const { data: resident, error: resErr } = await supabase.from('residents').insert([{
      resident_number, 
      first_name, 
      middle_name, 
      last_name, 
      suffix, 
      date_of_birth, 
      gender,
      civil_status, 
      purok_id, 
      address, 
      contact_number, 
      occupation, 
      email,
      resident_status: 'Pending', 
      is_senior_citizen
    }]).select().single();

    if (resErr) throw resErr;

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    await supabase.from('users').insert([{
      username: email, 
      email, 
      password_hash, 
      full_name: `${first_name} ${last_name}`,
      role: 'Resident', 
      status: 'Pending', 
      resident_id: resident.id
    }]);

    res.send(`
      ${renderSystemHead('Registration Pending')}
      <div class="container text-center pt-5">
        <div class="card p-5 shadow-lg d-inline-block bg-light-green" style="max-width: 500px;">
          <i class="bi bi-clock-history text-warning display-1"></i>
          <h3 class="mt-3 text-primary-blue fw-bold">Registration Received</h3>
          <p class="text-muted">Your resident registration reference is <strong>${resident_number}</strong>. Please wait for official approval from Barangay Admin before logging in.</p>
          <a href="/login" class="btn btn-primary-custom mt-3">Return to Login</a>
        </div>
      </div>
      ${renderSystemFooter()}
    `);
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).send('Error registering account: ' + err.message);
  }
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

// ==========================================
// ROUTE 3: ADMIN DASHBOARD
// ==========================================
app.get('/admin/dashboard', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();

  const [
    { count: totalResidents },
    { count: activeResidents },
    { count: pendingRegistrations },
    { count: totalHouseholds },
    { count: totalPuroks },
    { count: seniorCitizens },
    { count: pwds },
    { count: soloParents },
    { count: pendingCerts },
    { count: pendingBlotters }
  ] = await Promise.all([
    supabase.from('residents').select('*', { count: 'exact', head: true }),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'Active'),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'Pending'),
    supabase.from('households').select('*', { count: 'exact', head: true }),
    supabase.from('puroks').select('*', { count: 'exact', head: true }),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('is_senior_citizen', true),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('is_pwd', true),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('is_solo_parent', true),
    supabase.from('certificate_requests').select('*', { count: 'exact', head: true }).eq('status', 'SUBMITTED'),
    supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'SUBMITTED')
  ]);

  const { data: recentLogs } = await supabase.from('user_activity_logs').select('*, users(full_name)').order('created_at', { ascending: false }).limit(5);

  const html = `
    <div class="row g-3 mb-4">
      <div class="col-md-3">
        <div class="card card-custom p-3 stat-card">
          <span class="text-muted small fw-bold">TOTAL RESIDENTS</span>
          <h2 class="fw-bold text-primary-blue m-0">${totalResidents || 0}</h2>
          <small class="text-accent-green fw-bold">${activeResidents || 0} Active / ${pendingRegistrations || 0} Pending</small>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card card-custom p-3 stat-card green">
          <span class="text-muted small fw-bold">HOUSEHOLDS & PUROKS</span>
          <h2 class="fw-bold text-accent-green m-0">${totalHouseholds || 0}</h2>
          <small class="text-muted">${totalPuroks || 0} Total Registered Puroks</small>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card card-custom p-3 stat-card">
          <span class="text-muted small fw-bold">PENDING REQUESTS</span>
          <h2 class="fw-bold text-primary-blue m-0">${pendingCerts || 0}</h2>
          <small class="text-danger fw-bold">Certificate Applications</small>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card card-custom p-3 stat-card green">
          <span class="text-muted small fw-bold">SPECIAL SECTORS</span>
          <h2 class="fw-bold text-accent-green m-0">${(seniorCitizens || 0) + (pwds || 0) + (soloParents || 0)}</h2>
          <small class="text-muted">Seniors: ${seniorCitizens || 0} | PWD: ${pwds || 0} | Solo: ${soloParents || 0}</small>
        </div>
      </div>
    </div>

    <div class="row g-3">
      <div class="col-md-8">
        <div class="card card-custom p-4">
          <h5 class="fw-bold text-primary-blue mb-3"><i class="bi bi-clock-history me-2"></i>Recent System Activities</h5>
          <div class="table-responsive">
            <table class="table table-hover align-middle">
              <thead class="table-light">
                <tr>
                  <th>User</th>
                  <th>Action</th>
                  <th>Details</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                ${(recentLogs || []).map(log => `
                  <tr>
                    <td class="fw-semibold">${log.users ? log.users.full_name : 'System'}</td>
                    <td><span class="badge bg-primary-blue text-white">${log.action}</span></td>
                    <td class="small">${log.details || '-'}</td>
                    <td class="small text-muted">${new Date(log.created_at).toLocaleString()}</td>
                  </tr>
                `).join('') || '<tr><td colspan="4" class="text-center text-muted">No activity logs recorded.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="col-md-4">
        <div class="card card-custom p-4">
          <h5 class="fw-bold text-primary-blue mb-3"><i class="bi bi-lightning-charge me-2"></i>Quick Actions</h5>
          <div class="d-grid gap-2">
            <a href="/admin/residents?filter=Pending" class="btn btn-outline-primary text-start"><i class="bi bi-person-check me-2"></i> Review Pending Registrations (${pendingRegistrations || 0})</a>
            <a href="/admin/certificates" class="btn btn-outline-success text-start"><i class="bi bi-file-earmark-check me-2"></i> Process Certificates (${pendingCerts || 0})</a>
            <a href="/scanner" class="btn btn-primary-custom text-center py-2 fw-bold text-white"><i class="bi bi-qr-code-scan me-2"></i> Open QR Verification Scanner</a>
          </div>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'dashboard', html, settings));
});

// ==========================================
// ROUTE 4: RESIDENT MANAGEMENT (ADMIN)
// ==========================================
app.get('/admin/residents', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const search = req.query.search || '';
  const filter = req.query.filter || 'Active';

  let query = supabase.from('residents').select('*, puroks(name)').order('created_at', { ascending: false });

  if (filter !== 'All') {
    query = query.eq('resident_status', filter);
  }

  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,resident_number.ilike.%${search}%`);
  }

  const { data: residents } = await query;
  const { data: puroks } = await supabase.from('puroks').select('*');

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-people me-2"></i>Resident Directory Management</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#addResidentModal"><i class="bi bi-person-plus me-1"></i> Add New Resident</button>
      </div>

      <form class="row g-2 mb-4" method="GET" action="/admin/residents">
        <div class="col-md-5">
          <input type="text" name="search" class="form-control" placeholder="Search by Name or Resident ID..." value="${search}">
        </div>
        <div class="col-md-3">
          <select name="filter" class="form-select" onchange="this.form.submit()">
            <option value="Active" ${filter === 'Active' ? 'selected' : ''}>Active Residents</option>
            <option value="Pending" ${filter === 'Pending' ? 'selected' : ''}>Pending Registrations</option>
            <option value="Archived" ${filter === 'Archived' ? 'selected' : ''}>Archived Residents</option>
            <option value="All" ${filter === 'All' ? 'selected' : ''}>All Records</option>
          </select>
        </div>
        <div class="col-md-2">
          <button type="submit" class="btn btn-primary-custom w-100 text-white">Search</button>
        </div>
      </form>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Resident ID</th>
              <th>Full Name</th>
              <th>Purok</th>
              <th>Gender / Age</th>
              <th>Status</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${(residents || []).map(r => {
              const age = new Date().getFullYear() - new Date(r.date_of_birth).getFullYear();
              return `
                <tr>
                  <td class="fw-bold text-primary-blue">${r.resident_number}</td>
                  <td>
                    ${r.photo_url ? `<img src="${r.photo_url}" class="rounded-circle me-2" style="width:30px; height:30px; object-fit:cover;">` : ''}
                    ${r.first_name} ${r.middle_name || ''} ${r.last_name} ${r.suffix || ''}
                  </td>
                  <td>${r.puroks ? r.puroks.name : '-'}</td>
                  <td>${r.gender} (${age} yrs)</td>
                  <td>
                    <span class="badge ${r.resident_status === 'Active' ? 'bg-success' : (r.resident_status === 'Pending' ? 'bg-warning text-dark' : 'bg-secondary')}">
                      ${r.resident_status}
                    </span>
                  </td>
                  <td class="text-end">
                    ${r.resident_status === 'Pending' ? `
                      <a href="/api/admin/resident/approve/${r.id}" class="btn btn-sm btn-success"><i class="bi bi-check-lg"></i> Approve</a>
                      <a href="/api/admin/resident/reject/${r.id}" class="btn btn-sm btn-danger"><i class="bi bi-x-lg"></i> Reject</a>
                    ` : `
                      <a href="/admin/resident/view/${r.id}" class="btn btn-sm btn-outline-primary"><i class="bi bi-eye"></i> View</a>
                      ${r.resident_status === 'Active' ? `<a href="/api/admin/resident/archive/${r.id}" class="btn btn-sm btn-outline-secondary" onclick="return confirm('Archive this resident record?')"><i class="bi bi-archive"></i></a>` : ''}
                    `}
                  </td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="6" class="text-center py-4 text-muted">No resident records found. Register or approve your first resident to get started.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: Add Resident -->
    <div class="modal fade" id="addResidentModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <form action="/api/admin/resident/add" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">Add Resident Record</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="row g-3">
                <div class="col-md-4"><label class="form-label">First Name *</label><input type="text" name="first_name" class="form-control" required></div>
                <div class="col-md-4"><label class="form-label">Middle Name</label><input type="text" name="middle_name" class="form-control"></div>
                <div class="col-md-4"><label class="form-label">Last Name *</label><input type="text" name="last_name" class="form-control" required></div>
                <div class="col-md-4"><label class="form-label">Date of Birth *</label><input type="date" name="date_of_birth" class="form-control" required></div>
                <div class="col-md-4">
                  <label class="form-label">Gender *</label>
                  <select name="gender" class="form-select"><option value="Male">Male</option><option value="Female">Female</option></select>
                </div>
                <div class="col-md-4">
                  <label class="form-label">Civil Status *</label>
                  <select name="civil_status" class="form-select"><option value="Single">Single</option><option value="Married">Married</option><option value="Widowed">Widowed</option></select>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Purok *</label>
                  <select name="purok_id" class="form-select">${(puroks || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
                </div>
                <div class="col-md-6"><label class="form-label">Address *</label><input type="text" name="address" class="form-control" required></div>
                <div class="col-md-6"><label class="form-label">Contact Number</label><input type="text" name="contact_number" class="form-control"></div>
                <div class="col-md-6"><label class="form-label">Email</label><input type="email" name="email" class="form-control"></div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
              <button type="submit" class="btn btn-primary-custom text-white">Save Resident Record</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'residents', html, settings));
});

// Admin API Actions: Resident
app.post('/api/admin/resident/add', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary']), async (req, res) => {
  const { first_name, middle_name, last_name, date_of_birth, gender, civil_status, purok_id, address, contact_number, email } = req.body;
  try {
    const year = new Date().getFullYear();
    const countRes = await supabase.from('residents').select('id', { count: 'exact' });
    const sequenceNum = String((countRes.count || 0) + 1).padStart(6, '0');
    const resident_number = `BRGY-${year}-${sequenceNum}`;

    const dob = new Date(date_of_birth);
    const age = new Date().getFullYear() - dob.getFullYear();

    await supabase.from('residents').insert([{
      resident_number, first_name, middle_name, last_name, date_of_birth, gender,
      civil_status, purok_id, address, contact_number, email, resident_status: 'Active',
      is_senior_citizen: age >= 60
    }]);

    await logActivity(req.user.id, 'Add Resident', `Added new resident record: ${first_name} ${last_name}`);
    res.redirect('/admin/residents');
  } catch (err) {
    res.status(500).send('Error adding resident: ' + err.message);
  }
});

app.get('/api/admin/resident/approve/:id', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary']), async (req, res) => {
  try {
    await supabase.from('residents').update({ resident_status: 'Active' }).eq('id', req.params.id);
    await supabase.from('users').update({ status: 'Active' }).eq('resident_id', req.params.id);
    await logActivity(req.user.id, 'Approve Resident', `Approved resident ID: ${req.params.id}`);
    res.redirect('/admin/residents?filter=Pending');
  } catch (err) {
    res.status(500).send('Error approving resident.');
  }
});

app.get('/api/admin/resident/archive/:id', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  try {
    await supabase.from('residents').update({ resident_status: 'Archived' }).eq('id', req.params.id);
    await logActivity(req.user.id, 'Archive Resident', `Archived resident ID: ${req.params.id}`);
    res.redirect('/admin/residents');
  } catch (err) {
    res.status(500).send('Error archiving resident.');
  }
});

// View Resident Record Details
app.get('/admin/resident/view/:id', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: resident } = await supabase.from('residents').select('*, puroks(name), households(household_number)').eq('id', req.params.id).single();
  if (!resident) return res.status(404).send('Resident not found');

  const { data: certs } = await supabase.from('certificate_requests').select('*').eq('resident_id', resident.id);

  const html = `
    <div class="row g-4">
      <div class="col-md-4">
        <div class="card card-custom p-4 text-center">
          <img src="${resident.photo_url || 'https://via.placeholder.com/150'}" class="rounded-circle mx-auto mb-3" style="width: 140px; height: 140px; object-fit: cover; border: 3px solid #205493;">
          <h5 class="fw-bold m-0">${resident.first_name} ${resident.last_name}</h5>
          <span class="text-primary-blue fw-bold">${resident.resident_number}</span>
          <p class="text-muted small">${resident.puroks ? resident.puroks.name : 'No Purok'}</p>

          <form action="/api/admin/resident/upload-photo/${resident.id}" method="POST" enctype="multipart/form-data" class="mt-3">
            <label class="form-label small fw-bold">Update Resident Photo</label>
            <input type="file" name="photo" class="form-control form-control-sm mb-2" accept="image/*" required>
            <button type="submit" class="btn btn-sm btn-primary-custom w-100 text-white">Upload & Save Photo</button>
          </form>
        </div>
      </div>

      <div class="col-md-8">
        <div class="card card-custom p-4">
          <h5 class="fw-bold text-primary-blue mb-3">Official Record Information</h5>
          <div class="row g-3">
            <div class="col-6"><strong>Date of Birth:</strong> ${resident.date_of_birth}</div>
            <div class="col-6"><strong>Gender:</strong> ${resident.gender}</div>
            <div class="col-6"><strong>Civil Status:</strong> ${resident.civil_status}</div>
            <div class="col-6"><strong>Occupation:</strong> ${resident.occupation || 'N/A'}</div>
            <div class="col-6"><strong>Contact:</strong> ${resident.contact_number}</div>
            <div class="col-6"><strong>Email:</strong> ${resident.email || 'N/A'}</div>
            <div class="col-12"><strong>Address:</strong> ${resident.address}</div>
            <div class="col-4"><strong>Senior Citizen:</strong> ${resident.is_senior_citizen ? 'Yes' : 'No'}</div>
            <div class="col-4"><strong>PWD:</strong> ${resident.is_pwd ? 'Yes' : 'No'}</div>
            <div class="col-4"><strong>Solo Parent:</strong> ${resident.is_solo_parent ? 'Yes' : 'No'}</div>
          </div>

          <hr class="my-4">
          <h6 class="fw-bold text-accent-green mb-2">Issued Certificates History</h6>
          <ul class="list-group list-group-flush mb-3">
            ${(certs || []).map(c => `<li class="list-group-item d-flex justify-content-between"><span>${c.certificate_type} (${c.request_number})</span> <span class="badge bg-primary-blue text-white">${c.status}</span></li>`).join('') || '<li class="list-group-item text-muted">No certificate history.</li>'}
          </ul>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'residents', html, settings));
});

app.post('/api/admin/resident/upload-photo/:id', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No photo uploaded.');
    const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    await supabase.from('residents').update({ photo_url: base64Data }).eq('id', req.params.id);
    await logActivity(req.user.id, 'Update Resident Photo', `Updated photo for resident ID ${req.params.id}`);
    res.redirect(`/admin/resident/view/${req.params.id}`);
  } catch (err) {
    res.status(500).send('Error uploading photo: ' + err.message);
  }
});

// ==========================================
// ROUTE 5: PUROK MANAGEMENT
// ==========================================
app.get('/admin/puroks', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: puroks } = await supabase.from('puroks').select('*');
  const { data: residents } = await supabase.from('residents').select('purok_id').eq('resident_status', 'Active');

  const purokCounts = {};
  (residents || []).forEach(r => {
    if (r.purok_id) purokCounts[r.purok_id] = (purokCounts[r.purok_id] || 0) + 1;
  });

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-geo-alt me-2"></i>Purok Directory & Demographics</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#addPurokModal"><i class="bi bi-plus-circle me-1"></i> Add New Purok</button>
      </div>

      <div class="row g-3 mt-2">
        ${(puroks || []).map(p => `
          <div class="col-md-4">
            <div class="card card-custom p-3 border-top border-4 border-primary">
              <h5 class="fw-bold text-primary-blue">${p.name}</h5>
              <p class="text-muted small mb-2">${p.description || 'Barangay Territorial Zone'}</p>
              <div class="d-flex justify-content-between align-items-center bg-light-green p-2 rounded">
                <span class="fw-bold">Active Residents:</span>
                <span class="badge bg-accent-green fs-6 text-white">${purokCounts[p.id] || 0}</span>
              </div>
            </div>
          </div>
        `).join('') || '<div class="col-12 text-center text-muted">No purok records available.</div>'}
      </div>
    </div>

    <!-- Modal Add Purok -->
    <div class="modal fade" id="addPurokModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/admin/purok/add" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">Add Purok Zone</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3"><label class="form-label">Purok Name *</label><input type="text" name="name" class="form-control" required placeholder="e.g. Purok 4"></div>
              <div class="mb-3"><label class="form-label">Description</label><textarea name="description" class="form-control"></textarea></div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">Save Purok</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'puroks', html, settings));
});

app.post('/api/admin/purok/add', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const { name, description } = req.body;
  await supabase.from('puroks').insert([{ name, description }]);
  res.redirect('/admin/puroks');
});

// ==========================================
// ROUTE 6: HOUSEHOLD MANAGEMENT
// ==========================================
app.get('/admin/households', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: households } = await supabase.from('households').select('*, puroks(name)');
  const { data: puroks } = await supabase.from('puroks').select('*');

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-house-door me-2"></i>Household Records</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#addHouseholdModal"><i class="bi bi-plus-lg me-1"></i> Register Household</button>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Household No</th>
              <th>Head of Household</th>
              <th>Purok Zone</th>
              <th>Address</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${(households || []).map(h => `
              <tr>
                <td class="fw-bold text-primary-blue">${h.household_number}</td>
                <td class="fw-semibold">${h.head_resident_name}</td>
                <td>${h.puroks ? h.puroks.name : '-'}</td>
                <td>${h.address}</td>
                <td><span class="badge bg-success">${h.status}</span></td>
              </tr>
            `).join('') || '<tr><td colspan="5" class="text-center py-4 text-muted">No household records registered.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Add Household -->
    <div class="modal fade" id="addHouseholdModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/admin/household/add" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">Register New Household</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3"><label class="form-label">Head of Household Name *</label><input type="text" name="head_resident_name" class="form-control" required></div>
              <div class="mb-3">
                <label class="form-label">Purok Zone *</label>
                <select name="purok_id" class="form-select">${(puroks || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
              </div>
              <div class="mb-3"><label class="form-label">Address *</label><input type="text" name="address" class="form-control" required></div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">Save Household</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'households', html, settings));
});

app.post('/api/admin/household/add', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary']), async (req, res) => {
  const { head_resident_name, purok_id, address } = req.body;
  const household_number = `HH-${Date.now().toString().slice(-6)}`;
  await supabase.from('households').insert([{ household_number, head_resident_name, purok_id, address }]);
  res.redirect('/admin/households');
});

// ==========================================
// ROUTE 7: CERTIFICATE APPROVAL & ISSUANCE
// ==========================================
app.get('/admin/certificates', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: certs } = await supabase.from('certificate_requests').select('*, residents(first_name, last_name, resident_number)').order('created_at', { ascending: false });

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-file-earmark-text me-2"></i>Certificate Request & Issuance Operations</h4>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Request No</th>
              <th>Resident</th>
              <th>Certificate Type</th>
              <th>Purpose</th>
              <th>Status</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${(certs || []).map(c => `
              <tr>
                <td class="fw-bold text-primary-blue">${c.request_number}</td>
                <td>${c.residents ? `${c.residents.first_name} ${c.residents.last_name}` : 'Unknown'}</td>
                <td><span class="badge bg-light text-dark border">${c.certificate_type}</span></td>
                <td>${c.purpose}</td>
                <td>
                  <span class="badge ${c.status === 'RELEASED' ? 'bg-success' : (c.status === 'READY_FOR_RELEASE' ? 'bg-accent-green text-white' : 'bg-warning text-dark')}">
                    ${c.status}
                  </span>
                </td>
                <td class="text-end">
                  ${c.status === 'SUBMITTED' ? `
                    <a href="/api/admin/certificate/update/${c.id}?status=READY_FOR_RELEASE" class="btn btn-sm btn-accent-custom text-white"><i class="bi bi-check-circle"></i> Mark Ready</a>
                  ` : ''}
                  ${c.status === 'READY_FOR_RELEASE' ? `
                    <a href="/api/admin/certificate/update/${c.id}?status=RELEASED" class="btn btn-sm btn-primary-custom text-white"><i class="bi bi-box-arrow-up-right"></i> Release Document</a>
                  ` : ''}
                </td>
              </tr>
            `).join('') || '<tr><td colspan="6" class="text-center py-4 text-muted">No certificate requests submitted.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'certificates', html, settings));
});

app.get('/api/admin/certificate/update/:id', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const { status } = req.query;
  await supabase.from('certificate_requests').update({ status, updated_at: new Date() }).eq('id', req.params.id);
  res.redirect('/admin/certificates');
});

// ==========================================
// ROUTE 8: BARANGAY ID GENERATOR (National ID format with "Barangay Id" and captain name below signature)
// ==========================================
app.get('/admin/id-generator', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: residents } = await supabase.from('residents').select('*, puroks(name)').eq('resident_status', 'Active');

  const residentCards = await Promise.all((residents || []).slice(0, 8).map(async (r) => {
    const qrDataUrl = await QRCode.toDataURL(r.qr_token || r.id, { margin: 0, width: 250 });
    return { ...r, qrDataUrl };
  }));

  const html = `
    <div class="card card-custom p-4 no-print">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-card-heading me-2"></i>Barangay Resident Card Generator</h4>
        <button class="btn btn-accent-custom fw-bold text-white" onclick="window.print()"><i class="bi bi-printer me-1"></i> Print Selected Grid (8 IDs)</button>
      </div>
      <p class="text-muted">Generate standard CR80 physical cards with optimized National ID format layout, functional QR codes, and seal images.</p>
    </div>

    <div class="mt-4">
      <div class="print-sheet-8">
        ${residentCards.map(r => `
          <div class="id-card-frame">
            <div class="id-card-header">
              ${settings.barangay_logo ? `<img src="${settings.barangay_logo}" class="id-header-logo">` : '<i class="bi bi-building fs-5"></i>'}
              <div class="text-center flex-grow-1 px-1" style="line-height:1.1;">
                <strong style="font-size: 7.5pt; display: block;" class="text-uppercase">${settings.barangay_name || 'BARANGAY CENTRAL'}</strong>
                <span style="font-size: 5.5pt; letter-spacing:0.5px;">Barangay Id</span>
              </div>
              <span class="badge bg-white text-dark px-1" style="font-size: 5pt; font-weight: 800;">VERIFIED</span>
            </div>

            <div class="id-card-body">
              <img src="${r.photo_url || 'https://via.placeholder.com/150'}" class="id-photo">
              <div class="id-details">
                <div class="text-primary-blue fw-bold" style="font-size: 8pt;">${r.resident_number}</div>
                <div class="fw-bold text-uppercase text-dark mt-1" style="font-size: 8.5pt;">${r.first_name} ${r.last_name}</div>
                <div class="text-muted mt-1">DOB: <strong>${r.date_of_birth}</strong></div>
                <div class="text-muted">Sex: <strong>${r.gender}</strong> | Civil: <strong>${r.civil_status || 'Single'}</strong></div>
                <div class="text-muted">Purok: <strong>${r.puroks ? r.puroks.name : '-'}</strong></div>
              </div>
              <img src="${r.qrDataUrl}" class="id-qr">
            </div>

            <div class="id-card-footer">
              <div style="font-size: 4.5pt; max-width:1.8in;" class="text-muted lh-1">
                If found, please return to Barangay Hall. Property of Barangay Administration.
              </div>
              <div class="text-center" style="min-width: 0.9in;">
                ${settings.captain_signature ? `<img src="${settings.captain_signature}" style="height:16px; object-fit:contain;"><br>` : ''}
                <span style="font-size: 5pt; border-top: 1px solid #333; display: block; font-weight: 600;">${settings.barangay_captain || 'Barangay Captain'}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'id-gen', html, settings));
});

// ==========================================
// ROUTE 9: QR SCANNER PAGE WITH CAMERA SCANNER
// ==========================================
app.get('/scanner', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();

  const html = `
    <div class="card card-custom p-4" style="max-width: 650px; margin: auto;">
      <div class="text-center mb-3">
        <i class="bi bi-qr-code-scan text-primary-blue fs-1"></i>
        <h4 class="fw-bold text-primary-blue mt-2">QR Code Official Scanner & Camera</h4>
        <p class="text-muted small">Verify resident authenticity using text input or device camera scanner.</p>
      </div>

      <!-- Live Camera Scanner Interface -->
      <div class="mb-4 text-center">
        <div id="reader" style="width: 100%; max-width: 450px; margin: auto; border-radius: 8px; overflow: hidden; border: 2px dashed #205493;"></div>
        <button type="button" id="startCameraBtn" class="btn btn-sm btn-accent-custom mt-2 text-white fw-bold"><i class="bi bi-camera-video me-1"></i> Open Camera Scanner</button>
      </div>

      <form action="/api/scanner/verify" method="POST" class="mb-4">
        <div class="input-group">
          <input type="text" id="qr_token" name="qr_token" class="form-control" placeholder="Scan or enter QR Verification Token..." required>
          <button type="submit" class="btn btn-primary-custom fw-bold text-white">Verify Record</button>
        </div>
      </form>

      <div id="scannerResult" class="p-3 border rounded bg-light-green text-center">
        <span class="text-muted"><i class="bi bi-info-circle me-1"></i> Ready for verification input.</span>
      </div>
    </div>

    <!-- Include Html5Qrcode Library for Camera Scanning -->
    <script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script>
    <script>
      document.getElementById('startCameraBtn').addEventListener('click', function() {
        const html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText, decodedResult) => {
            document.getElementById('qr_token').value = decodedText;
            html5QrCode.stop().then(() => {
              document.forms[0].submit();
            }).catch(err => { console.error("Failed to stop scanner.", err); });
          },
          (errorMessage) => {
            // Scanning in progress
          }
        ).catch(err => {
          alert("Unable to start camera stream. Please check camera permissions.");
        });
      });
    </script>
  `;

  res.send(renderAppLayout(req, 'qr-scanner', html, settings));
});

app.post('/api/scanner/verify', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const { qr_token } = req.body;
  const settings = await getSettings();

  const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('qr_token', qr_token).single();

  let resultHtml = '';
  if (resident) {
    const { data: cert } = await supabase.from('certificate_requests').select('*').eq('resident_id', resident.id).eq('status', 'READY_FOR_RELEASE').single();

    resultHtml = `
      <div class="card card-custom p-4 border-success">
        <div class="text-center mb-3">
          <span class="badge bg-success px-3 py-2 fs-6 text-white"><i class="bi bi-patch-check-fill me-1"></i> OFFICIAL RESIDENT VERIFIED</span>
        </div>
        <div class="row align-items-center">
          <div class="col-md-4 text-center">
            <img src="${resident.photo_url || 'https://via.placeholder.com/100'}" class="rounded-circle mb-2" style="width:90px; height:90px; object-fit:cover;">
            <h6 class="fw-bold m-0">${resident.first_name} ${resident.last_name}</h6>
            <small class="text-primary-blue fw-bold">${resident.resident_number}</small>
          </div>
          <div class="col-md-8">
            <p class="m-0"><strong>Address:</strong> ${resident.address}</p>
            <p class="m-0"><strong>Purok:</strong> ${resident.puroks ? resident.puroks.name : '-'}</p>
            <p class="m-0"><strong>Status:</strong> <span class="badge bg-success">${resident.resident_status}</span></p>

            ${cert ? `
              <div class="alert alert-warning mt-3 p-2">
                <small class="fw-bold d-block">CLAIMABLE DOCUMENT READY:</small>
                <span>${cert.certificate_type} (${cert.request_number})</span>
                <a href="/api/admin/certificate/update/${cert.id}?status=RELEASED" class="btn btn-sm btn-primary-custom d-block mt-2 text-white">Mark Document Released</a>
              </div>
            ` : '<p class="text-muted small mt-2">No pending certificates ready for release.</p>'}
          </div>
        </div>
        <div class="text-center mt-3">
          <a href="/scanner" class="btn btn-sm btn-outline-secondary">Scan Another Code</a>
        </div>
      </div>
    `;
  } else {
    resultHtml = `
      <div class="alert alert-danger text-center">
        <i class="bi bi-x-circle fs-3 d-block mb-2"></i>
        <strong>Verification Failed!</strong><br>
        No corresponding official resident or token record found in database.
      </div>
      <div class="text-center"><a href="/scanner" class="btn btn-sm btn-secondary">Try Again</a></div>
    `;
  }

  res.send(renderAppLayout(req, 'qr-scanner', resultHtml, settings));
});

// ==========================================
// ROUTE 10: SENIOR CITIZENS, PWD & SOLO PARENTS
// ==========================================
app.get('/admin/seniors', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: seniors } = await supabase.from('residents').select('*, puroks(name)').eq('is_senior_citizen', true).eq('resident_status', 'Active');

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-person-heart me-2"></i>Senior Citizens Sector Directory</h4>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Resident ID</th>
              <th>Full Name</th>
              <th>Age</th>
              <th>Purok Zone</th>
              <th>Contact Number</th>
            </tr>
          </thead>
          <tbody>
            ${(seniors || []).map(s => {
              const age = new Date().getFullYear() - new Date(s.date_of_birth).getFullYear();
              return `
                <tr>
                  <td class="fw-bold text-primary-blue">${s.resident_number}</td>
                  <td class="fw-semibold">${s.first_name}${s.last_name}</td>
                  <td><span class="badge bg-accent-green text-white">${age} yrs old</span></td>
                  <td>${s.puroks ? s.puroks.name : '-'}</td>
                  <td>${s.contact_number || '-'}</td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="5" class="text-center py-4 text-muted">No senior citizens registered.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'seniors', html, settings));
});

app.get('/admin/pwds', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: pwds } = await supabase.from('residents').select('*, puroks(name)').eq('is_pwd', true).eq('resident_status', 'Active');

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-universal-access me-2"></i>Persons with Disability (PWD) Directory</h4>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Resident ID</th>
              <th>Full Name</th>
              <th>Disability Details</th>
              <th>Purok Zone</th>
            </tr>
          </thead>
          <tbody>
            ${(pwds || []).map(p => `
              <tr>
                <td class="fw-bold text-primary-blue">${p.resident_number}</td>
                <td class="fw-semibold">${p.first_name}${p.last_name}</td>
                <td>${p.disability_details || 'Unspecified'}</td>
                <td>${p.puroks ? p.puroks.name : '-'}</td>
              </tr>
            `).join('') || '<tr><td colspan="4" class="text-center py-4 text-muted">No PWD records registered.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'pwds', html, settings));
});

app.get('/admin/solo-parents', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: parents } = await supabase.from('residents').select('*, puroks(name)').eq('is_solo_parent', true).eq('resident_status', 'Active');

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-person-badge me-2"></i>Solo Parents Directory</h4>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Resident ID</th>
              <th>Full Name</th>
              <th>Details</th>
              <th>Purok Zone</th>
            </tr>
          </thead>
          <tbody>
            ${(parents || []).map(p => `
              <tr>
                <td class="fw-bold text-primary-blue">${p.resident_number}</td>
                <td class="fw-semibold">${p.first_name}${p.last_name}</td>
                <td>${p.solo_parent_details || 'N/A'}</td>
                <td>${p.puroks ? p.puroks.name : '-'}</td>
              </tr>
            `).join('') || '<tr><td colspan="4" class="text-center py-4 text-muted">No solo parent records registered.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'soloparents', html, settings));
});

// ==========================================
// ROUTE 11: BLOTTER & COMPLAINTS (With Print capability)
// ==========================================
app.get('/admin/blotters', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: blotters } = await supabase.from('complaints').select('*').order('created_at', { ascending: false });

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-shield-exclamation me-2"></i>Barangay Blotter & Incident Records</h4>
        <div>
          <button class="btn btn-outline-primary fw-bold me-2 no-print" onclick="window.print()"><i class="bi bi-printer me-1"></i> Print Complaint Files</button>
          <button class="btn btn-accent-custom fw-bold text-white no-print" data-bs-toggle="modal" data-bs-target="#addBlotterModal"><i class="bi bi-plus-lg me-1"></i> File Incident Blotter</button>
        </div>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Case No</th>
              <th>Complainant</th>
              <th>Respondent</th>
              <th>Incident Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${(blotters || []).map(b => `
              <tr>
                <td class="fw-bold text-primary-blue">${b.case_number}</td>
                <td>${b.complainant_name}</td>
                <td>${b.respondent_name}</td>
                <td>${b.incident_date}</td>
                <td><span class="badge bg-warning text-dark">${b.status}</span></td>
              </tr>
            `).join('') || '<tr><td colspan="5" class="text-center py-4 text-muted">No blotter cases recorded.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Add Blotter -->
    <div class="modal fade" id="addBlotterModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <form action="/api/admin/blotter/add" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">File Incident / Blotter Report</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="row g-3">
                <div class="col-md-6"><label class="form-label">Complainant Name *</label><input type="text" name="complainant_name" class="form-control" required></div>
                <div class="col-md-6"><label class="form-label">Respondent Name *</label><input type="text" name="respondent_name" class="form-control" required></div>
                <div class="col-md-6"><label class="form-label">Incident Date *</label><input type="date" name="incident_date" class="form-control" required></div>
                <div class="col-md-6"><label class="form-label">Location *</label><input type="text" name="location" class="form-control" required></div>
                <div class="col-12"><label class="form-label">Description of Incident *</label><textarea name="description" class="form-control" rows="3" required></textarea></div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">File Incident Report</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'blotters', html, settings));
});

app.post('/api/admin/blotter/add', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary']), async (req, res) => {
  const { complainant_name, respondent_name, incident_date, location, description } = req.body;
  const case_number = `BLOT-${Date.now().toString().slice(-6)}`;
  await supabase.from('complaints').insert([{ case_number, complainant_name, respondent_name, incident_date, location, description, status: 'INVESTIGATION' }]);
  res.redirect('/admin/blotters');
});

// ==========================================
// ROUTE 12: ASSISTANCE REQUESTS
// ==========================================
app.get('/admin/assistance', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: requests } = await supabase.from('assistance_requests').select('*, residents(first_name, last_name)').order('created_at', { ascending: false });

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-hand-thumbs-up me-2"></i>Barangay Assistance Applications</h4>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Request No</th>
              <th>Resident</th>
              <th>Type</th>
              <th>Details</th>
              <th>Status</th>
              <th class="text-end">Action</th>
            </tr>
          </thead>
          <tbody>
            ${(requests || []).map(r => `
              <tr>
                <td class="fw-bold text-primary-blue">${r.request_number}</td>
                <td>${r.residents ? `${r.residents.first_name} ${r.residents.last_name}` : 'Unknown'}</td>
                <td><span class="badge bg-info text-dark">${r.assistance_type}</span></td>
                <td>${r.details}</td>
                <td><span class="badge bg-warning text-dark">${r.status}</span></td>
                <td class="text-end">
                  ${r.status === 'PENDING' ? `
                    <a href="/api/admin/assistance/approve/${r.id}" class="btn btn-sm btn-success">Approve</a>
                  ` : ''}
                </td>
              </tr>
            `).join('') || '<tr><td colspan="6" class="text-center py-4 text-muted">No assistance requests submitted.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'assistance', html, settings));
});

app.get('/api/admin/assistance/approve/:id', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  await supabase.from('assistance_requests').update({ status: 'APPROVED' }).eq('id', req.params.id);
  res.redirect('/admin/assistance');
});

// ==========================================
// ROUTE 13: APPOINTMENTS
// ==========================================
app.get('/admin/appointments', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: appointments } = await supabase.from('appointments').select('*, residents(first_name, last_name)').order('created_at', { ascending: false });

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-calendar-check me-2"></i>Resident Appointment Schedule</h4>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Appt No</th>
              <th>Resident</th>
              <th>Service</th>
              <th>Date & Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${(appointments || []).map(a => `
              <tr>
                <td class="fw-bold text-primary-blue">${a.appointment_number}</td>
                <td>${a.residents ? `${a.residents.first_name} ${a.residents.last_name}` : 'Unknown'}</td>
                <td>${a.service_requested}</td>
                <td>${a.appointment_date} at${a.appointment_time}</td>
                <td><span class="badge bg-primary text-white">${a.status}</span></td>
              </tr>
            `).join('') || '<tr><td colspan="5" class="text-center py-4 text-muted">No appointments scheduled.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'appointments', html, settings));
});

// ==========================================
// ROUTE 14: ANNOUNCEMENTS & EVENTS
// ==========================================
app.get('/admin/announcements', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary']), async (req, res) => {
  const settings = await getSettings();
  const { data: announcements } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-megaphone me-2"></i>Public Announcements</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#addAnnouncementModal"><i class="bi bi-plus-lg me-1"></i> Create Announcement</button>
      </div>

      <div class="row g-3">
        ${(announcements || []).map(a => `
          <div class="col-md-6">
            <div class="card card-custom p-3 border-start border-4 ${a.priority === 'Emergency' ? 'border-danger' : 'border-primary'}">
              <span class="badge ${a.priority === 'Emergency' ? 'bg-danger' : 'bg-primary'} w-auto ms-auto text-white">${a.priority}</span>
              <h5 class="fw-bold text-primary-blue mt-2">${a.title}</h5>
              <p class="text-muted small">${a.content}</p>
              <small class="text-secondary">${new Date(a.created_at).toLocaleDateString()}</small>
            </div>
          </div>
        `).join('') || '<div class="col-12 text-center text-muted">No announcements published.</div>'}
      </div>
    </div>

    <!-- Modal Add Announcement -->
    <div class="modal fade" id="addAnnouncementModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/admin/announcement/add" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">New Announcement</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3"><label class="form-label">Title *</label><input type="text" name="title" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Priority *</label><select name="priority" class="form-select"><option value="Normal">Normal</option><option value="Emergency">Emergency</option></select></div>
              <div class="mb-3"><label class="form-label">Content *</label><textarea name="content" class="form-control" rows="4" required></textarea></div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">Publish Announcement</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'announcements', html, settings));
});

app.post('/api/admin/announcement/add', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const { title, priority, content } = req.body;
  await supabase.from('announcements').insert([{ title, priority, content, created_by: req.user.id }]);
  res.redirect('/admin/announcements');
});

app.get('/admin/events', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary']), async (req, res) => {
  const settings = await getSettings();
  const { data: events } = await supabase.from('events').select('*').order('event_date', { ascending: true });

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-calendar-event me-2"></i>Community Events</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#addEventModal"><i class="bi bi-plus-lg me-1"></i> Add Event</button>
      </div>

      <div class="row g-3">
        ${(events || []).map(e => `
          <div class="col-md-4">
            <div class="card card-custom p-3 border-top border-4 border-success">
              <h5 class="fw-bold text-primary-blue">${e.event_name}</h5>
              <p class="text-muted small mb-1"><i class="bi bi-calendar3 me-1"></i> ${e.event_date} at${e.event_time}</p>
              <p class="text-muted small mb-2"><i class="bi bi-geo-alt me-1"></i> ${e.location}</p>
              <p class="small">${e.description}</p>
            </div>
          </div>
        `).join('') || '<div class="col-12 text-center text-muted">No scheduled events.</div>'}
      </div>
    </div>

    <!-- Modal Add Event -->
    <div class="modal fade" id="addEventModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/admin/event/add" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">Add Community Event</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3"><label class="form-label">Event Name *</label><input type="text" name="event_name" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Date *</label><input type="date" name="event_date" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Time *</label><input type="text" name="event_time" class="form-control" required placeholder="e.g. 9:00 AM"></div>
              <div class="mb-3"><label class="form-label">Location *</label><input type="text" name="location" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Description *</label><textarea name="description" class="form-control" rows="3" required></textarea></div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">Save Event</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'events', html, settings));
});

app.post('/api/admin/event/add', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const { event_name, event_date, event_time, location, description } = req.body;
  await supabase.from('events').insert([{ event_name, event_date, event_time, location, description }]);
  res.redirect('/admin/events');
});

// ==========================================
// ROUTE 15: BARANGAY OFFICIALS MANAGEMENT
// ==========================================
app.get('/admin/officials', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary']), async (req, res) => {
  const settings = await getSettings();
  const { data: officials } = await supabase.from('barangay_officials').select('*');

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-person-lines-fill me-2"></i>Barangay Council & Officials</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#addOfficialModal"><i class="bi bi-person-plus me-1"></i> Add Official</button>
      </div>

      <div class="row g-3">
        ${(officials || []).map(o => `
          <div class="col-md-3">
            <div class="card card-custom p-3 text-center h-100">
              <img src="${o.photo_url || 'https://via.placeholder.com/100'}" class="rounded-circle mx-auto mb-2" style="width:80px; height:80px; object-fit:cover; border: 3px solid #2ecc71;">
              <h6 class="fw-bold text-primary-blue m-0">${o.name}</h6>
              <span class="badge bg-accent-green mb-2 text-white">${o.position}</span>${o.signature_url ? `<img src="${o.signature_url}" class="d-block mx-auto mt-1" style="height:25px; object-fit:contain;">` : ''}
              
              <form action="/api/admin/official/upload-photo/${o.id}" method="POST" enctype="multipart/form-data" class="mt-2">
                <input type="file" name="photo" class="form-control form-control-sm mb-1" accept="image/*" required>
                <button type="submit" class="btn btn-sm btn-outline-primary w-100">Upload Photo</button>
              </form>

              <a href="/api/admin/official/delete/${o.id}" class="btn btn-sm btn-outline-danger w-100 mt-2" onclick="return confirm('Are you sure you want to delete this official?')"><i class="bi bi-trash me-1"></i> Delete Official</a>
            </div>
          </div>
        `).join('') || '<div class="col-12 text-center text-muted">No officials configured.</div>'}
      </div>
    </div>

    <!-- Modal Add Official -->
    <div class="modal fade" id="addOfficialModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/admin/official/add" method="POST" enctype="multipart/form-data">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">Add Barangay Official</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3"><label class="form-label">Full Name *</label><input type="text" name="name" class="form-control" required></div>
              <div class="mb-3">
                <label class="form-label">Position *</label>
                <select name="position" class="form-select" required>
                  <option value="Barangay Captain">Barangay Captain</option>
                  <option value="Barangay Kagawad">Barangay Kagawad</option>
                  <option value="Barangay Secretary">Barangay Secretary</option>
                  <option value="Barangay Treasurer">Barangay Treasurer</option>
                  <option value="SK Chairman">SK Chairman</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Official Picture</label>
                <input type="file" name="photo" class="form-control" accept="image/*">
              </div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">Save Official</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'officials', html, settings));
});

app.post('/api/admin/official/add', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), upload.single('photo'), async (req, res) => {
  const { name, position } = req.body;
  let photo_url = null;
  if (req.file) {
    photo_url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  }
  await supabase.from('barangay_officials').insert([{ name, position, photo_url }]);
  res.redirect('/admin/officials');
});

app.post('/api/admin/official/upload-photo/:id', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    await supabase.from('barangay_officials').update({ photo_url: base64Data }).eq('id', req.params.id);
    res.redirect('/admin/officials');
  } catch (err) {
    res.status(500).send('Error uploading official picture: ' + err.message);
  }
});

app.get('/api/admin/official/delete/:id', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  try {
    await supabase.from('barangay_officials').delete().eq('id', req.params.id);
    res.redirect('/admin/officials');
  } catch (err) {
    res.status(500).send('Error deleting official: ' + err.message);
  }
});

// ==========================================
// ROUTE 16: USER ACCOUNTS & PERMISSIONS (Updated Admin Account Name)
// ==========================================
app.get('/admin/users', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const settings = await getSettings();
  const { data: users } = await supabase.from('users').select('*');

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-person-gear me-2"></i>System Staff & Administrative Accounts</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#addUserModal"><i class="bi bi-person-plus me-1"></i> Create Staff Account</button>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Full Name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${(users || []).map(u => `
              <tr>
                <td class="fw-semibold">${u.full_name}</td>
                <td>${u.username}</td>
                <td>${u.email}</td>
                <td><span class="badge bg-primary-blue text-white">${u.role}</span></td>
                <td><span class="badge ${u.status === 'Active' ? 'bg-success' : 'bg-secondary'}">${u.status}</span></td>
                <td class="text-end">
                  ${u.status === 'Active' ? `
                    <a href="/api/admin/user/toggle/${u.id}?status=Disabled" class="btn btn-sm btn-outline-danger">Disable</a>
                  ` : `
                    <a href="/api/admin/user/toggle/${u.id}?status=Active" class="btn btn-sm btn-outline-success">Enable</a>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Add User -->
    <div class="modal fade" id="addUserModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/admin/user/add" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">Create System Account</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3"><label class="form-label">Full Name *</label><input type="text" name="full_name" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Username *</label><input type="text" name="username" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Email *</label><input type="email" name="email" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Password *</label><input type="password" name="password" class="form-control" required minlength="6"></div>
              <div class="mb-3">
                <label class="form-label">Role *</label>
                <select name="role" class="form-select" required>
                  <option value="Barangay Admin">Barangay Admin</option>
                  <option value="Barangay Secretary">Barangay Secretary</option>
                  <option value="Barangay Staff">Barangay Staff</option>
                </select>
              </div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">Create Account</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'users', html, settings));
});

app.post('/api/admin/user/add', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const { full_name, username, email, password, role } = req.body;
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);
  await supabase.from('users').insert([{ full_name, username, email, password_hash, role, status: 'Active' }]);
  res.redirect('/admin/users');
});

app.get('/api/admin/user/toggle/:id', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const { status } = req.query;
  await supabase.from('users').update({ status }).eq('id', req.params.id);
  res.redirect('/admin/users');
});

// ==========================================
// ROUTE 17: REPORTS & DEMOGRAPHICS
// ==========================================
app.get('/admin/reports', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();

  const [
    { count: totalRes },
    { count: maleCount },
    { count: femaleCount },
    { count: seniorCount }
  ] = await Promise.all([
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'Active'),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'Active').eq('gender', 'Male'),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'Active').eq('gender', 'Female'),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'Active').eq('is_senior_citizen', true)
  ]);

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-bar-chart-line me-2"></i>Barangay Demographic & Statistical Reports</h4>
        <button class="btn btn-outline-primary no-print" onclick="window.print()"><i class="bi bi-printer me-1"></i> Print Demographic Summary</button>
      </div>

      <div class="row g-3">
        <div class="col-md-3">
          <div class="p-3 bg-light-blue rounded text-center border">
            <h6 class="text-muted fw-bold">TOTAL POPULATION</h6>
            <h2 class="text-primary-blue fw-bold">${totalRes || 0}</h2>
          </div>
        </div>
        <div class="col-md-3">
          <div class="p-3 bg-light-green rounded text-center border">
            <h6 class="text-muted fw-bold">MALE RESIDENTS</h6>
            <h2 class="text-accent-green fw-bold">${maleCount || 0}</h2>
          </div>
        </div>
        <div class="col-md-3">
          <div class="p-3 bg-light-blue rounded text-center border">
            <h6 class="text-muted fw-bold">FEMALE RESIDENTS</h6>
            <h2 class="text-primary-blue fw-bold">${femaleCount || 0}</h2>
          </div>
        </div>
        <div class="col-md-3">
          <div class="p-3 bg-light-green rounded text-center border">
            <h6 class="text-muted fw-bold">SENIOR CITIZENS</h6>
            <h2 class="text-accent-green fw-bold">${seniorCount || 0}</h2>
          </div>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'reports', html, settings));
});

// ==========================================
// ROUTE 18: ACTIVITY LOGS
// ==========================================
app.get('/admin/activity-logs', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const settings = await getSettings();
  const { data: logs } = await supabase.from('user_activity_logs').select('*, users(full_name)').order('created_at', { ascending: false }).limit(50);

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-clock-history me-2"></i>System User Activity & Audit Logs</h4>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${(logs || []).map(l => `
              <tr>
                <td class="small text-muted">${new Date(l.created_at).toLocaleString()}</td>
                <td class="fw-semibold">${l.users ? l.users.full_name : 'System'}</td>
                <td><span class="badge bg-primary-blue text-white">${l.action}</span></td>
                <td class="small">${l.details || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'activity-logs', html, settings));
});

// ==========================================
// ROUTE 19: SYSTEM SETTINGS (Updated Emergency Number configuration & Admin Account Name)
// ==========================================
app.get('/admin/settings', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const settings = await getSettings();

  const html = `
    <div class="card card-custom p-4" style="max-width: 800px; margin: auto;">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-sliders me-2"></i>Barangay System Configuration</h4>

      <form action="/api/admin/settings/update" method="POST" enctype="multipart/form-data">
        <div class="mb-3">
          <label class="form-label">Barangay Name</label>
          <input type="text" name="barangay_name" class="form-control" value="${settings.barangay_name || ''}" required>
        </div>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label class="form-label">Municipality / City</label>
            <input type="text" name="municipality" class="form-control" value="${settings.municipality || ''}" required>
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">Province</label>
            <input type="text" name="province" class="form-control" value="${settings.province || ''}" required>
          </div>
        </div>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label class="form-label">Barangay Captain Name</label>
            <input type="text" name="barangay_captain" class="form-control" value="${settings.barangay_captain || ''}">
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">Emergency Hotline Number</label>
            <input type="text" name="contact_number" class="form-control" value="${settings.contact_number || ''}" placeholder="e.g. 09123456789 / 911" required>
          </div>
        </div>

        <h6 class="fw-bold text-accent-green mt-4 border-bottom pb-2">Branding Assets Upload</h6>
        <div class="mb-3">
          <label class="form-label">Barangay Logo</label>
          ${settings.barangay_logo ? `<img src="${settings.barangay_logo}" class="d-block mb-2 rounded-circle" style="width:60px; height:60px; object-fit:cover;">` : ''}
          <input type="file" name="logo" class="form-control" accept="image/*">
        </div>
        <div class="mb-3">
          <label class="form-label">Barangay Captain Digital Signature</label>
          ${settings.captain_signature ? `<img src="${settings.captain_signature}" class="d-block mb-2" style="height:35px; object-fit:contain;">` : ''}
          <input type="file" name="signature" class="form-control" accept="image/*">
        </div>

        <button type="submit" class="btn btn-primary-custom py-2 px-4 mt-3 fw-bold text-white">Save System Settings</button>
      </form>
    </div>
  `;

  res.send(renderAppLayout(req, 'settings', html, settings));
});

app.post('/api/admin/settings/update', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), upload.fields([{ name: 'logo' }, { name: 'signature' }]), async (req, res) => {
  const { barangay_name, municipality, province, barangay_captain, contact_number } = req.body;
  const settings = await getSettings();

  const updateData = { barangay_name, municipality, province, barangay_captain, contact_number, updated_at: new Date() };

  if (req.files && req.files['logo']) {
    const logoFile = req.files['logo'][0];
    updateData.barangay_logo = `data:${logoFile.mimetype};base64,${logoFile.buffer.toString('base64')}`;
  }

  if (req.files && req.files['signature']) {
    const sigFile = req.files['signature'][0];
    updateData.captain_signature = `data:${sigFile.mimetype};base64,${sigFile.buffer.toString('base64')}`;
  }

  await supabase.from('system_settings').update(updateData).eq('id', settings.id);
  res.redirect('/admin/settings');
});

// ==========================================
// ROUTE 20: RESIDENT PORTAL & PROFILE PICTURE SELF-UPDATE
// ==========================================
app.get('/resident/dashboard', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();
  const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('id', req.user.resident_id).single();
  const { data: announcements } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(3);

  const html = `
    <div class="row g-3 mb-4">
      <div class="col-md-12">
        <div class="card card-custom p-4 bg-primary-blue text-white">
          <h3 class="fw-bold m-0">Welcome back, ${resident ? resident.first_name : 'Resident'}!</h3>
          <p class="mb-0 opacity-75">Resident ID: ${resident ? resident.resident_number : 'BRGY-000000'}</p>
        </div>
      </div>
    </div>

    <div class="row g-3">
      <div class="col-md-8">
        <div class="card card-custom p-4 mb-3">
          <h5 class="fw-bold text-primary-blue mb-3"><i class="bi bi-bell me-2"></i>Latest Barangay Announcements</h5>
          ${(announcements || []).map(a => `
            <div class="border-bottom pb-2 mb-2">
              <h6 class="fw-bold m-0 text-dark">${a.title}</h6>
              <p class="small text-muted mb-1">${a.content}</p>
            </div>
          `).join('') || '<p class="text-muted">No active announcements.</p>'}
        </div>
      </div>

      <div class="col-md-4">
        <div class="card card-custom p-4 text-center">
          <h5 class="fw-bold text-primary-blue mb-3">My Digital Resident ID</h5>
          <img src="${resident.photo_url || 'https://via.placeholder.com/100'}" class="rounded-circle mx-auto mb-2" style="width:80px; height:80px; object-fit:cover; border: 2px solid #2ecc71;">
          <h6 class="fw-bold m-0">${resident.first_name} ${resident.last_name}</h6>
          <span class="text-primary-blue small fw-bold">${resident.resident_number}</span>
          <div class="mt-3">
            <a href="/resident/digital-id" class="btn btn-sm btn-accent-custom w-100 fw-bold text-white"><i class="bi bi-qr-code me-1"></i> View Full Digital ID</a>
            <a href="/resident/profile" class="btn btn-sm btn-outline-primary w-100 fw-bold mt-2"><i class="bi bi-camera me-1"></i> Change Picture</a>
          </div>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-dashboard', html, settings));
});

// Resident Profile & Picture Update
app.get('/resident/profile', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();
  const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('id', req.user.resident_id).single();

  const html = `
    <div class="card card-custom p-4" style="max-width: 720px; margin: auto;">
      <div class="text-center mb-4">
        <div class="position-relative d-inline-block">
          <img src="${resident.photo_url || 'https://via.placeholder.com/150'}" class="rounded-circle mx-auto mb-2" style="width: 135px; height: 135px; object-fit: cover; border: 4px solid #205493; box-shadow: 0 4px 10px rgba(0,0,0,0.15);">
          <button class="btn btn-sm btn-accent-custom rounded-circle position-absolute bottom-0 end-0 p-2 text-white" data-bs-toggle="modal" data-bs-target="#changePhotoModal" title="Change Photo">
            <i class="bi bi-camera-fill"></i>
          </button>
        </div>
        <h4 class="fw-bold text-primary-blue mt-2 m-0">${resident.first_name} ${resident.middle_name || ''} ${resident.last_name}</h4>
        <span class="badge bg-accent-green mt-1 text-white">${resident.resident_number}</span>
      </div>

      <div class="card p-3 mb-4 bg-light-green border">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <h6 class="fw-bold text-primary-blue m-0"><i class="bi bi-image me-1"></i> Update Your Profile Picture</h6>
            <small class="text-muted">Change or upload a new photograph for your digital resident ID and portal</small>
          </div>
          <button class="btn btn-sm btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#changePhotoModal"><i class="bi bi-upload me-1"></i> Upload Photo</button>
        </div>
      </div>

      <h5 class="fw-bold text-primary-blue mb-3"><i class="bi bi-person me-2"></i>My Resident Official Profile</h5>
      <div class="row g-3">
        <div class="col-6"><strong>Full Name:</strong> ${resident.first_name} ${resident.middle_name || ''} ${resident.last_name}</div>
        <div class="col-6"><strong>Resident ID:</strong> ${resident.resident_number}</div>
        <div class="col-6"><strong>Date of Birth:</strong> ${resident.date_of_birth}</div>
        <div class="col-6"><strong>Gender:</strong> ${resident.gender}</div>
        <div class="col-6"><strong>Civil Status:</strong> ${resident.civil_status}</div>
        <div class="col-6"><strong>Purok Zone:</strong> ${resident.puroks ? resident.puroks.name : '-'}</div>
        <div class="col-12"><strong>Address:</strong> ${resident.address}</div>
      </div>

      <hr class="my-4">
      <h6 class="fw-bold text-accent-green mb-2">Request Profile Correction</h6>
      <form action="/api/resident/request-profile-update" method="POST">
        <div class="mb-3">
          <label class="form-label">Describe Needed Changes / Corrections *</label>
          <textarea name="reason" class="form-control" rows="3" required placeholder="e.g. Correct address details or typo..."></textarea>
        </div>
        <button type="submit" class="btn btn-primary-custom text-white">Submit Correction Request</button>
      </form>
    </div>

    <!-- Modal: Upload Profile Photo -->
    <div class="modal fade" id="changePhotoModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/resident/upload-photo" method="POST" enctype="multipart/form-data">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold"><i class="bi bi-camera me-2"></i>Change Profile Picture</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label fw-semibold">Select Photo File (PNG, JPG, JPEG) *</label>
                <input type="file" name="photo" class="form-control" accept="image/*" required>
                <small class="text-muted d-block mt-1">Please select a clear front-facing photograph of yourself.</small>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-accent-custom fw-bold text-white"><i class="bi bi-upload me-1"></i> Upload New Picture</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-profile', html, settings));
});

// Resident Profile Photo Upload Handler
app.post('/api/resident/upload-photo', authenticateToken, requireRole(['Resident']), upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('<script>alert("Please select an image file to upload."); window.history.back();</script>');
    const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    await supabase.from('residents').update({ photo_url: base64Data }).eq('id', req.user.resident_id);
    await logActivity(req.user.id, 'Resident Photo Self-Update', `Resident updated their profile picture.`);
    res.redirect('/resident/profile');
  } catch (err) {
    console.error('Error uploading photo:', err);
    res.status(500).send('Error uploading photo: ' + err.message);
  }
});

app.post('/api/resident/request-profile-update', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const { reason } = req.body;
  await supabase.from('profile_change_requests').insert([{ resident_id: req.user.resident_id, requested_changes: {}, reason }]);
  res.redirect('/resident/profile');
});

// Resident Digital ID Display
app.get('/resident/digital-id', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();
  const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('id', req.user.resident_id).single();

  const qrDataUrl = await QRCode.toDataURL(resident.qr_token || resident.id, { margin: 0, width: 300 });

  const html = `
    <div class="text-center py-4">
      <h4 class="fw-bold text-primary-blue mb-3">Official Digital Resident ID</h4>

      <div class="id-card-frame shadow-lg text-start" style="width: 3.6in; height: 2.25in; border-width: 3px;">
        <div class="id-card-header">
          ${settings.barangay_logo ? `<img src="${settings.barangay_logo}" class="id-header-logo">` : '<i class="bi bi-building fs-5"></i>'}
          <div class="text-center flex-grow-1 px-1" style="line-height:1.1;">
            <strong style="font-size: 8pt; display: block;" class="text-uppercase">${settings.barangay_name || 'BARANGAY CENTRAL'}</strong>
            <span style="font-size: 6pt; letter-spacing:0.5px;">Barangay Id</span>
          </div>
          <span class="badge bg-white text-dark px-1" style="font-size: 5.5pt; font-weight: 800;">VERIFIED</span>
        </div>

        <div class="id-card-body">
          <img src="${resident.photo_url || 'https://via.placeholder.com/150'}" class="id-photo" style="width: 1.1in; height: 1.1in;">
          <div class="id-details">
            <div class="text-primary-blue fw-bold" style="font-size: 8.5pt;">${resident.resident_number}</div>
            <div class="fw-bold text-uppercase text-dark mt-1" style="font-size: 9pt;">${resident.first_name} ${resident.last_name}</div>
            <div class="text-muted mt-1">DOB: <strong>${resident.date_of_birth}</strong></div>
            <div class="text-muted">Sex: <strong>${resident.gender}</strong> | Civil: <strong>${resident.civil_status || 'Single'}</strong></div>
            <div class="text-muted">Purok: <strong>${resident.puroks ? resident.puroks.name : '-'}</strong></div>
          </div>
          <img src="${qrDataUrl}" class="id-qr" style="width: 1.1in; height: 1.1in;">
        </div>

        <div class="id-card-footer">
          <div style="font-size: 4.8pt; max-width:2.0in;" class="text-muted lh-1">
            If found, please return to Barangay Hall. Property of Barangay Administration.
          </div>
          <div class="text-center" style="min-width: 1.0in;">
            ${settings.captain_signature ? `<img src="${settings.captain_signature}" style="height:18px; object-fit:contain;"><br>` : ''}
            <span style="font-size: 5.5pt; border-top: 1px solid #333; display: block; font-weight: 600;">${settings.barangay_captain || 'Barangay Captain'}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-digital-id', html, settings));
});

// Resident Certificate Request
app.get('/resident/certificates', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();
  const { data: certs } = await supabase.from('certificate_requests').select('*').eq('resident_id', req.user.resident_id).order('created_at', { ascending: false });

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-file-earmark-plus me-2"></i>Request Official Barangay Certificates</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#reqCertModal"><i class="bi bi-plus-lg me-1"></i> New Request</button>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Request No</th>
              <th>Certificate Type</th>
              <th>Purpose</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${(certs || []).map(c => `
              <tr>
                <td class="fw-bold text-primary-blue">${c.request_number}</td>
                <td>${c.certificate_type}</td>
                <td>${c.purpose}</td>
                <td><span class="badge bg-warning text-dark">${c.status}</span></td>
              </tr>
            `).join('') || '<tr><td colspan="4" class="text-center py-4 text-muted">No document requests submitted.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Request Certificate -->
    <div class="modal fade" id="reqCertModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/resident/certificate/request" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">Apply for Barangay Document</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Certificate Type *</label>
                <select name="certificate_type" class="form-select" required>
                  <option value="Barangay Clearance">Barangay Clearance</option>
                  <option value="Certificate of Residency">Certificate of Residency</option>
                  <option value="Certificate of Indigency">Certificate of Indigency</option>
                  <option value="Certificate of Good Moral">Certificate of Good Moral</option>
                </select>
              </div>
              <div class="mb-3"><label class="form-label">Purpose *</label><input type="text" name="purpose" class="form-control" required placeholder="e.g. Employment, Scholarship, ID application"></div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">Submit Application</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-certificates', html, settings));
});

app.post('/api/resident/certificate/request', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const { certificate_type, purpose } = req.body;
  const request_number = `REQ-${Date.now().toString().slice(-6)}`;
  await supabase.from('certificate_requests').insert([{ request_number, resident_id: req.user.resident_id, certificate_type, purpose, status: 'SUBMITTED' }]);
  res.redirect('/resident/certificates');
});

// Resident Appointments
app.get('/resident/appointments', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();
  const { data: appts } = await supabase.from('appointments').select('*').eq('resident_id', req.user.resident_id);

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-calendar-plus me-2"></i>Book Barangay Office Appointment</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#bookApptModal"><i class="bi bi-plus-lg me-1"></i> Book Appointment</button>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Appt No</th>
              <th>Service</th>
              <th>Date & Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${(appts || []).map(a => `
              <tr>
                <td class="fw-bold text-primary-blue">${a.appointment_number}</td>
                <td>${a.service_requested}</td>
                <td>${a.appointment_date} at${a.appointment_time}</td>
                <td><span class="badge bg-primary text-white">${a.status}</span></td>
              </tr>
            `).join('') || '<tr><td colspan="4" class="text-center py-4 text-muted">No appointments booked.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Book Appointment -->
    <div class="modal fade" id="bookApptModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/resident/appointment/book" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">Book Office Visit</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3"><label class="form-label">Service Requested *</label><input type="text" name="service_requested" class="form-control" required placeholder="e.g. Consult Captain, Document Filing"></div>
              <div class="mb-3"><label class="form-label">Preferred Date *</label><input type="date" name="appointment_date" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Preferred Time *</label><input type="text" name="appointment_time" class="form-control" required placeholder="e.g. 10:00 AM"></div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">Submit Appointment</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-appointments', html, settings));
});

app.post('/api/resident/appointment/book', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const { service_requested, appointment_date, appointment_time } = req.body;
  const appointment_number = `APT-${Date.now().toString().slice(-6)}`;
  await supabase.from('appointments').insert([{ appointment_number, resident_id: req.user.resident_id, service_requested, appointment_date, appointment_time, status: 'PENDING' }]);
  res.redirect('/resident/appointments');
});

// Resident Complaints
app.get('/resident/complaints', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();

  const html = `
    <div class="card card-custom p-4" style="max-width: 600px; margin: auto;">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-exclamation-triangle me-2"></i>File Community Incident or Complaint</h4>
      <form action="/api/resident/complaint/submit" method="POST">
        <div class="mb-3"><label class="form-label">Respondent Name / Entity *</label><input type="text" name="respondent_name" class="form-control" required></div>
        <div class="mb-3"><label class="form-label">Incident Date *</label><input type="date" name="incident_date" class="form-control" required></div>
        <div class="mb-3"><label class="form-label">Incident Location *</label><input type="text" name="location" class="form-control" required></div>
        <div class="mb-3"><label class="form-label">Detailed Description *</label><textarea name="description" class="form-control" rows="4" required></textarea></div>
        <button type="submit" class="btn btn-accent-custom py-2 w-100 fw-bold text-white">Submit Confidential Complaint</button>
      </form>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-complaints', html, settings));
});

app.post('/api/resident/complaint/submit', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const { respondent_name, incident_date, location, description } = req.body;
  const { data: resData } = await supabase.from('residents').select('first_name, last_name').eq('id', req.user.resident_id).single();
  const case_number = `BLOT-${Date.now().toString().slice(-6)}`;

  await supabase.from('complaints').insert([{
    case_number, complainant_id: req.user.resident_id, complainant_name: `${resData.first_name} ${resData.last_name}`,
    respondent_name, incident_date, location, description, status: 'SUBMITTED'
  }]);

  res.redirect('/resident/dashboard');
});

// Resident Assistance Requests
app.get('/resident/assistance', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();

  const html = `
    <div class="card card-custom p-4" style="max-width: 600px; margin: auto;">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-heart-pulse me-2"></i>Apply for Barangay Aid & Assistance</h4>
      <form action="/api/resident/assistance/request" method="POST">
        <div class="mb-3">
          <label class="form-label">Assistance Type *</label>
          <select name="assistance_type" class="form-select" required>
            <option value="Financial Assistance">Financial Assistance</option>
            <option value="Medical Assistance">Medical Assistance</option>
            <option value="Educational Assistance">Educational Assistance</option>
            <option value="Food Assistance">Food Assistance</option>
            <option value="Emergency Assistance">Emergency Assistance</option>
          </select>
        </div>
        <div class="mb-3"><label class="form-label">Details / Reason *</label><textarea name="details" class="form-control" rows="3" required></textarea></div>
        <button type="submit" class="btn btn-primary-custom py-2 w-100 fw-bold text-white">Submit Application</button>
      </form>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-assistance', html, settings));
});

app.post('/api/resident/assistance/request', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const { assistance_type, details } = req.body;
  const request_number = `AID-${Date.now().toString().slice(-6)}`;
  await supabase.from('assistance_requests').insert([{ request_number, resident_id: req.user.resident_id, assistance_type, details, status: 'PENDING' }]);
  res.redirect('/resident/dashboard');
});

// Resident Announcements Display
app.get('/resident/announcements', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();
  const { data: announcements } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-bell me-2"></i>Barangay News & Bulletin</h4>
      <div class="row g-3">
        ${(announcements || []).map(a => `
          <div class="col-md-6">
            <div class="card card-custom p-3 border-start border-4 ${a.priority === 'Emergency' ? 'border-danger' : 'border-primary'}">
              <h5 class="fw-bold text-primary-blue">${a.title}</h5>
              <p class="text-muted small">${a.content}</p>
              <small class="text-secondary">${new Date(a.created_at).toLocaleDateString()}</small>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-announcements', html, settings));
});

// Resident Emergency Contacts
app.get('/resident/emergency-contacts', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-telephone me-2"></i>Emergency Hotline Directory</h4>
      <div class="row g-3">
        <div class="col-md-4">
          <div class="p-3 border rounded text-center bg-light-blue">
            <i class="bi bi-building fs-1 text-primary-blue"></i>
            <h5 class="fw-bold mt-2">Barangay Hall</h5>
            <p class="text-muted m-0">${settings.contact_number || '09123456789'}</p>
          </div>
        </div>
        <div class="col-md-4">
          <div class="p-3 border rounded text-center bg-light-green">
            <i class="bi bi-shield-fill fs-1 text-danger"></i>
            <h5 class="fw-bold mt-2">Police Station</h5>
            <p class="text-muted m-0">911 / (045) 123-4567</p>
          </div>
        </div>
        <div class="col-md-4">
          <div class="p-3 border rounded text-center bg-light-blue">
            <i class="bi bi-fire fs-1 text-warning"></i>
            <h5 class="fw-bold mt-2">Fire Department</h5>
            <p class="text-muted m-0">160 / (045) 765-4321</p>
          </div>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-contacts', html, settings));
});

// Resident Feedback
app.get('/resident/feedback', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();

  const html = `
    <div class="card card-custom p-4" style="max-width: 500px; margin: auto;">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-chat-left-text me-2"></i>Barangay Service Feedback</h4>
      <form action="/api/resident/feedback/submit" method="POST">
        <div class="mb-3">
          <label class="form-label">Service Evaluated *</label>
          <input type="text" name="service_type" class="form-control" required placeholder="e.g. Document Request, Captain Consultation">
        </div>
        <div class="mb-3">
          <label class="form-label">Rating (1 to 5 Stars) *</label>
          <select name="rating" class="form-select" required>
            <option value="5">5 Stars - Excellent</option>
            <option value="4">4 Stars - Very Good</option>
            <option value="3">3 Stars - Satisfactory</option>
            <option value="2">2 Stars - Poor</option>
            <option value="1">1 Star - Very Poor</option>
          </select>
        </div>
        <div class="mb-3"><label class="form-label">Comments *</label><textarea name="comments" class="form-control" rows="3" required></textarea></div>
        <button type="submit" class="btn btn-primary-custom py-2 w-100 fw-bold text-white">Submit Feedback</button>
      </form>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-feedback', html, settings));
});

app.post('/api/resident/feedback/submit', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const { service_type, rating, comments } = req.body;
  await supabase.from('feedback').insert([{ resident_id: req.user.resident_id, service_type, rating: parseInt(rating), comments }]);
  res.redirect('/resident/dashboard');
});

// ==========================================
// DEFAULT INDEX ROOT ROUTE
// ==========================================
app.get('/', (req, res) => {
  res.redirect('/login');
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`[BARANGAY SYSTEM RUNNING] Listening on port ${PORT}`);
});
