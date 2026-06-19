const request = require('supertest');

jest.mock('../src/featureFlags', () => ({
  init: jest.fn().mockResolvedValue(undefined),
  isEnabled: jest.fn().mockReturnValue(false),
  getProducts: jest.fn().mockReturnValue([
    { id: 1, name: 'Laptop Pro', price: 1299, category: 'Electronics', emoji: '💻' },
    { id: 2, name: 'Headphones', price: 199,  category: 'Electronics', emoji: '🎧' },
  ]),
  getRecommendations: jest.fn().mockReturnValue([]),
  getHolidayDiscount: jest.fn().mockReturnValue(0),
}));

const { app, setupRoutes } = require('../src/server');
setupRoutes();

describe('Health endpoints', () => {
  it('GET /health returns 200 with version', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('version');
  });

  it('GET /ready returns 200', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
  });

  it('GET /metrics returns Prometheus text', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/# HELP/);
  });
});

describe('GET /api/products', () => {
  it('returns product list with meta', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body.products.length).toBeGreaterThan(0);
    expect(res.body.meta).toHaveProperty('version');
    expect(res.body.meta).toHaveProperty('features');
  });

  it('products have required fields', async () => {
    const res = await request(app).get('/api/products');
    for (const p of res.body.products) {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('price');
    }
  });

  it('no discount when holiday-promotion flag is off', async () => {
    const res = await request(app).get('/api/products');
    expect(res.body.meta.holidayDiscount).toBe(0);
    expect(res.body.meta.features.holidayPromotion).toBe(false);
  });

  it('all feature flags are off by default', async () => {
    const res = await request(app).get('/api/products');
    const { features } = res.body.meta;
    expect(features.newProductCatalog).toBe(false);
    expect(features.aiRecommendations).toBe(false);
    expect(features.holidayPromotion).toBe(false);
  });
});

describe('GET /api/products/:id', () => {
  it('returns a single product', async () => {
    const res = await request(app).get('/api/products/1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 1);
  });

  it('returns 404 for unknown product', async () => {
    const res = await request(app).get('/api/products/999');
    expect(res.status).toBe(404);
  });
});
