const { initialize, InMemStorageProvider } = require('unleash-client');

let unleash = null;

const CATALOG_V1 = [
  { id: 1, name: 'Laptop Pro',          price: 1299, category: 'Electronics', emoji: '💻' },
  { id: 2, name: 'Wireless Headphones', price: 199,  category: 'Electronics', emoji: '🎧' },
  { id: 3, name: 'Coffee Maker',        price: 89,   category: 'Kitchen',     emoji: '☕' },
  { id: 4, name: 'Running Shoes',       price: 149,  category: 'Sports',      emoji: '👟' },
];

const CATALOG_V2_EXTRAS = [
  { id: 5, name: 'Smart Watch',    price: 299, category: 'Electronics', emoji: '⌚' },
  { id: 6, name: 'Yoga Mat',       price: 45,  category: 'Sports',      emoji: '🧘' },
  { id: 7, name: 'Air Purifier',   price: 199, category: 'Home',        emoji: '🌬️' },
];

async function init() {
  const url   = process.env.UNLEASH_URL   || 'http://unleash:4242/api';
  const token = process.env.UNLEASH_TOKEN || '*:*.unleash-insecure-api-token';

  try {
    unleash = initialize({
      url,
      appName: 'acme-api',
      customHeaders: { Authorization: token },
      // Use in-memory store for resilience — no file system needed
      storageProvider: new InMemStorageProvider(),
    });
    await unleash.start();
    console.log(`Unleash connected at ${url}`);
  } catch (err) {
    console.warn(`Unleash unavailable (${err.message}) — all flags default to OFF`);
  }
}

function isEnabled(flagName, context = {}) {
  if (!unleash) return false;
  try {
    return unleash.isEnabled(flagName, context);
  } catch {
    return false;
  }
}

function getProducts(context = {}) {
  const useNewCatalog = isEnabled('new-product-catalog', context);
  return useNewCatalog ? [...CATALOG_V1, ...CATALOG_V2_EXTRAS] : CATALOG_V1;
}

function getRecommendations(context = {}) {
  if (!isEnabled('ai-recommendations', context)) return [];
  return [
    { ...CATALOG_V1[0], reason: 'Most popular this week' },
    { ...CATALOG_V2_EXTRAS[0], reason: 'Trending in Electronics' },
  ];
}

function getHolidayDiscount(context = {}) {
  return isEnabled('holiday-promotion', context) ? 20 : 0;
}

module.exports = { init, isEnabled, getProducts, getRecommendations, getHolidayDiscount };
