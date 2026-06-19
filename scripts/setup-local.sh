#!/usr/bin/env bash
# ── Local demo setup ──────────────────────────────────────────────────────────
# Starts the full Release on Demand stack via Docker Compose.
# Requires: docker compose v2+
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

log()  { echo -e "${GREEN}✓  $*${NC}"; }
info() { echo -e "${BLUE}ℹ  $*${NC}"; }
warn() { echo -e "${YELLOW}⚠  $*${NC}"; }

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          Release on Demand — Local Demo Setup               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Prerequisites ─────────────────────────────────────────────────────────────
info "Checking prerequisites..."
command -v docker >/dev/null 2>&1 || { echo "❌  docker not found"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "❌  docker compose v2 not found"; exit 1; }
log "Docker and Docker Compose found"

# ── Build and start ───────────────────────────────────────────────────────────
info "Building and starting all services..."
docker compose up --build -d

# ── Wait for services ─────────────────────────────────────────────────────────
info "Waiting for services to be healthy..."

wait_for() {
  local name="$1" url="$2" retries=30
  for i in $(seq 1 $retries); do
    if curl -sf "$url" >/dev/null 2>&1; then
      log "$name is ready"
      return 0
    fi
    printf "."
    sleep 3
  done
  warn "$name did not become ready in time"
  return 1
}

wait_for "Acme API (stable)"    "http://localhost:8081/health"
wait_for "Acme API (canary)"    "http://localhost:8082/health"
wait_for "Unleash"              "http://localhost:4242/health"
wait_for "Prometheus"           "http://localhost:9090/-/healthy"
wait_for "Grafana"              "http://localhost:3000/api/health"

# ── Print access info ─────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                     Stack is Ready!                         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  API (load-balanced)  http://localhost:8080/api/products    ║"
echo "║  Stable (direct)      http://localhost:8081/api/products    ║"
echo "║  Canary (direct)      http://localhost:8082/api/products    ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Unleash UI           http://localhost:4242                 ║"
echo "║    user: admin  /  password: unleash4all                   ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Prometheus           http://localhost:9090                 ║"
echo "║  Grafana              http://localhost:3000                 ║"
echo "║    user: admin  /  password: admin                         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Demo flow:                                                  ║"
echo "║  1. Check API returns v1 products (4 items)                 ║"
echo "║  2. Enable 'new-product-catalog' in Unleash                 ║"
echo "║  3. Check canary returns v2 products (7 items)              ║"
echo "║  4. scripts/promote-canary.sh  ← simulate promotion        ║"
echo "║  5. Watch Grafana for traffic shift                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
