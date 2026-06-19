const { app, setupRoutes } = require('./server');
const { init: initFlags } = require('./featureFlags');

async function main() {
  await initFlags();
  setupRoutes();

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`\n🛒  Acme Shop  →  http://localhost:${port}`);
    console.log(`⚙   Admin UI   →  http://localhost:${port}/admin`);
    console.log('\nTip: edit flags/flags.json and flagd will hot-reload them.\n');
  });
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
