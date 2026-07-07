# 03 组织与人员管理

本文描述建筑工地人员管理系统中「组织层级(公司/项目/班组)与人员(工人/管理者)」的数据模型、REST 接口与业务闭环。以下内容以真实代码为准:

- 数据模型:`apps/api/prisma/schema.prisma`
- 接口与业务逻辑:`apps/api/src/management/`(controller / service / parsers / types)
- 邀请创建:`apps/api/src/bindings/`
- 绑定闭环(与 02 文档分工:本文讲业务流,02 讲 token/权限机制):`apps/api/src/auth/auth.service.ts`
- 端到端测试:`apps/api/test/management.e2e.test.ts`、`apps/api/test/bindings.e2e.test.ts`、`apps/api/test/auth.e2e.test.ts`

---

## 1. 组织层级:Company → Project → Team

三级树状结构,全部一对多,外键单向向上引用(`apps/api/prisma/schema.prisma`):

```
Company (companies)
  └─ Project (projects)        project.companyId → Company.id
       └─ Team (teams)         team.projectId → Project.id
```

### 1.1 Company

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | String (uuid) | 主键 |
| `name` | String | 公司名 |
| `status` | String | **自由字符串**,无枚举约束(见 §8 缺口) |

### 1.2 Project(含地理围栏)

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `companyId` | String | 所属公司 |
| `name` / `address` | String | 名称 / 地址 |
| `centerLatitude` | Decimal(10,7) | 围栏中心纬度 |
| `centerLongitude` | Decimal(10,7) | 围栏中心经度 |
| `geofenceRadiusM` | Int | 围栏半径(米),创建时校验为正整数 |
| `status` | enum `ProjectStatus` | `PREPARING / ACTIVE / SUSPENDED / COMPLETED` |
| `plannedStartDate` | Date | 计划开始日(必填,`YYYY-MM-DD`) |
| `plannedEndDate` | Date? | 计划结束日(可空) |

- 地理围栏三字段是考勤打卡的判定依据(打卡时计算 `geofenceDistanceM`,详见考勤设计文档);API 层经纬度以**字符串**收发(`CreateProjectRequest.centerLatitude: string`),用正则 + 范围校验(纬度 ±90、经度 ±180,最多 7 位小数),见 `apps/api/src/management/management-body.parsers.ts` 的 `isCoordinate`。
- 索引:`@@index([companyId, status])`。

### 1.3 Team

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `projectId` | String | 所属项目 |
| `name` | String | 班组名 |
| `status` | String | 自由字符串 |

- 关键约束:`@@unique([id, projectId])` —— 这不是为了唯一性(`id` 本身是主键),而是为了让成员表能建立**复合外键** `(teamId, projectId) → Team(id, projectId)`,在数据库层面保证「成员所挂班组必属于同一项目」。服务层还有二次校验 `getProjectTeamOrThrow`(`management.service.ts:530`,班组不存在报 `TEAM_NOT_FOUND`,跨项目报 `TEAM_DOES_NOT_BELONG_TO_PROJECT`)。

---

## 2. 人员双轨制:WorkerProfile vs ManagerProfile

人员档案与登录账号(`User`)解耦:档案先建、账号后绑。两类档案均有 `userId String? @unique` —— **可空**表示「未绑定」,唯一表示「一个账号至多绑一份该类档案」。

| 维度 | `WorkerProfile` (worker_profiles) | `ManagerProfile` (manager_profiles) |
| --- | --- | --- |
| 姓名 | `encryptedName`(密文占位) | `name`(**明文**) |
| 身份证 | `encryptedIdNumber` + `idNumberHash @unique` | 无 |
| 电话 | `phone`(索引) | `phone`(索引) |
| 业务字段 | `workType`、`realNameStatus`、`faceProfileStatus`、`employmentStatus` | `status` |
| 成员关系 | `projectMemberships: ProjectWorkerMember[]` | `projectMemberships: ProjectManagerMember[]` |
| 邀请关联 | `bindingInvitations`("workerBindingInvitations") | `bindingInvitations`("managerBindingInvitations") |

### 2.1 身份信息「假加密」现状

