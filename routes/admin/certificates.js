/** Certificate request approval and issuance. */
const express = require('express');
const { supabase } = require('../../config/index');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { getSettings } = require('../../utils/helpers');
const { renderAppLayout } = require('../../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 7: CERTIFICATE APPROVAL & ISSUANCE
// ==========================================
router.get('/admin/certificates', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: certs } = await supabase.from('certificate_requests').select('*, residents(first_name, last_name, resident_number)').order('created_at', { ascending: false });

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-file-earmark-text me-2"></i>Certificate Request & Issuance Operations</h4>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Request No</th>
              <th>Resident</th>
              <th>Certificate Type</th>
              <th>Purpose</th>
              <th>Status</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${(certs || []).map(c => `
              <tr>
                <td class="fw-bold text-primary-blue">${c.request_number}</td>
                <td>${c.residents ? `${c.residents.first_name} ${c.residents.last_name}` : 'Unknown'}</td>
                <td><span class="badge bg-light text-dark border">${c.certificate_type}</span></td>
                <td>${c.purpose}</td>
                <td>
                  <span class="badge ${c.status === 'RELEASED' ? 'bg-success' : (c.status === 'READY_FOR_RELEASE' ? 'bg-accent-green text-white' : 'bg-warning text-dark')}">
                    ${c.status}
                  </span>
                </td>
                <td class="text-end">
                  ${c.status === 'SUBMITTED' ? `
                    <a href="/api/admin/certificate/update/${c.id}?status=READY_FOR_RELEASE" class="btn btn-sm btn-accent-custom text-white"><i class="bi bi-check-circle"></i> Mark Ready</a>
                  ` : ''}
                  ${c.status === 'READY_FOR_RELEASE' ? `
                    <a href="/api/admin/certificate/update/${c.id}?status=RELEASED" class="btn btn-sm btn-primary-custom text-white"><i class="bi bi-box-arrow-up-right"></i> Release Document</a>
                  ` : ''}
                </td>
              </tr>
            `).join('') || '<tr><td colspan="6" class="text-center py-4 text-muted">No certificate requests submitted.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'certificates', html, settings));
});

router.get('/api/admin/certificate/update/:id', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const { status } = req.query;
  await supabase.from('certificate_requests').update({ status, updated_at: new Date() }).eq('id', req.params.id);
  res.redirect('/admin/certificates');
});

module.exports = router;
