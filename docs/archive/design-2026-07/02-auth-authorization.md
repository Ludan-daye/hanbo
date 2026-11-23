# 02 认证与授权

本文描述建筑工地人员管理系统后端(`apps/api`,NestJS + Prisma)的认证(Authentication)、会话、绑定(Binding)与授权(Authorization)设计。所有内容以当前代码为准;未实现的能力标注「规划中」。

相关源码目录:

- `apps/api/src/auth/` — 登录、刷新、登出、绑定、`/auth/me`、`AccessTokenGuard`
- `apps/api/src/authorization/` — `@RequirePermission`、`PermissionsGuard`、`AuthorizationContextService`
- `apps/api/src/bindings/` — 邀请码生成(项目管理员侧)
- `apps/api/src/infrastructure/wechat/wechat-code-session.connector.ts` — 微信 code 换取会话
- `packages/domain/src/roles.ts` — 角色层级与授权纯函数(无 IO,可单测)
- `apps/api/prisma/schema.prisma` — `User` / `UserSession` / `UserRole` / `Role` / `Permission` / `RolePermission` / `BindingInvitation` 等模型
- `apps/api/prisma/seed.ts` — 角色 / permission / role-permission 种子

---

## 1. 登录流程

### 1.1 入口与请求体

`POST /auth/wechat/login`(`apps/api/src/auth/auth.controller.ts` 的 `AuthController.login`),无守卫,匿名可调。请求体由 zod 校验(`apps/api/src/auth/auth-body.parsers.ts`):

```
{ code: string (min 1) }   // 校验失败 → 400 INVALID_WECHAT_LOGIN_REQUEST
```

控制器同时提取 `RequestMetadata`(`ip`、`user-agent` 头),用于会话记录。

### 1.2 WechatCodeSessionConnector(code → openid)

`AuthService.loginWithWechatCode` 首先调用 `WechatCodeSessionConnector.exchangeCode(code)`(`apps/api/src/infrastructure/wechat/wechat-code-session.connector.ts`)。

**dev 桩**:当 `WECHAT_DEV_LOGIN=true` 时(经 `auth.module.ts` 注入为 `devLoginEnabled`),连接器**不发任何网络请求**,直接返回:

```ts
{ openid: jsCode, sessionKey: `dev-session-${jsCode}` }
```

即前端传什么 `code`,openid 就是什么。dev 种子(`apps/api/prisma/seed.dev.ts`)据此以 `dev-system` / `dev-company` / `dev-project` / `dev-team` 等 openid 预置演示账号,小程序 `devLogin`(`apps/miniprogram/src/services/auth.ts`)直接传这些字符串登录。

**真实路径**:`GET https://api.weixin.qq.com/sns/jscode2session?appid&secret&js_code&grant_type=authorization_code`(常量 `WECHAT_CODE_SESSION_ENDPOINT`)。响应用 zod 双重解析:先匹配 `{errcode, errmsg}` 错误形态,再匹配 `{openid, session_key, unionid?}` 成功形态。

**重试逻辑**(`auth.module.ts` 配置 `maxAttempts: 3`,`retryDelayMs: 250`):

| 失败场景 | 错误 message | 可重试 |
| --- | --- | --- |
| fetch 抛异常(网络) | `WECHAT_CODE_SESSION_NETWORK_ERROR` | 是 |
| 响应体读取失败 | `WECHAT_CODE_SESSION_BODY_READ_ERROR` | 是 |
| 响应非合法 JSON | `INVALID_WECHAT_CODE_SESSION_JSON` | 是 |
| HTTP 非 2xx | `WECHAT_CODE_SESSION_HTTP_ERROR` | 是 |
| 成功形态解析失败 | `INVALID_WECHAT_CODE_SESSION_RESPONSE` | 是 |
| 微信返回 `errcode !== 0` | `WECHAT_CODE_SESSION_FAILED` | **否**(业务性失败,立即抛出) |

每次重试前输出结构化 warning(`WECHAT_CODE_SESSION_RETRY`,含 attempt / maxAttempts / retryDelayMs)。重试耗尽后抛出最后一个错误。错误 message 为 JSON 序列化的上下文,含 `appId` / `endpoint` / `jsCode` / 响应体,**不含 `appSecret`**(`apps/api/test/wechat-code-session.connector.test.ts` 有断言)。连接器异常未被 Nest 捕获为 4xx,登录时表现为 500(上游失败语义,前端只能重试)。

