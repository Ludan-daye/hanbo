# 三级项目管理员（PROJECT_ADMIN）：现状、缺口与规划

日期：2026-11-20。依据：`origin/main`（`644c969`）的代码、`README.md`、`docs/功能总览与实施计划.md`（下称“总览”）、`docs/superpowers/specs/2026-11-19-ui-redesign-design.md` 和 `docs/design/ui-redesign/src/s_admin.py`。下文路径相对仓库根目录。凡是根据代码推出、没有逐行验证的结论标“推断”。

## 0. 权限基线

| 来源 | 权限码 | 依据 |
| --- | --- | --- |
| 本级直接授予 | `attendance.view` `binding.invitation.create` `project.manage` `team.manage` `worker.manage` | `apps/api/prisma/seed.ts:58-62` |
| 继承自班组长 | `team.work.manage` `team.safety.manage` `attendance.view` `makeup.approve` | `seed.ts:53-54,63-64`；继承规则 `getEffectivePermissionCodes`（`packages/domain/src/roles.ts`） |
| 继承自工人 | `attendance.submit` `makeup.request` | `seed.ts:65-66` |

范围：项目管理员的授权是 `PROJECT` 范围。`scopeIncludesTarget` 规定 PROJECT 范围覆盖同项目下的 TEAM 目标（`roles.ts`），所以按班组授权的接口（`teamParam`）对项目管理员同样放行。项目管理员没有 `project.create` `company.manage` `system.manage`。

## 1. 现状

### 1.1 入口

- 首页：`apps/miniprogram/src/pages/home/views/project-admin.tsx`。顶部标牌（今日到岗／缺卡），“等你处理”三类待办（补卡、违规、底照，`home-model.ts` 的 `projectAdminTodos`），宫格只放项目人员、考勤报表、班组管理三项。多项目时可在页头切换（`use-home-scope.ts`）。
- 工作台：`pages/workspace/index.tsx` + `routing/features.ts` 中 `FEATURES.projectAdmin` 九项：补卡审批、违规复核、工时规则、项目人员、考勤报表、邀请绑定、班组管理、打卡安排、项目设置。
- “我的”：本人项目、任务、考勤、补卡（工人那一组功能）。
- 页面用 `hooks/use-management-scope.ts` 的 `useManagedProjectId` 确定项目：链接里的 `projectId` 只有在用户对该项目有 PROJECT_ADMIN（或更高职级）时才采用，否则取第一个 PROJECT_ADMIN 授权（`routing/projectAdmin.ts`）。

### 1.2 已接通的能力（入口 → 页面 → 接口 → 权限）

