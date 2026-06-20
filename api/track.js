const { logEvent, enabled } = require('../lib/analytics');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const result = await logEvent(req, req.body?.type || 'pageview', {
    page: String(req.body?.page || '').slice(0, 240),
    title: String(req.body?.title || '').slice(0, 160)
  });

  return res.status(200).json({
    success: true,
    web: 'Cookora',
    developer: 'Pajar',
    analytics: enabled() ? result : { saved: false, disabled: true }
  });
};
