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

## Production

```bash
bun run build   # static frontend → dist/
bun start       # NODE_ENV=production
```

Set `NODE_ENV=production` so session cookies are marked `Secure` over HTTPS.

## License

See [LICENSE](LICENSE).
