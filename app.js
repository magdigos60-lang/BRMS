/**
 * BARANGAY RESIDENT MANAGEMENT SYSTEM (BRMS)
 * Built with Express.js, Supabase PostgreSQL, and Native Web Stack.
 */

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'barangay_super_secret_jwt_key_2026';

// Initialize Supabase Client
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://YOUR-SUPABASE-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'YOUR-SUPABASE-ANON-KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Memory Upload Storage for Supabase Direct Buffer Uploads
const upload = multer({ storage: multer.memoryStorage() });

// Middleware Configuration
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(session({
    secret: 'barangay_session_secret_2026',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Utility Helpers
async function logActivity(actorId, actorName, actorType, action, description, recordId = '') {
    try {
        await supabase.from('activity_logs').insert([{
            actor_id: actorId,
            actor_name: actorName,
            actor_type: actorType,
            action: action,
            description: description,
            record_id: recordId
        }]);
    } catch (e) {
        console.error('Activity Log Error:', e);
    }
}

async function uploadToSupabase(file, folder = 'general') {
    if (!file) return '';
    try {
        const ext = path.extname(file.originalname);
        const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
        const { data, error } = await supabase.storage
            .from('barangay_uploads')
            .upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true });

        if (error) throw error;
        const { data: publicUrlData } = supabase.storage
            .from('barangay_uploads')
            .getPublicUrl(fileName);

        return publicUrlData.publicUrl;
    } catch (err) {
        console.error('Supabase File Upload Exception:', err);
        return '';
    }
}

// Authentication Middleware
const requireAuth = (roles = []) => {
    return (req, res, next) => {
        const token = req.cookies.brgy_token || req.session.token;
        if (!token) {
            return res.redirect('/login');
        }
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            if (roles.length > 0 && !roles.includes(decoded.role)) {
                return res.status(403).send('Forbidden: Insufficient Security Privileges.');
            }
            next();
        } catch (err) {
            res.clearCookie('brgy_token');
            return res.redirect('/login');
        }
    };
};

// Global Barangay Settings Fetcher Middleware
app.use(async (req, res, next) => {
    try {
        const { data } = await supabase.from('barangay_settings').select('*').limit(1).single();
        res.locals.settings = data || {
            barangay_name: 'Barangay Central',
            municipality_city: 'City of Batac',
            province: 'Ilocos Norte',
            logo_url: '',
            captain_signature_url: ''
        };
    } catch (e) {
        res.locals.settings = { barangay_name: 'Barangay Central' };
    }
    next();
});

// INITIAL SETUP & FIRST RUN VERIFICATION ROUTE
app.get('/setup', async (req, res) => {
    const { count } = await supabase.from('users').select('*', { count: 'exact', head: true });
    if (count > 0) {
        return res.redirect('/login');
    }
    res.send(renderSetupHTML());
});

app.post('/setup', async (req, res) => {
    const { username, email, password, full_name } = req.body;
    const { count } = await supabase.from('users').select('*', { count: 'exact', head: true });
    if (count > 0) {
        return res.status(400).json({ success: false, message: 'System setup already completed.' });
    }
    const hash = await bcrypt.hash(password, 10);
    const { error } = await supabase.from('users').insert([{
        username,
        email,
        password_hash: hash,
        full_name,
        role: 'Super Admin',
        is_active: true
    }]);

    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.json({ success: true, message: 'Initial Administrator created successfully!' });
});

// LOGIN & ROUTING HANDLERS
app.get('/login', async (req, res) => {
    const { count } = await supabase.from('users').select('*', { count: 'exact', head: true });
    if (count === 0) {
        return res.redirect('/setup');
    }
    res.send(renderLoginHTML());
});

app.post('/login', async (req, res) => {
    const { identifier, password, user_type } = req.body;

    if (user_type === 'RESIDENT') {
        const { data: resident } = await supabase
            .from('residents')
            .select('*')
            .or(`email.eq.${identifier},resident_id_number.eq.${identifier}`)
            .eq('is_archived', false)
            .single();

        if (!resident || !(await bcrypt.compare(password, resident.password_hash))) {
            return res.status(401).json({ success: false, message: 'Invalid Resident credentials.' });
        }

        if (resident.verification_status !== 'APPROVED') {
            return res.status(403).json({ success: false, message: `Account status is ${resident.verification_status}. Access restricted.` });
        }

        const token = jwt.sign({ id: resident.id, role: 'Resident', name: `${resident.first_name} ${resident.last_name}`, resident_id_number: resident.resident_id_number }, JWT_SECRET, { expiresIn: '1d' });
        res.cookie('brgy_token', token, { httpOnly: true });
        return res.json({ success: true, redirect: '/resident/dashboard' });
    } else {
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .or(`email.eq.${identifier},username.eq.${identifier}`)
            .eq('is_active', true)
            .single();

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ success: false, message: 'Invalid Staff/Admin credentials.' });
        }

        const token = jwt.sign({ id: user.id, role: user.role, name: user.full_name, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
        res.cookie('brgy_token', token, { httpOnly: true });

        await supabase.from('login_history').insert([{ user_id: user.id, username: user.username, role: user.role, status: 'SUCCESS' }]);
        await logActivity(user.id, user.full_name, user.role, 'LOGIN', 'User logged into Staff/Admin portal');

        return res.json({ success: true, redirect: '/admin/dashboard' });
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('brgy_token');
    req.session.destroy();
    res.redirect('/login');
});

// PUBLIC RESIDENT REGISTRATION ROUTE
app.get('/register', async (req, res) => {
    const { data: puroks } = await supabase.from('puroks').select('*').eq('is_archived', false);
    res.send(renderRegisterHTML(puroks || []));
});

