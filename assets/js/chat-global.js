/* HELEN LOAN — Global Chat Widget (auto-injected on every page via layout.js) */
(function () {
  'use strict';

  var page = (window.location.pathname.split('/').pop() || 'index.html');
  if (page === 'login.html') return;

  /* ── Auth helpers ── */
  function getMyAuth() { try { return JSON.parse(localStorage.getItem('helenAuth')||'null'); } catch(e) { return null; } }
  function getMyUsername() { var a=getMyAuth(); return a?(a.u||''):''; }

  function gcPost(body) {
    if (!navigator.onLine) return Promise.resolve({ ok:false });
    var auth=getMyAuth();
    if (!auth||!auth.u) return Promise.resolve({ ok:false });
    var full=Object.assign({}, { auth:{ u:auth.u, p:auth.p } }, body);
    return fetch('/api/helen', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(full)
    }).then(function(r){ return r.text(); })
      .then(function(t){ try{ return JSON.parse(t); }catch(e){ return {ok:false}; } })
      .catch(function(){ return {ok:false}; });
  }

  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function isOnlineDt(dtStr) {
    if (!dtStr) return false;
    try {
      var s=String(dtStr).trim().replace(' ','T');
      if (!/Z$|[+-]\d{2}:\d{2}$/.test(s)) s+='Z';
      var ms=new Date(s).getTime();
      return !isNaN(ms)&&(Date.now()-ms)<10*60*1000;
    } catch(e){ return false; }
  }

  function fmtTime(dtStr) {
    try {
      var s=String(dtStr||'').trim().replace(' ','T');
      if (!/Z$|[+-]\d{2}:\d{2}$/.test(s)) s+='Z';
      var d=new Date(s); var TZ='Asia/Phnom_Penh';
      var parts=new Intl.DateTimeFormat('en-US',{timeZone:TZ,hour12:false,hour:'2-digit',minute:'2-digit'}).formatToParts(d);
      var p={}; parts.forEach(function(x){p[x.type]=x.value;});
      var h24=parseInt(p.hour,10);
      return (h24%12||12)+':'+p.minute+(h24>=12?' PM':' AM');
    } catch(e){ return ''; }
  }

  function fmtDate(dtStr) {
    try {
      var s=String(dtStr||'').trim().replace(' ','T');
      if (!/Z$|[+-]\d{2}:\d{2}$/.test(s)) s+='Z';
      var d=new Date(s); var TZ='Asia/Phnom_Penh';
      var ppDate=new Intl.DateTimeFormat('en-CA',{timeZone:TZ}).format(d);
      var nowDate=new Intl.DateTimeFormat('en-CA',{timeZone:TZ}).format(new Date());
      var yest=new Intl.DateTimeFormat('en-CA',{timeZone:TZ}).format(new Date(Date.now()-86400000));
      if (ppDate===nowDate) return 'Today';
      if (ppDate===yest)    return 'Yesterday';
      var p=ppDate.split('-'); return p[2]+'/'+p[1]+'/'+p[0].slice(2);
    } catch(e){ return ''; }
  }

  /* ── Inject CSS ── */
  var style=document.createElement('style');
  style.textContent=[
    ':root{--gc-card:#ffffff;--gc-text:#0f172a;--gc-muted:#64748b;--gc-border:rgba(148,163,184,.2);--gc-sh:0 8px 40px rgba(0,0,0,.15)}',
    '[data-theme="dark"]{--gc-card:#1e293b;--gc-text:#f1f5f9;--gc-muted:#94a3b8;--gc-border:rgba(148,163,184,.12);--gc-sh:0 8px 40px rgba(0,0,0,.4)}',

    /* Chat box */
    '#gc-box{position:fixed;bottom:24px;right:24px;z-index:9100;width:360px;max-width:calc(100vw - 32px);',
    'height:min(560px,calc(100vh - 120px));background:var(--gc-card);border-radius:22px;',
    'border:1px solid var(--gc-border);box-shadow:var(--gc-sh);display:flex;flex-direction:column;overflow:hidden;',
    'transform:translateY(30px) scale(.95);opacity:0;transition:transform .25s,opacity .25s;pointer-events:none;}',
    '#gc-box.gc-open{transform:translateY(0) scale(1);opacity:1;pointer-events:auto;}',
    '@media(max-width:480px){#gc-box{bottom:76px;right:12px;left:12px;width:auto;}}',

    /* Header */
    '.gc-hd{display:flex;align-items:center;gap:10px;padding:14px 16px;',
    'background:linear-gradient(135deg,rgba(124,92,255,.15),rgba(99,102,241,.06));',
    'border-bottom:1px solid var(--gc-border);flex-shrink:0;}',
    '.gc-hd-av-wrap{position:relative;flex-shrink:0;}',
    '.gc-hd-av{width:42px;height:42px;border-radius:50%;overflow:hidden;border:2.5px solid rgba(124,92,255,.3);',
    'background:rgba(124,92,255,.1);display:flex;align-items:center;justify-content:center;',
    'font-size:16px;font-weight:800;color:#7c5cff;}',
    '.gc-hd-av img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;}',
    '.gc-hd-sdot{position:absolute;bottom:0;right:0;width:12px;height:12px;border-radius:50%;border:2px solid var(--gc-card);}',
    '.gc-hd-sdot.online{background:#22c55e;animation:gcPulse 1.8s ease-in-out infinite;}',
    '.gc-hd-sdot.offline{background:#94a3b8;}',
    '@keyframes gcPulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.6)}50%{box-shadow:0 0 0 5px rgba(34,197,94,0)}}',
    '.gc-hd-info{flex:1;min-width:0;}',
    '.gc-hd-name{font-size:14px;font-weight:800;color:var(--gc-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.gc-hd-sub{font-size:11px;color:var(--gc-muted);margin-top:1px;}',
    '.gc-hd-sub.online{color:#16a34a;}',
    '.gc-close-x{width:32px;height:32px;border-radius:50%;border:none;background:rgba(148,163,184,.15);',
    'color:var(--gc-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:.15s;}',
    '.gc-close-x:hover{background:rgba(239,68,68,.15);color:#dc2626;}',

    /* Messages */
    '.gc-msgs{flex:1;overflow-y:auto;padding:14px 14px 4px;display:flex;flex-direction:column;gap:2px;scroll-behavior:smooth;}',
    '.gc-msgs::-webkit-scrollbar{width:4px;}.gc-msgs::-webkit-scrollbar-thumb{background:rgba(148,163,184,.3);border-radius:2px;}',
    '.gc-date-sep{text-align:center;margin:10px 0 4px;}',
    '.gc-date-sep span{font-size:10px;font-weight:700;color:var(--gc-muted);background:rgba(148,163,184,.12);padding:3px 10px;border-radius:10px;}',
    '.gc-row{display:flex;margin:2px 0;}.gc-row.mine{justify-content:flex-end;}.gc-row.theirs{justify-content:flex-start;}',
    '.gc-bubble{max-width:75%;border-radius:16px;padding:9px 12px;word-break:break-word;line-height:1.5;}',
    '.gc-bubble.mine{background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border-bottom-right-radius:4px;}',
    '.gc-bubble.theirs{background:rgba(148,163,184,.15);color:var(--gc-text);border-bottom-left-radius:4px;}',
    '[data-theme="dark"] .gc-bubble.theirs{background:rgba(148,163,184,.2);}',
    '.gc-img-msg{max-width:220px;border-radius:10px;display:block;cursor:zoom-in;margin-bottom:4px;}',
    '.gc-text{font-size:13.5px;}.gc-ts{font-size:9.5px;opacity:.6;margin-top:4px;text-align:right;}',
    '.gc-bubble.theirs .gc-ts{text-align:left;}',
    '.gc-empty{text-align:center;color:var(--gc-muted);font-size:13px;margin:auto;padding:20px 0;}',
    '.gc-loading{display:flex;align-items:center;justify-content:center;padding:30px 0;}',
    '.gc-spin{width:22px;height:22px;border:3px solid rgba(124,92,255,.2);border-top-color:#7c5cff;border-radius:50%;animation:gcSpin .7s linear infinite;}',
    '@keyframes gcSpin{to{transform:rotate(360deg)}}',

    /* Image preview */
    '.gc-img-prev{display:none;align-items:center;gap:10px;padding:8px 14px;background:rgba(124,92,255,.06);border-top:1px solid var(--gc-border);flex-shrink:0;}',
    '.gc-img-prev img{height:56px;border-radius:8px;object-fit:cover;}',
    '.gc-img-prev-rm{background:rgba(239,68,68,.12);color:#ef4444;border:none;border-radius:50%;width:24px;height:24px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}',

    /* Input row */
    '.gc-input-row{display:flex;align-items:center;gap:8px;padding:10px 14px 12px;border-top:1px solid var(--gc-border);flex-shrink:0;}',
    '.gc-img-btn{width:36px;height:36px;border-radius:10px;border:1.5px solid var(--gc-border);background:transparent;color:var(--gc-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:.15s;}',
    '.gc-img-btn:hover{border-color:#7c5cff;color:#7c5cff;}',
    '.gc-input{flex:1;padding:9px 13px;border-radius:12px;border:1.5px solid var(--gc-border);background:rgba(148,163,184,.08);color:var(--gc-text);font-size:13.5px;font-family:inherit;outline:none;transition:.15s;}',
    '.gc-input:focus{border-color:#7c5cff;}',
    '.gc-send-btn{width:38px;height:38px;border-radius:12px;border:none;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:.15s;}',
    '.gc-send-btn:hover{opacity:.85;}.gc-send-btn:disabled{opacity:.4;cursor:default;}',

    /* Notifications */
    '#gc-notifs{position:fixed;bottom:24px;right:400px;z-index:9101;display:flex;flex-direction:column-reverse;gap:8px;pointer-events:none;}',
    '@media(max-width:480px){#gc-notifs{bottom:76px;right:12px;left:12px;}}',
    '.gc-notif{background:var(--gc-card);border-radius:16px;border:1px solid var(--gc-border);',
    'box-shadow:0 6px 24px rgba(0,0,0,.15);padding:12px 14px;pointer-events:auto;',
    'display:flex;align-items:center;gap:10px;cursor:pointer;min-width:260px;max-width:300px;',
    'animation:gcSlideIn .25s ease;transition:transform .2s,opacity .2s;}',
    '.gc-notif.gc-out{transform:translateX(120%);opacity:0;pointer-events:none;}',
    '@keyframes gcSlideIn{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}',
    '.gc-notif-av{width:40px;height:40px;border-radius:50%;overflow:hidden;flex-shrink:0;',
    'background:rgba(124,92,255,.1);display:flex;align-items:center;justify-content:center;',
    'font-size:15px;font-weight:800;color:#7c5cff;border:2px solid rgba(124,92,255,.2);}',
    '.gc-notif-av img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;}',
    '.gc-notif-body{flex:1;min-width:0;}',
    '.gc-notif-name{font-size:13px;font-weight:800;color:var(--gc-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.gc-notif-msg{font-size:11.5px;color:var(--gc-muted);margin-top:2px;}',
    '.gc-notif-close{width:22px;height:22px;border-radius:50%;border:none;background:rgba(148,163,184,.15);',
    'color:var(--gc-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;}',
    '.gc-notif-close:hover{background:rgba(239,68,68,.15);color:#dc2626;}',
  ].join('');
  document.head.appendChild(style);

  /* ── Inject HTML ── */
  var tmp=document.createElement('div');
  tmp.innerHTML=
    '<div id="gc-box">'
      +'<div class="gc-hd">'
        +'<div class="gc-hd-av-wrap"><div class="gc-hd-av" id="gcHdAv"></div><span class="gc-hd-sdot offline" id="gcHdDot"></span></div>'
        +'<div class="gc-hd-info"><div class="gc-hd-name" id="gcHdName"></div><div class="gc-hd-sub" id="gcHdSub">Offline</div></div>'
        +'<button class="gc-close-x" id="gcCloseBtn">'
          +'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        +'</button>'
      +'</div>'
      +'<div class="gc-msgs" id="gcMsgs"><div class="gc-loading"><div class="gc-spin"></div></div></div>'
      +'<div class="gc-img-prev" id="gcImgPrev">'
        +'<img id="gcImgPrevImg" src="" alt="">'
        +'<button class="gc-img-prev-rm" id="gcImgRm">✕</button>'
      +'</div>'
      +'<div class="gc-input-row">'
        +'<input type="file" id="gcFile" accept="image/*" style="display:none">'
        +'<button class="gc-img-btn" id="gcImgBtn">'
          +'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
        +'</button>'
        +'<input class="gc-input" id="gcInput" type="text" placeholder="Type a message…">'
        +'<button class="gc-send-btn" id="gcSendBtn">'
          +'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
        +'</button>'
      +'</div>'
    +'</div>'
    +'<div id="gc-notifs"></div>';
  while (tmp.firstChild) document.body.appendChild(tmp.firstChild);

  /* ── State ── */
  var _chatWith   = null;
  var _chatImg    = '';
  var _chatPoll   = null;
  var _unreadPoll = null;
  var _prevCounts = {};  // sender → last known count

  /* ── Wire DOM events ── */
  function wire() {
    document.getElementById('gcCloseBtn').addEventListener('click', gcClose);
    document.getElementById('gcImgBtn').addEventListener('click', function(){ document.getElementById('gcFile').click(); });
    document.getElementById('gcImgRm').addEventListener('click', gcClearImg);
    document.getElementById('gcSendBtn').addEventListener('click', gcSend);
    document.getElementById('gcFile').addEventListener('change', function(e){
      var f=e.target.files&&e.target.files[0]; if(!f) return;
      gcUploadImg(f); e.target.value='';
    });
    document.getElementById('gcInput').addEventListener('keydown', function(e){
      if (e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); gcSend(); }
    });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape') gcClose(); });
  }

  /* ── Open chat ── */
  function gcOpen(username, displayName, photoUrl, online) {
    if (!getMyUsername()) return;
    _chatWith    = username;
    _chatImg     = '';
    var name     = displayName || username;
    var init     = (name||'?').charAt(0).toUpperCase();
    var avEl     = document.getElementById('gcHdAv');
    avEl.innerHTML = photoUrl
      ? '<img src="'+esc(photoUrl)+'" alt="'+esc(init)+'" onerror="this.parentNode.innerHTML=\''+esc(init)+'\'">'
      : esc(init);
    document.getElementById('gcHdName').textContent = name;
    var dot = document.getElementById('gcHdDot');
    var sub = document.getElementById('gcHdSub');
    dot.className = 'gc-hd-sdot '+(online?'online':'offline');
    sub.textContent = online?'Online':'Offline';
    sub.className = 'gc-hd-sub'+(online?' online':'');
    document.getElementById('gcImgPrev').style.display='none';
    document.getElementById('gcInput').value='';
    document.getElementById('gcMsgs').innerHTML='<div class="gc-loading"><div class="gc-spin"></div></div>';
    document.getElementById('gc-box').classList.add('gc-open');
    gcLoadMsgs(true);
    if (_chatPoll) clearInterval(_chatPoll);
    _chatPoll = setInterval(function(){ gcLoadMsgs(false); }, 4000);
    setTimeout(function(){ document.getElementById('gcInput').focus(); }, 300);
  }
  window.openGlobalChat = gcOpen;

  /* ── Close chat ── */
  function gcClose() {
    document.getElementById('gc-box').classList.remove('gc-open');
    if (_chatPoll){ clearInterval(_chatPoll); _chatPoll=null; }
    _chatWith = null;
    gcPollUnread();
  }

  /* ── Load messages ── */
  async function gcLoadMsgs(scrollDown) {
    if (!_chatWith) return;
    var res = await gcPost({ action:'helen_msg_list', with:_chatWith });
    var el  = document.getElementById('gcMsgs');
    if (!res||!res.ok) {
      if (el.querySelector('.gc-spin')) el.innerHTML='<div class="gc-empty" style="color:#ef4444">Could not load messages — retrying…</div>';
      return;
    }
    gcRenderMsgs(res.messages||[], scrollDown);
    var card=document.querySelector('.tm-card[data-username="'+_chatWith+'"]');
    if (card){ var b=card.querySelector('.tm-unread'); if(b) b.remove(); }
  }

  /* ── Render messages ── */
  function gcRenderMsgs(msgs, scrollDown) {
    var el=document.getElementById('gcMsgs');
    var myUser=getMyUsername();
    if (!msgs.length){ el.innerHTML='<div class="gc-empty">No messages yet — say hi!</div>'; return; }
    var atBottom=el.scrollHeight-el.scrollTop<=el.clientHeight+80;
    var html='', prevDate='';
    msgs.forEach(function(m){
      var mine=m.sender===myUser;
      var ds=fmtDate(m.created_at);
      if (ds!==prevDate){ html+='<div class="gc-date-sep"><span>'+esc(ds)+'</span></div>'; prevDate=ds; }
      html+='<div class="gc-row '+(mine?'mine':'theirs')+'">';
      html+='<div class="gc-bubble '+(mine?'mine':'theirs')+'">';
      if (m.image_url) html+='<img class="gc-img-msg" src="'+esc(m.image_url)+'" onclick="window.open(\''+esc(m.image_url)+'\',\'_blank\')" loading="lazy">';
      if (m.body)      html+='<div class="gc-text">'+esc(m.body).replace(/\n/g,'<br>')+'</div>';
      html+='<div class="gc-ts">'+esc(fmtTime(m.created_at))+'</div>';
      html+='</div></div>';
    });
    el.innerHTML=html;
    if (scrollDown||atBottom) el.scrollTop=el.scrollHeight;
  }

  /* ── Send message ── */
  async function gcSend() {
    if (!_chatWith) return;
    var input=document.getElementById('gcInput');
    var text=(input.value||'').trim();
    var img=_chatImg;
    if (!text&&!img) return;
    var btn=document.getElementById('gcSendBtn'); btn.disabled=true;
    await gcPost({ action:'helen_msg_send', to:_chatWith, body:text, image_url:img });
    input.value=''; gcClearImg();
    await gcLoadMsgs(true);
    btn.disabled=false;
    input.focus();
  }

  /* ── Upload image ── */
  async function gcUploadImg(file) {
    var btn=document.getElementById('gcSendBtn'); btn.disabled=true;
    var prev=document.getElementById('gcImgPrev');
    var prevImg=document.getElementById('gcImgPrevImg');
    prev.style.display='flex'; prevImg.src='';
    var reader=new FileReader();
    reader.onload=async function(ev){
      var r=await gcPost({ action:'helen_upload_photo', data:ev.target.result });
      if (!r||!r.ok){ prev.style.display='none'; btn.disabled=false; return; }
      _chatImg=r.url; prevImg.src=r.url; btn.disabled=false;
    };
    reader.readAsDataURL(file);
  }

  function gcClearImg() {
    _chatImg='';
    document.getElementById('gcImgPrev').style.display='none';
    document.getElementById('gcImgPrevImg').src='';
    document.getElementById('gcFile').value='';
  }

  /* ── Notification toast ── */
  function showNotif(sender, displayName, photoUrl, count) {
    var notifId='gc-n-'+sender.replace(/[^a-z0-9]/gi,'_');
    var existing=document.getElementById(notifId);
    if (existing) existing.remove();

    var name=displayName||sender;
    var init=(name||'?').charAt(0).toUpperCase();
    var avHtml=photoUrl
      ?'<img src="'+esc(photoUrl)+'" alt="'+esc(init)+'" onerror="this.outerHTML=\''+esc(init)+'\'">'
      :esc(init);

    var el=document.createElement('div');
    el.className='gc-notif';
    el.id=notifId;
    el.innerHTML=
      '<div class="gc-notif-av">'+avHtml+'</div>'
      +'<div class="gc-notif-body">'
        +'<div class="gc-notif-name">'+esc(name)+'</div>'
        +'<div class="gc-notif-msg">'+count+' new message'+(count>1?'s':'')+'</div>'
      +'</div>'
      +'<button class="gc-notif-close" title="Dismiss">✕</button>';

    el.addEventListener('click', function(e){
      if (e.target.classList.contains('gc-notif-close')){ dismissNotif(el); return; }
      dismissNotif(el);
      gcPost({ action:'helen_team_list' }).then(function(res){
        var u=(res&&res.users||[]).find(function(x){ return x.username===sender; })||{};
        gcOpen(sender, u.display_name||name, u.photo_url||photoUrl, isOnlineDt(u.last_seen));
      }).catch(function(){ gcOpen(sender, name, photoUrl, false); });
    });
    el.querySelector('.gc-notif-close').addEventListener('click', function(e){
      e.stopPropagation(); dismissNotif(el);
    });

    document.getElementById('gc-notifs').appendChild(el);
    var timer=setTimeout(function(){ dismissNotif(el); }, 6000);
    el._gcTimer=timer;

    /* dispatch event so team.html can react */
    document.dispatchEvent(new CustomEvent('helen-new-msg', { detail:{ sender:sender } }));
  }

  function dismissNotif(el) {
    if (!el||!el.parentNode) return;
    if (el._gcTimer) clearTimeout(el._gcTimer);
    el.classList.add('gc-out');
    setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 220);
  }

  /* ── Poll unread ── */
  async function gcPollUnread() {
    if (!getMyUsername()) return;
    var res=await gcPost({ action:'helen_msg_unread' });
    if (!res||!res.ok) return;

    var unread=res.unread||[];
    var newCounts={};
    unread.forEach(function(u){ newCounts[u.sender]=u.count; });

    /* detect increases */
    unread.forEach(function(u){
      var prev=_prevCounts[u.sender]||0;
      if (u.count>prev && u.sender!==_chatWith) {
        showNotif(u.sender, u.display_name, u.photo_url, u.count);
        playNotifSound();
      }
    });
    _prevCounts=newCounts;

    /* broadcast for team.html badges */
    document.dispatchEvent(new CustomEvent('helen-unread-update', { detail:{ counts:res.counts||{}, unread:unread } }));
  }

  /* ── Notification sound (Web Audio API — no file needed) ── */
  var _audioCtx = null;
  function _getCtx() {
    if (!_audioCtx || _audioCtx.state === 'closed') {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      _audioCtx = new AC();
    }
    return _audioCtx;
  }
  /* Resume context on first user interaction (browser autoplay policy) */
  document.addEventListener('click', function _resume() {
    var c = _getCtx(); if (c && c.state === 'suspended') c.resume();
    document.removeEventListener('click', _resume);
  }, { once: true });

  function playNotifSound() {
    try {
      var ctx = _getCtx(); if (!ctx) return;
      if (ctx.state === 'suspended') { ctx.resume(); }
      var now = ctx.currentTime;
      function tone(freq, start, dur, vol) {
        var osc  = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(vol, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(start); osc.stop(start + dur);
      }
      tone(988,  now,        0.35, 0.22);  /* B5 */
      tone(1319, now + 0.12, 0.30, 0.15); /* E6 */
    } catch(e) {}
  }

  /* ── Start polling ── */
  function startUnreadPoll() {
    if (_unreadPoll) return;
    gcPollUnread();
    _unreadPoll=setInterval(gcPollUnread, 5000);
  }

  /* ── Init ── */
  function init() {
    if (!getMyUsername()) return;
    wire();
    startUnreadPoll();
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

})();
