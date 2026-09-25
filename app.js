/**
 * BARANGAY RESIDENT MANAGEMENT SYSTEM
 * FULLY FUNCTIONAL SINGLE-FILE EXPRESS & SUPABASE SERVER APPLIANCE
 * 
 * Required Environment Variables (for Render / Local .env):
 * - SUPABASE_URL: Your Supabase Project URL
 * - SUPABASE_ANON_KEY: Your Supabase Public Anon Key
 * - JWT_SECRET: Secret key for session cookies/tokens
 * - PORT: Listening port (automatically supplied by Render)
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'barangay_secure_jwt_token_key_2026';

// SUPABASE CLIENT INITIALIZATION
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// MIDDLEWARES
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(fileUpload({ limits: { fileSize: 10 * 1024 * 1024 } }));

// AUXILIARY HELPER: ACTIVITY LOGGING
async function logActivity(userId, userName, action, details, req) {
  if (!supabase) return;
  try {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '') : '';
    await supabase.from('activity_logs').insert([{
      user_id: userId || null,
      user_name: userName || 'System',
      action: action,
      details: details,
      ip_address: ip
    }]);
  } catch (err) {
    console.error('Activity Log Error:', err.message);
  }
}

// AUXILIARY HELPER: NOTIFICATION CREATION
async function createNotification(userId, title, message, type = 'General', linkUrl = '') {
  if (!supabase || !userId) return;
  try {
    await supabase.from('notifications').insert([{
      user_id: userId,
      title: title,
      message: message,
      type: type,
      link_url: linkUrl,
      is_read: false
    }]);
  } catch (err) {
    console.error('Notification Error:', err.message);
  }
}

// AUTHENTICATION MIDDLEWARE
const authenticateToken = async (req, res, next) => {
  const token = req.cookies.brgy_token;
  if (!token) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized. Session expired or not logged in.' });
    }
    return res.redirect('/login');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.clearCookie('brgy_token');
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Session invalid. Please re-authenticate.' });
    }
    return res.redirect('/login');
  }
};

// ROLE AUTHORIZATION MIDDLEWARE
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      if (req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Forbidden. Insufficient authorization privileges.' });
      }
      return res.send(renderUnauthorizedPage());
    }
    next();
  };
};

// INITIAL SETUP CHECKER
async function checkAdminExists() {
  if (!supabase) return false;
  const { data, error } = await supabase.from('users').select('id').eq('role', 'Admin').limit(1);
  if (error || !data || data.length === 0) {
    return false;
  }
  return true;
}

// GET DEFAULT BARANGAY BRANDING SETTINGS
async function getBarangayBranding() {
  const defaults = {
    barangay_name: 'Barangay Central',
    barangay_logo: '',
    barangay_address: 'Barangay Hall, Main St., City Center',
    contact_number: '(02) 8123-4567',
    email: 'info@barangaycentral.gov.ph',
    website: 'https://barangaycentral.gov.ph'
  };
  if (!supabase) return defaults;
  try {
    const { data } = await supabase.from('barangay_settings').select('*').limit(1).single();
    return data ? { ...defaults, ...data } : defaults;
  } catch (e) {
    return defaults;
  }
}

// ============================================================================
// API ROUTES
// ============================================================================

// 1. SYSTEM SETUP ROUTE
app.post('/api/setup/admin', async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: 'Database environment variables not configured.' });
    const hasAdmin = await checkAdminExists();
    if (hasAdmin) {
      return res.status(400).json({ error: 'System is already initialized. An administrator account already exists.' });
    }

    const { fullName, username, password, confirmPassword, barangayName, barangayAddress, contactNumber, email } = req.body;

    if (!fullName || !username || !password) {
      return res.status(400).json({ error: 'Full Name, Username/Email, and Password are required.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create Admin User
    const { data: newUser, error: userError } = await supabase.from('users').insert([{
      full_name: fullName,
      username: username,
      password_hash: passwordHash,
      role: 'Admin',
      is_active: true
    }]).select().single();

    if (userError) throw userError;

    // Create Barangay Settings
    await supabase.from('barangay_settings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('barangay_settings').insert([{
      barangay_name: barangayName || 'Barangay Central',
      barangay_address: barangayAddress || 'Main Street, City Center',
      contact_number: contactNumber || '(02) 8123-4567',
      email: email || 'info@barangaycentral.gov.ph'
    }]);

    await logActivity(newUser.id, newUser.full_name, 'System Setup', 'Initial Administrator account and Barangay profile created.', req);

    return res.json({ success: true, message: 'Administrator setup successful. You can now log in.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. AUTHENTICATION LOGIN ROUTE
app.post('/api/auth/login', async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: 'Database configuration missing.' });
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const { data: user, error } = await supabase.from('users').select('*').eq('username', username).single();

    if (error || !user) {
      return res.status(400).json({ error: 'Invalid login credentials.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated. Please contact your Administrator.' });
    }

    const validPass = await bcrypt.compare(password, user.password_hash);
    if (!validPass) {
      return res.status(400).json({ error: 'Invalid login credentials.' });
    }

    // If Resident role, fetch linked resident profile
    let residentId = null;
    let residentStatus = null;
    if (user.role === 'Resident') {
      const { data: resData } = await supabase.from('residents').select('id, status').eq('user_id', user.id).single();
      if (resData) {
        residentId = resData.id;
        residentStatus = resData.status;
      }
      if (residentStatus === 'Rejected') {
        return res.status(403).json({ error: 'Your resident registration application was rejected. Access denied.' });
      }
    }

    const tokenPayload = {
      id: user.id,
      fullName: user.full_name,
      username: user.username,
      role: user.role,
      residentId: residentId
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '12h' });

    res.cookie('brgy_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 12 * 60 * 60 * 1000
    });

    await logActivity(user.id, user.full_name, 'User Login', `Successfully logged in as ${user.role}`, req);

    return res.json({
      success: true,
      role: user.role,
      redirect: user.role === 'Resident' ? '/portal' : '/dashboard'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. LOGOUT ROUTE
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('brgy_token');
  return res.json({ success: true, redirect: '/login' });
});

// 4. PUBLIC RESIDENT SELF-REGISTRATION ROUTE
app.post('/api/public/register', async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: 'Database environment offline.' });

    const {
      firstName, middleName, lastName, suffix, dateOfBirth, gender, civilStatus,
      contactNumber, email, address, purokId, occupation, educationalAttainment,
      nationality, voterStatus, pwdStatus, seniorCitizenStatus, soloParentStatus, password
    } = req.body;

    if (!firstName || !lastName || !dateOfBirth || !gender || !civilStatus || !address || !email || !password) {
      return res.status(400).json({ error: 'Please fill out all mandatory registration fields.' });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase.from('users').select('id').eq('username', email).single();
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create User Account
    const { data: newUser, error: userError } = await supabase.from('users').insert([{
      full_name: `${firstName} ${lastName}`.trim(),
      username: email,
      password_hash: passwordHash,
      role: 'Resident',
      is_active: true
    }]).select().single();

    if (userError) throw userError;

    // Handle File Upload for Identification Document if present
    let documentUrl = '';
    if (req.files && req.files.identificationDocument) {
      const file = req.files.identificationDocument;
      const fileName = `documents/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from('barangay-files').upload(fileName, file.data, {
        contentType: file.mimetype
      });
      if (!uploadError && uploadData) {
        const { data: publicUrlData } = supabase.storage.from('barangay-files').getPublicUrl(fileName);
        documentUrl = publicUrlData.publicUrl;
      }
    }

    // Calculate age
    const birthDate = new Date(dateOfBirth);
    const age = Math.floor((new Date() - birthDate) / (365.25 * 24 * 60 * 60 * 1000));

    // Create Resident Record (STATUS = PENDING)
    const { data: newResident, error: resError } = await supabase.from('residents').insert([{
      user_id: newUser.id,
      first_name: firstName,
      middle_name: middleName || '',
      last_name: lastName,
      suffix: suffix || '',
      date_of_birth: dateOfBirth,
      gender: gender,
      civil_status: civilStatus,
      contact_number: contactNumber || '',
      email: email,
      address: address,
      purok_id: purokId || null,
      occupation: occupation || '',
      educational_attainment: educationalAttainment || '',
      nationality: nationality || 'Filipino',
      voter_status: voterStatus || 'No',
      pwd_status: pwdStatus || 'No',
      senior_citizen_status: age >= 60 ? 'Yes' : (seniorCitizenStatus || 'No'),
      solo_parent_status: soloParentStatus || 'No',
      photo_url: documentUrl,
      status: 'Pending'
    }]).select().single();

    if (resError) throw resError;

    if (documentUrl) {
      await supabase.from('resident_documents').insert([{
        resident_id: newResident.id,
        document_name: 'Registration Identification Document',
        document_type: 'Identification ID',
        file_url: documentUrl
      }]);
    }

    await logActivity(newUser.id, `${firstName} ${lastName}`, 'Resident Registration', 'Submitted online registration application. Pending review.', req);

    return res.json({
      success: true,
      message: 'Registration submitted successfully! Your account is pending staff review and approval.'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. DASHBOARD STATS API (STAFF/ADMIN)
app.get('/api/staff/dashboard-stats', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
  try {
    const [
      residentsRes, pendingRegsRes, householdsRes, maleRes, femaleRes,
      seniorsRes, pwdsRes, soloParentsRes, votersRes, pendingCertsRes,
      pendingApptsRes, pendingComplaintsRes, recentActivitiesRes
    ] = await Promise.all([
      supabase.from('residents').select('id', { count: 'exact' }).eq('status', 'Approved'),
      supabase.from('residents').select('id', { count: 'exact' }).eq('status', 'Pending'),
      supabase.from('households').select('id', { count: 'exact' }),
      supabase.from('residents').select('id', { count: 'exact' }).eq('status', 'Approved').eq('gender', 'Male'),
      supabase.from('residents').select('id', { count: 'exact' }).eq('status', 'Approved').eq('gender', 'Female'),
      supabase.from('residents').select('id', { count: 'exact' }).eq('status', 'Approved').eq('senior_citizen_status', 'Yes'),
      supabase.from('residents').select('id', { count: 'exact' }).eq('status', 'Approved').eq('pwd_status', 'Yes'),
      supabase.from('residents').select('id', { count: 'exact' }).eq('status', 'Approved').eq('solo_parent_status', 'Yes'),
      supabase.from('residents').select('id', { count: 'exact' }).eq('status', 'Approved').eq('voter_status', 'Yes'),
      supabase.from('certificate_requests').select('id', { count: 'exact' }).eq('status', 'Pending'),
      supabase.from('appointments').select('id', { count: 'exact' }).eq('status', 'Pending'),
      supabase.from('complaints').select('id', { count: 'exact' }).eq('status', 'Pending'),
      supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(8)
    ]);

    return res.json({
      totalResidents: residentsRes.count || 0,
      pendingRegistrations: pendingRegsRes.count || 0,
      totalHouseholds: householdsRes.count || 0,
      maleResidents: maleRes.count || 0,
      femaleResidents: femaleRes.count || 0,
      seniorCitizens: seniorsRes.count || 0,
      pwds: pwdsRes.count || 0,
      soloParents: soloParentsRes.count || 0,
      voters: votersRes.count || 0,
      pendingCertificates: pendingCertsRes.count || 0,
      pendingAppointments: pendingApptsRes.count || 0,
      pendingComplaints: pendingComplaintsRes.count || 0,
      recentActivities: recentActivitiesRes.data || []
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 6. APPROVE / REJECT RESIDENT REGISTRATION
app.post('/api/staff/residents/:id/review', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
  try {
    const residentId = req.params.id;
    const { action, rejectionReason } = req.body; // action: 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action parameter.' });
    }

    const { data: resident, error: fetchErr } = await supabase.from('residents').select('*, users(id)').eq('id', residentId).single();
    if (fetchErr || !resident) {
      return res.status(404).json({ error: 'Resident record not found.' });
    }

    if (action === 'approve') {
      // Generate Unique Resident ID Format: BRGY-2026-XXXXXX
      const currentYear = new Date().getFullYear();
      const { count } = await supabase.from('residents').select('id', { count: 'exact' });
      const sequentialNum = String((count || 0) + 1).padStart(6, '0');
      const generatedResidentId = `BRGY-${currentYear}-${sequentialNum}`;

      const { error: updateErr } = await supabase.from('residents').update({
        status: 'Approved',
        resident_id_number: generatedResidentId,
        updated_at: new Date().toISOString()
      }).eq('id', residentId);

      if (updateErr) throw updateErr;

      // Notify Resident User
      if (resident.user_id) {
        await createNotification(
          resident.user_id,
          'Registration Approved!',
          `Welcome to the Barangay Portal! Your official Resident ID is ${generatedResidentId}. You can now access your digital ID and request certificates online.`,
          'System',
          '/portal'
        );
      }

      await logActivity(req.user.id, req.user.fullName, 'Approve Resident', `Approved resident registration for ${resident.first_name} ${resident.last_name} (${generatedResidentId}).`, req);

      return res.json({ success: true, message: `Resident approved. Assigned Resident ID: ${generatedResidentId}` });
    } else {
      // Reject
      if (!rejectionReason) {
        return res.status(400).json({ error: 'A valid reason is required when rejecting a registration.' });
      }

      const { error: rejectErr } = await supabase.from('residents').update({
        status: 'Rejected',
        rejection_reason: rejectionReason,
        updated_at: new Date().toISOString()
      }).eq('id', residentId);

      if (rejectErr) throw rejectErr;

      if (resident.user_id) {
        await createNotification(
          resident.user_id,
          'Registration Application Update',
          `Your registration application was not approved. Reason: ${rejectionReason}`,
          'System',
          '#'
        );
      }

      await logActivity(req.user.id, req.user.fullName, 'Reject Resident', `Rejected registration for ${resident.first_name} ${resident.last_name}. Reason: ${rejectionReason}`, req);

      return res.json({ success: true, message: 'Resident registration application rejected.' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 7. RESIDENT CRUD OPERATIONS
app.get('/api/residents', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
  try {
    const { search, status, purokId, gender } = req.query;
    let query = supabase.from('residents').select('*, puroks(name), households(household_number)');

    if (status && status !== 'All') {
      query = query.eq('status', status);
    } else {
      query = query.neq('status', 'Archived');
    }

    if (purokId && purokId !== 'All') {
      query = query.eq('purok_id', purokId);
    }

    if (gender && gender !== 'All') {
      query = query.eq('gender', gender);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    let filtered = data || [];
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(r => 
        r.first_name.toLowerCase().includes(q) ||
        r.last_name.toLowerCase().includes(q) ||
        (r.resident_id_number && r.resident_id_number.toLowerCase().includes(q)) ||
        (r.contact_number && r.contact_number.includes(q))
      );
    }

    return res.json(filtered);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET SINGLE RESIDENT DETAILS
app.get('/api/residents/:id', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('residents')
      .select('*, puroks(name), households(household_number), resident_documents(*)')
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Resident not found.' });

    // Restrict residents to viewing only their own record
    if (req.user.role === 'Resident' && req.user.residentId !== data.id) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// UPDATE RESIDENT STATUS (Archive, Inactive, Moved Out, Deceased, Active)
app.patch('/api/residents/:id/status', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['Active', 'Approved', 'Inactive', 'Archived', 'Deceased', 'Moved Out'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status specified.' });
    }

    const { error } = await supabase.from('residents').update({ status, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;

    await logActivity(req.user.id, req.user.fullName, 'Update Resident Status', `Changed status of resident ID ${req.params.id} to ${status}`, req);
    return res.json({ success: true, message: `Resident status updated to ${status}.` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE RESIDENT PERMANENTLY
app.delete('/api/residents/:id', authenticateToken, requireRole(['Admin']), async (req, res) => {
  try {
    const { error } = await supabase.from('residents').delete().eq('id', req.params.id);
    if (error) throw error;

    await logActivity(req.user.id, req.user.fullName, 'Delete Resident', `Permanently deleted resident record ID ${req.params.id}`, req);
    return res.json({ success: true, message: 'Resident record deleted permanently.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 8. HOUSEHOLD MANAGEMENT API
app.get('/api/households', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('households').select('*, puroks(name), residents!head_resident_id(first_name, last_name)').order('created_at', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/households', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
  try {
    const { householdNumber, purokId, address, headResidentId } = req.body;
    if (!householdNumber || !address) {
      return res.status(400).json({ error: 'Household number and address are required.' });
    }

    const { data, error } = await supabase.from('households').insert([{
      household_number: householdNumber,
      purok_id: purokId || null,
      address: address,
      head_resident_id: headResidentId || null
    }]).select().single();

    if (error) throw error;

    if (headResidentId) {
      await supabase.from('residents').update({ household_id: data.id, is_household_head: true }).eq('id', headResidentId);
    }

    await logActivity(req.user.id, req.user.fullName, 'Create Household', `Created household ${householdNumber}`, req);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 9. PUROK MANAGEMENT API
app.get('/api/puroks', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('puroks').select('*').order('name');
    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/puroks', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Purok name is required.' });

    const { data, error } = await supabase.from('puroks').insert([{ name, description }]).select().single();
    if (error) throw error;

    await logActivity(req.user.id, req.user.fullName, 'Create Purok', `Added new Purok: ${name}`, req);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 10. CERTIFICATE REQUESTS & STAFF FILE UPLOADS
app.get('/api/certificates', authenticateToken, async (req, res) => {
  try {
    let query = supabase.from('certificate_requests').select('*, residents(first_name, last_name, resident_id_number, contact_number)');

    // If Resident, show only their requests
    if (req.user.role === 'Resident') {
      if (!req.user.residentId) return res.json([]);
      query = query.eq('resident_id', req.user.residentId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// SUBMIT CERTIFICATE REQUEST (RESIDENT)
app.post('/api/certificates/request', authenticateToken, requireRole(['Resident']), async (req, res) => {
  try {
    const { certificateType, purpose } = req.body;
    if (!certificateType || !purpose) {
      return res.status(400).json({ error: 'Certificate type and purpose are required.' });
    }

    if (!req.user.residentId) {
      return res.status(400).json({ error: 'Your account is not linked to an approved resident profile.' });
    }

    const { data, error } = await supabase.from('certificate_requests').insert([{
      resident_id: req.user.residentId,
      certificate_type: certificateType,
      purpose: purpose,
      status: 'Pending'
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.fullName, 'Certificate Request', `Submitted request for ${certificateType}`, req);
    return res.json({ success: true, message: 'Certificate request submitted successfully.', data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// UPDATE / UPLOAD CERTIFICATE (STAFF/ADMIN)
app.post('/api/certificates/:id/process', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
  try {
    const { status, remarks } = req.body;
    const reqId = req.params.id;

    const { data: certReq, error: fetchErr } = await supabase.from('certificate_requests').select('*, residents(user_id, first_name, last_name)').eq('id', reqId).single();
    if (fetchErr || !certReq) return res.status(404).json({ error: 'Certificate request not found.' });

    let documentUrl = certReq.document_url;

    // Handle Certificate File Upload by Staff
    if (req.files && req.files.certificateFile) {
      const file = req.files.certificateFile;
      const fileName = `certificates/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from('barangay-files').upload(fileName, file.data, {
        contentType: file.mimetype
      });
      if (!uploadError && uploadData) {
        const { data: publicUrlData } = supabase.storage.from('barangay-files').getPublicUrl(fileName);
        documentUrl = publicUrlData.publicUrl;
      }
    }

    const updatePayload = {
      status: status,
      remarks: remarks || certReq.remarks,
      document_url: documentUrl,
      processed_by: req.user.id
    };

    if (status === 'Approved') updatePayload.approved_at = new Date().toISOString();
    if (status === 'Released') updatePayload.released_at = new Date().toISOString();

    const { error: updateErr } = await supabase.from('certificate_requests').update(updatePayload).eq('id', reqId);
    if (updateErr) throw updateErr;

    // Notify Resident
    if (certReq.residents && certReq.residents.user_id) {
      let notifTitle = `Certificate Status: ${status}`;
      let notifMsg = `Your request for ${certReq.certificate_type} is now marked as ${status}.`;
      if (status === 'Ready for Release' || status === 'Released') {
        notifMsg += ' You can view or download your document in your portal.';
      }
      await createNotification(certReq.residents.user_id, notifTitle, notifMsg, 'Certificate', '/portal');
    }

    await logActivity(req.user.id, req.user.fullName, 'Process Certificate', `Updated certificate request ${reqId} to ${status}`, req);
    return res.json({ success: true, message: `Certificate request updated to ${status}.` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 11. APPOINTMENT SYSTEM API
app.get('/api/appointments', authenticateToken, async (req, res) => {
  try {
    let query = supabase.from('appointments').select('*, residents(first_name, last_name, contact_number)');
    if (req.user.role === 'Resident') {
      if (!req.user.residentId) return res.json([]);
      query = query.eq('resident_id', req.user.residentId);
    }
    const { data, error } = await query.order('appointment_date', { ascending: true });
    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/appointments', authenticateToken, async (req, res) => {
  try {
    const { serviceType, appointmentDate, appointmentTime, purpose } = req.body;
    if (!serviceType || !appointmentDate || !appointmentTime || !purpose) {
      return res.status(400).json({ error: 'All appointment details are required.' });
    }

    if (req.user.role === 'Resident' && !req.user.residentId) {
      return res.status(400).json({ error: 'Your user profile is not linked to an approved resident.' });
    }

    const resId = req.user.role === 'Resident' ? req.user.residentId : req.body.residentId;

    const { data, error } = await supabase.from('appointments').insert([{
      resident_id: resId,
      service_type: serviceType,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      purpose: purpose,
      status: 'Pending'
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.fullName, 'Schedule Appointment', `Appointment scheduled for ${appointmentDate}`, req);
    return res.json({ success: true, message: 'Appointment booked successfully.', data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.patch('/api/appointments/:id/status', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
  try {
    const { status, remarks } = req.body;
    const { data: appt } = await supabase.from('appointments').select('*, residents(user_id)').eq('id', req.params.id).single();

    const { error } = await supabase.from('appointments').update({
      status: status,
      remarks: remarks || '',
      processed_by: req.user.id
    }).eq('id', req.params.id);

    if (error) throw error;

    if (appt && appt.residents && appt.residents.user_id) {
      await createNotification(appt.residents.user_id, `Appointment ${status}`, `Your appointment for ${appt.service_type} on ${appt.appointment_date} has been updated to ${status}.`, 'Appointment', '/portal');
    }

    await logActivity(req.user.id, req.user.fullName, 'Update Appointment', `Appointment ID ${req.params.id} updated to ${status}`, req);
    return res.json({ success: true, message: `Appointment status updated to ${status}.` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 12. BLOTTER MANAGEMENT API
app.get('/api/blotters', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
  try {
    const { data, error } = await supabase.from('blotter_records').select('*').order('incident_date', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/blotters', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
  try {
    const {
      complainantName, complainantContact, respondentName, witnesses,
      incidentDate, incidentTime, incidentLocation, incidentType, description, actionTaken
    } = req.body;

    if (!complainantName || !respondentName || !incidentDate || !incidentTime || !incidentLocation || !description) {
      return res.status(400).json({ error: 'Complainant, Respondent, Date, Time, Location, and Description are required.' });
    }

    const currentYear = new Date().getFullYear();
    const { count } = await supabase.from('blotter_records').select('id', { count: 'exact' });
    const caseNum = `BLOTTER-${currentYear}-${String((count || 0) + 1).padStart(5, '0')}`;

    const { data, error } = await supabase.from('blotter_records').insert([{
      case_number: caseNum,
      complainant_name: complainantName,
      complainant_contact: complainantContact || '',
      respondent_name: respondentName,
      witnesses: witnesses || '',
      incident_date: incidentDate,
      incident_time: incidentTime,
      incident_location: incidentLocation,
      incident_type: incidentType || 'General Complaint',
      description: description,
      action_taken: actionTaken || '',
      status: 'Open',
      recorded_by: req.user.id
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.fullName, 'Create Blotter Case', `Opened blotter case ${caseNum}`, req);
    return res.json({ success: true, message: `Blotter case recorded. Case Number: ${caseNum}`, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.patch('/api/blotters/:id', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
  try {
    const { status, actionTaken, settlementDetails, remarks } = req.body;
    const { error } = await supabase.from('blotter_records').update({
      status, action_taken: actionTaken, settlement_details: settlementDetails, remarks, updated_at: new Date().toISOString()
    }).eq('id', req.params.id);

    if (error) throw error;

    await logActivity(req.user.id, req.user.fullName, 'Update Blotter Case', `Updated blotter case ID ${req.params.id}`, req);
    return res.json({ success: true, message: 'Blotter case updated successfully.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 13. COMPLAINTS & COMMUNITY REPORTS API
app.get('/api/complaints', authenticateToken, async (req, res) => {
  try {
    let query = supabase.from('complaints').select('*');
    if (req.user.role === 'Resident') {
      if (!req.user.residentId) return res.json([]);
      query = query.eq('resident_id', req.user.residentId);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/complaints', authenticateToken, async (req, res) => {
  try {
    const { title, category, description, location } = req.body;
    if (!title || !category || !description) {
      return res.status(400).json({ error: 'Title, category, and description are required.' });
    }

    const { data, error } = await supabase.from('complaints').insert([{
      resident_id: req.user.role === 'Resident' ? req.user.residentId : null,
      complainant_name: req.user.fullName,
      title, category, description, location: location || '', status: 'Pending'
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.fullName, 'File Complaint', `Filed community report: ${title}`, req);
    return res.json({ success: true, message: 'Report submitted successfully.', data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 14. ASSISTANCE REQUESTS API
app.get('/api/assistance', authenticateToken, async (req, res) => {
  try {
    let query = supabase.from('assistance_requests').select('*, residents(first_name, last_name, contact_number, resident_id_number)');
    if (req.user.role === 'Resident') {
      if (!req.user.residentId) return res.json([]);
      query = query.eq('resident_id', req.user.residentId);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/assistance', authenticateToken, async (req, res) => {
  try {
    const { assistanceType, reason, amountRequested } = req.body;
    if (!assistanceType || !reason) {
      return res.status(400).json({ error: 'Assistance type and reason are required.' });
    }

    if (req.user.role === 'Resident' && !req.user.residentId) {
      return res.status(400).json({ error: 'Account not linked to an approved resident.' });
    }

    const { data, error } = await supabase.from('assistance_requests').insert([{
      resident_id: req.user.role === 'Resident' ? req.user.residentId : req.body.residentId,
      assistance_type: assistanceType,
      reason: reason,
      amount_requested: parseFloat(amountRequested || 0),
      status: 'Pending'
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.fullName, 'Request Assistance', `Requested ${assistanceType} assistance`, req);
    return res.json({ success: true, message: 'Assistance request submitted.', data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 15. BUSINESS MANAGEMENT API
app.get('/api/businesses', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('businesses').select('*, puroks(name)').order('business_name');
    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/businesses', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
  try {
    const { businessName, ownerName, businessType, address, purokId, contactNumber, email, registrationNumber, permitNumber } = req.body;
    if (!businessName || !ownerName || !businessType || !address) {
      return res.status(400).json({ error: 'Business Name, Owner, Type, and Address are required.' });
    }

    const { data, error } = await supabase.from('businesses').insert([{
      business_name: businessName,
      owner_name: ownerName,
      business_type: businessType,
      address: address,
      purok_id: purokId || null,
      contact_number: contactNumber || '',
      email: email || '',
      registration_number: registrationNumber || `REG-${Date.now()}`,
      permit_number: permitNumber || `PERMIT-${Date.now()}`,
      permit_status: 'Active',
      date_issued: new Date().toISOString().split('T')[0]
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.fullName, 'Register Business', `Registered business: ${businessName}`, req);
    return res.json({ success: true, message: 'Business registered successfully.', data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 16. ANNOUNCEMENTS API
app.get('/api/announcements', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('announcements').select('*').eq('status', 'Published').order('created_at', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/announcements', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
  try {
    const { title, content, priority } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required.' });
    }

    const { data, error } = await supabase.from('announcements').insert([{
      title, content, priority: priority || 'Normal', status: 'Published', author_id: req.user.id
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.fullName, 'Publish Announcement', `Published announcement: ${title}`, req);
    return res.json({ success: true, message: 'Announcement published.', data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 17. NOTIFICATIONS API
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.patch('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 18. BARANGAY SETTINGS UPDATE API
app.post('/api/admin/settings', authenticateToken, requireRole(['Admin']), async (req, res) => {
  try {
    const { barangayName, barangayAddress, contactNumber, email, website } = req.body;
    let logoUrl = req.body.existingLogoUrl || '';

    if (req.files && req.files.barangayLogo) {
      const file = req.files.barangayLogo;
      const fileName = `branding/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from('barangay-files').upload(fileName, file.data, {
        contentType: file.mimetype
      });
      if (!uploadError && uploadData) {
        const { data: publicUrlData } = supabase.storage.from('barangay-files').getPublicUrl(fileName);
        logoUrl = publicUrlData.publicUrl;
      }
    }

    const { data: currentSettings } = await supabase.from('barangay_settings').select('id').limit(1).single();

    if (currentSettings) {
      await supabase.from('barangay_settings').update({
        barangay_name: barangayName,
        barangay_address: barangayAddress,
        contact_number: contactNumber,
        email: email,
        website: website,
        barangay_logo: logoUrl || currentSettings.barangay_logo,
        updated_at: new Date().toISOString()
      }).eq('id', currentSettings.id);
    } else {
      await supabase.from('barangay_settings').insert([{
        barangay_name: barangayName,
        barangay_address: barangayAddress,
        contact_number: contactNumber,
        email: email,
        website: website,
        barangay_logo: logoUrl
      }]);
    }

    await logActivity(req.user.id, req.user.fullName, 'Update Barangay Settings', 'Updated Barangay contact and logo configurations', req);
    return res.json({ success: true, message: 'Barangay settings saved successfully.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 19. STAFF / USER ACCOUNT MANAGEMENT API
app.get('/api/admin/users', authenticateToken, requireRole(['Admin']), async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('id, full_name, username, role, is_active, created_at').order('full_name');
    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users', authenticateToken, requireRole(['Admin']), async (req, res) => {
  try {
    const { fullName, username, password, role } = req.body;
    if (!fullName || !username || !password || !role) {
      return res.status(400).json({ error: 'All user details are required.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const { data, error } = await supabase.from('users').insert([{
      full_name: fullName,
      username: username,
      password_hash: passwordHash,
      role: role,
      is_active: true
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.fullName, 'Create Staff User', `Created staff account for ${fullName} (${role})`, req);
    return res.json({ success: true, message: 'User account created successfully.', data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 20. ACTIVITY LOGS API
app.get('/api/admin/logs', authenticateToken, requireRole(['Admin']), async (req, res) => {
  try {
    const { data, error } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// DYNAMIC HTML LAYOUT RENDER ENGINE
// ============================================================================

function getBaseHead(title, barangay) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} | ${barangay.barangay_name}</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
      <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css" rel="stylesheet">
      <style>
        :root {
          --primary-color: #1b4332;
          --primary-hover: #2d6a4f;
          --secondary-color: #52b788;
          --accent-color: #d8f3dc;
          --dark-bg: #081c15;
          --light-bg: #f8f9fa;
        }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f4f6f9;
          color: #333;
        }
        .bg-barangay-primary { background-color: var(--primary-color) !important; color: white; }
        .text-barangay-primary { color: var(--primary-color) !important; }
        .btn-barangay { background-color: var(--primary-color); color: white; border: none; }
        .btn-barangay:hover { background-color: var(--primary-hover); color: white; }
        .sidebar {
          width: 260px;
          min-height: 100vh;
          background-color: var(--dark-bg);
          color: white;
          position: fixed;
          top: 0;
          bottom: 0;
          left: 0;
          z-index: 100;
          transition: all 0.3s;
        }
        .sidebar .nav-link {
          color: #b7e4c7;
          padding: 12px 20px;
          border-radius: 6px;
          margin: 2px 10px;
          font-weight: 500;
        }
        .sidebar .nav-link:hover, .sidebar .nav-link.active {
          background-color: var(--primary-hover);
          color: white;
        }
        .main-content {
          margin-left: 260px;
          padding: 25px;
        }
        .card-stat {
          border: none;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          transition: transform 0.2s;
        }
        .card-stat:hover { transform: translateY(-3px); }
        .stat-icon {
          width: 50px;
          height: 50px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
        }
        .brand-logo {
          width: 45px;
          height: 45px;
          object-fit: contain;
          border-radius: 50%;
          background: #fff;
          padding: 2px;
        }
        /* PHYSICAL BOND PAPER PRINTING SPECIFICATIONS (8 IDs / PAGE) */
        @media print {
          body * { visibility: hidden; }
          #printableIdArea, #printableIdArea * { visibility: visible; }
          #printableIdArea {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .page-break { page-break-after: always; }
          .no-print { display: none !important; }
        }
        .id-card-grid {
          display: grid;
          grid-template-columns: repeat(2, 3.375in);
          grid-gap: 0.2in;
          justify-content: center;
          padding: 0.2in;
        }
        .physical-id-card {
          width: 3.375in;
          height: 2.125in;
          border: 1px solid #111;
          border-radius: 8px;
          padding: 8px;
          background: #fff;
          box-sizing: border-box;
          position: relative;
          font-size: 8pt;
          overflow: hidden;
        }
      </style>
    </head>
  `;
}

// 1. SYSTEM INITIAL SETUP PAGE
app.get('/setup', async (req, res) => {
  const adminExists = await checkAdminExists();
  if (adminExists) {
    return res.redirect('/login');
  }

  const html = `
    ${getBaseHead('Initial Administrator Setup', { barangay_name: 'Barangay Management System' })}
    <body class="bg-light d-flex align-items-center min-vh-100 py-5">
      <div class="container">
        <div class="row justify-content-center">
          <div class="col-md-7 col-lg-6">
            <div class="card border-0 shadow-lg rounded-4">
              <div class="card-body p-4 p-md-5">
                <div class="text-center mb-4">
                  <div class="bg-barangay-primary text-white rounded-circle d-inline-flex align-items-center justify-content-center mb-2" style="width:70px; height:70px;">
                    <i class="fa-solid fa-shield-halved fa-2x"></i>
                  </div>
                  <h3 class="fw-bold text-barangay-primary">System Initialization</h3>
                  <p class="text-muted small">Setup your Barangay Administrator Account & Profile</p>
                </div>

                <form id="setupForm" onsubmit="handleSetup(event)">
                  <h6 class="fw-bold mb-3 border-bottom pb-2 text-secondary"><i class="fa-solid fa-user-gear me-2"></i>Administrator Account</h6>
                  <div class="mb-3">
                    <label class="form-label small fw-semibold">Administrator Full Name *</label>
                    <input type="text" id="fullName" class="form-control" placeholder="e.g. Juan Dela Cruz" required>
                  </div>
                  <div class="mb-3">
                    <label class="form-label small fw-semibold">Username / Email *</label>
                    <input type="text" id="username" class="form-control" placeholder="admin@barangay.gov.ph" required>
                  </div>
                  <div class="row">
                    <div class="col-md-6 mb-3">
                      <label class="form-label small fw-semibold">Password *</label>
                      <input type="password" id="password" class="form-control" required minlength="6">
                    </div>
                    <div class="col-md-6 mb-3">
                      <label class="form-label small fw-semibold">Confirm Password *</label>
                      <input type="password" id="confirmPassword" class="form-control" required minlength="6">
                    </div>
                  </div>

                  <h6 class="fw-bold mb-3 border-bottom pb-2 text-secondary mt-4"><i class="fa-solid fa-building-columns me-2"></i>Barangay Profile Settings</h6>
                  <div class="mb-3">
                    <label class="form-label small fw-semibold">Barangay Name *</label>
                    <input type="text" id="barangayName" class="form-control" value="Barangay Central" required>
                  </div>
                  <div class="mb-3">
                    <label class="form-label small fw-semibold">Barangay Hall Address *</label>
                    <input type="text" id="barangayAddress" class="form-control" value="Main Street, City Center" required>
                  </div>
                  <div class="row">
                    <div class="col-md-6 mb-3">
                      <label class="form-label small fw-semibold">Contact Number</label>
                      <input type="text" id="contactNumber" class="form-control" value="(02) 8123-4567">
                    </div>
                    <div class="col-md-6 mb-3">
                      <label class="form-label small fw-semibold">Official Email</label>
                      <input type="email" id="email" class="form-control" value="info@barangay.gov.ph">
                    </div>
                  </div>

                  <div id="alertArea"></div>

                  <button type="submit" id="submitBtn" class="btn btn-barangay w-100 py-2.5 fw-bold rounded-3 mt-3">
                    <i class="fa-solid fa-check-circle me-2"></i>Initialize System & Create Admin
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        async function handleSetup(e) {
          e.preventDefault();
          const submitBtn = document.getElementById('submitBtn');
          const alertArea = document.getElementById('alertArea');
          alertArea.innerHTML = '';

          const payload = {
            fullName: document.getElementById('fullName').value,
            username: document.getElementById('username').value,
            password: document.getElementById('password').value,
            confirmPassword: document.getElementById('confirmPassword').value,
            barangayName: document.getElementById('barangayName').value,
            barangayAddress: document.getElementById('barangayAddress').value,
            contactNumber: document.getElementById('contactNumber').value,
            email: document.getElementById('email').value
          };

          if (payload.password !== payload.confirmPassword) {
            alertArea.innerHTML = '<div class="alert alert-danger py-2 small">Passwords do not match.</div>';
            return;
          }

          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Setting up system...';

          try {
            const res = await fetch('/api/setup/admin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to initialize system.');

            alertArea.innerHTML = '<div class="alert alert-success py-2 small">' + data.message + ' Redirecting...</div>';
            setTimeout(() => { window.location.href = '/login'; }, 1500);
          } catch (err) {
            alertArea.innerHTML = '<div class="alert alert-danger py-2 small">' + err.message + '</div>';
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-check-circle me-2"></i>Initialize System & Create Admin';
          }
        }
      </script>
    </body>
    </html>
  `;
  res.send(html);
});

// 2. LOGIN PAGE ROUTE
app.get('/login', async (req, res) => {
  const adminExists = await checkAdminExists();
  if (!adminExists) {
    return res.redirect('/setup');
  }

  const barangay = await getBarangayBranding();

  const html = `
    ${getBaseHead('Account Authentication', barangay)}
    <body class="bg-light d-flex align-items-center min-vh-100">
      <div class="container">
        <div class="row justify-content-center">
          <div class="col-md-5 col-lg-4">
            <div class="card border-0 shadow-lg rounded-4">
              <div class="card-body p-4 p-md-5 text-center">
                ${barangay.barangay_logo ? `<img src="${barangay.barangay_logo}" class="brand-logo mb-3" style="width:80px;height:80px;">` : `<div class="bg-barangay-primary text-white rounded-circle d-inline-flex align-items-center justify-content-center mb-3" style="width:70px; height:70px;"><i class="fa-solid fa-building-columns fa-2x"></i></div>`}
                <h4 class="fw-bold text-barangay-primary mb-1">${barangay.barangay_name}</h4>
                <p class="text-muted small mb-4">Resident & Staff Portal Authentication</p>

                <form id="loginForm" onsubmit="handleLogin(event)">
                  <div class="form-floating mb-3 text-start">
                    <input type="text" id="username" class="form-control" placeholder="Username/Email" required>
                    <label>Username or Email</label>
                  </div>
                  <div class="form-floating mb-3 text-start">
                    <input type="password" id="password" class="form-control" placeholder="Password" required>
                    <label>Password</label>
                  </div>

                  <div id="alertArea"></div>

                  <button type="submit" id="loginBtn" class="btn btn-barangay w-100 py-2.5 fw-bold rounded-3 mb-3">
                    <i class="fa-solid fa-right-to-bracket me-2"></i>Log In
                  </button>
                </form>

                <div class="border-top pt-3 text-center">
                  <p class="text-muted small mb-1">New Resident in this Barangay?</p>
                  <a href="/register" class="text-decoration-none fw-bold text-barangay-primary small"><i class="fa-solid fa-user-plus me-1"></i>Register Resident Account</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        async function handleLogin(e) {
          e.preventDefault();
          const btn = document.getElementById('loginBtn');
          const alertArea = document.getElementById('alertArea');
          alertArea.innerHTML = '';

          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Authenticating...';

          try {
            const res = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: document.getElementById('username').value,
                password: document.getElementById('password').value
              })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Authentication failed.');

            window.location.href = data.redirect;
          } catch (err) {
            alertArea.innerHTML = '<div class="alert alert-danger py-2 small">' + err.message + '</div>';
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-right-to-bracket me-2"></i>Log In';
          }
        }
      </script>
    </body>
    </html>
  `;
  res.send(html);
});

// 3. PUBLIC RESIDENT REGISTRATION PAGE ROUTE
app.get('/register', async (req, res) => {
  const barangay = await getBarangayBranding();
  
  // Fetch Puroks
  let puroks = [];
  if (supabase) {
    const { data } = await supabase.from('puroks').select('*').order('name');
    puroks = data || [];
  }

  const purokOptions = puroks.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  const html = `
    ${getBaseHead('Resident Online Registration', barangay)}
    <body class="bg-light py-5">
      <div class="container">
        <div class="row justify-content-center">
          <div class="col-lg-9">
            <div class="card border-0 shadow-sm rounded-4">
              <div class="card-header bg-barangay-primary text-white p-4 rounded-top-4">
                <div class="d-flex align-items-center">
                  ${barangay.barangay_logo ? `<img src="${barangay.barangay_logo}" class="brand-logo me-3">` : `<i class="fa-solid fa-id-card fa-2x me-3"></i>`}
                  <div>
                    <h4 class="fw-bold mb-0">${barangay.barangay_name}</h4>
                    <p class="mb-0 small text-light-50">Official Resident Registration Form</p>
                  </div>
                </div>
              </div>
              <div class="card-body p-4 p-md-5">
                <form id="registerForm" onsubmit="handleRegistration(event)">
                  <h6 class="fw-bold text-barangay-primary mb-3 border-bottom pb-2"><i class="fa-solid fa-user me-2"></i>Personal Information</h6>
                  
                  <div class="row">
                    <div class="col-md-3 mb-3">
                      <label class="form-label small fw-semibold">First Name *</label>
                      <input type="text" id="firstName" class="form-control" required>
                    </div>
                    <div class="col-md-3 mb-3">
                      <label class="form-label small fw-semibold">Middle Name</label>
                      <input type="text" id="middleName" class="form-control">
                    </div>
                    <div class="col-md-4 mb-3">
                      <label class="form-label small fw-semibold">Last Name *</label>
                      <input type="text" id="lastName" class="form-control" required>
                    </div>
                    <div class="col-md-2 mb-3">
                      <label class="form-label small fw-semibold">Suffix</label>
                      <input type="text" id="suffix" class="form-control" placeholder="e.g. Jr.">
                    </div>
                  </div>

                  <div class="row">
                    <div class="col-md-4 mb-3">
                      <label class="form-label small fw-semibold">Date of Birth *</label>
                      <input type="date" id="dateOfBirth" class="form-control" required>
                    </div>
                    <div class="col-md-4 mb-3">
                      <label class="form-label small fw-semibold">Gender *</label>
                      <select id="gender" class="form-select" required>
                        <option value="">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                    <div class="col-md-4 mb-3">
                      <label class="form-label small fw-semibold">Civil Status *</label>
                      <select id="civilStatus" class="form-select" required>
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Widowed">Widowed</option>
                        <option value="Separated">Separated</option>
                      </select>
                    </div>
                  </div>

                  <h6 class="fw-bold text-barangay-primary mb-3 border-bottom pb-2 mt-4"><i class="fa-solid fa-location-dot me-2"></i>Address & Contact Details</h6>
                  <div class="row">
                    <div class="col-md-6 mb-3">
                      <label class="form-label small fw-semibold">House No. / Street Address *</label>
                      <input type="text" id="address" class="form-control" placeholder="123 Mabini St." required>
                    </div>
                    <div class="col-md-6 mb-3">
                      <label class="form-label small fw-semibold">Purok / Zone *</label>
                      <select id="purokId" class="form-select" required>
                        <option value="">Select Purok</option>
                        ${purokOptions}
                      </select>
                    </div>
                  </div>

                  <div class="row">
                    <div class="col-md-6 mb-3">
                      <label class="form-label small fw-semibold">Contact Number</label>
                      <input type="text" id="contactNumber" class="form-control" placeholder="09171234567">
                    </div>
                    <div class="col-md-6 mb-3">
                      <label class="form-label small fw-semibold">Email Address (Login Username) *</label>
                      <input type="email" id="email" class="form-control" required>
                    </div>
                  </div>

                  <h6 class="fw-bold text-barangay-primary mb-3 border-bottom pb-2 mt-4"><i class="fa-solid fa-id-card-clip me-2"></i>Socio-Demographic Details</h6>
                  <div class="row">
                    <div class="col-md-4 mb-3">
                      <label class="form-label small fw-semibold">Occupation</label>
                      <input type="text" id="occupation" class="form-control">
                    </div>
                    <div class="col-md-4 mb-3">
                      <label class="form-label small fw-semibold">Educational Attainment</label>
                      <select id="educationalAttainment" class="form-select">
                        <option value="Elementary">Elementary</option>
                        <option value="High School">High School</option>
                        <option value="College/University">College/University</option>
                        <option value="Postgraduate">Postgraduate</option>
                        <option value="Vocational">Vocational</option>
                      </select>
                    </div>
                    <div class="col-md-4 mb-3">
                      <label class="form-label small fw-semibold">Nationality</label>
                      <input type="text" id="nationality" class="form-control" value="Filipino">
                    </div>
                  </div>

                  <div class="row">
                    <div class="col-md-3 mb-3">
                      <label class="form-label small fw-semibold">Registered Voter?</label>
                      <select id="voterStatus" class="form-select">
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </div>
                    <div class="col-md-3 mb-3">
                      <label class="form-label small fw-semibold">PWD Status?</label>
                      <select id="pwdStatus" class="form-select">
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </div>
                    <div class="col-md-3 mb-3">
                      <label class="form-label small fw-semibold">Senior Citizen?</label>
                      <select id="seniorCitizenStatus" class="form-select">
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </div>
                    <div class="col-md-3 mb-3">
                      <label class="form-label small fw-semibold">Solo Parent?</label>
                      <select id="soloParentStatus" class="form-select">
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </div>
                  </div>

                  <h6 class="fw-bold text-barangay-primary mb-3 border-bottom pb-2 mt-4"><i class="fa-solid fa-lock me-2"></i>Account Password & Proof of Residency</h6>
                  <div class="row">
                    <div class="col-md-6 mb-3">
                      <label class="form-label small fw-semibold">Upload ID / Proof of Residency (PDF/Image)</label>
                      <input type="file" id="identificationDocument" class="form-control" accept="image/*,.pdf">
                    </div>
                    <div class="col-md-6 mb-3">
                      <label class="form-label small fw-semibold">Account Password *</label>
                      <input type="password" id="password" class="form-control" required minlength="6">
                    </div>
                  </div>

                  <div id="alertArea"></div>

                  <div class="d-flex justify-content-between align-items-center mt-4">
                    <a href="/login" class="btn btn-outline-secondary"><i class="fa-solid fa-arrow-left me-2"></i>Back to Login</a>
                    <button type="submit" id="regBtn" class="btn btn-barangay px-4 py-2.5 fw-bold rounded-3">
                      <i class="fa-solid fa-paper-plane me-2"></i>Submit Application
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        async function handleRegistration(e) {
          e.preventDefault();
          const btn = document.getElementById('regBtn');
          const alertArea = document.getElementById('alertArea');
          alertArea.innerHTML = '';

          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Submitting application...';

          const formData = new FormData();
          formData.append('firstName', document.getElementById('firstName').value);
          formData.append('middleName', document.getElementById('middleName').value);
          formData.append('lastName', document.getElementById('lastName').value);
          formData.append('suffix', document.getElementById('suffix').value);
          formData.append('dateOfBirth', document.getElementById('dateOfBirth').value);
          formData.append('gender', document.getElementById('gender').value);
          formData.append('civilStatus', document.getElementById('civilStatus').value);
          formData.append('address', document.getElementById('address').value);
          formData.append('purokId', document.getElementById('purokId').value);
          formData.append('contactNumber', document.getElementById('contactNumber').value);
          formData.append('email', document.getElementById('email').value);
          formData.append('occupation', document.getElementById('occupation').value);
          formData.append('educationalAttainment', document.getElementById('educationalAttainment').value);
          formData.append('nationality', document.getElementById('nationality').value);
          formData.append('voterStatus', document.getElementById('voterStatus').value);
          formData.append('pwdStatus', document.getElementById('pwdStatus').value);
          formData.append('seniorCitizenStatus', document.getElementById('seniorCitizenStatus').value);
          formData.append('soloParentStatus', document.getElementById('soloParentStatus').value);
          formData.append('password', document.getElementById('password').value);

          const fileInput = document.getElementById('identificationDocument');
          if (fileInput.files.length > 0) {
            formData.append('identificationDocument', fileInput.files[0]);
          }

          try {
            const res = await fetch('/api/public/register', {
              method: 'POST',
              body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Registration failed.');

            alertArea.innerHTML = '<div class="alert alert-success py-3"><i class="fa-solid fa-circle-check me-2"></i>' + data.message + '</div>';
            document.getElementById('registerForm').reset();
          } catch (err) {
            alertArea.innerHTML = '<div class="alert alert-danger py-2 small">' + err.message + '</div>';
          } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane me-2"></i>Submit Application';
          }
        }
      </script>
    </body>
    </html>
  `;
  res.send(html);
});

// 4. PUBLIC QR RESIDENT ID VERIFICATION ROUTE
app.get('/verify/:residentIdNumber', async (req, res) => {
  const barangay = await getBarangayBranding();
  const idNum = req.params.residentIdNumber;

  let resident = null;
  if (supabase) {
    const { data } = await supabase.from('residents').select('*, puroks(name)').eq('resident_id_number', idNum).single();
    resident = data;
  }

  const isValid = resident && resident.status === 'Approved';

  const html = `
    ${getBaseHead('Digital Resident ID Verification', barangay)}
    <body class="bg-light d-flex align-items-center min-vh-100 py-5">
      <div class="container">
        <div class="row justify-content-center">
          <div class="col-md-6 col-lg-5">
            <div class="card border-0 shadow-lg rounded-4 overflow-hidden text-center">
              <div class="p-4 ${isValid ? 'bg-success' : 'bg-danger'} text-white">
                <i class="fa-solid ${isValid ? 'fa-circle-check' : 'fa-triangle-exclamation'} fa-4x mb-2"></i>
                <h4 class="fw-bold mb-0">${isValid ? 'VERIFIED RESIDENT' : 'INVALID OR UNVERIFIED ID'}</h4>
                <p class="small mb-0 opacity-75">${barangay.barangay_name} Official Verification System</p>
              </div>
              <div class="card-body p-4">
                ${isValid ? `
                  <h5 class="fw-bold text-dark mb-1">${resident.first_name}${resident.middle_name || ''} ${resident.last_name}${resident.suffix || ''}</h5>
                  <p class="badge bg-primary fs-6 px-3 py-2 mb-3">${resident.resident_id_number}</p>
                  
                  <div class="table-responsive text-start">
                    <table class="table table-sm table-borderless">
                      <tr><td class="text-muted">Barangay:</td><td class="fw-bold">${barangay.barangay_name}</td></tr>
                      <tr><td class="text-muted">Purok:</td><td class="fw-bold">${resident.puroks ? resident.puroks.name : 'N/A'}</td></tr>
                      <tr><td class="text-muted">Status:</td><td><span class="badge bg-success">Active Resident</span></td></tr>
                      <tr><td class="text-muted">Gender:</td><td class="fw-bold">${resident.gender}</td></tr>
                    </table>
                  </div>
                ` : `
                  <p class="text-muted">The requested Resident ID <strong>"${idNum}"</strong> could not be verified in the official barangay directory database.</p>
                `}
                <div class="border-top pt-3 mt-3">
                  <small class="text-muted"><i class="fa-solid fa-lock me-1"></i>Official Verification System | ${barangay.barangay_name}</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

// 5. STAFF PORTAL MAIN DASHBOARD ROUTE
app.get('/dashboard', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
  const barangay = await getBarangayBranding();

  const html = `
    ${getBaseHead('Staff Dashboard', barangay)}
    <body>
      <!-- SIDEBAR -->
      <div class="sidebar d-flex flex-column justify-content-between p-3">
        <div>
          <div class="d-flex align-items-center mb-4 px-2">
            ${barangay.barangay_logo ? `<img src="${barangay.barangay_logo}" class="brand-logo me-2">` : `<i class="fa-solid fa-building-columns fa-2x text-success me-2"></i>`}
            <div>
              <h6 class="fw-bold mb-0 text-white">${barangay.barangay_name}</h6>
              <small class="text-success">${req.user.role} Portal</small>
            </div>
          </div>
          <hr class="text-secondary">
          <ul class="nav nav-pills flex-column mb-auto">
            <li class="nav-item"><a href="/dashboard" class="nav-link active"><i class="fa-solid fa-chart-line me-2"></i>Dashboard</a></li>
            <li><a href="/staff/pending-residents" class="nav-link"><i class="fa-solid fa-user-clock me-2"></i>Pending Approvals</a></li>
            <li><a href="/staff/residents" class="nav-link"><i class="fa-solid fa-users me-2"></i>Resident Directory</a></li>
            <li><a href="/staff/households" class="nav-link"><i class="fa-solid fa-house-user me-2"></i>Households</a></li>
            <li><a href="/staff/puroks" class="nav-link"><i class="fa-solid fa-map-location-dot me-2"></i>Purok Directory</a></li>
            <li><a href="/staff/certificates" class="nav-link"><i class="fa-solid fa-file-contract me-2"></i>Certificates</a></li>
            <li><a href="/staff/appointments" class="nav-link"><i class="fa-solid fa-calendar-check me-2"></i>Appointments</a></li>
            <li><a href="/staff/blotters" class="nav-link"><i class="fa-solid fa-gavel me-2"></i>Blotter Records</a></li>
            <li><a href="/staff/complaints" class="nav-link"><i class="fa-solid fa-triangle-exclamation me-2"></i>Complaints</a></li>
            <li><a href="/staff/assistance" class="nav-link"><i class="fa-solid fa-hand-holding-hand me-2"></i>Assistance</a></li>
            <li><a href="/staff/businesses" class="nav-link"><i class="fa-solid fa-store me-2"></i>Businesses</a></li>
            <li><a href="/staff/announcements" class="nav-link"><i class="fa-solid fa-bullhorn me-2"></i>Announcements</a></li>
            <li><a href="/staff/reports" class="nav-link"><i class="fa-solid fa-chart-pie me-2"></i>Reports</a></li>
            ${req.user.role === 'Admin' ? `
              <li><a href="/admin/settings" class="nav-link"><i class="fa-solid fa-gears me-2"></i>Barangay Settings</a></li>
              <li><a href="/admin/users" class="nav-link"><i class="fa-solid fa-user-shield me-2"></i>Staff Users</a></li>
              <li><a href="/admin/logs" class="nav-link"><i class="fa-solid fa-list-check me-2"></i>Activity Logs</a></li>
            ` : ''}
          </ul>
        </div>
        <div>
          <hr class="text-secondary">
          <div class="d-flex align-items-center justify-content-between px-2">
            <div class="small">
              <div class="fw-bold">${req.user.fullName}</div>
              <small class="text-muted">${req.user.role}</small>
            </div>
            <button onclick="handleLogout()" class="btn btn-outline-danger btn-sm" title="Logout"><i class="fa-solid fa-right-from-bracket"></i></button>
          </div>
        </div>
      </div>

      <!-- MAIN CONTENT -->
      <div class="main-content">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h3 class="fw-bold text-barangay-primary mb-1">Barangay Operations Dashboard</h3>
            <p class="text-muted small mb-0">Real-time stats from Supabase persistent cloud database</p>
          </div>
          <div>
            <a href="/staff/id-printing" class="btn btn-barangay shadow-sm fw-semibold"><i class="fa-solid fa-print me-2"></i>Batch ID Print (8 per page)</a>
          </div>
        </div>

        <!-- STATS CARDS ROW 1 -->
        <div class="row g-3 mb-4">
          <div class="col-md-3">
            <div class="card card-stat p-3 bg-white">
              <div class="d-flex align-items-center justify-content-between">
                <div>
                  <small class="text-muted fw-bold">TOTAL APPROVED RESIDENTS</small>
                  <h2 class="fw-bold mb-0 text-dark" id="statResidents">-</h2>
                </div>
                <div class="stat-icon bg-primary text-white"><i class="fa-solid fa-users"></i></div>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card card-stat p-3 bg-white">
              <div class="d-flex align-items-center justify-content-between">
                <div>
                  <small class="text-muted fw-bold">PENDING REGISTRATIONS</small>
                  <h2 class="fw-bold mb-0 text-warning" id="statPendingRegs">-</h2>
                </div>
                <div class="stat-icon bg-warning text-white"><i class="fa-solid fa-user-clock"></i></div>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card card-stat p-3 bg-white">
              <div class="d-flex align-items-center justify-content-between">
                <div>
                  <small class="text-muted fw-bold">REGISTERED HOUSEHOLDS</small>
                  <h2 class="fw-bold mb-0 text-success" id="statHouseholds">-</h2>
                </div>
                <div class="stat-icon bg-success text-white"><i class="fa-solid fa-house-user"></i></div>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card card-stat p-3 bg-white">
              <div class="d-flex align-items-center justify-content-between">
                <div>
                  <small class="text-muted fw-bold">PENDING CERTS</small>
                  <h2 class="fw-bold mb-0 text-info" id="statPendingCerts">-</h2>
                </div>
                <div class="stat-icon bg-info text-white"><i class="fa-solid fa-file-invoice"></i></div>
              </div>
            </div>
          </div>
        </div>

        <!-- STATS CARDS ROW 2 -->
        <div class="row g-3 mb-4">
          <div class="col-md-3">
            <div class="card card-stat p-3 bg-white">
              <div class="d-flex align-items-center">
                <i class="fa-solid fa-person fa-2x text-primary me-3"></i>
                <div>
                  <small class="text-muted fw-bold">MALE RESIDENTS</small>
                  <h4 class="fw-bold mb-0" id="statMale">-</h4>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card card-stat p-3 bg-white">
              <div class="d-flex align-items-center">
                <i class="fa-solid fa-person-dress fa-2x text-danger me-3"></i>
                <div>
                  <small class="text-muted fw-bold">FEMALE RESIDENTS</small>
                  <h4 class="fw-bold mb-0" id="statFemale">-</h4>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card card-stat p-3 bg-white">
              <div class="d-flex align-items-center">
                <i class="fa-solid fa-wheelchair fa-2x text-warning me-3"></i>
                <div>
                  <small class="text-muted fw-bold">PWD CITIZENS</small>
                  <h4 class="fw-bold mb-0" id="statPWD">-</h4>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card card-stat p-3 bg-white">
              <div class="d-flex align-items-center">
                <i class="fa-solid fa-person-cane fa-2x text-info me-3"></i>
                <div>
                  <small class="text-muted fw-bold">SENIOR CITIZENS</small>
                  <h4 class="fw-bold mb-0" id="statSeniors">-</h4>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- RECENT ACTIVITY LOGS TABLE -->
        <div class="card border-0 shadow-sm rounded-4">
          <div class="card-header bg-white py-3">
            <h6 class="fw-bold mb-0 text-dark"><i class="fa-solid fa-clock-rotate-left me-2"></i>Recent System Activity Audit</h6>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody id="activityLogsBody">
                  <tr><td colspan="4" class="text-center py-4 text-muted">Loading activity audit logs...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <script>
        async function loadDashboardData() {
          try {
            const res = await fetch('/api/staff/dashboard-stats');
            const data = await res.json();
            
            document.getElementById('statResidents').innerText = data.totalResidents;
            document.getElementById('statPendingRegs').innerText = data.pendingRegistrations;
            document.getElementById('statHouseholds').innerText = data.totalHouseholds;
            document.getElementById('statPendingCerts').innerText = data.pendingCertificates;

            document.getElementById('statMale').innerText = data.maleResidents;
            document.getElementById('statFemale').innerText = data.femaleResidents;
            document.getElementById('statPWD').innerText = data.pwds;
            document.getElementById('statSeniors').innerText = data.seniorCitizens;

            const logsBody = document.getElementById('activityLogsBody');
            if (data.recentActivities.length === 0) {
              logsBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">No activities logged yet.</td></tr>';
            } else {
              logsBody.innerHTML = data.recentActivities.map(log => \`
                <tr>
                  <td class="small text-muted">\${new Date(log.created_at).toLocaleString()}</td>
                  <td class="fw-bold">\${log.user_name}</td>
                  <td><span class="badge bg-secondary">\${log.action}</span></td>
                  <td class="small text-muted">\${log.details}</td>
                </tr>
              \`).join('');
            }
          } catch (err) {
            console.error('Failed to load stats:', err);
          }
        }

        async function handleLogout() {
          await fetch('/api/auth/logout', { method: 'POST' });
          window.location.href = '/login';
        }

        loadDashboardData();
      </script>
    </body>
    </html>
  `;
  res.send(html);
});

