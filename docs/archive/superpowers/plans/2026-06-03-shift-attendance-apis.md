# Shift And Attendance APIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first API layer for project default four-point shifts and self-service attendance submission with synchronous daily summary recalculation.

**Architecture:** Add a focused `AttendanceModule` that reuses `AuthModule`, `AuthorizationModule`, `PrismaModule`, and the domain `summarizeDailyAttendance` function. Shift management is protected by project-scoped `project.manage`; attendance submission is authenticated and then authorized by the current user's bound active project membership because project administrators and team leaders can also be attendance participants. Binary photo upload and real face-service comparison remain outside this slice; this API persists object keys, hashes, location evidence, and face comparison results supplied by the caller.

**Tech Stack:** NestJS, strict TypeScript, Prisma/PostgreSQL, zod parsers, Vitest e2e smoke tests, domain pure attendance calculation.

---

## File Structure

- Add `apps/api/src/attendance/attendance.types.ts`: request and response DTO types.
- Add `apps/api/src/attendance/attendance-body.parsers.ts`: zod validation for default shift and attendance submission bodies.
- Add `apps/api/src/attendance/attendance.service.ts`: Prisma-backed shift creation, participant resolution, attendance record persistence, geofence validation, and result recalculation.
- Add `apps/api/src/attendance/attendance.controller.ts`: authenticated routes and permission metadata.
- Add `apps/api/src/attendance/attendance.module.ts`: module wiring.
- Modify `apps/api/src/app.module.ts`: import `AttendanceModule`.
- Add `apps/api/test/attendance.e2e.test.ts`: smoke tests with real guards and Prisma test double.

---

## Task 1: Red Attendance API Smoke Tests

**Files:**
- Create: `apps/api/test/attendance.e2e.test.ts`

- [ ] **Step 1: Write failing e2e tests**

Cover these behaviors:
- `PUT /attendance/projects/:projectId/default-shift` requires authenticated project-scoped `project.manage` and creates a default shift with exactly two segments.
- `POST /attendance/projects/:projectId/records` lets a bound active attendance-required worker submit four valid points and updates the daily summary after each submission.
- The fourth valid point returns `workedMinutes`, `isLate`, `isEarlyLeave`, `isMissingPunch`, and `isAbsent` from `summarizeDailyAttendance`.
- A bound active manager member with `requiresAttendance=true` can submit attendance without relying on a project-scoped `attendance.submit` role assignment.
- A request outside the project geofence persists an immutable invalid raw record and does not count toward the daily summary.

Run:

```bash
corepack pnpm --filter @construction/api test -- attendance.e2e
```

Expected: fail because `AttendanceModule` does not exist.

---

## Task 2: Attendance Types And Body Parsers

**Files:**
- Create: `apps/api/src/attendance/attendance.types.ts`
- Create: `apps/api/src/attendance/attendance-body.parsers.ts`

- [ ] **Step 1: Add request and response types**

Types include:
- `ConfigureDefaultShiftRequest`
- `ShiftSegmentRequest`
- `DefaultShiftResponse`
- `SubmitAttendanceRecordRequest`
- `AttendanceRecordResponse`
- `AttendanceResultResponse`
- `SubmitAttendanceRecordResponse`

- [ ] **Step 2: Add zod parsers**

Validation rules:
- Default shift requires exactly two segments with sequences `1` and `2`.
- Segment times use `HH:mm`.
- `attendanceDate` uses `YYYY-MM-DD`.
- `occurredAt` is an ISO datetime with offset.
- Coordinates are strings with up to 7 decimal places.
- Optional numeric evidence values use explicit `null`.

Run:

```bash
corepack pnpm --filter @construction/api typecheck
```

Expected: typecheck passes once implementation files exist.

---

## Task 3: Attendance Service

**Files:**
- Create: `apps/api/src/attendance/attendance.service.ts`

- [ ] **Step 1: Implement default shift configuration**

`configureDefaultShift(projectId, request)` must:
- verify the project exists,
- transactionally set existing project shifts to `isDefault=false`,
- create a new default shift,
- create two `ShiftSegment` rows,
- return the created shift and segments.

- [ ] **Step 2: Implement participant resolution**

`resolveAttendanceParticipant(userId, projectId)` must:
- find a bound worker profile with an active project worker membership requiring attendance,
- otherwise find a bound manager profile with an active project manager membership requiring attendance,
- reject missing, suspended, exited, or attendance-disabled memberships with explicit `BadRequestException`,
- reject users bound to both worker and manager profiles with explicit `ConflictException`.

- [ ] **Step 3: Implement attendance submission and summary recalculation**

`submitAttendanceRecord(projectId, userId, request)` must:
- load the project and default shift with two segments,
- compute geofence distance from project center to submitted coordinates,
- mark the raw record `VALID` only when face passed and the point is inside the geofence,
- persist all attempts as `AttendanceRecord` rows,
- load all raw records for the same day and participant,
- call `summarizeDailyAttendance`,
- upsert `AttendanceResult` using the unique `(projectId, attendanceDate, participantType, participantId)` key,
- return the raw record plus current daily result.

Run:

```bash
corepack pnpm --filter @construction/api typecheck
```

Expected: typecheck passes.

---

## Task 4: Attendance Controller And Module

**Files:**
- Create: `apps/api/src/attendance/attendance.controller.ts`
- Create: `apps/api/src/attendance/attendance.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Add routes**

Routes:
- `PUT /attendance/projects/:projectId/default-shift`
- `POST /attendance/projects/:projectId/records`

- [ ] **Step 2: Add guard behavior**

Use:
- default shift: `AccessTokenGuard, PermissionsGuard` with `project.manage` and `projectParam`.
- attendance submission: `AccessTokenGuard`; service enforces bound active membership and attendance requirement.

Run:

```bash
corepack pnpm --filter @construction/api test -- attendance.e2e
```

Expected: attendance tests pass.

---

## Task 5: Full Verification

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

- Spec coverage: covers project default shift configuration, four-point raw attendance submission, worker/manager attendance participation, geofence/face evidence persistence, and daily summary recalculation. Upload service, face-service connector, makeup requests, reports, and Mini Program UI remain later modules.
- Placeholder scan: no placeholder implementation steps remain.
- Type consistency: endpoint names, DTO names, and permission choices match the current Nest/Auth/Authorization patterns.
