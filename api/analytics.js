const { enabled, readEvents, summarizeAnalytics } = require('../lib/analytics');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    return res.status(503).json({
      success: false,
      web: 'Cookora',
      developer: 'Pajar',
      error: 'ADMIN_KEY belum diset di Environment Variables Vercel.'
    });
  }

  const key = String(req.query.key || req.headers['x-admin-key'] || '');
  if (key !== adminKey) {
    return res.status(401).json({ success: false, web: 'Cookora', developer: 'Pajar', error: 'Admin key salah.' });
  }

  if (!enabled()) {
    return res.status(503).json({
      success: false,
      web: 'Cookora',
      developer: 'Pajar',
      error: 'Upstash Redis belum dikonfigurasi. Set UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN di Vercel.'
    });
  }

  const limit = Math.min(Number(req.query.limit || 1000), 2000);
  const events = await readEvents(limit);
  return res.status(200).json({
    success: true,
    web: 'Cookora',
    developer: 'Pajar',
    summary: summarizeAnalytics(events),
    events
  });
};
