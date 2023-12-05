@echo off
rem Script by @johnwayne087, see: https://github.com/pluja/whishper/issues/18#issuecomment-1724095055

rem Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
  echo Docker is not installed. Please install Docker first.
  goto :EOF
)

rem Ask for setup directory
echo Do you want to set up everything in the current directory? (Y/N)
set /p answer=
if /i "%answer%"=="Y" (
  echo Setting up everything in the current directory
) else (
  echo Enter the name of the directory where you want to set up everything:
  set /p directory=
  echo Setting up everything in the %directory% directory
  md "%directory%"
  cd "%directory%"
)

rem Get docker-compose.yml
echo Getting the docker-compose.yml file from Github
curl -o docker-compose.yml https://raw.githubusercontent.com/pluja/whishper/main/docker-compose.yml

rem Get .env file
if exist .env (
  echo .env file already exists
  echo Do you want to overwrite it? (Y/N)
  set /p answer=
  if /i "%answer%"=="Y" (
    echo Overwriting .env file
    curl -o .env https://raw.githubusercontent.com/pluja/whishper/main/example.env
  ) else (
    echo Keeping the existing .env file
  )
) else (
  echo Getting the default .env file from Github
  curl -o .env https://raw.githubusercontent.com/pluja/whishper/main/example.env
)

rem Create directories
echo Creating necessary directories for libretranslate
md whishper_data\libretranslate\data
md whishper_data\libretranslate\cache

rem Pull images
echo Do you want to pull docker images? (Y/N) 
set /p answer=
if /i "%answer%"=="Y" (
  echo Pulling docker images
  docker-compose pull
)

rem Start containers
echo Do you want to start the containers? (Y/N)
set /p answer=
if /i "%answer%"=="Y" (
  echo Starting whishper...
  docker-compose up -d
)
