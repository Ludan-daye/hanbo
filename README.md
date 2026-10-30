# 瀚渤智慧工地

面向施工项目的人员、班组、定位人脸考勤与报表管理小程序。下表为进度摘要，详细范围和验收标准见 [功能总览与实施计划](docs/功能总览与实施计划.md)。

工地人员与考勤管理系统，采用 pnpm monorepo：

- `apps/miniprogram`：Taro 4.2、React、TypeScript，支持微信小程序与 H5。
- `apps/api`：NestJS、Prisma、PostgreSQL，提供登录、身份绑定、项目人员、排班、考勤、补卡和报表接口。
- `packages/domain`：角色权限与考勤规则。
- `docs/design`：业务与架构设计。

工人流程：**微信登录 → 完善资料 → 邀请码绑定档案 → 填写用工资料 → 拍摄本人底照 → 进入项目**。底照经管理员审核后，打卡按 **选择项目 → GPS 范围校验 → 现场照片 → 活体与底照比对 → 提交考勤** 执行。

## 功能进度

更新日期：**2026-10-30**。已实现表示代码和相关本地检查已完成；测试环境可联调，尚未正式上线。手机完整流程与容量验收单独列出。

本次功能源码已同步 GitHub 与测试服务器，API 发布版本为 `20261030T073518Z-7946a97`。微信客户端已自动编译，尚未重新上传体验版；服务器更新不会自动替换手机中的小程序页面。

### 已实现

| 模块 | 已有功能 |
| --- | --- |
| 登录与权限 | 微信登录、头像昵称、真实姓名、手机号、邀请码绑定；五级权限及项目范围隔离 |
| 首次登记 | 身份证、居住地址、紧急联系人、健康、保险及银行卡信息；地区选择、号码校验、条件必填 |
| 底照接续 | 资料保存后直接拍摄本人正脸；中断重登继续补录；已有底照不重复要求，上传后等待审核 |
| 工人首页 | 今日项目、打卡进度、本月出勤与总工时、底照及缺卡待办 |
| 我的项目 | 多项目查看；详情展示地址、围栏、工种、班组、职级、负责人和今日安排 |
| 项目与人员 | 新建项目必选管理员；地图选择圆形考勤范围；人员进退场、工种、班组及同项目兼任 |
| 排班与考勤规则 | 默认每日两次，上级可配置次数；个人／班组／项目规则及历史版本；分段工时与异常判定 |
| 项目报表与评分 | 按项目 → 人员 → 每日明细查看；出勤、工时、异常、补卡及项目评分 |
| Excel 导出服务 | 月度四表、后台任务、权限校验、重复请求控制、失败重试及版本记录 |
| 测试部署 | 腾讯云 API、PostgreSQL、持久文件、HTTPS、定时续期、同机备份和源码更新脚本 |

### 已有实现，待验收

| 项目 | 还需确认 |
| --- | --- |
| 正式打卡 | 手机 GPS 范围内外、现场拍照、活体比对、提交入库与项目切换完整流程 |
| 底照与注册 | 手机首次填写 → 拍照 → 管理员审核；驳回、换照和重新登录 |
| 补卡审批 | 工人申请 → 上级审批 → 日报／月报重算的手机完整流程 |
| 地图与联系 | 手机地图选址、查看围栏、导航和拨号 |
| 月度 Excel | 手机下载、打开、转发及多人并行导出 |

腾讯云独立动作活体测试已有真机通过记录；这不等于新版正式打卡已验收。

### 待完成

| 优先级 | 模块 | 待做内容 |
| --- | --- | --- |
| 1 | 人员档案与工班组 | 按工班组／组长检索；管理员核实资料；敏感字段分级查看与留痕 |
| 2 | 分类计工 | 常规白天按工日；零星维修按工时；加班单独计时；跨夜和缺卡处理 |
| 3 | 临时用工 | 项目内快速登记、指定负责人、本次任务开完工打卡和退场 |
| 4 | 安全交底 | 刷脸前必须确认交底；记录内容版本、人员和本次打卡 |
| 5 | 安全信用 | 违规登记复核、累计标签、排行榜、扣分、无违规工作日恢复及申诉 |
| 6 | 报表扩展 | 分类工日／工时、安全记录、组长信息；打卡位置明细与车费核查 |
| 7 | 平台管理 | 公司级授权、账号停用、审计查询及剩余演示页面接通真实接口 |
| 8 | 正式上线 | 数千人并发压测、异地备份、监控告警、域名备案、微信合法域名与审核发布 |
| 后续 | 扩展业务 | 施工日志、质量整改、技能证书、用工推荐、薪酬核算及自动通知 |

当前总工时尚未拆分为正常工日、零星工时和加班工时；数千人并发尚无压测达标结论。

## 本地运行

需要 Node.js 22、Corepack、Docker 和微信开发者工具。

```bash
git clone https://github.com/Ludan-daye/hanbo.git
cd hanbo
corepack pnpm install --frozen-lockfile
cp .env.example apps/api/.env
docker compose -p hanbo-local up -d postgres
corepack pnpm --filter @construction/api prisma:generate
corepack pnpm --filter @construction/api exec prisma migrate deploy
corepack pnpm --filter @construction/api exec prisma db seed
corepack pnpm --filter @construction/domain build
corepack pnpm --filter @construction/api build
corepack pnpm --filter @construction/api start:local
```

启动前编辑 `apps/api/.env`：设置独立的 JWT 密钥、微信 AppID / AppSecret 和服务端腾讯云 API 密钥。其他配置项见 `.env.example`。Docker Compose 中的数据库账号仅供本地开发。

