#!/bin/bash
set -e

# Check if docker is installed
if ! [ -x "$(command -v docker)" ]; then
    echo "Docker is not installed. Please install docker first."
    echo "Run official docker installation script? (y/n)"
    echo "----> Check out the script: https://get.docker.com"
    echo "----> I will run: 'curl -fsSL https://get.docker.com | sudo sh'"
    read answer
    if [ "$answer" != "${answer#[Yy]}" ] ;then
        echo "Running official docker installation script"
        curl -fsSL https://get.docker.com | sudo sh
    else
        echo "Aborting installation"
        exit 1
    fi
fi

# Ask if user wants to get everything in the current directory or in a new directory
echo "Do you want to set up everything in the current directory? (y/n)"
read answer
if [ "$answer" != "${answer#[Yy]}" ] ;then
    echo "Setting up everything in the current directory"
else
    echo "Enter the name of the directory where you want to set up everything: "
    read directory
    echo "----> Setting up everything in the $directory directory"
    mkdir $directory
    cd $directory
fi

echo "Getting the docker-compose.yml file from Github"
curl -o docker-compose.yml https://raw.githubusercontent.com/pluja/whishper/main/docker-compose.yml

echo "Getting the nginx.conf file from Github"
curl -o docker-compose.yml https://raw.githubusercontent.com/pluja/whishper/main/nginx.conf

# Copy env.example to .env
# check if .env exists
if [ -f .env ]; then
    echo ".env file already exists"
    echo "Do you want to overwrite it? (y/n)"
    read answer
    if [ "$answer" != "${answer#[Yy]}" ] ;then
        echo "Copying env.example to .env"
        cp env.example .env
    fi
else
    echo "Getting the default .env file from Github"
    curl -o .env https://raw.githubusercontent.com/pluja/whishper/main/example.env
fi

# Create necessary directories for libretranslate
echo "Creating necessary directories for libretranslate"
sudo mkdir -p ./whishper_data/libretranslate/{data,cache}

# This permissions are for libretranslate docker container
echo "Setting permissions for libretranslate"
case "$OSTYPE" in
  darwin*)  echo "macOS detected... Leaving permissions as is." ;; 
  linux*)   sudo chown -R 1032:1032 ./whishper_data/libretranslate ;;
  *)        echo "unknown: $OSTYPE" ;;
esac

echo "Do you want to pull docker images? (y/n)"
read answer
if [ "$answer" != "${answer#[Yy]}" ] ;then
    echo "Pulling and building docker images"
    sudo docker compose pull
fi

echo "Do you want to start the containers? (y/n)"
read answer
if [ "$answer" != "${answer#[Yy]}" ] ;then
    echo "Starting whishper..."
    sudo docker compose up -d
fi