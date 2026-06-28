# CSCP — Construction Supply Chain Platform

A B2B procurement and delivery platform built as a Turborepo monorepo:
contractors order materials from suppliers, suppliers dispatch drivers,
payments are held in an escrow ledger, and live GPS tracking + in-thread
messaging tie everyone together.

This document is the full developer handoff. If you are picking up the
project for the first time, read it top to bottom — by the end you should
have everything running locally and understand where to find things.

---

## 1. Stack at a glance

| Layer        | Technology                                                                 |
| ------------ | -------------------------------------------------------------------------- |
| Monorepo     | Turborepo + npm workspaces                                                 |
| Backend      | NestJS 10, Socket.IO, Prisma 5, PostgreSQL, JWT, Multer                    |
| Frontends    | Next.js 14 (App Router), React 18, Leaflet/react-leaflet, lucide-react     |
| Realtime     | Socket.IO namespaces `/messaging` and `/tracking`                          |
| Shared types | `packages/types` published in-workspace as `@cscp/types`                   |
| Auth         | JWT access (15m) + refresh (7d), bcrypt password hashing, OTP phone verify |
| Storage      | Local disk under `apps/api/uploads` (dev). Ephemeral on Render free tier.  |
| Hosting      | Render (API) + Neon (Postgres) + Vercel (4 frontends)                      |

---

## 2. Repository layout

```
supplyChain/
├── apps/
│   ├── api/                NestJS backend (port 4001)
│   │   ├── src/            Modules: auth, users, profile, projects,
│   │   │                   catalog, orders, messaging, notifications,
│   │   │                   tracking, prisma
│   │   ├── prisma/         schema.prisma + migrations + seed scripts
│   │   ├── uploads/        Runtime upload directory (gitignored)
│   │   └── package.json
│   ├── web-contractor/     Next.js portal (port 4002)
│   ├── web-supplier/       Next.js portal (port 4003)
│   ├── web-admin/          Next.js portal (port 4004)
│   └── web-driver/         Next.js portal (port 4005)
├── packages/
│   └── types/              Shared TS types (@cscp/types)
├── docker-compose.yml      Local Postgres (5432) + Redis (6380, unused)
├── turbo.json              Turbo pipeline definition
├── package.json            Workspace root, runs Turbo + Prisma scripts
├── CONTRACTORS.md          Seeded contractor credentials
├── SUPPLIERS.md            Seeded supplier credentials
└── README.md               (this file)
```

Each Next.js app is independent — they share **no** runtime code, only the
type package. Patterns repeat across apps (e.g. `lib/auth.ts`,
`lib/api.ts`, `contexts/CurrentUserContext.tsx`,
`contexts/SocketContext.tsx`, `contexts/MessagingContext.tsx`).

---

## 3. Prerequisites

Install these on the developer machine:

| Tool          | Version          | Notes                                        |
| ------------- | ---------------- | -------------------------------------------- |
| Node.js       | **>= 20.x LTS**  | API uses `@types/node@20`, web apps the same |
| npm           | **>= 10.x**      | Ships with Node 20                           |
| PostgreSQL    | 15+              | Use Docker (recommended) or Neon             |
| Git           | any recent       |                                              |
| Docker Engine | optional but recommended for the local DB        |

Editor: VS Code with the **Prisma**, **ESLint**, and **Tailwind / PostCSS
Language Support** extensions is the smoothest setup.

> The repo uses npm **workspaces** — do not use Yarn or pnpm; lockfile is
> `package-lock.json`.

---

## 4. First-time local setup

Run from the repo root.

### 4.1 Clone & install

```bash
git clone <repo-url> supplyChain
cd supplyChain
npm install
```

`npm install` walks every workspace and installs everything in one pass.
It also runs `apps/api`'s `postinstall` hook which executes
`npx prisma generate` — so the Prisma client is built from
`apps/api/prisma/schema.prisma` automatically.

If you see TypeScript errors about `@prisma/client` later, re-run:

```bash
cd apps/api && npx prisma generate
```

### 4.2 Start a local Postgres

The fastest path is Docker:

```bash
docker compose up -d postgres
```

This brings up Postgres 15 on `localhost:5432` with:
- user: `cscp`
- password: `cscp_dev_pass`
- database: `cscp_dev`

(There is also a Redis service in `docker-compose.yml`, but **nothing in
the codebase uses Redis** — it is parked for future use. You can ignore it.)

If you prefer a manual install, create the same user/db with `psql`.

