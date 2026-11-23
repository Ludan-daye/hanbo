# 07 数据模型

本文档描述建筑工地人员管理系统的数据库模型设计，以 `apps/api/prisma/schema.prisma` 的真实内容为准（Prisma 6 + PostgreSQL 16）。共 **22 个模型、11 个 enum、4 个迁移**（其中 3 个含手写 SQL）。所有表名通过 `@@map` 映射为 snake_case 复数（如 `User` → `users`）；主键统一为 `String @id @default(uuid())`。

相关源文件：

- Schema：`apps/api/prisma/schema.prisma`
- 迁移：`apps/api/prisma/migrations/`
- 基础种子（角色/权限）：`apps/api/prisma/seed.ts`
- 开发演示种子：`apps/api/prisma/seed.dev.ts`
- 领域类型镜像：`packages/domain/src/{roles,attendance}.ts`

---

## 1. 实体关系总览

22 个模型按业务域分为九组：

| 域 | 模型 |
| --- | --- |
| 账户与会话 | `User`、`UserSession` |
| 角色与权限（RBAC） | `Role`、`Permission`、`RolePermission`、`UserRole` |
| 人员档案 | `WorkerProfile`、`ManagerProfile`、`FaceProfile` |
| 组织 | `Company`、`Project`、`Team` |
| 项目成员关系 | `ProjectWorkerMember`、`ProjectManagerMember` |
| 排班 | `Shift`、`ShiftSegment`、`Schedule` |
| 考勤 | `AttendanceRecord`、`AttendanceResult` |
| 补卡 | `MakeupRequest` |
| 邀请与审计 | `BindingInvitation`、`AuditLog` |

文本 ER 图（`--<` 表示一对多，`--?` 表示可空一对一，`~~>` 表示无外键的多态引用）：

```
账户与会话                             RBAC
┌─────────────────────────┐          ┌────────────────────────────────┐
│ User ──< UserSession    │          │ Role ──< RolePermission >── Permission
│  │  │                   │          │  └───< UserRole >── User       │
│  │  └──? WorkerProfile  │          │        (scopeType+scopeId 多态) │
│  └─────? ManagerProfile │          └────────────────────────────────┘
└─────────────────────────┘
        │ userId 可空：档案可先于账号存在（未绑定）
        ▼
人员档案                               组织
┌──────────────────────────┐         ┌──────────────────────────┐
│ WorkerProfile            │         │ Company ──< Project ──< Team
│ ManagerProfile           │         └──────────┬───────────────┘
│ FaceProfile ~~> owner    │                    │
│   (ownerType+ownerId)    │                    │
└──────────┬───────────────┘                    │
           │                                    │
项目成员关系（连接 档案 × 项目 × 班组）           │
┌───────────────────────────────────────────────▼─────┐
│ ProjectWorkerMember : Project × WorkerProfile × Team?│
│ ProjectManagerMember: Project × ManagerProfile × Team?（teamScope）
└──────────────────────────────────────────────────────┘

排班                                   考勤 / 补卡
┌──────────────────────────┐         ┌───────────────────────────────────┐
│ Project ──< Shift        │         │ Project ──< AttendanceRecord      │
│ Shift ──< ShiftSegment   │         │ Project ──< AttendanceResult      │
│ Shift ──< Schedule       │         │ Project ──< MakeupRequest         │
│   Schedule ~~> owner     │         │   三者均 ~~> participant           │
│   (ownerType+ownerId,    │         │   (participantType+participantId  │
│    目前仅 "PROJECT")      │         │    → Worker/ManagerProfile)       │
└──────────────────────────┘         │ MakeupRequest >── User(requester) │
                                     │ MakeupRequest >──? User(approver) │
邀请与审计                            └───────────────────────────────────┘
┌────────────────────────────────────────────┐
│ BindingInvitation >── WorkerProfile?        │
│                  >── ManagerProfile?        │（targetType 二选一，DB CHECK）
│                  >── User(creator/acceptor) │
│ AuditLog >──? User(actor)                   │
│   AuditLog ~~> entity(entityType+entityId)  │
└────────────────────────────────────────────┘
```

核心链路：`User`（微信账号）通过绑定获得 `WorkerProfile` 或 `ManagerProfile`（档案）；档案经 `ProjectWorkerMember` / `ProjectManagerMember` 进入项目并可归属班组；打卡产生 `AttendanceRecord`，按日汇总为 `AttendanceResult`；漏卡走 `MakeupRequest` 审批。排班由 `Shift`（班次）+ `ShiftSegment`（时段）+ `Schedule`（作息生效区间）组成。

---

## 2. 模型详解

### 2.1 账户与会话

#### User（`users`）

微信小程序账号，系统内一切操作的行为主体。

| 字段 | 语义 |
| --- | --- |
| `openid` `@unique` | 微信小程序 openid，登录唯一标识 |
| `unionid` `String? @unique` | 微信开放平台 unionid，可空（同主体多应用打通预留） |
| `phone` | 可空手机号 |
| `status` `UserStatus` | `ACTIVE` / `DISABLED` |
| `sessionVersion` `Int @default(1)` | **令牌代际计数器**。签发 JWT 时写入 `sv` claim（`auth.service.ts:586`）；`access-token.guard.ts:91` 校验 `session.user.sessionVersion !== payload.sv` 即拒绝。将该值 +1 可一次性作废该用户所有已签发令牌（强制下线/封禁场景） |
| `isBound` | 是否已绑定到某个档案（Worker/ManagerProfile）。未绑定用户登录后只能进入绑定流程 |
| `lastLoginAt` | 最近登录时间 |

