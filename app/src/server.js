const express = require('express');
const { metricsMiddleware } = require('./middleware/metrics');

const app = express();
app.use(express.json());
app.use(metricsMiddleware);

function setupRoutes() {
  app.use('/',    require('./routes/health'));
  app.use('/api', require('./routes/products'));

  app.use((err, _req, res, _next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
  });
}

module.exports = { app, setupRoutes };
