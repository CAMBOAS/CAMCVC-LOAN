/**
 * CAMCVC LOAN — Facebook ID Lookup (Vercel Serverless)
 * GET /api/fb-lookup?url=<encoded_facebook_url>
 */

export const config = { api: { bodyParser: false } };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function normalizeUrl(input) {
  let u = input.trim();
  if (!u.startsWith('http')) u = 'https://' + u;
  return u;
}

function extractDirectId(input) {
  // profile.php?id=XXXXXXX
  let m = input.match(/[?&]id=(\d{5,})/);
  if (m) return m[1];

  // /people/Name/XXXXXXX  or  /people/Name/XXXXXXX/
  m = input.match(/\/people\/[^/]+\/(\d{5,})/);
  if (m) return m[1];

  // facebook.com/XXXXXXX  (pure numeric path — personal numeric ID)
  m = input.match(/facebook\.com\/(\d{5,})\/?(\?.*)?$/);
  if (m) return m[1];

  return null;
}

function extractFromHtml(html) {
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const rawInput = (req.query.url || '').trim();
  if (!rawInput) return res.status(400).json({ ok: false, message: 'Missing url parameter' });

  // Step 1 — try direct extraction
  const directId = extractDirectId(rawInput);
  if (directId) {
    return res.status(200).json({ ok: true, id: directId, method: 'direct' });
  }

  const targetUrl = normalizeUrl(rawInput);

  // Step 2 — mbasic.facebook.com scraping (works for Pages + Groups)
  try {
    const mbasicUrl = targetUrl.replace(/https?:\/\/(?:www\.|m\.)?facebook\.com/, 'https://mbasic.facebook.com');
    const response = await fetch(mbasicUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'identity',
      },
      redirect: 'follow',
    });
    const html = await response.text();
    const isLoginPage = html.includes('id="email"') ||
                        html.includes('login_form') ||
                        html.includes('checkpoint') ||
                        (html.length < 8000 && html.toLowerCase().includes('log in to facebook'));
    if (!isLoginPage) {
      const id = extractFromHtml(html);
      if (id) return res.status(200).json({ ok: true, id, method: 'mbasic' });
    }
  } catch (e) {}

  // Step 3 — www.facebook.com fallback fetch
  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'identity',
      },
      redirect: 'follow',
    });
    const html = await response.text();
    const id = extractFromHtml(html);
    if (id) return res.status(200).json({ ok: true, id, method: 'fetch' });

    const isLoginPage = html.includes('login_form') || html.includes('checkpoint') || html.includes('id="email"');
    if (isLoginPage) {
      return res.status(200).json({ ok: false, message: 'Login required', hint: 'vanity' });
    }
  } catch (e) {}

  return res.status(200).json({ ok: false, message: 'Could not find Facebook ID from this URL.', hint: 'vanity' });
}
