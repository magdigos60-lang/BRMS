/** Environment variables, Supabase client and file-upload (multer) settings. */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-supabase-id.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-supabase-anon-key';
// Server-side secret key (Supabase > Project Settings > API > service_role). It bypasses Row Level Security,
// so keep it ONLY in the server's environment variables - never in the code, a repository, or the browser.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const JWT_SECRET = process.env.JWT_SECRET || 'barangay-system-super-secure-jwt-secret-key-2026';

if (!SUPABASE_URL || (!SUPABASE_SERVICE_ROLE_KEY && !SUPABASE_ANON_KEY)) {
  console.warn('[WARNING] Supabase credentials missing! Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment variables.');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[WARNING] SUPABASE_SERVICE_ROLE_KEY is not set. Using the anon key, which Row Level Security will block.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

module.exports = { PORT, JWT_SECRET, supabase, upload };
