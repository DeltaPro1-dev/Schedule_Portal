@echo off
REM Daily Oakwood (Kova) payments read (unattended, read-only): paid POs of the last 90 days
REM -> operations.portal_payments. Output appended to logs\payments-oakwood.log.
cd /d "%~dp0"
if not exist logs mkdir logs
echo ================ %DATE% %TIME% ================ >> "logs\payments-oakwood.log"
call node payments.js oakwood >> "logs\payments-oakwood.log" 2>&1
echo. >> "logs\payments-oakwood.log"
