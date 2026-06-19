#!/usr/bin/env bash
# ── Simulate canary promotion locally (without Kubernetes) ───────────────────
# Updates nginx.conf weights to shift traffic between stable and canary.
# Runs a load generator so you can watch Grafana metrics change.
#
# Usage: ./scripts/promote-canary.sh [--step N]
#   N: canary percentage to set (5, 20, 50, 100)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STEP="${2:-20}"
NGINX_CONF="$ROOT/nginx/nginx.conf"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}✓  $*${NC}"; }
info() { echo -e "${BLUE}ℹ  $*${NC}"; }

STABLE=$((100 - STEP))

info "Shifting traffic: Stable=${STABLE}%  Canary=${STEP}%"

# Update nginx.conf weights
sed -i.bak \
  "s/^\(    [0-9]*%\)   \"stable\";/    ${STABLE}%   \"stable\";/" \
  "$NGINX_CONF"
sed -i.bak \
  "s/^\(    \*\)     \"canary\";/    *     \"canary\";/" \
  "$NGINX_CONF"

# Also update the comment showing current weight
sed -i.bak \
  "s/stable=[0-9]*, canary=[0-9]*/stable=${STABLE}, canary=${STEP}/" \
  "$NGINX_CONF"

# Reload nginx (no downtime)
docker compose exec nginx nginx -s reload 2>/dev/null && \
  log "Nginx reloaded — traffic is now ${STABLE}% stable / ${STEP}% canary" || \
  info "Start docker compose first: docker compose up -d"

echo ""
info "Running quick load test to generate Grafana metrics..."
if command -v hey >/dev/null 2>&1; then
  hey -z 30s -q 20 -c 4 http://localhost:8080/api/products &
  log "Load test running for 30s — check Grafana at http://localhost:3000"
else
  info "Install 'hey' for load testing: brew install hey / go install github.com/rakyll/hey@latest"
  info "Or run: for i in \$(seq 50); do curl -s http://localhost:8080/api/products; done"
fi

echo ""
log "Traffic split updated to Stable=${STABLE}% / Canary=${STEP}%"
info "Next steps:"
echo "  • Watch Grafana: http://localhost:3000"
echo "  • Promote to 100%: $0 --step 100"
echo "  • Enable feature flag: http://localhost:4242"
