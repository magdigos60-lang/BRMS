/*
================================================================================
BARANGAY RESIDENT MANAGEMENT SYSTEM (BRMS) - SINGLE-FILE FULL STACK APP
================================================================================
SUPABASE DATABASE SETUP SQL
================================================================================
Copy and paste the following SQL script into your Supabase SQL Editor to initialize 
all required tables, indexes, enums, triggers, and storage buckets.

-- START SUPABASE DATABASE SETUP SQL --

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- BARANGAY SETTINGS TABLE
CREATE TABLE IF NOT EXISTS barangay_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL DEFAULT 'Barangay Central',
    municipality VARCHAR(255) NOT NULL DEFAULT 'City of Prosperity',
    province VARCHAR(255) NOT NULL DEFAULT 'Metro Province',
    logo_url TEXT DEFAULT '',
    address TEXT DEFAULT 'Main Street, Hall Complex',
    contact_number VARCHAR(50) DEFAULT '(02) 8888-0000',
    email VARCHAR(255) DEFAULT 'contact@barangaycentral.gov.ph',
    captain_name VARCHAR(255) DEFAULT 'Hon. Maria Santos',
    secretary_name VARCHAR(255) DEFAULT 'Juan Dela Cruz',
    login_bg_url TEXT DEFAULT 'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1920&q=80',
    id_header TEXT DEFAULT 'REPUBLIC OF THE PHILIPPINES',
    id_footer TEXT DEFAULT 'NOT TRANSFERABLE • IF FOUND PLEASE RETURN TO BARANGAY HALL',
    certificate_header TEXT DEFAULT 'OFFICE OF THE BARANGAY CAPTAIN',
    certificate_footer TEXT DEFAULT 'Valid for six (6) months from date of issuance.',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'STAFF', 'RESIDENT')),
    must_change_password BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- PUROKS TABLE
CREATE TABLE IF NOT EXISTS puroks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- HOUSEHOLDS TABLE
CREATE TABLE IF NOT EXISTS households (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_number VARCHAR(100) UNIQUE NOT NULL,
    purok_id UUID REFERENCES puroks(id) ON DELETE SET NULL,
    head_resident_id UUID,
    address TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- RESIDENTS TABLE
CREATE TABLE IF NOT EXISTS residents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    resident_number VARCHAR(50) UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100) DEFAULT '',
    last_name VARCHAR(100) NOT NULL,
    suffix VARCHAR(20) DEFAULT '',
    date_of_birth DATE NOT NULL,
    gender VARCHAR(20) NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
    civil_status VARCHAR(50) NOT NULL DEFAULT 'Single',
    address TEXT NOT NULL,
    purok_id UUID REFERENCES puroks(id) ON DELETE SET NULL,
    household_id UUID REFERENCES households(id) ON DELETE SET NULL,
    contact_number VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    occupation VARCHAR(100) DEFAULT 'N/A',
    educational_attainment VARCHAR(100) DEFAULT 'N/A',
    nationality VARCHAR(100) DEFAULT 'Filipino',
    is_voter BOOLEAN DEFAULT false,
    is_pwd BOOLEAN DEFAULT false,
    is_senior_citizen BOOLEAN DEFAULT false,
    is_solo_parent BOOLEAN DEFAULT false,
    is_4ps BOOLEAN DEFAULT false,
    photo_url TEXT DEFAULT '',
    qr_token VARCHAR(255) UNIQUE DEFAULT uuid_generate_v4(),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'REJECTED', 'ARCHIVED')),
    rejection_reason TEXT DEFAULT '',
    registration_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add Foreign key constraint back to households for head_resident_id
ALTER TABLE households DROP CONSTRAINT IF EXISTS fk_household_head;
ALTER TABLE households ADD CONSTRAINT fk_household_head FOREIGN KEY (head_resident_id) REFERENCES residents(id) ON DELETE SET NULL;

-- CERTIFICATE TYPES
CREATE TABLE IF NOT EXISTS certificate_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(150) NOT NULL,
    fee DECIMAL(10,2) DEFAULT 0.00,
    requirements TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- CERTIFICATE REQUESTS TABLE
CREATE TABLE IF NOT EXISTS certificate_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_number VARCHAR(50) UNIQUE NOT NULL,
    resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
    certificate_type VARCHAR(150) NOT NULL,
    purpose TEXT NOT NULL,
    additional_info TEXT DEFAULT '',
    preferred_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'READY_FOR_CLAIM', 'RELEASED')),
    rejection_reason TEXT DEFAULT '',
    staff_remarks TEXT DEFAULT '',
    issued_document_url TEXT DEFAULT '',
    release_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- APPOINTMENTS TABLE
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_number VARCHAR(50) UNIQUE NOT NULL,
    resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
    service VARCHAR(150) NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    purpose TEXT NOT NULL,
    notes TEXT DEFAULT '',
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED')),
    staff_remarks TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- COMPLAINTS / BLOTTER TABLE
CREATE TABLE IF NOT EXISTS blotter_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_number VARCHAR(50) UNIQUE NOT NULL,
    complainant_id UUID REFERENCES residents(id) ON DELETE SET NULL,
    complainant_name VARCHAR(255) NOT NULL,
    respondent_name VARCHAR(255) NOT NULL,
    witness_name VARCHAR(255) DEFAULT '',
    incident_date DATE NOT NULL,
    incident_location TEXT NOT NULL,
    description TEXT NOT NULL,
    action_taken TEXT DEFAULT '',
    settlement_details TEXT DEFAULT '',
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'UNDER_INVESTIGATION', 'SCHEDULED_HEARING', 'SETTLED', 'DISMISSED')),
    date_closed DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ASSISTANCE REQUESTS TABLE
CREATE TABLE IF NOT EXISTS assistance_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference_number VARCHAR(50) UNIQUE NOT NULL,
    resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL CHECK (type IN ('Medical Assistance', 'Educational Assistance', 'Financial Assistance', 'Food Assistance', 'Emergency Assistance')),
    amount_requested DECIMAL(10,2) DEFAULT 0.00,
    amount_approved DECIMAL(10,2) DEFAULT 0.00,
    details TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'RELEASED')),
    staff_remarks TEXT DEFAULT '',
    release_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ANNOUNCEMENTS TABLE
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) DEFAULT 'General',
    description TEXT NOT NULL,
    event_date DATE,
    image_url TEXT DEFAULT '',
    is_published BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- BUSINESSES TABLE
CREATE TABLE IF NOT EXISTS businesses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    owner_resident_id UUID REFERENCES residents(id) ON DELETE SET NULL,
    address TEXT NOT NULL,
    business_type VARCHAR(100) NOT NULL,
    contact_number VARCHAR(50) NOT NULL,
    permit_number VARCHAR(100) UNIQUE NOT NULL,
    permit_status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (permit_status IN ('PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED')),
    registration_date DATE DEFAULT CURRENT_DATE,
    expiration_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    target_role VARCHAR(50) DEFAULT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    link_url TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ACTIVITY LOGS TABLE
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    username VARCHAR(100) NOT NULL,
    action VARCHAR(255) NOT NULL,
    details TEXT DEFAULT '',
    ip_address VARCHAR(50) DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- STORAGE BUCKETS SETUP
INSERT INTO storage.buckets (id, name, public) VALUES ('brms-docs', 'brms-docs', true) ON CONFLICT (id) DO NOTHING;

-- INDEXES FOR SPEED
CREATE INDEX IF NOT EXISTS idx_residents_status ON residents(status);
CREATE INDEX IF NOT EXISTS idx_residents_user ON residents(user_id);
CREATE INDEX IF NOT EXISTS idx_cert_req_res ON certificate_requests(resident_id);
CREATE INDEX IF NOT EXISTS idx_cert_req_status ON certificate_requests(status);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_user ON activity_logs(user_id);

-- END SUPABASE DATABASE SETUP SQL --
*/

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase Client
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-supabase-url.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-anon-key';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET || 'brms_secure_session_secret_2026';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Middleware Configuration
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(cookieParser());
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

const upload = multer({ storage: multer.memoryStorage() });

// --- DEFAULT SYSTEM CREDENTIALS CONSTANTS ---
const DEFAULT_ADMIN = {
    username: 'admin',
    password: 'ChangeMe123!',
    email: 'admin@barangay.gov.ph',
    role: 'ADMIN'
};

// Global Barangay Settings cache/helper
async function getBarangaySettings() {
    try {
        const { data, error } = await supabase.from('barangay_settings').select('*').limit(1).single();
        if (error || !data) {
            return {
                name: 'Barangay Central',
                municipality: 'City of Prosperity',
                province: 'Metro Province',
                logo_url: '',
                address: 'Main Street, Hall Complex',
                contact_number: '(02) 8888-0000',
                email: 'contact@barangaycentral.gov.ph',
                captain_name: 'Hon. Maria Santos',
                secretary_name: 'Juan Dela Cruz',
                login_bg_url: 'https://scontent.fcrk3-3.fna.fbcdn.net/v/t39.30808-6/467984538_122130208178389200_2470999473131951042_n.jpg?stp=dst-jpg_tt6&cstp=mx1857x2048&ctp=s1857x2048&_nc_cat=107&ccb=1-7&_nc_sid=cc71e4&_nc_eui2=AeH-CrVk3UW0Tqq0z_SDhKwemnbseM68ydCadux4zrzJ0I4R6gykVtH1GEMMnjk_E0vUUupJBZ3vwMdzuIfYXMgZ&_nc_ohc=fKl5LR1-2YwQ7kNvwH7PIf8&_nc_oc=AdqAy1CtUXak56hu0R2Ufzy_6npapuoitUaMuup0g9veAD0bOy9PFjySTvVXJasGWis&_nc_zt=23&_nc_ht=scontent.fcrk3-3.fna&_nc_gid=SU-DBALnvlE-vtQ4KjJx4g&_nc_ss=7b2a8&oh=00_AQK7MxJys6gqu1LJrVhDYZ2WNBpKcThfTEtIUXEWUeB_Qw&oe=6ABBAEB1',
                id_header: 'REPUBLIC OF THE PHILIPPINES',
                id_footer: 'NOT TRANSFERABLE • IF FOUND PLEASE RETURN TO BARANGAY HALL',
                certificate_header: 'OFFICE OF THE BARANGAY CAPTAIN',
                certificate_footer: 'Valid for six (6) months from date of issuance.'
            };
        }
        return data;
    } catch (e) {
        return { name: 'Barangay Central', municipality: 'City Hall', province: 'Province' };
    }
}

// Log System Activity
async function logActivity(userId, username, action, details = '', req = null) {
    try {
        const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : '';
        await supabase.from('activity_logs').insert([{
            user_id: userId,
            username: username || 'System',
            action: action,
            details: details,
            ip_address: ip
        }]);
    } catch (e) {
        console.error('Activity Log Error:', e);
    }
}

// Create Notification Helper
async function createNotification(userId, targetRole, title, message, linkUrl = '') {
    try {
        await supabase.from('notifications').insert([{
            user_id: userId || null,
            target_role: targetRole || null,
            title: title,
            message: message,
            link_url: linkUrl
        }]);
    } catch (e) {
        console.error('Notification Error:', e);
    }
}

// Authentication Middleware
const requireAuth = (roles = []) => async (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/login?error=Session expired. Please log in.');
    }
    if (roles.length > 0 && !roles.includes(req.session.user.role)) {
        return res.status(403).send('Forbidden: Access Denied');
    }
    next();
};

// System Initializer
async function initializeSystemDefaults() {
    try {
        const { data: settings } = await supabase.from('barangay_settings').select('id');
        if (!settings || settings.length === 0) {
            await supabase.from('barangay_settings').insert([{
                name: 'Barangay Central',
                municipality: 'City of Prosperity',
                province: 'Metro Province',
                address: 'Main Street, Hall Complex',
                contact_number: '(02) 8888-0000',
                email: 'contact@barangay.gov.ph',
                captain_name: 'Hon. Maria Santos',
                secretary_name: 'Juan Dela Cruz',
                login_bg_url: 'https://scontent.fcrk3-3.fna.fbcdn.net/v/t39.30808-6/467984538_122130208178389200_2470999473131951042_n.jpg?stp=dst-jpg_tt6&cstp=mx1857x2048&ctp=s1857x2048&_nc_cat=107&ccb=1-7&_nc_sid=cc71e4&_nc_eui2=AeH-CrVk3UW0Tqq0z_SDhKwemnbseM68ydCadux4zrzJ0I4R6gykVtH1GEMMnjk_E0vUUupJBZ3vwMdzuIfYXMgZ&_nc_ohc=fKl5LR1-2YwQ7kNvwH7PIf8&_nc_oc=AdqAy1CtUXak56hu0R2Ufzy_6npapuoitUaMuup0g9veAD0bOy9PFjySTvVXJasGWis&_nc_zt=23&_nc_ht=scontent.fcrk3-3.fna&_nc_gid=SU-DBALnvlE-vtQ4KjJx4g&_nc_ss=7b2a8&oh=00_AQK7MxJys6gqu1LJrVhDYZ2WNBpKcThfTEtIUXEWUeB_Qw&oe=6ABBAEB1'
            }]);
        }

        const { data: users } = await supabase.from('users').select('id');
        if (!users || users.length === 0) {
            const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN.password, 10);
            await supabase.from('users').insert([{
                username: DEFAULT_ADMIN.username,
                password: hashedPassword,
                email: DEFAULT_ADMIN.email,
                role: DEFAULT_ADMIN.role,
                must_change_password: true
            }]);
            console.log('Default Admin Account Created Successfully.');
        }

        // Initialize default Puroks if none
        const { data: puroks } = await supabase.from('puroks').select('id');
        if (!puroks || puroks.length === 0) {
            await supabase.from('puroks').insert([
                { name: 'Purok 1 - Sampaguita' },
                { name: 'Purok 2 - Dahlias' },
                { name: 'Purok 3 - Camia' },
                { name: 'Purok 4 - Rosal' }
            ]);
        }
    } catch (err) {
        console.error('Initialization error:', err);
    }
}
initializeSystemDefaults();

