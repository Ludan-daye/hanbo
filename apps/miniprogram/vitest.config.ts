import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@tarojs\/taro$/, replacement: fileURLToPath(new URL("./test/taro-mock.ts", import.meta.url)) }
    ]
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"]
  }
});
