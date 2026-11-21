# 四级公司管理员（COMPANY_ADMIN）：现状、缺口与规划

日期：2026-11-21。依据：分支 `project-admin`（`927283d`，与 `origin/main` 相同）的代码、`README.md`、`docs/功能总览与实施计划.md`（下称“总览”）、`docs/superpowers/specs/2026-11-19-ui-redesign-design.md`、`docs/design/ui-redesign/src/s_admin.py`，以及三级规划 `docs/superpowers/plans/2026-11-20-project-admin-plan.md`（下称“三级规划”）里用户的七个决定和两段实施记录。下文路径相对仓库根目录。根据代码推出、没有逐行验证的结论标“推断”。

三级的决定在这里照样适用：项目管理员不能任免同级，只有公司管理员及以上可以（决定 1）；管理员看用工资料原文、不写理由（决定 2、3）；跨项目调人由公司管理员同意（决定 6）；首页“应到”按日报口径（决定 7）。

## 0. 权限基线

| 来源 | 权限码 | 依据 |
| --- | --- | --- |
| 本级直接授予 | `company.manage` `project.create` | `apps/api/prisma/seed.ts:57-58` |
| 继承自项目管理员 | `attendance.view` `binding.invitation.create` `project.manage` `team.manage` `worker.manage` `worker.sensitive.view` | `seed.ts:59-64`；继承规则 `getEffectivePermissionCodes`（`packages/domain/src/roles.ts:117`） |
| 继承自班组长、工人 | `team.work.manage` `team.safety.manage` `makeup.approve` `attendance.submit` `makeup.request` | `seed.ts:54-55,65-68` |

范围：授权是 `COMPANY` 范围。`scopeIncludesTarget`（`roles.ts:183`）让 COMPANY 范围覆盖本公司下所有 PROJECT、TEAM 目标，所以所有 `projectParam`、`teamParam` 接口对公司管理员都放行。`canAssignRole`（`roles.ts:267`）要求操作人在目标范围内的职级严格高于被授予的职级，所以公司管理员可以任免项目管理员，但**不能任免公司管理员**。公司管理员没有 `system.manage`。

整个 API 里**没有任何接口能授予 `COMPANY_ADMIN`**：只有 `prisma/seed.dev.ts:123` 和 `seed.test-logins.ts` 会写这个角色；平台管理的 `/system/*` 只有演示实现（`services/demo/client.ts:402,704`）。这一点属于五级的范围，但它决定了真实公司能不能开通，所以列为本文的外部依赖（见 G11）。

## 1. 现状

### 1.1 入口

- 首页：`apps/miniprogram/src/pages/home/views/company-admin.tsx`。标牌显示全公司今天的到岗和缺卡；下面“今天的项目”每个项目一行，缺卡多的排前面（`home-model.ts:306` 的 `companyProjectLines`），点进去是项目的“进入项目”视图；宫格放公司人员、公司报表、新建项目。数字全部来自一次 `GET /reports/companies/:companyId/daily`。有多个公司时可在页头切换（`use-home-scope.ts`）。
- 工作台：`pages/workspace/index.tsx` 加上 `routing/features.ts` 的 `FEATURES.companyAdmin`，共八项：补卡审批、打卡安排、公司项目、调人申请、公司人员、新建项目、公司报表、操作记录。
- 进入项目：`pages/project-detail/index.tsx?view=hub`。用 `FEATURES.projectAdmin` 生成这个项目的入口宫格（补卡、违规、底照、工时规则、人员、报表、邀请、班组、班组现场、打卡安排、操作记录），下面一行是项目设置。这些页面都接受链接里的 `projectId`：`useManagedProjectId` 看到最高职级是 COMPANY_ADMIN 就直接采用（`hooks/use-management-scope.ts:8-22`）；班组页面用的 `resolveManagedTeamId` 也对 COMPANY_ADMIN 放行（`routing/teamLeader.ts`）。
- 公司由 `useManagedCompanyId` 确定：采用链接里的 `companyId`，但要求本人在这家公司是 COMPANY_ADMIN；没有链接时取第一个 COMPANY_ADMIN 授权（`routing/companyAdmin.ts`）。

### 1.2 已接通的能力（入口 → 页面 → 接口 → 权限）

