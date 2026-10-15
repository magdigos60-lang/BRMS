/** Resident portal: dashboard, profile, ID, requests, aid, etc. */
const express = require('express');
const QRCode = require('qrcode');
const { supabase, upload } = require('../config/index');
const { authenticateToken, requireRole, logActivity } = require('../middleware/auth');
const { escHtml, getSettings } = require('../utils/helpers');
const { renderAppLayout } = require('../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 20: RESIDENT PORTAL & PROFILE PICTURE SELF-UPDATE
// ==========================================
router.get('/resident/dashboard', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();
  const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('id', req.user.resident_id).single();
  const { data: announcements } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(3);
  const { data: myAid } = await supabase.from('aid_beneficiaries').select('id, aid_programs(status)').eq('resident_id', req.user.resident_id).eq('status', 'Pending');
  const aidReady = (myAid || []).filter(a => a.aid_programs && a.aid_programs.status === 'Open').length;

  const html = `
    ${aidReady ? `<div class="alert alert-success d-flex justify-content-between align-items-center"><span><i class="bi bi-gift-fill me-2"></i><strong>You have ${aidReady} aid package${aidReady > 1 ? 's' : ''} ready to claim.</strong> Bring your Barangay ID for QR scanning.</span><a href="/resident/aid" class="btn btn-sm btn-accent-custom text-white fw-bold">View Details</a></div>` : ''}
    <div class="row g-3 mb-4">
      <div class="col-md-12">
        <div class="card card-custom p-4 bg-primary-blue text-white">
          <h3 class="fw-bold m-0">Welcome back, ${resident ? resident.first_name : 'Resident'}!</h3>
          <p class="mb-0 opacity-75">Resident ID: ${resident ? resident.resident_number : 'BRGY-000000'}</p>
        </div>
      </div>
    </div>

    <div class="row g-3">
      <div class="col-md-8">
        <div class="card card-custom p-4 mb-3">
          <h5 class="fw-bold text-primary-blue mb-3"><i class="bi bi-bell me-2"></i>Latest Barangay Announcements</h5>
          ${(announcements || []).map(a => `
            <div class="border-bottom pb-2 mb-2">
              <h6 class="fw-bold m-0 text-dark">${a.title}</h6>
              <p class="small text-muted mb-1">${a.content}</p>
            </div>
          `).join('') || '<p class="text-muted">No active announcements.</p>'}
        </div>
      </div>

      <div class="col-md-4">
        <div class="card card-custom p-4 text-center">
          <h5 class="fw-bold text-primary-blue mb-3">My Digital Resident ID</h5>
          <img src="${resident.photo_url || 'https://via.placeholder.com/100'}" class="rounded-circle mx-auto mb-2" style="width:80px; height:80px; object-fit:cover; border: none;">
          <h6 class="fw-bold m-0">${resident.first_name} ${resident.last_name}</h6>
          <span class="text-primary-blue small fw-bold">${resident.resident_number}</span>
          <div class="mt-3">
            <a href="/resident/digital-id" class="btn btn-sm btn-accent-custom w-100 fw-bold text-white"><i class="bi bi-qr-code me-1"></i> View Full Digital ID</a>
            <a href="/resident/profile" class="btn btn-sm btn-outline-primary w-100 fw-bold mt-2"><i class="bi bi-camera me-1"></i> Change Picture</a>
          </div>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-dashboard', html, settings));
});

// Resident Profile & Picture Update
router.get('/resident/profile', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();
  const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('id', req.user.resident_id).single();

  const html = `
    <div class="card card-custom p-4" style="max-width: 720px; margin: auto;">
      <div class="text-center mb-4">
        <div class="position-relative d-inline-block">
          <img src="${resident.photo_url || 'https://via.placeholder.com/150'}" class="rounded-circle mx-auto mb-2" style="width: 135px; height: 135px; object-fit: cover; border: none; box-shadow: 0 4px 10px rgba(0,0,0,0.15);">
          <button class="btn btn-sm btn-accent-custom rounded-circle position-absolute bottom-0 end-0 p-2 text-white" data-bs-toggle="modal" data-bs-target="#changePhotoModal" title="Change Photo">
            <i class="bi bi-camera-fill"></i>
          </button>
        </div>
        <h4 class="fw-bold text-primary-blue mt-2 m-0">${resident.first_name} ${resident.middle_name || ''} ${resident.last_name}</h4>
        <span class="badge bg-accent-green mt-1 text-white">${resident.resident_number}</span>
      </div>

      <div class="card p-3 mb-4 bg-light-green border">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <h6 class="fw-bold text-primary-blue m-0"><i class="bi bi-image me-1"></i> Update Your Profile Picture</h6>
            <small class="text-muted">Change or upload a new photograph for your digital resident ID and portal</small>
          </div>
          <button class="btn btn-sm btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#changePhotoModal"><i class="bi bi-upload me-1"></i> Upload Photo</button>
        </div>
      </div>

      <h5 class="fw-bold text-primary-blue mb-3"><i class="bi bi-person me-2"></i>My Resident Official Profile</h5>
      <div class="row g-3">
        <div class="col-6"><strong>Full Name:</strong> ${resident.first_name} ${resident.middle_name || ''} ${resident.last_name}</div>
        <div class="col-6"><strong>Resident ID:</strong> ${resident.resident_number}</div>
        <div class="col-6"><strong>Date of Birth:</strong> ${resident.date_of_birth}</div>
        <div class="col-6"><strong>Gender:</strong> ${resident.gender}</div>
        <div class="col-6"><strong>Civil Status:</strong> ${resident.civil_status}</div>
        <div class="col-6"><strong>Purok Zone:</strong> ${resident.puroks ? resident.puroks.name : '-'}</div>
        <div class="col-12"><strong>Address:</strong> ${resident.address}</div>
      </div>

      <hr class="my-4">
      <h6 class="fw-bold text-accent-green mb-2">Request Profile Correction</h6>
      <form action="/api/resident/request-profile-update" method="POST">
        <div class="mb-3">
          <label class="form-label">Describe Needed Changes / Corrections *</label>
          <textarea name="reason" class="form-control" rows="3" required placeholder="e.g. Correct address details or typo..."></textarea>
        </div>
        <button type="submit" class="btn btn-primary-custom text-white">Submit Correction Request</button>
      </form>
    </div>

    <!-- Modal: Upload Profile Photo -->
    <div class="modal fade" id="changePhotoModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/resident/upload-photo" method="POST" enctype="multipart/form-data">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold"><i class="bi bi-camera me-2"></i>Change Profile Picture</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label fw-semibold">Select Photo File (PNG, JPG, JPEG) *</label>
                <input type="file" name="photo" class="form-control" accept="image/*" required>
                <small class="text-muted d-block mt-1">Please select a clear front-facing photograph of yourself.</small>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-accent-custom fw-bold text-white"><i class="bi bi-upload me-1"></i> Upload New Picture</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-profile', html, settings));
});

