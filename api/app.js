/**
 * App — MySQL API Handler
 * Replaces Google Apps Script backend.
 */

const mysql  = require('mysql2/promise');
const crypto = require('crypto');

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || '';
const TG_CHAT_ID   = process.env.TG_CHAT_ID   || '';
const CLD_CLOUD    = process.env.CLOUDINARY_CLOUD_NAME   || '';
const CLD_KEY      = process.env.CLOUDINARY_API_KEY      || '';
const CLD_SEC      = process.env.CLOUDINARY_API_SECRET   || '';

/* ── DB connection pool ── */
let pool;
function db() {
  if (!pool) pool = mysql.createPool({
    uri: process.env.MYSQL_URL,
    waitForConnections: true,
    connectionLimit: 5,
    ssl: { rejectUnauthorized: false },
    dateStrings: true,
  });
  return pool;
}

/* ── One-time migration: add social_links column if absent ── */
let _slColReady = false;
async function ensureSocialLinksCol() {
  if (_slColReady) return;
  try { await db().query('ALTER TABLE loans ADD COLUMN social_links TEXT'); } catch(e) {}
  _slColReady = true;
}

/* ── One-time migration: add paid column if absent ── */
let _paidColReady = false;
async function ensurePaidCol() {
  if (_paidColReady) return;
  try { await db().query('ALTER TABLE loans ADD COLUMN paid TINYINT(1) NOT NULL DEFAULT 0'); } catch(e) {}
  _paidColReady = true;
}

/* ── One-time migration: add photo_url column to users if absent ── */
let _userPhotoColReady = false;
async function ensureUserPhotoCol() {
  if (_userPhotoColReady) return;
  try { await db().query('ALTER TABLE users ADD COLUMN photo_url VARCHAR(500) DEFAULT NULL'); } catch(e) {}
  _userPhotoColReady = true;
}

/* ── One-time migration: add ui_prefs column to users if absent ── */
let _uiPrefsColReady = false;
async function ensureUiPrefsCol() {
  if (_uiPrefsColReady) return;
  try { await db().query('ALTER TABLE users ADD COLUMN ui_prefs TEXT DEFAULT NULL'); } catch(e) {}
  _uiPrefsColReady = true;
}

/* ── One-time migration: add Sub Admin scope/quota columns to users if absent ── */
/* scope is keyed by "Linked To" tag names (distinct entities like a bank name), not Groups */
let _userScopeColsReady = false;
async function ensureUserScopeCols() {
  if (_userScopeColsReady) return;
  try { await db().query('ALTER TABLE users CHANGE COLUMN scope_groups scope_linked_to TEXT DEFAULT NULL'); } catch(e) {}
  try { await db().query('ALTER TABLE users ADD COLUMN scope_linked_to TEXT DEFAULT NULL'); } catch(e) {}
  try { await db().query('ALTER TABLE users ADD COLUMN max_normal_users INT NOT NULL DEFAULT 0'); } catch(e) {}
  try { await db().query('ALTER TABLE users ADD COLUMN created_by VARCHAR(100) DEFAULT NULL'); } catch(e) {}
  _userScopeColsReady = true;
}

/* ── One-time migration: add created_by column to loans if absent ── */
let _createdByColReady = false;
async function ensureCreatedByCol() {
  if (_createdByColReady) return;
  try { await db().query('ALTER TABLE loans ADD COLUMN created_by VARCHAR(100) DEFAULT NULL'); } catch(e) {}
  _createdByColReady = true;
}

/* ── One-time migration: add created_by_user column (login username) to loans if absent ── */
let _createdByUserColReady = false;
async function ensureCreatedByUserCol() {
  if (_createdByUserColReady) return;
  try { await db().query('ALTER TABLE loans ADD COLUMN created_by_user VARCHAR(100) DEFAULT NULL'); } catch(e) {}
  _createdByUserColReady = true;
}

/* ── One-time migration: add linked_to column to loans if absent ── */
let _linkedToColReady = false;
async function ensureLinkedToCol() {
  if (_linkedToColReady) return;
  try { await db().query('ALTER TABLE loans ADD COLUMN linked_to VARCHAR(255) DEFAULT NULL'); } catch(e) {}
  _linkedToColReady = true;
}

/* ── One-time migration: add restricted column to loans if absent (Admin-only extra hide, on top of team scope) ── */
let _restrictedColReady = false;
async function ensureRestrictedCol() {
  if (_restrictedColReady) return;
  try { await db().query('ALTER TABLE loans ADD COLUMN restricted TINYINT(1) NOT NULL DEFAULT 0'); } catch(e) {}
  _restrictedColReady = true;
}

/* ── One-time migration: add created_by_team column to settings if absent
     (tracks which Sub Admin's team created a Group/Linked To entry; NULL = shared/global) ── */
let _settingsTeamColReady = false;
async function ensureSettingsTeamCol() {
  if (_settingsTeamColReady) return;
  try { await db().query('ALTER TABLE settings ADD COLUMN created_by_team VARCHAR(100) DEFAULT NULL'); } catch(e) {}
  _settingsTeamColReady = true;
}

/* ── One-time migration: add loan_tabs column to loans if absent ── */
let _loanTabsColReady = false;
async function ensureLoanTabsCol() {
  if (_loanTabsColReady) return;
  try { await db().query('ALTER TABLE loans ADD COLUMN loan_tabs TEXT DEFAULT NULL'); } catch(e) {}
  _loanTabsColReady = true;
}

/* ── Activity log table ── */
let _actLogReady = false;
async function ensureActivityLogTable() {
  if (_actLogReady) return;
  try {
    await db().query(`CREATE TABLE IF NOT EXISTS activity_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      action VARCHAR(50) NOT NULL,
      actor VARCHAR(100),
      actor_user VARCHAR(100),
      target VARCHAR(255),
      detail TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created (created_at),
      INDEX idx_action (action)
    )`);
  } catch(e) {}
  _actLogReady = true;
}

async function logActivity(act, actor, actorUser, target, detail) {
  try {
    await ensureActivityLogTable();
    await db().query(
      'INSERT INTO activity_log (action,actor,actor_user,target,detail) VALUES (?,?,?,?,?)',
      [act, actor||null, actorUser||null, target||null, detail ? JSON.stringify(detail) : null]
    );
  } catch(e) {}
}

/* ── Map DB row → frontend loan object ── */
function rowToLoan(r) {
  return {
    DateTime:    r.loan_key     || '',
    FullName:    r.full_name    || '',
    NationalID:  r.national_id  || '',
    DOB:         r.dob          || '',
    Phone:       r.phone        || '',
    Gender:      r.gender       || '',
    Groups:      r.loan_group   || '',
    Money:       r.money != null ? Number(r.money) : '',
    Status:      r.loan_status  || '',
    Note:        r.note         || '',
    FBName:      r.fb_name      || '',
    URL:         r.fb_url       || '',
    FacebookCom: r.social_media || '',
    ID:          r.social_id    || '',
    FBID:        r.fbid         || '',
    LinkedTo:    r.linked_to    || '',
    Restricted:  !!r.restricted,
    Paid:        r.paid ? 1 : 0,
    created_by:  r.creator_display_name || r.created_by || '',
    photo_url:   r.photo_url    || '',
    photos:      (() => { try { if (!r.photos) return []; if (Array.isArray(r.photos)) return r.photos; return JSON.parse(r.photos) || []; } catch(e) { return []; } })(),
    loan_tabs:   (() => { try { if (!r.loan_tabs) return []; if (Array.isArray(r.loan_tabs)) return r.loan_tabs; return JSON.parse(r.loan_tabs) || []; } catch(e) { return []; } })(),
    social_links: (() => {
      try {
        if (r.social_links) {
          const sl = typeof r.social_links === 'string' ? JSON.parse(r.social_links) : r.social_links;
          if (Array.isArray(sl) && sl.length) return sl;
        }
      } catch(e) {}
      // Fallback: synthesise from old columns
      if (r.fb_name || r.fb_url || r.social_id || r.fbid) {
        return [{ name: r.fb_name||'', platform: r.social_media||'Facebook', url: r.fb_url||'', id: r.social_id||'', fbid: r.fbid||'' }];
      }
      return [];
    })(),
  };
}

/* ── Telegram config (DB overrides env vars) ── */
let _tgCache = null;
let _tgCacheAt = 0;
async function getTgConfig() {
  if (_tgCache && Date.now() - _tgCacheAt < 60000) return _tgCache;
  try {
    const [rows] = await db().query("SELECT type, value FROM settings WHERE type IN ('tg_bot_token','tg_chat_id')");
    const m = {};
    rows.forEach(r => { m[r.type] = r.value; });
    _tgCache = {
      bot:  m.tg_bot_token || TG_BOT_TOKEN,
      chat: m.tg_chat_id   || TG_CHAT_ID,
    };
  } catch(e) {
    _tgCache = { bot: TG_BOT_TOKEN, chat: TG_CHAT_ID };
  }
  _tgCacheAt = Date.now();
  return _tgCache;
}

/* ── Telegram ── */
function fmtDate(dt) {
  try {
    const d = new Date(dt);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  } catch { return String(dt||'').substring(0,10); }
}

