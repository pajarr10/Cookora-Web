const form = document.querySelector('#searchForm');
const input = document.querySelector('#queryInput');
const resultsEl = document.querySelector('#results');
const statusEl = document.querySelector('#status');
const modal = document.querySelector('#modal');
const modalContent = document.querySelector('#modalContent');

let latestResults = [];

function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function imageProxy(url) {
  return url ? `/api/image?url=${encodeURIComponent(url)}` : '';
}

function setStatus(message, type = 'info') {
  statusEl.innerHTML = message ? `<span class="bubble ${type}">${escapeHTML(message)}</span>` : '';
}

function fallbackImage() {
  return '<div class="empty-img">🍽️</div>';
}

function recipeImageHTML(recipe) {
  if (!recipe.gambar) return fallbackImage();
  return `<img src="${escapeHTML(imageProxy(recipe.gambar))}" alt="${escapeHTML(recipe.judul || 'Gambar resep')}" loading="lazy" onerror="this.parentElement.innerHTML='&lt;div class=&quot;empty-img&quot;&gt;🍽️&lt;/div&gt;'" />`;
}

function normalizeSteps(steps = []) {
  return steps.map((step) => typeof step === 'string' ? step : (step?.teks || step?.text || '')).filter(Boolean);
}

function renderResults(recipes = [], query = '') {
  latestResults = recipes;
  if (!recipes.length) {
    resultsEl.innerHTML = '';
    setStatus(`Belum ada hasil untuk “${query}”. Coba kata kunci lain ya.`, 'empty');
    return;
  }

  setStatus(`${recipes.length} resep ditemukan untuk “${query}”. Klik kartu untuk lihat detail.`, 'success');
  resultsEl.innerHTML = recipes.map((recipe, index) => `
    <article class="recipe-card" tabindex="0" role="button" data-index="${index}" aria-label="Buka detail ${escapeHTML(recipe.judul)}">
      <div class="recipe-media">${recipeImageHTML(recipe)}</div>
      <div class="recipe-body">
        <h3>${escapeHTML(recipe.judul || 'Resep tanpa judul')}</h3>
        <p class="author">👩‍🍳 ${escapeHTML(recipe.author || 'Author Cookpad')}</p>
        <p class="desc">${escapeHTML(recipe.deskripsi || 'Tidak ada deskripsi singkat. Buka detail untuk melihat bahan dan langkah pembuatan.')}</p>
        <div class="meta-row">
          ${recipe.waktu ? `<span class="chip">⏱ ${escapeHTML(recipe.waktu)}</span>` : ''}
          ${recipe.porsi ? `<span class="chip">🍽 ${escapeHTML(Array.isArray(recipe.porsi) ? recipe.porsi.join(', ') : recipe.porsi)}</span>` : ''}
          <span class="chip">🥕 ${(recipe.bahan_bahan || []).length} bahan</span>
        </div>
      </div>
    </article>
  `).join('');
}

async function searchRecipes(query) {
  const q = query.trim();
  if (!q) return;

  resultsEl.innerHTML = '';
  setStatus('Sebertar ya lagi nyari... tunggu sebentar yaa');

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const payload = await response.json();

    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Gagal mencari resep.');
    }

    const recipes = payload?.data?.results || [];
    renderResults(recipes, q);
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Terjadi kesalahan koneksi.', 'error');
  }
}

async function ensureDetail(recipe) {
  const hasDetail = (recipe.bahan_bahan && recipe.bahan_bahan.length) || (recipe.langkah_langkah && recipe.langkah_langkah.length);
  if (hasDetail || !recipe.url) return recipe;

  const response = await fetch(`/api/detail?url=${encodeURIComponent(recipe.url)}`);
  const payload = await response.json();
  if (!response.ok || !payload.success) return recipe;
  return { ...recipe, ...payload.data };
}

function openModal() {
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function renderDetail(recipe) {
  const ingredients = recipe.bahan_bahan || [];
  const steps = normalizeSteps(recipe.langkah_langkah || []);
  const porsi = Array.isArray(recipe.porsi) ? recipe.porsi.join(', ') : recipe.porsi;

  modalContent.innerHTML = `
    <section class="detail-hero">
      <div class="detail-image">${recipeImageHTML(recipe)}</div>
      <div class="detail-copy">
        <p class="pill yellow">Detail Resep</p>
        <h2 id="modalTitle">${escapeHTML(recipe.judul || 'Detail Resep')}</h2>
        <p>${escapeHTML(recipe.deskripsi || 'Resep ini belum memiliki deskripsi panjang.')}</p>
        <div class="meta-row">
          <span class="chip">👩‍🍳 ${escapeHTML(recipe.author || 'Author Cookpad')}</span>
          ${recipe.waktu ? `<span class="chip">⏱ ${escapeHTML(recipe.waktu)}</span>` : ''}
          ${porsi ? `<span class="chip">🍽 ${escapeHTML(porsi)}</span>` : ''}
        </div>
        ${recipe.url ? `<div class="external-link"><a class="btn secondary" href="${escapeHTML(recipe.url)}" target="_blank" rel="noopener">Buka Sumber Cookpad ↗</a></div>` : ''}
      </div>
    </section>

    <section class="detail-sections">
      <div class="detail-box ingredients">
        <h3>🥕 Bahan-bahan</h3>
        ${ingredients.length ? `
          <ul class="check-list">
            ${ingredients.map((item, idx) => `
              <li><input id="ing-${idx}" type="checkbox"><label for="ing-${idx}">${escapeHTML(item)}</label></li>
            `).join('')}
          </ul>
        ` : '<p>Data bahan belum tersedia dari halaman resep.</p>'}
      </div>

      <div class="detail-box steps">
        <h3>🔥 Langkah-langkah</h3>
        ${steps.length ? `
          <ol class="steps-list">
            ${steps.map(step => `<li>${escapeHTML(step)}</li>`).join('')}
          </ol>
        ` : '<p>Data langkah belum tersedia dari halaman resep.</p>'}
      </div>
    </section>
  `;
}

async function handleCardOpen(card) {
  const index = Number(card.dataset.index);
  const recipe = latestResults[index];
  if (!recipe) return;

  modalContent.innerHTML = '<div class="detail-copy" style="margin:18px"><p class="pill cyan">Memuat detail...</p><h2>Sedang mengambil resep 🍳</h2></div>';
  openModal();

  try {
    const detailed = await ensureDetail(recipe);
    latestResults[index] = detailed;
    renderDetail(detailed);
  } catch (error) {
    console.error(error);
    renderDetail(recipe);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  searchRecipes(input.value);
});

document.querySelectorAll('.quick-tags button').forEach((button) => {
  button.addEventListener('click', () => {
    input.value = button.dataset.query;
    searchRecipes(input.value);
    location.hash = '#search';
  });
});

resultsEl.addEventListener('click', (event) => {
  const card = event.target.closest('.recipe-card');
  if (card) handleCardOpen(card);
});

resultsEl.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('.recipe-card');
  if (card) {
    event.preventDefault();
    handleCardOpen(card);
  }
});

modal.addEventListener('click', (event) => {
  if (event.target.dataset.close) closeModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') closeModal();
});

// Pencarian awal agar halaman terasa hidup.
window.addEventListener('load', () => {
  input.value = 'tiramisu';
  searchRecipes(input.value);
});