关系：一对多 `UserRole`、`UserSession`、`AuditLog`；可空一对一 `WorkerProfile` / `ManagerProfile`；作为补卡申请人/审批人、邀请创建人/接受人被引用。

#### UserSession（`user_sessions`）

刷新令牌会话。

| 字段 | 语义 |
| --- | --- |
| `tokenHash` `@unique` | 刷新令牌的哈希值——**明文令牌不落库**，只存哈希，唯一约束同时防重放 |
| `expiresAt` / `revokedAt` | 过期与主动吊销时间 |
| `lastUsedAt`、`ipAddress`、`userAgent` | 审计辅助 |

索引 `@@index([userId, expiresAt, revokedAt])`：登录守卫按"该用户的未过期未吊销会话"高频查询。

### 2.2 角色与权限（RBAC）

#### Role（`roles`）

| 字段 | 语义 |
| --- | --- |
| `code` `RoleCode @unique` | 五个固定角色码（见 enum 清单） |
| `level` `Int` | 层级数字，越小权力越大（`ROLE_LEVEL`：SYSTEM_ADMIN=1 … WORKER=5，见 `packages/domain/src/roles.ts`），用于角色继承/最高角色判定 |

#### Permission（`permissions`）

`code @unique` 为点分权限码字符串（如 `attendance.submit`、`makeup.approve`），共 11 个，由 `seed.ts` 收敛维护。**故意用 String 而非 enum**：权限码是开放词表，新增权限不应要求数据库迁移。

#### RolePermission（`role_permissions`）

角色-权限多对多连接表。`@@unique([roleId, permissionId])` 防重复授权；两列各有单列索引支撑双向查询。

#### UserRole（`user_roles`）

用户的**带作用域**角色指派，是授权模型的核心。

| 字段 | 语义 |
| --- | --- |
| `scopeType` `UserRoleScopeType` | `GLOBAL` / `COMPANY` / `PROJECT` / `TEAM` |
| `scopeId` `String` | 多态作用域 id：company/project/team 的 uuid；`GLOBAL` 时为哨兵字符串 `"GLOBAL"`（`GLOBAL_SCOPE_ID`，`packages/domain/src/roles.ts:13`） |

`@@unique([userId, roleId, scopeType, scopeId])`：同一用户在同一作用域内同一角色只指派一次。`@@index([scopeType, scopeId])`：按作用域反查成员（如"某项目的所有 PROJECT_ADMIN"）。`scopeId` 无外键（多态，见第 4 节）。

### 2.3 人员档案

#### WorkerProfile（`worker_profiles`）

工人实名档案。**档案与账号解耦**：`userId` 可空且 `@unique`——管理员可先建档，工人后续凭邀请码绑定微信账号。

| 字段 | 语义 |
| --- | --- |
| `encryptedName` / `encryptedIdNumber` | 姓名、身份证号的**密文**（应用层加密后入库，避免明文 PII 落盘） |
| `idNumberHash` `@unique` | 身份证号的 SHA-256 哈希。业务理由：既要按身份证号**查重/查找**（唯一约束防止同一人重复建档），又不能存明文——哈希列充当可索引的等值查找键 |
| `phone` | 明文手机号（联系用），有索引 |
| `workType` | 工种（如"钢筋工"），自由文本 |
| `realNameStatus` / `faceProfileStatus` / `employmentStatus` | 实名认证/人脸底照/在职状态，均为 String（见第 3.2 节） |

索引：`phone`（按手机号搜人）、`employmentStatus`（按在职状态筛选）。

#### ManagerProfile（`manager_profiles`）

管理人员档案（公司/项目管理员、班组长共用）。结构比工人档案简单：`name`（明文姓名，管理者非敏感展示名）、`phone`、`status`（String）。同样 `userId String? @unique` 支持先建档后绑定。

#### FaceProfile（`face_profiles`）

人脸底照档案（**当前无 service 代码使用，为人脸底照录入切片预留**）。

| 字段 | 语义 |
| --- | --- |
| `ownerType` + `ownerId` | 多态归属：`ProfileOwnerType`（`WORKER`/`MANAGER`）+ 对应档案 id，无外键 |
| `baselineObjectKey` / `baselineImageHash` | 底照对象存储 key 及内容哈希（防篡改/去重） |
| `faceServiceId` | 第三方人脸服务侧 id（可空，尚未接入） |
| `version` | 底照版本号，换照片时递增 |
| `reviewedByUserId` / `reviewedAt` | 人工审核痕迹 |

索引 `@@index([ownerType, ownerId, status])`：取"某人当前生效的底照"。

### 2.4 组织

#### Company（`companies`）

公司。仅 `name` + `status`（String）。是权限作用域 `COMPANY` 的锚点。

#### Project（`projects`）

项目（工地），考勤域所有事实表的直接外键归属。

