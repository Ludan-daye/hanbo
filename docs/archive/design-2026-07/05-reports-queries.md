# 05 报表与查询

本文档描述建筑工地人员管理系统中所有"读侧"能力:个人查询(`/me/*`)、班组长/项目管理员/公司管理员的报表与列表查询,以及小程序端对应页面。内容以当前代码为准;未实现的能力标注「规划中」。

相关代码位置:

- 报表:`apps/api/src/reports/reports.controller.ts`、`apps/api/src/reports/reports.service.ts`、`apps/api/src/reports/reports.types.ts`、`apps/api/src/reports/reports-query.parsers.ts`
- 个人查询:`apps/api/src/me/me.controller.ts`、`apps/api/src/me/me.service.ts`、`apps/api/src/me/me-query.parsers.ts`
- 补卡查询:`apps/api/src/makeup/makeup.controller.ts`、`apps/api/src/makeup/makeup.service.ts`
- 花名册/组织列表:`apps/api/src/management/management.controller.ts`、`apps/api/src/management/management.service.ts`
- 权限模型:`packages/domain/src/roles.ts`、`apps/api/src/authorization/permissions.guard.ts`、种子数据 `apps/api/prisma/seed.ts`
- 小程序:`apps/miniprogram/src/pages/*`、`apps/miniprogram/src/services/*`

---

## 1. 查询端点全景表

所有端点均要求 `AccessTokenGuard`(Bearer access token)。带权限码的端点额外经 `PermissionsGuard` 校验:守卫从路径参数解析目标 scope(`projectParam` / `teamParam` / `companyParam`,team 会向上解析出 project 与 company),再调用 `authorizePermission()`(`packages/domain/src/roles.ts`)。

权限继承规则(影响下表"权限"列的实际可用角色):`getEffectivePermissionCodes()` 让高等级角色继承低等级角色的全部权限(`ROLE_LEVEL`:SYSTEM_ADMIN=1 < COMPANY_ADMIN=2 < PROJECT_ADMIN=3 < TEAM_LEADER=4 < WORKER=5,数字小者权限大),scope 匹配由 `scopeIncludesTarget()` 决定(COMPANY 级 assignment 覆盖该公司下所有 project/team 目标)。种子中 `attendance.view` 只授予 `PROJECT_ADMIN` 与 `TEAM_LEADER`(`apps/api/prisma/seed.ts` 的 `rolePermissionSeeds`),公司管理员访问公司报表靠继承 + COMPANY scope 覆盖。

### 1.1 工人(任意登录用户,`/me/*` 与 `/auth/me`)

| 方法/路径 | 权限 | 查询参数 | 响应要点 |
| --- | --- | --- | --- |
| GET `/auth/me` | 仅登录 | 无 | `MeResponse`:用户信息、profile、角色 assignments(小程序据此路由角色首页) |
| GET `/me/attendance-records` | 仅登录 | `from`、`to`(必填,date-only,`from<=to`) | 本人打卡明细 `AttendanceRecordResponse[]`,读 `AttendanceRecord`,跨全部项目 |
| GET `/me/makeups` | 仅登录 | 无 | 本人发起的补卡申请 `MakeupRequestResponse[]`,全部状态,`createdAt desc` |
| GET `/me/projects` | 仅登录 | 无 | 本人项目 membership `MyProjectMembership[]`(worker+manager 双轨合并,见 §4.3) |

### 1.2 班组长(team 维度)

| 方法/路径 | 权限 | 查询参数 | 响应要点 |
| --- | --- | --- | --- |
| GET `/reports/teams/:teamId/daily` | `attendance.view`@team | `date`(date-only) | 班组日报 `DailyAttendanceReportResponse`(participants + totals) |
| GET `/reports/teams/:teamId/weekly` | `attendance.view`@team | `weekStartDate`(date-only) | 班组周报 `RangeAttendanceReportResponse`(起始日+6 天) |
| GET `/reports/teams/:teamId/monthly` | `attendance.view`@team | `month`(`YYYY-MM`) | 班组月报 `RangeAttendanceReportResponse` |
| GET `/makeups/teams/:teamId/pending` | `makeup.approve`@team | 无 | 班组成员 PENDING 补卡 `MakeupRequestResponse[]`,`createdAt asc` |
| GET `/management/teams/:teamId/participants` | `attendance.view`@team | 无 | 班组花名册(worker 按 `teamId`、manager 按 `teamScopeId` 过滤,含非 ACTIVE 成员) |

### 1.3 项目管理员(project 维度)