| 能力 | 入口 | 页面 | 接口 | 权限码／校验 |
| --- | --- | --- | --- | --- |
| 首页概览 | 首页 | `home/views/project-admin.tsx` | `GET /reports/projects/:projectId/daily`、`GET /makeups/pending`、`GET /safety-credit/projects/:projectId`、`GET /face-profiles/projects/:projectId` | `attendance.view`；收件箱无装饰器，服务内过滤；后两个用 `project.manage` |
| 补卡审批 | 工作台、首页待办 | `pages/team-makeups` | `GET /makeups/pending`、`GET /makeups/reviewed`、`POST /makeups/requests/:id/approve`、`/reject` | 服务内 `canApproveScopedMakeupRequest`，并要求审批人职级高于申请人（`makeup.service.ts:690-712`）；禁止自审 |
| 违规复核与申诉 | 工作台、首页待办 | `pages/safety-review` | `GET /safety-credit/projects/:projectId`（最近 500 条，`safety-credit.service.ts:308`）、`POST .../violations/:id/review`、`POST .../violations/:id/appeals/:appealId/review`、`GET /safety-credit/violations/:id/evidence/:index` | 服务内 `project.manage`；凭证按 `team.safety.manage` |
| 工时规则 | 工作台 | `pages/project-worktime` | `GET/PUT /worktime/projects/:projectId` | 读 `attendance.view`，写 `project.manage`；按版本防并发 |
| 项目人员 | 首页、工作台 | `pages/participants`、`person-form`、`person-reuse` | `GET /management/projects/:projectId/participant-page`（分页 ≤100，可按搜索、身份、职级、班组、状态筛选）、`GET/POST/PUT .../participants[/:memberId]`、`GET .../reuse-projects`、`POST .../reused-participants` | `project.manage` |
| 考勤报表与评分 | 首页、工作台 | `pages/reports` + `components/report-person-detail.tsx` + `components/monthly-export` | `GET /reports/projects/:projectId/{daily,weekly,monthly}`、`GET .../members/:memberId`、`POST .../members/:memberId/evaluation`、`POST/GET /report-exports` | 报表 `attendance.view`；评分 `project.manage`；导出在服务内校验 `attendance.view`（`report-exports.service.ts:128`） |
| 邀请绑定 | 工作台 | `pages/invitation` | `GET /management/projects/:projectId/participants`、`POST /bindings/projects/:projectId/invitations` | `attendance.view`、`binding.invitation.create` |
| 班组管理 | 首页、工作台 | `pages/project-management`、`pages/team-detail` | `GET .../managed-teams`、`POST .../teams`、`GET/PUT .../teams/:teamId`、`GET .../invitations`、`POST .../invitations/:id/revoke` | `team.manage`、`binding.invitation.create` |
| 打卡安排 | 工作台 | `pages/schedules` | `GET /attendance/planning/scopes`、`GET/POST /attendance/planning/:projectId/:scopeType/:scopeId`、`POST .../inherit` | 无装饰器，控制器 `target()` 比较职级，禁止本人、同级；写 AuditLog（`attendance-plans.controller.ts`） |
| 项目设置 | 工作台 | `pages/project-detail` | `GET/PUT /management/projects/:projectId` | `project.manage` |
| 底照审核 | 首页待办、项目人员页内链接（`participants/index.tsx:156`） | `pages/face-review` | `GET /face-profiles/projects/:projectId`、`GET .../:profileId/photo`、`POST .../:profileId/review` | `project.manage`；`FACE_SELF_REVIEW_FORBIDDEN`；条件 `updateMany`（`face.service.ts:158-200`） |

演示模式：上述页面在 `services/demo/client.ts` 的 `routeDemo` 中都有对应分支（management、bindings、face-profiles、safety-credit、worktime、reports、makeups、attendance/planning）。没有逐个子路径核对（推断）。

### 1.3 只做了一半、只有演示、或有问题

1. **首页读四份完整数据，只为几个数字。** 标牌只用到岗、缺卡，却读整份项目日报（全员明细，无分页）；补卡数来自跨项目收件箱（每页 50 条，`makeup.service.ts:764 take: 51`），再在前端按 `projectId` 过滤，所以超过一页时只能显示“N 条以上”，而且其他项目的申请会挤掉本项目的；违规数来自最多 500 条的完整看板；底照数来自不分页的全部底照列表。千人项目首屏负担重，数字也可能不准。
2. **工作台不给项目管理员显示待办数。** `workspace/index.tsx` 只在 TEAM_LEADER 的 TEAM 范围下读待审批数。
3. **底照审核没有固定入口。** `FEATURES.projectAdmin` 里没有 `face-review`；没有待审时首页也不出现这一项，只能从项目人员页进入。
4. **班组侧页面对项目管理员不开放，虽然接口允许。** `team-work` `team-safety` `team-log` `team-attendance` `safety-credit` 都用 `useManagedTeamId`，只接受 TEAM_LEADER 授权（`use-management-scope.ts:30-34`）。结果是项目管理员看不到各班组的安全交底确认、隐患整改、班组日报和任务，也不能直接登记违规（`POST /safety-credit/teams/:teamId/violations`）。
5. **补卡收件箱不能按项目筛选。** `GET /makeups/pending` 只接受 `cursor`。`docs/design/05-reports-queries.md:213` 早已把“项目维度待审列表”列为规划中。
6. **同级管理没有限制（推断）。** `participants.service.ts` 只拦截修改自己的授权（`CANNOT_CHANGE_OWN_MANAGEMENT_ASSIGNMENT`，约 807、986 行），`managerRole` 允许把成员设为 `PROJECT_ADMIN`，没有比较操作人职级。也就是说，项目管理员可以任命另一名项目管理员，也可以撤掉他。这和打卡安排、评分“不能设置／评价同级”的规则不一致。
7. **审核动作缺审计。** `auditLog.create` 只出现在 account、attendance-plans、auth、bindings、management、participants、teams、report-exports、team-work 中。补卡审批、底照审核、工时规则保存、违规复核都不写 AuditLog（后两者有自己的版本表或决定表）。`AuditLog` 也没有 `projectId` 列（`schema.prisma:667-680`），无法按项目查询。
8. **人员资料无法核实。** 敏感资料只有本人接口 `/account/worker-registration`。管理员读不到，也不能标记核实；`WorkerProfile.realNameStatus` 建档时写为 `PENDING` 后再也没有变化（`participants.service.ts:430`）。这是总览 F06／F24 的“部分完成”部分，也是 README 待完成表的第 1 项。
9. **工班组追溯不完整（F08）。** 人员分页可以按 `teamId` 筛选，但返回行里没有组长姓名，也不能按组长筛选。报表没有服务端班组筛选（班组只在前端过滤，`report-view.tsx:193`），历史组长版本没有存储：`Team` 只有当前 `leaderWorkerMemberId`／`leaderManagerMemberId`，`ProjectMemberHistory` 不记录组长。
10. **跨项目调人须请公司管理员。** `reuseProjects` 只列出操作人自己有 `project.manage` 的同公司项目（`participants.service.ts:504-537`）。只管一个项目的管理员看到的来源列表是空的。
11. **错误常量不统一。** `worktime.service.ts` 和 `project-evaluations.service.ts` 直接抛中文 `message`，没有用 SCREAMING_SNAKE 常量。前端会原样显示，但无法按常量分支。
12. **只有演示数据。** 首页公告读 `/app/settings`，只在 `FRONTEND_DEMO` 时请求（`home/views/parts.tsx:54-63`），API 没有这个接口。`/system/*` 平台管理也只有演示，不属于项目管理员。
13. **临时工异常没有处理工具。** 总览 F35 写明“忘记开工的异常仍需管理员核实，不自动补算”，但项目管理员没有对应的页面或接口。

