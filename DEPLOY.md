# Deployment Guide - Changara Star Academy

## Prerequisites

1. **Supabase project** - `gspikjhqvklixzdnlwhn` (https://supabase.com/dashboard/project/gspikjhqvklixzdnlwhn)
2. **Cloudflare account** - For the Worker API backend
3. **Netlify** - For the static frontend
4. **Git** - Repository pushed to GitHub

> **Database note:** The system was migrated from MongoDB Atlas to Supabase
> PostgreSQL. The Worker talks to Supabase via `@supabase/supabase-js` using a
> MongoDB-compatible adapter (`worker/src/db.js`). See
> `supabase/schema.sql` and `scripts/migrate-mongodb-to-supabase.js`.

---

## Step 1: Create the Supabase schema

1. Open the [Supabase SQL Editor](https://supabase.com/dashboard/project/gspikjhqvklixzdnlwhn/sql/new)
2. Paste the contents of `supabase/schema.sql` and click **Run**
3. Copy the **service_role** key: Project Settings → API → `service_role` (secret — backend only)

## Step 2: Migrate existing data (one-time, if MongoDB still has data)

```bash
cd worker && npm install && cd ..
cd worker && npm install mongodb --no-save && cd ..
set MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.mongodb.net/csa-school?retryWrites=true&w=majority
set SUPABASE_URL=https://gspikjhqvklixzdnlwhn.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=<service_role key>
node scripts/migrate-mongodb-to-supabase.js --dry-run   # preview first
node scripts/migrate-mongodb-to-supabase.js             # then migrate
```

The script is read-only on MongoDB and upserts into Supabase (safe to re-run).

## Step 3: Deploy the Cloudflare Worker (API Backend)

```bash
# 1. Navigate to worker directory
cd worker

# 2. Install dependencies (@supabase/supabase-js, wrangler)
npm install

# 3. Set the Supabase service-role key secret (NEVER in code/frontend)
node node_modules/wrangler/bin/wrangler.js secret put SUPABASE_SERVICE_ROLE_KEY

# 4. Set JWT secret (for admin auth)
node node_modules/wrangler/bin/wrangler.js secret put JWT_SECRET
# Use: openssl rand -base64 32  OR  any random string

# 5. Set Cloudinary credentials
node node_modules/wrangler/bin/wrangler.js secret put CLOUDINARY_CLOUD_NAME
# Your Cloudinary cloud name from https://cloudinary.com/console

node node_modules/wrangler/bin/wrangler.js secret put CLOUDINARY_API_KEY
# Your Cloudinary API key (numeric string)

node node_modules/wrangler/bin/wrangler.js secret put CLOUDINARY_API_SECRET
# Your Cloudinary API secret (copy from Cloudinary console)

# 6. Deploy the Worker
node node_modules/wrangler/bin/wrangler.js deploy
```

After deployment, verify:
- `https://csa-api.rashidjumachepkwony.workers.dev/api/test` → `{"success": true, ...}`
- `https://csa-api.rashidjumachepkwony.workers.dev/api/db-health` → `{"success": true, "status": "ok", "dbName": "supabase", ...}`

### Rollback safety
The MongoDB Atlas cluster is NOT touched. To roll back, redeploy the previous
Worker version (`wrangler versions rollback`) — it used the MongoDB driver and
the data is still intact.

---

## Step 4: Deploy to Cloudflare Pages (Static Frontend)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Pages**
2. Click **Create** → **Connect to Git**
3. Select your repository
4. Configure build settings:
   - **Framework preset**: None
   - **Build command**: (leave empty)
   - **Publish directory**: `.`
5. Click **Save and Deploy**

Your site will be available at `<PROJECT_NAME>.pages.dev`

For custom domain: Pages → **Custom domains** → Add `changarastaracademy.co.ke`

---

## Step 5: Deploy to Netlify (Static Frontend)

### 3a. Configure the Worker URL in index.html

Open `index.html` and add the Worker URL before the config script:

```html
<script>
  window.__API_BASE_URL__ = 'https://csa-api.rashidjumachepkwony.workers.dev';
</script>
<script src="js/config.js"></script>
```

### 3b. Deploy via CLI

```bash
# Install Netlify CLI globally
npm install -g netlify-cli

# Login to Netlify
netlify login

# Deploy (first time - interactive, links to site)
netlify deploy --dir=. --prod
```

Or deploy via Git:
1. Go to [Netlify](https://app.netlify.com) → **Add new site** → **Import an existing project**
2. Connect your Git repo
3. **Build settings**: Build command = `(empty)`, Publish directory = `.`
4. Click **Deploy site**

---

## Supabase Security Notes

- RLS is enabled on every table with **no public policies** — only the backend
  Worker (service_role key) can read/write school data. See `supabase/schema.sql`.
- **Never** put the `service_role` key in frontend JavaScript, Netlify
  environment variables, or any public repository file.
- The `SUPABASE_URL` itself is public (it is just the project hostname); the
  `service_role` key is the secret.

---

## Post-Deployment

1. Register your first admin (if Supabase `admins` table is empty):
   ```bash
   curl -X POST https://your-worker-url/api/setup-admin \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","email":"admin@school.com","password":"admin123","fullName":"Admin"}'
   ```

2. Test the API:
   ```bash
   curl https://your-worker-url/api/test
   curl https://your-worker-url/api/db-health
   ```

3. Upload a logo/image via the admin CMS to test Cloudinary storage.

---

## Environment Variables Summary

| Variable | Where | Value |
|----------|-------|-------|
| `SUPABASE_URL` | wrangler.toml (var) | `https://gspikjhqvklixzdnlwhn.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker secret | Supabase service_role key |
| `JWT_SECRET` | Worker secret | Your secret key |
| `CLOUDINARY_CLOUD_NAME` | Worker secrets | Your Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Worker secrets | Your Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Worker secrets | Your Cloudinary API secret |
| `FRONTEND_URL` | wrangler.toml | `https://changarastaracademy.co.ke` |
| `MONGODB_URI` | Local only (legacy `server.js` / one-time migration script) | `mongodb+srv://...` |

---

## Rollback

To redeploy an older Worker version:
```bash
cd worker && npx wrangler versions -> list
npx wrangler versions -> rollback <version-id>
```
