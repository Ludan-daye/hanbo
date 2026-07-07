# 04 考勤域设计文档

本篇覆盖考勤域的全部落地实现:排班模型(Shift/ShiftSegment/Schedule)、打卡提交管线、领域层结算核心 `summarizeDailyAttendance`、日结果 `AttendanceResult` 的重算机制、补卡域 `MakeupRequest`,以及班次/作息配置接口。以下内容均以当前分支真实代码为准;尚未落地的部分显式标注「规划中」。

相关源码:

| 层 | 路径 |
| --- | --- |
| 领域核心 | `packages/domain/src/attendance.ts`(结算)、`packages/domain/src/roles.ts`(补卡审批授权) |
| 考勤模块 | `apps/api/src/attendance/attendance.controller.ts` / `attendance.service.ts` / `attendance.types.ts` / `attendance-body.parsers.ts` / `attendance.module.ts` |
| 补卡模块 | `apps/api/src/makeup/makeup.controller.ts` / `makeup.service.ts` / `makeup.types.ts` / `makeup-body.parsers.ts` |
| 人脸接口 | `apps/api/src/infrastructure/face/face-verification.types.ts` / `stub-face-verification.connector.ts` / `fail-closed-face-verification.connector.ts` |
| 数据模型 | `apps/api/prisma/schema.prisma`(`Shift`/`ShiftSegment`/`Schedule`/`AttendanceRecord`/`AttendanceResult`/`MakeupRequest`) |
| 测试 | `packages/domain/test/attendance.test.ts`、`apps/api/test/attendance.e2e.test.ts`、`apps/api/test/makeup.e2e.test.ts`、`apps/api/test/face-verification.test.ts` |

---

## 1. 排班模型

### 1.1 Shift(班次)与两段制不变式

`apps/api/prisma/schema.prisma` 中 `Shift` 挂在项目下(`projectId`),带 `name` 与 `isDefault Boolean @default(false)`,索引 `@@index([projectId, isDefault])`。

**两段制班次是全域不变式**:一个班次必须且只能有两个 `ShiftSegment`(上午段 + 下午段),对应四个打卡点位 `SEGMENT_1_START / SEGMENT_1_END / SEGMENT_2_START / SEGMENT_2_END`(Prisma enum `AttendancePointCode`,与领域层 `AttendancePointCode` 字面量类型一一对应)。该不变式由三处共同保证:

- 入口校验:`attendance-body.parsers.ts` 的 `configureDefaultShiftRequestSchema` 要求 `segments` 为二元组 `z.tuple([...])`,且 `sequence` 必须依次为 1、2(违反报 `SHIFT_SEGMENTS_MUST_USE_SEQUENCE_1_THEN_2`),每段 `startTime < endTime`(字符串 `HH:mm` 字典序比较,违反分别报 `SHIFT_SEGMENT_1_START_MUST_BE_BEFORE_END` / `SHIFT_SEGMENT_2_START_MUST_BE_BEFORE_END`)。
- 读取校验:`attendance.service.ts` 的 `createDefaultShiftResponse` 与 `createShiftRule` 都在排序后断言恰好两段且 `sequence` 为 1、2,否则抛 `DEFAULT_SHIFT_REQUIRES_TWO_ORDERED_SEGMENTS`——即使数据被绕过接口写坏,读取时也会失败(fail loud)。
- 数据库约束:`ShiftSegment` 上 `@@unique([shiftId, sequence])`,同一班次内 `sequence` 不可重复。

### 1.2 ShiftSegment(班段)

字段:`sequence Int`(1 或 2)、`startTime` / `endTime`(`String`,`HH:mm` 格式,由 parser 的 `timeSchema` 校验)、`lateGraceMins Int @default(0)`(迟到宽限)、`earlyGraceMins Int @default(0)`(早退宽限)。

宽限分钟的实际语义(见 `createShiftRule`,`attendance.service.ts`):

- 只有 **segment1 的 `lateGraceMins`** 参与迟到判定(`ShiftRule.lateGraceMinutes`);
- 只有 **segment2 的 `earlyGraceMins`** 参与早退判定(`ShiftRule.earlyLeaveGraceMinutes`);
- segment1 的 `earlyGraceMins` 与 segment2 的 `lateGraceMins` 当前不参与任何判定(中间两个点位不做迟到/早退,见 §3)。

### 1.3 Schedule(作息)与 workdayMask 位域算法

`Schedule` 是泛化的排班归属模型:`ownerType String` + `ownerId String`(多态 owner),当前实现只使用 `ownerType = "PROJECT"`(`attendance.service.ts` 中常量 `projectScheduleOwnerType`),即项目级作息;`ownerType = "TEAM"` 等留作扩展。字段:

- `shiftId`:关联到执行的班次;
- `startsOn DateTime @db.Date` / `endsOn DateTime? @db.Date`:生效区间,`endsOn = null` 表示无限期。区间判定见 `isDateInScheduleRange`:`startsOn <= attendanceDate && (endsOn == null || endsOn >= attendanceDate)`(闭区间);
- `workdayMask Int @default(127)`:**7 位位域**,bit `(weekday - 1)` 代表 ISO weekday(1=周一 … 7=周日)。127 = `0b1111111` 即全周工作。

位域算法(`attendance.service.ts`):

```ts
createWorkdayMask(workdays)  = workdays.reduce((mask, wd) => mask | (1 << (wd - 1)), 0)
expandWorkdayMask(mask)      = [1..7].filter(wd => (mask & (1 << (wd - 1))) !== 0)
isDateEnabledBySchedule      = (schedule.workdayMask & (1 << (getIsoWeekday(date) - 1))) !== 0
```

`getIsoWeekday` 基于 `getUTCDay()` 把周日的 0 映射为 7。`attendanceDate` 统一以 `dateOnlyToDate`(即 `${date}T00:00:00.000Z`,UTC 零点)入库,所以 `getUTCDay` 取到的正是该日历日的星期,不受服务器时区影响。

数据库层约束(migration `apps/api/prisma/migrations/20260603010000_schedule_workday_mask/migration.sql`):

```sql
ALTER TABLE "schedules" ADD COLUMN "workdayMask" INTEGER NOT NULL DEFAULT 127;
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_workdayMask_check" CHECK ("workdayMask" BETWEEN 1 AND 127);
```

即 mask 不允许为 0(不能配出「一周都不上班」的作息),入口 parser 也要求 `workdays` 至少 1 项且去重(`DEFAULT_SCHEDULE_WORKDAYS_MUST_BE_UNIQUE`)。

### 1.4 默认班次与默认作息的唯一性

两者的唯一性保证机制不同,需要分清:

- **默认作息(project 级 Schedule)唯一性:数据库部分唯一索引。** migration `20260603020000_unique_project_default_schedule/migration.sql`:

  ```sql
  CREATE UNIQUE INDEX "schedules_project_default_unique"
  ON "schedules"("ownerType", "ownerId")
  WHERE "ownerType" = 'PROJECT';
  ```

  一个项目最多一条 PROJECT 作息(部分索引不影响未来 TEAM 等其他 ownerType 的多条记录)。Prisma schema 里没有等价声明(Prisma 不支持部分唯一索引),该约束只存在于 SQL migration 中——**改 schema.prisma 时切勿丢掉这条 migration**。

- **默认班次(`Shift.isDefault`)唯一性:应用层事务保证。** `AttendanceService.configureDefaultShift` 在一个 `$transaction` 中先 `shift.updateMany({ data: { isDefault: false }, where: { projectId } })` 将旧班次全部降级,再创建新的 `isDefault: true` 班次(见 §6)。没有数据库级部分唯一索引兜底;读取侧一律用 `findFirst({ where: { isDefault: true, projectId } })`(`getDefaultShiftOrThrow`)。

---

## 2. 打卡提交管线

入口:`POST /attendance/projects/:projectId/records`(`attendance.controller.ts`),守卫 `AccessTokenGuard + PermissionsGuard`,`@RequirePermission({ permissionCode: "attendance.submit", target: { source: "projectParam" } })`。请求体由 `parseSubmitAttendanceRecordRequest` 用 Zod 校验(失败统一报 400 `INVALID_SUBMIT_ATTENDANCE_RECORD_REQUEST` 并附 `issues`)。注意:**经纬度以字符串端到端传输**(`latitude`/`longitude` 为 string,coordinate 正则 + 范围校验),`occurredAt` 为带 offset 的 ISO datetime。

`AttendanceService.submitAttendanceRecord`(`attendance.service.ts`)的完整流程:

### 2.1 项目与参与者解析(worker/manager 双轨)

1. `getProjectOrThrow(projectId)`:项目不存在 → 404 `PROJECT_NOT_FOUND`。
2. `resolveAttendanceParticipant(userId, projectId)`:并行查 `WorkerProfile` 与 `ManagerProfile`(均按 `userId` 唯一,并 include 该项目的 membership):
   - 两种 profile 同时存在 → 409 `USER_BOUND_TO_MULTIPLE_ATTENDANCE_PROFILE_TYPES`(一个 User 不允许同时是工人和管理者档案,数据一致性防线);
   - worker 轨:membership 存在但 `status !== "ACTIVE"` → 400 `WORKER_MEMBER_NOT_ACTIVE`;`requiresAttendance === false` → 400 `WORKER_MEMBER_ATTENDANCE_DISABLED`;通过则 `participantType = "WORKER"`,`participantId = workerProfile.id`;
   - manager 轨:同构判定,错误码为 `MANAGER_MEMBER_NOT_ACTIVE` / `MANAGER_MEMBER_ATTENDANCE_DISABLED`,`participantType = "MANAGER"`。`ProjectManagerMember.requiresAttendance @default(true)`——需要考勤的管理者与工人走完全相同的打卡与结算管线;
   - 两轨都没有有效 membership → 400 `ATTENDANCE_PARTICIPANT_MEMBERSHIP_NOT_FOUND`。