## 2. 缺口（按对真实工地的价值排序）

| 序 | 缺口 | 依据 | 现在怎么绕 | 价值 |
| --- | --- | --- | --- | --- |
| G1 | 首页和工作台用轻量计数接口：数字准、首屏快 | 1.3-1、2、5；F33 | 读四份完整数据 | 高：每天打开，千人项目下最先变慢 |
| G2 | 同级授权边界 | 1.3-6；总览“打卡安排”“项目评分”规则 | 无 | 高：权限漏洞，改动小 |
| G3 | 人员资料核实与敏感字段分级查看、留痕 | F06／F24，README 待完成第 1 项 | 线下问本人 | 高：保险、银行卡、紧急联系人在出事时要用 |
| G4 | 项目管理员下钻到班组：交底确认、隐患、日报、任务（只读），并能直接登记违规 | 1.3-4；三级职责“授权项目人员、班组” | 找班组长要截图 | 中高：安全检查和事故追责都要看 |
| G5 | 搜工人能看到组长、按组长筛选；报表按班组筛选 | F08；总览“新增班组／组长筛选与汇总” | 前端过滤 | 中 |
| G6 | 审核动作写审计，并能按项目查询 | 1.3-7；F22“审计查询” | 无 | 中：纠纷时需要 |
| G7 | 底照审核固定入口；待办数和进入后的列表一致 | 1.3-3 | 从人员页进入 | 中，改动很小 |
| G8 | 历史组长版本进入报表 | F19 | 无 | 中：月内换组长时报表口径会错 |
| G9 | 临时工忘记开工、缺完工卡的核实工具 | F35 | 无 | 中：规则未定 |
| G10 | 向公司管理员申请从别的项目调人 | 1.3-10 | 线下找公司管理员 | 低中 |
| G11 | 打卡位置地图入口、报销核查 | F38 | Excel 里的“打卡位置”表 | 低中：业务流程未定 |
| G12 | 审批提醒和订阅通知 | F31 | 打开首页才知道 | 后续 |

## 3. 规划

每一期都能单独上线。每期结束：`corepack pnpm test`、`typecheck`、小程序 `tsc --noEmit`、`test:database`，两种构建通过；演示版截图和设计稿对照；`deploy:test` 后用 `dev-project` 测试账号回归。

### 第一期：首页与待办（G1、G7，以及 1.3-5）

**用户得到什么**：首页打开只读一个小接口，数字准确；工作台入口上显示待办数；底照审核固定在工作台；补卡审批页只显示当前项目的申请。

