# Release on Demand — Core Concepts

## What is Release on Demand?

Release on Demand is a practice (popularized by SAFe) that **decouples deployment from release**.

| Concept      | Traditional                         | Release on Demand                       |
|--------------|-------------------------------------|-----------------------------------------|
| Deployment   | Code goes live when released        | Code is deployed continuously           |
| Release      | Triggered by deployment             | Triggered deliberately via feature flag |
| Rollback     | Redeploy old version (slow)         | Flip a flag (instant)                   |
| Risk         | Big-bang release                    | Gradual, controlled exposure            |

## Patterns Demonstrated in This Project

### 1. Standard Release Gate (Boolean flag)

The simplest pattern. Code is deployed but inactive until a flag is flipped.

```
flags/flags.json  ←  edit defaultVariant: "off" → "on"
     ↓
flagd hot-reloads
     ↓
All users immediately see the new feature
```

**Used for:** `new-product-layout`, `express-checkout`

---

### 2. Scheduled / Seasonal Release

A feature is prepared in advance and enabled at the right moment — no deployment required.

```
Holiday sale campaign:
  → Designers prepare the banner
  → Developers deploy the code (flag OFF)
  → Marketing team flips the flag ON on launch day
  → One flag flip starts the campaign globally, instantly
```

**Used for:** `holiday-promotion`

---

### 3. Targeted Rollout (by user attribute)

Release to a specific group of users — by email, role, org, or any attribute in the evaluation context.

```javascript
// flags.json targeting rule
"targeting": {
  "if": [
    { "in": [{ "var": "email" }, ["beta@example.com", "qa@example.com"]] },
    "on",
    "off"
  ]
}
```

The user's email is passed as evaluation context from the app:
```javascript
client.getBooleanValue('beta-search', false, { targetingKey: userId, email: user.email })
```

**Used for:** `beta-search`

---

### 4. Canary Release (percentage rollout)

Roll out to a percentage of users based on a deterministic hash of their targeting key.
The same user always sees the same variant — no flicker.

```javascript
// flags.json — 20% canary
"targeting": {
  "fractional": [
    { "var": "targetingKey" },
    ["on", 20],
    ["off", 80]
  ]
}
```

Increase the percentage gradually as confidence grows:
- 5% → monitor metrics
- 20% → canary stable, widen
- 50% → half traffic
- 100% → full release, remove flag

**Used for:** `canary-recommendation-engine`

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Docker Compose                            │
│                                                                  │
│  ┌──────────────────────┐    gRPC    ┌──────────────────────┐   │
│  │    Node.js App       │ ◄────────► │        flagd          │   │
│  │  (Express + OF SDK)  │  :8013     │  (OpenFeature daemon) │   │
│  │       :3000          │            │       :8013 / :8016   │   │
│  └──────────────────────┘            └──────────┬───────────┘   │
│                                                 │ file watch     │
│                                      ┌──────────▼───────────┐   │
│                                      │   flags/flags.json    │   │
│                                      │  (hot-reloaded)       │   │
│                                      └──────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘

Request flow:
  Browser  →  GET /api/flags?userId=abc
           →  OpenFeature SDK evaluates each flag via flagd gRPC
           →  flagd applies targeting rules from flags.json
           →  returns {feature: true/false} per user
           →  app renders the right experience
```

## The CI/CD Connection

```
Git push → GitHub Actions CI → tests pass → Docker image built
                                                    ↓
                             Image pushed to GHCR (production deploy)
                                                    ↓
                         Code is LIVE but features are HIDDEN (flags OFF)
                                                    ↓
                         Release Manager flips flag ON in admin panel
                                                    ↓
                              Feature is RELEASED to users — no deploy needed
```

## Tools Used

| Tool                                              | Role                              |
|---------------------------------------------------|-----------------------------------|
| [OpenFeature SDK](https://openfeature.dev)        | Vendor-neutral feature flag API   |
| [flagd](https://flagd.dev)                        | Open-source flag evaluation daemon|
| [Express.js](https://expressjs.com)               | Web application framework         |
| [Docker Compose](https://docs.docker.com/compose) | Local orchestration               |
| [GitHub Actions](https://github.com/features/actions) | CI/CD pipeline              |

All tools are open-source with no vendor lock-in.
