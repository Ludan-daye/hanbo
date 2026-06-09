# Makeup APIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-version makeup request submission, approval, rejection, and approved-makeup attendance recalculation.

**Architecture:** Add a focused `MakeupModule` that reuses `AuthModule`, `AuthorizationModule`, `PrismaModule`, and `AttendanceService`. Makeup submission is authenticated and resolved from the current user's bound active attendance membership. Makeup approval loads the request first, builds a project or team authorization target from the request participant's project membership, calls domain `canApproveScopedMakeupRequest`, blocks self-approval, and recalculates the daily attendance result after approval. Approved makeup requests are passed into the domain attendance calculator as `MAKEUP` records instead of creating fake device attendance evidence rows.

**Tech Stack:** NestJS, strict TypeScript, Prisma/PostgreSQL, zod parsers, Vitest e2e smoke tests, domain scoped makeup authorization and attendance summary functions.

---

## File Structure

- Add `apps/api/src/makeup/makeup.types.ts`: request and response DTO types.
- Add `apps/api/src/makeup/makeup-body.parsers.ts`: zod body parsers.
- Add `apps/api/src/makeup/makeup.service.ts`: Prisma-backed submission, approval authorization, review updates, and recalculation coordination.
- Add `apps/api/src/makeup/makeup.controller.ts`: authenticated routes.
- Add `apps/api/src/makeup/makeup.module.ts`: module wiring.
- Modify `apps/api/src/attendance/attendance.service.ts`: expose daily recalculation that includes approved makeup requests.
- Modify `apps/api/src/app.module.ts`: import `MakeupModule`.
- Add `apps/api/test/makeup.e2e.test.ts`: smoke tests with real guards and Prisma test double.
- Modify `apps/api/test/attendance.e2e.test.ts`: fake Prisma adds empty approved makeup query support for existing attendance recalculation.

---

## Task 1: Red Makeup API Smoke Tests

**Files:**
- Create: `apps/api/test/makeup.e2e.test.ts`

- [ ] **Step 1: Write failing e2e tests**

Cover these behaviors:
- `POST /makeups/projects/:projectId/requests` lets a bound active attendance-required worker submit a pending makeup request for a configured default shift point.
- `POST /makeups/requests/:requestId/approve` lets a non-self team leader scoped to the worker's team approve the request and returns a recalculated attendance result where approved makeup contributes as a valid point.
- Self-approval returns `403`.
- A team leader scoped to a different team returns `403`.
- `POST /makeups/requests/:requestId/reject` marks a pending request as rejected and does not return a recalculated result.

Run:

```bash
corepack pnpm --filter @construction/api test -- makeup.e2e
```

Expected: fail because `MakeupModule` does not exist.

---

## Task 2: Attendance Recalculation Includes Makeup

**Files:**
- Modify: `apps/api/src/attendance/attendance.service.ts`
- Modify: `apps/api/test/attendance.e2e.test.ts`

- [ ] **Step 1: Expose recalculation method**

Add a public method:

```ts
async recalculateDailyResult(
  projectId: string,
  attendanceDateText: string,
  participantType: ProfileOwnerTypeValue,
  participantId: string
): Promise<AttendanceResult>
```

It loads the default shift, raw attendance records, and approved makeup requests for the same day and participant.

- [ ] **Step 2: Combine records for domain summary**

Map approved makeup requests to `AttendanceRecordInput` with:
- `id`: makeup request id
- `pointCode`: makeup request point code
- `occurredAt`: makeup request requested occurrence time
- `isValid`: `true`
- `source`: `MAKEUP`

Use approved makeup count for `AttendanceResult.approvedMakeupCount`. Keep invalid device record count from `AttendanceRecord.status === "INVALID"`.

Run:

```bash
corepack pnpm --filter @construction/api test -- attendance.e2e
```

Expected: existing attendance tests pass.

---

## Task 3: Makeup Types And Parsers

**Files:**
- Create: `apps/api/src/makeup/makeup.types.ts`
- Create: `apps/api/src/makeup/makeup-body.parsers.ts`

- [ ] **Step 1: Add request and response types**

Types include:
- `CreateMakeupRequestBody`
- `ReviewMakeupRequestBody`
- `MakeupRequestResponse`
- `ReviewMakeupResponse`

- [ ] **Step 2: Add body parsers**

Validation rules:
- `attendanceDate` uses `YYYY-MM-DD`.
- `requestedOccurredAt` is an ISO datetime with offset and must match the attendance date in China time.
- `pointCode` is one of the four attendance points.
- `reason` and `approvalReason` are non-empty strings.

Run:

```bash
corepack pnpm --filter @construction/api typecheck
```

Expected: typecheck passes once implementation files exist.

---

## Task 4: Makeup Service

**Files:**
- Create: `apps/api/src/makeup/makeup.service.ts`

- [ ] **Step 1: Implement request submission**

`createMakeupRequest(projectId, userId, request)` must:
- verify project exists,
- verify default shift exists and contains the requested point,
- resolve the current user to a bound active attendance-required worker or manager member in the project,
- reject date mismatch between `attendanceDate` and `requestedOccurredAt` in China time,
- create a `PENDING` `MakeupRequest`.

- [ ] **Step 2: Implement review authorization**

`approveMakeupRequest(requestId, approverUserId, body)` and `rejectMakeupRequest(requestId, approverUserId, body)` must:
- load the pending makeup request,
- load the participant membership to build a target scope:
  - worker with `teamId` uses team target,
  - worker without `teamId` uses project target,
  - manager with `teamScopeId` uses team target,
  - manager without `teamScopeId` uses project target,
- load approver authorization data with `AuthorizationContextService`,
- call `canApproveScopedMakeupRequest`,
- return `403` when unauthorized or self-approval,
- update request status using guarded `updateMany`.

- [ ] **Step 3: Recalculate on approval**

After approval, call `AttendanceService.recalculateDailyResult`. Rejection returns the reviewed request with `result: null`.

Run:

```bash
corepack pnpm --filter @construction/api typecheck
```

Expected: typecheck passes.

---

## Task 5: Makeup Controller And Module

**Files:**
- Create: `apps/api/src/makeup/makeup.controller.ts`
- Create: `apps/api/src/makeup/makeup.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Add routes**

Routes:
- `POST /makeups/projects/:projectId/requests`
- `POST /makeups/requests/:requestId/approve`
- `POST /makeups/requests/:requestId/reject`

- [ ] **Step 2: Add guards**

All routes use `AccessTokenGuard`. Approval authorization is dynamic and lives in `MakeupService`.

Run:

```bash
corepack pnpm --filter @construction/api test -- makeup.e2e
```

Expected: makeup tests pass.

---

## Task 6: Full Verification

**Files:**
- Check all changed files.

- [ ] **Step 1: Run verification**

Run:

```bash
corepack pnpm db:generate
DATABASE_URL='postgresql://construction:construction@localhost:5432/construction_personnel?schema=public' corepack pnpm --filter @construction/api exec prisma validate
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
```

Expected: all pass.

- [ ] **Step 2: Preserve review state**

Do not commit. Leave files uncommitted for user review.

---

## Self-Review

- Spec coverage: covers participant-created makeup requests, team/project scoped approval, self-approval block, rejection, and approved makeup participation in daily summaries. Reports, image evidence for makeup, and Mini Program UI remain later modules.
- Placeholder scan: no placeholder implementation steps remain.
- Type consistency: endpoint names, DTO names, and permission choices match current Auth/Authorization/Attendance module patterns.