### 2.2 occurredAt 与 attendanceDate 的 Asia/Shanghai 一致性

`assertOccurredAtMatchesAttendanceDate(occurredAt, attendanceDate)`:用 `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", ... })`(`getChinaDateOnly`)把 `occurredAt` 格式化成中国时区的 `YYYY-MM-DD`,必须与客户端声明的 `attendanceDate` 相等,否则 400 `ATTENDANCE_OCCURRED_AT_DATE_MISMATCH`(payload 附 `occurredDate` 便于排查)。这保证了「考勤日」的定义唯一锚定在中国日历日,与客户端时区、服务器时区均无关。`attendanceDate` 本身以 UTC 零点的 `@db.Date` 落库(`dateOnlyToDate`)。

### 2.3 班次解析

`getShiftForAttendanceSubmissionOrThrow(projectId, attendanceDate)`:

1. `loadProjectSchedulesWithShift`:按 `ownerType="PROJECT"` + `ownerId=projectId` 查全部作息(include shift 及 segments,`startsOn desc` 排序);
2. **无任何作息 → 回退默认班次** `getDefaultShiftOrThrow`(每天都可打卡;默认班次也没有则 400 `DEFAULT_SHIFT_NOT_CONFIGURED`);
3. 有作息 → 找第一条同时满足 `isDateInScheduleRange`(日期在 startsOn/endsOn 闭区间内)且 `isDateEnabledBySchedule`(workdayMask 命中当日星期)的 active 作息,取其班次;
4. **有作息但当日不排班(休息日/区间外)→ 400 `ATTENDANCE_DATE_NOT_SCHEDULED`,直接拒绝打卡**。

对比:重算路径用的 `getShiftForAttendanceSummary` 逻辑相同,但第 4 步**不抛错而是回退默认班次**——重算(如补卡审批触发)不应因当日恰好不在排班内而失败,只有「提交新打卡」才被排班约束。

### 2.4 haversine 围栏判定

`createGeofenceDecision(project, latitude, longitude)`:以 `Project.centerLatitude / centerLongitude`(Decimal)为圆心,用标准 haversine 公式(`calculateDistanceMeters`,地球半径常量 `earthRadiusM = 6_371_000` 米)计算与打卡坐标的球面距离,`isInside = distanceM <= project.geofenceRadiusM`。距离以两位小数字符串(`formatMeters`)写入 `AttendanceRecord.geofenceDistanceM`(`Decimal(8,2)`)。

**围栏外打卡不拒绝、照常落库**,只是记为 INVALID(见 2.6)——业务上保留证据链,由日结果排除。

### 2.5 人脸打分(接口 + 双实现 + 阈值)

人脸校验被抽象为端口 `FaceVerificationConnector`(`apps/api/src/infrastructure/face/face-verification.types.ts`):

```ts
export interface FaceVerificationConnector {
  verifyFace(input: { selfieObjectKey: string; baselineRef: string | null }): Promise<{ detected: boolean; score: number }>;
}
export const deriveFacePassed = (result, threshold) => result.detected && result.score >= threshold;
```

DI 装配见 `attendance.module.ts`:token `FACE_VERIFICATION_CONNECTOR`(Symbol),`useFactory` 按 env 选择实现:

- `FACE_DEV_STUB=true` → `StubFaceVerificationConnector`:恒返回 `{ detected: true, score: FACE_DEV_STUB_SCORE }`(默认 95),开发/联调用;
- 否则 → `FailClosedFaceVerificationConnector`:恒返回 `{ detected: false, score: 0 }`——**在真实人脸服务接入前 fail-closed**,任何生产打卡的人脸判定都不通过(记录仍落库为 INVALID,不丢数据)。

阈值 `FACE_SCORE_THRESHOLD`(`apps/api/src/config/env.ts`,0–100,默认 80)。env schema 的 `superRefine` 强制 `NODE_ENV=production` 时 `FACE_DEV_STUB` 必须为 false,杜绝 stub 上生产。当前调用固定传 `baselineRef: null`(人脸底照未接,见 §9);`faceScore` 以字符串形式写入 `Decimal(6,4)` 列。

