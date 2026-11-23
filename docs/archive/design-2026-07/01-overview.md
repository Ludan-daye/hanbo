# 01 总体架构

> 面向新加入工程师的系统总览。所有内容以当前代码为准（文中给出具体文件路径）；标注「规划中」/「进行中」的部分在代码里尚不存在或未完成。

## 1. 系统定位与角色体系

本系统是**建筑工地人员管理系统**（repo 名 `construction-site-personnel-management-system`，见根 `package.json`），核心业务是工地考勤：项目/班组/人员管理、四点打卡（上午上下班 + 下午上下班）、补卡审批、日/周/月考勤报表。前端形态是微信小程序（Taro，可同时构建 H5），后端是 NestJS API + PostgreSQL。

### 1.1 五级角色

角色等级定义在 `packages/domain/src/roles.ts` 的 `ROLE_LEVEL`：

| RoleCode | level | 说明 |
|---|---|---|
| `SYSTEM_ADMIN` | 1 | 系统管理员 |
| `COMPANY_ADMIN` | 2 | 公司管理员 |
| `PROJECT_ADMIN` | 3 | 项目管理员 |
| `TEAM_LEADER` | 4 | 班组长 |
| `WORKER` | 5 | 工人 |

**数字越小权限越高，且高角色继承低角色的全部权限**：`roleIncludes(ownerRole, requiredRole)` 用 `ROLE_LEVEL[ownerRole] <= ROLE_LEVEL[requiredRole]` 判断，`getEffectivePermissionCodes` 把继承链上所有角色的权限码合并（`SYSTEM_ADMIN` 因此拥有一切权限）。

角色总是**挂在作用域（scope）上**授予：`ScopeType = "GLOBAL" | "COMPANY" | "PROJECT" | "TEAM"`。授权判定 `authorizePermission`（同文件）先查权限码、再用 `scopeIncludesTarget` 做作用域包含判断（COMPANY 作用域覆盖其下 PROJECT/TEAM 目标，以此类推）。补卡审批有专门的 `canApproveScopedMakeupRequest`，额外阻止自审（`SELF_APPROVAL_BLOCKED`）。

权限码与角色-权限矩阵由种子数据写入数据库（`apps/api/prisma/seed.ts`），当前共 11 个权限码，直连关系为：

- `SYSTEM_ADMIN` → `system.manage`
- `COMPANY_ADMIN` → `company.manage`、`project.create`
- `PROJECT_ADMIN` → `project.manage`、`team.manage`、`worker.manage`、`attendance.view`、`binding.invitation.create`
- `TEAM_LEADER` → `makeup.approve`、`attendance.view`
- `WORKER` → `attendance.submit`、`makeup.request`

（运行时再叠加上文的继承规则。）

### 1.2 小程序按角色分面板

小程序首页按 `GET /auth/me` 返回的 `highestRoleCode`（由 `getHighestRoleCode` 计算）路由到对应面板：映射在 `apps/miniprogram/src/routing/roleHome.ts`（`roleHomePanel`），各面板的磁贴（tile）配置在 `apps/miniprogram/src/components/role-panels/index.tsx`：

| 角色 | PanelKey | 面板职能（磁贴 → 页面） |
|---|---|---|
| `COMPANY_ADMIN` | `companyAdmin` | 公司与项目（`pages/company-projects`）、人员总览（`pages/company-people`）、新建项目（`pages/create-project`）、公司报表（`pages/company-reports`） |
| `PROJECT_ADMIN` | `projectAdmin` | 项目参与者（`pages/participants`）、考勤报表（`pages/reports`）、邀请码（`pages/invitation`）、项目管理（`pages/project-management`）、排班（`pages/schedules`） |
| `TEAM_LEADER` | `teamLeader` | 补卡审批（`pages/team-makeups`）、团队考勤（`pages/team-attendance`） |
| `WORKER` | `worker` | 打卡（**磁贴为占位，无跳转，「进行中」**，见 §8.3）、我的记录（`pages/my-records`）、补卡（`pages/my-makeups`，提交入口 `pages/submit-makeup`） |
| `SYSTEM_ADMIN` | `systemAdmin` | 仅「系统配置」占位磁贴，**无任何页面，「规划中」** |
| （已绑定但无角色） | `none` | 提示联系管理员分配角色 |