// Express Base Layout Component Dynamic UI Render Engine
function renderFullPageUI(title, content, user = null, settings = {}, activeTab = 'dashboard', extraHead = '') {
    const isStaff = user && (user.role === 'ADMIN' || user.role === 'STAFF');
    const isResident = user && user.role === 'RESIDENT';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - ${settings.name || 'Barangay System'}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
    ${extraHead}
    <style>
        :root {
            --bg-primary-green: #0d5c3a;
            --bg-secondary-green: #147a4e;
            --bg-light-green: #e8f5e9;
            --bg-primary-blue: #0f4c81;
            --bg-secondary-blue: #1e6091;
            --bg-light-blue: #e1f5fe;
            --accent-gold: #f4a261;
            --dark-sidebar: #0b3c26;
            --sidebar-width: 260px;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f4f6f9;
            color: #333;
            min-height: 100vh;
        }

        .navbar-top {
            background: linear-gradient(135deg, var(--bg-primary-green) 0%, var(--bg-primary-blue) 100%);
            color: white;
            padding: 12px 24px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.15);
            position: sticky;
            top: 0;
            z-index: 1030;
        }

        .navbar-brand-custom {
            display: flex;
            align-items: center;
            gap: 12px;
            color: white;
            text-decoration: none;
            font-weight: 700;
            font-size: 1.25rem;
        }

        .navbar-brand-custom img {
            width: 42px;
            height: 42px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid white;
            background-color: white;
        }

        .wrapper {
            display: flex;
            min-height: calc(100vh - 66px);
        }

        .sidebar {
            width: var(--sidebar-width);
            background-color: var(--dark-sidebar);
            color: #ecf0f1;
            flex-shrink: 0;
            transition: all 0.3s ease;
            box-shadow: 3px 0 10px rgba(0,0,0,0.1);
        }

        .sidebar .menu-label {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #8faec4;
            padding: 16px 20px 6px;
            font-weight: 600;
        }

        .sidebar-menu {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .sidebar-menu li a {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 20px;
            color: #d1d8e0;
            text-decoration: none;
            font-size: 0.95rem;
            transition: background 0.2s, color 0.2s;
            border-left: 4px solid transparent;
        }

        .sidebar-menu li a:hover, .sidebar-menu li a.active {
            background-color: rgba(255, 255, 255, 0.1);
            color: #ffffff;
            border-left-color: var(--accent-gold);
        }

        .main-content {
            flex-grow: 1;
            padding: 28px;
            overflow-x: hidden;
        }

        .card-stat {
            border: none;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            transition: transform 0.2s;
        }

        .card-stat:hover {
            transform: translateY(-4px);
        }

        .bg-green-grad {
            background: linear-gradient(135deg, #11998e, #38ef7d);
            color: white;
        }

        .bg-blue-grad {
            background: linear-gradient(135deg, #2193b0, #6dd5ed);
            color: white;
        }

        .bg-orange-grad {
            background: linear-gradient(135deg, #ff9966, #ff5e62);
            color: white;
        }

        .bg-purple-grad {
            background: linear-gradient(135deg, #8e2de2, #4a00e0);
            color: white;
        }

        .badge-status-PENDING { background-color: #ffc107; color: #212529; }
        .badge-status-ACTIVE { background-color: #198754; color: white; }
        .badge-status-APPROVED { background-color: #198754; color: white; }
        .badge-status-REJECTED { background-color: #dc3545; color: white; }
        .badge-status-ARCHIVED { background-color: #6c757d; color: white; }
        .badge-status-READY_FOR_CLAIM { background-color: #0dcaf0; color: #212529; }
        .badge-status-RELEASED { background-color: #0d6efd; color: white; }

        /* PRINT STYLES FOR 8 IDS PER PAGE */
        @media print {
            body * { visibility: hidden; }
            .print-area, .print-area * { visibility: visible; }
            .print-area { position: absolute; left: 0; top: 0; width: 100%; }
            .no-print { display: none !important; }
            
            @page {
                size: letter portrait;
                margin: 0.4in;
            }

            .id-card-grid {
                display: grid !important;
                grid-template-columns: repeat(2, 3.375in) !important;
                grid-auto-rows: 2.125in !important;
                gap: 0.2in !important;
                justify-content: center !important;
            }

            .id-card-item {
                width: 3.375in !important;
                height: 2.125in !important;
                border: 1.5px solid #0d5c3a !important;
                border-radius: 8px !important;
                padding: 8px !important;
                box-sizing: border-box !important;
                page-break-inside: avoid !important;
                background: #fff !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
        }

        .id-card-preview {
            width: 3.375in;
            height: 2.125in;
            border: 2px solid #0d5c3a;
            border-radius: 10px;
            background: linear-gradient(135deg, #ffffff 0%, #e8f5e9 100%);
            box-shadow: 0 4px 10px rgba(0,0,0,0.15);
            position: relative;
            overflow: hidden;
            padding: 8px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }

        .toast-container { z-index: 1090; }
    </style>
</head>
<body>

    <!-- TOP NAVBAR -->
    <header class="navbar-top d-flex justify-content-between align-items-center no-print">
        <a href="/" class="navbar-brand-custom">
            <img src="${settings.logo_url || 'https://via.placeholder.com/150/0d5c3a/FFFFFF?text=BRGY'}" alt="Logo">
            <div>
                <div>${settings.name || 'BARANGAY MANAGEMENT'}</div>
                <small style="font-size: 0.75rem; opacity: 0.85; font-weight: 400; display: block;">${settings.municipality || ''}, ${settings.province || ''}</small>
            </div>
        </a>

        ${user ? `
        <div class="d-flex align-items-center gap-3">
            <div class="dropdown">
                <button class="btn btn-outline-light btn-sm dropdown-toggle d-flex align-items-center gap-2" type="button" data-bs-toggle="dropdown">
                    <i class="bi bi-person-circle fs-5"></i>
                    <span>${user.username} (${user.role})</span>
                </button>
                <ul class="dropdown-menu dropdown-menu-end">
                    <li><a class="dropdown-menu-item dropdown-item" href="/profile"><i class="bi bi-person me-2"></i> My Profile</a></li>
                    <li><a class="dropdown-menu-item dropdown-item" href="/settings"><i class="bi bi-gear me-2"></i> Settings</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-menu-item dropdown-item text-danger" href="/logout"><i class="bi bi-box-arrow-right me-2"></i> Logout</a></li>
                </ul>
            </div>
        </div>
        ` : ''}
    </header>

    <div class="wrapper">
        ${user ? `
        <!-- SIDEBAR NAVIGATION -->
        <nav class="sidebar no-print">
            <ul class="sidebar-menu">
                ${isStaff ? `
                    <div class="menu-label">STAFF PORTAL</div>
                    <li><a href="/dashboard" class="${activeTab === 'dashboard' ? 'active' : ''}"><i class="bi bi-speedometer2"></i> Dashboard</a></li>
                    <li><a href="/residents" class="${activeTab === 'residents' ? 'active' : ''}"><i class="bi bi-people"></i> Residents</a></li>
                    <li><a href="/households" class="${activeTab === 'households' ? 'active' : ''}"><i class="bi bi-house-door"></i> Households</a></li>
                    <li><a href="/puroks" class="${activeTab === 'puroks' ? 'active' : ''}"><i class="bi bi-geo-alt"></i> Puroks</a></li>
                    <li><a href="/certificate-requests" class="${activeTab === 'requests' ? 'active' : ''}"><i class="bi bi-file-earmark-text"></i> Certificate Requests</a></li>
                    <li><a href="/blotter" class="${activeTab === 'blotter' ? 'active' : ''}"><i class="bi bi-shield-exclamation"></i> Blotters / Complaints</a></li>
                    <li><a href="/appointments" class="${activeTab === 'appointments' ? 'active' : ''}"><i class="bi bi-calendar-event"></i> Appointments</a></li>
                    <li><a href="/assistance" class="${activeTab === 'assistance' ? 'active' : ''}"><i class="bi bi-heart-pulse"></i> Assistance Requests</a></li>
                    <li><a href="/businesses" class="${activeTab === 'businesses' ? 'active' : ''}"><i class="bi bi-shop"></i> Local Businesses</a></li>
                    <li><a href="/announcements" class="${activeTab === 'announcements' ? 'active' : ''}"><i class="bi bi-megaphone"></i> Announcements</a></li>
                    <li><a href="/qr-scanner" class="${activeTab === 'qr' ? 'active' : ''}"><i class="bi bi-qr-code-scan"></i> QR Claim Scanner</a></li>
                    <li><a href="/reports" class="${activeTab === 'reports' ? 'active' : ''}"><i class="bi bi-bar-chart-line"></i> System Reports</a></li>
                    <div class="menu-label">ADMINISTRATION</div>
                    <li><a href="/users" class="${activeTab === 'users' ? 'active' : ''}"><i class="bi bi-person-gear"></i> Staff Users</a></li>
                    <li><a href="/activity-logs" class="${activeTab === 'logs' ? 'active' : ''}"><i class="bi bi-clock-history"></i> Activity Logs</a></li>
                    <li><a href="/barangay-settings" class="${activeTab === 'settings' ? 'active' : ''}"><i class="bi bi-sliders"></i> Barangay Settings</a></li>
                ` : ''}

                ${isResident ? `
                    <div class="menu-label">RESIDENT PORTAL</div>
                    <li><a href="/resident-dashboard" class="${activeTab === 'dashboard' ? 'active' : ''}"><i class="bi bi-house-heart"></i> Dashboard</a></li>
                    <li><a href="/my-digital-id" class="${activeTab === 'digital-id' ? 'active' : ''}"><i class="bi bi-person-badge"></i> My Digital ID</a></li>
                    <li><a href="/my-requests" class="${activeTab === 'my-requests' ? 'active' : ''}"><i class="bi bi-file-earmark-check"></i> Certificate Requests</a></li>
                    <li><a href="/my-appointments" class="${activeTab === 'my-appointments' ? 'active' : ''}"><i class="bi bi-calendar2-check"></i> My Appointments</a></li>
                    <li><a href="/my-complaints" class="${activeTab === 'my-complaints' ? 'active' : ''}"><i class="bi bi-exclamation-diamond"></i> Submit Complaint</a></li>
                    <li><a href="/my-assistance" class="${activeTab === 'my-assistance' ? 'active' : ''}"><i class="bi bi-hand-thumbs-up"></i> Request Assistance</a></li>
                    <li><a href="/my-announcements" class="${activeTab === 'my-announcements' ? 'active' : ''}"><i class="bi bi-bell"></i> Announcements</a></li>
                    <li><a href="/my-profile" class="${activeTab === 'my-profile' ? 'active' : ''}"><i class="bi bi-person-lines-fill"></i> Profile & Password</a></li>
                ` : ''}

                <div class="menu-label">ACCOUNT</div>
                <li><a href="/logout"><i class="bi bi-box-arrow-right text-danger"></i> Logout</a></li>
            </ul>
        </nav>
        ` : ''}

        <!-- MAIN CONTENT AREA -->
        <main class="main-content">
            ${content}
        </main>
    </div>

    <!-- GLOBAL TOAST NOTIFICATIONS CONTAINER -->
    <div class="toast-container position-fixed bottom-0 end-0 p-3"></div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        // Universal helper for toast notifications
        function showToast(message, type = 'info') {
            const container = document.querySelector('.toast-container');
            const bgClass = type === 'success' ? 'bg-success text-white' : (type === 'error' ? 'bg-danger text-white' : 'bg-primary text-white');
            const toastEl = document.createElement('div');
            toastEl.className = \`toast align-items-center \${bgClass} border-0 show\`;
            toastEl.setAttribute('role', 'alert');
            toastEl.innerHTML = \`
                <div class="d-flex">
                    <div class="toast-body">\${message}</div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                </div>
            \`;
            container.appendChild(toastEl);
            setTimeout(() => { toastEl.remove(); }, 4000);
        }

        // Auto display query params alerts
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('success')) showToast(urlParams.get('success'), 'success');
        if (urlParams.has('error')) showToast(urlParams.get('error'), 'error');
    </script>
</body>
</html>`;
}

// ROUTE: SYSTEM SETUP / SETUP ADMIN PAGE
app.get('/setup', async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: users } = await supabase.from('users').select('id');

    const html = `
    <div class="container py-5" style="max-width: 600px;">
        <div class="card shadow-lg border-0 rounded-4">
            <div class="card-header bg-success text-white text-center py-4 rounded-top-4">
                <h3 class="fw-bold mb-0">System Setup & Initialization</h3>
                <p class="mb-0 text-white-50">Create Primary Administrator Account</p>
            </div>
            <div class="card-body p-4">
                <div class="alert alert-info small">
                    <i class="bi bi-info-circle-fill me-2"></i>
                    Initial setup allows you to configure your custom Administrator credentials.
                    The initial system setup credentials are: <br>
                    <strong>Username:</strong> ${DEFAULT_ADMIN.username} | <strong>Password:</strong> ${DEFAULT_ADMIN.password}
                </div>

                <form action="/setup" method="POST">
                    <div class="mb-3">
                        <label class="form-label fw-bold">Barangay Name</label>
                        <input type="text" name="barangay_name" class="form-control" value="${settings.name}" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Admin Username</label>
                        <input type="text" name="username" class="form-control" value="${DEFAULT_ADMIN.username}" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Admin Email</label>
                        <input type="email" name="email" class="form-control" value="${DEFAULT_ADMIN.email}" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">New Admin Password</label>
                        <input type="password" name="password" class="form-control" minlength="8" required>
                    </div>
                    <button type="submit" class="btn btn-success w-100 py-2 fw-bold">Complete System Setup</button>
                </form>
            </div>
        </div>
    </div>`;

    res.send(renderFullPageUI('System Setup', html, null, settings));
});

app.post('/setup', async (req, res) => {
    try {
        const { barangay_name, username, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update barangay settings
        await supabase.from('barangay_settings').update({ name: barangay_name }).neq('id', '00000000-0000-0000-0000-000000000000');

        // Check if admin user exists
        const { data: users } = await supabase.from('users').select('*').eq('role', 'ADMIN');
        if (users && users.length > 0) {
            await supabase.from('users').update({
                username,
                email,
                password: hashedPassword,
                must_change_password: false
            }).eq('id', users[0].id);
        } else {
            await supabase.from('users').insert([{
                username,
                email,
                password: hashedPassword,
                role: 'ADMIN',
                must_change_password: false
            }]);
        }

        res.redirect('/login?success=Admin setup completed successfully. Please login.');
    } catch (e) {
        res.redirect('/setup?error=' + encodeURIComponent(e.message));
    }
});

// ROUTE: LOGIN PAGE
app.get('/login', async (req, res) => {
    const settings = await getBarangaySettings();
    const bgUrl = settings.login_bg_url || 'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1920&q=80';

    const loginHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - ${settings.name}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" rel="stylesheet">
    <style>
        body {
            background: linear-gradient(rgba(13, 92, 58, 0.75), rgba(15, 76, 129, 0.85)), url('${bgUrl}');
            background-size: cover;
            background-position: center;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .login-card {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            box-shadow: 0 15px 35px rgba(0,0,0,0.3);
            width: 100%;
            max-width: 440px;
            overflow: hidden;
        }
        .login-header {
            background: linear-gradient(135deg, #0d5c3a, #0f4c81);
            color: white;
            padding: 30px 20px;
            text-align: center;
        }
        .login-header img {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            border: 3px solid white;
            margin-bottom: 12px;
            background: white;
            object-fit: cover;
        }
    </style>
</head>
<body>

<div class="login-card">
    <div class="login-header">
        <img src="${settings.logo_url || 'https://via.placeholder.com/150/0d5c3a/FFFFFF?text=BRGY'}" alt="Barangay Logo">
        <h4 class="fw-bold mb-0">${settings.name}</h4>
        <p class="small text-white-50 mb-0">${settings.municipality}, ${settings.province}</p>
    </div>
    <div class="p-4">
        ${req.query.error ? `<div class="alert alert-danger py-2 fs-6">${req.query.error}</div>` : ''}
        ${req.query.success ? `<div class="alert alert-success py-2 fs-6">${req.query.success}</div>` : ''}

        <form action="/login" method="POST">
            <div class="mb-3">
                <label class="form-label fw-semibold">Username or Email</label>
                <div class="input-group">
                    <span class="input-group-text"><i class="bi bi-person"></i></span>
                    <input type="text" name="username" class="form-control" placeholder="Enter username" required>
                </div>
            </div>
            <div class="mb-3">
                <label class="form-label fw-semibold">Password</label>
                <div class="input-group">
                    <span class="input-group-text"><i class="bi bi-lock"></i></span>
                    <input type="password" name="password" class="form-control" placeholder="Enter password" required>
                </div>
            </div>
            <button type="submit" class="btn btn-success w-100 py-2 fw-bold shadow-sm">LOG IN</button>
        </form>

        <hr class="my-4">

        <div class="text-center">
            <p class="mb-2 text-muted">Don't have an account yet?</p>
            <a href="/register" class="btn btn-outline-primary btn-sm w-100 fw-semibold">Register as Resident</a>
        </div>

        <div class="mt-3 text-center">
            <a href="/setup" class="text-muted small text-decoration-none"><i class="bi bi-gear-fill me-1"></i> System Setup Page</a>
        </div>
    </div>
</div>

</body>
</html>`;

    res.send(loginHtml);
});

// LOGIN ACTION
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .or(`username.eq.${username},email.eq.${username}`)
            .limit(1);

        if (error || !users || users.length === 0) {
            return res.redirect('/login?error=Invalid username or password.');
        }

        const user = users[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.redirect('/login?error=Invalid username or password.');
        }

        // If user is resident, check registration status
        if (user.role === 'RESIDENT') {
            const { data: resident } = await supabase
                .from('residents')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (resident && resident.status === 'PENDING') {
                return res.redirect('/login?error=Your registration is still pending approval by Barangay Staff.');
            }
            if (resident && resident.status === 'REJECTED') {
                return res.redirect(`/login?error=Registration Rejected: ${resident.rejection_reason || 'Contact hall.'}`);
            }
            if (resident && resident.status === 'ARCHIVED') {
                return res.redirect('/login?error=Your resident record has been archived. Please contact barangay administration.');
            }
            req.session.resident = resident;
        }

        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        };

        await logActivity(user.id, user.username, 'LOGIN', 'User logged in successfully', req);

        if (user.must_change_password) {
            return res.redirect('/change-password');
        }

        if (user.role === 'ADMIN' || user.role === 'STAFF') {
            return res.redirect('/dashboard');
        } else {
            return res.redirect('/resident-dashboard');
        }
    } catch (e) {
        res.redirect('/login?error=' + encodeURIComponent(e.message));
    }
});

// LOGOUT
app.get('/logout', async (req, res) => {
    if (req.session.user) {
        await logActivity(req.session.user.id, req.session.user.username, 'LOGOUT', 'User logged out', req);
    }
    req.session.destroy();
    res.redirect('/login?success=Logged out successfully.');
});

// ROUTE: RESIDENT PUBLIC REGISTRATION
app.get('/register', async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: puroks } = await supabase.from('puroks').select('*').order('name');

    const html = `
    <div class="container py-4" style="max-width: 800px;">
        <div class="card shadow border-0 rounded-4">
            <div class="card-header bg-success text-white text-center py-3 rounded-top-4">
                <h4 class="fw-bold mb-0"><i class="bi bi-person-plus-fill me-2"></i>Barangay Resident Online Registration</h4>
                <small>Fill out all fields carefully. Approval is required before login.</small>
            </div>
            <div class="card-body p-4">
                <form action="/register" method="POST">
                    <h6 class="fw-bold text-success border-bottom pb-2 mb-3">Account Details</h6>
                    <div class="row g-3 mb-3">
                        <div class="col-md-4">
                            <label class="form-label fw-semibold">Username</label>
                            <input type="text" name="username" class="form-control" required>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label fw-semibold">Email Address</label>
                            <input type="email" name="email" class="form-control" required>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label fw-semibold">Password</label>
                            <input type="password" name="password" class="form-control" minlength="6" required>
                        </div>
                    </div>

                    <h6 class="fw-bold text-success border-bottom pb-2 mb-3">Personal Information</h6>
                    <div class="row g-3 mb-3">
                        <div class="col-md-4">
                            <label class="form-label fw-semibold">First Name</label>
                            <input type="text" name="first_name" class="form-control" required>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label fw-semibold">Middle Name</label>
                            <input type="text" name="middle_name" class="form-control">
                        </div>
                        <div class="col-md-3">
                            <label class="form-label fw-semibold">Last Name</label>
                            <input type="text" name="last_name" class="form-control" required>
                        </div>
                        <div class="col-md-1">
                            <label class="form-label fw-semibold">Suffix</label>
                            <input type="text" name="suffix" class="form-control" placeholder="Jr">
                        </div>
                    </div>

                    <div class="row g-3 mb-3">
                        <div class="col-md-4">
                            <label class="form-label fw-semibold">Date of Birth</label>
                            <input type="date" name="date_of_birth" class="form-control" required>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label fw-semibold">Gender</label>
                            <select name="gender" class="form-select" required>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label fw-semibold">Civil Status</label>
                            <select name="civil_status" class="form-select" required>
                                <option value="Single">Single</option>
                                <option value="Married">Married</option>
                                <option value="Widowed">Widowed</option>
                                <option value="Separated">Separated</option>
                            </select>
                        </div>
                    </div>

                    <div class="row g-3 mb-3">
                        <div class="col-md-6">
                            <label class="form-label fw-semibold">Purok / Zone</label>
                            <select name="purok_id" class="form-select" required>
                                <option value="">Select Purok</option>
                                ${(puroks || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label fw-semibold">Contact Number</label>
                            <input type="text" name="contact_number" class="form-control" placeholder="09123456789" required>
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="form-label fw-semibold">Complete Street Address</label>
                        <textarea name="address" class="form-control" rows="2" required></textarea>
                    </div>

                    <h6 class="fw-bold text-success border-bottom pb-2 mb-3">Socio-Economic Special Categories</h6>
                    <div class="row g-3 mb-4">
                        <div class="col-md-3">
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" name="is_voter" value="true" id="voter">
                                <label class="form-check-label" for="voter">Registered Voter</label>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" name="is_pwd" value="true" id="pwd">
                                <label class="form-check-label" for="pwd">PWD</label>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" name="is_solo_parent" value="true" id="solo">
                                <label class="form-check-label" for="solo">Solo Parent</label>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" name="is_4ps" value="true" id="4ps">
                                <label class="form-check-label" for="4ps">4Ps Beneficiary</label>
                            </div>
                        </div>
                    </div>

                    <div class="d-flex justify-content-between align-items-center">
                        <a href="/login" class="btn btn-outline-secondary">Back to Login</a>
                        <button type="submit" class="btn btn-success px-4 py-2 fw-bold">Submit Registration</button>
                    </div>
                </form>
            </div>
        </div>
    </div>`;

    res.send(renderFullPageUI('Resident Registration', html, null, settings));
});

app.post('/register', async (req, res) => {
    try {
        const {
            username, email, password, first_name, middle_name, last_name, suffix,
            date_of_birth, gender, civil_status, purok_id, contact_number, address,
            is_voter, is_pwd, is_solo_parent, is_4ps
        } = req.body;

        const hashedPassword = await bcrypt.hash(password, 10);

        // Create User
        const { data: user, error: userError } = await supabase.from('users').insert([{
            username,
            email,
            password: hashedPassword,
            role: 'RESIDENT'
        }]).select().single();

        if (userError) throw userError;

        // Auto calculate Senior Status based on DoB
        const dob = new Date(date_of_birth);
        const ageDifMs = Date.now() - dob.getTime();
        const ageDate = new Date(ageDifMs);
        const age = Math.abs(ageDate.getUTCFullYear() - 1970);
        const isSenior = age >= 60;

        // Create Resident Profile
        const { error: resError } = await supabase.from('residents').insert([{
            user_id: user.id,
            first_name,
            middle_name: middle_name || '',
            last_name,
            suffix: suffix || '',
            date_of_birth,
            gender,
            civil_status,
            purok_id: purok_id || null,
            contact_number,
            email,
            address,
            is_voter: is_voter === 'true',
            is_pwd: is_pwd === 'true',
            is_senior_citizen: isSenior,
            is_solo_parent: is_solo_parent === 'true',
            is_4ps: is_4ps === 'true',
            status: 'PENDING'
        }]);

        if (resError) throw resError;

        // Notify Admins/Staff
        await createNotification(null, 'ADMIN', 'New Resident Registration', `New resident registration received for ${first_name} ${last_name}. Requires approval.`, '/residents?status=PENDING');

        res.redirect('/login?success=Registration submitted successfully! Please wait for Barangay Staff approval.');
    } catch (e) {
        res.redirect('/register?error=' + encodeURIComponent(e.message));
    }
});

// ROUTE: CHANGE PASSWORD PAGE
app.get('/change-password', requireAuth(), async (req, res) => {
    const settings = await getBarangaySettings();
    const html = `
    <div class="container py-4" style="max-width: 500px;">
        <div class="card shadow border-0 rounded-4">
            <div class="card-header bg-warning text-dark fw-bold">Change Password Required</div>
            <div class="card-body p-4">
                <p>For security, you are required to change your default password before proceeding.</p>
                <form action="/change-password" method="POST">
                    <div class="mb-3">
                        <label class="form-label">New Password</label>
                        <input type="password" name="password" class="form-control" minlength="8" required>
                    </div>
                    <button type="submit" class="btn btn-warning w-100 fw-bold">Update Password</button>
                </form>
            </div>
        </div>
    </div>`;
    res.send(renderFullPageUI('Change Password', html, req.session.user, settings));
});

app.post('/change-password', requireAuth(), async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        await supabase.from('users').update({
            password: hashedPassword,
            must_change_password: false
        }).eq('id', req.session.user.id);

        res.redirect(req.session.user.role === 'RESIDENT' ? '/resident-dashboard' : '/dashboard');
    } catch (e) {
        res.redirect('/change-password?error=' + encodeURIComponent(e.message));
    }
});

// ==========================================
// STAFF & ADMIN PORTAL ROUTES
// ==========================================

// STAFF DASHBOARD
app.get('/dashboard', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    const settings = await getBarangaySettings();

    // Fetch Stats
    const { count: totalResidents } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE');
    const { count: totalHouseholds } = await supabase.from('households').select('*', { count: 'exact', head: true });
    const { count: pendingApprovals } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');
    const { count: pendingCertificates } = await supabase.from('certificate_requests').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');
    const { count: pendingAppointments } = await supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');
    const { count: pendingComplaints } = await supabase.from('blotter_records').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');

    const { count: maleCount } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').eq('gender', 'Male');
    const { count: femaleCount } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').eq('gender', 'Female');
    const { count: seniorCount } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').eq('is_senior_citizen', true);
    const { count: pwdCount } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').eq('is_pwd', true);
    const { count: soloCount } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').eq('is_solo_parent', true);
    const { count: voterCount } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').eq('is_voter', true);

    const { data: recentLogs } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(6);

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">Administrative Dashboard</h3>
            <p class="text-muted mb-0">Overview and key statistics for ${settings.name}</p>
        </div>
        <div>
            <a href="/residents?action=new" class="btn btn-success"><i class="bi bi-person-plus me-1"></i> Add Resident</a>
        </div>
    </div>

    <!-- PENDING APPROVAL WARNING BANNERS -->
    ${pendingApprovals > 0 ? `
    <div class="alert alert-warning alert-dismissIBLE fade show d-flex align-items-center justify-content-between shadow-sm" role="alert">
        <div>
            <i class="bi bi-exclamation-triangle-fill me-2 fs-5"></i>
            <strong>${pendingApprovals} Resident Registrations</strong> are pending staff review!
        </div>
        <a href="/residents?status=PENDING" class="btn btn-warning btn-sm fw-bold">Review Now</a>
    </div>
    ` : ''}

    <!-- PRIMARY METRIC CARDS -->
    <div class="row g-3 mb-4">
        <div class="col-md-3">
            <div class="card card-stat bg-green-grad p-3">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <div class="small text-white-50 fw-bold">TOTAL RESIDENTS</div>
                        <div class="fs-2 fw-bold">${totalResidents || 0}</div>
                    </div>
                    <i class="bi bi-people-fill fs-1 text-white-50"></i>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card card-stat bg-blue-grad p-3">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <div class="small text-white-50 fw-bold">HOUSEHOLDS</div>
                        <div class="fs-2 fw-bold">${totalHouseholds || 0}</div>
                    </div>
                    <i class="bi bi-house-door-fill fs-1 text-white-50"></i>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card card-stat bg-orange-grad p-3">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <div class="small text-white-50 fw-bold">PENDING REQUESTS</div>
                        <div class="fs-2 fw-bold">${pendingCertificates || 0}</div>
                    </div>
                    <i class="bi bi-file-earmark-hourglass-fill fs-1 text-white-50"></i>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card card-stat bg-purple-grad p-3">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <div class="small text-white-50 fw-bold">PENDING BLOTTERS</div>
                        <div class="fs-2 fw-bold">${pendingComplaints || 0}</div>
                    </div>
                    <i class="bi bi-shield-exclamation fs-1 text-white-50"></i>
                </div>
            </div>
        </div>
    </div>

    <!-- DEMOGRAPHIC SUMMARY GRID -->
    <div class="row g-3 mb-4">
        <div class="col-md-2">
            <div class="card text-center p-3 border-0 shadow-sm">
                <div class="text-muted small">Male</div>
                <div class="fs-4 fw-bold text-primary">${maleCount || 0}</div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card text-center p-3 border-0 shadow-sm">
                <div class="text-muted small">Female</div>
                <div class="fs-4 fw-bold text-danger">${femaleCount || 0}</div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card text-center p-3 border-0 shadow-sm">
                <div class="text-muted small">Seniors (60+)</div>
                <div class="fs-4 fw-bold text-success">${seniorCount || 0}</div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card text-center p-3 border-0 shadow-sm">
                <div class="text-muted small">PWD</div>
                <div class="fs-4 fw-bold text-info">${pwdCount || 0}</div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card text-center p-3 border-0 shadow-sm">
                <div class="text-muted small">Solo Parents</div>
                <div class="fs-4 fw-bold text-warning">${soloCount || 0}</div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card text-center p-3 border-0 shadow-sm">
                <div class="text-muted small">Voters</div>
                <div class="fs-4 fw-bold text-dark">${voterCount || 0}</div>
            </div>
        </div>
    </div>

    <!-- CHARTS & RECENT LOGS SECTION -->
    <div class="row g-4">
        <div class="col-md-7">
            <div class="card border-0 shadow-sm rounded-3">
                <div class="card-header bg-white fw-bold py-3">Demographics Overview</div>
                <div class="card-body">
                    <canvas id="demographicsChart" height="200"></canvas>
                </div>
            </div>
        </div>

        <div class="col-md-5">
            <div class="card border-0 shadow-sm rounded-3">
                <div class="card-header bg-white fw-bold py-3 d-flex justify-content-between align-items-center">
                    <span>Recent Activity Logs</span>
                    <a href="/activity-logs" class="btn btn-sm btn-link text-decoration-none">View All</a>
                </div>
                <div class="card-body p-0">
                    <ul class="list-group list-group-flush">
                        ${(recentLogs || []).map(log => `
                            <li class="list-group-item d-flex justify-content-between align-items-start">
                                <div>
                                    <strong class="d-block text-dark">${log.username}</strong>
                                    <small class="text-muted">${log.action}: ${log.details || ''}</small>
                                </div>
                                <small class="text-muted">${new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</small>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </div>
        </div>
    </div>

    <script>
        const ctx = document.getElementById('demographicsChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Male', 'Female', 'Seniors', 'PWD', 'Solo Parents', 'Voters'],
                datasets: [{
                    label: 'Resident Count',
                    data: [${maleCount || 0}, ${femaleCount || 0}, ${seniorCount || 0}, ${pwdCount || 0}, ${soloCount || 0}, ${voterCount || 0}],
                    backgroundColor: ['#0f4c81', '#e83e8c', '#198754', '#0dcaf0', '#ffc107', '#212529']
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } }
            }
        });
    </script>
    `;

    res.send(renderFullPageUI('Dashboard', html, req.session.user, settings, 'dashboard'));
});

// RESIDENT MANAGEMENT (LIST, SEARCH, FILTER, APPROVE, ARCHIVE)
app.get('/residents', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    const settings = await getBarangaySettings();
    const statusFilter = req.query.status || 'ACTIVE';
    const searchQuery = req.query.search || '';
    const purokFilter = req.query.purok || '';

    let query = supabase.from('residents').select('*, puroks(name)').order('created_at', { ascending: false });

    if (statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
    }
    if (purokFilter) {
        query = query.eq('purok_id', purokFilter);
    }
    if (searchQuery) {
        query = query.or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,resident_number.ilike.%${searchQuery}%`);
    }

    const { data: residents } = await query;
    const { data: puroks } = await supabase.from('puroks').select('*');

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">Resident Management</h3>
            <p class="text-muted mb-0">View, search, filter, approve, and manage barangay residents</p>
        </div>
        <div class="d-flex gap-2">
            <a href="/residents/print-batch" class="btn btn-outline-primary"><i class="bi bi-printer me-1"></i> Print Batch IDs (8 Grid)</a>
            <a href="/residents/new" class="btn btn-success"><i class="bi bi-person-plus me-1"></i> Add Resident Record</a>
        </div>
    </div>

    <!-- FILTER & SEARCH BAR -->
    <div class="card border-0 shadow-sm mb-4">
        <div class="card-body">
            <form action="/residents" method="GET" class="row g-3">
                <div class="col-md-4">
                    <input type="text" name="search" class="form-control" placeholder="Search by name or Resident ID..." value="${searchQuery}">
                </div>
                <div class="col-md-3">
                    <select name="status" class="form-select" onchange="this.form.submit()">
                        <option value="ACTIVE" ${statusFilter === 'ACTIVE' ? 'selected' : ''}>Active Residents</option>
                        <option value="PENDING" ${statusFilter === 'PENDING' ? 'selected' : ''}>Pending Approvals</option>
                        <option value="REJECTED" ${statusFilter === 'REJECTED' ? 'selected' : ''}>Rejected Registrations</option>
                        <option value="ARCHIVED" ${statusFilter === 'ARCHIVED' ? 'selected' : ''}>Archived Residents</option>
                        <option value="ALL" ${statusFilter === 'ALL' ? 'selected' : ''}>All Statuses</option>
                    </select>
                </div>
                <div class="col-md-3">
                    <select name="purok" class="form-select" onchange="this.form.submit()">
                        <option value="">All Puroks</option>
                        ${(puroks || []).map(p => `<option value="${p.id}" ${purokFilter === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-2">
                    <button type="submit" class="btn btn-primary w-100"><i class="bi bi-search"></i> Search</button>
                </div>
            </form>
        </div>
    </div>

    <!-- RESIDENTS TABLE -->
    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>Resident ID</th>
                            <th>Full Name</th>
                            <th>Gender / Age</th>
                            <th>Purok</th>
                            <th>Contact</th>
                            <th>Status</th>
                            <th class="text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(!residents || residents.length === 0) ? `
                            <tr><td colspan="7" class="text-center py-4 text-muted">No resident records found.</td></tr>
                        ` : residents.map(r => {
                            const age = r.date_of_birth ? Math.floor((new Date() - new Date(r.date_of_birth)) / 31557600000) : 'N/A';
                            return `
                            <tr>
                                <td><span class="fw-bold text-success">${r.resident_number || 'UNASSIGNED'}</span></td>
                                <td>
                                    <div class="fw-bold">${r.first_name} ${r.middle_name || ''} ${r.last_name} ${r.suffix || ''}</div>
                                    <small class="text-muted">${r.email}</small>
                                </td>
                                <td>${r.gender} (${age} yrs)</td>
                                <td>${r.puroks?.name || 'N/A'}</td>
                                <td>${r.contact_number}</td>
                                <td><span class="badge badge-status-${r.status}">${r.status}</span></td>
                                <td class="text-end">
                                    ${r.status === 'PENDING' ? `
                                        <button class="btn btn-sm btn-success me-1" onclick="approveResident('${r.id}')"><i class="bi bi-check-lg"></i> Approve</button>
                                        <button class="btn btn-sm btn-danger me-1" onclick="rejectResident('${r.id}')"><i class="bi bi-x-lg"></i> Reject</button>
                                    ` : ''}
                                    <a href="/residents/view/${r.id}" class="btn btn-sm btn-outline-info me-1"><i class="bi bi-eye"></i></a>
                                    <a href="/residents/edit/${r.id}" class="btn btn-sm btn-outline-primary me-1"><i class="bi bi-pencil"></i></a>
                                    ${r.status === 'ACTIVE' ? `
                                        <button class="btn btn-sm btn-outline-secondary" onclick="archiveResident('${r.id}')"><i class="bi bi-archive"></i> Archive</button>
                                    ` : ''}
                                    ${r.status === 'ARCHIVED' ? `
                                        <button class="btn btn-sm btn-outline-success" onclick="restoreResident('${r.id}')"><i class="bi bi-arrow-counterclockwise"></i> Restore</button>
                                    ` : ''}
                                </td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- REJECTION MODAL -->
    <div class="modal fade" id="rejectModal" tabindex="-1">
        <div class="modal-dialog">
            <form action="/residents/reject" method="POST" class="modal-content">
                <input type="hidden" name="resident_id" id="reject_resident_id">
                <div class="modal-header bg-danger text-white">
                    <h5 class="modal-title">Reject Resident Registration</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <label class="form-label fw-bold">Reason for Rejection</label>
                    <textarea name="rejection_reason" class="form-control" rows="3" required placeholder="State clear reasons..."></textarea>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-danger">Confirm Rejection</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        function approveResident(id) {
            if (confirm('Are you sure you want to approve this resident registration? An official Resident ID will be generated.')) {
                window.location.href = '/residents/approve/' + id;
            }
        }

        function rejectResident(id) {
            document.getElementById('reject_resident_id').value = id;
            new bootstrap.Modal(document.getElementById('rejectModal')).show();
        }

        function archiveResident(id) {
            if (confirm('Are you sure you want to archive this resident record?')) {
                window.location.href = '/residents/archive/' + id;
            }
        }

        function restoreResident(id) {
            if (confirm('Are you sure you want to restore this resident to Active status?')) {
                window.location.href = '/residents/restore/' + id;
            }
        }
    </script>
    `;

    res.send(renderFullPageUI('Resident Management', html, req.session.user, settings, 'residents'));
});

// APPROVE RESIDENT
app.get('/residents/approve/:id', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    try {
        const id = req.params.id;
        // Generate unique Resident Number (e.g. BRGY-2026-XXXX)
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const residentNumber = `BRGY-2026-${randomNum}`;

        const { data: resData } = await supabase.from('residents').select('*').eq('id', id).single();

        await supabase.from('residents').update({
            status: 'ACTIVE',
            resident_number: residentNumber
        }).eq('id', id);

        if (resData && resData.user_id) {
            await createNotification(resData.user_id, null, 'Registration Approved!', `Your Barangay registration has been approved. Your Resident ID is ${residentNumber}.`);
        }

        await logActivity(req.session.user.id, req.session.user.username, 'APPROVE_RESIDENT', `Approved resident ID: ${id} (${residentNumber})`, req);

        res.redirect('/residents?success=Resident registration approved successfully.');
    } catch (e) {
        res.redirect('/residents?error=' + encodeURIComponent(e.message));
    }
});

// REJECT RESIDENT
app.post('/residents/reject', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    try {
        const { resident_id, rejection_reason } = req.body;

        const { data: resData } = await supabase.from('residents').select('*').eq('id', resident_id).single();

        await supabase.from('residents').update({
            status: 'REJECTED',
            rejection_reason: rejection_reason
        }).eq('id', resident_id);

        if (resData && resData.user_id) {
            await createNotification(resData.user_id, null, 'Registration Rejected', `Your registration was rejected. Reason: ${rejection_reason}`);
        }

        await logActivity(req.session.user.id, req.session.user.username, 'REJECT_RESIDENT', `Rejected resident ID: ${resident_id}`, req);

        res.redirect('/residents?success=Resident registration rejected.');
    } catch (e) {
        res.redirect('/residents?error=' + encodeURIComponent(e.message));
    }
});

// ARCHIVE / RESTORE RESIDENT
app.get('/residents/archive/:id', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    await supabase.from('residents').update({ status: 'ARCHIVED' }).eq('id', req.params.id);
    await logActivity(req.session.user.id, req.session.user.username, 'ARCHIVE_RESIDENT', `Archived resident ID: ${req.params.id}`, req);
    res.redirect('/residents?success=Resident archived.');
});

app.get('/residents/restore/:id', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    await supabase.from('residents').update({ status: 'ACTIVE' }).eq('id', req.params.id);
    await logActivity(req.session.user.id, req.session.user.username, 'RESTORE_RESIDENT', `Restored resident ID: ${req.params.id}`, req);
    res.redirect('/residents?success=Resident restored.');
});

// VIEW SINGLE RESIDENT & DIGITAL ID PREVIEW
app.get('/residents/view/:id', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('id', req.params.id).single();

    if (!resident) return res.redirect('/residents?error=Resident not found.');

    // Generate QR Code Data URL for ID Token
    const verifyUrl = `${req.protocol}://${req.get('host')}/verify/${resident.resident_number}/${resident.qr_token}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl);

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">Resident Profile & Digital ID</h3>
            <p class="text-muted mb-0">Detailed records for ${resident.first_name} ${resident.last_name}</p>
        </div>
        <div>
            <a href="/residents" class="btn btn-outline-secondary me-2"><i class="bi bi-arrow-left"></i> Back</a>
            <button class="btn btn-primary" onclick="window.print()"><i class="bi bi-printer"></i> Print ID Card</button>
        </div>
    </div>

    <div class="row g-4">
        <!-- DIGITAL ID CARD PREVIEW DISPLAY -->
        <div class="col-md-5">
            <div class="card border-0 shadow-sm p-3">
                <h6 class="fw-bold text-center text-success mb-3">DIGITAL BARANGAY RESIDENT ID</h6>

                <div class="print-area d-flex justify-content-center">
                    <div class="id-card-preview id-card-item">
                        <!-- HEADER -->
                        <div class="d-flex align-items-center gap-2 border-bottom pb-1" style="border-color: #0d5c3a !important;">
                            <img src="${settings.logo_url || 'https://via.placeholder.com/150/0d5c3a/FFFFFF?text=BRGY'}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
                            <div style="line-height:1.1;">
                                <div style="font-size: 8px; font-weight:700; color:#0d5c3a;">${settings.id_header || 'REPUBLIC OF THE PHILIPPINES'}</div>
                                <div style="font-size: 10px; font-weight:800; color:#0f4c81;">${settings.name}</div>
                                <div style="font-size: 7px; color:#555;">${settings.municipality}, ${settings.province}</div>
                            </div>
                        </div>

                        <!-- BODY -->
                        <div class="d-flex gap-2 my-1 align-items-center">
                            <img src="${resident.photo_url || 'https://via.placeholder.com/100x100/cccccc/ffffff?text=PHOTO'}" style="width:65px; height:65px; border-radius:6px; object-fit:cover; border:1px solid #0d5c3a;">
                            <div style="font-size:8px; line-height:1.3; flex-grow:1;">
                                <div style="font-size: 7px; color:#666;">RESIDENT ID NUMBER</div>
                                <div style="font-weight:800; font-size:10px; color:#0d5c3a;">${resident.resident_number || 'PENDING'}</div>
                                <div style="font-weight:700; font-size:9px;" class="mt-1">${resident.first_name} ${resident.middle_name ? resident.middle_name[0] + '.' : ''} ${resident.last_name}</div>
                                <div><strong>DOB:</strong> ${resident.date_of_birth} | <strong>Gender:</strong> ${resident.gender}</div>
                                <div><strong>Purok:</strong> ${resident.puroks?.name || 'N/A'}</div>
                            </div>
                            <img src="${qrDataUrl}" style="width:55px; height:55px;">
                        </div>

                        <!-- FOOTER -->
                        <div class="text-center pt-1 border-top" style="font-size:6px; color:#666; border-color: #0d5c3a !important;">
                            ${settings.id_footer || 'OFFICIAL BARANGAY IDENTIFICATION CARD'}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- FULL DETAILS PANEL -->
        <div class="col-md-7">
            <div class="card border-0 shadow-sm p-4">
                <h5 class="fw-bold text-success mb-3 border-bottom pb-2">Full Resident Profile</h5>
                <div class="row g-3">
                    <div class="col-md-6"><strong>Full Name:</strong> ${resident.first_name} ${resident.middle_name} ${resident.last_name} ${resident.suffix}</div>
                    <div class="col-md-6"><strong>Status:</strong> <span class="badge badge-status-${resident.status}">${resident.status}</span></div>
                    <div class="col-md-6"><strong>Civil Status:</strong> ${resident.civil_status}</div>
                    <div class="col-md-6"><strong>Contact:</strong> ${resident.contact_number}</div>
                    <div class="col-md-6"><strong>Email:</strong> ${resident.email}</div>
                    <div class="col-md-6"><strong>Address:</strong> ${resident.address}</div>
                    <div class="col-md-6"><strong>Voter Status:</strong> ${resident.is_voter ? 'Yes' : 'No'}</div>
                    <div class="col-md-6"><strong>Senior Citizen:</strong> ${resident.is_senior_citizen ? 'Yes' : 'No'}</div>
                    <div class="col-md-6"><strong>PWD:</strong> ${resident.is_pwd ? 'Yes' : 'No'}</div>
                    <div class="col-md-6"><strong>Solo Parent:</strong> ${resident.is_solo_parent ? 'Yes' : 'No'}</div>
                    <div class="col-md-6"><strong>4Ps Beneficiary:</strong> ${resident.is_4ps ? 'Yes' : 'No'}</div>
                </div>
            </div>
        </div>
    </div>`;

    res.send(renderFullPageUI('View Resident', html, req.session.user, settings, 'residents'));
});

// BATCH 8-ID PRINT PAGE FOR LETTER BOND PAPER
app.get('/residents/print-batch', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: residents } = await supabase.from('residents').select('*, puroks(name)').eq('status', 'ACTIVE').limit(8);

    const qrPromises = (residents || []).map(r => {
        const verifyUrl = `${req.protocol}://${req.get('host')}/verify/${r.resident_number}/${r.qr_token}`;
        return QRCode.toDataURL(verifyUrl);
    });

    const qrCodes = await Promise.all(qrPromises);

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4 no-print">
        <div>
            <h3 class="fw-bold text-success mb-1">Batch Print Resident Cards (8 Cards / Page)</h3>
            <p class="text-muted mb-0">Fits perfectly on Standard Letter / Bond Paper Page Layout</p>
        </div>
        <button class="btn btn-success fw-bold" onclick="window.print()"><i class="bi bi-printer-fill me-1"></i> PRINT NOW</button>
    </div>

    <div class="print-area">
        <div class="id-card-grid d-flex flex-wrap gap-3 justify-content-center">
            ${(residents || []).map((r, idx) => `
                <div class="id-card-preview id-card-item">
                    <div class="d-flex align-items-center gap-2 border-bottom pb-1" style="border-color: #0d5c3a !important;">
                        <img src="${settings.logo_url || 'https://via.placeholder.com/150/0d5c3a/FFFFFF?text=BRGY'}" style="width:34px; height:34px; border-radius:50%; object-fit:cover;">
                        <div style="line-height:1.1;">
                            <div style="font-size: 7px; font-weight:700; color:#0d5c3a;">${settings.id_header || 'REPUBLIC OF THE PHILIPPINES'}</div>
                            <div style="font-size: 9px; font-weight:800; color:#0f4c81;">${settings.name}</div>
                            <div style="font-size: 6.5px; color:#555;">${settings.municipality}, ${settings.province}</div>
                        </div>
                    </div>
                    <div class="d-flex gap-2 my-1 align-items-center">
                        <img src="${r.photo_url || 'https://via.placeholder.com/100x100/cccccc/ffffff?text=PHOTO'}" style="width:60px; height:60px; border-radius:5px; object-fit:cover; border:1px solid #0d5c3a;">
                        <div style="font-size:7.5px; line-height:1.2; flex-grow:1;">
                            <div style="font-size: 6.5px; color:#666;">RESIDENT ID</div>
                            <div style="font-weight:800; font-size:9px; color:#0d5c3a;">${r.resident_number}</div>
                            <div style="font-weight:700; font-size:8.5px;" class="mt-1">${r.first_name} ${r.last_name}</div>
                            <div>DOB: ${r.date_of_birth}</div>
                            <div>Purok: ${r.puroks?.name || 'N/A'}</div>
                        </div>
                        <img src="${qrCodes[idx]}" style="width:50px; height:50px;">
                    </div>
                    <div class="text-center pt-1 border-top" style="font-size:5.5px; color:#666; border-color: #0d5c3a !important;">
                        ${settings.id_footer || 'BARANGAY IDENTIFICATION CARD'}
                    </div>
                </div>
            `).join('')}
        </div>
    </div>`;

    res.send(renderFullPageUI('Print Batch IDs', html, req.session.user, settings, 'residents'));
});

// CERTIFICATE REQUEST PROCESSING SYSTEM & UPLOAD
app.get('/certificate-requests', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: requests } = await supabase.from('certificate_requests')
        .select('*, residents(first_name, last_name, resident_number)')
        .order('created_at', { ascending: false });

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">Certificate Requests & Issuance</h3>
            <p class="text-muted mb-0">Review requests, issue official documents, and manage status</p>
        </div>
    </div>

    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>Req #</th>
                            <th>Resident</th>
                            <th>Certificate Type</th>
                            <th>Purpose</th>
                            <th>Date Requested</th>
                            <th>Status</th>
                            <th class="text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(!requests || requests.length === 0) ? `
                            <tr><td colspan="7" class="text-center py-4 text-muted">No certificate requests found.</td></tr>
                        ` : requests.map(reqItem => `
                            <tr>
                                <td><strong>${reqItem.request_number}</strong></td>
                                <td>${reqItem.residents?.first_name} ${reqItem.residents?.last_name} <br><small class="text-muted">${reqItem.residents?.resident_number}</small></td>
                                <td><span class="fw-semibold text-primary">${reqItem.certificate_type}</span></td>
                                <td>${reqItem.purpose}</td>
                                <td>${new Date(reqItem.created_at).toLocaleDateString()}</td>
                                <td><span class="badge badge-status-${reqItem.status}">${reqItem.status}</span></td>
                                <td class="text-end">
                                    <button class="btn btn-sm btn-outline-primary" onclick="manageRequest('${reqItem.id}', '${reqItem.status}', '${reqItem.issued_document_url || ''}')"><i class="bi bi-gear"></i> Process</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- PROCESS CERTIFICATE MODAL -->
    <div class="modal fade" id="processModal" tabindex="-1">
        <div class="modal-dialog">
            <form action="/certificate-requests/update" method="POST" enctype="multipart/form-data" class="modal-content">
                <input type="hidden" name="request_id" id="proc_req_id">
                <div class="modal-header bg-success text-white">
                    <h5 class="modal-title">Process Certificate Request</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label fw-bold">Update Status</label>
                        <select name="status" id="proc_status" class="form-select" required>
                            <option value="PENDING">PENDING</option>
                            <option value="APPROVED">APPROVED</option>
                            <option value="READY_FOR_CLAIM">READY FOR CLAIM</option>
                            <option value="RELEASED">RELEASED</option>
                            <option value="REJECTED">REJECTED</option>
                        </select>
                    </div>

                    <div class="mb-3">
                        <label class="form-label fw-bold">Upload Official Issued Certificate File (PDF / Image)</label>
                        <input type="file" name="document" class="form-control" accept=".pdf,image/*">
                        <small class="text-muted">Staff uploads the signed certificate file for the resident.</small>
                    </div>

                    <div class="mb-3">
                        <label class="form-label fw-bold">Staff Remarks / Rejection Reason</label>
                        <textarea name="staff_remarks" class="form-control" rows="2"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-success">Save Changes</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        function manageRequest(id, status, docUrl) {
            document.getElementById('proc_req_id').value = id;
            document.getElementById('proc_status').value = status;
            new bootstrap.Modal(document.getElementById('processModal')).show();
        }
    </script>`;

    res.send(renderFullPageUI('Certificate Requests', html, req.session.user, settings, 'requests'));
});

// CERTIFICATE STATUS UPDATE & FILE UPLOAD HANDLER
app.post('/certificate-requests/update', requireAuth(['ADMIN', 'STAFF']), upload.single('document'), async (req, res) => {
    try {
        const { request_id, status, staff_remarks } = req.body;
        let fileUrl = '';

        if (req.file) {
            const fileName = `certificates/${Date.now()}_${req.file.originalname}`;
            const { data, error } = await supabase.storage.from('brms-docs').upload(fileName, req.file.buffer, {
                contentType: req.file.mimetype
            });

            if (!error) {
                const { data: publicUrlData } = supabase.storage.from('brms-docs').getPublicUrl(fileName);
                fileUrl = publicUrlData.publicUrl;
            }
        }

        const updateData = { status, staff_remarks };
        if (fileUrl) updateData.issued_document_url = fileUrl;
        if (status === 'RELEASED') updateData.release_date = new Date();

        const { data: reqData } = await supabase.from('certificate_requests').select('*, residents(user_id)').eq('id', request_id).single();

        await supabase.from('certificate_requests').update(updateData).eq('id', request_id);

        if (reqData && reqData.residents?.user_id) {
            await createNotification(reqData.residents.user_id, null, 'Certificate Update', `Your certificate request status updated to: ${status}`);
        }

        await logActivity(req.session.user.id, req.session.user.username, 'UPDATE_CERTIFICATE_REQUEST', `Updated request ID: ${request_id} to ${status}`, req);

        res.redirect('/certificate-requests?success=Certificate request updated.');
    } catch (e) {
        res.redirect('/certificate-requests?error=' + encodeURIComponent(e.message));
    }
});

// QR SCANNER / CERTIFICATE CLAIM SCANNER INTERFACE
app.get('/qr-scanner', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    const settings = await getBarangaySettings();

    const html = `
    <div class="row justify-content-center">
        <div class="col-md-8">
            <div class="card border-0 shadow-sm rounded-4">
                <div class="card-header bg-success text-white text-center py-3">
                    <h4 class="fw-bold mb-0"><i class="bi bi-qr-code-scan me-2"></i>Barangay QR ID & Certificate Claim Scanner</h4>
                </div>
                <div class="card-body p-4 text-center">
                    <div id="qr-reader" style="width: 100%; max-width: 450px; margin: 0 auto;" class="border rounded-3 p-2"></div>

                    <hr class="my-4">

                    <h6 class="fw-bold mb-3">Or Enter Resident QR Token / Verification Code Manually</h6>
                    <form action="/qr-scanner/verify" method="POST" class="row g-2 justify-content-center">
                        <div class="col-md-7">
                            <input type="text" name="qr_token" class="form-control" placeholder="Enter QR token or Resident ID..." required>
                        </div>
                        <div class="col-md-3">
                            <button type="submit" class="btn btn-primary w-100">Verify Code</button>
                        </div>
                    </form>

                    <div id="scan-result" class="mt-4"></div>
                </div>
            </div>
        </div>
    </div>

    <script>
        function onScanSuccess(decodedText, decodedResult) {
            window.location.href = decodedText;
        }

        let html5QrcodeScanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: 250 });
        html5QrcodeScanner.render(onScanSuccess);
    </script>`;

    res.send(renderFullPageUI('QR Claim Scanner', html, req.session.user, settings, 'qr'));
});

// QR SCAN VERIFICATION POST ACTION
app.post('/qr-scanner/verify', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    const { qr_token } = req.body;
    const { data: resident } = await supabase.from('residents').select('*').or(`qr_token.eq.${qr_token},resident_number.eq.${qr_token}`).single();

    if (!resident) {
        return res.redirect('/qr-scanner?error=INVALID or UNKNOWN QR Code.');
    }

    res.redirect(`/verify/${resident.resident_number}/${resident.qr_token}`);
});

// PUBLIC OR STAFF QR VERIFICATION ENDPOINT
app.get('/verify/:residentId/:token', async (req, res) => {
    const settings = await getBarangaySettings();
    const { residentId, token } = req.params;

    const { data: resident } = await supabase.from('residents')
        .select('*, puroks(name)')
        .eq('resident_number', residentId)
        .eq('qr_token', token)
        .single();

    if (!resident) {
        const errorHtml = `
        <div class="container py-5 text-center">
            <div class="alert alert-danger py-4 shadow-sm">
                <i class="bi bi-x-circle-fill fs-1"></i>
                <h3 class="fw-bold mt-2">INVALID / UNAUTHORIZED QR CODE</h3>
                <p class="mb-0">The scanned Barangay ID verification token is invalid or revoked.</p>
            </div>
        </div>`;
        return res.send(renderFullPageUI('Verification Failed', errorHtml, req.session.user, settings));
    }

    // Check for pending claimable documents
    const { data: pendingClaims } = await supabase.from('certificate_requests')
        .select('*')
        .eq('resident_id', resident.id)
        .eq('status', 'READY_FOR_CLAIM');

    const html = `
    <div class="container py-4" style="max-width: 650px;">
        <div class="card border-0 shadow-lg rounded-4 overflow-hidden">
            <div class="card-header bg-success text-white text-center py-3">
                <i class="bi bi-patch-check-fill fs-1"></i>
                <h3 class="fw-bold mb-0">OFFICIAL BARANGAY ID VERIFIED</h3>
                <p class="mb-0 small text-white-50">${settings.name}</p>
            </div>
            <div class="card-body p-4">
                <div class="d-flex align-items-center gap-3 mb-4 pb-3 border-bottom">
                    <img src="${resident.photo_url || 'https://via.placeholder.com/100x100?text=PHOTO'}" class="rounded-3" style="width: 80px; height: 80px; object-fit: cover;">
                    <div>
                        <h4 class="fw-bold mb-1">${resident.first_name} ${resident.last_name}</h4>
                        <p class="mb-0 text-muted"><strong>Resident ID:</strong> ${resident.resident_number}</p>
                        <p class="mb-0 text-muted"><strong>Purok:</strong> ${resident.puroks?.name || 'N/A'}</p>
                    </div>
                </div>

                <div class="row g-2 mb-4">
                    <div class="col-6"><strong>Verification Status:</strong> <span class="badge bg-success">ACTIVE & VALID</span></div>
                    <div class="col-6"><strong>Voter Status:</strong> ${resident.is_voter ? 'Registered' : 'No'}</div>
                </div>

                <h5 class="fw-bold text-success border-bottom pb-2 mb-3">Pending Document Claims</h5>
                ${(!pendingClaims || pendingClaims.length === 0) ? `
                    <div class="alert alert-light text-center">No certificates ready for claim at this moment.</div>
                ` : pendingClaims.map(c => `
                    <div class="card border-primary mb-2">
                        <div class="card-body d-flex justify-content-between align-items-center p-3">
                            <div>
                                <strong class="text-primary">${c.certificate_type}</strong>
                                <div class="small text-muted">Req #: ${c.request_number}</div>
                            </div>
                            ${req.session.user && (req.session.user.role === 'ADMIN' || req.session.user.role === 'STAFF') ? `
                                <a href="/certificate-requests/release-direct/${c.id}" class="btn btn-sm btn-success fw-bold"><i class="bi bi-box-arrow-up-right me-1"></i> MARK AS RELEASED</a>
                            ` : `
                                <span class="badge bg-info">READY FOR CLAIM</span>
                            `}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>`;

    res.send(renderFullPageUI('ID Verification Result', html, req.session.user, settings));
});

// DIRECT QUICK RELEASE FROM QR CLAIM SCANNER
app.get('/certificate-requests/release-direct/:id', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    await supabase.from('certificate_requests').update({
        status: 'RELEASED',
        release_date: new Date()
    }).eq('id', req.params.id);

    await logActivity(req.session.user.id, req.session.user.username, 'RELEASE_CERTIFICATE', `Released certificate request ID: ${req.params.id}`, req);
    res.redirect('/certificate-requests?success=Certificate marked as RELEASED successfully.');
});

// HOUSEHOLD MANAGEMENT
app.get('/households', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: households } = await supabase.from('households').select('*, puroks(name), residents!fk_household_head(first_name, last_name)');
    const { data: puroks } = await supabase.from('puroks').select('*');

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">Household Management</h3>
            <p class="text-muted mb-0">Organize household records and heads of families</p>
        </div>
        <button class="btn btn-success" data-bs-toggle="modal" data-bs-target="#addHouseholdModal"><i class="bi bi-plus-lg me-1"></i> Add Household</button>
    </div>

    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>Household #</th>
                            <th>Head of Household</th>
                            <th>Purok</th>
                            <th>Address</th>
                            <th>Date Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(!households || households.length === 0) ? `
                            <tr><td colspan="5" class="text-center py-4 text-muted">No household records found.</td></tr>
                        ` : households.map(h => `
                            <tr>
                                <td><strong class="text-primary">${h.household_number}</strong></td>
                                <td>${h.residents ? h.residents.first_name + ' ' + h.residents.last_name : 'Unassigned'}</td>
                                <td>${h.puroks?.name || 'N/A'}</td>
                                <td>${h.address}</td>
                                <td>${new Date(h.created_at).toLocaleDateString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- ADD HOUSEHOLD MODAL -->
    <div class="modal fade" id="addHouseholdModal" tabindex="-1">
        <div class="modal-dialog">
            <form action="/households/add" method="POST" class="modal-content">
                <div class="modal-header bg-success text-white">
                    <h5 class="modal-title">Add Household Record</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label fw-bold">Household Number</label>
                        <input type="text" name="household_number" class="form-control" placeholder="HH-2026-001" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Purok</label>
                        <select name="purok_id" class="form-select" required>
                            ${(puroks || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Street Address</label>
                        <textarea name="address" class="form-control" rows="2" required></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-success">Save Household</button>
                </div>
            </form>
        </div>
    </div>`;

    res.send(renderFullPageUI('Household Management', html, req.session.user, settings, 'households'));
});

app.post('/households/add', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    try {
        const { household_number, purok_id, address } = req.body;
        await supabase.from('households').insert([{ household_number, purok_id, address }]);
        res.redirect('/households?success=Household created.');
    } catch (e) {
        res.redirect('/households?error=' + encodeURIComponent(e.message));
    }
});

// PUROK MANAGEMENT
app.get('/puroks', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: puroks } = await supabase.from('puroks').select('*').order('name');

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">Purok / Zone Management</h3>
            <p class="text-muted mb-0">Configure territorial zones in the barangay</p>
        </div>
        <button class="btn btn-success" data-bs-toggle="modal" data-bs-target="#addPurokModal"><i class="bi bi-plus-lg me-1"></i> Add New Purok</button>
    </div>

    <div class="row g-3">
        ${(puroks || []).map(p => `
            <div class="col-md-4">
                <div class="card border-0 shadow-sm rounded-3">
                    <div class="card-body">
                        <h5 class="fw-bold text-success mb-1"><i class="bi bi-geo-alt-fill me-2"></i>${p.name}</h5>
                        <p class="text-muted small mb-0">${p.description || 'No description provided.'}</p>
                    </div>
                </div>
            </div>
        `).join('')}
    </div>

    <!-- ADD PUROK MODAL -->
    <div class="modal fade" id="addPurokModal" tabindex="-1">
        <div class="modal-dialog">
            <form action="/puroks/add" method="POST" class="modal-content">
                <div class="modal-header bg-success text-white">
                    <h5 class="modal-title">Add New Purok</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label fw-bold">Purok Name</label>
                        <input type="text" name="name" class="form-control" placeholder="Purok 5 - Sampaguita" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Description</label>
                        <textarea name="description" class="form-control" rows="2"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-success">Save Purok</button>
                </div>
            </form>
        </div>
    </div>`;

    res.send(renderFullPageUI('Purok Management', html, req.session.user, settings, 'puroks'));
});

app.post('/puroks/add', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    try {
        await supabase.from('puroks').insert([{ name: req.body.name, description: req.body.description }]);
        res.redirect('/puroks?success=Purok added.');
    } catch (e) {
        res.redirect('/puroks?error=' + encodeURIComponent(e.message));
    }
});

// BLOTTER & COMPLAINTS MANAGEMENT
app.get('/blotter', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: blotters } = await supabase.from('blotter_records').select('*').order('created_at', { ascending: false });

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">Blotter & Complaint Records</h3>
            <p class="text-muted mb-0">Record incident reports and peace and order disputes</p>
        </div>
        <button class="btn btn-danger" data-bs-toggle="modal" data-bs-target="#addBlotterModal"><i class="bi bi-plus-lg me-1"></i> File New Blotter</button>
    </div>

    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>Case #</th>
                            <th>Complainant</th>
                            <th>Respondent</th>
                            <th>Incident Date</th>
                            <th>Status</th>
                            <th class="text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(!blotters || blotters.length === 0) ? `
                            <tr><td colspan="6" class="text-center py-4 text-muted">No blotter/complaint records found.</td></tr>
                        ` : blotters.map(b => `
                            <tr>
                                <td><strong class="text-danger">${b.case_number}</strong></td>
                                <td>${b.complainant_name}</td>
                                <td>${b.respondent_name}</td>
                                <td>${b.incident_date}</td>
                                <td><span class="badge badge-status-${b.status}">${b.status}</span></td>
                                <td class="text-end">
                                    <button class="btn btn-sm btn-outline-primary" onclick="updateBlotter('${b.id}', '${b.status}')"><i class="bi bi-pencil"></i> Update</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- ADD BLOTTER MODAL -->
    <div class="modal fade" id="addBlotterModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
            <form action="/blotter/add" method="POST" class="modal-content">
                <div class="modal-header bg-danger text-white">
                    <h5 class="modal-title">File New Blotter Report</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="row g-3 mb-3">
                        <div class="col-md-6">
                            <label class="form-label fw-bold">Complainant Name</label>
                            <input type="text" name="complainant_name" class="form-control" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label fw-bold">Respondent Name</label>
                            <input type="text" name="respondent_name" class="form-control" required>
                        </div>
                    </div>
                    <div class="row g-3 mb-3">
                        <div class="col-md-6">
                            <label class="form-label fw-bold">Incident Date</label>
                            <input type="date" name="incident_date" class="form-control" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label fw-bold">Incident Location</label>
                            <input type="text" name="incident_location" class="form-control" required>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Detailed Incident Description</label>
                        <textarea name="description" class="form-control" rows="3" required></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-danger">File Blotter Case</button>
                </div>
            </form>
        </div>
    </div>`;

    res.send(renderFullPageUI('Blotter Records', html, req.session.user, settings, 'blotter'));
});

app.post('/blotter/add', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    try {
        const { complainant_name, respondent_name, incident_date, incident_location, description } = req.body;
        const caseNumber = `CASE-2026-${Math.floor(1000 + Math.random() * 9000)}`;

        await supabase.from('blotter_records').insert([{
            case_number: caseNumber,
            complainant_name,
            respondent_name,
            incident_date,
            incident_location,
            description,
            status: 'PENDING'
        }]);

        res.redirect('/blotter?success=Blotter case created.');
    } catch (e) {
        res.redirect('/blotter?error=' + encodeURIComponent(e.message));
    }
});

// APPOINTMENT MANAGEMENT
app.get('/appointments', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: appointments } = await supabase.from('appointments').select('*, residents(first_name, last_name)').order('appointment_date');

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">Barangay Appointment Schedule</h3>
            <p class="text-muted mb-0">Manage resident consultation and service appointments</p>
        </div>
    </div>

    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>Appt #</th>
                            <th>Resident</th>
                            <th>Service Requested</th>
                            <th>Date & Time</th>
                            <th>Status</th>
                            <th class="text-end">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(!appointments || appointments.length === 0) ? `
                            <tr><td colspan="6" class="text-center py-4 text-muted">No appointments found.</td></tr>
                        ` : appointments.map(a => `
                            <tr>
                                <td><strong>${a.appointment_number}</strong></td>
                                <td>${a.residents?.first_name} ${a.residents?.last_name}</td>
                                <td>${a.service}</td>
                                <td>${a.appointment_date} at ${a.appointment_time}</td>
                                <td><span class="badge badge-status-${a.status}">${a.status}</span></td>
                                <td class="text-end">
                                    <a href="/appointments/status/${a.id}/APPROVED" class="btn btn-sm btn-success me-1">Approve</a>
                                    <a href="/appointments/status/${a.id}/REJECTED" class="btn btn-sm btn-danger">Reject</a>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;

    res.send(renderFullPageUI('Appointments', html, req.session.user, settings, 'appointments'));
});

app.get('/appointments/status/:id/:status', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    await supabase.from('appointments').update({ status: req.params.status }).eq('id', req.params.id);
    res.redirect('/appointments?success=Appointment status updated.');
});

// ASSISTANCE REQUEST MANAGEMENT
app.get('/assistance', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: assistance } = await supabase.from('assistance_requests').select('*, residents(first_name, last_name)').order('created_at', { ascending: false });

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">Financial & Social Assistance Requests</h3>
            <p class="text-muted mb-0">Review and approve social welfare aid for residents</p>
        </div>
    </div>

    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>Ref #</th>
                            <th>Resident</th>
                            <th>Assistance Type</th>
                            <th>Details</th>
                            <th>Status</th>
                            <th class="text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(!assistance || assistance.length === 0) ? `
                            <tr><td colspan="6" class="text-center py-4 text-muted">No assistance requests found.</td></tr>
                        ` : assistance.map(a => `
                            <tr>
                                <td><strong>${a.reference_number}</strong></td>
                                <td>${a.residents?.first_name} ${a.residents?.last_name}</td>
                                <td><span class="fw-bold text-info">${a.type}</span></td>
                                <td>${a.details}</td>
                                <td><span class="badge badge-status-${a.status}">${a.status}</span></td>
                                <td class="text-end">
                                    <a href="/assistance/status/${a.id}/APPROVED" class="btn btn-sm btn-success me-1">Approve</a>
                                    <a href="/assistance/status/${a.id}/RELEASED" class="btn btn-sm btn-primary">Release Aid</a>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;

    res.send(renderFullPageUI('Assistance Requests', html, req.session.user, settings, 'assistance'));
});

app.get('/assistance/status/:id/:status', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    await supabase.from('assistance_requests').update({ status: req.params.status }).eq('id', req.params.id);
    res.redirect('/assistance?success=Assistance request updated.');
});

// LOCAL BUSINESS MANAGEMENT
app.get('/businesses', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: businesses } = await supabase.from('businesses').select('*').order('business_name');

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">Local Business Management</h3>
            <p class="text-muted mb-0">Directory and permits for businesses operating in the barangay</p>
        </div>
        <button class="btn btn-success" data-bs-toggle="modal" data-bs-target="#addBusinessModal"><i class="bi bi-plus-lg me-1"></i> Register Business</button>
    </div>

    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>Business Name</th>
                            <th>Owner</th>
                            <th>Business Type</th>
                            <th>Permit #</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(!businesses || businesses.length === 0) ? `
                            <tr><td colspan="5" class="text-center py-4 text-muted">No business records found.</td></tr>
                        ` : businesses.map(b => `
                            <tr>
                                <td><strong class="text-success">${b.business_name}</strong></td>
                                <td>${b.owner_name}</td>
                                <td>${b.business_type}</td>
                                <td>${b.permit_number}</td>
                                <td><span class="badge badge-status-${b.permit_status}">${b.permit_status}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- ADD BUSINESS MODAL -->
    <div class="modal fade" id="addBusinessModal" tabindex="-1">
        <div class="modal-dialog">
            <form action="/businesses/add" method="POST" class="modal-content">
                <div class="modal-header bg-success text-white">
                    <h5 class="modal-title">Register Local Business</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label fw-bold">Business Name</label>
                        <input type="text" name="business_name" class="form-control" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Owner Name</label>
                        <input type="text" name="owner_name" class="form-control" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Business Type</label>
                        <input type="text" name="business_type" class="form-control" placeholder="Sari-Sari Store / Bakery" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Contact Number</label>
                        <input type="text" name="contact_number" class="form-control" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Business Address</label>
                        <textarea name="address" class="form-control" rows="2" required></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-success">Save Business</button>
                </div>
            </form>
        </div>
    </div>`;

    res.send(renderFullPageUI('Businesses', html, req.session.user, settings, 'businesses'));
});

app.post('/businesses/add', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    try {
        const { business_name, owner_name, business_type, contact_number, address } = req.body;
        const permitNumber = `PERMIT-2026-${Math.floor(1000 + Math.random() * 9000)}`;

        await supabase.from('businesses').insert([{
            business_name,
            owner_name,
            business_type,
            contact_number,
            address,
            permit_number: permitNumber,
            permit_status: 'ACTIVE'
        }]);

        res.redirect('/businesses?success=Business registered.');
    } catch (e) {
        res.redirect('/businesses?error=' + encodeURIComponent(e.message));
    }
});

// ANNOUNCEMENT MANAGEMENT
app.get('/announcements', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: announcements } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">Barangay Announcements</h3>
            <p class="text-muted mb-0">Publish community news, updates, and event notifications</p>
        </div>
        <button class="btn btn-success" data-bs-toggle="modal" data-bs-target="#addAnnouncementModal"><i class="bi bi-megaphone me-1"></i> Post Announcement</button>
    </div>

    <div class="row g-4">
        ${(!announcements || announcements.length === 0) ? `
            <div class="col-12"><div class="alert alert-light text-center py-4">No announcements published yet.</div></div>
        ` : announcements.map(a => `
            <div class="col-md-6">
                <div class="card border-0 shadow-sm rounded-4 h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <span class="badge bg-primary">${a.category}</span>
                            <small class="text-muted">${new Date(a.created_at).toLocaleDateString()}</small>
                        </div>
                        <h5 class="fw-bold text-dark">${a.title}</h5>
                        <p class="text-muted">${a.description}</p>
                        <div class="d-flex justify-content-end">
                            <a href="/announcements/delete/${a.id}" class="btn btn-sm btn-outline-danger" onclick="return confirm('Delete announcement?')"><i class="bi bi-trash"></i> Delete</a>
                        </div>
                    </div>
                </div>
            </div>
        `).join('')}
    </div>

    <!-- ADD ANNOUNCEMENT MODAL -->
    <div class="modal fade" id="addAnnouncementModal" tabindex="-1">
        <div class="modal-dialog">
            <form action="/announcements/add" method="POST" class="modal-content">
                <div class="modal-header bg-success text-white">
                    <h5 class="modal-title">Create Announcement</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label fw-bold">Title</label>
                        <input type="text" name="title" class="form-control" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Category</label>
                        <select name="category" class="form-select">
                            <option value="General">General Notice</option>
                            <option value="Health">Health & Medical</option>
                            <option value="Event">Community Event</option>
                            <option value="Emergency">Emergency Alert</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Content Description</label>
                        <textarea name="description" class="form-control" rows="4" required></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-success">Publish Now</button>
                </div>
            </form>
        </div>
    </div>`;

    res.send(renderFullPageUI('Announcements', html, req.session.user, settings, 'announcements'));
});

