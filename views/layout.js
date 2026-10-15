/** Page <head>/footer, global styles and the sidebar layout. */


// ==========================================
// INLINE CORE HTML/CSS SYSTEM STYLES ENGINE
// Palette Refined with Light Green & Light Blue Themes
// ==========================================
const renderSystemHead = (title) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Barangay Resident System</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css" rel="stylesheet">
  <style>
    :root {
      --primary-navy: #0b2545;
      --primary-blue: #205493;
      --light-blue: #d9edf7;
      --accent-green: #2ecc71;
      --light-green: #e1f5fe;
      --soft-mint: #d4edda;
      --pure-white: #ffffff;
      --bg-light: #f4f9f6;
      --text-dark: #1d2d44;
    }
    body {
      background-color: var(--bg-light);
      color: var(--text-dark);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    .bg-primary-blue { background-color: var(--primary-blue) !important; }
    .bg-dark-blue { background-color: var(--primary-navy) !important; }
    .bg-accent-green { background-color: var(--accent-green) !important; }
    .bg-light-green { background-color: var(--light-green) !important; }
    .bg-light-blue { background-color: var(--light-blue) !important; }
    
    .text-primary-blue { color: var(--primary-blue) !important; }
    .text-accent-green { color: var(--accent-green) !important; }
    
    .btn-primary-custom {
      background-color: var(--primary-blue);
      color: white;
      border: none;
    }
    .btn-primary-custom:hover {
      background-color: var(--primary-navy);
      color: white;
    }
    .btn-accent-custom {
      background-color: var(--accent-green);
      color: white;
      border: none;
    }
    .btn-accent-custom:hover {
      background-color: #27ae60;
      color: white;
    }
    .sidebar {
      min-height: 100vh;
      background: linear-gradient(180deg, var(--primary-navy) 0%, var(--primary-blue) 100%);
      color: white;
    }
    .sidebar .nav-link {
      color: rgba(255, 255, 255, 0.85);
      font-weight: 500;
      padding: 10px 18px;
      margin: 2px 10px;
      border-radius: 6px;
    }
    .sidebar .nav-link:hover, .sidebar .nav-link.active {
      background-color: var(--accent-green);
      color: white;
    }
    .sidebar .nav-link.sub-link {
      padding: 8px 14px 8px 30px;
      font-size: 0.92rem;
      margin: 1px 10px;
    }
    .sidebar .menu-group-toggle .menu-chevron { transition: transform .2s; }
    .sidebar .menu-group-toggle.collapsed .menu-chevron { transform: rotate(-90deg); }
    .sidebar .menu-group-toggle:hover { background-color: rgba(255,255,255,0.12); }
    .card-custom {
      background-color: var(--pure-white);
      border-radius: 12px;
      border: 1px solid #d1e7dd;
      box-shadow: 0 4px 10px rgba(32, 84, 147, 0.05);
    }
    .stat-card {
      border-left: 5px solid var(--primary-blue);
      background: linear-gradient(135deg, #ffffff 0%, var(--light-blue) 100%);
    }
    .stat-card.green {
      border-left: 5px solid var(--accent-green);
      background: linear-gradient(135deg, #ffffff 0%, var(--light-green) 100%);
    }

    /* Standardized CR80 ID Card Frame (3.375in x 2.125in) */
    .id-card-frame {
      width: 3.375in;
      height: 2.125in;
      border-radius: 10px;
      border: 2px solid var(--primary-blue);
      background: #ffffff;
      position: relative;
      overflow: hidden;
      font-size: 8pt;
      box-shadow: 0 6px 12px rgba(0,0,0,0.12);
      display: inline-block;
      margin: 6px;
      box-sizing: border-box;
    }
    .id-card-header {
      background: linear-gradient(90deg, var(--primary-navy) 0%, var(--accent-green) 100%);
      color: white;
      padding: 4px 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 0.42in;
    }
    .id-header-logo {
      width: 0.32in;
      height: 0.32in;
      object-fit: cover;
      border-radius: 50%;
      /* Tinanggal ang outer lines */
      border: none;
    }
    .id-card-body {
      padding: 6px;
      display: flex;
      gap: 8px;
      height: calc(2.125in - 0.72in);
    }
    .id-photo {
      width: 1.05in;
      height: 1.05in;
      object-fit: cover;
      border: 2px solid var(--primary-blue);
      border-radius: 6px;
      flex-shrink: 0;
    }
    .id-details {
      flex-grow: 1;
      font-size: 7.2pt;
      line-height: 1.2;
      overflow: hidden;
    }
    .id-qr {
      width: 1.05in;
      height: 1.05in;
      object-fit: contain;
      flex-shrink: 0;
    }
    .id-card-footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 0.30in;
      padding: 0 8px 3px 8px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      background: #ffffff;
    }
    .print-sheet-8 {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      width: 8.5in;
      margin: auto;
    }

    /* ===== GLOBAL LOADING INDICATORS ===== */
    #page-loader {
      position: fixed; inset: 0; z-index: 99999;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
      background: rgba(244, 249, 246, 0.92);
      backdrop-filter: blur(3px);
      opacity: 1; visibility: visible;
      transition: opacity .3s ease, visibility .3s ease;
      /* failsafe: never stay stuck if JS fails */
      animation: loaderFailsafe 0s linear 10s forwards;
    }
    #page-loader.hidden { opacity: 0; visibility: hidden; pointer-events: none; }
    #page-loader .loader-ring {
      width: 56px; height: 56px; border-radius: 50%;
      border: 5px solid var(--light-blue);
      border-top-color: var(--primary-blue);
      border-right-color: var(--accent-green);
      animation: loaderSpin .8s linear infinite;
    }
    #page-loader .loader-text {
      font-weight: 600; letter-spacing: .5px; color: var(--primary-navy);
    }
    #top-progress {
      position: fixed; top: 0; left: 0; height: 3px; width: 0; z-index: 100000;
      background: linear-gradient(90deg, var(--primary-blue), var(--accent-green));
      box-shadow: 0 0 8px var(--accent-green);
      transition: width .4s ease, opacity .3s ease;
    }
    .btn-loading-spinner {
      display: inline-block; width: 1em; height: 1em; margin-right: 6px; vertical-align: -2px;
      border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%;
      animation: loaderSpin .7s linear infinite;
    }
    @keyframes loaderSpin { to { transform: rotate(360deg); } }
    @keyframes loaderFailsafe { to { opacity: 0; visibility: hidden; pointer-events: none; } }
    @media print { #page-loader, #top-progress { display: none !important; } }

    @media print {
      .no-print { display: none !important; }
      body { background: white !important; }
      .print-sheet-8 { page-break-after: always; }
    }
  </style>
</head>
<body>
  <div id="top-progress"></div>
  <div id="page-loader">
    <div class="loader-ring"></div>
    <div class="loader-text" id="page-loader-text">Loading...</div>
  </div>
`;

const renderSystemFooter = () => `
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script>
    function showNotification(title, message, isError = false) {
      alert((isError ? 'Error: ' : 'Info: ') + message);
    }

    // ===== Loading indicator logic =====
    (function () {
      var loader = document.getElementById('page-loader');
      var loaderText = document.getElementById('page-loader-text');
      var bar = document.getElementById('top-progress');
      var barTimer = null;

      function startBar() {
        if (!bar) return;
        bar.style.opacity = '1';
        bar.style.width = '15%';
        var w = 15;
        clearInterval(barTimer);
        barTimer = setInterval(function () {
          w += (90 - w) * 0.08;
          bar.style.width = w + '%';
        }, 250);
      }
      function resetBar() {
        if (!bar) return;
        clearInterval(barTimer);
        bar.style.width = '100%';
        setTimeout(function () { bar.style.opacity = '0'; bar.style.width = '0'; }, 300);
      }
      function showLoader(text) {
        if (loaderText) loaderText.textContent = text || 'Loading...';
        if (loader) loader.classList.remove('hidden');
        startBar();
      }
      function hideLoader() {
        if (loader) loader.classList.add('hidden');
        resetBar();
        document.querySelectorAll('button[data-was-loading], input[data-was-loading]').forEach(function (b) {
          b.disabled = false;
          if (b.dataset.origHtml !== undefined) b.innerHTML = b.dataset.origHtml;
          b.removeAttribute('data-was-loading');
        });
      }

      // Hide the first-paint loader once everything (CSS, images, fonts) has loaded
      if (document.readyState === 'complete') hideLoader();
      else window.addEventListener('load', hideLoader);
      // Back/forward cache restore
      window.addEventListener('pageshow', function (e) { if (e.persisted) hideLoader(); });

      // Forms: show spinner on submit (skips if a confirm() or validation blocked it)
      document.addEventListener('submit', function (e) {
        var form = e.target;
        if (e.defaultPrevented || !form || form.hasAttribute('data-no-loader')) return;
        var isUpload = form.enctype === 'multipart/form-data';
        showLoader(isUpload ? 'Uploading, please wait...' : 'Processing, please wait...');
        // Disable submit buttons AFTER submission starts (prevents double-click duplicates)
        setTimeout(function () {
          form.querySelectorAll('button[type="submit"], button:not([type]), input[type="submit"]').forEach(function (b) {
            b.setAttribute('data-was-loading', '1');
            if (b.tagName === 'BUTTON') {
              b.dataset.origHtml = b.innerHTML;
              b.innerHTML = '<span class="btn-loading-spinner"></span>Please wait...';
            }
            b.disabled = true;
          });
        }, 0);
      }, false);

      // Internal links / action links: show loader while next page loads
      document.addEventListener('click', function (e) {
        var a = e.target.closest ? e.target.closest('a[href]') : null;
        if (!a || e.defaultPrevented) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
        if (a.target && a.target !== '_self') return;
        if (a.hasAttribute('download') || a.hasAttribute('data-bs-toggle') || a.hasAttribute('data-no-loader')) return;
        var href = a.getAttribute('href') || '';
        if (!href || href.charAt(0) === '#' || /^(javascript:|mailto:|tel:)/i.test(href)) return;
        try {
          var url = new URL(a.href, window.location.href);
          if (url.origin !== window.location.origin) return;
          if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
        } catch (err) { return; }
        showLoader('Loading...');
      }, false);

      // Safety net: if navigation is cancelled (e.g. file download), don't leave the overlay stuck
      window.addEventListener('beforeunload', function () { startBar(); });
      window.__showLoader = showLoader;
      window.__hideLoader = hideLoader;
    })();
  </script>
</body>
</html>
`;

// Layout Wrapper with Responsive Sidebar (Pinalaki ang Logos at tinanggal ang outer lines)
const renderAppLayout = (req, activeModule, contentHtml, settings = {}) => {
  const user = req.user || {};
  const isAdmin = ['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff'].includes(user.role);

  // Related pages are combined under one collapsible category.
  const adminMenu = [
    { id: 'dashboard', label: 'Dashboard', icon: 'bi-speedometer2', link: '/admin/dashboard' },
    { group: 'Residents', icon: 'bi-people', items: [
      { id: 'residents', label: 'Resident Management', icon: 'bi-people', link: '/admin/residents' },
      { id: 'households', label: 'Households', icon: 'bi-house-door', link: '/admin/households' },
      { id: 'puroks', label: 'Puroks', icon: 'bi-geo-alt', link: '/admin/puroks' },
    ]},
    { group: 'Requests & Services', icon: 'bi-journal-check', items: [
      { id: 'certificates', label: 'Certificate Requests', icon: 'bi-file-earmark-text', link: '/admin/certificates' },
      { id: 'blotters', label: 'Blotter Management', icon: 'bi-shield-exclamation', link: '/admin/blotters' },
      { id: 'assistance', label: 'Assistance Requests', icon: 'bi-hand-thumbs-up', link: '/admin/assistance' },
      { id: 'appointments', label: 'Appointments', icon: 'bi-calendar-check', link: '/admin/appointments' },
    ]},
    { group: 'Aid & Sectors', icon: 'bi-box2-heart', items: [
      { id: 'aid', label: 'Aid Distribution', icon: 'bi-box2-heart', link: '/admin/aid' },
      { id: 'seniors', label: 'Senior Citizens', icon: 'bi-person-heart', link: '/admin/seniors' },
      { id: 'pwds', label: 'PWD Management', icon: 'bi-universal-access', link: '/admin/pwds' },
      { id: 'soloparents', label: 'Solo Parents', icon: 'bi-person-badge', link: '/admin/solo-parents' },
    ]},
    { group: 'ID & Scanning', icon: 'bi-qr-code-scan', items: [
      { id: 'id-gen', label: 'Barangay ID Gen', icon: 'bi-card-heading', link: '/admin/id-generator' },
      { id: 'qr-scanner', label: 'QR Scanner', icon: 'bi-qr-code-scan', link: '/scanner' },
      { id: 'scan-only', label: 'Scan-Only Page', icon: 'bi-upc-scan', link: '/scan' },
    ]},
    { group: 'Community', icon: 'bi-megaphone', items: [
      { id: 'announcements', label: 'Announcements', icon: 'bi-megaphone', link: '/admin/announcements' },
      { id: 'events', label: 'Events', icon: 'bi-calendar-event', link: '/admin/events' },
      { id: 'officials', label: 'Barangay Officials', icon: 'bi-person-lines-fill', link: '/admin/officials' },
    ]},
    { group: 'Administration', icon: 'bi-gear', items: [
      { id: 'users', label: 'User Accounts', icon: 'bi-person-gear', link: '/admin/users' },
      { id: 'reports', label: 'Reports', icon: 'bi-bar-chart-line', link: '/admin/reports' },
      { id: 'activity-logs', label: 'Activity Logs', icon: 'bi-clock-history', link: '/admin/activity-logs' },
      { id: 'settings', label: 'System Settings', icon: 'bi-sliders', link: '/admin/settings' },
      { id: 'account', label: 'My Account', icon: 'bi-person-lock', link: '/account' },
    ]},
  ];

  const residentMenu = [
    { id: 'res-dashboard', label: 'Dashboard', icon: 'bi-speedometer2', link: '/resident/dashboard' },
    { group: 'My Account', icon: 'bi-person-circle', items: [
      { id: 'res-profile', label: 'My Profile & Photo', icon: 'bi-person-circle', link: '/resident/profile' },
      { id: 'res-digital-id', label: 'My Digital ID', icon: 'bi-card-checklist', link: '/resident/digital-id' },
      { id: 'res-account', label: 'Account & Password', icon: 'bi-key', link: '/account' },
    ]},
    { group: 'Requests & Services', icon: 'bi-journal-check', items: [
      { id: 'res-certificates', label: 'Request Certificate', icon: 'bi-file-earmark-plus', link: '/resident/certificates' },
      { id: 'res-appointments', label: 'Book Appointment', icon: 'bi-calendar-plus', link: '/resident/appointments' },
      { id: 'res-complaints', label: 'Submit Complaint', icon: 'bi-exclamation-triangle', link: '/resident/complaints' },
      { id: 'res-assistance', label: 'Request Assistance', icon: 'bi-heart-pulse', link: '/resident/assistance' },
      { id: 'res-feedback', label: 'Submit Feedback', icon: 'bi-chat-left-text', link: '/resident/feedback' },
    ]},
    { id: 'res-aid', label: 'My Aid & Relief', icon: 'bi-box2-heart', link: '/resident/aid' },
    { group: 'Community', icon: 'bi-bell', items: [
      { id: 'res-announcements', label: 'Announcements', icon: 'bi-bell', link: '/resident/announcements' },
      { id: 'res-contacts', label: 'Emergency Contacts', icon: 'bi-telephone', link: '/resident/emergency-contacts' },
    ]},
  ];

  const menuItems = isAdmin ? adminMenu : residentMenu;

  const renderMenuLink = (item, sub) => `
    <li class="nav-item">
      <a href="${item.link}" class="nav-link ${sub ? 'sub-link' : ''} ${activeModule === item.id ? 'active' : ''}">
        <i class="bi ${item.icon} me-2"></i> ${item.label}
      </a>
    </li>`;

  const renderMenu = menuItems.map((entry, i) => {
    if (!entry.group) return renderMenuLink(entry, false);
    const open = entry.items.some(it => it.id === activeModule);
    return `
    <li class="nav-item">
      <a class="nav-link menu-group-toggle d-flex align-items-center ${open ? '' : 'collapsed'}" data-bs-toggle="collapse" href="#menuGroup${i}" role="button" aria-expanded="${open}" aria-controls="menuGroup${i}">
        <i class="bi ${entry.icon} me-2"></i> <span class="flex-grow-1">${entry.group}</span>
        <i class="bi bi-chevron-down menu-chevron small"></i>
      </a>
      <div class="collapse ${open ? 'show' : ''}" id="menuGroup${i}">
        <ul class="nav flex-column">${entry.items.map(it => renderMenuLink(it, true)).join('')}</ul>
      </div>
    </li>`;
  }).join('');

  return `
    ${renderSystemHead(settings.barangay_name || 'Barangay Portal')}
    <div class="container-fluid p-0">
      <div class="row g-0">
        <!-- Sidebar Navigation -->
        <div class="col-md-3 col-lg-2 sidebar d-flex flex-column p-3 no-print">
          <div class="d-flex align-items-center mb-4 px-2">
            ${settings.barangay_logo ? `<img src="${settings.barangay_logo}" class="me-2 rounded-circle shadow-sm" style="width: 70px; height: 70px; object-fit: cover; border: none;">` : '<i class="bi bi-building fs-1 me-2 text-accent-green"></i>'}
            <div>
              <h6 class="m-0 fw-bold">${settings.barangay_name || 'BARANGAY PORTAL'}</h6>
              <small class="text-white-50">${user.full_name || user.role || 'User'}</small>
            </div>
          </div>
          <hr class="text-white-50 mt-0">
          <ul class="nav nav-pills flex-column mb-auto overflow-y-auto" style="max-height: calc(100vh - 180px);">
            ${renderMenu}
          </ul>
          <hr class="text-white-50">
          <div class="dropdown">
            <a href="#" class="d-flex align-items-center text-white text-decoration-none dropdown-toggle px-2" id="dropdownUser1" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="bi bi-person-circle fs-4 me-2"></i>
              <strong>${user.full_name || user.username}</strong>
            </a>
            <ul class="dropdown-menu dropdown-menu-dark text-small shadow">
              <li><a class="dropdown-item" href="/account"><i class="bi bi-key me-2"></i> Account &amp; Password</a></li>
              <li><a class="dropdown-item" href="/logout"><i class="bi bi-box-arrow-right me-2"></i> Sign out</a></li>
            </ul>
          </div>
        </div>

        <!-- Main Content Area -->
        <div class="col-md-9 col-lg-10 p-4 overflow-y-auto" style="height: 100vh; background-color: #f4f9f6;">
          <div class="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom no-print">
            <h4 class="fw-bold text-primary-blue m-0">${settings.system_name || 'Barangay Resident Management System'}</h4>
            <span class="badge bg-accent-green px-3 py-2 text-white"><i class="bi bi-check-circle me-1"></i> System Online</span>
          </div>
          ${contentHtml}
        </div>
      </div>
    </div>
    ${renderSystemFooter()}
  `;
};

module.exports = { renderSystemHead, renderSystemFooter, renderAppLayout };