function loanBlock(r) {
  const money = r.money != null && r.money !== '' ? Number(r.money).toFixed(2).replace(/\.00$/,'') : '—';
  return `👤 ឈ្មោះ: ${r.full_name||'—'}\n`
    + `🪪 NID: ${r.national_id||'—'}\n`
    + `📱 ទូរស័ព្ទ: ${r.phone||'—'}\n`
    + `⚧ ភេទ: ${r.gender||'—'}\n`
    + `👥 ក្រុម: ${r.loan_group||'—'}\n`
    + `💵 ចំនួនប្រាក់: ${money}\n`
    + `📊 ស្ថានភាព: ${r.loan_status||'—'}\n`
    + `📅 កាលបរិច្ឆេទ: ${fmtDate(r.loan_key)}\n`
    + (r.fbid ? `🔗 FBID: ${r.fbid}\n` : '');
}

async function sendTelegram(loan, action, actorName, oldLoan) {
  const { bot, chat } = await getTgConfig();
  if (!bot || !chat) return;
  const TG_BOT_TOKEN = bot, TG_CHAT_ID = chat;
  let msg;
  if (action === 'edit' && oldLoan) {
    const actor = actorName ? `─────────────────\nទិន្នន័យត្រូវបានកែសម្រួលដោយ: ${actorName}` : '';
    msg = `✏️ *ទិន្នន័យត្រូវបានកែសម្រួល*\n━━━━━━━━━━━━━━━\n*Before*\n${loanBlock(oldLoan)}─────────────────\n*After*\n${loanBlock(loan)}${actor}`;
  } else if (action === 'delete') {
    const actor = actorName ? `━━━━━━━━━━━━━━━\n🗑 ទិន្នន័យត្រូវបានលុបដោយ៖ ${actorName}` : '';
    msg = loanBlock(loan) + actor;
  } else {
    const actor = actorName ? `─────────────────\nបញ្ចូលទិន្នន័យដោយ: ${actorName}` : '';
    msg = loanBlock(loan) + actor;
  }
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text: msg, parse_mode: 'Markdown' }),
    });
  } catch(e) {}
}

async function sendTelegramEvent(evtType, data) {
  const { bot, chat } = await getTgConfig();
  if (!bot || !chat) return;
  const TG_BOT_TOKEN = bot, TG_CHAT_ID = chat;
  const now = new Date().toLocaleString('km-KH', { timeZone:'Asia/Phnom_Penh', hour12:true });
  let msg = '';
  if (evtType === 'login') {
    msg = `🔑 *User Login*\n━━━━━━━━━━━━━━━\n👤 ឈ្មោះ: ${data.name||data.username||'—'}\n👨‍💼 Role: ${data.role||'—'}\n⏰ ${now}`;
  } else if (evtType === 'login_fail') {
    const reasons = { wrong:'ឈ្មោះ/PIN ខុស', expired:'គណនីផុតកំណត់' };
    msg = `⚠️ *Failed Login*\n━━━━━━━━━━━━━━━\n👤 Username: ${data.username||'—'}\n🔢 Attempt: ${data.attempt||'—'}\n❌ Reason: ${reasons[data.reason]||data.reason||'—'}\n⏰ ${now}`;
  } else if (evtType === 'user') {
    const icons  = { add:'👤', edit:'✏️', delete:'🗑' };
    const titles = { add:'New User Added', edit:'User Updated', delete:'User Deleted' };
    const byWord  = data.act === 'add' ? 'Added' : data.act === 'edit' ? 'Updated' : 'Deleted';
    const actor  = data.actor ? `\n─────────────────\n${byWord} by: ${data.actor}` : '';
    if (data.act === 'delete') {
      msg = `${icons.delete} *User Deleted*\n━━━━━━━━━━━━━━━\nUsername: ${data.username||'—'}${actor}\n⏰ ${now}`;
    } else {
      msg = `${icons[data.act]||'👤'} *${titles[data.act]||'User Action'}*\n━━━━━━━━━━━━━━━\nUsername: ${data.username||'—'}\nName: ${data.display_name||'—'}\nRole: ${data.role||'—'}\nStatus: ${data.status||'—'}${actor}\n⏰ ${now}`;
    }
  }
  if (!msg) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text: msg, parse_mode: 'Markdown' }),
    });
  } catch(e) {}
}

/* ── Notification check ── */
async function isNotifEnabled(type) {
  const [rows] = await db().query('SELECT value FROM settings WHERE type="notif"');
  const configured = rows.some(r => r.value === '__configured__');
  if (!configured) return true; // never saved = all enabled (default)
  return rows.some(r => r.value === type);
}

async function isWatched(username) {
  if (!username) return false;
  const [rows] = await db().query('SELECT 1 FROM settings WHERE type="watch_user" AND value=? LIMIT 1', [username]);
  return rows.length > 0;
}

/* ── Auth ── */
async function validateAuth(u, p) {
  if (!u || !p) return null;
  await ensureUserPhotoCol();
  await ensureUserScopeCols();
  const [rows] = await db().query(
    'SELECT username, role, display_name, exp_date, photo_url, scope_linked_to, max_normal_users, created_by FROM users WHERE username=? AND pin=? AND status="active" LIMIT 1',
    [u, p]
  );
  if (!rows.length) return null;
  const user = rows[0];
  if (user.exp_date) {
    const today = new Date().toISOString().split('T')[0];
    const exp   = user.exp_date instanceof Date
      ? user.exp_date.toISOString().split('T')[0]
      : String(user.exp_date).substring(0,10);
    if (today > exp) return { expired: true };
  }
  const expDate = user.exp_date
    ? (user.exp_date instanceof Date ? user.exp_date.toISOString().split('T')[0] : String(user.exp_date).substring(0,10))
    : '';
  let scopeGroups = [];
  try { scopeGroups = user.scope_linked_to ? JSON.parse(user.scope_linked_to) : []; } catch(e) { scopeGroups = []; }
  if (!Array.isArray(scopeGroups)) scopeGroups = [];
  return { username: user.username, role: user.role||'Staff', name: user.display_name||user.username, expDate, photo_url: user.photo_url || '', scope_linked_to: scopeGroups, max_normal_users: user.max_normal_users||0, created_by: user.created_by||null };
}

/* ── The "team owner" (a Sub Admin's own username) for a requester, or null if unscoped ──
   Sub Admin -> themselves. A Normal User a Sub Admin created -> that Sub Admin. Anyone else -> null.
   Deliberately independent of how many scope_linked_to entries they currently have — a brand new
   Sub Admin with zero grants yet is still a scoped role and must NOT fall through to "sees everything". */
function teamOwnerOf(_bv) {
  if (!_bv) return null;
  if (_bv.role === 'Sub Admin') return _bv.username;
  if (_bv.created_by) return _bv.created_by;
  return null;
}

/* ── Returns a SQL fragment + params to restrict a loans query to the requester's scope_linked_to
     (no-op if unscoped). A scoped role with zero grants yet sees nothing (not everything) — an
     empty scope_linked_to must never be treated the same as "unscoped". Scoped viewers also never
     see loans an Admin has explicitly marked "restricted" — an extra Admin-only hide on top of
     team scope. ── */