- `encryptedName` / `encryptedIdNumber` / `idNumberHash` 全部由**客户端请求体直接传入**,服务端原样入库;parser 仅校验非空字符串(`management-body.parsers.ts:67-82`),`apps/api/src` 中不存在任何加解密实现。
- 开发种子数据直接写占位串:`encryptedName: "dev-encrypted-name"`、`` enc-${name} ``(`apps/api/prisma/seed.dev.ts:142,333`)。
- 连带后果:工人参与者列表的 `displayName` 恒为 `null`(`management.service.ts:139`,`createWorkerParticipantResponse` 硬编码 `displayName: null`,因为服务端无法解密姓名),而管理者行返回明文 `manager.name`。
- `idNumberHash @unique` 是全局去重键:同一身份证号在全库只能有一份 `WorkerProfile`。
- 服务端字段级加密、密钥管理、姓名脱敏展示:**规划中**。

### 2.2 先建档后绑定

创建工人/管理者时**总是新建档案**(`userId = null`),不接收 `userId`;账号关联只能走「邀请码 → `/auth/bind`」闭环(§6)。`realNameStatus` / `faceProfileStatus` 等状态也是创建时由请求体给定的自由字符串,尚无对应的实名/人脸流程回写这些字段(人脸底照走独立的 `FaceProfile` 模型)。

---

## 3. 成员关系:ProjectWorkerMember / ProjectManagerMember

档案(是谁)与成员关系(在哪个项目、什么身份)分离,人员进入项目 = 新增一条成员记录。

### 3.1 ProjectWorkerMember (project_worker_members)

| 字段 | 说明 |
| --- | --- |
| `projectId` / `workerId` | `@@unique([projectId, workerId])`:一名工人在一个项目至多一条成员记录 |
| `teamId String?` | **所属班组**(可空 = 未分班组);复合外键 `(teamId, projectId)` 保证同项目 |
| `requiresAttendance Boolean @default(true)` | 是否纳入考勤(免考勤人员置 false) |
| `enteredAt` / `exitedAt?` | 进场/退场时间(ISO datetime) |
| `projectRoleLabel String` | 项目内岗位标签,自由文本(如「钢筋工」) |
| `status` | enum `MemberStatus`:`ACTIVE / EXITED / SUSPENDED` |

### 3.2 ProjectManagerMember (project_manager_members)

| 字段 | 说明 |
| --- | --- |
| `projectId` / `managerId` | `@@unique([projectId, managerId])` |
| `roleCode` | enum `RoleCode`,API 层收窄为 `ProjectManagerRoleCode = "PROJECT_ADMIN" | "TEAM_LEADER"`(`management.types.ts:5`) |
| `teamScopeId String?` | **管理范围班组**(不是「所属」):`TEAM_LEADER` 必填、`PROJECT_ADMIN` 必须为空,由 `assertManagerRoleScope` 强制(`management.service.ts:561`,违反分别报 `TEAM_LEADER_MANAGER_REQUIRES_TEAM_SCOPE` / `PROJECT_ADMIN_MANAGER_REJECTS_TEAM_SCOPE`) |
| `requiresAttendance` | 同上,默认 true |
| `status` | enum `MemberStatus` |

`teamId` 与 `teamScopeId` 的语义区别:工人的 `teamId` 表达组织归属(在哪个班组干活);管理者的 `teamScopeId` 表达权限边界(管哪个班组),并在绑定账号时决定角色授予的 scope(§6.3)。

### 3.3 统一参与者视图

读接口把两轨合并为 `ProjectParticipantResponse`(`management.types.ts:108`):`participantType: "WORKER" | "MANAGER"`、`profileId`、`memberId`、`projectRoleLabel`(工人为岗位标签,管理者为 `roleCode`)、`teamId/teamName`(管理者行取 `teamScopeId`)、`requiresAttendance`、`status`。公司级视图再叠加 `projectName`(`CompanyParticipantResponse`)。

---

## 4. management 模块 REST 接口全表

路由前缀 `/management`(`apps/api/src/management/management.controller.ts`)。所有 endpoint 均挂 `AccessTokenGuard + PermissionsGuard`,权限由 `@RequirePermission({ permissionCode, target })` 声明;`target.source` 决定目标 scope 如何解析(`apps/api/src/authorization/authorization-context.service.ts:142`):

- `static`:固定 scope(目前仅 GLOBAL,`scopeId = GLOBAL_SCOPE_ID = "GLOBAL"`);
- `companyParam` / `projectParam` / `teamParam`:从路径参数取 id,并补齐祖先链(project → 补 `companyId`;team → 补 `projectId` + `companyId`),因此**上级 scope 的角色天然覆盖下级资源**(`scopeIncludesTarget`,`packages/domain/src/roles.ts:183`)。角色权限还按级别继承(`getEffectivePermissionCodes`):`COMPANY_ADMIN` 自动拥有 `PROJECT_ADMIN`/`TEAM_LEADER`/`WORKER` 的全部权限码,这就是公司管理员能通过 `attendance.view` 校验的原因(种子映射见 `apps/api/prisma/seed.ts:50`)。

