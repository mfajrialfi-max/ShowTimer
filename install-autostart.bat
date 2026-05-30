@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-startup-task.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-public-panitia.ps1" -Restart

echo.
echo Link publik Panitia tersimpan di:
echo %~dp0artifacts\public-panitia-url.txt
echo.
type "%~dp0artifacts\public-panitia-url.txt"
echo.
pause