app.post('/announcements/add', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    try {
        const { title, category, description } = req.body;
        await supabase.from('announcements').insert([{
            title,
            category,
            description,
            created_by: req.session.user.id
        }]);

        // Send Global Notification to all Residents
        await createNotification(null, 'RESIDENT', title, description);

        res.redirect('/announcements?success=Announcement published.');
    } catch (e) {
        res.redirect('/announcements?error=' + encodeURIComponent(e.message));
    }
});

app.get('/announcements/delete/:id', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    await supabase.from('announcements').delete().eq('id', req.params.id);
    res.redirect('/announcements?success=Announcement deleted.');
});

// SYSTEM REPORTS
app.get('/reports', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
    const settings = await getBarangaySettings();

    const { count: resCount } = await supabase.from('residents').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE');
    const { count: hhCount } = await supabase.from('households').select('*', { count: 'exact', head: true });
    const { count: certCount } = await supabase.from('certificate_requests').select('*', { count: 'exact', head: true });
    const { count: blotterCount } = await supabase.from('blotter_records').select('*', { count: 'exact', head: true });

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">Barangay Analytical Reports</h3>
            <p class="text-muted mb-0">System metrics, population demographics, and operational logs</p>
        </div>
        <button class="btn btn-primary" onclick="window.print()"><i class="bi bi-printer"></i> Export PDF / Print Report</button>
    </div>

    <div class="card border-0 shadow-sm p-4 mb-4">
        <h5 class="fw-bold text-success border-bottom pb-2 mb-3">Executive Summary</h5>
        <div class="row g-3 text-center">
            <div class="col-md-3">
                <div class="p-3 border rounded-3 bg-light">
                    <div class="text-muted small">Total Population</div>
                    <div class="fs-3 fw-bold text-success">${resCount || 0}</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="p-3 border rounded-3 bg-light">
                    <div class="text-muted small">Total Households</div>
                    <div class="fs-3 fw-bold text-primary">${hhCount || 0}</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="p-3 border rounded-3 bg-light">
                    <div class="text-muted small">Certificates Issued</div>
                    <div class="fs-3 fw-bold text-info">${certCount || 0}</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="p-3 border rounded-3 bg-light">
                    <div class="text-muted small">Blotter Complaints</div>
                    <div class="fs-3 fw-bold text-danger">${blotterCount || 0}</div>
                </div>
            </div>
        </div>
    </div>`;

    res.send(renderFullPageUI('System Reports', html, req.session.user, settings, 'reports'));
});

// STAFF USER MANAGEMENT
app.get('/users', requireAuth(['ADMIN']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: users } = await supabase.from('users').select('*').order('created_at');

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">Staff User Accounts</h3>
            <p class="text-muted mb-0">Manage system administration and staff login permissions</p>
        </div>
        <button class="btn btn-success" data-bs-toggle="modal" data-bs-target="#addUserModal"><i class="bi bi-person-plus me-1"></i> Create Staff Account</button>
    </div>

    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>Username</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Date Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(users || []).map(u => `
                            <tr>
                                <td><strong>${u.username}</strong></td>
                                <td>${u.email}</td>
                                <td><span class="badge ${u.role === 'ADMIN' ? 'bg-danger' : 'bg-primary'}">${u.role}</span></td>
                                <td>${new Date(u.created_at).toLocaleDateString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- ADD USER MODAL -->
    <div class="modal fade" id="addUserModal" tabindex="-1">
        <div class="modal-dialog">
            <form action="/users/add" method="POST" class="modal-content">
                <div class="modal-header bg-success text-white">
                    <h5 class="modal-title">Create Staff Account</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label fw-bold">Username</label>
                        <input type="text" name="username" class="form-control" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Email</label>
                        <input type="email" name="email" class="form-control" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Password</label>
                        <input type="password" name="password" class="form-control" minlength="6" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Role</label>
                        <select name="role" class="form-select">
                            <option value="STAFF">Staff User</option>
                            <option value="ADMIN">Administrator</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-success">Create Account</button>
                </div>
            </form>
        </div>
    </div>`;

    res.send(renderFullPageUI('Staff Users', html, req.session.user, settings, 'users'));
});

app.post('/users/add', requireAuth(['ADMIN']), async (req, res) => {
    try {
        const { username, email, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        await supabase.from('users').insert([{
            username,
            email,
            password: hashedPassword,
            role,
            must_change_password: true
        }]);

        res.redirect('/users?success=Staff account created.');
    } catch (e) {
        res.redirect('/users?error=' + encodeURIComponent(e.message));
    }
});

// ACTIVITY LOGS VIEW
app.get('/activity-logs', requireAuth(['ADMIN']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: logs } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100);

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">System Audit & Activity Logs</h3>
            <p class="text-muted mb-0">Immutable records of all administrative operations</p>
        </div>
    </div>

    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>Timestamp</th>
                            <th>User</th>
                            <th>Action</th>
                            <th>Details</th>
                            <th>IP Address</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(logs || []).map(l => `
                            <tr>
                                <td><small class="text-muted">${new Date(l.created_at).toLocaleString()}</small></td>
                                <td><strong>${l.username}</strong></td>
                                <td><span class="badge bg-secondary">${l.action}</span></td>
                                <td>${l.details || ''}</td>
                                <td><small class="text-muted">${l.ip_address || 'N/A'}</small></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;

    res.send(renderFullPageUI('Activity Logs', html, req.session.user, settings, 'logs'));
});