| 方法/路径 | 权限 | 查询参数 | 响应要点 |
| --- | --- | --- | --- |
| GET `/reports/projects/:projectId/daily` | `attendance.view`@project | `date` | 项目日报 |
| GET `/reports/projects/:projectId/weekly` | `attendance.view`@project | `weekStartDate` | 项目周报 |
| GET `/reports/projects/:projectId/monthly` | `attendance.view`@project | `month` | 项目月报 |
| GET `/management/projects/:projectId/participants` | `attendance.view`@project | 无 | 项目花名册(全部状态成员,worker+manager) |
| GET `/management/projects/:projectId/teams` | `team.manage`@project | 无 | 项目班组列表 `TeamResponse[]` |
| GET `/management/projects/:projectId/invitations` | `binding.invitation.create`@project | 无 | 绑定邀请列表 `BindingInvitationListItem[]`,`createdAt desc` |

### 1.4 公司管理员(company 维度)

| 方法/路径 | 权限 | 查询参数 | 响应要点 |
| --- | --- | --- | --- |
| GET `/reports/companies/:companyId/daily` | `attendance.view`@company(继承) | `date` | 全公司日报(全项目参加者平铺) |
| GET `/reports/companies/:companyId/weekly` | `attendance.view`@company(继承) | `weekStartDate` | 全公司周报 |
| GET `/reports/companies/:companyId/monthly` | `attendance.view`@company(继承) | `month` | 全公司月报 |
| GET `/management/companies/:companyId/projects` | `attendance.view`@company | 无 | 公司项目列表 `ProjectResponse[]`,`createdAt asc` |
| GET `/management/companies/:companyId/participants` | `attendance.view`@company | 无 | 公司级花名册 `CompanyParticipantResponse[]`(每行额外带 `projectName`) |

注:`attendance` 与 `makeup` 模块的 GET 端点仅上述这些;`apps/api/src/attendance/attendance.controller.ts` 只有写侧(打卡提交、默认班次/排班配置),没有明细查询端点(项目/班组维度的打卡明细下钻「规划中」)。

---

## 2. 聚合报表实现(daily / weekly / monthly)

三个层级(project / team / company)共用同一套计算内核:`ReportsService.computeDailyReport()` / `computeRangeReport()`(`apps/api/src/reports/reports.service.ts`),差异只在参加者加载:

- 项目:`loadParticipants(projectId)` — 该项目全部 `requiresAttendance=true` 且 `status="ACTIVE"` 的 `ProjectWorkerMember` + `ProjectManagerMember`;
- 班组:`loadTeamParticipantBases(teamId)` — 同上,worker 加 `teamId` 过滤、manager 加 `teamScopeId` 过滤;
- 公司:`loadCompanyParticipantBases(companyId)` — 先查该公司全部 project id,再对 `projectId in projectIds` 拉取全项目成员。

### 2.1 聚合口径(`AttendanceReportTotals`,以代码为准)

每参加者每日先生成 `AttendanceDayValues`(`createDayValues()`):

- 当日存在 `AttendanceResult` → 直接取结算字段:`isLate` / `isEarlyLeave` / `isMissingPunch` / `isAbsent` / `workedMinutes` / `approvedMakeupCount` / `abnormalRecordCount`,`hasResult=true`;
- 当日无 Result 且该日排班 → `createAbsentDayValues()`:记 `isAbsent=true` 且 `isMissingPunch=true`;
- 当日无 Result 且非排班日 → `createRestDayValues()`:全 0,不计入任何异常。

再由 `addDayToTotals()` 累加为 totals:

| totals 字段 | 口径 |
| --- | --- |
| `participantCount` | 参加者数(ACTIVE 且 requiresAttendance 的 worker+manager 成员数) |
| `scheduledDays` | 排班日人次(Σ isScheduled) |
| `actualAttendedDays` | 实出人次:`hasResult && !isAbsent` |
| `absenceCount` | 缺勤人次:`isScheduled && isAbsent` |
| `lateCount` / `earlyLeaveCount` | 迟到/早退人次(不校验 isScheduled,直接取 Result 标志) |
| `missingPunchCount` | 缺卡人次:`isScheduled && isMissingPunch` |
| `approvedMakeupCount` | 补卡通过次数(Σ Result 字段) |
| `abnormalRecordCount` | 异常打卡记录数(Σ Result 字段) |
| `workedMinutes` | 工时分钟数(Σ Result 字段) |

