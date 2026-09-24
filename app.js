/**
 * Barangay Resident Management System (BRMS)
 * Written in Node.js & Express (Single File Architecture)
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'brms_database.json');

// Middleware
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Initial Database Template (Zero Sample Data as requested)
const getInitialData = () => ({
  users: [
    { id: 'u-admin', username: 'admin', password: 'password123', role: 'staff', name: 'Barangay Administrator', status: 'Active' }
  ],
  residents: [],
  households: [],
  puroks: [],
  certificates: [],
  requests: [],
  appointments: [],
  blotters: [],
  assistance: [],
  businesses: [],
  announcements: [],
  notifications: [],
  profileRequests: [],
  feedback: [],
  counters: {
    residentSeq: 1,
    certSeq: 1,
    householdSeq: 1,
    blotterSeq: 1,
    assistanceSeq: 1,
    businessSeq: 1,
    appointmentSeq: 1,
    requestSeq: 1
  }
});

// Load Database from Disk or Create Clean Instance
function loadDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading database file, resetting to empty state:', e);
  }
  const initial = getInitialData();
  saveDB(initial);
  return initial;
}

// Save Database to Disk
function saveDB(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing database file:', e);
  }
}

// Simple Session Store in Memory mapped by Token
const sessions = {};

function getSessionUser(req) {
  const cookieHeader = req.headers['cookie'] || '';
  const match = cookieHeader.match(/brms_token=([^;]+)/);
  if (!match) return null;
  const token = match[1];
  const userId = sessions[token];
  if (!userId) return null;
  const db = loadDB();
  return db.users.find(u => u.id === userId) || null;
}

// Helper for logging notifications
function pushNotification(db, userId, title, message) {
  db.notifications.push({
    id: 'NOTIF-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
    userId: userId,
    title: title,
    message: message,
    date: new Date().toISOString(),
    read: false
  });
}

// =========================================================================
// HTML LAYOUT & COMPONENTS GENERATOR (Single File UI)
// =========================================================================
function renderLayout(title, content, user, activeTab = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Barangay Resident Management System</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
      body { font-family: 'Inter', sans-serif; }
      @media print {
        no-print { display: none !important; }
        .print-only { display: block !important; }
        body { background: white; color: black; }
      }
    </style>
</head>
<body class="bg-slate-50 text-slate-800 antialiased min-h-screen flex flex-col">
    ${user ? `
    <header class="bg-blue-900 text-white shadow-md sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
            <div class="flex items-center space-x-3">
                <div class="bg-amber-500 text-blue-950 font-bold p-2 rounded-lg shadow">
                    <i class="fa-solid fa-landmark text-xl"></i>
                </div>
                <div>
                    <h1 class="font-bold text-lg leading-tight">Barangay Management System</h1>
                    <p class="text-xs text-blue-200">Official Portal &bull; ${user.role === 'staff' ? 'Staff Control Panel' : 'Resident Portal'}</p>
                </div>
            </div>
            <div class="flex items-center space-x-4">
                <div class="text-right hidden sm:block">
                    <p class="text-sm font-semibold">${user.name || user.username}</p>
                    <p class="text-xs text-blue-300 capitalize">${user.role}</p>
                </div>
                <a href="/logout" class="bg-blue-800 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm transition flex items-center space-x-1 border border-blue-700">
                    <i class="fa-solid fa-right-from-bracket"></i>
                    <span>Logout</span>
                </a>
            </div>
        </div>
    </header>
    ` : ''}

    <main class="flex-grow">
        ${content}
    </main>

    <footer class="bg-slate-900 text-slate-400 py-6 text-center text-xs mt-auto border-t border-slate-800">
        <p>&copy; ${new Date().getFullYear()} Barangay Resident Management System. All rights reserved.</p>
        <p class="mt-1 text-slate-500">Secure Government Information Portal</p>
    </footer>
</body>
</html>`;
}

// =========================================================================
// ROUTES: AUTHENTICATION & PORTAL ROUTER
// =========================================================================
app.get('/login', (req, res) => {
  const user = getSessionUser(req);
  if (user) {
    return res.redirect(user.role === 'staff' ? '/staff' : '/resident');
  }

  const html = `
  <div class="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <div class="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
          <div class="bg-blue-900 px-8 py-6 text-white text-center">
              <div class="inline-block bg-amber-500 text-blue-950 p-3 rounded-full mb-3 shadow-inner">
                  <i class="fa-solid fa-shield-halved text-2xl"></i>
              </div>
              <h2 class="text-2xl font-bold">Barangay Portal Login</h2>
              <p class="text-blue-200 text-sm mt-1">Enter your credentials to access your account</p>
          </div>
          <form action="/login" method="POST" class="p-8 space-y-5">
              ${req.query.error ? `<div class="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded text-sm">${req.query.error}</div>` : ''}
              <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Username / Resident ID</label>
                  <div class="relative">
                      <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400"><i class="fa-solid fa-user"></i></span>
                      <input type="text" name="username" required class="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm" placeholder="Enter username or RES-000001">
                  </div>
              </div>
              <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Password</label>
                  <div class="relative">
                      <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400"><i class="fa-solid fa-lock"></i></span>
                      <input type="password" name="password" required class="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm" placeholder="••••••••">
                  </div>
              </div>
              <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition shadow-md shadow-blue-500/20 text-sm">
                  Sign In to Portal
              </button>
          </form>
          <div class="bg-slate-50 px-8 py-4 border-t border-slate-100 text-center text-xs text-slate-500">
              Default Admin Account: <b>admin</b> / <b>password123</b>
          </div>
      </div>
  </div>`;
  res.send(renderLayout('Login', html, null));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const db = loadDB();
  const user = db.users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.redirect('/login?error=Invalid username or password');
  }
  if (user.status === 'Inactive') {
    return res.redirect('/login?error=Account is inactive or blocked');
  }

  const token = Math.random().toString(36.2) + Date.now().toString(36);
  sessions[token] = user.id;

  res.setHeader('Set-Cookie', `brms_token=${token}; Path=/; HttpOnly; SameSite=Strict`);
  res.redirect(user.role === 'staff' ? '/staff' : '/resident');
});

app.get('/logout', (req, res) => {
  const cookieHeader = req.headers['cookie'] || '';
  const match = cookieHeader.match(/brms_token=([^;]+)/);
  if (match) {
    delete sessions[match[1]];
  }
  res.setHeader('Set-Cookie', 'brms_token=; Path=/; Max-Age=0');
  res.redirect('/login');
});

app.get('/', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.redirect('/login');
  return res.redirect(user.role === 'staff' ? '/staff' : '/resident');
});


// =========================================================================
// 1. STAFF PORTAL & MODULES
// =========================================================================
app.get('/staff', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');

  const db = loadDB();
  const activeResidents = db.residents.filter(r => r.status === 'Active');
  
  // Statistics Calculations
  const totalResidents = activeResidents.length;
  const totalHouseholds = db.households.length;
  const maleResidents = activeResidents.filter(r => r.gender === 'Male').length;
  const femaleResidents = activeResidents.filter(r => r.gender === 'Female').length;
  const seniorCitizens = activeResidents.filter(r => r.category === 'Senior Citizen' || r.age >= 60).length;
  const pwdResidents = activeResidents.filter(r => r.category === 'PWD').length;
  const soloParents = activeResidents.filter(r => r.category === 'Solo Parent').length;
  const minors = activeResidents.filter(r => r.category === 'Minor' || r.age < 18).length;
  const registeredVoters = activeResidents.filter(r => r.voterStatus === 'Registered').length;
  
  const pendingRequests = db.requests.filter(req => req.status === 'Pending').length;
  const approvedRequests = db.requests.filter(req => req.status === 'Approved').length;
  const pendingAppointments = db.appointments.filter(app => app.status === 'Pending').length;

  const tab = req.query.tab || 'dashboard';

  let tabContent = '';

  if (tab === 'dashboard') {
    tabContent = `
    <div class="space-y-6">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h2 class="text-2xl font-bold text-slate-800">Staff Dashboard</h2>
                <p class="text-sm text-slate-500">Real-time demographic data and operational overview.</p>
            </div>
            <div class="flex gap-2">
                <a href="/staff?tab=residents" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow transition flex items-center space-x-2">
                    <i class="fa-solid fa-user-plus"></i><span>Manage Residents</span>
                </a>
                <a href="/staff?tab=certificates" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow transition flex items-center space-x-2">
                    <i class="fa-solid fa-file-invoice"></i><span>Issue Certificate</span>
                </a>
            </div>
        </div>

        <!-- Stats Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Residents</p>
                    <h3 class="text-2xl font-bold text-slate-800 mt-1">${totalResidents}</h3>
                </div>
                <div class="p-3 bg-blue-50 text-blue-600 rounded-xl"><i class="fa-solid fa-users text-xl"></i></div>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Households</p>
                    <h3 class="text-2xl font-bold text-slate-800 mt-1">${totalHouseholds}</h3>
                </div>
                <div class="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><i class="fa-solid fa-house text-xl"></i></div>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Male / Female</p>
                    <h3 class="text-xl font-bold text-slate-800 mt-1">${maleResidents} / ${femaleResidents}</h3>
                </div>
                <div class="p-3 bg-sky-50 text-sky-600 rounded-xl"><i class="fa-solid fa-venus-mars text-xl"></i></div>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Senior Citizens</p>
                    <h3 class="text-2xl font-bold text-slate-800 mt-1">${seniorCitizens}</h3>
                </div>
                <div class="p-3 bg-amber-50 text-amber-600 rounded-xl"><i class="fa-solid fa-person-cane text-xl"></i></div>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">PWD Residents</p>
                    <h3 class="text-2xl font-bold text-slate-800 mt-1">${pwdResidents}</h3>
                </div>
                <div class="p-3 bg-purple-50 text-purple-600 rounded-xl"><i class="fa-solid fa-wheelchair text-xl"></i></div>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Solo Parents</p>
                    <h3 class="text-2xl font-bold text-slate-800 mt-1">${soloParents}</h3>
                </div>
                <div class="p-3 bg-pink-50 text-pink-600 rounded-xl"><i class="fa-solid fa-user-shield text-xl"></i></div>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Minors</p>
                    <h3 class="text-2xl font-bold text-slate-800 mt-1">${minors}</h3>
                </div>
                <div class="p-3 bg-rose-50 text-rose-600 rounded-xl"><i class="fa-solid fa-child text-xl"></i></div>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Registered Voters</p>
                    <h3 class="text-2xl font-bold text-slate-800 mt-1">${registeredVoters}</h3>
                </div>
                <div class="p-3 bg-teal-50 text-teal-600 rounded-xl"><i class="fa-solid fa-check-to-slot text-xl"></i></div>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Requests</p>
                    <h3 class="text-2xl font-bold text-amber-600 mt-1">${pendingRequests}</h3>
                </div>
                <div class="p-3 bg-amber-50 text-amber-600 rounded-xl"><i class="fa-solid fa-clock text-xl"></i></div>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Approved Requests</p>
                    <h3 class="text-2xl font-bold text-emerald-600 mt-1">${approvedRequests}</h3>
                </div>
                <div class="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><i class="fa-solid fa-circle-check text-xl"></i></div>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Appointments</p>
                    <h3 class="text-2xl font-bold text-blue-600 mt-1">${pendingAppointments}</h3>
                </div>
                <div class="p-3 bg-blue-50 text-blue-600 rounded-xl"><i class="fa-solid fa-calendar-days text-xl"></i></div>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Businesses</p>
                    <h3 class="text-2xl font-bold text-slate-800 mt-1">${db.businesses.length}</h3>
                </div>
                <div class="p-3 bg-yellow-50 text-yellow-600 rounded-xl"><i class="fa-solid fa-store text-xl"></i></div>
            </div>
        </div>

        <!-- Recent Activities & Purok Population Summary -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 class="font-bold text-lg text-slate-800 mb-4 flex items-center space-x-2">
                    <i class="fa-solid fa-chart-pie text-blue-600"></i><span>Purok Population Distribution</span>
                </h3>
                <div class="space-y-3">
                    ${db.puroks.length === 0 ? '<p class="text-sm text-slate-500">No puroks added yet.</p>' : db.puroks.map(p => {
                        const count = activeResidents.filter(r => r.purok === p.name).length;
                        const pct = totalResidents > 0 ? Math.round((count / totalResidents) * 100) : 0;
                        return `
                        <div>
                            <div class="flex justify-between text-sm mb-1">
                                <span class="font-medium text-slate-700">${p.name}</span>
                                <span class="text-slate-500">${count} residents (${pct}%)</span>
                            </div>
                            <div class="w-full bg-slate-100 rounded-full h-2">
                                <div class="bg-blue-600 h-2 rounded-full" style="width: ${pct}%"></div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>

            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 class="font-bold text-lg text-slate-800 mb-4 flex items-center space-x-2">
                    <i class="fa-solid fa-clock-rotate-left text-blue-600"></i><span>Recent System Activities</span>
                </h3>
                <div class="space-y-4 max-h-72 overflow-y-auto pr-2">
                    ${db.requests.slice(-5).reverse().map(req => `
                        <div class="flex items-start space-x-3 text-sm border-b border-slate-100 pb-3">
                            <div class="bg-blue-50 text-blue-600 p-2 rounded-lg mt-0.5"><i class="fa-solid fa-file-lines"></i></div>
                            <div>
                                <p class="font-semibold text-slate-800">Certificate Request (${req.type})</p>
                                <p class="text-xs text-slate-500">Resident ID: ${req.residentId} &bull; Status: <span class="text-amber-600 font-medium">${req.status}</span></p>
                            </div>
                        </div>
                    `).join('')}
                    ${db.residents.slice(-5).reverse().map(res => `
                        <div class="flex items-start space-x-3 text-sm border-b border-slate-100 pb-3">
                            <div class="bg-emerald-50 text-emerald-600 p-2 rounded-lg mt-0.5"><i class="fa-solid fa-user-plus"></i></div>
                            <div>
                                <p class="font-semibold text-slate-800">New Resident Registered</p>
                                <p class="text-xs text-slate-500">${res.fullName} (${res.residentId})</p>
                            </div>
                        </div>
                    `).join('')}
                    ${db.residents.length === 0 && db.requests.length === 0 ? '<p class="text-sm text-slate-500">No recent activities recorded.</p>' : ''}
                </div>
            </div>
        </div>
    </div>`;
  }
  else if (tab === 'residents') {
    const search = (req.query.search || '').toLowerCase();
    const filterPurok = req.query.purok || '';
    const filterGender = req.query.gender || '';
    const filterCategory = req.query.category || '';

    let residentsList = db.residents.filter(r => r.status === 'Active');
    if (search) {
      residentsList = residentsList.filter(r => 
        r.residentId.toLowerCase().includes(search) ||
        r.fullName.toLowerCase().includes(search) ||
        r.firstName.toLowerCase().includes(search) ||
        r.lastName.toLowerCase().includes(search) ||
        r.purok.toLowerCase().includes(search) ||
        r.contactNumber.includes(search)
      );
    }
    if (filterPurok) residentsList = residentsList.filter(r => r.purok === filterPurok);
    if (filterGender) residentsList = residentsList.filter(r => r.gender === filterGender);
    if (filterCategory) residentsList = residentsList.filter(r => r.category === filterCategory);

    tabContent = `
    <div class="space-y-6">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h2 class="text-2xl font-bold text-slate-800">Resident Management</h2>
                <p class="text-sm text-slate-500">Add, search, filter, and manage official barangay residents.</p>
            </div>
            <div class="flex gap-2">
                <a href="/staff?tab=residents&action=add" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow transition flex items-center space-x-2">
                    <i class="fa-solid fa-user-plus"></i><span>Add Resident</span>
                </a>
                <a href="/staff?tab=archived_residents" class="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow transition flex items-center space-x-2">
                    <i class="fa-solid fa-box-archive"></i><span>Archived Residents</span>
                </a>
            </div>
        </div>

        <!-- Search & Filters Form -->
        <form method="GET" action="/staff" class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input type="hidden" name="tab" value="residents">
            <div class="lg:col-span-2">
                <input type="text" name="search" value="${req.query.search || ''}" placeholder="Search ID, Name, Purok..." class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
            </div>
            <div>
                <select name="purok" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                    <option value="">All Puroks</option>
                    ${db.puroks.map(p => `<option value="${p.name}" ${filterPurok === p.name ? 'selected' : ''}>${p.name}</option>`).join('')}
                </select>
            </div>
            <div>
                <select name="category" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                    <option value="">All Categories</option>
                    <option value="Regular Resident" ${filterCategory === 'Regular Resident' ? 'selected' : ''}>Regular Resident</option>
                    <option value="Senior Citizen" ${filterCategory === 'Senior Citizen' ? 'selected' : ''}>Senior Citizen</option>
                    <option value="PWD" ${filterCategory === 'PWD' ? 'selected' : ''}>PWD</option>
                    <option value="Solo Parent" ${filterCategory === 'Solo Parent' ? 'selected' : ''}>Solo Parent</option>
                    <option value="Student" ${filterCategory === 'Student' ? 'selected' : ''}>Student</option>
                    <option value="Minor" ${filterCategory === 'Minor' ? 'selected' : ''}>Minor</option>
                    <option value="4Ps Beneficiary" ${filterCategory === '4Ps Beneficiary' ? 'selected' : ''}>4Ps Beneficiary</option>
                </select>
            </div>
            <div class="flex gap-2">
                <button type="submit" class="flex-1 bg-slate-800 hover:bg-slate-900 text-white py-2 rounded-lg text-sm font-medium transition">Filter</button>
                <a href="/staff?tab=residents" class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center"><i class="fa-solid fa-rotate-right"></i></a>
            </div>
        </form>

        <!-- Residents Table -->
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                            <th class="p-3 pl-4">Resident ID</th>
                            <th class="p-3">Full Name</th>
                            <th class="p-3">Purok / Address</th>
                            <th class="p-3">Age / Gender</th>
                            <th class="p-3">Category</th>
                            <th class="p-3">Voter Status</th>
                            <th class="p-3 pr-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${residentsList.length === 0 ? `
                        <tr>
                            <td colspan="7" class="text-center py-8 text-slate-500">No active residents found.</td>
                        </tr>` : residentsList.map(r => `
                        <tr class="hover:bg-slate-50 transition">
                            <td class="p-3 pl-4 font-mono font-semibold text-blue-600">${r.residentId}</td>
                            <td class="p-3 font-medium text-slate-800">${r.fullName}</td>
                            <td class="p-3 text-slate-600">${r.purok}</td>
                            <td class="p-3 text-slate-600">${r.age} yrs, ${r.gender}</td>
                            <td class="p-3"><span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">${r.category}</span></td>
                            <td class="p-3"><span class="px-2 py-0.5 ${r.voterStatus === 'Registered' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'} rounded text-xs font-medium">${r.voterStatus}</span></td>
                            <td class="p-3 pr-4 text-right space-x-1">
                                <a href="/staff?tab=resident_profile&id=${r.id}" class="text-blue-600 hover:text-blue-800 p-1.5" title="View Profile"><i class="fa-solid fa-id-card"></i></a>
                                <a href="/staff?tab=residents&action=edit&id=${r.id}" class="text-amber-600 hover:text-amber-800 p-1.5" title="Edit"><i class="fa-solid fa-pen-to-square"></i></a>
                                <a href="/staff?tab=residents&action=archive&id=${r.id}" onclick="return confirm('Are you sure you want to archive this resident?')" class="text-rose-600 hover:text-rose-800 p-1.5" title="Archive"><i class="fa-solid fa-box-archive"></i></a>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;

    if (req.query.action === 'add' || req.query.action === 'edit') {
      const editId = req.query.id;
      const resData = editId ? db.residents.find(r => r.id === editId) : {};
      
      tabContent += `
      <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden my-8">
              <div class="bg-blue-900 px-6 py-4 text-white flex justify-between items-center">
                  <h3 class="font-bold text-lg">${editId ? 'Edit Resident Record' : 'Register New Resident'}</h3>
                  <a href="/staff?tab=residents" class="text-blue-200 hover:text-white"><i class="fa-solid fa-xmark text-lg"></i></a>
              </div>
              <form action="/staff/resident/save" method="POST" class="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                  <input type="hidden" name="id" value="${resData.id || ''}">
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">First Name *</label>
                          <input type="text" name="firstName" value="${resData.firstName || ''}" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                      </div>
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Middle Name</label>
                          <input type="text" name="middleName" value="${resData.middleName || ''}" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                      </div>
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Last Name *</label>
                          <input type="text" name="lastName" value="${resData.lastName || ''}" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                      </div>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Suffix (Jr, III, etc.)</label>
                          <input type="text" name="suffix" value="${resData.suffix || ''}" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                      </div>
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Date of Birth *</label>
                          <input type="date" name="dob" value="${resData.dob || ''}" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                      </div>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Gender *</label>
                          <select name="gender" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                              <option value="Male" ${resData.gender === 'Male' ? 'selected' : ''}>Male</option>
                              <option value="Female" ${resData.gender === 'Female' ? 'selected' : ''}>Female</option>
                          </select>
                      </div>
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Civil Status *</label>
                          <select name="civilStatus" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                              <option value="Single" ${resData.civilStatus === 'Single' ? 'selected' : ''}>Single</option>
                              <option value="Married" ${resData.civilStatus === 'Married' ? 'selected' : ''}>Married</option>
                              <option value="Widowed" ${resData.civilStatus === 'Widowed' ? 'selected' : ''}>Widowed</option>
                              <option value="Separated" ${resData.civilStatus === 'Separated' ? 'selected' : ''}>Separated</option>
                          </select>
                      </div>
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Purok *</label>
                          <select name="purok" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                              <option value="">Select Purok</option>
                              ${db.puroks.map(p => `<option value="${p.name}" ${resData.purok === p.name ? 'selected' : ''}>${p.name}</option>`).join('')}
                          </select>
                      </div>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Complete Address *</label>
                          <input type="text" name="address" value="${resData.address || ''}" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                      </div>
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Contact Number *</label>
                          <input type="text" name="contactNumber" value="${resData.contactNumber || ''}" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm" placeholder="09123456789">
                      </div>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Email Address</label>
                          <input type="email" name="email" value="${resData.email || ''}" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm" placeholder="resident@email.com">
                      </div>
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Occupation</label>
                          <input type="text" name="occupation" value="${resData.occupation || ''}" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                      </div>
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Educational Attainment</label>
                          <select name="educationalAttainment" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                              <option value="Elementary">Elementary</option>
                              <option value="High School">High School</option>
                              <option value="College Undergraduate">College Undergraduate</option>
                              <option value="College Graduate" selected>College Graduate</option>
                              <option value="Vocational">Vocational</option>
                              <option value="None">None</option>
                          </select>
                      </div>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Nationality</label>
                          <input type="text" name="nationality" value="${resData.nationality || 'Filipino'}" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                      </div>
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Voter Status</label>
                          <select name="voterStatus" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                              <option value="Registered" ${resData.voterStatus === 'Registered' ? 'selected' : ''}>Registered</option>
                              <option value="Not Registered" ${resData.voterStatus === 'Not Registered' ? 'selected' : ''}>Not Registered</option>
                          </select>
                      </div>
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Resident Category</label>
                          <select name="category" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                              <option value="Regular Resident" ${resData.category === 'Regular Resident' ? 'selected' : ''}>Regular Resident</option>
                              <option value="Senior Citizen" ${resData.category === 'Senior Citizen' ? 'selected' : ''}>Senior Citizen</option>
                              <option value="PWD" ${resData.category === 'PWD' ? 'selected' : ''}>PWD</option>
                              <option value="Solo Parent" ${resData.category === 'Solo Parent' ? 'selected' : ''}>Solo Parent</option>
                              <option value="Student" ${resData.category === 'Student' ? 'selected' : ''}>Student</option>
                              <option value="Minor" ${resData.category === 'Minor' ? 'selected' : ''}>Minor</option>
                              <option value="4Ps Beneficiary" ${resData.category === '4Ps Beneficiary' ? 'selected' : ''}>4Ps Beneficiary</option>
                          </select>
                      </div>
                  </div>
                  <div class="pt-4 border-t border-slate-200 flex justify-end space-x-3">
                      <a href="/staff?tab=residents" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium">Cancel</a>
                      <button type="submit" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow">Save Resident Record</button>
                  </div>
              </form>
          </div>
      </div>`;
    }
  }
  else if (tab === 'archived_residents') {
    const archivedList = db.residents.filter(r => r.status === 'Archived');
    tabContent = `
    <div class="space-y-6">
        <div class="flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold text-slate-800">Archived Residents</h2>
                <p class="text-sm text-slate-500">View, restore, or permanently delete archived resident files.</p>
            </div>
            <a href="/staff?tab=residents" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow"><i class="fa-solid fa-arrow-left mr-2"></i>Back to Active Residents</a>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                            <th class="p-3 pl-4">Resident ID</th>
                            <th class="p-3">Full Name</th>
                            <th class="p-3">Purok</th>
                            <th class="p-3">Category</th>
                            <th class="p-3 pr-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${archivedList.length === 0 ? `<tr><td colspan="5" class="text-center py-8 text-slate-500">No archived residents found.</td></tr>` : archivedList.map(r => `
                        <tr class="hover:bg-slate-50">
                            <td class="p-3 pl-4 font-mono font-semibold text-slate-500">${r.residentId}</td>
                            <td class="p-3 font-medium text-slate-800">${r.fullName}</td>
                            <td class="p-3 text-slate-600">${r.purok}</td>
                            <td class="p-3"><span class="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs">${r.category}</span></td>
                            <td class="p-3 pr-4 text-right space-x-2">
                                <a href="/staff/resident/restore?id=${r.id}" class="text-emerald-600 hover:text-emerald-800 font-medium text-xs bg-emerald-50 px-2.5 py-1 rounded"><i class="fa-solid fa-rotate-left mr-1"></i>Restore</a>
                                <a href="/staff/resident/perm-delete?id=${r.id}" onclick="return confirm('Are you sure you want to permanently delete this resident? This action cannot be undone.')" class="text-rose-600 hover:text-rose-800 font-medium text-xs bg-rose-50 px-2.5 py-1 rounded"><i class="fa-solid fa-trash mr-1"></i>Delete Permanently</a>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
  }
  else if (tab === 'resident_profile') {
    const resId = req.query.id;
    const resident = db.residents.find(r => r.id === resId);
    if (!resident) {
      tabContent = `<div class="bg-red-50 p-6 text-red-700 rounded-xl">Resident not found. <a href="/staff?tab=residents" class="underline">Go back</a></div>`;
    } else {
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=VERIFIED_RESIDENT_ID:${resident.residentId}`;
      tabContent = `
      <div class="space-y-6">
          <div class="flex justify-between items-center">
              <div>
                  <h2 class="text-2xl font-bold text-slate-800">Resident Profile & QR Verification</h2>
                  <p class="text-sm text-slate-500">Detailed information and verified credentials.</p>
              </div>
              <div class="flex gap-2">
                  <button onclick="window.print()" class="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium shadow"><i class="fa-solid fa-print mr-2"></i>Print Profile</button>
                  <a href="/staff?tab=residents" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium">Back</a>
              </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-center space-y-4">
                  <div class="w-32 h-32 bg-slate-100 mx-auto rounded-full flex items-center justify-center text-4xl text-slate-400 font-bold border-4 border-blue-50">
                      ${resident.firstName[0]}${resident.lastName[0]}
                  </div>
                  <div>
                      <h3 class="font-bold text-xl text-slate-800">${resident.fullName}</h3>
                      <p class="font-mono text-blue-600 font-semibold text-sm mt-0.5">${resident.residentId}</p>
                      <span class="inline-block mt-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold">${resident.status}</span>
                  </div>
                  <div class="pt-4 border-t border-slate-100 flex flex-col items-center">
                      <p class="text-xs font-semibold text-slate-400 uppercase mb-2">Resident Verification QR Code</p>
                      <img src="${qrCodeUrl}" alt="QR Code" class="w-36 h-36 border p-2 rounded-lg shadow-sm">
                      <p class="text-xs text-slate-500 mt-2">Scan to verify authenticity</p>
                  </div>
              </div>

              <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-2 space-y-6">
                  <h4 class="font-bold text-base text-slate-800 border-b pb-2 flex items-center space-x-2">
                      <i class="fa-solid fa-user text-blue-600"></i><span>Personal Information</span>
                  </h4>
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                      <div><span class="block text-xs text-slate-400 uppercase">First Name</span><span class="font-medium text-slate-800">${resident.firstName}</span></div>
                      <div><span class="block text-xs text-slate-400 uppercase">Middle Name</span><span class="font-medium text-slate-800">${resident.middleName || 'N/A'}</span></div>
                      <div><span class="block text-xs text-slate-400 uppercase">Last Name</span><span class="font-medium text-slate-800">${resident.lastName}</span></div>
                      <div><span class="block text-xs text-slate-400 uppercase">Suffix</span><span class="font-medium text-slate-800">${resident.suffix || 'N/A'}</span></div>
                      <div><span class="block text-xs text-slate-400 uppercase">Date of Birth</span><span class="font-medium text-slate-800">${resident.dob}</span></div>
                      <div><span class="block text-xs text-slate-400 uppercase">Age</span><span class="font-medium text-slate-800">${resident.age}</span></div>
                      <div><span class="block text-xs text-slate-400 uppercase">Gender</span><span class="font-medium text-slate-800">${resident.gender}</span></div>
                      <div><span class="block text-xs text-slate-400 uppercase">Civil Status</span><span class="font-medium text-slate-800">${resident.civilStatus}</span></div>
                      <div><span class="block text-xs text-slate-400 uppercase">Nationality</span><span class="font-medium text-slate-800">${resident.nationality}</span></div>
                  </div>

                  <h4 class="font-bold text-base text-slate-800 border-b pb-2 flex items-center space-x-2 pt-2">
                      <i class="fa-solid fa-location-dot text-blue-600"></i><span>Contact & Location</span>
                  </h4>
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                      <div class="col-span-2"><span class="block text-xs text-slate-400 uppercase">Address</span><span class="font-medium text-slate-800">${resident.address}</span></div>
                      <div><span class="block text-xs text-slate-400 uppercase">Purok</span><span class="font-medium text-slate-800">${resident.purok}</span></div>
                      <div><span class="block text-xs text-slate-400 uppercase">Contact Number</span><span class="font-medium text-slate-800">${resident.contactNumber}</span></div>
                      <div><span class="block text-xs text-slate-400 uppercase">Email</span><span class="font-medium text-slate-800">${resident.email || 'N/A'}</span></div>
                  </div>

                  <h4 class="font-bold text-base text-slate-800 border-b pb-2 flex items-center space-x-2 pt-2">
                      <i class="fa-solid fa-briefcase text-blue-600"></i><span>Background & Status</span>
                  </h4>
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                      <div><span class="block text-xs text-slate-400 uppercase">Occupation</span><span class="font-medium text-slate-800">${resident.occupation || 'N/A'}</span></div>
                      <div><span class="block text-xs text-slate-400 uppercase">Education</span><span class="font-medium text-slate-800">${resident.educationalAttainment}</span></div>
                      <div><span class="block text-xs text-slate-400 uppercase">Voter Status</span><span class="font-medium text-slate-800">${resident.voterStatus}</span></div>
                      <div><span class="block text-xs text-slate-400 uppercase">Category</span><span class="font-medium text-slate-800">${resident.category}</span></div>
                      <div><span class="block text-xs text-slate-400 uppercase">Date Registered</span><span class="font-medium text-slate-800">${new Date(resident.dateRegistered).toLocaleDateString()}</span></div>
                  </div>
              </div>
          </div>
      </div>`;
    }
  }
  else if (tab === 'households') {
    tabContent = `
    <div class="space-y-6">
        <div class="flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold text-slate-800">Household Management</h2>
                <p class="text-sm text-slate-500">Manage family households and group residents.</p>
            </div>
            <a href="/staff?tab=households&action=add" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow"><i class="fa-solid fa-house-chimney-user mr-2"></i>Add Household</a>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                            <th class="p-3 pl-4">Household ID</th>
                            <th class="p-3">Household Head</th>
                            <th class="p-3">Purok / Address</th>
                            <th class="p-3">Members Count</th>
                            <th class="p-3 pr-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${db.households.length === 0 ? `<tr><td colspan="5" class="text-center py-8 text-slate-500">No households registered.</td></tr>` : db.households.map(h => {
                            const members = db.residents.filter(r => r.householdId === h.id);
                            return `
                            <tr class="hover:bg-slate-50">
                                <td class="p-3 pl-4 font-mono font-semibold text-blue-600">${h.householdId}</td>
                                <td class="p-3 font-medium text-slate-800">${h.headName}</td>
                                <td class="p-3 text-slate-600">${h.purok} &bull; ${h.address}</td>
                                <td class="p-3"><span class="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-semibold">${members.length} Members</span></td>
                                <td class="p-3 pr-4 text-right space-x-2">
                                    <a href="/staff?tab=household_view&id=${h.id}" class="text-blue-600 hover:text-blue-800" title="View Members"><i class="fa-solid fa-users"></i></a>
                                    <a href="/staff?tab=households&action=edit&id=${h.id}" class="text-amber-600 hover:text-amber-800" title="Edit"><i class="fa-solid fa-pen-to-square"></i></a>
                                    <a href="/staff/household/delete?id=${h.id}" onclick="return confirm('Delete this household?')" class="text-rose-600 hover:text-rose-800" title="Delete"><i class="fa-solid fa-trash"></i></a>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;

    if (req.query.action === 'add' || req.query.action === 'edit') {
      const editId = req.query.id;
      const hData = editId ? db.households.find(h => h.id === editId) : {};
      const activeResidents = db.residents.filter(r => r.status === 'Active');
      tabContent += `
      <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
              <div class="bg-blue-900 px-6 py-4 text-white flex justify-between items-center">
                  <h3 class="font-bold text-lg">${editId ? 'Edit Household' : 'Add New Household'}</h3>
                  <a href="/staff?tab=households" class="text-blue-200 hover:text-white"><i class="fa-solid fa-xmark text-lg"></i></a>
              </div>
              <form action="/staff/household/save" method="POST" class="p-6 space-y-4">
                  <input type="hidden" name="id" value="${hData.id || ''}">
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Household Head *</label>
                      <select name="headId" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                          <option value="">Select Resident Head</option>
                          ${activeResidents.map(r => `<option value="${r.id}" ${hData.headId === r.id ? 'selected' : ''}>${r.fullName} (${r.residentId})</option>`).join('')}
                      </select>
                  </div>
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Purok *</label>
                      <select name="purok" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                          <option value="">Select Purok</option>
                          ${db.puroks.map(p => `<option value="${p.name}" ${hData.purok === p.name ? 'selected' : ''}>${p.name}</option>`).join('')}
                      </select>
                  </div>
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Address / Street *</label>
                      <input type="text" name="address" value="${hData.address || ''}" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                  </div>
                  <div class="pt-4 border-t border-slate-200 flex justify-end space-x-3">
                      <a href="/staff?tab=households" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium">Cancel</a>
                      <button type="submit" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow">Save Household</button>
                  </div>
              </form>
          </div>
      </div>`;
    }
  }
  else if (tab === 'household_view') {
    const hId = req.query.id;
    const household = db.households.find(h => h.id === hId);
    const members = db.residents.filter(r => r.householdId === hId);
    const availableResidents = db.residents.filter(r => r.status === 'Active' && !r.householdId);

    tabContent = `
    <div class="space-y-6">
        <div class="flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold text-slate-800">Household: ${household ? household.householdId : ''}</h2>
                <p class="text-sm text-slate-500">Head: ${household ? household.headName : ''} &bull; ${household ? household.address : ''}</p>
            </div>
            <a href="/staff?tab=households" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium">Back to Households</a>
        </div>

        <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
            <h3 class="font-bold text-lg text-slate-800">Assigned Household Members</h3>
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-semibold border-b">
                            <th class="p-3">Resident ID</th>
                            <th class="p-3">Full Name</th>
                            <th class="p-3">Age / Gender</th>
                            <th class="p-3">Category</th>
                            <th class="p-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        ${members.length === 0 ? `<tr><td colspan="5" class="text-center py-4 text-slate-500">No members assigned.</td></tr>` : members.map(m => `
                        <tr>
                            <td class="p-3 font-mono text-blue-600">${m.residentId}</td>
                            <td class="p-3 font-medium">${m.fullName}</td>
                            <td class="p-3">${m.age}, ${m.gender}</td>
                            <td class="p-3">${m.category}</td>
                            <td class="p-3 text-right">
                                <a href="/staff/household/remove-member?residentId=${m.id}&householdId=${hId}" class="text-rose-600 hover:text-rose-800 text-xs font-semibold bg-rose-50 px-2 py-1 rounded">Remove</a>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>

            <form action="/staff/household/add-member" method="POST" class="pt-4 border-t border-slate-200 flex gap-3 items-end">
                <input type="hidden" name="householdId" value="${hId}">
                <div class="flex-grow">
                    <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Add Resident to Household</label>
                    <select name="residentId" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                        <option value="">Select Unassigned Resident</option>
                        ${availableResidents.map(r => `<option value="${r.id}">${r.fullName} (${r.residentId})</option>`).join('')}
                    </select>
                </div>
                <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow">Assign Member</button>
            </form>
        </div>
    </div>`;
  }
  else if (tab === 'puroks') {
    tabContent = `
    <div class="space-y-6">
        <div class="flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold text-slate-800">Purok Management</h2>
                <p class="text-sm text-slate-500">Configure barangay zones and population statistics.</p>
            </div>
            <a href="/staff?tab=puroks&action=add" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow"><i class="fa-solid fa-map-pin mr-2"></i>Add Purok</a>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${db.puroks.length === 0 ? `<p class="text-slate-500">No puroks defined.</p>` : db.puroks.map(p => {
                const count = activeResidents.filter(r => r.purok === p.name).length;
                return `
                <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                    <div class="flex justify-between items-start">
                        <div>
                            <h3 class="font-bold text-lg text-slate-800">${p.name}</h3>
                            <p class="text-xs text-slate-500 mt-0.5">${p.description || 'Barangay Purok Zone'}</p>
                        </div>
                        <a href="/staff/purok/delete?id=${p.id}" onclick="return confirm('Delete purok?')" class="text-rose-500 hover:text-rose-700"><i class="fa-solid fa-trash"></i></a>
                    </div>
                    <div class="bg-blue-50 p-4 rounded-xl flex justify-between items-center">
                        <div>
                            <p class="text-xs font-semibold text-blue-600 uppercase">Total Population</p>
                            <h4 class="text-2xl font-bold text-blue-900 mt-1">${count} Residents</h4>
                        </div>
                        <div class="text-blue-500 text-2xl"><i class="fa-solid fa-users"></i></div>
                    </div>
                </div>`;
            }).join('')}
        </div>
    </div>`;

    if (req.query.action === 'add') {
      tabContent += `
      <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
              <div class="bg-blue-900 px-6 py-4 text-white flex justify-between items-center">
                  <h3 class="font-bold text-lg">Add New Purok</h3>
                  <a href="/staff?tab=puroks" class="text-blue-200 hover:text-white"><i class="fa-solid fa-xmark text-lg"></i></a>
              </div>
              <form action="/staff/purok/save" method="POST" class="p-6 space-y-4">
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Purok Name *</label>
                      <input type="text" name="name" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm" placeholder="Purok 1 - San Jose">
                  </div>
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Description</label>
                      <input type="text" name="description" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm" placeholder="Leader / Area details">
                  </div>
                  <div class="pt-4 border-t border-slate-200 flex justify-end space-x-3">
                      <a href="/staff?tab=puroks" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium">Cancel</a>
                      <button type="submit" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow">Save Purok</button>
                  </div>
              </form>
          </div>
      </div>`;
    }
  }
  else if (tab === 'certificates') {
    tabContent = `
    <div class="space-y-6">
        <div class="flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold text-slate-800">Certificate Management</h2>
                <p class="text-sm text-slate-500">Generate, print, and track official barangay clearances and certificates.</p>
            </div>
            <a href="/staff?tab=certificates&action=generate" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow"><i class="fa-solid fa-file-circle-plus mr-2"></i>Generate Certificate</a>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-semibold border-b">
                            <th class="p-3 pl-4">Cert Number</th>
                            <th class="p-3">Certificate Type</th>
                            <th class="p-3">Resident Name</th>
                            <th class="p-3">Purpose</th>
                            <th class="p-3">Date Issued</th>
                            <th class="p-3 pr-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        ${db.certificates.length === 0 ? `<tr><td colspan="6" class="text-center py-8 text-slate-500">No certificates issued yet.</td></tr>` : db.certificates.map(c => `
                        <tr class="hover:bg-slate-50">
                            <td class="p-3 pl-4 font-mono font-semibold text-emerald-600">${c.certNumber}</td>
                            <td class="p-3 font-medium text-slate-800">${c.type}</td>
                            <td class="p-3 text-slate-700">${c.residentName}</td>
                            <td class="p-3 text-slate-600">${c.purpose}</td>
                            <td class="p-3 text-slate-500">${new Date(c.dateIssued).toLocaleDateString()}</td>
                            <td class="p-3 pr-4 text-right space-x-2">
                                <a href="/staff?tab=cert_print&id=${c.id}" class="text-blue-600 hover:text-blue-800 font-medium text-xs bg-blue-50 px-2.5 py-1 rounded"><i class="fa-solid fa-print mr-1"></i>View / Print</a>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;

    if (req.query.action === 'generate') {
      const activeResidents = db.residents.filter(r => r.status === 'Active');
      tabContent += `
      <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
              <div class="bg-blue-900 px-6 py-4 text-white flex justify-between items-center">
                  <h3 class="font-bold text-lg">Generate Barangay Certificate</h3>
                  <a href="/staff?tab=certificates" class="text-blue-200 hover:text-white"><i class="fa-solid fa-xmark text-lg"></i></a>
              </div>
              <form action="/staff/certificate/create" method="POST" class="p-6 space-y-4">
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Certificate Type *</label>
                      <select name="type" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                          <option value="Barangay Clearance">Barangay Clearance</option>
                          <option value="Certificate of Residency">Certificate of Residency</option>
                          <option value="Certificate of Indigency">Certificate of Indigency</option>
                          <option value="Certificate of Good Moral">Certificate of Good Moral</option>
                          <option value="Certificate of No Income">Certificate of No Income</option>
                          <option value="Certificate of Solo Parent">Certificate of Solo Parent</option>
                          <option value="Other Barangay Certificate">Other Barangay Certificate</option>
                      </select>
                  </div>
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Select Resident *</label>
                      <select name="residentId" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                          <option value="">Select Resident</option>
                          ${activeResidents.map(r => `<option value="${r.id}">${r.fullName} (${r.residentId})</option>`).join('')}
                      </select>
                  </div>
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Purpose *</label>
                      <input type="text" name="purpose" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm" placeholder="Employment, Bank Requirement, etc.">
                  </div>
                  <div class="pt-4 border-t border-slate-200 flex justify-end space-x-3">
                      <a href="/staff?tab=certificates" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium">Cancel</a>
                      <button type="submit" class="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow">Generate Certificate</button>
                  </div>
              </form>
          </div>
      </div>`;
    }
  }
  else if (tab === 'cert_print') {
    const certId = req.query.id;
    const cert = db.certificates.find(c => c.id === certId);
    if (!cert) {
      tabContent = `<div class="p-6 text-red-600">Certificate not found.</div>`;
    } else {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=CERT_VERIFY:${cert.certNumber}`;
      tabContent = `
      <div class="max-w-3xl mx-auto bg-white p-12 shadow-xl border border-slate-200 my-8 space-y-8 relative">
          <div class="text-center space-y-1 border-b-2 border-blue-900 pb-6">
              <p class="text-xs uppercase tracking-widest text-slate-500">Republic of the Philippines</p>
              <p class="text-xs uppercase font-semibold text-slate-600">Province &bull; Municipality &bull; Barangay Hall</p>
              <h2 class="text-2xl font-extrabold text-blue-900 mt-2">OFFICE OF THE PUNONG BARANGAY</h2>
          </div>

          <div class="text-center py-4">
              <h1 class="text-3xl font-black uppercase tracking-wider text-slate-900">${cert.type}</h1>
              <p class="text-xs font-mono text-slate-500 mt-1">Certificate No: ${cert.certNumber}</p>
          </div>

          <div class="text-slate-700 leading-relaxed space-y-4 text-justify px-6">
              <p><b>TO WHOM IT MAY CONCERN:</b></p>
              <p>This is to certify that <b>${cert.residentName}</b>, of legal age, ${cert.civilStatus || 'Filipino'}, is a permanent resident of <b>${cert.address || 'Barangay'}</b>, and is known to be of good moral character and law-abiding citizen.</p>
              <p>This certification is issued upon the request of the above-named person for <b>${cert.purpose}</b> and for whatever legal purpose it may serve.</p>
          </div>

          <div class="flex justify-between items-end pt-12 px-6">
              <div>
                  <img src="${qrUrl}" alt="QR" class="w-24 h-24 border p-1">
                  <p class="text-[10px] text-slate-400 mt-1">Scan to verify QR</p>
              </div>
              <div class="text-center">
                  <div class="w-48 border-b border-slate-900 mb-1"></div>
                  <p class="font-bold text-sm text-slate-800">PUNONG BARANGAY</p>
                  <p class="text-xs text-slate-500">Authorized Signature</p>
              </div>
          </div>

          <div class="no-print pt-6 flex justify-end space-x-4 border-t">
              <button onclick="window.print()" class="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold shadow hover:bg-blue-700 text-sm"><i class="fa-solid fa-print mr-2"></i>Print Certificate</button>
              <a href="/staff?tab=certificates" class="bg-slate-200 text-slate-700 px-5 py-2.5 rounded-lg font-medium text-sm">Back</a>
          </div>
      </div>`;
    }
  }
  else if (tab === 'online_requests') {
    tabContent = `
    <div class="space-y-6">
        <div>
            <h2 class="text-2xl font-bold text-slate-800">Online Requests Management</h2>
            <p class="text-sm text-slate-500">Review and process certificate and document requests submitted by residents.</p>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-semibold border-b">
                            <th class="p-3 pl-4">Request ID</th>
                            <th class="p-3">Resident</th>
                            <th class="p-3">Document Type</th>
                            <th class="p-3">Purpose</th>
                            <th class="p-3">Status</th>
                            <th class="p-3 pr-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        ${db.requests.length === 0 ? `<tr><td colspan="6" class="text-center py-8 text-slate-500">No requests submitted.</td></tr>` : db.requests.map(req => `
                        <tr class="hover:bg-slate-50">
                            <td class="p-3 pl-4 font-mono font-semibold text-blue-600">${req.requestId}</td>
                            <td class="p-3 font-medium text-slate-800">${req.residentName}</td>
                            <td class="p-3">${req.type}</td>
                            <td class="p-3 text-slate-600">${req.purpose}</td>
                            <td class="p-3"><span class="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-semibold">${req.status}</span></td>
                            <td class="p-3 pr-4 text-right space-x-1">
                                <a href="/staff/request/update?id=${req.id}&status=Approved" class="text-emerald-600 hover:text-emerald-800 font-medium text-xs bg-emerald-50 px-2 py-1 rounded">Approve</a>
                                <a href="/staff/request/update?id=${req.id}&status=Ready for Release" class="text-blue-600 hover:text-blue-800 font-medium text-xs bg-blue-50 px-2 py-1 rounded">Ready</a>
                                <a href="/staff/request/update?id=${req.id}&status=Rejected" class="text-rose-600 hover:text-rose-800 font-medium text-xs bg-rose-50 px-2 py-1 rounded">Reject</a>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
  }
  else if (tab === 'appointments') {
    tabContent = `
    <div class="space-y-6">
        <div>
            <h2 class="text-2xl font-bold text-slate-800">Appointment Management</h2>
            <p class="text-sm text-slate-500">Manage bookings and consultations made by residents.</p>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-semibold border-b">
                            <th class="p-3 pl-4">Appt ID</th>
                            <th class="p-3">Resident</th>
                            <th class="p-3">Service</th>
                            <th class="p-3">Date & Time</th>
                            <th class="p-3">Status</th>
                            <th class="p-3 pr-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        ${db.appointments.length === 0 ? `<tr><td colspan="6" class="text-center py-8 text-slate-500">No appointments scheduled.</td></tr>` : db.appointments.map(app => `
                        <tr class="hover:bg-slate-50">
                            <td class="p-3 pl-4 font-mono font-semibold text-blue-600">${app.appointmentId}</td>
                            <td class="p-3 font-medium text-slate-800">${app.residentName}</td>
                            <td class="p-3">${app.service}</td>
                            <td class="p-3 text-slate-600">${app.date} @ ${app.time}</td>
                            <td class="p-3"><span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold">${app.status}</span></td>
                            <td class="p-3 pr-4 text-right space-x-1">
                                <a href="/staff/appointment/update?id=${app.id}&status=Approved" class="text-emerald-600 hover:text-emerald-800 text-xs bg-emerald-50 px-2 py-1 rounded">Approve</a>
                                <a href="/staff/appointment/update?id=${app.id}&status=Completed" class="text-blue-600 hover:text-blue-800 text-xs bg-blue-50 px-2 py-1 rounded">Complete</a>
                                <a href="/staff/appointment/update?id=${app.id}&status=Cancelled" class="text-rose-600 hover:text-rose-800 text-xs bg-rose-50 px-2 py-1 rounded">Cancel</a>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
  }
  else if (tab === 'blotters') {
    tabContent = `
    <div class="space-y-6">
        <div class="flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold text-slate-800">Blotter & Incident Management</h2>
                <p class="text-sm text-slate-500">Record and monitor barangay disputes, complaints, and case resolutions.</p>
            </div>
            <a href="/staff?tab=blotters&action=add" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow"><i class="fa-solid fa-triangle-exclamation mr-2"></i>Record Incident</a>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-semibold border-b">
                            <th class="p-3 pl-4">Case Number</th>
                            <th class="p-3">Complainant / Respondent</th>
                            <th class="p-3">Location & Date</th>
                            <th class="p-3">Status</th>
                            <th class="p-3 pr-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        ${db.blotters.length === 0 ? `<tr><td colspan="5" class="text-center py-8 text-slate-500">No blotter records.</td></tr>` : db.blotters.map(b => `
                        <tr class="hover:bg-slate-50">
                            <td class="p-3 pl-4 font-mono font-semibold text-rose-600">${b.caseNumber}</td>
                            <td class="p-3"><p class="font-medium text-slate-800">Complainant: ${b.complainant}</p><p class="text-xs text-slate-500">Respondent: ${b.respondent}</p></td>
                            <td class="p-3 text-slate-600">${b.location}<br><span class="text-xs text-slate-400">${b.incidentDate}</span></td>
                            <td class="p-3"><span class="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-semibold">${b.status}</span></td>
                            <td class="p-3 pr-4 text-right">
                                <a href="/staff/blotter/status?id=${b.id}&status=Resolved" class="text-emerald-600 hover:text-emerald-800 text-xs bg-emerald-50 px-2.5 py-1 rounded font-medium">Resolve</a>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;

    if (req.query.action === 'add') {
      tabContent += `
      <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
              <div class="bg-blue-900 px-6 py-4 text-white flex justify-between items-center">
                  <h3 class="font-bold text-lg">Record Barangay Blotter</h3>
                  <a href="/staff?tab=blotters" class="text-blue-200 hover:text-white"><i class="fa-solid fa-xmark text-lg"></i></a>
              </div>
              <form action="/staff/blotter/save" method="POST" class="p-6 space-y-4">
                  <div class="grid grid-cols-2 gap-4">
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Complainant *</label>
                          <input type="text" name="complainant" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                      </div>
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Respondent *</label>
                          <input type="text" name="respondent" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                      </div>
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Incident Date *</label>
                          <input type="date" name="incidentDate" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                      </div>
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Location *</label>
                          <input type="text" name="location" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                      </div>
                  </div>
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Description / Narrative *</label>
                      <textarea name="description" required rows="3" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm"></textarea>
                  </div>
                  <div class="pt-4 border-t border-slate-200 flex justify-end space-x-3">
                      <a href="/staff?tab=blotters" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium">Cancel</a>
                      <button type="submit" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow">Save Blotter Record</button>
                  </div>
              </form>
          </div>
      </div>`;
    }
  }
  else if (tab === 'assistance') {
    tabContent = `
    <div class="space-y-6">
        <div class="flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold text-slate-800">Assistance Management</h2>
                <p class="text-sm text-slate-500">Record financial, medical, and relief assistance given to residents.</p>
            </div>
            <a href="/staff?tab=assistance&action=add" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow"><i class="fa-solid fa-hand-holding-heart mr-2"></i>Record Assistance</a>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-semibold border-b">
                            <th class="p-3 pl-4">Assistance ID</th>
                            <th class="p-3">Resident</th>
                            <th class="p-3">Type</th>
                            <th class="p-3">Amount / Description</th>
                            <th class="p-3">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        ${db.assistance.length === 0 ? `<tr><td colspan="5" class="text-center py-8 text-slate-500">No assistance records.</td></tr>` : db.assistance.map(a => `
                        <tr class="hover:bg-slate-50">
                            <td class="p-3 pl-4 font-mono font-semibold text-blue-600">${a.assistanceId}</td>
                            <td class="p-3 font-medium text-slate-800">${a.residentName}</td>
                            <td class="p-3">${a.type}</td>
                            <td class="p-3 text-slate-600">${a.amount}</td>
                            <td class="p-3"><span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs font-semibold">${a.status}</span></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;

    if (req.query.action === 'add') {
      const activeResidents = db.residents.filter(r => r.status === 'Active');
      tabContent += `
      <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
              <div class="bg-blue-900 px-6 py-4 text-white flex justify-between items-center">
                  <h3 class="font-bold text-lg">Record Assistance</h3>
                  <a href="/staff?tab=assistance" class="text-blue-200 hover:text-white"><i class="fa-solid fa-xmark text-lg"></i></a>
              </div>
              <form action="/staff/assistance/save" method="POST" class="p-6 space-y-4">
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Resident *</label>
                      <select name="residentId" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                          <option value="">Select Resident</option>
                          ${activeResidents.map(r => `<option value="${r.id}">${r.fullName} (${r.residentId})</option>`).join('')}
                      </select>
                  </div>
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Assistance Type *</label>
                      <select name="type" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                          <option value="Financial Assistance">Financial Assistance</option>
                          <option value="Medical Assistance">Medical Assistance</option>
                          <option value="Educational Assistance">Educational Assistance</option>
                          <option value="Food Assistance">Food Assistance</option>
                          <option value="Emergency Assistance">Emergency Assistance</option>
                      </select>
                  </div>
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Amount / Description *</label>
                      <input type="text" name="amount" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm" placeholder="e.g. PHP 3,000 Cash Aid">
                  </div>
                  <div class="pt-4 border-t border-slate-200 flex justify-end space-x-3">
                      <a href="/staff?tab=assistance" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium">Cancel</a>
                      <button type="submit" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow">Save Assistance</button>
                  </div>
              </form>
          </div>
      </div>`;
    }
  }
  else if (tab === 'businesses') {
    tabContent = `
    <div class="space-y-6">
        <div class="flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold text-slate-800">Business Management</h2>
                <p class="text-sm text-slate-500">Register and track commercial establishments operating within the barangay.</p>
            </div>
            <a href="/staff?tab=businesses&action=add" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow"><i class="fa-solid fa-store mr-2"></i>Register Business</a>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-semibold border-b">
                            <th class="p-3 pl-4">Business ID</th>
                            <th class="p-3">Business Name</th>
                            <th class="p-3">Owner</th>
                            <th class="p-3">Purok / Address</th>
                            <th class="p-3">Permit Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        ${db.businesses.length === 0 ? `<tr><td colspan="5" class="text-center py-8 text-slate-500">No businesses registered.</td></tr>` : db.businesses.map(b => `
                        <tr class="hover:bg-slate-50">
                            <td class="p-3 pl-4 font-mono font-semibold text-blue-600">${b.businessId}</td>
                            <td class="p-3 font-medium text-slate-800">${b.businessName}</td>
                            <td class="p-3 text-slate-700">${b.owner}</td>
                            <td class="p-3 text-slate-600">${b.purok} &bull; ${b.address}</td>
                            <td class="p-3"><span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs font-semibold">${b.status}</span></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;

    if (req.query.action === 'add') {
      tabContent += `
      <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
              <div class="bg-blue-900 px-6 py-4 text-white flex justify-between items-center">
                  <h3 class="font-bold text-lg">Register Barangay Business</h3>
                  <a href="/staff?tab=businesses" class="text-blue-200 hover:text-white"><i class="fa-solid fa-xmark text-lg"></i></a>
              </div>
              <form action="/staff/business/save" method="POST" class="p-6 space-y-4">
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Business Name *</label>
                      <input type="text" name="businessName" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                  </div>
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Owner Name *</label>
                      <input type="text" name="owner" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Purok *</label>
                          <select name="purok" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                              <option value="">Select Purok</option>
                              ${db.puroks.map(p => `<option value="${p.name}">${p.name}</option>`).join('')}
                          </select>
                      </div>
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Permit Number *</label>
                          <input type="text" name="permitNumber" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                      </div>
                  </div>
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Complete Address *</label>
                      <input type="text" name="address" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                  </div>
                  <div class="pt-4 border-t border-slate-200 flex justify-end space-x-3">
                      <a href="/staff?tab=businesses" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium">Cancel</a>
                      <button type="submit" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow">Save Business</button>
                  </div>
              </form>
          </div>
      </div>`;
    }
  }
  else if (tab === 'announcements') {
    tabContent = `
    <div class="space-y-6">
        <div class="flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold text-slate-800">Barangay Announcements</h2>
                <p class="text-sm text-slate-500">Post news and alerts visible to all residents.</p>
            </div>
            <a href="/staff?tab=announcements&action=add" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow"><i class="fa-solid fa-bullhorn mr-2"></i>Post Announcement</a>
        </div>

        <div class="space-y-4">
            ${db.announcements.length === 0 ? `<div class="bg-white p-8 rounded-xl shadow-sm text-center text-slate-500 border">No announcements posted.</div>` : db.announcements.map(ann => `
            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-start">
                <div class="space-y-1">
                    <span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold">${ann.category}</span>
                    <h3 class="font-bold text-lg text-slate-800">${ann.title}</h3>
                    <p class="text-sm text-slate-600">${ann.description}</p>
                    <p class="text-xs text-slate-400 pt-2">Posted on ${new Date(ann.date).toLocaleDateString()}</p>
                </div>
                <a href="/staff/announcement/delete?id=${ann.id}" onclick="return confirm('Delete announcement?')" class="text-rose-500 hover:text-rose-700"><i class="fa-solid fa-trash"></i></a>
            </div>`).join('')}
        </div>
    </div>`;

    if (req.query.action === 'add') {
      tabContent += `
      <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
              <div class="bg-blue-900 px-6 py-4 text-white flex justify-between items-center">
                  <h3 class="font-bold text-lg">Post Barangay Announcement</h3>
                  <a href="/staff?tab=announcements" class="text-blue-200 hover:text-white"><i class="fa-solid fa-xmark text-lg"></i></a>
              </div>
              <form action="/staff/announcement/save" method="POST" class="p-6 space-y-4">
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Title *</label>
                      <input type="text" name="title" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                  </div>
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Category *</label>
                      <select name="category" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                          <option value="General">General Notice</option>
                          <option value="Health">Health & Medical</option>
                          <option value="Event">Barangay Event</option>
                          <option value="Emergency">Emergency Alert</option>
                      </select>
                  </div>
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Description *</label>
                      <textarea name="description" required rows="4" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm"></textarea>
                  </div>
                  <div class="pt-4 border-t border-slate-200 flex justify-end space-x-3">
                      <a href="/staff?tab=announcements" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium">Cancel</a>
                      <button type="submit" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow">Post Announcement</button>
                  </div>
              </form>
          </div>
      </div>`;
    }
  }
  else if (tab === 'profile_requests') {
    tabContent = `
    <div class="space-y-6">
        <div>
            <h2 class="text-2xl font-bold text-slate-800">Profile Update Requests</h2>
            <p class="text-sm text-slate-500">Review requested profile changes submitted by residents.</p>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-semibold border-b">
                            <th class="p-3 pl-4">Resident</th>
                            <th class="p-3">Requested Details</th>
                            <th class="p-3">Status</th>
                            <th class="p-3 pr-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        ${db.profileRequests.length === 0 ? `<tr><td colspan="4" class="text-center py-8 text-slate-500">No profile update requests.</td></tr>` : db.profileRequests.map(pr => `
                        <tr class="hover:bg-slate-50">
                            <td class="p-3 pl-4 font-medium text-slate-800">${pr.residentName}</td>
                            <td class="p-3 text-slate-600">${pr.details}</td>
                            <td class="p-3"><span class="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-semibold">${pr.status}</span></td>
                            <td class="p-3 pr-4 text-right space-x-2">
                                <a href="/staff/profile-request/approve?id=${pr.id}" class="text-emerald-600 hover:text-emerald-800 text-xs bg-emerald-50 px-2 py-1 rounded font-medium">Approve & Apply</a>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
  }

  const html = `
  <div class="max-w-7xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-8">
      <aside class="w-full md:w-64 space-y-1">
          <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-4">
              <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Staff Navigation</p>
          </div>
          <a href="/staff?tab=dashboard" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'dashboard' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-chart-line w-5"></i><span>Dashboard</span></a>
          <a href="/staff?tab=residents" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'residents' || tab === 'resident_profile' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-users w-5"></i><span>Residents</span></a>
          <a href="/staff?tab=households" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'households' || tab === 'household_view' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-house w-5"></i><span>Households</span></a>
          <a href="/staff?tab=puroks" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'puroks' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-map-location-dot w-5"></i><span>Puroks</span></a>
          <a href="/staff?tab=certificates" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'certificates' || tab === 'cert_print' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-file-invoice w-5"></i><span>Certificates</span></a>
          <a href="/staff?tab=online_requests" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'online_requests' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-file-arrow-down w-5"></i><span>Online Requests</span></a>
          <a href="/staff?tab=appointments" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'appointments' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-calendar-check w-5"></i><span>Appointments</span></a>
          <a href="/staff?tab=blotters" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'blotters' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-triangle-exclamation w-5"></i><span>Blotter Cases</span></a>
          <a href="/staff?tab=assistance" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'assistance' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-hand-holding-heart w-5"></i><span>Assistance</span></a>
          <a href="/staff?tab=businesses" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'businesses' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-store w-5"></i><span>Businesses</span></a>
          <a href="/staff?tab=announcements" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'announcements' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-bullhorn w-5"></i><span>Announcements</span></a>
          <a href="/staff?tab=profile_requests" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'profile_requests' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-user-pen w-5"></i><span>Profile Updates</span></a>
      </aside>
      <div class="flex-grow">
          ${tabContent}
      </div>
  </div>`;

  res.send(renderLayout('Staff Portal', html, user, tab));
});


// =========================================================================
// STAFF PORTAL POST/ACTION ENDPOINTS (Full CRUD)
// =========================================================================
app.post('/staff/resident/save', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  const { id, firstName, middleName, lastName, suffix, dob, gender, civilStatus, address, purok, contactNumber, email, occupation, educationalAttainment, nationality, voterStatus, category } = req.body;

  // Calculate age
  const birthDate = new Date(dob);
  const ageDifMs = Date.now() - birthDate.getTime();
  const ageDate = new Date(ageDifMs);
  const age = Math.abs(ageDate.getUTCFullYear() - 1970);

  const fullName = `${firstName} ${middleName ? middleName + ' ' : ''}${lastName}${suffix ? ' ' + suffix : ''}`;

  if (id) {
    const resObj = db.residents.find(r => r.id === id);
    if (resObj) {
      resObj.firstName = firstName;
      resObj.middleName = middleName;
      resObj.lastName = lastName;
      resObj.suffix = suffix;
      resObj.dob = dob;
      resObj.age = age;
      resObj.gender = gender;
      resObj.civilStatus = civilStatus;
      resObj.address = address;
      resObj.purok = purok;
      resObj.contactNumber = contactNumber;
      resObj.email = email;
      resObj.occupation = occupation;
      resObj.educationalAttainment = educationalAttainment;
      resObj.nationality = nationality;
      resObj.voterStatus = voterStatus;
      resObj.category = category;
      resObj.fullName = fullName;
    }
  } else {
    // Generate unique ID RES-000001
    const seq = db.counters.residentSeq++;
    const residentId = 'RES-' + String(seq).padStart(6, '0');
    const newId = 'r-' + Math.random().toString(36).substr(2, 9);

    const newResident = {
      id: newId,
      residentId,
      firstName,
      middleName,
      lastName,
      suffix,
      dob,
      age,
      gender,
      civilStatus,
      address,
      purok,
      contactNumber,
      email,
      occupation,
      educationalAttainment,
      nationality,
      voterStatus,
      category,
      fullName,
      dateRegistered: new Date().toISOString(),
      status: 'Active',
      householdId: null
    };
    db.residents.push(newResident);

    // Also auto-create a user account for the resident to log into Resident Portal
    db.users.push({
      id: 'u-' + newId,
      username: residentId,
      password: 'password123',
      role: 'resident',
      name: fullName,
      status: 'Active',
      residentId: residentId
    });
  }

  saveDB(db);
  res.redirect('/staff?tab=residents');
});

app.get('/staff/resident/archive', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  const resObj = db.residents.find(r => r.id === req.query.id);
  if (resObj) resObj.status = 'Archived';
  saveDB(db);
  res.redirect('/staff?tab=residents');
});

app.get('/staff/resident/restore', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  const resObj = db.residents.find(r => r.id === req.query.id);
  if (resObj) resObj.status = 'Active';
  saveDB(db);
  res.redirect('/staff?tab=archived_residents');
});

app.get('/staff/resident/perm-delete', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  db.residents = db.residents.filter(r => r.id !== req.query.id);
  saveDB(db);
  res.redirect('/staff?tab=archived_residents');
});

app.post('/staff/household/save', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  const { id, headId, purok, address } = req.body;
  const head = db.residents.find(r => r.id === headId);
  const headName = head ? head.fullName : 'Unknown';

  if (id) {
    const h = db.households.find(item => item.id === id);
    if (h) {
      h.headId = headId;
      h.headName = headName;
      h.purok = purok;
      h.address = address;
    }
  } else {
    const seq = db.counters.householdSeq++;
    const householdId = 'HH-' + String(seq).padStart(5, '0');
    db.households.push({
      id: 'hh-' + Math.random().toString(36).substr(2, 9),
      householdId,
      headId,
      headName,
      purok,
      address
    });
  }
  saveDB(db);
  res.redirect('/staff?tab=households');
});

app.get('/staff/household/delete', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  db.households = db.households.filter(h => h.id !== req.query.id);
  db.residents.forEach(r => { if (r.householdId === req.query.id) r.householdId = null; });
  saveDB(db);
  res.redirect('/staff?tab=households');
});

app.post('/staff/household/add-member', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  const { householdId, residentId } = req.body;
  const resident = db.residents.find(r => r.id === residentId);
  if (resident) resident.householdId = householdId;
  saveDB(db);
  res.redirect(`/staff?tab=household_view&id=${householdId}`);
});

app.get('/staff/household/remove-member', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  const { residentId, householdId } = req.query;
  const resident = db.residents.find(r => r.id === residentId);
  if (resident) resident.householdId = null;
  saveDB(db);
  res.redirect(`/staff?tab=household_view&id=${householdId}`);
});

app.post('/staff/purok/save', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  const { name, description } = req.body;
  db.puroks.push({ id: 'p-' + Math.random().toString(36).substr(2, 9), name, description });
  saveDB(db);
  res.redirect('/staff?tab=puroks');
});

app.get('/staff/purok/delete', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  db.puroks = db.puroks.filter(p => p.id !== req.query.id);
  saveDB(db);
  res.redirect('/staff?tab=puroks');
});

app.post('/staff/certificate/create', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  const { type, residentId, purpose } = req.body;
  const resident = db.residents.find(r => r.id === residentId);
  if (!resident) return res.redirect('/staff?tab=certificates');

  const seq = db.counters.certSeq++;
  const certNumber = `CERT-${new Date().getFullYear()}-${String(seq).padStart(6, '0')}`;
  const certId = 'c-' + Math.random().toString(36).substr(2, 9);

  db.certificates.push({
    id: certId,
    certNumber,
    type,
    residentId: resident.residentId,
    residentName: resident.fullName,
    purpose,
    dateIssued: new Date().toISOString(),
    civilStatus: resident.civilStatus,
    address: resident.address
  });

  pushNotification(db, 'u-' + resident.id, 'Certificate Issued', `Your requested certificate (${type}) has been generated.`);

  saveDB(db);
  res.redirect(`/staff?tab=cert_print&id=${certId}`);
});

app.get('/staff/request/update', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  const { id, status } = req.query;
  const reqObj = db.requests.find(r => r.id === id);
  if (reqObj) {
    reqObj.status = status;
    const resident = db.residents.find(r => r.residentId === reqObj.residentId);
    if (resident) {
      pushNotification(db, 'u-' + resident.id, 'Request Status Updated', `Your certificate request status is now: ${status}`);
    }
  }
  saveDB(db);
  res.redirect('/staff?tab=online_requests');
});

app.get('/staff/appointment/update', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  const { id, status } = req.query;
  const appObj = db.appointments.find(a => a.id === id);
  if (appObj) {
    appObj.status = status;
    const resident = db.residents.find(r => r.residentId === appObj.residentId);
    if (resident) {
      pushNotification(db, 'u-' + resident.id, 'Appointment Updated', `Your appointment status is now: ${status}`);
    }
  }
  saveDB(db);
  res.redirect('/staff?tab=appointments');
});

app.post('/staff/blotter/save', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  const { complainant, respondent, incidentDate, location, description } = req.body;
  const seq = db.counters.blotterSeq++;
  db.blotters.push({
    id: 'b-' + Math.random().toString(36).substr(2, 9),
    caseNumber: `BLT-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`,
    complainant,
    respondent,
    incidentDate,
    location,
    description,
    status: 'Open',
    dateRecorded: new Date().toISOString()
  });
  saveDB(db);
  res.redirect('/staff?tab=blotters');
});

app.get('/staff/blotter/status', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  const b = db.blotters.find(item => item.id === req.query.id);
  if (b) b.status = req.query.status;
  saveDB(db);
  res.redirect('/staff?tab=blotters');
});

app.post('/staff/assistance/save', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  const { residentId, type, amount } = req.body;
  const resident = db.residents.find(r => r.id === residentId);
  const seq = db.counters.assistanceSeq++;
  db.assistance.push({
    id: 'as-' + Math.random().toString(36).substr(2, 9),
    assistanceId: `AST-${String(seq).padStart(5, '0')}`,
    residentId: resident ? resident.residentId : '',
    residentName: resident ? resident.fullName : 'Unknown',
    type,
    amount,
    status: 'Released',
    date: new Date().toISOString()
  });
  if (resident) {
    pushNotification(db, 'u-' + resident.id, 'Assistance Granted', `You have been granted ${type} (${amount}).`);
  }
  saveDB(db);
  res.redirect('/staff?tab=assistance');
});

app.post('/staff/business/save', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  const { businessName, owner, purok, permitNumber, address } = req.body;
  const seq = db.counters.businessSeq++;
  db.businesses.push({
    id: 'bz-' + Math.random().toString(36).substr(2, 9),
    businessId: `BZ-${String(seq).padStart(5, '0')}`,
    businessName,
    owner,
    purok,
    permitNumber,
    address,
    status: 'Active'
  });
  saveDB(db);
  res.redirect('/staff?tab=businesses');
});

app.post('/staff/announcement/save', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  const { title, category, description } = req.body;
  const annId = 'ann-' + Math.random().toString(36).substr(2, 9);
  db.announcements.push({
    id: annId,
    title,
    category,
    description,
    date: new Date().toISOString()
  });

  // Notify all residents
  db.users.filter(u => u.role === 'resident').forEach(u => {
    pushNotification(db, u.id, `New Announcement: ${title}`, description.substring(0, 80) + '...');
  });

  saveDB(db);
  res.redirect('/staff?tab=announcements');
});

app.get('/staff/announcement/delete', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  db.announcements = db.announcements.filter(a => a.id !== req.query.id);
  saveDB(db);
  res.redirect('/staff?tab=announcements');
});

app.get('/staff/profile-request/approve', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'staff') return res.redirect('/login');
  const db = loadDB();
  const pr = db.profileRequests.find(item => item.id === req.query.id);
  if (pr) {
    pr.status = 'Approved';
    pushNotification(db, pr.userId, 'Profile Update Approved', 'Your profile change request has been reviewed and approved by barangay staff.');
  }
  saveDB(db);
  res.redirect('/staff?tab=profile_requests');
});


// =========================================================================
// 2. RESIDENT PORTAL & MODULES
// =========================================================================
app.get('/resident', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'resident') return res.redirect('/login');

  const db = loadDB();
  const resident = db.residents.find(r => r.residentId === user.residentId);
  const tab = req.query.tab || 'dashboard';

  const myRequests = db.requests.filter(r => r.residentId === user.residentId);
  const myAppointments = db.appointments.filter(a => a.residentId === user.residentId);
  const myNotifications = db.notifications.filter(n => n.userId === user.id).reverse();
  const myAssistance = db.assistance.filter(a => a.residentId === user.residentId);

  let tabContent = '';

  if (tab === 'dashboard') {
    tabContent = `
    <div class="space-y-6">
        <div class="bg-gradient-to-r from-blue-900 to-blue-800 text-white p-6 rounded-2xl shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <span class="bg-amber-500 text-blue-950 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider">Verified Resident</span>
                <h2 class="text-3xl font-bold mt-2">Welcome back, ${user.name}!</h2>
                <p class="text-blue-200 text-sm mt-1">Resident ID: <span class="font-mono font-semibold">${user.residentId}</span> &bull; Purok: ${resident ? resident.purok : 'N/A'}</p>
            </div>
            <a href="/resident?tab=request_cert" class="bg-amber-500 hover:bg-amber-600 text-blue-950 font-semibold px-5 py-2.5 rounded-xl shadow transition text-sm flex items-center space-x-2">
                <i class="fa-solid fa-file-circle-plus"></i><span>Request Document</span>
            </a>
        </div>

        <!-- Quick Summary Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                    <p class="text-xs font-semibold text-slate-400 uppercase">My Requests</p>
                    <h3 class="text-2xl font-bold text-slate-800 mt-1">${myRequests.length}</h3>
                </div>
                <div class="p-3 bg-blue-50 text-blue-600 rounded-xl"><i class="fa-solid fa-file-lines text-xl"></i></div>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                    <p class="text-xs font-semibold text-slate-400 uppercase">Appointments</p>
                    <h3 class="text-2xl font-bold text-slate-800 mt-1">${myAppointments.length}</h3>
                </div>
                <div class="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><i class="fa-solid fa-calendar-days text-xl"></i></div>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                    <p class="text-xs font-semibold text-slate-400 uppercase">Notifications</p>
                    <h3 class="text-2xl font-bold text-slate-800 mt-1">${myNotifications.filter(n => !n.read).length}</h3>
                </div>
                <div class="p-3 bg-amber-50 text-amber-600 rounded-xl"><i class="fa-solid fa-bell text-xl"></i></div>
            </div>
        </div>

        <!-- Recent Announcements -->
        <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
            <h3 class="font-bold text-lg text-slate-800 flex items-center space-x-2">
                <i class="fa-solid fa-bullhorn text-blue-600"></i><span>Barangay Announcements</span>
            </h3>
            <div class="space-y-3">
                ${db.announcements.length === 0 ? '<p class="text-sm text-slate-500">No announcements posted yet.</p>' : db.announcements.slice(-3).reverse().map(ann => `
                <div class="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                    <span class="text-xs font-semibold text-blue-600">${ann.category}</span>
                    <h4 class="font-bold text-slate-800">${ann.title}</h4>
                    <p class="text-sm text-slate-600">${ann.description}</p>
                </div>`).join('')}
            </div>
        </div>
    </div>`;
  }
  else if (tab === 'profile') {
    tabContent = `
    <div class="space-y-6">
        <div>
            <h2 class="text-2xl font-bold text-slate-800">My Resident Profile</h2>
            <p class="text-sm text-slate-500">View your official records registered in the barangay database.</p>
        </div>

        ${resident ? `
        <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-4">
                <div class="flex items-center space-x-4 pb-4 border-b">
                    <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center font-bold text-xl text-blue-700">
                        ${resident.firstName[0]}${resident.lastName[0]}
                    </div>
                    <div>
                        <h3 class="font-bold text-lg text-slate-800">${resident.fullName}</h3>
                        <p class="font-mono text-xs text-blue-600 font-semibold">${resident.residentId}</p>
                    </div>
                </div>
                <div class="space-y-2 text-sm">
                    <div><span class="text-slate-400 block text-xs uppercase">Date of Birth</span><span class="font-medium text-slate-800">${resident.dob} (${resident.age} yrs old)</span></div>
                    <div><span class="text-slate-400 block text-xs uppercase">Gender & Civil Status</span><span class="font-medium text-slate-800">${resident.gender},${resident.civilStatus}</span></div>
                    <div><span class="text-slate-400 block text-xs uppercase">Purok & Address</span><span class="font-medium text-slate-800">${resident.purok},${resident.address}</span></div>
                </div>
            </div>
            <div class="space-y-4 border-t md:border-t-0 md:border-l md:pl-6 pt-4 md:pt-0">
                <h4 class="font-bold text-base text-slate-800">Request Profile Correction</h4>
                <p class="text-xs text-slate-500">Official records cannot be changed directly. Submit corrections to the barangay staff for review.</p>
                <form action="/resident/profile-request" method="POST" class="space-y-3">
                    <textarea name="details" required rows="3" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm" placeholder="Describe changes needed (e.g. Correct spelling of middle name)..."></textarea>
                    <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow">Submit Change Request</button>
                </form>
            </div>
        </div>` : '<p>Resident profile not linked.</p>'}
    </div>`;
  }
  else if (tab === 'request_cert') {
    tabContent = `
    <div class="space-y-6">
        <div>
            <h2 class="text-2xl font-bold text-slate-800">Request Certificate</h2>
            <p class="text-sm text-slate-500">Submit an online request for official documents.</p>
        </div>

        <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 max-w-xl">
            <form action="/resident/request/save" method="POST" class="space-y-4">
                <div>
                    <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Certificate Type *</label>
                    <select name="type" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                        <option value="Barangay Clearance">Barangay Clearance</option>
                        <option value="Certificate of Residency">Certificate of Residency</option>
                        <option value="Certificate of Indigency">Certificate of Indigency</option>
                        <option value="Certificate of Good Moral">Certificate of Good Moral</option>
                        <option value="Certificate of No Income">Certificate of No Income</option>
                        <option value="Certificate of Solo Parent">Certificate of Solo Parent</option>
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Purpose *</label>
                    <input type="text" name="purpose" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm" placeholder="State purpose (e.g. Employment requirement)">
                </div>
                <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-sm shadow">Submit Certificate Request</button>
            </form>
        </div>
    </div>`;
  }
  else if (tab === 'tracking') {
    tabContent = `
    <div class="space-y-6">
        <div>
            <h2 class="text-2xl font-bold text-slate-800">Request Tracking & Documents</h2>
            <p class="text-sm text-slate-500">Monitor status of your document requests.</p>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-semibold border-b">
                            <th class="p-3 pl-4">Request ID</th>
                            <th class="p-3">Type</th>
                            <th class="p-3">Purpose</th>
                            <th class="p-3">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        ${myRequests.length === 0 ? `<tr><td colspan="4" class="text-center py-8 text-slate-500">No requests made.</td></tr>` : myRequests.map(req => `
                        <tr class="hover:bg-slate-50">
                            <td class="p-3 pl-4 font-mono font-semibold text-blue-600">${req.requestId}</td>
                            <td class="p-3 font-medium text-slate-800">${req.type}</td>
                            <td class="p-3 text-slate-600">${req.purpose}</td>
                            <td class="p-3"><span class="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-bold">${req.status}</span></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
  }
  else if (tab === 'appointments') {
    tabContent = `
    <div class="space-y-6">
        <div class="flex justify-between items-center">
            <div>
                <h2 class="text-2xl font-bold text-slate-800">My Appointments</h2>
                <p class="text-sm text-slate-500">Book consultations or meetings with barangay officials.</p>
            </div>
            <a href="/resident?tab=appointments&action=book" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow"><i class="fa-solid fa-calendar-plus mr-2"></i>Book Appointment</a>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-semibold border-b">
                            <th class="p-3 pl-4">Appt ID</th>
                            <th class="p-3">Service</th>
                            <th class="p-3">Date & Time</th>
                            <th class="p-3">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        ${myAppointments.length === 0 ? `<tr><td colspan="4" class="text-center py-8 text-slate-500">No appointments booked.</td></tr>` : myAppointments.map(app => `
                        <tr class="hover:bg-slate-50">
                            <td class="p-3 pl-4 font-mono font-semibold text-blue-600">${app.appointmentId}</td>
                            <td class="p-3 font-medium text-slate-800">${app.service}</td>
                            <td class="p-3 text-slate-600">${app.date} @${app.time}</td>
                            <td class="p-3"><span class="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold">${app.status}</span></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;

    if (req.query.action === 'book') {
      tabContent += `
      <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
              <div class="bg-blue-900 px-6 py-4 text-white flex justify-between items-center">
                  <h3 class="font-bold text-lg">Book Appointment</h3>
                  <a href="/resident?tab=appointments" class="text-blue-200 hover:text-white"><i class="fa-solid fa-xmark text-lg"></i></a>
              </div>
              <form action="/resident/appointment/save" method="POST" class="p-6 space-y-4">
                  <div>
                      <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Service / Purpose *</label>
                      <select name="service" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                          <option value="Consultation with Punong Barangay">Consultation with Punong Barangay</option>
                          <option value="Lupon Tagapamayapa Hearing">Lupon Tagapamayapa Hearing</option>
                          <option value="Barangay ID Application">Barangay ID Application</option>
                          <option value="General Inquiry">General Inquiry</option>
                      </select>
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Date *</label>
                          <input type="date" name="date" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                      </div>
                      <div>
                          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Time *</label>
                          <input type="time" name="time" required class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm">
                      </div>
                  </div>
                  <div class="pt-4 border-t border-slate-200 flex justify-end space-x-3">
                      <a href="/resident?tab=appointments" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium">Cancel</a>
                      <button type="submit" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow">Confirm Booking</button>
                  </div>
              </form>
          </div>
      </div>`;
    }
  }
  else if (tab === 'assistance') {
    tabContent = `
    <div class="space-y-6">
        <div>
            <h2 class="text-2xl font-bold text-slate-800">Assistance History</h2>
            <p class="text-sm text-slate-500">View social services and financial/medical aid granted to you.</p>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-semibold border-b">
                            <th class="p-3 pl-4">Assistance ID</th>
                            <th class="p-3">Type</th>
                            <th class="p-3">Description</th>
                            <th class="p-3">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        ${myAssistance.length === 0 ? `<tr><td colspan="4" class="text-center py-8 text-slate-500">No assistance records found.</td></tr>` : myAssistance.map(a => `
                        <tr class="hover:bg-slate-50">
                            <td class="p-3 pl-4 font-mono font-semibold text-blue-600">${a.assistanceId}</td>
                            <td class="p-3 font-medium text-slate-800">${a.type}</td>
                            <td class="p-3 text-slate-600">${a.amount}</td>
                            <td class="p-3"><span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs font-semibold">${a.status}</span></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
  }
  else if (tab === 'notifications') {
    tabContent = `
    <div class="space-y-6">
        <div>
            <h2 class="text-2xl font-bold text-slate-800">Notifications</h2>
            <p class="text-sm text-slate-500">Updates regarding your requests and appointments.</p>
        </div>

        <div class="space-y-3">
            ${myNotifications.length === 0 ? `<div class="bg-white p-8 rounded-xl text-center text-slate-500 border">No notifications.</div>` : myNotifications.map(n => `
            <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-start space-x-3">
                <div class="bg-blue-50 text-blue-600 p-2.5 rounded-xl"><i class="fa-solid fa-bell"></i></div>
                <div class="space-y-0.5">
                    <h4 class="font-bold text-slate-800 text-sm">${n.title}</h4>
                    <p class="text-sm text-slate-600">${n.message}</p>
                    <p class="text-[10px] text-slate-400 pt-1">${new Date(n.date).toLocaleString()}</p>
                </div>
            </div>`).join('')}
        </div>
    </div>`;
  }

  const html = `
  <div class="max-w-7xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-8">
      <aside class="w-full md:w-64 space-y-1">
          <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-4">
              <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resident Menu</p>
          </div>
          <a href="/resident?tab=dashboard" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'dashboard' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-house w-5"></i><span>Dashboard</span></a>
          <a href="/resident?tab=profile" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'profile' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-id-card w-5"></i><span>My Profile</span></a>
          <a href="/resident?tab=request_cert" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'request_cert' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-file-circle-plus w-5"></i><span>Request Document</span></a>
          <a href="/resident?tab=tracking" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'tracking' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-list-check w-5"></i><span>Request Tracking</span></a>
          <a href="/resident?tab=appointments" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'appointments' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-calendar-days w-5"></i><span>Appointments</span></a>
          <a href="/resident?tab=assistance" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'assistance' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-hand-holding-heart w-5"></i><span>Assistance History</span></a>
          <a href="/resident?tab=notifications" class="flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium ${tab === 'notifications' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"><i class="fa-solid fa-bell w-5"></i><span>Notifications</span></a>
      </aside>
      <div class="flex-grow">
          ${tabContent}
      </div>
  </div>`;

  res.send(renderLayout('Resident Portal', html, user, tab));
});


// =========================================================================
// RESIDENT PORTAL POST ACTIONS
// =========================================================================
app.post('/resident/request/save', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'resident') return res.redirect('/login');
  const db = loadDB();
  const resident = db.residents.find(r => r.residentId === user.residentId);
  if (!resident) return res.redirect('/resident');

  const { type, purpose } = req.body;
  const seq = db.counters.requestSeq++;
  db.requests.push({
    id: 'req-' + Math.random().toString(36).substr(2, 9),
    requestId: `REQ-${String(seq).padStart(5, '0')}`,
    residentId: resident.residentId,
    residentName: resident.fullName,
    type,
    purpose,
    status: 'Pending',
    dateRequested: new Date().toISOString()
  });

  saveDB(db);
  res.redirect('/resident?tab=tracking');
});

app.post('/resident/appointment/save', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'resident') return res.redirect('/login');
  const db = loadDB();
  const resident = db.residents.find(r => r.residentId === user.residentId);
  if (!resident) return res.redirect('/resident');

  const { service, date, time } = req.body;
  const seq = db.counters.appointmentSeq++;
  db.appointments.push({
    id: 'app-' + Math.random().toString(36).substr(2, 9),
    appointmentId: `APT-${String(seq).padStart(5, '0')}`,
    residentId: resident.residentId,
    residentName: resident.fullName,
    service,
    date,
    time,
    status: 'Pending'
  });

  saveDB(db);
  res.redirect('/resident?tab=appointments');
});

app.post('/resident/profile-request', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'resident') return res.redirect('/login');
  const db = loadDB();
  const resident = db.residents.find(r => r.residentId === user.residentId);

  db.profileRequests.push({
    id: 'pr-' + Math.random().toString(36).substr(2, 9),
    userId: user.id,
    residentName: resident ? resident.fullName : user.name,
    details: req.body.details,
    status: 'Pending',
    date: new Date().toISOString()
  });

  saveDB(db);
  res.redirect('/resident?tab=profile');
});

// Initialize database file on boot and start server
loadDB();
app.listen(PORT, () => {
  console.log(`Barangay Resident Management System running on port ${PORT}`);
});
