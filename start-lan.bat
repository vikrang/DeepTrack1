@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Run start.bat once to set up DeepTrack first.
  pause
  exit /b 1
)

echo.
echo DeepTrack will be reachable from phones and tablets on this Wi-Fi at:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.PrefixOrigin -ne 'WellKnown' } | Sort-Object InterfaceIndex | ForEach-Object { '  http://' + $_.IPAddress + ':5000' }"
echo.
echo Keep this window open while you use the app. Press Ctrl+C to stop.
echo If Google sign-in rejects the address, add it as an authorized domain in Firebase
echo or set DEEPTRACK_PASSWORD_LOGIN=1 in .env and sign in with a password.
echo.

set "DEEPTRACK_HOST=0.0.0.0"
set "DEEPTRACK_OPEN_BROWSER=0"
".venv\Scripts\python.exe" run.py
pause