### 4.3 Create `apps/api/.env`

The file is gitignored. Create it with at least these variables:

```bash
# apps/api/.env

# --- Database ---
DATABASE_URL="postgresql://cscp:cscp_dev_pass@localhost:5432/cscp_dev?schema=public"

# --- JWT ---
JWT_SECRET="change-me-dev-access-secret"
JWT_REFRESH_SECRET="change-me-dev-refresh-secret"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# --- Server ---
PORT=4001
NODE_ENV=development

# --- Uploads ---
UPLOAD_DIR=./uploads

# --- Optional: override seeded admin creds ---
ADMIN_EMAIL="admin@cscp.dev"
ADMIN_PHONE="+10000000000"
ADMIN_PASSWORD="Admin@1234!"

# --- Optional: additional CORS origins (comma-separated, no trailing slash) ---
# CORS_ORIGINS="https://my-preview.vercel.app,https://staging.example.com"
```

Notes:
- Local frontends on ports 4002–4005 are CORS-whitelisted by default in
  `apps/api/src/main.ts`; `CORS_ORIGINS` is only needed in production.
- Pick any random strings for the JWT secrets locally; they only need to
  be stable across restarts so existing access tokens stay valid.

### 4.4 Run migrations + seed

From the repo root:

```bash
# Apply every migration in apps/api/prisma/migrations
npm run db:migrate

# Create the admin user (admin@cscp.dev / Admin@1234!)
npm run db:seed
```

The seeded admin appears immediately after `db:seed`. To populate demo
contractors/suppliers/drivers/catalog as well, run the extra scripts (one
at a time, in this order):

```bash
cd apps/api
npx ts-node -r tsconfig-paths/register prisma/seed_suppliers.ts
npx ts-node -r tsconfig-paths/register prisma/seed-contractors.ts
npx ts-node -r tsconfig-paths/register prisma/seed_drivers.ts
npx ts-node -r tsconfig-paths/register prisma/seed_master_products.ts
```

Credentials for those accounts are documented in `CONTRACTORS.md` and
`SUPPLIERS.md`. Default password for every seeded user: **`Password123!`**.

### 4.5 (Optional) Frontend env files

The four web apps read `NEXT_PUBLIC_API_URL`. In dev it defaults to
`http://localhost:4001/api`, so you only need an env file if you're
pointing at a non-default API. To override, create
`apps/web-<role>/.env.local` with:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4001/api
```

The same variable also drives the Socket.IO base URL (the `/api` suffix
is stripped at runtime).

### 4.6 Start everything

From the repo root:

```bash
npm run dev
```

Turbo launches all five `dev` scripts in parallel. You should see:

- API → `http://localhost:4001/api`
- Contractor portal → `http://localhost:4002`
- Supplier portal → `http://localhost:4003`
- Admin portal → `http://localhost:4004`
- Driver portal → `http://localhost:4005`

To run just one app instead, scope it:

```bash
npm run dev --workspace=@cscp/api
npm run dev --workspace=@cscp/web-contractor
```

Verify the API is alive:

```bash
curl -i -X POST http://localhost:4001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@cscp.dev","password":"Admin@1234!"}'
```

You should get back JSON containing `accessToken`, `refreshToken`, and a
`user` object.

---

## 5. Day-to-day commands

All scripts run from the repo root unless noted.

| Command                                | What it does                                                |
| -------------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                          | Start every app via Turbo                                   |
| `npm run build`                        | Build every app (`next build` + `nest build`)               |
| `npm run dev --workspace=@cscp/api`    | Start only the API in watch mode                            |
| `npm run db:migrate`                   | `prisma migrate dev` against `DATABASE_URL`                 |
| `npm run db:seed`                      | Run `apps/api/prisma/seed.ts` (admin user)                  |
| `npm run db:studio`                    | Open Prisma Studio on the dev DB                            |
| `npx tsc --noEmit` (in any app dir)    | Typecheck without emitting                                  |
| `docker compose up -d postgres`        | Start the local Postgres                                    |
| `docker compose down`                  | Stop containers (data persists in the `postgres_data` vol)  |

Useful one-offs:

```bash
# Reset the local DB (destructive)
cd apps/api && npx prisma migrate reset

# Generate a fresh Prisma client after editing schema.prisma
cd apps/api && npx prisma generate

# Inspect the DB schema visually
npm run db:studio
```

---

## 6. Application architecture

### 6.1 API (`apps/api`)