// Resident Profile Photo Upload Handler
router.post('/api/resident/upload-photo', authenticateToken, requireRole(['Resident']), upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('<script>alert("Please select an image file to upload."); window.history.back();</script>');
    const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    await supabase.from('residents').update({ photo_url: base64Data }).eq('id', req.user.resident_id);
    await logActivity(req.user.id, 'Resident Photo Self-Update', `Resident updated their profile picture.`);
    res.redirect('/resident/profile');
  } catch (err) {
    console.error('Error uploading photo:', err);
    res.status(500).send('Error uploading photo: ' + err.message);
  }
});

router.post('/api/resident/request-profile-update', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const { reason } = req.body;
  await supabase.from('profile_change_requests').insert([{ resident_id: req.user.resident_id, requested_changes: {}, reason }]);
  res.redirect('/resident/profile');
});

// Resident Digital ID Display (Barangay ID Format with Captain Name below Signature)
router.get('/resident/digital-id', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();
  const { data: resident } = await supabase.from('residents').select('*, puroks(name)').eq('id', req.user.resident_id).single();

  const qrDataUrl = await QRCode.toDataURL(resident.qr_token || resident.id, { margin: 0, width: 300 });

  const html = `
    <div class="text-center py-4">
      <h4 class="fw-bold text-primary-blue mb-3">Official Digital Barangay ID</h4>

      <div class="id-card-frame shadow-lg text-start" style="width: 3.6in; height: 2.25in; border-width: 3px;">
        <div class="id-card-header">
          ${settings.barangay_logo ? `<img src="${settings.barangay_logo}" class="id-header-logo">` : '<i class="bi bi-building fs-5"></i>'}
          <div class="text-center flex-grow-1 px-1" style="line-height:1.1;">
            <strong style="font-size: 8pt; display: block;" class="text-uppercase">${settings.barangay_name || 'BARANGAY CENTRAL'}</strong>
            <span style="font-size: 6pt; letter-spacing:0.5px;">BARANGAY ID</span>
          </div>
          <span class="badge bg-white text-dark px-1" style="font-size: 5.5pt; font-weight: 800;">VERIFIED</span>
        </div>

        <div class="id-card-body">
          <img src="${resident.photo_url || 'https://via.placeholder.com/150'}" class="id-photo" style="width: 1.1in; height: 1.1in;">
          <div class="id-details">
            <div class="text-primary-blue fw-bold" style="font-size: 8.5pt;">${resident.resident_number}</div>
            <div class="fw-bold text-uppercase text-dark mt-1" style="font-size: 9pt;">${resident.first_name} ${resident.last_name}</div>
            <div class="text-muted mt-1">DOB: <strong>${resident.date_of_birth}</strong></div>
            <div class="text-muted">Sex: <strong>${resident.gender}</strong> | Civil: <strong>${resident.civil_status || 'Single'}</strong></div>
            <div class="text-muted">Purok: <strong>${resident.puroks ? resident.puroks.name : '-'}</strong></div>
          </div>
          <img src="${qrDataUrl}" class="id-qr" style="width: 1.1in; height: 1.1in;">
        </div>

        <div class="id-card-footer">
          <div style="font-size: 4.8pt; max-width:2.0in;" class="text-muted lh-1">
            If found, please return to Barangay Hall. Property of Barangay Administration.
          </div>
          <div class="text-center" style="min-width: 1.0in;">
            ${settings.captain_signature ? `<img src="${settings.captain_signature}" style="height:18px; object-fit:contain; display:block; margin:auto;"><br>` : ''}
            <span style="font-size: 5.5pt; border-top: 1px solid #333; display: block; font-weight: 600; margin-top: -2px;">${settings.barangay_captain || 'Barangay Captain'}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-digital-id', html, settings));
});

// Resident Certificate Request
router.get('/resident/certificates', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();
  const { data: certs } = await supabase.from('certificate_requests').select('*').eq('resident_id', req.user.resident_id).order('created_at', { ascending: false });

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-file-earmark-plus me-2"></i>Request Official Barangay Certificates</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#reqCertModal"><i class="bi bi-plus-lg me-1"></i> New Request</button>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Request No</th>
              <th>Certificate Type</th>
              <th>Purpose</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${(certs || []).map(c => `
              <tr>
                <td class="fw-bold text-primary-blue">${c.request_number}</td>
                <td>${c.certificate_type}</td>
                <td>${c.purpose}</td>
                <td><span class="badge bg-warning text-dark">${c.status}</span></td>
              </tr>
            `).join('') || '<tr><td colspan="4" class="text-center py-4 text-muted">No document requests submitted.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Request Certificate -->
    <div class="modal fade" id="reqCertModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/resident/certificate/request" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">Apply for Barangay Document</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Certificate Type *</label>
                <select name="certificate_type" class="form-select" required>
                  <option value="Barangay Clearance">Barangay Clearance</option>
                  <option value="Certificate of Residency">Certificate of Residency</option>
                  <option value="Certificate of Indigency">Certificate of Indigency</option>
                  <option value="Certificate of Good Moral">Certificate of Good Moral</option>
                </select>
              </div>
              <div class="mb-3"><label class="form-label">Purpose *</label><input type="text" name="purpose" class="form-control" required placeholder="e.g. Employment, Scholarship, ID application"></div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">Submit Application</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-certificates', html, settings));
});

router.post('/api/resident/certificate/request', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const { certificate_type, purpose } = req.body;
  const request_number = `REQ-${Date.now().toString().slice(-6)}`;
  await supabase.from('certificate_requests').insert([{ request_number, resident_id: req.user.resident_id, certificate_type, purpose, status: 'SUBMITTED' }]);
  res.redirect('/resident/certificates');
});

// Resident Appointments
router.get('/resident/appointments', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();
  const { data: appts } = await supabase.from('appointments').select('*').eq('resident_id', req.user.resident_id);

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-calendar-plus me-2"></i>Book Barangay Office Appointment</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#bookApptModal"><i class="bi bi-plus-lg me-1"></i> Book Appointment</button>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Appt No</th>
              <th>Service</th>
              <th>Date & Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${(appts || []).map(a => `
              <tr>
                <td class="fw-bold text-primary-blue">${a.appointment_number}</td>
                <td>${a.service_requested}</td>
                <td>${a.appointment_date} at${a.appointment_time}</td>
                <td><span class="badge bg-primary text-white">${a.status}</span></td>
              </tr>
            `).join('') || '<tr><td colspan="4" class="text-center py-4 text-muted">No appointments booked.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Book Appointment -->
    <div class="modal fade" id="bookApptModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/resident/appointment/book" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">Book Office Visit</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3"><label class="form-label">Service Requested *</label><input type="text" name="service_requested" class="form-control" required placeholder="e.g. Consult Captain, Document Filing"></div>
              <div class="mb-3"><label class="form-label">Preferred Date *</label><input type="date" name="appointment_date" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Preferred Time *</label><input type="text" name="appointment_time" class="form-control" required placeholder="e.g. 10:00 AM"></div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">Submit Appointment</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-appointments', html, settings));
});

router.post('/api/resident/appointment/book', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const { service_requested, appointment_date, appointment_time } = req.body;
  const appointment_number = `APT-${Date.now().toString().slice(-6)}`;
  await supabase.from('appointments').insert([{ appointment_number, resident_id: req.user.resident_id, service_requested, appointment_date, appointment_time, status: 'PENDING' }]);
  res.redirect('/resident/appointments');
});

// Resident Complaints
router.get('/resident/complaints', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();

  const html = `
    <div class="card card-custom p-4" style="max-width: 600px; margin: auto;">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-exclamation-triangle me-2"></i>File Community Incident or Complaint</h4>
      <form action="/api/resident/complaint/submit" method="POST">
        <div class="mb-3"><label class="form-label">Respondent Name / Entity *</label><input type="text" name="respondent_name" class="form-control" required></div>
        <div class="mb-3"><label class="form-label">Incident Date *</label><input type="date" name="incident_date" class="form-control" required></div>
        <div class="mb-3"><label class="form-label">Incident Location *</label><input type="text" name="location" class="form-control" required></div>
        <div class="mb-3"><label class="form-label">Detailed Description *</label><textarea name="description" class="form-control" rows="4" required></textarea></div>
        <button type="submit" class="btn btn-accent-custom py-2 w-100 fw-bold text-white">Submit Confidential Complaint</button>
      </form>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-complaints', html, settings));
});