| 能力 | 入口 | 页面 | 接口 | 权限码／校验 |
| --- | --- | --- | --- | --- |
| 首页概览 | 首页 | `home/views/company-admin.tsx` | `GET /reports/companies/:companyId/daily` | `attendance.view`（companyParam） |
| 公司项目 | 工作台、首页“全部项目” | `pages/company-projects` | `GET /management/companies/:companyId/projects` | `attendance.view`（`management.controller.ts:300`） |
| 新建项目 | 首页、工作台、公司项目底部按钮 | `pages/create-project` + `components/project-manager-picker` + `project-geofence` | `GET .../companies/:companyId/project-manager-candidates`、`POST .../companies/:companyId/projects` | `project.create`；同一事务写项目、管理员成员、`UserRole` 和 AuditLog（`management.service.ts:324-404`） |
| 进入项目（项目管理员的全部能力） | 首页项目行、公司项目“进入项目” | `pages/project-detail?view=hub` 及三级规划 1.2 表里的各页 | 三级规划 1.2 表中的接口 | 继承 + COMPANY 范围 |
| 任免项目管理员 | 进入项目 → 项目人员 → 人员资料 | `pages/person-form`（`canGrantProjectAdmin` 放开“管理员”身份，`person-form/index.tsx:268-273`） | `POST/PUT /management/projects/:projectId/participants[/:memberId]` | `project.manage` + `canAssignRole` |
| 公司人员 | 首页、工作台 | `pages/company-people`（`person-row.ts`） | `GET /management/companies/:companyId/participants` | `attendance.view`；点一行进入该项目的 `person-form` |
| 用工资料查看与核实 | 公司人员 → 人员资料 → 用工资料 | `pages/person-registration` | `GET .../participants/:memberId/registration`、`POST .../registration/verification` | `worker.sensitive.view`（继承） |
| 调人申请审批 | 工作台 | `pages/transfer-approvals`（`transfer-view.ts`） | `GET /management/companies/:companyId/transfer-requests?status=`、`POST .../:requestId/approve`、`/reject` | `company.manage`；条件 `updateMany` 认领，失败回滚为 PENDING，写 AuditLog（`transfer-requests.service.ts:227-298`） |
| 公司报表与 Excel | 首页标牌、工作台 | `pages/company-reports` → `pages/reports/report-view.tsx`（`byProject`） | `GET /reports/companies/:companyId/{daily,weekly,monthly}`（可带 `teamId` 或 `leaderMemberId`）、`GET .../companies/:companyId/team-options`、`POST/GET /report-exports`（`scope: COMPANY`） | `attendance.view`；导出在服务内校验（`report-exports.service.ts:109-136`） |
| 操作记录 | 工作台 | `pages/audit-log`（`audit-view.ts`，句子来自 `packages/domain/src/audit-log.ts`） | `GET /management/companies/:companyId/audit-logs?projectId=&cursor=` | `company.manage`；按 `AuditLog.projectId in 本公司项目` 查询（`audit/audit-log.service.ts:49-80`） |
| 补卡审批 | 工作台 | `pages/team-makeups` | `GET /makeups/pending[?projectId=]`、`/reviewed`、`POST /makeups/requests/:id/approve|reject` | COMPANY 范围的收件箱 `{ project: { companyId } }`（`makeup.service.ts:818-850`），再按职级过滤；项目管理员自己的补卡只有公司管理员能批 |
| 打卡安排 | 工作台 | `pages/schedules` | `GET /attendance/planning/scopes`、`GET/POST /attendance/planning/:projectId/:scopeType/:scopeId` | 控制器内比较职级（`attendance-plans.controller.ts:72-140`） |

演示模式：公司项目、公司人员、项目管理员候选、新建项目、公司报表、调人申请、公司操作记录在 `services/demo/client.ts` 都有分支（约 235-240、885-1095、1840-1895 行；`demo/audit-log.ts`）。公司管理员的功能没有出现“只有演示”的情况（推断：没有逐个子路径核对）。只有演示的是平台管理 `/system/*` 和首页公告 `/app/settings`（`home/views/parts.tsx:54-63` 只在 `FRONTEND_DEMO` 时请求）。

### 1.3 只做了一半、只有演示、或有问题