NestJS 10. Entry point `apps/api/src/main.ts` does:
- Sets the global prefix `/api`
- Mounts `apps/api/uploads` at `/uploads` for direct file access
- Adds a global `ValidationPipe` (`whitelist + transform`)
- Enables CORS for the local portals and any `CORS_ORIGINS`
- Listens on `PORT` (default 4001)

The `AppModule` imports these feature modules:

```
PrismaModule          Wraps PrismaService for DI
AuthModule            Registration, login, JWT issue/refresh, OTP, password reset
UsersModule           Admin user management, fleet (driver) management
ProfileModule         Authenticated user reads/updates their own profile
ProjectsModule        Contractor projects + requirements
CatalogModule         Master products, supplier catalog items, approval flow
OrdersModule          The order lifecycle (cart → delivered → released)
NotificationsModule   Per-user in-app notification stream
TrackingModule        Driver GPS history + `/tracking` Socket.IO gateway
MessagingModule       Conversations + messages + `/messaging` Socket.IO gateway
```

Cross-cutting plumbing:
- `@CurrentUser()` decorator (in `apps/api/src/auth/decorators`) injects
  the JWT payload from `req.user`.
- `JwtAuthGuard` for HTTP routes; `WsJwtGuard` for socket events.
- File uploads use `multer.diskStorage` writing into
  `apps/api/uploads/<bucket>/`. **Note:** the disk is ephemeral on Render
  free tier — uploads disappear on restart in production until you wire
  S3/Supabase/Cloudinary.

### 6.2 Database (Prisma)

Schema lives at `apps/api/prisma/schema.prisma`. 21 models, including:

```
User                       Single users table, distinguished by `role`
ContractorProfile          1-to-1 with User (role=CONTRACTOR)
SupplierProfile            1-to-1 with User (role=SUPPLIER)
DriverProfile              1-to-1 with User (role=DRIVER)
SupplierDriver             Join table — which drivers belong to which supplier
OtpToken / RefreshToken    Auth side-tables
Project / ProjectRequirement
MasterProduct              Global catalog item (admin-approved)
CatalogItem                Supplier's listing for a MasterProduct (price/stock)
Order / OrderItem          The order itself + per-line items
OrderLocation              GPS breadcrumb trail per order
EscrowTransaction          Falcon Escrow ledger entries (SECURED/HELD/RELEASED)
Notification               In-app notification feed
Conversation / ConversationParticipant / Message / MessageAttachment / MessageRead
```

Order status machine: `SUBMITTED → ACCEPTED → DISPATCHED → IN_TRANSIT → DELIVERED → COMPLETED`.
Escrow lifecycle: `SECURED → HELD → RELEASED`.

Migrations are SQL files under `apps/api/prisma/migrations/`. **Always
generate a migration via `npx prisma migrate dev` when changing the schema** —
never hand-edit committed migrations.

### 6.3 Auth flow

1. **Register** (contractor / supplier / driver) — creates a `User` plus
   the role-specific profile. Returns tokens immediately.
2. **OTP** — `POST /auth/resend-otp` issues a code to the phone (currently
   logged to the API console; SMS provider not wired). `POST /auth/verify-otp`
   marks `isVerified = true`.
3. **Login** — `POST /auth/login` with `{ email | phone, password }`,
   returns `{ accessToken, refreshToken, user }`.
4. **Refresh** — `POST /auth/refresh` with `{ refreshToken }` rotates both
   tokens.
5. **Logout** — `POST /auth/logout` revokes the refresh token server-side.

Frontends persist tokens to `localStorage` under:
- `cscp_access` (access JWT)
- `cscp_refresh` (refresh JWT)
- `cscp_user` (cached user profile)

`apiRequest()` in each app's `src/lib/api.ts` handles 401s by clearing
auth and bouncing to `/login`.

### 6.4 Realtime (Socket.IO)

Two namespaces, both authenticated via `WsJwtGuard` reading
`socket.handshake.auth.token`:

**`/messaging`** (`apps/api/src/messaging/messaging.gateway.ts`)
- Client emits: `joinConversation { conversationId }`
- Server emits: `messageCreated`, `conversationRead`
- Frontend usage: `MessagingProvider` joins every conversation room on
  connect (and re-joins on `connect` events after reconnects), so new
  messages arrive in real time across **all** threads — not just the open
  one.

