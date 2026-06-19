const { OpenFeature } = require('@openfeature/server-sdk');
const { FlagdProvider } = require('@openfeature/flagd-provider');

let client = null;

async function init() {
  const host = process.env.FLAGD_HOST || 'localhost';
  const port = Number(process.env.FLAGD_PORT) || 8013;

  try {
    await OpenFeature.setProviderAndWait(
      new FlagdProvider({ host, port, tls: false })
    );
    console.log(`Connected to flagd at ${host}:${port}`);
  } catch (err) {
    console.warn(`Could not connect to flagd (${err.message}) — flags will return defaults`);
  }

  client = OpenFeature.getClient('acme-shop');
  return client;
}

function getClient() {
  if (!client) throw new Error('Feature flags not initialized. Call init() first.');
  return client;
}

module.exports = { init, getClient };
