# 06 小程序端(apps/miniprogram)

建筑工地人员管理系统的移动端,基于 **Taro 4.2 + React 18 + TypeScript + Sass**(webpack5 编译器),同一份源码编译出 **weapp**(微信小程序)与 **h5**(浏览器预览/联调)双目标。本文档以 `apps/miniprogram` 的真实代码为准;尚未落地的能力一律标注「规划中」或「进行中」。

---

## 1. 应用骨架

### 1.1 入口

- `apps/miniprogram/src/app.tsx` — 唯一职责是用 `SessionProvider` 包裹页面树并引入全局样式 `app.scss`,无其它逻辑。
- `apps/miniprogram/src/app.config.ts` — 通过 `defineAppConfig` 注册全部 17 个页面(见 §3),并设置全局 `window`(背景 `#F3ECE1`、标题「工地考勤」、黑色导航文字)。首个页面为 `pages/login/index`,即冷启动落地页。
- `apps/miniprogram/src/index.html` — H5 目标的宿主模板。

### 1.2 会话 store(`src/store/`)

会话状态用 **React Context + useReducer** 实现,不引入第三方状态库。

- `src/store/sessionReducer.ts` — 纯函数层:
  - `SessionState = { accessToken, refreshToken, me }`(`me` 为 `MeResponse | null`);
  - `SessionAction`:`SET_TOKENS` / `SET_ACCESS_TOKEN` / `SET_ME` / `CLEAR`;
  - **状态机** `sessionPhase(state): SessionPhase`,按序判定:

    | phase | 判定条件 | 含义 |
    |---|---|---|
    | `anonymous` | `accessToken === null` | 未登录 |
    | `loading` | 有 token 但 `me === null` | `/auth/me` 尚未返回 |
    | `unbound` | `me.user.isBound === false` | 已登录未绑定身份 |
    | `norole` | 已绑定但 `me.roles.highestRoleCode === null` | 绑定后未授予角色 |
    | `ready` | 其余 | 可进入角色面板 |

- `src/store/session.tsx` — `SessionProvider` / `useSession()`:
  - 冷启动 `useEffect` 从 `Taro.getStorageSync` 读回 `accessToken`/`refreshToken`,若存在则 `SET_TOKENS` 并调用 `fetchMe()`(失败即 `CLEAR`);
  - 对外暴露 `{ state, phase, refreshMe, onLoggedIn, clear }`;`onLoggedIn()` 在登录写入 storage 后重读 token 并拉取 `/auth/me`;`clear()` 先 best-effort 调 `logout()`(服务端吊销 + finally 清 storage),再立即 `CLEAR` 本地状态。

### 1.3 导航流:login → bind → home

三个页面各自守卫,形成闭环(全部用 `Taro.redirectTo`,不留返回栈):

- `src/pages/login/index.tsx` — 当前为**开发态登录**:列出 6 个演示身份按钮(`dev-worker`/`dev-team`/`dev-project`/`dev-company`/`dev-system`/`dev-unbound`),点击调 `devLogin(code)`(`POST /auth/wechat/login`,依赖后端 `WECHAT_DEV_LOGIN`)→ `onLoggedIn()` → 跳 `home`。同时在 `useDidShow` 与 `useEffect([phase])` 双钩子里执行 `redirectForPhase`:`ready|norole → home`,`unbound → bind`(覆盖冷启动 `/auth/me` 异步返回的时序)。真实 `wx.login` 微信授权登录**规划中**。
- `src/pages/bind/index.tsx` — 输入邀请码 → `bindByInvitation(code)`(`POST /auth/bind`)→ `refreshMe()` → 跳 `home`;附「退出登录」(`clear()` → login)。
- `src/pages/home/index.tsx` — `guardPhase`:`anonymous → login`,`unbound → bind`;`loading` 期间渲染 `StateView("加载中…")`;就绪后 `roleHomePanel(state.me?.roles.highestRoleCode ?? null)` 得到 `PanelKey`,交给 `<RolePanel panel={...}/>` 渲染,底部固定「退出登录」。

### 1.4 routing 层:角色 → 面板 / scope 解析

`src/routing/` 是纯函数,无副作用,均有单测:

