# Project Read Views — Functional Screens for the Project Admin

## Purpose

Turn the **project-admin** role panel's inert placeholder tiles into real working screens, so the
H5 preview's clicks have actual data behind them — without touching the punch flow (camera /
geolocation) or any device APIs. Three screens, all backed by **existing** backend endpoints:

1. **Participants** — workers and managers of the project.
2. **Reports** — daily / weekly / monthly attendance summaries for the project.
3. **Invitation** — generate a binding invitation code for an existing worker or manager.

The worker punch (selfie + geofence), team-leader views, management create-forms, and worker
self-view are explicitly NOT in this slice (see "Out of Scope").

## Scope

### In scope

- Three new Taro pages reachable from the project-admin role panel's existing tiles (which become
  navigable instead of inert), plus the supporting api-client and a small UI module.
- A frontend `services/management.ts` with typed wrappers around the existing endpoints:
  - `GET /management/projects/:projectId/participants`
  - `GET /reports/projects/:projectId/daily?date=YYYY-MM-DD`
  - `GET /reports/projects/:projectId/weekly?startDate=YYYY-MM-DD`
  - `GET /reports/projects/:projectId/monthly?month=YYYY-MM`
  - `POST /bindings/projects/:projectId/invitations` with body `{ profileId, targetType: "WORKER" | "MANAGER" }`.
- Resolving the project-admin's project from `/auth/me` (the first `PROJECT_ADMIN`-coded
  assignment's `scope.scopeId` is the project id).
- A small set of new UI primitives needed for the screens: page header (title + back), list item,
  period toggle (日 / 周 / 月), stat card, and a copy-to-clipboard control. All composed from
  `@tarojs/components` and the existing warm-earthen tokens.
- Dev seed expansion — `seed.dev.ts` adds the project memberships and a handful of attendance
  results that were intentionally deferred earlier, so the read views show real numbers instead of
  empty states. The production seed stays unchanged.

### Out of scope (deferred to later slices)

- **Worker punch** (selfie / site photo / geofence / submit) — device APIs, HTTPS, weapp simulator;
  the user explicitly wants this left for later.
- **Team-leader views**. Their `attendance.view` permission is granted at TEAM scope, but the
  `/reports/...` and participants endpoints require `attendance.view` at PROJECT scope, so a
  team-leader does not currently pass them. This is a real authorization gap; the cleanest fix is
  to expose team-scoped report/participants endpoints (or to revisit the permission scoping rules),
  which is a separate design decision.
- **Management create-forms** (companies / projects / teams / workers / managers / schedules) —
  these require new GET list endpoints on the backend and richer forms; better as a dedicated
  slice.
- **Worker self-view** ("my records") — needs either a worker-scoped read endpoint or a way to
  filter the existing report by the calling participant; out of scope here.

## Known Constraint: Team-Leader Scoping (Not Changed by This Slice)

The Project Admin's role assignment is `PROJECT_ADMIN @ PROJECT(projectId)`. The participants and
report endpoints check `attendance.view` at the project scope; `PROJECT_ADMIN.attendance.view` is
present in the seed and the assignment scope matches, so the calls succeed.

A Team Leader has `attendance.view` at TEAM scope only. `scopeIncludesTarget` rejects a TEAM
assignment when the target scope is PROJECT, so the same calls would 403 for them. This slice
therefore leaves the team-leader tiles as placeholders rather than wiring screens that would
silently fail; the team-leader's "team attendance" view is its own slice that will introduce
team-scoped endpoints (or revisit the permission model).

## Architecture

```text
WeChat Mini Program / H5 (Taro React + TS, existing skeleton)
  -> apiClient (existing JWT + 401 refresh)
  -> services/management.ts (new typed wrappers — no new backend endpoints)
  -> existing NestJS endpoints (participants, reports, bindings invitations)
  -> PostgreSQL (existing + dev-seed additions for demo data)
```

