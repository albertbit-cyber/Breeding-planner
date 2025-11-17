@echo off
call "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=amd64 -host_arch=amd64 >nul
cd /d "D:\Git Clone\Breeding-planner"
set CL=/std:c++20
npm rebuild better-sqlite3 --build-from-source
