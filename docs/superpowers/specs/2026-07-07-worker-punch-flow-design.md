# Worker Punch Flow — Camera + Geolocation Attendance Submission

## Purpose

Turn the **worker** panel's inert 打卡 tile into the system's core loop: a punch page where a
worker (or attendance-required manager) submits a real attendance record with geolocation and
two photos (selfie + site photo). This is the primary source of truth every existing report,
makeup, and aggregate view orbits.

Two backend gaps block the page today; this slice closes both:

1. **No upload channel.** `POST /attendance/projects/:projectId/records` requires non-empty
   `selfieObjectKey/selfieHash/sitePhotoObjectKey/sitePhotoHash`, but no endpoint accepts a file
   and no object storage exists.
2. **No worker-facing "today" view.** Nothing tells the client whether today is a workday, what
   the four punch points are, or which ones are already punched.

## Deployment & Portability Requirements (user-stated)

- **Local-first:** everything must run on a laptop with no external services — photos land on
  local disk, face verification stays on the existing dev stub, login stays on the dev stub.
- **Portable:** every external dependency sits behind an interface so production swaps
  (Tencent COS for storage, Tencent Cloud for face) touch only the infrastructure layer, never
  callers.
- **Implementation style:** superpowers subagent-driven development, task-per-subagent.

## Background and Constraints (verified against the code)

- `POST /attendance/projects/:projectId/records` (permission `attendance.submit`, projectParam
  scope) already does everything server-side: participant resolution from JWT, workday/shift
  lookup (`getShiftForAttendanceSubmissionOrThrow`), haversine geofence decision against the
  project's `centerLatitude/centerLongitude/geofenceRadiusM`, face scoring via the injected
  `FaceVerificationConnector`, and abnormal-reason derivation (`FACE_NOT_PASSED` |
  `OUTSIDE_GEOFENCE`). An outside-geofence punch is **recorded as INVALID, not rejected**. The
  endpoint is not modified by this slice.
- Point codes are fixed: `SEGMENT_1_START`, `SEGMENT_1_END`, `SEGMENT_2_START`, `SEGMENT_2_END`
  (two-segment shifts are a schema invariant).
- The face connector is already abstracted: `FACE_DEV_STUB=true` routes to
  `stub-face-verification.connector.ts` returning `FACE_DEV_STUB_SCORE` (default 95) against
  `FACE_SCORE_THRESHOLD` (default 80), so dev punches pass face by default. No face work in this
  slice.
- The API runs on **@nestjs/platform-express**, so `FileInterceptor` (bundled multer) handles
  multipart with no new HTTP adapter work.
- `/me/*` endpoints use bare `AccessTokenGuard`; scoping happens inside `MeService` by resolving
  the caller's own memberships. The new today endpoint follows the same pattern.
- Lat/lng travel as **strings** end-to-end (`latitude: z.string()` with coordinate refinement);
  the punch page must not convert to numbers when submitting.
- Primary test environment is **browser H5 on :8088**. `navigator.geolocation` is blocked on
  non-HTTPS remote origins, so the page needs a manual-coordinates fallback. `Taro.chooseImage`
  degrades to a file picker and `Taro.uploadFile` to XHR multipart in H5 — both acceptable.

## Architecture

```text
pages/punch/index.tsx (new)
  -> services/uploads.ts (new)            Taro.uploadFile -> POST /uploads
  -> services/me.ts (extended)            GET /me/projects/:projectId/attendance-today (new wrapper)
                                          POST /attendance/projects/:projectId/records (new wrapper)
API:
  UploadsModule (new)
    UploadsController  POST /uploads       AccessTokenGuard only
    UploadsService     validate -> hash -> StoragePort.put
  infrastructure/storage (new)
    StoragePort (interface) + LocalDiskStorage (dev implementation)
  MeController (extended)
    GET /me/projects/:projectId/attendance-today -> AttendanceService.getAttendanceToday
      (reuses schedule/shift/participant helpers; MeModule imports AttendanceModule)
```

