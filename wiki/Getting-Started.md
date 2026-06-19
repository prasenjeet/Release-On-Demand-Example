# Getting Started

## Local Demo (5 minutes)

### Prerequisites

- Docker Desktop or Docker Engine with Compose v2
- `curl` (for testing)
- `jq` (optional, for pretty JSON output)

### Start the Stack

```bash
git clone https://github.com/prasenjeet/release-on-demand-example.git
cd release-on-demand-example
./scripts/setup-local.sh
```

This builds two app images (stable v1, canary v2), starts Unleash + PostgreSQL, Prometheus, Grafana, and an Nginx traffic splitter.

### Access Points

| Service | URL | Credentials |
|---------|-----|-------------|
| API (load-balanced, 95% stable / 5% canary) | http://localhost:8080/api/products | — |
| Stable API (direct) | http://localhost:8081/api/products | — |
| Canary API (direct) | http://localhost:8082/api/products | — |
| **Unleash** (feature flags) | http://localhost:4242 | admin / unleash4all |
| Prometheus | http://localhost:9090 | — |
| **Grafana** | http://localhost:3000 | admin / admin |

---

## Guided Demo Walkthrough

### 1. Observe the baseline

```bash
# Both stable and canary return 4 products (features are OFF)
curl -s http://localhost:8081/api/products | jq '.meta'
curl -s http://localhost:8082/api/products | jq '.meta'
```

Output for both:
```json
{
  "version": "v1.0.0",
  "totalProducts": 4,
  "holidayDiscount": 0,
  "features": {
    "newProductCatalog": false,
    "aiRecommendations": false,
    "holidayPromotion": false
  }
}
```

### 2. Simulate traffic shifting (canary at 20%)

```bash
./scripts/promote-canary.sh --step 20
```

Nginx now routes 80% to stable, 20% to canary. Open **Grafana** (http://localhost:3000) and watch the dashboard update.

### 3. Verify Prometheus metrics

```bash
# Success rates for both versions
curl -s 'http://localhost:9090/api/v1/query?query=canary:http_success_rate:5m' | jq '.data.result'

# P99 latency
curl -s 'http://localhost:9090/api/v1/query?query=canary:http_latency_p99:5m' | jq '.data.result'
```

Both should show ≥ 0.99 (99%) success rate and < 0.5s latency — the canary is healthy.

### 4. Promote canary to 100%

```bash
./scripts/promote-canary.sh --step 100
```

All traffic is now on v2.0.0. The new product catalog and other features are **still hidden**.

### 5. Release a feature (the ROD moment)

Open **Unleash** at http://localhost:4242 and enable **`new-product-catalog`**.

```bash
# Verify: canary now returns 7 products instead of 4
curl -s http://localhost:8082/api/products | jq '.meta.totalProducts'
# → 7
```

No deployment. No downtime. The feature was already in production — just hidden.

### 6. Enable a campaign flag

In Unleash, enable **`holiday-promotion`**:

```bash
curl -s http://localhost:8082/api/products | jq '.products[0] | {name, price, discount}'
# → {"name": "Laptop Pro", "price": 1039, "discount": 20}
```

20% off all products — activated by a business toggle, not a deployment.

### 7. Emergency rollback

```bash
# Roll back canary traffic
./scripts/rollback.sh

# Disable a feature flag instantly
curl -X POST http://localhost:4242/api/admin/features/holiday-promotion/toggle/off \
  -H 'Authorization: *:*.unleash-insecure-api-token'
```

---

## Running Tests

```bash
cd app
npm install
npm test
```

All 9 tests pass without any external services (Unleash and Prometheus are mocked).

---

## Next Steps

- Read [Architecture](Architecture) to understand the full stack
- See [CI/CD Pipeline](CI-CD-Pipeline) to wire up Tekton + ArgoCD in Kubernetes
- See [Canary Deployments](Canary-Deployments) to deploy with Argo Rollouts
- See [Feature Flags](Feature-Flags) to configure Unleash for your use case