// 6. PENDING RESIDENT APPROVALS PAGE
app.get('/staff/pending-residents', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
  const barangay = await getBarangayBranding();

  const html = `
    ${getBaseHead('Pending Resident Approvals', barangay)}
    <body>
      <div class="main-content ms-0 p-4">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h3 class="fw-bold text-barangay-primary"><i class="fa-solid fa-user-clock me-2"></i>Pending Resident Registration Applications</h3>
            <p class="text-muted small">Review and approve or reject self-registered resident accounts</p>
          </div>
          <a href="/dashboard" class="btn btn-outline-secondary"><i class="fa-solid fa-arrow-left me-2"></i>Back to Dashboard</a>
        </div>

        <div class="card border-0 shadow-sm rounded-4">
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th>Applicant Name</th>
                    <th>Date of Birth / Age</th>
                    <th>Address / Purok</th>
                    <th>Contact & Email</th>
                    <th>Document</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody id="pendingTableBody">
                  <tr><td colspan="6" class="text-center py-4 text-muted">Loading pending registration applications...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- APPROVE / REJECT MODAL -->
      <div class="modal fade" id="reviewModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title fw-bold" id="modalTitle">Review Registration</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <input type="hidden" id="modalResidentId">
              <input type="hidden" id="modalAction">
              
              <div id="rejectReasonGroup" class="mb-3 d-none">
                <label class="form-label small fw-semibold">Reason for Rejection *</label>
                <textarea id="rejectionReason" class="form-control" rows="3" placeholder="Specify reason why application is rejected..."></textarea>
              </div>

              <p id="modalConfirmText" class="mb-0"></p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
              <button type="button" id="confirmReviewBtn" onclick="submitReview()" class="btn btn-primary">Confirm</button>
            </div>
          </div>
        </div>
      </div>

      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
      <script>
        let reviewModal;
        document.addEventListener('DOMContentLoaded', () => {
          reviewModal = new bootstrap.Modal(document.getElementById('reviewModal'));
          loadPendingResidents();
        });

        async function loadPendingResidents() {
          try {
            const res = await fetch('/api/residents?status=Pending');
            const data = await res.json();
            const tbody = document.getElementById('pendingTableBody');

            if (data.length === 0) {
              tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No pending resident registration applications found.</td></tr>';
              return;
            }

            tbody.innerHTML = data.map(r => {
              const age = Math.floor((new Date() - new Date(r.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000));
              return \`
                <tr>
                  <td class="fw-bold">\${r.first_name} \${r.middle_name || ''} \${r.last_name} \${r.suffix || ''}</td>
                  <td>\${r.date_of_birth} (\${age} yrs)</td>
                  <td>\${r.address} <br><small class="text-muted">\${r.puroks ? r.puroks.name : ''}</small></td>
                  <td>\${r.contact_number}<br><small class="text-muted">\${r.email}</small></td>
                  <td>
                    \${r.photo_url ? \`<a href="\${r.photo_url}" target="_blank" class="btn btn-sm btn-outline-info"><i class="fa-solid fa-file-lines me-1"></i>View File</a>\` : '<span class="text-muted small">None</span>'}
                  </td>
                  <td>
                    <button onclick="openReviewModal('\${r.id}', 'approve', '\${r.first_name} \${r.last_name}')" class="btn btn-sm btn-success me-1"><i class="fa-solid fa-check me-1"></i>Approve</button>
                    <button onclick="openReviewModal('\${r.id}', 'reject', '\${r.first_name} \${r.last_name}')" class="btn btn-sm btn-danger"><i class="fa-solid fa-xmark me-1"></i>Reject</button>
                  </td>
                </tr>
              \`;
            }).join('');
          } catch (err) {
            console.error(err);
          }
        }

        function openReviewModal(id, action, name) {
          document.getElementById('modalResidentId').value = id;
          document.getElementById('modalAction').value = action;
          const confirmText = document.getElementById('modalConfirmText');
          const rejectGroup = document.getElementById('rejectReasonGroup');
          const confirmBtn = document.getElementById('confirmReviewBtn');

          if (action === 'approve') {
            document.getElementById('modalTitle').innerText = 'Approve Registration';
            confirmText.innerText = 'Are you sure you want to approve ' + name + '? This will generate an official Resident ID.';
            rejectGroup.classList.add('d-none');
            confirmBtn.className = 'btn btn-success';
            confirmBtn.innerText = 'Approve & Generate ID';
          } else {
            document.getElementById('modalTitle').innerText = 'Reject Registration';
            confirmText.innerText = 'Rejecting application for ' + name + '.';
            rejectGroup.classList.remove('d-none');
            confirmBtn.className = 'btn btn-danger';
            confirmBtn.innerText = 'Confirm Rejection';
          }
          reviewModal.show();
        }

        async function submitReview() {
          const id = document.getElementById('modalResidentId').value;
          const action = document.getElementById('modalAction').value;
          const rejectionReason = document.getElementById('rejectionReason').value;

          try {
            const res = await fetch(\`/api/staff/residents/\${id}/review\`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action, rejectionReason })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            reviewModal.hide();
            loadPendingResidents();
          } catch (err) {
            alert(err.message);
          }
        }
      </script>
    </body>
    </html>
  `;
  res.send(html);
});

