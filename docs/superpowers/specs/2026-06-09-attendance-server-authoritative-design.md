# Server-Authoritative Attendance (Backend) Design

## Purpose

Make the attendance punch endpoint server-authoritative, closing the integrity gaps in the current
implementation. After this slice:

- A bound worker or manager automatically holds the role their project membership implies, so the
  permission system actually governs attendance.
- Submitting a punch requires the `attendance.submit` permission (scoped to the project), in
  addition to the active-membership check the service already performs.
- The face result (`facePassed`/`faceScore`) is **derived on the server** from a face-verification
  connector plus a score threshold — the client can no longer assert that it passed face check.

The face connector is designed to be backed by **Tencent Cloud 人脸比对 (Face Comparison)** as the
first real implementation. This slice ships the connector interface and a development stub; it does
not call Tencent live. Object storage, baseline-face enrollment, the real Tencent call, and the
worker punch UI are explicitly later slices.

This is the first slice of the "worker attendance" work, scoped to be fully verifiable with the
existing in-memory Prisma test harness (no database, no external services).

## Current Behavior (grounded in the code)

- `POST /attendance/projects/:projectId/records` is guarded by `AccessTokenGuard` **only** — no
  permission or role check.
- `AttendanceService.submitAttendanceRecord(projectId, userId, request)` already resolves the
  participant from the authenticated user's `workerProfile` / `managerProfile` and validates the
  project membership: `getValidWorkerMember` / `getValidManagerMember` reject when the membership is
  missing, not `ACTIVE`, or has `requiresAttendance = false`. Participant identity is **derived from
  the user**, never taken from the request body.
- The **geofence decision is already computed server-side** (`createGeofenceDecision` from the
  project center/radius and the submitted latitude/longitude); `getAbnormalReason` returns
  `OUTSIDE_GEOFENCE` when outside.
- `facePassed` and `faceScore` are taken **from the request body** and trusted as-is
  (`getAbnormalReason(request.facePassed, …)` returns `FACE_NOT_PASSED` when the client says so).
- `bindByInvitation` links a worker/manager profile to the user and sets `isBound`, but creates **no
  `user_roles`**. `user_roles` are created only when a project is created (its creator gets
  `PROJECT_ADMIN`). So a freshly bound worker is an active member with no role.

The gaps this slice closes: (1) no role from binding/membership, (2) no permission check on submit,
(3) client-trusted face result.

## A. Binding → Role Auto-Wiring

When a profile is bound to a user, grant the `user_roles` that the user's **active** project
memberships imply, in the same transaction as the bind. Role follows membership ("membership-driven").

- **Worker bind** (`bindWorkerProfile`): for each `project_worker_member` of the worker profile with
  `status = ACTIVE`, grant `WORKER` at `PROJECT` scope (`scopeId = projectId`).
- **Manager bind** (`bindManagerProfile`): for each `project_manager_member` with `status = ACTIVE`,
  grant the membership's `roleCode` at the scope implied by the membership — `TEAM` scope
  (`scopeId = teamScopeId`) when `teamScopeId` is set, otherwise `PROJECT` scope (`scopeId = projectId`).
- Grants are idempotent (`userRole.upsert` on the `userId_roleId_scopeType_scopeId` unique key) and
  produce an audit log entry (`auth.role.grant`).
- A reusable helper (e.g. `grantMembershipRoles(tx, userId, profileType, profileId)`) holds this
  logic so a future "add an already-bound worker/manager to a project" endpoint can call the same
  code path. (No such endpoint exists today — `createProjectWorker` always creates a fresh, unbound
  profile — so the bind-time grant covers every current flow.)

This makes B's permission check satisfiable for real (non-seeded) users.

## B. Submit Authorization

Tighten `POST /attendance/projects/:projectId/records`:

- Add `@RequirePermission({ permissionCode: "attendance.submit", target: { source: "projectParam",
  paramName: "projectId" } })` and `@UseGuards(AccessTokenGuard, PermissionsGuard)` — the same
  pattern the project-management endpoints in this controller already use. `AttendanceModule` already
  imports the authorization wiring for those endpoints, so no new module wiring is required.
- Keep the service's existing membership and `requiresAttendance` validation unchanged. The result is
  defense in depth: the **guard** requires the `attendance.submit` permission at the project scope
  (provided by `WORKER@PROJECT` via A, and inherited by manager roles through the role hierarchy),
  and the **service** still confirms an active membership with attendance enabled and derives the
  participant. A user with neither is rejected before the service runs; a user with the role but no
  active membership is rejected by the service.

Note: because higher roles inherit lower-role permissions (`getEffectivePermissionCodes`), a
`TEAM_LEADER` or `PROJECT_ADMIN` who is an attendance-required member also passes `attendance.submit`.

## C. Server-Authoritative Face Decision

Stop trusting the client for the face result; derive it on the server.

**Request contract change** — `submitAttendanceRecordRequest` drops `facePassed` and `faceScore`. The
client submits only evidence and context: `attendanceDate`, `pointCode`, `latitude`, `longitude`,
`locationAccuracyM`, `occurredAt`, `selfieObjectKey`, `selfieHash`, `sitePhotoObjectKey`,
`sitePhotoHash`.

**Face verification connector** — a new boundary, mirroring the `WechatCodeSessionConnector` pattern:

