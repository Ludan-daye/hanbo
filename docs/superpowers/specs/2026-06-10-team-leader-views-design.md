# Team-Leader Views — Functional Screens for the Team Leader

## Purpose

Turn the **team-leader** role panel's inert placeholder tiles into real working screens:

1. **Pending makeups** — list the team's pending makeup requests and approve / reject them inline.
2. **Team attendance** — daily / weekly / monthly attendance for the team's participants.

The slice keeps the existing permission model intact and adds the missing backend
**team-scoped endpoints** the team-leader needs. A `TEAM_LEADER@TEAM(teamId)` assignment satisfies
the new permissions; a `PROJECT_ADMIN@PROJECT(projectId)` assignment also satisfies them via the
existing scope-inclusion rule (`scopeIncludesTarget`), so a project-admin keeps the ability to
inspect any team in their project. The worker punch (camera/geolocation) and the other
not-yet-built role panels stay deferred to later slices.

## Background and Constraints

- `apps/api/src/makeup/makeup.controller.ts` already exposes
  `POST /makeups/projects/:projectId/requests`, `POST /makeups/requests/:requestId/approve`, and
  `POST /makeups/requests/:requestId/reject`. There is **no GET endpoint for makeups** today —
  neither for a team-leader to list pending requests nor for a worker to see their own history.
- The existing review endpoints take a body `{ approvalReason: nonEmptyString }`. Approval **and**
  rejection both require a non-empty reason; the UI for both actions must collect one.
- `apps/api/src/authorization/authorization-context.service.ts` already supports
  `source: "teamParam"` for `@RequirePermission` targets — it resolves a team and emits a
  `TEAM` scope containing the team's project. A `TEAM_LEADER@TEAM` assignment passes; a
  `PROJECT_ADMIN@PROJECT` assignment in the team's project also passes (verified by the existing
  scope-inclusion logic).
- The seed grants `attendance.view` and `makeup.approve` to TEAM_LEADER. No new permissions are
  introduced by this slice.

## Architecture

```text
WeChat Mini Program / H5 (Taro React + TS, existing skeleton)
  -> apiClient (existing JWT + 401 refresh)
  -> services/{makeups,management}.ts (typed wrappers; team variants added)
  -> existing NestJS modules:
       MakeupModule    -> new GET pending-by-team
       ReportsModule   -> new GET team-scoped daily/weekly/monthly
       ManagementModule-> new GET team participants
  -> PostgreSQL (existing data; dev seed gains one PENDING makeup)
```

Each new endpoint mirrors the existing project-scoped variant in response shape, so the frontend
view-models, formatting helpers, and stat-card mapper carry over without changes.

## Backend — New Endpoints

All five endpoints use the standard pattern:
`@UseGuards(AccessTokenGuard, PermissionsGuard)` + `@RequirePermission(..., { source: "teamParam", paramName: "teamId" })`.
The service resolves the team (and its project) from `prisma.team.findUnique`, then runs the
filtered query.

### 1. `GET /makeups/teams/:teamId/pending`
- Permission: `makeup.approve`.
- Behavior: returns `MakeupRequestResponse[]` for requests whose `status = "PENDING"` AND whose
  participant belongs to `:teamId`:
  - For `participantType = "WORKER"`: there exists a `project_worker_member` row with
    `workerId = participantId` AND `teamId = :teamId`.
  - For `participantType = "MANAGER"`: there exists a `project_manager_member` row with
    `managerId = participantId` AND `teamScopeId = :teamId`.
- Reuses the existing `MakeupRequestResponse` shape so the inline approve/reject UI displays the
  same fields the create endpoint already returns.

### 2. `GET /reports/teams/:teamId/daily?date=YYYY-MM-DD`
- Permission: `attendance.view`.
- Behavior: computes the team's project (from `teamId`), then runs the existing daily-report logic
  for that project filtered to participants belonging to `:teamId` (same team-membership predicate
  as the makeup query). Returns `DailyAttendanceReportResponse`.

### 3. `GET /reports/teams/:teamId/weekly?weekStartDate=YYYY-MM-DD`
- Permission: `attendance.view`. Behavior: as above, weekly variant; returns
  `RangeAttendanceReportResponse`.

### 4. `GET /reports/teams/:teamId/monthly?month=YYYY-MM`
- Permission: `attendance.view`. Monthly variant; returns `RangeAttendanceReportResponse`.

### 5. `GET /management/teams/:teamId/participants`
- Permission: `attendance.view`.
- Behavior: same response shape as the project participants endpoint
  (`ProjectParticipantResponse[]`), filtered to participants of `:teamId` (the membership
  predicates above).

### Internal Reuse

- Add a small private helper (e.g. `MakeupService.getTeamPendingRequests(teamId)` and equivalent
  team-filtered helpers on `ReportsService` and `ManagementService`) so each new controller method
  is two lines. The bulk of the logic is the team-filtered Prisma query.
- The teamId → projectId resolution is shared logic (`team.findUniqueOrThrow → team.projectId`);
  each service does it inline (one Prisma call) rather than introducing a shared util — clearer
  and avoids cross-module coupling.