**API**
- 新增 `GET /management/projects/:projectId/overview?date=YYYY-MM-DD`，权限 `project.manage`（projectParam）。日期由 `parseOverviewQuery` 用 Zod 校验，非法日期抛 `BadRequestException({ message: "INVALID_OVERVIEW_QUERY", issues })`。响应：
  ```ts
  type ProjectOverview = {
    attendance: { expected: number; missing: number; present: number; workedMinutes: number };
    date: string;              // Asia/Shanghai 的 YYYY-MM-DD
    projectId: string;
    todos: { appealPending: number; facePending: number; makeupPending: number; violationPending: number };
  };
  ```
  `attendance` 复用 `reports.service.ts` 的日报计算，只返回合计，不返回明细。这一步省的是传输和前端计算，不省服务端计算；如果压测时这部分慢，再考虑缓存（推断）。`todos` 用 `count` 查询；`makeupPending` 必须和收件箱同一口径（范围、排除本人、审批人职级高于申请人），所以把 `inboxPage` 里的范围和职级判断抽成共用函数，避免“数字 3 条、点进去 2 条”。
- `GET /makeups/pending` 和 `/makeups/reviewed` 增加可选的 `projectId` 查询参数，在 `makeup-body.parsers.ts` 增加查询解析。传了无权项目时返回空列表，不报 403，与现有收件箱行为一致。
- 无 Prisma 变更。建议补索引：`face_profiles(status)`、`safety_violations(projectId, status)`。先查现有索引再定（推断）。

**domain**：无。

**小程序**
- `home/views/project-admin.tsx`：四个 `useCachedRead` 换成一个 `fetchProjectOverview`；`projectAdminTodos` 改为接收计数；“N 条以上”的写法删掉。
- `workspace/index.tsx`：PROJECT 范围也读 overview，在补卡审批、违规复核、底照审核三项上显示数字（沿用 `statuses`）。
- `routing/features.ts`：`FEATURES.projectAdmin` 增加底照审核（`/pages/face-review/index`，图标 `face`；`line-icon` 里没有就用 `users`）。
- `pages/team-makeups`：从项目进入时把 `projectId` 传给收件箱。
- 演示：`services/demo/client.ts` 增加 overview 分支，并让 `makeups/pending` 支持 `projectId`。
- `services/error-messages.ts` 增加 `INVALID_OVERVIEW_QUERY`。

**测试**：`apps/api/test/management.e2e.test.ts` 覆盖 overview 的权限（班组长 403，项目管理员 200）、跨项目隔离和日期校验；`makeup.e2e.test.ts` 覆盖 `projectId` 过滤；在 `management-workflows.integration.test.ts` 里用真实库核对计数和收件箱条数一致；小程序 `test/` 增加 `projectAdminTodos` 计数版本的单测。

**风险**：overview 和各列表的口径必须一致，验收标准是首页数字等于进入后的列表条数。

### 第二期：权限边界与审计（G2、G6）

**用户得到什么**：项目管理员不能任命或撤掉其他项目管理员（是否这样定，见待决问题 Q1）；补卡、底照、违规、工时规则的操作有据可查；公司管理员能按项目查看操作记录。

**domain**：`roles.ts` 新增 `canAssignRole(actorAssignments, targetScope, roleCode): boolean`。规则：操作人在目标范围内的最高职级必须严格高于被授予或被收回的职级。单测放在 `packages/domain/test`。

**API**
- `participants.service.ts` 的创建、更新、复用三处：新旧授权有差异时，用 `canAssignRole` 校验，不通过抛 `ForbiddenException({ message: "MANAGEMENT_ASSIGNMENT_REQUIRES_HIGHER_ROLE", roleCode })`。
- Prisma：给 `AuditLog` 增加可空的 `projectId`、`companyId`，并建索引 `(projectId, createdAt)`。迁移手写 SQL，只加列和索引，不回填旧数据。
- 补写 AuditLog，和状态变更在同一事务：`MAKEUP_APPROVED`／`MAKEUP_REJECTED`（`makeup.service.ts`）、`FACE_PROFILE_REVIEWED`（`face.service.ts`）、`WORKTIME_RULE_SAVED`（`worktime.service.ts`）、`SAFETY_VIOLATION_REVIEWED`／`SAFETY_APPEAL_REVIEWED`（`safety-credit.service.ts`）。`metadata` 只记编号和决定，不记敏感字段。
- 新增 `GET /management/projects/:projectId/audit-logs?cursor=&action=`，权限 `project.manage`，每页 50 条，按 `createdAt desc, id desc` 游标分页。
- 顺带把 `worktime.service.ts` 和 `project-evaluations.service.ts` 的中文 message 改成常量（如 `WORKTIME_RULE_VERSION_CONFLICT`、`PROJECT_EVALUATION_SCORE_INVALID`），并在 `API_ERROR_MESSAGES` 补上中文。

