/** QR scanner pages and JSON APIs (verify, lookup, claim aid, release certificate). */
const express = require('express');
const { supabase } = require('../config/index');
const { authenticateToken, requireRole, logActivity } = require('../middleware/auth');
const { STAFF_ROLES } = require('../utils/constants');
const { escHtml, getSettings } = require('../utils/helpers');
const { renderSystemHead, renderSystemFooter, renderAppLayout } = require('../views/layout');
const { renderScannerBody } = require('../views/scannerBody');
const { claimAidForHousehold } = require('../services/aid');

const router = express.Router();

// ==========================================
// ROUTE 9: QR SCANNER (page + JSON API defined further below, after STAFF_ROLES)
// ==========================================
router.post('/api/scanner/verify', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const { qr_token } = req.body;
  const settings = await getSettings();

  const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('qr_token', qr_token).single();

  let resultHtml = '';
  if (resident) {
    const { data: cert } = await supabase.from('certificate_requests').select('*').eq('resident_id', resident.id).eq('status', 'READY_FOR_RELEASE').single();
    const { data: aidRows } = await supabase.from('aid_beneficiaries').select('*, aid_programs(title, aid_type, status, location)').eq('resident_id', resident.id).eq('status', 'Pending');
    const pendingAid = (aidRows || []).filter(a => a.aid_programs && a.aid_programs.status === 'Open');

    resultHtml = `
      <div class="card card-custom p-4 border-success">
        <div class="text-center mb-3">
          <span class="badge bg-success px-3 py-2 fs-6 text-white"><i class="bi bi-patch-check-fill me-1"></i> OFFICIAL RESIDENT VERIFIED</span>
        </div>
        <div class="row align-items-center">
          <div class="col-md-4 text-center">
            <img src="${resident.photo_url || 'https://via.placeholder.com/100'}" class="rounded-circle mb-2" style="width:90px; height:90px; object-fit:cover;">
            <h6 class="fw-bold m-0">${resident.first_name} ${resident.last_name}</h6>
            <small class="text-primary-blue fw-bold">${resident.resident_number}</small>
          </div>
          <div class="col-md-8">
            <p class="m-0"><strong>Address:</strong> ${resident.address}</p>
            <p class="m-0"><strong>Purok:</strong> ${resident.puroks ? resident.puroks.name : '-'}</p>
            <p class="m-0"><strong>Status:</strong> <span class="badge bg-success">${resident.resident_status}</span></p>

            ${cert ? `
              <div class="alert alert-warning mt-3 p-2">
                <small class="fw-bold d-block">CLAIMABLE DOCUMENT READY:</small>
                <span>${cert.certificate_type} (${cert.request_number})</span>
                <a href="/api/admin/certificate/update/${cert.id}?status=RELEASED" class="btn btn-sm btn-primary-custom d-block mt-2 text-white">Mark Document Released</a>
              </div>
            ` : '<p class="text-muted small mt-2">No pending certificates ready for release.</p>'}
          </div>
        </div>

        <hr>
        <h6 class="fw-bold text-accent-green"><i class="bi bi-box2-heart me-1"></i> Aid Available to Claim</h6>
        ${pendingAid.length ? pendingAid.map(a => `
          <form action="/api/scanner/claim" method="POST" class="alert alert-success d-flex justify-content-between align-items-center p-2 mb-2">
            <div>
              <strong>${escHtml(a.aid_programs.title)}</strong>
              <small class="d-block text-muted">${escHtml(a.aid_programs.aid_type)}</small>
            </div>
            <input type="hidden" name="beneficiary_id" value="${a.id}">
            <input type="hidden" name="qr_token" value="${escHtml(qr_token)}">
            <button type="submit" class="btn btn-sm btn-accent-custom text-white fw-bold" onclick="return confirm('Release this aid to the resident?')"><i class="bi bi-check2-circle me-1"></i> Release Aid</button>
          </form>
        `).join('') : '<p class="text-muted small">No unclaimed aid for this resident.</p>'}
        <div class="text-center mt-3">
          <a href="/scanner" class="btn btn-sm btn-outline-secondary">Scan Another Code</a>
        </div>
      </div>
    `;
  } else {
    resultHtml = `
      <div class="alert alert-danger text-center">
        <i class="bi bi-x-circle fs-3 d-block mb-2"></i>
        <strong>Verification Failed!</strong><br>
        No corresponding official resident or token record found in database.
      </div>
      <div class="text-center"><a href="/scanner" class="btn btn-sm btn-secondary">Try Again</a></div>
    `;
  }

  res.send(renderAppLayout(req, 'qr-scanner', resultHtml, settings));
});