| 字段 | 语义 |
| --- | --- |
| `centerLatitude` / `centerLongitude` `Decimal(10,7)` | 电子围栏圆心（精度见第 6 节） |
| `geofenceRadiusM` `Int` | 围栏半径（米） |
| `status` `ProjectStatus` | `PREPARING`/`ACTIVE`/`SUSPENDED`/`COMPLETED` |
| `plannedStartDate` / `plannedEndDate` `@db.Date` | 计划工期，日期无时刻 |

索引 `@@index([companyId, status])`：公司管理员列出本公司活跃项目。

#### Team（`teams`）

班组，隶属项目。`status` 为 String。

**关键设计——`@@unique([id, projectId])`**：`id` 本身已是主键，这个"冗余"唯一约束的目的在于让成员表能建**复合外键** `(teamId, projectId) → teams(id, projectId)`，从而在数据库层保证"成员所属班组必须属于成员所属项目"，杜绝跨项目挂班组的脏数据（见 `project_worker_members_teamId_projectId_fkey`，init 迁移第 477 行）。

索引 `@@index([projectId, status])`：项目内列班组。

### 2.5 项目成员关系

#### ProjectWorkerMember（`project_worker_members`）

工人 × 项目的成员关系（含进出场记录）。

| 字段 | 语义 |
| --- | --- |
| `teamId` `String?` | 可空——工人可暂未分班组；通过复合外键 `(teamId, projectId)` 绑定同项目班组 |
| `requiresAttendance` `Boolean @default(true)` | **是否需要打卡**。ACTIVE 成员也可豁免考勤（如挂名人员）；打卡提交时为 `false` 直接抛 `WORKER_MEMBER_ATTENDANCE_DISABLED`（`attendance.service.ts:299-305`），报表侧也透出该标记 |
| `enteredAt` / `exitedAt` | 进场/退场时间 |
| `projectRoleLabel` | 项目内岗位标签（自由文本，如"钢筋工"） |
| `status` `MemberStatus` | `ACTIVE`/`EXITED`/`SUSPENDED` |

`@@unique([projectId, workerId])`：一个工人在一个项目最多一条成员记录（复用记录改状态，不新增行）。索引 `[projectId, teamId, status]`（按班组列人）、`[workerId, status]`（工人视角列项目）。

#### ProjectManagerMember（`project_manager_members`）

管理者 × 项目的成员关系。

| 字段 | 语义 |
| --- | --- |
| `roleCode` `RoleCode` | 该管理者在此项目中的角色（PROJECT_ADMIN/TEAM_LEADER 等） |
| `teamScopeId` `String?` | 班组长的管辖班组；项目级管理员为 `null`。同样走复合外键 `(teamScopeId, projectId)` |
| `requiresAttendance` | 同工人；种子中项目管理员 `false`、班组长 `true` |

`@@unique([projectId, managerId])`；索引 `[projectId, roleCode, status]`（按角色列管理员）、`[projectId, teamScopeId, status]`、`[managerId, status]`。

### 2.6 排班

#### Shift（`shifts`）

班次（如"标准两段班"），隶属项目。`isDefault` 标记项目默认班次；`configureDefaultShift` 用事务先把项目内全部班次 `isDefault=false` 再新建默认班次（`attendance.service.ts:368-405`），应用层保证"最多一个默认"。索引 `@@index([projectId, isDefault])` 支撑"取项目默认班次"这一打卡/补卡热路径。

#### ShiftSegment（`shift_segments`）

班次内的时段（本系统固定语义为两段：上午/下午）。

| 字段 | 语义 |
| --- | --- |
| `sequence` `Int` | 时段序号（1、2） |
| `startTime` / `endTime` `String` | **"HH:mm" 字符串**存墙钟时间（如 `"08:00"`），与考勤日拼接换算，不用 Time 类型以避免时区歧义 |
| `lateGraceMins` / `earlyGraceMins` | 迟到/早退宽限分钟数 |

`@@unique([shiftId, sequence])`：同班次时段序号唯一（也是 seed upsert 的 where 键）。

#### Schedule（`schedules`）

作息表：某 owner 从 `startsOn` 到 `endsOn`（可空=无限期）按 `workdayMask` 执行某班次。

| 字段 | 语义 |
| --- | --- |
| `ownerType` `String` + `ownerId` | 多态 owner。**故意用 String 而非 enum**——当前仅 `"PROJECT"`（TS 层用 `type ScheduleOwnerTypeValue = "PROJECT"` 收窄，`attendance.types.ts:5`），未来加 TEAM/成员级作息无需数据库迁移 |
| `workdayMask` `Int @default(127)` | **工作日位域**：bit `1 << (isoWeekday - 1)`，ISO 星期一=bit0 … 星期日=bit6。`127`=全周；种子用 `63`（周一至周六）。编解码在 `attendance.service.ts:95-108`（`createWorkdayMask`/`expandWorkdayMask`/`isDateEnabledBySchedule`），报表侧 `reports.service.ts:97` 用同一位运算判定某天是否应出勤。DB 层 CHECK 约束 `1..127`（至少一个工作日、不越 7 位） |
| `startsOn` / `endsOn` `@db.Date` | 生效区间（`endsOn=null` 表示长期有效） |

索引 `[shiftId, startsOn]`、`[ownerType, ownerId, startsOn]`（按 owner 找当日生效作息）。另有**部分唯一索引**保证每项目仅一条默认作息（见第 5 节）。

