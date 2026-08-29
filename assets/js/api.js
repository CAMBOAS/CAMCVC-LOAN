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

  /* ── A short memory for the one read every page repeats ──────────────────
     Ten pages open by asking for the whole customer list, and that answer takes
     about a second — so moving between them meant waiting for the same list
     again and again.

     This is a lending system, so a figure the server has not confirmed must
     never reach the screen. Four rules keep that true:

       · display only — writes never read from here, and go to the server as
         they always did, so nothing can be lost by caching
       · any write empties it, whoever made the call, so an edit is never
         followed by the list that predates it
       · it lives in sessionStorage under the signed-in name, so it cannot
         outlive the tab, and one account can never be shown another's rows
       · it is only trusted for a few seconds — long enough to cover clicking
         from one page to the next, too short to sit on a stale figure

     Past those seconds the request goes to the server exactly as before. ── */
  var CACHE_MS  = 20000;
  var CACHEABLE = { get_all: 1 };
  var CACHE_PREFIX = 'apicache:';

  function _who() {
    try {
      var a = JSON.parse(localStorage.getItem('appAuth') || 'null');
      return (a && a.u) ? String(a.u) : '';
    } catch(e) { return ''; }
  }

  /* Named one by one rather than matched by shape. A pattern looked tidy and
     was wrong — `_set`, `msg_send` and `session_revoke` all read as reads to it,
     because they end or begin like one. Naming them leaves no room for that,
     and anything not on this list — including any action added later — counts
     as a write and empties the cache. Wrong that way costs one request; wrong
     the other way shows a figure that is no longer true. */
  var READ_ACTIONS = {
    activity_list:1, get_all:1, get_settings:1, get_upload_sig:1, habit_list:1,
    msg_list:1, msg_threads:1, msg_unread:1, note_get:1, notif_get:1,
    page_access_get:1, perms_get:1, portal_token_check:1, portal_visits_list:1,
    repayment_list:1, schedule_get:1, schedule_list:1, session_check:1,
    sessions_list:1, team_list:1, tg_config_get:1, ui_prefs_get:1,
    user_list:1, users_control:1, watch_get:1
  };
  function _isWrite(action) { return !READ_ACTIONS[action]; }

  function _key(action) { return CACHE_PREFIX + action + ':' + _who(); }

  function _readCache(action) {
    try {
      var raw = sessionStorage.getItem(_key(action));
      if (!raw) return null;
      var box = JSON.parse(raw);
      if (!box || (Date.now() - box.t) > CACHE_MS) return null;
      return box.v;
    } catch(e) { return null; }
  }

  function _writeCache(action, value) {
    try { sessionStorage.setItem(_key(action), JSON.stringify({ t: Date.now(), v: value })); }
    catch(e) { /* full or unavailable — carry on without it */ }
  }

  function _clearCache() {
    try {
      var kill = [];
      for (var i = 0; i < sessionStorage.length; i++) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf(CACHE_PREFIX) === 0) kill.push(k);
      }
      kill.forEach(function (k) { sessionStorage.removeItem(k); });
    } catch(e) {}
  }
  window.CamboCacheClear = _clearCache;

  async function _send(fullBody) {
    const res  = await fetch('/api/app', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(fullBody),
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { ok: false, raw: text }; }
  }

  async function post(body) {
    if (!navigator.onLine) {
      return { ok: false, message: 'គ្មានការតភ្ជាប់អ៊ីនធឺណិត — សូមពិនិត្យ Wifi/Data' };
    }
    const action   = String((body && body.action) || '');
    const fullBody = Object.assign({}, _authBody(), body);

    /* A write invalidates first, so a request racing behind it cannot refill
       the cache from a read that started before the change landed. */
    if (_isWrite(action)) {
      _clearCache();
      const w = await _send(fullBody);
      _clearCache();
      return w;
    }

    if (CACHEABLE[action]) {
      const hit = _readCache(action);
      if (hit) {
        /* Hand back what we have and check behind it. If the server disagrees,
           say so, so a page that cares can redraw itself. */
        _send(fullBody).then(function (fresh) {
          if (!fresh || !fresh.ok) return;
          _writeCache(action, fresh);
          try {
            if (JSON.stringify(fresh) !== JSON.stringify(hit)) {
              window.dispatchEvent(new CustomEvent('cambo:data', { detail: { action: action, data: fresh } }));
            }
          } catch(e) {}
        }).catch(function(){});
        return hit;
      }
      const fresh = await _send(fullBody);
      if (fresh && fresh.ok) _writeCache(action, fresh);
      return fresh;
    }

    return _send(fullBody);
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
  window.CamboAPI = { get, post, clearCache: _clearCache };
})();
