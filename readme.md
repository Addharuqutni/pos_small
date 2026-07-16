# POS-Web

Point-of-Sale web app. React 19 + Vite frontend, Fastify + Drizzle + PostgreSQL backend.

## Stack

- **Frontend:** React 19, Vite 6, React Router 7, TanStack Query 5, TailwindCSS 3, react-hook-form + zod
- **Backend:** Fastify 5, Drizzle ORM, PostgreSQL, bcrypt sessions (cookie), zod validation
- **Tooling:** TypeScript 5, drizzle-kit

## Structure

```
POS/
├── src/                  # React frontend
│   ├── pages/
│   │   ├── auth/         # login
│   │   ├── cashier/      # POS, shift open/close, sale detail (role: cashier)
│   │   └── dashboard/    # products, categories, stock, sales, reports, users, settings, shifts (role: owner/admin)
│   ├── components/       # ui, layout, receipt
│   ├── contexts/         # auth, cart
│   └── lib/              # api client, query keys, utils
├── api/                  # Fastify backend
│   └── src/
│       ├── server.ts     # app bootstrap, route registration
│       ├── modules/      # auth, categories, products, users, settings, shifts, sales, stock, reports, audit
│       ├── db/           # schema.ts, client.ts
│       ├── lib/          # auth, validation, errors, audit, sales-rules
│       └── seed.ts
└── docs/                 # design specs + plans
```

## Roles

- **cashier** — POS screen, shift open/close, own sale detail
- **owner / admin** — dashboard: products, categories, stock, sales, reports, users, settings, shift reports

## Getting Started

### Prerequisites

- Node 20+, npm
- PostgreSQL (local or Supabase)

### Backend (`api/`)

```bash
cd api
npm install
cp .env.example .env      # fill DATABASE_URL, SESSION_SECRET (>=32 chars in prod), APP_URL, owner creds
npm run db:generate       # generate migrations
npm run db:migrate        # apply migrations
npm run db:seed           # seed owner + base data
npm run dev               # http://localhost:4000
```

### Frontend (root)

```bash
npm install
npm run dev               # http://localhost:3000 (Vite)
```

## Commands

### Root (frontend)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Run the frontend TypeScript build check, then create a production Vite build |
| `npm run preview` | Preview the production build |
| `npm run check` | Frontend TypeScript build check (`tsc -b`) |
| `npm test` | Run the backend sales-rules self-check through `api/` |

### `api/` (backend)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Fastify server with `tsx` watch mode and `.env` |
| `npm run build` | Compile the backend to `dist/` |
| `npm run start` | Run the compiled `dist/server.js` with `.env` |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed the owner account and default settings row |
| `npm run check` | Backend TypeScript check (`tsc --noEmit`) |
| `npm test` | Run `src/lib/sales-rules.self-check.ts` (a standalone self-check, not a test runner) |

## Environment (`api/.env`)

See [`api/.env.example`](api/.env.example).

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://postgres:password@localhost:54322/postgres` |
| `SESSION_SECRET` | Yes (prod) | HMAC signing secret for the `sid` cookie; must be at least 32 characters in production | random 32+ character string |
| `APP_URL` | Yes (prod) | Allowed CORS origin (frontend URL) | `http://localhost:3000` |
| `NODE_ENV` | No | `development` or `production` | `development` |
| `OWNER_EMAIL` | Seed only | Initial owner account email | `owner@pos.local` |
| `OWNER_PASSWORD` | Seed only | Initial owner password | `change-me` |
| `OWNER_NAME` | Seed only | Initial owner display name | `Owner` |
| `PORT` | No | Backend port (defaults to `4000`) | `4000` |

## API

All routes are prefixed with `/api`. Authentication is required unless noted. The health check is public: `GET /api/health` → `{ status: "ok" }`.

| Module | Endpoints | Access |
|--------|-----------|--------|
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Login is public; logout and current-user lookup require authentication |
| Categories | `GET /api/categories`, `POST /api/categories`, `PATCH /api/categories/:id` | Read: authenticated; write: owner/admin |
| Products | `GET /api/products`, `GET /api/products/:id`, `POST /api/products`, `PATCH /api/products/:id` | Read: authenticated; write: owner/admin |
| Users | `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id`, `POST /api/users/:id/reset-password` | Authenticated; management actions are role-restricted |
| Settings | `GET /api/settings`, `PATCH /api/settings` | Read: authenticated; write: owner/admin |
| Shifts | `POST /api/shifts/open`, `GET /api/shifts/active`, `POST /api/shifts/close`, `GET /api/shifts`, `GET /api/shifts/report` | Shift operations: authenticated; report: owner/admin |
| Sales | `POST /api/sales`, `GET /api/sales`, `GET /api/sales/:id`, `POST /api/sales/:id/void`, `POST /api/sales/:id/refund` | Sale operations: authenticated; void/refund: owner/admin |
| Stock | `GET /api/stock/movements`, `POST /api/stock/adjust` | Read: authenticated; adjustment: owner/admin |
| Reports | `GET /api/reports/sales`, `GET /api/reports/products`, `GET /api/reports/low-stock` | Authenticated; report access is role-restricted where applicable |
| Audit | `GET /api/audit` | Owner/admin |

## Notes

- The `sid` cookie contains a session identifier; sessions are persisted in the database and cached briefly in memory. `SESSION_SECRET` signs the cookie via `@fastify/cookie`.
- The API enforces a global limit of 100 requests per minute. Login has a tighter in-memory limit of five attempts per minute per IP/email pair.
- CORS is restricted to `APP_URL`; production does not fall back to localhost.
- In production, startup fails when `SESSION_SECRET` is missing or shorter than 32 characters, or when `APP_URL` is missing.
- When `VERCEL` is set, the standalone `app.listen` call is skipped so the app can be initialized by a serverless entrypoint. The repository currently documents that integration in `api/src/server.ts`; configure the platform entrypoint separately.