**小程序**：`person-form` 的“本人项目身份”中，对没有权限的身份置灰（职级从 `me` 计算）；`error-messages.ts` 增加新常量；`project-detail` 设置视图底部加一行“操作记录”，链接到新的列表视图（可以放到第四期）。演示：`assertDemoScope` 加同样的同级校验；增加 audit-logs 分支。

**测试**：`management.e2e.test.ts` 覆盖项目管理员任命或撤销项目管理员被拒、公司管理员可以；`management-workflows.integration.test.ts` 用真实库验证 AuditLog 带上 `projectId`，迁移由 `test:database` 的 drift 检查覆盖；`makeup.e2e`、`safety-credit.integration`、`worktime.integration` 断言写入了审计。

**风险**：测试服务器上可能已有项目管理员任命过其他项目管理员。新规则只拦截新的变更，不回收已有授权；上线前查一次 `user_roles` 列出这些情况（推断：数量很少）。

### 第三期：人员资料核实与组长追溯（G3、G5）

**用户得到什么**：在人员详情里查看工人的用工资料。默认脱敏，查看完整号码要写理由并留痕；可标记“已核实”或“需更新”；人员列表显示组长，可以按组长或核实状态筛选。

**Prisma（一次迁移）**
- `WorkerProfile`：沿用 `realNameStatus`，取值约定为 `PENDING | VERIFIED | NEEDS_UPDATE`，在 Zod 和 `management.types.ts` 中收紧。新增 `registrationVerifiedAt DateTime?`、`registrationVerifiedByUserId String?`、`registrationVerificationNote String?`、`registrationVersion Int @default(0)`（用于防并发）。

**权限**：新增 `worker.sensitive.view`，授予 PROJECT_ADMIN（由此往上继承）。`seed.ts` 的 `permissionSeeds` 和 `rolePermissionSeeds` 同步更新；测试服务器部署后需要运行一次 `prisma db seed`，它是幂等的 upsert（推断，见 `seed.ts:85-170`）。

**domain**：新增 `maskIdNumber`、`maskBankCard`、`maskPhone`，从 `src/index.ts` 导出，前后端共用。

**API**
- `GET /management/projects/:projectId/participants/:memberId/registration`（`project.manage`）：返回脱敏后的各字段、是否在保险期内、核实状态和 `registrationVersion`。健康说明只返回“有／无／未申报”，不返回原文。
- `POST .../registration/reveal`（`worker.sensitive.view`），请求体 `{ field: "ID_NUMBER" | "BANK_CARD" | "ADDRESS" | "INSURANCE" | "MEDICATION", reason: string(2..100) }`：返回该字段明文，响应头 `Cache-Control: no-store`；写 AuditLog `WORKER_REGISTRATION_FIELD_REVEALED`（只记字段名和理由，不记内容）。
- `POST .../registration/verification`（`project.manage`），请求体 `{ status: "VERIFIED" | "NEEDS_UPDATE", note, expectedVersion }`：条件 `updateMany` 断言恰好一行，否则抛 `REGISTRATION_CHANGED_RELOAD_BEFORE_SAVING`；写 AuditLog。工人重新提交资料后，`worker-registration.service.ts` 把状态改回 `PENDING`。
- `participant-page`：返回行增加 `teamLeaderName`；查询参数增加 `leaderMemberId`、`registrationStatus`（在 `parseParticipantPage` 的 strict 对象里加字段）。

**小程序**：`person-form` 查看已有成员时增加“用工资料”分组。默认显示脱敏值，每行有“查看”，点开后填写理由；下面是“核实”主按钮和“需更新”次按钮。`participants` 增加核实状态和组长筛选。新增常量写进 `API_ERROR_MESSAGES`。演示：`services/demo` 增加 registration 的三个分支，演示数据用虚构号码。

**测试**：`management-workflows.integration.test.ts` 需要加密密钥，验证脱敏、明文读取留痕、版本冲突、工人重填后状态回到 PENDING；`management.e2e.test.ts` 验证班组长读取 registration 返回 403、项目管理员读取其他项目返回 403；domain 增加脱敏函数单测；小程序增加视图模型单测。

