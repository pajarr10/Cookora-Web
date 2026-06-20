# Cookora 🍳

Cookora adalah web app pencari resep makanan dengan scraping Cookpad tanpa API resmi.

- Nama Web: **Cookora**
- Developer: **Pajar**
- GitHub: <https://github.com/pajarr10>
- Website: <https://pixajar.my.id>

## Stack

- Backend: Node.js + Express.js
- Scraper: Cheerio + modul `https` bawaan Node.js
- Frontend: Vanilla HTML, CSS, JavaScript
- Tanpa build tool, tanpa React/Vue, tanpa Puppeteer — ramah Termux.

## Struktur Folder

```txt
cookora/
├── package.json
├── server.js
├── cookpad-search.js
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── README.md
```

## Cara Menjalankan di Termux

```bash
pkg update && pkg upgrade
pkg install nodejs

cd cookora
npm install
npm start
```

Buka browser Android lalu akses:

```txt
http://localhost:3000
```

Jika ingin mengganti port:

```bash
PORT=8080 npm start
```

## Endpoint API

### Health Check

```txt
GET /api/health
```

### Search Resep

```txt
GET /api/search?q=nasi%20goreng
```

### Detail Resep

```txt
GET /api/detail?url=https://cookpad.com/id/resep/...
```

### Proxy Gambar

```txt
GET /api/image?url=https://img-global.cpcdn.com/...
```
