# Verifies the deployed Cloudflare Pages preview the way a browser would.
# Uses curl rather than node fetch, because node's TLS stack fails against
# Cloudflare's IPv6 edge addresses from this machine.
$ErrorActionPreference = 'Continue'
$PREVIEW = if ($env:PREVIEW) { $env:PREVIEW } else { 'https://migration-preview.csa-frontend-dze.pages.dev' }
$WORKER = 'https://csa-api.rashidjumachepkwony.workers.dev'
$script:pass = 0; $script:fail = 0

function Probe($label, $url, $expectStatus) {
  $code = curl.exe -s -o NUL -w "%{http_code}" --max-time 45 $url
  if ($code -eq $expectStatus) { Write-Host "  ok   $label -> $code"; $script:pass++ }
  else { Write-Host "  FAIL $label -> $code (expected $expectStatus)"; $script:fail++ }
}

Write-Host "Testing $PREVIEW`n"
Write-Host "=== 1. public pages ==="
foreach ($p in @('/','/about','/academics','/admissions','/facilities','/performance',
  '/parents-corner','/downloads','/fees','/contact','/portal','/student-portal',
  '/holiday-assignments','/student-management')) { Probe $p ($PREVIEW + $p) 200 }

Write-Host "`n=== 2. authenticated/admin pages ==="
foreach ($p in @('/admin-login','/admin-dashboard','/admin-academics','/admin-attendance',
  '/admin-cms','/admin-students','/admin-teachers','/admin-visitors',
  '/admin-holiday-assignments','/admin-holiday-assignments-manage',
  '/admin-student-management','/clerk-dashboard','/teacher-login','/teacher-checkin',
  '/teacher-attendance','/student-checkin','/student','/visitor-checkin',
  '/student-checkin-legacy')) { Probe $p ($PREVIEW + $p) 200 }

Write-Host "`n=== 3. assets ==="
foreach ($p in @('/css/style.css','/css/slides.css','/js/config.js','/js/main.js',
  '/images/school-compound.jpg','/images/ecde-section.jpg','/images/classroom-learning.jpg',
  '/images/computer-lab.jpg','/images/graduation-award-ceremony.jpg',
  '/images/guidance-counselling.jpg','/images/outdoor-class-lesson.jpg',
  '/images/scout-patrol-drill.jpg','/images/school-transport-fleet.jpg',
  '/sitemap.xml')) { Probe $p ($PREVIEW + $p) 200 }

# Pages issues a 308 to the extensionless form for every .html URL, so the
# Google verification file is checked with redirects followed.
$gfile = Join-Path $env:TEMP 'csa-gv.txt'
curl.exe -sL --max-time 45 -o $gfile ($PREVIEW + '/google120463af0d0325f6.html')
$gbody = (Get-Content $gfile -Raw -ErrorAction SilentlyContinue)
Remove-Item $gfile -ErrorAction SilentlyContinue
if ($gbody -match 'google-site-verification: google120463af0d0325f6') { Write-Host "  ok   /google120463af0d0325f6.html verification token served"; $script:pass++ }
else { Write-Host "  FAIL google verification token missing"; $script:fail++ }

Write-Host "`n=== 4. sensitive files must NOT be published ==="
foreach ($p in @('/.env','/.env.example','/server.js','/package.json','/netlify.toml',
  '/wrangler.jsonc','/data/student-register.csv','/scripts/repoint-live.ps1',
  '/CHANGARA%20STAR%20ACADEMY%20SCHOOL%20SYSTEM.xlsx','/supabase/schema.sql')) {
  $body = curl.exe -s --max-time 45 ($PREVIEW + $p)
  $leak = $false
  if ($body) {
    if ($body -match 'sb_secret_|SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S{8,}|JWT_SECRET\s*=\s*\S{8,}|Change Log|Full Name') { $leak = $true }
  }
  if ($leak) { Write-Host "  FAIL $p leaked sensitive content"; $script:fail++ }
  else { Write-Host "  ok   $p not published"; $script:pass++ }
}

