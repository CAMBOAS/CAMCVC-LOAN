/**
 * HELEN LOAN — Google Apps Script
 * ════════════════════════════════════════
 * Standalone Apps Script for HELEN LOAN system.
 * Independent from CAMBO sales system.
 *
 * Google Sheets required:
 *  • HelenLoan   — main borrower data
 *  • HelenLoanT  — trash (soft delete)
 *  • HelenInfor  — col A: Groups, col B: Statuses
 *
 * Deploy: Extensions > Apps Script > Deploy > New deployment
 *         Type: Web app | Execute as: Me | Who has access: Anyone
 * ════════════════════════════════════════
 */

const TZ             = 'Asia/Phnom_Penh';
const LOAN_SHEET     = 'HelenLoan';
const LOAN_HEADER    = ['DateTime','FullName','NationalID','DOB','Gender','Phone','Groups','Status','Money','Note','FBName','URL','FacebookCom','ID','FBID','Code','LinkedTo'];
const CACHE_KEY_ALL  = 'helen_all_v1';
const CACHE_TTL_SEC  = 300; // 5 minutes
const USERS_SHEET    = 'HelenUsers'; // cols: A=Username | B=PIN | C=Status(Active/Inactive) | D=Role(Admin/Staff) | E=DisplayName | F=ExpiryDate(YYYY-MM-DD)

/* ── Telegram Config ── បំពេញ BOT_TOKEN និង CHAT_ID ── */
const TG_BOT_TOKEN = '8665831170:AAF-affx337A48GnTGHuWRe3wuvPDvtnYdo';
const TG_CHAT_ID   = '-5082132643';

/* ════════════════════════════════════════
   AUTH HELPER
   ════════════════════════════════════════ */
function validateAuth_(u, p) {
  if (!u || !p) return null;
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USERS_SHEET);
    if (!sh || sh.getLastRow() <= 1) return null;
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues(); // 6 cols: A-F
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === u &&
          String(rows[i][1]).trim() === p &&
          String(rows[i][2]).trim().toLowerCase() === 'active') {

        /* Column F — ExpiryDate (YYYY-MM-DD). Empty = no expiry. */
        var expRaw  = rows[i][5];
        var expDate = '';
        if (expRaw) {
          expDate = expRaw instanceof Date
            ? Utilities.formatDate(expRaw, TZ, 'yyyy-MM-dd')
            : String(expRaw).trim();
        }
        if (expDate) {
          var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
          if (today > expDate) return { expired: true };
        }

        return {
          username: String(rows[i][0]).trim(),
          role:     String(rows[i][3] || 'Staff').trim(),
          name:     String(rows[i][4] || rows[i][0]).trim(),
          expDate:  expDate
        };
      }
    }
  } catch(ex) {}
  return null;
}

/* ════════════════════════════════════════
   HTTP HANDLERS
   ════════════════════════════════════════ */