1. **首页读全公司日报，只为几个数字。** `company-admin.tsx` 读整份公司日报（全公司所有人的明细，不分页），在前端按项目分组。几个工地加起来上千人时，首屏最慢的就是这里（F33）。另外，没人或今天没有应到的项目不会出现在“今天的项目”里（`companyProjectLines` 只从日报行分组）；筹备中、已暂停的项目也看不出来。
2. **首页和工作台没有待办。** 三级已经有 `GET /management/projects/:projectId/overview`（`overview/project-overview.service.ts`）和工作台计数，公司这一级都没有。调人申请、项目管理员的补卡（只有公司管理员能批）、各项目积压的底照和违规，都只能一页一页点进去看。总览 F23 写着“公司统一待办”已完成，实际上公司首页没有待办区。
3. **补卡收件箱混在一起。** 公司管理员的收件箱包含全公司所有下级的申请，其中绝大多数班组长和项目管理员就能批；真正只有公司管理员能批的（申请人是项目管理员，或者没有更高职级的项目审批人）被淹没在里面。收件箱每页 50 条，按创建时间排序。
4. **没有“各项目由谁负责”的视图。** `company-projects` 每张卡只有名称、状态、地址、围栏和工期（`ProjectResponse`，`management.service.ts:94-107`），看不到管理员、人数、今日出勤。项目管理员不能任免同级（三级决定 1）之后，所有管理员的任免都落在公司管理员身上，但只能进入某个项目 → 项目人员 → 找到这个人 → 改身份，一次一个项目。某人离职后要在几个项目分别撤职，没有“此人在全公司担任什么”的视图，也没有一次处理的办法。
5. **新建项目只能选“已经在本公司项目里任职”的管理员。** `eligibleProjectManagers` 和 `eligibleWorkerManagers`（`management.service.ts:58-75`）要求候选人已经是本公司某个项目的成员，或本身就是公司管理员。新招的项目经理必须先挂到另一个项目里才能被选中，新公司的第一个项目只能选公司管理员自己。
6. **新建的项目不能马上打卡（推断）。** `createProject` 不建默认班次、排班或工时规则；打卡要求 `today.configured`（`attendance.service.ts:570-578`），默认班次缺失时报 `DEFAULT_SHIFT_NOT_CONFIGURED`（`attendance.service.ts:1241-1253`）。所以项目管理员必须先进“打卡安排”和“工时规则”，否则工人打不了卡，工时都记成“未分类”。公司没有默认规则可以套用，每个项目都从零配置。
7. **公司人员是一行一个任职，且一次全量读出。** `listCompanyParticipants`（`management.service.ts:520-556`）读出本公司所有项目的全部成员（含已退场），不分页、不能在服务端筛选；同一个人在两个项目就是两行。设计稿 `s_admin.py` 的 `c_people` 是一人一行（“李明，2 个项目”）。列表也不显示资料核实状态和底照状态，没法回答“全公司还有多少人资料没核实”。
8. **公司操作记录缺公司级的事。** 查询按 `AuditLog.projectId` 过滤，但 `project.create` 的审计行不带 `projectId`（`management.service.ts:396-401`），`report.export.requested`、`report.export.downloaded` 也不带（`report-exports.service.ts:193-205,284-291`）。所以“谁建了项目”“谁导出了全公司 Excel”在公司操作记录里看不到。`AuditLog` 也没有 `companyId` 列（`schema.prisma:676-692`）。
9. **查看敏感资料不留痕。** 三级决定 2、3 让管理员直接看原文、不写理由，但 `registration-review.service.ts` 只在核实时写 `WORKER_REGISTRATION_VERIFIED`，查看本身不记录。总览 F24 的“查看／导出留痕”仍未完成。
10. **调人申请列表最多 100 条，不分页，也不能按项目筛选**（`transfer-requests.service.ts:208-224`）。同意后，原项目的成员身份不变（`participants.reuse`，即“兼任”）；“调走”需要再去原项目手动办退场。
11. **打卡安排页一次读出全公司。** `GET /attendance/planning/scopes` 对 COMPANY 范围会读出本公司所有进行中项目的全部班组和成员（`attendance-plans.controller.ts:92-99`），工地多时会很慢（推断）。
12. **项目状态、考勤范围谁都能改。** `PUT /management/projects/:projectId` 只要 `project.manage`，项目管理员就能把项目改成“已完工”或“已暂停”，也能改围栏（`management.service.ts:241-288` 会写 AuditLog）。是否要收归公司管理员，需要定（Q5）。
13. **公司级规则没有入口。** 安全信用规则只有超级管理员能改（`safety-credit.service.ts:621-635`，并且直接抛中文 message），工作台里“信用规则”只给 systemAdmin（`features.ts`），公司管理员连只读都看不到。工时规则只有项目级（`worktime/worktime.controller.ts`）。
14. **跨项目的人员履历和评分汇总没有。** 总览三级表里四级的职责包括“历史评分及汇总”；F32 的“人员跨项目履历及历史版本查询”未做。现在只能逐个项目看报表里的评分。
15. **公司资料不能改。** `Company` 有简称、信用代码、联系人、地址（`schema.prisma:286-302`），但没有修改接口，只有超级管理员的 `POST /management/companies`。

## 2. 缺口（按对一家同时开几个工地的公司的价值排序）

