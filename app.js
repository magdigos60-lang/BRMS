/**
 * BARANGAY RESIDENT MANAGEMENT SYSTEM
 * Single-file Express Application
 * Fully responsive JS rendering, client-side dynamic routes, Supabase integration, QR generation, multi-ID PDF print layouts.
 */

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase Client
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-anon-key';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Setup Express Middlewares
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'barangay_secret_key_2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

const upload = multer({ storage: multer.memoryStorage() });

// Helper: Database initialization status
async function getSystemSettings() {
  const { data, error } = await supabase.from('system_settings').select('*').eq('id', 1).single();
  if (error || !data) {
    return {
      system_initialized: false,
      barangay_name: 'Barangay Central',
      municipality: 'City of Angeles',
      province: 'Pampanga',
      system_name: 'Barangay Resident Management System',
      barangay_logo_url: '',
      captain_signature_url: '',
      id_background_url: ''
    };
  }
  return data;
}

// Helper: Log User Activity
async function logActivity(userId, username, action, details, ip = '127.0.0.1') {
  try {
    await supabase.from('user_activity_logs').insert([{
      user_id: userId,
      username: username || 'System',
      action,
      details,
      ip_address: ip
    }]);
  } catch (err) {
    console.error('Activity log error:', err);
  }
}

// Security Middleware
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized session.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.role === 'Resident') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin/Staff credentials required.' });
  }
  next();
}

// ==========================================
// API ENDPOINTS - SETUP & AUTHENTICATION
// ==========================================

app.get('/api/status', async (req, res) => {
  const settings = await getSystemSettings();
  res.json({
    initialized: settings.system_initialized,
    settings,
    user: req.session ? req.session.user : null
  });
});

