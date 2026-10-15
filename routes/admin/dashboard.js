/** Admin dashboard. */
const express = require('express');
const { supabase } = require('../../config/index');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { getSettings } = require('../../utils/helpers');
const { renderAppLayout } = require('../../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 3: ADMIN DASHBOARD
// ==========================================
router.get('/admin/dashboard', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();

  const [
    { count: totalResidents },
    { count: activeResidents },
    { count: pendingRegistrations },
    { count: totalHouseholds },
    { count: totalPuroks },
    { count: seniorCitizens },
    { count: pwds },
    { count: soloParents },
    { count: pendingCerts },
    { count: pendingBlotters }
  ] = await Promise.all([
    supabase.from('residents').select('*', { count: 'exact', head: true }),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'Active'),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'Pending'),
    supabase.from('households').select('*', { count: 'exact', head: true }),
    supabase.from('puroks').select('*', { count: 'exact', head: true }),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('is_senior_citizen', true),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('is_pwd', true),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('is_solo_parent', true),
    supabase.from('certificate_requests').select('*', { count: 'exact', head: true }).eq('status', 'SUBMITTED'),
    supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'SUBMITTED')
  ]);

  const { data: recentLogs } = await supabase.from('user_activity_logs').select('*, users(full_name)').order('created_at', { ascending: false }).limit(5);

  const html = `
    <div class="row g-3 mb-4">
      <div class="col-md-3">
        <div class="card card-custom p-3 stat-card">
          <span class="text-muted small fw-bold">TOTAL RESIDENTS</span>
          <h2 class="fw-bold text-primary-blue m-0">${totalResidents || 0}</h2>
          <small class="text-accent-green fw-bold">${activeResidents || 0} Active / ${pendingRegistrations || 0} Pending</small>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card card-custom p-3 stat-card green">
          <span class="text-muted small fw-bold">HOUSEHOLDS & PUROKS</span>
          <h2 class="fw-bold text-accent-green m-0">${totalHouseholds || 0}</h2>
          <small class="text-muted">${totalPuroks || 0} Total Registered Puroks</small>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card card-custom p-3 stat-card">
          <span class="text-muted small fw-bold">PENDING REQUESTS</span>
          <h2 class="fw-bold text-primary-blue m-0">${pendingCerts || 0}</h2>
          <small class="text-danger fw-bold">Certificate Applications</small>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card card-custom p-3 stat-card green">
          <span class="text-muted small fw-bold">SPECIAL SECTORS</span>
          <h2 class="fw-bold text-accent-green m-0">${(seniorCitizens || 0) + (pwds || 0) + (soloParents || 0)}</h2>
          <small class="text-muted">Seniors: ${seniorCitizens || 0} | PWD: ${pwds || 0} | Solo: ${soloParents || 0}</small>
        </div>
      </div>
    </div>

    <div class="row g-3">
      <div class="col-md-8">
        <div class="card card-custom p-4">
          <h5 class="fw-bold text-primary-blue mb-3"><i class="bi bi-clock-history me-2"></i>Recent System Activities</h5>
          <div class="table-responsive">
            <table class="table table-hover align-middle">
              <thead class="table-light">
                <tr>
                  <th>User</th>
                  <th>Action</th>
                  <th>Details</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                ${(recentLogs || []).map(log => `
                  <tr>
                    <td class="fw-semibold">${log.users ? log.users.full_name : 'System'}</td>
                    <td><span class="badge bg-primary-blue text-white">${log.action}</span></td>
                    <td class="small">${log.details || '-'}</td>
                    <td class="small text-muted">${new Date(log.created_at).toLocaleString()}</td>
                  </tr>
                `).join('') || '<tr><td colspan="4" class="text-center text-muted">No activity logs recorded.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="col-md-4">
        <div class="card card-custom p-4">
          <h5 class="fw-bold text-primary-blue mb-3"><i class="bi bi-lightning-charge me-2"></i>Quick Actions</h5>
          <div class="d-grid gap-2">
            <a href="/admin/residents?filter=Pending" class="btn btn-outline-primary text-start"><i class="bi bi-person-check me-2"></i> Review Pending Registrations (${pendingRegistrations || 0})</a>
            <a href="/admin/certificates" class="btn btn-outline-success text-start"><i class="bi bi-file-earmark-check me-2"></i> Process Certificates (${pendingCerts || 0})</a>
            <a href="/scanner" class="btn btn-primary-custom text-center py-2 fw-bold text-white"><i class="bi bi-qr-code-scan me-2"></i> Open QR Verification Scanner</a>
            <a href="/scan" class="btn btn-outline-primary text-start"><i class="bi bi-upc-scan me-2"></i> Scan-Only Page (full screen)</a>
          </div>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'dashboard', html, settings));
});

module.exports = router;