function doGet(e) {
  try {
    /* Write actions via GET ?body=... — check FIRST before action defaults to 'status' */
    if (e && e.parameter && e.parameter.body) {
      return doPost({ postData: { contents: e.parameter.body } });
    }
    const action = String((e && e.parameter && e.parameter.action) || 'status').trim();

    /* ── Public: no auth ── */
    if (action === 'status') return jsonOutput_({ ok:true, status:'running', message:'HELEN LOAN API is working.' });
    if (action === 'helen_login') {
      var _lr = validateAuth_(String(e.parameter.u||'').trim(), String(e.parameter.p||'').trim());
      if (!_lr) return jsonOutput_({ ok:false, message:'ឈ្មោះ ឬ PIN មិនត្រូវ' });
      if (_lr.expired) return jsonOutput_({ ok:false, message:'គណនីបានផុតកំណត់ — សូមទំនាក់ទំនង Admin', code:'expired' });
      try { sendLoginNotify_(_lr); } catch(e) {}
      return jsonOutput_({ ok:true, name:_lr.name, role:_lr.role, username:_lr.username, expDate:_lr.expDate });
    }

    /* ── Auth check for all other GET actions ── */
    var _au = String(e.parameter.u||'').trim();
    var _ap = String(e.parameter.p||'').trim();
    var _av = validateAuth_(_au, _ap);
    if (!_av || _av.expired) return jsonOutput_({ ok:false, message:'auth_required', code:401 });

    if (action === 'helen_loan_list') return jsonOutput_({ ok:true, loans: listHelenLoans_() });
    if (action === 'helen_loan_trash')return jsonOutput_({ ok:true, loans: listHelenLoanTrash_() });
    if (action === 'helen_infor')     return jsonOutput_({ ok:true, groups: listHelenInfor_('groups'), statuses: listHelenInfor_('statuses'), websites: listHelenInforWebsites_() });
    if (action === 'helen_all') {
      const cache = CacheService.getScriptCache();
      const hit   = cache.get(CACHE_KEY_ALL);
      if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
      const ss    = SpreadsheetApp.getActiveSpreadsheet();
      const infor = listAllHelenInfor_(ss);
      const json  = JSON.stringify({ ok:true, loans: listHelenLoans_(ss), groups: infor.groups, statuses: infor.statuses, socialMedia: infor.socialMedia, websites: infor.websites, linkedTo: infor.linkedTo });
      cache.put(CACHE_KEY_ALL, json, CACHE_TTL_SEC);
      return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'helen_sheet_url') {
      const ss  = SpreadsheetApp.getActiveSpreadsheet();
      const sh1 = ss.getSheetByName(LOAN_SHEET);
      const sh2 = ss.getSheetByName('HelenLoanT');
      const base = ss.getUrl();
      return jsonOutput_({
        ok: true,
        loan:  base + '#gid=' + (sh1 ? sh1.getSheetId() : 0),
        loanT: sh2 ? base + '#gid=' + sh2.getSheetId() : base
      });
    }
    /* Login verification */
    if (action === 'verify_login') {
      const loginSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Login');
      if (!loginSheet) return jsonOutput_({ success: false, message: 'Login sheet not found' });
      const loginData = loginSheet.getDataRange().getValues();
      const acct = String((e.parameter.account  || '')).trim();
      const pass = String((e.parameter.password || '')).trim();
      let matched = false;
      for (let i = 1; i < loginData.length; i++) {
        if (String(loginData[i][0]).trim() === acct && String(loginData[i][1]).trim() === pass) {
          matched = true; break;
        }
      }
      return jsonOutput_({ success: matched });
    }
    /* Simple key-based write actions via GET (file:// CORS workaround) */
    if (action === 'helen_loan_delete') {
      const key = String(e.parameter.key || '').trim();
      var _bvDel = null;
      try { _bvDel = validateAuth_(String(e.parameter.u||'').trim(), String(e.parameter.p||'').trim()); } catch(ex_) {}
      const deleted = deleteHelenLoan_(key, _bvDel && _bvDel.name ? _bvDel.name : '');
      return jsonOutput_({ ok: deleted, message: deleted ? 'Deleted' : 'Row not found' });
    }
    if (action === 'helen_loan_recover') {
      const key = String(e.parameter.key || '').trim();
      const recovered = recoverHelenLoan_(key);
      return jsonOutput_({ ok: recovered, message: recovered ? 'Recovered' : 'Row not found' });
    }
    if (action === 'helen_loan_perm_delete') {
      const key = String(e.parameter.key || '').trim();
      const done = permDeleteHelenLoan_(key);
      return jsonOutput_({ ok: done, message: done ? 'Deleted' : 'Row not found' });
    }
    if (action === 'helen_infor_delete') {
      return jsonOutput_(deleteHelenInfor_(e.parameter.type || '', e.parameter.value || ''));
    }
    /* Write actions via GET ?body=... (add/update — body check still available) */
    if (e && e.parameter && e.parameter.body) {
      return doPost({ postData: { contents: e.parameter.body } });
    }
    return jsonOutput_({ ok:false, message:'Unknown action: ' + action });
  } catch(err) {
    return jsonOutput_({ ok:false, message: err.message });
  }
}

