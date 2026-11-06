@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo 没有找到 Python。别担心：直接双击 index.html 也能看网站。
  pause
  exit /b 1
)

set PORT=8000
set LANIP=

for /f "usebackq tokens=2 delims=:" %%A in (`ipconfig ^| findstr /c:"IPv4"`) do (
  for /f "tokens=* delims= " %%B in ("%%A") do if not defined LANIP set "LANIP=%%B"
)

echo.
echo   一本小本子 · 本地网站
echo   ---------------------------------------------
echo   这台电脑:        http://127.0.0.1:%PORT%
if defined LANIP echo   同一 WiFi 手机:  http://%LANIP%:%PORT%
echo   ---------------------------------------------
echo   关掉这个窗口，网站就停了。
echo.

start "" "http://127.0.0.1:%PORT%"
python -m http.server %PORT% --bind 0.0.0.0
pause
