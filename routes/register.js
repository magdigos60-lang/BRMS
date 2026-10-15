/** Public resident registration (with Terms & Conditions agreement). */
const express = require('express');
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/index');
const { getSettings } = require('../utils/helpers');
const { categoryFlags, renderCategoryCheckboxes } = require('../utils/categories');
const { renderSystemHead, renderSystemFooter } = require('../views/layout');

const router = express.Router();

router.get('/register', async (req, res) => {
  const { data: puroks } = await supabase.from('puroks').select('*');
  const settings = await getSettings();

  res.send(`
    ${renderSystemHead('Resident Registration')}
    <div class="container py-5">
      <div class="row justify-content-center">
        <div class="col-md-8">
          <div class="card card-custom p-4 shadow">
            <div class="text-center mb-4">
              <h3 class="fw-bold text-primary-blue"><i class="bi bi-person-badge me-2"></i>Resident Public Registration</h3>
              <p class="text-muted">Complete the official form. Registrations undergo approval by Barangay Officials.</p>
            </div>
            <form action="/api/register" method="POST">
              <h6 class="fw-bold text-accent-green border-bottom pb-2 mb-3">Personal Information</h6>
              <div class="row">
                <div class="col-md-4 mb-3">
                  <label class="form-label">First Name *</label>
                  <input type="text" name="first_name" class="form-control" required placeholder="First Name">
                </div>
                <div class="col-md-4 mb-3">
                  <label class="form-label">Middle Name</label>
                  <input type="text" name="middle_name" class="form-control" placeholder="Middle Name">
                </div>
                <div class="col-md-4 mb-3">
                  <label class="form-label">Last Name *</label>
                  <input type="text" name="last_name" class="form-control" required placeholder="Last Name">
                </div>
              </div>
              <div class="row">
                <div class="col-md-3 mb-3">
                  <label class="form-label">Suffix</label>
                  <input type="text" name="suffix" class="form-control" placeholder="e.g. Jr., III">
                </div>
                <div class="col-md-3 mb-3">
                  <label class="form-label">Date of Birth *</label>
                  <input type="date" name="date_of_birth" class="form-control" required>
                </div>
                <div class="col-md-3 mb-3">
                  <label class="form-label">Gender *</label>
                  <select name="gender" class="form-select" required>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div class="col-md-3 mb-3">
                  <label class="form-label">Civil Status *</label>
                  <select name="civil_status" class="form-select" required>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Widowed">Widowed</option>
                    <option value="Separated">Separated</option>
                  </select>
                </div>
              </div>

              <h6 class="fw-bold text-accent-green border-bottom pb-2 mb-3 mt-3">Address & Contact</h6>
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">Purok *</label>
                  <select name="purok_id" class="form-select" required>
                    ${(puroks || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                  </select>
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">Complete House Address *</label>
                  <input type="text" name="address" class="form-control" required placeholder="House No., Street Name">
                </div>
              </div>
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">Contact Number *</label>
                  <input type="text" name="contact_number" class="form-control" required placeholder="09XXXXXXXXX">
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">Occupation</label>
                  <input type="text" name="occupation" class="form-control" placeholder="Occupation">
                </div>
              </div>

              <h6 class="fw-bold text-accent-green border-bottom pb-2 mb-3 mt-3">Resident Category</h6>
              <p class="small text-muted mb-2">Tick all that apply to you. These help the barangay decide who qualifies for aid programs.</p>
              <div class="mb-3">${renderCategoryCheckboxes({}, 'regCat')}</div>

              <h6 class="fw-bold text-accent-green border-bottom pb-2 mb-3 mt-3">Household</h6>
              <div class="mb-2">
                <div class="form-check">
                  <input class="form-check-input" type="radio" name="household_mode" id="hhExisting" value="existing" checked>
                  <label class="form-check-label" for="hhExisting">My household is already registered (join it)</label>
                </div>
                <div class="form-check">
                  <input class="form-check-input" type="radio" name="household_mode" id="hhNew" value="new">
                  <label class="form-check-label" for="hhNew">Register a new household</label>
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label">Household Name *</label>
                <input type="text" name="household_name" id="hhName" class="form-control" required maxlength="100" placeholder="Existing household name">
                <small class="text-muted" id="hhHelp">Type the exact household name used by your family members when they registered.</small>
              </div>
              <script>
                (function () {
                  var help = document.getElementById('hhHelp'), name = document.getElementById('hhName');
                  function upd() {
                    var isNew = document.getElementById('hhNew').checked;
                    help.textContent = isNew
                      ? 'Choose a name for your new household (e.g. the family surname). Other family members will use this same name to join.'
                      : 'Type the exact household name used by your family members when they registered.';
                    name.placeholder = isNew ? 'e.g. Dela Cruz Family' : 'Existing household name';
                  }
                  document.getElementById('hhExisting').addEventListener('change', upd);
                  document.getElementById('hhNew').addEventListener('change', upd);
                })();
              </script>

              <h6 class="fw-bold text-accent-green border-bottom pb-2 mb-3 mt-3">Account Credentials</h6>
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">Email Address (Username) *</label>
                  <input type="email" name="email" class="form-control" required placeholder="name@email.com">
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">Account Password *</label>
                  <input type="password" name="password" class="form-control" required minlength="6">
                </div>
              </div>

              <div class="form-check mt-3">
                <input class="form-check-input" type="checkbox" name="agree_terms" id="agreeTerms" required>
                <label class="form-check-label small" for="agreeTerms">I have read and agree to the <a href="/terms" target="_blank">Terms and Conditions</a> and consent to the processing of my personal information for barangay services. *</label>
              </div>
              <button type="submit" class="btn btn-accent-custom w-100 py-2 mt-3 fw-bold">Submit Registration Request</button>
              <div class="text-center mt-3">
                <a href="/login" class="text-decoration-none text-primary-blue">Back to Login</a>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
    ${renderSystemFooter()}
  `);
});

