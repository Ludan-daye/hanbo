# Company-Admin Views — Functional Screens for the Company Administrator

## Purpose

Turn the **company-admin** role panel's two inert placeholder tiles into real working screens:

1. **Companies & projects** — list the projects under the admin's company with their basic
   attributes (name, status, address, planned start, geofence radius).
2. **People** — a flat company-wide list of project participants (workers and managers) across all
   projects in the company, with a worker / manager filter.

The slice adds two COMPANY-scoped GET endpoints (`/management/companies/:companyId/projects` and
`/management/companies/:companyId/participants`) using the existing `companyParam` authorization
target. The permission system is unchanged: `COMPANY_ADMIN` already has `company.manage` and
`project.create` directly, and inherits `attendance.view` through the role hierarchy
(`getEffectivePermissionCodes` rolls up lower-level permissions). With a `COMPANY_ADMIN@COMPANY`
assignment, the existing `scopeIncludesTarget` covers `attendance.view@COMPANY(:companyId)`.

The worker punch, system-admin views, drill-down from a company project card into the existing
project-admin pages, and any cross-company aggregations are out of scope (see below).

## Background and Constraints

- `apps/api/src/authorization/authorization-context.service.ts` already maps
  `source: "companyParam"` to a `COMPANY` target scope (line 150). No authorization plumbing to
  add.
- `COMPANY_ADMIN`'s direct seed permissions are `company.manage` and `project.create`
  (`apps/api/prisma/seed.ts`). Via the role-hierarchy roll-up
  (`packages/domain/src/roles.ts`), `attendance.view` is also effective for `COMPANY_ADMIN`. The
  two new endpoints therefore use `attendance.view` as their permission — the same one the project
  and team participants/reports endpoints already use, so behavior is consistent.
- Existing `ProjectParticipantResponse` has `projectId` but no `projectName`. For the
  company-people endpoint we extend the response with `projectName` (via Prisma's
  `include: { project: true }` on the membership queries), giving the client what it needs without
  a second round-trip.
- The existing reports + management e2e test doubles already expose `team.findUnique` and the
  worker/manager member queries; the test doubles only need an additional `companyId` parameter
  understanding on `project.findMany` for the projects list. The participants query reuses the
  existing `projectWorkerMember.findMany` / `projectManagerMember.findMany` doubles with a
  `projectId IN [...]` predicate.

## Architecture

```text
WeChat Mini Program / H5 (Taro React + TS, existing skeleton)
  -> apiClient (existing JWT + 401 refresh)
  -> services/management.ts (typed wrappers; company variants added)
  -> existing NestJS ManagementModule + ReportsModule
       ManagementController -> GET /management/companies/:companyId/projects
                            -> GET /management/companies/:companyId/participants
  -> PostgreSQL (existing data; no seed change)
```

No new modules, no permission rule changes. Two new GET handlers on the existing management
controller; two new wrappers on the existing frontend `services/management.ts`; two new Taro
pages; routing + role-panel hookup.

## Backend — New Endpoints

Both endpoints sit on `ManagementController` next to the project and team variants from earlier
slices. Both use:
- `@UseGuards(AccessTokenGuard, PermissionsGuard)`
- `@RequirePermission({ permissionCode: "attendance.view", target: { source: "companyParam", paramName: "companyId" } })`

### 1. `GET /management/companies/:companyId/projects`

Returns the projects belonging to `:companyId`. The response is a new `CompanyProjectResponse[]`
matching the schema's project fields the company-admin actually uses:

```jsonc
[
  {
    "id":               "dev-project",
    "companyId":        "dev-company",
    "name":             "示例工地一号",
    "status":           "ACTIVE",           // ProjectStatusValue
    "address":          "示例市示例区示例路 1 号",
    "centerLatitude":   "31.2304000",       // string for Decimal preservation
    "centerLongitude":  "121.4737000",
    "geofenceRadiusM":  300,
    "plannedStartDate": "2026-01-01",       // YYYY-MM-DD
    "plannedEndDate":   null                // YYYY-MM-DD or null
  }
]
```