### 2.6 abnormalReason 优先级与记录落库

`getAbnormalReason(facePassed, geofenceDecision)`,**优先级:`FACE_NOT_PASSED` > `OUTSIDE_GEOFENCE`**(人脸不通过时不再看围栏),两者都通过则为 `null`。`status = abnormalReason === null ? "VALID" : "INVALID"`(Prisma enum `AttendanceRecordStatus`)。

随后 `attendanceRecord.create` 落库:`source: "DEVICE"`(enum `AttendanceRecordSource` 另一值为 `MAKEUP`,但补卡不生成 AttendanceRecord 行,见 §5)、四照片字段(`selfieObjectKey/selfieHash/sitePhotoObjectKey/sitePhotoHash`,当前由客户端提供,上传通道规划中,见 §8)、坐标、`locationAccuracyM`、`faceScore/facePassed/geofenceDistanceM/abnormalReason`。`serverReceivedAt` 由数据库 `@default(now())` 记录。

### 2.7 结果重算并同步返回

落库后立刻调 `recalculateAttendanceResult`(§4),响应体 `SubmitAttendanceRecordResponse = { record, result }`——客户端一次请求即拿到本次记录与当日最新结算。

e2e 覆盖(`apps/api/test/attendance.e2e.test.ts`):四点合法打卡的完整结算、休息日拒绝(`ATTENDANCE_DATE_NOT_SCHEDULED`)、需考勤 manager 可打卡、围栏外记录为 INVALID 且被日结果排除、人脸失败记录为 INVALID 且被排除、无 `attendance.submit` 权限 403、无有效 membership 400。

---

## 3. 领域核心:summarizeDailyAttendance(全系统唯一的考勤结算真理)

`packages/domain/src/attendance.ts` 是纯函数领域层,**不依赖 Prisma/Nest,是全系统唯一允许判定迟到/早退/缺卡/旷工/工时的地方**。API 层(打卡、重算)只负责组装输入并持久化输出,绝不自行复算任何布尔位。

### 3.1 输入契约

```ts
type AttendanceRecordInput = {
  id: string;
  pointCode: "SEGMENT_1_START" | "SEGMENT_1_END" | "SEGMENT_2_START" | "SEGMENT_2_END";
  occurredAt: Date;
  isValid: boolean;          // API 层映射:AttendanceRecord.status === "VALID";补卡恒为 true
  source: "DEVICE" | "MAKEUP";
};

type ShiftRule = {
  segment1StartAt: Date; segment1EndAt: Date;   // 由班段 HH:mm 拼当日 +08:00 得到的绝对时刻
  segment2StartAt: Date; segment2EndAt: Date;
  lateGraceMinutes: number;                     // = segment1.lateGraceMins
  earlyLeaveGraceMinutes: number;               // = segment2.earlyGraceMins
};
```

API 侧的 `createShiftRule(attendanceDate, segments)` 用 `dateOnlyAndTimeToChinaDate`(即 `new Date(\`${date}T${time}:00.000+08:00\`)`)把班段时间落到当日中国时区绝对时刻——Asia/Shanghai 无夏令时,固定 `+08:00` 偏移是安全的。

### 3.2 输出契约

```ts
type DailyAttendanceSummary = {
  selectedRecords: { [每个 pointCode]: AttendanceRecordInput | undefined };  // 深拷贝,防外部篡改
  workedMinutes: number;
  isLate: boolean; isEarlyLeave: boolean; isMissingPunch: boolean; isAbsent: boolean;
};
```

### 3.3 判定规则(逐条)

1. **点位选取 `selectRecord`**:每个点位只在 `isValid === true` 的记录中选取(INVALID 记录彻底不参与结算);同一点位有多条时,**START 类取最早 `occurredAt`,END 类取最晚**——即重复打卡时取对参与者最不利的上班时刻、最有利的下班时刻组合并不成立,准确说是「最早上班、最晚下班」,天然容忍重复打卡(§9 已知取舍)。
2. **段内顺序校验 `validateSegmentOrder`**:同段的 start 晚于 end 时抛出带 JSON payload 的 `Error`(`"Attendance segment start occurred after segment end"`,附两条记录 id 与时刻)。API 层用 `summarizeAttendanceOrThrow` 捕获并转 400 `ATTENDANCE_SUMMARY_RECALCULATION_FAILED`(payload 携带原始 `errorMessage`)。
3. **`workedMinutes`**:两段分别 `minutesBetween(start.occurredAt, end.occurredAt)`(毫秒差 `Math.trunc` 到分钟,向零取整)后求和;**任一段缺 start 或 end,该段计 0 分钟**,另一段照常计(缺卡不清零全天工时)。
4. **`isLate`**:仅看 `SEGMENT_1_START`——存在且 `occurredAt > segment1StartAt + lateGraceMinutes` 即迟到。segment2 上班晚不算迟到。
5. **`isEarlyLeave`**:仅看 `SEGMENT_2_END`——存在且 `occurredAt < segment2EndAt - earlyLeaveGraceMinutes` 即早退。segment1 早下不算早退。中间两个点位(`SEGMENT_1_END`/`SEGMENT_2_START`)不产生任何迟到/早退状态。
6. **`isMissingPunch`**:四个点位中**任一**为 `undefined`(无有效记录)即缺卡。
7. **`isAbsent`**:四个点位**全部**为 `undefined` 即旷工。因此 `isAbsent ⇒ isMissingPunch`;迟到/早退与缺卡可并存。

