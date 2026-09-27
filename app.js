/**
 * BARANGAY RESIDENT MANAGEMENT SYSTEM (BRMS)
 * Node.js + Express + Supabase Single-File Enterprise Architecture
 */

const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables or fallback safely
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-supabase-anon-key';
const PORT = process.env.PORT || 3000;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware setup
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'brms-secure-production-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Utility Logger & Security Tracers
const logActivity = async (userId, action, details) => {
  try {
    await supabase.from('activity_logs').insert([{ user_id: userId || null, action, details }]);
  } catch (err) {
    console.error('Activity Log Error:', err.message);
  }
};

// Layout Helper for Consistent Blue + Green + White Theme
const renderLayout = (title, user, bodyContent, activeTab = '') => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | Barangay Resident Management System</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '#1D4ED8', // Blue
            secondary: '#059669', // Green
            neutralBg: '#F8FAFC' // White/Light Slate
          }
        }
      }
    }
  </script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    @media print {
      .no-print { display: none !important; }
      body { background: white !important; }
    }
  </style>
</head>
<body class="bg-neutralBg text-slate-800 min-h-screen flex flex-col font-sans">
  <div class="flex h-screen overflow-hidden">
    <!-- Sidebar Navigation -->
    <div class="w-64 bg-primary text-white flex flex-col shadow-xl no-print">
      <div class="p-5 bg-blue-900 flex items-center space-x-3 border-b border-blue-800">
        <i class="fa-solid fa-landmark text-2xl text-emerald-400"></i>
        <div>
          <h1 class="font-bold text-lg tracking-wide">BRMS Portal</h1>
          <p class="text-xs text-emerald-300">Official Barangay System</p>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto py-4 px-3 space-y-1 text-sm">
        ${user && (user.role === 'Super Admin' || user.role === 'Barangay Admin' || user.role === 'Secretary' || user.role === 'Staff') ? `
          <a href="/admin/dashboard" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'dashboard' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-chart-pie w-5"></i><span>Dashboard</span></a>
          <a href="/admin/residents" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'residents' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-users w-5"></i><span>Resident Management</span></a>
          <a href="/admin/households" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'households' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-house-chimney w-5"></i><span>Households</span></a>
          <a href="/admin/puroks" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'puroks' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-map-location-dot w-5"></i><span>Puroks</span></a>
          <a href="/admin/documents" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'documents' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-file-invoice w-5"></i><span>Certificates & Docs</span></a>
          <a href="/scanner" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'scanner' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-qrcode w-5"></i><span>QR Scanner & Release</span></a>
          <a href="/admin/blotter" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'blotter' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-scale-balanced w-5"></i><span>Blotter & Complaints</span></a>
          <a href="/admin/ids" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'ids' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-id-card w-5"></i><span>ID Printing (8-Up)</span></a>
          <a href="/admin/reports" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'reports' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-chart-line w-5"></i><span>Reports & Analytics</span></a>
          <a href="/admin/settings" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'settings' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-gear w-5"></i><span>Barangay Settings</span></a>
        ` : `
          <a href="/resident/dashboard" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'dashboard' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-house w-5"></i><span>Dashboard</span></a>
          <a href="/resident/profile" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'profile' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-user-pen w-5"></i><span>My Profile & ID</span></a>
          <a href="/resident/certificates" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'certificates' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-file-shield w-5"></i><span>Request Certificate</span></a>
          <a href="/resident/complaints" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'complaints' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-triangle-exclamation w-5"></i><span>Complaints & Blotter</span></a>
          <a href="/resident/assistance" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'assistance' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-hand-holding-heart w-5"></i><span>Assistance Requests</span></a>
          <a href="/resident/appointments" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'appointments' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-calendar-check w-5"></i><span>Appointments</span></a>
          <a href="/resident/announcements" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'announcements' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-bullhorn w-5"></i><span>Announcements</span></a>
          <a href="/resident/emergency" class="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-blue-700 transition ${activeTab === 'emergency' ? 'bg-blue-800 font-semibold text-emerald-300' : ''}"><i class="fa-solid fa-phone-volume w-5"></i><span>Emergency Contacts</span></a>
        `}
      </div>
      <div class="p-4 bg-blue-950 border-t border-blue-800 flex items-center justify-between">
        <div class="truncate text-xs">
          <p class="font-bold text-white truncate">${user ? user.full_name : 'Guest'}</p>
          <p class="text-emerald-400">${user ? user.role : 'Visitor'}</p>
        </div>
        <a href="/logout" class="text-rose-400 hover:text-rose-300 p-2"><i class="fa-solid fa-right-from-bracket text-lg"></i></a>
      </div>
    </div>
    
    <!-- Main Content Body -->
    <div class="flex-1 flex flex-col overflow-y-auto">
      <header class="bg-white shadow-sm h-16 flex items-center justify-between px-8 no-print border-b border-slate-200">
        <div class="flex items-center space-x-3">
          <span class="h-3 w-3 bg-emerald-500 rounded-full animate-pulse"></span>
          <h2 class="text-xl font-bold text-slate-800">${title}</h2>
        </div>
        <div class="flex items-center space-x-4">
          <span class="bg-emerald-100 text-emerald-800 text-xs font-semibold px-2.5 py-1 rounded-full border border-emerald-300">System Online</span>
        </div>
      </header>
      <main class="flex-1 p-8 overflow-y-auto">
        ${bodyContent}
      </main>
    </div>
  </div>
</body>
</html>`;
};

// Authentication Guards
const requireAuth = (roles = []) => {
  return async (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    if (roles.length > 0 && !roles.includes(req.session.user.role)) {
      return res.status(403).send(renderLayout('Access Denied', req.session.user, `
        <div class="bg-white p-8 rounded-xl shadow-md border-l-4 border-rose-500 max-w-lg mx-auto mt-12 text-center">
          <i class="fa-solid fa-ban text-5xl text-rose-500 mb-4"></i>
          <h3 class="text-2xl font-bold text-slate-800 mb-2">Unauthorized Access</h3>
          <p class="text-slate-600 mb-6">Your account role (${req.session.user.role}) is not authorized to view this administrative page.</p>
          <a href="/login" class="bg-primary text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition">Return to Portal</a>
        </div>
      `));
    }
    next();
  };
};

// ==========================================
// ROUTES: AUTHENTICATION & FIRST SETUP
// ==========================================

app.get('/', async (req, res) => {
  const { data: admins } = await supabase.from('users').select('id').limit(1);
  if (!admins || admins.length === 0) {
    return res.redirect('/setup');
  }
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'Resident' ? '/resident/dashboard' : '/admin/dashboard');
  }
  res.redirect('/login');
});

app.get('/setup', async (req, res) => {
  const { data: admins } = await supabase.from('users').select('id').limit(1);
  if (admins && admins.length > 0) {
    return res.redirect('/login');
  }
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><title>Initial System Setup | BRMS</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body class="bg-slate-900 min-h-screen flex items-center justify-center p-6">
  <div class="bg-white max-w-md w-full p-8 rounded-2xl shadow-2xl border-t-4 border-emerald-500">
    <div class="text-center mb-6">
      <i class="fa-solid fa-shield-halved text-4xl text-primary mb-2"></i>
      <h2 class="text-2xl font-bold text-slate-800">Initial System Setup</h2>
      <p class="text-xs text-slate-500">Create your first Super Administrator account to begin.</p>
    </div>
    <form action="/setup" method="POST" class="space-y-4">
      <div>
        <label class="block text-xs font-semibold text-slate-700 uppercase mb-1">Full Name</label>
        <input type="text" name="full_name" required class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 uppercase mb-1">Username</label>
        <input type="text" name="username" required class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 uppercase mb-1">Email Address</label>
        <input type="email" name="email" required class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 uppercase mb-1">Password</label>
        <input type="password" name="password" required class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none">
      </div>
      <button type="submit" class="w-full bg-emerald-600 text-white font-semibold py-3 rounded-lg hover:bg-emerald-700 transition shadow-lg">Complete Setup & Login</button>
    </form>
  </div>
</body>
</html>`);
});