| 序 | 缺口 | 依据 | 现在怎么绕 | 价值 |
| --- | --- | --- | --- | --- |
| G1 | 公司首页改读轻量概览：每个项目一行（含没人、筹备中的项目）、应到／到岗／缺卡，加“等你处理”；工作台显示计数 | 1.3-1、2；F23、F33 | 读全公司日报；待办逐页找 | 高：每天第一眼，人多时最先变慢 |
| G2 | 补卡收件箱分出“只有你能批”的 | 1.3-3 | 在全部申请里翻 | 高：项目管理员的补卡没人批，就卡在这里 |
| G3 | 全公司“项目由谁负责”：一屏看各项目的管理员，任免、换人、离职一次撤职 | 1.3-4；总览四级职责“管理员分配”；三级决定 1 | 一个项目一个项目改 | 高：三级决定之后这是公司管理员独有的活 |
| G4 | 新建项目：可以直接录入新的管理员；可以套用公司默认的打卡安排和工时规则，建完就能打卡 | 1.3-5、6 | 先挂到别的项目；建完再配两页 | 高：每开一个工地都要走一遍 |
| G5 | 公司人员按人汇总、分页、服务端筛选，显示在哪些项目、资料核实和底照状态 | 1.3-7；设计稿 `c_people`；F06、F33 | 全量读出后前端搜 | 中高：查人、查资料缺口、保险核对 |
| G6 | 公司操作记录覆盖公司级动作（建项目、导出、调人），查看敏感资料留痕 | 1.3-8、9；F22、F24 | 无 | 中：纠纷、审计、数据安全 |
| G7 | 公司级默认规则（打卡安排模板、工时规则模板）；信用规则只读 | 1.3-6、13 | 每个项目各配各的 | 中 |
| G8 | 跨项目看板：各项目安全（未复核违规、低信用人员）、底照积压、资料未核实数 | 1.3-2；F37 | 逐个进入项目 | 中 |
| G9 | 人员跨项目履历与评分汇总 | 1.3-14；F32 | 逐个项目看报表 | 中：用人决策要看 |
| G10 | 调人申请可选“调走”或“兼任”；列表分页、按项目筛选 | 1.3-10 | 同意后去原项目手动退场 | 中低 |
| G11 | 开通公司管理员、修改公司资料 | 0 节；1.3-15；F22 | 只能用种子脚本 | 中：真实公司上线前必须有，但属于五级平台管理 |
| G12 | 项目状态（暂停、完工）收归公司管理员 | 1.3-12 | 无 | 低中：规则未定 |
| G13 | 打卡安排的范围列表分页或按项目选择 | 1.3-11 | 无 | 低中：工地多了才明显 |
| G14 | 审批和调人申请的订阅通知 | F31 | 打开首页才知道 | 后续：等正式 AppID 和模板 |

## 3. 规划

每一期都能单独上线。每期结束要跑 `corepack pnpm test`、`typecheck`、小程序 `tsc --noEmit`、`test:database`，两种构建都通过；拿演示版截图和设计稿对照；`deploy:test` 之后用 `dev-company` 测试账号回归。改了 domain 的那一期，先 `corepack pnpm --filter @construction/domain build` 再跑小程序测试。

### 第一期：公司首页与待办（G1、G2，顺带 G10 的分页）

**用户得到什么**：首页只读一个小接口；每个项目一行，写“到岗 43／48”，缺卡多的排前面，没人或筹备中的项目也列出（Q1）；“等你处理”列出调人申请、只有你能批的补卡，以及各项目积压的底照和违规；工作台入口上显示数字。

**API**
- 新增 `GET /management/companies/:companyId/overview?date=YYYY-MM-DD`，权限 `company.manage`（companyParam），放在 `apps/api/src/overview/`，与 `project-overview` 并列（新建 `company-overview.service.ts`，模块里注册）。查询参数用 `parseOverviewQuery` 同一套 Zod 校验，错误常量沿用 `INVALID_OVERVIEW_QUERY`。响应：
  ```ts
  type CompanyOverview = {
    attendance: { expected: number; missing: number; present: number; workedMinutes: number };
    companyId: string;
    date: string; // Asia/Shanghai
    projects: readonly {
      attendance: { expected: number; missing: number; present: number };
      name: string;
      projectId: string;
      status: "ACTIVE" | "COMPLETED" | "PREPARING" | "SUSPENDED";
      todos: { facePending: number; violationPending: number };
    }[];
    todos: { makeupOnlyYou: number; makeupPending: number; transferPending: number };
  };
  ```
  `attendance` 复用 `reports.service.ts` 的日报计算，只返回合计（与三级 overview 一样，省传输、不省计算；压测慢了再考虑按项目缓存，推断）。底照、违规在一条 `groupBy({ by: ["projectId"] })` 里算，不要每个项目查一次。`transferPending` 用 `personnelTransferRequest.count`。
- 补卡：在 `makeup.service.ts` 抽出判断 `onlyApprover(request, authorization)`：同一项目内，除本人外没有其他人的职级严格高于申请人、且范围覆盖这条申请（实际上就是“申请人是项目管理员”，或者项目里没有更高职级的有效审批人）。`GET /makeups/pending` 增加可选 `onlyMine=true`（在 `makeup-body.parsers.ts` 的查询解析里加字段）；`makeupOnlyYou` 与 `onlyMine=true` 的列表必须同一口径，沿用三级 overview 的做法，把条件放进共用函数。
- 调人申请：`GET /management/companies/:companyId/transfer-requests` 增加 `cursor`、`projectId`（目标或来源项目），每页 30 条，按 `createdAt` 游标分页，在 `transfer-requests.parsers.ts` 解析。
- 无 Prisma 变更。先查现有索引，`makeup_requests(projectId, status)`、`face_profiles(status)` 不够时再补（推断）。

**domain**：无（`onlyApprover` 只用到 `roleLevelInScope`，留在 API 里）。

