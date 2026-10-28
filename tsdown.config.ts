import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/async.ts", "src/stream.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  minify: false,
  clean: true,
  fixedExtension: false,
});