**`/tracking`** (`apps/api/src/tracking/tracking.gateway.ts`)
- Driver client emits location updates while a trip is in progress
- Contractor/supplier/admin map subscribers receive `locationUpdated`

Each frontend has a `SocketProvider` (`apps/web-*/src/contexts/SocketContext.tsx`)
that lazily creates and shares one socket per namespace per session so we
never open duplicate connections.

### 6.5 Frontend shape (per app)

```
apps/web-<role>/
├── next.config.js / next-env.d.ts / tsconfig.json
├── src/
│   ├── app/
│   │   ├── (auth)/         Login / register / forgot-password
│   │   ├── dashboard/      Authenticated area (layout + nested routes)
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/         Reusable UI (NotificationCenter, GlobalSearch, …)
│   ├── contexts/           CurrentUserContext, SocketContext, MessagingContext,
│   │                       plus role-specific (CartContext, PendingOrdersContext)
│   └── lib/
│       ├── api.ts          fetch wrappers (`authApi`, `ordersApi`, …)
│       ├── auth.ts         localStorage token helpers
│       └── nav.ts          Sidebar nav definitions
```

Provider order in `dashboard/layout.tsx`:

```
CurrentUserProvider
  └─ SocketProvider
     └─ (role-specific providers)
        └─ MessagingProvider
           └─ DashboardLayoutInner
```

Auth tokens are read from `localStorage`. Both `CurrentUserContext` and
`MessagingContext` **start with the SSR-safe default and hydrate from
localStorage in a `useEffect`** to avoid Next.js hydration mismatches —
keep that pattern in any new client-only state.

---

## 7. HTTP API map

Base URL: `http://localhost:4001/api` (dev) or `https://cscp-api.onrender.com/api`
(prod). Auth header: `Authorization: Bearer <accessToken>`.

### Auth (`/auth`)

| Method | Path                       | Purpose                              |
| ------ | -------------------------- | ------------------------------------ |
| POST   | `/auth/register/contractor`| Contractor signup                    |
| POST   | `/auth/register/supplier`  | Supplier signup (status=PENDING)     |
| POST   | `/auth/register/driver`    | Driver signup                        |
| POST   | `/auth/login`              | Email/phone + password → tokens      |
| POST   | `/auth/logout`             | Revoke a refresh token               |
| POST   | `/auth/refresh`            | Rotate access + refresh              |
| POST   | `/auth/verify-otp`         | Mark phone as verified               |
| POST   | `/auth/resend-otp`         | Re-issue OTP                         |
| POST   | `/auth/forgot-password`    | Start password reset                 |
| POST   | `/auth/reset-password`     | Complete password reset              |
| POST   | `/auth/me`                 | Echo current user                    |
| POST   | `/auth/change-password`    | Change current password              |

### Profile (`/profile`)
`GET /profile` · `PATCH /profile`

### Users (`/users` — admin-only unless noted)
`GET /` · `GET /suppliers/pending` · `GET /fleet/my-drivers` (supplier) ·
`GET /me` · `PATCH /profile` · `GET /:id` · `PATCH /:id` · `PATCH /:id/status` ·
`PATCH /:id/verify-supplier` · `DELETE /fleet/drivers/:id`

### Projects (`/projects`)
`POST /` · `GET /` · `GET /:id` · `PATCH /:id` · `POST /:id/requirements`

### Catalog (`/catalog`)
- Marketplace: `GET /`, `GET /:id`
- Supplier-owned items: `GET /my`, `POST /`, `PATCH /:id`, `DELETE /:id`
- Master products: `GET /master-products`, `GET /master-products/pending`,
  `GET /master-products/my-submissions`, `POST /master-products/propose`,
  `PATCH /master-products/:id/approve` (admin), `PATCH /master-products/:id/reject`
  (admin), `POST /master-products` (admin), `PATCH /master-products/:id` (admin),
  `DELETE /master-products/:id` (admin)

### Orders (`/orders`)
- Create: `POST /`
- Role queries: `GET /contractor`, `GET /supplier`, `GET /supplier/stats`,
  `GET /driver`, `GET /admin`, `GET /admin/analytics`, `GET /drivers`
- Detail: `GET /:id`
- Lifecycle: `PATCH /:id/accept`, `PATCH /:id/assign-driver`,
  `PATCH /:id/driver-accept`, `PATCH /:id/driver-start-trip`,
  `PATCH /:id/driver-arrive`, `PATCH /:id/driver-submit-pod`,
  `PATCH /:id/confirm-delivery`, `PATCH /:id/set-driver-fee`,
  `PATCH /:id/release-funds`

