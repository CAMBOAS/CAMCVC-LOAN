/**
 * CAMCVC LOAN — "sign this computer in from my phone"
 *
 * The mirror image of the Sign-in QR on My Profile. There, a signed-in device
 * shows a code and a new one scans it. Here the *new* device shows the code and
 * the signed-in phone scans it — which is the way round people expect after
 * Telegram and WhatsApp, and the only one that works when the phone is the
 * device you already trust.
 *
 * Nothing in the code identifies an account: it names a browser that is waiting.
 * The phone decides who it belongs to, and only then does this page receive
 * credentials. Lives in its own file because both login pages need it.
 */
(function () {
  'use strict';

  var POLL_MS = 2000;

  /* Work out where the other scripts live from this one's own URL, so the file
     can be included from the site root and from /pages/ without being told. */
  var BASE = (function () {
    var s = document.currentScript && document.currentScript.src;
    if (!s) return 'assets/js/';
    return s.replace(/[^/]*$/, '');
  })();
  var ROOT = BASE.replace(/assets\/js\/$/, '');

  var _tok = '', _poll = null, _tick = null, _left = 0, _next = '', _busy = false;

  function $(id) { return document.getElementById(id); }

  function loadQrLib() {
    if (typeof window.qrcode !== 'undefined') return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = BASE + 'qrcode.js?v=1';
      s.onload = res;
      s.onerror = function () { rej(new Error('qr_lib')); };
      document.head.appendChild(s);
    });
  }

  function styles() {
    if ($('lhStyles')) return;
    var css = document.createElement('style');
    css.id = 'lhStyles';
    css.textContent = [
      '.lh-ov{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;',
      'background:rgba(8,12,24,.86);backdrop-filter:blur(6px);padding:18px;overflow:auto}',
      '.lh-ov.on{display:flex}',
      '.lh-card{background:#151d2e;border:1px solid rgba(148,163,184,.18);border-radius:20px;',
      'padding:26px 24px 20px;width:100%;max-width:360px;text-align:center;',
      'box-shadow:0 30px 80px rgba(0,0,0,.55);color:#e2e8f0;font-family:inherit}',
      '.lh-x{position:absolute;top:16px;right:18px;width:34px;height:34px;border-radius:10px;border:none;',
      'background:rgba(148,163,184,.14);color:#cbd5e1;cursor:pointer;display:flex;align-items:center;justify-content:center}',
      '.lh-x:hover{background:rgba(148,163,184,.26)}',
      '.lh-x svg{width:16px;height:16px}',
      '.lh-qr{position:relative;width:212px;height:212px;margin:0 auto 18px;background:#fff;',
      'border-radius:16px;padding:10px;box-sizing:border-box}',
      '.lh-qr canvas{width:100%;height:100%;display:block;border-radius:8px}',
      '.lh-veil{position:absolute;inset:0;border-radius:16px;background:rgba(15,23,42,.9);color:#fff;',
      'display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:14px;',
      'font-size:12.5px;font-weight:700;line-height:1.6}',
      '.lh-veil.on{display:flex}',
      '.lh-title{font-size:16px;font-weight:800;margin-bottom:12px}',
      '.lh-steps{list-style:none;margin:0 0 14px;padding:0;text-align:left;display:flex;',
      'flex-direction:column;gap:7px}',
      '.lh-steps li{font-size:12.5px;color:#94a3b8;line-height:1.6;display:flex;gap:8px}',
      '.lh-steps b{color:#e2e8f0;font-weight:800;flex-shrink:0}',
      '.lh-exp{font-size:12px;font-weight:700;color:#38bdf8;font-variant-numeric:tabular-nums;min-height:16px}',
      '.lh-exp.dead{color:#f87171}',
      '.lh-msg{font-size:12px;color:#94a3b8;min-height:16px;margin-top:6px;line-height:1.6}',
      '.lh-btn{margin-top:14px;width:100%;padding:11px;border-radius:11px;border:none;cursor:pointer;',
      'font-family:inherit;font-size:13px;font-weight:800;',
      'background:linear-gradient(135deg,#6366f1,#22d3ee);color:#fff}',
      '.lh-btn:hover{filter:brightness(1.08)}',
      '.lh-link{margin-top:10px;background:none;border:none;color:#38bdf8;font-family:inherit;',
      'font-size:12.5px;font-weight:700;cursor:pointer;padding:6px}',
      '.lh-link:hover{text-decoration:underline}'
    ].join('');
    document.head.appendChild(css);
  }

  function ensureUI() {
    if ($('lhOv')) return;
    styles();
    var ov = document.createElement('div');
    ov.className = 'lh-ov';
    ov.id = 'lhOv';
    ov.innerHTML =
      '<div class="lh-card" style="position:relative">' +
        '<button type="button" class="lh-x" id="lhX" aria-label="close">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">' +
          '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
        '<div class="lh-qr"><canvas id="lhCanvas" width="380" height="380"></canvas>' +
          '<div class="lh-veil" id="lhVeil"><span id="lhVeilTxt"></span></div>' +
        '</div>' +
        '<div class="lh-title">Scan from a phone you are signed in on</div>' +
        '<ol class="lh-steps">' +
          '<li><b>1.</b><span>Open the app on your phone</span></li>' +
          '<li><b>2.</b><span>Go to My Profile &rsaquo; Sign-in QR &rsaquo; Scan a computer&#39;s code</span></li>' +
          '<li><b>3.</b><span>Scan this code, then tap Yes</span></li>' +
        '</ol>' +
        '<div class="lh-exp" id="lhExp"></div>' +
        '<div class="lh-msg" id="lhMsg"></div>' +
        '<button type="button" class="lh-btn" id="lhNew" style="display:none">Show a new code</button>' +
        '<button type="button" class="lh-link" id="lhBack">&larr; Sign in with username and PIN</button>' +
      '</div>';
    document.body.appendChild(ov);
    $('lhX').onclick = close;
    $('lhBack').onclick = close;
    $('lhNew').onclick = function () { start(); };
  }

  function stop() {
    if (_poll) { clearInterval(_poll); _poll = null; }
    if (_tick) { clearInterval(_tick); _tick = null; }
  }

  function veil(text) {
    var v = $('lhVeil');
    if (!v) return;
    if (!text) { v.classList.remove('on'); return; }
    $('lhVeilTxt').textContent = text;
    v.classList.add('on');
  }

  function dead(msg) {
    stop();
    veil(msg);
    $('lhExp').textContent = '';
    $('lhNew').style.display = '';
  }

  function draw(url) {
    var q = window.qrcode(0, 'M');
    q.addData(url);
    q.make();
    var cv = $('lhCanvas'), ctx = cv.getContext('2d');
    var n = q.getModuleCount(), quiet = 2;
    var cell = Math.floor(cv.width / (n + quiet * 2));
    var off = Math.floor((cv.width - cell * n) / 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#0f172a';
    for (var r = 0; r < n; r++)
      for (var c = 0; c < n; c++)
        if (q.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
  }

  function countdown(secs) {
    _left = secs;
    var el = $('lhExp');
    var t = function () {
      if (_left <= 0) { dead('This code has expired'); return; }
      el.textContent = 'Expires in ' + _left + 's';
      el.classList.remove('dead');
      _left--;
    };
    t();
    _tick = setInterval(t, 1000);
  }

  var MSG = {
    invalid:   'That code is not valid',
    used:      'This code has already been used',
    expired:   'This code has expired',
    cancelled: 'This code was cancelled',
    inactive:  'This account is disabled — please contact Admin'
  };

  async function finish(username, pin) {
    stop();
    veil('Signing in…');
    var login = await window.CamboAPI.post({
      action: 'api_login', username: username, pin: pin,
      device_id: window.CamboDevice ? window.CamboDevice.id() : '',
      device_label: window.CamboDevice ? window.CamboDevice.label() : ''
    });
    if (!login || !login.ok) { dead((login && login.message) || 'Could not sign in'); return; }

    var exp = login.expDate ? new Date(login.expDate + 'T23:59:59').getTime()
                            : Date.now() + 7 * 24 * 60 * 60 * 1000;
    localStorage.setItem('appAuth', JSON.stringify({
      u: username, p: pin, name: login.name || username, role: login.role || '',
      exp: exp, expDate: login.expDate || '', manages_teams: login.manages_teams || []
    }));
    try {
      if (login.photo_url) localStorage.setItem('user_photo', login.photo_url);
      else localStorage.removeItem('user_photo');
    } catch (e) {}

    var next = '';
    try { next = new URLSearchParams(location.search).get('next') || ''; } catch (e) {}
    location.replace(next || _next);
  }

  async function tickPoll() {
    if (_busy) return;
    _busy = true;
    try {
      var r = await window.CamboAPI.post({
        action: 'qr_handshake_poll',
        token: _tok,
        device_id: window.CamboDevice ? window.CamboDevice.id() : ''
      });
      if (!r || !r.ok) return;
      if (r.status === 'pending') return;
      if (r.status === 'approved') { await finish(r.username, r.pin); return; }
      dead(MSG[r.status] || MSG.invalid);
    } catch (e) {
      /* a dropped request is normal on a flaky phone connection — keep waiting */
    } finally { _busy = false; }
  }

  /* Browsers slow a hidden tab's timers right down, so someone who looks away
     while approving on their phone can come back to a page that has not noticed
     yet. Checking once on return costs nothing and removes that dead wait. */
  var _watching = false;
  function watchVisible() {
    if (_watching) return;
    _watching = true;
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && _poll) tickPoll();
    });
  }

  async function start() {
    ensureUI();
    $('lhOv').classList.add('on');
    $('lhNew').style.display = 'none';
    $('lhMsg').textContent = '';
    veil('Creating a code…');
    stop();

    try { await loadQrLib(); }
    catch (e) { dead('Could not load the QR library'); return; }

    try {
      var r = await window.CamboAPI.post({
        action: 'qr_handshake_start',
        device_id: window.CamboDevice ? window.CamboDevice.id() : '',
        device_label: window.CamboDevice ? window.CamboDevice.label() : ''
      });
      if (!r || !r.ok) throw new Error((r && r.message) || 'failed');
      _tok = r.token;
      draw(ROOT + 'pages/my-profile.html?lg=' + encodeURIComponent(r.token));
      veil('');
      countdown(r.seconds);
      _poll = setInterval(tickPoll, POLL_MS);
      watchVisible();
    } catch (e) {
      dead('Could not create a code — please try again');
    }
  }

  function close() {
    stop();
    _tok = '';
    var ov = $('lhOv');
    if (ov) ov.classList.remove('on');
  }

  /* next: where to land once signed in — differs between the two login pages */
  window.CamboQrLogin = {
    open: function (opts) { _next = (opts && opts.next) || 'loan-list.html'; start(); },
    close: close
  };
})();