| # | 方法 | 路径 | 权限(permissionCode @ target source) | 请求体要点 | 响应要点 |
| --- | --- | --- | --- | --- | --- |
| 1 | POST | `/management/companies` | `system.manage` @ static GLOBAL(仅 `SYSTEM_ADMIN@GLOBAL`) | `{ name, status }`(均非空字符串) | `CompanyResponse { id, name, status }` |
| 2 | POST | `/management/companies/:companyId/projects` | `project.create` @ companyParam | `{ name, address, centerLatitude, centerLongitude(字符串坐标), geofenceRadiusM(正整数), status(ProjectStatus), plannedStartDate, plannedEndDate? }` | `ProjectResponse`;**副作用:授予创建者 `PROJECT_ADMIN@PROJECT`**(§7);公司不存在 404 `COMPANY_NOT_FOUND` |
| 3 | POST | `/management/projects/:projectId/teams` | `team.manage` @ projectParam | `{ name, status }` | `TeamResponse { id, name, projectId, status }` |
| 4 | POST | `/management/projects/:projectId/workers` | `worker.manage` @ projectParam | 建档+入项合一:`{ encryptedName, encryptedIdNumber, idNumberHash, phone, workType, realNameStatus, faceProfileStatus, employmentStatus, teamId?, projectRoleLabel, requiresAttendance, memberStatus, enteredAt, exitedAt? }` | `ProjectWorkerMemberResponse`;事务内先 create `WorkerProfile` 再 create 成员;唯一冲突(`idNumberHash` 或 `[projectId, workerId]`)→ 409 `PROJECT_WORKER_MEMBER_CONFLICT`;班组跨项目 → 400 |
| 5 | POST | `/management/projects/:projectId/managers` | `project.manage` @ projectParam | `{ name, phone, profileStatus, roleCode("PROJECT_ADMIN"\|"TEAM_LEADER"), teamScopeId?, requiresAttendance, memberStatus }` | `ProjectManagerMemberResponse`;roleCode 与 teamScopeId 组合校验(§3.2);唯一冲突 → 409 `PROJECT_MANAGER_MEMBER_CONFLICT` |
| 6 | GET | `/management/companies/:companyId/projects` | `attendance.view` @ companyParam | — | `ProjectResponse[]`,仅该公司项目,`createdAt` 升序 |
| 7 | GET | `/management/companies/:companyId/participants` | `attendance.view` @ companyParam | — | `CompanyParticipantResponse[]`:全公司所有项目的工人+管理者(工人行在前),附 `projectName`;无分页 |
| 8 | GET | `/management/projects/:projectId/participants` | `attendance.view` @ projectParam | — | `ProjectParticipantResponse[]`:项目内工人+管理者统一列表(含 `teamName`) |
| 9 | GET | `/management/teams/:teamId/participants` | `attendance.view` @ **teamParam** | — | 仅该班组参与者:工人按 `teamId`、管理者按 `teamScopeId` 过滤;班组长(TEAM 级角色)可访问本班组 |
| 10 | GET | `/management/projects/:projectId/teams` | `team.manage` @ projectParam | — | `TeamResponse[]`,`createdAt` 升序 |
| 11 | GET | `/management/projects/:projectId/invitations` | `binding.invitation.create` @ projectParam | — | `BindingInvitationListItem[]`(`createdAt` 降序),**不含明文邀请码**;项目归属通过「项目成员档案 id 集合」反查(见 §8 备注) |
| 12 | POST | `/management/projects/:projectId/invitations/:invitationId/revoke` | `binding.invitation.create` @ projectParam | —(无 body) | 仅 `PENDING` 可撤销 → 状态置 `REVOKED`;非 PENDING → 409 `INVITATION_NOT_PENDING`;不存在 → 404 |

请求体全部经 zod schema 严格校验(`management-body.parsers.ts`),失败统一 400,`message` 形如 `INVALID_CREATE_PROJECT_REQUEST`,附 zod `issues`。

关联接口(不在 management 模块,但属于本域业务):