单元测试 `packages/domain/test/attendance.test.ts` 覆盖:完整四点无状态、迟到/早退只看首段起点与末段终点、中间点位不产生状态、缺卡时仍计已完成段工时、INVALID 记录被忽略、段顺序倒置抛上下文错误、输入 Date 变异不污染输出(深拷贝)。

---

## 4. AttendanceResult:upsert 键与重算触发点

`AttendanceResult` 是「参与者 × 项目 × 考勤日」的物化日结果,唯一键:

```prisma
@@unique([projectId, attendanceDate, participantType, participantId])
```

`AttendanceService.recalculateAttendanceResult` 以该复合键做 `prisma.attendanceResult.upsert`(where 键名 `projectId_attendanceDate_participantType_participantId`),重算是**全量重放**而非增量:

1. 并行取当日该参与者的**全部** `AttendanceRecord`(含 INVALID,按 `occurredAt asc`)与**全部 `status="APPROVED"` 的 `MakeupRequest`**;
2. 映射为领域输入:`toAttendanceRecordInput`(`isValid = status === "VALID"`,`source` 原样)与 `toMakeupRecordInput`(`isValid: true`、`occurredAt = requestedOccurredAt`、`source: "MAKEUP"`);
3. `summarizeDailyAttendance` 得出五个结算字段,连同两个审计计数一起写入:`abnormalRecordCount`(当日 INVALID 记录数)、`approvedMakeupCount`(已批补卡数)、`calculatedAt = now`。

**重算触发点(当前全部两处)**:

| 触发点 | 调用链 |
| --- | --- |
| 打卡提交 | `submitAttendanceRecord` → `recalculateAttendanceResult`(班次来自 `getShiftForAttendanceSubmissionOrThrow`) |
| 补卡审批通过 | `MakeupService.approveMakeupRequest` → `AttendanceService.recalculateDailyResult`(public 方法,班次来自 `getShiftForAttendanceSummary`,不排班日回退默认班次) |

补卡驳回**不**触发重算(结果不变,`ReviewMakeupResponse.result` 为 `null`)。报表域(`apps/api/src/reports`)只读 `AttendanceResult` 聚合,不参与写入。

---

## 5. 补卡域:MakeupRequest 生命周期

模型(`schema.prisma`):`MakeupRequest` 记录 `projectId / requesterUserId / participantType / participantId / attendanceDate(@db.Date) / pointCode / requestedOccurredAt / reason`,状态机 `MakeupStatus: PENDING → APPROVED | REJECTED`(无撤回/重开),审批三元组 `approverUserId / approvalReason / approvedAt`。**补卡不生成 `AttendanceRecord` 行**——APPROVED 的请求在重算时以 `source: "MAKEUP"`、`isValid: true` 的虚拟记录身份直接进入 `summarizeDailyAttendance`(§4)。

### 5.1 提交(PENDING)

`POST /makeups/projects/:projectId/requests`(`makeup.controller.ts`),权限 `makeup.request` @ projectParam scope。`MakeupService.createMakeupRequest`:

1. 项目存在性 + 默认班次存在性(`DEFAULT_SHIFT_NOT_CONFIGURED_FOR_MAKEUP`);
2. `assertPointBelongsToDefaultShift`:`pointCode` 映射到段序(`SEGMENT_1_*` → 1,否则 2),默认班次缺该段 → 400 `MAKEUP_POINT_NOT_IN_DEFAULT_SHIFT`(两段制下通常恒过,属防御性校验);
3. **参与者从 JWT 推导**:`resolveMakeupParticipant(userId, projectId)` 与考勤侧同构的 worker/manager 双轨解析(错误码带 `_FOR_MAKEUP` 后缀 + `USER_BOUND_TO_MULTIPLE_MAKEUP_PROFILE_TYPES` / `MAKEUP_PARTICIPANT_MEMBERSHIP_NOT_FOUND`)——**只能为自己补卡**,请求体里没有 participant 字段;
4. `requestedOccurredAt` 与 `attendanceDate` 的 Asia/Shanghai 一致性双重校验:parser 层(`makeup-body.parsers.ts` 的 superRefine,issue `REQUESTED_OCCURRED_AT_DATE_MISMATCH`)+ service 层(`MAKEUP_REQUESTED_OCCURRED_AT_DATE_MISMATCH`);
5. 以 `status: "PENDING"` 落库。

