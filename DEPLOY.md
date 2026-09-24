# Deployment Guide - Changara Star Academy

## Prerequisites

1. **MongoDB Atlas cluster** - Ensure your database is accessible and you have the connection string
2. **Cloudflare account** - For Worker API + Pages hosting
3. **Netlify account** - For Netlify deployment
4. **Git** - Repository pushed to GitHub/GitLab

---

## Step 1: Deploy the Cloudflare Worker (API Backend)

```bash
# 1. Navigate to worker directory
cd worker

# 2. Install dependencies (includes mongodb driver)
npm install

# 3. Set MongoDB URI secret
node node_modules/wrangler/bin/wrangler.js secret put MONGODB_URI
# Paste your MongoDB Atlas connection string:
# mongodb+srv://user:pass@cluster0.mongodb.net/csa-school?retryWrites=true&w=majority

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

## Important: MongoDB Atlas Network Access

Ensure your MongoDB Atlas cluster allows connections from anywhere:
1. Atlas → **Network Access** → **Security**
2. Add IP address: `0.0.0.0/0` (Allow access from anywhere)

---

## Post-Deployment

1. Register your first admin:
   ```bash
   curl -X POST https://your-worker-url/api/setup-admin \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","email":"admin@school.com","password":"admin123","fullName":"Admin"}'
   ```

2. Test the API:
   ```bash
   curl https://your-worker-url/api/test
   ```

3. Upload a logo/image via the admin CMS to test Cloudinary storage.

---

## Environment Variables Summary

| Variable | Where | Value |
|----------|-------|-------|
| `MONGODB_URI` | Worker secrets | `mongodb+srv://...` |
| `JWT_SECRET` | Worker secrets | Your secret key |
| `CLOUDINARY_CLOUD_NAME` | Worker secrets | Your Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Worker secrets | Your Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Worker secrets | Your Cloudinary API secret |
| `FRONTEND_URL` | wrangler.toml | `https://changarastaracademy.co.ke` |

---

## Rollback

To redeploy an older Worker version:
```bash
cd worker && npx wrangler versions -> list
npx wrangler versions -> rollback <version-id>
```
