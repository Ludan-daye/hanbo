# 08 部署与移植指南

本文以仓库当前真实代码为准（branch `codex/foundation`），描述如何从零把系统在一台本地/单机服务器上**完整模拟运行**，以及未来向生产环境移植时需要替换的每一条「缝」。

**核心立场：本地可完整模拟运行是第一优先级，生产移植通过接口缝（port/adapter）完成。**
所有外部依赖（微信登录、人脸核验、对象存储、身份加密）都收敛到明确的接口/连接器后面，开发态用 dev 桩跑通全链路；生产态只替换缝后面的实现与环境变量，不改业务代码。`src/config/env.ts` 的 schema 在 `NODE_ENV=production` 时强制关闭 dev 桩，防止桩泄漏到生产。

仓库结构（pnpm monorepo，`pnpm-workspace.yaml` 声明 `apps/*` + `packages/*`）：

| 包 | 路径 | 说明 |
| --- | --- | --- |
| `@construction/api` | `apps/api` | NestJS 10 + Prisma 6 + PostgreSQL 后端 |
| `@construction/miniprogram` | `apps/miniprogram` | Taro 4.2（React + TS）小程序，可编译 H5 做浏览器预览 |
| `@construction/domain` | `packages/domain` | 纯 TS 领域包（角色/考勤规则），api 依赖其 `dist` 产物 |

工具链：Node 22、pnpm 9.15.4（经 `corepack`，根 `package.json` 已声明 `packageManager`）。

---

## 1. 本地全量启动手册（从零到可用）

### 1.0 前置：安装依赖

```bash
cd <repo-root>
corepack enable
corepack pnpm install
```

### 1.1 PostgreSQL 准备

仓库根目录已有 `docker-compose.yml`（`postgres:16-alpine`，用户/密码 `construction`、库 `construction_personnel`、端口 5432，带 healthcheck 与数据卷）。有 Docker 时：

```bash
docker compose up -d postgres
docker compose ps          # 等 healthy
```

没有 Docker 时二选一：

```bash
# 方式 A：docker run（等价于 compose）
docker run -d --name construction-pg \
  -e POSTGRES_USER=construction -e POSTGRES_PASSWORD=construction \
  -e POSTGRES_DB=construction_personnel \
  -p 5432:5432 -v construction_pg_data:/var/lib/postgresql/data \
  postgres:16-alpine
```

```bash
# 方式 B：apt 安装（当前开发机即此方式，Postgres 16）
apt install postgresql-16
sudo -u postgres psql -c "CREATE ROLE construction LOGIN PASSWORD 'construction';"
sudo -u postgres psql -c "CREATE DATABASE construction_personnel OWNER construction;"
```

### 1.2 配置 `.env`

模板在**仓库根**的 `.env.example`；API 实际读取的是 `apps/api/.env`（已 gitignore）：

```bash
cp .env.example apps/api/.env
```

然后逐项确认（完整表见第 4 节，这里是本地开发要点）：

- `DATABASE_URL`：模板值即匹配上面的 Postgres（`postgresql://construction:construction@localhost:5432/construction_personnel?schema=public`）。
- `JWT_ACCESS_TOKEN_SECRET`：随便换成 ≥32 字符的字符串（schema 校验 `min(32)`）。
- **`WECHAT_DEV_LOGIN=true`（dev 桩 1）**：开启后 `POST /auth/wechat/login` 把提交的 `code` 直接当 `openid` 用，绕过微信 `jscode2session`，这是本地登录 14 个演示账号的前提。
- **`FACE_DEV_STUB=true`（dev 桩 2，必须手动补一行）**：`.env.example` 里**没有**这一项，schema 默认 `false` → 选择 fail-closed 连接器 → 所有打卡都会被判 `INVALID / FACE_NOT_PASSED`。务必：

  ```bash
  grep -q '^FACE_DEV_STUB=' apps/api/.env || echo 'FACE_DEV_STUB=true' >> apps/api/.env
  ```

- `CORS_ALLOWED_ORIGINS`：填 H5 预览页面的 origin（见 1.5），如 `http://localhost:8088,http://<server-ip>:8088`。留空则完全不启用 CORS。
- `WECHAT_APP_ID/SECRET`、`OBJECT_STORAGE_*`、`FACE_SERVICE_*`：schema 要求非空/URL 格式，但 dev 桩开启时**不会被真正调用**，保留模板占位值即可。

