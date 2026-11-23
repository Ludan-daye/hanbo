# 五级超级管理员（SYSTEM_ADMIN）：现状、缺口与规划

日期：2026-11-22。依据：分支 `project-admin`（`c8fb484`，与 `origin/main` 相同）的代码、`README.md`、`docs/功能总览与实施计划.md`（下称“总览”）、设计稿 `docs/design/ui-redesign/src/s_admin.py`、`docs/design/02-auth-authorization.md`，以及三级规划 `2026-11-20-project-admin-plan.md`（下称“三级规划”）、四级规划 `2026-11-21-company-admin-plan.md`（下称“四级规划”）里用户的决定和实施记录。下文路径相对仓库根目录。根据代码推出、没有逐行验证的结论标“推断”。

前两级的决定在这里照样适用：管理员看用工资料原文、不写理由（三级决定 2、3）；查看用工资料留访问记录（四级 Q9）；安全信用规则全平台一份，公司管理员只读（四级 Q7）；公司管理员不能任命公司管理员，可改联系人、电话、地址，**名称和信用代码只能由超级管理员改**（四级 Q12）；项目状态只能由公司管理员或超级管理员改（四级 Q5）。

## 0. 权限基线

| 来源 | 权限码 | 依据 |
| --- | --- | --- |
| 本级直接授予 | `system.manage` | `apps/api/prisma/seed.ts:56` |
| 继承自公司管理员 | `company.manage` `project.create` | `seed.ts:57-58`；继承规则 `getEffectivePermissionCodes`（`packages/domain/src/roles.ts:117-130`） |
| 继承自项目管理员 | `attendance.view` `binding.invitation.create` `project.manage` `team.manage` `worker.manage` `worker.sensitive.view` | `seed.ts:59-64` |
| 继承自班组长、工人 | `team.work.manage` `team.safety.manage` `makeup.approve` `attendance.submit` `makeup.request` | `seed.ts:54-55,65-68` |

范围：授权是 `GLOBAL` 范围，`scopeId` 固定为 `"GLOBAL"`（`roles.ts:13`）。`scopeIncludesTarget` 对 GLOBAL 授权一律放行（`roles.ts:189-191`），所以所有 `companyParam`、`projectParam`、`teamParam` 接口对超级管理员都放行，四级、三级的全部接口他都能调。

**任免规则的后果。** `canAssignRole` 要求操作人在目标范围内的职级**严格高于**被授予的职级（`roles.ts:267-271`）。超级管理员是 5 级，所以：
- 他可以任免公司管理员（5 > 4），这是四级规划 G11 留给本级的事。
- **没有任何人能通过这条规则任免超级管理员**（5 > 5 不成立）。超级管理员的开通和撤销必须另定规则（Q3）。

**`system.manage` 实际只用在一个接口上**：`POST /management/companies`（`apps/api/src/management/management.controller.ts:212-226`）。除此之外，代码里对超级管理员的判断都是直接查 `UserRole`：安全信用规则发布（`safety-credit/safety-credit.service.ts:625-636`）、项目状态修改（`management.service.ts:300-311` 的 `companyLevel`）、离岗保护（`company-people.service.ts:264-275`）、新建项目时的排班作者级别（`management.service.ts:447`）。

**生产环境没有第一个超级管理员。** 只有开发种子 `prisma/seed.dev.ts:122` 和测试直登 `dev-system`（`apps/api/src/auth/test-accounts.ts:22`，`seed.test-logins.ts`）会写 `SYSTEM_ADMIN`；`prisma/seed.ts` 只建角色和权限，`apps/api/package.json:6-23` 也没有开通管理员的脚本。正式上线时，没有办法在不手写 SQL 的情况下得到第一个超级管理员。

## 1. 现状

### 1.1 入口

- 首页：`apps/miniprogram/src/pages/home/views/system-admin.tsx`。标牌只有一句“平台账号已就绪”（`system-admin.tsx:34-39`），注释写明“公司数、账号数这些数字要等平台管理的接口有了再放上来（现在只有演示版有）”（`:15-18`）。宫格三项：平台管理、信用规则、打卡安排；下面一行补卡审批（`:8-13`）。设计稿的首页标牌是“1 家公司，2 个项目／52 个账号在用／待分配权限 3 个账号”（`s_admin.py:282-290`），没有实现。
- 工作台：`routing/features.ts:173-183` 的 `FEATURES.systemAdmin`，共四项：补卡审批、信用规则、打卡安排、平台管理。没有公司报表、操作记录。
- 平台管理：`pages/system-management/index.tsx`，四个标签：公司、账号、设置、日志（`:294-306`）。只有最高职级是 SYSTEM_ADMIN 才能进（`:68`）。
- 进入某家公司：只能从“平台管理 → 公司 → 点一家 → 公司项目”跳到 `pages/company-projects?companyId=`（`index.tsx:218-222`）。四级的公司页面（公司人员、项目负责人、各项目一览、公司设置、调人申请、公司报表、操作记录、新建项目）都通过 `useManagedCompanyId` 取公司，它对 SYSTEM_ADMIN 接受链接里的任何 `companyId`（`hooks/use-management-scope.ts:23-28`）；项目页的 `useManagedProjectId` 同样放行（`:8-22`）。所以这些页面超级管理员都能用，**只是没有入口**：公司详情页只链到“公司项目”一页。

### 1.2 已接通与只有演示的能力

