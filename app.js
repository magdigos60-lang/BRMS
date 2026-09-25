/**
 * BARANGAY RESIDENT MANAGEMENT SYSTEM
 * Pure Node.js / Express.js Application powered by Supabase
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// ENV CONFIGURATION
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const JWT_SECRET = process.env.JWT_SECRET || 'barangay-super-secret-jwt-key-2026';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("WARNING: Supabase URL or Key environment variables are missing! Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// MIDDLEWARES
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// LOGGING HELPER
async function logActivity(userType, userId, userName, action, description, ip = '') {
    try {
        await supabase.from('activity_logs').insert([{
            user_type: userType,
            user_id: String(userId),
            user_name: userName,
            action: action,
            description: description,
            ip_address: ip
        }]);
    } catch (err) {
        console.error('Activity Log Error:', err);
    }
}

// AUTHENTICATION MIDDLEWARES
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Access token required.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
        req.user = user;
        next();
    });
}

function requireRole(roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Unauthorized access.' });
        }
        next();
    };
}

// ==========================================
// API ENDPOINTS
// ==========================================

// SYSTEM & SETUP APIs
app.get('/api/setup/status', async (req, res) => {
    try {
        const { data: admins, error } = await supabase.from('admins').select('id').limit(1);
        if (error) throw error;
        const hasAdmin = admins && admins.length > 0;
        
        const { data: settings } = await supabase.from('system_settings').select('*').limit(1).single();

        res.json({ success: true, hasAdmin, settings: settings || {} });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/setup/admin', async (req, res) => {
    try {
        const { data: existingAdmins } = await supabase.from('admins').select('id');
        if (existingAdmins && existingAdmins.length > 0) {
            return res.status(400).json({ success: false, message: 'Initial setup has already been completed.' });
        }

        const { username, email, password, fullName } = req.body;
        if (!username || !email || !password || !fullName) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const { data, error } = await supabase.from('admins').insert([{
            username,
            email,
            password_hash: hashedPassword,
            full_name: fullName,
            role: 'Admin'
        }]).select();

        if (error) throw error;

        await logActivity('Admin', data[0].id, fullName, 'SETUP_ADMIN', 'Initial administrator created');
        res.json({ success: true, message: 'Administrator account created successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// AUTHENTICATION API
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, loginType } = req.body;
        if (!username || !password || !loginType) {
            return res.status(400).json({ success: false, message: 'Username/Email, Password, and Login Type are required.' });
        }

        let user = null;
        let role = '';

        if (loginType === 'admin') {
            const { data } = await supabase.from('admins')
                .select('*')
                .or(`username.eq.${username},email.eq.${username}`)
                .single();
            if (data) { user = data; role = 'Admin'; }
        } else if (loginType === 'staff') {
            const { data } = await supabase.from('staff')
                .select('*')
                .or(`username.eq.${username},email.eq.${username}`)
                .eq('is_active', true)
                .single();
            if (data) { user = data; role = 'Staff'; }
        } else if (loginType === 'resident') {
            const { data } = await supabase.from('residents')
                .select('*')
                .or(`email.eq.${username},resident_id_number.eq.${username}`)
                .single();
            if (data) {
                if (data.resident_status === 'Pending') {
                    return res.status(403).json({ success: false, message: 'Your registration is still pending staff approval.' });
                }
                if (data.resident_status === 'Rejected') {
                    return res.status(403).json({ success: false, message: `Registration Rejected: ${data.rejection_reason || 'Contact barangay.'}` });
                }
                if (['Archived', 'Transferred', 'Deceased', 'Inactive'].includes(data.resident_status)) {
                    return res.status(403).json({ success: false, message: 'Your account is currently inactive or archived.' });
                }
                user = data; 
                role = 'Resident';
            }
        }

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials or user type.' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        const payload = {
            id: user.id,
            role: role,
            name: user.full_name || `${user.first_name} ${user.last_name}`,
            email: user.email,
            resident_id_number: user.resident_id_number || null
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

        await logActivity(role, user.id, payload.name, 'LOGIN', `${role} user logged in`);

        res.json({ success: true, token, user: payload });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUBLIC REGISTRATION
app.post('/api/public/register', async (req, res) => {
    try {
        const r = req.body;
        if (!r.firstName || !r.lastName || !r.dob || !r.gender || !r.address || !r.email || !r.password) {
            return res.status(400).json({ success: false, message: 'Missing required fields.' });
        }

        // Check duplicate email
        const { data: existing } = await supabase.from('residents').select('id').eq('email', r.email).single();
        if (existing) {
            return res.status(400).json({ success: false, message: 'Email address already registered.' });
        }

        // Generate Resident ID Number
        const year = new Date().getFullYear();
        const { count } = await supabase.from('residents').select('*', { count: 'exact', head: true });
        const seq = String((count || 0) + 1).padStart(6, '0');
        const residentIdNum = `BRGY-${year}-${seq}`;

        const qrToken = uuidv4();
        const hashedPassword = await bcrypt.hash(r.password, 10);

        const { data, error } = await supabase.from('residents').insert([{
            resident_id_number: residentIdNum,
            first_name: r.firstName,
            middle_name: r.middleName || '',
            last_name: r.lastName,
            suffix: r.suffix || '',
            date_of_birth: r.dob,
            gender: r.gender,
            civil_status: r.civilStatus || 'Single',
            nationality: r.nationality || 'Filipino',
            religion: r.religion || '',
            contact_number: r.contactNumber || '',
            email: r.email,
            password_hash: hashedPassword,
            address: r.address,
            purok_id: r.purokId || null,
            occupation: r.occupation || '',
            educational_attainment: r.education || '',
            voter_status: r.voterStatus || 'Non-Voter',
            is_pwd: !!r.isPwd,
            is_senior_citizen: !!r.isSenior,
            is_solo_parent: !!r.isSoloParent,
            is_4ps: !!r.is4ps,
            resident_status: 'Pending',
            emergency_contact_name: r.emergencyName || '',
            emergency_contact_number: r.emergencyContact || '',
            emergency_contact_relation: r.emergencyRelation || '',
            photo_url: r.photoUrl || '',
            qr_code_token: qrToken
        }]).select();

        if (error) throw error;

        await logActivity('Public', data[0].id, `${r.firstName} ${r.lastName}`, 'REGISTER', 'New resident online application submitted');

        res.json({ success: true, message: 'Registration submitted successfully! Please wait for Barangay Staff approval.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// SYSTEM SETTINGS APIs
app.get('/api/settings', async (req, res) => {
    try {
        const { data, error } = await supabase.from('system_settings').select('*').limit(1).single();
        if (error && error.code !== 'PGRST116') throw error;
        res.json({ success: true, settings: data || {} });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/settings', authenticateToken, requireRole(['Admin']), async (req, res) => {
    try {
        const s = req.body;
        const { data: existing } = await supabase.from('system_settings').select('id').limit(1).single();

        let error;
        if (existing) {
            const res = await supabase.from('system_settings').update({
                barangay_name: s.barangay_name,
                municipality: s.municipality,
                province: s.province,
                barangay_captain: s.barangay_captain,
                barangay_secretary: s.barangay_secretary,
                contact_number: s.contact_number,
                email: s.email,
                address: s.address,
                motto: s.motto,
                logo_url: s.logo_url,
                updated_at: new Date()
            }).eq('id', existing.id);
            error = res.error;
        } else {
            const res = await supabase.from('system_settings').insert([s]);
            error = res.error;
        }

        if (error) throw error;

        await logActivity('Admin', req.user.id, req.user.name, 'UPDATE_SETTINGS', 'Updated barangay system information');
        res.json({ success: true, message: 'System settings updated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// RESIDENT MANAGEMENT APIs (Staff/Admin)
app.get('/api/residents', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
    try {
        const { status, search, purok } = req.query;
        let query = supabase.from('residents').select('*, puroks(name), households(household_number)');

        if (status) query = query.eq('resident_status', status);
        if (purok) query = query.eq('purok_id', purok);
        if (search) {
            query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,resident_id_number.ilike.%${search}%`);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        res.json({ success: true, residents: data || [] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/residents/approve', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
    try {
        const { residentId } = req.body;
        const { data, error } = await supabase.from('residents')
            .update({ resident_status: 'Active', updated_at: new Date() })
            .eq('id', residentId)
            .select().single();

        if (error) throw error;

        // Create Notification for Resident
        await supabase.from('notifications').insert([{
            resident_id: residentId,
            title: 'Registration Approved',
            message: 'Your resident account application has been approved! You may now access all portal services.'
        }]);

        await logActivity(req.user.role, req.user.id, req.user.name, 'APPROVE_RESIDENT', `Approved resident ${data.first_name} ${data.last_name}`);
        res.json({ success: true, message: 'Resident approved successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/residents/reject', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
    try {
        const { residentId, reason } = req.body;
        const { data, error } = await supabase.from('residents')
            .update({ resident_status: 'Rejected', rejection_reason: reason, updated_at: new Date() })
            .eq('id', residentId)
            .select().single();

        if (error) throw error;

        await logActivity(req.user.role, req.user.id, req.user.name, 'REJECT_RESIDENT', `Rejected resident application for ${data.first_name} ${data.last_name}. Reason: ${reason}`);
        res.json({ success: true, message: 'Resident application rejected.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/residents/status', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
    try {
        const { residentId, status } = req.body;
        const { data, error } = await supabase.from('residents')
            .update({ resident_status: status, updated_at: new Date() })
            .eq('id', residentId)
            .select().single();

        if (error) throw error;

        await logActivity(req.user.role, req.user.id, req.user.name, 'STATUS_CHANGE_RESIDENT', `Changed status to ${status} for ${data.first_name} ${data.last_name}`);
        res.json({ success: true, message: `Resident status updated to ${status}.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/residents/:id', authenticateToken, requireRole(['Admin']), async (req, res) => {
    try {
        const residentId = req.params.id;
        const { error } = await supabase.from('residents').delete().eq('id', residentId);
        if (error) throw error;

        await logActivity('Admin', req.user.id, req.user.name, 'DELETE_RESIDENT', `Permanently deleted resident record ID: ${residentId}`);
        res.json({ success: true, message: 'Resident record permanently deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// CERTIFICATE MANAGEMENT APIs
app.get('/api/certificates/requests', authenticateToken, async (req, res) => {
    try {
        let query = supabase.from('certificate_requests').select('*, residents(*)');

        if (req.user.role === 'Resident') {
            query = query.eq('resident_id', req.user.id);
        }

        const { data, error } = await query.order('date_requested', { ascending: false });
        if (error) throw error;

        res.json({ success: true, requests: data || [] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/certificates/request', authenticateToken, requireRole(['Resident']), async (req, res) => {
    try {
        const { certificateType, purpose } = req.body;
        if (!certificateType || !purpose) {
            return res.status(400).json({ success: false, message: 'Type and purpose are required.' });
        }

        const year = new Date().getFullYear();
        const { count } = await supabase.from('certificate_requests').select('*', { count: 'exact', head: true });
        const reqNum = `REQ-${year}-${String((count || 0) + 1).padStart(6, '0')}`;

        const { data, error } = await supabase.from('certificate_requests').insert([{
            request_number: reqNum,
            resident_id: req.user.id,
            certificate_type: certificateType,
            purpose: purpose,
            status: 'Pending'
        }]).select().single();

        if (error) throw error;

        await logActivity('Resident', req.user.id, req.user.name, 'CREATE_CERT_REQUEST', `Requested ${certificateType}`);
        res.json({ success: true, message: 'Certificate request submitted successfully.', request: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/certificates/update-status', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
    try {
        const { requestId, status, rejectionReason, certificateFileUrl } = req.body;
        
        const updatePayload = {
            status,
            issued_by: req.user.id
        };

        if (status === 'Approved') updatePayload.date_approved = new Date();
        if (status === 'Released') updatePayload.date_released = new Date();
        if (rejectionReason) updatePayload.rejection_reason = rejectionReason;
        if (certificateFileUrl) updatePayload.certificate_file_url = certificateFileUrl;

        const { data, error } = await supabase.from('certificate_requests')
            .update(updatePayload)
            .eq('id', requestId)
            .select('*, residents(*)').single();

        if (error) throw error;

        // Notify Resident
        await supabase.from('notifications').insert([{
            resident_id: data.resident_id,
            title: `Certificate Request ${status}`,
            message: `Your request for ${data.certificate_type} (${data.request_number}) is now: ${status}.`
        }]);

        await logActivity(req.user.role, req.user.id, req.user.name, 'UPDATE_CERT_STATUS', `Updated request ${data.request_number} to ${status}`);
        res.json({ success: true, message: `Request status updated to ${status}.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// HOUSEHOLD & PUROK APIs
app.get('/api/puroks', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase.from('puroks').select('*').order('name');
        if (error) throw error;
        res.json({ success: true, puroks: data || [] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/puroks', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
    try {
        const { name, leader, description } = req.body;
        const { data, error } = await supabase.from('puroks').insert([{ name, leader, description }]).select();
        if (error) throw error;
        res.json({ success: true, message: 'Purok created successfully.', purok: data[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/households', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase.from('households').select('*, puroks(name), residents(id, first_name, last_name)').order('household_number');
        if (error) throw error;
        res.json({ success: true, households: data || [] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/households', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
    try {
        const { householdNumber, purokId, address, incomeCategory } = req.body;
        const { data, error } = await supabase.from('households').insert([{
            household_number: householdNumber,
            purok_id: purokId,
            address: address,
            income_category: incomeCategory
        }]).select();
        if (error) throw error;
        res.json({ success: true, message: 'Household added successfully.', household: data[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// BLOTTER MANAGEMENT APIs
app.get('/api/blotter', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
    try {
        const { data, error } = await supabase.from('blotter_records').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, blotters: data || [] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/blotter', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
    try {
        const b = req.body;
        const year = new Date().getFullYear();
        const { count } = await supabase.from('blotter_records').select('*', { count: 'exact', head: true });
        const caseNum = `BLOT-${year}-${String((count || 0) + 1).padStart(5, '0')}`;

        const { data, error } = await supabase.from('blotter_records').insert([{
            case_number: caseNum,
            complainant_name: b.complainantName,
            complainant_contact: b.complainantContact,
            complainant_address: b.complainantAddress,
            respondent_name: b.respondentName,
            respondent_contact: b.respondentContact,
            respondent_address: b.respondentAddress,
            witnesses: b.witnesses,
            incident_type: b.incidentType,
            incident_date: b.incidentDate,
            incident_time: b.incidentTime,
            incident_location: b.incidentLocation,
            description: b.description,
            action_taken: b.actionTaken,
            case_status: b.caseStatus || 'Open',
            recorded_by: req.user.id
        }]).select();

        if (error) throw error;

        await logActivity(req.user.role, req.user.id, req.user.name, 'CREATE_BLOTTER', `Recorded case ${caseNum}`);
        res.json({ success: true, message: 'Blotter record created successfully.', record: data[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// APPOINTMENTS & ASSISTANCE APIs
app.get('/api/appointments', authenticateToken, async (req, res) => {
    try {
        let query = supabase.from('appointments').select('*, residents(*)');
        if (req.user.role === 'Resident') {
            query = query.eq('resident_id', req.user.id);
        }
        const { data, error } = await query.order('appointment_date', { ascending: false });
        if (error) throw error;
        res.json({ success: true, appointments: data || [] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/appointments', authenticateToken, requireRole(['Resident']), async (req, res) => {
    try {
        const { serviceType, appointmentDate, appointmentTime, purpose } = req.body;
        const year = new Date().getFullYear();
        const { count } = await supabase.from('appointments').select('*', { count: 'exact', head: true });
        const apptNum = `APT-${year}-${String((count || 0) + 1).padStart(5, '0')}`;

        const { data, error } = await supabase.from('appointments').insert([{
            appointment_number: apptNum,
            resident_id: req.user.id,
            service_type: serviceType,
            appointment_date: appointmentDate,
            appointment_time: appointmentTime,
            purpose: purpose,
            status: 'Pending'
        }]).select();

        if (error) throw error;
        res.json({ success: true, message: 'Appointment requested successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/assistance', authenticateToken, async (req, res) => {
    try {
        let query = supabase.from('assistance_requests').select('*, residents(*)');
        if (req.user.role === 'Resident') {
            query = query.eq('resident_id', req.user.id);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, assistance: data || [] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/assistance', authenticateToken, requireRole(['Resident']), async (req, res) => {
    try {
        const { assistanceType, description } = req.body;
        const year = new Date().getFullYear();
        const { count } = await supabase.from('assistance_requests').select('*', { count: 'exact', head: true });
        const reqNum = `AST-${year}-${String((count || 0) + 1).padStart(5, '0')}`;

        const { data, error } = await supabase.from('assistance_requests').insert([{
            request_number: reqNum,
            resident_id: req.user.id,
            assistance_type: assistanceType,
            description: description,
            status: 'Pending'
        }]).select();

        if (error) throw error;
        res.json({ success: true, message: 'Assistance request submitted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ANNOUNCEMENTS & NOTIFICATIONS
app.get('/api/announcements', async (req, res) => {
    try {
        const { data, error } = await supabase.from('announcements')
            .select('*')
            .eq('status', 'Active')
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, announcements: data || [] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/announcements', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
    try {
        const { title, category, content, imageUrl } = req.body;
        const { data, error } = await supabase.from('announcements').insert([{
            title,
            category,
            content,
            image_url: imageUrl,
            created_by: req.user.id
        }]).select();

        if (error) throw error;

        await logActivity(req.user.role, req.user.id, req.user.name, 'CREATE_ANNOUNCEMENT', `Posted: ${title}`);
        res.json({ success: true, message: 'Announcement created successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase.from('notifications')
            .select('*')
            .eq('resident_id', req.user.id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, notifications: data || [] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// BUSINESSES & REPORTS APIs
app.get('/api/businesses', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase.from('businesses').select('*').order('business_name');
        if (error) throw error;
        res.json({ success: true, businesses: data || [] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/businesses', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
    try {
        const b = req.body;
        const { data, error } = await supabase.from('businesses').insert([{
            business_name: b.businessName,
            owner_name: b.ownerName,
            business_type: b.businessType,
            address: b.address,
            contact_number: b.contactNumber,
            permit_number: b.permitNumber,
            permit_status: b.permitStatus || 'Active',
            expiration_date: b.expirationDate
        }]).select();

        if (error) throw error;
        res.json({ success: true, message: 'Business registered successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/reports/dashboard-stats', authenticateToken, requireRole(['Admin', 'Staff']), async (req, res) => {
    try {
        const { count: totalResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'Active');
        const { count: totalHouseholds } = await supabase.from('households').select('*', { count: 'exact', head: true });
        const { count: maleResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('gender', 'Male').eq('resident_status', 'Active');
        const { count: femaleResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('gender', 'Female').eq('resident_status', 'Active');
        const { count: seniors } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('is_senior_citizen', true).eq('resident_status', 'Active');
        const { count: pwds } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('is_pwd', true).eq('resident_status', 'Active');
        const { count: soloParents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('is_solo_parent', true).eq('resident_status', 'Active');
        const { count: pendingRequests } = await supabase.from('certificate_requests').select('*', { count: 'exact', head: true }).eq('status', 'Pending');
        const { count: pendingRegistrations } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'Pending');

        const { data: recentLogs } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(10);

        res.json({
            success: true,
            stats: {
                totalResidents: totalResidents || 0,
                totalHouseholds: totalHouseholds || 0,
                maleResidents: maleResidents || 0,
                femaleResidents: femaleResidents || 0,
                seniors: seniors || 0,
                pwds: pwds || 0,
                soloParents: soloParents || 0,
                pendingRequests: pendingRequests || 0,
                pendingRegistrations: pendingRegistrations || 0
            },
            recentLogs: recentLogs || []
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// VERIFICATION & QR CODE APIs
app.get('/api/verify/:token', async (req, res) => {
    try {
        const token = req.params.token;
        const { data: resident, error } = await supabase.from('residents')
            .select('*, puroks(name), households(household_number)')
            .eq('qr_code_token', token)
            .single();

        if (error || !resident) {
            return res.json({ success: false, message: 'Invalid or unverified QR Token.' });
        }

        // Get latest ready/pending certificate claim
        const { data: cert } = await supabase.from('certificate_requests')
            .select('*')
            .eq('resident_id', resident.id)
            .in('status', ['Ready for Release', 'Approved', 'Processing'])
            .order('date_requested', { ascending: false })
            .limit(1)
            .single();

        res.json({
            success: true,
            resident: {
                id: resident.id,
                resident_id_number: resident.resident_id_number,
                full_name: `${resident.first_name} ${resident.middle_name ? resident.middle_name + ' ' : ''}${resident.last_name} ${resident.suffix || ''}`,
                status: resident.resident_status,
                address: resident.address,
                purok: resident.puroks ? resident.puroks.name : 'N/A',
                photo_url: resident.photo_url
            },
            pendingClaim: cert || null
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// STAFF DIRECT MANAGEMENT CREATION
app.post('/api/staff', authenticateToken, requireRole(['Admin']), async (req, res) => {
    try {
        const { username, email, password, fullName, position, contactNumber } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        const { data, error } = await supabase.from('staff').insert([{
            username,
            email,
            password_hash: hashedPassword,
            full_name: fullName,
            position,
            contact_number: contactNumber
        }]).select();

        if (error) throw error;
        res.json({ success: true, message: 'Staff user created successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// QR GENERATOR UTILITY API
app.get('/api/qrcode/generate', async (req, res) => {
    try {
        const text = req.query.text || 'BRGY-VERIFY';
        const url = await QRCode.toDataURL(text);
        res.json({ success: true, qrcode: url });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// FRONTEND INTERFACE GENERATOR (HTML/CSS/JS)
// ==========================================

app.get('*', (req, res) => {
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Barangay Resident Management System</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
    <style>
        :root {
            --primary-green: #1b4332;
            --secondary-green: #2d6a4f;
            --light-green: #52b788;
            --primary-blue: #1e3d59;
            --accent-blue: #17b978;
            --bg-light: #f8f9fa;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--bg-light);
            margin: 0;
            padding: 0;
        }

        /* LOGIN BACKGROUND */
        .login-container {
            min-height: 100vh;
            background: linear-gradient(rgba(15, 32, 39, 0.85), rgba(32, 58, 67, 0.85)), 
                        url("https://scontent.fcrk3-3.fna.fbcdn.net/v/t39.30808-6/467984538_122130208178389200_2470999473131951042_n.jpg?stp=dst-jpg_tt6&cstp=mx1857x2048&ctp=s1857x2048&_nc_cat=107&ccb=1-7&_nc_sid=cc71e4&_nc_eui2=AeH-CrVk3UW0Tqq0z_SDhKwemnbseM68ydCadux4zrzJ0I4R6gykVtH1GEMMnjk_E0vUUupJBZ3vwMdzuIfYXMgZ&_nc_ohc=fKl5LR1-2YwQ7kNvwH7PIf8&_nc_oc=AdqAy1CtUXak56hu0R2Ufzy_6npapuoitUaMuup0g9veAD0bOy9PFjySTvVXJasGWis&_nc_zt=23&_nc_ht=scontent.fcrk3-3.fna&_nc_gid=SU-DBALnvlE-vtQ4KjJx4g&_nc_ss=7b2a8&oh=00_AQK7MxJys6gqu1LJrVhDYZ2WNBpKcThfTEtIUXEWUeB_Qw&oe=6ABBAEB1");
            background-size: cover;
            background-position: center;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .login-card {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            width: 100%;
            max-width: 450px;
            padding: 2.5rem;
        }

        .brand-logo {
            width: 90px;
            height: 90px;
            object-fit: cover;
            border-radius: 50%;
            border: 3px solid var(--secondary-green);
        }

        /* LAYOUT & SIDEBAR */
        .wrapper {
            display: flex;
            width: 100%;
            align-items: stretch;
            min-height: 100vh;
        }

        #sidebar {
            min-width: 260px;
            max-width: 260px;
            background: var(--primary-green);
            color: #fff;
            transition: all 0.3s;
        }

        #sidebar .sidebar-header {
            padding: 20px;
            background: var(--secondary-green);
            text-align: center;
        }

        #sidebar ul.components {
            padding: 20px 0;
        }

        #sidebar ul li a {
            padding: 12px 20px;
            font-size: 1.05em;
            display: block;
            color: #d8f3dc;
            text-decoration: none;
            transition: 0.2s;
        }

        #sidebar ul li a:hover, #sidebar ul li.active > a {
            color: #fff;
            background: var(--secondary-green);
            border-left: 4px solid var(--light-green);
        }

        #content {
            width: 100%;
            padding: 25px;
            min-height: 100vh;
            transition: all 0.3s;
        }

        .top-navbar {
            background: #fff;
            padding: 15px 25px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
            margin-bottom: 25px;
            border-radius: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        /* STAT CARDS */
        .stat-card {
            border: none;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            transition: transform 0.2s;
        }

        .stat-card:hover {
            transform: translateY(-3px);
        }

        .stat-icon {
            font-size: 2.5rem;
            opacity: 0.8;
        }

        /* PRINTING ID STYLES */
        @media print {
            body * {
                visibility: hidden;
            }
            .printable-area, .printable-area * {
                visibility: visible;
            }
            .printable-area {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
            }
            .no-print {
                display: none !important;
            }
        }

        /* 8 IDs ON 1 PAGE PRINT LAYOUT */
        .id-grid-container {
            display: grid;
            grid-template-columns: repeat(2, 3.375in);
            grid-template-rows: repeat(4, 2.125in);
            gap: 0.2in;
            justify-content: center;
            margin: 0 auto;
            padding: 0.25in;
        }

        .id-card-layout {
            width: 3.375in;
            height: 2.125in;
            border: 1px solid #ccc;
            border-radius: 8px;
            padding: 8px;
            background: #fff;
            box-sizing: border-box;
            position: relative;
            font-size: 8px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }

        .id-header {
            background: var(--primary-green);
            color: white;
            padding: 3px;
            margin: -8px -8px 5px -8px;
            text-align: center;
            font-weight: bold;
            font-size: 9px;
        }

        .id-photo {
            width: 65px;
            height: 65px;
            object-fit: cover;
            border-radius: 4px;
            border: 1px solid #aaa;
        }

        .digital-id-container {
            max-width: 400px;
            margin: 0 auto;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.15);
            overflow: hidden;
            background: #fff;
            border: 2px solid var(--primary-green);
        }
    </style>
