# Rebuilds the frontend and backend together and restarts the server.
#
# Running a backend binary compiled before a `git pull` against a frontend
# built after it (or vice versa) fails silently or in confusing ways -- the
# API response is missing fields the UI expects, or the UI sends a shape the
# API does not recognize. This script exists so nobody has to remember to
# rebuild both sides in the right order after every pull.
#
# Usage: .\rebuild.ps1
# Optional: .\rebuild.ps1 -SkipInstall   (skip `npm install`, just rebuild)

param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

$goExe = "C:\Program Files\Go\bin\go.exe"
if (-not (Test-Path $goExe)) {
    $cmd = Get-Command go -ErrorAction SilentlyContinue
    if ($cmd) { $goExe = $cmd.Source }
    else { Write-Error "Go not found. Install it or edit `$goExe in this script."; exit 1 }
}

Step "Stopping any running preflight-bin.exe"
Get-Process -Name preflight-bin -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

if (-not $SkipInstall) {
    Step "npm install (web/)"
    npm --prefix web install
    if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed"; exit 1 }
}

Step "Building frontend (npm run build)"
npm --prefix web run build
if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed"; exit 1 }

Step "Building backend (go build)"
& $goExe build -o preflight-bin.exe ./server/cmd/preflight
if ($LASTEXITCODE -ne 0) { Write-Error "Backend build failed"; exit 1 }

Step "Loading .env into this process"
if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        if ($_ -match '^\s*([A-Z_]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
} else {
    Write-Host "No .env found -- running with no credentials (fixtures/engine-only mode)." -ForegroundColor Yellow
}

Step "Starting preflight-bin.exe"
Remove-Item preflight-out.log, preflight-err.log -ErrorAction SilentlyContinue
$proc = Start-Process -FilePath ".\preflight-bin.exe" -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput "preflight-out.log" -RedirectStandardError "preflight-err.log"

$healthy = $false
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 1
    if ($proc.HasExited) {
        Write-Error "preflight-bin.exe exited immediately (exit code $($proc.ExitCode)) -- see preflight-err.log:"
        Get-Content preflight-err.log -ErrorAction SilentlyContinue
        exit 1
    }
    try {
        $health = Invoke-WebRequest -Uri "http://localhost:8080/api/health" -UseBasicParsing -TimeoutSec 2
        $healthy = $true
        Step "Server is up (HTTP $($health.StatusCode)), PID $($proc.Id). Open http://localhost:8080"
        break
    } catch {
        continue
    }
}
if (-not $healthy) {
    Write-Error "Server did not respond on :8080 after 10s -- check preflight-err.log:"
    Get-Content preflight-err.log -ErrorAction SilentlyContinue
    exit 1
}

try {
    $probe = Invoke-WebRequest -Uri "http://localhost:8080/api/probe" -UseBasicParsing -TimeoutSec 10
    Write-Host $probe.Content
} catch {
    Write-Host "Could not reach /api/probe (non-fatal)." -ForegroundColor Yellow
}
