#!/usr/bin/env node
/*
 * smoke.js — the runtime counterpart to check-imports.js.
 *
 * check-imports catches missing cross-module imports statically; this actually
 * BOOTS the production bundle in a real browser and asserts the app renders
 * without throwing. It is the cheapest possible guard against the whole class
 * of "builds fine, white-screens on load" regressions — a bad import that the
 * static checker misses, a top-level throw, a bootstrap crash — none of which a
 * successful `npm run build` can detect.
 *
 * With no Supabase env configured the app boots to its login screen (the client
 * is null and RLS is never reached), which is exactly what we want: a clean,
 * network-free render we can assert against. The test passes when #root has real
 * content, the error-boundary text is absent, and no uncaught page error fired.
 *
 * Uses the `playwright` library (already a devDependency) directly — no test
 * runner, no @playwright/test, no config. Serves build/ via serve-build.js.
 *
 * Usage:  npm run build && npm run smoke
 * Requires the Chromium browser binary (CI: npx playwright install chromium).
 */
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 4123;
const BASE = `http://localhost:${PORT}`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (_) { /* not up yet */ }
    await wait(300);
  }
  throw new Error(`server did not come up at ${url} within ${timeoutMs}ms`);
}

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'serve-build.js'), String(PORT)], {
    stdio: 'inherit',
  });
  let browser;
  const fail = async (msg) => {
    console.error(`\n✗ smoke: ${msg}`);
    if (browser) await browser.close().catch(() => {});
    server.kill();
    process.exit(1);
  };

  try {
    await waitForServer(BASE);
    // In CI, `npx playwright install chromium` provides the matching binary and
    // the default launch works. On environments that pre-install a different
    // Chromium revision, set PLAYWRIGHT_CHROMIUM_EXECUTABLE to that binary to
    // avoid a version-mismatch "Executable doesn't exist" failure.
    const execOverride = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
    browser = await chromium.launch(execOverride ? { executablePath: execOverride } : {});
    const page = await browser.newPage();

    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message || String(e)));

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
    // Give React a beat to mount and run effects.
    await wait(1500);

    const rootText = (await page.locator('#root').innerText().catch(() => '')).trim();
    if (!rootText) return fail('#root rendered empty — the app did not mount (white screen).');

    const crashVisible = await page.getByText('Something went wrong').count();
    if (crashVisible > 0) return fail('the crash error boundary is showing — the app threw during render.');

    if (pageErrors.length) return fail(`uncaught page error(s) on load:\n  - ${pageErrors.join('\n  - ')}`);

    console.log('\n✓ smoke: app booted and rendered with no uncaught errors.');
    await browser.close();
    server.kill();
    process.exit(0);
  } catch (e) {
    await fail(e.message || String(e));
  }
})();
