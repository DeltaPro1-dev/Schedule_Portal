@echo off
REM Daily Ivory Homes scrape (unattended). Output appended to logs\ivory.log.
cd /d "%~dp0"
if not exist logs mkdir logs
echo ================ %DATE% %TIME% ================ >> "logs\ivory.log"
call npm run scrape:ivory >> "logs\ivory.log" 2>&1
echo. >> "logs\ivory.log"
