/** Purok management. */
const express = require('express');
const { supabase } = require('../../config/index');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { getSettings } = require('../../utils/helpers');
const { renderAppLayout } = require('../../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 5: PUROK MANAGEMENT
// ==========================================
router.get('/admin/puroks', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: puroks } = await supabase.from('puroks').select('*');
  const { data: residents } = await supabase.from('residents').select('purok_id').eq('resident_status', 'Active');

  const purokCounts = {};
  (residents || []).forEach(r => {
    if (r.purok_id) purokCounts[r.purok_id] = (purokCounts[r.purok_id] || 0) + 1;
  });

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-geo-alt me-2"></i>Purok Directory & Demographics</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#addPurokModal"><i class="bi bi-plus-circle me-1"></i> Add New Purok</button>
      </div>

      <div class="row g-3 mt-2">
        ${(puroks || []).map(p => `
          <div class="col-md-4">
            <div class="card card-custom p-3 border-top border-4 border-primary">
              <h5 class="fw-bold text-primary-blue">${p.name}</h5>
              <p class="text-muted small mb-2">${p.description || 'Barangay Territorial Zone'}</p>
              <div class="d-flex justify-content-between align-items-center bg-light-green p-2 rounded">
                <span class="fw-bold">Active Residents:</span>
                <span class="badge bg-accent-green fs-6 text-white">${purokCounts[p.id] || 0}</span>
              </div>
            </div>
          </div>
        `).join('') || '<div class="col-12 text-center text-muted">No purok records available.</div>'}
      </div>
    </div>

    <!-- Modal Add Purok -->
    <div class="modal fade" id="addPurokModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/admin/purok/add" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">Add Purok Zone</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3"><label class="form-label">Purok Name *</label><input type="text" name="name" class="form-control" required placeholder="e.g. Purok 4"></div>
              <div class="mb-3"><label class="form-label">Description</label><textarea name="description" class="form-control"></textarea></div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">Save Purok</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'puroks', html, settings));
});

router.post('/api/admin/purok/add', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const { name, description } = req.body;
  await supabase.from('puroks').insert([{ name, description }]);
  res.redirect('/admin/puroks');
});

module.exports = router;