### Notifications (`/notifications`)
`GET /` · `GET /unread-count` · `PATCH /:id/read` · `POST /read-all`

### Tracking (`/tracking`)
`GET /orders/:orderId/latest` · `GET /orders/:orderId/history`

### Messaging (`/messages`)
`GET /conversations` · `GET /orders/:orderId` · `GET /conversations/:id` ·
`POST /conversations/:id/messages` (multipart, attachments via Multer) ·
`POST /conversations/:id/read`

---

## 8. Seeded accounts (for local + Render demo)

All seeded users share password **`Password123!`** unless overridden.

| Role        | Login                                | Notes                          |
| ----------- | ------------------------------------ | ------------------------------ |
| Admin       | `admin@cscp.dev` / `Admin@1234!`     | Seeded by `npm run db:seed`    |
| Contractor  | `john.doe@buildit.com`               | See `CONTRACTORS.md` for the 5 |
| Supplier    | `sales@global-supplies.com`          | See `SUPPLIERS.md` for the 5   |
| Driver      | seeded by `seed_drivers.ts`          | Phone-based login              |

You can also log in by phone number on any portal — the seed files
include the phone for every account.

---

## 9. Production deployment (current setup)

This is the existing infrastructure. Nothing here needs to be re-built;
the section is for reference and access handoff.

### 9.1 Services

| Component | Provider | URL / project name                                  |
| --------- | -------- | --------------------------------------------------- |
| API       | Render   | `https://cscp-api.onrender.com`                     |
| Database  | Neon     | Postgres project in `us-east-1`                     |
| Contractor portal | Vercel | `https://falcon-web-contractor.vercel.app`     |
| Supplier portal   | Vercel | `https://falcon-web-supplier.vercel.app`       |
| Admin portal      | Vercel | `https://falcon-web-admin.vercel.app`          |
| Driver portal     | Vercel | `https://falcon-web-driver.vercel.app`         |

### 9.2 Render (API) configuration

- **Branch**: `main`
- **Build command**: `npm install && npm run build --workspace=@cscp/api`
- **Start command**: `npm run start:prod --workspace=@cscp/api`
  (this runs `prisma migrate deploy` before starting Node — new
  migrations apply on deploy automatically)
- **Env vars** (set in the Render dashboard):
  `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`,
  `JWT_REFRESH_EXPIRES_IN`, `NODE_ENV=production`,
  `CORS_ORIGINS` (comma-separated Vercel URLs, **no trailing slashes**).
- **Important**: `@nestjs/cli`, `typescript`, `prisma`, `@nestjs/schematics`,
  and `@types/node` are in `dependencies` (not `devDependencies`) on
  purpose — Render's production install strips devDeps, and the build
  needs them. **Do not move them back.**

### 9.3 Neon (Postgres) configuration

- Connection string lives only in Render env (`DATABASE_URL`) and in the
  local `apps/api/.env`.
- Postgres provider in `schema.prisma` — switching to anything else
  requires re-generating migrations.

### 9.4 Vercel (frontends) configuration

For each of the 4 Vercel projects:
- **Root Directory**: `apps/web-<role>` (e.g. `apps/web-contractor`)
- **Framework Preset**: Next.js
- **Build Command / Output**: Vercel defaults
- **Env var**: `NEXT_PUBLIC_API_URL = https://cscp-api.onrender.com/api`

When pushing to `main`, every Vercel project auto-deploys. The API
deploy on Render is separate and also triggers on `main`.

### 9.5 Free-tier caveats — read before any demo

