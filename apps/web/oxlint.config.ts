import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

import root from "../../oxlint.config.ts";

export default defineConfig({
  extends: [core, react, tanstack],
  ignorePatterns: core.ignorePatterns,
  rules: {
    ...root.rules,
    // openDialog and openSheet take `content` and `footer` as render callbacks.
    "react/no-unstable-nested-components": ["error", { allowAsProps: true }],
  },
});
