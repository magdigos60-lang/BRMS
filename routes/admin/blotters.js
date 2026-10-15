/** Blotter and complaints. */
const express = require('express');
const { supabase } = require('../../config/index');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { getSettings } = require('../../utils/helpers');
const { renderAppLayout } = require('../../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 11: BLOTTER & COMPLAINTS (With Print Capability)
// ==========================================
router.get('/admin/blotters', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: blotters } = await supabase.from('complaints').select('*').order('created_at', { ascending: false });

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3 no-print">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-shield-exclamation me-2"></i>Barangay Blotter & Incident Records</h4>
        <div>
          <button class="btn btn-outline-primary me-2" onclick="window.print()"><i class="bi bi-printer me-1"></i> Print Complaint Files</button>
          <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#addBlotterModal"><i class="bi bi-plus-lg me-1"></i> File Incident Blotter</button>
        </div>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Case No</th>
              <th>Complainant</th>
              <th>Respondent</th>
              <th>Incident Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${(blotters || []).map(b => `
              <tr>
                <td class="fw-bold text-primary-blue">${b.case_number}</td>
                <td>${b.complainant_name}</td>
                <td>${b.respondent_name}</td>
                <td>${b.incident_date}</td>
                <td><span class="badge bg-warning text-dark">${b.status}</span></td>
              </tr>
            `).join('') || '<tr><td colspan="5" class="text-center py-4 text-muted">No blotter cases recorded.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Add Blotter -->
    <div class="modal fade" id="addBlotterModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <form action="/api/admin/blotter/add" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">File Incident / Blotter Report</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="row g-3">
                <div class="col-md-6"><label class="form-label">Complainant Name *</label><input type="text" name="complainant_name" class="form-control" required></div>
                <div class="col-md-6"><label class="form-label">Respondent Name *</label><input type="text" name="respondent_name" class="form-control" required></div>
                <div class="col-md-6"><label class="form-label">Incident Date *</label><input type="date" name="incident_date" class="form-control" required></div>
                <div class="col-md-6"><label class="form-label">Location *</label><input type="text" name="location" class="form-control" required></div>
                <div class="col-12"><label class="form-label">Description of Incident *</label><textarea name="description" class="form-control" rows="3" required></textarea></div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">File Incident Report</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'blotters', html, settings));
});

router.post('/api/admin/blotter/add', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary']), async (req, res) => {
  const { complainant_name, respondent_name, incident_date, location, description } = req.body;
  const case_number = `BLOT-${Date.now().toString().slice(-6)}`;
  await supabase.from('complaints').insert([{ case_number, complainant_name, respondent_name, incident_date, location, description, status: 'INVESTIGATION' }]);
  res.redirect('/admin/blotters');
});

module.exports = router;
