@echo off

echo Near & Now React Application
echo ============================
echo.
echo 1. Run development server
echo 2. Build for production
echo 3. Install dependencies only
echo.

set /p choice=Enter your choice (1-3): 

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto build
if "%choice%"=="3" goto install

echo Invalid choice. Please try again.
goto end

:install
echo.
echo Installing dependencies...
call npm install
echo.
echo Dependencies installed successfully!
goto end

:dev
echo.
echo Installing dependencies...
call npm install
echo.
echo Starting development server...
call npm run dev
goto end

:build
echo.
echo Installing dependencies...
call npm install
echo.
echo Building project for production...
call npm run build
echo.
echo Build complete! The production files are in the 'dist' directory.

:end
pause