### 2.7 考勤

#### AttendanceRecord（`attendance_records`）

原始打卡记录（服务端权威判定后落库，只增不改）。

| 字段 | 语义 |
| --- | --- |
| `participantType` + `participantId` | 多态参与人（见第 4 节） |
| `attendanceDate` `@db.Date` | 考勤日 |
| `pointCode` `AttendancePointCode` | 四个打卡点之一（上/下午的上/下班） |
| `source` | `DEVICE`（设备实打）/ `MAKEUP`（补卡核准生成） |
| `status` | `VALID` / `INVALID` |
| `occurredAt` vs `serverReceivedAt` | 客户端声称的发生时间 vs 服务端收到时间，两者分开存以便识别补传/时钟漂移 |
| `latitude`/`longitude` `Decimal(10,7)`、`locationAccuracyM`/`geofenceDistanceM` `Decimal(8,2)?` | 打卡定位、定位精度与离围栏圆心距离（服务端 Haversine 计算） |
| `selfieObjectKey`/`sitePhotoObjectKey` + `selfieHash`/`sitePhotoHash` | 自拍与工地环境照的对象存储 key 及内容哈希（对象存储连接器尚未接入，仅存 key） |
| `faceScore` `Decimal(6,4)?` / `facePassed` | 人脸比对得分与服务端阈值判定结果（`FaceVerificationConnector` 派生，客户端不可信输入） |
| `abnormalReason` `String?` | 开放词表：目前 `FACE_NOT_PASSED` / `OUTSIDE_GEOFENCE`（`attendance.service.ts:348-358`） |

索引 `[projectId, attendanceDate, participantType, participantId]`（个人日明细）、`[projectId, attendanceDate, pointCode]`（打卡点维度统计）。

#### AttendanceResult（`attendance_results`）

按"项目 × 日 × 参与人"的日结汇总，由记录重算得出。

字段：`workedMinutes`、`isLate`、`isEarlyLeave`、`isMissingPunch`、`isAbsent`、`approvedMakeupCount`、`abnormalRecordCount`、`calculatedAt`。

`@@unique([projectId, attendanceDate, participantType, participantId])`：**幂等重算键**——每次打卡/补卡核准后按该键 upsert（`attendance.service.ts:768`），天然防止同日双行。索引 `[projectId, attendanceDate]` 供日报全员扫描。

### 2.8 补卡

#### MakeupRequest（`makeup_requests`）

补卡申请与审批。

| 字段 | 语义 |
| --- | --- |
| `requesterUserId` / `approverUserId` | 均为 `User` 外键（具名关系 `"requester"`/`"approver"`）。申请人是账号而非档案——因为班组长可替工人发起；参与人另由 `participantType`+`participantId` 表达 |
| `pointCode` + `attendanceDate` + `requestedOccurredAt` | 补哪一天哪个打卡点、声称的实际时间 |
| `status` `MakeupStatus` | `PENDING`/`APPROVED`/`REJECTED`；核准后生成一条 `source=MAKEUP` 的 `AttendanceRecord` 并重算日结 |
| `approvalReason` / `approvedAt` | 审批意见（通过与驳回均必填）与时间 |

索引 `[projectId, attendanceDate, status]`（审批队列）、`[requesterUserId, status]`（我的申请）。注意**无防重唯一约束**：同人同日同点可多次申请（被驳回后重新提交），应用层查 `PENDING` 去重。

### 2.9 邀请与审计

#### BindingInvitation（`binding_invitations`）

档案绑定邀请码。

| 字段 | 语义 |
| --- | --- |
| `codeHash` `@unique` | 邀请码 SHA-256 哈希，**明文不落库**（凭码兑换时哈希后等值查找） |
| `targetType` `ProfileOwnerType` + `workerProfileId?` / `managerProfileId?` | 目标档案二选一。此处**没有**用多态 id，而是两个真外键 + 数据库 CHECK 约束强制互斥（见第 5 节）——因为邀请必须指向确实存在的档案，值得付出双列代价换取引用完整性 |
| `createdByUserId` / `acceptedByUserId` | 创建人（外键 `Restrict`）/ 接受人（外键 `SET NULL`） |
| `status` / `expiresAt` / `usedAt` | `PENDING`/`ACCEPTED`/`EXPIRED`/`REVOKED`，过期时间与使用时间 |

索引：`[createdByUserId, status]`（我发出的邀请）、`[acceptedByUserId]`、`[targetType, workerProfileId, status]` 与 `[targetType, managerProfileId, status]`（查某档案的待用邀请）。

#### AuditLog（`audit_logs`）

审计日志（当前仅 auth 绑定与邀请创建两处写入：`auth.service.ts:417,502`、`bindings.service.ts:109`）。

| 字段 | 语义 |
| --- | --- |
| `actorUserId` `String?` | 行为人，可空（系统动作） |
| `action` `String` | 开放词表动作码（`auth.bind.worker`、`binding.invitation.create` 等），故意不用 enum |
| `entityType` + `entityId` | 通用多态实体引用，无外键 |
| `metadata` `Json` | 任意结构化上下文 |

索引 `[actorUserId, createdAt]`（按人回溯）、`[entityType, entityId]`（按实体回溯）。

---