function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents || '{}');
    const action = String(body.action || '').trim();

    /* ── Public: login ── */
    if (action === 'helen_login') {
      var _lr2 = validateAuth_(String(body.username||'').trim(), String(body.pin||'').trim());
      if (!_lr2) return jsonOutput_({ ok:false, message:'ឈ្មោះ ឬ PIN មិនត្រូវ' });
      if (_lr2.expired) return jsonOutput_({ ok:false, message:'គណនីបានផុតកំណត់ — សូមទំនាក់ទំនង Admin', code:'expired' });
      try { sendLoginNotify_(_lr2); } catch(e) {}
      return jsonOutput_({ ok:true, name:_lr2.name, role:_lr2.role, username:_lr2.username, expDate:_lr2.expDate });
    }

    /* ── Public: login fail alert ── */
    if (action === 'helen_login_alert') {
      var alertUser    = String(body.username || '').trim();
      var alertReason  = String(body.reason   || 'wrong').trim();
      var alertAttempt = parseInt(body.attempt, 10) || 2;
      try { sendLoginFailAlert_(alertUser, alertReason, alertAttempt); } catch(ex) {}
      return jsonOutput_({ ok: true });
    }

    /* ── Auth check for all write actions ── */
    var _bu = String((body.auth&&body.auth.u)||'').trim();
    var _bp = String((body.auth&&body.auth.p)||'').trim();
    var _bv = validateAuth_(_bu, _bp);
    if (!_bv || _bv.expired) return jsonOutput_({ ok:false, message:'auth_required', code:401 });

    if (action === 'helen_loan_add') {
      addHelenLoan_(body.loan || {}, _bv.name);
      return jsonOutput_({ ok:true });
    }
    if (action === 'helen_loan_update') {
      const updated = updateHelenLoan_(body.key, body.loan || {}, _bv.name);
      return jsonOutput_({ ok:updated, message: updated ? 'Updated' : 'Row not found' });
    }
    if (action === 'helen_loan_delete') {
      const deleted = deleteHelenLoan_(body.key, _bv.name);
      return jsonOutput_({ ok:deleted, message: deleted ? 'Deleted' : 'Row not found' });
    }
    if (action === 'helen_loan_perm_delete') {
      const done = permDeleteHelenLoan_(body.key);
      return jsonOutput_({ ok:done, message: done ? 'Permanently deleted' : 'Row not found' });
    }
    if (action === 'helen_loan_recover') {
      const recovered = recoverHelenLoan_(body.key);
      return jsonOutput_({ ok:recovered, message: recovered ? 'Recovered' : 'Row not found in trash' });
    }
    if (action === 'helen_infor_add') {
      const result = addHelenInfor_(body.type, body.value);
      return jsonOutput_(result);
    }
    if (action === 'helen_infor_delete') {
      const result = deleteHelenInfor_(body.type, body.value);
      return jsonOutput_(result);
    }
    return jsonOutput_({ ok:false, message:'Unknown action: ' + action });
  } catch(err) {
    return jsonOutput_({ ok:false, message: err.message });
  }
}

/* ════════════════════════════════════════
   HELEN LOAN FUNCTIONS
   ════════════════════════════════════════ */

function listHelenLoans_(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(LOAN_SHEET);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, LOAN_HEADER.length).getValues();
  return data.map(function(r) {
    const obj = {};
    LOAN_HEADER.forEach(function(col, i) {
      if (r[i] instanceof Date) {
        obj[col] = col === 'DOB'
          ? Utilities.formatDate(r[i], TZ, 'dd/MM/yyyy')
          : Utilities.formatDate(r[i], TZ, "yyyy-MM-dd'T'HH:mm:ss");
      } else {
        obj[col] = String(r[i] || '');
      }
    });
    return obj;
  }).filter(function(r) { return r.FullName; });
}

function listHelenLoanTrash_() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('HelenLoanT');
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, LOAN_HEADER.length).getValues();
  return data.map(function(r) {
    const obj = {};
    LOAN_HEADER.forEach(function(col, i) {
      if (r[i] instanceof Date) {
        obj[col] = col === 'DOB'
          ? Utilities.formatDate(r[i], TZ, 'dd/MM/yyyy')
          : Utilities.formatDate(r[i], TZ, "yyyy-MM-dd'T'HH:mm:ss");
      } else {
        obj[col] = String(r[i] || '');
      }
    });
    return obj;
  }).filter(function(r) { return r.FullName; });
}

function listHelenInforWebsites_() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('HelenInfor');
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const data = sheet.getRange(2, 4, lastRow - 1, 2).getValues();
  return data
    .map(function(r) { return { name: String(r[0]||'').trim(), url: String(r[1]||'').trim() }; })
    .filter(function(r) { return r.name && r.url; });
}

