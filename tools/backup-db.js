/**
 * Take a full copy of the database to a local folder.
 *
 * Written when the Railway trial expired with the production database offline
 * and no backup existing anywhere. Run it whenever the database is reachable —
 * before a migration, before a risky change, and on a routine you keep to.
 *
 *   node tools/backup-db.js              → backups/<timestamp>/
 *   node tools/backup-db.js my-folder    → my-folder/
 *
 * Writes one JSON file per table plus schema.sql, so the result can be read by
 * a person and reloaded by restore-db.js without any MySQL tooling installed.
 */
const fs   = require('fs');
const path = require('path');

/* Anchored to the project, not to wherever the command was typed. A PowerShell
   window opens in the user's home directory, and from there process.cwd() sends
   both of these looking in C:/Users/<name> — the failure then reads as a
   missing mysql2 rather than as a wrong starting directory. */
const ROOT = path.resolve(__dirname, '..');

/* .env.local is where the connection string lives on a developer's machine. It
   is deliberately not in the repository, so anywhere else — a CI runner, most
   of all — it simply is not there, and a missing file is not a problem when the
   string was handed over on the command line instead. */
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const mysql = require(path.join(ROOT, 'node_modules', 'mysql2', 'promise'));

const stamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = process.argv[2] || path.join('backups', stamp);
const dbUrl  = process.argv[3] || process.env.MYSQL_URL;

(async () => {
  if (!dbUrl) {
    console.error('No connection string. Either set MYSQL_URL in .env.local, or pass one:');
    console.error('  node tools/backup-db.js backups/sale "mysql://user:pass@host:port/railway"');
    process.exit(1);
  }

  let pool;
  try {
    /* Same TLS setting the app itself uses, so what is tested here is what the
       app will meet. Hosted MySQL increasingly refuses plaintext outright —
       TiDB Cloud among them — and Railway accepted it either way. */
    pool = mysql.createPool({ uri: dbUrl, dateStrings: true, connectTimeout: 20000,
                              ssl: { rejectUnauthorized: false } });
    await pool.query('SELECT 1');
  } catch (e) {
    console.error('Cannot reach the database:', e.code || e.message);
    console.error('Nothing was written. Bring the database online and run this again.');
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const [tables] = await pool.query('SHOW TABLES');
  const names = tables.map(r => Object.values(r)[0]);

  let schema = '';
  const counts = {};
  for (const t of names) {
    const [[create]] = await pool.query('SHOW CREATE TABLE `' + t + '`');
    schema += (create['Create Table'] || create['Create View'] || '') + ';\n\n';

    const [rows] = await pool.query('SELECT * FROM `' + t + '`');
    fs.writeFileSync(path.join(outDir, t + '.json'), JSON.stringify(rows, null, 2), 'utf8');
    counts[t] = rows.length;
    console.log('  ' + t.padEnd(22) + String(rows.length).padStart(7) + ' rows');
  }

  fs.writeFileSync(path.join(outDir, 'schema.sql'), schema, 'utf8');
  fs.writeFileSync(path.join(outDir, 'manifest.json'),
    JSON.stringify({ takenAt: new Date().toISOString(),
                     host: (dbUrl.match(/@([^:/]+)/) || [])[1] || '',
                     tables: counts }, null, 2), 'utf8');

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log('');
  console.log(names.length + ' tables, ' + total + ' rows → ' + outDir);
  await pool.end();
})();
