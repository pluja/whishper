#!/bin/bash

# Copy env.example to .env
# check if .env exists
if [ -f .env ]; then
    echo ".env file exists"
    echo "Do you want to overwrite it? (y/n)"
    read answer
    if [ "$answer" != "${answer#[Yy]}" ] ;then
        echo "Copying env.example to .env"
        cp env.example .env
    fi
else
    echo ".env file does not exist"
    echo "Copying env.example to .env"
    cp env.example .env
fi

# Create necessary directories for libretranslate
echo "Creating necessary directories for libretranslate"
sudo mkdir -p ./whishper_data/libretranslate/{data,cache} 2&1> /dev/null

# This permissions are for libretranslate docker container
echo "Setting permissions for libretranslate"
sudo chown -R 1032:1032 ./whishper_data/libretranslate 2&1> /dev/null

echo "Do you want to pull and build docker images? (y/n)"
read answer
if [ "$answer" != "${answer#[Yy]}" ] ;then
    echo "Pulling and building docker images"
    docker compose pull
    docker compose build
fi