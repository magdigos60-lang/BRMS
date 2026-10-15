/** Appointments. */
const express = require('express');
const { supabase } = require('../../config/index');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { getSettings } = require('../../utils/helpers');
const { renderAppLayout } = require('../../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 13: APPOINTMENTS
// ==========================================
router.get('/admin/appointments', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff']), async (req, res) => {
  const settings = await getSettings();
  const { data: appointments } = await supabase.from('appointments').select('*, residents(first_name, last_name)').order('created_at', { ascending: false });

  const html = `
    <div class="card card-custom p-4">
      <h4 class="fw-bold text-primary-blue mb-3"><i class="bi bi-calendar-check me-2"></i>Resident Appointment Schedule</h4>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Appt No</th>
              <th>Resident</th>
              <th>Service</th>
              <th>Date & Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${(appointments || []).map(a => `
              <tr>
                <td class="fw-bold text-primary-blue">${a.appointment_number}</td>
                <td>${a.residents ? `${a.residents.first_name} ${a.residents.last_name}` : 'Unknown'}</td>
                <td>${a.service_requested}</td>
                <td>${a.appointment_date} at ${a.appointment_time}</td>
                <td><span class="badge bg-primary text-white">${a.status}</span></td>
              </tr>
            `).join('') || '<tr><td colspan="5" class="text-center py-4 text-muted">No appointments scheduled.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'appointments', html, settings));
});

module.exports = router;