**待决**：哪些字段允许项目管理员看明文（Q2）；是否要求理由（Q3）。

### 第四期：下钻到班组（G4）

**用户得到什么**：从班组资料页进入该班组的安全交底、隐患、日报和任务；项目级“安全一览”按班组列出今天是否发了交底、确认人数、未关闭隐患数；项目管理员也能直接登记违规。

**API**
- 现有 team-work 接口已经允许项目管理员访问，不需要改权限。
- 新增 `GET /team-work/projects/:projectId/safety-summary?date=`，权限 `team.safety.manage`（projectParam）。响应 `{ date, teams: [{ teamId, teamName, briefingPublished, acknowledged, expected, openIssues }] }`。日期按 Asia/Shanghai。

**小程序**
- `use-management-scope.ts`：`useManagedTeamId` 改为也接受“链接里的 `teamId` 加上用户对 `projectId` 有 PROJECT_ADMIN 或更高职级”。这样不必改页面路径。
- `team-detail` 增加四行入口：交底、隐患、日报、任务。项目管理员在这些页面上是否只读，见 Q4。默认建议只读，并加登记违规。
- `pages/safety-review` 顶部加“安全一览”视图；`pages/safety-credit` 支持从项目进入并选择班组后登记。
- 演示：safety-summary 分支；同时确认 `team-work` 演示路由对项目管理员放行（`assertDemoScope` 第 250 行附近的 teams 判断）。

**测试**：`team-work.integration.test.ts` 覆盖 safety-summary 的计数和跨项目隔离；小程序 `test/` 覆盖 `useManagedTeamId` 的新判断（可以抽成纯函数）。

**风险**：项目管理员同时是某个班组的组长时，入口会出现两次。用 `scopeKey` 去重即可。

### 第五期：报表口径（G5 报表部分、G8）

**API**
- `GET /reports/projects/:projectId/{daily,weekly,monthly}` 增加可选的 `teamId`，校验它属于该项目，否则抛 `TEAM_DOES_NOT_BELONG_TO_PROJECT`（常量已有）。
- 历史组长：新增 `TeamLeaderHistory`（`teamId, projectId, leaderWorkerMemberId?, leaderManagerMemberId?, effectiveFrom, recordedAt`）。`teams.service.ts` 更换组长时，在同一事务里追加一行；迁移时为每个现有班组写入一行，`effectiveFrom` 取班组 `createdAt`。这是推断出的最小方案，旧的组长变更无从还原。报表和 Excel 的“组长”列按日期取当时的组长。
- 新表的数据库测试要加进 `apps/api/scripts/test-database.ts` 的文件列表；如果只扩展 `management-workflows.integration.test.ts`，就不需要改列表。

**小程序**：`reports` 的班组筛选改成请求参数，不再前端过滤；人员明细显示当天的组长。演示：`services/demo/reports.ts` 支持 `teamId`。

**测试**：`reports.e2e.test.ts`（teamId 校验和过滤）；`management-workflows.integration.test.ts`（换组长后，月报前后半月显示不同组长）；导出 workbook 的单测检查组长列。

### 以后（规则定了再排）

- G9 临时工异常核实：需要先确定“管理员可以补录开工时间”还是“只能标记作废”（Q5）。接口预想为 `POST /attendance/projects/:projectId/task-anomalies/:id/resolution`，处理方式同第三期：条件更新加 AuditLog。
- G10 调人申请：`PersonnelTransferRequest` 表，由公司管理员审批。也可以更简单，把 `reuseProjects` 放宽到“同公司所有项目，只读可选”（Q6）。
- G11 打卡位置地图和报销：等报销流程确定（总览 F38）。
- G12 订阅消息：等正式 AppID 和模板（F31）。

## 4. 建议先做的三件事

1. **第一期：首页 overview 接口、补卡按项目筛选、底照审核入口。** 项目管理员每天第一眼看首页，现在的数字在多项目或待办多时不准（“N 条以上”、跨项目挤占），千人项目下首屏要读全员日报和 500 条违规。改动只涉及读接口和三个页面，不改表，风险最低。验收标准清楚：首页数字等于进入后的列表条数。
2. **第二期的同级授权校验（可以先于审计单独上线）。** 现在项目管理员可以任命或撤掉其他项目管理员（推断，见 1.3-6），这是权限漏洞。修复需要一个 domain 函数、participants 服务三处校验和一个新错误常量，一两天能完成并测透。审计列和查询页可以随后跟进。
3. **第三期：人员资料核实与脱敏查看。** README 待完成第 1 项、总览 F06／F24，工人端早已强制填写，管理端却看不到，资料等于没收。它需要一个迁移、一个新权限码和留痕设计，所以排在前两件之后；开工前请先回答 Q2 和 Q3。

