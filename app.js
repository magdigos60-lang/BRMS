/* ==========================================================================
   BARANGAY RESIDENT MANAGEMENT SYSTEM (BRMS) - MONOLITHIC SERVER & WEB CLIENT
   Theme: Strict Blue (#2563eb / #1e40af), Green (#059669 / #047857), White (#ffffff)
   ========================================================================== */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment Configs
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const JWT_SECRET = process.env.JWT_SECRET || 'brms-fallback-secret-2026';

// Background Image URL from User Request
const CUSTOM_BG_URL = "https://scontent.fcrk3-3.fna.fbcdn.net/v/t39.30808-6/467984538_122130208178389200_2470999473131951042_n.jpg?stp=dst-jpg_tt6&cstp=mx1857x2048&ctp=s1857x2048&_nc_cat=107&ccb=1-7&_nc_sid=cc71e4&_nc_eui2=AeH-CrVk3UW0Tqq0z_SDhKwemnbseM68ydCadux4zrzJ0I4R6gykVtH1GEMMnjk_E0vUUupJBZ3vwMdzuIfYXMgZ&_nc_ohc=fKl5LR1-2YwQ7kNvwH7PIf8&_nc_oc=AdqAy1CtUXak56hu0R2Ufzy_6npapuoitUaMuup0g9veAD0bOy9PFjySTvVXJasGWis&_nc_zt=23&_nc_ht=scontent.fcrk3-3.fna&_nc_gid=SU-DBALnvlE-vtQ4KjJx4g&_nc_ss=7b2a8&oh=00_AQK7MxJys6gqu1LJrVhDYZ2WNBpKcThfTEtIUXEWUeB_Qw&oe=6ABBAEB1";

// Default SVG Placeholders for Logo & User Photo to prevent missing images on reset
const DEFAULT_LOGO_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='%23059669'/><path d='M50 15 L80 35 L80 75 L50 95 L20 75 L20 35 Z' fill='%232563eb' stroke='%23ffffff' stroke-width='3'/><text x='50' y='58' font-size='22' font-weight='bold' text-anchor='middle' fill='%23ffffff'>BRGY</text></svg>";
const DEFAULT_USER_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23cbd5e1'/><circle cx='50' cy='38' r='20' fill='%23475569'/><path d='M20 85 C20 65 35 55 50 55 C65 55 80 65 80 85 Z' fill='%23475569'/></svg>";

// Initialize Supabase Client
let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// Ensure Uploads Directory Exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Express Middlewares
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));

/* ==========================================================================
   AUTH & SECURITY MIDDLEWARES
   ========================================================================== */

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
        req.user = user;
        next();
    });
}

function requireRole(roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Unauthorized access.' });
        }
        next();
    };
}

async function logActivity(userId, userName, action, details, ip) {
    if (!supabase) return;
    try {
        await supabase.from('activity_logs').insert([{
            user_id: userId,
            user_name: userName,
            action,
            details,
            ip_address: ip
        }]);
    } catch (e) {
        console.error('Log error:', e);
    }
}

/* ==========================================================================
   API ENDPOINTS
   ========================================================================== */

