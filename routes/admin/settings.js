/** System settings. */
const express = require('express');
const { supabase, upload } = require('../../config/index');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { getSettings } = require('../../utils/helpers');
const { renderAppLayout } = require('../../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 19: SYSTEM SETTINGS (With Editable Emergency Number)
// ==========================================
router.get('/admin/settings', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const settings = await getSettings();

  const html = `
    <div class="card card-custom p-4" style="max-width: 800px; margin: auto;">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-sliders me-2"></i>Barangay System Configuration</h4>

      <form action="/api/admin/settings/update" method="POST" enctype="multipart/form-data">
        <div class="mb-3">
          <label class="form-label">Barangay Name</label>
          <input type="text" name="barangay_name" class="form-control" value="${settings.barangay_name || ''}" required>
        </div>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label class="form-label">Municipality / City</label>
            <input type="text" name="municipality" class="form-control" value="${settings.municipality || ''}" required>
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">Province</label>
            <input type="text" name="province" class="form-control" value="${settings.province || ''}" required>
          </div>
        </div>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label class="form-label">Barangay Captain Name</label>
            <input type="text" name="barangay_captain" class="form-control" value="${settings.barangay_captain || ''}">
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">Emergency Hotline Number</label>
            <input type="text" name="contact_number" class="form-control" value="${settings.contact_number || ''}" placeholder="e.g. 09123456789 / 911">
          </div>
        </div>

        <h6 class="fw-bold text-accent-green mt-4 border-bottom pb-2">Branding Assets Upload</h6>
        <div class="mb-3">
          <label class="form-label">Barangay Logo</label>
          ${settings.barangay_logo ? `<img src="${settings.barangay_logo}" class="d-block mb-2 rounded-circle" style="width:70px; height:70px; object-fit:cover;">` : ''}
          <input type="file" name="logo" class="form-control" accept="image/*">
        </div>
        <div class="mb-3">
          <label class="form-label">Barangay Captain Digital Signature</label>
          ${settings.captain_signature ? `<img src="${settings.captain_signature}" class="d-block mb-2" style="height:35px; object-fit:contain;">` : ''}
          <input type="file" name="signature" class="form-control" accept="image/*">
        </div>

        <button type="submit" class="btn btn-primary-custom py-2 px-4 mt-3 fw-bold text-white">Save System Settings</button>
      </form>
    </div>
  `;

  res.send(renderAppLayout(req, 'settings', html, settings));
});

router.post('/api/admin/settings/update', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), upload.fields([{ name: 'logo' }, { name: 'signature' }]), async (req, res) => {
  const { barangay_name, municipality, province, barangay_captain, contact_number } = req.body;
  const settings = await getSettings();

  const updateData = { barangay_name, municipality, province, barangay_captain, contact_number, updated_at: new Date() };

  if (req.files && req.files['logo']) {
    const logoFile = req.files['logo'][0];
    updateData.barangay_logo = `data:${logoFile.mimetype};base64,${logoFile.buffer.toString('base64')}`;
  }

  if (req.files && req.files['signature']) {
    const sigFile = req.files['signature'][0];
    updateData.captain_signature = `data:${sigFile.mimetype};base64,${sigFile.buffer.toString('base64')}`;
  }

  await supabase.from('system_settings').update(updateData).eq('id', settings.id);
  res.redirect('/admin/settings');
});

module.exports = router;