动作活体使用腾讯云 `GetActionSequence` 和 `LivenessCompare`，设置 `TENCENT_FACE_MODE=VIDEO_ACTION`、`FACE_DEV_STUB=false`。底照和新录制的视频在核验时发送至腾讯云，不需要身份证照片、H5 RuleId 或原生一闪 SDK。

可选的演示数据可在本地数据库中通过 `corepack pnpm --filter @construction/api seed:dev` 初始化；其中账号和人员均为演示资料。

## 小程序构建与手机测试

将 `apps/miniprogram/project.config.json` 中的 `appid` 设置为自己的小程序 AppID，保持后端运行。日常开发直接使用源码项目，不必反复生成 ZIP：

```bash
corepack pnpm dev:weapp --api-base-url http://YOUR_COMPUTER_LAN_IP:3000
```

在微信开发者工具中打开 `apps/miniprogram`，只需导入一次；`project.config.json` 已指向 `dist-weapp/`。保持上述命令运行，保存源码会自动重新编译，开发者工具读取同一个目录。手机预览点击工具中的“预览”；手机与电脑须在同一 Wi-Fi，使用有开发者或体验权限的微信扫码。电脑 IP 改变后用新地址重启该命令。

### 云端测试

测试 API：`https://162.14.74.2`，健康检查为 `/health`。服务器运行 API、PostgreSQL 和持久文件目录，已迁入本地测试数据。手机连接云端时可使用移动网络，后端不依赖 Mac 开机。微信测试号通过预览使用，手机需在右上角菜单开启调试以跳过域名校验；正式发布前再配置域名、备案和合法域名。

```bash
# Automatically rebuild the Mini Program against the test API.
corepack pnpm dev:weapp --api-base-url https://162.14.74.2 --test-login

# Upload the current backend source, back up data, migrate and restart.
corepack pnpm deploy:test ubuntu@162.14.74.2
```

SSH 密码只在终端提示时输入。更新命令使用当前工作区源码，不自动提交 Git，也不上传 `.env` 或覆盖云端数据。前端改动保存后自动编译；本人日常联调可在微信开发者工具打开“真机调试 → 自动真机调试”，选择手机系统，保持手机微信前台运行且登录工具显示的同一账号。当前采用局域网模式，手机与电脑需在同一 Wi-Fi。点击“编译并自动调试”（Mac：⇧⌘R）更新手机调试代码，无需每次生成预览码；是否连接成功以工具显示为准。预览包仍是当次编译的快照；后端改动执行部署命令。

测试包登录页支持五种测试角色：输入单独提供的测试口令，再选择身份，直接读取云端数据。正式微信登录仍保留。`--test-login` 仅控制客户端入口；服务端还必须配置 `DEPLOYMENT_ENV=test` 和口令的 SHA-256 值 `TEST_LOGIN_SECRET_HASH`，并执行 `pnpm exec tsx prisma/seed.test-logins.ts` 补齐已有的五个 `dev-*` 账号资料。该脚本不创建权限，也不修改真实微信账号；不要为此重跑完整开发种子。默认部署关闭测试登录，口令不进入客户端或 Git。服务端 Nginx 对测试登录单独限流。

部署配置位于 `deploy/test`，当前服务器目录为 `/opt/hanbo-test`：`current` 指向代码版本，`.env` 存放独立服务端配置，`uploads` 保存图片和 Excel。API 只监听本机 3000，数据库不映射公网端口，Nginx 提供 HTTPS。首次部署需要准备独立 `.env`、数据库、上传文件、Nginx 和证书，`deploy:test` 用于已初始化的服务器。

`hanbo-cert-renew.timer` 每天检查两次短期 IP 证书续期，成功后重载 Nginx；`hanbo-backup.timer` 每天 03:30（服务器 Asia/Shanghai 时区）备份数据库、文件和加密配置到同机 `backups`。更新前也自动备份，备份目录仅管理员可读。异地备份、告警和正式容量压测仍待配置。

需要交给其他电脑时才生成独立导入包：

```bash
corepack pnpm package:weapp --api-base-url http://YOUR_COMPUTER_LAN_IP:3000
```

导入命令输出的整个项目文件夹；产物保存在本地 `项目对接`，不纳入版本控制。导入包是生成当时的快照，不会随源码自动更新。

使用正式小程序账号上传平台时，在开发者工具点击“上传”，填写版本号和说明，再到小程序后台的版本管理设置体验版。代码变更仍需构建并重新上传，自动编译不能直接更新已上传的版本。供手机长期、异地使用前，须把 API 与数据库部署到云端，使用稳定的 HTTPS API 地址，并配置 request／uploadFile／downloadFile 合法域名；上传客户端不会部署后端。

微信小程序中进入“我的 → 人脸档案”，提交本人底照后可点击“开始活体人脸测试”，按随机顺序完成张嘴、闭眼动作。页面显示服务端确认的核验结果、相似度和云端请求编号。正式考勤仍要求底照审核通过和有效排班。

仅查看前端演示时运行 `corepack pnpm --filter @construction/miniprogram build:h5:demo`，产物在 `apps/miniprogram/dist`；浏览器演示不替代小程序真机活体核验。

## 验证

```bash
corepack pnpm test
corepack pnpm --filter @construction/api typecheck
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit
corepack pnpm --filter @construction/api test:face:video
```

`test:face:video` 使用独立的本地 PostgreSQL schema，验证 HTTP、权限、持久化和并发处理，腾讯云边界由测试替身提供。真实核验需另用手机调用已开通的腾讯云服务，可能产生调用费用。

源码仓库不包含 `.env`、数据库内容、用户照片、视频和本地上传文件。已有云端 HTTPS 测试服务；正式上线还需完成容量验收、域名备案、微信合法域名及隐私声明配置，并完成小程序审核发布。
