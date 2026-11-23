# Construction Site Personnel Management System Design

## Purpose

Build a production-oriented WeChat Mini Program personnel management system for construction sites. The system focuses on worker and project management, WeChat account binding, hierarchical permissions, face-based attendance, location verification, photo evidence, configurable shifts, makeup attendance approval, and daily/weekly/monthly attendance statistics.

The first release follows the compliance-oriented scope but implements the practical core first: employee-photo face comparison with 1:1 verification, project attendance records, role-based access, and auditable attendance evidence. Authority-database identity verification, leave, field work, payroll, gate devices, and official regulatory reporting are reserved for later phases.

## Current Repository Context

The local repository is an empty Git repository with no application files, package configuration, or remote URL configured. This design therefore assumes a new implementation.

The linked GitHub repository was not publicly accessible during inspection, so no existing code patterns were available to follow.

## Architecture

Use a separated business-service and face-service architecture:

```text
WeChat Mini Program
  -> NestJS business API
  -> PostgreSQL business database
  -> Object storage for photos
  -> Independent face verification service
```

The WeChat Mini Program handles login, binding, attendance capture, makeup request submission, and personal record views.

The NestJS backend handles account binding, roles, permissions, companies, projects, teams, shifts, schedules, attendance validation, makeup approval, reports, and audit logs.

The face verification service is deployed independently. The first release uses CompreFace through its REST API for 1:1 employee-photo comparison. The backend owns the attendance decision; the face service only returns comparison evidence such as score, threshold result, and request metadata.

PostgreSQL stores structured business data. Object storage stores selfies, site photos, and baseline face images. The database stores object keys, hashes, verification results, timestamps, location data, and audit metadata rather than binary image data.

## Technology Choices

- Mini Program: native WeChat Mini Program or a Mini Program framework selected during implementation.
- Backend: Node.js with NestJS and strict TypeScript.
- Database: PostgreSQL.
- ORM/query layer: choose during implementation, with preference for strong typing and explicit migrations.
- Face service: CompreFace for the first release.
- Storage: S3-compatible object storage or cloud-provider object storage.
- Deployment: Docker Compose for the first production-like deployment, with a path to split services later.

NestJS uses classes for framework adapters such as controllers, providers, and external connectors. Business rules such as attendance calculation, permission checks, shift matching, and statistics should be implemented as typed pure functions.

## Role And Permission Model

Roles are hierarchical. A higher role inherits the permissions of lower roles plus its own role-specific permissions.

Roles from high to low:

1. System administrator
2. Company administrator
3. Project administrator
4. Team leader
5. Worker

Permission inheritance does not override data scope. Data access is restricted by company, project, team, and personal ownership.

Role behavior:

- System administrators can manage all companies, projects, users, roles, and system configuration.
- Company administrators can manage their company, create projects in it, manage its personnel, and view related reports. The user who creates a project is automatically granted project administrator on that project.
- Project administrators can manage assigned projects, teams, project personnel, schedules, and attendance exceptions.
- Team leaders can manage and view their own teams and review allowed makeup requests.
- Workers can log in, bind, view their own profile and records, attend, and submit makeup requests.

Attendance participation is separate from management authority:

- Project administrators must attend when they are project members with attendance enabled.
- Team leaders must attend when they are project members with attendance enabled.
- Workers must attend when they are active project members.
- Company administrators attend only if they are added to a project member relationship with attendance enabled.
- System administrators do not participate in project attendance by default.

All people who require attendance in a project appear in the same project attendance report. Reports can filter by role, team, work type, or status, but the default report view is unified across roles.

Management users cannot approve their own makeup requests. Self-approval is blocked even when the user has approval permissions.

## Account And Binding Flow

1. A user opens the Mini Program and logs in through WeChat.
2. The Mini Program sends the WeChat login code to the backend.
3. The backend exchanges the code for WeChat identity data and creates or finds the user account.
4. The user binds to an existing worker or manager profile through administrator assignment or an invitation code.
5. The backend stores the relationship between the WeChat account and the personnel profile.
6. A user without a bound personnel profile cannot attend or access project data.

The account table stores WeChat identity and binding state. Personnel information is stored in separate profile tables.

## Personnel Data Model

Tables are grouped into two categories: role/personnel information and project/attendance information.

### Role And Personnel Tables

These tables answer who the person is, which account they use, and which permissions they have.

