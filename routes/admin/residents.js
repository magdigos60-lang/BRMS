/** Resident management: list, add, approve, archive, view, EDIT, photo, categories. */
const express = require('express');
const { supabase, upload } = require('../../config/index');
const { authenticateToken, requireRole, logActivity } = require('../../middleware/auth');
const { RESIDENT_EDIT_ROLES } = require('../../utils/constants');
const { escHtml, getSettings, EMAIL_RE, tidy, identTaken, alertBack } = require('../../utils/helpers');
const { categoryFlags, categoryTags, renderCategoryCheckboxes } = require('../../utils/categories');
const { renderAppLayout } = require('../../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 4: RESIDENT MANAGEMENT (ADMIN)
// ==========================================
router.get('/admin/residents', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const search = req.query.search || '';
  const filter = req.query.filter || 'Active';

  let query = supabase.from('residents').select('*, puroks(name)').order('created_at', { ascending: false });

  if (filter !== 'All') {
    query = query.eq('resident_status', filter);
  }

  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,resident_number.ilike.%${search}%`);
  }

  const { data: residents } = await query;
  const { data: puroks } = await supabase.from('puroks').select('*');

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-people me-2"></i>Resident Directory Management</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#addResidentModal"><i class="bi bi-person-plus me-1"></i> Add New Resident</button>
      </div>

      <form class="row g-2 mb-4" method="GET" action="/admin/residents">
        <div class="col-md-5">
          <input type="text" name="search" class="form-control" placeholder="Search by Name or Resident ID..." value="${search}">
        </div>
        <div class="col-md-3">
          <select name="filter" class="form-select" onchange="this.form.submit()">
            <option value="Active" ${filter === 'Active' ? 'selected' : ''}>Active Residents</option>
            <option value="Pending" ${filter === 'Pending' ? 'selected' : ''}>Pending Registrations</option>
            <option value="Archived" ${filter === 'Archived' ? 'selected' : ''}>Archived Residents</option>
            <option value="All" ${filter === 'All' ? 'selected' : ''}>All Records</option>
          </select>
        </div>
        <div class="col-md-2">
          <button type="submit" class="btn btn-primary-custom w-100 text-white">Search</button>
        </div>
      </form>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Resident ID</th>
              <th>Full Name</th>
              <th>Purok</th>
              <th>Gender / Age</th>
              <th>Status</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${(residents || []).map(r => {
              const age = new Date().getFullYear() - new Date(r.date_of_birth).getFullYear();
              return `
                <tr>
                  <td class="fw-bold text-primary-blue">${r.resident_number}</td>
                  <td>
                    ${r.photo_url ? `<img src="${r.photo_url}" class="rounded-circle me-2" style="width:30px; height:30px; object-fit:cover;">` : ''}
                    ${r.first_name} ${r.middle_name || ''} ${r.last_name} ${r.suffix || ''}
                  </td>
                  <td>${r.puroks ? r.puroks.name : '-'}</td>
                  <td>${r.gender} (${age} yrs)</td>
                  <td>
                    <span class="badge ${r.resident_status === 'Active' ? 'bg-success' : (r.resident_status === 'Pending' ? 'bg-warning text-dark' : 'bg-secondary')}">
                      ${r.resident_status}
                    </span>
                  </td>
                  <td class="text-end">
                    ${r.resident_status === 'Pending' ? `
                      <a href="/api/admin/resident/approve/${r.id}" class="btn btn-sm btn-success"><i class="bi bi-check-lg"></i> Approve</a>
                      <a href="/api/admin/resident/reject/${r.id}" class="btn btn-sm btn-danger"><i class="bi bi-x-lg"></i> Reject</a>
                    ` : `
                      <a href="/admin/resident/view/${r.id}" class="btn btn-sm btn-outline-primary"><i class="bi bi-eye"></i> View</a>
                      ${['Super Admin', 'Barangay Admin', 'Barangay Secretary'].includes(req.user.role) ? `<a href="/admin/resident/edit/${r.id}" class="btn btn-sm btn-outline-success"><i class="bi bi-pencil"></i> Edit</a>` : ''}
                      ${r.resident_status === 'Active' ? `<a href="/api/admin/resident/archive/${r.id}" class="btn btn-sm btn-outline-secondary" onclick="return confirm('Archive this resident record?')"><i class="bi bi-archive"></i></a>` : ''}
                    `}
                  </td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="6" class="text-center py-4 text-muted">No resident records found. Register or approve your first resident to get started.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: Add Resident -->
    <div class="modal fade" id="addResidentModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <form action="/api/admin/resident/add" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">Add Resident Record</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="row g-3">
                <div class="col-md-4"><label class="form-label">First Name *</label><input type="text" name="first_name" class="form-control" required></div>
                <div class="col-md-4"><label class="form-label">Middle Name</label><input type="text" name="middle_name" class="form-control"></div>
                <div class="col-md-4"><label class="form-label">Last Name *</label><input type="text" name="last_name" class="form-control" required></div>
                <div class="col-md-4"><label class="form-label">Date of Birth *</label><input type="date" name="date_of_birth" class="form-control" required></div>
                <div class="col-md-4">
                  <label class="form-label">Gender *</label>
                  <select name="gender" class="form-select"><option value="Male">Male</option><option value="Female">Female</option></select>
                </div>
                <div class="col-md-4">
                  <label class="form-label">Civil Status *</label>
                  <select name="civil_status" class="form-select"><option value="Single">Single</option><option value="Married">Married</option><option value="Widowed">Widowed</option></select>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Purok *</label>
                  <select name="purok_id" class="form-select">${(puroks || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
                </div>
                <div class="col-md-6"><label class="form-label">Address *</label><input type="text" name="address" class="form-control" required></div>
                <div class="col-md-6"><label class="form-label">Contact Number</label><input type="text" name="contact_number" class="form-control"></div>
                <div class="col-md-6"><label class="form-label">Email</label><input type="email" name="email" class="form-control"></div>
                <div class="col-12">
                  <label class="form-label fw-bold">Resident Category</label>
                  ${renderCategoryCheckboxes({}, 'addCat')}
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
              <button type="submit" class="btn btn-primary-custom text-white">Save Resident Record</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'residents', html, settings));
});

