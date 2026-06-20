const CookpadScraper = require('../cookpad-search');

const scraper = new CookpadScraper();

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const url = String(req.query.url || '').trim();
  if (!url) {
    return res.status(400).json({
      success: false,
      web: 'Cookora',
      developer: 'Pajar',
      error: 'Parameter url wajib diisi. Contoh: /api/detail?url=https://cookpad.com/id/resep/...'
    });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ success: false, web: 'Cookora', developer: 'Pajar', error: 'URL tidak valid.' });
  }

  if (!parsed.hostname.endsWith('cookpad.com')) {
    return res.status(400).json({ success: false, web: 'Cookora', developer: 'Pajar', error: 'Hanya URL Cookpad yang diizinkan.' });
  }

  try {
    const result = await scraper.getDetail(url);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(result.success ? 200 : 502).json({
      ...result,
      web: 'Cookora',
      developer: 'Pajar',
      source: 'Cookpad scraping via Cheerio'
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      web: 'Cookora',
      developer: 'Pajar',
      error: error.message || 'Gagal mengambil detail resep'
    });
  }
};