</head>
<body>

    <div id="app-root">
        <!-- DYNAMIC CONTENT RENDERED BY JAVASCRIPT -->
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        // GLOBAL APP STATE
        const state = {
            token: localStorage.getItem('brgy_token') || null,
            user: JSON.parse(localStorage.getItem('brgy_user') || 'null'),
            settings: {},
            currentView: 'login'
        };

        // INITIALIZATION
        document.addEventListener('DOMContentLoaded', async () => {
            await fetchSettings();
            checkSetup();
        });

        async function fetchSettings() {
            try {
                const res = await fetch('/api/settings');
                const data = await res.json();
                if (data.success) state.settings = data.settings;
            } catch (err) {
                console.error(err);
            }
        }

        async function checkSetup() {
            try {
                const res = await fetch('/api/setup/status');
                const data = await res.json();
                if (!data.hasAdmin) {
                    renderSetupPage();
                } else if (state.token && state.user) {
                    renderDashboard();
                } else {
                    renderLoginPage();
                }
            } catch (err) {
                renderLoginPage();
            }
        }

        // NAVIGATION ROUTER
        function navigateTo(view) {
            state.currentView = view;
            if (!state.token && view !== 'login' && view !== 'register' && view !== 'setup' && view !== 'verify') {
                renderLoginPage();
                return;
            }
            switch (view) {
                case 'login': renderLoginPage(); break;
                case 'register': renderRegisterPage(); break;
                case 'dashboard': renderDashboard(); break;
                case 'residents': renderResidentsPage(); break;
                case 'approvals': renderResidentApprovalsPage(); break;
                case 'certificates': renderCertificatesPage(); break;
                case 'households': renderHouseholdsPage(); break;
                case 'blotter': renderBlotterPage(); break;
                case 'appointments': renderAppointmentsPage(); break;
                case 'assistance': renderAssistancePage(); break;
                case 'announcements': renderAnnouncementsPage(); break;
                case 'businesses': renderBusinessesPage(); break;
                case 'reports': renderReportsPage(); break;
                case 'print-ids': renderPrintIDsPage(); break;
                case 'digital-id': renderDigitalIDPage(); break;
                case 'settings': renderSettingsPage(); break;
                default: renderDashboard(); break;
            }
        }

        // ==========================================
        // UI RENDER FUNCTIONS
        // ==========================================

        function renderSetupPage() {
            document.getElementById('app-root').innerHTML = \`
                <div class="login-container">
                    <div class="login-card">
                        <div class="text-center mb-4">
                            <i class="fa-solid fa-shield-halved fa-3x text-success mb-2"></i>
                            <h3 class="fw-bold text-dark">INITIAL ADMIN SETUP</h3>
                            <p class="text-muted small">System setup required before starting.</p>
                        </div>
                        <form id="setup-form" onsubmit="handleSetup(event)">
                            <div class="mb-3">
                                <label class="form-label">Full Name</label>
                                <input type="text" id="setup-name" class="form-control" required placeholder="e.g. System Administrator">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Username</label>
                                <input type="text" id="setup-username" class="form-control" required placeholder="admin">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Email Address</label>
                                <input type="email" id="setup-email" class="form-control" required placeholder="admin@barangay.gov.ph">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Password</label>
                                <input type="password" id="setup-password" class="form-control" required minlength="6">
                            </div>
                            <button type="submit" class="btn btn-success w-100 py-2 fw-bold">Create Admin Account</button>
                        </form>
                    </div>
                </div>
            \`;
        }

        async function handleSetup(e) {
            e.preventDefault();
            const payload = {
                fullName: document.getElementById('setup-name').value,
                username: document.getElementById('setup-username').value,
                email: document.getElementById('setup-email').value,
                password: document.getElementById('setup-password').value
            };
            try {
                const res = await fetch('/api/setup/admin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.success) {
                    alert('Admin account setup successfully! You can now log in.');
                    renderLoginPage();
                } else {
                    alert(data.message);
                }
            } catch (err) {
                alert('Setup failed: ' + err.message);
            }
        }

        function renderLoginPage() {
            const logo = state.settings.logo_url || 'https://via.placeholder.com/100?text=BARANGAY';
            const name = state.settings.barangay_name || 'BARANGAY MANAGEMENT SYSTEM';

            document.getElementById('app-root').innerHTML = \`
                <div class="login-container">
                    <div class="login-card">
                        <div class="text-center mb-4">
                            <img src="\${logo}" class="brand-logo mb-2" alt="Logo" onerror="this.src='https://via.placeholder.com/90?text=LOGO'">
                            <h4 class="fw-bold text-success mb-1">\${name.toUpperCase()}</h4>
                            <p class="text-muted small">Resident & Portal Services Portal</p>
                        </div>
                        <div class="alert alert-info py-2 small mb-3">
                            <strong>DEFAULT / INITIAL ACCOUNT SETUP:</strong> No hardcoded password exists. Create your administrator account during initial first-time visit.
                        </div>
                        <form id="login-form" onsubmit="handleLogin(event)">
                            <div class="mb-3">
                                <label class="form-label font-weight-bold">Login As</label>
                                <select id="login-type" class="form-select" required>
                                    <option value="resident">Resident</option>
                                    <option value="staff">Barangay Staff</option>
                                    <option value="admin">Administrator</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Username or Email</label>
                                <input type="text" id="login-user" class="form-control" placeholder="Enter username or email" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Password</label>
                                <input type="password" id="login-pass" class="form-control" placeholder="Enter password" required>
                            </div>
                            <button type="submit" class="btn btn-success w-100 py-2 fw-bold mb-3">Sign In</button>
                            <div class="text-center">
                                <p class="mb-0 small">New Resident? <a href="#" onclick="navigateTo('register')" class="text-success font-weight-bold">Register Here</a></p>
                            </div>
                        </form>
                    </div>
                </div>
            \`;
        }

        async function handleLogin(e) {
            e.preventDefault();
            const payload = {
                loginType: document.getElementById('login-type').value,
                username: document.getElementById('login-user').value,
                password: document.getElementById('login-pass').value
            };
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.success) {
                    state.token = data.token;
                    state.user = data.user;
                    localStorage.setItem('brgy_token', data.token);
                    localStorage.setItem('brgy_user', JSON.stringify(data.user));
                    renderDashboard();
                } else {
                    alert(data.message);
                }
            } catch (err) {
                alert('Login failed: ' + err.message);
            }
        }

        function renderRegisterPage() {
            document.getElementById('app-root').innerHTML = \`
                <div class="container py-5">
                    <div class="row justify-content-center">
                        <div class="col-md-8">
                            <div class="card shadow-lg border-0 rounded-3">
                                <div class="card-header bg-success text-white text-center py-3">
                                    <h4 class="mb-0 fw-bold">ONLINE RESIDENT REGISTRATION</h4>
                                    <p class="mb-0 small">Fill out details accurately for Barangay validation.</p>
                                </div>
                                <div class="card-body p-4">
                                    <form id="reg-form" onsubmit="handleRegister(event)">
                                        <div class="row g-3">
                                            <div class="col-md-4">
                                                <label class="form-label">First Name *</label>
                                                <input type="text" id="reg-fn" class="form-control" required>
                                            </div>
                                            <div class="col-md-4">
                                                <label class="form-label">Middle Name</label>
                                                <input type="text" id="reg-mn" class="form-control">
                                            </div>
                                            <div class="col-md-4">
                                                <label class="form-label">Last Name *</label>
                                                <input type="text" id="reg-ln" class="form-control" required>
                                            </div>
                                            <div class="col-md-4">
                                                <label class="form-label">Suffix</label>
                                                <input type="text" id="reg-suffix" class="form-control" placeholder="e.g. Jr., Sr.">
                                            </div>
                                            <div class="col-md-4">
                                                <label class="form-label">Date of Birth *</label>
                                                <input type="date" id="reg-dob" class="form-control" required>
                                            </div>
                                            <div class="col-md-4">
                                                <label class="form-label">Gender *</label>
                                                <select id="reg-gender" class="form-select" required>
                                                    <option value="Male">Male</option>
                                                    <option value="Female">Female</option>
                                                </select>
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label">Email Address *</label>
                                                <input type="email" id="reg-email" class="form-control" required>
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label">Password *</label>
                                                <input type="password" id="reg-pass" class="form-control" required minlength="6">
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label">Contact Number</label>
                                                <input type="text" id="reg-contact" class="form-control" placeholder="09123456789">
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label">Civil Status</label>
                                                <select id="reg-civil" class="form-select">
                                                    <option value="Single">Single</option>
                                                    <option value="Married">Married</option>
                                                    <option value="Widowed">Widowed</option>
                                                    <option value="Separated">Separated</option>
                                                </select>
                                            </div>
                                            <div class="col-12">
                                                <label class="form-label">Complete Street Address *</label>
                                                <input type="text" id="reg-address" class="form-control" required>
                                            </div>
                                            <div class="col-md-3">
                                                <div class="form-check mt-3">
                                                    <input class="form-check-input" type="checkbox" id="reg-pwd">
                                                    <label class="form-check-label">PWD</label>
                                                </div>
                                            </div>
                                            <div class="col-md-3">
                                                <div class="form-check mt-3">
                                                    <input class="form-check-input" type="checkbox" id="reg-senior">
                                                    <label class="form-check-label">Senior Citizen</label>
                                                </div>
                                            </div>
                                            <div class="col-md-3">
                                                <div class="form-check mt-3">
                                                    <input class="form-check-input" type="checkbox" id="reg-solo">
                                                    <label class="form-check-label">Solo Parent</label>
                                                </div>
                                            </div>
                                            <div class="col-md-3">
                                                <div class="form-check mt-3">
                                                    <input class="form-check-input" type="checkbox" id="reg-4ps">
                                                    <label class="form-check-label">4Ps Beneficiary</label>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="mt-4 text-end">
                                            <button type="button" onclick="navigateTo('login')" class="btn btn-outline-secondary me-2">Back to Login</button>
                                            <button type="submit" class="btn btn-success fw-bold">Submit Registration</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            \`;
        }

        async function handleRegister(e) {
            e.preventDefault();
            const payload = {
                firstName: document.getElementById('reg-fn').value,
                middleName: document.getElementById('reg-mn').value,
                lastName: document.getElementById('reg-ln').value,
                suffix: document.getElementById('reg-suffix').value,
                dob: document.getElementById('reg-dob').value,
                gender: document.getElementById('reg-gender').value,
                email: document.getElementById('reg-email').value,
                password: document.getElementById('reg-pass').value,
                contactNumber: document.getElementById('reg-contact').value,
                civilStatus: document.getElementById('reg-civil').value,
                address: document.getElementById('reg-address').value,
                isPwd: document.getElementById('reg-pwd').checked,
                isSenior: document.getElementById('reg-senior').checked,
                isSoloParent: document.getElementById('reg-solo').checked,
                is4ps: document.getElementById('reg-4ps').checked
            };

            try {
                const res = await fetch('/api/public/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.success) {
                    alert('Your registration has been submitted! Please wait for Barangay Staff approval before logging in.');
                    navigateTo('login');
                } else {
                    alert(data.message);
                }
            } catch (err) {
                alert('Registration failed: ' + err.message);
            }
        }

        // MAIN DASHBOARD CONTAINER LAYOUT
        function renderMainLayout(contentHtml, activeNav = 'dashboard') {
            const logo = state.settings.logo_url || 'https://via.placeholder.com/40';
            const brgyName = state.settings.barangay_name || 'Barangay Portal';
            const role = state.user ? state.user.role : '';

            let navLinks = '';

            if (role === 'Admin' || role === 'Staff') {
                navLinks = \`
                    <li class="\${activeNav === 'dashboard' ? 'active' : ''}"><a href="#" onclick="navigateTo('dashboard')"><i class="fa-solid fa-chart-line me-2"></i> Dashboard</a></li>
                    <li class="\${activeNav === 'approvals' ? 'active' : ''}"><a href="#" onclick="navigateTo('approvals')"><i class="fa-solid fa-user-clock me-2"></i> Resident Approvals</a></li>
                    <li class="\${activeNav === 'residents' ? 'active' : ''}"><a href="#" onclick="navigateTo('residents')"><i class="fa-solid fa-users me-2"></i> Resident Records</a></li>
                    <li class="\${activeNav === 'certificates' ? 'active' : ''}"><a href="#" onclick="navigateTo('certificates')"><i class="fa-solid fa-file-contract me-2"></i> Certificates</a></li>
                    <li class="\${activeNav === 'households' ? 'active' : ''}"><a href="#" onclick="navigateTo('households')"><i class="fa-solid fa-house-user me-2"></i> Households & Purok</a></li>
                    <li class="\${activeNav === 'blotter' ? 'active' : ''}"><a href="#" onclick="navigateTo('blotter')"><i class="fa-solid fa-gavel me-2"></i> Blotter Records</a></li>
                    <li class="\${activeNav === 'appointments' ? 'active' : ''}"><a href="#" onclick="navigateTo('appointments')"><i class="fa-solid fa-calendar-check me-2"></i> Appointments</a></li>
                    <li class="\${activeNav === 'assistance' ? 'active' : ''}"><a href="#" onclick="navigateTo('assistance')"><i class="fa-solid fa-hand-holding-heart me-2"></i> Assistance</a></li>
                    <li class="\${activeNav === 'announcements' ? 'active' : ''}"><a href="#" onclick="navigateTo('announcements')"><i class="fa-solid fa-bullhorn me-2"></i> Announcements</a></li>
                    <li class="\${activeNav === 'businesses' ? 'active' : ''}"><a href="#" onclick="navigateTo('businesses')"><i class="fa-solid fa-store me-2"></i> Businesses</a></li>
                    <li class="\${activeNav === 'reports' ? 'active' : ''}"><a href="#" onclick="navigateTo('reports')"><i class="fa-solid fa-print me-2"></i> Reports</a></li>
                    <li class="\${activeNav === 'print-ids' ? 'active' : ''}"><a href="#" onclick="navigateTo('print-ids')"><i class="fa-solid fa-id-card me-2"></i> Print IDs (8 Grid)</a></li>
                    \${role === 'Admin' ? \`<li class="\${activeNav === 'settings' ? 'active' : ''}"><a href="#" onclick="navigateTo('settings')"><i class="fa-solid fa-gear me-2"></i> Settings</a></li>\` : ''}
                \`;
            } else {
                // Resident Portal
                navLinks = \`
                    <li class="\${activeNav === 'dashboard' ? 'active' : ''}"><a href="#" onclick="navigateTo('dashboard')"><i class="fa-solid fa-house me-2"></i> Dashboard</a></li>
                    <li class="\${activeNav === 'digital-id' ? 'active' : ''}"><a href="#" onclick="navigateTo('digital-id')"><i class="fa-solid fa-id-badge me-2"></i> My Digital ID</a></li>
                    <li class="\${activeNav === 'certificates' ? 'active' : ''}"><a href="#" onclick="navigateTo('certificates')"><i class="fa-solid fa-file-lines me-2"></i> Request Certificate</a></li>
                    <li class="\${activeNav === 'appointments' ? 'active' : ''}"><a href="#" onclick="navigateTo('appointments')"><i class="fa-solid fa-calendar-day me-2"></i> Book Appointment</a></li>
                    <li class="\${activeNav === 'assistance' ? 'active' : ''}"><a href="#" onclick="navigateTo('assistance')"><i class="fa-solid fa-handshake-angle me-2"></i> Request Assistance</a></li>
                \`;
            }

            document.getElementById('app-root').innerHTML = \`
                <div class="wrapper">
                    <nav id="sidebar">
                        <div class="sidebar-header">
                            <img src="\${logo}" class="rounded-circle mb-2" style="width: 50px; height: 50px;" onerror="this.src='https://via.placeholder.com/50'">
                            <h6 class="fw-bold mb-0">\${brgyName}</h6>
                            <small class="text-white-50">\${role} Portal</small>
                        </div>
                        <ul class="list-unstyled components">
                            \${navLinks}
                            <li><a href="#" onclick="handleLogout()"><i class="fa-solid fa-right-from-bracket me-2 text-danger"></i> Logout</a></li>
                        </ul>
                    </nav>
                    <div id="content">
                        <div class="top-navbar">
                            <h5 class="fw-bold mb-0 text-success"><i class="fa-solid fa-building-flag me-2"></i>\${brgyName}</h5>
                            <div>
                                <span class="me-3 fw-semibold"><i class="fa-solid fa-circle-user me-1"></i> \${state.user ? state.user.name : ''} (\${role})</span>
                            </div>
                        </div>
                        <div class="container-fluid p-0">
                            \${contentHtml}
                        </div>
                    </div>
                </div>
            \`;
        }

        function handleLogout() {
            localStorage.removeItem('brgy_token');
            localStorage.removeItem('brgy_user');
            state.token = null;
            state.user = null;
            renderLoginPage();
        }

        // ==========================================
        // PAGE DASHBOARD RENDERS
        // ==========================================

        async function renderDashboard() {
            if (state.user.role === 'Resident') {
                renderResidentDashboard();
                return;
            }

            try {
                const res = await fetch('/api/reports/dashboard-stats', {
                    headers: { 'Authorization': 'Bearer ' + state.token }
                });
                const data = await res.json();
                const s = data.stats || {};

                const html = \`
                    <div class="row g-3 mb-4">
                        <div class="col-md-3">
                            <div class="card stat-card bg-primary text-white p-3">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <h6 class="text-uppercase small fw-bold">Total Residents</h6>
                                        <h2 class="fw-bold mb-0">\${s.totalResidents}</h2>
                                    </div>
                                    <i class="fa-solid fa-users stat-icon"></i>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card stat-card bg-success text-white p-3">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <h6 class="text-uppercase small fw-bold">Households</h6>
                                        <h2 class="fw-bold mb-0">\${s.totalHouseholds}</h2>
                                    </div>
                                    <i class="fa-solid fa-house-user stat-icon"></i>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card stat-card bg-warning text-dark p-3">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <h6 class="text-uppercase small fw-bold">Pending Requests</h6>
                                        <h2 class="fw-bold mb-0">\${s.pendingRequests}</h2>
                                    </div>
                                    <i class="fa-solid fa-clock stat-icon"></i>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card stat-card bg-danger text-white p-3">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <h6 class="text-uppercase small fw-bold">Pending Registrations</h6>
                                        <h2 class="fw-bold mb-0">\${s.pendingRegistrations}</h2>
                                    </div>
                                    <i class="fa-solid fa-user-plus stat-icon"></i>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row g-3">
                        <div class="col-md-8">
                            <div class="card border-0 shadow-sm p-3">
                                <h5 class="fw-bold text-success mb-3">Demographics Overview</h5>
                                <div class="row text-center">
                                    <div class="col">
                                        <h4 class="fw-bold text-dark">\${s.maleResidents}</h4>
                                        <span class="text-muted small">Male</span>
                                    </div>
                                    <div class="col">
                                        <h4 class="fw-bold text-dark">\${s.femaleResidents}</h4>
                                        <span class="text-muted small">Female</span>
                                    </div>
                                    <div class="col">
                                        <h4 class="fw-bold text-dark">\${s.seniors}</h4>
                                        <span class="text-muted small">Seniors</span>
                                    </div>
                                    <div class="col">
                                        <h4 class="fw-bold text-dark">\${s.pwds}</h4>
                                        <span class="text-muted small">PWD</span>
                                    </div>
                                    <div class="col">
                                        <h4 class="fw-bold text-dark">\${s.soloParents}</h4>
                                        <span class="text-muted small">Solo Parents</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card border-0 shadow-sm p-3">
                                <h5 class="fw-bold text-success mb-3">Recent System Logs</h5>
                                <ul class="list-group list-group-flush small">
                                    \${(data.recentLogs || []).map(l => \`
                                        <li class="list-group-item px-0 py-2">
                                            <strong>\${l.user_name}</strong> - \${l.action}<br>
                                            <span class="text-muted" style="font-size:11px;">\${new Date(l.created_at).toLocaleString()}</span>
                                        </li>
                                    \`).join('')}
                                </ul>
                            </div>
                        </div>
                    </div>
                \`;

                renderMainLayout(html, 'dashboard');
            } catch (err) {
                console.error(err);
            }
        }

        async function renderResidentDashboard() {
            try {
                const resAnn = await fetch('/api/announcements');
                const dataAnn = await resAnn.json();

                const resNotif = await fetch('/api/notifications', {
                    headers: { 'Authorization': 'Bearer ' + state.token }
                });
                const dataNotif = await resNotif.json();

                const html = \`
                    <div class="row g-3">
                        <div class="col-md-8">
                            <div class="card border-0 shadow-sm p-4 mb-4 bg-white">
                                <h4 class="fw-bold text-success">Welcome, \${state.user.name}!</h4>
                                <p class="text-muted">Resident ID Number: <strong>\${state.user.resident_id_number || 'N/A'}</strong></p>
                            </div>

                            <h5 class="fw-bold text-dark mb-3">Latest Barangay Announcements</h5>
                            \${(dataAnn.announcements || []).map(a => \`
                                <div class="card border-0 shadow-sm mb-3">
                                    <div class="card-body">
                                        <span class="badge bg-success mb-2">\${a.category}</span>
                                        <h5 class="fw-bold text-dark">\${a.title}</h5>
                                        <p class="text-muted mb-2">\${a.content}</p>
                                        <small class="text-secondary">\${new Date(a.created_at).toLocaleDateString()}</small>
                                    </div>
                                </div>
                            \`).join('') || '<p class="text-muted">No announcements posted yet.</p>'}
                        </div>
                        <div class="col-md-4">
                            <div class="card border-0 shadow-sm p-3">
                                <h5 class="fw-bold text-success mb-3">My Notifications</h5>
                                <ul class="list-group list-group-flush">
                                    \${(dataNotif.notifications || []).map(n => \`
                                        <li class="list-group-item px-0">
                                            <strong class="d-block text-dark">\${n.title}</strong>
                                            <span class="small text-muted">\${n.message}</span><br>
                                            <small class="text-secondary" style="font-size: 10px;">\${new Date(n.created_at).toLocaleString()}</small>
                                        </li>
                                    \`).join('') || '<li class="list-group-item text-muted">No notifications.</li>'}
                                </ul>
                            </div>
                        </div>
                    </div>
                \`;

                renderMainLayout(html, 'dashboard');
            } catch (err) {
                console.error(err);
            }
        }

        // ==========================================
        // RESIDENT APPROVALS & MANAGEMENT
        // ==========================================

        async function renderResidentApprovalsPage() {
            try {
                const res = await fetch('/api/residents?status=Pending', {
                    headers: { 'Authorization': 'Bearer ' + state.token }
                });
                const data = await res.json();

                const html = \`
                    <div class="card border-0 shadow-sm p-4">
                        <h4 class="fw-bold text-success mb-3">PENDING RESIDENT REGISTRATION APPROVALS</h4>
                        <div class="table-responsive">
                            <table class="table table-hover align-middle">
                                <thead class="table-light">
                                    <tr>
                                        <th>Name</th>
                                        <th>DOB / Gender</th>
                                        <th>Address</th>
                                        <th>Email / Contact</th>
                                        <th>Date Applied</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    \${(data.residents || []).map(r => \`
                                        <tr>
                                            <td><strong>\${r.first_name} \${r.last_name}</strong></td>
                                            <td>\${r.date_of_birth} (\${r.gender})</td>
                                            <td>\${r.address}</td>
                                            <td>\${r.email}<br><small class="text-muted">\${r.contact_number}</small></td>
                                            <td>\${new Date(r.created_at).toLocaleDateString()}</td>
                                            <td>
                                                <button onclick="approveResident('\${r.id}')" class="btn btn-sm btn-success me-1"><i class="fa-solid fa-check me-1"></i> Approve</button>
                                                <button onclick="rejectResident('\${r.id}')" class="btn btn-sm btn-danger"><i class="fa-solid fa-xmark me-1"></i> Reject</button>
                                            </td>
                                        </tr>
                                    \`).join('') || '<tr><td colspan="6" class="text-center text-muted py-4">No pending registrations found.</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                \`;

                renderMainLayout(html, 'approvals');
            } catch (err) {
                console.error(err);
            }
        }

        async function approveResident(id) {
            if (!confirm('Approve this resident application?')) return;
            try {
                const res = await fetch('/api/residents/approve', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + state.token 
                    },
                    body: JSON.stringify({ residentId: id })
                });
                const data = await res.json();
                if (data.success) {
                    alert(data.message);
                    renderResidentApprovalsPage();
                } else {
                    alert(data.message);
                }
            } catch (err) {
                alert('Error approving resident.');
            }
        }

        async function rejectResident(id) {
            const reason = prompt('Enter rejection reason:');
            if (!reason) return;
            try {
                const res = await fetch('/api/residents/reject', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + state.token 
                    },
                    body: JSON.stringify({ residentId: id, reason })
                });
                const data = await res.json();
                if (data.success) {
                    alert(data.message);
                    renderResidentApprovalsPage();
                } else {
                    alert(data.message);
                }
            } catch (err) {
                alert('Error rejecting resident.');
            }
        }

        async function renderResidentsPage() {
            try {
                const res = await fetch('/api/residents?status=Active', {
                    headers: { 'Authorization': 'Bearer ' + state.token }
                });
                const data = await res.json();

                const html = \`
                    <div class="card border-0 shadow-sm p-4">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h4 class="fw-bold text-success mb-0">ACTIVE RESIDENT RECORDS</h4>
                            <input type="text" id="res-search" oninput="filterResidentsTable()" class="form-control w-25" placeholder="Search resident name or ID...">
                        </div>
                        <div class="table-responsive">
                            <table class="table table-hover align-middle" id="residents-table">
                                <thead class="table-light">
                                    <tr>
                                        <th>Resident ID</th>
                                        <th>Full Name</th>
                                        <th>Gender / Status</th>
                                        <th>Address</th>
                                        <th>Classifications</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    \${(data.residents || []).map(r => \`
                                        <tr>
                                            <td><span class="badge bg-secondary">\${r.resident_id_number}</span></td>
                                            <td><strong>\${r.first_name} \${r.last_name}</strong></td>
                                            <td>\${r.gender} / \${r.civil_status}</td>
                                            <td>\${r.address}</td>
                                            <td>
                                                \${r.is_senior_citizen ? '<span class="badge bg-info text-dark">Senior</span> ' : ''}
                                                \${r.is_pwd ? '<span class="badge bg-warning text-dark">PWD</span> ' : ''}
                                                \${r.is_solo_parent ? '<span class="badge bg-primary">Solo Parent</span> ' : ''}
                                            </td>
                                            <td>
                                                <button onclick="changeResidentStatus('\${r.id}', 'Archived')" class="btn btn-sm btn-outline-warning me-1">Archive</button>
                                                \${state.user.role === 'Admin' ? \`<button onclick="deleteResident('\${r.id}')" class="btn btn-sm btn-outline-danger">Delete</button>\` : ''}
                                            </td>
                                        </tr>
                                    \`).join('') || '<tr><td colspan="6" class="text-center text-muted py-4">No active resident records found.</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                \`;

                renderMainLayout(html, 'residents');
            } catch (err) {
                console.error(err);
            }
        }

        async function changeResidentStatus(id, status) {
            if (!confirm(\`Are you sure you want to set resident status to \${status}?\`)) return;
            try {
                const res = await fetch('/api/residents/status', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + state.token
                    },
                    body: JSON.stringify({ residentId: id, status })
                });
                const data = await res.json();
                alert(data.message);
                renderResidentsPage();
            } catch (err) {
                alert('Action failed.');
            }
        }

        async function deleteResident(id) {
            if (!confirm('PERMANENT DELETION WARNING: Are you strictly sure you want to permanently delete this resident record?')) return;
            try {
                const res = await fetch('/api/residents/' + id, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + state.token }
                });
                const data = await res.json();
                alert(data.message);
                renderResidentsPage();
            } catch (err) {
                alert('Deletion failed.');
            }
        }

        // ==========================================
        // CERTIFICATE MANAGEMENT PAGE
        // ==========================================

        async function renderCertificatesPage() {
            try {
                const res = await fetch('/api/certificates/requests', {
                    headers: { 'Authorization': 'Bearer ' + state.token }
                });
                const data = await res.json();

                let html = '';

                if (state.user.role === 'Resident') {
                    html = \`
                        <div class="row g-4">
                            <div class="col-md-4">
                                <div class="card border-0 shadow-sm p-3">
                                    <h5 class="fw-bold text-success mb-3">Request Certificate</h5>
                                    <form onsubmit="handleRequestCertificate(event)">
                                        <div class="mb-3">
                                            <label class="form-label">Certificate Type</label>
                                            <select id="cert-type" class="form-select" required>
                                                <option value="Barangay Clearance">Barangay Clearance</option>
                                                <option value="Certificate of Residency">Certificate of Residency</option>
                                                <option value="Certificate of Indigency">Certificate of Indigency</option>
                                                <option value="Certificate of Good Moral">Certificate of Good Moral</option>
                                            </select>
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">Purpose</label>
                                            <textarea id="cert-purpose" class="form-control" rows="3" required placeholder="State purpose..."></textarea>
                                        </div>
                                        <button type="submit" class="btn btn-success w-100 fw-bold">Submit Request</button>
                                    </form>
                                </div>
                            </div>
                            <div class="col-md-8">
                                <div class="card border-0 shadow-sm p-3">
                                    <h5 class="fw-bold text-dark mb-3">My Request History</h5>
                                    <div class="table-responsive">
                                        <table class="table align-middle">
                                            <thead>
                                                <tr>
                                                    <th>Req #</th>
                                                    <th>Certificate</th>
                                                    <th>Status</th>
                                                    <th>Requested Date</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                \${(data.requests || []).map(r => \`
                                                    <tr>
                                                        <td><strong>\${r.request_number}</strong></td>
                                                        <td>\${r.certificate_type}</td>
                                                        <td><span class="badge bg-info text-dark">\${r.status}</span></td>
                                                        <td>\${new Date(r.date_requested).toLocaleDateString()}</td>
                                                    </tr>
                                                \`).join('') || '<tr><td colspan="4" class="text-center text-muted py-3">No certificate requests found.</td></tr>'}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    \`;
                } else {
                    // Staff / Admin Management View
                    html = \`
                        <div class="card border-0 shadow-sm p-4">
                            <h4 class="fw-bold text-success mb-3">CERTIFICATE REQUEST PROCESSING</h4>
                            <div class="table-responsive">
                                <table class="table table-hover align-middle">
                                    <thead class="table-light">
                                        <tr>
                                            <th>Req #</th>
                                            <th>Resident Name</th>
                                            <th>Certificate Type</th>
                                            <th>Purpose</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        \${(data.requests || []).map(r => \`
                                            <tr>
                                                <td><strong>\${r.request_number}</strong></td>
                                                <td>\${r.residents ? r.residents.first_name + ' ' + r.residents.last_name : 'N/A'}</td>
                                                <td>\${r.certificate_type}</td>
                                                <td>\${r.purpose}</td>
                                                <td><span class="badge bg-warning text-dark">\${r.status}</span></td>
                                                <td>
                                                    <button onclick="updateCertStatus('\${r.id}', 'Ready for Release')" class="btn btn-sm btn-primary me-1">Ready</button>
                                                    <button onclick="updateCertStatus('\${r.id}', 'Released')" class="btn btn-sm btn-success me-1">Release</button>
                                                    <button onclick="updateCertStatus('\${r.id}', 'Rejected')" class="btn btn-sm btn-danger">Reject</button>
                                                </td>
                                            </tr>
                                        \`).join('') || '<tr><td colspan="6" class="text-center text-muted py-4">No pending certificate requests found.</td></tr>'}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    \`;
                }

                renderMainLayout(html, 'certificates');
            } catch (err) {
                console.error(err);
            }
        }

        async function handleRequestCertificate(e) {
            e.preventDefault();
            const payload = {
                certificateType: document.getElementById('cert-type').value,
                purpose: document.getElementById('cert-purpose').value
            };
            try {
                const res = await fetch('/api/certificates/request', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + state.token
                    },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.success) {
                    alert(data.message);
                    renderCertificatesPage();
                } else {
                    alert(data.message);
                }
            } catch (err) {
                alert('Request failed.');
            }
        }

        async function updateCertStatus(id, status) {
            try {
                const res = await fetch('/api/certificates/update-status', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + state.token
                    },
                    body: JSON.stringify({ requestId: id, status })
                });
                const data = await res.json();
                if (data.success) {
                    alert(data.message);
                    renderCertificatesPage();
                } else {
                    alert(data.message);
                }
            } catch (err) {
                alert('Update failed.');
            }
        }

        // ==========================================
        // PRINTABLE PHYSICAL IDs (8 ON 1 BOND PAPER)
        // ==========================================

        async function renderPrintIDsPage() {
            try {
                const res = await fetch('/api/residents?status=Active', {
                    headers: { 'Authorization': 'Bearer ' + state.token }
                });
                const data = await res.json();
                const residents = data.residents || [];

                const brgyName = state.settings.barangay_name || 'BARANGAY CENTRAL';
                const logo = state.settings.logo_url || 'https://via.placeholder.com/50';

                const html = \`
                    <div class="no-print mb-4">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h4 class="fw-bold text-success mb-1">PHYSICAL RESIDENT ID BATCH PRINTING</h4>
                                <p class="text-muted mb-0">Generates exact 8 IDs per standard 8.5" x 11" Bond Paper sheet layout.</p>
                            </div>
                            <button onclick="window.print()" class="btn btn-success fw-bold"><i class="fa-solid fa-print me-2"></i> Print Layout Sheet</button>
                        </div>
                    </div>

                    <div class="printable-area">
                        <div class="id-grid-container">
                            \${residents.slice(0, 8).map(r => \`
                                <div class="id-card-layout">
                                    <div class="id-header">
                                        BARANGAY RESIDENT ID - \${brgyName.toUpperCase()}
                                    </div>
                                    <div class="d-flex gap-2 align-items-center mb-1">
                                        <img src="\${r.photo_url || logo}" class="id-photo" onerror="this.src='https://via.placeholder.com/65'">
                                        <div>
                                            <div style="font-weight: bold; font-size: 10px; color: #1b4332;">\${r.first_name} \${r.last_name}</div>
                                            <div>ID: <strong>\${r.resident_id_number}</strong></div>
                                            <div>DOB: \${r.date_of_birth}</div>
                                            <div>Gender: \${r.gender}</div>
                                        </div>
                                    </div>
                                    <div style="font-size: 7.5px;" class="text-truncate">
                                        Address: \${r.address}
                                    </div>
                                    <div class="d-flex justify-content-between align-items-end mt-1">
                                        <div style="font-size: 7px;" class="text-muted">Verified Resident</div>
                                        <div id="qr-\${r.id}" style="width: 35px; height: 35px;"></div>
                                    </div>
                                </div>
                            \`).join('')}
                        </div>
                    </div>
                \`;

                renderMainLayout(html, 'print-ids');

                // Render QR Codes into ID elements
                setTimeout(() => {
                    residents.slice(0, 8).forEach(r => {
                        const elem = document.getElementById('qr-' + r.id);
                        if (elem) {
                            QRCode.toCanvas(elem, \`https://render-app.com/verify/\${r.qr_code_token}\`, { width: 35, margin: 0 });
                        }
                    });
                }, 200);

            } catch (err) {
                console.error(err);
            }
        }

        // DIGITAL ID PAGE FOR RESIDENTS
        async function renderDigitalIDPage() {
            const logo = state.settings.logo_url || 'https://via.placeholder.com/80';
            const brgyName = state.settings.barangay_name || 'BARANGAY CENTRAL';
            const user = state.user;

            const html = \`
                <div class="container py-4">
                    <h4 class="fw-bold text-center text-success mb-4">MY OFFICIAL DIGITAL BARANGAY ID</h4>
                    <div class="digital-id-container p-4">
                        <div class="text-center border-bottom pb-3 mb-3">
                            <img src="\${logo}" class="rounded-circle mb-2" style="width: 70px; height: 70px;" onerror="this.src='https://via.placeholder.com/70'">
                            <h5 class="fw-bold mb-0 text-success">\${brgyName.toUpperCase()}</h5>
                            <small class="text-muted">RESIDENT IDENTIFICATION CARD</small>
                        </div>
                        <div class="text-center mb-3">
                            <div class="fw-bold text-dark fs-5">\${user.name}</div>
                            <span class="badge bg-success mb-2">\${user.resident_id_number || 'BRGY-ACTIVE'}</span>
                        </div>
                        <div class="d-flex justify-content-center mb-3">
                            <div id="digital-qr-code"></div>
                        </div>
                        <div class="text-center small text-muted">
                            Scan QR Code at Barangay Hall to verify identity & process requests.
                        </div>
                    </div>
                </div>
            \`;

            renderMainLayout(html, 'digital-id');

            setTimeout(() => {
                const elem = document.getElementById('digital-qr-code');
                if (elem) {
                    QRCode.toCanvas(elem, \`https://render-app.com/verify/\${user.id}\`, { width: 120, margin: 1 });
                }
            }, 100);
        }

        // SYSTEM SETTINGS PAGE
        function renderSettingsPage() {
            const s = state.settings;
            const html = \`
                <div class="card border-0 shadow-sm p-4">
                    <h4 class="fw-bold text-success mb-3">BARANGAY SYSTEM CONFIGURATION</h4>
                    <form onsubmit="handleSaveSettings(event)">
                        <div class="row g-3">
                            <div class="col-md-6">
                                <label class="form-label">Barangay Name</label>
                                <input type="text" id="set-brgy" class="form-control" value="\${s.barangay_name || ''}" required>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">Municipality / City</label>
                                <input type="text" id="set-muni" class="form-control" value="\${s.municipality || ''}" required>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">Province</label>
                                <input type="text" id="set-prov" class="form-control" value="\${s.province || ''}" required>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">Barangay Captain</label>
                                <input type="text" id="set-capt" class="form-control" value="\${s.barangay_captain || ''}">
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">Contact Number</label>
                                <input type="text" id="set-contact" class="form-control" value="\${s.contact_number || ''}">
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">Barangay Logo URL</label>
                                <input type="text" id="set-logo" class="form-control" value="\${s.logo_url || ''}" placeholder="https://">
                            </div>
                        </div>
                        <div class="mt-4 text-end">
                            <button type="submit" class="btn btn-success fw-bold">Save System Settings</button>
                        </div>
                    </form>
                </div>
            \`;

            renderMainLayout(html, 'settings');
        }

        async function handleSaveSettings(e) {
            e.preventDefault();
            const payload = {
                barangay_name: document.getElementById('set-brgy').value,
                municipality: document.getElementById('set-muni').value,
                province: document.getElementById('set-prov').value,
                barangay_captain: document.getElementById('set-capt').value,
                contact_number: document.getElementById('set-contact').value,
                logo_url: document.getElementById('set-logo').value
            };
            try {
                const res = await fetch('/api/settings', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + state.token
                    },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.success) {
                    alert(data.message);
                    await fetchSettings();
                    renderDashboard();
                } else {
                    alert(data.message);
                }
            } catch (err) {
                alert('Failed to save settings.');
            }
        }

        // PLACEHOLDER ROUTE RENDERERS
        function renderHouseholdsPage() { renderMainLayout('<div class="card p-4"><h4>Households & Puroks Management</h4><p>Manage community households and purok structures here.</p></div>', 'households'); }
        function renderBlotterPage() { renderMainLayout('<div class="card p-4"><h4>Blotter & Incident Records</h4><p>Record and manage peace and order cases here.</p></div>', 'blotter'); }
        function renderAppointmentsPage() { renderMainLayout('<div class="card p-4"><h4>Appointments</h4><p>Schedule and manage resident barangay visits here.</p></div>', 'appointments'); }
        function renderAssistancePage() { renderMainLayout('<div class="card p-4"><h4>Community Assistance Program</h4><p>Process financial, medical, and emergency assistance requests here.</p></div>', 'assistance'); }
        function renderAnnouncementsPage() { renderMainLayout('<div class="card p-4"><h4>Barangay Announcements</h4><p>Post and review active public notices here.</p></div>', 'announcements'); }
        function renderBusinessesPage() { renderMainLayout('<div class="card p-4"><h4>Business Management</h4><p>Register and monitor commercial permits in the barangay here.</p></div>', 'businesses'); }
        function renderReportsPage() { renderMainLayout('<div class="card p-4"><h4>Barangay Analytics & Reports</h4><p>Generate summary statistics and demographic reports here.</p></div>', 'reports'); }

    </script>
</body>
</html>`;

    res.send(htmlContent);
});

// START EXPRESS SERVER
app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`Barangay Resident Management System live on port ${PORT}`);
    console.log(`=======================================================`);
});