// BARANGAY BRANDING SETTINGS
app.get('/barangay-settings', requireAuth(['ADMIN']), async (req, res) => {
    const settings = await getBarangaySettings();

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">Barangay Branding & Settings</h3>
            <p class="text-muted mb-0">Customize barangay logos, names, leadership names, and background images</p>
        </div>
    </div>

    <div class="card border-0 shadow-sm rounded-4">
        <div class="card-body p-4">
            <form action="/barangay-settings/save" method="POST" enctype="multipart/form-data">
                <h6 class="fw-bold text-success border-bottom pb-2 mb-3">General Identity</h6>
                <div class="row g-3 mb-3">
                    <div class="col-md-4">
                        <label class="form-label fw-bold">Barangay Name</label>
                        <input type="text" name="name" class="form-control" value="${settings.name}" required>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold">Municipality / City</label>
                        <input type="text" name="municipality" class="form-control" value="${settings.municipality}" required>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label fw-bold">Province</label>
                        <input type="text" name="province" class="form-control" value="${settings.province}" required>
                    </div>
                </div>

                <div class="row g-3 mb-3">
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Barangay Captain Name</label>
                        <input type="text" name="captain_name" class="form-control" value="${settings.captain_name}">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Barangay Secretary Name</label>
                        <input type="text" name="secretary_name" class="form-control" value="${settings.secretary_name}">
                    </div>
                </div>

                <h6 class="fw-bold text-success border-bottom pb-2 mb-3">Contact & Address</h6>
                <div class="row g-3 mb-3">
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Contact Phone Number</label>
                        <input type="text" name="contact_number" class="form-control" value="${settings.contact_number}">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Official Email</label>
                        <input type="email" name="email" class="form-control" value="${settings.email}">
                    </div>
                    <div class="col-12">
                        <label class="form-label fw-bold">Hall Address</label>
                        <textarea name="address" class="form-control" rows="2">${settings.address}</textarea>
                    </div>
                </div>

                <h6 class="fw-bold text-success border-bottom pb-2 mb-3">Logos & Visual Configuration</h6>
                <div class="row g-3 mb-4">
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Barangay Official Logo Image File</label>
                        <input type="file" name="logo" class="form-control" accept="image/*">
                        ${settings.logo_url ? `<img src="${settings.logo_url}" class="mt-2 rounded-circle" style="width:60px; height:60px; object-fit:cover;">` : ''}
                    </div>
                    <div class="col-md-6">
                        <label class="form-label fw-bold">Login Screen Background Image URL</label>
                        <input type="text" name="login_bg_url" class="form-control" value="${settings.login_bg_url}">
                    </div>
                </div>

                <button type="submit" class="btn btn-success px-4 py-2 fw-bold">Save Settings</button>
            </form>
        </div>
    </div>`;

    res.send(renderFullPageUI('Settings', html, req.session.user, settings, 'settings'));
});

app.post('/barangay-settings/save', requireAuth(['ADMIN']), upload.single('logo'), async (req, res) => {
    try {
        const { name, municipality, province, captain_name, secretary_name, contact_number, email, address, login_bg_url } = req.body;
        let logoUrl = '';

        if (req.file) {
            const fileName = `logos/${Date.now()}_${req.file.originalname}`;
            const { error } = await supabase.storage.from('brms-docs').upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

            if (!error) {
                const { data: publicUrlData } = supabase.storage.from('brms-docs').getPublicUrl(fileName);
                logoUrl = publicUrlData.publicUrl;
            }
        }

        const updateData = {
            name, municipality, province, captain_name, secretary_name, contact_number, email, address, login_bg_url
        };
        if (logoUrl) updateData.logo_url = logoUrl;

        const { data: existing } = await supabase.from('barangay_settings').select('id').limit(1).single();

        if (existing) {
            await supabase.from('barangay_settings').update(updateData).eq('id', existing.id);
        } else {
            await supabase.from('barangay_settings').insert([updateData]);
        }

        await logActivity(req.session.user.id, req.session.user.username, 'UPDATE_SETTINGS', 'Updated barangay configuration', req);

        res.redirect('/barangay-settings?success=Settings updated successfully.');
    } catch (e) {
        res.redirect('/barangay-settings?error=' + encodeURIComponent(e.message));
    }
});

// ==========================================
// RESIDENT PORTAL ROUTES
// ==========================================

// RESIDENT DASHBOARD
app.get('/resident-dashboard', requireAuth(['RESIDENT']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('user_id', req.session.user.id).single();
    const { data: announcements } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(4);
    const { data: myRequests } = await supabase.from('certificate_requests').select('*').eq('resident_id', resident?.id).order('created_at', { ascending: false }).limit(5);

    const html = `
    <div class="row g-4 mb-4">
        <div class="col-md-12">
            <div class="card border-0 shadow-sm bg-green-grad p-4 rounded-4 text-white">
                <h3 class="fw-bold mb-1">Welcome back, ${resident?.first_name || req.session.user.username}!</h3>
                <p class="mb-0 text-white-50">Resident ID: <strong>${resident?.resident_number || 'PENDING'}</strong> | Purok: ${resident?.puroks?.name || 'N/A'}</p>
            </div>
        </div>
    </div>

    <div class="row g-4">
        <!-- ANNOUNCEMENTS DISPLAY -->
        <div class="col-md-7">
            <div class="card border-0 shadow-sm rounded-4 h-100">
                <div class="card-header bg-white fw-bold py-3 d-flex justify-content-between align-items-center">
                    <span><i class="bi bi-megaphone me-2 text-success"></i>Community Announcements</span>
                    <a href="/my-announcements" class="btn btn-sm btn-link text-decoration-none">View All</a>
                </div>
                <div class="card-body">
                    ${(!announcements || announcements.length === 0) ? `
                        <p class="text-center text-muted py-4">No community announcements available.</p>
                    ` : announcements.map(a => `
                        <div class="border-bottom pb-3 mb-3">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="badge bg-primary">${a.category}</span>
                                <small class="text-muted">${new Date(a.created_at).toLocaleDateString()}</small>
                            </div>
                            <h6 class="fw-bold mb-1">${a.title}</h6>
                            <p class="text-muted small mb-0">${a.description}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>

        <!-- RECENT REQUESTS QUICK STATUS -->
        <div class="col-md-5">
            <div class="card border-0 shadow-sm rounded-4 h-100">
                <div class="card-header bg-white fw-bold py-3">
                    <i class="bi bi-clock-history me-2 text-primary"></i>Recent Document Requests
                </div>
                <div class="card-body p-0">
                    <ul class="list-group list-group-flush">
                        ${(!myRequests || myRequests.length === 0) ? `
                            <li class="list-group-item text-center py-4 text-muted">No recent document requests.</li>
                        ` : myRequests.map(r => `
                            <li class="list-group-item d-flex justify-content-between align-items-center">
                                <div>
                                    <div class="fw-bold">${r.certificate_type}</div>
                                    <small class="text-muted">${r.request_number}</small>
                                </div>
                                <span class="badge badge-status-${r.status}">${r.status}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </div>
        </div>
    </div>`;

    res.send(renderFullPageUI('Resident Dashboard', html, req.session.user, settings, 'dashboard'));
});

// RESIDENT DIGITAL ID VIEW
app.get('/my-digital-id', requireAuth(['RESIDENT']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('user_id', req.session.user.id).single();

    if (!resident || resident.status !== 'ACTIVE') {
        return res.send(renderFullPageUI('Digital ID', `<div class="alert alert-warning">Your digital ID is unavailable until your account registration is approved by staff.</div>`, req.session.user, settings));
    }

    const verifyUrl = `${req.protocol}://${req.get('host')}/verify/${resident.resident_number}/${resident.qr_token}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl);

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">My Barangay Digital ID</h3>
            <p class="text-muted mb-0">Official Barangay Identification Card</p>
        </div>
        <button class="btn btn-primary" onclick="window.print()"><i class="bi bi-printer me-1"></i> Print ID</button>
    </div>

    <div class="d-flex justify-content-center py-4">
        <div class="print-area">
            <div class="id-card-preview id-card-item">
                <div class="d-flex align-items-center gap-2 border-bottom pb-1" style="border-color: #0d5c3a !important;">
                    <img src="${settings.logo_url || 'https://via.placeholder.com/150/0d5c3a/FFFFFF?text=BRGY'}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
                    <div style="line-height:1.1;">
                        <div style="font-size: 8px; font-weight:700; color:#0d5c3a;">${settings.id_header || 'REPUBLIC OF THE PHILIPPINES'}</div>
                        <div style="font-size: 10px; font-weight:800; color:#0f4c81;">${settings.name}</div>
                        <div style="font-size: 7px; color:#555;">${settings.municipality}, ${settings.province}</div>
                    </div>
                </div>

                <div class="d-flex gap-2 my-1 align-items-center">
                    <img src="${resident.photo_url || 'https://via.placeholder.com/100x100/cccccc/ffffff?text=PHOTO'}" style="width:65px; height:65px; border-radius:6px; object-fit:cover; border:1px solid #0d5c3a;">
                    <div style="font-size:8px; line-height:1.3; flex-grow:1;">
                        <div style="font-size: 7px; color:#666;">RESIDENT ID NUMBER</div>
                        <div style="font-weight:800; font-size:10px; color:#0d5c3a;">${resident.resident_number}</div>
                        <div style="font-weight:700; font-size:9px;" class="mt-1">${resident.first_name} ${resident.last_name}</div>
                        <div>DOB: ${resident.date_of_birth} | Gender: ${resident.gender}</div>
                        <div>Purok: ${resident.puroks?.name || 'N/A'}</div>
                    </div>
                    <img src="${qrDataUrl}" style="width:55px; height:55px;">
                </div>

                <div class="text-center pt-1 border-top" style="font-size:6px; color:#666; border-color: #0d5c3a !important;">
                    ${settings.id_footer || 'BARANGAY IDENTIFICATION CARD'}
                </div>
            </div>
        </div>
    </div>`;

    res.send(renderFullPageUI('Digital ID', html, req.session.user, settings, 'digital-id'));
});

// RESIDENT CERTIFICATE REQUESTS & LIST
app.get('/my-requests', requireAuth(['RESIDENT']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: resident } = await supabase.from('residents').select('id').eq('user_id', req.session.user.id).single();
    const { data: requests } = await supabase.from('certificate_requests').select('*').eq('resident_id', resident?.id).order('created_at', { ascending: false });

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">My Certificate Requests</h3>
            <p class="text-muted mb-0">Request barangay clearances, residency certificates, and track status</p>
        </div>
        <button class="btn btn-success" data-bs-toggle="modal" data-bs-target="#requestCertModal"><i class="bi bi-file-earmark-plus me-1"></i> New Certificate Request</button>
    </div>

    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>Req #</th>
                            <th>Certificate Type</th>
                            <th>Purpose</th>
                            <th>Date Requested</th>
                            <th>Status</th>
                            <th class="text-end">Document</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(!requests || requests.length === 0) ? `
                            <tr><td colspan="6" class="text-center py-4 text-muted">No certificate requests found.</td></tr>
                        ` : requests.map(r => `
                            <tr>
                                <td><strong>${r.request_number}</strong></td>
                                <td><span class="fw-bold text-primary">${r.certificate_type}</span></td>
                                <td>${r.purpose}</td>
                                <td>${new Date(r.created_at).toLocaleDateString()}</td>
                                <td><span class="badge badge-status-${r.status}">${r.status}</span></td>
                                <td class="text-end">
                                    ${r.issued_document_url ? `
                                        <a href="${r.issued_document_url}" target="_blank" class="btn btn-sm btn-outline-success"><i class="bi bi-download"></i> Download</a>
                                    ` : '<span class="text-muted small">N/A</span>'}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- REQUEST CERTIFICATE MODAL -->
    <div class="modal fade" id="requestCertModal" tabindex="-1">
        <div class="modal-dialog">
            <form action="/my-requests/add" method="POST" class="modal-content">
                <div class="modal-header bg-success text-white">
                    <h5 class="modal-title">Request Official Certificate</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label fw-bold">Certificate Type</label>
                        <select name="certificate_type" class="form-select" required>
                            <option value="Barangay Clearance">Barangay Clearance</option>
                            <option value="Certificate of Residency">Certificate of Residency</option>
                            <option value="Certificate of Indigency">Certificate of Indigency</option>
                            <option value="Certificate of Good Moral">Certificate of Good Moral</option>
                            <option value="Certificate of No Income">Certificate of No Income</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Purpose</label>
                        <textarea name="purpose" class="form-control" rows="2" placeholder="e.g. Employment, Scholarship, Postal ID" required></textarea>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Preferred Pick-Up Date</label>
                        <input type="date" name="preferred_date" class="form-control">
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-success">Submit Request</button>
                </div>
            </form>
        </div>
    </div>`;

    res.send(renderFullPageUI('My Certificate Requests', html, req.session.user, settings, 'my-requests'));
});

app.post('/my-requests/add', requireAuth(['RESIDENT']), async (req, res) => {
    try {
        const { certificate_type, purpose, preferred_date } = req.body;
        const { data: resident } = await supabase.from('residents').select('id').eq('user_id', req.session.user.id).single();

        const reqNumber = `REQ-2026-${Math.floor(10000 + Math.random() * 90000)}`;

        await supabase.from('certificate_requests').insert([{
            request_number: reqNumber,
            resident_id: resident.id,
            certificate_type,
            purpose,
            preferred_date: preferred_date || null,
            status: 'PENDING'
        }]);

        await createNotification(null, 'ADMIN', 'New Certificate Request', `New ${certificate_type} request submitted.`);

        res.redirect('/my-requests?success=Certificate request submitted.');
    } catch (e) {
        res.redirect('/my-requests?error=' + encodeURIComponent(e.message));
    }
});

// RESIDENT APPOINTMENTS
app.get('/my-appointments', requireAuth(['RESIDENT']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: resident } = await supabase.from('residents').select('id').eq('user_id', req.session.user.id).single();
    const { data: appointments } = await supabase.from('appointments').select('*').eq('resident_id', resident?.id).order('appointment_date');

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">My Scheduled Appointments</h3>
            <p class="text-muted mb-0">Book appointments with barangay officials</p>
        </div>
        <button class="btn btn-success" data-bs-toggle="modal" data-bs-target="#bookApptModal"><i class="bi bi-calendar-plus me-1"></i> Book Appointment</button>
    </div>

    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>Appt #</th>
                            <th>Service</th>
                            <th>Date & Time</th>
                            <th>Purpose</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(!appointments || appointments.length === 0) ? `
                            <tr><td colspan="5" class="text-center py-4 text-muted">No appointments found.</td></tr>
                        ` : appointments.map(a => `
                            <tr>
                                <td><strong>${a.appointment_number}</strong></td>
                                <td>${a.service}</td>
                                <td>${a.appointment_date} at${a.appointment_time}</td>
                                <td>${a.purpose}</td>
                                <td><span class="badge badge-status-${a.status}">${a.status}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- BOOK APPOINTMENT MODAL -->
    <div class="modal fade" id="bookApptModal" tabindex="-1">
        <div class="modal-dialog">
            <form action="/my-appointments/add" method="POST" class="modal-content">
                <div class="modal-header bg-success text-white">
                    <h5 class="modal-title">Book Appointment</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label fw-bold">Service / Office</label>
                        <select name="service" class="form-select" required>
                            <option value="Barangay Captain Consultation">Barangay Captain Consultation</option>
                            <option value="Lupon Tagapamayapa Mediation">Lupon Tagapamayapa Mediation</option>
                            <option value="Social Welfare Desk">Social Welfare Desk</option>
                        </select>
                    </div>
                    <div class="row g-3 mb-3">
                        <div class="col-md-6">
                            <label class="form-label fw-bold">Preferred Date</label>
                            <input type="date" name="appointment_date" class="form-control" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label fw-bold">Preferred Time</label>
                            <input type="time" name="appointment_time" class="form-control" required>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Purpose / Concern</label>
                        <textarea name="purpose" class="form-control" rows="2" required></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-success">Confirm Booking</button>
                </div>
            </form>
        </div>
    </div>`;

    res.send(renderFullPageUI('My Appointments', html, req.session.user, settings, 'my-appointments'));
});

app.post('/my-appointments/add', requireAuth(['RESIDENT']), async (req, res) => {
    try {
        const { service, appointment_date, appointment_time, purpose } = req.body;
        const { data: resident } = await supabase.from('residents').select('id').eq('user_id', req.session.user.id).single();

        const apptNum = `APT-2026-${Math.floor(1000 + Math.random() * 9000)}`;

        await supabase.from('appointments').insert([{
            appointment_number: apptNum,
            resident_id: resident.id,
            service,
            appointment_date,
            appointment_time,
            purpose,
            status: 'PENDING'
        }]);

        res.redirect('/my-appointments?success=Appointment request submitted.');
    } catch (e) {
        res.redirect('/my-appointments?error=' + encodeURIComponent(e.message));
    }
});

// RESIDENT COMPLAINTS SUBMISSION
app.get('/my-complaints', requireAuth(['RESIDENT']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: resident } = await supabase.from('residents').select('*').eq('user_id', req.session.user.id).single();
    const { data: complaints } = await supabase.from('blotter_records').select('*').eq('complainant_id', resident?.id).order('created_at', { ascending: false });

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">My Complaints & Concerns</h3>
            <p class="text-muted mb-0">File incident reports directly to barangay hall</p>
        </div>
        <button class="btn btn-danger" data-bs-toggle="modal" data-bs-target="#fileComplaintModal"><i class="bi bi-exclamation-triangle me-1"></i> File Concern</button>
    </div>

    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>Case #</th>
                            <th>Respondent</th>
                            <th>Incident Date</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(!complaints || complaints.length === 0) ? `
                            <tr><td colspan="4" class="text-center py-4 text-muted">No complaints filed.</td></tr>
                        ` : complaints.map(c => `
                            <tr>
                                <td><strong class="text-danger">${c.case_number}</strong></td>
                                <td>${c.respondent_name}</td>
                                <td>${c.incident_date}</td>
                                <td><span class="badge badge-status-${c.status}">${c.status}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- FILE COMPLAINT MODAL -->
    <div class="modal fade" id="fileComplaintModal" tabindex="-1">
        <div class="modal-dialog">
            <form action="/my-complaints/add" method="POST" class="modal-content">
                <div class="modal-header bg-danger text-white">
                    <h5 class="modal-title">File Complaint / Concern</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label fw-bold">Respondent / Concerned Party Name</label>
                        <input type="text" name="respondent_name" class="form-control" required>
                    </div>
                    <div class="row g-3 mb-3">
                        <div class="col-md-6">
                            <label class="form-label fw-bold">Incident Date</label>
                            <input type="date" name="incident_date" class="form-control" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label fw-bold">Incident Location</label>
                            <input type="text" name="incident_location" class="form-control" required>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Detailed Incident Description</label>
                        <textarea name="description" class="form-control" rows="3" required></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-danger">File Complaint</button>
                </div>
            </form>
        </div>
    </div>`;

    res.send(renderFullPageUI('My Complaints', html, req.session.user, settings, 'my-complaints'));
});

app.post('/my-complaints/add', requireAuth(['RESIDENT']), async (req, res) => {
    try {
        const { respondent_name, incident_date, incident_location, description } = req.body;
        const { data: resident } = await supabase.from('residents').select('*').eq('user_id', req.session.user.id).single();

        const caseNum = `CASE-2026-${Math.floor(1000 + Math.random() * 9000)}`;

        await supabase.from('blotter_records').insert([{
            case_number: caseNum,
            complainant_id: resident.id,
            complainant_name: `${resident.first_name} ${resident.last_name}`,
            respondent_name,
            incident_date,
            incident_location,
            description,
            status: 'PENDING'
        }]);

        res.redirect('/my-complaints?success=Complaint submitted.');
    } catch (e) {
        res.redirect('/my-complaints?error=' + encodeURIComponent(e.message));
    }
});

// RESIDENT ASSISTANCE REQUESTS
app.get('/my-assistance', requireAuth(['RESIDENT']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: resident } = await supabase.from('residents').select('id').eq('user_id', req.session.user.id).single();
    const { data: assistance } = await supabase.from('assistance_requests').select('*').eq('resident_id', resident?.id).order('created_at', { ascending: false });

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">My Social Assistance Requests</h3>
            <p class="text-muted mb-0">Apply for medical, financial, educational, or emergency social aid</p>
        </div>
        <button class="btn btn-success" data-bs-toggle="modal" data-bs-target="#requestAidModal"><i class="bi bi-hand-thumbs-up me-1"></i> Request Aid</button>
    </div>

    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>Ref #</th>
                            <th>Assistance Type</th>
                            <th>Details</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(!assistance || assistance.length === 0) ? `
                            <tr><td colspan="4" class="text-center py-4 text-muted">No assistance requests found.</td></tr>
                        ` : assistance.map(a => `
                            <tr>
                                <td><strong>${a.reference_number}</strong></td>
                                <td><span class="fw-bold text-info">${a.type}</span></td>
                                <td>${a.details}</td>
                                <td><span class="badge badge-status-${a.status}">${a.status}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- REQUEST AID MODAL -->
    <div class="modal fade" id="requestAidModal" tabindex="-1">
        <div class="modal-dialog">
            <form action="/my-assistance/add" method="POST" class="modal-content">
                <div class="modal-header bg-success text-white">
                    <h5 class="modal-title">Request Assistance</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label fw-bold">Assistance Type</label>
                        <select name="type" class="form-select" required>
                            <option value="Medical Assistance">Medical Assistance</option>
                            <option value="Educational Assistance">Educational Assistance</option>
                            <option value="Financial Assistance">Financial Assistance</option>
                            <option value="Food Assistance">Food Assistance</option>
                            <option value="Emergency Assistance">Emergency Assistance</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Details & Explanation of Need</label>
                        <textarea name="details" class="form-control" rows="3" required></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-success">Submit Assistance Request</button>
                </div>
            </form>
        </div>
    </div>`;

    res.send(renderFullPageUI('My Assistance Requests', html, req.session.user, settings, 'my-assistance'));
});

app.post('/my-assistance/add', requireAuth(['RESIDENT']), async (req, res) => {
    try {
        const { type, details } = req.body;
        const { data: resident } = await supabase.from('residents').select('id').eq('user_id', req.session.user.id).single();

        const refNum = `AID-2026-${Math.floor(1000 + Math.random() * 9000)}`;

        await supabase.from('assistance_requests').insert([{
            reference_number: refNum,
            resident_id: resident.id,
            type,
            details,
            status: 'PENDING'
        }]);

        res.redirect('/my-assistance?success=Assistance request submitted.');
    } catch (e) {
        res.redirect('/my-assistance?error=' + encodeURIComponent(e.message));
    }
});

// RESIDENT ANNOUNCEMENTS
app.get('/my-announcements', requireAuth(['RESIDENT']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: announcements } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">Barangay Announcements</h3>
            <p class="text-muted mb-0">Official notices and community developments</p>
        </div>
    </div>

    <div class="row g-4">
        ${(!announcements || announcements.length === 0) ? `
            <div class="col-12"><div class="alert alert-light text-center py-4">No announcements available.</div></div>
        ` : announcements.map(a => `
            <div class="col-md-6">
                <div class="card border-0 shadow-sm rounded-4 h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <span class="badge bg-primary">${a.category}</span>
                            <small class="text-muted">${new Date(a.created_at).toLocaleDateString()}</small>
                        </div>
                        <h5 class="fw-bold text-dark">${a.title}</h5>
                        <p class="text-muted">${a.description}</p>
                    </div>
                </div>
            </div>
        `).join('')}
    </div>`;

    res.send(renderFullPageUI('Announcements', html, req.session.user, settings, 'my-announcements'));
});

// RESIDENT PROFILE & PASSWORD UPDATE
app.get('/my-profile', requireAuth(['RESIDENT']), async (req, res) => {
    const settings = await getBarangaySettings();
    const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('user_id', req.session.user.id).single();

    const html = `
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h3 class="fw-bold text-success mb-1">My Personal Profile & Account</h3>
            <p class="text-muted mb-0">View profile information and update login credentials</p>
        </div>
    </div>

    <div class="row g-4">
        <div class="col-md-6">
            <div class="card border-0 shadow-sm rounded-4 p-4">
                <h5 class="fw-bold text-success border-bottom pb-2 mb-3">Personal Details</h5>
                <p><strong>Full Name:</strong> ${resident?.first_name} ${resident?.last_name}</p>
                <p><strong>Resident ID:</strong> ${resident?.resident_number || 'PENDING'}</p>
                <p><strong>Date of Birth:</strong> ${resident?.date_of_birth}</p>
                <p><strong>Contact:</strong> ${resident?.contact_number}</p>
                <p><strong>Email:</strong> ${resident?.email}</p>
                <p><strong>Address:</strong> ${resident?.address}</p>
            </div>
        </div>

        <div class="col-md-6">
            <div class="card border-0 shadow-sm rounded-4 p-4">
                <h5 class="fw-bold text-success border-bottom pb-2 mb-3">Change Account Password</h5>
                <form action="/my-profile/password" method="POST">
                    <div class="mb-3">
                        <label class="form-label fw-semibold">New Password</label>
                        <input type="password" name="password" class="form-control" minlength="6" required>
                    </div>
                    <button type="submit" class="btn btn-primary fw-bold">Update Password</button>
                </form>
            </div>
        </div>
    </div>`;

    res.send(renderFullPageUI('My Profile', html, req.session.user, settings, 'my-profile'));
});

app.post('/my-profile/password', requireAuth(['RESIDENT']), async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        await supabase.from('users').update({ password: hashedPassword }).eq('id', req.session.user.id);
        res.redirect('/my-profile?success=Password updated successfully.');
    } catch (e) {
        res.redirect('/my-profile?error=' + encodeURIComponent(e.message));
    }
});

// DEFAULT FALLBACK ROUTE
app.get('/', (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'ADMIN' || req.session.user.role === 'STAFF') {
            return res.redirect('/dashboard');
        } else {
            return res.redirect('/resident-dashboard');
        }
    } else {
        return res.redirect('/login');
    }
});

// START SERVER
app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`BRMS Server running on http://0.0.0.0:${PORT}`);
    console.log(`=======================================================`);
});
