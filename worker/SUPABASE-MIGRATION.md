# Changara Star Academy Worker — Supabase Migration

## 1. Database
Run `../supabase_worker_compat_migration.sql` in Supabase SQL Editor after the main schema migration.

## 2. Cloudflare Production secrets/variables
Required:
- `FRONTEND_URL`
- `JWT_SECRET` (secret)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret)

Keep the service-role key server-side only.

## 3. Install and deploy
From this `worker` directory:

```bash
npm install
npx wrangler deploy
```

## 4. Test
After deployment:

- `GET /api/test`
- `GET /api/db-health`
- `POST /api/setup-admin`
- `POST /api/admin/login`

Do not remove the old MongoDB database until the Supabase API has passed functional testing.