| 能力 | 入口 | 页面 | 接口 | 真实接口？ |
| --- | --- | --- | --- | --- |
| 公司列表、新增、暂停／恢复 | 平台管理 → 公司 | `system-management/views/companies.tsx` | `GET/POST /system/companies`（`services/workflows.ts:170-173`） | **否**。API 没有 `system` 控制器（全部 `@Controller` 见 `apps/api/src/**/*.controller.ts`，无 `system`、无 `app`）。只有演示分支 `services/demo/client.ts:812-835` |
| 账号列表、改等级／范围／状态 | 平台管理 → 账号 | `views/accounts.tsx` | `GET /system/accounts`、`PUT /system/accounts/:id`（`workflows.ts:174-180`） | **否**，演示 `demo/client.ts:836-852` |
| 平台设置（联系电话、首页公告） | 平台管理 → 设置 | `views/settings.tsx` | `GET/PUT /system/settings`（`workflows.ts:181-186`） | **否**，演示 `demo/client.ts:853-859`；数据库里没有存放平台设置的表（推断：`schema.prisma` 中无相关模型） |
| 平台日志 | 平台管理 → 日志 | `views/audit.tsx` | `GET /system/audit`（`workflows.ts:187-188`） | **否**，演示 `demo/client.ts:860`；页面自己写着“这里是演示数据里最近的 200 条操作”（`audit.tsx:36-38`） |
| 首页公告 | 所有管理人员首页 | `home/views/parts.tsx` 的 `useAnnouncement` | `GET /app/settings`（`workflows.ts:197-198`） | **否**，只在 `FRONTEND_DEMO` 时请求（`parts.tsx:52-62`），演示 `demo/client.ts:641` |
| 新建公司（仅名称、状态） | 无前端入口调用它 | — | `POST /management/companies`（`management.controller.ts:212-226`） | 是，但只收 `name`、`status` 两个字符串（`management-body.parsers.ts:48-51`），不写审计（`management.service.ts:313-322`） |
| 安全信用规则发布 | 首页、工作台“信用规则” | `pages/safety-policy`（可编辑判断 `safety-policy/index.tsx:75`） | `GET/POST /safety-credit/policies`（`safety-credit.controller.ts:36-46`） | 是。发布只认 GLOBAL 的 SYSTEM_ADMIN（`safety-credit.service.ts:625-636`），但不写 AuditLog（`:621-660` 内无 `auditLog`） |
| 补卡审批 | 首页、工作台 | `pages/team-makeups` | `GET /makeups/pending`、`/reviewed`、`POST /makeups/requests/:id/approve|reject` | 是。GLOBAL 授权的收件箱条件是 `{}`，即**全平台所有补卡**（`makeup/makeup.service.ts:858-865`） |
| 打卡安排 | 首页、工作台 | `pages/schedules` | `GET /attendance/planning/scopes` 等 | 是。GLOBAL 授权读出**全平台所有进行中项目的全部班组和成员**（`attendance-plans.controller.ts:85-100`） |
| 公司、项目各页 | 只能靠链接 `?companyId=` | 四级、三级的全部页面 | 四级、三级接口 | 是（GLOBAL 覆盖一切目标） |

演示模式的数据形状和真实数据不一致：演示的 `Account` 是“一个账号一个等级一个范围”（`services/workflows.ts:38-45`，`demo/state.ts:395-410`），保存账号就是整个替换（`demo/client.ts:836-852`）。真实的 `UserRole` 是一人多条（`schema.prisma:230-244`），而且项目、班组级的角色由成员记录同步生成（`management/membership-roles.ts:100-128`、`auth/auth.service.ts:560-568`），直接改 `UserRole` 会和成员记录对不上。所以演示版“账号”标签的交互不能原样接到真实接口上。

### 1.3 只做了一半、只有演示、或有问题

