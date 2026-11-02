# 工人端 UI v3：本地运行与审阅

分支：`codex/worker-ui-v3`。业务基线：`ebeb73e`。此分支用于协作审阅，未合并主分支；GitHub 推送不会自动发布微信体验版或更新测试服务器。

## 本版内容

- 统一普通工人的首页、项目列表与详情、打卡、考勤记录、补卡、个人维护及首次登记页面。
- 首页记住当前项目，提醒和明细按需展开；考勤可在页内切换项目；用工登记分四步，保留原字段及校验。
- Demo 登录页新增「直接体验工人端」：准备缺失的虚构工人资料，直接进入首页；不覆盖已有演示登记、照片或其他账号数据。
- 保留「体验首次登录与绑定」，仍可完整测试首次入场。快捷入口在真实服务模式不可用，原登录、绑定、登记、人脸及权限要求保留。
- 未新增后端 API、业务模块、角色权限或考勤计算规则。管理业务页面不在此次视觉改版范围。

## 快速看 UI（Demo）

需要 Node.js 22、Corepack／pnpm 9.15.4 和微信开发者工具。请在独立目录克隆，避免覆盖已有工作区。

```sh
git clone --branch codex/worker-ui-v3 https://github.com/Ludan-daye/hanbo.git hanbo-worker-ui-v3
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
4. 如需体验完整登记，可在「我的」退出并切换演示身份，再选「体验首次登录与绑定」。

Demo 资料只保存在各自设备，不会同步给其他成员，也不会写入真实考勤。GitHub 分支用于共享源码；手机查看当前编译版本需自行在微信开发者工具生成预览，团队扫码验收另行使用微信体验版。

## 正式服务边界

真实 API、微信登录、定位、人脸和考勤入库需在指定测试后端另行联调。不要将 Demo 通过当作真实服务验收通过。切回真实服务前移除 `TARO_APP_DATA_MODE=demo` 并重新构建；沿用项目原有环境及 SDK 配置。

## 检查

```sh
corepack pnpm --filter @construction/miniprogram exec tsc --noEmit
corepack pnpm --filter @construction/miniprogram test
```

- 2026-11-01 原生微信开发者工具已检查：新快捷入口、直接进入首页、打卡项目加载、考勤记录加载、退出后完整登记入口。
- 发布分支前复查 TypeScript、小程序测试和微信构建。补卡审批测试固定日期，避免运行当天是星期几影响用例。
- `output/`、旧二维码、机器存储备份和临时验收脚本不随分支交付。
- 工人样式中的大写 `Px` 用于保持逻辑像素尺寸；`.prettierignore` 已保护这些 SCSS，勿批量改为小写 `px`。
