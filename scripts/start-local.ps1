$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$asciiDrive = "H:"
$asciiRoot = "$asciiDrive\"
$logsDir = Join-Path $asciiRoot "runtime-logs"
$npm = (Get-Command npm.cmd).Source
$viteBin = Join-Path $asciiRoot "node_modules\vite\bin\vite.js"
$pgCtl = "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe"
$pgDataDir = Join-Path $asciiRoot "runtime-postgres\data"
$pgLogFile = Join-Path $logsDir "postgres-5433.out.log"

function Ensure-AsciiDrive {
  if (Test-Path $asciiRoot) {
    return
  }

  cmd /c "subst H: `"$repoRoot`"" | Out-Null
}

function Get-Listener($port) {
  try {
    return Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
  } catch {
    return $null
  }
}

function Stop-PortProcess($port) {
  $listener = Get-Listener $port

  if ($listener) {
    Stop-Process -Id $listener.OwningProcess -Force
    Start-Sleep -Seconds 1
  }
}

function Start-LoggedProcess(
  [string]$filePath,
  [string[]]$arguments,
  [string]$workingDirectory,
  [string]$logPrefix
) {
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

  Start-Process `
    -FilePath $filePath `
    -ArgumentList $arguments `
    -WorkingDirectory $workingDirectory `
    -RedirectStandardOutput (Join-Path $logsDir "$logPrefix-$timestamp.out.log") `
    -RedirectStandardError (Join-Path $logsDir "$logPrefix-$timestamp.err.log") `
    -WindowStyle Hidden | Out-Null
}

function Ensure-LocalPostgres {
  if (Get-Listener 5433) {
    return
  }

  if ((Test-Path $pgCtl) -and (Test-Path $pgDataDir)) {
    Start-Process `
      -FilePath $pgCtl `
      -ArgumentList @("-D", $pgDataDir, "-l", $pgLogFile, "start") `
      -WindowStyle Hidden | Out-Null

    Start-Sleep -Seconds 3
  }
}

function Ensure-Api($port, $workspace, $logPrefix) {
  Stop-PortProcess $port

  Start-LoggedProcess $npm @("--workspace", $workspace, "run", "dev") $repoRoot $logPrefix
}

function Build-WebApp($workspace) {
  & $npm --workspace $workspace run build
}

function Start-WebPreview($port, $appDirectory, $logPrefix) {
  Stop-PortProcess $port

  Start-LoggedProcess `
    "node" `
    @($viteBin, "preview", "--host", "localhost", "--port", "$port") `
    $appDirectory `
    $logPrefix
}

Ensure-AsciiDrive

if (-not (Test-Path $logsDir)) {
  New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

Ensure-LocalPostgres

Ensure-Api 4000 "@healthcare/central-api" "central-api"
Ensure-Api 4100 "@healthcare/medium-center-api" "medium-api"
Ensure-Api 4200 "@healthcare/small-center-api" "small-api"

Build-WebApp "@healthcare/central-web"
Build-WebApp "@healthcare/medium-center-web"
Build-WebApp "@healthcare/small-center-web"

Start-WebPreview 5174 (Join-Path $asciiRoot "apps\central-web") "central-web-preview"
Start-WebPreview 5175 (Join-Path $asciiRoot "apps\medium-center-web") "medium-web-preview"
Start-WebPreview 5176 (Join-Path $asciiRoot "apps\small-center-web") "small-web-preview"

Start-Sleep -Seconds 5

Write-Host ""
Write-Host "Local services:"
foreach ($port in 5433, 4000, 4100, 4200, 5174, 5175, 5176) {
  $listener = Get-Listener $port
  $status = if ($listener) { "running" } else { "not running" }
  Write-Host ("  {0}: {1}" -f $port, $status)
}

Write-Host ""
Write-Host "Open these URLs:"
Write-Host "  Central web: http://localhost:5174"
Write-Host "  Medium center web: http://localhost:5175"
Write-Host "  Small center web: http://localhost:5176"
