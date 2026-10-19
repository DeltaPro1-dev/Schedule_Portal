@echo off
REM One-off July read (read-only, local file only). Started detached; waits until 21:00.
cd /d "%~dp0"
if not exist logs mkdir logs
powershell -NoProfile -Command "$t=(Get-Date).Date.AddHours(21); $s=($t-(Get-Date)).TotalSeconds; if($s -gt 0){Start-Sleep -Seconds $s}"
echo ================ start %DATE% %TIME% ================ >> "logs\supplypro-history.log"
node history-supplypro.js 2026-07-01 2026-07-31 C:/DeltaBackups/imports/supplypro-julho-2026.json >> "logs\supplypro-history.log" 2>&1
echo ================ end %DATE% %TIME% exit %ERRORLEVEL% ================ >> "logs\supplypro-history.log"