Write-Host "`n=== 5. _headers applied ==="
$hdrs = (curl.exe -s -D - -o NUL --max-time 45 ($PREVIEW + '/index.html')) -join "`n"
foreach ($h in @(@('x-content-type-options','nosniff'), @('x-frame-options','DENY'), @('referrer-policy','strict-origin-when-cross-origin'))) {
  if ($hdrs -match "(?im)^$($h[0]):\s*$([regex]::Escape($h[1]))") { Write-Host "  ok   $($h[0]): $($h[1])"; $script:pass++ }
  else { Write-Host "  FAIL $($h[0]) missing or wrong"; $script:fail++ }
}

Write-Host "`n=== 6. Worker CORS allows the Pages origin ==="
$acao = (curl.exe -s -D - -o NUL --max-time 45 -H "Origin: $PREVIEW" ($WORKER + '/api/test')) -join "`n"
if ($acao -match "(?im)^access-control-allow-origin:\s*$([regex]::Escape($PREVIEW))") { Write-Host "  ok   Worker allows $PREVIEW"; $script:pass++ }
else { Write-Host "  FAIL Worker does not allow the Pages origin"; $script:fail++ }

$api = curl.exe -s --max-time 45 -H "Origin: $PREVIEW" ($WORKER + '/api/portal/students')
if ($api -match '"success":true' -and $api -match '"total":130') { Write-Host "  ok   GET /api/portal/students from preview origin (130 students)"; $script:pass++ }
else { Write-Host "  FAIL portal students: $(($api | Out-String).Substring(0,[Math]::Min(80,($api|Out-String).Length)))"; $script:fail++ }

Write-Host "`n=== 7. Worker rejects an unknown origin ==="
$acao2 = (curl.exe -s -D - -o NUL --max-time 45 -H "Origin: https://evil-example.com" ($WORKER + '/api/test')) -join "`n"
if ($acao2 -notmatch '(?im)^access-control-allow-origin:') { Write-Host "  ok   unknown origin blocked"; $script:pass++ }
else { Write-Host "  FAIL unknown origin was allowed"; $script:fail++ }

Write-Host "`n=== 8. admin login from the preview origin ==="
# PowerShell mangles a JSON body passed inline to curl.exe, and curl treats
# braces as URL globbing, so the payload is written to a file and sent with
# --data-binary @file.
$bodyFile = Join-Path $env:TEMP 'csa-login-test.json'
Set-Content -Path $bodyFile -Value ('{"username":"admin","password":"' + $env:ADMIN_PW + '"}') -Encoding utf8 -NoNewline
$login = curl.exe -s --globoff --max-time 45 -X POST -H "Content-Type: application/json" -H "Origin: $PREVIEW" --data-binary "@$bodyFile" ($WORKER + '/api/admin/login')
Remove-Item $bodyFile -ErrorAction SilentlyContinue
if ($login -match '"success":true' -and $login -match '"token"') { Write-Host "  ok   admin login returns a JWT"; $script:pass++ }
else { Write-Host "  FAIL login: $login"; $script:fail++ }

Write-Host "`n=== 9. class report still renders from the Worker ==="
$rep = curl.exe -s --max-time 90 "$WORKER/api/assessments/class-report/Grade%201?period=September%202026&type=Monthly%20Assessment"
if ($rep -match 'CHANGARA STAR ACADEMY' -and $rep -match 'Competency Based Education') { Write-Host "  ok   class report HTML generated"; $script:pass++ }
else { Write-Host "  FAIL class report"; $script:fail++ }

Write-Host "`n=== 10. unknown path returns 404 (catch-all removed) ==="
Probe '/definitely-not-a-real-page-xyz' ($PREVIEW + '/definitely-not-a-real-page-xyz') 404

Write-Host "`n$($script:fail) failure(s), $($script:pass) passed"
if ($script:fail -gt 0) { exit 1 }
