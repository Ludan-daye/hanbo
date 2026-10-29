# 瀚渤智慧工地

整体功能范围、当前状态、开发顺序与验收标准统一见 [功能总览与实施计划](docs/功能总览与实施计划.md)。后续需求和进度以该文档为入口。

工地人员与考勤管理系统，采用 pnpm monorepo：

- `apps/miniprogram`：Taro 4.2、React、TypeScript，支持微信小程序与 H5。
- `apps/api`：NestJS、Prisma、PostgreSQL，提供登录、身份绑定、项目人员、排班、考勤、补卡和报表接口。
- `packages/domain`：角色权限与考勤规则。
- `docs/design`：业务与架构设计。

微信登录后由用户选择头像、填写昵称，并通过邀请码绑定人员档案。人脸登记照支持管理员审核；打卡通过定位、动作活体和登记照比对完成核验。人脸档案内另有独立活体测试入口，不要求当日排班，不生成考勤凭证或考勤记录。

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

将 `apps/miniprogram/project.config.json` 中的 `appid` 设置为自己的小程序 AppID，保持后端运行，使用手机可访问的 API 地址打包：

```bash
corepack pnpm package:weapp --api-base-url http://YOUR_COMPUTER_LAN_IP:3000
```

导入命令输出的整个项目文件夹，在微信开发者工具中编译并点击“预览”。局域网测试时手机与电脑连接同一 Wi-Fi，使用小程序开发者或体验者微信扫码。打包产物保存在本地 `项目对接`，不纳入版本控制。

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

源码仓库不包含 `.env`、数据库内容、用户照片、视频和本地上传文件。正式上线还需部署 HTTPS 后端、配置微信合法域名及隐私声明，并完成小程序审核发布。
