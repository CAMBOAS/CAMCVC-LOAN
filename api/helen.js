/**
 * HELEN LOAN — MySQL API Handler
 * Replaces Google Apps Script backend.
 */

import mysql  from 'mysql2/promise';
import crypto from 'crypto';

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
  try { await db().query('ALTER TABLE helen_loans ADD COLUMN social_links TEXT'); } catch(e) {}
  _slColReady = true;
}

/* ── One-time migration: add paid column if absent ── */
let _paidColReady = false;
async function ensurePaidCol() {
  if (_paidColReady) return;
  try { await db().query('ALTER TABLE helen_loans ADD COLUMN paid TINYINT(1) NOT NULL DEFAULT 0'); } catch(e) {}
  _paidColReady = true;
}

/* ── One-time migration: add photo_url column to helen_users if absent ── */
let _userPhotoColReady = false;
async function ensureUserPhotoCol() {
  if (_userPhotoColReady) return;
  try { await db().query('ALTER TABLE helen_users ADD COLUMN photo_url VARCHAR(500) DEFAULT NULL'); } catch(e) {}
  _userPhotoColReady = true;
}

/* ── One-time migration: add created_by column to helen_loans if absent ── */
let _createdByColReady = false;
async function ensureCreatedByCol() {
  if (_createdByColReady) return;
  try { await db().query('ALTER TABLE helen_loans ADD COLUMN created_by VARCHAR(100) DEFAULT NULL'); } catch(e) {}
  _createdByColReady = true;
}

/* ── One-time migration: add created_by_user column (login username) to helen_loans if absent ── */
let _createdByUserColReady = false;
async function ensureCreatedByUserCol() {
  if (_createdByUserColReady) return;
  try { await db().query('ALTER TABLE helen_loans ADD COLUMN created_by_user VARCHAR(100) DEFAULT NULL'); } catch(e) {}
  _createdByUserColReady = true;
}

