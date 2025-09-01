await Bun.build({
  entrypoints: ["./src/index.ts"],
  env: "disable",
  outdir: "./dist",
  minify: true,
  target: "bun",
  bytecode: true,
});

export {};