function listHelenInfor_(type) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('HelenInfor');
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return [];
  const col  = (type === 'statuses') ? 2 : (type === 'socialMedia') ? 3 : (type === 'linkedTo') ? 6 : 1;
  const data = sheet.getRange(1, col, lastRow, 1).getValues();
  return data.map(function(r) { return String(r[0] || '').trim(); }).filter(Boolean);
}

/* Read HelenInfor sheet once and return all columns — avoids 4 separate getValues() calls */
function listAllHelenInfor_(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('HelenInfor');
  if (!sheet) return { groups:[], statuses:[], socialMedia:[], websites:[], linkedTo:[] };
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return { groups:[], statuses:[], socialMedia:[], websites:[], linkedTo:[] };
  const data      = sheet.getRange(1, 1, lastRow, 6).getValues();
  const groups    = [], statuses = [], socialMedia = [], websites = [], linkedTo = [];
  data.forEach(function(r) {
    const g = String(r[0]||'').trim(); if (g) groups.push(g);
    const s = String(r[1]||'').trim(); if (s) statuses.push(s);
    const m = String(r[2]||'').trim(); if (m) socialMedia.push(m);
    const n = String(r[3]||'').trim(), u = String(r[4]||'').trim();
    if (n && u) websites.push({ name:n, url:u });
    const l = String(r[5]||'').trim(); if (l) linkedTo.push(l);
  });
  return { groups, statuses, socialMedia, websites, linkedTo };
}

function invalidateAllCache_() {
  try { CacheService.getScriptCache().remove(CACHE_KEY_ALL); } catch(e) {}
}

function nextCode_() {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var codeCol = LOAN_HEADER.indexOf('Code') + 1;
  var max     = 0;
  [LOAN_SHEET, 'HelenLoanT'].forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() <= 1) return;
    var vals = sh.getRange(2, codeCol, sh.getLastRow() - 1, 1).getValues();
    vals.forEach(function(r) {
      var n = parseInt(String(r[0] || '').trim(), 10);
      if (!isNaN(n) && n > max) max = n;
    });
  });
  var next = String(max + 1);
  while (next.length < 4) next = '0' + next;
  return next;
}

function addHelenInfor_(type, value) {
  invalidateAllCache_();
  if (!value || !String(value).trim()) return { ok:false, message:'Value is empty' };
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('HelenInfor') || ss.insertSheet('HelenInfor');
  const col   = (type === 'statuses') ? 2 : (type === 'socialMedia') ? 3 : (type === 'linkedTo') ? 6 : 1;
  const val   = String(value).trim();
  const lastRow = sheet.getLastRow();
  if (lastRow > 0) {
    const existing = sheet.getRange(1, col, lastRow, 1).getValues().map(r => String(r[0]||'').trim());
    if (existing.includes(val)) return { ok:false, message:'Already exists' };
  }
  var nextRow = 1;
  if (lastRow > 0) {
    const colData = sheet.getRange(1, col, lastRow, 1).getValues();
    for (var i = 0; i < colData.length; i++) {
      if (!String(colData[i][0]||'').trim()) { nextRow = i + 1; break; }
      nextRow = i + 2;
    }
  }
  sheet.getRange(nextRow, col).setValue(val);
  return { ok:true, message:'Added' };
}

function deleteHelenInfor_(type, value) {
  invalidateAllCache_();
  if (!value) return { ok:false, message:'Value is empty' };
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('HelenInfor');
  if (!sheet) return { ok:false, message:'Sheet not found' };
  const col     = (type === 'statuses') ? 2 : (type === 'socialMedia') ? 3 : (type === 'linkedTo') ? 6 : 1;
  const val     = String(value).trim();
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return { ok:false, message:'Not found' };
  const data = sheet.getRange(1, col, lastRow, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]||'').trim() === val) {
      sheet.getRange(i + 1, col).clearContent();
      return { ok:true, message:'Deleted' };
    }
  }
  return { ok:false, message:'Not found' };
}

function findHelenLoanRow_(key, sheet) {
  if (!sheet) sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOAN_SHEET);
  if (!sheet) return -1;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;
  const vals = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    var cell    = vals[i][0];
    var cellStr = cell instanceof Date ? Utilities.formatDate(cell, TZ, "yyyy-MM-dd'T'HH:mm:ss") : String(cell || '');
    if (cellStr === key) return i + 2;
  }
  return -1;
}

