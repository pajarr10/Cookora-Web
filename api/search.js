const CookpadScraper = require('../cookpad-search');
const cheerio = require('cheerio');

const scraper = new CookpadScraper();

async function searchLite(query, limit = 12) {
  const path = `/id/cari/${encodeURIComponent(query)}`;
  const html = await scraper.requestHTML(path);
  const $ = cheerio.load(html);
  const results = [];

  $('#search-recipes-list .ranked-list__item').each((i, el) => {
    const title = $(el).find('h2 .block-link__main').text().trim()
      || $(el).find('h2 a').text().trim() || '';
    const link = $(el).find('h2 .block-link__main').attr('href')
      || $(el).find('h2 a[href*="/resep/"]').attr('href') || '';

    let author = '';
    $(el).find('div.flex.items-center picture img').each((j, img) => {
      const src = $(img).attr('src') || '';
      if (src.includes('/users/')) {
        author = ($(img).attr('alt') || '').trim();
        return false;
      }
    });
    if (!author) author = $(el).find('div.flex.items-center span.break-all span').text().trim() || '';

    let image = '';
    $(el).find('picture').each((j, pic) => {
      const src = $(pic).find('img').attr('src') || '';
      if (src.includes('/recipes/')) {
        image = src;
        return false;
      }
    });

    let description = '';
    const descEl = $(el).find('.line-clamp-2');
    if (descEl.length) {
      const parts = [];
      descEl.contents().each((j, node) => {
        if (node.type === 'text') {
          const t = $(node).text().trim();
          if (t) parts.push(t);
        }
      });
      description = parts.join(', ');
    }

    if (link && link.includes('/resep/') && title) {
      const fullUrl = link.startsWith('http') ? link : `${scraper.baseUrl}${link}`;
      results.push({
        judul: title,
        url: fullUrl,
        gambar: image,
        author,
        deskripsi: description,
        waktu: '',
        porsi: '',
        bahan_bahan: [],
        langkah_langkah: []
      });
    }
  });

  if (results.length === 0) {
    $('.recipe-item, .recipe-card, .feed-item, .browse-recipe-item').each((i, el) => {
      const title = $(el).find('.title, .recipe-title, h2, h3').first().text().trim() || '';
      const link = $(el).find('a[href*="/resep/"]').first().attr('href') || '';
      let author = '';
      $(el).find('picture img').each((j, img) => {
        const src = $(img).attr('src') || '';
        if (src.includes('/users/')) {
          author = ($(img).attr('alt') || '').trim();
          return false;
        }
      });
      let image = '';
      $(el).find('picture img').each((j, img) => {
        const src = $(img).attr('src') || '';
        if (src.includes('/recipes/')) {
          image = src;
          return false;
        }
      });
      const description = $(el).find('.line-clamp-2').text().replace(/\s+/g, ' ').trim() || '';
      if (link && link.includes('/resep/') && title) {
        const fullUrl = link.startsWith('http') ? link : `${scraper.baseUrl}${link}`;
        results.push({
          judul: title,
          url: fullUrl,
          gambar: image,
          author,
          deskripsi: description,
          waktu: '',
          porsi: '',
          bahan_bahan: [],
          langkah_langkah: []
        });
      }
    });
  }

  const seen = new Set();
  const unique = results.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  }).slice(0, limit);

  let total = 0;
  const totalMatch = html.match(/<span[^>]*>\((\d+)\)<\/span>/);
  if (totalMatch) total = parseInt(totalMatch[1]);

  return {
    success: true,
    author: 'Pajar',
    creator: 'Pajar',
    data: {
      query,
      total: total || unique.length,
      results: unique
    }
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const q = String(req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({
      success: false,
      web: 'Cookora',
      developer: 'Pajar',
      error: 'Parameter q wajib diisi. Contoh: /api/search?q=nasi%20goreng'
    });
  }

  try {
    // Search dibuat lite supaya tidak timeout di Vercel; detail diambil saat card diklik via /api/detail.
    const result = await searchLite(q, 12);
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');
    return res.status(200).json({
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
      error: error.message || 'Gagal scraping Cookpad'
    });
  }
};