app.post('/register', upload.single('photo'), async (req, res) => {
    try {
        const b = req.body;
        const photoUrl = req.file ? await uploadToSupabase(req.file, 'residents') : '';

        const { data: set } = await supabase.from('barangay_settings').select('id_prefix').limit(1).single();
        const prefix = set?.id_prefix || 'BRGY-2026-';
        const randNum = Math.floor(100000 + Math.random() * 900000);
        const residentIdNum = `${prefix}${randNum}`;

        const hash = await bcrypt.hash(b.password, 10);
        const dob = new Date(b.date_of_birth);
        const ageDiff = Date.now() - dob.getTime();
        const ageDate = new Date(ageDiff);
        const calculatedAge = Math.abs(ageDate.getUTCFullYear() - 1970);

        const { data, error } = await supabase.from('residents').insert([{
            resident_id_number: residentIdNum,
            email: b.email,
            password_hash: hash,
            first_name: b.first_name,
            middle_name: b.middle_name || '',
            last_name: b.last_name,
            suffix: b.suffix || '',
            date_of_birth: b.date_of_birth,
            age: calculatedAge,
            gender: b.gender,
            civil_status: b.civil_status,
            nationality: b.nationality || 'Filipino',
            contact_number: b.contact_number,
            address: b.address,
            purok_id: b.purok_id || null,
            occupation: b.occupation || 'N/A',
            educational_attainment: b.educational_attainment || 'N/A',
            voter_status: b.voter_status || 'Non-Voter',
            photo_url: photoUrl,
            verification_status: 'PENDING',
            is_senior_citizen: calculatedAge >= 60,
            is_pwd: b.is_pwd === 'true',
            is_solo_parent: b.is_solo_parent === 'true',
            pwd_type: b.pwd_type || ''
        }]).select().single();

        if (error) throw error;

        await logActivity(data.id, `${b.first_name} ${b.last_name}`, 'RESIDENT', 'REGISTER', 'Public online resident registration submitted', data.id);
        res.json({ success: true, message: 'Registration submitted successfully! Please await Barangay Staff verification.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUBLIC QR VERIFICATION SCANNER ROUTE
app.get('/scanner', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), (req, res) => {
    res.send(renderScannerHTML(req.user));
});

app.get('/api/verify-qr/:code', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), async (req, res) => {
    const code = req.params.code;
    const { data: cert } = await supabase.from('certificate_requests').select('*, residents(*)').eq('verification_code', code).single();

    if (cert) {
        return res.json({ success: true, type: 'CERTIFICATE', data: cert });
    }

    const { data: resident } = await supabase.from('residents').select('*, puroks(*)').eq('resident_id_number', code).single();
    if (resident) {
        return res.json({ success: true, type: 'RESIDENT_ID', data: resident });
    }

    return res.status(404).json({ success: false, message: 'Invalid Verification Code or Resident ID.' });
});

// ADMIN PORTAL ROUTES & APIS
app.get('/admin/dashboard', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), async (req, res) => {
    const [
        { count: totalResidents },
        { count: pendingRegistrations },
        { count: totalHouseholds },
        { count: pendingCertificates },
        { count: totalSenior },
        { count: totalPwd },
        { count: totalSoloParent },
        { data: puroksData }
    ] = await Promise.all([
        supabase.from('residents').select('*', { count: 'exact', head: true }).eq('is_archived', false).eq('verification_status', 'APPROVED'),
        supabase.from('residents').select('*', { count: 'exact', head: true }).eq('verification_status', 'PENDING'),
        supabase.from('households').select('*', { count: 'exact', head: true }).eq('is_archived', false),
        supabase.from('certificate_requests').select('*', { count: 'exact', head: true }).eq('status', 'SUBMITTED'),
        supabase.from('residents').select('*', { count: 'exact', head: true }).eq('is_senior_citizen', true).eq('verification_status', 'APPROVED'),
        supabase.from('residents').select('*', { count: 'exact', head: true }).eq('is_pwd', true).eq('verification_status', 'APPROVED'),
        supabase.from('residents').select('*', { count: 'exact', head: true }).eq('is_solo_parent', true).eq('verification_status', 'APPROVED'),
        supabase.from('puroks').select('*, residents(count)').eq('is_archived', false)
    ]);

    const metrics = {
        totalResidents: totalResidents || 0,
        pendingRegistrations: pendingRegistrations || 0,
        totalHouseholds: totalHouseholds || 0,
        pendingCertificates: pendingCertificates || 0,
        totalSenior: totalSenior || 0,
        totalPwd: totalPwd || 0,
        totalSoloParent: totalSoloParent || 0,
        puroks: puroksData || []
    };

    res.send(renderAdminDashboardHTML(req.user, metrics));
});

// ADMIN: RESIDENT MANAGEMENT CRUD
app.get('/admin/residents', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), async (req, res) => {
    const { data: residents } = await supabase.from('residents').select('*, puroks(*)').order('created_at', { ascending: false });
    const { data: puroks } = await supabase.from('puroks').select('*').eq('is_archived', false);
    res.send(renderAdminResidentsHTML(req.user, residents || [], puroks || []));
});

app.post('/admin/residents/approve', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), async (req, res) => {
    const { id } = req.body;
    const { data, error } = await supabase.from('residents').update({ verification_status: 'APPROVED' }).eq('id', id).select().single();
    if (error) return res.status(500).json({ success: false, message: error.message });

    await supabase.from('notifications').insert([{
        resident_id: id,
        title: 'Registration Approved',
        message: 'Your Barangay Resident Registration has been officially approved! You can now access all services.',
        type: 'REGISTRATION'
    }]);

    await logActivity(req.user.id, req.user.name, req.user.role, 'APPROVE_RESIDENT', `Approved resident account ID: ${data.resident_id_number}`, id);
    res.json({ success: true, message: 'Resident account approved successfully.' });
});

