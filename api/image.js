const https = require('https');
const http = require('http');

function pipeImage(targetUrl, res, redirectCount = 0) {
  if (redirectCount > 3) return res.status(508).send('Too many redirects');

  const client = targetUrl.protocol === 'https:' ? https : http;
  const request = client.get(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
    }
  }, (upstream) => {
    if (upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location) {
      const nextUrl = new URL(upstream.headers.location, targetUrl);
      return pipeImage(nextUrl, res, redirectCount + 1);
    }

    res.status(upstream.statusCode || 200);
    res.setHeader('Content-Type', upstream.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    upstream.pipe(res);
  });

  request.on('error', () => res.status(502).send('Failed to fetch image'));
}

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed');
  }

  let target;
  try {
    target = new URL(String(req.query.url || ''));
  } catch {
    return res.status(400).send('Invalid image URL');
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return res.status(400).send('Invalid protocol');
  }

  return pipeImage(target, res);
};
