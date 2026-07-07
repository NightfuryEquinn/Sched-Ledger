# Ledger Sched

Private expense ledger and schedule app. Track spending in MYR, plan events, and sign in with a Web3 wallet — no email or password required.

Built with **Bun**, **Hono**, **MongoDB**, and **React**.

![Ledger Sched](logo.png)

## Features

- **Overview, transactions, budgets, insights, recurring** — monthly expense tracking with category breakdowns
- **Schedule** — bills, appointments, and reminders with recurrence
- **Web3 identity** — create or restore a wallet; sign in with a cryptographic challenge (SIWE-style)
- **Dark mode** — system-aware theme toggle, persisted locally
- **Sessions & privacy** — HttpOnly session cookies, revoke devices, export CSV, clear local data
- **Security** — signature verification, rate limiting, security headers, in-memory profile cache

## Tech stack

| Layer | Stack |
|-------|--------|
| Runtime | [Bun](https://bun.sh) |
| API | [Hono](https://hono.dev) + Zod validation |
| Database | [MongoDB](https://www.mongodb.com) |
| Frontend | React 19, TanStack Query, ethers v6 |
| Styling | Custom CSS (warm cream / charcoal themes) |

## Project structure

```
api/
└── index.ts              # Vercel serverless entry (Hono handler)
src/
├── index.ts              # Bun server (API + SPA)
├── index.html
├── api/
│   ├── lib/              # auth, cache, errors, serialize
│   ├── middleware/       # session, rate-limit, security, db
│   └── routes/           # auth, profile, expenses, events, users, consent
├── db/                   # MongoDB client, collections, indexes
├── schemas/              # Zod schemas (shared API validation)
└── frontend/
    ├── app/              # Root, LedgerApp
    ├── auth/             # wallet sign-in, account menu, session UI
    ├── components/       # Brand, ThemeToggle, shared UI
    ├── hooks/            # useLedger, useTheme
    ├── lib/              # api client, data, stats, theme, types
    ├── views/            # Overview, Transactions, Budgets, Schedule, …
    ├── charts/
    ├── styles/
    └── main.tsx
```

## Setup

```bash
bun install
cp .env.example .env
```

Edit `.env`:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_DB` | Database name (default: `ledger`) |
| `APP_ORIGIN` | Origin embedded in sign-in messages (default: request origin) |

### MongoDB

- **Local:** `MONGODB_URI=mongodb://127.0.0.1:27017` (start `mongod` first)
- **Atlas:** use your `mongodb+srv://…` string

On Windows, Bun may fail to resolve `mongodb+srv` DNS; the app auto-converts to a direct connection string at startup.

## Development

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000). The SPA and API share the same origin (`/api/*`).

### Health check

```bash
curl http://localhost:3000/api/health
```

## Authentication

Sign-in is wallet-based and verified on the server:

1. `POST /api/auth/challenge` — server issues a nonce and message to sign
2. Client signs with the wallet (ethers / browser wallet)
3. `POST /api/auth/verify` — server verifies the signature and sets an **HttpOnly** `ledger_session` cookie
4. Authenticated requests use `credentials: include` (no spoofable address header)

Manage sessions under **Account → Data & privacy** (revoke devices, sign out everywhere, clear cookies and local storage).

## API overview

| Route | Description |
|-------|-------------|
| `GET /api/health` | Service and DB status |
| `POST /api/auth/challenge` | Start sign-in |
| `POST /api/auth/verify` | Complete sign-in |
| `GET /api/auth/me` | Current session |
| `GET /api/auth/sessions` | List active sessions |
| `DELETE /api/auth/sessions/:id` | Revoke a session |
| `POST /api/auth/logout` | End current session |
| `GET/PATCH /api/profile` | Budgets, income, current month |
| `CRUD /api/expenses` | Transactions |
| `CRUD /api/events` | Schedule events |
| `GET/PATCH /api/consent` | Data-sharing consent |
| `GET/POST/PATCH /api/users` | User profile (codename, notify email) |

All mutating routes require a valid session cookie. Auth endpoints have stricter rate limits.

## Production (self-hosted)

```bash
bun run build   # static frontend → dist/
bun start       # NODE_ENV=production
```

Set `NODE_ENV=production` so session cookies are marked `Secure` over HTTPS.

## Deploy on Vercel

The app deploys as a **static SPA** (`dist/`) plus a **serverless API** ([`api/index.ts`](api/index.ts) wrapping the existing Hono app). Local development with `bun dev` is unchanged.

### Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** for Production and Preview:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | Atlas `mongodb+srv://…` connection string |
| `MONGODB_DB` | Database name (default: `ledger`) |
| `APP_ORIGIN` | Public app URL, e.g. `https://your-project.vercel.app` (used in sign-in messages) |
| `NODE_ENV` | `production` (Vercel usually sets this; enables `Secure` session cookies) |

**Atlas network access:** allow `0.0.0.0/0` so Vercel's dynamic egress IPs can reach your cluster.

### Deploy

1. Push the repo to GitHub.
2. Import the project at [vercel.com/new](https://vercel.com/new).
3. Framework preset: **Other** (build/output are defined in [`vercel.json`](vercel.json)).
4. Add the environment variables above.
5. Deploy.

CLI alternative:

```bash
bunx vercel login
bunx vercel          # preview deployment
bunx vercel --prod   # production
```

Optional: run `bunx vercel dev` locally to test Vercel routing before deploying.

### Verify after deploy

1. **Health check** — `GET https://<your-app>.vercel.app/api/health` should return `{ "ok": true, "service": "ledger-api", "db": "connected" }`.
2. **Sign-in** — open the app, create or restore a wallet, complete the sign-in challenge, and confirm you land in the main UI.
3. **CRUD** — add an expense and a schedule event; refresh the page and confirm data persists.
4. **Sessions** — open **Account → Data & privacy**, confirm your device appears in the session list, and test revoke / sign out.

### Serverless notes

- Rate limiting and profile cache are in-memory per function instance (acceptable for v1).
- Cold starts may add latency on the first request while MongoDB connects; warm instances reuse the cached client.

## License

See [LICENSE](LICENSE).
