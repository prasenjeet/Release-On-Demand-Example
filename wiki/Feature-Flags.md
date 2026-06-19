# Feature Flags (Unleash)

Unleash is a self-hosted, open-source feature flag platform. It decouples **deployment** (when code goes to production) from **release** (when users see it).

---

## Flag Inventory

| Flag | Type | Default | Who triggers | Description |
|------|------|---------|-------------|-------------|
| `new-product-catalog` | Release gate | OFF | PM / Release Mgr | Extended catalog (7 items vs 4) |
| `ai-recommendations` | Targeted | OFF | Product team | AI recommendations for beta users |
| `holiday-promotion` | Campaign | OFF | Marketing | 20% discount banner |
| `express-checkout` | Gradual rollout | OFF | Engineering | 20% of sessions get fast checkout |

---

## Flag Patterns

### 1. Release Gate (Boolean)

Simplest pattern. Code is deployed but invisible until flipped.

```json
{
  "name": "new-product-catalog",
  "type": "release",
  "enabled": false,
  "strategies": [{"name": "default", "parameters": {}}]
}
```

**Use when:** A complete feature is ready and tested, waiting for a business go-ahead.

### 2. Targeted Rollout (userId / email)

Release to specific users — beta testers, employees, early adopters.

```json
{
  "name": "ai-recommendations",
  "strategies": [{
    "name": "userWithId",
    "parameters": {
      "userIds": "beta-1,beta-2,qa-engineer-1"
    }
  }]
}
```

The app passes `userId` in the evaluation context:

```javascript
// app/src/featureFlags.js
const ctx = { userId: req.query.userId, sessionId: req.sessionId };
unleash.isEnabled('ai-recommendations', ctx);
```

**Use when:** Running a private beta or dogfooding with employees before public launch.

### 3. Scheduled / Campaign Release

Prepare a feature well in advance, flip when the business event happens.

```bash
# Marketing enables holiday sale at 9am on Black Friday — no engineer needed
curl -X POST http://unleash:4242/api/admin/features/holiday-promotion/toggle/on \
  -H 'Authorization: $UNLEASH_TOKEN'
```

**Use when:** Seasonal campaigns, coordinated marketing launches, event-driven features.

### 4. Gradual Rollout (Percentage)

Release to a random percentage of sessions. The same session always gets the same variant (no flicker).

```json
{
  "name": "express-checkout",
  "strategies": [{
    "name": "gradualRolloutSessionId",
    "parameters": {
      "percentage": "20",
      "groupId": "express-checkout"
    }
  }]
}
```

Grow the percentage over time: 5% → 20% → 50% → 100%.

**Use when:** You want to validate UX / conversion metrics with a subset of users before committing.

---

## SDK Integration

```javascript
// app/src/featureFlags.js
const { initialize, InMemStorageProvider } = require('unleash-client');

unleash = initialize({
  url: process.env.UNLEASH_URL,
  appName: 'acme-api',
  customHeaders: { Authorization: process.env.UNLEASH_TOKEN },
  storageProvider: new InMemStorageProvider(),  // no filesystem needed
});
await unleash.start();

// Evaluate with context
function isEnabled(flagName, context = {}) {
  return unleash.isEnabled(flagName, context);
}
```

The SDK:
- Polls Unleash server every 15 seconds (configurable)
- Caches all flags in memory
- Evaluation is synchronous, < 1ms
- Continues serving cached values if Unleash is unreachable (resilient)

---

## Unleash REST API

### Create a flag

```bash
curl -X POST http://unleash:4242/api/admin/features \
  -H 'Authorization: $TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "my-new-feature",
    "type": "release",
    "description": "What this enables",
    "strategies": [{"name": "default", "parameters": {}}]
  }'
```

### Enable / Disable

```bash
curl -X POST http://unleash:4242/api/admin/features/my-new-feature/toggle/on \
  -H 'Authorization: $TOKEN'

curl -X POST http://unleash:4242/api/admin/features/my-new-feature/toggle/off \
  -H 'Authorization: $TOKEN'
```

### Add targeting strategy

```bash
curl -X POST http://unleash:4242/api/admin/features/my-new-feature/strategies \
  -H 'Authorization: $TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"name": "userWithId", "parameters": {"userIds": "user-1,user-2"}}'
```

### Check a flag value (client API)

```bash
curl http://unleash:4242/api/client/features/my-new-feature \
  -H 'Authorization: $TOKEN'
```

---

## Kubernetes Setup

Unleash runs in the `feature-flags` namespace. See `k8s/unleash/` for manifests.

```bash
# Deploy PostgreSQL + Unleash
kubectl apply -f k8s/unleash/postgres-statefulset.yaml
kubectl apply -f k8s/unleash/unleash-deployment.yaml
kubectl apply -f k8s/unleash/unleash-service.yaml

# Create DB connection secret
kubectl create secret generic unleash-db-url \
  --from-literal=url="postgresql://unleash:password@unleash-postgres.feature-flags:5432/unleash" \
  -n production

# Create API token secret
kubectl create secret generic unleash-credentials \
  --from-literal=api-token="*:*.your-api-token" \
  -n production

# Access Unleash UI
kubectl port-forward svc/unleash 4242 -n feature-flags
# → http://localhost:4242
```

---

## Best Practices

1. **Name flags by feature, not by team** — `new-product-catalog`, not `team-alpha-experiment`
2. **Delete flags after full rollout** — flags are technical debt; remove them within one sprint of 100% rollout
3. **Never read a flag value more than once per request** — evaluate at the boundary, pass the result down
4. **Use targeting keys consistently** — `userId` for authenticated users, `sessionId` for anonymous
5. **Document who can toggle each flag** — some flags are for engineers only, some for marketing
6. **Test both flag states** — add tests for `flag=ON` and `flag=OFF` paths
