# Changara Star Academy — Supabase + Cloudflare Worker

The application uses Supabase for persistent data. The Cloudflare Worker is the production API and the root `server.js` is a local development bridge to the same Worker route layer.

## Supabase
Run `supabase/schema.sql` in the Supabase SQL Editor. Import the school registers with `scripts/import-registers.mjs`.

## Production secrets
Set these in the `worker` directory with Wrangler:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`

Keep the Supabase service-role key server-side only.

## Local development
Copy `.env.example` to `.env` and set the same server-side values, then from the project root run:

```bash
npm run dev
```

Open `http://localhost:5000`. API requests under `/api/*` are handled by the same Supabase-backed Worker code used in production.

## Worker deployment
From `worker`:

```bash
npm install
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put JWT_SECRET
npx wrangler deploy
```

## Basic API checks
After local start or deployment, test:

- `GET /api/test`
- `GET /api/db-health`
- `POST /api/setup-admin`
- `POST /api/admin/login`

No MongoDB/Mongoose runtime is required by the active application.