### 1.3 用户 upsert

`AuthService.loginWithWechatCode`(`apps/api/src/auth/auth.service.ts:120`)按 `openid` 查 `User`:

- 已存在且 `status === "DISABLED"` → **403** `USER_DISABLED`;
- 不存在 → `user.create({ openid, unionid?, lastLoginAt })`;
- 存在且 ACTIVE → `updateActiveLoginUser`:用**受保护的 `updateMany`**(`where: { openid, status: "ACTIVE" }`)写 `lastLoginAt` / `unionid`,`count !== 1` 视为并发禁用竞态 → **403** `USER_DISABLED`;随后重查,查不到 → **401** `LOGIN_USER_NOT_FOUND_AFTER_UPDATE`(防御分支)。

### 1.4 会话创建与令牌签发

- `refreshToken = randomBytes(32).toString("base64url")`,数据库只存 SHA-256 十六进制哈希(`hashSensitiveToken`,`auth.service.ts:30`),明文仅在响应中出现一次;
- `UserSession` 记录 `tokenHash`(unique)、`expiresAt = now + AUTH_REFRESH_TOKEN_TTL_SECONDS`、`ipAddress`、`userAgent`;
- `accessToken` 为 JWT,由 `createAccessToken` 用 `JWT_ACCESS_TOKEN_SECRET` 签名,TTL 为 `JWT_ACCESS_TOKEN_TTL_SECONDS`。

响应 `LoginResponse`(`apps/api/src/auth/auth.types.ts`):`accessToken` / `accessTokenExpiresAt` / `refreshToken` / `refreshTokenExpiresAt` / `user{id, isBound, openid, status}`。

---

## 2. 令牌模型

### 2.1 JWT payload

`AccessTokenPayload`(`auth.types.ts:34`):

| 字段 | 语义 |
| --- | --- |
| `sid` | `UserSession.id`,令牌与具体会话绑定,登出即失效 |
| `sub` | `User.id` |
| `sv` | 签发时的 `User.sessionVersion`(Prisma 默认 1) |

### 2.2 sessionVersion 失效机制

`AccessTokenGuard` 校验 `session.user.sessionVersion !== payload.sv` 即拒绝。语义:把 `User.sessionVersion` 加一即可让该用户**所有已签发的 accessToken 立即失效**(refreshToken 走会话表,不受 sv 影响)。当前代码库中**没有任何写路径递增 `sessionVersion`**(全库仅 `auth.service.ts:586` 读、`access-token.guard.ts:91` 比对)——「强制全端下线 / 改密踢出」的触发端点为**规划中**。

### 2.3 AccessTokenGuard 校验分支(全部 401)

`apps/api/src/auth/access-token.guard.ts`,按执行顺序:

| # | 分支 | 401 message 常量 |
| --- | --- | --- |
| 1 | 无 `authorization` 头 | `MISSING_AUTHORIZATION_HEADER` |
| 2 | 头不是严格的 `Bearer <token>` 两段(scheme 错 / token 空 / 多余段) | `INVALID_AUTHORIZATION_HEADER` |
| 3 | JWT 验签失败(签名错 / 过期等,`jwtService.verifyAsync` 抛错) | `INVALID_ACCESS_TOKEN`(附 `errorName`) |
| 4 | payload 不符合 zod schema(`sid`/`sub` 非空字符串、`sv` 正整数) | `INVALID_ACCESS_TOKEN_PAYLOAD`(附 issues) |
| 5 | 按 `sid` 查不到 `UserSession` | `SESSION_NOT_FOUND` |
| 6 | `session.userId !== sub` 或 `sessionVersion !== sv` | `ACCESS_TOKEN_SESSION_MISMATCH` |
| 7 | `revokedAt !== null` 或 `expiresAt <= now`(会话层再校验一次,即使 JWT 未过期) | `SESSION_INACTIVE` |
| 8 | `user.status !== "ACTIVE"` | `USER_DISABLED` |

全部通过后写入 `request.user = { sessionId, sessionVersion, userId }`。控制器经 `@CurrentUser()`(`apps/api/src/auth/current-user.decorator.ts`)取用;若守卫未先执行则抛 401 `AUTHENTICATED_USER_NOT_AVAILABLE`。

注意:每个受保护请求都会**查询数据库中的会话与用户**(非纯无状态 JWT),换取的是登出 / 禁用 / sv 变更的即时生效。

