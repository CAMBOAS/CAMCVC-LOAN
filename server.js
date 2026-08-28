/**
 * Local Development Server
 * Run: node server.js
 * Open: http://localhost:5500
 *
 * Serves static files + proxies /api/proxy to Apps Script (bypasses CORS).
 * No npm install needed — uses Node.js built-in modules only.
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

/* ── Load .env.local into process.env ── */
(function loadEnv() {
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
    for (const line of envFile.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    }
  } catch(e) {}
})();

/* ── Cache the app.js handler (ES-module, loaded once) ── */
let _camcvcHandler = null;
async function getCamcvcHandler() {
  if (!_camcvcHandler) {
    const mod = await import('./api/app.js');
    _camcvcHandler = mod.default;
  }
  return _camcvcHandler;
}

const PORT           = 3000;
const STATIC_DIR     = __dirname;
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzX_Qd171kv2O2u0h6BpPBh9cMRO5WusbpZphFemHijjRunLIpsMefDidGufqx_doVccw/exec';

const FB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function extractDirectFbId(input) {
  let m = input.match(/[?&]id=(\d{5,})/);
  if (m) return m[1];
  m = input.match(/\/people\/[^/]+\/(\d{5,})/);
  if (m) return m[1];
  m = input.match(/facebook\.com\/(\d{5,})\/?(\?.*)?$/);
  if (m) return m[1];
  return null;
}

function extractFbIdFromHtml(html) {
  const patterns = [
    /"userID"\s*:\s*"(\d{5,})"/,
    /"USER_ID"\s*:\s*"(\d{5,})"/,
    /entity_id\s*[":]\s*"?(\d{5,})"/,
    /"uid"\s*:\s*"(\d{5,})"/,
    /fb:\/\/profile\/(\d{5,})/,
    /"actorID"\s*:\s*"(\d{5,})"/,
    /content="fb:\/\/profile\/(\d{5,})"/,
    /"pageID"\s*:\s*"(\d{5,})"/,
    /"groupID"\s*:\s*"(\d{5,})"/,
    /"group_id"\s*:\s*"(\d{5,})"/,
    /profile_id=(\d{5,})/,
    /owner_id=(\d{5,})/,
    /"owner_id"\s*:\s*"(\d{5,})"/,
    /"id"\s*:\s*"(\d{10,})"/,
    /\?id=(\d{8,})[&"]/,
    /"id":"(\d{8,})"/,
    /\/(\d{15,})\?/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

const MIME = {
  '.html': 'text/html;charset=utf-8',
  '.css' : 'text/css',
  '.js'  : 'application/javascript',
  '.json': 'application/json',
  '.png' : 'image/png',
  '.jpg' : 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico' : 'image/x-icon',
  '.svg' : 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf' : 'font/ttf',
};

/* ── Fetch with redirect follow (Node.js built-in) ── */
function httpsGetWithHeaders(targetUrl) {
  return new Promise((resolve, reject) => {
    function doRequest(u, redirects) {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      const opts = url.parse(u);
      opts.headers = {
        'User-Agent': FB_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      };
      https.get(opts, (res) => {
        if ([301,302,303].includes(res.statusCode)) {
          return doRequest(res.headers.location, redirects + 1);
        }
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => resolve(data));
      }).on('error', reject);
    }
    doRequest(targetUrl, 0);
  });
}

function httpsGet(targetUrl) {
  return new Promise((resolve, reject) => {
    function doRequest(u, redirects) {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      const opts = url.parse(u);
      https.get(opts, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) {
          return doRequest(res.headers.location, redirects + 1);
        }
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => resolve(data));
      }).on('error', reject);
    }
    doRequest(targetUrl, 0);
  });
}