## Backend Design

### `POST /uploads` (new module `apps/api/src/uploads/`)

- Guard: `AccessTokenGuard` only — any authenticated user may upload (workers are the primary
  callers and hold no management permission).
- Body: multipart form, single field `file`. Accepted content types: `image/jpeg`, `image/png`.
  Max size: 5 MB (multer `limits.fileSize`; multer ships transitively with
  @nestjs/platform-express and defaults to in-memory storage). Missing file or disallowed
  content type → 400 (`UPLOAD_FILE_REQUIRED`, `UPLOAD_CONTENT_TYPE_NOT_ALLOWED`); oversize →
  413 (Nest's standard mapping of multer's LIMIT_FILE_SIZE).
- Behaviour: compute sha256 of the bytes server-side, build
  `objectKey = uploads/<YYYY-MM-DD>/<uuid>.<jpg|png>`, persist via `StoragePort.put(objectKey,
  buffer, contentType)`.
- Response: `{ objectKey, hash, sizeBytes, contentType }` — exactly the fields the punch request
  needs, so the client never hashes anything.

### Storage port (`apps/api/src/infrastructure/storage/`)

- `StoragePort { put(objectKey: string, data: Buffer, contentType: string): Promise<void> }` —
  deliberately minimal (no get/delete until a consumer exists; YAGNI).
- `LocalDiskStorage` writes beneath `UPLOADS_DIR` (new env var, default `./var/uploads` relative
  to the API working directory; directory auto-created; path added to `.gitignore`).
- DI token `STORAGE_PORT` provided in `UploadsModule`, mirroring the existing
  `FACE_VERIFICATION_CONNECTOR` pattern. A future `CosStorage` implements the same port.

### `GET /me/projects/:projectId/attendance-today` (route on `MeController`, logic in `AttendanceService`)

- Guard: `AccessTokenGuard`. The route delegates to a new public
  `AttendanceService.getAttendanceToday(projectId, userId)` so it reuses the existing private
  helpers (`resolveAttendanceParticipant`, `loadProjectSchedulesWithShift`,
  `getDefaultShiftOrThrow`, `getChinaDateOnly`) instead of duplicating them in `MeService`.
  `MeModule` gains an import of `AttendanceModule` (which already exports `AttendanceService`).
  A non-participant gets the submit path's existing 400
  `ATTENDANCE_PARTICIPANT_MEMBERSHIP_NOT_FOUND` (same semantics as punching).
- "Today" is computed server-side as the **Asia/Shanghai** date (via the existing
  `getChinaDateOnly`), consistent with `assertOccurredAtMatchesAttendanceDate` on the punch
  path.
- Response shape:

```jsonc
{
  "attendanceDate": "2026-07-07",
  "configured": true,          // false when project lacks both a default shift and any schedule -> shiftName null, points [], isWorkday false
  "isWorkday": true,           // workdayMask + startsOn/endsOn window
  "shiftName": "标准两段班",
  "points": [                  // always the 4 codes, ordered
    {
      "pointCode": "SEGMENT_1_START",
      "scheduledTime": "08:00",
      "graceMins": 10,          // lateGraceMins for *_START, earlyGraceMins for *_END
      "record": null            // or { occurredAt, status, abnormalReason }
    }
  ],
  "geofence": { "centerLatitude": "31.2304000", "centerLongitude": "121.4737000", "radiusM": 300 },
  "result": null                // today's AttendanceResult if already materialised
}
```

- When multiple records exist for one point (duplicates are allowed by the write path), the
  **latest by occurredAt** is surfaced.

## Miniprogram Design

### Entry

- Worker panel 打卡 tile navigates to new page `pages/punch/index` (registered in
  `app.config.ts`). The tile stops being a stub for `worker`; other roles unchanged.

### Page flow (`pages/punch/index.tsx`)

1. Load `/me/projects`; multiple memberships → horizontal project selector (same pattern as
   submit-makeup); single membership → locked.
