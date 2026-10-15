/** Small shared helpers: HTML escaping, system settings, validation. */
const { supabase } = require('../config/index');

const escHtml = (v) => String(v === null || v === undefined ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Helper: Fetch Global Barangay Settings
const getSettings = async () => {
  const { data } = await supabase.from('system_settings').select('*').single();
  return data || {};
};

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const tidy = (v) => String(v || '').trim();

// True if another account already uses this value as a username OR an email
const identTaken = async (value, exceptId) => {
  for (const field of ['username', 'email']) {
    let q = supabase.from('users').select('id').eq(field, value).limit(1);
    if (exceptId) q = q.neq('id', exceptId);
    const { data } = await q;
    if (data && data.length) return true;
  }
  return false;
};

const alertBack = (res, msg, code = 400) =>
  res.status(code).send(`<script>alert(${JSON.stringify(msg)}); window.history.back();</script>`);

module.exports = { escHtml, getSettings, EMAIL_RE, tidy, identTaken, alertBack };
