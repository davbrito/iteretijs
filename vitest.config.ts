import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
    },
    uiBase: "/",
    setupFiles: "tests/setup.ts",
  },
});