// Admin API Actions: Resident
router.post('/api/admin/resident/add', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary']), async (req, res) => {
  const { first_name, middle_name, last_name, date_of_birth, gender, civil_status, purok_id, address, contact_number, email } = req.body;
  try {
    const year = new Date().getFullYear();
    const countRes = await supabase.from('residents').select('id', { count: 'exact' });
    const sequenceNum = String((countRes.count || 0) + 1).padStart(6, '0');
    const resident_number = `BRGY-${year}-${sequenceNum}`;

    const dob = new Date(date_of_birth);
    const age = new Date().getFullYear() - dob.getFullYear();

    await supabase.from('residents').insert([{
      resident_number, first_name, middle_name, last_name, date_of_birth, gender,
      civil_status, purok_id, address, contact_number, email, resident_status: 'Active',
      ...categoryFlags(req.body),
      is_senior_citizen: age >= 60 || !!req.body.cat_senior
    }]);

    await logActivity(req.user.id, 'Add Resident', `Added new resident record: ${first_name} ${last_name}`);
    res.redirect('/admin/residents');
  } catch (err) {
    res.status(500).send('Error adding resident: ' + err.message);
  }
});

router.get('/api/admin/resident/approve/:id', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary']), async (req, res) => {
  try {
    await supabase.from('residents').update({ resident_status: 'Active' }).eq('id', req.params.id);
    await supabase.from('users').update({ status: 'Active' }).eq('resident_id', req.params.id);
    await logActivity(req.user.id, 'Approve Resident', `Approved resident ID: ${req.params.id}`);
    res.redirect('/admin/residents?filter=Pending');
  } catch (err) {
    res.status(500).send('Error approving resident.');
  }
});

