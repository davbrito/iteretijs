import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import pkg from "./package.json" assert { type: "json" };

export default defineConfig(async ({ mode }) => {
  const inputs = await getExports();

  return {
    plugins: [dts()],
    build: {
      emptyOutDir: true,
      minify: false,
      sourcemap: true,
      rollupOptions: {
        external: Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }),
        input: inputs,
        preserveEntrySignatures: "strict",
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "[name].[hash].js",
          assetFileNames: "[name].[ext]",
          format: "es",
        },
      },
    },
  };
});

async function getExports() {
  const sourceDir = resolve(__dirname, "src");
  const files = await readdir(sourceDir, { withFileTypes: true });

  return files
    .filter(
      (file) =>
        file.isFile() &&
        /\.tsx?$/.test(file.name) &&
        !/\.test\.tsx?$/.test(file.name)
    )
    .map((file) => resolve(sourceDir, file.name));
}