1. **在正式环境里，平台管理整页打不开。** 页面一进来就 `Promise.all` 同时读 `/system/companies`、`/system/accounts`、`/system/settings`、`/system/audit`（`system-management/index.tsx:77-83`），这四个接口在 API 上都不存在，任何一个 404 整页就显示“平台数据没读到”（`:310-316`）。用 `dev-system` 在测试服务器上登录，平台管理永远是出错状态（推断：没有在测试服务器上实际点过）。
2. **超级管理员看不到公司列表。** API 没有任何“列出所有公司”的接口；`GET /management/companies/:companyId/projects` 需要先知道 `companyId`。所以超级管理员在正式环境里**到达不了任何一家公司**，四级做好的公司页面对他都是死的。
3. **没有任何接口能开通公司管理员**（四级规划 0 节、G11）。`participants.parsers.ts:16-17` 明确拒绝把成员身份设为 `COMPANY_ADMIN` 或 `SYSTEM_ADMIN`；四级的离岗也不能处理公司管理员、超级管理员（`company-people.service.ts:264-275`，四级实施记录第二期）。公司管理员离职后，没有办法收回他的权限。
4. **新公司的第一位管理员无法绑定。** 绑定只有项目邀请码：`POST /bindings/projects/:projectId/invitations`（`bindings/bindings.controller.ts:17`），管理人员目标必须是该项目的成员（`bindings.service.ts:182-200` 的 `BINDING_TARGET_PROJECT_MANAGER_NOT_FOUND`）；绑定后只按项目成员记录授予角色（`auth.service.ts:565-568`）。未绑定的账号连接口都进不了（`access-token.guard.ts:158-160` 的 `ACCOUNT_BINDING_REQUIRED`）。一家还没有项目的新公司，它的管理员没有路径进入系统。现在唯一的绕法是：超级管理员替这家公司建第一个项目、在“新管理员”里录入此人（四级第二期的 `newManagers`），用项目邀请码绑定，然后……仍然没有接口把他升为公司管理员。
5. **公司资料：建的时候只有名称，之后名称和信用代码谁都改不了。** `Company` 有简称、信用代码（唯一）、联系人、电话、地址（`schema.prisma:286-302`），但 `POST /management/companies` 只收名称和状态，`status` 是任意非空字符串（`management-body.parsers.ts:48-51`，`schema.prisma:291` 的 `status String`）。四级做的 `PUT .../profile` 只能改联系人、电话、地址（`company-settings.service.ts:210`）。四级 Q12 定了名称、信用代码由超级管理员改，但这个接口还没有。
6. **“暂停公司”没有效果。** 演示里暂停后提示“这家公司的管理员暂时不能管理公司和项目”（`views/companies.tsx:91-95`），演示的权限检查也确实拦（`demo/client.ts:462-468`）。真实 API 里，公司状态只在班组安排工作时检查（`team-work/team-work.service.ts:47-53`）；授权（`authorization/permissions.guard.ts:41-47`）、打卡（`attendance.service.ts:984-985,1188` 只看项目状态）、补卡都不看公司状态。
7. **账号停用：后端会拦，但没人能停用。** `User.status` 有 `ACTIVE`/`DISABLED`（`schema.prisma:18-21,108`），登录、续期、每次请求都检查（`auth.service.ts:134-136,212,252`；`access-token.guard.ts:144-149`），会话版本 `sessionVersion` 不一致也会踢掉（`access-token.guard.ts:122-131`）。但整个 API 没有写 `DISABLED` 的地方（全局搜索只有读）。员工离职、手机丢失、账号被盗时，只能改数据库。
8. **超级管理员自身没有保护。** 没有开通脚本（0 节）；演示版只拦“不能改自己”（`demo/client.ts:839-842`，`views/accounts.tsx:134-137`），没有“至少留一个超级管理员”的检查，演示的等级选择器里可以把别人设为超级管理员（`system-view.ts:35-37,46-47`），这和 `canAssignRole` 的规则矛盾。
9. **平台级的事不留痕。** 新建公司（`management.service.ts:313-322`）、发布信用规则（`safety-credit.service.ts:621-660`）都不写 AuditLog。审计查询只有项目级和公司级（`audit/audit-log.controller.ts:15-30`，`audit-log.service.ts:48-71`），没有跨公司查询；`companyId`、`projectId` 都为空的平台级记录现在没有任何页面能看到。演示版日志用正则把“POST /路径”翻成人话（`system-view.ts:69-120`），真实审计已经由 `packages/domain/src/audit-log.ts` 生成句子，两套不通用。
10. **首页公告、联系电话只存在于演示数据。** 没有表、没有接口（1.2 表）。联系电话在设置页以外没有任何地方显示（全局只有 `views/settings.tsx` 和类型定义用到 `supportPhone`）。
11. **补卡收件箱是全平台。** GLOBAL 的收件箱条件为空（`makeup.service.ts:858-859`），每页 50 条；补卡页只对 COMPANY_ADMIN 开“需要你批”（`pages/team-makeups/index.tsx:141-149`），超级管理员只能看全部。而“只有你能批”的口径不算公司级授权（`makeup.service.ts:1033-1041`，四级实施记录第一期），即使开了，项目管理员的补卡对超级管理员也会显示为“只有你能批”，和公司管理员重复。真正只有超级管理员能批的，是申请人本身是公司管理员的补卡（推断：公司管理员很少是项目成员，量很小）。
12. **打卡安排页一次读全平台。** 这是四级 1.3-11、G13 的放大版：GLOBAL 时 `projectFilters` 为 `{ id: { not: "" } }`（`attendance-plans.controller.ts:87`），把所有进行中项目连同全部成员读出（`:94-101`）。公司多了这一页会最先变慢（推断）。
13. **平台管理页还会按公司、按项目逐个读。** 读完公司后，对每家公司读项目、对每个项目读班组（`system-management/index.tsx:84-91`），只为给演示版的“管理范围”选择器备选项。正式接通后必须去掉（推断：公司多时是 N+1 请求）。
14. **超级管理员能看全平台工人的敏感资料。** 他继承 `worker.sensitive.view`（0 节），通过项目链接可以打开任何工人的用工资料；四级第五期已让查看写 `WORKER_REGISTRATION_VIEWED`，但只有公司操作记录能看到（推断：这类行带 projectId，触发器补 companyId）。总览 F24“管理员敏感字段分级查看及脱敏、查看／导出留痕”仍未完成（总览第 142 行）。
15. **总览与实际不符。** 总览 F22 写“公司、账号、设置和审计前端演示”“接通平台管理接口；公司级授权、账号停用及审计查询”未完成（第 140 行），与代码一致；但 F23 写“班组／项目／公司／平台统一待办……已完成”（第 141 行），平台这一级实际没有待办（见第 1 条首页）。角色表写五级负责“全平台公司、账号、权限、平台规则和审计”（第 37 行），目前只有“平台规则”中的信用规则是真实的。

## 2. 缺口（按对“真的开通几家公司、让平台跑起来”的价值排序）

| 序 | 缺口 | 依据 | 现在怎么绕 | 价值 |
| --- | --- | --- | --- | --- |
| G1 | 公司：真实的列表、新建（完整资料）、改名称和信用代码、“进入公司”看四级的全部页面 | 1.3-1、2、5、13；四级 Q12 | 手写 SQL；记住 companyId 拼链接 | 最高：没有它，平台看不到任何公司 |
| G2 | 公司管理员的任命、撤销；新人用公司级邀请码绑定 | 1.3-3、4；四级 G11 | 只能用种子脚本 | 最高：真实公司上线的前提 |
| G3 | 第一个超级管理员的开通；超级管理员的保护（不能改自己、至少留一个、App 里不能任免超级管理员） | 0 节；1.3-8 | 手写 SQL | 高：上线第一天就要，工作量小 |
| G4 | 账号：按手机号、姓名查人，看他在各公司各项目的全部身份；停用、恢复（立即下线） | 1.3-7；F22 | 改数据库 | 高：离职、丢手机、盗号时唯一的止损手段 |
| G5 | 公司暂停真正生效 | 1.3-6 | 无（按钮只在演示里有用） | 中高：合同到期、欠费时要用；规则待定（Q5） |
| G6 | 平台操作日志：跨公司查询；建公司、改公司、任免公司管理员、停用账号、发布信用规则、改平台设置都留痕 | 1.3-9、14；F22、F24 | 无 | 中高：平台出了问题要能查是谁做的 |
| G7 | 平台首页：规模数字和“等你处理”（没有管理员的公司、没接受的公司管理员邀请、只有你能批的补卡） | 1.3-15；设计稿 `s_admin.py:282-290`；F23 | 逐页找 | 中 |
| G8 | 补卡收件箱的平台口径：“只有你能批”算上公司级授权 | 1.3-11 | 在全平台补卡里翻 | 中：量小，但没人批就一直卡着 |
| G9 | 平台设置：首页公告、平台联系电话 | 1.3-10 | 无 | 中低 |
| G10 | 打卡安排的范围按公司、项目选（四级 G13） | 1.3-12 | 无 | 中低：对本级比对四级更明显，但可以先去掉入口（Q11） |
| G11 | 审批和邀请的订阅通知（四级 G14） | F31 | 打开首页才知道 | 后续：等正式 AppID 和模板；对本级意义不大，平台的事少 |

