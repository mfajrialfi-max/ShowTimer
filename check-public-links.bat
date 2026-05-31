@echo off
setlocal
cd /d "%~dp0"

echo Checking local server...
curl.exe -I http://127.0.0.1:3000/control/main
echo.

for /f "tokens=2,* delims=: " %%A in ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\show-public-link.ps1" ^| findstr /i "Panitia Stage"') do (
  echo Checking %%A...
  curl.exe -I %%A
  echo.
)

pause
