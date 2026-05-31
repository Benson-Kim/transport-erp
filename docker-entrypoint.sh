#!/bin/sh
set -e

echo "Running database migrations..."
# npx prisma migrate deploy
./node_modules/.bin/prisma migrate deploy


echo "Starting application..."
exec node server.js