面板解析各自作用域 id 的辅助函数在 `apps/miniprogram/src/routing/companyAdmin.ts`、`projectAdmin.ts`、`teamLeader.ts`（从 `me.roles.assignments` 里找对应 `scopeType` 的 `scopeId`）。

## 2. Monorepo 结构

pnpm workspace（`pnpm-workspace.yaml`：`apps/*` + `packages/*`），包管理器锁定 `pnpm@9.15.4`（根 `package.json` 的 `packageManager`），根脚本统一用 `corepack pnpm -r <script>` 扇出。

```
hanbo/
├── apps/
│   ├── api/            # @construction/api — NestJS 10 + Prisma 6 + PostgreSQL 后端
│   └── miniprogram/    # @construction/miniprogram — Taro 4.2 + React 18 小程序/H5
├── packages/
│   └── domain/         # @construction/domain — 纯领域逻辑（零框架依赖）
├── docker-compose.yml  # 本地 PostgreSQL 16
└── docs/
```

### 2.1 packages/domain（`@construction/domain`）

纯 TypeScript 领域逻辑，无任何 NestJS/Prisma/Taro 依赖，只有两个模块：

- `src/roles.ts` — 角色等级、作用域模型、`authorizePermission` 等授权纯函数（见 §1.1）。
- `src/attendance.ts` — `summarizeDailyAttendance(shiftRule, records)`：从一天的打卡记录中按点位选取有效记录（起点取最早、终点取最晚），计算 `workedMinutes / isLate / isEarlyLeave / isMissingPunch / isAbsent`。

`package.json` 的 `exports` 映射把 `types` 指向 `./src/*.ts`、`default`（运行时）指向 `./dist/*.js`，子路径为 `"."`、`"./attendance.js"`、`"./roles.js"`——这就是为什么 API 里写 `import { ... } from "@construction/domain/roles.js"`。**生产运行依赖构建产物 dist**（`corepack pnpm build`），而测试通过 vitest alias 直连 src（见 §7）。

### 2.2 apps/api（`@construction/api`）

NestJS 10（Express adapter）+ Prisma 6 + Zod。通过 `"@construction/domain": "workspace:*"` 依赖领域包；授权判定、考勤汇总全部下沉到 domain，API 层只做取数、编排与持久化。Prisma schema 在 `apps/api/prisma/schema.prisma`（User / WorkerProfile / ManagerProfile / Role / Permission / UserRole / UserSession / BindingInvitation / Company / Project / Team / ProjectWorkerMember / ProjectManagerMember / Shift / ShiftSegment / Schedule / FaceProfile / AttendanceRecord / AttendanceResult / MakeupRequest / AuditLog 共 21 个 model）。

### 2.3 apps/miniprogram（`@construction/miniprogram`）

Taro 4.2 + React 18 + Sass。**不依赖 `@construction/domain`**——`RoleCode` 等类型在 `src/services/auth.types.ts` 中重复声明，与后端响应结构对齐。分层：`pages/`（17 个页面，注册于 `src/app.config.ts`）、`components/`（`role-panels` + `ui` 基础组件）、`services/`（每个后端模块一个薄封装 + `apiClient`）、`store/`（`SessionProvider`）、`routing/`（角色→面板/作用域解析纯函数）。

## 3. 运行时拓扑