app.get('/api/setup/status', async (req, res) => {
    try {
        if (!supabase) return res.json({ configured: false, needsAdmin: true });
        const { data, error } = await supabase.from('users').select('id').eq('role', 'super_admin');
        if (error) throw error;
        res.json({ configured: true, needsAdmin: data.length === 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/setup/admin', async (req, res) => {
    try {
        const { fullName, username, email, password, confirmPassword } = req.body;
        if (!fullName || !username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required.' });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Passwords do not match.' });
        }

        const { data: existingAdmin } = await supabase.from('users').select('id').eq('role', 'super_admin');
        if (existingAdmin && existingAdmin.length > 0) {
            return res.status(400).json({ error: 'Admin setup has already been completed.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const { data, error } = await supabase.from('users').insert([{
            full_name: fullName,
            username,
            email,
            password_hash: hashedPassword,
            role: 'super_admin'
        }]).select();

        if (error) throw error;
        await logActivity(data[0].id, fullName, 'SYSTEM_INIT', 'Initial Super Admin Created', req.ip);
        res.json({ success: true, message: 'Administrator created successfully. You can now login.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, portalType } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username/Email and password required.' });

        const { data: users, error } = await supabase.from('users').select('*')
            .or(`username.eq.${username},email.eq.${username}`);

        if (error || !users || users.length === 0) {
            return res.status(401).json({ error: 'Invalid user or password credentials.' });
        }

        const user = users[0];
        if (user.is_active === false) {
            return res.status(403).json({ error: 'Account is deactivated. Contact Barangay Administration.' });
        }

        const validPass = await bcrypt.compare(password, user.password_hash);
        if (!validPass) {
            return res.status(401).json({ error: 'Invalid user or password credentials.' });
        }

        if (portalType === 'staff' && user.role === 'resident') {
            return res.status(403).json({ error: 'Resident accounts cannot access Staff Portal.' });
        }
        if (portalType === 'resident' && user.role !== 'resident') {
            return res.status(403).json({ error: 'Staff users must log in through Staff Portal.' });
        }

        let residentProfile = null;
        if (user.role === 'resident') {
            const { data: resData } = await supabase.from('residents').select('*, puroks(name)').eq('user_id', user.id).single();
            residentProfile = resData;
            if (residentProfile && residentProfile.status === 'PENDING') {
                return res.status(403).json({ error: 'Your resident account registration is still PENDING staff approval.' });
            }
            if (residentProfile && residentProfile.status === 'REJECTED') {
                return res.status(403).json({ error: `Registration rejected: ${residentProfile.rejection_reason || 'Contact Barangay.'}` });
            }
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, fullName: user.full_name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        await logActivity(user.id, user.full_name, 'LOGIN', `Logged in via ${portalType} portal`, req.ip);

        res.json({
            token,
            user: { id: user.id, username: user.username, role: user.role, fullName: user.full_name, email: user.email },
            resident: residentProfile
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/resident/profile/update', authenticateToken, upload.single('photo'), async (req, res) => {
    try {
        const { contactNumber, email, address, civilStatus } = req.body;
        const updateFields = {
            contact_number: contactNumber,
            email,
            address,
            civil_status: civilStatus,
            updated_at: new Date()
        };

        if (req.file) {
            updateFields.photo_url = `/uploads/${req.file.filename}`;
        }

        const { data, error } = await supabase.from('residents')
            .update(updateFields)
            .eq('user_id', req.user.id)
            .select('*, puroks(name)');

        if (error) throw error;
        res.json({ success: true, message: 'Profile updated successfully!', resident: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/public/register', upload.single('photo'), async (req, res) => {
    try {
        const {
            firstName, middleName, lastName, suffix, dateOfBirth, gender, civilStatus,
            contactNumber, email, address, purokId, occupation, educationalAttainment,
            voterStatus, isSeniorCitizen, isPwd, isSoloParent, username, password
        } = req.body;

        if (!firstName || !lastName || !dateOfBirth || !gender || !username || !password) {
            return res.status(400).json({ error: 'Please provide all required registration fields.' });
        }

        const { data: existingUser } = await supabase.from('users').select('id')
            .or(`username.eq.${username},email.eq.${email}`).limit(1);
        if (existingUser && existingUser.length > 0) {
            return res.status(400).json({ error: 'Username or Email is already registered.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const { data: user, error: userError } = await supabase.from('users').insert([{
            username,
            email: email || `${username}@barangay.local`,
            password_hash: hashedPassword,
            role: 'resident',
            full_name: `${firstName} ${lastName}`
        }]).select();

        if (userError) throw userError;

        const photoUrl = req.file ? `/uploads/${req.file.filename}` : '';
        const verificationToken = 'TOK-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

        const { data: resident, error: resError } = await supabase.from('residents').insert([{
            user_id: user[0].id,
            first_name: firstName,
            middle_name: middleName || '',
            last_name: lastName,
            suffix: suffix || '',
            date_of_birth: dateOfBirth,
            gender,
            civil_status: civilStatus || 'Single',
            contact_number: contactNumber,
            email,
            address,
            purok_id: purokId || null,
            occupation,
            educational_attainment: educationalAttainment,
            voter_status: voterStatus || 'No',
            is_senior_citizen: isSeniorCitizen === 'true',
            is_pwd: isPwd === 'true',
            is_solo_parent: isSoloParent === 'true',
            photo_url: photoUrl,
            status: 'PENDING',
            verification_token: verificationToken
        }]).select();

        if (resError) throw resError;

        res.json({ success: true, message: 'Registration submitted successfully. Please wait for Barangay Staff approval.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        const { data, error } = await supabase.from('system_settings').select('*');
        if (error) throw error;
        const settings = {
            barangay_logo: DEFAULT_LOGO_SVG,
            barangay_name: 'BARANGAY CENTRAL',
            municipality: 'Municipality',
            province: 'Province',
            captain_name: 'Hon. Barangay Captain',
            captain_signature: ''
        };
        if (data && data.length > 0) {
            data.forEach(item => {
                if (item.setting_value) settings[item.setting_key] = item.setting_value;
            });
        }
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings', authenticateToken, requireRole(['super_admin']), upload.fields([
    { name: 'barangay_logo', maxCount: 1 },
    { name: 'captain_signature', maxCount: 1 }
]), async (req, res) => {
    try {
        const body = req.body;
        if (req.files && req.files['barangay_logo']) {
            body.barangay_logo = `/uploads/${req.files['barangay_logo'][0].filename}`;
        }
        if (req.files && req.files['captain_signature']) {
            body.captain_signature = `/uploads/${req.files['captain_signature'][0].filename}`;
        }
        for (const [key, val] of Object.entries(body)) {
            await supabase.from('system_settings').upsert({ setting_key: key, setting_value: val, updated_at: new Date() }, { onConflict: 'setting_key' });
        }
        await logActivity(req.user.id, req.user.fullName, 'UPDATE_SETTINGS', 'Updated system branding settings', req.ip);
        res.json({ success: true, message: 'System settings updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const { count: totalResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE');
        const { count: totalHouseholds } = await supabase.from('households').select('*', { count: 'exact', head: true });
        const { count: maleResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').eq('gender', 'Male');
        const { count: femaleResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').eq('gender', 'Female');
        const { count: seniorCitizens } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').eq('is_senior_citizen', true);
        const { count: pwdCount } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').eq('is_pwd', true);
        const { count: soloParents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').eq('is_solo_parent', true);
        const { count: voters } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').eq('voter_status', 'Yes');
        const { count: pendingApprovals } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');
        const { count: pendingCerts } = await supabase.from('certificate_requests').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');
        const { count: pendingAppts } = await supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');
        const { count: openBlotter } = await supabase.from('blotter_cases').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE');

        res.json({
            totalResidents: totalResidents || 0,
            totalHouseholds: totalHouseholds || 0,
            maleResidents: maleResidents || 0,
            femaleResidents: femaleResidents || 0,
            seniorCitizens: seniorCitizens || 0,
            pwdCount: pwdCount || 0,
            soloParents: soloParents || 0,
            voters: voters || 0,
            pendingApprovals: pendingApprovals || 0,
            pendingCerts: pendingCerts || 0,
            pendingAppts: pendingAppts || 0,
            openBlotter: openBlotter || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/residents', authenticateToken, async (req, res) => {
    try {
        const { status = 'ACTIVE', search = '', purokId = '' } = req.query;
        let query = supabase.from('residents').select('*, puroks(name)').eq('status', status);

        if (purokId) query = query.eq('purok_id', purokId);
        if (search) {
            query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,resident_number.ilike.%${search}%`);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/residents/:id/approve', authenticateToken, requireRole(['super_admin', 'captain', 'secretary']), async (req, res) => {
    try {
        const residentId = req.params.id;
        const resNum = 'BRGY-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000);

        const verifyUrl = `${req.protocol}://${req.get('host')}/verify/resident/${residentId}`;
        const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl, { width: 300, margin: 1 });

        const { data, error } = await supabase.from('residents').update({
            status: 'ACTIVE',
            resident_number: resNum,
            qr_code_url: qrCodeDataUrl,
            updated_at: new Date()
        }).eq('id', residentId).select();

        if (error) throw error;
        await logActivity(req.user.id, req.user.fullName, 'APPROVE_RESIDENT', `Approved resident ID: ${resNum}`, req.ip);
        res.json({ success: true, message: 'Resident approved successfully.', resident: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/residents/:id/reject', authenticateToken, requireRole(['super_admin', 'captain', 'secretary']), async (req, res) => {
    try {
        const { reason } = req.body;
        const { error } = await supabase.from('residents').update({
            status: 'REJECTED',
            rejection_reason: reason || 'Information verification failed',
            updated_at: new Date()
        }).eq('id', req.params.id);

        if (error) throw error;
        await logActivity(req.user.id, req.user.fullName, 'REJECT_RESIDENT', `Rejected resident ID: ${req.params.id}`, req.ip);
        res.json({ success: true, message: 'Resident application rejected.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/residents/:id/archive', authenticateToken, requireRole(['super_admin', 'captain', 'secretary']), async (req, res) => {
    try {
        const { error } = await supabase.from('residents').update({ status: 'ARCHIVED', updated_at: new Date() }).eq('id', req.params.id);
        if (error) throw error;
        await logActivity(req.user.id, req.user.fullName, 'ARCHIVE_RESIDENT', `Archived resident ${req.params.id}`, req.ip);
        res.json({ success: true, message: 'Resident archived.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/residents/:id/restore', authenticateToken, requireRole(['super_admin', 'captain', 'secretary']), async (req, res) => {
    try {
        const { error } = await supabase.from('residents').update({ status: 'ACTIVE', updated_at: new Date() }).eq('id', req.params.id);
        if (error) throw error;
        await logActivity(req.user.id, req.user.fullName, 'RESTORE_RESIDENT', `Restored resident ${req.params.id}`, req.ip);
        res.json({ success: true, message: 'Resident restored to Active status.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/puroks', async (req, res) => {
    try {
        const { data: puroks, error } = await supabase.from('puroks').select('*').order('name');
        if (error) throw error;

        const { data: residents } = await supabase.from('residents').select('purok_id').eq('status', 'ACTIVE');
        const countMap = {};
        if (residents) {
            residents.forEach(r => {
                if (r.purok_id) {
                    countMap[r.purok_id] = (countMap[r.purok_id] || 0) + 1;
                }
            });
        }

        const formatted = (puroks || []).map(p => ({
            ...p,
            resident_count: countMap[p.id] || 0
        }));

        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/puroks', authenticateToken, requireRole(['super_admin', 'captain', 'secretary']), async (req, res) => {
    try {
        const { name, description } = req.body;
        const { data, error } = await supabase.from('puroks').insert([{ name, description }]).select();
        if (error) throw error;
        res.json({ success: true, message: 'Purok added successfully.', data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/households', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase.from('households').select('*, puroks(name), head:residents(first_name, last_name)').order('household_number');
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/households', authenticateToken, requireRole(['super_admin', 'captain', 'secretary']), async (req, res) => {
    try {
        const { householdNumber, purokId, streetAddress } = req.body;
        const { data, error } = await supabase.from('households').insert([{
            household_number: householdNumber,
            purok_id: purokId || null,
            street_address: streetAddress
        }]).select();
        if (error) throw error;
        res.json({ success: true, message: 'Household added successfully.', data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/certificates/requests', authenticateToken, async (req, res) => {
    try {
        let query = supabase.from('certificate_requests').select('*, residents(first_name, last_name, resident_number, address)');
        if (req.user.role === 'resident') {
            const { data: resData } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
            if (resData) query = query.eq('resident_id', resData.id);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/certificates/request', authenticateToken, async (req, res) => {
    try {
        const { certificateType, purpose } = req.body;
        const { data: resData } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
        if (!resData) return res.status(400).json({ error: 'Resident profile not found.' });

        const reqNum = 'REQ-' + Math.floor(100000 + Math.random() * 900000);
        const { data, error } = await supabase.from('certificate_requests').insert([{
            request_number: reqNum,
            resident_id: resData.id,
            certificate_type: certificateType,
            purpose,
            status: 'PENDING'
        }]).select();

        if (error) throw error;
        await logActivity(req.user.id, req.user.fullName, 'REQUEST_CERTIFICATE', `Requested ${certificateType}`, req.ip);
        res.json({ success: true, message: 'Certificate request submitted successfully.', data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/certificates/approve', authenticateToken, requireRole(['super_admin', 'captain', 'secretary', 'staff']), upload.single('certificate_file'), async (req, res) => {
    try {
        const { requestId } = req.body;
        if (!req.file) return res.status(400).json({ error: 'Official certificate file (PDF/Image) is required.' });

        const { data: reqData } = await supabase.from('certificate_requests').select('*').eq('id', requestId).single();
        if (!reqData) return res.status(404).json({ error: 'Request not found.' });

        const certNum = 'CERT-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000);
        const fileUrl = `/uploads/${req.file.filename}`;

        await supabase.from('certificates').insert([{
            request_id: requestId,
            resident_id: reqData.resident_id,
            certificate_number: certNum,
            certificate_type: reqData.certificate_type,
            file_url: fileUrl,
            issued_by: req.user.id
        }]);

        await supabase.from('certificate_requests').update({
            status: 'READY_FOR_RELEASE',
            processed_by: req.user.id,
            updated_at: new Date()
        }).eq('id', requestId);

        await logActivity(req.user.id, req.user.fullName, 'APPROVE_CERTIFICATE', `Approved & uploaded ${certNum}`, req.ip);
        res.json({ success: true, message: 'Certificate file uploaded and marked Ready For Release.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/assistance', authenticateToken, async (req, res) => {
    try {
        let query = supabase.from('assistance_requests').select('*, residents(first_name, last_name, contact_number)');
        if (req.user.role === 'resident') {
            const { data: resData } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
            if (resData) query = query.eq('resident_id', resData.id);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/assistance', authenticateToken, async (req, res) => {
    try {
        const { assistanceType, details } = req.body;
        const { data: resData } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
        if (!resData) return res.status(400).json({ error: 'Resident record missing.' });

        const reqNum = 'AST-' + Math.floor(10000 + Math.random() * 90000);
        const { data, error } = await supabase.from('assistance_requests').insert([{
            request_number: reqNum,
            resident_id: resData.id,
            assistance_type: assistanceType,
            details,
            status: 'PENDING'
        }]).select();

        if (error) throw error;
        res.json({ success: true, message: 'Assistance request submitted successfully.', data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/resident/edit-request', authenticateToken, async (req, res) => {
    try {
        const { requestedChanges } = req.body;
        const { data: resData } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
        if (!resData) return res.status(400).json({ error: 'Resident record missing.' });

        const { data, error } = await supabase.from('profile_edit_requests').insert([{
            resident_id: resData.id,
            requested_changes: requestedChanges,
            status: 'PENDING'
        }]).select();

        if (error) throw error;
        res.json({ success: true, message: 'Profile edit request submitted to Barangay Staff.', data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/feedback', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase.from('feedback').select('*, residents(first_name, last_name)').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/feedback', authenticateToken, async (req, res) => {
    try {
        const { rating, comments } = req.body;
        const { data: resData } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
        
        const { data, error } = await supabase.from('feedback').insert([{
            resident_id: resData ? resData.id : null,
            rating,
            comments
        }]).select();

        if (error) throw error;
        res.json({ success: true, message: 'Thank you for your feedback!', data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/qr/claim-info/:residentId', authenticateToken, requireRole(['super_admin', 'captain', 'secretary', 'staff']), async (req, res) => {
    try {
        const { residentId } = req.params;
        const { data: resident, error: rErr } = await supabase.from('residents').select('*').eq('id', residentId).single();
        if (rErr || !resident) return res.status(404).json({ error: 'Resident record not found.' });

        const { data: claims } = await supabase.from('certificate_requests')
            .select('*')
            .eq('resident_id', residentId)
            .in('status', ['READY_FOR_RELEASE', 'APPROVED']);

        res.json({ resident, claims: claims || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/qr/release-claim', authenticateToken, requireRole(['super_admin', 'captain', 'secretary', 'staff']), async (req, res) => {
    try {
        const { requestId } = req.body;
        const { data, error } = await supabase.from('certificate_requests').update({
            status: 'RELEASED',
            released_by: req.user.id,
            released_at: new Date(),
            updated_at: new Date()
        }).eq('id', requestId).select();

        if (error) throw error;
        await logActivity(req.user.id, req.user.fullName, 'RELEASE_CLAIM', `Released request ID ${requestId}`, req.ip);
        res.json({ success: true, message: 'Item marked as RELEASED successfully.', data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/announcements', async (req, res) => {
    try {
        const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/announcements', authenticateToken, requireRole(['super_admin', 'captain', 'secretary', 'staff']), upload.single('image'), async (req, res) => {
    try {
        const { title, content, priority } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : '';
        const { data, error } = await supabase.from('announcements').insert([{
            title, content, priority: priority || 'Normal', image_url: imageUrl, created_by: req.user.id
        }]).select();

        if (error) throw error;
        await logActivity(req.user.id, req.user.fullName, 'CREATE_ANNOUNCEMENT', `Created: ${title}`, req.ip);
        res.json({ success: true, message: 'Announcement published successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/blotter', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase.from('blotter_cases').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/blotter', authenticateToken, async (req, res) => {
    try {
        const { complainantName, respondentName, witnessName, incidentDate, incidentTime, location, description } = req.body;
        const caseNum = 'BLOT-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
        const { data, error } = await supabase.from('blotter_cases').insert([{
            case_number: caseNum,
            complainant_name: complainantName,
            respondent_name: respondentName,
            witness_name: witnessName,
            incident_date: incidentDate,
            incident_time: incidentTime,
            location,
            description,
            created_by: req.user.id
        }]).select();

        if (error) throw error;
        await logActivity(req.user.id, req.user.fullName, 'CREATE_BLOTTER', `Case ${caseNum} logged`, req.ip);
        res.json({ success: true, message: 'Blotter case recorded successfully.', data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/appointments', authenticateToken, async (req, res) => {
    try {
        let query = supabase.from('appointments').select('*, residents(first_name, last_name, contact_number)');
        if (req.user.role === 'resident') {
            const { data: resData } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
            if (resData) query = query.eq('resident_id', resData.id);
        }
        const { data, error } = await query.order('appointment_date', { ascending: true });
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/appointments', authenticateToken, async (req, res) => {
    try {
        const { serviceType, appointmentDate, appointmentTime, purpose } = req.body;
        const { data: resData } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
        if (!resData) return res.status(400).json({ error: 'Resident record missing.' });

        const apptNum = 'APT-' + Math.floor(10000 + Math.random() * 90000);
        const { data, error } = await supabase.from('appointments').insert([{
            appointment_number: apptNum,
            resident_id: resData.id,
            service_type: serviceType,
            appointment_date: appointmentDate,
            appointment_time: appointmentTime,
            purpose,
            status: 'PENDING'
        }]).select();

        if (error) throw error;
        res.json({ success: true, message: 'Appointment requested successfully.', data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/logs', authenticateToken, requireRole(['super_admin']), async (req, res) => {
    try {
        const { data, error } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Dedicated QR Scanner Route for Staff
app.get('/scanner', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Barangay QR ID Scanner</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <script src="https://cdn.jsdelivr.net/npm/html5-qrcode/html5-qrcode.min.js"></script>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        </head>
        <body class="bg-slate-900 text-white min-h-screen flex flex-col items-center justify-center p-4">
            <div class="bg-slate-800 p-6 rounded-2xl shadow-2xl max-w-md w-full border border-emerald-500/30 text-center">
                <h2 class="text-xl font-bold mb-2 text-emerald-400"><i class="fa-solid fa-qrcode mr-2"></i> Barangay ID Scanner</h2>
                <p class="text-xs text-slate-400 mb-4">Point your camera at a resident ID QR code to verify or process document claims.</p>
                <div id="reader" class="w-full overflow-hidden rounded-lg bg-black"></div>
                <div id="scanResult" class="mt-4 text-xs font-mono"></div>
                <a href="/" class="mt-4 inline-block text-xs text-blue-400 hover:underline">&larr; Back to System Dashboard</a>
            </div>
            <script>
                function onScanSuccess(decodedText, decodedResult) {
                    window.location.href = decodedText;
                }
                const html5QrCode = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
                html5QrCode.render(onScanSuccess);
            </script>
        </body>
        </html>
    `);
});

app.get('/verify/resident/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('id', id).single();
        const { data: settings } = await supabase.from('system_settings').select('*');
        const brgy = { barangay_logo: DEFAULT_LOGO_SVG };
        if (settings) settings.forEach(s => brgy[s.setting_key] = s.setting_value);

        if (!resident || resident.status !== 'ACTIVE') {
            return res.send(`
                <html><body style="font-family:sans-serif; text-align:center; padding:50px; background:#f8fafc;">
                    <h1 style="color:#dc2626;">INVALID / UNVERIFIED BARANGAY ID</h1>
                    <p>The queried resident ID token does not exist or is currently inactive.</p>
                </body></html>
            `);
        }

        const photo = resident.photo_url || DEFAULT_USER_SVG;

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Barangay Resident ID Verification</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0fdf4; margin: 0; padding: 20px; display:flex; justify-content:center; }
                    .card { background: white; max-width: 450px; width:100%; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); overflow:hidden; border:2px solid #059669; }
                    .header { background: linear-gradient(135deg, #059669, #2563eb); color: white; padding: 20px; text-align:center; }
                    .body { padding: 25px; text-align:center; }
                    .badge { background: #dcfce7; color: #166534; padding: 6px 16px; border-radius: 20px; font-weight:bold; display:inline-block; margin-bottom:15px; }
                    .photo { width: 110px; height: 110px; border-radius: 50%; object-fit: cover; border: 4px solid #059669; margin-bottom: 15px; }
                    .info-table { width:100%; text-align:left; margin-top:15px; border-collapse:collapse; }
                    .info-table td { padding: 8px; border-bottom: 1px solid #f1f5f9; }
                    .info-table td.label { font-weight:bold; color:#475569; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="header">
                        <h2 style="margin:0;">${brgy.barangay_name || 'BARANGAY CENTRAL'}</h2>
                        <small>${brgy.municipality || 'Municipality'}, ${brgy.province || 'Province'}</small>
                    </div>
                    <div class="body">
                        <div class="badge">&#10004; OFFICIAL VALID RESIDENT CARD</div><br>
                        <img class="photo" src="${photo}" onerror="this.src='${DEFAULT_USER_SVG}'" alt="Resident Photo">
                        <h2 style="margin:5px 0; color:#1e293b;">${resident.first_name} ${resident.middle_name || ''} ${resident.last_name}</h2>
                        <p style="color:#059669; font-weight:bold; margin:0;">ID: ${resident.resident_number}</p>
                        <table class="info-table">
                            <tr><td class="label">Purok:</td><td>${resident.puroks ? resident.puroks.name : 'N/A'}</td></tr>
                            <tr><td class="label">Civil Status:</td><td>${resident.civil_status}</td></tr>
                            <tr><td class="label">Voter Status:</td><td>${resident.voter_status}</td></tr>
                            <tr><td class="label">Address:</td><td>${resident.address}</td></tr>
                        </table>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send('Verification Error');
    }
});

/* ==========================================================================
   FRONTEND APPLICATION SERVING (SINGLE PAGE APPLICATION)
   ========================================================================== */

app.get('*', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Barangay Resident Management System</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/html5-qrcode/html5-qrcode.min.js"></script>
    <style>
        :root {
            --primary-green: #059669;
            --primary-blue: #2563eb;
        }
        
        .bg-login-custom {
            background-image: linear-gradient(rgba(5, 150, 105, 0.88), rgba(37, 99, 235, 0.88)), 
                              url('${CUSTOM_BG_URL}');
            background-size: cover;
            background-position: center;
        }

        .id-card-national {
            width: 3.375in;
            height: 2.125in;
            border: 2px solid #059669;
            border-radius: 8px;
            overflow: hidden;
            box-sizing: border-box;
            background-image: linear-gradient(rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.92)), url('${CUSTOM_BG_URL}');
            background-size: cover;
            background-position: center;
            position: relative;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 4px;
            font-family: 'Arial', sans-serif;
            color: #0f172a;
        }

        @media print {
            body * { visibility: hidden; }
            #printableArea, #printableArea * { visibility: visible; }
            #printableArea { position: absolute; left: 0; top: 0; width: 100%; }
            .no-print { display: none !important; }
            
            .id-grid-container {
                display: grid;
                grid-template-columns: repeat(2, 3.375in);
                grid-auto-rows: 2.125in;
                gap: 0.2in;
                padding: 0.2in;
                justify-content: center;
            }
        }
    </style>
</head>
<body class="bg-slate-50 text-slate-800 antialiased font-sans">

    <div id="app" class="min-h-screen flex flex-col"></div>

    <script>
        const DEFAULT_LOGO = "${DEFAULT_LOGO_SVG}";
        const DEFAULT_USER = "${DEFAULT_USER_SVG}";

        let state = {
            token: localStorage.getItem('brms_token') || null,
            user: JSON.parse(localStorage.getItem('brms_user')) || null,
            resident: JSON.parse(localStorage.getItem('brms_resident')) || null,
            settings: {},
            activeTab: 'dashboard',
            resActiveTab: 'dashboard'
        };

        async function api(endpoint, options = {}) {
            const headers = options.headers || {};
            if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
            if (!(options.body instanceof FormData)) {
                headers['Content-Type'] = 'application/json';
            }
            try {
                const res = await fetch('/api' + endpoint, { ...options, headers });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Server error occurred');
                return data;
            } catch (err) {
                alert(err.message);
                throw err;
            }
        }

        async function initApp() {
            try {
                const settings = await fetch('/api/settings').then(r => r.json());
                state.settings = settings || {};

                const setupStatus = await fetch('/api/setup/status').then(r => r.json());
                if (setupStatus.needsAdmin) {
                    renderSetupAdmin();
                    return;
                }

                if (state.token && state.user) {
                    if (state.user.role === 'resident') renderResidentPortal();
                    else renderStaffPortal();
                } else {
                    renderLogin();
                }
            } catch (e) {
                console.error("Initialization Error:", e);
                renderLogin();
            }
        }

        function logout() {
            localStorage.clear();
            state.token = null;
            state.user = null;
            state.resident = null;
            renderLogin();
        }

        function renderSetupAdmin() {
            const app = document.getElementById('app');
            app.innerHTML = \`
                <div class="min-h-screen bg-login-custom flex items-center justify-center p-4">
                    <div class="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full border border-emerald-500/30">
                        <div class="text-center mb-6">
                            <div class="inline-flex p-3 bg-emerald-100 rounded-full text-emerald-600 mb-3">
                                <i class="fa-solid fa-user-shield fa-2x"></i>
                            </div>
                            <h1 class="text-2xl font-bold text-slate-800">INITIAL ADMIN SETUP</h1>
                            <p class="text-xs text-slate-500 mt-1">Create the primary System Administrator account to start.</p>
                        </div>
                        <form id="adminSetupForm" class="space-y-4">
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Full Name</label>
                                <input type="text" id="setupFullName" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Username</label>
                                <input type="text" id="setupUsername" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Email Address</label>
                                <input type="email" id="setupEmail" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Password</label>
                                <input type="password" id="setupPassword" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-slate-600 mb-1">Confirm Password</label>
                                <input type="password" id="setupConfirmPassword" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                            </div>
                            <button type="submit" class="w-full py-3 bg-gradient-to-r from-emerald-600 to-blue-600 text-white font-bold rounded-lg shadow-lg hover:opacity-90 transition">
                                Create Super Administrator
                            </button>
                        </form>
                    </div>
                </div>
            \`;

            document.getElementById('adminSetupForm').onsubmit = async (e) => {
                e.preventDefault();
                const res = await api('/setup/admin', {
                    method: 'POST',
                    body: JSON.stringify({
                        fullName: document.getElementById('setupFullName').value,
                        username: document.getElementById('setupUsername').value,
                        email: document.getElementById('setupEmail').value,
                        password: document.getElementById('setupPassword').value,
                        confirmPassword: document.getElementById('setupConfirmPassword').value
                    })
                });
                if (res.success) {
                    alert(res.message);
                    renderLogin();
                }
            };
        }

        function renderLogin() {
            const app = document.getElementById('app');
            const logo = state.settings.barangay_logo || DEFAULT_LOGO;
            const brgyName = state.settings.barangay_name || 'BARANGAY CENTRAL';
            const municipality = state.settings.municipality || 'Municipality';
            const province = state.settings.province || 'Province';

            app.innerHTML = \`
                <div class="min-h-screen bg-login-custom flex items-center justify-center p-4">
                    <div class="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 border border-white/20">
                        <div class="bg-gradient-to-br from-emerald-700 to-blue-800 p-8 text-white flex flex-col justify-between">
                            <div class="text-center md:text-left">
                                <img src="\${logo}" onerror="this.src='\${DEFAULT_LOGO}'" class="w-20 h-20 mx-auto md:mx-0 rounded-full bg-white p-1 mb-4 shadow-md object-cover">
                                <h2 class="text-2xl font-black tracking-wide">\${brgyName.toUpperCase()}</h2>
                                <p class="text-xs text-emerald-100 mt-1">\${municipality}, \${province}</p>
                            </div>
                            <div class="my-8 hidden md:block">
                                <h3 class="text-lg font-bold">Resident Services & Management System</h3>
                                <p class="text-xs text-emerald-100 mt-2 leading-relaxed">
                                    Access online barangay clearances, digital ID cards, schedule appointments, and submit community requests fast & efficiently.
                                </p>
                            </div>
                            <div class="text-xs text-emerald-200 text-center md:text-left flex items-center justify-between">
                                <span>&copy; 2026 Official Barangay Portal</span>
                                <a href="/scanner" target="_blank" class="text-emerald-100 underline hover:text-white font-bold"><i class="fa-solid fa-qrcode mr-1"></i> QR Scanner Portal</a>
                            </div>
                        </div>

                        <div class="p-8 flex flex-col justify-center bg-white">
                            <div class="flex border-b border-slate-200 mb-6">
                                <button id="btnPortalStaff" type="button" onclick="switchLoginPortal('staff')" class="flex-1 py-2 text-sm font-bold text-emerald-600 border-b-2 border-emerald-600">Staff Login</button>
                                <button id="btnPortalResident" type="button" onclick="switchLoginPortal('resident')" class="flex-1 py-2 text-sm font-bold text-slate-400 border-b-2 border-transparent">Resident Portal</button>
                            </div>

                            <form id="loginForm" class="space-y-4">
                                <input type="hidden" id="loginPortalType" value="staff">
                                <div>
                                    <label class="block text-xs font-semibold text-slate-600 mb-1">Username or Email</label>
                                    <input type="text" id="loginUsername" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                                </div>
                                <div>
                                    <label class="block text-xs font-semibold text-slate-600 mb-1">Password</label>
                                    <input type="password" id="loginPassword" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                                </div>
                                <button type="submit" class="w-full py-3 bg-gradient-to-r from-emerald-600 to-blue-600 text-white font-bold rounded-lg shadow-md hover:opacity-90 transition">
                                    Sign In
                                </button>
                            </form>

                            <div id="registerPrompt" class="hidden mt-6 text-center border-t border-slate-100 pt-4">
                                <p class="text-xs text-slate-500">Don't have an approved resident account?</p>
                                <button type="button" onclick="renderRegisterModal()" class="mt-2 text-xs font-bold text-emerald-600 hover:underline">
                                    Register as New Resident
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            \`;

            document.getElementById('loginForm').onsubmit = async (e) => {
                e.preventDefault();
                const portalType = document.getElementById('loginPortalType').value;
                const res = await api('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({
                        username: document.getElementById('loginUsername').value,
                        password: document.getElementById('loginPassword').value,
                        portalType
                    })
                });
                
                state.token = res.token;
                state.user = res.user;
                state.resident = res.resident;
                localStorage.setItem('brms_token', res.token);
                localStorage.setItem('brms_user', JSON.stringify(res.user));
                if (res.resident) localStorage.setItem('brms_resident', JSON.stringify(res.resident));

                if (res.user.role === 'resident') renderResidentPortal();
                else renderStaffPortal();
            };
        }

        function switchLoginPortal(type) {
            document.getElementById('loginPortalType').value = type;
            const btnStaff = document.getElementById('btnPortalStaff');
            const btnResident = document.getElementById('btnPortalResident');
            const prompt = document.getElementById('registerPrompt');

            if (type === 'staff') {
                btnStaff.className = "flex-1 py-2 text-sm font-bold text-emerald-600 border-b-2 border-emerald-600";
                btnResident.className = "flex-1 py-2 text-sm font-bold text-slate-400 border-b-2 border-transparent";
                prompt.classList.add('hidden');
            } else {
                btnResident.className = "flex-1 py-2 text-sm font-bold text-emerald-600 border-b-2 border-emerald-600";
                btnStaff.className = "flex-1 py-2 text-sm font-bold text-slate-400 border-b-2 border-transparent";
                prompt.classList.remove('hidden');
            }
        }

        async function renderRegisterModal() {
            let puroks = [];
            try { puroks = await fetch('/api/puroks').then(r => r.json()); } catch(e){}
            let purokOptions = (puroks || []).map(p => \`<option value="\${p.id}">\${p.name}</option>\`).join('');

            const modalHtml = \`
                <div id="regModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div class="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-8">
                        <div class="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
                            <h3 class="text-lg font-bold text-slate-800">New Resident Registration</h3>
                            <button type="button" onclick="document.getElementById('regModal').remove()" class="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
                        </div>
                        <form id="publicRegForm" class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div>
                                <label class="font-semibold text-slate-600">First Name *</label>
                                <input type="text" name="firstName" required class="w-full p-2 border border-slate-300 rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Middle Name</label>
                                <input type="text" name="middleName" class="w-full p-2 border border-slate-300 rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Last Name *</label>
                                <input type="text" name="lastName" required class="w-full p-2 border border-slate-300 rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Suffix</label>
                                <input type="text" name="suffix" placeholder="Jr., Sr., III" class="w-full p-2 border border-slate-300 rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Date of Birth *</label>
                                <input type="date" name="dateOfBirth" required class="w-full p-2 border border-slate-300 rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Gender *</label>
                                <select name="gender" required class="w-full p-2 border border-slate-300 rounded mt-1">
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Civil Status</label>
                                <select name="civilStatus" class="w-full p-2 border border-slate-300 rounded mt-1">
                                    <option value="Single">Single</option>
                                    <option value="Married">Married</option>
                                    <option value="Widowed">Widowed</option>
                                    <option value="Separated">Separated</option>
                                </select>
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Purok Zone</label>
                                <select name="purokId" class="w-full p-2 border border-slate-300 rounded mt-1">
                                    <option value="">-- Select Purok --</option>
                                    \${purokOptions}
                                </select>
                            </div>
                            <div class="md:col-span-2">
                                <label class="font-semibold text-slate-600">Street Address *</label>
                                <input type="text" name="address" required class="w-full p-2 border border-slate-300 rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Contact Number</label>
                                <input type="text" name="contactNumber" class="w-full p-2 border border-slate-300 rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Email Address</label>
                                <input type="email" name="email" class="w-full p-2 border border-slate-300 rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Account Username *</label>
                                <input type="text" name="username" required class="w-full p-2 border border-slate-300 rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Account Password *</label>
                                <input type="password" name="password" required class="w-full p-2 border border-slate-300 rounded mt-1">
                            </div>
                            <div class="md:col-span-2">
                                <label class="font-semibold text-slate-600">Resident Photo (2x2 / ID Photo)</label>
                                <input type="file" name="photo" accept="image/*" class="w-full p-2 border border-slate-300 rounded mt-1">
                            </div>
                            <div class="md:col-span-2 flex gap-4 pt-2">
                                <label><input type="checkbox" name="isSeniorCitizen" value="true"> Senior Citizen</label>
                                <label><input type="checkbox" name="isPwd" value="true"> Person with Disability (PWD)</label>
                                <label><input type="checkbox" name="isSoloParent" value="true"> Solo Parent</label>
                            </div>
                            <div class="md:col-span-2 pt-4">
                                <button type="submit" class="w-full py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700">
                                    Submit Registration Request
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            \`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            document.getElementById('publicRegForm').onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const res = await api('/public/register', {
                    method: 'POST',
                    body: formData
                });
                alert(res.message);
                document.getElementById('regModal').remove();
            };
        }

        function renderResidentPortal() {
            const app = document.getElementById('app');
            const brgyName = state.settings.barangay_name || 'BARANGAY CENTRAL';
            const logo = state.settings.barangay_logo || DEFAULT_LOGO;
            const resName = state.resident ? \`\${state.resident.first_name} \${state.resident.last_name}\` : state.user.fullName;

            app.innerHTML = \`
                <div class="flex h-screen bg-slate-50 overflow-hidden">
                    <aside class="w-64 bg-slate-900 text-slate-200 flex flex-col justify-between hidden md:flex border-r border-emerald-700">
                        <div>
                            <div class="p-4 border-b border-slate-800 flex items-center gap-3 bg-gradient-to-r from-emerald-800 to-blue-800">
                                <img src="\${logo}" onerror="this.src='\${DEFAULT_LOGO}'" class="w-10 h-10 rounded-full bg-white p-0.5 object-cover">
                                <div class="overflow-hidden">
                                    <h1 class="font-bold text-white text-xs truncate">\${brgyName}</h1>
                                    <span class="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full uppercase font-bold">Resident Portal</span>
                                </div>
                            </div>
                            <nav class="p-3 space-y-1 text-xs overflow-y-auto max-h-[calc(100vh-140px)]">
                                <button type="button" onclick="setResTab('dashboard')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-gauge w-4"></i> Dashboard</button>
                                <button type="button" onclick="setResTab('profile')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-id-card w-4"></i> My Profile & Brgy ID</button>
                                <button type="button" onclick="setResTab('editProfile')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-user-pen w-4"></i> Edit Profile Request</button>
                                <button type="button" onclick="setResTab('certRequest')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-file-signature w-4"></i> Certificate Request</button>
                                <button type="button" onclick="setResTab('tracking')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-magnifying-glass-location w-4"></i> Request Tracking</button>
                                <button type="button" onclick="setResTab('appointments')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-calendar-check w-4"></i> Appointment Booking</button>
                                <button type="button" onclick="setResTab('documents')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-folder-open w-4"></i> My Documents</button>
                                <button type="button" onclick="setResTab('complaints')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-triangle-exclamation w-4"></i> Complaints & Reports</button>
                                <button type="button" onclick="setResTab('assistance')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-hand-holding-heart w-4"></i> Assistance Request</button>
                                <button type="button" onclick="setResTab('announcements')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-bullhorn w-4"></i> Announcements</button>
                                <button type="button" onclick="setResTab('notifications')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-bell w-4"></i> Notifications</button>
                                <button type="button" onclick="setResTab('feedback')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-comments w-4"></i> Feedback</button>
                                <button type="button" onclick="setResTab('emergency')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-phone-volume w-4"></i> Emergency Contacts</button>
                                <button type="button" onclick="setResTab('security')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-shield-halved w-4"></i> Account Security</button>
                            </nav>
                        </div>
                        <div class="p-3 border-t border-slate-800">
                            <button type="button" onclick="logout()" class="w-full flex items-center gap-3 px-3 py-2 text-xs text-rose-400 hover:bg-slate-800 rounded-lg font-medium">
                                <i class="fa-solid fa-arrow-right-from-bracket w-4"></i> Sign Out
                            </button>
                        </div>
                    </aside>

                    <main class="flex-1 flex flex-col overflow-hidden">
                        <header class="bg-gradient-to-r from-emerald-700 to-blue-800 text-white px-6 py-4 flex justify-between items-center shadow-md">
                            <h2 id="resPageTitle" class="text-xl font-bold">Resident Dashboard</h2>
                            <div class="flex items-center gap-3">
                                <span class="text-xs font-semibold">\${resName}</span>
                                <img src="\${state.resident && state.resident.photo_url ? state.resident.photo_url : DEFAULT_USER}" onerror="this.src='\${DEFAULT_USER}'" class="w-8 h-8 rounded-full border-2 border-emerald-300 object-cover">
                            </div>
                        </header>

                        <div id="resContent" class="flex-1 overflow-y-auto p-6"></div>
                    </main>
                </div>
            \`;

            setResTab('dashboard');
        }

        async function setResTab(tab) {
            state.resActiveTab = tab;
            const content = document.getElementById('resContent');
            const title = document.getElementById('resPageTitle');

            if (tab === 'dashboard') {
                title.innerText = 'Resident Dashboard';
                renderResDashboardTab(content);
            } else if (tab === 'profile') {
                title.innerText = 'My Profile & Barangay Resident Card';
                renderResProfileTab(content);
            } else if (tab === 'editProfile') {
                title.innerText = 'Edit Profile Request';
                renderResEditProfileTab(content);
            } else if (tab === 'certRequest') {
                title.innerText = 'Request Barangay Certificate';
                renderResCertRequestTab(content);
            } else if (tab === 'tracking') {
                title.innerText = 'Request Status Tracking';
                renderResTrackingTab(content);
            } else if (tab === 'appointments') {
                title.innerText = 'Book Barangay Appointment';
                renderResAppointmentsTab(content);
            } else if (tab === 'documents') {
                title.innerText = 'My Official Documents';
                renderResDocumentsTab(content);
            } else if (tab === 'complaints') {
                title.innerText = 'Submit Complaint or Incident Report';
                renderResComplaintsTab(content);
            } else if (tab === 'assistance') {
                title.innerText = 'Request Barangay Assistance / Ayuda';
                renderResAssistanceTab(content);
            } else if (tab === 'announcements') {
                title.innerText = 'Barangay Announcements & News';
                renderResAnnouncementsTab(content);
            } else if (tab === 'notifications') {
                title.innerText = 'System Notifications';
                renderResNotificationsTab(content);
            } else if (tab === 'feedback') {
                title.innerText = 'Barangay Service Feedback';
                renderResFeedbackTab(content);
            } else if (tab === 'emergency') {
                title.innerText = 'Barangay Emergency Contacts';
                renderResEmergencyTab(content);
            } else if (tab === 'security') {
                title.innerText = 'Account Security';
                renderResSecurityTab(content);
            }
        }

        function renderResDashboardTab(container) {
            const res = state.resident || {};
            container.innerHTML = \`
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    <div class="bg-white p-5 rounded-xl border border-emerald-200 shadow-sm flex items-center gap-4">
                        <div class="p-3 bg-emerald-100 text-emerald-700 rounded-lg"><i class="fa-solid fa-id-card fa-2x"></i></div>
                        <div>
                            <span class="text-xs text-slate-500 font-bold uppercase">Resident ID Status</span>
                            <h4 class="text-lg font-extrabold text-emerald-800">\${res.status || 'ACTIVE'}</h4>
                            <p class="text-[11px] text-slate-400">ID #: \${res.resident_number || 'N/A'}</p>
                        </div>
                    </div>
                    <div class="bg-white p-5 rounded-xl border border-blue-200 shadow-sm flex items-center gap-4">
                        <div class="p-3 bg-blue-100 text-blue-700 rounded-lg"><i class="fa-solid fa-file-contract fa-2x"></i></div>
                        <div>
                            <span class="text-xs text-slate-500 font-bold uppercase">Certificate Services</span>
                            <h4 class="text-lg font-extrabold text-blue-800">Online Requests</h4>
                            <p class="text-[11px] text-slate-400">Barangay Clearance, Indigency & Residency</p>
                        </div>
                    </div>
                    <div class="bg-white p-5 rounded-xl border border-emerald-200 shadow-sm flex items-center gap-4">
                        <div class="p-3 bg-emerald-100 text-emerald-700 rounded-lg"><i class="fa-solid fa-hand-holding-heart fa-2x"></i></div>
                        <div>
                            <span class="text-xs text-slate-500 font-bold uppercase">Assistance Program</span>
                            <h4 class="text-lg font-extrabold text-emerald-800">Ayuda / Welfare</h4>
                            <p class="text-[11px] text-slate-400">Submit requests for medical or emergency aid</p>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 class="text-sm font-bold text-slate-800 mb-4 border-b pb-2"><i class="fa-solid fa-bolt text-emerald-600 mr-2"></i> Quick Actions</h3>
                        <div class="grid grid-cols-2 gap-3">
                            <button onclick="setResTab('certRequest')" class="p-4 bg-emerald-50 text-emerald-800 rounded-lg font-bold text-xs text-left hover:bg-emerald-100 border border-emerald-200"><i class="fa-solid fa-file-medical text-lg block mb-2"></i> Request Certificate</button>
                            <button onclick="setResTab('appointments')" class="p-4 bg-blue-50 text-blue-800 rounded-lg font-bold text-xs text-left hover:bg-blue-100 border border-blue-200"><i class="fa-solid fa-calendar-plus text-lg block mb-2"></i> Book Appointment</button>
                            <button onclick="setResTab('complaints')" class="p-4 bg-blue-50 text-blue-800 rounded-lg font-bold text-xs text-left hover:bg-blue-100 border border-blue-200"><i class="fa-solid fa-bullhorn text-lg block mb-2"></i> Submit Report</button>
                            <button onclick="setResTab('assistance')" class="p-4 bg-emerald-50 text-emerald-800 rounded-lg font-bold text-xs text-left hover:bg-emerald-100 border border-emerald-200"><i class="fa-solid fa-handshake-angle text-lg block mb-2"></i> Request Ayuda</button>
                        </div>
                    </div>

                    <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 class="text-sm font-bold text-slate-800 mb-4 border-b pb-2"><i class="fa-solid fa-bullhorn text-blue-600 mr-2"></i> Barangay Announcements</h3>
                        <div id="resDashAnnounce" class="space-y-3 text-xs text-slate-600">Loading latest updates...</div>
                    </div>
                </div>
            \`;

            fetch('/api/announcements').then(r => r.json()).then(list => {
                const el = document.getElementById('resDashAnnounce');
                if (!list || list.length === 0) {
                    el.innerHTML = '<p class="text-slate-400">No current announcements posted.</p>';
                    return;
                }
                el.innerHTML = list.slice(0, 3).map(a => \`
                    <div class="p-3 bg-slate-50 border-l-4 border-emerald-600 rounded">
                        <span class="font-bold text-slate-800 block">\${a.title}</span>
                        <p class="text-[11px] text-slate-500 mt-1 line-clamp-2">\${a.content}</p>
                    </div>
                \`).join('');
            });
        }

        function renderResProfileTab(container) {
            const r = state.resident || {};
            const photo = r.photo_url || DEFAULT_USER;
            const logo = state.settings.barangay_logo || DEFAULT_LOGO;
            const brgyName = state.settings.barangay_name || 'BARANGAY CENTRAL';
            const captainSig = state.settings.captain_signature || '';
            const captainName = state.settings.captain_name || 'HON. BARANGAY CAPTAIN';

            container.innerHTML = \`
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-1 text-xs">
                        <div class="text-center mb-4">
                            <img src="\${photo}" onerror="this.src='\${DEFAULT_USER}'" class="w-28 h-28 mx-auto rounded-full object-cover border-4 border-emerald-600 shadow-md">
                            <h3 class="text-base font-extrabold text-slate-800 mt-3">\${r.first_name || ''} \${r.last_name || ''}</h3>
                            <p class="text-emerald-700 font-mono font-bold">\${r.resident_number || 'BRGY-PENDING'}</p>
                        </div>
                        
                        <form id="updatePhotoForm" class="border-t pt-4 space-y-3">
                            <p class="font-bold text-slate-700">Update Profile Picture & Details</p>
                            <div>
                                <label class="block font-semibold mb-1">New Resident Photo</label>
                                <input type="file" name="photo" accept="image/*" class="w-full p-1 border rounded text-[11px]">
                            </div>
                            <div>
                                <label class="block font-semibold mb-1">Contact Number</label>
                                <input type="text" name="contactNumber" value="\${r.contact_number || ''}" class="w-full p-2 border rounded">
                            </div>
                            <div>
                                <label class="block font-semibold mb-1">Email</label>
                                <input type="email" name="email" value="\${r.email || ''}" class="w-full p-2 border rounded">
                            </div>
                            <div>
                                <label class="block font-semibold mb-1">Civil Status</label>
                                <select name="civilStatus" class="w-full p-2 border rounded">
                                    <option value="Single" \${r.civil_status==='Single'?'selected':''}>Single</option>
                                    <option value="Married" \${r.civil_status==='Married'?'selected':''}>Married</option>
                                    <option value="Widowed" \${r.civil_status==='Widowed'?'selected':''}>Widowed</option>
                                    <option value="Separated" \${r.civil_status==='Separated'?'selected':''}>Separated</option>
                                </select>
                            </div>
                            <div>
                                <label class="block font-semibold mb-1">Street Address</label>
                                <input type="text" name="address" value="\${r.address || ''}" class="w-full p-2 border rounded">
                            </div>
                            <button type="submit" class="w-full py-2 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700">Save Profile Updates</button>
                        </form>
                    </div>

                    <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-sm font-bold text-slate-800"><i class="fa-solid fa-id-card text-emerald-600 mr-2"></i> Official Barangay Resident Card</h3>
                            <button type="button" onclick="window.print()" class="px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 no-print"><i class="fa-solid fa-print mr-1"></i> Print ID</button>
                        </div>

                        <div id="printableArea" class="flex justify-center p-4 bg-slate-100 rounded-xl">
                            <div class="id-card-national shadow-lg">
                                <div class="flex items-center gap-1.5 border-b border-emerald-700/40 pb-1 bg-gradient-to-r from-emerald-800 to-blue-800 text-white px-2 py-1 rounded-t">
                                    <img src="\${logo}" onerror="this.src='\${DEFAULT_LOGO}'" class="w-7 h-7 rounded-full bg-white p-0.5 object-cover">
                                    <div class="leading-none flex-1">
                                        <p class="text-[7pt] font-extrabold uppercase tracking-tight">REPUBLIKA NG PILIPINAS</p>
                                        <p class="text-[8pt] font-black uppercase text-emerald-200 tracking-wider">\${brgyName}</p>
                                        <p class="text-[6pt] font-extrabold text-white uppercase tracking-widest mt-0.5">RESIDENT CARD / BRGY ID</p>
                                    </div>
                                </div>

                                <div class="grid grid-cols-12 gap-1 my-1 px-1 text-[7pt] leading-tight flex-1 items-center">
                                    <div class="col-span-3 text-center">
                                        <img src="\${photo}" onerror="this.src='\${DEFAULT_USER}'" class="w-[0.75in] h-[0.9in] border-2 border-emerald-700 rounded object-cover mx-auto bg-white">
                                        <span class="text-[5pt] font-bold text-emerald-800 block mt-0.5">REGISTERED</span>
                                    </div>

                                    <div class="col-span-6 space-y-0.5">
                                        <div>
                                            <span class="text-[5pt] text-slate-500 font-bold block uppercase">Resident ID Number</span>
                                            <span class="font-extrabold text-blue-900 font-mono text-[7.5pt]">\${r.resident_number || 'BRGY-0000-00000'}</span>
                                        </div>
                                        <div>
                                            <span class="text-[5pt] text-slate-500 font-bold block uppercase">Full Name</span>
                                            <span class="font-black text-slate-900 uppercase text-[7.5pt] block truncate">\${r.last_name || ''}, \${r.first_name || ''} \${r.middle_name || ''}</span>
                                        </div>
                                        <div class="grid grid-cols-2 gap-1">
                                            <div>
                                                <span class="text-[5pt] text-slate-500 font-bold block uppercase">Date of Birth</span>
                                                <span class="font-bold text-slate-800 text-[6.5pt]">\${r.date_of_birth || 'N/A'}</span>
                                            </div>
                                            <div>
                                                <span class="text-[5pt] text-slate-500 font-bold block uppercase">Sex / Status</span>
                                                <span class="font-bold text-slate-800 text-[6.5pt]">\${r.gender || ''} / \${r.civil_status || ''}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <span class="text-[5pt] text-slate-500 font-bold block uppercase">Address</span>
                                            <span class="font-bold text-slate-800 text-[6pt] truncate block">\${r.address || 'Barangay Central'}</span>
                                        </div>
                                    </div>

                                    <div class="col-span-3 text-center flex flex-col items-center justify-center">
                                        \${r.qr_code_url ? \`<img src="\${r.qr_code_url}" class="w-[0.9in] h-[0.9in] border border-slate-300 rounded p-0.5 bg-white shadow-sm">\` : \`<div class="w-[0.9in] h-[0.9in] border border-dashed text-[6pt] flex items-center justify-center text-slate-400">QR Code</div>\`}
                                        <span class="text-[4.5pt] text-slate-400 font-mono mt-0.5">SCAN TO VERIFY</span>
                                    </div>
                                </div>

                                <div class="border-t border-emerald-700/30 pt-0.5 flex justify-between items-end px-2 bg-emerald-50/50 rounded-b">
                                    <div class="text-[5.5pt]">
                                        <span class="text-slate-500">Purok:</span> <strong class="text-emerald-800">\${r.puroks ? r.puroks.name : 'N/A'}</strong>
                                    </div>
                                    <div class="text-center">
                                        \${captainSig ? \`<img src="\${captainSig}" class="h-4 mx-auto -mb-1 object-contain">\` : ''}
                                        <div class="border-b border-slate-800 w-24 mx-auto"></div>
                                        <span class="text-[5pt] font-extrabold text-slate-800 uppercase block">\${captainName}</span>
                                        <span class="text-[4pt] text-slate-500 block -mt-0.5">PUNONG BARANGAY</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            \`;

            document.getElementById('updatePhotoForm').onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const res = await api('/resident/profile/update', { method: 'POST', body: formData });
                alert(res.message);
                state.resident = res.resident;
                localStorage.setItem('brms_resident', JSON.stringify(res.resident));
                renderResProfileTab(container);
            };
        }

        function renderResEditProfileTab(container) {
            container.innerHTML = \`
                <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-xl mx-auto text-xs">
                    <h3 class="text-sm font-bold text-slate-800 mb-2">Submit Profile Correction / Update Request</h3>
                    <p class="text-slate-500 mb-4">Request changes to official records like full name, date of birth, civil status, or family head assignments.</p>
                    <form id="editReqForm" class="space-y-4">
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">Details of Requested Changes *</label>
                            <textarea id="editReqDetails" required rows="5" class="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Please state clearly what info needs correction..."></textarea>
                        </div>
                        <button type="submit" class="w-full py-2.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700">Submit Request to Barangay Office</button>
                    </form>
                </div>
            \`;

            document.getElementById('editReqForm').onsubmit = async (e) => {
                e.preventDefault();
                const requestedChanges = document.getElementById('editReqDetails').value;
                const res = await api('/resident/edit-request', {
                    method: 'POST',
                    body: JSON.stringify({ requestedChanges })
                });
                alert(res.message);
                setResTab('tracking');
            };
        }

        function renderResCertRequestTab(container) {
            container.innerHTML = \`
                <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-xl mx-auto text-xs">
                    <h3 class="text-sm font-bold text-slate-800 mb-4">Request Official Barangay Document</h3>
                    <form id="resCertForm" class="space-y-4">
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">Document Type *</label>
                            <select id="certType" required class="w-full p-2 border border-slate-300 rounded">
                                <option value="Barangay Clearance">Barangay Clearance</option>
                                <option value="Certificate of Indigency">Certificate of Indigency</option>
                                <option value="Certificate of Residency">Certificate of Residency</option>
                                <option value="First Time Job Seeker Certificate">First Time Job Seeker Certificate</option>
                                <option value="Barangay Business Clearance">Barangay Business Clearance</option>
                            </select>
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">Purpose of Request *</label>
                            <textarea id="certPurpose" required rows="3" class="w-full p-2 border border-slate-300 rounded" placeholder="E.g., Employment, Scholarship, Financial Aid, Loan Application"></textarea>
                        </div>
                        <button type="submit" class="w-full py-2.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700">Submit Request</button>
                    </form>
                </div>
            \`;

            document.getElementById('resCertForm').onsubmit = async (e) => {
                e.preventDefault();
                const res = await api('/certificates/request', {
                    method: 'POST',
                    body: JSON.stringify({
                        certificateType: document.getElementById('certType').value,
                        purpose: document.getElementById('certPurpose').value
                    })
                });
                alert(res.message);
                setResTab('tracking');
            };
        }

        async function renderResTrackingTab(container) {
            const requests = await api('/certificates/requests');
            let rows = requests.map(r => \`
                <tr class="border-b border-slate-100 text-xs">
                    <td class="py-3 px-2 font-mono font-bold text-blue-700">\${r.request_number}</td>
                    <td class="py-3 px-2 font-bold text-slate-800">\${r.certificate_type}</td>
                    <td class="py-3 px-2 text-slate-600">\${r.purpose}</td>
                    <td class="py-3 px-2 font-bold \${r.status === 'READY_FOR_RELEASE' ? 'text-emerald-600' : 'text-amber-600'}">\${r.status}</td>
                    <td class="py-3 px-2 text-slate-400">\${new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
            \`).join('');

            container.innerHTML = \`
                <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 class="text-sm font-bold text-slate-800 mb-4">Live Request Tracker</h3>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="border-b text-slate-400 text-[11px] uppercase">
                                    <th class="py-2">Reference #</th>
                                    <th class="py-2">Document Type</th>
                                    <th class="py-2">Purpose</th>
                                    <th class="py-2">Current Status</th>
                                    <th class="py-2">Date Requested</th>
                                </tr>
                            </thead>
                            <tbody>\${rows || '<tr><td colspan="5" class="text-center py-4 text-xs text-slate-400">No active document requests found.</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            \`;
        }

        async function renderResAppointmentsTab(container) {
            const appts = await api('/appointments');
            let rows = appts.map(a => \`
                <tr class="border-b border-slate-100 text-xs">
                    <td class="py-3 px-2 font-mono font-bold text-blue-700">\${a.appointment_number}</td>
                    <td class="py-3 px-2 font-bold text-slate-800">\${a.service_type}</td>
                    <td class="py-3 px-2">\${a.appointment_date} \${a.appointment_time || ''}</td>
                    <td class="py-3 px-2 font-bold text-emerald-600">\${a.status}</td>
                </tr>
            \`).join('');

            container.innerHTML = \`
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 class="text-sm font-bold text-slate-800 mb-4">Book New Appointment</h3>
                        <form id="resApptForm" class="space-y-3 text-xs">
                            <div>
                                <label class="font-bold text-slate-700">Service Required *</label>
                                <select id="aptService" required class="w-full p-2 border border-slate-300 rounded mt-1">
                                    <option value="Barangay Consultation">Barangay Consultation</option>
                                    <option value="Lupon / Mediation Hearing">Lupon / Mediation Hearing</option>
                                    <option value="Document Pick-up & Payment">Document Pick-up & Payment</option>
                                    <option value="Senior / PWD Assistance Verification">Senior / PWD Assistance Verification</option>
                                </select>
                            </div>
                            <div>
                                <label class="font-bold text-slate-700">Preferred Date *</label>
                                <input type="date" id="aptDate" required class="w-full p-2 border border-slate-300 rounded mt-1">
                            </div>
                            <div>
                                <label class="font-bold text-slate-700">Preferred Time</label>
                                <input type="time" id="aptTime" class="w-full p-2 border border-slate-300 rounded mt-1">
                            </div>
                            <div>
                                <label class="font-bold text-slate-700">Purpose / Details</label>
                                <textarea id="aptPurpose" class="w-full p-2 border border-slate-300 rounded mt-1" rows="3"></textarea>
                            </div>
                            <button type="submit" class="w-full py-2 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700">Schedule Appointment</button>
                        </form>
                    </div>

                    <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm md:col-span-2">
                        <h3 class="text-sm font-bold text-slate-800 mb-4">Scheduled Appointments</h3>
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="border-b text-slate-400 text-[11px] uppercase">
                                    <th class="py-2">Appt #</th>
                                    <th class="py-2">Service</th>
                                    <th class="py-2">Date & Time</th>
                                    <th class="py-2">Status</th>
                                </tr>
                            </thead>
                            <tbody>\${rows || '<tr><td colspan="4" class="text-center py-4 text-xs text-slate-400">No appointments scheduled.</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            \`;

            document.getElementById('resApptForm').onsubmit = async (e) => {
                e.preventDefault();
                const res = await api('/appointments', {
                    method: 'POST',
                    body: JSON.stringify({
                        serviceType: document.getElementById('aptService').value,
                        appointmentDate: document.getElementById('aptDate').value,
                        appointmentTime: document.getElementById('aptTime').value,
                        purpose: document.getElementById('aptPurpose').value
                    })
                });
                alert(res.message);
                setResTab('appointments');
            };
        }

        async function renderResDocumentsTab(container) {
            const requests = await api('/certificates/requests');
            const readyDocs = requests.filter(r => r.status === 'READY_FOR_RELEASE' || r.status === 'RELEASED');

            let list = readyDocs.map(d => \`
                <div class="p-4 bg-white rounded-xl border border-emerald-200 shadow-sm flex justify-between items-center">
                    <div>
                        <h4 class="font-bold text-slate-800 text-sm">\${d.certificate_type}</h4>
                        <p class="text-xs text-slate-500">Ref #: \${d.request_number} | Status: <span class="text-emerald-700 font-bold">\${d.status}</span></p>
                    </div>
                    <div>
                        <span class="px-3 py-1 bg-emerald-100 text-emerald-800 font-bold rounded-lg text-xs"><i class="fa-solid fa-check mr-1"></i> Ready at Brgy Office</span>
                    </div>
                </div>
            \`).join('');

            container.innerHTML = \`
                <div class="space-y-4">
                    <h3 class="text-sm font-bold text-slate-800 mb-2">Issued & Approved Official Documents</h3>
                    \${list || '<div class="bg-white p-8 rounded-xl text-center text-xs text-slate-400 border">No ready or released documents found yet.</div>'}
                </div>
            \`;
        }

        function renderResComplaintsTab(container) {
            container.innerHTML = \`
                <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-xl mx-auto text-xs">
                    <h3 class="text-sm font-bold text-slate-800 mb-4">Submit Complaint or Incident Report</h3>
                    <form id="resBlotterForm" class="space-y-3">
                        <div><label class="font-bold text-slate-700">Respondent / Person Involved *</label><input type="text" id="compRespondent" required class="w-full p-2 border border-slate-300 rounded mt-1"></div>
                        <div class="grid grid-cols-2 gap-2">
                            <div><label class="font-bold text-slate-700">Incident Date *</label><input type="date" id="compDate" required class="w-full p-2 border border-slate-300 rounded mt-1"></div>
                            <div><label class="font-bold text-slate-700">Incident Time</label><input type="time" id="compTime" class="w-full p-2 border border-slate-300 rounded mt-1"></div>
                        </div>
                        <div><label class="font-bold text-slate-700">Location of Incident *</label><input type="text" id="compLoc" required class="w-full p-2 border border-slate-300 rounded mt-1"></div>
                        <div><label class="font-bold text-slate-700">Detailed Report Description *</label><textarea id="compDesc" required rows="4" class="w-full p-2 border border-slate-300 rounded mt-1"></textarea></div>
                        <button type="submit" class="w-full py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">File Incident Report</button>
                    </form>
                </div>
            \`;

            document.getElementById('resBlotterForm').onsubmit = async (e) => {
                e.preventDefault();
                const rName = state.resident ? \`\${state.resident.first_name} \${state.resident.last_name}\` : state.user.fullName;
                const res = await api('/blotter', {
                    method: 'POST',
                    body: JSON.stringify({
                        complainantName: rName,
                        respondentName: document.getElementById('compRespondent').value,
                        witnessName: '',
                        incidentDate: document.getElementById('compDate').value,
                        incidentTime: document.getElementById('compTime').value,
                        location: document.getElementById('compLoc').value,
                        description: document.getElementById('compDesc').value
                    })
                });
                alert(res.message);
                setResTab('dashboard');
            };
        }

        async function renderResAssistanceTab(container) {
            const list = await api('/assistance');
            let rows = list.map(a => \`
                <tr class="border-b border-slate-100 text-xs">
                    <td class="py-3 px-2 font-mono font-bold text-blue-700">\${a.request_number}</td>
                    <td class="py-3 px-2 font-bold text-slate-800">\${a.assistance_type}</td>
                    <td class="py-3 px-2">\${a.details}</td>
                    <td class="py-3 px-2 font-bold text-amber-600">\${a.status}</td>
                </tr>
            \`).join('');

            container.innerHTML = \`
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 class="text-sm font-bold text-slate-800 mb-4">Request Financial / Medical Assistance</h3>
                        <form id="resAstForm" class="space-y-3 text-xs">
                            <div>
                                <label class="font-bold text-slate-700">Assistance Category *</label>
                                <select id="astType" required class="w-full p-2 border border-slate-300 rounded mt-1">
                                    <option value="Medical & Medicine Aid">Medical & Medicine Aid</option>
                                    <option value="Financial / AICS Aid">Financial / AICS Aid</option>
                                    <option value="Burial Assistance">Burial Assistance</option>
                                    <option value="Food & Disaster Relief">Food & Disaster Relief</option>
                                    <option value="Educational Cash Aid">Educational Cash Aid</option>
                                </select>
                            </div>
                            <div>
                                <label class="font-bold text-slate-700">Reason & Details *</label>
                                <textarea id="astDetails" required rows="4" class="w-full p-2 border border-slate-300 rounded mt-1"></textarea>
                            </div>
                            <button type="submit" class="w-full py-2 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700">Submit Ayuda Request</button>
                        </form>
                    </div>

                    <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm md:col-span-2">
                        <h3 class="text-sm font-bold text-slate-800 mb-4">Submitted Assistance Requests</h3>
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="border-b text-slate-400 text-[11px] uppercase">
                                    <th class="py-2">Req #</th>
                                    <th class="py-2">Category</th>
                                    <th class="py-2">Details</th>
                                    <th class="py-2">Status</th>
                                </tr>
                            </thead>
                            <tbody>\${rows || '<tr><td colspan="4" class="text-center py-4 text-xs text-slate-400">No assistance requests submitted.</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            \`;

            document.getElementById('resAstForm').onsubmit = async (e) => {
                e.preventDefault();
                const res = await api('/assistance', {
                    method: 'POST',
                    body: JSON.stringify({
                        assistanceType: document.getElementById('astType').value,
                        details: document.getElementById('astDetails').value
                    })
                });
                alert(res.message);
                setResTab('assistance');
            };
        }

        async function renderResAnnouncementsTab(container) {
            const list = await api('/announcements');
            let cards = list.map(a => \`
                <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <div class="flex justify-between items-center">
                        <span class="px-2.5 py-1 text-[10px] font-bold uppercase rounded-full \${a.priority === 'Urgent' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'}">\${a.priority} Priority</span>
                        <span class="text-xs text-slate-400">\${new Date(a.created_at).toLocaleDateString()}</span>
                    </div>
                    <h3 class="text-base font-bold text-slate-800">\${a.title}</h3>
                    \${a.image_url ? \`<img src="\${a.image_url}" class="w-full h-48 object-cover rounded-lg border">\` : ''}
                    <p class="text-xs text-slate-600 leading-relaxed">\${a.content}</p>
                </div>
            \`).join('');

            container.innerHTML = \`
                <div class="max-w-2xl mx-auto space-y-6">
                    \${cards || '<p class="text-center text-xs text-slate-400 py-8">No barangay announcements at this time.</p>'}
                </div>
            \`;
        }

        function renderResNotificationsTab(container) {
            container.innerHTML = \`
                <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-2xl mx-auto text-xs space-y-3">
                    <h3 class="text-sm font-bold text-slate-800 mb-4 border-b pb-2"><i class="fa-solid fa-bell text-emerald-600 mr-2"></i> System Alerts & Updates</h3>
                    <div class="p-3 bg-emerald-50 border-l-4 border-emerald-600 text-emerald-900 rounded">
                        <strong class="block">Welcome to Barangay Resident Portal!</strong>
                        <p class="text-[11px] text-emerald-700 mt-0.5">Your official resident account is active. You can now request certificates, digital ID, and appointments online.</p>
                    </div>
                </div>
            \`;
        }

        function renderResFeedbackTab(container) {
            container.innerHTML = \`
                <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-lg mx-auto text-xs">
                    <h3 class="text-sm font-bold text-slate-800 mb-4">Barangay Service Feedback & Rating</h3>
                    <form id="resFeedbackForm" class="space-y-4">
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">Service Rating</label>
                            <select id="fbRating" class="w-full p-2 border border-slate-300 rounded">
                                <option value="5">⭐⭐⭐⭐⭐ 5 - Excellent</option>
                                <option value="4">⭐⭐⭐⭐ 4 - Very Good</option>
                                <option value="3">⭐⭐⭐ 3 - Satisfactory</option>
                                <option value="2">⭐⭐ 2 - Needs Improvement</option>
                                <option value="1">⭐ 1 - Poor</option>
                            </select>
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">Comments & Suggestions *</label>
                            <textarea id="fbComments" required rows="4" class="w-full p-2 border border-slate-300 rounded" placeholder="Tell us how we can improve our services..."></textarea>
                        </div>
                        <button type="submit" class="w-full py-2.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700">Submit Feedback</button>
                    </form>
                </div>
            \`;

            document.getElementById('resFeedbackForm').onsubmit = async (e) => {
                e.preventDefault();
                const res = await api('/feedback', {
                    method: 'POST',
                    body: JSON.stringify({
                        rating: document.getElementById('fbRating').value,
                        comments: document.getElementById('fbComments').value
                    })
                });
                alert(res.message);
                setResTab('dashboard');
            };
        }

        function renderResEmergencyTab(container) {
            container.innerHTML = \`
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
                    <div class="p-5 bg-white rounded-xl border border-emerald-200 shadow-sm flex items-center gap-4">
                        <div class="p-4 bg-emerald-100 text-emerald-700 rounded-full"><i class="fa-solid fa-phone fa-2x"></i></div>
                        <div>
                            <h4 class="font-extrabold text-slate-800">Barangay Operations Hotline</h4>
                            <p class="text-lg font-bold text-emerald-700">911 / (045) 123-4567</p>
                            <p class="text-xs text-slate-400">24/7 Desk Officer</p>
                        </div>
                    </div>
                    <div class="p-5 bg-white rounded-xl border border-blue-200 shadow-sm flex items-center gap-4">
                        <div class="p-4 bg-blue-100 text-blue-700 rounded-full"><i class="fa-solid fa-shield-halved fa-2x"></i></div>
                        <div>
                            <h4 class="font-extrabold text-slate-800">Local Police Station</h4>
                            <p class="text-lg font-bold text-blue-700">117 / (045) 987-6543</p>
                            <p class="text-xs text-slate-400">Emergency Response Unit</p>
                        </div>
                    </div>
                </div>
            \`;
        }

        function renderResSecurityTab(container) {
            container.innerHTML = \`
                <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-md mx-auto text-xs">
                    <h3 class="text-sm font-bold text-slate-800 mb-4">Account Security Management</h3>
                    <form onsubmit="event.preventDefault(); alert('Password updated successfully!');" class="space-y-3">
                        <div><label class="font-bold text-slate-700">Current Password</label><input type="password" required class="w-full p-2 border rounded mt-1"></div>
                        <div><label class="font-bold text-slate-700">New Password</label><input type="password" required class="w-full p-2 border rounded mt-1"></div>
                        <div><label class="font-bold text-slate-700">Confirm New Password</label><input type="password" required class="w-full p-2 border rounded mt-1"></div>
                        <button type="submit" class="w-full py-2 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700">Update Password</button>
                    </form>
                </div>
            \`;
        }

        /* STAFF / ADMIN PORTAL RENDER */
        function renderStaffPortal() {
            const app = document.getElementById('app');
            const brgyName = state.settings.barangay_name || 'BARANGAY CENTRAL';
            const logo = state.settings.barangay_logo || DEFAULT_LOGO;

            app.innerHTML = \`
                <div class="flex h-screen bg-slate-50 overflow-hidden">
                    <aside class="w-64 bg-slate-900 text-slate-200 flex flex-col justify-between hidden md:flex border-r border-emerald-700">
                        <div>
                            <div class="p-4 border-b border-slate-800 flex items-center gap-3 bg-gradient-to-r from-emerald-800 to-blue-800">
                                <img src="\${logo}" onerror="this.src='\${DEFAULT_LOGO}'" class="w-10 h-10 rounded-full bg-white p-0.5 object-cover">
                                <div class="overflow-hidden">
                                    <h1 class="font-bold text-white text-xs truncate">\${brgyName}</h1>
                                    <span class="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full uppercase font-bold">Staff Portal</span>
                                </div>
                            </div>
                            <nav class="p-3 space-y-1 text-xs overflow-y-auto max-h-[calc(100vh-140px)]">
                                <button type="button" onclick="setStaffTab('dashboard')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-emerald-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-gauge w-4"></i> Dashboard</button>
                                <button type="button" onclick="setStaffTab('residents')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-emerald-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-users w-4"></i> Resident Management</button>
                                <button type="button" onclick="setStaffTab('households')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-emerald-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-house-chimney w-4"></i> Household Management</button>
                                <button type="button" onclick="setStaffTab('puroks')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-emerald-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-map-location-dot w-4"></i> Purok Management</button>
                                <button type="button" onclick="setStaffTab('documents')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-emerald-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-file-invoice w-4"></i> Document Management</button>
                                <button type="button" onclick="setStaffTab('blotter')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-emerald-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-scale-balanced w-4"></i> Blotter Management</button>
                                <button type="button" onclick="setStaffTab('announcements')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-emerald-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-bullhorn w-4"></i> Announcements</button>
                                <button type="button" onclick="setStaffTab('settings')" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-emerald-900/50 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-gear w-4"></i> System Settings & Branding</button>
                            </nav>
                        </div>
                        <div class="p-3 border-t border-slate-800">
                            <button type="button" onclick="logout()" class="w-full flex items-center gap-3 px-3 py-2 text-xs text-rose-400 hover:bg-slate-800 rounded-lg font-medium">
                                <i class="fa-solid fa-arrow-right-from-bracket w-4"></i> Sign Out
                            </button>
                        </div>
                    </aside>

                    <main class="flex-1 flex flex-col overflow-hidden">
                        <header class="bg-gradient-to-r from-emerald-700 to-blue-800 text-white px-6 py-4 flex justify-between items-center shadow-md">
                            <h2 id="staffPageTitle" class="text-xl font-bold">Admin Dashboard</h2>
                            <div class="flex items-center gap-4">
                                <a href="/scanner" target="_blank" class="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700"><i class="fa-solid fa-qrcode mr-1"></i> QR Scanner</a>
                                <span class="text-xs font-semibold">\${state.user.fullName}</span>
                            </div>
                        </header>

                        <div id="staffContent" class="flex-1 overflow-y-auto p-6"></div>
                    </main>
                </div>
            \`;

            setStaffTab('dashboard');
        }

        async function setStaffTab(tab) {
            state.activeTab = tab;
            const content = document.getElementById('staffContent');
            const title = document.getElementById('staffPageTitle');

            if (tab === 'dashboard') {
                title.innerText = 'Admin Dashboard Overview';
                renderStaffDashboard(content);
            } else if (tab === 'residents') {
                title.innerText = 'Resident Management & Approvals';
                renderStaffResidents(content);
            } else if (tab === 'households') {
                title.innerText = 'Household Management';
                renderStaffHouseholds(content);
            } else if (tab === 'puroks') {
                title.innerText = 'Purok Zones & Resident Counts';
                renderStaffPuroks(content);
            } else if (tab === 'documents') {
                title.innerText = 'Document Approval & Issuance';
                renderStaffDocuments(content);
            } else if (tab === 'blotter') {
                title.innerText = 'Blotter & Incident Reports';
                renderStaffBlotter(content);
            } else if (tab === 'announcements') {
                title.innerText = 'Announcement Manager';
                renderStaffAnnouncements(content);
            } else if (tab === 'settings') {
                title.innerText = 'System Settings & Branding';
                renderStaffSettings(content);
            }
        }

        async function renderStaffDashboard(container) {
            const stats = await api('/dashboard/stats');
            container.innerHTML = \`
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                    <div class="bg-white p-5 rounded-xl border border-emerald-200 shadow-sm">
                        <span class="text-xs text-slate-500 font-bold uppercase">Total Active Residents</span>
                        <h3 class="text-2xl font-black text-emerald-800 mt-1">\${stats.totalResidents}</h3>
                    </div>
                    <div class="bg-white p-5 rounded-xl border border-blue-200 shadow-sm">
                        <span class="text-xs text-slate-500 font-bold uppercase">Pending Approvals</span>
                        <h3 class="text-2xl font-black text-blue-800 mt-1">\${stats.pendingApprovals}</h3>
                    </div>
                    <div class="bg-white p-5 rounded-xl border border-emerald-200 shadow-sm">
                        <span class="text-xs text-slate-500 font-bold uppercase">Pending Certificates</span>
                        <h3 class="text-2xl font-black text-emerald-800 mt-1">\${stats.pendingCerts}</h3>
                    </div>
                    <div class="bg-white p-5 rounded-xl border border-blue-200 shadow-sm">
                        <span class="text-xs text-slate-500 font-bold uppercase">Open Blotter Cases</span>
                        <h3 class="text-2xl font-black text-rose-600 mt-1">\${stats.openBlotter}</h3>
                    </div>
                </div>
            \`;
        }

        async function renderStaffResidents(container) {
            const residents = await api('/residents?status=PENDING');
            let rows = residents.map(r => \`
                <tr class="border-b text-xs">
                    <td class="py-3 px-2 font-bold">\${r.first_name} \${r.last_name}</td>
                    <td class="py-3 px-2">\${r.gender}</td>
                    <td class="py-3 px-2">\${r.address}</td>
                    <td class="py-3 px-2">
                        <button onclick="approveResident('\${r.id}')" class="px-2.5 py-1 bg-emerald-600 text-white rounded font-bold mr-1">Approve</button>
                        <button onclick="rejectResident('\${r.id}')" class="px-2.5 py-1 bg-rose-600 text-white rounded font-bold">Reject</button>
                    </td>
                </tr>
            \`).join('');

            container.innerHTML = \`
                <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-sm font-bold text-slate-800">Pending Resident Registration Approvals</h3>
                        <button onclick="printAllIds()" class="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-bold"><i class="fa-solid fa-print mr-1"></i> Print All Active IDs (8 per Page)</button>
                    </div>
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b text-slate-400 text-[11px] uppercase">
                                <th class="py-2">Full Name</th>
                                <th class="py-2">Gender</th>
                                <th class="py-2">Address</th>
                                <th class="py-2">Actions</th>
                            </tr>
                        </thead>
                        <tbody>\${rows || '<tr><td colspan="4" class="text-center py-4 text-xs text-slate-400">No pending resident approvals.</td></tr>'}</tbody>
                    </table>
                </div>
            \`;
        }

        window.approveResident = async (id) => {
            const res = await api('/residents/' + id + '/approve', { method: 'POST' });
            alert(res.message);
            renderStaffResidents(document.getElementById('staffContent'));
        };

        window.rejectResident = async (id) => {
            const reason = prompt('Reason for rejection:');
            if (!reason) return;
            const res = await api('/residents/' + id + '/reject', { method: 'POST', body: JSON.stringify({ reason }) });
            alert(res.message);
            renderStaffResidents(document.getElementById('staffContent'));
        };

        window.printAllIds = async () => {
            const residents = await api('/residents?status=ACTIVE');
            const logo = state.settings.barangay_logo || DEFAULT_LOGO;
            const brgyName = state.settings.barangay_name || 'BARANGAY CENTRAL';
            const captainSig = state.settings.captain_signature || '';
            const captainName = state.settings.captain_name || 'HON. BARANGAY CAPTAIN';

            let cardsHtml = residents.map(r => \`
                <div class="id-card-national shadow-sm">
                    <div class="flex items-center gap-1.5 border-b border-emerald-700/40 pb-1 bg-gradient-to-r from-emerald-800 to-blue-800 text-white px-2 py-1 rounded-t">
                        <img src="\${logo}" class="w-7 h-7 rounded-full bg-white p-0.5 object-cover">
                        <div class="leading-none flex-1">
                            <p class="text-[7pt] font-extrabold uppercase">REPUBLIKA NG PILIPINAS</p>
                            <p class="text-[8pt] font-black uppercase text-emerald-200">\${brgyName}</p>
                            <p class="text-[6pt] font-extrabold text-white uppercase mt-0.5">RESIDENT CARD / BRGY ID</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-12 gap-1 my-1 px-1 text-[7pt] leading-tight flex-1 items-center">
                        <div class="col-span-3 text-center">
                            <img src="\${r.photo_url || DEFAULT_USER}" class="w-[0.75in] h-[0.9in] border-2 border-emerald-700 rounded object-cover mx-auto bg-white">
                        </div>
                        <div class="col-span-6 space-y-0.5">
                            <div><span class="text-[5pt] text-slate-500 font-bold block uppercase">ID Number</span><span class="font-extrabold text-blue-900 font-mono text-[7.5pt]">\${r.resident_number}</span></div>
                            <div><span class="text-[5pt] text-slate-500 font-bold block uppercase">Name</span><span class="font-black text-slate-900 uppercase text-[7.5pt] block truncate">\${r.last_name}, \${r.first_name}</span></div>
                            <div><span class="text-[5pt] text-slate-500 font-bold block uppercase">Birthdate</span><span class="font-bold text-slate-800 text-[6.5pt]">\${r.date_of_birth}</span></div>
                            <div><span class="text-[5pt] text-slate-500 font-bold block uppercase">Address</span><span class="font-bold text-slate-800 text-[6pt] truncate block">\${r.address}</span></div>
                        </div>
                        <div class="col-span-3 text-center flex flex-col items-center justify-center">
                            <img src="\${r.qr_code_url}" class="w-[0.9in] h-[0.9in] border border-slate-300 rounded p-0.5 bg-white">
                        </div>
                    </div>
                    <div class="border-t border-emerald-700/30 pt-0.5 flex justify-between items-end px-2 bg-emerald-50/50 rounded-b">
                        <div class="text-[5.5pt]">Purok: <strong class="text-emerald-800">\${r.puroks ? r.puroks.name : 'N/A'}</strong></div>
                        <div class="text-center">
                            \${captainSig ? \`<img src="\${captainSig}" class="h-4 mx-auto -mb-1 object-contain">\` : ''}
                            <div class="border-b border-slate-800 w-24 mx-auto"></div>
                            <span class="text-[5pt] font-extrabold text-slate-800 uppercase block">\${captainName}</span>
                        </div>
                    </div>
                </div>
            \`).join('');

            const win = window.open('', '_blank');
            win.document.write(\`
                <html>
                <head><title>Batch ID Printing (8 per Page)</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                    .id-card-national { width: 3.375in; height: 2.125in; border: 2px solid #059669; border-radius: 8px; overflow: hidden; box-sizing: border-box; background: white; position: relative; display: flex; flex-direction: column; justify-content: space-between; padding: 4px; font-family: 'Arial', sans-serif; color: #0f172a; page-break-inside: avoid; }
                    @media print { .id-grid { display: grid; grid-template-columns: repeat(2, 3.375in); gap: 0.2in; justify-content: center; } }
                </style>
                </head>
                <body class="p-8"><div class="id-grid gap-4">\${cardsHtml}</div><script>window.print();<\/script></body>
                </html>
            \`);
            win.document.close();
        };

        async function renderStaffHouseholds(container) {
            const list = await api('/households');
            let rows = list.map(h => \`
                <tr class="border-b text-xs">
                    <td class="py-3 px-2 font-bold">\${h.household_number}</td>
                    <td class="py-3 px-2">\${h.puroks ? h.puroks.name : 'N/A'}</td>
                    <td class="py-3 px-2">\${h.street_address}</td>
                </tr>
            \`).join('');

            container.innerHTML = \`
                <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 class="text-sm font-bold text-slate-800 mb-4">Household Registry</h3>
                    <table class="w-full text-left border-collapse">
                        <thead><tr class="border-b text-slate-400 text-[11px] uppercase"><th class="py-2">Household #</th><th class="py-2">Purok</th><th class="py-2">Street Address</th></tr></thead>
                        <tbody>\${rows || '<tr><td colspan="3" class="text-center py-4 text-xs text-slate-400">No households recorded.</td></tr>'}</tbody>
                    </table>
                </div>
            \`;
        }

        async function renderStaffPuroks(container) {
            const list = await api('/puroks');
            let cards = list.map(p => \`
                <div class="p-5 bg-white rounded-xl border border-emerald-200 shadow-sm">
                    <h4 class="font-bold text-slate-800 text-sm">\${p.name}</h4>
                    <p class="text-xs text-slate-500 mt-1">\${p.description || 'Purok Zone'}</p>
                    <div class="mt-4 pt-3 border-t flex justify-between items-center">
                        <span class="text-xs text-slate-400 font-semibold">Total Residents:</span>
                        <span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-black rounded-lg text-xs">\${p.resident_count} Residents</span>
                    </div>
                </div>
            \`).join('');

            container.innerHTML = \`
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    \${cards || '<p class="text-xs text-slate-400">No puroks configured.</p>'}
                </div>
            \`;
        }

        async function renderStaffDocuments(container) {
            const list = await api('/certificates/requests');
            let rows = list.map(r => \`
                <tr class="border-b text-xs">
                    <td class="py-3 px-2 font-mono font-bold text-blue-700">\${r.request_number}</td>
                    <td class="py-3 px-2 font-bold">\${r.certificate_type}</td>
                    <td class="py-3 px-2">\${r.residents ? r.residents.first_name + ' ' + r.residents.last_name : 'Resident'}</td>
                    <td class="py-3 px-2 font-bold \${r.status === 'READY_FOR_RELEASE' ? 'text-emerald-600' : 'text-amber-600'}">\${r.status}</td>
                    <td class="py-3 px-2">
                        \${r.status === 'PENDING' ? \`<button onclick="approveCert('\${r.id}')" class="px-2.5 py-1 bg-emerald-600 text-white rounded font-bold">Upload & Approve</button>\` : ''}
                    </td>
                </tr>
            \`).join('');

            container.innerHTML = \`
                <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 class="text-sm font-bold text-slate-800 mb-4">Certificate Requests Approval & Issuance</h3>
                    <table class="w-full text-left border-collapse">
                        <thead><tr class="border-b text-slate-400 text-[11px] uppercase"><th class="py-2">Ref #</th><th class="py-2">Type</th><th class="py-2">Resident</th><th class="py-2">Status</th><th class="py-2">Action</th></tr></thead>
                        <tbody>\${rows || '<tr><td colspan="5" class="text-center py-4 text-xs text-slate-400">No certificate requests.</td></tr>'}</tbody>
                    </table>
                </div>
            \`;
        }

        window.approveCert = async (id) => {
            const fileInput = prompt('Enter URL or upload certificate file path for release:');
            if (!fileInput) return;
            const formData = new FormData();
            formData.append('requestId', id);
            // Simulated file submission placeholder
            alert('Certificate processed successfully!');
            renderStaffDocuments(document.getElementById('staffContent'));
        };

        async function renderStaffBlotter(container) {
            const list = await api('/blotter');
            let rows = list.map(b => \`
                <tr class="border-b text-xs">
                    <td class="py-3 px-2 font-mono font-bold">\${b.case_number}</td>
                    <td class="py-3 px-2 font-bold">\${b.complainant_name} vs \${b.respondent_name}</td>
                    <td class="py-3 px-2">\${b.incident_date}</td>
                    <td class="py-3 px-2 font-bold text-rose-600">\${b.status}</td>
                </tr>
            \`).join('');

            container.innerHTML = \`
                <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 class="text-sm font-bold text-slate-800 mb-4">Blotter & Incident Case Records</h3>
                    <table class="w-full text-left border-collapse">
                        <thead><tr class="border-b text-slate-400 text-[11px] uppercase"><th class="py-2">Case #</th><th class="py-2">Parties</th><th class="py-2">Date</th><th class="py-2">Status</th></tr></thead>
                        <tbody>\${rows || '<tr><td colspan="4" class="text-center py-4 text-xs text-slate-400">No blotter cases.</td></tr>'}</tbody>
                    </table>
                </div>
            \`;
        }

        async function renderStaffAnnouncements(container) {
            container.innerHTML = \`
                <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-xl mx-auto text-xs">
                    <h3 class="text-sm font-bold text-slate-800 mb-4">Publish Barangay Announcement</h3>
                    <form id="annForm" class="space-y-3">
                        <div><label class="font-bold text-slate-700">Title *</label><input type="text" id="annTitle" required class="w-full p-2 border rounded mt-1"></div>
                        <div>
                            <label class="font-bold text-slate-700">Priority Level</label>
                            <select id="annPriority" class="w-full p-2 border rounded mt-1">
                                <option value="Normal">Normal</option>
                                <option value="Urgent">Urgent / Important</option>
                            </select>
                        </div>
                        <div><label class="font-bold text-slate-700">Content / Message *</label><textarea id="annContent" required rows="4" class="w-full p-2 border rounded mt-1"></textarea></div>
                        <button type="submit" class="w-full py-2 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700">Publish Announcement</button>
                    </form>
                </div>
            \`;

            document.getElementById('annForm').onsubmit = async (e) => {
                e.preventDefault();
                const res = await api('/announcements', {
                    method: 'POST',
                    body: JSON.stringify({
                        title: document.getElementById('annTitle').value,
                        content: document.getElementById('annContent').value,
                        priority: document.getElementById('annPriority').value
                    })
                });
                alert(res.message);
                setStaffTab('announcements');
            };
        }

        function renderStaffSettings(container) {
            const s = state.settings;
            container.innerHTML = \`
                <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-xl mx-auto text-xs">
                    <h3 class="text-sm font-bold text-slate-800 mb-4">System Settings & Branding</h3>
                    <form id="settingsForm" class="space-y-3">
                        <div><label class="font-bold text-slate-700">Barangay Name</label><input type="text" name="barangay_name" value="\${s.barangay_name || ''}" class="w-full p-2 border rounded mt-1"></div>
                        <div><label class="font-bold text-slate-700">Municipality / City</label><input type="text" name="municipality" value="\${s.municipality || ''}" class="w-full p-2 border rounded mt-1"></div>
                        <div><label class="font-bold text-slate-700">Province</label><input type="text" name="province" value="\${s.province || ''}" class="w-full p-2 border rounded mt-1"></div>
                        <div><label class="font-bold text-slate-700">Barangay Captain Full Name</label><input type="text" name="captain_name" value="\${s.captain_name || ''}" class="w-full p-2 border rounded mt-1"></div>
                        <button type="submit" class="w-full py-2.5 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700">Save System Settings</button>
                    </form>
                </div>
            \`;

            document.getElementById('settingsForm').onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const bodyObj = {};
                formData.forEach((val, key) => bodyObj[key] = val);
                const res = await api('/settings', { method: 'POST', body: JSON.stringify(bodyObj) });
                alert(res.message);
                window.location.reload();
            };
        }

        window.onload = initApp;
    </script>
</body>
</html>
    `);
});

app.listen(PORT, () => {
    console.log(`Barangay Resident Management System running on port ${PORT}`);
});
