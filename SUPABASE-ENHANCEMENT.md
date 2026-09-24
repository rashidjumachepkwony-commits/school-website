# Supabase Enhancement — Changara Star Academy

This package is an **additive enhancement** of the existing application. It does not restore MongoDB and does not require rebuilding the frontend.

## What was added

- Supabase adapter under the existing Mongo-style route contract.
- Staff/student seed script using the supplied staff and student lists.
- Idempotent import by employee ID/admission number (safe to run again).
- Staff PINs and student PINs stored as salted hashes.
- Existing staff check-in/check-out routes preserved.
- Existing assessment routes preserved and extended for the current admin academics UI.
- Editable assessment subject/max-score configuration in Supabase.
- Assessment history/report compatibility endpoints.
- Clerk dashboard student/fee/payment API endpoints backed by Supabase.
- Holiday assignments continue to use the existing API and storage flow.
- Additional Supabase tables for application settings and clerk fee records.

## Supabase setup

1. Run `supabase/schema.sql` in Supabase SQL Editor.
2. If your project already has the base schema, run the file as-is; all additions use `IF NOT EXISTS` where appropriate.
3. Set Worker secrets:

```bash
cd worker
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put JWT_SECRET
```

4. Install dependencies and deploy:

```bash
npm install
npx wrangler deploy
```

5. Seed the supplied records from the project root:

```bash
SUPABASE_URL="https://YOUR_PROJECT.supabase.co" SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" node scripts/seed-supabase-data.mjs
```

On Windows PowerShell:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
node scripts/seed-supabase-data.mjs
```

The seed is idempotent. It updates matching staff/student records instead of creating duplicates.

## Important source-data note

The supplied staff source contains 17 identifiable staff IDs plus Edly Khamala without a staff ID. The seed uses `EDLY` as a clearly marked source-missing-ID login identifier rather than silently inventing T007/T008/T019.

The supplied student source contains 130 parseable student records. IDs absent from the source are not invented.
