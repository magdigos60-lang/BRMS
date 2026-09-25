/**
 * BARANGAY RESIDENT MANAGEMENT SYSTEM
 * Single-file Express/JavaScript/Supabase Backend & Frontend Application
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

// -----------------------------------------------------------------------------
// ENVIRONMENT & SUPABASE INITIALIZATION
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'barangay_super_secret_jwt_key_2026';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('WARNING: SUPABASE_URL or SUPABASE_ANON_KEY is missing in environment variables!');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const upload = multer({ storage: multer.memoryStorage() });
const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(cookieParser());

// -----------------------------------------------------------------------------
// HELPER FUNCTIONS & MIDDLEWARES
// -----------------------------------------------------------------------------
async function logActivity(userId, userName, action, description) {
  try {
    await supabase.from('activity_logs').insert([{
      user_id: userId || null,
      user_name: userName || 'System',
      action,
      description
    }]);
  } catch (err) {
    console.error('Activity Log Error:', err);
  }
}

async function createNotification(userId, title, message, type = 'INFO') {
  try {
    if (userId) {
      await supabase.from('notifications').insert([{
        user_id: userId,
        title,
        message,
        type
      }]);
    }
  } catch (err) {
    console.error('Notification Error:', err);
  }
}

async function getBarangaySettings() {
  try {
    const { data } = await supabase.from('settings').select('*').eq('id', 1).single();
    return data || {
      barangay_name: 'Barangay Central',
      municipality: 'Angeles City',
      province: 'Pampanga',
      address: 'Barangay Hall Complex',
      contact_number: '09123456789',
      email: 'info@barangay.gov.ph',
      logo_url: ''
    };
  } catch {
    return {
      barangay_name: 'Barangay Central',
      municipality: 'Angeles City',
      province: 'Pampanga',
      address: 'Barangay Hall Complex',
      contact_number: '09123456789',
      email: 'info@barangay.gov.ph',
      logo_url: ''
    };
  }
}

function authenticateToken(req, res, next) {
  const token = req.cookies.jwt_token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) return res.status(401).json({ error: 'Unauthorized access. Please login.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Session expired or invalid.' });
    req.user = user;
    next();
  });
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient privileges.' });
    }
    next();
  };
}

// -----------------------------------------------------------------------------
// API ROUTES
// -----------------------------------------------------------------------------

// System Setup Check
app.get('/api/setup/status', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('id').limit(1);
    if (error) throw error;
    res.json({ hasAdmin: data && data.length > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Initial Registration
app.post('/api/setup/admin', async (req, res) => {
  try {
    const { data: existingUsers } = await supabase.from('users').select('id').limit(1);
    if (existingUsers && existingUsers.length > 0) {
      return res.status(400).json({ error: 'Administrator already exists. First-time setup locked.' });
    }

    const { name, email, password, confirm_password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (password !== confirm_password) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const { data: newUser, error } = await supabase.from('users').insert([{
      name,
      email,
      password: hashedPassword,
      role: 'ADMIN',
      status: 'ACTIVE'
    }]).select().single();

    if (error) throw error;

    await logActivity(newUser.id, newUser.name, 'INITIAL_SETUP', 'Created first administrator account.');
    res.json({ success: true, message: 'Administrator account created successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

    const { data: user, error } = await supabase.from('users').select('*').eq('email', email).single();
    if (error || !user) return res.status(401).json({ error: 'Invalid login credentials.' });

    if (user.status !== 'ACTIVE') return res.status(403).json({ error: 'Account is inactive or suspended.' });

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(401).json({ error: 'Invalid login credentials.' });

    // Fetch resident info if user is resident
    let residentInfo = null;
    if (user.role === 'RESIDENT') {
      const { data: resData } = await supabase.from('residents').select('*').eq('user_id', user.id).single();
      residentInfo = resData;
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role, resident_id: residentInfo ? residentInfo.id : null },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('jwt_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 86400000 });
    await logActivity(user.id, user.name, 'LOGIN', 'User logged in to the portal.');

    res.json({ success: true, token, role: user.role, name: user.name, resident: residentInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('jwt_token');
  res.json({ success: true });
});

// Public Resident Registration
app.post('/api/public/register', upload.single('photo'), async (req, res) => {
  try {
    const payload = req.body;
    
    // Check existing email
    const { data: existingUser } = await supabase.from('users').select('id').eq('email', payload.email).single();
    if (existingUser) return res.status(400).json({ error: 'Email address already registered.' });

    if (payload.password !== payload.confirm_password) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const hashedPassword = await bcrypt.hash(payload.password, 10);

    // Create User account
    const { data: user, error: userErr } = await supabase.from('users').insert([{
      name: `${payload.first_name} ${payload.last_name}`,
      email: payload.email,
      password: hashedPassword,
      role: 'RESIDENT',
      status: 'ACTIVE'
    }]).select().single();

    if (userErr) throw userErr;

    let photoUrl = '';
    if (req.file) {
      const fileName = `residents/${Date.now()}_${req.file.originalname}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('barangay-files')
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

      if (!uploadErr && uploadData) {
        const { data: pubUrl } = supabase.storage.from('barangay-files').getPublicUrl(fileName);
        photoUrl = pubUrl.publicUrl;
      }
    }

    // Calculate age
    const birthDate = new Date(payload.birth_date);
    const age = new Date().getFullYear() - birthDate.getFullYear();

    // Create Resident record
    const { error: resErr } = await supabase.from('residents').insert([{
      user_id: user.id,
      first_name: payload.first_name,
      middle_name: payload.middle_name || '',
      last_name: payload.last_name,
      suffix: payload.suffix || '',
      birth_date: payload.birth_date,
      age: age,
      gender: payload.gender,
      civil_status: payload.civil_status,
      nationality: payload.nationality || 'Filipino',
      religion: payload.religion || '',
      occupation: payload.occupation || '',
      educational_attainment: payload.educational_attainment || '',
      contact_number: payload.contact_number,
      email: payload.email,
      address: payload.address,
      purok: payload.purok,
      voter_status: payload.voter_status || 'Registered',
      is_senior: age >= 60,
      is_pwd: payload.is_pwd === 'true',
      is_solo_parent: payload.is_solo_parent === 'true',
      photo: photoUrl,
      approval_status: 'Pending',
      resident_status: 'Active'
    }]);

    if (resErr) throw resErr;

    await logActivity(user.id, user.name, 'RESIDENT_REGISTER', 'Submitted resident registration application.');
    res.json({ success: true, message: 'Registration submitted successfully! Please wait for staff approval.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Current User Profile
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('id, name, email, role, status').eq('id', req.user.id).single();
    let resident = null;
    if (user && user.role === 'RESIDENT') {
      const { data: resData } = await supabase.from('residents').select('*').eq('user_id', user.id).single();
      resident = resData;
    }
    const settings = await getBarangaySettings();
    res.json({ user, resident, settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF API: Stats Dashboard
app.get('/api/staff/stats', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { count: totalResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('approval_status', 'Approved').eq('resident_status', 'Active');
    const { count: pendingResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('approval_status', 'Pending');
    const { count: totalHouseholds } = await supabase.from('households').select('*', { count: 'exact', head: true });
    const { count: maleResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('approval_status', 'Approved').eq('gender', 'Male');
    const { count: femaleResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('approval_status', 'Approved').eq('gender', 'Female');
    const { count: seniorCitizens } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('approval_status', 'Approved').gte('age', 60);
    const { count: pwdCount } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('approval_status', 'Approved').eq('is_pwd', true);
    const { count: soloParents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('approval_status', 'Approved').eq('is_solo_parent', true);
    
    const { count: pendingCertificates } = await supabase.from('certificate_requests').select('*', { count: 'exact', head: true }).eq('status', 'Pending');
    const { count: pendingAppointments } = await supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'Pending');
    const { count: openBlotters } = await supabase.from('blotter').select('*', { count: 'exact', head: true }).in('status', ['Open', 'Under Investigation']);

    res.json({
      totalResidents: totalResidents || 0,
      pendingResidents: pendingResidents || 0,
      totalHouseholds: totalHouseholds || 0,
      maleResidents: maleResidents || 0,
      femaleResidents: femaleResidents || 0,
      seniorCitizens: seniorCitizens || 0,
      pwdCount: pwdCount || 0,
      soloParents: soloParents || 0,
      pendingCertificates: pendingCertificates || 0,
      pendingAppointments: pendingAppointments || 0,
      openBlotters: openBlotters || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF API: Residents Management
app.get('/api/staff/residents', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { approval_status, resident_status, search, purok } = req.query;
    let query = supabase.from('residents').select('*').order('created_at', { ascending: false });

    if (approval_status) query = query.eq('approval_status', approval_status);
    if (resident_status) query = query.eq('resident_status', resident_status);
    if (purok) query = query.eq('purok', purok);
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,resident_id.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF API: Resident Details
app.get('/api/staff/residents/:id', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { data, error } = await supabase.from('residents').select('*, households(*)').eq('id', req.params.id).single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF API: Approve Resident
app.post('/api/staff/residents/:id/approve', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const residentIdParam = req.params.id;
    const { data: resData } = await supabase.from('residents').select('*').eq('id', residentIdParam).single();
    if (!resData) return res.status(404).json({ error: 'Resident not found.' });

    // Generate Official Resident ID (Format: BRGY-2026-XXXXXX)
    const year = new Date().getFullYear();
    const randNum = Math.floor(100000 + Math.random() * 900000);
    const officialResidentId = `BRGY-${year}-${randNum}`;
    const qrToken = `BRGY-VERIFY-${uuidv4()}`;

    const { error: updateErr } = await supabase.from('residents').update({
      approval_status: 'Approved',
      resident_status: 'Active',
      resident_id: officialResidentId,
      qr_token: qrToken,
      updated_at: new Date()
    }).eq('id', residentIdParam);

    if (updateErr) throw updateErr;

    // Send notification
    if (resData.user_id) {
      await createNotification(
        resData.user_id,
        'Application Approved!',
        `Your Barangay Resident application has been approved! Your Resident ID is ${officialResidentId}.`,
        'SUCCESS'
      );
    }

    await logActivity(req.user.id, req.user.name, 'APPROVE_RESIDENT', `Approved resident application for ${resData.first_name} ${resData.last_name} (${officialResidentId}).`);
    res.json({ success: true, message: 'Resident approved successfully!', resident_id: officialResidentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF API: Reject Resident
app.post('/api/staff/residents/:id/reject', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Rejection reason is required.' });

    const { data: resData } = await supabase.from('residents').select('*').eq('id', req.params.id).single();
    if (!resData) return res.status(404).json({ error: 'Resident not found.' });

    const { error } = await supabase.from('residents').update({
      approval_status: 'Rejected',
      rejection_reason: reason,
      updated_at: new Date()
    }).eq('id', req.params.id);

    if (error) throw error;

    if (resData.user_id) {
      await createNotification(
        resData.user_id,
        'Application Rejected',
        `Your Barangay Resident application was rejected. Reason: ${reason}`,
        'DANGER'
      );
    }

    await logActivity(req.user.id, req.user.name, 'REJECT_RESIDENT', `Rejected resident application for ${resData.first_name} ${resData.last_name}. Reason: ${reason}`);
    res.json({ success: true, message: 'Resident application rejected.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF API: Update / Archive Resident Status
app.post('/api/staff/residents/:id/status', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { status } = req.body; // Active, Inactive, Moved Out, Deceased, Archived
    if (!['Active', 'Inactive', 'Moved Out', 'Deceased', 'Archived'].includes(status)) {
      return res.status(400).json({ error: 'Invalid resident status.' });
    }

    const { data: resData } = await supabase.from('residents').select('*').eq('id', req.params.id).single();
    if (!resData) return res.status(404).json({ error: 'Resident not found.' });

    const { error } = await supabase.from('residents').update({
      resident_status: status,
      updated_at: new Date()
    }).eq('id', req.params.id);

    if (error) throw error;

    await logActivity(req.user.id, req.user.name, 'UPDATE_RESIDENT_STATUS', `Updated status of ${resData.first_name} ${resData.last_name} to ${status}.`);
    res.json({ success: true, message: `Resident marked as ${status}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF API: Certificate Requests List
app.get('/api/staff/certificates/requests', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase.from('certificate_requests').select('*, residents(*)').order('requested_at', { ascending: false });
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF API: Approve Certificate Request & Upload File
app.post('/api/staff/certificates/requests/:id/approve', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), upload.single('file'), async (req, res) => {
  try {
    const requestId = req.params.id;
    const { remarks } = req.body;

    const { data: reqData } = await supabase.from('certificate_requests').select('*, residents(*)').eq('id', requestId).single();
    if (!reqData) return res.status(404).json({ error: 'Certificate request not found.' });

    let fileUrl = reqData.file_url || '';
    if (req.file) {
      const fileName = `certificates/${Date.now()}_${req.file.originalname}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('barangay-files')
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

      if (!uploadErr && uploadData) {
        const { data: pubUrl } = supabase.storage.from('barangay-files').getPublicUrl(fileName);
        fileUrl = pubUrl.publicUrl;
      }
    }

    const { error } = await supabase.from('certificate_requests').update({
      status: 'Ready for Release',
      staff_remarks: remarks || 'Approved and ready for pickup/release.',
      file_url: fileUrl,
      approved_at: new Date()
    }).eq('id', requestId);

    if (error) throw error;

    if (reqData.residents && reqData.residents.user_id) {
      await createNotification(
        reqData.residents.user_id,
        'Certificate Request Ready!',
        `Your request for ${reqData.certificate_type} is now READY FOR RELEASE/CLAIMING.`,
        'SUCCESS'
      );
    }

    await logActivity(req.user.id, req.user.name, 'APPROVE_CERTIFICATE', `Approved certificate request (${reqData.request_number}) for ${reqData.residents.first_name} ${reqData.residents.last_name}.`);
    res.json({ success: true, message: 'Certificate approved and marked Ready for Release.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF API: Reject Certificate Request
app.post('/api/staff/certificates/requests/:id/reject', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { remarks } = req.body;
    if (!remarks) return res.status(400).json({ error: 'Rejection reason/remarks required.' });

    const { data: reqData } = await supabase.from('certificate_requests').select('*, residents(*)').eq('id', req.params.id).single();
    if (!reqData) return res.status(404).json({ error: 'Certificate request not found.' });

    const { error } = await supabase.from('certificate_requests').update({
      status: 'Rejected',
      staff_remarks: remarks
    }).eq('id', req.params.id);

    if (error) throw error;

    if (reqData.residents && reqData.residents.user_id) {
      await createNotification(
        reqData.residents.user_id,
        'Certificate Request Rejected',
        `Your request for ${reqData.certificate_type} was rejected. Reason: ${remarks}`,
        'DANGER'
      );
    }

    await logActivity(req.user.id, req.user.name, 'REJECT_CERTIFICATE', `Rejected certificate request (${reqData.request_number}).`);
    res.json({ success: true, message: 'Certificate request rejected.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF API: Mark Certificate as Claimed
app.post('/api/staff/certificates/requests/:id/claim', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { data: reqData } = await supabase.from('certificate_requests').select('*, residents(*)').eq('id', req.params.id).single();
    if (!reqData) return res.status(404).json({ error: 'Request not found.' });

    const { error } = await supabase.from('certificate_requests').update({
      status: 'Claimed',
      claimed_at: new Date(),
      claimed_by_staff: req.user.name
    }).eq('id', req.params.id);

    if (error) throw error;

    if (reqData.residents && reqData.residents.user_id) {
      await createNotification(
        reqData.residents.user_id,
        'Certificate Claimed',
        `Your certificate (${reqData.certificate_type}) has been officially marked as CLAIMED.`,
        'INFO'
      );
    }

    await logActivity(req.user.id, req.user.name, 'CLAIM_CERTIFICATE', `Marked certificate ${reqData.request_number} as CLAIMED.`);
    res.json({ success: true, message: 'Certificate marked as Claimed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF API: Households
app.get('/api/staff/households', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { data, error } = await supabase.from('households').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/staff/households', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { household_number, household_head, address, purok } = req.body;
    if (!household_number || !household_head || !address || !purok) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const { data, error } = await supabase.from('households').insert([{
      household_number,
      household_head,
      address,
      purok
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.name, 'CREATE_HOUSEHOLD', `Created household ${household_number}.`);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF API: Blotter Cases
app.get('/api/staff/blotter', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { data, error } = await supabase.from('blotter').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/staff/blotter', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { complainant, respondent, witness, incident_date, incident_location, description, action_taken } = req.body;
    const caseNum = `BLOTTER-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const { data, error } = await supabase.from('blotter').insert([{
      case_number: caseNum,
      complainant,
      respondent,
      witness,
      incident_date,
      incident_location,
      description,
      action_taken,
      status: 'Open'
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.name, 'CREATE_BLOTTER', `Created blotter case ${caseNum}.`);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/staff/blotter/:id/status', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { status, action_taken, settlement_details } = req.body;
    const { error } = await supabase.from('blotter').update({
      status,
      action_taken,
      settlement_details
    }).eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true, message: 'Blotter status updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF API: Announcements Management
app.get('/api/announcements', async (req, res) => {
  try {
    const { data, error } = await supabase.from('announcements').select('*').eq('status', 'Published').order('published_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/staff/announcements', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), upload.single('image'), async (req, res) => {
  try {
    const { title, content, status } = req.body;
    let imageUrl = '';

    if (req.file) {
      const fileName = `announcements/${Date.now()}_${req.file.originalname}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('barangay-files')
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

      if (!uploadErr && uploadData) {
        const { data: pubUrl } = supabase.storage.from('barangay-files').getPublicUrl(fileName);
        imageUrl = pubUrl.publicUrl;
      }
    }

    const { data, error } = await supabase.from('announcements').insert([{
      title,
      content,
      image: imageUrl,
      author: req.user.name,
      status: status || 'Published'
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.name, 'CREATE_ANNOUNCEMENT', `Created announcement: ${title}`);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF API: Business Permitting
app.get('/api/staff/businesses', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { data, error } = await supabase.from('businesses').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/staff/businesses', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { business_name, owner, address, business_type, permit_number, expiration_date } = req.body;
    const { data, error } = await supabase.from('businesses').insert([{
      business_name,
      owner,
      address,
      business_type,
      permit_number,
      expiration_date,
      permit_status: 'Active'
    }]).select().single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF API: Appointments
app.get('/api/staff/appointments', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { data, error } = await supabase.from('appointments').select('*, residents(*)').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/staff/appointments/:id/status', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { status, remarks } = req.body;
    const { data: appt } = await supabase.from('appointments').select('*, residents(*)').eq('id', req.params.id).single();
    
    const { error } = await supabase.from('appointments').update({ status, remarks }).eq('id', req.params.id);
    if (error) throw error;

    if (appt && appt.residents && appt.residents.user_id) {
      await createNotification(
        appt.residents.user_id,
        'Appointment Status Updated',
        `Your appointment for ${appt.service} has been updated to ${status}.`,
        status === 'Approved' ? 'SUCCESS' : 'INFO'
      );
    }

    res.json({ success: true, message: 'Appointment updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF API: Assistance Requests
app.get('/api/staff/assistance', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { data, error } = await supabase.from('assistance_requests').select('*, residents(*)').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/staff/assistance/:id/status', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { status, remarks } = req.body;
    const { data: ast } = await supabase.from('assistance_requests').select('*, residents(*)').eq('id', req.params.id).single();

    const { error } = await supabase.from('assistance_requests').update({ status, remarks }).eq('id', req.params.id);
    if (error) throw error;

    if (ast && ast.residents && ast.residents.user_id) {
      await createNotification(
        ast.residents.user_id,
        'Assistance Request Status',
        `Your request for ${ast.assistance_type} has been marked as ${status}.`,
        status === 'Approved' ? 'SUCCESS' : 'DANGER'
      );
    }

    res.json({ success: true, message: 'Assistance status updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN API: Settings & Branding
app.get('/api/admin/settings', authenticateToken, async (req, res) => {
  try {
    const settings = await getBarangaySettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/settings', authenticateToken, requireRole(['ADMIN']), upload.single('logo'), async (req, res) => {
  try {
    const { barangay_name, municipality, province, address, contact_number, email } = req.body;
    let logoUrl = req.body.existing_logo || '';

    if (req.file) {
      const fileName = `branding/logo_${Date.now()}_${req.file.originalname}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('barangay-files')
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

      if (!uploadErr && uploadData) {
        const { data: pubUrl } = supabase.storage.from('barangay-files').getPublicUrl(fileName);
        logoUrl = pubUrl.publicUrl;
      }
    }

    const { error } = await supabase.from('settings').upsert({
      id: 1,
      barangay_name,
      municipality,
      province,
      address,
      contact_number,
      email,
      logo_url: logoUrl,
      updated_at: new Date()
    });

    if (error) throw error;

    await logActivity(req.user.id, req.user.name, 'UPDATE_SETTINGS', 'Updated Barangay official settings and configuration.');
    res.json({ success: true, message: 'Barangay settings updated successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN API: User Accounts Management
app.get('/api/admin/users', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('id, name, email, role, status, created_at').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const { data, error } = await supabase.from('users').insert([{
      name,
      email,
      password: hashedPassword,
      role,
      status: 'ACTIVE'
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.name, 'CREATE_USER', `Created staff/user account for ${name} (${role}).`);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESIDENT PORTAL API: Certificate Request
app.get('/api/resident/certificates', authenticateToken, requireRole(['RESIDENT']), async (req, res) => {
  try {
    const { data: resident } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
    if (!resident) return res.json([]);

    const { data, error } = await supabase.from('certificate_requests').select('*').eq('resident_id', resident.id).order('requested_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/resident/certificates', authenticateToken, requireRole(['RESIDENT']), async (req, res) => {
  try {
    const { certificate_type, purpose, preferred_date } = req.body;
    const { data: resident } = await supabase.from('residents').select('id, approval_status').eq('user_id', req.user.id).single();

    if (!resident || resident.approval_status !== 'Approved') {
      return res.status(403).json({ error: 'Your resident account must be approved before requesting certificates.' });
    }

    const reqNum = `REQ-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    const { data, error } = await supabase.from('certificate_requests').insert([{
      request_number: reqNum,
      resident_id: resident.id,
      certificate_type,
      purpose,
      preferred_date: preferred_date || null,
      status: 'Pending'
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.id, req.user.name, 'REQUEST_CERTIFICATE', `Submitted request for ${certificate_type}.`);
    res.json({ success: true, message: 'Certificate request submitted!', data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESIDENT PORTAL API: Appointments
app.get('/api/resident/appointments', authenticateToken, requireRole(['RESIDENT']), async (req, res) => {
  try {
    const { data: resident } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
    if (!resident) return res.json([]);

    const { data, error } = await supabase.from('appointments').select('*').eq('resident_id', resident.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/resident/appointments', authenticateToken, requireRole(['RESIDENT']), async (req, res) => {
  try {
    const { service, appointment_date, appointment_time, purpose } = req.body;
    const { data: resident } = await supabase.from('residents').select('id, approval_status').eq('user_id', req.user.id).single();

    if (!resident || resident.approval_status !== 'Approved') {
      return res.status(403).json({ error: 'Account must be approved first.' });
    }

    const { data, error } = await supabase.from('appointments').insert([{
      resident_id: resident.id,
      service,
      appointment_date,
      appointment_time,
      purpose,
      status: 'Pending'
    }]).select().single();

    if (error) throw error;
    res.json({ success: true, message: 'Appointment booked successfully!', data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESIDENT PORTAL API: Assistance
app.get('/api/resident/assistance', authenticateToken, requireRole(['RESIDENT']), async (req, res) => {
  try {
    const { data: resident } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
    if (!resident) return res.json([]);

    const { data, error } = await supabase.from('assistance_requests').select('*').eq('resident_id', resident.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/resident/assistance', authenticateToken, requireRole(['RESIDENT']), upload.single('document'), async (req, res) => {
  try {
    const { assistance_type, purpose, amount } = req.body;
    const { data: resident } = await supabase.from('residents').select('id, approval_status').eq('user_id', req.user.id).single();

    if (!resident || resident.approval_status !== 'Approved') {
      return res.status(403).json({ error: 'Account must be approved first.' });
    }

    let docUrl = '';
    if (req.file) {
      const fileName = `assistance/${Date.now()}_${req.file.originalname}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('barangay-files')
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

      if (!uploadErr && uploadData) {
        const { data: pubUrl } = supabase.storage.from('barangay-files').getPublicUrl(fileName);
        docUrl = pubUrl.publicUrl;
      }
    }

    const { data, error } = await supabase.from('assistance_requests').insert([{
      resident_id: resident.id,
      assistance_type,
      purpose,
      amount: amount ? parseFloat(amount) : null,
      supporting_document: docUrl,
      status: 'Pending'
    }]).select().single();

    if (error) throw error;
    res.json({ success: true, message: 'Assistance request submitted!', data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESIDENT PORTAL API: Notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUBLIC API: QR Verification Verification Endpoint
app.get('/api/verify/token/:token', async (req, res) => {
  try {
    const token = req.params.token;
    const { data: resident } = await supabase.from('residents').select('*, certificate_requests(*)').eq('qr_token', token).single();

    if (!resident) {
      return res.status(404).json({ valid: false, message: 'Invalid or unrecognized QR token.' });
    }

    const settings = await getBarangaySettings();

    // Check for pending/ready certificate claims
    const pendingClaims = resident.certificate_requests ? resident.certificate_requests.filter(c => c.status === 'Ready for Release') : [];

    res.json({
      valid: true,
      barangay: settings.barangay_name,
      resident: {
        resident_id: resident.resident_id,
        name: `${resident.first_name} ${resident.middle_name ? resident.middle_name + ' ' : ''}${resident.last_name} ${resident.suffix || ''}`,
        photo: resident.photo,
        purok: resident.purok,
        address: resident.address,
        gender: resident.gender,
        birth_date: resident.birth_date,
        approval_status: resident.approval_status,
        resident_status: resident.resident_status
      },
      readyCertificates: pendingClaims
    });
  } catch (err) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

// PUBLIC API: QR Code Image Endpoint
app.get('/api/qr/generate', async (req, res) => {
  try {
    const text = req.query.text || 'INVALID';
    const qrImage = await QRCode.toDataURL(text);
    const img = Buffer.from(qrImage.split(',')[1], 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': img.length
    });
    res.end(img);
  } catch {
    res.status(500).send('Error generating QR');
  }
});

// REPORTS API
app.get('/api/staff/reports', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
  try {
    const { data: residents } = await supabase.from('residents').select('*');
    const { data: households } = await supabase.from('households').select('*');
    const { data: certificates } = await supabase.from('certificate_requests').select('*');
    const { data: blotters } = await supabase.from('blotter').select('*');

    // Purok population summary
    const purokMap = {};
    (residents || []).forEach(r => {
      if (r.purok) {
        purokMap[r.purok] = (purokMap[r.purok] || 0) + 1;
      }
    });

    res.json({
      totalResidents: (residents || []).length,
      approvedResidents: (residents || []).filter(r => r.approval_status === 'Approved').length,
      totalHouseholds: (households || []).length,
      seniorCitizens: (residents || []).filter(r => r.age >= 60).length,
      pwdCount: (residents || []).filter(r => r.is_pwd).length,
      soloParents: (residents || []).filter(r => r.is_solo_parent).length,
      voters: (residents || []).filter(r => r.voter_status === 'Registered').length,
      purokStats: purokMap,
      certificatesCount: (certificates || []).length,
      blotterCount: (blotters || []).length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// -----------------------------------------------------------------------------
// FRONTEND SINGLE-PAGE APPLICATION SERVING (HTML / CSS / JS GENERATION)
// -----------------------------------------------------------------------------
app.get('*', async (req, res) => {
  const settings = await getBarangaySettings();
  
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${settings.barangay_name} - Resident Management System</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" rel="stylesheet">
  <script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script>
  <style>
    :root {
      --primary-green: #1b4d3e;
      --secondary-green: #2c6e49;
      --accent-blue: #028090;
      --light-blue: #e0f2fe;
      --dark-green: #0d2818;
      --light-bg: #f4f7f6;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: var(--light-bg);
      color: #333;
      margin: 0;
      padding: 0;
    }

    /* LOGIN PAGE STYLES */
    .login-wrapper {
      min-height: 100vh;
      background: linear-gradient(rgba(13, 40, 24, 0.85), rgba(2, 128, 144, 0.85)),
                  url('https://scontent.fcrk3-3.fna.fbcdn.net/v/t39.30808-6/467984538_122130208178389200_2470999473131951042_n.jpg?stp=dst-jpg_tt6&cstp=mx1857x2048&ctp=s1857x2048&_nc_cat=107&ccb=1-7&_nc_sid=cc71e4&_nc_eui2=AeH-CrVk3UW0Tqq0z_SDhKwemnbseM68ydCadux4zrzJ0I4R6gykVtH1GEMMnjk_E0vUUupJBZ3vwMdzuIfYXMgZ&_nc_ohc=fKl5LR1-2YwQ7kNvwH7PIf8&_nc_oc=AdqAy1CtUXak56hu0R2Ufzy_6npapuoitUaMuup0g9veAD0bOy9PFjySTvVXJasGWis&_nc_zt=23&_nc_ht=scontent.fcrk3-3.fna&_nc_gid=SU-DBALnvlE-vtQ4KjJx4g&_nc_ss=7b2a8&oh=00_AQK7MxJys6gqu1LJrVhDYZ2WNBpKcThfTEtIUXEWUeB_Qw&oe=6ABBAEB1') no-repeat center center / cover;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .login-card {
      background: rgba(255, 255, 255, 0.96);
      border-radius: 16px;
      box-shadow: 0 15px 35px rgba(0,0,0,0.3);
      width: 100%;
      max-width: 450px;
      padding: 40px;
      backdrop-filter: blur(10px);
    }

    .branding-logo {
      width: 90px;
      height: 90px;
      object-fit: contain;
      margin-bottom: 15px;
      border-radius: 50%;
      box-shadow: 0 4px 10px rgba(0,0,0,0.15);
      background: #fff;
    }

    .btn-primary-custom {
      background-color: var(--primary-green);
      border-color: var(--primary-green);
      color: #fff;
      font-weight: 600;
      padding: 12px;
      border-radius: 8px;
    }

    .btn-primary-custom:hover {
      background-color: var(--dark-green);
      border-color: var(--dark-green);
      color: #fff;
    }

    .btn-accent {
      background-color: var(--accent-blue);
      border-color: var(--accent-blue);
      color: #fff;
    }

    /* DASHBOARD LAYOUT */
    .app-sidebar {
      width: 260px;
      background: linear-gradient(180deg, var(--primary-green) 0%, var(--dark-green) 100%);
      color: #fff;
      min-height: 100vh;
      position: fixed;
      left: 0;
      top: 0;
      transition: all 0.3s;
      z-index: 1000;
    }

    .app-content {
      margin-left: 260px;
      padding: 30px;
      min-height: 100vh;
    }

    .nav-link-custom {
      color: rgba(255,255,255,0.8);
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-radius: 8px;
      margin: 4px 12px;
      text-decoration: none;
      font-size: 0.95rem;
      transition: all 0.2s;
    }

    .nav-link-custom:hover, .nav-link-custom.active {
      background: rgba(255,255,255,0.15);
      color: #fff;
      font-weight: 600;
    }

    .stat-card {
      border: none;
      border-radius: 12px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.05);
      transition: transform 0.2s;
    }

    .stat-card:hover {
      transform: translateY(-3px);
    }

    /* DIGITAL BARANGAY ID CARD CSS */
    .id-card-wrapper {
      width: 350px;
      height: 220px;
      border-radius: 12px;
      background: linear-gradient(135deg, #ffffff 0%, #e0f2fe 100%);
      border: 2px solid var(--primary-green);
      box-shadow: 0 8px 20px rgba(0,0,0,0.15);
      padding: 12px;
      position: relative;
      overflow: hidden;
      box-sizing: border-box;
      display: inline-block;
      margin: 10px;
    }

    .id-header {
      border-bottom: 2px solid var(--primary-green);
      padding-bottom: 4px;
      margin-bottom: 8px;
    }

    .id-photo {
      width: 75px;
      height: 75px;
      border-radius: 6px;
      object-fit: cover;
      border: 2px solid var(--primary-green);
    }

    .id-qr {
      width: 70px;
      height: 70px;
    }

    /* PRINT MEDIA RULES — 8 IDS ON 1 BOND PAPER */
    @media print {
      body * {
        visibility: hidden;
      }
      #printArea, #printArea * {
        visibility: visible;
      }
      #printArea {
        position: absolute;
        left: 0;
        top: 0;
        width: 8.5in;
        height: 11in;
        padding: 0.2in;
        margin: 0;
        background: #fff;
      }

      .print-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: repeat(4, 1fr);
        gap: 0.1in;
        width: 100%;
        height: 100%;
      }

      .id-card-wrapper {
        width: 3.6in !important;
        height: 2.3in !important;
        margin: 0 !important;
        box-shadow: none !important;
        border: 1px dashed #666 !important;
        page-break-inside: avoid;
      }

      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>

  <div id="appRoot">
    <!-- Dynamic JS Views will mount here -->
    <div class="d-flex justify-content-center align-items-center vh-100">
      <div class="spinner-border text-success" role="status">
        <span class="visually-hidden">Loading Barangay System...</span>
      </div>
    </div>
  </div>

  <div id="printArea" class="d-none"></div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
  <script>
    // -------------------------------------------------------------------------
    // FRONTEND SINGLE-PAGE APPLICATION LOGIC
    // -------------------------------------------------------------------------
    let currentUser = null;
    let currentResident = null;
    let barangaySettings = {};

    document.addEventListener('DOMContentLoaded', async () => {
      await checkSetupAndAuth();
    });

    async function checkSetupAndAuth() {
      try {
        const setupRes = await fetch('/api/setup/status');
        const setupData = await setupRes.json();

        if (!setupData.hasAdmin) {
          renderFirstTimeSetup();
          return;
        }

        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const data = await meRes.json();
          currentUser = data.user;
          currentResident = data.resident;
          barangaySettings = data.settings;

          if (currentUser.role === 'RESIDENT') {
            renderResidentPortal('dashboard');
          } else {
            renderStaffPortal('dashboard');
          }
        } else {
          renderLogin();
        }
      } catch (err) {
        console.error('Setup Check Error:', err);
        renderLogin();
      }
    }

    // -------------------------------------------------------------------------
    // 1. FIRST-TIME ADMIN SETUP VIEW
    // -------------------------------------------------------------------------
    function renderFirstTimeSetup() {
      const app = document.getElementById('appRoot');
      app.innerHTML = \`
        <div class="login-wrapper">
          <div class="login-card text-center">
            <h4 class="text-success fw-bold mb-2"><i class="bi bi-shield-check"></i> SYSTEM INITIAL SETUP</h4>
            <p class="text-muted small mb-4">No administrator account exists. Please create your administrator account first.</p>
            
            <form id="setupForm" onsubmit="handleSetupSubmit(event)">
              <div class="form-floating mb-3 text-start">
                <input type="text" class="form-control" id="setupName" placeholder="Admin Name" required>
                <label for="setupName">Admin Full Name</label>
              </div>
              <div class="form-floating mb-3 text-start">
                <input type="email" class="form-control" id="setupEmail" placeholder="name@example.com" required>
                <label for="setupEmail">Admin Email</label>
              </div>
              <div class="form-floating mb-3 text-start">
                <input type="password" class="form-control" id="setupPassword" placeholder="Password" required>
                <label for="setupPassword">Password</label>
              </div>
              <div class="form-floating mb-4 text-start">
                <input type="password" class="form-control" id="setupConfirmPassword" placeholder="Confirm Password" required>
                <label for="setupConfirmPassword">Confirm Password</label>
              </div>

              <div id="setupAlert" class="alert alert-danger d-none" role="alert"></div>

              <button type="submit" class="btn btn-primary-custom w-100 mb-3" id="btnSetup">
                <i class="bi bi-person-plus-fill"></i> CREATE ADMINISTRATOR ACCOUNT
              </button>
            </form>
          </div>
        </div>
      \`;
    }

    async function handleSetupSubmit(e) {
      e.preventDefault();
      const name = document.getElementById('setupName').value;
      const email = document.getElementById('setupEmail').value;
      const password = document.getElementById('setupPassword').value;
      const confirm_password = document.getElementById('setupConfirmPassword').value;
      const alertDiv = document.getElementById('setupAlert');
      const btn = document.getElementById('btnSetup');

      alertDiv.classList.add('d-none');
      btn.disabled = true;
      btn.innerHTML = 'Creating...';

      try {
        const res = await fetch('/api/setup/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, confirm_password })
        });
        const data = await res.json();

        if (res.ok) {
          alert('Administrator account created! You can now log in.');
          renderLogin();
        } else {
          alertDiv.innerText = data.error || 'Failed to create administrator.';
          alertDiv.classList.remove('d-none');
        }
      } catch {
        alertDiv.innerText = 'Server error. Please try again.';
        alertDiv.classList.remove('d-none');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-person-plus-fill"></i> CREATE ADMINISTRATOR ACCOUNT';
      }
    }

    // -------------------------------------------------------------------------
    // 2. LOGIN VIEW
    // -------------------------------------------------------------------------
    function renderLogin() {
      const logo = barangaySettings.logo_url || 'https://via.placeholder.com/100?text=Barangay+Logo';
      const brgyName = barangaySettings.barangay_name || 'BARANGAY CENTRAL';

      const app = document.getElementById('appRoot');
      app.innerHTML = \`
        <div class="login-wrapper">
          <div class="login-card text-center">
            <img src="\${logo}" class="branding-logo" alt="Barangay Logo">
            <h5 class="fw-bold text-success mb-1">\${brgyName.toUpperCase()}</h5>
            <p class="text-muted small mb-4">Resident Management Information System</p>

            <form id="loginForm" onsubmit="handleLoginSubmit(event)">
              <div class="form-floating mb-3 text-start">
                <input type="email" class="form-control" id="loginEmail" placeholder="name@example.com" required>
                <label for="loginEmail">Email Address</label>
              </div>
              <div class="form-floating mb-3 text-start position-relative">
                <input type="password" class="form-control" id="loginPassword" placeholder="Password" required>
                <label for="loginPassword">Password</label>
              </div>

              <div id="loginAlert" class="alert alert-danger d-none small p-2" role="alert"></div>

              <button type="submit" class="btn btn-primary-custom w-100 mb-3" id="btnLogin">
                <i class="bi bi-box-arrow-in-right"></i> LOG IN
              </button>
            </form>

            <hr class="my-3">

            <div class="d-flex justify-content-between text-muted small">
              <a href="#" onclick="renderResidentRegistration()" class="text-success fw-bold text-decoration-none">
                <i class="bi bi-person-plus"></i> Register as Resident
              </a>
              <a href="#" onclick="alert('Please contact the Barangay Hall administrator to reset your password.')" class="text-secondary text-decoration-none">
                Forgot Password?
              </a>
            </div>
          </div>
        </div>
      \`;
    }

    async function handleLoginSubmit(e) {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      const alertDiv = document.getElementById('loginAlert');
      const btn = document.getElementById('btnLogin');

      alertDiv.classList.add('d-none');
      btn.disabled = true;
      btn.innerHTML = 'Signing in...';

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (res.ok) {
          await checkSetupAndAuth();
        } else {
          alertDiv.innerText = data.error || 'Login failed.';
          alertDiv.classList.remove('d-none');
        }
      } catch {
        alertDiv.innerText = 'Network error. Please try again.';
        alertDiv.classList.remove('d-none');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> LOG IN';
      }
    }

    // -------------------------------------------------------------------------
    // 3. PUBLIC RESIDENT REGISTRATION VIEW
    // -------------------------------------------------------------------------
    function renderResidentRegistration() {
      const app = document.getElementById('appRoot');
      app.innerHTML = \`
        <div class="container py-5">
          <div class="row justify-content-center">
            <div class="col-lg-10">
              <div class="card shadow-lg border-0 rounded-4">
                <div class="card-header bg-success text-white p-4 rounded-top-4">
                  <div class="d-flex justify-content-between align-items-center">
                    <div>
                      <h4 class="fw-bold mb-0"><i class="bi bi-person-vcard"></i> BARANGAY RESIDENT REGISTRATION</h4>
                      <p class="mb-0 small text-white-50">Please provide accurate official personal information.</p>
                    </div>
                    <button class="btn btn-outline-light btn-sm" onclick="renderLogin()"><i class="bi bi-arrow-left"></i> Back to Login</button>
                  </div>
                </div>
                <div class="card-body p-4">
                  <form id="regForm" onsubmit="handleRegistrationSubmit(event)">
                    
                    <h6 class="text-success fw-bold border-bottom pb-2 mb-3">1. Personal Information</h6>
                    <div class="row g-3 mb-4">
                      <div class="col-md-3">
                        <label class="form-label">First Name *</label>
                        <input type="text" class="form-control" id="regFirstName" required>
                      </div>
                      <div class="col-md-3">
                        <label class="form-label">Middle Name</label>
                        <input type="text" class="form-control" id="regMiddleName">
                      </div>
                      <div class="col-md-4">
                        <label class="form-label">Last Name *</label>
                        <input type="text" class="form-control" id="regLastName" required>
                      </div>
                      <div class="col-md-2">
                        <label class="form-label">Suffix</label>
                        <input type="text" class="form-control" id="regSuffix" placeholder="Jr., Sr., III">
                      </div>

                      <div class="col-md-3">
                        <label class="form-label">Date of Birth *</label>
                        <input type="date" class="form-control" id="regBirthDate" required>
                      </div>
                      <div class="col-md-3">
                        <label class="form-label">Gender *</label>
                        <select class="form-select" id="regGender" required>
                          <option value="">Select...</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>
                      <div class="col-md-3">
                        <label class="form-label">Civil Status *</label>
                        <select class="form-select" id="regCivilStatus" required>
                          <option value="Single">Single</option>
                          <option value="Married">Married</option>
                          <option value="Widowed">Widowed</option>
                          <option value="Separated">Separated</option>
                        </select>
                      </div>
                      <div class="col-md-3">
                        <label class="form-label">Nationality</label>
                        <input type="text" class="form-control" id="regNationality" value="Filipino">
                      </div>
                    </div>

                    <h6 class="text-success fw-bold border-bottom pb-2 mb-3">2. Contact & Address Details</h6>
                    <div class="row g-3 mb-4">
                      <div class="col-md-4">
                        <label class="form-label">Purok *</label>
                        <select class="form-select" id="regPurok" required>
                          <option value="Purok 1">Purok 1</option>
                          <option value="Purok 2">Purok 2</option>
                          <option value="Purok 3">Purok 3</option>
                          <option value="Purok 4">Purok 4</option>
                          <option value="Purok 5">Purok 5</option>
                        </select>
                      </div>
                      <div class="col-md-8">
                        <label class="form-label">Complete Address *</label>
                        <input type="text" class="form-control" id="regAddress" placeholder="House No., Street Name" required>
                      </div>
                      <div class="col-md-6">
                        <label class="form-label">Contact Number *</label>
                        <input type="tel" class="form-control" id="regContact" required>
                      </div>
                      <div class="col-md-6">
                        <label class="form-label">Email Address *</label>
                        <input type="email" class="form-control" id="regEmail" required>
                      </div>
                    </div>

                    <h6 class="text-success fw-bold border-bottom pb-2 mb-3">3. Account & Verification</h6>
                    <div class="row g-3 mb-4">
                      <div class="col-md-6">
                        <label class="form-label">Upload Resident Photo (2x2 or ID photo)</label>
                        <input type="file" class="form-control" id="regPhoto" accept="image/*">
                      </div>
                      <div class="col-md-3">
                        <label class="form-label">PWD Status</label>
                        <select class="form-select" id="regPwd">
                          <option value="false">No</option>
                          <option value="true">Yes</option>
                        </select>
                      </div>
                      <div class="col-md-3">
                        <label class="form-label">Solo Parent</label>
                        <select class="form-select" id="regSoloParent">
                          <option value="false">No</option>
                          <option value="true">Yes</option>
                        </select>
                      </div>

                      <div class="col-md-6">
                        <label class="form-label">Password *</label>
                        <input type="password" class="form-control" id="regPassword" required>
                      </div>
                      <div class="col-md-6">
                        <label class="form-label">Confirm Password *</label>
                        <input type="password" class="form-control" id="regConfirmPassword" required>
                      </div>
                    </div>

                    <div id="regAlert" class="alert alert-danger d-none"></div>

                    <div class="d-flex justify-content-end gap-2">
                      <button type="button" class="btn btn-secondary" onclick="renderLogin()">Cancel</button>
                      <button type="submit" class="btn btn-primary-custom px-4" id="btnRegSubmit">
                        <i class="bi bi-send-check"></i> Submit Registration
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      \`;
    }

    async function handleRegistrationSubmit(e) {
      e.preventDefault();
      const alertDiv = document.getElementById('regAlert');
      const btn = document.getElementById('btnRegSubmit');

      alertDiv.classList.add('d-none');

      const formData = new FormData();
      formData.append('first_name', document.getElementById('regFirstName').value);
      formData.append('middle_name', document.getElementById('regMiddleName').value);
      formData.append('last_name', document.getElementById('regLastName').value);
      formData.append('suffix', document.getElementById('regSuffix').value);
      formData.append('birth_date', document.getElementById('regBirthDate').value);
      formData.append('gender', document.getElementById('regGender').value);
      formData.append('civil_status', document.getElementById('regCivilStatus').value);
      formData.append('nationality', document.getElementById('regNationality').value);
      formData.append('purok', document.getElementById('regPurok').value);
      formData.append('address', document.getElementById('regAddress').value);
      formData.append('contact_number', document.getElementById('regContact').value);
      formData.append('email', document.getElementById('regEmail').value);
      formData.append('is_pwd', document.getElementById('regPwd').value);
      formData.append('is_solo_parent', document.getElementById('regSoloParent').value);
      formData.append('password', document.getElementById('regPassword').value);
      formData.append('confirm_password', document.getElementById('regConfirmPassword').value);

      const photoInput = document.getElementById('regPhoto');
      if (photoInput.files[0]) {
        formData.append('photo', photoInput.files[0]);
      }

      btn.disabled = true;
      btn.innerHTML = 'Submitting...';

      try {
        const res = await fetch('/api/public/register', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();

        if (res.ok) {
          alert('Registration Submitted Successfully! Your application is now waiting for barangay staff review.');
          renderLogin();
        } else {
          alertDiv.innerText = data.error || 'Registration failed.';
          alertDiv.classList.remove('d-none');
        }
      } catch {
        alertDiv.innerText = 'Error submitting application.';
        alertDiv.classList.remove('d-none');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-send-check"></i> Submit Registration';
      }
    }

    // -------------------------------------------------------------------------
    // 4. STAFF PORTAL DASHBOARD & NAVIGATION
    // -------------------------------------------------------------------------
    function renderStaffPortal(view = 'dashboard') {
      const app = document.getElementById('appRoot');
      const logo = barangaySettings.logo_url || 'https://via.placeholder.com/50?text=Brgy';

      app.innerHTML = \`
        <div class="d-flex">
          <div class="app-sidebar p-3">
            <div class="text-center pb-3 border-bottom border-light-subtle mb-3">
              <img src="\${logo}" style="width:50px; height:50px; border-radius:50%; background:#fff;" class="mb-2">
              <h6 class="fw-bold mb-0 text-white">\${barangaySettings.barangay_name || 'BARANGAY CENTRAL'}</h6>
              <span class="badge bg-success mt-1">\${currentUser.role} PORTAL</span>
            </div>

            <nav class="nav flex-column">
              <a href="#" class="nav-link-custom \${view === 'dashboard' ? 'active' : ''}" onclick="renderStaffPortal('dashboard')">
                <i class="bi bi-speedometer2"></i> Dashboard
              </a>
              <a href="#" class="nav-link-custom \${view === 'residents' ? 'active' : ''}" onclick="renderStaffPortal('residents')">
                <i class="bi bi-people-fill"></i> Residents Management
              </a>
              <a href="#" class="nav-link-custom \${view === 'pending' ? 'active' : ''}" onclick="renderStaffPortal('pending')">
                <i class="bi bi-person-check-fill"></i> Pending Approvals
              </a>
              <a href="#" class="nav-link-custom \${view === 'certificates' ? 'active' : ''}" onclick="renderStaffPortal('certificates')">
                <i class="bi bi-file-earmark-text-fill"></i> Certificates
              </a>
              <a href="#" class="nav-link-custom \${view === 'qrscanner' ? 'active' : ''}" onclick="renderStaffPortal('qrscanner')">
                <i class="bi bi-qr-code-scan"></i> QR Claim Scanner
              </a>
              <a href="#" class="nav-link-custom \${view === 'households' ? 'active' : ''}" onclick="renderStaffPortal('households')">
                <i class="bi bi-house-door-fill"></i> Households
              </a>
              <a href="#" class="nav-link-custom \${view === 'blotter' ? 'active' : ''}" onclick="renderStaffPortal('blotter')">
                <i class="bi bi-shield-exclamation"></i> Blotter Records
              </a>
              <a href="#" class="nav-link-custom \${view === 'announcements' ? 'active' : ''}" onclick="renderStaffPortal('announcements')">
                <i class="bi bi-megaphone-fill"></i> Announcements
              </a>
              <a href="#" class="nav-link-custom \${view === 'businesses' ? 'active' : ''}" onclick="renderStaffPortal('businesses')">
                <i class="bi bi-building"></i> Businesses
              </a>
              <a href="#" class="nav-link-custom \${view === 'reports' ? 'active' : ''}" onclick="renderStaffPortal('reports')">
                <i class="bi bi-bar-chart-line-fill"></i> Reports
              </a>
              \${currentUser.role === 'ADMIN' ? \`
                <a href="#" class="nav-link-custom \${view === 'settings' ? 'active' : ''}" onclick="renderStaffPortal('settings')">
                  <i class="bi bi-gear-fill"></i> System Settings
                </a>
              \` : ''}
            </nav>

            <div class="position-absolute bottom-0 start-0 w-100 p-3 border-top border-light-subtle">
              <div class="d-flex align-items-center justify-content-between">
                <div class="small">
                  <div class="fw-bold">\${currentUser.name}</div>
                  <div class="text-white-50" style="font-size:0.75rem;">\${currentUser.email}</div>
                </div>
                <button class="btn btn-sm btn-outline-light" onclick="handleLogout()" title="Logout">
                  <i class="bi bi-box-arrow-right"></i>
                </button>
              </div>
            </div>
          </div>

          <div class="app-content w-100">
            <div id="staffMainView">Loading view...</div>
          </div>
        </div>
      \`;

      if (view === 'dashboard') loadStaffDashboardView();
      else if (view === 'residents') loadStaffResidentsView();
      else if (view === 'pending') loadStaffPendingResidentsView();
      else if (view === 'certificates') loadStaffCertificatesView();
      else if (view === 'qrscanner') loadStaffQRScannerView();
      else if (view === 'households') loadStaffHouseholdsView();
      else if (view === 'blotter') loadStaffBlotterView();
      else if (view === 'announcements') loadStaffAnnouncementsView();
      else if (view === 'businesses') loadStaffBusinessesView();
      else if (view === 'reports') loadStaffReportsView();
      else if (view === 'settings' && currentUser.role === 'ADMIN') loadAdminSettingsView();
    }

    async function loadStaffDashboardView() {
      const container = document.getElementById('staffMainView');
      container.innerHTML = '<div class="spinner-border text-success"></div>';

      try {
        const res = await fetch('/api/staff/stats');
        const stats = await res.json();

        container.innerHTML = \`
          <h4 class="fw-bold text-success mb-4"><i class="bi bi-speedometer2"></i> Administrative Overview</h4>
          
          <div class="row g-3 mb-4">
            <div class="col-md-3">
              <div class="card stat-card bg-primary text-white p-3">
                <div class="d-flex justify-content-between align-items-center">
                  <div>
                    <h6 class="mb-0 text-white-50">Total Residents</h6>
                    <h2 class="fw-bold mb-0">\${stats.totalResidents}</h2>
                  </div>
                  <i class="bi bi-people-fill fs-1 opacity-50"></i>
                </div>
              </div>
            </div>

            <div class="col-md-3">
              <div class="card stat-card bg-warning text-dark p-3">
                <div class="d-flex justify-content-between align-items-center">
                  <div>
                    <h6 class="mb-0 text-dark-50">Pending Approval</h6>
                    <h2 class="fw-bold mb-0">\${stats.pendingResidents}</h2>
                  </div>
                  <i class="bi bi-clock-history fs-1 opacity-50"></i>
                </div>
              </div>
            </div>

            <div class="col-md-3">
              <div class="card stat-card bg-success text-white p-3">
                <div class="d-flex justify-content-between align-items-center">
                  <div>
                    <h6 class="mb-0 text-white-50">Total Households</h6>
                    <h2 class="fw-bold mb-0">\${stats.totalHouseholds}</h2>
                  </div>
                  <i class="bi bi-house-door-fill fs-1 opacity-50"></i>
                </div>
              </div>
            </div>

            <div class="col-md-3">
              <div class="card stat-card bg-danger text-white p-3">
                <div class="d-flex justify-content-between align-items-center">
                  <div>
                    <h6 class="mb-0 text-white-50">Open Blotter Cases</h6>
                    <h2 class="fw-bold mb-0">\${stats.openBlotters}</h2>
                  </div>
                  <i class="bi bi-shield-exclamation fs-1 opacity-50"></i>
                </div>
              </div>
            </div>
          </div>

          <div class="row g-3 mb-4">
            <div class="col-md-3">
              <div class="card p-3 shadow-sm">
                <span class="text-muted small">Senior Citizens</span>
                <h4 class="fw-bold mb-0 text-success">\${stats.seniorCitizens}</h4>
              </div>
            </div>
            <div class="col-md-3">
              <div class="card p-3 shadow-sm">
                <span class="text-muted small">PWD Population</span>
                <h4 class="fw-bold mb-0 text-info">\${stats.pwdCount}</h4>
              </div>
            </div>
            <div class="col-md-3">
              <div class="card p-3 shadow-sm">
                <span class="text-muted small">Solo Parents</span>
                <h4 class="fw-bold mb-0 text-warning">\${stats.soloParents}</h4>
              </div>
            </div>
            <div class="col-md-3">
              <div class="card p-3 shadow-sm">
                <span class="text-muted small">Pending Certificates</span>
                <h4 class="fw-bold mb-0 text-primary">\${stats.pendingCertificates}</h4>
              </div>
            </div>
          </div>
        \`;
      } catch (err) {
        container.innerHTML = '<div class="alert alert-danger">Error loading dashboard stats.</div>';
      }
    }

    // -------------------------------------------------------------------------
    // 5. RESIDENTS MANAGEMENT & PRINTING (8 IDs ON 1 BOND PAPER)
    // -------------------------------------------------------------------------
    let selectedResidentIdsForPrint = [];

    async function loadStaffResidentsView() {
      const container = document.getElementById('staffMainView');
      container.innerHTML = \`
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h4 class="fw-bold text-success mb-0"><i class="bi bi-people-fill"></i> Approved Resident Directory</h4>
          <button class="btn btn-success btn-sm" onclick="printSelected8IDs()"><i class="bi bi-printer"></i> Print Selected IDs (8 on Bond Paper)</button>
        </div>

        <div class="card shadow-sm border-0 mb-4">
          <div class="card-body">
            <div class="row g-2">
              <div class="col-md-6">
                <input type="text" id="searchResInput" class="form-control" placeholder="Search by name or Resident ID..." onkeyup="filterResidents()">
              </div>
              <div class="col-md-3">
                <select id="purokResFilter" class="form-select" onchange="filterResidents()">
                  <option value="">All Puroks</option>
                  <option value="Purok 1">Purok 1</option>
                  <option value="Purok 2">Purok 2</option>
                  <option value="Purok 3">Purok 3</option>
                  <option value="Purok 4">Purok 4</option>
                  <option value="Purok 5">Purok 5</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div class="card shadow-sm border-0">
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th width="40"><input type="checkbox" onclick="toggleSelectAll(this)"></th>
                    <th>Resident ID</th>
                    <th>Full Name</th>
                    <th>Purok</th>
                    <th>Age / Gender</th>
                    <th>Status</th>
                    <th class="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody id="residentsTableBody">
                  <tr><td colspan="7" class="text-center py-4">Loading residents...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      \`;

      fetchAndRenderResidents();
    }

    async function fetchAndRenderResidents() {
      const tbody = document.getElementById('residentsTableBody');
      const search = document.getElementById('searchResInput') ? document.getElementById('searchResInput').value : '';
      const purok = document.getElementById('purokResFilter') ? document.getElementById('purokResFilter').value : '';

      try {
        const res = await fetch(\`/api/staff/residents?approval_status=Approved&search=\${encodeURIComponent(search)}&purok=\${encodeURIComponent(purok)}\`);
        const data = await res.json();

        if (data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No approved residents found.</td></tr>';
          return;
        }

        tbody.innerHTML = data.map(r => \`
          <tr>
            <td><input type="checkbox" class="res-checkbox" value="\${r.id}" data-json='\${JSON.stringify(r)}'></td>
            <td class="fw-bold text-success">\${r.resident_id || 'N/A'}</td>
            <td>
              <div class="d-flex align-items-center gap-2">
                <img src="\${r.photo || 'https://via.placeholder.com/40'}" style="width:35px; height:35px; border-radius:50%; object-fit:cover;">
                <div>
                  <div class="fw-bold">\${r.first_name} \${r.last_name}</div>
                  <div class="text-muted small">\${r.email}</div>
                </div>
              </div>
            </td>
            <td>\${r.purok}</td>
            <td>\${r.age} / \${r.gender}</td>
            <td><span class="badge bg-success">\${r.resident_status}</span></td>
            <td class="text-end">
              <button class="btn btn-outline-primary btn-sm me-1" onclick="previewDigitalID('\${r.id}')"><i class="bi bi-card-heading"></i> ID Card</button>
              <button class="btn btn-outline-danger btn-sm" onclick="archiveResident('\${r.id}', '\${r.first_name} \${r.last_name}')"><i class="bi bi-archive"></i> Archive</button>
            </td>
          </tr>
        \`).join('');
      } catch {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-danger">Error loading residents.</td></tr>';
      }
    }

    function filterResidents() {
      fetchAndRenderResidents();
    }

    function toggleSelectAll(master) {
      document.querySelectorAll('.res-checkbox').forEach(cb => cb.checked = master.checked);
    }

    async function archiveResident(id, name) {
      if (!confirm(\`Are you sure you want to archive resident "\${name}"? They will no longer appear in the active list.\`)) return;

      try {
        const res = await fetch(\`/api/staff/residents/\${id}/status\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Archived' })
        });
        if (res.ok) {
          alert('Resident archived successfully.');
          fetchAndRenderResidents();
        }
      } catch {
        alert('Failed to archive resident.');
      }
    }

    // Preview Single ID
    async function previewDigitalID(residentId) {
      try {
        const res = await fetch(\`/api/staff/residents/\${residentId}\`);
        const r = await res.json();

        const qrUrl = \`/api/qr/generate?text=\${encodeURIComponent(r.qr_token || 'INVALID')}\`;
        const logo = barangaySettings.logo_url || 'https://via.placeholder.com/50';

        const modalHtml = \`
          <div class="modal fade" id="idModal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title fw-bold text-success"><i class="bi bi-card-heading"></i> Digital Barangay ID</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body text-center">
                  
                  <div class="id-card-wrapper text-start">
                    <div class="id-header d-flex align-items-center gap-2">
                      <img src="\${logo}" style="width:30px; height:30px; object-fit:contain;">
                      <div>
                        <div class="fw-bold text-success" style="font-size:0.7rem; line-height:1;">\${barangaySettings.barangay_name || 'BARANGAY CENTRAL'}</div>
                        <div class="text-muted" style="font-size:0.55rem;">BARANGAY IDENTIFICATION CARD</div>
                      </div>
                    </div>
                    <div class="d-flex gap-2 align-items-center">
                      <img src="\${r.photo || 'https://via.placeholder.com/75'}" class="id-photo">
                      <div style="font-size:0.65rem; line-height:1.2;">
                        <div class="fw-bold text-uppercase">\${r.first_name} \${r.last_name}</div>
                        <div class="text-danger fw-bold">\${r.resident_id}</div>
                        <div>DOB: \${r.birth_date} | \${r.gender}</div>
                        <div>Address: \${r.purok}, \${r.address}</div>
                      </div>
                      <img src="\${qrUrl}" class="id-qr ms-auto">
                    </div>
                  </div>

                </div>
                <div class="modal-footer">
                  <button class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                  <button class="btn btn-success" onclick="window.print()"><i class="bi bi-printer"></i> Print ID</button>
                </div>
              </div>
            </div>
          </div>
        \`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = new bootstrap.Modal(document.getElementById('idModal'));
        modal.show();
        document.getElementById('idModal').addEventListener('hidden.bs.modal', function () {
          this.remove();
        });
      } catch (err) {
        alert('Failed to load ID preview.');
      }
    }

    // PRINT 8 IDs ON 1 BOND PAPER
    function printSelected8IDs() {
      const selected = Array.from(document.querySelectorAll('.res-checkbox:checked')).map(cb => JSON.parse(cb.getAttribute('data-json')));
      
      if (selected.length === 0) {
        alert('Please select at least 1 resident to print IDs.');
        return;
      }

      if (selected.length > 8) {
        alert('Maximum 8 IDs can fit on one bond paper. Printing first 8 selected.');
      }

      const printItems = selected.slice(0, 8);
      const logo = barangaySettings.logo_url || 'https://via.placeholder.com/50';

      const printArea = document.getElementById('printArea');
      printArea.classList.remove('d-none');
      printArea.innerHTML = \`
        <div class="print-grid">
          \${printItems.map(r => \`
            <div class="id-card-wrapper text-start">
              <div class="id-header d-flex align-items-center gap-2">
                <img src="\${logo}" style="width:28px; height:28px; object-fit:contain;">
                <div>
                  <div class="fw-bold text-success" style="font-size:0.65rem; line-height:1;">\${barangaySettings.barangay_name || 'BARANGAY CENTRAL'}</div>
                  <div class="text-muted" style="font-size:0.5rem;">BARANGAY IDENTIFICATION CARD</div>
                </div>
              </div>
              <div class="d-flex gap-2 align-items-center">
                <img src="\${r.photo || 'https://via.placeholder.com/75'}" class="id-photo">
                <div style="font-size:0.6rem; line-height:1.2;">
                  <div class="fw-bold text-uppercase">\${r.first_name} \${r.last_name}</div>
                  <div class="text-danger fw-bold">\${r.resident_id}</div>
                  <div>DOB: \${r.birth_date} | \${r.gender}</div>
                  <div>Address: \${r.purok}</div>
                </div>
                <img src="/api/qr/generate?text=\${encodeURIComponent(r.qr_token || 'INVALID')}" class="id-qr ms-auto">
              </div>
            </div>
          \`).join('')}
        </div>
      \`;

      window.print();
      printArea.classList.add('d-none');
    }

    // -------------------------------------------------------------------------
    // 6. PENDING RESIDENTS APPROVAL VIEW
    // -------------------------------------------------------------------------
    async function loadStaffPendingResidentsView() {
      const container = document.getElementById('staffMainView');
      container.innerHTML = \`
        <h4 class="fw-bold text-success mb-3"><i class="bi bi-person-check-fill"></i> Pending Resident Registrations</h4>
        <div class="card shadow-sm border-0">
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th>Applicant Name</th>
                    <th>Contact & Email</th>
                    <th>Address / Purok</th>
                    <th>Date Submitted</th>
                    <th class="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody id="pendingTableBody">
                  <tr><td colspan="5" class="text-center py-4">Loading pending applications...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      \`;

      try {
        const res = await fetch('/api/staff/residents?approval_status=Pending');
        const data = await res.json();

        const tbody = document.getElementById('pendingTableBody');
        if (data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No pending resident applications found.</td></tr>';
          return;
        }

        tbody.innerHTML = data.map(r => \`
          <tr>
            <td class="fw-bold">\${r.first_name} \${r.last_name}</td>
            <td>
              <div>\${r.contact_number}</div>
              <div class="text-muted small">\${r.email}</div>
            </td>
            <td>\${r.purok}, \${r.address}</td>
            <td>\${new Date(r.created_at).toLocaleDateString()}</td>
            <td class="text-end">
              <button class="btn btn-success btn-sm me-1" onclick="approveResident('\${r.id}')"><i class="bi bi-check-circle"></i> Approve</button>
              <button class="btn btn-danger btn-sm" onclick="rejectResidentPrompt('\${r.id}')"><i class="bi bi-x-circle"></i> Reject</button>
            </td>
          </tr>
        \`).join('');
      } catch {
        document.getElementById('pendingTableBody').innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger">Error loading data.</td></tr>';
      }
    }

    async function approveResident(id) {
      if (!confirm('Approve this resident application? An official Resident ID and QR Code will be generated.')) return;

      try {
        const res = await fetch(\`/api/staff/residents/\${id}/approve\`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          alert('Resident approved successfully!');
          loadStaffPendingResidentsView();
        } else {
          alert(data.error || 'Failed to approve resident.');
        }
      } catch {
        alert('Server error.');
      }
    }

    async function rejectResidentPrompt(id) {
      const reason = prompt('Please enter the reason for rejection:');
      if (!reason) return;

      try {
        const res = await fetch(\`/api/staff/residents/\${id}/reject\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })
        });
        if (res.ok) {
          alert('Resident application rejected.');
          loadStaffPendingResidentsView();
        }
      } catch {
        alert('Server error.');
      }
    }

    // -------------------------------------------------------------------------
    // 7. CERTIFICATE MANAGEMENT & UPLOAD
    // -------------------------------------------------------------------------
    async function loadStaffCertificatesView() {
      const container = document.getElementById('staffMainView');
      container.innerHTML = \`
        <h4 class="fw-bold text-success mb-3"><i class="bi bi-file-earmark-text-fill"></i> Certificate Requests Management</h4>
        <div class="card shadow-sm border-0">
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th>Req No.</th>
                    <th>Resident Name</th>
                    <th>Certificate Type</th>
                    <th>Purpose</th>
                    <th>Status</th>
                    <th class="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody id="certTableBody">
                  <tr><td colspan="6" class="text-center py-4">Loading requests...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      \`;

      try {
        const res = await fetch('/api/staff/certificates/requests');
        const data = await res.json();

        const tbody = document.getElementById('certTableBody');
        if (data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No certificate requests found.</td></tr>';
          return;
        }

        tbody.innerHTML = data.map(c => \`
          <tr>
            <td class="fw-bold text-success">\${c.request_number}</td>
            <td>\${c.residents ? c.residents.first_name + ' ' + c.residents.last_name : 'N/A'}</td>
            <td>\${c.certificate_type}</td>
            <td>\${c.purpose}</td>
            <td><span class="badge bg-info">\${c.status}</span></td>
            <td class="text-end">
              \${c.status === 'Pending' ? \`
                <button class="btn btn-success btn-sm me-1" onclick="openApproveCertModal('\${c.id}')"><i class="bi bi-upload"></i> Approve & Upload</button>
                <button class="btn btn-outline-danger btn-sm" onclick="rejectCertPrompt('\${c.id}')">Reject</button>
              \` : ''}
              \${c.status === 'Ready for Release' ? \`
                <button class="btn btn-primary btn-sm" onclick="markCertClaimed('\${c.id}')"><i class="bi bi-check2-circle"></i> Mark Claimed</button>
              \` : ''}
            </td>
          </tr>
        \`).join('');
      } catch {
        document.getElementById('certTableBody').innerHTML = '<tr><td colspan="6" class="text-center py-4 text-danger">Error loading requests.</td></tr>';
      }
    }

    function openApproveCertModal(reqId) {
      const modalHtml = \`
        <div class="modal fade" id="approveCertModal" tabindex="-1">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title fw-bold text-success">Approve Certificate & Upload Official File</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <form id="approveCertForm" onsubmit="handleApproveCertSubmit(event, '\${reqId}')">
                  <div class="mb-3">
                    <label class="form-label">Attach Official Document PDF / Image (Optional)</label>
                    <input type="file" class="form-control" id="certFile">
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Staff Remarks</label>
                    <textarea class="form-control" id="certRemarks" rows="3" placeholder="Instructions for release..."></textarea>
                  </div>
                  <button type="submit" class="btn btn-success w-100">Approve & Mark Ready for Release</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      \`;

      document.body.insertAdjacentHTML('beforeend', modalHtml);
      const modal = new bootstrap.Modal(document.getElementById('approveCertModal'));
      modal.show();
      document.getElementById('approveCertModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
      });
    }

    async function handleApproveCertSubmit(e, reqId) {
      e.preventDefault();
      const formData = new FormData();
      const fileInput = document.getElementById('certFile');
      if (fileInput.files[0]) formData.append('file', fileInput.files[0]);
      formData.append('remarks', document.getElementById('certRemarks').value);

      try {
        const res = await fetch(\`/api/staff/certificates/requests/\${reqId}/approve\`, {
          method: 'POST',
          body: formData
        });
        if (res.ok) {
          alert('Certificate approved!');
          bootstrap.Modal.getInstance(document.getElementById('approveCertModal')).hide();
          loadStaffCertificatesView();
        }
      } catch {
        alert('Error approving certificate.');
      }
    }

    async function markCertClaimed(reqId) {
      if (!confirm('Mark this certificate as officially CLAIMED by the resident?')) return;
      try {
        const res = await fetch(\`/api/staff/certificates/requests/\${reqId}/claim\`, { method: 'POST' });
        if (res.ok) {
          alert('Certificate status updated to CLAIMED.');
          loadStaffCertificatesView();
        }
      } catch {
        alert('Server error.');
      }
    }

    // -------------------------------------------------------------------------
    // 8. QR SCANNER FOR CERTIFICATE CLAIMING
    // -------------------------------------------------------------------------
    function loadStaffQRScannerView() {
      const container = document.getElementById('staffMainView');
      container.innerHTML = \`
        <h4 class="fw-bold text-success mb-3"><i class="bi bi-qr-code-scan"></i> QR Claim & Verification Terminal</h4>
        <div class="row g-4">
          <div class="col-md-5">
            <div class="card shadow-sm border-0 p-3 text-center">
              <h6 class="fw-bold text-success mb-3">Scan Resident QR Code</h6>
              <div id="reader" style="width: 100%;"></div>
              <hr>
              <label class="form-label text-muted small">Or Enter Verification Token Manually:</label>
              <div class="input-group">
                <input type="text" id="manualTokenInput" class="form-control" placeholder="BRGY-VERIFY-...">
                <button class="btn btn-success" onclick="verifyQRToken(document.getElementById('manualTokenInput').value)">Verify</button>
              </div>
            </div>
          </div>

          <div class="col-md-7">
            <div class="card shadow-sm border-0 p-4" id="qrResultCard">
              <div class="text-center text-muted py-5">
                <i class="bi bi-qr-code fs-1 d-block mb-2"></i>
                Scan a QR code or enter token to display resident identity and claimable certificates.
              </div>
            </div>
          </div>
        </div>
      \`;

      try {
        const html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } });
        html5QrcodeScanner.render((decodedText) => {
          verifyQRToken(decodedText);
        });
      } catch {
        console.warn('QR Camera initialization fallback.');
      }
    }

    async function verifyQRToken(token) {
      if (!token) return;
      const resultCard = document.getElementById('qrResultCard');
      resultCard.innerHTML = '<div class="spinner-border text-success"></div>';

      try {
        const res = await fetch(\`/api/verify/token/\${encodeURIComponent(token)}\`);
        const data = await res.json();

        if (!data.valid) {
          resultCard.innerHTML = \`
            <div class="alert alert-danger">
              <h5 class="fw-bold"><i class="bi bi-x-circle"></i> VERIFICATION FAILED</h5>
              <p class="mb-0">\${data.message || 'Invalid or unrecognized QR token.'}</p>
            </div>
          \`;
          return;
        }

        const r = data.resident;
        const claims = data.readyCertificates || [];

        resultCard.innerHTML = \`
          <div class="alert alert-success d-flex align-items-center gap-2 mb-3">
            <i class="bi bi-check-circle-fill fs-4"></i>
            <div>
              <h6 class="fw-bold mb-0">RESIDENT VERIFIED ACTIVE</h6>
              <span class="small">\${data.barangay} Official Record</span>
            </div>
          </div>

          <div class="d-flex align-items-center gap-3 mb-4 border-bottom pb-3">
            <img src="\${r.photo || 'https://via.placeholder.com/80'}" style="width:70px; height:70px; border-radius:10px; object-fit:cover;">
            <div>
              <h5 class="fw-bold mb-0">\${r.name}</h5>
              <div class="text-danger fw-bold">\${r.resident_id}</div>
              <div class="text-muted small">Purok: \${r.purok} | Address: \${r.address}</div>
            </div>
          </div>

          <h6 class="fw-bold text-success mb-2"><i class="bi bi-box-seam"></i> Pending Certificate Claims</h6>
          \${claims.length === 0 ? \`
            <p class="text-muted small">No certificates currently ready for release for this resident.</p>
          \` : \`
            <ul class="list-group">
              \${claims.map(c => \`
                <li class="list-group-item d-flex justify-content-between align-items-center">
                  <div>
                    <div class="fw-bold">\${c.certificate_type}</div>
                    <div class="small text-muted">Req #: \${c.request_number} | Purpose: \${c.purpose}</div>
                  </div>
                  <button class="btn btn-primary btn-sm" onclick="markCertClaimed('\${c.id}')"><i class="bi bi-check-lg"></i> Mark Claimed</button>
                </li>
              \`).join('')}
            </ul>
          \`}
        \`;
      } catch {
        resultCard.innerHTML = '<div class="alert alert-danger">Error verifying token.</div>';
      }
    }

    // -------------------------------------------------------------------------
    // 9. HOUSEHOLDS MANAGEMENT
    // -------------------------------------------------------------------------
    async function loadStaffHouseholdsView() {
      const container = document.getElementById('staffMainView');
      container.innerHTML = \`
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h4 class="fw-bold text-success mb-0"><i class="bi bi-house-door-fill"></i> Household Directory</h4>
          <button class="btn btn-success btn-sm" onclick="openAddHouseholdModal()"><i class="bi bi-plus-lg"></i> Add Household</button>
        </div>

        <div class="card shadow-sm border-0">
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th>Household #</th>
                    <th>Head of Household</th>
                    <th>Purok</th>
                    <th>Address</th>
                    <th>Members</th>
                  </tr>
                </thead>
                <tbody id="householdsTableBody">
                  <tr><td colspan="5" class="text-center py-4">Loading households...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      \`;

      try {
        const res = await fetch('/api/staff/households');
        const data = await res.json();

        const tbody = document.getElementById('householdsTableBody');
        if (data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No households registered.</td></tr>';
          return;
        }

        tbody.innerHTML = data.map(h => \`
          <tr>
            <td class="fw-bold text-success">\${h.household_number}</td>
            <td>\${h.household_head}</td>
            <td>\${h.purok}</td>
            <td>\${h.address}</td>
            <td><span class="badge bg-secondary">\${h.members || 1}</span></td>
          </tr>
        \`).join('');
      } catch {
        document.getElementById('householdsTableBody').innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger">Error loading data.</td></tr>';
      }
    }

    function openAddHouseholdModal() {
      const modalHtml = \`
        <div class="modal fade" id="hhModal" tabindex="-1">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title fw-bold text-success">Add New Household</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <form id="hhForm" onsubmit="handleAddHouseholdSubmit(event)">
                  <div class="mb-3">
                    <label class="form-label">Household Number *</label>
                    <input type="text" class="form-control" id="hhNum" required placeholder="HH-2026-001">
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Head of Household *</label>
                    <input type="text" class="form-control" id="hhHead" required>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Purok *</label>
                    <select class="form-select" id="hhPurok" required>
                      <option value="Purok 1">Purok 1</option>
                      <option value="Purok 2">Purok 2</option>
                      <option value="Purok 3">Purok 3</option>
                    </select>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Address *</label>
                    <input type="text" class="form-control" id="hhAddress" required>
                  </div>
                  <button type="submit" class="btn btn-success w-100">Save Household</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      \`;

      document.body.insertAdjacentHTML('beforeend', modalHtml);
      const modal = new bootstrap.Modal(document.getElementById('hhModal'));
      modal.show();
      document.getElementById('hhModal').addEventListener('hidden.bs.modal', function () { this.remove(); });
    }

    async function handleAddHouseholdSubmit(e) {
      e.preventDefault();
      const payload = {
        household_number: document.getElementById('hhNum').value,
        household_head: document.getElementById('hhHead').value,
        purok: document.getElementById('hhPurok').value,
        address: document.getElementById('hhAddress').value
      };

      try {
        const res = await fetch('/api/staff/households', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          alert('Household added successfully!');
          bootstrap.Modal.getInstance(document.getElementById('hhModal')).hide();
          loadStaffHouseholdsView();
        }
      } catch {
        alert('Server error.');
      }
    }

    // -------------------------------------------------------------------------
    // 10. BLOTTER RECORDS
    // -------------------------------------------------------------------------
    async function loadStaffBlotterView() {
      const container = document.getElementById('staffMainView');
      container.innerHTML = \`
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h4 class="fw-bold text-success mb-0"><i class="bi bi-shield-exclamation"></i> Incident & Blotter Cases</h4>
          <button class="btn btn-danger btn-sm" onclick="openAddBlotterModal()"><i class="bi bi-plus-lg"></i> File Incident / Blotter</button>
        </div>

        <div class="card shadow-sm border-0">
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th>Case #</th>
                    <th>Complainant vs Respondent</th>
                    <th>Incident Date</th>
                    <th>Location</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody id="blotterTableBody">
                  <tr><td colspan="5" class="text-center py-4">Loading blotter cases...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      \`;

      try {
        const res = await fetch('/api/staff/blotter');
        const data = await res.json();

        const tbody = document.getElementById('blotterTableBody');
        if (data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No blotter cases recorded.</td></tr>';
          return;
        }

        tbody.innerHTML = data.map(b => \`
          <tr>
            <td class="fw-bold text-danger">\${b.case_number}</td>
            <td>
              <div class="fw-bold">\${b.complainant}</div>
              <div class="text-muted small">vs. \${b.respondent}</div>
            </td>
            <td>\${new Date(b.incident_date).toLocaleDateString()}</td>
            <td>\${b.incident_location}</td>
            <td><span class="badge bg-danger">\${b.status}</span></td>
          </tr>
        \`).join('');
      } catch {
        document.getElementById('blotterTableBody').innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger">Error loading data.</td></tr>';
      }
    }

    function openAddBlotterModal() {
      const modalHtml = \`
        <div class="modal fade" id="blotterModal" tabindex="-1">
          <div class="modal-dialog modal-lg">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title fw-bold text-danger">File New Blotter Incident</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <form id="blotterForm" onsubmit="handleAddBlotterSubmit(event)">
                  <div class="row g-3">
                    <div class="col-md-6">
                      <label class="form-label">Complainant *</label>
                      <input type="text" class="form-control" id="bComplainant" required>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label">Respondent *</label>
                      <input type="text" class="form-control" id="bRespondent" required>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label">Incident Date & Time *</label>
                      <input type="datetime-local" class="form-control" id="bDate" required>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label">Incident Location *</label>
                      <input type="text" class="form-control" id="bLocation" required>
                    </div>
                    <div class="col-md-12">
                      <label class="form-label">Incident Narrative / Description *</label>
                      <textarea class="form-control" id="bDesc" rows="3" required></textarea>
                    </div>
                  </div>
                  <button type="submit" class="btn btn-danger w-100 mt-3">File Blotter Case</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      \`;

      document.body.insertAdjacentHTML('beforeend', modalHtml);
      const modal = new bootstrap.Modal(document.getElementById('blotterModal'));
      modal.show();
      document.getElementById('blotterModal').addEventListener('hidden.bs.modal', function () { this.remove(); });
    }

    async function handleAddBlotterSubmit(e) {
      e.preventDefault();
      const payload = {
        complainant: document.getElementById('bComplainant').value,
        respondent: document.getElementById('bRespondent').value,
        incident_date: document.getElementById('bDate').value,
        incident_location: document.getElementById('bLocation').value,
        description: document.getElementById('bDesc').value
      };

      try {
        const res = await fetch('/api/staff/blotter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          alert('Blotter case recorded!');
          bootstrap.Modal.getInstance(document.getElementById('blotterModal')).hide();
          loadStaffBlotterView();
        }
      } catch {
        alert('Error filing blotter.');
      }
    }

    // -------------------------------------------------------------------------
    // 11. ANNOUNCEMENTS & BUSINESSES & REPORTS
    // -------------------------------------------------------------------------
    async function loadStaffAnnouncementsView() {
      const container = document.getElementById('staffMainView');
      container.innerHTML = \`
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h4 class="fw-bold text-success mb-0"><i class="bi bi-megaphone-fill"></i> Community Announcements</h4>
          <button class="btn btn-success btn-sm" onclick="openAddAnnouncementModal()"><i class="bi bi-plus-lg"></i> Post Announcement</button>
        </div>
        <div id="announcementsList" class="row g-3">Loading announcements...</div>
      \`;

      try {
        const res = await fetch('/api/announcements');
        const data = await res.json();

        const list = document.getElementById('announcementsList');
        if (data.length === 0) {
          list.innerHTML = '<div class="col-12 text-muted">No announcements posted yet.</div>';
          return;
        }

        list.innerHTML = data.map(a => \`
          <div class="col-md-6">
            <div class="card shadow-sm border-0 h-100">
              \${a.image ? \`<img src="\${a.image}" class="card-img-top" style="height:180px; object-fit:cover;">\` : ''}
              <div class="card-body">
                <h5 class="fw-bold text-success">\${a.title}</h5>
                <p class="card-text text-secondary">\${a.content}</p>
                <div class="text-muted small">Posted by \${a.author} on \${new Date(a.published_at).toLocaleDateString()}</div>
              </div>
            </div>
          </div>
        \`).join('');
      } catch {
        document.getElementById('announcementsList').innerHTML = '<div class="text-danger">Error loading announcements.</div>';
      }
    }

    function openAddAnnouncementModal() {
      const modalHtml = \`
        <div class="modal fade" id="ancModal" tabindex="-1">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title fw-bold text-success">Post Official Announcement</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <form id="ancForm" onsubmit="handleAddAnnouncementSubmit(event)">
                  <div class="mb-3">
                    <label class="form-label">Title *</label>
                    <input type="text" class="form-control" id="ancTitle" required>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Content *</label>
                    <textarea class="form-control" id="ancContent" rows="4" required></textarea>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Banner Image (Optional)</label>
                    <input type="file" class="form-control" id="ancImage" accept="image/*">
                  </div>
                  <button type="submit" class="btn btn-success w-100">Publish Announcement</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      \`;

      document.body.insertAdjacentHTML('beforeend', modalHtml);
      const modal = new bootstrap.Modal(document.getElementById('ancModal'));
      modal.show();
      document.getElementById('ancModal').addEventListener('hidden.bs.modal', function () { this.remove(); });
    }

    async function handleAddAnnouncementSubmit(e) {
      e.preventDefault();
      const formData = new FormData();
      formData.append('title', document.getElementById('ancTitle').value);
      formData.append('content', document.getElementById('ancContent').value);
      const img = document.getElementById('ancImage');
      if (img.files[0]) formData.append('image', img.files[0]);

      try {
        const res = await fetch('/api/staff/announcements', { method: 'POST', body: formData });
        if (res.ok) {
          alert('Announcement published!');
          bootstrap.Modal.getInstance(document.getElementById('ancModal')).hide();
          loadStaffAnnouncementsView();
        }
      } catch {
        alert('Error publishing announcement.');
      }
    }

    async function loadStaffBusinessesView() {
      const container = document.getElementById('staffMainView');
      container.innerHTML = '<h4 class="fw-bold text-success mb-3"><i class="bi bi-building"></i> Registered Barangay Businesses</h4><div id="bizContent">Loading...</div>';

      try {
        const res = await fetch('/api/staff/businesses');
        const data = await res.json();
        const content = document.getElementById('bizContent');

        if (data.length === 0) {
          content.innerHTML = '<p class="text-muted">No registered businesses found.</p>';
          return;
        }

        content.innerHTML = \`
          <table class="table table-hover align-middle">
            <thead class="table-light">
              <tr>
                <th>Business Name</th>
                <th>Owner</th>
                <th>Permit #</th>
                <th>Expiration</th>
              </tr>
            </thead>
            <tbody>
              \${data.map(b => \`
                <tr>
                  <td class="fw-bold">\${b.business_name}</td>
                  <td>\${b.owner}</td>
                  <td>\${b.permit_number}</td>
                  <td>\${b.expiration_date}</td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        \`;
      } catch {
        document.getElementById('bizContent').innerHTML = '<p class="text-danger">Error loading data.</p>';
      }
    }

    async function loadStaffReportsView() {
      const container = document.getElementById('staffMainView');
      container.innerHTML = '<h4 class="fw-bold text-success mb-3"><i class="bi bi-bar-chart-line-fill"></i> System Reports & Demographics</h4><div id="repContent">Loading statistics...</div>';

      try {
        const res = await fetch('/api/staff/reports');
        const r = await res.json();

        document.getElementById('repContent').innerHTML = \`
          <div class="row g-3 mb-4">
            <div class="col-md-4">
              <div class="card p-3 shadow-sm">
                <h6>Total Approved Population</h6>
                <h3 class="fw-bold text-success">\${r.approvedResidents}</h3>
              </div>
            </div>
            <div class="col-md-4">
              <div class="card p-3 shadow-sm">
                <h6>Registered Households</h6>
                <h3 class="fw-bold text-primary">\${r.totalHouseholds}</h3>
              </div>
            </div>
            <div class="col-md-4">
              <div class="card p-3 shadow-sm">
                <h6>Registered Voters</h6>
                <h3 class="fw-bold text-info">\${r.voters}</h3>
              </div>
            </div>
          </div>
          <button class="btn btn-success" onclick="window.print()"><i class="bi bi-printer"></i> Print Demographics Report</button>
        \`;
      } catch {
        document.getElementById('repContent').innerHTML = '<p class="text-danger">Error generating report.</p>';
      }
    }

    async function loadAdminSettingsView() {
      const container = document.getElementById('staffMainView');
      container.innerHTML = \`
        <h4 class="fw-bold text-success mb-3"><i class="bi bi-gear-fill"></i> Barangay Customization & Settings</h4>
        <div class="card shadow-sm border-0 p-4">
          <form id="settingsForm" onsubmit="handleSettingsSubmit(event)">
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">Barangay Name *</label>
                <input type="text" class="form-control" id="stBrgyName" value="\${barangaySettings.barangay_name || ''}" required>
              </div>
              <div class="col-md-3">
                <label class="form-label">Municipality / City *</label>
                <input type="text" class="form-control" id="stMunicipality" value="\${barangaySettings.municipality || ''}" required>
              </div>
              <div class="col-md-3">
                <label class="form-label">Province *</label>
                <input type="text" class="form-control" id="stProvince" value="\${barangaySettings.province || ''}" required>
              </div>
              <div class="col-md-6">
                <label class="form-label">Official Barangay Address</label>
                <input type="text" class="form-control" id="stAddress" value="\${barangaySettings.address || ''}">
              </div>
              <div class="col-md-3">
                <label class="form-label">Contact Number</label>
                <input type="text" class="form-control" id="stContact" value="\${barangaySettings.contact_number || ''}">
              </div>
              <div class="col-md-3">
                <label class="form-label">Email Address</label>
                <input type="email" class="form-control" id="stEmail" value="\${barangaySettings.email || ''}">
              </div>
              <div class="col-md-12">
                <label class="form-label">Upload Official Barangay Logo</label>
                <input type="file" class="form-control" id="stLogo" accept="image/*">
              </div>
            </div>
            <button type="submit" class="btn btn-success mt-4">Save Configuration</button>
          </form>
        </div>
      \`;
    }

    async function handleSettingsSubmit(e) {
      e.preventDefault();
      const formData = new FormData();
      formData.append('barangay_name', document.getElementById('stBrgyName').value);
      formData.append('municipality', document.getElementById('stMunicipality').value);
      formData.append('province', document.getElementById('stProvince').value);
      formData.append('address', document.getElementById('stAddress').value);
      formData.append('contact_number', document.getElementById('stContact').value);
      formData.append('email', document.getElementById('stEmail').value);
      formData.append('existing_logo', barangaySettings.logo_url || '');

      const logoInput = document.getElementById('stLogo');
      if (logoInput.files[0]) formData.append('logo', logoInput.files[0]);

      try {
        const res = await fetch('/api/admin/settings', { method: 'POST', body: formData });
        if (res.ok) {
          alert('Barangay settings updated!');
          location.reload();
        }
      } catch {
        alert('Failed to update settings.');
      }
    }

    // -------------------------------------------------------------------------
    // 12. RESIDENT PORTAL VIEW
    // -------------------------------------------------------------------------
    function renderResidentPortal(view = 'dashboard') {
      const app = document.getElementById('appRoot');
      const logo = barangaySettings.logo_url || 'https://via.placeholder.com/50';

      app.innerHTML = \`
        <nav class="navbar navbar-expand-lg navbar-dark bg-success sticky-top shadow-sm">
          <div class="container">
            <a class="navbar-brand d-flex align-items-center gap-2" href="#">
              <img src="\${logo}" style="width:40px; height:40px; border-radius:50%; background:#fff;">
              <span class="fw-bold">\${barangaySettings.barangay_name || 'BARANGAY CENTRAL'} RESIDENT PORTAL</span>
            </a>
            <div class="d-flex align-items-center gap-3">
              <span class="text-white small">Welcome, <strong>\${currentUser.name}</strong></span>
              <button class="btn btn-outline-light btn-sm" onclick="handleLogout()"><i class="bi bi-box-arrow-right"></i> Logout</button>
            </div>
          </div>
        </nav>

        <div class="container py-4">
          <div class="row g-4">
            <div class="col-lg-4">
              <!-- Digital ID Card Container -->
              <div class="card shadow-sm border-0 text-center p-3 mb-3">
                <h6 class="fw-bold text-success mb-2"><i class="bi bi-card-heading"></i> MY DIGITAL BARANGAY ID</h6>
                \${currentResident && currentResident.approval_status === 'Approved' ? \`
                  <div class="id-card-wrapper text-start mx-auto">
                    <div class="id-header d-flex align-items-center gap-2">
                      <img src="\${logo}" style="width:28px; height:28px; object-fit:contain;">
                      <div>
                        <div class="fw-bold text-success" style="font-size:0.65rem; line-height:1;">\${barangaySettings.barangay_name || 'BARANGAY CENTRAL'}</div>
                        <div class="text-muted" style="font-size:0.5rem;">BARANGAY IDENTIFICATION CARD</div>
                      </div>
                    </div>
                    <div class="d-flex gap-2 align-items-center">
                      <img src="\${currentResident.photo || 'https://via.placeholder.com/75'}" class="id-photo">
                      <div style="font-size:0.6rem; line-height:1.2;">
                        <div class="fw-bold text-uppercase">\${currentResident.first_name} \${currentResident.last_name}</div>
                        <div class="text-danger fw-bold">\${currentResident.resident_id}</div>
                        <div>DOB: \${currentResident.birth_date}</div>
                        <div>Address: \${currentResident.purok}</div>
                      </div>
                      <img src="/api/qr/generate?text=\${encodeURIComponent(currentResident.qr_token || 'INVALID')}" class="id-qr ms-auto">
                    </div>
                  </div>
                  <button class="btn btn-outline-success btn-sm w-100 mt-2" onclick="window.print()"><i class="bi bi-printer"></i> Print Digital ID</button>
                \` : \`
                  <div class="alert alert-warning p-3 text-start small mb-0">
                    <i class="bi bi-clock-history me-1"></i> <strong>Approval Pending:</strong> Your resident application is currently undergoing official verification by staff.
                  </div>
                \`}
              </div>
            </div>

            <div class="col-lg-8">
              <div class="card shadow-sm border-0 p-4">
                <ul class="nav nav-pills mb-3 border-bottom pb-2">
                  <li class="nav-item">
                    <a class="nav-link \${view === 'dashboard' ? 'active bg-success' : 'text-success'}" href="#" onclick="renderResidentPortal('dashboard')">Announcements</a>
                  </li>
                  <li class="nav-item">
                    <a class="nav-link \${view === 'certificates' ? 'active bg-success' : 'text-success'}" href="#" onclick="renderResidentPortal('certificates')">Certificate Requests</a>
                  </li>
                  <li class="nav-item">
                    <a class="nav-link \${view === 'appointments' ? 'active bg-success' : 'text-success'}" href="#" onclick="renderResidentPortal('appointments')">Appointments</a>
                  </li>
                </ul>

                <div id="residentPortalContent">Loading resident content...</div>
              </div>
            </div>
          </div>
        </div>
      \`;

      if (view === 'dashboard') loadResidentDashboardView();
      else if (view === 'certificates') loadResidentCertificatesView();
      else if (view === 'appointments') loadResidentAppointmentsView();
    }

    async function loadResidentDashboardView() {
      const container = document.getElementById('residentPortalContent');
      container.innerHTML = '<h5 class="fw-bold text-success mb-3">LATEST BARANGAY ANNOUNCEMENTS</h5><div id="resAncList">Loading...</div>';

      try {
        const res = await fetch('/api/announcements');
        const data = await res.json();
        const list = document.getElementById('resAncList');

        if (data.length === 0) {
          list.innerHTML = '<p class="text-muted">No announcements posted yet.</p>';
          return;
        }

        list.innerHTML = data.map(a => \`
          <div class="card shadow-sm border-0 mb-3">
            <div class="card-body">
              <h6 class="fw-bold text-success mb-1">\${a.title}</h6>
              <div class="text-muted small mb-2">\${new Date(a.published_at).toLocaleDateString()} by \${a.author}</div>
              <p class="mb-0 text-secondary">\${a.content}</p>
            </div>
          </div>
        \`).join('');
      } catch {
        document.getElementById('resAncList').innerHTML = '<p class="text-danger">Error loading announcements.</p>';
      }
    }

    async function loadResidentCertificatesView() {
      const container = document.getElementById('residentPortalContent');
      container.innerHTML = \`
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="fw-bold text-success mb-0">My Certificate Requests</h5>
          <button class="btn btn-success btn-sm" onclick="openRequestCertModal()"><i class="bi bi-plus-lg"></i> Request Certificate</button>
        </div>
        <div id="resCertList">Loading...</div>
      \`;

      try {
        const res = await fetch('/api/resident/certificates');
        const data = await res.json();
        const list = document.getElementById('resCertList');

        if (data.length === 0) {
          list.innerHTML = '<p class="text-muted">You have not requested any certificates yet.</p>';
          return;
        }

        list.innerHTML = \`
          <table class="table table-hover align-middle">
            <thead>
              <tr>
                <th>Request #</th>
                <th>Certificate</th>
                <th>Purpose</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              \${data.map(c => \`
                <tr>
                  <td class="fw-bold text-success">\${c.request_number}</td>
                  <td>\${c.certificate_type}</td>
                  <td>\${c.purpose}</td>
                  <td><span class="badge bg-info">\${c.status}</span></td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        \`;
      } catch {
        document.getElementById('resCertList').innerHTML = '<p class="text-danger">Error loading requests.</p>';
      }
    }

    function openRequestCertModal() {
      const modalHtml = \`
        <div class="modal fade" id="reqCertModal" tabindex="-1">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title fw-bold text-success">Request Official Certificate</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <form id="reqCertForm" onsubmit="handleResidentReqCertSubmit(event)">
                  <div class="mb-3">
                    <label class="form-label">Certificate Type *</label>
                    <select class="form-select" id="rcType" required>
                      <option value="Barangay Clearance">Barangay Clearance</option>
                      <option value="Certificate of Residency">Certificate of Residency</option>
                      <option value="Certificate of Indigency">Certificate of Indigency</option>
                      <option value="Certificate of Good Moral">Certificate of Good Moral</option>
                      <option value="Certificate of Solo Parent">Certificate of Solo Parent</option>
                    </select>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Purpose *</label>
                    <input type="text" class="form-control" id="rcPurpose" placeholder="e.g. Employment, Scholarship, ID application" required>
                  </div>
                  <button type="submit" class="btn btn-success w-100">Submit Request</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      \`;

      document.body.insertAdjacentHTML('beforeend', modalHtml);
      const modal = new bootstrap.Modal(document.getElementById('reqCertModal'));
      modal.show();
      document.getElementById('reqCertModal').addEventListener('hidden.bs.modal', function () { this.remove(); });
    }

    async function handleResidentReqCertSubmit(e) {
      e.preventDefault();
      const payload = {
        certificate_type: document.getElementById('rcType').value,
        purpose: document.getElementById('rcPurpose').value
      };

      try {
        const res = await fetch('/api/resident/certificates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok) {
          alert('Certificate request submitted!');
          bootstrap.Modal.getInstance(document.getElementById('reqCertModal')).hide();
          loadResidentCertificatesView();
        } else {
          alert(data.error || 'Failed to submit request.');
        }
      } catch {
        alert('Server error.');
      }
    }

    async function loadResidentAppointmentsView() {
      const container = document.getElementById('residentPortalContent');
      container.innerHTML = '<h5 class="fw-bold text-success mb-3">My Appointments</h5><p class="text-muted">No appointments scheduled.</p>';
    }

    async function handleLogout() {
      await fetch('/api/auth/logout', { method: 'POST' });
      currentUser = null;
      currentResident = null;
      renderLogin();
    }
  </script>
</body>
</html>
  `;

  res.send(htmlContent);
});

// -----------------------------------------------------------------------------
// START EXPRESS SERVER
// -----------------------------------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`  BARANGAY RESIDENT MANAGEMENT SYSTEM ONLINE        `);
  console.log(`  Port: ${PORT}                                     `);
  console.log(`  Mode: Single-file JavaScript Express App          `);
  console.log(`====================================================`);
});