// 7. BATCH ID PRINTING LAYOUT (8 STANDARD-SIZE IDs PER BOND PAPER PAGE)
app.get('/staff/id-printing', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
  const barangay = await getBarangayBranding();

  let residents = [];
  if (supabase) {
    const { data } = await supabase.from('residents').select('*, puroks(name)').eq('status', 'Approved').order('last_name');
    residents = data || [];
  }

  const html = `
    ${getBaseHead('Physical Resident ID Printing', barangay)}
    <body class="bg-light p-4">
      <div class="no-print container mb-4">
        <div class="card border-0 shadow-sm p-3">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <h4 class="fw-bold mb-0 text-barangay-primary"><i class="fa-solid fa-print me-2"></i>Physical Resident ID Card Printing</h4>
              <p class="text-muted small mb-0">Arranged specifically to fit <strong>8 Standard-Size IDs per Bond Paper Page</strong>.</p>
            </div>
            <div>
              <a href="/dashboard" class="btn btn-outline-secondary me-2"><i class="fa-solid fa-arrow-left me-1"></i>Back</a>
              <button onclick="window.print()" class="btn btn-barangay"><i class="fa-solid fa-print me-1"></i>Print Selected Cards</button>
            </div>
          </div>
        </div>
      </div>

      <!-- PRINTABLE AREA (8 CARDS / GRID PAGE) -->
      <div id="printableIdArea" class="container">
        <div class="id-card-grid">
          ${residents.slice(0, 8).map(r => `
            <div class="physical-id-card d-flex flex-column justify-content-between">
              <!-- HEADER -->
              <div class="d-flex align-items-center border-bottom pb-1">
                ${barangay.barangay_logo ? `<img src="${barangay.barangay_logo}" style="width:25px;height:25px;" class="me-1">` : ''}
                <div>
                  <div class="fw-bold text-uppercase" style="font-size: 6.5pt; color: #1b4332;">${barangay.barangay_name}</div>
                  <div class="text-muted" style="font-size: 5pt;">OFFICIAL RESIDENT IDENTIFICATION CARD</div>
                </div>
              </div>

              <!-- BODY -->
              <div class="d-flex align-items-center my-1">
                <div class="bg-light border text-center me-2 d-flex align-items-center justify-content-center" style="width:55px; height:55px; font-size: 8pt;">
                  ${r.photo_url ? `<img src="${r.photo_url}" style="width:100%;height:100%;object-fit:cover;">` : '<i class="fa-solid fa-user text-secondary"></i>'}
                </div>
                <div style="font-size: 6.5pt; line-height: 1.1;">
                  <div class="fw-bold text-uppercase" style="font-size:7.5pt;">${r.first_name}${r.last_name}</div>
                  <div><strong>ID:</strong> ${r.resident_id_number}</div>
                  <div><strong>DOB:</strong> ${r.date_of_birth} \vert{} <strong>Sex:</strong>${r.gender}</div>
                  <div><strong>Purok:</strong> ${r.puroks ? r.puroks.name : 'N/A'}</div>
                </div>
              </div>

              <!-- FOOTER / QR CODE -->
              <div class="d-flex align-items-center justify-content-between border-top pt-1" style="font-size: 5.5pt;">
                <div>
                  <span class="badge bg-success" style="font-size: 4.5pt;">VERIFIED CITIZEN</span>
                  <div class="text-muted">Issued: 2026</div>
                </div>
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=40x40&data=${encodeURIComponent(process.env.APP_URL || 'http://localhost:3000' + '/verify/' + r.resident_id_number)}" style="width:32px;height:32px;">
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

// 8. RESIDENT PORTAL ROUTE
app.get('/portal', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const barangay = await getBarangayBranding();

  let resident = null;
  if (supabase && req.user.residentId) {
    const { data } = await supabase.from('residents').select('*, puroks(name)').eq('id', req.user.residentId).single();
    resident = data;
  }

  const html = `
    ${getBaseHead('Resident Online Portal', barangay)}
    <body class="bg-light">
      <nav class="navbar navbar-expand-lg bg-barangay-primary navbar-dark shadow-sm">
        <div class="container">
          <a class="navbar-brand fw-bold d-flex align-items-center" href="/portal">
            ${barangay.barangay_logo ? `<img src="${barangay.barangay_logo}" class="brand-logo me-2">` : '<i class="fa-solid fa-house-chimney-user me-2"></i>'}
            ${barangay.barangay_name} Portal
          </a>
          <div class="d-flex align-items-center">
            <span class="text-white me-3 small">Welcome, <strong>${req.user.fullName}</strong></span>
            <button onclick="handleLogout()" class="btn btn-outline-light btn-sm"><i class="fa-solid fa-right-from-bracket me-1"></i>Logout</button>
          </div>
        </div>
      </nav>

      <div class="container py-4">
        <div class="row g-4">
          <!-- DIGITAL RESIDENT ID CARD -->
          <div class="col-md-5 col-lg-4">
            <div class="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
              <div class="bg-barangay-primary text-white p-3 text-center">
                <h6 class="fw-bold mb-0">${barangay.barangay_name}</h6>
                <small class="text-light-50">DIGITAL RESIDENT IDENTIFICATION</small>
              </div>
              <div class="card-body text-center p-4">
                <div class="bg-light rounded-circle mx-auto d-flex align-items-center justify-content-center mb-3 shadow-sm" style="width:100px; height:100px; overflow:hidden;">
                  ${resident && resident.photo_url ? `<img src="${resident.photo_url}" style="width:100%;height:100%;object-fit:cover;">` : '<i class="fa-solid fa-user fa-3x text-secondary"></i>'}
                </div>

                <h5 class="fw-bold text-dark mb-1">${req.user.fullName}</h5>
                <span class="badge bg-success mb-3">${resident ? resident.resident_id_number : 'BRGY-2026-PENDING'}</span>

                <div class="border-top pt-3 text-start small">
                  <div class="mb-1"><strong>Status:</strong> <span class="badge bg-success">${resident ? resident.status : 'Pending'}</span></div>
                  <div class="mb-1"><strong>Purok:</strong> ${resident && resident.puroks ? resident.puroks.name : 'N/A'}</div>
                  <div class="mb-1"><strong>Date of Birth:</strong> ${resident ? resident.date_of_birth : 'N/A'}</div>
                </div>

                ${resident ? `
                  <div class="mt-3 border-top pt-3">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent((process.env.APP_URL || 'http://localhost:3000') + '/verify/' + resident.resident_id_number)}" style="width:110px;height:110px;" class="img-thumbnail">
                    <div class="small text-muted mt-1">Scan QR Code for Online Verification</div>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- RESIDENT SERVICES & PORTAL MODULES -->
          <div class="col-md-7 col-lg-8">
            <div class="card border-0 shadow-sm rounded-4 mb-4">
              <div class="card-header bg-white py-3">
                <h6 class="fw-bold mb-0 text-barangay-primary"><i class="fa-solid fa-file-signature me-2"></i>Request Barangay Certificate</h6>
              </div>
              <div class="card-body">
                <form id="certRequestForm" onsubmit="submitCertRequest(event)">
                  <div class="row">
                    <div class="col-md-6 mb-3">
                      <label class="form-label small fw-semibold">Certificate Type *</label>
                      <select id="certType" class="form-select" required>
                        <option value="Barangay Clearance">Barangay Clearance</option>
                        <option value="Certificate of Residency">Certificate of Residency</option>
                        <option value="Certificate of Indigency">Certificate of Indigency</option>
                        <option value="Good Moral Certificate">Good Moral Certificate</option>
                        <option value="Certificate of Solo Parent">Certificate of Solo Parent</option>
                      </select>
                    </div>
                    <div class="col-md-6 mb-3">
                      <label class="form-label small fw-semibold">Purpose *</label>
                      <input type="text" id="certPurpose" class="form-control" placeholder="e.g. Employment / Local Application" required>
                    </div>
                  </div>
                  <button type="submit" class="btn btn-barangay"><i class="fa-solid fa-paper-plane me-1"></i>Submit Request</button>
                </form>
              </div>
            </div>

            <!-- MY CERTIFICATE REQUESTS TABLE -->
            <div class="card border-0 shadow-sm rounded-4">
              <div class="card-header bg-white py-3">
                <h6 class="fw-bold mb-0 text-dark"><i class="fa-solid fa-clock-rotate-left me-2"></i>My Certificate Requests</h6>
              </div>
              <div class="card-body p-0">
                <div class="table-responsive">
                  <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                      <tr>
                        <th>Certificate</th>
                        <th>Purpose</th>
                        <th>Status</th>
                        <th>Document File</th>
                      </tr>
                    </thead>
                    <tbody id="myCertsTable">
                      <tr><td colspan="4" class="text-center py-3 text-muted">Loading certificate requests...</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        async function loadMyCertificates() {
          try {
            const res = await fetch('/api/certificates');
            const data = await res.json();
            const tbody = document.getElementById('myCertsTable');

            if (data.length === 0) {
              tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">No certificate requests submitted yet.</td></tr>';
              return;
            }

            tbody.innerHTML = data.map(c => \`
              <tr>
                <td class="fw-bold">\${c.certificate_type}</td>
                <td class="small">\${c.purpose}</td>
                <td><span class="badge bg-\${c.status === 'Released' || c.status === 'Ready for Release' ? 'success' : (c.status === 'Rejected' ? 'danger' : 'warning')}">\${c.status}</span></td>
                <td>
                  \${c.document_url ? \`<a href="\${c.document_url}" target="_blank" class="btn btn-sm btn-outline-success"><i class="fa-solid fa-download me-1"></i>Download File</a>\` : '<span class="text-muted small">Not uploaded yet</span>'}
                </td>
              </tr>
            \`).join('');
          } catch (err) {
            console.error(err);
          }
        }

        async function submitCertRequest(e) {
          e.preventDefault();
          const certType = document.getElementById('certType').value;
          const purpose = document.getElementById('certPurpose').value;

          try {
            const res = await fetch('/api/certificates/request', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ certificateType: certType, purpose })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            document.getElementById('certPurpose').value = '';
            loadMyCertificates();
          } catch (err) {
            alert(err.message);
          }
        }

        async function handleLogout() {
          await fetch('/api/auth/logout', { method: 'POST' });
          window.location.href = '/login';
        }

        loadMyCertificates();
      </script>
    </body>
    </html>
  `;
  res.send(html);
});

// 9. UNAUTHORIZED / ACCESS DENIED SCREEN
function renderUnauthorizedPage() {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>403 - Access Denied</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light d-flex align-items-center min-vh-100 text-center">
      <div class="container">
        <h1 class="display-1 fw-bold text-danger">403</h1>
        <h3 class="fw-bold">Access Forbidden</h3>
        <p class="text-muted">You do not have the required role privileges to access this portal page.</p>
        <a href="/login" class="btn btn-primary mt-2">Return to Login</a>
      </div>
    </body>
    </html>
  `;
}

// DEFAULT FALLBACK CATCH-ALL ROUTE
app.get('*', async (req, res) => {
  const adminExists = await checkAdminExists();
  if (!adminExists) {
    return res.redirect('/setup');
  }
  return res.redirect('/login');
});

// ============================================================================
// SERVER INITIALIZATION & PORT BINDING
// ============================================================================
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` BARANGAY RESIDENT MANAGEMENT SYSTEM WEB SERVER READY`);
  console.log(` Server running on port: ${PORT}`);
  console.log(` Open application: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
