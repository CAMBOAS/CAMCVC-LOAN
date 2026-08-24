@echo off
title CAMCVC LOAN
cd /d "D:\07 Code\03 Project CAMCVC-LOAN\CAMCVC-LOAN"

echo  Stopping old server...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
  taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo  Starting CAMCVC Loan Server...
start "CAMCVC Loan Server" cmd /k "cd /d "D:\07 Code\03 Project CAMCVC-LOAN\CAMCVC-LOAN" && node server.js"

timeout /t 2 /nobreak >nul
start "" "http://localhost:3000/pages/login.html"
exit