- `roleHome.ts` — `PanelKey = "worker" | "teamLeader" | "projectAdmin" | "companyAdmin" | "systemAdmin" | "none"`;`PANEL_BY_ROLE` 把 `/auth/me` 返回的 `roles.highestRoleCode`(`RoleCode`,镜像后端五角色枚举)映射到 PanelKey,`null → "none"`。
- `projectAdmin.ts` — `resolveAdminProjectId(me)`:取**第一个** `roleCode === "PROJECT_ADMIN" && scope.scopeType === "PROJECT"` 的 assignment 的 `scopeId`,否则 `null`。
- `teamLeader.ts` — `resolveTeamLeaderTeamId(me)`:同理取 `TEAM_LEADER @ TEAM`。
- `companyAdmin.ts` — `resolveCompanyAdminCompanyId(me)`:同理取 `COMPANY_ADMIN @ COMPANY`。

各业务页面用对应 resolver 拿 scopeId;拿不到时渲染「无项目/无班组/无公司」的 `StateView` 兜底。注意:**只取第一个 assignment**,多项目/多 scope 账号的切换器尚未实现(见 §9)。

---

## 2. 角色面板体系(`src/components/role-panels/index.tsx`)

`RolePanel` 由一张静态配置表 `TILES: Record<PanelKey, { title, tiles: TileCfg[] }>` 驱动;`TileCfg = { title, sub, nav?: { url } }`。**没有 `nav` 的 tile 即 stub**,渲染 `Tile stub` 徽标「敬请期待」且不可点击;有 `nav` 的 tile 点击 `Taro.navigateTo`。

| PanelKey | 面板标题 | Tile | 目标页 | 状态 |
|---|---|---|---|---|
| `worker` | 工人 | 打卡(四点考勤 · 拍照 + 定位) | — | **stub,打卡页进行中**(§7) |
| | | 我的记录 | `/pages/my-records/index` | 已实现 |
| | | 补卡(我的申请 · 提交补卡) | `/pages/my-makeups/index` | 已实现 |
| `teamLeader` | 班组长 | 补卡审批 | `/pages/team-makeups/index` | 已实现 |
| | | 团队考勤 | `/pages/team-attendance/index` | 已实现 |
| `projectAdmin` | 项目管理员 | 项目参与者 | `/pages/participants/index` | 已实现 |
| | | 考勤报表(日/周/月) | `/pages/reports/index` | 已实现 |
| | | 邀请(生成绑定邀请码) | `/pages/invitation/index` | 已实现 |
| | | 项目管理(班组与邀请管理) | `/pages/project-management/index` | 已实现 |
| | | 排班(班次/默认排班) | `/pages/schedules/index` | 已实现 |
| `companyAdmin` | 公司管理员 | 公司与项目 | `/pages/company-projects/index` | 已实现 |
| | | 人员(公司人员总览) | `/pages/company-people/index` | 已实现 |
| | | 新建项目 | `/pages/create-project/index` | 已实现 |
| | | 公司报表(日/周/月) | `/pages/company-reports/index` | 已实现 |
| `systemAdmin` | 系统管理员 | 系统配置(公司/角色/全局设置) | — | **stub,整个面板占位** |
| `none` | 已绑定 | (无 tile)渲染提示「尚未分配角色,请联系管理员」 | — | 兜底态 |

---

## 3. 页面清单全表

`app.config.ts` 注册的 17 个页面(每页伴随 `index.config.ts` 仅设置 `navigationBarTitleText`):