### 2.4 refresh 流程

`POST /auth/refresh`(无守卫),body `{refreshToken}`(400 `INVALID_REFRESH_TOKEN_REQUEST`)。`AuthService.refreshAccessToken`:

1. 以 `hashSensitiveToken(refreshToken)` 查 `UserSession`;不存在 / `revokedAt` 非空 / 已过期 → **401** `REFRESH_SESSION_INACTIVE`;
2. `user.status !== "ACTIVE"` → **401** `USER_DISABLED`;
3. 更新 `lastUsedAt`,对**同一会话**签发新 accessToken 返回(`RefreshResponse` 不含新 refreshToken)。

refreshToken **不轮换**(rotation)、无重放检测;会话生命周期以创建时的 `expiresAt` 为上限,到期须重新登录。轮换与滑动过期为**规划中**。

### 2.5 logout

`POST /auth/logout`(`AccessTokenGuard`):把当前 `sid` 对应会话的 `revokedAt` 置为当前时间,返回 `{status:"ok"}`。此后该会话的 accessToken 因分支 7 失效,refreshToken 因 `REFRESH_SESSION_INACTIVE` 失效。仅撤销当前会话,不影响同一用户的其他设备会话。

---

## 3. 绑定与邀请

### 3.1 数据模型

`BindingInvitation`(`apps/api/prisma/schema.prisma:209`):`codeHash`(unique,只存哈希)、`targetType`(`ProfileOwnerType`: `WORKER`/`MANAGER`)、`workerProfileId` / `managerProfileId`(二选一)、`createdByUserId`、`acceptedByUserId`、`status`(`PENDING`/`ACCEPTED`/`EXPIRED`/`REVOKED`)、`expiresAt`、`usedAt`。

`User` 与 `WorkerProfile`/`ManagerProfile` 为可空 1:1(profile 先由管理员建档,`userId` 为空;绑定后回填)。

### 3.2 生命周期

**生成**(bindings 模块):`POST /bindings/projects/:projectId/invitations`(`apps/api/src/bindings/bindings.controller.ts`),需 `binding.invitation.create` 权限、目标为 `projectParam`。`BindingsService.createProjectInvitation`(`apps/api/src/bindings/bindings.service.ts`):

- 项目不存在 → 404 `PROJECT_NOT_FOUND`;
- 目标必须是该项目成员(`ProjectWorkerMember` / `ProjectManagerMember`),否则 404 `BINDING_TARGET_PROJECT_WORKER_NOT_FOUND` / `BINDING_TARGET_PROJECT_MANAGER_NOT_FOUND`;
- 成员非 ACTIVE → 400 `BINDING_TARGET_MEMBER_NOT_ACTIVE`;profile 已绑用户 → 409 `BINDING_TARGET_PROFILE_ALREADY_BOUND`;
- code = `randomBytes(24).toString("base64url")`,有效期 7 天(`invitationLifetimeMs`);事务内创建邀请(存 `codeHash`)+ 写审计 `binding.invitation.create`;**明文 code 仅在本次响应返回一次**。

bindings 模块职责边界:只负责「项目管理员为未绑定的建档人员签发邀请码」;消费邀请在 auth 模块(`/auth/bind`),列表 / 撤销在 management 模块。

**绑定(消费)**:`POST /auth/bind`(`AccessTokenGuard`),body `{invitationCode}`(400 `INVALID_BIND_BY_INVITATION_REQUEST`)。`AuthService.bindByInvitation`(`auth.service.ts:263`):

1. 当前用户不存在 → 401 `CURRENT_USER_NOT_FOUND`;`isBound` 已真或已有任一 profile → 409 `CURRENT_USER_ALREADY_BOUND`(一个 `User` 只允许绑定一个 profile);
2. 按 `codeHash` 查邀请;不存在 / 非 `PENDING` / 已过期 → 400 `BINDING_INVITATION_NOT_AVAILABLE`(对外不区分原因,防枚举);邀请缺目标 profile id → 400 `WORKER_INVITATION_WITHOUT_WORKER_PROFILE` / `MANAGER_INVITATION_WITHOUT_MANAGER_PROFILE`;
3. 预检目标 profile:不存在 → 400 `BINDING_TARGET_PROFILE_NOT_FOUND`;已被绑 → 409 `BINDING_TARGET_PROFILE_ALREADY_BOUND`;
4. **单事务内三个受保护 `updateMany`**(条件 WHERE + `assertSingleGuardedWrite` 断言 `count === 1`,防 TOCTOU 竞态,`count !== 1` 一律 409 回滚):
   - 邀请置 `ACCEPTED`(WHERE 仍为 PENDING / 未过期 / 未使用 / 无 acceptor),失败 → `BINDING_INVITATION_NOT_AVAILABLE`;
   - profile 回填 `userId`(WHERE `userId: null`),失败 → `BINDING_TARGET_PROFILE_ALREADY_BOUND`;
   - 用户置 `isBound: true` 并回填 `phone`(取自 profile,WHERE `isBound: false`),失败 → `CURRENT_USER_ALREADY_BOUND`;