**小程序**
- `home/views/company-admin.tsx`：`fetchCompanyDailyReport` 换成 `fetchCompanyOverview`；新增 `companyAdminTodos(overview)`，放在 `home-model.ts`；`companyProjectLines` 改为从 `overview.projects` 生成，非进行中的项目折叠成一行“另有 N 个筹备中／暂停的项目”（按 Q1 决定）。
- `workspace/index.tsx`：COMPANY 范围读 overview，在补卡审批、调人申请上显示数字（沿用 `statuses`）。
- `pages/team-makeups`：COMPANY 范围顶部加 `Segmented`：“需要你批”（`onlyMine=true`，默认）和“全部”（按 Q2 决定）。
- `pages/transfer-approvals`：改为分页加载，加项目筛选。
- `project-detail` 的 hub 视图读项目 overview，在补卡、违规、底照入口上显示数字（接口已有）。
- 演示：`services/demo/client.ts` 增加公司 overview 分支；`makeups/pending` 支持 `onlyMine`；调人申请支持分页。
- 小程序新的服务端常量写进 `services/error-messages.ts` 的 `API_ERROR_MESSAGES`。

**测试**：`apps/api/test/management.e2e.test.ts` 覆盖公司 overview 的权限（项目管理员 403、公司管理员 200、别家公司 403）和日期校验；`makeup.e2e.test.ts` 覆盖 `onlyMine`（项目管理员的申请出现，工人的不出现，本人的不出现）；`project-admin.integration.test.ts` 或新的 `company-admin.integration.test.ts` 用真实库核对“首页数字等于进入后列表条数”。新文件必须加进 `apps/api/scripts/test-database.ts` 第 103 行的列表。小程序 `test/` 增加 `companyAdminTodos`、`companyProjectLines` 的单测。

**风险**：`onlyApprover` 的口径要和 `reviewableItems` 完全一致，否则会出现“首页说 2 条、点进去 1 条”。项目很多时，overview 的日报合计仍要扫全公司，必须先在测试服务器上量一下耗时。

### 第二期：项目由谁负责（G3，顺带 G4 前半段）

**用户得到什么**：新增“项目负责人”页：每个项目一行，写着管理员是谁，没有管理员的项目标红；点一个人能看到他在全公司担任的所有职务，可以在某个项目任命或撤销，也可以“离岗”，一次撤掉他在本公司的所有管理职务（Q3）。新建项目时可以直接录入一个新管理员（姓名、手机号），再用邀请码绑定（Q4）。

**API**
- `GET /management/companies/:companyId/project-admins`（`company.manage`）：`{ projects: [{ projectId, name, status, admins: [{ memberId, participantType, profileId, displayName, phone, isBound }] }] }`。来源是 `projectManagerMember`（`roleCode = PROJECT_ADMIN`）和 `projectWorkerMember`（`projectRoleLabel = PROJECT_ADMIN`）。
- `GET /management/companies/:companyId/people/:participantType/:profileId/roles`（`company.manage`）：这个人在本公司各项目的成员身份、职级、班组、状态。
- `POST /management/companies/:companyId/people/:participantType/:profileId/offboard`（`company.manage`），请求体 `{ mode: "REVOKE_ADMIN" | "EXIT_ALL", effectiveDate, expectedVersion? }`。在一个事务里按项目逐个调用 `participants.service.ts` 现有的更新逻辑（撤职、退场时同步收回 `UserRole`、清班组负责人，三级已实现），每个项目各写一条 AuditLog，`projectId` 照填；外加一条公司级 `PERSONNEL_OFFBOARDED`（第五期加上 `companyId` 之后才能在公司操作记录里看到）。对自己操作时抛 `CANNOT_CHANGE_OWN_MANAGEMENT_ASSIGNMENT`（常量已有）。
- 任命：不新增接口，前端跳到该项目的 `person-form`，或者走现有的 `POST .../reused-participants`（选人后把身份设为 PROJECT_ADMIN）。
- 新建项目时录入新管理员：`CreateProjectRequest` 增加 `newManagers: [{ name, phone }]`（0–3 人，`management-body.parsers.ts`），事务里建 `ManagerProfile` 和 `projectManagerMember`，不建 `UserRole`（未绑定的人在绑定时才授权，现有绑定流程会补，推断：需核对 `bindings.service.ts`）。`managerProfileIds` 和 `newManagers` 合起来至少一人，否则沿用 `PROJECT_MANAGERS_NOT_ELIGIBLE`。手机号与本公司已有档案重复时抛 `PROJECT_MANAGER_PHONE_EXISTS`，并返回已有档案的 `profileId`，让前端改为选中他。
- `ProjectResponse` 增加可选的 `adminNames: string[]` 和 `activeMembers: number`，只在 `listCompanyProjects` 中填（`_count` + 一次查管理员），公司项目卡上直接显示。

**domain**：无（任免校验沿用 `canAssignRole`）。