app.post('/setup', async (req, res) => {
  const { full_name, username, email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const { error } = await supabase.from('users').insert([{
    full_name, username, email, password_hash: hash, role: 'Super Admin', status: 'Active'
  }]);
  if (error) return res.send(`Setup Error: ${error.message}`);
  res.redirect('/login');
});

app.get('/login', async (req, res) => {
  const bgImage = "https://scontent.fcrk3-3.fna.fbcdn.net/v/t39.30808-6/467984538_122130208178389200_2470999473131951042_n.jpg";
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><title>Login | Barangay Resident Management System</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body class="relative min-h-screen flex items-center justify-center bg-cover bg-center" style="background-image: url('${bgImage}');">
  <div class="absolute inset-0 bg-gradient-to-br from-blue-900/90 via-emerald-900/80 to-slate-900/90 backdrop-blur-sm"></div>
  <div class="relative z-10 bg-white/95 max-w-md w-full p-8 rounded-2xl shadow-2xl border-t-4 border-emerald-500 mx-4">
    <div class="text-center mb-6">
      <div class="inline-flex p-3 bg-emerald-100 text-emerald-600 rounded-full mb-2 shadow-inner">
        <i class="fa-solid fa-landmark text-3xl"></i>
      </div>
      <h2 class="text-2xl font-bold text-slate-800">Barangay Portal</h2>
      <p class="text-xs text-slate-500">Sign in to access resident services & records</p>
    </div>
    <form action="/login" method="POST" class="space-y-4">
      <div>
        <label class="block text-xs font-semibold text-slate-700 uppercase mb-1">Username or Email</label>
        <input type="text" name="username" required class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none text-sm">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 uppercase mb-1">Password</label>
        <input type="password" name="password" required class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none text-sm">
      </div>
      <button type="submit" class="w-full bg-primary text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition shadow-lg text-sm">Secure Sign In</button>
    </form>
    <div class="mt-6 text-center text-xs text-slate-600">
      Don't have a resident account? <a href="/register" class="text-emerald-600 font-bold hover:underline">Register Here</a>
    </div>
  </div>
</body>
</html>`);
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const { data: users, error } = await supabase.from('users').select('*').or(`username.eq.${username},email.eq.${username}`).limit(1);
  if (error || !users || users.length === 0) {
    return res.redirect('/login?error=InvalidCredentials');
  }
  const user = users[0];
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.redirect('/login?error=InvalidCredentials');

  req.session.user = user;
  await supabase.from('login_history').insert([{ user_id: user.id, ip_address: req.ip, user_agent: req.get('user-agent') }]);
  await logActivity(user.id, 'LOGIN', `User ${user.username} logged in successfully.`);

  if (user.role === 'Resident') {
    res.redirect('/resident/dashboard');
  } else {
    res.redirect('/admin/dashboard');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// ==========================================
// PUBLIC RESIDENT REGISTRATION
// ==========================================

app.get('/register', async (req, res) => {
  const { data: puroks } = await supabase.from('puroks').select('*');
  const purokOptions = (puroks || []).map(p => `<option value="${p.id}">${p.purok_name}</option>`).join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><title>Resident Registration | BRMS</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body class="bg-slate-100 min-h-screen py-12 px-4 flex items-center justify-center">
  <div class="bg-white max-w-2xl w-full p-8 rounded-2xl shadow-xl border-t-4 border-primary">
    <div class="text-center mb-6">
      <i class="fa-solid fa-id-card text-4xl text-primary mb-2"></i>
      <h2 class="text-2xl font-bold text-slate-800">Resident Public Registration</h2>
      <p class="text-xs text-slate-500">Fill out accurate information for barangay verification and ID generation.</p>
    </div>
    <form action="/register" method="POST" enctype="multipart/form-data" class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div><label class="block text-xs font-semibold text-slate-700 mb-1">First Name</label><input type="text" name="first_name" required class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div><label class="block text-xs font-semibold text-slate-700 mb-1">Middle Name</label><input type="text" name="middle_name" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div><label class="block text-xs font-semibold text-slate-700 mb-1">Last Name</label><input type="text" name="last_name" required class="w-full px-3 py-2 border rounded-lg text-sm"></div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div><label class="block text-xs font-semibold text-slate-700 mb-1">Date of Birth</label><input type="date" name="date_of_birth" required class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div><label class="block text-xs font-semibold text-slate-700 mb-1">Gender</label><select name="gender" class="w-full px-3 py-2 border rounded-lg text-sm"><option>Male</option><option>Female</option></select></div>
        <div><label class="block text-xs font-semibold text-slate-700 mb-1">Civil Status</label><select name="civil_status" class="w-full px-3 py-2 border rounded-lg text-sm"><option>Single</option><option>Married</option><option>Widowed</option><option>Divorced</option></select></div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label class="block text-xs font-semibold text-slate-700 mb-1">Contact Number</label><input type="text" name="contact_number" required class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div><label class="block text-xs font-semibold text-slate-700 mb-1">Email Address</label><input type="email" name="email" required class="w-full px-3 py-2 border rounded-lg text-sm"></div>
      </div>
      <div><label class="block text-xs font-semibold text-slate-700 mb-1">Complete Street Address</label><input type="text" name="address" required class="w-full px-3 py-2 border rounded-lg text-sm"></div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label class="block text-xs font-semibold text-slate-700 mb-1">Purok</label><select name="purok_id" required class="w-full px-3 py-2 border rounded-lg text-sm">${purokOptions}</select></div>
        <div><label class="block text-xs font-semibold text-slate-700 mb-1">Occupation</label><input type="text" name="occupation" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label class="block text-xs font-semibold text-slate-700 mb-1">Password</label><input type="password" name="password" required class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div><label class="block text-xs font-semibold text-slate-700 mb-1">Resident Photo</label><input type="file" name="resident_photo" class="w-full px-2 py-1.5 border rounded-lg text-sm bg-white"></div>
      </div>
      <button type="submit" class="w-full bg-primary text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition shadow-lg text-sm">Submit Registration for Approval</button>
    </form>
    <div class="mt-4 text-center text-xs"><a href="/login" class="text-primary font-semibold hover:underline">Already registered? Sign in here</a></div>
  </div>
</body>
</html>`);
});

