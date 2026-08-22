#!/bin/bash
cd /opt/vigilos

echo "=== Pulling latest code ==="
git pull origin main

echo "=== Checking NODE_ENV ==="
grep NODE_ENV vigil-server/.env

# If NODE_ENV=production, change to development for CORS to work
if grep -q 'NODE_ENV=production' vigil-server/.env; then
  echo "=== NODE_ENV is production, changing to development ==="
  sed -i 's/NODE_ENV=production/NODE_ENV=development/' vigil-server/.env
fi

echo "=== Restarting server ==="
pkill -f 'node.*server.js' || true
sleep 1
cd vigil-server
PORT=4141 nohup node src/server.js > /tmp/vigilos-server.log 2>&1 &
sleep 3

echo "=== Server status ==="
if pgrep -f 'node.*server.js' > /dev/null; then
  echo "Server is running (PID: $(pgrep -f 'node.*server.js'))"
else
  echo "Server FAILED to start. Check logs:"
  tail -20 /tmp/vigilos-server.log
fi
