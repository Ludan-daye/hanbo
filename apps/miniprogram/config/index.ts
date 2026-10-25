import { defineConfig, type UserConfigExport } from "@tarojs/cli";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import devConfig from "./dev";
import prodConfig from "./prod";

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<"webpack5">(async (merge) => {
  const nativeFaceEnabled: boolean = process.env.TARO_ENV === "weapp" && process.env.TARO_APP_FACE_NATIVE_SDK === "true";
  if (nativeFaceEnabled && (!existsSync(resolve(__dirname, "../src/verify_mpsdk/main.js")) || !existsSync(resolve(__dirname, "../src/verify_mpsdk/index/index.json")))) {
    throw new Error("Download the current Taro SDK from the approved Tencent FaceID RuleId console into apps/miniprogram/src/verify_mpsdk before enabling TARO_APP_FACE_NATIVE_SDK=true.");
  }
  const baseConfig: UserConfigExport<"webpack5"> = {
    projectName: "miniprogram",
    date: "2026-6-9",
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    sourceRoot: "src",
    outputRoot: process.env.TARO_ENV === "weapp" ? "dist-weapp" : "dist",
    plugins: ["@tarojs/plugin-generator"],
    defineConstants: {
      // Inject the API base URL as a build-time literal so the browser bundle never
      // references `process` at runtime. Taro does not auto-replace this TARO_APP_* var here.
      "process.env.TARO_APP_API_BASE_URL": JSON.stringify(
        process.env.TARO_APP_API_BASE_URL || "http://localhost:3000",
      ),
      "process.env.TARO_APP_DATA_MODE": JSON.stringify(process.env.TARO_APP_DATA_MODE || "http"),
      "process.env.TARO_APP_FACE_NATIVE_SDK": JSON.stringify(nativeFaceEnabled ? "true" : "false"),
    },
    copy: {
      patterns: nativeFaceEnabled ? [{ from: "src/verify_mpsdk/", to: "dist-weapp/verify_mpsdk/" }] : [],
      options: {},
    },
    framework: "react",
    compiler: "webpack5",
    cache: {
      enable: false, // Webpack 持久化缓存配置，建议开启。默认配置请参考：https://docs.taro.zone/docs/config-detail#cache
    },
    mini: {
      compile: {
        exclude: [resolve(__dirname, "../src/verify_mpsdk")],
      },
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: "module", // 转换模式，取值为 global/module
            generateScopedName: "[name]__[local]___[hash:base64:5]",
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin("tsconfig-paths").use(TsconfigPathsPlugin);
      },
    },
    h5: {
      publicPath: "/",
      staticDirectory: "static",
      output: {
        filename: "js/[name].[hash:8].js",
        chunkFilename: "js/[name].[chunkhash:8].js",
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: "css/[name].[hash].css",
        chunkFilename: "css/[name].[chunkhash].css",
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: "module", // 转换模式，取值为 global/module
            generateScopedName: "[name]__[local]___[hash:base64:5]",
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin("tsconfig-paths").use(TsconfigPathsPlugin);
      },
    },
    rn: {
      appName: "taroDemo",
      postcss: {
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
        },
      },
    },
  };

  if (process.env.NODE_ENV === "development") {
    // 本地开发构建配置（不混淆压缩）
    return merge({}, baseConfig, devConfig);
  }
  // 生产构建配置（默认开启压缩混淆等）
  return merge({}, baseConfig, prodConfig);
});