app.post('/register', upload.single('resident_photo'), async (req, res) => {
  const { first_name, middle_name, last_name, date_of_birth, gender, civil_status, contact_number, email, address, purok_id, occupation, password } = req.body;
  
  // Calculate age
  const dob = new Date(date_of_birth);
  const age = new Date().getFullYear() - dob.getFullYear();

  const hash = await bcrypt.hash(password, 10);
  const { data: userObj, error: userErr } = await supabase.from('users').insert([{
    full_name: `${first_name} ${last_name}`, username: email, email, password_hash: hash, role: 'Resident', status: 'Active'
  }]).select().single();

  if (userErr) return res.send(`Registration Error: ${userErr.message}`);

  const residentIdNum = `BRMS-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
  const qrToken = `VERIFY-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
  let photoUrl = '';
  if (req.file) {
    const fileName = `resident_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const { data: uploadData, error: uploadErr } = await supabase.storage.from('residents').upload(fileName, req.file.buffer, { contentType: req.file.mimetype });
    if (!uploadErr) {
      const { data: { publicUrl } } = supabase.storage.from('residents').getPublicUrl(fileName);
      photoUrl = publicUrl;
    }
  }

  await supabase.from('residents').insert([{
    resident_id: residentIdNum,
    user_id: userObj.id,
    first_name, middle_name, last_name,
    date_of_birth, age, gender, civil_status,
    contact_number, email, address, purok_id,
    occupation, resident_status: 'Pending',
    resident_photo: photoUrl,
    qr_code_token: qrToken
  }]);

  res.send(renderLayout('Registration Submitted', null, `
    <div class="max-w-md mx-auto bg-white p-8 rounded-xl shadow-md text-center mt-12 border-t-4 border-emerald-500">
      <i class="fa-solid fa-circle-check text-5xl text-emerald-500 mb-4"></i>
      <h3 class="text-2xl font-bold text-slate-800 mb-2">Registration Successful</h3>
      <p class="text-slate-600 text-sm mb-6">Your account and resident profile have been submitted for barangay staff review and verification. You will be notified once approved.</p>
      <a href="/login" class="bg-primary text-white px-6 py-2.5 rounded-lg font-semibold text-sm">Proceed to Login</a>
    </div>
  `));
});

// ==========================================
// ADMIN & STAFF PORTAL MODULES
// ==========================================

app.get('/admin/dashboard', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), async (req, res) => {
  const { count: totalResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true });
  const { count: activeResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'Active');
  const { count: pendingResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'Pending');
  const { count: totalHouseholds } = await supabase.from('households').select('*', { count: 'exact', head: true });
  const { count: pendingRequests } = await supabase.from('certificate_requests').select('*', { count: 'exact', head: true }).eq('status', 'Pending');
  const { count: activeBlotter } = await supabase.from('blotter_records').select('*', { count: 'exact', head: true }).eq('status', 'Active');
  const { data: recentLogs } = await supabase.from('activity_logs').select('*, users(full_name)').order('created_at', { ascending: false }).limit(5);

  const logsHtml = (recentLogs || []).map(l => `
    <tr class="border-b text-xs">
      <td class="py-3 px-4 font-semibold text-slate-700">${l.users ? l.users.full_name : 'System'}</td>
      <td class="py-3 px-4 text-primary font-bold">${l.action}</td>
      <td class="py-3 px-4 text-slate-600">${l.details || ''}</td>
      <td class="py-3 px-4 text-slate-400">${new Date(l.created_at).toLocaleString()}</td>
    </tr>
  `).join('');

  const content = `
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-primary">
        <p class="text-xs font-bold uppercase text-slate-400">Total Residents</p>
        <h3 class="text-3xl font-extrabold text-slate-800 mt-1">${totalResidents || 0}</h3>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-emerald-500">
        <p class="text-xs font-bold uppercase text-slate-400">Active Residents</p>
        <h3 class="text-3xl font-extrabold text-emerald-600 mt-1">${activeResidents || 0}</h3>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-amber-500">
        <p class="text-xs font-bold uppercase text-slate-400">Pending Registrations</p>
        <h3 class="text-3xl font-extrabold text-amber-600 mt-1">${pendingResidents || 0}</h3>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-600">
        <p class="text-xs font-bold uppercase text-slate-400">Households</p>
        <h3 class="text-3xl font-extrabold text-blue-600 mt-1">${totalHouseholds || 0}</h3>
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-indigo-500">
        <p class="text-xs font-bold uppercase text-slate-400">Pending Certificate Requests</p>
        <h3 class="text-3xl font-extrabold text-indigo-600 mt-1">${pendingRequests || 0}</h3>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-rose-500">
        <p class="text-xs font-bold uppercase text-slate-400">Active Blotter Cases</p>
        <h3 class="text-3xl font-extrabold text-rose-600 mt-1">${activeBlotter || 0}</h3>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm flex items-center justify-between">
        <div>
          <p class="text-xs font-bold uppercase text-slate-400">Quick Actions</p>
          <div class="mt-2 flex space-x-2">
            <a href="/admin/residents" class="bg-primary text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700">Review Residents</a>
            <a href="/admin/documents" class="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-700">Process Docs</a>
          </div>
        </div>
      </div>
    </div>
    <div class="bg-white rounded-xl shadow-sm p-6">
      <h3 class="text-lg font-bold text-slate-800 mb-4 flex items-center space-x-2">
        <i class="fa-solid fa-clock-rotate-left text-primary"></i><span>Recent System Activity Logs</span>
      </h3>
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr class="border-b text-xs font-semibold text-slate-500 uppercase bg-slate-50">
              <th class="py-3 px-4">User</th>
              <th class="py-3 px-4">Action</th>
              <th class="py-3 px-4">Details</th>
              <th class="py-3 px-4">Timestamp</th>
            </tr>
          </thead>
          <tbody>${logsHtml || '<tr><td colspan="4" class="py-4 text-center text-slate-400">No recent activity recorded.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
  res.send(renderLayout('Admin Dashboard', req.session.user, content, 'dashboard'));
});

// Resident Management Module
app.get('/admin/residents', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), async (req, res) => {
  const { search, purok, status } = req.query;
  let query = supabase.from('residents').select('*, puroks(purok_name), households(household_number)');

  if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,resident_id.ilike.%${search}%`);
  if (purok) query = query.eq('purok_id', purok);
  if (status) query = query.eq('resident_status', status);

  const { data: residents } = await query.order('created_at', { ascending: false });
  const { data: puroks } = await supabase.from('puroks').select('*');

  const purokOpts = (puroks || []).map(p => `<option value="${p.id}" ${purok === p.id ? 'selected' : ''}>${p.purok_name}</option>`).join('');

  const residentRows = (residents || []).map(r => `
    <tr class="border-b text-sm hover:bg-slate-50">
      <td class="py-3 px-4 font-bold text-primary">${r.resident_id}</td>
      <td class="py-3 px-4 flex items-center space-x-3">
        <img src="${r.resident_photo || 'https://via.placeholder.com/40'}" class="w-10 h-10 rounded-full object-cover border">
        <div>
          <p class="font-semibold text-slate-800">${r.first_name} ${r.last_name}</p>
          <p class="text-xs text-slate-500">${r.contact_number}</p>
        </div>
      </td>
      <td class="py-3 px-4">${r.puroks ? r.puroks.purok_name : 'N/A'}</td>
      <td class="py-3 px-4"><span class="px-2.5 py-1 text-xs rounded-full font-semibold ${r.resident_status === 'Active' ? 'bg-emerald-100 text-emerald-800' : r.resident_status === 'Pending' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}">${r.resident_status}</span></td>
      <td class="py-3 px-4 text-right space-x-2">
        ${r.resident_status === 'Pending' ? `<form action="/admin/residents/approve/${r.id}" method="POST" class="inline"><button class="bg-emerald-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-emerald-700">Approve</button></form>` : ''}
        <a href="/admin/residents/view/${r.id}" class="bg-primary text-white px-3 py-1 rounded text-xs font-semibold hover:bg-blue-700">View / ID</a>
      </td>
    </tr>
  `).join('');

  const content = `
    <div class="bg-white rounded-xl shadow-sm p-6 mb-6">
      <form method="GET" class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div><input type="text" name="search" value="${search || ''}" placeholder="Search name or ID..." class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div><select name="purok" class="w-full px-3 py-2 border rounded-lg text-sm"><option value="">All Puroks</option>${purokOpts}</select></div>
        <div><select name="status" class="w-full px-3 py-2 border rounded-lg text-sm"><option value="">All Status</option><option value="Active">Active</option><option value="Pending">Pending</option><option value="Archived">Archived</option></select></div>
        <div class="flex space-x-2">
          <button type="submit" class="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-700">Filter</button>
          <a href="/admin/residents" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center">Reset</a>
        </div>
      </form>
    </div>
    <div class="bg-white rounded-xl shadow-sm overflow-hidden">
      <table class="w-full text-left">
        <thead>
          <tr class="border-b text-xs font-semibold text-slate-500 uppercase bg-slate-50">
            <th class="py-3 px-4">Resident ID</th>
            <th class="py-3 px-4">Resident Name</th>
            <th class="py-3 px-4">Purok</th>
            <th class="py-3 px-4">Status</th>
            <th class="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>${residentRows || '<tr><td colspan="5" class="py-6 text-center text-slate-400">No residents found.</td></tr>'}</tbody>
      </table>
    </div>
  `;
  res.send(renderLayout('Resident Management', req.session.user, content, 'residents'));
});

app.post('/admin/residents/approve/:id', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary']), async (req, res) => {
  const residentId = req.params.id;
  await supabase.from('residents').update({ resident_status: 'Active' }).eq('id', residentId);
  await logActivity(req.session.user.id, 'APPROVE_RESIDENT', `Approved resident ID: ${residentId}`);
  res.redirect('/admin/residents');
});

app.get('/admin/residents/view/:id', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), async (req, res) => {
  const { data: r } = await supabase.from('residents').select('*, puroks(purok_name), households(household_number)').eq('id', req.params.id).single();
  const { data: settings } = await supabase.from('barangay_settings').select('*').single();
  if (!r) return res.status(404).send('Resident not found.');

  const qrDataUrl = await QRCode.toDataURL(r.qr_code_token);

  const content = `
    <div class="flex justify-between items-center mb-6 no-print">
      <h3 class="text-xl font-bold text-slate-800">Resident Profile & Physical Card</h3>
      <button onclick="window.print()" class="bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"><i class="fa-solid fa-print mr-2"></i>Print Resident Card</button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white p-6 rounded-xl shadow-sm md:col-span-1">
        <img src="${r.resident_photo || 'https://via.placeholder.com/150'}" class="w-32 h-32 rounded-full object-cover mx-auto mb-4 border-4 border-emerald-500 shadow-md">
        <h3 class="text-xl font-bold text-center text-slate-800">${r.first_name} ${r.middle_name || ''} ${r.last_name}</h3>
        <p class="text-xs text-center text-primary font-bold mb-4">${r.resident_id}</p>
        <div class="space-y-2 text-sm border-t pt-4">
          <p><strong class="text-slate-500">Gender:</strong> ${r.gender}</p>
          <p><strong class="text-slate-500">Age / DOB:</strong> ${r.age} (${r.date_of_birth})</p>
          <p><strong class="text-slate-500">Contact:</strong> ${r.contact_number}</p>
          <p><strong class="text-slate-500">Purok:</strong> ${r.puroks ? r.puroks.purok_name : 'N/A'}</p>
          <p><strong class="text-slate-500">Address:</strong> ${r.address}</p>
        </div>
      </div>
      <!-- Barangay Resident Card Preview -->
      <div class="bg-white p-6 rounded-xl shadow-sm md:col-span-2 flex flex-col items-center justify-center">
        <div class="w-[420px] h-[260px] bg-gradient-to-br from-blue-900 via-emerald-800 to-slate-900 rounded-2xl p-4 text-white shadow-xl relative overflow-hidden border-2 border-emerald-400 flex flex-col justify-between">
          <div class="flex items-center justify-between border-b border-white/20 pb-2">
            <div class="flex items-center space-x-2">
              <i class="fa-solid fa-landmark text-emerald-400 text-xl"></i>
              <div>
                <h4 class="text-xs font-bold uppercase tracking-wider">${settings ? settings.barangay_name : 'Barangay'}</h4>
                <p class="text-[9px] text-emerald-300">${settings ? settings.municipality : 'Municipality'}</p>
              </div>
            </div>
            <span class="bg-emerald-500 text-white text-[9px] px-2 py-0.5 rounded font-bold uppercase">BARANGAY RESIDENT CARD</span>
          </div>
          <div class="flex items-center space-x-4 my-auto">
            <img src="${r.resident_photo || 'https://via.placeholder.com/80'}" class="w-20 h-24 object-cover rounded-lg border-2 border-white shadow">
            <div class="text-xs space-y-1">
              <p class="font-extrabold text-sm text-emerald-300">${r.last_name}, ${r.first_name}</p>
              <p><span class="text-slate-300">ID No:</span> ${r.resident_id}</p>
              <p><span class="text-slate-300">DOB:</span> ${r.date_of_birth} (${r.gender})</p>
              <p><span class="text-slate-300">Purok:</span> ${r.puroks ? r.puroks.purok_name : 'N/A'}</p>
              <p class="truncate max-w-[200px]"><span class="text-slate-300">Address:</span> ${r.address}</p>
            </div>
          </div>
          <div class="flex items-center justify-between border-t border-white/20 pt-2 text-[9px]">
            <div>
              <p class="font-bold text-emerald-300">Official Identification</p>
              <p class="text-slate-300">Valid within barangay jurisdiction</p>
            </div>
            <img src="${qrDataUrl}" class="w-12 h-12 bg-white p-0.5 rounded">
          </div>
        </div>
      </div>
    </div>
  `;
  res.send(renderLayout('Resident Details & ID', req.session.user, content, 'residents'));
});

// Household & Purok Management
app.get('/admin/households', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), async (req, res) => {
  const { data: households } = await supabase.from('households').select('*, puroks(purok_name)');
  const householdRows = (households || []).map(h => `
    <tr class="border-b text-sm">
      <td class="py-3 px-4 font-bold text-primary">${h.household_number}</td>
      <td class="py-3 px-4 font-semibold">${h.household_head}</td>
      <td class="py-3 px-4">${h.address}</td>
      <td class="py-3 px-4">${h.puroks ? h.puroks.purok_name : 'N/A'}</td>
      <td class="py-3 px-4"><span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs rounded-full font-semibold">${h.household_status}</span></td>
    </tr>
  `).join('');

  const content = `
    <div class="bg-white rounded-xl shadow-sm overflow-hidden">
      <table class="w-full text-left">
        <thead>
          <tr class="border-b text-xs font-semibold text-slate-500 uppercase bg-slate-50">
            <th class="py-3 px-4">Household Number</th>
            <th class="py-3 px-4">Household Head</th>
            <th class="py-3 px-4">Address</th>
            <th class="py-3 px-4">Purok</th>
            <th class="py-3 px-4">Status</th>
          </tr>
        </thead>
        <tbody>${householdRows || '<tr><td colspan="5" class="py-6 text-center text-slate-400">No households recorded.</td></tr>'}</tbody>
      </table>
    </div>
  `;
  res.send(renderLayout('Household Management', req.session.user, content, 'households'));
});

app.get('/admin/puroks', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), async (req, res) => {
  const { data: puroks } = await supabase.from('puroks').select('*');
  
  // Dynamically calculate real resident count per purok from Supabase
  const purokCards = await Promise.all((puroks || []).map(async p => {
    const { count } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('purok_id', p.id);
    return `
      <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-emerald-500">
        <h3 class="text-xl font-bold text-slate-800 mb-1">${p.purok_name}</h3>
        <p class="text-xs text-slate-500 mb-4">${p.description || 'Barangay Purok jurisdiction'}</p>
        <div class="flex justify-between items-center bg-emerald-50 p-3 rounded-lg border border-emerald-100">
          <span class="text-xs font-bold text-emerald-800 uppercase">Registered Residents</span>
          <span class="text-2xl font-extrabold text-emerald-600">${count || 0}</span>
        </div>
      </div>
    `;
  }));

  const content = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      ${purokCards.join('') || '<div class="col-span-3 text-center text-slate-400 py-8">No puroks defined in the system.</div>'}
    </div>
  `;
  res.send(renderLayout('Purok Management', req.session.user, content, 'puroks'));
});

// Certificate & Document Management Module
app.get('/admin/documents', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), async (req, res) => {
  const { data: requests } = await supabase.from('certificate_requests').select('*, residents(first_name, last_name, resident_id)');
  const requestRows = (requests || []).map(reqItem => `
    <tr class="border-b text-sm">
      <td class="py-3 px-4 font-bold text-primary">${reqItem.request_number}</td>
      <td class="py-3 px-4 font-semibold">${reqItem.residents ? `${reqItem.residents.first_name}${reqItem.residents.last_name}` : 'Unknown'}</td>
      <td class="py-3 px-4">${reqItem.document_type}</td>
      <td class="py-3 px-4">${reqItem.purpose}</td>
      <td class="py-3 px-4"><span class="px-2.5 py-1 text-xs rounded-full font-semibold ${reqItem.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : reqItem.status === 'Pending' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}">${reqItem.status}</span></td>
      <td class="py-3 px-4 text-right space-x-2">
        ${reqItem.status === 'Pending' ? `<form action="/admin/documents/approve/${reqItem.id}" method="POST" class="inline"><button class="bg-emerald-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-emerald-700">Approve</button></form>` : ''}
      </td>
    </tr>
  `).join('');

  const content = `
    <div class="bg-white rounded-xl shadow-sm overflow-hidden">
      <table class="w-full text-left">
        <thead>
          <tr class="border-b text-xs font-semibold text-slate-500 uppercase bg-slate-50">
            <th class="py-3 px-4">Request No</th>
            <th class="py-3 px-4">Resident</th>
            <th class="py-3 px-4">Document Type</th>
            <th class="py-3 px-4">Purpose</th>
            <th class="py-3 px-4">Status</th>
            <th class="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>${requestRows || '<tr><td colspan="6" class="py-6 text-center text-slate-400">No document requests found.</td></tr>'}</tbody>
      </table>
    </div>
  `;
  res.send(renderLayout('Certificate & Document Requests', req.session.user, content, 'documents'));
});

