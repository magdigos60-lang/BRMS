/**
 * Barangay Resident Management System
 * Complete Single-File Node.js Express Application (app.js)
 * Includes both Staff Portal and Resident Portal with full CRUD, Auth, Seed Data, and Tailwind CSS.
 */

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware setup
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'barangay-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// In-Memory Database Store with Sample Seed Data
const db = {
    users: [
        { id: 1, username: 'admin', passwordHash: bcrypt.hashSync('admin123', 8), role: 'Admin', name: 'Kapitan Juan Dela Cruz', email: 'admin@barangay.gov.ph', status: 'Active' },
        { id: 2, username: 'secretary', passwordHash: bcrypt.hashSync('sec123', 8), role: 'Secretary', name: 'Maria Santos', email: 'secretary@barangay.gov.ph', status: 'Active' },
        { id: 3, username: 'staff', passwordHash: bcrypt.hashSync('staff123', 8), role: 'Staff', name: 'Pedro Reyes', email: 'staff@barangay.gov.ph', status: 'Active' },
        { id: 4, username: 'resident1', passwordHash: bcrypt.hashSync('res123', 8), role: 'Resident', name: 'Juanito Gomez Jr.', email: 'juanito@gmail.com', residentId: 'RES-2026-0001', status: 'Active' },
        { id: 5, username: 'resident2', passwordHash: bcrypt.hashSync('res123', 8), role: 'Resident', name: 'Elena Gomez', email: 'elena@gmail.com', residentId: 'RES-2026-0002', status: 'Active' }
    ],
    residents: [
        {
            residentId: 'RES-2026-0001',
            firstName: 'Juanito',
            middleName: 'Santos',
            lastName: 'Gomez',
            suffix: 'Jr.',
            dob: '1985-05-12',
            age: 41,
            gender: 'Male',
            civilStatus: 'Married',
            address: 'Blk 3 Lot 12, Sunflower St.',
            purok: 'Purok 1 - Maligaya',
            contactNumber: '09123456789',
            email: 'juanito@gmail.com',
            occupation: 'Carpenter',
            educationalAttainment: 'High School Graduate',
            nationality: 'Filipino',
            voterStatus: 'Registered Voter',
            category: 'Regular Resident',
            dateRegistered: '2024-01-15',
            photo: 'https://placehold.co/150x150/1e40af/ffffff?text=JG',
            householdNo: 'HH-101'
        },
        {
            residentId: 'RES-2026-0002',
            firstName: 'Elena',
            middleName: 'Cruz',
            lastName: 'Gomez',
            suffix: '',
            dob: '1988-09-20',
            age: 37,
            gender: 'Female',
            civilStatus: 'Married',
            address: 'Blk 3 Lot 12, Sunflower St.',
            purok: 'Purok 1 - Maligaya',
            contactNumber: '09187654321',
            email: 'elena@gmail.com',
            occupation: 'Vendor',
            educationalAttainment: 'College Undergraduate',
            nationality: 'Filipino',
            voterStatus: 'Registered Voter',
            category: 'Solo Parent',
            dateRegistered: '2024-01-16',
            photo: 'https://placehold.co/150x150/db2777/ffffff?text=EG',
            householdNo: 'HH-101'
        },
        {
            residentId: 'RES-2026-0003',
            firstName: 'Lolo',
            middleName: 'Alvarez',
            lastName: 'Mercado',
            suffix: 'Sr.',
            dob: '1950-02-10',
            age: 76,
            gender: 'Male',
            civilStatus: 'Widowed',
            address: '45 Rosas St.',
            purok: 'Purok 2 - Maharlika',
            contactNumber: '09198765432',
            email: 'lolo.mer@gmail.com',
            occupation: 'Retired',
            educationalAttainment: 'Elementary Graduate',
            nationality: 'Filipino',
            voterStatus: 'Registered Voter',
            category: 'Senior Citizen',
            dateRegistered: '2024-02-01',
            photo: 'https://placehold.co/150x150/ca8a04/ffffff?text=LM',
            householdNo: 'HH-102'
        },
        {
            residentId: 'RES-2026-0004',
            firstName: 'Roberto',
            middleName: 'Tan',
            lastName: 'Aquino',
            suffix: '',
            dob: '1995-11-05',
            age: 30,
            gender: 'Male',
            civilStatus: 'Single',
            address: '12 Orchid St.',
            purok: 'Purok 3 - Bagong Silang',
            contactNumber: '09223334455',
            email: 'roberto@gmail.com',
            occupation: 'Driver',
            educationalAttainment: 'Vocational',
            nationality: 'Filipino',
            voterStatus: 'Registered Voter',
            category: 'PWD',
            dateRegistered: '2024-03-10',
            photo: 'https://placehold.co/150x150/0d9488/ffffff?text=RA',
            householdNo: 'HH-103'
        }
    ],
    households: [
        { householdNo: 'HH-101', headName: 'Juanito S. Gomez Jr.', address: 'Blk 3 Lot 12, Sunflower St.', purok: 'Purok 1 - Maligaya', membersCount: 2, members: ['Juanito Gomez Jr.', 'Elena Gomez'] },
        { householdNo: 'HH-102', headName: 'Lolo Alvarez Mercado', address: '45 Rosas St.', purok: 'Purok 2 - Maharlika', membersCount: 1, members: ['Lolo Alvarez Mercado'] },
        { householdNo: 'HH-103', headName: 'Roberto Tan Aquino', address: '12 Orchid St.', purok: 'Purok 3 - Bagong Silang', membersCount: 1, members: ['Roberto Tan Aquino'] }
    ],
    puroks: [
        { id: 1, name: 'Purok 1 - Maligaya', leader: 'Mang Ambo', description: 'Northern section near elementary school' },
        { id: 2, name: 'Purok 2 - Maharlika', leader: 'Aling Nena', description: 'Central commercial zone' },
        { id: 3, name: 'Purok 3 - Bagong Silang', leader: 'Kagawad Nestor', description: 'Eastern residential phase' }
    ],
    certificates: [
        { certNo: 'CRT-2026-0001', residentName: 'Juanito S. Gomez Jr.', type: 'Barangay Clearance', dateRequested: '2026-03-01', dateApproved: '2026-03-02', dateReleased: '2026-03-02', status: 'Released', remarks: 'Purpose: Employment' },
        { certNo: 'CRT-2026-0002', residentName: 'Elena Cruz Gomez', type: 'Certificate of Indigency', dateRequested: '2026-03-05', dateApproved: '2026-03-05', dateReleased: '', status: 'Ready for Release', remarks: 'Medical assistance purpose' }
    ],
    requests: [
        { id: 1, reqNo: 'REQ-0001', residentName: 'Juanito S. Gomez Jr.', type: 'Barangay Clearance', status: 'Approved', dateSubmitted: '2026-03-01', remarks: 'All clear', releaseDate: '2026-03-02' },
        { id: 2, reqNo: 'REQ-0002', residentName: 'Elena Cruz Gomez', type: 'Certificate of Indigency', status: 'Processing', dateSubmitted: '2026-03-04', remarks: 'Checking records', releaseDate: '' },
        { id: 3, reqNo: 'REQ-0003', residentName: 'Lolo Alvarez Mercado', type: 'Certificate of Residency', status: 'Submitted', dateSubmitted: '2026-03-06', remarks: '', releaseDate: '' }
    ],
    blotters: [
        { caseNo: 'BLT-2026-0001', complainant: 'Maria Santos', respondent: 'Cardo Dalisay', witness: 'Barangay Tanod', incidentDate: '2026-02-15', incidentTime: '21:30', location: 'Purok 2 Basketball Court', type: 'Noise Disturbance', description: 'Loud karaoke past midnight causing public disturbance.', actionTaken: 'Summoned both parties for amicable settlement.', settlement: 'Settled via Katarungang Pambarangay', status: 'Closed' },
        { caseNo: 'BLT-2026-0002', complainant: 'Elena Gomez', respondent: 'Neighbor Anonymous', witness: 'None', incidentDate: '2026-03-02', incidentTime: '08:00', location: 'Sunflower St.', type: 'Property Boundary Dispute', description: 'Dispute over fence encroachment.', actionTaken: 'Scheduled ocular inspection by Purok leader.', settlement: 'Pending mediation', status: 'Under Investigation' }
    ],
    appointments: [
        { id: 1, date: '2026-03-10', time: '10:00 AM', residentName: 'Juanito S. Gomez Jr.', service: 'Certificate Processing', status: 'Approved' },
        { id: 2, date: '2026-03-12', time: '02:00 PM', residentName: 'Lolo Alvarez Mercado', service: 'Barangay Assistance', status: 'Pending' }
    ],
    assistances: [
        { id: 1, residentName: 'Elena Cruz Gomez', type: 'Medical Assistance', amount: '5,000 PHP', date: '2026-02-10', status: 'Approved', remarks: 'For laboratory medicines' },
        { id: 2, residentName: 'Lolo Alvarez Mercado', type: 'Financial Assistance', amount: '3,000 PHP', date: '2026-02-20', status: 'Reviewing', remarks: 'Evaluating requirements' }
    ],
    businesses: [
        { businessId: 'BUS-101', businessName: 'Gomez Sari-Sari Store', owner: 'Elena Cruz Gomez', address: 'Blk 3 Lot 12 Sunflower St.', purok: 'Purok 1 - Maligaya', businessType: 'Retail', contactNumber: '09187654321', registrationDate: '2024-05-10', permitStatus: 'Active', expirationDate: '2027-05-10' },
        { businessId: 'BUS-102', businessName: 'Mercado Auto Repair Shop', owner: 'Lolo Mercado', address: '45 Rosas St.', purok: 'Purok 2 - Maharlika', businessType: 'Services', contactNumber: '09198765432', registrationDate: '2023-08-15', permitStatus: 'Active', expirationDate: '2026-08-15' }
    ],
    announcements: [
        { id: 1, title: 'Free Medical and Dental Mission', description: 'All residents are invited for free checkup and medicines at the Barangay Covered Court this coming Saturday at 8:00 AM.', date: '2026-03-15', category: 'Health & Medical', status: 'Published' },
        { id: 2, title: 'General Barangay Assembly', description: 'Quarterly assembly to discuss barangay budget, projects, and security measures.', date: '2026-03-20', category: 'Meeting', status: 'Published' },
        { id: 3, title: 'Scheduled Power Interruption', description: 'Meralco maintenance affecting Purok 1 and Purok 2 on Sunday from 6AM to 12NN.', date: '2026-03-12', category: 'Emergency Notice', status: 'Published' }
    ],
    complaints: [
        { id: 1, type: 'Garbage Collection', subject: 'Uncollected Trash on Sunflower St.', description: 'Garbage truck missed our street for two consecutive days.', date: '2026-03-05', location: 'Sunflower St.', status: 'Under Review', residentName: 'Juanito S. Gomez Jr.' }
    ],
    feedbacks: [
        { id: 1, residentName: 'Juanito S. Gomez Jr.', rating: 5, comments: 'Very fast service when claiming my clearance. Thank you staff!', date: '2026-03-02' }
    ],
    profileUpdates: [
        { id: 1, residentId: 'RES-2026-0001', requestedChanges: 'Contact number updated to 09998887766, Occupation: Senior Carpenter', status: 'Pending', date: '2026-03-05' }
    ],
    activityLogs: [
        { user: 'admin', action: 'System Seeded & Initialized', date: '2026-01-01', time: '08:00:00' },
        { user: 'secretary', action: 'Created Certificate CRT-2026-0001', date: '2026-03-01', time: '09:15:30' },
        { user: 'resident1', action: 'Submitted Certificate Request REQ-0003', date: '2026-03-06', time: '14:22:10' }
    ],
    notifications: [
        { id: 1, residentName: 'Juanito S. Gomez Jr.', message: 'Your Certificate Request REQ-0001 has been Approved!', date: '2026-03-02', read: false },
        { id: 2, residentName: 'Elena Cruz Gomez', message: 'New announcement posted: Free Medical and Dental Mission', date: '2026-03-06', read: false }
    ],
    emergencyContacts: [
        { name: 'Barangay Main Hall Hotline', number: '(02) 8123-4567', category: 'Barangay Hall' },
        { name: 'Punong Barangay Office', number: '0917-555-1234', category: 'Barangay Officials' },
        { name: 'Barangay Police Outpost / Tanod', number: '0918-555-4321', category: 'Police' },
        { name: 'Local Police Station 4', number: '(02) 8987-6543', category: 'Police' },
        { name: 'Municipal Fire Department', number: '(02) 8432-1111', category: 'Fire Department' },
        { name: 'Barangay Health Center', number: '(02) 8555-9988', category: 'Health Center' },
        { name: 'National Emergency Hotline', number: '911', category: 'Emergency Hotline' }
    ]
};