不列为缺口：全平台出勤报表、全平台 Excel。导出接口按公司、项目、班组建任务（`reports/report-exports.service.ts:104-136`），平台层面没有“全平台月报”的业务需要（推断），超级管理员“进入公司”后看公司报表即可（Q10）。异地备份、告警、压测（总览 F25、F33）是运维，不放进小程序。

## 3. 规划

每一期都能单独上线。每期结束要跑 `corepack pnpm test`、`typecheck`、小程序 `tsc --noEmit`、`test:database`，两种构建都通过；拿演示版截图和设计稿对照；`deploy:test` 之后用 `dev-system`、`dev-company` 测试账号回归。改了 domain 的那一期，先 `corepack pnpm --filter @construction/domain build` 再跑小程序测试。新的数据库集成测试文件 `apps/api/test/system-admin.integration.test.ts` 要加进 `apps/api/scripts/test-database.ts:103` 的列表。

新接口统一放在新模块 `apps/api/src/system/`（`system.controller.ts`、`system.service.ts`、`system.parsers.ts`），在 `app.module.ts` 注册；路径用 `/system/*`，和小程序已经写好的地址一致（`services/workflows.ts:170-188`）。权限一律 `system.manage`，`target` 用 `static` + `GLOBAL`，照抄 `management.controller.ts:212-222`。

### 第一期：公司和公司管理员（G1、G2）

**用户得到什么**：平台管理的“公司”标签读真实数据：一家一行，写“3 个进行中项目，管理员：张三、李四”，没有管理员的公司标红。新增公司可以填名称、简称、信用代码、联系人、电话、地址。点一家公司：改资料（含名称和信用代码）、看管理员、任命或撤销公司管理员；任命时可以选一个已有的管理账号，也可以录入一个新人（姓名＋手机号）拿到一个邀请码发给他（Q1）。公司详情里有“进入公司”，打开和公司管理员一样的宫格（公司项目、公司人员、项目负责人、各项目一览、调人申请、公司报表、操作记录、公司设置）。

**Prisma（一次迁移，手写 SQL）**
- 新表 `CompanyManagerMember`：`id, companyId, managerProfileId, status ("ACTIVE"|"REVOKED"), appointedAt, appointedByUserId, revokedAt?, revokedByUserId?`，`@@index([companyId, status])`，部分唯一索引“同一公司同一人只有一条 ACTIVE”。它和 `ProjectManagerMember`（`schema.prisma:416`）的作用一样：任命先落在档案上，绑定时再生成 `UserRole`，撤销时收回。这样新人在绑定前就能被任命，任免也有历史。
- 已有的 COMPANY_ADMIN `UserRole`（种子写的）在迁移里回填成 ACTIVE 的成员记录（只回填有 `managerProfile` 的用户；没有的列入迁移注释，推断：只有种子数据）。
- `Company.status` 暂不改类型（仍是字符串），在解析器里限定为 `ACTIVE`/`SUSPENDED`。

**API**
- `GET /system/companies?search=&status=&cursor=`：`{ items: [{ id, name, shortName, creditCode, status, projectCount, activeProjectCount, admins: [{ memberId, name, phone, isBound }] , createdAt }], nextCursor }`，每页 30 条，按 `createdAt` 游标。项目数用一条 `groupBy`。
- `POST /system/companies`：`{ name, shortName?, creditCode?, contactName?, contactPhone?, address? }`（`.strict()`），名称去空格后同名拒绝 `COMPANY_NAME_EXISTS`，信用代码 18 位且唯一，否则 `COMPANY_CREDIT_CODE_EXISTS`、`INVALID_CREDIT_CODE`；状态固定 ACTIVE。写 AuditLog `COMPANY_CREATED`（`companyId` 直接写）。旧的 `POST /management/companies` 保留到前端切换完成后删除，同时删掉 `management.e2e.test.ts:2000` 起的那条用例或改写（推断：没有前端在用它）。
- `GET /system/companies/:companyId`：资料、项目数、管理员（含未绑定的和邀请状态）。
- `PUT /system/companies/:companyId`：可改全部资料，带 `expectedUpdatedAt`，冲突 `COMPANY_VERSION_CONFLICT`；用条件 `updateMany` 断言改了一行；写 `COMPANY_UPDATED`，metadata 记改了哪些字段（不记旧值以外的个人信息）。
- `GET /system/companies/:companyId/admin-candidates?search=`：已绑定、ACTIVE 的**管理人员账号**（有 `managerProfile`，Q1），按手机号或姓名查，最多 20 条。
- `POST /system/companies/:companyId/admins`：`{ managerProfileId }` 或 `{ name, phone }`。前者在事务里建成员记录并立即写 `UserRole`；后者建 `ManagerProfile` 和成员记录，并生成一张管理人员邀请码（复用 `bindings.service.ts` 的生成逻辑；`BindingInvitation` 本身没有 projectId 列，`schema.prisma:262-283`，只需要把“必须是项目成员”的检查放宽为“项目成员或公司管理员成员”）。返回 `{ member, invitationCode? }`。手机号与已有管理档案重复时返回 `MANAGER_PHONE_EXISTS` 和已有 `profileId`，让前端改为选中他。写 `COMPANY_ADMIN_APPOINTED`。
- `POST /system/companies/:companyId/admins/:memberId/revoke`：成员记录改 REVOKED，删除对应 `UserRole`；撤掉最后一位时照样允许，但响应里带 `remainingAdmins: 0`，前端提示（Q2）。写 `COMPANY_ADMIN_REVOKED`。
- 绑定：`auth.service.ts` 的 `grantManagerMembershipRoles`（`:565-568`）同时按 `CompanyManagerMember` 生成 COMPANY 范围的 `UserRole`。
- 新常量写进小程序 `services/error-messages.ts` 的 `API_ERROR_MESSAGES`。

**domain**：`packages/domain/src/audit-log.ts` 增加 `COMPANY_CREATED`、`COMPANY_UPDATED`、`COMPANY_ADMIN_APPOINTED`、`COMPANY_ADMIN_REVOKED` 的句子，放进“公司”类型。

