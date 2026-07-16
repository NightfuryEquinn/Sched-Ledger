# Sched Ledger

Private expense ledger, schedule, and to-do app. Track spending across multiple wallets and currencies, plan events with email reminders, and sign in with a Web3 wallet — no email or password required.

Built with **Bun**, **Hono**, **MongoDB**, and **React**.

![Sched Ledger](src/frontend/assets/logo.png)

## Features

### Ledger

- **Overview, transactions, budgets, insights, recurring** — monthly expense tracking with charts, category breakdowns, and budget progress
- **Multiple wallets** — create wallets in 29 currencies; monthly-income or starting-balance funding modes
- **Custom categories** — editable category/subcategory taxonomy with glyphs and colors
- **Recurring transactions** — monthly, quarterly, or yearly; auto-posted on due dates via daily cron
- **FX insights** — view spending converted to another currency (optional live rates)

### Schedule & tasks

- **Schedule** — calendar and agenda for bills, appointments, and reminders with recurrence
- **Email reminders** — optional Resend integration; per-event lead times and user timezone
- **TO-DO lists** — multiple named lists with inline task management

### Identity & privacy

- **Web3 identity** — create or restore an in-browser wallet; sign in with a cryptographic challenge (SIWE-style)
- **Dark mode** — system-aware theme toggle, persisted locally
- **Sessions & privacy** — HttpOnly session cookies, revoke devices, export CSV, clear local data
- **Encrypted ledger** — amounts, categories, and notes encrypted client-side; unlock with your wallet key each session
- **Guided tour** — Shepherd.js walkthrough for each main view

### Security

- **End-to-end encryption** — transaction amounts, categories, notes, and wallet budgets are AES-256-GCM encrypted in the browser before reaching MongoDB; the server only stores ciphertext
- Signature verification, rate limiting, security headers, in-memory profile cache

## Tech stack

