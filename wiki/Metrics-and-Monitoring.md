# Metrics and Monitoring

Prometheus collects metrics from both stable and canary instances. Argo Rollouts queries these metrics at each analysis step to gate promotion or trigger rollback. Grafana visualizes the comparison.

---

## Prometheus Metrics (App)

The app (`app/src/middleware/metrics.js`) exposes three metrics:

```
GET /metrics  →  Prometheus text format
```

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_requests_total` | Counter | method, route, status_code, version | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | method, route, status_code, version | Request duration (9 buckets) |
| `http_errors_total` | Counter | method, route, version | Total 5xx errors |
| `acme_*` (default metrics) | Various | — | Node.js process metrics (GC, heap, etc.) |

---

## Recording Rules

Pre-computed every 15 seconds to avoid expensive fan-out at query time:

```yaml
# monitoring/prometheus/rules/canary-rules.yaml
rules:
  - record: canary:http_success_rate:5m
    expr: |
      sum by (role, version) (rate(http_requests_total{status_code!~"5.."}[5m]))
      / sum by (role, version) (rate(http_requests_total[5m]))

  - record: canary:http_latency_p99:5m
    expr: |
      histogram_quantile(0.99,
        sum by (role, version, le) (
          rate(http_request_duration_seconds_bucket[5m])
        )
      )

  - record: canary:http_rps:1m
    expr: sum by (role, version) (rate(http_requests_total[1m]))
```

---

## Canary Analysis Queries

These run inside `AnalysisRun` objects every minute:

### Success Rate Gate

```promql
# Must be ≥ 0.99 (99%)
sum(
  rate(http_requests_total{
    kubernetes_service_name="acme-api-canary",
    status_code!~"5.."
  }[5m])
) /
sum(
  rate(http_requests_total{
    kubernetes_service_name="acme-api-canary"
  }[5m])
)
```

### Absolute Latency Gate

```promql
# Must be < 0.5 (500ms)
histogram_quantile(0.99,
  sum by (le) (
    rate(http_request_duration_seconds_bucket{
      kubernetes_service_name="acme-api-canary"
    }[5m])
  )
)
```

### Regression Guard (relative to stable)

```promql
# Canary P99 must not be > 1.2× stable P99
canary_p99 / stable_p99
```

---

## Alerting Rules

```yaml
# k8s/monitoring/prometheus-rule.yaml
alerts:
  - alert: CanaryHighErrorRate
    expr: canary:http_success_rate:5m{role="canary"} < 0.99
    for: 2m
    # → Slack #release-engineering + PagerDuty if critical

  - alert: CanaryLatencyRegression
    expr: |
      canary:http_latency_p99:5m{role="canary"}
      > 1.2 * canary:http_latency_p99:5m{role="stable"}
    for: 3m

  - alert: APIErrorBudgetBurn
    expr: canary:http_success_rate:5m{role="stable"} < 0.999
    for: 5m
    # → SLO breach alert (stable is under 99.9%)
```

---

## Grafana Dashboard

The dashboard (`monitoring/grafana/dashboards/release-on-demand.json`) auto-provisions on startup.

### Panels

| Panel | Description |
|-------|-------------|
| **Canary Traffic Weight** | Gauge: current % of traffic on canary |
| **Stable — Success Rate** | Stat: current stable success rate |
| **Canary — Success Rate** | Stat: current canary success rate |
| **Canary — P99 Latency** | Stat: canary P99 with threshold color |
| **Success Rate: Stable vs Canary** | Timeseries: side-by-side comparison + SLO line |
| **Latency: Stable vs Canary** | Timeseries: P99 + P50, stable vs canary |
| **Requests per Second** | Timeseries: RPS split by version |
| **Feature Flag Reference** | Markdown: current flag inventory |

### Importing the dashboard manually

1. Open Grafana → **+** → **Import**
2. Upload `monitoring/grafana/dashboards/release-on-demand.json`
3. Select the Prometheus datasource

---

## ServiceMonitor (Kubernetes)

```yaml
# k8s/monitoring/service-monitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: acme-api
spec:
  selector:
    matchLabels:
      app: acme-api
  endpoints:
    - port: http
      path: /metrics
      interval: 15s
```

Requires Prometheus Operator:

```bash
helm upgrade -i kube-prometheus-stack \
  prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace
```

---

## Useful Queries

```bash
# Current canary success rate
curl -s 'http://localhost:9090/api/v1/query?query=canary:http_success_rate:5m{role="canary"}'

# Canary RPS
curl -s 'http://localhost:9090/api/v1/query?query=canary:http_rps:1m'

# P99 latency comparison
curl -s 'http://localhost:9090/api/v1/query?query=canary:http_latency_p99:5m'

# Check for active AnalysisRuns (Kubernetes)
kubectl get analysisrun -n production
kubectl describe analysisrun <name> -n production
```
