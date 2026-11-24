import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globals: true,
    // integration tests share one Postgres database and some clean whole tables
    // (e.g. drive-integration wipes DriveFile); running files in parallel made Phase 13 tests flaky
    fileParallelism: false,
  },
});