**小程序**
- `services/workflows.ts`：`Company` 类型改为真实响应；`fetchCompanies` 改为分页；新增 `fetchCompany`、`updateCompany`、`fetchCompanyAdminCandidates`、`appointCompanyAdmin`、`revokeCompanyAdmin`。去掉文件里“Frontend-first contracts……demo adapter”那句注释（`:169`）。
- `system-management/index.tsx`：不再一进来读四个接口，也不再逐个公司读项目、班组（`:77-91`）；每个标签自己读，一个标签读不到只影响这个标签。
- `views/companies.tsx`：列表分页；`NewCompanyView` 增加资料字段；`CompanyView` 改成三块：资料（可改）、管理员（任命、撤销、显示邀请码和“复制”）、“进入公司”。“进入公司”复用 `FEATURES.companyAdmin`，每个链接带 `companyId`（`home/home-model.ts:342` 已有同样的拼法）。
- 演示：`services/demo/client.ts` 的 `/system/companies` 分支按新形状改，增加详情、管理员三个分支；演示数据造一家没有管理员的公司。

**测试**：`apps/api/test/system.e2e.test.ts`（新）覆盖公司管理员、项目管理员调用 `/system/*` 一律 403，信用代码格式和重复，`expectedUpdatedAt` 冲突；DB 套件验证：任命已绑定账号后立刻能调 `GET /management/companies/:companyId/overview`、撤销后 403；录入新人 → 用邀请码绑定 → 得到 COMPANY 范围的 `UserRole`；迁移回填后种子里的 `dev-company` 仍是公司管理员。小程序 `test/company-platform-views.test.ts` 补公司行文字、“进入公司”链接。

**风险**：撤销公司管理员时，他可能同时是某些项目的项目管理员（成员记录），这些身份不动，只收公司级的那一条；页面上要写清楚。

### 第二期：超级管理员开通与账号（G3、G4）

**用户得到什么**：部署的人可以在服务器上用一条命令把某个已绑定的管理账号设为超级管理员（Q3）。平台管理的“账号”标签可以按手机号或姓名找人，看到他在哪家公司、哪个项目、什么身份、最后登录时间；可以停用（立刻下线）和恢复（Q4）。项目、班组身份只显示，点一下跳到那个项目的人员资料去改（Q6）；公司管理员身份跳到公司详情去改。

**脚本**：`apps/api/scripts/system-admin.ts`，`package.json` 加 `"system-admin": "tsx --env-file=.env scripts/system-admin.ts"`。用法 `corepack pnpm --filter @construction/api system-admin grant --phone 138…` / `revoke --phone …` / `list`。只接受已绑定、ACTIVE、有 `managerProfile` 的账号；手机号对应多个用户时列出来并退出（`User.phone` 不唯一，`schema.prisma:103`）；`revoke` 拒绝撤掉最后一个。每次写 AuditLog（`actorUserId` 为空，metadata 记 `source: "cli"`）。测试服务器的 `deploy/test` 说明里加一句用法。

**API**
- `GET /system/accounts?search=&status=&role=&cursor=`：`{ items: [{ userId, displayName, phone, status, profileType, highestRoleCode, roleCount, lastLoginAt }], nextCursor }`。姓名搜索：管理档案的姓名是明文，工人姓名加密，复用 `participant-page` 的 `nameSearchHashes`（推断：需确认能用于跨公司）。不列出从未绑定的账号（它们什么也做不了，`access-token.guard.ts:158-160`）。
- `GET /system/accounts/:userId`：`roles: [{ roleCode, scopeType, scopeId, scopeName, source: "PLATFORM"|"COMPANY_APPOINTMENT"|"PROJECT_MEMBERSHIP" }]`（`scopeName` 的算法照搬 `management.service.ts:223-240` 的 `listMyRoleScopes`），以及有效会话数、最后登录时间。
- `POST /system/accounts/:userId/disable`、`/enable`：条件 `updateMany`（`status` 从 ACTIVE 到 DISABLED，断言一行），同一事务里 `sessionVersion + 1`、把未撤销的 `UserSession` 写上 `revokedAt`；不动任职、考勤、补卡。拒绝：对自己 `CANNOT_DISABLE_SELF`，对超级管理员 `SYSTEM_ADMIN_MANAGED_BY_SCRIPT`。写 `ACCOUNT_DISABLED`／`ACCOUNT_ENABLED`。
- 被停用的人已经从项目管理员候选里排除（`management.service.ts:62`），不用另改。他待审的补卡会落到上级（推断：收件箱按授权算，停用不影响别人的授权）。

**domain**：`audit-log.ts` 增加账号和超级管理员的几种句子，新增“平台”类型（给第四期用）。

**小程序**
- `views/accounts.tsx`：列表改分页、服务端搜索；`AccountView` 去掉等级和范围选择器，改成“身份”列表（每条一行，可点跳转）和“停用／恢复”危险按钮（二次确认，写明“会立刻退出登录”），失败用 `Notice tone="error"` 放在按钮旁。
- `system-view.ts`：删掉 `ROLE_OPTIONS`、`scopeOptions`（演示的单一等级模型）。
- 演示：账号数据改成多身份形状，`demo/client.ts` 增加详情、停用、恢复分支。

**测试**：DB 套件验证停用后旧的 access token 立即 401 `USER_DISABLED`（或 `ACCESS_TOKEN_SESSION_MISMATCH`）、refresh 也失败、恢复后能重新登录；不能停用自己和超级管理员；脚本用 `execa` 跑一次 grant、一次 revoke 最后一人被拒（推断：也可以把脚本的核心函数导出来直接测）。

### 第三期：公司暂停生效（G5）

**用户得到什么**：暂停一家公司后，这家公司的人还能登录、查看、导出历史，但不能打卡、补卡、新建或修改任何东西；超级管理员不受限，可以继续查看和恢复（Q5）。首页和工作台显示“公司已暂停，请联系平台”和平台联系电话（第五期之后才有电话）。

