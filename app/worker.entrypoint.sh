#!/bin/bash

# turn on bash's job control
set -m

# Start anysub task server in the background
echo "running task server"
/usr/bin/anysub --task-server &

# Execute the base image's default CMD
echo "running default command"
cd /app
python3 main.py &

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?