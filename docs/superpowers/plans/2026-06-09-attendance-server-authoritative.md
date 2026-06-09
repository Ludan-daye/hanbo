# Server-Authoritative Attendance (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the punch endpoint server-authoritative — bound members auto-receive roles, submit requires `attendance.submit`, and `facePassed` is derived server-side from a face connector + threshold (no longer trusted from the client).

**Architecture:** A `FaceVerificationConnector` interface (mirroring `WechatCodeSessionConnector`) with a dev stub and a fail-closed default, selected by env. The attendance submit service derives the face result; the controller gains the permission guard; `bindByInvitation` grants the roles the user's active memberships imply. Tencent Cloud is the planned real connector (documented in the spec; not built here).

**Tech Stack:** NestJS 10, Prisma 6, Zod, Vitest + Supertest with in-memory Prisma doubles (no DB, no network).

**Spec:** `docs/superpowers/specs/2026-06-09-attendance-server-authoritative-design.md`.

---

## File Structure

- Modify `apps/api/src/config/env.ts` + `apps/api/test/env.test.ts`: `FACE_SCORE_THRESHOLD`, `FACE_DEV_STUB`, `FACE_DEV_STUB_SCORE`, optional `TENCENT_*`; prod guard.
- Create `apps/api/src/infrastructure/face/face-verification.types.ts`: interface, types, DI token, `deriveFacePassed`.
- Create `apps/api/src/infrastructure/face/stub-face-verification.connector.ts` + `fail-closed-face-verification.connector.ts`.
- Create `apps/api/test/face-verification.test.ts`: unit tests for `deriveFacePassed` + the connectors.
- Modify `apps/api/src/attendance/attendance.types.ts` + `attendance-body.parsers.ts`: drop `facePassed`/`faceScore` from the submit request.
- Modify `apps/api/src/attendance/attendance.service.ts`: inject the connector + env; derive `facePassed`.
- Modify `apps/api/src/attendance/attendance.module.ts`: provide the face connector via factory.
- Modify `apps/api/src/attendance/attendance.controller.ts`: add the `attendance.submit` permission guard.
- Modify `apps/api/test/attendance.e2e.test.ts`: new request contract, connector override, permission cases.
- Modify `apps/api/src/auth/auth.service.ts`: grant membership roles inside the bind transactions.
- Modify `apps/api/test/auth.e2e.test.ts`: binding → role assertions.

---

## Task 1: Env — face threshold, dev stub, prod guard

**Files:** Modify `apps/api/src/config/env.ts`; Test `apps/api/test/env.test.ts`.

- [ ] **Step 1: Add failing env tests** — append inside the existing `describe("loadEnv", …)` in `apps/api/test/env.test.ts`:

```ts
  test("defaults FACE_SCORE_THRESHOLD to 80 and FACE_DEV_STUB to false", () => {
    const env = loadEnv(baseEnv());
    expect(env.FACE_SCORE_THRESHOLD).toBe(80);
    expect(env.FACE_DEV_STUB).toBe(false);
    expect(env.FACE_DEV_STUB_SCORE).toBe(95);
  });

  test("rejects FACE_DEV_STUB=true when NODE_ENV is production", () => {
    expect(() => loadEnv({ ...baseEnv(), NODE_ENV: "production", FACE_DEV_STUB: "true" })).toThrow();
  });
```

- [ ] **Step 2: Run → fail** — `corepack pnpm --filter @construction/api exec vitest run test/env.test.ts` (FACE_* undefined).

- [ ] **Step 3: Implement** — in `apps/api/src/config/env.ts`, add these fields to the `z.object({ … })` (the file already defines `booleanStringSchema`):

```ts
    FACE_SCORE_THRESHOLD: z.coerce.number().min(0).max(100).default(80),
    FACE_DEV_STUB: booleanStringSchema,
    FACE_DEV_STUB_SCORE: z.coerce.number().min(0).max(100).default(95),
    TENCENT_SECRET_ID: z.string().default(""),
    TENCENT_SECRET_KEY: z.string().default(""),
    TENCENT_FACE_REGION: z.string().default(""),
```

