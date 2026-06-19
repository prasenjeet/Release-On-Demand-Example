const request = require('supertest');
const path = require('path');

// ── Mock feature flags so tests don't need a real flagd ──────────────────────
jest.mock('../src/featureFlags', () => ({
  init: jest.fn().mockResolvedValue({}),
  getClient: jest.fn().mockReturnValue({
    getBooleanValue: jest.fn().mockResolvedValue(false),
    getStringValue:  jest.fn().mockResolvedValue(''),
    getNumberValue:  jest.fn().mockResolvedValue(0),
  }),
}));

// Override flags file path to use the fixture in this directory
process.env.FLAGS_FILE = path.join(__dirname, 'fixtures/flags.json');

const { app, setupRoutes } = require('../src/server');
setupRoutes();

// ── /api/flags ────────────────────────────────────────────────────────────────

describe('GET /api/flags', () => {
  it('returns 200 with all feature flags', async () => {
    const res = await request(app).get('/api/flags');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('new-product-layout');
    expect(res.body).toHaveProperty('express-checkout');
    expect(res.body).toHaveProperty('holiday-promotion');
    expect(res.body).toHaveProperty('beta-search');
    expect(res.body).toHaveProperty('canary-recommendation-engine');
  });

  it('all flags default to false when flagd returns false', async () => {
    const res = await request(app).get('/api/flags');
    expect(Object.values(res.body).every(v => v === false)).toBe(true);
  });
});

// ── /api/products ─────────────────────────────────────────────────────────────

describe('GET /api/products', () => {
  it('returns a non-empty products array', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body.products.length).toBeGreaterThan(0);
  });

  it('products have required fields', async () => {
    const res = await request(app).get('/api/products');
    for (const p of res.body.products) {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('price');
      expect(p).toHaveProperty('emoji');
    }
  });

  it('no discount applied when holiday-promotion flag is off', async () => {
    const res = await request(app).get('/api/products');
    expect(res.body.holidayPromotion).toBe(false);
    for (const p of res.body.products) {
      expect(p.discount).toBe(0);
      expect(p.price).toBe(p.originalPrice);
    }
  });
});

// ── /api/admin/flags ──────────────────────────────────────────────────────────

describe('GET /api/admin/flags', () => {
  it('returns the flags configuration object', async () => {
    const res = await request(app).get('/api/admin/flags');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('flags');
    expect(typeof res.body.flags).toBe('object');
  });
});

// ── Static pages ──────────────────────────────────────────────────────────────

describe('Static pages', () => {
  it('GET / returns 200', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
  });

  it('GET /admin returns 200', async () => {
    const res = await request(app).get('/admin');
    expect(res.status).toBe(200);
  });

  it('GET /checkout returns 200', async () => {
    const res = await request(app).get('/checkout');
    expect(res.status).toBe(200);
  });
});