日报 participants 每行为 `DailyAttendanceReportParticipant`(单日布尔标志);周/月报每行为 `RangeAttendanceReportParticipant`(按人先聚合 totals,再 `mergeTotals()` 汇总到响应级 totals)。参加者基础字段(`AttendanceReportParticipantBase`)含 `memberId` / `participantType`(`"WORKER" | "MANAGER"`)/ `phone` / `teamId` / `teamName` / `projectRoleLabel` / `workType` 等;worker 的 `displayName` 恒为 `null`(WorkerProfile 无姓名字段),manager 取 `manager.name`。

### 2.2 排班判定

`isScheduledReportDate()`:取 `Schedule` 表中 `ownerType="PROJECT"`、`ownerId in projectIds` 的记录(`loadProjectSchedules()`);项目没有任何排班时**每天都算排班日**;有排班时须落在 `startsOn`~`endsOn`(endsOn 为 null 视为开放)且 `workdayMask` 的 ISO weekday 位命中(`1 << (weekday-1)`,周一为 bit0)。

公司级注意点:schedules 是全公司项目排班的**合集**,`schedules.some(...)` 任一项目该日排班即对**所有参加者**判定为排班日——跨项目粗粒度合并,不区分参加者所属项目(已知口径问题,精确化「规划中」)。

### 2.3 周与月的日期窗口

- 周报:`weekStartDate` 起 `addDays(startDate, 6)` 止,含两端共 7 天;服务端**不强制**该日期为周一,任意起始日均可(小程序默认传"最近的周一")。
- 月报:`getMonthStartDate(month)` = `${month}-01T00:00:00.000Z`,`getMonthEndDate()` 用 `Date.UTC(year, month+1, 0)` 得当月最后一天;窗口为整月含两端。
- 参数校验在 `reports-query.parsers.ts`:zod + 真实日历校验(`isValidDateOnly` / `isValidMonth`),非法则 400(`INVALID_DAILY_REPORT_QUERY` 等)。

### 2.4 时区处理

- `attendanceDate` 在**写入侧**即被折算为中国日历日:打卡(`apps/api/src/attendance/attendance.service.ts` 的 `getChinaDateOnly()`,`Intl.DateTimeFormat` + `timeZone: "Asia/Shanghai"`)与补卡(`apps/api/src/makeup/makeup.service.ts` 同名函数)都以 Asia/Shanghai 计算 date-only,存入 Prisma `@db.Date` 列。
- 报表侧把 date-only 字符串一律按 UTC 午夜解析(`dateOnlyToDate()` → `T00:00:00.000Z`),仅作为"日历日标签"参与相等/范围比较与 weekday 计算,与写入侧的中国日期标签一致,因此服务端计算自洽。
- 小程序端默认日期用 `getUTCFullYear()/getUTCMonth()/getUTCDate()` 生成(`todayDate()` / `lastMondayDate()`,见 `apps/miniprogram/src/pages/reports/index.tsx` 等):在中国时区 00:00–08:00 之间打开页面时,默认日期会比本地日历早一天(已知边缘问题)。

### 2.5 公司报表的"按项目分解"

当前实现**不按项目分组**:`getCompanyDailyReport()` 等把全公司参加者平铺在一个 `participants` 数组里,participant 行上没有 `projectId`/`projectName` 字段(只有 `teamId`/`teamName`);响应顶层 `projectId` 字段被复用填入了 `companyId`(`loadCompanyParticipantBases()` 返回 `projectId: companyId`,字段语义混用)。按项目分解的小计/明细「规划中」;目前公司管理员看单项目数据需改走 `/reports/projects/:projectId/*`(其 COMPANY scope assignment 可通过权限校验)。

---

## 3. 数据来源辨析:AttendanceRecord vs AttendanceResult

| 数据表(`apps/api/prisma/schema.prisma`) | 内容 | 读它的查询 |
| --- | --- | --- |
| `AttendanceRecord`(明细) | 单次打卡:`pointCode`、`occurredAt`、定位(`latitude/longitude/geofenceDistanceM`)、自拍/工地照 objectKey 与 hash、`faceScore/facePassed`、`status`(VALID/ABNORMAL)、`abnormalReason` | 仅 `GET /me/attendance-records`(查询侧唯一) |
| `AttendanceResult`(结算) | 每人每日一行(`@@unique([projectId, attendanceDate, participantType, participantId])`):`workedMinutes`、`isLate/isEarlyLeave/isMissingPunch/isAbsent`、`approvedMakeupCount`、`abnormalRecordCount` | `/reports/*` 全部九个端点 |
| `MakeupRequest` | 补卡申请与审批状态 | `GET /me/makeups`、`GET /makeups/teams/:teamId/pending` |
| 成员/组织表(`ProjectWorkerMember` 等) | membership、班组、邀请 | `GET /me/projects`、`/management/*` 列表 |

