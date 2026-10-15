/** Aid / relief distribution (admin). */
const express = require('express');
const { supabase } = require('../../config/index');
const { authenticateToken, requireRole, logActivity } = require('../../middleware/auth');
const { STAFF_ROLES, AID_MANAGER_ROLES } = require('../../utils/constants');
const { escHtml, getSettings } = require('../../utils/helpers');
const { categoryTags } = require('../../utils/categories');
const { renderAppLayout } = require('../../views/layout');

const router = express.Router();

// ---------- ADMIN: list programs ----------
router.get('/admin/aid', authenticateToken, requireRole(STAFF_ROLES), async (req, res) => {
  const settings = await getSettings();
  const { data: programs } = await supabase.from('aid_programs').select('*').order('created_at', { ascending: false });
  const { data: bens } = await supabase.from('aid_beneficiaries').select('program_id, status');

  const stats = {};
  (bens || []).forEach(b => {
    stats[b.program_id] = stats[b.program_id] || { total: 0, claimed: 0 };
    stats[b.program_id].total++;
    if (b.status === 'Claimed') stats[b.program_id].claimed++;
  });

  const canManage = AID_MANAGER_ROLES.includes(req.user.role);

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-box2-heart me-2"></i>Aid & Relief Distribution</h4>
        ${canManage ? `<button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#addAidModal"><i class="bi bi-plus-lg me-1"></i> New Aid Program</button>` : ''}
      </div>
      <p class="text-muted small">Create an aid program, choose the beneficiaries, and residents will see it in their portal. Claiming is verified by scanning the QR code on the resident's Barangay ID in the <a href="/scanner">QR Scanner</a>.</p>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Aid Program</th>
              <th>Type</th>
              <th>Distribution</th>
              <th>Claimed / Beneficiaries</th>
              <th>Status</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${(programs || []).map(p => {
              const s = stats[p.id] || { total: 0, claimed: 0 };
              return `
                <tr>
                  <td class="fw-bold text-primary-blue">${escHtml(p.title)}</td>
                  <td><span class="badge bg-info text-dark">${escHtml(p.aid_type)}</span></td>
                  <td class="small">${escHtml(p.distribution_date || '-')}<br><span class="text-muted">${escHtml(p.location || '')}</span></td>
                  <td><span class="badge bg-accent-green text-white">${s.claimed} / ${s.total}</span></td>
                  <td><span class="badge ${p.status === 'Open' ? 'bg-success' : 'bg-secondary'}">${escHtml(p.status)}</span></td>
                  <td class="text-end"><a href="/admin/aid/${p.id}" class="btn btn-sm btn-outline-primary"><i class="bi bi-eye"></i> Manage</a></td>
                </tr>`;
            }).join('') || '<tr><td colspan="6" class="text-center py-4 text-muted">No aid programs yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: New Aid Program -->
    <div class="modal fade" id="addAidModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <form action="/api/admin/aid/add" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">New Aid Program</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="row g-3">
                <div class="col-md-8"><label class="form-label">Aid Title *</label><input type="text" name="title" class="form-control" required placeholder="e.g. Rice & Grocery Relief Pack"></div>
                <div class="col-md-4">
                  <label class="form-label">Aid Type *</label>
                  <select name="aid_type" class="form-select" required>
                    <option>Food Pack</option><option>Cash Assistance</option><option>Medical</option><option>Educational</option><option>Livelihood</option><option>Other</option>
                  </select>
                </div>
                <div class="col-md-6"><label class="form-label">Distribution Date</label><input type="date" name="distribution_date" class="form-control"></div>
                <div class="col-md-6"><label class="form-label">Claiming Location</label><input type="text" name="location" class="form-control" placeholder="e.g. Barangay Hall"></div>
                <div class="col-12"><label class="form-label">Description / Claiming Instructions</label><textarea name="description" class="form-control" rows="3" placeholder="e.g. Bring your Barangay ID. The QR code will be scanned at the claiming booth."></textarea></div>
                <div class="col-12">
                  <label class="form-label fw-bold">Who will receive this aid?</label>
                  <div class="border rounded p-3 bg-light">
                    <div class="row g-2">
                      <div class="col-6"><div class="form-check"><input class="form-check-input" type="checkbox" name="group" value="college" id="grpCollege"><label class="form-check-label" for="grpCollege">College Students</label></div></div>
                      <div class="col-6"><div class="form-check"><input class="form-check-input" type="checkbox" name="group" value="head" id="grpHead"><label class="form-check-label" for="grpHead">Household Heads</label></div></div>
                      <div class="col-6"><div class="form-check"><input class="form-check-input" type="checkbox" name="group" value="seniors" id="grpSeniors"><label class="form-check-label" for="grpSeniors">Senior Citizens</label></div></div>
                      <div class="col-6"><div class="form-check"><input class="form-check-input" type="checkbox" name="group" value="pwd" id="grpPwd"><label class="form-check-label" for="grpPwd">PWD</label></div></div>
                      <div class="col-6"><div class="form-check"><input class="form-check-input" type="checkbox" name="group" value="solo" id="grpSolo"><label class="form-check-label" for="grpSolo">Solo Parents</label></div></div>
                      <div class="col-6"><div class="form-check"><input class="form-check-input" type="checkbox" name="group" value="all" id="grpAll"><label class="form-check-label" for="grpAll">All Active Residents</label></div></div>
                    </div>
                    <small class="text-muted d-block mt-2">Tick one or more groups to add them automatically. <strong>Leave all unticked to select residents manually</strong> after creating the program.</small>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">Create Aid Program</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'aid', html, settings));
});

router.post('/api/admin/aid/add', authenticateToken, requireRole(AID_MANAGER_ROLES), async (req, res) => {
  try {
    const { title, aid_type, distribution_date, location, description } = req.body;
    const { data: program, error } = await supabase.from('aid_programs').insert([{
      title, aid_type, distribution_date: distribution_date || null, location, description, status: 'Open', created_by: req.user.id
    }]).select().single();
    if (error) throw error;

    // Checkboxes may arrive as a single value or an array. No selection = manual picking afterwards.
    let groups = req.body.group || [];
    if (!Array.isArray(groups)) groups = [groups];
    const columnFor = { college: 'is_college_student', head: 'is_household_head', seniors: 'is_senior_citizen', pwd: 'is_pwd', solo: 'is_solo_parent' };
    const conditions = groups.filter(g => columnFor[g]).map(g => `${columnFor[g]}.eq.true`);

    if (groups.includes('all') || conditions.length) {
      let q = supabase.from('residents').select('id').eq('resident_status', 'Active');
      if (!groups.includes('all')) q = q.or(conditions.join(','));
      const { data: residents } = await q;
      const rows = (residents || []).map(r => ({ program_id: program.id, resident_id: r.id, status: 'Pending' }));
      if (rows.length) await supabase.from('aid_beneficiaries').insert(rows);
    }

    await logActivity(req.user.id, 'Create Aid Program', `Created aid program: ${title}`);
    res.redirect(`/admin/aid/${program.id}`);
  } catch (err) {
    console.error('Create aid error:', err);
    res.status(500).send('Error creating aid program: ' + err.message);
  }
});

// ---------- ADMIN: manage one program ----------
router.get('/admin/aid/:id', authenticateToken, requireRole(STAFF_ROLES), async (req, res) => {
  const settings = await getSettings();
  const { data: program } = await supabase.from('aid_programs').select('*').eq('id', req.params.id).single();
  if (!program) return res.status(404).send('Aid program not found');

  const { data: bens } = await supabase.from('aid_beneficiaries')
    .select('*, residents(first_name, last_name, resident_number, puroks(name), households(household_name, household_number))')
    .eq('program_id', program.id).order('created_at', { ascending: true });

  const existingIds = new Set((bens || []).map(b => b.resident_id));
  const { data: allResidents } = await supabase.from('residents').select('id, first_name, last_name, resident_number, is_college_student, is_household_head, is_senior_citizen, is_pwd, households(household_name)').eq('resident_status', 'Active').order('last_name', { ascending: true });
  const available = (allResidents || []).filter(r => !existingIds.has(r.id));

  const claimed = (bens || []).filter(b => b.status === 'Claimed').length;
  const canManage = AID_MANAGER_ROLES.includes(req.user.role);

  const html = `
    <div class="card card-custom p-4 mb-3">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div>
          <a href="/admin/aid" class="small text-decoration-none"><i class="bi bi-arrow-left"></i> Back to Aid Programs</a>
          <h4 class="fw-bold text-primary-blue mt-1 mb-1">${escHtml(program.title)}</h4>
          <span class="badge bg-info text-dark">${escHtml(program.aid_type)}</span>
          <span class="badge ${program.status === 'Open' ? 'bg-success' : 'bg-secondary'}">${escHtml(program.status)}</span>
          <p class="text-muted small mt-2 mb-0">${escHtml(program.description || '')}</p>
          <p class="small mt-1 mb-0"><i class="bi bi-calendar3 me-1"></i>${escHtml(program.distribution_date || 'Date to be announced')} &nbsp; <i class="bi bi-geo-alt me-1"></i>${escHtml(program.location || 'Barangay Hall')}</p>
        </div>
        <div class="text-end">
          <h3 class="fw-bold text-accent-green m-0">${claimed} / ${(bens || []).length}</h3>
          <small class="text-muted">claimed</small>
          <div class="mt-2 d-flex gap-2 justify-content-end">
            <a href="/scanner" class="btn btn-sm btn-primary-custom text-white"><i class="bi bi-qr-code-scan me-1"></i> Open Scanner</a>
            ${canManage ? `
              <form action="/api/admin/aid/${program.id}/status" method="POST" class="d-inline">
                <input type="hidden" name="status" value="${program.status === 'Open' ? 'Closed' : 'Open'}">
                <button class="btn btn-sm btn-outline-secondary" onclick="return confirm('${program.status === 'Open' ? 'Close' : 'Reopen'} this aid program?')">${program.status === 'Open' ? 'Close Program' : 'Reopen'}</button>
              </form>` : ''}
          </div>
        </div>
      </div>
    </div>

    ${canManage ? `
    <div class="card card-custom p-4 mb-3 no-print">
      <h6 class="fw-bold text-accent-green mb-2">Add Beneficiaries</h6>
      <form action="/api/admin/aid/${program.id}/beneficiaries" method="POST" class="row g-2">
        <div class="col-md-9">
          <select name="resident_ids" class="form-select" multiple size="5" required>
            ${available.map(r => `<option value="${r.id}">${escHtml(r.last_name)}, ${escHtml(r.first_name)} (${escHtml(r.resident_number)})${r.households && r.households.household_name ? ' - ' + escHtml(r.households.household_name) : ''}${categoryTags(r).length ? ' [' + categoryTags(r).join(', ') + ']' : ''}</option>`).join('')}
          </select>
          <small class="text-muted">Hold Ctrl / Cmd to select multiple residents.</small>
        </div>
        <div class="col-md-3 d-grid align-content-start">
          <button class="btn btn-accent-custom text-white fw-bold" ${available.length ? '' : 'disabled'}><i class="bi bi-person-plus me-1"></i> Add Selected</button>
        </div>
      </form>
    </div>` : ''}

    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h6 class="fw-bold text-primary-blue m-0">Beneficiary List</h6>
        <button class="btn btn-sm btn-outline-primary no-print" onclick="window.print()"><i class="bi bi-printer me-1"></i> Print List</button>
      </div>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr><th>Resident ID</th><th>Name</th><th>Household</th><th>Purok</th><th>Status</th><th>Claimed At</th><th class="text-end no-print">Action</th></tr>
          </thead>
          <tbody>
            ${(bens || []).map(b => `
              <tr>
                <td class="fw-bold text-primary-blue">${b.residents ? escHtml(b.residents.resident_number) : '-'}</td>
                <td>${b.residents ? `${escHtml(b.residents.first_name)} ${escHtml(b.residents.last_name)}` : 'Unknown'}</td>
                <td class="small">${b.residents && b.residents.households ? escHtml(b.residents.households.household_name || b.residents.households.household_number) : '<span class="text-muted">-</span>'}</td>
                <td>${b.residents && b.residents.puroks ? escHtml(b.residents.puroks.name) : '-'}</td>
                <td><span class="badge ${b.status === 'Claimed' ? 'bg-success' : 'bg-warning text-dark'}">${escHtml(b.status)}</span></td>
                <td class="small text-muted">${b.claimed_at ? new Date(b.claimed_at).toLocaleString() : '-'}</td>
                <td class="text-end no-print">
                  ${canManage && b.status !== 'Claimed' ? `
                    <form action="/api/admin/aid/beneficiary/${b.id}/remove" method="POST" class="d-inline" onsubmit="return confirm('Remove this beneficiary?')">
                      <button class="btn btn-sm btn-outline-danger"><i class="bi bi-x-lg"></i></button>
                    </form>` : ''}
                </td>
              </tr>
            `).join('') || '<tr><td colspan="7" class="text-center py-4 text-muted">No beneficiaries yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'aid', html, settings));
});

router.post('/api/admin/aid/:id/beneficiaries', authenticateToken, requireRole(AID_MANAGER_ROLES), async (req, res) => {
  try {
    let ids = req.body.resident_ids || [];
    if (!Array.isArray(ids)) ids = [ids];
    const { data: existing } = await supabase.from('aid_beneficiaries').select('resident_id').eq('program_id', req.params.id);
    const have = new Set((existing || []).map(e => e.resident_id));
    const rows = ids.filter(id => !have.has(id)).map(id => ({ program_id: req.params.id, resident_id: id, status: 'Pending' }));
    if (rows.length) await supabase.from('aid_beneficiaries').insert(rows);
    await logActivity(req.user.id, 'Add Aid Beneficiaries', `Added ${rows.length} beneficiaries to aid program ${req.params.id}`);
    res.redirect(`/admin/aid/${req.params.id}`);
  } catch (err) {
    res.status(500).send('Error adding beneficiaries: ' + err.message);
  }
});

router.post('/api/admin/aid/beneficiary/:id/remove', authenticateToken, requireRole(AID_MANAGER_ROLES), async (req, res) => {
  const { data: ben } = await supabase.from('aid_beneficiaries').select('program_id').eq('id', req.params.id).single();
  await supabase.from('aid_beneficiaries').delete().eq('id', req.params.id).eq('status', 'Pending');
  await logActivity(req.user.id, 'Remove Aid Beneficiary', `Removed beneficiary record ${req.params.id}`);
  res.redirect(ben ? `/admin/aid/${ben.program_id}` : '/admin/aid');
});

router.post('/api/admin/aid/:id/status', authenticateToken, requireRole(AID_MANAGER_ROLES), async (req, res) => {
  const status = req.body.status === 'Closed' ? 'Closed' : 'Open';
  await supabase.from('aid_programs').update({ status }).eq('id', req.params.id);
  await logActivity(req.user.id, 'Update Aid Program', `Set aid program ${req.params.id} to ${status}`);
  res.redirect(`/admin/aid/${req.params.id}`);
});

module.exports = router;
