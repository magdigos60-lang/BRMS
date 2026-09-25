/* ==========================================================================
   BARANGAY RESIDENT MANAGEMENT SYSTEM (BRMS) - MONOLITHIC SERVER & WEB CLIENT
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

// 1. SETUP / INIT CHECK
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

// 2. AUTHENTICATION (LOGIN)
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

// UPDATE RESIDENT PROFILE PICTURE & DETAILS
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

// 3. PUBLIC RESIDENT REGISTRATION
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

// 4. SYSTEM SETTINGS
app.get('/api/settings', async (req, res) => {
    try {
        const { data, error } = await supabase.from('system_settings').select('*');
        if (error) throw error;
        const settings = {};
        if (data) data.forEach(item => settings[item.setting_key] = item.setting_value);
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings', authenticateToken, requireRole(['super_admin']), upload.single('barangay_logo'), async (req, res) => {
    try {
        const body = req.body;
        if (req.file) {
            body.barangay_logo = `/uploads/${req.file.filename}`;
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

// 5. DASHBOARD STATS
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

// 6. RESIDENTS MANAGEMENT
app.get('/api/residents', authenticateToken, requireRole(['super_admin', 'captain', 'secretary', 'staff']), async (req, res) => {
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
        const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl);

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

// 7. PUROKS WITH RESIDENT COUNT
app.get('/api/puroks', async (req, res) => {
    try {
        const { data: puroks, error } = await supabase.from('puroks').select('*').order('name');
        if (error) throw error;

        // Fetch counts for each purok
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

// 8. CERTIFICATE REQUESTS & ISSUANCE
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
            purpose
        }]).select();

        if (error) throw error;
        await logActivity(req.user.id, req.user.fullName, 'REQUEST_CERTIFICATE', `Requested ${certificateType}`, req.ip);
        res.json({ success: true, message: 'Certificate request submitted.', data: data[0] });
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

// 9. QR CLAIM SCANNING & RELEASE
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

// 10. ANNOUNCEMENTS
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

// 11. BLOTTER CASES
app.get('/api/blotter', authenticateToken, requireRole(['super_admin', 'captain', 'secretary', 'staff']), async (req, res) => {
    try {
        const { data, error } = await supabase.from('blotter_cases').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/blotter', authenticateToken, requireRole(['super_admin', 'captain', 'secretary', 'staff']), async (req, res) => {
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

// 12. APPOINTMENTS & ASSISTANCE
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
            purpose
        }]).select();

        if (error) throw error;
        res.json({ success: true, message: 'Appointment requested successfully.', data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 13. ACTIVITY LOGS
app.get('/api/logs', authenticateToken, requireRole(['super_admin']), async (req, res) => {
    try {
        const { data, error } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 14. PUBLIC VERIFICATION ROUTE
app.get('/verify/resident/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('id', id).single();
        const { data: settings } = await supabase.from('system_settings').select('*');
        const brgy = {};
        if (settings) settings.forEach(s => brgy[s.setting_key] = s.setting_value);

        if (!resident || resident.status !== 'ACTIVE') {
            return res.send(`
                <html><body style="font-family:sans-serif; text-align:center; padding:50px; background:#f8fafc;">
                    <h1 style="color:#2563eb;">INVALID / UNVERIFIED BARANGAY ID</h1>
                    <p>The queried resident ID token does not exist or is currently inactive.</p>
                </body></html>
            `);
        }

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
                    .info-table td.label { font-weight:bold; color:#1e3a8a; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="header">
                        <h2 style="margin:0;">${brgy.barangay_name || 'BARANGAY CENTRAL'}</h2>
                        <small>${brgy.municipality || 'Municipality'}, ${brgy.province || 'Province'}</small>
                    </div>
                    <div class="body">
                        <div class="badge">&#10004; OFFICIAL VALID RESIDENT</div><br>
                        <img class="photo" src="${resident.photo_url || 'https://via.placeholder.com/150'}" alt="Resident Photo">
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
   FRONTEND APPLICATION SERVING (HTML, CSS, JS MONOLITH)
   ========================================================================== */

