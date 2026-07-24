@echo off
REM Daily SupplyPro scrape (unattended). Fresh login each run (Force Login takes
REM over any active session). Output appended to logs\supplypro.log.
cd /d "%~dp0"
if not exist logs mkdir logs
echo ================ %DATE% %TIME% ================ >> "logs\supplypro.log"
call npm run scrape:supplypro >> "logs\supplypro.log" 2>&1
echo. >> "logs\supplypro.log"