The project-admin home panel's tiles ("项目管理 / 报表 / 邀请") gain `onClick` handlers that call
`Taro.navigateTo` to the new pages. No new permission paths; no new module wiring on the backend.
Every existing test stays green.

## Screens

Each screen is a Taro page composed from the warm-earthen UI primitives, with a small header
(title + back button) and the body described below. All three resolve `projectId` from
`useSession().state.me` via a shared helper.

### Participants — `pages/participants/index`
- Header: "项目参与者".
- Body: a list of cards, one per participant, showing `name`, `phone`, role label
  (`projectRoleLabel`), team (if present), participant-type chip (工人 / 管理员), and status.
- A simple in-page filter: "全部 / 工人 / 管理员" segmented control (client-side filter over the
  fetched array — no server filter needed).
- Empty state ("尚无参与者") when the array is empty (won't happen after the seed addition).

### Reports — `pages/reports/index`
- Header: "考勤报表".
- Period toggle (segmented): 日 / 周 / 月. The page state holds `(period, dateOrStart)`; changing
  either refetches via the matching `fetchDailyReport` / `fetchWeeklyReport` / `fetchMonthlyReport`.
- Body: the report's per-participant rows rendered as cards (worked-minutes, late count,
  early-leave count, missing-punch count, absent flag), plus a small summary header (counts).
- Date control: a Taro `Picker` (date / week-start / month) seeded to "today" / "this week" /
  "this month" in Asia/Shanghai.

### Invitation — `pages/invitation/index`
- Header: "生成绑定邀请码".
- Step 1 — pick a target: a chooser that lists the project's participants (reuses
  `fetchParticipants`) with a 工人 / 管理员 toggle; tapping one selects it.
- Step 2 — generate: a primary button submits `POST /bindings/projects/:projectId/invitations`
  with `{ profileId, targetType }`; on success the page shows the **plaintext invitation code**
  the server returns (the client receives the code once on creation; the server stores only the
  hash), with a "复制邀请码" button.
- Error states (selected profile already bound / non-member / unauthorized) surface as a toast
  with the server's error message; the screen stays usable.

## Routing and Navigation

`src/app.config.ts` gains the three new pages in its `pages` array
(`pages/participants/index`, `pages/reports/index`, `pages/invitation/index`). The existing
`home/index` page's `RolePanel` for `projectAdmin` makes its three tiles tappable —
`navigateTo({ url: "/pages/participants/index" })` etc. — and drops the inert `敬请期待` badge for
those three. Tiles on the other role panels remain inert.

## Data Model & API Wrappers

`services/management.ts` (new) exposes typed functions whose response/request shapes mirror the
server's existing types (in `apps/api/src/management/management.types.ts` and
`apps/api/src/reports/reports.types.ts`). The client redeclares only what the screens use, keeping
types narrow:

- `fetchParticipants(projectId): Promise<ProjectParticipant[]>` — calls
  `GET /management/projects/{projectId}/participants`.
- `fetchDailyReport(projectId, date: "YYYY-MM-DD"): Promise<DailyAttendanceReport>`.
- `fetchWeeklyReport(projectId, startDate: "YYYY-MM-DD"): Promise<RangeAttendanceReport>`.
- `fetchMonthlyReport(projectId, month: "YYYY-MM"): Promise<RangeAttendanceReport>`.
- `createInvitation(projectId, { profileId, targetType }): Promise<{ id: string; code: string; expiresAt: string }>`.

A small `resolveAdminProjectId(me: MeResponse | null): string | null` returns the first
`PROJECT_ADMIN`-coded assignment's `scope.scopeId` from `/auth/me`, or `null` when the user is not
a project admin.

## Dev Seed Additions (so the views aren't empty)

`apps/api/prisma/seed.dev.ts` is extended (production `seed.ts` stays untouched):

- `project_worker_members`: `dev-worker` becomes an `ACTIVE`, attendance-required member of
  `dev-project` at `dev-team`.
