const { Router } = require('express');
const flags = require('../featureFlags');

const router = Router();

function buildContext(req) {
  return {
    userId:     req.query.userId || req.headers['x-user-id'] || 'anonymous',
    sessionId:  req.query.sessionId || '',
    remoteAddress: req.ip,
    properties: {
      email: req.query.email || req.headers['x-user-email'] || '',
      role:  req.query.role  || req.headers['x-user-role']  || 'user',
    },
  };
}

// GET /api/products
router.get('/products', (req, res) => {
  const ctx      = buildContext(req);
  const products = flags.getProducts(ctx);
  const recs     = flags.getRecommendations(ctx);
  const discount = flags.getHolidayDiscount(ctx);
  const version  = process.env.APP_VERSION || 'dev';

  const pricedProducts = discount > 0
    ? products.map(p => ({ ...p, originalPrice: p.price, price: Math.round(p.price * (1 - discount / 100)), discount }))
    : products;

  res.json({
    products: pricedProducts,
    recommendations: recs,
    meta: {
      version,
      totalProducts: pricedProducts.length,
      holidayDiscount: discount,
      features: {
        newProductCatalog:  flags.isEnabled('new-product-catalog', ctx),
        aiRecommendations:  flags.isEnabled('ai-recommendations', ctx),
        holidayPromotion:   flags.isEnabled('holiday-promotion', ctx),
      },
    },
  });
});

// GET /api/products/:id
router.get('/products/:id', (req, res) => {
  const ctx      = buildContext(req);
  const products = flags.getProducts(ctx);
  const p        = products.find(x => x.id === Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json(p);
});

module.exports = router;
