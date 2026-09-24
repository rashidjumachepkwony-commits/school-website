# ============================================================
# Changara Star Academy - MongoDB -> Supabase migration runner
# (Windows PowerShell 5.1 compatible - no && , no cmd `set`)
#
# Usage (from the repository root):
#   powershell -ExecutionPolicy Bypass -File scripts\run-migration.ps1
#
# You will be prompted for:
#   - MongoDB connection string (Atlas)
#   - Supabase URL (defaults to the CSA project)
#   - Supabase service_role key (hidden input)
#
# The script installs the temporary mongodb driver, previews the migration
# (dry-run), asks for confirmation, then runs the real migration.
# MongoDB is NEVER modified or deleted.
# ============================================================

$ErrorActionPreference = 'Stop'

# Run from repo root regardless of where the script was invoked from.
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot
Write-Host "Repository: $repoRoot" -ForegroundColor Cyan

# ---- 1. Make sure the temporary mongodb driver is installed ----------------
Write-Host "`n[1/4] Installing dependencies..." -ForegroundColor Cyan
Push-Location (Join-Path $repoRoot 'worker')
try {
  if (-not (Test-Path (Join-Path $repoRoot 'worker\node_modules\@supabase\supabase-js'))) {
    npm install --no-audit --no-fund
  }
  if (-not (Test-Path (Join-Path $repoRoot 'worker\node_modules\mongodb'))) {
    Write-Host "  Installing temporary 'mongodb' driver (migration only, not saved to package.json)..."
    npm install mongodb --no-save --no-audit --no-fund
  }
} finally {
  Pop-Location
}
Write-Host "  Dependencies ready." -ForegroundColor Green

# ---- 2. Collect credentials (prompted, never written to disk) --------------
Write-Host "`n[2/4] Connection details" -ForegroundColor Cyan
$mongoUri = Read-Host "MongoDB URI (mongodb+srv://user:pass@cluster0.mongodb.net/csa-school...)"

$defaultSupabase = 'https://gspikjhqvklixzdnlwhn.supabase.co'
$supabaseUrl = Read-Host "Supabase URL (press Enter for $defaultSupabase)"
if ([string]::IsNullOrWhiteSpace($supabaseUrl)) { $supabaseUrl = $defaultSupabase }

# Secure (hidden) prompt for the service-role key
$secureKey = Read-Host "Supabase SERVICE_ROLE key (input hidden)" -AsSecureString
$bptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
$serviceKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bptr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bptr)

if ([string]::IsNullOrWhiteSpace($mongoUri) -or [string]::IsNullOrWhiteSpace($serviceKey)) {
  Write-Error "MongoDB URI and service_role key are both required."
}

# ---- 3. Dry run -------------------------------------------------------------
Write-Host "`n[3/4] Dry run (no data written)" -ForegroundColor Cyan
$env:MONGODB_URI = $mongoUri
$env:SUPABASE_URL = $supabaseUrl
$env:SUPABASE_SERVICE_ROLE_KEY = $serviceKey

node scripts/migrate-mongodb-to-supabase.js --dry-run
if ($LASTEXITCODE -ne 0) { Write-Error "Dry run failed - nothing was written. Fix the error above and re-run." }

# ---- 4. Confirm + migrate ---------------------------------------------------
Write-Host "`n[4/4] Real migration" -ForegroundColor Cyan
$answer = Read-Host "Review the preview above. Run the REAL migration now? (yes/no)"
if ($answer -ne 'yes') {
  Write-Host "Cancelled. Nothing was written to Supabase." -ForegroundColor Yellow
  exit 0
}

node scripts/migrate-mongodb-to-supabase.js
if ($LASTEXITCODE -ne 0) { Write-Error "Migration reported errors - see output above." }

Write-Host @"

============================================================
 Migration finished. Next steps:
   1. cd worker
   2. npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
      (paste the same service_role key when prompted)
   3. npx wrangler deploy
   4. Verify:  https://csa-api.rashidjumachepkwony.workers.dev/api/db-health
      (should report  "dbName": "supabase")
============================================================
"@ -ForegroundColor Green