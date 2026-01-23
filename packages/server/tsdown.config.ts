import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/rpc.ts", "./src/types/index.ts", "./src/schema/index.ts"],
  dts: true,
  sourcemap: true,
  minify: true,
});