```
┌──────────────────────────────────────────────┐
│ 微信小程序 (weapp) / H5                        │
│ apps/miniprogram (Taro 4.2 + React 18)        │
│  · Taro.request，token 存 Taro storage        │
│  · 401 时自动 POST /auth/refresh 重试一次      │
└───────────────────┬──────────────────────────┘
                    │ HTTP JSON + Bearer accessToken
                    ▼
┌──────────────────────────────────────────────┐
│ NestJS 10 API  apps/api (端口 API_PORT)       │
│  AccessTokenGuard → PermissionsGuard          │
│    → Controller(Zod 手写解析) → Service       │
└─────────┬──────────────────────┬─────────────┘
          │ Prisma 6             │ 外部依赖（均有接口/桩）
          ▼                      ▼
┌──────────────────┐   ┌────────────────────────────────┐
│ PostgreSQL 16     │   │ WeChat jscode2session（dev 桩）  │
│ (docker-compose)  │   │ FaceVerificationConnector（桩）  │
└──────────────────┘   │ 对象存储 StoragePort（进行中）    │
                       └────────────────────────────────┘
```

- 启动入口 `apps/api/src/main.ts`：`loadEnv(process.env)` 校验环境 → `NestFactory.create(AppModule)` → 当 `CORS_ALLOWED_ORIGINS` 非空时启用 CORS（解析函数在 `src/main.cors.ts`，逗号分隔、trim、过滤空串；H5 本地预览需要）→ `enableShutdownHooks()` → `listen(API_PORT)`。
- 认证链路：`POST /auth/wechat/login` 用 code 换 openid（生产走微信 `jscode2session`，开发走 dev 桩，见 §8.2），签发 15 分钟 JWT access token（payload `{ sid, sub, sv }` = sessionId / userId / sessionVersion）+ 30 天不透明 refresh token（sha256 哈希后存 `UserSession`）。`AccessTokenGuard`（`src/auth/access-token.guard.ts`）每次请求都回查 `UserSession`，校验 userId、`sessionVersion`、revoked/过期、用户 `ACTIVE`，支持即时踢下线。
- 本地数据库：根目录 `docker-compose.yml` 起 `postgres:16-alpine`（库 `construction_personnel`，用户/密码 `construction`）。
- 小程序 HTTP 客户端 `apps/miniprogram/src/services/apiClient.ts`：单例在 `services/client.ts` 用构建期注入的 `API_BASE_URL` 创建；401 时用 refreshToken 换新 accessToken 重发一次，失败则清 token 抛 `ApiError(401, "SESSION_EXPIRED")`。会话状态机 `store/sessionReducer.ts`：`anonymous → loading → unbound / norole / ready`。

## 4. 后端模块地图

`apps/api/src/app.module.ts` 注册的全部模块（顺序同源码）：

