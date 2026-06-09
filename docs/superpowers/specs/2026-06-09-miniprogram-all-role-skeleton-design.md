# WeChat Mini Program All-Role Skeleton Design

## Purpose

Build the first slice of the WeChat Mini Program client: a thin, end-to-end skeleton that
exercises every foundation later feature slices will reuse. The skeleton proves the full path
from launch to a role-specific home:

```text
launch -> token check -> dev login -> GET /auth/me -> binding check -> role-based home panel
```

It establishes the Taro (React + TypeScript) project, dual-target build (WeChat Mini Program +
H5 for in-browser preview), an API client with JWT access/refresh handling, a session store, a
binding flow, and role-based rendering. Real business screens (attendance punch, my-records,
makeup, management CRUD, reports) are non-functional placeholders reserved for later slices.

The slice deliberately includes a small set of backend enablers, because the existing API cannot
support a role-routing client without them (see "Backend Gaps That Block the Skeleton").

## Scope

### In scope

- New `apps/miniprogram` Taro React + TypeScript app in the pnpm workspace.
- Dual-target build configuration: `weapp` (WeChat Mini Program) and `h5` (browser preview).
- API client: base URL from env, `Authorization` injection, `401 -> /auth/refresh -> retry` once.
- Session store (tokens, user, profile, roles, binding state) persisted via Taro storage.
- Pages: `login` (dev login), `bind` (invitation code), `home` (single page, role-specific panel).
- Role-based home rendering driven by the user's globally highest role, computed with the shared
  `@construction/domain` `ROLE_LEVEL` table — one source of truth across client and server.
- Backend enablers in `apps/api` (all via TDD): `GET /auth/me`, a development-only login path,
  CORS, and a development seed with one demo user per role plus a company/project/team.
- A local PostgreSQL development environment (installed via apt) for real end-to-end verification.

### Out of scope (reserved for later slices)

- Camera selfie and site-photo capture, image upload, object storage.
- Geolocation and geofence verification.
- Attendance submission, makeup request/approval, management CRUD, reports — home tiles are
  inert placeholders.
- Real face verification service integration and server-side score thresholds.
- Production WeChat login wiring beyond keeping the real `/auth/wechat/login` code path intact
  (the skeleton exercises the development login path; production needs real app id/secret and the
  development login flag turned off).

## Backend Gaps That Block the Skeleton

Reading the current `apps/api` surface revealed three gaps that make a role-routing client
impossible today:

1. `POST /auth/wechat/login` returns tokens and `user.isBound`, but no roles. There is no
   `GET /me` endpoint. The server computes role assignments and permissions internally
   (`AuthorizationContextService.loadAuthorizationData`) but never exposes them, so the client
   has no way to learn a user's role to route by.
2. `main.ts` does not enable CORS. An H5 preview running on a different origin cannot call the API.
3. `prisma/seed.ts` seeds only roles, permissions, and role-permission links — no demo users,
   companies, or `user_roles`. Login requires a real WeChat `code` exchanged through
   `WechatCodeSessionConnector`, which cannot run in an H5 browser on a headless server.

The skeleton closes exactly these gaps and nothing more.

## Architecture

```text
WeChat Mini Program / H5 (Taro React + TS)
  -> apiClient (injects JWT, refreshes on 401)
  -> NestJS API  (existing /auth/login, /auth/refresh, /auth/bind
                  + GET /auth/me, dev login, CORS  -- new)
  -> PostgreSQL  (production role/permission seed + dev seed: one user per role)
```

The client and server share role definitions through the `@construction/domain` package. The
client imports `RoleCode` and `ROLE_LEVEL` to compute the highest role for routing; it does not
re-declare role names or levels.

## Backend Enablers

### `GET /auth/me`

Authenticated endpoint (`AccessTokenGuard`) returning the data the client needs to route:

```jsonc
// 200 OK
{
  "user":    { "id": "string", "isBound": true, "status": "ACTIVE" },
  "profile": { "type": "WORKER" | "MANAGER" | null, "id": "string | null" },
  "roles": {
    "assignments": [
      { "roleCode": "TEAM_LEADER", "scope": { "scopeType": "TEAM", "scopeId": "team-1" } }
    ],
    "highestRoleCode": "TEAM_LEADER" | null
  }
}
// 401 when the access token is missing, invalid, expired, or the session is revoked.
```

