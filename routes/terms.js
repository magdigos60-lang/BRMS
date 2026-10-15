/** Public Terms and Conditions page. */
const express = require('express');
const { escHtml, getSettings } = require('../utils/helpers');
const { renderSystemHead, renderSystemFooter } = require('../views/layout');

const router = express.Router();

// ---------- TERMS AND CONDITIONS (public) ----------
router.get('/terms', async (req, res) => {
  const s = await getSettings();
  const brgy = escHtml(s.barangay_name || 'the Barangay');
  const place = escHtml([s.municipality, s.province].filter(Boolean).join(', '));
  const sections = [
    ['Acceptance of Terms', `By registering for, or logging in to, the ${brgy} Resident Management System (the "System"), you agree to these Terms and Conditions. If you do not agree, please do not register or use the System.`],
    ['Eligibility and Accurate Information', `The System is for bona fide residents of ${brgy}${place ? ', ' + place : ''}. You agree to provide true, complete and current information, and to keep it up to date. Giving false information or using another person's identity may result in rejection or removal of your account and may have legal consequences.`],
    ['Registration and Approval', 'New registrations stay <strong>Pending</strong> until verified and approved by Barangay officials. The Barangay may ask for supporting documents, and may reject or archive a registration that cannot be verified.'],
    ['Account Security', `<ul><li>You are responsible for keeping your password confidential and for all activity under your account.</li><li>Do not share your login with anyone. You can change your password at any time from <em>Account &amp; Password</em>.</li><li>Tell the Barangay office immediately if you suspect unauthorized access.</li></ul>`],
    ['Use of Services', `<ul><li>Certificate requests, appointments, complaints, assistance requests and feedback must be truthful and made in good faith.</li><li>Certificates are released only after approval and presentation of a valid Barangay ID or QR code.</li><li>Aid and relief are released only to verified beneficiaries, with one claim per household per program, subject to the program's rules and availability.</li><li>Approval of any request is at the Barangay's discretion and is not guaranteed.</li></ul>`],
    ['Data Privacy', `The Barangay collects and processes your personal information (such as name, birth date, address, contact details, photo, and category such as senior citizen, PWD, solo parent or student) in line with the Data Privacy Act of 2012 (Republic Act No. 10173). This information is used only to maintain barangay records, issue certificates and IDs, verify identity, and administer programs and aid. Access is limited to authorized Barangay personnel, your information is not sold, and it is kept only as long as needed for these purposes or required by law. You may ask to access or correct your information by contacting the Barangay office.`],
    ['Digital ID and QR Code', 'Your Barangay ID and QR code are personal to you. Do not lend, copy, or alter them. Report a lost or misused ID to the Barangay office right away so it can be replaced.'],
    ['Prohibited Conduct', 'You agree not to: attempt to access other residents\' records or any area you are not authorized for; upload unlawful, offensive or misleading content; interfere with the System\'s operation; or use the System for any purpose other than legitimate barangay transactions.'],
    ['Suspension and Termination', 'The Barangay may suspend, disable or archive an account that violates these Terms or that is found to contain false information.'],
    ['Changes to These Terms', 'These Terms may be updated from time to time. Continued use of the System after an update means you accept the revised Terms.'],
    ['Contact', `For questions about these Terms or your information, please visit the ${brgy} Barangay Hall.`]
  ];
  res.send(`
    ${renderSystemHead('Terms and Conditions')}
    <div class="container py-5">
      <div class="row justify-content-center"><div class="col-lg-9">
        <div class="card card-custom p-4 p-md-5 shadow">
          <div class="text-center mb-4">
            <i class="bi bi-file-earmark-text text-primary-blue fs-1"></i>
            <h3 class="fw-bold text-primary-blue mt-2">Terms and Conditions</h3>
            <p class="text-muted mb-0">${brgy} Resident Management System</p>
          </div>
          ${sections.map((sec, i) => `
            <h6 class="fw-bold text-accent-green mt-4">${i + 1}. ${sec[0]}</h6>
            <div class="text-muted">${sec[1]}</div>`).join('')}
          <div class="text-center mt-5">
            <a href="/register" class="btn btn-accent-custom fw-bold text-white px-4">Register as Resident</a>
            <a href="/login" class="btn btn-outline-secondary px-4 ms-2">Back to Login</a>
          </div>
        </div>
      </div></div>
    </div>
    ${renderSystemFooter()}
  `);
});

module.exports = router;
