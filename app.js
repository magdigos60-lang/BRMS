\/**
 * BARANGAY RESIDENT MANAGEMENT SYSTEM (PRODUCTION)
 * Express.js Server + Supabase Client + PDF/QR Utilities
 * Direct deployment compatible with Render
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const multer = require('multer');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'barangay-sec-key-2026-render-super-secret';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-supabase-url.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-supabase-anon-key';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Config Express Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(session({
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

const upload = multer({ storage: multer.memoryStorage() });

// -------------------------------------------------------------
// HELPER FUNCTIONS & UTILITIES
// -------------------------------------------------------------

async function logActivity(userId, username, action, module, details = '', recordId = '') {
  try {
    await supabase.from('user_activity_logs').insert([{
      user_id: userId,
      username: username || 'System',
      action,
      module,
      details,
      record_id: recordId ? String(recordId) : null
    }]);
  } catch (err) {
    console.error('Log activity error:', err);
  }
}

async function createNotification(userId, residentId, title, message, type = 'General', linkUrl = '') {
  try {
    await supabase.from('notifications').insert([{
      user_id: userId,
      resident_id: residentId,
      title,
      message,
      type,
      link_url: linkUrl
    }]);
  } catch (err) {
    console.error('Notification error:', err);
  }
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized access. Please login.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: 'Invalid or expired session.' });
    req.user = user;
    next();
  });
}

function requireAdminOrStaff(req, res, next) {
  if (!req.user || req.user.role === 'Resident') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin/Staff permissions required.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || (req.user.role !== 'Super Admin' && req.user.role !== 'Barangay Admin')) {
    return res.status(403).json({ success: false, message: 'Forbidden. Administrator permissions required.' });
  }
  next();
}

// -------------------------------------------------------------
// API ROUTES - SYSTEM SETUP & AUTHENTICATION
// -------------------------------------------------------------

// Check initial system setup state
app.get('/api/setup/status', async (req, res) => {
  try {
    const { data, error } = await supabase.from('system_settings').select('is_setup_complete, barangay_name, system_name').eq('id', 1).single();
    if (error || !data) {
      return res.json({ success: true, isSetupComplete: false });
    }
    return res.json({ success: true, isSetupComplete: data.is_setup_complete, settings: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Admin Initial Setup
app.post('/api/setup/initialize', async (req, res) => {
  try {
    const { data: settings } = await supabase.from('system_settings').select('is_setup_complete').eq('id', 1).single();
    if (settings && settings.is_setup_complete) {
      return res.status(400).json({ success: false, message: 'System setup has already been completed.' });
    }

    const { username, email, password, barangayName, systemName, captainName } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Missing required setup fields.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create Initial Super Admin
    const { data: user, error: userErr } = await supabase.from('users').insert([{
      username,
      email,
      password_hash: passwordHash,
      role: 'Super Admin',
      is_active: true
    }]).select().single();

    if (userErr) throw userErr;

    // Update settings
    await supabase.from('system_settings').update({
      is_setup_complete: true,
      barangay_name: barangayName || 'Barangay Central',
      system_name: systemName || 'Barangay Resident Management System',
      captain_name: captainName || 'Hon. Barangay Captain'
    }).eq('id', 1);

    await logActivity(user.id, user.username, 'System Initialized', 'Setup', 'Initial Admin account created.');

    return res.json({ success: true, message: 'Administrator setup successful! You can now log in.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// User Login Route (Admin, Staff, Resident)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, roleType } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Please supply username/email and password.' });
    }

    const { data: user, error } = await supabase.from('users').select('*').or(`username.eq.${username},email.eq.${username}`).single();
    if (error || !user) {
      await supabase.from('login_history').insert([{ username, status: 'Failed' }]);
      return res.status(400).json({ success: false, message: 'Invalid credentials.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact system admin.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await supabase.from('login_history').insert([{ user_id: user.id, username: user.username, status: 'Failed' }]);
      return res.status(400).json({ success: false, message: 'Invalid credentials.' });
    }

    if (roleType === 'Resident' && user.role !== 'Resident') {
      return res.status(403).json({ success: false, message: 'Please use the Admin/Staff Portal login.' });
    }
    if (roleType === 'Admin' && user.role === 'Resident') {
      return res.status(403).json({ success: false, message: 'Residents cannot access Admin portal.' });
    }

    // Fetch resident profile if role is Resident
    let residentData = null;
    if (user.role === 'Resident' && user.resident_id) {
      const { data: resObj } = await supabase.from('residents').select('*').eq('id', user.resident_id).single();
      residentData = resObj;
      if (resObj && resObj.resident_status === 'Pending') {
        return res.status(403).json({ success: false, message: 'Your resident account registration is pending approval.' });
      }
    }

    const payload = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      residentId: user.resident_id || null
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });

    await supabase.from('login_history').insert([{ user_id: user.id, username: user.username, status: 'Success' }]);
    await logActivity(user.id, user.username, 'User Login', 'Auth', 'User logged in successfully.');

    return res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, role: user.role, residentId: user.resident_id },
      resident: residentData
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Logout
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// Get Current User Profile
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('id, username, email, role, resident_id').eq('id', req.user.id).single();
    let resident = null;
    if (user && user.resident_id) {
      const { data: resObj } = await supabase.from('residents').select('*, puroks(name), households(household_number)').eq('id', user.resident_id).single();
      resident = resObj;
    }
    const { data: settings } = await supabase.from('system_settings').select('*').eq('id', 1).single();
    return res.json({ success: true, user, resident, settings });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Public Resident Self-Registration
app.post('/api/public/register-resident', async (req, res) => {
  try {
    const {
      username, email, password, firstName, middleName, lastName, suffix,
      dob, gender, civilStatus, nationality, contactNumber, address,
      purokId, occupation, educationalAttainment, photoUrl
    } = req.body;

    if (!username || !email || !password || !firstName || !lastName || !dob || !gender || !civilStatus || !address) {
      return res.status(400).json({ success: false, message: 'Missing required resident registration fields.' });
    }

    // Check duplicate username/email
    const { data: existingUser } = await supabase.from('users').select('id').or(`username.eq.${username},email.eq.${email}`).single();
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Username or Email is already taken.' });
    }

    const year = new Date().getFullYear();
    const countRes = await supabase.from('residents').select('id', { count: 'exact' });
    const nextSeq = String((countRes.count || 0) + 1).padStart(5, '0');
    const residentNumber = `BRGY-${year}-${nextSeq}`;

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create resident entry with status = Pending
    const { data: resident, error: resErr } = await supabase.from('residents').insert([{
      resident_number: residentNumber,
      first_name: firstName,
      middle_name: middleName || '',
      last_name: lastName,
      suffix: suffix || '',
      dob,
      gender,
      civil_status: civilStatus,
      nationality: nationality || 'Filipino',
      contact_number: contactNumber || '',
      email,
      address,
      purok_id: purokId || null,
      occupation: occupation || 'N/A',
      educational_attainment: educationalAttainment || 'N/A',
      resident_status: 'Pending',
      photo_url: photoUrl || ''
    }]).select().single();

    if (resErr) throw resErr;

    // Create User entry for login
    const { data: newUser, error: userErr } = await supabase.from('users').insert([{
      username,
      email,
      password_hash: passwordHash,
      role: 'Resident',
      is_active: true,
      resident_id: resident.id
    }]).select().single();

    if (userErr) throw userErr;

    // Link user_id back to resident
    await supabase.from('residents').update({ user_id: newUser.id }).eq('id', resident.id);

    await logActivity(newUser.id, username, 'Resident Registration Submitted', 'Registration', `Pending registration: ${firstName} ${lastName}`);

    return res.json({
      success: true,
      message: 'Registration submitted successfully! Please wait for Barangay Staff/Admin approval before logging in.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// API ROUTES - ADMIN DASHBOARD & SYSTEM SETTINGS
// -------------------------------------------------------------

app.get('/api/admin/dashboard-stats', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const [
      resTotal, resActive, resArchived, resPending,
      hhTotal, purokTotal, seniors, pwds, soloParents,
      certPending, apptPending, compPending, assistPending
    ] = await Promise.all([
      supabase.from('residents').select('id', { count: 'exact' }),
      supabase.from('residents').select('id', { count: 'exact' }).eq('resident_status', 'Active'),
      supabase.from('residents').select('id', { count: 'exact' }).eq('resident_status', 'Archived'),
      supabase.from('residents').select('id', { count: 'exact' }).eq('resident_status', 'Pending'),
      supabase.from('households').select('id', { count: 'exact' }),
      supabase.from('puroks').select('id', { count: 'exact' }),
      supabase.from('residents').select('id', { count: 'exact' }).eq('is_senior_citizen', true),
      supabase.from('residents').select('id', { count: 'exact' }).eq('is_pwd', true),
      supabase.from('residents').select('id', { count: 'exact' }).eq('is_solo_parent', true),
      supabase.from('certificate_requests').select('id', { count: 'exact' }).in('status', ['SUBMITTED', 'UNDER REVIEW']),
      supabase.from('appointments').select('id', { count: 'exact' }).eq('status', 'Pending'),
      supabase.from('complaints').select('id', { count: 'exact' }).in('status', ['SUBMITTED', 'UNDER REVIEW', 'INVESTIGATION']),
      supabase.from('assistance_requests').select('id', { count: 'exact' }).eq('status', 'Pending')
    ]);

    const { data: recentLogs } = await supabase.from('user_activity_logs').select('*').order('created_at', { ascending: false }).limit(10);

    return res.json({
      success: true,
      stats: {
        totalResidents: resTotal.count || 0,
        activeResidents: resActive.count || 0,
        archivedResidents: resArchived.count || 0,
        pendingRegistrations: resPending.count || 0,
        totalHouseholds: hhTotal.count || 0,
        totalPuroks: purokTotal.count || 0,
        seniorCitizens: seniors.count || 0,
        pwds: pwds.count || 0,
        soloParents: soloParents.count || 0,
        pendingCertificates: certPending.count || 0,
        pendingAppointments: apptPending.count || 0,
        pendingComplaints: compPending.count || 0,
        pendingAssistance: assistPending.count || 0
      },
      recentLogs: recentLogs || []
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Update Barangay / System Settings
app.post('/api/admin/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const updateData = req.body;
    updateData.updated_at = new Date();

    const { data, error } = await supabase.from('system_settings').update(updateData).eq('id', 1).select().single();
    if (error) throw error;

    await logActivity(req.user.id, req.user.username, 'Update System Settings', 'Settings', 'Updated official barangay parameters.');

    return res.json({ success: true, message: 'Settings updated successfully.', settings: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// API ROUTES - RESIDENT MANAGEMENT
// -------------------------------------------------------------

// Fetch Resident List (With Search & Multi-Filters)
app.get('/api/admin/residents', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { search, status, purokId, gender, civilStatus, voterStatus, category } = req.query;

    let query = supabase.from('residents').select('*, puroks(name), households(household_number)').order('created_at', { ascending: false });

    if (status) query = query.eq('resident_status', status);
    if (purokId) query = query.eq('purok_id', purokId);
    if (gender) query = query.eq('gender', gender);
    if (civilStatus) query = query.eq('civil_status', civilStatus);
    if (voterStatus) query = query.eq('voter_status', voterStatus);

    if (category === 'senior') query = query.eq('is_senior_citizen', true);
    if (category === 'pwd') query = query.eq('is_pwd', true);
    if (category === 'solo_parent') query = query.eq('is_solo_parent', true);

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,resident_number.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return res.json({ success: true, residents: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Approve or Reject Pending Resident Registration
app.post('/api/admin/residents/:id/review', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejectionReason } = req.body; // action: 'APPROVE' or 'REJECT'

    const { data: resident } = await supabase.from('residents').select('*').eq('id', id).single();
    if (!resident) return res.status(404).json({ success: false, message: 'Resident record not found.' });

    if (action === 'APPROVE') {
      await supabase.from('residents').update({
        resident_status: 'Active',
        rejection_reason: ''
      }).eq('id', id);

      if (resident.user_id) {
        await supabase.from('users').update({ is_active: true }).eq('id', resident.user_id);
        await createNotification(resident.user_id, resident.id, 'Registration Approved', 'Your Barangay Resident account registration has been approved. You can now access all portal features.', 'Approval');
      }

      await supabase.from('resident_history').insert([{
        resident_id: id,
        change_type: 'Status Change',
        details: { status: 'Approved', reviewer: req.user.username },
        performed_by: req.user.id
      }]);

      await logActivity(req.user.id, req.user.username, 'Approve Resident', 'Residents', `Approved resident ${resident.first_name} ${resident.last_name}`, id);

      return res.json({ success: true, message: 'Resident registration approved successfully.' });
    } else if (action === 'REJECT') {
      await supabase.from('residents').update({
        resident_status: 'Rejected',
        rejection_reason: rejectionReason || 'Information verification failed.'
      }).eq('id', id);

      if (resident.user_id) {
        await createNotification(resident.user_id, resident.id, 'Registration Rejected', `Your registration was rejected. Reason: ${rejectionReason || 'Verification failed.'}`, 'Rejection');
      }

      await logActivity(req.user.id, req.user.username, 'Reject Resident', 'Residents', `Rejected registration for ${resident.first_name} ${resident.last_name}`, id);

      return res.json({ success: true, message: 'Resident registration rejected.' });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action provided.' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Admin Add New Resident Directly
app.post('/api/admin/residents', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const payload = req.body;
    const year = new Date().getFullYear();
    const countRes = await supabase.from('residents').select('id', { count: 'exact' });
    const nextSeq = String((countRes.count || 0) + 1).padStart(5, '0');
    payload.resident_number = `BRGY-${year}-${nextSeq}`;
    payload.resident_status = 'Active';

    const { data: resident, error } = await supabase.from('residents').insert([payload]).select().single();
    if (error) throw error;

    await supabase.from('resident_history').insert([{
      resident_id: resident.id,
      change_type: 'Resident Created',
      details: { added_by: req.user.username },
      performed_by: req.user.id
    }]);

    await logActivity(req.user.id, req.user.username, 'Add Resident', 'Residents', `Added ${resident.first_name} ${resident.last_name}`, resident.id);

    return res.json({ success: true, message: 'Resident added successfully.', resident });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Update Resident Profile (Admin/Staff)
app.put('/api/admin/residents/:id', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data: oldRes } = await supabase.from('residents').select('*').eq('id', id).single();
    if (!oldRes) return res.status(404).json({ success: false, message: 'Resident not found.' });

    const { data: updatedRes, error } = await supabase.from('residents').update(updates).eq('id', id).select().single();
    if (error) throw error;

    await supabase.from('resident_history').insert([{
      resident_id: id,
      change_type: 'Profile Update',
      details: { updated_by: req.user.username, previous: oldRes, updated: updates },
      performed_by: req.user.id
    }]);

    await logActivity(req.user.id, req.user.username, 'Update Resident', 'Residents', `Updated ${updatedRes.first_name} ${updatedRes.last_name}`, id);

    return res.json({ success: true, message: 'Resident record updated.', resident: updatedRes });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Archive/Restore Resident Record
app.post('/api/admin/residents/:id/archive-status', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'Active' or 'Archived'

    const { data: resident, error } = await supabase.from('residents').update({ resident_status: status }).eq('id', id).select().single();
    if (error) throw error;

    await supabase.from('resident_history').insert([{
      resident_id: id,
      change_type: 'Status Change',
      details: { status, changed_by: req.user.username },
      performed_by: req.user.id
    }]);

    await logActivity(req.user.id, req.user.username, status === 'Archived' ? 'Archive Resident' : 'Restore Resident', 'Residents', `${status} resident ${resident.first_name} ${lastName}`, id);

    return res.json({ success: true, message: `Resident status updated to ${status}.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Controlled Permanent Deletion (Super Admin Only)
app.delete('/api/admin/residents/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: resObj } = await supabase.from('residents').select('user_id, first_name, last_name').eq('id', id).single();

    if (resObj && resObj.user_id) {
      await supabase.from('users').delete().eq('id', resObj.user_id);
    }
    await supabase.from('residents').delete().eq('id', id);

    await logActivity(req.user.id, req.user.username, 'Permanent Delete Resident', 'Residents', `Permanently deleted record ID ${id}`);

    return res.json({ success: true, message: 'Resident record permanently deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// API ROUTES - PUROK & HOUSEHOLD MANAGEMENT
// -------------------------------------------------------------

// Get Purok List with Real-Time Calculated Resident Counts
app.get('/api/admin/puroks', authenticateToken, async (req, res) => {
  try {
    const { data: puroks, error } = await supabase.from('puroks').select('*').order('name');
    if (error) throw error;

    // Calculate count from actual resident data
    const puroksWithCounts = await Promise.all(puroks.map(async (purok) => {
      const { count } = await supabase.from('residents').select('id', { count: 'exact' }).eq('purok_id', purok.id).eq('resident_status', 'Active');
      return { ...purok, resident_count: count || 0 };
    }));

    return res.json({ success: true, puroks: puroksWithCounts });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/puroks', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Purok name required.' });

    const { data, error } = await supabase.from('puroks').insert([{ name, description }]).select().single();
    if (error) throw error;

    await logActivity(req.user.id, req.user.username, 'Create Purok', 'Purok', `Created ${name}`);
    return res.json({ success: true, message: 'Purok added successfully.', purok: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Household Management
app.get('/api/admin/households', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('households').select('*, puroks(name), head:residents!fk_household_head(first_name, last_name)').order('household_number');
    if (error) throw error;

    const householdsWithMembers = await Promise.all(data.map(async (hh) => {
      const { count } = await supabase.from('residents').select('id', { count: 'exact' }).eq('household_id', hh.id);
      return { ...hh, member_count: count || 0 };
    }));

    return res.json({ success: true, households: householdsWithMembers });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/households', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { householdNumber, purokId, address, headResidentId } = req.body;
    if (!householdNumber || !address) return res.status(400).json({ success: false, message: 'Household number and address required.' });

    const { data, error } = await supabase.from('households').insert([{
      household_number: householdNumber,
      purok_id: purokId || null,
      address,
      head_resident_id: headResidentId || null
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.username, 'Create Household', 'Household', `Created Household #${householdNumber}`);
    return res.json({ success: true, message: 'Household added successfully.', household: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// API ROUTES - CERTIFICATES, DOCUMENTS & APPROVALS
// -------------------------------------------------------------

// Fetch Certificate Requests
app.get('/api/admin/certificate-requests', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { data, error } = await supabase.from('certificate_requests').select('*, residents(first_name, last_name, resident_number, contact_number, address)').order('created_at', { ascending: false });
    if (error) throw error;

    return res.json({ success: true, requests: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Process / Approve / Issue Certificate Request
app.post('/api/admin/certificate-requests/:id/process', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason, documentUrl } = req.body; // status: APPROVED, READY FOR RELEASE, RELEASED, REJECTED

    const { data: reqObj } = await supabase.from('certificate_requests').select('*, residents(user_id, id, first_name, last_name)').eq('id', id).single();
    if (!reqObj) return res.status(404).json({ success: false, message: 'Request not found.' });

    const updates = { status, updated_at: new Date() };

    if (status === 'REJECTED') {
      updates.rejection_reason = rejectionReason || 'Requirements incomplete.';
    } else if (status === 'READY FOR RELEASE' || status === 'RELEASED') {
      if (documentUrl) updates.issued_document_url = documentUrl;
      const docNum = reqObj.document_number || `DOC-2026-${String(Math.floor(100000 + Math.random() * 900000))}`;
      updates.document_number = docNum;
      updates.issued_by = req.user.id;
      updates.issued_at = new Date();

      if (status === 'RELEASED') {
        updates.released_at = new Date();
        // Record in document_issuance_history
        await supabase.from('document_issuance_history').insert([{
          document_number: docNum,
          request_id: reqObj.id,
          resident_id: reqObj.resident_id,
          document_type: reqObj.certificate_type,
          issued_by: req.user.id,
          released_date: new Date(),
          status: 'VALID'
        }]);
      }
    }

    const { data, error } = await supabase.from('certificate_requests').update(updates).eq('id', id).select().single();
    if (error) throw error;

    if (reqObj.residents && reqObj.residents.user_id) {
      await createNotification(
        reqObj.residents.user_id,
        reqObj.resident_id,
        `Certificate Request Update (${status})`,
        `Your request for ${reqObj.certificate_type} is now: ${status}.`,
        'Certificate'
      );
    }

    await logActivity(req.user.id, req.user.username, 'Process Certificate Request', 'Certificates', `Updated Request ${reqObj.request_number} to ${status}`, id);

    return res.json({ success: true, message: `Request updated to ${status}.`, request: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// API ROUTES - QR CODE SCANNER & SERVICE VERIFICATION
// -------------------------------------------------------------

// Verify Resident or Document Release via QR Secure Token
app.get('/api/scanner/verify/:token', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { token } = req.params;

    // Search resident by QR token or Resident ID
    const { data: resident } = await supabase.from('residents').select('*, puroks(name), households(household_number)').or(`qr_token.eq.${token},resident_number.eq.${token}`).single();

    if (!resident) {
      return res.status(404).json({ success: false, message: 'Invalid or unrecognized QR token.' });
    }

    // Search active/ready document requests for this resident
    const { data: activeRequests } = await supabase.from('certificate_requests').select('*').eq('resident_id', resident.id).in('status', ['READY FOR RELEASE', 'APPROVED']).order('created_at', { ascending: false });

    await logActivity(req.user.id, req.user.username, 'QR Scan Verification', 'QR Scanner', `Scanned QR for resident ${resident.first_name} ${resident.last_name}`, resident.id);

    return res.json({
      success: true,
      verified: true,
      resident,
      pendingClaimRequests: activeRequests || []
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Quick Release Document directly from Scanner
app.post('/api/scanner/release-document/:requestId', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { requestId } = req.params;

    const { data: reqObj, error: reqErr } = await supabase.from('certificate_requests').select('*, residents(first_name, last_name, user_id)').eq('id', requestId).single();
    if (reqErr || !reqObj) return res.status(404).json({ success: false, message: 'Certificate request not found.' });

    const docNum = reqObj.document_number || `DOC-2026-${String(Math.floor(100000 + Math.random() * 900000))}`;

    await supabase.from('certificate_requests').update({
      status: 'RELEASED',
      document_number: docNum,
      issued_by: req.user.id,
      released_at: new Date()
    }).eq('id', requestId);

    await supabase.from('document_issuance_history').insert([{
      document_number: docNum,
      request_id: reqObj.id,
      resident_id: reqObj.resident_id,
      document_type: reqObj.certificate_type,
      issued_by: req.user.id,
      released_date: new Date(),
      status: 'VALID'
    }]);

    if (reqObj.residents && reqObj.residents.user_id) {
      await createNotification(reqObj.residents.user_id, reqObj.resident_id, 'Document Released', `Your document (${reqObj.certificate_type}) has been officially handed over and marked RELEASED.`, 'Certificate');
    }

    await logActivity(req.user.id, req.user.username, 'Scan & Release Document', 'QR Scanner', `Claimed & Released ${reqObj.certificate_type} for ${reqObj.residents.first_name} ${reqObj.residents.last_name}`, requestId);

    return res.json({ success: true, message: 'Document marked as RELEASED successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// API ROUTES - COMPLAINTS, BLOTTER, ASSISTANCE, APPOINTMENTS
// -------------------------------------------------------------

// Blotter Management
app.get('/api/admin/blotter', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { data, error } = await supabase.from('blotter_records').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, blotter: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/blotter', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { complainantName, respondentName, witnesses, incidentDate, incidentTime, location, description, actionTaken, status } = req.body;

    const countBlotter = await supabase.from('blotter_records').select('id', { count: 'exact' });
    const blotterNum = `BLOTTER-2026-${String((countBlotter.count || 0) + 1).padStart(4, '0')}`;

    const { data, error } = await supabase.from('blotter_records').insert([{
      blotter_number: blotterNum,
      complainant_name: complainantName,
      respondent_name: respondentName,
      witnesses: witnesses || '',
      incident_date: incidentDate,
      incident_time: incidentTime || null,
      location,
      description,
      action_taken: actionTaken || '',
      status: status || 'Pending',
      created_by: req.user.id
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.username, 'Create Blotter Record', 'Blotter', `Logged blotter case #${blotterNum}`);
    return res.json({ success: true, message: 'Blotter record logged successfully.', blotter: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Complaints Management
app.get('/api/admin/complaints', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { data, error } = await supabase.from('complaints').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, complaints: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/admin/complaints/:id', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    const { data, error } = await supabase.from('complaints').update({ status, remarks, updated_at: new Date() }).eq('id', id).select().single();
    if (error) throw error;

    await logActivity(req.user.id, req.user.username, 'Update Complaint Status', 'Complaints', `Case #${data.case_number} updated to ${status}`);
    return res.json({ success: true, message: 'Complaint status updated.', complaint: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Assistance Requests
app.get('/api/admin/assistance', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { data, error } = await supabase.from('assistance_requests').select('*, residents(first_name, last_name, resident_number, contact_number)').order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, assistance: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/assistance/:id/review', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    const { data, error } = await supabase.from('assistance_requests').update({
      status,
      rejection_reason: rejectionReason || '',
      approved_by: req.user.id,
      updated_at: new Date()
    }).eq('id', id).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.username, 'Review Assistance Request', 'Assistance', `Updated request ${data.request_number} to ${status}`);
    return res.json({ success: true, message: `Assistance request ${status}.`, assistance: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Appointments Management
app.get('/api/admin/appointments', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { data, error } = await supabase.from('appointments').select('*, residents(first_name, last_name, contact_number)').order('appointment_date', { ascending: true });
    if (error) throw error;
    return res.json({ success: true, appointments: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/admin/appointments/:id', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    const { data, error } = await supabase.from('appointments').update({
      status,
      rejection_reason: rejectionReason || '',
      updated_at: new Date()
    }).eq('id', id).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.username, 'Update Appointment', 'Appointments', `Appointment #${data.appointment_number} set to ${status}`);
    return res.json({ success: true, message: `Appointment status updated to ${status}.`, appointment: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// API ROUTES - ANNOUNCEMENTS, EVENTS, OFFICIALS, EMERGENCY CONTACTS
// -------------------------------------------------------------

app.get('/api/public/announcements', async (req, res) => {
  try {
    const { data, error } = await supabase.from('announcements').select('*').eq('status', 'Active').order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, announcements: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/announcements', authenticateToken, requireAdminOrStaff, async (req, res) => {
  try {
    const { title, content, imageUrl, priority, expirationDate } = req.body;

    const { data, error } = await supabase.from('announcements').insert([{
      title,
      content,
      image_url: imageUrl || '',
      priority: priority || 'Normal',
      expiration_date: expirationDate || null,
      created_by: req.user.id
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.username, 'Create Announcement', 'Announcements', `Posted: ${title}`);
    return res.json({ success: true, message: 'Announcement created.', announcement: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/public/events', async (req, res) => {
  try {
    const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: true });
    if (error) throw error;
    return res.json({ success: true, events: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/public/emergency-contacts', async (req, res) => {
  try {
    const { data, error } = await supabase.from('emergency_contacts').select('*').eq('is_active', true);
    if (error) throw error;
    return res.json({ success: true, contacts: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/public/barangay-officials', async (req, res) => {
  try {
    const { data, error } = await supabase.from('barangay_officials').select('*').eq('is_active', true).order('display_order', { ascending: true });
    if (error) throw error;
    return res.json({ success: true, officials: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// API ROUTES - RESIDENT PORTAL SPECIFIC ENDPOINTS
// -------------------------------------------------------------

// Resident Dashboard Stats
app.get('/api/resident/dashboard-summary', authenticateToken, async (req, res) => {
  try {
    if (!req.user.residentId) {
      return res.status(400).json({ success: false, message: 'User is not linked to a resident record.' });
    }

    const residentId = req.user.residentId;

    const [resData, requests, appts, comp, assist, notifs] = await Promise.all([
      supabase.from('residents').select('*, puroks(name), households(household_number)').eq('id', residentId).single(),
      supabase.from('certificate_requests').select('*').eq('resident_id', residentId).order('created_at', { ascending: false }),
      supabase.from('appointments').select('*').eq('resident_id', residentId).order('created_at', { ascending: false }),
      supabase.from('complaints').select('*').eq('complainant_id', residentId).order('created_at', { ascending: false }),
      supabase.from('assistance_requests').select('*').eq('resident_id', residentId).order('created_at', { ascending: false }),
      supabase.from('notifications').select('*').eq('resident_id', residentId).order('created_at', { ascending: false }).limit(10)
    ]);

    // Generate QR Data URL for Digital ID
    const qrDataUrl = await QRCode.toDataURL(resData.data?.qr_token || residentId);

    return res.json({
      success: true,
      resident: resData.data,
      qrDataUrl,
      requests: requests.data || [],
      appointments: appts.data || [],
      complaints: comp.data || [],
      assistance: assist.data || [],
      notifications: notifs.data || []
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Resident Submit Certificate Request
app.post('/api/resident/request-certificate', authenticateToken, async (req, res) => {
  try {
    const residentId = req.user.residentId;
    if (!residentId) return res.status(400).json({ success: false, message: 'No linked resident profile found.' });

    const { certificateType, purpose, notes, preferredReleaseDate } = req.body;
    if (!certificateType || !purpose) {
      return res.status(400).json({ success: false, message: 'Please specify certificate type and purpose.' });
    }

    const countReq = await supabase.from('certificate_requests').select('id', { count: 'exact' });
    const reqNum = `REQ-2026-${String((countReq.count || 0) + 1).padStart(5, '0')}`;

    const { data, error } = await supabase.from('certificate_requests').insert([{
      request_number: reqNum,
      resident_id: residentId,
      certificate_type: certificateType,
      purpose,
      notes: notes || '',
      preferred_release_date: preferredReleaseDate || null,
      status: 'SUBMITTED'
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.username, 'Submit Certificate Request', 'Resident Portal', `Requested ${certificateType}`, data.id);

    return res.json({ success: true, message: 'Certificate request submitted successfully.', request: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Resident Profile Edit Request
app.post('/api/resident/request-profile-edit', authenticateToken, async (req, res) => {
  try {
    const residentId = req.user.residentId;
    if (!residentId) return res.status(400).json({ success: false, message: 'No linked resident profile.' });

    const { requestedChanges, reason } = req.body;
    if (!requestedChanges || !reason) {
      return res.status(400).json({ success: false, message: 'Please provide proposed changes and reason.' });
    }

    const { data, error } = await supabase.from('profile_edit_requests').insert([{
      resident_id: residentId,
      requested_changes: requestedChanges,
      reason,
      status: 'Pending'
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.username, 'Submit Edit Profile Request', 'Resident Portal', 'Submitted profile modification request');

    return res.json({ success: true, message: 'Edit request submitted for administrator review.', request: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Resident Submit Complaint / Report
app.post('/api/resident/submit-complaint', authenticateToken, async (req, res) => {
  try {
    const residentId = req.user.residentId;
    const { complainantName, respondentName, incidentType, location, incidentDate, incidentTime, details } = req.body;

    if (!complainantName || !incidentType || !details) {
      return res.status(400).json({ success: false, message: 'Please provide complainant name, incident type, and details.' });
    }

    const countComp = await supabase.from('complaints').select('id', { count: 'exact' });
    const caseNum = `CASE-2026-${String((countComp.count || 0) + 1).padStart(4, '0')}`;

    const { data, error } = await supabase.from('complaints').insert([{
      case_number: caseNum,
      complainant_id: residentId || null,
      complainant_name: complainantName,
      respondent_name: respondentName || '',
      incident_type: incidentType,
      location: location || '',
      incident_date: incidentDate || null,
      incident_time: incidentTime || null,
      details,
      status: 'SUBMITTED'
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.username, 'Submit Complaint', 'Resident Portal', `Filed complaint Case #${caseNum}`);

    return res.json({ success: true, message: 'Complaint submitted. Barangay officials will investigate.', complaint: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Resident Submit Assistance Request
app.post('/api/resident/request-assistance', authenticateToken, async (req, res) => {
  try {
    const residentId = req.user.residentId;
    if (!residentId) return res.status(400).json({ success: false, message: 'No linked resident profile.' });

    const { assistanceType, amountOrDetails, reason } = req.body;
    if (!assistanceType || !reason) {
      return res.status(400).json({ success: false, message: 'Please specify assistance type and reason.' });
    }

    const countAssist = await supabase.from('assistance_requests').select('id', { count: 'exact' });
    const reqNum = `AST-2026-${String((countAssist.count || 0) + 1).padStart(4, '0')}`;

    const { data, error } = await supabase.from('assistance_requests').insert([{
      request_number: reqNum,
      resident_id: residentId,
      assistance_type: assistanceType,
      amount_or_details: amountOrDetails || 'Standard Assistance',
      reason,
      status: 'Pending'
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.username, 'Submit Assistance Request', 'Resident Portal', `Requested ${assistanceType} assistance`);

    return res.json({ success: true, message: 'Assistance request filed successfully.', assistance: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Resident Submit Feedback
app.post('/api/resident/submit-feedback', authenticateToken, async (req, res) => {
  try {
    const { rating, serviceType, comments } = req.body;
    if (!comments || !rating) return res.status(400).json({ success: false, message: 'Please provide rating and comments.' });

    const { data, error } = await supabase.from('feedback').insert([{
      resident_id: req.user.residentId || null,
      rating,
      service_type: serviceType || 'General Service',
      comments
    }]).select().single();

    if (error) throw error;

    return res.json({ success: true, message: 'Thank you for your feedback!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// SINGLE-PAGE APPLICATION INTEGRATED SERVING (HTML + CSS + JS)
// -------------------------------------------------------------

app.get('*', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Barangay Resident Management System</title>
  <!-- Tailwind CSS & FontAwesome CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            brand: {
              blue: '#0284c7', // Primary Blue
              darkblue: '#0369a1',
              lightblue: '#e0f2fe',
              green: '#16a34a', // Secondary/Accent Green
              darkgreen: '#15803d',
              lightgreen: '#dcfce7'
            }
          }
        }
      }
    }
  </script>

  <style>
    /* Strictly restricted color scheme: Blue, Green, White */
    body {
      background-color: #f8fafc;
      color: #0f172a;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    .bg-login-pattern {
      background-image: linear-gradient(rgba(2, 132, 199, 0.85), rgba(22, 163, 74, 0.85)), url('https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1920&q=80');
      background-size: cover;
      background-position: center;
    }

    /* Print sheet design for 8 Barangay Resident IDs per bond paper */
    @media print {
      body * {
        visibility: hidden;
      }
      #print-section, #print-section * {
        visibility: visible;
      }
      #print-section {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
      }
      .page-break {
        page-break-after: always;
      }
    }

    .id-card-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      padding: 10px;
    }

    .barangay-id-card {
      width: 3.375in;
      height: 2.125in;
      border: 2px solid #0284c7;
      border-radius: 8px;
      background: #ffffff;
      padding: 6px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      position: relative;
      overflow: hidden;
      font-size: 8px;
    }
  </style>