// ---------- SCANNER: claim aid after QR verification ----------
router.post('/api/scanner/claim', authenticateToken, requireRole(STAFF_ROLES), async (req, res) => {
  const settings = await getSettings();
  const { beneficiary_id, qr_token } = req.body;

  // Re-verify the scanned QR token so a claim can only be made with a valid ID scan
  const { data: resident } = await supabase.from('residents').select('id, first_name, last_name, resident_status').eq('qr_token', qr_token).single();
  const { data: ben } = await supabase.from('aid_beneficiaries').select('*, aid_programs(title, status)').eq('id', beneficiary_id).single();

  let msg;
  if (!resident || !ben || ben.resident_id !== resident.id) {
    msg = `<div class="alert alert-danger text-center"><strong>Claim Failed!</strong><br>The scanned ID does not match this aid record.</div>`;
  } else if (!ben.aid_programs || ben.aid_programs.status !== 'Open') {
    msg = `<div class="alert alert-warning text-center"><strong>Program Closed.</strong><br>This aid program is no longer open for claiming.</div>`;
  } else {
    const claim = await claimAidForHousehold(ben, req.user.id);
    if (claim.ok) {
      await logActivity(req.user.id, 'Aid Claimed', `${resident.first_name} ${resident.last_name} claimed "${ben.aid_programs.title}" via QR verification`);
      msg = `<div class="alert alert-success text-center"><i class="bi bi-check-circle-fill fs-3 d-block mb-2"></i><strong>Aid Released!</strong><br>${escHtml(resident.first_name)} ${escHtml(resident.last_name)} claimed <strong>${escHtml(ben.aid_programs.title)}</strong>.<br><small>Recorded for the whole household.</small></div>`;
    } else {
      msg = `<div class="alert alert-warning text-center"><strong>Already Claimed.</strong><br>This aid was already released to this resident or another member of the same household.</div>`;
    }
  }

  res.send(renderAppLayout(req, 'qr-scanner', `${msg}<div class="text-center"><a href="/scanner" class="btn btn-primary-custom text-white">Scan Next Resident</a></div>`, settings));
});

// Embedded version (inside the admin layout)
router.get('/scanner', authenticateToken, requireRole(STAFF_ROLES), async (req, res) => {
  const settings = await getSettings();
  const html = `
    <div class="card card-custom p-4 mb-3" style="max-width: 650px; margin: auto;">
      ${renderScannerBody()}
    </div>
    <div class="card card-custom p-3" style="max-width: 650px; margin: auto;">
      <h6 class="fw-bold text-primary-blue"><i class="bi bi-link-45deg me-1"></i> Scan-Only Link</h6>
      <p class="small text-muted mb-2">A clean full-screen page with only the scanner. Staff must still be logged in. Bookmark it or add it to the phone home screen.</p>
      <div class="input-group input-group-sm">
        <input type="text" id="scanLinkField" class="form-control" readonly>
        <button type="button" class="btn btn-outline-primary" id="copyScanLink"><i class="bi bi-clipboard me-1"></i>Copy</button>
        <a href="/scan" target="_blank" class="btn btn-primary-custom text-white"><i class="bi bi-box-arrow-up-right me-1"></i>Open</a>
      </div>
    </div>
    <script>
      (function () {
        var f = document.getElementById('scanLinkField');
        f.value = window.location.origin + '/scan';
        document.getElementById('copyScanLink').onclick = function () {
          f.select();
          if (navigator.clipboard) navigator.clipboard.writeText(f.value);
          else document.execCommand('copy');
          this.innerHTML = '<i class="bi bi-check2 me-1"></i>Copied';
        };
      })();
    </script>
  `;
  res.send(renderAppLayout(req, 'qr-scanner', html, settings));
});

