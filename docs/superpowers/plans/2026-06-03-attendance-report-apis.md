# Attendance Report APIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-based daily, weekly, and monthly attendance report query APIs for all attendance-required workers and managers.

**Architecture:** Add a focused `ReportsModule` that reads project worker members, project manager members, and `AttendanceResult` rows. All endpoints use `AccessTokenGuard` and `PermissionsGuard` with project-scoped `attendance.view`. The first version treats every date in the requested report range as a scheduled day for active attendance-required project members; later schedule support can replace that assumption without changing the route contract.

**Tech Stack:** NestJS, strict TypeScript, Prisma/PostgreSQL, zod query parsers, Vitest e2e smoke tests.

---

## File Structure

- Add `apps/api/src/reports/reports.types.ts`: report DTO types.
- Add `apps/api/src/reports/reports-query.parsers.ts`: query parsing for daily, weekly, and monthly endpoints.
- Add `apps/api/src/reports/reports.service.ts`: participant loading, result loading, and aggregation logic.
- Add `apps/api/src/reports/reports.controller.ts`: guarded report routes.
- Add `apps/api/src/reports/reports.module.ts`: module wiring.
- Modify `apps/api/src/app.module.ts`: import `ReportsModule`.
- Add `apps/api/test/reports.e2e.test.ts`: report smoke tests with real guards and Prisma test double.

---

## Task 1: Red Report API Smoke Tests

**Files:**
- Create: `apps/api/test/reports.e2e.test.ts`

- [ ] **Step 1: Write failing e2e tests**

Cover these behaviors:
- `GET /reports/projects/:projectId/daily?date=2026-06-03` requires project-scoped `attendance.view`.
- Daily report returns worker and manager participants in one list.
- Daily report returns existing `AttendanceResult` values for participants with a result.
- Daily report treats active attendance-required participants without a result as absent and missing punch.
- `GET /reports/projects/:projectId/weekly?weekStartDate=2026-06-01` aggregates seven days.
- `GET /reports/projects/:projectId/monthly?month=2026-06` aggregates the full calendar month.

Run:

```bash
corepack pnpm --filter @construction/api test -- reports.e2e
```

Expected: fail because `ReportsModule` does not exist.

---

## Task 2: Report Types And Query Parsers

**Files:**
- Create: `apps/api/src/reports/reports.types.ts`
- Create: `apps/api/src/reports/reports-query.parsers.ts`

- [ ] **Step 1: Add report DTO types**

Types include:
- `ReportPeriodType`
- `AttendanceReportTotals`
- `AttendanceReportParticipant`
- `DailyAttendanceReportParticipant`
- `RangeAttendanceReportParticipant`
- `DailyAttendanceReportResponse`
- `RangeAttendanceReportResponse`

- [ ] **Step 2: Add query parsers**

Validation rules:
- Daily `date` uses `YYYY-MM-DD`.
- Weekly `weekStartDate` uses `YYYY-MM-DD`.
- Monthly `month` uses `YYYY-MM`.
- Invalid or missing query values return `BadRequestException`.

Run:

```bash
corepack pnpm --filter @construction/api typecheck
```

Expected: typecheck passes once implementation files exist.

---

## Task 3: Reports Service

**Files:**
- Create: `apps/api/src/reports/reports.service.ts`

- [ ] **Step 1: Load report participants**

Load:
- active project worker members with `requiresAttendance=true`, including worker and team,
- active project manager members with `requiresAttendance=true`, including manager and teamScope.

Normalize into unified participant descriptors. Worker `displayName` stays `null` until a decrypt/masking service exists.

- [ ] **Step 2: Load attendance results**

Load `AttendanceResult` rows for:
- same `projectId`,
- `attendanceDate` between range start and range end inclusive.

Index results by `participantType + participantId + attendanceDate`.

- [ ] **Step 3: Aggregate daily report**

For each participant:
- use the result for the requested date when present,
- otherwise synthesize an absent day with `workedMinutes=0`, `isAbsent=true`, `isMissingPunch=true`, `isLate=false`, `isEarlyLeave=false`, `approvedMakeupCount=0`, `abnormalRecordCount=0`.

Totals sum all participant days.

- [ ] **Step 4: Aggregate weekly and monthly reports**

For each participant and each date in the range:
- use real result or synthesized absent day,
- aggregate worked minutes, scheduled days, attended days, absence count, late count, early-leave count, missing-punch count, approved makeup count, and abnormal record count.

Run:

```bash
corepack pnpm --filter @construction/api typecheck
```

Expected: typecheck passes.

---

## Task 4: Reports Controller And Module

**Files:**
- Create: `apps/api/src/reports/reports.controller.ts`
- Create: `apps/api/src/reports/reports.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Add routes**

Routes:
- `GET /reports/projects/:projectId/daily?date=YYYY-MM-DD`
- `GET /reports/projects/:projectId/weekly?weekStartDate=YYYY-MM-DD`
- `GET /reports/projects/:projectId/monthly?month=YYYY-MM`

- [ ] **Step 2: Add permission metadata**

All routes use `AccessTokenGuard, PermissionsGuard` and require `attendance.view` with `projectParam`.

Run:

```bash
corepack pnpm --filter @construction/api test -- reports.e2e
```

Expected: report tests pass.

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

- Spec coverage: covers project-based daily, weekly, and monthly attendance reports, unified worker/manager view, absence, late, early-leave, missing-punch, approved makeup, abnormal count, and worked minutes. Schedule-aware working days, filters, exports, and Mini Program UI remain later modules.
- Placeholder scan: no placeholder implementation steps remain.
- Type consistency: endpoint names, DTO names, and permission choices match current module patterns.