5. **授予角色**(同事务):
   - 工人:对每条 ACTIVE `ProjectWorkerMember` upsert `UserRole` = `WORKER` @ `PROJECT`(`grantWorkerMembershipRoles`);`Role` 表缺 WORKER → 409 `WORKER_ROLE_NOT_FOUND`;
   - 管理者:对每条 ACTIVE `ProjectManagerMember`,角色取 `membership.roleCode`,scope 取 `teamScopeId !== null ? TEAM(teamScopeId) : PROJECT(projectId)`(`grantManagerMembershipRoles`);缺角色 → 409 `MANAGER_ROLE_NOT_FOUND`;
6. 写审计 `auth.bind.worker` / `auth.bind.manager`(entityId 为 profileId,metadata 含 invitationId)。

**撤销 / 列表**(management 模块,`apps/api/src/management/management.controller.ts:173-188`):

- `GET /management/projects/:projectId/invitations` — 列出项目成员相关的邀请;
- `POST /management/projects/:projectId/invitations/:invitationId/revoke` — 仅 `PENDING` 可撤销(否则 409 `INVITATION_NOT_PENDING`;不存在 404 `INVITATION_NOT_FOUND`),置 `status: "REVOKED"`。两者权限同为 `binding.invitation.create` @ `projectParam`。撤销**未写审计日志**(缺口,见 §7)。

`EXPIRED` 枚举值存在于 schema,但**没有任何代码把状态迁移为 EXPIRED**——过期由消费时的 `expiresAt` 比较兜底;后台批量标记过期为**规划中**。

测试:`apps/api/test/bindings.e2e.test.ts`(签发不落明文、目标校验)、`apps/api/test/auth.e2e.test.ts`(bind 消费、竞态不覆盖、角色授予)。

---

## 4. 授权模型

### 4.1 UserRole 与角色层级

`UserRole`(schema.prisma:177):`(userId, roleId, scopeType, scopeId)` 联合唯一;`scopeType ∈ {GLOBAL, COMPANY, PROJECT, TEAM}`,`scopeId` 为对应实体 id(GLOBAL 时约定为常量字符串 `"GLOBAL"`,即 `GLOBAL_SCOPE_ID`)。

角色层级(`packages/domain/src/roles.ts` 的 `ROLE_LEVEL`,数字越小权力越大):

```
SYSTEM_ADMIN(1) > COMPANY_ADMIN(2) > PROJECT_ADMIN(3) > TEAM_LEADER(4) > WORKER(5)
```

`roleIncludes(owner, required)` = `level(owner) <= level(required)`;`getEffectivePermissionCodes` 把某角色**及其以下全部角色**的 permission 并集作为有效权限(即高角色天然继承低角色的所有 permission)。

### 4.2 Permission 常量表(来源:`apps/api/prisma/seed.ts`)

直接授予(`rolePermissionSeeds`):

| 角色 | 直接 permission |
| --- | --- |
| `SYSTEM_ADMIN` | `system.manage` |
| `COMPANY_ADMIN` | `company.manage`、`project.create` |
| `PROJECT_ADMIN` | `attendance.view`、`binding.invitation.create`、`project.manage`、`team.manage`、`worker.manage` |
| `TEAM_LEADER` | `attendance.view`、`makeup.approve` |
| `WORKER` | `attendance.submit`、`makeup.request` |

经层级继承后的**有效权限**:

| 角色 | 有效 permission(直接 + 继承) |
| --- | --- |
| `WORKER` | attendance.submit, makeup.request |
| `TEAM_LEADER` | 上行 + attendance.view, makeup.approve |
| `PROJECT_ADMIN` | 上行 + binding.invitation.create, project.manage, team.manage, worker.manage |
| `COMPANY_ADMIN` | 上行 + company.manage, project.create |
| `SYSTEM_ADMIN` | 全部 11 个(上行 + system.manage) |

