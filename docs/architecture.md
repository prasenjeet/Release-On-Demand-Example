# Architecture — Release on Demand Platform

## Overview

This project implements Release on Demand using a layered approach where
**deployment** and **release** are completely independent operations.

```
Developer pushes code
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 1: Continuous Integration (Tekton)                               │
│                                                                          │
│  GitHub Webhook  →  Tekton EventListener  →  PipelineRun               │
│     clone  →  npm test  →  kaniko build  →  push image  →  update gitops│
└──────────────────────────┬──────────────────────────────────────────────┘
                           │  Git commit: kustomization.yaml tag updated
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 2: Continuous Delivery — GitOps (ArgoCD)                         │
│                                                                          │
│  ArgoCD watches k8s/overlays/production/                                 │
│  Detects drift (new image tag)  →  Syncs to cluster                     │
│  Creates/updates Argo Rollout CR                                         │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │  New Rollout spec applied
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 3: Progressive Delivery (Argo Rollouts + Istio OR Flagger)        │
│                                                                          │
│  Argo Rollouts:                                                          │
│    Creates canary pod set                                                │
│    Patches Istio VirtualService: stable=95%, canary=5%                  │
│    Waits 2m  →  Runs AnalysisRun (Prometheus queries)                   │
│    Passes?  →  stable=80%, canary=20%  →  analysis  →  ...             │
│    Passes?  →  PAUSE (waits for human/business trigger)                  │
│    Triggered?  →  stable=0%, canary=100%  →  promote                    │
│    Fails?   →  Auto rollback (Istio weight → 100% stable)               │
│                                                                          │
│  Istio/Envoy sidecars handle the actual packet routing.                  │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │  Prometheus metrics evaluated at each step
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 4: Metrics Gating (Prometheus + Grafana)                          │
│                                                                          │
│  AnalysisTemplate queries:                                               │
│    success_rate = http_requests_total{5xx}/total  ≥ 99%                 │
│    latency_p99  = histogram_quantile(0.99, ...)   < 500ms               │
│    latency_vs_stable = canary_p99 / stable_p99    ≤ 1.2x               │
│                                                                          │
│  Grafana dashboard shows real-time canary vs stable comparison.          │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │  Canary promoted but features still hidden
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 5: Feature Release (Unleash)                           ← ROD HERE │
│                                                                          │
│  Code is now serving 100% of traffic (new version deployed).             │
│  Features are STILL HIDDEN behind feature flags.                         │
│                                                                          │
│  Business Decision (PM / Release Manager):                               │
│    1. Log into Unleash at http://unleash:4242                           │
│    2. Toggle "new-product-catalog" → ON                                 │
│    3. Users immediately see the new extended catalog                     │
│    4. Toggle "holiday-promotion" → ON  (start a sale campaign)          │
│    5. Toggle "ai-recommendations" → ON for beta users only              │
│                                                                          │
│  Zero deployment. Zero developer involvement. Instant rollback.          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | Open-source |
|-----------|---------------|-------------|
| **Tekton** | CI: test, build image, update gitops | ✅ Apache 2.0 |
| **ArgoCD** | CD: GitOps sync, cluster reconciliation | ✅ Apache 2.0 |
| **Argo Rollouts** | Progressive delivery: canary steps | ✅ Apache 2.0 |
| **Istio** | Traffic routing: weight-based splitting | ✅ Apache 2.0 |
| **Flagger** | Alternative progressive delivery operator | ✅ Apache 2.0 |
| **Unleash** | Feature flag management + UI | ✅ Apache 2.0 |
| **Prometheus** | Metrics collection + canary analysis queries | ✅ Apache 2.0 |
| **Grafana** | Dashboards: canary comparison + SLO | ✅ AGPL 3.0 |

## Argo Rollouts vs Flagger

Both `k8s/argo-rollouts/` and `k8s/flagger/` are provided. Choose one.

| | Argo Rollouts | Flagger |
|-|--------------|---------|
| **Works with** | Rollout CR (replaces Deployment) | Standard Deployment |
| **Traffic splitting** | Istio, Nginx, Traefik, AWS ALB | Istio, Linkerd, Contour, NGINX |
| **Analysis** | AnalysisTemplate (Prometheus, Datadog, etc.) | MetricTemplate (Prometheus, Datadog, etc.) |
| **Manual promotion** | `kubectl argo rollouts promote` | Confirm-promotion webhook |
| **Blue/Green** | ✅ | ✅ |
| **Canary** | ✅ | ✅ |
| **Dashboard** | Argo Rollouts Dashboard | Flagger Grafana dashboard |
| **Best for** | Teams already using Argo ecosystem | Simpler setup, GitOps-friendly |

## Feature Flag Patterns

| Flag | Pattern | Who triggers |
|------|---------|-------------|
| `new-product-catalog` | Release gate | PM / Release Manager |
| `ai-recommendations` | Targeted (userId list) | Product team |
| `holiday-promotion` | Scheduled / campaign | Marketing team |
| `express-checkout` | Gradual rollout (20% sessions) | Engineering |

## Data Flow: A Single Request

```
User browser  →  Istio Ingress Gateway (:443)
               →  VirtualService (routes 5% to canary)
               →  Envoy sidecar (mTLS, tracing)
               →  acme-api pod (stable or canary)
               →  Unleash SDK evaluates flags (cached, <1ms)
               →  Returns products based on flag state
               →  Response + Prometheus histogram observation
               →  AnalysisRun reads Prometheus (every 1m)
               →  Promotes or rolls back canary
```
