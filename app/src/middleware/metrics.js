const client = require('prom-client');

client.collectDefaultMetrics({ prefix: 'acme_' });

const httpRequests = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'version'],
});

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code', 'version'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
});

const httpErrors = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP 5xx errors',
  labelNames: ['method', 'route', 'version'],
});

function metricsMiddleware(req, res, next) {
  const timer = httpDuration.startTimer();
  const version = process.env.APP_VERSION || 'unknown';

  res.on('finish', () => {
    const labels = {
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode,
      version,
    };
    httpRequests.inc(labels);
    timer(labels);
    if (res.statusCode >= 500) {
      httpErrors.inc({ method: req.method, route: req.route?.path || req.path, version });
    }
  });

  next();
}

module.exports = { metricsMiddleware, register: client.register };