- `users`: WeChat login accounts, openid, phone binding status, account status, and last login time.
- `worker_profiles`: worker master data stored separately for large worker volume. Fields include encrypted name-related identity data, encrypted ID number, phone, work type, real-name status, face profile status, employment status, and searchable non-sensitive helper fields.
- `manager_profiles`: management-person master data for system administrators, company administrators, project administrators, and team leaders.
- `roles`: role definitions and hierarchy level.
- `permissions`: permission definitions.
- `user_roles`: user role assignments with optional company, project, or team data scope.
- `face_profiles`: baseline face image object key, face-service identifier, profile owner type, profile owner id, status, version, and review metadata.
- `audit_logs`: sensitive operation audit records.

Workers are stored in `worker_profiles` rather than a generic employee table to reduce unnecessary joins and make high-volume worker queries easier to optimize.

Manager profiles are kept separate to avoid mixing management-only fields with worker fields. A project administrator or team leader who must attend is connected to project attendance through project membership rather than being forced into the worker table.

### Project And Attendance Tables

These tables answer where the person works, which schedule applies, and how attendance is calculated.

- `companies`: construction companies, contractors, or operating organizations.
- `projects`: construction sites, address, center latitude and longitude, geofence radius, project status, planned start date, and planned end date.
- `teams`: teams within a project.
- `project_worker_members`: worker project membership, including project id, worker id, team id, attendance requirement, entry time, exit time, project role label, and member status.
- `project_manager_members`: manager project membership, including project id, manager id, project role, team scope when applicable, attendance requirement, and member status.
- `shifts`: shift definitions.
- `shift_segments`: shift work segments. The first release exposes two segments for morning and afternoon work.
- `schedules`: schedule assignments at project, team, worker, or manager-member level.
- `attendance_records`: raw attendance attempts, evidence, face result, location result, validity status, source, and abnormal reason.
- `attendance_results`: daily attendance summaries.
- `makeup_requests`: makeup attendance requests, target attendance point, reason, evidence, approver, approval result, and timestamps.

The two project membership tables keep high-volume worker membership separate from lower-volume manager membership. Project reports combine the two relationship types into one logical attendance participant list.

## Shift And Attendance Rules

Shifts are configurable per project, team, or individual member. The effective schedule priority is:

```text
individual member schedule -> team schedule -> project default schedule
```

The first release supports four attendance points using two work segments:

```text
Segment 1 start: morning start
Segment 1 end: morning end
Segment 2 start: afternoon start
Segment 2 end: afternoon end
```

Each attendance point requires:

- a bound WeChat account,
- an active project membership,
- an effective schedule,
- a valid location inside the geofence,
- a selfie,
- a site photo,
- successful 1:1 face comparison against the bound person baseline.

Late and early-leave rules:

- The first segment start is the basis for late arrival.
- The second segment end is the basis for early leave.
- The two middle points are used only for work-duration calculation and missing-punch detection.
- The two middle points do not create lunch-break early-leave or lunch-break late-arrival statuses.

Work-duration calculation:

```text
total duration = segment 1 valid end - segment 1 valid start
               + segment 2 valid end - segment 2 valid start
```

If one segment has a valid start and end, that segment contributes to worked duration. If a required point is missing, the day is marked with missing punch. If all required points are missing for a scheduled workday, the day is marked absent unless an approved makeup record supplies valid attendance points.

Raw records are immutable. Repeated attendance attempts are preserved. Attendance summary selection rules are:

- For a segment start point, select the earliest valid record in the allowed time window.
- For a segment end point, select the latest valid record in the allowed time window.
- Invalid records are retained for audit and dispute handling.
- Approved makeup requests create approval-sourced valid attendance points.

## Face Verification

The first release uses employee-photo comparison rather than authority-database identity verification.

The verification mode is 1:1:

```text
current selfie -> compare with bound person's baseline face profile
```

The system does not perform 1:N face search during attendance. The user must already be authenticated and bound to a personnel profile before attendance.

This choice reduces compute cost, false matches, and privacy risk. It also makes the permission chain explicit: the system verifies that the current user resembles the bound person rather than trying to identify a stranger from the whole database.

Face-service responsibilities:

- detect whether a face is present,
- compare the current selfie with the baseline,
- return score, pass/fail result, and diagnostic metadata.

Backend responsibilities:

- determine whether the request belongs to an active member,
- determine which baseline face profile applies,
- enforce score thresholds,
- combine face, location, photo, shift, and permission results,
- persist evidence and audit records.

The service boundary allows CompreFace to be replaced later by a custom Python service using DeepFace, InsightFace, ONNXRuntime, or another model without changing the Mini Program flow or core attendance tables.

## Location And Photo Evidence

Each attendance attempt stores:

- project id,
- participant type,
- participant id,
- latitude,
- longitude,
- location accuracy when available,
- geofence distance result,
- selfie object key,
- site photo object key,
- image hashes,
- client device metadata,
- request time,
- server received time,
- face verification result,
- final attendance decision.

