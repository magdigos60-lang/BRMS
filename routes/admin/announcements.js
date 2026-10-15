/** Announcements and events. */
const express = require('express');
const { supabase } = require('../../config/index');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { getSettings } = require('../../utils/helpers');
const { renderAppLayout } = require('../../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 14: ANNOUNCEMENTS & EVENTS
// ==========================================
router.get('/admin/announcements', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary']), async (req, res) => {
  const settings = await getSettings();
  const { data: announcements } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-megaphone me-2"></i>Public Announcements</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#addAnnouncementModal"><i class="bi bi-plus-lg me-1"></i> Create Announcement</button>
      </div>

      <div class="row g-3">
        ${(announcements || []).map(a => `
          <div class="col-md-6">
            <div class="card card-custom p-3 border-start border-4 ${a.priority === 'Emergency' ? 'border-danger' : 'border-primary'}">
              <span class="badge ${a.priority === 'Emergency' ? 'bg-danger' : 'bg-primary'} w-auto ms-auto text-white">${a.priority}</span>
              <h5 class="fw-bold text-primary-blue mt-2">${a.title}</h5>
              <p class="text-muted small">${a.content}</p>
              <small class="text-secondary">${new Date(a.created_at).toLocaleDateString()}</small>
            </div>
          </div>
        `).join('') || '<div class="col-12 text-center text-muted">No announcements published.</div>'}
      </div>
    </div>

    <!-- Modal Add Announcement -->
    <div class="modal fade" id="addAnnouncementModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/admin/announcement/add" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">New Announcement</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3"><label class="form-label">Title *</label><input type="text" name="title" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Priority *</label><select name="priority" class="form-select"><option value="Normal">Normal</option><option value="Emergency">Emergency</option></select></div>
              <div class="mb-3"><label class="form-label">Content *</label><textarea name="content" class="form-control" rows="4" required></textarea></div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">Publish Announcement</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'announcements', html, settings));
});

router.post('/api/admin/announcement/add', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const { title, priority, content } = req.body;
  await supabase.from('announcements').insert([{ title, priority, content, created_by: req.user.id }]);
  res.redirect('/admin/announcements');
});

router.get('/admin/events', authenticateToken, requireRole(['Super Admin', 'Barangay Admin', 'Barangay Secretary']), async (req, res) => {
  const settings = await getSettings();
  const { data: events } = await supabase.from('events').select('*').order('event_date', { ascending: true });

  const html = `
    <div class="card card-custom p-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold text-primary-blue m-0"><i class="bi bi-calendar-event me-2"></i>Community Events</h4>
        <button class="btn btn-accent-custom fw-bold text-white" data-bs-toggle="modal" data-bs-target="#addEventModal"><i class="bi bi-plus-lg me-1"></i> Add Event</button>
      </div>

      <div class="row g-3">
        ${(events || []).map(e => `
          <div class="col-md-4">
            <div class="card card-custom p-3 border-top border-4 border-success">
              <h5 class="fw-bold text-primary-blue">${e.event_name}</h5>
              <p class="text-muted small mb-1"><i class="bi bi-calendar3 me-1"></i> ${e.event_date} at ${e.event_time}</p>
              <p class="text-muted small mb-2"><i class="bi bi-geo-alt me-1"></i> ${e.location}</p>
              <p class="small">${e.description}</p>
            </div>
          </div>
        `).join('') || '<div class="col-12 text-center text-muted">No scheduled events.</div>'}
      </div>
    </div>

    <!-- Modal Add Event -->
    <div class="modal fade" id="addEventModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <form action="/api/admin/event/add" method="POST">
            <div class="modal-header bg-primary-blue text-white">
              <h5 class="modal-title fw-bold">Add Community Event</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3"><label class="form-label">Event Name *</label><input type="text" name="event_name" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Date *</label><input type="date" name="event_date" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Time *</label><input type="text" name="event_time" class="form-control" required placeholder="e.g. 9:00 AM"></div>
              <div class="mb-3"><label class="form-label">Location *</label><input type="text" name="location" class="form-control" required></div>
              <div class="mb-3"><label class="form-label">Description *</label><textarea name="description" class="form-control" rows="3" required></textarea></div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary-custom text-white">Save Event</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(renderAppLayout(req, 'events', html, settings));
});

router.post('/api/admin/event/add', authenticateToken, requireRole(['Super Admin', 'Barangay Admin']), async (req, res) => {
  const { event_name, event_date, event_time, location, description } = req.body;
  await supabase.from('events').insert([{ event_name, event_date, event_time, location, description }]);
  res.redirect('/admin/events');
});

module.exports = router;