### 1.3 数据库迁移 + 种子

```bash
cd apps/api
npx prisma migrate dev        # 应用 4 个迁移；Prisma CLI 自动读取 .env
npx prisma db seed            # 基础种子 seed.ts：角色/权限/角色权限表（migrate dev 建库时也会自动触发，手动跑一次更保险，幂等）
corepack pnpm seed:dev        # 演示种子 seed.dev.ts（脚本自带 --env-file=.env）
```

`seed:dev` 幂等，产出：公司「示例建筑公司」、两个项目（`dev-project` 示例工地一号 / `dev-project-2` 示例工地二号，均带围栏中心、默认班次「标准两段班」08:00–12:00 / 13:30–17:30、周一至周六排期）、三个班组、14 个演示用户（见 1.6）、近 3 天考勤结果样例、1 条待审补卡、绑定邀请码 `DEV-BIND-CODE`。

### 1.4 启动 API

API 的 `main.ts` 直接读 `process.env`（**没有** dotenv 加载器），所以必须先在当前 shell 注入 env：

```bash
cd <repo-root>
corepack pnpm build           # -r 按拓扑序构建：先 packages/domain（api 运行时依赖其 dist），再 api、miniprogram

cd apps/api
set -a && . ./.env && set +a  # 关键：把 .env 注入 process.env
node dist/main.js             # 生产式启动；或开发监听模式：npx nest start --watch
curl -s http://localhost:3000/health   # → {"status":"ok"}
```

注意事项（来自 `docs/superpowers/` 落地经验）：

- `packages/domain` 是 tsc 增量编译——如果删过 `packages/domain/dist`，要连 `tsconfig.tsbuildinfo` 一起删，或用 `tsc --build --force`，否则 tsc 会跳过重新产出。
- 跑测试**不需要**数据库：api e2e 用内存版 Prisma 测试替身，vitest 把 `@construction/domain/*` 别名到源码。`corepack pnpm test` 全绿即环境正常。

### 1.5 构建并静态部署 H5（浏览器预览小程序）

Taro 4.2 的 H5 产物**不会**在运行时读 `process.env`——API 地址在**构建期**经 `config/index.ts` 的 `defineConstants` 注入 `process.env.TARO_APP_API_BASE_URL`（缺省 `http://localhost:3000`）：

```bash
cd apps/miniprogram
TARO_APP_API_BASE_URL=http://<server-ip>:3000 corepack pnpm build:h5   # 产物在 dist/
python3 -m http.server 8088 --bind 0.0.0.0 --directory dist
```

同时确认 `apps/api/.env` 的 `CORS_ALLOWED_ORIGINS` 含 `http://<server-ip>:8088`（改后重启 API）。浏览器打开 `http://<server-ip>:8088`，登录框输入任一演示 openid（如 `dev-worker`）即可进入对应角色首页。微信开发者工具预览则用 `corepack pnpm build:weapp`。

### 1.6 演示账号表（14 个，来自 `apps/api/prisma/seed.dev.ts`）

登录方式：H5 登录页输入下表 openid 作为「code」（依赖 `WECHAT_DEV_LOGIN=true`）。