</head>
<body>
  <div id="app">
    <div class="flex items-center justify-center h-screen bg-slate-100">
      <div class="text-center">
        <i class="fas fa-spinner fa-spin text-4xl text-brand-blue mb-4"></i>
        <p class="text-slate-600 text-lg font-semibold">Loading Barangay System...</p>
      </div>
    </div>
  </div>

  <script>
    // Frontend Single Page Application Core State
    let state = {
      user: null,
      resident: null,
      settings: {},
      isSetupComplete: true,
      currentView: 'login', // login, setup, admin-dashboard, resident-dashboard, register, etc.
      puroks: [],
      residents: [],
      requests: [],
      blotter: [],
      appointments: [],
      assistance: [],
      announcements: [],
      scannerResult: null
    };

    // Initialize System Frontend
    async function initApp() {
      try {
        const setupRes = await fetch('/api/setup/status');
        const setupData = await setupRes.json();
        
        if (!setupData.isSetupComplete) {
          state.currentView = 'setup';
          renderApp();
          return;
        }

        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const meData = await meRes.json();
          state.user = meData.user;
          state.resident = meData.resident;
          state.settings = meData.settings || {};
          
          if (state.user.role === 'Resident') {
            state.currentView = 'resident-dashboard';
          } else {
            state.currentView = 'admin-dashboard';
          }
        } else {
          state.currentView = 'login';
        }
      } catch (err) {
        console.error('Init error:', err);
        state.currentView = 'login';
      }
      renderApp();
    }

    // Single-Page Router / View Renderer
    function renderApp() {
      const appEl = document.getElementById('app');
      
      if (state.currentView === 'setup') {
        appEl.innerHTML = renderInitialSetupForm();
      } else if (state.currentView === 'login') {
        appEl.innerHTML = renderLoginForm();
      } else if (state.currentView === 'register') {
        appEl.innerHTML = renderRegisterForm();
      } else if (state.currentView === 'admin-dashboard') {
        appEl.innerHTML = renderAdminLayout(renderAdminDashboardContent());
        loadAdminDashboardStats();
      } else if (state.currentView === 'admin-residents') {
        appEl.innerHTML = renderAdminLayout(renderAdminResidentsContent());
        loadAdminResidents();
      } else if (state.currentView === 'admin-puroks') {
        appEl.innerHTML = renderAdminLayout(renderAdminPuroksContent());
        loadAdminPuroks();
      } else if (state.currentView === 'admin-certificates') {
        appEl.innerHTML = renderAdminLayout(renderAdminCertificatesContent());
        loadAdminCertificates();
      } else if (state.currentView === 'admin-scanner') {
        appEl.innerHTML = renderAdminLayout(renderAdminScannerContent());
      } else if (state.currentView === 'admin-id-print-8') {
        appEl.innerHTML = renderAdminLayout(renderAdmin8IDsPrintContent());
        loadAdmin8IDsPrint();
      } else if (state.currentView === 'resident-dashboard') {
        appEl.innerHTML = renderResidentLayout(renderResidentDashboardContent());
        loadResidentDashboard();
      } else if (state.currentView === 'resident-digital-id') {
        appEl.innerHTML = renderResidentLayout(renderResidentDigitalIDContent());
        loadResidentDashboard();
      } else {
        appEl.innerHTML = renderLoginForm();
      }
    }

    // UI RENDERERS - SETUP & LOGIN
    function renderInitialSetupForm() {
      return \`
        <div class="min-h-screen bg-login-pattern flex items-center justify-center p-4">
          <div class="bg-white max-w-md w-full rounded-2xl shadow-2xl p-8 border-t-8 border-brand-green">
            <div class="text-center mb-6">
              <i class="fas fa-landmark text-5xl text-brand-blue mb-2"></i>
              <h2 class="text-2xl font-bold text-slate-800">Initial System Setup</h2>
              <p class="text-slate-500 text-sm">Create the First Super Administrator Account</p>
            </div>
            <form onsubmit="handleInitialSetup(event)" class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Barangay Name</label>
                <input type="text" id="setupBrgyName" value="Barangay Central" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue border-slate-300">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Super Admin Username</label>
                <input type="text" id="setupUsername" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue border-slate-300">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Email Address</label>
                <input type="email" id="setupEmail" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue border-slate-300">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Master Password</label>
                <input type="password" id="setupPassword" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue border-slate-300">
              </div>
              <button type="submit" class="w-full bg-brand-green hover:bg-brand-darkgreen text-white font-bold py-3 rounded-lg shadow-md transition">Initialize System</button>
            </form>
          </div>
        </div>
      \`;
    }

    function renderLoginForm() {
      return \`
        <div class="min-h-screen bg-login-pattern flex items-center justify-center p-4">
          <div class="bg-white max-w-md w-full rounded-2xl shadow-2xl p-8 border-t-8 border-brand-blue">
            <div class="text-center mb-6">
              <i class="fas fa-shield-halved text-5xl text-brand-blue mb-2"></i>
              <h2 class="text-2xl font-bold text-slate-800">\${state.settings.barangay_name || 'Barangay Central'}</h2>
              <p class="text-slate-500 text-sm">Resident Management & Service Portal</p>
            </div>
            
            <div class="flex mb-6 bg-slate-100 p-1 rounded-lg">
              <button onclick="setRoleType('Admin')" id="tabAdmin" class="flex-1 py-2 text-sm font-semibold rounded-md bg-white text-brand-blue shadow-sm">Admin / Staff</button>
              <button onclick="setRoleType('Resident')" id="tabResident" class="flex-1 py-2 text-sm font-semibold rounded-md text-slate-500">Resident Login</button>
            </div>

            <form onsubmit="handleLogin(event)" class="space-y-4">
              <input type="hidden" id="loginRoleType" value="Admin">
              <div>
                <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Username or Email</label>
                <input type="text" id="loginUsername" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue border-slate-300">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Password</label>
                <input type="password" id="loginPassword" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue border-slate-300">
              </div>
              <button type="submit" class="w-full bg-brand-blue hover:bg-brand-darkblue text-white font-bold py-3 rounded-lg shadow-md transition">Sign In</button>
            </form>

            <div class="mt-6 text-center border-t pt-4">
              <p class="text-xs text-slate-500">Are you a resident without an account?</p>
              <a href="#" onclick="navigate('register')" class="text-sm font-semibold text-brand-green hover:underline">Register New Resident Account</a>
            </div>
          </div>
        </div>
      \`;
    }

    function renderRegisterForm() {
      return \`
        <div class="min-h-screen bg-slate-100 p-4 flex justify-center">
          <div class="bg-white max-w-3xl w-full rounded-xl shadow-lg p-8 my-8 border-t-4 border-brand-green">
            <div class="flex justify-between items-center mb-6 border-b pb-4">
              <div>
                <h2 class="text-2xl font-bold text-slate-800">Barangay Resident Online Registration</h2>
                <p class="text-slate-500 text-sm">Fill out official resident information for validation</p>
              </div>
              <button onclick="navigate('login')" class="text-brand-blue font-semibold text-sm hover:underline"><i class="fas fa-arrow-left mr-1"></i> Back to Login</button>
            </div>

            <form onsubmit="handleRegistration(event)" class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label class="block text-xs font-bold text-slate-700 uppercase mb-1">First Name *</label>
                  <input type="text" id="regFirstName" required class="w-full px-3 py-2 border rounded-lg border-slate-300">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Middle Name</label>
                  <input type="text" id="regMiddleName" class="w-full px-3 py-2 border rounded-lg border-slate-300">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Last Name *</label>
                  <input type="text" id="regLastName" required class="w-full px-3 py-2 border rounded-lg border-slate-300">
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Date of Birth *</label>
                  <input type="date" id="regDob" required class="w-full px-3 py-2 border rounded-lg border-slate-300">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Gender *</label>
                  <select id="regGender" required class="w-full px-3 py-2 border rounded-lg border-slate-300">
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Civil Status *</label>
                  <select id="regCivilStatus" required class="w-full px-3 py-2 border rounded-lg border-slate-300">
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Widowed">Widowed</option>
                    <option value="Separated">Separated</option>
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Contact Number</label>
                  <input type="text" id="regContact" class="w-full px-3 py-2 border rounded-lg border-slate-300">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Complete Address *</label>
                  <input type="text" id="regAddress" required class="w-full px-3 py-2 border rounded-lg border-slate-300">
                </div>
              </div>

              <div class="border-t pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Desired Username *</label>
                  <input type="text" id="regUsername" required class="w-full px-3 py-2 border rounded-lg border-slate-300">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Email Address *</label>
                  <input type="email" id="regEmail" required class="w-full px-3 py-2 border rounded-lg border-slate-300">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Password *</label>
                  <input type="password" id="regPassword" required class="w-full px-3 py-2 border rounded-lg border-slate-300">
                </div>
              </div>

              <button type="submit" class="w-full bg-brand-green hover:bg-brand-darkgreen text-white font-bold py-3 rounded-lg shadow-md mt-4 transition">Submit Resident Application</button>
            </form>
          </div>
        </div>
      \`;
    }

    // UI LAYOUTS & NAVIGATION
    function renderAdminLayout(contentHtml) {
      return \`
        <div class="flex h-screen bg-slate-100 overflow-hidden">
          <!-- Sidebar -->
          <aside class="w-64 bg-slate-900 text-white flex flex-col">
            <div class="p-4 bg-slate-950 flex items-center space-x-3 border-b border-slate-800">
              <i class="fas fa-landmark text-brand-green text-2xl"></i>
              <div>
                <h1 class="font-bold text-sm tracking-wide">\${state.settings.barangay_name || 'Barangay Portal'}</h1>
                <p class="text-xs text-brand-green font-semibold">Admin Workspace</p>
              </div>
            </div>
            <nav class="flex-1 p-4 space-y-1 overflow-y-auto">
              <button onclick="navigate('admin-dashboard')" class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white text-sm"><i class="fas fa-chart-line w-5"></i><span>Dashboard</span></button>
              <button onclick="navigate('admin-residents')" class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white text-sm"><i class="fas fa-users w-5"></i><span>Residents</span></button>
              <button onclick="navigate('admin-puroks')" class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white text-sm"><i class="fas fa-map-marked-alt w-5"></i><span>Puroks & Households</span></button>
              <button onclick="navigate('admin-certificates')" class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white text-sm"><i class="fas fa-file-contract w-5"></i><span>Certificate Requests</span></button>
              <button onclick="navigate('admin-scanner')" class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white text-sm"><i class="fas fa-qrcode w-5"></i><span>QR Scanner & Service</span></button>
              <button onclick="navigate('admin-id-print-8')" class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white text-sm"><i class="fas fa-id-card w-5"></i><span>Print 8 IDs Sheet</span></button>
            </nav>
            <div class="p-4 border-t border-slate-800 flex items-center justify-between">
              <span class="text-xs text-slate-400 font-semibold">\${state.user?.username} (\${state.user?.role})</span>
              <button onclick="handleLogout()" class="text-xs text-red-400 hover:underline font-bold">Logout</button>
            </div>
          </aside>
          <!-- Main Content -->
          <main class="flex-1 overflow-y-auto p-8">
            \${contentHtml}
          </main>
        </div>
      \`;
    }

    function renderResidentLayout(contentHtml) {
      return \`
        <div class="flex h-screen bg-slate-100 overflow-hidden">
          <aside class="w-64 bg-slate-900 text-white flex flex-col">
            <div class="p-4 bg-slate-950 flex items-center space-x-3 border-b border-slate-800">
              <i class="fas fa-user-shield text-brand-green text-2xl"></i>
              <div>
                <h1 class="font-bold text-sm tracking-wide">Resident Portal</h1>
                <p class="text-xs text-slate-400">\${state.resident?.first_name || 'Resident'} \${state.resident?.last_name || ''}</p>
              </div>
            </div>
            <nav class="flex-1 p-4 space-y-1 overflow-y-auto">
              <button onclick="navigate('resident-dashboard')" class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white text-sm"><i class="fas fa-home w-5"></i><span>My Dashboard</span></button>
              <button onclick="navigate('resident-digital-id')" class="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white text-sm"><i class="fas fa-id-card w-5"></i><span>My Digital ID</span></button>
            </nav>
            <div class="p-4 border-t border-slate-800 flex items-center justify-between">
              <span class="text-xs text-slate-400">\${state.resident?.resident_number || ''}</span>
              <button onclick="handleLogout()" class="text-xs text-red-400 hover:underline font-bold">Logout</button>
            </div>
          </aside>
          <main class="flex-1 overflow-y-auto p-8">
            \${contentHtml}
          </main>
        </div>
      \`;
    }

    // CONTENT RENDERERS - ADMIN
    function renderAdminDashboardContent() {
      return \`
        <div class="space-y-6">
          <div class="flex justify-between items-center">
            <h2 class="text-2xl font-bold text-slate-800">Barangay Operational Dashboard</h2>
            <span class="bg-brand-lightblue text-brand-blue font-semibold px-3 py-1 rounded-full text-xs">Live Supabase Data</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <p class="text-xs font-bold text-slate-500 uppercase">Total Active Residents</p>
              <h3 id="statActiveResidents" class="text-3xl font-extrabold text-brand-blue mt-2">--</h3>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <p class="text-xs font-bold text-slate-500 uppercase">Pending Registrations</p>
              <h3 id="statPendingRegistrations" class="text-3xl font-extrabold text-brand-green mt-2">--</h3>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <p class="text-xs font-bold text-slate-500 uppercase">Pending Certificates</p>
              <h3 id="statPendingCertificates" class="text-3xl font-extrabold text-brand-blue mt-2">--</h3>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <p class="text-xs font-bold text-slate-500 uppercase">Senior Citizens</p>
              <h3 id="statSeniorCitizens" class="text-3xl font-extrabold text-brand-green mt-2">--</h3>
            </div>
          </div>
        </div>
      \`;
    }

    function renderAdminResidentsContent() {
      return \`
        <div class="space-y-6">
          <div class="flex justify-between items-center border-b pb-4">
            <h2 class="text-2xl font-bold text-slate-800">Resident Database</h2>
          </div>
          <div id="adminResidentsTableContainer" class="bg-white rounded-xl shadow-sm border overflow-hidden">
            <p class="p-4 text-slate-500">Loading residents record...</p>
          </div>
        </div>
      \`;
    }

    function renderAdminPuroksContent() {
      return \`
        <div class="space-y-6">
          <h2 class="text-2xl font-bold text-slate-800">Puroks & Real-Time Resident Counts</h2>
          <div id="adminPuroksContainer" class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <p class="text-slate-500">Loading puroks...</p>
          </div>
        </div>
      \`;
    }

    function renderAdminCertificatesContent() {
      return \`
        <div class="space-y-6">
          <h2 class="text-2xl font-bold text-slate-800">Certificate & Service Requests</h2>
          <div id="adminCertificatesContainer" class="bg-white rounded-xl shadow-sm border p-4">
            <p class="text-slate-500">Loading requests...</p>
          </div>
        </div>
      \`;
    }

    function renderAdminScannerContent() {
      return \`
        <div class="max-w-xl mx-auto bg-white p-6 rounded-xl shadow-md border border-slate-200 space-y-4">
          <h2 class="text-xl font-bold text-slate-800 border-b pb-2"><i class="fas fa-qrcode text-brand-blue mr-2"></i> Resident QR Service Verification</h2>
          <p class="text-xs text-slate-500">Enter or scan resident secure QR token below:</p>
          <div class="flex space-x-2">
            <input type="text" id="scannerInputToken" placeholder="Enter QR Token or Resident ID" class="flex-1 px-3 py-2 border rounded-lg">
            <button onclick="handleVerifyQRToken()" class="bg-brand-blue text-white font-bold px-4 py-2 rounded-lg">Verify Token</button>
          </div>
          <div id="scannerResultContainer" class="mt-4 pt-4 border-t hidden">
          </div>
        </div>
      \`;
    }

    function renderAdmin8IDsPrintContent() {
      return \`
        <div class="space-y-4">
          <div class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border">
            <div>
              <h2 class="text-xl font-bold text-slate-800">Print 8 Barangay Resident Cards / Sheet</h2>
              <p class="text-xs text-slate-500">Standard Bond Paper Format Grid (3.375" x 2.125" per ID)</p>
            </div>
            <button onclick="window.print()" class="bg-brand-green text-white font-bold px-4 py-2 rounded-lg shadow"><i class="fas fa-print mr-2"></i> Print Sheet</button>
          </div>
          <div id="print-section">
            <div id="idGrid8Container" class="id-card-grid bg-white p-4 border rounded-xl">
              <p class="text-slate-500">Loading resident card grid...</p>
            </div>
          </div>
        </div>
      \`;
    }

    function renderResidentDashboardContent() {
      return \`
        <div class="space-y-6">
          <h2 class="text-2xl font-bold text-slate-800">Welcome, \${state.resident?.first_name || 'Resident'}!</h2>
          <div class="bg-white p-6 rounded-xl shadow-sm border flex items-center justify-between">
            <div>
              <p class="text-xs text-slate-500 uppercase font-bold">Barangay Resident ID</p>
              <h3 class="text-2xl font-extrabold text-brand-blue">\${state.resident?.resident_number || 'N/A'}</h3>
              <p class="text-sm text-slate-600 mt-1">Status: <span class="text-brand-green font-bold">\${state.resident?.resident_status || 'Active'}</span></p>
            </div>
            <button onclick="navigate('resident-digital-id')" class="bg-brand-blue text-white px-4 py-2 rounded-lg font-semibold text-sm">View Digital ID</button>
          </div>
        </div>
      \`;
    }

    function renderResidentDigitalIDContent() {
      return \`
        <div class="max-w-md mx-auto space-y-4">
          <h2 class="text-xl font-bold text-slate-800 text-center">BARANGAY RESIDENT CARD (DIGITAL ID)</h2>
          <div class="barangay-id-card mx-auto shadow-xl">
            <div class="flex justify-between items-center border-b pb-1 mb-1">
              <div class="font-bold text-brand-blue uppercase tracking-tight text-xs">\${state.settings.barangay_name || 'Barangay Central'}</div>
              <span class="text-[7px] bg-brand-lightgreen text-brand-green px-1 font-bold rounded">OFFICIAL ID</span>
            </div>
            <div class="flex space-x-2 items-center">
              <div class="w-16 h-16 bg-slate-200 border rounded flex items-center justify-center text-slate-400 font-bold">PHOTO</div>
              <div class="flex-1 space-y-0.5">
                <div class="font-bold text-sm text-slate-900">\${state.resident?.first_name || ''} \${state.resident?.last_name || ''}</div>
                <div class="text-slate-600">ID: \${state.resident?.resident_number || ''}</div>
                <div class="text-slate-600">DOB: \${state.resident?.dob || 'N/A'}</div>
                <div class="text-slate-600">Address: \${state.resident?.address || ''}</div>
              </div>
            </div>
          </div>
        </div>
      \`;
    }

    // FRONTEND ACTIONS & API FETCHERS
    function setRoleType(type) {
      document.getElementById('loginRoleType').value = type;
      if (type === 'Admin') {
        document.getElementById('tabAdmin').className = 'flex-1 py-2 text-sm font-semibold rounded-md bg-white text-brand-blue shadow-sm';
        document.getElementById('tabResident').className = 'flex-1 py-2 text-sm font-semibold rounded-md text-slate-500';
      } else {
        document.getElementById('tabResident').className = 'flex-1 py-2 text-sm font-semibold rounded-md bg-white text-brand-green shadow-sm';
        document.getElementById('tabAdmin').className = 'flex-1 py-2 text-sm font-semibold rounded-md text-slate-500';
      }
    }

    function navigate(view) {
      state.currentView = view;
      renderApp();
    }

    async function handleLogin(e) {
      e.preventDefault();
      const username = document.getElementById('loginUsername').value;
      const password = document.getElementById('loginPassword').value;
      const roleType = document.getElementById('loginRoleType').value;

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, roleType })
      });
      const data = await res.json();
      if (data.success) {
        state.user = data.user;
        state.resident = data.resident;
        state.currentView = data.user.role === 'Resident' ? 'resident-dashboard' : 'admin-dashboard';
        renderApp();
      } else {
        alert(data.message || 'Login failed');
      }
    }

    async function handleLogout() {
      await fetch('/api/auth/logout', { method: 'POST' });
      state.user = null;
      state.resident = null;
      state.currentView = 'login';
      renderApp();
    }

    async function loadAdminDashboardStats() {
      const res = await fetch('/api/admin/dashboard-stats');
      const data = await res.json();
      if (data.success) {
        document.getElementById('statActiveResidents').innerText = data.stats.activeResidents;
        document.getElementById('statPendingRegistrations').innerText = data.stats.pendingRegistrations;
        document.getElementById('statPendingCertificates').innerText = data.stats.pendingCertificates;
        document.getElementById('statSeniorCitizens').innerText = data.stats.seniorCitizens;
      }
    }

    async function loadAdminResidents() {
      const res = await fetch('/api/admin/residents');
      const data = await res.json();
      if (data.success) {
        let html = \`<table class="w-full text-left text-xs"><thead class="bg-slate-100 uppercase text-slate-600"><tr><th class="p-3">ID</th><th class="p-3">Name</th><th class="p-3">Status</th><th class="p-3">Actions</th></tr></thead><tbody>\`;
        data.residents.forEach(r => {
          html += \`<tr class="border-b"><td class="p-3 font-bold">\${r.resident_number}</td><td class="p-3">\${r.first_name} \${r.last_name}</td><td class="p-3">\${r.resident_status}</td><td class="p-3"><button onclick="reviewResident('\${r.id}', 'APPROVE')" class="text-brand-green font-bold mr-2">Approve</button><button onclick="reviewResident('\${r.id}', 'REJECT')" class="text-red-500 font-bold">Reject</button></td></tr>\`;
        });
        html += '</tbody></table>';
        document.getElementById('adminResidentsTableContainer').innerHTML = html;
      }
    }

    async function reviewResident(id, action) {
      const res = await fetch(\`/api/admin/residents/\${id}/review\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      alert(data.message);
      loadAdminResidents();
    }

    async function loadAdminPuroks() {
      const res = await fetch('/api/admin/puroks');
      const data = await res.json();
      if (data.success) {
        let html = '';
        data.puroks.forEach(p => {
          html += \`<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><h4 class="font-bold text-slate-800 text-lg">\${p.name}</h4><p class="text-xs text-slate-500 mt-1">\${p.description || 'Barangay Zone'}</p><div class="mt-4 pt-3 border-t flex justify-between items-center"><span class="text-xs uppercase font-bold text-slate-400">Residents</span><span class="text-xl font-extrabold text-brand-green">\${p.resident_count}</span></div></div>\`;
        });
        document.getElementById('adminPuroksContainer').innerHTML = html;
      }
    }

    async function loadAdminCertificates() {
      const res = await fetch('/api/admin/certificate-requests');
      const data = await res.json();
      if (data.success) {
        let html = \`<table class="w-full text-left text-xs"><thead class="bg-slate-100 uppercase text-slate-600"><tr><th class="p-3">Req #</th><th class="p-3">Resident</th><th class="p-3">Type</th><th class="p-3">Status</th><th class="p-3">Action</th></tr></thead><tbody>\`;
        data.requests.forEach(r => {
          html += \`<tr class="border-b"><td class="p-3 font-bold">\${r.request_number}</td><td class="p-3">\${r.residents?.first_name || ''} \${r.residents?.last_name || ''}</td><td class="p-3">\${r.certificate_type}</td><td class="p-3 font-bold text-brand-blue">\${r.status}</td><td class="p-3"><button onclick="processCert('\${r.id}', 'RELEASED')" class="bg-brand-green text-white px-2 py-1 rounded">Release</button></td></tr>\`;
        });
        html += '</tbody></table>';
        document.getElementById('adminCertificatesContainer').innerHTML = html;
      }
    }

    async function processCert(id, status) {
      const res = await fetch(\`/api/admin/certificate-requests/\${id}/process\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      alert(data.message);
      loadAdminCertificates();
    }

    async function handleVerifyQRToken() {
      const token = document.getElementById('scannerInputToken').value;
      if (!token) return alert('Token required');
      const res = await fetch(\`/api/scanner/verify/\${token}\`);
      const data = await res.json();
      const el = document.getElementById('scannerResultContainer');
      el.classList.remove('hidden');
      if (data.success) {
        el.innerHTML = \`<div class="p-4 bg-brand-lightgreen rounded-lg text-brand-darkgreen font-bold">✓ VERIFIED RESIDENT</div><div class="mt-2 text-sm"><strong>Name:</strong> \${data.resident.first_name} \${data.resident.last_name}<br><strong>ID:</strong> \${data.resident.resident_number}</div>\`;
      } else {
        el.innerHTML = \`<div class="p-4 bg-red-100 text-red-700 font-bold">Invalid Token</div>\`;
      }
    }

    async function loadAdmin8IDsPrint() {
      const res = await fetch('/api/admin/residents');
      const data = await res.json();
      if (data.success) {
        let html = '';
        const list = data.residents.slice(0, 8);
        list.forEach(r => {
          html += \`
            <div class="barangay-id-card">
              <div class="flex justify-between items-center border-b pb-1 mb-1">
                <div class="font-bold text-brand-blue uppercase text-[8px]">\${state.settings.barangay_name || 'Barangay Central'}</div>
                <span class="text-[6px] bg-brand-lightgreen text-brand-green px-1 font-bold rounded">RESIDENT CARD</span>
              </div>
              <div class="flex space-x-2 items-center">
                <div class="w-12 h-12 bg-slate-200 border rounded flex items-center justify-center text-slate-400 font-bold text-[8px]">PHOTO</div>
                <div class="flex-1 space-y-0.5">
                  <div class="font-bold text-xs text-slate-900">\${r.first_name} \${r.last_name}</div>
                  <div class="text-slate-600 text-[7px]">ID: \${r.resident_number}</div>
                  <div class="text-slate-600 text-[7px]">DOB: \${r.dob}</div>
                  <div class="text-slate-600 text-[7px]">Address: \${r.address}</div>
                </div>
              </div>
            </div>
          \`;
        });
        document.getElementById('idGrid8Container').innerHTML = html;
      }
    }

    async function loadResidentDashboard() {
      const res = await fetch('/api/resident/dashboard-summary');
      const data = await res.json();
      if (data.success) {
        state.resident = data.resident;
      }
    }

    window.onload = initApp;
  </script>
</body>
</html>
  `);
});

// Start Node Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`BARANGAY RESIDENT MANAGEMENT SYSTEM SERVER RUNNING`);
  console.log(`Port: ${PORT}`);
  console.log(`Environment: Production / Render`);
  console.log(`====================================================`);
});
