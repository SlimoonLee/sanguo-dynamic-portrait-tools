@echo off
chcp 65001 >nul
setlocal
set PORT=8791
set DIR=%~dp0
set PY=%SDPT_PY%
if "%PY%"=="" set PY=python

rem ---- already running? ----
netstat -ano | findstr /C:":%PORT% " | findstr LISTENING >nul
if %errorlevel%==0 (
    echo [SKIP] Server is already running on port %PORT%.
    echo         Tool page: http://127.0.0.1:%PORT%/
    start "" "http://127.0.0.1:%PORT%/"
    pause
    exit /b 0
)

echo [....] Starting server for %DIR%
start "PortraitToolServer" /min "%PY%" "%DIR%serve.py"
timeout /t 2 /nobreak >nul

netstat -ano | findstr /C:":%PORT% " | findstr LISTENING >nul
if %errorlevel%==0 (
    echo [ OK ] Server started on http://127.0.0.1:%PORT%/
    echo        Opening the tuning tool in your browser...
    start "" "http://127.0.0.1:%PORT%/"
) else (
    echo [FAIL] Server did not start. Check python path: %PY%
)
pause
