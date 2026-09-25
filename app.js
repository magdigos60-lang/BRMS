/**
 * BARANGAY RESIDENT MANAGEMENT SYSTEM (BRMS)
 * Monolithic Production Code for Render & Supabase deployment
 */

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'brms_production_jwt_secret_key_2026_green_blue';

// SUPABASE CLIENT INIT
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('CRITICAL: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required.');
}

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder');

// MIDDLEWARES
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// UPLOAD HANDLING (MEMORY)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// AUTH MIDDLEWARE
const authenticate = async (req, res, next) => {
    try {
        const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
        if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });

        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

const authorize = (roles = []) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden: Access denied for your role' });
        }
        next();
    };
};

// ==========================================
// API ROUTES
// ==========================================

// SETUP CHECK
app.get('/api/setup/status', async (req, res) => {
    try {
        const { data, error } = await supabase.from('users').select('id').eq('role', 'admin').limit(1);
        if (error) throw error;
        res.json({ setupRequired: data.length === 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// INITIAL ADMIN SETUP
app.post('/api/setup/admin', async (req, res) => {
    try {
        const { data: existingAdmins } = await supabase.from('users').select('id').eq('role', 'admin');
        if (existingAdmins && existingAdmins.length > 0) {
            return res.status(400).json({ error: 'Admin setup already completed.' });
        }

        const { fullName, username, email, password, confirmPassword } = req.body;

        if (!fullName || !username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Passwords do not match.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const { data, error } = await supabase.from('users').insert([{
            full_name: fullName,
            username: username.toLowerCase().trim(),
            email: email.toLowerCase().trim(),
            password_hash: passwordHash,
            role: 'admin'
        }]).select();

        if (error) throw error;

        res.json({ success: true, message: 'First Administrator account created successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// AUTHENTICATION
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .or(`username.eq.${username.toLowerCase().trim()},email.eq.${username.toLowerCase().trim()}`)
            .eq('is_active', true);

        if (error || !users || users.length === 0) {
            return res.status(400).json({ error: 'Invalid username/email or password.' });
        }

        const user = users[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return res.status(400).json({ error: 'Invalid username/email or password.' });
        }

        let residentData = null;
        if (user.role === 'resident') {
            const { data: resRec } = await supabase.from('residents').select('*').eq('user_id', user.id).single();
            residentData = resRec;
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, email: user.email, residentId: residentData ? residentData.id : null },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 86400000 });
        res.json({ success: true, role: user.role, token, user: { id: user.id, name: user.full_name, email: user.email, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true, message: 'Logged out successfully' });
});

// PUBLIC RESIDENT REGISTRATION
app.post('/api/auth/register-resident', upload.single('profilePhoto'), async (req, res) => {
    try {
        const {
            firstName, middleName, lastName, suffix, dateOfBirth, gender, civilStatus,
            address, purokId, contactNumber, email, username, password, occupation,
            educationalAttainment, nationality, voterStatus, isSenior, isPwd, isSoloParent
        } = req.body;

        if (!firstName || !lastName || !dateOfBirth || !gender || !civilStatus || !address || !username || !password || !email) {
            return res.status(400).json({ error: 'Please fill in all mandatory fields.' });
        }

        const { data: existingUser } = await supabase.from('users').select('id').or(`username.eq.${username.toLowerCase().trim()},email.eq.${email.toLowerCase().trim()}`);
        if (existingUser && existingUser.length > 0) {
            return res.status(400).json({ error: 'Username or email is already registered.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        // Create User Record
        const { data: user, error: userErr } = await supabase.from('users').insert([{
            full_name: `${firstName} ${lastName}`,
            username: username.toLowerCase().trim(),
            email: email.toLowerCase().trim(),
            password_hash: passwordHash,
            role: 'resident'
        }]).select().single();

        if (userErr) throw userErr;

        let photoBase64 = '';
        if (req.file) {
            photoBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        }

        // Create Resident Record
        const { data: resident, error: resErr } = await supabase.from('residents').insert([{
            user_id: user.id,
            first_name: firstName,
            middle_name: middleName || '',
            last_name: lastName,
            suffix: suffix || '',
            date_of_birth: dateOfBirth,
            gender,
            civil_status: civilStatus,
            address,
            purok_id: purokId || null,
            contact_number: contactNumber,
            email,
            occupation: occupation || '',
            educational_attainment: educationalAttainment || '',
            nationality: nationality || 'Filipino',
            voter_status: voterStatus || 'Non-Voter',
            is_senior: isSenior === 'true' || isSenior === true,
            is_pwd: isPwd === 'true' || isPwd === true,
            is_solo_parent: isSoloParent === 'true' || isSoloParent === true,
            profile_photo: photoBase64,
            approval_status: 'Pending'
        }]).select().single();

        if (resErr) throw resErr;

        res.json({ success: true, message: 'Registration submitted successfully. Your account is PENDING APPROVAL.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SYSTEM SETTINGS
app.get('/api/settings', async (req, res) => {
    try {
        const { data, error } = await supabase.from('system_settings').select('*').single();
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings', authenticate, authorize(['admin']), upload.single('logo'), async (req, res) => {
    try {
        const { barangayName, municipality, province, address, contactNumber, email, captainName, secretaryName } = req.body;
        let updateData = {
            barangay_name: barangayName,
            municipality,
            province,
            address,
            contact_number: contactNumber,
            email,
            captain_name: captainName,
            secretary_name: secretaryName,
            updated_at: new Date()
        };

        if (req.file) {
            updateData.logo_url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        }

        const { data, error } = await supabase.from('system_settings').update(updateData).eq('id', 1).select();
        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DASHBOARD STATS
app.get('/api/stats/dashboard', authenticate, authorize(['admin', 'captain', 'secretary', 'staff']), async (req, res) => {
    try {
        const [
            residents, households, certs, appts, assist, complaints
        ] = await Promise.all([
            supabase.from('residents').select('approval_status, gender, is_senior, is_pwd, is_solo_parent, voter_status, date_of_birth, is_archived'),
            supabase.from('households').select('id', { count: 'exact' }).eq('is_archived', false),
            supabase.from('certificate_requests').select('status'),
            supabase.from('appointments').select('status'),
            supabase.from('assistance_requests').select('status'),
            supabase.from('complaints').select('status')
        ]);

        const activeRes = (residents.data || []).filter(r => !r.is_archived);

        let stats = {
            totalResidents: activeRes.length,
            pendingResidents: activeRes.filter(r => r.approval_status === 'Pending').length,
            approvedResidents: activeRes.filter(r => r.approval_status === 'Approved').length,
            rejectedResidents: activeRes.filter(r => r.approval_status === 'Rejected').length,
            totalHouseholds: households.count || 0,
            maleResidents: activeRes.filter(r => r.gender === 'Male').length,
            femaleResidents: activeRes.filter(r => r.gender === 'Female').length,
            seniorCitizens: activeRes.filter(r => r.is_senior).length,
            pwd: activeRes.filter(r => r.is_pwd).length,
            soloParents: activeRes.filter(r => r.is_solo_parent).length,
            minors: activeRes.filter(r => {
                const age = new Date().getFullYear() - new Date(r.date_of_birth).getFullYear();
                return age < 18;
            }).length,
            registeredVoters: activeRes.filter(r => r.voter_status === 'Registered').length,
            pendingCertificates: (certs.data || []).filter(c => c.status === 'Pending').length,
            pendingAppointments: (appts.data || []).filter(a => a.status === 'Pending').length,
            pendingAssistance: (assist.data || []).filter(a => a.status === 'Pending').length,
            pendingComplaints: (complaints.data || []).filter(c => c.status === 'Submitted' || c.status === 'Under Review').length
        };

        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// RESIDENTS MANAGEMENT
app.get('/api/residents', authenticate, authorize(['admin', 'captain', 'secretary', 'staff']), async (req, res) => {
    try {
        const { status, archived, search } = req.query;
        let query = supabase.from('residents').select('*, puroks(name), households(household_number)');

        if (archived === 'true') {
            query = query.eq('is_archived', true);
        } else {
            query = query.eq('is_archived', false);
        }

        if (status) {
            query = query.eq('approval_status', status);
        }

        const { data, error } = await query.order('registered_at', { ascending: false });
        if (error) throw error;

        let result = data;
        if (search) {
            const s = search.toLowerCase();
            result = result.filter(r => 
                `${r.first_name} ${r.last_name}`.toLowerCase().includes(s) ||
                (r.resident_id && r.resident_id.toLowerCase().includes(s)) ||
                (r.address && r.address.toLowerCase().includes(s))
            );
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/residents/approve-reject', authenticate, authorize(['admin', 'captain', 'secretary', 'staff']), async (req, res) => {
    try {
        const { residentId, status, rejectionReason } = req.body;
        
        let updates = {
            approval_status: status,
            rejection_reason: status === 'Rejected' ? rejectionReason : null,
            updated_at: new Date()
        };

        if (status === 'Approved') {
            const { count } = await supabase.from('residents').select('id', { count: 'exact' }).eq('approval_status', 'Approved');
            const seq = String((count || 0) + 1).padStart(6, '0');
            updates.resident_id = `BRGY-${seq}`;
        }

        const { data: resident, error } = await supabase.from('residents').update(updates).eq('id', residentId).select().single();
        if (error) throw error;

        // Create Notification
        await supabase.from('notifications').insert([{
            user_id: resident.user_id,
            title: `Resident Registration ${status}`,
            message: status === 'Approved' 
                ? `Congratulations! Your residency registration has been approved. Your Resident ID is ${updates.resident_id}.`
                : `Your registration was rejected. Reason: ${rejectionReason}`
        }]);

        res.json({ success: true, data: resident });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/residents/archive-toggle', authenticate, authorize(['admin', 'captain', 'secretary', 'staff']), async (req, res) => {
    try {
        const { residentId, archive } = req.body;
        const { data, error } = await supabase.from('residents').update({ is_archived: archive }).eq('id', residentId).select().single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUBLIC VERIFICATION FOR QR CODE
app.get('/api/verify/resident/:residentId', async (req, res) => {
    try {
        const { residentId } = req.params;
        const { data: resident, error } = await supabase
            .from('residents')
            .select('resident_id, first_name, last_name, approval_status, is_archived')
            .eq('resident_id', residentId)
            .single();

        if (error || !resident) {
            return res.status(404).json({ verified: false, message: 'Resident record not found.' });
        }

        const { data: sys } = await supabase.from('system_settings').select('barangay_name').single();

        res.json({
            verified: resident.approval_status === 'Approved' && !resident.is_archived,
            residentId: resident.resident_id,
            fullName: `${resident.first_name} ${resident.last_name}`,
            barangay: sys ? sys.barangay_name : 'Barangay Central',
            status: resident.is_archived ? 'INACTIVE / ARCHIVED' : (resident.approval_status === 'Approved' ? 'ACTIVE / VERIFIED' : resident.approval_status)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUROK MANAGEMENT
app.get('/api/puroks', async (req, res) => {
    try {
        const { data, error } = await supabase.from('puroks').select('*').order('name');
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/puroks', authenticate, authorize(['admin', 'captain', 'secretary']), async (req, res) => {
    try {
        const { name, description } = req.body;
        const { data, error } = await supabase.from('puroks').insert([{ name, description }]).select();
        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// HOUSEHOLD MANAGEMENT
app.get('/api/households', authenticate, authorize(['admin', 'captain', 'secretary', 'staff']), async (req, res) => {
    try {
        const { data, error } = await supabase.from('households').select('*, puroks(name), residents(*)').eq('is_archived', false);
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/households', authenticate, authorize(['admin', 'captain', 'secretary', 'staff']), async (req, res) => {
    try {
        const { householdNumber, address, purokId } = req.body;
        const { data, error } = await supabase.from('households').insert([{ household_number: householdNumber, address, purok_id: purokId }]).select();
        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CERTIFICATES
app.get('/api/certificates', authenticate, async (req, res) => {
    try {
        let query = supabase.from('certificate_requests').select('*, residents(first_name, last_name, resident_id)');
        if (req.user.role === 'resident') {
            query = query.eq('resident_id', req.user.residentId);
        }
        const { data, error } = await query.order('requested_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/certificates/request', authenticate, authorize(['resident']), async (req, res) => {
    try {
        const { certificateType, purpose } = req.body;
        const { data, error } = await supabase.from('certificate_requests').insert([{
            resident_id: req.user.residentId,
            certificate_type: certificateType,
            purpose,
            status: 'Pending'
        }]).select();

        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/certificates/process', authenticate, authorize(['admin', 'captain', 'secretary', 'staff']), upload.single('certificateFile'), async (req, res) => {
    try {
        const { requestId, status, rejectionReason, remarks, certificateNumber, releaseDate } = req.body;
        
        let updates = {
            status,
            rejection_reason: rejectionReason,
            remarks,
            certificate_number: certificateNumber,
            release_date: releaseDate || null,
            updated_at: new Date()
        };

        if (req.file) {
            updates.file_url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        }

        const { data: cert, error } = await supabase.from('certificate_requests').update(updates).eq('id', requestId).select('*, residents(user_id)').single();
        if (error) throw error;

        // Send Notification
        await supabase.from('notifications').insert([{
            user_id: cert.residents.user_id,
            title: `Certificate Request ${status}`,
            message: `Your request for ${cert.certificate_type} is now: ${status}.`
        }]);

        res.json({ success: true, data: cert });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// APPOINTMENTS
app.get('/api/appointments', authenticate, async (req, res) => {
    try {
        let query = supabase.from('appointments').select('*, residents(first_name, last_name, resident_id, contact_number)');
        if (req.user.role === 'resident') {
            query = query.eq('resident_id', req.user.residentId);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/appointments', authenticate, async (req, res) => {
    try {
        const { serviceType, preferredDate, preferredTime, purpose } = req.body;
        const { data, error } = await supabase.from('appointments').insert([{
            resident_id: req.user.residentId,
            service_type: serviceType,
            preferred_date: preferredDate,
            preferred_time: preferredTime,
            purpose
        }]).select();

        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/appointments/status', authenticate, authorize(['admin', 'captain', 'secretary', 'staff']), async (req, res) => {
    try {
        const { appointmentId, status, remarks } = req.body;
        const { data: appt, error } = await supabase.from('appointments').update({ status, remarks, updated_at: new Date() }).eq('id', appointmentId).select('*, residents(user_id)').single();
        if (error) throw error;

        await supabase.from('notifications').insert([{
            user_id: appt.residents.user_id,
            title: `Appointment Status Updated`,
            message: `Your appointment for ${appt.service_type} on ${appt.preferred_date} has been updated to: ${status}.`
        }]);

        res.json({ success: true, data: appt });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// COMPLAINTS / BLOTTER
app.get('/api/complaints', authenticate, async (req, res) => {
    try {
        let query = supabase.from('complaints').select('*');
        if (req.user.role === 'resident') {
            query = query.eq('complainant_id', req.user.residentId);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/complaints', authenticate, async (req, res) => {
    try {
        const { respondentName, witnessNames, complaintType, incidentDate, incidentLocation, description } = req.body;
        
        const { data: resRec } = await supabase.from('residents').select('first_name, last_name').eq('id', req.user.residentId).single();
        const complainantName = resRec ? `${resRec.first_name} ${resRec.last_name}` : 'Anonymous Resident';
        
        const caseNumber = `BLOTTER-${Date.now().toString().slice(-6)}`;

        const { data, error } = await supabase.from('complaints').insert([{
            case_number: caseNumber,
            complainant_id: req.user.residentId,
            complainant_name: complainantName,
            respondent_name: respondentName,
            witness_names: witnessNames,
            complaint_type: complaintType,
            incident_date: incidentDate,
            incident_location: incidentLocation,
            description,
            status: 'Submitted'
        }]).select();

        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/complaints/status', authenticate, authorize(['admin', 'captain', 'secretary', 'staff']), async (req, res) => {
    try {
        const { complaintId, status, resolutionDetails } = req.body;
        const { data: comp, error } = await supabase.from('complaints').update({ status, resolution_details: resolutionDetails, updated_at: new Date() }).eq('id', complaintId).select().single();
        if (error) throw error;

        if (comp.complainant_id) {
            const { data: resRec } = await supabase.from('residents').select('user_id').eq('id', comp.complainant_id).single();
            if (resRec) {
                await supabase.from('notifications').insert([{
                    user_id: resRec.user_id,
                    title: `Complaint Status Update`,
                    message: `Your complaint Case #${comp.case_number} status changed to ${status}.`
                }]);
            }
        }

        res.json({ success: true, data: comp });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ASSISTANCE REQUESTS
app.get('/api/assistance', authenticate, async (req, res) => {
    try {
        let query = supabase.from('assistance_requests').select('*, residents(first_name, last_name, resident_id)');
        if (req.user.role === 'resident') {
            query = query.eq('resident_id', req.user.residentId);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/assistance', authenticate, authorize(['resident']), async (req, res) => {
    try {
        const { assistanceType, details } = req.body;
        const { data, error } = await supabase.from('assistance_requests').insert([{
            resident_id: req.user.residentId,
            assistance_type: assistanceType,
            details,
            status: 'Pending'
        }]).select();

        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/assistance/status', authenticate, authorize(['admin', 'captain', 'secretary', 'staff']), async (req, res) => {
    try {
        const { requestId, status, remarks } = req.body;
        const { data: reqData, error } = await supabase.from('assistance_requests').update({ status, remarks, updated_at: new Date() }).eq('id', requestId).select('*, residents(user_id)').single();
        if (error) throw error;

        await supabase.from('notifications').insert([{
            user_id: reqData.residents.user_id,
            title: `Assistance Request ${status}`,
            message: `Your request for ${reqData.assistance_type} status is now: ${status}.`
        }]);

        res.json({ success: true, data: reqData });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ANNOUNCEMENTS
app.get('/api/announcements', async (req, res) => {
    try {
        const { data, error } = await supabase.from('announcements').select('*').eq('status', 'Active').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/announcements', authenticate, authorize(['admin', 'captain', 'secretary', 'staff']), upload.single('image'), async (req, res) => {
    try {
        const { title, description, category } = req.body;
        let imageUrl = '';
        if (req.file) {
            imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        }

        const { data, error } = await supabase.from('announcements').insert([{
            title, description, category, image_url: imageUrl, created_by: req.user.id
        }]).select();

        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// NOTIFICATIONS
app.get('/api/notifications', authenticate, async (req, res) => {
    try {
        const { data, error } = await supabase.from('notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/notifications/read', authenticate, async (req, res) => {
    try {
        await supabase.from('notifications').update({ is_read: true }).eq('user_id', req.user.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// BUSINESS MANAGEMENT
app.get('/api/businesses', authenticate, authorize(['admin', 'captain', 'secretary', 'staff']), async (req, res) => {
    try {
        const { data, error } = await supabase.from('business_records').select('*').eq('is_archived', false).order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/businesses', authenticate, authorize(['admin', 'captain', 'secretary', 'staff']), async (req, res) => {
    try {
        const { businessName, ownerName, businessType, address, contactNumber, permitNumber, expirationDate } = req.body;
        const { data, error } = await supabase.from('business_records').insert([{
            business_name: businessName,
            owner_name: ownerName,
            business_type: businessType,
            address,
            contact_number: contactNumber,
            permit_number: permitNumber,
            expiration_date: expirationDate
        }]).select();

        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// FEEDBACK
app.post('/api/feedback', authenticate, authorize(['resident']), async (req, res) => {
    try {
        const { serviceType, rating, comment } = req.body;
        const { data, error } = await supabase.from('service_feedback').insert([{
            resident_id: req.user.residentId,
            service_type: serviceType,
            rating: parseInt(rating),
            comment
        }]).select();

        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// USER PROFILE UPDATE
app.post('/api/user/update-profile', authenticate, async (req, res) => {
    try {
        const { fullName, email, username, currentPassword, newPassword } = req.body;
        
        const { data: user } = await supabase.from('users').select('*').eq('id', req.user.id).single();
        const match = await bcrypt.compare(currentPassword, user.password_hash);
        if (!match) {
            return res.status(400).json({ error: 'Current password incorrect.' });
        }

        let updates = {
            full_name: fullName,
            email,
            username,
            updated_at: new Date()
        };

        if (newPassword && newPassword.trim().length > 0) {
            updates.password_hash = await bcrypt.hash(newPassword, 10);
        }

        const { data, error } = await supabase.from('users').update(updates).eq('id', req.user.id).select().single();
        if (error) throw error;

        res.json({ success: true, message: 'Profile updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PROFILE UPDATE REQUEST FROM RESIDENT
app.post('/api/resident/request-update', authenticate, authorize(['resident']), async (req, res) => {
    try {
        const { contactNumber, occupation, civilStatus, address } = req.body;
        const { data, error } = await supabase.from('notifications').insert([{
            user_id: req.user.id,
            title: 'Profile Update Requested',
            message: `You requested updates to your profile info (${contactNumber}, ${occupation}, ${civilStatus}, ${address}). Awaiting staff confirmation.`
        }]).select();

        if (error) throw error;
        res.json({ success: true, message: 'Update request sent to staff.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ==========================================
// DYNAMIC SINGLE-PAGE APPLICATION FRONTEND
// ==========================================

app.get('*', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Barangay Resident Management System</title>
    <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
    <style>
        :root {
            --primary-green: #10b981;
            --dark-green: #047857;
            --light-green: #d1fae5;
            --primary-blue: #0284c7;
            --dark-blue: #0369a1;
            --light-blue: #e0f2fe;
            --bg-neutral: #f8fafc;
            --card-bg: #ffffff;
            --text-main: #0f172a;
            --text-muted: #64748b;
            --border-color: #e2e8f0;
            --danger: #ef4444;
            --warning: #f59e0b;
            --success: #10b981;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background-color: var(--bg-neutral); color: var(--text-main); min-height: 100vh; display: flex; flex-direction: column; }

        /* HEADER & NAVIGATION */
        header { background: linear-gradient(135deg, var(--dark-green), var(--dark-blue)); color: white; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        .branding { display: flex; align-items: center; gap: 1rem; }
        .branding img { width: 50px; height: 50px; border-radius: 50%; background: white; object-fit: cover; }
        .branding h1 { font-size: 1.25rem; font-weight: 700; }
        .nav-tools { display: flex; align-items: center; gap: 1rem; }

        .btn { padding: 0.5rem 1rem; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 0.5rem; text-decoration: none; font-size: 0.9rem; }
        .btn-green { background-color: var(--primary-green); color: white; }
        .btn-green:hover { background-color: var(--dark-green); }
        .btn-blue { background-color: var(--primary-blue); color: white; }
        .btn-blue:hover { background-color: var(--dark-blue); }
        .btn-danger { background-color: var(--danger); color: white; }
        .btn-secondary { background-color: #cbd5e1; color: #334155; }
        .btn-secondary:hover { background-color: #94a3b8; }

        /* LAYOUT & SIDEBAR */
        .app-container { display: flex; flex: 1; }
        aside { width: 260px; background: white; border-right: 1px solid var(--border-color); padding: 1.5rem 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
        aside button { width: 100%; text-align: left; padding: 0.75rem 1rem; border: none; background: none; border-radius: 6px; color: var(--text-muted); font-weight: 600; cursor: pointer; }
        aside button:hover, aside button.active { background-color: var(--light-blue); color: var(--primary-blue); }

        main { flex: 1; padding: 2rem; overflow-y: auto; }

        /* CARDS & GRID */
        .grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
        .stat-card { background: white; padding: 1.5rem; border-radius: 8px; border-left: 5px solid var(--primary-green); box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .stat-card.blue { border-left-color: var(--primary-blue); }
        .stat-card.warning { border-left-color: var(--warning); }
        .stat-card.danger { border-left-color: var(--danger); }
        .stat-card h3 { font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; }
        .stat-card .val { font-size: 1.8rem; font-weight: 700; margin-top: 0.5rem; }

        /* TABLES */
        .table-container { background: white; border-radius: 8px; border: 1px solid var(--border-color); overflow-x: auto; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem; }
        th { background: #f1f5f9; padding: 0.75rem 1rem; color: var(--text-muted); font-weight: 600; }
        td { padding: 0.75rem 1rem; border-top: 1px solid var(--border-color); }
        tr:hover { background-color: #f8fafc; }

        /* BADGES */
        .badge { padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 700; }
        .badge-success { background: var(--light-green); color: var(--dark-green); }
        .badge-warning { background: #fef3c7; color: #b45309; }
        .badge-danger { background: #fee2e2; color: #b91c1c; }

        /* FORMS & MODALS */
        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; margin-bottom: 0.4rem; font-weight: 600; font-size: 0.85rem; }
        .form-control { width: 100%; padding: 0.6rem 0.8rem; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.9rem; }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; }
        .modal { background: white; padding: 2rem; border-radius: 8px; width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; }

        /* DIGITAL ID DESIGN */
        .id-card { width: 350px; height: 220px; border-radius: 10px; background: linear-gradient(135deg, #047857, #0284c7); color: white; padding: 12px; position: relative; box-shadow: 0 4px 10px rgba(0,0,0,0.2); font-size: 0.8rem; display: inline-block; margin: 10px; vertical-align: top; }
        .id-card-header { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 6px; }
        .id-card-header img { width: 35px; height: 35px; border-radius: 50%; background: white; }
        .id-card-body { display: flex; gap: 10px; margin-top: 10px; }
        .id-card-photo { width: 80px; height: 80px; border-radius: 6px; background: #fff; object-fit: cover; border: 2px solid white; }
        .id-card-details { flex: 1; }
        .id-card-details div { margin-bottom: 3px; }
        .id-card-qr { position: absolute; bottom: 10px; right: 10px; background: white; padding: 4px; border-radius: 4px; }

        /* PRINT MEDIA CONTROL */
        @media print {
            body * { visibility: hidden; }
            #print-area, #print-area * { visibility: visible; }
            #print-area { position: absolute; left: 0; top: 0; width: 100%; }
            .no-print { display: none !important; }
            .page-break { page-break-after: always; }
        }

        .print-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; width: 100%; max-width: 800px; margin: auto; }
    </style>
</head>
<body>
    <div id="app">Loading Barangay System...</div>
    <div id="print-area"></div>

    <script>
        // CLIENT STATE
        let currentUser = null;
        let systemSettings = {};
        let activeTab = 'dashboard';

        // INIT
        async function initApp() {
            await fetchSettings();
            const res = await fetch('/api/setup/status');
            const data = await res.json();

            if (data.setupRequired) {
                renderFirstSetup();
            } else {
                renderLogin();
            }
        }

        async function fetchSettings() {
            try {
                const res = await fetch('/api/settings');
                systemSettings = await res.json();
            } catch(e) {
                systemSettings = { barangay_name: 'Barangay Central' };
            }
        }

        // INITIAL ADMIN SETUP SCREEN
        function renderFirstSetup() {
            document.getElementById('app').innerHTML = \`
                <div style="max-width: 450px; margin: 4rem auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <h2 style="color: var(--dark-green); margin-bottom: 0.5rem;">Initial Admin Setup</h2>
                    <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1.5rem;">No administrator account exists yet. Please create the first administrator account to initialize the system.</p>
                    <form onsubmit="handleFirstSetup(event)">
                        <div class="form-group">
                            <label>Admin Full Name</label>
                            <input type="text" id="setupName" class="form-control" required />
                        </div>
                        <div class="form-group">
                            <label>Username</label>
                            <input type="text" id="setupUsername" class="form-control" required />
                        </div>
                        <div class="form-group">
                            <label>Email Address</label>
                            <input type="email" id="setupEmail" class="form-control" required />
                        </div>
                        <div class="form-group">
                            <label>Password</label>
                            <input type="password" id="setupPassword" class="form-control" required />
                        </div>
                        <div class="form-group">
                            <label>Confirm Password</label>
                            <input type="password" id="setupConfirm" class="form-control" required />
                        </div>
                        <button type="submit" class="btn btn-green" style="width: 100%;">Create Admin Account</button>
                    </form>
                </div>
            \`;
        }

        async function handleFirstSetup(e) {
            e.preventDefault();
            const payload = {
                fullName: document.getElementById('setupName').value,
                username: document.getElementById('setupUsername').value,
                email: document.getElementById('setupEmail').value,
                password: document.getElementById('setupPassword').value,
                confirmPassword: document.getElementById('setupConfirm').value
            };

            const res = await fetch('/api/setup/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                alert('Administrator account created successfully! Please login.');
                renderLogin();
            } else {
                alert(data.error || 'Failed to setup admin account.');
            }
        }

        // LOGIN SCREEN
        function renderLogin() {
            document.getElementById('app').innerHTML = \`
                <div style="max-width: 400px; margin: 4rem auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <div style="text-align: center; margin-bottom: 1.5rem;">
                        <img src="\${systemSettings.logo_url || 'https://via.placeholder.com/80'}" style="width: 70px; height: 70px; border-radius: 50%;" />
                        <h2 style="color: var(--dark-green); margin-top: 0.5rem;">\${systemSettings.barangay_name || 'Barangay Portal'}</h2>
                        <p style="color: var(--text-muted); font-size: 0.85rem;">System Login</p>
                    </div>
                    <form onsubmit="handleLogin(event)">
                        <div class="form-group">
                            <label>Username or Email</label>
                            <input type="text" id="loginUsername" class="form-control" required />
                        </div>
                        <div class="form-group">
                            <label>Password</label>
                            <input type="password" id="loginPassword" class="form-control" required />
                        </div>
                        <button type="submit" class="btn btn-blue" style="width: 100%; margin-top: 0.5rem;">Sign In</button>
                    </form>
                    <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid var(--border-color);" />
                    <div style="text-align: center;">
                        <p style="font-size: 0.85rem; color: var(--text-muted);">New resident in this barangay?</p>
                        <button onclick="renderRegistration()" class="btn btn-green" style="width: 100%; margin-top: 0.5rem;">Register as Resident</button>
                    </div>
                </div>
            \`;
        }

        async function handleLogin(e) {
            e.preventDefault();
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: document.getElementById('loginUsername').value,
                    password: document.getElementById('loginPassword').value
                })
            });
            const data = await res.json();

            if (data.success) {
                currentUser = data.user;
                renderPortal();
            } else {
                alert(data.error || 'Login failed.');
            }
        }

        // PUBLIC RESIDENT REGISTRATION
        async function renderRegistration() {
            const puroksRes = await fetch('/api/puroks');
            const puroks = await puroksRes.json();

            document.getElementById('app').innerHTML = \`
                <div style="max-width: 700px; margin: 2rem auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <h2 style="color: var(--dark-green); margin-bottom: 0.5rem;">Resident Registration</h2>
                    <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1.5rem;">Fill out the official form. Your application will be reviewed by Barangay staff.</p>
                    
                    <form onsubmit="handleRegistration(event)">
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <label>First Name *</label>
                                <input type="text" id="regFirst" class="form-control" required />
                            </div>
                            <div class="form-group">
                                <label>Middle Name</label>
                                <input type="text" id="regMiddle" class="form-control" />
                            </div>
                            <div class="form-group">
                                <label>Last Name *</label>
                                <input type="text" id="regLast" class="form-control" required />
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <label>Suffix</label>
                                <input type="text" id="regSuffix" class="form-control" placeholder="e.g. Jr, III" />
                            </div>
                            <div class="form-group">
                                <label>Date of Birth *</label>
                                <input type="date" id="regDob" class="form-control" required />
                            </div>
                            <div class="form-group">
                                <label>Gender *</label>
                                <select id="regGender" class="form-control" required>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <label>Civil Status *</label>
                                <select id="regCivil" class="form-control" required>
                                    <option value="Single">Single</option>
                                    <option value="Married">Married</option>
                                    <option value="Widowed">Widowed</option>
                                    <option value="Separated">Separated</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Purok *</label>
                                <select id="regPurok" class="form-control">
                                    \${puroks.map(p => \`<option value="\${p.id}">\${p.name}</option>\`).join('')}
                                </select>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Complete Address *</label>
                            <input type="text" id="regAddress" class="form-control" required />
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <label>Contact Number</label>
                                <input type="text" id="regContact" class="form-control" />
                            </div>
                            <div class="form-group">
                                <label>Email Address *</label>
                                <input type="email" id="regEmail" class="form-control" required />
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <label>Username *</label>
                                <input type="text" id="regUsername" class="form-control" required />
                            </div>
                            <div class="form-group">
                                <label>Password *</label>
                                <input type="password" id="regPassword" class="form-control" required />
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-top: 0.5rem;">
                            <label><input type="checkbox" id="regSenior" /> Senior Citizen</label>
                            <label><input type="checkbox" id="regPwd" /> PWD</label>
                            <label><input type="checkbox" id="regSolo" /> Solo Parent</label>
                        </div>

                        <div class="form-group" style="margin-top: 1rem;">
                            <label>Profile Photo</label>
                            <input type="file" id="regPhoto" accept="image/*" class="form-control" />
                        </div>

                        <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                            <button type="button" onclick="renderLogin()" class="btn btn-secondary">Back to Login</button>
                            <button type="submit" class="btn btn-green" style="flex:1;">Submit Registration</button>
                        </div>
                    </form>
                </div>
            \`;
        }

        async function handleRegistration(e) {
            e.preventDefault();
            const formData = new FormData();
            formData.append('firstName', document.getElementById('regFirst').value);
            formData.append('middleName', document.getElementById('regMiddle').value);
            formData.append('lastName', document.getElementById('regLast').value);
            formData.append('suffix', document.getElementById('regSuffix').value);
            formData.append('dateOfBirth', document.getElementById('regDob').value);
            formData.append('gender', document.getElementById('regGender').value);
            formData.append('civilStatus', document.getElementById('regCivil').value);
            formData.append('purokId', document.getElementById('regPurok').value);
            formData.append('address', document.getElementById('regAddress').value);
            formData.append('contactNumber', document.getElementById('regContact').value);
            formData.append('email', document.getElementById('regEmail').value);
            formData.append('username', document.getElementById('regUsername').value);
            formData.append('password', document.getElementById('regPassword').value);
            formData.append('isSenior', document.getElementById('regSenior').checked);
            formData.append('isPwd', document.getElementById('regPwd').checked);
            formData.append('isSoloParent', document.getElementById('regSolo').checked);

            const fileInput = document.getElementById('regPhoto');
            if (fileInput.files[0]) {
                formData.append('profilePhoto', fileInput.files[0]);
            }

            const res = await fetch('/api/auth/register-resident', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (data.success) {
                document.getElementById('app').innerHTML = \`
                    <div style="max-width: 500px; margin: 4rem auto; background: white; padding: 2rem; border-radius: 8px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                        <h2 style="color: var(--primary-green);">Registration Successful</h2>
                        <p style="margin: 1rem 0; color: var(--text-muted);">Your registration is currently: <strong>PENDING APPROVAL</strong>.</p>
                        <p style="font-size: 0.85rem; color: var(--text-muted);">Please wait for barangay staff to review your submitted information. You can try logging in later.</p>
                        <button onclick="renderLogin()" class="btn btn-blue" style="margin-top: 1.5rem;">Go to Login</button>
                    </div>
                \`;
            } else {
                alert(data.error || 'Registration failed.');
            }
        }

        // MAIN PORTAL CONTAINER (STAFF & RESIDENT)
        function renderPortal() {
            const isStaff = ['admin', 'captain', 'secretary', 'staff'].includes(currentUser.role);

            document.getElementById('app').innerHTML = \`
                <header>
                    <div class="branding">
                        <img src="\${systemSettings.logo_url || 'https://via.placeholder.com/50'}" />
                        <div>
                            <h1>\${systemSettings.barangay_name}</h1>
                            <div style="font-size: 0.75rem; opacity: 0.8;">\${systemSettings.municipality}, \${systemSettings.province}</div>
                        </div>
                    </div>
                    <div class="nav-tools">
                        <span>Welcome, <strong>\${currentUser.name}</strong> (\${currentUser.role.toUpperCase()})</span>
                        <button onclick="handleLogout()" class="btn btn-danger">Logout</button>
                    </div>
                </header>
                <div class="app-container">
                    <aside id="sidebar-nav"></aside>
                    <main id="portal-content"></main>
                </div>
            \`;

            renderSidebar(isStaff);
            loadTab('dashboard');
        }

        function renderSidebar(isStaff) {
            const nav = document.getElementById('sidebar-nav');
            if (isStaff) {
                nav.innerHTML = \`
                    <button onclick="loadTab('dashboard')" class="active">Dashboard</button>
                    <button onclick="loadTab('residents')">Resident Records</button>
                    <button onclick="loadTab('households')">Households</button>
                    <button onclick="loadTab('puroks')">Puroks</button>
                    <button onclick="loadTab('certificates')">Certificates</button>
                    <button onclick="loadTab('appointments')">Appointments</button>
                    <button onclick="loadTab('complaints')">Blotter / Complaints</button>
                    <button onclick="loadTab('assistance')">Assistance Requests</button>
                    <button onclick="loadTab('announcements')">Announcements</button>
                    <button onclick="loadTab('businesses')">Local Businesses</button>
                    <button onclick="loadTab('printing')">Batch Print IDs</button>
                    \${currentUser.role === 'admin' ? \`<button onclick="loadTab('settings')">Barangay Settings</button>\` : ''}
                \`;
            } else {
                nav.innerHTML = \`
                    <button onclick="loadTab('res-dashboard')" class="active">My Dashboard</button>
                    <button onclick="loadTab('res-profile')">My Profile</button>
                    <button onclick="loadTab('res-id')">My Digital ID</button>
                    <button onclick="loadTab('res-certificates')">Request Certificate</button>
                    <button onclick="loadTab('res-appointments')">Book Appointment</button>
                    <button onclick="loadTab('res-complaints')">Report Incident</button>
                    <button onclick="loadTab('res-assistance')">Request Assistance</button>
                \`;
            }
        }

        async function loadTab(tab) {
            activeTab = tab;
            const content = document.getElementById('portal-content');
            content.innerHTML = '<p>Loading page content...</p>';

            if (tab === 'dashboard') {
                const res = await fetch('/api/stats/dashboard');
                const s = await res.json();
                content.innerHTML = \`
                    <h2>Staff Control Dashboard</h2>
                    <div class="grid-4" style="margin-top: 1rem;">
                        <div class="stat-card"><h3>Total Residents</h3><div class="val">\${s.totalResidents}</div></div>
                        <div class="stat-card warning"><h3>Pending Approvals</h3><div class="val">\${s.pendingResidents}</div></div>
                        <div class="stat-card blue"><h3>Approved Residents</h3><div class="val">\${s.approvedResidents}</div></div>
                        <div class="stat-card danger"><h3>Rejected Requests</h3><div class="val">\${s.rejectedResidents}</div></div>
                        <div class="stat-card"><h3>Senior Citizens</h3><div class="val">\${s.seniorCitizens}</div></div>
                        <div class="stat-card blue"><h3>PWD</h3><div class="val">\${s.pwd}</div></div>
                        <div class="stat-card warning"><h3>Pending Certificates</h3><div class="val">\${s.pendingCertificates}</div></div>
                        <div class="stat-card danger"><h3>Active Complaints</h3><div class="val">\${s.pendingComplaints}</div></div>
                    </div>
                \`;
            } else if (tab === 'residents') {
                const res = await fetch('/api/residents');
                const residents = await res.json();
                content.innerHTML = \`
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h2>Resident Management</h2>
                        <input type="text" placeholder="Search residents..." class="form-control" style="width: 250px;" onkeyup="filterResidentTable(this.value)" />
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Full Name</th>
                                    <th>Gender</th>
                                    <th>Address</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="res-tbl">
                                \${residents.map(r => \`
                                    <tr>
                                        <td>\${r.resident_id || 'PENDING'}</td>
                                        <td>\${r.first_name} \${r.last_name}</td>
                                        <td>\${r.gender}</td>
                                        <td>\${r.address}</td>
                                        <td><span class="badge \${r.approval_status === 'Approved' ? 'badge-success' : (r.approval_status === 'Pending' ? 'badge-warning' : 'badge-danger')}">\${r.approval_status}</span></td>
                                        <td>
                                            \${r.approval_status === 'Pending' ? \`
                                                <button onclick="reviewResident('\${r.id}', 'Approved')" class="btn btn-green" style="padding: 0.2rem 0.5rem; font-size:0.75rem;">Approve</button>
                                                <button onclick="reviewResident('\${r.id}', 'Rejected')" class="btn btn-danger" style="padding: 0.2rem 0.5rem; font-size:0.75rem;">Reject</button>
                                            \` : ''}
                                            <button onclick="toggleArchiveResident('\${r.id}', \${!r.is_archived})" class="btn btn-secondary" style="padding: 0.2rem 0.5rem; font-size:0.75rem;">\${r.is_archived ? 'Restore' : 'Archive'}</button>
                                        </td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    </div>
                \`;
            } else if (tab === 'settings') {
                content.innerHTML = \`
                    <h2>Barangay Settings</h2>
                    <form onsubmit="saveSettings(event)" style="max-width: 600px; margin-top: 1rem; background: white; padding: 1.5rem; border-radius: 8px;">
                        <div class="form-group">
                            <label>Barangay Name</label>
                            <input type="text" id="setBrgy" class="form-control" value="\${systemSettings.barangay_name || ''}" required />
                        </div>
                        <div class="form-group">
                            <label>Municipality</label>
                            <input type="text" id="setMuni" class="form-control" value="\${systemSettings.municipality || ''}" required />
                        </div>
                        <div class="form-group">
                            <label>Province</label>
                            <input type="text" id="setProv" class="form-control" value="\${systemSettings.province || ''}" required />
                        </div>
                        <div class="form-group">
                            <label>Captain Name</label>
                            <input type="text" id="setCap" class="form-control" value="\${systemSettings.captain_name || ''}" />
                        </div>
                        <div class="form-group">
                            <label>Barangay Logo</label>
                            <input type="file" id="setLogo" class="form-control" accept="image/*" />
                        </div>
                        <button type="submit" class="btn btn-green">Save Changes</button>
                    </form>
                \`;
            } else if (tab === 'printing') {
                const res = await fetch('/api/residents?status=Approved');
                const residents = await res.json();
                content.innerHTML = \`
                    <h2>Physical ID Batch Printer</h2>
                    <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">Select up to 8 approved residents to generate standard 8-cards-per-bond-paper print layout.</p>
                    <button onclick="triggerPrintBatch()" class="btn btn-blue" style="margin-bottom: 1rem;">Print Selected (Max 8)</button>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Select</th>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Address</th>
                                </tr>
                            </thead>
                            <tbody>
                                \${residents.map(r => \`
                                    <tr>
                                        <td><input type="checkbox" class="id-print-checkbox" value="\${r.id}" data-json='\${JSON.stringify(r)}' /></td>
                                        <td>\${r.resident_id}</td>
                                        <td>\${r.first_name} \${r.last_name}</td>
                                        <td>\${r.address}</td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    </div>
                \`;
            } else if (tab === 'res-id') {
                const res = await fetch('/api/residents');
                const list = await res.json();
                const myRec = list[0] || {};
                
                content.innerHTML = \`
                    <h2>My Official Digital ID</h2>
                    <div style="margin-top: 1.5rem;">
                        <div class="id-card" id="digital-id-card">
                            <div class="id-card-header">
                                <img src="\${systemSettings.logo_url || 'https://via.placeholder.com/35'}" />
                                <div>
                                    <div style="font-weight:700; font-size: 0.75rem;">\${systemSettings.barangay_name}</div>
                                    <div style="font-size: 0.6rem; opacity:0.8;">\${systemSettings.municipality}</div>
                                </div>
                            </div>
                            <div class="id-card-body">
                                <img src="\${myRec.profile_photo || 'https://via.placeholder.com/80'}" class="id-card-photo" />
                                <div class="id-card-details">
                                    <div style="font-weight:700; font-size: 0.9rem;">\${myRec.first_name} \${myRec.last_name}</div>
                                    <div>ID: <strong>\${myRec.resident_id || 'PENDING'}</strong></div>
                                    <div>DOB: \${myRec.date_of_birth}</div>
                                    <div>Status: ACTIVE</div>
                                </div>
                            </div>
                            <div class="id-card-qr" id="qrcode-box"></div>
                        </div>
                    </div>
                \`;

                if (myRec.resident_id) {
                    setTimeout(() => {
                        QRCode.toCanvas(document.getElementById('qrcode-box'), \`\${window.location.origin}/api/verify/resident/\${myRec.resident_id}\`, { width: 50 });
                    }, 100);
                }
            } else {
                content.innerHTML = \`<h2>Module Page</h2><p>Interface loaded for \${tab}.</p>\`;
            }
        }

        async function reviewResident(id, status) {
            let reason = '';
            if (status === 'Rejected') {
                reason = prompt('Enter rejection reason:');
                if (!reason) return;
            }

            const res = await fetch('/api/residents/approve-reject', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ residentId: id, status, rejectionReason: reason })
            });
            const data = await res.json();

            if (data.success) {
                alert(\`Resident application \${status}.\`);
                loadTab('residents');
            }
        }

        async function toggleArchiveResident(id, archive) {
            if (!confirm(\`Are you sure you want to \${archive ? 'archive' : 'restore'} this record?\`)) return;

            const res = await fetch('/api/residents/archive-toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ residentId: id, archive })
            });
            const data = await res.json();

            if (data.success) {
                loadTab('residents');
            }
        }

        async function saveSettings(e) {
            e.preventDefault();
            const formData = new FormData();
            formData.append('barangayName', document.getElementById('setBrgy').value);
            formData.append('municipality', document.getElementById('setMuni').value);
            formData.append('province', document.getElementById('setProv').value);
            formData.append('captainName', document.getElementById('setCap').value);
            
            const logo = document.getElementById('setLogo').files[0];
            if (logo) formData.append('logo', logo);

            const res = await fetch('/api/settings', { method: 'POST', body: formData });
            const data = await res.json();

            if (data.success) {
                alert('Barangay Settings updated!');
                await fetchSettings();
                renderPortal();
            }
        }

        function triggerPrintBatch() {
            const checked = Array.from(document.querySelectorAll('.id-print-checkbox:checked'));
            if (checked.length === 0 || checked.length > 8) {
                alert('Please select between 1 and 8 residents to print.');
                return;
            }

            const printArea = document.getElementById('print-area');
            printArea.innerHTML = \`<div class="print-grid" id="print-grid-target"></div>\`;
            const grid = document.getElementById('print-grid-target');

            checked.forEach((cb, idx) => {
                const r = JSON.parse(cb.getAttribute('data-json'));
                const card = document.createElement('div');
                card.className = 'id-card';
                card.innerHTML = \`
                    <div class="id-card-header">
                        <img src="\${systemSettings.logo_url || ''}" />
                        <div>
                            <div style="font-weight:700;">\${systemSettings.barangay_name}</div>
                            <div style="font-size:0.6rem;">\${systemSettings.municipality}</div>
                        </div>
                    </div>
                    <div class="id-card-body">
                        <img src="\${r.profile_photo || 'https://via.placeholder.com/80'}" class="id-card-photo" />
                        <div class="id-card-details">
                            <div style="font-weight:700;">\${r.first_name} \${r.last_name}</div>
                            <div>ID: \${r.resident_id}</div>
                            <div>DOB: \${r.date_of_birth}</div>
                        </div>
                    </div>
                    <div class="id-card-qr" id="print-qr-\${idx}"></div>
                \`;
                grid.appendChild(card);

                setTimeout(() => {
                    QRCode.toCanvas(document.getElementById(\`print-qr-\${idx}\`), \`\${window.location.origin}/api/verify/resident/\${r.resident_id}\`, { width: 45 });
                }, 50);
            });

            setTimeout(() => {
                window.print();
            }, 500);
        }

        async function handleLogout() {
            await fetch('/api/auth/logout', { method: 'POST' });
            currentUser = null;
            renderLogin();
        }

        // STARTUP
        window.onload = initApp;
    </script>
</body>
</html>
    `);
});

// START EXPRESS SERVER
app.listen(PORT, () => {
    console.log(`Barangay Resident Management System running on port ${PORT}`);
});
