# Release Workflow

End-to-end walkthrough of a Release on Demand cycle — from code merge to business-triggered feature release.

---

## Phase 1: Code Merge → CI

```
Engineer merges PR to main
        │
        ▼
GitHub webhook fires
        │
        ▼
Tekton EventListener receives push event
        │  validates HMAC signature
        │  filters: ref == 'refs/heads/main'
        ▼
Tekton PipelineRun created
```

**Timeline:** < 30 seconds from merge to PipelineRun start

**Tasks in order:**
1. `git-clone` — fetch source code
2. `npm-test` — `npm ci && npm run test:ci`
3. `kaniko` — build Docker image `ghcr.io/org/acme-api:<sha>`
4. `skopeo-copy` — tag as `:latest`
5. `update-gitops` — `kustomize edit set image` + git commit to main

**Exit criteria:** Green pipeline + new image tag committed to `k8s/overlays/production/kustomization.yaml`

---

## Phase 2: GitOps Sync → Cluster

```
ArgoCD detects kustomization.yaml change (within 3 min)
        │
        ▼
ArgoCD diffs: current Rollout image ≠ desired image
        │
        ▼
ArgoCD syncs Rollout to cluster (server-side apply)
        │
        ▼
Argo Rollouts detects Rollout spec change
        │  creates canary ReplicaSet with new image
        ▼
Canary pods start, readiness probe succeeds
```

**Timeline:** 3–5 minutes from gitops commit to canary pods running

**Monitor:**
```bash
kubectl argo rollouts get rollout acme-api -n production --watch
```

---

## Phase 3: Canary Progression

### Step 1 — 5% canary

```
Argo Rollouts patches VirtualService: stable=95%, canary=5%
Pauses 2 minutes
Launches AnalysisRun
```

Analysis runs every 1 minute. Checks:
- `canary:http_success_rate:5m ≥ 0.99`
- `canary:http_latency_p99:5m < 0.5`
- `canary_p99 / stable_p99 ≤ 1.2`

**If analysis fails 3× consecutively** → automatic rollback (VirtualService reset to 100% stable, canary pods terminated).

### Step 2 — 20% canary

```
Weight updated: stable=80%, canary=20%
Pauses 5 minutes
Analysis continues
```

### Step 3 — 50% canary

```
Weight updated: stable=50%, canary=50%
Pauses 10 minutes
Analysis continues
```

### Step 4 — Business Gate (PAUSE)

```
Argo Rollouts enters indefinite PAUSE state
All analysis is passing
Code is deployed — awaiting business decision
```

**At this point:**
- 50% of traffic is on the new version
- Features are still hidden behind Unleash flags
- Engineering's job is done
- Release Manager is notified (Slack / ArgoCD notification)

**Timeline:** Steps 1–3 take ~20 minutes. The pause can be hours or days.

---

## Phase 4: Business Release Decision

This is **Release on Demand**. A non-engineer makes the decision.

### Option A: Promote via script

```bash
# Promote canary + enable a feature flag
./scripts/trigger-release.sh --flag new-product-catalog
```

### Option B: Promote via kubectl

```bash
kubectl argo rollouts promote acme-api -n production
```

### Option C: Promote via ArgoCD UI

1. Open ArgoCD → Applications → `acme-api-production`
2. Click **Sync** → the Rollout auto-promotes

### Option D: Enable feature flag only (without full promotion)

If the business wants to release the feature to a subset before 100% promotion:

1. Open Unleash at http://unleash:4242
2. Toggle `new-product-catalog` ON with a `userWithId` strategy targeting specific users
3. Only those users see the feature, while canary is still at 50%

---

## Phase 5: Full Promotion

```
Promotion triggered
        │
        ▼
Argo Rollouts sets weight: stable=0%, canary=100%
        │
        ▼
Old stable ReplicaSet scaled down (graceful termination)
        │
        ▼
New version IS stable — rollout complete
```

**Timeline:** < 2 minutes after promotion trigger

---

## Phase 6: Feature Release

Now that new code runs at 100%, features can be gradually released:

```
Release Manager opens Unleash UI
        │
        ▼
Toggles 'new-product-catalog' ON
        │  all users immediately see 7 products
        ▼
Monitors success metrics for 24h
        │
        ▼
Toggles 'ai-recommendations' ON for beta users
        │  targeted rollout, not everyone
        ▼
(1 week later) Expands to 100% users
        ▼
Flag removed from code in next sprint
```

---

## Emergency Scenarios

### Rollback during canary

```bash
# Argo Rollouts: abort + undo
kubectl argo rollouts abort acme-api -n production
kubectl argo rollouts undo acme-api -n production
# → VirtualService instantly back to 100% stable
```

### Rollback a feature flag (no deployment needed)

```bash
curl -X POST http://unleash:4242/api/admin/features/holiday-promotion/toggle/off \
  -H 'Authorization: $TOKEN'
# → Feature removed from all users instantly
```

### Full timeline summary

| Phase | Duration | Actor |
|-------|----------|-------|
| Code merge → CI complete | ~5 min | Automated (Tekton) |
| GitOps sync | ~3 min | Automated (ArgoCD) |
| Canary 5% → 50% (with analysis) | ~20 min | Automated (Argo Rollouts) |
| Business gate (pause) | Hours to days | **Human decision** |
| Promotion to 100% | ~2 min | Release Manager |
| Feature flag release | Instant | **Business decision** |
| Flag rollback (if needed) | Instant | Anyone |