| 模块 | 职责 | 关键文件（`apps/api/src/` 下） |
|---|---|---|
| `EnvModule` | `@Global()` 模块，以 Symbol token `API_ENV` + `useFactory` 提供经 Zod 校验的 `ApiEnv` | `config/env.module.ts`、`config/env.ts` |
| `PrismaModule` | 提供 `PrismaService`（继承 `PrismaClient`，`onModuleInit/Destroy` 连接管理） | `infrastructure/database/prisma.module.ts`、`prisma.service.ts` |
| `AuthModule` | 微信登录换 token、refresh/logout、邀请码绑定（事务 + 守卫式 `updateMany` 防并发）、`GET /auth/me`；导出 `AccessTokenGuard` + `EnvModule` + `JwtModule` + `PrismaModule`，功能模块只需 import `AuthModule` | `auth/auth.module.ts`、`auth.service.ts`、`auth.controller.ts`、`access-token.guard.ts`、`current-user.decorator.ts` |
| `AuthorizationModule` | `PermissionsGuard` + `@RequirePermission` 装饰器；`AuthorizationContextService` 从 DB 装载用户 role assignments 与全量角色-权限矩阵，并把路由参数（companyId/projectId/teamId）解析成 `AuthorizationTargetScope`，最终调用 domain 的 `authorizePermission` | `authorization/permissions.guard.ts`、`require-permission.decorator.ts`、`authorization-context.service.ts` |
| `BindingsModule` | `POST /bindings/projects/:projectId/invitations` 生成绑定邀请码（明文只返回一次，DB 存哈希） | `bindings/bindings.controller.ts`、`bindings.service.ts` |
| `ManagementModule` | 组织实体创建（公司/项目/班组/工人/管理员成员）+ 读视图（公司项目列表、公司/项目/班组参与者、项目班组、邀请列表与撤销） | `management/management.controller.ts`、`management.service.ts` |
| `AttendanceModule` | 项目默认班次/默认排班配置（`PUT .../default-shift`、`default-schedule`），`POST /attendance/projects/:projectId/records` 服务端权威打卡：地理围栏（Haversine）+ 人脸校验（经 `FACE_VERIFICATION_CONNECTOR`）+ 调 domain 重算当日 `AttendanceResult`；模块内用 `useFactory` 按 `FACE_DEV_STUB` 选择人脸连接器 | `attendance/attendance.module.ts`、`attendance.service.ts`、`attendance.controller.ts` |
| `MakeupModule` | 补卡：工人提交申请、班组长审批/驳回（自审被 domain 阻止）、班组待审列表；审批通过后触发考勤结果重算 | `makeup/makeup.controller.ts`、`makeup.service.ts` |
| `MeModule` | 当前用户个人视图：`GET /me/attendance-records`（时间段）、`GET /me/makeups`、`GET /me/projects`（只走 `AccessTokenGuard`，无 `@RequirePermission`） | `me/me.controller.ts`、`me.service.ts` |
| `ReportsModule` | 项目/班组/公司三种范围 × 日/周/月聚合考勤报表（9 个 `GET /reports/...` 端点） | `reports/reports.controller.ts`、`reports.service.ts` |
| `HealthController` | `GET /health` → `{ status: "ok" }`（直接挂在 AppModule 的 controllers，无独立模块） | `health/health.controller.ts` |

此外 `infrastructure/` 下还有不注册为 Nest 模块的连接器实现：`wechat/wechat-code-session.connector.ts`、`face/{face-verification.types,stub-face-verification.connector,fail-closed-face-verification.connector}.ts`（见 §8）。

## 5. 横切约定

这些约定在所有后端代码中一致执行，改代码前必读：