| 方法 | 路径 | 模块 | 权限 | 说明 |
| --- | --- | --- | --- | --- |
| POST | `/bindings/projects/:projectId/invitations` | `apps/api/src/bindings/bindings.controller.ts` | `binding.invitation.create` @ projectParam | 生成邀请码(§6.1) |
| POST | `/auth/bind` | `apps/api/src/auth/auth.controller.ts:65` | 仅登录态(无 permission 要求) | 凭邀请码绑定档案(§6.2) |

---

## 5. 邀请-绑定闭环

分工说明:本节讲**业务流**;邀请码哈希存储、token/session、`RequirePermission` 机制细节见《02 认证与权限》。

### 5.1 管理员生成邀请码(`BindingsService.createProjectInvitation`)

前置校验:项目存在;目标档案是该项目成员(工人按 `[projectId, workerId]`、管理者按 `[projectId, managerId]` 查 unique);成员 `status === "ACTIVE"`(否则 400 `BINDING_TARGET_MEMBER_NOT_ACTIVE`);档案 `userId === null` 未被绑定(否则 409 `BINDING_TARGET_PROFILE_ALREADY_BOUND`)。

生成:`randomBytes(24).toString("base64url")`,库中只存 `codeHash`(`hashSensitiveToken`),有效期 7 天(`invitationLifetimeMs`),状态 `PENDING`,同事务写 `AuditLog(action: "binding.invitation.create")`。**明文 code 仅在创建响应中出现一次**,列表接口(表 #11)只回哈希之外的元数据。

`BindingInvitation` 模型要点(`schema.prisma:209`):`targetType: ProfileOwnerType(WORKER|MANAGER)` + 二选一的 `workerProfileId` / `managerProfileId`(`onDelete: Restrict`);状态机 `BindingInvitationStatus: PENDING → ACCEPTED | EXPIRED | REVOKED`(`EXPIRED` 目前仅逻辑判定 `expiresAt`,无后台任务落库,标记**规划中**);`createdByUserId` / `acceptedByUserId` 双向留痕。

### 5.2 工人/管理者绑定(`AuthService.bindByInvitation`,`auth.service.ts:263`)

用户微信登录后拿邀请码调 `POST /auth/bind`:

1. 当前用户必须未绑定(`isBound === false` 且无任一档案,否则 409 `CURRENT_USER_ALREADY_BOUND`);
2. 按 `codeHash` 查邀请,须 `PENDING` 且未过期(否则 400 `BINDING_INVITATION_NOT_AVAILABLE`);
3. 事务内三步 guarded `updateMany`(以 `count === 1` 防并发双花,`assertSingleGuardedWrite`):邀请置 `ACCEPTED` + `usedAt/acceptedByUserId`;档案 `userId` 从 null 置为当前用户;用户 `isBound = true` 并把档案 `phone` 回填到 `User.phone`;
4. **授予角色**(同事务,`auth.service.ts:521-580`):
   - 工人:对每条 `status: "ACTIVE"` 的 `ProjectWorkerMember`,upsert `UserRole(WORKER, scopeType: PROJECT, scopeId: projectId)`;
   - 管理者:对每条 ACTIVE 的 `ProjectManagerMember`,按 `membership.roleCode` 授予——`teamScopeId` 非空则 `scopeType: TEAM, scopeId: teamScopeId`,否则 `scopeType: PROJECT, scopeId: projectId`;
5. 写 `AuditLog(action: "auth.bind.worker" | "auth.bind.manager")`。

至此闭环:管理员建档 → 生成邀请码线下交付 → 人员登录绑定 → 自动获得与成员关系一致的 RBAC 角色 → 后续打卡/审批接口按 scope 放行。测试锚点:`apps/api/test/auth.e2e.test.ts:766-909`("binding a worker grants WORKER@PROJECT..."、"binding a manager grants their role-code at TEAM scope...")。

---

## 6. 创建项目自动授予 PROJECT_ADMIN

已实现。`ManagementService.createProject`(`management.service.ts:215-252`)在**同一事务**内:

1. `transaction.project.create(...)`;
2. `transaction.role.findUnique({ where: { code: "PROJECT_ADMIN" } })`(角色未种子化则 404 `PROJECT_ADMIN_ROLE_NOT_FOUND`,项目创建一并回滚);
3. `transaction.userRole.create({ userId: actorUserId, roleId, scopeType: "PROJECT", scopeId: project.id })`。

`actorUserId` 来自 `@CurrentUser()`(controller 第 58-64 行)。效果:公司管理员创建项目后立即可管理该项目(建班组、录人、发邀请),无需二次授权。注意该授予**无幂等 upsert**(项目是新建的,`[userId, roleId, scopeType, scopeId]` 必然全新,不会冲突)。

---

## 7. 小程序端对应页面清单

`apps/miniprogram/src/pages/` 下与本域相关的页面(一句话对应):

| 页面 | 对应后端接口 |
| --- | --- |
| `company-projects` | `fetchCompanyProjects` → GET `/management/companies/:companyId/projects`(公司管理员项目列表) |
| `create-project` | `createCompanyProject` → POST `/management/companies/:companyId/projects`(创建项目表单,含围栏坐标/半径) |
| `company-people` | `fetchCompanyParticipants` → GET `/management/companies/:companyId/participants`(全公司人员) |
| `participants` | `fetchParticipants` → GET `/management/projects/:projectId/participants`(项目参与者列表) |
| `project-management` | `fetchProjectTeams` + `fetchProjectInvitations` + `revokeProjectInvitation` → 表 #10/#11/#12(班组与邀请管理) |
| `invitation` | `createInvitation` → POST `/bindings/projects/:projectId/invitations`(选人生成邀请码并展示/复制) |
| `bind` | `bindByInvitation` → POST `/auth/bind`(输入邀请码完成绑定) |

---

## 8. 设计取舍与已知缺口

**取舍(有意为之)**

- 档案与账号解耦、先建档后绑定:适配工地「工人无智能机/后到场」场景,管理员可先完成花名册。
- 建档 + 入项合一事务(表 #4/#5):一次请求完成 profile + member,避免出现游离档案;代价是**档案无法跨项目复用**(见下)。
- 撤销邀请用 `POST .../revoke` 子资源动词而非 `DELETE`:保留记录、状态机流转(`PENDING → REVOKED`),便于审计。
- `Team @@unique([id, projectId])` + 成员表复合外键:用 DB 约束兜底「班组同项目」,服务层校验只是为了友好错误信息。
- 邀请码明文只出现一次、库存哈希:泄露面最小化(测试锚点 `management.e2e.test.ts:1688` "...WITHOUT plaintext code")。

**已知缺口(规划中)**

1. **成员生命周期管理缺失**:无成员更新/退出/换班组/暂停接口——`exitedAt`、`status`、`teamId` 只能在创建时给定,之后无法修改;组织实体同样没有 update/delete(公司、项目、班组均只有 create+list)。
2. **档案跨项目复用**:`createProjectWorker` 总是新建 `WorkerProfile`,同一身份证号加入第二个项目会撞 `idNumberHash @unique` → 409;需要「查档 + 仅建成员关系」的入项接口。
3. **系统/公司管理员功能缺失**:`POST /management/companies` 仅 `SYSTEM_ADMIN@GLOBAL` 可用,但系统管理员本身与 `COMPANY_ADMIN@COMPANY` 的角色授予没有任何接口,只能靠种子脚本(`apps/api/prisma/seed.ts`、`seed.dev.ts`);也没有公司列表接口。
4. **身份信息假加密**(§2.1):`encryptedName/encryptedIdNumber/idNumberHash` 由客户端明文语义传入、服务端原样存储;工人姓名在所有列表中不可见(`displayName: null`)。
5. **邀请与项目无直接外键**:`BindingInvitation` 无 `projectId`,`listProjectInvitations` 靠「项目成员档案 id 集合」反查(`management.service.ts:472-495`);当前因缺口 2 不会出错,一旦支持档案跨项目复用,同一邀请会出现在多个项目列表中。
6. **状态字段弱类型**:`Company.status`、`Team.status`、`ManagerProfile.status`、`WorkerProfile` 的 `realNameStatus/faceProfileStatus/employmentStatus` 均为自由字符串,无枚举/状态机。
7. **邀请过期无落库**:`EXPIRED` 状态定义了但没有任务把过期 `PENDING` 邀请置为 `EXPIRED`,过期仅在 bind 时按 `expiresAt` 判定。
8. **列表无分页**:公司/项目参与者接口全量返回,人数上千后需分页与筛选。

---

## 文档状态

- 日期:2026-07-07
- 分支:`codex/foundation`
- 代码基线:`apps/api/src/management/*`、`apps/api/src/bindings/*`、`apps/api/src/auth/auth.service.ts`、`apps/api/prisma/schema.prisma`、`apps/api/prisma/seed.ts`