router.post('/api/resident/complaint/submit', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const { respondent_name, incident_date, location, description } = req.body;
  const { data: resData } = await supabase.from('residents').select('first_name, last_name').eq('id', req.user.resident_id).single();
  const case_number = `BLOT-${Date.now().toString().slice(-6)}`;

  await supabase.from('complaints').insert([{
    case_number, complainant_id: req.user.resident_id, complainant_name: `${resData.first_name} ${resData.last_name}`,
    respondent_name, incident_date, location, description, status: 'SUBMITTED'
  }]);

  res.redirect('/resident/dashboard');
});

// Resident Assistance Requests
router.get('/resident/assistance', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();

  const html = `
    <div class="card card-custom p-4" style="max-width: 600px; margin: auto;">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-heart-pulse me-2"></i>Apply for Barangay Aid & Assistance</h4>
      <form action="/api/resident/assistance/request" method="POST">
        <div class="mb-3">
          <label class="form-label">Assistance Type *</label>
          <select name="assistance_type" class="form-select" required>
            <option value="Financial Assistance">Financial Assistance</option>
            <option value="Medical Assistance">Medical Assistance</option>
            <option value="Educational Assistance">Educational Assistance</option>
            <option value="Food Assistance">Food Assistance</option>
            <option value="Emergency Assistance">Emergency Assistance</option>
          </select>
        </div>
        <div class="mb-3"><label class="form-label">Details / Reason *</label><textarea name="details" class="form-control" rows="3" required></textarea></div>
        <button type="submit" class="btn btn-primary-custom py-2 w-100 fw-bold text-white">Submit Application</button>
      </form>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-assistance', html, settings));
});

router.post('/api/resident/assistance/request', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const { assistance_type, details } = req.body;
  const request_number = `AID-${Date.now().toString().slice(-6)}`;
  await supabase.from('assistance_requests').insert([{ request_number, resident_id: req.user.resident_id, assistance_type, details, status: 'PENDING' }]);
  res.redirect('/resident/dashboard');
});

// Resident Announcements Display
router.get('/resident/announcements', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();
  const { data: announcements } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-bell me-2"></i>Barangay News & Bulletin</h4>
      <div class="row g-3">
        ${(announcements || []).map(a => `
          <div class="col-md-6">
            <div class="card card-custom p-3 border-start border-4 ${a.priority === 'Emergency' ? 'border-danger' : 'border-primary'}">
              <h5 class="fw-bold text-primary-blue">${a.title}</h5>
              <p class="text-muted small">${a.content}</p>
              <small class="text-secondary">${new Date(a.created_at).toLocaleDateString()}</small>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-announcements', html, settings));
});