| 页面路径 | 服务依赖(services 函数) | 面向角色 |
|---|---|---|
| `pages/login/index` | `auth.devLogin` | 所有人(开发态入口) |
| `pages/bind/index` | `auth.bindByInvitation`(+ `useSession.refreshMe/clear`) | 未绑定用户 |
| `pages/home/index` | 无直接调用(经 `useSession` 间接依赖 `auth.fetchMe`) | 全角色 |
| `pages/participants/index` | `management.fetchParticipants` | PROJECT_ADMIN |
| `pages/reports/index` | `management.fetchDailyReport` / `fetchWeeklyReport` / `fetchMonthlyReport` | PROJECT_ADMIN |
| `pages/invitation/index` | `management.fetchParticipants` + `bindings.createInvitation` | PROJECT_ADMIN |
| `pages/team-makeups/index` | `makeups.fetchPendingMakeups` / `approveMakeup` / `rejectMakeup` | TEAM_LEADER |
| `pages/team-attendance/index` | `management.fetchTeamDailyReport` / `fetchTeamWeeklyReport` / `fetchTeamMonthlyReport` | TEAM_LEADER |
| `pages/company-projects/index` | `management.fetchCompanyProjects` | COMPANY_ADMIN |
| `pages/company-people/index` | `management.fetchCompanyParticipants` | COMPANY_ADMIN |
| `pages/my-records/index` | `me.fetchMyAttendanceRecords` | WORKER(任何已绑定参与者) |
| `pages/my-makeups/index` | `me.fetchMyMakeups` | WORKER |
| `pages/submit-makeup/index` | `me.fetchMyProjects` + `me.submitMakeup` | WORKER |
| `pages/project-management/index` | `management.fetchProjectTeams` / `fetchProjectInvitations` / `revokeProjectInvitation` | PROJECT_ADMIN |
| `pages/schedules/index` | `management.configureDefaultShift` / `configureDefaultSchedule` | PROJECT_ADMIN |
| `pages/create-project/index` | `management.createCompanyProject` | COMPANY_ADMIN |
| `pages/company-reports/index` | `management.fetchCompanyDailyReport` / `fetchCompanyWeeklyReport` / `fetchCompanyMonthlyReport` | COMPANY_ADMIN |

`pages/punch/index`(工人打卡页)**进行中**,尚未注册进 `app.config.ts`(见 §7)。

共性页面模式:`useEffect` 内 async IIFE 拉数据 + `cancelled` 标志防泄漏;三态渲染(`StateView` 加载中/加载失败/空列表);`pages/reports/view-model.ts` 的 `totalsStatItems(totals)` 把 `ReportTotals` 转成 10 个 `StatCard` 项,被 `reports`、`team-attendance`、`company-reports` 三页复用。

---

## 4. 服务层设计(`src/services/`)

### 4.1 `apiClient.ts` — Taro.request 封装

`createApiClient(baseUrl): ApiClient`,唯一方法 `request<T>(path, options?)`,`RequestOptions = { method?, data?, auth? }`(`auth` 默认 `true`):

1. **Bearer 注入**:每次请求前从 `Taro.getStorageSync("accessToken")` 读 token,拼 `Authorization: Bearer <token>` header(`auth: false` 时跳过,用于登录/刷新)。
2. **401 → 单次刷新重试**:响应 401 且启用 auth 时,用 storage 里的 `refreshToken` 调 `POST /auth/refresh`;成功则 `Taro.setStorageSync("accessToken", next)` 并**只重试一次**原请求;刷新失败则清除双 token 并抛 `ApiError(401, "SESSION_EXPIRED")`。
3. 2xx 返回 `res.data as T`;其余抛 `ApiError(statusCode, "REQUEST_FAILED_<code>")`。`ApiError extends Error` 携带 `statusCode`。

token 的持久化边界:**apiClient 只负责读/刷新/清除**;写入发生在 `auth.ts` 的 `devLogin`(登录成功 setStorageSync 双 token)与 `logout`(finally 移除)。

### 4.2 `client.ts` — 单例组装

`export const apiClient = createApiClient(API_BASE_URL)`,`API_BASE_URL` 来自 `src/config/env.ts`(构建期注入,见 §6)。所有 service 文件从这里 import 单例,`apiClient.ts` 本身保持可注入 baseUrl 以便单测。

### 4.3 service 文件 ↔ 后端模块对应

| service 文件 | 后端模块(apps/api) | 覆盖端点 |
|---|---|---|
| `services/auth.ts` | `auth` | `POST /auth/wechat/login`、`GET /auth/me`、`POST /auth/bind`、`POST /auth/logout` |
| `services/bindings.ts` | `bindings` | `POST /bindings/projects/:projectId/invitations` |
| `services/makeups.ts` | `makeup` | `GET /makeups/teams/:teamId/pending`、`POST /makeups/requests/:id/approve|reject` |
| `services/me.ts` | `me`(+ `makeup` 的提交) | `GET /me/attendance-records?from&to`、`GET /me/makeups`、`GET /me/projects`、`POST /makeups/projects/:projectId/requests` |
| `services/management.ts` | `management` + `reports` + `attendance`(排班) | 项目/班组/公司三级 participants、日/周/月报表(project/team/company 三套)、teams、invitations(列表/撤销)、`PUT /attendance/projects/:id/default-shift|default-schedule`、`POST /management/companies/:id/projects` |
| `services/uploads.ts` | `uploads` | **规划中**(随打卡页,`Taro.uploadFile → POST /uploads`) |