/* ── Activity log table ── */
let _actLogReady = false;
async function ensureActivityLogTable() {
  if (_actLogReady) return;
  try {
    await db().query(`CREATE TABLE IF NOT EXISTS helen_activity_log (
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
      'INSERT INTO helen_activity_log (action,actor,actor_user,target,detail) VALUES (?,?,?,?,?)',
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
    Paid:        r.paid ? 1 : 0,
    created_by:  r.creator_display_name || r.created_by || '',
    photo_url:   r.photo_url    || '',
    photos:      (() => { try { if (!r.photos) return []; if (Array.isArray(r.photos)) return r.photos; return JSON.parse(r.photos) || []; } catch(e) { return []; } })(),
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
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;
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
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;
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
  const [rows] = await db().query('SELECT value FROM helen_infor WHERE type="notif"');
  const configured = rows.some(r => r.value === '__configured__');
  if (!configured) return true; // never saved = all enabled (default)
  return rows.some(r => r.value === type);
}

async function isWatched(username) {
  if (!username) return false;
  const [rows] = await db().query('SELECT 1 FROM helen_infor WHERE type="watch_user" AND value=? LIMIT 1', [username]);
  return rows.length > 0;
}

/* ── Auth ── */
async function validateAuth(u, p) {
  if (!u || !p) return null;
  await ensureUserPhotoCol();
  const [rows] = await db().query(
    'SELECT username, role, display_name, exp_date, photo_url FROM helen_users WHERE username=? AND pin=? AND status="active" LIMIT 1',
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
  return { username: user.username, role: user.role||'Staff', name: user.display_name||user.username, expDate, photo_url: user.photo_url || '' };
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let body = {};
    if (req.method === 'POST') {
      let raw = '';
      await new Promise((resolve, reject) => {
        req.on('data', chunk => { raw += chunk.toString(); });
        req.on('end', resolve);
        req.on('error', reject);
      });
      try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
    } else {
      body = req.query || {};
    }

    const action = String(body.action || '').trim();

    /* ── Public: login ── */
    if (action === 'helen_login') {
      const v = await validateAuth(String(body.username||'').trim(), String(body.pin||'').trim());
      if (!v)          return res.json({ ok:false, message:'ឈ្មោះ ឬ PIN មិនត្រូវ' });
      if (v.expired)   return res.json({ ok:false, message:'គណនីបានផុតកំណត់ — សូមទំនាក់ទំនង Admin', code:'expired' });
      db().query('UPDATE helen_users SET last_seen=NOW() WHERE username=?', [v.username]).catch(()=>{});
      if (await isNotifEnabled('login')) { try { await sendTelegramEvent('login', { name:v.name, role:v.role, username:v.username }); } catch(e) {} }
      logActivity('user_login', v.name, v.username, null, { role: v.role }).catch(()=>{});
      return res.json({ ok:true, name:v.name, role:v.role, username:v.username, expDate:v.expDate, photo_url:v.photo_url||'' });
    }

    if (action === 'helen_login_alert') {
      if (await isNotifEnabled('login_fail')) {
        try { await sendTelegramEvent('login_fail', { username:body.username, reason:body.reason, attempt:body.attempt }); } catch(e) {}
      }
      return res.json({ ok:true });
    }

    /* ── Auth check for all write/read actions ── */
    const _bu = String((body.auth&&body.auth.u)||body.u||'').trim();
    const _bp = String((body.auth&&body.auth.p)||body.p||'').trim();
    const _bv = await validateAuth(_bu, _bp);
    if (!_bv || _bv.expired) return res.json({ ok:false, message:'auth_required', code:401 });
    const actor = _bv.name || '';
    db().query('UPDATE helen_users SET last_seen=NOW() WHERE username=?', [_bu]).catch(()=>{});

    /* ── All data (loans + infor) ── */
    if (action === 'helen_all') {
      await ensureCreatedByUserCol();
      const [loans] = await db().query(`SELECT l.*, u.display_name AS creator_display_name FROM helen_loans l LEFT JOIN helen_users u ON l.created_by_user = u.username WHERE l.deleted_at IS NULL ORDER BY l.loan_key DESC`);
      const [infor] = await db().query('SELECT type, value FROM helen_infor ORDER BY id');
      return res.json({
        ok:          true,
        loans:       loans.map(rowToLoan),
        groups:      infor.filter(r=>r.type==='groups').map(r=>r.value),
        statuses:    infor.filter(r=>r.type==='statuses').map(r=>r.value),
        socialMedia: infor.filter(r=>r.type==='socialMedia').map(r=>r.value),
      });
    }

    /* ── Borrower Profile (single loan + history by same NID) ── */
    if (action === 'helen_loan_profile') {
      const key = String(body.key || '').trim();
      if (!key) return res.json({ ok: false, message: 'key required' });
      await ensureCreatedByUserCol();
      const [rows] = await db().query(
        `SELECT l.*, u.display_name AS creator_display_name FROM helen_loans l LEFT JOIN helen_users u ON l.created_by_user = u.username WHERE l.loan_key=? AND l.deleted_at IS NULL`,
        [key]
      );
      if (!rows.length) return res.json({ ok: false, message: 'Borrower not found' });
      const loan = rowToLoan(rows[0]);
      let history = [];
      const nid = rows[0].national_id;
      if (nid) {
        const [hist] = await db().query(
          `SELECT l.*, u.display_name AS creator_display_name FROM helen_loans l LEFT JOIN helen_users u ON l.created_by_user = u.username WHERE l.national_id=? AND l.deleted_at IS NULL ORDER BY l.loan_key DESC`,
          [nid]
        );
        history = hist.map(rowToLoan);
      }
      return res.json({ ok: true, loan, history });
    }

    /* ── Activity Log list ── */
    if (action === 'helen_activity_list') {
      await ensureActivityLogTable();
      const isAdmin = _bv.role === 'Admin';
      const limit  = Math.min(parseInt(body.limit||150, 10), 500);
      const offset = parseInt(body.offset||0, 10);
      const fAct   = String(body.filter_action||'').trim();
      /* Non-Admin can only see their own activity — force actor_user to self */
      const fUser  = isAdmin ? String(body.filter_actor||'').trim() : _bu;
      let sql = 'SELECT * FROM helen_activity_log';
      const params = [];
      const wheres = [];
      if (fAct)  { wheres.push('action=?');     params.push(fAct); }
      if (fUser) { wheres.push('actor_user=?'); params.push(fUser); }
      if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      const [logs] = await db().query(sql, params);
      /* Total count respects same filter */
      let countSql = 'SELECT COUNT(*) AS total FROM helen_activity_log';
      const countParams = [];
      const countWheres = [];
      if (fAct)  { countWheres.push('action=?');     countParams.push(fAct); }
      if (fUser) { countWheres.push('actor_user=?'); countParams.push(fUser); }
      if (countWheres.length) countSql += ' WHERE ' + countWheres.join(' AND ');
      const [[tot]] = await db().query(countSql, countParams);
      return res.json({ ok: true, logs, total: tot.total, is_admin: isAdmin });
    }

    /* ── Infor only ── */
    if (action === 'helen_infor') {
      const [infor] = await db().query('SELECT type, value FROM helen_infor ORDER BY id');
      return res.json({
        ok:          true,
        groups:      infor.filter(r=>r.type==='groups').map(r=>r.value),
        statuses:    infor.filter(r=>r.type==='statuses').map(r=>r.value),
        socialMedia: infor.filter(r=>r.type==='socialMedia').map(r=>r.value),
      });
    }

    /* ── Trash list ── */
    if (action === 'helen_loan_list_trash') {
      await ensureCreatedByUserCol();
      const [loans] = await db().query(`SELECT l.*, u.display_name AS creator_display_name FROM helen_loans l LEFT JOIN helen_users u ON l.created_by_user = u.username WHERE l.deleted_at IS NOT NULL ORDER BY l.deleted_at DESC`);
      return res.json({ ok:true, loans: loans.map(rowToLoan) });
    }

    /* ── Add infor ── */
    if (action === 'helen_infor_add') {
      const type  = String(body.type ||'').trim();
      const value = String(body.value||'').trim();
      if (!type || !value) return res.json({ ok:false, message:'Missing type or value' });
      await db().query('INSERT IGNORE INTO helen_infor (type, value) VALUES (?,?)', [type, value]);
      return res.json({ ok:true });
    }

    /* ── Delete infor ── */
    if (action === 'helen_infor_delete') {
      await db().query('DELETE FROM helen_infor WHERE type=? AND value=?',
        [String(body.type||'').trim(), String(body.value||'').trim()]);
      return res.json({ ok:true });
    }

    /* ── Add loan ── */
    if (action === 'helen_loan_add') {
      await ensureSocialLinksCol();
      await ensurePaidCol();
      await ensureCreatedByCol();
      await ensureCreatedByUserCol();
      const l = body.loan || {};
      const datePart = l.DateTime ? l.DateTime.substring(0, 10) : new Date().toISOString().substring(0, 10);
      const key = datePart + 'T' + new Date().toISOString().substring(11);
      const photosJson = Array.isArray(l.photos) && l.photos.length ? JSON.stringify(l.photos) : null;
      const slJson = Array.isArray(l.social_links) && l.social_links.length ? JSON.stringify(l.social_links) : null;
      const sl0 = (l.social_links||[])[0] || {};
      await db().query(
        `INSERT INTO helen_loans
           (loan_key,full_name,national_id,dob,phone,gender,loan_group,money,loan_status,note,fb_name,fb_url,social_media,social_id,fbid,photo_url,photos,social_links,paid,created_by,created_by_user)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [key, l.FullName||'', l.NationalID||'', l.DOB||'', l.Phone||'',
         l.Gender||'', l.Groups||'', l.Money||0, l.Status||'Normal',
         l.Note||'', sl0.name||l.FBName||'', sl0.url||l.URL||'', sl0.platform||l.FacebookCom||'', sl0.id||l.ID||'', sl0.fbid||l.FBID||'',
         l.photo_url||null, photosJson, slJson, l.Paid ? 1 : 0, actor||null, _bu||null]
      );
      const [rows] = await db().query('SELECT * FROM helen_loans WHERE loan_key=?', [key]);
      if ((await isWatched(_bu)) && (await isNotifEnabled('add'))) { try { await sendTelegram(rows[0], 'add', actor); } catch(e) {} }
      logActivity('loan_add', actor, _bu, l.FullName||'', { money: l.Money||0, status: l.Status||'Normal' }).catch(()=>{});
      return res.json({ ok:true });
    }

    /* ── Update loan ── */
    if (action === 'helen_loan_update') {
      await ensureSocialLinksCol();
      await ensurePaidCol();
      const key = String(body.key||'').trim();
      const l   = body.loan || {};
      const [old] = await db().query('SELECT * FROM helen_loans WHERE loan_key=? AND deleted_at IS NULL', [key]);
      if (!old.length) return res.json({ ok:false, message:'Row not found' });
      const newKey = l.DateTime || key;
      const photosJsonU = Array.isArray(l.photos) && l.photos.length ? JSON.stringify(l.photos) : null;
      const slJsonU = Array.isArray(l.social_links) && l.social_links.length ? JSON.stringify(l.social_links) : null;
      const sl0u = (l.social_links||[])[0] || {};
      await db().query(
        `UPDATE helen_loans SET
           loan_key=?,full_name=?,national_id=?,dob=?,phone=?,gender=?,loan_group=?,
           money=?,loan_status=?,note=?,fb_name=?,fb_url=?,social_media=?,social_id=?,fbid=?,
           photo_url=?,photos=?,social_links=?,paid=?
         WHERE loan_key=? AND deleted_at IS NULL`,
        [newKey, l.FullName||'', l.NationalID||'', l.DOB||'', l.Phone||'',
         l.Gender||'', l.Groups||'', l.Money||0, l.Status||'Normal',
         l.Note||'', sl0u.name||l.FBName||'', sl0u.url||l.URL||'', sl0u.platform||l.FacebookCom||'', sl0u.id||l.ID||'', sl0u.fbid||l.FBID||'',
         l.photo_url||null, photosJsonU, slJsonU, l.Paid ? 1 : 0, key]
      );
      const [updated] = await db().query('SELECT * FROM helen_loans WHERE loan_key=?', [newKey]);
      if ((await isWatched(_bu)) && (await isNotifEnabled('edit'))) { try { await sendTelegram(updated[0], 'edit', actor, old[0]); } catch(e) {} }
      logActivity('loan_edit', actor, _bu, l.FullName||'', { key: newKey }).catch(()=>{});
      return res.json({ ok:true, message:'Updated' });
    }

    /* ── Toggle paid ── */
    if (action === 'helen_loan_toggle_paid') {
      await ensurePaidCol();
      const key = String(body.key||'').trim();
      const [rows] = await db().query('SELECT paid, full_name FROM helen_loans WHERE loan_key=? AND deleted_at IS NULL', [key]);
      if (!rows.length) return res.json({ ok:false, message:'Row not found' });
      const newPaid = rows[0].paid ? 0 : 1;
      await db().query('UPDATE helen_loans SET paid=? WHERE loan_key=?', [newPaid, key]);
      logActivity('loan_paid', actor, _bu, rows[0].full_name||'', { paid: newPaid }).catch(()=>{});
      return res.json({ ok:true, paid: newPaid });
    }

    /* ── Delete loan (soft) ── */
    if (action === 'helen_loan_delete') {
      const key = String(body.key||'').trim();
      const [rows] = await db().query('SELECT * FROM helen_loans WHERE loan_key=? AND deleted_at IS NULL', [key]);
      if (!rows.length) return res.json({ ok:false, message:'Row not found' });
      await db().query('UPDATE helen_loans SET deleted_at=NOW() WHERE loan_key=?', [key]);
      if ((await isWatched(_bu)) && (await isNotifEnabled('delete'))) { try { await sendTelegram(rows[0], 'delete', actor); } catch(e) {} }
      logActivity('loan_delete', actor, _bu, rows[0].full_name||'', { key }).catch(()=>{});
      return res.json({ ok:true, message:'Deleted' });
    }

    /* ── Recover loan ── */
    if (action === 'helen_loan_recover') {
      const key = String(body.key||'').trim();
      const [trashRow] = await db().query('SELECT full_name FROM helen_loans WHERE loan_key=? AND deleted_at IS NOT NULL', [key]);
      const [r] = await db().query(
        'UPDATE helen_loans SET deleted_at=NULL WHERE loan_key=? AND deleted_at IS NOT NULL', [key]);
      if (r.affectedRows > 0) logActivity('loan_recover', actor, _bu, trashRow[0]&&trashRow[0].full_name||'', { key }).catch(()=>{});
      return res.json({ ok: r.affectedRows > 0, message: r.affectedRows > 0 ? 'Recovered' : 'Not found in trash' });
    }

    /* ── Permanent delete ── */
    if (action === 'helen_loan_perm_delete') {
      const key = String(body.key||'').trim();
      const [r] = await db().query(
        'DELETE FROM helen_loans WHERE loan_key=? AND deleted_at IS NOT NULL', [key]);
      return res.json({ ok: r.affectedRows > 0, message: r.affectedRows > 0 ? 'Deleted' : 'Not found' });
    }

    /* ── User list (Admin only) ── */
    if (action === 'helen_user_list') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
      await ensureUserPhotoCol();
      const [users] = await db().query(
        'SELECT username, role, display_name, exp_date, status, last_seen, photo_url FROM helen_users ORDER BY id'
      );
      return res.json({ ok:true, users });
    }

    /* ── User add (Admin only) ── */
    if (action === 'helen_user_add') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
      const u = String(body.username||'').trim();
      const p = String(body.pin||'').trim();
      if (!u || !p) return res.json({ ok:false, message:'Username និង PIN ត្រូវការ' });
      try {
        await db().query(
          'INSERT INTO helen_users (username, pin, role, display_name, exp_date, status) VALUES (?,?,?,?,?,?)',
          [u, p, String(body.role||'Staff Loan'), String(body.display_name||u).trim(),
           body.exp_date||null, body.status||'active']
        );
      } catch(e) {
        if (e.code === 'ER_DUP_ENTRY') return res.json({ ok:false, message:'Username "'+u+'" មានរួចហើយ' });
        throw e;
      }
      if (await isNotifEnabled('user')) { try { await sendTelegramEvent('user', { act:'add', username:u, display_name:String(body.display_name||u).trim(), role:String(body.role||'Staff Loan'), status:body.status||'active', actor }); } catch(e) {} }
      logActivity('user_add', actor, _bu, u, { display_name: String(body.display_name||u).trim(), role: String(body.role||'Staff Loan') }).catch(()=>{});
      return res.json({ ok:true });
    }

    /* ── User update (Admin only) ── */
    if (action === 'helen_user_update') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
      const u = String(body.username||'').trim();
      if (!u) return res.json({ ok:false, message:'Username required' });
      const [oldRows] = await db().query('SELECT display_name FROM helen_users WHERE username=?', [u]);
      const oldDisplayName = oldRows.length ? (oldRows[0].display_name || '') : '';
      const newDisplayName = String(body.display_name||u).trim();
      const p = String(body.pin||'').trim();
      if (p) {
        await db().query(
          'UPDATE helen_users SET pin=?,role=?,display_name=?,exp_date=?,status=? WHERE username=?',
          [p, String(body.role||'Staff Loan'), newDisplayName, body.exp_date||null, body.status||'active', u]
        );
      } else {
        await db().query(
          'UPDATE helen_users SET role=?,display_name=?,exp_date=?,status=? WHERE username=?',
          [String(body.role||'Staff Loan'), newDisplayName, body.exp_date||null, body.status||'active', u]
        );
      }
      if (oldDisplayName && newDisplayName && oldDisplayName !== newDisplayName) {
        await db().query('UPDATE helen_loans SET created_by=? WHERE created_by=?', [newDisplayName, oldDisplayName]);
      }
      if (await isNotifEnabled('user')) { try { await sendTelegramEvent('user', { act:'edit', username:u, display_name:newDisplayName, role:String(body.role||'Staff Loan'), status:body.status||'active', actor }); } catch(e) {} }
      logActivity('user_edit', actor, _bu, u, { old_name: oldDisplayName, new_name: newDisplayName }).catch(()=>{});
      return res.json({ ok:true });
    }

    /* ── User delete (Admin only, cannot delete self) ── */
    if (action === 'helen_user_delete') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
      const u = String(body.username||'').trim();
      if (!u) return res.json({ ok:false, message:'Username required' });
      if (u === _bu) return res.json({ ok:false, message:'មិនអាចលុប Account ខ្លួនឯងបាន' });
      await db().query('DELETE FROM helen_users WHERE username=?', [u]);
      if (await isNotifEnabled('user')) { try { await sendTelegramEvent('user', { act:'delete', username:u, actor }); } catch(e) {} }
      logActivity('user_delete', actor, _bu, u, null).catch(()=>{});
      return res.json({ ok:true });
    }

    /* ── Admin update user photo ── */
    if (action === 'helen_user_update_photo') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'Admin access required', code:403 });
      const u = String(body.username||'').trim();
      if (!u) return res.json({ ok:false, message:'Username required' });
      await ensureUserPhotoCol();
      const photoUrl = String(body.photo_url||'').trim();
      await db().query('UPDATE helen_users SET photo_url=? WHERE username=?', [photoUrl || null, u]);
      return res.json({ ok:true });
    }

    /* ── Self update profile (any authenticated user) ── */
    if (action === 'helen_user_self_update') {
      const type = String(body.type || '').trim();

      if (type === 'photo') {
        await ensureUserPhotoCol();
        const photoUrl = String(body.photo_url || '').trim();
        await db().query('UPDATE helen_users SET photo_url=? WHERE username=?', [photoUrl || null, _bu]);
        return res.json({ ok: true });
      }

      if (type === 'profile' || type === 'pin') {
        const currentPin = String(body.current_pin || '').trim();
        if (!currentPin) return res.json({ ok: false, message: 'PIN បច្ចុប្បន្នត្រូវការ' });
        const [pinRow] = await db().query(
          'SELECT pin FROM helen_users WHERE username=? AND status="active"', [_bu]
        );
        if (!pinRow.length || pinRow[0].pin !== currentPin) return res.json({ ok: false, message: 'PIN មិនត្រូវ' });

        if (type === 'pin') {
          const newPin = String(body.new_pin || '').trim();
          if (!newPin) return res.json({ ok: false, message: 'PIN ថ្មីត្រូវការ' });
          await db().query('UPDATE helen_users SET pin=? WHERE username=?', [newPin, _bu]);
          return res.json({ ok: true });
        }

        if (type === 'profile') {
          const displayName = String(body.display_name || '').trim();
          const newUsername = String(body.new_username || '').trim();
          if (!displayName && (!newUsername || newUsername === _bu))
            return res.json({ ok: false, message: 'គ្មានព័ត៌មានត្រូវធ្វើបច្ចុប្បន្ន' });
          if (newUsername && newUsername !== _bu) {
            const [ex] = await db().query('SELECT 1 FROM helen_users WHERE username=?', [newUsername]);
            if (ex.length) return res.json({ ok: false, message: 'Username "'+newUsername+'" មានរួចហើយ' });
            const finalName = displayName || _bv.name || _bu;
            await db().query(
              'UPDATE helen_users SET username=?, display_name=? WHERE username=?',
              [newUsername, finalName, _bu]
            );
            // Keep loan references in sync
            await db().query('UPDATE helen_loans SET created_by_user=? WHERE created_by_user=?', [newUsername, _bu]);
            const oldName = _bv.name || '';
            if (oldName && finalName !== oldName) {
              await db().query('UPDATE helen_loans SET created_by=? WHERE created_by=?', [finalName, oldName]);
            }
            return res.json({ ok: true, username: newUsername, display_name: finalName });
          }
          await db().query('UPDATE helen_users SET display_name=? WHERE username=?', [displayName, _bu]);
          // Backfill old loan records that stored the old display name
          const oldDisplayName = _bv.name || '';
          if (oldDisplayName && displayName !== oldDisplayName) {
            await db().query('UPDATE helen_loans SET created_by=? WHERE created_by=?', [displayName, oldDisplayName]);
          }
          return res.json({ ok: true, username: _bu, display_name: displayName });
        }
      }

      return res.json({ ok: false, message: 'Invalid type' });
    }

    /* ── Notif settings get ── */
    if (action === 'helen_notif_get') {
      const [rows] = await db().query('SELECT value FROM helen_infor WHERE type="notif"');
      const configured = rows.some(r => r.value === '__configured__');
      const enabled = rows.filter(r => r.value !== '__configured__').map(r => r.value);
      return res.json({ ok:true, configured, enabled: configured ? enabled : ['add','edit','delete','login','login_fail','user'] });
    }

    /* ── Notif settings save (Admin only) ── */
    if (action === 'helen_notif_save') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'Admin access required', code:403 });
      const types = Array.isArray(body.enabled) ? body.enabled.filter(t => ['add','edit','delete','login','login_fail','user'].includes(t)) : [];
      await db().query('DELETE FROM helen_infor WHERE type="notif"');
      await db().query('INSERT INTO helen_infor (type, value) VALUES ("notif", "__configured__")');
      for (const t of types) {
        await db().query('INSERT INTO helen_infor (type, value) VALUES ("notif", ?)', [t]);
      }
      return res.json({ ok:true });
    }

    /* ── Watch user list get ── */
    if (action === 'helen_watch_get') {
      const [rows] = await db().query('SELECT value FROM helen_infor WHERE type="watch_user"');
      return res.json({ ok:true, watched: rows.map(r => r.value) });
    }

    /* ── Watch user list save (Admin only) ── */
    if (action === 'helen_watch_save') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'Admin access required', code:403 });
      const usernames = Array.isArray(body.watched) ? body.watched.filter(u => typeof u === 'string' && u.trim()) : [];
      await db().query('DELETE FROM helen_infor WHERE type="watch_user"');
      for (const u of usernames) {
        await db().query('INSERT INTO helen_infor (type, value) VALUES ("watch_user", ?)', [u.trim()]);
      }
      return res.json({ ok:true });
    }

    /* ── Upload photo to Cloudinary (server-side, images only) ── */
    if (action === 'helen_upload_photo') {
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
      const folder    = 'helen-loan';
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
    if (action === 'helen_get_upload_sig') {
      if (!CLD_CLOUD || !CLD_KEY || !CLD_SEC) return res.json({ ok:false, message:'Cloudinary not configured' });
      const timestamp = Math.floor(Date.now() / 1000);
      const folder    = 'helen-loan';
      const signStr   = `folder=${folder}&timestamp=${timestamp}${CLD_SEC}`;
      const signature = crypto.createHash('sha1').update(signStr).digest('hex');
      return res.json({ ok:true, timestamp, signature, api_key: CLD_KEY, cloud_name: CLD_CLOUD, folder });
    }

    return res.json({ ok:false, message:'Unknown action: ' + action });

  } catch(err) {
    console.error('[helen-api]', err.message);
    return res.status(500).json({ ok:false, message: err.message || 'Server error' });
  }
}