// Resident Emergency Contacts
router.get('/resident/emergency-contacts', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-telephone me-2"></i>Emergency Hotline Directory</h4>
      <div class="row g-3">
        <div class="col-md-4">
          <div class="p-3 border rounded text-center bg-light-blue">
            <i class="bi bi-building fs-1 text-primary-blue"></i>
            <h5 class="fw-bold mt-2">Barangay Hall</h5>
            <p class="text-muted m-0">${settings.contact_number || '09123456789'}</p>
          </div>
        </div>
        <div class="col-md-4">
          <div class="p-3 border rounded text-center bg-light-green">
            <i class="bi bi-shield-fill fs-1 text-danger"></i>
            <h5 class="fw-bold mt-2">Police Station</h5>
            <p class="text-muted m-0">911 / (045) 123-4567</p>
          </div>
        </div>
        <div class="col-md-4">
          <div class="p-3 border rounded text-center bg-light-blue">
            <i class="bi bi-fire fs-1 text-warning"></i>
            <h5 class="fw-bold mt-2">Fire Department</h5>
            <p class="text-muted m-0">160 / (045) 765-4321</p>
          </div>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-contacts', html, settings));
});

// Resident Feedback
router.get('/resident/feedback', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();

  const html = `
    <div class="card card-custom p-4" style="max-width: 500px; margin: auto;">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-chat-left-text me-2"></i>Barangay Service Feedback</h4>
      <form action="/api/resident/feedback/submit" method="POST">
        <div class="mb-3">
          <label class="form-label">Service Evaluated *</label>
          <input type="text" name="service_type" class="form-control" required placeholder="e.g. Document Request, Captain Consultation">
        </div>
        <div class="mb-3">
          <label class="form-label">Rating (1 to 5 Stars) *</label>
          <select name="rating" class="form-select" required>
            <option value="5">5 Stars - Excellent</option>
            <option value="4">4 Stars - Very Good</option>
            <option value="3">3 Stars - Satisfactory</option>
            <option value="2">2 Stars - Poor</option>
            <option value="1">1 Star - Very Poor</option>
          </select>
        </div>
        <div class="mb-3"><label class="form-label">Comments *</label><textarea name="comments" class="form-control" rows="3" required></textarea></div>
        <button type="submit" class="btn btn-primary-custom py-2 w-100 fw-bold text-white">Submit Feedback</button>
      </form>
    </div>
  `;

  res.send(renderAppLayout(req, 'res-feedback', html, settings));
});

