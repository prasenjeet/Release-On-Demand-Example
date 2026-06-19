# Troubleshooting

Common issues and how to fix them.

---

## Canary Issues

### Canary stuck in Paused state

**Symptom:** `kubectl argo rollouts get rollout acme-api` shows `Status: Paused`.

**If expected:** This is the business gate (`pause: {}` in rollout.yaml). Promote intentionally:
```bash
kubectl argo rollouts promote acme-api -n production
```

**If unexpected:** Check analysis results:
```bash
kubectl get analysisrun -n production
kubectl describe analysisrun <name> -n production
```

---

### Rollout auto-rolled back

**Symptom:** Canary promoted to 5% then rolled back with status `Degraded`.

**Check analysis failure reason:**
```bash
kubectl describe analysisrun <name> -n production | grep -A10 "Message:"
```

**Check Prometheus has data for canary service:**
```bash
curl -s 'http://localhost:9090/api/v1/query?query=http_requests_total{kubernetes_service_name="acme-api-canary"}'
```

If no data → the ServiceMonitor isn't scraping canary pods. Check:
```bash
kubectl get servicemonitor -n production
kubectl get endpoints acme-api-canary -n production
```

---

### Istio VirtualService not splitting traffic

**Symptom:** All traffic goes to stable even during canary.

**Check sidecar injection:**
```bash
kubectl get pods -n production -o jsonpath='{.items[*].spec.containers[*].name}' | tr ' ' '\n' | sort -u
# Should include 'istio-proxy'
```

**Check VirtualService weights:**
```bash
kubectl get virtualservice acme-api-vsvc -n production -o yaml | grep weight
```

**Check DestinationRule subsets:**
```bash
kubectl get destinationrule acme-api-destrule -n production -o yaml
```

**Check services exist:**
```bash
kubectl get svc acme-api-stable acme-api-canary -n production
```

---

## ArgoCD Issues

### App constantly out of sync

**Symptom:** ArgoCD shows `OutOfSync` immediately after syncing.

**Likely cause:** Missing `ignoreDifferences` for Istio VirtualService weights.

**Fix:** Ensure `app-acme-api.yaml` has:
```yaml
ignoredifferences:
  - group: networking.istio.io
    kind: VirtualService
    jsonPointers:
      - /spec/http/0/route/0/weight
      - /spec/http/0/route/1/weight
```

---

### ArgoCD not detecting gitops commit

**Check webhook delivery:** GitHub → repo settings → Webhooks → recent deliveries.

**Force a refresh:**
```bash
argocd app refresh acme-api-production --hard
```

**Check repo access:**
```bash
argocd repo list
argocd repo get https://github.com/org/release-on-demand-example.git
```

---

## Tekton Issues

### PipelineRun fails at `update-gitops` task

**Symptom:** `Permission denied` or `Authentication failed` when pushing to git.

**Check SSH secret:**
```bash
kubectl get secret git-ssh-credentials -n tekton-pipelines
kubectl describe secret git-ssh-credentials -n tekton-pipelines
```

**Test git access from a pod:**
```bash
kubectl run -it --rm git-test --image=alpine/git --restart=Never \
  -- git ls-remote https://github.com/org/repo.git
```

---

### Tekton EventListener not receiving webhooks

**Check EventListener is running:**
```bash
kubectl get eventlistener github-push -n tekton-pipelines
kubectl get svc el-github-push -n tekton-pipelines
```

**Check webhook secret matches:**
```bash
# The GitHub webhook secret must match:
kubectl get secret github-webhook-secret -n tekton-pipelines -o jsonpath='{.data.secret}' | base64 -d
```

---

## Unleash Issues

### Flags not evaluating (always OFF)

**Check app can reach Unleash:**
```bash
kubectl exec -it deploy/acme-api -n production -- \
  wget -qO- http://unleash.feature-flags.svc.cluster.local:4242/health
```

**Check token is correct:**
```bash
kubectl get secret unleash-credentials -n production -o jsonpath='{.data.api-token}' | base64 -d
# Should match an Unleash admin API token
```

**Verify flag is enabled (not just created):**
```bash
curl http://unleash:4242/api/client/features/new-product-catalog \
  -H "Authorization: $TOKEN" | jq '.enabled'
```

---

### Unleash DB connection error

```bash
# Check Postgres is healthy
kubectl get statefulset unleash-postgres -n feature-flags
kubectl exec -it unleash-postgres-0 -n feature-flags -- pg_isready -U unleash

# Check connection string
kubectl get secret unleash-db-url -n production \
  -o jsonpath='{.data.url}' | base64 -d
```

---

## Local Docker Compose Issues

### Unleash unhealthy / not starting

```bash
# Check postgres is ready first
docker compose ps unleash-db
docker compose logs unleash-db | tail -20

# Restart unleash after postgres is healthy
docker compose restart unleash
docker compose logs unleash -f
```

### Prometheus not scraping app

```bash
# Check targets at
curl http://localhost:9090/api/v1/targets | python3 -m json.tool | grep -A5 'acme-api'

# Verify app exposes metrics
curl http://localhost:8081/metrics | head -10
```

### Grafana shows no data

1. Open Grafana → **Configuration** → **Data Sources** → test Prometheus connection
2. If failing: check Prometheus is running (`curl http://localhost:9090/-/healthy`)
3. Change dashboard time range to `Last 5 minutes` — wait for a few metric scrapes
4. Run `./scripts/promote-canary.sh --step 20` to generate traffic

---

## Getting More Help

- [Argo Rollouts docs](https://argoproj.github.io/rollouts/)
- [ArgoCD docs](https://argo-cd.readthedocs.io/)
- [Istio troubleshooting](https://istio.io/latest/docs/ops/diagnostic-tools/)
- [Unleash docs](https://docs.getunleash.io/)
- [Flagger docs](https://docs.flagger.app/)
- Open an issue: [github.com/prasenjeet/release-on-demand-example/issues](https://github.com/prasenjeet/release-on-demand-example/issues)
