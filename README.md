# Changara Star Academy Management System

A complete school management system: static frontend on **Netlify/Cloudflare
Pages**, API on a **Cloudflare Worker**, database on **Supabase PostgreSQL**
(previously MongoDB Atlas — see `supabase/schema.sql` and
`scripts/migrate-mongodb-to-supabase.js`).

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Static hosting | Netlify (+ optional Cloudflare Pages) |
| API backend | Cloudflare Worker (`worker/`) |
| Database | Supabase PostgreSQL via `@supabase/supabase-js` (Mongo-compatible adapter in `worker/src/db.js`) |
| Media storage | Cloudinary (signed, server-side uploads) |
| Deployment | GitHub → Netlify (frontend) / `wrangler deploy` (Worker) |
| Authentication | HMAC-SHA256 password hashes + JWT (Web Crypto / node:crypto) |

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- A Supabase project (schema: `supabase/schema.sql`)
- Worker secrets configured with `wrangler secret put` (see `DEPLOY.md`)

### Steps

1. **Create the Supabase schema**
   Open the [Supabase SQL Editor](https://supabase.com/dashboard/project/gspikjhqvklixzdnlwhn/sql/new),
   paste `supabase/schema.sql`, and run it.

2. **Configure Worker secrets**
   ```bash
   cd worker
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put JWT_SECRET
   ```

3. **Run the Worker locally**
   ```bash
   npm run dev:worker
   ```

4. **Serve the frontend locally**
   ```bash
   npm run dev
   ```
   (legacy Express server on `http://localhost:5000`)

5. **Seed the initial admin**
   With the Worker running, call `POST /api/setup-admin` (see `DEPLOY.md`),
   or insert a row into the Supabase `admins` table with a password hash
   produced by the same HMAC-SHA256 scheme used by `worker/src/utils/auth.js`.

## Deployment

1. Push to GitHub (`main` branch)
2. Netlify deploys the static frontend (publish directory `.`)
3. Deploy the Worker: `cd worker && npx wrangler deploy`

## File Structure

```
├── worker/src/                  # Cloudflare Worker (all API routes)
│   ├── db.js                    # Supabase-backed Mongo-compatible data layer
│   ├── routes/                  # auth, content, staff, attendance, visitors,
│   │                            # students, assessments, curriculum, upload,
│   │                            # holidayAssignments
│   └── services/                # cloudinary, time (Africa/Nairobi), password
├── supabase/schema.sql          # Supabase tables, RLS, indexes
├── scripts/
│   ├── migrate-mongodb-to-supabase.js  # one-time data migration
│   └── test-supabase-adapter.mjs       # data-layer unit tests
├── js/config.js                 # Frontend API URL configuration
├── server.js                    # Legacy local Express server (reference)
├── *.html                       # Static pages (admin, staff, student, visitor)
├── css/                         # Stylesheets
└── images/                      # Static images
```

## Creating the First Admin

1. After running migrations, visit: https://your-domain.pages.dev/admin-login.html
2. Login with:
   - Username: `admin`
   - Password: `admin123`
3. Immediately change the password via Admin Settings.

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

### `Database not configured` / `db-health` fails
- Check `SUPABASE_URL` is set in `worker/wrangler.toml` vars
- Check the secret: `cd worker && npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`
- Confirm `supabase/schema.sql` has been run (the health check reads the
  `contents` table)

### Login fails
Verify the admin row exists in the Supabase `admins` table
(`POST /api/setup-admin` creates it once), and that `JWT_SECRET` is set.

## Warnings and Limitations

- The legacy Express server (`server.js`) and Mongoose models are kept for
  reference/local development but are **not used** in production.
- File uploads use Cloudinary (signed, server-side) — no local disk or R2 required.
- `scripts/import-students.js` targets MongoDB (legacy). New imports should go
  through the Supabase adapter or the Worker API.