The service throws `NotFoundException({ message: "COMPANY_NOT_FOUND", companyId })` if the company
doesn't exist (mirroring the project / team patterns). Otherwise `prisma.project.findMany({ where:
{ companyId } })`, mapped through a `createCompanyProjectResponse` helper.

### 2. `GET /management/companies/:companyId/participants`

Returns all workers and managers across all projects in `:companyId`. The response extends the
existing `ProjectParticipantResponse` with one field — `projectName` — populated from the included
project:

```ts
type CompanyParticipantResponse = ProjectParticipantResponse & {
  readonly projectName: string;
};
```

The service:
1. Loads the company (NotFound check), then `prisma.project.findMany({ where: { companyId }, select: { id: true } })` to get the project id set.
2. Loads `[workerMembers, managerMembers]` with `where: { projectId: { in: projectIds } }`, including team + worker (or manager + teamScope) + project. Order by createdAt asc.
3. Maps with helpers `createCompanyWorkerParticipantResponse` / `createCompanyManagerParticipantResponse` (reusing the existing project helpers' logic but reading `project.name` for the new field).

Returning an empty array (no projects, or no members) is the expected behavior — no 404.

## Frontend — `apps/miniprogram`

- `src/routing/companyAdmin.ts` — `resolveCompanyAdminCompanyId(me): string | null` returns the
  first `COMPANY_ADMIN`-coded assignment's `scope.scopeId` whose `scope.scopeType === "COMPANY"`,
  or `null`. Mirrors the existing `resolveAdminProjectId` and `resolveTeamLeaderTeamId`.

- `src/services/management.types.ts` extended with the two new client mirrors:
  - `CompanyProject` (the response shape above)
  - `CompanyParticipant extends ProjectParticipant & { projectName: string }`

- `src/services/management.ts` extended with:
  - `fetchCompanyProjects(companyId): Promise<ReadonlyArray<CompanyProject>>`
  - `fetchCompanyParticipants(companyId): Promise<ReadonlyArray<CompanyParticipant>>`

- New pages:
  - **`src/pages/company-projects/index`** — cards listing the company's projects. Each card
    shows: name, status chip, address, planned start date, geofence radius. No tap action in this
    slice (drill-down deferred).
  - **`src/pages/company-people/index`** — flat participant list with the existing 工人 / 管理员
    segmented filter pattern. Each row's primary line is the displayName, secondary is
    `${projectRoleLabel} · ${teamName ?? '无班组'} · ${phone}`, and a tail chip shows the project
    name (so the page makes "company-wide" tangible).

- `src/app.config.ts` registers the two new pages.
- `src/components/role-panels/index.tsx` makes the two `companyAdmin` tiles navigable; their
  `stub` flag drops, matching the established pattern.

## Testing

- **Backend e2e** (`apps/api/test/management.e2e.test.ts`, extends the existing in-memory double):
  - `GET /management/companies/:companyId/projects` — returns projects under the company; a project
    from a different company is NOT returned; 403 without `attendance.view` at the company scope.
  - `GET /management/companies/:companyId/participants` — returns workers + managers from all
    projects in the company; participants from other companies are NOT returned; each row carries
    a `projectName`; 403 without permission.

- **Frontend unit (Vitest):**
  - `resolveCompanyAdminCompanyId` — first COMPANY_ADMIN@COMPANY, null otherwise.
  - `services/management.ts` — two new wrappers' URL + method.

- **Manual / real-browser smoke:** log in as `dev-company` (COMPANY_ADMIN@COMPANY), tap each tile,
  see real data; log in as `dev-project` (PROJECT_ADMIN) and confirm both new endpoints reject
  (403) since PROJECT_ADMIN's assignment is PROJECT-scoped — by design, a single-project admin
  cannot enumerate the whole company; this is documented behavior, not a gap.

## Out of Scope

- **Drill-down** from a company project card into the existing participants/reports/invitation
  pages. The cleanest implementation requires `pages/participants` / `pages/reports` /
  `pages/invitation` to accept a `projectId` nav-query param (currently they read it from
  `/auth/me`). That refactor is its own slice.
- **System-admin views** (cross-company / global config).
- **Worker punch UI** and the worker non-punch tiles.
- **Editing projects, teams, workers, or managers** — this slice is read-only.
- Cross-company aggregations or system-admin-style cross-company project lists.

## Acceptance Criteria

- Logging in as `dev-company` in the H5 preview and tapping each of the two company-admin tiles
  routes to a working page that fetches from the backend:
  - "公司与项目" shows at least one project card with real fields (status, address, planned start,
    geofence radius).
  - "人员" shows a flat list of company-wide participants with their `projectName` rendered; the
    工人 / 管理员 filter narrows the list.
- A non-company-admin user (e.g. `dev-project`, who is PROJECT_ADMIN@PROJECT) calling either new
  endpoint receives 403.
- The four new backend e2e tests (2 happy paths × 2 endpoints + 1 cross-company filter + 1 per
  403) pass; the new frontend unit tests pass; full workspace test suite stays green.
- `pnpm seed:dev` continues to be idempotent and unchanged.
