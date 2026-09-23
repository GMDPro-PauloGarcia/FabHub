#!/usr/bin/env node
/*
 * check-undef.js — fail the build on any undefined identifier in src/.
 *
 * check-imports.js only catches symbols defined in ANOTHER module. It misses
 * the in-file variant: a const declared inside one block/component and used
 * from a sibling one (e.g. BUDGET_ONLY used in the pending-addendum banner but
 * declared in a later IIFE), or an App-scoped helper (sendTelegramNotification,
 * syncProjectCard, Wrap) called from a child component it was never passed to.
 * The bundler accepts all of these and the app crashes with ReferenceError
 * only when that code path renders.
 *
 * CRA has no eslintConfig here, so its build never runs no-undef. This runs
 * just that rule (plus react/jsx-no-undef) using the parser react-scripts
 * already ships.
 *
 * Usage:  node scripts/check-undef.js
 * Exit 0 = clean, Exit 1 = undefined identifiers found.
 */
const path = require("path");
const { ESLint } = require("eslint");

(async () => {
  const eslint = new ESLint({
    cwd: path.join(__dirname, ".."),
    useEslintrc: false,
    overrideConfig: {
      root: true,
      parser: require.resolve("@babel/eslint-parser"),
      parserOptions: {
        requireConfigFile: false,
        babelOptions: { presets: [require.resolve("babel-preset-react-app/prod")] },
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      env: { browser: true, es2022: true, node: true },
      plugins: ["react"],
      rules: { "no-undef": "error", "react/jsx-no-undef": "error" },
    },
  });
  const results = await eslint.lintFiles(["src/**/*.{js,jsx}"]);
  const errors = results.reduce((n, r) => n + r.errorCount, 0);
  if (errors) {
    const fmt = await eslint.loadFormatter("stylish");
    console.error(fmt.format(results));
    console.error(`check-undef: ${errors} undefined identifier(s) — each is a runtime ReferenceError waiting to happen.`);
    process.exit(1);
  }
  console.log("check-undef: no undefined identifiers in src/.");
})().catch((e) => { console.error(e); process.exit(1); });
