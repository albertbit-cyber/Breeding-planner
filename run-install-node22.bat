@echo off
set "SCRIPT_DIR=%~dp0"
set "NODE22_DIR=%SCRIPT_DIR%node-v22.11.0-win-x64\node-v22.11.0-win-x64"
set "NODE22_NODE=%NODE22_DIR%\node.exe"
set "NODE22_NPM=%NODE22_DIR%\node_modules\npm\bin\npm-cli.js"
set "NODE22_NODE_GYP=%NODE22_DIR%\node_modules\npm\node_modules\node-gyp\bin\node-gyp.js"
call "%NODE22_DIR%\nodevars.bat" >nul
call "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=amd64 -host_arch=amd64 >nul
cd /d "%SCRIPT_DIR%"
set CL=/std:c++20
set npm_node_execpath=%NODE22_NODE%
set node_gyp=%NODE22_NODE_GYP%
set npm_config_node_gyp=%NODE22_NODE_GYP%
set NODE=%NODE22_NODE%
set node=%NODE22_NODE%
set NODE_EXE=%NODE22_NODE%
"%NODE22_NODE%" -v
"%NODE22_NODE%" "%NODE22_NPM%" install
