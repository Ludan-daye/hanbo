# WeChat Auth Binding And Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first production-facing account layer: WeChat login, JWT access tokens, server-side refresh sessions, invitation-based personnel binding, role/permission seed data, and scoped authorization guards.

**Architecture:** Keep business rules in `@construction/domain` pure functions. The NestJS API owns HTTP parsing, persistence, external WeChat calls, token issuance, binding transactions, and guard error mapping. Prisma stores session and invitation state; role permission rows are seeded idempotently rather than inserted by migrations.

**Tech Stack:** NestJS, strict TypeScript, Prisma/PostgreSQL, `@nestjs/jwt`, Node `crypto`, Node `fetch`, Vitest.

---

## File Structure

- Modify `packages/domain/src/roles.ts`: add scoped permission types and authorization pure functions.
- Modify `packages/domain/test/roles.test.ts`: add tests for inheritance, scope, same-assignment authorization, and makeup approval scope.
- Modify `apps/api/prisma/schema.prisma`: add account status, unionid, session version, user sessions, and binding invitations.
- Add `apps/api/prisma/migrations/20260602010000_auth_binding_permissions/migration.sql`: schema migration with a raw check constraint for invitation target integrity.
- Add `apps/api/prisma/seed.ts`: idempotent roles, permissions, and direct role-permission mappings.
- Modify `apps/api/package.json`: add `@nestjs/jwt`, `tsx`, and Prisma seed command.
- Modify `.env.example` and `apps/api/src/config/env.ts`: add JWT and refresh session configuration.
- Add `apps/api/src/config/env.module.ts`: provide validated env through Nest dependency injection.
- Add `apps/api/src/infrastructure/wechat/wechat-code-session.connector.ts`: external connector for WeChat code-to-session exchange.
- Add `apps/api/src/auth/*`: auth module, controller, service, guard, current-user decorator, DTO parsers, and typed request context.
- Add `apps/api/src/authorization/*`: permission decorator, guard, context service, and types.
- Modify `apps/api/src/app.module.ts`: import `EnvModule`, `AuthModule`, and `AuthorizationModule`.
- Modify `apps/api/test/health.e2e.test.ts`: set explicit test env for modules that now need config.
- Add `apps/api/test/auth.e2e.test.ts`: smoke tests for WeChat login, refresh, logout, and binding behavior using Prisma and WeChat test doubles.
- Add `apps/api/test/authorization.e2e.test.ts`: smoke tests for 401, 403, and allowed permission guard behavior.

---

## Task 1: Domain Authorization Rules

**Files:**
- Modify: `packages/domain/src/roles.ts`
- Modify: `packages/domain/test/roles.test.ts`

- [ ] **Step 1: Write failing tests for scoped permission behavior**

Add tests that prove:
- `SYSTEM_ADMIN` inherits worker-level permissions.
- A company-scoped assignment covers projects in that company.
- A project-scoped assignment does not cover sibling projects.
- Authorization cannot combine permission from one assignment and scope from another.
- Self makeup approval is blocked.
- Team leader approval is scoped to the matching team/project.

Run:

```bash
corepack pnpm --filter @construction/domain test
```

Expected: tests fail because the new functions are not implemented.

- [ ] **Step 2: Implement pure authorization functions**

Add explicit types:
- `PermissionCode`
- `ScopeType`
- `ScopedRoleAssignment`
- `AuthorizationTargetScope`
- `AuthorizationDecision`
- `AuthorizePermissionInput`
- `MakeupApprovalInput`

Add pure functions:
- `getInheritedRoleCodes(roleCode)`
- `getEffectivePermissionCodes(roleCode, permissionsByRoleCode)`
- `scopeIncludesTarget(assignmentScope, targetScope)`
- `authorizePermission(input)`
- `canApproveScopedMakeupRequest(input)`

No function mutates inputs. Errors are explicit for impossible scope shapes, such as a team scope without project/company context.

- [ ] **Step 3: Verify domain**

Run:

```bash
corepack pnpm --filter @construction/domain test
corepack pnpm --filter @construction/domain typecheck
```

Expected: all domain tests and type checks pass.

---

