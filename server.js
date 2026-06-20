/**
 * Cookora Backend
 * Developer: Pajar
 * Stack: Node.js + Express + Cheerio scraper, Termux friendly.
 */

const express = require('express');
const https = require('https');
const path = require('path');
const fs = require('fs');
const CookpadScraper = require('./cookpad-search');

const app = express();
const PORT = process.env.PORT || 3000;
const scraper = new CookpadScraper();

const DATA_DIR = path.join(__dirname, 'data');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.jsonl');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Simple in-memory cache agar hemat request dan ringan di Termux.
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 10 * 60 * 1000);
const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.time > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key, data) {
  cache.set(key, { time: Date.now(), data });
  // Batasi cache supaya memori Termux tetap aman.
  if (cache.size > 50) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function publicPayload(payload) {
  return {
    ...payload,
    web: 'Cookora',
    developer: 'Pajar',
    source: 'Cookpad scraping via Cheerio'
  };
}


function getClientIp(req) {
  return String(
    req.headers['cf-connecting-ip'] ||
    req.headers['x-real-ip'] ||
    req.headers['x-forwarded-for'] ||
    req.socket.remoteAddress ||
    ''
  ).split(',')[0].trim();
}

function getVisitorId(req) {
  return String(req.headers['x-cookora-visitor'] || req.body?.visitorId || req.query.visitorId || '').slice(0, 80);
}

function logEvent(req, type, extra = {}) {
  const entry = {
    time: new Date().toISOString(),
    type,
    visitorId: getVisitorId(req),
    ip: getClientIp(req),
    method: req.method,
    path: req.path,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 240),
    referer: String(req.headers.referer || req.headers.referrer || '').slice(0, 240),
    ...extra
  };

  fs.appendFile(ANALYTICS_FILE, JSON.stringify(entry) + '\n', (err) => {
    if (err) console.error('Analytics log error:', err.message);
  });
}

function readAnalytics(limit = 1000) {
  if (!fs.existsSync(ANALYTICS_FILE)) return [];
  const raw = fs.readFileSync(ANALYTICS_FILE, 'utf8').trim();
  if (!raw) return [];
  return raw.split('\n').slice(-limit).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function summarizeAnalytics(events) {
  const uniqueVisitors = new Set(events.map(e => e.visitorId || e.ip).filter(Boolean));
  const searches = events.filter(e => e.type === 'search');
  const pageviews = events.filter(e => e.type === 'pageview');
  const details = events.filter(e => e.type === 'detail');
  const topSearches = {};
  searches.forEach((e) => {
    const q = String(e.query || '').toLowerCase().trim();
    if (q) topSearches[q] = (topSearches[q] || 0) + 1;
  });

  return {
    totalEvents: events.length,
    uniqueVisitors: uniqueVisitors.size,
    pageviews: pageviews.length,
    searches: searches.length,
    detailOpens: details.length,
    topSearches: Object.entries(topSearches)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([query, count]) => ({ query, count }))
  };
}

function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    return res.status(503).json(publicPayload({
      success: false,
      error: 'ADMIN_KEY belum diset. Jalankan: ADMIN_KEY=passwordku npm start'
    }));
  }
  const key = String(req.query.key || req.headers['x-admin-key'] || '');
  if (key !== adminKey) {
    return res.status(401).json(publicPayload({ success: false, error: 'Admin key salah.' }));
  }
  next();
}

app.disable('x-powered-by');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/track', (req, res) => {
  const type = String(req.body?.type || 'pageview').slice(0, 40);
  logEvent(req, type, {
    page: String(req.body?.page || '').slice(0, 240),
    title: String(req.body?.title || '').slice(0, 160)
  });
  res.json(publicPayload({ success: true }));
});

app.get('/api/analytics', requireAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit || 1000), 10000);
  const events = readAnalytics(limit);
  res.json(publicPayload({
    success: true,
    summary: summarizeAnalytics(events),
    events: events.reverse()
  }));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/health', (req, res) => {
  res.json(publicPayload({ success: true, status: 'ok' }));
});

app.get('/api/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    return res.status(400).json(publicPayload({
      success: false,
      error: 'Parameter q wajib diisi. Contoh: /api/search?q=nasi%20goreng'
    }));
  }

  logEvent(req, 'search', { query: q });

  const key = `search:${q.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return res.json(publicPayload({ ...cached, cached: true }));

  const result = await scraper.search(q);
  cacheSet(key, result);

  if (!result.success) {
    return res.status(502).json(publicPayload(result));
  }
  res.json(publicPayload({ ...result, cached: false }));
}));

app.get('/api/detail', asyncHandler(async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) {
    return res.status(400).json(publicPayload({
      success: false,
      error: 'Parameter url wajib diisi. Contoh: /api/detail?url=https://cookpad.com/id/resep/...'
    }));
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json(publicPayload({ success: false, error: 'URL tidak valid.' }));
  }

  if (!parsed.hostname.endsWith('cookpad.com')) {
    return res.status(400).json(publicPayload({ success: false, error: 'Hanya URL Cookpad yang diizinkan.' }));
  }

  logEvent(req, 'detail', { url });

  const key = `detail:${url}`;
  const cached = cacheGet(key);
  if (cached) return res.json(publicPayload({ ...cached, cached: true }));

  const result = await scraper.getDetail(url);
  cacheSet(key, result);

  if (!result.success) {
    return res.status(502).json(publicPayload(result));
  }
  res.json(publicPayload({ ...result, cached: false }));
}));

// Proxy gambar opsional supaya gambar Cookpad tetap bisa tampil dari origin yang sama.
app.get('/api/image', (req, res) => {
  const raw = String(req.query.url || '');
  let target;
  try {
    target = new URL(raw);
  } catch {
    return res.status(400).send('Invalid image URL');
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return res.status(400).send('Invalid protocol');
  }

  https.get(target, {
    headers: {
      'User-Agent': scraper.userAgent || 'Mozilla/5.0',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
    }
  }, (upstream) => {
    if (upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location) {
      return res.redirect(`/api/image?url=${encodeURIComponent(upstream.headers.location)}`);
    }

    res.status(upstream.statusCode || 200);
    const type = upstream.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    upstream.pipe(res);
  }).on('error', () => {
    res.status(502).send('Failed to fetch image');
  });
});

// Fallback untuk route frontend.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json(publicPayload({ success: false, error: err.message || 'Internal server error' }));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Cookora by Pajar running at http://localhost:${PORT}`);
});
