# Release on Demand — Wiki

Welcome to the **Release on Demand** sample project wiki. This project demonstrates how to completely decouple *deployment* from *release* using open-source Kubernetes-native tooling.

---

## Core Principle

```
Traditional:         deploy = release   (one scary big-bang event)

Release on Demand:   deploy ≠ release

  deploy  → code arrives in production  (continuous, automated, metric-gated)
  release → users see the feature       (deliberate, business-timed, instant-reversible)
```

---

## The Full Pipeline

```
 Code Merge
     │
     ▼
 Tekton Pipelines          ← CI: test → build → push image → update gitops
     │
     ▼
 ArgoCD                    ← CD: GitOps sync (detects image tag change)
     │
     ▼
 Argo Rollouts             ← Canary: 5% → 20% → 50% → PAUSE → 100%
     │
     ▼
 Istio / Flagger           ← Traffic control: weight-based routing, mTLS
     │
     ▼
 Prometheus + Grafana      ← Metrics gating: success rate ≥ 99%, P99 < 500ms
     │
     ▼  (code is deployed, features still hidden)
 Unleash Feature Flags     ← Business releases features deliberately  ← ROD
```

---

## Wiki Pages

| Page | Description |
|------|-------------|
| [Architecture](Architecture) | Full stack design, component responsibilities, data flow |
| [Getting Started](Getting-Started) | Run the local demo in 5 minutes |
| [CI/CD Pipeline](CI-CD-Pipeline) | Tekton + ArgoCD — from git push to cluster |
| [Canary Deployments](Canary-Deployments) | Argo Rollouts + Istio + Flagger |
| [Feature Flags](Feature-Flags) | Unleash — patterns, SDK, flag management |
| [Metrics & Monitoring](Metrics-and-Monitoring) | Prometheus rules + Grafana dashboards |
| [Release Workflow](Release-Workflow) | End-to-end step-by-step release process |
| [Runbook](Runbook) | Day-to-day operational procedures |
| [Troubleshooting](Troubleshooting) | Common issues and fixes |

---

## Open-Source Tools

| Tool | Role | License |
|------|------|---------|
| [Tekton](https://tekton.dev) | CI pipelines | Apache 2.0 |
| [ArgoCD](https://argo-cd.readthedocs.io) | GitOps CD | Apache 2.0 |
| [Argo Rollouts](https://argoproj.github.io/rollouts) | Progressive delivery | Apache 2.0 |
| [Istio](https://istio.io) | Service mesh, traffic splitting | Apache 2.0 |
| [Flagger](https://flagger.app) | Progressive delivery (alternative) | Apache 2.0 |
| [Unleash](https://unleash.io) | Self-hosted feature flags | Apache 2.0 |
| [Prometheus](https://prometheus.io) | Metrics + canary analysis | Apache 2.0 |
| [Grafana](https://grafana.com) | Dashboards | AGPL 3.0 |

---

## Quick Links

- **Run locally:** `./scripts/setup-local.sh`
- **Unleash UI:** http://localhost:4242 (admin / unleash4all)
- **Grafana:** http://localhost:3000 (admin / admin)
- **API:** http://localhost:8080/api/products
