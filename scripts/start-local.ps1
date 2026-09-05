$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$asciiDrive = "H:"
$asciiRoot = "$asciiDrive\"
$npm = (Get-Command npm.cmd).Source
$pgCtl = "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe"
$pgIsReady = "C:\Program Files\PostgreSQL\16\bin\pg_isready.exe"

function Get-CanonicalDatabasePort {
  $rootEnvPath = Join-Path $repoRoot ".env"
  $databaseUrlLine = Get-Content -LiteralPath $rootEnvPath |
    Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
    Select-Object -First 1

  if (-not $databaseUrlLine) {
    throw "DATABASE_URL is missing from the root .env file."
  }

  $databaseUrl = ($databaseUrlLine -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")

  try {
    $databaseUri = [System.Uri]$databaseUrl
  } catch {
    throw "DATABASE_URL in the root .env file is not a valid URL."
  }

  if ($databaseUri.Port -gt 0) {
    return $databaseUri.Port
  }

  return 5432
}

function Ensure-AsciiDrive {
  if (Test-Path $asciiRoot) {
    $asciiPackage = Join-Path $asciiRoot "package.json"
    $repoPackage = Join-Path $repoRoot "package.json"

    if (-not (Test-Path $asciiPackage) -or
        (Get-FileHash -Algorithm SHA256 -LiteralPath $asciiPackage).Hash -ne
        (Get-FileHash -Algorithm SHA256 -LiteralPath $repoPackage).Hash) {
      throw "$asciiDrive is already in use and does not point to this Healthcare Ecosystem repository."
    }

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

function Test-PostgresReady {
  if (Test-Path $pgIsReady) {
    & $pgIsReady -h localhost -p $databasePort | Out-Null
    return $LASTEXITCODE -eq 0
  }

  return [bool](Get-Listener $databasePort)
}

function Get-ProcessSnapshot {
  $snapshot = @{}

  foreach ($process in Get-CimInstance Win32_Process) {
    $snapshot[[int]$process.ProcessId] = $process
  }

  return $snapshot
}

function Stop-ProcessTree([int]$processId) {
  if (-not (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
    return
  }

  & taskkill.exe /PID $processId /T /F 2>$null | Out-Null
}

function Stop-WorkspaceProcesses([string]$workspace) {
  $processes = @(Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and
    $_.CommandLine.IndexOf("--workspace $workspace", [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    $_.CommandLine -match '\brun\s+dev\b'
  })

  if (-not $processes) {
    return
  }

  $processIds = @{}
  foreach ($process in $processes) {
    $processIds[[int]$process.ProcessId] = $true
  }

  $roots = @($processes | Where-Object { -not $processIds.ContainsKey([int]$_.ParentProcessId) })
  foreach ($process in $roots) {
    Write-Host ("Stopping stale {0} process tree (PID {1})..." -f $workspace, $process.ProcessId)
    Stop-ProcessTree ([int]$process.ProcessId)
  }
}

function Get-OwnedPortProcessRoot([int]$processId, [int]$port, [string]$workspace) {
  $snapshot = Get-ProcessSnapshot
  $current = $snapshot[$processId]
  $visited = @{}
  $ownedRoot = $null

  while ($current -and -not $visited.ContainsKey([int]$current.ProcessId)) {
    $visited[[int]$current.ProcessId] = $true
    $commandLine = [string]$current.CommandLine
    $isWorkspaceProcess =
      $commandLine.IndexOf("--workspace $workspace", [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    $isRepoTsx =
      $commandLine.IndexOf($repoRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
      $commandLine -match '[\\/]tsx[\\/]'
    $isTsxCommandShim =
      $current.Name -eq "cmd.exe" -and
      $commandLine -match '\btsx\s+watch\s+src/index\.ts\b'
    $isRepoVitePreview =
      $commandLine.IndexOf((Join-Path $asciiRoot "node_modules\vite\bin\vite.js"), [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
      $commandLine -match "\bpreview\b" -and
      $commandLine -match "--port\s+$port\b"

    if ($isWorkspaceProcess -or $isRepoTsx -or $isTsxCommandShim -or $isRepoVitePreview) {
      $ownedRoot = [int]$current.ProcessId
    } elseif ($ownedRoot) {
      break
    }

    $current = $snapshot[[int]$current.ParentProcessId]
  }

  return $ownedRoot
}

function Stop-OwnedPortProcess([int]$port, [string]$workspace) {
  $listener = Get-Listener $port

  if (-not $listener) {
    return
  }

  $processId = [int]$listener.OwningProcess
  $ownedRoot = Get-OwnedPortProcessRoot $processId $port $workspace
  if (-not $ownedRoot) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    $description = if ($process) { "$($process.Name) (PID $processId)" } else { "PID $processId" }
    throw "Port $port is occupied by $description, which was not started by this Healthcare Ecosystem repository. It was not stopped."
  }

  Write-Host ("Stopping stale Healthcare Ecosystem process tree for port {0} (PID {1})..." -f $port, $ownedRoot)
  Stop-ProcessTree $ownedRoot
}

function Wait-PortFree([int]$port, [int]$timeoutSeconds = 10) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  $consecutiveFreeChecks = 0

  while ((Get-Date) -lt $deadline) {
    if (-not (Get-Listener $port)) {
      $consecutiveFreeChecks++
      if ($consecutiveFreeChecks -ge 4) {
        return
      }
    } else {
      $consecutiveFreeChecks = 0
    }

    Start-Sleep -Milliseconds 250
  }

  throw "Port $port did not become free after stopping its Healthcare Ecosystem process tree."
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

function Wait-ApiHealthy([int]$port, [string]$serviceKey, [int]$timeoutSeconds = 45) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    try {
      $health = Invoke-RestMethod -Uri "http://localhost:$port/health" -TimeoutSec 2
      if ($health.status -eq "ok" -and $health.database -eq "connected" -and $health.service -eq $serviceKey) {
        return $true
      }
    } catch {
      # The API may still be compiling or connecting to PostgreSQL.
    }

    Start-Sleep -Milliseconds 500
  }

  return $false
}

function Wait-WebReady([int]$port, [int]$timeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$port/" -TimeoutSec 2
      if ($response.StatusCode -eq 200) {
        return $true
      }
    } catch {
      # Vite preview may still be starting.
    }

    Start-Sleep -Milliseconds 500
  }

  return $false
}

function Ensure-LocalPostgres {
  if (Test-PostgresReady) {
    return
  }

  if (Get-Listener $databasePort) {
    Write-Warning "Port $databasePort is listening, but PostgreSQL is not accepting connections."
    return
  }

  if ($databasePort -ne 5433) {
    throw "PostgreSQL is not ready on canonical port $databasePort. Start the database configured by the root .env file before running this script."
  }

  if ((Test-Path $pgCtl) -and (Test-Path $pgDataDir)) {
    Start-Process `
      -FilePath $pgCtl `
      -ArgumentList @("-D", $pgDataDir, "-l", $pgLogFile, "start") `
      -WindowStyle Hidden | Out-Null

    Start-Sleep -Seconds 3

    if (-not (Test-PostgresReady)) {
      Write-Warning "PostgreSQL did not become ready on port $databasePort."
    }
  }
}

function Ensure-Api($port, $workspace, $logPrefix) {
  Stop-WorkspaceProcesses $workspace
  Stop-OwnedPortProcess $port $workspace
  Wait-PortFree $port

  Start-LoggedProcess $npm @("--workspace", $workspace, "run", "dev") $repoRoot $logPrefix
}

function Build-WebApp($workspace) {
  & $npm --workspace $workspace run build
}

function Start-WebPreview($port, $workspace, $appDirectory, $logPrefix) {
  Stop-OwnedPortProcess $port $workspace
  Wait-PortFree $port

  Start-LoggedProcess `
    "node" `
    @($viteBin, "preview", "--host", "localhost", "--port", "$port") `
    $appDirectory `
    $logPrefix
}

Ensure-AsciiDrive

$databasePort = Get-CanonicalDatabasePort
$logsDir = Join-Path $asciiRoot "runtime-logs"
$viteBin = Join-Path $asciiRoot "node_modules\vite\bin\vite.js"
$pgDataDir = Join-Path $asciiRoot "runtime-postgres\data"
$pgLogFile = Join-Path $logsDir "postgres-$databasePort.out.log"

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

Start-WebPreview 5174 "@healthcare/central-web" (Join-Path $asciiRoot "apps\central-web") "central-web-preview"
Start-WebPreview 5175 "@healthcare/medium-center-web" (Join-Path $asciiRoot "apps\medium-center-web") "medium-web-preview"
Start-WebPreview 5176 "@healthcare/small-center-web" (Join-Path $asciiRoot "apps\small-center-web") "small-web-preview"

$apiChecks = @(
  @{ Port = 4000; Service = "central-system" },
  @{ Port = 4100; Service = "medium-center-system" },
  @{ Port = 4200; Service = "small-center-system" }
)
$webPorts = @(5174, 5175, 5176)

foreach ($check in $apiChecks) {
  if (-not (Wait-ApiHealthy $check.Port $check.Service)) {
    throw "API on port $($check.Port) did not return a healthy /health response within 45 seconds. Check the latest runtime log."
  }
}

foreach ($port in $webPorts) {
  if (-not (Wait-WebReady $port)) {
    throw "Web app on port $port did not return HTTP 200 within 30 seconds. Check the latest runtime log."
  }
}

Write-Host ""
Write-Host "Local services:"
Write-Host ("  {0}: {1}" -f $databasePort, $(if (Test-PostgresReady) { "running" } else { "not running" }))
foreach ($check in $apiChecks) {
  Write-Host ("  {0}: {1}" -f $check.Port, $(if (Wait-ApiHealthy $check.Port $check.Service 2) { "running" } else { "not running" }))
}
foreach ($port in $webPorts) {
  Write-Host ("  {0}: {1}" -f $port, $(if (Wait-WebReady $port 2) { "running" } else { "not running" }))
}

Write-Host ""
Write-Host "Open these URLs:"
Write-Host "  Central web: http://localhost:5174"
Write-Host "  Medium center web: http://localhost:5175"
Write-Host "  Small center web: http://localhost:5176"
