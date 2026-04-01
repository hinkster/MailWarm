import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: [
      // Map workspace packages to their TypeScript sources
      {
        find: /^@mailwarm\/shared\/(.*)/,
        replacement: resolve(__dirname, "../../packages/shared/$1"),
      },
      {
        find: "@mailwarm/database",
        replacement: resolve(__dirname, "../../packages/database/src/index.ts"),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test-helpers/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/server.ts",          // entry point — not unit-testable in isolation
        "src/workers/index.ts",   // entry point
      ],
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 80,
        statements: 80,
      },
    },
  },
});