- `profile` is derived by loading the user with `workerProfile` and `managerProfile` relations.
- `assignments` reuses `AuthorizationContextService.loadAuthorizationData(userId)`.
- `highestRoleCode` is the assignment with the maximum `ROLE_LEVEL`, or `null` if the user has no
  role assignments. Computed with the shared domain table.
- Permission exposure is intentionally omitted; the skeleton routes by `highestRoleCode` only.
  Effective-permission exposure can be added when a slice needs tile-level gating.

**Skeleton simplification:** routing uses the globally highest role. A user with different roles
in different projects routes by their single highest role across all scopes. Project-scoped role
switching is a concern for later slices and is explicitly not handled here.

**Known backend characteristic (not changed by this slice):** `user_roles` rows are created today
in only one place — when a project is created, its creator is granted `PROJECT_ADMIN`. Neither
`bindByInvitation` nor `createProjectWorker` / `createProjectManager` create a `user_role`. As a
result a freshly bound worker or manager is `isBound: true` with **no role assignment**, so
`highestRoleCode` is `null` for them. Wiring binding and project membership to role assignment is
a real gap (the worker attendance slice will need it, since `attendance.submit` is gated on the
WORKER role) but is **out of scope here**. The skeleton therefore (a) treats a bound user with no
role as a first-class state the client must render, and (b) has its development seed assign
`user_roles` explicitly to the five demo users so all five role panels can be demonstrated.

### Development login

Goal: obtain real tokens without WeChat, while keeping the production login path unchanged.

- Add a boolean env var `WECHAT_DEV_LOGIN` (default `false`). `loadEnv` rejects the configuration
  when `WECHAT_DEV_LOGIN` is `true` and `NODE_ENV === "production"`, so it can never run in prod.
- When `WECHAT_DEV_LOGIN` is enabled, `WechatCodeSessionConnector.exchangeCode(code)` returns a
  deterministic session `{ openid: code }` with no network call. Otherwise it behaves exactly as
  today (real WeChat API call).
- The client's development login page sends the seeded demo openid as the `code` to the existing
  `POST /auth/wechat/login`. Because the demo users are seeded with those openids, login attaches
  to a seeded user (with roles and binding) instead of creating a blank account.

This keeps `/auth/wechat/login`, session creation, and token issuance — the real production code
path — under test, varying only the code-to-openid exchange.

### CORS

Enable CORS in `main.ts`, configured by env. Add `CORS_ALLOWED_ORIGINS` (comma-separated list;
empty disables CORS). Tokens travel in the `Authorization` header, not cookies, so credentialed
CORS is not required. Native Mini Program requests are not subject to CORS; this serves H5 preview.

### Development seed

A separate `prisma/seed.dev.ts` (the production `seed.ts` stays unchanged), run explicitly in dev,
that creates:

- One company, one project (with center latitude/longitude and a geofence radius), one team.
- Five bound demo users, each with a fixed openid and the matching profile and role assignment:

  | openid            | profile          | role assignment (scope)        |
  | ----------------- | ---------------- | ------------------------------ |
  | `dev-system`      | manager_profile  | SYSTEM_ADMIN (GLOBAL)          |
  | `dev-company`     | manager_profile  | COMPANY_ADMIN (COMPANY)        |
  | `dev-project`     | manager_profile  | PROJECT_ADMIN (PROJECT)        |
  | `dev-team`        | manager_profile  | TEAM_LEADER (TEAM)             |
  | `dev-worker`      | worker_profile   | WORKER (PROJECT)               |

- One unbound demo user `dev-unbound` (`isBound: false`, no profile) plus an unbound
  `worker_profile` (`userId: null`) and a `PENDING` binding invitation whose `codeHash` is the
  hash of a known plaintext code (e.g. `DEV-BIND-CODE`), so the bind flow can be demonstrated
  end to end. After binding this user is `isBound: true` with no role assignment, which exercises
  the `NoRolePanel` state (the demonstrable role panels come from the five pre-seeded role users).
- Project memberships (`project_worker_members` / `project_manager_members`) for the demo users
  so later slices have a realistic participant list. Not required by the skeleton's routing, but
  cheap to include and avoids reseeding later.

The seed is idempotent (upsert by stable keys) so it can be re-run safely.