**API**
- `POST /system/companies/:companyId/status`：`{ status: "ACTIVE"|"SUSPENDED", expectedUpdatedAt }`，写 `COMPANY_SUSPENDED`／`COMPANY_RESUMED`。
- `PermissionsGuard`（`authorization/permissions.guard.ts:41`）：解析出的目标带 `companyId`、请求方法不是 GET、公司是 SUSPENDED、且操作人没有 GLOBAL 的 SYSTEM_ADMIN 时，抛 403 `COMPANY_SUSPENDED`。这只覆盖带 `@RequirePermission` 的接口。
- 只用 `AccessTokenGuard`、在服务里自己查权限的写接口要逐个补：打卡和人脸（`attendance.controller.ts:85-240` 一组，都是 `projects/:projectId/...`）、补卡申请和审批（`makeup.controller.ts:61-110`）、班组工作（已有，`team-work.service.ts:47-53`）、绑定邀请码（推断：`auth.service.ts:286` 的 `bindByInvitation`）。建议在 `attendance.service.ts` 等处把“项目是 ACTIVE”的判断（如 `:984`、`:1188`）改成“项目和公司都是 ACTIVE”，用一个共享的 `assertCompanyActive(projectId)`。完整清单要先列出来再动手（推断）。

**小程序**：`error-messages.ts` 加 `COMPANY_SUSPENDED`；`use-session-guard` 不动；首页在 `me` 里看到所属公司全部暂停时显示一条 `Notice`（需要 `/auth/me` 带上公司状态，推断）。

**测试**：e2e 覆盖暂停后公司管理员 PUT 403、GET 200、超级管理员 PUT 200；DB 套件覆盖工人打卡被拒、补卡被拒、恢复后正常。

**风险**：漏掉某个写接口，暂停就“半生效”。所以先在计划里列全清单、在测试里逐个断言。

### 第四期：平台操作日志（G6）

**用户得到什么**：平台管理的“日志”标签换成真实记录：全平台所有操作，新的在前，可按公司、类型（含新的“平台”类型：公司、任免公司管理员、停用账号、信用规则、平台设置）、操作人筛选（Q9）；句子和公司、项目操作记录一样。

**API**
- `GET /system/audit-logs?companyId=&type=&actorUserId=&cursor=`（`Cache-Control: no-store`），复用 `audit/audit-log.service.ts` 的 `page()`（`:80` 起），scope 为空或 `{ companyId }`。“平台”类型 = `companyId` 和 `projectId` 都为空的行加上公司级的平台动作。
- 补写审计：信用规则发布写 `SAFETY_POLICY_PUBLISHED`（`safety-credit.service.ts:621-660` 的事务里）；第一、二、三期新动作已经在写。
- 查看用工资料（`WORKER_REGISTRATION_VIEWED`）在平台日志里可按操作人筛出来，回答“平台的人看过谁的资料”（Q8）。

**小程序**：日志标签直接复用 `pages/audit-log` 的列表组件，增加 `kind: "platform"`；删除 `system-view.ts:69-131` 的正则翻译（只为演示格式服务）和 `views/audit.tsx` 的“演示数据”说明。演示：`demo/audit-log.ts` 增加平台动作。

**测试**：e2e 覆盖公司管理员调 `/system/audit-logs` 403；DB 套件验证平台日志能看到 A、B 两家公司的记录，`companyId` 筛选只出一家；domain 测新句子。

### 第五期：平台首页、补卡口径、公告（G7、G8、G9）

**用户得到什么**：首页标牌写“3 家公司，7 个进行中项目／412 个账号在用”；“等你处理”列出没有管理员的公司、发出去还没被接受的公司管理员邀请、只有你能批的补卡（Q10）。补卡页默认“需要你批”（Q11）。平台设置可以改首页公告和联系电话，所有人的首页都看得到公告。

**Prisma**：新表 `PlatformSetting`（单行，`id = "GLOBAL"`）：`announcement String @default("")`、`supportPhone String @default("")`、`updatedAt`、`updatedByUserId?`。迁移里插入空行。

**API**
- `GET /system/overview`：`{ companies: { active, suspended }, projects: { active }, accounts: { active, disabled }, todos: { companiesWithoutAdmin, pendingAdminInvitations, makeupOnlyYou } }`，全部用 `count`/`groupBy`。
- 补卡“只有你能批”：`makeup.service.ts:1033-1041` 的判断里，当操作人对这条申请的覆盖职级来自 GLOBAL 时，把这家公司的 COMPANY 级授权也算进“别人能批”；`makeupOnlyYou` 与 `GET /makeups/pending?onlyMine=true` 用同一个函数（四级第一期的做法）。
- `GET /app/settings`（只要登录，`AccessTokenGuard`）返回公告和联系电话；`GET/PUT /system/settings`，PUT 带 `expectedUpdatedAt`，公告最多 160 字，写 `PLATFORM_SETTINGS_UPDATED`。

**小程序**
- `home/views/system-admin.tsx`：读 overview，标牌和“等你处理”（新增 `systemAdminTodos`，放在 `home-model.ts`，与 `companyAdminTodos` 同样的写法）。
- `pages/team-makeups/index.tsx:141-149`：`companyLevel` 同时认 SYSTEM_ADMIN。
- `home/views/parts.tsx:52-62`：去掉只在演示读的限制；`USER_DISABLED`、`COMPANY_SUSPENDED` 的提示里带上平台联系电话（Q12）。
- 演示：overview、settings 分支按新形状。

**测试**：DB 套件验证“首页数字等于点进去的条数”（没有管理员的公司数 = 公司列表筛出的数；补卡数 = 收件箱 `onlyMine` 条数）；e2e 覆盖 `/app/settings` 工人可读、`/system/settings` 公司管理员 403。

### 以后（规则定了再排）

- G10 打卡安排的范围：`GET /attendance/planning/scopes` 加 `companyId`、`projectId`，GLOBAL 时必须带（四级 G13 一起做）。在这之前，按 Q11 先把“打卡安排”从超级管理员的首页和工作台拿掉（`features.ts:173-183`，`system-admin.tsx:8-12`），从“进入公司 → 进入项目”去设。
- G11 订阅通知（四级 G14，F31）：等正式 AppID 和模板；本级只有“公司管理员邀请被接受”值得通知，可以不做。
- 把 CLAUDE.md 里“五个测试账号”改成六个（四级实施记录留下的）。