| # | openid（登录码） | 姓名/称谓 | 角色@范围 | 归属 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 1 | `dev-system` | 系统管理员 | `SYSTEM_ADMIN@GLOBAL` | — | |
| 2 | `dev-company` | 公司管理员 | `COMPANY_ADMIN@dev-company` | 示例建筑公司 | 可看两个项目的汇总报表 |
| 3 | `dev-project` | 项目管理员 | `PROJECT_ADMIN@dev-project` | 示例工地一号 | 不要求考勤 |
| 4 | `dev-team` | 班组长 | `TEAM_LEADER@dev-team` | 一号班组 | 有 1 条待审补卡可操作 |
| 5 | `dev-worker` | 工人（钢筋工） | `WORKER@dev-project` | 一号班组 | 带 3 天考勤样例 + 1 条补卡申请 |
| 6 | `dev-unbound` | 未绑定用户 | 无角色（`isBound:false`） | — | 登录后走绑定页，绑定码 `DEV-BIND-CODE`（对应未绑定木工档案） |
| 7 | `dev-worker-2` | 李二（钢筋工） | `WORKER@dev-project` | 一号班组 | |
| 8 | `dev-worker-3` | 王三（焊工） | `WORKER@dev-project` | 一号班组 | |
| 9 | `dev-worker-4` | 赵四（钢筋工） | `WORKER@dev-project` | 一号班组 | |
| 10 | `dev-leader-2` | 二号班组长 | `TEAM_LEADER@dev-team-2` | 二号班组 | |
| 11 | `dev-worker-5` | 孙五（木工） | `WORKER@dev-project` | 二号班组 | |
| 12 | `dev-project-2-admin` | 项目二管理员 | `PROJECT_ADMIN@dev-project-2` | 示例工地二号 | |
| 13 | `dev-leader-p2` | 项目二班组长 | `TEAM_LEADER@dev-team-p2` | 二号工地·一号班组 | |
| 14 | `dev-worker-p2` | 周六（钢筋工） | `WORKER@dev-project-2` | 二号工地·一号班组 | |

---

## 2. 验证清单

按序执行，全部通过即认为本地环境可用。

**2.1 健康检查**

```bash
curl -s http://localhost:3000/health
# 期望：{"status":"ok"}
```

**2.2 登录冒烟（dev 桩 1 生效）**

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/wechat/login \
  -H 'Content-Type: application/json' -d '{"code":"dev-worker"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')
curl -s http://localhost:3000/auth/me -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
# 期望：profile + roles 含 WORKER@dev-project，highestRoleCode=WORKER
```

**2.3 打卡链路 curl 冒烟（dev 桩 2 生效）**

当前代码中 `POST /attendance/projects/:projectId/records` 已是服务端权威判定（围栏、迟到/早退、人脸经 `FaceVerificationConnector` 判分）；`selfieObjectKey` 等四个照片字段目前按非空字符串收（`attendance-body.parsers.ts`），可用占位值：

```bash
PROJECT=$(curl -s http://localhost:3000/me/projects -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["projectId"])')
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z); TODAY=$(date -u +%F)
curl -s -X POST "http://localhost:3000/attendance/projects/$PROJECT/records" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"attendanceDate\":\"$TODAY\",\"latitude\":\"31.2304000\",\"locationAccuracyM\":null,\"longitude\":\"121.4737000\",\"occurredAt\":\"$NOW\",\"pointCode\":\"SEGMENT_1_START\",\"selfieHash\":\"smoke\",\"selfieObjectKey\":\"smoke\",\"sitePhotoHash\":\"smoke\",\"sitePhotoObjectKey\":\"smoke\"}" \
  | python3 -m json.tool
# 期望：record.status="VALID"（坐标即种子围栏中心）。若得到 INVALID/FACE_NOT_PASSED → FACE_DEV_STUB 没开。
# 注意：种子排期为周一至周六；周日会因非工作日被拒，属预期。
```

完整闭环冒烟（真实文件上传 `POST /uploads` → `GET /me/projects/:id/attendance-today` → 围栏内/外双打卡 → H5 打卡页）见 `docs/superpowers/plans/2026-07-07-worker-punch-flow.md` Task 6 ——该切片**进行中**（计划已评审，`/uploads` 与 `attendance-today` 端点尚未落码），落地后以 Task 6 为准。

**2.4 CORS 与 H5**：浏览器打开 `http://<server-ip>:8088`，用 `dev-worker` 登录进入工人面板，无控制台报错。

---

## 3. 移植缝（port/adapter）全表

每个外部依赖一行。生产移植 = 逐行替换「生产替换动作」，业务代码不动。