seed 会收敛式清理种子角色上不在期望列表内的 role-permission(`seedRolePermissions` 中的 `deleteMany` + upsert),保证重复执行幂等。

### 4.3 @RequirePermission + PermissionsGuard

声明(`apps/api/src/authorization/require-permission.decorator.ts`):`@RequirePermission({ permissionCode, target })` 以 `SetMetadata` 写入 key `"construction.requiredPermission"`。`target` 四种 source(`apps/api/src/authorization/authorization.types.ts`):

| source | 解析方式(`AuthorizationContextService.resolveTargetScope`) |
| --- | --- |
| `static` | 直接使用声明的 `targetScope`(如 `POST /management/companies` 用 `GLOBAL`) |
| `companyParam` | 取路由参数为 companyId,构造 `COMPANY` 目标;**不查库验证公司存在** |
| `projectParam` | 查 `Project`(不存在 → 404 `AUTHORIZATION_PROJECT_NOT_FOUND`),目标携带 `companyId + projectId` |
| `teamParam` | 查 `Team`(include project;不存在 → 404 `AUTHORIZATION_TEAM_NOT_FOUND`),目标携带 `companyId + projectId + teamId` |

路由参数缺失或空 → 400 `MISSING_AUTHORIZATION_TARGET_PARAM`。

执行(`apps/api/src/authorization/permissions.guard.ts`):

1. `Reflector.getAllAndOverride`(方法优先于类)取元数据;无声明则**直接放行**(纯认证接口如 `/auth/me` 只挂 `AccessTokenGuard`);
2. `request.user` 缺失 → 401 `AUTHENTICATED_USER_REQUIRED_FOR_PERMISSION`(因此 `@UseGuards(AccessTokenGuard, PermissionsGuard)` 的顺序是约定,`AccessTokenGuard` 必须在前);
3. `resolveTargetScope` 得目标 scope;
4. `loadAuthorizationData(userId)`:并行查该用户全部 `UserRole`(含 role)与全量 `Role`+`RolePermission`+`Permission`,组装 `assignments` 与 `permissionsByRoleCode`(每请求实时查询,无缓存);
5. `authorizePermission`(`packages/domain/src/roles.ts:204`)判定,拒绝 → **403** `PERMISSION_DENIED`,附 `reason` / `requiredPermissionCode` / `targetScope` / `userId`。

`authorizePermission` 的判定顺序与拒绝原因:

| reason | 条件 |
| --- | --- |
| `NO_ASSIGNMENTS` | 用户没有任何 `UserRole` |
| `MISSING_PERMISSION` | 没有任何 assignment 的**有效权限集**(含层级继承)包含所需 permission |
| `SCOPE_MISMATCH` | 有权限的 assignments 中,没有一个的 scope 包含目标 scope |

关键性质:**permission 与 scope 必须来自同一条 assignment**——先过滤出带该 permission 的 assignments,再只在其中做 scope 匹配(`apps/api/test/authorization.e2e.test.ts` 的 "does not combine permission from one role assignment with scope from another" 明确验证)。

### 4.4 scopeIncludesTarget 包含规则

`packages/domain/src/roles.ts:183`,先经 `assertTargetScopeIdentity` 校验目标 scope 形状(`scopeId` 必须等于对应的 companyId/projectId/teamId,GLOBAL 必须为 `"GLOBAL"`,不符抛 Error 而非 4xx):

| assignment scope | 包含的目标 |
| --- | --- |
| `GLOBAL`(scopeId 必须为 `"GLOBAL"`) | 一切目标(GLOBAL/COMPANY/PROJECT/TEAM) |
| `COMPANY(companyId)` | 该公司自身,及 `target.companyId` 相同的 PROJECT / TEAM |
| `PROJECT(projectId)` | 该项目自身,及 `target.projectId` 相同的 TEAM |
| `TEAM(teamId)` | 仅 `target.teamId` 相同的 TEAM |

即包含链为 `GLOBAL ⊇ COMPANY ⊇ 其下 PROJECT ⊇ 其下 TEAM`;下级 scope 永不包含上级目标(TEAM assignment 访问 PROJECT 目标 → `SCOPE_MISMATCH`)。目标能否携带 companyId/projectId 由 `resolveTargetScope` 查库回填,所以 COMPANY 管理员访问本公司项目/班组无需逐级授权。

