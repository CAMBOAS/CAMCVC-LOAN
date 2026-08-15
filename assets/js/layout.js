/* HELEN LOAN — Shared Layout (Sidebar + Topbar) */
(function () {
  'use strict';

  function getLang() { return localStorage.getItem('helen_lang') || 'en'; }
  function setLang(l) { localStorage.setItem('helen_lang', l); }
  function t(kh, en) { return getLang() === 'en' ? en : kh; }

  function getPageMeta() {
    return {
      'index.html':     { title: t('Dashboard','Dashboard'),   subtitle: t('ការវិភាគ និងទិដ្ឋភាពទូទៅ','Analytics & overview') },
      'loan-list.html':       { title: t('បញ្ជីកម្ចី','Loan List'),       subtitle: t('តារាង និងការគ្រប់គ្រងអ្នកខ្ចីសរុប','Borrower list and full management') },
      'borrower-profile.html':{ title: t('Profile អ្នកខ្ចី','Borrower Profile'), subtitle: t('ព័ត៌មានលម្អិតអ្នកខ្ចី','Full borrower details and loan history') },
      'activity-log.html':  { title: t('Activity Log','Activity Log'), subtitle: t('កំណត់ហេតុសកម្មភាព','All system events and actions') },
      'fb-id-finder.html': { title: t('FB ID Finder','FB ID Finder'), subtitle: t('បំប្លែង Facebook URL ទៅជា Numeric ID','Convert Facebook URL to Numeric ID') },
      'settings.html':  { title: t('Settings','Settings'), subtitle: t('Admin ប៉ុណ្ណោះ','Admin only') },
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
          ${link('pages/reports.html', ic.report, t('Reports','Reports'))}
          ${link('pages/activity-log.html', ic.activity, t('Activity Log','Activity Log'))}
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
          <button class="sb-ctrl-btn sb-logout-btn" id="sbLogoutBtn" title="Logout">
            <span class="sb-theme-icon">${ic.logout}</span>
            <span class="sb-ctrl-label">Logout</span>
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
            if (_d <= 0)     _exp = '<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:5px;background:rgba(239,68,68,.18);color:#ef4444;margin-left:4px">Expired</span>';
            else if (_d <= 3)_exp = '<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:5px;background:rgba(245,158,11,.18);color:#f59e0b;margin-left:4px">'+_d+' days</span>';
            else             _exp = '<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:5px;background:rgba(16,185,129,.13);color:#10b981;margin-left:4px">'+_d+' days</span>';
          }
          var _onclick = _a ? ' style="cursor:pointer" onclick="window._hlShowProfileModal&&window._hlShowProfileModal()" title="Account Info"' : '';
          var _photo = localStorage.getItem('helen_user_photo') || '';
          var _avatarInner = _photo
            ? '<img src="'+_photo+'" alt="photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
            : '<img src="'+base+'images/logo/Helen-Loan.png" alt="Helen Loan" onerror="this.style.display=\'none\';this.parentNode.textContent=\'HL\'">';
          return '<div class="sb-user-card" id="sbUserRow"'+_onclick+'>'
            +'<div class="sb-user-avatar sb-user-avatar-img" id="sbUserAvatar">'
            +_avatarInner
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
      + '<div style="font-size:16px;font-weight:800;color:'+textPri+';margin-bottom:6px;font-family:inherit">Sign Out?</div>'
      + '<div style="font-size:12.5px;color:'+textSec+';margin-bottom:22px;line-height:1.6">Are you sure you want to<br>sign out of HELEN LOAN?</div>'
      + '<div style="display:flex;gap:10px">'
      + '<button id="hlLogoutCancel" style="flex:1;padding:11px;border-radius:11px;border:1.5px solid '+btnBdr+';background:transparent;color:'+btnClr+';font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:.15s">Cancel</button>'
      + '<button id="hlLogoutOk" style="flex:1;padding:11px;border-radius:11px;border:none;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 14px rgba(239,68,68,.35)">Sign Out</button>'
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

  function _updateSidebarAvatar(url) {
    var el = document.getElementById('sbUserAvatar');
    if (!el) return;
    if (url) {
      el.innerHTML = '<img src="'+url+'" alt="photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    } else {
      var base = getBase();
      el.innerHTML = '<img src="'+base+'images/logo/Helen-Loan.png" alt="Helen Loan" onerror="this.style.display=\'none\';this.parentNode.textContent=\'HL\'">';
    }
  }

  function showProfileModal() {
    var existing = document.getElementById('hlProfileModal');
    if (existing) existing.remove();

    var _a = null;
    try { _a = JSON.parse(localStorage.getItem('helenAuth')||'null'); } catch(e){}
    if (!_a) return;

    var isDark  = document.documentElement.getAttribute('data-theme') !== 'light';
    var cardBg  = isDark ? 'rgba(15,23,42,.97)' : 'rgba(255,255,255,.98)';
    var textPri = isDark ? '#f1f5f9' : '#0f172a';
    var textSec = isDark ? '#94a3b8' : '#64748b';
    var inputBg = isDark ? 'rgba(30,41,59,.8)' : 'rgba(248,250,252,1)';
    var inputBdr = isDark ? 'rgba(148,163,184,.2)' : 'rgba(203,213,225,1)';
    var divBdr  = isDark ? 'rgba(148,163,184,.12)' : 'rgba(203,213,225,.6)';

    var photoUrl = localStorage.getItem('helen_user_photo') || '';
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
      + '<button id="hlProfSave" style="width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 14px rgba(124,58,237,.35)">Save</button>'
      + '</div>';

    document.body.appendChild(m);

    document.getElementById('hlProfClose').onclick = function() { m.remove(); };
    m.addEventListener('click', function(e) { if (e.target === m) m.remove(); });

    /* Avatar circle click → preview current photo */
    document.getElementById('hlProfAvatarCircle').addEventListener('click', function() {
      var url = localStorage.getItem('helen_user_photo') || '';
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
          try { auth = JSON.parse(localStorage.getItem('helenAuth')||'null'); } catch(ee){}
          var r = await api.post({ action:'helen_upload_photo', auth:auth, data: ev.target.result });
          if (!r || !r.ok) { statusEl.textContent = 'Failed: '+(r&&r.message||'Error'); return; }
          var r2 = await api.post({ action:'helen_user_self_update', auth:auth, type:'photo', photo_url: r.url });
          if (!r2 || !r2.ok) { statusEl.textContent = 'Failed: '+(r2&&r2.message||'Error'); return; }
          localStorage.setItem('helen_user_photo', r.url);
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
        try { return JSON.parse(localStorage.getItem('helenAuth')||'null'); } catch(ee) { return null; }
      }

      try {
        if (nameChanged || userChanged) {
          var r = await api.post({
            action:'helen_user_self_update', auth: freshAuth(),
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
          localStorage.setItem('helenAuth', JSON.stringify(auth2));
          var nameEl = document.getElementById('sbUserName');
          if (nameEl) nameEl.textContent = auth2.name || auth2.u;
        }

        if (pinChanged) {
          var r2 = await api.post({
            action:'helen_user_self_update', auth: freshAuth(),
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
          localStorage.setItem('helenAuth', JSON.stringify(auth3));
        }

        btn.style.cssText = 'width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-size:14px;font-weight:700;font-family:inherit;cursor:default';
        btn.textContent = '✓ Done';
        setTimeout(function() { m.remove(); }, 900);

      } catch(err) {
        errEl.textContent = 'Error: ' + err.message;
        btn.disabled = false; btn.textContent = 'Save';
      }
    };
  }
  window._hlShowProfileModal = showProfileModal;

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
