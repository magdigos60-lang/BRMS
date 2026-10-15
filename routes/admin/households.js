/** Household management. */
const express = require('express');
const { supabase } = require('../../config/index');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { escHtml, getSettings } = require('../../utils/helpers');
const { renderAppLayout } = require('../../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 6: HOUSEHOLD MANAGEMENT
// ==========================================
router.get('/admin/households', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: households } = await supabase.from('households').select('*, puroks(name)');
  const { data: puroks } = await supabase.from('puroks').select('*');
  const { data: members } = await supabase.from('residents')
    .select('id, first_name, last_name, resident_number, resident_status, household_id')
    .not('household_id', 'is', null).order('last_name', { ascending: true });

  const byHousehold = {};
  (members || []).forEach(m => { (byHousehold[m.household_id] = byHousehold[m.household_id] || []).push(m); });

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-house-door me-2"></i>Household Records</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#addHouseholdModal"><i class="bi bi-plus-lg me-1"></i> Register Household</button>
      </div>
      <p class="small text-muted">Click a household to see its members. Aid is released once per household.</p>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Household No</th>
              <th>Household Name</th>
              <th>Head of Household</th>
              <th>Purok Zone</th>
              <th>Address</th>
              <th>Members</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${(households || []).map(h => {
              const mem = byHousehold[h.id] || [];
              return `
              <tr style="cursor:pointer" data-bs-toggle="collapse" data-bs-target="#hhMembers${h.id}" aria-expanded="false">
                <td class="fw-bold text-primary-blue">${escHtml(h.household_number)}</td>
                <td class="fw-semibold">${escHtml(h.household_name || '-')}</td>
                <td>${escHtml(h.head_resident_name || '-')}</td>
                <td>${h.puroks ? escHtml(h.puroks.name) : '-'}</td>
                <td>${escHtml(h.address || '-')}</td>
                <td><span class="badge bg-primary"><i class="bi bi-people me-1"></i>${mem.length}</span></td>
                <td><span class="badge bg-success">${escHtml(h.status || 'Active')}</span></td>
              </tr>
              <tr class="collapse" id="hhMembers${h.id}">
                <td colspan="7" class="bg-light">
                  ${mem.length ? `
                    <div class="small fw-bold text-accent-green mb-1">Members of ${escHtml(h.household_name || h.household_number)}</div>
                    <ul class="list-unstyled mb-0 small">
                      ${mem.map(m => `<li class="py-1"><i class="bi bi-person me-1"></i>${escHtml(m.last_name)}, ${escHtml(m.first_name)} <span class="text-muted">(${escHtml(m.resident_number)})</span> <span class="badge ${m.resident_status === 'Active' ? 'bg-success' : 'bg-warning text-dark'}">${escHtml(m.resident_status)}</span></li>`).join('')}
                    </ul>` : '<span class="small text-muted">No residents are linked to this household yet.</span>'}
                </td>
              </tr>`;
            }).join('') || '<tr><td colspan="7" class="text-center py-4 text-muted">No household records registered.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Add Household -->
    <div class="modal fade" id="addHouseholdModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/admin/household/add" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">Register New Household</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3"><label class="form-label">Household Name *</label><input type="text" name="household_name" class="form-control" required maxlength="100" placeholder="e.g. Dela Cruz Family"></div>
              <div class="mb-3"><label class="form-label">Head of Household Name *</label><input type="text" name="head_resident_name" class="form-control" required></div>
              <div class="mb-3">
                <label class="form-label">Purok Zone *</label>
                <select name="purok_id" class="form-select">${(puroks || []).map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}</select>
              </div>
              <div class="mb-3"><label class="form-label">Address *</label><input type="text" name="address" class="form-control" required></div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">Save Household</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'households', html, settings));
});

router.post('/api/admin/household/add', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary']), async (req, res) => {
  const { head_resident_name, purok_id, address } = req.body;
  const household_name = (req.body.household_name || '').replace(/\s+/g, ' ').trim();
  if (!household_name) return res.status(400).send('<script>alert("Household name is required."); window.history.back();</script>');
  const likeName = household_name.replace(/[\\%_]/g, m => '\\' + m);
  const { data: dup } = await supabase.from('households').select('id').ilike('household_name', likeName).limit(1).maybeSingle();
  if (dup) return res.status(400).send('<script>alert("A household with that name already exists."); window.history.back();</script>');
  const household_number = `HH-${Date.now().toString().slice(-6)}`;
  await supabase.from('households').insert([{ household_number, household_name, head_resident_name, purok_id, address }]);
  res.redirect('/admin/households');
});

module.exports = router;