`AttendanceResult` 由 `AttendanceService.recalculateDailyResult()` 在打卡提交和补卡审批通过时重算生成——**没有定时批跑**,不打卡就不会有 Result 行。

口径差异带来的现象:

- **新工人/从未打卡的成员没有任何 Result 行**:报表对每个排班日走 `createAbsentDayValues()`,整段窗口显示为缺勤+缺卡(月报中一个从未打卡的成员会贡献整月的 `absenceCount`)。成员在窗口中途入场时同样如此——报表不感知 membership 生效日期,入场前的排班日也计缺勤(已知口径问题)。
- **报表看不到打卡明细维度的异常**:`AttendanceRecord.status="ABNORMAL"` 不直接进报表,报表只透出 Result 上聚合过的 `abnormalRecordCount`。
- **`/me/attendance-records` 反过来不含结算结论**:只有原始打卡流水,无迟到/早退/缺勤判定;个人查看自己"当日是否算迟到"的能力「规划中」。
- 补卡审批通过后 Result 被同步重算(`MakeupService.approveMakeupRequest()` 调 `recalculateDailyResult`),因此报表中的 `approvedMakeupCount`/缺卡状态在审批后即时生效。

---

## 4. `/me` 系列细节(`apps/api/src/me/me.service.ts`)

### 4.1 `GET /me/attendance-records` 的 from/to 语义

- `from`/`to` 为 date-only(`YYYY-MM-DD`),解析器 `parseMyAttendanceRecordsQuery()`(`me-query.parsers.ts`)做真实日历校验并强制 `from <= to`(违反返回 400 `INVALID_MY_ATTENDANCE_RECORDS_QUERY` / `FROM_MUST_BE_BEFORE_OR_EQUAL_TO_TO`)。
- 查询条件 `attendanceDate: { gte: fromDate, lte: toDate }` —— **双端都含**。
- 身份展开:同时查用户的 `workerProfile` 与 `managerProfile`,拼 `OR` 条件(`participantType: "WORKER"` / `"MANAGER"` + 对应 profile id),用户不存在或两个 profile 都没有时返回空数组(不报错)。
- **不按项目过滤**:返回该用户在所有项目的打卡记录;排序 `attendanceDate desc, occurredAt desc`。

### 4.2 `GET /me/makeups`

按 `requesterUserId = userId` 过滤(即"我发起的",与 participant 身份无关),包含 PENDING/APPROVED/REJECTED 全部状态,`createdAt desc`,响应经 `createMakeupRequestResponse()`(`makeup.service.ts`)序列化(含 `approvalReason`/`approvedAt`/`approverUserId`)。

### 4.3 `GET /me/projects` 的 membership 双轨合并

worker 轨与 manager 轨分别查询后顺序拼接(worker 在前):

- worker 轨:`ProjectWorkerMember`(`status="ACTIVE"`,include `project`+`team`)→ `projectRoleLabel` 取成员表的 `projectRoleLabel` 字段,`teamId`/`teamName` 取 `team`;
- manager 轨:`ProjectManagerMember`(`status="ACTIVE"`,include `project`+`teamScope`)→ `projectRoleLabel` 取 `roleCode`,`teamId`/`teamName` 取 `teamScope`。

两轨各自 `createdAt asc` 排序。若一个用户同时持有两种 profile,这里会双轨都输出(注意与补卡创建不同:`MakeupService.resolveMakeupParticipant()` 对双 profile 抛 409 `USER_BOUND_TO_MULTIPLE_MAKEUP_PROFILE_TYPES`)。

---

## 5. 分页与排序现状

**全部查询端点均无分页**——所有 `findMany` 都没有 `take`/`skip`/cursor,也没有 `page`/`limit` 查询参数;公司级花名册和公司报表会一次性返回全公司成员(已知缺口,人员规模上千后需引入分页/流式导出)。

排序均为服务端固定,不可由客户端指定:

| 查询 | 排序 |
| --- | --- |
| 报表 participants | 成员 `createdAt asc`,worker 全体在前、manager 全体在后 |
| `/me/attendance-records` | `attendanceDate desc, occurredAt desc` |
| `/me/makeups` | `createdAt desc` |
| `/makeups/teams/:teamId/pending` | `createdAt asc`(先到先审) |
| `/management/*` 花名册/项目/班组 | `createdAt asc` |
| `/management/projects/:projectId/invitations` | `createdAt desc` |

