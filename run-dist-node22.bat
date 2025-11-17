@echo off
set "SCRIPT_DIR=%~dp0"
set "NODE22_DIR=%SCRIPT_DIR%node-v22.11.0-win-x64\node-v22.11.0-win-x64"
call "%NODE22_DIR%\nodevars.bat" >nul
call "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=amd64 -host_arch=amd64 >nul
cd /d "%SCRIPT_DIR%"
npm run dist:win
