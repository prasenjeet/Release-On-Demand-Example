# Canary Deployments

Two options are provided — choose one:

| | **Argo Rollouts** | **Flagger** |
|-|------------------|------------|
| File | `k8s/argo-rollouts/rollout.yaml` | `k8s/flagger/canary.yaml` |
| Requires | `Rollout` CR (not `Deployment`) | Standard `Deployment` |
| Best for | Full Argo ecosystem | Simpler GitOps setup |

---

## Option A: Argo Rollouts

### Canary steps

```yaml
# k8s/argo-rollouts/rollout.yaml
strategy:
  canary:
    stableService: acme-api-stable
    canaryService: acme-api-canary
    trafficRouting:
      istio:
        virtualService:
          name: acme-api-vsvc
          routes: [primary]
        destinationRule:
          name: acme-api-destrule
    steps:
      - setWeight: 5
      - pause: {duration: 2m}
      - analysis:          # ← Prometheus gates here
          templates:
            - templateName: canary-success-rate
            - templateName: canary-latency-p99
      - setWeight: 20
      - pause: {duration: 5m}
      - analysis: ...      # ← Prometheus gates again
      - setWeight: 50
      - pause: {duration: 10m}
      - analysis: ...
      - pause: {}          # ← BUSINESS GATE: wait for human approval
      - setWeight: 100
    autoPromotionEnabled: false
```

### The business gate (pause: {})

The `pause: {}` with no duration is an **indefinite pause**. Argo Rollouts waits until a human promotes it:

```bash
# Check current status
kubectl argo rollouts get rollout acme-api -n production

# Promote when business approves
kubectl argo rollouts promote acme-api -n production

# Or use the trigger script (promotes + enables a flag)
./scripts/trigger-release.sh --flag new-product-catalog
```

### Analysis templates

**Success Rate Gate** (`k8s/argo-rollouts/analysis-success-rate.yaml`):
```yaml
metrics:
  - name: success-rate
    interval: 1m
    successCondition: result[0] >= 0.99   # ≥ 99% required
    failureLimit: 3                        # 3 failures → auto rollback
    provider:
      prometheus:
        query: |
          sum(rate(http_requests_total{
            kubernetes_service_name="{{args.canary-service}}",
            status_code!~"5.."
          }[5m]))
          / sum(rate(http_requests_total{...}[5m]))
```

**Latency Gate** (`k8s/argo-rollouts/analysis-latency.yaml`):
```yaml
metrics:
  - name: latency-p99-absolute
    successCondition: result[0] < 0.5    # < 500ms required
  - name: latency-p99-vs-stable
    successCondition: result[0] <= 1.2   # ≤ 1.2× stable required
```

### Installing Argo Rollouts

```bash
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts \
  -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml

# Kubectl plugin
brew install argoproj/tap/kubectl-argo-rollouts

# Dashboard
kubectl argo rollouts dashboard -n production
# → http://localhost:3100
```

---

## Option B: Flagger

Flagger operates on standard `Deployment` objects — no CR changes needed.

```yaml
# k8s/flagger/canary.yaml
spec:
  targetRef:
    kind: Deployment
    name: acme-api
  analysis:
    interval: 1m
    threshold: 5          # max 5 failed checks
    maxWeight: 50         # cap at 50% before promotion
    stepWeight: 10        # increase by 10% per step
    metrics:
      - name: request-success-rate
        thresholdRange:
          min: 99
      - name: request-duration
        thresholdRange:
          max: 500
    webhooks:
      - name: business-approval
        type: confirm-promotion     # calls external URL before promotion
        url: http://release-bot.internal/api/approve
        timeout: 24h
```

The `confirm-promotion` webhook is Flagger's equivalent of Argo Rollouts' `pause: {}`. It calls your approval system (Slack bot, PagerDuty, custom webhook) before promoting.

### Installing Flagger

```bash
helm repo add flagger https://flagger.app
helm upgrade -i flagger flagger/flagger \
  --namespace=istio-system \
  --set meshProvider=istio \
  --set metricsServer=http://prometheus-operated.monitoring:9090

# Load tester (generates traffic during analysis)
helm upgrade -i flagger-loadtester flagger/loadtester \
  --namespace=flagger-system
```

---

## Istio Traffic Control

Both options use Istio for actual packet routing.

### VirtualService

```yaml
# k8s/istio/virtual-service.yaml
http:
  - name: primary          # Argo Rollouts patches these weights
    route:
      - destination:
          host: acme-api-stable
          subset: stable
        weight: 95         # ← patched to decreasing values
      - destination:
          host: acme-api-canary
          subset: canary
        weight: 5          # ← patched to increasing values
```

### DestinationRule

```yaml
# k8s/istio/destination-rule.yaml
trafficPolicy:
  tls:
    mode: ISTIO_MUTUAL    # mTLS between all services
  outlierDetection:
    consecutive5xxErrors: 5
    baseEjectionTime: 30s
subsets:
  - name: stable
    labels: {app: acme-api}
  - name: canary
    labels: {app: acme-api}
```

### Installing Istio

```bash
# Download istioctl
curl -L https://istio.io/downloadIstio | sh -

# Install with default profile
istioctl install --set profile=default -y

# Enable sidecar injection for namespaces
kubectl label namespace production istio-injection=enabled
kubectl label namespace staging istio-injection=enabled
```

---

## Blue/Green Alternative

Argo Rollouts also supports Blue/Green:

```yaml
strategy:
  blueGreen:
    activeService: acme-api-active
    previewService: acme-api-preview
    autoPromotionEnabled: false    # wait for human approval
    prePromotionAnalysis:
      templates:
        - templateName: canary-success-rate
```

Blue/Green is simpler (no traffic splitting) but wastes resources (full duplicate environment). Canary is preferred for cost efficiency and gradual risk reduction.