## Frontend Architecture (`apps/miniprogram`)

```text
src/
  app.tsx, app.config.ts          # Taro app entry + page/route registration
  config/env.ts                   # API base URL, dev-login flag (per-target env)
  styles/tokens.scss              # design tokens: color/type/radius/shadow (CSS variables)
  services/
    apiClient.ts                  # Taro.request wrapper: auth header, 401 -> refresh -> retry
    auth.ts                       # devLogin / fetchMe / bind / logout
  store/
    session.ts                    # React context + reducer: tokens, user, profile, roles, status
  routing/
    roleHome.ts                   # highestRole(assignments) -> home panel key (uses ROLE_LEVEL)
  pages/
    login/                        # dev login: choose a demo role to sign in
    bind/                         # enter invitation code -> /auth/bind
    home/                         # single page; renders the role panel, or a no-role state
  components/
    ui/                           # Screen, AppHeader, Button, RoleChip, Tile, Field, StateView, Tag
    role-panels/                  # WorkerPanel, TeamLeaderPanel, ProjectAdminPanel,
                                  #   CompanyAdminPanel, SystemAdminPanel (placeholder tiles)
                                  #   NoRolePanel ("bound, no role assigned yet")
```

- **`apiClient`**: reads base URL from env; attaches `Authorization: Bearer <access>`; on a `401`
  calls `/auth/refresh` with the stored refresh token, updates the access token, and retries the
  original request once. A second failure clears the session and surfaces an unauthenticated state.
- **`session` store**: a small React context with a reducer — no extra state library. Tokens
  persist via `Taro.setStorageSync`; the store hydrates from storage on launch.
- **`roleHome`**: pure function mapping role assignments to a panel key via the highest
  `ROLE_LEVEL`; returns a `NONE` key when there are no assignments. Unit-tested.
- **`home` page**: one page that selects the panel from `highestRoleCode`, rendering `NoRolePanel`
  when it is `null`. Each panel shows role-appropriate, inert placeholder tiles plus a working
  logout button.

## Visual Design (Design System)

Direction: **Warm Earthen / Human** (chosen from three explored directions). Warm and approachable
for a frontline-worker audience, while staying legible outdoors and on low-end devices. The
skeleton establishes the tokens and core components every later slice reuses. Applies the
`frontend-design` skill: a committed, context-specific aesthetic, not generic defaults.

**Palette** (CSS variables in `src/styles/tokens.scss`):

- Surfaces: sand `--bg #F3ECE1`, card `--surface #FFFFFF`, sunken `--surface-sunk #EDE4D6`.
- Ink: `--ink #2E2A26`, soft `--ink-soft #6B5D4D`, hairline `--line #D8CDBB`.
- Primary: terracotta `--clay #C5512F` (pressed `#A8401F`, tint `#F6E4DB`).
- Secondary: steel `--steel #3A4A4F` (managerial accents, used sparingly).
- Status: success `#4F7A4E`, attention/gold `--gold #E0B24A`, danger `#B23B2E`.

Dominant sand + ink with a single confident clay accent; steel and gold stay sparing.

**Typography** — shaped by a real Mini Program constraint: distinctive *Chinese* display fonts are
multi-megabyte and impractical to load, and latin display faces do not cover Chinese glyphs. So:

- Chinese headings: system CJK at heavy weight (`PingFang SC` / `Noto Sans SC`, 600–800) at large
  sizes with tight tracking — character comes from scale, weight, color blocks, and layout, not a
  custom CJK face.
- Latin / numerals accent: optionally load **Bricolage Grotesque** (latin-only, small) via
  `Taro.loadFontFace` for big numbers (times, counts) and short labels.
- Body: system stack `-apple-system, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif`.
- Scale (rpx): display 64 / 48, heading 40 / 36, body 30 / 28, caption 24; body line-height 1.5.

**Form and motion**: rounded corners (cards ~24rpx, primary actions full pills), soft warm-tinted
low shadows, generous padding, large tap targets (≥88rpx for worker actions). Motion is subtle and
CSS-only (WXSS): a staggered fade-and-rise on home tiles at load (`animation-delay`), and a press
scale on buttons. An optional faint paper-grain / low-opacity contour texture on section headers
adds atmosphere; no busy effects.

