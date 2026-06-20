/**
 * Cookora Backend
 * Developer: Pajar
 * Stack: Node.js + Express + Cheerio scraper, Termux friendly.
 */

const express = require('express');
const https = require('https');
const path = require('path');
const CookpadScraper = require('./cookpad-search');

const app = express();
const PORT = process.env.PORT || 3000;
const scraper = new CookpadScraper();

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

app.disable('x-powered-by');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