1. **ESM + `.js` 导入后缀**：全仓 `"type": "module"`，`apps/api/tsconfig.json` 用 `module/moduleResolution: NodeNext`，因此**所有 `apps/api` 内部相对导入必须写 `.js` 后缀**（源文件是 `.ts`），如 `import { AuthModule } from "../auth/auth.module.js"`；跨包导入同理走 exports 子路径（`@construction/domain/roles.js`）。
2. **手写 Zod 解析器，不用 `ValidationPipe`/class-validator**：控制器把 `@Body() body: unknown` 交给各模块的 `*-body.parsers.ts` / `*-query.parsers.ts`（如 `attendance/attendance-body.parsers.ts`、`me/me-query.parsers.ts`），解析失败抛 `BadRequestException({ issues, message })`。
3. **Symbol DI token + `useFactory`**：需要注入配置或可替换实现的依赖，用 `Symbol` token 提供，如 `API_ENV`（`config/env.module.ts`）、`FACE_VERIFICATION_CONNECTOR`（`infrastructure/face/face-verification.types.ts`，在 `attendance.module.ts` 里 `useFactory` + `inject: [API_ENV]` 按环境选实现）；`auth.module.ts` 里 `WechatCodeSessionConnector` 也用 `useFactory` 注入 fetch/sleep/logger，便于测试替换。
4. **结构化 JSON 错误 + SCREAMING_SNAKE message 常量**：所有异常 body 都是结构化对象，`message` 是机器可读常量（如 `PERMISSION_DENIED`、`BINDING_INVITATION_NOT_AVAILABLE`、`ATTENDANCE_OCCURRED_AT_DATE_MISMATCH`），并附上下文字段；非 HTTP 层错误也用 `new Error(JSON.stringify({...}))`（见 `config/env.ts`、domain 的 `createScopeShapeError`）。
5. **对象键字母序**：对象字面量、Zod schema、Prisma 参数的键一律按字母排序（任意打开一个文件即可验证，如 `attendance.service.ts` 的 create data）。
6. **坐标与精度全程字符串**：`latitude`/`longitude`/`faceScore`/`geofenceDistanceM` 等 Decimal 值在请求、DB（Prisma Decimal）、响应中都以 string 传递，不转 number（响应侧显式 `String(...)`，见 `attendance.service.ts` 的 `createAttendanceRecordResponse`）。
7. **考勤日期按 Asia/Shanghai**：`attendance.service.ts` 用 `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" })` 把 `occurredAt` 转成中国时区的 `YYYY-MM-DD` 并强校验与 `attendanceDate` 一致（`ATTENDANCE_OCCURRED_AT_DATE_MISMATCH`）；班次时刻用 `+08:00` 偏移拼 Date（`dateOnlyAndTimeToChinaDate`）。
8. **守卫叠加顺序**：写接口统一 `@UseGuards(AccessTokenGuard, PermissionsGuard)` + `@RequirePermission({ permissionCode, target })`，target 声明作用域来源（`companyParam` / `projectParam` / `teamParam` / `static`）。
9. **并发安全写入**：状态迁移用带条件 `updateMany` + 断言 `count === 1`（`auth.service.ts` 的 `assertSingleGuardedWrite`），关键动作写 `AuditLog`。

## 6. 配置体系

### 6.1 后端环境变量（`apps/api/src/config/env.ts`）

启动时 `loadEnv` 用 Zod 全量校验 `process.env`，失败即拒绝启动。全部变量：

| 变量 | 用途 | 默认值 | 约束 |
|---|---|---|---|
| `NODE_ENV` | 运行环境 | 无（必填） | 枚举 `development/test/production` |
| `API_PORT` | HTTP 监听端口 | 无（必填） | 正整数 |
| `DATABASE_URL` | PostgreSQL 连接串 | 无（必填） | 非空 |
| `CORS_ALLOWED_ORIGINS` | 逗号分隔 CORS 白名单 | `""`（禁用 CORS） | — |
| `JWT_ACCESS_TOKEN_SECRET` | access token 签名密钥 | 无（必填） | ≥ 32 字符 |
| `JWT_ACCESS_TOKEN_TTL_SECONDS` | access token 有效期 | 无（必填） | 正整数（示例 900） |
| `AUTH_REFRESH_TOKEN_TTL_SECONDS` | refresh token 有效期 | 无（必填） | 正整数（示例 2592000） |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 微信小程序凭据 | 无（必填） | 非空 |
| `WECHAT_DEV_LOGIN` | 开发登录桩开关（code 即 openid） | `"false"` | **production 必须为 false**（`superRefine` 拒绝启动） |
| `FACE_DEV_STUB` | 人脸校验开发桩开关 | `"false"` | **production 必须为 false**（同上） |
| `FACE_DEV_STUB_SCORE` | 桩返回的人脸分数 | `95` | 0–100 |
| `FACE_SCORE_THRESHOLD` | 人脸通过阈值 | `80` | 0–100 |
| `FACE_SERVICE_BASE_URL` | 人脸服务地址 | 无（必填） | URL（当前无消费者，为真实接入预留） |
| `FACE_SERVICE_API_KEY` | 人脸服务密钥 | 无（必填） | 非空（同上） |
| `OBJECT_STORAGE_ENDPOINT` | 对象存储 endpoint | 无（必填） | URL（**当前 src 中无任何消费者**，为 StoragePort 预留，见 §8.3） |
| `OBJECT_STORAGE_BUCKET` / `OBJECT_STORAGE_ACCESS_KEY` / `OBJECT_STORAGE_SECRET_KEY` | 对象存储桶与凭据 | 无（必填） | 非空（同上） |
| `TENCENT_FACE_REGION` / `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` | 腾讯云人脸服务 | `""` | 「规划中」，代码未消费 |