app.post('/admin/documents/approve/:id', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary']), async (req, res) => {
  const reqId = req.params.id;
  await supabase.from('certificate_requests').update({ status: 'Approved' }).eq('id', reqId);
  await logActivity(req.session.user.id, 'APPROVE_DOCUMENT', `Approved certificate request ID: ${reqId}`);
  res.redirect('/admin/documents');
});

// Dedicated QR Scanner & Release Route
app.get('/scanner', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), async (req, res) => {
  const content = `
    <div class="max-w-xl mx-auto bg-white p-8 rounded-xl shadow-sm text-center border-t-4 border-emerald-500">
      <i class="fa-solid fa-qrcode text-6xl text-primary mb-4"></i>
      <h3 class="text-2xl font-bold text-slate-800 mb-2">Resident QR Verification & Claiming</h3>
      <p class="text-slate-600 text-xs mb-6">Scan resident QR code or enter verification token manually to process certificate release.</p>
      <form action="/scanner/verify" method="POST" class="space-y-4">
        <input type="text" name="qr_token" required placeholder="Enter QR Verification Token..." class="w-full px-4 py-3 border rounded-lg text-sm text-center font-mono">
        <button type="submit" class="w-full bg-emerald-600 text-white font-semibold py-3 rounded-lg hover:bg-emerald-700 transition shadow">Verify & Release Document</button>
      </form>
    </div>
  `;
  res.send(renderLayout('QR Scanner & Release', req.session.user, content, 'scanner'));
});