### 4.4 类型镜像约定

无 OpenAPI codegen、无共享类型包;每个 service 配套一份**手写类型镜像文件**逐字段复刻后端响应:`auth.types.ts`(`RoleCode`/`MeResponse`/`LoginResponse`)、`management.types.ts`(`ProjectParticipant`/`ReportTotals`/`DailyReport`/`RangeReport`/`CompanyProject`/`ProjectTeam`/`ProjectInvitation`/`DefaultShiftBody`/`DefaultScheduleBody`/`CreateProjectBody` 等)、`me.types.ts`(`AttendanceRecord`/`Makeup`/`MyProjectMembership`/`SubmitMakeupBody`);小文件(`bindings.ts`/`makeups.ts`)类型内联。约定:全字段 `readonly`;**经纬度端到端用 string**;周报查询参数名是 `weekStartDate`(不是 `startDate`);枚举用字符串字面量联合而非 enum。后端响应变更时需人工同步这批文件。

---

## 5. UI 组件库与设计 token

### 5.1 组件 props 契约(`src/components/ui/`,统一从 `index.tsx` re-export)

| 组件 | 文件 | Props | 说明 |
|---|---|---|---|
| `Screen` | `index.tsx` | `children` | 页面容器,min-height 100vh + 统一内边距 |
| `Title` / `Subtitle` / `Label` | `index.tsx` | `children` | 排版三件套(大标题/副标题/大写小标签) |
| `Button` | `index.tsx` | `onClick?`, `variant?: "primary" \| "outline"`(默认 primary), `children` | 胶囊按钮 |
| `Tile` | `index.tsx` | `title`, `sub`, `stub?`, `onClick?` | 面板卡片;`stub` 渲染「敬请期待」徽标 |
| `Field` | `index.tsx` | `value`, `placeholder`, `onInput(value: string)` | 单行输入,已拆包 `e.detail.value` |
| `StateView` | `index.tsx` | `title`, `sub?` | 加载/错误/空态居中占位 |
| `PageHeader` | `page-header.tsx` | `title` | 页头 + 返回键(`Taro.navigateBack`) |
| `Segmented<T extends string>` | `segmented.tsx` | `options: ReadonlyArray<SegmentedOption<T>>`, `value: T`, `onChange(next: T)` | 分段选择;注意 `onChange={setX}` 会触发 TS 变异错误,须写 `(v) => { setX(v); }` |
| `ListItem` | `list-item.tsx` | `primary`, `secondary?`, `chip?`, `onClick?` | 列表行(主/副文案 + 右侧 chip) |
| `StatCard` / `StatCards` | `stat-card.tsx` | `{ label, value }` / `{ items: { label, value }[] }` | 指标卡及流式网格 |
| `CopyButton` | `copy-button.tsx` | `value`, `label?`(默认「复制」) | `Taro.setClipboardData` + 成功 toast |

样式集中在 `components/ui/ui.scss`(BEM 前缀 `ui-`,含入场动画 `ui-rise`),组件文件不写内联样式。

### 5.2 设计 token(`src/styles/tokens.scss`)

「Warm Earthen」暖土色体系,以 `:root` CSS 变量定义:

- 表面:`--bg #F3ECE1`(沙)、`--surface #FFFFFF`、`--surface-sunk #EDE4D6`;
- 墨色:`--ink #2E2A26`、`--ink-soft #6B5D4D`、`--line #D8CDBB`;
- 品牌:`--clay #C5512F`(陶土主色)、`--clay-pressed #A8401F`、`--clay-tint #F6E4DB`、`--steel #3A4A4F`;
- 状态:`--gold #E0B24A`、`--success #4F7A4E`、`--danger #B23B2E`;
- 形状:`--radius-card 24rpx`、`--radius-pill 999rpx`、`--shadow-soft`、`--tap-min 88rpx`(最小点击域)。

