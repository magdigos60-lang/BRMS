/** Barangay ID generator. */
const express = require('express');
const QRCode = require('qrcode');
const { supabase } = require('../../config/index');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { getSettings } = require('../../utils/helpers');
const { renderAppLayout } = require('../../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 8: BARANGAY ID GENERATOR (National ID format mapped to "Barangay ID", captain name below signature, functional QR, no outer lines)
// ==========================================
router.get('/admin/id-generator', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: residents } = await supabase.from('residents').select('*, puroks(name)').eq('resident_status', 'Active');

  const residentCards = await Promise.all((residents || []).slice(0, 8).map(async (r) => {
    const qrDataUrl = await QRCode.toDataURL(r.qr_token || r.id, { margin: 0, width: 250 });
    return { ...r, qrDataUrl };
  }));

  const html = `
    <div class="card card-custom p-4 no-print">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-card-heading me-2"></i>Barangay Resident ID Generator</h4>
        <button class="btn btn-accent-custom fw-bold text-white" onclick="window.print()"><i class="bi bi-printer me-1"></i> Print Selected Grid (8 IDs)</button>
      </div>
      <p class="text-muted">Generate standard Barangay ID physical cards modeled after the National ID format with functional QR codes, high-visibility badges, and captain's signature.</p>
    </div>

    <div class="mt-4">
      <div class="print-sheet-8">
        ${residentCards.map(r => `
          <div class="id-card-frame">
            <div class="id-card-header">
              ${settings.barangay_logo ? `<img src="${settings.barangay_logo}" class="id-header-logo">` : '<i class="bi bi-building fs-5"></i>'}
              <div class="text-center flex-grow-1 px-1" style="line-height:1.1;">
                <strong style="font-size: 7.5pt; display: block;" class="text-uppercase">${settings.barangay_name || 'BARANGAY CENTRAL'}</strong>
                <span style="font-size: 5.5pt; letter-spacing:0.5px;">BARANGAY ID</span>
              </div>
              <span class="badge bg-white text-dark px-1" style="font-size: 5pt; font-weight: 800;">VERIFIED</span>
            </div>

            <div class="id-card-body">
              <img src="${r.photo_url || 'https://via.placeholder.com/150'}" class="id-photo">
              <div class="id-details">
                <div class="text-primary-blue fw-bold" style="font-size: 8pt;">${r.resident_number}</div>
                <div class="fw-bold text-uppercase text-dark mt-1" style="font-size: 8.5pt;">${r.first_name} ${r.last_name}</div>
                <div class="text-muted mt-1">DOB: <strong>${r.date_of_birth}</strong></div>
                <div class="text-muted">Sex: <strong>${r.gender}</strong> | Civil: <strong>${r.civil_status || 'Single'}</strong></div>
                <div class="text-muted">Purok: <strong>${r.puroks ? r.puroks.name : '-'}</strong></div>
              </div>
              <img src="${r.qrDataUrl}" class="id-qr">
            </div>

            <div class="id-card-footer">
              <div style="font-size: 4.5pt; max-width:1.8in;" class="text-muted lh-1">
                If found, please return to Barangay Hall. Property of Barangay Administration.
              </div>
              <div class="text-center" style="min-width: 0.9in;">
                ${settings.captain_signature ? `<img src="${settings.captain_signature}" style="height:16px; object-fit:contain; display:block; margin:auto;"><br>` : ''}
                <span style="font-size: 5pt; border-top: 1px solid #333; display: block; font-weight: 600; margin-top: -2px;">${settings.barangay_captain || 'Barangay Captain'}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'id-gen', html, settings));
});

module.exports = router;