app.post('/scanner/verify', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), async (req, res) => {
  const { qr_token } = req.body;
  const { data: resident } = await supabase.from('residents').select('*, puroks(purok_name)').eq('qr_code_token', qr_token).single();

  if (!resident) {
    return res.send(renderLayout('QR Verification', req.session.user, `
      <div class="max-w-md mx-auto bg-white p-8 rounded-xl shadow-sm text-center border-t-4 border-rose-500">
        <i class="fa-solid fa-triangle-exclamation text-5xl text-rose-500 mb-4"></i>
        <h3 class="text-xl font-bold text-slate-800 mb-2">Invalid QR Token</h3>
        <p class="text-slate-600 text-xs mb-6">No registered resident matches the scanned verification token.</p>
        <a href="/scanner" class="bg-primary text-white px-4 py-2 rounded-lg text-xs font-semibold">Try Again</a>
      </div>
    `));
  }

  res.send(renderLayout('QR Verification Successful', req.session.user, `
    <div class="max-w-lg mx-auto bg-white p-8 rounded-xl shadow-sm border-t-4 border-emerald-500">
      <div class="flex items-center space-x-4 mb-6 border-b pb-4">
        <img src="${resident.resident_photo || 'https://via.placeholder.com/80'}" class="w-20 h-20 rounded-full object-cover border-2 border-emerald-500">
        <div>
          <span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">VERIFIED RESIDENT</span>
          <h3 class="text-xl font-bold text-slate-800 mt-1">${resident.first_name} ${resident.last_name}</h3>
          <p class="text-xs text-primary font-bold">${resident.resident_id}</p>
        </div>
      </div>
      <div class="space-y-2 text-sm mb-6">
        <p><strong class="text-slate-500">Contact:</strong> ${resident.contact_number}</p>
        <p><strong class="text-slate-500">Purok:</strong> ${resident.puroks ? resident.puroks.purok_name : 'N/A'}</p>
        <p><strong class="text-slate-500">Address:</strong> ${resident.address}</p>
      </div>
      <a href="/scanner" class="block text-center bg-primary text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700">Scan Another QR</a>
    </div>
  `));
});

