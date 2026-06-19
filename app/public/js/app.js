/* ── Acme Shop — Feature-flag-driven frontend ───────────────────────────── */

// Stable user ID for this browser session (persisted so canary % stays consistent)
const userId = (() => {
  let id = sessionStorage.getItem('userId');
  if (!id) { id = `user-${Math.random().toString(36).slice(2, 10)}`; sessionStorage.setItem('userId', id); }
  return id;
})();

let flags = {};
let allProducts = [];

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadFlags() {
  const params = new URLSearchParams({ userId });
  const email = localStorage.getItem('userEmail') || '';
  if (email) params.set('email', email);
  const res = await fetch(`/api/flags?${params}`);
  flags = await res.json();
}

async function loadProducts() {
  const params = new URLSearchParams({ userId });
  const res = await fetch(`/api/products?${params}`);
  return res.json();
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function stars(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  return '★'.repeat(full) + (half ? '½' : '') + `  ${rating}`;
}

function priceHtml(p) {
  if (p.discount > 0) {
    return `<span class="old-price">$${p.originalPrice}</span>
            <span class="price sale">$${p.price}</span>
            <span class="disc-badge">-${p.discount}%</span>`;
  }
  return `<span class="price">$${p.price}</span>`;
}

function renderFeatureBadges() {
  const el = document.getElementById('feature-badges');
  el.innerHTML = Object.entries(flags).map(([name, on]) =>
    `<span class="badge ${on ? 'badge-on' : 'badge-off'}">${name}: ${on ? 'ON' : 'OFF'}</span>`
  ).join('');
}

function renderHolidayBanner() {
  document.getElementById('holiday-banner')
    .classList.toggle('hidden', !flags['holiday-promotion']);
}

function renderSearch() {
  const sec = document.getElementById('search-section');
  sec.classList.toggle('hidden', !flags['beta-search']);
  if (flags['beta-search']) {
    document.getElementById('search-input').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      const filtered = q
        ? allProducts.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
        : allProducts;
      renderProductList(filtered);
    });
  }
}

function renderRecommendations(recs) {
  const sec = document.getElementById('recommendations-section');
  if (!recs || recs.length === 0) { sec.classList.add('hidden'); return; }
  sec.classList.remove('hidden');
  document.getElementById('rec-row').innerHTML = recs.map(r => `
    <div class="rec-card" onclick="addToCart(${r.id})">
      <div class="rec-emoji">${r.emoji}</div>
      <div class="rec-name">${r.name}</div>
      <div class="rec-reason">${r.reason}</div>
      <div class="rec-price">$${r.price}</div>
    </div>
  `).join('');
}

function renderProductList(products) {
  const container = document.getElementById('products-container');
  const isGrid = flags['new-product-layout'];

  if (isGrid) {
    container.className = 'products-grid';
    container.innerHTML = products.map(p => `
      <article class="product-card">
        <span class="card-emoji">${p.emoji}</span>
        <div class="card-body">
          <span class="product-category">${p.category}</span>
          <h3 class="product-name">${p.name}</h3>
          <p class="product-desc">${p.description}</p>
          <div class="card-stars">${stars(p.rating)}</div>
          <div class="price-row">${priceHtml(p)}</div>
          <button class="btn btn-primary" onclick="addToCart(${p.id})">
            ${flags['express-checkout'] ? '⚡ Express Buy' : 'Add to Cart'}
          </button>
        </div>
      </article>
    `).join('');
  } else {
    container.className = 'products-list';
    container.innerHTML = products.map(p => `
      <article class="product-row">
        <span class="row-emoji">${p.emoji}</span>
        <div class="row-info">
          <div class="product-name">${p.name}</div>
          <div class="product-desc">${p.description}</div>
          <div class="row-stars">${stars(p.rating)}</div>
        </div>
        <div class="row-right">
          <div class="price-group price-row">${priceHtml(p)}</div>
          <button class="btn btn-sm" onclick="addToCart(${p.id})">
            ${flags['express-checkout'] ? '⚡ Buy' : 'Add'}
          </button>
        </div>
      </article>
    `).join('');
  }
}

// ── View toggle ───────────────────────────────────────────────────────────────

function setupViewToggle() {
  const btnList = document.getElementById('btn-list');
  const btnGrid = document.getElementById('btn-grid');

  function setView(isGrid) {
    flags['new-product-layout'] = isGrid;
    btnGrid.classList.toggle('active', isGrid);
    btnList.classList.toggle('active', !isGrid);
    renderProductList(allProducts);
    renderFeatureBadges();
  }

  btnList.addEventListener('click', () => setView(false));
  btnGrid.addEventListener('click', () => setView(true));

  // Sync buttons to current flag state
  const isGrid = flags['new-product-layout'];
  btnGrid.classList.toggle('active', isGrid);
  btnList.classList.toggle('active', !isGrid);
}

// ── Cart / checkout ───────────────────────────────────────────────────────────

function addToCart(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;

  if (flags['express-checkout']) {
    // Store cart and jump straight to checkout
    sessionStorage.setItem('cart', JSON.stringify([p]));
    window.location.href = '/checkout?express=1';
  } else {
    sessionStorage.setItem('cart', JSON.stringify([p]));
    alert(`✅ "${p.name}" added to cart!\nHead to checkout when ready.`);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const [_, productData] = await Promise.all([loadFlags(), loadProducts()]);
    allProducts = productData.products;

    renderFeatureBadges();
    renderHolidayBanner();
    renderSearch();
    renderRecommendations(productData.recommendations);
    renderProductList(allProducts);
    setupViewToggle();
  } catch (err) {
    document.getElementById('products-container').innerHTML =
      `<div class="loading">⚠ Failed to load. Is the server running?</div>`;
    console.error(err);
  }
}

init();
