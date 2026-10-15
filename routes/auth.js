/** Login page, login API and logout. */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase, JWT_SECRET } = require('../config/index');
const { logActivity } = require('../middleware/auth');
const { getSettings } = require('../utils/helpers');
const { renderSystemHead, renderSystemFooter } = require('../views/layout');

const router = express.Router();

// ==========================================
// ROUTE 2: REDESIGNED LOGIN PAGE (GRADIENT GREEN (TOP) & BLUE (BOTTOM) + HORIZONTAL SPLIT RECTANGLE CARD)
// ==========================================
router.get('/login', async (req, res) => {
  const settings = await getSettings();
  const bgImg = 'https://scontent.fmnl33-4.fna.fbcdn.net/v/t39.30808-6/825351115_2246821486242027_8708722577315615068_n.jpg?stp=dst-jpg_tt6&cstp=mx1060x992&ctp=s1060x992&_nc_cat=110&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=127cfc&_nc_eui2=AeHpk_cBk3_TrQDPpACbx68fjQwB0jaJYXWNDAHSNolhdfR3vwGsh31cD5-A7Nb3qzplS4aAfDftzWcsmyDXAsnf&_nc_ohc=zPWWgjIxijoQ7kNvwFRKLVb&_nc_oc=AdpZBQL9o8MZk4xIiBL9pR6vKPkB7bvmqkM4R26op6LLy9SHE6Qd009laEUr-_vlHfE&_nc_zt=23&_nc_ht=scontent.fmnl33-4.fna&_nc_gid=A3E_5De3Kcc14pam4H4mgA&_nc_ss=7b2a8&oh=00_AQN0FSG7xTxJGzBY3rAhHoIZqJoNuUuFP2P_2cdm47NTxw&oe=6AC4DD7C';
  
  const { data: officials } = await supabase.from('barangay_officials').select('*');

  res.send(`
    ${renderSystemHead('Login')}
    <style>
      html {
        scroll-behavior: smooth;
      }
      body {
        background-color: #0b2545;
        overflow-x: hidden;
      }
      .login-section {
        min-height: 100vh;
        /* Green sa taas, Blue sa baba, hindi masyadong madilim */
        background: linear-gradient(180deg, rgba(46, 204, 113, 0.75), rgba(32, 84, 147, 0.75)), url('${bgImg}');
        background-size: cover;
        background-position: center;
        background-attachment: fixed;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        position: relative;
      }
      /* Horizontal rectangle login fields with split in the middle, blue and green background colors */
      .horizontal-login-card {
        background: linear-gradient(135deg, #d9edf7 0%, #e1f5fe 100%);
        border: 2px solid rgba(46, 204, 113, 0.5);
        border-radius: 20px;
        box-shadow: 0 20px 40px rgba(32, 84, 147, 0.25);
        max-width: 900px;
        width: 100%;
        overflow: hidden;
        transition: transform 0.3s ease;
      }
      .horizontal-login-card:hover {
        transform: translateY(-4px);
      }
      .brand-logo-img {
        width: 140px;
        height: 140px;
        object-fit: cover;
        border-radius: 50%;
        border: none;
        box-shadow: 0 6px 15px rgba(32, 84, 147, 0.25);
      }
      .form-control-horizontal {
        height: 48px;
        border-radius: 8px;
        font-size: 1rem;
      }
      .input-group-horizontal {
        border-radius: 8px;
        overflow: hidden;
      }
      .input-group-text {
        background-color: #205493 !important;
        color: white !important;
        border: 1px solid #ced4da;
        width: 48px;
        justify-content: center;
      }
      .btn-glow {
        background-color: #205493;
        border: none;
        border-radius: 10px;
        padding: 12px;
        font-size: 1rem;
        letter-spacing: 0.5px;
        box-shadow: 0 4px 15px rgba(32, 84, 147, 0.4);
        transition: all 0.25s ease;
      }
      .btn-glow:hover {
        background-color: #0b2545;
        box-shadow: 0 6px 20px rgba(11, 37, 69, 0.6);
      }
      .scroll-down-hint {
        position: absolute;
        bottom: 25px;
        color: #ffffff;
        text-align: center;
        animation: bounce 2s infinite;
        text-decoration: none;
        font-weight: 700;
        background: rgba(11, 37, 69, 0.8);
        padding: 8px 18px;
        border-radius: 30px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.2);
      }
      @keyframes bounce {
        0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-8px); }
        60% { transform: translateY(-4px); }
      }
      .officials-section {
        padding: 90px 20px;
        background: linear-gradient(180deg, #d9edf7 0%, #e1f5fe 100%);
      }
      .official-card {
        border-radius: 16px;
        border: 1px solid #a3e4d7;
        background: white;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
      }
      .official-card:hover {
        transform: translateY(-6px);
        box-shadow: 0 12px 24px rgba(32, 84, 147, 0.15);
      }
      .official-photo {
        width: 130px;
        height: 130px;
        object-fit: cover;
        border-radius: 50%;
        border: none;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1);
      }
    </style>

    <!-- SECTION 1: LOGIN CARD CONTAINER (Horizontal Split Rectangle with Blue/Green BG) -->
    <div class="login-section">
      <div class="horizontal-login-card">
        <div class="row g-0">
          <!-- Left Side: Logo and Information -->
          <div class="col-md-5 p-5 d-flex flex-column justify-content-center align-items-center text-center text-white" style="background: linear-gradient(135deg, #205493 0%, #2ecc71 100%);">
            ${settings.barangay_logo ? `<img src="${settings.barangay_logo}" class="brand-logo-img mb-3">` : '<i class="bi bi-building-fill text-white display-3 mb-2"></i>'}
            <h3 class="fw-bold m-0 text-white">${settings.barangay_name || 'BARANGAY PORTAL'}</h3>
            <p class="small mt-2 mb-3 opacity-75">Resident & Administration System. Fast, secure, and accessible community governance.</p>
            <span class="badge bg-white text-dark px-3 py-2 rounded-pill shadow-sm"><i class="bi bi-shield-check me-1 text-success"></i> Official Portal</span>
          </div>

          <!-- Right Side: Username, Password, Are you a resident without an account?, Register as Resident -->
          <div class="col-md-7 p-5 d-flex flex-column justify-content-center bg-white">
            <h4 class="fw-bold text-primary-blue mb-4"><i class="bi bi-box-arrow-in-right me-2"></i>Sign In</h4>

            <form action="/api/login" method="POST">
              <div class="mb-3">
                <label class="form-label fw-semibold text-secondary small">USERNAME OR EMAIL</label>
                <div class="input-group input-group-horizontal">
                  <span class="input-group-text"><i class="bi bi-person-fill fs-5"></i></span>
                  <input type="text" name="identifier" class="form-control form-control-horizontal border-start-0" required placeholder="Enter username or email">
                </div>
              </div>
              <div class="mb-4">
                <label class="form-label fw-semibold text-secondary small">PASSWORD</label>
                <div class="input-group input-group-horizontal">
                  <span class="input-group-text"><i class="bi bi-lock-fill fs-5"></i></span>
                  <input type="password" name="password" class="form-control form-control-horizontal border-start-0" required placeholder="Enter your password">
                </div>
              </div>
              <button type="submit" class="btn btn-primary btn-glow w-100 fw-bold text-white"><i class="bi bi-box-arrow-in-right me-2"></i>Sign In to Account</button>
            </form>

            <div class="text-center mt-4 border-top pt-3">
              <p class="small text-muted mb-1">Are you a resident without an account?</p>
              <a href="/register" class="text-accent-green fw-bold text-decoration-none"><i class="bi bi-person-plus-fill me-1"></i> Register as Resident</a>
              <div class="mt-2 small"><a href="/terms" target="_blank" class="text-muted text-decoration-none"><i class="bi bi-file-earmark-text me-1"></i>Terms and Conditions</a></div>
            </div>
          </div>
        </div>
      </div>

      <a href="#officials-section" class="scroll-down-hint mt-4">
        <span class="d-block small">Scroll down to view Barangay Officials & Pictures</span>
        <i class="bi bi-chevron-down fs-5"></i>
      </a>
    </div>

    <!-- SECTION 2: SCROLLABLE BARANGAY OFFICIALS SHOWCASE WITH PICTURES -->
    <div id="officials-section" class="officials-section">
      <div class="container">
        <div class="text-center mb-5">
          <h2 class="fw-bold" style="color: #0b2545;"><i class="bi bi-person-lines-fill me-2 text-accent-green"></i>Barangay Officials & Council</h2>
          <p class="text-muted">Dedicated leaders serving our community with transparency, diligence, and care.</p>
          <div class="mx-auto bg-accent-green" style="height: 4px; width: 80px; border-radius: 2px;"></div>
        </div>

        <div class="row g-4 justify-content-center">
          ${(officials || []).map(o => `
            <div class="col-md-4 col-lg-3">
              <div class="card official-card p-4 text-center h-100 shadow-sm">
                <img src="${o.photo_url || 'https://via.placeholder.com/130'}" class="official-photo mx-auto mb-3" alt="${o.name}">
                <h5 class="fw-bold text-dark mb-1">${o.name}</h5>
                <span class="badge bg-primary-blue px-3 py-2 rounded-pill mt-1 mb-2 text-white">${o.position}</span>
                ${o.signature_url ? `<img src="${o.signature_url}" class="d-block mx-auto mt-2" style="height: 32px; object-fit: contain;" alt="Signature">` : ''}
              </div>
            </div>
          `).join('') || `
            <div class="col-12 text-center text-muted py-5">
              <i class="bi bi-people fs-1 text-secondary"></i>
              <p class="mt-2">No official records available at this time. Admin can add officials in the dashboard.</p>
            </div>
          `}
        </div>
      </div>
    </div>
    ${renderSystemFooter()}
  `);
});

