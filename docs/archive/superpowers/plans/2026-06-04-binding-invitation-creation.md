# Binding Invitation Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-scoped administrator API for creating one-time binding invitation codes for existing worker and manager profiles.

**Architecture:** Keep invitation consumption in `AuthModule` through the existing `POST /auth/bind` endpoint. Add a focused `BindingModule` for invitation creation, protected by `AccessTokenGuard` and project-scoped `binding.invitation.create`. The service validates that the requested profile is an active project member, is not already bound to a user, creates a pending `BindingInvitation` with only a hashed code in the database, and returns the plain code once.

**Tech Stack:** NestJS, strict TypeScript, Prisma/PostgreSQL, zod request parsing, Vitest e2e smoke tests.

---

## File Structure

- Add `apps/api/src/bindings/bindings.types.ts`: request and response DTOs.
- Add `apps/api/src/bindings/bindings-body.parsers.ts`: zod validation for invitation creation.
- Add `apps/api/src/bindings/bindings.service.ts`: profile membership validation, code generation, invitation creation, audit logging.
- Add `apps/api/src/bindings/bindings.controller.ts`: guarded project-scoped route.
- Add `apps/api/src/bindings/bindings.module.ts`: module wiring.
- Modify `apps/api/src/app.module.ts`: import `BindingsModule`.
- Add `apps/api/test/bindings.e2e.test.ts`: project-admin smoke tests with real guards and Prisma test double.

---

## Task 1: Red Binding Invitation E2E Tests

**Files:**
- Add: `apps/api/test/bindings.e2e.test.ts`

- [ ] **Step 1: Write failing e2e tests**

Cover:
- `POST /bindings/projects/:projectId/invitations` requires `binding.invitation.create` for the project.
- A project admin can create a worker invitation for an active project worker whose profile is unbound.
- The response returns the plain code once and never stores it directly.
- The stored invitation uses `codeHash`, `targetType`, target profile id, `createdByUserId`, `PENDING`, and a future `expiresAt`.
- A worker without the permission receives `403`.
- A profile outside the project returns `404`.
- A profile already bound to a user returns `409`.

Run:

```bash
corepack pnpm --filter @construction/api test -- bindings.e2e
```

Expected: fail because `BindingsModule` does not exist.

---

## Task 2: Binding Types And Parser

**Files:**
- Add: `apps/api/src/bindings/bindings.types.ts`
- Add: `apps/api/src/bindings/bindings-body.parsers.ts`

- [ ] **Step 1: Add DTO types**

Types:
- `BindingTargetTypeValue = "MANAGER" | "WORKER"`
- `CreateBindingInvitationRequest`
- `BindingInvitationResponse`

Response includes:
- `code`
- `expiresAt`
- `id`
- `projectId`
- `targetType`
- `profileId`

- [ ] **Step 2: Add parser**

Validate:
- `targetType` is `WORKER` or `MANAGER`.
- `profileId` is a non-empty string.

Invalid bodies throw `BadRequestException` with `INVALID_CREATE_BINDING_INVITATION_REQUEST`.

---

## Task 3: Binding Service And Route

**Files:**
- Add: `apps/api/src/bindings/bindings.service.ts`
- Add: `apps/api/src/bindings/bindings.controller.ts`
- Add: `apps/api/src/bindings/bindings.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Implement service**

`createProjectInvitation(projectId, actorUserId, request)` must:
- validate project exists,
- for `WORKER`, load `projectWorkerMember` by `{ projectId, workerId: profileId }`, including worker profile,
- for `MANAGER`, load `projectManagerMember` by `{ projectId, managerId: profileId }`, including manager profile,
- require member status `ACTIVE`,
- require profile `userId === null`,
- generate a cryptographically random invite code,
- store only `hashSensitiveToken(code)` in `BindingInvitation`,
- set `expiresAt` to 7 days from current time,
- write an audit log with action `binding.invitation.create`,
- return the plain code once.

- [ ] **Step 2: Implement controller**

Route:

```text
POST /bindings/projects/:projectId/invitations
```

Use:
- `AccessTokenGuard`
- `PermissionsGuard`
- `@RequirePermission({ permissionCode: "binding.invitation.create", target: { source: "projectParam", paramName: "projectId" } })`

- [ ] **Step 3: Wire module**

Import `AuthModule`, `AuthorizationModule`, and `PrismaModule`; export `BindingsService`.

Run:

```bash
corepack pnpm --filter @construction/api test -- bindings.e2e
```

Expected: pass.

---

## Task 4: Full Verification

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

- Spec coverage: covers admin invitation creation, worker and manager target validation, permission enforcement, hashed code storage, and existing `/auth/bind` consumption compatibility.
- Placeholder scan: no placeholder implementation steps remain.
- Type consistency: route names, DTO names, and permission codes match current API patterns.
