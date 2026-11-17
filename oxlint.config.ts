import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  globals: { Bun: "readonly" },
  ignorePatterns: core.ignorePatterns,
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx"],
      rules: {
        // A suite loads the throwaway database with a bare import before
        // anything else, then imports its helpers from the same file.
        "import/no-duplicates": "off",
      },
    },
  ],
  rules: {
    // `x == null` is the codebase's deliberate null-or-undefined check;
    // spelling out both halves at every site would only add noise.
    eqeqeq: ["error", "always", { null: "ignore" }],
    // Order writes run one statement after another inside a transaction on
    // purpose: a redemption cap or a refund reversal must see the previous
    // row's result before the next runs, and S3 pages by continuation token.
    "no-await-in-loop": "off",
    "no-eq-null": "off",
    // i++ in seed and code-generation loops; rewriting them buys nothing.
    "no-plusplus": "off",
    // Hono's `next` is not a Node callback: a middleware awaits it and returns
    // nothing, so the rule's `return next()` advice does not fit.
    "node/callback-return": "off",
    // Sorting select() keys reorders the columns Postgres returns, and the
    // reports repositories map rows back by position, so the money reports
    // would read amounts as dates. Keep key order as written.
    "sort-keys": "off",
  },
});