// Helper logger
function logActivity(username, action) {
    const now = new Date();
    db.activityLogs.unshift({
        user: username || 'System',
        action: action,
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().split(' ')[0]
    });
}

// Authentication middleware
function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}

function requireStaff(req, res, next) {
    if (!req.session.user || req.session.user.role === 'Resident') {
        return res.status(403).send('Access Denied: Staff authorization required.');
    }
    next();
}

// Routes - Authentication
app.get('/login', (req, res) => {
    res.send(renderLoginPage(req.query.error));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.users.find(u => u.username === username);
    if (user && bcrypt.compareSync(password, user.passwordHash) && user.status === 'Active') {
        req.session.user = user;
        logActivity(user.username, 'User Logged In');
        if (user.role === 'Resident') {
            return res.redirect('/resident-portal');
        } else {
            return res.redirect('/staff-portal');
        }
    }
    res.redirect('/login?error=Invalid+credentials+or+inactive+account');
});

app.get('/logout', (req, res) => {
    if (req.session.user) {
        logActivity(req.session.user.username, 'User Logged Out');
    }
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

app.get('/', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role === 'Resident') res.redirect('/resident-portal');
    else res.redirect('/staff-portal');
});

// STAFF PORTAL ROUTES
app.get('/staff-portal', requireAuth, requireStaff, (req, res) => {
    const tab = req.query.tab || 'dashboard';
    res.send(renderStaffPortal(req.session.user, tab, db));
});

// Staff CRUD APIs
app.post('/api/residents/add', requireAuth, requireStaff, (req, res) => {
    const body = req.body;
    const newResId = 'RES-2026-' + String(db.residents.length + 10).padStart(4, '0');
    const resident = {
        residentId: newResId,
        firstName: body.firstName,
        middleName: body.middleName || '',
        lastName: body.lastName,
        suffix: body.suffix || '',
        dob: body.dob,
        age: parseInt(body.age) || 25,
        gender: body.gender,
        civilStatus: body.civilStatus,
        address: body.address,
        purok: body.purok,
        contactNumber: body.contactNumber,
        email: body.email,
        occupation: body.occupation,
        educationalAttainment: body.educationalAttainment,
        nationality: body.nationality || 'Filipino',
        voterStatus: body.voterStatus,
        category: body.category,
        dateRegistered: new Date().toISOString().split('T')[0],
        photo: body.photo || `https://placehold.co/150x150/1e40af/ffffff?text=${body.firstName[0]}${body.lastName[0]}`,
        householdNo: body.householdNo || 'HH-101'
    };
    db.residents.push(resident);
    logActivity(req.session.user.username, `Added Resident: ${resident.firstName} ${resident.lastName}`);
    res.redirect('/staff-portal?tab=residents');
});

app.post('/api/residents/edit', requireAuth, requireStaff, (req, res) => {
    const body = req.body;
    const idx = db.residents.findIndex(r => r.residentId === body.residentId);
    if (idx !== -1) {
        db.residents[idx] = { ...db.residents[idx], ...body };
        logActivity(req.session.user.username, `Updated Resident: ${body.residentId}`);
    }
    res.redirect('/staff-portal?tab=residents');
});

app.post('/api/residents/delete', requireAuth, requireStaff, (req, res) => {
    const { residentId } = req.body;
    db.residents = db.residents.filter(r => r.residentId !== residentId);
    logActivity(req.session.user.username, `Archived/Deleted Resident: ${residentId}`);
    res.redirect('/staff-portal?tab=residents');
});

// Household APIs
app.post('/api/households/add', requireAuth, requireStaff, (req, res) => {
    const body = req.body;
    db.households.push({
        householdNo: body.householdNo,
        headName: body.headName,
        address: body.address,
        purok: body.purok,
        membersCount: parseInt(body.membersCount) || 1,
        members: body.members ? body.members.split(',').map(m => m.trim()) : []
    });
    logActivity(req.session.user.username, `Added Household: ${body.householdNo}`);
    res.redirect('/staff-portal?tab=households');
});

// Purok APIs
app.post('/api/puroks/add', requireAuth, requireStaff, (req, res) => {
    const body = req.body;
    db.puroks.push({
        id: db.puroks.length + 1,
        name: body.name,
        leader: body.leader,
        description: body.description
    });
    logActivity(req.session.user.username, `Added Purok: ${body.name}`);
    res.redirect('/staff-portal?tab=puroks');
});

// Certificate APIs
app.post('/api/certificates/add', requireAuth, requireStaff, (req, res) => {
    const body = req.body;
    const certNo = 'CRT-2026-' + String(db.certificates.length + 10).padStart(4, '0');
    db.certificates.push({
        certNo: certNo,
        residentName: body.residentName,
        type: body.type,
        dateRequested: new Date().toISOString().split('T')[0],
        dateApproved: new Date().toISOString().split('T')[0],
        dateReleased: new Date().toISOString().split('T')[0],
        status: 'Released',
        remarks: body.remarks || 'Issued by staff'
    });
    logActivity(req.session.user.username, `Created Certificate ${certNo} for ${body.residentName}`);
    res.redirect('/staff-portal?tab=certificates');
});

// Request Update Status
app.post('/api/requests/update', requireAuth, requireStaff, (req, res) => {
    const { id, status, remarks } = req.body;
    const reqItem = db.requests.find(r => r.id == id);
    if (reqItem) {
        reqItem.status = status;
        if (remarks) reqItem.remarks = remarks;
        if (status === 'Approved' || status === 'Ready for Release') {
            reqItem.releaseDate = new Date().toISOString().split('T')[0];
        }
        logActivity(req.session.user.username, `Updated Request ${reqItem.reqNo} status to ${status}`);
    }
    res.redirect('/staff-portal?tab=requests');
});

// Blotter APIs
app.post('/api/blotters/add', requireAuth, requireStaff, (req, res) => {
    const body = req.body;
    const caseNo = 'BLT-2026-' + String(db.blotters.length + 10).padStart(4, '0');
    db.blotters.push({
        caseNo: caseNo,
        complainant: body.complainant,
        respondent: body.respondent,
        witness: body.witness,
        incidentDate: body.incidentDate,
        incidentTime: body.incidentTime,
        location: body.location,
        type: body.type,
        description: body.description,
        actionTaken: body.actionTaken || 'Initial investigation conducted',
        settlement: body.settlement || 'Ongoing',
        status: body.status || 'Open'
    });
    logActivity(req.session.user.username, `Recorded Blotter Case ${caseNo}`);
    res.redirect('/staff-portal?tab=blotters');
});

// Appointment Management Staff
app.post('/api/appointments/update', requireAuth, requireStaff, (req, res) => {
    const { id, status } = req.body;
    const appt = db.appointments.find(a => a.id == id);
    if (appt) {
        appt.status = status;
        logActivity(req.session.user.username, `Updated Appointment ID ${id} to ${status}`);
    }
    res.redirect('/staff-portal?tab=appointments');
});

// Assistance Management Staff
app.post('/api/assistances/update', requireAuth, requireStaff, (req, res) => {
    const { id, status, remarks } = req.body;
    const ast = db.assistances.find(a => a.id == id);
    if (ast) {
        ast.status = status;
        if (remarks) ast.remarks = remarks;
        logActivity(req.session.user.username, `Updated Assistance ID ${id} status to ${status}`);
    }
    res.redirect('/staff-portal?tab=assistances');
});

// Business Registration Staff
app.post('/api/businesses/add', requireAuth, requireStaff, (req, res) => {
    const body = req.body;
    const busId = 'BUS-' + Math.floor(100 + Math.random() * 900);
    db.businesses.push({
        businessId: busId,
        businessName: body.businessName,
        owner: body.owner,
        address: body.address,
        purok: body.purok,
        businessType: body.businessType,
        contactNumber: body.contactNumber,
        registrationDate: new Date().toISOString().split('T')[0],
        permitStatus: 'Active',
        expirationDate: body.expirationDate || '2027-12-31'
    });
    logActivity(req.session.user.username, `Registered Business: ${body.businessName}`);
    res.redirect('/staff-portal?tab=businesses');
});

// Announcements Staff
app.post('/api/announcements/add', requireAuth, requireStaff, (req, res) => {
    const body = req.body;
    db.announcements.push({
        id: db.announcements.length + 1,
        title: body.title,
        description: body.description,
        date: body.date || new Date().toISOString().split('T')[0],
        category: body.category,
        status: 'Published'
    });
    // Add notification for residents
    db.notifications.push({
        id: db.notifications.length + 1,
        residentName: 'All Residents',
        message: `New Announcement: ${body.title}`,
        date: new Date().toISOString().split('T')[0],
        read: false
    });
    logActivity(req.session.user.username, `Created Announcement: ${body.title}`);
    res.redirect('/staff-portal?tab=announcements');
});

