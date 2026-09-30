@echo off
REM Daily oakwood scrape (unattended). Output appended to logs\oakwood.log.
cd /d "%~dp0"
if not exist logs mkdir logs
echo ================ %DATE% %TIME% ================ >> "logs\oakwood.log"
call npm run scrape:oakwood >> "logs\oakwood.log" 2>&1
echo. >> "logs\oakwood.log"