**小程序**
- 新页 `pages/company-admins`（在 `app.config.ts` 注册），`FEATURES.companyAdmin` 加“项目负责人”（图标 `users`）。列表用 `Sheet` 加 `Row`；人员详情用子视图，“离岗”是危险按钮，二次确认；失败用 `Notice tone="error"` 放在按钮旁。
- `company-projects` 卡片显示管理员和在场人数。
- `create-project` 的管理员选择器加“录入新管理员”，创建成功后提示“去邀请绑定”，链接到该项目的 `pages/invitation`。
- 演示：`demo/project-managers.ts` 增加 project-admins、roles、offboard 三个分支，新建项目支持 `newManagers`。

**测试**：`management.e2e.test.ts` 覆盖项目管理员调用 offboard 返回 403、对自己操作被拒、别家公司 403；DB 套件验证离岗之后各项目的 `UserRole` 全部收回、班组负责人清空、写入 `team_leader_changes`、各项目 AuditLog 带 `projectId`；新建项目带 `newManagers` 时事务回滚（手机号重复）。

**风险**：离岗涉及多个项目，必须一个事务，按项目 id 排序加锁（沿用 `createProject` 的 `FOR SHARE` 写法，推断：用 `FOR UPDATE`）。被离岗的人正在打卡或有待审补卡时怎么办：建议只收回权限，不动考勤和补卡记录；他待批的补卡转给上级（现在自动就是公司管理员）。

### 第三期：公司人员按人汇总（G5，顺带 G9 的只读部分）

**用户得到什么**：公司人员一人一行，写“在 2 个项目”，分页加载；可以按项目、身份、在场状态、资料核实状态、底照状态筛选；点进去是这个人的跨项目页：各项目的身份、班组、进退场日期、项目评分，再点项目进入原来的 `person-form`。

**API**
- 新增 `GET /management/companies/:companyId/people-page`（`company.manage`），查询 `{ page, pageSize ≤ 100, search, projectId?, participantType?, permissionRole?, status?, registrationStatus?: "PENDING"|"VERIFIED"|"NEEDS_UPDATE", faceStatus?: "NONE"|"PENDING"|"APPROVED"|"REJECTED" }`，`parseCompanyPeoplePage` 用 `.strict()`。按档案（`participantType + profileId`）分组，返回 `{ items: [{ participantType, profileId, displayName, phone, projectCount, projects: [{ projectId, projectName, memberId, roleLabel, teamName, status }], registrationStatus, faceStatus }], total }`。搜索复用 `participant-page` 的 `nameSearchHashes`。
- 新增 `GET /management/companies/:companyId/people/:participantType/:profileId`（`company.manage`）：跨项目履历，包括 `projectMemberHistory` 的进退场和调组、`ProjectMemberEvaluation` 的各项目当前评分。和第二期的 `.../roles` 合并成一个接口。
- 旧的 `GET /management/companies/:companyId/participants` 保留，暂时供演示和测试使用，下一期删除（推断：只有 `company-people` 用它）。
- 无 Prisma 变更。按档案分组的分页需要原生 SQL 或两步查询（先分页拿 profileId，再查成员）；`WorkerProfile` 的姓名是加密的，排序只能按 id 或手机号（推断）。

**domain**：无。

**小程序**：`pages/company-people` 改成分页，`person-row.ts` 改成按档案生成，筛选放进一个 `Sheet` 式的筛选面板；新页 `pages/company-person`（跨项目履历）。演示：`services/demo` 增加 people-page 与详情两个分支，演示数据造一个两个项目的人。

**测试**：DB 套件验证同一人在两个项目只出一行、`registrationStatus` 筛选、跨公司隔离（别家公司的同一档案不出现）；`management.e2e.test.ts` 覆盖 `pageSize` 上限和 `INVALID_COMPANY_PEOPLE_PAGE`；小程序 `test/` 测 `personRow` 新版本。

**风险**：工人档案理论上可以跨公司（信用跨公司一份），详情只能显示本公司项目，不能泄露别家公司的任职。

### 第四期：公司默认规则（G4 后半段、G7）

**用户得到什么**：公司设置里有一份默认的打卡安排（上下班时间、工作日）和工时规则（项目类型、午休、加班开始时间）；新建项目时默认勾选“套用公司默认”，建完当天就能打卡，工时按规则分类；之后各项目自己改，不回写公司（Q6）。“信用规则”对公司管理员只读可见（Q7）。

**Prisma（一次迁移，手写 SQL）**
- 新表 `CompanyAttendanceDefault`：`id, companyId, version, startsOn, workdays Int[], segments Json, projectKind, lunchStart?, lunchEnd?, overtimeStart?, createdByUserId, createdAt`，`@@unique([companyId, version])`，只追加不改写，与 `ProjectWorktimeRule`、`AttendancePlan` 一样按版本保留。