2. Load `attendance-today` for the selected project:
   - `configured:false` → StateView "项目未配置排班,请联系项目管理员".
   - `isWorkday:false` → "今天休息" state, no punch controls.
   - Workday → four point cards showing scheduled time and punch state (✅ 正常 / ⚠️ 异常 +
     reason / 未打). The first un-punched point is auto-selected as the active point; the user
     may tap any other un-punched point (late punching an earlier point is allowed and will be
     judged abnormal by the server — expected behaviour). Punched points are not selectable.
3. Location block: attempt `Taro.getLocation` on mount. Success → show coordinates plus live
   haversine distance to the geofence center ("距工地中心 120m · 围栏内"). Failure (the H5
   default) → two manual inputs (lat/lng, string-typed) plus a "填入项目中心" button that copies
   the geofence center, letting the tester exercise both inside- and outside-fence outcomes.
4. Photo block: two pickers — 自拍照 and 现场照 — via `Taro.chooseImage` (count 1, camera on
   device / file dialog in H5), thumbnail preview, re-pick allowed.
5. Submit button enables only when a point is selected, coordinates are non-empty, and both
   photos are chosen. On tap: upload selfie → upload site photo → `POST
   /attendance/projects/:projectId/records` with `{ attendanceDate, pointCode, occurredAt: now
   (ISO with offset), latitude, longitude, locationAccuracyM (from getLocation or null), selfie*
   and sitePhoto* from the two upload responses }` → refresh attendance-today → toast
   "打卡成功·正常" or "打卡成功·异常(超出围栏)".

### Services

- `services/uploads.ts` (new): `uploadImage(localPath): Promise<UploadResponse>` wrapping
  `Taro.uploadFile` with the JWT header; parses/validates the JSON response.
- `services/me.ts` + `me.types.ts` (extended): `fetchAttendanceToday(projectId)` and
  `submitAttendanceRecord(projectId, body)` — both wrappers are new (verified: `me.ts` today
  exports only fetchMyAttendanceRecords / fetchMyMakeups / fetchMyProjects / submitMakeup).

## Error Handling

- Upload failure → StateView with the server's `message` field when the error body parses,
  otherwise `UPLOAD_FAILED_<status>`. Submit failure → the shared `apiClient` convention
  (`REQUEST_FAILED_<status>`), same as every existing page. Chosen photos and entered
  coordinates are preserved so retry needs no re-entry.
- `DEFAULT_SHIFT_NOT_CONFIGURED*` and other submit-path errors surface verbatim (same convention
  as existing pages).
- Duplicate same-point submissions remain possible at the API level (no unique constraint —
  recorded as a known trade-off); the UI prevents the accidental case by disabling punched
  points.

## Testing

- **API (vitest + supertest):**
  - uploads: happy path jpeg/png (response fields + file lands under a temp `UPLOADS_DIR` +
    hash matches), missing file, disallowed content type, oversize file, unauthenticated 401.
  - attendance-today: unconfigured project, non-workday, workday with no records, workday with
    some points punched (latest-record-wins on duplicates), non-participant 400
    (`ATTENDANCE_PARTICIPANT_MEMBERSHIP_NOT_FOUND`, same as the punch path), unauthenticated 401.
- **Miniprogram:** typecheck + H5 build must pass; no component-test harness exists (unchanged).
- **End-to-end proof before handoff:** scripted curl flow as dev-worker — upload two images →
  submit SEGMENT_1_START inside fence (expect VALID) → submit SEGMENT_1_END with far
  coordinates (expect INVALID / OUTSIDE_GEOFENCE) → attendance-today reflects both.

## Out of Scope

- Real face verification (Tencent connector), face baseline collection, COS storage — the ports
  exist; implementations come later.
- Photo download/preview endpoints (nothing reads photos back yet).
- Uniqueness constraint on (participant, date, point).
- Identity-field encryption, system-admin panel, audit-log UI (tracked as separate future
  slices).
