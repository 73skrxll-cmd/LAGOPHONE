@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS from https://nodejs.org/ then run this file again.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)
echo Installing application dependencies...
call npm ci --no-audit --no-fund
if errorlevel 1 goto failed
call npm run desktop
if errorlevel 1 goto failed
exit /b 0
:failed
echo Application setup or launch failed. See the error above.
pause
exit /b 1