function httpsPost(targetUrl, body) {
  return new Promise((resolve, reject) => {
    function doRequest(u, redirects) {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      const opts = url.parse(u);
      if (redirects > 0) {
        /* After redirect, switch to GET */
        opts.method = 'GET';
        https.get(opts, (res) => {
          if ([301,302,303].includes(res.statusCode) && res.headers.location) {
            res.resume(); /* drain body to free connection */
            return doRequest(res.headers.location, redirects + 1);
          }
          let data = '';
          res.on('data', c => { data += c; });
          res.on('end', () => resolve(data));
        }).on('error', reject);
        return;
      }
      opts.method  = 'POST';
      opts.headers = {
        'Content-Type': 'text/plain;charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      };
      const req = https.request(opts, (res) => {
        if ([301,302,303].includes(res.statusCode) && res.headers.location) {
          res.resume(); /* drain body to free connection */
          return doRequest(res.headers.location, redirects + 1);
        }
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    }
    doRequest(targetUrl, 0);
  });
}

/* ── HTTP Server ── */
const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;

  /* CORS headers for all responses */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); return res.end(); }

  /* ── /api/app — run api/app.js locally (connects to Railway MySQL) ── */
  if (pathname === '/api/app') {
    try {
      let body = '';
      await new Promise((ok) => { req.on('data', c => { body += c; }); req.on('end', ok); });
      const parsedBody = body ? JSON.parse(body) : {};
      const rawBody = body || '{}';
      const mockReq = {
        method: req.method,
        /* the handler reads request headers (Vercel's geo headers, for one), so the
           mock has to carry them or local behaviour silently differs from production */
        headers: req.headers,
        body: parsedBody,
        on(event, cb) {
          if (event === 'data') cb(rawBody);
          if (event === 'end')  cb();
          return this;
        },
      };
      let statusCode = 200;
      const mockRes = {
        _hdrs: {},
        setHeader(k, v) { this._hdrs[k] = v; return this; },
        status(code) { statusCode = code; return this; },
        json(data) {
          res.setHeader('Content-Type', 'application/json');
          Object.entries(this._hdrs).forEach(([k, v]) => res.setHeader(k, v));
          res.writeHead(statusCode);
          res.end(JSON.stringify(data));
        },
      };
      const handler = await getCamcvcHandler();
      await handler(mockReq, mockRes);
    } catch (err) {
      console.error('[/api/app error]', err.message);
      res.writeHead(500);
      return res.end(JSON.stringify({ ok: false, message: err.message }));
    }
    return;
  }

  /* ── /api/proxy — forward to Apps Script (uses built-in fetch, auto redirect) ── */
  if (pathname === '/api/proxy') {
    try {
      let response;
      if (req.method === 'POST') {
        let body = '';
        await new Promise((ok) => {
          req.on('data', c => { body += c; });
          req.on('end', ok);
        });
        response = await fetch(APPS_SCRIPT_URL, {
          method:   'POST',
          headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
          body:     body,
          redirect: 'follow',
        });
      } else {
        const qs  = new URLSearchParams(parsed.query).toString();
        const uri = qs ? `${APPS_SCRIPT_URL}?${qs}` : APPS_SCRIPT_URL;
        response  = await fetch(uri, { redirect: 'follow' });
      }
      const text = await response.text();
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      return res.end(text || '{"ok":true}');
    } catch (err) {
      console.error('[proxy error]', err.message);
      res.writeHead(500);
      return res.end(JSON.stringify({ ok: false, message: err.message }));
    }
  }

  /* ── /api/check-embed — Check if URL allows iframe embedding ── */
  if (pathname === '/api/check-embed') {
    const targetUrl = (parsed.query.url || '').trim();
    if (!targetUrl) { res.writeHead(400); return res.end(JSON.stringify({ ok:false })); }
    try {
      const checkResult = await new Promise((resolve) => {
        function doHead(u, redirects) {
          if (redirects > 4) return resolve({ embeddable: true });
          const opts = url.parse(u);
          opts.method  = 'HEAD';
          opts.timeout = 6000;
          opts.headers = { 'User-Agent': FB_UA, 'Accept': 'text/html' };
          const req = https.request(opts, (r) => {
            if ([301,302,303,307,308].includes(r.statusCode) && r.headers.location) {
              r.resume();
              return doHead(r.headers.location, redirects + 1);
            }
            const xfo = (r.headers['x-frame-options'] || '').toLowerCase();
            const csp = (r.headers['content-security-policy'] || '').toLowerCase();
            const blocked = /deny|sameorigin/.test(xfo)
              || (/frame-ancestors/.test(csp) && !/frame-ancestors\s+\*/.test(csp) && !/frame-ancestors\s+https?:\/\/\*/.test(csp));
            r.resume();
            resolve({ embeddable: !blocked, xfo, status: r.statusCode });
          });
          req.on('error', () => resolve({ embeddable: true }));
          req.on('timeout', () => { req.destroy(); resolve({ embeddable: true }); });
          req.end();
        }
        doHead(targetUrl, 0);
      });
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      return res.end(JSON.stringify({ ok: true, embeddable: checkResult.embeddable }));
    } catch(e) {
      res.writeHead(200);
      return res.end(JSON.stringify({ ok: true, embeddable: true }));
    }
  }

  /* ── /api/fb-lookup — Facebook ID lookup ── */
  if (pathname === '/api/fb-lookup') {
    const rawInput = (parsed.query.url || '').trim();
    if (!rawInput) {
      res.writeHead(400); return res.end(JSON.stringify({ ok: false, message: 'Missing url parameter' }));
    }
    const directId = extractDirectFbId(rawInput);
    if (directId) {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      return res.end(JSON.stringify({ ok: true, id: directId, method: 'direct' }));
    }
    try {
      let targetUrl = rawInput.trim();
      if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

      // Extract username/slug from URL
      const usernameMatch = targetUrl.match(/facebook\.com\/(?:pages\/[^/]+\/)?([a-zA-Z0-9._-]+)\/?([?#].*)?$/);
      const username = usernameMatch ? usernameMatch[1] : null;

      // Try Graph API with App Access Token if credentials provided
      const appId     = (parsed.query.app_id     || '').trim();
      const appSecret = (parsed.query.app_secret || '').trim();

      const skipSlugs = ['profile.php','people','groups','events','pages','watch','marketplace','home','stories','login'];

      // Step 2: Graph API (Pages only, requires credentials)
      if (appId && appSecret && username && !skipSlugs.includes(username)) {
        try {
          const appToken  = encodeURIComponent(appId + '|' + appSecret);
          const graphUrl  = `https://graph.facebook.com/v19.0/${encodeURIComponent(username)}?fields=id,name&access_token=${appToken}`;
          const graphText = await httpsGetWithHeaders(graphUrl);
          const graphData = JSON.parse(graphText);
          if (graphData && graphData.id && !graphData.error) {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            return res.end(JSON.stringify({ ok: true, id: graphData.id, name: graphData.name || '', method: 'graph' }));
          }
        } catch(e) {}
      }

      if (!appId || !appSecret) {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: false, message: 'no_credentials', hint: 'no_credentials' }));
      }

      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      return res.end(JSON.stringify({ ok: false, message: 'not_found', hint: 'vanity' }));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ ok: false, message: err.message || 'Fetch error' }));
    }
  }

  /* ── Static files ── */
  let filePath = path.join(STATIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(STATIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }

  const ext         = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      return res.end(err.code === 'ENOENT' ? 'Not Found' : 'Server Error');
    }
    res.setHeader('Content-Type', contentType);
    res.writeHead(200);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║   App Server Running                 ║');
  console.log('  ║   http://localhost:' + PORT + '              ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log('  Open in browser: http://localhost:' + PORT);
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