- **Render free spins down after ~15 min idle**. First request after a
  pause hangs 30–60 s while the container boots. Always warm the API
  before a demo:

  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://cscp-api.onrender.com/api/auth/login
  ```

  (Returns 400 quickly once warmed — that's fine, we just want the
  container live.)

- **Uploads are ephemeral on Render**. Anything posted to `/uploads/...`
  in production disappears at the next deploy or cold-start. If real
  upload persistence is needed, swap `multer.diskStorage` for Supabase
  Storage / S3 / Cloudinary — this was deferred during initial setup.

- **Socket.IO over Render free** works fine but inherits the same cold
  start delay on first connect.

### 9.6 Releasing changes

1. Land changes on `main`.
2. Render builds + runs `prisma migrate deploy` + restarts the API.
3. Vercel rebuilds whichever portals had changes under their root dir.
4. After a schema change, check Render logs for migration output.
5. After a deploy, warm the API as above before publicising the new build.

---

## 10. Common tasks & where to look

| You want to…                          | Start here                                                       |
| -------------------------------------- | ---------------------------------------------------------------- |
| Add a new API endpoint                 | Pick a module under `apps/api/src/<module>`, follow the existing controller/service pattern, add DTO under `./dto/` |
| Add a Prisma model / column            | Edit `apps/api/prisma/schema.prisma`, run `npx prisma migrate dev --name <change>`, commit the new migration folder |
| Add a sidebar link in a portal         | Edit `apps/web-<role>/src/lib/nav.ts` + create the route under `src/app/dashboard/`                                |
| Add a shared TS type                   | `packages/types/src/index.ts` (no build step — it's a TS source ref)                                               |
| Inspect the DB                         | `npm run db:studio` (Prisma Studio)                              |
| Look at WS message wiring              | `apps/api/src/messaging/messaging.gateway.ts` + `apps/web-*/src/contexts/MessagingContext.tsx` |
| Look at order lifecycle logic          | `apps/api/src/orders/orders.service.ts` (status transitions live there) |
| Tune CORS for a new preview URL        | Add to Render `CORS_ORIGINS` env (no trailing slash, comma-separated) |

---

## 11. Troubleshooting

**`P1001: Can't reach database server`**
Postgres isn't running. `docker compose up -d postgres` or check `DATABASE_URL`.

**`PrismaClientInitializationError: prisma generate`**
Run `cd apps/api && npx prisma generate`. Happens after pulling schema changes
without reinstalling.

**`Module not found: Can't resolve '@prisma/client'`**
Same fix — `npx prisma generate` in `apps/api`.

**Login returns 401 with the seeded admin**
You probably reset the DB without re-seeding. Run `npm run db:seed` again.

**Hydration mismatch in a Next.js app**
Anything that reads `localStorage` / `window` during render needs to be moved
into `useEffect`. `CurrentUserContext` and `MessagingContext` are the reference
implementations of that pattern.

**Socket connects but no real-time messages arrive**
The client must `joinConversation` for the relevant `conversationId`.
`MessagingProvider` does that automatically for every conversation on load and
re-joins on reconnect; if you're writing a new realtime feature, follow that
same join-on-load + rejoin-on-`connect` pattern.

**CORS error from a deployed frontend**
Add the deployed URL to `CORS_ORIGINS` in the Render env (no trailing slash),
then restart the API service.

**Render says "deploy failed: cannot find module '@nestjs/cli'"**
Build deps were moved to `devDependencies`. Move them back into
`dependencies` in `apps/api/package.json`.

**Render is cold (request hangs 30–60 s)**
Free-tier idle spin-down. Warm with a `curl` to any endpoint and wait.

---

## 12. Conventions worth keeping

- **Workspaces only** — never `cd` into an app and run `npm install` there;
  always install from the repo root so the lockfile stays consistent.
- **Prisma migrations are append-only** — generate new ones; never edit
  committed SQL.
- **No SSR-only fetching of authenticated data** — everything authed lives
  inside `dashboard/` layouts which are client components reading
  `localStorage`.
- **Client-only initial state** must go in `useEffect`, not in `useState`'s
  lazy initializer (avoid hydration mismatches).
- **Realtime first, polling as backup** — the existing `MessagingContext`
  polls every 30 s only to recover from missed WS events; new features
  should follow the same pattern.
- **Don't put secrets in the repo** — `apps/api/.env` is gitignored and
  must stay that way.

---

## 13. Handoff checklist

Before declaring the new developer onboarded, they should:

- [ ] Clone the repo, `npm install`, bring up Postgres, seed the DB, run
      `npm run dev`, log in as the admin at `localhost:4004` and as a
      seeded contractor at `localhost:4002`.
- [ ] Create a one-line test order end-to-end (contractor places → supplier
      accepts → driver dispatched → delivered → funds released).
- [ ] Open two browser windows (contractor + supplier) on Messages and
      verify messages arrive in real time without clicking.
- [ ] Be added as a member on the Render service, Neon project, and the
      four Vercel projects.
- [ ] Receive the secret values for `apps/api/.env` out-of-band (Render
      env, JWT secrets, Neon connection string).
- [ ] Read `CONTRACTORS.md` and `SUPPLIERS.md` for demo credentials.

Welcome to CSCP — happy shipping.
