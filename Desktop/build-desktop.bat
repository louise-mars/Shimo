@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

set "WINSDK=C:\Program Files (x86)\Windows Kits\10"
set "SDKVER=10.0.26100.0"
set "LIB=%WINSDK%\Lib\%SDKVER%\um\x64;%WINSDK%\Lib\%SDKVER%\ucrt\x64;%LIB%"
set "INCLUDE=%WINSDK%\Include\%SDKVER%\um;%WINSDK%\Include\%SDKVER%\ucrt;%WINSDK%\Include\%SDKVER%\shared;%INCLUDE%"

cd /d c:\kiro\Shimo\Desktop
npx tauri build
