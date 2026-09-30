@echo off
REM Daily candlelight scrape (unattended). Output appended to logs\candlelight.log.
cd /d "%~dp0"
if not exist logs mkdir logs
echo ================ %DATE% %TIME% ================ >> "logs\candlelight.log"
call npm run scrape:candlelight >> "logs\candlelight.log" 2>&1
echo. >> "logs\candlelight.log"
