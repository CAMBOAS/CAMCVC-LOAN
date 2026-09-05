/**
 * Put a backup taken by backup-db.js into a database.
 *
 *   node tools/restore-db.js backups/2026-09-02T10-00-00
 *
 * Reads MYSQL_URL from .env.local, so point that at the NEW database first.
 * It refuses to touch a database that already holds rows unless --force is
 * given, because the common mistake here is restoring over live data.
 */
const fs   = require('fs');
const path = require('path');

/* Anchored to the project, not to wherever the command was typed. A PowerShell
   window opens in the user's home directory, and from there process.cwd() sends
   both of these looking in C:/Users/<name> — the failure then reads as a
   missing mysql2 rather than as a wrong starting directory. */
const ROOT = path.resolve(__dirname, '..');

/* Not in the repository, so not on a CI runner. A connection string given on
   the command line does not need it. */
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const mysql = require(path.join(ROOT, 'node_modules', 'mysql2', 'promise'));

/* Named flags as well as a URL, for the same reason import-sql.js grew them: a
   generated password holding "@" or "/" splits mysql://user:pass@host at the
   wrong character, and the error that follows blames the host. */
const flag = (name) => {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const TAKES_VALUE = ['host', 'port', 'user', 'password', 'database'];
const positional = process.argv.slice(2).filter((a, i, all) =>
  !a.startsWith('--') &&
  !(i > 0 && TAKES_VALUE.includes(String(all[i - 1]).replace(/^--/, ''))));

const dir    = positional[0];
const force  = process.argv.includes('--force');
const dbUrl  = positional.find(a => /^mysql:\/\//.test(a)) || process.env.MYSQL_URL;
const host   = flag('host');
const dbName = flag('database');

if (!dir) {
  console.error('Usage: node tools/restore-db.js <backup folder> [mysql://...] [--force]');
  console.error('   or: node tools/restore-db.js <backup folder> --host H --user U --password P --database D');
  process.exit(1);
}
if (!fs.existsSync(path.join(dir, 'manifest.json'))) { console.error('No manifest.json in ' + dir); process.exit(1); }
if (!dbUrl && !host) { console.error('No connection details: set MYSQL_URL, pass a URL, or give --host.'); process.exit(1); }

const base = host
  ? { host, port: Number(flag('port') || 4000), user: flag('user'), password: flag('password') }
  : { uri: dbUrl };
const TLS = { rejectUnauthorized: false };

const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

(async () => {
  /* The backup carries CREATE TABLE but never CREATE DATABASE, so restoring
     into a name that does not exist yet fails at connect time with
     ER_BAD_DB_ERROR — before anything has been read — and the message sounds
     like the host is down. Make the database first, then connect to it. */
  if (dbName) {
    try {
      const c = await mysql.createConnection({ ...base, ssl: TLS, connectTimeout: 20000 });
      await c.query('CREATE DATABASE IF NOT EXISTS `' + dbName + '` DEFAULT CHARACTER SET utf8mb4');
      await c.end();
    } catch (e) {
      /* Whoever is reading this is usually mid-recovery. A stack trace is the
         wrong thing to hand them; say which of the three things went wrong. */
      console.error('Cannot connect: ' + (
        e.code === 'ER_ACCESS_DENIED_ERROR' ? 'wrong user or password' :
        e.code === 'ENOTFOUND'              ? 'no such host — check --host' :
        (e.code || e.message)));
      console.error('Nothing was written.');
      process.exit(1);
    }
  }

  /* TLS to match the app, which sets it too — hosted MySQL often refuses
     plaintext, TiDB Cloud among them. */
  const pool = mysql.createPool({ ...base, ...(dbName ? { database: dbName } : {}),
                                  dateStrings: true, ssl: TLS,
                                  connectTimeout: 20000, multipleStatements: true });
  console.log('restoring into ' + (host || (String(dbUrl).match(/@([^:/]+)/) || [])[1] || '?') +
              (dbName ? ' / ' + dbName : ''));
  console.log('backup taken ' + manifest.takenAt + ' from ' + manifest.host);
  console.log('');

  /* Refuse to write over anything that is already there. */
  const [existing] = await pool.query('SHOW TABLES');
  if (existing.length && !force) {
    let occupied = 0;
    for (const r of existing) {
      const t = Object.values(r)[0];
      const [[c]] = await pool.query('SELECT COUNT(*) n FROM `' + t + '`');
      occupied += c.n;
    }
    if (occupied > 0) {
      console.error('This database already holds ' + occupied + ' rows across ' + existing.length + ' tables.');
      console.error('Restoring would write over them. Pass --force only if that is what you want.');
      process.exit(1);
    }
  }

  await pool.query('SET FOREIGN_KEY_CHECKS=0');
  const schema = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
  for (const stmt of schema.split(/;\s*\n\s*\n/).map(s => s.trim()).filter(Boolean)) {
    try { await pool.query(stmt); } catch (e) { console.error('  schema: ' + e.message); }
  }

  for (const [table, expected] of Object.entries(manifest.tables)) {
    const file = path.join(dir, table + '.json');
    if (!fs.existsSync(file)) { console.log('  ' + table.padEnd(22) + 'missing from the backup'); continue; }
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!rows.length) { console.log('  ' + table.padEnd(22) + '      0 rows'); continue; }

    const cols = Object.keys(rows[0]);
    const sql  = 'INSERT INTO `' + table + '` (' + cols.map(c => '`' + c + '`').join(',') + ') VALUES ?';

    /* A json column comes back from mysql2 as a real array or object, not as
       text. Handed straight back into a multi-row insert it is read as a row
       constructor — "(a, b)" where a single value belongs — and the server
       rejects the statement. It has to go back as the text it is stored as.
       Buffers are left alone; those are binary columns and travel correctly. */
    const cell = v => (v !== null && typeof v === 'object' && !Buffer.isBuffer(v))
      ? JSON.stringify(v) : v;

    /* In batches, so one huge table does not exceed max_allowed_packet. */
    for (let i = 0; i < rows.length; i += 200) {
      const slice = rows.slice(i, i + 200).map(r => cols.map(c => cell(r[c])));
      await pool.query(sql, [slice]);
    }
    const [[c]] = await pool.query('SELECT COUNT(*) n FROM `' + table + '`');
    console.log('  ' + table.padEnd(22) + String(c.n).padStart(7) + ' rows' +
                (c.n === expected ? '' : '   <-- expected ' + expected));
  }

  await pool.query('SET FOREIGN_KEY_CHECKS=1');
  console.log('');
  console.log('done');
  await pool.end();
})();