// User Management (Admin only)
app.post('/api/users/add', requireAuth, requireStaff, (req, res) => {
    if (req.session.user.role !== 'Admin') return res.status(403).send('Admin privilege required.');
    const body = req.body;
    db.users.push({
        id: db.users.length + 1,
        username: body.username,
        passwordHash: bcrypt.hashSync(body.password || 'password123', 8),
        role: body.role,
        name: body.name,
        email: body.email,
        status: 'Active'
    });
    logActivity(req.session.user.username, `Created User Account: ${body.username} (${body.role})`);
    res.redirect('/staff-portal?tab=users');
});


// RESIDENT PORTAL ROUTES
app.get('/resident-portal', requireAuth, (req, res) => {
    if (req.session.user.role !== 'Resident') return res.redirect('/staff-portal');
    const tab = req.query.tab || 'dashboard';
    res.send(renderResidentPortal(req.session.user, tab, db));
});

// Resident Certificate Request API
app.post('/api/resident/request-cert', requireAuth, (req, res) => {
    const user = req.session.user;
    const { type, remarks } = req.body;
    const reqNo = 'REQ-' + String(db.requests.length + 10).padStart(4, '0');
    db.requests.push({
        id: db.requests.length + 1,
        reqNo: reqNo,
        residentName: user.name,
        type: type,
        status: 'Submitted',
        dateSubmitted: new Date().toISOString().split('T')[0],
        remarks: remarks || 'Requested online by resident',
        releaseDate: ''
    });
    db.notifications.push({
        id: db.notifications.length + 1,
        residentName: user.name,
        message: `Your request ${reqNo} (${type}) has been submitted successfully.`,
        date: new Date().toISOString().split('T')[0],
        read: false
    });
    logActivity(user.username, `Resident requested certificate: ${type}`);
    res.redirect('/resident-portal?tab=tracking&success=' + reqNo);
});

// Resident Profile Update Request API
app.post('/api/resident/request-profile-update', requireAuth, (req, res) => {
    const user = req.session.user;
    const { changes } = req.body;
    db.profileUpdates.push({
        id: db.profileUpdates.length + 1,
        residentId: user.residentId || 'RES-2026-0001',
        requestedChanges: changes,
        status: 'Pending',
        date: new Date().toISOString().split('T')[0]
    });
    logActivity(user.username, `Requested profile update review`);
    res.redirect('/resident-portal?tab=profile&msg=Update+submitted+for+staff+review');
});

// Resident Complaint API
app.post('/api/resident/submit-complaint', requireAuth, (req, res) => {
    const user = req.session.user;
    const { type, subject, description, location } = req.body;
    db.complaints.push({
        id: db.complaints.length + 1,
        type: type,
        subject: subject,
        description: description,
        date: new Date().toISOString().split('T')[0],
        location: location,
        status: 'Submitted',
        residentName: user.name
    });
    logActivity(user.username, `Submitted community complaint: ${subject}`);
    res.redirect('/resident-portal?tab=complaints&success=1');
});

// Resident Appointment API
app.post('/api/resident/book-appointment', requireAuth, (req, res) => {
    const user = req.session.user;
    const { service, date, time } = req.body;
    db.appointments.push({
        id: db.appointments.length + 1,
        date: date,
        time: time,
        residentName: user.name,
        service: service,
        status: 'Pending'
    });
    logActivity(user.username, `Booked appointment for ${service} on ${date}`);
    res.redirect('/resident-portal?tab=appointments&success=1');
});

// Resident Assistance Request API
app.post('/api/resident/request-assistance', requireAuth, (req, res) => {
    const user = req.session.user;
    const { type, amount, remarks } = req.body;
    db.assistances.push({
        id: db.assistances.length + 1,
        residentName: user.name,
        type: type,
        amount: amount || 'Requested Amount',
        date: new Date().toISOString().split('T')[0],
        status: 'Reviewing',
        remarks: remarks
    });
    logActivity(user.username, `Requested assistance: ${type}`);
    res.redirect('/resident-portal?tab=dashboard&success=assistance');
});

// Resident Feedback API
app.post('/api/resident/submit-feedback', requireAuth, (req, res) => {
    const user = req.session.user;
    const { rating, comments } = req.body;
    db.feedbacks.push({
        id: db.feedbacks.length + 1,
        residentName: user.name,
        rating: parseInt(rating) || 5,
        comments: comments,
        date: new Date().toISOString().split('T')[0]
    });
    logActivity(user.username, `Submitted service feedback`);
    res.redirect('/resident-portal?tab=dashboard&feedback=thankyou');
});


// HTML TEMPLATE RENDERERS WITH FULL RESPONSIVE TAILWIND CSS

function renderLoginPage(errorMsg) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login | Barangay Resident Management System</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>body { font-family: 'Inter', sans-serif; }</style>
    </head>
    <body class="bg-slate-900 min-h-screen flex items-center justify-center p-4">
        <div class="max-w-md w-full bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 p-8">
            <div class="text-center mb-8">
                <div class="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full text-white text-2xl font-bold mb-4 shadow-lg shadow-blue-600/30">🏛️</div>
                <h1 class="text-2xl font-bold text-white">Barangay Management</h1>
                <p class="text-slate-400 text-sm mt-1">Resident Management System</p>
            </div>

            ${errorMsg ? `<div class="mb-4 p-3 bg-red-500/20 border border-red-500 text-red-300 text-sm rounded-lg">${errorMsg}</div>` : ''}

            <form action="/login" method="POST" class="space-y-4">
                <div>
                    <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Username</label>
                    <input type="text" name="username" required placeholder="e.g. admin, secretary, resident1" class="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Password</label>
                    <input type="password" name="password" required placeholder="••••••••" class="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition">
                </div>
                <button type="submit" class="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition duration-200">
                    LOGIN TO PORTAL
                </button>
            </form>

            <div class="mt-6 border-t border-slate-700 pt-6 text-xs text-slate-400 space-y-2">
                <p class="font-semibold text-slate-300">Quick Demo Accounts:</p>
                <div class="grid grid-cols-2 gap-2">
                    <div class="bg-slate-900 p-2 rounded border border-slate-700"><strong>Admin:</strong> admin / admin123</div>
                    <div class="bg-slate-900 p-2 rounded border border-slate-700"><strong>Secretary:</strong> secretary / sec123</div>
                    <div class="bg-slate-900 p-2 rounded border border-slate-700"><strong>Staff:</strong> staff / staff123</div>
                    <div class="bg-slate-900 p-2 rounded border border-slate-700"><strong>Resident:</strong> resident1 / res123</div>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
}

