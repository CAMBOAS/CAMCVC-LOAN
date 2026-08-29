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
  try { await db().query('ALTER TABLE users ADD COLUMN manages_teams TEXT DEFAULT NULL'); } catch(e) {}
  _userScopeColsReady = true;
}

/* ── One-time migration: add team_name column to users if absent (Sub Admin-only, editable by Admin) ── */
let _teamNameColReady = false;
async function ensureTeamNameCol() {
  if (_teamNameColReady) return;
  try { await db().query('ALTER TABLE users ADD COLUMN team_name VARCHAR(100) DEFAULT NULL'); } catch(e) {}
  _teamNameColReady = true;
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

/* ── One-time migration: add portal_closed column to loans if absent. Staff close a borrower's
     self-service portal once they have finished repaying, so the portal shows a thank-you
     instead of their history. Defaults to 0 = open, so existing borrowers are unaffected. ── */
let _portalClosedColReady = false;
async function ensurePortalClosedCol() {
  if (_portalClosedColReady) return;
  try { await db().query('ALTER TABLE loans ADD COLUMN portal_closed TINYINT(1) NOT NULL DEFAULT 0'); } catch(e) {}
  _portalClosedColReady = true;
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

/* ── Who actually opened their own repayment history ──
   One row per borrower record, not per visit: the question staff ask is "has
   this customer ever looked, and when did they last look", and keeping a row
   per visit would grow without bound for no extra answer. */
let _portalVisitsReady = false;
async function ensurePortalVisitsTable() {
  if (_portalVisitsReady) return;
  await db().query(`CREATE TABLE IF NOT EXISTS portal_visits (
    loan_key    VARCHAR(64) PRIMARY KEY,
    visits      INT NOT NULL DEFAULT 0,
    first_seen  DATETIME NULL,
    last_seen   DATETIME NULL,
    last_ip     VARCHAR(64)  NULL,
    last_city   VARCHAR(120) NULL,
    last_region VARCHAR(120) NULL,
    last_country VARCHAR(8)  NULL,
    last_ua     VARCHAR(255) NULL,
    last_via    VARCHAR(12)  NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  _portalVisitsReady = true;
}

/* Called after a borrower is let in. Never throws into the response: a failure
   to record a visit must not stop somebody reading their own history. */
async function recordPortalVisit(keys, req, via) {
  try {
    if (!keys || !keys.length) return;
    await ensurePortalVisitsTable();
    const g = readGeo(req);
    /* A page refresh restores the same session — keep the clock moving but do not
       count it again, or the number would measure refreshes rather than visits. */
    const bump = (via === 'restore') ? 0 : 1;
    for (const k of keys) {
      await db().query(
        `INSERT INTO portal_visits
           (loan_key, visits, first_seen, last_seen, last_ip, last_city, last_region, last_country, last_ua, last_via)
         VALUES (?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP(),?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           visits = visits + ?, last_seen = UTC_TIMESTAMP(),
           /* COALESCE so a request without the geo headers keeps the last known
              place instead of blanking it, and a refresh does not rewrite how
              they got in — that was decided when the visit started. */
           last_ip=COALESCE(VALUES(last_ip),last_ip),
           last_city=COALESCE(VALUES(last_city),last_city),
           last_region=COALESCE(VALUES(last_region),last_region),
           last_country=COALESCE(VALUES(last_country),last_country),
           last_ua=COALESCE(VALUES(last_ua),last_ua),
           last_via=IF(?=0, last_via, VALUES(last_via))`,
        [k, bump, g.ip, g.city, g.region, g.country, g.ua, String(via || '').slice(0, 12), bump, bump]
      );
    }
  } catch(e) {}
}

let _sbCcrDone = false;

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
    PortalClosed: !!r.portal_closed,
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
/* ══════════════════════════════════════════════════════════════
   DEVICE SESSIONS, QR SIGN-IN AND LOCKOUT COUNTERS
   ══════════════════════════════════════════════════════════════ */
const MAX_DEVICES   = 2;   /* an account may be signed in on this many devices */
const MAX_STRIKES   = 3;   /* wrong PINs, or device evictions, before the account is disabled */
const QR_LOGIN_SECS = 50;  /* how long a sign-in QR stays valid */
const QR_HS_SECS    = 120; /* how long the login page's QR waits to be approved */
const QR_ADMIN_SECS = 60;  /* an Admin handing someone a way in — kept short on purpose */

let _authGuardReady = false;
async function ensureAuthGuardCols() {
  if (_authGuardReady) return;
  try { await db().query('ALTER TABLE users ADD COLUMN fail_pin INT NOT NULL DEFAULT 0'); } catch(e) {}
  try { await db().query('ALTER TABLE users ADD COLUMN fail_device INT NOT NULL DEFAULT 0'); } catch(e) {}
  _authGuardReady = true;
}

let _sessionsReady = false;
async function ensureSessionsTable() {
  if (_sessionsReady) return;
  await db().query(`CREATE TABLE IF NOT EXISTS user_sessions (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    username   VARCHAR(100) NOT NULL,
    device_id  VARCHAR(64)  NOT NULL,
    label      VARCHAR(160),
    revoked    TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_device (username, device_id),
    INDEX idx_user (username)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  /* deployments created before the session list showed where a sign-in came from */
  for (const col of ['ip VARCHAR(64)','city VARCHAR(120)','region VARCHAR(120)','country VARCHAR(8)',
                     'lat VARCHAR(24)','lon VARCHAR(24)','tz VARCHAR(64)','postal VARCHAR(24)','ua VARCHAR(255)',
                     'gps_lat DECIMAL(10,7)','gps_lon DECIMAL(10,7)','gps_acc INT','gps_at DATETIME']) {
    try { await db().query('ALTER TABLE user_sessions ADD COLUMN ' + col + ' NULL'); } catch(e) {}
  }
  _sessionsReady = true;
}

/* Vercel puts the visitor's rough location on the request itself, so the session list
   can show it without sending anyone's IP to a third-party lookup service.
   Locally none of these headers exist and the columns simply stay empty. */
function readGeo(req) {
  const h = (req && req.headers) || {};
  const one = v => Array.isArray(v) ? v[0] : v;
  const dec = v => { try { return v ? decodeURIComponent(String(v)) : null; } catch(e) { return v || null; } };
  const fwd = String(one(h['x-forwarded-for']) || '').split(',')[0].trim();
  return {
    ip:      fwd || one(h['x-real-ip']) || null,
    city:    dec(one(h['x-vercel-ip-city'])),
    region:  dec(one(h['x-vercel-ip-country-region'])),
    country: (one(h['x-vercel-ip-country']) || null),
    /* Coordinates come from the same IP lookup as the city, so they place the
       network, not the person — good enough to drop a pin on a map, never
       precise enough to tell one building from the next. */
    lat:     (one(h['x-vercel-ip-latitude'])  || null),
    lon:     (one(h['x-vercel-ip-longitude']) || null),
    tz:      (one(h['x-vercel-ip-timezone'])  || null),
    postal:  (one(h['x-vercel-ip-postal-code']) || null),
    ua:      String(one(h['user-agent']) || '').slice(0, 250) || null,
  };
}

let _loginQrReady = false;
async function ensureLoginQrTable() {
  if (_loginQrReady) return;
  await db().query(`CREATE TABLE IF NOT EXISTS login_qr (
    token      VARCHAR(64) PRIMARY KEY,
    username   VARCHAR(100) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at    DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  _loginQrReady = true;
}

/* ── Sign in a computer by scanning from a phone that is already signed in ──
   The reverse of login_qr: here the *unauthenticated* browser mints the code and
   waits, and the signed-in phone approves it. The row therefore starts with no
   username at all — it is written only by the approving phone. ── */
let _loginHsReady = false;
async function ensureLoginHandshakeTable() {
  if (_loginHsReady) return;
  await db().query(`CREATE TABLE IF NOT EXISTS login_handshake (
    token        VARCHAR(64) PRIMARY KEY,
    device_id    VARCHAR(120) NOT NULL,
    device_label VARCHAR(160) NULL,
    ip           VARCHAR(64)  NULL,
    city         VARCHAR(96)  NULL,
    region       VARCHAR(96)  NULL,
    country      VARCHAR(8)   NULL,
    username     VARCHAR(100) NULL,
    status       VARCHAR(12)  NOT NULL DEFAULT 'pending',
    expires_at   DATETIME NOT NULL,
    used_at      DATETIME NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  _loginHsReady = true;
}

/* Disable the account once a counter reaches the limit. Returns true when it just tripped. */
async function bumpStrike(username, column) {
  await ensureAuthGuardCols();
  await db().query(`UPDATE users SET ${column} = ${column} + 1 WHERE username=?`, [username]);
  const [rows] = await db().query(`SELECT ${column} AS n FROM users WHERE username=?`, [username]);
  const n = Number((rows[0] || {}).n || 0);
  if (n >= MAX_STRIKES) {
    await db().query('UPDATE users SET status="inactive" WHERE username=?', [username]);
    return { tripped: true, count: n };
  }
  return { tripped: false, count: n };
}

async function clearStrikes(username) {
  await ensureAuthGuardCols();
  await db().query('UPDATE users SET fail_pin=0 WHERE username=?', [username]);
}

/* Record this device against the account. When the cap is passed, the least recently
   used device is revoked — it discovers that on its next session_check and signs out. */
async function registerDevice(username, deviceId, label, geo) {
  await ensureSessionsTable();
  if (!deviceId) return { ok: true, evicted: null };
  geo = geo || {};

  await db().query(
    `INSERT INTO user_sessions (username, device_id, label, revoked, last_seen, created_at,
                                ip, city, region, country, lat, lon, tz, postal, ua)
     VALUES (?,?,?,0,UTC_TIMESTAMP(),UTC_TIMESTAMP(),?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE label=VALUES(label), revoked=0,
       last_seen=UTC_TIMESTAMP(), created_at=UTC_TIMESTAMP(),
       ip=VALUES(ip), city=VALUES(city), region=VALUES(region), country=VALUES(country),
       lat=VALUES(lat), lon=VALUES(lon), tz=VALUES(tz), postal=VALUES(postal), ua=VALUES(ua)`,
    [username, deviceId, String(label || '').slice(0, 160),
     geo.ip || null, geo.city || null, geo.region || null, geo.country || null,
     geo.lat || null, geo.lon || null, geo.tz || null, geo.postal || null, geo.ua || null]
  );

  const [live] = await db().query(
    'SELECT device_id FROM user_sessions WHERE username=? AND revoked=0 ORDER BY last_seen DESC',
    [username]
  );
  if (live.length <= MAX_DEVICES) return { ok: true, evicted: null };

  /* everything past the cap is the older end of that list */
  const evict = live.slice(MAX_DEVICES).map(r => r.device_id);
  await db().query(
    `UPDATE user_sessions SET revoked=1 WHERE username=? AND device_id IN (${evict.map(() => '?').join(',')})`,
    [username, ...evict]
  );
  const strike = await bumpStrike(username, 'fail_device');
  return { ok: true, evicted: evict, disabled: strike.tripped, strikes: strike.count };
}


/* The profile beyond a display name: who someone is, how to reach them, and who
   to call if something happens to them. All optional, all owned by the person
   themselves — nobody else's row is ever touched by the action that writes these. */
let _userDetailColsReady = false;
async function ensureUserDetailCols() {
  if (_userDetailColsReady) return;
  for (const col of [
    'first_name VARCHAR(80)', 'last_name VARCHAR(80)',
    'dob VARCHAR(10)', 'gender VARCHAR(20)', 'nationality VARCHAR(60)',
    'email VARCHAR(160)', 'phone VARCHAR(40)', 'telegram_id VARCHAR(80)',
    'addr_line VARCHAR(200)', 'addr_commune VARCHAR(120)', 'addr_city VARCHAR(120)',
    'emg_name VARCHAR(120)', 'emg_relation VARCHAR(60)', 'emg_phone VARCHAR(40)',
    'geo_req TINYINT(1) NOT NULL DEFAULT 0',
  ]) {
    try { await db().query('ALTER TABLE users ADD COLUMN ' + col + ' NULL'); } catch(e) {}
  }
  _userDetailColsReady = true;
}

const USER_DETAIL_FIELDS = [
  'first_name', 'last_name', 'dob', 'gender', 'nationality',
  'email', 'phone', 'telegram_id',
  'addr_line', 'addr_commune', 'addr_city',
  'emg_name', 'emg_relation', 'emg_phone',
];

/* Sign in with a username or with the email on the account. A real username
   always wins: the email column is only consulted when nothing matches a
   username, so no account can ever be shadowed by somebody else's address.
   The email is set by the account holder alone and is unique across accounts,
   which is what makes it safe to accept here. */
async function resolveLoginName(input) {
  const raw = String(input || '').trim();
  if (!raw) return raw;
  const [byName] = await db().query('SELECT username FROM users WHERE username=? LIMIT 1', [raw]);
  if (byName.length) return byName[0].username;
  try {
    await ensureUserDetailCols();
    const [byMail] = await db().query('SELECT username FROM users WHERE email=? LIMIT 1', [raw]);
    if (byMail.length) return byMail[0].username;
  } catch(e) {}
  return raw;
}

async function validateAuth(u, p) {
  if (!u || !p) return null;
  await ensureUserPhotoCol();
  await ensureUserScopeCols();
  const [rows] = await db().query(
    'SELECT username, role, display_name, exp_date, photo_url, scope_linked_to, max_normal_users, created_by, manages_teams FROM users WHERE username=? AND pin=? AND status="active" LIMIT 1',
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
  /* A Normal User's effective scope is resolved LIVE from their Sub Admin (created_by), not from
     their own stored column — so moving them between teams (or the team's scope changing later)
     takes effect immediately with no snapshot to keep in sync. Sub Admins use their own column. */
  if (user.role !== 'Sub Admin' && user.created_by) {
    try {
      const [creatorRows] = await db().query('SELECT scope_linked_to FROM users WHERE username=?', [user.created_by]);
      if (creatorRows.length) {
        let creatorScope = [];
        try { creatorScope = creatorRows[0].scope_linked_to ? JSON.parse(creatorRows[0].scope_linked_to) : []; } catch(e) { creatorScope = []; }
        scopeGroups = Array.isArray(creatorScope) ? creatorScope : [];
      }
    } catch(e) {}
  }
  let managesTeams = [];
  try { managesTeams = user.manages_teams ? JSON.parse(user.manages_teams) : []; } catch(e) { managesTeams = []; }
  if (!Array.isArray(managesTeams)) managesTeams = [];
  return { username: user.username, role: user.role||'Staff', name: user.display_name||user.username, expDate, photo_url: user.photo_url || '', scope_linked_to: scopeGroups, max_normal_users: user.max_normal_users||0, created_by: user.created_by||null, manages_teams: managesTeams };
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

/* ── Can this requester administer the given Sub Admin's team with full Admin-level power
   (edit their scope/quota/team_name, add/delete their Normal Users)? Admin always can; anyone
   else needs subAdminUsername in their own manages_teams grant list — or the '*' wildcard,
   granting every team (current and future), so a Super Admin doesn't have to re-check a huge
   team list by hand as it grows. ── */
function managesTeam(_bv, subAdminUsername) {
  if (!_bv || !subAdminUsername) return false;
  if (_bv.role === 'Admin') return true;
  if (!Array.isArray(_bv.manages_teams)) return false;
  if (_bv.manages_teams.indexOf('*') !== -1) return true;
  return _bv.manages_teams.indexOf(subAdminUsername) !== -1;
}

/* ── Per-user data-focus mode, stored in the same ui_prefs bag as tab/card ordering.
     'all'   — every row (default)
     'mine'  — hide rows whose Linked To a Sub Admin team claims, ie. only our own work
     'teams' — the inverse: only the Sub Admin teams' rows
     Read fresh per request rather than carried on the session so a change applies on the next
     load without re-login. Still honours the older boolean pref so anyone who set it keeps
     their choice. ── */
async function getDataFocusMode(username) {
  if (!username) return 'all';
  try {
    await ensureUiPrefsCol();
    const [rows] = await db().query('SELECT ui_prefs FROM users WHERE username=?', [username]);
    if (!rows.length) return 'all';
    const prefs = JSON.parse(rows[0].ui_prefs || '{}') || {};
    if (prefs.data_focus === 'mine' || prefs.data_focus === 'teams') return prefs.data_focus;
    if (prefs.data_focus === 'all') return 'all';
    return prefs.focus_own_data === true ? 'mine' : 'all';   /* legacy boolean */
  } catch(e) { return 'all'; }
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
      const _lu = await resolveLoginName(body.username);
      const _lp = String(body.pin||'').trim();
      const v = await validateAuth(_lu, _lp);
      if (!v) {
        /* Only an existing, still-active account can collect strikes — a typo in the
           username would otherwise count against nobody, and a disabled account would
           keep counting for ever. */
        await ensureAuthGuardCols();
        const [_who] = await db().query('SELECT username, status FROM users WHERE username=? LIMIT 1', [_lu]);
        if (_who.length && String(_who[0].status).toLowerCase() === 'active') {
          const _st = await bumpStrike(_who[0].username, 'fail_pin');
          if (_st.tripped) return res.json({ ok:false, code:'locked', message:'គណនីត្រូវបានបិទ — ព្យាយាមចូលខុស 3 ដង។ សូមទំនាក់ទំនង Admin' });
          return res.json({ ok:false, code:'bad_pin', left: MAX_STRIKES - _st.count, message:'ឈ្មោះ ឬ PIN មិនត្រូវ (សល់ ' + (MAX_STRIKES - _st.count) + ' ដង)' });
        }
        return res.json({ ok:false, message:'ឈ្មោះ ឬ PIN មិនត្រូវ' });
      }
      if (v.expired)   return res.json({ ok:false, message:'គណនីបានផុតកំណត់ — សូមទំនាក់ទំនង Admin', code:'expired' });
      await clearStrikes(v.username);
      const _reg = await registerDevice(v.username, String(body.device_id||'').trim(), String(body.device_label||''), readGeo(req));
      db().query('UPDATE users SET last_seen=NOW() WHERE username=?', [v.username]).catch(()=>{});
      if (await isNotifEnabled('login')) { try { await sendTelegramEvent('login', { name:v.name, role:v.role, username:v.username }); } catch(e) {} }
      logActivity('user_login', v.name, v.username, null, { role: v.role }).catch(()=>{});
      return res.json({ ok:true, name:v.name, role:v.role, username:v.username, expDate:v.expDate,
                        photo_url:v.photo_url||'', manages_teams:v.manages_teams||[],
                        evicted:_reg.evicted||null, device_disabled:!!_reg.disabled });
    }

    if (action === 'login_alert') {
      if (await isNotifEnabled('login_fail')) {
        try { await sendTelegramEvent('login_fail', { username:body.username, reason:body.reason, attempt:body.attempt }); } catch(e) {}
      }
      return res.json({ ok:true });
    }

    /* ── Public: is this device still allowed to stay signed in? ── */
    if (action === 'session_check') {
      await ensureSessionsTable();
      const u   = String(body.u || '').trim();
      const dev = String(body.device_id || '').trim();
      if (!u || !dev) return res.json({ ok:true, valid:true });   /* nothing to judge */

      /* Read first, so every answer below can carry it. A device with no session
         row still needs to be told, or an account switched on would never be
         asked from the browser that pre-dates the session table. */
      let _geoReq = 0;
      try {
        await ensureUserDetailCols();
        const [gr] = await db().query('SELECT COALESCE(geo_req,0) AS g FROM users WHERE username=? LIMIT 1', [u]);
        _geoReq = Number((gr[0] || {}).g || 0);
      } catch(e) {}

      const [rows] = await db().query(
        'SELECT revoked FROM user_sessions WHERE username=? AND device_id=? LIMIT 1', [u, dev]
      );
      if (!rows.length) return res.json({ ok:true, valid:true, geo:_geoReq }); /* pre-dates the feature */
      if (Number(rows[0].revoked) === 1) return res.json({ ok:true, valid:false, reason:'revoked' });
      const [st] = await db().query('SELECT status FROM users WHERE username=? LIMIT 1', [u]);
      if (st.length && String(st[0].status).toLowerCase() !== 'active') {
        return res.json({ ok:true, valid:false, reason:'inactive' });
      }
      /* COALESCE so a request without the geo headers (local dev, an odd proxy)
         leaves the last known position alone instead of blanking it. */
      const _g = readGeo(req);
      db().query(
        `UPDATE user_sessions SET last_seen=UTC_TIMESTAMP(),
           ip=COALESCE(?,ip), city=COALESCE(?,city), region=COALESCE(?,region), country=COALESCE(?,country),
           lat=COALESCE(?,lat), lon=COALESCE(?,lon), tz=COALESCE(?,tz), postal=COALESCE(?,postal)
         WHERE username=? AND device_id=?`,
        [_g.ip, _g.city, _g.region, _g.country, _g.lat, _g.lon, _g.tz, _g.postal, u, dev]
      ).catch(()=>{});
      return res.json({ ok:true, valid:true, geo:_geoReq });
    }

    /* ── Public: redeem a sign-in QR (the phone scanning it has no credentials yet) ── */
    if (action === 'qr_login_consume') {
      await ensureLoginQrTable();
      const tok = String(body.token || '').trim();
      const dev = String(body.device_id || '').trim();
      if (!tok) return res.json({ ok:false, message:'missing_token' });

      const [rows] = await db().query(
        `SELECT username, used_at, (expires_at <= UTC_TIMESTAMP()) AS expired
         FROM login_qr WHERE token=? LIMIT 1`, [tok]
      );
      if (!rows.length)               return res.json({ ok:false, message:'invalid' });
      if (rows[0].used_at)            return res.json({ ok:false, message:'used' });
      if (Number(rows[0].expired)===1) return res.json({ ok:false, message:'expired' });

      const uname = rows[0].username;
      const [ur] = await db().query(
        'SELECT username, pin, status, display_name, role FROM users WHERE username=? LIMIT 1', [uname]
      );
      if (!ur.length) return res.json({ ok:false, message:'invalid' });
      if (String(ur[0].status).toLowerCase() !== 'active') return res.json({ ok:false, message:'inactive' });

      /* one scan only */
      await db().query('UPDATE login_qr SET used_at=UTC_TIMESTAMP() WHERE token=?', [tok]);

      const reg = await registerDevice(uname, dev, String(body.label || '').slice(0,160), readGeo(req));
      await clearStrikes(uname);
      logActivity('user_login', ur[0].display_name || uname, uname, null, { role: ur[0].role, via: 'qr' }).catch(()=>{});
      return res.json({
        ok: true,
        username: uname,
        pin: ur[0].pin,
        evicted: reg.evicted || null,
        disabled: !!reg.disabled,
      });
    }


    /* ── Public: a computer at the login page asks for a code to be approved ──
       Nothing here identifies anyone: the row only records which browser is waiting,
       so a phone can later say who it is for. ── */
    if (action === 'qr_handshake_start') {
      await ensureLoginHandshakeTable();
      const dev = String(body.device_id || '').trim();
      if (!dev) return res.json({ ok:false, message:'missing_device' });
      /* one waiting code per browser — asking again retires the last */
      await db().query("UPDATE login_handshake SET status='cancelled' WHERE device_id=? AND status='pending'", [dev]);
      const g = readGeo(req);
      const token = crypto.randomBytes(18).toString('base64url');
      await db().query(
        `INSERT INTO login_handshake (token, device_id, device_label, ip, city, region, country, expires_at)
         VALUES (?,?,?,?,?,?,?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))`,
        [token, dev, String(body.device_label || '').slice(0,160), g.ip, g.city, g.region, g.country, QR_HS_SECS]
      );
      return res.json({ ok:true, token, seconds: QR_HS_SECS });
    }

    /* ── Public: the waiting computer checks whether the phone approved yet ──
       Only the browser that created the code may collect it, so a token read off
       someone's screen is of no use anywhere else. ── */
    if (action === 'qr_handshake_poll') {
      await ensureLoginHandshakeTable();
      const tok = String(body.token || '').trim();
      const dev = String(body.device_id || '').trim();
      if (!tok || !dev) return res.json({ ok:false, message:'invalid' });

      const [rows] = await db().query(
        `SELECT device_id, username, status, used_at, (expires_at <= UTC_TIMESTAMP()) AS expired
         FROM login_handshake WHERE token=? LIMIT 1`, [tok]
      );
      if (!rows.length)                 return res.json({ ok:true, status:'invalid' });
      if (rows[0].device_id !== dev)    return res.json({ ok:true, status:'invalid' });
      if (rows[0].used_at)              return res.json({ ok:true, status:'used' });
      if (rows[0].status === 'cancelled') return res.json({ ok:true, status:'cancelled' });
      if (Number(rows[0].expired) === 1)  return res.json({ ok:true, status:'expired' });
      if (rows[0].status !== 'approved')  return res.json({ ok:true, status:'pending' });

      const [ur] = await db().query(
        'SELECT username, pin, status FROM users WHERE username=? LIMIT 1', [rows[0].username]
      );
      if (!ur.length) return res.json({ ok:true, status:'invalid' });
      if (String(ur[0].status).toLowerCase() !== 'active') return res.json({ ok:true, status:'inactive' });

      await db().query('UPDATE login_handshake SET used_at=UTC_TIMESTAMP() WHERE token=?', [tok]);
      return res.json({ ok:true, status:'approved', username: ur[0].username, pin: ur[0].pin });
    }

    /* ── Portal share links (QR) ── */
    let _qrTokTableReady = false;
    async function ensurePortalTokensTable() {
      if (_qrTokTableReady) return;
      await db().query(`CREATE TABLE IF NOT EXISTS portal_tokens (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        token       VARCHAR(64) NOT NULL,
        created_by  VARCHAR(100) NOT NULL,
        expires_at  DATETIME NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        b_method    VARCHAR(10)  NULL,
        b_phone     VARCHAR(60)  NULL,
        b_cred      VARCHAR(190) NULL,
        b_name      VARCHAR(190) NULL,
        UNIQUE KEY uniq_token (token)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      /* deployments created before per-borrower links existed */
      for (const col of ['b_method VARCHAR(10)','b_phone VARCHAR(60)','b_cred VARCHAR(190)','b_name VARCHAR(190)']) {
        try { await db().query('ALTER TABLE portal_tokens ADD COLUMN ' + col + ' NULL'); } catch(e) {}
      }
      _qrTokTableReady = true;
    }

    /* Public — a borrower opening a shared QR link has no account to authenticate with.
       NULL expires_at means the link never expires. */
    if (action === 'portal_token_check') {
      await ensurePortalTokensTable();
      const tok = String(body.token || '').trim();
      if (!tok) return res.json({ ok:true, valid:false, reason:'missing' });
      /* The pool runs with dateStrings:true, so DATETIME arrives as "YYYY-MM-DD HH:MM:SS"
         with no zone and Node would parse it as local time — 7h off from the UTC we store.
         Let MySQL do the comparison instead, and hand the client an explicit UTC stamp. */
      const [rows] = await db().query(
        `SELECT expires_at, b_method, b_phone, b_cred, b_name,
                (expires_at IS NOT NULL AND expires_at <= UTC_TIMESTAMP()) AS expired,
                DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%sZ') AS expires_utc
         FROM portal_tokens WHERE token=? LIMIT 1`, [tok]
      );
      if (!rows.length) return res.json({ ok:true, valid:false, reason:'unknown' });
      const expired = Number(rows[0].expired) === 1;
      /* A link made from one borrower's profile carries that borrower, so the portal can
         open their history directly instead of asking them to identify themselves. */
      const borrower = rows[0].b_phone
        ? { method: rows[0].b_method || 'name', phone: rows[0].b_phone,
            cred: rows[0].b_cred || '', name: rows[0].b_name || '' }
        : null;
      return res.json({
        ok:true,
        valid: !expired,
        reason: expired ? 'expired' : '',
        expires_at: rows[0].expires_utc || null,
        borrower: expired ? null : borrower,
      });
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
      /* The SELECT below reads portal_closed, so the column has to exist even on a deployment
         where no admin has saved a loan yet — otherwise the first borrower login errors out. */
      await ensurePortalClosedCol();
      let loanRows = [];
      try {
        if (method === 'nid') {
          if (!nid) return res.json({ ok: false, message: 'nid_required' });
          [loanRows] = await db().query(
            'SELECT loan_key,full_name,national_id,dob,phone,gender,loan_group,money,loan_status,note,paid,photo_url,loan_tabs,portal_closed FROM loans WHERE REPLACE(REPLACE(phone,\' \',\'\'),\'-\',\'\')=? AND REPLACE(REPLACE(national_id,\' \',\'\'),\'-\',\'\')=? AND deleted_at IS NULL ORDER BY loan_key DESC',
            [phone, nid]
          );
        } else {
          if (!name) return res.json({ ok: false, message: 'name_required' });
          [loanRows] = await db().query(
            'SELECT loan_key,full_name,national_id,dob,phone,gender,loan_group,money,loan_status,note,paid,photo_url,loan_tabs,portal_closed FROM loans WHERE REPLACE(REPLACE(phone,\' \',\'\'),\'-\',\'\')=? AND full_name=? AND deleted_at IS NULL ORDER BY loan_key DESC',
            [phone, name]
          );
        }
      } catch(e) {
        return res.json({ ok: false, message: 'server_error' });
      }
      if (!loanRows.length) return res.json({ ok: false, message: 'not_found' });

      /* Staff close the portal per loan once a borrower has finished repaying. If every loan we
         matched is closed, they are done — answer with 'completed' so the portal can thank them
         rather than a "not found" that would read as their details being wrong. If only some are
         closed, the open ones are still shown. */
      const openRows = loanRows.filter(r => !r.portal_closed);
      if (!openRows.length) {
        return res.json({ ok: false, message: 'completed', name: loanRows[0].full_name || '' });
      }
      loanRows = openRows;

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
      /* They are in and about to see their history — that is the visit. */
      const _via = ['qr','manual','restore'].indexOf(String(body.via||'')) !== -1 ? String(body.via) : 'manual';
      recordPortalVisit(loanRows.map(r => r.loan_key), req, _via);

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

      /* Data focus: an unscoped viewer (Super Admin, or an assistant acting for them) sees every
         team's rows, which buries whichever side they actually want. My Profile lets them narrow
         to their own work or, inversely, to the Sub Admin teams' work. Per-user, default 'all',
         and either way it only ever narrows what they already had, so it grants nothing. */
      let _focus = { clause: '', params: [] };
      let _claimed = [];
      const _focusMode = _sf.clause ? 'all' : await getDataFocusMode(_bu);
      if (_focusMode !== 'all') {
        const [teamRows] = await db().query("SELECT scope_linked_to FROM users WHERE role='Sub Admin'");
        teamRows.forEach(r => {
          try { (JSON.parse(r.scope_linked_to || '[]') || []).forEach(v => { if (v && _claimed.indexOf(v) === -1) _claimed.push(v); }); } catch(e) {}
        });
        const ph = _claimed.map(()=>'?').join(',');
        if (_focusMode === 'mine') {
          /* No team claims anything yet => every row already is ours, so no filter needed. */
          if (_claimed.length) {
            _focus.clause = ` AND (l.linked_to IS NULL OR l.linked_to NOT IN (${ph}))`;
            _focus.params = _claimed;
          }
        } else { /* 'teams' */
          /* Inverse. With nothing claimed there is no team data at all — show none rather than
             falling through to everything. */
          if (_claimed.length) {
            _focus.clause = ` AND l.linked_to IN (${ph})`;
            _focus.params = _claimed;
          } else {
            _focus.clause = ' AND 1=0';
          }
        }
      }

      const [loans] = await db().query(`SELECT l.*, u.display_name AS creator_display_name FROM loans l LEFT JOIN users u ON l.created_by_user = u.username WHERE l.deleted_at IS NULL${_sf.clause}${_focus.clause} ORDER BY l.loan_key DESC`, [..._sf.params, ..._focus.params]);
      const [infor] = await db().query('SELECT type, value, created_by_team FROM settings ORDER BY id');
      /* Option lists. Status/socialMedia stay a shared default list for everyone.
         Admin sees everything; so does an assistant (manages_teams), who is Super Admin's proxy —
         note that check is local to these lists so loan scoping is untouched. */
      const _team        = teamOwnerOf(_bv);
      const _isAssistant = Array.isArray(_bv.manages_teams) && _bv.manages_teams.length > 0;
      const _scoped      = _team !== null && !_isAssistant;
      const _granted     = Array.isArray(_bv.scope_linked_to) ? _bv.scope_linked_to : [];

      /* Linked To is the team-privacy boundary: a scoped user sees ONLY what their own team
         created plus what an Admin explicitly granted into their scope. Ownerless entries are
         deliberately NOT shared here — that escape hatch is what let every team read every other
         team's names. The "granted" half is load-bearing, not a nicety: today every Sub Admin's
         scope points at an ownerless entry (juubee→AMD, HI→Testing 003, …), so without it they
         could no longer pick the very value they are assigned to. */
      const _visibleLinked = r => !_scoped || r.created_by_team === _team || _granted.indexOf(r.value) !== -1;

      /* Groups follow the same boundary, minus the grant fallback (groups are never granted).
         An ownerless group therefore reads as "Super Admin's own": Admin and assistants are
         unscoped so they still see it, while a Sub Admin sees only what their own team created.
         That matches how the existing groups came about without needing to rewrite any rows. */
      const _visibleGroup = r => !_scoped || r.created_by_team === _team;

      /* Status is deliberately looser: the ownerless ones are the shared defaults every team
         works from, so they stay visible to all (and settings_delete stops a team removing them).
         On top of that a team sees the statuses it added itself, and nobody else's. */
      const _visibleStatus = r => !_scoped || !r.created_by_team || r.created_by_team === _team;

      /* Data focus narrows the dropdowns the same way it narrows the rows, so the two agree —
         picking "My data" and then still being offered every team's Linked To was the mismatch.
         Linked To keys off the same claimed-by-a-team set the loan filter uses; Group has no
         claim concept, so ownerless there means "Super Admin's own", matching _visibleGroup.
         Status is left alone on purpose: it is a required field and the shared defaults are the
         only ones most teams have, so filtering it could leave the picker empty. */
      const _focusLinked = r =>
        _focusMode === 'all'  ? true :
        _focusMode === 'mine' ? _claimed.indexOf(r.value) === -1
                              : _claimed.indexOf(r.value) !== -1;
      const _focusGroup = r =>
        _focusMode === 'all'  ? true :
        _focusMode === 'mine' ? !r.created_by_team
                              : !!r.created_by_team;

      return res.json({
        ok:          true,
        loans:       loans.map(rowToLoan),
        groups:      infor.filter(r=>r.type==='groups'   && _visibleGroup(r)  && _focusGroup(r)).map(r=>r.value),
        statuses:    infor.filter(r=>r.type==='statuses' && _visibleStatus(r)).map(r=>r.value),
        socialMedia: infor.filter(r=>r.type==='socialMedia').map(r=>r.value),
        linkedTo:    infor.filter(r=>r.type==='linkedTo' && _visibleLinked(r) && _focusLinked(r)).map(r=>r.value),
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

    /* ── A saved sidebar config is a whitelist, so a page added later would never
         appear in it. Put CCR in once, for configs that pre-date the page and
         have not deliberately emptied the menu. An Admin can switch it off again
         from App Config like any other link. ── */
    if (action === 'get_settings') {
      try {
        if (!_sbCcrDone) {
          _sbCcrDone = true;
          const [_lr] = await db().query("SELECT value FROM settings WHERE type='sb_links' LIMIT 1");
          if (_lr.length) {
            const _v = String(_lr[0].value || '');
            if (_v && _v !== '-' && _v.split(',').indexOf('ccr') === -1) {
              await db().query("UPDATE settings SET value=? WHERE type='sb_links'", [(_v + ',ccr').slice(0, 180)]);
            }
          }
        }
      } catch(e) {}

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
        topbar: {
          on:    one('tb_on')    || '',
          mode:  one('tb_mode')  || '',
          size:  one('tb_size')  || '',
          style: one('tb_style') || '',
          show:  one('tb_show')  || '',
          links: one('tb_links') || '',
        },
        sidebar: {
          on:    one('sb_on')    || '',
          width: one('sb_width') || '',
          mode:  one('sb_mode')  || '',
          style: one('sb_style') || '',
          show:  one('sb_show')  || '',
          links: one('sb_links') || '',
        },
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

    /* ── Save Top Bar config (app-wide, Admin only) ── */
    if (action === 'topbar_save') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'Admin only', code:403 });
      const tb = body.topbar || {};
      const fields = {
        tb_on:    String(tb.on    === 0 || tb.on === '0' || tb.on === false ? '0' : '1'),
        tb_mode:  String(tb.mode  || 'always').slice(0,20),
        tb_size:  String(tb.size  || 'md').slice(0,20),
        tb_style: String(tb.style || 'glass').slice(0,20),
        tb_show:  (String(tb.show  || '').trim() || '-').slice(0,180),
        tb_links: (String(tb.links || '').trim() || '-').slice(0,180),
      };
      for (const k of Object.keys(fields)) {
        await db().query('DELETE FROM settings WHERE type=?', [k]);
        await db().query('INSERT INTO settings (type,value) VALUES (?,?)', [k, fields[k]]);
      }
      return res.json({ ok:true });
    }

    /* ── Save Left Navigation (sidebar) config (app-wide, Admin only) ── */
    if (action === 'sidebar_save') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'Admin only', code:403 });
      const sb = body.sidebar || {};
      const fields = {
        sb_on:    String(sb.on === 0 || sb.on === '0' || sb.on === false ? '0' : '1'),
        sb_width: String(sb.width || 'md').slice(0,20),
        sb_mode:  String(sb.mode  || 'full').slice(0,20),
        sb_style: String(sb.style || 'solid').slice(0,20),
        sb_show:  (String(sb.show  || '').trim() || '-').slice(0,180),
        sb_links: (String(sb.links || '').trim() || '-').slice(0,180),
      };
      for (const k of Object.keys(fields)) {
        await db().query('DELETE FROM settings WHERE type=?', [k]);
        await db().query('INSERT INTO settings (type,value) VALUES (?,?)', [k, fields[k]]);
      }
      return res.json({ ok:true });
    }

    /* ── Trash list ── */
    if (action === 'loan_list_trash') {
      await ensureCreatedByUserCol();
      const [loans] = await db().query(`SELECT l.*, u.display_name AS creator_display_name FROM loans l LEFT JOIN users u ON l.created_by_user = u.username WHERE l.deleted_at IS NOT NULL ORDER BY l.deleted_at DESC`);
      return res.json({ ok:true, loans: loans.map(rowToLoan) });
    }

    /* ── Add infor (Group/Linked To/Status entries are owned by the creating team, if scoped) ── */
    if (action === 'settings_add') {
      const type  = String(body.type ||'').trim();
      const value = String(body.value||'').trim();
      if (!type || !value) return res.json({ ok:false, message:'Missing type or value' });
      await ensureSettingsTeamCol();
      /* An Admin is unscoped, so anything they add stays ownerless = shared with every team. */
      const team = ['groups','linkedTo','statuses'].includes(type) ? teamOwnerOf(_bv) : null;
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

    /* ── Delete infor (a scoped user may only delete Group/Linked To/Status entries their own
         team created — notably this stops a team deleting the shared default statuses) ── */
    if (action === 'settings_delete') {
      const type  = String(body.type||'').trim();
      const value = String(body.value||'').trim();
      await ensureSettingsTeamCol();
      const team = teamOwnerOf(_bv);
      if (team && ['groups','linkedTo','statuses'].includes(type)) {
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
      /* Portal access is an operational call any editor can make, but only when the caller
         actually sent the field — otherwise a save from a screen that doesn't show the toggle
         (eg. the customers form) would silently reopen a portal staff had closed. */
      await ensurePortalClosedCol();
      const portalClosedU = (l.PortalClosed === undefined || l.PortalClosed === null)
        ? (old[0].portal_closed ? 1 : 0)
        : (l.PortalClosed ? 1 : 0);
      await db().query(
        `UPDATE loans SET
           loan_key=?,full_name=?,national_id=?,dob=?,phone=?,gender=?,loan_group=?,
           money=?,loan_status=?,note=?,fb_name=?,fb_url=?,social_media=?,social_id=?,fbid=?,
           photo_url=?,photos=?,social_links=?,paid=?,linked_to=?,loan_tabs=?,restricted=?,portal_closed=?
         WHERE loan_key=? AND deleted_at IS NULL`,
        [newKey, l.FullName||'', l.NationalID||'', l.DOB||'', l.Phone||'',
         l.Gender||'', l.Groups||'', l.Money||0, l.Status||'Normal',
         l.Note||'', sl0u.name||l.FBName||'', sl0u.url||l.URL||'', sl0u.platform||l.FacebookCom||'', sl0u.id||l.ID||'', sl0u.fbid||l.FBID||'',
         l.photo_url||null, photosJsonU, slJsonU, l.Paid ? 1 : 0, l.LinkedTo||null, loanTabsJsonU, restrictedU, portalClosedU, key]
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

    /* ── Open or close one borrower's portal, without rewriting the whole row ── */
    if (action === 'loan_toggle_portal') {
      await ensurePortalClosedCol();
      const key = String(body.key||'').trim();
      const [rows] = await db().query(
        'SELECT portal_closed, full_name FROM loans WHERE loan_key=? AND deleted_at IS NULL', [key]
      );
      if (!rows.length) return res.json({ ok:false, message:'Row not found' });
      const closed = rows[0].portal_closed ? 0 : 1;
      await db().query('UPDATE loans SET portal_closed=? WHERE loan_key=?', [closed, key]);
      logActivity('loan_portal', actor, _bu, rows[0].full_name||'', { closed: !!closed }).catch(()=>{});
      return res.json({ ok:true, portal_closed: closed });
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

    /* ── Mint a sign-in QR for my own account (any signed-in user) ── */
    if (action === 'qr_login_create') {
      await ensureLoginQrTable();
      /* one live code at a time — asking for a new one retires the old */
      await db().query('UPDATE login_qr SET used_at=UTC_TIMESTAMP() WHERE username=? AND used_at IS NULL', [_bu]);
      const token = crypto.randomBytes(18).toString('base64url');
      await db().query(
        'INSERT INTO login_qr (token, username, expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))',
        [token, _bu, QR_LOGIN_SECS]
      );
      const [row] = await db().query(
        "SELECT DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%sZ') AS exp FROM login_qr WHERE token=?", [token]
      );
      return res.json({ ok:true, token, seconds: QR_LOGIN_SECS, expires_at:(row[0]||{}).exp || null });
    }

    /* ── Mint a sign-in QR for somebody else (Admin only) ──
       Scanning this signs the scanner in as that person, so it is a credential
       for the minute it lives: short by design, one at a time per account,
       single use, and written to the activity log with both names on it. An
       Admin can already reset anyone's PIN, so this grants nothing new — but
       unlike a PIN reset it leaves the account working, which is exactly why
       it has to be traceable. ── */
    if (action === 'qr_login_for') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
      const target = String(body.username || '').trim();
      if (!target) return res.json({ ok:false, message:'Username required' });

      const [ur] = await db().query(
        'SELECT username, display_name, role, status FROM users WHERE username=? LIMIT 1', [target]
      );
      if (!ur.length) return res.json({ ok:false, message:'User not found' });
      if (String(ur[0].status).toLowerCase() !== 'active') {
        return res.json({ ok:false, message:'គណនីនេះត្រូវបានបិទ — សូមបើកវាមុន' });
      }

      await ensureLoginQrTable();
      /* one live code at a time — asking for a new one retires the old */
      await db().query('UPDATE login_qr SET used_at=UTC_TIMESTAMP() WHERE username=? AND used_at IS NULL', [target]);
      const token = crypto.randomBytes(18).toString('base64url');
      await db().query(
        'INSERT INTO login_qr (token, username, expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))',
        [token, target, QR_ADMIN_SECS]
      );
      logActivity('qr_login_issued', actor, _bu, target,
                  { for_name: ur[0].display_name || target, role: ur[0].role, seconds: QR_ADMIN_SECS }).catch(()=>{});

      return res.json({
        ok: true, token, seconds: QR_ADMIN_SECS,
        username: ur[0].username,
        name: ur[0].display_name || ur[0].username,
        role: ur[0].role || ''
      });
    }

    /* ── Read a scanned computer's code without acting on it ──
       Approving signs a whole other browser in as this account, so the phone is
       shown what it is about to let in and has to say yes to it explicitly. ── */
    if (action === 'qr_handshake_peek') {
      await ensureLoginHandshakeTable();
      const tok = String(body.token || '').trim();
      if (!tok) return res.json({ ok:false, message:'invalid' });
      const [rows] = await db().query(
        `SELECT device_label, city, region, country, ip, status, used_at,
                (expires_at <= UTC_TIMESTAMP()) AS expired,
                TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), expires_at) AS left_secs
         FROM login_handshake WHERE token=? LIMIT 1`, [tok]
      );
      if (!rows.length) return res.json({ ok:true, state:'invalid' });
      const r = rows[0];
      if (r.used_at)                return res.json({ ok:true, state:'used' });
      if (r.status === 'cancelled') return res.json({ ok:true, state:'cancelled' });
      if (Number(r.expired) === 1)  return res.json({ ok:true, state:'expired' });
      if (r.status === 'approved')  return res.json({ ok:true, state:'approved' });
      return res.json({
        ok:true, state:'pending',
        label: r.device_label || 'Unknown device',
        city: r.city || '', region: r.region || '', country: r.country || '', ip: r.ip || '',
        seconds: Math.max(0, Number(r.left_secs || 0)),
      });
    }

    /* ── Approve it: the waiting computer may now sign in as me ── */
    if (action === 'qr_handshake_approve') {
      await ensureLoginHandshakeTable();
      const tok = String(body.token || '').trim();
      if (!tok) return res.json({ ok:false, message:'invalid' });
      const [rows] = await db().query(
        `SELECT status, used_at, (expires_at <= UTC_TIMESTAMP()) AS expired
         FROM login_handshake WHERE token=? LIMIT 1`, [tok]
      );
      if (!rows.length)                  return res.json({ ok:false, message:'invalid' });
      if (rows[0].used_at)               return res.json({ ok:false, message:'used' });
      if (rows[0].status === 'cancelled') return res.json({ ok:false, message:'cancelled' });
      if (Number(rows[0].expired) === 1) return res.json({ ok:false, message:'expired' });
      if (rows[0].status === 'approved') return res.json({ ok:true, already:true });

      await db().query(
        "UPDATE login_handshake SET username=?, status='approved' WHERE token=? AND status='pending'",
        [_bu, tok]
      );
      logActivity('user_login', _bv.name || _bu, _bu, null, { role: _bv.role, via: 'qr-approve' }).catch(()=>{});
      return res.json({ ok:true });
    }

    /* ── Refuse it — the code dies immediately rather than waiting out its 2 minutes ── */
    if (action === 'qr_handshake_deny') {
      await ensureLoginHandshakeTable();
      const tok = String(body.token || '').trim();
      if (!tok) return res.json({ ok:false, message:'invalid' });
      await db().query("UPDATE login_handshake SET status='cancelled' WHERE token=? AND status='pending'", [tok]);
      return res.json({ ok:true });
    }

    /* ── A device reporting where it actually is ──
       Only ever written by the device itself, for its own session, and only after
       the person allowed it in the browser — there is no way to ask for this on
       someone else's behalf. Stored beside the IP guess rather than over it, so
       the panel can always say which of the two it is showing. ── */
    if (action === 'session_geo') {
      await ensureSessionsTable();
      const dev = String(body.device_id || '').trim();
      const lat = Number(body.lat), lon = Number(body.lon);
      if (!dev) return res.json({ ok:false, message:'missing_device' });
      if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return res.json({ ok:false, message:'bad_coords' });
      }
      let acc = Math.round(Number(body.accuracy));
      if (!isFinite(acc) || acc < 0) acc = null;
      if (acc !== null) acc = Math.min(acc, 100000);

      const [upd] = await db().query(
        `UPDATE user_sessions
         SET gps_lat=?, gps_lon=?, gps_acc=?, gps_at=UTC_TIMESTAMP(), last_seen=UTC_TIMESTAMP()
         WHERE username=? AND device_id=?`,
        [lat, lon, acc, _bu, dev]
      );
      /* The WHERE ties the row to the caller, so naming another device's id simply
         matches nothing — say so rather than reporting a save that never happened. */
      if (!upd.affectedRows) return res.json({ ok:false, message:'no_session' });
      return res.json({ ok:true });
    }

    /* ── Stop sharing: wipe the last fix rather than letting it sit there looking current ── */
    if (action === 'session_geo_clear') {
      await ensureSessionsTable();
      const dev = String(body.device_id || '').trim();
      if (!dev) return res.json({ ok:false, message:'missing_device' });
      await db().query(
        'UPDATE user_sessions SET gps_lat=NULL, gps_lon=NULL, gps_acc=NULL, gps_at=NULL WHERE username=? AND device_id=?',
        [_bu, dev]
      );
      return res.json({ ok:true });
    }

    /* ── My signed-in devices ── */
    if (action === 'sessions_list') {
      await ensureSessionsTable();
      const [rows] = await db().query(
        `SELECT device_id, label, revoked, ip, city, region, country,
                gps_lat, gps_lon, gps_acc,
                DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_utc,
                DATE_FORMAT(last_seen,  '%Y-%m-%dT%H:%i:%sZ') AS seen_utc,
                DATE_FORMAT(gps_at,     '%Y-%m-%dT%H:%i:%sZ') AS gps_utc
         FROM user_sessions WHERE username=? ORDER BY revoked ASC, last_seen DESC LIMIT 20`, [_bu]
      );
      return res.json({ ok:true, max: MAX_DEVICES, sessions: rows });
    }

    if (action === 'sessions_revoke_others') {
      await ensureSessionsTable();
      const keep = String(body.device_id || '').trim();
      const [r] = await db().query(
        'UPDATE user_sessions SET revoked=1 WHERE username=? AND revoked=0 AND device_id<>?',
        [_bu, keep]
      );
      return res.json({ ok:true, revoked: r.affectedRows || 0 });
    }

    if (action === 'session_revoke') {
      await ensureSessionsTable();
      const dev = String(body.device_id || '').trim();
      if (!dev) return res.json({ ok:false, message:'missing device' });
      await db().query('UPDATE user_sessions SET revoked=1 WHERE username=? AND device_id=?', [_bu, dev]);
      return res.json({ ok:true });
    }

    /* ── Create a portal share link ──
       A blank link (the whole portal) stays with the Super Admin and their assistants.
       A link tied to one borrower is open to anyone who can already open that borrower's
       profile — it shows them nothing they cannot already see, and sharing it with the
       customer is the point. */
    if (action === 'qr_token_create') {
      const _forKey = String(body.key || '').trim();
      if (!_forKey) {
        const _isAssistant = Array.isArray(_bv.manages_teams) && _bv.manages_teams.length > 0;
        if (_bv.role !== 'Admin' && !_isAssistant) {
          return res.json({ ok:false, message:'Not allowed', code:403 });
        }
      }
      await ensurePortalTokensTable();

      let _b = { method:null, phone:null, cred:null, name:null };
      if (_forKey) {
        const [lr] = await db().query(
          'SELECT full_name, national_id, phone FROM loans WHERE loan_key=? AND deleted_at IS NULL LIMIT 1',
          [_forKey]
        );
        if (!lr.length)   return res.json({ ok:false, message:'Borrower not found' });
        const _ph = String(lr[0].phone || '').replace(/[\s\-]/g, '');
        if (!_ph)         return res.json({ ok:false, message:'គ្មានលេខទូរស័ព្ទ — មិនអាចបង្កើត QR បាន' });
        const _nid = String(lr[0].national_id || '').replace(/[\s\-]/g, '');
        _b = _nid
          ? { method:'nid',  phone:_ph, cred:_nid, name:lr[0].full_name || '' }
          : { method:'name', phone:_ph, cred:lr[0].full_name || '', name:lr[0].full_name || '' };
      }

      /* Anything that is not one of the offered choices falls back to 5 minutes.
         0 is the explicit "never expires" option. */
      const allowed = [5, 10, 15, 0];
      let mins = Number(body.minutes);
      if (allowed.indexOf(mins) === -1) mins = 5;

      const token = crypto.randomBytes(18).toString('base64url');
      if (mins === 0) {
        await db().query(
          'INSERT INTO portal_tokens (token, created_by, expires_at, b_method, b_phone, b_cred, b_name) VALUES (?,?,NULL,?,?,?,?)',
          [token, _bu, _b.method, _b.phone, _b.cred, _b.name]
        );
        return res.json({ ok:true, token, minutes:0, expires_at:null, borrower:_b.name || null });
      }
      await db().query(
        'INSERT INTO portal_tokens (token, created_by, expires_at, b_method, b_phone, b_cred, b_name) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE),?,?,?,?)',
        [token, _bu, mins, _b.method, _b.phone, _b.cred, _b.name]
      );
      const [row] = await db().query(
        "SELECT DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%sZ') AS expires_utc FROM portal_tokens WHERE token=?",
        [token]
      );
      return res.json({ ok:true, token, minutes:mins, expires_at:(row[0]||{}).expires_utc || null, borrower:_b.name || null });
    }

    /* ── Conversation list — one row per person, newest conversation first ── */
    if (action === 'msg_threads') {
      await ensureMessagesTable();
      await ensureUserPhotoCol();
      const [peers] = await db().query(
        `SELECT CASE WHEN sender=? THEN recipient ELSE sender END AS peer, MAX(id) AS last_id
         FROM messages
         WHERE sender=? OR recipient=?
         GROUP BY peer
         ORDER BY last_id DESC
         LIMIT 40`,
        [_bu, _bu, _bu]
      );
      if (!peers.length) return res.json({ ok:true, threads: [] });

      const ids = peers.map(p => p.last_id);
      const [lastRows] = await db().query(
        `SELECT id, sender, body, image_url, created_at FROM messages WHERE id IN (${ids.map(()=>'?').join(',')})`,
        ids
      );
      const byId = {};
      lastRows.forEach(m => { byId[m.id] = m; });

      const names = peers.map(p => p.peer);
      const [userRows] = await db().query(
        `SELECT username, COALESCE(display_name, username) AS display_name,
                COALESCE(photo_url, '') AS photo_url, last_seen
         FROM users WHERE username IN (${names.map(()=>'?').join(',')})`,
        names
      );
      const byUser = {};
      userRows.forEach(u => { byUser[u.username] = u; });

      const [unRows] = await db().query(
        'SELECT sender, COUNT(*) AS cnt FROM messages WHERE recipient=? AND is_read=0 GROUP BY sender',
        [_bu]
      );
      const unread = {};
      unRows.forEach(r => { unread[r.sender] = Number(r.cnt); });

      const threads = peers.map(p => {
        const m = byId[p.last_id] || {};
        const u = byUser[p.peer]  || {};
        return {
          peer:         p.peer,
          display_name: u.display_name || p.peer,
          photo_url:    u.photo_url    || '',
          last_seen:    u.last_seen    || null,
          body:         m.body      || '',
          image_url:    m.image_url || '',
          from_me:      m.sender === _bu ? 1 : 0,
          created_at:   m.created_at,
          unread:       unread[p.peer] || 0,
        };
      });
      return res.json({ ok:true, threads });
    }

    /* ── Team list (scoped: Admin sees all; Sub Admin sees self + users they created; everyone else sees only self) ── */
    if (action === 'team_list') {
      await ensureUserPhotoCol();
      await ensureUserScopeCols();
      await ensureTeamNameCol();
      let teamWhere = '';
      let teamParams = [];
      const managedTeams = Array.isArray(_bv.manages_teams) ? _bv.manages_teams : [];
      const managesAll   = managedTeams.indexOf('*') !== -1;
      if (_bv.role === 'Sub Admin' && !managesAll) {
        teamWhere = 'WHERE u.created_by=? OR u.username=?';
        teamParams = [_bu, _bu];
      } else if (managesAll) {
        /* '*' wildcard: assistant manages every team — see everyone, same as Admin's own view */
        teamWhere = '';
      } else if (managedTeams.length) {
        /* Assistant: see every managed team's own row (for the manage panel) plus their members */
        const ph = managedTeams.map(()=>'?').join(',');
        teamWhere = `WHERE u.created_by IN (${ph}) OR u.username IN (${ph}) OR u.username=?`;
        teamParams = [...managedTeams, ...managedTeams, _bu];
      } else if (_bv.role !== 'Admin') {
        teamWhere = 'WHERE u.username=?';
        teamParams = [_bu];
      }
      const [users] = await db().query(`
        SELECT u.username, u.display_name, u.role, u.photo_url, u.exp_date, u.status, u.last_seen,
          u.created_by, u.max_normal_users, u.scope_linked_to, u.team_name,
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
      users.forEach(u => { try { u.scope_linked_to = u.scope_linked_to ? JSON.parse(u.scope_linked_to) : []; } catch(e) { u.scope_linked_to = []; } });
      return res.json({ ok: true, users });
    }

    /* ── User list (Admin only) ── */
    if (action === 'user_list') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
      await ensureUserPhotoCol();
      await ensureUserScopeCols();
      await ensureTeamNameCol();
      const [users] = await db().query(
        'SELECT username, role, display_name, exp_date, status, last_seen, photo_url, scope_linked_to, max_normal_users, created_by, team_name, manages_teams FROM users ORDER BY id'
      );
      users.forEach(u => {
        try { u.scope_linked_to = u.scope_linked_to ? JSON.parse(u.scope_linked_to) : []; } catch(e) { u.scope_linked_to = []; }
        try { u.manages_teams  = u.manages_teams  ? JSON.parse(u.manages_teams)  : []; } catch(e) { u.manages_teams  = []; }
      });
      return res.json({ ok:true, users });
    }

    /* ── Ask this one account's devices for their exact position (Admin only) ──
       The switch decides whether the app *asks*. It cannot decide the answer: a
       browser hands over a position only after the person at that device allows
       its own prompt, and they can withdraw it afterwards. ── */
    if (action === 'user_geo_set') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
      const u = String(body.username || '').trim();
      if (!u) return res.json({ ok:false, message:'Username required' });
      await ensureUserDetailCols();
      const on = (body.on === 1 || body.on === '1' || body.on === true) ? 1 : 0;
      const [r] = await db().query('UPDATE users SET geo_req=? WHERE username=?', [on, u]);
      if (!r.affectedRows) return res.json({ ok:false, message:'User not found' });
      /* Turning it off should not leave a stale pin sitting on the map */
      if (!on) {
        await ensureSessionsTable();
        await db().query(
          'UPDATE user_sessions SET gps_lat=NULL, gps_lon=NULL, gps_acc=NULL, gps_at=NULL WHERE username=?', [u]
        );
      }
      logActivity('geo_require', actor, _bu, u, { on: !!on }).catch(()=>{});
      return res.json({ ok:true, on });
    }

    /* ── Which customers have opened their own history, and when ── */
    if (action === 'portal_visits_list') {
      await ensurePortalVisitsTable();
      const [rows] = await db().query(
        `SELECT loan_key, visits, last_ip, last_city, last_region, last_country, last_ua, last_via,
                DATE_FORMAT(first_seen, '%Y-%m-%dT%H:%i:%sZ') AS first_utc,
                DATE_FORMAT(last_seen,  '%Y-%m-%dT%H:%i:%sZ') AS last_utc
         FROM portal_visits`
      );
      return res.json({ ok:true, visits: rows });
    }

    /* ── Every account with the devices it is signed in on (Admin only) ──
         One query per table rather than one per user: the panel wants the whole
         org at once and the session table is capped at two rows per account. ── */
    if (action === 'users_control') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
      await ensureUserPhotoCol();
      await ensureUserScopeCols();
      await ensureTeamNameCol();
      await ensureSessionsTable();
      await ensureUserDetailCols();

      const [users] = await db().query(
        `SELECT username, role, display_name, status, exp_date, photo_url, created_by, team_name,
                COALESCE(geo_req,0) AS geo_req
         FROM users ORDER BY id`
      );
      const [rows] = await db().query(
        `SELECT username, device_id, label, revoked, ip, city, region, country, lat, lon, tz, postal, ua,
                gps_lat, gps_lon, gps_acc,
                DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_utc,
                DATE_FORMAT(last_seen,  '%Y-%m-%dT%H:%i:%sZ') AS seen_utc,
                DATE_FORMAT(gps_at,     '%Y-%m-%dT%H:%i:%sZ') AS gps_utc
         FROM user_sessions ORDER BY revoked ASC, last_seen DESC`
      );
      const byUser = {};
      rows.forEach(r => { (byUser[r.username] = byUser[r.username] || []).push(r); });
      users.forEach(u => { u.sessions = byUser[u.username] || []; });

      return res.json({ ok:true, users, max_devices: MAX_DEVICES });
    }

    /* ── Set a Sub Admin's display team name (Admin only) — deliberately separate from user_update,
         which defaults role to 'Staff Loan' when omitted and would silently demote a Sub Admin ── */
    if (action === 'user_set_team_name') {
      const u = String(body.username||'').trim();
      if (!u) return res.json({ ok:false, message:'Username required' });
      if (!managesTeam(_bv, u)) return res.json({ ok:false, message:'ត្រូវការសិទ្ធគ្រប់គ្រងលើក្រុមនេះ', code:403 });
      await ensureTeamNameCol();
      const teamName = String(body.team_name||'').trim();
      await db().query('UPDATE users SET team_name=? WHERE username=?', [teamName || null, u]);
      return res.json({ ok:true });
    }

    /* ── Move a Normal User to a different Sub Admin's team (Admin only).
         Only reassigns ownership going forward — loan/customer records the user already created
         stay tagged with their original Linked To value, so their old team still sees them; only
         the moved user's own future visibility changes (resolved live via validateAuth). ── */
    if (action === 'user_reassign_team') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
      const _NORMAL_ROLES_RA = ['Staff Loan','Staff','Moderator','Viewer','Tester'];
      const u       = String(body.username||'').trim();
      const newTeam = String(body.new_team||'').trim();
      if (!u || !newTeam) return res.json({ ok:false, message:'Username and new_team required' });
      await ensureUserScopeCols();
      const [targetRows] = await db().query('SELECT role FROM users WHERE username=?', [u]);
      if (!targetRows.length || !_NORMAL_ROLES_RA.includes(targetRows[0].role)) {
        return res.json({ ok:false, message:'អាចផ្ទេរបានតែ Normal User' });
      }
      const [teamRows] = await db().query('SELECT role, max_normal_users FROM users WHERE username=?', [newTeam]);
      if (!teamRows.length || teamRows[0].role !== 'Sub Admin') {
        return res.json({ ok:false, message:'ក្រុមគោលដៅមិនត្រឹមត្រូវទេ' });
      }
      const [cnt] = await db().query('SELECT COUNT(*) AS n FROM users WHERE created_by=? AND username<>?', [newTeam, u]);
      if (cnt[0].n >= (teamRows[0].max_normal_users||0)) {
        return res.json({ ok:false, message:'ក្រុមគោលដៅដល់កំណត់ចំនួន User អតិបរមាហើយ (quota exceeded)' });
      }
      await db().query('UPDATE users SET created_by=? WHERE username=?', [newTeam, u]);
      logActivity('user_reassign_team', actor, _bu, u, { new_team: newTeam }).catch(()=>{});
      return res.json({ ok:true });
    }

    /* ── User add (Admin, Sub Admin creating within their own quota, or an Assistant creating
         within a team they've been granted manages_teams over) ── */
    if (action === 'user_add') {
      const _NORMAL_ROLES = ['Staff Loan','Staff','Moderator','Viewer','Tester'];
      const _isAssistant = Array.isArray(_bv.manages_teams) && _bv.manages_teams.length > 0;
      if (!['Admin','Sub Admin'].includes(_bv.role) && !_isAssistant) return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
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
        /* No scope snapshot here — a Normal User's scope resolves live from their Sub Admin
           (created_by) at auth time, see validateAuth(). */
        createdBy = _bu;
      } else if (_bv.role !== 'Admin' && _isAssistant) {
        /* Assistant creating a Normal User under a Sub Admin team they were granted */
        if (!_NORMAL_ROLES.includes(role)) return res.json({ ok:false, message:'អាចបង្កើតបានតែ Normal User' });
        const team = String(body.team||'').trim();
        if (!managesTeam(_bv, team)) return res.json({ ok:false, message:'អ្នកមិនមានសិទ្ធិគ្រប់គ្រងលើក្រុមនេះទេ', code:403 });
        const [teamRow] = await db().query('SELECT max_normal_users FROM users WHERE username=? AND role="Sub Admin"', [team]);
        if (!teamRow.length) return res.json({ ok:false, message:'ក្រុមគោលដៅមិនត្រឹមត្រូវទេ' });
        const [cnt] = await db().query('SELECT COUNT(*) AS n FROM users WHERE created_by=?', [team]);
        if (cnt[0].n >= (teamRow[0].max_normal_users||0)) return res.json({ ok:false, message:'ដល់កំណត់ចំនួន User អតិបរមាហើយ (quota exceeded)' });
        createdBy = team;
      } else if (role === 'Sub Admin') {
        /* Admin granting scope/quota to a new Sub Admin */
        const g = Array.isArray(body.scope_linked_to) ? body.scope_linked_to : [];
        scopeGroupsJson = JSON.stringify(g);
        maxNormalUsers  = parseInt(body.max_normal_users)||0;
      }

      /* Granting assistant (delegated Sub Admin) authority at creation time is Admin-only. */
      const managesTeamsJson = (_bv.role === 'Admin' && Array.isArray(body.manages_teams))
        ? JSON.stringify(body.manages_teams) : null;

      try {
        await db().query(
          'INSERT INTO users (username, pin, role, display_name, exp_date, status, scope_linked_to, max_normal_users, created_by, manages_teams) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [u, p, role, String(body.display_name||u).trim(),
           body.exp_date||null, body.status||'active', scopeGroupsJson, maxNormalUsers, createdBy, managesTeamsJson]
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
      const _isAssistant  = Array.isArray(_bv.manages_teams) && _bv.manages_teams.length > 0;
      if (!['Admin','Sub Admin'].includes(_bv.role) && !_isAssistant) return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
      await ensureUserScopeCols();
      const u = String(body.username||'').trim();
      if (!u) return res.json({ ok:false, message:'Username required' });
      const [oldRows] = await db().query('SELECT display_name, created_by, role FROM users WHERE username=?', [u]);
      if (!oldRows.length) return res.json({ ok:false, message:'User not found' });
      const targetOldRole = oldRows[0].role;
      if (_bv.role === 'Sub Admin') {
        if (oldRows[0].created_by !== _bu) return res.json({ ok:false, message:'អ្នកអាចកែបានតែ User ដែលអ្នកបានបង្កើត', code:403 });
      } else if (_bv.role !== 'Admin') {
        /* Assistant: allowed either on the Sub Admin account itself (a team they manage), or on
           a Normal User whose created_by is a team they manage */
        const targetTeam = targetOldRole === 'Sub Admin' ? u : oldRows[0].created_by;
        if (!managesTeam(_bv, targetTeam)) return res.json({ ok:false, message:'អ្នកមិនមានសិទ្ធិកែ User នេះទេ', code:403 });
      }
      const oldDisplayName = oldRows[0].display_name || '';
      const newDisplayName = String(body.display_name||u).trim();
      let role = String(body.role||'Staff Loan');
      if (_bv.role !== 'Admin' && targetOldRole !== 'Sub Admin' && !_NORMAL_ROLES.includes(role)) {
        return res.json({ ok:false, message:'អាចកំណត់បានតែ role Normal User' });
      }
      const p = String(body.pin||'').trim();
      /* Switching an account back to active clears the lockout counters — otherwise the very
         next slip would disable it again, since it was already sitting on 3 strikes. */
      if (String(body.status||'active').toLowerCase() === 'active') {
        await ensureAuthGuardCols();
        await db().query('UPDATE users SET fail_pin=0, fail_device=0 WHERE username=?', [u]);
      }
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
      if (managesTeam(_bv, u) && role === 'Sub Admin' && (body.scope_linked_to !== undefined || body.max_normal_users !== undefined)) {
        const g = Array.isArray(body.scope_linked_to) ? body.scope_linked_to : [];
        await db().query('UPDATE users SET scope_linked_to=?, max_normal_users=? WHERE username=?', [JSON.stringify(g), parseInt(body.max_normal_users)||0, u]);
      }
      /* Granting/revoking assistant (delegated Sub Admin) authority is Admin-only. */
      if (_bv.role === 'Admin' && body.manages_teams !== undefined) {
        const mt = Array.isArray(body.manages_teams) ? body.manages_teams : [];
        await db().query('UPDATE users SET manages_teams=? WHERE username=?', [JSON.stringify(mt), u]);
      }
      if (oldDisplayName && newDisplayName && oldDisplayName !== newDisplayName) {
        await db().query('UPDATE loans SET created_by=? WHERE created_by=?', [newDisplayName, oldDisplayName]);
      }
      if (await isNotifEnabled('user')) { try { await sendTelegramEvent('user', { act:'edit', username:u, display_name:newDisplayName, role:String(body.role||'Staff Loan'), status:body.status||'active', actor }); } catch(e) {} }
      logActivity('user_edit', actor, _bu, u, { old_name: oldDisplayName, new_name: newDisplayName }).catch(()=>{});
      return res.json({ ok:true });
    }

    /* ── User delete (Admin; Sub Admin deleting a user they created; or an Assistant deleting a
         user under a team they manage. Cannot delete self.) ── */
    if (action === 'user_delete') {
      const _isAssistantDel = Array.isArray(_bv.manages_teams) && _bv.manages_teams.length > 0;
      if (!['Admin','Sub Admin'].includes(_bv.role) && !_isAssistantDel) return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
      const u = String(body.username||'').trim();
      if (!u) return res.json({ ok:false, message:'Username required' });
      if (u === _bu) return res.json({ ok:false, message:'មិនអាចលុប Account ខ្លួនឯងបាន' });
      if (_bv.role === 'Sub Admin') {
        const [chk] = await db().query('SELECT created_by FROM users WHERE username=?', [u]);
        if (!chk.length || chk[0].created_by !== _bu) return res.json({ ok:false, message:'អ្នកអាចលុបបានតែ User ដែលអ្នកបានបង្កើត', code:403 });
      } else if (_bv.role !== 'Admin') {
        const [chk] = await db().query('SELECT created_by, role FROM users WHERE username=?', [u]);
        if (!chk.length) return res.json({ ok:false, message:'User not found' });
        /* Assistants may remove Normal Users from a team they manage, but not delete the Sub
           Admin account itself — that stays an Admin-only, more structural action. */
        if (chk[0].role === 'Sub Admin' || !managesTeam(_bv, chk[0].created_by)) {
          return res.json({ ok:false, message:'អ្នកមិនមានសិទ្ធិលុប User នេះទេ', code:403 });
        }
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

      if (type === 'details') {
        await ensureUserDetailCols();
        /* Only ever the caller's own row, and only the columns on this list —
           a field name arriving from the client can never reach the SQL. */
        const sets = [], vals = [];
        USER_DETAIL_FIELDS.forEach(f => {
          if (!(f in body)) return;
          let v = body[f];
          v = (v === null || v === undefined) ? '' : String(v).trim();
          if (f === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return;
          sets.push(f + '=?');
          vals.push(v.slice(0, 200) || null);
        });
        /* The email is meant to become a way to sign in, which only works if it
           picks out one account. Two people saving the same address today would
           make that impossible later, so it is refused now while the field is
           still empty for nearly everyone. */
        const _mail = ('email' in body) ? String(body.email || '').trim() : null;
        if (_mail) {
          const [dupe] = await db().query(
            'SELECT username FROM users WHERE email=? AND username<>? LIMIT 1', [_mail, _bu]
          );
          if (dupe.length) return res.json({ ok:false, message:'អ៊ីមែលនេះមានគណនីផ្សេងប្រើរួចហើយ' });
        }

        if (!sets.length) return res.json({ ok:false, message:'គ្មានព័ត៌មានត្រូវធ្វើបច្ចុប្បន្ន' });
        vals.push(_bu);
        await db().query('UPDATE users SET ' + sets.join(', ') + ' WHERE username=?', vals);
        const [rows] = await db().query(
          'SELECT ' + USER_DETAIL_FIELDS.join(', ') + ' FROM users WHERE username=? LIMIT 1', [_bu]
        );
        return res.json({ ok:true, details: rows[0] || {} });
      }

      return res.json({ ok: false, message: 'Invalid type' });
    }

    /* ── My own profile details ── */
    if (action === 'my_details') {
      await ensureUserDetailCols();
      const [rows] = await db().query(
        'SELECT ' + USER_DETAIL_FIELDS.join(', ') + ' FROM users WHERE username=? LIMIT 1', [_bu]
      );
      return res.json({ ok:true, details: rows[0] || {} });
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
