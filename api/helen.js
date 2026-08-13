/**
 * HELEN LOAN — MySQL API Handler
 * Replaces Google Apps Script backend.
 */

import mysql from 'mysql2/promise';

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || '';
const TG_CHAT_ID   = process.env.TG_CHAT_ID   || '';

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
    photo_url:   r.photo_url    || '',
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

/* ── Auth ── */
async function validateAuth(u, p) {
  if (!u || !p) return null;
  const [rows] = await db().query(
    'SELECT username, role, display_name, exp_date FROM helen_users WHERE username=? AND pin=? AND status="active" LIMIT 1',
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
  return { username: user.username, role: user.role||'Staff', name: user.display_name||user.username, expDate };
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
      return res.json({ ok:true, name:v.name, role:v.role, username:v.username, expDate:v.expDate });
    }

    if (action === 'helen_login_alert') return res.json({ ok:true });

    /* ── Auth check for all write/read actions ── */
    const _bu = String((body.auth&&body.auth.u)||body.u||'').trim();
    const _bp = String((body.auth&&body.auth.p)||body.p||'').trim();
    const _bv = await validateAuth(_bu, _bp);
    if (!_bv || _bv.expired) return res.json({ ok:false, message:'auth_required', code:401 });
    const actor = _bv.name || '';
    db().query('UPDATE helen_users SET last_seen=NOW() WHERE username=?', [_bu]).catch(()=>{});

    /* ── All data (loans + infor) ── */
    if (action === 'helen_all') {
      const [loans] = await db().query('SELECT * FROM helen_loans WHERE deleted_at IS NULL ORDER BY loan_key DESC');
      const [infor] = await db().query('SELECT type, value FROM helen_infor ORDER BY id');
      return res.json({
        ok:          true,
        loans:       loans.map(rowToLoan),
        groups:      infor.filter(r=>r.type==='groups').map(r=>r.value),
        statuses:    infor.filter(r=>r.type==='statuses').map(r=>r.value),
        socialMedia: infor.filter(r=>r.type==='socialMedia').map(r=>r.value),
      });
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
      const [loans] = await db().query('SELECT * FROM helen_loans WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
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
      const l = body.loan || {};
      const datePart = l.DateTime ? l.DateTime.substring(0, 10) : new Date().toISOString().substring(0, 10);
      const key = datePart + 'T' + new Date().toISOString().substring(11);
      await db().query(
        `INSERT INTO helen_loans
           (loan_key,full_name,national_id,dob,phone,gender,loan_group,money,loan_status,note,fb_name,fb_url,social_media,social_id,fbid)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [key, l.FullName||'', l.NationalID||'', l.DOB||'', l.Phone||'',
         l.Gender||'', l.Groups||'', l.Money||0, l.Status||'Normal',
         l.Note||'', l.FBName||'', l.URL||'', l.FacebookCom||'', l.ID||'', l.FBID||'']
      );
      const [rows] = await db().query('SELECT * FROM helen_loans WHERE loan_key=?', [key]);
      try { await sendTelegram(rows[0], 'add', actor); } catch(e) {}
      return res.json({ ok:true });
    }

    /* ── Update loan ── */
    if (action === 'helen_loan_update') {
      const key = String(body.key||'').trim();
      const l   = body.loan || {};
      const [old] = await db().query('SELECT * FROM helen_loans WHERE loan_key=? AND deleted_at IS NULL', [key]);
      if (!old.length) return res.json({ ok:false, message:'Row not found' });
      const newKey = l.DateTime || key;
      await db().query(
        `UPDATE helen_loans SET
           loan_key=?,full_name=?,national_id=?,dob=?,phone=?,gender=?,loan_group=?,
           money=?,loan_status=?,note=?,fb_name=?,fb_url=?,social_media=?,social_id=?,fbid=?
         WHERE loan_key=? AND deleted_at IS NULL`,
        [newKey, l.FullName||'', l.NationalID||'', l.DOB||'', l.Phone||'',
         l.Gender||'', l.Groups||'', l.Money||0, l.Status||'Normal',
         l.Note||'', l.FBName||'', l.URL||'', l.FacebookCom||'', l.ID||'', l.FBID||'', key]
      );
      const [updated] = await db().query('SELECT * FROM helen_loans WHERE loan_key=?', [newKey]);
      try { await sendTelegram(updated[0], 'edit', actor, old[0]); } catch(e) {}
      return res.json({ ok:true, message:'Updated' });
    }

    /* ── Delete loan (soft) ── */
    if (action === 'helen_loan_delete') {
      const key = String(body.key||'').trim();
      const [rows] = await db().query('SELECT * FROM helen_loans WHERE loan_key=? AND deleted_at IS NULL', [key]);
      if (!rows.length) return res.json({ ok:false, message:'Row not found' });
      await db().query('UPDATE helen_loans SET deleted_at=NOW() WHERE loan_key=?', [key]);
      try { await sendTelegram(rows[0], 'delete', actor); } catch(e) {}
      return res.json({ ok:true, message:'Deleted' });
    }

    /* ── Recover loan ── */
    if (action === 'helen_loan_recover') {
      const key = String(body.key||'').trim();
      const [r] = await db().query(
        'UPDATE helen_loans SET deleted_at=NULL WHERE loan_key=? AND deleted_at IS NOT NULL', [key]);
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
      const [users] = await db().query(
        'SELECT username, role, display_name, exp_date, status, last_seen FROM helen_users ORDER BY id'
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
      return res.json({ ok:true });
    }

    /* ── User update (Admin only) ── */
    if (action === 'helen_user_update') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
      const u = String(body.username||'').trim();
      if (!u) return res.json({ ok:false, message:'Username required' });
      const p = String(body.pin||'').trim();
      if (p) {
        await db().query(
          'UPDATE helen_users SET pin=?,role=?,display_name=?,exp_date=?,status=? WHERE username=?',
          [p, String(body.role||'Staff Loan'), String(body.display_name||u).trim(),
           body.exp_date||null, body.status||'active', u]
        );
      } else {
        await db().query(
          'UPDATE helen_users SET role=?,display_name=?,exp_date=?,status=? WHERE username=?',
          [String(body.role||'Staff Loan'), String(body.display_name||u).trim(),
           body.exp_date||null, body.status||'active', u]
        );
      }
      return res.json({ ok:true });
    }

    /* ── User delete (Admin only, cannot delete self) ── */
    if (action === 'helen_user_delete') {
      if (_bv.role !== 'Admin') return res.json({ ok:false, message:'ត្រូវការសិទ្ធ Admin', code:403 });
      const u = String(body.username||'').trim();
      if (!u) return res.json({ ok:false, message:'Username required' });
      if (u === _bu) return res.json({ ok:false, message:'មិនអាចលុប Account ខ្លួនឯងបាន' });
      await db().query('DELETE FROM helen_users WHERE username=?', [u]);
      return res.json({ ok:true });
    }

    return res.json({ ok:false, message:'Unknown action: ' + action });

  } catch(err) {
    console.error('[helen-api]', err.message);
    return res.status(500).json({ ok:false, message: err.message || 'Server error' });
  }
}