app.get('*', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Barangay Resident Management System</title>
    <!-- Tailwind CSS CDN & FontAwesome -->
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/html5-qrcode/html5-qrcode.min.js"></script>
    <style>
        :root {
            --primary-green: #059669;
            --primary-blue: #2563eb;
        }
        .bg-login-custom {
            background-image: linear-gradient(rgba(5, 150, 105, 0.85), rgba(37, 99, 235, 0.85)), 
                              url('${CUSTOM_BG_URL}');
            background-size: cover;
            background-position: center;
        }
        
        /* NATIONAL ID STYLE PRINT STYLES - FULL SPACE UTILIZATION */
        @media print {
            body * { visibility: hidden; }
            #printableArea, #printableArea * { visibility: visible; }
            #printableArea { position: absolute; left: 0; top: 0; width: 100%; }
            .no-print { display: none !important; }
            
            .id-grid-container {
                display: grid;
                grid-template-columns: repeat(2, 3.375in);
                grid-auto-rows: 2.125in;
                gap: 0.25in;
                padding: 0.25in;
                justify-content: center;
            }
            .id-card-national {
                width: 3.375in;
                height: 2.125in;
                border: 2px solid #059669;
                border-radius: 10px;
                overflow: hidden;
                box-sizing: border-box;
                font-size: 8pt;
                background-image: linear-gradient(rgba(255,255,255,0.92), rgba(255,255,255,0.92)), url('${CUSTOM_BG_URL}') !important;
                background-size: cover !important;
                background-position: center !important;
                -webkit-print-color-adjust: exact;
                position: relative;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                padding: 4px 6px;
            }
        }
    </style>
</head>
<body class="bg-white text-slate-800 antialiased font-sans">

    <!-- APP CONTAINER -->
    <div id="app" class="min-h-screen flex flex-col"></div>

    <!-- MAIN SINGLE PAGE APPLICATION JS LOGIC -->
    <script>
        // Global State
        let state = {
            token: localStorage.getItem('brms_token') || null,
            user: JSON.parse(localStorage.getItem('brms_user')) || null,
            resident: JSON.parse(localStorage.getItem('brms_resident')) || null,
            settings: {},
            currentRoute: 'login',
            activeTab: 'dashboard',
            resActiveTab: 'profile',
            puroks: []
        };

        // API Helper
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

        // Initialize App
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

        /* ==========================================================================
           1. INITIAL ADMIN SETUP RENDER
           ========================================================================== */
        function renderSetupAdmin() {
            const app = document.getElementById('app');
            app.innerHTML = \`
                <div class="min-h-screen bg-login-custom flex items-center justify-center p-4">
                    <div class="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-8 max-w-md w-full border border-emerald-500/30">
                        <div class="text-center mb-6">
                            <div class="inline-flex p-3 bg-emerald-100 rounded-full text-emerald-600 mb-3">
                                <i class="fa-solid fa-user-shield fa-2x"></i>
                            </div>
                            <h1 class="text-2xl font-bold text-blue-900">INITIAL ADMIN SETUP</h1>
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

        /* ==========================================================================
           2. LOGIN & REGISTRATION RENDER
           ========================================================================== */
        function renderLogin() {
            const app = document.getElementById('app');
            const logo = state.settings.barangay_logo || '';
            const brgyName = state.settings.barangay_name || 'BARANGAY CENTRAL';
            const municipality = state.settings.municipality || 'Municipality';
            const province = state.settings.province || 'Province';

            app.innerHTML = \`
                <div class="min-h-screen bg-login-custom flex items-center justify-center p-4">
                    <div class="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl overflow-hidden max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 border border-white/20">
                        <!-- Left Info Banner -->
                        <div class="bg-gradient-to-br from-emerald-700/90 to-blue-800/90 p-8 text-white flex flex-col justify-between">
                            <div class="text-center md:text-left">
                                \${logo ? \`<img src="\${logo}" class="w-20 h-20 mx-auto md:mx-0 rounded-full bg-white p-1 mb-4 shadow-md">\` : \`<div class="w-20 h-20 mx-auto md:mx-0 rounded-full bg-white/20 flex items-center justify-center mb-4"><i class="fa-solid fa-building-columns fa-2x"></i></div>\`}
                                <h2 class="text-2xl font-black tracking-wide">\${brgyName.toUpperCase()}</h2>
                                <p class="text-xs text-emerald-100 mt-1">\${municipality}, \${province}</p>
                            </div>
                            <div class="my-8 hidden md:block">
                                <h3 class="text-lg font-bold">Resident Services & Information System</h3>
                                <p class="text-xs text-emerald-100 mt-2 leading-relaxed">
                                    Access online barangay clearances, digital ID, schedule appointments, and submit community concerns efficiently.
                                </p>
                            </div>
                            <div class="text-xs text-emerald-200 text-center md:text-left">
                                &copy; 2026 Official Barangay Portal. All rights reserved.
                            </div>
                        </div>

                        <!-- Right Login Form -->
                        <div class="p-8 flex flex-col justify-center">
                            <div class="flex border-b border-slate-200 mb-6">
                                <button id="btnPortalStaff" type="button" onclick="switchLoginPortal('staff')" class="flex-1 py-2 text-sm font-bold text-emerald-600 border-b-2 border-emerald-600">Staff Login</button>
                                <button id="btnPortalResident" type="button" onclick="switchLoginPortal('resident')" class="flex-1 py-2 text-sm font-bold text-blue-600 border-b-2 border-transparent">Resident Portal</button>
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
                btnResident.className = "flex-1 py-2 text-sm font-bold text-blue-600 border-b-2 border-transparent";
                prompt.classList.add('hidden');
            } else {
                btnResident.className = "flex-1 py-2 text-sm font-bold text-blue-600 border-b-2 border-blue-600";
                btnStaff.className = "flex-1 py-2 text-sm font-bold text-emerald-600 border-b-2 border-transparent";
                prompt.classList.remove('hidden');
            }
        }

        async function renderRegisterModal() {
            let puroks = [];
            try { puroks = await fetch('/api/puroks').then(r => r.json()); } catch(e){}
            let purokOptions = (puroks || []).map(p => \`<option value="\${p.id}">\${p.name}</option>\`).join('');

            const modalHtml = \`
                <div id="regModal" class="fixed inset-0 bg-blue-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div class="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-8 border border-emerald-500">
                        <div class="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
                            <h3 class="text-lg font-bold text-blue-900">New Resident Registration</h3>
                            <button type="button" onclick="document.getElementById('regModal').remove()" class="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
                        </div>
                        <form id="publicRegForm" class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div>
                                <label class="font-semibold text-slate-600">First Name *</label>
                                <input type="text" name="firstName" required class="w-full p-2 border rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Middle Name</label>
                                <input type="text" name="middleName" class="w-full p-2 border rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Last Name *</label>
                                <input type="text" name="lastName" required class="w-full p-2 border rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Suffix</label>
                                <input type="text" name="suffix" placeholder="Jr., Sr., III" class="w-full p-2 border rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Date of Birth *</label>
                                <input type="date" name="dateOfBirth" required class="w-full p-2 border rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Gender *</label>
                                <select name="gender" required class="w-full p-2 border rounded mt-1">
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Civil Status</label>
                                <select name="civilStatus" class="w-full p-2 border rounded mt-1">
                                    <option value="Single">Single</option>
                                    <option value="Married">Married</option>
                                    <option value="Widowed">Widowed</option>
                                    <option value="Separated">Separated</option>
                                </select>
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Purok Zone</label>
                                <select name="purokId" class="w-full p-2 border rounded mt-1">
                                    <option value="">-- Select Purok --</option>
                                    \${purokOptions}
                                </select>
                            </div>
                            <div class="md:col-span-2">
                                <label class="font-semibold text-slate-600">Street Address *</label>
                                <input type="text" name="address" required class="w-full p-2 border rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Contact Number</label>
                                <input type="text" name="contactNumber" class="w-full p-2 border rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Email Address</label>
                                <input type="email" name="email" class="w-full p-2 border rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Account Username *</label>
                                <input type="text" name="username" required class="w-full p-2 border rounded mt-1">
                            </div>
                            <div>
                                <label class="font-semibold text-slate-600">Account Password *</label>
                                <input type="password" name="password" required class="w-full p-2 border rounded mt-1">
                            </div>
                            <div class="md:col-span-2">
                                <label class="font-semibold text-slate-600">Resident Photo (2x2 or ID Style)</label>
                                <input type="file" name="photo" accept="image/*" class="w-full p-2 border rounded mt-1">
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

        /* ==========================================================================
           3. STAFF PORTAL RENDER (BLUE, GREEN & WHITE)
           ========================================================================== */
        function renderStaffPortal() {
            const app = document.getElementById('app');
            const brgyName = state.settings.barangay_name || 'BARANGAY CENTRAL';
            const logo = state.settings.barangay_logo || '';

            app.innerHTML = \`
                <div class="flex h-screen bg-white overflow-hidden">
                    <!-- Sidebar -->
                    <aside class="w-64 bg-blue-950 text-slate-200 flex flex-col justify-between hidden md:flex border-r border-emerald-500">
                        <div>
                            <div class="p-4 border-b border-blue-900 flex items-center gap-3 bg-gradient-to-r from-emerald-800 to-blue-900">
                                \${logo ? \`<img src="\${logo}" class="w-10 h-10 rounded-full bg-white p-0.5 shadow">\` : \`<i class="fa-solid fa-building-columns text-emerald-400 fa-lg"></i>\`}
                                <div>
                                    <h1 class="font-bold text-white text-sm truncate">\${brgyName}</h1>
                                    <span class="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full uppercase font-bold">\${state.user.role}</span>
                                </div>
                            </div>
                            <nav class="p-3 space-y-1 text-xs">
                                <button type="button" onclick="setStaffTab('dashboard')" class="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-900 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-chart-pie w-4"></i> Dashboard</button>
                                <button type="button" onclick="setStaffTab('residents')" class="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-900 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-users w-4"></i> Residents</button>
                                <button type="button" onclick="setStaffTab('households')" class="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-900 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-house w-4"></i> Households</button>
                                <button type="button" onclick="setStaffTab('puroks')" class="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-900 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-map-location-dot w-4"></i> Puroks (Resident Count)</button>
                                <button type="button" onclick="setStaffTab('certificates')" class="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-900 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-file-contract w-4"></i> Certificates</button>
                                <button type="button" onclick="setStaffTab('qrscanner')" class="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-900 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-qrcode w-4"></i> QR Claim Scanner</button>
                                <button type="button" onclick="setStaffTab('blotter')" class="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-900 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-gavel w-4"></i> Blotter Cases</button>
                                <button type="button" onclick="setStaffTab('appointments')" class="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-900 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-calendar-check w-4"></i> Appointments</button>
                                <button type="button" onclick="setStaffTab('announcements')" class="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-900 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-bullhorn w-4"></i> Announcements</button>
                                <button type="button" onclick="setStaffTab('idprint')" class="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-900 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-id-card w-4"></i> Batch Print Resident Cards</button>
                                \${state.user.role === 'super_admin' ? \`
                                    <button type="button" onclick="setStaffTab('settings')" class="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-900 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-sliders w-4"></i> System Settings</button>
                                    <button type="button" onclick="setStaffTab('logs')" class="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-900 hover:text-emerald-400 font-medium transition"><i class="fa-solid fa-list-check w-4"></i> Activity Logs</button>
                                \` : ''}
                            </nav>
                        </div>
                        <div class="p-3 border-t border-blue-900">
                            <button type="button" onclick="logout()" class="w-full flex items-center gap-3 px-3 py-2.5 text-xs text-blue-300 hover:bg-blue-900 rounded-lg font-medium">
                                <i class="fa-solid fa-arrow-right-from-bracket w-4"></i> Logout
                            </button>
                        </div>
                    </aside>

                    <!-- Main Content Area -->
                    <main class="flex-1 flex flex-col overflow-hidden bg-white">
                        <header class="bg-gradient-to-r from-blue-900 to-emerald-700 text-white px-6 py-4 flex justify-between items-center shadow-md">
                            <h2 id="staffPageTitle" class="text-xl font-bold">Dashboard</h2>
                            <div class="flex items-center gap-3">
                                <span class="text-xs font-semibold">\${state.user.fullName}</span>
                                <div class="w-8 h-8 rounded-full bg-emerald-600 text-white border-2 border-white flex items-center justify-center font-bold text-xs">
                                    \${state.user.fullName.charAt(0)}
                                </div>
                            </div>
                        </header>

                        <div id="staffContent" class="flex-1 overflow-y-auto p-6 bg-white">
                            <!-- Dynamic Content Rendered Here -->
                        </div>
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
                title.innerText = 'Staff Dashboard';
                const stats = await api('/dashboard/stats');
                content.innerHTML = \`
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div class="bg-white p-4 rounded-xl border border-emerald-500 shadow-sm flex items-center gap-4">
                            <div class="p-3 bg-emerald-100 text-emerald-600 rounded-lg"><i class="fa-solid fa-users fa-xl"></i></div>
                            <div>
                                <p class="text-xs text-slate-500 font-medium">Active Residents</p>
                                <h3 class="text-2xl font-bold text-blue-900">\${stats.totalResidents}</h3>
                            </div>
                        </div>
                        <div class="bg-white p-4 rounded-xl border border-blue-500 shadow-sm flex items-center gap-4">
                            <div class="p-3 bg-blue-100 text-blue-600 rounded-lg"><i class="fa-solid fa-house fa-xl"></i></div>
                            <div>
                                <p class="text-xs text-slate-500 font-medium">Households</p>
                                <h3 class="text-2xl font-bold text-blue-900">\${stats.totalHouseholds}</h3>
                            </div>
                        </div>
                        <div class="bg-white p-4 rounded-xl border border-emerald-400 shadow-sm flex items-center gap-4">
                            <div class="p-3 bg-emerald-50 text-emerald-600 rounded-lg"><i class="fa-solid fa-user-clock fa-xl"></i></div>
                            <div>
                                <p class="text-xs text-slate-500 font-medium">Pending Approvals</p>
                                <h3 class="text-2xl font-bold text-blue-900">\${stats.pendingApprovals}</h3>
                            </div>
                        </div>
                        <div class="bg-white p-4 rounded-xl border border-blue-400 shadow-sm flex items-center gap-4">
                            <div class="p-3 bg-blue-50 text-blue-600 rounded-lg"><i class="fa-solid fa-file-invoice fa-xl"></i></div>
                            <div>
                                <p class="text-xs text-slate-500 font-medium">Pending Certificates</p>
                                <h3 class="text-2xl font-bold text-blue-900">\${stats.pendingCerts}</h3>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
                        <div class="bg-white p-3 rounded-lg border border-blue-200 text-center">
                            <span class="text-xs text-slate-500">Male</span>
                            <p class="text-lg font-bold text-blue-800">\${stats.maleResidents}</p>
                        </div>
                        <div class="bg-white p-3 rounded-lg border border-emerald-200 text-center">
                            <span class="text-xs text-slate-500">Female</span>
                            <p class="text-lg font-bold text-emerald-700">\${stats.femaleResidents}</p>
                        </div>
                        <div class="bg-white p-3 rounded-lg border border-blue-200 text-center">
                            <span class="text-xs text-slate-500">Seniors</span>
                            <p class="text-lg font-bold text-blue-900">\${stats.seniorCitizens}</p>
                        </div>
                        <div class="bg-white p-3 rounded-lg border border-emerald-200 text-center">
                            <span class="text-xs text-slate-500">PWD</span>
                            <p class="text-lg font-bold text-emerald-800">\${stats.pwdCount}</p>
                        </div>
                        <div class="bg-white p-3 rounded-lg border border-blue-200 text-center">
                            <span class="text-xs text-slate-500">Solo Parents</span>
                            <p class="text-lg font-bold text-blue-900">\${stats.soloParents}</p>
                        </div>
                        <div class="bg-white p-3 rounded-lg border border-emerald-200 text-center">
                            <span class="text-xs text-slate-500">Voters</span>
                            <p class="text-lg font-bold text-emerald-800">\${stats.voters}</p>
                        </div>
                    </div>
                \`;
            } else if (tab === 'residents') {
                title.innerText = 'Resident Records';
                renderResidentManagement(content);
            } else if (tab === 'households') {
                title.innerText = 'Household Records';
                renderHouseholdManagement(content);
            } else if (tab === 'puroks') {
                title.innerText = 'Purok Zones & Resident Counting';
                renderPurokManagement(content);
            } else if (tab === 'certificates') {
                title.innerText = 'Certificate Requests & Issuance';
                renderCertificateManagement(content);
            } else if (tab === 'qrscanner') {
                title.innerText = 'QR Code Claim Verification Scanner';
                renderQRScanner(content);
            } else if (tab === 'blotter') {
                title.innerText = 'Blotter Case Records';
                renderBlotterManagement(content);
            } else if (tab === 'appointments') {
                title.innerText = 'Appointments & Services';
                renderAppointmentManagement(content);
            } else if (tab === 'announcements') {
                title.innerText = 'Announcements Management';
                renderAnnouncementManagement(content);
            } else if (tab === 'idprint') {
                title.innerText = 'National ID Style - Batch ID Printing';
                renderIDBatchPrint(content);
            } else if (tab === 'settings') {
                title.innerText = 'Barangay System Settings';
                renderSystemSettings(content);
            } else if (tab === 'logs') {
                title.innerText = 'System Activity Logs';
                renderActivityLogs(content);
            }
        }

        /* ==========================================================================
           4. RESIDENT MANAGEMENT
           ========================================================================== */
        async function renderResidentManagement(container) {
            const residents = await api('/residents?status=ACTIVE');
            const pendings = await api('/residents?status=PENDING');
            const archived = await api('/residents?status=ARCHIVED');

            container.innerHTML = \`
                <div class="bg-white rounded-xl shadow-sm border border-blue-200">
                    <div class="border-b border-blue-100 px-6 py-4 flex gap-6 text-sm font-bold">
                        <button type="button" onclick="switchResSubTab('active')" id="tabResActive" class="text-emerald-600 border-b-2 border-emerald-600 pb-2">Active (\${residents.length})</button>
                        <button type="button" onclick="switchResSubTab('pending')" id="tabResPending" class="text-slate-400 border-b-2 border-transparent pb-2">Pending (\${pendings.length})</button>
                        <button type="button" onclick="switchResSubTab('archived')" id="tabResArchived" class="text-slate-400 border-b-2 border-transparent pb-2">Archived (\${archived.length})</button>
                    </div>

                    <div id="resTableContainer" class="p-6"></div>
                </div>
            \`;

            window.resDataActive = residents;
            window.resDataPending = pendings;
            window.resDataArchived = archived;

            switchResSubTab('active');
        }

        function switchResSubTab(tab) {
            const container = document.getElementById('resTableContainer');
            if (tab === 'active') {
                renderResTable(window.resDataActive, 'active');
            } else if (tab === 'pending') {
                renderResTable(window.resDataPending, 'pending');
            } else if (tab === 'archived') {
                renderResTable(window.resDataArchived, 'archived');
            }
        }

        function renderResTable(data, type) {
            const container = document.getElementById('resTableContainer');
            if (!data || data.length === 0) {
                container.innerHTML = \`<p class="text-xs text-slate-400 text-center py-8">No records found in this category.</p>\`;
                return;
            }

            let rows = data.map(r => \`
                <tr class="border-b border-slate-100 hover:bg-emerald-50/30 text-xs">
                    <td class="py-3 px-2 font-mono font-bold text-blue-900">\${r.resident_number || 'N/A'}</td>
                    <td class="py-3 px-2 font-bold text-slate-800">\${r.first_name} \${r.last_name}</td>
                    <td class="py-3 px-2">\${r.gender}</td>
                    <td class="py-3 px-2">\${r.date_of_birth}</td>
                    <td class="py-3 px-2">\${r.contact_number || 'N/A'}</td>
                    <td class="py-3 px-2 font-bold text-emerald-700">\${r.status}</td>
                    <td class="py-3 px-2 text-right space-x-1">
                        \${type === 'pending' ? \`
                            <button type="button" onclick="approveResident('\${r.id}')" class="px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700">Approve</button>
                            <button type="button" onclick="rejectResident('\${r.id}')" class="px-2 py-1 bg-blue-800 text-white rounded hover:bg-blue-900">Reject</button>
                        \` : ''}
                        \${type === 'active' ? \`
                            <button type="button" onclick="archiveResident('\${r.id}')" class="px-2 py-1 bg-blue-900 text-white rounded hover:bg-blue-950">Archive</button>
                        \` : ''}
                        \${type === 'archived' ? \`
                            <button type="button" onclick="restoreResident('\${r.id}')" class="px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700">Restore</button>
                        \` : ''}
                    </td>
                </tr>
            \`).join('');

            container.innerHTML = \`
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b border-blue-200 text-blue-900 text-[11px] uppercase tracking-wider font-bold">
                                <th class="py-2">Resident ID</th>
                                <th class="py-2">Full Name</th>
                                <th class="py-2">Gender</th>
                                <th class="py-2">DOB</th>
                                <th class="py-2">Contact</th>
                                <th class="py-2">Status</th>
                                <th class="py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>\${rows}</tbody>
                    </table>
                </div>
            \`;
        }

        async function approveResident(id) {
            if (!confirm('Are you sure you want to approve this resident?')) return;
            const res = await api(\`/residents/\${id}/approve\`, { method: 'POST' });
            alert(res.message);
            setStaffTab('residents');
        }

        async function rejectResident(id) {
            const reason = prompt('Enter rejection reason:');
            if (!reason) return;
            const res = await api(\`/residents/\${id}/reject\`, {
                method: 'POST',
                body: JSON.stringify({ reason })
            });
            alert(res.message);
            setStaffTab('residents');
        }

        async function archiveResident(id) {
            if (!confirm('Archive this resident record?')) return;
            const res = await api(\`/residents/\${id}/archive\`, { method: 'POST' });
            alert(res.message);
            setStaffTab('residents');
        }

        async function restoreResident(id) {
            const res = await api(\`/residents/\${id}/restore\`, { method: 'POST' });
            alert(res.message);
            setStaffTab('residents');
        }

        /* ==========================================================================
           5. HOUSEHOLDS & PUROKS WITH RESIDENT COUNT
           ========================================================================== */
        async function renderHouseholdManagement(container) {
            const households = await api('/households');
            const puroks = await api('/puroks');

            let purokOpts = puroks.map(p => \`<option value="\${p.id}">\${p.name}</option>\`).join('');

            let rows = households.map(h => \`
                <tr class="border-b border-slate-100 text-xs">
                    <td class="py-3 px-2 font-bold text-blue-900">\${h.household_number}</td>
                    <td class="py-3 px-2">\${h.puroks ? h.puroks.name : 'N/A'}</td>
                    <td class="py-3 px-2">\${h.head ? h.head.first_name + ' ' + h.head.last_name : 'N/A'}</td>
                    <td class="py-3 px-2">\${h.street_address || 'N/A'}</td>
                </tr>
            \`).join('');

            container.innerHTML = \`
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="bg-white p-6 rounded-xl border border-emerald-500 shadow-sm">
                        <h3 class="text-sm font-bold text-blue-900 mb-4">Add New Household</h3>
                        <form id="addHouseholdForm" class="space-y-3 text-xs">
                            <div>
                                <label class="font-bold">Household Number *</label>
                                <input type="text" id="hhNumber" required placeholder="HH-2026-001" class="w-full p-2 border rounded mt-1">
                            </div>
                            <div>
                                <label class="font-bold">Purok Zone</label>
                                <select id="hhPurok" class="w-full p-2 border rounded mt-1">
                                    <option value="">-- Select --</option>
                                    \${purokOpts}
                                </select>
                            </div>
                            <div>
                                <label class="font-bold">Street Address</label>
                                <input type="text" id="hhAddress" class="w-full p-2 border rounded mt-1">
                            </div>
                            <button type="submit" class="w-full py-2 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700">Save Household</button>
                        </form>
                    </div>

                    <div class="bg-white p-6 rounded-xl border border-blue-200 shadow-sm md:col-span-2">
                        <h3 class="text-sm font-bold text-blue-900 mb-4">Household Records</h3>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left border-collapse">
                                <thead>
                                    <tr class="border-b text-blue-900 text-[11px] uppercase font-bold">
                                        <th class="py-2">HH #</th>
                                        <th class="py-2">Purok</th>
                                        <th class="py-2">Head of Family</th>
                                        <th class="py-2">Street Address</th>
                                    </tr>
                                </thead>
                                <tbody>\${rows || '<tr><td colspan="4" class="text-center py-4 text-xs text-slate-400">No households recorded yet.</td></tr>'}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            \`;

            document.getElementById('addHouseholdForm').onsubmit = async (e) => {
                e.preventDefault();
                const res = await api('/households', {
                    method: 'POST',
                    body: JSON.stringify({
                        householdNumber: document.getElementById('hhNumber').value,
                        purokId: document.getElementById('hhPurok').value,
                        streetAddress: document.getElementById('hhAddress').value
                    })
                });
                alert(res.message);
                setStaffTab('households');
            };
        }

        async function renderPurokManagement(container) {
            const puroks = await api('/puroks');
            let rows = puroks.map(p => \`
                <tr class="border-b border-slate-100 text-xs">
                    <td class="py-3 px-2 font-bold text-blue-900">\${p.name}</td>
                    <td class="py-3 px-2 font-bold text-emerald-700 text-sm"><i class="fa-solid fa-users text-blue-600 mr-1"></i> \${p.resident_count || 0} Residents</td>
                    <td class="py-3 px-2 text-slate-600">\${p.description || 'N/A'}</td>
                </tr>
            \`).join('');

            container.innerHTML = \`
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="bg-white p-6 rounded-xl border border-emerald-500 shadow-sm">
                        <h3 class="text-sm font-bold text-blue-900 mb-4">Add New Purok Zone</h3>
                        <form id="addPurokForm" class="space-y-3 text-xs">
                            <div>
                                <label class="font-bold">Purok Name *</label>
                                <input type="text" id="purokName" required placeholder="Purok 1" class="w-full p-2 border rounded mt-1">
                            </div>
                            <div>
                                <label class="font-bold">Description</label>
                                <textarea id="purokDesc" class="w-full p-2 border rounded mt-1" rows="3"></textarea>
                            </div>
                            <button type="submit" class="w-full py-2 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700">Add Purok</button>
                        </form>
                    </div>

                    <div class="bg-white p-6 rounded-xl border border-blue-200 shadow-sm md:col-span-2">
                        <h3 class="text-sm font-bold text-blue-900 mb-4">Purok List & Resident Population</h3>
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="border-b text-blue-900 text-[11px] uppercase font-bold">
                                    <th class="py-2">Purok Name</th>
                                    <th class="py-2">Resident Count</th>
                                    <th class="py-2">Description</th>
                                </tr>
                            </thead>
                            <tbody>\${rows || '<tr><td colspan="3" class="text-center py-4 text-xs text-slate-400">No puroks defined.</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            \`;

            document.getElementById('addPurokForm').onsubmit = async (e) => {
                e.preventDefault();
                const res = await api('/puroks', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: document.getElementById('purokName').value,
                        description: document.getElementById('purokDesc').value
                    })
                });
                alert(res.message);
                setStaffTab('puroks');
            };
        }

        /* ==========================================================================
           6. CERTIFICATES, QR SCANNER, BLOTTER, APPOINTMENTS, ANNOUNCEMENTS
           ========================================================================== */
        async function renderCertificateManagement(container) {
            const requests = await api('/certificates/requests');
            
            let rows = requests.map(c => \`
                <tr class="border-b border-slate-100 hover:bg-emerald-50/20 text-xs">
                    <td class="py-3 px-2 font-mono font-bold text-blue-900">\${c.request_number}</td>
                    <td class="py-3 px-2 font-bold text-slate-800">\${c.residents ? c.residents.first_name + ' ' + c.residents.last_name : 'N/A'}</td>
                    <td class="py-3 px-2 font-bold text-emerald-700">\${c.certificate_type}</td>
                    <td class="py-3 px-2">\${c.purpose}</td>
                    <td class="py-3 px-2 font-semibold text-blue-800">\${c.status}</td>
                    <td class="py-3 px-2 text-right">
                        \${c.status === 'PENDING' ? \`
                            <button type="button" onclick="openCertUploadModal('\${c.id}')" class="px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 font-bold">Approve & Upload File</button>
                        \` : \`<span class="text-slate-400 font-medium">Processed</span>\`}
                    </td>
                </tr>
            \`).join('');

            container.innerHTML = \`
                <div class="bg-white rounded-xl shadow-sm border border-blue-200 p-6">
                    <h3 class="text-sm font-bold text-blue-900 mb-4">Pending & Approved Certificate Requests</h3>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="border-b border-blue-200 text-blue-900 text-[11px] uppercase font-bold tracking-wider">
                                    <th class="py-2">Req #</th>
                                    <th class="py-2">Resident</th>
                                    <th class="py-2">Certificate Type</th>
                                    <th class="py-2">Purpose</th>
                                    <th class="py-2">Status</th>
                                    <th class="py-2 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>\${rows || '<tr><td colspan="6" class="text-center py-4 text-xs text-slate-400">No certificate requests found.</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            \`;
        }

        function openCertUploadModal(requestId) {
            const modal = \`
                <div id="certModal" class="fixed inset-0 bg-blue-950/40 flex items-center justify-center p-4 z-50">
                    <div class="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-emerald-500">
                        <h3 class="text-sm font-bold text-blue-900 mb-4">Upload Official Certificate Document</h3>
                        <form id="certUploadForm" class="space-y-4 text-xs">
                            <input type="hidden" name="requestId" value="\${requestId}">
                            <div>
                                <label class="block font-semibold mb-1">Select Signed Certificate (PDF or Image)</label>
                                <input type="file" name="certificate_file" required accept="application/pdf,image/*" class="w-full p-2 border rounded">
                            </div>
                            <div class="flex gap-2 pt-2">
                                <button type="submit" class="flex-1 py-2 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700">Upload & Approve</button>
                                <button type="button" onclick="document.getElementById('certModal').remove()" class="px-4 py-2 bg-slate-200 text-slate-700 rounded font-bold">Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            \`;
            document.body.insertAdjacentHTML('beforeend', modal);

            document.getElementById('certUploadForm').onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const res = await api('/certificates/approve', { method: 'POST', body: formData });
                alert(res.message);
                document.getElementById('certModal').remove();
                setStaffTab('certificates');
            };
        }

        function renderQRScanner(container) {
            container.innerHTML = \`
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="bg-white p-6 rounded-xl border border-emerald-500 shadow-sm">
                        <h3 class="text-sm font-bold text-blue-900 mb-4"><i class="fa-solid fa-camera mr-2 text-emerald-600"></i> Scan Resident QR Code</h3>
                        <div id="reader" class="w-full rounded-lg overflow-hidden border border-blue-200"></div>
                    </div>
                    <div class="bg-white p-6 rounded-xl border border-blue-200 shadow-sm">
                        <h3 class="text-sm font-bold text-blue-900 mb-4"><i class="fa-solid fa-box-archive mr-2 text-blue-600"></i> Pending Claims for Release</h3>
                        <div id="claimResultArea" class="text-xs text-slate-500">
                            Scan a valid Resident QR code to display documents ready for release.
                        </div>
                    </div>
                </div>
            \`;

            try {
                const html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
                html5QrcodeScanner.render(async (decodedText) => {
                    const parts = decodedText.split('/verify/resident/');
                    if (parts.length > 1) {
                        const residentId = parts[1];
                        const data = await api(\`/qr/claim-info/\${residentId}\`);
                        renderClaimResult(data);
                    } else {
                        alert("Invalid QR format scanned.");
                    }
                });
            } catch(e) {}
        }

        function renderClaimResult(data) {
            const container = document.getElementById('claimResultArea');
            if (!data.claims || data.claims.length === 0) {
                container.innerHTML = \`
                    <div class="p-4 bg-emerald-50 text-emerald-900 border border-emerald-300 rounded-lg">
                        <p class="font-bold">\${data.resident.first_name} \${data.resident.last_name}</p>
                        <p>ID: \${data.resident.resident_number}</p>
                        <hr class="my-2 border-emerald-200">
                        <p class="text-xs">No pending requests ready for release.</p>
                    </div>
                \`;
                return;
            }

            let list = data.claims.map(c => \`
                <div class="p-3 border rounded-lg flex justify-between items-center bg-white mb-2 border-blue-200">
                    <div>
                        <p class="font-bold text-blue-900">\${c.certificate_type}</p>
                        <small class="text-slate-500">Req #: \${c.request_number}</small>
                    </div>
                    <button type="button" onclick="releaseClaim('\${c.id}')" class="px-3 py-1 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700">Mark Released</button>
                </div>
            \`).join('');

            container.innerHTML = \`
                <div class="space-y-3">
                    <div class="p-3 bg-blue-900 text-white rounded-lg font-bold">
                        Resident: \${data.resident.first_name} \${data.resident.last_name} (\${data.resident.resident_number})
                    </div>
                    \${list}
                </div>
            \`;
        }

        async function releaseClaim(requestId) {
            const res = await api('/qr/release-claim', {
                method: 'POST',
                body: JSON.stringify({ requestId })
            });
            alert(res.message);
            setStaffTab('qrscanner');
        }

        async function renderBlotterManagement(container) {
            const cases = await api('/blotter');
            let rows = cases.map(c => \`
                <tr class="border-b text-xs">
                    <td class="py-3 px-2 font-bold font-mono text-blue-800">\${c.case_number}</td>
                    <td class="py-3 px-2 font-bold text-slate-800">\${c.complainant_name}</td>
                    <td class="py-3 px-2">\${c.respondent_name}</td>
                    <td class="py-3 px-2">\${c.incident_date} \${c.incident_time || ''}</td>
                    <td class="py-3 px-2">\${c.location || 'N/A'}</td>
                </tr>
            \`).join('');

            container.innerHTML = \`
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="bg-white p-6 rounded-xl border border-blue-500 shadow-sm">
                        <h3 class="text-sm font-bold text-blue-900 mb-4">Record Incident / Blotter</h3>
                        <form id="addBlotterForm" class="space-y-3 text-xs">
                            <div><label class="font-bold">Complainant Name *</label><input type="text" id="blComplainant" required class="w-full p-2 border rounded mt-1"></div>
                            <div><label class="font-bold">Respondent Name *</label><input type="text" id="blRespondent" required class="w-full p-2 border rounded mt-1"></div>
                            <div><label class="font-bold">Witness Name</label><input type="text" id="blWitness" class="w-full p-2 border rounded mt-1"></div>
                            <div class="grid grid-cols-2 gap-2">
                                <div><label class="font-bold">Date *</label><input type="date" id="blDate" required class="w-full p-2 border rounded mt-1"></div>
                                <div><label class="font-bold">Time</label><input type="time" id="blTime" class="w-full p-2 border rounded mt-1"></div>
                            </div>
                            <div><label class="font-bold">Location *</label><input type="text" id="blLocation" required class="w-full p-2 border rounded mt-1"></div>
                            <div><label class="font-bold">Incident Description *</label><textarea id="blDesc" required class="w-full p-2 border rounded mt-1" rows="3"></textarea></div>
                            <button type="submit" class="w-full py-2 bg-blue-900 text-white font-bold rounded hover:bg-blue-950">Save Blotter Record</button>
                        </form>
                    </div>

                    <div class="bg-white p-6 rounded-xl border border-emerald-500 shadow-sm md:col-span-2">
                        <h3 class="text-sm font-bold text-blue-900 mb-4">Recorded Incidents</h3>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left border-collapse">
                                <thead>
                                    <tr class="border-b text-blue-900 text-[11px] uppercase font-bold">
                                        <th class="py-2">Case #</th>
                                        <th class="py-2">Complainant</th>
                                        <th class="py-2">Respondent</th>
                                        <th class="py-2">Date & Time</th>
                                        <th class="py-2">Location</th>
                                    </tr>
                                </thead>
                                <tbody>\${rows || '<tr><td colspan="5" class="text-center py-4 text-xs text-slate-400">No blotter cases recorded.</td></tr>'}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            \`;

            document.getElementById('addBlotterForm').onsubmit = async (e) => {
                e.preventDefault();
                const res = await api('/blotter', {
                    method: 'POST',
                    body: JSON.stringify({
                        complainantName: document.getElementById('blComplainant').value,
                        respondentName: document.getElementById('blRespondent').value,
                        witnessName: document.getElementById('blWitness').value,
                        incidentDate: document.getElementById('blDate').value,
                        incidentTime: document.getElementById('blTime').value,
                        location: document.getElementById('blLocation').value,
                        description: document.getElementById('blDesc').value
                    })
                });
                alert(res.message);
                setStaffTab('blotter');
            };
        }

        async function renderAppointmentManagement(container) {
            const appts = await api('/appointments');
            let rows = appts.map(a => \`
                <tr class="border-b text-xs">
                    <td class="py-3 px-2 font-mono font-bold text-blue-800">\${a.appointment_number}</td>
                    <td class="py-3 px-2 font-bold">\${a.residents ? a.residents.first_name + ' ' + a.residents.last_name : 'N/A'}</td>
                    <td class="py-3 px-2 font-semibold text-emerald-700">\${a.service_type}</td>
                    <td class="py-3 px-2">\${a.appointment_date} \${a.appointment_time || ''}</td>
                    <td class="py-3 px-2 font-bold">\${a.status}</td>
                </tr>
            \`).join('');

            container.innerHTML = \`
                <div class="bg-white p-6 rounded-xl border border-blue-200 shadow-sm">
                    <h3 class="text-sm font-bold text-blue-900 mb-4">Scheduled Resident Appointments</h3>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="border-b text-blue-900 text-[11px] uppercase font-bold">
                                    <th class="py-2">Appt #</th>
                                    <th class="py-2">Resident</th>
                                    <th class="py-2">Service Requested</th>
                                    <th class="py-2">Date & Time</th>
                                    <th class="py-2">Status</th>
                                </tr>
                            </thead>
                            <tbody>\${rows || '<tr><td colspan="5" class="text-center py-4 text-xs text-slate-400">No appointments scheduled.</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            \`;
        }

        async function renderAnnouncementManagement(container) {
            const list = await api('/announcements');
            let rows = list.map(a => \`
                <tr class="border-b text-xs">
                    <td class="py-3 px-2 font-bold text-slate-800">\${a.title}</td>
                    <td class="py-3 px-2 font-bold text-emerald-700">\${a.priority}</td>
                    <td class="py-3 px-2">\${new Date(a.created_at).toLocaleDateString()}</td>
                </tr>
            \`).join('');

            container.innerHTML = \`
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="bg-white p-6 rounded-xl border border-emerald-500 shadow-sm">
                        <h3 class="text-sm font-bold text-blue-900 mb-4">Post Announcement</h3>
                        <form id="addAnnounceForm" class="space-y-3 text-xs">
                            <div><label class="font-bold">Title *</label><input type="text" name="title" required class="w-full p-2 border rounded mt-1"></div>
                            <div><label class="font-bold">Priority</label>
                                <select name="priority" class="w-full p-2 border rounded mt-1">
                                    <option value="Normal">Normal</option>
                                    <option value="Important">Important</option>
                                    <option value="Urgent">Urgent</option>
                                </select>
                            </div>
                            <div><label class="font-bold">Banner Image</label><input type="file" name="image" accept="image/*" class="w-full p-2 border rounded mt-1"></div>
                            <div><label class="font-bold">Content Details *</label><textarea name="content" required class="w-full p-2 border rounded mt-1" rows="4"></textarea></div>
                            <button type="submit" class="w-full py-2 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700">Publish Announcement</button>
                        </form>
                    </div>

                    <div class="bg-white p-6 rounded-xl border border-blue-200 shadow-sm md:col-span-2">
                        <h3 class="text-sm font-bold text-blue-900 mb-4">Published Bulletins</h3>
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="border-b text-blue-900 text-[11px] uppercase font-bold">
                                    <th class="py-2">Title</th>
                                    <th class="py-2">Priority</th>
                                    <th class="py-2">Date Published</th>
                                </tr>
                            </thead>
                            <tbody>\${rows || '<tr><td colspan="3" class="text-center py-4 text-xs text-slate-400">No announcements published.</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            \`;

            document.getElementById('addAnnounceForm').onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const res = await api('/announcements', { method: 'POST', body: formData });
                alert(res.message);
                setStaffTab('announcements');
            };
        }

        async function renderActivityLogs(container) {
            const logs = await api('/logs');
            let rows = logs.map(l => \`
                <tr class="border-b text-xs">
                    <td class="py-2 px-2 text-slate-500">\${new Date(l.created_at).toLocaleString()}</td>
                    <td class="py-2 px-2 font-bold text-slate-800">\${l.user_name || 'System'}</td>
                    <td class="py-2 px-2 font-mono font-semibold text-emerald-700">\${l.action}</td>
                    <td class="py-2 px-2 text-slate-600">\${l.details || ''}</td>
                </tr>
            \`).join('');

            container.innerHTML = \`
                <div class="bg-white p-6 rounded-xl border border-blue-200 shadow-sm">
                    <h3 class="text-sm font-bold text-blue-900 mb-4">System Activity Audit Trail</h3>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="border-b text-blue-900 text-[11px] uppercase font-bold">
                                    <th class="py-2">Timestamp</th>
                                    <th class="py-2">User</th>
                                    <th class="py-2">Action</th>
                                    <th class="py-2">Details</th>
                                </tr>
                            </thead>
                            <tbody>\${rows || '<tr><td colspan="4" class="text-center py-4 text-xs text-slate-400">No activity logs found.</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            \`;
        }

        /* ==========================================================================
           7. ID BATCH PRINTING (NATIONAL ID STYLE - WITH CUSTOM BG IMAGE)
           ========================================================================== */
        async function renderIDBatchPrint(container) {
            const residents = await api('/residents?status=ACTIVE');
            const brgyName = state.settings.barangay_name || 'BARANGAY CENTRAL';
            const captain = state.settings.barangay_captain || 'BARANGAY CAPTAIN';
            const logo = state.settings.barangay_logo || '';

            let cards = residents.map(r => \`
                <div class="id-card-national">
                    <!-- Top Header -->
                    <div class="flex items-center justify-between border-b border-emerald-600/50 pb-1">
                        <div class="flex items-center gap-1.5">
                            \${logo ? \`<img src="\${logo}" class="w-6 h-6 rounded-full bg-white p-0.5 border border-emerald-600">\` : \`<i class="fa-solid fa-building-columns text-emerald-700 text-xs"></i>\`}
                            <div class="leading-none">
                                <span class="text-[5px] text-slate-600 block uppercase font-bold tracking-widest">REPUBLIC OF THE PHILIPPINES</span>
                                <h4 class="font-extrabold text-[7.5pt] text-blue-900 uppercase tracking-tighter leading-tight">\${brgyName}</h4>
                            </div>
                        </div>
                        <span class="text-[5.5pt] font-black bg-emerald-700 text-white px-1.5 py-0.5 rounded tracking-wider uppercase">RESIDENT CARD / BRGY ID</span>
                    </div>

                    <!-- Middle Content (No Wasted Space) -->
                    <div class="grid grid-cols-12 gap-1.5 items-center my-0.5">
                        <!-- Left Resident Photo -->
                        <div class="col-span-4 flex flex-col items-center">
                            <img src="\${r.photo_url || 'https://via.placeholder.com/100'}" class="w-16 h-16 object-cover rounded border-2 border-emerald-600 shadow-sm bg-white">
                            <span class="text-[5pt] font-mono font-extrabold text-blue-900 mt-0.5 bg-blue-50 px-1 rounded border border-blue-200">\${r.resident_number || 'BRGY-2026-0000'}</span>
                        </div>

                        <!-- Center Resident Details -->
                        <div class="col-span-5 text-[6.5pt] leading-tight space-y-0.5 font-bold text-slate-800">
                            <div><span class="text-[4.5pt] text-slate-500 block uppercase">Last Name</span> \${r.last_name.toUpperCase()}</div>
                            <div><span class="text-[4.5pt] text-slate-500 block uppercase">First Name</span> \${r.first_name.toUpperCase()} \${r.suffix || ''}</div>
                            <div class="grid grid-cols-2 gap-0.5">
                                <div><span class="text-[4.5pt] text-slate-500 block uppercase">DOB</span> \${r.date_of_birth}</div>
                                <div><span class="text-[4.5pt] text-slate-500 block uppercase">Sex</span> \${r.gender}</div>
                            </div>
                            <div><span class="text-[4.5pt] text-slate-500 block uppercase">Address / Purok</span> \${r.puroks ? r.puroks.name : 'Purok'}\${r.address ? ', ' + r.address : ''}</div>
                        </div>

                        <!-- Right Large QR Code -->
                        <div class="col-span-3 flex flex-col items-center justify-center border-l border-slate-200 pl-1">
                            \${r.qr_code_url ? \`<img src="\${r.qr_code_url}" class="w-14 h-14 border border-emerald-500 rounded p-0.5 bg-white shadow-sm">\` : \`<div class="w-14 h-14 bg-slate-200 flex items-center justify-center text-[5pt]">No QR</div>\`}
                            <span class="text-[4pt] text-slate-500 text-center font-bold mt-0.5">SCAN TO VERIFY</span>
                        </div>
                    </div>

                    <!-- Bottom Footer & Signature -->
                    <div class="border-t border-emerald-600/50 pt-0.5 flex justify-between items-end text-[5pt] text-slate-600 font-bold">
                        <div>
                            <span class="text-emerald-800">Official Resident Identity Document</span>
                        </div>
                        <div class="text-right leading-none">
                            <span class="underline uppercase text-slate-900 font-extrabold">\${captain.toUpperCase()}</span><br>
                            <span class="text-[4pt] text-slate-500">PUNONG BARANGAY</span>
                        </div>
                    </div>
                </div>
            \`).join('');

            container.innerHTML = \`
                <div class="mb-4 no-print flex justify-between items-center bg-white p-4 rounded-xl border border-blue-200">
                    <div>
                        <h4 class="font-bold text-blue-900">National ID Style Layout Batch Printing</h4>
                        <p class="text-xs text-slate-500">Prints high-density Resident Cards using custom requested image background.</p>
                    </div>
                    <button type="button" onclick="window.print()" class="px-5 py-2.5 bg-emerald-600 text-white font-bold rounded-lg shadow hover:bg-emerald-700">
                        <i class="fa-solid fa-print mr-2"></i> Print Layout
                    </button>
                </div>
                <div id="printableArea">
                    <div class="id-grid-container">
                        \${cards || '<p class="text-slate-400 text-xs">No active residents to print IDs for.</p>'}
                    </div>
                </div>
            \`;
        }

        /* ==========================================================================
           8. SYSTEM SETTINGS
           ========================================================================== */
        function renderSystemSettings(container) {
            const s = state.settings;
            container.innerHTML = \`
                <div class="bg-white p-6 rounded-xl border border-blue-200 max-w-2xl shadow-sm">
                    <form id="settingsForm" class="space-y-4 text-xs">
                        <div>
                            <label class="font-bold text-blue-900">Barangay Name</label>
                            <input type="text" name="barangay_name" value="\${s.barangay_name || ''}" class="w-full p-2 border rounded mt-1">
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="font-bold text-blue-900">Municipality</label>
                                <input type="text" name="municipality" value="\${s.municipality || ''}" class="w-full p-2 border rounded mt-1">
                            </div>
                            <div>
                                <label class="font-bold text-blue-900">Province</label>
                                <input type="text" name="province" value="\${s.province || ''}" class="w-full p-2 border rounded mt-1">
                            </div>
                        </div>
                        <div>
                            <label class="font-bold text-blue-900">Barangay Captain</label>
                            <input type="text" name="barangay_captain" value="\${s.barangay_captain || ''}" class="w-full p-2 border rounded mt-1">
                        </div>
                        <div>
                            <label class="font-bold text-blue-900">Barangay Logo</label>
                            <input type="file" name="barangay_logo" accept="image/*" class="w-full p-2 border rounded mt-1">
                        </div>
                        <button type="submit" class="w-full py-2 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700">Save System Settings</button>
                    </form>
                </div>
            \`;

            document.getElementById('settingsForm').onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const res = await api('/settings', { method: 'POST', body: formData });
                alert(res.message);
                initApp();
            };
        }

        /* ==========================================================================
           9. RESIDENT PORTAL RENDER
           ========================================================================== */
        function renderResidentPortal() {
            const app = document.getElementById('app');
            const res = state.resident;
            const brgyName = state.settings.barangay_name || 'BARANGAY CENTRAL';

            app.innerHTML = \`
                <div class="min-h-screen bg-white text-slate-800 flex flex-col">
                    <header class="bg-gradient-to-r from-blue-900 to-emerald-700 text-white px-6 py-4 flex justify-between items-center shadow-md">
                        <div class="flex items-center gap-2">
                            <i class="fa-solid fa-house-user text-emerald-400"></i>
                            <h1 class="font-bold text-lg">\${brgyName} - Resident Portal</h1>
                        </div>
                        <button type="button" onclick="logout()" class="text-xs bg-emerald-800 hover:bg-emerald-900 px-3 py-1.5 rounded font-bold">Logout</button>
                    </header>

                    <div class="max-w-4xl w-full mx-auto p-6 flex-1">
                        <div class="bg-white border border-blue-200 rounded-xl shadow-sm p-6 mb-6 flex items-center gap-4">
                            <img src="\${res ? res.photo_url : ''}" class="w-16 h-16 rounded-full object-cover border-2 border-emerald-600 bg-white shadow">
                            <div>
                                <h2 class="text-xl font-bold text-blue-900">\${state.user.fullName}</h2>
                                <p class="text-xs text-emerald-700 font-mono font-bold">ID: \${res ? res.resident_number : 'N/A'}</p>
                            </div>
                        </div>

                        <div class="flex border-b border-blue-200 mb-6 font-bold text-sm">
                            <button type="button" onclick="setResTab('profile')" id="btnResTabProf" class="py-2 px-4 text-emerald-600 border-b-2 border-emerald-600">My Profile</button>
                            <button type="button" onclick="setResTab('request')" id="btnResTabReq" class="py-2 px-4 text-slate-400 border-b-2 border-transparent">Request Clearance</button>
                            <button type="button" onclick="setResTab('appointment')" id="btnResTabAppt" class="py-2 px-4 text-slate-400 border-b-2 border-transparent">Schedule Appointment</button>
                        </div>

                        <div id="resPortalContent"></div>
                    </div>
                </div>
            \`;

            setResTab('profile');
        }

        async function setResTab(tab) {
            state.resActiveTab = tab;
            const container = document.getElementById('resPortalContent');
            const res = state.resident;

            if (tab === 'profile') {
                container.innerHTML = \`
                    <div class="bg-white border border-blue-200 rounded-xl p-6 shadow-sm space-y-3 text-xs">
                        <h3 class="font-bold text-sm text-blue-900 border-b pb-2">Resident Record Details</h3>
                        <div class="grid grid-cols-2 gap-4">
                            <div><span class="text-slate-500 font-semibold">Civil Status:</span> <p class="font-bold">\${res ? res.civil_status : 'N/A'}</p></div>
                            <div><span class="text-slate-500 font-semibold">Voter Status:</span> <p class="font-bold">\${res ? res.voter_status : 'N/A'}</p></div>
                            <div><span class="text-slate-500 font-semibold">Address:</span> <p class="font-bold">\${res ? res.address : 'N/A'}</p></div>
                            <div><span class="text-slate-500 font-semibold">Contact:</span> <p class="font-bold">\${res ? res.contact_number : 'N/A'}</p></div>
                        </div>
                    </div>
                \`;
            } else if (tab === 'request') {
                container.innerHTML = \`
                    <div class="bg-white border border-emerald-500 rounded-xl p-6 shadow-sm max-w-md mx-auto">
                        <h3 class="font-bold text-sm text-blue-900 mb-4">Request Official Barangay Document</h3>
                        <form id="resReqForm" class="space-y-3 text-xs">
                            <div>
                                <label class="font-bold">Document Type *</label>
                                <select id="certType" required class="w-full p-2 border rounded mt-1">
                                    <option value="Barangay Clearance">Barangay Clearance</option>
                                    <option value="Certificate of Residency">Certificate of Residency</option>
                                    <option value="Certificate of Indigency">Certificate of Indigency</option>
                                    <option value="First Time Job Seeker">First Time Job Seeker Clearance</option>
                                </select>
                            </div>
                            <div>
                                <label class="font-bold">Purpose *</label>
                                <textarea id="certPurpose" required class="w-full p-2 border rounded mt-1" rows="3"></textarea>
                            </div>
                            <button type="submit" class="w-full py-2 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700">Submit Clearance Request</button>
                        </form>
                    </div>
                \`;

                document.getElementById('resReqForm').onsubmit = async (e) => {
                    e.preventDefault();
                    const response = await api('/certificates/request', {
                        method: 'POST',
                        body: JSON.stringify({
                            certificateType: document.getElementById('certType').value,
                            purpose: document.getElementById('certPurpose').value
                        })
                    });
                    alert(response.message);
                    setResTab('profile');
                };
            } else if (tab === 'appointment') {
                container.innerHTML = \`
                    <div class="bg-white border border-emerald-500 rounded-xl p-6 shadow-sm max-w-md mx-auto">
                        <h3 class="font-bold text-sm text-blue-900 mb-4">Schedule Desk Appointment</h3>
                        <form id="resApptForm" class="space-y-3 text-xs">
                            <div>
                                <label class="font-bold">Service Category *</label>
                                <select id="aptType" required class="w-full p-2 border rounded mt-1">
                                    <option value="Barangay Consultation">Barangay Consultation</option>
                                    <option value="Lupong Tagapamayapa Inquiry">Lupong Tagapamayapa Inquiry</option>
                                    <option value="Financial Assistance Application">Financial Assistance Application</option>
                                </select>
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                                <div><label class="font-bold">Date *</label><input type="date" id="aptDate" required class="w-full p-2 border rounded mt-1"></div>
                                <div><label class="font-bold">Time *</label><input type="time" id="aptTime" required class="w-full p-2 border rounded mt-1"></div>
                            </div>
                            <div>
                                <label class="font-bold">Purpose Details *</label>
                                <textarea id="aptPurpose" required class="w-full p-2 border rounded mt-1" rows="3"></textarea>
                            </div>
                            <button type="submit" class="w-full py-2 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700">Submit Appointment Schedule</button>
                        </form>
                    </div>
                \`;

                document.getElementById('resApptForm').onsubmit = async (e) => {
                    e.preventDefault();
                    const response = await api('/appointments', {
                        method: 'POST',
                        body: JSON.stringify({
                            serviceType: document.getElementById('aptType').value,
                            appointmentDate: document.getElementById('aptDate').value,
                            appointmentTime: document.getElementById('aptTime').value,
                            purpose: document.getElementById('aptPurpose').value
                        })
                    });
                    alert(response.message);
                    setResTab('profile');
                };
            }
        }

        // Global Logout Function
        function logout() {
            localStorage.clear();
            state.token = null;
            state.user = null;
            state.resident = null;
            renderLogin();
        }

        // App Entrypoint Launch
        window.onload = initApp;
    </script>
</body>
</html>
    `);
});

/* ==========================================================================
   SERVER INITIALIZATION
   ========================================================================== */
app.listen(PORT, () => {
    console.log(`===========================================================`);
    console.log(`BRMS System running actively on http://localhost:${PORT}`);
    console.log(`System color scheme tuned to Blue, Green, & White.`);
    console.log(`===========================================================`);
});
