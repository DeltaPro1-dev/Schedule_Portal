@echo off
REM Daily Buildertrend scrape (unattended, headless). Uses the persistent Chrome
REM profile (auth/buildertrend-profile) so login is silent — if reCAPTCHA ever
REM challenges headless, run `npm run scrape:buildertrend -- --headful` once to
REM refresh the profile. Output appended to logs\buildertrend.log.
cd /d "%~dp0"
if not exist logs mkdir logs
echo ================ %DATE% %TIME% ================ >> "logs\buildertrend.log"
call npm run scrape:buildertrend >> "logs\buildertrend.log" 2>&1
echo. >> "logs\buildertrend.log"
