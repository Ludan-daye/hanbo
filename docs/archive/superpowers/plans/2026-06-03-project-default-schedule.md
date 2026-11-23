# Project Default Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-level default schedule configuration so attendance submission and reports can distinguish workdays from rest days.

**Architecture:** Extend the existing `Schedule` table with a `workdayMask` field and add one project-level API that replaces the project's default schedule range. Attendance submission keeps the current default-shift behavior when no schedule exists, but rejects submissions on rest days when a project schedule exists. Reports use the project schedule to count only scheduled workdays; if no project schedule exists, they keep the current natural-day behavior.

**Tech Stack:** NestJS, strict TypeScript, Prisma/PostgreSQL, zod request parsing, Vitest e2e smoke tests.

---

## File Structure

- Modify `apps/api/prisma/schema.prisma`: add `Schedule.workdayMask`.
- Add `apps/api/prisma/migrations/20260603010000_schedule_workday_mask/migration.sql`: add the column for existing databases.
- Modify `apps/api/src/attendance/attendance.types.ts`: add default schedule request/response DTOs.
- Modify `apps/api/src/attendance/attendance-body.parsers.ts`: parse default schedule bodies.
- Modify `apps/api/src/attendance/attendance.service.ts`: create/replace project default schedule and reject rest-day attendance when a schedule is configured.
- Modify `apps/api/src/attendance/attendance.controller.ts`: add `PUT /attendance/projects/:projectId/default-schedule`.
- Modify `apps/api/src/reports/reports.service.ts`: load project default schedules and skip non-scheduled days.
- Modify `apps/api/test/attendance.e2e.test.ts`: add schedule API and rest-day attendance smoke coverage.
- Modify `apps/api/test/reports.e2e.test.ts`: add schedule-aware report aggregation coverage.

---

## Task 1: Red Schedule API And Report Tests

**Files:**
- Modify: `apps/api/test/attendance.e2e.test.ts`
- Modify: `apps/api/test/reports.e2e.test.ts`

- [ ] **Step 1: Add failing attendance e2e coverage**

Cover these behaviors:
- `PUT /attendance/projects/:projectId/default-schedule` requires project-scoped `project.manage`.
- It stores a project schedule using the existing default shift.
- It accepts ISO weekdays `1..7`.
- When a project schedule exists, attendance submission on a rest day returns `400`.
- Existing no-schedule default-shift attendance behavior remains unchanged.

Run:

```bash
corepack pnpm --filter @construction/api test -- attendance.e2e
```

Expected: fail because the schedule route does not exist.

- [ ] **Step 2: Add failing reports e2e coverage**

Cover these behaviors:
- Weekly reports only count dates matching the project schedule workdays.
- Monthly reports only count dates matching the project schedule workdays.
- A rest day with no result does not increase `scheduledDays`, `absenceCount`, or `missingPunchCount`.
- A rest day with an existing result still contributes worked minutes and attended days as recorded evidence, but does not create a scheduled day.

Run:

```bash
corepack pnpm --filter @construction/api test -- reports.e2e
```

Expected: fail because reports still treat every natural day as scheduled.

---

## Task 2: Schedule Data Model

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Add: `apps/api/prisma/migrations/20260603010000_schedule_workday_mask/migration.sql`

- [ ] **Step 1: Add `workdayMask` to `Schedule`**

Use integer bits for ISO weekdays:
- Monday: bit 0
- Tuesday: bit 1
- Wednesday: bit 2
- Thursday: bit 3
- Friday: bit 4
- Saturday: bit 5
- Sunday: bit 6

The default value is `127`, meaning all seven days are workdays.

- [ ] **Step 2: Add migration SQL**

```sql
ALTER TABLE "schedules" ADD COLUMN "workdayMask" INTEGER NOT NULL DEFAULT 127;
```

Run:

```bash
corepack pnpm db:generate
DATABASE_URL='postgresql://construction:construction@localhost:5432/construction_personnel?schema=public' corepack pnpm --filter @construction/api exec prisma validate
```

Expected: both pass.

---

## Task 3: Attendance Default Schedule API

**Files:**
- Modify: `apps/api/src/attendance/attendance.types.ts`
- Modify: `apps/api/src/attendance/attendance-body.parsers.ts`
- Modify: `apps/api/src/attendance/attendance.service.ts`
- Modify: `apps/api/src/attendance/attendance.controller.ts`

- [ ] **Step 1: Add DTO types**

Add:
- `IsoWeekdayValue = 1 | 2 | 3 | 4 | 5 | 6 | 7`
- `ConfigureDefaultScheduleRequest`
- `DefaultScheduleResponse`

- [ ] **Step 2: Add body parser**

Validate:
- `startsOn` is `YYYY-MM-DD`.
- `endsOn` is `YYYY-MM-DD | null`.
- `endsOn` must be on or after `startsOn` when present.
- `workdays` is a non-empty array of unique ISO weekdays `1..7`.

- [ ] **Step 3: Add service method**

`configureDefaultSchedule(projectId, request)` must:
- load the project or throw `PROJECT_NOT_FOUND`,
- load the current default shift or throw `DEFAULT_SHIFT_NOT_CONFIGURED`,
- transactionally delete existing `Schedule` rows where `ownerType="PROJECT"` and `ownerId=projectId`,
- create a new schedule with `shiftId=defaultShift.id`, `ownerType="PROJECT"`, `ownerId=projectId`, `startsOn`, `endsOn`, and calculated `workdayMask`,
- return the created schedule with `workdays` expanded back to ISO weekdays.

- [ ] **Step 4: Add controller route**

Add:

```text
PUT /attendance/projects/:projectId/default-schedule
```

Use `AccessTokenGuard, PermissionsGuard` and project-scoped `project.manage`.

- [ ] **Step 5: Enforce rest-day attendance rejection**

When at least one project schedule exists for the project:
- find the effective project schedule for `attendanceDate`,
- if no schedule matches the date or the weekday bit is not enabled, throw `ATTENDANCE_DATE_NOT_SCHEDULED`,
- if no project schedule exists at all, keep using the default shift as before.

Run:

```bash
corepack pnpm --filter @construction/api test -- attendance.e2e
```

Expected: pass.

---

## Task 4: Schedule-Aware Reports

**Files:**
- Modify: `apps/api/src/reports/reports.service.ts`
- Modify: `apps/api/test/reports.e2e.test.ts`

- [ ] **Step 1: Load project schedules for report ranges**

Load project-level schedules where:
- `ownerType="PROJECT"`,
- `ownerId=projectId`,
- `startsOn <= endDate`,
- `endsOn IS NULL OR endsOn >= startDate`.

- [ ] **Step 2: Decide scheduled days**

If no project schedules exist in the requested range, preserve current behavior and treat every natural day as scheduled.

If schedules exist, a date is scheduled only when:
- it falls inside a schedule range,
- the schedule `workdayMask` includes the date's ISO weekday.

- [ ] **Step 3: Update daily/range aggregation**

For a non-scheduled date:
- do not synthesize absent day values,
- do not increment `scheduledDays`, `absenceCount`, or `missingPunchCount`,
- include existing `AttendanceResult` rows if present, because they are real attendance evidence.

Run:

```bash
corepack pnpm --filter @construction/api test -- reports.e2e
```

Expected: pass.

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

- Spec coverage: covers project-level schedule configuration, workday/rest-day behavior, attendance rejection on configured rest days, report scheduled-day filtering, and no-schedule backward compatibility.
- Placeholder scan: no placeholder implementation steps remain.
- Type consistency: route names, DTO names, `workdayMask`, and schedule owner values are consistent across the plan.