The geofence is configured per project. The default can be project-specific, and project administrators can set it when creating or editing the project within their authorized scope.

## Makeup Attendance

The first release supports makeup attendance approval. Leave and field-work workflows are reserved for later.

Makeup flow:

1. A participant submits a makeup request for a specific project, date, shift point, and reason.
2. The backend verifies that the target point belongs to an effective schedule and that the requester is a valid participant.
3. A team leader or project administrator reviews the request based on data scope.
4. The approver cannot be the requester.
5. Approval creates an approval-sourced valid attendance point.
6. Rejection records the reason and does not affect attendance calculations.

Makeup requests participate in audit logs and daily summary recalculation.

## Statistics And Reports

Daily summaries are calculated from immutable raw records and approved makeup records.

Daily metrics:

- total worked duration,
- segment durations,
- late status,
- early-leave status,
- missing-punch status,
- absence status,
- makeup status,
- abnormal record count.

Weekly and monthly reports aggregate daily summaries:

- total worked duration,
- scheduled days,
- actual attended days,
- absence count,
- late count,
- early-leave count,
- missing-punch count,
- approved makeup count,
- rejected makeup count.

Reports are project-based by default and include all attendance-required roles in the same view. Filters can narrow results by role, team, work type, person status, and date range.

## Performance And Data Access

Expected project scale is 200 to 1000 people per site, with concentrated attendance peaks.

Performance design:

- Store workers in a dedicated `worker_profiles` table.
- Separate worker project membership from manager project membership.
- Index `attendance_records` by `project_id`, attendance date, participant type, participant id, and attendance point.
- Index `attendance_results` by `project_id`, attendance date, participant type, and participant id.
- Index `project_worker_members` by `project_id`, `team_id`, and status.
- Keep image binaries out of PostgreSQL.
- Compress images before upload when practical.
- Run the face service as an independently scalable service.
- Add rate limiting around attendance submission.

If concentrated attendance peaks exceed one face-service instance, scale face verification horizontally or queue verification while preserving clear user-facing failure and retry states.

## Security, Privacy, And Compliance

The system processes sensitive personal information, including identity data, location data, face photos, and attendance records.

Required controls:

- clear user notice before collecting face, location, and photo data,
- explicit consent where required,
- encrypted storage for identity fields,
- restricted access to face and identity records,
- object storage private buckets,
- signed URLs or backend-mediated access for photo review,
- immutable audit logs for sensitive operations,
- no silent fallback when face, location, or photo verification fails,
- configurable retention policy for images and attendance evidence,
- no direct database storage of raw image binaries.

Authority-database identity verification is not part of the first release. The data model and service boundaries should allow adding it later as an optional onboarding or high-risk re-verification step.

## First Release Scope

Included:

- WeChat login and account binding.
- Role hierarchy and scoped permissions.
- Company, project, team, worker, and manager management.
- Project administrator project creation within authorized company scope.
- Worker and manager project membership.
- Configurable project, team, and individual schedules.
- Four-point attendance with two work segments.
- 1:1 face verification through independent service.
- Location geofence verification.
- Selfie and site photo upload.
- Raw attendance record preservation.
- Daily, weekly, and monthly attendance reports.
- Late, early leave, missing punch, absence, and worked-duration statistics.
- Makeup attendance request and approval.
- Audit logging for sensitive operations.

Excluded from first release:

- Payroll.
- Leave workflow.
- Field-work workflow.
- Official regulatory platform reporting.
- Gate or device integration.
- Authority-database real-person verification.
- Complex batch schedule import.
- Full custom face-recognition model training.

## Open Implementation Decisions

These decisions should be made during implementation planning:

- whether to use native Mini Program development or a framework,
- exact ORM or query builder,
- object storage provider,
- first deployment shape,
- face-score threshold calibration process,
- whether attendance summaries are recalculated synchronously after each record or by scheduled/background jobs.

## Acceptance Criteria

The design is implemented successfully when:

- every user logs in through WeChat and can only access scoped data,
- workers and attendance-required managers can bind to profiles and projects,
- project administrators can create projects within their authorized company scope,
- projects can configure geofence and shift rules,
- a participant can complete four attendance points with face, location, and photo evidence,
- invalid attendance attempts are recorded with actionable reasons,
- approved makeup requests affect attendance summaries,
- daily, weekly, and monthly reports show all attendance-required project roles in one view,
- late, early leave, missing punch, absence, and worked duration match the configured rules,
- sensitive data access and changes are auditable.
