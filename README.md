# Sched Ledger

Private expense ledger, schedule, and to-do app. Track spending across multiple wallets and currencies, plan events with email reminders, and sign in with a Web3 wallet — no email or password required.

Built with **Bun**, **Hono**, **MongoDB**, and **React**.

![Sched Ledger](src/frontend/assets/logo.png)

## Features

### Ledger

- **Overview, transactions, budgets, insights, recurring** — monthly expense tracking with charts, category breakdowns, and budget progress
- **Calculator** — client-side budgeting helper: deduct custom tax lines from income, allocate net by category %, then apply to wallet budgets with confirmation; includes Malaysia-oriented presets (EPF / SOCSO / EIS / PCB ballpark / SST) that never leave the browser
- **Multiple wallets** — create wallets in 29 currencies; monthly-income or starting-balance funding modes
- **Custom categories** — editable expense and income category/subcategory taxonomy with glyphs and colors
- **Recurring transactions** — monthly, quarterly, or yearly; auto-posted on due dates via cron-job.org
- **Insights** — FX conversion, month-over-month charts (daily/monthly/quarterly/yearly), and spending habits (unlock after five active transaction days)

### Schedule & tasks

- **Schedule** — calendar and agenda for bills, appointments, and reminders with recurrence (daily/weekly/monthly/yearly)
- **Log payment** — from a bill/renewal event, open a prefilled expense and link `eventId` ↔ `expenseId` (plaintext metadata only)
- **Email reminders** — optional Resend emails with per-event lead times and user timezone; confirmation when you enable notify; titles stay encrypted (emails use a generic subject)
- **TO-DO lists** — multiple named lists with inline task management

### Identity & privacy

- **Web3 identity** — create or restore an in-browser wallet (12- or 24-word recovery phrase); sign in with a cryptographic challenge (SIWE-style). Prefer a **ledger-only** key so the auth address is not correlated with on-chain activity
- **Device passphrase vault** — recovery phrase quiz on create; in-app keys wrapped with a local passphrase (PBKDF2 + AES-GCM) instead of plaintext `localStorage`; WebAuthn wrapping can come later
- **Dark mode** — system-aware theme toggle, persisted locally
- **Sessions & privacy** — HttpOnly session cookies with sliding token rotation, revoke devices, clear local data, and third-party data-sharing consent under **Account → Data & privacy**
- **Encrypted backup** — download/restore a full ledger pack encrypted with your ledger key (client-only; not stored on the server) via **Account → Exports & imports**
- **CSV export & import** — transactions (with categories), schedule events, and to-do lists (plaintext spreadsheet portability)
- **Encrypted ledger** — amounts, wallet names, categories, notes, schedule titles, and to-dos encrypted client-side; unlock with your wallet key each session
- **PWA read cache** — installable app shell + IndexedDB ciphertext cache for offline reads (writes still require the network)
- **Budget alerts** — email when a category nears or exceeds its monthly budget (E2EE-safe: client evaluates and sends names/amounts; server only delivers)
- **Transparency** — in-app map of hosting roles, what the server can infer, MongoDB collections, E2EE vs plaintext fields, and data relationships (Mermaid diagrams)
- **Guided tour** — Shepherd.js walkthrough for each main view

### Security

- **End-to-end encryption** — ledger content (transactions, wallet names/budgets, category trees, event titles/comments, and to-do lists) is AES-256-GCM encrypted in the browser before reaching MongoDB; the server only stores ciphertext (plus plaintext schedule/email metadata needed for accurate reminder cron — day-level dates are intentional)
- Ownership uses opaque `accountId` (`users._id`); the SIWE address stays on `users` for login only
- New document ids are random ObjectIds (no embedded creation timestamp)
- Signature verification, rate limiting, security headers, in-memory profile cache
- Automated tests for crypto unlock/codec, device vault, encrypted backup, reminder email privacy, calculator, spending habits, session auth, and budget-alert evaluation (`bun test`)

## Tech stack