补充:`canApproveScopedMakeupRequest`(同文件)在 `authorizePermission(makeup.approve)` 之上叠加**禁止自审**(`approverUserId === requesterUserId` → `SELF_APPROVAL_BLOCKED`),用于补卡审批。

当前各控制器的使用示例:`bindings.controller.ts`(binding.invitation.create@projectParam)、`reports.controller.ts`(attendance.view@project/team/companyParam)、`makeup.controller.ts`(makeup.request@projectParam、makeup.approve@teamParam)、`management.controller.ts`(system.manage@static GLOBAL、project.create@companyParam 等)、`attendance.controller.ts`(project.manage / attendance.submit@projectParam)。

---

## 5. /auth/me 与前端角色面板

`GET /auth/me`(仅 `AccessTokenGuard`),`AuthService.getMe`(`auth.service.ts:311`)返回 `MeResponse`(`auth.types.ts:79`):

```jsonc
{
  "user":    { "id", "isBound", "status" },
  "profile": { "id": "<profileId>|null", "type": "WORKER" | "MANAGER" | null },  // 双 profile 时优先 WORKER(createProfileSummary)
  "roles": {
    "assignments": [ { "roleCode", "scope": { "scopeType", "scopeId" } } ],       // 来自 loadAuthorizationData
    "highestRoleCode": "<RoleCode>|null"                                          // getHighestRoleCode:取 ROLE_LEVEL 最小者
  }
}
```

小程序侧消费链(`apps/miniprogram/src`):

1. `services/auth.ts` 登录后存 `accessToken`/`refreshToken`,`fetchMe()` 拉取 `/auth/me`;`services/apiClient.ts` 在 401 时自动调 `/auth/refresh` 重试一次,失败抛 `SESSION_EXPIRED`;
2. `store/sessionReducer.ts` 的 `sessionPhase`:无 token → `anonymous`;无 me → `loading`;`!me.user.isBound` → `unbound`(引导去 `/pages/bind` 输入邀请码);`highestRoleCode === null` → `norole`;否则 `ready`;
3. `routing/roleHome.ts` 的 `roleHomePanel(highestRoleCode)` 把最高角色映射为面板键:`COMPANY_ADMIN→companyAdmin`、`PROJECT_ADMIN→projectAdmin`、`SYSTEM_ADMIN→systemAdmin`、`TEAM_LEADER→teamLeader`、`WORKER→worker`、null→`none`;
4. `pages/home/index.tsx` 按 phase 重定向(anonymous→login、unbound→bind),ready 后渲染 `<RolePanel panel={...} />`。

即前端只用 `highestRoleCode` 决定首页面板;细粒度按钮/页面级控制仍依赖后端 403(前端按 assignments 做菜单级隐藏为**规划中**)。测试:`apps/api/test/me.e2e.test.ts`、`apps/miniprogram/test/roleHome.test.ts`。

---

## 6. 关键流程图:一次带权限校验的请求全链路

以 `POST /bindings/projects/:projectId/invitations` 为例:

