@echo off
REM VendorFinder is Expo SDK 52 and pins Node 20 (engines: >=18 <=20, .nvmrc 20),
REM while the shell's global nvm version is usually 22/24 for LegendNetworkingApp.
REM Prepend Node 20 to PATH for this process only so both apps can run at once
REM without an `nvm use` that would switch Node globally for every other project.
setlocal
set "PATH=C:\Users\Marlon\AppData\Local\nvm\v20.20.2;%PATH%"
cd /d "%~dp0..\VendorFinder"
node -v
npx expo start --web --port 8082
