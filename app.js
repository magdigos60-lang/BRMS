const express = require('express');
const session = require('express-session');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase Configuration from Environment Variables
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Middleware Setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'brgy-secret-key-2026-secure',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Configure multer for memory storage for file uploads (certificates, IDs, logos, supporting docs)
const upload = multer({ storage: multer.memoryStorage() });

async function logActivity(req, action, recordInfo) {
  try {
    const user = req.session.user ? (req.session.user.username || req.session.user.email) : 'Guest';
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0];
    
    await supabase.from('activity_logs').insert([{
      user_identifier: user,
      action: action,
      record_info: recordInfo || '',
      date: dateStr,
      time: timeStr
    }]);
  } catch (err) {
    console.error('Failed to log activity:', err.message);
  }
}

async function createNotification(userId, title, message, type = 'general') {
  try {
    await supabase.from('notifications').insert([{
      user_id: userId,
      title: title,
      message: message,
      type: type,
      is_read: false,
      created_at: new Date().toISOString()
    }]);
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function requireStaff(req, res, next) {
  if (!req.session.user || req.session.user.role === 'Resident') {
    return res.status(403).send(renderErrorPage('Access Denied', 'You do not have staff permissions to view this page.'));
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'Administrator') {
    return res.status(403).send(renderErrorPage('Access Denied', 'Administrator privileges are required for this section.'));
  }
  next();
}

// Helper to get barangay settings
async function getBarangaySettings() {
  try {
    const { data, error } = await supabase.from('barangay_settings').select('*').limit(1).single();
    if (error || !data) {
      return {
        barangay_name: 'Barangay San Jose',
        municipality: 'Sample Municipality',
        province: 'Sample Province',
        address: '123 Barangay Hall St.',
        contact_number: '09123456789',
        email: 'info@brgysanjose.gov.ph',
        captain_name: 'Hon. Barangay Captain',
        secretary_name: 'Barangay Secretary',
        id_title: 'OFFICIAL RESIDENT ID',
        footer_text: 'Not valid without official dry seal.',
        logo_url: 'https://placehold.co/150x150/1e3a8a/ffffff?text=LOGO'
      };
    }
    return data;
  } catch (err) {
    return {
      barangay_name: 'Barangay San Jose',
      municipality: 'Sample Municipality',
      province: 'Sample Province',
      address: '123 Barangay Hall St.',
      contact_number: '09123456789',
      email: 'info@brgysanjose.gov.ph',
      captain_name: 'Hon. Barangay Captain',
      secretary_name: 'Barangay Secretary',
      id_title: 'OFFICIAL RESIDENT ID',
      footer_text: 'Not valid without official dry seal.',
      logo_url: 'https://placehold.co/150x150/1e3a8a/ffffff?text=LOGO'
    };
  }
}

function renderErrorPage(title, message) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - Barangay Management System</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100 flex items-center justify-center h-screen">
      <div class="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
        <div class="text-red-600 text-5xl mb-4 font-bold">⚠️</div>
        <h1 class="text-2xl font-bold text-gray-800 mb-2">${title}</h1>
        <p class="text-gray-600 mb-6">${message}</p>
        <a href="/" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition">Return Home</a>
      </div>
    </body>
    </html>
  `;
}

// Core Master Layout for Staff & Resident Portals
function renderLayout(title, user, activeMenu, contentHtml, extraScripts = '') {
  const roleBadgeColor = user.role === 'Administrator' ? 'bg-purple-600' : user.role === 'Secretary' ? 'bg-indigo-600' : user.role === 'Staff' ? 'bg-blue-600' : 'bg-emerald-600';
  const isStaff = user.role !== 'Resident';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - Barangay Resident Management System</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
        }
      </style>
    </head>
    <body class="bg-gray-50 text-gray-900 antialiased">
      <div class="flex h-screen overflow-hidden">
        <!-- Sidebar -->
        <aside class="w-64 bg-slate-900 text-slate-300 flex flex-col no-print shadow-xl">
          <div class="p-5 border-b border-slate-800 flex items-center space-x-3">
            <div class="bg-blue-600 text-white p-2 rounded-lg font-bold text-lg"><i class="fa-solid fa-landmark"></i></div>
            <div>
              <h1 class="text-white font-bold text-base leading-tight">Barangay RMS</h1>
              <span class="text-xs text-slate-400">Management Portal</span>
            </div>
          </div>
          
          <div class="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            <div class="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Navigation</div>
            
            ${isStaff ? `
              <a href="/staff/dashboard" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'dashboard' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-chart-pie w-5"></i><span>Dashboard</span></a>
              <a href="/staff/residents" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'residents' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-users w-5"></i><span>Residents</span></a>
              <a href="/staff/archived-residents" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'archived' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-user-slash w-5"></i><span>Archived Residents</span></a>
              <a href="/staff/applications" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'applications' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-user-check w-5"></i><span>Registration Approvals</span></a>
              <a href="/staff/households" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'households' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-house-chimney w-5"></i><span>Households</span></a>
              <a href="/staff/puroks" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'puroks' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-map-location-dot w-5"></i><span>Puroks</span></a>
              <a href="/staff/certificates" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'certificates' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-file-invoice w-5"></i><span>Certificates</span></a>
              <a href="/staff/blotter" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'blotter' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-scale-balanced w-5"></i><span>Blotter Cases</span></a>
              <a href="/staff/appointments" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'appointments' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-calendar-days w-5"></i><span>Appointments</span></a>
              <a href="/staff/assistance" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'assistance' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-hand-holding-heart w-5"></i><span>Assistance</span></a>
              <a href="/staff/businesses" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'businesses' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-store w-5"></i><span>Businesses</span></a>
              <a href="/staff/announcements" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'announcements' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-bullhorn w-5"></i><span>Announcements</span></a>
              <a href="/staff/complaints" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'complaints' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-comments w-5"></i><span>Concerns/Complaints</span></a>
              <a href="/staff/reports" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'reports' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-file-excel w-5"></i><span>Reports</span></a>
              <a href="/staff/activity-logs" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'logs' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-clock-rotate-left w-5"></i><span>Activity Logs</span></a>
              ${user.role === 'Administrator' ? `
                <a href="/staff/staff-management" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'staff' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-user-shield w-5"></i><span>Staff Accounts</span></a>
                <a href="/staff/settings" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'settings' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-gear w-5"></i><span>Barangay Settings</span></a>
              ` : ''}
            ` : `
              <a href="/resident/dashboard" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'dashboard' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-house w-5"></i><span>Dashboard</span></a>
              <a href="/resident/profile" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'profile' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-user w-5"></i><span>My Profile</span></a>
              <a href="/resident/digital-id" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'digital-id' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-id-card w-5"></i><span>My Digital ID</span></a>
              <a href="/resident/certificates" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'certificates' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-file-lines w-5"></i><span>Certificate Requests</span></a>
              <a href="/resident/appointments" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'appointments' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-calendar-check w-5"></i><span>Appointments</span></a>
              <a href="/resident/assistance" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'assistance' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-hands-holding-child w-5"></i><span>Assistance Requests</span></a>
              <a href="/resident/complaints" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'complaints' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-circle-exclamation w-5"></i><span>File Concern</span></a>
              <a href="/resident/announcements" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeMenu === 'announcements' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'} transition"><i class="fa-solid fa-bullhorn w-5"></i><span>Announcements</span></a>
            `}
          </div>

          <div class="p-4 border-t border-slate-800">
            <a href="/logout" class="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-slate-800 transition"><i class="fa-solid fa-right-from-bracket w-5"></i><span>Sign Out</span></a>
          </div>
        </aside>

        <!-- Main Content Area -->
        <div class="flex-1 flex flex-col overflow-hidden">
          <!-- Top Header -->
          <header class="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 no-print z-10 shadow-sm">
            <div class="flex items-center space-x-4">
              <h2 class="text-xl font-bold text-gray-800">${title}</h2>
            </div>
            <div class="flex items-center space-x-4">
              <div class="flex items-center space-x-2">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${roleBadgeColor}">
                  ${user.role || 'Resident'}
                </span>
                <span class="text-sm font-medium text-gray-700">${user.username || user.email || 'User'}</span>
              </div>
            </div>
          </header>

          <!-- Scrollable Body Content -->
          <main class="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-6">
            ${contentHtml}
          </main>
        </div>
      </div>
      ${extraScripts}
    </body>
    </html>
  `;
}

async function initializeDatabase() {
  try {
    console.log('Verifying Supabase tables and default administrator account...');
    
    // 1. Check if admin user exists in staff_users table
    const { data: adminCheck, error: adminErr } = await supabase
      .from('staff_users')
      .select('*')
      .eq('username', 'admin')
      .maybeSingle();

    if (!adminCheck) {
      console.log('Seeding default administrator account (Username: admin, Password: Admin@12345)...');
      await supabase.from('staff_users').insert([{
        username: 'admin',
        password: 'Admin@12345',
        full_name: 'System Administrator',
        role: 'Administrator',
        email: 'admin@barangay.gov.ph',
        status: 'Active',
        created_at: new Date().toISOString()
      }]);
    }

    // 2. Check if default barangay settings exist
    const { data: settingsCheck } = await supabase
      .from('barangay_settings')
      .select('*')
      .maybeSingle();

    if (!settingsCheck) {
      console.log('Seeding default barangay settings...');
      await supabase.from('barangay_settings').insert([{
        barangay_name: 'Barangay San Jose',
        municipality: 'Sample Municipality',
        province: 'Sample Province',
        address: '123 Main Street, Barangay San Jose',
        contact_number: '09123456789',
        email: 'contact@brgysanjose.gov.ph',
        captain_name: 'Hon. Juan M. Capitan',
        secretary_name: 'Maria A. Sekretarya',
        id_title: 'OFFICIAL BARANGAY RESIDENT ID',
        footer_text: 'This card is government property. If found, please return to Barangay Hall.',
        logo_url: 'https://placehold.co/150x150/1e3a8a/ffffff?text=BRGY'
      }]);
    }

    console.log('Database initialization check completed successfully.');
  } catch (err) {
    console.error('Database initialization warning (ensure Supabase credentials are correct):', err.message);
  }
}

app.get('/', (req, res) => {
  if (req.session.user) {
    if (req.session.user.role === 'Resident') {
      return res.redirect('/resident/dashboard');
    } else {
      return res.redirect('/staff/dashboard');
    }
  }
  res.redirect('/login');
});

app.get('/login', async (req, res) => {
  const settings = await getBarangaySettings();
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Login - ${settings.barangay_name}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    </head>
    <body class="bg-gradient-to-br from-blue-900 via-slate-900 to-indigo-950 min-h-screen flex items-center justify-center p-4">
      <div class="bg-white/95 backdrop-blur rounded-2xl shadow-2xl max-w-md w-full p-8 border border-white/20">
        <div class="text-center mb-8">
          <img src="${settings.logo_url}" alt="Logo" class="w-20 h-20 mx-auto rounded-full shadow-md object-cover mb-3 border-2 border-blue-600" onerror="this.src='https://placehold.co/150x150/1e3a8a/ffffff?text=BRGY'">
          <h1 class="text-2xl font-bold text-gray-800">${settings.barangay_name}</h1>
          <p class="text-sm text-gray-500">Resident Management & Portal System</p>
        </div>

        ${req.query.error ? `<div class="mb-4 p-3 bg-red-100 border-l-4 border-red-500 text-red-700 text-sm rounded">${req.query.error}</div>` : ''}
        ${req.query.success ? `<div class="mb-4 p-3 bg-green-100 border-l-4 border-green-500 text-green-700 text-sm rounded">${req.query.success}</div>` : ''}

        <form action="/login" method="POST" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Username or Email</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400"><i class="fa-solid fa-user"></i></span>
              <input type="text" name="identifier" required class="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none text-sm" placeholder="Username / Email">
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400"><i class="fa-solid fa-lock"></i></span>
              <input type="password" name="password" required class="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none text-sm" placeholder="••••••••">
            </div>
          </div>
          <button type="submit" class="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition shadow-lg shadow-blue-600/30">Sign In</button>
        </form>

        <div class="mt-6 pt-6 border-t border-gray-200 text-center space-y-3">
          <p class="text-sm text-gray-600">New resident? <a href="/register" class="text-blue-600 font-semibold hover:underline">Register here</a></p>
          <div class="bg-blue-50 p-3 rounded-lg text-xs text-blue-800 text-left border border-blue-200">
            <strong>Default Administrator Credentials:</strong><br>
            Username: <code class="bg-white px-1 rounded font-bold">admin</code><br>
            Password: <code class="bg-white px-1 rounded font-bold">Admin@12345</code>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  try {
    // 1. Check staff table first
    const { data: staffData } = await supabase
      .from('staff_users')
      .select('*')
      .or(`username.eq.${identifier},email.eq.${identifier}`)
      .maybeSingle();

    if (staffData) {
      if (staffData.status !== 'Active') {
        return res.redirect('/login?error=Your staff account has been disabled.');
      }
      if (staffData.password === password) {
        req.session.user = {
          id: staffData.id,
          username: staffData.username,
          email: staffData.email,
          role: staffData.role,
          name: staffData.full_name
        };
        await logActivity(req, 'Login', `Staff/Admin login: ${staffData.username}`);
        return res.redirect('/staff/dashboard');
      }
    }

    // 2. Check approved resident table
    const { data: residentData } = await supabase
      .from('residents')
      .select('*')
      .eq('email', identifier)
      .maybeSingle();

    if (residentData) {
      if (residentData.account_status !== 'Active') {
        return res.redirect('/login?error=Resident account is pending approval or inactive.');
      }
      if (residentData.password === password) {
        req.session.user = {
          id: residentData.id,
          username: residentData.email,
          email: residentData.email,
          role: 'Resident',
          name: `${residentData.first_name} ${residentData.last_name}`,
          resident_id: residentData.resident_id
        };
        await logActivity(req, 'Login', `Resident login: ${residentData.resident_id}`);
        return res.redirect('/resident/dashboard');
      }
    }

    return res.redirect('/login?error=Invalid username/email or password.');
  } catch (err) {
    console.error('Login error:', err);
    return res.redirect('/login?error=An error occurred during login.');
  }
});

app.get('/logout', async (req, res) => {
  await logActivity(req, 'Logout', 'User logged out');
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/register', async (req, res) => {
  const settings = await getBarangaySettings();
  
  // Fetch puroks for dropdown
  const { data: puroks } = await supabase.from('puroks').select('*');

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Resident Registration - ${settings.barangay_name}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    </head>
    <body class="bg-gray-100 min-h-screen py-10 px-4">
      <div class="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-8 border border-gray-200">
        <div class="text-center mb-8">
          <img src="${settings.logo_url}" alt="Logo" class="w-20 h-20 mx-auto rounded-full shadow-md object-cover mb-3 border-2 border-blue-600" onerror="this.src='https://placehold.co/150x150/1e3a8a/ffffff?text=BRGY'">
          <h1 class="text-2xl font-bold text-gray-800">${settings.barangay_name}</h1>
          <p class="text-sm text-gray-500">Public Resident Registration Portal</p>
        </div>

        ${req.query.success ? `
          <div class="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg mb-6">
            <h3 class="font-bold text-green-800">Registration Submitted Successfully!</h3>
            <p class="text-sm text-green-700">Your registration application has been sent to barangay staff for review and approval. You will be able to log in once approved.</p>
            <div class="mt-4"><a href="/login" class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition">Go to Login</a></div>
          </div>
        ` : `
          <form action="/register" method="POST" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">First Name *</label>
                <input type="text" name="first_name" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none">
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Middle Name</label>
                <input type="text" name="middle_name" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none">
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Last Name *</label>
                <input type="text" name="last_name" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none">
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Suffix</label>
                <input type="text" name="suffix" placeholder="Jr., III" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none">
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Date of Birth *</label>
                <input type="date" name="date_of_birth" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none">
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Gender *</label>
                <select name="gender" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none">
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Civil Status *</label>
                <select name="civil_status" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none">
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Widowed">Widowed</option>
                  <option value="Separated">Separated</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Purok *</label>
                <select name="purok" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none">
                  <option value="">Select Purok</option>
                  ${(puroks || []).map(p => `<option value="${p.name}">${p.name}</option>`).join('')}
                  ${(!puroks || puroks.length === 0) ? '<option value="Purok 1">Purok 1</option><option value="Purok 2">Purok 2</option>' : ''}
                </select>
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Complete Address *</label>
              <input type="text" name="address" required placeholder="House No., Street, Purok/Barangay" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none">
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Contact Number *</label>
                <input type="text" name="contact_number" required placeholder="09XXXXXXXXX" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none">
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Email Address (Login ID) *</label>
                <input type="email" name="email" required placeholder="your.email@gmail.com" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none">
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Occupation</label>
                <input type="text" name="occupation" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none">
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Voter Status *</label>
                <select name="voter_status" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none">
                  <option value="Registered">Registered Voter</option>
                  <option value="Not Registered">Not Registered</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Resident Photo URL (Optional)</label>
                <input type="url" name="resident_photo" placeholder="https://example.com/photo.jpg" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none">
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Portal Password *</label>
                <input type="password" name="password" required placeholder="Create secure password" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none">
              </div>
            </div>

            <div class="pt-4">
              <button type="submit" class="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition shadow-lg shadow-blue-600/30">Submit Registration Application</button>
            </div>
            
            <div class="text-center pt-3">
              <a href="/login" class="text-sm text-blue-600 hover:underline">Already have an account? Sign In</a>
            </div>
          </form>
        `}
      </div>
    </body>
    </html>
  `);
});

app.post('/register', async (req, res) => {
  const {
    first_name, middle_name, last_name, suffix, date_of_birth, gender,
    civil_status, address, purok, contact_number, email, occupation,
    voter_status, resident_photo, password
  } = req.body;

  try {
    // Check if email already exists
    const { data: existingEmail } = await supabase.from('residents').select('id').eq('email', email).maybeSingle();
    const { data: existingApp } = await supabase.from('resident_applications').select('id').eq('email', email).maybeSingle();

    if (existingEmail || existingApp) {
      return res.redirect('/register?error=This email address is already registered.');
    }

    // Insert into resident_applications table
    const { error } = await supabase.from('resident_applications').insert([{
      first_name,
      middle_name: middle_name || '',
      last_name,
      suffix: suffix || '',
      date_of_birth,
      gender,
      civil_status,
      address,
      purok,
      contact_number,
      email,
      occupation: occupation || 'None',
      voter_status,
      resident_photo: resident_photo || 'https://placehold.co/150x150/e2e8f0/1e293b?text=PHOTO',
      password,
      status: 'Pending',
      created_at: new Date().toISOString()
    }]);

    if (error) {
      throw error;
    }

    return res.redirect('/register?success=1');
  } catch (err) {
    console.error('Registration error:', err);
    return res.redirect('/register?error=Failed to submit application. Please check input values.');
  }
});

app.get('/staff/dashboard', requireAuth, requireStaff, async (req, res) => {
  try {
    // Fetch statistics
    const { count: totalResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true });
    const { count: totalHouseholds } = await supabase.from('households').select('*', { count: 'exact', head: true });
    const { count: maleCount } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('gender', 'Male');
    const { count: femaleCount } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('gender', 'Female');
    const { count: seniorCount } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('senior_citizen_status', 'Yes');
    const { count: pwdCount } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('pwd_status', 'Yes');
    const { count: soloCount } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('solo_parent_status', 'Yes');
    const { count: voterCount } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('voter_status', 'Registered');
    const { count: pendingApps } = await supabase.from('resident_applications').select('*', { count: 'exact', head: true }).eq('status', 'Pending');
    const { count: pendingCerts } = await supabase.from('certificate_requests').select('*', { count: 'exact', head: true }).eq('status', 'Pending');
    const { count: pendingAppts } = await supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'Pending');
    const { count: pendingAsst } = await supabase.from('assistance_requests').select('*', { count: 'exact', head: true }).eq('status', 'Pending');

    // Recent activities
    const { data: recentLogs } = await supabase.from('activity_logs').select('*').order('id', { ascending: false }).limit(6);

    const content = `
      <div class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center justify-between">
            <div>
              <p class="text-xs font-bold uppercase text-gray-400">Total Residents</p>
              <h3 class="text-2xl font-bold text-gray-800 mt-1">${totalResidents || 0}</h3>
            </div>
            <div class="bg-blue-50 text-blue-600 p-3 rounded-lg text-xl"><i class="fa-solid fa-users"></i></div>
          </div>
          <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center justify-between">
            <div>
              <p class="text-xs font-bold uppercase text-gray-400">Households</p>
              <h3 class="text-2xl font-bold text-gray-800 mt-1">${totalHouseholds || 0}</h3>
            </div>
            <div class="bg-emerald-50 text-emerald-600 p-3 rounded-lg text-xl"><i class="fa-solid fa-house-chimney"></i></div>
          </div>
          <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center justify-between">
            <div>
              <p class="text-xs font-bold uppercase text-gray-400">Registered Voters</p>
              <h3 class="text-2xl font-bold text-gray-800 mt-1">${voterCount || 0}</h3>
            </div>
            <div class="bg-indigo-50 text-indigo-600 p-3 rounded-lg text-xl"><i class="fa-solid fa-check-to-slot"></i></div>
          </div>
          <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center justify-between">
            <div>
              <p class="text-xs font-bold uppercase text-gray-400">Senior Citizens</p>
              <h3 class="text-2xl font-bold text-gray-800 mt-1">${seniorCount || 0}</h3>
            </div>
            <div class="bg-amber-50 text-amber-600 p-3 rounded-lg text-xl"><i class="fa-solid fa-person-cane"></i></div>
          </div>
        </div>

        <!-- Pending Approvals Banner / Quick Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <a href="/staff/applications" class="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center justify-between hover:bg-amber-100 transition">
            <div>
              <span class="text-xs font-bold text-amber-800 uppercase">Pending Applications</span>
              <h4 class="text-xl font-bold text-amber-900">${pendingApps || 0}</h4>
            </div>
            <i class="fa-solid fa-user-clock text-amber-600 text-2xl"></i>
          </a>
          <a href="/staff/certificates" class="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-center justify-between hover:bg-blue-100 transition">
            <div>
              <span class="text-xs font-bold text-blue-800 uppercase">Cert. Requests</span>
              <h4 class="text-xl font-bold text-blue-900">${pendingCerts || 0}</h4>
            </div>
            <i class="fa-solid fa-file-invoice text-blue-600 text-2xl"></i>
          </a>
          <a href="/staff/appointments" class="bg-purple-50 border border-purple-200 p-4 rounded-xl flex items-center justify-between hover:bg-purple-100 transition">
            <div>
              <span class="text-xs font-bold text-purple-800 uppercase">Appointments</span>
              <h4 class="text-xl font-bold text-purple-900">${pendingAppts || 0}</h4>
            </div>
            <i class="fa-solid fa-calendar-day text-purple-600 text-2xl"></i>
          </a>
          <a href="/staff/assistance" class="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-center justify-between hover:bg-rose-100 transition">
            <div>
              <span class="text-xs font-bold text-rose-800 uppercase">Assistance Req.</span>
              <h4 class="text-xl font-bold text-rose-900">${pendingAsst || 0}</h4>
            </div>
            <i class="fa-solid fa-hand-holding-medical text-rose-600 text-2xl"></i>
          </a>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Demographics Summary Card -->
          <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200 lg:col-span-1">
            <h3 class="font-bold text-gray-800 mb-4 text-base"><i class="fa-solid fa-chart-pie mr-2 text-blue-600"></i>Demographics</h3>
            <div class="space-y-3">
              <div class="flex justify-between items-center text-sm"><span class="text-gray-600">Male Residents</span><span class="font-bold text-gray-800">${maleCount || 0}</span></div>
              <div class="flex justify-between items-center text-sm"><span class="text-gray-600">Female Residents</span><span class="font-bold text-gray-800">${femaleCount || 0}</span></div>
              <div class="flex justify-between items-center text-sm"><span class="text-gray-600">PWD Residents</span><span class="font-bold text-gray-800">${pwdCount || 0}</span></div>
              <div class="flex justify-between items-center text-sm"><span class="text-gray-600">Solo Parents</span><span class="font-bold text-gray-800">${soloCount || 0}</span></div>
            </div>
          </div>

          <!-- Recent Activity Logs -->
          <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200 lg:col-span-2">
            <h3 class="font-bold text-gray-800 mb-4 text-base"><i class="fa-solid fa-clock-rotate-left mr-2 text-blue-600"></i>Recent System Activity</h3>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="border-b border-gray-200 text-gray-500 text-xs">
                    <th class="pb-2">User</th>
                    <th class="pb-2">Action</th>
                    <th class="pb-2">Details</th>
                    <th class="pb-2">Timestamp</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  ${(recentLogs || []).map(l => `
                    <tr>
                      <td class="py-2.5 font-medium text-gray-800">${l.user_identifier}</td>
                      <td class="py-2.5"><span class="px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700">${l.action}</span></td>
                      <td class="py-2.5 text-gray-600">${l.record_info}</td>
                      <td class="py-2.5 text-gray-400 text-xs">${l.date} ${l.time}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
    res.send(renderLayout('Staff Dashboard', req.session.user, 'dashboard', content));
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).send(renderErrorPage('Dashboard Error', err.message));
  }
});

app.get('/staff/residents', requireAuth, requireStaff, async (req, res) => {
  const { search, purok, gender, status } = req.query;
  try {
    let query = supabase.from('residents').select('*').eq('is_archived', false).order('last_name', { ascending: true });

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,resident_id.ilike.%${search}%`);
    }
    if (purok) {
      query = query.eq('purok', purok);
    }
    if (gender) {
      query = query.eq('gender', gender);
    }

    const { data: residents, error } = await query;
    const { data: puroks } = await supabase.from('puroks').select('*');

    const content = `
      <div class="space-y-6">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <form method="GET" class="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <input type="text" name="search" value="${search || ''}" placeholder="Search name or ID..." class="px-3 py-2 border border-gray-300 rounded-lg text-sm w-full md:w-64 focus:ring-2 focus:ring-blue-600 focus:outline-none">
            <select name="purok" class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none">
              <option value="">All Puroks</option>
              ${(puroks || []).map(p => `<option value="${p.name}" ${purok === p.name ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
            <select name="gender" class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none">
              <option value="">All Genders</option>
              <option value="Male" ${gender === 'Male' ? 'selected' : ''}>Male</option>
              <option value="Female" ${gender === 'Female' ? 'selected' : ''}>Female</option>
            </select>
            <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition">Filter</button>
            <a href="/staff/residents" class="bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-gray-300 transition">Reset</a>
          </form>

          <button onclick="openAddResidentModal()" class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition flex items-center space-x-2">
            <i class="fa-solid fa-user-plus"></i><span>Add Resident</span>
          </button>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase">
                <tr>
                  <th class="p-3">Resident ID</th>
                  <th class="p-3">Name</th>
                  <th class="p-3">Gender / Age</th>
                  <th class="p-3">Purok / Address</th>
                  <th class="p-3">Contact</th>
                  <th class="p-3">Status</th>
                  <th class="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${(residents || []).map(r => `
                  <tr class="hover:bg-gray-50">
                    <td class="p-3 font-mono font-semibold text-blue-600">${r.resident_id}</td>
                    <td class="p-3 font-medium text-gray-800">${r.last_name}, ${r.first_name} ${r.middle_name || ''} ${r.suffix || ''}</td>
                    <td class="p-3 text-gray-600">${r.gender} • ${r.date_of_birth}</td>
                    <td class="p-3 text-gray-600">${r.purok} - ${r.address}</td>
                    <td class="p-3 text-gray-600">${r.contact_number}</td>
                    <td class="p-3"><span class="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700">${r.account_status}</span></td>
                    <td class="p-3 text-right space-x-2">
                      <a href="/staff/residents/view/${r.id}" class="text-blue-600 hover:text-blue-800" title="View Digital ID & Profile"><i class="fa-solid fa-id-card"></i></a>
                      <button onclick='openEditResidentModal(${JSON.stringify(r)})' class="text-indigo-600 hover:text-indigo-800" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
                      <form action="/staff/residents/archive/${r.id}" method="POST" class="inline" onsubmit="return confirm('Archive this resident?');">
                        <button type="submit" class="text-amber-600 hover:text-amber-800" title="Archive"><i class="fa-solid fa-box-archive"></i></button>
                      </form>
                      ${req.session.user.role === 'Administrator' ? `
                        <form action="/staff/residents/delete/${r.id}" method="POST" class="inline" onsubmit="return confirm('PERMANENTLY delete resident record?');">
                          <button type="submit" class="text-red-600 hover:text-red-800" title="Delete"><i class="fa-solid fa-trash"></i></button>
                        </form>
                      ` : ''}
                    </td>
                  </tr>
                `).join('')}
                ${(!residents || residents.length === 0) ? '<tr><td colspan="7" class="p-6 text-center text-gray-500">No active residents found.</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Add Resident Modal -->
      <div id="addResidentModal" class="fixed inset-0 bg-black/50 hidden flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
          <div class="flex justify-between items-center mb-4 border-b pb-3">
            <h3 class="font-bold text-lg text-gray-800">Add New Resident</h3>
            <button onclick="closeAddResidentModal()" class="text-gray-400 hover:text-gray-600"><i class="fa-solid fa-xmark text-xl"></i></button>
          </div>
          <form action="/staff/residents/add" method="POST" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">First Name *</label>
                <input type="text" name="first_name" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Middle Name</label>
                <input type="text" name="middle_name" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Last Name *</label>
                <input type="text" name="last_name" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Suffix</label>
                <input type="text" name="suffix" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Date of Birth *</label>
                <input type="date" name="date_of_birth" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Gender *</label>
                <select name="gender" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Civil Status *</label>
                <select name="civil_status" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Widowed">Widowed</option>
                  <option value="Separated">Separated</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Purok *</label>
                <select name="purok" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
                  ${(puroks || []).map(p => `<option value="${p.name}">${p.name}</option>`).join('')}
                </select>
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Complete Address *</label>
              <input type="text" name="address" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Contact Number *</label>
                <input type="text" name="contact_number" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Email Address *</label>
                <input type="email" name="email" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Voter Status</label>
                <select name="voter_status" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
                  <option value="Registered">Registered</option>
                  <option value="Not Registered">Not Registered</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Senior Citizen</label>
                <select name="senior_citizen_status" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">PWD Status</label>
                <select name="pwd_status" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
            </div>
            <div class="flex justify-end space-x-3 pt-4 border-t">
              <button type="button" onclick="closeAddResidentModal()" class="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button type="submit" class="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">Save Resident</button>
            </div>
          </form>
        </div>
      </div>

      <script>
        function openAddResidentModal() { document.getElementById('addResidentModal').classList.remove('hidden'); }
        function closeAddResidentModal() { document.getElementById('addResidentModal').classList.add('hidden'); }
        function openEditResidentModal(r) { alert('Edit modal for ' + r.first_name); }
      </script>
    `;
    res.send(renderLayout('Resident Management', req.session.user, 'residents', content));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/staff/residents/add', requireAuth, requireStaff, async (req, res) => {
  const body = req.body;
  try {
    // Generate unique resident ID e.g., BRGY-2026-000001
    const { count } = await supabase.from('residents').select('*', { count: 'exact', head: true });
    const seq = (count || 0) + 1;
    const residentId = `BRGY-2026-${String(seq).padStart(6, '0')}`;

    await supabase.from('residents').insert([{
      ...body,
      resident_id: residentId,
      account_status: 'Active',
      is_archived: false,
      resident_photo: body.resident_photo || 'https://placehold.co/150x150/e2e8f0/1e293b?text=PHOTO',
      password: body.password || 'Resident@123',
      created_at: new Date().toISOString()
    }]);

    await logActivity(req, 'Added resident', `Added resident ${residentId} (${body.first_name} ${body.last_name})`);
    res.redirect('/staff/residents');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error Adding Resident', err.message));
  }
});

app.post('/staff/residents/archive/:id', requireAuth, requireStaff, async (req, res) => {
  try {
    await supabase.from('residents').update({ is_archived: true, account_status: 'Archived' }).eq('id', req.params.id);
    await logActivity(req, 'Archived resident', `Archived resident ID ${req.params.id}`);
    res.redirect('/staff/residents');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/archived-residents', requireAuth, requireStaff, async (req, res) => {
  try {
    const { data: archived } = await supabase.from('residents').select('*').eq('is_archived', true);
    const content = `
      <div class="space-y-6">
        <h3 class="text-lg font-bold text-gray-800">Archived Residents</h3>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase">
              <tr>
                <th class="p-3">Resident ID</th>
                <th class="p-3">Name</th>
                <th class="p-3">Purok</th>
                <th class="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${(archived || []).map(r => `
                <tr>
                  <td class="p-3 font-mono text-blue-600">${r.resident_id}</td>
                  <td class="p-3 font-medium text-gray-800">${r.last_name}, ${r.first_name}</td>
                  <td class="p-3 text-gray-600">${r.purok}</td>
                  <td class="p-3 text-right">
                    <form action="/staff/residents/restore/${r.id}" method="POST" class="inline">
                      <button type="submit" class="bg-emerald-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-emerald-700">Restore</button>
                    </form>
                  </td>
                </tr>
              `).join('')}
              ${(!archived || archived.length === 0) ? '<tr><td colspan="4" class="p-6 text-center text-gray-500">No archived residents.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;
    res.send(renderLayout('Archived Residents', req.session.user, 'archived', content));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/staff/residents/restore/:id', requireAuth, requireStaff, async (req, res) => {
  try {
    await supabase.from('residents').update({ is_archived: false, account_status: 'Active' }).eq('id', req.params.id);
    await logActivity(req, 'Restored resident', `Restored resident ID ${req.params.id}`);
    res.redirect('/staff/archived-residents');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/staff/residents/delete/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await supabase.from('residents').delete().eq('id', req.params.id);
    await logActivity(req, 'Deleted resident', `Permanently deleted resident ID ${req.params.id}`);
    res.redirect('/staff/residents');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/applications', requireAuth, requireStaff, async (req, res) => {
  try {
    const { data: apps } = await supabase.from('resident_applications').select('*').eq('status', 'Pending');
    const content = `
      <div class="space-y-6">
        <h3 class="text-lg font-bold text-gray-800">Pending Resident Registration Applications</h3>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase">
              <tr>
                <th class="p-3">Applicant Name</th>
                <th class="p-3">DOB / Gender</th>
                <th class="p-3">Purok & Address</th>
                <th class="p-3">Contact / Email</th>
                <th class="p-3 text-right">Review Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${(apps || []).map(a => `
                <tr>
                  <td class="p-3 font-medium text-gray-800">${a.last_name}, ${a.first_name} ${a.middle_name || ''}</td>
                  <td class="p-3 text-gray-600">${a.gender} • ${a.date_of_birth}</td>
                  <td class="p-3 text-gray-600">${a.purok} - ${a.address}</td>
                  <td class="p-3 text-gray-600">${a.contact_number}<br><span class="text-xs text-gray-400">${a.email}</span></td>
                  <td class="p-3 text-right space-x-2">
                    <form action="/staff/applications/approve/${a.id}" method="POST" class="inline">
                      <button type="submit" class="bg-emerald-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-emerald-700">Approve</button>
                    </form>
                    <form action="/staff/applications/reject/${a.id}" method="POST" class="inline" onsubmit="return confirm('Reject application?');">
                      <button type="submit" class="bg-red-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-red-700">Reject</button>
                    </form>
                  </td>
                </tr>
              `).join('')}
              ${(!apps || apps.length === 0) ? '<tr><td colspan="5" class="p-6 text-center text-gray-500">No pending registration applications.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;
    res.send(renderLayout('Registration Approvals', req.session.user, 'applications', content));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/staff/applications/approve/:id', requireAuth, requireStaff, async (req, res) => {
  try {
    const { data: appData } = await supabase.from('resident_applications').select('*').eq('id', req.params.id).single();
    if (!appData) return res.redirect('/staff/applications');

    // Generate Resident ID
    const { count } = await supabase.from('residents').select('*', { count: 'exact', head: true });
    const seq = (count || 0) + 1;
    const residentId = `BRGY-2026-${String(seq).padStart(6, '0')}`;

    // Move to residents table
    await supabase.from('residents').insert([{
      resident_id: residentId,
      first_name: appData.first_name,
      middle_name: appData.middle_name,
      last_name: appData.last_name,
      suffix: appData.suffix,
      date_of_birth: appData.date_of_birth,
      gender: appData.gender,
      civil_status: appData.civil_status,
      address: appData.address,
      purok: appData.purok,
      contact_number: appData.contact_number,
      email: appData.email,
      occupation: appData.occupation,
      voter_status: appData.voter_status,
      resident_photo: appData.resident_photo,
      password: appData.password,
      account_status: 'Active',
      is_archived: false,
      created_at: new Date().toISOString()
    }]);

    await supabase.from('resident_applications').update({ status: 'Approved' }).eq('id', req.params.id);
    await logActivity(req, 'Approved registration', `Approved resident ${residentId} (${appData.first_name} ${appData.last_name})`);
    
    res.redirect('/staff/applications');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error Approving Application', err.message));
  }
});

app.post('/staff/applications/reject/:id', requireAuth, requireStaff, async (req, res) => {
  try {
    await supabase.from('resident_applications').update({ status: 'Rejected' }).eq('id', req.params.id);
    await logActivity(req, 'Rejected registration', `Rejected application ID ${req.params.id}`);
    res.redirect('/staff/applications');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/households', requireAuth, requireStaff, async (req, res) => {
  try {
    const { data: households } = await supabase.from('households').select('*');
    const { data: residents } = await supabase.from('residents').select('*').eq('is_archived', false);

    const content = `
      <div class="space-y-6">
        <div class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <h3 class="font-bold text-gray-800">Household Directory</h3>
          <button onclick="document.getElementById('addHouseholdModal').classList.remove('hidden')" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition">Create Household</button>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase">
              <tr>
                <th class="p-3">Household No.</th>
                <th class="p-3">Household Head</th>
                <th class="p-3">Address / Purok</th>
                <th class="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${(households || []).map(h => `
                <tr>
                  <td class="p-3 font-mono font-semibold text-blue-600">${h.household_number}</td>
                  <td class="p-3 font-medium text-gray-800">${h.household_head}</td>
                  <td class="p-3 text-gray-600">${h.purok} - ${h.address}</td>
                  <td class="p-3 text-right">
                    <a href="/staff/households/view/${h.id}" class="text-blue-600 hover:underline text-xs font-semibold">View Members</a>
                  </td>
                </tr>
              `).join('')}
              ${(!households || households.length === 0) ? '<tr><td colspan="4" class="p-6 text-center text-gray-500">No households registered.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Add Household Modal -->
      <div id="addHouseholdModal" class="fixed inset-0 bg-black/50 hidden flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
          <h3 class="font-bold text-lg mb-4 text-gray-800">Create New Household</h3>
          <form action="/staff/households/add" method="POST" class="space-y-4">
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Household Number *</label>
              <input type="text" name="household_number" required placeholder="HH-2026-001" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Household Head Name *</label>
              <input type="text" name="household_head" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Purok *</label>
              <input type="text" name="purok" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Address *</label>
              <input type="text" name="address" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
            </div>
            <div class="flex justify-end space-x-3 pt-4 border-t">
              <button type="button" onclick="document.getElementById('addHouseholdModal').classList.add('hidden')" class="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button type="submit" class="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">Save Household</button>
            </div>
          </form>
        </div>
      </div>
    `;
    res.send(renderLayout('Household Management', req.session.user, 'households', content));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/staff/households/add', requireAuth, requireStaff, async (req, res) => {
  try {
    await supabase.from('households').insert([req.body]);
    await logActivity(req, 'Created household', `Household ${req.body.household_number}`);
    res.redirect('/staff/households');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/puroks', requireAuth, requireStaff, async (req, res) => {
  try {
    const { data: puroks } = await supabase.from('puroks').select('*');
    const content = `
      <div class="space-y-6">
        <div class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <h3 class="font-bold text-gray-800">Purok Management</h3>
          <form action="/staff/puroks/add" method="POST" class="flex gap-2">
            <input type="text" name="name" required placeholder="New Purok Name" class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700">Add Purok</button>
          </form>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase">
              <tr>
                <th class="p-3">Purok Name</th>
                <th class="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${(puroks || []).map(p => `
                <tr>
                  <td class="p-3 font-medium text-gray-800">${p.name}</td>
                  <td class="p-3 text-right">
                    <form action="/staff/puroks/delete/${p.id}" method="POST" class="inline" onsubmit="return confirm('Delete purok?');">
                      <button type="submit" class="text-red-600 hover:text-red-800 text-xs font-semibold">Delete</button>
                    </form>
                  </td>
                </tr>
              `).join('')}
              ${(!puroks || puroks.length === 0) ? '<tr><td colspan="2" class="p-6 text-center text-gray-500">No puroks defined.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;
    res.send(renderLayout('Purok Management', req.session.user, 'puroks', content));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/staff/puroks/add', requireAuth, requireStaff, async (req, res) => {
  try {
    await supabase.from('puroks').insert([{ name: req.body.name }]);
    await logActivity(req, 'Added purok', req.body.name);
    res.redirect('/staff/puroks');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/staff/puroks/delete/:id', requireAuth, requireStaff, async (req, res) => {
  try {
    await supabase.from('puroks').delete().eq('id', req.params.id);
    res.redirect('/staff/puroks');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/certificates', requireAuth, requireStaff, async (req, res) => {
  try {
    const { data: requests } = await supabase.from('certificate_requests').select('*').order('id', { ascending: false });
    const content = `
      <div class="space-y-6">
        <h3 class="text-lg font-bold text-gray-800">Certificate Requests & Document Processing</h3>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase">
              <tr>
                <th class="p-3">Resident Name</th>
                <th class="p-3">Certificate Type</th>
                <th class="p-3">Purpose</th>
                <th class="p-3">Status</th>
                <th class="p-3 text-right">Actions / Upload PDF</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${(requests || []).map(reqItem => `
                <tr>
                  <td class="p-3 font-medium text-gray-800">${reqItem.resident_name}</td>
                  <td class="p-3 font-semibold text-blue-600">${reqItem.certificate_type}</td>
                  <td class="p-3 text-gray-600">${reqItem.purpose}</td>
                  <td class="p-3"><span class="px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700">${reqItem.status}</span></td>
                  <td class="p-3 text-right">
                    <form action="/staff/certificates/update/${reqItem.id}" method="POST" enctype="multipart/form-data" class="flex items-center justify-end gap-2">
                      <select name="status" class="p-1 border rounded text-xs">
                        <option value="Pending" ${reqItem.status === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option value="Approved" ${reqItem.status === 'Approved' ? 'selected' : ''}>Approved</option>
                        <option value="Ready for Release" ${reqItem.status === 'Ready for Release' ? 'selected' : ''}>Ready for Release</option>
                        <option value="Released" ${reqItem.status === 'Released' ? 'selected' : ''}>Released</option>
                        <option value="Rejected" ${reqItem.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
                      </select>
                      <input type="file" name="cert_file" class="text-xs w-36" accept=".pdf,.doc,.docx">
                      <button type="submit" class="bg-blue-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-blue-700">Update</button>
                    </form>
                  </td>
                </tr>
              `).join('')}
              ${(!requests || requests.length === 0) ? '<tr><td colspan="5" class="p-6 text-center text-gray-500">No certificate requests found.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;
    res.send(renderLayout('Certificate Management', req.session.user, 'certificates', content));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/staff/certificates/update/:id', requireAuth, requireStaff, upload.single('cert_file'), async (req, res) => {
  try {
    const { status } = req.body;
    let updateData = { status };
    if (req.file) {
      // In production, file buffer can be stored in Supabase Storage. For robust standalone demo, convert to base64 data URL
      const b64 = Buffer.from(req.file.buffer).toString('base64');
      updateData.file_url = `data:${req.file.mimetype};base64,${b64}`;
    }

    await supabase.from('certificate_requests').update(updateData).eq('id', req.params.id);
    await logActivity(req, 'Updated certificate request', `Request ID ${req.params.id} status: ${status}`);

    res.redirect('/staff/certificates');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error updating certificate', err.message));
  }
});

app.get('/staff/blotter', requireAuth, requireStaff, async (req, res) => {
  try {
    const { data: cases } = await supabase.from('blotter_cases').select('*').order('id', { ascending: false });
    const content = `
      <div class="space-y-6">
        <div class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <h3 class="font-bold text-gray-800">Blotter & Incident Records</h3>
          <button onclick="document.getElementById('addBlotterModal').classList.remove('hidden')" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Record Incident</button>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase">
              <tr>
                <th class="p-3">Case No.</th>
                <th class="p-3">Complainant vs Respondent</th>
                <th class="p-3">Incident Type & Date</th>
                <th class="p-3">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${(cases || []).map(c => `
                <tr>
                  <td class="p-3 font-mono font-semibold text-blue-600">${c.case_number}</td>
                  <td class="p-3 font-medium text-gray-800">${c.complainant} vs ${c.respondent}</td>
                  <td class="p-3 text-gray-600">${c.incident_type} (${c.incident_date})</td>
                  <td class="p-3"><span class="px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700">${c.status}</span></td>
                </tr>
              `).join('')}
              ${(!cases || cases.length === 0) ? '<tr><td colspan="4" class="p-6 text-center text-gray-500">No blotter records found.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Add Blotter Modal -->
      <div id="addBlotterModal" class="fixed inset-0 bg-black/50 hidden flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
          <h3 class="font-bold text-lg mb-4 text-gray-800">Record Blotter Incident</h3>
          <form action="/staff/blotter/add" method="POST" class="space-y-4">
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Case Number *</label>
              <input type="text" name="case_number" required placeholder="BLT-2026-001" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Complainant *</label>
                <input type="text" name="complainant" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Respondent *</label>
                <input type="text" name="respondent" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Incident Type *</label>
                <input type="text" name="incident_type" required placeholder="Dispute, Theft, etc." class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Incident Date *</label>
                <input type="date" name="incident_date" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Description *</label>
              <textarea name="description" required rows="3" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm"></textarea>
            </div>
            <div class="flex justify-end space-x-3 pt-4 border-t">
              <button type="button" onclick="document.getElementById('addBlotterModal').classList.add('hidden')" class="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button type="submit" class="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">Save Record</button>
            </div>
          </form>
        </div>
      </div>
    `;
    res.send(renderLayout('Blotter Management', req.session.user, 'blotter', content));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/staff/blotter/add', requireAuth, requireStaff, async (req, res) => {
  try {
    await supabase.from('blotter_cases').insert([{ ...req.body, status: 'Open' }]);
    await logActivity(req, 'Created blotter case', req.body.case_number);
    res.redirect('/staff/blotter');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/appointments', requireAuth, requireStaff, async (req, res) => {
  try {
    const { data: appointments } = await supabase.from('appointments').select('*').order('id', { ascending: false });
    const content = `
      <div class="space-y-6">
        <h3 class="text-lg font-bold text-gray-800">Appointment Requests</h3>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase">
              <tr>
                <th class="p-3">Resident Name</th>
                <th class="p-3">Service</th>
                <th class="p-3">Date & Time</th>
                <th class="p-3">Status</th>
                <th class="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${(appointments || []).map(a => `
                <tr>
                  <td class="p-3 font-medium text-gray-800">${a.resident_name}</td>
                  <td class="p-3 font-semibold text-blue-600">${a.service}</td>
                  <td class="p-3 text-gray-600">${a.date} at ${a.time}</td>
                  <td class="p-3"><span class="px-2 py-0.5 rounded text-xs font-semibold bg-purple-50 text-purple-700">${a.status}</span></td>
                  <td class="p-3 text-right">
                    <form action="/staff/appointments/update/${a.id}" method="POST" class="inline">
                      <select name="status" onchange="this.form.submit()" class="p-1 border rounded text-xs">
                        <option value="Pending" ${a.status === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option value="Approved" ${a.status === 'Approved' ? 'selected' : ''}>Approved</option>
                        <option value="Completed" ${a.status === 'Completed' ? 'selected' : ''}>Completed</option>
                        <option value="Cancelled" ${a.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                      </select>
                    </form>
                  </td>
                </tr>
              `).join('')}
              ${(!appointments || appointments.length === 0) ? '<tr><td colspan="5" class="p-6 text-center text-gray-500">No appointments.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;
    res.send(renderLayout('Appointments', req.session.user, 'appointments', content));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/staff/appointments/update/:id', requireAuth, requireStaff, async (req, res) => {
  try {
    await supabase.from('appointments').update({ status: req.body.status }).eq('id', req.params.id);
    res.redirect('/staff/appointments');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/assistance', requireAuth, requireStaff, async (req, res) => {
  try {
    const { data: assistance } = await supabase.from('assistance_requests').select('*').order('id', { ascending: false });
    const content = `
      <div class="space-y-6">
        <h3 class="text-lg font-bold text-gray-800">Assistance Requests</h3>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase">
              <tr>
                <th class="p-3">Resident Name</th>
                <th class="p-3">Type</th>
                <th class="p-3">Details / Reason</th>
                <th class="p-3">Status</th>
                <th class="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${(assistance || []).map(asst => `
                <tr>
                  <td class="p-3 font-medium text-gray-800">${asst.resident_name}</td>
                  <td class="p-3 font-semibold text-rose-600">${asst.assistance_type}</td>
                  <td class="p-3 text-gray-600">${asst.details}</td>
                  <td class="p-3"><span class="px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700">${asst.status}</span></td>
                  <td class="p-3 text-right">
                    <form action="/staff/assistance/update/${asst.id}" method="POST" class="inline">
                      <select name="status" onchange="this.form.submit()" class="p-1 border rounded text-xs">
                        <option value="Pending" ${asst.status === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option value="Approved" ${asst.status === 'Approved' ? 'selected' : ''}>Approved</option>
                        <option value="Rejected" ${asst.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
                      </select>
                    </form>
                  </td>
                </tr>
              `).join('')}
              ${(!assistance || assistance.length === 0) ? '<tr><td colspan="5" class="p-6 text-center text-gray-500">No assistance requests.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;
    res.send(renderLayout('Assistance Requests', req.session.user, 'assistance', content));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/staff/assistance/update/:id', requireAuth, requireStaff, async (req, res) => {
  try {
    await supabase.from('assistance_requests').update({ status: req.body.status }).eq('id', req.params.id);
    res.redirect('/staff/assistance');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/businesses', requireAuth, requireStaff, async (req, res) => {
  try {
    const { data: businesses } = await supabase.from('businesses').select('*');
    const content = `
      <div class="space-y-6">
        <div class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <h3 class="font-bold text-gray-800">Barangay Business Records</h3>
          <button onclick="document.getElementById('addBusModal').classList.remove('hidden')" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Register Business</button>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase">
              <tr>
                <th class="p-3">Business Name</th>
                <th class="p-3">Owner</th>
                <th class="p-3">Type</th>
                <th class="p-3">Permit No. & Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${(businesses || []).map(b => `
                <tr>
                  <td class="p-3 font-medium text-gray-800">${b.business_name}</td>
                  <td class="p-3 text-gray-600">${b.owner}</td>
                  <td class="p-3 text-gray-600">${b.business_type}</td>
                  <td class="p-3"><span class="font-mono text-xs text-blue-600">${b.permit_number}</span> • <span class="px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700">${b.permit_status}</span></td>
                </tr>
              `).join('')}
              ${(!businesses || businesses.length === 0) ? '<tr><td colspan="4" class="p-6 text-center text-gray-500">No businesses recorded.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Add Business Modal -->
      <div id="addBusModal" class="fixed inset-0 bg-black/50 hidden flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
          <h3 class="font-bold text-lg mb-4 text-gray-800">Register Business</h3>
          <form action="/staff/businesses/add" method="POST" class="space-y-4">
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Business Name *</label>
              <input type="text" name="business_name" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Owner Name *</label>
              <input type="text" name="owner" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Business Type *</label>
                <input type="text" name="business_type" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Permit Number *</label>
                <input type="text" name="permit_number" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
              </div>
            </div>
            <div class="flex justify-end space-x-3 pt-4 border-t">
              <button type="button" onclick="document.getElementById('addBusModal').classList.add('hidden')" class="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button type="submit" class="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">Save</button>
            </div>
          </form>
        </div>
      </div>
    `;
    res.send(renderLayout('Business Management', req.session.user, 'businesses', content));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/staff/businesses/add', requireAuth, requireStaff, async (req, res) => {
  try {
    await supabase.from('businesses').insert([{ ...req.body, permit_status: 'Active' }]);
    res.redirect('/staff/businesses');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/announcements', requireAuth, requireStaff, async (req, res) => {
  try {
    const { data: announcements } = await supabase.from('announcements').select('*').order('id', { ascending: false });
    const content = `
      <div class="space-y-6">
        <div class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <h3 class="font-bold text-gray-800">Barangay Announcements</h3>
          <button onclick="document.getElementById('addAnnModal').classList.remove('hidden')" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Post Announcement</button>
        </div>
        <div class="space-y-4">
          ${(announcements || []).map(a => `
            <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
              <div class="flex justify-between items-start">
                <h4 class="font-bold text-gray-800 text-base">${a.title}</h4>
                <span class="text-xs text-gray-400">${a.created_at ? a.created_at.split('T')[0] : ''}</span>
              </div>
              <p class="text-sm text-gray-600 mt-2">${a.content}</p>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Add Announcement Modal -->
      <div id="addAnnModal" class="fixed inset-0 bg-black/50 hidden flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
          <h3 class="font-bold text-lg mb-4 text-gray-800">Post Announcement</h3>
          <form action="/staff/announcements/add" method="POST" class="space-y-4">
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Title *</label>
              <input type="text" name="title" required class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Content *</label>
              <textarea name="content" required rows="4" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm"></textarea>
            </div>
            <div class="flex justify-end space-x-3 pt-4 border-t">
              <button type="button" onclick="document.getElementById('addAnnModal').classList.add('hidden')" class="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button type="submit" class="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">Publish</button>
            </div>
          </form>
        </div>
      </div>
    `;
    res.send(renderLayout('Announcements', req.session.user, 'announcements', content));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/staff/announcements/add', requireAuth, requireStaff, async (req, res) => {
  try {
    await supabase.from('announcements').insert([{ ...req.body, created_at: new Date().toISOString() }]);
    res.redirect('/staff/announcements');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/complaints', requireAuth, requireStaff, async (req, res) => {
  try {
    const { data: complaints } = await supabase.from('complaints').select('*').order('id', { ascending: false });
    const content = `
      <div class="space-y-6">
        <h3 class="text-lg font-bold text-gray-800">Resident Concerns & Complaints</h3>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase">
              <tr>
                <th class="p-3">Resident Name</th>
                <th class="p-3">Concern Type</th>
                <th class="p-3">Description</th>
                <th class="p-3">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${(complaints || []).map(c => `
                <tr>
                  <td class="p-3 font-medium text-gray-800">${c.resident_name}</td>
                  <td class="p-3 font-semibold text-indigo-600">${c.concern_type}</td>
                  <td class="p-3 text-gray-600">${c.description}</td>
                  <td class="p-3"><span class="px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700">${c.status}</span></td>
                </tr>
              `).join('')}
              ${(!complaints || complaints.length === 0) ? '<tr><td colspan="4" class="p-6 text-center text-gray-500">No concerns filed.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;
    res.send(renderLayout('Concerns & Complaints', req.session.user, 'complaints', content));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/activity-logs', requireAuth, requireStaff, async (req, res) => {
  try {
    const { data: logs } = await supabase.from('activity_logs').select('*').order('id', { ascending: false }).limit(100);
    const content = `
      <div class="space-y-6">
        <h3 class="text-lg font-bold text-gray-800">System Activity Logs</h3>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase">
              <tr>
                <th class="p-3">User</th>
                <th class="p-3">Action</th>
                <th class="p-3">Record Details</th>
                <th class="p-3">Timestamp</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${(logs || []).map(l => `
                <tr>
                  <td class="p-3 font-medium text-gray-800">${l.user_identifier}</td>
                  <td class="p-3"><span class="px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700">${l.action}</span></td>
                  <td class="p-3 text-gray-600">${l.record_info}</td>
                  <td class="p-3 text-gray-400 text-xs">${l.date} ${l.time}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    res.send(renderLayout('Activity Logs', req.session.user, 'logs', content));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/reports', requireAuth, requireStaff, async (req, res) => {
  const content = `
    <div class="space-y-6">
      <div class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200 no-print">
        <h3 class="font-bold text-gray-800">Barangay Official Reports</h3>
        <button onclick="window.print()" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2">
          <i class="fa-solid fa-print"></i><span>Print Report</span>
        </button>
      </div>

      <div class="bg-white p-8 rounded-xl shadow-sm border border-gray-200 space-y-6">
        <div class="text-center border-b pb-6">
          <h2 class="text-xl font-bold text-gray-800">BARANGAY RESIDENT & POPULATION SUMMARY REPORT</h2>
          <p class="text-sm text-gray-500">Official Barangay Management System Generated Report</p>
        </div>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div><strong>Report Date:</strong> ${new Date().toLocaleDateString()}</div>
          <div><strong>Generated By:</strong> ${req.session.user.name}</div>
        </div>
        <div class="pt-4">
          <p class="text-sm text-gray-600">This official document aggregates all resident statistics, demographic indices, active household count, blotter cases, and certificate records from the Supabase database repository.</p>
        </div>
      </div>
    </div>
  `;
  res.send(renderLayout('Barangay Reports', req.session.user, 'reports', content));
});

app.get('/staff/settings', requireAuth, requireAdmin, async (req, res) => {
  const settings = await getBarangaySettings();
  const content = `
    <div class="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-200">
      <h3 class="text-lg font-bold text-gray-800 mb-6">Barangay Information Settings</h3>
      <form action="/staff/settings/update" method="POST" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Barangay Name *</label>
            <input type="text" name="barangay_name" value="${settings.barangay_name || ''}" required class="w-full p-2.5 border rounded-lg text-sm">
          </div>
          <div>
            <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Municipality / City *</label>
            <input type="text" name="municipality" value="${settings.municipality || ''}" required class="w-full p-2.5 border rounded-lg text-sm">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Province *</label>
            <input type="text" name="province" value="${settings.province || ''}" required class="w-full p-2.5 border rounded-lg text-sm">
          </div>
          <div>
            <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Contact Number *</label>
            <input type="text" name="contact_number" value="${settings.contact_number || ''}" required class="w-full p-2.5 border rounded-lg text-sm">
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Address *</label>
          <input type="text" name="address" value="${settings.address || ''}" required class="w-full p-2.5 border rounded-lg text-sm">
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Barangay Captain *</label>
            <input type="text" name="captain_name" value="${settings.captain_name || ''}" required class="w-full p-2.5 border rounded-lg text-sm">
          </div>
          <div>
            <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Barangay Secretary *</label>
            <input type="text" name="secretary_name" value="${settings.secretary_name || ''}" required class="w-full p-2.5 border rounded-lg text-sm">
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Logo URL *</label>
          <input type="url" name="logo_url" value="${settings.logo_url || ''}" required class="w-full p-2.5 border rounded-lg text-sm">
        </div>
        <button type="submit" class="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition">Save Settings</button>
      </form>
    </div>
  `;
  res.send(renderLayout('Barangay Settings', req.session.user, 'settings', content));
});

app.post('/staff/settings/update', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Check if settings row exists
    const { data: existing } = await supabase.from('barangay_settings').select('id').maybeSingle();
    if (existing) {
      await supabase.from('barangay_settings').update(req.body).eq('id', existing.id);
    } else {
      await supabase.from('barangay_settings').insert([req.body]);
    }
    await logActivity(req, 'Updated settings', 'Barangay settings updated');
    res.redirect('/staff/settings');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/staff/staff-management', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data: staffList } = await supabase.from('staff_users').select('*');
    const content = `
      <div class="space-y-6">
        <div class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <h3 class="font-bold text-gray-800">Staff & Administrator Accounts</h3>
          <button onclick="document.getElementById('addStaffModal').classList.remove('hidden')" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Create Staff Account</button>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase">
              <tr>
                <th class="p-3">Username / Name</th>
                <th class="p-3">Role</th>
                <th class="p-3">Email</th>
                <th class="p-3">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${(staffList || []).map(s => `
                <tr>
                  <td class="p-3 font-medium text-gray-800">${s.username} <br><span class="text-xs text-gray-400">${s.full_name}</span></td>
                  <td class="p-3"><span class="px-2 py-0.5 rounded text-xs font-semibold bg-purple-50 text-purple-700">${s.role}</span></td>
                  <td class="p-3 text-gray-600">${s.email}</td>
                  <td class="p-3"><span class="px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700">${s.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Add Staff Modal -->
      <div id="addStaffModal" class="fixed inset-0 bg-black/50 hidden flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
          <h3 class="font-bold text-lg mb-4 text-gray-800">Create Staff Account</h3>
          <form action="/staff/staff-management/add" method="POST" class="space-y-4">
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Username *</label>
              <input type="text" name="username" required class="w-full p-2.5 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Full Name *</label>
              <input type="text" name="full_name" required class="w-full p-2.5 border rounded-lg text-sm">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Email *</label>
                <input type="email" name="email" required class="w-full p-2.5 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Role *</label>
                <select name="role" required class="w-full p-2.5 border rounded-lg text-sm">
                  <option value="Staff">Staff</option>
                  <option value="Secretary">Secretary</option>
                  <option value="Administrator">Administrator</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Password *</label>
              <input type="password" name="password" required class="w-full p-2.5 border rounded-lg text-sm">
            </div>
            <div class="flex justify-end space-x-3 pt-4 border-t">
              <button type="button" onclick="document.getElementById('addStaffModal').classList.add('hidden')" class="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button type="submit" class="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">Create Account</button>
            </div>
          </form>
        </div>
      </div>
    `;
    res.send(renderLayout('Staff Accounts', req.session.user, 'staff', content));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/staff/staff-management/add', requireAuth, requireAdmin, async (req, res) => {
  try {
    await supabase.from('staff_users').insert([{ ...req.body, status: 'Active', created_at: new Date().toISOString() }]);
    await logActivity(req, 'Created staff account', req.body.username);
    res.redirect('/staff/staff-management');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/resident/dashboard', requireAuth, async (req, res) => {
  try {
    const { data: resident } = await supabase.from('residents').select('*').eq('email', req.session.user.email).maybeSingle();
    if (!resident) return res.redirect('/login');

    const { data: certs } = await supabase.from('certificate_requests').select('*').eq('resident_id_num', resident.resident_id);
    const { data: announcements } = await supabase.from('announcements').select('*').limit(3);

    const content = `
      <div class="space-y-6">
        <div class="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-6 rounded-2xl shadow-lg flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h2 class="text-2xl font-bold">Welcome back, ${resident.first_name}!</h2>
            <p class="text-blue-100 text-sm mt-1">Resident ID: <span class="font-mono font-bold">${resident.resident_id}</span> • Purok: ${resident.purok}</p>
          </div>
          <a href="/resident/digital-id" class="bg-white text-blue-900 px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-50 transition shadow">View My Digital ID</a>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 class="font-bold text-gray-800 mb-4 text-base">Recent Certificate Requests</h3>
            <div class="space-y-3">
              ${(certs || []).map(c => `
                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg text-sm">
                  <div><strong>${c.certificate_type}</strong><br><span class="text-xs text-gray-500">${c.purpose}</span></div>
                  <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">${c.status}</span>
                </div>
              `).join('')}
              ${(!certs || certs.length === 0) ? '<p class="text-sm text-gray-500">No requests submitted yet.</p>' : ''}
            </div>
            <div class="mt-4"><a href="/resident/certificates" class="text-blue-600 font-semibold text-sm hover:underline">+ Request New Certificate</a></div>
          </div>

          <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 class="font-bold text-gray-800 mb-4 text-base">Barangay Announcements</h3>
            <div class="space-y-3">
              ${(announcements || []).map(a => `
                <div class="p-3 bg-gray-50 rounded-lg">
                  <h4 class="font-bold text-gray-800 text-sm">${a.title}</h4>
                  <p class="text-xs text-gray-600 mt-1">${a.content}</p>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
    res.send(renderLayout('Resident Dashboard', req.session.user, 'dashboard', content));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/resident/digital-id', requireAuth, async (req, res) => {
  try {
    const { data: resident } = await supabase.from('residents').select('*').eq('email', req.session.user.email).maybeSingle();
    const settings = await getBarangaySettings();
    if (!resident) return res.redirect('/login');

    const content = `
      <div class="space-y-6">
        <div class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200 no-print">
          <h3 class="font-bold text-gray-800">My Official Digital Resident ID</h3>
          <button onclick="window.print()" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2">
            <i class="fa-solid fa-print"></i><span>Print ID Card</span>
          </button>
        </div>

        <div class="flex justify-center">
          <div class="w-96 bg-gradient-to-b from-blue-900 to-indigo-900 text-white rounded-2xl shadow-2xl p-6 border-4 border-amber-400 relative overflow-hidden">
            <div class="absolute top-0 right-0 p-4 opacity-10 text-6xl"><i class="fa-solid fa-landmark"></i></div>
            <div class="text-center border-b border-blue-700 pb-4 mb-4">
              <img src="${settings.logo_url}" alt="Logo" class="w-14 h-14 mx-auto rounded-full object-cover mb-2 border-2 border-amber-400" onerror="this.src='https://placehold.co/150x150/1e3a8a/ffffff?text=LOGO'">
              <h4 class="font-bold text-sm uppercase tracking-wider text-amber-300">${settings.barangay_name}</h4>
              <p class="text-xs text-blue-200">${settings.municipality}, ${settings.province}</p>
              <span class="inline-block mt-2 px-3 py-0.5 bg-amber-400 text-blue-950 rounded font-bold text-xs">${settings.id_title}</span>
            </div>

            <div class="flex items-center space-x-4 mb-4">
              <img src="${resident.resident_photo}" alt="Photo" class="w-24 h-24 rounded-xl object-cover border-2 border-white shadow" onerror="this.src='https://placehold.co/150x150/e2e8f0/1e293b?text=PHOTO'">
              <div>
                <h3 class="font-bold text-lg text-white leading-snug">${resident.last_name}, ${resident.first_name} ${resident.middle_name || ''}</h3>
                <p class="text-xs text-amber-300 font-mono mt-1">${resident.resident_id}</p>
                <p class="text-xs text-blue-200 mt-1"><i class="fa-solid fa-location-dot mr-1"></i>${resident.purok} - ${resident.address}</p>
              </div>
            </div>

            <div class="bg-white/10 p-3 rounded-xl text-xs space-y-1 backdrop-blur border border-white/10 mb-4">
              <div class="flex justify-between"><span>Date of Birth:</span><span class="font-medium">${resident.date_of_birth}</span></div>
              <div class="flex justify-between"><span>Contact:</span><span class="font-medium">${resident.contact_number}</span></div>
              <div class="flex justify-between"><span>Civil Status:</span><span class="font-medium">${resident.civil_status}</span></div>
            </div>

            <div class="flex justify-between items-center pt-2 border-t border-blue-700 text-xs">
              <div>
                <p class="font-bold text-amber-300">${settings.captain_name}</p>
                <span class="text-[10px] text-blue-300">Punong Barangay</span>
              </div>
              <div class="bg-white p-2 rounded">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${resident.resident_id}" alt="QR" class="w-12 h-12">
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    res.send(renderLayout('Digital Resident ID', req.session.user, 'digital-id', content));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/resident/certificates', requireAuth, async (req, res) => {
  try {
    const { data: resident } = await supabase.from('residents').select('*').eq('email', req.session.user.email).maybeSingle();
    const { data: requests } = await supabase.from('certificate_requests').select('*').eq('resident_id_num', resident.resident_id);

    const content = `
      <div class="space-y-6">
        <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 class="font-bold text-gray-800 mb-4 text-base">Request Barangay Certificate</h3>
          <form action="/resident/certificates/request" method="POST" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Certificate Type *</label>
                <select name="certificate_type" required class="w-full p-2.5 border rounded-lg text-sm">
                  <option value="Barangay Clearance">Barangay Clearance</option>
                  <option value="Certificate of Residency">Certificate of Residency</option>
                  <option value="Certificate of Indigency">Certificate of Indigency</option>
                  <option value="Certificate of Good Moral">Certificate of Good Moral</option>
                  <option value="Certificate of No Income">Certificate of No Income</option>
                  <option value="Certificate of Solo Parent">Certificate of Solo Parent</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Purpose *</label>
                <input type="text" name="purpose" required placeholder="Employment, Bank, Scholarship..." class="w-full p-2.5 border rounded-lg text-sm">
              </div>
            </div>
            <button type="submit" class="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700">Submit Request</button>
          </form>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div class="p-4 border-b"><h3 class="font-bold text-gray-800">My Certificate Requests Status</h3></div>
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 border-b text-gray-600 text-xs uppercase">
              <tr>
                <th class="p-3">Type</th>
                <th class="p-3">Purpose</th>
                <th class="p-3">Status</th>
                <th class="p-3 text-right">Download Document</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${(requests || []).map(r => `
                <tr>
                  <td class="p-3 font-semibold text-blue-600">${r.certificate_type}</td>
                  <td class="p-3 text-gray-600">${r.purpose}</td>
                  <td class="p-3"><span class="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700">${r.status}</span></td>
                  <td class="p-3 text-right">
                    ${r.file_url ? `<a href="${r.file_url}" download="BarangayCertificate.pdf" class="bg-emerald-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-emerald-700">Download PDF</a>` : '<span class="text-xs text-gray-400">Processing...</span>'}
                  </td>
                </tr>
              `).join('')}
              ${(!requests || requests.length === 0) ? '<tr><td colspan="4" class="p-6 text-center text-gray-500">No requests.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;
    res.send(renderLayout('Certificate Requests', req.session.user, 'certificates', content));
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.post('/resident/certificates/request', requireAuth, async (req, res) => {
  try {
    const { data: resident } = await supabase.from('residents').select('*').eq('email', req.session.user.email).maybeSingle();
    await supabase.from('certificate_requests').insert([{
      resident_id_num: resident.resident_id,
      resident_name: `${resident.first_name} ${resident.last_name}`,
      certificate_type: req.body.certificate_type,
      purpose: req.body.purpose,
      status: 'Pending',
      created_at: new Date().toISOString()
    }]);
    res.redirect('/resident/certificates');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.get('/resident/complaints', requireAuth, async (req, res) => {
  const content = `
    <div class="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-200">
      <h3 class="text-lg font-bold text-gray-800 mb-4">File Concern or Complaint</h3>
      <form action="/resident/complaints/add" method="POST" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Concern Type *</label>
          <input type="text" name="concern_type" required placeholder="Noise Disturbance, Garbage, etc." class="w-full p-2.5 border rounded-lg text-sm">
        </div>
        <div>
          <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Description *</label>
          <textarea name="description" required rows="4" class="w-full p-2.5 border rounded-lg text-sm"></textarea>
        </div>
        <button type="submit" class="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700">Submit Concern</button>
      </form>
    </div>
  `;
  res.send(renderLayout('File Concern', req.session.user, 'complaints', content));
});

app.post('/resident/complaints/add', requireAuth, async (req, res) => {
  try {
    await supabase.from('complaints').insert([{
      resident_name: req.session.user.name,
      ...req.body,
      status: 'Submitted',
      created_at: new Date().toISOString()
    }]);
    res.redirect('/resident/dashboard');
  } catch (err) {
    res.status(500).send(renderErrorPage('Error', err.message));
  }
});

app.listen(PORT, async () => {
  console.log(`Barangay Resident Management System running on port ${PORT}`);
  await initializeDatabase();
});