And extend the existing `.superRefine((env, ctx) => { … })` body with:

```ts
    if (env.NODE_ENV === "production" && env.FACE_DEV_STUB) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FACE_DEV_STUB must be false in production",
        path: ["FACE_DEV_STUB"]
      });
    }
```

- [ ] **Step 4: Run → pass** — `corepack pnpm --filter @construction/api exec vitest run test/env.test.ts` (all pass).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/env.ts apps/api/test/env.test.ts
git commit -m "feat(api): add face threshold + dev-stub env config with prod guard"
```

---

## Task 2: Face verification connector (interface, stub, fail-closed, deriveFacePassed)

**Files:** Create `apps/api/src/infrastructure/face/face-verification.types.ts`, `stub-face-verification.connector.ts`, `fail-closed-face-verification.connector.ts`; Test `apps/api/test/face-verification.test.ts`.

- [ ] **Step 1: Write the failing unit test** — `apps/api/test/face-verification.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { deriveFacePassed } from "../src/infrastructure/face/face-verification.types.js";
import { StubFaceVerificationConnector } from "../src/infrastructure/face/stub-face-verification.connector.js";
import { FailClosedFaceVerificationConnector } from "../src/infrastructure/face/fail-closed-face-verification.connector.js";

describe("deriveFacePassed", () => {
  test("passes when detected and score >= threshold", () => {
    expect(deriveFacePassed({ detected: true, score: 90 }, 80)).toBe(true);
    expect(deriveFacePassed({ detected: true, score: 80 }, 80)).toBe(true);
  });
  test("fails when below threshold or not detected", () => {
    expect(deriveFacePassed({ detected: true, score: 79 }, 80)).toBe(false);
    expect(deriveFacePassed({ detected: false, score: 99 }, 80)).toBe(false);
  });
});

describe("StubFaceVerificationConnector", () => {
  test("returns the configured score and detected=true", async () => {
    const connector = new StubFaceVerificationConnector(88);
    const result = await connector.verifyFace({ selfieObjectKey: "k", baselineRef: null });
    expect(result).toEqual({ detected: true, score: 88 });
  });
});

describe("FailClosedFaceVerificationConnector", () => {
  test("never passes (detected=false, score=0)", async () => {
    const connector = new FailClosedFaceVerificationConnector();
    const result = await connector.verifyFace({ selfieObjectKey: "k", baselineRef: null });
    expect(result).toEqual({ detected: false, score: 0 });
  });
});
```

- [ ] **Step 2: Run → fail** — `corepack pnpm --filter @construction/api exec vitest run test/face-verification.test.ts` (modules missing).

- [ ] **Step 3: Implement the types/interface/token + deriveFacePassed** — `apps/api/src/infrastructure/face/face-verification.types.ts`:

```ts
export const FACE_VERIFICATION_CONNECTOR = Symbol("FACE_VERIFICATION_CONNECTOR");

export type FaceVerificationInput = {
  readonly selfieObjectKey: string;
  readonly baselineRef: string | null;
};

export type FaceVerificationResult = {
  readonly detected: boolean;
  readonly score: number;
};

export interface FaceVerificationConnector {
  verifyFace(input: FaceVerificationInput): Promise<FaceVerificationResult>;
}

export const deriveFacePassed = (result: FaceVerificationResult, threshold: number): boolean =>
  result.detected && result.score >= threshold;
```

- [ ] **Step 4: Implement the stub** — `apps/api/src/infrastructure/face/stub-face-verification.connector.ts`:

```ts
import type {
  FaceVerificationConnector,
  FaceVerificationInput,
  FaceVerificationResult
} from "./face-verification.types.js";

export class StubFaceVerificationConnector implements FaceVerificationConnector {
  private readonly score: number;

