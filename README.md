# Release on Demand — Production-Grade Sample Project

A complete, runnable demonstration of the Release on Demand pattern using
open-source Kubernetes-native tools. Every layer is real and wired together.

---

## The Stack

```
Code Merge (GitHub)
        │
        ▼
┌───────────────────┐
│  Tekton Pipelines │  CI: clone → test → build image → push → update gitops
└────────┬──────────┘
         │  git commit (new image tag in kustomization.yaml)
         ▼
┌───────────────────┐
│     ArgoCD        │  CD: detects git drift → syncs Rollout to cluster
└────────┬──────────┘
         │  Argo Rollout CR applied
         ▼
┌───────────────────┐
│  Argo Rollouts    │  Canary: 5% → analysis → 20% → analysis → 50% → PAUSE
└────────┬──────────┘
         │  Istio VirtualService weights patched per step
         ▼
┌────────────────────────┐
│  Istio / Flagger       │  Traffic: weight-based routing, mTLS, retries
└────────┬───────────────┘
         │  metrics scraped every 15s
         ▼
┌───────────────────────────────────────────────────────┐
│  Prometheus + Grafana                                  │
│  AnalysisTemplate gates: success_rate ≥ 99%            │
│                          p99_latency < 500ms           │
│  Auto-rollback on failure. Dashboard shows live diff.  │
└────────┬──────────────────────────────────────────────┘
         │  canary promoted (metrics passed, PAUSED step reached)
         │  CODE IS DEPLOYED. FEATURES STILL HIDDEN.
         ▼
┌───────────────────────────────────────────────────────┐ ← ROD HERE
│  Unleash Feature Flags                                 │
│  Business decision: PM / Release Manager              │
│    Toggle "new-product-catalog" → ON                  │
│    Toggle "holiday-promotion"   → ON (sale!)          │
│    Toggle "ai-recommendations"  → ON (beta users)     │
│                                                        │
│  Zero deployment. Instant. Instantly reversible.       │
└───────────────────────────────────────────────────────┘
```

---

## Open-Source Tools

