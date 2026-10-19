@echo off
REM Daily Ivory POs read (unattended, read-only): active and archived POs with lot, activity and value
REM -> operations.portal_pos (source ivory). Output appended to logs\pos-ivory.log.
cd /d "%~dp0"
if not exist logs mkdir logs
echo ================ %DATE% %TIME% ================ >> "logs\pos-ivory.log"
call node pos.js ivory >> "logs\pos-ivory.log" 2>&1
echo. >> "logs\pos-ivory.log"