## Task 2: Prisma Account State And Permission Seed

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Add: `apps/api/prisma/migrations/20260602010000_auth_binding_permissions/migration.sql`
- Add: `apps/api/prisma/seed.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Extend schema**

Add:
- `UserStatus` enum with `ACTIVE` and `DISABLED`.
- `BindingInvitationStatus` enum with `PENDING`, `ACCEPTED`, `EXPIRED`, and `REVOKED`.
- `User.unionid`, `User.status`, `User.sessionVersion`, `User.sessions`, and invitation relations.
- `UserSession` model with hashed refresh token storage.
- `BindingInvitation` model with hashed invitation code storage and worker/manager target relations.

- [ ] **Step 2: Add migration SQL**

Create SQL that:
- creates new enums,
- alters `users`,
- creates `user_sessions`,
- creates `binding_invitations`,
- adds indexes and foreign keys,
- adds a raw check constraint so exactly one target profile field is present and it matches `targetType`.

- [ ] **Step 3: Seed roles and permissions**

Add an idempotent seed that upserts:
- all role codes and levels from the domain hierarchy,
- permission codes used by the first API layer,
- direct role-permission mappings only.

Inheritance remains a domain calculation, not duplicated seed data.

- [ ] **Step 4: Verify Prisma**

Run:

```bash
corepack pnpm --filter @construction/api prisma:generate
DATABASE_URL='postgresql://construction:construction@localhost:5432/construction_personnel?schema=public' corepack pnpm --filter @construction/api exec prisma validate
```

Expected: Prisma client generation and schema validation pass.

---

## Task 3: Environment And WeChat Connector

**Files:**
- Modify: `.env.example`
- Modify: `apps/api/src/config/env.ts`
- Add: `apps/api/src/config/env.module.ts`
- Add: `apps/api/src/infrastructure/wechat/wechat-code-session.connector.ts`
- Add: `apps/api/test/wechat-code-session.connector.test.ts`

- [ ] **Step 1: Write failing connector tests**

Test:
- successful response returns `openid`, optional `unionid`, and `sessionKey`.
- WeChat error JSON raises an explicit error including status, response body, and non-secret request fields.
- malformed success JSON raises an explicit parsing error.

Run:

```bash
corepack pnpm --filter @construction/api test -- wechat-code-session.connector
```

Expected: fail because connector does not exist.

- [ ] **Step 2: Implement env and connector**

Add env vars:
- `JWT_ACCESS_TOKEN_SECRET`
- `JWT_ACCESS_TOKEN_TTL_SECONDS`
- `AUTH_REFRESH_TOKEN_TTL_SECONDS`

Implement `EnvModule` and `WechatCodeSessionConnector`. The connector uses Node `fetch`, never logs or returns `WECHAT_APP_SECRET`, and raises explicit errors with request context.

- [ ] **Step 3: Verify connector**

Run:

```bash
corepack pnpm --filter @construction/api test -- wechat-code-session.connector
corepack pnpm --filter @construction/api typecheck
```

Expected: connector tests and type checks pass.

---

## Task 4: Auth Login, Refresh, Logout, And Binding

**Files:**
- Add: `apps/api/src/auth/auth.module.ts`
- Add: `apps/api/src/auth/auth.controller.ts`
- Add: `apps/api/src/auth/auth.service.ts`
- Add: `apps/api/src/auth/access-token.guard.ts`
- Add: `apps/api/src/auth/current-user.decorator.ts`
- Add: `apps/api/src/auth/auth.types.ts`
- Add: `apps/api/src/auth/auth-body.parsers.ts`
- Modify: `apps/api/src/app.module.ts`
- Add: `apps/api/test/auth.e2e.test.ts`

- [ ] **Step 1: Write failing auth smoke tests**

Test:
- `POST /auth/wechat/login` creates or updates a user and returns access and refresh tokens.
- disabled users cannot log in.
- `POST /auth/refresh` rejects revoked or expired sessions.
- `POST /auth/logout` revokes the current session.
- `POST /auth/bind` consumes a pending invitation and binds exactly one worker or manager profile to the current user.

Run:

```bash
corepack pnpm --filter @construction/api test -- auth.e2e
```

Expected: fail because auth module does not exist.

- [ ] **Step 2: Implement auth module**

Implement:
- zod body parsers for login, refresh, and bind requests.
- token creation with JWT payload `{ sub, sid, sv }`.
- refresh token generation with `crypto.randomBytes`.
- token and invitation hashing with SHA-256.
- session revocation.
- binding transaction that rejects already-bound users, already-bound profiles, expired invitations, and mismatched target types.

- [ ] **Step 3: Verify auth**

Run:

```bash
corepack pnpm --filter @construction/api test -- auth.e2e
corepack pnpm --filter @construction/api typecheck
```

Expected: auth tests and type checks pass.

---

## Task 5: Scoped Permission Guard

**Files:**
- Add: `apps/api/src/authorization/authorization.module.ts`
- Add: `apps/api/src/authorization/require-permission.decorator.ts`
- Add: `apps/api/src/authorization/permissions.guard.ts`
- Add: `apps/api/src/authorization/authorization-context.service.ts`
- Add: `apps/api/src/authorization/authorization.types.ts`
- Add: `apps/api/test/authorization.e2e.test.ts`

- [ ] **Step 1: Write failing guard smoke tests**

Use a test controller with a protected route. Test:
- no bearer token returns 401,
- authenticated user without permission returns 403,
- authenticated user with permission and matching project scope succeeds,
- permission from one assignment and scope from another assignment does not succeed.

Run:

```bash
corepack pnpm --filter @construction/api test -- authorization.e2e
```

Expected: fail because authorization module does not exist.

- [ ] **Step 2: Implement authorization guard**

Implement:
- `@RequirePermission(...)` metadata decorator.
- `AuthorizationContextService` that resolves company/project/team target scopes from route params and Prisma.
- `PermissionsGuard` that loads user role assignments with direct role permissions, calls domain `authorizePermission`, and maps unauthorized cases to structured `ForbiddenException`.

Do not use `ProjectManagerMember.roleCode` as a permission source. Use `UserRole` only.

- [ ] **Step 3: Verify authorization**

Run:

```bash
corepack pnpm --filter @construction/api test -- authorization.e2e
corepack pnpm --filter @construction/api typecheck
```

Expected: authorization tests and type checks pass.

---

## Task 6: Full Verification

**Files:**
- Check all changed files.

- [ ] **Step 1: Run full validation**

Run:

```bash
corepack pnpm install
corepack pnpm db:generate
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
```

Expected: all available validations pass.

- [ ] **Step 2: Migration caveat**

If Docker is unavailable, record that real PostgreSQL migration execution could not be verified and include the Docker daemon error. Do not claim `prisma migrate dev` passed unless it actually ran against PostgreSQL.

---

## Self-Review

- Spec coverage: covers WeChat login, binding, account state, role inheritance, scoped permissions, and first-stage authorization. Mini Program UI, attendance submission, face service, project CRUD, and reports remain later modules.
- Placeholder scan: no placeholder implementation steps remain.
- Type consistency: role and scope concepts are named consistently across domain, Prisma, and API guard layers.
