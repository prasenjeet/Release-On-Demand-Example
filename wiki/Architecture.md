# Architecture

## Overview

The platform is built in five independent layers. Each layer can fail, roll back, or be replaced without affecting the others.

```
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — Continuous Integration (Tekton)                           │
│                                                                      │
│  Git push → EventListener → PipelineRun                             │
│  Tasks: clone → npm test → kaniko build → push image → update gitops│
└───────────────────────────┬──────────────────────────────────────────┘
                            │  git commit: new image tag in kustomization.yaml
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 2 — GitOps Continuous Delivery (ArgoCD)                       │
│                                                                      │
│  Watches k8s/overlays/production/ every 3 min                       │
│  Detects drift (new image tag) → syncs Rollout to cluster           │
│  ignoreDifferences: Istio VirtualService weights                    │
│                     Rollout replica count                           │
└───────────────────────────┬──────────────────────────────────────────┘
                            │  New Rollout spec applied
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 3 — Progressive Delivery (Argo Rollouts + Istio)              │
│                                                                      │
│  Rollout creates canary pod set                                      │
│  Patches VirtualService: stable=95%, canary=5%                      │
│  pause 2m → AnalysisRun (Prometheus) → step 2 (20%) → ...          │
│  PAUSES at 50% — waits for human business trigger                   │
│  Failure → VirtualService back to 100% stable instantly             │
└───────────────────────────┬──────────────────────────────────────────┘
                            │  Prometheus scraped every 15s
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 4 — Metrics Gating (Prometheus + Grafana)                     │
│                                                                      │
│  AnalysisTemplate: success_rate ≥ 99%  (3 failures → rollback)      │
│  AnalysisTemplate: p99_latency < 500ms AND ≤ 1.2× stable p99       │
│  Recording rules pre-compute expensive queries every 30s            │
│  Grafana dashboard: live stable vs canary comparison                │
└───────────────────────────┬──────────────────────────────────────────┘
                            │  All analysis passed. Canary promoted to 100%.
                            │  CODE IS DEPLOYED. FEATURES STILL HIDDEN.
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 5 — Feature Release (Unleash)                     ← ROD HERE  │
│                                                                      │
│  PM logs into Unleash UI  →  toggles flag ON                        │
│  Users immediately see new feature                                   │
│  Zero deployment. Zero downtime. Instant rollback.                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### Tekton (CI)

- Triggered by GitHub webhook on push to `main`
- Runs: `git-clone` → `npm-test` → `kaniko` (image build) → `skopeo-copy` (tag latest) → `update-gitops-image-tag`
- The gitops update task runs `kustomize edit set image` and commits to the repo
- ArgoCD watches for this commit

**Key files:** `gitops/tekton/pipeline.yaml`, `gitops/tekton/tasks/`

### ArgoCD (CD)

- Polls `k8s/overlays/production/` every 3 minutes (or webhook-triggered)
- `ignoreDifferences` on VirtualService weights and Rollout replicas — Argo Rollouts owns those
- `selfHeal: true` reverts manual cluster changes
- App-of-Apps pattern bootstraps all child applications

**Key files:** `gitops/argocd/app-acme-api.yaml`, `gitops/argocd/app-of-apps.yaml`

### Argo Rollouts (Progressive Delivery)

- Replaces `Deployment` with `Rollout` CR
- Manages stable and canary `ReplicaSets`
- Patches Istio `VirtualService` weights at each step
- Runs `AnalysisRun` at configurable intervals
- Auto-promotes on success; auto-rolls back on analysis failure

**Key files:** `k8s/argo-rollouts/rollout.yaml`, `k8s/argo-rollouts/analysis-*.yaml`

### Istio (Traffic Control)

- `VirtualService` routes by weight between `stable` and `canary` subsets
- `DestinationRule` configures mTLS, connection pooling, outlier detection
- `Gateway` terminates TLS at the ingress
- Envoy sidecars injected automatically (namespace label: `istio-injection: enabled`)

**Key files:** `k8s/istio/`

### Flagger (Alternative to Argo Rollouts)

- Operates on standard `Deployment` (no CR change required)
- Auto-creates canary Deployment + Service
- Uses `MetricTemplate` for Prometheus queries
- `confirm-promotion` webhook enables business approval integration

**Key files:** `k8s/flagger/`

### Unleash (Feature Release)

- Self-hosted, backed by PostgreSQL
- SDK in app caches flags (in-memory); evaluation latency < 1ms
- Four flag patterns: release gate, targeted (userId), scheduled (campaign), gradual rollout (%)
- REST API for programmatic flag management

**Key files:** `k8s/unleash/`, `app/src/featureFlags.js`

### Prometheus + Grafana (Metrics Gating)

- `ServiceMonitor` configures Prometheus Operator scraping
- Recording rules pre-compute `canary:http_success_rate:5m` and `canary:http_latency_p99:5m`
- Grafana dashboard auto-provisioned on startup
- Alertmanager routes canary failures to Slack / PagerDuty

**Key files:** `k8s/monitoring/`, `monitoring/`

---

## Request Flow

```
User → Istio IngressGateway (:443)
     → VirtualService (routes 5% to canary pod)
     → Envoy sidecar (mTLS, distributed tracing)
     → acme-api pod (stable or canary)
     → Unleash SDK evaluates flags (cached, < 1ms)
     → Returns /api/products response
     → Response metrics observed in Prometheus histogram
     → AnalysisRun reads Prometheus (every 1m)
     → Promotes or rolls back
```

---

## Argo Rollouts vs Flagger

| | Argo Rollouts | Flagger |
|-|--------------|--------|
| **CR type** | `Rollout` (replaces Deployment) | `Canary` (wraps Deployment) |
| **Traffic** | Istio, Nginx, ALB, SMI | Istio, Linkerd, Contour, NGINX |
| **Analysis** | `AnalysisTemplate` + multiple providers | `MetricTemplate` |
| **Promotion** | `kubectl argo rollouts promote` | `confirm-promotion` webhook |
| **Dashboards** | Argo Rollouts UI | Grafana |
| **Best for** | Full Argo ecosystem users | Standard Deployments, simpler setup |

**Choose one** — `k8s/argo-rollouts/` OR `k8s/flagger/`. Not both.