// Scan-only page (no sidebar, phone/kiosk friendly)
router.get('/scan', authenticateToken, requireRole(STAFF_ROLES), async (req, res) => {
  const settings = await getSettings();
  res.send(`
    ${renderSystemHead('Scanner')}
    <div class="container py-3" style="max-width: 640px;">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <div class="d-flex align-items-center">
          ${settings.barangay_logo ? `<img src="${settings.barangay_logo}" class="me-2 rounded-circle" style="width:44px;height:44px;object-fit:cover;">` : '<i class="bi bi-building fs-2 me-2 text-primary-blue"></i>'}
          <div>
            <div class="fw-bold text-primary-blue lh-1">${escHtml(settings.barangay_name || 'Barangay Portal')}</div>
            <small class="text-muted">Scan-Only Mode</small>
          </div>
        </div>
        <div class="d-flex gap-2">
          <a href="/admin/dashboard" class="btn btn-sm btn-outline-secondary"><i class="bi bi-house"></i></a>
          <a href="/logout" class="btn btn-sm btn-outline-danger"><i class="bi bi-box-arrow-right"></i></a>
        </div>
      </div>
      <div class="card card-custom p-3">
        ${renderScannerBody()}
      </div>
    </div>
    ${renderSystemFooter()}
  `);
});

// JSON: look up a resident from a scanned QR token
router.post('/api/scanner/lookup', authenticateToken, requireRole(STAFF_ROLES), async (req, res) => {
  const token = String(req.body.qr_token || '').trim();
  if (!token) {
    return res.json({ success: false, level: 'error', message: 'No QR code detected.', spoken: 'No code detected.' });
  }
  try {
    const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('qr_token', token).maybeSingle();
    if (!resident) {
      return res.json({
        success: false, level: 'error',
        message: 'Verification failed', detail: 'No resident matches this QR code.',
        spoken: 'Verification failed. Resident not found.'
      });
    }

    const { data: certRows } = await supabase.from('certificate_requests')
      .select('id, certificate_type, request_number').eq('resident_id', resident.id).eq('status', 'READY_FOR_RELEASE');
    const { data: aidRows } = await supabase.from('aid_beneficiaries')
      .select('id, aid_programs(title, aid_type, status)').eq('resident_id', resident.id).eq('status', 'Pending');

    const certificates = (certRows || []).map(c => ({ id: c.id, type: c.certificate_type, number: c.request_number }));
    const aid = (aidRows || []).filter(a => a.aid_programs && a.aid_programs.status === 'Open')
      .map(a => ({ id: a.id, title: a.aid_programs.title, type: a.aid_programs.aid_type }));

    const name = `${resident.first_name} ${resident.last_name}`;
    let spoken = `${name} verified.`;
    if (aid.length) spoken += ` ${aid.length} aid ${aid.length === 1 ? 'item' : 'items'} available to claim.`;
    if (certificates.length) spoken += ` ${certificates.length} ${certificates.length === 1 ? 'certificate' : 'certificates'} ready for release.`;

    res.json({
      success: true, level: 'ok',
      message: 'Resident verified', detail: name,
      spoken,
      resident: {
        name, number: resident.resident_number, address: resident.address,
        purok: resident.puroks ? resident.puroks.name : '', status: resident.resident_status,
        photo: resident.photo_url || ''
      },
      certificates, aid
    });
  } catch (err) {
    console.error('Scanner lookup error:', err);
    res.json({ success: false, level: 'error', message: 'Server error', detail: 'Please try again.', spoken: 'Server error. Please try again.' });
  }
});

