/**
 * CAMCVC LOAN — Central API helper
 * All requests POST to /api/app (Vercel → MySQL on Railway)
 */

(function () {
  'use strict';

  function _authBody() {
    try {
      var a = JSON.parse(localStorage.getItem('appAuth') || 'null');
      if (a && a.u && a.p) return { auth: { u: a.u, p: a.p } };
    } catch(e) {}
    return {};
  }

  /* get() and post() both use POST to /api/app */
  async function get(params) {
    return post(params);
  }

  async function post(body) {
    if (!navigator.onLine) {
      return { ok: false, message: 'គ្មានការតភ្ជាប់អ៊ីនធឺណិត — សូមពិនិត្យ Wifi/Data' };
    }
    const fullBody = Object.assign({}, _authBody(), body);
    const res  = await fetch('/api/app', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(fullBody),
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { ok: false, raw: text }; }
  }

  /* ── Device identity ───────────────────────────────────────────
     An account may be signed in on a limited number of devices, so each
     browser needs a stable id of its own. It lives in localStorage and is
     sent with the login request. ──────────────────────────────────── */
  var DEVICE_KEY = 'cambo_device_id';

  function deviceId() {
    var v = null;
    try { v = localStorage.getItem(DEVICE_KEY); } catch(e) {}
    if (!v) {
      try {
        v = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
          : 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      } catch(e) {
        v = 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      }
      try { localStorage.setItem(DEVICE_KEY, v); } catch(e) {}
    }
    return v;
  }

  /* Something a person can recognise in their device list */
  function deviceLabel() {
    var ua = navigator.userAgent || '';
    var os = /iPhone|iPad|iPod/i.test(ua) ? 'iPhone/iPad'
           : /Android/i.test(ua)          ? 'Android'
           : /Windows/i.test(ua)          ? 'Windows'
           : /Mac OS X/i.test(ua)         ? 'Mac'
           : /Linux/i.test(ua)            ? 'Linux' : 'Device';
    var br = /Edg\//i.test(ua)     ? 'Edge'
           : /OPR\//i.test(ua)     ? 'Opera'
           : /Chrome\//i.test(ua)  ? 'Chrome'
           : /Firefox\//i.test(ua) ? 'Firefox'
           : /Safari\//i.test(ua)  ? 'Safari' : 'Browser';
    return os + ' · ' + br;
  }

  window.CamboDevice = { id: deviceId, label: deviceLabel };
  window.CamboAPI = { get, post };
})();
