# CI/CD Pipeline

Two open-source tools handle the pipeline:
- **Tekton** — Continuous Integration (build, test, push)
- **ArgoCD** — Continuous Delivery (GitOps sync)

---

## Tekton — CI

### How it works

```
GitHub push to main
        │
        ▼
Tekton EventListener  (gitops/tekton/triggers/event-listener.yaml)
        │  validates HMAC signature, filters ref == refs/heads/main
        ▼
TriggerTemplate  →  creates PipelineRun
        │
        ▼
Pipeline: acme-api-ci  (gitops/tekton/pipeline.yaml)
  Task 1: git-clone      ← clones source
  Task 2: npm-test       ← npm ci && npm run test:ci
  Task 3: kaniko         ← builds Docker image (no Docker daemon needed)
  Task 4: skopeo-copy    ← retags SHA as :latest
  Task 5: update-gitops  ← kustomize edit set image → git commit → push
        │
        │  git commit to main: kustomization.yaml image tag updated
        ▼
   ArgoCD picks up the change
```

### Pipeline file

```yaml
# gitops/tekton/pipeline.yaml (excerpt)
steps:
  - clone        # git-clone ClusterTask
  - test         # npm-test Task (custom)
  - build-push   # kaniko ClusterTask — builds app/Dockerfile
  - tag-latest   # skopeo-copy — tags SHA as :latest
  - update-gitops  # custom Task — kustomize + git commit
```

### The GitOps update task

This is the key step that links CI to CD:

```bash
# gitops/tekton/tasks/task-update-gitops.yaml
kustomize edit set image "ghcr.io/org/acme-api:$IMAGE_TAG"
git add kustomization.yaml
git commit -m "ci: deploy ghcr.io/org/acme-api:$IMAGE_TAG"
git push origin HEAD
```

ArgoCD watches this file. When it changes, ArgoCD syncs — which triggers Argo Rollouts.

### Webhook trigger

```yaml
# gitops/tekton/triggers/event-listener.yaml
interceptors:
  - github:       # validates X-Hub-Signature-256
  - cel:          # filter: body.ref == 'refs/heads/main'
      overlays:
        - key: git_sha_short
          expression: "body.after.truncate(7)"
```

The 7-character SHA becomes the image tag (e.g. `a1b2c3d`).

### Installing Tekton

```bash
# Pipelines
kubectl apply -f https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml

# Triggers
kubectl apply -f https://storage.googleapis.com/tekton-releases/triggers/latest/release.yaml
kubectl apply -f https://storage.googleapis.com/tekton-releases/triggers/latest/interceptors.yaml

# Apply project tasks and pipeline
kubectl apply -f gitops/tekton/tasks/ -n tekton-pipelines
kubectl apply -f gitops/tekton/pipeline.yaml -n tekton-pipelines
kubectl apply -f gitops/tekton/triggers/ -n tekton-pipelines
kubectl apply -f gitops/tekton/rbac/ -n tekton-pipelines
```

### Required secrets

```bash
# GitHub webhook HMAC secret
kubectl create secret generic github-webhook-secret \
  --from-literal=secret="$GITHUB_WEBHOOK_SECRET" \
  -n tekton-pipelines

# GHCR push credentials
kubectl create secret docker-registry ghcr-push-credentials \
  --docker-server=ghcr.io \
  --docker-username=$GITHUB_USER \
  --docker-password=$GITHUB_TOKEN \
  -n tekton-pipelines

# SSH key for gitops commits
kubectl create secret generic git-ssh-credentials \
  --from-file=id_rsa=$HOME/.ssh/id_rsa \
  --from-file=known_hosts=$HOME/.ssh/known_hosts \
  -n tekton-pipelines
```

---

## ArgoCD — GitOps CD

### How it works

```
Tekton commits new image tag to git
          │
          ▼
ArgoCD detects drift (polls every 3m, or webhook)
          │
          ▼
ArgoCD syncs k8s/overlays/production/ to cluster
          │  applies Rollout spec with new image
          ▼
Argo Rollouts starts canary automatically
```

### Application manifest

```yaml
# gitops/argocd/app-acme-api.yaml
spec:
  source:
    path: k8s/overlays/production   # Kustomize overlay
  syncPolicy:
    automated:
      prune: true       # remove resources deleted from git
      selfHeal: true    # revert manual cluster changes
  ignoreDifferences:
    - group: networking.istio.io
      kind: VirtualService
      jsonPointers:
        - /spec/http/0/route/0/weight   # Argo Rollouts owns this
        - /spec/http/0/route/1/weight
    - group: argoproj.io
      kind: Rollout
      jsonPointers:
        - /spec/replicas                # HPA owns this
```

The `ignoreDifferences` is critical — without it, ArgoCD would constantly overwrite the canary weights that Argo Rollouts is managing.

### App-of-Apps bootstrap

```bash
# One command bootstraps the entire platform
kubectl apply -f gitops/argocd/app-of-apps.yaml -n argocd

# Watch convergence
kubectl get applications -n argocd --watch
```

### Installing ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Get admin password
kubectl get secret argocd-initial-admin-secret -n argocd \
  -o jsonpath="{.data.password}" | base64 -d

# Port-forward UI
kubectl port-forward svc/argocd-server -n argocd 8443:443
# Open https://localhost:8443
```

---

## GitHub Actions Alternative

The `.github/workflows/` directory contains GitHub Actions equivalents for environments where Tekton isn't practical:

- `ci.yml` — runs on every push: test + docker build
- `deploy.yml` — runs on `main`: build, push to GHCR, deploy message

For Kubernetes-native teams, Tekton is preferred (runs in-cluster, no SaaS dependency).