```
Client ──HTTP──▶ Nest 路由 (bindings.controller.ts)
  │  声明: @UseGuards(AccessTokenGuard, PermissionsGuard)
  │        @RequirePermission({ permissionCode: "binding.invitation.create",
  │                             target: { source: "projectParam", paramName: "projectId" } })
  ▼
[1] AccessTokenGuard (apps/api/src/auth/access-token.guard.ts)
  ├─ 取 authorization 头 ─ 缺失 ──────────────▶ 401 MISSING_AUTHORIZATION_HEADER
  ├─ 拆 "Bearer <token>" ─ 格式错 ────────────▶ 401 INVALID_AUTHORIZATION_HEADER
  ├─ jwtService.verifyAsync(JWT_ACCESS_TOKEN_SECRET) ─ 失败 ▶ 401 INVALID_ACCESS_TOKEN
  ├─ zod 校验 {sid, sub, sv} ─ 失败 ──────────▶ 401 INVALID_ACCESS_TOKEN_PAYLOAD
  ├─ DB: userSession.findUnique(sid) + user
  │    ├─ 无会话 ────────────────────────────▶ 401 SESSION_NOT_FOUND
  │    ├─ userId≠sub 或 sessionVersion≠sv ───▶ 401 ACCESS_TOKEN_SESSION_MISMATCH
  │    ├─ 已撤销/已过期 ─────────────────────▶ 401 SESSION_INACTIVE
  │    └─ user 非 ACTIVE ────────────────────▶ 401 USER_DISABLED
  └─ request.user = { userId, sessionId, sessionVersion }
  ▼
[2] PermissionsGuard (apps/api/src/authorization/permissions.guard.ts)
  ├─ Reflector 读元数据 ─ 无声明 ─▶ 放行
  ├─ request.user 缺失 ──────────▶ 401 AUTHENTICATED_USER_REQUIRED_FOR_PERMISSION
  ├─ resolveTargetScope: params.projectId ─ 缺参 ▶ 400 MISSING_AUTHORIZATION_TARGET_PARAM
  │    └─ DB: project.findUnique ─ 不存在 ▶ 404 AUTHORIZATION_PROJECT_NOT_FOUND
  │       目标 = { scopeType: PROJECT, scopeId, projectId, companyId }
  ├─ loadAuthorizationData: DB 并行查 userRole(含 role) + 全量 role→permission
  └─ authorizePermission (packages/domain/src/roles.ts)
       ├─ 无 assignment ─────────▶ 403 PERMISSION_DENIED (NO_ASSIGNMENTS)
       ├─ 无带该 permission 的 assignment(含层级继承)▶ 403 (MISSING_PERMISSION)
       └─ 同一 assignment 的 scope 不包含目标 ▶ 403 (SCOPE_MISMATCH)
  ▼
[3] @CurrentUser() 参数装饰器 → controller 方法
  ├─ zod 解析 body ─ 失败 ▶ 400 INVALID_CREATE_BINDING_INVITATION_REQUEST
  └─ BindingsService(业务校验 + 事务 + 审计) ─▶ 2xx 响应
```

---

## 7. 安全边界与已知缺口

**已具备的边界:**

- refreshToken / 邀请码在库中只存 SHA-256 哈希(`hashSensitiveToken`),明文一次性下发;
- `JWT_ACCESS_TOKEN_SECRET` 强制至少 32 字符(`apps/api/src/config/env.ts:19`);
- 生产环境 env 校验:`env.ts` 的 `superRefine` 在 `NODE_ENV=production` 时,`WECHAT_DEV_LOGIN` 或 `FACE_DEV_STUB` 为 true 直接使启动失败(`"WECHAT_DEV_LOGIN must be false in production"` / `"FACE_DEV_STUB must be false in production"`),`apps/api/test/env.test.ts` 覆盖;
- 微信连接器错误上下文不含 `appSecret`;
- 绑定与登录的关键写操作均为条件 `updateMany` + count 断言,防并发覆盖;绑定/邀请签发写 `AuditLog`。

**已知缺口(上生产前必须处理或明确接受):**

1. **实名字段仅假加密**:`WorkerProfile.encryptedName` / `encryptedIdNumber` 字段名承诺加密,但当前唯一写入方是 dev 种子,值为 `enc-${...}` 前缀明文(`apps/api/prisma/seed.dev.ts:332-333`);后端**没有任何加解密模块**。真实加密(如 KMS 托管密钥 + AES-GCM)与 `idNumberHash` 的盐化策略为**规划中**。
2. **审计日志不完整**:仅 `auth.bind.*` 与 `binding.invitation.create` 落 `AuditLog`;登录、刷新、登出、邀请撤销、角色授予变更均无审计。补全为**规划中**。
3. **dev 桩**:`WECHAT_DEV_LOGIN=true` 使任意字符串可登录为任意 openid;`FACE_DEV_STUB=true` 使人脸比对恒过(`apps/api/src/attendance/attendance.module.ts:23`)。生产必须关闭(已有 env 硬校验兜底,但要求部署时 `NODE_ENV=production` 设置正确)。
4. **refreshToken 不轮换**、会话无滑动过期、无过期会话清理任务;`sessionVersion` 无递增入口(无法强制全端下线);**规划中**。
5. `companyParam` 目标不校验公司存在性(仅 scope 匹配兜底);`BindingInvitation` 的 `EXPIRED` 状态无自动迁移;邀请撤销无审计。
6. 授权数据每请求实时查全量 role-permission 表,无缓存;当前规模可接受,后续可加进程内缓存(**规划中**)。

---

**文档状态**:2026-07-07,branch `codex/foundation`。依据当前代码撰写;涉及文件以文中路径为准,标注「规划中」处代码尚未实现。
