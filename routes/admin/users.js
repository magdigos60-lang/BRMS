/** System user accounts (create, EDIT, enable/disable, reset password). */
const express = require('express');
const bcrypt = require('bcryptjs');
const { supabase } = require('../../config/index');
const { authenticateToken, requireRole, logActivity } = require('../../middleware/auth');
const { STAFF_ACCOUNT_ROLES } = require('../../utils/constants');
const { escHtml, getSettings, EMAIL_RE, tidy, identTaken, alertBack } = require('../../utils/helpers');
const { renderAppLayout } = require('../../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 16: USER ACCOUNTS & PERMISSIONS (Updated Admin Account Name)
// ==========================================
router.get('/admin/users', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const settings = await getSettings();
  const { data: users } = await supabase.from('users').select('*');

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-person-gear me-2"></i>System Staff & Administrative Accounts</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#addUserModal"><i class="bi bi-person-plus me-1"></i> Create Staff Account</button>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Full Name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${(users || []).map(u => `
              <tr>
                <td class="fw-semibold">${u.full_name}</td>
                <td>${u.username}</td>
                <td>${u.email}</td>
                <td><span class="badge bg-primary-blue text-white">${u.role}</span></td>
                <td><span class="badge ${u.status === 'Active' ? 'bg-success' : 'bg-secondary'}">${u.status}</span></td>
                <td class="text-end">
                  ${(u.role === 'Super Admin' && req.user.role !== 'Super Admin') ? '' : `<button type="button" class="btn btn-sm btn-outline-primary me-1" data-bs-toggle="modal" data-bs-target="#editUserModal" data-id="${u.id}" data-name="${escHtml(u.full_name)}" data-username="${escHtml(u.username)}" data-email="${escHtml(u.email)}" data-role="${escHtml(u.role)}"><i class="bi bi-pencil"></i> Edit</button>`}
                  ${u.status === 'Active' ? `
                    <a href="/api/admin/user/toggle/${u.id}?status=Disabled" class="btn btn-sm btn-outline-danger">Disable</a>
                  ` : `
                    <a href="/api/admin/user/toggle/${u.id}?status=Active" class="btn btn-sm btn-outline-success">Enable</a>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Edit User -->
    <div class="modal fade" id="editUserModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form id="editUserForm" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">Edit Account</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3"><label class="form-label">Full Name *</label><input type="text" name="full_name" id="euName" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Username *</label><input type="text" name="username" id="euUsername" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Email *</label><input type="email" name="email" id="euEmail" class="form-control" required></div>
              <div class="mb-3" id="euRoleWrap">
                <label class="form-label">Role</label>
                <select name="role" id="euRole" class="form-select">
                  <option value="Barangay Admin">Barangay Admin</option>
                  <option value="Barangay Secretary">Barangay Secretary</option>
                  <option value="Barangay Staff">Barangay Staff</option>
                </select>
              </div>
              <div class="mb-1">
                <label class="form-label">New Password <small class="text-muted">(leave blank to keep the current one)</small></label>
                <input type="password" name="new_password" class="form-control" minlength="6" autocomplete="new-password">
              </div>
              <small class="text-muted" id="euNote"></small>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-primary-custom text-white">Save Changes</button>
            </div>
          </form>
        </div>
      </div>
    </div>
    <script>
      document.addEventListener('DOMContentLoaded', function () {
        var modal = document.getElementById('editUserModal');
        modal.addEventListener('show.bs.modal', function (e) {
          var d = e.relatedTarget.dataset;
          var fixed = (d.role === 'Resident');
          document.getElementById('editUserForm').action = '/api/admin/user/' + d.id + '/update';
          document.getElementById('euName').value = d.name;
          document.getElementById('euUsername').value = d.username;
          document.getElementById('euEmail').value = d.email;
          document.getElementById('euName').readOnly = fixed;
          document.getElementById('euUsername').readOnly = fixed;
          document.getElementById('euRole').value = d.role;
          document.getElementById('euRoleWrap').style.display = (fixed || d.role === 'Super Admin') ? 'none' : '';
          document.getElementById('euNote').textContent = fixed ? 'Resident name is edited from the Resident record. You can change the email and reset the password here.' : '';
        });
      });
    </script>

    <!-- Modal Add User -->
    <div class="modal fade" id="addUserModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/admin/user/add" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">Create System Account</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3"><label class="form-label">Full Name *</label><input type="text" name="full_name" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Username *</label><input type="text" name="username" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Email *</label><input type="email" name="email" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Password *</label><input type="password" name="password" class="form-control" required minlength="6"></div>
              <div class="mb-3">
                <label class="form-label">Role *</label>
                <select name="role" class="form-select" required>
                  <option value="Barangay Admin">Barangay Admin</option>
                  <option value="Barangay Secretary">Barangay Secretary</option>
                  <option value="Barangay Staff">Barangay Staff</option>
                </select>
              </div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">Create Account</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'users', html, settings));
});

router.post('/api/admin/user/add', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const { full_name, username, email, password, role } = req.body;
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);
  await supabase.from('users').insert([{ full_name, username, email, password_hash, role, status: 'Active' }]);
  res.redirect('/admin/users');
});

router.get('/api/admin/user/toggle/:id', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const { status } = req.query;
  await supabase.from('users').update({ status }).eq('id', req.params.id);
  res.redirect('/admin/users');
});

// ---------- ADMIN: EDIT ANY SYSTEM ACCOUNT (name, username, email, role, password reset) ----------
router.post('/api/admin/user/:id/update', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  try {
    const { data: target } = await supabase.from('users').select('*').eq('id', req.params.id).maybeSingle();
    if (!target) return res.status(404).send('Account not found');
    if (target.role === 'Super Admin' && req.user.role !== 'Super Admin') {
      return alertBack(res, 'Only a Super Admin can edit a Super Admin account.', 403);
    }
    const isResident = target.role === 'Resident';
    const email = tidy(req.body.email).toLowerCase();
    const full_name = isResident ? target.full_name : tidy(req.body.full_name);
    const username = isResident ? target.username : tidy(req.body.username);
    if (!full_name || !username || !EMAIL_RE.test(email)) return alertBack(res, 'Please enter a name, a username and a valid email address.');
    if (email !== target.email && await identTaken(email, target.id)) return alertBack(res, 'That email is already used by another account.');
    if (username !== target.username && await identTaken(username, target.id)) return alertBack(res, 'That username is already used by another account.');

    const upd = { full_name, username, email };
    if (isResident && email !== target.email && target.username === target.email) upd.username = email;
    if (!isResident && target.role !== 'Super Admin' && STAFF_ACCOUNT_ROLES.includes(req.body.role)) upd.role = req.body.role;
    const newPw = String(req.body.new_password || '');
    if (newPw) {
      if (newPw.length < 6) return alertBack(res, 'The new password must be at least 6 characters.');
      upd.password_hash = await bcrypt.hash(newPw, 10);
    }
    const { error } = await supabase.from('users').update(upd).eq('id', target.id);
    if (error) throw error;
    if (isResident && target.resident_id && email !== target.email) {
      await supabase.from('residents').update({ email }).eq('id', target.resident_id);
    }
    await logActivity(req.user.id, 'Edit Account', `Edited account ${target.username}${newPw ? ' (password reset)' : ''}`, req.ip);
    res.redirect('/admin/users');
  } catch (err) {
    console.error('Edit account error:', err);
    alertBack(res, 'Error saving account: ' + err.message, 500);
  }
});

module.exports = router;