| Layer | Stack |
|-------|--------|
| Runtime | [Bun](https://bun.sh) |
| API | [Hono](https://hono.dev) + Zod validation |
| Database | [MongoDB](https://www.mongodb.com) |
| Frontend | React 19, TanStack Query, ethers v6 |
| Styling | Custom theme CSS (`ledger.css`) |
| Tours | [Shepherd.js](https://shepherdjs.dev) |
| Diagrams | [Mermaid](https://mermaid.js.org) (Transparency view) |
| Deploy | [Vercel](https://vercel.com) **hosting + Analytics / Speed Insights only** (no Vercel Cron); scheduled jobs via [cron-job.org](https://cron-job.org) |
| PWA | `public/manifest.webmanifest` + `public/sw.js` (copied into `dist/` on build) |

## Project structure

```
api/index.ts              # Vercel serverless entry (re-exports bundled handler)
src/
├── index.ts              # Bun dev/prod server (API + SPA)
├── index.html
├── vercel-api.ts         # API bundle source (built → api/index.js)
├── api/
│   ├── app.ts            # Hono app + error handler
│   ├── lib/              # auth, cache, email, reminders, recurring-expenses,
│   │                     # budget-alerts, expense-delete-scope, ids, serialize, errors
│   ├── middleware/       # session, rate-limit, security, db
│   └── routes/           # auth, users, profile, wallets, categories,
│                         # expenses, events, todo-lists, consent,
│                         # budget-alerts, fx, cron
├── db/                   # MongoDB client, collections, indexes, URI resolver
├── schemas/              # Zod schemas (shared API validation)
├── lib/                  # glyphs, recurring, schedule, timezone, budget-alerts (shared)
└── frontend/
    ├── app/              # Root, LedgerApp
    ├── auth/             # wallet sign-in, device vault, backups, account menu, session UI
    ├── assets/           # logo
    ├── charts/           # SVG charts (donut, trend, MoM bars)
    ├── components/       # Brand, ThemeToggle, Wallets, pickers, shared UI
    ├── lib/
    │   ├── budget/         # in-tab budget-alert notifications
│   ├── crypto/         # E2EE codec, key derivation, unlock flow
│   ├── pwa/            # service worker registration + IndexedDB cipher cache
│   ├── hooks/          # useLedger, useTheme
│   └── tour/           # guided tour steps and runner
    ├── styles/           # ledger.css (theme tokens + layout)
    ├── views/            # Overview, Transactions, Budgets, Calculator, Categories,
    │                     # Recurring, Insights, Schedule, TodoList, Transparency
    └── main.tsx
scripts/                  # MongoDB collection maintenance (drop/list)
tests/                    # auth, crypto, calculator, spending habits, schedule tests
build.ts                  # Production build (dist/ + api/index.js)
```

## Setup

```bash
bun install
```

Create a `.env` file in the project root (see `.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `MONGODB_DB` | No | Database name (default: `ledger`) |
| `APP_ORIGIN` | No | Origin embedded in sign-in messages (default: request origin) |
| `APP_TIMEZONE` | No | Server default IANA timezone for cron/reminders (fallback: `Asia/Kuala_Lumpur`) |
| `CRON_SECRET` | For cron | Bearer token for `GET /api/cron/reminders` |
| `RESEND_API_KEY` | For email | Resend API key for schedule reminders and budget alerts |
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

MongoDB database name defaults to `ledger` (`MONGODB_DB`). User-owned documents are keyed by opaque `accountId` (`users._id` hex). The SIWE wallet `address` lives on `users` (and `auth_nonces`) for login only. Every collection also has `_id` (`ObjectId`) and, where noted, `createdAt` / `updatedAt`.

Schemas are defined in `src/schemas/` and wired in `src/db/collections.ts`. Indexes are created on connect via `src/db/indexes.ts`.

### Collections

| MongoDB collection | Code key | Purpose |
|------------------|----------|---------|
| `users` | `users` | Account profile (codename, notify email, timezone, reminder/alert prefs) |
| `ledger_profiles` | `ledgerProfiles` | Per-user UI state (`currentMonth`) |
| `financial_wallets` | `financialWallets` | Wallets (currency, funding mode; E2EE financials) |
| `category_taxonomies` | `categoryTaxonomies` | One document per user — E2EE category tree |
| `expenses` | `expenses` | Transactions (E2EE amount/sub/note; plaintext metadata) |
| `events` | `events` | Schedule events (E2EE title/comments; plaintext schedule + email for reminders) |
| `todo_lists` | `todoLists` | Named to-do lists (E2EE name/icon/tasks) |
| `consent` | `consent` | Data-sharing opt-in flag |
| `auth_nonces` | `authNonces` | Sign-in challenge nonces (TTL on `expiresAt`) |
| `sessions` | `sessions` | HttpOnly session tokens (hashed; TTL on `expiresAt`) |
| `reminder_logs` | `reminderLogs` | Dedupes sent schedule reminder emails |
| `budget_alert_logs` | `budgetAlertLogs` | Dedupes budget-near-limit email delivery |

### Encryption vs plaintext

| Collection | Encrypted (client-side) | Plaintext (needed for queries / cron) |
|------------|-------------------------|----------------------------------------|
| `expenses` | `payload` (amount, subcategory, note) via `enc` | `accountId`, `date`, `kind`, `recurring`, `walletId`, `seriesKey`, `skipped`, optional `eventId` |
| `financial_wallets` | `payload` (name, income, starting balance, budgets) via `enc` | `accountId`, `currency`, `fundingMode`, `isDefault` |
| `category_taxonomies` | `payload` (full `categories[]` tree) via `enc` | `accountId` |
| `events` | `payload` (title, comments, customLabel/Glyph) via `enc` | `accountId`, `catId`, schedule fields (`exceptDates`, `until`, …), `notify`, `lead`, `email`, optional `expenseId` |
| `todo_lists` | `payload` (name, icon, tasks) via `enc` | `accountId` |
| `users` | — | `address` (SIWE login), notify prefs |
| `sessions` | — | `accountId`, hashed token (rotated on sliding renewal) |

Owned collections use opaque `accountId` (`users._id` hex). Run `bun scripts/backfill-account-id.ts` once after upgrading an existing database.

The in-app **Transparency** view documents hosting roles, what the server can infer, and the same collections with example field shapes.

## Development

```bash
bun dev
bun test   # crypto, reminders, calculator, spending habits, session auth, budget alerts
```

Open [http://localhost:3000](http://localhost:3000). The SPA and API share the same origin (`/api/*`).

When `CRON_SECRET` is set in development, the server also polls every 5 minutes for due reminders and recurring expense rows. Reminder delivery needs `RESEND_API_KEY`; recurring expense materialization runs regardless.

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

Manage sessions under **Account → Data & privacy** (revoke devices, sign out everywhere, clear cookies and local storage). Restore access on a new device with your **12- or 24-word recovery phrase**, then set a **device passphrase** so the key is encrypted on that browser.

### Encryption

Ledger data (transaction amounts, categories, notes, schedule titles, to-do lists, and per-wallet budgets/income) is encrypted in your browser with **AES-256-GCM**. The encryption key is derived from a wallet signature over a fixed message — it never leaves your device and is held in memory for the session only.

In-app wallet secrets (mnemonic / private key) are wrapped with a **device passphrase** (PBKDF2 + AES-GCM) in `localStorage` — not stored as plaintext. Injected browser wallets never store a private key locally.

On each visit you may be prompted to **unlock** your ledger (device passphrase and/or a wallet signature). MongoDB stores ciphertext plus plaintext metadata needed for queries and cron — see [Encryption vs plaintext](#encryption-vs-plaintext). Prefer the honest framing **encrypted cloud sync**, not “data stays on your device.”

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
| `GET/PATCH /api/users/me` | Codename, notify email, timezone, reminder/alert prefs |
| `GET /api/users/:address` | Own profile only (session-gated; other addresses forbidden) |
| `POST /api/users` | Create or upsert user profile on first sign-in |
| `GET/PATCH /api/profile` | Per-user UI state (`currentMonth` only) |
| `CRUD /api/wallets` | Financial wallets (metadata + E2EE `enc`/`payload` via PATCH) |
| `PUT /api/wallets/:id/budgets` | Update encrypted wallet financials (`enc`/`payload`) |
| `GET/PUT /api/categories` | Category taxonomy |
| `CRUD /api/expenses` | Transactions (scoped by wallet; optional series delete scopes) |
| `CRUD /api/events` | Schedule events (comments live in the E2EE payload on create/update) |
| `CRUD /api/todo-lists` | TO-DO lists and tasks |
| `GET/PATCH /api/consent` | Data-sharing consent |
| `POST /api/budget-alerts` | Deliver client-evaluated budget alerts (email; deduped) |
| `GET /api/fx/latest/:base` | Cached FX rates (requires `EXCHANGE_RATE_API_KEY`) |
| `GET /api/cron/reminders` | Auth: `Authorization: Bearer $CRON_SECRET`. Sends due reminder emails and materializes recurring expense rows |

All mutating routes require a valid session cookie. Auth endpoints have stricter rate limits.

## Production (self-hosted)

```bash
bun run build   # static frontend → dist/; API bundle → api/index.js
NODE_ENV=production bun src/index.ts
```

Set `NODE_ENV=production` so session cookies are marked `Secure` over HTTPS. For Vercel, deploy the build output instead — see below.

## Deploy on Vercel

The API is bundled into `api/index.js` during `bun run build` so Vercel can resolve TypeScript path aliases at runtime. Scheduled tasks (reminder emails and recurring expenses) are triggered by an external cron job — see [Scheduled tasks (cron-job.org)](#scheduled-tasks-cron-joborg) below.

### Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** for Production and Preview:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | Atlas `mongodb+srv://…` connection string |
| `MONGODB_DB` | Database name (default: `ledger`) |
| `APP_ORIGIN` | Public app URL, e.g. `https://your-project.vercel.app` (used in sign-in messages) |
| `APP_TIMEZONE` | Optional — server default IANA timezone for cron/reminders (fallback: `Asia/Kuala_Lumpur`) |
| `NODE_ENV` | `production` (Vercel usually sets this; enables `Secure` session cookies) |
| `CRON_SECRET` | Secret for the cron handler (used by cron-job.org) |
| `RESEND_API_KEY` | Optional — enable schedule reminder emails and budget-alert emails |
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

Vercel is used for **hosting and Analytics / Speed Insights only** — it does not schedule jobs. Reminders and recurring expenses are triggered solely by [cron-job.org](https://cron-job.org) calling the hosted API.

The reminder handler does not use a fixed daily schedule. It polls the database on each run and delivers email when the current time falls in each event's window: **remind-at − 5 min ≤ now ≤ remind-at + 5 min** (so a reminder can fire slightly early). Set the external job to run **every 5 minutes**. Each poll is **batched** (document limits + ~22s time budget) so it stays under the ~30s cron-job.org / Vercel function timeout.

1. Create a free account at [cron-job.org](https://console.cron-job.org/signup).
2. **Create cronjob** with:
   - **Title:** e.g. `Sched Ledger reminders`
   - **URL:** `https://<your-app>.vercel.app/api/cron/reminders`
   - **Schedule:** every **5 minutes** (cron expression `*/5 * * * *`)
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
6. **Exports** — open **Account → Exports & imports** to download an encrypted backup and/or CSV, then re-import.
7. **Transparency** — open the Transparency view and confirm hosting, inference, and collection maps render.
8. **Log payment** — create a bill event, use **Log payment**, and confirm the expense links back to the event.

### Serverless notes

- Rate limiting, profile cache, and FX cache are in-memory per function instance (acceptable for v1).
- Cold starts may add latency on the first request while MongoDB connects; warm instances reuse the cached client.

## License

[GNU General Public License v3.0](LICENSE).