```ts
type FaceVerificationInput = {
  readonly selfieObjectKey: string;        // the current selfie reference
  readonly baselineRef: string | null;     // the bound person's enrolled baseline (null until enrolled)
};
type FaceVerificationResult = {
  readonly detected: boolean;              // a face was found in the selfie
  readonly score: number;                  // similarity 0–100 (matches Tencent / Face++ / Rekognition)
};
interface FaceVerificationConnector {
  verifyFace(input: FaceVerificationInput): Promise<FaceVerificationResult>;
}
```

The service computes `facePassed = result.detected && result.score >= FACE_SCORE_THRESHOLD`, persists
`faceScore` (the connector's score) and the server-derived `facePassed`, and feeds `facePassed` into
`getAbnormalReason` exactly as today.

**Implementations:**

- **Development stub** (`StubFaceVerificationConnector`): returns a configurable result
  (`detected: true`, `score: FACE_DEV_STUB_SCORE`, default a passing value) without any network call.
  This is the implementation that runs locally and in tests. It is selected only outside production.
- **Tencent Cloud** (`TencentFaceVerificationConnector`): the planned real implementation, calling
  Tencent Cloud 人脸识别 (iai) `CompareFace` — `POST` to the regional endpoint with `TC3-HMAC-SHA256`
  request signing, two face images (the selfie and the enrolled baseline) as Base64, and a
  `FaceModelVersion`; the response `Score` (0–100) maps directly to `result.score`. Its exact request
  shaping and signing are documented here as the target contract. It is **not implemented or called in
  this slice** — it requires Tencent credentials and the real image bytes that the object-storage and
  baseline-enrollment slice provides. Until then `baselineRef` is looked up from the participant's
  `face_profiles` record when present (null otherwise) and only the stub consumes it.

**Connector selection** — a provider factory chooses the connector from env: the stub when
`FACE_DEV_STUB = true` (non-production only), otherwise a configured real provider. With no real
provider configured and the stub disabled, face verification **fails closed** (`facePassed = false`),
never silently passing — consistent with the spec's "no silent fallback" rule.

## D. Geofence

Unchanged. The server already computes the geofence decision from the project center/radius and the
submitted coordinates, and records `OUTSIDE_GEOFENCE` as the abnormal reason. This slice keeps that
behavior and simply combines it with the now-server-derived `facePassed` in `getAbnormalReason`.

## E. Configuration

Add to the env schema (`apps/api/src/config/env.ts`):

- `FACE_SCORE_THRESHOLD` — number, the minimum similarity (0–100) for a pass (e.g. 80, aligned with
  Tencent/Face++ recommendations for standard authentication).
- `FACE_DEV_STUB` — boolean (string `"true"`/`"false"`, default false), the same safe boolean pattern
  as `WECHAT_DEV_LOGIN`. `loadEnv` rejects `FACE_DEV_STUB = true` when `NODE_ENV = production`.
- `FACE_DEV_STUB_SCORE` — number, the score the stub returns (default a passing value ≥ threshold).
- `TENCENT_SECRET_ID`, `TENCENT_SECRET_KEY`, `TENCENT_FACE_REGION` — optional; required only when the
  Tencent connector is the active provider (a later activation). Not needed in this slice.

## F. Testing (in-memory Prisma doubles; no database, no network)

- **Binding → role:** worker bind grants `WORKER@PROJECT` for each active worker membership; manager
  bind grants the membership's role at `TEAM`/`PROJECT` scope; idempotent re-bind; no membership → no
  grant.
- **Submit authorization:** a member without the `attendance.submit` permission → 403; a user with the
  permission but no active membership → service rejection; a bound worker with role + active membership
  → record created.
- **Server-authoritative face:** the request no longer accepts `facePassed`/`faceScore`; with the stub
  returning a score ≥ threshold the record is `facePassed = true`, below threshold or `detected = false`
  → `facePassed = false` and `abnormalReason = FACE_NOT_PASSED`; `fail-closed` when no provider is
  configured and the stub is disabled.
- **Threshold logic:** pure-function unit test for `score/detected/threshold → facePassed`.
- **Env:** `loadEnv` rejects `FACE_DEV_STUB = true` under `NODE_ENV = production`.
- **Regression:** the existing attendance e2e tests are updated for the new request contract and the
  server-derived face result; all other suites stay green.

## Out of Scope (later slices)

- Object storage (real selfie / site-photo upload, presigned URLs, object existence/hash checks).
- Baseline-face enrollment and the real image bytes the Tencent connector needs.
- The live Tencent Cloud call (credentials + activation).
- The worker punch UI (camera, geolocation) — device APIs that cannot be verified on this host.

## Acceptance Criteria

- Binding a worker (or manager) grants the role(s) their active memberships imply; a freshly bound
  worker can pass `attendance.submit`.
- `POST /attendance/projects/:projectId/records` rejects callers lacking `attendance.submit` for the
  project, and still rejects non-members / attendance-disabled members.
- The submit request no longer carries `facePassed`/`faceScore`; the stored values are derived on the
  server from the face connector and `FACE_SCORE_THRESHOLD`; with no provider and the stub off, face
  fails closed.
- The face connector interface matches what a Tencent Cloud 人脸比对 implementation needs (two images
  → 0–100 score), and the stub runs locally and in tests.
- `FACE_DEV_STUB` cannot be enabled in production.
- All backend/domain test suites pass.
