# 工人端 UI v3：本地运行与审阅

工人 UI 已整合到主线，原审阅分支为 `worker-ui`。本说明用于本地界面预览；当前业务与部署状态见仓库首页。GitHub 推送不会自动发布微信体验版。

## 本次更新（2026-11-12）

本分支以主线 `b733a71` 为基础，保留班组任务、安全交底、临时用工和原考勤规则，继续补齐工人端的统一样式与交互反馈。

- 登录的长期／临时用工入口、我的任务、打卡安全交底和完工补卡采用统一的字号、间距与按钮样式；任务优先显示，安全内容仍完整保留。
- 长页固定返回入口；打卡期间持续显示项目、日期、时点和临时任务名称。
- 临时任务按实际进度提供开工／完工入口；未到或超过允许开工时段时先说明原因，避免进入无效拍照流程。服务端仍决定最终资格和计时。
- 先提示阅读并确认本次安全交底，确认后再提示人脸核验；保存失败时保留原有有效凭证重试路径。
- 考勤日汇总不再仅因日期为今天就标成“进行中”，改为“今日记录”。首页继续按现有完整安排判断完成状态，缺卡、异常和批准补卡分别保留。
- 恢复用工登记中的健康、保险问题标题，保留原字段、主动选择和校验。

这些更新没有新增后端 API、业务模块、角色权限或数据库字段。默认运行模式仍由原环境配置决定；下面的 Demo 构建用于快速看 UI。

## 本版内容

- 统一普通工人的首页、项目列表与详情、打卡、考勤记录、补卡、个人维护及首次登记页面。
- 首页记住当前项目，提醒和明细按需展开；考勤可在页内切换项目；用工登记分四步，保留原字段及校验。
- Demo 登录页新增「直接体验工人端」：准备缺失的虚构工人资料，直接进入首页；不覆盖已有演示登记、照片或其他账号数据。
- 保留首次入场的登录、绑定、登记与人脸页面及原校验；新版登录入口按长期／临时用工接续。快捷体验仅在 Demo 模式可用。
- 未新增后端 API、业务模块、角色权限或考勤计算规则。管理业务页面不在此次视觉改版范围。

## 快速看 UI（Demo）

需要 Node.js 22、Corepack／pnpm 9.15.4 和微信开发者工具。请在独立目录克隆，避免覆盖已有工作区。

```sh
git clone --branch worker-ui https://github.com/Ludan-daye/hanbo.git hanbo-worker-ui-v3
cd hanbo-worker-ui-v3
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @construction/domain build
```

Windows PowerShell：

```powershell
$env:TARO_APP_DATA_MODE = "demo"
$env:TARO_APP_FACE_NATIVE_SDK = "false"
corepack pnpm --filter @construction/miniprogram build:weapp
```

macOS／Linux：

```sh
TARO_APP_DATA_MODE=demo TARO_APP_FACE_NATIVE_SDK=false corepack pnpm --filter @construction/miniprogram build:weapp
```

1. 微信开发者工具导入 `apps/miniprogram` 文件夹；配置已指向 `dist-weapp/`。使用已获本项目权限的微信账号及项目 AppID。
2. 编译后点击 **「直接体验工人端」**，无需填写手机号、身份证或邀请码。
3. 查看 **首页 → 模拟打卡 → 考勤记录**，以及项目、补卡和「我的」。现场照片按页面提示操作，定位和人脸核验是模拟。
4. 直接体验入口会准备缺失的虚构登记资料。首次入场验收需使用指定测试账号及未完成资料状态，检查登录、绑定、登记和人脸接续；它与快速查看 UI 分开验收。

Demo 资料只保存在各自设备，不会同步给其他成员，也不会写入真实考勤。GitHub 分支用于共享源码；手机查看当前编译版本需自行在微信开发者工具生成预览，团队扫码验收另行使用微信体验版。

## 正式服务边界

真实 API、微信登录、定位、人脸和考勤入库需在指定测试后端另行联调。不要将 Demo 通过当作真实服务验收通过。切回真实服务前移除 `TARO_APP_DATA_MODE=demo` 并重新构建；沿用项目原有环境及 SDK 配置。

## 检查

```sh
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit
corepack pnpm --filter @construction/miniprogram test
```

- 2026-11-01 原生微信开发者工具已检查：新快捷入口、直接进入首页、打卡项目加载、考勤记录加载、退出后完整登记入口。
- 2026-11-12：小程序完整测试 208 项及 TypeScript 检查通过；微信和 H5 Demo 构建通过。微信开发者工具定向检查通过：已完成首页与考勤反馈、任务名称固定展示、交底确认前后指令切换。以上使用虚构本地数据，不代替真实定位、人脸服务、弱网和真机适用性验收。
- 发布分支前复查 TypeScript、小程序测试和微信构建。补卡审批测试固定日期，避免运行当天是星期几影响用例。
- `output/`、旧二维码、机器存储备份和临时验收脚本不随分支交付。
- 工人样式中的大写 `Px` 用于保持逻辑像素尺寸；`.prettierignore` 已保护这些 SCSS，勿批量改为小写 `px`。
