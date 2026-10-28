import { glob } from "glob";
import { fileURLToPath } from "node:url";
import { defineConfig, type ViteUserConfig } from "vitest/config";
import dts from "unplugin-dts/vite";
import pkg from "./package.json" with { type: "json" };

const sourceDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig(async () => {
  const inputs = await glob("**/*.ts?(x)", {
    ignore: "**/*.test.*",
    nodir: true,
    absolute: true,
    cwd: sourceDir,
  });

  return {
    plugins: [
      dts({
        exclude: ["tests/*"],
        tsconfigPath: fileURLToPath(new URL("./tsconfig.json", import.meta.url)),
      }),
    ],
    build: {
      lib: {
        entry: inputs,
        formats: ["es", "cjs"],
      },
      emptyOutDir: true,
      minify: false,
      sourcemap: true,
      rolldownOptions: {
        external: Object.keys({
          ...pkg["dependencies"],
          ...pkg["peerDependencies"],
        }),
      },
    },
    test: {
      coverage: {
        enabled: true,
      },
      uiBase: "/",
      setupFiles: "tests/setup.ts",
    },
  } satisfies ViteUserConfig;
});