app.post('/admin/residents/reject', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), async (req, res) => {
    const { id, reason } = req.body;
    const { data, error } = await supabase.from('residents').update({ verification_status: 'REJECTED', rejection_reason: reason }).eq('id', id).select().single();
    if (error) return res.status(500).json({ success: false, message: error.message });

    await supabase.from('notifications').insert([{
        resident_id: id,
        title: 'Registration Rejected',
        message: `Your registration was rejected. Reason: ${reason}`,
        type: 'REGISTRATION'
    }]);

    await logActivity(req.user.id, req.user.name, req.user.role, 'REJECT_RESIDENT', `Rejected resident registration ID: ${id}. Reason: ${reason}`, id);
    res.json({ success: true, message: 'Resident registration rejected.' });
});

// ADMIN: PRINT 8 IDS PER BOND PAPER ROUTE
app.get('/admin/print-ids', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), async (req, res) => {
    const ids = req.query.ids ? req.query.ids.split(',') : [];
    const { data: residents } = await supabase.from('residents').select('*, puroks(*)').in('id', ids);
    const { data: settings } = await supabase.from('barangay_settings').select('*').limit(1).single();
    res.send(render8IDsPrintLayoutHTML(residents || [], settings || {}));
});

// ADMIN: SYSTEM SETTINGS API & VIEW
app.get('/admin/settings', requireAuth(['Super Admin', 'Barangay Admin']), async (req, res) => {
    const { data: settings } = await supabase.from('barangay_settings').select('*').limit(1).single();
    res.send(renderAdminSettingsHTML(req.user, settings || {}));
});

