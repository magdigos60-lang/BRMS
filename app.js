/**
 * BARANGAY RESIDENT MANAGEMENT SYSTEM
 * Complete Monolithic Application
 * Language: JavaScript (Node.js, Express.js)
 * Database & Auth: Supabase
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'barangay_secret_jwt_key_2026_super_secure';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage() });

// --- MIDDLEWARES ---

async function authenticateToken(req, res, next) {
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
            return res.status(403).json({ success: false, message: 'Access denied. Insufficient permissions.' });
        }
        next();
    };
}

async function logActivity(userId, userName, action, description) {
    try {
        await supabase.from('activity_logs').insert([{
            user_id: userId || null,
            user_name: userName || 'System',
            action,
            description,
            created_at: new Date()
        }]);
    } catch (e) {
        console.error('Error logging activity:', e);
    }
}

async function createNotification(userId, title, message, type = 'INFO') {
    try {
        await supabase.from('notifications').insert([{
            user_id: userId,
            title,
            message,
            type,
            is_read: false,
            created_at: new Date()
        }]);
    } catch (e) {
        console.error('Error creating notification:', e);
    }
}

async function uploadToSupabase(file, folder = 'uploads') {
    if (!file) return '';
    try {
        const fileExt = file.originalname.split('.').pop();
        const fileName = `${folder}/${uuidv4()}.${fileExt}`;
        const { data, error } = await supabase.storage.from('barangay-files').upload(fileName, file.buffer, {
            contentType: file.mimetype,
            upsert: true
        });
        if (error) {
            console.error('Supabase upload error:', error);
            return '';
        }
        const { data: publicUrlData } = supabase.storage.from('barangay-files').getPublicUrl(fileName);
        return publicUrlData.publicUrl;
    } catch (err) {
        console.error('File storage upload failure:', err);
        return '';
    }
}

// --- API ENDPOINTS ---

// Check Setup Status & First Time Setup
app.get('/api/setup/status', async (req, res) => {
    try {
        const { data: admins, error } = await supabase.from('users').select('id').eq('role', 'ADMIN');
        if (error) throw error;
        const { data: settings } = await supabase.from('settings').select('*').limit(1).single();
        res.json({
            success: true,
            hasAdmin: admins && admins.length > 0,
            settings: settings || {}
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/setup/admin', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        const { data: existingAdmin } = await supabase.from('users').select('id').eq('role', 'ADMIN');
        if (existingAdmin && existingAdmin.length > 0) {
            return res.status(400).json({ success: false, message: 'Administrator already exists. Please log in.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const { data: user, error } = await supabase.from('users').insert([{
            name,
            email,
            password: hashedPassword,
            role: 'ADMIN',
            status: 'ACTIVE'
        }]).select().single();

        if (error) throw error;

        await logActivity(user.id, user.name, 'INITIAL_SETUP', 'Created initial system administrator account.');

        res.json({ success: true, message: 'Administrator account created successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Authentication
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required.' });

        const { data: user, error } = await supabase.from('users').select('*').eq('email', email).single();
        if (error || !user) return res.status(400).json({ success: false, message: 'Invalid email or password.' });

        if (user.status !== 'ACTIVE') {
            return res.status(403).json({ success: false, message: 'Your account is deactivated or pending.' });
        }

        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(400).json({ success: false, message: 'Invalid email or password.' });

        let residentData = null;
        if (user.role === 'RESIDENT') {
            const { data: resi } = await supabase.from('residents').select('*').eq('user_id', user.id).single();
            residentData = resi;
        }

        const token = jwt.sign({
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
            residentId: residentData ? residentData.id : null
        }, JWT_SECRET, { expiresIn: '24h' });

        await logActivity(user.id, user.name, 'USER_LOGIN', `User ${user.email} logged in.`);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                resident: residentData
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Resident Public Registration
app.post('/api/auth/register-resident', upload.single('photo'), async (req, res) => {
    try {
        const {
            firstName, middleName, lastName, suffix, birthDate, gender, civilStatus,
            nationality, religion, occupation, educationalAttainment, contactNumber,
            email, address, purok, voterStatus, password
        } = req.body;

        if (!firstName || !lastName || !birthDate || !gender || !contactNumber || !email || !password) {
            return res.status(400).json({ success: false, message: 'Required fields are missing.' });
        }

        const { data: existingUser } = await supabase.from('users').select('id').eq('email', email).single();
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email address is already registered.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const { data: user, error: uErr } = await supabase.from('users').insert([{
            name: `${firstName} ${lastName}`,
            email,
            password: hashedPassword,
            role: 'RESIDENT',
            status: 'ACTIVE'
        }]).select().single();

        if (uErr) throw uErr;

        let photoUrl = '';
        if (req.file) {
            photoUrl = await uploadToSupabase(req.file, 'residents');
        }

        const bDate = new Date(birthDate);
        const age = new Date().getFullYear() - bDate.getFullYear();

        const { data: resident, error: rErr } = await supabase.from('residents').insert([{
            user_id: user.id,
            first_name: firstName,
            middle_name: middleName || '',
            last_name: lastName,
            suffix: suffix || '',
            birth_date: birthDate,
            age,
            gender,
            civil_status: civilStatus,
            nationality: nationality || 'Filipino',
            occupation: occupation || 'N/A',
            educational_attainment: educationalAttainment || 'N/A',
            religion: religion || 'N/A',
            contact_number: contactNumber,
            email,
            address,
            purok,
            voter_status: voterStatus || 'NON-VOTER',
            resident_status: 'ACTIVE',
            photo: photoUrl,
            approval_status: 'PENDING'
        }]).select().single();

        if (rErr) throw rErr;

        await logActivity(user.id, user.name, 'RESIDENT_REGISTER', 'New resident submitted registration application.');

        res.json({
            success: true,
            message: 'Registration submitted successfully! Your application is waiting for barangay staff approval.'
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get Current System Settings
app.get('/api/settings', async (req, res) => {
    try {
        const { data, error } = await supabase.from('settings').select('*').limit(1).single();
        if (error && error.code !== 'PGRST116') throw error;
        res.json({ success: true, settings: data || {} });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Update System Settings (Admin/Staff)
app.post('/api/settings', authenticateToken, requireRole(['ADMIN', 'SECRETARY']), upload.single('logo'), async (req, res) => {
    try {
        const { barangayName, municipality, province, address, contactNumber, email, primaryColor, secondaryColor } = req.body;
        
        let logoUrl = req.body.existingLogoUrl || '';
        if (req.file) {
            logoUrl = await uploadToSupabase(req.file, 'branding');
        }

        const { data: existing } = await supabase.from('settings').select('id').limit(1).single();

        let result;
        if (existing) {
            result = await supabase.from('settings').update({
                barangay_name: barangayName,
                municipality,
                province,
                address,
                contact_number: contactNumber,
                email,
                logo_url: logoUrl,
                primary_color: primaryColor,
                secondary_color: secondaryColor,
                updated_at: new Date()
            }).eq('id', existing.id).select().single();
        } else {
            result = await supabase.from('settings').insert([{
                barangay_name: barangayName,
                municipality,
                province,
                address,
                contact_number: contactNumber,
                email,
                logo_url: logoUrl,
                primary_color: primaryColor,
                secondary_color: secondaryColor
            }]).select().single();
        }

        await logActivity(req.user.id, req.user.name, 'UPDATE_SETTINGS', 'Updated barangay system branding & configuration.');

        res.json({ success: true, message: 'Settings updated successfully.', settings: result.data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Dashboard Statistics (Staff)
app.get('/api/staff/dashboard-stats', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
    try {
        const { count: totalResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('approval_status', 'APPROVED').neq('resident_status', 'ARCHIVED');
        const { count: pendingResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('approval_status', 'PENDING');
        const { count: totalHouseholds } = await supabase.from('households').select('*', { count: 'exact', head: true }).neq('status', 'ARCHIVED');
        const { count: maleResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('gender', 'Male').eq('approval_status', 'APPROVED');
        const { count: femaleResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('gender', 'Female').eq('approval_status', 'APPROVED');
        
        const { data: seniorData } = await supabase.from('residents').select('id').gte('age', 60).eq('approval_status', 'APPROVED');
        const seniorCitizens = seniorData ? seniorData.length : 0;

        const { count: pendingCerts } = await supabase.from('certificate_requests').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');
        const { count: pendingAppts } = await supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');
        const { count: openBlotters } = await supabase.from('blotter').select('*', { count: 'exact', head: true }).in('status', ['OPEN', 'UNDER_INVESTIGATION']);

        const { data: purokList } = await supabase.from('residents').select('purok').eq('approval_status', 'APPROVED');
        const purokStats = {};
        if (purokList) {
            purokList.forEach(r => {
                purokStats[r.purok] = (purokStats[r.purok] || 0) + 1;
            });
        }

        res.json({
            success: true,
            stats: {
                totalResidents: totalResidents || 0,
                pendingResidents: pendingResidents || 0,
                totalHouseholds: totalHouseholds || 0,
                maleResidents: maleResidents || 0,
                femaleResidents: femaleResidents || 0,
                seniorCitizens,
                pendingCerts: pendingCerts || 0,
                pendingAppts: pendingAppts || 0,
                openBlotters: openBlotters || 0,
                purokStats
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Resident Approval System
app.get('/api/staff/pending-residents', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
    try {
        const { data, error } = await supabase.from('residents').select('*').eq('approval_status', 'PENDING').order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, residents: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/staff/approve-resident/:id', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
    try {
        const residentId = req.params.id;
        const year = new Date().getFullYear();

        const { count } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('approval_status', 'APPROVED');
        const nextNum = String((count || 0) + 1).padStart(6, '0');
        const officialResidentId = `BRGY-${year}-${nextNum}`;
        const qrToken = `BRGY-VERIFY-${uuidv4().substring(0, 12).toUpperCase()}`;

        const { data: resident, error } = await supabase.from('residents').update({
            approval_status: 'APPROVED',
            resident_id: officialResidentId,
            qr_token: qrToken,
            updated_at: new Date()
        }).eq('id', residentId).select().single();

        if (error) throw error;

        if (resident.user_id) {
            await createNotification(resident.user_id, 'Registration Approved', `Congratulations! Your resident registration has been approved. Resident ID: ${officialResidentId}`);
        }

        await logActivity(req.user.id, req.user.name, 'APPROVE_RESIDENT', `Approved resident application for ${resident.first_name} ${resident.last_name} (${officialResidentId})`);

        res.json({ success: true, message: 'Resident approved successfully.', resident });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/staff/reject-resident/:id', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
    try {
        const residentId = req.params.id;
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason is required.' });

        const { data: resident, error } = await supabase.from('residents').update({
            approval_status: 'REJECTED',
            rejection_reason: reason,
            updated_at: new Date()
        }).eq('id', residentId).select().single();

        if (error) throw error;

        if (resident.user_id) {
            await createNotification(resident.user_id, 'Registration Rejected', `Your resident registration was not approved. Reason: ${reason}`);
        }

        await logActivity(req.user.id, req.user.name, 'REJECT_RESIDENT', `Rejected resident registration for ${resident.first_name} ${resident.last_name}. Reason: ${reason}`);

        res.json({ success: true, message: 'Resident application rejected.', resident });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Resident Management (Staff CRUD)
app.get('/api/staff/residents', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
    try {
        const { search, purok, status, approval } = req.query;
        let query = supabase.from('residents').select('*');

        if (approval) query = query.eq('approval_status', approval);
        else query = query.eq('approval_status', 'APPROVED');

        if (status) query = query.eq('resident_status', status);
        else query = query.neq('resident_status', 'ARCHIVED');

        if (purok) query = query.eq('purok', purok);

        const { data, error } = await query.order('last_name', { ascending: true });
        if (error) throw error;

        let filtered = data || [];
        if (search) {
            const term = search.toLowerCase();
            filtered = filtered.filter(r => 
                r.first_name.toLowerCase().includes(term) ||
                r.last_name.toLowerCase().includes(term) ||
                (r.resident_id && r.resident_id.toLowerCase().includes(term)) ||
                r.address.toLowerCase().includes(term)
            );
        }

        res.json({ success: true, residents: filtered });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/staff/residents/archive/:id', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'INACTIVE', 'MOVED_OUT', 'DECEASED', 'ARCHIVED'
        const newStatus = status || 'ARCHIVED';

        const { data, error } = await supabase.from('residents').update({
            resident_status: newStatus,
            updated_at: new Date()
        }).eq('id', id).select().single();

        if (error) throw error;

        await logActivity(req.user.id, req.user.name, 'ARCHIVE_RESIDENT', `Marked resident ${data.first_name} ${data.last_name} as ${newStatus}.`);

        res.json({ success: true, message: `Resident status updated to ${newStatus}.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Household Management
app.get('/api/households', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
    try {
        const { data, error } = await supabase.from('households').select('*').neq('status', 'ARCHIVED').order('household_number', { ascending: true });
        if (error) throw error;
        res.json({ success: true, households: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/households', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
    try {
        const { householdNumber, householdHead, address, purok, members } = req.body;
        const { data, error } = await supabase.from('households').insert([{
            household_number: householdNumber,
            household_head: householdHead,
            address,
            purok,
            members: parseInt(members) || 1,
            status: 'ACTIVE'
        }]).select().single();

        if (error) throw error;

        await logActivity(req.user.id, req.user.name, 'ADD_HOUSEHOLD', `Added household #${householdNumber}`);
        res.json({ success: true, message: 'Household added successfully.', household: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Certificate Requests & Management
app.get('/api/certificates/requests', authenticateToken, async (req, res) => {
    try {
        let query = supabase.from('certificate_requests').select('*, residents(first_name, last_name, resident_id, photo, purok, address, contact_number)');
        
        if (req.user.role === 'RESIDENT') {
            const { data: resi } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
            if (!resi) return res.json({ success: true, requests: [] });
            query = query.eq('resident_id', resi.id);
        }

        const { data, error } = await query.order('requested_at', { ascending: false });
        if (error) throw error;

        res.json({ success: true, requests: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/certificates/request', authenticateToken, requireRole(['RESIDENT']), async (req, res) => {
    try {
        const { certificateType, purpose } = req.body;
        const { data: resi } = await supabase.from('residents').select('id, approval_status').eq('user_id', req.user.id).single();

        if (!resi || resi.approval_status !== 'APPROVED') {
            return res.status(403).json({ success: false, message: 'Only approved residents can request certificates.' });
        }

        const reqNum = `REQ-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

        const { data, error } = await supabase.from('certificate_requests').insert([{
            request_number: reqNum,
            resident_id: resi.id,
            certificate_type: certificateType,
            purpose,
            status: 'PENDING',
            requested_at: new Date()
        }]).select().single();

        if (error) throw error;

        await logActivity(req.user.id, req.user.name, 'CERTIFICATE_REQUEST', `Requested ${certificateType} (${reqNum})`);

        res.json({ success: true, message: 'Certificate request submitted successfully!', request: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/certificates/update-status/:id', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), upload.single('file'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status, staffRemarks, rejectionReason } = req.body;

        let fileUrl = '';
        if (req.file) {
            fileUrl = await uploadToSupabase(req.file, 'official_certificates');
        }

        const updateData = {
            status,
            staff_remarks: staffRemarks || '',
            rejection_reason: rejectionReason || ''
        };

        if (fileUrl) updateData.file_url = fileUrl;
        if (status === 'APPROVED') updateData.approved_at = new Date();
        if (status === 'READY_FOR_RELEASE') updateData.released_at = new Date();

        const { data: reqDoc, error } = await supabase.from('certificate_requests')
            .update(updateData)
            .eq('id', id)
            .select('*, residents(user_id, first_name, last_name)').single();

        if (error) throw error;

        if (reqDoc.residents && reqDoc.residents.user_id) {
            await createNotification(reqDoc.residents.user_id, 'Certificate Request Update', `Your request for ${reqDoc.certificate_type} is now: ${status}`);
        }

        await logActivity(req.user.id, req.user.name, 'UPDATE_CERT_REQUEST', `Updated cert request ${reqDoc.request_number} to ${status}`);

        res.json({ success: true, message: `Request status updated to ${status}.`, request: reqDoc });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// QR Scanner Verification Endpoint & Mark as Claimed
app.get('/api/qr/verify-resident/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { data: resident, error } = await supabase.from('residents')
            .select('*, certificate_requests(*)')
            .eq('qr_token', token)
            .single();

        if (error || !resident) {
            return res.status(404).json({ success: false, message: 'Invalid or unknown QR Token.' });
        }

        const pendingClaims = resident.certificate_requests ? resident.certificate_requests.filter(c => c.status === 'READY_FOR_RELEASE' || c.status === 'APPROVED') : [];

        res.json({
            success: true,
            verified: true,
            resident: {
                id: resident.id,
                residentId: resident.resident_id,
                fullName: `${resident.first_name} ${resident.middle_name ? resident.middle_name + ' ' : ''}${resident.last_name} ${resident.suffix || ''}`,
                photo: resident.photo,
                birthDate: resident.birth_date,
                purok: resident.purok,
                address: resident.address,
                approvalStatus: resident.approval_status,
                residentStatus: resident.resident_status
            },
            pendingClaims
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/certificates/claim/:id', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
    try {
        const { id } = req.params;
        const { data: certReq, error } = await supabase.from('certificate_requests').update({
            status: 'CLAIMED',
            claimed_at: new Date(),
            claimed_by_staff: req.user.id
        }).eq('id', id).select('*, residents(user_id, first_name, last_name)').single();

        if (error) throw error;

        if (certReq.residents && certReq.residents.user_id) {
            await createNotification(certReq.residents.user_id, 'Certificate Claimed', `Your ${certReq.certificate_type} has been marked as CLAIMED.`);
        }

        await logActivity(req.user.id, req.user.name, 'CLAIM_CERTIFICATE', `Marked request ${certReq.request_number} as CLAIMED`);

        res.json({ success: true, message: 'Certificate marked as CLAIMED successfully.', request: certReq });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Blotter Records
app.get('/api/blotter', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
    try {
        const { data, error } = await supabase.from('blotter').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, cases: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/blotter', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
    try {
        const { complainant, respondent, witness, incidentDate, incidentLocation, description, actionTaken, status } = req.body;
        const caseNum = `BLOTTER-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

        const { data, error } = await supabase.from('blotter').insert([{
            case_number: caseNum,
            complainant,
            respondent,
            witness: witness || '',
            incident_date: incidentDate,
            incident_location: incidentLocation,
            description,
            action_taken: actionTaken || '',
            status: status || 'OPEN'
        }]).select().single();

        if (error) throw error;

        await logActivity(req.user.id, req.user.name, 'ADD_BLOTTER', `Filed blotter case ${caseNum}`);
        res.json({ success: true, message: 'Blotter record added.', case: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Appointments
app.get('/api/appointments', authenticateToken, async (req, res) => {
    try {
        let query = supabase.from('appointments').select('*, residents(first_name, last_name, contact_number, email)');
        if (req.user.role === 'RESIDENT') {
            const { data: resi } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
            if (!resi) return res.json({ success: true, appointments: [] });
            query = query.eq('resident_id', resi.id);
        }

        const { data, error } = await query.order('appointment_date', { ascending: false });
        if (error) throw error;

        res.json({ success: true, appointments: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/appointments', authenticateToken, requireRole(['RESIDENT']), async (req, res) => {
    try {
        const { service, appointmentDate, appointmentTime, purpose } = req.body;
        const { data: resi } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();

        const { data, error } = await supabase.from('appointments').insert([{
            resident_id: resi.id,
            service,
            appointment_date: appointmentDate,
            appointment_time: appointmentTime,
            purpose,
            status: 'PENDING'
        }]).select().single();

        if (error) throw error;

        await logActivity(req.user.id, req.user.name, 'BOOK_APPOINTMENT', `Booked appointment for ${service} on ${appointmentDate}`);
        res.json({ success: true, message: 'Appointment requested successfully.', appointment: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/appointments/update-status/:id', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), async (req, res) => {
    try {
        const { id } = req.params;
        const { status, remarks } = req.body;

        const { data, error } = await supabase.from('appointments').update({
            status,
            remarks: remarks || ''
        }).eq('id', id).select('*, residents(user_id)').single();

        if (error) throw error;

        if (data.residents && data.residents.user_id) {
            await createNotification(data.residents.user_id, 'Appointment Update', `Your appointment on ${data.appointment_date} status is now: ${status}`);
        }

        await logActivity(req.user.id, req.user.name, 'UPDATE_APPOINTMENT', `Updated appointment status to ${status}`);

        res.json({ success: true, message: `Appointment status updated to ${status}.`, appointment: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Announcements
app.get('/api/announcements', async (req, res) => {
    try {
        const { data, error } = await supabase.from('announcements')
            .select('*')
            .eq('status', 'PUBLISHED')
            .order('published_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, announcements: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/announcements', authenticateToken, requireRole(['ADMIN', 'SECRETARY', 'STAFF']), upload.single('image'), async (req, res) => {
    try {
        const { title, content, status } = req.body;
        let imageUrl = '';
        if (req.file) {
            imageUrl = await uploadToSupabase(req.file, 'announcements');
        }

        const { data, error } = await supabase.from('announcements').insert([{
            title,
            content,
            image: imageUrl,
            author: req.user.name,
            status: status || 'PUBLISHED',
            published_at: new Date()
        }]).select().single();

        if (error) throw error;

        await logActivity(req.user.id, req.user.name, 'CREATE_ANNOUNCEMENT', `Published announcement: ${title}`);

        res.json({ success: true, message: 'Announcement created and published!', announcement: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Complaints
app.get('/api/complaints', authenticateToken, async (req, res) => {
    try {
        let query = supabase.from('complaints').select('*, residents(first_name, last_name, contact_number)');
        if (req.user.role === 'RESIDENT') {
            const { data: resi } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
            if (!resi) return res.json({ success: true, complaints: [] });
            query = query.eq('resident_id', resi.id);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        res.json({ success: true, complaints: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/complaints', authenticateToken, requireRole(['RESIDENT']), async (req, res) => {
    try {
        const { subject, description, incidentDate, location } = req.body;
        const { data: resi } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();

        const { data, error } = await supabase.from('complaints').insert([{
            resident_id: resi.id,
            subject,
            description,
            incident_date: incidentDate,
            location,
            status: 'SUBMITTED'
        }]).select().single();

        if (error) throw error;

        await logActivity(req.user.id, req.user.name, 'SUBMIT_COMPLAINT', `Submitted complaint: ${subject}`);
        res.json({ success: true, message: 'Complaint filed successfully.', complaint: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Assistance Requests
app.get('/api/assistance', authenticateToken, async (req, res) => {
    try {
        let query = supabase.from('assistance_requests').select('*, residents(first_name, last_name, contact_number, purok)');
        if (req.user.role === 'RESIDENT') {
            const { data: resi } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();
            if (!resi) return res.json({ success: true, assistance: [] });
            query = query.eq('resident_id', resi.id);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        res.json({ success: true, assistance: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/assistance', authenticateToken, requireRole(['RESIDENT']), upload.single('document'), async (req, res) => {
    try {
        const { assistanceType, purpose, amount } = req.body;
        const { data: resi } = await supabase.from('residents').select('id').eq('user_id', req.user.id).single();

        let docUrl = '';
        if (req.file) {
            docUrl = await uploadToSupabase(req.file, 'assistance_docs');
        }

        const { data, error } = await supabase.from('assistance_requests').insert([{
            resident_id: resi.id,
            assistance_type: assistanceType,
            purpose,
            amount: parseFloat(amount) || 0,
            supporting_document: docUrl,
            status: 'PENDING'
        }]).select().single();

        if (error) throw error;

        await logActivity(req.user.id, req.user.name, 'REQUEST_ASSISTANCE', `Requested ${assistanceType}`);
        res.json({ success: true, message: 'Assistance request submitted.', assistance: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// User Management (Admin)
app.get('/api/users', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
    try {
        const { data, error } = await supabase.from('users').select('id, name, email, role, status, created_at').order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, users: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/users/staff', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password || !role) return res.status(400).json({ success: false, message: 'Missing required staff fields.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const { data, error } = await supabase.from('users').insert([{
            name,
            email,
            password: hashedPassword,
            role,
            status: 'ACTIVE'
        }]).select('id, name, email, role, status').single();

        if (error) throw error;

        await logActivity(req.user.id, req.user.name, 'CREATE_STAFF', `Created staff user ${email} with role ${role}`);
        res.json({ success: true, message: 'Staff user created successfully.', user: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Resident Digital ID & QR Code Image Generator Endpoint
app.get('/api/resident/id-data/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { data: resident, error } = await supabase.from('residents').select('*').eq('id', id).single();
        if (error || !resident) return res.status(404).json({ success: false, message: 'Resident not found.' });

        const { data: settings } = await supabase.from('settings').select('*').limit(1).single();

        let qrCodeDataUrl = '';
        if (resident.qr_token) {
            qrCodeDataUrl = await QRCode.toDataURL(resident.qr_token, { margin: 1, width: 200 });
        }

        res.json({
            success: true,
            resident,
            settings,
            qrCodeUrl: qrCodeDataUrl
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Notifications Endpoint
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase.from('notifications')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;
        res.json({ success: true, notifications: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Activity Logs Endpoint
app.get('/api/activity-logs', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
    try {
        const { data, error } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100);
        if (error) throw error;
        res.json({ success: true, logs: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- SINGLE PAGE APPLICATION (FRONTEND HTML / CSS / JS GENERATION) ---

app.get('*', (req, res) => {
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Barangay Resident Management System</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
    <style>
        :root {
            --primary-green: #059669;
            --primary-blue: #2563eb;
            --dark-overlay: rgba(15, 23, 42, 0.75);
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f3f4f6;
            margin: 0;
            padding: 0;
            color: #1f2937;
        }

        .login-bg {
            background-image: url('https://scontent.fcrk3-3.fna.fbcdn.net/v/t39.30808-6/467984538_122130208178389200_2470999473131951042_n.jpg?stp=dst-jpg_tt6&cstp=mx1857x2048&ctp=s1857x2048&_nc_cat=107&ccb=1-7&_nc_sid=cc71e4&_nc_eui2=AeH-CrVk3UW0Tqq0z_SDhKwemnbseM68ydCadux4zrzJ0I4R6gykVtH1GEMMnjk_E0vUUupJBZ3vwMdzuIfYXMgZ&_nc_ohc=fKl5LR1-2YwQ7kNvwH7PIf8&_nc_oc=AdqAy1CtUXak56hu0R2Ufzy_6npapuoitUaMuup0g9veAD0bOy9PFjySTvVXJasGWis&_nc_zt=23&_nc_ht=scontent.fcrk3-3.fna&_nc_gid=SU-DBALnvlE-vtQ4KjJx4g&_nc_ss=7b2a8&oh=00_AQK7MxJys6gqu1LJrVhDYZ2WNBpKcThfTEtIUXEWUeB_Qw&oe=6ABBAEB1');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            position: relative;
        }

        .login-overlay {
            background: linear-gradient(135deg, rgba(5, 150, 105, 0.85), rgba(37, 99, 235, 0.85));
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
        }

        .id-card-frame {
            width: 325px;
            height: 204px;
            border-radius: 12px;
            border: 2px solid #059669;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
            background: #ffffff;
            position: relative;
            overflow: hidden;
            display: inline-block;
            margin: 8px;
            page-break-inside: avoid;
            font-size: 11px;
        }

        .id-card-header {
            background: linear-gradient(90deg, #059669, #2563eb);
            color: white;
            padding: 4px;
            text-align: center;
        }

        /* PRINT MEDIA STYLES FOR 8 IDS PER BOND PAPER (8.5 x 11 inches) */
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
                width: 8.5in;
                height: 11in;
                margin: 0;
                padding: 0.25in;
                display: flex;
                flex-wrap: wrap;
                justify-content: space-between;
                align-content: space-between;
            }
            .id-card-frame {
                width: 3.8in !important;
                height: 2.4in !important;
                margin: 0.05in !important;
                box-shadow: none !important;
                border: 1px solid #333 !important;
            }
            .no-print {
                display: none !important;
            }
        }
    </style>