  constructor(score: number) {
    this.score = score;
  }

  async verifyFace(_input: FaceVerificationInput): Promise<FaceVerificationResult> {
    return { detected: true, score: this.score };
  }
}
```

- [ ] **Step 5: Implement the fail-closed connector** — `apps/api/src/infrastructure/face/fail-closed-face-verification.connector.ts`:

```ts
import type {
  FaceVerificationConnector,
  FaceVerificationInput,
  FaceVerificationResult
} from "./face-verification.types.js";

export class FailClosedFaceVerificationConnector implements FaceVerificationConnector {
  async verifyFace(_input: FaceVerificationInput): Promise<FaceVerificationResult> {
    return { detected: false, score: 0 };
  }
}
```

- [ ] **Step 6: Run → pass** — `corepack pnpm --filter @construction/api exec vitest run test/face-verification.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/infrastructure/face apps/api/test/face-verification.test.ts
git commit -m "feat(api): add FaceVerificationConnector interface, stub, fail-closed, deriveFacePassed"
```

---

## Task 3: Server-authoritative face in the attendance submit

**Files:** Modify `apps/api/src/attendance/attendance.types.ts`, `attendance-body.parsers.ts`, `attendance.service.ts`, `attendance.module.ts`; Test `apps/api/test/attendance.e2e.test.ts`.

- [ ] **Step 1: Update the request contract** — in `apps/api/src/attendance/attendance.types.ts`, delete the `facePassed` and `faceScore` members from `SubmitAttendanceRecordRequest` (lines reading `readonly facePassed: boolean;` and `readonly faceScore: string | null;`). Leave `AttendanceRecordResponse.facePassed`/`faceScore` unchanged (those describe the stored record).

In `apps/api/src/attendance/attendance-body.parsers.ts`, delete these two lines from `submitAttendanceRecordRequestSchema`:
```ts
  facePassed: z.boolean(),
  faceScore: z.union([positiveDecimalStringSchema, z.null()]),
```

- [ ] **Step 2: Inject the connector + env, derive facePassed** — in `apps/api/src/attendance/attendance.service.ts`:

1. Add imports:
```ts
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import {
  deriveFacePassed,
  FACE_VERIFICATION_CONNECTOR,
  type FaceVerificationConnector
} from "../infrastructure/face/face-verification.types.js";
```
2. Add constructor params (alongside the existing `@Inject(PrismaService)`):
```ts
    @Inject(FACE_VERIFICATION_CONNECTOR) private readonly faceConnector: FaceVerificationConnector,
    @Inject(API_ENV) private readonly env: ApiEnv,
```
3. In `submitAttendanceRecord`, replace the geofence/abnormal/record block so the face result is server-derived. Replace:
```ts
    const geofenceDecision = this.createGeofenceDecision(project, request.latitude, request.longitude);
    const abnormalReason = getAbnormalReason(request.facePassed, geofenceDecision);
```
with:
```ts
    const geofenceDecision = this.createGeofenceDecision(project, request.latitude, request.longitude);
    const faceResult = await this.faceConnector.verifyFace({
      baselineRef: null,
      selfieObjectKey: request.selfieObjectKey
    });
    const facePassed = deriveFacePassed(faceResult, this.env.FACE_SCORE_THRESHOLD);
    const abnormalReason = getAbnormalReason(facePassed, geofenceDecision);
```
and in the `attendanceRecord.create({ data: { … } })` change:
```ts
        facePassed: request.facePassed,
        faceScore: request.faceScore,
```
to:
```ts
        facePassed,
        faceScore: String(faceResult.score),
```
(`baselineRef: null` is intentional — baseline enrollment arrives with the object-storage slice; the stub ignores it.)

- [ ] **Step 3: Provide the connector in the module** — replace `apps/api/src/attendance/attendance.module.ts` with:

```ts
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { FACE_VERIFICATION_CONNECTOR, type FaceVerificationConnector } from "../infrastructure/face/face-verification.types.js";
import { FailClosedFaceVerificationConnector } from "../infrastructure/face/fail-closed-face-verification.connector.js";
import { StubFaceVerificationConnector } from "../infrastructure/face/stub-face-verification.connector.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";