| Layer | Stack |
|-------|--------|
| Runtime | [Bun](https://bun.sh) |
| API | [Hono](https://hono.dev) + Zod validation |
| Database | [MongoDB](https://www.mongodb.com) |
| Frontend | React 19, TanStack Query, ethers v6 |
| Styling | Tailwind CSS 4 (`bun-plugin-tailwind`) + custom theme CSS |
| Tours | [Shepherd.js](https://shepherdjs.dev) |
| Deploy | [Vercel](https://vercel.com) (Analytics, Speed Insights); scheduled jobs via [cron-job.org](https://cron-job.org) |

## Project structure

```
api/index.ts              # Vercel serverless entry (re-exports bundled handler)
src/
├── index.ts              # Bun dev/prod server (API + SPA)
├── index.html
├── vercel-api.ts         # API bundle source (built → api/index.js)
├── api/
│   ├── app.ts            # Hono app + error handler
│   ├── lib/              # auth, cache, email, reminders, recurring-expenses
│   ├── middleware/       # session, rate-limit, security, db
│   └── routes/           # auth, users, profile, wallets, categories,
│                         # expenses, events, todo-lists, consent, fx, cron
├── db/                   # MongoDB client, collections, indexes, URI resolver
├── schemas/              # Zod schemas (shared API validation)
├── lib/                  # glyphs, recurring, schedule, timezone (shared)
└── frontend/
    ├── app/              # Root, LedgerApp
    ├── auth/             # wallet sign-in, account menu, session UI
    ├── assets/           # logo
    ├── charts/           # SVG charts (donut, trend, MoM bars)
    ├── components/       # Brand, ThemeToggle, Wallets, pickers, shared UI
    ├── lib/
    │   ├── crypto/         # E2EE codec, key derivation, unlock flow
    │   ├── hooks/          # useLedger, useTheme
    │   └── tour/           # guided tour steps and runner
    ├── styles/           # ledger.css (theme tokens + layout)
    ├── views/            # Overview, Transactions, Budgets, Categories,
    │                     # Recurring, Insights, Schedule, TodoList
    └── main.tsx
scripts/                  # MongoDB collection maintenance (drop/list)
build.ts                  # Production build (dist/ + api/index.js)
```

## Setup

```bash
bun install
```

Create a `.env` file in the project root:

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `MONGODB_DB` | No | Database name (default: `ledger`) |
| `APP_ORIGIN` | No | Origin embedded in sign-in messages (default: request origin) |
| `APP_TIMEZONE` | No | Server default IANA timezone for cron/reminders |
| `CRON_SECRET` | For cron | Bearer token for `GET /api/cron/reminders` |
| `RESEND_API_KEY` | For email | Resend API key for schedule reminder emails |
| `EMAIL_FROM` | No | Sender address (default: `Sched Ledger <onboarding@resend.dev>`) |
| `EXCHANGE_RATE_API_KEY` | For FX | [ExchangeRate-API](https://www.exchangerate-api.com) key for Insights currency conversion |

### MongoDB

- **Local:** `MONGODB_URI=mongodb://127.0.0.1:27017` (start `mongod` first)
- **Atlas:** use your `mongodb+srv://…` string

On Windows, Bun may fail to resolve `mongodb+srv` DNS; the app auto-converts to a direct connection string at startup.

### Database scripts

```bash
bun run db:list          # list collections
bun run db:drop expenses events --yes   # drop specific collection(s)
bun run db:drop:all --yes  # drop all app collections
```

Connectivity check: `curl http://localhost:3000/api/health`

## Database schema

MongoDB database name defaults to `ledger` (`MONGODB_DB`). All user-owned documents are keyed by lowercase Ethereum `address` / `userAddress`. Every collection also has `_id` (`ObjectId`) and, where noted, `createdAt` / `updatedAt`.

Schemas are defined in `src/schemas/` and wired in `src/db/collections.ts`. Indexes are created on connect via `src/db/indexes.ts`.

### Collections

| MongoDB collection | Code key | Purpose |
|------------------|----------|---------|
| `users` | `users` | Account profile (codename, notify email, timezone) |
| `ledger_profiles` | `ledgerProfiles` | Per-user UI state (`currentMonth`) |
| `financial_wallets` | `financialWallets` | Wallets (currency, funding mode; E2EE financials) |
| `category_taxonomies` | `categoryTaxonomies` | One document per user — full category tree |
| `expenses` | `expenses` | Transactions (E2EE amount/sub/note; plaintext metadata) |
| `events` | `events` | Schedule events and reminders (plaintext) |
| `todo_lists` | `todoLists` | Named to-do lists with embedded tasks (plaintext) |
| `consent` | `consent` | Data-sharing opt-in flag |
| `auth_nonces` | `authNonces` | Sign-in challenge nonces (TTL on `expiresAt`) |
| `sessions` | `sessions` | HttpOnly session tokens (hashed; TTL on `expiresAt`) |
| `reminder_logs` | `reminderLogs` | Dedupes sent schedule reminder emails |

## Development

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000). The SPA and API share the same origin (`/api/*`).

When `CRON_SECRET` is set in development, the server also polls every 15 minutes for due reminders and recurring expense rows (emails require `RESEND_API_KEY`).

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

### Encryption

Ledger data (transaction amounts, subcategories, notes, and per-wallet budgets/income) is encrypted in your browser with **AES-256-GCM**. The encryption key is derived from a wallet signature over a fixed message — it never leaves your device and is held in memory for the session only.

On each visit you may be prompted to **unlock** your ledger (one signature for browser wallets; silent for in-app wallets with a stored key). MongoDB stores ciphertext plus plaintext metadata needed for queries and cron (`date`, `kind`, `recurring`, `walletId`, `seriesKey` on expenses; wallet name/currency on wallets). See [Database schema](#database-schema) for full field lists.

## API overview

| Route | Description |
|-------|-------------|
| `GET /api/ping` | Runtime probe |
| `GET /api/health` | Service and DB status |
| `POST /api/auth/challenge` | Start sign-in |
| `POST /api/auth/verify` | Complete sign-in |
| `GET /api/auth/me` | Current session |
| `GET /api/auth/sessions` | List active sessions |
| `DELETE /api/auth/sessions/:id` | Revoke a session |
| `DELETE /api/auth/sessions` | Revoke all other sessions |
| `POST /api/auth/logout` | End current session |
| `POST /api/auth/clear` | Revoke all sessions and clear cookie |
| `GET/PATCH /api/users/me` | Codename, notify email, timezone, reminder prefs |
| `POST /api/users` | Create or upsert user profile on first sign-in |
| `GET/PATCH /api/profile` | Per-user UI state (`currentMonth` only) |
| `CRUD /api/wallets` | Financial wallets (metadata + E2EE `enc`/`payload` via PATCH) |
| `PUT /api/wallets/:id/budgets` | Update encrypted wallet financials (`enc`/`payload`) |
| `GET/PUT /api/categories` | Category taxonomy |
| `CRUD /api/expenses` | Transactions (scoped by wallet) |
| `CRUD /api/events` | Schedule events |
| `POST /api/events/:id/comments` | Add event comment |
| `CRUD /api/todo-lists` | TO-DO lists and tasks |
| `GET/PATCH /api/consent` | Data-sharing consent |
| `GET /api/fx/latest/:base` | Cached FX rates (requires `EXCHANGE_RATE_API_KEY`) |
| `GET /api/cron/reminders` | Auth: `Authorization: Bearer $CRON_SECRET`. Sends due reminder emails and materializes recurring expense rows |

All mutating routes require a valid session cookie. Auth endpoints have stricter rate limits.

## Production (self-hosted)

```bash
bun run build   # static frontend → dist/; API bundle → api/index.js
bun start       # NODE_ENV=production
```

Set `NODE_ENV=production` so session cookies are marked `Secure` over HTTPS.

## Deploy on Vercel

The API is bundled into `api/index.js` during `bun run build` so Vercel can resolve TypeScript path aliases at runtime. Scheduled tasks (reminder emails and recurring expenses) are triggered by an external cron job — see [Scheduled tasks (cron-job.org)](#scheduled-tasks-cron-joborg) below.

### Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** for Production and Preview:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | Atlas `mongodb+srv://…` connection string |
| `MONGODB_DB` | Database name (default: `ledger`) |
| `APP_ORIGIN` | Public app URL, e.g. `https://your-project.vercel.app` (used in sign-in messages) |
| `NODE_ENV` | `production` (Vercel usually sets this; enables `Secure` session cookies) |
| `CRON_SECRET` | Secret for the daily cron handler (used by cron-job.org) |
| `RESEND_API_KEY` | Optional — enable schedule reminder emails |
| `EMAIL_FROM` | Optional — verified sender in Resend |
| `EXCHANGE_RATE_API_KEY` | Optional — enable FX conversion in Insights |

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

### Scheduled tasks (cron-job.org)

Vercel Hobby allows only one built-in cron job, so reminders and recurring expenses are triggered by [cron-job.org](https://cron-job.org) instead.

1. Create a free account at [cron-job.org](https://console.cron-job.org/signup).
2. **Create cronjob** with:
   - **Title:** e.g. `Sched Ledger reminders`
   - **URL:** `https://<your-app>.vercel.app/api/cron/reminders`
   - **Schedule:** daily at **16:00 UTC** (cron expression `0 16 * * *`)
   - **Request method:** `GET`
   - **Request headers:** add `Authorization` with value `Bearer <CRON_SECRET>` (same secret as in Vercel env vars)
3. Save and enable the job.

Manual test:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://<your-app>.vercel.app/api/cron/reminders"
```

Expect `{ "ok": true, "reminders": { ... }, "recurring": { ... } }`.

### Verify after deploy

1. **Health check** — `GET https://<your-app>.vercel.app/api/health` should return `{ "ok": true, "service": "ledger-api", "db": "connected" }`.
2. **Sign-in** — open the app, create or restore a wallet, complete the sign-in challenge, and confirm you land in the main UI.
3. **CRUD** — add an expense and a schedule event; refresh the page and confirm data persists.
4. **Wallets** — create a second wallet, switch between them, and confirm transactions stay scoped.
5. **Sessions** — open **Account → Data & privacy**, confirm your device appears in the session list, and test revoke / sign out.

### Serverless notes

- Rate limiting, profile cache, and FX cache are in-memory per function instance (acceptable for v1).
- Cold starts may add latency on the first request while MongoDB connects; warm instances reuse the cached client.

## License

See [LICENSE](LICENSE).