**API**
- `GET/PUT /management/companies/:companyId/attendance-defaults`（读 `attendance.view`，写 `company.manage`），PUT 带 `expectedVersion`，冲突抛 `COMPANY_DEFAULTS_VERSION_CONFLICT`；写 AuditLog `COMPANY_DEFAULTS_SAVED`。
- `createProject` 增加 `applyCompanyDefaults: boolean`（默认 true）：在同一事务里调用 `attendance.service.ts` 现有的默认班次和默认排班写入逻辑，以及 `worktime.service.ts` 的规则写入，`startsOn` 取项目计划开工日和今天中较晚的一天。需要把这几段逻辑抽成能接收 `transaction` 的函数（推断：现在它们自己开事务）。
- 顺带把 `worktime.service.ts`、`safety-credit.service.ts` 里的中文 message 改成常量（三级规划已提过，实施记录里没做的部分），并补 `API_ERROR_MESSAGES`。
- `FEATURES.companyAdmin` 加“信用规则”（只读）：`GET /safety-credit/policies` 已经只要登录，前端在非超级管理员时隐藏“新版本”表单即可。

**domain**：把默认班次的校验（两个有序时段、工作日不重复，现在在 `attendance-body.parsers.ts:144-245`）搬到 `packages/domain/src/attendance.ts` 并导出，前后端共用。

**小程序**：新页 `pages/company-settings`（公司默认打卡和工时，复用 `schedules`、`project-worktime` 的表单组件）；`create-project` 加“套用公司默认”开关和一行摘要；`safety-policy` 页按职级切换只读。演示：`demo/configuration.ts`、`demo/worktime.ts` 增加公司默认分支。

**测试**：`worktime.integration.test.ts` 和 `attendance-plans.integration.test.ts` 增加“套用公司默认后，新项目当天 `attendance-today` 为 configured”；迁移由 `test:database` 的 drift 检查覆盖；domain 增加校验函数单测。

**风险**：公司默认改了以后，已建的项目不变，这一点要在页面上写清楚，否则公司管理员会以为全公司都改了。

### 第五期：公司审计与留痕（G6），跨项目看板（G8）

**用户得到什么**：公司操作记录里能看到谁建了项目、谁导出了哪个月的全公司 Excel、谁让谁离岗；查看敏感资料留下“谁在什么时候看了谁的用工资料”（不写理由，Q9）；新增“各项目一览”，按项目列出未复核违规、待审底照、资料未核实人数、信用低于 60 分的人数。

**Prisma**：`AuditLog` 增加可空 `companyId` 和索引 `(companyId, createdAt)`。迁移只加列，回填 `projectId` 不为空的行的 `companyId`（一条 `UPDATE ... FROM projects`，回填是安全的，因为项目所属公司不会变，推断）。

**API**
- 所有写审计的地方都带上 `companyId`：最简单的办法是在 `audit/` 下加一个 `auditData(...)` 帮手，传 `projectId` 时自动查出 `companyId`；`project.create` 补上 `projectId`，导出两条补上 `companyId`、`projectId`。
- `audit-log.service.ts` 的公司查询改为 `companyId = :companyId`，可再按 `projectId` 筛；`packages/domain/src/audit-log.ts` 增加 `PERSONNEL_OFFBOARDED`、`COMPANY_DEFAULTS_SAVED`、`WORKER_REGISTRATION_VIEWED` 的句子。
- `registration-review.service.ts` 的 GET 写 `WORKER_REGISTRATION_VIEWED`，同一人同一查看者 10 分钟内只记一次（推断：避免页面刷新刷屏）。
- 新增 `GET /management/companies/:companyId/project-health`（`company.manage`）：`{ projects: [{ projectId, name, violationPending, appealPending, facePending, registrationPending, lowCredit }] }`，全部用 `groupBy`。

**小程序**：`audit-log` 页的公司模式增加“公司”类型（建项目、导出、离岗、默认规则）；新页或公司首页下半部分“各项目一览”（Q10）。演示：`demo/audit-log.ts` 增加新动作和 `companyId`，增加 project-health 分支。

**测试**：DB 套件验证回填、新写的行带 `companyId`、跨公司隔离；`reports.e2e.test.ts` 断言导出写审计；domain 测新的句子。

### 以后（规则定了或五级做了再排）

- G10 调人申请选“调走”或“兼任”（Q11）：申请多一个 `mode`，同意时若是“调走”，在同一流程里把原项目成员按 `enteredAt` 的前一天办退场（复用 participants 的退场逻辑），写两条审计。
- G11 开通公司管理员、修改公司资料：随五级平台管理接通一起做；公司管理员可改联系人、地址这类资料（`PUT /management/companies/:companyId`，`company.manage`），名称和信用代码只能由超级管理员改（Q12）。
- G12 项目状态收归公司管理员（Q5）：`updateProject` 在 `status` 变化时要求 `company.manage`，否则抛 `PROJECT_STATUS_REQUIRES_COMPANY_ADMIN`。
- G13 打卡安排的范围：`GET /attendance/planning/scopes` 增加 `projectId`，公司管理员先选项目再选范围。
- G14 订阅通知：等正式 AppID 和模板（F31）。

## 4. 建议先做的三件事