router.post('/api/resident/feedback/submit', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const { service_type, rating, comments } = req.body;
  await supabase.from('feedback').insert([{ resident_id: req.user.resident_id, service_type, rating: parseInt(rating), comments }]);
  res.redirect('/resident/dashboard');
});

// ---------- RESIDENT PORTAL: my aid + beneficiary lists ----------
router.get('/resident/aid', authenticateToken, requireRole(['Resident']), async (req, res) => {
  const settings = await getSettings();

  const { data: mine } = await supabase.from('aid_beneficiaries')
    .select('*, aid_programs(*)').eq('resident_id', req.user.resident_id).order('created_at', { ascending: false });

  const { data: openPrograms } = await supabase.from('aid_programs').select('*').eq('status', 'Open').order('created_at', { ascending: false });
  // Privacy: residents only ever see their own beneficiary records (never other residents' names)
  const myProgramIds = new Set((mine || []).map(m => m.program_id));

  const pendingMine = (mine || []).filter(m => m.status === 'Pending' && m.aid_programs && m.aid_programs.status === 'Open');

  const html = `
    ${pendingMine.length ? `
      <div class="alert alert-success d-flex align-items-center">
        <i class="bi bi-gift-fill fs-3 me-3"></i>
        <div><strong>You have ${pendingMine.length} aid package${pendingMine.length > 1 ? 's' : ''} ready to claim!</strong><br>
        <small>Bring your Barangay ID. Show the QR code on your ID (or your <a href="/resident/digital-id">Digital ID</a>) to the staff for scanning.</small></div>
      </div>` : ''}

    <div class="card card-custom p-4 mb-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-box2-heart me-2"></i>My Aid & Relief</h4>
      <div class="row g-3">
        ${(mine || []).map(m => {
          const p = m.aid_programs || {};
          const claimed = m.status === 'Claimed';
          return `
            <div class="col-md-6">
              <div class="card card-custom p-3 border-start border-4 ${claimed ? 'border-success' : 'border-warning'}">
                <div class="d-flex justify-content-between">
                  <h5 class="fw-bold text-primary-blue">${escHtml(p.title)}</h5>
                  <span class="badge ${claimed ? 'bg-success' : 'bg-warning text-dark'} h-100">${claimed ? 'CLAIMED' : 'READY TO CLAIM'}</span>
                </div>
                <span class="badge bg-info text-dark align-self-start mb-2">${escHtml(p.aid_type)}</span>
                <p class="small text-muted mb-1">${escHtml(p.description || '')}</p>
                <p class="small mb-0"><i class="bi bi-calendar3 me-1"></i>${escHtml(p.distribution_date || 'Date to be announced')} &nbsp; <i class="bi bi-geo-alt me-1"></i>${escHtml(p.location || 'Barangay Hall')}</p>
                ${claimed && m.claimed_at ? `<p class="small text-success mb-0 mt-1"><i class="bi bi-check-circle me-1"></i>Claimed on ${new Date(m.claimed_at).toLocaleString()}</p>` : ''}
                ${!claimed && p.status !== 'Open' ? '<p class="small text-danger mb-0 mt-1">This program is closed.</p>' : ''}
              </div>
            </div>`;
        }).join('') || '<div class="col-12 text-center text-muted py-3">You are not currently listed as a beneficiary of any aid program.</div>'}
      </div>
    </div>

    <div class="card card-custom p-4">
      <h5 class="fw-bold text-primary-blue mb-3"><i class="bi bi-megaphone me-2"></i>Current Aid Programs</h5>
      ${(openPrograms || []).map(p => `
        <div class="mb-3 pb-3 border-bottom">
          <div class="d-flex justify-content-between align-items-start">
            <h6 class="fw-bold text-accent-green mb-1">${escHtml(p.title)}</h6>
            ${myProgramIds.has(p.id) ? '<span class="badge bg-success">You are a beneficiary</span>' : ''}
          </div>
          <span class="badge bg-info text-dark mb-1">${escHtml(p.aid_type)}</span>
          <p class="small text-muted mb-1">${escHtml(p.description || '')}</p>
          <p class="small mb-0"><i class="bi bi-calendar3 me-1"></i>${escHtml(p.distribution_date || 'Date to be announced')} &nbsp; <i class="bi bi-geo-alt me-1"></i>${escHtml(p.location || 'Barangay Hall')}</p>
        </div>`).join('') || '<p class="text-muted">No open aid programs right now.</p>'}
    </div>
  `;

  res.send(renderAppLayout(req, 'res-aid', html, settings));
});

module.exports = router;