### 5.2 审批(approve / reject 均需 approvalReason)

`POST /makeups/requests/:requestId/approve|reject`。两个路由**只挂 `AccessTokenGuard`,不挂控制器级 `@RequirePermission`**——requestId 本身不携带项目 scope,授权下沉到 service(控制器内有注释说明此设计)。共同流程:

1. `getPendingMakeupRequestOrThrow`:不存在 → 404 `MAKEUP_REQUEST_NOT_FOUND`;非 PENDING → 409 `MAKEUP_REQUEST_NOT_PENDING`;
2. `assertReviewerAuthorized`:
   - `resolveReviewTargetScope`:按 `participantType` 查该参与者的项目 membership(缺失 → `MAKEUP_WORKER_MEMBER_NOT_FOUND` / `MAKEUP_MANAGER_MEMBER_NOT_FOUND`);worker 有 `teamId`(manager 有 `teamScopeId`)则构造 TEAM scope,否则 PROJECT scope;
   - 调领域函数 `canApproveScopedMakeupRequest`(`packages/domain/src/roles.ts`):**先强制 `approverUserId !== requesterUserId`(违者 `SELF_APPROVAL_BLOCKED`,任何权限都不能自批)**,再走通用 `authorizePermission` 校验审批人在目标 scope 上持有 `makeup.approve`(scope 包含关系:GLOBAL ⊇ COMPANY ⊇ PROJECT ⊇ TEAM,见 `scopeIncludesTarget`);
   - 拒绝 → 403 `MAKEUP_APPROVAL_DENIED`(payload 附领域层 `reason`);
3. **并发安全的状态迁移**:`updateMany({ where: { id, status: "PENDING" }, data: {...} })`,`count !== 1` → 409 `MAKEUP_REQUEST_NOT_PENDING`(两个审批人竞态时只有一人成功);`approvalReason` 由 parser 强制非空(approve 与 reject 共用 `reviewMakeupRequestBodySchema`,缺失 → 400 `INVALID_REVIEW_MAKEUP_REQUEST`);
4. approve 额外写 `approvedAt`,并触发 `attendanceService.recalculateDailyResult(projectId, attendanceDate, participantType, participantId)`——**这是 APPROVED 补卡以 `source=MAKEUP` 进入结算的唯一通路**,响应返回 `{ request, result }`;reject 返回 `{ request, result: null }`。

### 5.3 待审列表

`GET /makeups/teams/:teamId/pending`,权限 `makeup.approve` @ teamParam scope。`listTeamPendingRequests`:按 team 找出 ACTIVE 的 worker(`teamId`)与 manager(`teamScopeId`)成员,列出这些参与者在该项目下的 PENDING 请求(`createdAt asc`)。

e2e 覆盖(`apps/api/test/makeup.e2e.test.ts`):班组长批准并重算、自批与跨班组审批被拒、驳回不重算、pending 列表只含本班组 PENDING、无权限 403(列表与提交)。

---

## 6. 班次/作息配置接口

两个接口均要求 `project.manage` @ projectParam scope(`attendance.controller.ts`)。

### 6.1 `PUT /attendance/projects/:projectId/default-shift`

`configureDefaultShift`:请求体 `{ name, segments: [seg1, seg2] }`(校验见 §1.1)。在单个 `$transaction` 中:

1. `shift.updateMany` 把该项目**全部**旧班次降级 `isDefault: false`——旧班次**不删除**(历史 `Schedule` 可能引用,且保留审计);
2. 新建 `isDefault: true` 的 `Shift`,逐条创建两个 `ShiftSegment`。

语义是「替换默认班次」而非「编辑」,每次 PUT 产生新班次实体。**注意**:已存在的 `Schedule.shiftId` 仍指向旧班次,更换默认班次后若希望排班跟随,需要重新 PUT default-schedule。

### 6.2 `PUT /attendance/projects/:projectId/default-schedule`

`configureDefaultSchedule`:请求体 `{ startsOn, endsOn(可 null), workdays[] }`(`endsOn < startsOn` → `DEFAULT_SCHEDULE_ENDS_ON_MUST_NOT_BE_BEFORE_STARTS_ON`)。前置要求默认班次已配置(`DEFAULT_SHIFT_NOT_CONFIGURED`)。在 `$transaction` 中:

1. `schedule.deleteMany({ where: { ownerId: projectId, ownerType: "PROJECT" } })`——**硬删除后重建**,项目级作息始终只有一条(与 §1.4 的部分唯一索引互为双保险);
2. 以当前默认班次的 `shiftId` + `createWorkdayMask(workdays)` 创建新 `Schedule`。

---

## 7. 错误码常量表(考勤域全量)

### 7.1 请求体解析(400,均带 Zod `issues`)

| message | 触发条件 | 出处 |
| --- | --- | --- |
| `INVALID_CONFIGURE_DEFAULT_SHIFT_REQUEST` | default-shift 请求体不合法 | `attendance-body.parsers.ts` |
| `INVALID_CONFIGURE_DEFAULT_SCHEDULE_REQUEST` | default-schedule 请求体不合法 | 同上 |
| `INVALID_SUBMIT_ATTENDANCE_RECORD_REQUEST` | 打卡请求体不合法 | 同上 |
| `INVALID_CREATE_MAKEUP_REQUEST` | 补卡提交体不合法 | `makeup-body.parsers.ts` |
| `INVALID_REVIEW_MAKEUP_REQUEST` | 审批体缺 `approvalReason` | 同上 |

内嵌 Zod issue 常量:`SHIFT_SEGMENTS_MUST_USE_SEQUENCE_1_THEN_2`、`SHIFT_SEGMENT_1_START_MUST_BE_BEFORE_END`、`SHIFT_SEGMENT_2_START_MUST_BE_BEFORE_END`、`DEFAULT_SCHEDULE_ENDS_ON_MUST_NOT_BE_BEFORE_STARTS_ON`、`DEFAULT_SCHEDULE_WORKDAYS_MUST_BE_UNIQUE`、`REQUESTED_OCCURRED_AT_DATE_MISMATCH`。

### 7.2 考勤服务(`attendance.service.ts`)

| message | HTTP | 触发条件 |
| --- | --- | --- |
| `PROJECT_NOT_FOUND` | 404 | projectId 不存在 |
| `DEFAULT_SHIFT_NOT_CONFIGURED` | 400 | 需要默认班次(回退/配作息)但未配置 |
| `DEFAULT_SHIFT_REQUIRES_TWO_ORDERED_SEGMENTS` | 400 | 班次段数据不满足两段制不变式 |
| `ATTENDANCE_DATE_NOT_SCHEDULED` | 400 | 项目有作息但当日不在排班内(仅提交路径) |
| `WORKER_MEMBER_NOT_ACTIVE` / `MANAGER_MEMBER_NOT_ACTIVE` | 400 | membership 非 ACTIVE |
| `WORKER_MEMBER_ATTENDANCE_DISABLED` / `MANAGER_MEMBER_ATTENDANCE_DISABLED` | 400 | `requiresAttendance = false` |
| `USER_BOUND_TO_MULTIPLE_ATTENDANCE_PROFILE_TYPES` | 409 | userId 同时绑定 worker 与 manager 档案 |
| `ATTENDANCE_PARTICIPANT_MEMBERSHIP_NOT_FOUND` | 400 | 双轨都无有效项目 membership |
| `ATTENDANCE_OCCURRED_AT_DATE_MISMATCH` | 400 | `occurredAt` 的中国日期 ≠ `attendanceDate` |
| `ATTENDANCE_SUMMARY_RECALCULATION_FAILED` | 400 | 领域结算抛错(如段顺序倒置),payload 带 `errorMessage` |

### 7.3 补卡服务(`makeup.service.ts`)

| message | HTTP | 触发条件 |
| --- | --- | --- |
| `PROJECT_NOT_FOUND` / `TEAM_NOT_FOUND` | 404 | 项目/班组不存在 |
| `DEFAULT_SHIFT_NOT_CONFIGURED_FOR_MAKEUP` | 400 | 提交补卡时项目无默认班次 |
| `MAKEUP_POINT_NOT_IN_DEFAULT_SHIFT` | 400 | pointCode 对应段在默认班次中不存在 |
| `WORKER_MEMBER_NOT_ACTIVE_FOR_MAKEUP` / `MANAGER_MEMBER_NOT_ACTIVE_FOR_MAKEUP` | 400 | membership 非 ACTIVE |
| `WORKER_MEMBER_ATTENDANCE_DISABLED_FOR_MAKEUP` / `MANAGER_MEMBER_ATTENDANCE_DISABLED_FOR_MAKEUP` | 400 | `requiresAttendance = false` |
| `USER_BOUND_TO_MULTIPLE_MAKEUP_PROFILE_TYPES` | 409 | 双档案冲突 |
| `MAKEUP_PARTICIPANT_MEMBERSHIP_NOT_FOUND` | 400 | 无有效项目 membership |
| `MAKEUP_REQUESTED_OCCURRED_AT_DATE_MISMATCH` | 400 | 补卡时刻与考勤日中国日期不符(service 层兜底) |
| `MAKEUP_REQUEST_NOT_FOUND` | 404 | requestId 不存在 |
| `MAKEUP_REQUEST_NOT_PENDING` | 409 | 状态非 PENDING(含 updateMany 竞态失败) |
| `MAKEUP_APPROVAL_DENIED` | 403 | 领域授权拒绝(payload 带 `reason`:`SELF_APPROVAL_BLOCKED` / `NO_ASSIGNMENTS` / `MISSING_PERMISSION` / `SCOPE_MISMATCH`) |
| `MAKEUP_WORKER_MEMBER_NOT_FOUND` / `MAKEUP_MANAGER_MEMBER_NOT_FOUND` | 400 | 审批时参与者 membership 已缺失 |

