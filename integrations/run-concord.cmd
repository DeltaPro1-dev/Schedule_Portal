@echo off
REM Daily concord scrape (unattended). Output appended to logs\concord.log.
cd /d "%~dp0"
if not exist logs mkdir logs
echo ================ %DATE% %TIME% ================ >> "logs\concord.log"
call npm run scrape:concord >> "logs\concord.log" 2>&1
echo. >> "logs\concord.log"
