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

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const mysql = require(path.join(process.cwd(), 'node_modules', 'mysql2', 'promise'));

const dir   = process.argv[2];
const force = process.argv.includes('--force');
if (!dir) { console.error('Usage: node tools/restore-db.js <backup folder> [--force]'); process.exit(1); }
if (!fs.existsSync(path.join(dir, 'manifest.json'))) { console.error('No manifest.json in ' + dir); process.exit(1); }

const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

(async () => {
  const pool = mysql.createPool({ uri: process.env.MYSQL_URL, dateStrings: true,
                                  connectTimeout: 20000, multipleStatements: true });
  console.log('restoring into ' + ((process.env.MYSQL_URL.match(/@([^:/]+)/) || [])[1] || '?'));
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
    /* In batches, so one huge table does not exceed max_allowed_packet. */
    for (let i = 0; i < rows.length; i += 200) {
      const slice = rows.slice(i, i + 200).map(r => cols.map(c => r[c]));
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
