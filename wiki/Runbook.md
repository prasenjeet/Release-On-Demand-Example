# Runbook

Operational procedures for the Release on Demand platform.

---

## Daily Operations

### Check canary status

```bash
# Kubernetes
kubectl argo rollouts get rollout acme-api -n production

# JSON output for scripting
kubectl argo rollouts get rollout acme-api -n production -o json \
  | jq '{phase: .status.phase, currentWeight: .status.currentPodHash}'

# All rollouts across namespaces
kubectl get rollouts -A
```

### Check ArgoCD sync status

```bash
argocd app get acme-api-production
argocd app list

# Force sync
argocd app sync acme-api-production
```

### Check active analysis runs

```bash
kubectl get analysisrun -n production
kubectl describe analysisrun <name> -n production | grep -A5 "Metrics:"
```

### Check Tekton pipeline runs

```bash
kubectl get pipelineruns -n tekton-pipelines --sort-by=.metadata.creationTimestamp | tail -5
kubectl describe pipelinerun <name> -n tekton-pipelines | grep -E "(Status|Reason)"

# Tail logs of a running pipeline
tkn pipelinerun logs <name> -n tekton-pipelines -f
```

---

## Promote Canary

```bash
# Check it's in a promotable state (Paused)
kubectl argo rollouts get rollout acme-api -n production | grep -E "(Status|Step)"

# Promote to next step only
kubectl argo rollouts promote acme-api -n production

# Promote directly to 100% (skip remaining steps)
kubectl argo rollouts promote acme-api -n production --full

# With feature flag enable
./scripts/trigger-release.sh --flag new-product-catalog
```

---

## Emergency Rollback

### Rollback canary (Kubernetes)

```bash
# Abort analysis and roll back
kubectl argo rollouts abort acme-api -n production
kubectl argo rollouts undo acme-api -n production

# Verify recovery
kubectl argo rollouts get rollout acme-api -n production --watch
```

### Rollback a feature flag

```bash
# Via API
curl -X POST http://unleash:4242/api/admin/features/new-product-catalog/toggle/off \
  -H "Authorization: $UNLEASH_TOKEN"

# Via UI: http://unleash:4242 → find flag → toggle OFF

# Verify
curl -s http://api.acme.example.com/api/products | jq '.meta.features'
```

### Rollback locally

```bash
./scripts/rollback.sh          # resets nginx to 100% stable
```

---

## Feature Flag Management

### List all flags

```bash
curl -s http://unleash:4242/api/client/features \
  -H "Authorization: $UNLEASH_TOKEN" | jq '.features[] | {name, enabled}'
```

### Create a new flag

```bash
curl -X POST http://unleash:4242/api/admin/features \
  -H "Authorization: $UNLEASH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-feature",
    "type": "release",
    "description": "What this enables",
    "strategies": [{"name": "default", "parameters": {}}]
  }'
```

### Add gradual rollout

```bash
curl -X POST http://unleash:4242/api/admin/features/my-feature/strategies \
  -H "Authorization: $UNLEASH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "gradualRolloutSessionId", "parameters": {"percentage": "25", "groupId": "my-feature"}}'
```

---

## Kubernetes Bootstrap

### Install all controllers

```bash
# 1. Istio
curl -L https://istio.io/downloadIstio | sh -
istioctl install --set profile=default -y

# 2. Prometheus Operator
helm upgrade -i kube-prometheus-stack \
  prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace

# 3. ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# 4. Argo Rollouts
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts \
  -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml
kubectl apply -n argo-rollouts \
  -f https://github.com/argoproj/argo-rollouts/releases/latest/download/dashboard-install.yaml

# 5. Tekton
kubectl apply -f https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml
kubectl apply -f https://storage.googleapis.com/tekton-releases/triggers/latest/release.yaml
```

### Create required secrets

```bash
NAMESPACE=production

# Unleash API token
kubectl create secret generic unleash-credentials \
  --from-literal=api-token="*:*.your-token" -n $NAMESPACE

# Unleash DB URL
kubectl create secret generic unleash-db-url \
  --from-literal=url="postgresql://unleash:pass@unleash-postgres.feature-flags:5432/unleash" \
  -n $NAMESPACE

# GHCR push credentials
kubectl create secret docker-registry ghcr-push-credentials \
  --docker-server=ghcr.io \
  --docker-username=$GITHUB_USER \
  --docker-password=$GITHUB_TOKEN \
  -n tekton-pipelines

# GitHub webhook secret
kubectl create secret generic github-webhook-secret \
  --from-literal=secret="$GITHUB_WEBHOOK_SECRET" -n tekton-pipelines
```

### Bootstrap platform (App-of-Apps)

```bash
kubectl apply -f gitops/argocd/app-of-apps.yaml -n argocd
kubectl get applications -n argocd --watch
```

---

## Monitoring Health Checks

```bash
# Prometheus targets
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health}'

# Check active alerts
curl -s http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | {alertname: .labels.alertname, state}'

# Grafana health
curl http://localhost:3000/api/health
```
