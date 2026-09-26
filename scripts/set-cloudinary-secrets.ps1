# Set Cloudinary secrets on the live Worker using BOM-free temp files.
# Piping values from PowerShell prepends a UTF-8 BOM, which corrupts the secret
# and breaks the code at runtime, so each value is written to a file and
# redirected in through cmd.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$workerDir = Join-Path $root 'worker'

$vars = @{}
foreach ($line in Get-Content (Join-Path $root '.env')) {
  if ($line -match '^([A-Z_0-9]+)=(.*)$') {
    $vars[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
  }
}

$names = @('CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET')
$tmpDir = Join-Path $env:TEMP "csa-cloudinary"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

Push-Location $workerDir
try {
  foreach ($name in $names) {
    if (-not $vars[$name]) { throw "$name missing from .env" }
    $file = Join-Path $tmpDir "$name.txt"
    [System.IO.File]::WriteAllText($file, [string]$vars[$name], $utf8NoBom)
    $b = [System.IO.File]::ReadAllBytes($file)
    if ($b.Length -ge 2 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB) { throw "$name has a BOM" }
    Write-Host ("  {0} ({1} bytes)" -f $name, $b.Length)
    cmd /c "npx wrangler secret put $name -c wrangler.toml < `"$file`"" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "failed to set $name" }
  }
}
finally {
  Pop-Location
  Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
}
Write-Host "Cloudinary secrets set." -ForegroundColor Green
