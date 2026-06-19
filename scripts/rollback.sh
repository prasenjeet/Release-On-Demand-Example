#!/usr/bin/env bash
# ── Emergency Rollback ─────────────────────────────────────────────────────────
# Immediately rolls back the canary (locally: resets nginx to 100% stable).
# In Kubernetes: aborts and reverts the Argo Rollout.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-local}"    # local | k8s

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
log()  { echo -e "${GREEN}✓  $*${NC}"; }
error(){ echo -e "${RED}✗  $*${NC}"; }

echo ""
echo "⚠️  ROLLBACK INITIATED"
echo ""

if [[ "$MODE" == "k8s" ]]; then
  NAMESPACE="${NAMESPACE:-production}"
  ROLLOUT="${ROLLOUT:-acme-api}"
  echo "  Aborting Argo Rollout: $ROLLOUT in $NAMESPACE"
  kubectl argo rollouts abort "$ROLLOUT" -n "$NAMESPACE"
  kubectl argo rollouts undo "$ROLLOUT" -n "$NAMESPACE"
  log "Kubernetes rollback complete — stable version restored"
else
  # Local: set nginx to 100% stable
  NGINX_CONF="$ROOT/nginx/nginx.conf"
  sed -i.bak "s/[0-9]*%   \"stable\";/100%   \"stable\";/" "$NGINX_CONF"
  sed -i.bak "s/[0-9]*%   \"canary\";/0%     \"canary\";/" "$NGINX_CONF"

  docker compose exec nginx nginx -s reload 2>/dev/null && \
    log "Nginx reloaded — 100% traffic restored to stable" || \
    error "Could not reload nginx (is docker compose up?)"
fi

echo ""
log "Rollback complete. All traffic is now on stable version."
echo ""
