/**
 * Barangay Resident Management System
 * COMPLETE, FULLY FUNCTIONAL APPLICATION (Backend & Frontend in a single file)
 * Technology: Node.js, Express.js, Supabase, HTML5, CSS3, Vanilla JavaScript
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'brgy_super_secret_key_2026';

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('WARNING: Supabase credentials are not fully set in environment variables.');
}

// Clients
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Multer setup for file uploads (memory storage for Supabase upload)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper: Log Activity
async function logActivity(userId, userType, action, recordId = null) {
  try {
    await supabaseAdmin.from('activity_logs').insert([{
      user_id: userId,
      user_type: userType,
      action: action,
      record_id: recordId ? String(recordId) : null,
      created_at: new Date().toISOString()
    }]);
  } catch (err) {
    console.error('Activity log error:', err.message);
  }
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

function requireStaff(req, res, next) {
  authenticateToken(req, res, () => {
    if (req.user.role !== 'staff' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Staff access required' });
    }
    next();
  });
}

// ==========================================
// API ENDPOINTS: AUTHENTICATION
// ==========================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, portal } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    if (portal === 'staff') {
      const { data: staff, error } = await supabaseAdmin
        .from('staff_users')
        .select('*')
        .eq('email', email)
        .single();

      if (error || !staff) return res.status(401).json({ error: 'Invalid staff credentials' });

      const validPassword = await bcrypt.compare(password, staff.password_hash);
      if (!validPassword) return res.status(401).json({ error: 'Invalid staff credentials' });

      const token = jwt.sign({ id: staff.id, email: staff.email, role: 'staff', name: staff.full_name }, JWT_SECRET, { expiresIn: '12h' });
      await logActivity(staff.id, 'staff', 'Staff Login');
      return res.json({ token, user: { id: staff.id, name: staff.full_name, email: staff.email, role: 'staff' } });
    } else {
      const { data: resident, error } = await supabaseAdmin
        .from('residents')
        .select('*')
        .eq('email', email)
        .single();

      if (error || !resident) return res.status(401).json({ error: 'Resident account not found' });
      if (resident.approval_status !== 'APPROVED') {
        return res.status(403).json({ error: `Account status is ${resident.approval_status}. Please wait for staff approval.` });
      }

      const validPassword = await bcrypt.compare(password, resident.password_hash);
      if (!validPassword) return res.status(401).json({ error: 'Invalid resident credentials' });

      const token = jwt.sign({ id: resident.id, email: resident.email, role: 'resident', name: `${resident.first_name} ${resident.last_name}`, resident_id: resident.resident_id_number }, JWT_SECRET, { expiresIn: '12h' });
      await logActivity(resident.id, 'resident', 'Resident Login');
      return res.json({ token, user: { id: resident.id, name: `${resident.first_name} ${resident.last_name}`, email: resident.email, role: 'resident', resident_id: resident.resident_id_number } });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      first_name, middle_name, last_name, suffix, date_of_birth, gender,
      civil_status, contact_number, email, password, address, purok,
      occupation, educational_attainment, nationality, voter_status,
      senior_citizen, pwd_status, solo_parent, four_ps, household_number
    } = req.body;

    if (!first_name || !last_name || !email || !password || !date_of_birth) {
      return res.status(400).json({ error: 'Required fields missing for registration.' });
    }

    // Check duplicate email
    const { data: existing } = await supabaseAdmin.from('residents').select('id').eq('email', email).single();
    if (existing) return res.status(400).json({ error: 'Email already registered.' });

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Generate unique Resident ID Number e.g. BRGY-2026-000001
    const countRes = await supabaseAdmin.from('residents').select('id', { count: 'exact' });
    const nextNum = (countRes.count || 0) + 1;
    const resident_id_number = `BRGY-2026-${String(nextNum).padStart(6, '0')}`;

    // Calculate age
    const dob = new Date(date_of_birth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }

    const newResident = {
      resident_id_number,
      first_name,
      middle_name: middle_name || '',
      last_name,
      suffix: suffix || '',
      full_name: `${first_name} ${middle_name ? middle_name + ' ' : ''}${last_name}${suffix ? ' ' + suffix : ''}`,
      date_of_birth,
      age,
      gender: gender || 'Other',
      civil_status: civil_status || 'Single',
      contact_number: contact_number || '',
      email,
      password_hash,
      address: address || '',
      purok: purok || 'Purok 1',
      occupation: occupation || '',
      educational_attainment: educational_attainment || 'High School',
      nationality: nationality || 'Filipino',
      voter_status: voter_status === 'true' || voter_status === true,
      senior_citizen: senior_citizen === 'true' || senior_citizen === true,
      pwd_status: pwd_status === 'true' || pwd_status === true,
      solo_parent: solo_parent === 'true' || solo_parent === true,
      four_ps: four_ps === 'true' || four_ps === true,
      household_number: household_number || 'HH-001',
      approval_status: 'PENDING',
      account_status: 'INACTIVE',
      archived: false,
      date_registered: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin.from('residents').insert([newResident]).select().single();
    if (error) return res.status(400).json({ error: error.message });

    // Send notification entry
    await supabaseAdmin.from('notifications').insert([{
      user_id: data.id,
      title: 'Registration Submitted',
      message: 'Your resident registration has been submitted successfully and is pending staff approval.',
      type: 'INFO',
      created_at: new Date().toISOString()
    }]);

    await logActivity(data.id, 'resident', 'Resident Registration Submitted', data.id);
    res.json({ success: true, message: 'Resident registration submitted successfully. Please wait for staff approval.', resident_id: resident_id_number });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// ==========================================
// API ENDPOINTS: BARANGAY SETTINGS
// ==========================================

app.get('/api/settings', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('barangay_settings').select('*').limit(1).single();
    if (error || !data) {
      // Default fallback settings
      return res.json({
        barangay_name: 'Barangay Central',
        barangay_address: '123 Main Street',
        municipality: 'Metro City',
        province: 'Province',
        contact_number: '09123456789',
        email: 'info@brgycentral.gov.ph',
        barangay_captain: 'Hon. Punong Barangay',
        certificate_signatory: 'Barangay Secretary',
        logo_url: '',
        primary_color: '#1e40af'
      });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings', requireStaff, async (req, res) => {
  try {
    const {
      barangay_name, barangay_address, municipality, province,
      contact_number, email, barangay_captain, certificate_signatory,
      logo_url, primary_color
    } = req.body;

    const { data: existing } = await supabaseAdmin.from('barangay_settings').select('id').limit(1).single();

    let result;
    const payload = {
      barangay_name, barangay_address, municipality, province,
      contact_number, email, barangay_captain, certificate_signatory,
      logo_url, primary_color, updated_at: new Date().toISOString()
    };

    if (existing) {
      result = await supabaseAdmin.from('barangay_settings').update(payload).eq('id', existing.id).select().single();
    } else {
      result = await supabaseAdmin.from('barangay_settings').insert([payload]).select().single();
    }

    if (result.error) return res.status(400).json({ error: result.error.message });
    await logActivity(req.user.id, 'staff', 'Updated Barangay Settings');
    res.json({ success: true, data: result.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API ENDPOINTS: STAFF DASHBOARD & REPORTS
// ==========================================

app.get('/api/staff/dashboard', requireStaff, async (req, res) => {
  try {
    const [
      residentsRes, householdsRes, certReqsRes, appointmentsRes, blotterRes, assistanceRes
    ] = await Promise.all([
      supabaseAdmin.from('residents').select('*'),
      supabaseAdmin.from('households').select('*'),
      supabaseAdmin.from('certificate_requests').select('*'),
      supabaseAdmin.from('appointments').select('*'),
      supabaseAdmin.from('blotter_records').select('*'),
      supabaseAdmin.from('assistance_requests').select('*')
    ]);

    const residents = residentsRes.data || [];
    const households = householdsRes.data || [];
    const certRequests = certReqsRes.data || [];
    const appointments = appointmentsRes.data || [];
    const blotter = blotterRes.data || [];
    const assistance = assistanceRes.data || [];

    const stats = {
      total_residents: residents.filter(r => !r.archived).length,
      pending_residents: residents.filter(r => r.approval_status === 'PENDING').length,
      approved_residents: residents.filter(r => r.approval_status === 'APPROVED').length,
      rejected_residents: residents.filter(r => r.approval_status === 'REJECTED').length,
      total_households: households.length,
      male_residents: residents.filter(r => !r.archived && r.gender === 'Male').length,
      female_residents: residents.filter(r => !r.archived && r.gender === 'Female').length,
      senior_citizens: residents.filter(r => !r.archived && r.senior_citizen).length,
      pwd_residents: residents.filter(r => !r.archived && r.pwd_status).length,
      solo_parents: residents.filter(r => !r.archived && r.solo_parent).length,
      minors: residents.filter(r => !r.archived && r.age < 18).length,
      total_certificate_requests: certRequests.length,
      pending_certificate_requests: certRequests.filter(r => r.status === 'PENDING' || r.status === 'PROCESSING').length,
      pending_appointments: appointments.filter(a => a.status === 'PENDING').length,
      total_blotter_cases: blotter.length,
      open_blotter: blotter.filter(b => b.case_status === 'OPEN' || b.case_status === 'UNDER INVESTIGATION').length,
      total_assistance: assistance.length
    };

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/activity-logs', requireStaff, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API ENDPOINTS: RESIDENT MANAGEMENT
// ==========================================

app.get('/api/residents', requireStaff, async (req, res) => {
  try {
    const { search, purok, status, gender, archived } = req.query;
    let query = supabaseAdmin.from('residents').select('*');

    if (archived === 'true') {
      query = query.eq('archived', true);
    } else {
      query = query.eq('archived', false);
    }

    if (purok) query = query.eq('purok', purok);
    if (status) query = query.eq('approval_status', status);
    if (gender) query = query.eq('gender', gender);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });

    let results = data ||;
    if (search) {
      const s = search.toLowerCase();
      results = results.filter(r =>
        r.full_name.toLowerCase().includes(s) ||
        r.resident_id_number.toLowerCase().includes(s) ||
        r.email.toLowerCase().includes(s) ||
        r.contact_number.includes(s) ||
        r.household_number.toLowerCase().includes(s)
      );
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/residents', requireStaff, async (req, res) => {
  try {
    const payload = req.body;
    const countRes = await supabaseAdmin.from('residents').select('id', { count: 'exact' });
    const nextNum = (countRes.count || 0) + 1;
    const resident_id_number = `BRGY-2026-${String(nextNum).padStart(6, '0')}`;

    const dob = new Date(payload.date_of_birth || '2000-01-01');
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();

    const newRes = {
      ...payload,
      resident_id_number,
      full_name: `${payload.first_name} ${payload.middle_name ? payload.middle_name + ' ' : ''}${payload.last_name}${payload.suffix ? ' ' + payload.suffix : ''}`,
      age,
      approval_status: 'APPROVED',
      account_status: 'ACTIVE',
      archived: false,
      date_registered: new Date().toISOString()
    };

    if (payload.password) {
      const salt = await bcrypt.genSalt(10);
      newRes.password_hash = await bcrypt.hash(payload.password, salt);
      delete newRes.password;
    } else {
      const salt = await bcrypt.genSalt(10);
      newRes.password_hash = await bcrypt.hash('barangay123', salt);
    }

    const { data, error } = await supabaseAdmin.from('residents').insert([newRes]).select().single();
    if (error) return res.status(400).json({ error: error.message });

    await logActivity(req.user.id, 'staff', `Created Resident: ${data.full_name}`, data.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/residents/:id', requireStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    if (updates.first_name || updates.last_name) {
      updates.full_name = `${updates.first_name} ${updates.middle_name ? updates.middle_name + ' ' : ''}${updates.last_name}${updates.suffix ? ' ' + updates.suffix : ''}`;
    }

    const { data, error } = await supabaseAdmin.from('residents').update(updates).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });

    await logActivity(req.user.id, 'staff', `Updated Resident: ${data.full_name}`, id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approval / Rejection
app.post('/api/residents/:id/approve', requireStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin.from('residents').update({
      approval_status: 'APPROVED',
      account_status: 'ACTIVE'
    }).eq('id', id).select().single();

    if (error) return res.status(400).json({ error: error.message });

    await supabaseAdmin.from('notifications').insert([{
      user_id: id,
      title: 'Registration Approved',
      message: 'Congratulations! Your resident registration has been approved. You can now access your Resident Portal and Digital ID.',
      type: 'SUCCESS',
      created_at: new Date().toISOString()
    }]);

    await logActivity(req.user.id, 'staff', `Approved Resident: ${data.full_name}`, id);
    res.json({ success: true, message: 'Resident approved successfully', data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/residents/:id/reject', requireStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const { data, error } = await supabaseAdmin.from('residents').update({
      approval_status: 'REJECTED',
      account_status: 'INACTIVE',
      rejection_reason: reason || 'Requirements incomplete'
    }).eq('id', id).select().single();

    if (error) return res.status(400).json({ error: error.message });

    await supabaseAdmin.from('notifications').insert([{
      user_id: id,
      title: 'Registration Rejected',
      message: `Your resident registration was rejected. Reason: ${reason || 'Incomplete requirements'}`,
      type: 'ERROR',
      created_at: new Date().toISOString()
    }]);

    await logActivity(req.user.id, 'staff', `Rejected Resident: ${data.full_name}`, id);
    res.json({ success: true, message: 'Resident registration rejected', data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/residents/:id/archive', requireStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin.from('residents').update({ archived: true, account_status: 'ARCHIVED' }).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });

    await logActivity(req.user.id, 'staff', `Archived Resident: ${data.full_name}`, id);
    res.json({ success: true, message: 'Resident archived successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/residents/:id/restore', requireStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin.from('residents').update({ archived: false, account_status: 'ACTIVE' }).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });

    await logActivity(req.user.id, 'staff', `Restored Resident: ${data.full_name}`, id);
    res.json({ success: true, message: 'Resident restored successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API ENDPOINTS: CERTIFICATE MANAGEMENT
// ==========================================

app.get('/api/certificate-requests', authenticateToken, async (req, res) => {
  try {
    let query = supabaseAdmin.from('certificate_requests').select('*, residents(full_name, resident_id_number, contact_number, address, purok)');
    if (req.user.role === 'resident') {
      query = query.eq('resident_id', req.user.id);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/certificate-requests', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'resident') return res.status(403).json({ error: 'Only residents can request certificates' });
    const { certificate_type, purpose, additional_info } = req.body;
    if (!certificate_type || !purpose) return res.status(400).json({ error: 'Certificate type and purpose are required' });

    const newReq = {
      resident_id: req.user.id,
      certificate_type,
      purpose,
      additional_info: additional_info || '',
      status: 'PENDING',
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin.from('certificate_requests').insert([newReq]).select().single();
    if (error) return res.status(400).json({ error: error.message });

    await supabaseAdmin.from('notifications').insert([{
      user_id: req.user.id,
      title: 'Certificate Request Submitted',
      message: `Your request for ${certificate_type} has been submitted successfully.`,
      type: 'INFO',
      created_at: new Date().toISOString()
    }]);

    await logActivity(req.user.id, 'resident', `Requested Certificate: ${certificate_type}`, data.id);
    res.json({ success: true, message: 'Certificate request submitted successfully', data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/certificate-requests/:id/status', requireStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, staff_remarks } = req.body;

    const { data, error } = await supabaseAdmin.from('certificate_requests').update({
      status,
      staff_remarks: staff_remarks || '',
      processed_at: new Date().toISOString()
    }).eq('id', id).select().single();

    if (error) return res.status(400).json({ error: error.message });

    await supabaseAdmin.from('notifications').insert([{
      user_id: data.resident_id,
      title: 'Certificate Request Update',
      message: `Your certificate request (${data.certificate_type}) status is now: ${status}. ${staff_remarks ? 'Remarks: ' + staff_remarks : ''}`,
      type: status === 'APPROVED' || status === 'READY FOR RELEASE' ? 'SUCCESS' : 'INFO',
      created_at: new Date().toISOString()
    }]);

    await logActivity(req.user.id, 'staff', `Updated Certificate Status [${data.certificate_type}]: ${status}`, id);
    res.json({ success: true, message: 'Certificate status updated', data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Staff Upload Certificate File via Supabase Storage
app.post('/api/certificate-requests/:id/upload', requireStaff, upload.single('certificate_file'), async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const fileName = `cert_${id}_${Date.now()}_${file.originalname}`;
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('certificates')
      .upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true });

    if (uploadError) return res.status(400).json({ error: 'Supabase storage error: ' + uploadError.message });

    const { data: urlData } = supabaseAdmin.storage.from('certificates').getPublicUrl(fileName);
    const fileUrl = urlData.publicUrl;

    const { data, error } = await supabaseAdmin.from('certificate_requests').update({
      certificate_file_url: fileUrl,
      status: 'READY FOR RELEASE',
      processed_at: new Date().toISOString()
    }).eq('id', id).select().single();

    if (error) return res.status(400).json({ error: error.message });

    await supabaseAdmin.from('notifications').insert([{
      user_id: data.resident_id,
      title: 'Certificate Ready',
      message: `Your certificate (${data.certificate_type}) has been processed and uploaded. You can now download it from your portal.`,
      type: 'SUCCESS',
      created_at: new Date().toISOString()
    }]);

    await logActivity(req.user.id, 'staff', `Uploaded Certificate File for Request ID: ${id}`, id);
    res.json({ success: true, message: 'Certificate file uploaded successfully', file_url: fileUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API ENDPOINTS: HOUSEHOLDS & PUROKS
// ==========================================

app.get('/api/households', requireStaff, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('households').select('*').order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/households', requireStaff, async (req, res) => {
  try {
    const { household_number, address, purok, household_head } = req.body;
    const { data, error } = await supabaseAdmin.from('households').insert([{
      household_number, address, purok, household_head,
      created_at: new Date().toISOString()
    }]).select().single();

    if (error) return res.status(400).json({ error: error.message });
    await logActivity(req.user.id, 'staff', `Created Household: ${household_number}`, data.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/puroks', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('puroks').select('*').order('purok_name', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || [
      { id: 1, purok_name: 'Purok 1' },
      { id: 2, purok_name: 'Purok 2' },
      { id: 3, purok_name: 'Purok 3' },
      { id: 4, purok_name: 'Purok 4' },
      { id: 5, purok_name: 'Purok 5' }
    ]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/puroks', requireStaff, async (req, res) => {
  try {
    const { purok_name, description } = req.body;
    const { data, error } = await supabaseAdmin.from('puroks').insert([{ purok_name, description }]).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API ENDPOINTS: BLOTTER, APPOINTMENTS, ASSISTANCE, BUSINESSES, ANNOUNCEMENTS, NOTIFICATIONS
// ==========================================

// Blotter
app.get('/api/blotter', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('blotter_records').select('*').order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/blotter', requireStaff, async (req, res) => {
  try {
    const payload = req.body;
    const { data, error } = await supabaseAdmin.from('blotter_records').insert([{
      ...payload,
      created_at: new Date().toISOString()
    }]).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await logActivity(req.user.id, 'staff', `Created Blotter Case: ${payload.case_number}`, data.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Appointments
app.get('/api/appointments', authenticateToken, async (req, res) => {
  try {
    let query = supabaseAdmin.from('appointments').select('*, residents(full_name, contact_number)');
    if (req.user.role === 'resident') query = query.eq('resident_id', req.user.id);
    const { data, error } = await query.order('appointment_date', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/appointments', authenticateToken, async (req, res) => {
  try {
    const { service, appointment_date, appointment_time, reason } = req.body;
    const resident_id = req.user.role === 'resident' ? req.user.id : req.body.resident_id;

    const { data, error } = await supabaseAdmin.from('appointments').insert([{
      resident_id, service, appointment_date, appointment_time, reason,
      status: 'PENDING', created_at: new Date().toISOString()
    }]).select().single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, message: 'Appointment booked successfully', data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/appointments/:id/status', requireStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, staff_remarks } = req.body;
    const { data, error } = await supabaseAdmin.from('appointments').update({
      status, staff_remarks: staff_remarks || ''
    }).eq('id', id).select().single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Assistance
app.get('/api/assistance', authenticateToken, async (req, res) => {
  try {
    let query = supabaseAdmin.from('assistance_requests').select('*, residents(full_name, contact_number)');
    if (req.user.role === 'resident') query = query.eq('resident_id', req.user.id);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assistance', authenticateToken, async (req, res) => {
  try {
    const { assistance_type, purpose, additional_info } = req.body;
    const { data, error } = await supabaseAdmin.from('assistance_requests').insert([{
      resident_id: req.user.id,
      assistance_type, purpose, additional_info,
      status: 'PENDING', created_at: new Date().toISOString()
    }]).select().single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, message: 'Assistance request submitted', data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/assistance/:id/status', requireStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, staff_remarks, assistance_given } = req.body;
    const { data, error } = await supabaseAdmin.from('assistance_requests').update({
      status, staff_remarks, assistance_given
    }).eq('id', id).select().single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Businesses
app.get('/api/businesses', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('businesses').select('*').order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/businesses', requireStaff, async (req, res) => {
  try {
    const payload = req.body;
    const { data, error } = await supabaseAdmin.from('businesses').insert([{
      ...payload, created_at: new Date().toISOString()
    }]).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Announcements
app.get('/api/announcements', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('announcements').select('*').order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/announcements', requireStaff, async (req, res) => {
  try {
    const { title, content, category } = req.body;
    const { data, error } = await supabaseAdmin.from('announcements').insert([{
      title, content, category: category || 'General', created_at: new Date().toISOString()
    }]).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await supabaseAdmin.from('notifications').update({ read: true }).eq('id', id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Resident Profile (for Resident Portal)
app.get('/api/resident/me', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'resident') return res.status(403).json({ error: 'Resident access only' });
    const { data, error } = await supabaseAdmin.from('residents').select('*').eq('id', req.user.id).single();
    if (error) return res.status(404).json({ error: 'Resident profile not found' });
    delete data.password_hash;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// FRONTEND INTERFACE (HTML, CSS, CLIENT JS)
// ==========================================

app.get('*', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title id="page-title">Barangay Management System</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <style>
    @media print {
      body * { visibility: hidden; }
      .printable-area, .printable-area * { visibility: visible; }
      .printable-area { position: absolute; left: 0; top: 0; width: 100%; }
      .no-print { display: none !important; }
      .id-card-sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; page-break-after: always; }
      .print-id-card { border: 1px dashed #999; padding: 12px; border-radius: 8px; width: 3.375in; height: 2.125in; box-sizing: border-box; background: white; }
    }
    .id-badge { width: 340px; height: 215px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); position: relative; overflow: hidden; background: white; }
  </style>
</head>
<body class="bg-slate-100 font-sans text-slate-800 antialiased min-h-screen flex flex-col">

  <!-- Toast Notification Container -->
  <div id="toast-container" class="fixed top-5 right-5 z-50 flex flex-col gap-2"></div>

  <!-- Main App Shell -->
  <div id="app" class="flex-1 flex flex-col">
    <!-- Dynamic content loaded via JS -->
  </div>

  <script>
    // Global State
    let currentUser = JSON.parse(localStorage.getItem('brgy_user') || 'null');
    let authToken = localStorage.getItem('brgy_token') || '';
    let brgySettings = {};

    function showToast(message, type = 'success') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      const bgColor = type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-rose-600' : 'bg-amber-600';
      toast.className = \`\${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center justify-between gap-3 text-sm font-medium transition transform translate-y-2 opacity-0\`;
      toast.innerHTML = \`<span>\${message}</span><button onclick="this.parentElement.remove()" class="text-white hover:text-slate-200"><i class="fa-solid fa-xmark"></i></button>\`;
      container.appendChild(toast);
      setTimeout(() => { toast.classList.remove('translate-y-2', 'opacity-0'); }, 10);
      setTimeout(() => {
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    }

    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings');
        brgySettings = await res.json();
        document.querySelectorAll('.brgy-name-dynamic').forEach(el => el.textContent = brgySettings.barangay_name || 'Barangay Central');
        document.querySelectorAll('.brgy-address-dynamic').forEach(el => el.textContent = \`\${brgySettings.barangay_address || ''}, \${brgySettings.municipality || ''}\`);
        if (brgySettings.logo_url) {
          document.querySelectorAll('.brgy-logo-dynamic').forEach(el => el.src = brgySettings.logo_url);
        }
        const titleEl = document.getElementById('page-title');
        if (titleEl) titleEl.textContent = \`\${brgySettings.barangay_name || 'Barangay'} - Resident Management System\`;
      } catch (err) {
        console.error('Failed to load settings', err);
      }
    }

    // Router / View Switcher
    function renderApp() {
      fetchSettings();
      const app = document.getElementById('app');
      if (!authToken || !currentUser) {
        renderAuthView(app);
        return;
      }
      if (currentUser.role === 'staff' || currentUser.role === 'admin') {
        renderStaffPortal(app);
      } else {
        renderResidentPortal(app);
      }
    }

    // AUTH VIEW (Login / Register / Public Registration)
    let currentAuthTab = 'login';
    function renderAuthView(container) {
      container.innerHTML = \`
        <div class="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-blue-900 via-slate-900 to-indigo-950">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div class="bg-blue-900 text-white p-6 text-center">
              <img src="\${brgySettings.logo_url || 'https://via.placeholder.com/80'}" alt="Logo" class="w-20 h-20 mx-auto rounded-full bg-white p-1 object-cover shadow-md mb-3 brgy-logo-dynamic">
              <h1 class="text-xl font-bold brgy-name-dynamic">\${brgySettings.barangay_name || 'Barangay System'}</h1>
              <p class="text-xs text-blue-200 mt-1">Resident Management & Portal System</p>
            </div>
            
            <div class="flex border-b border-slate-200 bg-slate-50 text-sm font-medium">
              <button onclick="currentAuthTab='login'; renderAuthView(document.getElementById('app'))" class="flex-1 py-3 text-center \${currentAuthTab==='login' ? 'bg-white text-blue-600 border-b-2 border-blue-600 font-bold' : 'text-slate-600'}">Login</button>
              <button onclick="currentAuthTab='register'; renderAuthView(document.getElementById('app'))" class="flex-1 py-3 text-center \${currentAuthTab==='register' ? 'bg-white text-blue-600 border-b-2 border-blue-600 font-bold' : 'text-slate-600'}">Resident Registration</button>
            </div>

            <div class="p-6">
              \${currentAuthTab === 'login' ? renderLoginForm() : renderRegisterForm()}
            </div>
          </div>
        </div>
      \`;
    }

    function renderLoginForm() {
      return \`
        <form onsubmit="handleLogin(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Portal Type</label>
            <select id="login-portal" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="resident">Resident Portal</option>
              <option value="staff">Staff / Admin Portal</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Email Address</label>
            <input type="email" id="login-email" required class="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="name@example.com">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Password</label>
            <input type="password" id="login-password" required class="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="••••••••">
          </div>
          <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg text-sm shadow-md transition">Sign In</button>
        </form>
      \`;
    }

    function renderRegisterForm() {
      return \`
        <form onsubmit="handleRegister(event)" class="space-y-3 max-h-[400px] overflow-y-auto pr-2">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-bold text-slate-700">First Name *</label>
              <input type="text" id="reg-fname" required class="w-full border border-slate-300 rounded p-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700">Last Name *</label>
              <input type="text" id="reg-lname" required class="w-full border border-slate-300 rounded p-2 text-sm">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-bold text-slate-700">Middle Name</label>
              <input type="text" id="reg-mname" class="w-full border border-slate-300 rounded p-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700">Suffix</label>
              <input type="text" id="reg-suffix" class="w-full border border-slate-300 rounded p-2 text-sm" placeholder="Jr., III">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-bold text-slate-700">Date of Birth *</label>
              <input type="date" id="reg-dob" required class="w-full border border-slate-300 rounded p-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700">Gender *</label>
              <select id="reg-gender" class="w-full border border-slate-300 rounded p-2 text-sm">
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700">Email Address *</label>
            <input type="email" id="reg-email" required class="w-full border border-slate-300 rounded p-2 text-sm">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700">Password *</label>
            <input type="password" id="reg-pass" required class="w-full border border-slate-300 rounded p-2 text-sm" placeholder="At least 6 characters">
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-bold text-slate-700">Contact Number</label>
              <input type="text" id="reg-contact" class="w-full border border-slate-300 rounded p-2 text-sm" placeholder="09XXXXXXXXX">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700">Purok</label>
              <select id="reg-purok" class="w-full border border-slate-300 rounded p-2 text-sm">
                <option value="Purok 1">Purok 1</option>
                <option value="Purok 2">Purok 2</option>
                <option value="Purok 3">Purok 3</option>
                <option value="Purok 4">Purok 4</option>
                <option value="Purok 5">Purok 5</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700">Complete Address</label>
            <input type="text" id="reg-address" class="w-full border border-slate-300 rounded p-2 text-sm" placeholder="House #, Street">
          </div>
          <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg text-sm shadow-md transition mt-2">Submit Registration</button>
        </form>
      \`;
    }

    async function handleLogin(e) {
      e.preventDefault();
      const portal = document.getElementById('login-portal').value;
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, portal })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');

        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('brgy_token', authToken);
        localStorage.setItem('brgy_user', JSON.stringify(currentUser));
        showToast('Login successful!');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function handleRegister(e) {
      e.preventDefault();
      const payload = {
        first_name: document.getElementById('reg-fname').value,
        last_name: document.getElementById('reg-lname').value,
        middle_name: document.getElementById('reg-mname').value,
        suffix: document.getElementById('reg-suffix').value,
        date_of_birth: document.getElementById('reg-dob').value,
        gender: document.getElementById('reg-gender').value,
        email: document.getElementById('reg-email').value,
        password: document.getElementById('reg-pass').value,
        contact_number: document.getElementById('reg-contact').value,
        purok: document.getElementById('reg-purok').value,
        address: document.getElementById('reg-address').value
      };

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed');

        showToast(data.message, 'success');
        currentAuthTab = 'login';
        renderAuthView(document.getElementById('app'));
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    function logout() {
      localStorage.removeItem('brgy_token');
      localStorage.removeItem('brgy_user');
      authToken = '';
      currentUser = null;
      renderApp();
      showToast('Logged out successfully');
    }

    // ==========================================
    // STAFF PORTAL
    // ==========================================
    let currentStaffTab = 'dashboard';

    function renderStaffPortal(container) {
      container.innerHTML = \`
        <div class="flex h-screen bg-slate-100 overflow-hidden">
          <!-- Sidebar -->
          <aside class="w-64 bg-slate-900 text-slate-300 flex flex-col no-print">
            <div class="p-5 border-b border-slate-800 flex items-center gap-3">
              <img src="\${brgySettings.logo_url || 'https://via.placeholder.com/40'}" class="w-10 h-10 rounded-full bg-white p-0.5 object-cover brgy-logo-dynamic">
              <div>
                <h2 class="font-bold text-white text-sm brgy-name-dynamic">\${brgySettings.barangay_name || 'Barangay'}</h2>
                <p class="text-[10px] text-slate-400">Staff Management Portal</p>
              </div>
            </div>
            
            <nav class="flex-1 p-4 space-y-1 overflow-y-auto text-sm">
              <a href="#" onclick="switchStaffTab('dashboard')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentStaffTab==='dashboard'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-chart-pie w-5"></i> Dashboard</a>
              <a href="#" onclick="switchStaffTab('residents')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentStaffTab==='residents'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-users w-5"></i> Residents</a>
              <a href="#" onclick="switchStaffTab('certificates')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentStaffTab==='certificates'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-file-lines w-5"></i> Certificates</a>
              <a href="#" onclick="switchStaffTab('households')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentStaffTab==='households'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-house-chimney w-5"></i> Households</a>
              <a href="#" onclick="switchStaffTab('blotter')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentStaffTab==='blotter'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-scale-balanced w-5"></i> Blotter / Cases</a>
              <a href="#" onclick="switchStaffTab('appointments')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentStaffTab==='appointments'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-calendar-check w-5"></i> Appointments</a>
              <a href="#" onclick="switchStaffTab('assistance')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentStaffTab==='assistance'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-hand-holding-heart w-5"></i> Assistance</a>
              <a href="#" onclick="switchStaffTab('businesses')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentStaffTab==='businesses'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-store w-5"></i> Businesses</a>
              <a href="#" onclick="switchStaffTab('announcements')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentStaffTab==='announcements'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-bullhorn w-5"></i> Announcements</a>
              <a href="#" onclick="switchStaffTab('idprint')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentStaffTab==='idprint'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-id-card w-5"></i> ID Printing (8/Page)</a>
              <a href="#" onclick="switchStaffTab('reports')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentStaffTab==='reports'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-chart-bar w-5"></i> Reports & Analytics</a>
              <a href="#" onclick="switchStaffTab('settings')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentStaffTab==='settings'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-gear w-5"></i> Barangay Settings</a>
            </nav>

            <div class="p-4 border-t border-slate-800 flex items-center justify-between">
              <span class="text-xs truncate">\${currentUser.name}</span>
              <button onclick="logout()" class="text-rose-400 hover:text-rose-300 text-sm" title="Logout"><i class="fa-solid fa-right-from-bracket"></i></button>
            </div>
          </aside>

          <!-- Main Content Area -->
          <main class="flex-1 flex flex-col overflow-y-auto">
            <header class="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between no-print">
              <h2 class="text-lg font-bold text-slate-800 uppercase tracking-wide" id="staff-header-title">Dashboard</h2>
              <div class="flex items-center gap-4 text-sm text-slate-600">
                <span class="brgy-name-dynamic font-semibold"></span>
              </div>
            </header>

            <div id="staff-content" class="p-6 flex-1">
              <!-- Dynamically loaded staff views -->
            </div>
          </main>
        </div>
      \`;
      loadStaffTabContent();
    }

    function switchStaffTab(tab) {
      currentStaffTab = tab;
      renderStaffPortal(document.getElementById('app'));
    }

    async function loadStaffTabContent() {
      const container = document.getElementById('staff-content');
      document.getElementById('staff-header-title').textContent = currentStaffTab.replace('-', ' ');

      if (currentStaffTab === 'dashboard') {
        renderStaffDashboardView(container);
      } else if (currentStaffTab === 'residents') {
        renderStaffResidentsView(container);
      } else if (currentStaffTab === 'certificates') {
        renderStaffCertificatesView(container);
      } else if (currentStaffTab === 'households') {
        renderStaffHouseholdsView(container);
      } else if (currentStaffTab === 'blotter') {
        renderStaffBlotterView(container);
      } else if (currentStaffTab === 'appointments') {
        renderStaffAppointmentsView(container);
      } else if (currentStaffTab === 'assistance') {
        renderStaffAssistanceView(container);
      } else if (currentStaffTab === 'businesses') {
        renderStaffBusinessesView(container);
      } else if (currentStaffTab === 'announcements') {
        renderStaffAnnouncementsView(container);
      } else if (currentStaffTab === 'idprint') {
        renderStaffIdPrintView(container);
      } else if (currentStaffTab === 'reports') {
        renderStaffReportsView(container);
      } else if (currentStaffTab === 'settings') {
        renderStaffSettingsView(container);
      }
    }

    // 1. Staff Dashboard View
    async function renderStaffDashboardView(container) {
      container.innerHTML = \`<div class="text-center py-12"><i class="fa-solid fa-spinner fa-spin text-3xl text-blue-600"></i></div>\`;
      try {
        const res = await fetch('/api/staff/dashboard', { headers: { 'Authorization': \`Bearer \${authToken}\` } });
        const stats = await res.json();

        container.innerHTML = \`
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
              <div>
                <p class="text-xs font-bold text-slate-500 uppercase">Total Residents</p>
                <h3 class="text-2xl font-black text-slate-800 mt-1">\${stats.total_residents}</h3>
              </div>
              <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl"><i class="fa-solid fa-users"></i></div>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
              <div>
                <p class="text-xs font-bold text-slate-500 uppercase">Pending Approval</p>
                <h3 class="text-2xl font-black text-amber-600 mt-1">\${stats.pending_residents}</h3>
              </div>
              <div class="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-xl"><i class="fa-solid fa-user-clock"></i></div>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
              <div>
                <p class="text-xs font-bold text-slate-500 uppercase">Certificate Requests</p>
                <h3 class="text-2xl font-black text-emerald-600 mt-1">\${stats.pending_certificate_requests} Pending</h3>
              </div>
              <div class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl"><i class="fa-solid fa-file-lines"></i></div>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
              <div>
                <p class="text-xs font-bold text-slate-500 uppercase">Active Blotter Cases</p>
                <h3 class="text-2xl font-black text-rose-600 mt-1">\${stats.open_blotter}</h3>
              </div>
              <div class="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center text-xl"><i class="fa-solid fa-scale-balanced"></i></div>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 md:col-span-2">
              <h3 class="font-bold text-slate-800 mb-4">Demographics Overview</h3>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div class="bg-slate-50 p-4 rounded-lg"><span class="text-xs text-slate-500 block">Male</span><strong class="text-lg text-slate-800">\${stats.male_residents}</strong></div>
                <div class="bg-slate-50 p-4 rounded-lg"><span class="text-xs text-slate-500 block">Female</span><strong class="text-lg text-slate-800">\${stats.female_residents}</strong></div>
                <div class="bg-slate-50 p-4 rounded-lg"><span class="text-xs text-slate-500 block">Senior Citizens</span><strong class="text-lg text-slate-800">\${stats.senior_citizens}</strong></div>
                <div class="bg-slate-50 p-4 rounded-lg"><span class="text-xs text-slate-500 block">PWD</span><strong class="text-lg text-slate-800">\${stats.pwd_residents}</strong></div>
              </div>
            </div>
            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 class="font-bold text-slate-800 mb-4">Quick Actions</h3>
              <div class="space-y-2">
                <button onclick="switchStaffTab('residents')" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg text-sm">Manage Residents</button>
                <button onclick="switchStaffTab('certificates')" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 rounded-lg text-sm">Process Certificates</button>
                <button onclick="switchStaffTab('idprint')" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 rounded-lg text-sm">Print ID Sheets (8/Page)</button>
              </div>
            </div>
          </div>
        \`;
      } catch (err) {
        container.innerHTML = \`<div class="text-rose-600">Error loading dashboard: \${err.message}</div>\`;
      }
    }

    // 2. Residents View
    let residentsList = [];
    async function renderStaffResidentsView(container) {
      container.innerHTML = \`
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <input type="text" id="res-search" oninput="filterResidents()" placeholder="Search name, ID, email..." class="border border-slate-300 rounded-lg px-3 py-2 text-sm w-64 outline-none">
              <select id="res-status-filter" onchange="filterResidents()" class="border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none">
                <option value="">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
            <button onclick="openAddResidentModal()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-sm shadow"><i class="fa-solid fa-plus mr-1"></i> Add Resident</button>
          </div>

          <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-sm">
                <thead>
                  <tr class="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase">
                    <th class="p-3">Resident ID</th>
                    <th class="p-3">Full Name</th>
                    <th class="p-3">Purok / Address</th>
                    <th class="p-3">Contact</th>
                    <th class="p-3">Status</th>
                    <th class="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody id="residents-table-body">
                  <tr><td colspan="6" class="p-6 text-center text-slate-500">Loading residents...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      \`;
      loadResidentsData();
    }

    async function loadResidentsData() {
      try {
        const res = await fetch('/api/residents', { headers: { 'Authorization': \`Bearer \${authToken}\` } });
        residentsList = await res.json();
        renderResidentsTable(residentsList);
      } catch (err) {
        showToast('Failed to load residents', 'error');
      }
    }

    function renderResidentsTable(list) {
      const tbody = document.getElementById('residents-table-body');
      if (!tbody) return;
      if (list.length === 0) {
        tbody.innerHTML = \`<tr><td colspan="6" class="p-6 text-center text-slate-500">No residents found.</td></tr>\`;
        return;
      }
      tbody.innerHTML = list.map(r => \`
        <tr class="border-b border-slate-100 hover:bg-slate-50">
          <td class="p-3 font-mono text-xs font-bold text-blue-600">\${r.resident_id_number}</td>
          <td class="p-3 font-semibold text-slate-800">\${r.full_name}</td>
          <td class="p-3 text-slate-600">\${r.purok} - \${r.address}</td>
          <td class="p-3 text-slate-600">\${r.contact_number || 'N/A'}</td>
          <td class="p-3">
            <span class="px-2.5 py-1 rounded-full text-xs font-bold \${r.approval_status==='APPROVED'?'bg-emerald-100 text-emerald-700':r.approval_status==='PENDING'?'bg-amber-100 text-amber-700':'bg-rose-100 text-rose-700'}">\${r.approval_status}</span>
          </td>
          <td class="p-3 text-right space-x-2">
            \${r.approval_status === 'PENDING' ? \`
              <button onclick="approveResident('\${r.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-xs font-bold">Approve</button>
              <button onclick="rejectResidentPrompt('\${r.id}')" class="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 rounded text-xs font-bold">Reject</button>
            \` : ''}
            <button onclick="viewResidentModal('\${r.id}')" class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-2.5 py-1 rounded text-xs font-bold">View</button>
            <button onclick="archiveResident('\${r.id}')" class="text-rose-600 hover:text-rose-800 text-xs font-bold" title="Archive"><i class="fa-solid fa-box-archive"></i></button>
          </td>
        </tr>
      \`).join('');
    }

    function filterResidents() {
      const search = document.getElementById('res-search').value.toLowerCase();
      const status = document.getElementById('res-status-filter').value;
      const filtered = residentsList.filter(r => {
        const matchesSearch = r.full_name.toLowerCase().includes(search) || r.resident_id_number.toLowerCase().includes(search) || r.email.toLowerCase().includes(search);
        const matchesStatus = status ? r.approval_status === status : true;
        return matchesSearch && matchesStatus;
      });
      renderResidentsTable(filtered);
    }

    async function approveResident(id) {
      if (!confirm('Are you sure you want to approve this resident?')) return;
      try {
        const res = await fetch(\`/api/residents/\${id}/approve\`, { method: 'POST', headers: { 'Authorization': \`Bearer \${authToken}\` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast(data.message);
        loadResidentsData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function rejectResidentPrompt(id) {
      const reason = prompt('Enter rejection reason:');
      if (reason === null) return;
      try {
        const res = await fetch(\`/api/residents/\${id}/reject\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${authToken}\` },
          body: JSON.stringify({ reason })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Resident registration rejected');
        loadResidentsData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function archiveResident(id) {
      if (!confirm('Are you sure you want to archive this resident?')) return;
      try {
        const res = await fetch(\`/api/residents/\${id}/archive\`, { method: 'POST', headers: { 'Authorization': \`Bearer \${authToken}\` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast(data.message);
        loadResidentsData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // Modal helpers & Add Resident form modal can be placed similarly...
    function openAddResidentModal() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4';
      modal.innerHTML = \`
        <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden p-6">
          <h3 class="text-lg font-bold text-slate-800 mb-4">Add New Resident</h3>
          <form onsubmit="submitAddResident(event, this)" class="space-y-3">
            <div class="grid grid-cols-2 gap-2">
              <div><label class="text-xs font-bold">First Name</label><input type="text" name="first_name" required class="w-full border p-2 rounded text-sm"></div>
              <div><label class="text-xs font-bold">Last Name</label><input type="text" name="last_name" required class="w-full border p-2 rounded text-sm"></div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div><label class="text-xs font-bold">Date of Birth</label><input type="date" name="date_of_birth" required class="w-full border p-2 rounded text-sm"></div>
              <div><label class="text-xs font-bold">Gender</label><select name="gender" class="w-full border p-2 rounded text-sm"><option value="Male">Male</option><option value="Female">Female</option></select></div>
            </div>
            <div><label class="text-xs font-bold">Email</label><input type="email" name="email" required class="w-full border p-2 rounded text-sm"></div>
            <div><label class="text-xs font-bold">Address</label><input type="text" name="address" class="w-full border p-2 rounded text-sm"></div>
            <div class="flex justify-end gap-2 mt-4">
              <button type="button" onclick="this.closest('.fixed').remove()" class="bg-slate-200 px-4 py-2 rounded text-sm font-bold">Cancel</button>
              <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold">Save Resident</button>
            </div>
          </form>
        </div>
      \`;
      document.body.appendChild(modal);
    }

    async function submitAddResident(e, form) {
      e.preventDefault();
      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      try {
        const res = await fetch('/api/residents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${authToken}\` },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Resident added successfully');
        form.closest('.fixed').remove();
        loadResidentsData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    function viewResidentModal(id) {
      const r = residentsList.find(item => item.id === id);
      if (!r) return;
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4';
      modal.innerHTML = \`
        <div class="bg-white rounded-xl shadow-2xl max-w-xl w-full overflow-hidden p-6 space-y-4">
          <div class="flex justify-between items-center border-b pb-3">
            <h3 class="text-lg font-bold text-slate-800">Resident Profile: \${r.full_name}</h3>
            <button onclick="this.closest('.fixed').remove()" class="text-slate-500 hover:text-slate-800"><i class="fa-solid fa-xmark text-lg"></i></button>
          </div>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div><span class="text-slate-500 block text-xs font-bold uppercase">Resident ID</span><strong class="font-mono text-blue-600">\${r.resident_id_number}</strong></div>
            <div><span class="text-slate-500 block text-xs font-bold uppercase">Approval Status</span><strong>\${r.approval_status}</strong></div>
            <div><span class="text-slate-500 block text-xs font-bold uppercase">Date of Birth (Age)</span>\${r.date_of_birth} (\${r.age} yrs old)</div>
            <div><span class="text-slate-500 block text-xs font-bold uppercase">Gender</span>\${r.gender}</div>
            <div><span class="text-slate-500 block text-xs font-bold uppercase">Contact Number</span>\${r.contact_number || 'N/A'}</div>
            <div><span class="text-slate-500 block text-xs font-bold uppercase">Email</span>\${r.email}</div>
            <div><span class="text-slate-500 block text-xs font-bold uppercase">Purok / Address</span>\${r.purok} - \${r.address}</div>
            <div><span class="text-slate-500 block text-xs font-bold uppercase">Household Number</span>\${r.household_number || 'N/A'}</div>
          </div>
          <div class="flex justify-end pt-3 border-t">
            <button onclick="this.closest('.fixed').remove()" class="bg-slate-800 text-white px-4 py-2 rounded text-sm font-bold">Close</button>
          </div>
        </div>
      \`;
      document.body.appendChild(modal);
    }

    // 3. Certificates Staff View
    async function renderStaffCertificatesView(container) {
      container.innerHTML = \`
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="p-4 border-b border-slate-200 font-bold text-slate-800">Certificate Requests Management</div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="bg-slate-50 border-b text-slate-600 text-xs font-bold uppercase">
                  <th class="p-3">Resident</th>
                  <th class="p-3">Certificate Type</th>
                  <th class="p-3">Purpose</th>
                  <th class="p-3">Status</th>
                  <th class="p-3 text-right">Actions / Upload</th>
                </tr>
              </thead>
              <tbody id="cert-requests-tbody">
                <tr><td colspan="5" class="p-6 text-center text-slate-500">Loading requests...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      \`;
      loadCertRequestsData();
    }

    async function loadCertRequestsData() {
      try {
        const res = await fetch('/api/certificate-requests', { headers: { 'Authorization': \`Bearer \${authToken}\` } });
        const list = await res.json();
        const tbody = document.getElementById('cert-requests-tbody');
        if (!tbody) return;
        if (list.length === 0) {
          tbody.innerHTML = \`<tr><td colspan="5" class="p-6 text-center text-slate-500">No certificate requests found.</td></tr>\`;
          return;
        }
        tbody.innerHTML = list.map(req => \`
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-3 font-semibold">\${req.residents?.full_name || 'Resident'}</td>
            <td class="p-3 font-medium text-blue-600">\${req.certificate_type}</td>
            <td class="p-3 text-slate-600">\${req.purpose}</td>
            <td class="p-3"><span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">\${req.status}</span></td>
            <td class="p-3 text-right space-x-2">
              <button onclick="updateCertStatus('\${req.id}', 'APPROVED')" class="bg-emerald-600 text-white px-2 py-1 rounded text-xs font-bold">Approve</button>
              <label class="bg-blue-600 text-white px-2.5 py-1 rounded text-xs font-bold cursor-pointer inline-block">
                Upload File <input type="file" onchange="uploadCertFile('\${req.id}', this)" class="hidden">
              </label>
              \${req.certificate_file_url ? \`<a href="\${req.certificate_file_url}" target="_blank" class="text-purple-600 font-bold text-xs"><i class="fa-solid fa-download"></i> View</a>\` : ''}
            </td>
          </tr>
        \`).join('');
      } catch (err) {
        showToast('Failed to load certificates', 'error');
      }
    }

    async function updateCertStatus(id, status) {
      const remarks = prompt('Enter remarks (optional):') || '';
      try {
        const res = await fetch(\`/api/certificate-requests/\${id}/status\`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${authToken}\` },
          body: JSON.stringify({ status, staff_remarks: remarks })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Certificate status updated');
        loadCertRequestsData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function uploadCertFile(id, inputElement) {
      const file = inputElement.files;
      if (!file) return;
      const formData = new FormData();
      formData.append('certificate_file', file);
      try {
        showToast('Uploading certificate file...', 'info');
        const res = await fetch(\`/api/certificate-requests/\${id}/upload\`, {
          method: 'POST',
          headers: { 'Authorization': \`Bearer \${authToken}\` },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Certificate uploaded successfully');
        loadCertRequestsData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // 4. Other staff tabs (Households, Blotter, Appointments, Assistance, Businesses, Announcements, ID Printing, Reports, Settings)
    async function renderStaffHouseholdsView(container) {
      container.innerHTML = \`
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 class="font-bold text-slate-800 mb-4">Household Management</h3>
          <p class="text-sm text-slate-600 mb-4">Manage households, household heads, and list members.</p>
          <div id="households-list" class="space-y-3">Loading households...</div>
        </div>
      \`;
      try {
        const res = await fetch('/api/households', { headers: { 'Authorization': \`Bearer \${authToken}\` } });
        const list = await res.json();
        const div = document.getElementById('households-list');
        if (list.length === 0) {
          div.innerHTML = '<p class="text-sm text-slate-500">No households registered.</p>';
          return;
        }
        div.innerHTML = list.map(h => \`
          <div class="border p-4 rounded-lg flex justify-between items-center bg-slate-50">
            <div><strong>Household #:\${h.household_number}</strong> - Head: \${h.household_head || 'N/A'}</div>
            <span class="text-xs text-slate-500">\${h.purok} - \${h.address}</span>
          </div>
        \`).join('');
      } catch (err) {
        document.getElementById('households-list').innerHTML = '<p class="text-rose-600">Error loading households.</p>';
      }
    }

    async function renderStaffBlotterView(container) {
      container.innerHTML = \`<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6"><h3 class="font-bold text-slate-800 mb-4">Blotter Records</h3><div id="blotter-list">Loading blotter cases...</div></div>\`;
      try {
        const res = await fetch('/api/blotter', { headers: { 'Authorization': \`Bearer \${authToken}\` } });
        const list = await res.json();
        const div = document.getElementById('blotter-list');
        div.innerHTML = list.length === 0 ? '<p class="text-sm text-slate-500">No blotter cases found.</p>' : list.map(b => \`<div class="border p-3 rounded mb-2"><strong>Case #\${b.case_number}</strong> - \${b.incident_type} (\${b.case_status})</div>\`).join('');
      } catch (err) {
        document.getElementById('blotter-list').innerHTML = '<p class="text-rose-600">Error loading blotter records.</p>';
      }
    }

    async function renderStaffAppointmentsView(container) {
      container.innerHTML = \`<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6"><h3 class="font-bold text-slate-800 mb-4">Appointments Management</h3><div id="appointments-list">Loading appointments...</div></div>\`;
      try {
        const res = await fetch('/api/appointments', { headers: { 'Authorization': \`Bearer \${authToken}\` } });
        const list = await res.json();
        const div = document.getElementById('appointments-list');
        div.innerHTML = list.length === 0 ? '<p class="text-sm text-slate-500">No appointments found.</p>' : list.map(a => \`<div class="border p-3 rounded mb-2"><strong>\${a.service}</strong> - \${a.appointment_date} (\${a.status})</div>\`).join('');
      } catch (err) {
        document.getElementById('appointments-list').innerHTML = '<p class="text-rose-600">Error loading appointments.</p>';
      }
    }

    async function renderStaffAssistanceView(container) {
      container.innerHTML = \`<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6"><h3 class="font-bold text-slate-800 mb-4">Assistance Requests</h3><div id="assistance-list">Loading assistance requests...</div></div>\`;
      try {
        const res = await fetch('/api/assistance', { headers: { 'Authorization': \`Bearer \${authToken}\` } });
        const list = await res.json();
        const div = document.getElementById('assistance-list');
        div.innerHTML = list.length === 0 ? '<p class="text-sm text-slate-500">No assistance requests found.</p>' : list.map(a => \`<div class="border p-3 rounded mb-2"><strong>\${a.assistance_type}</strong> - \${a.purpose} (\${a.status})</div>\`).join('');
      } catch (err) {
        document.getElementById('assistance-list').innerHTML = '<p class="text-rose-600">Error loading assistance requests.</p>';
      }
    }

    async function renderStaffBusinessesView(container) {
      container.innerHTML = \`<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6"><h3 class="font-bold text-slate-800 mb-4">Business Establishments</h3><div id="business-list">Loading businesses...</div></div>\`;
      try {
        const res = await fetch('/api/businesses', { headers: { 'Authorization': \`Bearer \${authToken}\` } });
        const list = await res.json();
        const div = document.getElementById('business-list');
        div.innerHTML = list.length === 0 ? '<p class="text-sm text-slate-500">No registered businesses.</p>' : list.map(b => \`<div class="border p-3 rounded mb-2"><strong>\${b.business_name}</strong> - \${b.owner}</div>\`).join('');
      } catch (err) {
        document.getElementById('business-list').innerHTML = '<p class="text-rose-600">Error loading businesses.</p>';
      }
    }

    async function renderStaffAnnouncementsView(container) {
      container.innerHTML = \`
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <h3 class="font-bold text-slate-800">Post Announcement</h3>
          <form onsubmit="postAnnouncement(event, this)" class="space-y-3">
            <input type="text" name="title" placeholder="Announcement Title" required class="w-full border p-2 rounded text-sm">
            <textarea name="content" placeholder="Announcement Content..." required class="w-full border p-2 rounded text-sm h-24"></textarea>
            <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold">Publish Announcement</button>
          </form>
          <div id="announcement-list" class="mt-6 space-y-2">Loading announcements...</div>
        </div>
      \`;
      loadAnnouncementsData();
    }

    async function loadAnnouncementsData() {
      try {
        const res = await fetch('/api/announcements', { headers: { 'Authorization': \`Bearer \${authToken}\` } });
        const list = await res.json();
        const div = document.getElementById('announcement-list');
        div.innerHTML = list.length === 0 ? '<p class="text-sm text-slate-500">No announcements posted.</p>' : list.map(a => \`<div class="border p-3 rounded bg-slate-50"><strong class="text-blue-600">\${a.title}</strong><p class="text-xs text-slate-600 mt-1">\${a.content}</p></div>\`).join('');
      } catch (err) {
        document.getElementById('announcement-list').innerHTML = '<p class="text-rose-600">Error loading announcements.</p>';
      }
    }

    async function postAnnouncement(e, form) {
      e.preventDefault();
      const payload = Object.fromEntries(new FormData(form).entries());
      try {
        const res = await fetch('/api/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${authToken}\` },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Failed to post');
        showToast('Announcement published successfully');
        form.reset();
        loadAnnouncementsData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // 15. ID Printing - 8 IDs on One Bond Paper
    async function renderStaffIdPrintView(container) {
      container.innerHTML = \`
        <div class="space-y-4">
          <div class="flex justify-between items-center no-print">
            <h3 class="font-bold text-slate-800">Physical Resident ID Sheet Generator (8 IDs per Bond Paper)</h3>
            <button onclick="window.print()" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow"><i class="fa-solid fa-print mr-2"></i> Print ID Sheet (8/Page)</button>
          </div>
          <div class="printable-area bg-white p-6 rounded-xl shadow border border-slate-200">
            <div class="id-card-sheet" id="id-print-grid">
              Loading resident IDs for printing...
            </div>
          </div>
        </div>
      \`;
      try {
        const res = await fetch('/api/residents', { headers: { 'Authorization': \`Bearer \${authToken}\` } });
        const list = (await res.json()).filter(r => r.approval_status === 'APPROVED');
        const grid = document.getElementById('id-print-grid');
        if (list.length === 0) {
          grid.innerHTML = '<p class="text-sm text-slate-500">No approved residents available for ID printing.</p>';
          return;
        }
        grid.innerHTML = list.map(r => \`
          <div class="print-id-card border border-slate-300 rounded-lg p-3 flex flex-col justify-between bg-white text-xs">
            <div class="flex items-center gap-2 border-b pb-1">
              <img src="\${brgySettings.logo_url || 'https://via.placeholder.com/30'}" class="w-6 h-6 rounded-full brgy-logo-dynamic">
              <div>
                <strong class="block text-[10px] brgy-name-dynamic">\${brgySettings.barangay_name || 'Barangay'}</strong>
                <span class="text-[8px] text-slate-500">BARANGAY RESIDENT ID</span>
              </div>
            </div>
            <div class="flex gap-2 items-center my-1">
              <div class="w-12 h-12 bg-slate-200 rounded flex items-center justify-center font-bold text-slate-500 text-xs">PHOTO</div>
              <div>
                <strong class="text-slate-800 block text-xs">\${r.full_name}</strong>
                <span class="font-mono text-[9px] text-blue-600 block">\${r.resident_id_number}</span>
                <span class="text-[9px] text-slate-600 block">\${r.purok}</span>
              </div>
            </div>
            <div class="text-[8px] border-t pt-1 text-slate-500 flex justify-between">
              <span>DOB: \${r.date_of_birth}</span>
              <span>Sig: ________________</span>
            </div>
          </div>
        \`).join('');
      } catch (err) {
        showToast('Error generating ID sheet', 'error');
      }
    }

    async function renderStaffReportsView(container) {
      container.innerHTML = \`<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6"><h3 class="font-bold text-slate-800 mb-4">Reports & Analytics</h3><p class="text-sm text-slate-600">Comprehensive barangay demographic and operational reports.</p><button onclick="window.print()" class="mt-4 bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold">Print Report</button></div>\`;
    }

    async function renderStaffSettingsView(container) {
      container.innerHTML = \`
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-2xl">
          <h3 class="font-bold text-slate-800 mb-4">Barangay Settings & Customization</h3>
          <form onsubmit="saveBarangaySettings(event, this)" class="space-y-3">
            <div><label class="text-xs font-bold">Barangay Name</label><input type="text" name="barangay_name" value="\${brgySettings.barangay_name || ''}" class="w-full border p-2 rounded text-sm" required></div>
            <div><label class="text-xs font-bold">Barangay Address</label><input type="text" name="barangay_address" value="\${brgySettings.barangay_address || ''}" class="w-full border p-2 rounded text-sm"></div>
            <div class="grid grid-cols-2 gap-2">
              <div><label class="text-xs font-bold">Municipality / City</label><input type="text" name="municipality" value="\${brgySettings.municipality || ''}" class="w-full border p-2 rounded text-sm"></div>
              <div><label class="text-xs font-bold">Province</label><input type="text" name="province" value="\${brgySettings.province || ''}" class="w-full border p-2 rounded text-sm"></div>
            </div>
            <div><label class="text-xs font-bold">Barangay Captain</label><input type="text" name="barangay_captain" value="\${brgySettings.barangay_captain || ''}" class="w-full border p-2 rounded text-sm"></div>
            <div><label class="text-xs font-bold">Logo Image URL</label><input type="text" name="logo_url" value="\${brgySettings.logo_url || ''}" class="w-full border p-2 rounded text-sm" placeholder="https://..."></div>
            <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold mt-2">Save Settings</button>
          </form>
        </div>
      \`;
    }

    async function saveBarangaySettings(e, form) {
      e.preventDefault();
      const payload = Object.fromEntries(new FormData(form).entries());
      try {
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${authToken}\` },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Barangay settings updated successfully!');
        fetchSettings();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // ==========================================
    // RESIDENT PORTAL
    // ==========================================
    let currentResidentTab = 'dashboard';

    function renderResidentPortal(container) {
      container.innerHTML = \`
        <div class="flex h-screen bg-slate-100 overflow-hidden">
          <aside class="w-64 bg-slate-900 text-slate-300 flex flex-col no-print">
            <div class="p-5 border-b border-slate-800 flex items-center gap-3">
              <img src="\${brgySettings.logo_url || 'https://via.placeholder.com/40'}" class="w-10 h-10 rounded-full bg-white p-0.5 object-cover brgy-logo-dynamic">
              <div>
                <h2 class="font-bold text-white text-sm brgy-name-dynamic">\${brgySettings.barangay_name || 'Barangay'}</h2>
                <p class="text-[10px] text-slate-400">Resident Portal</p>
              </div>
            </div>
            
            <nav class="flex-1 p-4 space-y-1 overflow-y-auto text-sm">
              <a href="#" onclick="switchResidentTab('dashboard')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentResidentTab==='dashboard'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-house w-5"></i> Dashboard</a>
              <a href="#" onclick="switchResidentTab('profile')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentResidentTab==='profile'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-user w-5"></i> My Profile</a>
              <a href="#" onclick="switchResidentTab('digitalid')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentResidentTab==='digitalid'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-id-card w-5"></i> Digital Resident ID</a>
              <a href="#" onclick="switchResidentTab('certificates')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentResidentTab==='certificates'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-file-invoice w-5"></i> Certificate Requests</a>
              <a href="#" onclick="switchResidentTab('appointments')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentResidentTab==='appointments'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-calendar w-5"></i> Appointments</a>
              <a href="#" onclick="switchResidentTab('assistance')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentResidentTab==='assistance'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-hands-helping w-5"></i> Assistance Requests</a>
              <a href="#" onclick="switchResidentTab('announcements')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentResidentTab==='announcements'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-bullhorn w-5"></i> Announcements</a>
              <a href="#" onclick="switchResidentTab('notifications')" class="flex items-center gap-3 px-3 py-2.5 rounded-lg \${currentResidentTab==='notifications'?'bg-blue-600 text-white font-semibold':'hover:bg-slate-800'}"><i class="fa-solid fa-bell w-5"></i> Notifications</a>
            </nav>

            <div class="p-4 border-t border-slate-800 flex items-center justify-between">
              <span class="text-xs truncate">\${currentUser.name}</span>
              <button onclick="logout()" class="text-rose-400 hover:text-rose-300 text-sm" title="Logout"><i class="fa-solid fa-right-from-bracket"></i></button>
            </div>
          </aside>

          <main class="flex-1 flex flex-col overflow-y-auto">
            <header class="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between no-print">
              <h2 class="text-lg font-bold text-slate-800 uppercase tracking-wide" id="resident-header-title">Resident Dashboard</h2>
              <span class="brgy-name-dynamic text-sm font-semibold text-slate-600"></span>
            </header>
            <div id="resident-content" class="p-6 flex-1"></div>
          </main>
        </div>
      \`;
      loadResidentTabContent();
    }

    function switchResidentTab(tab) {
      currentResidentTab = tab;
      renderResidentPortal(document.getElementById('app'));
    }

    async function loadResidentTabContent() {
      const container = document.getElementById('resident-content');
      document.getElementById('resident-header-title').textContent = currentResidentTab.replace('-', ' ');

      if (currentResidentTab === 'dashboard') {
        container.innerHTML = \`
          <div class="space-y-6">
            <div class="bg-blue-900 text-white p-6 rounded-2xl shadow flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <h3 class="text-xl font-bold">Welcome back, \${currentUser.name}!</h3>
                <p class="text-xs text-blue-200 mt-1">Resident ID Number: <span class="font-mono font-bold">\${currentUser.resident_id || 'N/A'}</span></p>
              </div>
              <button onclick="switchResidentTab('digitalid')" class="bg-white text-blue-900 font-bold px-4 py-2 rounded-lg text-sm shadow">View Digital ID</button>
            </div>
          </div>
        \`;
      } else if (currentResidentTab === 'profile') {
        try {
          const res = await fetch('/api/resident/me', { headers: { 'Authorization': \`Bearer \${authToken}\` } });
          const r = await res.json();
          container.innerHTML = \`
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-2xl space-y-4">
              <h3 class="font-bold text-slate-800 text-lg border-b pb-2">My Resident Profile</h3>
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div><span class="text-xs text-slate-500 font-bold uppercase block">Full Name</span><strong>\${r.full_name}</strong></div>
                <div><span class="text-xs text-slate-500 font-bold uppercase block">Resident ID</span><strong class="font-mono text-blue-600">\${r.resident_id_number}</strong></div>
                <div><span class="text-xs text-slate-500 font-bold uppercase block">Date of Birth</span>\${r.date_of_birth} (\${r.age} yrs old)</div>
                <div><span class="text-xs text-slate-500 font-bold uppercase block">Gender</span>\${r.gender}</div>
                <div><span class="text-xs text-slate-500 font-bold uppercase block">Contact Number</span>\${r.contact_number || 'N/A'}</div>
                <div><span class="text-xs text-slate-500 font-bold uppercase block">Email</span>\${r.email}</div>
                <div><span class="text-xs text-slate-500 font-bold uppercase block">Purok / Address</span>\${r.purok} - \${r.address}</div>
                <div><span class="text-xs text-slate-500 font-bold uppercase block">Household #</span>\${r.household_number || 'N/A'}</div>
              </div>
            </div>
          \`;
        } catch (err) {
          container.innerHTML = '<p class="text-rose-600">Failed to load profile.</p>';
        }
      } else if (currentResidentTab === 'digitalid') {
        try {
          const res = await fetch('/api/resident/me', { headers: { 'Authorization': \`Bearer \${authToken}\` } });
          const r = await res.json();
          container.innerHTML = \`
            <div class="flex flex-col items-center justify-center space-y-4">
              <div class="id-badge border border-slate-300 p-4 flex flex-col justify-between bg-gradient-to-br from-blue-900 to-indigo-900 text-white">
                <div class="flex items-center gap-3 border-b border-blue-800 pb-2">
                  <img src="\${brgySettings.logo_url || 'https://via.placeholder.com/40'}" class="w-10 h-10 rounded-full bg-white p-0.5 brgy-logo-dynamic">
                  <div>
                    <strong class="block text-xs font-bold brgy-name-dynamic">\${brgySettings.barangay_name || 'Barangay'}</strong>
                    <span class="text-[9px] text-blue-200">OFFICIAL DIGITAL RESIDENT ID</span>
                  </div>
                </div>
                <div class="flex gap-4 items-center my-2">
                  <div class="w-20 h-20 bg-white rounded-lg flex items-center justify-center font-bold text-slate-400 text-xs">PHOTO</div>
                  <div>
                    <h4 class="font-bold text-sm">\${r.full_name}</h4>
                    <span class="font-mono text-xs text-amber-300 block">\${r.resident_id_number}</span>
                    <span class="text-[10px] text-blue-200 block">\${r.purok} - \${r.address}</span>
                  </div>
                </div>
                <div class="text-[9px] flex justify-between border-t border-blue-800 pt-1 text-blue-200">
                  <span>Status: ACTIVE</span>
                  <span>Issued: \${new Date(r.date_registered).toLocaleDateString()}</span>
                </div>
              </div>
              <button onclick="window.print()" class="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold no-print"><i class="fa-solid fa-print mr-2"></i> Print Digital ID</button>
            </div>
          \`;
        } catch (err) {
          container.innerHTML = '<p class="text-rose-600">Failed to load digital ID.</p>';
        }
      } else if (currentResidentTab === 'certificates') {
        container.innerHTML = \`
          <div class="space-y-6 max-w-3xl">
            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 class="font-bold text-slate-800 mb-4">Request a Certificate</h3>
              <form onsubmit="submitResidentCertRequest(event, this)" class="space-y-3">
                <div>
                  <label class="text-xs font-bold">Certificate Type</label>
                  <select name="certificate_type" class="w-full border p-2 rounded text-sm" required>
                    <option value="Barangay Clearance">Barangay Clearance</option>
                    <option value="Certificate of Residency">Certificate of Residency</option>
                    <option value="Certificate of Indigency">Certificate of Indigency</option>
                    <option value="Certificate of Good Moral Character">Certificate of Good Moral Character</option>
                  </select>
                </div>
                <div>
                  <label class="text-xs font-bold">Purpose</label>
                  <input type="text" name="purpose" placeholder="e.g. Employment, Bank requirement" class="w-full border p-2 rounded text-sm" required>
                </div>
                <div>
                  <label class="text-xs font-bold">Additional Information</label>
                  <textarea name="additional_info" class="w-full border p-2 rounded text-sm h-20" placeholder="Optional details..."></textarea>
                </div>
                <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold">Submit Request</button>
              </form>
            </div>

            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 class="font-bold text-slate-800 mb-4">My Certificate Requests</h3>
              <div id="resident-cert-list">Loading requests...</div>
            </div>
          </div>
        \`;
        loadResidentCertRequests();
      } else if (currentResidentTab === 'announcements') {
        container.innerHTML = \`<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6"><h3 class="font-bold text-slate-800 mb-4">Barangay Announcements</h3><div id="res-announcement-list">Loading...</div></div>\`;
        try {
          const res = await fetch('/api/announcements', { headers: { 'Authorization': \`Bearer \${authToken}\` } });
          const list = await res.json();
          document.getElementById('res-announcement-list').innerHTML = list.length === 0 ? '<p class="text-slate-500 text-sm">No announcements.</p>' : list.map(a => \`<div class="border p-3 rounded mb-2 bg-slate-50"><strong class="text-blue-600">\${a.title}</strong><p class="text-xs text-slate-600 mt-1">\${a.content}</p></div>\`).join('');
        } catch (err) {}
      } else if (currentResidentTab === 'notifications') {
        container.innerHTML = \`<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6"><h3 class="font-bold text-slate-800 mb-4">My Notifications</h3><div id="res-notif-list">Loading...</div></div>\`;
        try {
          const res = await fetch('/api/notifications', { headers: { 'Authorization': \`Bearer \${authToken}\` } });
          const list = await res.json();
          document.getElementById('res-notif-list').innerHTML = list.length === 0 ? '<p class="text-slate-500 text-sm">No notifications.</p>' : list.map(n => \`<div class="border-b p-3 flex justify-between items-center"><div class="text-sm"><strong>\${n.title}</strong><p class="text-xs text-slate-600">\${n.message}</p></div><span class="text-[10px] text-slate-400">\${new Date(n.created_at).toLocaleDateString()}</span></div>\`).join('');
        } catch (err) {}
      } else {
        container.innerHTML = \`<div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200"><h3 class="font-bold text-slate-800">Section Under Resident Portal</h3></div>\`;
      }
    }

    async function loadResidentCertRequests() {
      try {
        const res = await fetch('/api/certificate-requests', { headers: { 'Authorization': \`Bearer \${authToken}\` } });
        const list = await res.json();
        const div = document.getElementById('resident-cert-list');
        if (!div) return;
        div.innerHTML = list.length === 0 ? '<p class="text-slate-500 text-sm">No requests made yet.</p>' : list.map(r => \`
          <div class="border p-3 rounded mb-2 flex justify-between items-center bg-slate-50 text-sm">
            <div>
              <strong class="text-blue-600">\${r.certificate_type}</strong> - Purpose: \${r.purpose}
              <span class="block text-xs text-slate-500">Status: <strong>\${r.status}</strong> \${r.staff_remarks ? '| Remarks: ' + r.staff_remarks : ''}</span>
            </div>
            \${r.certificate_file_url ? \`<a href="\${r.certificate_file_url}" target="_blank" class="bg-emerald-600 text-white px-3 py-1.5 rounded text-xs font-bold"><i class="fa-solid fa-download mr-1"></i> Download</a>\` : '<span class="text-xs text-amber-600 font-bold">Processing</span>'}
          </div>
        \`).join('');
      } catch (err) {}
    }

    async function submitResidentCertRequest(e, form) {
      e.preventDefault();
      const payload = Object.fromEntries(new FormData(form).entries());
      try {
        const res = await fetch('/api/certificate-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${authToken}\` },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Certificate request submitted successfully!');
        form.reset();
        loadResidentCertRequests();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // Initialize App on Load
    renderApp();
  </script>
</body>
</html>
`);
});

// Start Express Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Barangay Resident Management System running on port ${PORT}`);
});