## 5. 需要用户决定的问题

- **Q1** 项目管理员能否任命或撤销同项目的其他项目管理员？建议不能，只能由公司管理员及以上操作。
- **Q2** 项目管理员可以看哪些字段的明文？建议：身份证号、银行卡、住址、保单可以看明文（需要理由）；健康说明只看“有／无”，原文只给本人和公司管理员。
- **Q3** 查看明文是否必须填写理由？“已核实”是否需要上传凭证？
- **Q4** 项目管理员在班组的交底、隐患、任务页面上只读，还是可以替班组长操作？接口现在允许操作。
- **Q5** 临时工忘记开工时，管理员是补录开工时间（会产生工时），还是只能作废并让工人走补卡流程？
- **Q6** 跨项目调人：是新增“向公司管理员申请”的流程，还是让项目管理员直接看到本公司所有项目的人员？
- **Q7** overview 的“应到”口径：是否沿用日报的应勤（排除休息日、入场前、退场后、`requiresAttendance=false`）？项目管理员本人不打卡时是否计入？

## 用户的决定（2026-11-20）

1. 项目管理员**不能**任免同项目的其他项目管理员；只有公司管理员及以上可以。
2. 工人的用工资料（身份证、银行卡、地址、保险、健康、紧急联系人）项目管理员**都可以看原文**，不打码。
3. 看资料**不用写理由**；标记“已核实”**不用上传证明**。
4. 项目管理员在班组页面里**可以替组长操作**，不只是看。
5. 临时工忘了开工打卡：由设计者决定 —— **管理员只能作废这次任务考勤并提醒工人走补卡**，不直接补开工时间（不凭空生成工时，补卡仍要审批、留痕）。
6. 想用别的项目的人：**向公司管理员发申请**，公司管理员同意后调入。
7. 首页“应到”**按日报的应到规则算**（与考勤报表一致；不打卡的人不算应到）。

## 实施记录（2026-11-20，分支 `project-admin`）

- 决定 1、2、3、4、6、7 已实现，见各次提交。第三期的“组长追溯与筛选”（G5）、第五期报表口径（G8）、项目操作记录查询页没有做。
- 决定 5（临时工忘记开工）**暂缓**。原因：现有补卡只支持“已开工后的完工补卡”——`resolveTaskMakeup`（`apps/api/src/attendance/task-attendance.ts`）拒绝 `TASK_*_START`，并要求已有 `startedAt`。所以“作废后让工人走补卡”在今天走不通：工人无卡可补。要做干净，需要先给补卡加上任务开工点（申请时校验任务和人员、审批时写 `startedAt` 并用 `recalculateTaskResult` 重算当天及跨天结果、和已有完工补卡的先后顺序），这是补卡流程本身的扩展，不是项目管理员页面上的一个按钮。建议做法：
  1. 补卡支持 `TASK_<id>_START`：申请时间须在任务时段内、不晚于现在；审批后写 `startedAt`，再允许完工补卡。
  2. 管理员“作废”只作用于从未开工的分配：删除这条 `TeamTaskAssignment`（现在班组“工作安排”里已能移出未开工的人，项目管理员经“班组现场”也能办），并写 AuditLog。不补录、不生成工时。
  3. 工人端“我的任务”对未开工且已过开始时间的任务显示“去补开工卡”。

## 实施记录（续，2026-11-20）

- 决定 5 已实现：补卡支持任务开工点 `TASK_<id>_START`（申请时间须在任务计划时间内、不晚于现在、不与本人其他计时任务重叠；审批通过后写 `startedAt` 并重算当天结果，完工另行打卡或补卡）。管理员在班组“工作安排”详情里对过了开始时间仍未开工的临时工点“漏打开工”，只写 `team_task_assignments.startReminderAt` 和 AuditLog，不生成工时；工人在“我的任务”看到提醒和“申请开工补卡”。完工补卡的规则不变。
