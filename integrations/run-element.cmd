@echo off
REM Daily element scrape (unattended). Output appended to logs\element.log.
cd /d "%~dp0"
if not exist logs mkdir logs
echo ================ %DATE% %TIME% ================ >> "logs\element.log"
call npm run scrape:element >> "logs\element.log" 2>&1
echo. >> "logs\element.log"