布尔变量统一是字符串 `"true"/"false"`（`booleanStringSchema`）。模板见根目录 `.env.example`（实际值在 `apps/api/.env`，不入库）。注意 `.env.example` 尚未列出 `FACE_DEV_STUB*`、`FACE_SCORE_THRESHOLD`、`TENCENT_*`——它们都有默认值，可不设置。

### 6.2 小程序 `TARO_APP_API_BASE_URL` 构建期注入

- 读取处：`apps/miniprogram/src/config/env.ts` — `export const API_BASE_URL = process.env.TARO_APP_API_BASE_URL || "http://localhost:3000"`。
- 注入机制：`apps/miniprogram/config/index.ts` 的 `defineConstants` 把 `"process.env.TARO_APP_API_BASE_URL"` 替换为构建时环境变量的 JSON 字面量——**这是编译期文本替换，产物中不存在运行时 `process` 引用**。构建时环境变量本身由 Taro 从 `.env.<mode>` 文件加载（现有 `apps/miniprogram/.env.development`，内容即 `TARO_APP_API_BASE_URL=http://localhost:3000`）。
- 换后端地址 = 改 `.env.<mode>`（或导出环境变量）后重新构建，运行期不可切换。

## 7. 测试策略

全仓统一 Vitest。根命令 `corepack pnpm -r test` 跑三个包；注意本机 `pnpm` 不在 PATH 上，包目录内直接用 `npx vitest run ...`。

### 7.1 后端（`apps/api/test/`，14 个文件）

- **自包含 e2e**：每个 `*.e2e.test.ts` 文件完全自洽——文件内自带 (a) env setter（直接给 `process.env` 赋一整套测试值）、(b) 手写内存 Prisma 替身类（如 `attendance.e2e.test.ts` 里的 `AttendancePrismaTestDouble`，用 `Map` 存表、按用到的 Prisma API 形状实现 `findUnique/findMany/create/updateMany/upsert/$transaction`）、(c) `Test.createTestingModule({ imports: [真实模块] }).overrideProvider(PrismaService).useValue(替身)`（需要时再 override `FACE_VERIFICATION_CONNECTOR`）。**不需要真实数据库**。
- **请求与鉴权**：supertest 打 `app.getHttpServer()`；token 用 `app.get(JwtService).signAsync({ sid, sub, sv }, { secret: process.env.JWT_ACCESS_TOKEN_SECRET })` 真实签发，走完整 `AccessTokenGuard` 链。
- **单测**：`env.test.ts`、`main.cors.test.ts`、`face-verification.test.ts`、`wechat-code-session.connector.test.ts` 直接测纯函数/连接器（fetch/sleep 可注入，天然可 mock）。
- **domain 源码直连**：`apps/api/vitest.config.ts` 把 `@construction/domain*` alias 到 `packages/domain/src/*.ts`，避免依赖过期的 dist 构建产物（生产仍走 dist）。
- 命令：`cd apps/api && npx vitest run`（单文件 `npx vitest run test/attendance.e2e.test.ts`）。

### 7.2 domain（`packages/domain/test/`）

`roles.test.ts`、`attendance.test.ts` 纯函数单测。命令：`cd packages/domain && npx vitest run`。

### 7.3 小程序（`apps/miniprogram/test/`，11 个文件）