// JSON: release aid after a verified scan
router.post('/api/scanner/claim-json', authenticateToken, requireRole(STAFF_ROLES), async (req, res) => {
  try {
    const { beneficiary_id, qr_token } = req.body;
    const { data: resident } = await supabase.from('residents').select('id, first_name, last_name').eq('qr_token', String(qr_token || '')).maybeSingle();
    const { data: ben } = await supabase.from('aid_beneficiaries').select('*, aid_programs(title, status)').eq('id', beneficiary_id).maybeSingle();

    if (!resident || !ben || ben.resident_id !== resident.id) {
      return res.json({ success: false, level: 'error', message: 'Claim failed', detail: 'The scanned ID does not match this aid record.', spoken: 'Claim failed. ID does not match.' });
    }
    if (!ben.aid_programs || ben.aid_programs.status !== 'Open') {
      return res.json({ success: false, level: 'warn', final: true, badge: 'Closed', message: 'Program closed', detail: 'This aid program is no longer open.', spoken: 'Program closed.' });
    }
    const name = `${resident.first_name} ${resident.last_name}`;
    const claim = await claimAidForHousehold(ben, req.user.id);
    if (claim.ok) {
      await logActivity(req.user.id, 'Aid Claimed', `${name} claimed "${ben.aid_programs.title}" via QR verification`);
      return res.json({ success: true, level: 'ok', badge: 'Released', message: 'Aid released', detail: `${name} - ${ben.aid_programs.title} (one claim for the whole household)`, spoken: `Aid released to ${name}. ${ben.aid_programs.title}. One claim for the whole household.` });
    }
    res.json({ success: false, level: 'warn', final: true, badge: 'Already claimed', message: 'Already claimed', detail: `${name}'s household already received this aid.`, spoken: `Already claimed. ${name}'s household already received this aid.` });
  } catch (err) {
    console.error('Scanner claim error:', err);
    res.json({ success: false, level: 'error', message: 'Server error', detail: 'Please try again.', spoken: 'Server error. Please try again.' });
  }
});

// JSON: mark a certificate as released after a verified scan
router.post('/api/scanner/release-certificate', authenticateToken, requireRole(STAFF_ROLES), async (req, res) => {
  try {
    const { certificate_id, qr_token } = req.body;
    const { data: resident } = await supabase.from('residents').select('id, first_name, last_name').eq('qr_token', String(qr_token || '')).maybeSingle();
    if (!resident) {
      return res.json({ success: false, level: 'error', message: 'Release failed', detail: 'Resident not found.', spoken: 'Release failed. Resident not found.' });
    }
    const { data: cert } = await supabase.from('certificate_requests')
      .select('id, certificate_type, request_number, status').eq('id', certificate_id).eq('resident_id', resident.id).maybeSingle();
    if (!cert) {
      return res.json({ success: false, level: 'error', message: 'Release failed', detail: 'Certificate does not belong to this resident.', spoken: 'Release failed. Certificate does not match.' });
    }
    const name = `${resident.first_name} ${resident.last_name}`;
    if (cert.status !== 'READY_FOR_RELEASE') {
      return res.json({ success: false, level: 'warn', final: true, badge: 'Already released', message: 'Already released', detail: `${cert.certificate_type} is not waiting for release.`, spoken: 'Already released.' });
    }
    await supabase.from('certificate_requests').update({ status: 'RELEASED', updated_at: new Date() }).eq('id', cert.id).eq('status', 'READY_FOR_RELEASE');
    await logActivity(req.user.id, 'Certificate Released', `${cert.certificate_type} (${cert.request_number}) released to ${name} via QR verification`);
    res.json({ success: true, level: 'ok', badge: 'Released', message: 'Certificate released', detail: `${name} - ${cert.certificate_type}`, spoken: `${cert.certificate_type} released to ${name}.` });
  } catch (err) {
    console.error('Scanner certificate error:', err);
    res.json({ success: false, level: 'error', message: 'Server error', detail: 'Please try again.', spoken: 'Server error. Please try again.' });
  }
});

module.exports = router;