## 4. 建议先做的三件事

1. **第一期：公司和公司管理员。** 这是平台能不能开通真实公司的前提：现在正式环境里超级管理员连公司列表都看不到，公司管理员只能用种子脚本造，新公司的第一个人也绑不上。四级已经把公司管理员要用的页面做完了，缺的只是“谁是这家公司的管理员”这一步和一个入口。新表 `CompanyManagerMember` 让任命、绑定、撤销都和项目成员走同一套思路，绑定流程只需多同步一类记录。
2. **第二期里的“超级管理员开通脚本”和“账号停用”。** 脚本几十行，但没有它，上线第一天就得手写 SQL；停用的后端检查早就有了（登录、续期、每次请求、会话版本），只差一个写 `DISABLED` 并让会话失效的接口——这是员工离职、手机丢失时唯一的止损手段。账号详情可以先只做“查人、看身份、停用”，身份跳转晚一点再加。
3. **第四期中的“平台级动作留痕”。** 只是在建公司、改公司、任免、停用、发布信用规则时各写一行 AuditLog（第一、二期本来就要写），再加一个跨公司的查询接口，复用现成的审计页面和句子。平台的操作次数少、影响大，出了问题必须能查。

第三期（公司暂停生效）要先定 Q5 的规则、并列全写接口清单，排在三件事之后；第五期（首页、公告）价值不高但改动独立，可以穿插着做。

## 5. 需要用户决定的问题

- **Q1** 公司管理员怎么开通？建议：两种都给。一是从已有的管理人员账号里选（按手机号或姓名搜）；二是录入新人的姓名和手机号，系统生成一个邀请码，他用邀请码绑定后就是这家公司的管理员。只有管理人员账号能当公司管理员，工人账号不行。
- **Q2** 一家公司可以有几个公司管理员？撤掉最后一个时怎么办？建议：可以有多个；撤掉最后一个照样允许（离职必须能撤），但要二次确认，这家公司在平台首页标红“没有管理员”。
- **Q3** 超级管理员怎么任免？建议：只能由部署的人在服务器上用命令开通或撤销，小程序里不能任命、撤销或停用超级管理员；命令拒绝撤掉最后一个。
- **Q4** 账号停用谁能做、停用后怎样？建议：只有超级管理员能停用和恢复；停用后立刻下线、不能再登录，任职、考勤、补卡记录都不动；不能停用自己和其他超级管理员。公司管理员要让人离开，用四级已有的“离岗”。
- **Q5** “暂停公司”是什么意思？建议：只读。这家公司的人还能登录、查看、导出历史，但不能打卡、补卡、新建或修改；超级管理员不受影响。不提供删除公司。
- **Q6** 平台“账号”页能直接改哪些身份？建议：只直接管平台级和公司级（超级管理员走命令，公司管理员在公司详情里任免）；项目、班组的身份只显示，点进去到那个项目的人员资料里改，免得和项目成员记录对不上。
- **Q7** 新建公司要填什么？建议：名称必填且不能重名；简称、统一社会信用代码（18 位，填了就不能重复）、联系人、电话、地址选填，以后可补。名称和信用代码只有超级管理员能改（沿用四级 Q12）。
- **Q8** 超级管理员能不能看工人的用工资料原文？建议：能，和管理员一样不写理由，但每次查看都记录（四级已有），并且在平台日志里可以按“谁看的”筛出来。
- **Q9** 平台日志看什么范围？建议：全平台所有操作记录，可按公司、类型、操作人筛；平台自己的动作（公司、任免公司管理员、停用账号、信用规则、平台设置）单独归为“平台”一类。
- **Q10** 平台首页放什么？建议：只放规模数字（公司、进行中项目、在用账号）和“等你处理”（没有管理员的公司、没接受的公司管理员邀请、只有你能批的补卡）；不放全平台出勤，也不做全平台报表和导出，要看就“进入公司”。
- **Q11** 超级管理员工作台里的“补卡审批”和“打卡安排”怎么处理？建议：补卡审批保留，默认只显示“需要你批”（申请人是公司管理员，或这家公司没有别人能批）；“打卡安排”先从超级管理员的首页和工作台拿掉，要设就进入公司 → 进入项目再设。
- **Q12** 平台设置管哪些？建议：只有两项：全平台一条首页公告（最多 160 字），和一个平台联系电话（显示在“账号已停用”“公司已暂停”的提示里）。公司不另设公告。

## 用户的决定（2026-11-22）

用户回复“做吧”：Q1–Q12 全部按第 5 节的建议执行，五期都做，按第一期到第五期的顺序。“以后”里的 G10 先按 Q11 把“打卡安排”从超级管理员首页和工作台拿掉；CLAUDE.md 的测试账号数随本轮改成六个。

## 实施记录（2026-11-22）

分支 `project-admin`，从 `63da618` 起。每期都跑 `corepack pnpm test`、`typecheck`、小程序 `tsc --noEmit`、`test:database`（含迁移重放和 drift 检查），以及 `build:weapp`、`build:h5:demo`。新的数据库集成测试 `apps/api/test/system-admin.integration.test.ts` 已加进 `scripts/test-database.ts`。

### 第一期（G1、G2；Q1、Q2、Q7）

提交：`b4305e7`（domain 句子）、`6a4e00f`（任命表和绑定）、`48b0289`（`/system/companies` 接口）、`eeda428`（小程序）。迁移 `20261122090000_company_manager_members`。