---

## 6. 小程序端页面与服务包装对应关系

服务包装统一走 `apiClient.request()`(`apps/miniprogram/src/services/client.ts` / `apiClient.ts`,带 token 注入与刷新)。页面的 scope id 从 `GET /auth/me` 的角色 assignments 解析:`resolveAdminProjectId()`(`src/routing/projectAdmin.ts`)、`resolveTeamLeaderTeamId()`(`src/routing/teamLeader.ts`)、`resolveCompanyAdminCompanyId()`(`src/routing/companyAdmin.ts`),取第一个匹配 assignment(多项目/多班组身份只取其一,已知局限)。

| 页面(`apps/miniprogram/src/pages/`) | 角色 | 服务函数(`src/services/`) | 后端端点 |
| --- | --- | --- | --- |
| `reports/index.tsx` | 项目管理员 | `fetchDailyReport` / `fetchWeeklyReport` / `fetchMonthlyReport`(management.ts) | `/reports/projects/:projectId/{daily,weekly,monthly}` |
| `company-reports/index.tsx` | 公司管理员 | `fetchCompanyDailyReport` / `fetchCompanyWeeklyReport` / `fetchCompanyMonthlyReport` | `/reports/companies/:companyId/{daily,weekly,monthly}` |
| `team-attendance/index.tsx` | 班组长 | `fetchTeamDailyReport` / `fetchTeamWeeklyReport` / `fetchTeamMonthlyReport` | `/reports/teams/:teamId/{daily,weekly,monthly}` |
| `my-records/index.tsx` | 工人(任意) | `fetchMyAttendanceRecords`(me.ts),默认区间最近 7 天(`minusDays(6)`~今天) | `/me/attendance-records?from&to` |
| `my-makeups/index.tsx` | 工人(任意) | `fetchMyMakeups`(me.ts);按钮跳 `submit-makeup` 页 | `/me/makeups` |
| `team-makeups/index.tsx` | 班组长 | `fetchPendingMakeups` / `approveMakeup` / `rejectMakeup`(makeups.ts) | `/makeups/teams/:teamId/pending` + approve/reject |
| `participants/index.tsx` | 项目管理员 | `fetchParticipants` / `fetchTeamParticipants` | `/management/{projects,teams}/:id/participants` |
| `company-projects/index.tsx`、`company-people/index.tsx` | 公司管理员 | `fetchCompanyProjects` / `fetchCompanyParticipants` | `/management/companies/:companyId/{projects,participants}` |

三个报表页(reports / company-reports / team-attendance)结构相同:`Segmented` 切换日/周/月,`Picker` 选日期/周一/月份,totals 经 `totalsStatItems()`(`src/pages/reports/view-model.ts`)映射为中文统计卡(出勤人数/应排天数/实出天数/迟到/早退/缺卡/缺勤/补卡通过/异常记录/工时,工时按 `workedMinutes/60` 显示小时),participants 逐行展示 `displayName ?? "(未填写)"` + 角色/班组 + 工时 chip。

---

## 7. 已知缺口

- **分页/排序参数**:所有列表与报表均无分页、无客户端可控排序(§5)。「规划中」
- **审计日志查询**:`AuditLog` 模型存在且有写入(`apps/api/src/auth/auth.service.ts`、`apps/api/src/bindings/bindings.service.ts`),但没有任何查询 API,也没有小程序 UI。「规划中」
- **导出功能**:无 Excel/CSV 导出端点或前端入口。「规划中」
- **公司报表按项目分解**:participants 平铺、行上无项目字段、响应 `projectId` 实为 companyId(§2.5)。「规划中」
- **公司级排班判定跨项目合并**:任一项目排班即全员算排班日(§2.2)。
- **报表不感知成员生效日期**:窗口内未入场/未打卡日期均计缺勤(§3)。
- **打卡明细下钻**:管理侧无按项目/班组/个人查打卡明细的端点;个人侧无结算结论查询。「规划中」
- **多身份取首个**:小程序 resolve 函数只取第一个匹配 assignment,多项目管理员/多班组长无法切换 scope。「规划中」
- **周报不校验周一**、**前端默认日期用 UTC**(§2.3、§2.4)。
- **项目维度待审补卡列表**:补卡待审列表只有 `teams/:teamId/pending`;项目管理员的项目级待审列表未实现(审批动作本身已支持 project scope)。「规划中」

---

## 文档状态

- 日期:2026-07-07
- 分支:`codex/foundation`
