/** Activity logs. */
const express = require('express');
const { supabase } = require('../../config/index');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { getSettings } = require('../../utils/helpers');
const { renderAppLayout } = require('../../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 18: ACTIVITY LOGS
// ==========================================
router.get('/admin/activity-logs', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const settings = await getSettings();
  const { data: logs } = await supabase.from('user_activity_logs').select('*, users(full_name)').order('created_at', { ascending: false }).limit(50);

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-clock-history me-2"></i>System User Activity & Audit Logs</h4>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${(logs || []).map(l => `
              <tr>
                <td class="small text-muted">${new Date(l.created_at).toLocaleString()}</td>
                <td class="fw-semibold">${l.users ? l.users.full_name : 'System'}</td>
                <td><span class="badge bg-primary-blue text-white">${l.action}</span></td>
                <td class="small">${l.details || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'activity-logs', html, settings));
});

module.exports = router;
