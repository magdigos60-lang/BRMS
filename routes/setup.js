/** First-time system setup. */
const express = require('express');
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/index');
const { getSettings } = require('../utils/helpers');
const { renderSystemHead, renderSystemFooter } = require('../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 1: SYSTEM SETUP
// ==========================================
router.get('/setup', async (req, res) => {
  const settings = await getSettings();
  if (settings && settings.setup_completed) return res.redirect('/login');

  res.send(`
    ${renderSystemHead('Initial Setup')}
    <div class="container d-flex justify-content-center align-items-center min-vh-100" style="background: linear-gradient(135deg, #e1f5fe 0%, #d9edf7 100%);">
      <div class="card card-custom p-4 shadow-lg" style="max-width: 550px; width: 100%;">
        <div class="text-center mb-4">
          <i class="bi bi-gear-fill text-primary-blue fs-1"></i>
          <h3 class="fw-bold text-primary-blue mt-2">Initial System Setup</h3>
          <p class="text-muted">Configure your Barangay details and create the Super Administrator account.</p>
        </div>
        <form action="/api/setup" method="POST">
          <h6 class="fw-bold text-accent-green border-bottom pb-2 mb-3">1. Barangay Details</h6>
          <div class="mb-3">
            <label class="form-label">Barangay Name</label>
            <input type="text" name="barangay_name" class="form-control" required placeholder="e.g. Barangay Central">
          </div>
          <div class="row">
            <div class="col-md-6 mb-3">
              <label class="form-label">Municipality / City</label>
              <input type="text" name="municipality" class="form-control" required placeholder="Angeles City">
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">Province</label>
              <input type="text" name="province" class="form-control" required placeholder="Pampanga">
            </div>
          </div>
          <h6 class="fw-bold text-accent-green border-bottom pb-2 mb-3 mt-4">2. Super Admin Credentials</h6>
          <div class="mb-3">
            <label class="form-label">Full Name</label>
            <input type="text" name="full_name" class="form-control" required placeholder="Hon. Admin Name">
          </div>
          <div class="mb-3">
            <label class="form-label">Username</label>
            <input type="text" name="username" class="form-control" required placeholder="admin">
          </div>
          <div class="mb-3">
            <label class="form-label">Email Address</label>
            <input type="email" name="email" class="form-control" required placeholder="admin@barangay.gov.ph">
          </div>
          <div class="mb-3">
            <label class="form-label">Password</label>
            <input type="password" name="password" class="form-control" required minlength="6">
          </div>
          <button type="submit" class="btn btn-primary-custom w-100 py-2 mt-3 fw-bold">Complete System Setup</button>
        </form>
      </div>
    </div>
    ${renderSystemFooter()}
  `);
});

router.post('/api/setup', async (req, res) => {
  const { barangay_name, municipality, province, full_name, username, email, password } = req.body;
  try {
    const { data: existingSettings } = await supabase.from('system_settings').select('*').single();
    if (existingSettings && existingSettings.setup_completed) {
      return res.status(400).send('Setup has already been completed.');
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const { data: user, error: userError } = await supabase.from('users').insert([{
      username, email, password_hash, full_name, role: 'Super Admin', status: 'Active'
    }]).select().single();

    if (userError) throw userError;

    if (existingSettings) {
      await supabase.from('system_settings').update({
        barangay_name, municipality, province, setup_completed: true, updated_at: new Date()
      }).eq('id', existingSettings.id);
    } else {
      await supabase.from('system_settings').insert([{
        barangay_name, municipality, province, setup_completed: true
      }]);
    }

    await supabase.from('puroks').insert([
      { name: 'Purok 1', description: 'Zone 1' },
      { name: 'Purok 2', description: 'Zone 2' },
      { name: 'Purok 3', description: 'Zone 3' }
    ]);

    res.send(`
      ${renderSystemHead('Setup Complete')}
      <div class="container text-center pt-5">
        <div class="card p-5 shadow-lg d-inline-block bg-light-green">
          <i class="bi bi-check-circle-fill text-accent-green display-1"></i>
          <h2 class="mt-3 text-primary-blue fw-bold">System Successfully Setup!</h2>
          <p class="text-muted">Administrator account has been initialized.</p>
          <a href="/login" class="btn btn-primary-custom px-4 py-2 mt-3 fw-bold">Go to Login Page</a>
        </div>
      </div>
      ${renderSystemFooter()}
    `);
  } catch (err) {
    console.error('Setup Post Error:', err);
    res.status(500).send('Error completing setup: ' + err.message);
  }
});

module.exports = router;