function updateHelenLoan_(key, loan, actorName) {
  invalidateAllCache_();
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(LOAN_SHEET);
  if (!sheet) return false;
  const rowNum = findHelenLoanRow_(key, sheet);
  if (rowNum < 0) return false;
  /* Snapshot old data before overwrite — used for Before/After Telegram */
  const oldRowData = sheet.getRange(rowNum, 1, 1, LOAN_HEADER.length).getValues()[0];
  var oldLoan = {};
  LOAN_HEADER.forEach(function(col, i) { oldLoan[col] = oldRowData[i]; });
  const row = [
    String(loan.DateTime   || key).trim(),
    String(loan.FullName   || '').trim(),
    String(loan.NationalID || '').trim(),
    String(loan.DOB        || '').trim(),
    String(loan.Gender     || '').trim(),
    String(loan.Phone      || '').trim(),
    String(loan.Groups     || '').trim(),
    String(loan.Status     || '').trim(),
    loan.Money ? Number(loan.Money) : '',
    String(loan.Note       || '').trim(),
    String(loan.FBName      || '').trim(),
    String(loan.URL         || '').trim(),
    String(loan.FacebookCom || '').trim(),
    String(loan.ID          || '').trim(),
    String(loan.FBID        || '').trim(),
    String(loan.Code        || '').trim(),
    String(loan.LinkedTo !== undefined ? loan.LinkedTo : (oldLoan.LinkedTo || '')).trim(),
  ];
  sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
  try { sendTelegramNotify_(loan, loan.DateTime || key, 'edit', actorName, oldLoan); } catch(e) {}
  return true;
}

function deleteHelenLoan_(key, actorName) {
  invalidateAllCache_();
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(LOAN_SHEET);
  if (!sheet) return false;
  const rowNum = findHelenLoanRow_(key, sheet);
  if (rowNum < 0) return false;
  const rowData = sheet.getRange(rowNum, 1, 1, LOAN_HEADER.length).getValues()[0];
  var trash = ss.getSheetByName('HelenLoanT');
  if (!trash) {
    trash = ss.insertSheet('HelenLoanT');
    trash.getRange(1, 1, 1, LOAN_HEADER.length).setValues([LOAN_HEADER]);
    trash.getRange(1, 1, 1, LOAN_HEADER.length).setFontWeight('bold');
    trash.setFrozenRows(1);
  }
  const lastTrash = trash.getLastRow();
  if (lastTrash > 1) trash.insertRowBefore(2);
  const destRow = lastTrash > 1 ? 2 : trash.getLastRow() + 1;
  trash.getRange(destRow, 1, 1, rowData.length).setValues([rowData]);
  sheet.deleteRow(rowNum);
  try {
    var loanObj = {};
    LOAN_HEADER.forEach(function(col, i) { loanObj[col] = rowData[i]; });
    sendTelegramNotify_(loanObj, loanObj.DateTime || key, 'delete', actorName);
  } catch(e) {}
  return true;
}

function permDeleteHelenLoan_(key) {
  invalidateAllCache_();
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const trash = ss.getSheetByName('HelenLoanT');
  if (!trash) return false;
  const lastRow = trash.getLastRow();
  if (lastRow < 2) return false;
  const keys = trash.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    var val    = keys[i][0];
    var valStr = val instanceof Date ? Utilities.formatDate(val, TZ, "yyyy-MM-dd'T'HH:mm:ss") : String(val || '');
    if (valStr === key) { trash.deleteRow(i + 2); return true; }
  }
  return false;
}

