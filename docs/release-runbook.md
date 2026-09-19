# FabHub Release Runbook

Keep this short and follow it every time. Two things make a release "standard":
publishing the code, and telling the team.

## Database changes go through the migration runner

Schema changes are NOT pasted into the SQL editor anymore — that process caused
the migration-025 billing-payment data loss. They go through
`supabase/migrations/` and are applied by CI **before** the code deploys. See
**docs/MIGRATIONS.md**. The rule: **DB before code.** After a billing-touching
release, run `npm run smoke:billing` to confirm payments reach the server.

## To release

1. **Publish the code** (however code changes reach the live app today).
2. **Bump the release row** so every open tab shows the "Reload now" banner:

```sql
update public.app_release
set version = '2026.09.16',              -- new version: use today's date, bump if same-day
    notes   = 'Short, plain: what changed + what to do.',
    released_at = now()
where id = 1;
```

Run it in the Supabase SQL editor (project: **fabhub-gmd**), or ask Claude to run it.
Within ~2 minutes (and instantly when they focus the tab) everyone sees the banner and
reloads onto the new code.

### Writing the `notes`
The team reads this verbatim. Keep it one or two plain sentences, action-first:
- Good: "Awarded totals fixed. Please click Reload."
- Good: "New billing export added. Reload to use it."
- Bad: "refactor wonValue helper + CO reconciliation" (means nothing to sales/ops).

You can also bump the row **without a code deploy** — e.g. after a data cleanup — to push a
"please refresh" message to everyone. That's the supported way to flush stale tabs.

## The data-integrity rule everyone must follow

**Cancel, never delete.** To remove a deal/project/CO, set its stage to **Cancelled** or
**Did Not Win** (or a change order to **Rejected**) — do NOT hard-delete.

Why: a hard-deleted record leaves nothing on the server, so a teammate's out-of-date tab
re-uploads its stale copy and it "comes back" for everyone (the resurrection bug). A
cancelled record stays on the server, so the server copy always wins and it can't
resurrect. Cancelled/Rejected records are already excluded from all value totals.

## How the banner works (for whoever maintains this)

- Single-row table `public.app_release` (`version`, `notes`, `released_at`), RLS: readable
  by everyone, writable only by the service role (dashboard / Claude) — the team can't spoof it.
- `src/UpdateBanner.jsx`, mounted in `src/index.js` beside `<App/>`. It records the version
  seen at boot, re-checks every 2 min and on focus, and banners when the row's version
  changes. Reload = `window.location.reload()` (no service worker, so fresh code loads and
  the stale local cache is flushed).
- It never blocks or crashes the app; if Supabase is unreachable it simply shows nothing.