function renderStaffPortal(user, activeTab, data) {
    const totalResidents = data.residents.length;
    const totalHouseholds = data.households.length;
    const maleCount = data.residents.filter(r => r.gender === 'Male').length;
    const femaleCount = data.residents.filter(r => r.gender === 'Female').length;
    const seniorCount = data.residents.filter(r => r.category === 'Senior Citizen' || r.age >= 60).length;
    const pwdCount = data.residents.filter(r => r.category === 'PWD').length;
    const soloCount = data.residents.filter(r => r.category === 'Solo Parent').length;
    const minorCount = data.residents.filter(r => r.age < 18).length;
    const voterCount = data.residents.filter(r => r.voterStatus === 'Registered Voter').length;
    const pendingReqs = data.requests.filter(r => r.status === 'Submitted' || r.status === 'Processing').length;
    const todaysAppts = data.appointments.filter(a => a.status === 'Pending' || a.status === 'Approved').length;

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Staff Portal | Barangay Management System</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>body { font-family: 'Inter', sans-serif; }</style>
    </head>
    <body class="bg-slate-100 min-h-screen flex flex-col md:flex-row">
        <!-- Sidebar Navigation -->
        <aside class="w-full md:w-64 bg-slate-900 text-slate-300 flex flex-col justify-between shrink-0 shadow-xl">
            <div>
                <div class="p-6 border-b border-slate-800 flex items-center space-x-3">
                    <span class="text-3xl">🏛️</span>
                    <div>
                        <h1 class="text-white font-bold text-lg leading-tight">Barangay Admin</h1>
                        <p class="text-xs text-slate-400">Staff Portal</p>
                    </div>
                </div>
                <nav class="p-4 space-y-1 text-sm font-medium">
                    <a href="/staff-portal?tab=dashboard" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>📊</span><span>Dashboard</span></a>
                    <a href="/staff-portal?tab=residents" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'residents' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>👥</span><span>Residents</span></a>
                    <a href="/staff-portal?tab=households" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'households' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>🏡</span><span>Households</span></a>
                    <a href="/staff-portal?tab=puroks" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'puroks' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>📍</span><span>Purok Management</span></a>
                    <a href="/staff-portal?tab=certificates" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'certificates' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>📜</span><span>Certificates</span></a>
                    <a href="/staff-portal?tab=requests" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'requests' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>📥</span><span>Requests (${pendingReqs})</span></a>
                    <a href="/staff-portal?tab=blotters" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'blotters' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>⚖️</span><span>Blotter Cases</span></a>
                    <a href="/staff-portal?tab=appointments" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'appointments' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>📅</span><span>Appointments</span></a>
                    <a href="/staff-portal?tab=assistances" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'assistances' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>🤝</span><span>Assistance</span></a>
                    <a href="/staff-portal?tab=businesses" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'businesses' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>🏢</span><span>Businesses</span></a>
                    <a href="/staff-portal?tab=announcements" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'announcements' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>📢</span><span>Announcements</span></a>
                    <a href="/staff-portal?tab=reports" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'reports' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>📈</span><span>Reports & Analytics</span></a>
                    ${user.role === 'Admin' ? `<a href="/staff-portal?tab=users" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'users' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>⚙️</span><span>User Management</span></a>` : ''}
                    <a href="/staff-portal?tab=logs" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'logs' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>📝</span><span>Activity Logs</span></a>
                </nav>
            </div>
            <div class="p-4 border-t border-slate-800">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-white text-sm font-semibold">${user.name}</p>
                        <span class="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">${user.role}</span>
                    </div>
                    <a href="/logout" class="p-2 bg-slate-800 hover:bg-red-600/20 hover:text-red-400 text-slate-400 rounded-lg transition" title="Logout">🚪</a>
                </div>
            </div>
        </aside>

        <!-- Main Content Area -->
        <main class="flex-1 p-6 md:p-10 overflow-y-auto">
            <!-- Top Header Bar -->
            <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 mb-6 border-b border-slate-200 gap-4">
                <div>
                    <h2 class="text-2xl font-bold text-slate-800 uppercase tracking-wide">${activeTab} Management</h2>
                    <p class="text-sm text-slate-500">Welcome back, ${user.name} (${user.role})</p>
                </div>
                <div class="flex items-center space-x-3">
                    <span class="px-3 py-1 bg-emerald-500/10 text-emerald-600 text-xs font-semibold rounded-full border border-emerald-500/20">System Online</span>
                    <span class="text-sm text-slate-600 font-medium">${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
            </header>

            <!-- TAB CONTENT -->
            ${activeTab === 'dashboard' ? renderStaffDashboard(data, totalResidents, totalHouseholds, maleCount, femaleCount, seniorCount, pwdCount, soloCount, minorCount, voterCount, pendingReqs, todaysAppts) : ''}
            ${activeTab === 'residents' ? renderStaffResidents(data) : ''}
            ${activeTab === 'households' ? renderStaffHouseholds(data) : ''}
            ${activeTab === 'puroks' ? renderStaffPuroks(data) : ''}
            ${activeTab === 'certificates' ? renderStaffCertificates(data) : ''}
            ${activeTab === 'requests' ? renderStaffRequests(data) : ''}
            ${activeTab === 'blotters' ? renderStaffBlotters(data) : ''}
            ${activeTab === 'appointments' ? renderStaffAppointments(data) : ''}
            ${activeTab === 'assistances' ? renderStaffAssistances(data) : ''}
            ${activeTab === 'businesses' ? renderStaffBusinesses(data) : ''}
            ${activeTab === 'announcements' ? renderStaffAnnouncements(data) : ''}
            ${activeTab === 'reports' ? renderStaffReports(data) : ''}
            ${activeTab === 'users' && user.role === 'Admin' ? renderStaffUsers(data) : ''}
            ${activeTab === 'logs' ? renderStaffLogs(data) : ''}
        </main>
    </body>
    </html>
    `;
}

function renderStaffDashboard(data, totalResidents, totalHouseholds, maleCount, femaleCount, seniorCount, pwdCount, soloCount, minorCount, voterCount, pendingReqs, todaysAppts) {
    return `
    <div class="space-y-6">
        <!-- Stats Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center space-x-4">
                <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl font-bold">👥</div>
                <div>
                    <p class="text-xs text-slate-500 font-semibold uppercase">Total Residents</p>
                    <h3 class="text-2xl font-bold text-slate-800">${totalResidents}</h3>
                </div>
            </div>
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center space-x-4">
                <div class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl font-bold">🏡</div>
                <div>
                    <p class="text-xs text-slate-500 font-semibold uppercase">Households</p>
                    <h3 class="text-2xl font-bold text-slate-800">${totalHouseholds}</h3>
                </div>
            </div>
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center space-x-4">
                <div class="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-xl font-bold">📥</div>
                <div>
                    <p class="text-xs text-slate-500 font-semibold uppercase">Pending Requests</p>
                    <h3 class="text-2xl font-bold text-slate-800">${pendingReqs}</h3>
                </div>
            </div>
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center space-x-4">
                <div class="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-xl font-bold">📅</div>
                <div>
                    <p class="text-xs text-slate-500 font-semibold uppercase">Appointments</p>
                    <h3 class="text-2xl font-bold text-slate-800">${todaysAppts}</h3>
                </div>
            </div>
        </div>

        <!-- Demographics Breakdown -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div class="bg-white p-4 rounded-xl border border-slate-200 text-center">
                <span class="text-blue-600 font-bold text-lg">♂ ${maleCount} / ♀ ${femaleCount}</span>
                <p class="text-xs text-slate-500 font-medium mt-1">Male / Female</p>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-200 text-center">
                <span class="text-amber-600 font-bold text-lg">${seniorCount}</span>
                <p class="text-xs text-slate-500 font-medium mt-1">Senior Citizens</p>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-200 text-center">
                <span class="text-emerald-600 font-bold text-lg">${pwdCount}</span>
                <p class="text-xs text-slate-500 font-medium mt-1">PWD Residents</p>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-200 text-center">
                <span class="text-purple-600 font-bold text-lg">${voterCount}</span>
                <p class="text-xs text-slate-500 font-medium mt-1">Registered Voters</p>
            </div>
        </div>

        <!-- Recent Activities & Quick Table -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 class="font-bold text-slate-800 mb-4 flex items-center justify-between">
                    <span>Recent System Activity</span>
                    <span class="text-xs text-blue-600 font-normal">Real-time log</span>
                </h3>
                <div class="space-y-3">
                    ${data.activityLogs.slice(0, 5).map(log => `
                        <div class="flex items-start space-x-3 text-sm pb-3 border-b border-slate-100 last:border-none">
                            <span class="p-2 bg-slate-100 rounded-lg">⚡</span>
                            <div class="flex-1">
                                <p class="text-slate-800 font-medium">${log.action}</p>
                                <span class="text-xs text-slate-400">By <strong>${log.user}</strong> at ${log.date} ${log.time}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 class="font-bold text-slate-800 mb-4 flex items-center justify-between">
                    <span>Latest Resident Requests</span>
                    <a href="/staff-portal?tab=requests" class="text-xs text-blue-600 hover:underline">View all</a>
                </h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm">
                        <thead>
                            <tr class="border-b border-slate-200 text-slate-400 text-xs uppercase">
                                <th class="pb-2">Req #</th>
                                <th class="pb-2">Resident</th>
                                <th class="pb-2">Type</th>
                                <th class="pb-2">Status</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${data.requests.slice(0, 5).map(r => `
                                <tr>
                                    <td class="py-2.5 font-semibold text-slate-700">${r.reqNo}</td>
                                    <td class="py-2.5 text-slate-600">${r.residentName}</td>
                                    <td class="py-2.5 text-slate-600">${r.type}</td>
                                    <td class="py-2.5">
                                        <span class="px-2 py-0.5 text-xs rounded-full font-semibold ${r.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' : r.status === 'Processing' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}">${r.status}</span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    `;
}

function renderStaffResidents(data) {
    return `
    <div class="space-y-6">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <div class="flex items-center space-x-2 w-full sm:w-auto">
                <input type="text" id="searchRes" placeholder="Search resident name or ID..." class="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm w-full sm:w-80 focus:outline-none focus:border-blue-500">
            </div>
            <button onclick="document.getElementById('addResModal').classList.remove('hidden')" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm shadow-md transition">+ Add New Resident</button>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase font-semibold">
                        <tr>
                            <th class="p-4">Resident ID & Photo</th>
                            <th class="p-4">Full Name</th>
                            <th class="p-4">Age/Gender</th>
                            <th class="p-4">Purok / Address</th>
                            <th class="p-4">Contact</th>
                            <th class="p-4">Category</th>
                            <th class="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${data.residents.map(r => `
                            <tr class="hover:bg-slate-50/50 transition">
                                <td class="p-4 flex items-center space-x-3">
                                    <img src="${r.photo}" onerror="this.src='https://placehold.co/150x150/1e40af/ffffff?text=RES'" class="w-10 h-10 rounded-full object-cover border">
                                    <div>
                                        <span class="font-bold text-blue-600 text-xs">${r.residentId}</span>
                                        <p class="text-xs text-slate-400">HH: ${r.householdNo}</p>
                                    </div>
                                </td>
                                <td class="p-4 font-semibold text-slate-800">${r.lastName}, ${r.firstName} ${r.middleName} ${r.suffix}</td>
                                <td class="p-4 text-slate-600">${r.age} yrs / ${r.gender}</td>
                                <td class="p-4 text-slate-600">${r.purok}<br><span class="text-xs text-slate-400">${r.address}</span></td>
                                <td class="p-4 text-slate-600">${r.contactNumber}</td>
                                <td class="p-4"><span class="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">${r.category}</span></td>
                                <td class="p-4 text-right space-x-2">
                                    <button onclick="alert('Viewing profile for ${r.firstName} ${r.lastName}\\nID: ${r.residentId}\\nAddress: ${r.address}\\nEmail: ${r.email}\\nVoter Status: ${r.voterStatus}')" class="px-3 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-semibold">View</button>
                                    <form action="/api/residents/delete" method="POST" class="inline">
                                        <input type="hidden" name="residentId" value="${r.residentId}">
                                        <button type="submit" onclick="return confirm('Archive this resident?')" class="px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-semibold">Archive</button>
                                    </form>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Add Resident Modal -->
        <div id="addResModal" class="hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div class="flex justify-between items-center mb-4 pb-2 border-b">
                    <h3 class="font-bold text-lg text-slate-800">Add New Resident</h3>
                    <button onclick="document.getElementById('addResModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600">✕</button>
                </div>
                <form action="/api/residents/add" method="POST" class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">First Name</label>
                        <input type="text" name="firstName" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Middle Name</label>
                        <input type="text" name="middleName" class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Last Name</label>
                        <input type="text" name="lastName" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Suffix</label>
                        <input type="text" name="suffix" placeholder="Jr., III" class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Date of Birth</label>
                        <input type="date" name="dob" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Age</label>
                        <input type="number" name="age" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Gender</label>
                        <select name="gender" class="w-full p-2.5 border rounded-xl">
                            <option>Male</option>
                            <option>Female</option>
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Civil Status</label>
                        <select name="civilStatus" class="w-full p-2.5 border rounded-xl">
                            <option>Single</option>
                            <option>Married</option>
                            <option>Widowed</option>
                            <option>Separated</option>
                        </select>
                    </div>
                    <div class="sm:col-span-2">
                        <label class="block font-semibold text-slate-700 mb-1">Street Address</label>
                        <input type="text" name="address" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Purok</label>
                        <select name="purok" class="w-full p-2.5 border rounded-xl">
                            ${data.puroks.map(p => `<option>${p.name}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Household No</label>
                        <input type="text" name="householdNo" value="HH-101" class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Contact Number</label>
                        <input type="text" name="contactNumber" placeholder="09XXXXXXXXX" class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Email Address</label>
                        <input type="email" name="email" class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Occupation</label>
                        <input type="text" name="occupation" class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Educational Attainment</label>
                        <input type="text" name="educationalAttainment" class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Voter Status</label>
                        <select name="voterStatus" class="w-full p-2.5 border rounded-xl">
                            <option>Registered Voter</option>
                            <option>Not Registered</option>
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Resident Category</label>
                        <select name="category" class="w-full p-2.5 border rounded-xl">
                            <option>Regular Resident</option>
                            <option>Senior Citizen</option>
                            <option>PWD</option>
                            <option>Solo Parent</option>
                            <option>Student</option>
                            <option>Minor</option>
                        </select>
                    </div>
                    <div class="sm:col-span-2 flex justify-end space-x-3 pt-4 border-t">
                        <button type="button" onclick="document.getElementById('addResModal').classList.add('hidden')" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-semibold">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-500">Save Resident</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `;
}

function renderStaffHouseholds(data) {
    return `
    <div class="space-y-6">
        <div class="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h3 class="font-bold text-slate-800">Household Records</h3>
            <button onclick="document.getElementById('addHHModal').classList.remove('hidden')" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm shadow-md transition">+ Add Household</button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${data.households.map(h => `
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="text-xs font-bold text-blue-600 px-2.5 py-1 bg-blue-50 rounded-lg">${h.householdNo}</span>
                            <h4 class="font-bold text-slate-800 text-lg mt-2">Head: ${h.headName}</h4>
                        </div>
                        <span class="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-md font-medium">${h.membersCount} Members</span>
                    </div>
                    <div class="text-sm text-slate-600 space-y-1">
                        <p>📍 <strong>Address:</strong> ${h.address}</p>
                        <p>📌 <strong>Purok:</strong> ${h.purok}</p>
                    </div>
                    <div class="border-t pt-3">
                        <p class="text-xs font-semibold text-slate-400 uppercase mb-2">Household Members:</p>
                        <div class="flex flex-wrap gap-1">
                            ${h.members.map(m => `<span class="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">${m}</span>`).join('')}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>

        <!-- Add Household Modal -->
        <div id="addHHModal" class="hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
                <div class="flex justify-between items-center mb-4 pb-2 border-b">
                    <h3 class="font-bold text-lg text-slate-800">Add New Household</h3>
                    <button onclick="document.getElementById('addHHModal').classList.add('hidden')" class="text-slate-400">✕</button>
                </div>
                <form action="/api/households/add" method="POST" class="space-y-4 text-sm">
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Household Number</label>
                        <input type="text" name="householdNo" value="HH-104" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Household Head Name</label>
                        <input type="text" name="headName" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Address</label>
                        <input type="text" name="address" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Purok</label>
                        <select name="purok" class="w-full p-2.5 border rounded-xl">
                            ${data.puroks.map(p => `<option>${p.name}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Members (Comma separated names)</label>
                        <input type="text" name="members" placeholder="Juan Gomez, Elena Gomez" class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div class="flex justify-end space-x-3 pt-4 border-t">
                        <button type="button" onclick="document.getElementById('addHHModal').classList.add('hidden')" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-semibold">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-500">Save Household</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `;
}

function renderStaffPuroks(data) {
    return `
    <div class="space-y-6">
        <div class="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h3 class="font-bold text-slate-800">Purok Management & Population</h3>
            <button onclick="document.getElementById('addPurokModal').classList.remove('hidden')" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm shadow-md transition">+ Add Purok</button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            ${data.puroks.map(p => {
                const residentsInPurok = data.residents.filter(r => r.purok === p.name).length;
                return `
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                    <h4 class="font-bold text-lg text-blue-600">${p.name}</h4>
                    <p class="text-sm text-slate-600">${p.description}</p>
                    <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                        <p class="text-xs text-slate-500">Purok Leader: <strong>${p.leader}</strong></p>
                        <p class="text-xs text-slate-500">Total Population: <strong class="text-slate-800">${residentsInPurok} Residents</strong></p>
                    </div>
                </div>
                `;
            }).join('')}
        </div>

        <!-- Add Purok Modal -->
        <div id="addPurokModal" class="hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
                <div class="flex justify-between items-center mb-4 pb-2 border-b">
                    <h3 class="font-bold text-lg text-slate-800">Add New Purok</h3>
                    <button onclick="document.getElementById('addPurokModal').classList.add('hidden')" class="text-slate-400">✕</button>
                </div>
                <form action="/api/puroks/add" method="POST" class="space-y-4 text-sm">
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Purok Name</label>
                        <input type="text" name="name" placeholder="Purok 4 - St. Joseph" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Purok Leader</label>
                        <input type="text" name="leader" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Description / Area</label>
                        <input type="text" name="description" class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div class="flex justify-end space-x-3 pt-4 border-t">
                        <button type="button" onclick="document.getElementById('addPurokModal').classList.add('hidden')" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-semibold">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-500">Save Purok</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `;
}

function renderStaffCertificates(data) {
    return `
    <div class="space-y-6">
        <div class="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h3 class="font-bold text-slate-800">Issued Certificates & QR Verification</h3>
            <button onclick="document.getElementById('addCertModal').classList.remove('hidden')" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm shadow-md transition">+ Issue Certificate</button>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-50 border-b text-slate-500 text-xs uppercase font-semibold">
                        <tr>
                            <th class="p-4">Certificate #</th>
                            <th class="p-4">Resident Name</th>
                            <th class="p-4">Certificate Type</th>
                            <th class="p-4">Date Released</th>
                            <th class="p-4">Remarks</th>
                            <th class="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${data.certificates.map(c => `
                            <tr>
                                <td class="p-4 font-bold text-blue-600">${c.certNo}</td>
                                <td class="p-4 font-semibold text-slate-800">${c.residentName}</td>
                                <td class="p-4 text-slate-600">${c.type}</td>
                                <td class="p-4 text-slate-600">${c.dateReleased}</td>
                                <td class="p-4 text-slate-500 text-xs">${c.remarks}</td>
                                <td class="p-4 text-right space-x-2">
                                    <button onclick="window.print()" class="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold">Print</button>
                                    <button onclick="alert('QR Verification Secure Hash Verified:\\nAuthentic Barangay Official Document\\nCert ID: ${c.certNo}\\nIssued To: ${c.residentName}')" class="px-3 py-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-semibold">Verify QR</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Issue Certificate Modal -->
        <div id="addCertModal" class="hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
                <div class="flex justify-between items-center mb-4 pb-2 border-b">
                    <h3 class="font-bold text-lg text-slate-800">Issue Barangay Certificate</h3>
                    <button onclick="document.getElementById('addCertModal').classList.add('hidden')" class="text-slate-400">✕</button>
                </div>
                <form action="/api/certificates/add" method="POST" class="space-y-4 text-sm">
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Resident Name</label>
                        <select name="residentName" class="w-full p-2.5 border rounded-xl">
                            ${data.residents.map(r => `<option>${r.firstName} ${r.lastName}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Certificate Type</label>
                        <select name="type" class="w-full p-2.5 border rounded-xl">
                            <option>Barangay Clearance</option>
                            <option>Certificate of Residency</option>
                            <option>Certificate of Indigency</option>
                            <option>Certificate of Good Moral</option>
                            <option>Certificate of No Income</option>
                            <option>Business Clearance</option>
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Remarks / Purpose</label>
                        <input type="text" name="remarks" placeholder="For employment / local ID" class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div class="flex justify-end space-x-3 pt-4 border-t">
                        <button type="button" onclick="document.getElementById('addCertModal').classList.add('hidden')" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-semibold">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-500">Issue & Sign</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `;
}

function renderStaffRequests(data) {
    return `
    <div class="space-y-6">
        <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h3 class="font-bold text-slate-800">Online Resident Requests Workflow</h3>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-50 border-b text-slate-500 text-xs uppercase font-semibold">
                        <tr>
                            <th class="p-4">Req #</th>
                            <th class="p-4">Resident</th>
                            <th class="p-4">Document Type</th>
                            <th class="p-4">Date Submitted</th>
                            <th class="p-4">Status</th>
                            <th class="p-4 text-right">Update Workflow</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${data.requests.map(r => `
                            <tr>
                                <td class="p-4 font-bold text-blue-600">${r.reqNo}</td>
                                <td class="p-4 font-semibold text-slate-800">${r.residentName}</td>
                                <td class="p-4 text-slate-600">${r.type}</td>
                                <td class="p-4 text-slate-600">${r.dateSubmitted}</td>
                                <td class="p-4">
                                    <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${r.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' : r.status === 'Processing' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}">${r.status}</span>
                                </td>
                                <td class="p-4 text-right">
                                    <form action="/api/requests/update" method="POST" class="inline-flex space-x-1">
                                        <input type="hidden" name="id" value="${r.id}">
                                        <select name="status" class="p-1.5 border rounded-lg text-xs bg-slate-50">
                                            <option ${r.status==='Submitted'?'selected':''}>Submitted</option>
                                            <option ${r.status==='Processing'?'selected':''}>Processing</option>
                                            <option ${r.status==='Approved'?'selected':''}>Approved</option>
                                            <option ${r.status==='Ready for Release'?'selected':''}>Ready for Release</option>
                                            <option ${r.status==='Released'?'selected':''}>Released</option>
                                        </select>
                                        <button type="submit" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-500">Update</button>
                                    </form>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;
}

function renderStaffBlotters(data) {
    return `
    <div class="space-y-6">
        <div class="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h3 class="font-bold text-slate-800">Blotter & Incident Records</h3>
            <button onclick="document.getElementById('addBlotterModal').classList.remove('hidden')" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm shadow-md transition">+ Record Case</button>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-50 border-b text-slate-500 text-xs uppercase font-semibold">
                        <tr>
                            <th class="p-4">Case #</th>
                            <th class="p-4">Complainant vs Respondent</th>
                            <th class="p-4">Incident Type</th>
                            <th class="p-4">Date & Location</th>
                            <th class="p-4">Status</th>
                            <th class="p-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${data.blotters.map(b => `
                            <tr>
                                <td class="p-4 font-bold text-blue-600">${b.caseNo}</td>
                                <td class="p-4 font-semibold text-slate-800">${b.complainant} vs <br><span class="text-slate-500 font-normal">${b.respondent}</span></td>
                                <td class="p-4 text-slate-600">${b.type}</td>
                                <td class="p-4 text-slate-600">${b.incidentDate}<br><span class="text-xs text-slate-400">${b.location}</span></td>
                                <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ${b.status==='Closed'?'bg-slate-100 text-slate-700':'bg-amber-50 text-amber-600'}">${b.status}</span></td>
                                <td class="p-4 text-right">
                                    <button onclick="window.print()" class="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold">Print Report</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Add Blotter Modal -->
        <div id="addBlotterModal" class="hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div class="flex justify-between items-center mb-4 pb-2 border-b">
                    <h3 class="font-bold text-lg text-slate-800">Record Blotter Case</h3>
                    <button onclick="document.getElementById('addBlotterModal').classList.add('hidden')" class="text-slate-400">✕</button>
                </div>
                <form action="/api/blotters/add" method="POST" class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Complainant</label>
                        <input type="text" name="complainant" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Respondent</label>
                        <input type="text" name="respondent" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Witness</label>
                        <input type="text" name="witness" class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Incident Type</label>
                        <input type="text" name="type" placeholder="Dispute, Noise, Theft" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Incident Date</label>
                        <input type="date" name="incidentDate" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Incident Time</label>
                        <input type="text" name="incidentTime" placeholder="08:00 PM" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div class="sm:col-span-2">
                        <label class="block font-semibold text-slate-700 mb-1">Location</label>
                        <input type="text" name="location" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div class="sm:col-span-2">
                        <label class="block font-semibold text-slate-700 mb-1">Description</label>
                        <textarea name="description" rows="3" required class="w-full p-2.5 border rounded-xl"></textarea>
                    </div>
                    <div class="sm:col-span-2 flex justify-end space-x-3 pt-4 border-t">
                        <button type="button" onclick="document.getElementById('addBlotterModal').classList.add('hidden')" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-semibold">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-500">Save Blotter Case</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `;
}

function renderStaffAppointments(data) {
    return `
    <div class="space-y-6">
        <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h3 class="font-bold text-slate-800">Resident Appointments Schedule</h3>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-50 border-b text-slate-500 text-xs uppercase font-semibold">
                        <tr>
                            <th class="p-4">Date & Time</th>
                            <th class="p-4">Resident Name</th>
                            <th class="p-4">Service</th>
                            <th class="p-4">Status</th>
                            <th class="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${data.appointments.map(a => `
                            <tr>
                                <td class="p-4 font-bold text-slate-800">${a.date} <br><span class="text-xs text-blue-600 font-normal">${a.time}</span></td>
                                <td class="p-4 font-semibold text-slate-800">${a.residentName}</td>
                                <td class="p-4 text-slate-600">${a.service}</td>
                                <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ${a.status==='Approved'?'bg-emerald-50 text-emerald-600':'bg-amber-50 text-amber-600'}">${a.status}</span></td>
                                <td class="p-4 text-right space-x-1">
                                    <form action="/api/appointments/update" method="POST" class="inline">
                                        <input type="hidden" name="id" value="${a.id}">
                                        <input type="hidden" name="status" value="Approved">
                                        <button type="submit" class="px-3 py-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-semibold">Approve</button>
                                    </form>
                                    <form action="/api/appointments/update" method="POST" class="inline">
                                        <input type="hidden" name="id" value="${a.id}">
                                        <input type="hidden" name="status" value="Cancelled">
                                        <button type="submit" class="px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-semibold">Cancel</button>
                                    </form>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;
}

function renderStaffAssistances(data) {
    return `
    <div class="space-y-6">
        <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h3 class="font-bold text-slate-800">Financial & Medical Assistance Applications</h3>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-50 border-b text-slate-500 text-xs uppercase font-semibold">
                        <tr>
                            <th class="p-4">Resident Name</th>
                            <th class="p-4">Assistance Type</th>
                            <th class="p-4">Amount</th>
                            <th class="p-4">Date</th>
                            <th class="p-4">Status & Remarks</th>
                            <th class="p-4 text-right">Update</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${data.assistances.map(ast => `
                            <tr>
                                <td class="p-4 font-semibold text-slate-800">${ast.residentName}</td>
                                <td class="p-4 text-slate-600">${ast.type}</td>
                                <td class="p-4 font-bold text-emerald-600">${ast.amount}</td>
                                <td class="p-4 text-slate-600">${ast.date}</td>
                                <td class="p-4">
                                    <span class="px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-600">${ast.status}</span>
                                    <p class="text-xs text-slate-400 mt-0.5">${ast.remarks}</p>
                                </td>
                                <td class="p-4 text-right">
                                    <form action="/api/assistances/update" method="POST" class="inline-flex space-x-1">
                                        <input type="hidden" name="id" value="${ast.id}">
                                        <select name="status" class="p-1 border rounded text-xs">
                                            <option>Approved</option>
                                            <option>Reviewing</option>
                                            <option>Rejected</option>
                                        </select>
                                        <button type="submit" class="px-3 py-1 bg-blue-600 text-white rounded text-xs font-semibold">Save</button>
                                    </form>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;
}

function renderStaffBusinesses(data) {
    return `
    <div class="space-y-6">
        <div class="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h3 class="font-bold text-slate-800">Local Business Permits & Registrations</h3>
            <button onclick="document.getElementById('addBusModal').classList.remove('hidden')" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm shadow-md transition">+ Register Business</button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${data.businesses.map(b => `
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="text-xs font-bold text-blue-600 px-2 py-0.5 bg-blue-50 rounded">${b.businessId}</span>
                            <h4 class="font-bold text-lg text-slate-800 mt-1">${b.businessName}</h4>
                        </div>
                        <span class="px-2.5 py-1 bg-emerald-50 text-emerald-600 text-xs font-semibold rounded-full">${b.permitStatus}</span>
                    </div>
                    <div class="text-sm text-slate-600 space-y-1">
                        <p>👤 <strong>Owner:</strong> ${b.owner}</p>
                        <p>📍 <strong>Address:</strong> ${b.address} (${b.purok})</p>
                        <p>📞 <strong>Contact:</strong> ${b.contactNumber}</p>
                        <p>📅 <strong>Expires:</strong> ${b.expirationDate}</p>
                    </div>
                </div>
            `).join('')}
        </div>

        <!-- Add Business Modal -->
        <div id="addBusModal" class="hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
                <div class="flex justify-between items-center mb-4 pb-2 border-b">
                    <h3 class="font-bold text-lg text-slate-800">Register Business</h3>
                    <button onclick="document.getElementById('addBusModal').classList.add('hidden')" class="text-slate-400">✕</button>
                </div>
                <form action="/api/businesses/add" method="POST" class="space-y-4 text-sm">
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Business Name</label>
                        <input type="text" name="businessName" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Owner Name</label>
                        <input type="text" name="owner" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Address</label>
                        <input type="text" name="address" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Purok</label>
                        <select name="purok" class="w-full p-2.5 border rounded-xl">
                            ${data.puroks.map(p => `<option>${p.name}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Business Type</label>
                        <input type="text" name="businessType" placeholder="Retail / Food / Services" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Contact Number</label>
                        <input type="text" name="contactNumber" class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div class="flex justify-end space-x-3 pt-4 border-t">
                        <button type="button" onclick="document.getElementById('addBusModal').classList.add('hidden')" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-semibold">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-500">Save Business</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `;
}

function renderStaffAnnouncements(data) {
    return `
    <div class="space-y-6">
        <div class="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h3 class="font-bold text-slate-800">Barangay Announcements & Events</h3>
            <button onclick="document.getElementById('addAnnModal').classList.remove('hidden')" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm shadow-md transition">+ Create Announcement</button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${data.announcements.map(a => `
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                    <div class="flex justify-between items-start">
                        <span class="px-2.5 py-1 bg-blue-50 text-blue-600 text-xs font-semibold rounded-md">${a.category}</span>
                        <span class="text-xs text-slate-400">${a.date}</span>
                    </div>
                    <h4 class="font-bold text-lg text-slate-800">${a.title}</h4>
                    <p class="text-sm text-slate-600">${a.description}</p>
                </div>
            `).join('')}
        </div>

        <!-- Add Announcement Modal -->
        <div id="addAnnModal" class="hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
                <div class="flex justify-between items-center mb-4 pb-2 border-b">
                    <h3 class="font-bold text-lg text-slate-800">New Announcement</h3>
                    <button onclick="document.getElementById('addAnnModal').classList.add('hidden')" class="text-slate-400">✕</button>
                </div>
                <form action="/api/announcements/add" method="POST" class="space-y-4 text-sm">
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Title</label>
                        <input type="text" name="title" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Category</label>
                        <select name="category" class="w-full p-2.5 border rounded-xl">
                            <option>Health & Medical</option>
                            <option>Meeting</option>
                            <option>Emergency Notice</option>
                            <option>Community Program</option>
                            <option>Public Notice</option>
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Description</label>
                        <textarea name="description" rows="4" required class="w-full p-2.5 border rounded-xl"></textarea>
                    </div>
                    <div class="flex justify-end space-x-3 pt-4 border-t">
                        <button type="button" onclick="document.getElementById('addAnnModal').classList.add('hidden')" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-semibold">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-500">Publish Now</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `;
}

function renderStaffReports(data) {
    return `
    <div class="space-y-6">
        <div class="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h3 class="font-bold text-slate-800">Comprehensive Reports & Analytics</h3>
            <button onclick="window.print()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-sm shadow-md transition">🖨️ Print / Export Report</button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-2">
                <h4 class="font-bold text-slate-800">Total Population Summary</h4>
                <p class="text-3xl font-bold text-blue-600">${data.residents.length}</p>
                <p class="text-xs text-slate-500">Registered residents across all puroks</p>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-2">
                <h4 class="font-bold text-slate-800">Gender Distribution</h4>
                <p class="text-lg font-semibold text-slate-700">Male: ${data.residents.filter(r=>r.gender==='Male').length}</p>
                <p class="text-lg font-semibold text-slate-700">Female: ${data.residents.filter(r=>r.gender==='Female').length}</p>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-2">
                <h4 class="font-bold text-slate-800">Voter Turnout</h4>
                <p class="text-3xl font-bold text-emerald-600">${data.residents.filter(r=>r.voterStatus==='Registered Voter').length}</p>
                <p class="text-xs text-slate-500">Registered active voters</p>
            </div>
        </div>

        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h4 class="font-bold text-slate-800 mb-4">Summary Statistics Table</h4>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-50 border-b text-slate-500 text-xs uppercase">
                        <tr>
                            <th class="p-3">Category</th>
                            <th class="p-3">Count</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        <tr><td class="p-3">Total Households</td><td class="p-3 font-semibold">${data.households.length}</td></tr>
                        <tr><td class="p-3">Senior Citizens (60+ yrs)</td><td class="p-3 font-semibold">${data.residents.filter(r=>r.age>=60).length}</td></tr>
                        <tr><td class="p-3">Persons with Disability (PWD)</td><td class="p-3 font-semibold">${data.residents.filter(r=>r.category==='PWD').length}</td></tr>
                        <tr><td class="p-3">Solo Parents</td><td class="p-3 font-semibold">${data.residents.filter(r=>r.category==='Solo Parent').length}</td></tr>
                        <tr><td class="p-3">Minors (&lt;18 yrs)</td><td class="p-3 font-semibold">${data.residents.filter(r=>r.age<18).length}</td></tr>
                        <tr><td class="p-3">Blotter Cases Recorded</td><td class="p-3 font-semibold">${data.blotters.length}</td></tr>
                        <tr><td class="p-3">Registered Local Businesses</td><td class="p-3 font-semibold">${data.businesses.length}</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;
}

function renderStaffUsers(data) {
    return `
    <div class="space-y-6">
        <div class="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h3 class="font-bold text-slate-800">System Staff & Admin Accounts</h3>
            <button onclick="document.getElementById('addUserModal').classList.remove('hidden')" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm shadow-md transition">+ Add User Account</button>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-50 border-b text-slate-500 text-xs uppercase font-semibold">
                        <tr>
                            <th class="p-4">Username</th>
                            <th class="p-4">Full Name</th>
                            <th class="p-4">Email</th>
                            <th class="p-4">Role</th>
                            <th class="p-4">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${data.users.map(u => `
                            <tr>
                                <td class="p-4 font-bold text-blue-600">${u.username}</td>
                                <td class="p-4 font-semibold text-slate-800">${u.name}</td>
                                <td class="p-4 text-slate-600">${u.email}</td>
                                <td class="p-4"><span class="px-2.5 py-1 bg-slate-100 rounded text-xs font-semibold">${u.role}</span></td>
                                <td class="p-4"><span class="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-semibold">${u.status}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Add User Modal -->
        <div id="addUserModal" class="hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
                <div class="flex justify-between items-center mb-4 pb-2 border-b">
                    <h3 class="font-bold text-lg text-slate-800">Add Staff Account</h3>
                    <button onclick="document.getElementById('addUserModal').classList.add('hidden')" class="text-slate-400">✕</button>
                </div>
                <form action="/api/users/add" method="POST" class="space-y-4 text-sm">
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Username</label>
                        <input type="text" name="username" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Password</label>
                        <input type="password" name="password" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Full Name</label>
                        <input type="text" name="name" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Email</label>
                        <input type="email" name="email" required class="w-full p-2.5 border rounded-xl">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Role</label>
                        <select name="role" class="w-full p-2.5 border rounded-xl">
                            <option>Admin</option>
                            <option>Secretary</option>
                            <option>Staff</option>
                        </select>
                    </div>
                    <div class="flex justify-end space-x-3 pt-4 border-t">
                        <button type="button" onclick="document.getElementById('addUserModal').classList.add('hidden')" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-semibold">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-500">Create Account</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `;
}

function renderStaffLogs(data) {
    return `
    <div class="space-y-6">
        <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h3 class="font-bold text-slate-800">System Activity Logs</h3>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-50 border-b text-slate-500 text-xs uppercase font-semibold">
                        <tr>
                            <th class="p-4">User</th>
                            <th class="p-4">Action Performed</th>
                            <th class="p-4">Date</th>
                            <th class="p-4">Time</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${data.activityLogs.map(l => `
                            <tr>
                                <td class="p-4 font-semibold text-blue-600">${l.user}</td>
                                <td class="p-4 text-slate-800">${l.action}</td>
                                <td class="p-4 text-slate-600">${l.date}</td>
                                <td class="p-4 text-slate-400 font-mono text-xs">${l.time}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;
}


// RESIDENT PORTAL RENDERER

function renderResidentPortal(user, activeTab, data) {
    const residentRecord = data.residents.find(r => r.name === user.name || r.email === user.email) || data.residents[0];
    const userRequests = data.requests.filter(r => r.residentName === user.name || r.residentName === residentRecord.firstName + ' ' + residentRecord.lastName);
    const userAppointments = data.appointments.filter(a => a.residentName === user.name || a.residentName === residentRecord.firstName + ' ' + residentRecord.lastName);
    const userNotifications = data.notifications.filter(n => n.residentName === user.name || n.residentName === 'All Residents');

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Resident Portal | Barangay Management System</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>body { font-family: 'Inter', sans-serif; }</style>
    </head>
    <body class="bg-slate-100 min-h-screen flex flex-col md:flex-row">
        <!-- Sidebar Navigation -->
        <aside class="w-full md:w-64 bg-slate-900 text-slate-300 flex flex-col justify-between shrink-0 shadow-xl">
            <div>
                <div class="p-6 border-b border-slate-800 flex items-center space-x-3">
                    <span class="text-3xl">🏡</span>
                    <div>
                        <h1 class="text-white font-bold text-lg leading-tight">Resident Portal</h1>
                        <p class="text-xs text-slate-400">Barangay Online Services</p>
                    </div>
                </div>
                <nav class="p-4 space-y-1 text-sm font-medium">
                    <a href="/resident-portal?tab=dashboard" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>📊</span><span>Dashboard</span></a>
                    <a href="/resident-portal?tab=profile" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'profile' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>👤</span><span>My Profile</span></a>
                    <a href="/resident-portal?tab=request-cert" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'request-cert' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>📜</span><span>Request Certificate</span></a>
                    <a href="/resident-portal?tab=tracking" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'tracking' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>🔍</span><span>Track Requests</span></a>
                    <a href="/resident-portal?tab=complaints" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'complaints' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>📢</span><span>Complaints & Reports</span></a>
                    <a href="/resident-portal?tab=appointments" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'appointments' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>📅</span><span>Appointments</span></a>
                    <a href="/resident-portal?tab=announcements" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'announcements' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>🔔</span><span>Announcements</span></a>
                    <a href="/resident-portal?tab=contacts" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'contacts' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>☎️</span><span>Emergency Contacts</span></a>
                    <a href="/resident-portal?tab=feedback" class="flex items-center space-x-3 px-4 py-3 rounded-xl transition ${activeTab === 'feedback' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}"><span>⭐</span><span>Service Feedback</span></a>
                </nav>
            </div>
            <div class="p-4 border-t border-slate-800">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-white text-sm font-semibold">${user.name}</p>
                        <span class="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">Verified Resident</span>
                    </div>
                    <a href="/logout" class="p-2 bg-slate-800 hover:bg-red-600/20 hover:text-red-400 text-slate-400 rounded-lg transition" title="Logout">🚪</a>
                </div>
            </div>
        </aside>

        <!-- Main Content Area -->
        <main class="flex-1 p-6 md:p-10 overflow-y-auto">
            <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 mb-6 border-b border-slate-200 gap-4">
                <div>
                    <h2 class="text-2xl font-bold text-slate-800 uppercase tracking-wide">Resident Portal - ${activeTab}</h2>
                    <p class="text-sm text-slate-500">Welcome, ${user.name} | ID: ${residentRecord.residentId}</p>
                </div>
                <div class="flex items-center space-x-3">
                    <span class="px-3 py-1 bg-blue-500/10 text-blue-600 text-xs font-semibold rounded-full border border-blue-500/20">Notifications (${userNotifications.filter(n=>!n.read).length})</span>
                </div>
            </header>

            ${activeTab === 'dashboard' ? renderResidentDashboard(user, residentRecord, userRequests, userAppointments, data) : ''}
            ${activeTab === 'profile' ? renderResidentProfile(residentRecord, data) : ''}
            ${activeTab === 'request-cert' ? renderResidentRequestCert(data) : ''}
            ${activeTab === 'tracking' ? renderResidentTracking(userRequests) : ''}
            ${activeTab === 'complaints' ? renderResidentComplaints(data) : ''}
            ${activeTab === 'appointments' ? renderResidentAppointments(userAppointments) : ''}
            ${activeTab === 'announcements' ? renderResidentAnnouncements(data) : ''}
            ${activeTab === 'contacts' ? renderResidentContacts(data) : ''}
            ${activeTab === 'feedback' ? renderResidentFeedback() : ''}
        </main>
    </body>
    </html>
    `;
}

function renderResidentDashboard(user, residentRecord, userRequests, userAppointments, data) {
    const approvedCount = userRequests.filter(r => r.status === 'Approved' || r.status === 'Released').length;
    const pendingCount = userRequests.filter(r => r.status === 'Submitted' || r.status === 'Processing').length;

    return `
    <div class="space-y-6">
        <!-- Welcome Card -->
        <div class="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-8 rounded-3xl shadow-lg flex flex-col md:flex-row justify-between items-center gap-6">
            <div class="space-y-2">
                <span class="px-3 py-1 bg-white/20 text-white rounded-full text-xs font-semibold">Official Resident Account</span>
                <h3 class="text-3xl font-bold">${residentRecord.firstName} ${residentRecord.lastName}</h3>
                <p class="text-blue-100 text-sm">Resident ID: <strong>${residentRecord.residentId}</strong> | Purok: <strong>${residentRecord.purok}</strong> | Household: <strong>${residentRecord.householdNo}</strong></p>
            </div>
            <img src="${residentRecord.photo}" onerror="this.src='https://placehold.co/150x150/1e40af/ffffff?text=RES'" class="w-24 h-24 rounded-2xl object-cover border-4 border-white/30 shadow-md">
        </div>

        <!-- Quick Stats -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <p class="text-xs text-slate-500 font-semibold uppercase">Pending Requests</p>
                <h4 class="text-2xl font-bold text-amber-600 mt-1">${pendingCount}</h4>
            </div>
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <p class="text-xs text-slate-500 font-semibold uppercase">Approved Documents</p>
                <h4 class="text-2xl font-bold text-emerald-600 mt-1">${approvedCount}</h4>
            </div>
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <p class="text-xs text-slate-500 font-semibold uppercase">Upcoming Appointments</p>
                <h4 class="text-2xl font-bold text-blue-600 mt-1">${userAppointments.length}</h4>
            </div>
        </div>

        <!-- Latest Announcements & Notifications -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                <h3 class="font-bold text-slate-800">Latest Barangay Announcements</h3>
                <div class="space-y-3">
                    ${data.announcements.slice(0, 3).map(a => `
                        <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <span class="text-xs text-blue-600 font-semibold">${a.category}</span>
                            <h4 class="font-bold text-slate-800 text-sm">${a.title}</h4>
                            <p class="text-xs text-slate-600 mt-1">${a.description}</p>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                <h3 class="font-bold text-slate-800">My Notifications</h3>
                <div class="space-y-3">
                    ${data.notifications.slice(0, 4).map(n => `
                        <div class="p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-sm">
                            <p class="text-slate-800 font-medium">${n.message}</p>
                            <span class="text-xs text-slate-400">${n.date}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    </div>
    `;
}

function renderResidentProfile(r, data) {
    return `
    <div class="space-y-6">
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div class="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6 pb-6 border-b">
                <img src="${r.photo}" onerror="this.src='https://placehold.co/150x150/1e40af/ffffff?text=RES'" class="w-24 h-24 rounded-full object-cover border-4 border-slate-100 shadow">
                <div class="text-center sm:text-left">
                    <h3 class="text-2xl font-bold text-slate-800">${r.firstName} ${r.middleName} ${r.lastName} ${r.suffix}</h3>
                    <p class="text-sm text-blue-600 font-semibold">Resident ID: ${r.residentId}</p>
                    <p class="text-xs text-slate-500 mt-1">Registered Category: <span class="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-medium">${r.category}</span></p>
                </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-6 text-sm">
                <div><span class="text-xs text-slate-400 uppercase font-semibold">Birthday & Age</span><p class="font-semibold text-slate-800">${r.dob} (${r.age} yrs old)</p></div>
                <div><span class="text-xs text-slate-400 uppercase font-semibold">Gender & Civil Status</span><p class="font-semibold text-slate-800">${r.gender} / ${r.civilStatus}</p></div>
                <div><span class="text-xs text-slate-400 uppercase font-semibold">Address & Purok</span><p class="font-semibold text-slate-800">${r.address}, ${r.purok}</p></div>
                <div><span class="text-xs text-slate-400 uppercase font-semibold">Contact Number</span><p class="font-semibold text-slate-800">${r.contactNumber}</p></div>
                <div><span class="text-xs text-slate-400 uppercase font-semibold">Email Address</span><p class="font-semibold text-slate-800">${r.email}</p></div>
                <div><span class="text-xs text-slate-400 uppercase font-semibold">Voter Status</span><p class="font-semibold text-slate-800">${r.voterStatus}</p></div>
                <div><span class="text-xs text-slate-400 uppercase font-semibold">Occupation</span><p class="font-semibold text-slate-800">${r.occupation}</p></div>
                <div><span class="text-xs text-slate-400 uppercase font-semibold">Educational Attainment</span><p class="font-semibold text-slate-800">${r.educationalAttainment}</p></div>
                <div><span class="text-xs text-slate-400 uppercase font-semibold">Household Number</span><p class="font-semibold text-slate-800">${r.householdNo}</p></div>
            </div>
        </div>

        <!-- Request Profile Update Form -->
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 class="font-bold text-slate-800 mb-2">Request Official Profile Update</h3>
            <p class="text-xs text-slate-500 mb-4">Official records cannot be directly edited by residents. Submit update requests for staff review.</p>
            <form action="/api/resident/request-profile-update" method="POST" class="space-y-4 text-sm">
                <div>
                    <label class="block font-semibold text-slate-700 mb-1">Requested Changes / Correction Details</label>
                    <textarea name="changes" rows="3" placeholder="e.g. Please update my contact number to 09998887766 and my occupation to Senior Carpenter." required class="w-full p-3 border rounded-xl"></textarea>
                </div>
                <button type="submit" class="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition shadow">Submit Update Request</button>
            </form>
        </div>
    </div>
    `;
}

function renderResidentRequestCert(data) {
    return `
    <div class="space-y-6 max-w-2xl mx-auto">
        <div class="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6">
            <div>
                <h3 class="text-xl font-bold text-slate-800">Request Certificate Online</h3>
                <p class="text-sm text-slate-500 mt-1">Select the official barangay document you need processed.</p>
            </div>
            <form action="/api/resident/request-cert" method="POST" class="space-y-4 text-sm">
                <div>
                    <label class="block font-semibold text-slate-700 mb-2">Select Certificate Type</label>
                    <select name="type" class="w-full p-3 border rounded-xl bg-slate-50">
                        <option>Barangay Clearance</option>
                        <option>Certificate of Residency</option>
                        <option>Certificate of Indigency</option>
                        <option>Certificate of Good Moral</option>
                        <option>Certificate of No Income</option>
                        <option>Business Clearance</option>
                    </select>
                </div>
                <div>
                    <label class="block font-semibold text-slate-700 mb-2">Purpose / Remarks</label>
                    <input type="text" name="remarks" placeholder="e.g. Job Application, School Enrollment" required class="w-full p-3 border rounded-xl">
                </div>
                <button type="submit" class="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition shadow-lg shadow-blue-600/30">
                    SUBMIT ONLINE REQUEST
                </button>
            </form>
        </div>
    </div>
    `;
}

function renderResidentTracking(requests) {
    return `
    <div class="space-y-6">
        <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h3 class="font-bold text-slate-800">Track My Document Requests</h3>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-50 border-b text-slate-500 text-xs uppercase font-semibold">
                        <tr>
                            <th class="p-4">Req #</th>
                            <th class="p-4">Document Type</th>
                            <th class="p-4">Date Submitted</th>
                            <th class="p-4">Current Status</th>
                            <th class="p-4">Remarks</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${requests.map(r => `
                            <tr>
                                <td class="p-4 font-bold text-blue-600">${r.reqNo}</td>
                                <td class="p-4 font-semibold text-slate-800">${r.type}</td>
                                <td class="p-4 text-slate-600">${r.dateSubmitted}</td>
                                <td class="p-4">
                                    <span class="px-3 py-1 rounded-full text-xs font-semibold ${r.status==='Approved'?'bg-emerald-50 text-emerald-600':r.status==='Processing'?'bg-blue-50 text-blue-600':'bg-amber-50 text-amber-600'}">${r.status}</span>
                                </td>
                                <td class="p-4 text-slate-500 text-xs">${r.remarks}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;
}

function renderResidentComplaints(data) {
    return `
    <div class="space-y-6 max-w-2xl mx-auto">
        <div class="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6">
            <div>
                <h3 class="text-xl font-bold text-slate-800">Submit Community Complaint or Report</h3>
                <p class="text-sm text-slate-500 mt-1">Report community concerns, noise, or barangay assistance issues.</p>
            </div>
            <form action="/api/resident/submit-complaint" method="POST" class="space-y-4 text-sm">
                <div>
                    <label class="block font-semibold text-slate-700 mb-1">Complaint Type</label>
                    <select name="type" class="w-full p-3 border rounded-xl">
                        <option>Garbage Collection</option>
                        <option>Noise Disturbance</option>
                        <option>Public Safety / Lighting</option>
                        <option>Property Dispute</option>
                        <option>Other Concern</option>
                    </select>
                </div>
                <div>
                    <label class="block font-semibold text-slate-700 mb-1">Subject</label>
                    <input type="text" name="subject" required class="w-full p-3 border rounded-xl">
                </div>
                <div>
                    <label class="block font-semibold text-slate-700 mb-1">Location</label>
                    <input type="text" name="location" required class="w-full p-3 border rounded-xl">
                </div>
                <div>
                    <label class="block font-semibold text-slate-700 mb-1">Description</label>
                    <textarea name="description" rows="4" required class="w-full p-3 border rounded-xl"></textarea>
                </div>
                <button type="submit" class="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition shadow">SUBMIT COMPLAINT</button>
            </form>
        </div>
    </div>
    `;
}

function renderResidentAppointments(appointments) {
    return `
    <div class="space-y-6">
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
            <h3 class="font-bold text-slate-800 text-lg">Book an Appointment with Barangay Officials</h3>
            <form action="/api/resident/book-appointment" method="POST" class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div>
                    <label class="block font-semibold text-slate-700 mb-1">Service</label>
                    <select name="service" class="w-full p-3 border rounded-xl">
                        <option>Certificate Processing</option>
                        <option>Barangay Assistance</option>
                        <option>Complaint Consultation</option>
                        <option>Meeting with Barangay Official</option>
                    </select>
                </div>
                <div>
                    <label class="block font-semibold text-slate-700 mb-1">Preferred Date</label>
                    <input type="date" name="date" required class="w-full p-3 border rounded-xl">
                </div>
                <div>
                    <label class="block font-semibold text-slate-700 mb-1">Preferred Time</label>
                    <input type="text" name="time" placeholder="10:00 AM" required class="w-full p-3 border rounded-xl">
                </div>
                <div class="sm:col-span-3">
                    <button type="submit" class="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition shadow">Book Appointment</button>
                </div>
            </form>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="p-4 border-b"><h3 class="font-bold text-slate-800">My Appointments</h3></div>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-50 border-b text-slate-500 text-xs uppercase">
                        <tr>
                            <th class="p-4">Service</th>
                            <th class="p-4">Date & Time</th>
                            <th class="p-4">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${appointments.map(a => `
                            <tr>
                                <td class="p-4 font-semibold text-slate-800">${a.service}</td>
                                <td class="p-4 text-slate-600">${a.date} at ${a.time}</td>
                                <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ${a.status==='Approved'?'bg-emerald-50 text-emerald-600':'bg-amber-50 text-amber-600'}">${a.status}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;
}

function renderResidentAnnouncements(data) {
    return `
    <div class="space-y-6">
        <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h3 class="font-bold text-slate-800">Barangay News & Events</h3>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${data.announcements.map(a => `
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                    <span class="px-2.5 py-1 bg-blue-50 text-blue-600 text-xs font-semibold rounded-md">${a.category}</span>
                    <h4 class="font-bold text-lg text-slate-800">${a.title}</h4>
                    <p class="text-sm text-slate-600">${a.description}</p>
                    <span class="text-xs text-slate-400 block pt-2">Date: ${a.date}</span>
                </div>
            `).join('')}
        </div>
    </div>
    `;
}

function renderResidentContacts(data) {
    return `
    <div class="space-y-6">
        <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h3 class="font-bold text-slate-800">Emergency Hotlines & Key Contacts</h3>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${data.emergencyContacts.map(c => `
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                    <span class="text-xs font-semibold text-blue-600 uppercase">${c.category}</span>
                    <h4 class="font-bold text-lg text-slate-800">${c.name}</h4>
                    <a href="tel:${c.number}" class="inline-block px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm shadow transition">📞 Call ${c.number}</a>
                </div>
            `).join('')}
        </div>
    </div>
    `;
}

function renderResidentFeedback() {
    return `
    <div class="space-y-6 max-w-xl mx-auto">
        <div class="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6">
            <div>
                <h3 class="text-xl font-bold text-slate-800">Rate Our Barangay Service</h3>
                <p class="text-sm text-slate-500 mt-1">Help us improve our community services.</p>
            </div>
            <form action="/api/resident/submit-feedback" method="POST" class="space-y-4 text-sm">
                <div>
                    <label class="block font-semibold text-slate-700 mb-2">Rating (1 to 5 Stars)</label>
                    <select name="rating" class="w-full p-3 border rounded-xl">
                        <option value="5">⭐⭐⭐⭐⭐ (5 - Excellent)</option>
                        <option value="4">⭐⭐⭐⭐ (4 - Very Good)</option>
                        <option value="3">⭐⭐⭐ (3 - Satisfactory)</option>
                        <option value="2">⭐⭐ (2 - Needs Improvement)</option>
                        <option value="1">⭐ (1 - Poor)</option>
                    </select>
                </div>
                <div>
                    <label class="block font-semibold text-slate-700 mb-2">Comments & Suggestions</label>
                    <textarea name="comments" rows="4" placeholder="Write your feedback here..." required class="w-full p-3 border rounded-xl"></textarea>
                </div>
                <button type="submit" class="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition shadow">SUBMIT FEEDBACK</button>
            </form>
        </div>
    </div>
    `;
}

// Server Startup
app.listen(PORT, () => {
    console.log(`Barangay Resident Management System running on port ${PORT}`);
});
