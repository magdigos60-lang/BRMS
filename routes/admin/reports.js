/** Reports and demographics. */
const express = require('express');
const { supabase } = require('../../config/index');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { getSettings } = require('../../utils/helpers');
const { renderAppLayout } = require('../../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 17: REPORTS & DEMOGRAPHICS
// ==========================================
router.get('/admin/reports', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();

  const [
    { count: totalRes },
    { count: maleCount },
    { count: femaleCount },
    { count: seniorCount }
  ] = await Promise.all([
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'Active'),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'Active').eq('gender', 'Male'),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'Active').eq('gender', 'Female'),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('resident_status', 'Active').eq('is_senior_citizen', true)
  ]);

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-bar-chart-line me-2"></i>Barangay Demographic & Statistical Reports</h4>
        <button class="btn btn-outline-primary no-print" onclick="window.print()"><i class="bi bi-printer me-1"></i> Print Demographic Summary</button>
      </div>

      <div class="row g-3">
        <div class="col-md-3">
          <div class="p-3 bg-light-blue rounded text-center border">
            <h6 class="text-muted fw-bold">TOTAL POPULATION</h6>
            <h2 class="text-primary-blue fw-bold">${totalRes || 0}</h2>
          </div>
        </div>
        <div class="col-md-3">
          <div class="p-3 bg-light-green rounded text-center border">
            <h6 class="text-muted fw-bold">MALE RESIDENTS</h6>
            <h2 class="text-accent-green fw-bold">${maleCount || 0}</h2>
          </div>
        </div>
        <div class="col-md-3">
          <div class="p-3 bg-light-blue rounded text-center border">
            <h6 class="text-muted fw-bold">FEMALE RESIDENTS</h6>
            <h2 class="text-primary-blue fw-bold">${femaleCount || 0}</h2>
          </div>
        </div>
        <div class="col-md-3">
          <div class="p-3 bg-light-green rounded text-center border">
            <h6 class="text-muted fw-bold">SENIOR CITIZENS</h6>
            <h2 class="text-accent-green fw-bold">${seniorCount || 0}</h2>
          </div>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'reports', html, settings));
});

module.exports = router;
