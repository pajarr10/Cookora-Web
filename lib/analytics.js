const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const EVENTS_KEY = 'cookora:events';
const TOP_SEARCHES_KEY = 'cookora:topSearches';
const MAX_EVENTS = Number(process.env.ANALYTICS_MAX_EVENTS || 2000);

function enabled() {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

async function redis(command) {
  if (!enabled()) return null;
  const response = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  if (!response.ok) throw new Error(`Upstash error ${response.status}`);
  const json = await response.json();
  return json.result;
}

function getClientIp(req) {
  return String(
    req.headers['cf-connecting-ip'] ||
    req.headers['x-real-ip'] ||
    req.headers['x-forwarded-for'] ||
    req.socket?.remoteAddress ||
    ''
  ).split(',')[0].trim();
}

function getVisitorId(req) {
  return String(req.headers['x-cookora-visitor'] || req.body?.visitorId || req.query?.visitorId || '').slice(0, 80);
}

async function logEvent(req, type, extra = {}) {
  if (!enabled()) return { saved: false, disabled: true };

  const entry = {
    time: new Date().toISOString(),
    type: String(type || 'event').slice(0, 40),
    visitorId: getVisitorId(req),
    ip: getClientIp(req),
    method: req.method,
    path: req.url || req.path || '',
    userAgent: String(req.headers['user-agent'] || '').slice(0, 240),
    referer: String(req.headers.referer || req.headers.referrer || '').slice(0, 240),
    ...extra
  };

  try {
    await redis(['LPUSH', EVENTS_KEY, JSON.stringify(entry)]);
    await redis(['LTRIM', EVENTS_KEY, 0, MAX_EVENTS - 1]);
    if (entry.type === 'search' && entry.query) {
      await redis(['HINCRBY', TOP_SEARCHES_KEY, String(entry.query).toLowerCase().trim(), 1]);
    }
    return { saved: true };
  } catch (error) {
    console.error('Analytics log error:', error.message);
    return { saved: false, error: error.message };
  }
}

async function readEvents(limit = 1000) {
  if (!enabled()) return [];
  const raw = await redis(['LRANGE', EVENTS_KEY, 0, Math.max(0, limit - 1)]);
  return (raw || []).map((line) => {
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

module.exports = {
  enabled,
  logEvent,
  readEvents,
  summarizeAnalytics
};
