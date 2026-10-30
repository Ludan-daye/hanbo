// @ts-check
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { phoneApiOrigin } from "./weapp-api-origin.mjs";

const { values } = parseArgs({
  options: { "api-base-url": { type: "string" }, "test-login": { type: "boolean" } },
  strict: true,
  allowPositionals: false,
});
const apiUrl = new URL(phoneApiOrigin(values["api-base-url"]));
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const frontendRoot = join(repoRoot, "apps/miniprogram");
const nativeFaceEnabled = process.env.TARO_APP_FACE_NATIVE_SDK === "true";
const buildCommand = nativeFaceEnabled ? "build:weapp:face" : "build:weapp";
const packageCommand = nativeFaceEnabled ? "package:weapp:face" : "package:weapp";
const build = spawnSync("corepack", ["pnpm", "--filter", "@construction/miniprogram", buildCommand], {
  cwd: repoRoot,
  env: {
    ...process.env,
    TARO_APP_DATA_MODE: "http", TARO_APP_TEST_LOGIN: values["test-login"] === true ? "true" : "false",
    TARO_APP_API_BASE_URL: apiUrl.origin,
  },
  stdio: "inherit",
});
if (build.error) throw build.error;
if (build.status !== 0) throw new Error(`WeChat build failed with exit code ${build.status}. Fix the build error above before packaging.`);

/** @type {unknown} */
const project = JSON.parse(await readFile(join(frontendRoot, "project.config.json"), "utf8"));
if (typeof project !== "object" || project === null || !("appid" in project) || typeof project.appid !== "string") {
  throw new Error("apps/miniprogram/project.config.json is missing a valid appid.");
}
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const outputRoot = join(repoRoot, "项目对接");
const folderName = `${nativeFaceEnabled ? "微信活体核验导入包" : "微信开发者工具导入包"}_${stamp}`;
const packageRoot = join(outputRoot, folderName);
await mkdir(packageRoot, { recursive: true });
await cp(join(frontendRoot, "dist-weapp"), join(packageRoot, "miniprogram"), { recursive: true });
for (const name of ["project.config.json", "project.private.config.json"]) {
  await rm(join(packageRoot, "miniprogram", name), { force: true });
}
await writeFile(join(packageRoot, "project.config.json"), JSON.stringify({
  ...project,
  miniprogramRoot: "miniprogram/",
  projectname: "hanbo-local-ready",
}, null, 2) + "\n");
await writeFile(join(packageRoot, "project.private.config.json"), JSON.stringify({
  setting: { urlCheck: false },
}, null, 2) + "\n");
await writeFile(join(packageRoot, "运行说明.txt"), `瀚渤智慧工地 · 微信开发者工具导入包

API 地址：${apiUrl.origin}
AppID：${project.appid}
测试人员登录：${values["test-login"] === true ? "已启用，输入管理员单独提供的测试口令后选择角色。" : "未启用"}

1. 解压 ZIP，打开电脑上的“微信开发者工具”，选择导入项目。
2. 导入整个“${folderName}”文件夹，根目录应能看到 project.config.json。不要只导入 miniprogram 子文件夹。
3. 点击“编译”，通过微信登录后按页面补齐头像、昵称、真实姓名和手机号；首次使用再绑定本人档案。
4. 点击“预览”，用有权限的微信扫码。手机须能访问上方 API 地址；连接云端 API 时可使用移动网络，连接电脑局域网 API 时须处于同一 Wi-Fi。
5. 本地调试包已关闭域名校验；手机若仍提示域名限制，在右上角“…”开启调试后重新进入。
6. API 地址改变后，需要用新地址重新构建。此导入包是生成时的客户端快照；服务端和数据库由 API 所在的电脑或云服务器运行。

已配置本地环境时，在源码目录启动服务：
cd '${repoRoot.replace(/'/g, "'\\''")}'
docker compose up -d postgres
corepack pnpm --filter @construction/domain build
corepack pnpm --filter @construction/api build
corepack pnpm --filter @construction/api start:local

重新打包源码：
corepack pnpm ${packageCommand} --api-base-url ${apiUrl.origin}${values["test-login"] === true ? " --test-login" : ""}

${nativeFaceEnabled ? `活体核验接入要求：
客户端已包含腾讯云官方 Taro SDK。服务端还须配置已审核的微信小程序 RuleId、TENCENT_SECRET_ID、TENCENT_SECRET_KEY，并设置 FACE_DEV_STUB=false。密钥仅保存在 apps/api/.env。
RuleId 应选择“与上传照片比对”，开启活体检测；小程序 AppID 须与审核通过的业务流程一致。
工人先录入本人底照并同意人脸采集说明，管理员审核通过后才能发起活体核验。微信头像不能作为考勤底照。
SDK 的 request、uploadFile、downloadFile 合法域名需包含 https://faceid.qq.com、https://faceid.qcloud.com；socket 合法域名需包含 wss://faceid.qq.com。
活体测试请使用微信开发者工具“预览”扫码，按官方指引不要使用“真机调试”。
SDK 构建通过不代表腾讯云服务已开通，企业认证和行业准入需在腾讯云控制台确认。
官方文档：https://cloud.tencent.com/document/product/1007/135255
` : `视频动作活体接入要求：
服务端配置 TENCENT_FACE_MODE=VIDEO_ACTION、FACE_DEV_STUB=false，以及专用子账号的 TENCENT_SECRET_ID、TENCENT_SECRET_KEY。
本路线调用 GetActionSequence 和 LivenessCompare，不需要 H5 RuleId、身份证照片或原生一闪 SDK。
子账号最小权限配置位于源码 apps/api/config/tencent-face-policy.json；密钥只能存于 apps/api/.env。
工人先录入本人正面登记照，由其他授权管理员核对审核，通过后在打卡页按提示录制约 8 秒动作视频。
视频仅从前置摄像头现场录制，不提供相册视频入口；后端确认活体和本人比对通过后才能获得本次打卡凭证。
网络中断后先点“确认本次核验结果”，已完成的核验不会重复调用云端。
部署上线需配置后端 HTTPS request/uploadFile 合法域名，并在微信隐私保护指引中声明位置、相机、照片/视频和人脸核验用途。
真实云端核验仍需配置有效密钥、开通相应服务，并通过手机预览测试。
官方文档：https://cloud.tencent.com/document/api/1007/31819
`}

本包只包含编译后的小程序客户端，不包含服务端、数据库或 .env。
`);
const archivePath = join(outputRoot, `${folderName}.zip`);
const archive = spawnSync("zip", ["-qr", archivePath, folderName], { cwd: outputRoot, stdio: "inherit" });
if (archive.error) throw archive.error;
if (archive.status !== 0) throw new Error(`ZIP creation failed with exit code ${archive.status}. The import folder is available at ${packageRoot}.`);
const verify = spawnSync("unzip", ["-tq", archivePath], { stdio: "inherit" });
if (verify.error) throw verify.error;
if (verify.status !== 0) throw new Error(`ZIP integrity check failed with exit code ${verify.status}: ${archivePath}`);
console.info(JSON.stringify({ message: "WeChat import package ready", apiBaseUrl: apiUrl.origin, folder: packageRoot, zip: archivePath }, null, 2));
