/** HTML/JS for the QR scanner screen. */


// ==========================================
// SCANNER: shared UI (beep + voice), scan-only page, JSON API
// ==========================================
const renderScannerBody = () => `
<style>
  #scanStatus { border-radius: 14px; padding: 16px; text-align: center; font-weight: 700; font-size: 1.15rem; transition: background .2s, color .2s; }
  #scanStatus .st-icon { font-size: 2.2rem; display: block; margin-bottom: 4px; line-height: 1.1; }
  #scanStatus small { display: block; font-weight: 500; margin-top: 2px; }
  .st-idle { background: var(--light-blue); color: var(--primary-navy); }
  .st-checking { background: #fff3cd; color: #664d03; }
  .st-success { background: #d1e7dd; color: #0f5132; }
  .st-error { background: #f8d7da; color: #842029; }
  .st-warn { background: #fff3cd; color: #664d03; }
  #scanStatus .btn-loading-spinner { width: 2rem; height: 2rem; border-width: 4px; margin: 0 auto 6px; display: block; }
  #reader { width: 100%; max-width: 460px; margin: auto; display: none; }
  .scan-photo { width: 84px; height: 84px; object-fit: cover; border-radius: 50%; background: #e9ecef; }
  .scan-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; margin-bottom: 6px; background: #f1faf4; border: 1px solid #cfe8d7; }
  .scan-row.done { background: #e9ecef; border-color: #dee2e6; opacity: .8; }
</style>

<div id="scanApp">
  <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
    <h5 class="fw-bold text-primary-blue m-0"><i class="bi bi-qr-code-scan me-2"></i>QR Scanner</h5>
    <div class="btn-group btn-group-sm">
      <button type="button" id="soundBtn" class="btn btn-outline-primary"></button>
      <button type="button" id="voiceBtn" class="btn btn-outline-primary"></button>
    </div>
  </div>

  <div id="scanStatus" class="st-idle"></div>

  <div class="text-center my-3">
    <div id="reader" class="border rounded p-2 bg-black"></div>
    <button type="button" id="camBtn" class="btn btn-accent-custom text-white fw-bold mt-2"><i class="bi bi-camera-video me-1"></i> Start Camera</button>
  </div>

  <form id="manualForm" class="mb-3" data-no-loader autocomplete="off">
    <div class="input-group">
      <input type="text" id="qr_token" class="form-control" placeholder="Scan with scanner gun or type QR token..." required>
      <button type="submit" class="btn btn-primary-custom fw-bold text-white">Verify</button>
    </div>
  </form>

  <div id="scanResult"></div>
</div>

<script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script>
<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var soundOn = true, voiceOn = true, busy = false, cam = null, camRunning = false, resumeTimer = null;
  try {
    soundOn = localStorage.getItem('scanSound') !== 'off';
    voiceOn = localStorage.getItem('scanVoice') !== 'off';
  } catch (e) {}

  // ---------- Sound (beep) ----------
  var audioCtx = null;
  function getCtx() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function tone(freq, start, dur, type, vol) {
    var ctx = getCtx();
    if (!ctx) return;
    var o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + start;
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.25, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }
  var sounds = {
    // Clear, loud two-note "ding-dong" chime (soft sine tones, no buzzing)
    scan: function () {
      tone(880, 0, 0.18, 'sine', 0.9);
      tone(1318, 0.12, 0.3, 'sine', 0.9);
    },
    success: function () { tone(880, 0, 0.12, 'sine', 0.3); tone(1320, 0.14, 0.22, 'sine', 0.3); },
    warn: function () { tone(600, 0, 0.15, 'triangle', 0.3); tone(600, 0.22, 0.15, 'triangle', 0.3); },
    error: function () { tone(220, 0, 0.35, 'sawtooth', 0.2); tone(170, 0.4, 0.4, 'sawtooth', 0.2); }
  };
  function beep(kind) {
    if (soundOn && sounds[kind]) sounds[kind]();
    if (navigator.vibrate) { try { navigator.vibrate(kind === 'error' ? [200, 100, 200] : 120); } catch (e) {} }
  }

  // ---------- Voice ----------
  function speak(text) {
    if (!voiceOn || !text || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 0.95; u.volume = 1;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function refreshToggles() {
    $('soundBtn').innerHTML = '<i class="bi ' + (soundOn ? 'bi-volume-up-fill' : 'bi-volume-mute-fill') + ' me-1"></i>Beep: ' + (soundOn ? 'On' : 'Off');
    $('voiceBtn').innerHTML = '<i class="bi ' + (voiceOn ? 'bi-megaphone-fill' : 'bi-megaphone') + ' me-1"></i>Voice: ' + (voiceOn ? 'On' : 'Off');
  }
  $('soundBtn').onclick = function () {
    soundOn = !soundOn;
    try { localStorage.setItem('scanSound', soundOn ? 'on' : 'off'); } catch (e) {}
    refreshToggles();
    if (soundOn) sounds.scan();
  };
  $('voiceBtn').onclick = function () {
    voiceOn = !voiceOn;
    try { localStorage.setItem('scanVoice', voiceOn ? 'on' : 'off'); } catch (e) {}
    refreshToggles();
    if (voiceOn) speak('Voice is on');
    else if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };
  document.addEventListener('pointerdown', getCtx, { once: true }); // unlock audio on first touch

  // ---------- Helpers ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  var ICONS = { idle: 'bi-qr-code-scan', success: 'bi-check-circle-fill', error: 'bi-x-octagon-fill', warn: 'bi-exclamation-triangle-fill' };
  function setStatus(kind, title, sub) {
    var box = $('scanStatus');
    box.className = 'st-' + kind;
    box.innerHTML = '';
    if (kind === 'checking') box.appendChild(el('span', 'btn-loading-spinner'));
    else box.appendChild(el('i', 'bi st-icon ' + ICONS[kind]));
    box.appendChild(el('div', '', title));
    if (sub) box.appendChild(el('small', '', sub));
  }
  function post(url, payload) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) {
        setTimeout(function () { window.location.href = '/login'; }, 2500);
        return { success: false, level: 'error', message: 'Session expired. Please log in again.', spoken: 'Session expired. Please log in again.' };
      }
      return r.json();
    }).catch(function () {
      return { success: false, level: 'error', message: 'Network error. Check your connection.', spoken: 'Network error.' };
    });
  }
  function announce(d) {
    var kind = d.success ? 'success' : (d.level === 'warn' ? 'warn' : 'error');
    setStatus(kind, d.message || '', d.detail || '');
    beep(kind);
    speak(d.spoken || d.message);
    return kind;
  }

  // ---------- Camera ----------
  function pauseScan() { if (cam && camRunning) { try { cam.pause(true); } catch (e) {} } }
  function resumeScan() {
    clearTimeout(resumeTimer);
    if (cam && camRunning) { try { cam.resume(); } catch (e) {} }
    busy = false;
    $('scanResult').innerHTML = '';
    setStatus('idle', 'Ready to scan', camRunning ? 'Point the camera at a resident QR code' : 'Start the camera or use a scanner');
    $('qr_token').value = '';
    $('qr_token').focus();
  }
  function startCamera() {
    getCtx();
    if (typeof Html5Qrcode === 'undefined') { setStatus('error', 'Camera library failed to load', 'Check your internet connection'); return; }
    $('reader').style.display = 'block';
    $('camBtn').disabled = true;
    cam = cam || new Html5Qrcode('reader');
    cam.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } }, function (text) {
      if (busy) return;
      pauseScan();
      handleToken(String(text).trim());
    }, function () {}).then(function () {
      camRunning = true;
      $('camBtn').disabled = false;
      $('camBtn').innerHTML = '<i class="bi bi-stop-circle me-1"></i> Stop Camera';
      resumeScan();
    }).catch(function (err) {
      $('reader').style.display = 'none';
      $('camBtn').disabled = false;
      setStatus('error', 'Unable to access camera', String(err));
      beep('error');
    });
  }
  function stopCamera() {
    if (!cam) return;
    cam.stop().then(function () {
      camRunning = false;
      $('reader').style.display = 'none';
      $('camBtn').innerHTML = '<i class="bi bi-camera-video me-1"></i> Start Camera';
      setStatus('idle', 'Camera stopped', 'Use a scanner or start the camera again');
    }).catch(function () {});
  }
  $('camBtn').onclick = function () { if (camRunning) stopCamera(); else startCamera(); };

  // ---------- Scan flow ----------
  function handleToken(token) {
    if (!token) return;
    busy = true;
    clearTimeout(resumeTimer);
    $('scanResult').innerHTML = '';
    beep('scan');
    setStatus('checking', 'Checking...', '');
    post('/api/scanner/lookup', { qr_token: token }).then(function (d) {
      announce(d);
      if (!d.success) { resumeTimer = setTimeout(resumeScan, 3000); return; }
      renderResident(d, token);
    });
  }

  function renderResident(d, token) {
    var box = $('scanResult');
    box.innerHTML = '';
    var card = el('div', 'card card-custom p-3 border-success');
    var top = el('div', 'd-flex align-items-center gap-3 mb-2');
    if (d.resident.photo) { var img = el('img', 'scan-photo'); img.src = d.resident.photo; img.alt = ''; top.appendChild(img); }
    else { top.appendChild(el('div', 'scan-photo d-flex align-items-center justify-content-center fs-2 text-secondary')).innerHTML = '<i class="bi bi-person-fill"></i>'; }
    var info = el('div');
    info.appendChild(el('h5', 'fw-bold m-0', d.resident.name));
    info.appendChild(el('small', 'text-primary-blue fw-bold d-block', d.resident.number));
    info.appendChild(el('small', 'd-block text-muted', 'Purok: ' + (d.resident.purok || '-')));
    info.appendChild(el('small', 'd-block text-muted', d.resident.address || ''));
    info.appendChild(el('span', 'badge bg-success mt-1', d.resident.status || 'Active'));
    top.appendChild(info);
    card.appendChild(top);

    var pending = 0;
    function itemDone() {
      pending--;
      if (pending <= 0) resumeTimer = setTimeout(resumeScan, 3500);
    }
    function addRow(parent, title, subtitle, btnLabel, btnIcon, run) {
      pending++;
      var row = el('div', 'scan-row');
      var txt = el('div');
      txt.appendChild(el('strong', '', title));
      if (subtitle) txt.appendChild(el('small', 'd-block text-muted', subtitle));
      row.appendChild(txt);
      var btn = el('button', 'btn btn-sm btn-accent-custom text-white fw-bold');
      btn.type = 'button';
      btn.innerHTML = '<i class="bi ' + btnIcon + ' me-1"></i>' + btnLabel;
      btn.onclick = function () {
        if (!window.confirm(btnLabel + ' - are you sure?')) return;
        clearTimeout(resumeTimer);
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-loading-spinner"></span>Working...';
        setStatus('checking', 'Processing...', '');
        run().then(function (r) {
          var kind = announce(r);
          if (r.success || r.final) {
            row.className = 'scan-row done';
            var tag = el('span', 'badge ' + (r.success ? 'bg-success' : 'bg-secondary'), r.badge || (r.success ? 'Done' : 'Closed'));
            btn.replaceWith(tag);
            itemDone();
          } else {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi ' + btnIcon + ' me-1"></i>' + btnLabel;
          }
        });
      };
      row.appendChild(btn);
      parent.appendChild(row);
    }

    if (d.certificates.length) {
      var cwrap = el('div', 'mt-2');
      cwrap.appendChild(el('h6', 'fw-bold text-primary-blue', 'Certificates Ready for Release'));
      d.certificates.forEach(function (c) {
        addRow(cwrap, c.type, c.number, 'Mark Released', 'bi-file-earmark-check', function () {
          return post('/api/scanner/release-certificate', { certificate_id: c.id, qr_token: token });
        });
      });
      card.appendChild(cwrap);
    }
    var awrap = el('div', 'mt-2');
    awrap.appendChild(el('h6', 'fw-bold text-accent-green', 'Aid Available to Claim'));
    if (d.aid.length) {
      d.aid.forEach(function (a) {
        addRow(awrap, a.title, a.type, 'Release Aid', 'bi-check2-circle', function () {
          return post('/api/scanner/claim-json', { beneficiary_id: a.id, qr_token: token });
        });
      });
    } else {
      awrap.appendChild(el('p', 'text-muted small m-0', 'No unclaimed aid for this resident.'));
    }
    card.appendChild(awrap);

    var next = el('button', 'btn btn-primary-custom text-white fw-bold w-100 mt-3');
    next.type = 'button';
    next.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i> Scan Next';
    next.onclick = resumeScan;
    card.appendChild(next);
    box.appendChild(card);
  }

  $('manualForm').addEventListener('submit', function (e) {
    e.preventDefault();
    getCtx();
    if (busy) return;
    handleToken($('qr_token').value.trim());
  });

  refreshToggles();
  setStatus('idle', 'Ready to scan', 'Start the camera or use a scanner');
  $('qr_token').focus();
})();
</script>
`;

module.exports = { renderScannerBody };
