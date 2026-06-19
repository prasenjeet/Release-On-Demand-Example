const express = require('express');
const fs = require('fs');
const path = require('path');
const { getClient } = require('../featureFlags');

const router = express.Router();

const FLAGS_FILE = process.env.FLAGS_FILE || path.join(__dirname, '../../../flags/flags.json');

const PRODUCTS = [
  { id: 1, name: 'Laptop Pro', price: 1299, category: 'Electronics', emoji: '💻', description: 'Powerful workstation for professionals', rating: 4.8 },
  { id: 2, name: 'Wireless Headphones', price: 199, category: 'Electronics', emoji: '🎧', description: 'Crystal-clear audio, 30-hour battery', rating: 4.7 },
  { id: 3, name: 'Coffee Maker', price: 89, category: 'Kitchen', emoji: '☕', description: 'Brew the perfect cup every morning', rating: 4.5 },
  { id: 4, name: 'Running Shoes', price: 149, category: 'Sports', emoji: '👟', description: 'Built for speed, engineered for comfort', rating: 4.6 },
  { id: 5, name: 'Yoga Mat', price: 45, category: 'Sports', emoji: '🧘', description: 'Premium non-slip, eco-friendly material', rating: 4.9 },
  { id: 6, name: 'Smart Watch', price: 299, category: 'Electronics', emoji: '⌚', description: 'Health tracking meets style', rating: 4.4 },
];

// Recommended products shown when canary-recommendation-engine is active
const RECOMMENDATIONS = [
  { id: 2, reason: 'Customers who bought your laptop also loved these' },
  { id: 6, reason: 'Trending in Electronics' },
  { id: 5, reason: 'Popular with fitness enthusiasts' },
];

function buildContext(req) {
  return {
    targetingKey: req.query.userId || `anon-${req.ip}`,
    email: req.query.email || '',
    role: req.query.role || 'user',
  };
}

// Evaluate all feature flags for the current user
router.get('/flags', async (req, res) => {
  try {
    const client = getClient();
    const ctx = buildContext(req);

    const [newLayout, expressCheckout, holidayPromo, betaSearch, canaryRec] = await Promise.all([
      client.getBooleanValue('new-product-layout', false, ctx),
      client.getBooleanValue('express-checkout', false, ctx),
      client.getBooleanValue('holiday-promotion', false, ctx),
      client.getBooleanValue('beta-search', false, ctx),
      client.getBooleanValue('canary-recommendation-engine', false, ctx),
    ]);

    res.json({
      'new-product-layout': newLayout,
      'express-checkout': expressCheckout,
      'holiday-promotion': holidayPromo,
      'beta-search': betaSearch,
      'canary-recommendation-engine': canaryRec,
    });
  } catch (err) {
    console.error('Flag evaluation error:', err.message);
    res.status(500).json({ error: 'Failed to evaluate flags' });
  }
});

// Get products, applying discounts when holiday-promotion is active
router.get('/products', async (req, res) => {
  try {
    const client = getClient();
    const ctx = buildContext(req);

    const [holidayPromo, canaryRec] = await Promise.all([
      client.getBooleanValue('holiday-promotion', false, ctx),
      client.getBooleanValue('canary-recommendation-engine', false, ctx),
    ]);

    const DISCOUNT = 20;
    const products = PRODUCTS.map(p => ({
      ...p,
      originalPrice: p.price,
      price: holidayPromo ? Math.round(p.price * (1 - DISCOUNT / 100)) : p.price,
      discount: holidayPromo ? DISCOUNT : 0,
    }));

    const recommendations = canaryRec
      ? RECOMMENDATIONS.map(r => ({ ...PRODUCTS.find(p => p.id === r.id), ...r }))
      : [];

    res.json({ products, recommendations, holidayPromotion: holidayPromo });
  } catch (err) {
    res.json({ products: PRODUCTS, recommendations: [], holidayPromotion: false });
  }
});

// ── Admin endpoints (flag management) ──────────────────────────────────────

// Return raw flags config for the admin UI
router.get('/admin/flags', (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync(FLAGS_FILE, 'utf8'));
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read flags config' });
  }
});

// Toggle or update a flag's defaultVariant / state
router.put('/admin/flags/:name', (req, res) => {
  try {
    const { name } = req.params;
    const { defaultVariant, state } = req.body;

    const config = JSON.parse(fs.readFileSync(FLAGS_FILE, 'utf8'));

    if (!config.flags[name]) {
      return res.status(404).json({ error: `Flag '${name}' not found` });
    }

    if (defaultVariant !== undefined) config.flags[name].defaultVariant = defaultVariant;
    if (state !== undefined) config.flags[name].state = state;

    fs.writeFileSync(FLAGS_FILE, JSON.stringify(config, null, 2));
    res.json({ success: true, flag: { name, ...config.flags[name] } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update flag' });
  }
});

module.exports = router;
