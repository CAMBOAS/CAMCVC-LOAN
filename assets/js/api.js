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

  window.CamboAPI = { get, post };
})();