1. **第一期：公司首页 overview 和“只有你能批”的补卡。** 公司管理员每天打开首页，现在首屏要读全公司日报，项目越多越慢；项目管理员的补卡只有公司管理员能批，却混在全公司的收件箱里，容易一直没人处理。这一期只加读接口、不改表，验收标准清楚：首页每个数字等于点进去之后的列表条数。
2. **第二期：项目负责人页和“离岗”。** 三级决定 1 把所有项目管理员的任免交给了公司管理员，但现在只能一个项目一个项目改；管理员离职时漏撤一个项目，就等于留了一个有完整权限的账号。这里大部分逻辑已经在 `participants.service.ts` 里（撤职收权、清负责人、写组长变更），新增的主要是一个公司级的查询和一个按项目循环的事务。新建项目时录入新管理员可以拆出来，晚一点再上。
3. **第四期中的“新建项目套用公司默认”。** 现在每开一个工地，项目管理员都要先配打卡安排和工时规则，不配就打不了卡（推断，见 1.3-6），工时也会记成“未分类”。这一件只需要一张表和 `createProject` 的一个开关，直接减少开工第一天的问题。公司设置页可以先只做一份默认值，不做版本历史界面。

第三期（按人汇总的公司人员）价值也高，但需要分组分页的查询设计，排在这三件之后；第五期的审计 `companyId` 迁移可以和第二期一起上，因为“离岗”的公司级审计需要它。

## 5. 需要用户决定的问题

- **Q1** 公司首页“项目”一栏是否列出筹备中、已暂停、已完工的项目？建议：只列进行中的项目，其余合成一行“另有 N 个”，点开是公司项目页。
- **Q2** 公司管理员的补卡审批页默认显示什么？建议：默认只显示“需要你批”（申请人是项目管理员，或项目里没有更高职级的人能批），另一个标签看全部。
- **Q3** 管理员离职时，“离岗”是只收回管理职务，还是把他在本公司所有项目都办退场？建议：两种都给，默认只收回管理职务；考勤和补卡记录都不动。
- **Q4** 新建项目时，能否直接录入一个还没在本公司任何项目里的新管理员（姓名＋手机号，之后用邀请码绑定）？建议：能。
- **Q5** 项目状态（暂停、完工）是否只能由公司管理员改？考勤范围呢？建议：状态只能由公司管理员改；考勤范围项目管理员仍可改，照常写审计。
- **Q6** 公司默认的打卡安排和工时规则：只在新建项目时套用一次，之后各项目自己改、公司改了也不影响已有项目，对吗？建议：对。
- **Q7** 安全信用规则公司能否自定？建议：不能，全平台一份（总览已定“全局规则版本化、跨公司累计一份”）；公司管理员只读可见。
- **Q8** 公司人员列表是一人一行（写“在 2 个项目”）还是一个任职一行（现在的做法）？建议：一人一行，与设计稿一致。
- **Q9** 管理员查看工人用工资料要不要留下记录（只记谁、什么时候看了谁，不要求写理由）？建议：要。
- **Q10** “各项目一览”（违规、底照、资料未核实、低信用）放在公司首页下半部分，还是单独一页？建议：单独一页，首页只放“等你处理”的数字，以免首页又变重。
- **Q11** 调人申请同意后，原项目的身份怎么处理：保持兼任（现在的做法），还是默认调走（原项目办退场）？建议：申请时选择，默认“调走”。
- **Q12** 公司管理员能否任命另一个公司管理员、能否改公司资料？建议：不能任命公司管理员（只有超级管理员能，随五级接通）；可以改联系人、电话、地址，名称和信用代码只能由超级管理员改。

## 用户的决定（2026-11-21）

用户回复“都按照你的推荐做”：Q1–Q12 全部按第 5 节的建议执行。

- Q1 首页只列进行中的项目，其余合成一行“另有 N 个”，点开是公司项目页。
- Q2 补卡审批默认“需要你批”，另一个标签看全部。
- Q3 离岗两种都给，默认只收回管理职务；考勤、补卡记录不动。
- Q4 新建项目时可以直接录入新管理员（姓名＋手机号，之后用邀请码绑定）。
- Q5 项目状态只能由公司管理员改；考勤范围项目管理员仍可改，写审计。
- Q6 公司默认打卡安排和工时规则只在新建项目时套用一次。
- Q7 安全信用规则全平台一份，公司管理员只读。
- Q8 公司人员列表一人一行。
- Q9 查看工人用工资料留访问记录（谁、何时、看了谁），不要求理由。
- Q10 “各项目一览”单独一页，首页只放“等你处理”的数字。
- Q11 调人申请时选“调走”或“兼任”，默认“调走”（同意时原项目办退场）。原列在“以后”，随本轮一起做。
- Q12 公司管理员不能任命公司管理员；可改联系人、电话、地址，名称和信用代码只能由超级管理员改。

另外并入本轮（第 3 级测试时发现）：TEMPORARY_INVITATION_CREATED／ACCEPTED 审计写入 projectId；`seed.test-logins.ts` 增加第六个测试账号 `dev-worker-2`（纯工人，不在任何项目），供临时工流程测试。