### 7.4 数据常量(非错误)

`AttendanceRecord.abnormalReason` 取值:`FACE_NOT_PASSED`、`OUTSIDE_GEOFENCE`(优先级前者高,见 §2.6);`status`:`VALID`/`INVALID`;`source`:`DEVICE`/`MAKEUP`(后者当前无落库行)。

---

## 8. 进行中的扩展(规划中)

以下两项设计已定稿、**代码尚未落地**(已确认 `apps/api/src` 无对应实现,计划文件所有任务复选框未勾选)。详见 `docs/superpowers/specs/2026-07-07-worker-punch-flow-design.md` 与 `docs/superpowers/plans/2026-07-07-worker-punch-flow.md`。

- **`POST /uploads`(规划中)**:仅 `AccessTokenGuard` 的 multipart 上传端点(jpeg/png、≤5MB),服务端算 sha256、生成 `objectKey = uploads/<YYYY-MM-DD>/<uuid>.<ext>`,经 `StoragePort` 接口持久化(开发用 `LocalDiskStorage` 写 `UPLOADS_DIR`,生产可换 COS 实现,DI 模式复刻 `FACE_VERIFICATION_CONNECTOR`)。响应 `{ objectKey, hash, sizeBytes, contentType }`,补齐打卡请求所需的照片四字段来源。
- **`GET /me/projects/:projectId/attendance-today`(规划中)**:挂在 `MeController`、逻辑落 `AttendanceService.getAttendanceToday`(复用 `resolveAttendanceParticipant` / 排班解析 / `getChinaDateOnly`)。返回当日(Asia/Shanghai)是否工作日、班次名、四点位的计划时间/宽限/已打记录(同点位多条取 `occurredAt` 最新)、围栏参数与当日 `AttendanceResult`。是小程序打卡页(`pages/punch/index`,同为规划中)的数据源。

---

## 9. 已知取舍

1. **同点位重复打卡无唯一约束**:`AttendanceRecord` 上没有 `(projectId, attendanceDate, participantId, pointCode)` 唯一键,重复打卡全部落库;一致性由领域层选取规则(START 取最早、END 取最晚,§3.3)消化。代价是表体积与「最新记录」语义需要查询时自行归并(attendance-today 规划中即按此处理)。
2. **人脸 baseline 未接**:`FaceProfile` 模型已建(`schema.prisma`)但打卡链路固定传 `baselineRef: null`;生产环境实际处于 fail-closed(所有打卡人脸不过、记 INVALID),真实人脸服务(腾讯云,env 已预留 `TENCENT_*` 变量)接入前该路径不可用于生产结算。
3. **照片对象存储进行中**:`selfieObjectKey/sitePhotoObjectKey` 目前由客户端自报字符串,服务端不校验对象真实存在、也无上传通道;`POST /uploads` + `StoragePort`(§8)落地后闭环。
4. **默认班次唯一性仅应用层保证**(§1.4):`Shift.isDefault` 无部分唯一索引,绕过 API 直写库可造成多默认班次,读取侧 `findFirst` 会取到不确定的一条。
5. **重算为同步全量重放**:每次打卡/审批都在请求内重放当日全部记录并 upsert,当前数据量下简单可靠;无异步队列、无跨日批量重算入口(改班次/作息不会自动重算历史结果)。

---

## 文档状态

- 日期:2026-07-07
- 分支:`codex/foundation`
- 依据代码:`apps/api/src/attendance`、`apps/api/src/makeup`、`packages/domain/src/attendance.ts`、`packages/domain/src/roles.ts`、`apps/api/prisma/schema.prisma` 及 migrations、`apps/api/test/*.e2e.test.ts`、`packages/domain/test/attendance.test.ts`
