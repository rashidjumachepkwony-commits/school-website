# Deployment Guide - Changara Star Academy

## Architecture

| Piece | Where it lives | Notes |
|---|---|---|
| Source code / version control | GitHub - `rashidjumachepkwony-commits/school-website` | production branch `main` |
| Public website (frontend) | **Cloudflare Pages** - project `csa-frontend` | built from `dist/` |
| API backend | **Cloudflare Worker** - `csa-api` | `https://csa-api.rashidjumachepkwony.workers.dev` |
| Database | **Supabase** (PostgreSQL) | never re-migrate; no MongoDB |
| Media uploads | **Cloudinary** | optional, only for file uploads |
| Public domain | `changarastaracademy.co.ke` | custom domain on Pages |

The frontend is plain static HTML/CSS/JavaScript. There is **no framework and no
bundler**; every page is a real file in the repository.

---

## Why the frontend is built into `dist/`

The repository root also contains the Worker source, SQL migrations, database
scripts, the private student register and a local `.env` that holds a real
Supabase service-role key and the JWT secret. Publishing the root would expose
all of that.

So the frontend is assembled by an explicit allow-list script rather than by
publishing the root:

```bash
npm run build:pages          # build dist/
npm run build:pages:check    # build, then fail if anything looks like a secret
node scripts/verify-pages-build.mjs   # verify dist/ resolves and is safe
```

`scripts/build-pages.mjs` copies **only**:
- every top-level `*.html` page
- `css/`, `js/`, `images/`, `uploads/`
- `sitemap.xml`, `robots.txt` (if present), `google120463af0d0325f6.html`
- `_headers` and `_redirects`

Everything else is left behind: `worker/`, `scripts/`, `tests/`, `data/`,
`supabase/`, `node_modules/`, `.env`, `server.js`, `*.json`, `*.toml`, `*.xlsx`,
`wrangler*`, `.netlify/`, `.wrangler/`, `.kilo/`, and the `*.mjs` dev scripts.
Because it is an allow-list, a newly added secret at the repo root cannot leak
by accident.

`dist/` is already in `.gitignore`.

---

## Cloudflare Pages dashboard settings

Connect the repository at **Cloudflare Dashboard -> Workers & Pages -> Create ->
Pages -> Connect to Git**.

| Setting | Value | Why |
|---|---|---|
| Project name | `csa-frontend` | already created |
| Production branch | `main` | confirmed from the repo |
| Framework preset | **None** | no framework, no `package.json` framework field |
| Build command | `npm run build:pages` | assembles `dist/` from the allow-list |
| Build output directory | `dist` | matches the build script |
| Node version | 18 or newer (default is fine) | only used to run the build script |
| Environment variables | **none** | see below |

**No environment variables are required for the frontend build.** The Worker URL
is a constant in `js/config.js`. Do **not** add `SUPABASE_SERVICE_ROLE_KEY`,
`JWT_SECRET` or any Cloudinary secret as Pages build variables - they belong on
the Worker only. Any value placed in a Pages build variable is not secret from
the browser, and would also end up in the build output.

The only build dependency is the repo's own `devDependencies` (`xlsx`), which
the Pages build does not import; if the build ever complains, set
`NODE_VERSION=18` or leave the default.

### Deploy without Git (optional, for a one-off)

```bash
npm run build:pages:check
npx wrangler pages deploy dist --project-name csa-frontend          # production
npx wrangler pages deploy dist --project-name csa-frontend --branch <name>  # preview
```

---

## How the frontend reaches the API

`js/config.js` sets:

```js
window.__API_BASE_URL__ = 'https://csa-api.rashidjumachepkwony.workers.dev';
```

and wraps `fetch` so any `fetch('/api/...')` is sent **directly to the Worker**,
cross-origin. The browser therefore never depends on a Pages-side proxy.