## 3. Enum 清单与 String 状态字段

### 3.1 全部 11 个 enum

| Enum | 取值 | 语义 |
| --- | --- | --- |
| `RoleCode` | `SYSTEM_ADMIN` `COMPANY_ADMIN` `PROJECT_ADMIN` `TEAM_LEADER` `WORKER` | 五级角色，层级见 `ROLE_LEVEL`（1..5，小者权大） |
| `UserStatus` | `ACTIVE` `DISABLED` | 账号可用/封禁 |
| `ProfileOwnerType` | `WORKER` `MANAGER` | 多态判别式：档案/参与人是工人还是管理者。被 `FaceProfile.ownerType`、`AttendanceRecord`/`AttendanceResult`/`MakeupRequest.participantType`、`BindingInvitation.targetType` 复用 |
| `ProjectStatus` | `PREPARING` `ACTIVE` `SUSPENDED` `COMPLETED` | 项目生命周期 |
| `MemberStatus` | `ACTIVE` `EXITED` `SUSPENDED` | 项目成员在场状态 |
| `AttendancePointCode` | `SEGMENT_1_START` `SEGMENT_1_END` `SEGMENT_2_START` `SEGMENT_2_END` | 两段班的四个打卡点（上午上/下班、下午上/下班） |
| `AttendanceRecordSource` | `DEVICE` `MAKEUP` | 实打 / 补卡生成 |
| `AttendanceRecordStatus` | `VALID` `INVALID` | 记录是否计入日结 |
| `MakeupStatus` | `PENDING` `APPROVED` `REJECTED` | 补卡审批状态 |
| `BindingInvitationStatus` | `PENDING` `ACCEPTED` `EXPIRED` `REVOKED` | 邀请码状态 |
| `UserRoleScopeType` | `GLOBAL` `COMPANY` `PROJECT` `TEAM` | 角色指派作用域类型 |

### 3.2 故意用 String 而非 enum 的字段

以下字段在 schema 中是 `String`，属于**有意选择**（开放词表 / 演进期避免 PG enum 迁移成本），而非遗漏：

| 字段 | 现用值 | 理由 |
| --- | --- | --- |
| `Company.status`、`Team.status`、`ManagerProfile.status` | `"ACTIVE"` | 组织状态词表尚未定稿，String 允许后续加值不迁移 |
| `WorkerProfile.realNameStatus` / `faceProfileStatus` | `"PENDING"` 等 | 实名/底照流程状态机还在演进（依赖尚未接入的第三方服务） |
| `WorkerProfile.employmentStatus` | `"ACTIVE"` | 同上，且带索引以支撑筛选 |
| `FaceProfile.status` | — | 人脸档案流程未实现 |
| `Schedule.ownerType` | `"PROJECT"` | 多态判别式，TS 层以 `ScheduleOwnerTypeValue = "PROJECT"` 收窄；预留 TEAM/成员级作息 |
| `Permission.code` | `attendance.submit` 等 11 个 | 权限码开放词表，由 `seed.ts` 收敛 |
| `AuditLog.action` / `entityType` | `auth.bind.worker` 等 | 审计动作/实体名开放词表 |
| `AttendanceRecord.abnormalReason` | `FACE_NOT_PASSED` / `OUTSIDE_GEOFENCE` | 异常原因随校验项增加而扩展 |
| `ShiftSegment.startTime` / `endTime` | `"08:00"` | 非状态字段：以 "HH:mm" 字符串存墙钟时刻，规避 Time 类型时区语义 |

PG 层的 enum 改值需要 `ALTER TYPE`（加值不可回滚、删值极痛），因此规则是：**词表已封闭且被外键式逻辑依赖的用 enum，其余用 String**。

---

## 4. 多态关联模式

系统有四处"判别式 + 裸 id"多态引用，均**不建外键**，因为一列外键无法同时指向两张表（PostgreSQL 不支持条件外键）：

### 4.1 participantType + participantId（考勤域三表）

`AttendanceRecord`、`AttendanceResult`、`MakeupRequest` 的参与人：`participantType: ProfileOwnerType` 为判别式，`participantId` 指向 `worker_profiles.id` 或 `manager_profiles.id`。

为什么不拆成两列可空外键（像 `BindingInvitation` 那样）：考勤事实表行数最大、写入最热，双可空列 + CHECK 会让所有唯一键与索引都翻倍（每个都要 worker/manager 两套）；而 `(participantType, participantId)` 二元组让唯一键 `@@unique([projectId, attendanceDate, participantType, participantId])` 一条搞定。代价是引用完整性交给应用层保证——参与人 id 一律由服务端从当前登录用户解析，从不信任客户端传入。

**查询侧不做 SQL join，而是两段式解析/内存拼接**：

- 写入侧（打卡/补卡）：`resolveAttendanceParticipant`（`attendance.service.ts:618-666`）并行 `findUnique` 两张档案表（按 `userId`，`include projectMemberships where projectId`），两边都命中则抛 `USER_BOUND_TO_MULTIPLE_ATTENDANCE_PROFILE_TYPES`，命中一边即得出 `{ participantType, participantId }`。`makeup.service.ts:401-420` 同构。
- 报表侧：`reports.service.ts` 先从 `ProjectWorkerMember`/`ProjectManagerMember`（各自 include 档案与班组）构建参与人基座（`createWorkerParticipantBase`/`createManagerParticipantBase`，第 191-217 行），再把 `AttendanceResult` 按内存键 `${participantType}:${participantId}:${date}`（`createResultKey`，第 87-88 行）挂回参与人——即"两次窄查询 + Map join"，避免多态 SQL join。
- 工人自查侧：`me.service.ts:30-32` 由当前用户的两个档案构造 `OR [{participantType:"WORKER", participantId}, {participantType:"MANAGER", participantId}]` 过滤条件。