node 环境跑纯逻辑：`apiClient`（401 刷新重试）、`sessionReducer`、`roleHome` 及各 `services/*` 封装、`reports` view-model。`apps/miniprogram/vitest.config.ts` 把 `@tarojs/taro` alias 到 `test/taro-mock.ts`，不启动真实 Taro 运行时，不做组件渲染测试。命令：`cd apps/miniprogram && npx vitest run`。

## 8. 本地优先与可移植性原则

原则：**所有外部云服务都隔在接口/连接器后面，开发态用本地桩即可端到端跑通全流程**，生产替换实现不动业务代码。

### 8.1 人脸校验 — `FaceVerificationConnector`

接口与 Symbol token 在 `apps/api/src/infrastructure/face/face-verification.types.ts`（`FACE_VERIFICATION_CONNECTOR` + `verifyFace(input): Promise<{ detected, score }>` + 纯函数 `deriveFacePassed`）。`attendance.module.ts` 的 `useFactory` 按 `FACE_DEV_STUB` 二选一：

- `StubFaceVerificationConnector` — 恒返回 `detected: true` 与配置分数（开发/演示用）；
- `FailClosedFaceVerificationConnector` — 恒返回 `detected: false, score: 0`。**即当前没有任何真实人脸服务实现；生产配置下打卡的 `facePassed` 必为 false，记录会以 `FACE_NOT_PASSED` 标记 INVALID**——真实接入（腾讯云，`TENCENT_*` 变量已预留）为「规划中」，故障语义按 fail-closed 设计。

### 8.2 微信登录 — dev 桩

`apps/api/src/infrastructure/wechat/wechat-code-session.connector.ts`：`devLoginEnabled`（来自 `WECHAT_DEV_LOGIN`）为 true 时 `exchangeCode` 直接把提交的 code 当 openid 返回，跳过微信 `jscode2session`；为 false 时走真实 HTTP（带重试、结构化错误、可注入 fetch/sleep）。配合 `apps/api/prisma/seed.dev.ts` 预置的演示账号（openid 为 `dev-worker` / `dev-team` / `dev-project` / `dev-company` / `dev-system` / `dev-unbound`，附带示例公司/项目/班组/班次），小程序登录页 `apps/miniprogram/src/pages/login/index.tsx` 的 `DEMO_ROLES` 按钮即可一键以任意角色登录（`services/auth.ts` 的 `devLogin` 把角色 code 当微信 code 发给 `/auth/wechat/login`）。生产由 `env.ts` 的 `superRefine` 强制关闭。

### 8.3 对象存储 — `StoragePort`（进行中）

打卡自拍/工地照片目前只在 API 里以 `selfieObjectKey` / `sitePhotoObjectKey` 字符串引用，**上传通道尚未实现**。实施计划见 `docs/superpowers/plans/2026-07-07-worker-punch-flow.md`：新增 `apps/api/src/infrastructure/storage/storage.types.ts`（`StoragePort` 接口 + `STORAGE_PORT` Symbol）与本地磁盘实现 `LocalDiskStorage`（写 `UPLOADS_DIR`），`UploadsModule` 提供 `POST /uploads`（multipart → sha256 → 存储），生产可换腾讯 COS 实现——与人脸连接器完全同构的端口-适配器模式。`OBJECT_STORAGE_*` 环境变量即为此预留（当前无消费者）。同一计划还包含工人打卡页 `pages/punch` 与 `GET /me/projects/:projectId/attendance-today`，这解释了 §1.2 中工人「打卡」磁贴目前是占位。

## 文档状态

- 生成日期：2026-07-07
- 基于分支：`codex/foundation`（HEAD `c67575f`）
- 撰写方式：通读 `apps/api/src`、`apps/miniprogram/src`、`packages/domain/src`、`apps/api/test`、`apps/api/prisma` 及构建配置后成文；「规划中」「进行中」条目以 `docs/superpowers/plans/2026-07-07-worker-punch-flow.md` 与代码现状为据。