| 外部依赖 | 接口/文件 | 当前实现 | 生产替换动作 | 涉及 env | 状态 |
| --- | --- | --- | --- | --- | --- |
| 微信登录 | `WechatCodeSessionConnector`（`apps/api/src/infrastructure/wechat/wechat-code-session.connector.ts`） | `devLoginEnabled=true` 时 `exchangeCode` 直接把 code 当 openid 返回；真实 `jscode2session` 调用（含重试/错误分类）**已完整实现** | 填真实 `WECHAT_APP_ID`/`WECHAT_APP_SECRET`，`WECHAT_DEV_LOGIN=false`，无需改代码 | `WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_DEV_LOGIN` | 已实现 |
| 人脸核验 | `FaceVerificationConnector` + `FACE_VERIFICATION_CONNECTOR` token（`apps/api/src/infrastructure/face/face-verification.types.ts`；工厂装配在 `attendance.module.ts`） | `FACE_DEV_STUB=true` → `StubFaceVerificationConnector`（固定返回 `FACE_DEV_STUB_SCORE`）；否则 `FailClosedFaceVerificationConnector`（恒 `detected:false, score:0`，宁拒不放） | 新写 Tencent Cloud 人脸比对连接器实现该接口并在模块工厂接入；`FACE_DEV_STUB=false`；阈值由 `FACE_SCORE_THRESHOLD` 控制 | `FACE_DEV_STUB`、`FACE_DEV_STUB_SCORE`、`FACE_SCORE_THRESHOLD`、`TENCENT_SECRET_ID`、`TENCENT_SECRET_KEY`、`TENCENT_FACE_REGION`（均已预留） | 规划中 |
| 对象存储 | `StoragePort` + `STORAGE_PORT` token（规划路径 `apps/api/src/infrastructure/storage/storage.types.ts`，见 2026-07-07 打卡切片计划） | `LocalDiskStorage`（本地磁盘 `UPLOADS_DIR`，经 `UploadsModule` 暴露 `POST /uploads`）——计划已评审、**代码未落**，当前打卡把 objectKey 当不透明字符串存 | 写 COS 实现类替换 DI 工厂中的 `LocalDiskStorage`；`OBJECT_STORAGE_*` 四项 env schema 已预留 | `OBJECT_STORAGE_ENDPOINT`、`OBJECT_STORAGE_BUCKET`、`OBJECT_STORAGE_ACCESS_KEY`、`OBJECT_STORAGE_SECRET_KEY`；`UPLOADS_DIR`（随切片新增） | 进行中 |
| 身份信息加密 | 无专用接口——API 把 `encryptedIdNumber`/`encryptedName` 当不透明非空字符串收存（`management-body.parsers.ts` → `management.service.ts`） | 种子/演示数据用 `enc-` 前缀假密文；服务端不加密、不解密 | 引入服务端加密端口（KMS 托管密钥 + AES-GCM），入库前加密、出库按需解密/脱敏；补数据迁移把存量假密文重写 | 待定（预计新增 KMS 密钥/密文相关 env） | 规划中 |

数据库（Prisma + PostgreSQL）不算缝：开发与生产同栈，仅 `DATABASE_URL` 不同。

---

## 4. 环境变量总表

后端全部变量以 `apps/api/src/config/env.ts` 的 zod schema 为准（启动即校验，非法直接抛错拒绝启动）。

| 变量 | 开发值（示例） | 生产要求 | schema 校验 |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` | `production` | 枚举 `development/test/production` |
| `API_PORT` | `3000` | 按部署定 | 正整数 |
| `DATABASE_URL` | `postgresql://construction:construction@localhost:5432/construction_personnel?schema=public` | 生产库连接串（机密） | 非空 |
| `JWT_ACCESS_TOKEN_SECRET` | 任意 ≥32 字符 | 强随机机密，专用管理 | `min(32)` |
| `JWT_ACCESS_TOKEN_TTL_SECONDS` | `900` | 按策略 | 正整数 |
| `AUTH_REFRESH_TOKEN_TTL_SECONDS` | `2592000` | 按策略 | 正整数 |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 占位值 | 真实小程序凭据（机密） | 非空 |
| `WECHAT_DEV_LOGIN` | **`true`（dev 桩 1）** | **必须 `false`** | 布尔字符串，默认 `false`；`NODE_ENV=production` 时为 `true` → 启动报错 `WECHAT_DEV_LOGIN must be false in production` |
| `FACE_DEV_STUB` | **`true`（dev 桩 2，`.env.example` 缺省，需手动加）** | **必须 `false`** | 同上，production + `true` → 启动报错 |
| `FACE_DEV_STUB_SCORE` | 默认 `95` | 无意义（桩关闭） | 0–100，默认 95 |
| `FACE_SCORE_THRESHOLD` | 默认 `80` | 按人脸服务标定 | 0–100，默认 80 |
| `FACE_SERVICE_BASE_URL` / `FACE_SERVICE_API_KEY` | 占位值 | 视人脸方案定（当前代码未消费，预留） | URL / 非空（**必填**） |
| `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` / `TENCENT_FACE_REGION` | 空 | 腾讯云人脸接入时填（机密） | 可空，默认 `""`（当前代码未消费，预留） |
| `OBJECT_STORAGE_ENDPOINT` / `BUCKET` / `ACCESS_KEY` / `SECRET_KEY` | 占位值 | COS 凭据（机密） | URL / 非空（**必填**；当前代码未消费，预留给 StoragePort 生产实现） |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:8088,...` | 生产通常留空（同域/网关处理）或填运营后台域名 | 逗号分隔，默认空 = 不启用 CORS |
| `UPLOADS_DIR`（规划中） | `var/uploads` | 换 COS 后不用 | 随打卡切片加入 schema |
| `TARO_APP_API_BASE_URL`（前端，构建期） | `http://localhost:3000`（`apps/miniprogram/.env.development`） | 生产 API 的 **https** 域名，构建时注入 | 无运行时校验；经 `defineConstants` 烧进产物 |

