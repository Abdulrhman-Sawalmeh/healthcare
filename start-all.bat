@echo off

echo  stop old project servers on ports 4000, 4100, 4200, 5174, 5175, 5176...
for %%P in (4000 4100 4200 5174 5175 5176) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    taskkill /PID %%A /F >nul 2>nul
  )
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



pause
