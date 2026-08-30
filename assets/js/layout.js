/* CAMCVC LOAN — Shared Layout (Sidebar + Topbar) v19 */
(function () {
  'use strict';

  function getLang() { return localStorage.getItem('lang') === 'kh' ? 'kh' : 'en'; }
  function setLang(l) { try { localStorage.setItem('lang', l === 'kh' ? 'kh' : 'en'); } catch(e) {} }
  function t(kh, en) { return getLang() === 'en' ? en : kh; }
  /* Every nav label here already has its Khmer, but nothing outside this file
     could read the setting or change it. Exposed so a page can offer the switch
     and have the shared chrome follow along. */
  window.appGetLang = getLang;
  window.appSetLang = function (l) {
    setLang(l);
    try { window.appApplyTopbar && window.appApplyTopbar(); } catch(e) {}
    try { window.appRerenderSidebar && window.appRerenderSidebar(); } catch(e) {}
    /* Reloading to re-translate would throw away whatever the reader had
       half-typed — the moment they are most likely to reach for this button.
       Pages that carry translations listen for this and re-label in place. */
    try { window.dispatchEvent(new CustomEvent('applang', { detail: { lang: getLang() } })); } catch(e) {}
  };

  /* ── Unsaved work ────────────────────────────────────────────────────────
     Every page is its own document, so a link in the menu really does leave —
     and takes any half-filled form with it. Nothing about that changes by
     rewriting the app; the honest fix is to ask first.

     Two exits to cover: the browser's own (reload, close, typed address),
     which only accepts the native dialog, and a click on a link inside the
     app, where we can ask in the reader's language. Both consult the same
     question, so a page describes "dirty" once. ── */
  var _dirtyFn = null, _skipLeave = false;

  window.appGuardUnsaved = function (fn) { _dirtyFn = (typeof fn === 'function') ? fn : null; };
  window.appAllowLeave   = function () { _skipLeave = true; };

  function leavingCosts() {
    if (_skipLeave || !_dirtyFn) return false;
    try { return !!_dirtyFn(); } catch (e) { return false; }
  }

  window.addEventListener('beforeunload', function (e) {
    if (!leavingCosts()) return;
    e.preventDefault();
    e.returnValue = '';   /* browsers insist on their own wording here */
  });

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !leavingCosts()) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#' || /^(javascript|mailto|tel):/i.test(href)) return;
    if (confirm(t('អ្នកបំពេញព័ត៌មានមិនទាន់រក្សាទុកនៅឡើយ។ ចាកចេញឥឡូវនេះគឺបាត់បង់អស់។ ចាកចេញមែនទេ?',
                  'You have details that are not saved yet. Leaving now loses them. Leave anyway?'))) {
      /* they said yes — do not ask a second time on the way out */
      _skipLeave = true;
      setTimeout(function () { _skipLeave = false; }, 2000);
    } else {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  /* Answers "would leaving cost anything".

     Comparing against a snapshot looked obvious and was wrong: these pages fill
     their dropdowns from the server a second or so after load, so whenever the
     snapshot was taken the arriving options moved values underneath it and a
     form nobody had touched reported itself edited.

     Listening for the typing instead settles it. Assigning to `.value` from
     script raises no input event at all, so a form only counts as edited once a
     person has actually edited it — and `isTrusted` rules out anything a script
     dispatches. */
  window.appTrackForm = function (root) {
    var el = (typeof root === 'string') ? document.querySelector(root) : (root || document.body);
    if (!el) return;
    var touched = false;
    function mark(e) { if (e && e.isTrusted) touched = true; }
    el.addEventListener('input',  mark, true);
    el.addEventListener('change', mark, true);
    window.appGuardUnsaved(function () { return touched; });
    /* Call after a successful save, or after the form is replaced wholesale. */
    window.appFormSaved = function () { touched = false; };
  };

  function getBrand() {
    try { return JSON.parse(localStorage.getItem('appBrand')||'null') || {}; } catch(e) { return {}; }
  }
  window.appGetBrand = getBrand;
  window.appSetBrand = function(b) {
    try { localStorage.setItem('appBrand', JSON.stringify(b)); } catch(e) {}
  };
  window.appSyncBrand = async function() {
    try {
      if (typeof CamboAPI === 'undefined') return;
      var r = await CamboAPI.post({ action: 'get_settings' });
      if (r && r.ok) {
        var b = { name: r.app_name||'', sub: r.app_sub||'', logoUrl: r.app_logo_url||'' };
        window.appSetBrand(b);
        window.appApplyBrand();
        if (r.topbar) {
          var _tbBefore = JSON.stringify(window.appGetTopbar());
          window.appSetTopbar({
            on:    r.topbar.on    === '' ? undefined : r.topbar.on,
            mode:  r.topbar.mode  || undefined,
            size:  r.topbar.size  || undefined,
            style: r.topbar.style || undefined,
            show:  r.topbar.show  === '' ? undefined : r.topbar.show,
            links: r.topbar.links === '' ? undefined : r.topbar.links
          });
          if (JSON.stringify(window.appGetTopbar()) !== _tbBefore) window.appApplyTopbar();
        }
        if (r.sidebar) {
          var _sbBefore = JSON.stringify(window.appGetSidebar());
          window.appSetSidebar({
            on:    r.sidebar.on    === '' ? undefined : r.sidebar.on,
            width: r.sidebar.width || undefined,
            mode:  r.sidebar.mode  || undefined,
            style: r.sidebar.style || undefined,
            show:  r.sidebar.show  === '' ? undefined : r.sidebar.show,
            links: r.sidebar.links === '' ? undefined : r.sidebar.links
          });
          if (JSON.stringify(window.appGetSidebar()) !== _sbBefore) window.appRerenderSidebar();
        }
      }
    } catch(e) {}
  };
  window.appApplyBrand = function() {
    var b = getBrand();
    var name = b.name || 'CAMBO';
    var sub  = b.sub  || 'Loan Management';
    var el = document.querySelector('.sb-brand-name');
    if (el) el.textContent = name;
    var es = document.querySelector('.sb-brand-sub');
    if (es) es.textContent = sub;
    if (b.logoUrl) {
      var img = document.querySelector('.sb-logo-img');
      if (img) img.src = b.logoUrl;
    }
    /* Update page <title>: keep the page-specific part, replace the brand suffix */
    try {
      var parts = document.title.split(/\s*[-–—]\s*/);
      if (parts.length >= 2) {
        document.title = parts[0] + ' — ' + name;
      } else if (parts.length === 1 && parts[0]) {
        document.title = parts[0] + ' — ' + name;
      }
    } catch(e) {}
  };

  function getPageMeta() {
    return {
      'index.html':     { title: t('ផ្ទាំងគ្រប់គ្រង','Dashboard'),   subtitle: t('ការវិភាគ និងទិដ្ឋភាពទូទៅ','Analytics & overview') },
      'loan-list.html':       { title: t('បញ្ជីកម្ចី','Loan List'),       subtitle: t('តារាង និងការគ្រប់គ្រងអ្នកខ្ចីសរុប','Borrower list and full management') },
      'borrower-profile.html':{ title: t('Profile អ្នកខ្ចី','Borrower Profile'), subtitle: t('ព័ត៌មានលម្អិតអ្នកខ្ចី','Full borrower details and loan history') },
      'activity-log.html':  { title: t('កំណត់ហេតុ','Activity Log'), subtitle: t('កំណត់ហេតុសកម្មភាព','All system events and actions') },
      'team.html':          { title: t('ក្រុម','Team'),               subtitle: t('សមាជិកក្រុម និងស្ថិតិ','Team members and activity stats') },
      'customers.html':     { title: t('អតិថិជន','Customers'),         subtitle: t('គ្រប់គ្រងព័ត៌មានអតិថិជន','Customer information and records') },
      'add-customer.html':  { title: t('បន្ថែមអតិថិជន','Add Customer'),  subtitle: t('បំពេញព័ត៌មានអតិថិជនខាងក្រោម','Fill in the customer information below') },
      'repayment-tracker.html': { title: t('Repayment Tracker','Repayment Tracker'), subtitle: t('តាមដានការសងប្រាក់','Track loan repayments and paid status') },
      'fb-id-finder.html': { title: t('FB ID','FB ID Finder'), subtitle: t('បំប្លែង Facebook URL ទៅជា Numeric ID','Convert Facebook URL to Numeric ID') },
      'journal.html':   { title: t('កំណត់ត្រា','Journal'), subtitle: t('ទម្លាប់ និងកំណត់ចំណាំផ្ទាល់ខ្លួន','Personal habits and notes') },
      'reports.html':   { title: t('របាយការណ៍','Reports'), subtitle: t('សង្ខេប និងស្ថិតិ','Summaries and statistics') },
      'ccr.html':       { title: t('CCR','CCR'), subtitle: t('គ្រប់គ្រងអតិថិជន','Control Customer') },
      'schedule.html':  { title: t('កាលវិភាគសង','Schedule'), subtitle: t('តារាងកាលវិភាគសងប្រាក់','Loan repayment schedule') },
      'my-profile.html':{ title: t('ប្រវត្តិរូបខ្ញុំ','My Profile'), subtitle: t('គណនី និងចំណូលចិត្ត','Account and preferences') },
      'settings.html':  { title: t('ការកំណត់','Settings'), subtitle: t('Admin ប៉ុណ្ណោះ','Admin only') },
      'login.html':     { title: t('ចូលប្រើ','Login'),        subtitle: '' },
    };
  }

  const ic = {
    dashboard: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
    loanlist: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    logout:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    moon:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    sun:      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    globe:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    bell:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    facebook: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    users:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    report:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>',
    activity: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    repayment: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><polyline points="7 15 9 17 13 13"/></svg>',
    customers: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M15 9h3M15 13h3M5 17c0-1.1 1.79-2 4-2s4 .9 4 2"/></svg>',
    portal:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    profile:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
    ccr:       '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    schedule:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>',
    journal:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  };

  function getCurrentPage() {
    const path = window.location.pathname.replace(/\\/g, '/');
    const parts = path.split('/');
    return parts[parts.length - 1] || 'index.html';
  }

  /* Returns '../' when inside pages/ subfolder, '' when at root */
  function getBase() {
    const rootPages = ['index.html', 'login.html'];
    return rootPages.includes(getCurrentPage()) ? '' : '../';
  }

  function getAuthRole() {
    try { var a = JSON.parse(localStorage.getItem('appAuth')||'null'); return a ? (a.role||'') : ''; } catch(e) { return ''; }
  }

  var _PERMS = {
    settings: ['Admin'],
    write:    ['Admin','Sub Admin','Owner','Staff Loan','Staff','Moderator','Tester'],
    delete:   ['Admin','Owner','Moderator'],
    reports:  ['Admin','Sub Admin','Owner','Staff Loan','Staff','Moderator','Viewer'],
    actAll:   ['Admin','Owner','Moderator'],
    actOwn:   ['Admin','Sub Admin','Owner','Staff Loan','Staff','Moderator','Viewer','Tester']
  };
  /* merge saved overrides from localStorage */
  (function(){
    try {
      var saved = JSON.parse(localStorage.getItem('appPerms')||'null');
      if (saved && typeof saved==='object') Object.keys(saved).forEach(function(k){ _PERMS[k]=saved[k]; });
    } catch(e){}
  })();
  window.appCan = function(perm) {
    var role = getAuthRole();
    return (_PERMS[perm]||[]).indexOf(role) !== -1;
  };
  /* called by settings page after saving to DB */
  window.appUpdatePerms = function(perms) {
    Object.keys(perms).forEach(function(k){ _PERMS[k]=perms[k]; });
    try { localStorage.setItem('appPerms', JSON.stringify(_PERMS)); } catch(e){}
  };
  /* fetch fresh perms from DB and cache — call once on login/init */
  window.appSyncPerms = async function() {
    try {
      if (typeof CamboAPI==='undefined') return;
      var r = await CamboAPI.post({ action:'perms_get' });
      if (r && r.ok && r.perms) window.appUpdatePerms(r.perms);
    } catch(e){}
  };

  /* ── Page access ── */
  var _PA_ALL = ['Admin','Sub Admin','Owner','Staff Loan','Staff','Moderator','Viewer','Tester'];
  var _PAGE_ACCESS = (function(){
    var def = { dashboard:_PA_ALL.slice(), customers:_PA_ALL.slice(), loanlist:_PA_ALL.slice(), reports:_PA_ALL.slice(), repayment:_PA_ALL.slice(), fbid:_PA_ALL.slice(), activitylog:_PA_ALL.slice(), team:_PA_ALL.slice(), borrowerprofile:_PA_ALL.slice(), journal:_PA_ALL.slice(), ccr:_PA_ALL.slice(), schedule:_PA_ALL.slice(), settings:['Admin'] };
    try { var s = JSON.parse(localStorage.getItem('appPageAccess')||'null'); if (s && typeof s==='object') Object.keys(s).forEach(function(k){ def[k]=s[k]; }); } catch(e){}
    return def;
  })();
  window.appCanPage = function(page) {
    var role = getAuthRole();
    if (role === 'Admin') return true;
    return (_PAGE_ACCESS[page]||[]).indexOf(role) !== -1;
  };
  window.appUpdatePageAccess = function(acc) {
    Object.keys(acc).forEach(function(k){ _PAGE_ACCESS[k]=acc[k]; });
    try { localStorage.setItem('appPageAccess', JSON.stringify(_PAGE_ACCESS)); } catch(e){}
  };
  window.appSyncPageAccess = async function() {
    try {
      if (typeof CamboAPI==='undefined') return;
      var r = await CamboAPI.post({ action:'page_access_get' });
      if (r && r.ok && r.access) window.appUpdatePageAccess(r.access);
    } catch(e){}
  };

  /* Every entry the left menu can show, and what has to be true for it to
     appear. Kept as data because the menu is drawn in the order the config
     lists — the run of hard-coded lines it replaces meant a saved order was
     read, stored and then quietly ignored. */
  var SB_ITEMS = {
    dash:  { page:'index.html',                   ic:'dashboard', label:function(){return t('ផ្ទាំងគ្រប់គ្រង','Dashboard');},  ok:function(){return appCanPage('dashboard');} },
    cust:  { page:'pages/customers.html',         ic:'customers', label:function(){return t('អតិថិជន','Customers');},        ok:function(){return appCanPage('customers');} },
    add:   { page:'pages/add-customer.html',      ic:'profile',   label:function(){return t('បន្ថែមអតិថិជន','Add Customer');}, ok:function(){return appCanPage('customers');} },
    loans: { page:'pages/loan-list.html',         ic:'loanlist',  label:function(){return t('បញ្ជីកម្ចី','Loan List');},       ok:function(){return appCanPage('loanlist');} },
    rpt:   { page:'pages/reports.html',           ic:'report',    label:function(){return t('របាយការណ៍','Reports');},        ok:function(){return appCan('reports') && appCanPage('reports');} },
    rep:   { page:'pages/repayment-tracker.html', ic:'repayment', label:function(){return t('ការសង','Repayment');},          ok:function(){return appCanPage('repayment');} },
    sch:   { page:'pages/schedule.html',          ic:'schedule',  label:function(){return t('កាលវិភាគសង','Schedule');},       ok:function(){return appCanPage('schedule');} },
    jr:    { page:'pages/journal.html',           ic:'journal',   label:function(){return t('កំណត់ត្រា','Journal');},         ok:function(){return appCanPage('journal');} },
    fb:    { page:'pages/fb-id-finder.html',      ic:'facebook',  label:function(){return t('FB ID','FB ID Finder');},      ok:function(){return appCanPage('fbid');} },
    team:  { page:'pages/team.html',              ic:'users',     label:function(){return t('ក្រុម','Team');},               ok:function(){return appCanPage('team');} },
    ccr:   { page:'pages/ccr.html',               ic:'ccr',       label:function(){return t('CCR','CCR');},                 ok:function(){return appCanPage('ccr');} },
    act:   { page:'pages/activity-log.html',      ic:'activity',  label:function(){return t('កំណត់ហេតុ','Activity Log');},    ok:function(){return appCanPage('activitylog');} },
    prof:  { page:'pages/my-profile.html',        ic:'profile',   label:function(){return t('ប្រវត្តិរូបខ្ញុំ','My Profile');}, ok:function(){return true;} },
    set:   { page:'pages/settings.html',          ic:'settings',  label:function(){return t('ការកំណត់','Settings');},        ok:function(){return getAuthRole() === 'Admin';} }
  };

  /* `cfgOverride` lets the Settings preview render a draft config without saving it. */
  function buildSidebar(cfgOverride) {
    const cur  = getCurrentPage();
    const base = getBase();
    function link(page, icon, label, danger) {
      const pageName = page.split('/').pop();
      const active   = cur === pageName ? 'sb-active' : '';
      const cls      = danger ? 'sb-link sb-link-danger' : 'sb-link';
      const onclick  = danger ? ' onclick="event.preventDefault();handleLogout();"' : '';
      return `<li><a href="${base}${page}" class="${cls} ${active}" data-page="${pageName}" data-tooltip="${label}"${onclick}><span class="sb-icon">${icon}</span><span class="sb-label">${label}</span><span class="sb-active-dot"></span></a></li>`;
    }

    const _brand = getBrand();
    const _bName = _brand.name || 'CAMBO';
    const _bSub  = _brand.sub  || 'Loan Management';
    const _bLogo = _brand.logoUrl ? _brand.logoUrl : `${base}images/logo/LOGO.png`;

    const _sb  = cfgOverride ? sbNorm(cfgOverride) : getSbCfg();
    const _has = m => _sb.show.indexOf(m) !== -1;
    /* A page shows in the menu when the config lists it AND the account may open it. */
    const _pick = key => _sb.links.indexOf(key) !== -1;

    return `
      ${_has('brand') ? `<div class="sb-head">
        <button class="sb-brand-btn" id="sbBrandBtn" onclick="location.href=location.pathname.includes('/pages/')? '../index.html':'index.html'" title="Dashboard">
          <div class="sb-logo-wrap">
            <img class="sb-logo-img" src="${_bLogo}" alt="${_bName}" onerror="this.style.display='none'">
          </div>
          <div class="sb-brand-text">
            <div class="sb-brand-name">${_bName}</div>
            <div class="sb-brand-sub">${_bSub}</div>
          </div>
        </button>
        <button class="sb-collapse-btn" id="sbToggleBtn" title="Toggle sidebar"></button>
      </div>` : ''}

      ${_has('status') ? `<div class="sb-status-strip">
        <span class="sb-live-dot"></span>
        <span class="sb-live-txt">${t('ប្រព័ន្ធដំណើរការ','System Online')}</span>
      </div>` : ''}

      <div class="sb-divider"></div>

      <nav class="sb-nav">
        ${_has('label') ? `<div class="sb-section-label">${t('ម៉ឺនុយចំបង','Main Menu')}</div>` : ''}
        <ul class="sb-list">
          ${_sb.links.map(function (k) {
            var it = SB_ITEMS[k];
            return (it && it.ok()) ? link(it.page, ic[it.ic], it.label()) : '';
          }).join('')}
          ${_has('portal') ? `<li class="sb-divider sb-divider-sm"></li>
          <li><a href="${base}pages/user.html" class="sb-link" target="_blank" rel="noopener" data-tooltip="${t('ផតថលអតិថិជន','User')}"><span class="sb-icon">${ic.portal}</span><span class="sb-label">${t('ផតថលអតិថិជន','User')}</span><span class="sb-active-dot"></span></a></li>` : ''}
        </ul>
      </nav>

      `;
  }

  function buildTopbar() {
    return `<button class="topbar-menu-btn" id="topbarMenuBtn" title="Menu">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>`;
  }

  function buildBottomNav() {
    const cur  = getCurrentPage();
    const base = getBase();
    const role = getAuthRole();
    function bnItem(page, icon, label) {
      const pageName = page.split('/').pop();
      const active   = cur === pageName ? 'sb-bn-active' : '';
      return `<a href="${base}${page}" class="sb-bn-item ${active}">
        <span class="sb-bn-icon">${icon}</span>
        <span class="sb-bn-label">${label}</span>
      </a>`;
    }
    return `<nav class="sb-bottom-nav" id="sbBottomNav">
      ${bnItem('index.html',              ic.dashboard, t('ផ្ទាំងគ្រប់គ្រង','Dashboard'))}
      ${bnItem('pages/loan-list.html',    ic.loanlist,  t('កម្ចី','Loans'))}
      ${bnItem('pages/fb-id-finder.html', ic.facebook,  t('FB ID','FB ID'))}
      ${bnItem('pages/team.html',         ic.users,     t('ក្រុម','Team'))}
      ${role === 'Admin' ? bnItem('pages/settings.html', ic.settings, t('ការកំណត់','Settings')) : ''}
    </nav>`;
  }

  function handleLogout() {
    location.href = getBase() + 'login.html';
  }
  window.handleLogout = handleLogout;

  function showLogoutModal() {
    var existing = document.getElementById('hlLogoutModal');
    if (existing) existing.remove();
    var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    var cardBg  = isDark ? 'rgba(15,23,42,.97)' : 'rgba(255,255,255,.98)';
    var textPri = isDark ? '#f1f5f9' : '#0f172a';
    var textSec = isDark ? '#94a3b8' : '#64748b';
    var btnBdr  = isDark ? 'rgba(148,163,184,.18)' : 'rgba(148,163,184,.35)';
    var btnClr  = isDark ? '#94a3b8' : '#64748b';
    var m = document.createElement('div');
    m.id = 'hlLogoutModal';
    m.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:hlFadeIn .15s ease';
    m.innerHTML = '<style>@keyframes hlFadeIn{from{opacity:0}to{opacity:1}}@keyframes hlSlideUp{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}</style>'
      + '<div style="background:'+cardBg+';border:1px solid rgba(124,92,255,.2);border-radius:22px;padding:30px 28px 24px;min-width:270px;max-width:320px;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,.45);animation:hlSlideUp .18s ease">'
      + '<div style="width:48px;height:48px;background:rgba(239,68,68,.1);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px">'
      + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
      + '</div>'
      + '<div style="font-size:16px;font-weight:800;color:'+textPri+';margin-bottom:6px;font-family:inherit">Sign Out?</div>'
      + '<div style="font-size:12.5px;color:'+textSec+';margin-bottom:22px;line-height:1.6">Are you sure you want to<br>sign out of '+(getBrand().name||'this app')+'?</div>'
      + '<div style="display:flex;gap:10px">'
      + '<button id="hlLogoutCancel" style="flex:1;padding:11px;border-radius:11px;border:1.5px solid '+btnBdr+';background:transparent;color:'+btnClr+';font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:.15s">Cancel</button>'
      + '<button id="hlLogoutOk" style="flex:1;padding:11px;border-radius:11px;border:none;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 14px rgba(239,68,68,.35)">Sign Out</button>'
      + '</div>'
      + '</div>';
    document.body.appendChild(m);
    document.getElementById('hlLogoutCancel').onclick = function() { m.remove(); };
    m.addEventListener('click', function(e) { if (e.target === m) m.remove(); });
    document.getElementById('hlLogoutOk').onclick = async function() {
      m.remove();
      try {
        if (window.CamboAPI) {
          await Promise.race([
            window.CamboAPI.post({ action: 'user_logout' }),
            new Promise(function(r){ setTimeout(r, 800); })
          ]);
        }
      } catch(e) {}
      if (window.CamcvcAuth) window.CamcvcAuth.logout();
      else location.href = getBase() + 'pages/login.html';
    };
  }
  window._hlShowLogoutModal = showLogoutModal;

  function _updateSidebarAvatar(url) {
    var el = document.getElementById('sbUserAvatar');
    if (!el) return;
    if (url) {
      el.innerHTML = '<img src="'+url+'" alt="photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    } else {
      var base = getBase();
      el.innerHTML = '<img src="'+base+'images/logo/CAMCVC-Loan.png" alt="CAMCVC Loan" onerror="this.style.display=\'none\';this.parentNode.textContent=\'HL\'">';
    }
  }

  function showProfileModal() {
    var existing = document.getElementById('hlProfileModal');
    if (existing) existing.remove();

    var _a = null;
    try { _a = JSON.parse(localStorage.getItem('appAuth')||'null'); } catch(e){}
    if (!_a) return;

    var isDark  = document.documentElement.getAttribute('data-theme') !== 'light';
    var cardBg  = isDark ? 'rgba(15,23,42,.97)' : 'rgba(255,255,255,.98)';
    var textPri = isDark ? '#f1f5f9' : '#0f172a';
    var textSec = isDark ? '#94a3b8' : '#64748b';
    var inputBg = isDark ? 'rgba(30,41,59,.8)' : 'rgba(248,250,252,1)';
    var inputBdr = isDark ? 'rgba(148,163,184,.2)' : 'rgba(203,213,225,1)';
    var divBdr  = isDark ? 'rgba(148,163,184,.12)' : 'rgba(203,213,225,.6)';

    var photoUrl = localStorage.getItem('user_photo') || '';
    var avatarInner = photoUrl
      ? '<img src="'+photoUrl+'" alt="photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
      : '<span style="font-size:26px;font-weight:800;color:#a78bfa">'+(_a.name||_a.u||'HL').charAt(0).toUpperCase()+'</span>';

    var m = document.createElement('div');
    m.id = 'hlProfileModal';
    m.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:hlFadeIn .15s ease;padding:20px;box-sizing:border-box';

    m.innerHTML = '<style>@keyframes hlFadeIn{from{opacity:0}to{opacity:1}}@keyframes hlSlideUp{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}@keyframes hlSpin{to{transform:rotate(360deg)}}</style>'
      + '<div id="hlProfileCard" style="background:'+cardBg+';border:1px solid rgba(124,92,255,.2);border-radius:22px;padding:28px 24px 24px;width:100%;max-width:360px;box-shadow:0 24px 64px rgba(0,0,0,.45);animation:hlSlideUp .18s ease;position:relative;max-height:calc(100vh - 40px);overflow-y:auto;box-sizing:border-box">'

      /* close */
      + '<button id="hlProfClose" style="position:absolute;top:16px;right:16px;width:28px;height:28px;border-radius:50%;border:1px solid '+inputBdr+';background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:'+textSec+';font-size:16px;line-height:1;font-family:inherit">✕</button>'

      /* title */
      + '<div style="font-size:15px;font-weight:800;color:'+textPri+';margin-bottom:20px;text-align:center">My Account</div>'

      /* avatar */
      + '<div style="display:flex;flex-direction:column;align-items:center;margin-bottom:22px">'
      + '<div id="hlProfAvatarWrap" style="position:relative;width:78px;height:78px">'
      + '<div id="hlProfAvatarCircle" style="width:78px;height:78px;border-radius:50%;background:rgba(124,92,255,.12);border:2.5px solid rgba(124,92,255,.35);display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:'+(photoUrl?'zoom-in':'default')+'" title="'+(photoUrl?'View photo':'')+'"">'
      + avatarInner
      + '</div>'
      + '<div id="hlProfCamBadge" style="position:absolute;bottom:1px;right:1px;width:24px;height:24px;border-radius:50%;background:#7c3aed;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(124,58,237,.5);cursor:pointer" title="Change photo">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'
      + '</div>'
      + '</div>'
      + '<input type="file" id="hlProfFileInput" accept="image/*" style="display:none">'
      + '<div id="hlProfPhotoStatus" style="font-size:11px;color:'+textSec+';margin-top:7px;min-height:16px;text-align:center"></div>'
      + '</div>'

      /* display name */
      + '<div style="margin-bottom:13px">'
      + '<label style="display:block;font-size:11.5px;font-weight:700;color:'+textSec+';margin-bottom:5px;letter-spacing:.03em">DISPLAY NAME</label>'
      + '<input id="hlProfDisplayName" type="text" value="'+(_a.name||'').replace(/[<>"&]/g,function(c){return{'<':'&lt;','>':'&gt;','"':'&quot;','&':'&amp;'}[c];})+'" placeholder="Display name" autocomplete="off" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1.5px solid '+inputBdr+';background:'+inputBg+';color:'+textPri+';font-size:13px;font-family:inherit;outline:none">'
      + '</div>'

      /* username */
      + '<div style="margin-bottom:18px">'
      + '<label style="display:block;font-size:11.5px;font-weight:700;color:'+textSec+';margin-bottom:5px;letter-spacing:.03em">USERNAME</label>'
      + '<input id="hlProfUsername" type="text" value="'+(_a.u||'').replace(/[<>"&]/g,function(c){return{'<':'&lt;','>':'&gt;','"':'&quot;','&':'&amp;'}[c];})+'" placeholder="Username" autocomplete="off" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1.5px solid '+inputBdr+';background:'+inputBg+';color:'+textPri+';font-size:13px;font-family:inherit;outline:none">'
      + '</div>'

      /* divider */
      + '<div style="border-top:1px solid '+divBdr+';margin:0 0 16px"></div>'

      /* new pin */
      + '<div style="margin-bottom:18px">'
      + '<label style="display:block;font-size:11.5px;font-weight:700;color:'+textSec+';margin-bottom:5px;letter-spacing:.03em">NEW PIN <span style="font-weight:400;opacity:.65">(optional)</span></label>'
      + '<input id="hlProfNewPin" type="password" placeholder="New PIN..." autocomplete="new-password" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1.5px solid '+inputBdr+';background:'+inputBg+';color:'+textPri+';font-size:13px;font-family:inherit;outline:none">'
      + '</div>'

      /* divider */
      + '<div style="border-top:1px solid '+divBdr+';margin:0 0 16px"></div>'

      /* current pin */
      + '<div style="margin-bottom:18px">'
      + '<label style="display:block;font-size:11.5px;font-weight:700;color:'+textSec+';margin-bottom:5px;letter-spacing:.03em">CURRENT PIN <span style="color:#ef4444">*</span></label>'
      + '<input id="hlProfCurrentPin" type="password" placeholder="Current PIN..." autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1.5px solid '+inputBdr+';background:'+inputBg+';color:'+textPri+';font-size:13px;font-family:inherit;outline:none">'
      + '<div style="font-size:11px;color:'+textSec+';margin-top:4px">Required to change name or PIN</div>'
      + '</div>'

      /* error */
      + '<div id="hlProfError" style="font-size:12.5px;color:#ef4444;margin-bottom:12px;min-height:18px;text-align:center"></div>'

      /* save */
      + '<div style="display:flex;gap:8px">'
      + '<button id="hlProfLogout" style="flex:1;padding:12px;border-radius:12px;border:1.5px solid rgba(239,68,68,.25);background:rgba(239,68,68,.07);color:#ef4444;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s">Logout</button>'
      + '<button id="hlProfSave" style="flex:2;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 14px rgba(124,58,237,.35)">Save</button>'
      + '</div>'
      + '</div>';

    document.body.appendChild(m);

    document.getElementById('hlProfClose').onclick = function() { m.remove(); };
    m.addEventListener('click', function(e) { if (e.target === m) m.remove(); });

    document.getElementById('hlProfLogout').onclick = function() {
      m.remove();
      showLogoutModal();
    };

    /* Avatar circle click → preview current photo */
    document.getElementById('hlProfAvatarCircle').addEventListener('click', function() {
      var url = localStorage.getItem('user_photo') || '';
      if (!url) return;
      var prev = document.createElement('div');
      prev.style.cssText = 'position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.88);cursor:zoom-out;animation:hlFadeIn .15s ease';
      prev.innerHTML = '<img src="'+url+'" style="max-width:88vw;max-height:88vh;border-radius:16px;object-fit:contain;box-shadow:0 24px 64px rgba(0,0,0,.8)">';
      prev.onclick = function() { prev.remove(); };
      document.body.appendChild(prev);
    });

    /* Camera badge click → file picker */
    document.getElementById('hlProfCamBadge').addEventListener('click', function(e) {
      e.stopPropagation();
      document.getElementById('hlProfFileInput').click();
    });

    document.getElementById('hlProfFileInput').addEventListener('change', function(e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var statusEl = document.getElementById('hlProfPhotoStatus');
      statusEl.style.color = textSec;
      statusEl.textContent = 'Uploading...';
      var reader = new FileReader();
      reader.onload = async function(ev) {
        try {
          var api = window.CamboAPI;
          if (!api) { statusEl.textContent = 'CamboAPI not found'; return; }
          var auth = null;
          try { auth = JSON.parse(localStorage.getItem('appAuth')||'null'); } catch(ee){}
          var r = await api.post({ action:'upload_photo', auth:auth, data: ev.target.result });
          if (!r || !r.ok) { statusEl.textContent = 'Failed: '+(r&&r.message||'Error'); return; }
          var r2 = await api.post({ action:'user_self_update', auth:auth, type:'photo', photo_url: r.url });
          if (!r2 || !r2.ok) { statusEl.textContent = 'Failed: '+(r2&&r2.message||'Error'); return; }
          localStorage.setItem('user_photo', r.url);
          window.appApplyTopbar && window.appApplyTopbar();
          var circle = document.getElementById('hlProfAvatarCircle');
          if (circle) {
            circle.innerHTML = '<img src="'+r.url+'" alt="photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
            circle.style.cursor = 'zoom-in';
            circle.title = 'View photo';
          }
          _updateSidebarAvatar(r.url);
          statusEl.style.color = '#22c55e';
          statusEl.textContent = 'Photo updated!';
          setTimeout(function() { statusEl.textContent = ''; }, 2500);
        } catch(err) {
          statusEl.textContent = 'Error: ' + err.message;
        }
      };
      reader.readAsDataURL(file);
    });

    /* Save button */
    document.getElementById('hlProfSave').onclick = async function() {
      var btn = this;
      var errEl = document.getElementById('hlProfError');
      errEl.textContent = '';

      var displayName  = document.getElementById('hlProfDisplayName').value.trim();
      var newUsername  = document.getElementById('hlProfUsername').value.trim();
      var newPin       = document.getElementById('hlProfNewPin').value.trim();
      var currentPin   = document.getElementById('hlProfCurrentPin').value.trim();

      var origName = _a.name || '';
      var origUser = _a.u   || '';

      var nameChanged = displayName && displayName !== origName;
      var userChanged = newUsername  && newUsername  !== origUser;
      var pinChanged  = !!newPin;

      if (!nameChanged && !userChanged && !pinChanged) {
        errEl.textContent = 'Nothing to change';
        return;
      }
      if (!currentPin) {
        errEl.textContent = 'Enter your current PIN';
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:hlSpin .65s linear infinite;vertical-align:middle;margin-top:-2px"></span>';

      var api = window.CamboAPI;
      if (!api) { errEl.textContent = 'CamboAPI not found'; btn.disabled=false; btn.textContent='Save'; return; }

      function freshAuth() {
        try { return JSON.parse(localStorage.getItem('appAuth')||'null'); } catch(ee) { return null; }
      }

      try {
        if (nameChanged || userChanged) {
          var r = await api.post({
            action:'user_self_update', auth: freshAuth(),
            type:'profile',
            display_name: nameChanged ? displayName : origName,
            new_username: userChanged ? newUsername : '',
            current_pin: currentPin
          });
          if (!r || !r.ok) {
            errEl.textContent = (r&&r.message) || 'Save failed';
            btn.disabled = false; btn.textContent = 'Save'; return;
          }
          var auth2 = freshAuth() || {};
          if (nameChanged) auth2.name = r.display_name || displayName;
          if (userChanged)  auth2.u   = r.username     || newUsername;
          localStorage.setItem('appAuth', JSON.stringify(auth2));
          var nameEl = document.getElementById('sbUserName');
          if (nameEl) nameEl.textContent = auth2.name || auth2.u;
        }

        if (pinChanged) {
          var r2 = await api.post({
            action:'user_self_update', auth: freshAuth(),
            type:'pin',
            current_pin: currentPin,
            new_pin: newPin
          });
          if (!r2 || !r2.ok) {
            errEl.textContent = (r2&&r2.message) || 'PIN change failed';
            btn.disabled = false; btn.textContent = 'Save'; return;
          }
          var auth3 = freshAuth() || {};
          auth3.p = newPin;
          localStorage.setItem('appAuth', JSON.stringify(auth3));
        }

        btn.style.cssText = 'width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-size:14px;font-weight:700;font-family:inherit;cursor:default';
        btn.textContent = 'Done';
        setTimeout(function() { m.remove(); }, 900);

      } catch(err) {
        errEl.textContent = 'Error: ' + err.message;
        btn.disabled = false; btn.textContent = 'Save';
      }
    };
  }
  window._hlShowProfileModal = showProfileModal;

  function showUserMenu() {
    var existing = document.getElementById('hlUserMenu');
    if (existing) { existing.remove(); return; }

    var card = document.getElementById('sbUserRow');
    if (!card) return;
    var sb = document.querySelector('.sidebar');
    var sbRect = sb ? sb.getBoundingClientRect() : null;
    var cardRect = card.getBoundingClientRect();
    var isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    var menu = document.createElement('div');
    menu.id = 'hlUserMenu';
    menu.className = 'hl-umenu';
    var isMobile = window.innerWidth < 768;
    var sbW = sbRect ? sbRect.width : 240;
    var menuBottom = window.innerHeight - cardRect.bottom;
    var menuLeft, menuWidth;
    if (isMobile) {
      /* Mobile: float above user card, full sidebar width, inside sidebar */
      menuLeft  = sbRect ? sbRect.left : 0;
      menuWidth = sbW;
    } else {
      /* Desktop: popup to the right of sidebar */
      menuLeft  = sbRect ? sbRect.right + 8 : 248;
      menuWidth = 220;
    }
    menu.style.cssText = 'position:fixed'
      + ';bottom:' + menuBottom + 'px'
      + ';left:' + menuLeft + 'px'
      + ';width:' + menuWidth + 'px;z-index:99999';

    var userIc = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

    menu.innerHTML = ''
      + '<button class="hl-umenu-item hl-umenu-theme" id="hlUmenuThemeBtn">'
      +   '<span class="hl-umenu-ic" id="hlUmenuThemeIc">' + (isDark ? ic.sun : ic.moon) + '</span>'
      +   '<span class="hl-umenu-label">' + (isDark ? t('ប្ដូរ Light Mode','Switch to Light') : t('ប្ដូរ Dark Mode','Switch to Dark')) + '</span>'
      +   '<span class="hl-umenu-pill" id="hlUmenuPill">' + (isDark ? 'DARK' : 'LIGHT') + '</span>'
      + '</button>'
      + '<div class="hl-umenu-sep"></div>'
      + '<button class="hl-umenu-item" id="hlUmenuProfileBtn">'
      +   '<span class="hl-umenu-ic">' + userIc + '</span>'
      +   '<span class="hl-umenu-label">' + t('ព័ត៌មានគណនី','Account Info') + '</span>'
      + '</button>'
      + '<button class="hl-umenu-item hl-umenu-danger" id="hlUmenuLogoutBtn">'
      +   '<span class="hl-umenu-ic">' + ic.logout + '</span>'
      +   '<span class="hl-umenu-label">' + t('ចេញ','Logout') + '</span>'
      + '</button>';

    document.body.appendChild(menu);

    document.getElementById('hlUmenuThemeBtn').addEventListener('click', function() {
      var cur = document.documentElement.getAttribute('data-theme');
      window._hlApplyTheme && window._hlApplyTheme(cur === 'light' ? 'dark' : 'light', true);
      menu.remove();
    });
    document.getElementById('hlUmenuProfileBtn').addEventListener('click', function() {
      menu.remove(); showProfileModal();
    });
    document.getElementById('hlUmenuLogoutBtn').addEventListener('click', function() {
      menu.remove(); showLogoutModal();
    });

    setTimeout(function() {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target) && !card.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 50);
  }
  window._hlShowUserMenu = showUserMenu;

  function initSidebarToggle(sidebar) {
    var btn = document.getElementById('sbToggleBtn');
    var sb  = document.querySelector('.sidebar');
    var dashboard = document.querySelector('.dashboard');

    /* Collapse to icons — offered only while the config enables the button */
    if (btn) btn.addEventListener('click', function() {
      var cfg = getSbCfg();
      if (cfg.mode === 'icons' || cfg.show.indexOf('collapse') === -1) return;
      localStorage.setItem('sb_collapsed', sbUserCollapsed() ? '0' : '1');
      applySidebarCfg();
    });

    /* Mobile overlay close */
    var overlay = document.querySelector('.sidebar-overlay');
    if (overlay) overlay.addEventListener('click', function() {
      document.body.classList.remove('sidebar-open');
    });

    /* Mobile hamburger open */
    var menuBtn = document.getElementById('topbarMenuBtn');
    if (menuBtn) menuBtn.addEventListener('click', function() {
      document.body.classList.toggle('sidebar-open');
    });
  }

  function initThemeBtn() {
    /* `persist` writes the choice to the server too. My Profile reads that value back and
       treats it as authoritative, so a toggle that only touched localStorage used to be
       undone the next time that page loaded. Page load itself must NOT persist. */
    function applyTheme(th, persist) {
      document.documentElement.setAttribute('data-theme', th);
      localStorage.setItem('theme', th);
      var tBtn = document.getElementById('topbarThemeBtn');
      if (tBtn) tBtn.innerHTML = th === 'light' ? ic.moon : ic.sun;
      var aBtn = document.getElementById('apptbThemeBtn');
      if (aBtn) aBtn.innerHTML = th === 'light' ? ic.moon : ic.sun;
      if (persist) {
        /* Stamp the choice so My Profile's server sync does not undo it while the
           fire-and-forget write is still in flight. */
        try { localStorage.setItem('theme_at', String(Date.now())); } catch(e) {}
        if (typeof CamboAPI !== 'undefined') {
          try { CamboAPI.post({ action: 'ui_prefs_set', prefs: { theme: th } }).catch(function(){}); } catch(e) {}
        }
      }
    }
    window._hlApplyTheme = applyTheme;
    applyTheme(localStorage.getItem('theme') || 'light', false);
  }

  function initLogoutBtn() {
    var btn = document.getElementById('sbLogoutBtn');
    if (!btn) return;
    btn.addEventListener('click', function() { showLogoutModal(); });
  }

  /* ══════════════════════════════════════════════════════════════
     APP TOP BAR — slim, configurable (Settings › App Config)
     ══════════════════════════════════════════════════════════════ */

  /* Every page that can appear as a quick link: key → page, icon, perm, label */
  var TB_PAGES = {
    dash:  { page:'index.html',                    ic:'dashboard', perm:'dashboard',   kh:'ផ្ទាំងគ្រប់គ្រង', en:'Dashboard'    },
    cust:  { page:'pages/customers.html',          ic:'customers', perm:'customers',   kh:'អតិថិជន',      en:'Customers'    },
    add:   { page:'pages/add-customer.html',       ic:'profile',   perm:'customers',   kh:'បន្ថែមអតិថិជន', en:'Add Customer' },
    loans: { page:'pages/loan-list.html',          ic:'loanlist',  perm:'loanlist',    kh:'បញ្ជីកម្ចី',     en:'Loan List'    },
    rpt:   { page:'pages/reports.html',            ic:'report',    perm:'reports',     kh:'របាយការណ៍',    en:'Reports'      },
    rep:   { page:'pages/repayment-tracker.html',  ic:'repayment', perm:'repayment',   kh:'ការសង',        en:'Repayment'    },
    fb:    { page:'pages/fb-id-finder.html',       ic:'facebook',  perm:'fbid',        kh:'FB ID',        en:'FB ID Finder' },
    act:   { page:'pages/activity-log.html',       ic:'activity',  perm:'activitylog', kh:'កំណត់ហេតុ',     en:'Activity Log' },
    team:  { page:'pages/team.html',               ic:'users',     perm:'team',        kh:'ក្រុម',         en:'Team'         },
    ccr:   { page:'pages/ccr.html',                ic:'ccr',       perm:'ccr',         kh:'CCR',          en:'CCR'          },
    sch:   { page:'pages/schedule.html',           ic:'schedule',  perm:'schedule',    kh:'កាលវិភាគសង',   en:'Schedule'     },
    jr:    { page:'pages/journal.html',            ic:'journal',   perm:'journal',     kh:'កំណត់ត្រា',     en:'Journal'      },
    set:   { page:'pages/settings.html',           ic:'settings',  perm:'__admin',     kh:'ការកំណត់',     en:'Settings'     },
    prof:  { page:'pages/my-profile.html',         ic:'profile',   perm:'__all',       kh:'ប្រវត្តិរូបខ្ញុំ', en:'My Profile'   }
  };
  window.appTbPages = TB_PAGES;

  var TB_MODULES = ['title','links','search','chat','clock','theme','lang','user','logout','mob'];
  window.appTbModules = TB_MODULES;

  var TB_DEFAULT = {
    on:    1,
    mode:  'always',                 /* always | auto (hide while scrolling down) */
    size:  'md',                     /* sm | md | lg */
    style: 'glass',                  /* glass | solid | accent */
    show:  ['title','links','search','chat','theme','lang','user'],
    links: ['dash','cust','loans','rep','team']
  };
  window.appTbDefault = TB_DEFAULT;

  function tbNorm(raw) {
    var c = {};
    raw = raw || {};
    c.on    = (raw.on === 0 || raw.on === '0' || raw.on === false) ? 0 : 1;
    c.mode  = (raw.mode === 'auto') ? 'auto' : 'always';
    c.size  = ['sm','md','lg'].indexOf(raw.size) !== -1 ? raw.size : 'md';
    c.style = ['glass','solid','accent'].indexOf(raw.style) !== -1 ? raw.style : 'glass';
    function list(v, fallback, valid) {
      if (v === '-' || v === '') return [];
      var a = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',') : null);
      if (!a) return fallback.slice();
      return a.map(function(x){ return String(x).trim(); })
              .filter(function(x){ return valid.indexOf(x) !== -1; });
    }
    c.show  = list(raw.show,  TB_DEFAULT.show,  TB_MODULES);
    c.links = list(raw.links, TB_DEFAULT.links, Object.keys(TB_PAGES));
    return c;
  }
  window.appTbNormalize = tbNorm;

  function getTbCfg() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem('appTopbar') || 'null'); } catch(e) {}
    return tbNorm(raw || TB_DEFAULT);
  }
  window.appGetTopbar = getTbCfg;
  window.appSetTopbar = function(c) {
    try { localStorage.setItem('appTopbar', JSON.stringify(tbNorm(c))); } catch(e) {}
  };

  function tbHas(cfg, m) { return cfg.show.indexOf(m) !== -1; }

  var tbIcons = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    chat:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.1 9.1 0 0 1-3.3-.6L3 21l1.8-4.6A8.2 8.2 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"/></svg>'
  };

  function tbAllowed(key) {
    var d = TB_PAGES[key];
    if (!d) return false;
    if (d.perm === '__all')   return true;
    if (d.perm === '__admin') return getAuthRole() === 'Admin';
    if (d.perm === 'reports') return appCan('reports') && appCanPage('reports');
    return appCanPage(d.perm);
  }

  /* ══════════════════════════════════════════════════════════════
     TOP BAR CHAT — icon + Messenger-style dropdown of conversations
     ══════════════════════════════════════════════════════════════ */
  /* Settings renders a live preview of this bar, ids and all, so two elements can
     answer to the same id — and getElementById hands back whichever the page parsed
     first, which is the dead copy inside a hidden panel. Every lookup below is
     therefore anchored to the real bar. */
  function tbEl(id) {
    var bar = document.getElementById('appTopBar');
    return (bar && bar.querySelector('#' + id)) || document.getElementById(id);
  }

  var _tbChatThreads = null;   /* last loaded conversation list */
  var _tbChatTeam    = null;   /* team_list cache, for starting a new chat */
  var _tbChatCounts  = {};     /* unread per peer, kept fresh by chat-global's poll */

  function tbChatEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* messages store UTC without a suffix — same normalisation chat-global uses */
  function tbChatMs(dt) {
    if (!dt) return NaN;
    var s = String(dt).trim().replace(' ', 'T');
    if (!/Z$|[+-]\d{2}:\d{2}$/.test(s)) s += 'Z';
    var ms = new Date(s).getTime();
    return isNaN(ms) ? NaN : ms;
  }

  function tbChatAgo(dt) {
    var ms = tbChatMs(dt);
    if (isNaN(ms)) return '';
    var mins = Math.floor((Date.now() - ms) / 60000);
    if (mins < 1)    return 'now';
    if (mins < 60)   return mins + 'm';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24)    return hrs + 'h';
    var days = Math.floor(hrs / 24);
    if (days < 7)    return days + 'd';
    return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  function tbChatOnline(dt) {
    var ms = tbChatMs(dt);
    return !isNaN(ms) && (Date.now() - ms) < 10 * 60 * 1000;
  }

  function tbChatAvatar(name, photo, online) {
    var ini = String(name || '?').charAt(0).toUpperCase();
    return '<span class="apptb-cav' + (online ? ' is-on' : '') + '">'
         + (photo ? '<img src="' + tbChatEsc(photo) + '" alt="">' : tbChatEsc(ini))
         + '</span>';
  }

  function tbChatPreview(t) {
    if (t.body)      return (t.from_me ? 'You: ' : '') + t.body;
    if (t.image_url) return (t.from_me ? 'You: ' : '') + '📷 Photo';
    return '';
  }

  function tbChatBadgeTotal() {
    var n = 0;
    Object.keys(_tbChatCounts).forEach(function(k){ n += Number(_tbChatCounts[k]) || 0; });
    return n;
  }

  function tbChatPaintBadge() {
    var b = tbEl('apptbChatBadge');
    if (!b) return;
    var n = tbChatBadgeTotal();
    b.textContent = n > 99 ? '99+' : String(n);
    b.hidden = n === 0;
    var btn = tbEl('apptbChatBtn');
    if (btn) btn.classList.toggle('has-unread', n > 0);
  }

  function tbChatRowHTML(t, isNew) {
    var online = tbChatOnline(t.last_seen);
    var un     = Number(t.unread) || 0;
    var prev   = tbChatPreview(t);
    return '<button type="button" class="apptb-crow' + (un ? ' is-unread' : '') + '"'
         + ' data-peer="'  + tbChatEsc(t.peer) + '"'
         + ' data-name="'  + tbChatEsc(t.display_name) + '"'
         + ' data-photo="' + tbChatEsc(t.photo_url) + '"'
         + ' data-online="' + (online ? '1' : '0') + '">'
         + tbChatAvatar(t.display_name, t.photo_url, online)
         + '<span class="apptb-ctxt">'
         +   '<span class="apptb-cname">' + tbChatEsc(t.display_name) + '</span>'
         +   '<span class="apptb-cprev">' + (isNew ? '<i>Start a new chat</i>' : tbChatEsc(prev)) + '</span>'
         + '</span>'
         + '<span class="apptb-cmeta">'
         +   '<span class="apptb-ctime">' + (isNew ? '' : tbChatEsc(tbChatAgo(t.created_at))) + '</span>'
         +   (un ? '<span class="apptb-cpill">' + (un > 9 ? '9+' : un) + '</span>' : '')
         + '</span>'
         + '</button>';
  }

  function tbChatRender(query) {
    var list = document.getElementById('apptbChatList');
    if (!list) return;
    query = String(query || '').trim().toLowerCase();

    if (_tbChatThreads === null) {
      list.innerHTML = '<div class="apptb-cempty">' + t('កំពុងផ្ទុក…','Loading…') + '</div>';
      return;
    }

    var threads = _tbChatThreads.map(function(t2) {
      var c = _tbChatCounts[t2.peer];
      return c === undefined ? t2 : Object.assign({}, t2, { unread: c });
    });
    if (query) {
      threads = threads.filter(function(t2) {
        return (t2.display_name || '').toLowerCase().indexOf(query) !== -1
            || (t2.peer || '').toLowerCase().indexOf(query) !== -1;
      });
    }

    var html = threads.map(function(t2){ return tbChatRowHTML(t2, false); }).join('');

    /* While searching, offer teammates you have never messaged yet */
    if (query && Array.isArray(_tbChatTeam)) {
      var known = {};
      (_tbChatThreads || []).forEach(function(t2){ known[t2.peer] = 1; });
      var me = (function(){ try { return (JSON.parse(localStorage.getItem('appAuth')||'null')||{}).u || ''; } catch(e) { return ''; } })();
      var fresh = _tbChatTeam.filter(function(u) {
        if (known[u.username] || u.username === me) return false;
        var nm = (u.display_name || u.username || '').toLowerCase();
        return nm.indexOf(query) !== -1 || String(u.username).toLowerCase().indexOf(query) !== -1;
      }).slice(0, 12);
      if (fresh.length) {
        html += '<div class="apptb-csep">' + t('សមាជិកផ្សេងទៀត','Other people') + '</div>'
              + fresh.map(function(u) {
                  return tbChatRowHTML({
                    peer: u.username, display_name: u.display_name || u.username,
                    photo_url: u.photo_url || '', last_seen: u.last_seen,
                    body: '', image_url: '', from_me: 0, created_at: null, unread: 0
                  }, true);
                }).join('');
      }
    }

    list.innerHTML = html || '<div class="apptb-cempty">'
      + (query ? t('រកមិនឃើញ','No matches') : t('មិនទាន់មានការឆាតនៅឡើយទេ','No conversations yet'))
      + '</div>';
  }

  async function tbChatLoad() {
    var ok = false;
    try {
      if (typeof CamboAPI !== 'undefined') {
        var r = await CamboAPI.post({ action: 'msg_threads' });
        if (r && r.ok) { _tbChatThreads = r.threads || []; ok = true; }
      }
    } catch(e) {}
    /* Never leave the list stuck on "Loading…" — show the empty state instead. */
    if (!ok && _tbChatThreads === null) _tbChatThreads = [];
    var q = (document.getElementById('apptbChatSearch') || {}).value || '';
    tbChatRender(q);
  }

  async function tbChatLoadTeam() {
    if (_tbChatTeam !== null) return;
    _tbChatTeam = [];
    try {
      if (typeof CamboAPI === 'undefined') return;
      var r = await CamboAPI.post({ action: 'team_list' });
      if (r && r.ok) _tbChatTeam = r.users || r.team || [];
    } catch(e) {}
  }

  function tbChatClose() {
    var pop = document.getElementById('apptbChatPop');
    if (pop) pop.remove();
    var btn = tbEl('apptbChatBtn');
    if (btn) btn.classList.remove('is-open');
    document.removeEventListener('mousedown', tbChatOutside, true);
  }

  function tbChatOutside(e) {
    var pop = document.getElementById('apptbChatPop');
    var btn = tbEl('apptbChatBtn');
    if (!pop) return;
    if (pop.contains(e.target) || (btn && btn.contains(e.target))) return;
    tbChatClose();
  }

  function tbChatPosition(pop, btn) {
    var r = btn.getBoundingClientRect();
    /* Hang it off the right end of the bar — under the profile chip — rather than
       off the chat icon itself. The icon sits mid-group, so aligning to it left a
       gap of bar to its right and the panel read as floating in the middle. */
    var bar = document.getElementById('appTopBar');
    var grp = bar && bar.querySelector('.apptb-right');
    var gr  = grp && grp.getBoundingClientRect();

    var w = pop.offsetWidth || 320;
    /* A hidden or detached element measures 0×0 and would drag the panel to the
       top-left corner; fall back to the window's own right edge. */
    var right = (gr && gr.width) ? gr.right
              : ((r.width || r.height) ? r.right : (window.innerWidth - 12));
    var top   = (r.width || r.height) ? r.bottom
              : ((gr && gr.height) ? gr.bottom : 56);

    var left = Math.min(Math.max(8, right - w), window.innerWidth - w - 8);
    pop.style.left = left + 'px';
    pop.style.top  = (top + 8) + 'px';
  }

  function tbChatOpen() {
    var btn = tbEl('apptbChatBtn');
    if (!btn) return;
    if (document.getElementById('apptbChatPop')) { tbChatClose(); return; }

    var pop = document.createElement('div');
    pop.id = 'apptbChatPop';
    pop.className = 'apptb-chatpop';
    pop.innerHTML =
        '<div class="apptb-chatpop-hd">' + t('ការឆាត','Chats') + '</div>'
      + '<div class="apptb-chatpop-search">'
      +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
      +   '<input type="text" id="apptbChatSearch" autocomplete="off" placeholder="' + t('ស្វែងរកឈ្មោះ…','Search people…') + '">'
      + '</div>'
      + '<div class="apptb-chatpop-list" id="apptbChatList"></div>';
    document.body.appendChild(pop);
    btn.classList.add('is-open');
    tbChatPosition(pop, btn);
    tbChatRender('');
    tbChatLoad();

    pop.addEventListener('click', function(e) {
      var row = e.target.closest && e.target.closest('.apptb-crow');
      if (!row) return;
      var peer = row.getAttribute('data-peer');
      tbChatClose();
      if (window.openGlobalChat) {
        window.openGlobalChat(peer, row.getAttribute('data-name'),
                              row.getAttribute('data-photo'),
                              row.getAttribute('data-online') === '1');
      }
      delete _tbChatCounts[peer];
      tbChatPaintBadge();
    });

    var si = document.getElementById('apptbChatSearch');
    if (si) {
      si.addEventListener('input', function() {
        if (si.value.trim()) tbChatLoadTeam().then(function(){ tbChatRender(si.value); });
        else tbChatRender('');
      });
      setTimeout(function(){ si.focus(); }, 60);
    }

    setTimeout(function(){ document.addEventListener('mousedown', tbChatOutside, true); }, 0);
  }

  /* chat-global.js already polls unread every 5s — reuse its broadcast, no extra requests */
  if (!window._tbChatBound) {
    window._tbChatBound = true;
    document.addEventListener('app-unread-update', function(e) {
      _tbChatCounts = (e.detail && e.detail.counts) || {};
      tbChatPaintBadge();
      if (document.getElementById('apptbChatPop')) {
        var q = (document.getElementById('apptbChatSearch') || {}).value || '';
        tbChatLoad();
        tbChatRender(q);
      }
    });
    window.addEventListener('resize', function() {
      var pop = document.getElementById('apptbChatPop');
      var btn = tbEl('apptbChatBtn');
      if (pop && btn) tbChatPosition(pop, btn);
    });
  }

  /* Build the bar markup for a config (also used by the Settings live preview) */
  function buildAppTopBar(cfg) {
    cfg = cfg || getTbCfg();
    var base = getBase();
    var cur  = getCurrentPage();
    var meta = (getPageMeta() || {})[cur] || { title: '', subtitle: '' };

    var left = '';
    if (tbHas(cfg, 'title')) {
      left = '<div class="apptb-left">'
           + '<div class="apptb-title">' + (meta.title || getBrand().name || 'CAMBO') + '</div>'
           + (meta.subtitle ? '<div class="apptb-sub">' + meta.subtitle + '</div>' : '')
           + '</div>';
    }

    var mid = '';
    if (tbHas(cfg, 'links') && cfg.links.length) {
      var items = cfg.links.filter(tbAllowed).map(function(k) {
        var d = TB_PAGES[k];
        var pageName = d.page.split('/').pop();
        var active = (cur === pageName) ? ' apptb-nav-active' : '';
        var label = t(d.kh, d.en);
        return '<a class="apptb-nav' + active + '" href="' + base + d.page + '" data-tbkey="' + k + '">'
             + (ic[d.ic] || '') + '<span class="apptb-tip">' + label + '</span></a>';
      }).join('');
      if (items) mid = '<div class="apptb-mid">' + items + '</div>';
    }

    var right = '';
    if (tbHas(cfg, 'search')) {
      right += '<form class="apptb-search" id="apptbSearchForm" autocomplete="off">' + tbIcons.search
            +  '<input type="text" id="apptbSearchInput" placeholder="' + t('ស្វែងរកអ្នកខ្ចី…','Search borrower…') + '"></form>';
    }
    if (tbHas(cfg, 'chat')) {
      right += '<button type="button" class="apptb-ico apptb-chatbtn" id="apptbChatBtn" title="' + t('ការឆាត','Chats') + '">'
            +  tbIcons.chat + '<span class="apptb-badge" id="apptbChatBadge" hidden></span></button>';
    }
    if (tbHas(cfg, 'clock')) {
      right += '<div class="apptb-clock" id="apptbClock"></div>';
    }
    if (tbHas(cfg, 'theme')) {
      right += '<button type="button" class="apptb-ico" id="apptbThemeBtn" title="' + t('ប្ដូររចនាបថ','Toggle theme') + '"></button>';
    }
    if (tbHas(cfg, 'lang')) {
      /* Shows the language in force; one tap moves to the other. Two languages
         need a toggle, not a menu. */
      var curL = getLang();
      right += '<button type="button" class="apptb-ico apptb-lang" id="apptbLangBtn" title="'
            +  (curL === 'kh' ? 'Change to English' : 'ប្ដូរទៅភាសាខ្មែរ') + '">'
            +  (curL === 'kh' ? 'ខ្មែរ' : 'EN') + '</button>';
    }
    if (tbHas(cfg, 'user')) {
      var a = null;
      try { a = JSON.parse(localStorage.getItem('appAuth') || 'null'); } catch(e) {}
      var nm  = (a && (a.name || a.u)) || 'User';
      var ini = String(nm).charAt(0).toUpperCase();
      /* The profile photo lives in `user_photo` — login.html stores it there and the
         uploader keeps it fresh; appAuth is only a fallback. */
      var pic = '';
      try { pic = localStorage.getItem('user_photo') || ''; } catch(e) {}
      if (!pic && a) pic = a.photo || a.photo_url || '';
      var av  = '<span class="apptb-user-av" data-ini="' + ini + '">'
              + (pic ? '<img src="' + pic + '" alt="">' : ini) + '</span>';
      right += '<a class="apptb-user" href="' + base + 'pages/my-profile.html">' + av
            +  '<span class="apptb-user-nm">' + nm + '</span></a>';
    }
    if (tbHas(cfg, 'logout')) {
      right += '<button type="button" class="apptb-ico apptb-ico-danger" id="apptbLogoutBtn" title="' + t('ចាកចេញ','Log out') + '">' + tbIcons.logout + '</button>';
    }
    if (right) right = '<div class="apptb-right">' + right + '</div>';

    /* On phones this bar replaces the 48px hamburger bar, so it carries the menu button. */
    var menuBtn = '<button type="button" class="apptb-menu" id="apptbMenuBtn" title="' + t('ម៉ឺនុយ','Menu') + '">'
                + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>'
                + '</button>';
    return '<div class="apptb-in">' + menuBtn + left + mid + right + '</div>';
  }
  window.appBuildTopbarHTML = buildAppTopBar;
  window.appTopbarClass = function(cfg) {
    cfg = cfg || getTbCfg();
    return 'apptb apptb-' + cfg.size + ' apptb-' + cfg.style;
  };

  var _tbScrollBound = false, _tbLastY = 0, _tbLastTgt = null, _tbClockTimer = null;

  /* Slide the bar away AND release the space it reserved, so nothing is left behind. */
  function tbTuck(bar, hide) {
    if (!bar) return;
    bar.classList.toggle('apptb-off', !!hide);
    document.body.classList.toggle('apptb-tucked', !!hide);
  }

  function applyAppTopBar() {
    var cfg = getTbCfg();
    var bar = document.getElementById('appTopBar');
    var pg  = getCurrentPage();

    if (!cfg.on || pg === 'login.html' || pg === 'user.html') {
      if (bar) bar.remove();
      tbChatClose();
      document.body.classList.remove('apptb-on', 'apptb-mob', 'apptb-tucked');
      document.body.removeAttribute('data-apptb-size');
      if (_tbClockTimer) { clearInterval(_tbClockTimer); _tbClockTimer = null; }
      return;
    }

    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'appTopBar';
      document.body.appendChild(bar);
    }
    bar.className = window.appTopbarClass(cfg);
    bar.innerHTML = buildAppTopBar(cfg);
    document.body.classList.add('apptb-on');
    document.body.classList.toggle('apptb-mob', tbHas(cfg, 'mob'));
    document.body.setAttribute('data-apptb-size', cfg.size);

    /* Theme button */
    var th = tbEl('apptbThemeBtn');
    if (th) {
      var curTh = document.documentElement.getAttribute('data-theme') || 'light';
      th.innerHTML = curTh === 'light' ? ic.moon : ic.sun;
      th.addEventListener('click', function() {
        var now = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        if (window._hlApplyTheme) window._hlApplyTheme(now, true);
        else { document.documentElement.setAttribute('data-theme', now); localStorage.setItem('theme', now); }
        th.innerHTML = now === 'light' ? ic.moon : ic.sun;
      });
    }

    /* Language button */
    var lg = tbEl('apptbLangBtn');
    if (lg) lg.addEventListener('click', function() {
      /* appSetLang redraws this very bar, so the button comes back already
         carrying the new label — nothing to set by hand here. */
      window.appSetLang(getLang() === 'kh' ? 'en' : 'kh');
    });

    /* Menu button (phones) — opens the same sidebar drawer as the hamburger bar did */
    var mBtn = tbEl('apptbMenuBtn');
    if (mBtn) mBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      document.body.classList.toggle('sidebar-open');
    });

    /* Chat dropdown */
    tbChatClose();
    var chatBtn = tbEl('apptbChatBtn');
    if (chatBtn) {
      chatBtn.addEventListener('click', function(e) { e.stopPropagation(); tbChatOpen(); });
      tbChatPaintBadge();
    }

    /* Avatar photo → fall back to the initial if the image fails to load */
    var avImg = bar.querySelector('.apptb-user-av img');
    if (avImg) avImg.addEventListener('error', function() {
      var sp = avImg.parentElement;
      if (sp) sp.textContent = sp.getAttribute('data-ini') || '?';
    });

    /* Logout */
    var lo = tbEl('apptbLogoutBtn');
    if (lo) lo.addEventListener('click', function() { showLogoutModal(); });

    /* Search → Loan List filtered by ?q= */
    var sf = tbEl('apptbSearchForm');
    if (sf) sf.addEventListener('submit', function(e) {
      e.preventDefault();
      var el = tbEl('apptbSearchInput');
      var v  = (el && el.value ? el.value : '').trim();
      if (!v) return;
      location.href = getBase() + 'pages/loan-list.html?q=' + encodeURIComponent(v);
    });

    /* Clock */
    if (_tbClockTimer) { clearInterval(_tbClockTimer); _tbClockTimer = null; }
    if (document.getElementById('apptbClock')) {
      var paint = function() {
        var el = document.getElementById('apptbClock');
        if (!el) { clearInterval(_tbClockTimer); _tbClockTimer = null; return; }
        var d = new Date();
        var hh = d.getHours(), mm = String(d.getMinutes());
        if (mm.length < 2) mm = '0' + mm;
        var ap = hh >= 12 ? 'PM' : 'AM';
        var h12 = hh % 12 || 12;
        el.innerHTML = '<b>' + h12 + ':' + mm + '</b> ' + ap
                     + ' · ' + d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      };
      paint();
      _tbClockTimer = setInterval(paint, 20000);
    }

    /* Auto-hide while scrolling down.
       Most pages here scroll an inner panel (#stWrap, .lr-tbl-wrap, …) rather than the window,
       so listen in the capture phase — `scroll` does not bubble — and accept any tall scroller
       outside the sidebar. */
    if (!_tbScrollBound) {
      _tbScrollBound = true;
      document.addEventListener('scroll', function(e) {
        var b = document.getElementById('appTopBar');
        if (!b) return;
        if (getTbCfg().mode !== 'auto') { tbTuck(b, false); return; }

        var tgt = e.target, y;
        if (!tgt || tgt === document || tgt === document.documentElement || tgt === document.body) {
          tgt = null;
          y = window.scrollY || document.documentElement.scrollTop || 0;
        } else {
          if (tgt.clientHeight < 240) return;                    /* small list / dropdown */
          if (tgt.closest && tgt.closest('.sidebar, #appTopBar')) return;
          y = tgt.scrollTop;
        }
        if (tgt !== _tbLastTgt) { _tbLastTgt = tgt; _tbLastY = y; return; }

        if (y > _tbLastY + 6 && y > 80) tbTuck(b, true);
        else if (y < _tbLastY - 6)      tbTuck(b, false);
        _tbLastY = y;
      }, { passive: true, capture: true });
    }
    if (cfg.mode !== 'auto') tbTuck(bar, false);
  }
  window.appApplyTopbar = applyAppTopBar;

  /* ══════════════════════════════════════════════════════════════
     LEFT NAVIGATION (sidebar) — configurable from Settings › App Config
     Shares the page table with the top bar (TB_PAGES).
     ══════════════════════════════════════════════════════════════ */

  var SB_MODULES = ['brand','status','label','portal','collapse','tips','mob'];
  window.appSbModules = SB_MODULES;

  var SB_DEFAULT = {
    on:    1,
    width: 'md',                     /* sm 200 | md 240 | lg 288 */
    mode:  'full',                   /* full | icons */
    style: 'solid',                  /* solid | glass | accent */
    show:  ['brand','status','label','portal','collapse','tips'],
    links: ['dash','cust','add','loans','rpt','rep','sch','jr','fb','team','ccr','act','prof','set']
  };
  window.appSbDefault = SB_DEFAULT;

  /* Settings must stay reachable for an Admin, so it is never dropped from the menu. */
  var SB_LOCKED = ['set'];
  window.appSbLocked = SB_LOCKED;

  function sbNorm(raw) {
    var c = {};
    raw = raw || {};
    c.on    = (raw.on === 0 || raw.on === '0' || raw.on === false) ? 0 : 1;
    c.width = ['sm','md','lg'].indexOf(raw.width) !== -1 ? raw.width : 'md';
    c.mode  = (raw.mode === 'icons') ? 'icons' : 'full';
    c.style = ['solid','glass','accent'].indexOf(raw.style) !== -1 ? raw.style : 'solid';
    function list(v, fallback, valid) {
      if (v === '-' || v === '') return [];
      var a = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',') : null);
      if (!a) return fallback.slice();
      return a.map(function(x){ return String(x).trim(); })
              .filter(function(x){ return valid.indexOf(x) !== -1; });
    }
    c.show  = list(raw.show,  SB_DEFAULT.show,  SB_MODULES);
    c.links = list(raw.links, SB_DEFAULT.links, Object.keys(TB_PAGES));
    for (var i = 0; i < SB_LOCKED.length; i++) {
      if (c.links.indexOf(SB_LOCKED[i]) === -1) c.links.push(SB_LOCKED[i]);
    }
    return c;
  }
  window.appSbNormalize = sbNorm;

  function getSbCfg() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem('appSidebar') || 'null'); } catch(e) {}
    return sbNorm(raw || SB_DEFAULT);
  }
  window.appGetSidebar = getSbCfg;
  window.appSetSidebar = function(c) {
    try { localStorage.setItem('appSidebar', JSON.stringify(sbNorm(c))); } catch(e) {}
  };

  function sbHas(cfg, m) { return cfg.show.indexOf(m) !== -1; }

  /* Per-user collapse, only offered when the config allows it */
  function sbUserCollapsed() {
    return localStorage.getItem('sb_collapsed') === '1';
  }

  /* Phones: with the rail option on, the sidebar stays on screen as an icon rail
     instead of hiding behind the hamburger drawer. */
  var _sbPhoneMq = window.matchMedia('(max-width: 979px)');
  function sbPhoneRail(cfg) { return sbHas(cfg, 'mob') && _sbPhoneMq.matches; }

  function sbEffectiveIcons(cfg) {
    if (cfg.mode === 'icons') return true;
    if (sbPhoneRail(cfg)) return true;
    return sbHas(cfg, 'collapse') && sbUserCollapsed();
  }

  function applySidebarCfg() {
    var cfg = getSbCfg();
    var sb  = document.querySelector('.sidebar');
    var b   = document.body;

    b.classList.toggle('sbcfg-off', !cfg.on);
    b.classList.toggle('sbcfg-mobrail', !!cfg.on && sbHas(cfg, 'mob'));
    b.classList.toggle('sbcfg-collapsible', !!cfg.on && sbHas(cfg, 'collapse') && cfg.mode !== 'icons');
    b.classList.toggle('sbcfg-notips', !sbHas(cfg, 'tips'));
    b.setAttribute('data-sbw', cfg.width);

    if (sb) {
      sb.classList.remove('sbs-solid', 'sbs-glass', 'sbs-accent');
      sb.classList.add('sbs-' + cfg.style);
    }

    var icons = !!cfg.on && sbEffectiveIcons(cfg);
    if (sb) sb.classList.toggle('sb-collapsed', icons);
    b.classList.toggle('sb-collapsed', icons);

    /* Floating opener while the sidebar is hidden — never leave the menu unreachable */
    var fab = document.getElementById('sbFloatBtn');
    if (!cfg.on) {
      if (!fab) {
        fab = document.createElement('button');
        fab.id = 'sbFloatBtn';
        fab.className = 'sb-float-btn';
        fab.type = 'button';
        fab.title = t('បើកម៉ឺនុយ', 'Open menu');
        fab.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
        fab.addEventListener('click', function(e) {
          e.stopPropagation();
          document.body.classList.toggle('sidebar-open');
        });
        document.body.appendChild(fab);
      }
    } else if (fab) {
      fab.remove();
      b.classList.remove('sidebar-open');
    }
  }
  window.appApplySidebar = applySidebarCfg;

  /* Crossing the phone breakpoint flips the rail on or off */
  (function(){
    var reapply = function(){ if (document.querySelector('.sidebar')) applySidebarCfg(); };
    if (_sbPhoneMq.addEventListener) _sbPhoneMq.addEventListener('change', reapply);
    else if (_sbPhoneMq.addListener) _sbPhoneMq.addListener(reapply);
  })();

  /* Rebuild the sidebar markup and re-apply the config (used after a config change) */
  function rerenderSidebar() {
    var host = document.getElementById('sharedSidebar');
    if (!host) return;
    host.innerHTML = buildSidebar();
    initSidebarToggle(host);
    initThemeBtn();
    initLogoutBtn();
    applySidebarCfg();
    window.appApplyBrand && window.appApplyBrand();
  }
  window.appRerenderSidebar = rerenderSidebar;
  window.appBuildSidebarHTML = buildSidebar;
  window.appSidebarClass = function(cfg) {
    cfg = sbNorm(cfg || getSbCfg());
    return 'sidebar sbs-' + cfg.style + (cfg.mode === 'icons' ? ' sb-collapsed' : '');
  };
  window.appSidebarWidth = function(cfg) {
    cfg = sbNorm(cfg || getSbCfg());
    if (cfg.mode === 'icons') return 64;
    return cfg.width === 'sm' ? 200 : cfg.width === 'lg' ? 288 : 240;
  };

  function renderLayout() {
    var sidebar = document.getElementById('sharedSidebar');
    var header  = document.getElementById('sharedHeader');
    if (sidebar) {
      sidebar.innerHTML = buildSidebar();
    }
    if (header) header.innerHTML = buildTopbar();
    if (sidebar) {
      initSidebarToggle(sidebar);
      initThemeBtn();
      initLogoutBtn();
    }
    /* Inject bottom nav (mobile) */
    var old = document.getElementById('sbBottomNav');
    if (old) old.remove();
    var tmp = document.createElement('div');
    tmp.innerHTML = buildBottomNav();
    document.body.appendChild(tmp.firstElementChild);

    /* Configurable app top bar + left navigation */
    applyAppTopBar();
    applySidebarCfg();
  }

  function applyLogoAnimation() {
    var logo = document.querySelector('.sb-logo-img');
    if (!logo) return;
    var anims = [
      'logo-spin          5s  linear      infinite',
      'logo-spin          8s  linear      infinite',
      'logo-spin-glow     6s  ease-in-out infinite',
      'logo-spin-float    5s  ease-in-out infinite',
      'logo-spin-pulse    4s  ease-in-out infinite',
      'logo-spin-elastic  3s  ease-in-out infinite',
      'logo-spin-reverse  7s  linear      infinite',
      'logo-spin-disco    4s  linear      infinite',
      'logo-spin-tilt     6s  ease-in-out infinite',
    ];
    logo.style.animation = anims[Math.floor(Math.random() * anims.length)];
  }

  function applyUserCardAnimation() {
    var el = document.getElementById('sbUserName');
    if (!el) return;
    var _a = null;
    try { _a = JSON.parse(localStorage.getItem('appAuth')||'null'); } catch(e){}
    if (!_a || !_a.u) return;

    var texts  = [_a.name || _a.u, getBrand().name || 'CAMBO'];
    var colors = ['#a78bfa', '#06b6d4']; /* purple for user, cyan for brand */
    var idx    = 0;
    var style  = Math.floor(Math.random() * 9); /* pick ONE style for the whole session */

    if (!document.getElementById('hlUCAnim')) {
      var s = document.createElement('style');
      s.id = 'hlUCAnim';
      s.textContent =
        '@keyframes hlFdO{from{opacity:1}to{opacity:0}}' +
        '@keyframes hlFdI{from{opacity:0}to{opacity:1}}' +
        '@keyframes hlSuO{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-10px)}}' +
        '@keyframes hlSuI{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}' +
        '@keyframes hlSdO{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(10px)}}' +
        '@keyframes hlSdI{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}' +
        '@keyframes hlSlO{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(-12px)}}' +
        '@keyframes hlSlI{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}' +
        '@keyframes hlZmO{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(.6)}}' +
        '@keyframes hlZmI{from{opacity:0;transform:scale(1.35)}to{opacity:1;transform:scale(1)}}' +
        '@keyframes hlBlO{from{filter:blur(0);opacity:1}to{filter:blur(7px);opacity:0}}' +
        '@keyframes hlBlI{from{filter:blur(7px);opacity:0}to{filter:blur(0);opacity:1}}' +
        '@keyframes hlFlO{from{opacity:1;transform:rotateX(0) scaleY(1)}to{opacity:0;transform:rotateX(75deg) scaleY(.4)}}' +
        '@keyframes hlFlI{from{opacity:0;transform:rotateX(-75deg) scaleY(.4)}to{opacity:1;transform:rotateX(0) scaleY(1)}}' +
        '@keyframes hlGlt{0%,100%{clip-path:none;transform:none}10%{clip-path:polygon(0 20%,100% 20%,100% 21%,0 21%);transform:translate(-3px,0)}30%{clip-path:polygon(0 60%,100% 60%,100% 62%,0 62%);transform:translate(3px,0)}50%{clip-path:none;transform:translate(-2px,1px)}70%{clip-path:polygon(0 80%,100% 80%,100% 81%,0 81%);transform:translate(2px,-1px)}90%{clip-path:none;transform:none}}';
      document.head.appendChild(s);
    }

    /* CSS-based transition pairs [exitAnim, enterAnim] */
    var pairs = [
      ['hlFdO .28s ease forwards', 'hlFdI .35s ease forwards'],  /* 0 Fade        */
      ['hlSuO .28s ease forwards', 'hlSuI .35s ease forwards'],  /* 1 Slide Up    */
      ['hlSdO .28s ease forwards', 'hlSdI .35s ease forwards'],  /* 2 Slide Down  */
      ['hlSlO .28s ease forwards', 'hlSlI .35s ease forwards'],  /* 3 Slide Left  */
      ['hlZmO .28s ease forwards', 'hlZmI .35s ease forwards'],  /* 4 Zoom        */
      ['hlBlO .28s ease forwards', 'hlBlI .35s ease forwards'],  /* 5 Blur Fade   */
      ['hlFlO .28s ease forwards', 'hlFlI .35s ease forwards'],  /* 6 Flip 3D     */
      null, /* 7 Typewriter — handled separately */
      null, /* 8 Glitch     — handled separately */
    ];

    function resetEl(e) {
      e.style.cssText = 'display:inline-block';
    }

    function applyColor(e, i) {
      e.style.color = colors[i];
    }

    function tick() {
      idx = 1 - idx;
      var newText  = texts[idx];
      var newColor = colors[idx];

      if (style === 7) {
        /* Typewriter: erase → retype */
        var cur = el.textContent;
        var er  = setInterval(function() {
          if (cur.length > 0) { cur = cur.slice(0,-1); el.textContent = cur; }
          else {
            clearInterval(er);
            el.style.borderRight = '2px solid ' + newColor;
            el.style.color = newColor;
            var i = 0, ty = setInterval(function() {
              if (i < newText.length) { el.textContent += newText[i++]; }
              else { clearInterval(ty); el.style.borderRight = ''; setTimeout(tick, 2800); }
            }, 80);
          }
        }, 55);
        return;
      }

      if (style === 8) {
        /* Glitch flash */
        el.style.animation = 'hlGlt .25s steps(1) forwards';
        el.style.color = '#ef4444';
        setTimeout(function() {
          resetEl(el);
          el.textContent = newText;
          el.style.color = '#64748b';
          el.style.animation = 'hlGlt .2s steps(1) forwards';
          setTimeout(function() {
            resetEl(el);
            el.style.color = newColor;
            el.style.animation = 'hlFdI .3s ease forwards';
            setTimeout(function() { el.style.animation = ''; setTimeout(tick, 2800); }, 300);
          }, 200);
        }, 250);
        return;
      }

      /* CSS animation transition */
      el.style.animation = pairs[style][0];
      setTimeout(function() {
        resetEl(el);
        el.textContent = newText;
        el.style.color  = newColor;
        el.style.animation = pairs[style][1];
        setTimeout(function() { el.style.animation = ''; setTimeout(tick, 2800); }, 350);
      }, 280);
    }

    /* Initial display */
    el.style.display = 'inline-block';
    el.textContent   = texts[0];
    el.style.color   = colors[0];
    setTimeout(tick, 2800);
  }

  /* ══════════════════════════════════════════════════════════════
     SESSION WATCHDOG
     An account may only be signed in on a limited number of devices. When a
     newer device pushes this one out, the server marks it revoked and this
     check sends it back to the login screen. Also catches an account that
     was disabled while it was open.
     ══════════════════════════════════════════════════════════════ */
  async function checkSession() {
    var a = null;
    try { a = JSON.parse(localStorage.getItem('appAuth') || 'null'); } catch(e) {}
    if (!a || !a.u) return;
    if (typeof CamboAPI === 'undefined' || !window.CamboDevice) return;
    var r;
    try {
      r = await CamboAPI.post({ action: 'session_check', u: a.u, device_id: CamboDevice.id() });
    } catch(e) { return; }                    /* offline — never sign out on a network blip */
    if (r && r.ok) {
      /* the same answer says whether this account is being asked for a position */
      var wasOn = geoRequired();
      geoSetRequired(Number(r.geo) === 1);
      if (!wasOn && Number(r.geo) === 1) geoStart();
    }
    if (!r || !r.ok || r.valid !== false) return;

    try { localStorage.removeItem('appAuth'); localStorage.removeItem('user_photo'); } catch(e) {}
    var why = r.reason === 'inactive'
      ? t('គណនីរបស់អ្នកត្រូវបានបិទ។', 'Your account has been disabled.')
      : t('អ្នកបានចាកចេញ ដោយសារមានការចូលប្រើពីឧបករណ៍ថ្មី។',
          'You were signed out because this account signed in on another device.');
    try { sessionStorage.setItem('signout_reason', why); } catch(e) {}
    location.replace(getBase() + 'login.html?bumped=1');
  }

  /* ══════════════════════════════════════════════════════════════
     PRECISE LOCATION
     The IP address only ever places the connection, which is a district at
     best. The device itself knows better, but only the person sitting at it
     can hand that over: the browser will not give a position to a page the
     user has not allowed, and they can withdraw it at any time from the site
     settings. That consent is the whole mechanism — there is no way around
     it, and this code does not try.

     So: never prompt on our own. Ask silently only where permission already
     stands, and leave the asking to the button on My Profile.
     ══════════════════════════════════════════════════════════════ */
  var GEO_KEY   = 'geo_share';       /* the person's own choice, per device */
  var GEO_EVERY = 5 * 60 * 1000;     /* a fix costs battery; five minutes is plenty */
  var _geoTimer = null;

  function geoWanted() {
    try { return localStorage.getItem(GEO_KEY) === '1'; } catch(e) { return false; }
  }

  function geoSetWanted(on) {
    try { on ? localStorage.setItem(GEO_KEY, '1') : localStorage.removeItem(GEO_KEY); } catch(e) {}
  }

  /* granted | prompt | denied | unknown */
  async function geoPermission() {
    if (!navigator.geolocation) return 'unsupported';
    try {
      if (!navigator.permissions || !navigator.permissions.query) return 'unknown';
      var st = await navigator.permissions.query({ name: 'geolocation' });
      return st.state;
    } catch(e) { return 'unknown'; }
  }

  function geoRead(highAccuracy) {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) { reject(new Error('unsupported')); return; }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: !!highAccuracy,
        timeout: 15000,
        maximumAge: 60000
      });
    });
  }

  async function geoSend(pos) {
    if (typeof CamboAPI === 'undefined' || !window.CamboDevice) return false;
    var c = pos && pos.coords;
    if (!c) return false;
    try {
      var r = await CamboAPI.post({
        action: 'session_geo',
        device_id: CamboDevice.id(),
        lat: c.latitude, lon: c.longitude, accuracy: c.accuracy
      });
      return !!(r && r.ok);
    } catch(e) { return false; }
  }

  /* Called by the button on My Profile. This is the one path allowed to make the
     browser ask, because a person just clicked to make it happen. */
  async function appShareLocation() {
    var pos;
    try { pos = await geoRead(true); }
    catch(e) {
      geoSetWanted(false);
      return { ok:false, reason: (e && e.code === 1) ? 'denied'
                              : (e && e.code === 3) ? 'timeout' : 'unavailable' };
    }
    geoSetWanted(true);
    var sent = await geoSend(pos);
    geoStart();
    return {
      ok: sent, reason: sent ? '' : 'save_failed',
      lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy
    };
  }

  async function appStopSharingLocation() {
    geoSetWanted(false);
    if (_geoTimer) { clearInterval(_geoTimer); _geoTimer = null; }
    if (typeof CamboAPI === 'undefined' || !window.CamboDevice) return { ok:false };
    try {
      var r = await CamboAPI.post({ action: 'session_geo_clear', device_id: CamboDevice.id() });
      return { ok: !!(r && r.ok) };
    } catch(e) { return { ok:false }; }
  }

  /* Set per account by an Admin and carried on the session heartbeat, so this
     never costs a request of its own and follows the switch within 30 seconds. */
  var GEO_REQ_KEY = 'geo_required';
  function geoRequired() {
    try { return localStorage.getItem(GEO_REQ_KEY) === '1'; } catch(e) { return false; }
  }
  function geoSetRequired(on) {
    try { on ? localStorage.setItem(GEO_REQ_KEY, '1') : localStorage.removeItem(GEO_REQ_KEY); } catch(e) {}
  }

  /* Asks for a position when the organisation has turned this on. The browser
     shows its own prompt the first time and remembers the answer, so this is one
     dialog per device — never a nag. A refusal is final and simply ends here. */
  async function geoTick() {
    var required = geoRequired();
    if (!required && !geoWanted()) return;
    var st = await geoPermission();
    if (st === 'denied' || st === 'unsupported') { geoSetWanted(false); return; }
    if (st === 'prompt' && !required) return;   /* never prompt off our own bat */
    try { geoSend(await geoRead(true)); } catch(e) {}
  }

  function geoStart() {
    if (_geoTimer) return;
    geoTick();
    _geoTimer = setInterval(geoTick, GEO_EVERY);
  }

  window.appShareLocation      = appShareLocation;
  window.appStopSharingLocation = appStopSharingLocation;
  window.appGeoPermission      = geoPermission;
  window.appGeoWanted          = geoWanted;

  window.appCheckSession = checkSession;

  document.addEventListener('DOMContentLoaded', function () {
    renderLayout();
    /* Apply cached brand immediately (no flash) */
    window.appApplyBrand && window.appApplyBrand();
    applyLogoAnimation();
    applyUserCardAnimation();
    /* Inject global chat widget on every page except login */
    var _pg = (window.location.pathname.split('/').pop()||'index.html');
    if (_pg !== 'login.html' && !document.getElementById('gc-box')) {
      var _s = document.createElement('script');
      _s.src = getBase() + 'assets/js/chat-global.js?v=8';
      document.head.appendChild(_s);
    }
    /* Sync role permissions and page access from DB (non-blocking) */
    if (_pg !== 'login.html') setTimeout(function(){ window.appSyncPerms && window.appSyncPerms(); window.appSyncPageAccess && window.appSyncPageAccess(); window.appSyncBrand && window.appSyncBrand(); }, 500);
    /* Watch for this device being pushed out by a newer sign-in */
    if (_pg !== 'login.html' && _pg !== 'user.html') {
      setTimeout(checkSession, 1500);
      setInterval(checkSession, 30000);
      /* does nothing unless an Admin turned it on for the organisation */
      setTimeout(geoStart, 3000);
    }
  });
})();