// Bulk 8 IDs per Bond Paper Printing Layout
app.get('/admin/ids', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), async (req, res) => {
  const { data: residents } = await supabase.from('residents').select('*, puroks(purok_name)').eq('resident_status', 'Active').limit(8);

  const cardsHtml = await Promise.all((residents || []).map(async r => {
    const qrDataUrl = await QRCode.toDataURL(r.qr_code_token);
    return `
      <div class="w-[3.375in] h-[2.125in] bg-gradient-to-br from-blue-900 via-emerald-800 to-slate-900 rounded-xl p-3 text-white shadow border border-emerald-400 flex flex-col justify-between overflow-hidden">
        <div class="flex items-center justify-between border-b border-white/20 pb-1">
          <div class="flex items-center space-x-1.5">
            <i class="fa-solid fa-landmark text-emerald-400 text-sm"></i>
            <h4 class="text-[9px] font-bold uppercase tracking-wider">Barangay Resident Card</h4>
          </div>
          <span class="text-[8px] bg-emerald-500 px-1.5 py-0.2 rounded font-bold">OFFICIAL</span>
        </div>
        <div class="flex items-center space-x-3 my-auto">
          <img src="${r.resident_photo || 'https://via.placeholder.com/60'}" class="w-14 h-16 object-cover rounded border border-white">
          <div class="text-[9px] space-y-0.5">
            <p class="font-bold text-emerald-300 text-xs">${r.last_name}, ${r.first_name}</p>
            <p>ID: ${r.resident_id}</p>
            <p>DOB: ${r.date_of_birth}</p>
            <p>Purok: ${r.puroks ? r.puroks.purok_name : 'N/A'}</p>
          </div>
        </div>
        <div class="flex justify-between items-center border-t border-white/20 pt-1 text-[8px]">
          <span>Jurisdiction ID</span>
          <img src="${qrDataUrl}" class="w-8 h-8 bg-white p-0.5 rounded">
        </div>
      </div>
    `;
  }));

  const content = `
    <div class="flex justify-between items-center mb-6 no-print">
      <h3 class="text-xl font-bold text-slate-800">Bulk ID Printing (8 IDs per Standard Bond Paper)</h3>
      <button onclick="window.print()" class="bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"><i class="fa-solid fa-print mr-2"></i>Print 8-Up Sheet</button>
    </div>
    <div class="bg-white p-8 rounded-xl shadow-sm mx-auto grid grid-cols-2 gap-4 w-[8.5in] min-h-[11in] justify-items-center items-center">
      ${cardsHtml.join('') || '<p class="col-span-2 text-center text-slate-400">No active residents found for bulk ID printing.</p>'}
    </div>
  `;
  res.send(renderLayout('Bulk ID Printing', req.session.user, content, 'ids'));
});

// Blotter Management Module
app.get('/admin/blotter', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), async (req, res) => {
  const { data: records } = await supabase.from('blotter_records').select('*');
  const rows = (records || []).map(b => `
    <tr class="border-b text-sm">
      <td class="py-3 px-4 font-bold text-primary">${b.case_number}</td>
      <td class="py-3 px-4">${b.complainant}</td>
      <td class="py-3 px-4">${b.respondent}</td>
      <td class="py-3 px-4">${b.incident_date}</td>
      <td class="py-3 px-4"><span class="px-2.5 py-1 text-xs rounded-full font-semibold bg-emerald-100 text-emerald-800">${b.status}</span></td>
    </tr>
  `).join('');

  const content = `
    <div class="bg-white rounded-xl shadow-sm overflow-hidden">
      <table class="w-full text-left">
        <thead>
          <tr class="border-b text-xs font-semibold text-slate-500 uppercase bg-slate-50">
            <th class="py-3 px-4">Case No</th>
            <th class="py-3 px-4">Complainant</th>
            <th class="py-3 px-4">Respondent</th>
            <th class="py-3 px-4">Incident Date</th>
            <th class="py-3 px-4">Status</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5" class="py-6 text-center text-slate-400">No blotter records found.</td></tr>'}</tbody>
      </table>
    </div>
  `;
  res.send(renderLayout('Blotter & Incident Records', req.session.user, content, 'blotter'));
});

