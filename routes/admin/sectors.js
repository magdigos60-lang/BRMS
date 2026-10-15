/** Senior citizens, PWD and solo parents lists. */
const express = require('express');
const { supabase } = require('../../config/index');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { getSettings } = require('../../utils/helpers');
const { renderAppLayout } = require('../../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 10: SENIOR CITIZENS, PWD & SOLO PARENTS
// ==========================================
router.get('/admin/seniors', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: seniors } = await supabase.from('residents').select('*, puroks(name)').eq('is_senior_citizen', true).eq('resident_status', 'Active');

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-person-heart me-2"></i>Senior Citizens Sector Directory</h4>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Resident ID</th>
              <th>Full Name</th>
              <th>Age</th>
              <th>Purok Zone</th>
              <th>Contact Number</th>
            </tr>
          </thead>
          <tbody>
            ${(seniors || []).map(s => {
              const age = new Date().getFullYear() - new Date(s.date_of_birth).getFullYear();
              return `
                <tr>
                  <td class="fw-bold text-primary-blue">${s.resident_number}</td>
                  <td class="fw-semibold">${s.first_name} ${s.last_name}</td>
                  <td><span class="badge bg-accent-green text-white">${age} yrs old</span></td>
                  <td>${s.puroks ? s.puroks.name : '-'}</td>
                  <td>${s.contact_number || '-'}</td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="5" class="text-center py-4 text-muted">No senior citizens registered.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'seniors', html, settings));
});

router.get('/admin/pwds', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: pwds } = await supabase.from('residents').select('*, puroks(name)').eq('is_pwd', true).eq('resident_status', 'Active');

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-universal-access me-2"></i>Persons with Disability (PWD) Directory</h4>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Resident ID</th>
              <th>Full Name</th>
              <th>Disability Details</th>
              <th>Purok Zone</th>
            </tr>
          </thead>
          <tbody>
            ${(pwds || []).map(p => `
              <tr>
                <td class="fw-bold text-primary-blue">${p.resident_number}</td>
                <td class="fw-semibold">${p.first_name} ${p.last_name}</td>
                <td>${p.disability_details || 'Unspecified'}</td>
                <td>${p.puroks ? p.puroks.name : '-'}</td>
              </tr>
            `).join('') || '<tr><td colspan="4" class="text-center py-4 text-muted">No PWD records registered.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'pwds', html, settings));
});

router.get('/admin/solo-parents', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: parents } = await supabase.from('residents').select('*, puroks(name)').eq('is_solo_parent', true).eq('resident_status', 'Active');

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-person-badge me-2"></i>Solo Parents Directory</h4>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Resident ID</th>
              <th>Full Name</th>
              <th>Details</th>
              <th>Purok Zone</th>
            </tr>
          </thead>
          <tbody>
            ${(parents || []).map(p => `
              <tr>
                <td class="fw-bold text-primary-blue">${p.resident_number}</td>
                <td class="fw-semibold">${p.first_name} ${p.last_name}</td>
                <td>${p.solo_parent_details || 'N/A'}</td>
                <td>${p.puroks ? p.puroks.name : '-'}</td>
              </tr>
            `).join('') || '<tr><td colspan="4" class="text-center py-4 text-muted">No solo parent records registered.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'soloparents', html, settings));
});

module.exports = router;
