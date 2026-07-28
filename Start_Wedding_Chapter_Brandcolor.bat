@echo off
setlocal
title Wedding Chapter - Brandcolor Edition
cd /d "%~dp0"
set "LOG=%~dp0Wedding_Chapter_Start_Log.txt"
echo [%date% %time%] Wedding Chapter startup > "%LOG%"
where node.exe >nul 2>nul
if errorlevel 1 goto NO_NODE
if not exist "dist\server\index.js" goto NO_BUILD
if not exist "dist\client" goto NO_BUILD
echo Starting Wedding Chapter Brandcolor edition...
echo Open http://127.0.0.1:4173/brandcolor if the browser does not open.
echo Keep this window open. Press Ctrl+C to stop.
node.exe windows-server.mjs >> "%LOG%" 2>&1
set "EXIT_CODE=%errorlevel%"
if "%EXIT_CODE%"=="0" exit /b 0
echo Wedding Chapter could not start. Error code: %EXIT_CODE%
type "%LOG%"
pause
exit /b %EXIT_CODE%
:NO_NODE
echo Node.js 22 LTS was not found. Install it, restart Windows, and try again.
pause
exit /b 1
:NO_BUILD
echo Required application files are missing. Extract the complete ZIP again.
pause
exit /b 1
