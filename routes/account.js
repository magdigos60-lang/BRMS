/** My Account: change own password (everyone) and own email/name (staff). */
const express = require('express');
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/index');
const { authenticateToken, requireRole, logActivity } = require('../middleware/auth');
const { STAFF_ROLES } = require('../utils/constants');
const { escHtml, getSettings, EMAIL_RE, tidy, identTaken } = require('../utils/helpers');
const { renderAppLayout } = require('../views/layout');

const router = express.Router();

// ---------- ACCOUNT & PASSWORD (all logged-in users) ----------
const ACCOUNT_MESSAGES = {
  pw_ok: ['success', 'Your password was changed successfully.'],
  pw_wrong: ['danger', 'Your current password is incorrect.'],
  pw_mismatch: ['danger', 'The new password and its confirmation do not match.'],
  pw_short: ['danger', 'The new password must be at least 6 characters.'],
  pw_same: ['danger', 'The new password must be different from your current password.'],
  prof_ok: ['success', 'Your account details were updated.'],
  prof_wrong: ['danger', 'Your current password is incorrect, so nothing was changed.'],
  prof_taken: ['danger', 'That username or email is already used by another account.'],
  prof_invalid: ['danger', 'Please enter a name, a username and a valid email address.'],
  error: ['danger', 'Something went wrong. Please try again.']
};

router.get('/account', authenticateToken, async (req, res) => {
  const settings = await getSettings();
  const u = req.user;
  const isStaff = STAFF_ROLES.includes(u.role);
  const m = ACCOUNT_MESSAGES[req.query.msg];

  const html = `
    <div style="max-width: 760px; margin: auto;">
      ${m ? `<div class="alert alert-${m[0]}"><i class="bi ${m[0] === 'success' ? 'bi-check-circle' : 'bi-exclamation-triangle'} me-2"></i>${m[1]}</div>` : ''}

      ${isStaff ? `
      <div class="card card-custom p-4 mb-4">
        <h5 class="fw-bold text-primary-blue mb-3"><i class="bi bi-person-gear me-2"></i>Account Details</h5>
        <form action="/api/account/update-profile" method="POST">
          <div class="row g-3">
            <div class="col-md-6"><label class="form-label">Full Name *</label><input type="text" name="full_name" class="form-control" required value="${escHtml(u.full_name)}"></div>
            <div class="col-md-6"><label class="form-label">Username *</label><input type="text" name="username" class="form-control" required value="${escHtml(u.username)}"></div>
            <div class="col-12"><label class="form-label">Email Address *</label><input type="email" name="email" class="form-control" required value="${escHtml(u.email)}"></div>
            <div class="col-12"><label class="form-label">Current Password * <small class="text-muted">(to confirm it's you)</small></label><input type="password" name="current_password" class="form-control" required autocomplete="current-password"></div>
          </div>
          <button type="submit" class="btn btn-primary-custom text-white mt-3"><i class="bi bi-check2 me-1"></i> Save Account Details</button>
        </form>
      </div>` : `
      <div class="card card-custom p-4 mb-4">
        <h5 class="fw-bold text-primary-blue mb-2"><i class="bi bi-person-circle me-2"></i>My Login</h5>
        <p class="mb-1"><strong>Login email:</strong> ${escHtml(u.email)}</p>
        <small class="text-muted">To correct your name, address or other details, ask the Barangay office or send a correction request from My Profile.</small>
      </div>`}

      <div class="card card-custom p-4">
        <h5 class="fw-bold text-primary-blue mb-3"><i class="bi bi-key me-2"></i>Change Password</h5>
        <form action="/api/account/change-password" method="POST">
          <div class="mb-3"><label class="form-label">Current Password *</label><input type="password" name="current_password" class="form-control" required autocomplete="current-password"></div>
          <div class="row g-3">
            <div class="col-md-6"><label class="form-label">New Password * <small class="text-muted">(min. 6 characters)</small></label><input type="password" name="new_password" class="form-control" required minlength="6" autocomplete="new-password"></div>
            <div class="col-md-6"><label class="form-label">Confirm New Password *</label><input type="password" name="confirm_password" class="form-control" required minlength="6" autocomplete="new-password"></div>
          </div>
          <button type="submit" class="btn btn-accent-custom fw-bold text-white mt-3"><i class="bi bi-shield-lock me-1"></i> Update Password</button>
        </form>
      </div>
    </div>`;

  res.send(renderAppLayout(req, isStaff ? 'account' : 'res-account', html, settings));
});

router.post('/api/account/change-password', authenticateToken, async (req, res) => {
  const back = (k) => res.redirect('/account?msg=' + k);
  try {
    const { current_password, new_password, confirm_password } = req.body;
    if (!(await bcrypt.compare(String(current_password || ''), req.user.password_hash))) return back('pw_wrong');
    if (!new_password || String(new_password).length < 6) return back('pw_short');
    if (new_password !== confirm_password) return back('pw_mismatch');
    if (new_password === current_password) return back('pw_same');
    const password_hash = await bcrypt.hash(String(new_password), 10);
    const { error } = await supabase.from('users').update({ password_hash }).eq('id', req.user.id);
    if (error) throw error;
    await logActivity(req.user.id, 'Change Password', 'User changed their own password.', req.ip);
    back('pw_ok');
  } catch (err) {
    console.error('Change password error:', err);
    back('error');
  }
});

router.post('/api/account/update-profile', authenticateToken, requireRole(STAFF_ROLES), async (req, res) => {
  const back = (k) => res.redirect('/account?msg=' + k);
  try {
    const full_name = tidy(req.body.full_name);
    const username = tidy(req.body.username);
    const email = tidy(req.body.email).toLowerCase();
    if (!full_name || !username || !EMAIL_RE.test(email)) return back('prof_invalid');
    if (!(await bcrypt.compare(String(req.body.current_password || ''), req.user.password_hash))) return back('prof_wrong');
    if ((await identTaken(username, req.user.id)) || (await identTaken(email, req.user.id))) return back('prof_taken');
    const { error } = await supabase.from('users').update({ full_name, username, email }).eq('id', req.user.id);
    if (error) throw error;
    await logActivity(req.user.id, 'Update Account', 'User updated their own name, username or email.', req.ip);
    back('prof_ok');
  } catch (err) {
    console.error('Update account error:', err);
    back('error');
  }
});

module.exports = router;
