# Self-Hosting the Learning HUB Engagement Worker

This guide walks through deploying and self-hosting the Learning HUB Cloudflare Worker (`@learning-hub/worker`).

---

## 1. Architecture: What the Worker Does (and Does Not Do)

The worker (`apps/worker`) is Learning HUB's lightweight multi-user edge coordinator. It handles real-time coordination, community sharing, and optional global leaderboards.

### What it does:
- **Live Study Rooms:** Real-time presence, chat, and synchronized Pomodoro timers over WebSockets (`/api/v1/rooms/:code/ws`), coordinated by Cloudflare **Durable Objects** (`StudyRoom`).
- **Party Boss Raids:** Cooperative multi-user study battles (`/api/v1/raids/:id/ws`), also coordinated by Durable Objects (`BossRaid`).
- **Community Library:** Public deck and curriculum discovery, publishing, and download counters (`/api/v1/library/*`), backed by Cloudflare **D1** (Serverless SQLite).
- **Public Leaderboard:** Opt-in pseudonymized weekly XP, streak, and level rankings (`/api/v1/leaderboard` and `/api/v1/stats/sync`).
- **Cryptographic Device Registration:** Challenge-response verification of ECDSA P-256 public keys (`/api/v1/auth/register-key`).

### What it does NOT do:
- **No private user study data:** Your flashcards, review logs, notes, habits, FSRS parameters, and personal knowledge graphs **never** touch the worker. They stay locally in SQLite (OPFS on native, SQLite on web).
- **No passwords or session cookies:** Authentication uses decentralized ECDSA P-256 keypairs (`device_key` mode) generated on each client device.
- **No WebPush notifications:** Push notifications and digest emails are handled by the headless Node companion (`apps/server`), not this Cloudflare edge worker.

---

## 2. Bindings & Resources

The worker's configuration is declared in `apps/worker/wrangler.toml`. Every binding traces directly to the consuming source:

| Binding Name | Type | Purpose | Consuming Source |
|---|---|---|---|
| `DB` | D1 Database | Persists registered users, community decks/courses, and leaderboard stats | `apps/worker/src/index.ts` |
| `STUDY_ROOM` | Durable Object (`StudyRoom`) | State and WebSocket connections for live co-study rooms | `apps/worker/src/study-room.ts` |
| `BOSS_RAID` | Durable Object (`BossRaid`) | State and WebSocket connections for party boss battles | `apps/worker/src/boss-raid.ts` |

---

## 3. Prerequisites

1. A [Cloudflare](https://dash.cloudflare.com/) account.
2. Node.js 20+ and npm installed locally.
3. Wrangler CLI authenticated:
   ```bash
   npx wrangler login
   ```

> [!NOTE]
> Cloudflare Workers Free Tier includes D1 and Workers, but **Durable Objects require the Workers Paid plan ($5/mo)**. For free local testing, `wrangler dev` simulates both D1 and Durable Objects locally in Miniflare at zero cost.

---

## 4. Setting Up D1 Database

### 4.1 Create the Production D1 Database
In the root of the repository:
```bash
npx wrangler d1 create learning-hub-d1
```

Wrangler will output configuration information similar to:
```toml
[[d1_databases]]
binding = "DB"
database_name = "learning-hub-d1"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 4.2 Update `apps/worker/wrangler.toml`
Paste the returned `database_id` into `apps/worker/wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "learning-hub-d1"
database_id = "YOUR_ACTUAL_DATABASE_ID_HERE"
migrations_dir = "migrations"
```

### 4.3 Run Migrations
Apply the initial schema (`apps/worker/migrations/0001_initial.sql`) to your remote D1 database:
```bash
# Remote deployment:
npx wrangler d1 migrations apply learning-hub-d1 --remote --config apps/worker/wrangler.toml

# Or local test database:
npx wrangler d1 migrations apply learning-hub-d1 --local --config apps/worker/wrangler.toml
```

---

## 5. Deployment

### Option A: From Repository Root
```bash
npm run worker:deploy
```

### Option B: From Worker Directory
```bash
cd apps/worker
npm run deploy
```

Wrangler will deploy the worker and output your live endpoint, e.g.:
`https://learning-hub-engagement.<your-subdomain>.workers.dev`

### Health Check
Verify the worker is operational:
```bash
curl https://learning-hub-engagement.<your-subdomain>.workers.dev/health
# Returns: {"ok":true,"worker":"learning-hub-engagement","version":"1.0.0"}
```

---

## 6. Configuring Your Learning HUB Client

Once deployed, point your web, desktop, or mobile app to your self-hosted worker:

1. In Learning HUB, navigate to **Settings** (`/settings`) or **Online** (`/online`).
2. Enter your custom worker URL in the **Server Endpoint** field (e.g., `https://learning-hub-engagement.<your-subdomain>.workers.dev`).
3. Click **Save & Connect**.

This calls `POST /api/online/identity` with `{ serverUrl: "https://..." }`, storing the endpoint in the local `online_servers` table and registering your device's ECDSA public key with your self-hosted worker.

---

## 7. Local Development

Run the worker locally with Miniflare:
```bash
npm run dev --workspace=@learning-hub/worker
```
The local server listens on `http://127.0.0.1:8787` with isolated local D1 and Durable Objects in `.wrangler/state`.

---

## 8. Resource Limits & Operational Notes

- **D1 Rows & Storage:** Free tier allows 5 million read rows/day and 100k write rows/day. Community library searches use SQL parameterized `LIKE` queries with a `LIMIT 50`.
- **Durable Objects WebSockets:** Durable Objects charge per active wall-clock duration and request. Study rooms idle when all participants disconnect.
- **Teardown:**
  ```bash
  npx wrangler delete --config apps/worker/wrangler.toml
  npx wrangler d1 delete learning-hub-d1
  ```