尺寸一律 **rpx**,配合 `config/index.ts` 的 `designWidth: 750` + `deviceRatio`(750 → 1),750rpx = 一屏宽;H5 端由 Taro pxtransform/postcss 换算。`app.scss` 对 `page, .taro_router` 应用背景/墨色与 CJK 字体栈(PingFang SC / Noto Sans SC / Microsoft YaHei)。已知事项:`:root` CSS 变量在 H5 验证通过,**weapp 真机主题变量挂载点需复验**(weapp 无 `:root`,可能需改挂 `page`)——规划中。

---

## 6. 构建与环境

### 6.1 双目标与脚本(`package.json`)

`build:weapp` / `build:h5` / `dev:weapp` / `dev:h5`(`--watch`)/ `test`(`vitest run`)。构建配置 `config/index.ts`(`defineConfig<'webpack5'>`):`framework: react`、`sourceRoot src` → `outputRoot dist`、`designWidth 750`、mini/h5 双端都挂 `TsconfigPathsPlugin`、webpack 持久化缓存关闭;按 `NODE_ENV` merge `config/dev.ts`(仅 logger)或 `config/prod.ts`(默认压缩混淆,预留 analyzer/prerender 注释)。

### 6.2 `TARO_APP_API_BASE_URL` 的构建期注入(重要坑)

Taro 4.2 的 H5 目标**不会**自动替换 `src/config/env.ts` 里引用的 `process.env.TARO_APP_*`——浏览器 bundle 运行时引用 `process` 会抛 `process is not defined`,导致 `#app` 白屏。因此 `config/index.ts` 用 `defineConstants` 显式做构建期字面量替换:

```ts
defineConstants: {
  "process.env.TARO_APP_API_BASE_URL":
    JSON.stringify(process.env.TARO_APP_API_BASE_URL || "http://localhost:3000")
}
```

`src/config/env.ts` 再兜底:`API_BASE_URL = process.env.TARO_APP_API_BASE_URL || "http://localhost:3000"`。

**第二个坑**:`.env.development`(内容 `TARO_APP_API_BASE_URL=http://localhost:3000`)只在 development 模式被 Taro 加载;**生产构建(`NODE_ENV=production`)不读它**,而 `defineConstants` 读的是构建进程的 shell 环境变量——所以生产构建必须在命令行显式传入 `TARO_APP_API_BASE_URL=https://... npm run build:h5`,否则打进包里的是 `http://localhost:3000` 兜底值。仓库当前没有 `.env.production`。

### 6.3 H5 静态部署(联调/预览)

`taro build --type h5` 产物在 `apps/miniprogram/dist/`,用 `python3 -m http.server 8088` 直接静态伺服(本机预览地址形如 `http://<host>:8088`);后端 API 在 `:3000`,跨域由后端 `CORS_ALLOWED_ORIGINS` 放行。无 nginx/无 SSR。

### 6.4 typecheck 与 import 约定

- `package.json` **没有 typecheck script**,需手动 `cd apps/miniprogram && npx tsc --noEmit`;`tsconfig.json` 已开 `skipLibCheck`(Taro 类型依赖需要)与 `strictNullChecks`。
- Taro webpack **不解析 `.js` 后缀 import 到 `.tsx` 源文件**(与 `apps/api` 的 ESM `.js` 后缀约定相反),小程序端一律使用**无后缀相对路径 import**。

---

## 7. H5 与真机(weapp)差异清单

打卡页(`pages/punch/index`)**进行中**,设计与差异处置见 `docs/superpowers/plans/2026-07-07-worker-punch-flow.md` 与 `docs/superpowers/specs/2026-07-07-worker-punch-flow-design.md`。主要差异:

