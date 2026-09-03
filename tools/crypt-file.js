/**
 * Encrypt or decrypt one file with a passphrase.
 *
 *   node tools/crypt-file.js enc <in> <out>     BACKUP_PASSPHRASE in the env
 *   node tools/crypt-file.js dec <in> <out>
 *
 * Exists so a backup can be sent somewhere this business does not control —
 * GitHub, in this case — without customer names, phone numbers and addresses
 * being readable by anyone who reaches the file. It uses only what ships with
 * Node, so restoring needs nothing installed beyond Node itself: no GPG, no
 * OpenSSL, no going hunting for a tool on the day everything is on fire.
 *
 * AES-256-GCM, key from scrypt over a random 16-byte salt. GCM is used for its
 * authentication tag: a file that has been altered fails to decrypt rather than
 * producing plausible rubbish. Layout is salt | iv | tag | ciphertext.
 *
 * If the passphrase is lost the backups are lost with it. There is no recovery
 * and that is the point.
 */
const fs     = require('fs');
const crypto = require('crypto');

const [, , mode, inFile, outFile] = process.argv;
const pass = process.env.BACKUP_PASSPHRASE;

if (!mode || !inFile || !outFile) {
  console.error('Usage: node tools/crypt-file.js <enc|dec> <in> <out>');
  process.exit(1);
}
if (!pass) { console.error('BACKUP_PASSPHRASE is not set'); process.exit(1); }
if (pass.length < 12) { console.error('BACKUP_PASSPHRASE is too short — use at least 12 characters'); process.exit(1); }

const SALT = 16, IV = 12, TAG = 16;

if (mode === 'enc') {
  const salt = crypto.randomBytes(SALT);
  const iv   = crypto.randomBytes(IV);
  const key  = crypto.scryptSync(pass, salt, 32);
  const c    = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(fs.readFileSync(inFile)), c.final()]);
  fs.writeFileSync(outFile, Buffer.concat([salt, iv, c.getAuthTag(), body]));
  console.log('encrypted → ' + outFile + '  (' + fs.statSync(outFile).size + ' bytes)');

} else if (mode === 'dec') {
  const buf  = fs.readFileSync(inFile);
  if (buf.length < SALT + IV + TAG) { console.error('That file is too small to be one of ours.'); process.exit(1); }
  const key  = crypto.scryptSync(pass, buf.subarray(0, SALT), 32);
  const d    = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(SALT, SALT + IV));
  d.setAuthTag(buf.subarray(SALT + IV, SALT + IV + TAG));
  try {
    fs.writeFileSync(outFile, Buffer.concat([d.update(buf.subarray(SALT + IV + TAG)), d.final()]));
  } catch (e) {
    console.error('Could not decrypt. Either the passphrase is wrong or the file has been altered.');
    process.exit(1);
  }
  console.log('decrypted → ' + outFile + '  (' + fs.statSync(outFile).size + ' bytes)');

} else {
  console.error('First argument must be enc or dec');
  process.exit(1);
}