- `project_manager_members`: `dev-team` (TEAM_LEADER) and `dev-project` (PROJECT_ADMIN) become
  `ACTIVE` members of `dev-project` (`dev-team` scoped to team `dev-team`; `dev-project` at the
  project level). `dev-company` and `dev-system` are not added as members.
- A handful of `attendance_results` rows for `dev-worker` over the last 3 days (mix of normal /
  late / absent) so the report screens render real numbers. Records (`attendance_records`) are not
  required for the report endpoints (which read from `attendance_results`), so we add results
  directly — same approach the existing reports tests use.
- The unbound demo (`dev-unbound` + the unbound `worker_profile` + `DEV-BIND-CODE`) is preserved
  so the bind flow still demonstrates the no-role state.

All upserts use stable keys so re-running `pnpm seed:dev` remains idempotent.

## Components

Reuses the existing `Screen`, `Title`, `Subtitle`, `Label`, `Button`, `Tile`, `Field`, `StateView`
from `src/components/ui`. Adds (in the same `components/ui/`):

- `PageHeader` — back arrow + title; calls `Taro.navigateBack`.
- `Segmented` — a simple pill-segmented control (used by Period toggle and the 工人/管理员 filter).
- `ListItem` — two-line list row with an optional trailing chip; used by participants + invitation
  target chooser.
- `StatCard` — labelled number block used by reports.
- `CopyButton` — tap to `Taro.setClipboardData`; shows a toast.

## Auth / Permissions Sanity

Every endpoint touched uses `RequirePermission(attendance.view, projectParam)` or
`RequirePermission(binding.invitation.create, projectParam)`; the dev-seed `PROJECT_ADMIN` role
includes both, so `dev-project` passes the guards. No backend authorization change.

## Testing

- **Frontend unit (Vitest, in apps/miniprogram):**
  - `resolveAdminProjectId` — returns the first PROJECT_ADMIN assignment's scopeId; null when
    absent.
  - `services/management.ts` — each wrapper sends the right URL/method/body and returns the parsed
    response (with `@tarojs/taro` mocked at the module boundary, as today's apiClient tests do).
  - One pure view-model mapper per screen (e.g. shaping the report rows into the StatCard inputs)
    where the shaping is non-trivial.
- **Backend:** none new for this slice; the existing reports + management + bindings e2e tests
  stay green.
- **Manual / preview:** rebuild the H5 with the public-IP API URL, run `pnpm seed:dev`, log in via
  the existing dev login as `dev-project` in the H5 preview, tap each of the three project-admin
  tiles, see real data, generate an invitation, copy the code.

## Risks and Notes

- The `pnpm seed:dev` re-run adds memberships even if the existing `dev-worker` user_role was
  not granted via the new bind-time wiring (it was manually granted in the seed). The new
  bind-time wiring (already shipped) does not re-fire on re-seed, which is correct.
- Result rows are seeded directly; if a future change makes report computations re-derive from
  records, those seeded results would be replaced. That is the same risk the existing reports
  e2e tests carry today and is acceptable for dev demo data.
- All three new screens depend on a logged-in `PROJECT_ADMIN`. The other role panels remain
  placeholders this slice.

## Acceptance Criteria

- Logging in as `dev-project` in the H5 preview and tapping each of the three project-admin
  tiles routes to a working page that fetches from the backend and renders data (participants
  list shows the seeded workers + managers; the report page shows real numbers for at least one
  of 日 / 周 / 月; the invitation page lets you pick an existing worker and produces a
  plaintext code copyable to clipboard).
- The other role panels (system / company / team-leader / worker) remain inert as before.
- The full workspace test suite stays green; new vitest tests cover `resolveAdminProjectId`,
  each `services/management.ts` wrapper, and the report view-model mapper.
- `pnpm seed:dev` remains idempotent and continues to produce the unbound-bind-flow demo.