### 4.2 Schedule.ownerType + ownerId

判别式是 String（当前仅 `"PROJECT"`，`ownerId = projects.id`）。服务端一律用常量 `projectScheduleOwnerType`（`attendance.service.ts:70`）查询：`schedule.findFirst/deleteMany({ where: { ownerId: projectId, ownerType: "PROJECT" } })`。班次通过真外键 `shiftId` join（`include: { shift: ... }`），只有 owner 端是多态。选 String 的原因见 3.2；每项目单条默认作息由部分唯一索引兜底（第 5 节）。

### 4.3 FaceProfile.ownerType + ownerId 与 UserRole.scopeType + scopeId

同一模式的另两个实例：前者尚无查询代码；后者的 `scopeId` 在 `GLOBAL` 时取哨兵值 `"GLOBAL"`，其余取组织表 uuid，授权守卫按 `(scopeType, scopeId)` 索引反查。`AuditLog.entityType + entityId` 亦同（纯追溯用，无完整性要求）。

### 4.4 反例：BindingInvitation 不用多态

邀请表用了两个真外键 + CHECK 互斥（`workerProfileId` XOR `managerProfileId`）。取舍标准：邀请是低频写入、且"邀请指向不存在的档案"是不可接受的数据缺陷，所以付出双列代价换数据库级完整性；考勤事实表反之。

---

## 5. 特殊迁移

四个迁移中三个含手写/非常规 SQL（Prisma schema 无法表达 CHECK 约束与部分索引，只能手写迁移；这些约束**不会出现在 schema.prisma 里**，属于"schema 之外的真相"）：

| 迁移 | 非常规内容 | 动机 |
| --- | --- | --- |
| `20260602000000_init_foundation_schema` | ① 开头 `CREATE SCHEMA IF NOT EXISTS "public"`；② `teams_id_projectId_key` 冗余唯一索引 + 成员表复合外键 `(teamId, projectId) → teams(id, projectId)`（第 384、477 行） | ① 空库/影子库自举；② 数据库层保证"成员的班组属于成员的项目"（schema 里表现为 `Team @@unique([id, projectId])` 与关系 `fields: [teamId, projectId]`，本身可由 Prisma 生成，但属于刻意的完整性设计） |
| `20260602010000_auth_binding_permissions` | 手写 CHECK：`binding_invitations_target_check`——`targetType='WORKER'` 时必须且仅有 `workerProfileId`，`'MANAGER'` 时必须且仅有 `managerProfileId`（第 43-55 行） | 双可空外键的互斥性 Prisma 无法表达，DB 层堵死"两个都填/都不填/类型与列错配"四种脏数据 |
| `20260603010000_schedule_workday_mask` | 全手写两行：加 `workdayMask` 列 + CHECK `BETWEEN 1 AND 127` | 位域合法域约束：至少一个工作日（≥1）、不超过 7 位（≤127），防止应用层 bug 写入 0 或越界值 |
| `20260603020000_unique_project_default_schedule` | 全手写**部分唯一索引**：`CREATE UNIQUE INDEX "schedules_project_default_unique" ON "schedules"("ownerType","ownerId") WHERE "ownerType" = 'PROJECT'` | 每个项目至多一条项目级默认作息（`configureDefaultSchedule` 是先 delete 再 create 的事务，索引兜底并发竞态）；`WHERE` 子句把约束限定在 PROJECT 行——未来 TEAM/成员级作息允许同 owner 多条记录（按日期区间排班），不受此约束影响 |

**演进警示**：`prisma migrate dev` 的漂移检测（diff schema ↔ 影子库）会把这三处手写约束视为漂移，新生成的迁移可能包含 `DROP INDEX "schedules_project_default_unique"` / `DROP CONSTRAINT ... _check` 之类语句——**每次生成迁移后必须人工检查并删掉这类误删语句**（或将约束重建语句追加回去）。

---

## 6. Decimal 精度选择与字符串化传输

### 6.1 精度表

| 字段 | 类型 | 值域/分辨率 | 理由 |
| --- | --- | --- | --- |
| `Project.centerLatitude` / `centerLongitude`、`AttendanceRecord.latitude` / `longitude` | `Decimal(10,7)` | ±999.9999999，7 位小数 ≈ 赤道 1.1 cm | GPS 常规输出 6-7 位小数；10 位总长覆盖经度 ±180；定点数避免浮点存储漂移导致围栏判定抖动 |
| `AttendanceRecord.locationAccuracyM` / `geofenceDistanceM` | `Decimal(8,2)?` | 最大 999,999.99 m，厘米分辨率 | 距离/精度以米为单位两位小数足够；服务端 `formatMeters = value.toFixed(2)`（`attendance.service.ts:151`）统一格式化 |
| `AttendanceRecord.faceScore` | `Decimal(6,4)?` | 最大 99.9999，万分位分辨率 | 兼容 0–1 相似度与 0–100 百分制两种人脸服务打分口径；4 位小数保留阈值比较精度 |

