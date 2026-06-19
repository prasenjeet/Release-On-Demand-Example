# Runbook — Release on Demand Operations

## Day-to-Day Operations

### Trigger a new deployment

Push to `main`. Tekton detects the webhook, builds the image, updates `kustomization.yaml`. ArgoCD syncs within 3 minutes. Argo Rollouts starts the canary automatically.

### Check canary status

```bash
# Kubernetes
kubectl argo rollouts get rollout acme-api -n production --watch

# Local
curl http://localhost:8081/health   # stable
curl http://localhost:8082/health   # canary
```

### Promote canary to production

```bash
# Kubernetes (after all analysis steps pass and rollout is Paused)
kubectl argo rollouts promote acme-api -n production

# Or use the trigger script (also enables a feature flag)
./scripts/trigger-release.sh --flag new-product-catalog

# Local docker compose
./scripts/promote-canary.sh --step 100
```

### Emergency rollback

```bash
# Kubernetes — instant (Istio shifts 100% back to stable)
kubectl argo rollouts abort acme-api -n production
kubectl argo rollouts undo acme-api -n production

# Or with script
./scripts/rollback.sh k8s

# Local
./scripts/rollback.sh
```

### Rollback a feature flag (without rollback)

```bash
# Via Unleash API
curl -X POST http://unleash:4242/api/admin/features/new-product-catalog/toggle/off \
  -H "Authorization: $UNLEASH_TOKEN"

# Or toggle in the Unleash UI at http://localhost:4242
```

---

## Canary Analysis

### What triggers automatic rollback?

Both of these AnalysisTemplates run during each canary step:

1. **`canary-success-rate`**: canary HTTP success rate drops below 99% for 3+ checks
2. **`canary-latency-p99`**: canary P99 > 500ms OR canary P99 > 1.2× stable P99

### Query current success rate

```bash
# Prometheus (Kubernetes)
kubectl port-forward svc/prometheus-operated 9090 -n monitoring &
curl 'http://localhost:9090/api/v1/query?query=canary:http_success_rate:5m'

# Local
curl 'http://localhost:9090/api/v1/query?query=canary:http_success_rate:5m{role="canary"}'
```

### Check if analysis is failing

```bash
kubectl get analysisrun -n production
kubectl describe analysisrun <name> -n production
```

---

## Feature Flags

### Create a new flag (Unleash API)

```bash
curl -X POST http://unleash:4242/api/admin/features \
  -H "Authorization: $UNLEASH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-new-feature",
    "type": "release",
    "description": "Description of what this enables",
    "strategies": [{"name": "default", "parameters": {}}]
  }'
```

### Enable for specific users only

```bash
# Enable for beta users by userId
curl -X POST http://unleash:4242/api/admin/features/my-new-feature/strategies \
  -H "Authorization: $UNLEASH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "userWithId",
    "parameters": { "userIds": "user-123,user-456" }
  }'
```

### Gradual rollout (percentage)

```bash
curl -X POST http://unleash:4242/api/admin/features/my-new-feature/strategies \
  -H "Authorization: $UNLEASH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "gradualRolloutSessionId",
    "parameters": { "percentage": "25", "groupId": "my-new-feature" }
  }'
```

---

## Infrastructure Setup (Kubernetes)

### Prerequisites

```bash
# Install controllers
kubectl apply -k https://github.com/argoproj/argo-cd/manifests/crds
kubectl apply -k https://github.com/argoproj/argo-rollouts/manifests/crds

# Install Istio
istioctl install --set profile=default

# Install Flagger (if using instead of Argo Rollouts)
kubectl apply -f https://raw.githubusercontent.com/fluxcd/flagger/main/artifacts/flagger/crd.yaml
helm upgrade -i flagger flagger/flagger \
  --namespace=istio-system \
  --set crd.create=false \
  --set meshProvider=istio \
  --set metricsServer=http://prometheus-operated.monitoring:9090

# Install Prometheus Operator
helm upgrade -i kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace

# Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Install Tekton
kubectl apply -f https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml
kubectl apply -f https://storage.googleapis.com/tekton-releases/triggers/latest/release.yaml
```

### Bootstrap the platform (App-of-Apps)

```bash
# Apply the root ArgoCD application — it creates all child apps
kubectl apply -f gitops/argocd/app-of-apps.yaml -n argocd

# Watch convergence
kubectl get applications -n argocd --watch
```

### Create secrets (Kubernetes)

```bash
# Unleash credentials
kubectl create secret generic unleash-credentials \
  --from-literal=api-token="*:*.unleash-insecure-api-token" \
  -n production

# Unleash DB URL
kubectl create secret generic unleash-db-url \
  --from-literal=url="postgresql://unleash:changeme@unleash-postgres.feature-flags:5432/unleash" \
  -n production

# GitHub container registry credentials
kubectl create secret docker-registry ghcr-push-credentials \
  --docker-server=ghcr.io \
  --docker-username=$GITHUB_USER \
  --docker-password=$GITHUB_TOKEN \
  -n tekton-pipelines

# GitHub webhook secret
kubectl create secret generic github-webhook-secret \
  --from-literal=secret="$GITHUB_WEBHOOK_SECRET" \
  -n tekton-pipelines

# Git SSH credentials for gitops commits
kubectl create secret generic git-ssh-credentials \
  --from-file=id_rsa=$HOME/.ssh/id_rsa \
  --from-file=known_hosts=$HOME/.ssh/known_hosts \
  -n tekton-pipelines
```
