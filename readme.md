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
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b` then `vite build` |
| `npm run preview` | Preview production build |
| `npm run check` | TypeScript build check (`tsc -b`) |
| `npm test` | Run backend self-check (`api/` tests) |

### `api/` (backend)

| Command | Description |
|---------|-------------|
| `npm run dev` | tsx watch with `.env` |
| `npm run build` | `tsc` → `dist/` |
| `npm run start` | Run built `dist/server.js` with `.env` |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed DB (owner + base data) |
| `npm run check` | `tsc --noEmit` type check |
| `npm test` | sales-rules self-check |

## Environment (`api/.env`)

See [`api/.env.example`](api/.env.example).

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://postgres:password@localhost:54322/postgres` |
| `SESSION_SECRET` | Yes (prod) | Cookie session secret, >=32 chars in production | random 32+ char string |
| `APP_URL` | Yes (prod) | Allowed CORS origin (frontend URL) | `http://localhost:3000` |
| `NODE_ENV` | No | `development` / `production` | `development` |
| `OWNER_EMAIL` | Seed only | Initial owner account email | `owner@pos.local` |
| `OWNER_PASSWORD` | Seed only | Initial owner password | `change-me` |
| `OWNER_NAME` | Seed only | Initial owner display name | `Owner` |
| `PORT` | No | Backend port (default 4000) | `4000` |

## API

All routes prefixed `/api`. Health: `GET /api/health` → `{ status: "ok" }`.

Modules: `auth`, `categories`, `products`, `users`, `settings`, `shifts`, `sales`, `stock`, `reports`, `audit`.

## Notes

- Sessions via signed cookies (`@fastify/cookie`). Login rate-limited.
- CORS restricted to `APP_URL`; no localhost fallback in production.
- `SESSION_SECRET` < 32 chars and missing `APP_URL` throw on production boot.
