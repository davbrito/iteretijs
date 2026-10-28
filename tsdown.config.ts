import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/async.ts", "src/stream.ts"],
  format: "esm",
  dts: true,
  sourcemap: true,
  minify: false,
  clean: true,
  exports: {
    customExports(exports) {
      // keep the existing `iteretijs/sync` subpath as an alias of the root entry
      exports["./sync"] = exports["."];
      return exports;
    },
  },
});
