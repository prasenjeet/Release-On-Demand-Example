#!/usr/bin/env bash
# ── Business-Triggered Release ────────────────────────────────────────────────
# Promotes the Argo Rollouts canary AND optionally enables a feature flag.
# This script represents the "Business Trigger" step in Release on Demand.
#
# Usage:
#   ./scripts/trigger-release.sh                        # promote canary only
#   ./scripts/trigger-release.sh --flag new-product-catalog
#   ./scripts/trigger-release.sh --flag holiday-promotion --env production
#   ./scripts/trigger-release.sh --rollback
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

NAMESPACE="${NAMESPACE:-production}"
ROLLOUT_NAME="${ROLLOUT_NAME:-acme-api}"
UNLEASH_URL="${UNLEASH_URL:-http://localhost:4242}"
UNLEASH_TOKEN="${UNLEASH_TOKEN:-*:*.unleash-insecure-api-token}"
FLAG_NAME=""
ROLLBACK=false

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()    { echo -e "${GREEN}✓  $*${NC}"; }
info()   { echo -e "${BLUE}ℹ  $*${NC}"; }
error()  { echo -e "${RED}✗  $*${NC}" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case $1 in
    --flag)      FLAG_NAME="$2"; shift 2 ;;
    --namespace) NAMESPACE="$2"; shift 2 ;;
    --rollback)  ROLLBACK=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           Release on Demand — Business Trigger              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [[ "$ROLLBACK" == "true" ]]; then
  # ── Emergency Rollback ───────────────────────────────────────────────────
  info "Initiating emergency rollback of $ROLLOUT_NAME in $NAMESPACE..."
  kubectl argo rollouts abort "$ROLLOUT_NAME" -n "$NAMESPACE"
  kubectl argo rollouts undo "$ROLLOUT_NAME" -n "$NAMESPACE"
  log "Rollback initiated — stable version restored"
  info "Check status: kubectl argo rollouts get rollout $ROLLOUT_NAME -n $NAMESPACE --watch"
  exit 0
fi

# ── Check rollout status ──────────────────────────────────────────────────────
info "Checking canary status..."
STATUS=$(kubectl argo rollouts get rollout "$ROLLOUT_NAME" -n "$NAMESPACE" -o json \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(r['status']['phase'])" 2>/dev/null || echo "Unknown")

echo "  Rollout: $ROLLOUT_NAME"
echo "  Status:  $STATUS"
echo ""

if [[ "$STATUS" != "Paused" && "$STATUS" != "Healthy" ]]; then
  error "Rollout is not in a promotable state (current: $STATUS). Check the dashboard first."
fi

# ── Promote canary ────────────────────────────────────────────────────────────
info "Promoting canary to 100% traffic..."
kubectl argo rollouts promote "$ROLLOUT_NAME" -n "$NAMESPACE"
log "Canary promoted — Argo Rollouts is shifting traffic to 100%"

# ── Enable feature flag (optional) ───────────────────────────────────────────
if [[ -n "$FLAG_NAME" ]]; then
  echo ""
  info "Enabling feature flag: $FLAG_NAME via Unleash..."

  RESPONSE=$(curl -sf -X POST \
    "$UNLEASH_URL/api/admin/features/$FLAG_NAME/toggle/on" \
    -H "Authorization: $UNLEASH_TOKEN" \
    -H "Content-Type: application/json" \
    -w "\n%{http_code}" 2>/dev/null || echo "error")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)

  if [[ "$HTTP_CODE" == "200" ]] || [[ "$HTTP_CODE" == "201" ]]; then
    log "Feature flag '$FLAG_NAME' is now ENABLED"
    echo "  Users will see the new feature immediately — no deployment needed."
  else
    echo -e "${YELLOW}⚠  Could not enable flag via API (HTTP $HTTP_CODE)${NC}"
    echo "  Enable manually at: $UNLEASH_URL"
    echo "  Flag: $FLAG_NAME"
  fi
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║               Release Complete! ✓                           ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Canary promoted to 100%                                    ║"
[[ -n "$FLAG_NAME" ]] && \
echo "║  Feature flag '$FLAG_NAME' enabled                ║"
echo "║                                                              ║"
echo "║  Monitor:  kubectl argo rollouts get rollout $ROLLOUT_NAME  ║"
echo "║  Grafana:  http://localhost:3000  (dashboard: Rod)          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
