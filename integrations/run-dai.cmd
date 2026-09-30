@echo off
REM Daily dai scrape (unattended). Output appended to logs\dai.log.
cd /d "%~dp0"
if not exist logs mkdir logs
echo ================ %DATE% %TIME% ================ >> "logs\dai.log"
call npm run scrape:dai >> "logs\dai.log" 2>&1
echo. >> "logs\dai.log"
