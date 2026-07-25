$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repo

$mongoPath = 'C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe'
$mongoDataDir = 'C:\data\db'
$mongoLogDir = 'C:\data\log'

if (-not (Test-Path $mongoDataDir)) {
    New-Item -ItemType Directory -Force -Path $mongoDataDir | Out-Null
}
if (-not (Test-Path $mongoLogDir)) {
    New-Item -ItemType Directory -Force -Path $mongoLogDir | Out-Null
}

$mongoProcess = Get-Process mongod -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $mongoProcess) {
    Start-Process -FilePath $mongoPath -ArgumentList '--dbpath', $mongoDataDir, '--logpath', (Join-Path $mongoLogDir 'mongod.log'), '--bind_ip', '127.0.0.1', '--port', '27017' -WindowStyle Hidden
}

Start-Sleep -Seconds 3
node server.js