**Core components** (`src/components/ui/`, established by the skeleton): `Screen`, `AppHeader`,
`Button` (clay pill / outline), `RoleChip` (login choices), `Tile` (home placeholder with icon,
title, subtitle, and a "敬请期待" stub badge), `Field` (invitation-code input), `StateView`
(loading / no-role / error — reused by `NoRolePanel` and the 401 path), `Tag` (status pills). The
tokens plus these components are the design system; role panels and later feature screens compose
them rather than restyling from scratch.

## Auth / Session Flow

```text
app launch
  read tokens from storage
  no access token            -> login page
  has access token           -> GET /auth/me
       401                    -> try /auth/refresh
            refresh ok        -> retry GET /auth/me
            refresh fails     -> clear session -> login page
       isBound == false       -> bind page -> on success re-fetch /auth/me -> home
       isBound == true        -> home (panel by highestRoleCode; NoRolePanel if null)
logout
  POST /auth/logout -> clear storage -> login page
```

Login page (development): lists the seeded demo roles; selecting one sends that role's openid as
the `code` to `/auth/wechat/login`, stores the returned tokens, then runs the launch flow.

## Development and Verification Environment

1. Install PostgreSQL 16 via apt (root, no Docker). Initialize a local cluster and start it
   without systemd (`pg_ctlcluster` or `pg_ctl`).
2. Create role/database matching `.env` (`construction` / `construction` /
   `construction_personnel`). Run `prisma migrate deploy` then the production seed and `seed.dev.ts`.
3. Run the API (`pnpm dev:api`) on port 3000 with `WECHAT_DEV_LOGIN=true` and
   `CORS_ALLOWED_ORIGINS` set to the H5 preview origin.
4. Run the Taro H5 dev server and open it in a browser via the host's public IP. Point the app's
   API base URL at the running API.
5. Manual verification: log in as each of the five roles and confirm the correct home panel; log in
   as `dev-unbound`, reach the bind page, enter `DEV-BIND-CODE`, and confirm the bound-no-role home
   state; force a `401` and confirm the refresh-and-retry path; confirm logout returns to login.

## Testing Strategy

- **Backend (TDD, in-memory Prisma double pattern already used by the suite):**
  - `GET /auth/me`: bound worker, bound manager, multi-role user, unbound user, and missing/invalid
    token (401).
  - Development login: `WechatCodeSessionConnector` returns the code as openid when the flag is on,
    real path otherwise; `loadEnv` rejects `WECHAT_DEV_LOGIN=true` under `NODE_ENV=production`.
- **Frontend (unit tests on pure logic):**
  - `roleHome`: highest-role selection across assignment combinations, including the no-role case.
  - `apiClient`: `401 -> refresh -> retry` success, and refresh-failure clears the session
    (with `Taro.request` mocked).
  - `session` reducer transitions.
- **Regression:** all existing 52 tests continue to pass.

Component/page render tests are kept minimal; the skeleton's risk is in routing and auth logic,
which is covered by the pure-logic unit tests plus manual H5 verification.

## Resolved Implementation Decisions

- Framework: Taro with React and TypeScript (compiles to WeChat Mini Program and to H5 for
  browser preview on this headless host; shares types with the TypeScript backend).
- First slice: thin all-role skeleton (architecture, auth, role routing) before deepening any role.
- Data path: real backend with minimal enablers, verified against a local PostgreSQL.
- Home rendering: a single `home` page that renders one of five role panels (not five pages).
- State: a small React context store; no additional state-management dependency.
- Visual direction: Warm Earthen / Human (sand + terracotta + steel; system CJK headings with a
  Bricolage Grotesque latin accent loaded via `Taro.loadFontFace`). See "Visual Design".

## Acceptance Criteria

The skeleton is complete when:

- `apps/miniprogram` builds for both the `weapp` and `h5` targets.
- `GET /auth/me` returns the correct user, profile, role assignments, and highest role for each
  demo user, with new e2e tests green.
- The development login path issues real tokens for a seeded openid without contacting WeChat, and
  cannot be enabled in production.
- In H5 preview against the real API: logging in as each of the five roles lands on the correct
  role panel; the unbound demo user is routed to the bind page and, after entering the seeded code,
  reaches the bound-no-role home state; a `401` triggers a transparent refresh-and-retry; logout
  returns to login.
- All existing 52 backend/domain tests still pass, and the new backend and frontend tests pass.
