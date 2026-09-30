@echo off
REM Daily arive scrape (unattended). Output appended to logs\arive.log.
cd /d "%~dp0"
if not exist logs mkdir logs
echo ================ %DATE% %TIME% ================ >> "logs\arive.log"
call npm run scrape:arive >> "logs\arive.log" 2>&1
echo. >> "logs\arive.log"
