@echo off
REM Daily davidweekley scrape (unattended). Output appended to logs\davidweekley.log.
cd /d "%~dp0"
if not exist logs mkdir logs
echo ================ %DATE% %TIME% ================ >> "logs\davidweekley.log"
call npm run scrape:davidweekley >> "logs\davidweekley.log" 2>&1
echo. >> "logs\davidweekley.log"
