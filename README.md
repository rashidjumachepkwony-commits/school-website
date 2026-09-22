# Changara Star Academy Management System

A complete school management system built on **Cloudflare Pages + D1**, deployed via **GitHub**.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Static hosting | Cloudflare Pages |
| API backend | Cloudflare Pages Functions (Worker) |
| Database | Cloudflare D1 (SQLite) |
| Deployment | GitHub → Cloudflare Pages (automatic) |
| Authentication | Password hashing via Web Crypto API (PBKDF2) |

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/): `npm install -g wrangler`
- Cloudflare account with D1 enabled

### Steps

1. **Login to Cloudflare**
   ```bash
   wrangler login
   ```

2. **Create the D1 database**
   ```bash
   wrangler d1 create csa-school-db
   ```
   Note the `database_id` from the output.

3. **Link the database in `wrangler.jsonc`**
   Update the `"database_name"` field to match your created database.

4. **Run migrations**
   ```bash
   wrangler d1 execute DB --file=schema.sql
   ```

5. **Set environment variables**
   ```bash
   wrangler secret put JWT_SECRET
   # Enter a random 32+ character string when prompted
   ```

6. **Start local development**
   ```bash
   npm run dev
   ```
   This starts Wrangler in preview mode with a local D1 database.

7. **Seed the initial admin**
   After the first migration, create the initial admin account:
   ```bash
   wrangler d1 execute DB --command="INSERT OR IGNORE INTO admins (username, email, password_hash, full_name, role, is_active) VALUES ('admin', 'admin@changarastaracademy.co.ke', 'pbkdf2_sha256$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000', 'Super Admin', 'Super Admin', 1)"
   ```
   Default password: `admin123` (change immediately after first login)

## Deployment

1. Push to GitHub (`main` branch)
2. Connect your repo to [Cloudflare Pages](https://dash.cloudflare.com)
3. In Pages settings:
   - Build command: `npm install && npm run build:static`
   - Output directory: `dist`
   - OR use the Worker directly: Build command: `npm run dev`, Output: `public/`
4. Set `JWT_SECRET` in Pages environment variables
5. Add `DB` binding in Pages settings pointing to your D1 database

## File Structure

```
├── functions/api/[[path]].js  # Cloudflare Pages Function (all API routes)
├── schema.sql                  # D1 database migrations
├── wrangler.jsonc              # Cloudflare configuration
├── js/config.js                # Frontend API URL configuration
├── scripts/
│   └── seed-admin.js          # Admin seed script
├── *.html                     # Static pages (admin, staff, student, visitor)
├── css/                        # Stylesheets
└── images/                     # Static images
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

### D1 migration fails
Ensure you're logged in: `wrangler login`
Ensure the database exists: `wrangler d1 create csa-school-db`
Check migration: `wrangler d1 execute DB --command="SELECT name FROM sqlite_master WHERE type='table'"`

### Login fails
Verify the admin was seeded correctly. Re-run the seed command if needed.

### Database not found
Add the `DB` binding in your `wrangler.jsonc` under the `d1` section.

## Warnings and Limitations

- The legacy Express server (`server.js`) and Mongoose models are kept for reference but are **not used** in the Cloudflare deployment.
- File uploads use Cloudinary (signed, server-side) — no local disk or R2 required.
- The `scripts/import-students.js` script works with MongoDB and will be migrated to D1 in a future update.
