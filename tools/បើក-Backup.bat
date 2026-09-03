@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title បើក Backup

REM  Double-click this to turn a sealed backup back into files you can read.
REM
REM  Written because the person who owns this data does not write code, and the
REM  day they need a backup is the day everything else has already gone wrong.
REM  Asking them to remember a command line on that day is not a plan.
REM
REM  It only unseals and unpacks. It never touches a live database.

cd /d "%~dp0.."

echo.
echo  ==================================================
echo    បើក Backup ដែលបានអ៊ិនគ្រីប
echo  ==================================================
echo.

REM --- find the sealed files, newest first -------------------------------
set COUNT=0
for /f "delims=" %%F in ('dir /b /o-d "*.enc" 2^>nul') do (
  set /a COUNT+=1
  set "FILE!COUNT!=%%F"
  if !COUNT! LEQ 9 echo    !COUNT!^)  %%F
)

if %COUNT%==0 (
  echo    រកឯកសារ .enc មិនឃើញក្នុងថតនេះទេ។
  echo.
  echo    សូមទាញយកឯកសារ backup ពី GitHub ជាមុនសិន៖
  echo      GitHub ^> Actions ^> Database backup ^> ជ្រើសការរត់ ^> Artifacts
  echo    រួចដាក់ឯកសារ .enc ចូលថត៖
  echo      %CD%
  echo.
  pause
  exit /b 1
)

echo.
set "PICK=1"
if %COUNT% GTR 1 (
  set /p PICK=   ជ្រើសលេខ [1]:
  if "!PICK!"=="" set "PICK=1"
)
set "CHOSEN=!FILE%PICK%!"

if not defined CHOSEN (
  echo    លេខមិនត្រឹមត្រូវ។
  pause
  exit /b 1
)

echo.
echo    ឯកសារ: !CHOSEN!
echo.

REM --- passphrase, hidden while typing -----------------------------------
for /f "delims=" %%P in ('powershell -NoProfile -Command "$s=Read-Host -AsSecureString '   វាយពាក្យសម្ងាត់ (វានឹងមិនបង្ហាញទេ)'; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))"') do set "BACKUP_PASSPHRASE=%%P"

if not defined BACKUP_PASSPHRASE (
  echo.
  echo    មិនបានវាយពាក្យសម្ងាត់។
  pause
  exit /b 1
)

echo.
echo    កំពុងបើក...

node "tools\crypt-file.js" dec "!CHOSEN!" "_unlocked.tar.gz"
if errorlevel 1 (
  echo.
  echo    បើកមិនបាន។ ពាក្យសម្ងាត់ខុស ឬឯកសារខូច។
  echo.
  set "BACKUP_PASSPHRASE="
  pause
  exit /b 1
)
set "BACKUP_PASSPHRASE="

REM --- unpack ------------------------------------------------------------
set "OUTDIR=Backup-បើករួច"
if exist "%OUTDIR%" rmdir /s /q "%OUTDIR%"
mkdir "%OUTDIR%"
tar -xzf "_unlocked.tar.gz" -C "%OUTDIR%"
del "_unlocked.tar.gz"

echo.
echo  ==================================================
echo    ✅ រួចរាល់
echo  ==================================================
echo.
echo    ឯកសារនៅក្នុងថត៖
echo      %CD%\%OUTDIR%
echo.
echo    ឯកសារ .json បើកមើលបានដោយ Notepad ឬ Excel។
echo    គ្មានអ្វីត្រូវដំឡើងបន្ថែមទេ។
echo.

start "" "%CD%\%OUTDIR%"
pause
