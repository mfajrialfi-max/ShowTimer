@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo Installing ShowTimer dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo.
echo Starting ShowTimer...
echo Operator: http://localhost:3000/control/main
echo Stage:    http://localhost:3000/stage/main
echo Panitia:  http://localhost:3000/panitia/main
echo.

start "" "http://localhost:3000/control/main"
call npm start
pause