### 6.2 字符串化传输约定

Prisma 的 `Decimal` 在运行时是 decimal.js 对象，直接进 JSON 会丢定点语义。项目约定**API 边界一律传字符串**：

- 出参：DTO 类型声明为 `string`（`attendance.types.ts:52-72`：`latitude: string`、`faceScore: string | null` 等）；映射层 `String(record.latitude)`、`record.faceScore === null ? null : String(record.faceScore)`（`attendance.service.ts:199-204`）。
- 入参：Zod 用十进制字符串 schema 校验（`attendance-body.parsers.ts:134` 的 `positiveDecimalStringSchema`），经纬度字符串直通 Prisma（Prisma 接受字符串写 Decimal 列），只有 Haversine 计算时才 `Number(latitude)` 临时转浮点（`attendance.service.ts:677-683`）。
- 种子同理：`centerLatitude: "31.2304000"`（`seed.dev.ts:53`）。

新增 Decimal 字段时必须延续该约定：schema 定精度 → DTO 用 `string` → 映射层 `String(...)` → 入参 Zod 十进制字符串。

---

## 7. 种子数据地图

### 7.1 seed.ts（基础种子，所有环境）

幂等 upsert + 收敛（会 `deleteMany` 掉种子角色上不在期望清单里的多余授权对）：

- **5 个 Role**：级别取自 `ROLE_LEVEL`（SYSTEM_ADMIN=1 … WORKER=5）。
- **11 个 Permission**：`attendance.submit/view`、`binding.invitation.create`、`company.manage`、`makeup.approve/request`、`project.create/manage`、`system.manage`、`team.manage`、`worker.manage`。
- **12 对 RolePermission**：SYSTEM_ADMIN→system.manage；COMPANY_ADMIN→company.manage, project.create；PROJECT_ADMIN→attendance.view, binding.invitation.create, project.manage, team.manage, worker.manage；TEAM_LEADER→attendance.view, makeup.approve；WORKER→attendance.submit, makeup.request。（COMPANY_ADMIN 的 attendance.view 靠角色层级继承，不在种子里。）

### 7.2 seed.dev.ts（开发演示种子，`pnpm --filter @construction/api seed:dev`）

完整对象图（全部固定 id、幂等 upsert）：

```
Company dev-company「示例建筑公司」
├── Project dev-project「示例工地一号」(31.2304, 121.4737, 半径300m, 起 2026-01-01)
│   ├── Shift dev-shift「标准两段班」isDefault
│   │   ├── Segment 1: 08:00–12:00（宽限 10/10）
│   │   └── Segment 2: 13:30–17:30（宽限 10/10）
│   ├── Schedule (ownerType=PROJECT) workdayMask=63(周一~六), 起 2026-01-01, 无限期
│   ├── Team dev-team「一号班组」
│   │   └── 成员: dev-worker、李二、王三、赵四（工人）+ dev-team（班组长, teamScope）
│   ├── Team dev-team-2「二号班组」
│   │   └── 成员: 孙五（工人）+ 二号班组长（teamScope）
│   ├── 未绑定木工档案（无 userId）→ 成员 + 待用邀请码
│   └── dev-project（项目管理员成员, requiresAttendance=false, teamScope=null）
└── Project dev-project-2「示例工地二号」(31.2350, 121.4800, 半径250m, 起 2026-02-01)
    ├── Shift dev-shift-2「标准两段班」isDefault（同两时段）
    ├── Schedule 同上, 起 2026-02-01
    └── Team dev-team-p2「二号工地·一号班组」
        └── 成员: 周六（工人）+ 项目二班组长（teamScope）; 项目二管理员（teamScope=null）
```

**演示账号全表**（openid 即 dev-login 登录名；均 `isBound=true` 除 dev-unbound）：

| openid | 姓名/工种 | 角色@作用域 | 手机号 | 项目成员关系 |
| --- | --- | --- | --- | --- |
| `dev-system` | 系统管理员 | SYSTEM_ADMIN@GLOBAL(`"GLOBAL"`) | `138dev-system`* | 无 |
| `dev-company` | 公司管理员 | COMPANY_ADMIN@COMPANY dev-company | `138dev-company`* | 无 |
| `dev-project` | 项目管理员 | PROJECT_ADMIN@PROJECT dev-project | `138dev-project`* | 项目一管理员成员（不打卡） |
| `dev-team` | 班组长 | TEAM_LEADER@TEAM dev-team | `138dev-team`* | 项目一班组长成员（打卡，管一号班组） |
| `dev-worker` | 工人/钢筋工 | WORKER@PROJECT dev-project | 13800000001 | 一号班组 |
| `dev-worker-2` | 李二/钢筋工 | WORKER@PROJECT dev-project | 13800000003 | 一号班组 |
| `dev-worker-3` | 王三/焊工 | WORKER@PROJECT dev-project | 13800000004 | 一号班组 |
| `dev-worker-4` | 赵四/钢筋工 | WORKER@PROJECT dev-project | 13800000005 | 一号班组 |
| `dev-leader-2` | 二号班组长 | TEAM_LEADER@TEAM dev-team-2 | 13800000006 | 项目一班组长成员（管二号班组） |
| `dev-worker-5` | 孙五/木工 | WORKER@PROJECT dev-project | 13800000007 | 二号班组 |
| `dev-project-2-admin` | 项目二管理员 | PROJECT_ADMIN@PROJECT dev-project-2 | 13800000008 | 项目二管理员成员（不打卡） |
| `dev-leader-p2` | 项目二班组长 | TEAM_LEADER@TEAM dev-team-p2 | 13800000009 | 项目二班组长成员 |
| `dev-worker-p2` | 周六/钢筋工 | WORKER@PROJECT dev-project-2 | 13800000010 | 二号工地·一号班组 |
| `dev-unbound` | —（未绑定） | 无角色 | — | 无（用于演示绑定流程） |

