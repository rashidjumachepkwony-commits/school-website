# Deployment Guide - Changara Star Academy

## Prerequisites

1. **Supabase project** - Ensure the project is accessible and you have the project URL and service-role key
2. **Cloudflare account** - For Worker API + Pages hosting
3. **Netlify account** - For Netlify deployment
4. **Git** - Repository pushed to GitHub/GitLab

---

## Step 1: Deploy the Cloudflare Worker (API Backend)

```bash
# 1. Navigate to worker directory
cd worker

# 2. Install dependencies
npm install

# 3. Set Supabase secrets
node node_modules/wrangler/bin/wrangler.js secret put SUPABASE_URL
# Example: https://YOUR_PROJECT.supabase.co

node node_modules/wrangler/bin/wrangler.js secret put SUPABASE_SERVICE_ROLE_KEY
# Paste the Supabase service-role key (server-side only; never put it in frontend code)

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

After deployment, note the Worker URL, e.g., `https://csa-api.rashidjumachepkwony.workers.dev`

---

## Step 2: Deploy to Cloudflare Pages (Static Frontend)

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

## Step 3: Deploy to Netlify (Static Frontend)

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

## Important: Supabase

The active application uses Supabase for persistent data. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `JWT_SECRET` as Cloudflare Worker secrets. Never expose the service-role key in browser JavaScript or commit it to Git.
