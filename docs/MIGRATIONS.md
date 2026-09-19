# FabHub Database Migrations

This is how database schema changes reach the live DB from now on. It replaces
the old "paste SQL into the Supabase SQL editor by hand" process — that process
is what caused the billing-payment data loss documented in migration 025 (code
shipped a `bank` column before the DB had it, every payment write silently
failed, the server table sat at 0 rows).

## The two rules that keep billing data safe

1. **DB before code.** A migration that adds or changes a column MUST be applied
   to the live DB *before* the frontend that writes it goes live. The CI workflow
   below enforces this: migrations run on merge to `main`, and the Vercel deploy
   is gated behind them.
2. **Never edit an applied migration.** Once a file is merged and applied, it is
   history. New change = new file. Editing an old one desyncs the runner from the
   live DB.

## Adding a new migration

```bash
# 1. Create a timestamped file (UTC timestamp prefix keeps ordering global).
supabase migration new short_description_of_change
#    -> creates supabase/migrations/<timestamp>_short_description_of_change.sql

# 2. Write idempotent SQL (ADD COLUMN IF NOT EXISTS, CREATE ... IF NOT EXISTS,
#    ALTER POLICY over DROP+CREATE where possible). Idempotency is your safety
#    net if a run is retried.

# 3. Test it against a throwaway branch/local before merging (see below).

# 4. Open a PR. CI runs `supabase db push --dry-run` and shows exactly what SQL
#    will hit the live DB. Review that diff like you'd review code.

# 5. Merge to main. CI applies it, THEN the deploy proceeds.
```

## One-time cutover (do this ONCE, by hand, before the first CI run)

The live DB already has today's schema (built by the old hand-paste process). We
must tell the runner "everything up to the baseline is already applied" so it
does NOT try to re-run it against live financial tables.

```bash
supabase login
supabase link --project-ref <fabhub-gmd project ref>

# Mark the baseline as applied WITHOUT running it:
supabase migration repair --status applied 20260101000000

# Confirm the runner and the live DB now agree (should show baseline as applied,
# nothing pending):
supabase migration list
```

After this, `supabase db push` will only ever apply NEW files added after the
baseline. The ~80 loose `supabase_migration_*.sql` files in the repo root stay
as historical record — they are NOT run by the runner and can be archived later.

## Before any billing-table migration

Financial tables (`billing_milestones`, `billing_payments`, `payables`,
`expenses`, `cash_positions`, `inflows`) get one extra step: **take a
point-in-time-recovery checkpoint / snapshot in the Supabase dashboard first.**
It costs 30 seconds and it's the difference between "revert" and "reconstruct."

## Post-deploy billing smoke check

After a release that touched billing, confirm writes actually reach the SERVER
(not just local IndexedDB — that's the failure mode that hides the 025 bug):

```bash
npm run smoke:billing
```

It writes a test payment via the anon key, asserts it comes back from the server,
then deletes it. If it fails, the deploy is broken even if the app "looks" fine.