There is deliberately **no `/api/*` proxy in `_redirects`**. Cloudflare Pages
accepts the rule but does not honour a proxy to an external origin - it returns
404. It is also unnecessary, because of the routing above. The pages that do not
load `js/config.js` (`about`, `contact`, `parents-corner`, `portal`, `404` and
the Google verification file) make no API calls at all.

There is also **no catch-all rewrite to `/index.html`**. This is a multi-page
site, so Pages serves the real file when it exists and `404.html` otherwise.
The old catch-all returned `index.html` with HTTP 200 for any missing path,
which hid broken links and caused `Unexpected token '<'` errors when an API
request missed the Worker.

> **Behaviour change to be aware of:** Pages issues a `308` from `/page.html` to
> `/page` for every HTML file (its "clean URLs" feature). All pages work at both
> forms and browsers follow the redirect transparently. This can be turned off
> in the dashboard under the Pages project's settings if you prefer `.html` URLs
> to be canonical.

### CORS

`worker/src/middleware/cors.js` allows:
- `https://changarastaracademy.co.ke` (from the Worker's `FRONTEND_URL` var)
- any additional origins in the `ALLOWED_ORIGINS` variable (comma separated)
- **any `https://*.pages.dev` origin**, so branch and commit previews work
- the local development ports

Everything else is rejected, and non-HTTPS preview origins are rejected too.
This is deliberate and safe here: authentication is a bearer JWT held in
`localStorage`, which another origin cannot read.

---

## Step 1 - Worker (API backend) - already deployed

```bash
cd worker
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put JWT_SECRET
# Optional, only needed for file uploads:
npx wrangler secret put CLOUDINARY_CLOUD_NAME
npx wrangler secret put CLOUDINARY_API_KEY
npx wrangler secret put CLOUDINARY_API_SECRET
npx wrangler deploy
```

There is also a helper that sets every secret BOM-free and verifies the result:

```bash
npm run deploy:live      # scripts/repoint-live.ps1
```

> **Note on Windows:** never pipe secret values straight from PowerShell into
> `wrangler secret put`. PowerShell prepends a UTF-8 BOM, which corrupts
> `SUPABASE_URL` and makes every database call fail with
> `Invalid URL: <BOM>https://...`. `repoint-live.ps1` writes BOM-free temp files
> and redirects through `cmd` for this reason.

---

## Step 2 - Preview before cutover

```bash
npm run build:pages:check
npx wrangler pages deploy dist --project-name csa-frontend --branch migration-preview
```

Test the preview URL, then run the automated checks:

```bash
$env:ADMIN_PW = '<admin password>'
powershell -ExecutionPolicy Bypass -File scripts\test-pages-preview.ps1
```

Only connect the custom domain once the preview is confirmed good.

### Changing the admin password

There is **no default password**. The password is set during setup and stored
only as a salted `salt:hash`, never in plaintext. To change it later:

```bash
node scripts/set-admin-password.mjs '<new-password>' [username]
```

It is hashed with the same function the login route verifies against, so the
change takes effect immediately. The password itself is never written to a file
or a log.

---

## Step 3 - Custom domain (manual, after approval)

Pages -> `csa-frontend` -> **Custom domains** -> **Add** ->
`changarastaracademy.co.ke`. Cloudflare will prompt for the DNS record; because
the zone is already on Cloudflare it is created for you.

Only do this after the preview has been tested. Rollback is in the handover
notes.

---

## Netlify (legacy - rollback only)

The site previously ran on Netlify. `netlify.toml` and `.netlifyignore` are
retained **only** so the old deployment can be reproduced or rolled back to;
they are not used by Cloudflare Pages and the `deploy:netlify` npm script has
been removed so it cannot be run by accident.

Rollback steps are at the end of the migration report.

---

## Important: Supabase

The active application uses Supabase for persistent data. `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` and `JWT_SECRET` are **Cloudflare Worker secrets
only**. Never expose the service-role key in browser JavaScript, in a Pages
build variable, or in any committed file. The student register
(`data/student-register.csv`) contains children's names and parent phone numbers
and is deliberately git-ignored.