app.post('/admin/settings', requireAuth(['Super Admin', 'Barangay Admin']), upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'captain_signature', maxCount: 1 },
    { name: 'id_background', maxCount: 1 }
]), async (req, res) => {
    try {
        const b = req.body;
        const updatePayload = {
            barangay_name: b.barangay_name,
            municipality_city: b.municipality_city,
            province: b.province,
            barangay_address: b.barangay_address,
            contact_number: b.contact_number,
            email: b.email,
            system_name: b.system_name,
            barangay_captain: b.barangay_captain,
            id_prefix: b.id_prefix,
            updated_at: new Date()
        };

        if (req.files['logo']) {
            updatePayload.logo_url = await uploadToSupabase(req.files['logo'][0], 'branding');
        }
        if (req.files['captain_signature']) {
            updatePayload.captain_signature_url = await uploadToSupabase(req.files['captain_signature'][0], 'branding');
        }
        if (req.files['id_background']) {
            updatePayload.id_background_url = await uploadToSupabase(req.files['id_background'][0], 'branding');
        }

        const { data: existing } = await supabase.from('barangay_settings').select('id').limit(1).single();
        if (existing) {
            await supabase.from('barangay_settings').update(updatePayload).eq('id', existing.id);
        } else {
            await supabase.from('barangay_settings').insert([updatePayload]);
        }

        await logActivity(req.user.id, req.user.name, req.user.role, 'UPDATE_SETTINGS', 'Updated System and Barangay configurations');
        res.json({ success: true, message: 'Barangay settings updated persistently!' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// RESIDENT PORTAL ROUTES
app.get('/resident/dashboard', requireAuth(['Resident']), async (req, res) => {
    const residentId = req.user.id;
    const [
        { data: resident },
        { data: certs },
        { data: annos },
        { data: notifs }
    ] = await Promise.all([
        supabase.from('residents').select('*, puroks(*)').eq('id', residentId).single(),
        supabase.from('certificate_requests').select('*').eq('resident_id', residentId).order('created_at', { ascending: false }),
        supabase.from('announcements').select('*').eq('status', 'ACTIVE').order('created_at', { ascending: false }),
        supabase.from('notifications').select('*').eq('resident_id', residentId).order('created_at', { ascending: false })
    ]);

    const { data: settings } = await supabase.from('barangay_settings').select('*').limit(1).single();
    res.send(renderResidentDashboardHTML(req.user, resident, certs || [], annos || [], notifs || [], settings || {}));
});

// CERTIFICATE REQUEST API
app.post('/resident/request-certificate', requireAuth(['Resident']), async (req, res) => {
    const { document_type, purpose, preferred_release_date, notes } = req.body;
    const reqNum = `REQ-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const verifyCode = `CERT-VERIFY-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    const { error } = await supabase.from('certificate_requests').insert([{
        request_number: reqNum,
        resident_id: req.user.id,
        document_type,
        purpose,
        preferred_release_date,
        notes,
        verification_code: verifyCode,
        status: 'SUBMITTED'
    }]);

    if (error) return res.status(500).json({ success: false, message: error.message });
    await logActivity(req.user.id, req.user.name, 'RESIDENT', 'REQUEST_CERT', `Requested ${document_type} (Req #: ${reqNum})`);

    res.json({ success: true, message: 'Certificate request submitted successfully!' });
});

// ADMIN: CERTIFICATE ISSUANCE & RELEASE
app.post('/admin/certificates/update-status', requireAuth(['Super Admin', 'Barangay Admin', 'Secretary', 'Staff']), upload.single('issued_document'), async (req, res) => {
    const { request_id, status, rejection_reason } = req.body;
    const updatePayload = { status, updated_at: new Date(), processed_by: req.user.id };

    if (rejection_reason) updatePayload.rejection_reason = rejection_reason;
    if (req.file) {
        updatePayload.issued_document_url = await uploadToSupabase(req.file, 'certificates');
    }

    const { data: cert, error } = await supabase.from('certificate_requests').update(updatePayload).eq('id', request_id).select('*, residents(*)').single();
    if (error) return res.status(500).json({ success: false, message: error.message });

    await supabase.from('notifications').insert([{
        resident_id: cert.resident_id,
        title: `Certificate Request ${status}`,
        message: `Your request for ${cert.document_type} status updated to: ${status}.`,
        type: 'CERTIFICATE'
    }]);

    await logActivity(req.user.id, req.user.name, req.user.role, 'UPDATE_CERT', `Updated certificate request ${cert.request_number} to ${status}`);
    res.json({ success: true, message: `Request status updated to ${status}` });
});


/* ==========================================================================
   UI TEMPLATE RENDERERS (BLUE, GREEN, AND WHITE PERSISTENT DESIGN STACK)
   ========================================================================== */

function getGlobalStyles() {
    return `
    <style>
        :root {
            --primary-blue: #0284c7;
            --dark-blue: #0369a1;
            --light-blue: #e0f2fe;
            --accent-green: #16a34a;
            --dark-green: #15803d;
            --light-green: #dcfce7;
            --bg-white: #ffffff;
            --bg-slate: #f8fafc;
            --text-dark: #0f172a;
            --text-muted: #475569;
            --border-color: #cbd5e1;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
        body { background-color: var(--bg-slate); color: var(--text-dark); min-height: 100vh; display: flex; flex-direction: column; }
        a { color: var(--primary-blue); text-decoration: none; }
        
        .btn { display: inline-flex; align-items: center; justify-content: center; padding: 0.6rem 1.2rem; font-weight: 600; border-radius: 0.375rem; cursor: pointer; border: none; gap: 0.5rem; transition: background 0.2s; }
        .btn-primary { background: var(--primary-blue); color: white; }
        .btn-primary:hover { background: var(--dark-blue); }
        .btn-secondary { background: var(--accent-green); color: white; }
        .btn-secondary:hover { background: var(--dark-green); }
        .btn-outline { border: 1px solid var(--border-color); background: white; color: var(--text-dark); }
        .btn-outline:hover { background: var(--bg-slate); }
        .btn-danger { background: #dc2626; color: white; }
        
        .card { background: white; border-radius: 0.5rem; border: 1px solid var(--border-color); padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .grid { display: grid; gap: 1rem; }
        .grid-2 { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
        .grid-4 { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }

        .table-container { overflow-x: auto; background: white; border-radius: 0.5rem; border: 1px solid var(--border-color); }
        table { width: 100%; border-collapse: collapse; text-align: left; }
        th { background: var(--light-blue); color: var(--dark-blue); font-weight: 700; padding: 0.75rem 1rem; border-bottom: 2px solid var(--border-color); }
        td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); font-size: 0.9rem; }
        tr:hover { background: #f1f5f9; }

        .badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
        .badge-success { background: var(--light-green); color: var(--dark-green); }
        .badge-warning { background: #fef3c7; color: #d97706; }
        .badge-danger { background: #fee2e2; color: #dc2626; }

        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; z-index: 1000; }
        .modal { background: white; border-radius: 0.5rem; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; padding: 1.5rem; }

        .app-layout { display: flex; min-height: 100vh; }
        .sidebar { width: 260px; background: var(--dark-blue); color: white; padding: 1.5rem 1rem; flex-shrink: 0; display: flex; flex-direction: column; justify-content: space-between; }
        .sidebar h2 { font-size: 1.2rem; font-weight: 700; color: white; margin-bottom: 1.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.2); }
        .nav-link { display: flex; align-items: center; padding: 0.75rem 1rem; color: #e0f2fe; text-decoration: none; border-radius: 0.375rem; font-weight: 500; margin-bottom: 0.25rem; }
        .nav-link:hover, .nav-link.active { background: rgba(255,255,255,0.15); color: white; font-weight: 700; }
        .main-content { flex-grow: 1; padding: 2rem; background: var(--bg-slate); overflow-y: auto; }
        
        .header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; background: white; padding: 1rem 1.5rem; border-radius: 0.5rem; border: 1px solid var(--border-color); }
        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; font-weight: 600; margin-bottom: 0.35rem; color: var(--text-dark); }
        .form-control { width: 100%; padding: 0.6rem 0.8rem; border: 1px solid var(--border-color); border-radius: 0.375rem; font-size: 0.95rem; }
        .form-control:focus { outline: none; border-color: var(--primary-blue); box-shadow: 0 0 0 3px var(--light-blue); }
    </style>
    `;
}

function renderSetupHTML() {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Initial System Setup — BRMS</title>
        ${getGlobalStyles()}
    </head>
    <body style="display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--dark-blue), var(--dark-green));">
        <div class="card" style="width: 100%; max-width: 480px; padding: 2.5rem; background: white;">
            <h2 style="color: var(--dark-blue); margin-bottom: 0.5rem; text-align: center;">SYSTEM INITIALIZATION</h2>
            <p style="color: var(--text-muted); text-align: center; margin-bottom: 1.5rem;">Create the primary Super Administrator Account.</p>
            <form id="setupForm">
                <div class="form-group">
                    <label>Full Name</label>
                    <input type="text" name="full_name" class="form-control" required placeholder="e.g. Chief Admin">
                </div>
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" name="username" class="form-control" required placeholder="admin">
                </div>
                <div class="form-group">
                    <label>Email Address</label>
                    <input type="email" name="email" class="form-control" required placeholder="admin@barangay.gov.ph">
                </div>
                <div class="form-group">
                    <label>Master Password</label>
                    <input type="password" name="password" class="form-control" required placeholder="••••••••••••">
                </div>
                <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 1rem;">Complete Setup & Initialize System</button>
            </form>
        </div>
        <script>
            document.getElementById('setupForm').onsubmit = async (e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const res = await fetch('/setup', { method: 'POST', body: new URLSearchParams(fd) });
                const json = await res.json();
                if(json.success) {
                    alert(json.message);
                    window.location.href = '/login';
                } else {
                    alert('Setup Error: ' + json.message);
                }
            };
        </script>
    </body>
    </html>`;
}

function renderLoginHTML() {
    const bgUrl = "https://scontent.fcrk3-3.fna.fbcdn.net/v/t39.30808-6/467984538_122130208178389200_2470999473131951042_n.jpg";
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Login — Barangay Resident Management System</title>
        ${getGlobalStyles()}
        <style>
            body {
                background: linear-gradient(rgba(3, 105, 161, 0.75), rgba(21, 128, 61, 0.75)), url('${bgUrl}') center/cover no-repeat fixed, #0369a1;
                display: flex; align-items: center; justify-content: center;
            }
            .login-card {
                background: rgba(255, 255, 255, 0.96);
                backdrop-filter: blur(10px);
                border-radius: 0.75rem;
                width: 100%; max-width: 440px; padding: 2.5rem;
                box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3);
            }
            .tab-btn { flex: 1; padding: 0.6rem; text-align: center; cursor: pointer; font-weight: 700; border-bottom: 3px solid transparent; }
            .tab-btn.active { border-color: var(--primary-blue); color: var(--primary-blue); }
        </style>
    </head>
    <body>
        <div class="login-card">
            <div style="text-align: center; margin-bottom: 1.5rem;">
                <h2 style="color: var(--dark-blue); font-size: 1.5rem;">BARANGAY PORTAL</h2>
                <p style="color: var(--text-muted); font-size: 0.875rem;">Resident & Official Authentication Portal</p>
            </div>

            <div style="display: flex; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-color);">
                <div id="tabResident" class="tab-btn active" onclick="setLoginType('RESIDENT')">Resident Login</div>
                <div id="tabStaff" class="tab-btn" onclick="setLoginType('STAFF')">Staff / Admin</div>
            </div>

            <form id="loginForm">
                <input type="hidden" id="user_type" name="user_type" value="RESIDENT">
                <div class="form-group">
                    <label id="idLabel">Email or Resident ID Number</label>
                    <input type="text" name="identifier" class="form-control" required placeholder="e.g. BRGY-2026-123456 or email">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" name="password" class="form-control" required placeholder="••••••••••••">
                </div>
                <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 1rem;">Sign In to Account</button>
            </form>

            <div style="margin-top: 1.5rem; text-align: center; font-size: 0.9rem;">
                <span>New Resident? </span>
                <a href="/register" style="font-weight: 700; color: var(--accent-green);">Register Online Here</a>
            </div>
        </div>

        <script>
            let currentType = 'RESIDENT';
            function setLoginType(type) {
                currentType = type;
                document.getElementById('user_type').value = type;
                if(type === 'RESIDENT') {
                    document.getElementById('tabResident').classList.add('active');
                    document.getElementById('tabStaff').classList.remove('active');
                    document.getElementById('idLabel').innerText = 'Email or Resident ID Number';
                } else {
                    document.getElementById('tabStaff').classList.add('active');
                    document.getElementById('tabResident').classList.remove('active');
                    document.getElementById('idLabel').innerText = 'Username or Official Email';
                }
            }

            document.getElementById('loginForm').onsubmit = async (e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const res = await fetch('/login', { method: 'POST', body: new URLSearchParams(fd) });
                const json = await res.json();
                if(json.success) {
                    window.location.href = json.redirect;
                } else {
                    alert('Authentication Failed: ' + json.message);
                }
            };
        </script>
    </body>
    </html>`;
}

function renderRegisterHTML(puroks) {
    const purokOpts = puroks.map(p => `<option value="${p.id}">${p.purok_name}</option>`).join('');
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Resident Online Registration</title>
        ${getGlobalStyles()}
    </head>
    <body style="padding: 2rem 0; background: var(--bg-slate);">
        <div style="max-width: 700px; margin: 0 auto;" class="card">
            <h2 style="color: var(--dark-blue); border-bottom: 2px solid var(--light-blue); padding-bottom: 0.5rem; margin-bottom: 1.5rem;">
                NEW RESIDENT REGISTRATION FORM
            </h2>
            <form id="regForm" enctype="multipart/form-data">
                <div class="grid grid-2">
                    <div class="form-group"><label>First Name *</label><input type="text" name="first_name" class="form-control" required></div>
                    <div class="form-group"><label>Middle Name</label><input type="text" name="middle_name" class="form-control"></div>
                </div>
                <div class="grid grid-2">
                    <div class="form-group"><label>Last Name *</label><input type="text" name="last_name" class="form-control" required></div>
                    <div class="form-group"><label>Suffix (e.g. Jr., III)</label><input type="text" name="suffix" class="form-control"></div>
                </div>
                <div class="grid grid-2">
                    <div class="form-group"><label>Date of Birth *</label><input type="date" name="date_of_birth" class="form-control" required></div>
                    <div class="form-group"><label>Gender *</label>
                        <select name="gender" class="form-control" required>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                </div>
                <div class="grid grid-2">
                    <div class="form-group"><label>Civil Status *</label>
                        <select name="civil_status" class="form-control" required>
                            <option value="Single">Single</option>
                            <option value="Married">Married</option>
                            <option value="Widowed">Widowed</option>
                            <option value="Separated">Separated</option>
                        </select>
                    </div>
                    <div class="form-group"><label>Purok *</label>
                        <select name="purok_id" class="form-control" required>
                            <option value="">Select Purok...</option>
                            ${purokOpts}
                        </select>
                    </div>
                </div>
                <div class="form-group"><label>Full Address *</label><input type="text" name="address" class="form-control" required placeholder="House #, Street Name"></div>
                <div class="grid grid-2">
                    <div class="form-group"><label>Contact Number *</label><input type="text" name="contact_number" class="form-control" required placeholder="09123456789"></div>
                    <div class="form-group"><label>Email Address *</label><input type="email" name="email" class="form-control" required></div>
                </div>
                <div class="grid grid-2">
                    <div class="form-group"><label>Occupation</label><input type="text" name="occupation" class="form-control"></div>
                    <div class="form-group"><label>Account Password *</label><input type="password" name="password" class="form-control" required></div>
                </div>
                <div class="form-group">
                    <label>Upload Resident ID Photo</label>
                    <input type="file" name="photo" class="form-control" accept="image/*">
                </div>
                <div style="margin: 1rem 0; display: flex; gap: 1.5rem;">
                    <label><input type="checkbox" name="is_pwd" value="true"> Person With Disability (PWD)</label>
                    <label><input type="checkbox" name="is_solo_parent" value="true"> Solo Parent</label>
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                    <button type="submit" class="btn btn-secondary" style="flex: 1;">Submit Registration</button>
                    <a href="/login" class="btn btn-outline">Cancel</a>
                </div>
            </form>
        </div>
        <script>
            document.getElementById('regForm').onsubmit = async (e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const res = await fetch('/register', { method: 'POST', body: fd });
                const json = await res.json();
                if(json.success) {
                    alert(json.message);
                    window.location.href = '/login';
                } else {
                    alert('Registration Failed: ' + json.message);
                }
            };
        </script>
    </body>
    </html>`;
}

function renderAdminDashboardHTML(user, metrics) {
    const purokCards = metrics.puroks.map(p => `
        <div class="card" style="border-left: 4px solid var(--accent-green);">
            <div style="font-size: 0.875rem; color: var(--text-muted);">${p.purok_name}</div>
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--dark-green);">${p.residents ? p.residents[0]?.count || 0 : 0} Residents</div>
        </div>
    `).join('');

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Admin Dashboard — Barangay Portal</title>
        ${getGlobalStyles()}
    </head>
    <body>
        <div class="app-layout">
            <div class="sidebar">
                <div>
                    <h2>BARANGAY ADMIN</h2>
                    <a href="/admin/dashboard" class="nav-link active">Dashboard</a>
                    <a href="/admin/residents" class="nav-link">Resident Records</a>
                    <a href="/scanner" class="nav-link">QR Verification Scanner</a>
                    <a href="/admin/settings" class="nav-link">System Configurations</a>
                </div>
                <div>
                    <div style="font-size: 0.8rem; margin-bottom: 0.5rem;">Logged in as: <b>${user.name}</b></div>
                    <a href="/logout" class="btn btn-danger" style="width: 100%;">Sign Out</a>
                </div>
            </div>
            <div class="main-content">
                <div class="header-bar">
                    <div>
                        <h1 style="font-size: 1.5rem; color: var(--dark-blue);">Barangay Management Console</h1>
                        <p style="color: var(--text-muted);">Real-time demographic and request overview</p>
                    </div>
                    <a href="/admin/print-ids" class="btn btn-secondary">Print Resident Cards</a>
                </div>

                <div class="grid grid-4" style="margin-bottom: 2rem;">
                    <div class="card" style="border-top: 4px solid var(--primary-blue);">
                        <div style="color: var(--text-muted); font-size: 0.875rem;">TOTAL APPROVED RESIDENTS</div>
                        <div style="font-size: 2rem; font-weight: 800; color: var(--dark-blue);">${metrics.totalResidents}</div>
                    </div>
                    <div class="card" style="border-top: 4px solid #f59e0b;">
                        <div style="color: var(--text-muted); font-size: 0.875rem;">PENDING REGISTRATIONS</div>
                        <div style="font-size: 2rem; font-weight: 800; color: #d97706;">${metrics.pendingRegistrations}</div>
                    </div>
                    <div class="card" style="border-top: 4px solid var(--accent-green);">
                        <div style="color: var(--text-muted); font-size: 0.875rem;">REGISTERED HOUSEHOLDS</div>
                        <div style="font-size: 2rem; font-weight: 800; color: var(--dark-green);">${metrics.totalHouseholds}</div>
                    </div>
                    <div class="card" style="border-top: 4px solid #8b5cf6;">
                        <div style="color: var(--text-muted); font-size: 0.875rem;">PENDING CERTIFICATES</div>
                        <div style="font-size: 2rem; font-weight: 800; color: #6d28d9;">${metrics.pendingCertificates}</div>
                    </div>
                </div>

                <h3 style="margin-bottom: 1rem; color: var(--dark-blue);">Purok Resident Distribution</h3>
                <div class="grid grid-4" style="margin-bottom: 2rem;">
                    ${purokCards}
                </div>
            </div>
        </div>
    </body>
    </html>`;
}

function renderAdminResidentsHTML(user, residents, puroks) {
    const rows = residents.map(r => `
        <tr>
            <td><b>${r.resident_id_number}</b></td>
            <td>${r.last_name}, ${r.first_name} ${r.middle_name || ''}</td>
            <td>${r.puroks?.purok_name || 'N/A'}</td>
            <td>${r.age} yrs (${r.gender})</td>
            <td>
                <span class="badge ${r.verification_status === 'APPROVED' ? 'badge-success' : (r.verification_status === 'PENDING' ? 'badge-warning' : 'badge-danger')}">
                    ${r.verification_status}
                </span>
            </td>
            <td>
                ${r.verification_status === 'PENDING' ? `
                    <button onclick="approveRes('${r.id}')" class="btn btn-secondary" style="padding:0.25rem 0.5rem; font-size:0.75rem;">Approve</button>
                    <button onclick="rejectRes('${r.id}')" class="btn btn-danger" style="padding:0.25rem 0.5rem; font-size:0.75rem;">Reject</button>
                ` : `
                    <input type="checkbox" class="id-select-chk" value="${r.id}"> Select for Batch Print
                `}
            </td>
        </tr>
    `).join('');

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Resident Records — BRMS Admin</title>
        ${getGlobalStyles()}
    </head>
    <body>
        <div class="app-layout">
            <div class="sidebar">
                <div>
                    <h2>BARANGAY ADMIN</h2>
                    <a href="/admin/dashboard" class="nav-link">Dashboard</a>
                    <a href="/admin/residents" class="nav-link active">Resident Records</a>
                    <a href="/scanner" class="nav-link">QR Verification Scanner</a>
                    <a href="/admin/settings" class="nav-link">System Configurations</a>
                </div>
            </div>
            <div class="main-content">
                <div class="header-bar">
                    <h2>Resident Directory Management</h2>
                    <button onclick="printSelectedIDs()" class="btn btn-primary">Print Selected IDs (8 Batch Layout)</button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Resident ID</th>
                                <th>Full Name</th>
                                <th>Purok</th>
                                <th>Age / Gender</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>
        <script>
            async function approveRes(id) {
                if(!confirm('Officially approve this resident account?')) return;
                const res = await fetch('/admin/residents/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                const j = await res.json();
                alert(j.message);
                location.reload();
            }

            function printSelectedIDs() {
                const chks = document.querySelectorAll('.id-select-chk:checked');
                const ids = Array.from(chks).map(c => c.value);
                if(ids.length === 0) return alert('Select residents using checkboxes to batch print IDs.');
                window.open('/admin/print-ids?ids=' + ids.join(','), '_blank');
            }
        </script>
    </body>
    </html>`;
}

function renderAdminSettingsHTML(user, settings) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Barangay Configurations</title>
        ${getGlobalStyles()}
    </head>
    <body>
        <div class="app-layout">
            <div class="sidebar">
                <div>
                    <h2>BARANGAY ADMIN</h2>
                    <a href="/admin/dashboard" class="nav-link">Dashboard</a>
                    <a href="/admin/residents" class="nav-link">Resident Records</a>
                    <a href="/admin/settings" class="nav-link active">System Configurations</a>
                </div>
            </div>
            <div class="main-content">
                <div class="card" style="max-width: 800px;">
                    <h2 style="color: var(--dark-blue); margin-bottom: 1rem;">Persistent Barangay Configurations</h2>
                    <form id="settingsForm" enctype="multipart/form-data">
                        <div class="grid grid-2">
                            <div class="form-group"><label>Barangay Name</label><input type="text" name="barangay_name" class="form-control" value="${settings.barangay_name || ''}"></div>
                            <div class="form-group"><label>City / Municipality</label><input type="text" name="municipality_city" class="form-control" value="${settings.municipality_city || ''}"></div>
                        </div>
                        <div class="grid grid-2">
                            <div class="form-group"><label>Province</label><input type="text" name="province" class="form-control" value="${settings.province || ''}"></div>
                            <div class="form-group"><label>Barangay Captain</label><input type="text" name="barangay_captain" class="form-control" value="${settings.barangay_captain || ''}"></div>
                        </div>
                        <div class="grid grid-2">
                            <div class="form-group"><label>Upload Official Logo</label><input type="file" name="logo" class="form-control"></div>
                            <div class="form-group"><label>Captain Signature Image</label><input type="file" name="captain_signature" class="form-control"></div>
                        </div>
                        <button type="submit" class="btn btn-secondary" style="margin-top: 1rem;">Save Persistent Settings</button>
                    </form>
                </div>
            </div>
        </div>
        <script>
            document.getElementById('settingsForm').onsubmit = async (e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const res = await fetch('/admin/settings', { method: 'POST', body: fd });
                const json = await res.json();
                alert(json.message);
                location.reload();
            };
        </script>
    </body>
    </html>`;
}

function renderResidentDashboardHTML(user, resident, certs, annos, notifs, settings) {
    const certRows = certs.map(c => `
        <tr>
            <td><b>${c.request_number}</b></td>
            <td>${c.document_type}</td>
            <td><span class="badge badge-warning">${c.status}</span></td>
            <td>${new Date(c.created_at).toLocaleDateString()}</td>
        </tr>
    `).join('');

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Resident Portal</title>
        ${getGlobalStyles()}
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
        <style>
            .id-card {
                width: 350px; height: 220px; border-radius: 12px; background: linear-gradient(135deg, #0284c7, #16a34a);
                color: white; padding: 12px; position: relative; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); border: 2px solid white;
            }
            .id-header { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.4); padding-bottom: 4px; }
            .id-body { display: flex; gap: 10px; margin-top: 8px; }
            .id-photo { width: 75px; height: 75px; border-radius: 6px; background: #fff; object-fit: cover; border: 2px solid white; }
        </style>
    </head>
    <body>
        <div class="app-layout">
            <div class="sidebar" style="background: var(--dark-green);">
                <div>
                    <h2>RESIDENT PORTAL</h2>
                    <a href="/resident/dashboard" class="nav-link active">My Dashboard & ID</a>
                    <a href="/logout" class="nav-link">Sign Out</a>
                </div>
            </div>
            <div class="main-content">
                <div class="header-bar">
                    <h2>Welcome, ${resident.first_name}!</h2>
                    <button onclick="document.getElementById('reqModal').style.display='flex'" class="btn btn-primary">Request Certificate</button>
                </div>

                <div class="grid grid-2" style="margin-bottom: 2rem;">
                    <div>
                        <h3 style="margin-bottom: 0.5rem; color: var(--dark-blue);">BARANGAY RESIDENT CARD (DIGITAL ID)</h3>
                        <div class="id-card">
                            <div class="id-header">
                                <img src="${settings.logo_url || 'https://via.placeholder.com/40'}" style="width:32px; height:32px; border-radius:50%;">
                                <div>
                                    <div style="font-size:0.65rem; font-weight:800; text-transform:uppercase;">${settings.barangay_name || 'BARANGAY CENTRAL'}</div>
                                    <div style="font-size:0.5rem;">OFFICIAL RESIDENT IDENTIFICATION CARD</div>
                                </div>
                            </div>
                            <div class="id-body">
                                <img src="${resident.photo_url || 'https://via.placeholder.com/100'}" class="id-photo">
                                <div style="font-size:0.7rem;">
                                    <div><b>ID:</b> ${resident.resident_id_number}</div>
                                    <div><b>NAME:</b> ${resident.first_name} ${resident.last_name}</div>
                                    <div><b>DOB:</b> ${resident.date_of_birth}</div>
                                    <div><b>PUROK:</b> ${resident.puroks?.purok_name || 'N/A'}</div>
                                </div>
                            </div>
                            <div style="position:absolute; bottom:8px; right:12px;">
                                <canvas id="idQrCanvas"></canvas>
                            </div>
                        </div>
                    </div>
                </div>

                <h3 style="margin-bottom: 1rem; color: var(--dark-blue);">My Certificate Requests</h3>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Req #</th>
                                <th>Document</th>
                                <th>Status</th>
                                <th>Requested Date</th>
                            </tr>
                        </thead>
                        <tbody>${certRows || '<tr><td colspan="4">No certificate requests found.</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Request Modal -->
        <div id="reqModal" class="modal-overlay">
            <div class="modal">
                <h3>Request Official Document</h3>
                <form id="reqForm" style="margin-top:1rem;">
                    <div class="form-group">
                        <label>Document Type</label>
                        <select name="document_type" class="form-control" required>
                            <option value="Barangay Clearance">Barangay Clearance</option>
                            <option value="Certificate of Residency">Certificate of Residency</option>
                            <option value="Certificate of Indigency">Certificate of Indigency</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Purpose</label>
                        <input type="text" name="purpose" class="form-control" required placeholder="e.g. Employment, Scholarship">
                    </div>
                    <div style="display:flex; gap:1rem; margin-top:1.5rem;">
                        <button type="submit" class="btn btn-primary" style="flex:1;">Submit Request</button>
                        <button type="button" onclick="document.getElementById('reqModal').style.display='none'" class="btn btn-outline">Close</button>
                    </div>
                </form>
            </div>
        </div>

        <script>
            QRCode.toCanvas(document.getElementById('idQrCanvas'), '${resident.resident_id_number}', { width: 50, margin: 1 });
            document.getElementById('reqForm').onsubmit = async (e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const res = await fetch('/resident/request-certificate', { method: 'POST', body: new URLSearchParams(fd) });
                const json = await res.json();
                alert(json.message);
                location.reload();
            };
        </script>
    </body>
    </html>`;
}

function renderScannerHTML(user) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>QR Verification Scanner</title>
        ${getGlobalStyles()}
    </head>
    <body>
        <div class="app-layout">
            <div class="sidebar">
                <div>
                    <h2>BARANGAY ADMIN</h2>
                    <a href="/admin/dashboard" class="nav-link">Dashboard</a>
                    <a href="/scanner" class="nav-link active">QR Verification Scanner</a>
                </div>
            </div>
            <div class="main-content">
                <div class="card" style="max-width: 600px; margin: 0 auto; text-align: center;">
                    <h2 style="color: var(--dark-blue);">OFFICIAL QR CODE VERIFIER</h2>
                    <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Verify Resident Cards & Authenticate Documents</p>
                    
                    <div class="form-group">
                        <input type="text" id="qrInput" class="form-control" placeholder="Scan or enter Verification / Resident ID code...">
                    </div>
                    <button onclick="verifyCode()" class="btn btn-primary" style="width: 100%;">Verify Code</button>

                    <div id="verifyResult" style="margin-top: 2rem; display: none; text-align: left;" class="card"></div>
                </div>
            </div>
        </div>
        <script>
            async function verifyCode() {
                const code = document.getElementById('qrInput').value.trim();
                if(!code) return alert('Enter a code to verify.');
                const res = await fetch('/api/verify-qr/' + encodeURIComponent(code));
                const json = await res.json();
                const resDiv = document.getElementById('verifyResult');
                resDiv.style.display = 'block';
                
                if(json.success) {
                    resDiv.innerHTML = '<h3 style="color:var(--dark-green);">VALID RECORD VERIFIED</h3><pre>' + JSON.stringify(json.data, null, 2) + '</pre>';
                } else {
                    resDiv.innerHTML = '<h3 style="color:#dc2626;">VERIFICATION FAILED</h3><p>' + json.message + '</p>';
                }
            }
        </script>
    </body>
    </html>`;
}

function render8IDsPrintLayoutHTML(residents, settings) {
    const cards = residents.map(r => `
        <div style="width: 3.375in; height: 2.125in; border: 1px solid #000; border-radius: 8px; padding: 8px; box-sizing: border-box; background: linear-gradient(135deg, #0284c7, #16a34a); color: white; position: relative; page-break-inside: avoid;">
            <div style="font-size: 8pt; font-weight: bold; text-align: center; border-bottom: 1px solid white;">${settings.barangay_name || 'BARANGAY CENTRAL'} RESIDENT CARD</div>
            <div style="display: flex; gap: 8px; margin-top: 6px;">
                <img src="${r.photo_url || 'https://via.placeholder.com/80'}" style="width: 0.8in; height: 0.8in; border-radius: 4px; object-fit: cover; border: 1px solid white;">
                <div style="font-size: 7pt;">
                    <div><b>ID:</b> ${r.resident_id_number}</div>
                    <div><b>NAME:</b> ${r.first_name} ${r.last_name}</div>
                    <div><b>DOB:</b> ${r.date_of_birth}</div>
                    <div><b>STATUS:</b> ${r.verification_status}</div>
                </div>
            </div>
        </div>
    `).join('');

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Batch Print Resident Cards (8-Up Sheet)</title>
        <style>
            @page { size: letter; margin: 0.5in; }
            body { font-family: sans-serif; margin: 0; padding: 0; }
            .print-grid { display: grid; grid-template-columns: repeat(2, 3.375in); gap: 0.2in; justify-content: center; }
        </style>
    </head>
    <body onload="window.print()">
        <div class="print-grid">${cards}</div>
    </body>
    </html>`;
}

// SERVER INITIALIZATION
app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`Barangay Resident Management System live on Port ${PORT}`);
    console.log(`Ready for Render Deployment + Supabase Engine`);
    console.log(`===================================================`);
});
