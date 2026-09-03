/**
 * Back up every database this business depends on, in one go, and drop the
 * copies that have aged out.
 *
 *   node tools/backup-all.js
 *
 * Written to be run unattended by Windows Task Scheduler. It reads its targets
 * from .env.local — MYSQL_URL for the loan system, SALE_MYSQL_URL for the sales
 * one — so credentials stay in the one file that is already gitignored, and no
 * connection string is ever typed into a scheduled command where it would sit
 * in plain sight in the task definition.
 *
 * Exits non-zero if any target failed, so a scheduled run that goes wrong is
 * visible as a failure rather than a silent success.
 */
const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const KEEP = Number(process.env.BACKUP_KEEP || 14);   /* copies per target */

/* This one genuinely needs the file — it is where the list of what to back up
   lives. Say so in a sentence rather than letting a stack trace explain it to
   whoever is reading a failed scheduled task at the wrong end of the day. */
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  console.error('No .env.local in ' + ROOT);
  console.error('It holds MYSQL_URL and SALE_MYSQL_URL, which say what to back up.');
  process.exit(1);
}

/* Where the copies land — read after .env.local, not before, or the setting in
   that file never gets a say. Set BACKUP_DIR to a folder Google Drive syncs and
   every run reaches the cloud on its own, which matters here: a backup that
   exists only on one desk is one dead disk away from the week this project just
   had. Falls back to backups/ beside the code, which is gitignored. */
const OUT_ROOT = process.env.BACKUP_DIR || path.join(ROOT, 'backups');

const TARGETS = [
  { name: 'loan', url: process.env.MYSQL_URL },
  { name: 'sale', url: process.env.SALE_MYSQL_URL },
];

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const log = (m) => console.log('[' + new Date().toISOString().slice(0, 19) + '] ' + m);

let failed = 0;
for (const t of TARGETS) {
  if (!t.url) { log(t.name + ': no connection string in .env.local, skipped'); continue; }
  const out = path.join(OUT_ROOT, t.name + '-' + stamp);
  try {
    log(t.name + ': starting');
    const res = execFileSync(process.execPath,
      [path.join(ROOT, 'tools', 'backup-db.js'), out, t.url],
      { cwd: ROOT, encoding: 'utf8', timeout: 15 * 60 * 1000 });
    const tail = res.trim().split('\n').pop();
    log(t.name + ': ' + tail);
  } catch (e) {
    failed++;
    log(t.name + ': FAILED — ' + String(e.stderr || e.message).trim().split('\n').pop());
    continue;
  }

  /* Age out the old copies, newest kept. Only ever removes folders carrying this
     target's prefix, so nothing else in backups/ is touched.

     Ordered by the date on the folder, not by its name: the copies taken by hand
     during the Railway rescue are stamped 20260903-140620 while these are stamped
     2026-09-03T09-50-10, and sorted as text the older ones come out looking like
     the newest. That would have deleted the wrong copies once fourteen had built
     up — silently, and only months from now. */
  try {
    const dir  = OUT_ROOT;
    const mine = fs.readdirSync(dir)
      .filter(d => d.startsWith(t.name + '-') && fs.statSync(path.join(dir, d)).isDirectory())
      .map(d => ({ d, at: fs.statSync(path.join(dir, d)).mtimeMs }))
      .sort((a, b) => a.at - b.at)
      .map(x => x.d);
    for (const old of mine.slice(0, Math.max(0, mine.length - KEEP))) {
      fs.rmSync(path.join(dir, old), { recursive: true, force: true });
      log(t.name + ': removed old copy ' + old);
    }
  } catch (e) { log(t.name + ': could not tidy old copies — ' + e.message); }
}

log(failed ? failed + ' target(s) failed' : 'all targets backed up');
process.exit(failed ? 1 : 0);
