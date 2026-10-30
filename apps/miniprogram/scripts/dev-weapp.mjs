// @ts-check
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { phoneApiOrigin } from "./weapp-api-origin.mjs";

const { values } = parseArgs({
  options: { "api-base-url": { type: "string" }, "test-login": { type: "boolean" } },
  strict: true,
  allowPositionals: false,
});
const origin = phoneApiOrigin(values["api-base-url"]);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
console.info(JSON.stringify({
  event: "weapp_watch_start",
  apiBaseUrl: origin,
  project: resolve(root, "apps/miniprogram"),
  instructions: "Open this project directory once in WeChat DevTools. Keep this terminal running; saving source files rebuilds dist-weapp automatically. Phone preview still requires DevTools Preview or a newly uploaded experience version.",
}, null, 2));
const child = spawn("corepack", ["pnpm", "--filter", "@construction/miniprogram", "dev:weapp"], {
  cwd: root,
  env: { ...process.env, TARO_APP_DATA_MODE: "http", TARO_APP_TEST_LOGIN: values["test-login"] === true ? "true" : "false", TARO_APP_API_BASE_URL: origin },
  stdio: "inherit",
});
child.on("error", (error) => { throw error; });
child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.exitCode = signal === "SIGINT" ? 130 : 143;
    return;
  }
  if (code !== 0) throw new Error(`WeChat watch build exited with code ${code}. Check the build output above.`);
});
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
