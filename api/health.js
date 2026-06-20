module.exports = function handler(req, res) {
  res.status(200).json({
    success: true,
    status: 'ok',
    web: 'Cookora',
    developer: 'Pajar',
    source: 'Cookpad scraping via Cheerio',
    platform: 'Vercel Serverless Function'
  });
};
