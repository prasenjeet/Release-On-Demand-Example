const { Router } = require('express');
const { register } = require('../middleware/metrics');

const router = Router();

const START_TIME = Date.now();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: process.env.APP_VERSION || 'dev',
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
  });
});

router.get('/ready', (_req, res) => res.json({ ready: true }));

router.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

module.exports = router;