做了什么：
- 新表 `CompanyManagerMember`（`company_manager_members`）：状态只能是 ACTIVE、REVOKED，部分唯一索引保证同一公司同一人只有一条 ACTIVE。迁移把已有的 COMPANY_ADMIN 角色回填成任命，只回填有管理档案的用户；开发种子也会写任命。
- 绑定时，`grantManagerMembershipRoles` 按任命补上 COMPANY 范围的 COMPANY_ADMIN。撤销会删掉这一条 `UserRole`，项目和班组身份不动。
- 新模块 `apps/api/src/system/`，接口都要 `system.manage`（static GLOBAL）：
  - `GET /system/companies`：可带 search、status、cursor，每页 30 条，项目数用 `groupBy`。
  - `POST /system/companies`：名称去空格后不能和已有公司重名，大小写不同也算重名；信用代码 18 位、转成大写、不能重复。
  - `GET`、`PUT /system/companies/:companyId`：PUT 要带全部字段和 `expectedUpdatedAt`。
  - `GET .../admin-candidates`、`POST .../admins`、`POST .../admins/:memberId/invitation`、`POST .../admins/:memberId/revoke`。
  - 新建公司、修改公司、任命、撤销、重新生成邀请码，都写 AuditLog，`companyId` 直接写上。所以公司自己的操作记录里，“公司”类型也能看到这些。
- domain `audit-log.ts`：增加 `COMPANY_CREATED`、`COMPANY_UPDATED`（写明改了哪几项）、`COMPANY_ADMIN_APPOINTED`、`COMPANY_ADMIN_REVOKED`、`COMPANY_ADMIN_INVITATION_ISSUED`，都归“公司”类型。任免类记录指向被任免人的管理档案。
- 小程序“平台管理”：
  - 四个标签各读各的接口，一个标签读不到只影响它自己。
  - 公司列表分页，在服务端搜索。没有管理员的公司有警戒条和红点；状态正常的公司右边不写状态，副行才放得下管理员姓名。
  - 新增公司可以填六项，建好后直接打开这家公司。
  - 公司详情分三块：
    - 公司管理员：一人一张卡，卡上有绑定情况、邀请码有效期、“重新生成邀请码”和“撤销”。新邀请码显示在卡片里，可以复制。
    - 进入公司：和公司管理员一样的九个入口，每个链接都带 `companyId`。
    - 公司资料：可以修改，名称和信用代码也能改。
  - 任命页有两种方式：“选已有账号”和“录入新人”。录入新人时，如果服务器返回 `MANAGER_PHONE_EXISTS`，页面给出“改为任命已有的某某”。
- 演示：
  - 新增 `services/demo/system-companies.ts`，和真实接口同口径。
  - 演示数据多了一家没有管理员的公司。
  - 演示里有了任命记录后，`demoMe` 按任命记录给公司级身份。

与计划不同：
- 服务写在 `system-companies.service.ts`，没有用 `system.service.ts`。以后各期在同一个模块里各加自己的服务。
- 版本冲突沿用四级已有的 `COMPANY_CHANGED_RELOAD_BEFORE_SAVING`，没有新加 `COMPANY_VERSION_CONFLICT`。小程序里已经有这条的文案。
- 多了 `POST .../admins/:memberId/invitation`，用来重新生成邀请码，旧码作废。任命表上多了 `invitationId`，记最近一张邀请码，详情页靠它显示“等他绑定，几号前有效”或“已过期”。撤销未绑定的人时，他那张码也一起作废。
- 没有放宽项目邀请码“必须是项目成员”的检查。公司管理员的邀请码由 system 模块直接发，生成逻辑抽成了 `bindings/invitation-code.ts`，和项目邀请共用。绑定流程只改了授予角色这一处。
- 旧的 `POST /management/companies` 和 `management.e2e` 里那条用例已经删掉，因为前端在这一期就换到了新接口。
- 管理档案不分公司，所以 `MANAGER_PHONE_EXISTS` 按全平台查，并带回已有档案的 `profileId` 和姓名。
- 新增了这几种错误：
  - `COMPANY_ADMIN_PHONE_IS_WORKER`：手机号属于已绑定的工人。Q1 规定只能任命管理人员。
  - `COMPANY_ADMIN_ALREADY_APPOINTED`、`COMPANY_ADMIN_NOT_FOUND`。
  - `COMPANY_ADMIN_CANDIDATE_NOT_FOUND`、`COMPANY_ADMIN_CANDIDATE_NOT_ACTIVE`。
  - `COMPANY_ADMIN_CHANGED_RELOAD`。
- `{ managerProfileId }` 也接受还没绑定的档案，也就是 `MANAGER_PHONE_EXISTS` 带回来的那种。这时会顺带生成邀请码。
- 候选人不含已经是本公司管理员的人；搜索词为空时列出前 20 个。
- 数据库只对信用代码加了唯一约束；公司重名靠接口检查，两人同时提交仍可能重名。
- “暂停公司”按钮先从公司详情拿掉了，第三期再按 Q5 接上。公司状态仍是字符串，列表的 status 筛选只认 ACTIVE、SUSPENDED。
- 账号、设置、日志三个标签仍然只有演示版，正式环境里这三个标签会显示读取失败，公司标签不受影响。账号标签改为点开某个账号时才读管理范围要用的公司、项目和班组，仍是逐个读取，第二期会整页重写。
- 演示里生成的公司管理员邀请码不能拿去绑定，演示的绑定只认项目邀请码。
- 迁移回填的测试：`test:database` 重放旧迁移时，roles 表还是空的，造不出旧的 COMPANY_ADMIN 角色。所以集成测试先手工建一条旧式角色，再执行迁移文件里的那段 INSERT，然后检查这个人出现在公司管理员里、能用公司接口、能被撤销。测试登录的配置脚本（`provision-test-accounts`）没改，测试服务器上的 `dev-company` 靠迁移回填。

测试结果：
- domain：53 条。
- 小程序：532 条（62 个文件）。
- API：单元和 e2e 共 114 条通过，另有 123 条数据库套件在这一步按设计跳过。新增的 `system.e2e` 有 4 条。
- `test:database`：12 个文件、107 条，全部通过，其中 `system-admin.integration` 有 5 条。迁移 drift 检查通过。
- 两种构建都通过；`dist-weapp` 1.69 MB。
- 演示版截图在 `output/system-admin/`（不入库）。

留到以后：
- 第二到第五期。
- `deploy:test` 和用 `dev-system`、`dev-company` 在测试服务器上回归（这一期没有部署）。
- 按 Q11 把“打卡安排”从超级管理员首页和工作台拿掉。
- CLAUDE.md 里测试账号数改成六个。