// Reports & Analytics Module
app.get('/admin/reports', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary']), async (req, res) => {
  const { count: totalResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true });
  const { count: totalHouseholds } = await supabase.from('households').select('*', { count: 'exact', head: true });
  const { count: totalBlotter } = await supabase.from('blotter_records').select('*', { count: 'exact', head: true });

  const content = `
    <div class="flex justify-between items-center mb-6 no-print">
      <h3 class="text-xl font-bold text-slate-800">Barangay Statistical Reports</h3>
      <button onclick="window.print()" class="bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"><i class="fa-solid fa-print mr-2"></i>Print Report</button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-primary">
        <p class="text-xs font-bold uppercase text-slate-400">Total Population</p>
        <h3 class="text-3xl font-extrabold text-slate-800 mt-1">${totalResidents || 0}</h3>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-emerald-500">
        <p class="text-xs font-bold uppercase text-slate-400">Total Households</p>
        <h3 class="text-3xl font-extrabold text-emerald-600 mt-1">${totalHouseholds || 0}</h3>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-rose-500">
        <p class="text-xs font-bold uppercase text-slate-400">Blotter Records</p>
        <h3 class="text-3xl font-extrabold text-rose-600 mt-1">${totalBlotter || 0}</h3>
      </div>
    </div>
  `;
  res.send(renderLayout('Reports & Analytics', req.session.user, content, 'reports'));
});

// Barangay Settings Module
app.get('/admin/settings', requireAuth(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const { data: settings } = await supabase.from('barangay_settings').select('*').single();

  const content = `
    <div class="bg-white p-8 rounded-xl shadow-sm max-w-2xl mx-auto border-t-4 border-primary">
      <h3 class="text-xl font-bold text-slate-800 mb-6">Barangay System Configuration</h3>
      <form action="/admin/settings" method="POST" class="space-y-4">
        <div><label class="block text-xs font-semibold text-slate-700 mb-1">Barangay Name</label><input type="text" name="barangay_name" value="${settings ? settings.barangay_name : ''}" required class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div><label class="block text-xs font-semibold text-slate-700 mb-1">Municipality / City</label><input type="text" name="municipality" value="${settings ? settings.municipality : ''}" required class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div><label class="block text-xs font-semibold text-slate-700 mb-1">Province</label><input type="text" name="province" value="${settings ? settings.province : ''}" required class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div><label class="block text-xs font-semibold text-slate-700 mb-1">Barangay Captain</label><input type="text" name="barangay_captain" value="${settings ? settings.barangay_captain : ''}" required class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <button type="submit" class="bg-primary text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700">Save Configuration</button>
      </form>
    </div>
  `;
  res.send(renderLayout('Barangay Settings', req.session.user, content, 'settings'));
});

app.post('/admin/settings', requireAuth(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const { barangay_name, municipality, province, barangay_captain } = req.body;
  await supabase.from('barangay_settings').update({ barangay_name, municipality, province, barangay_captain }).eq('id', (await supabase.from('barangay_settings').select('id').single()).data.id);
  await logActivity(req.session.user.id, 'UPDATE_SETTINGS', 'Updated barangay configuration settings.');
  res.redirect('/admin/settings');
});

// ==========================================
// RESIDENT PORTAL MODULES
// ==========================================

app.get('/resident/dashboard', requireAuth(['Resident']), async (req, res) => {
  const { data: resident } = await supabase.from('residents').select('*, puroks(purok_name), households(household_number)').eq('user_id', req.session.user.id).single();
  if (!resident) return res.send('Resident profile not linked to user account.');

  const content = `
    <div class="bg-gradient-to-r from-blue-900 to-emerald-800 text-white p-8 rounded-2xl shadow-xl mb-8 flex items-center justify-between">
      <div>
        <span class="bg-emerald-500 text-white text-xs px-2.5 py-1 rounded-full font-bold uppercase">Verified Resident Portal</span>
        <h3 class="text-3xl font-extrabold mt-2">Welcome back, ${resident.first_name}!</h3>
        <p class="text-emerald-300 text-sm mt-1">Resident ID: ${resident.resident_id} | Purok: ${resident.puroks ? resident.puroks.purok_name : 'N/A'}</p>
      </div>
      <img src="${resident.resident_photo || 'https://via.placeholder.com/100'}" class="w-24 h-24 rounded-full object-cover border-4 border-emerald-400 shadow-md">
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-primary">
        <p class="text-xs font-bold uppercase text-slate-400">My Status</p>
        <h3 class="text-2xl font-extrabold text-emerald-600 mt-1">${resident.resident_status}</h3>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-emerald-500">
        <p class="text-xs font-bold uppercase text-slate-400">Household Number</p>
        <h3 class="text-2xl font-extrabold text-slate-800 mt-1">${resident.households ? resident.households.household_number : 'Unassigned'}</h3>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-indigo-500">
        <p class="text-xs font-bold uppercase text-slate-400">Quick Request</p>
        <div class="mt-2"><a href="/resident/certificates" class="bg-primary text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-blue-700">Request Certificate</a></div>
      </div>
    </div>
  `;
  res.send(renderLayout('Resident Dashboard', req.session.user, content, 'dashboard'));
});

