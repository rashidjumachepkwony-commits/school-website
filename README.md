# Changara Star Academy Management System

A complete school management system: a static multi-page website on **Cloudflare Pages**, an API on a **Cloudflare Worker**, and **Supabase PostgreSQL** for all persistent data. Deployed from GitHub.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Static hosting | Cloudflare Pages (project `csa-frontend`, output `dist/`) |
| API backend | Cloudflare Worker `csa-api` (`https://csa-api.rashidjumachepkwony.workers.dev`) |
| Database | Supabase (PostgreSQL) via a REST adapter in `worker/src/db.js` |
| File storage | Cloudinary (optional, uploads only) |
| Deployment | GitHub → Cloudflare Pages (automatic), Worker deployed via Wrangler |
| Authentication | Admin JWTs + HMAC-SHA256 salted password hashes (Web Crypto) |

The frontend is plain HTML/CSS/JavaScript - no framework, no bundler. There is no
D1 database and there are no Pages Functions; the API is a standalone Worker.

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/): `npm install -g wrangler`
- A Supabase project (already provisioned in production - you do not need to
  create one)

### Steps

1. **Create a local environment file**
   ```bash
   cp .env.example .env
   ```
   Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the Supabase
   project settings. `.env` is git-ignored and must never be committed or
   published.

2. **Start the local server**
   ```bash
   npm run dev
   ```
   Serves the site on http://localhost:5000 and proxies `/api/*` to the Worker
   code running in-process.

3. **Build the Cloudflare Pages output** (optional, for testing the deployable
   artefact locally)
   ```bash
   npm run build:pages:check
   node scripts/verify-pages-build.mjs
   ```

### Do NOT run D1 commands
Earlier versions of this project used Cloudflare D1 (SQLite). That has been
fully replaced by Supabase. `wrangler d1 create`, `wrangler d1 execute` and the
`DB` binding are all obsolete and will operate on the wrong database.

## Deployment

See **[DEPLOY.md](DEPLOY.md)** for the full guide. In summary:

1. Push to GitHub (`main` branch)
2. Connect the repo to Cloudflare Pages and set:
   - Framework preset: **None**
   - Build command: `npm run build:pages`
   - Build output directory: `dist`
3. Add **no** environment variables on Pages. The Worker URL is a constant in
   `js/config.js`, and `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET` and the
   Cloudinary secrets are **Worker secrets only** - anything set as a Pages
   build variable is not secret from the browser.

Deploy the Worker separately with `npm run deploy:worker` (or
`npm run deploy:live`).

## File Structure

```
├── *.html                     # All site pages (public, admin, teacher, student, visitor)
├── css/                       # Stylesheets
├── js/config.js               # Frontend API URL configuration (Worker URL)
├── images/                    # Static images
├── _headers                   # Cloudflare Pages response headers
├── _redirects                 # Cloudflare Pages redirects (intentionally minimal)
├── dist/                      # Build output for Pages (git-ignored, generated)
├── worker/
│   ├── wrangler.toml          # Worker config (name: csa-api)
│   └── src/
│       ├── index.js           # Worker entry point and router
│       ├── db.js              # Supabase REST adapter
│       ├── middleware/cors.js # CORS policy
│       └── routes/            # API route modules
├── supabase/schema.sql        # Supabase table definitions (documentation only)
├── scripts/
│   ├── build-pages.mjs        # Builds dist/ from an allow-list
│   ├── verify-pages-build.mjs # Verifies dist/ is safe and resolves
│   └── test-pages-preview.ps1 # End-to-end test of a deployed preview
└── data/                      # Private student register (git-ignored, never published)
```

## Creating the First Admin

The `admins` table starts empty, so nobody can sign in until one is created:

```bash
curl -X POST https://csa-api.rashidjumachepkwony.workers.dev/api/setup-admin \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@changarastaracademy.co.ke","password":"<strong-password>","fullName":"Administrator"}'
```

`scripts/seed-admin.js` does the same thing. There is **no default password** -
choose a strong one and store it in a password manager. The first admin created
for this deployment uses a password set during setup, not a value in this
repository.

## API Endpoints

### Authentication
- `POST /api/setup-admin` - Create initial admin (one-time use)
- `POST /api/admin/login` - Admin login

