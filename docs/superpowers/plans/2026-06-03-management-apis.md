# Management APIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first project-management API layer for companies, projects, teams, project worker members, project manager members, and unified project participant listing.

**Architecture:** Reuse the existing `AuthModule` and `AuthorizationModule`; management controllers only parse HTTP bodies and declare permissions. `ManagementService` owns Prisma transactions and returns typed DTOs. No schema changes are planned; the current Prisma models already cover the required data.

**Tech Stack:** NestJS, strict TypeScript, Prisma/PostgreSQL, zod parsers, Vitest e2e smoke tests.

---

## File Structure

- Add `apps/api/src/management/management.types.ts`: request and response types.
- Add `apps/api/src/management/management-body.parsers.ts`: zod body parsers with explicit `BadRequestException`.
- Add `apps/api/src/management/management.service.ts`: Prisma-backed company, project, team, member, and participant logic.
- Add `apps/api/src/management/management.controller.ts`: authenticated and permission-protected routes.
- Add `apps/api/src/management/management.module.ts`: module wiring.
- Modify `apps/api/src/app.module.ts`: import `ManagementModule`.
- Add `apps/api/test/management.e2e.test.ts`: smoke tests with Prisma/Auth/Authorization test doubles.

---

## Task 1: Red Management API Smoke Tests

**Files:**
- Create: `apps/api/test/management.e2e.test.ts`

- [ ] **Step 1: Write failing e2e tests**

Cover these behaviors:
- `POST /management/companies/:companyId/projects` requires authenticated company-scoped `project.create`, creates a project, and grants the creator `PROJECT_ADMIN` on the new project.
- `POST /management/projects/:projectId/teams` requires project-scoped `team.manage` and creates a team under the project.
- `POST /management/projects/:projectId/workers` requires project-scoped `worker.manage`, creates a worker profile and active project worker membership in one transaction.
- `POST /management/projects/:projectId/managers` requires project-scoped `project.manage`, creates a manager profile and active project manager membership.
- `GET /management/projects/:projectId/participants` requires project-scoped `attendance.view` and returns worker and manager members in one unified list.

Run:

```bash
corepack pnpm --filter @construction/api test -- management.e2e
```

Expected: fail because `ManagementModule` does not exist.

---

## Task 2: Management Parsers And Types

**Files:**
- Create: `apps/api/src/management/management.types.ts`
- Create: `apps/api/src/management/management-body.parsers.ts`

- [ ] **Step 1: Add request and response types**

Types include:
- `CreateCompanyRequest`, `CompanyResponse`
- `CreateProjectRequest`, `ProjectResponse`
- `CreateTeamRequest`, `TeamResponse`
- `CreateProjectWorkerRequest`, `ProjectWorkerMemberResponse`
- `CreateProjectManagerRequest`, `ProjectManagerMemberResponse`
- `ProjectParticipantResponse`

- [ ] **Step 2: Add zod body parsers**

Each parser rejects invalid input with a structured `BadRequestException` and does not use default parameter values.

Run:

```bash
corepack pnpm --filter @construction/api typecheck
```

Expected: typecheck passes once implementation files exist.

---

## Task 3: Management Service

**Files:**
- Create: `apps/api/src/management/management.service.ts`

- [ ] **Step 1: Implement company/project/team methods**

Methods:
- `createCompany(request)`
- `createProject(companyId, actorUserId, request)`
- `createTeam(projectId, request)`

`createProject` must find the `PROJECT_ADMIN` role and create a project-scoped `UserRole` for the creator inside the same transaction as project creation.

- [ ] **Step 2: Implement project member methods**

Methods:
- `createProjectWorker(projectId, request)`
- `createProjectManager(projectId, request)`
- `listProjectParticipants(projectId)`

Worker and manager creation must be transactional. Team ids must be verified against the same project before creating memberships.

Run:

```bash
corepack pnpm --filter @construction/api typecheck
```

Expected: typecheck passes.

---

## Task 4: Management Controller And Module

**Files:**
- Create: `apps/api/src/management/management.controller.ts`
- Create: `apps/api/src/management/management.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Add routes**

Routes:
- `POST /management/companies`
- `POST /management/companies/:companyId/projects`
- `POST /management/projects/:projectId/teams`
- `POST /management/projects/:projectId/workers`
- `POST /management/projects/:projectId/managers`
- `GET /management/projects/:projectId/participants`

- [ ] **Step 2: Add permission metadata**

Use:
- company creation: `system.manage` with static global scope.
- project creation: `project.create` with `companyParam`.
- team creation: `team.manage` with `projectParam`.
- worker creation: `worker.manage` with `projectParam`.
- manager creation: `project.manage` with `projectParam`.
- participants list: `attendance.view` with `projectParam`.

Run:

```bash
corepack pnpm --filter @construction/api test -- management.e2e
```

Expected: management tests pass.

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

- Spec coverage: covers company, project, team, worker, and manager management plus unified project participants. Attendance submission, shifts, face service, reports, and Mini Program UI remain later modules.
- Placeholder scan: no placeholder implementation steps remain.
- Type consistency: permission names match existing seed and authorization code.
