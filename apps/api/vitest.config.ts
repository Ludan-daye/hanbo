import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const domainSource = (file: string): string =>
  fileURLToPath(new URL(`../../packages/domain/src/${file}`, import.meta.url));

export default defineConfig({
  // The @construction/domain package resolves its runtime ("default") exports to
  // ./dist/*.js, which only exist after a build. Tests run against the TypeScript
  // source instead — consistent with the package's "types" condition (-> src) and
  // avoiding a build step plus stale-dist risk. Production (nest build / node dist)
  // still uses the compiled dist via the package exports map.
  resolve: {
    alias: [
      { find: /^@construction\/domain\/attendance\.js$/, replacement: domainSource("attendance.ts") },
      { find: /^@construction\/domain\/roles\.js$/, replacement: domainSource("roles.ts") },
      { find: /^@construction\/domain$/, replacement: domainSource("index.ts") }
    ]
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"]
  }
});