| 能力 | weapp 真机 | H5(当前 :8088 非 HTTPS) | 处置 |
|---|---|---|---|
| 定位 `Taro.getLocation` | 原生定位(需用户授权 + app.json 权限声明) | `navigator.geolocation` 在**非 HTTPS 远程源被浏览器禁用** | 打卡页提供手动输入坐标兜底(进行中) |
| 拍照 `Taro.chooseImage` | 调起相机(count 1, camera) | **降级为文件选择对话框** | 可接受,进行中 |
| 上传 `Taro.uploadFile` | 原生 multipart 上传 | **走 XHR multipart** | 配套 `services/uploads.ts` + 后端 `POST /uploads`(进行中) |
| `:root` CSS 变量主题 | 挂载点需复验(weapp 无 `:root`) | 正常 | 规划中(§5.2) |
| 登录 | 需真实 `wx.login` code | dev login 直接选身份 | 真机授权登录规划中 |

其余已实现页面(列表/表单/Picker/剪贴板)在两端行为一致,已在 H5 headless 浏览器(puppeteer)实测验证。

---

## 8. 测试现状

测试目录为 `apps/miniprogram/test/`(非 `__tests__`),runner 为 **vitest**(`npm test` → `vitest run`;`vitest.config.ts` 设 `environment: node`、`include: ["test/**/*.test.ts"]`,并把 `@tarojs/taro` alias 到 `test/taro-mock.ts`——一个内存 storage + 可注入 `__setRequestHandler` 的最小 Taro mock)。共 **11 个测试文件、51 个用例**,全部是纯逻辑单测,**无组件/页面级渲染测试**:

| 测试文件 | 用例数 | 覆盖 |
|---|---|---|
| `test/apiClient.test.ts` | 3 | Bearer 注入、401→refresh→单次重试、刷新失败→`SESSION_EXPIRED` |
| `test/sessionReducer.test.ts` | 6 | reducer 各 action + `sessionPhase` 状态机 |
| `test/roleHome.test.ts` | 2 | `roleHomePanel` 角色→面板映射 |
| `test/projectAdmin.test.ts` | 4 | `resolveAdminProjectId` scope 解析 |
| `test/teamLeader.test.ts` | 4 | `resolveTeamLeaderTeamId` |
| `test/companyAdmin.test.ts` | 4 | `resolveCompanyAdminCompanyId` |
| `test/bindings.service.test.ts` | 1 | `createInvitation` 的 URL/method/body 组装 |
| `test/me.service.test.ts` | 4 | `/me/*` 与 `submitMakeup` 请求组装 |
| `test/makeups.service.test.ts` | 3 | pending/approve/reject 请求组装 |
| `test/management.service.test.ts` | 19 | project/team/company 全量端点的 URL 与参数(含 `weekStartDate`) |
| `test/reports.view-model.test.ts` | 1 | `totalsStatItems` 指标转换 |

---

## 9. 已知缺口

1. **工人打卡页**(核心闭环)——进行中,计划文档 `docs/superpowers/plans/2026-07-07-worker-punch-flow.md`(新增 `services/uploads.ts`、`me.fetchAttendanceToday`/`submitAttendanceRecord`、`pages/punch/index`,并把 worker 面板「打卡」tile 接上导航)。
2. **系统管理员面板整体占位**——`role-panels` 中 `systemAdmin` 仅一个 stub tile「系统配置」,无任何页面。规划中。
3. **真实微信登录**——login 页仅开发态 `devLogin`;`wx.login` + 静默授权流程规划中。
4. **多 scope 支持**——`routing/*.ts` 的 resolver 只取第一个匹配 assignment,身兼多项目/多角色的账号无法切换 scope;公司管理员从项目列表 drill-down 到项目级页面(需页面接受 `projectId` 路由参数)同样未实现。规划中。
5. **weapp 真机视觉验证**——`:root` CSS 变量在 weapp 的挂载点未复验(H5 已验证)。规划中。
6. **组件/页面级测试**——现有测试全部绕开渲染层;无 E2E harness(H5 侧曾用 puppeteer 手动走查,不在 CI)。
7. **工程化**——无 typecheck/lint script(手动 `npx tsc --noEmit`)、无 tabBar/分包、无全局错误上报,`webpack cache` 关闭。
8. **类型镜像靠人工同步**——`*.types.ts` 与后端响应无 codegen 关联,后端字段变更不会在编译期暴露。

---

## 文档状态

- 日期:2026-07-07
- 基准分支:`codex/foundation`
- 代码基准:`apps/miniprogram`(Taro 4.2 / React 18 / TS / Sass,17 页,51 个前端单测)