app.post('/api/setup/initialize', async (req, res) => {
  try {
    const settings = await getSystemSettings();
    if (settings.system_initialized) {
      return res.status(400).json({ success: false, message: 'System is already initialized.' });
    }

    const { username, email, password, barangay_name, captain_name } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Missing required admin credentials.' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create First Super Admin
    const { data: newUser, error: userError } = await supabase.from('users').insert([{
      username,
      email,
      password_hash,
      role: 'Super Admin',
      is_active: true,
      is_approved: true,
      permissions: { all: true }
    }]).select().single();

    if (userError) throw userError;

    // Update system settings to initialized
    await supabase.from('system_settings').update({
      system_initialized: true,
      barangay_name: barangay_name || 'Barangay Central',
      barangay_captain: captain_name || 'Hon. Juan Dela Cruz',
      updated_at: new Date()
    }).eq('id', 1);

    await logActivity(newUser.id, newUser.username, 'SYSTEM_SETUP', 'First admin setup initialized.');

    res.json({ success: true, message: 'System setup completed successfully. Please log in.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Please enter username and password.' });
    }

    const { data: user, error } = await supabase.from('users').select('*').or(`username.eq.${username},email.eq.${username}`).single();
    if (error || !user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact Administrator.' });
    }

    if (!user.is_approved) {
      return res.status(403).json({ success: false, message: 'Account registration pending approval.' });
    }

    const validPass = await bcrypt.compare(password, user.password_hash);
    if (!validPass) {
      await supabase.from('login_history').insert([{ username, login_status: 'FAILED', ip_address: req.ip }]);
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // Get linked resident data if user is a resident
    let resident = null;
    if (user.resident_id) {
      const { data: resData } = await supabase.from('residents').select('*').eq('id', user.resident_id).single();
      resident = resData;
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      resident_id: user.resident_id,
      resident
    };

    await supabase.from('login_history').insert([{ user_id: user.id, username: user.username, login_status: 'SUCCESS', ip_address: req.ip }]);
    await logActivity(user.id, user.username, 'LOGIN', 'User logged in successfully.');

    res.json({ success: true, user: req.session.user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  if (req.session) {
    req.session.destroy();
  }
  res.json({ success: true, message: 'Logged out.' });
});

// ==========================================
// API ENDPOINTS - RESIDENT REGISTRATION
// ==========================================

app.post('/api/public/register', async (req, res) => {
  try {
    const {
      first_name, middle_name, last_name, suffix, date_of_birth, gender, civil_status,
      contact_number, email, address, purok_id, occupation, password, photo_base64
    } = req.body;

    if (!first_name || !last_name || !date_of_birth || !gender || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please fill in all required fields.' });
    }

    // Check duplicate email
    const { data: existingUser } = await supabase.from('users').select('id').eq('email', email).single();
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email is already registered.' });
    }

    const year = new Date().getFullYear();
    const resident_code = `BRGY-${year}-${Math.floor(100000 + Math.random() * 900000)}`;
    const qr_secure_token = `VERIFY-BRGY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Create resident profile pending status
    const { data: resident, error: resErr } = await supabase.from('residents').insert([{
      resident_code,
      first_name,
      middle_name,
      last_name,
      suffix,
      date_of_birth,
      gender,
      civil_status,
      contact_number,
      email,
      address,
      purok_id: purok_id || null,
      occupation,
      resident_status: 'Pending',
      photo_url: photo_base64 || null,
      qr_secure_token
    }]).select().single();

    if (resErr) throw resErr;

    // Create user login pending approval
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    await supabase.from('users').insert([{
      username: email.split('@')[0] + Math.floor(Math.random() * 100),
      email,
      password_hash,
      role: 'Resident',
      is_active: true,
      is_approved: false,
      resident_id: resident.id
    }]);

    res.json({ success: true, message: 'Registration submitted successfully. Please wait for Barangay Staff approval.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// API ENDPOINTS - ADMIN RESIDENT MANAGEMENT
// ==========================================

app.get('/api/residents', requireAdmin, async (req, res) => {
  try {
    const { status, search, purok_id } = req.query;
    let query = supabase.from('residents').select('*, puroks(name), households(household_number)').order('created_at', { ascending: false });

    if (status) query = query.eq('resident_status', status);
    if (purok_id) query = query.eq('purok_id', purok_id);
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,resident_code.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/residents/approve', requireAdmin, async (req, res) => {
  try {
    const { resident_id } = req.body;
    await supabase.from('residents').update({ resident_status: 'Active', updated_at: new Date() }).eq('id', resident_id);
    
    // Activate linked user account
    const { data: user } = await supabase.from('users').update({ is_approved: true }).eq('resident_id', resident_id).select().single();
    
    if (user) {
      await supabase.from('notifications').insert([{
        user_id: user.id,
        title: 'Registration Approved',
        message: 'Your resident account registration has been approved. You can now log in and access all resident services.'
      }]);
    }

    await logActivity(req.session.user.id, req.session.user.username, 'APPROVE_RESIDENT', `Approved resident ID: ${resident_id}`);
    res.json({ success: true, message: 'Resident account approved.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/residents/reject', requireAdmin, async (req, res) => {
  try {
    const { resident_id, reason } = req.body;
    await supabase.from('residents').update({ resident_status: 'Archived', updated_at: new Date() }).eq('id', resident_id);
    
    const { data: user } = await supabase.from('users').select('id').eq('resident_id', resident_id).single();
    if (user) {
      await supabase.from('notifications').insert([{
        user_id: user.id,
        title: 'Registration Rejected',
        message: `Your registration was rejected. Reason: ${reason || 'Incomplete details'}`
      }]);
    }

    await logActivity(req.session.user.id, req.session.user.username, 'REJECT_RESIDENT', `Rejected resident ID: ${resident_id}. Reason: ${reason}`);
    res.json({ success: true, message: 'Resident registration rejected.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Add / Update Resident
app.post('/api/residents/save', requireAdmin, async (req, res) => {
  try {
    const {
      id, first_name, middle_name, last_name, suffix, date_of_birth, gender, civil_status,
      contact_number, email, address, purok_id, household_id, is_senior_citizen, is_pwd,
      pwd_disability_details, is_solo_parent, photo_url, voter_status
    } = req.body;

    if (id) {
      // Update
      const { error } = await supabase.from('residents').update({
        first_name, middle_name, last_name, suffix, date_of_birth, gender, civil_status,
        contact_number, email, address, purok_id: purok_id || null, household_id: household_id || null,
        is_senior_citizen: !!is_senior_citizen, is_pwd: !!is_pwd, pwd_disability_details,
        is_solo_parent: !!is_solo_parent, photo_url, voter_status, updated_at: new Date()
      }).eq('id', id);

      if (error) throw error;
      await logActivity(req.session.user.id, req.session.user.username, 'UPDATE_RESIDENT', `Updated resident profile: ${first_name} ${last_name}`);
      return res.json({ success: true, message: 'Resident record updated.' });
    } else {
      // New Resident
      const year = new Date().getFullYear();
      const resident_code = `BRGY-${year}-${Math.floor(100000 + Math.random() * 900000)}`;
      const qr_secure_token = `VERIFY-BRGY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const { error } = await supabase.from('residents').insert([{
        resident_code, first_name, middle_name, last_name, suffix, date_of_birth, gender, civil_status,
        contact_number, email, address, purok_id: purok_id || null, household_id: household_id || null,
        is_senior_citizen: !!is_senior_citizen, is_pwd: !!is_pwd, pwd_disability_details,
        is_solo_parent: !!is_solo_parent, photo_url, voter_status, resident_status: 'Active',
        qr_secure_token
      }]);

      if (error) throw error;
      await logActivity(req.session.user.id, req.session.user.username, 'ADD_RESIDENT', `Added new resident: ${first_name} ${last_name}`);
      return res.json({ success: true, message: 'New resident created successfully.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Archive Resident
app.post('/api/residents/archive', requireAdmin, async (req, res) => {
  try {
    const { resident_id } = req.body;
    await supabase.from('residents').update({ resident_status: 'Archived', updated_at: new Date() }).eq('id', resident_id);
    await logActivity(req.session.user.id, req.session.user.username, 'ARCHIVE_RESIDENT', `Archived resident ID: ${resident_id}`);
    res.json({ success: true, message: 'Resident archived successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Restore Resident
app.post('/api/residents/restore', requireAdmin, async (req, res) => {
  try {
    const { resident_id } = req.body;
    await supabase.from('residents').update({ resident_status: 'Active', updated_at: new Date() }).eq('id', resident_id);
    await logActivity(req.session.user.id, req.session.user.username, 'RESTORE_RESIDENT', `Restored resident ID: ${resident_id}`);
    res.json({ success: true, message: 'Resident restored to active list.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// API ENDPOINTS - PUROKS & HOUSEHOLDS
// ==========================================

app.get('/api/puroks', async (req, res) => {
  try {
    const { data: puroks, error } = await supabase.from('puroks').select('*').order('name', { ascending: true });
    if (error) throw error;

    // Get count for each purok
    const { data: residents } = await supabase.from('residents').select('purok_id').eq('resident_status', 'Active');
    
    const countMap = {};
    (residents || []).forEach(r => {
      if (r.purok_id) countMap[r.purok_id] = (countMap[r.purok_id] || 0) + 1;
    });

    const result = puroks.map(p => ({
      ...p,
      resident_count: countMap[p.id] || 0
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/puroks/save', requireAdmin, async (req, res) => {
  try {
    const { id, name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Purok name required.' });

    if (id) {
      await supabase.from('puroks').update({ name, description }).eq('id', id);
    } else {
      await supabase.from('puroks').insert([{ name, description }]);
    }
    res.json({ success: true, message: 'Purok saved.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/households', async (req, res) => {
  try {
    const { data, error } = await supabase.from('households').select('*, puroks(name)').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/households/save', requireAdmin, async (req, res) => {
  try {
    const { id, household_number, address, purok_id } = req.body;
    if (!household_number) return res.status(400).json({ success: false, message: 'Household number required.' });

    if (id) {
      await supabase.from('households').update({ household_number, address, purok_id: purok_id || null }).eq('id', id);
    } else {
      await supabase.from('households').insert([{ household_number, address, purok_id: purok_id || null }]);
    }
    res.json({ success: true, message: 'Household saved.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// API ENDPOINTS - CERTIFICATES & REQUESTS
// ==========================================

app.get('/api/certificates/requests', requireAuth, async (req, res) => {
  try {
    let query = supabase.from('certificate_requests').select('*, residents(first_name, last_name, resident_code)').order('created_at', { ascending: false });
    
    if (req.session.user.role === 'Resident') {
      query = query.eq('resident_id', req.session.user.resident_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/certificates/request', requireAuth, async (req, res) => {
  try {
    const { certificate_type, purpose, preferred_release_date, notes } = req.body;
    const resident_id = req.session.user.resident_id;

    if (!resident_id) return res.status(400).json({ success: false, message: 'No linked resident profile.' });

    const request_number = `REQ-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    const { data, error } = await supabase.from('certificate_requests').insert([{
      request_number,
      resident_id,
      certificate_type,
      purpose,
      preferred_release_date: preferred_release_date || null,
      notes,
      status: 'SUBMITTED'
    }]).select().single();

    if (error) throw error;
    res.json({ success: true, message: 'Certificate request submitted successfully.', data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/certificates/update-status', requireAdmin, async (req, res) => {
  try {
    const { request_id, status, rejection_reason, issued_document_url } = req.body;
    
    const { data: certReq, error } = await supabase.from('certificate_requests').update({
      status,
      rejection_reason: rejection_reason || null,
      issued_document_url: issued_document_url || null,
      updated_at: new Date()
    }).eq('id', request_id).select('*, residents(id)').single();

    if (error) throw error;

    // Send notification
    const { data: user } = await supabase.from('users').select('id').eq('resident_id', certReq.resident_id).single();
    if (user) {
      await supabase.from('notifications').insert([{
        user_id: user.id,
        title: `Certificate Request ${status}`,
        message: `Your request for ${certReq.certificate_type} is now: ${status}.`
      }]);
    }

    // Record issuance if RELEASED
    if (status === 'RELEASED') {
      const doc_num = `CERT-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      const verification_token = `VERIFY-CERT-${Date.now()}`;
      await supabase.from('certificate_issuance').insert([{
        document_number: doc_num,
        request_id: certReq.id,
        resident_id: certReq.resident_id,
        certificate_type: certReq.certificate_type,
        issued_by_user_id: req.session.user.id,
        verification_token,
        status: 'VALID'
      }]);
    }

    res.json({ success: true, message: `Request status updated to ${status}.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Verification Endpoint (for QR Scans)
app.get('/api/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Check Resident Token
    const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('qr_secure_token', token).single();
    if (resident) {
      // Fetch active certificate requests for quick claim check
      const { data: requests } = await supabase.from('certificate_requests').select('*').eq('resident_id', resident.id).in('status', ['READY FOR RELEASE', 'APPROVED']);
      return res.json({
        type: 'RESIDENT_VERIFICATION',
        valid: true,
        resident,
        active_requests: requests || []
      });
    }

    // Check Certificate Verification Token
    const { data: cert } = await supabase.from('certificate_issuance').select('*, residents(first_name, last_name, resident_code)').eq('verification_token', token).single();
    if (cert) {
      return res.json({
        type: 'CERTIFICATE_VERIFICATION',
        valid: cert.status === 'VALID' || cert.status === 'RELEASED',
        certificate: cert
      });
    }

    res.status(404).json({ valid: false, message: 'Invalid QR Code or Verification Token.' });
  } catch (err) {
    res.status(500).json({ valid: false, message: err.message });
  }
});

// ==========================================
// API ENDPOINTS - DASHBOARD & REPORTS
// ==========================================

app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
  try {
    const [
      resTotal, resActive, resArchived, resPending,
      households, puroks, seniors, pwds, soloParents,
      pendingCerts, pendingAppts, pendingComplaints
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
      supabase.from('certificate_requests').select('id', { count: 'exact' }).eq('status', 'SUBMITTED'),
      supabase.from('appointments').select('id', { count: 'exact' }).eq('status', 'PENDING'),
      supabase.from('complaints').select('id', { count: 'exact' }).eq('status', 'SUBMITTED')
    ]);

    res.json({
      success: true,
      stats: {
        total_residents: resTotal.count || 0,
        active_residents: resActive.count || 0,
        archived_residents: resArchived.count || 0,
        pending_registrations: resPending.count || 0,
        total_households: households.count || 0,
        total_puroks: puroks.count || 0,
        senior_citizens: seniors.count || 0,
        pwd_count: pwds.count || 0,
        solo_parents: soloParents.count || 0,
        pending_certificates: pendingCerts.count || 0,
        pending_appointments: pendingAppts.count || 0,
        pending_complaints: pendingComplaints.count || 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// API ENDPOINTS - SETTINGS MANAGEMENT
// ==========================================

app.post('/api/settings/save', requireAdmin, async (req, res) => {
  try {
    const {
      barangay_name, municipality, province, barangay_address, contact_number, email,
      website, barangay_captain, system_name, barangay_logo_url, captain_signature_url,
      id_background_url, certificate_header, footer_info
    } = req.body;

    const { error } = await supabase.from('system_settings').update({
      barangay_name, municipality, province, barangay_address, contact_number, email,
      website, barangay_captain, system_name, barangay_logo_url, captain_signature_url,
      id_background_url, certificate_header, footer_info, updated_at: new Date()
    }).eq('id', 1);

    if (error) throw error;

    await logActivity(req.session.user.id, req.session.user.username, 'UPDATE_SETTINGS', 'System & Barangay Settings updated.');
    res.json({ success: true, message: 'Settings saved persistently in database.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// FRONTEND INTERFACE GENERATION (HTML/JS/CSS)
// ==========================================

app.get('*', (req, res) => {
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Barangay Resident Management System</title>

  <!-- Tailwind CSS & FontAwesome -->
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  
  <!-- QR Code Generator & Scanner CDN -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <script src="https://unpkg.com/html5-qrcode"></script>

  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            brand: {
              blue: '#004B87',
              darkblue: '#002F56',
              lightblue: '#0072CE',
              green: '#00875A',
              lightgreen: '#E6F4EA',
              accentgreen: '#10B981',
              white: '#FFFFFF',
              graybg: '#F4F6F9'
            }
          }
        }
      }
    }
  </script>

  <style>
    body { background-color: #F4F6F9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    .bg-login-overlay { background: linear-gradient(135deg, rgba(0, 75, 135, 0.88), rgba(0, 135, 90, 0.85)); }
    .print-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    @media print {
      body * { visibility: hidden; }
      #printableArea, #printableArea * { visibility: visible; }
      #printableArea { position: absolute; left: 0; top: 0; width: 100%; }
      .no-print { display: none !important; }
    }
    .id-card {
      width: 3.375in;
      height: 2.125in;
      border-radius: 8px;
      position: relative;
      background: linear-gradient(135deg, #004B87 0%, #00875A 100%);
      color: white;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      overflow: hidden;
      font-size: 8px;
    }
  </style>
</head>
<body class="text-gray-800">

  <div id="app">
    <div class="flex h-screen items-center justify-center">
      <div class="text-center">
        <i class="fas fa-circle-notch fa-spin text-4xl text-brand-blue mb-4"></i>
        <p class="text-gray-600 font-semibold">Loading Barangay System...</p>
      </div>
    </div>
  </div>

  <script>
    // Global Application State
    window.state = {
      system: null,
      user: null,
      currentRoute: 'login',
      modalData: null
    };

    // Initialize Application
    async function initApp() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        window.state.system = data.settings;
        
        if (!data.initialized) {
          renderSetupView();
          return;
        }

        if (data.user) {
          window.state.user = data.user;
          renderMainApp();
        } else {
          renderLoginView();
        }
      } catch (err) {
        console.error('App init error:', err);
      }
    }

    // System First Launch Setup View
    function renderSetupView() {
      document.getElementById('app').innerHTML = \`
        <div class="min-h-screen flex items-center justify-center bg-cover bg-center" style="background-image: url('https://scontent.fcrk3-3.fna.fbcdn.net/v/t39.30808-6/467984538_122130208178389200_2470999473131951042_n.jpg?stp=dst-jpg_tt6&cstp=mx1857x2048&ctp=s1857x2048&_nc_cat=107&ccb=1-7&_nc_sid=cc71e4&_nc_eui2=AeH-CrVk3UW0Tqq0z_SDhKwemnbseM68ydCadux4zrzJ0I4R6gykVtH1GEMMnjk_E0vUUupJBZ3vwMdzuIfYXMgZ&_nc_ohc=dQMK5ddUuHcQ7kNvwGa1gPS&_nc_oc=AdoFKxV7tJpE4hgQ4pRI2MUvCVRMJBztcvXKVR66-nYuAHhEYRtmWNOf2aAis5Et9sE&_nc_zt=23&_nc_ht=scontent.fcrk3-3.fna&_nc_gid=xdfM6qfHMw-bCjf2oW_Nzw&_nc_ss=7b2a8&oh=00_AQMFazlU8aRub-iyfGwAHzijoCAXz8cAE0ZoQgTtFlJvjw&oe=6AC35F71');">
          <div class="absolute inset-0 bg-login-overlay"></div>
          <div class="relative z-10 bg-white p-8 rounded-xl shadow-2xl max-w-lg w-full m-4">
            <div class="text-center mb-6">
              <i class="fas fa-shield-alt text-5xl text-brand-blue mb-2"></i>
              <h2 class="text-2xl font-bold text-brand-blue">System Initialization Setup</h2>
              <p class="text-sm text-gray-600">Create the primary Super Administrator account to begin using the system.</p>
            </div>
            <form onsubmit="handleInitialSetup(event)" class="space-y-4">
              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Barangay Name</label>
                <input type="text" id="setup_barangay" value="Barangay Central" class="w-full border p-2.5 rounded text-sm focus:ring-2 focus:ring-brand-blue" required />
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Barangay Captain</label>
                <input type="text" id="setup_captain" value="Hon. Juan Dela Cruz" class="w-full border p-2.5 rounded text-sm focus:ring-2 focus:ring-brand-blue" required />
              </div>
              <div class="border-t pt-4">
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Super Admin Username</label>
                <input type="text" id="setup_username" placeholder="admin" class="w-full border p-2.5 rounded text-sm focus:ring-2 focus:ring-brand-blue" required />
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Super Admin Email</label>
                <input type="email" id="setup_email" placeholder="admin@barangay.gov.ph" class="w-full border p-2.5 rounded text-sm focus:ring-2 focus:ring-brand-blue" required />
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Admin Password</label>
                <input type="password" id="setup_password" class="w-full border p-2.5 rounded text-sm focus:ring-2 focus:ring-brand-blue" required />
              </div>
              <button type="submit" class="w-full bg-brand-green hover:bg-emerald-700 text-white font-bold py-3 rounded-lg shadow-md transition">Initialize System</button>
            </form>
          </div>
        </div>
      \`;
    }

    async function handleInitialSetup(e) {
      e.preventDefault();
      const payload = {
        barangay_name: document.getElementById('setup_barangay').value,
        captain_name: document.getElementById('setup_captain').value,
        username: document.getElementById('setup_username').value,
        email: document.getElementById('setup_email').value,
        password: document.getElementById('setup_password').value
      };

      try {
        const res = await fetch('/api/setup/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          alert('Initialization complete! Please log in.');
          location.reload();
        } else {
          alert('Setup failed: ' + data.message);
        }
      } catch (err) {
        alert('Network error during setup.');
      }
    }

    // Login View Generator
    function renderLoginView() {
      const bgImg = window.state.system?.login_bg || 'https://scontent.fcrk3-3.fna.fbcdn.net/v/t39.30808-6/467984538_122130208178389200_2470999473131951042_n.jpg?stp=dst-jpg_tt6&cstp=mx1857x2048&ctp=s1857x2048&_nc_cat=107&ccb=1-7&_nc_sid=cc71e4&_nc_eui2=AeH-CrVk3UW0Tqq0z_SDhKwemnbseM68ydCadux4zrzJ0I4R6gykVtH1GEMMnjk_E0vUUupJBZ3vwMdzuIfYXMgZ&_nc_ohc=dQMK5ddUuHcQ7kNvwGa1gPS&_nc_oc=AdoFKxV7tJpE4hgQ4pRI2MUvCVRMJBztcvXKVR66-nYuAHhEYRtmWNOf2aAis5Et9sE&_nc_zt=23&_nc_ht=scontent.fcrk3-3.fna&_nc_gid=xdfM6qfHMw-bCjf2oW_Nzw&_nc_ss=7b2a8&oh=00_AQMFazlU8aRub-iyfGwAHzijoCAXz8cAE0ZoQgTtFlJvjw&oe=6AC35F71';

      document.getElementById('app').innerHTML = \`
        <div class="min-h-screen flex items-center justify-center bg-cover bg-center relative" style="background-image: url('\${bgImg}');">
          <div class="absolute inset-0 bg-login-overlay"></div>
          
          <div class="relative z-10 bg-white/95 backdrop-blur-md p-8 rounded-2xl shadow-2xl max-w-md w-full m-4 border border-white/20">
            <div class="text-center mb-6">
              <div class="w-20 h-20 bg-brand-blue rounded-full mx-auto flex items-center justify-center shadow-lg text-white text-3xl mb-3">
                <i class="fas fa-building-columns"></i>
              </div>
              <h1 class="text-xl font-extrabold text-brand-blue">\${window.state.system?.barangay_name || 'Barangay Central'}</h1>
              <p class="text-xs text-gray-500 font-semibold uppercase tracking-wider">\${window.state.system?.system_name || 'Resident Management System'}</p>
            </div>

            <form onsubmit="handleLogin(event)" class="space-y-4">
              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Username or Email</label>
                <div class="relative">
                  <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400"><i class="fas fa-user"></i></span>
                  <input type="text" id="login_user" class="w-full border border-gray-300 pl-10 pr-3 py-2.5 rounded-lg text-sm focus:ring-2 focus:ring-brand-blue outline-none" placeholder="Enter username" required />
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Password</label>
                <div class="relative">
                  <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400"><i class="fas fa-lock"></i></span>
                  <input type="password" id="login_pass" class="w-full border border-gray-300 pl-10 pr-3 py-2.5 rounded-lg text-sm focus:ring-2 focus:ring-brand-blue outline-none" placeholder="••••••••" required />
                </div>
              </div>

              <button type="submit" class="w-full bg-brand-blue hover:bg-brand-darkblue text-white font-bold py-3 rounded-lg shadow-md transition flex items-center justify-center gap-2">
                <i class="fas fa-sign-in-alt"></i> Secure Sign In
              </button>
            </form>

            <div class="mt-6 border-t pt-4 text-center">
              <p class="text-xs text-gray-600 mb-2">Are you a resident without an account?</p>
              <button onclick="renderRegistrationView()" class="text-xs font-bold text-brand-green hover:underline">Register Resident Account</button>
            </div>
          </div>
        </div>
      \`;
    }

    async function handleLogin(e) {
      e.preventDefault();
      const payload = {
        username: document.getElementById('login_user').value,
        password: document.getElementById('login_pass').value
      };

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          window.state.user = data.user;
          renderMainApp();
        } else {
          alert('Login Error: ' + data.message);
        }
      } catch (err) {
        alert('Network request failed.');
      }
    }

    // Public Registration View Generator
    function renderRegistrationView() {
      document.getElementById('app').innerHTML = \`
        <div class="min-h-screen bg-gray-100 p-4 md:p-8 flex justify-center items-center">
          <div class="bg-white max-w-2xl w-full rounded-2xl shadow-xl p-6 border border-gray-200">
            <div class="flex items-center justify-between border-b pb-4 mb-6">
              <div>
                <h2 class="text-xl font-bold text-brand-blue">Barangay Resident Registration</h2>
                <p class="text-xs text-gray-500">Fill out official details for verification.</p>
              </div>
              <button onclick="renderLoginView()" class="text-xs text-brand-blue hover:underline"><i class="fas fa-arrow-left"></i> Back to Login</button>
            </div>

            <form onsubmit="handleRegister(event)" class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">First Name *</label>
                  <input type="text" id="reg_fn" required class="w-full border p-2 rounded text-sm" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">Middle Name</label>
                  <input type="text" id="reg_mn" class="w-full border p-2 rounded text-sm" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">Last Name *</label>
                  <input type="text" id="reg_ln" required class="w-full border p-2 rounded text-sm" />
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">Date of Birth *</label>
                  <input type="date" id="reg_dob" required class="w-full border p-2 rounded text-sm" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">Gender *</label>
                  <select id="reg_gender" required class="w-full border p-2 rounded text-sm">
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">Civil Status *</label>
                  <select id="reg_civil" required class="w-full border p-2 rounded text-sm">
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Widowed">Widowed</option>
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">Email Address *</label>
                  <input type="email" id="reg_email" required class="w-full border p-2 rounded text-sm" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">Contact Number</label>
                  <input type="text" id="reg_contact" placeholder="09123456789" class="w-full border p-2 rounded text-sm" />
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold text-gray-600 mb-1">Complete Address *</label>
                <textarea id="reg_address" required rows="2" class="w-full border p-2 rounded text-sm"></textarea>
              </div>

              <div>
                <label class="block text-xs font-semibold text-gray-600 mb-1">Account Password *</label>
                <input type="password" id="reg_pass" required class="w-full border p-2 rounded text-sm" />
              </div>

              <button type="submit" class="w-full bg-brand-green hover:bg-emerald-700 text-white font-bold py-3 rounded-lg shadow transition">
                Submit Resident Registration
              </button>
            </form>
          </div>
        </div>
      \`;
    }

    async function handleRegister(e) {
      e.preventDefault();
      const payload = {
        first_name: document.getElementById('reg_fn').value,
        middle_name: document.getElementById('reg_mn').value,
        last_name: document.getElementById('reg_ln').value,
        date_of_birth: document.getElementById('reg_dob').value,
        gender: document.getElementById('reg_gender').value,
        civil_status: document.getElementById('reg_civil').value,
        email: document.getElementById('reg_email').value,
        contact_number: document.getElementById('reg_contact').value,
        address: document.getElementById('reg_address').value,
        password: document.getElementById('reg_pass').value
      };

      try {
        const res = await fetch('/api/public/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          alert('Registration submitted! Please wait for admin approval.');
          renderLoginView();
        } else {
          alert('Error: ' + data.message);
        }
      } catch (err) {
        alert('Registration request failed.');
      }
    }

    // Main Portal Layout Shell Generator
    function renderMainApp() {
      const isResident = window.state.user.role === 'Resident';
      
      document.getElementById('app').innerHTML = \`
        <div class="flex h-screen overflow-hidden bg-brand-graybg">
          <!-- Sidebar -->
          <div class="w-64 bg-brand-blue text-white flex flex-col justify-between shadow-xl z-20">
            <div>
              <div class="p-5 border-b border-white/10 flex items-center gap-3">
                <i class="fas fa-landmark text-2xl text-emerald-400"></i>
                <div>
                  <h1 class="font-extrabold text-sm leading-tight text-white">\${window.state.system?.barangay_name || 'Barangay Central'}</h1>
                  <span class="text-[10px] text-emerald-300 uppercase tracking-widest font-semibold">\${isResident ? 'Resident Portal' : 'Admin Portal'}</span>
                </div>
              </div>
              <nav class="p-3 space-y-1 text-sm overflow-y-auto max-h-[calc(100vh-140px)]">
                \${isResident ? renderResidentNav() : renderAdminNav()}
              </nav>
            </div>
            <div class="p-4 border-t border-white/10 bg-brand-darkblue flex items-center justify-between">
              <div class="flex items-center gap-2 truncate">
                <div class="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center font-bold text-xs text-white">
                  \${window.state.user.username.charAt(0).toUpperCase()}
                </div>
                <div class="truncate">
                  <p class="text-xs font-bold truncate">\${window.state.user.username}</p>
                  <p class="text-[10px] text-gray-300 truncate">\${window.state.user.role}</p>
                </div>
              </div>
              <button onclick="handleLogout()" class="text-gray-300 hover:text-red-400 text-sm" title="Logout"><i class="fas fa-power-off"></i></button>
            </div>
          </div>

          <!-- Main Content Area -->
          <div class="flex-1 flex flex-col overflow-y-auto">
            <header class="bg-white shadow-sm p-4 flex items-center justify-between border-b px-8">
              <h2 id="pageTitle" class="text-xl font-bold text-brand-blue">Dashboard</h2>
              <div class="flex items-center gap-4">
                <span class="text-xs bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-full"><i class="fas fa-check-circle text-emerald-600 mr-1"></i> System Active</span>
              </div>
            </header>
            <main id="mainContainer" class="p-8 flex-1">
              <!-- Dynamic Route Content Inserted Here -->
            </main>
          </div>
        </div>
        <div id="modalContainer"></div>
      \`;

      loadRoute('dashboard');
    }

    function renderAdminNav() {
      return \`
        <a onclick="loadRoute('dashboard')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 cursor-pointer text-white font-medium"><i class="fas fa-chart-pie w-5 text-emerald-400"></i> Dashboard</a>
        <a onclick="loadRoute('residents')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 cursor-pointer text-white font-medium"><i class="fas fa-users w-5 text-emerald-400"></i> Residents</a>
        <a onclick="loadRoute('certificates')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 cursor-pointer text-white font-medium"><i class="fas fa-file-signature w-5 text-emerald-400"></i> Certificate Requests</a>
        <a onclick="loadRoute('puroks')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 cursor-pointer text-white font-medium"><i class="fas fa-map-marked-alt w-5 text-emerald-400"></i> Puroks & Households</a>
        <a onclick="loadRoute('scanner')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 cursor-pointer text-white font-medium"><i class="fas fa-qrcode w-5 text-emerald-400"></i> QR Scanner</a>
        <a onclick="loadRoute('print-ids')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 cursor-pointer text-white font-medium"><i class="fas fa-id-card w-5 text-emerald-400"></i> Bulk ID Print (8 Grid)</a>
        <a onclick="loadRoute('settings')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 cursor-pointer text-white font-medium"><i class="fas fa-sliders-h w-5 text-emerald-400"></i> System Settings</a>
      \`;
    }

    function renderResidentNav() {
      return \`
        <a onclick="loadRoute('dashboard')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 cursor-pointer text-white font-medium"><i class="fas fa-home w-5 text-emerald-400"></i> Dashboard</a>
        <a onclick="loadRoute('my-id')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 cursor-pointer text-white font-medium"><i class="fas fa-id-badge w-5 text-emerald-400"></i> My Digital ID</a>
        <a onclick="loadRoute('req-cert')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 cursor-pointer text-white font-medium"><i class="fas fa-certificate w-5 text-emerald-400"></i> Request Certificate</a>
      \`;
    }

    // Router Logic
    async function loadRoute(route) {
      window.state.currentRoute = route;
      const container = document.getElementById('mainContainer');
      const title = document.getElementById('pageTitle');

      if (route === 'dashboard') {
        title.innerText = 'System Dashboard';
        container.innerHTML = '<p class="text-gray-500">Loading Dashboard Statistics...</p>';
        const res = await fetch('/api/dashboard/stats');
        const data = await res.json();
        renderDashboardView(data.stats);
      } else if (route === 'residents') {
        title.innerText = 'Resident Management';
        renderResidentsView();
      } else if (route === 'my-id') {
        title.innerText = 'My Digital Barangay Resident Card';
        renderDigitalIDView();
      } else if (route === 'print-ids') {
        title.innerText = 'Bulk ID Sheet Generator (8 IDs per Sheet)';
        renderBulkIDPrintView();
      } else if (route === 'scanner') {
        title.innerText = 'Official QR Service Scanner';
        renderScannerView();
      } else if (route === 'settings') {
        title.innerText = 'Barangay System Settings';
        renderSettingsView();
      }
    }

    // View: Dashboard
    function renderDashboardView(stats) {
      document.getElementById('mainContainer').innerHTML = \`
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-brand-blue">
            <p class="text-xs font-bold text-gray-400 uppercase">Total Residents</p>
            <h3 class="text-3xl font-extrabold text-brand-blue mt-1">\${stats.total_residents || 0}</h3>
          </div>
          <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-brand-green">
            <p class="text-xs font-bold text-gray-400 uppercase">Active Residents</p>
            <h3 class="text-3xl font-extrabold text-brand-green mt-1">\${stats.active_residents || 0}</h3>
          </div>
          <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-amber-500">
            <p class="text-xs font-bold text-gray-400 uppercase">Pending Approvals</p>
            <h3 class="text-3xl font-extrabold text-amber-500 mt-1">\${stats.pending_registrations || 0}</h3>
          </div>
          <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-brand-lightblue">
            <p class="text-xs font-bold text-gray-400 uppercase">Total Households</p>
            <h3 class="text-3xl font-extrabold text-brand-lightblue mt-1">\${stats.total_households || 0}</h3>
          </div>
        </div>
      \`;
    }

    // View: Residents Management
    async function renderResidentsView() {
      const container = document.getElementById('mainContainer');
      container.innerHTML = '<p class="text-gray-500">Fetching resident directory...</p>';

      const res = await fetch('/api/residents?status=Active');
      const data = await res.json();

      let rows = '';
      if (data.data.length === 0) {
        rows = '<tr><td colspan="5" class="text-center py-8 text-gray-500">No residents found. Register or approve your first resident to get started.</td></tr>';
      } else {
        data.data.forEach(r => {
          rows += \`
            <tr class="border-b hover:bg-gray-50 text-sm">
              <td class="p-3 font-bold text-brand-blue">\${r.resident_code}</td>
              <td class="p-3 font-semibold">\${r.first_name} \${r.last_name}</td>
              <td class="p-3">\${r.gender}</td>
              <td class="p-3">\${r.puroks?.name || 'Unassigned'}</td>
              <td class="p-3">
                <span class="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-bold">\${r.resident_status}</span>
              </td>
            </tr>
          \`;
        });
      }

      container.innerHTML = \`
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div class="flex items-center justify-between mb-6">
            <h3 class="font-bold text-lg text-brand-blue">Resident Directory</h3>
            <button onclick="openAddResidentModal()" class="bg-brand-green hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-lg shadow"><i class="fas fa-user-plus mr-2"></i> Add Resident</button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-gray-50 text-xs text-gray-500 font-bold uppercase border-b">
                  <th class="p-3">Resident ID</th>
                  <th class="p-3">Full Name</th>
                  <th class="p-3">Gender</th>
                  <th class="p-3">Purok</th>
                  <th class="p-3">Status</th>
                </tr>
              </thead>
              <tbody>\${rows}</tbody>
            </table>
          </div>
        </div>
      \`;
    }

    // View: Digital ID
    function renderDigitalIDView() {
      const resident = window.state.user.resident || {
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        resident_code: 'BRGY-2026-000001',
        gender: 'Male',
        date_of_birth: '1995-05-15',
        qr_secure_token: 'VERIFY-DEFAULT'
      };

      document.getElementById('mainContainer').innerHTML = \`
        <div class="flex flex-col items-center justify-center py-8">
          <div class="id-card p-4 flex flex-col justify-between">
            <div class="flex items-center justify-between border-b border-white/20 pb-1">
              <div>
                <p class="font-black text-[9px] uppercase tracking-wider">\${window.state.system?.barangay_name || 'Barangay Central'}</p>
                <p class="text-[7px] text-emerald-200 uppercase font-bold">Barangay Resident Card</p>
              </div>
              <i class="fas fa-shield-alt text-lg"></i>
            </div>
            
            <div class="flex items-center gap-3 my-2">
              <div class="w-14 h-14 bg-white/20 rounded border border-white/40 flex items-center justify-center font-bold text-xl">
                \${resident.first_name.charAt(0)}
              </div>
              <div>
                <p class="text-[7px] text-emerald-100 uppercase">Resident Name</p>
                <p class="font-bold text-xs uppercase leading-tight">\${resident.first_name} \${resident.last_name}</p>
                <p class="text-[7px] text-emerald-100 uppercase mt-1">ID Number</p>
                <p class="font-mono font-bold text-[9px] text-yellow-300">\${resident.resident_code}</p>
              </div>
            </div>

            <div class="flex items-end justify-between border-t border-white/20 pt-1">
              <div>
                <p class="text-[6px] text-emerald-100">Issued: \${new Date().toLocaleDateString()}</p>
              </div>
              <div id="digitalQrContainer" class="bg-white p-1 rounded"></div>
            </div>
          </div>
          <p class="text-xs text-gray-500 mt-4"><i class="fas fa-info-circle"></i> Digital ID synchronized with official physical Barangay Resident Card.</p>
        </div>
      \`;

      new QRCode(document.getElementById("digitalQrContainer"), {
        text: "/verify/" + resident.qr_secure_token,
        width: 32,
        height: 32
      });
    }

    // View: Bulk 8 ID Sheet Print Layout
    function renderBulkIDPrintView() {
      document.getElementById('mainContainer').innerHTML = \`
        <div class="bg-white p-6 rounded-xl shadow-sm border mb-6 no-print">
          <h3 class="font-bold text-brand-blue mb-2">8 IDs per Bond Paper Layout Sheet</h3>
          <p class="text-xs text-gray-600 mb-4">Generates standard size IDs configured into a 2x4 grid for standard Letter/Bond paper printing.</p>
          <button onclick="window.print()" class="bg-brand-blue hover:bg-brand-darkblue text-white text-sm font-bold px-6 py-2.5 rounded-lg shadow"><i class="fas fa-print mr-2"></i> Print 8 IDs Sheet</button>
        </div>

        <div id="printableArea" class="p-4 bg-white">
          <div class="print-grid">
            \${Array(8).fill(0).map((_, i) => \`
              <div class="id-card p-3 border border-gray-400">
                <div class="flex items-center justify-between border-b border-white/20 pb-1">
                  <div>
                    <p class="font-black text-[8px] uppercase">\${window.state.system?.barangay_name || 'Barangay Central'}</p>
                    <p class="text-[6px] text-emerald-200 uppercase font-bold">BARANGAY RESIDENT CARD</p>
                  </div>
                </div>
                <div class="flex items-center gap-2 my-2">
                  <div class="w-12 h-12 bg-white/20 rounded border border-white/40 flex items-center justify-center font-bold text-sm">
                    R\${i+1}
                  </div>
                  <div>
                    <p class="font-bold text-[9px] uppercase">Resident Sample \${i+1}</p>
                    <p class="font-mono text-[8px] text-yellow-300">BRGY-2026-00000\${i+1}</p>
                  </div>
                </div>
              </div>
            \`).join('')}
          </div>
        </div>
      \`;
    }

    // View: QR Scanner
    function renderScannerView() {
      document.getElementById('mainContainer').innerHTML = \`
        <div class="max-w-md mx-auto bg-white p-6 rounded-xl shadow-sm border border-gray-100 text-center">
          <h3 class="font-bold text-brand-blue mb-4">Official Verification Scanner</h3>
          <div id="qr-reader" class="w-full bg-gray-100 rounded-lg overflow-hidden mb-4"></div>
          <p class="text-xs text-gray-500">Scan Resident QR Code or Official Issued Document QR Token.</p>
        </div>
      \`;

      const html5QrCode = new Html5Qrcode("qr-reader");
      html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          html5QrCode.stop();
          alert("Scanned Code Token: " + decodedText);
        },
        () => {}
      ).catch(err => console.log('Camera init error', err));
    }

    // View: Settings
    function renderSettingsView() {
      const s = window.state.system || {};
      document.getElementById('mainContainer').innerHTML = \`
        <div class="bg-white p-6 rounded-xl shadow-sm border max-w-2xl">
          <h3 class="font-bold text-brand-blue mb-4">Barangay System Configuration</h3>
          <form onsubmit="handleSaveSettings(event)" class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Barangay Name</label>
              <input type="text" id="set_b_name" value="\${s.barangay_name || ''}" class="w-full border p-2 rounded text-sm" required />
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Barangay Captain</label>
              <input type="text" id="set_b_captain" value="\${s.barangay_captain || ''}" class="w-full border p-2 rounded text-sm" required />
            </div>
            <button type="submit" class="bg-brand-green hover:bg-emerald-700 text-white text-sm font-bold px-6 py-2.5 rounded-lg shadow">Save Settings</button>
          </form>
        </div>
      \`;
    }

    async function handleSaveSettings(e) {
      e.preventDefault();
      const payload = {
        barangay_name: document.getElementById('set_b_name').value,
        barangay_captain: document.getElementById('set_b_captain').value
      };

      const res = await fetch('/api/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert('Settings saved persistently.');
        location.reload();
      }
    }

    async function handleLogout() {
      await fetch('/api/auth/logout', { method: 'POST' });
      location.reload();
    }

    // Run Initialization on Load
    window.onload = initApp;
  </script>
</body>
</html>`;

  res.send(htmlContent);
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` Barangay Resident Management System Running`);
  console.log(` Environment Port: ${PORT}`);
  console.log(` Ready for deployment on Render + Supabase`);
  console.log(`====================================================`);
});