\* 前四个管理员手机号是 `` `138${openid}` `` 拼接产物（如 `138dev-system`），非合法号码——仅占位。

**其他种子事实**：

- 未绑定工人档案：木工、13800000002、`idNumberHash = sha256("dev-unbound-worker-id")`，无 `userId`，已是项目一成员——供邀请页演示对"已存在但未绑定"的参与人生成邀请。
- `BindingInvitation`：`codeHash = sha256("DEV-BIND-CODE")`（明文码 `DEV-BIND-CODE`），目标为上述木工档案，PENDING，有效期至 2030-01-01。
- 3 条 `AttendanceResult`（dev-worker@项目一）：今日正常 480 分钟；昨日迟到 450 分钟；前日缺勤 0 分钟——供报表页有数据。
- 1 条 PENDING `MakeupRequest`（dev-worker，昨日 `SEGMENT_1_START`，理由"忘记打卡了"）——供班组长审批页有待办。
- 两个项目都配了默认班次 + 项目级作息，因为打卡与补卡都硬依赖它们（缺失时补卡创建抛 `DEFAULT_SHIFT_NOT_CONFIGURED_FOR_MAKEUP`，`makeup.service.ts:378`）。

---

## 8. 演进注意事项

修改数据模型时，schema.prisma 只是同步链条的第一环，以下各处**必须同步**：

1. **迁移生成后人工审查**：确认生成的 SQL 没有 DROP 掉第 5 节列出的三个手写约束（`schedules_project_default_unique`、`schedules_workdayMask_check`、`binding_invitations_target_check`）。需要新 CHECK/部分索引时，同样只能手写迁移。
2. **e2e 测试替身**：`apps/api/test/*.e2e.test.ts` 通过 `.overrideProvider(PrismaService)` 注入**手写的内存 Prisma 替身**（如 `attendance.e2e.test.ts:333` 的 `class AttendancePrismaTestDouble`，内部是每表一个 `Map` + 手写 `findUnique/create/upsert` 语义）。每个测试文件还**本地重新声明**了记录类型与 enum 字面量联合（如 `type MemberStatusValue = "ACTIVE" | "EXITED" | "SUSPENDED"`）。加字段/加模型后，所有触及该表的测试替身的记录类型、查询方法、工厂数据都要跟着改，否则测试编译或行为与真库脱节。
3. **类型镜像**：enum 值在三层被字面量联合镜像——`packages/domain/src`（如 `AttendancePointCode`、`RoleCode`/`ROLE_LEVEL`）、`apps/api/src/*/**.types.ts`（如 `ProfileOwnerTypeValue`、`ScheduleOwnerTypeValue`、`MemberStatusValue`）、各测试文件本地类型。给 enum 加值必须全链更新；schema 用 String 收窄的字段（`Schedule.ownerType`）扩值时改 TS 联合类型即可，无需迁移。
4. **seed.ts**：新角色/权限/授权对要加进三张种子清单；注意 `seedRolePermissions` 会**删除**种子角色上不在期望清单内的授权对——手工在库里补的授权会被下次种子抹掉。
5. **seed.dev.ts**：新模型若是演示流程的硬依赖（如当年补 Shift/Schedule 那样），要补进对象图并保持幂等 upsert 风格（固定 id、`where` 用唯一键）；新加项目记得同时配默认班次 + 作息。
6. **Decimal 字段**：遵守第 6.2 节字符串化约定四件套（精度、DTO string、`String(...)` 映射、Zod 十进制入参）。
7. **多态引用**：新增指向多张表的引用时，按第 4.4 节的取舍标准选择"判别式+裸 id"（高频事实表）或"双可空外键+CHECK"（低频强完整性），不要混用。
8. **domain 包构建**：`packages/domain` 是 composite tsc——若删了 `dist` 必须同时删 `tsconfig.tsbuildinfo`（或用 `tsc --build --force`），否则不重新产出；vitest 通过 `apps/api/vitest.config.ts` 的 alias 直接跑源码，不受影响。

---

## 文档状态

- 日期：2026-07-07
- 分支：`codex/foundation`
- 依据：`apps/api/prisma/schema.prisma`（22 模型 / 11 enum）、`apps/api/prisma/migrations/`（4 个迁移）、`apps/api/prisma/seed.ts` 与 `seed.dev.ts`，以及 `apps/api/src/{attendance,makeup,reports,me,auth,bindings}` 服务代码佐证。
