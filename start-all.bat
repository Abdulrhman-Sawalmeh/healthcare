@echo off
set "REPO_ROOT=%~dp0"
set "PG_CTL=C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe"
set "ASCII_DRIVE=H:"
set "ASCII_ROOT=H:\"

if not exist "%ASCII_ROOT%runtime-postgres\data\PG_VERSION" (
  subst %ASCII_DRIVE% "%REPO_ROOT%" >nul 2>nul
)

if exist "%ASCII_ROOT%runtime-postgres\data\PG_VERSION" (
  set "PG_ROOT=%ASCII_ROOT%"
) else (
  set "PG_ROOT=%REPO_ROOT%"
)

set "PG_DATA=%PG_ROOT%runtime-postgres\data"
set "PG_LOG_DIR=%PG_ROOT%runtime-logs"
set "PG_LOG=%PG_LOG_DIR%\postgres-5433.out.log"

echo  stop old project servers on ports 4000, 4100, 4200, 5174, 5175, 5176, 8081, 8082...
for %%P in (4000 4100 4200 5174 5175 5176 8081 8082) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    taskkill /PID %%A /F >nul 2>nul
  )
)

echo  run PostgreSQL database on port 5433...
if not exist "%PG_LOG_DIR%" mkdir "%PG_LOG_DIR%" >nul 2>nul
netstat -ano | findstr /R /C:":5433 .*LISTENING" >nul
if errorlevel 1 (
  if exist "%PG_CTL%" (
    if exist "%PG_DATA%\PG_VERSION" (
      "%PG_CTL%" -D "%PG_DATA%" -l "%PG_LOG%" start
      timeout /t 4 /nobreak >nul
    ) else (
      echo  PostgreSQL data folder was not found: %PG_DATA%
      echo  Run npm run start:local once, or create the database before logging in.
    )
  ) else (
    echo  PostgreSQL was not found at %PG_CTL%
    echo  Install PostgreSQL 16 or start Docker Compose before logging in.
  )
) else (
  echo  PostgreSQL is already running.
)

echo  run Central API...
start "Central API" cmd /k "cd /d %~dp0 && npm run dev:central-api"

timeout /t 2 /nobreak >nul

echo  run Central Web...
start "Central Web" cmd /k "cd /d %~dp0 && npm run dev:central-web"

timeout /t 2 /nobreak >nul

echo  run Medium API...
start "Medium API" cmd /k "cd /d %~dp0 && npm run dev:medium-api"

timeout /t 2 /nobreak >nul

echo  run Medium Web...
start "Medium Web" cmd /k "cd /d %~dp0 && npm run dev:medium-web"

timeout /t 2 /nobreak >nul

echo  run Small API...
start "Small API" cmd /k "cd /d %~dp0 && npm run dev:small-api"

timeout /t 2 /nobreak >nul

echo  run Small Web...
start "Small Web" cmd /k "cd /d %~dp0 && npm run dev:small-web"

timeout /t 2 /nobreak >nul

echo  run Mobile Expo...
start "Mobile Expo" cmd /k "cd /d %~dp0 && npm run dev:mobile -- --offline"



pause
