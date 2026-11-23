# Team-Leader Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the team-leader role panel's two inert tiles into real screens — pending makeup approval and team attendance — backed by five new TEAM-scoped GET endpoints, with a one-row dev-seed addition so the approve flow is demoable.

**Architecture:** Add team-scoped handlers to the existing makeup / reports / management controllers (no new modules, no permission rule changes — `teamParam` already supported by the authorization context, and `TEAM_LEADER@TEAM` / `PROJECT_ADMIN@PROJECT` both satisfy the new permissions via scope inclusion). The frontend reuses the warm-earthen design system and the existing reports view-model; only two new pages, one new service, and one extension to the existing management service are added.

**Tech Stack:** NestJS 10, Prisma 6 (PostgreSQL), Zod, Vitest + Supertest (in-memory Prisma doubles — no DB or network for tests). Taro 4.2 React + TS for the miniprogram.

**Spec:** `docs/superpowers/specs/2026-06-10-team-leader-views-design.md`.

---

## File Structure

- Modify `apps/api/src/makeup/makeup.controller.ts` + Test `apps/api/test/makeup.e2e.test.ts` — add `GET /makeups/teams/:teamId/pending`.
- Modify `apps/api/src/makeup/makeup.service.ts` — add `listTeamPendingRequests(teamId)`.
- Modify `apps/api/src/reports/reports.controller.ts` + Test `apps/api/test/reports.e2e.test.ts` — add `GET /reports/teams/:teamId/{daily,weekly,monthly}`.
- Modify `apps/api/src/reports/reports.service.ts` — add `getTeamDailyReport / getTeamWeeklyReport / getTeamMonthlyReport`.
- Modify `apps/api/src/management/management.controller.ts` + Test `apps/api/test/management.e2e.test.ts` — add `GET /management/teams/:teamId/participants`.
- Modify `apps/api/src/management/management.service.ts` — add `listTeamParticipants(teamId)`.
- Modify `apps/api/prisma/seed.dev.ts` — insert one PENDING makeup for `dev-worker`.
- Create `apps/miniprogram/src/routing/teamLeader.ts` + Test `apps/miniprogram/test/teamLeader.test.ts`.
- Create `apps/miniprogram/src/services/makeups.ts` + Test `apps/miniprogram/test/makeups.service.test.ts`.
- Modify `apps/miniprogram/src/services/management.ts` + Test `apps/miniprogram/test/management.service.test.ts` — four team wrappers.
- Create `apps/miniprogram/src/pages/team-makeups/{index.tsx,index.config.ts}`.
- Create `apps/miniprogram/src/pages/team-attendance/{index.tsx,index.config.ts}`.
- Modify `apps/miniprogram/src/app.config.ts` — register the two new pages.
- Modify `apps/miniprogram/src/components/role-panels/index.tsx` — make the team-leader tiles navigable.

---

## Background facts the implementer must use

