@echo off
setlocal
cd /d "%~dp0"

echo Starting ShowTimer and public links...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-public-panitia.ps1" -Restart

echo.
echo Current public links:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\show-public-link.ps1"
echo.
pause