### Notes

- The route registers as additional handlers on the existing controllers (`makeup.controller.ts`
  for #1, `reports.controller.ts` for #2-#4, `management.controller.ts` for #5). No new module
  files are needed.
- A team belongs to exactly one project (`Team.projectId` is non-null). Resolving the project from
  `teamId` is unambiguous.

## Frontend — `apps/miniprogram`

- `src/routing/teamLeader.ts` — `resolveTeamLeaderTeamId(me)` returns the first
  `TEAM_LEADER`-coded assignment's `scope.scopeId` whose `scope.scopeType === "TEAM"`, or `null`.
  Mirrors the existing `resolveAdminProjectId`.
- `src/services/makeups.ts` (new) — `fetchPendingMakeups(teamId)`, `approveMakeup(requestId, { approvalReason })`, `rejectMakeup(requestId, { approvalReason })`. Types `PendingMakeup` and `MakeupRequest` mirror the server response.
- `src/services/management.ts` (extend) — `fetchTeamParticipants(teamId)`, `fetchTeamDailyReport(teamId, date)`, `fetchTeamWeeklyReport(teamId, weekStartDate)`, `fetchTeamMonthlyReport(teamId, month)`. Same shapes as the project-scoped wrappers.
- Pages:
  - `src/pages/team-makeups/index` — list pending; each row expands to a reason `Field` + `通过`/`驳回` buttons. Successful approve/reject removes the row optimistically and shows a toast. Errors leave the row and show a toast.
  - `src/pages/team-attendance/index` — direct copy of the existing project reports page using the team service variants. Reuses `pages/reports/view-model.ts → totalsStatItems` and the existing `StatCards`/`ListItem` primitives.
- `src/app.config.ts` — register `pages/team-makeups/index` and `pages/team-attendance/index`.
- `src/components/role-panels/index.tsx` — make the two team-leader tiles navigable; drop their `stub` flag. Other panels remain unchanged.

## Dev Seed Addition

`apps/api/prisma/seed.dev.ts` gets one extra row at the end of `main()` (idempotent), inserted
before the closing `console.log`:

- One `PENDING` `MakeupRequest` for `dev-worker` at `dev-project`, attendance date "yesterday"
  (in Asia/Shanghai), point `SEGMENT_1_START`, reason `"忘记打卡了"`, requestedOccurredAt 09:00.
  Idempotent on a stable composite key derived from `(projectId, participantId, attendanceDate, pointCode)`
  — the schema does not have a unique constraint there, so we insert only when none exists
  (`findFirst` + `create` pattern), which keeps the seed safe to re-run.

## Auth / Permissions

- A `TEAM_LEADER@TEAM(teamId)` assignment satisfies all five new endpoints for that team via the
  existing `scopeIncludesTarget` logic.
- A `PROJECT_ADMIN@PROJECT(projectId)` assignment also satisfies them for any team in their
  project, so a project-admin can inspect a specific team without losing the project-wide views
  already built.
- A user with no role at the relevant scope receives 403 from `PermissionsGuard`, as today.

## Testing

- **Backend e2e** (in-memory Prisma doubles; no DB, no network) — for each new endpoint:
  - permission OK as TEAM_LEADER@TEAM,
  - permission OK as PROJECT_ADMIN@PROJECT (same team, via scope inclusion),
  - 403 when neither matches,
  - team-membership filter correctness (a result from a different team is NOT returned),
  - shape parity with the existing project variants (selected fields asserted).
- **Frontend unit (Vitest):**
  - `resolveTeamLeaderTeamId` — first `TEAM_LEADER@TEAM` returned; null otherwise.
  - `services/makeups.ts` — three URLs/methods/bodies.
  - `services/management.ts` — four new team wrappers (URL + method).
- **Manual / real-browser smoke:** log in as `dev-team`, see the pending makeup, type a reason,
  approve → the row disappears; open team attendance and see real numbers; the project-admin
  tiles still work too (regression check).

## Out of Scope

- Approved / rejected makeup history view (this slice lists PENDING only).
- A team-picker UI for team-leaders assigned to multiple teams (v1 picks the first; a picker is a
  later slice).
- Worker self-view ("我的记录") and worker makeup submission ("补卡") — handled in a future slice
  alongside the worker-scoped read endpoint.
- The system-admin and company-admin functional screens — separate slices.

## Acceptance Criteria

- Logging in as `dev-team` (TEAM_LEADER@TEAM) in the H5 preview and tapping each of the two
  team-leader tiles routes to a working page that fetches from the backend:
  - "团队考勤" shows the team's daily/weekly/monthly attendance with real numbers.
  - "补卡审批" shows at least the one seeded pending request; typing a reason and tapping
    "通过" makes the request disappear from the list and the server records the approval.
- A 项目管理员(`dev-project`) can also reach the team-scoped endpoints (regression for the
  scope-inclusion rule). The project read views built in the previous slice continue to work.
- The 5 new backend e2e tests pass; the new and existing miniprogram vitest tests pass; full
  workspace suite stays green.
- The dev seed re-runs cleanly (idempotent), still emitting the existing `DEV-BIND-CODE` message.