</head>
<body class="bg-gray-100 min-h-screen">

    <div id="app"></div>

    <script>
        // CLIENT-SIDE APPLICATION ENGINE
        const state = {
            token: localStorage.getItem('brgy_token') || null,
            user: JSON.parse(localStorage.getItem('brgy_user')) || null,
            settings: {
                barangay_name: 'Barangay Central',
                municipality: 'City of Angeles',
                province: 'Pampanga',
                logo_url: ''
            },
            currentView: 'LOGIN',
            residents: [],
            pendingResidents: [],
            households: [],
            requests: [],
            blotters: [],
            appointments: [],
            announcements: [],
            assistance: [],
            complaints: [],
            users: [],
            stats: {},
            selectedResidentForID: null,
            selectedIDsForPrint: []
        };

        async function apiCall(endpoint, method = 'GET', body = null, isFormData = false) {
            const headers = {};
            if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
            
            const options = { method, headers };

            if (body) {
                if (isFormData) {
                    options.body = body;
                } else {
                    headers['Content-Type'] = 'application/json';
                    options.body = JSON.stringify(body);
                }
            }

            try {
                const res = await fetch(endpoint, options);
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Server request failed');
                return data;
            } catch (err) {
                alert(err.message);
                throw err;
            }
        }

        async function initApp() {
            try {
                const setupRes = await fetch('/api/setup/status');
                const setupData = await setupRes.json();
                
                if (setupData.settings) {
                    state.settings = setupData.settings;
                }

                if (!setupData.hasAdmin) {
                    renderFirstTimeSetup();
                    return;
                }

                if (state.token && state.user) {
                    if (state.user.role === 'RESIDENT') {
                        renderResidentPortal();
                    } else {
                        renderStaffPortal();
                    }
                } else {
                    renderLoginPage();
                }
            } catch (err) {
                console.error('Initialization error:', err);
                renderLoginPage();
            }
        }

        function renderFirstTimeSetup() {
            const app = document.getElementById('app');
            app.innerHTML = \`
                <div class="login-bg min-h-screen flex items-center justify-center relative">
                    <div class="login-overlay"></div>
                    <div class="relative z-10 bg-white p-8 rounded-xl shadow-2xl max-w-md w-full border-t-4 border-green-600">
                        <div class="text-center mb-6">
                            <i class="fas fa-shield-alt text-5xl text-green-600 mb-2"></i>
                            <h2 class="text-2xl font-bold text-gray-800">Initial System Setup</h2>
                            <p class="text-sm text-gray-600 mt-1">No administrator account exists. Please create your primary administrator account to continue.</p>
                        </div>
                        <form id="setupForm" onsubmit="handleInitialSetup(event)" class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Administrator Full Name</label>
                                <input type="text" id="adminName" required class="w-full mt-1 px-3 py-2 border rounded-md focus:ring-green-500 focus:border-green-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Admin Email Address</label>
                                <input type="email" id="adminEmail" required class="w-full mt-1 px-3 py-2 border rounded-md focus:ring-green-500 focus:border-green-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Admin Password</label>
                                <input type="password" id="adminPassword" required class="w-full mt-1 px-3 py-2 border rounded-md focus:ring-green-500 focus:border-green-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Confirm Password</label>
                                <input type="password" id="adminConfirmPassword" required class="w-full mt-1 px-3 py-2 border rounded-md focus:ring-green-500 focus:border-green-500">
                            </div>
                            <button type="submit" id="setupBtn" class="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-md shadow transition duration-200">
                                Create Administrator & Continue
                            </button>
                        </form>
                    </div>
                </div>
            \`;
        }

        async function handleInitialSetup(e) {
            e.preventDefault();
            const name = document.getElementById('adminName').value;
            const email = document.getElementById('adminEmail').value;
            const password = document.getElementById('adminPassword').value;
            const confirm = document.getElementById('adminConfirmPassword').value;

            if (password !== confirm) {
                alert('Passwords do not match.');
                return;
            }

            const btn = document.getElementById('setupBtn');
            btn.innerText = 'Creating Admin...';
            btn.disabled = true;

            try {
                const res = await apiCall('/api/setup/admin', 'POST', { name, email, password });
                alert(res.message);
                renderLoginPage();
            } catch (err) {
                btn.innerText = 'Create Administrator & Continue';
                btn.disabled = false;
            }
        }

        function renderLoginPage() {
            const app = document.getElementById('app');
            app.innerHTML = \`
                <div class="login-bg min-h-screen flex items-center justify-center relative px-4">
                    <div class="login-overlay"></div>
                    <div class="relative z-10 bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full border-t-4 border-blue-600">
                        <div class="text-center mb-6">
                            \${state.settings.logo_url ? \`<img src="\${state.settings.logo_url}" class="h-20 mx-auto mb-2 rounded-full shadow">\` : \`<i class="fas fa-building text-5xl text-blue-600 mb-2"></i>\`}
                            <h1 class="text-2xl font-black text-gray-800 tracking-wide">\${state.settings.barangay_name.toUpperCase()}</h1>
                            <p class="text-xs font-semibold text-blue-600 uppercase tracking-widest">\${state.settings.municipality}, \${state.settings.province}</p>
                            <p class="text-sm text-gray-500 mt-2">Barangay Resident Management System</p>
                        </div>

                        <form onsubmit="handleLogin(event)" class="space-y-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Email Address</label>
                                <div class="relative">
                                    <i class="fas fa-envelope absolute left-3 top-3 text-gray-400"></i>
                                    <input type="email" id="loginEmail" required class="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="user@barangay.gov.ph">
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Password</label>
                                <div class="relative">
                                    <i class="fas fa-lock absolute left-3 top-3 text-gray-400"></i>
                                    <input type="password" id="loginPassword" required class="w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="••••••••">
                                    <i class="fas fa-eye absolute right-3 top-3 text-gray-400 cursor-pointer" onclick="togglePasswordVisibility('loginPassword', this)"></i>
                                </div>
                            </div>
                            <div class="flex items-center justify-between text-xs">
                                <label class="flex items-center text-gray-600">
                                    <input type="checkbox" class="mr-1"> Remember me
                                </label>
                                <a href="#" onclick="alert('Please contact the Barangay Secretary to reset your password.')" class="text-blue-600 hover:underline">Forgot Password?</a>
                            </div>
                            <button type="submit" id="loginBtn" class="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white font-bold py-2.5 rounded-lg shadow-lg transition duration-200 text-sm uppercase tracking-wider">
                                Sign In
                            </button>
                        </form>

                        <div class="mt-6 pt-6 border-t text-center space-y-2">
                            <p class="text-xs text-gray-600">Are you a resident of \${state.settings.barangay_name}?</p>
                            <button onclick="renderRegistrationPage()" class="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2 rounded-lg text-xs transition duration-200 border">
                                <i class="fas fa-user-plus mr-1"></i> Register as Resident
                            </button>
                        </div>
                    </div>
                </div>
            \`;
        }

        function togglePasswordVisibility(inputId, icon) {
            const input = document.getElementById(inputId);
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.replace('fa-eye-slash', 'fa-eye');
            }
        }

        async function handleLogin(e) {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            const btn = document.getElementById('loginBtn');
            btn.innerText = 'Authenticating...';
            btn.disabled = true;

            try {
                const res = await apiCall('/api/auth/login', 'POST', { email, password });
                state.token = res.token;
                state.user = res.user;
                localStorage.setItem('brgy_token', res.token);
                localStorage.setItem('brgy_user', JSON.stringify(res.user));

                if (res.user.role === 'RESIDENT') {
                    renderResidentPortal();
                } else {
                    renderStaffPortal();
                }
            } catch (err) {
                btn.innerText = 'Sign In';
                btn.disabled = false;
            }
        }

        function renderRegistrationPage() {
            const app = document.getElementById('app');
            app.innerHTML = \`
                <div class="min-h-screen bg-gray-100 py-10 px-4 flex justify-center items-center">
                    <div class="bg-white max-w-3xl w-full p-8 rounded-2xl shadow-xl border-t-4 border-green-600">
                        <div class="flex items-center justify-between mb-6 pb-4 border-b">
                            <div>
                                <h2 class="text-2xl font-bold text-gray-800">Resident Application Form</h2>
                                <p class="text-sm text-gray-500">Register as an official resident of \${state.settings.barangay_name}</p>
                            </div>
                            <button onclick="renderLoginPage()" class="text-sm text-blue-600 hover:underline"><i class="fas fa-arrow-left"></i> Back to Login</button>
                        </div>

                        <form id="regForm" onsubmit="handleResidentRegistration(event)" class="space-y-6">
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase">First Name *</label>
                                    <input type="text" name="firstName" required class="w-full mt-1 p-2 border rounded text-sm">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase">Middle Name</label>
                                    <input type="text" name="middleName" class="w-full mt-1 p-2 border rounded text-sm">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase">Last Name *</label>
                                    <input type="text" name="lastName" required class="w-full mt-1 p-2 border rounded text-sm">
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase">Suffix</label>
                                    <input type="text" name="suffix" placeholder="Jr., Sr., III" class="w-full mt-1 p-2 border rounded text-sm">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase">Birth Date *</label>
                                    <input type="date" name="birthDate" required class="w-full mt-1 p-2 border rounded text-sm">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase">Gender *</label>
                                    <select name="gender" required class="w-full mt-1 p-2 border rounded text-sm">
                                        <option value="">Select Gender</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase">Civil Status *</label>
                                    <select name="civilStatus" required class="w-full mt-1 p-2 border rounded text-sm">
                                        <option value="Single">Single</option>
                                        <option value="Married">Married</option>
                                        <option value="Widowed">Widowed</option>
                                        <option value="Separated">Separated</option>
                                    </select>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase">Purok / Zone *</label>
                                    <input type="text" name="purok" required placeholder="e.g. Purok 1" class="w-full mt-1 p-2 border rounded text-sm">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase">Contact Number *</label>
                                    <input type="text" name="contactNumber" required placeholder="09123456789" class="w-full mt-1 p-2 border rounded text-sm">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase">Voter Status</label>
                                    <select name="voterStatus" class="w-full mt-1 p-2 border rounded text-sm">
                                        <option value="REGISTERED">Registered Voter</option>
                                        <option value="NON-VOTER">Non-Voter</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-700 uppercase">Complete Address *</label>
                                <input type="text" name="address" required class="w-full mt-1 p-2 border rounded text-sm" placeholder="House No., Street Name, Barangay Central">
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase">Account Email Address *</label>
                                    <input type="email" name="email" required class="w-full mt-1 p-2 border rounded text-sm">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase">Resident Photo</label>
                                    <input type="file" name="photo" accept="image/*" class="w-full mt-1 p-1 border rounded text-sm">
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase">Password *</label>
                                    <input type="password" name="password" required class="w-full mt-1 p-2 border rounded text-sm">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase">Confirm Password *</label>
                                    <input type="password" name="confirmPassword" required class="w-full mt-1 p-2 border rounded text-sm">
                                </div>
                            </div>

                            <button type="submit" id="regSubmitBtn" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg shadow-lg text-sm uppercase tracking-wider">
                                Submit Registration Application
                            </button>
                        </form>
                    </div>
                </div>
            \`;
        }

        async function handleResidentRegistration(e) {
            e.preventDefault();
            const form = document.getElementById('regForm');
            const formData = new FormData(form);

            if (formData.get('password') !== formData.get('confirmPassword')) {
                alert('Passwords do not match!');
                return;
            }

            const btn = document.getElementById('regSubmitBtn');
            btn.innerText = 'Submitting Application...';
            btn.disabled = true;

            try {
                const res = await apiCall('/api/auth/register-resident', 'POST', formData, true);
                alert(res.message);
                renderLoginPage();
            } catch (err) {
                btn.innerText = 'Submit Registration Application';
                btn.disabled = false;
            }
        }

        // --- STAFF PORTAL DASHBOARD & FEATURES ---

        async function renderStaffPortal(activeTab = 'DASHBOARD') {
            const app = document.getElementById('app');
            app.innerHTML = \`
                <div class="min-h-screen flex flex-col md:flex-row bg-gray-100">
                    <!-- Sidebar -->
                    <div class="w-full md:w-64 bg-gray-900 text-white flex-shrink-0">
                        <div class="p-4 bg-gray-800 flex items-center space-x-3 border-b border-gray-700">
                            <i class="fas fa-city text-2xl text-green-400"></i>
                            <div>
                                <h1 class="font-bold text-sm leading-tight">\${state.settings.barangay_name}</h1>
                                <p class="text-xs text-gray-400">Staff Portal</p>
                            </div>
                        </div>

                        <nav class="p-4 space-y-1 text-sm font-medium">
                            <a href="#" onclick="renderStaffPortal('DASHBOARD')" class="flex items-center px-3 py-2 rounded-lg \${activeTab === 'DASHBOARD' ? 'bg-green-600 text-white' : 'text-gray-300 hover:bg-gray-800'}">
                                <i class="fas fa-chart-line w-6"></i> Dashboard
                            </a>
                            <a href="#" onclick="renderStaffPortal('PENDING_APPROVALS')" class="flex items-center px-3 py-2 rounded-lg \${activeTab === 'PENDING_APPROVALS' ? 'bg-green-600 text-white' : 'text-gray-300 hover:bg-gray-800'}">
                                <i class="fas fa-user-clock w-6"></i> Pending Approval
                            </a>
                            <a href="#" onclick="renderStaffPortal('RESIDENTS')" class="flex items-center px-3 py-2 rounded-lg \${activeTab === 'RESIDENTS' ? 'bg-green-600 text-white' : 'text-gray-300 hover:bg-gray-800'}">
                                <i class="fas fa-users w-6"></i> Resident Directory
                            </a>
                            <a href="#" onclick="renderStaffPortal('HOUSEHOLDS')" class="flex items-center px-3 py-2 rounded-lg \${activeTab === 'HOUSEHOLDS' ? 'bg-green-600 text-white' : 'text-gray-300 hover:bg-gray-800'}">
                                <i class="fas fa-home w-6"></i> Households
                            </a>
                            <a href="#" onclick="renderStaffPortal('CERTIFICATES')" class="flex items-center px-3 py-2 rounded-lg \${activeTab === 'CERTIFICATES' ? 'bg-green-600 text-white' : 'text-gray-300 hover:bg-gray-800'}">
                                <i class="fas fa-file-contract w-6"></i> Certificates
                            </a>
                            <a href="#" onclick="renderStaffPortal('QR_SCANNER')" class="flex items-center px-3 py-2 rounded-lg \${activeTab === 'QR_SCANNER' ? 'bg-green-600 text-white' : 'text-gray-300 hover:bg-gray-800'}">
                                <i class="fas fa-qrcode w-6"></i> QR Claim Scanner
                            </a>
                            <a href="#" onclick="renderStaffPortal('BLOTTER')" class="flex items-center px-3 py-2 rounded-lg \${activeTab === 'BLOTTER' ? 'bg-green-600 text-white' : 'text-gray-300 hover:bg-gray-800'}">
                                <i class="fas fa-gavel w-6"></i> Blotter Cases
                            </a>
                            <a href="#" onclick="renderStaffPortal('ANNOUNCEMENTS')" class="flex items-center px-3 py-2 rounded-lg \${activeTab === 'ANNOUNCEMENTS' ? 'bg-green-600 text-white' : 'text-gray-300 hover:bg-gray-800'}">
                                <i class="fas fa-bullhorn w-6"></i> Announcements
                            </a>
                            <a href="#" onclick="renderStaffPortal('PRINT_BATCH')" class="flex items-center px-3 py-2 rounded-lg \${activeTab === 'PRINT_BATCH' ? 'bg-green-600 text-white' : 'text-gray-300 hover:bg-gray-800'}">
                                <i class="fas fa-print w-6"></i> Print IDs (8-per-page)
                            </a>
                            \${state.user.role === 'ADMIN' ? \`
                                <a href="#" onclick="renderStaffPortal('SETTINGS')" class="flex items-center px-3 py-2 rounded-lg \${activeTab === 'SETTINGS' ? 'bg-green-600 text-white' : 'text-gray-300 hover:bg-gray-800'}">
                                    <i class="fas fa-cog w-6"></i> System Settings
                                </a>
                            \` : ''}
                        </nav>

                        <div class="p-4 border-t border-gray-800 mt-auto">
                            <div class="flex items-center justify-between text-xs text-gray-400 mb-2">
                                <span>Logged in as:</span>
                                <span class="font-bold text-green-400">\${state.user.role}</span>
                            </div>
                            <button onclick="handleLogout()" class="w-full bg-red-600 hover:bg-red-700 text-white py-1.5 rounded text-xs font-semibold transition">
                                <i class="fas fa-sign-out-alt mr-1"></i> Logout
                            </button>
                        </div>
                    </div>

                    <!-- Main Content Area -->
                    <div class="flex-1 p-6 overflow-y-auto" id="staff-content">
                        <div class="text-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-gray-500"></i> Loading Module...</div>
                    </div>
                </div>
            \`;

            loadStaffModule(activeTab);
        }

        async function loadStaffModule(tab) {
            const container = document.getElementById('staff-content');
            if (tab === 'DASHBOARD') {
                const res = await apiCall('/api/staff/dashboard-stats');
                const stats = res.stats;
                container.innerHTML = \`
                    <h2 class="text-2xl font-bold text-gray-800 mb-6">Barangay Administrative Dashboard</h2>
                    
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        <div class="bg-white p-5 rounded-xl shadow border-l-4 border-green-500">
                            <p class="text-xs font-bold text-gray-500 uppercase">Total Residents</p>
                            <p class="text-3xl font-black text-gray-800 mt-1">\${stats.totalResidents}</p>
                        </div>
                        <div class="bg-white p-5 rounded-xl shadow border-l-4 border-yellow-500">
                            <p class="text-xs font-bold text-gray-500 uppercase">Pending Applications</p>
                            <p class="text-3xl font-black text-gray-800 mt-1">\${stats.pendingResidents}</p>
                        </div>
                        <div class="bg-white p-5 rounded-xl shadow border-l-4 border-blue-500">
                            <p class="text-xs font-bold text-gray-500 uppercase">Total Households</p>
                            <p class="text-3xl font-black text-gray-800 mt-1">\${stats.totalHouseholds}</p>
                        </div>
                        <div class="bg-white p-5 rounded-xl shadow border-l-4 border-purple-500">
                            <p class="text-xs font-bold text-gray-500 uppercase">Senior Citizens</p>
                            <p class="text-3xl font-black text-gray-800 mt-1">\${stats.seniorCitizens}</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div class="bg-white p-6 rounded-xl shadow">
                            <h3 class="font-bold text-gray-800 mb-4">Gender Distribution</h3>
                            <div class="flex justify-around items-center py-4">
                                <div class="text-center">
                                    <span class="block text-2xl font-bold text-blue-600">\${stats.maleResidents}</span>
                                    <span class="text-xs text-gray-500 uppercase">Male</span>
                                </div>
                                <div class="text-center">
                                    <span class="block text-2xl font-bold text-pink-600">\${stats.femaleResidents}</span>
                                    <span class="text-xs text-gray-500 uppercase">Female</span>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white p-6 rounded-xl shadow lg:col-span-2">
                            <h3 class="font-bold text-gray-800 mb-4">Pending Requests Overview</h3>
                            <div class="grid grid-cols-3 gap-4 text-center">
                                <div class="p-3 bg-gray-50 rounded-lg">
                                    <span class="block text-xl font-bold text-green-600">\${stats.pendingCerts}</span>
                                    <span class="text-xs text-gray-500">Certificate Requests</span>
                                </div>
                                <div class="p-3 bg-gray-50 rounded-lg">
                                    <span class="block text-xl font-bold text-blue-600">\${stats.pendingAppts}</span>
                                    <span class="text-xs text-gray-500">Appointments</span>
                                </div>
                                <div class="p-3 bg-gray-50 rounded-lg">
                                    <span class="block text-xl font-bold text-red-600">\${stats.openBlotters}</span>
                                    <span class="text-xs text-gray-500">Open Blotters</span>
                                </div>
                            </div>
                        </div>
                    </div>
                \`;
            } else if (tab === 'PENDING_APPROVALS') {
                const res = await apiCall('/api/staff/pending-residents');
                const residents = res.residents || [];
                
                let html = \`
                    <h2 class="text-2xl font-bold text-gray-800 mb-6">Pending Resident Applications</h2>
                \`;

                if (residents.length === 0) {
                    html += \`<div class="bg-white p-8 rounded-xl shadow text-center text-gray-500">No pending resident applications found.</div>\`;
                } else {
                    html += \`
                        <div class="bg-white rounded-xl shadow overflow-x-auto">
                            <table class="w-full text-left text-sm text-gray-600">
                                <thead class="bg-gray-100 text-xs font-bold uppercase text-gray-700 border-b">
                                    <tr>
                                        <th class="p-4">Applicant Name</th>
                                        <th class="p-4">Birth Date / Gender</th>
                                        <th class="p-4">Address / Purok</th>
                                        <th class="p-4">Contact</th>
                                        <th class="p-4">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                    \`;
                    residents.forEach(r => {
                        html += \`
                            <tr class="border-b hover:bg-gray-50">
                                <td class="p-4 font-bold text-gray-800">\${r.first_name} \${r.last_name}</td>
                                <td class="p-4">\${r.birth_date} (\${r.gender})</td>
                                <td class="p-4">\${r.address}, \${r.purok}</td>
                                <td class="p-4">\${r.contact_number}</td>
                                <td class="p-4 flex space-x-2">
                                    <button onclick="approveResident('\${r.id}')" class="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded font-bold">Approve</button>
                                    <button onclick="rejectResidentPrompt('\${r.id}')" class="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded font-bold">Reject</button>
                                </td>
                            </tr>
                        \`;
                    });
                    html += \`</tbody></table></div>\`;
                }
                container.innerHTML = html;
            } else if (tab === 'QR_SCANNER') {
                container.innerHTML = \`
                    <h2 class="text-2xl font-bold text-gray-800 mb-6">QR Code Verification & Claiming Scanner</h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="bg-white p-6 rounded-xl shadow">
                            <h3 class="font-bold text-gray-800 mb-4">Scan Resident QR Code</h3>
                            <div id="reader" class="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center"></div>
                            <div class="mt-4">
                                <p class="text-xs text-gray-500 mb-1">Or manually enter QR Token:</p>
                                <div class="flex space-x-2">
                                    <input type="text" id="manualQrToken" placeholder="BRGY-VERIFY-XXXXXX" class="border rounded p-2 text-sm flex-1">
                                    <button onclick="verifyTokenManual()" class="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold">Verify</button>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white p-6 rounded-xl shadow" id="qrResultPanel">
                            <p class="text-gray-400 text-center py-12">Scan a resident's QR code or enter token to view verified status and pending document claims.</p>
                        </div>
                    </div>
                \`;

                setTimeout(() => {
                    if (document.getElementById('reader')) {
                        const html5QrCode = new Html5Qrcode("reader");
                        html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (decodedText) => {
                            verifyQrToken(decodedText);
                        }).catch(err => console.log('Camera error or permission denied:', err));
                    }
                }, 500);
            } else if (tab === 'PRINT_BATCH') {
                const res = await apiCall('/api/staff/residents');
                const residents = res.residents || [];
                
                container.innerHTML = \`
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold text-gray-800">Print Barangay IDs (8 per Bond Paper)</h2>
                        <button onclick="window.print()" class="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg text-sm">
                            <i class="fas fa-print mr-2"></i> Print Selected IDs Now
                        </button>
                    </div>

                    <p class="text-sm text-gray-600 mb-4">Select up to 8 residents to print on a single 8.5" x 11" sheet of paper.</p>

                    <div id="print-section" class="mb-8">
                        \${residents.slice(0, 8).map(r => renderSingleIdCardHTML(r)).join('')}
                    </div>
                \`;
            }
        }

        function renderSingleIdCardHTML(r) {
            return \`
                <div class="id-card-frame bg-white border border-green-600 rounded-lg p-2 text-xs flex flex-col justify-between">
                    <div class="id-card-header rounded text-center py-1">
                        <p class="font-bold text-xs uppercase">\${state.settings.barangay_name}</p>
                        <p class="text-xxs">BARANGAY IDENTIFICATION CARD</p>
                    </div>
                    <div class="flex items-center space-x-2 my-2">
                        <img src="\${r.photo || 'https://via.placeholder.com/60'}" class="w-14 h-14 object-cover border rounded">
                        <div>
                            <p class="font-bold text-gray-800 text-xs">\${r.first_name} \${r.last_name}</p>
                            <p class="text-gray-500 text-xxs">ID: \${r.resident_id || 'PENDING'}</p>
                            <p class="text-gray-500 text-xxs">Purok: \${r.purok}</p>
                            <p class="text-gray-500 text-xxs">DOB: \${r.birth_date}</p>
                        </div>
                    </div>
                    <div class="border-t pt-1 flex justify-between items-center text-xxs text-gray-400">
                        <span>OFFICIAL RESIDENT</span>
                        <span>\${state.settings.municipality}</span>
                    </div>
                </div>
            \`;
        }

        async function approveResident(id) {
            if (!confirm('Approve this resident application?')) return;
            try {
                const res = await apiCall('/api/staff/approve-resident/' + id, 'POST');
                alert(res.message);
                loadStaffModule('PENDING_APPROVALS');
            } catch (e) {}
        }

        async function rejectResidentPrompt(id) {
            const reason = prompt('Please enter the reason for rejection:');
            if (!reason) return;
            try {
                const res = await apiCall('/api/staff/reject-resident/' + id, 'POST', { reason });
                alert(res.message);
                loadStaffModule('PENDING_APPROVALS');
            } catch (e) {}
        }

        async function verifyQrToken(token) {
            try {
                const res = await apiCall('/api/qr/verify-resident/' + token);
                const panel = document.getElementById('qrResultPanel');
                
                let claimsHtml = '';
                if (res.pendingClaims && res.pendingClaims.length > 0) {
                    claimsHtml = res.pendingClaims.map(c => \`
                        <div class="p-3 border rounded-lg bg-green-50 flex justify-between items-center mt-2">
                            <div>
                                <p class="font-bold text-sm text-green-800">\${c.certificate_type}</p>
                                <p class="text-xs text-gray-500">Req #: \${c.request_number}</p>
                            </div>
                            <button onclick="markCertificateClaimed('\${c.id}')" class="bg-green-600 text-white text-xs px-3 py-1.5 rounded font-bold">Mark Claimed</button>
                        </div>
                    \`).join('');
                } else {
                    claimsHtml = '<p class="text-xs text-gray-500 mt-2">No pending certificates ready for release.</p>';
                }

                panel.innerHTML = \`
                    <div class="text-center pb-4 border-b">
                        <span class="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full">VERIFIED RESIDENT</span>
                        <h3 class="text-xl font-bold mt-2">\${res.resident.fullName}</h3>
                        <p class="text-xs text-gray-500">ID: \${res.resident.residentId}</p>
                    </div>
                    <div class="mt-4">
                        <h4 class="font-bold text-sm text-gray-700">Pending Release / Claims:</h4>
                        \${claimsHtml}
                    </div>
                \`;
            } catch (e) {}
        }

        function verifyTokenManual() {
            const token = document.getElementById('manualQrToken').value;
            if (token) verifyQrToken(token);
        }

        async function markCertificateClaimed(id) {
            try {
                const res = await apiCall('/api/certificates/claim/' + id, 'POST');
                alert(res.message);
                loadStaffModule('QR_SCANNER');
            } catch (e) {}
        }

        // --- RESIDENT PORTAL ---

        async function renderResidentPortal() {
            const app = document.getElementById('app');
            app.innerHTML = \`
                <div class="min-h-screen bg-gray-100">
                    <!-- Top Navbar -->
                    <nav class="bg-green-700 text-white px-6 py-4 flex justify-between items-center shadow-lg">
                        <div class="flex items-center space-x-3">
                            <i class="fas fa-user-shield text-2xl"></i>
                            <span class="font-bold text-lg">\${state.settings.barangay_name} Resident Portal</span>
                        </div>
                        <button onclick="handleLogout()" class="bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded text-xs font-bold">Logout</button>
                    </nav>

                    <div class="max-w-5xl mx-auto py-8 px-4 space-y-6">
                        <div class="bg-white p-6 rounded-2xl shadow flex flex-col md:flex-row items-center justify-between">
                            <div>
                                <h1 class="text-2xl font-black text-gray-800">Welcome, \${state.user.name}!</h1>
                                <p class="text-xs text-gray-500 mt-1">Status: <span class="font-bold text-green-600">\${state.user.resident ? state.user.resident.approval_status : 'PENDING'}</span></p>
                            </div>
                        </div>

                        <!-- Announcements Panel -->
                        <div class="bg-white p-6 rounded-2xl shadow">
                            <h2 class="text-lg font-bold text-gray-800 mb-4"><i class="fas fa-bullhorn text-green-600 mr-2"></i> Barangay Announcements</h2>
                            <div id="announcementList" class="space-y-4">
                                <p class="text-sm text-gray-500">Loading announcements...</p>
                            </div>
                        </div>
                    </div>
                </div>
            \`;

            loadResidentAnnouncements();
        }

        async function loadResidentAnnouncements() {
            try {
                const res = await apiCall('/api/announcements');
                const list = document.getElementById('announcementList');
                if (!res.announcements || res.announcements.length === 0) {
                    list.innerHTML = '<p class="text-sm text-gray-500">No announcements published yet.</p>';
                    return;
                }

                list.innerHTML = res.announcements.map(a => \`
                    <div class="border-l-4 border-green-600 pl-4 py-2 bg-gray-50 rounded-r-lg">
                        <h3 class="font-bold text-gray-800">\${a.title}</h3>
                        <p class="text-xs text-gray-400 mb-2">Published: \${new Date(a.published_at).toLocaleDateString()}</p>
                        <p class="text-sm text-gray-600">\${a.content}</p>
                    </div>
                \`).join('');
            } catch (e) {}
        }

        function handleLogout() {
            localStorage.removeItem('brgy_token');
            localStorage.removeItem('brgy_user');
            state.token = null;
            state.user = null;
            renderLoginPage();
        }

        // Initialize application on startup
        window.onload = initApp;
    </script>
</body>
</html>
    `;
    res.send(htmlContent);
});

// --- SERVER INITIALIZATION ---

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Barangay Resident Management System running on http://0.0.0.0:${PORT}`);
});
