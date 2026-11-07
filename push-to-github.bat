@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title DeepTrack - push to GitHub

set "REPO=%~1"
if "%REPO%"=="" (
  echo.
  echo   Create the empty repo first: https://github.com/new
  echo   Name it deeptrack and do NOT tick "Add a README".
  echo.
  set /p "REPO=Repo URL (https://github.com/USER/REPO.git): "
)
if "%REPO%"=="" goto :fail

echo %REPO% | findstr /i "github.com" >nul
if errorlevel 1 (
  echo   That does not look like a GitHub URL.
  goto :fail
)

where git >nul 2>nul
if errorlevel 1 (
  echo   Git is not installed. Get it from https://git-scm.com/download/win
  goto :fail
)

for /f "delims=" %%i in ('git config --global user.name 2^>nul') do set "GITNAME=%%i"
if "%GITNAME%"=="" (
  set /p "GITNAME=Your name for commits: "
  git config --global user.name "%GITNAME%"
)
for /f "delims=" %%i in ('git config --global user.email 2^>nul') do set "GITEMAIL=%%i"
if "%GITEMAIL%"=="" (
  set /p "GITEMAIL=Your GitHub email: "
  git config --global user.email "%GITEMAIL%"
)

if not exist ".git" git init -b main
git add -A
git commit -m "DeepTrack" >nul 2>&1
if errorlevel 1 echo   No new changes to commit.

git remote remove origin >nul 2>&1
git remote add origin "%REPO%"

echo.
echo   Pushing to %REPO% ...
echo.
git push -u origin main
if not errorlevel 1 goto :done

echo.
echo   Push rejected - the repo already has commits, for example the partial
echo   web upload that was missing the static folder.
set /p "FORCE=Overwrite the remote main branch with this folder? [y/N]: "
if /i not "%FORCE%"=="y" goto :rejected
git push -u origin main --force
if errorlevel 1 goto :rejected
goto :done

:done
echo.
echo   Done. Check https://github.com that static\ and tracker\ are present,
echo   then redeploy on Render: Manual Deploy - Clear build cache and deploy.
goto :end

:rejected
echo.
echo   Push failed. If the error mentions "fetch first", run:
echo     git pull --rebase origin main
echo     git push -u origin main
echo.

:fail
:end
echo.
pause
endlocal