---

## 5. 生产部署形态建议（简版）

- **构建产物**：后端 `corepack pnpm build`（拓扑序产出 `packages/domain/dist` + `apps/api/dist`），运行 `node dist/main.js`；前端 `corepack pnpm --filter @construction/miniprogram build:weapp` 后经微信开发者工具上传提审（H5 产物仅作内部预览）。目前**没有** API 的 Dockerfile（仅有 Postgres 的 compose）——容器化属可选后续项。
- **进程管理**：`main.ts` 已 `enableShutdownHooks`，配 systemd unit 或 pm2 即可（单实例起步；API 无本地状态——落地对象存储切片前注意 `LocalDiskStorage` 会引入磁盘状态，多实例需先换 COS）。
- **数据库迁移策略**：生产用 `npx prisma migrate deploy`（只应用已提交迁移，不生成、不重置），部署流水线中在新版本启动前执行；`migrate dev` 仅限开发机。基础种子 `seed.ts`（角色/权限）幂等，首次开库执行一次；`seed.dev.ts` **禁止**在生产执行。
- **机密管理**：`JWT_ACCESS_TOKEN_SECRET`、`WECHAT_APP_SECRET`、`DATABASE_URL`、`TENCENT_*`、`OBJECT_STORAGE_*_KEY` 不进仓库、不进镜像，用部署平台的 secret 注入为环境变量；`.env` 文件方式仅限开发机。上线前核查 `NODE_ENV=production` 且两个 dev 桩为 `false`（schema 会兜底拒启）。

---

## 6. 已知未决

- **HTTPS / 域名**：微信小程序要求 request 合法域名为 **https** 且在公众平台白名单内。当前所有验证均走 `http://<ip>:3000`，生产前需要：域名 + TLS 证书（反向代理如 nginx/Caddy 终止 TLS）+ 在小程序后台配置域名白名单，并用该 https 域名重新构建前端（`TARO_APP_API_BASE_URL`）。
- **日志与监控缺失**：无结构化日志方案（现状是连接器级 `logger.warn` + Nest 默认输出）、无指标、无告警、无请求追踪；审计日志仅覆盖 auth/bindings，未覆盖 attendance/makeup/management。
- **备份策略未定**：PostgreSQL 备份（pg_dump 定时/PITR）与未来对象存储数据的备份/生命周期均未设计。
- 其余功能性缺口（打卡上传切片进行中、腾讯云人脸未接、身份假加密）见第 3 节状态列。

---

**文档状态**：2026-07-07，branch `codex/foundation`（撰写时 HEAD `b8660c0`）。事实来源：根 `package.json` / `pnpm-workspace.yaml` / `docker-compose.yml` / `.env.example`、`apps/api/package.json`、`apps/api/src/config/env.ts`、`apps/api/src/main.ts` + `main.cors.ts`、`apps/api/src/infrastructure/{wechat,face}/`、`apps/api/prisma/{seed.ts,seed.dev.ts,migrations/}`、`apps/miniprogram/config/index.ts`、`docs/superpowers/plans/2026-07-07-worker-punch-flow.md`。