router.get('/api/admin/resident/archive/:id', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  try {
    await supabase.from('residents').update({ resident_status: 'Archived' }).eq('id', req.params.id);
    await logActivity(req.user.id, 'Archive Resident', `Archived resident ID: ${req.params.id}`);
    res.redirect('/admin/residents');
  } catch (err) {
    res.status(500).send('Error archiving resident.');
  }
});

// View Resident Record Details
router.get('/admin/resident/view/:id', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: resident } = await supabase.from('residents').select('*, puroks(name), households(household_number)').eq('id', req.params.id).single();
  if (!resident) return res.status(404).send('Resident not found');

  const { data: certs } = await supabase.from('certificate_requests').select('*').eq('resident_id', resident.id);

  const html = `
    <div class="row g-4">
      <div class="col-md-4">
        <div class="card card-custom p-4 text-center">
          <img src="${resident.photo_url || 'https://via.placeholder.com/150'}" class="rounded-circle mx-auto mb-3" style="width: 140px; height: 140px; object-fit: cover; border: 3px solid #205493;">
          <h5 class="fw-bold m-0">${resident.first_name} ${resident.last_name}</h5>
          <span class="text-primary-blue fw-bold">${resident.resident_number}</span>
          <p class="text-muted small">${resident.puroks ? resident.puroks.name : 'No Purok'}</p>
          ${['Super Admin', 'Barangay Admin', 'Barangay Secretary'].includes(req.user.role) ? `<a href="/admin/resident/edit/${resident.id}" class="btn btn-sm btn-accent-custom text-white"><i class="bi bi-pencil-square me-1"></i> Edit Information</a>` : ''}

          <form action="/api/admin/resident/upload-photo/${resident.id}" method="POST" enctype="multipart/form-data" class="mt-3">
            <label class="form-label small fw-bold">Update Resident Photo</label>
            <input type="file" name="photo" class="form-control form-control-sm mb-2" accept="image/*" required>
            <button type="submit" class="btn btn-sm btn-primary-custom w-100 text-white">Upload & Save Photo</button>
          </form>
        </div>
      </div>

      <div class="col-md-8">
        <div class="card card-custom p-4">
          <h5 class="fw-bold text-primary-blue mb-3">Official Record Information</h5>
          <div class="row g-3">
            <div class="col-6"><strong>Date of Birth:</strong> ${resident.date_of_birth}</div>
            <div class="col-6"><strong>Gender:</strong> ${resident.gender}</div>
            <div class="col-6"><strong>Civil Status:</strong> ${resident.civil_status}</div>
            <div class="col-6"><strong>Occupation:</strong> ${resident.occupation || 'N/A'}</div>
            <div class="col-6"><strong>Contact:</strong> ${resident.contact_number}</div>
            <div class="col-6"><strong>Email:</strong> ${resident.email || 'N/A'}</div>
            <div class="col-12"><strong>Address:</strong> ${resident.address}</div>
            <div class="col-4"><strong>Solo Parent:</strong> ${resident.is_solo_parent ? 'Yes' : 'No'}</div>
            <div class="col-8"><strong>Household:</strong> ${resident.households ? escHtml(resident.households.household_name || resident.households.household_number) : 'Not linked'}</div>
          </div>

          <hr class="my-4">
          <h6 class="fw-bold text-accent-green mb-2">Resident Category</h6>
          <p class="small text-muted mb-2">Current: ${categoryTags(resident).length ? categoryTags(resident).map(t => `<span class="badge bg-info text-dark me-1">${t}</span>`).join('') : 'None'}</p>
          <form action="/api/admin/resident/${resident.id}/categories" method="POST">
            ${renderCategoryCheckboxes(resident, 'viewCat')}
            <button type="submit" class="btn btn-sm btn-primary-custom text-white mt-3"><i class="bi bi-check2 me-1"></i> Save Categories</button>
          </form>

          <hr class="my-4">
          <h6 class="fw-bold text-accent-green mb-2">Issued Certificates History</h6>
          <ul class="list-group list-group-flush mb-3">
            ${(certs || []).map(c => `<li class="list-group-item d-flex justify-content-between"><span>${c.certificate_type} (${c.request_number})</span> <span class="badge bg-primary-blue text-white">${c.status}</span></li>`).join('') || '<li class="list-group-item text-muted">No certificate history.</li>'}
          </ul>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'residents', html, settings));
});

router.post('/api/admin/resident/:id/categories', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary']), async (req, res) => {
  try {
    await supabase.from('residents').update(categoryFlags(req.body)).eq('id', req.params.id);
    await logActivity(req.user.id, 'Update Resident Category', `Updated categories for resident ID: ${req.params.id}`);
  } catch (err) {
    console.error('Update categories error:', err);
  }
  res.redirect(`/admin/resident/view/${req.params.id}`);
});

router.post('/api/admin/resident/upload-photo/:id', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No photo uploaded.');
    const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    await supabase.from('residents').update({ photo_url: base64Data }).eq('id', req.params.id);
    await logActivity(req.user.id, 'Update Resident Photo', `Updated photo for resident ID ${req.params.id}`);
    res.redirect(`/admin/resident/view/${req.params.id}`);
  } catch (err) {
    res.status(500).send('Error uploading photo: ' + err.message);
  }
});

// ---------- ADMIN: EDIT RESIDENT RECORD ----------
router.get('/admin/resident/edit/:id', authenticateToken, requireRole(RESIDENT_EDIT_ROLES), async (req, res) => {
  const settings = await getSettings();
  const { data: r } = await supabase.from('residents').select('*').eq('id', req.params.id).maybeSingle();
  if (!r) return res.status(404).send('Resident not found');
  const { data: puroks } = await supabase.from('puroks').select('*');
  const { data: households } = await supabase.from('households').select('id, household_name, household_number').order('household_name');

  const opts = (list, cur) => [...new Set([...list, cur].filter(Boolean))]
    .map(o => `<option value="${escHtml(o)}" ${o === cur ? 'selected' : ''}>${escHtml(o)}</option>`).join('');
  const txt = (name, label, val, extra = '') => `<div class="col-md-4"><label class="form-label">${label}</label><input type="text" name="${name}" class="form-control" value="${escHtml(val)}" ${extra}></div>`;

  const html = `
    <div class="card card-custom p-4" style="max-width: 900px; margin: auto;">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-pencil-square me-2"></i>Edit Resident Record</h4>
        <span class="badge bg-accent-green text-white">${escHtml(r.resident_number)}</span>
      </div>
      <form action="/api/admin/resident/${r.id}/update" method="POST">
        <h6 class="fw-bold text-accent-green border-bottom pb-2 mb-3">Personal Information</h6>
        <div class="row g-3 mb-3">
          ${txt('first_name', 'First Name *', r.first_name, 'required')}
          ${txt('middle_name', 'Middle Name', r.middle_name)}
          ${txt('last_name', 'Last Name *', r.last_name, 'required')}
          ${txt('suffix', 'Suffix', r.suffix)}
          <div class="col-md-4"><label class="form-label">Date of Birth *</label><input type="date" name="date_of_birth" class="form-control" required value="${escHtml(String(r.date_of_birth || '').slice(0, 10))}"></div>
          <div class="col-md-2"><label class="form-label">Gender *</label><select name="gender" class="form-select">${opts(['Male', 'Female'], r.gender)}</select></div>
          <div class="col-md-2"><label class="form-label">Civil Status *</label><select name="civil_status" class="form-select">${opts(['Single', 'Married', 'Widowed', 'Separated'], r.civil_status)}</select></div>
        </div>

        <h6 class="fw-bold text-accent-green border-bottom pb-2 mb-3">Address, Contact & Household</h6>
        <div class="row g-3 mb-3">
          <div class="col-md-6"><label class="form-label">Purok</label>
            <select name="purok_id" class="form-select"><option value="">- None -</option>${(puroks || []).map(p => `<option value="${p.id}" ${String(p.id) === String(r.purok_id) ? 'selected' : ''}>${escHtml(p.name)}</option>`).join('')}</select></div>
          <div class="col-md-6"><label class="form-label">Household</label>
            <select name="household_id" class="form-select"><option value="">- Not linked -</option>${(households || []).map(h => `<option value="${h.id}" ${String(h.id) === String(r.household_id) ? 'selected' : ''}>${escHtml(h.household_name || h.household_number)}</option>`).join('')}</select></div>
          <div class="col-12"><label class="form-label">Complete Address *</label><input type="text" name="address" class="form-control" required value="${escHtml(r.address)}"></div>
          <div class="col-md-4"><label class="form-label">Contact Number</label><input type="text" name="contact_number" class="form-control" value="${escHtml(r.contact_number)}"></div>
          <div class="col-md-4"><label class="form-label">Occupation</label><input type="text" name="occupation" class="form-control" value="${escHtml(r.occupation)}"></div>
          <div class="col-md-4"><label class="form-label">Email <small class="text-muted">(also the resident's login)</small></label><input type="email" name="email" class="form-control" value="${escHtml(r.email)}"></div>
        </div>

        <h6 class="fw-bold text-accent-green border-bottom pb-2 mb-3">Categories</h6>
        <div class="mb-2">${renderCategoryCheckboxes(r, 'editCat')}</div>
        <div class="form-check mb-4"><input class="form-check-input" type="checkbox" name="is_solo_parent" id="editSolo" ${r.is_solo_parent ? 'checked' : ''}><label class="form-check-label" for="editSolo">Solo Parent</label></div>

        <div class="d-flex gap-2">
          <button type="submit" class="btn btn-primary-custom text-white fw-bold"><i class="bi bi-check2 me-1"></i> Save Changes</button>
          <a href="/admin/resident/view/${r.id}" class="btn btn-outline-secondary">Cancel</a>
        </div>
      </form>
    </div>`;
  res.send(renderAppLayout(req, 'residents', html, settings));
});

router.post('/api/admin/resident/:id/update', authenticateToken, requireRole(RESIDENT_EDIT_ROLES), async (req, res) => {
  try {
    const b = req.body;
    const first_name = tidy(b.first_name), last_name = tidy(b.last_name);
    const date_of_birth = tidy(b.date_of_birth), address = tidy(b.address);
    const email = tidy(b.email).toLowerCase();
    if (!first_name || !last_name || !date_of_birth || !address) return alertBack(res, 'Please fill in all required fields.');
    if (email && !EMAIL_RE.test(email)) return alertBack(res, 'Please enter a valid email address.');

    const { data: existing } = await supabase.from('residents').select('id').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).send('Resident not found');
    const { data: linked } = await supabase.from('users').select('id, username, email').eq('resident_id', req.params.id).maybeSingle();
    if (email && (!linked || email !== linked.email) && await identTaken(email, linked ? linked.id : null)) {
      return alertBack(res, 'That email is already used by another account.');
    }

    const age = new Date().getFullYear() - new Date(date_of_birth).getFullYear();
    const { error } = await supabase.from('residents').update({
      first_name, middle_name: tidy(b.middle_name), last_name, suffix: tidy(b.suffix),
      date_of_birth, gender: b.gender || 'Male', civil_status: b.civil_status || 'Single',
      purok_id: b.purok_id || null, household_id: b.household_id || null,
      address, contact_number: tidy(b.contact_number), occupation: tidy(b.occupation), email,
      is_solo_parent: !!b.is_solo_parent,
      ...categoryFlags(b),
      is_senior_citizen: age >= 60 || !!b.cat_senior
    }).eq('id', req.params.id);
    if (error) throw error;

    // Keep the resident's login account in step with the record
    if (linked) {
      const upd = { full_name: `${first_name} ${last_name}` };
      if (email && email !== linked.email) {
        upd.email = email;
        if (linked.username === linked.email) upd.username = email;
      }
      await supabase.from('users').update(upd).eq('id', linked.id);
    }

    await logActivity(req.user.id, 'Edit Resident', `Edited resident record: ${first_name} ${last_name} (ID ${req.params.id})`, req.ip);
    res.redirect(`/admin/resident/view/${req.params.id}`);
  } catch (err) {
    console.error('Edit resident error:', err);
    alertBack(res, 'Error saving changes: ' + err.message, 500);
  }
});

module.exports = router;