function scopeFilterSQL(_bv, column) {
  var col = column || 'linked_to';
  if (teamOwnerOf(_bv) === null) return { clause: '', params: [] };
  var list = (_bv && Array.isArray(_bv.scope_linked_to)) ? _bv.scope_linked_to : [];
  if (!list.length) return { clause: ' AND 1=0', params: [] };
  return { clause: ' AND ' + col + ' IN (?) AND (l.restricted = 0 OR l.restricted IS NULL)', params: [list] };
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let body = {};
    if (req.method === 'POST') {
      if (req.body !== undefined && req.body !== null) {
        body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
      } else {
        let raw = '';
        await new Promise((resolve, reject) => {
          req.on('data', chunk => { raw += chunk.toString(); });
          req.on('end', resolve);
          req.on('error', reject);
        });
        try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
      }
    } else {
      body = req.query || {};
    }

    const action = String(body.action || '').trim();

    /* ── Public: login ── */
    if (action === 'api_login') {
      const v = await validateAuth(String(body.username||'').trim(), String(body.pin||'').trim());
      if (!v)          return res.json({ ok:false, message:'ឈ្មោះ ឬ PIN មិនត្រូវ' });
      if (v.expired)   return res.json({ ok:false, message:'គណនីបានផុតកំណត់ — សូមទំនាក់ទំនង Admin', code:'expired' });
      db().query('UPDATE users SET last_seen=NOW() WHERE username=?', [v.username]).catch(()=>{});
      if (await isNotifEnabled('login')) { try { await sendTelegramEvent('login', { name:v.name, role:v.role, username:v.username }); } catch(e) {} }
      logActivity('user_login', v.name, v.username, null, { role: v.role }).catch(()=>{});
      return res.json({ ok:true, name:v.name, role:v.role, username:v.username, expDate:v.expDate, photo_url:v.photo_url||'' });
    }

    if (action === 'login_alert') {
      if (await isNotifEnabled('login_fail')) {
        try { await sendTelegramEvent('login_fail', { username:body.username, reason:body.reason, attempt:body.attempt }); } catch(e) {}
      }
      return res.json({ ok:true });
    }

    /* ── Public: Borrower self-service portal login ── */
    if (action === 'portal_login') {
      const method = String(body.method || 'name').trim();
      /* Normalize phone/NID: strip spaces and dashes so "089 993 814" = "089993814" */
      const phone  = String(body.phone  || '').trim().replace(/[\s\-]/g, '');
      const name   = String(body.name   || '').trim();
      const nid    = String(body.nid    || '').trim().replace(/[\s\-]/g, '');
      if (!phone) return res.json({ ok: false, message: 'phone_required' });
      await ensureLoanTabsCol();
      let loanRows = [];
      try {
        if (method === 'nid') {
          if (!nid) return res.json({ ok: false, message: 'nid_required' });
          [loanRows] = await db().query(
            'SELECT loan_key,full_name,national_id,dob,phone,gender,loan_group,money,loan_status,note,paid,photo_url,loan_tabs FROM loans WHERE REPLACE(REPLACE(phone,\' \',\'\'),\'-\',\'\')=? AND REPLACE(REPLACE(national_id,\' \',\'\'),\'-\',\'\')=? AND deleted_at IS NULL ORDER BY loan_key DESC',
            [phone, nid]
          );
        } else {
          if (!name) return res.json({ ok: false, message: 'name_required' });
          [loanRows] = await db().query(
            'SELECT loan_key,full_name,national_id,dob,phone,gender,loan_group,money,loan_status,note,paid,photo_url,loan_tabs FROM loans WHERE REPLACE(REPLACE(phone,\' \',\'\'),\'-\',\'\')=? AND full_name=? AND deleted_at IS NULL ORDER BY loan_key DESC',
            [phone, name]
          );
        }
      } catch(e) {
        return res.json({ ok: false, message: 'server_error' });
      }
      if (!loanRows.length) return res.json({ ok: false, message: 'not_found' });

      /* parse loan_tabs JSON for each row */
      loanRows.forEach(r => {
        try { r._tabs = r.loan_tabs ? (JSON.parse(r.loan_tabs) || []) : []; }
        catch(e) { r._tabs = []; }
      });

      /* collect all repayment keys: base loan keys + tab_ids */
      const allRepKeys = [];
      loanRows.forEach(r => {
        allRepKeys.push(r.loan_key);
        r._tabs.forEach(t => { if (t.tab_id) allRepKeys.push(t.tab_id); });
      });

      let repaymentMap = {};
      try {
        const ph2 = allRepKeys.map(() => '?').join(',');
        const [reps] = await db().query(
          'SELECT loan_key,type,amount,paid_at,note FROM repayments WHERE loan_key IN (' + ph2 + ') ORDER BY paid_at ASC',
          allRepKeys
        );
        reps.forEach(r => {
          if (!repaymentMap[r.loan_key]) repaymentMap[r.loan_key] = [];
          repaymentMap[r.loan_key].push({ type: r.type, amount: Number(r.amount), paid_at: r.paid_at, note: r.note || '' });
        });
      } catch(e) {}

      const loans = loanRows.map(r => ({
        key:        r.loan_key    || '',
        name:       r.full_name   || '',
        nid:        r.national_id || '',
        dob:        r.dob         || '',
        phone:      r.phone       || '',
        gender:     r.gender      || '',
        group:      r.loan_group  || '',
        money:      r.money != null ? Number(r.money) : 0,
        status:     r.loan_status || '',
        note:       r.note        || '',
        paid:       r.paid ? 1 : 0,
        photo_url:  r.photo_url   || '',
        repayments: repaymentMap[r.loan_key] || [],
        loan_tabs:  r._tabs.map(t => ({
          tab_id:     t.tab_id    || '',
          money:      Number(t.Money || 0),
          date_key:   t.DateTime  || '',
          status:     t.Status    || '',
          note:       t.Note      || '',
          paid:       t.Paid ? 1 : 0,
          group:      t.Groups    || '',
          repayments: repaymentMap[t.tab_id] || [],
        })),
      }));
      return res.json({ ok: true, loans });
    }

    /* ── Auth check for all write/read actions ── */
    const _bu = String((body.auth&&body.auth.u)||body.u||'').trim();
    const _bp = String((body.auth&&body.auth.p)||body.p||'').trim();
    const _bv = await validateAuth(_bu, _bp);
    if (!_bv || _bv.expired) return res.json({ ok:false, message:'auth_required', code:401 });
    const actor = _bv.name || '';
    db().query('UPDATE users SET last_seen=NOW() WHERE username=?', [_bu]).catch(()=>{});

    /* ── All data (loans + infor) ── */
    if (action === 'get_all') {
      await ensureCreatedByUserCol();
      await ensureSettingsTeamCol();
      const _sf = scopeFilterSQL(_bv, 'l.linked_to');
      const [loans] = await db().query(`SELECT l.*, u.display_name AS creator_display_name FROM loans l LEFT JOIN users u ON l.created_by_user = u.username WHERE l.deleted_at IS NULL${_sf.clause} ORDER BY l.loan_key DESC`, _sf.params);
      const [infor] = await db().query('SELECT type, value, created_by_team FROM settings ORDER BY id');
      /* Group & Linked To option lists are team-owned: a scoped user only sees entries their
         own team created (or shared/global ones with no owner). Status stays a shared default
         list for everyone regardless of scope. Admin/unscoped sees everything. */
      const _team = teamOwnerOf(_bv);
      const _scoped = _team !== null;
      const _visible = r => !_scoped || !r.created_by_team || r.created_by_team === _team;
      return res.json({
        ok:          true,
        loans:       loans.map(rowToLoan),
        groups:      infor.filter(r=>r.type==='groups' && _visible(r)).map(r=>r.value),
        statuses:    infor.filter(r=>r.type==='statuses').map(r=>r.value),
        socialMedia: infor.filter(r=>r.type==='socialMedia').map(r=>r.value),
        linkedTo:    infor.filter(r=>r.type==='linkedTo' && _visible(r)).map(r=>r.value),
      });
    }

    /* ── Borrower Profile (single loan + history by same NID) ── */
    if (action === 'loan_profile') {
      const key = String(body.key || '').trim();
      if (!key) return res.json({ ok: false, message: 'key required' });
      await ensureCreatedByUserCol();
      const [rows] = await db().query(
        `SELECT l.*, u.display_name AS creator_display_name FROM loans l LEFT JOIN users u ON l.created_by_user = u.username WHERE l.loan_key=? AND l.deleted_at IS NULL`,
        [key]
      );
      if (!rows.length) return res.json({ ok: false, message: 'Borrower not found' });
      const loan = rowToLoan(rows[0]);
      let history = [];
      const nid = rows[0].national_id;
      if (nid) {
        const [hist] = await db().query(
          `SELECT l.*, u.display_name AS creator_display_name FROM loans l LEFT JOIN users u ON l.created_by_user = u.username WHERE l.national_id=? AND l.deleted_at IS NULL ORDER BY l.loan_key DESC`,
          [nid]
        );
        history = hist.map(rowToLoan);
      }
      return res.json({ ok: true, loan, history });
    }

    /* ── Logout log ── */
    if (action === 'user_logout') {
      db().query("UPDATE users SET last_seen='2000-01-01 00:00:00' WHERE username=?", [_bu]).catch(()=>{});
      logActivity('user_logout', actor, _bu, null, null).catch(()=>{});
      return res.json({ ok: true });
    }

    /* ── Activity Log list ── */
    if (action === 'activity_list') {
      await ensureActivityLogTable();
      const isAdmin = ['Admin','Owner','Moderator'].includes(_bv.role);
      const limit  = Math.min(parseInt(body.limit||150, 10), 500);
      const offset = parseInt(body.offset||0, 10);
      const fAct   = String(body.filter_action||'').trim();
      /* Only Admin/Owner/Moderator can see all activity — others see own only */
      const fUser  = isAdmin ? String(body.filter_actor||'').trim() : _bu;
      await ensureUserPhotoCol();
      const params = [];
      const wheres = [];
      if (fAct)  { wheres.push('l.action=?');     params.push(fAct); }
      if (fUser) { wheres.push('l.actor_user=?'); params.push(fUser); }
      const whereClause = wheres.length ? ' WHERE ' + wheres.join(' AND ') : '';
      const orderLimit  = ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
      let logs;
      try {
        const sqlJoin = 'SELECT l.*, u.photo_url AS actor_photo, (SELECT b.photo_url FROM loans b WHERE b.full_name = l.target AND b.photo_url IS NOT NULL AND b.photo_url != \'\' ORDER BY b.loan_key DESC LIMIT 1) AS borrower_photo FROM activity_log l LEFT JOIN users u ON l.actor_user = u.username' + whereClause + orderLimit;
        const [rows] = await db().query(sqlJoin, [...params, limit, offset]);
        logs = rows;
      } catch(e) {
        /* Fallback: fetch without photo if JOIN fails */
        const sqlPlain = 'SELECT * FROM activity_log l' + whereClause + orderLimit;
        const [rows] = await db().query(sqlPlain, [...params, limit, offset]);
        logs = rows;
      }
      /* Total count respects same filter */
      let countSql = 'SELECT COUNT(*) AS total FROM activity_log l';
      const countParams = [];
      const countWheres = [];
      if (fAct)  { countWheres.push('l.action=?');     countParams.push(fAct); }
      if (fUser) { countWheres.push('l.actor_user=?'); countParams.push(fUser); }
      if (countWheres.length) countSql += ' WHERE ' + countWheres.join(' AND ');
      const [[tot]] = await db().query(countSql, countParams);
      return res.json({ ok: true, logs, total: tot.total, is_admin: isAdmin });
    }

    /* ── Infor only ── */
    if (action === 'get_settings') {
      const [infor] = await db().query('SELECT type, value FROM settings ORDER BY id');
      const one = (type) => (infor.find(r=>r.type===type)||{}).value || '';
      return res.json({
        ok:          true,
        groups:      infor.filter(r=>r.type==='groups').map(r=>r.value),
        statuses:    infor.filter(r=>r.type==='statuses').map(r=>r.value),
        socialMedia: infor.filter(r=>r.type==='socialMedia').map(r=>r.value),
        app_name:     one('app_name'),
        app_sub:      one('app_sub'),
        app_logo_url: one('app_logo_url'),
      });
    }

    /* ── Save brand ── */
    if (action === 'brand_save') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'Admin only', code:403 });
      const fields = ['app_name','app_sub','app_logo_url'];
      for (const f of fields) {
        await db().query('DELETE FROM settings WHERE type=?', [f]);
        const val = String(body[f]||'').trim();
        if (val) await db().query('INSERT INTO settings (type,value) VALUES (?,?)', [f, val]);
      }
      return res.json({ ok:true });
    }

    /* ── Trash list ── */
    if (action === 'loan_list_trash') {
      await ensureCreatedByUserCol();
      const [loans] = await db().query(`SELECT l.*, u.display_name AS creator_display_name FROM loans l LEFT JOIN users u ON l.created_by_user = u.username WHERE l.deleted_at IS NOT NULL ORDER BY l.deleted_at DESC`);
      return res.json({ ok:true, loans: loans.map(rowToLoan) });
    }

    /* ── Add infor (Group/Linked To entries are owned by the creating team, if scoped) ── */
    if (action === 'settings_add') {
      const type  = String(body.type ||'').trim();
      const value = String(body.value||'').trim();
      if (!type || !value) return res.json({ ok:false, message:'Missing type or value' });
      await ensureSettingsTeamCol();
      const team = (type === 'groups' || type === 'linkedTo') ? teamOwnerOf(_bv) : null;
      const [r] = await db().query('INSERT IGNORE INTO settings (type, value, created_by_team) VALUES (?,?,?)', [type, value, team]);
      /* If this Linked To tag is brand new and team-owned, auto-grant it into that team's own scope
         so the Sub Admin doesn't have to ask an Admin to grant what they just created themselves. */
      if (type === 'linkedTo' && team && r.affectedRows > 0) {
        const [rows] = await db().query('SELECT scope_linked_to FROM users WHERE username=?', [team]);
        if (rows.length) {
          let arr = [];
          try { arr = rows[0].scope_linked_to ? JSON.parse(rows[0].scope_linked_to) : []; } catch(e) { arr = []; }
          if (!Array.isArray(arr)) arr = [];
          if (!arr.includes(value)) {
            arr.push(value);
            await db().query('UPDATE users SET scope_linked_to=? WHERE username=?', [JSON.stringify(arr), team]);
          }
        }
      }
      return res.json({ ok:true });
    }

    /* ── Delete infor (a scoped user may only delete Group/Linked To entries their own team created) ── */
    if (action === 'settings_delete') {
      const type  = String(body.type||'').trim();
      const value = String(body.value||'').trim();
      await ensureSettingsTeamCol();
      const team = teamOwnerOf(_bv);
      if (team && (type === 'groups' || type === 'linkedTo')) {
        const [rows] = await db().query('SELECT created_by_team FROM settings WHERE type=? AND value=?', [type, value]);
        if (rows.length && rows[0].created_by_team !== team) {
          return res.json({ ok:false, message:'អ្នកអាចលុបបានតែឈ្មោះដែលក្រុមអ្នកបានបង្កើត', code:403 });
        }
      }
      await db().query('DELETE FROM settings WHERE type=? AND value=?', [type, value]);
      return res.json({ ok:true });
    }

    /* ── Add loan ── */
    if (action === 'loan_add') {
      if (_bv.role === 'Viewer') return res.json({ ok:false, message:'Permission denied', code:403 });
      await ensureSocialLinksCol();
      await ensurePaidCol();
      await ensureCreatedByCol();
      await ensureCreatedByUserCol();
      await ensureLinkedToCol();
      await ensureRestrictedCol();
      const l = body.loan || {};
      const datePart = l.DateTime ? l.DateTime.substring(0, 10) : new Date().toISOString().substring(0, 10);
      const key = datePart + 'T' + new Date().toISOString().substring(11);
      const photosJson = Array.isArray(l.photos) && l.photos.length ? JSON.stringify(l.photos) : null;
      const slJson = Array.isArray(l.social_links) && l.social_links.length ? JSON.stringify(l.social_links) : null;
      const sl0 = (l.social_links||[])[0] || {};
      const restricted = (_bv.role === 'Admin' && l.Restricted) ? 1 : 0;
      await db().query(
        `INSERT INTO loans
           (loan_key,full_name,national_id,dob,phone,gender,loan_group,money,loan_status,note,fb_name,fb_url,social_media,social_id,fbid,photo_url,photos,social_links,paid,created_by,created_by_user,linked_to,restricted)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [key, l.FullName||'', l.NationalID||'', l.DOB||'', l.Phone||'',
         l.Gender||'', l.Groups||'', l.Money||0, l.Status||'Normal',
         l.Note||'', sl0.name||l.FBName||'', sl0.url||l.URL||'', sl0.platform||l.FacebookCom||'', sl0.id||l.ID||'', sl0.fbid||l.FBID||'',
         l.photo_url||null, photosJson, slJson, l.Paid ? 1 : 0, actor||null, _bu||null, l.LinkedTo||null, restricted]
      );
      const [rows] = await db().query('SELECT * FROM loans WHERE loan_key=?', [key]);
      if ((await isWatched(_bu)) && (await isNotifEnabled('add'))) { try { await sendTelegram(rows[0], 'add', actor); } catch(e) {} }
      logActivity('loan_add', actor, _bu, l.FullName||'', { money: l.Money||0, status: l.Status||'Normal' }).catch(()=>{});
      return res.json({ ok:true });
    }

    /* ── Update loan ── */
    if (action === 'loan_update') {
      if (_bv.role === 'Viewer') return res.json({ ok:false, message:'Permission denied', code:403 });
      await ensureSocialLinksCol();
      await ensurePaidCol();
      await ensureLinkedToCol();
      await ensureLoanTabsCol();
      await ensureRestrictedCol();
      const key = String(body.key||'').trim();
      const l   = body.loan || {};
      const [old] = await db().query('SELECT * FROM loans WHERE loan_key=? AND deleted_at IS NULL', [key]);
      if (!old.length) return res.json({ ok:false, message:'Row not found' });
      const newKey = l.DateTime || key;
      const photosJsonU   = Array.isArray(l.photos) && l.photos.length ? JSON.stringify(l.photos) : null;
      const slJsonU       = Array.isArray(l.social_links) && l.social_links.length ? JSON.stringify(l.social_links) : null;
      const loanTabsJsonU = Array.isArray(l.loan_tabs) ? JSON.stringify(l.loan_tabs) : null;
      const sl0u = (l.social_links||[])[0] || {};
      /* Only Admin can change the restricted flag; everyone else preserves whatever it already was */
      const restrictedU = _bv.role === 'Admin' ? (l.Restricted ? 1 : 0) : (old[0].restricted ? 1 : 0);
      await db().query(
        `UPDATE loans SET
           loan_key=?,full_name=?,national_id=?,dob=?,phone=?,gender=?,loan_group=?,
           money=?,loan_status=?,note=?,fb_name=?,fb_url=?,social_media=?,social_id=?,fbid=?,
           photo_url=?,photos=?,social_links=?,paid=?,linked_to=?,loan_tabs=?,restricted=?
         WHERE loan_key=? AND deleted_at IS NULL`,
        [newKey, l.FullName||'', l.NationalID||'', l.DOB||'', l.Phone||'',
         l.Gender||'', l.Groups||'', l.Money||0, l.Status||'Normal',
         l.Note||'', sl0u.name||l.FBName||'', sl0u.url||l.URL||'', sl0u.platform||l.FacebookCom||'', sl0u.id||l.ID||'', sl0u.fbid||l.FBID||'',
         l.photo_url||null, photosJsonU, slJsonU, l.Paid ? 1 : 0, l.LinkedTo||null, loanTabsJsonU, restrictedU, key]
      );
      const [updated] = await db().query('SELECT * FROM loans WHERE loan_key=?', [newKey]);
      if ((await isWatched(_bu)) && (await isNotifEnabled('edit'))) { try { await sendTelegram(updated[0], 'edit', actor, old[0]); } catch(e) {} }
      logActivity('loan_edit', actor, _bu, l.FullName||'', { key: newKey }).catch(()=>{});
      return res.json({ ok:true, message:'Updated' });
    }

    /* ── Toggle paid ── */
    if (action === 'loan_toggle_paid') {
      await ensurePaidCol();
      const key = String(body.key||'').trim();
      const [rows] = await db().query('SELECT paid, full_name FROM loans WHERE loan_key=? AND deleted_at IS NULL', [key]);
      if (!rows.length) return res.json({ ok:false, message:'Row not found' });
      const newPaid = rows[0].paid ? 0 : 1;
      await db().query('UPDATE loans SET paid=? WHERE loan_key=?', [newPaid, key]);
      logActivity('loan_paid', actor, _bu, rows[0].full_name||'', { paid: newPaid }).catch(()=>{});
      return res.json({ ok:true, paid: newPaid });
    }

    /* ── Delete loan (soft) ── */
    if (action === 'loan_delete') {
      if (!['Admin','Owner','Moderator'].includes(_bv.role)) return res.json({ ok:false, message:'Permission denied', code:403 });
      const key = String(body.key||'').trim();
      const [rows] = await db().query('SELECT * FROM loans WHERE loan_key=? AND deleted_at IS NULL', [key]);
      if (!rows.length) return res.json({ ok:false, message:'Row not found' });
      await db().query('UPDATE loans SET deleted_at=NOW() WHERE loan_key=?', [key]);
      if ((await isWatched(_bu)) && (await isNotifEnabled('delete'))) { try { await sendTelegram(rows[0], 'delete', actor); } catch(e) {} }
      logActivity('loan_delete', actor, _bu, rows[0].full_name||'', { key }).catch(()=>{});
      return res.json({ ok:true, message:'Deleted' });
    }

    /* ── Recover loan ── */
    if (action === 'loan_recover') {
      const key = String(body.key||'').trim();
      const [trashRow] = await db().query('SELECT full_name FROM loans WHERE loan_key=? AND deleted_at IS NOT NULL', [key]);
      const [r] = await db().query(
        'UPDATE loans SET deleted_at=NULL WHERE loan_key=? AND deleted_at IS NOT NULL', [key]);
      if (r.affectedRows > 0) logActivity('loan_recover', actor, _bu, trashRow[0]&&trashRow[0].full_name||'', { key }).catch(()=>{});
      return res.json({ ok: r.affectedRows > 0, message: r.affectedRows > 0 ? 'Recovered' : 'Not found in trash' });
    }

    /* ── Permanent delete ── */
    if (action === 'loan_perm_delete') {
      if (!['Admin','Owner','Moderator'].includes(_bv.role)) return res.json({ ok:false, message:'Permission denied', code:403 });
      const key = String(body.key||'').trim();
      const [r] = await db().query(
        'DELETE FROM loans WHERE loan_key=? AND deleted_at IS NOT NULL', [key]);
      return res.json({ ok: r.affectedRows > 0, message: r.affectedRows > 0 ? 'Deleted' : 'Not found' });
    }

    /* ── Repayment entries table ── */
    async function ensureRepaymentsTable() {
      await db().query(`CREATE TABLE IF NOT EXISTS repayments (
        id       INT AUTO_INCREMENT PRIMARY KEY,
        loan_key VARCHAR(255) NOT NULL,
        type     ENUM('payment','discount') NOT NULL DEFAULT 'payment',
        amount   DECIMAL(10,2) NOT NULL DEFAULT 0,
        paid_at  DATETIME NOT NULL,
        note     TEXT,
        created_at DATETIME DEFAULT NOW(),
        INDEX idx_rp_key (loan_key)
      )`).catch(()=>{});
    }

    /* ── List repayment entries ── */
    if (action === 'repayment_list') {
      const key = String(body.key||'').trim();
      if (!key) return res.json({ ok:false, message:'key required' });
      await ensureRepaymentsTable();
      const [rows] = await db().query('SELECT * FROM repayments WHERE loan_key=? ORDER BY paid_at ASC', [key]);
      return res.json({ ok:true, entries: rows });
    }

    /* ── Add repayment entry ── */
    if (action === 'repayment_add') {
      if (_bv.role === 'Viewer') return res.json({ ok:false, message:'Permission denied', code:403 });
      const key    = String(body.key||'').trim();
      const type   = body.type === 'discount' ? 'discount' : 'payment';
      const amount = parseFloat(body.amount)||0;
      const paidAt = String(body.paid_at||'').trim() || new Date().toISOString().replace('T',' ').substring(0,19);
      const note   = String(body.note||'').trim();
      if (!key || amount <= 0) return res.json({ ok:false, message:'key and amount required' });
      await ensureRepaymentsTable();
      const [r] = await db().query(
        'INSERT INTO repayments (loan_key, type, amount, paid_at, note) VALUES (?,?,?,?,?)',
        [key, type, amount, paidAt, note||null]
      );
      logActivity('repayment_add', actor, _bu, key, { type, amount }).catch(()=>{});
      return res.json({ ok:true, id: r.insertId });
    }

    /* ── Delete repayment entry ── */
    if (action === 'repayment_delete') {
      if (_bv.role === 'Viewer') return res.json({ ok:false, message:'Permission denied', code:403 });
      const id = parseInt(body.id)||0;
      if (!id) return res.json({ ok:false, message:'id required' });
      await ensureRepaymentsTable();
      await db().query('DELETE FROM repayments WHERE id=?', [id]);
      return res.json({ ok:true });
    }

    /* ── Journal: habit + note tables ── */
    async function ensureJournalTables() {
      await db().query(`CREATE TABLE IF NOT EXISTS habits (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        owner_user VARCHAR(100) NOT NULL,
        name       VARCHAR(255) NOT NULL,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_owner (owner_user)
      )`).catch(()=>{});
      await db().query(`CREATE TABLE IF NOT EXISTS habit_logs (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        habit_id   INT NOT NULL,
        owner_user VARCHAR(100) NOT NULL,
        log_date   DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_habit_date (habit_id, log_date),
        INDEX idx_owner_date (owner_user, log_date)
      )`).catch(()=>{});
      await db().query(`CREATE TABLE IF NOT EXISTS journal_notes (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        owner_user VARCHAR(100) NOT NULL,
        scope      ENUM('year','month','week','day','hour') NOT NULL,
        note_date  DATE NOT NULL,
        note_hour  TINYINT NOT NULL DEFAULT -1,
        content    TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_note (owner_user, scope, note_date, note_hour),
        INDEX idx_owner_scope (owner_user, scope, note_date)
      )`).catch(()=>{});
    }

    /* ── List habits (personal, owned by the logged-in user) ── */
    if (action === 'habit_list') {
      await ensureJournalTables();
      const [rows] = await db().query('SELECT id, name, sort_order FROM habits WHERE owner_user=? ORDER BY sort_order ASC, id ASC', [_bu]);
      return res.json({ ok:true, habits: rows });
    }

    /* ── Add habit ── */
    if (action === 'habit_add') {
      const name = String(body.name||'').trim();
      if (!name) return res.json({ ok:false, message:'name required' });
      await ensureJournalTables();
      const [cnt] = await db().query('SELECT COUNT(*) AS n FROM habits WHERE owner_user=?', [_bu]);
      const [r] = await db().query('INSERT INTO habits (owner_user, name, sort_order) VALUES (?,?,?)', [_bu, name, cnt[0].n]);
      return res.json({ ok:true, id: r.insertId });
    }

    /* ── Delete habit (+ its logs) ── */
    if (action === 'habit_delete') {
      const id = parseInt(body.id)||0;
      if (!id) return res.json({ ok:false, message:'id required' });
      await ensureJournalTables();
      await db().query('DELETE FROM habit_logs WHERE habit_id=? AND owner_user=?', [id, _bu]);
      await db().query('DELETE FROM habits WHERE id=? AND owner_user=?', [id, _bu]);
      return res.json({ ok:true });
    }

    /* ── Toggle a habit's completion for one date ── */
    if (action === 'habit_toggle') {
      const habitId = parseInt(body.habit_id)||0;
      const date    = String(body.date||'').trim();
      if (!habitId || !date) return res.json({ ok:false, message:'habit_id and date required' });
      await ensureJournalTables();
      const [existing] = await db().query('SELECT id FROM habit_logs WHERE habit_id=? AND owner_user=? AND log_date=?', [habitId, _bu, date]);
      if (existing.length) {
        await db().query('DELETE FROM habit_logs WHERE id=?', [existing[0].id]);
        return res.json({ ok:true, done:false });
      }
      await db().query('INSERT INTO habit_logs (habit_id, owner_user, log_date) VALUES (?,?,?)', [habitId, _bu, date]);
      return res.json({ ok:true, done:true });
    }

    /* ── Habit completion logs within a date range ── */
    if (action === 'habit_logs_range') {
      const from = String(body.from||'').trim();
      const to   = String(body.to||'').trim();
      if (!from || !to) return res.json({ ok:false, message:'from and to required' });
      await ensureJournalTables();
      const [rows] = await db().query('SELECT habit_id, log_date FROM habit_logs WHERE owner_user=? AND log_date BETWEEN ? AND ?', [_bu, from, to]);
      return res.json({ ok:true, logs: rows });
    }

    /* ── Reset (clear) all habit check-ins within a date range ── */
    if (action === 'habit_reset_range') {
      const from = String(body.from||'').trim();
      const to   = String(body.to||'').trim();
      if (!from || !to) return res.json({ ok:false, message:'from and to required' });
      await ensureJournalTables();
      await db().query('DELETE FROM habit_logs WHERE owner_user=? AND log_date BETWEEN ? AND ?', [_bu, from, to]);
      return res.json({ ok:true });
    }

    /* ── Get one journal note ── */
    if (action === 'note_get') {
      const scope = String(body.scope||'').trim();
      const date  = String(body.date||'').trim();
      const hour  = (body.hour !== undefined && body.hour !== null && body.hour !== '') ? parseInt(body.hour) : -1;
      if (!['year','month','week','day','hour'].includes(scope) || !date) return res.json({ ok:false, message:'scope and date required' });
      await ensureJournalTables();
      const [rows] = await db().query('SELECT content FROM journal_notes WHERE owner_user=? AND scope=? AND note_date=? AND note_hour=?', [_bu, scope, date, hour]);
      return res.json({ ok:true, content: rows.length ? (rows[0].content||'') : '' });
    }

    /* ── Save (upsert) a journal note ── */
    if (action === 'note_save') {
      const scope   = String(body.scope||'').trim();
      const date    = String(body.date||'').trim();
      const hour    = (body.hour !== undefined && body.hour !== null && body.hour !== '') ? parseInt(body.hour) : -1;
      const content = String(body.content||'');
      if (!['year','month','week','day','hour'].includes(scope) || !date) return res.json({ ok:false, message:'scope and date required' });
      await ensureJournalTables();
      await db().query(
        `INSERT INTO journal_notes (owner_user, scope, note_date, note_hour, content) VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE content=VALUES(content), updated_at=NOW()`,
        [_bu, scope, date, hour, content]
      );
      return res.json({ ok:true });
    }

    /* ── Messages ── */
    async function ensureMessagesTable() {
      await db().query(`CREATE TABLE IF NOT EXISTS messages (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        sender      VARCHAR(100) NOT NULL,
        recipient   VARCHAR(100) NOT NULL,
        body        TEXT,
        image_url   VARCHAR(1000),
        is_read     TINYINT(1) DEFAULT 0,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_conv (sender(50), recipient(50)),
        INDEX idx_recv (recipient(50), is_read)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }

    if (action === 'msg_send') {
      await ensureMessagesTable();
      const to  = String(body.to  || '').trim();
      const txt = String(body.body || '').trim();
      const img = String(body.image_url || '').trim();
      if (!to)          return res.json({ ok:false, message:'Missing recipient' });
      if (!txt && !img) return res.json({ ok:false, message:'Message is empty' });
      const [ins] = await db().query(
        'INSERT INTO messages (sender, recipient, body, image_url) VALUES (?,?,?,?)',
        [_bu, to, txt||null, img||null]
      );
      return res.json({ ok:true, id: ins.insertId });
    }

    if (action === 'msg_list') {
      await ensureMessagesTable();
      const w = String(body.with || '').trim();
      if (!w) return res.json({ ok:false, message:'Missing with' });
      await db().query(
        'UPDATE messages SET is_read=1 WHERE sender=? AND recipient=? AND is_read=0',
        [w, _bu]
      );
      const [msgs] = await db().query(
        `SELECT id, sender, recipient, body, image_url, is_read, created_at
         FROM messages
         WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)
         ORDER BY created_at ASC LIMIT 150`,
        [_bu, w, w, _bu]
      );
      return res.json({ ok:true, messages: msgs });
    }

    if (action === 'msg_unread') {
      await ensureMessagesTable();
      const [rows] = await db().query(
        `SELECT hm.sender, COUNT(*) AS cnt,
                COALESCE(hu.display_name, hm.sender) AS display_name,
                COALESCE(hu.photo_url, '') AS photo_url
         FROM messages hm
         LEFT JOIN users hu
           ON hu.username COLLATE utf8mb4_unicode_ci = hm.sender COLLATE utf8mb4_unicode_ci
         WHERE hm.recipient=? AND hm.is_read=0
         GROUP BY hm.sender, hu.display_name, hu.photo_url`,
        [_bu]
      );
      const counts = {};
      const unread = rows.map(r => {
        counts[r.sender] = Number(r.cnt);
        return { sender: r.sender, count: Number(r.cnt), display_name: r.display_name || r.sender, photo_url: r.photo_url || '' };
      });
      return res.json({ ok:true, counts, unread });
    }

    /* ── Team list (scoped: Admin sees all; Sub Admin sees self + users they created; everyone else sees only self) ── */
    if (action === 'team_list') {
      await ensureUserPhotoCol();
      await ensureUserScopeCols();
      let teamWhere = '';
      let teamParams = [];
      if (_bv.role === 'Sub Admin') { teamWhere = 'WHERE u.created_by=? OR u.username=?'; teamParams = [_bu, _bu]; }
      else if (_bv.role !== 'Admin') { teamWhere = 'WHERE u.username=?'; teamParams = [_bu]; }
      const [users] = await db().query(`
        SELECT u.username, u.display_name, u.role, u.photo_url, u.exp_date, u.status, u.last_seen,
          u.created_by, u.max_normal_users,
          COALESCE(s.loans_added, 0)  AS loans_added,
          COALESCE(s.loans_edited, 0) AS loans_edited,
          s.last_login
        FROM users u
        LEFT JOIN (
          SELECT actor_user,
            SUM(CASE WHEN action='loan_add' THEN 1 ELSE 0 END)                              AS loans_added,
            SUM(CASE WHEN action IN ('loan_edit','loan_paid','loan_recover') THEN 1 ELSE 0 END) AS loans_edited,
            MAX(CASE WHEN action='user_login' THEN created_at ELSE NULL END)                 AS last_login
          FROM activity_log
          GROUP BY actor_user
        ) s ON s.actor_user COLLATE utf8mb4_unicode_ci = u.username COLLATE utf8mb4_unicode_ci
        ${teamWhere}
        ORDER BY u.display_name
      `, teamParams);
      return res.json({ ok: true, users });
    }

    /* ── User list (Admin only) ── */
    if (action === 'user_list') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
      await ensureUserPhotoCol();
      await ensureUserScopeCols();
      const [users] = await db().query(
        'SELECT username, role, display_name, exp_date, status, last_seen, photo_url, scope_linked_to, max_normal_users, created_by FROM users ORDER BY id'
      );
      users.forEach(u => { try { u.scope_linked_to = u.scope_linked_to ? JSON.parse(u.scope_linked_to) : []; } catch(e) { u.scope_linked_to = []; } });
      return res.json({ ok:true, users });
    }

    /* ── User add (Admin, or Sub Admin creating a scoped Normal User within quota) ── */
    if (action === 'user_add') {
      const _NORMAL_ROLES = ['Staff Loan','Staff','Moderator','Viewer','Tester'];
      if (!['Admin','Sub Admin'].includes(_bv.role)) return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
      await ensureUserScopeCols();
      const u = String(body.username||'').trim();
      const p = String(body.pin||'').trim();
      if (!u || !p) return res.json({ ok:false, message:'Username និង PIN ត្រូវការ' });

      let role = String(body.role||'Staff Loan');
      let scopeGroupsJson = null;
      let maxNormalUsers  = 0;
      let createdBy       = null;

      if (_bv.role === 'Sub Admin') {
        if (!_NORMAL_ROLES.includes(role)) return res.json({ ok:false, message:'Sub Admin អាចបង្កើតបានតែ Normal User' });
        const [cnt] = await db().query('SELECT COUNT(*) AS n FROM users WHERE created_by=?', [_bu]);
        if (cnt[0].n >= (_bv.max_normal_users||0)) return res.json({ ok:false, message:'ដល់កំណត់ចំនួន User អតិបរមាហើយ (quota exceeded)' });
        scopeGroupsJson = JSON.stringify(_bv.scope_linked_to||[]);
        createdBy = _bu;
      } else if (role === 'Sub Admin') {
        /* Admin granting scope/quota to a new Sub Admin */
        const g = Array.isArray(body.scope_linked_to) ? body.scope_linked_to : [];
        scopeGroupsJson = JSON.stringify(g);
        maxNormalUsers  = parseInt(body.max_normal_users)||0;
      }

      try {
        await db().query(
          'INSERT INTO users (username, pin, role, display_name, exp_date, status, scope_linked_to, max_normal_users, created_by) VALUES (?,?,?,?,?,?,?,?,?)',
          [u, p, role, String(body.display_name||u).trim(),
           body.exp_date||null, body.status||'active', scopeGroupsJson, maxNormalUsers, createdBy]
        );
      } catch(e) {
        if (e.code === 'ER_DUP_ENTRY') return res.json({ ok:false, message:'Username "'+u+'" មានរួចហើយ' });
        throw e;
      }
      if (await isNotifEnabled('user')) { try { await sendTelegramEvent('user', { act:'add', username:u, display_name:String(body.display_name||u).trim(), role, status:body.status||'active', actor }); } catch(e) {} }
      logActivity('user_add', actor, _bu, u, { display_name: String(body.display_name||u).trim(), role }).catch(()=>{});
      return res.json({ ok:true });
    }

    /* ── User update (Admin, or Sub Admin editing a user they created) ── */
    if (action === 'user_update') {
      const _NORMAL_ROLES = ['Staff Loan','Staff','Moderator','Viewer','Tester'];
      if (!['Admin','Sub Admin'].includes(_bv.role)) return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
      await ensureUserScopeCols();
      const u = String(body.username||'').trim();
      if (!u) return res.json({ ok:false, message:'Username required' });
      const [oldRows] = await db().query('SELECT display_name, created_by FROM users WHERE username=?', [u]);
      if (!oldRows.length) return res.json({ ok:false, message:'User not found' });
      if (_bv.role === 'Sub Admin' && oldRows[0].created_by !== _bu) {
        return res.json({ ok:false, message:'អ្នកអាចកែបានតែ User ដែលអ្នកបានបង្កើត', code:403 });
      }
      const oldDisplayName = oldRows[0].display_name || '';
      const newDisplayName = String(body.display_name||u).trim();
      let role = String(body.role||'Staff Loan');
      if (_bv.role === 'Sub Admin' && !_NORMAL_ROLES.includes(role)) {
        return res.json({ ok:false, message:'Sub Admin អាចកំណត់បានតែ role Normal User' });
      }
      const p = String(body.pin||'').trim();
      if (p) {
        await db().query(
          'UPDATE users SET pin=?,role=?,display_name=?,exp_date=?,status=? WHERE username=?',
          [p, role, newDisplayName, body.exp_date||null, body.status||'active', u]
        );
      } else {
        await db().query(
          'UPDATE users SET role=?,display_name=?,exp_date=?,status=? WHERE username=?',
          [role, newDisplayName, body.exp_date||null, body.status||'active', u]
        );
      }
      if (_bv.role === 'Admin' && role === 'Sub Admin' && (body.scope_linked_to !== undefined || body.max_normal_users !== undefined)) {
        const g = Array.isArray(body.scope_linked_to) ? body.scope_linked_to : [];
        await db().query('UPDATE users SET scope_linked_to=?, max_normal_users=? WHERE username=?', [JSON.stringify(g), parseInt(body.max_normal_users)||0, u]);
      }
      if (oldDisplayName && newDisplayName && oldDisplayName !== newDisplayName) {
        await db().query('UPDATE loans SET created_by=? WHERE created_by=?', [newDisplayName, oldDisplayName]);
      }
      if (await isNotifEnabled('user')) { try { await sendTelegramEvent('user', { act:'edit', username:u, display_name:newDisplayName, role:String(body.role||'Staff Loan'), status:body.status||'active', actor }); } catch(e) {} }
      logActivity('user_edit', actor, _bu, u, { old_name: oldDisplayName, new_name: newDisplayName }).catch(()=>{});
      return res.json({ ok:true });
    }

    /* ── User delete (Admin, or Sub Admin deleting a user they created; cannot delete self) ── */
    if (action === 'user_delete') {
      if (!['Admin','Sub Admin'].includes(_bv.role)) return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
      const u = String(body.username||'').trim();
      if (!u) return res.json({ ok:false, message:'Username required' });
      if (u === _bu) return res.json({ ok:false, message:'មិនអាចលុប Account ខ្លួនឯងបាន' });
      if (_bv.role === 'Sub Admin') {
        const [chk] = await db().query('SELECT created_by FROM users WHERE username=?', [u]);
        if (!chk.length || chk[0].created_by !== _bu) return res.json({ ok:false, message:'អ្នកអាចលុបបានតែ User ដែលអ្នកបានបង្កើត', code:403 });
      }
      await db().query('DELETE FROM users WHERE username=?', [u]);
      if (await isNotifEnabled('user')) { try { await sendTelegramEvent('user', { act:'delete', username:u, actor }); } catch(e) {} }
      logActivity('user_delete', actor, _bu, u, null).catch(()=>{});
      return res.json({ ok:true });
    }

    /* ── Admin update user photo ── */
    if (action === 'user_update_photo') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'Admin access required', code:403 });
      const u = String(body.username||'').trim();
      if (!u) return res.json({ ok:false, message:'Username required' });
      await ensureUserPhotoCol();
      const photoUrl = String(body.photo_url||'').trim();
      await db().query('UPDATE users SET photo_url=? WHERE username=?', [photoUrl || null, u]);
      return res.json({ ok:true });
    }

    /* ── Self update profile (any authenticated user) ── */
    if (action === 'user_self_update') {
      const type = String(body.type || '').trim();

      if (type === 'photo') {
        await ensureUserPhotoCol();
        const photoUrl = String(body.photo_url || '').trim();
        await db().query('UPDATE users SET photo_url=? WHERE username=?', [photoUrl || null, _bu]);
        return res.json({ ok: true });
      }

      if (type === 'profile' || type === 'pin') {
        const currentPin = String(body.current_pin || '').trim();
        if (!currentPin) return res.json({ ok: false, message: 'PIN បច្ចុប្បន្នត្រូវការ' });
        const [pinRow] = await db().query(
          'SELECT pin FROM users WHERE username=? AND status="active"', [_bu]
        );
        if (!pinRow.length || pinRow[0].pin !== currentPin) return res.json({ ok: false, message: 'PIN មិនត្រូវ' });

        if (type === 'pin') {
          const newPin = String(body.new_pin || '').trim();
          if (!newPin) return res.json({ ok: false, message: 'PIN ថ្មីត្រូវការ' });
          await db().query('UPDATE users SET pin=? WHERE username=?', [newPin, _bu]);
          return res.json({ ok: true });
        }

        if (type === 'profile') {
          const displayName = String(body.display_name || '').trim();
          const newUsername = String(body.new_username || '').trim();
          if (!displayName && (!newUsername || newUsername === _bu))
            return res.json({ ok: false, message: 'គ្មានព័ត៌មានត្រូវធ្វើបច្ចុប្បន្ន' });
          if (newUsername && newUsername !== _bu) {
            const [ex] = await db().query('SELECT 1 FROM users WHERE username=?', [newUsername]);
            if (ex.length) return res.json({ ok: false, message: 'Username "'+newUsername+'" មានរួចហើយ' });
            const finalName = displayName || _bv.name || _bu;
            await db().query(
              'UPDATE users SET username=?, display_name=? WHERE username=?',
              [newUsername, finalName, _bu]
            );
            // Keep loan references in sync
            await db().query('UPDATE loans SET created_by_user=? WHERE created_by_user=?', [newUsername, _bu]);
            const oldName = _bv.name || '';
            if (oldName && finalName !== oldName) {
              await db().query('UPDATE loans SET created_by=? WHERE created_by=?', [finalName, oldName]);
            }
            return res.json({ ok: true, username: newUsername, display_name: finalName });
          }
          await db().query('UPDATE users SET display_name=? WHERE username=?', [displayName, _bu]);
          // Backfill old loan records that stored the old display name
          const oldDisplayName = _bv.name || '';
          if (oldDisplayName && displayName !== oldDisplayName) {
            await db().query('UPDATE loans SET created_by=? WHERE created_by=?', [displayName, oldDisplayName]);
          }
          return res.json({ ok: true, username: _bu, display_name: displayName });
        }
      }

      return res.json({ ok: false, message: 'Invalid type' });
    }

    /* ── UI Preferences: get (any authenticated user, own prefs only) ── */
    if (action === 'ui_prefs_get') {
      await ensureUiPrefsCol();
      const [rows] = await db().query('SELECT ui_prefs FROM users WHERE username=?', [_bu]);
      if (!rows.length) return res.json({ ok: true, prefs: {} });
      let prefs = {};
      try { prefs = JSON.parse(rows[0].ui_prefs || '{}'); } catch(e) {}
      return res.json({ ok: true, prefs });
    }

    /* ── UI Preferences: set (any authenticated user, own prefs only) ── */
    if (action === 'ui_prefs_set') {
      await ensureUiPrefsCol();
      const incoming = body.prefs;
      if (!incoming || typeof incoming !== 'object') return res.json({ ok: false, message: 'Invalid prefs' });
      /* Merge with existing prefs so other keys are preserved */
      const [rows] = await db().query('SELECT ui_prefs FROM users WHERE username=?', [_bu]);
      let existing = {};
      try { existing = JSON.parse((rows[0]||{}).ui_prefs || '{}'); } catch(e) {}
      const merged = Object.assign({}, existing, incoming);
      await db().query('UPDATE users SET ui_prefs=? WHERE username=?', [JSON.stringify(merged), _bu]);
      return res.json({ ok: true });
    }

    /* ── Permission matrix defaults ── */
    function defaultPerms() {
      return {
        settings: ['Admin'],
        write:    ['Admin','Owner','Staff Loan','Staff','Moderator','Tester'],
        delete:   ['Admin','Owner','Moderator'],
        reports:  ['Admin','Owner','Staff Loan','Staff','Moderator','Viewer'],
        actAll:   ['Admin','Owner','Moderator'],
        actOwn:   ['Admin','Owner','Staff Loan','Staff','Moderator','Viewer','Tester']
      };
    }

    /* ── Get role permissions ── */
    if (action === 'perms_get') {
      const [rows] = await db().query('SELECT type, value FROM settings WHERE type LIKE "perm_%"');
      if (!rows.length) return res.json({ ok:true, perms: defaultPerms() });
      const perms = {};
      rows.forEach(r => {
        const key = r.type.slice(5); /* strip "perm_" prefix */
        try { perms[key] = JSON.parse(r.value); } catch(e) {}
      });
      return res.json({ ok:true, perms });
    }

    /* ── Save role permissions (Admin only) ── */
    if (action === 'perms_set') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'Admin only', code:403 });
      const perms = body.perms;
      if (!perms || typeof perms !== 'object') return res.json({ ok:false, message:'perms required' });
      if (!Array.isArray(perms.settings)) perms.settings = ['Admin'];
      if (!perms.settings.includes('Admin')) perms.settings = ['Admin', ...perms.settings];
      await db().query('DELETE FROM settings WHERE type LIKE "perm_%"');
      for (const [key, val] of Object.entries(perms)) {
        await db().query('INSERT INTO settings (type, value) VALUES (?, ?)', ['perm_'+key, JSON.stringify(val)]);
      }
      logActivity('perms_update', actor, _bu, null, {}).catch(()=>{});
      return res.json({ ok:true });
    }

    /* ── Get page access settings ── */
    if (action === 'page_access_get') {
      const [rows] = await db().query('SELECT type, value FROM settings WHERE type LIKE "pageaccess_%"');
      if (!rows.length) return res.json({ ok:true, access: null });
      const access = {};
      rows.forEach(r => {
        const key = r.type.slice(11); /* strip "pageaccess_" prefix */
        try { access[key] = JSON.parse(r.value); } catch(e) {}
      });
      return res.json({ ok:true, access });
    }

    /* ── Save page access settings (Admin only) ── */
    if (action === 'page_access_set') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'Admin only', code:403 });
      const access = body.access;
      if (!access || typeof access !== 'object') return res.json({ ok:false, message:'access required' });
      const ALL_PAGES = ['dashboard','customers','loanlist','reports','repayment','fbid','activitylog','team','borrowerprofile','settings'];
      for (const p of ALL_PAGES) {
        if (!Array.isArray(access[p])) access[p] = ['Admin','Owner','Staff Loan','Staff','Moderator','Viewer','Tester'];
        if (!access[p].includes('Admin')) access[p].unshift('Admin');
      }
      access.settings = ['Admin'];
      await db().query('DELETE FROM settings WHERE type LIKE "pageaccess_%"');
      for (const [key, val] of Object.entries(access)) {
        if (ALL_PAGES.includes(key)) {
          await db().query('INSERT INTO settings (type, value) VALUES (?, ?)', ['pageaccess_'+key, JSON.stringify(val)]);
        }
      }
      logActivity('page_access_update', actor, _bu, null, {}).catch(()=>{});
      return res.json({ ok:true });
    }

    /* ── Verify current user's PIN ── */
    if (action === 'verify_pin') {
      const pin = String(body.pin || '').trim();
      if (!pin) return res.json({ ok:false });
      const [rows] = await db().query(
        'SELECT 1 FROM users WHERE username=? AND pin=? AND status="active" LIMIT 1',
        [_bu, pin]
      );
      return res.json({ ok: rows.length > 0 });
    }

    /* ── Telegram config get ── */
    if (action === 'tg_config_get') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'Admin only', code:403 });
      const [rows] = await db().query("SELECT type, value FROM settings WHERE type IN ('tg_bot_token','tg_chat_id')");
      const m = {};
      rows.forEach(r => { m[r.type] = r.value; });
      const dbBot  = m.tg_bot_token || '';
      const dbChat = m.tg_chat_id   || '';
      const envSet = !!(TG_BOT_TOKEN || TG_CHAT_ID);
      return res.json({ ok:true, bot_token: dbBot || TG_BOT_TOKEN, chat_id: dbChat || TG_CHAT_ID, env_set: envSet, source: dbBot ? 'db' : 'env' });
    }

    /* ── Telegram config save ── */
    if (action === 'tg_config_save') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'Admin only', code:403 });
      const bot  = String(body.bot_token || '').trim();
      const chat = String(body.chat_id   || '').trim();
      const upsert = async (type, val) => {
        const [ex] = await db().query('SELECT id FROM settings WHERE type=?', [type]);
        if (ex.length) await db().query('UPDATE settings SET value=? WHERE type=?', [val, type]);
        else await db().query('INSERT INTO settings (type, value) VALUES (?,?)', [type, val]);
      };
      await upsert('tg_bot_token', bot);
      await upsert('tg_chat_id',   chat);
      _tgCache = null; /* invalidate cache */
      return res.json({ ok:true });
    }

    /* ── Telegram test ── */
    if (action === 'tg_test') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'Admin only', code:403 });
      const bot  = String(body.bot_token || '').trim() || TG_BOT_TOKEN;
      const chat = String(body.chat_id   || '').trim() || TG_CHAT_ID;
      if (!bot || !chat) return res.json({ ok:false, message:'Missing Bot Token or Chat ID' });
      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ chat_id: chat, text:'✅ *App — Test Connection*\nTelegram is configured correctly!', parse_mode:'Markdown' }),
        });
        const tgData = await tgRes.json();
        if (tgData.ok) return res.json({ ok:true });
        return res.json({ ok:false, message: tgData.description || 'Telegram API error' });
      } catch(e) { return res.json({ ok:false, message: e.message }); }
    }

    /* ── Notif settings get ── */
    if (action === 'notif_get') {
      const [rows] = await db().query('SELECT value FROM settings WHERE type="notif"');
      const configured = rows.some(r => r.value === '__configured__');
      const enabled = rows.filter(r => r.value !== '__configured__').map(r => r.value);
      return res.json({ ok:true, configured, enabled: configured ? enabled : ['add','edit','delete','login','login_fail','user'] });
    }

    /* ── Notif settings save (Admin only) ── */
    if (action === 'notif_save') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'Admin access required', code:403 });
      const types = Array.isArray(body.enabled) ? body.enabled.filter(t => ['add','edit','delete','login','login_fail','user'].includes(t)) : [];
      await db().query('DELETE FROM settings WHERE type="notif"');
      await db().query('INSERT INTO settings (type, value) VALUES ("notif", "__configured__")');
      for (const t of types) {
        await db().query('INSERT INTO settings (type, value) VALUES ("notif", ?)', [t]);
      }
      return res.json({ ok:true });
    }

    /* ── Watch user list get ── */
    if (action === 'watch_get') {
      const [rows] = await db().query('SELECT value FROM settings WHERE type="watch_user"');
      return res.json({ ok:true, watched: rows.map(r => r.value) });
    }

    /* ── Watch user list save (Admin only) ── */
    if (action === 'watch_save') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'Admin access required', code:403 });
      const usernames = Array.isArray(body.watched) ? body.watched.filter(u => typeof u === 'string' && u.trim()) : [];
      await db().query('DELETE FROM settings WHERE type="watch_user"');
      for (const u of usernames) {
        await db().query('INSERT INTO settings (type, value) VALUES ("watch_user", ?)', [u.trim()]);
      }
      return res.json({ ok:true });
    }

    /* ── Upload photo to Cloudinary (server-side, images only) ── */
    if (action === 'upload_photo') {
      if (!CLD_CLOUD || !CLD_KEY || !CLD_SEC) return res.json({ ok:false, message:'Cloudinary not configured' });
      const b64 = body.data;
      if (!b64) return res.json({ ok:false, message:'No image data' });
      const commaIdx = b64.indexOf(',');
      const meta     = commaIdx > -1 ? b64.slice(0, commaIdx) : '';
      const rawB64   = commaIdx > -1 ? b64.slice(commaIdx + 1) : b64;
      const mime     = (meta.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
      const buf      = Buffer.from(rawB64, 'base64');
      const blob     = new Blob([buf], { type: mime });
      const timestamp = Math.floor(Date.now() / 1000);
      const folder    = 'app-uploads';
      const signStr   = `folder=${folder}&timestamp=${timestamp}${CLD_SEC}`;
      const signature = crypto.createHash('sha1').update(signStr).digest('hex');
      const form = new FormData();
      form.append('file',      blob, 'upload.jpg');
      form.append('api_key',   CLD_KEY);
      form.append('timestamp', String(timestamp));
      form.append('folder',    folder);
      form.append('signature', signature);
      const r    = await fetch(`https://api.cloudinary.com/v1_1/${CLD_CLOUD}/auto/upload`, { method:'POST', body: form });
      const data = await r.json();
      if (data.secure_url) return res.json({ ok:true, url: data.secure_url });
      return res.json({ ok:false, message: data.error?.message || 'Upload failed' });
    }

    /* ── Return signature for browser-direct upload (videos/large files) ── */
    if (action === 'get_upload_sig') {
      if (!CLD_CLOUD || !CLD_KEY || !CLD_SEC) return res.json({ ok:false, message:'Cloudinary not configured' });
      const timestamp = Math.floor(Date.now() / 1000);
      const folder    = 'app-uploads';
      const signStr   = `folder=${folder}&timestamp=${timestamp}${CLD_SEC}`;
      const signature = crypto.createHash('sha1').update(signStr).digest('hex');
      return res.json({ ok:true, timestamp, signature, api_key: CLD_KEY, cloud_name: CLD_CLOUD, folder });
    }

    return res.json({ ok:false, message:'Unknown action: ' + action });

  } catch(err) {
    console.error('[api]', err.message);
    return res.status(500).json({ ok:false, message: err.message || 'Server error' });
  }
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
