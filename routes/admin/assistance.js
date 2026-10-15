/** Assistance requests. */
const express = require('express');
const { supabase } = require('../../config/index');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { getSettings } = require('../../utils/helpers');
const { renderAppLayout } = require('../../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 12: ASSISTANCE REQUESTS
// ==========================================
router.get('/admin/assistance', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: requests } = await supabase.from('assistance_requests').select('*, residents(first_name, last_name)').order('created_at', { ascending: false });

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-hand-thumbs-up me-2"></i>Barangay Assistance Applications</h4>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Request No</th>
              <th>Resident</th>
              <th>Type</th>
              <th>Details</th>
              <th>Status</th>
              <th class="text-end">Action</th>
            </tr>
          </thead>
          <tbody>
            ${(requests || []).map(r => `
              <tr>
                <td class="fw-bold text-primary-blue">${r.request_number}</td>
                <td>${r.residents ? `${r.residents.first_name} ${r.residents.last_name}` : 'Unknown'}</td>
                <td><span class="badge bg-info text-dark">${r.assistance_type}</span></td>
                <td>${r.details}</td>
                <td><span class="badge bg-warning text-dark">${r.status}</span></td>
                <td class="text-end">
                  ${r.status === 'PENDING' ? `
                    <a href="/api/admin/assistance/approve/${r.id}" class="btn btn-sm btn-success">Approve</a>
                  ` : ''}
                </td>
              </tr>
            `).join('') || '<tr><td colspan="6" class="text-center py-4 text-muted">No assistance requests submitted.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'assistance', html, settings));
});

router.get('/api/admin/assistance/approve/:id', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  await supabase.from('assistance_requests').update({ status: 'APPROVED' }).eq('id', req.params.id);
  res.redirect('/admin/assistance');
});

module.exports = router;
