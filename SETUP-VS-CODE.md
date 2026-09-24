# Changara Star Academy — VS Code + Supabase Setup

This version uses **Supabase** as the database and the **Cloudflare Worker route layer** as the API. The old MongoDB/Mongoose server runtime has been removed from the active application.

## 1. Open the project

Extract the ZIP and open the `school-website` folder in VS Code.

## 2. Configure Supabase

Copy `.env.example` to `.env` and set:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SECRET_KEY
JWT_SECRET=YOUR_LONG_RANDOM_SECRET
PORT=5000
FRONTEND_URL=http://localhost:5000
```

The Supabase service-role/secret key must stay server-side. Never put it in browser JavaScript, HTML, GitHub, or Cloudflare Pages environment variables intended for client-side code.

## 3. Database

The schema has already been designed in `supabase/schema.sql`.

If the schema has already been successfully run in your Supabase SQL Editor, **do not run it again unnecessarily**.

The supplied seed script is:

```powershell
node scripts/seed-supabase-data.mjs
```

In your current setup it has already processed **17 staff records and 130 student records**, so there is no need to rerun it unless you intentionally want to synchronize those seed records again.

## 4. Start the complete local application

From the project root in VS Code Terminal / PowerShell:

```powershell
npm run dev
```

Open:

```text
http://localhost:5000
```

The local `server.js` serves the existing website and forwards every `/api/*` request to the same Supabase-backed Worker handlers used in production.

## 5. Verify the API

Open:

```text
http://localhost:5000/api/test
```

Expected response includes:

```json
{
  "success": true,
  "message": "Changara Star Academy API is running!"
}
```

Then test:

```text
http://localhost:5000/api/db-health
```

This requires the Supabase environment variables to be configured.

## 6. Validate the project

```powershell
npm run validate
```

## 7. Production Worker

The production API is in `worker/`.

From the `worker` directory:

```powershell
npm install
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put JWT_SECRET
npx wrangler deploy
```

Keep the Supabase service-role key as a Worker secret only.

## Included application areas

- Admin authentication/setup
- Staff/teacher management
- Staff check-in/check-out and attendance
- Student management and student login
- Clerk dashboard and fee/payment functions
- Assessment records and assessment subject configuration
- Curriculum/syllabus functions
- Holiday assignments with grade/student targeting and Cloudinary upload support
- Visitor management
- CMS/content management
- Existing static school pages
- Supabase compatibility adapter

## Important

Do not install or configure MongoDB for this version. The active application no longer depends on Mongoose.
