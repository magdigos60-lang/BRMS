/** Barangay officials. */
const express = require('express');
const { supabase, upload } = require('../../config/index');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { getSettings } = require('../../utils/helpers');
const { renderAppLayout } = require('../../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 15: BARANGAY OFFICIALS MANAGEMENT
// ==========================================
router.get('/admin/officials', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary']), async (req, res) => {
  const settings = await getSettings();
  const { data: officials } = await supabase.from('barangay_officials').select('*');

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-person-lines-fill me-2"></i>Barangay Council & Officials</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#addOfficialModal"><i class="bi bi-person-plus me-1"></i> Add Official</button>
      </div>

      <div class="row g-3">
        ${(officials || []).map(o => `
          <div class="col-md-3">
            <div class="card card-custom p-3 text-center h-100">
              <img src="${o.photo_url || 'https://via.placeholder.com/100'}" class="rounded-circle mx-auto mb-2" style="width:80px; height:80px; object-fit:cover; border: none;">
              <h6 class="fw-bold text-primary-blue m-0">${o.name}</h6>
              <span class="badge bg-accent-green mb-2 text-white">${o.position}</span>${o.signature_url ? `<img src="${o.signature_url}" class="d-block mx-auto mt-1" style="height:25px; object-fit:contain;">` : ''}
              
              <form action="/api/admin/official/upload-photo/${o.id}" method="POST" enctype="multipart/form-data" class="mt-2">
                <input type="file" name="photo" class="form-control form-control-sm mb-1" accept="image/*" required>
                <button type="submit" class="btn btn-sm btn-outline-primary w-100">Upload Photo</button>
              </form>

              <a href="/api/admin/official/delete/${o.id}" class="btn btn-sm btn-outline-danger w-100 mt-2" onclick="return confirm('Are you sure you want to delete this official?')"><i class="bi bi-trash me-1"></i> Delete Official</a>
            </div>
          </div>
        `).join('') || '<div class="col-12 text-center text-muted">No officials configured.</div>'}
      </div>
    </div>

    <!-- Modal Add Official -->
    <div class="modal fade" id="addOfficialModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/admin/official/add" method="POST" enctype="multipart/form-data">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">Add Barangay Official</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3"><label class="form-label">Full Name *</label><input type="text" name="name" class="form-control" required></div>
              <div class="mb-3">
                <label class="form-label">Position *</label>
                <select name="position" class="form-select" required>
                  <option value="Barangay Captain">Barangay Captain</option>
                  <option value="Barangay Kagawad">Barangay Kagawad</option>
                  <option value="Barangay Secretary">Barangay Secretary</option>
                  <option value="Barangay Treasurer">Barangay Treasurer</option>
                  <option value="SK Chairman">SK Chairman</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Official Picture</label>
                <input type="file" name="photo" class="form-control" accept="image/*">
              </div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">Save Official</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'officials', html, settings));
});

router.post('/api/admin/official/add', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), upload.single('photo'), async (req, res) => {
  const { name, position } = req.body;
  let photo_url = null;
  if (req.file) {
    photo_url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  }
  await supabase.from('barangay_officials').insert([{ name, position, photo_url }]);
  res.redirect('/admin/officials');
});

router.post('/api/admin/official/upload-photo/:id', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    await supabase.from('barangay_officials').update({ photo_url: base64Data }).eq('id', req.params.id);
    res.redirect('/admin/officials');
  } catch (err) {
    res.status(500).send('Error uploading official picture: ' + err.message);
  }
});

router.get('/api/admin/official/delete/:id', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  try {
    await supabase.from('barangay_officials').delete().eq('id', req.params.id);
    res.redirect('/admin/officials');
  } catch (err) {
    res.status(500).send('Error deleting official: ' + err.message);
  }
});

module.exports = router;