import { AttendanceController } from "./attendance.controller.js";
import { AttendanceService } from "./attendance.service.js";

@Module({
  imports: [AuthModule, AuthorizationModule, PrismaModule],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    {
      provide: FACE_VERIFICATION_CONNECTOR,
      useFactory: (env: ApiEnv): FaceVerificationConnector =>
        env.FACE_DEV_STUB
          ? new StubFaceVerificationConnector(env.FACE_DEV_STUB_SCORE)
          : new FailClosedFaceVerificationConnector(),
      inject: [API_ENV]
    }
  ],
  exports: [AttendanceService]
})
export class AttendanceModule {}
```

- [ ] **Step 4: Update the e2e test** — in `apps/api/test/attendance.e2e.test.ts`:
  1. Remove `facePassed` and `faceScore` from every submit-request payload the test sends.
  2. Override the face connector in the test module so the test controls the score. Where the test builds the app via `Test.createTestingModule({ … }).overrideProvider(PrismaService).useValue(prisma)…`, add:
     ```ts
     .overrideProvider(FACE_VERIFICATION_CONNECTOR)
     .useValue({ verifyFace: async () => ({ detected: true, score: 95 }) })
     ```
     and import the token: `import { FACE_VERIFICATION_CONNECTOR } from "../src/infrastructure/face/face-verification.types.js";`
  3. Adjust assertions that previously expected the client-sent `facePassed`/`faceScore` to expect the server-derived values (`facePassed: true`, `faceScore: "95"` with the override above and the default threshold 80).
  4. Add a test that a low score fails the face check:
     ```ts
     test("derives facePassed=false when the face score is below the threshold", async () => {
       // build the app with an override returning { detected: true, score: 50 }
       // submit a punch that is inside the geofence
       // expect the created record to have facePassed === false and abnormalReason === "FACE_NOT_PASSED"
     });
     ```
     (Reuse the file's existing app-builder and submit helper; only the connector override and the assertion differ.)

- [ ] **Step 5: Run the attendance suite + typecheck**

Run:
```bash
corepack pnpm --filter @construction/api exec vitest run test/attendance.e2e.test.ts
corepack pnpm --filter @construction/api typecheck
```
Expected: pass; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/attendance apps/api/test/attendance.e2e.test.ts
git commit -m "feat(api): derive attendance facePassed server-side from the face connector"
```

---

## Task 4: Require `attendance.submit` on the punch endpoint

**Files:** Modify `apps/api/src/attendance/attendance.controller.ts`; Test `apps/api/test/attendance.e2e.test.ts`.

