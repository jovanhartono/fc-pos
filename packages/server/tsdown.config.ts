import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "./src/rpc.ts",
    "./src/types/index.ts",
    "./src/schema/index.ts",
    "./src/schema/rules.ts",
  ],
  unbundle: true,
  dts: true,
  sourcemap: true,
  minify: true,
  fixedExtension: false,
});