| Tool | Version | Role |
|------|---------|------|
| [Tekton Pipelines](https://tekton.dev) | v0.58+ | CI — build, test, push |
| [Tekton Triggers](https://tekton.dev/docs/triggers) | v0.26+ | GitHub webhook → PipelineRun |
| [ArgoCD](https://argo-cd.readthedocs.io) | v2.10+ | GitOps CD |
| [Argo Rollouts](https://argoproj.github.io/rollouts) | v1.7+ | Canary / Blue-Green |
| [Istio](https://istio.io) | v1.21+ | Service mesh, traffic splitting |
| [Flagger](https://flagger.app) | v1.38+ | Alternative progressive delivery |
| [Unleash](https://unleash.io) | v6+ | Self-hosted feature flags |
| [Prometheus](https://prometheus.io) | v2.51+ | Metrics + canary analysis |
| [Grafana](https://grafana.com) | v10.4+ | Dashboards |

All tools are Apache 2.0 licensed (Grafana is AGPL 3.0).

---

## Quick Start (Local Demo)

**Requirements:** Docker + Docker Compose v2

```bash
git clone https://github.com/org/release-on-demand-example.git
cd release-on-demand-example
./scripts/setup-local.sh
```

**Access points after startup:**

| Service | URL | Credentials |
|---------|-----|-------------|
| API (load-balanced) | http://localhost:8080/api/products | — |
| Stable direct | http://localhost:8081/api/products | — |
| Canary direct | http://localhost:8082/api/products | — |
| **Unleash** (feature flags) | http://localhost:4242 | admin / unleash4all |
| Prometheus | http://localhost:9090 | — |
| **Grafana** | http://localhost:3000 | admin / admin |

---

## Hands-On Demo Walkthrough

### Step 1 — Observe the baseline

```bash
# Stable returns 4 products, v1.0.0
curl http://localhost:8081/api/products | jq '.meta'

# Canary returns 4 products too — new catalog is hidden behind a flag
curl http://localhost:8082/api/products | jq '.meta'
```

### Step 2 — Simulate canary traffic shift (5% → canary)

Traffic is controlled by `nginx/nginx.conf` locally (Istio VirtualService in Kubernetes).

```bash
./scripts/promote-canary.sh --step 5
```

Watch the Grafana dashboard at http://localhost:3000 — you'll see the canary
line appear with a small fraction of requests.

### Step 3 — Verify metrics gate (Prometheus)

```bash
# Check success rates
curl -s 'http://localhost:9090/api/v1/query?query=canary:http_success_rate:5m' \
  | jq '.data.result'

# Check latency comparison
curl -s 'http://localhost:9090/api/v1/query?query=canary:http_latency_p99:5m' \
  | jq '.data.result'
```

Both should show the canary is within thresholds — Argo Rollouts would
proceed to the next step automatically.

### Step 4 — Promote to 50%, then 100%

```bash
./scripts/promote-canary.sh --step 50
sleep 30
./scripts/promote-canary.sh --step 100
```

The new version is now serving all traffic. But the new features are still off.

### Step 5 — Business Release Decision (Release on Demand)

Open Unleash at http://localhost:4242 and log in.

Toggle these flags ON one at a time and call the API after each:

1. **`new-product-catalog`** → products jump from 4 to 7 items (no deploy!)
2. **`holiday-promotion`** → 20% discount appears on all products
3. **`ai-recommendations`** → recommendation rows appear in response

```bash
# After enabling new-product-catalog:
curl http://localhost:8082/api/products | jq '.products | length'
# → 7  (was 4)

# After enabling holiday-promotion:
curl http://localhost:8082/api/products | jq '.products[0] | {price, discount}'
# → {"price": 1039, "discount": 20}
```

### Step 6 — Emergency rollback (instant)

```bash
# Roll back traffic (nginx locally, Argo Rollouts abort in K8s)
./scripts/rollback.sh

# Roll back a feature flag (no deployment)
curl -X POST http://localhost:4242/api/admin/features/holiday-promotion/toggle/off \
  -H "Authorization: *:*.unleash-insecure-api-token"
```

---

## Project Structure

```
.
├── app/                        # Acme API — Node.js microservice
│   ├── src/
│   │   ├── index.js            # Entry point
│   │   ├── server.js           # Express setup + metrics middleware
│   │   ├── featureFlags.js     # Unleash SDK integration
│   │   ├── middleware/metrics.js  # Prometheus counters + histograms
│   │   └── routes/
│   │       ├── products.js     # /api/products — flag-gated responses
│   │       └── health.js       # /health /ready /metrics
│   ├── test/server.test.js
│   └── Dockerfile
│
├── k8s/                        # Kubernetes manifests
│   ├── base/                   # Kustomize base (service, sa, configmap)
│   ├── overlays/               # Production + staging overlays
│   ├── argo-rollouts/          # Rollout CR + AnalysisTemplates
│   │   ├── rollout.yaml        # ← Canary steps + Istio integration
│   │   ├── analysis-success-rate.yaml
│   │   └── analysis-latency.yaml
│   ├── istio/                  # Gateway + VirtualService + DestinationRule
│   ├── flagger/                # Alternative: Flagger Canary + MetricTemplate
│   ├── unleash/                # Unleash + PostgreSQL StatefulSet
│   └── monitoring/             # ServiceMonitor + PrometheusRule
│
├── gitops/
│   ├── argocd/                 # ArgoCD Project + Application + App-of-Apps
│   └── tekton/                 # Pipeline + Tasks + Triggers + RBAC
│
├── monitoring/
│   ├── prometheus/             # Config + recording/alerting rules
│   └── grafana/                # Dashboard JSON + provisioning
│
├── nginx/nginx.conf            # Local traffic splitter (simulates Istio)
├── docker-compose.yml          # Full local demo stack
└── scripts/
    ├── setup-local.sh          # One-command local startup
    ├── trigger-release.sh      # Business-triggered release (K8s)
    ├── promote-canary.sh       # Simulate canary promotion (local)
    └── rollback.sh             # Emergency rollback (local or K8s)
```

---

## Kubernetes Deployment

### Bootstrap the platform

```bash
# 1. Create namespaces and install controllers (see docs/runbook.md)

# 2. Create required secrets
kubectl create secret generic unleash-credentials \
  --from-literal=api-token="your-token" -n production

# 3. Bootstrap App-of-Apps
kubectl apply -f gitops/argocd/app-of-apps.yaml -n argocd

# 4. Watch ArgoCD converge
argocd app list
```

### Monitor a live canary

```bash
# Real-time rollout status
kubectl argo rollouts get rollout acme-api -n production --watch

# Promote when ready (after PAUSE step)
./scripts/trigger-release.sh --flag new-product-catalog
```

See [docs/runbook.md](docs/runbook.md) for full operational procedures.  
See [docs/architecture.md](docs/architecture.md) for component deep-dive.

---

## Tests

```bash
cd app
npm install
npm test
```

Tests mock Unleash and Prometheus so they run with no external dependencies.

---

## The Key Insight

```
Traditional:  deploy = release    (coupled, scary, big-bang)

Release on Demand:
  deploy ≠ release

  deploy  = code arrives in production (automatic, safe, gradual, metric-gated)
  release = users see the feature     (deliberate, business-timed, instant-reversible)
```