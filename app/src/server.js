const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

function setupRoutes() {
  app.use('/api', require('./routes/api'));

  app.get('/admin', (_req, res) =>
    res.sendFile(path.join(__dirname, '../public/admin.html'))
  );
  app.get('/checkout', (_req, res) =>
    res.sendFile(path.join(__dirname, '../public/checkout.html'))
  );
  app.get('/', (_req, res) =>
    res.sendFile(path.join(__dirname, '../public/index.html'))
  );
}

module.exports = { app, setupRoutes };