app.get('/resident/profile', requireAuth(['Resident']), async (req, res) => {
  const { data: r } = await supabase.from('residents').select('*, puroks(purok_name), households(household_number)').eq('user_id', req.session.user.id).single();
  const { data: settings } = await supabase.from('barangay_settings').select('*').single();
  const qrDataUrl = await QRCode.toDataURL(r.qr_code_token);

  const content = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white p-6 rounded-xl shadow-sm md:col-span-1">
        <img src="${r.resident_photo || 'https://via.placeholder.com/150'}" class="w-32 h-32 rounded-full object-cover mx-auto mb-4 border-4 border-emerald-500 shadow">
        <h3 class="text-xl font-bold text-center text-slate-800">${r.first_name} ${r.last_name}</h3>
        <p class="text-xs text-center text-primary font-bold mb-4">${r.resident_id}</p>
        <div class="space-y-2 text-sm border-t pt-4">
          <p><strong class="text-slate-500">Contact:</strong> ${r.contact_number}</p>
          <p><strong class="text-slate-500">Address:</strong> ${r.address}</p>
        </div>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm md:col-span-2 flex flex-col items-center justify-center">
        <h4 class="text-lg font-bold text-slate-800 mb-4">My Digital Barangay Resident Card</h4>
        <div class="w-[420px] h-[260px] bg-gradient-to-br from-blue-900 via-emerald-800 to-slate-900 rounded-2xl p-4 text-white shadow-xl relative overflow-hidden border-2 border-emerald-400 flex flex-col justify-between">
          <div class="flex items-center justify-between border-b border-white/20 pb-2">
            <div class="flex items-center space-x-2">
              <i class="fa-solid fa-landmark text-emerald-400 text-xl"></i>
              <div>
                <h4 class="text-xs font-bold uppercase tracking-wider">${settings ? settings.barangay_name : 'Barangay'}</h4>
                <p class="text-[9px] text-emerald-300">${settings ? settings.municipality : 'Municipality'}</p>
              </div>
            </div>
            <span class="bg-emerald-500 text-white text-[9px] px-2 py-0.5 rounded font-bold uppercase">DIGITAL CARD</span>
          </div>
          <div class="flex items-center space-x-4 my-auto">
            <img src="${r.resident_photo || 'https://via.placeholder.com/80'}" class="w-20 h-24 object-cover rounded-lg border-2 border-white shadow">
            <div class="text-xs space-y-1">
              <p class="font-extrabold text-sm text-emerald-300">${r.last_name}, ${r.first_name}</p>
              <p><span class="text-slate-300">ID No:</span> ${r.resident_id}</p>
              <p><span class="text-slate-300">DOB:</span> ${r.date_of_birth} (${r.gender})</p>
              <p><span class="text-slate-300">Purok:</span> ${r.puroks ? r.puroks.purok_name : 'N/A'}</p>
            </div>
          </div>
          <div class="flex items-center justify-between border-t border-white/20 pt-2 text-[9px]">
            <p class="text-emerald-300 font-bold">Verified Digital Identity</p>
            <img src="${qrDataUrl}" class="w-12 h-12 bg-white p-0.5 rounded">
          </div>
        </div>
      </div>
    </div>
  `;
  res.send(renderLayout('My Profile & Digital ID', req.session.user, content, 'profile'));
});

app.get('/resident/certificates', requireAuth(['Resident']), async (req, res) => {
  const { data: resident } = await supabase.from('residents').select('id').eq('user_id', req.session.user.id).single();
  const { data: requests } = await supabase.from('certificate_requests').select('*').eq('resident_id', resident.id);

  const requestRows = (requests || []).map(reqItem => `
    <tr class="border-b text-sm">
      <td class="py-3 px-4 font-bold text-primary">${reqItem.request_number}</td>
      <td class="py-3 px-4">${reqItem.document_type}</td>
      <td class="py-3 px-4">${reqItem.purpose}</td>
      <td class="py-3 px-4"><span class="px-2.5 py-1 text-xs rounded-full font-semibold ${reqItem.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${reqItem.status}</span></td>
    </tr>
  `).join('');

  const content = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div class="bg-white p-6 rounded-xl shadow-sm md:col-span-1 border-t-4 border-primary">
        <h3 class="text-lg font-bold text-slate-800 mb-4">Request Certificate</h3>
        <form action="/resident/certificates" method="POST" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Document Type</label>
            <select name="document_type" class="w-full px-3 py-2 border rounded-lg text-sm">
              <option>Barangay Clearance</option>
              <option>Certificate of Residency</option>
              <option>Certificate of Indigency</option>
              <option>Certificate of Good Moral</option>
            </select>
          </div>
          <div><label class="block text-xs font-semibold text-slate-700 mb-1">Purpose</label><input type="text" name="purpose" required class="w-full px-3 py-2 border rounded-lg text-sm"></div>
          <button type="submit" class="w-full bg-primary text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700">Submit Request</button>
        </form>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm md:col-span-2">
        <h3 class="text-lg font-bold text-slate-800 mb-4">My Requests History</h3>
        <table class="w-full text-left">
          <thead>
            <tr class="border-b text-xs font-semibold text-slate-500 uppercase bg-slate-50">
              <th class="py-3 px-4">Request No</th>
              <th class="py-3 px-4">Type</th>
              <th class="py-3 px-4">Purpose</th>
              <th class="py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody>${requestRows || '<tr><td colspan="4" class="py-6 text-center text-slate-400">No requests submitted.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
  res.send(renderLayout('Certificate Requests', req.session.user, content, 'certificates'));
});

app.post('/resident/certificates', requireAuth(['Resident']), async (req, res) => {
  const { data: resident } = await supabase.from('residents').select('id').eq('user_id', req.session.user.id).single();
  const { document_type, purpose } = req.body;
  const requestNumber = `REQ-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

  await supabase.from('certificate_requests').insert([{
    request_number: requestNumber,
    resident_id: resident.id,
    document_type,
    purpose,
    status: 'Pending'
  }]);

  res.redirect('/resident/certificates');
});

app.get('/resident/complaints', requireAuth(['Resident']), async (req, res) => {
  const content = `<div class="bg-white p-6 rounded-xl shadow-sm"><h3 class="text-lg font-bold text-slate-800">Complaints & Blotter Module</h3><p class="text-sm text-slate-600 mt-2">Submit and monitor community concerns or complaints here.</p></div>`;
  res.send(renderLayout('Complaints', req.session.user, content, 'complaints'));
});

app.get('/resident/assistance', requireAuth(['Resident']), async (req, res) => {
  const content = `<div class="bg-white p-6 rounded-xl shadow-sm"><h3 class="text-lg font-bold text-slate-800">Assistance Request Portal</h3><p class="text-sm text-slate-600 mt-2">Request financial, medical, or food assistance from the barangay.</p></div>`;
  res.send(renderLayout('Assistance', req.session.user, content, 'assistance'));
});

app.get('/resident/appointments', requireAuth(['Resident']), async (req, res) => {
  const content = `<div class="bg-white p-6 rounded-xl shadow-sm"><h3 class="text-lg font-bold text-slate-800">Appointment Booking</h3><p class="text-sm text-slate-600 mt-2">Schedule visits with barangay officials or for document claiming.</p></div>`;
  res.send(renderLayout('Appointments', req.session.user, content, 'appointments'));
});

app.get('/resident/announcements', requireAuth(['Resident']), async (req, res) => {
  const { data: announcements } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
  const cards = (announcements || []).map(a => `
    <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-emerald-500 mb-4">
      <h4 class="text-lg font-bold text-slate-800">${a.title}</h4>
      <p class="text-xs text-slate-400 mb-2">${new Date(a.created_at).toLocaleDateString()}</p>
      <p class="text-sm text-slate-600">${a.content}</p>
    </div>
  `).join('');

  const content = `<div>${cards || '<p class="text-slate-400 text-center py-8">No active barangay announcements.</p>'}</div>`;
  res.send(renderLayout('Announcements', req.session.user, content, 'announcements'));
});

app.get('/resident/emergency', requireAuth(['Resident']), async (req, res) => {
  const { data: contacts } = await supabase.from('emergency_contacts').select('*');
  const rows = (contacts || []).map(c => `
    <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-rose-500 flex justify-between items-center">
      <div>
        <h4 class="font-bold text-slate-800 text-lg">${c.agency_name}</h4>
        <p class="text-xs text-slate-500">${c.address || ''}</p>
      </div>
      <span class="bg-rose-100 text-rose-800 px-4 py-2 rounded-lg font-extrabold text-lg">${c.hotline}</span>
    </div>
  `).join('');

  const content = `<div class="space-y-4 max-w-2xl mx-auto">${rows || '<p class="text-center text-slate-400 py-8">No emergency contacts listed.</p>'}</div>`;
  res.send(renderLayout('Emergency Hotlines', req.session.user, content, 'emergency'));
});

// Initialize Server Startup
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` Barangay Resident Management System Active`);
  console.log(` Port: ${PORT}`);
  console.log(` Environment: Production Ready for Render & Supabase`);
  console.log(`==================================================`);
});
