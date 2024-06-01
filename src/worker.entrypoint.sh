#!/bin/bash

# turn on bash's job control
set -m

echo -n "
_______                             ______       ___       __            ______              
___    |___________  ____________  ____  /_      __ |     / /_______________  /______________
__  /| |_  __ \_  / / /_  ___/  / / /_  __ \     __ | /| / /_  __ \_  ___/_  //_/  _ \_  ___/
_  ___ |  / / /  /_/ /_(__  )/ /_/ /_  /_/ /     __ |/ |/ / / /_/ /  /   _  ,<  /  __/  /    
/_/  |_/_/ /_/_\__, / /____/ \__,_/ /_.___/      ____/|__/  \____//_/    /_/|_| \___//_/     
              /____/                                                                         
"

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