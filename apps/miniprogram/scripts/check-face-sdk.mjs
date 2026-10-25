import { existsSync, readFileSync } from "node:fs";

/** Validate the official SDK package before Taro can swallow configuration errors. */
const sdkRoot = new URL("../src/verify_mpsdk/", import.meta.url);
for (const file of [
  "main.js",
  "index/index.js",
  "index/index.json",
  "index/index.wxml",
]) {
  if (!existsSync(new URL(file, sdkRoot))) {
    throw new Error(
      "Install the pinned official Taro SDK with corepack pnpm --filter @construction/miniprogram face:sdk:install, or download the Taro package from your approved Tencent FaceID console into apps/miniprogram/src/verify_mpsdk. See https://cloud.tencent.com/document/product/1007/135255.",
    );
  }
}
const project = JSON.parse(
  readFileSync(new URL("../project.config.json", import.meta.url), "utf8"),
);
if (
  typeof project.appid !== "string" ||
  !/^wx[0-9a-f]{16}$/.test(project.appid)
) {
  throw new Error(
    "Set the real WeChat mini-program AppID in apps/miniprogram/project.config.json before building the native face release.",
  );
}
