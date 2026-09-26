@echo off
chcp 65001 >nul
setlocal
set PORT=8791
set FOUND=0

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /C:":%PORT% " ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
    set FOUND=1
    echo [ OK ] Killed server process PID %%a
)

if %FOUND%==0 (
    echo [SKIP] No server is running on port %PORT%.
)
pause
