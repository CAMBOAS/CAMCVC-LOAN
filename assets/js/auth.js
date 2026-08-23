(function () {
  'use strict';
  var KEY        = 'appAuth';
  var EXPIRY_MS  = 7 * 24 * 60 * 60 * 1000; /* 7 days */

  function get() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(e) { return null; }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  /* Call at top of every protected page — redirects to login if not authenticated or expired */
  function check() {
    var auth = get();
    if (!auth || !auth.u || !auth.p) {
      location.replace('login.html');
      return false;
    }
    if (auth.exp && Date.now() > auth.exp) {
      clear();
      location.replace('login.html?expired=1');
      return false;
    }
    return true;
  }

  function logout() {
    clear();
    localStorage.removeItem('user_photo');
    location.replace('login.html');
  }

  window.CamcvcAuth = { get: get, save: save, clear: clear, check: check, logout: logout };
})();
