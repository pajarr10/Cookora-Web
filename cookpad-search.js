/**
 * PROJECT      : Cookpad Search
 * AUTHOR       : BINTANG
 * CREATOR      : BINTANG
 * DESC         : Scraper Cookpad - search + detail langsung digabung
 * USAGE        : node cookpad.js "nasi goreng"
 **/

const https = require('https');
const cheerio = require('cheerio');

class CookpadScraper {
    constructor() {
        this.baseUrl = 'https://cookpad.com';
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
    }

    requestHTML(path) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'cookpad.com',
                path: path,
                method: 'GET',
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8'
                }
            };

            const req = https.get(options, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const loc = res.headers.location;
                    const newPath = loc.startsWith('http') ? new URL(loc).pathname : loc;
                    resolve(this.requestHTML(newPath));
                    return;
                }
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => resolve(data));
            });

            req.on('error', reject);
            req.end();
        });
    }

    parseISODuration(iso) {
        if (!iso) return '';
        const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return iso;
        const jam = parseInt(match[1] || 0);
        const menit = parseInt(match[2] || 0);
        if (jam && menit) return `${jam} jam ${menit} menit`;
        if (jam) return `${jam} jam`;
        if (menit) return `${menit} menit`;
        return iso;
    }

    parseJSONLD($) {
        let schema = null;
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const json = JSON.parse($(el).html());
                const schemas = Array.isArray(json) ? json : [json];
                for (const s of schemas) {
                    if (s['@type'] === 'Recipe') { schema = s; return false; }
                }
            } catch (e) {}
        });
        return schema;
    }

    extractSteps($, schema) {
        const langkah = [];

        if (schema && schema.recipeInstructions) {
            const instructions = schema.recipeInstructions;
            const list = Array.isArray(instructions) ? instructions : [instructions];
            list.forEach(step => {
                if (typeof step === 'string') {
                    if (step.trim().length > 3) langkah.push({ teks: step.replace(/\s+/g, ' ').trim(), gambar: [] });
                } else {
                    const teks = (step.text || step.description || step.name || '').replace(/\s+/g, ' ').trim();
                    let gambar = [];
                    if (step.image) {
                        const imgs = Array.isArray(step.image) ? step.image : [step.image];
                        gambar = imgs.map(img => typeof img === 'string' ? img : (img.url || '')).filter(Boolean);
                    }
                    if (teks.length > 3) langkah.push({ teks, gambar });
                }
            });
            if (langkah.length > 0) return langkah;
        }

        $('[id^="step-"], [id^="step_"]').each((i, el) => {
            const text = ($(el).find('p, span, .step-text').first().text() || $(el).text()).replace(/\s+/g, ' ').trim();
            if (text.length > 5 && !text.match(/^[0-9]+\.?$/) && !text.toLowerCase().startsWith('langkah')) {
                langkah.push({ teks: text, gambar: [] });
            }
        });
        if (langkah.length > 0) return langkah;

        $('ol.steps, ol.directions, [class*="step-list"], [class*="direction"]').each((i, el) => {
            $(el).find('li').each((j, li) => {
                const text = $(li).text().replace(/\s+/g, ' ').trim();
                if (text.length > 5) langkah.push({ teks: text, gambar: [] });
            });
        });
        if (langkah.length > 0) return langkah;

        $('section, div').each((i, el) => {
            const id = ($(el).attr('id') || '').toLowerCase();
            const cls = ($(el).attr('class') || '').toLowerCase();
            if (id.includes('step') || id.includes('cara') || cls.includes('step') || cls.includes('cara-membuat')) {
                $(el).find('li, p').each((j, child) => {
                    const text = $(child).text().replace(/\s+/g, ' ').trim();
                    if (text.length > 10) langkah.push({ teks: text, gambar: [] });
                });
            }
        });

        return langkah;
    }

    extractIngredients($, schema) {
        const bahan = [];

        if (schema) {
            const ingredients = schema.recipeIngredient || schema.ingredients;
            if (ingredients && Array.isArray(ingredients)) {
                ingredients.forEach(ing => {
                    const text = typeof ing === 'string' ? ing : (ing.name || '');
                    if (text.length > 1) bahan.push(text.replace(/\s+/g, ' ').trim());
                });
                if (bahan.length > 0) return bahan;
            }
        }

        $('[id^="ingredient-"], [data-ingredient-id]').each((i, el) => {
            const text = $(el).text().replace(/\s+/g, ' ').trim();
            if (text.length > 1) bahan.push(text);
        });
        if (bahan.length > 0) return bahan;

        $('.ingredient-list li, [class*="ingredient"] li').each((i, el) => {
            const text = $(el).text().replace(/\s+/g, ' ').trim();
            if (text.length > 1) bahan.push(text);
        });
        if (bahan.length > 0) return bahan;

        $('li').each((i, el) => {
            const text = $(el).text().replace(/\s+/g, ' ').trim();
            const parentId = ($(el).closest('[id]').attr('id') || '').toLowerCase();
            const parentClass = ($(el).closest('[class]').attr('class') || '').toLowerCase();
            if ((parentId.includes('ingredient') || parentClass.includes('ingredient')) && text.length > 1) {
                bahan.push(text);
            }
        });

        return bahan;
    }

    async getDetail(url) {
        try {
            const urlObj = new URL(url);
            const path = urlObj.pathname;
            const html = await this.requestHTML(path);
            const $ = cheerio.load(html);

            const schema = this.parseJSONLD($);

            const title = (schema && schema.name) || $('h1').first().text().trim() || '';

            let author = (schema && schema.author && schema.author.name) || '';
            if (!author) {
                $('picture img').each((i, img) => {
                    const src = $(img).attr('src') || '';
                    if (src.includes('/users/')) { author = ($(img).attr('alt') || '').trim(); return false; }
                });
            }
            if (!author) author = $('a[href*="/pengguna/"]').first().text().trim() || '';

            let image = (schema && schema.image) || '';
            if (!image) {
                $('picture').each((i, pic) => {
                    $(pic).find('source').each((j, src) => {
                        const srcset = $(src).attr('srcset') || '';
                        if (srcset.includes('/recipes/') && !$(src).attr('media')) {
                            image = srcset.split(' ')[0]; return false;
                        }
                    });
                    if (!image) {
                        const imgSrc = $(pic).find('img').attr('src') || '';
                        if (imgSrc.includes('/recipes/')) { image = imgSrc; return false; }
                    }
                    if (image) return false;
                });
            }

            const desc = (schema && schema.description)
                || $('meta[name="description"]').attr('content')
                || $('meta[property="og:description"]').attr('content')
                || '';

            let waktuRaw = (schema && (schema.totalTime || schema.cookTime || schema.prepTime)) || '';
            let waktu = this.parseISODuration(waktuRaw);

            if (!waktu) {
                $('[itemprop="totalTime"], [itemprop="cookTime"]').each((i, el) => {
                    const t = $(el).attr('content') || $(el).text().trim();
                    if (t) { waktu = this.parseISODuration(t); return false; }
                });
            }

            if (!waktu) {
                $('body').find('*').each((i, el) => {
                    if ($(el).children().length > 0) return;
                    const t = $(el).text().trim();
                    if (t.match(/^\d+\s*(menit|jam|min|hour)s?$/i) && !waktu) {
                        waktu = t;
                    }
                });
            }

            let porsi = (schema && schema.recipeYield) || $('meta[itemprop="recipeYield"]').attr('content') || '';
            if (!porsi) {
                $('[class*="serv"], [class*="porsi"], [class*="yield"]').each((i, el) => {
                    const t = $(el).text().trim();
                    if (t.match(/\d+/) && !porsi) porsi = t;
                });
            }

            const bahan = this.extractIngredients($, schema);
            const langkah = this.extractSteps($, schema);

            return {
                success: true,
                author: 'BINTANG',
                creator: 'BINTANG',
                data: {
                    judul: title,
                    author: author,
                    gambar: image,
                    deskripsi: desc,
                    waktu: waktu,
                    porsi: porsi,
                    bahan_bahan: bahan.slice(0, 30),
                    langkah_langkah: langkah.slice(0, 20),
                    url: url
                }
            };

        } catch (error) {
            return { success: false, author: 'BINTANG', creator: 'BINTANG', error: error.message };
        }
    }

    async search(query) {
        try {
            const path = `/id/cari/${encodeURIComponent(query)}`;
            const html = await this.requestHTML(path);
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
                    if (src.includes('/users/')) { author = ($(img).attr('alt') || '').trim(); return false; }
                });
                if (!author) author = $(el).find('div.flex.items-center span.break-all span').text().trim() || '';

                let image = '';
                $(el).find('picture').each((j, pic) => {
                    const src = $(pic).find('img').attr('src') || '';
                    if (src.includes('/recipes/')) { image = src; return false; }
                });

                let description = '';
                const descEl = $(el).find('.line-clamp-2');
                if (descEl.length) {
                    const parts = [];
                    descEl.contents().each((j, node) => {
                        if (node.type === 'text') { const t = $(node).text().trim(); if (t) parts.push(t); }
                    });
                    description = parts.join(', ');
                }

                if (link && link.includes('/resep/') && title) {
                    const fullUrl = link.startsWith('http') ? link : `${this.baseUrl}${link}`;
                    results.push({ title, url: fullUrl, author, image, description });
                }
            });

            if (results.length === 0) {
                $('.recipe-item, .recipe-card, .feed-item, .browse-recipe-item').each((i, el) => {
                    const title = $(el).find('.title, .recipe-title, h2, h3').first().text().trim() || '';
                    const link = $(el).find('a[href*="/resep/"]').first().attr('href') || '';
                    let author = '';
                    $(el).find('picture img').each((j, img) => {
                        const src = $(img).attr('src') || '';
                        if (src.includes('/users/')) { author = ($(img).attr('alt') || '').trim(); return false; }
                    });
                    let image = '';
                    $(el).find('picture img').each((j, img) => {
                        const src = $(img).attr('src') || '';
                        if (src.includes('/recipes/')) { image = src; return false; }
                    });
                    const description = $(el).find('.line-clamp-2').text().replace(/\s+/g, ' ').trim() || '';
                    if (link && link.includes('/resep/') && title) {
                        const fullUrl = link.startsWith('http') ? link : `${this.baseUrl}${link}`;
                        results.push({ title, url: fullUrl, author, image, description });
                    }
                });
            }

            const seen = new Set();
            const unique = results.filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });

            let total = 0;
            const totalMatch = html.match(/<span[^>]*>\((\d+)\)<\/span>/);
            if (totalMatch) total = parseInt(totalMatch[1]);

            const recipes = [];
            for (const r of unique.slice(0, 10)) {
                try {
                    const detail = await this.getDetail(r.url);
                    recipes.push({
                        judul:           detail.success ? detail.data.judul    : r.title,
                        url:             r.url,
                        gambar:          detail.success && detail.data.gambar  ? detail.data.gambar : r.image,
                        author:          detail.success ? detail.data.author   : r.author,
                        deskripsi:       detail.success ? detail.data.deskripsi : r.description,
                        waktu:           detail.success ? detail.data.waktu    : '',
                        porsi:           detail.success ? detail.data.porsi    : '',
                        bahan_bahan:     detail.success ? detail.data.bahan_bahan    : [],
                        langkah_langkah: detail.success ? detail.data.langkah_langkah : []
                    });
                } catch (e) {
                    recipes.push({
                        judul: r.title, url: r.url, gambar: r.image, author: r.author,
                        deskripsi: r.description, waktu: '', porsi: '', bahan_bahan: [], langkah_langkah: []
                    });
                }
            }

            return {
                success: true,
                author: 'BINTANG',
                creator: 'BINTANG',
                data: { query, total: total || unique.length, results: recipes }
            };

        } catch (error) {
            return { success: false, author: 'BINTANG', creator: 'BINTANG', error: error.message };
        }
    }
}

async function main() {
    const args = process.argv.slice(2);
    const scraper = new CookpadScraper();

    if (args.length === 0) {
        console.log(JSON.stringify({
            success: false, author: 'BINTANG', creator: 'BINTANG',
            error: 'Usage: node cookpad.js "nasi goreng"',
            example2: 'node cookpad.js nasi gorenh"'
        }, null, 2));
        return;
    }

    if (args[0] === '--detail' && args[1]) {
        const result = await scraper.getDetail(args[1]);
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    const query = args.join(' ');
    const result = await scraper.search(query);
    console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
    main();
}

module.exports = CookpadScraper;