function recoverHelenLoan_(key) {
  invalidateAllCache_();
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const trash = ss.getSheetByName('HelenLoanT');
  if (!trash) return false;
  const lastRow = trash.getLastRow();
  if (lastRow < 2) return false;
  const keys = trash.getRange(2, 1, lastRow - 1, 1).getValues();
  let rowNum = -1;
  for (var i = 0; i < keys.length; i++) {
    var val    = keys[i][0];
    var valStr = val instanceof Date ? Utilities.formatDate(val, TZ, "yyyy-MM-dd'T'HH:mm:ss") : String(val || '');
    if (valStr === key) { rowNum = i + 2; break; }
  }
  if (rowNum < 0) return false;
  const rowData = trash.getRange(rowNum, 1, 1, LOAN_HEADER.length).getValues()[0];
  let sheet = ss.getSheetByName(LOAN_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(LOAN_SHEET);
    sheet.getRange(1, 1, 1, LOAN_HEADER.length).setValues([LOAN_HEADER]);
    sheet.getRange(1, 1, 1, LOAN_HEADER.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  const lastLoan = sheet.getLastRow();
  if (lastLoan >= 1) sheet.insertRowBefore(2);
  const destRow = lastLoan >= 1 ? 2 : 1;
  sheet.getRange(destRow, 1, 1, rowData.length).setValues([rowData]);
  trash.deleteRow(rowNum);
  return true;
}

function addHelenLoan_(loan, actorName) {
  invalidateAllCache_();
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(LOAN_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(LOAN_SHEET);
    sheet.getRange(1, 1, 1, LOAN_HEADER.length).setValues([LOAN_HEADER]);
    sheet.getRange(1, 1, 1, LOAN_HEADER.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  const now  = loan.DateTime
    ? String(loan.DateTime).trim()
    : Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss");
  const code = nextCode_();
  const row  = [
    now,
    String(loan.FullName    || '').trim(),
    String(loan.NationalID  || '').trim(),
    String(loan.DOB         || '').trim(),
    String(loan.Gender      || '').trim(),
    String(loan.Phone       || '').trim(),
    String(loan.Groups      || '').trim(),
    String(loan.Status      || '').trim(),
    loan.Money ? Number(loan.Money) : '',
    String(loan.Note        || '').trim(),
    String(loan.FBName      || '').trim(),
    String(loan.URL         || '').trim(),
    String(loan.FacebookCom || '').trim(),
    String(loan.ID          || '').trim(),
    String(loan.FBID        || '').trim(),
    code,
    String(loan.LinkedTo    || '').trim(),
  ];
  if (sheet.getLastRow() > 1) sheet.insertRowBefore(2);
  sheet.getRange(2, 1, 1, row.length).setValues([row]);

  /* ── ផ្ញើ Telegram notification ── */
  try { sendTelegramNotify_(loan, now, 'add', actorName); } catch(e) {}
}

/* ════════════════════════════════════════
   TELEGRAM NOTIFICATION
   ════════════════════════════════════════ */
function sendLoginFailAlert_(username, reason, attempt) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;
  var now     = new Date();
  var dateStr = Utilities.formatDate(now, TZ, 'dd/MM/yyyy');
  var timeStr = Utilities.formatDate(now, TZ, 'hh:mm a');
  var label   = reason === 'expired'
    ? '⏰ Account Expired'
    : '🔐 Incorrect Username or PIN';
  var msg = '🚨 *Login Alert — HELEN LOAN*\n'
    + '━━━━━━━━━━━━━━━━━━\n'
    + '👤 Username: '  + (username || '—') + '\n'
    + '❌ Reason: '    + label             + '\n'
    + '🔁 Attempt: #'  + attempt           + '\n'
    + '📅 Date: '      + dateStr           + '\n'
    + '🕐 Time: '      + timeStr;
  try {
    UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + TG_BOT_TOKEN + '/sendMessage',
      {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        payload: JSON.stringify({ chat_id: TG_CHAT_ID, text: msg, parse_mode: 'Markdown' })
      }
    );
  } catch(ex) {}
}

function sendLoginNotify_(user) {
  if (!TG_BOT_TOKEN || TG_BOT_TOKEN === 'YOUR_BOT_TOKEN') return;
  if (!TG_CHAT_ID   || TG_CHAT_ID   === 'YOUR_CHAT_ID')   return;
  var now     = new Date();
  var dateStr = Utilities.formatDate(now, TZ, 'dd/MM/yyyy');
  var timeStr = Utilities.formatDate(now, TZ, 'hh:mm a');
  var expLine = '';
  if (user.expDate) {
    var expMs    = new Date(user.expDate + 'T23:59:59').getTime();
    var daysLeft = Math.ceil((expMs - now.getTime()) / 86400000);
    var warn     = daysLeft <= 3 ? ' ⚠️' : '';
    expLine = '\n⏳ ផុតកំណត់៖ ' + user.expDate + ' (' + daysLeft + ' ថ្ងៃ' + warn + ')';
  }
  var msg = '🔐 *ចូលប្រើប្រាស់ — HELEN LOAN*\n'
    + '━━━━━━━━━━━━━━━━━━\n'
    + '👤 ឈ្មោះ៖ ' + user.name + '\n'
    + '🎭 Role៖ '   + user.role + '\n'
    + '📅 ថ្ងៃ៖ '   + dateStr   + '\n'
    + '🕐 ម៉ោង៖ '  + timeStr   + expLine;
  try {
    UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + TG_BOT_TOKEN + '/sendMessage',
      {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        payload: JSON.stringify({ chat_id: TG_CHAT_ID, text: msg, parse_mode: 'Markdown' })
      }
    );
  } catch(ex) {}
}

function sendTelegramNotify_(loan, dateTime, action, actorName, oldLoan) {
  if (!TG_BOT_TOKEN || TG_BOT_TOKEN === 'YOUR_BOT_TOKEN') return;
  if (!TG_CHAT_ID   || TG_CHAT_ID   === 'YOUR_CHAT_ID')   return;
  action = action || 'add';

  function fmtDt(dt) {
    try {
      var d = new Date(dt instanceof Date ? dt : String(dt));
      return Utilities.formatDate(d, TZ, 'dd/MM/yyyy');
    } catch(e) { return String(dt || '').substring(0, 10); }
  }

  function loanBlock(l, dt) {
    var name   = String(l.FullName    || '—').trim();
    var nid    = String(l.NationalID  || '—').trim();
    var phone  = String(l.Phone       || '—').trim();
    var gender = String(l.Gender      || '—').trim();
    var group  = String(l.Groups      || '—').trim();
    var money  = l.Money ? '$' + Number(l.Money).toFixed(2).replace(/\.00$/, '') : '—';
    var status = String(l.Status      || '—').trim();
    var fbid   = String(l.FBID        || '').trim();
    return '👤 ឈ្មោះ: '      + name        + '\n'
      + '🪪 NID: '            + nid         + '\n'
      + '📱 ទូរស័ព្ទ: '       + phone       + '\n'
      + '⚧ ភេទ: '             + gender      + '\n'
      + '👥 ក្រុម: '           + group       + '\n'
      + '💵 ចំនួនប្រាក់: '     + money       + '\n'
      + '📊 ស្ថានភាព: '        + status      + '\n'
      + '📅 កាលបរិច្ឆេទ: '    + fmtDt(dt)  + '\n'
      + (fbid ? '🔗 FBID: '   + fbid        + '\n' : '');
  }

  var header = action === 'edit' ? '✏️ *ទិន្នន័យត្រូវបានកែសម្រួល*\n━━━━━━━━━━━━━━━\n' : '';

  var msg;
  if (action === 'edit' && oldLoan) {
    var actorLine = actorName ? '─────────────────\n' + 'ទិន្នន័យត្រូវបានកែសម្រួលដោយ: ' + actorName : '';
    msg = header
      + '*Before*\n'
      + loanBlock(oldLoan, oldLoan.DateTime || dateTime)
      + '─────────────────\n'
      + '*After*\n'
      + loanBlock(loan, dateTime)
      + actorLine;
  } else if (action === 'delete') {
    var actorLine = actorName ? '━━━━━━━━━━━━━━━\n🗑 ទិន្នន័យត្រូវបានលុបដោយ៖ ' + actorName : '';
    msg = loanBlock(loan, dateTime) + actorLine;
  } else {
    var actorLine = actorName ? '─────────────────\n' + 'បញ្ចូលទិន្នន័យដោយ: ' + actorName : '';
    msg = loanBlock(loan, dateTime) + actorLine;
  }

  UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + TG_BOT_TOKEN + '/sendMessage',
    {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        chat_id:    TG_CHAT_ID,
        text:       msg,
        parse_mode: 'Markdown'
      })
    }
  );
}

/* ════════════════════════════════════════
   KEEP-WARM — prevents cold start delay
   Run setupKeepWarmTrigger() ONCE manually
   ════════════════════════════════════════ */
function keepWarm() {
  SpreadsheetApp.getActiveSpreadsheet().getName();
}

function setupKeepWarmTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'keepWarm') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('keepWarm').timeBased().everyMinutes(5).create();
  Logger.log('Keep-warm trigger set: every 5 minutes.');
}

/* ── Utility ── */
function safe_(value) { return value == null ? '' : String(value).trim(); }

function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
