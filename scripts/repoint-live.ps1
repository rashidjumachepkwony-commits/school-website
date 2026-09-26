# Repoint the live `csa-api` Worker at the Supabase project that holds the
# student register, then deploy the current Worker code.
#
# Why: the live Worker is connected to a different (stale, pre-migration)
# Supabase project that contains 0 students, which is why the website shows no
# students even though the database has all 130.
#
# Usage (requires an interactive `wrangler login` first, or CLOUDFLARE_API_TOKEN):
#   powershell -ExecutionPolicy Bypass -File scripts\repoint-live.ps1
#
param(
  [switch]$SkipBackup
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$workerDir = Join-Path $root 'worker'
$liveApi = 'https://csa-api.rashidjumachepkwony.workers.dev'

# ---------- 1. Load credentials from .env ----------
$vars = @{}
foreach ($line in Get-Content (Join-Path $root '.env')) {
  if ($line -match '^([A-Z_0-9]+)=(.*)$') {
    $vars[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
  }
}
foreach ($required in @('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET')) {
  if (-not $vars[$required]) { throw "$required is missing from .env" }
}
Write-Host "Loaded credentials from .env (SUPABASE_URL host: $(([uri]$vars['SUPABASE_URL']).Host))" -ForegroundColor Cyan

# ---------- 2. Confirm wrangler can talk to Cloudflare ----------
Push-Location $workerDir
try {
  Write-Host "`nChecking Cloudflare authentication..." -ForegroundColor Cyan
  $who = npx wrangler whoami 2>&1 | Out-String
  if ($who -match 'Not logged in|expired|CLOUDFLARE_API_TOKEN') {
    throw "Wrangler is not authenticated. Run 'npx wrangler login' in an interactive terminal, or set CLOUDFLARE_API_TOKEN, then re-run this script."
  }
  Write-Host "Authenticated." -ForegroundColor Green

  # ---------- 3. Back up whatever live serves right now ----------
  if (-not $SkipBackup) {
    Write-Host "`nBacking up current live data..." -ForegroundColor Cyan
    node (Join-Path $PSScriptRoot 'backup-live.mjs')
  }

  # ---------- 4. Point the Worker's secrets at the populated project ----------
  # NOTE: piping these values straight into wrangler from PowerShell prepends a
  # UTF-8 BOM, which silently corrupts SUPABASE_URL ("Invalid URL: \uFEFFhttps://...")
  # and breaks every database call. Each value is therefore written to a
  # BOM-free temp file and redirected in through cmd instead.
  Write-Host "`nSetting Worker secrets (BOM-free)..." -ForegroundColor Cyan
  $tmpDir = Join-Path $env:TEMP "csa-secrets"
  New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)

  foreach ($name in @('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET')) {
    $file = Join-Path $tmpDir "$name.txt"
    [System.IO.File]::WriteAllText($file, [string]$vars[$name], $utf8NoBom)
    $bytes = [System.IO.File]::ReadAllBytes($file)
    if ($bytes.Length -gt 2 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB) {
      throw "$name still has a BOM after writing"
    }
    Write-Host ("  {0} ({1} bytes, no BOM)" -f $name, $bytes.Length)
    cmd /c "npx wrangler secret put $name -c wrangler.toml < `"$file`"" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to set secret $name" }
  }
  Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
  Write-Host "Secrets updated." -ForegroundColor Green

  # ---------- 5. Deploy the current Worker code ----------
  Write-Host "`nDeploying Worker..." -ForegroundColor Cyan
  npx wrangler deploy -c wrangler.toml
}
finally {
  Pop-Location
}

# ---------- 6. Verify ----------
Write-Host "`nVerifying live site..." -ForegroundColor Cyan
Start-Sleep -Seconds 5
try {
  $s = Invoke-RestMethod "$liveApi/api/students/management" -TimeoutSec 60
  Write-Host ("  students on live : " + $s.total) -ForegroundColor Green
  Write-Host ("  boarders/day     : " + $s.summary.boarders + " / " + $s.summary.dayScholars) -ForegroundColor Green
  Write-Host ("  grades           : " + (($s.byGrade | ForEach-Object { "$($_.grade) ($($_.count))" }) -join ', ')) -ForegroundColor Green
  if ($s.total -gt 0) {
    Write-Host "`nSUCCESS - the live website is now serving the student register." -ForegroundColor Green
  } else {
    Write-Warning "Live still reports 0 students. Check the Worker logs with: npx wrangler tail -c wrangler.toml"
  }
} catch {
  Write-Warning "Verification request failed: $($_.Exception.Message)"
}