router.post('/api/login', async (req, res) => {
  const { identifier, password } = req.body;
  try {
    const { data: user, error } = await supabase.from('users').select('*').or(`username.eq.${identifier},email.eq.${identifier}`).single();
    if (error || !user) {
      return res.status(400).send('<script>alert("Invalid identifier or password."); window.location="/login";</script>');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).send('<script>alert("Invalid identifier or password."); window.location="/login";</script>');
    }

    if (user.status !== 'Active') {
      return res.status(403).send('<script>alert("Your account is pending approval or disabled."); window.location="/login";</script>');
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    res.cookie('token', token, { httpOnly: true, maxAge: 12 * 3600 * 1000 });

    await supabase.from('login_history').insert([{ user_id: user.id, status: 'Success' }]);
    await logActivity(user.id, 'User Login', 'User authenticated successfully.');

    if (['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff'].includes(user.role)) {
      const returnTo = req.cookies.return_to;
      res.clearCookie('return_to');
      if (returnTo && /^\/(scan|scanner)(\?.*)?$/.test(returnTo)) return res.redirect(returnTo);
      return res.redirect('/admin/dashboard');
    } else {
      return res.redirect('/resident/dashboard');
    }
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).send('Server error during authentication.');
  }
});

router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

module.exports = router;
