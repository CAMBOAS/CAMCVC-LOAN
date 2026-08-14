/* HELEN LOAN — Shared Layout (Sidebar + Topbar) */
(function () {
  'use strict';

  function getLang() { return localStorage.getItem('helen_lang') || 'kh'; }
  function setLang(l) { localStorage.setItem('helen_lang', l); }
  function t(kh, en) { return getLang() === 'en' ? en : kh; }

  function getPageMeta() {
    return {
      'index.html':     { title: t('Dashboard','Dashboard'),   subtitle: t('ការវិភាគ និងទិដ្ឋភាពទូទៅ','Analytics & overview') },
      'loan-list.html':    { title: t('បញ្ជីកម្ចី','Loan List'),     subtitle: t('តារាង និងការគ្រប់គ្រងអ្នកខ្ចីសរុប','Borrower list and full management') },
      'fb-id-finder.html': { title: t('FB ID Finder','FB ID Finder'), subtitle: t('បំប្លែង Facebook URL ទៅជា Numeric ID','Convert Facebook URL to Numeric ID') },
      'settings.html':  { title: t('Settings','Settings'), subtitle: t('Admin ប៉ុណ្ណោះ','Admin only') },
      'login.html':     { title: t('ចូលប្រើ','Login'),        subtitle: '' },
    };
  }

  const ic = {
    dashboard: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
    loanlist: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    logout:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    moon:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    sun:      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    globe:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    bell:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    facebook: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    users:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
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
    try { var a = JSON.parse(localStorage.getItem('helenAuth')||'null'); return a ? (a.role||'') : ''; } catch(e) { return ''; }
  }

  function buildSidebar() {
    const cur  = getCurrentPage();
    const base = getBase();
    const role = getAuthRole();
    function link(page, icon, label, danger) {
      const pageName = page.split('/').pop();
      const active   = cur === pageName ? 'sb-active' : '';
      const cls      = danger ? 'sb-link sb-link-danger' : 'sb-link';
      const onclick  = danger ? ' onclick="event.preventDefault();handleLogout();"' : '';
      return `<li><a href="${base}${page}" class="${cls} ${active}" data-page="${pageName}" data-tooltip="${label}"${onclick}><span class="sb-icon">${icon}</span><span class="sb-label">${label}</span><span class="sb-active-dot"></span></a></li>`;
    }

    return `
      <div class="sb-head">
        <div class="sb-logo-wrap">
          <img class="sb-logo-img" src="${base}images/logo/LOGO.png" alt="CAMBO" onerror="this.style.display='none'">
        </div>
        <div class="sb-brand-text">
          <div class="sb-brand-name">CAMBO</div>
          <div class="sb-brand-sub">Loan Management</div>
        </div>
        <button class="sb-collapse-btn" id="sbToggleBtn" title="Toggle sidebar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      </div>

      <div class="sb-status-strip">
        <span class="sb-live-dot"></span>
        <span class="sb-live-txt">${t('ប្រព័ន្ធដំណើរការ','System Online')}</span>
      </div>

      <div class="sb-divider"></div>

      <nav class="sb-nav">
        <div class="sb-section-label">${t('ម៉ឺនុយចំបង','Main Menu')}</div>
        <ul class="sb-list">
          ${link('index.html', ic.dashboard, t('Dashboard','Dashboard'))}
          ${link('pages/loan-list.html', ic.loanlist, t('បញ្ជីកម្ចី','Loan List'))}
          ${link('pages/fb-id-finder.html', ic.facebook, t('FB ID Finder','FB ID Finder'))}
          ${role === 'Admin' ? link('pages/settings.html', ic.settings, t('Settings','Settings')) : ''}
        </ul>
      </nav>

      <div class="sb-grow"></div>

      <div class="sb-footer">
        <div class="sb-ctrl-row">
          <button class="sb-ctrl-btn sb-theme-btn" id="sbThemeBtn" title="Toggle Theme">
            <span class="sb-theme-icon">${ic.moon}</span>
            <span class="sb-ctrl-label">${t('ម៉ូត','Theme')}</span>
          </button>
          <button class="sb-ctrl-btn sb-logout-btn" id="sbLogoutBtn" title="ចាកចេញ">
            <span class="sb-theme-icon">${ic.logout}</span>
            <span class="sb-ctrl-label">ចេញ</span>
          </button>
        </div>
        ${(function(){
          var _a = null;
          try { _a = JSON.parse(localStorage.getItem('helenAuth')||'null'); } catch(e){}
          var _name = _a ? (_a.name || _a.u || 'HELEN LOAN') : 'HELEN LOAN';
          var _role = _a ? (_a.role || 'User') : 'Administrator';
          var _exp = '';
          var _expMs = _a && _a.expDate
            ? new Date(_a.expDate+'T23:59:59').getTime()
            : (_a && _a.exp ? _a.exp : 0);
          if (_a && _expMs) {
            var _d = Math.ceil((_expMs - Date.now()) / 86400000);
            if (_d <= 0)     _exp = '<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:5px;background:rgba(239,68,68,.18);color:#ef4444;margin-left:4px">ផុតកំណត់</span>';
            else if (_d <= 3)_exp = '<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:5px;background:rgba(245,158,11,.18);color:#f59e0b;margin-left:4px">'+_d+' ថ្ងៃ</span>';
            else             _exp = '<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:5px;background:rgba(16,185,129,.13);color:#10b981;margin-left:4px">'+_d+' ថ្ងៃ</span>';
          }
          var _onclick = _a ? ' style="cursor:pointer" onclick="window._hlShowLogoutModal&&window._hlShowLogoutModal()" title="ចាកចេញ"' : '';
          return '<div class="sb-user-card" id="sbUserRow"'+_onclick+'>'
            +'<div class="sb-user-avatar sb-user-avatar-img" id="sbUserAvatar">'
            +'<img src="'+base+'images/logo/Helen-Loan.png" alt="Helen Loan" onerror="this.style.display=\'none\';this.parentNode.textContent=\'HL\'">'
            +'</div>'
            +'<div class="sb-user-info">'
            +'<div class="sb-user-name" id="sbUserName">'+_name+'</div>'
            +'<div class="sb-user-role" id="sbUserRole"><span class="sb-online-dot"></span>'+_role+_exp+'</div>'
            +'</div>'
            +'</div>';
        })()}
      </div>`;
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
      ${bnItem('index.html',              ic.dashboard, t('Dashboard','Dashboard'))}
      ${bnItem('pages/loan-list.html',    ic.loanlist,  t('កម្ចី','Loans'))}
      ${bnItem('pages/fb-id-finder.html', ic.facebook,  t('FB ID','FB ID'))}
      ${role === 'Admin' ? bnItem('pages/settings.html', ic.settings, t('Settings','Settings')) : ''}
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
      + '<div style="font-size:16px;font-weight:800;color:'+textPri+';margin-bottom:6px;font-family:inherit">ចាកចេញ?</div>'
      + '<div style="font-size:12.5px;color:'+textSec+';margin-bottom:22px;line-height:1.6">អ្នកពិតជាចង់ចាកចេញ<br>ពីប្រព័ន្ធ HELEN LOAN?</div>'
      + '<div style="display:flex;gap:10px">'
      + '<button id="hlLogoutCancel" style="flex:1;padding:11px;border-radius:11px;border:1.5px solid '+btnBdr+';background:transparent;color:'+btnClr+';font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:.15s">បោះបង់</button>'
      + '<button id="hlLogoutOk" style="flex:1;padding:11px;border-radius:11px;border:none;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 14px rgba(239,68,68,.35)">ចាកចេញ</button>'
      + '</div>'
      + '</div>';
    document.body.appendChild(m);
    document.getElementById('hlLogoutCancel').onclick = function() { m.remove(); };
    m.addEventListener('click', function(e) { if (e.target === m) m.remove(); });
    document.getElementById('hlLogoutOk').onclick = function() {
      m.remove();
      if (window.HelenAuth) window.HelenAuth.logout();
      else location.href = getBase() + 'pages/login.html';
    };
  }
  window._hlShowLogoutModal = showLogoutModal;

  function initSidebarToggle(sidebar) {
    var btn = document.getElementById('sbToggleBtn');
    var sb  = document.querySelector('.sidebar');
    var dashboard = document.querySelector('.dashboard');

    /* Restore collapsed state */
    var collapsed = localStorage.getItem('helen_sb_collapsed') === '1';
    if (collapsed && sb) { sb.classList.add('sb-collapsed'); document.body.classList.add('sb-collapsed'); }

    /* Toggle collapse on click */
    if (btn) btn.addEventListener('click', function() {
      if (!sb) return;
      var c = sb.classList.toggle('sb-collapsed');
      document.body.classList.toggle('sb-collapsed', c);
      localStorage.setItem('helen_sb_collapsed', c ? '1' : '0');
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
    function applyTheme(t) {
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('theme', t);
      var icon = document.querySelector('#sbThemeBtn .sb-theme-icon');
      var tBtn = document.getElementById('topbarThemeBtn');
      if (icon) icon.innerHTML = t === 'light' ? ic.moon : ic.sun;
      if (tBtn) tBtn.innerHTML = t === 'light' ? ic.moon : ic.sun;
    }
    var cur = localStorage.getItem('theme') || 'light';
    applyTheme(cur);
    var btn = document.getElementById('sbThemeBtn');
    if (btn) btn.addEventListener('click', function() {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
    });
  }

  function initLogoutBtn() {
    var btn = document.getElementById('sbLogoutBtn');
    if (!btn) return;
    btn.addEventListener('click', function() { showLogoutModal(); });
  }

  function renderLayout() {
    var sidebar = document.getElementById('sharedSidebar');
    var header  = document.getElementById('sharedHeader');
    if (sidebar) {
      sidebar.innerHTML = buildSidebar();
      if (localStorage.getItem('helen_sb_collapsed') === '1') {
        sidebar.classList.add('sb-collapsed');
        document.body.classList.add('sb-collapsed');
      }
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
    try { _a = JSON.parse(localStorage.getItem('helenAuth')||'null'); } catch(e){}
    if (!_a || !_a.u) return;

    var texts  = [_a.name || _a.u, 'HELEN LOAN'];
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

  document.addEventListener('DOMContentLoaded', function () {
    renderLayout();
    applyLogoAnimation();
    applyUserCardAnimation();
  });
})();