router.post('/api/register', async (req, res) => {
  try {
    const first_name = (req.body.first_name || '').trim();
    const middle_name = (req.body.middle_name || '').trim();
    const last_name = (req.body.last_name || '').trim();
    const suffix = (req.body.suffix || '').trim();
    const date_of_birth = req.body.date_of_birth;
    const gender = req.body.gender || 'Male';
    const civil_status = req.body.civil_status || 'Single';
    const purok_id = req.body.purok_id || null;
    const address = (req.body.address || '').trim();
    const contact_number = (req.body.contact_number || '').trim();
    const occupation = (req.body.occupation || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password;
    const household_mode = req.body.household_mode === 'new' ? 'new' : 'existing';
    const household_name = (req.body.household_name || '').replace(/\s+/g, ' ').trim();

    if (!req.body.agree_terms) {
      return res.status(400).send('<script>alert("You must agree to the Terms and Conditions to register."); window.history.back();</script>');
    }

    if (!household_name) {
      return res.status(400).send('<script>alert("Please enter your household name."); window.history.back();</script>');
    }

    if (!first_name || !last_name || !date_of_birth || !address || !email || !password) {
      return res.status(400).send('<script>alert("Please fill in all required fields."); window.history.back();</script>');
    }

    const { data: existingUser } = await supabase.from('users').select('*').eq('email', email).single();
    if (existingUser) {
      return res.status(400).send('<script>alert("Email is already registered."); window.location="/register";</script>');
    }

    // ----- Household: join an existing one by name, or register a new one -----
    // (Names are matched privately on the server; the public form never lists other households.)
    const likeName = household_name.replace(/[\\%_]/g, m => '\\' + m);
    const { data: foundHh } = await supabase.from('households').select('id').ilike('household_name', likeName).limit(1).maybeSingle();
    if (household_mode === 'existing' && !foundHh) {
      return res.status(400).send('<script>alert("No household with that name was found. Check the spelling, or choose Register a new household."); window.history.back();</script>');
    }
    if (household_mode === 'new' && foundHh) {
      return res.status(400).send('<script>alert("A household with that name already exists. Choose My household is already registered to join it, or use a different name."); window.history.back();</script>');
    }
    let household_id = foundHh ? foundHh.id : null;
    let createdHouseholdId = null;
    if (household_mode === 'new') {
      const household_number = `HH-${Date.now().toString().slice(-6)}`;
      const { data: newHh, error: hhErr } = await supabase.from('households').insert([{
        household_number, household_name, head_resident_name: `${first_name} ${last_name}`, purok_id, address
      }]).select().single();
      if (hhErr) throw hhErr;
      household_id = newHh.id;
      createdHouseholdId = newHh.id;
    }

    const year = new Date().getFullYear();
    const countRes = await supabase.from('residents').select('id', { count: 'exact' });
    const sequenceNum = String((countRes.count || 0) + 1).padStart(6, '0');
    const resident_number = `BRGY-${year}-${sequenceNum}`;

    const dob = new Date(date_of_birth);
    const age = new Date().getFullYear() - dob.getFullYear();
    const is_senior_citizen = age >= 60;

    const { data: resident, error: resErr } = await supabase.from('residents').insert([{
      resident_number, 
      first_name, 
      middle_name, 
      last_name, 
      suffix, 
      date_of_birth, 
      gender,
      civil_status, 
      purok_id, 
      address, 
      contact_number, 
      occupation, 
      email,
      resident_status: 'Pending', 
      ...categoryFlags(req.body),
      is_senior_citizen: is_senior_citizen || !!req.body.cat_senior,
      household_id
    }]).select().single();

    if (resErr) {
      if (createdHouseholdId) await supabase.from('households').delete().eq('id', createdHouseholdId);
      throw resErr;
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    await supabase.from('users').insert([{
      username: email, 
      email, 
      password_hash, 
      full_name: `${first_name} ${last_name}`,
      role: 'Resident', 
      status: 'Pending', 
      resident_id: resident.id
    }]);

    res.send(`
      ${renderSystemHead('Registration Pending')}
      <div class="container text-center pt-5">
        <div class="card p-5 shadow-lg d-inline-block bg-light-green" style="max-width: 500px;">
          <i class="bi bi-clock-history text-warning display-1"></i>
          <h3 class="mt-3 text-primary-blue fw-bold">Registration Received</h3>
          <p class="text-muted">Your resident registration reference is <strong>${resident_number}</strong>. Please wait for official approval from Barangay Admin before logging in.</p>
          <a href="/login" class="btn btn-primary-custom mt-3">Return to Login</a>
        </div>
      </div>
      ${renderSystemFooter()}
    `);
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).send('Error registering account: ' + err.message);
  }
});

module.exports = router;
