@echo off
echo Stopping all healthcare services...
taskkill /F /FI "WINDOWTITLE eq Central API*"
taskkill /F /FI "WINDOWTITLE eq Central Web*"
taskkill /F /FI "WINDOWTITLE eq Medium API*"
taskkill /F /FI "WINDOWTITLE eq Medium Web*"
taskkill /F /FI "WINDOWTITLE eq Small API*"
taskkill /F /FI "WINDOWTITLE eq Small Web*"
taskkill /F /FI "WINDOWTITLE eq Mobile Expo*"
echo All services stopped.
pause
