const { app, setupRoutes } = require('./server');
const { init: initFlags } = require('./featureFlags');

async function main() {
  await initFlags();
  setupRoutes();

  const port    = Number(process.env.PORT) || 8080;
  const version = process.env.APP_VERSION || 'dev';

  app.listen(port, () => {
    console.log(`\n🚀  Acme API ${version}  →  http://localhost:${port}`);
    console.log(`📊  Metrics        →  http://localhost:${port}/metrics`);
    console.log(`🏥  Health         →  http://localhost:${port}/health\n`);
  });
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
