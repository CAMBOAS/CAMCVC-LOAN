/**
 * CAMCVC LOAN — Vercel Serverless Proxy
 * Forwards requests to Google Apps Script to bypass browser CORS.
 */

const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzdlBd8K8cJM86GWNBG9RRpyVwapEcQ7SgspS-V4tI2eH8TytbzYZgnSBiNU0i-VxjzCw/exec';

export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk.toString(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let response;
    if (req.method === 'POST') {
      const rawBody = await readRawBody(req);
      response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: rawBody,
        redirect: 'follow',
      });
    } else {
      const params = new URLSearchParams(req.query).toString();
      const uri    = params ? `${APPS_SCRIPT_URL}?${params}` : APPS_SCRIPT_URL;
      response = await fetch(uri, { redirect: 'follow' });
    }
    const text = await response.text();
    try {
      return res.status(200).json(JSON.parse(text));
    } catch {
      return res.status(200).send(text);
    }
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || 'Proxy error' });
  }
}
