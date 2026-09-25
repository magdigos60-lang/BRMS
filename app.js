/**
 * ============================================================================
 * BARANGAY RESIDENT MANAGEMENT SYSTEM (BRMS)
 * Single-File Node.js / Express / Supabase Web Application
 * ============================================================================
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const QRCode = require('qrcode');
const multer = require('multer');

// ============================================================================
// 3. SUPABASE & SERVER CONFIGURATION
// ============================================================================
// PLEASE PASTE YOUR SUPABASE CREDENTIALS HERE:
const SUPABASE_URL = process.env.SUPABASE_URL || "https://your-supabase-project-id.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "your-supabase-anon-key";
const JWT_SECRET = process.env.JWT_SECRET || "barangay_super_secret_jwt_key_2026";

const app = express();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB Upload limit

// Initialize Supabase Client
let supabase = null;
if (SUPABASE_URL && !SUPABASE_URL.includes("your-supabase-project-id") && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes("your-supabase-anon-key")) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors());

// Check Supabase readiness middleware
const checkDbConfig = (req, res, next) => {
  if (!supabase) {
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ error: "DATABASE NOT CONFIGURED. Please configure SUPABASE_URL and SUPABASE_ANON_KEY in app.js." });
    }
    return res.send(renderDbConfigErrorPage());
  }
  next();
};

// Log activity helper
async function logActivity(userName, userRole, action, description) {
  if (!supabase) return;
  try {
    await supabase.from('activity_logs').insert([{
      user_name: userName || 'System',
      user_role: userRole || 'System',
      action,
      description,
      created_at: new Date().toISOString()
    }]);
  } catch (err) {
    console.error('Activity Log Error:', err.message);
  }
}

// Authentication Middleware
const authenticateToken = async (req, res, next) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: "Unauthorized access. Please login." });

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.clearCookie('auth_token');
    return res.status(403).json({ error: "Session expired. Please login again." });
  }
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied. Insufficient permissions." });
    }
    next();
  };
};

// Helper: Fetch Barangay Settings
async function getSettings() {
  if (!supabase) return null;
  const { data } = await supabase.from('barangay_settings').select('*').single();
  return data || {
    barangay_name: 'Barangay San Jose',
    municipality: 'San Fernando',
    province: 'Pampanga',
    address: 'Main Street, San Fernando',
    contact_number: '+63 917 123 4567',
    email: 'info@barangay.gov.ph',
    barangay_captain: 'Hon. Juan Dela Cruz',
    barangay_secretary: 'Maria Santos',
    id_prefix: 'BRGY-2026',
    certificate_prefix: 'CERT-2026'
  };
}

// ============================================================================
// API ROUTES - SYSTEM SETUP & AUTH
// ============================================================================

app.get('/api/check-setup', checkDbConfig, async (req, res) => {
  try {
    const { count, error } = await supabase.from('users').select('*', { count: 'exact', head: true });
    if (error) throw error;
    res.json({ hasAdmin: count > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/setup-admin', checkDbConfig, async (req, res) => {
  const { fullName, username, email, password, confirmPassword } = req.body;
  if (!fullName || !username || !email || !password) {
    return res.status(400).json({ error: "All fields are required." });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match." });
  }

  try {
    const { count } = await supabase.from('users').select('*', { count: 'exact', head: true });
    if (count > 0) {
      return res.status(400).json({ error: "Admin account already exists. Setup is locked." });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const { data, error } = await supabase.from('users').insert([{
      full_name: fullName,
      username,
      email,
      password_hash,
      role: 'SUPER ADMIN',
      is_active: true
    }]).select();

    if (error) throw error;

    await logActivity(fullName, 'SUPER ADMIN', 'System Initialized', 'First-time super admin account created.');
    res.json({ success: true, message: "Super Admin account created successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/login', checkDbConfig, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username/Email and Password required." });

  try {
    const { data: users, error } = await supabase.from('users')
      .select('*')
      .or(`username.eq.${username},email.eq.${username}`);

    if (error || !users || users.length === 0) {
      return res.status(400).json({ error: "Invalid username/email or password." });
    }

    const user = users[0];
    if (!user.is_active) {
      return res.status(403).json({ error: "Account is disabled. Contact Barangay Administrator." });
    }

    const validPass = await bcrypt.compare(password, user.password_hash);
    if (!validPass) return res.status(400).json({ error: "Invalid username/email or password." });

    let residentData = null;
    if (user.role === 'RESIDENT') {
      const { data: resData } = await supabase.from('residents').select('*').eq('user_id', user.id).single();
      residentData = resData;
    }

    const token = jwt.sign({
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      residentId: residentData ? residentData.id : null
    }, JWT_SECRET, { expiresIn: '12h' });

    res.cookie('auth_token', token, { httpOnly: true, maxAge: 12 * 3600 * 1000 });
    await logActivity(user.full_name, user.role, 'Login', 'User logged into system.');

    res.json({
      success: true,
      role: user.role,
      user: { id: user.id, name: user.full_name, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

// ============================================================================
// API ROUTES - PUBLIC RESIDENT REGISTRATION
// ============================================================================

app.post('/api/register-resident', checkDbConfig, async (req, res) => {
  const {
    firstName, middleName, lastName, suffix, dateOfBirth, gender, civilStatus,
    nationality, contactNumber, email, address, purok, occupation, educationalAttainment,
    isVoter, isPwd, isSeniorCitizen, isSoloParent, is4ps, emergencyContact, emergencyContactNumber,
    password, confirmPassword, profilePhotoUrl, validIdUrl
  } = req.body;

  if (!firstName || !lastName || !dateOfBirth || !gender || !civilStatus || !contactNumber || !email || !address || !purok || !password) {
    return res.status(400).json({ error: "Missing required registration fields." });
  }
  if (password !== confirmPassword) return res.status(400).json({ error: "Passwords do not match." });

  try {
    // Check existing email
    const { data: existingUser } = await supabase.from('users').select('id').eq('email', email);
    if (existingUser && existingUser.length > 0) {
      return res.status(400).json({ error: "Email address is already registered." });
    }

    // Hash Password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create User Account
    const username = email.split('@')[0] + Math.floor(1000 + Math.random() * 9000);
    const fullName = `${firstName} ${middleName ? middleName + ' ' : ''}${lastName} ${suffix || ''}`.trim();

    const { data: userData, error: userError } = await supabase.from('users').insert([{
      full_name: fullName,
      username,
      email,
      password_hash,
      role: 'RESIDENT',
      is_active: true
    }]).select().single();

    if (userError) throw userError;

    // Generate Temporary Resident Number
    const settings = await getSettings();
    const tempResNum = `${settings.id_prefix || 'BRGY'}-PENDING-${Date.now().toString().slice(-6)}`;

    // Create Resident Record
    const { data: residentData, error: resError } = await supabase.from('residents').insert([{
      user_id: userData.id,
      resident_number: tempResNum,
      first_name: firstName,
      middle_name: middleName || '',
      last_name: lastName,
      suffix: suffix || '',
      date_of_birth: dateOfBirth,
      gender,
      civil_status: civilStatus,
      nationality: nationality || 'Filipino',
      contact_number: contactNumber,
      email,
      address,
      purok,
      occupation: occupation || 'Unemployed',
      educational_attainment: educationalAttainment || 'N/A',
      is_voter: !!isVoter,
      is_pwd: !!isPwd,
      is_senior_citizen: !!isSeniorCitizen,
      is_solo_parent: !!isSoloParent,
      is_4ps: !!is4ps,
      emergency_contact: emergencyContact,
      emergency_contact_number: emergencyContactNumber,
      profile_photo_url: profilePhotoUrl || '',
      valid_id_url: validIdUrl || '',
      status: 'PENDING'
    }]).select().single();

    if (resError) throw resError;

    await logActivity('Public User', 'RESIDENT', 'Registration Submitted', `New resident registration submitted for ${fullName}.`);

    res.json({
      success: true,
      message: "Application submitted successfully! Please wait for staff approval.",
      residentNumber: tempResNum
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// API ROUTES - DASHBOARD & STATS (REAL SUPABASE DATA)
// ============================================================================

app.get('/api/staff/dashboard-stats', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN', 'BARANGAY SECRETARY', 'STAFF'), async (req, res) => {
  try {
    const [
      resTotal, resPending, resApproved, resRejected,
      households, maleCount, femaleCount, seniorCount, pwdCount, soloParentCount, voterCount,
      pendingCerts, pendingApps, pendingComplaints, activeBiz, purokList
    ] = await Promise.all([
      supabase.from('residents').select('id', { count: 'exact', head: true }),
      supabase.from('residents').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
      supabase.from('residents').select('id', { count: 'exact', head: true }).in('status', ['APPROVED', 'ACTIVE']),
      supabase.from('residents').select('id', { count: 'exact', head: true }).eq('status', 'REJECTED'),
      supabase.from('households').select('id', { count: 'exact', head: true }),
      supabase.from('residents').select('id', { count: 'exact', head: true }).eq('gender', 'Male'),
      supabase.from('residents').select('id', { count: 'exact', head: true }).eq('gender', 'Female'),
      supabase.from('residents').select('id', { count: 'exact', head: true }).eq('is_senior_citizen', true),
      supabase.from('residents').select('id', { count: 'exact', head: true }).eq('is_pwd', true),
      supabase.from('residents').select('id', { count: 'exact', head: true }).eq('is_solo_parent', true),
      supabase.from('residents').select('id', { count: 'exact', head: true }).eq('is_voter', true),
      supabase.from('certificate_requests').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
      supabase.from('complaints').select('id', { count: 'exact', head: true }).eq('status', 'SUBMITTED'),
      supabase.from('businesses').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
      supabase.from('puroks').select('name')
    ]);

    // Aggregate Purok Demographics
    const { data: purokResidents } = await supabase.from('residents').select('purok');
    const purokCounts = {};
    if (purokResidents) {
      purokResidents.forEach(r => {
        purokCounts[r.purok] = (purokCounts[r.purok] || 0) + 1;
      });
    }

    res.json({
      totalResidents: resTotal.count || 0,
      pendingResidents: resPending.count || 0,
      approvedResidents: resApproved.count || 0,
      rejectedResidents: resRejected.count || 0,
      totalHouseholds: households.count || 0,
      maleResidents: maleCount.count || 0,
      femaleResidents: femaleCount.count || 0,
      seniorCitizens: seniorCount.count || 0,
      pwd: pwdCount.count || 0,
      soloParents: soloParentCount.count || 0,
      voters: voterCount.count || 0,
      pendingCertificates: pendingCerts.count || 0,
      pendingAppointments: pendingApps.count || 0,
      pendingComplaints: pendingComplaints.count || 0,
      activeBusinesses: activeBiz.count || 0,
      purokDemographics: purokCounts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// API ROUTES - RESIDENT APPROVAL & MANAGEMENT
// ============================================================================

app.get('/api/residents', checkDbConfig, authenticateToken, async (req, res) => {
  try {
    const { status, search, purok, gender, filterType } = req.query;
    let query = supabase.from('residents').select('*').order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (purok) query = query.eq('purok', purok);
    if (gender) query = query.eq('gender', gender);
    if (filterType === 'senior') query = query.eq('is_senior_citizen', true);
    if (filterType === 'pwd') query = query.eq('is_pwd', true);
    if (filterType === 'voter') query = query.eq('is_voter', true);

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,resident_number.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/residents/approve/:id', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN', 'BARANGAY SECRETARY', 'STAFF'), async (req, res) => {
  try {
    const residentId = req.params.id;
    const settings = await getSettings();

    // Fetch total active/approved count to generate sequence number
    const { count } = await supabase.from('residents').select('id', { count: 'exact', head: true }).in('status', ['APPROVED', 'ACTIVE']);
    const seqNum = String((count || 0) + 1).padStart(6, '0');
    const uniqueResidentNumber = `${settings.id_prefix || 'BRGY-2026'}-${seqNum}`;

    const { data, error } = await supabase.from('residents').update({
      status: 'APPROVED',
      resident_number: uniqueResidentNumber,
      updated_at: new Date().toISOString()
    }).eq('id', residentId).select().single();

    if (error) throw error;

    // Send Notification to Resident User Account
    if (data.user_id) {
      await supabase.from('notifications').insert([{
        user_id: data.user_id,
        title: 'Registration Approved',
        message: `Congratulations! Your Barangay registration has been APPROVED. Your Official Resident ID is ${uniqueResidentNumber}.`,
        link: '/resident'
      }]);
    }

    await logActivity(req.user.fullName, req.user.role, 'Approve Resident', `Approved resident ${data.first_name} ${data.last_name} with ID ${uniqueResidentNumber}.`);
    res.json({ success: true, message: 'Resident approved successfully!', resident: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/residents/reject/:id', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN', 'BARANGAY SECRETARY', 'STAFF'), async (req, res) => {
  const { rejectionReason } = req.body;
  if (!rejectionReason) return res.status(400).json({ error: "Rejection reason is required." });

  try {
    const residentId = req.params.id;
    const { data, error } = await supabase.from('residents').update({
      status: 'REJECTED',
      rejection_reason: rejectionReason,
      updated_at: new Date().toISOString()
    }).eq('id', residentId).select().single();

    if (error) throw error;

    if (data.user_id) {
      await supabase.from('notifications').insert([{
        user_id: data.user_id,
        title: 'Registration Rejected',
        message: `Your registration application was rejected. Reason: ${rejectionReason}`,
        link: '/resident'
      }]);
    }

    await logActivity(req.user.fullName, req.user.role, 'Reject Resident', `Rejected resident ${data.first_name} ${data.last_name}.`);
    res.json({ success: true, message: 'Resident application rejected.', resident: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/residents/archive/:id', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN', 'BARANGAY SECRETARY', 'STAFF'), async (req, res) => {
  const { statusReason } = req.body; // ARCHIVED, MOVED OUT, DECEASED, INACTIVE
  const targetStatus = statusReason || 'ARCHIVED';

  try {
    const { data, error } = await supabase.from('residents').update({
      status: targetStatus,
      updated_at: new Date().toISOString()
    }).eq('id', req.params.id).select().single();

    if (error) throw error;

    await logActivity(req.user.fullName, req.user.role, 'Archive Resident', `Archived resident ${data.first_name} ${data.last_name} (Status: ${targetStatus}).`);
    res.json({ success: true, message: `Resident status changed to ${targetStatus}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/residents/restore/:id', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN', 'BARANGAY SECRETARY', 'STAFF'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('residents').update({
      status: 'APPROVED',
      updated_at: new Date().toISOString()
    }).eq('id', req.params.id).select().single();

    if (error) throw error;

    await logActivity(req.user.fullName, req.user.role, 'Restore Resident', `Restored archived resident ${data.first_name} ${data.last_name}.`);
    res.json({ success: true, message: "Resident record restored to APPROVED." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// API ROUTES - HOUSEHOLDS & PUROKS
// ============================================================================

app.get('/api/households', checkDbConfig, authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('households').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/households', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN', 'BARANGAY SECRETARY', 'STAFF'), async (req, res) => {
  const { householdNumber, householdHeadName, address, purok, householdType } = req.body;
  try {
    const { data, error } = await supabase.from('households').insert([{
      household_number: householdNumber,
      household_head_name: householdHeadName,
      address,
      purok,
      household_type: householdType || 'Single Family'
    }]).select().single();

    if (error) throw error;
    await logActivity(req.user.fullName, req.user.role, 'Create Household', `Created Household #${householdNumber}`);
    res.json({ success: true, household: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/puroks', checkDbConfig, async (req, res) => {
  try {
    const { data, error } = await supabase.from('puroks').select('*').order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/puroks', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN', 'BARANGAY SECRETARY'), async (req, res) => {
  const { name, description } = req.body;
  try {
    const { data, error } = await supabase.from('puroks').insert([{ name, description }]).select().single();
    if (error) throw error;
    res.json({ success: true, purok: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// API ROUTES - CERTIFICATES & CLAIMING BY QR
// ============================================================================

app.get('/api/certificates', checkDbConfig, authenticateToken, async (req, res) => {
  try {
    let query = supabase.from('certificate_requests').select('*, residents(first_name, last_name, resident_number)').order('created_at', { ascending: false });
    if (req.user.role === 'RESIDENT') {
      query = query.eq('resident_id', req.user.residentId);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/certificates/request', checkDbConfig, authenticateToken, authorizeRoles('RESIDENT'), async (req, res) => {
  const { certificateType, purpose } = req.body;
  if (!certificateType || !purpose) return res.status(400).json({ error: "Certificate type and purpose required." });

  try {
    const settings = await getSettings();
    const reqNum = `${settings.certificate_prefix || 'REQ'}-${Date.now().toString().slice(-6)}`;

    const { data, error } = await supabase.from('certificate_requests').insert([{
      request_number: reqNum,
      resident_id: req.user.residentId,
      certificate_type: certificateType,
      purpose,
      status: 'PENDING'
    }]).select().single();

    if (error) throw error;

    await logActivity(req.user.fullName, 'RESIDENT', 'Certificate Request', `Requested ${certificateType} (${reqNum})`);
    res.json({ success: true, request: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/certificates/update-status/:id', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN', 'BARANGAY SECRETARY', 'STAFF'), async (req, res) => {
  const { status, remarks, documentUrl } = req.body;
  try {
    const updateData = { status, updated_at: new Date().toISOString() };
    if (remarks) updateData.remarks = remarks;
    if (documentUrl) updateData.document_url = documentUrl;
    if (status === 'RELEASED') {
      updateData.released_by = req.user.fullName;
      updateData.released_at = new Date().toISOString();
    }

    const { data, error } = await supabase.from('certificate_requests').update(updateData).eq('id', req.params.id).select('*, residents(user_id)').single();
    if (error) throw error;

    if (data.residents && data.residents.user_id) {
      await supabase.from('notifications').insert([{
        user_id: data.residents.user_id,
        title: `Certificate Status: ${status}`,
        message: `Your request for ${data.certificate_type} is now ${status}.`,
        link: '/resident'
      }]);
    }

    await logActivity(req.user.fullName, req.user.role, 'Certificate Status Change', `Updated Request ${data.request_number} to ${status}`);
    res.json({ success: true, request: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Scan Claim QR Code Route for Staff
app.get('/api/certificates/claim-scan/:token', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN', 'BARANGAY SECRETARY', 'STAFF'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('certificate_requests')
      .select('*, residents(first_name, last_name, resident_number, address, purok)')
      .eq('claim_qr_token', req.params.token)
      .single();

    if (error || !data) return res.status(404).json({ error: "Certificate request QR token not found or invalid." });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// API ROUTES - ANNOUNCEMENTS & NOTIFICATIONS
// ============================================================================

app.get('/api/announcements', checkDbConfig, async (req, res) => {
  try {
    const { data, error } = await supabase.from('announcements').select('*').eq('is_published', true).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/announcements', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN', 'BARANGAY SECRETARY', 'STAFF'), async (req, res) => {
  const { title, content, category, priority } = req.body;
  try {
    const { data, error } = await supabase.from('announcements').insert([{
      title,
      content,
      category: category || 'General',
      priority: priority || 'Normal',
      is_published: true,
      created_by: req.user.fullName
    }]).select().single();

    if (error) throw error;
    await logActivity(req.user.fullName, req.user.role, 'Published Announcement', `Announcement: ${title}`);
    res.json({ success: true, announcement: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications', checkDbConfig, authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// API ROUTES - APPOINTMENTS, COMPLAINTS, BLOTTER, ASSISTANCE, BUSINESSES
// ============================================================================

// APPOINTMENTS
app.get('/api/appointments', checkDbConfig, authenticateToken, async (req, res) => {
  try {
    let query = supabase.from('appointments').select('*, residents(first_name, last_name)').order('created_at', { ascending: false });
    if (req.user.role === 'RESIDENT') query = query.eq('resident_id', req.user.residentId);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/appointments', checkDbConfig, authenticateToken, authorizeRoles('RESIDENT'), async (req, res) => {
  const { serviceType, appointmentDate, appointmentTime, purpose } = req.body;
  try {
    const appNum = `APT-${Date.now().toString().slice(-6)}`;
    const { data, error } = await supabase.from('appointments').insert([{
      appointment_number: appNum,
      resident_id: req.user.residentId,
      service_type: serviceType,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      purpose,
      status: 'PENDING'
    }]).select().single();
    if (error) throw error;
    res.json({ success: true, appointment: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// COMPLAINTS
app.get('/api/complaints', checkDbConfig, authenticateToken, async (req, res) => {
  try {
    let query = supabase.from('complaints').select('*').order('created_at', { ascending: false });
    if (req.user.role === 'RESIDENT') query = query.eq('complainant_id', req.user.residentId);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/complaints', checkDbConfig, authenticateToken, async (req, res) => {
  const { category, subject, details, location } = req.body;
  try {
    const cmpNum = `CMP-${Date.now().toString().slice(-6)}`;
    const { data, error } = await supabase.from('complaints').insert([{
      complaint_number: cmpNum,
      complainant_id: req.user.role === 'RESIDENT' ? req.user.residentId : null,
      complainant_name: req.user.fullName,
      category,
      subject,
      details,
      location: location || '',
      status: 'SUBMITTED'
    }]).select().single();
    if (error) throw error;
    res.json({ success: true, complaint: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// BLOTTER RECORDS
app.get('/api/blotter', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN', 'BARANGAY SECRETARY', 'STAFF'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('blotter_records').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/blotter', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN', 'BARANGAY SECRETARY', 'STAFF'), async (req, res) => {
  const { complainantName, respondentName, witnessName, incidentDate, incidentTime, location, description, actionTaken } = req.body;
  try {
    const caseNum = `BLT-${Date.now().toString().slice(-6)}`;
    const { data, error } = await supabase.from('blotter_records').insert([{
      case_number: caseNum,
      complainant_name: complainantName,
      respondent_name: respondentName,
      witness_name: witnessName || '',
      incident_date: incidentDate,
      incident_time: incidentTime,
      location,
      description,
      action_taken: actionTaken || '',
      status: 'ACTIVE'
    }]).select().single();
    if (error) throw error;
    await logActivity(req.user.fullName, req.user.role, 'Created Blotter Record', `Case #${caseNum}`);
    res.json({ success: true, blotter: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ASSISTANCE REQUESTS
app.get('/api/assistance', checkDbConfig, authenticateToken, async (req, res) => {
  try {
    let query = supabase.from('assistance_requests').select('*, residents(first_name, last_name)').order('created_at', { ascending: false });
    if (req.user.role === 'RESIDENT') query = query.eq('resident_id', req.user.residentId);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/assistance', checkDbConfig, authenticateToken, authorizeRoles('RESIDENT'), async (req, res) => {
  const { assistanceType, reason, amountRequested } = req.body;
  try {
    const reqNum = `AST-${Date.now().toString().slice(-6)}`;
    const { data, error } = await supabase.from('assistance_requests').insert([{
      request_number: reqNum,
      resident_id: req.user.residentId,
      assistance_type: assistanceType,
      reason,
      amount_requested: parseFloat(amountRequested) || 0,
      status: 'PENDING'
    }]).select().single();
    if (error) throw error;
    res.json({ success: true, assistance: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// BUSINESS MANAGEMENT
app.get('/api/businesses', checkDbConfig, authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('businesses').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/businesses', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN', 'BARANGAY SECRETARY', 'STAFF'), async (req, res) => {
  const { businessName, ownerName, address, businessType, contactNumber, permitNumber, dateIssued, expirationDate } = req.body;
  try {
    const { data, error } = await supabase.from('businesses').insert([{
      business_name: businessName,
      owner_name: ownerName,
      address,
      business_type: businessType,
      contact_number: contactNumber,
      permit_number: permitNumber,
      date_issued: dateIssued,
      expiration_date: expirationDate,
      status: 'ACTIVE'
    }]).select().single();
    if (error) throw error;
    res.json({ success: true, business: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ACTIVITY LOGS & USERS MANAGEMENT
app.get('/api/activity-logs', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/users', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('id, full_name, username, email, role, is_active, created_at').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users/create-staff', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN'), async (req, res) => {
  const { fullName, username, email, password, role } = req.body;
  try {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const { data, error } = await supabase.from('users').insert([{
      full_name: fullName,
      username,
      email,
      password_hash,
      role: role || 'STAFF',
      is_active: true
    }]).select().single();

    if (error) throw error;
    await logActivity(req.user.fullName, req.user.role, 'Create Staff User', `Created staff account for ${fullName}`);
    res.json({ success: true, user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// SETTINGS MANAGEMENT
app.get('/api/settings', checkDbConfig, async (req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/settings', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN'), async (req, res) => {
  const { barangay_name, municipality, province, address, contact_number, email, barangay_captain, barangay_secretary, id_prefix, certificate_prefix, logo_url } = req.body;
  try {
    const { data, error } = await supabase.from('barangay_settings').upsert({
      id: 1,
      barangay_name,
      municipality,
      province,
      address,
      contact_number,
      email,
      barangay_captain,
      barangay_secretary,
      id_prefix,
      certificate_prefix,
      logo_url,
      updated_at: new Date().toISOString()
    }).select().single();

    if (error) throw error;
    await logActivity(req.user.fullName, req.user.role, 'Update Barangay Settings', 'System configuration updated');
    res.json({ success: true, settings: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================================
// PUBLIC QR CODE VERIFICATION API & PAGE
// ============================================================================

app.get('/verify/:token', checkDbConfig, async (req, res) => {
  const token = req.params.token;
  try {
    const settings = await getSettings();
    const { data: resident, error } = await supabase.from('residents').select('*').eq('qr_token', token).single();

    if (error || !resident) {
      return res.send(renderVerificationResultPage(settings, null, false));
    }

    res.send(renderVerificationResultPage(settings, resident, true));
  } catch (err) {
    res.status(500).send("Verification error occurred.");
  }
});

// Batch 8-ID Print Route
app.post('/api/print-batch-ids', checkDbConfig, authenticateToken, authorizeRoles('SUPER ADMIN', 'BARANGAY CAPTAIN', 'BARANGAY SECRETARY', 'STAFF'), async (req, res) => {
  const { residentIds, paperSize } = req.body; // Array of IDs
  if (!residentIds || !Array.isArray(residentIds) || residentIds.length === 0) {
    return res.status(400).json({ error: "Select at least 1 resident ID to print." });
  }

  try {
    const settings = await getSettings();
    const { data: residents, error } = await supabase.from('residents').select('*').in('id', residentIds);
    if (error) throw error;

    const cardsHtml = await Promise.all(residents.map(async (resData) => {
      const qrDataUrl = await QRCode.toDataURL(`${req.protocol}://${req.get('host')}/verify/${resData.qr_token}`);
      return renderSingleIdCardHtml(settings, resData, qrDataUrl);
    }));

    res.json({ success: true, html: render8IdPrintSheetHtml(cardsHtml, paperSize || 'A4') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single Digital ID Route
app.get('/api/resident-id-card/:id', checkDbConfig, authenticateToken, async (req, res) => {
  try {
    const settings = await getSettings();
    const { data: resData, error } = await supabase.from('residents').select('*').eq('id', req.params.id).single();
    if (error || !resData) return res.status(404).json({ error: "Resident not found" });

    const qrDataUrl = await QRCode.toDataURL(`${req.protocol}://${req.get('host')}/verify/${resData.qr_token}`);
    const cardHtml = renderSingleIdCardHtml(settings, resData, qrDataUrl);

    res.json({ success: true, html: cardHtml, qrUrl: qrDataUrl, resident: resData, settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// SINGLE PAGE FRONTEND GENERATOR (EXPRESS HTML/CSS/JS DELIVERABLE)
// ============================================================================

function renderMainAppPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Barangay Resident Management System</title>
    <!-- FontAwesome & Google Fonts -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <!-- Chart.js -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --primary-green: #0d7a40;
            --primary-green-dark: #08522a;
            --secondary-blue: #1e40af;
            --secondary-blue-light: #3b82f6;
            --bg-light: #f3f4f6;
            --text-dark: #1f2937;
            --text-muted: #6b7280;
            --white: #ffffff;
            --border-color: #e5e7eb;
            --card-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
        body { background-color: var(--bg-light); color: var(--text-dark); min-height: 100vh; display: flex; flex-direction: column; }
        
        /* Layout Structure */
        #app { display: flex; width: 100vw; min-height: 100vh; }
        .sidebar { width: 260px; background: linear-gradient(180deg, var(--primary-green-dark) 0%, var(--primary-green) 100%); color: var(--white); display: flex; flex-direction: column; flex-shrink: 0; transition: all 0.3s; }
        .sidebar-header { padding: 20px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .sidebar-header img { width: 42px; height: 42px; border-radius: 50%; background: #fff; object-fit: cover; }
        .sidebar-header h2 { font-size: 16px; font-weight: 700; line-height: 1.2; }
        .sidebar-menu { list-style: none; padding: 15px 10px; flex-grow: 1; overflow-y: auto; }
        .sidebar-menu li a { display: flex; align-items: center; gap: 12px; padding: 12px 15px; color: rgba(255,255,255,0.85); text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500; margin-bottom: 4px; transition: 0.2s; }
        .sidebar-menu li a:hover, .sidebar-menu li a.active { background: rgba(255,255,255,0.2); color: #fff; font-weight: 600; }
        
        .main-content { flex-grow: 1; display: flex; flex-direction: column; overflow-x: hidden; }
        .top-navbar { height: 65px; background: var(--white); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; padding: 0 30px; }
        .top-navbar .user-profile { display: flex; align-items: center; gap: 15px; }
        .page-container { padding: 30px; flex-grow: 1; overflow-y: auto; }
        
        /* Components */
        .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: var(--white); padding: 20px; border-radius: 12px; box-shadow: var(--card-shadow); border-left: 5px solid var(--secondary-blue); display: flex; justify-content: space-between; align-items: center; }
        .stat-card.green { border-left-color: var(--primary-green); }
        .stat-card.yellow { border-left-color: #f59e0b; }
        .stat-card.red { border-left-color: #ef4444; }
        .stat-card .val { font-size: 26px; font-weight: 700; color: var(--text-dark); margin-top: 5px; }
        .stat-card .title { font-size: 13px; color: var(--text-muted); font-weight: 500; }
        .stat-card i { font-size: 28px; opacity: 0.3; }

        .content-card { background: var(--white); border-radius: 12px; padding: 25px; box-shadow: var(--card-shadow); margin-bottom: 25px; }
        .content-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px; }
        .content-header h3 { font-size: 18px; color: var(--secondary-blue); display: flex; align-items: center; gap: 10px; }
        
        /* Tables & Buttons */
        .table-responsive { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
        th, td { padding: 12px 15px; border-bottom: 1px solid var(--border-color); }
        th { background: #f9fafb; font-weight: 600; color: var(--text-dark); }
        tr:hover { background: #f8fafc; }

        .btn { padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; text-decoration: none; transition: 0.2s; }
        .btn-primary { background: var(--primary-green); color: #fff; }
        .btn-primary:hover { background: var(--primary-green-dark); }
        .btn-secondary { background: var(--secondary-blue); color: #fff; }
        .btn-secondary:hover { background: #1d4ed8; }
        .btn-danger { background: #ef4444; color: #fff; }
        .btn-warning { background: #f59e0b; color: #fff; }
        .btn-sm { padding: 5px 10px; font-size: 12px; }

        .badge { padding: 4px 10px; border-radius: 50px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .badge-pending { background: #fef3c7; color: #d97706; }
        .badge-approved, .badge-active { background: #d1fae5; color: #059669; }
        .badge-rejected, .badge-inactive { background: #fee2e2; color: #dc2626; }

        /* Auth Pages Layout */
        .auth-container { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #0d7a40 0%, #1e40af 100%); padding: 20px; }
        .auth-box { background: #fff; border-radius: 16px; width: 100%; max-width: 480px; padding: 40px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2); }
        .auth-header { text-align: center; margin-bottom: 30px; }
        .auth-header img { width: 80px; margin-bottom: 15px; }
        .auth-header h2 { font-size: 22px; color: var(--text-dark); }
        .form-group { margin-bottom: 18px; }
        .form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text-dark); }
        .form-control { width: 100%; padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 14px; outline: none; }
        .form-control:focus { border-color: var(--secondary-blue); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2); }

        /* Modal Dialogs */
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: none; justify-content: center; align-items: center; z-index: 999; }
        .modal-overlay.active { display: flex; }
        .modal-box { background: #fff; width: 90%; max-width: 650px; border-radius: 12px; max-height: 90vh; overflow-y: auto; padding: 25px; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; margin-bottom: 20px; }

        /* Responsiveness */
        @media (max-width: 768px) {
            #app { flex-direction: column; }
            .sidebar { width: 100%; }
            .top-navbar { padding: 0 15px; }
            .page-container { padding: 15px; }
        }
    </style>
</head>
<body>
    <div id="app"></div>

    <!-- Modal Container -->
    <div id="modalOverlay" class="modal-overlay">
        <div class="modal-box" id="modalContent"></div>
    </div>

    <script>
        // Global Application State
        let currentUser = null;
        let currentSettings = null;

        // Initialize Application
        async function initApp() {
            try {
                // Fetch Settings
                const setRes = await fetch('/api/settings');
                currentSettings = await setRes.json();

                // Check First Time Setup
                const setupRes = await fetch('/api/check-setup');
                const setupData = await setupRes.json();

                if (!setupData.hasAdmin) {
                    renderSetupAdminView();
                    return;
                }

                // Render Login View by default if unauthenticated
                renderLoginView();
            } catch (err) {
                console.error("Init Error:", err);
            }
        }

        // ============================================================================
        // VIEWS: SETUP ADMIN & AUTHENTICATION
        // ============================================================================

        function renderSetupAdminView() {
            const app = document.getElementById('app');
            app.innerHTML = \`
                <div class="auth-container" style="width:100%;">
                    <div class="auth-box">
                        <div class="auth-header">
                            <i class="fa-solid fa-shield-halved" style="font-size: 50px; color: var(--primary-green);"></i>
                            <h2 style="margin-top:15px;">FIRST-TIME ADMIN SETUP</h2>
                            <p style="font-size:13px; color:var(--text-muted); margin-top:5px;">No administrator account was detected. Please create the primary Super Admin account to initialize the system.</p>
                        </div>
                        <form id="setupForm" onsubmit="handleAdminSetup(event)">
                            <div class="form-group">
                                <label>Full Name</label>
                                <input type="text" id="setupFullName" class="form-control" required placeholder="e.g. Juan Dela Cruz">
                            </div>
                            <div class="form-group">
                                <label>Username</label>
                                <input type="text" id="setupUsername" class="form-control" required placeholder="admin">
                            </div>
                            <div class="form-group">
                                <label>Email Address</label>
                                <input type="email" id="setupEmail" class="form-control" required placeholder="admin@barangay.gov.ph">
                            </div>
                            <div class="form-group">
                                <label>Password</label>
                                <input type="password" id="setupPassword" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Confirm Password</label>
                                <input type="password" id="setupConfirmPassword" class="form-control" required>
                            </div>
                            <button type="submit" class="btn btn-primary" style="width:100%; justify-content:center; padding:12px;">
                                <i class="fa-solid fa-user-plus"></i> CREATE ADMINISTRATOR ACCOUNT
                            </button>
                        </form>
                    </div>
                </div>
            \`;
        }

        async function handleAdminSetup(e) {
            e.preventDefault();
            const fullName = document.getElementById('setupFullName').value;
            const username = document.getElementById('setupUsername').value;
            const email = document.getElementById('setupEmail').value;
            const password = document.getElementById('setupPassword').value;
            const confirmPassword = document.getElementById('setupConfirmPassword').value;

            try {
                const res = await fetch('/api/setup-admin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fullName, username, email, password, confirmPassword })
                });
                const data = await res.json();
                if (data.error) return alert(data.error);

                alert(data.message);
                renderLoginView();
            } catch (err) {
                alert("Setup failed: " + err.message);
            }
        }

        function renderLoginView() {
            const app = document.getElementById('app');
            app.innerHTML = \`
                <div class="auth-container" style="width:100%;">
                    <div class="auth-box">
                        <div class="auth-header">
                            <h2 style="color:var(--primary-green); font-weight:800;">\${currentSettings ? currentSettings.barangay_name.toUpperCase() : 'BARANGAY'}</h2>
                            <p style="font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-top:2px;">Resident Management System</p>
                        </div>
                        <form id="loginForm" onsubmit="handleLogin(event)">
                            <div class="form-group">
                                <label>Username or Email</label>
                                <input type="text" id="loginUsername" class="form-control" required placeholder="Enter username or email">
                            </div>
                            <div class="form-group">
                                <label>Password</label>
                                <input type="password" id="loginPassword" class="form-control" required placeholder="Enter password">
                            </div>
                            <button type="submit" class="btn btn-primary" style="width:100%; justify-content:center; padding:12px; margin-top:10px;">
                                <i class="fa-solid fa-right-to-bracket"></i> LOGIN
                            </button>
                        </form>
                        <div style="margin-top:25px; text-align:center; border-top:1px solid var(--border-color); padding-top:20px;">
                            <p style="font-size:13px; color:var(--text-muted);">Don't have a resident account yet?</p>
                            <button onclick="renderRegisterView()" class="btn btn-secondary" style="width:100%; justify-content:center; margin-top:10px;">
                                <i class="fa-solid fa-user-plus"></i> REGISTER AS RESIDENT
                            </button>
                        </div>
                    </div>
                </div>
            \`;
        }

        async function handleLogin(e) {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (data.error) return alert(data.error);

                currentUser = data.user;
                if (data.role === 'RESIDENT') {
                    renderResidentPortal();
                } else {
                    renderStaffPortal();
                }
            } catch (err) {
                alert("Login Error: " + err.message);
            }
        }

        function renderRegisterView() {
            const app = document.getElementById('app');
            app.innerHTML = \`
                <div class="auth-container" style="width:100%; padding: 40px 20px;">
                    <div class="auth-box" style="max-width: 800px;">
                        <div class="auth-header">
                            <h2>BARANGAY RESIDENT REGISTRATION</h2>
                            <p style="font-size:13px; color:var(--text-muted);">Fill out the official registration form accurately.</p>
                        </div>
                        <form onsubmit="handleResidentRegistration(event)">
                            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:15px;">
                                <div class="form-group"><label>First Name *</label><input type="text" id="regFirstName" class="form-control" required></div>
                                <div class="form-group"><label>Middle Name</label><input type="text" id="regMiddleName" class="form-control"></div>
                                <div class="form-group"><label>Last Name *</label><input type="text" id="regLastName" class="form-control" required></div>
                                <div class="form-group"><label>Suffix</label><input type="text" id="regSuffix" class="form-control" placeholder="e.g. Jr., Sr."></div>
                                <div class="form-group"><label>Date of Birth *</label><input type="date" id="regDob" class="form-control" required></div>
                                <div class="form-group">
                                    <label>Gender *</label>
                                    <select id="regGender" class="form-control" required>
                                        <option value="">Select Gender</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Civil Status *</label>
                                    <select id="regCivilStatus" class="form-control" required>
                                        <option value="Single">Single</option>
                                        <option value="Married">Married</option>
                                        <option value="Widowed">Widowed</option>
                                        <option value="Separated">Separated</option>
                                    </select>
                                </div>
                                <div class="form-group"><label>Contact Number *</label><input type="text" id="regContact" class="form-control" required></div>
                                <div class="form-group"><label>Email Address *</label><input type="email" id="regEmail" class="form-control" required></div>
                                <div class="form-group"><label>Purok *</label><input type="text" id="regPurok" class="form-control" placeholder="e.g. Purok 1" required></div>
                                <div class="form-group" style="grid-column: span 2;"><label>Full Address *</label><input type="text" id="regAddress" class="form-control" required></div>
                                <div class="form-group"><label>Emergency Contact Name *</label><input type="text" id="regEmerName" class="form-control" required></div>
                                <div class="form-group"><label>Emergency Contact Number *</label><input type="text" id="regEmerNum" class="form-control" required></div>
                                <div class="form-group"><label>Account Password *</label><input type="password" id="regPass" class="form-control" required></div>
                                <div class="form-group"><label>Confirm Password *</label><input type="password" id="regConfPass" class="form-control" required></div>
                            </div>
                            <div style="margin-top:20px; display:flex; gap:15px;">
                                <button type="button" onclick="renderLoginView()" class="btn btn-secondary"><i class="fa-solid fa-arrow-left"></i> Back to Login</button>
                                <button type="submit" class="btn btn-primary" style="flex-grow:1; justify-content:center;"><i class="fa-solid fa-paper-plane"></i> SUBMIT APPLICATION</button>
                            </div>
                        </form>
                    </div>
                </div>
            \`;
        }

        async function handleResidentRegistration(e) {
            e.preventDefault();
            const payload = {
                firstName: document.getElementById('regFirstName').value,
                middleName: document.getElementById('regMiddleName').value,
                lastName: document.getElementById('regLastName').value,
                suffix: document.getElementById('regSuffix').value,
                dateOfBirth: document.getElementById('regDob').value,
                gender: document.getElementById('regGender').value,
                civilStatus: document.getElementById('regCivilStatus').value,
                contactNumber: document.getElementById('regContact').value,
                email: document.getElementById('regEmail').value,
                address: document.getElementById('regAddress').value,
                purok: document.getElementById('regPurok').value,
                emergencyContact: document.getElementById('regEmerName').value,
                emergencyContactNumber: document.getElementById('regEmerNum').value,
                password: document.getElementById('regPass').value,
                confirmPassword: document.getElementById('regConfPass').value
            };

            try {
                const res = await fetch('/api/register-resident', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.error) return alert(data.error);

                alert("REGISTRATION SUCCESSFUL! Application Number: " + data.residentNumber + ". Please await staff approval.");
                renderLoginView();
            } catch (err) { alert("Registration Failed: " + err.message); }
        }

        // ============================================================================
        // STAFF PORTAL VIEWS & NAVIGATION
        // ============================================================================

        function renderStaffPortal() {
            const app = document.getElementById('app');
            app.innerHTML = \`
                <div class="sidebar">
                    <div class="sidebar-header">
                        <i class="fa-solid fa-building-columns" style="font-size: 24px;"></i>
                        <div>
                            <h2>\${currentSettings ? currentSettings.barangay_name : 'Barangay Admin'}</h2>
                            <span style="font-size:10px; opacity:0.8;">STAFF PORTAL</span>
                        </div>
                    </div>
                    <ul class="sidebar-menu">
                        <li><a href="#" onclick="loadDashboard()" class="active"><i class="fa-solid fa-chart-line"></i> Dashboard</a></li>
                        <li><a href="#" onclick="loadResidentApprovals()"><i class="fa-solid fa-user-check"></i> Resident Approvals</a></li>
                        <li><a href="#" onclick="loadResidents()"><i class="fa-solid fa-users"></i> Resident Management</a></li>
                        <li><a href="#" onclick="loadHouseholds()"><i class="fa-solid fa-house"></i> Households</a></li>
                        <li><a href="#" onclick="loadCertificates()"><i class="fa-solid fa-file-contract"></i> Certificate Requests</a></li>
                        <li><a href="#" onclick="loadScanClaimQr()"><i class="fa-solid fa-qrcode"></i> QR Certificate Claim</a></li>
                        <li><a href="#" onclick="loadBlotter()"><i class="fa-solid fa-book"></i> Blotter Records</a></li>
                        <li><a href="#" onclick="loadComplaints()"><i class="fa-solid fa-triangle-exclamation"></i> Complaints</a></li>
                        <li><a href="#" onclick="loadAnnouncements()"><i class="fa-solid fa-bullhorn"></i> Announcements</a></li>
                        <li><a href="#" onclick="loadSettings()"><i class="fa-solid fa-gear"></i> Settings</a></li>
                        <li><a href="#" onclick="handleLogout()"><i class="fa-solid fa-right-from-bracket"></i> Logout</a></li>
                    </ul>
                </div>
                <div class="main-content">
                    <div class="top-navbar">
                        <h4 id="pageTitle">Dashboard Overview</h4>
                        <div class="user-profile">
                            <span style="font-size:13px; font-weight:600;"><i class="fa-solid fa-user"></i> \${currentUser ? currentUser.name : 'Staff'} (\${currentUser ? currentUser.role : ''})</span>
                        </div>
                    </div>
                    <div class="page-container" id="mainContainer"></div>
                </div>
            \`;
            loadDashboard();
        }

        async function loadDashboard() {
            document.getElementById('pageTitle').innerText = "Dashboard Overview";
            const container = document.getElementById('mainContainer');
            container.innerHTML = '<p>Loading statistics from database...</p>';

            try {
                const res = await fetch('/api/staff/dashboard-stats');
                const stats = await res.json();

                container.innerHTML = \`
                    <div class="card-grid">
                        <div class="stat-card green"><div class="info"><div class="title">TOTAL RESIDENTS</div><div class="val">\${stats.totalResidents}</div></div><i class="fa-solid fa-users"></i></div>
                        <div class="stat-card yellow"><div class="info"><div class="title">PENDING APPROVALS</div><div class="val">\${stats.pendingResidents}</div></div><i class="fa-solid fa-clock"></i></div>
                        <div class="stat-card"><div class="info"><div class="title">TOTAL HOUSEHOLDS</div><div class="val">\${stats.totalHouseholds}</div></div><i class="fa-solid fa-house"></i></div>
                        <div class="stat-card green"><div class="info"><div class="title">PENDING CERTS</div><div class="val">\${stats.pendingCertificates}</div></div><i class="fa-solid fa-file-contract"></i></div>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                        <div class="content-card">
                            <div class="content-header"><h3><i class="fa-solid fa-chart-pie"></i> Gender Demographics</h3></div>
                            <canvas id="genderChart" style="max-height:250px;"></canvas>
                        </div>
                        <div class="content-card">
                            <div class="content-header"><h3><i class="fa-solid fa-layer-group"></i> Special Population</h3></div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-top:20px;">
                                <div style="padding:15px; background:#f8fafc; border-radius:8px;"><strong>Senior Citizens:</strong> \${stats.seniorCitizens}</div>
                                <div style="padding:15px; background:#f8fafc; border-radius:8px;"><strong>PWD:</strong> \${stats.pwd}</div>
                                <div style="padding:15px; background:#f8fafc; border-radius:8px;"><strong>Solo Parents:</strong> \${stats.soloParents}</div>
                                <div style="padding:15px; background:#f8fafc; border-radius:8px;"><strong>Registered Voters:</strong> \${stats.voters}</div>
                            </div>
                        </div>
                    </div>
                \`;

                // Render Chart.js
                const ctx = document.getElementById('genderChart').getContext('2d');
                new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Male', 'Female'],
                        datasets: [{ data: [stats.maleResidents, stats.femaleResidents], backgroundColor: ['#1e40af', '#0d7a40'] }]
                    }
                });
            } catch (err) { container.innerHTML = '<p style="color:red;">Failed to load statistics.</p>'; }
        }

        async function loadResidentApprovals() {
            document.getElementById('pageTitle').innerText = "Pending Resident Registration Approvals";
            const container = document.getElementById('mainContainer');
            container.innerHTML = '<p>Loading pending applications...</p>';

            try {
                const res = await fetch('/api/residents?status=PENDING');
                const residents = await res.json();

                let html = \`
                    <div class="content-card">
                        <div class="table-responsive">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Applicant Name</th>
                                        <th>Registration Date</th>
                                        <th>Contact</th>
                                        <th>Purok</th>
                                        <th>Address</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                \`;

                if (residents.length === 0) {
                    html += \`<tr><td colspan="6" style="text-align:center;">No pending resident applications found.</td></tr>\`;
                } else {
                    residents.forEach(r => {
                        html += \`
                            <tr>
                                <td><strong>\${r.first_name} \${r.last_name}</strong></td>
                                <td>\${new Date(r.created_at).toLocaleDateString()}</td>
                                <td>\${r.contact_number}</td>
                                <td>\${r.purok}</td>
                                <td>\${r.address}</td>
                                <td>
                                    <button onclick="approveResident('\${r.id}')" class="btn btn-primary btn-sm"><i class="fa-solid fa-check"></i> Approve</button>
                                    <button onclick="promptRejectResident('\${r.id}')" class="btn btn-danger btn-sm"><i class="fa-solid fa-xmark"></i> Reject</button>
                                </td>
                            </tr>
                        \`;
                    });
                }

                html += \`</tbody></table></div></div>\`;
                container.innerHTML = html;
            } catch (err) { container.innerHTML = '<p style="color:red;">Error loading resident approvals.</p>'; }
        }

        async function approveResident(id) {
            if (!confirm("Are you sure you want to approve this resident application?")) return;
            try {
                const res = await fetch(\`/api/residents/approve/\${id}\`, { method: 'POST' });
                const data = await res.json();
                if (data.error) return alert(data.error);
                alert(data.message);
                loadResidentApprovals();
            } catch (err) { alert(err.message); }
        }

        function promptRejectResident(id) {
            const reason = prompt("Enter Rejection Reason:");
            if (!reason) return;
            rejectResident(id, reason);
        }

        async function rejectResident(id, rejectionReason) {
            try {
                const res = await fetch(\`/api/residents/reject/\${id}\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rejectionReason })
                });
                const data = await res.json();
                if (data.error) return alert(data.error);
                alert(data.message);
                loadResidentApprovals();
            } catch (err) { alert(err.message); }
        }

        async function loadResidents() {
            document.getElementById('pageTitle').innerText = "Approved Resident Database";
            const container = document.getElementById('mainContainer');

            try {
                const res = await fetch('/api/residents?status=APPROVED');
                const residents = await res.json();

                let html = \`
                    <div class="content-card">
                        <div style="margin-bottom:15px; display:flex; justify-content:space-between;">
                            <input type="text" id="resSearch" class="form-control" style="max-width:300px;" placeholder="Search by name or Resident ID..." onkeyup="filterResidentTable()">
                            <button onclick="printSelected8Ids()" class="btn btn-secondary"><i class="fa-solid fa-print"></i> Batch Print Selected 8-IDs Sheet</button>
                        </div>
                        <div class="table-responsive">
                            <table id="resTable">
                                <thead>
                                    <tr>
                                        <th><input type="checkbox" onclick="toggleSelectAllIds(this)"></th>
                                        <th>Resident ID</th>
                                        <th>Name</th>
                                        <th>Gender</th>
                                        <th>Purok</th>
                                        <th>Contact</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                \`;

                residents.forEach(r => {
                    html += \`
                        <tr>
                            <td><input type="checkbox" class="id-select-cb" value="\${r.id}"></td>
                            <td><strong>\${r.resident_number}</strong></td>
                            <td>\${r.first_name} \${r.last_name}</td>
                            <td>\${r.gender}</td>
                            <td>\${r.purok}</td>
                            <td>\${r.contact_number}</td>
                            <td><span class="badge badge-approved">\${r.status}</span></td>
                            <td>
                                <button onclick="viewDigitalId('\${r.id}')" class="btn btn-primary btn-sm"><i class="fa-solid fa-id-card"></i> View Digital ID</button>
                                <button onclick="archiveResident('\${r.id}')" class="btn btn-danger btn-sm"><i class="fa-solid fa-box-archive"></i> Archive</button>
                            </td>
                        </tr>
                    \`;
                });

                html += \`</tbody></table></div></div>\`;
                container.innerHTML = html;
            } catch (err) { container.innerHTML = '<p>Error loading residents.</p>'; }
        }

        async function archiveResident(id) {
            if (!confirm("Are you sure you want to archive this resident record?")) return;
            try {
                const res = await fetch(\`/api/residents/archive/\${id}\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ statusReason: 'ARCHIVED' })
                });
                const data = await res.json();
                if (data.error) return alert(data.error);
                alert(data.message);
                loadResidents();
            } catch (err) { alert(err.message); }
        }

        async function viewDigitalId(id) {
            try {
                const res = await fetch(\`/api/resident-id-card/\${id}\`);
                const data = await res.json();
                if (data.error) return alert(data.error);

                openModal("BARANGAY RESIDENT IDENTIFICATION CARD", \`
                    <div style="display:flex; flex-direction:column; align-items:center; gap:20px;">
                        \${data.html}
                        <button onclick="window.print()" class="btn btn-primary"><i class="fa-solid fa-print"></i> Print ID Card</button>
                    </div>
                \`);
            } catch (err) { alert(err.message); }
        }

        function toggleSelectAllIds(master) {
            document.querySelectorAll('.id-select-cb').forEach(cb => cb.checked = master.checked);
        }

        async function printSelected8Ids() {
            const selected = Array.from(document.querySelectorAll('.id-select-cb:checked')).map(cb => cb.value);
            if (selected.length === 0) return alert("Please select at least 1 resident to generate the batch print sheet.");

            try {
                const res = await fetch('/api/print-batch-ids', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ residentIds: selected, paperSize: 'A4' })
                });
                const data = await res.json();
                if (data.error) return alert(data.error);

                const win = window.open('', '_blank');
                win.document.write(data.html);
                win.document.close();
            } catch (err) { alert(err.message); }
        }

        function loadScanClaimQr() {
            document.getElementById('pageTitle').innerText = "QR Code Certificate Claim Lookup";
            const container = document.getElementById('mainContainer');
            container.innerHTML = \`
                <div class="content-card" style="max-width:600px; margin:0 auto;">
                    <h3><i class="fa-solid fa-qrcode"></i> Scan/Paste Request Claim QR Token</h3>
                    <p style="font-size:13px; color:var(--text-muted); margin-bottom:15px;">Scan the resident's claim QR code token to quickly verify and mark documents as RELEASED.</p>
                    <div class="form-group">
                        <label>Claim Token</label>
                        <input type="text" id="claimTokenInput" class="form-control" placeholder="Paste Token UUID here...">
                    </div>
                    <button onclick="handleScanClaimLookup()" class="btn btn-primary" style="width:100%; justify-content:center;"><i class="fa-solid fa-search"></i> FETCH CLAIM DETAILS</button>
                    <div id="claimResultContainer" style="margin-top:20px;"></div>
                </div>
            \`;
        }

        async function handleScanClaimLookup() {
            const token = document.getElementById('claimTokenInput').value;
            const resContainer = document.getElementById('claimResultContainer');
            if (!token) return alert("Enter a token.");

            try {
                const res = await fetch(\`/api/certificates/claim-scan/\${token}\`);
                const data = await res.json();
                if (data.error) {
                    resContainer.innerHTML = \`<div style="color:red; padding:15px; background:#fee2e2; border-radius:8px;">\${data.error}</div>\`;
                    return;
                }

                resContainer.innerHTML = \`
                    <div style="border:2px solid var(--primary-green); padding:20px; border-radius:8px; background:#f0fdf4;">
                        <h4 style="color:var(--primary-green); margin-bottom:10px;"><i class="fa-solid fa-circle-check"></i> REQUEST FOUND</h4>
                        <p><strong>Resident:</strong> \${data.residents.first_name} \${data.residents.last_name} (\${data.residents.resident_number})</p>
                        <p><strong>Document:</strong> \${data.certificate_type}</p>
                        <p><strong>Purpose:</strong> \${data.purpose}</p>
                        <p><strong>Request Number:</strong> \${data.request_number}</p>
                        <p><strong>Current Status:</strong> <span class="badge badge-pending">\${data.status}</span></p>
                        <button onclick="markCertificateReleased('\${data.id}')" class="btn btn-primary" style="margin-top:15px; width:100%; justify-content:center;"><i class="fa-solid fa-box-archive"></i> MARK AS RELEASED</button>
                    </div>
                \`;
            } catch (err) { alert(err.message); }
        }

        async function markCertificateReleased(id) {
            try {
                const res = await fetch(\`/api/certificates/update-status/\${id}\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'RELEASED' })
                });
                const data = await res.json();
                if (data.error) return alert(data.error);
                alert("Certificate successfully marked as RELEASED!");
                loadScanClaimQr();
            } catch (err) { alert(err.message); }
        }

        // ============================================================================
        // RESIDENT PORTAL VIEWS
        // ============================================================================

        function renderResidentPortal() {
            const app = document.getElementById('app');
            app.innerHTML = \`
                <div class="sidebar">
                    <div class="sidebar-header">
                        <i class="fa-solid fa-user-gear" style="font-size:24px;"></i>
                        <div>
                            <h2>Resident Portal</h2>
                            <span style="font-size:10px; opacity:0.8;">\${currentSettings ? currentSettings.barangay_name : ''}</span>
                        </div>
                    </div>
                    <ul class="sidebar-menu">
                        <li><a href="#" onclick="loadResidentDashboard()" class="active"><i class="fa-solid fa-house-user"></i> My Dashboard</a></li>
                        <li><a href="#" onclick="loadMyDigitalId()"><i class="fa-solid fa-id-card"></i> My Digital ID</a></li>
                        <li><a href="#" onclick="loadMyCertificates()"><i class="fa-solid fa-file-contract"></i> Request Certificate</a></li>
                        <li><a href="#" onclick="handleLogout()"><i class="fa-solid fa-right-from-bracket"></i> Logout</a></li>
                    </ul>
                </div>
                <div class="main-content">
                    <div class="top-navbar">
                        <h4 id="pageTitle">Resident Dashboard</h4>
                        <div><span>Welcome, \${currentUser ? currentUser.name : 'Resident'}</span></div>
                    </div>
                    <div class="page-container" id="mainContainer"></div>
                </div>
            \`;
            loadResidentDashboard();
        }

        async function loadResidentDashboard() {
            document.getElementById('pageTitle').innerText = "Resident Portal Overview";
            const container = document.getElementById('mainContainer');
            container.innerHTML = \`
                <div class="content-card">
                    <h3>Welcome to the Barangay E-Services Portal</h3>
                    <p style="margin-top:10px; color:var(--text-muted);">Access barangay services, view your digital ID card, and request official documents directly online.</p>
                </div>
            \`;
        }

        async function loadMyDigitalId() {
            document.getElementById('pageTitle').innerText = "Official Digital Resident ID";
            const container = document.getElementById('mainContainer');
            if (!currentUser || !currentUser.residentId) {
                container.innerHTML = '<p style="color:red;">No resident ID linked to this account.</p>';
                return;
            }

            try {
                const res = await fetch(\`/api/resident-id-card/\${currentUser.residentId}\`);
                const data = await res.json();
                if (data.error) return container.innerHTML = \`<p style="color:red;">\${data.error}</p>\`;

                container.innerHTML = \`
                    <div class="content-card" style="display:flex; flex-direction:column; align-items:center; gap:20px;">
                        \${data.html}
                        <button onclick="window.print()" class="btn btn-primary"><i class="fa-solid fa-print"></i> Print ID Card</button>
                    </div>
                \`;
            } catch (err) { container.innerHTML = '<p style="color:red;">Error loading ID Card.</p>'; }
        }

        // Helpers & Modal Operations
        function openModal(title, bodyHtml) {
            document.getElementById('modalContent').innerHTML = \`
                <div class="modal-header">
                    <h3>\${title}</h3>
                    <button onclick="closeModal()" style="border:none; background:none; font-size:20px; cursor:pointer;">&times;</button>
                </div>
                <div>\${bodyHtml}</div>
            \`;
            document.getElementById('modalOverlay').classList.add('active');
        }

        function closeModal() {
            document.getElementById('modalOverlay').classList.remove('active');
        }

        async function handleLogout() {
            await fetch('/api/logout', { method: 'POST' });
            currentUser = null;
            renderLoginView();
        }

        // Start Application
        window.onload = initApp;
    </script>
</body>
</html>`;
}

// Layout Helper Generators for Dynamic Cards & Batch Sheets
function renderSingleIdCardHtml(settings, resData, qrDataUrl) {
  return `
    <div style="width: 330px; height: 210px; border: 2px solid #0d7a40; border-radius: 10px; background: #fff; padding: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); display: flex; flex-direction: column; justify-content: space-between; font-family: sans-serif; position: relative; box-sizing: border-box;">
        <div style="display: flex; align-items: center; gap: 8px; border-bottom: 2px solid #0d7a40; padding-bottom: 5px;">
            <div style="width: 32px; height: 32px; background: #0d7a40; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: bold; font-size: 14px;">B</div>
            <div>
                <div style="font-size: 10px; font-weight: bold; color: #0d7a40; text-transform: uppercase;">${settings.barangay_name || 'BARANGAY'}</div>
                <div style="font-size: 8px; color: #555;">${settings.municipality}, ${settings.province}</div>
            </div>
        </div>
        <div style="display: flex; gap: 10px; align-items: center; margin: 5px 0;">
            <div style="width: 70px; height: 70px; background: #e5e7eb; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 24px; border: 1px solid #ccc;">
                <i class="fa-solid fa-user"></i>
            </div>
            <div style="flex-grow: 1; font-size: 10px; color: #111;">
                <div style="font-size: 12px; font-weight: bold; color: #1e40af; border-bottom: 1px solid #ddd; padding-bottom: 2px;">${resData.first_name} ${resData.last_name}</div>
                <div style="margin-top: 3px;"><strong>ID:</strong> ${resData.resident_number}</div>
                <div><strong>DOB:</strong> ${resData.date_of_birth}</div>
                <div><strong>Sex:</strong> ${resData.gender}</div>
                <div><strong>Purok:</strong> ${resData.purok}</div>
            </div>
            <img src="${qrDataUrl}" style="width: 55px; height: 55px;" alt="QR" />
        </div>
        <div style="background: #0d7a40; color: #fff; text-align: center; font-size: 8px; padding: 3px; border-radius: 4px; font-weight: bold; letter-spacing: 0.5px;">
            BARANGAY RESIDENT IDENTIFICATION CARD
        </div>
    </div>
  `;
}

function render8IdPrintSheetHtml(cardsHtmlArray, paperSize) {
  return `<!DOCTYPE html>
<html>
<head>
    <title>8-ID Print Sheet</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        @page { size: ${paperSize || 'A4'}; margin: 10mm; }
        body { font-family: sans-serif; background: #fff; margin: 0; padding: 0; }
        .grid-sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15mm 10mm; justify-items: center; align-items: center; padding: 10mm 0; }
        @media print {
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="no-print" style="padding: 15px; background: #f3f4f6; text-align: center; border-bottom: 1px solid #ccc;">
        <button onclick="window.print()" style="padding: 10px 20px; background: #0d7a40; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">PRINT 8-ID SHEET</button>
    </div>
    <div class="grid-sheet">
        ${cardsHtmlArray.join('')}
    </div>
</body>
</html>`;
}

function renderVerificationResultPage(settings, resident, isValid) {
  return `<!DOCTYPE html>
<html>
<head>
    <title>Barangay ID Verification</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body { font-family: sans-serif; background: #f3f4f6; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .card { background: #fff; border-radius: 12px; padding: 30px; width: 90%; max-width: 400px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); text-align: center; }
        .badge { display: inline-block; padding: 6px 16px; border-radius: 50px; font-weight: bold; font-size: 14px; margin-bottom: 20px; }
        .valid { background: #d1fae5; color: #059669; }
        .invalid { background: #fee2e2; color: #dc2626; }
    </style>
</head>
<body>
    <div class="card">
        <h2>${settings ? settings.barangay_name : 'Barangay Verification'}</h2>
        <p style="font-size: 12px; color: #6b7280; margin-bottom: 20px;">Official Identification Verification</p>
        ${isValid ? `
            <div class="badge valid"><i class="fa-solid fa-circle-check"></i> VALID RESIDENT ID</div>
            <p style="text-align:left; margin-bottom:8px;"><strong>Name:</strong> ${resident.first_name}${resident.last_name}</p>
            <p style="text-align:left; margin-bottom:8px;"><strong>ID Number:</strong> ${resident.resident_number}</p>
            <p style="text-align:left; margin-bottom:8px;"><strong>Purok:</strong> ${resident.purok}</p>
            <p style="text-align:left; margin-bottom:8px;"><strong>Status:</strong> ${resident.status}</p>
        ` : `
            <div class="badge invalid"><i class="fa-solid fa-triangle-exclamation"></i> INVALID / UNVERIFIED ID</div>
            <p style="color:#6b7280; font-size:14px;">The scanned identification token does not correspond to an active record in our database.</p>
        `}
    </div>
</body>
</html>`;
}

function renderDbConfigErrorPage() {
  return `<!DOCTYPE html>
<html>
<head><title>Database Configuration Required</title></head>
<body style="font-family:sans-serif; background:#f3f4f6; display:flex; justify-content:center; align-items:center; height:100vh;">
    <div style="background:#fff; padding:40px; border-radius:12px; box-shadow:0 10px 15px rgba(0,0,0,0.1); max-width:500px; text-align:center;">
        <h2 style="color:#dc2626;">DATABASE NOT CONFIGURED</h2>
        <p style="color:#4b5563; margin-top:10px; line-height:1.5;">Please configure <strong>SUPABASE_URL</strong> and <strong>SUPABASE_ANON_KEY</strong> inside <code>app.js</code> or as environment variables in Render to connect the database.</p>
    </div>
</body>
</html>`;
}

// Single Entry-Point Route
app.get('*', (req, res) => {
  res.send(renderMainAppPage());
});

// ============================================================================
// SERVER INITIALIZATION
// ============================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`Barangay Resident Management System Running`);
  console.log(`Server listening on port: ${PORT}`);
  console.log(`===================================================`);
});