- `apps/api/src/authorization/authorization-context.service.ts` already maps `source: "teamParam"` to a `TEAM` target scope containing the team's project. The teamId is resolved via `prisma.team.findUnique({ where: { id } })`. Adding `@RequirePermission({ permissionCode, target: { source: "teamParam", paramName: "teamId" } })` to a route is enough — no extra plumbing.
- All three modules (`MakeupModule`, `ReportsModule`, `ManagementModule`) already import `AuthorizationModule` and `PrismaModule`, so adding `@UseGuards(AccessTokenGuard, PermissionsGuard)` to new routes requires no module change.
- The existing reports + management services compute `[workerMembers, managerMembers]` via `prisma.projectWorkerMember.findMany({ where: { projectId, requiresAttendance: true, status: "ACTIVE" } })` and the equivalent for managers; the team variants reuse that exact pattern with an added `teamId` / `teamScopeId: teamId` filter, after resolving the team's project from `prisma.team.findUnique`.
- The existing e2e tests (`apps/api/test/reports.e2e.test.ts`, `apps/api/test/management.e2e.test.ts`, `apps/api/test/makeup.e2e.test.ts`) already build an in-memory `PrismaTestDouble` exposing `projectWorkerMember.findMany`, `projectManagerMember.findMany`, `attendanceResult.findMany`, `makeupRequest.findMany`, `team.findUnique`, etc. — the new tests EXTEND those doubles (don't rewrite them) by adding the `teamId` filter the test passes in.
- Frontend conventions: extensionless relative imports, Vitest mocks `@tarojs/taro` via `test/taro-mock.ts`, the existing reports view-model `pages/reports/view-model.ts → totalsStatItems` is reused by the team-attendance page, and `Segmented`'s `onChange={setX}` must be wrapped as `(v) => { setX(v); }` due to a TS variance issue.

---

## Task 1: Backend — `GET /makeups/teams/:teamId/pending`

**Files:**
- Modify: `apps/api/src/makeup/makeup.service.ts`
- Modify: `apps/api/src/makeup/makeup.controller.ts`
- Test: `apps/api/test/makeup.e2e.test.ts`

- [ ] **Step 1: Write the failing test** — at the bottom of the existing `describe("MakeupModule", …)` block in `apps/api/test/makeup.e2e.test.ts`, add a test that asserts the new endpoint returns only PENDING requests filtered by team. The test must:
  1. Seed a worker member of `team-1` and a worker member of `team-2`, both under the same project.
  2. Seed two PENDING makeup requests, one for each worker, plus one ACCEPTED request for the team-1 worker.
  3. Seed `TEAM_LEADER@TEAM(team-1)` for the calling user, with the `makeup.approve` permission in the role-permission seed (mirror how the file already seeds permissions; reuse the file's `seedDirectRolePermissions`-style helper).
  4. Call `GET /makeups/teams/team-1/pending` with the bearer token; expect HTTP 200 and exactly one row — the team-1 worker's PENDING request — with `participantType: "WORKER"`, `status: "PENDING"`, and `participantId` matching the seeded worker profile id.

  The test must also assert a 403 case: a different user with no role at team-1 receives 403.

  Test skeleton (paste, then fill in the seed details by mirroring the file's existing patterns):
  ```ts
  test("GET /makeups/teams/:teamId/pending returns only PENDING requests for that team", async () => {
    // seed: project-1 with two teams (team-1, team-2)
    // seed: worker-1 active member of team-1; worker-2 active member of team-2
    // seed: PENDING makeup for worker-1, PENDING for worker-2, APPROVED for worker-1
    // seed: TEAM_LEADER role granted makeup.approve; user has TEAM_LEADER@TEAM(team-1)
    // login and call GET /makeups/teams/team-1/pending
    // expect 200 with exactly one row (the worker-1 PENDING one)
  });

  test("GET /makeups/teams/:teamId/pending returns 403 without the permission at the team scope", async () => {
    // seed the same as above but the calling user has no role at team-1
    // expect 403
  });
  ```

  Extend the file's `MakeupPrismaTestDouble` (if not already present) with `makeupRequest.findMany({ where, orderBy })` returning the seeded rows filtered by the supplied `where` (read the file to confirm the exact double class name — it follows the file's convention).

- [ ] **Step 2: Run → fail**
Run: `corepack pnpm --filter @construction/api exec vitest run test/makeup.e2e.test.ts`
Expected: FAIL (route not defined → 404).

- [ ] **Step 3: Add the service method** — in `apps/api/src/makeup/makeup.service.ts`, add a public method to `MakeupService` (alongside existing methods). Use the same pattern the existing `approveMakeupRequest` uses for resolving entities; for the participant-membership filter, query worker and manager memberships separately and then load matching PENDING requests:

```ts
  async listTeamPendingRequests(teamId: string): Promise<readonly MakeupRequestResponse[]> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (team === null) {
      throw new NotFoundException({ message: "TEAM_NOT_FOUND", teamId });
    }
    const [workerMembers, managerMembers] = await Promise.all([
      this.prisma.projectWorkerMember.findMany({
        select: { workerId: true },
        where: { projectId: team.projectId, status: "ACTIVE", teamId }
      }),
      this.prisma.projectManagerMember.findMany({
        select: { managerId: true },
        where: { projectId: team.projectId, status: "ACTIVE", teamScopeId: teamId }
      })
    ]);
    const workerIds = workerMembers.map((m) => m.workerId);
    const managerIds = managerMembers.map((m) => m.managerId);
    const requests = await this.prisma.makeupRequest.findMany({
      orderBy: { createdAt: "asc" },
      where: {
        projectId: team.projectId,
        status: "PENDING",
        OR: [
          ...(workerIds.length > 0 ? [{ participantType: "WORKER" as const, participantId: { in: workerIds } }] : []),
          ...(managerIds.length > 0 ? [{ participantType: "MANAGER" as const, participantId: { in: managerIds } }] : [])
        ]
      }
    });
    return requests.map(createMakeupRequestResponse);
  }
```

(`createMakeupRequestResponse`, `NotFoundException`, `MakeupRequestResponse`, and the Prisma imports already exist in the file — do not re-import. If `createMakeupRequestResponse` lives at module scope under a different name, use the name the file uses; the convention is `create<Entity>Response`.)

- [ ] **Step 4: Add the controller route** — in `apps/api/src/makeup/makeup.controller.ts`, add at the top of the file (next to the existing `@nestjs/common` import):
```ts
import { Get } from "@nestjs/common";

import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";

import type { MakeupRequestResponse } from "./makeup.types.js";
```
(Some of these may already be imported — keep the file's existing groups; add only what is missing.)

Then add the route handler inside the controller class:
```ts
  @Get("teams/:teamId/pending")
  @RequirePermission({
    permissionCode: "makeup.approve",
    target: { paramName: "teamId", source: "teamParam" }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async listTeamPendingMakeups(@Param("teamId") teamId: string): Promise<readonly MakeupRequestResponse[]> {
    return this.makeupService.listTeamPendingRequests(teamId);
  }
```

- [ ] **Step 5: Run → pass**
Run: `corepack pnpm --filter @construction/api exec vitest run test/makeup.e2e.test.ts`
Expected: PASS (the two new tests plus all existing makeup tests).

- [ ] **Step 6: Typecheck + commit**
```bash
corepack pnpm --filter @construction/api typecheck
git add apps/api/src/makeup apps/api/test/makeup.e2e.test.ts
git commit -m "feat(api): list pending makeup requests for a team"
```

---

## Task 2: Backend — `GET /reports/teams/:teamId/{daily,weekly,monthly}`

**Files:**
- Modify: `apps/api/src/reports/reports.service.ts`
- Modify: `apps/api/src/reports/reports.controller.ts`
- Test: `apps/api/test/reports.e2e.test.ts`

- [ ] **Step 1: Write the failing test** — append to the existing `describe("ReportsModule", …)` in `apps/api/test/reports.e2e.test.ts` three tests, one per period. The setup mirrors the existing daily/weekly/monthly tests but seeds members in two teams and asserts the team filter:
  ```ts
  test("GET /reports/teams/:teamId/daily includes only team participants", async () => {
    // seed: project-1 with team-1 + team-2; one worker member of each team, both ACTIVE + requiresAttendance
    // seed: TEAM_LEADER role with attendance.view; user has TEAM_LEADER@TEAM(team-1)
    // optionally seed one AttendanceResult for the team-1 worker on the test date
    // call GET /reports/teams/team-1/daily?date=<test date>
    // expect 200, response.participants has exactly the team-1 worker (length 1), totals.participantCount === 1
  });

  test("GET /reports/teams/:teamId/weekly includes only team participants", async () => {
    // similar setup; call GET /reports/teams/team-1/weekly?weekStartDate=<monday>
    // expect 200 with only the team-1 worker in participants
  });

  test("GET /reports/teams/:teamId/monthly includes only team participants", async () => {
    // similar setup; call GET /reports/teams/team-1/monthly?month=<YYYY-MM>
    // expect 200 with only the team-1 worker in participants
  });

  test("GET /reports/teams/:teamId/daily returns 403 without attendance.view at team scope", async () => {
    // seed everything but the user has no role at team-1
    // call GET .../daily?date=...
    // expect 403
  });
  ```
  Mirror the existing reports e2e file for the precise seed helpers — the test double already exposes the needed Prisma methods; the only addition is a `teamId` argument on the `where` filter for `projectWorkerMember.findMany` (the existing double already accepts arbitrary `where` keys).

- [ ] **Step 2: Run → fail** — expect FAIL with 404 / route not found.

- [ ] **Step 3: Add the three service methods** — in `apps/api/src/reports/reports.service.ts`, add three public methods. They reuse the existing daily/weekly/monthly logic with one change: the participants list comes from a team-scoped query. Implement by adding a private helper `loadTeamParticipants(teamId)` that mirrors the existing project-scoped loader but with the team filter, then the three public methods call the existing per-period logic with that team participant list.

Add this helper next to the existing project-participants loader:
```ts
  private async loadTeamParticipantsByKey(teamId: string): Promise<readonly ReportParticipantBase[]> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (team === null) {
      throw new NotFoundException({ message: "REPORT_TEAM_NOT_FOUND", teamId });
    }
    const [workerMembers, managerMembers] = await Promise.all([
      this.prisma.projectWorkerMember.findMany({
        include: { team: true, worker: true },
        orderBy: { createdAt: "asc" },
        where: { projectId: team.projectId, requiresAttendance: true, status: "ACTIVE", teamId }
      }),
      this.prisma.projectManagerMember.findMany({
        include: { manager: true, teamScope: true },
        orderBy: { createdAt: "asc" },
        where: { projectId: team.projectId, requiresAttendance: true, status: "ACTIVE", teamScopeId: teamId }
      })
    ]);
    return [
      ...workerMembers.map(createWorkerParticipantBase),
      ...managerMembers.map(createManagerParticipantBase)
    ];
  }
```

(Reuses the existing `createWorkerParticipantBase`, `createManagerParticipantBase`, and the `ReportParticipantBase` type that are already declared in the file. Verify the type name in the file before pasting; if the file uses a different internal name, use that name.)

Then add three public methods. They should be thin wrappers around the existing daily/weekly/monthly methods that take a pre-computed participant list. If the existing methods don't already factor that out, you have two options:

- **Preferred:** refactor the existing project methods to call a shared private method that accepts the participants list, then add team variants that build the team participants and call the same shared method. Keep the public project methods' behavior identical (no observable change).
- **Acceptable fallback:** duplicate the daily/weekly/monthly logic into team variants. Slightly larger diff, no shared change.

Whichever you choose, the public team methods must have these exact signatures (so the controller wiring in Step 4 matches):
```ts
  async getTeamDailyReport(teamId: string, date: string): Promise<DailyAttendanceReportResponse>;
  async getTeamWeeklyReport(teamId: string, weekStartDate: string): Promise<RangeAttendanceReportResponse>;
  async getTeamMonthlyReport(teamId: string, month: string): Promise<RangeAttendanceReportResponse>;
```

- [ ] **Step 4: Add the three controller routes** — in `apps/api/src/reports/reports.controller.ts`, add routes (after the existing monthly route):
```ts
  @Get("teams/:teamId/daily")
  @RequirePermission({ permissionCode: "attendance.view", target: { paramName: "teamId", source: "teamParam" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async getTeamDailyReport(
    @Param("teamId") teamId: string,
    @Query() query: unknown
  ): Promise<DailyAttendanceReportResponse> {
    return this.reportsService.getTeamDailyReport(teamId, parseDailyReportDate(query));
  }

  @Get("teams/:teamId/weekly")
  @RequirePermission({ permissionCode: "attendance.view", target: { paramName: "teamId", source: "teamParam" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async getTeamWeeklyReport(
    @Param("teamId") teamId: string,
    @Query() query: unknown
  ): Promise<RangeAttendanceReportResponse> {
    return this.reportsService.getTeamWeeklyReport(teamId, parseWeeklyReportStartDate(query));
  }

  @Get("teams/:teamId/monthly")
  @RequirePermission({ permissionCode: "attendance.view", target: { paramName: "teamId", source: "teamParam" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async getTeamMonthlyReport(
    @Param("teamId") teamId: string,
    @Query() query: unknown
  ): Promise<RangeAttendanceReportResponse> {
    return this.reportsService.getTeamMonthlyReport(teamId, parseMonthlyReportMonth(query));
  }
```

(All decorators and `parse*` helpers are already imported at the top of the controller.)

- [ ] **Step 5: Run → pass**
Run: `corepack pnpm --filter @construction/api exec vitest run test/reports.e2e.test.ts`
Expected: all tests pass including the four new ones (3 happy paths + 1 403).

- [ ] **Step 6: Typecheck + commit**
```bash
corepack pnpm --filter @construction/api typecheck
git add apps/api/src/reports apps/api/test/reports.e2e.test.ts
git commit -m "feat(api): team-scoped daily/weekly/monthly attendance reports"
```

---

## Task 3: Backend — `GET /management/teams/:teamId/participants`

**Files:**
- Modify: `apps/api/src/management/management.service.ts`
- Modify: `apps/api/src/management/management.controller.ts`
- Test: `apps/api/test/management.e2e.test.ts`

- [ ] **Step 1: Write the failing test** — append two tests to `apps/api/test/management.e2e.test.ts`:
  ```ts
  test("GET /management/teams/:teamId/participants returns only team participants", async () => {
    // seed: project-1 with team-1 + team-2; worker member of each + a manager member of team-1 with teamScopeId=team-1
    // seed: TEAM_LEADER role with attendance.view; user has TEAM_LEADER@TEAM(team-1)
    // call GET /management/teams/team-1/participants
    // expect 200 with the two team-1 members only; assert participantType, teamId, teamName fields are populated
  });

  test("GET /management/teams/:teamId/participants returns 403 without attendance.view at team scope", async () => {
    // user has no role at team-1
    // call GET .../participants
    // expect 403
  });
  ```

- [ ] **Step 2: Run → fail** — expect 404.

- [ ] **Step 3: Add the service method** — in `apps/api/src/management/management.service.ts`, add (mirroring the existing `listProjectParticipants`):
```ts
  async listTeamParticipants(teamId: string): Promise<readonly ProjectParticipantResponse[]> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (team === null) {
      throw new NotFoundException({ message: "TEAM_NOT_FOUND", teamId });
    }
    const [workerMembers, managerMembers] = await Promise.all([
      this.prisma.projectWorkerMember.findMany({
        include: { team: true, worker: true },
        orderBy: { createdAt: "asc" },
        where: { projectId: team.projectId, teamId }
      }),
      this.prisma.projectManagerMember.findMany({
        include: { manager: true, teamScope: true },
        orderBy: { createdAt: "asc" },
        where: { projectId: team.projectId, teamScopeId: teamId }
      })
    ]);
    return [
      ...workerMembers.map(createWorkerParticipantResponse),
      ...managerMembers.map(createManagerParticipantResponse)
    ];
  }
```

(`createWorkerParticipantResponse`, `createManagerParticipantResponse`, `NotFoundException`, and the type imports already exist in the file.)

- [ ] **Step 4: Add the controller route** — in `apps/api/src/management/management.controller.ts`, append (after the existing `listProjectParticipants`):
```ts
  @Get("teams/:teamId/participants")
  @RequirePermission({
    permissionCode: "attendance.view",
    target: { paramName: "teamId", source: "teamParam" }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async listTeamParticipants(
    @Param("teamId") teamId: string
  ): Promise<readonly ProjectParticipantResponse[]> {
    return this.managementService.listTeamParticipants(teamId);
  }
```

- [ ] **Step 5: Run → pass**
Run: `corepack pnpm --filter @construction/api exec vitest run test/management.e2e.test.ts` — both new tests pass alongside the existing suite.

- [ ] **Step 6: Typecheck + commit**
```bash
corepack pnpm --filter @construction/api typecheck
git add apps/api/src/management apps/api/test/management.e2e.test.ts
git commit -m "feat(api): list a team's participants"
```

---

## Task 4: Dev seed — one PENDING makeup for the team-leader to demo

**Files:**
- Modify: `apps/api/prisma/seed.dev.ts`

- [ ] **Step 1:** Open `apps/api/prisma/seed.dev.ts` and insert this block immediately before the final `console.log` at the end of `main()`:

```ts
  // One PENDING makeup so the team-leader page has something to act on.
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayDateOnly = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate()));
  const existingPending = await prisma.makeupRequest.findFirst({
    where: {
      attendanceDate: yesterdayDateOnly,
      participantId: workerProfileForMembership.id,
      participantType: "WORKER",
      pointCode: "SEGMENT_1_START",
      projectId: project.id,
      status: "PENDING"
    }
  });
  if (existingPending === null) {
    await prisma.makeupRequest.create({
      data: {
        attendanceDate: yesterdayDateOnly,
        participantId: workerProfileForMembership.id,
        participantType: "WORKER",
        pointCode: "SEGMENT_1_START",
        projectId: project.id,
        reason: "忘记打卡了",
        requestedOccurredAt: new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 1, 0, 0)),
        requesterUserId: workerUserId,
        status: "PENDING"
      }
    });
  }
```

(`workerProfileForMembership`, `workerUserId`, `today`, and `project` are already declared earlier in `main()` from previous seed slices.)

- [ ] **Step 2: Run seed twice (idempotent)**
```bash
corepack pnpm --filter @construction/api seed:dev
corepack pnpm --filter @construction/api seed:dev
```
Expected: prints `{"devBindCode":"DEV-BIND-CODE","message":"dev seed complete"}` both times.

- [ ] **Step 3: Verify in the DB**
```bash
sudo -u postgres psql -d construction_personnel -tAc "SELECT count(*) FROM makeup_requests WHERE \"projectId\"='dev-project' AND status='PENDING';"
```
Expected: 1.

- [ ] **Step 4: Commit**
```bash
git add apps/api/prisma/seed.dev.ts
git commit -m "feat(api): seed one PENDING makeup so the team-leader page can demo"
```

---

## Task 5: Frontend — `resolveTeamLeaderTeamId` helper

**Files:**
- Create: `apps/miniprogram/src/routing/teamLeader.ts`
- Test: `apps/miniprogram/test/teamLeader.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/miniprogram/test/teamLeader.test.ts`:
```ts
import { describe, expect, test } from "vitest";

import { resolveTeamLeaderTeamId } from "../src/routing/teamLeader";

const me = (assignments: ReadonlyArray<{ roleCode: string; scopeType: string; scopeId: string }>) => ({
  user: { id: "u1", isBound: true, status: "ACTIVE" },
  profile: { type: "MANAGER" as const, id: "m1" },
  roles: {
    assignments: assignments.map((a) => ({ roleCode: a.roleCode, scope: { scopeType: a.scopeType, scopeId: a.scopeId } })),
    highestRoleCode: "TEAM_LEADER" as const
  }
});

describe("resolveTeamLeaderTeamId", () => {
  test("returns the first TEAM_LEADER@TEAM assignment's scopeId", () => {
    expect(
      resolveTeamLeaderTeamId(me([
        { roleCode: "TEAM_LEADER", scopeType: "TEAM", scopeId: "t-1" },
        { roleCode: "TEAM_LEADER", scopeType: "TEAM", scopeId: "t-2" }
      ]) as never)
    ).toBe("t-1");
  });

  test("ignores TEAM_LEADER assignments whose scope is not TEAM", () => {
    expect(
      resolveTeamLeaderTeamId(me([
        { roleCode: "TEAM_LEADER", scopeType: "PROJECT", scopeId: "p-1" }
      ]) as never)
    ).toBeNull();
  });

  test("returns null when there are no TEAM_LEADER assignments", () => {
    expect(resolveTeamLeaderTeamId(me([{ roleCode: "WORKER", scopeType: "PROJECT", scopeId: "p-1" }]) as never)).toBeNull();
  });

  test("returns null when me is null", () => {
    expect(resolveTeamLeaderTeamId(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fail**
Run: `corepack pnpm --filter @construction/miniprogram exec vitest run test/teamLeader.test.ts` — FAIL.

- [ ] **Step 3: Implement** — `apps/miniprogram/src/routing/teamLeader.ts`:
```ts
import type { MeResponse } from "../services/auth.types";

export const resolveTeamLeaderTeamId = (me: MeResponse | null): string | null => {
  if (me === null) {
    return null;
  }
  for (const assignment of me.roles.assignments) {
    if (assignment.roleCode === "TEAM_LEADER" && assignment.scope.scopeType === "TEAM") {
      return assignment.scope.scopeId;
    }
  }
  return null;
};
```

- [ ] **Step 4: Run → pass + typecheck + commit**
```bash
corepack pnpm --filter @construction/miniprogram exec vitest run test/teamLeader.test.ts
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json
git add apps/miniprogram/src/routing/teamLeader.ts apps/miniprogram/test/teamLeader.test.ts
git commit -m "feat(miniprogram): resolveTeamLeaderTeamId helper"
```

---

## Task 6: Frontend — `services/makeups.ts`

**Files:**
- Create: `apps/miniprogram/src/services/makeups.ts`
- Test: `apps/miniprogram/test/makeups.service.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/miniprogram/test/makeups.service.test.ts`:
```ts
import { afterEach, describe, expect, test } from "vitest";

import Taro, { __setRequestHandler } from "@tarojs/taro";

import { approveMakeup, fetchPendingMakeups, rejectMakeup } from "../src/services/makeups";

afterEach(() => {
  Taro.removeStorageSync("accessToken");
  Taro.removeStorageSync("refreshToken");
});

const setToken = (): void => { Taro.setStorageSync("accessToken", "tok"); };

const record = () => {
  const calls: Array<{ url: string; method?: string; data?: unknown }> = [];
  __setRequestHandler(async (o) => {
    calls.push({ url: o.url, method: o.method, data: o.data });
    return { statusCode: 200, data: [] };
  });
  return calls;
};

describe("makeups service", () => {
  test("fetchPendingMakeups -> GET /makeups/teams/:teamId/pending", async () => {
    setToken();
    const calls = record();
    await fetchPendingMakeups("t-1");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url.endsWith("/makeups/teams/t-1/pending")).toBe(true);
  });

  test("approveMakeup -> POST /makeups/requests/:requestId/approve with { approvalReason }", async () => {
    setToken();
    const calls = record();
    await approveMakeup("req-1", { approvalReason: "ok" });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url.endsWith("/makeups/requests/req-1/approve")).toBe(true);
    expect(calls[0]?.data).toEqual({ approvalReason: "ok" });
  });

  test("rejectMakeup -> POST /makeups/requests/:requestId/reject with { approvalReason }", async () => {
    setToken();
    const calls = record();
    await rejectMakeup("req-1", { approvalReason: "no good" });
    expect(calls[0]?.url.endsWith("/makeups/requests/req-1/reject")).toBe(true);
    expect(calls[0]?.data).toEqual({ approvalReason: "no good" });
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** — `apps/miniprogram/src/services/makeups.ts`:
```ts
import { apiClient } from "./client";

export type AttendancePointCode = "SEGMENT_1_START" | "SEGMENT_1_END" | "SEGMENT_2_START" | "SEGMENT_2_END";
export type ParticipantType = "WORKER" | "MANAGER";

export type PendingMakeup = {
  readonly id: string;
  readonly projectId: string;
  readonly participantId: string;
  readonly participantType: ParticipantType;
  readonly attendanceDate: string;
  readonly pointCode: AttendancePointCode;
  readonly reason: string;
  readonly requestedOccurredAt: string;
  readonly requesterUserId: string;
  readonly status: "PENDING";
};

export type MakeupReviewBody = { readonly approvalReason: string };

export const fetchPendingMakeups = async (teamId: string): Promise<ReadonlyArray<PendingMakeup>> =>
  apiClient.request<ReadonlyArray<PendingMakeup>>(`/makeups/teams/${teamId}/pending`, { method: "GET" });

export const approveMakeup = async (requestId: string, body: MakeupReviewBody): Promise<unknown> =>
  apiClient.request<unknown>(`/makeups/requests/${requestId}/approve`, { data: body, method: "POST" });

export const rejectMakeup = async (requestId: string, body: MakeupReviewBody): Promise<unknown> =>
  apiClient.request<unknown>(`/makeups/requests/${requestId}/reject`, { data: body, method: "POST" });
```

- [ ] **Step 4: Run → pass + commit**
```bash
corepack pnpm --filter @construction/miniprogram exec vitest run test/makeups.service.test.ts
git add apps/miniprogram/src/services/makeups.ts apps/miniprogram/test/makeups.service.test.ts
git commit -m "feat(miniprogram): makeups API wrappers (pending list, approve, reject)"
```

---

## Task 7: Frontend — extend `services/management.ts` with team variants

**Files:**
- Modify: `apps/miniprogram/src/services/management.ts`
- Modify: `apps/miniprogram/test/management.service.test.ts`

- [ ] **Step 1: Add four failing tests** — append to `apps/miniprogram/test/management.service.test.ts` inside the same describe:
```ts
  test("fetchTeamParticipants -> GET /management/teams/:teamId/participants", async () => {
    setToken();
    const calls = recordRequests();
    await fetchTeamParticipants("t-1");
    expect(calls[0]?.url.endsWith("/management/teams/t-1/participants")).toBe(true);
  });

  test("fetchTeamDailyReport -> GET /reports/teams/:teamId/daily?date=", async () => {
    setToken();
    const calls = recordRequests();
    await fetchTeamDailyReport("t-1", "2026-06-10");
    expect(calls[0]?.url.endsWith("/reports/teams/t-1/daily?date=2026-06-10")).toBe(true);
  });

  test("fetchTeamWeeklyReport -> GET /reports/teams/:teamId/weekly?weekStartDate=", async () => {
    setToken();
    const calls = recordRequests();
    await fetchTeamWeeklyReport("t-1", "2026-06-08");
    expect(calls[0]?.url.endsWith("/reports/teams/t-1/weekly?weekStartDate=2026-06-08")).toBe(true);
  });

  test("fetchTeamMonthlyReport -> GET /reports/teams/:teamId/monthly?month=", async () => {
    setToken();
    const calls = recordRequests();
    await fetchTeamMonthlyReport("t-1", "2026-06");
    expect(calls[0]?.url.endsWith("/reports/teams/t-1/monthly?month=2026-06")).toBe(true);
  });
```
And add the new wrappers to the top-level import:
```ts
import {
  fetchDailyReport,
  fetchMonthlyReport,
  fetchParticipants,
  fetchTeamDailyReport,
  fetchTeamMonthlyReport,
  fetchTeamParticipants,
  fetchTeamWeeklyReport,
  fetchWeeklyReport
} from "../src/services/management";
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Extend `apps/miniprogram/src/services/management.ts`** with these four functions (after the existing exports):
```ts
export const fetchTeamParticipants = async (teamId: string): Promise<ReadonlyArray<ProjectParticipant>> =>
  apiClient.request<ReadonlyArray<ProjectParticipant>>(`/management/teams/${teamId}/participants`, { method: "GET" });

export const fetchTeamDailyReport = async (teamId: string, date: string): Promise<DailyReport> =>
  apiClient.request<DailyReport>(`/reports/teams/${teamId}/daily?date=${date}`, { method: "GET" });

export const fetchTeamWeeklyReport = async (teamId: string, weekStartDate: string): Promise<RangeReport> =>
  apiClient.request<RangeReport>(`/reports/teams/${teamId}/weekly?weekStartDate=${weekStartDate}`, { method: "GET" });

export const fetchTeamMonthlyReport = async (teamId: string, month: string): Promise<RangeReport> =>
  apiClient.request<RangeReport>(`/reports/teams/${teamId}/monthly?month=${month}`, { method: "GET" });
```

(`ProjectParticipant`, `DailyReport`, `RangeReport`, and `apiClient` are already imported in this file.)

- [ ] **Step 4: Run → pass + commit**
```bash
corepack pnpm --filter @construction/miniprogram exec vitest run test/management.service.test.ts
git add apps/miniprogram/src/services/management.ts apps/miniprogram/test/management.service.test.ts
git commit -m "feat(miniprogram): team-scoped management/reports API wrappers"
```

---

## Task 8: Frontend — Team attendance page

**Files:**
- Create: `apps/miniprogram/src/pages/team-attendance/index.config.ts`
- Create: `apps/miniprogram/src/pages/team-attendance/index.tsx`

- [ ] **Step 1: Create `index.config.ts`**
```ts
export default definePageConfig({ navigationBarTitleText: "团队考勤" });
```

- [ ] **Step 2: Create `index.tsx`** — a near-clone of `pages/reports/index.tsx` that uses team endpoints and `resolveTeamLeaderTeamId`. Note: `Segmented.onChange={setX}` must be wrapped — same pattern the existing reports page uses.

```tsx
import { Picker, View } from "@tarojs/components";
import { useEffect, useState } from "react";

import { ListItem, PageHeader, Screen, Segmented, StateView, StatCards } from "../../components/ui/index";
import { resolveTeamLeaderTeamId } from "../../routing/teamLeader";
import { fetchTeamDailyReport, fetchTeamMonthlyReport, fetchTeamWeeklyReport } from "../../services/management";
import type { DailyReport, RangeReport, ReportTotals } from "../../services/management.types";
import { useSession } from "../../store/session";

import { totalsStatItems } from "../reports/view-model";

type Period = "DAILY" | "WEEKLY" | "MONTHLY";
const PERIOD_OPTIONS = [
  { label: "日", value: "DAILY" as const },
  { label: "周", value: "WEEKLY" as const },
  { label: "月", value: "MONTHLY" as const }
];

const pad = (n: number): string => String(n).padStart(2, "0");
const todayDate = (): string => { const d = new Date(); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const todayMonth = (): string => { const d = new Date(); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
const lastMondayDate = (): string => {
  const d = new Date(); const day = d.getUTCDay(); const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

type Report = DailyReport | RangeReport;

export default function TeamAttendance(): JSX.Element {
  const { state } = useSession();
  const teamId = resolveTeamLeaderTeamId(state.me);
  const [period, setPeriod] = useState<Period>("DAILY");
  const [date, setDate] = useState<string>(todayDate());
  const [weekStart, setWeekStart] = useState<string>(lastMondayDate());
  const [month, setMonth] = useState<string>(todayMonth());
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (teamId === null) {
      return;
    }
    let cancelled = false;
    setReport(null);
    setError(null);
    void (async () => {
      try {
        const data =
          period === "DAILY"
            ? await fetchTeamDailyReport(teamId, date)
            : period === "WEEKLY"
              ? await fetchTeamWeeklyReport(teamId, weekStart)
              : await fetchTeamMonthlyReport(teamId, month);
        if (!cancelled) {
          setReport(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "REQUEST_FAILED");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [teamId, period, date, weekStart, month]);

  if (teamId === null) {
    return (
      <Screen>
        <PageHeader title="团队考勤" />
        <StateView title="无班组" sub="当前账号没有班组长身份。" />
      </Screen>
    );
  }

  const totals: ReportTotals | null = report?.totals ?? null;

  return (
    <Screen>
      <PageHeader title="团队考勤" />
      <Segmented options={PERIOD_OPTIONS} value={period} onChange={(v) => { setPeriod(v); }} />
      <View style={{ marginTop: "20rpx" }}>
        {period === "DAILY" ? (
          <Picker mode="date" value={date} onChange={(e) => setDate(String((e.detail as { value: string }).value))}>
            <ListItem primary={`日期 · ${date}`} secondary="点选其它日期" />
          </Picker>
        ) : null}
        {period === "WEEKLY" ? (
          <Picker mode="date" value={weekStart} onChange={(e) => setWeekStart(String((e.detail as { value: string }).value))}>
            <ListItem primary={`周起始 · ${weekStart}`} secondary="点选周一日期" />
          </Picker>
        ) : null}
        {period === "MONTHLY" ? (
          <Picker mode="date" fields="month" value={month} onChange={(e) => setMonth(String((e.detail as { value: string }).value))}>
            <ListItem primary={`月份 · ${month}`} secondary="点选月份" />
          </Picker>
        ) : null}
      </View>
      {error !== null ? <StateView title="加载失败" sub={error} /> : null}
      {report === null && error === null ? <StateView title="加载中…" /> : null}
      {totals !== null ? <StatCards items={totalsStatItems(totals)} /> : null}
      <View>
        {(report?.participants ?? []).map((p) => (
          <ListItem
            key={p.memberId}
            primary={p.displayName ?? "(未填写)"}
            secondary={`${p.projectRoleLabel} · ${p.teamName ?? "无班组"}`}
            chip={`${(p.workedMinutes / 60).toFixed(1)}h`}
          />
        ))}
      </View>
    </Screen>
  );
}
```

- [ ] **Step 3: Typecheck + commit**
```bash
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json
git add apps/miniprogram/src/pages/team-attendance
git commit -m "feat(miniprogram): team attendance page (day/week/month)"
```

---

## Task 9: Frontend — Team makeups page (pending list + inline approve/reject)

**Files:**
- Create: `apps/miniprogram/src/pages/team-makeups/index.config.ts`
- Create: `apps/miniprogram/src/pages/team-makeups/index.tsx`

- [ ] **Step 1: Create `index.config.ts`**
```ts
export default definePageConfig({ navigationBarTitleText: "补卡审批" });
```

- [ ] **Step 2: Create `index.tsx`**:
```tsx
import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { Button, Field, ListItem, PageHeader, Screen, StateView } from "../../components/ui/index";
import { resolveTeamLeaderTeamId } from "../../routing/teamLeader";
import { approveMakeup, fetchPendingMakeups, rejectMakeup, type PendingMakeup } from "../../services/makeups";
import { useSession } from "../../store/session";

const POINT_LABEL: Record<PendingMakeup["pointCode"], string> = {
  SEGMENT_1_END: "上午下班",
  SEGMENT_1_START: "上午上班",
  SEGMENT_2_END: "下午下班",
  SEGMENT_2_START: "下午上班"
};

export default function TeamMakeups(): JSX.Element {
  const { state } = useSession();
  const teamId = resolveTeamLeaderTeamId(state.me);
  const [items, setItems] = useState<ReadonlyArray<PendingMakeup> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (teamId === null) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchPendingMakeups(teamId);
        if (!cancelled) {
          setItems(rows);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "REQUEST_FAILED");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [teamId]);

  if (teamId === null) {
    return (
      <Screen>
        <PageHeader title="补卡审批" />
        <StateView title="无班组" sub="当前账号没有班组长身份。" />
      </Screen>
    );
  }

  const act = async (id: string, kind: "approve" | "reject"): Promise<void> => {
    const approvalReason = (reasons[id] ?? "").trim();
    if (approvalReason.length === 0) {
      await Taro.showToast({ icon: "none", title: "请填写理由" });
      return;
    }
    setBusy(id);
    try {
      if (kind === "approve") {
        await approveMakeup(id, { approvalReason });
      } else {
        await rejectMakeup(id, { approvalReason });
      }
      setItems((prev) => (prev ?? []).filter((r) => r.id !== id));
      setOpenId(null);
      setReasons((prev) => { const next = { ...prev }; delete next[id]; return next; });
      await Taro.showToast({ icon: "success", title: kind === "approve" ? "已通过" : "已驳回" });
    } catch {
      await Taro.showToast({ icon: "none", title: "操作失败" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <PageHeader title="补卡审批" />
      {items === null && error === null ? <StateView title="加载中…" /> : null}
      {error !== null ? <StateView title="加载失败" sub={error} /> : null}
      {items !== null && items.length === 0 ? <StateView title="无待审补卡" /> : null}
      <View>
        {(items ?? []).map((r) => (
          <View key={r.id}>
            <ListItem
              primary={`${POINT_LABEL[r.pointCode]} · ${r.attendanceDate}`}
              secondary={r.reason}
              chip={openId === r.id ? "审批中" : "待审"}
              onClick={() => { setOpenId(openId === r.id ? null : r.id); }}
            />
            {openId === r.id ? (
              <View>
                <Field
                  value={reasons[r.id] ?? ""}
                  placeholder="审批理由(必填)"
                  onInput={(v) => { setReasons((prev) => ({ ...prev, [r.id]: v })); }}
                />
                <Button onClick={() => { void act(r.id, "approve"); }}>{busy === r.id ? "处理中…" : "通过"}</Button>
                <Button variant="outline" onClick={() => { void act(r.id, "reject"); }}>{busy === r.id ? "处理中…" : "驳回"}</Button>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </Screen>
  );
}
```

- [ ] **Step 3: Typecheck + commit**
```bash
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json
git add apps/miniprogram/src/pages/team-makeups
git commit -m "feat(miniprogram): team-makeups page (pending list + inline approve/reject)"
```

---

## Task 10: Frontend — routing (app.config + role panel)

**Files:**
- Modify: `apps/miniprogram/src/app.config.ts`
- Modify: `apps/miniprogram/src/components/role-panels/index.tsx`

- [ ] **Step 1: Register pages** — replace the `pages` array in `apps/miniprogram/src/app.config.ts` with:
```ts
  pages: [
    "pages/login/index",
    "pages/bind/index",
    "pages/home/index",
    "pages/participants/index",
    "pages/reports/index",
    "pages/invitation/index",
    "pages/team-makeups/index",
    "pages/team-attendance/index"
  ],
```

- [ ] **Step 2: Make team-leader tiles navigable** — in `apps/miniprogram/src/components/role-panels/index.tsx`, change the `teamLeader` entry of the `TILES` Record from:
```ts
  teamLeader: { title: "班组长", tiles: [{ title: "补卡审批", sub: "审批本班组补卡" }, { title: "团队考勤", sub: "查看班组出勤" }] },
```
to:
```ts
  teamLeader: {
    title: "班组长",
    tiles: [
      { title: "补卡审批", sub: "审批本班组补卡", nav: { url: "/pages/team-makeups/index" } },
      { title: "团队考勤", sub: "查看班组出勤", nav: { url: "/pages/team-attendance/index" } }
    ]
  },
```
(The rendering already supports `nav` and drops the `stub` badge when present — set in the previous slice.)

- [ ] **Step 3: Verify + commit**
```bash
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit -p tsconfig.json
corepack pnpm --filter @construction/miniprogram exec vitest run
TARO_APP_API_BASE_URL=http://139.59.255.11:3000 corepack pnpm --filter @construction/miniprogram build:h5
git add apps/miniprogram/src/app.config.ts apps/miniprogram/src/components/role-panels/index.tsx
git commit -m "feat(miniprogram): wire team-leader tiles to team-makeups/team-attendance"
```

---

## Task 11: H5 preview smoke (controller-run)

**Files:** none.

- [ ] **Step 1:** Ensure the backend + h5 servers are running. If not:
```bash
( cd apps/api && set -a && . ./.env && set +a && node dist/main.js > /tmp/api.log 2>&1 ) &
( cd apps/miniprogram && python3 -m http.server 8088 --bind 0.0.0.0 --directory dist > /tmp/h5.log 2>&1 ) &
```

- [ ] **Step 2:** Smoke the new endpoints as the team-leader (`dev-team`):
```bash
T=$(curl -s -X POST localhost:3000/auth/wechat/login -H 'content-type: application/json' -d '{"code":"dev-team"}' | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).accessToken))')
echo "pending:"; curl -s "localhost:3000/makeups/teams/dev-team/pending" -H "Authorization: Bearer $T"
echo "participants:"; curl -s "localhost:3000/management/teams/dev-team/participants" -H "Authorization: Bearer $T"
TODAY=$(node -e 'const d=new Date();const p=(n)=>String(n).padStart(2,"0");console.log(d.getUTCFullYear()+"-"+p(d.getUTCMonth()+1)+"-"+p(d.getUTCDate()))')
echo "daily:"; curl -s "localhost:3000/reports/teams/dev-team/daily?date=$TODAY" -H "Authorization: Bearer $T"
```
Expected: pending returns one row (the seeded makeup); participants returns the team members; daily returns the team's daily report.

- [ ] **Step 3:** Open `http://139.59.255.11:8088` in a browser (force refresh once). Log in as **班组长** (`dev-team`). Tap "补卡审批" — see the pending row; expand it; type a reason; tap "通过" — row disappears; toast "已通过". Tap "团队考勤" — see real numbers and the team-1 member rows. The project-admin pages still work as a regression check.

- [ ] **Step 4:** Stop background servers when done. No commit.

---

## Self-Review

- **Spec coverage:** GET pending makeups (T1) ✓; team daily/weekly/monthly reports (T2) ✓; team participants (T3) ✓; dev seed pending makeup (T4) ✓; resolveTeamLeaderTeamId (T5) ✓; makeups frontend wrappers + tests (T6) ✓; management frontend team wrappers + tests (T7) ✓; team-attendance page (T8) ✓; team-makeups page with inline approve/reject + required reason (T9) ✓; routing + role panel (T10) ✓; smoke (T11) ✓; team-leader and project-admin both pass the new permissions via existing scope-inclusion (no permission rule changes); deferred items (history view, multi-team picker, worker self-view, other roles) remain out of scope.
- **Placeholders:** none — every code block is complete; the only "describe-then-paste" is in the seed details of the backend e2e tests, where the file's existing helpers are reused (the in-file pattern is already shown by the existing makeup/reports/management e2e tests in the same files).
- **Type consistency:** Frontend `PendingMakeup`/`MakeupReviewBody` shapes used by Task 6 match the page's usage in Task 9; team wrappers in Task 7 return the same `DailyReport` / `RangeReport` / `ProjectParticipant` types used by Task 8 (defined earlier in `services/management.types.ts`); backend `MakeupRequestResponse` (Task 1), `DailyAttendanceReportResponse` / `RangeAttendanceReportResponse` (Task 2), and `ProjectParticipantResponse` (Task 3) are reused from the existing controllers, so the new endpoints' shapes match the project-scoped variants exactly.
- **Note:** Tasks 1-3 add to existing e2e files; execute them in order (1, 2, 3) to keep the file's in-memory double extensions tidy. The seed addition (Task 4) requires a running Postgres — the previous slice's instructions still apply if the DB has been wiped.