- [ ] **Step 1: Add a failing permission test** — in `apps/api/test/attendance.e2e.test.ts`, add a test that an authenticated user **without** `attendance.submit` for the project gets `403`. The test must seed the authorization context the `PermissionsGuard` reads: a `WORKER` role whose permissions do NOT include `attendance.submit` for the no-permission case, vs. one that does for the success case. (If the file's Prisma double does not yet expose `role.findMany`/`userRole.findMany`, add them following the pattern in `apps/api/test/bindings.e2e.test.ts`: `role.findMany` returns the seeded roles with nested `permissions[].permission.code`; `userRole.findMany` returns the seeded `user_roles` for the user with nested `role.code`, `scopeType`, `scopeId`.)

```ts
test("rejects a punch when the user lacks attendance.submit for the project", async () => {
  // seed: a bound worker who is an ACTIVE member of the project, but with NO attendance.submit permission
  // (e.g. seed a WORKER role with an empty permission set, and a WORKER@PROJECT user_role)
  // submit a punch -> expect HTTP 403
});
```

- [ ] **Step 2: Run → fail** — the punch currently has no permission guard, so the request is NOT 403 yet.
Run: `corepack pnpm --filter @construction/api exec vitest run test/attendance.e2e.test.ts`
Expected: the new test FAILS (got 200/201 instead of 403).

- [ ] **Step 3: Add the guard** — in `apps/api/src/attendance/attendance.controller.ts`, add the decorators to `submitAttendanceRecord` (the imports `RequirePermission` and `PermissionsGuard` already exist in this file):

```ts
  @Post("projects/:projectId/records")
  @RequirePermission({
    permissionCode: "attendance.submit",
    target: {
      paramName: "projectId",
      source: "projectParam"
    }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async submitAttendanceRecord(
```

- [ ] **Step 4: Update the success-path tests** — the existing happy-path submit tests must now seed a `WORKER` role that includes `attendance.submit` plus a `WORKER@PROJECT` `user_role` for the test user, so the guard passes. Update the seed helpers in the file accordingly (mirror `bindings.e2e.test.ts`'s `seedRole("WORKER", ["attendance.submit", …])`).

- [ ] **Step 5: Run → pass** — `corepack pnpm --filter @construction/api exec vitest run test/attendance.e2e.test.ts` (403 case + success cases pass).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/attendance/attendance.controller.ts apps/api/test/attendance.e2e.test.ts
git commit -m "feat(api): require attendance.submit permission on the punch endpoint"
```

---

## Task 5: Binding → role auto-wiring

**Files:** Modify `apps/api/src/auth/auth.service.ts`; Test `apps/api/test/auth.e2e.test.ts`.

- [ ] **Step 1: Add a failing test** — in `apps/api/test/auth.e2e.test.ts`, add a test that binding a worker who has an ACTIVE project membership grants a `WORKER` `user_role` at `PROJECT` scope. Extend the file's `AuthPrismaTestDouble` with the methods the grant needs (mirroring `bindings.e2e.test.ts`):
  - `projectWorkerMember.findMany({ where: { workerId, status } })` → returns the seeded active memberships `[{ projectId }]`.
  - `role.findUnique({ where: { code } })` → returns `{ id: 'role-WORKER' }` for `WORKER`.
  - `userRole.upsert({ where: { userId_roleId_scopeType_scopeId }, create, update })` → records into a `userRoles` array.

```ts
test("binding a worker grants WORKER@PROJECT for each active membership", async () => {
  // seed: an unbound worker profile "worker-1" with an ACTIVE project_worker_member at "project-1",
  //       a PENDING WORKER invitation for worker-1, a WORKER role, and an authenticated unbound user.
  // call POST /auth/bind with the invitation code
  // expect prisma.userRoles to contain { userId: "user-1", roleId: "role-WORKER", scopeType: "PROJECT", scopeId: "project-1" }
});
```

- [ ] **Step 2: Run → fail** — binding does not grant roles yet.
Run: `corepack pnpm --filter @construction/api exec vitest run test/auth.e2e.test.ts`
Expected: new test FAILS (no user_role created).

- [ ] **Step 3: Implement a shared grant helper** — in `apps/api/src/auth/auth.service.ts`, add a private method on `AuthService` that grants the roles a worker's active memberships imply (call it inside the `bindWorkerProfile` transaction, after the `user.updateMany` guarded write, using the same `transaction` object):

```ts
  private async grantWorkerMembershipRoles(
    transaction: PrismaTransactionClient,
    userId: string,
    workerProfileId: string
  ): Promise<void> {
    const role = await transaction.role.findUnique({ where: { code: "WORKER" } });
    if (role === null) {
      throw new ConflictException({ message: "WORKER_ROLE_NOT_FOUND" });
    }
    const memberships = await transaction.projectWorkerMember.findMany({
      where: { status: "ACTIVE", workerId: workerProfileId }
    });
    for (const membership of memberships) {
      await transaction.userRole.upsert({
        create: { roleId: role.id, scopeId: membership.projectId, scopeType: "PROJECT", userId },
        update: {},
        where: {
          userId_roleId_scopeType_scopeId: {
            roleId: role.id,
            scopeId: membership.projectId,
            scopeType: "PROJECT",
            userId
          }
        }
      });
    }
  }
```

Use the existing transaction-callback type for `PrismaTransactionClient` (the parameter type already used by `this.prisma.$transaction(async (transaction) => …)` in this file — reuse that inferred type; if an explicit type is needed, `Parameters<Parameters<PrismaService["$transaction"]>[0]>[0]`).

Then, inside `bindWorkerProfile`'s `$transaction` callback, after the `assertSingleGuardedWrite(userUpdate.count, …)` for the user and before the `auditLog.create`, call:
```ts
      await this.grantWorkerMembershipRoles(transaction, userId, workerProfileId);
```

- [ ] **Step 4: Manager parity** — add a `grantManagerMembershipRoles(transaction, userId, managerProfileId)` that reads `transaction.projectManagerMember.findMany({ where: { managerId: managerProfileId, status: "ACTIVE" } })` and, for each membership, grants `membership.roleCode` at `TEAM` scope (`scopeId: membership.teamScopeId`) when `teamScopeId` is non-null, else `PROJECT` scope (`scopeId: membership.projectId`). Call it inside `bindManagerProfile`'s transaction in the same position. (Look up the role id by `membership.roleCode` via `transaction.role.findUnique`.)

- [ ] **Step 5: Run → pass** — `corepack pnpm --filter @construction/api exec vitest run test/auth.e2e.test.ts` (binding-grants tests pass; existing bind tests still pass).

- [ ] **Step 6: Full suite + typecheck**

Run:
```bash
corepack pnpm --filter @construction/api typecheck
corepack pnpm -r test
```
Expected: typecheck clean; domain + api (+ miniprogram) suites all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/test/auth.e2e.test.ts
git commit -m "feat(api): grant membership-implied roles on profile binding"
```

---

## Task 6: End-to-end backend smoke (controller-run, optional)

**Files:** none (verification). Requires the local Postgres from the previous slice.

- [ ] **Step 1:** With Postgres up, the dev seed applied, and `FACE_DEV_STUB=true` in `apps/api/.env`, build + run the API. Dev-login as `dev-worker`, then `POST /attendance/projects/<dev-project>/records` with a valid in-geofence punch (no `facePassed`/`faceScore` in the body). Expect a created record with a server-derived `facePassed: true`. Bind the `dev-unbound` user to a worker profile that is a project member and confirm a `WORKER@PROJECT` `user_role` row appears.

No commit (verification only).

---

## Self-Review

- **Spec coverage:** A binding→role (Task 5) ✓; B submit permission (Task 4) + existing membership check retained ✓; C server-authoritative face — request contract change + connector + threshold + stub + fail-closed (Tasks 2–3) ✓; D geofence unchanged (Task 3 keeps `createGeofenceDecision`) ✓; E env config + prod guard (Task 1) ✓; F tests across all tasks ✓; fail-closed when stub off (Task 2 connector + Task 3 module factory) ✓.
- **Placeholder scan:** production code is complete; the e2e/auth test steps give the new test bodies and the exact Prisma-double methods to add, and point to the existing `bindings.e2e.test.ts` pattern to mirror — the implementer adapts the existing test file rather than re-deriving the harness.
- **Type consistency:** `FaceVerificationResult` (`detected`, `score`) is used identically by `deriveFacePassed`, the connectors, the module factory, and the service; `FACE_VERIFICATION_CONNECTOR` token is shared by the interface file, the module provider, and the e2e override; `FACE_SCORE_THRESHOLD`/`FACE_DEV_STUB`/`FACE_DEV_STUB_SCORE` names match between env (Task 1) and the module factory + service (Task 3).
- **Note:** Tasks 3 and 4 both edit `attendance.e2e.test.ts`; execute them in order so the connector override and the role seeding land together.
