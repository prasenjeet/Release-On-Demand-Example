# Release on Demand — Sample Project

A runnable demo showing how to decouple **deployment** from **release** using open-source tools.

Code is continuously deployed to production. Features are hidden behind feature flags and released deliberately — no deployment required.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Docker Compose                            │
│                                                                  │
│  ┌──────────────────────┐   gRPC   ┌───────────────────────┐    │
│  │   Node.js / Express  │ ◄──────► │        flagd           │    │
│  │   (Acme Shop app)    │  :8013   │  Feature flag daemon   │    │
│  │        :3000         │          │  :8013 gRPC / :8016 HTTP│   │
│  └──────────────────────┘          └──────────┬────────────┘    │
│                                               │ watches file     │
│                                   ┌───────────▼────────────┐    │
│                                   │   flags/flags.json      │    │
│                                   │  (hot-reloaded on edit) │    │
│                                   └────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### Open-source tools

| Tool | Role |
|------|------|
| [OpenFeature SDK](https://openfeature.dev) | Vendor-neutral feature flag standard (CNCF) |
| [flagd](https://flagd.dev) | Open-source flag evaluation daemon |
| [Express.js](https://expressjs.com) | Web framework |
| [Docker Compose](https://docs.docker.com/compose) | Local orchestration |
| [GitHub Actions](https://github.com/features/actions) | CI/CD pipeline |

---

## Feature Flags in This Demo

| Flag | Pattern | Description |
|------|---------|-------------|
| `new-product-layout` | Release gate | Card grid layout (deployed, not released) |
| `express-checkout` | Release gate | Single-page checkout flow |
| `holiday-promotion` | Scheduled release | 20% sale banner — flip on for campaigns |
| `beta-search` | Targeted rollout | Real-time search for specific user emails |
| `canary-recommendation-engine` | Canary (20%) | AI recommendations for 20% of users |

---

## Quick Start

**Prerequisites:** Docker + Docker Compose

```bash
git clone https://github.com/prasenjeet/release-on-demand-example.git
cd release-on-demand-example
docker compose up --build
```

Open:
- **Shop:** http://localhost:3000
- **Admin (flag toggle UI):** http://localhost:3000/admin

---

## Hands-on Demo

### 1. See the default state

Visit http://localhost:3000 — you'll see the basic product list with all flags OFF.
The feature bar at the top shows every flag's current state.

### 2. Release the new product layout

In the admin panel, flip **`new-product-layout` → ON**.

Go back to the shop. The products are now shown as a card grid — no deployment, no downtime.

### 3. Enable express checkout

Flip **`express-checkout` → ON**.

Click "Add to Cart" on any product. Instead of a multi-step form you're taken straight to a compact express checkout. Flip it back OFF to instantly revert.

### 4. Launch a holiday sale

Flip **`holiday-promotion` → ON**.

A holiday banner appears and every price drops by 20%. This is how a time-limited campaign is launched in seconds — the code was already deployed, waiting behind the flag.

### 5. Try canary targeting

The `canary-recommendation-engine` flag uses percentage-based targeting: 20% of users (deterministically by user ID) see AI recommendations. Open the shop in multiple private browser windows — some will show the recommendation row, others won't.

### 6. Test targeted rollout

The `beta-search` flag evaluates the user's email. Append `?email=beta@example.com` to the URL: http://localhost:3000?email=beta@example.com — the search bar appears only for that address.

---

## Toggle Flags from the Command Line

Requires `jq` (`brew install jq` / `apt install jq`):

```bash
# Turn a flag on
./scripts/toggle-flag.sh new-product-layout on

# Turn a flag off
./scripts/toggle-flag.sh holiday-promotion off

# Show available flags
./scripts/toggle-flag.sh
```

flagd watches `flags/flags.json` and hot-reloads it automatically.

---

## Project Structure

```
.
├── app/                        # Node.js application
│   ├── src/
│   │   ├── index.js            # Entry point
│   │   ├── server.js           # Express setup
│   │   ├── featureFlags.js     # OpenFeature SDK init
│   │   └── routes/api.js       # API routes (flags, products, admin)
│   ├── public/                 # Frontend (HTML + vanilla JS)
│   │   ├── index.html          # Shop page
│   │   ├── checkout.html       # Checkout (standard vs express)
│   │   ├── admin.html          # Flag management UI
│   │   ├── css/styles.css
│   │   └── js/
│   │       ├── app.js          # Shop feature-flag logic
│   │       └── admin.js        # Admin toggle UI
│   ├── test/
│   │   └── server.test.js      # API + static page tests
│   ├── Dockerfile
│   └── package.json
├── flags/
│   └── flags.json              # Feature flag definitions (edit to toggle)
├── scripts/
│   └── toggle-flag.sh          # CLI helper for toggling flags
├── .github/workflows/
│   ├── ci.yml                  # Build + test on every push/PR
│   └── deploy.yml              # Build image + deploy on main push
├── docs/
│   └── concepts.md             # Deep-dive into Release on Demand patterns
└── docker-compose.yml
```

---

## Running Tests

```bash
cd app
npm install
npm test
```

Tests mock flagd so they run without any external dependencies.

---

## The Core Principle

```
Git push  →  CI green  →  Image deployed to production
                                        ↓
                    Code is LIVE — features are HIDDEN (flags OFF)
                                        ↓
                    Release Manager flips flag ON (no deploy needed)
                                        ↓
                         Feature is RELEASED to users ✓
                                        ↓
                    Something wrong? Flip flag OFF — instant rollback ✓
```

This is **Release on Demand**: deploy continuously, release deliberately.

See [`docs/concepts.md`](docs/concepts.md) for a detailed breakdown of each release pattern.
