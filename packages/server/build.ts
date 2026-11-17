await Bun.build({
  entrypoints: ["./src/index.ts"],
  env: "disable",
  outdir: "./dist",
  minify: true,
  target: "bun",
  bytecode: true,
});

// oxlint-disable-next-line unicorn/require-module-specifiers -- top-level await needs a module
export {};