### Staff Management
- `GET /api/teachers` - List all staff
- `POST /api/teacher/register` - Register new staff
- `GET /api/teachers/:id` - Get staff details
- `PUT /api/teachers/:id` - Update staff
- `DELETE /api/teachers/:id` - Delete staff
- `POST /api/teachers/:id/reset-pin` - Reset staff PIN

### Attendance
- `POST /api/teacher/checkin` - Staff check-in
- `POST /api/teacher/checkout` - Staff check-out
- `GET /api/teacher/attendance/today` - Today's attendance
- `GET /api/admin/attendance/all` - All attendance records
- `GET /api/admin/attendance/summary` - Attendance summary
- `GET /api/reports/staff/attendance` - Attendance reports

### Visitors
- `POST /api/visitor/checkin` - Check in visitor
- `PUT /api/visitor/checkout/:badgeNumber` - Check out visitor
- `GET /api/visitors` - List all visitors
- `GET /api/visitors/active` - Currently checked-in visitors
- `GET /api/visitors/today` - Today's visitors
- `GET /api/reports/visitors` - Visitor reports

### Students
- `POST /api/student/register` - Register student
- `POST /api/student/login` - Student check-in/out
- `GET /api/students` - List students
- `GET /api/students/:id` - Get student details
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Delete student
- `GET /api/student/attendance/today` - Today's attendance
- `GET /api/student/attendance/all` - All attendance

### Content
- `GET /api/content` - Website content
- `PUT /api/content` - Update website content
- `GET /api/content/notice` - School notice
- `PUT /api/content/notice` - Update notice

### Utility
- `GET /api/config` - Server configuration
- `GET /api/test` - Health check

## Troubleshooting

### "Invalid URL" or every database call fails on the Worker
A UTF-8 BOM has been prepended to the `SUPABASE_URL` secret. Never pipe values
from PowerShell into `wrangler secret put`; use `npm run deploy:live`, which
writes BOM-free temp files and redirects through `cmd`.

### "Unexpected token '<'" when calling the API
The request reached the static site instead of the Worker. Confirm
`window.__API_BASE_URL__` in `js/config.js` and hard-reload the page so the
cached config is not used.

### CORS failure in the browser console
The Worker's allowed origins come from `FRONTEND_URL` (production) plus any
`https://*.pages.dev` preview. Add anything else via the `ALLOWED_ORIGINS`
Worker variable, comma separated.

### Login fails
Check that an admin row exists (`GET /api/setup-admin` is a one-time
bootstrap). Passwords are stored as `salt:hash`, not plaintext.

### Database not found
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be set as **Worker
secrets**. The application talks to Supabase over its REST API; there is no D1
binding.

## Warnings and Limitations

- The application has been fully migrated from MongoDB/Mongoose to **Supabase PostgreSQL**. No active code, models, or dependencies reference MongoDB. The old D1/SQLite configuration is gone.
- File uploads use Cloudinary (signed, server-side) — no local disk or R2 required. The `CLOUDINARY_*` values are currently empty, so file uploads are unavailable until real Cloudinary credentials are added as Worker secrets. Written-only holiday assignments work without them.
- The `scripts/import-registers.mjs` script imports the student and staff registers from `CHANGARA STAR ACADEMY SCHOOL SYSTEM.xlsx` into Supabase. Pin numbers are salted-hashed on import and are never stored or logged in plaintext.
- `data/student-register.csv` contains children's names and parent phone numbers. It is git-ignored and excluded from the Pages build. Do not commit it or paste it into logs or issues.
- The frontend is deployed from an allow-list (`scripts/build-pages.mjs`) into `dist/`, never by publishing the repository root.


## Staff Attendance E2E Tests

The staff attendance test target is configurable with `E2E_BASE_URL`.

Production smoke tests:
```bash
E2E_BASE_URL=https://csa-api.rashidjumachepkwony.workers.dev npm run test:e2e:staff
```

Authenticated check-in/check-out tests are write operations. Run them only with a dedicated test staff account:
```bash
E2E_BASE_URL=https://csa-api.rashidjumachepkwony.workers.dev \
E2E_STAFF_ID=T999 \
E2E_STAFF_PIN=YOUR_TEST_PIN \
E2E_ALLOW_WRITE=true \
npm run test:e2e:staff
```
