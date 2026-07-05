#!/bin/sh
# Single container entrypoint (#41/#44). entrypoint.sh (the dead twin the
# Dockerfile never executed) is deleted.
#
# Modes:
#   MIGRATE_ONLY=true   one-shot migration job: migrate deploy, then exit.
#                       Run ONCE per deploy (docker compose run / k8s Job).
#   RUN_MIGRATIONS=true legacy single-replica mode: migrate, then serve.
#                       (Current default for compatibility; multi-replica
#                       deployments MUST set RUN_MIGRATIONS=false and use a
#                       MIGRATE_ONLY job so replicas never race migrations.)
#   otherwise           wait until migrations are applied (readiness gate:
#                       `prisma migrate status` exits non-zero while any
#                       migration is pending), then serve.
set -e

if [ "$MIGRATE_ONLY" = "true" ]; then
  echo "Running database migrations (one-shot job)..."
  exec npx prisma migrate deploy
fi

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Running database migrations (single-replica mode)..."
  npx prisma migrate deploy
else
  echo "Waiting for migrations (deploy them via a MIGRATE_ONLY=true one-shot job)..."
  attempt=0
  until npx prisma migrate status >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 60 ]; then
      echo "Migrations still pending after 60 attempts (~120s); giving up." >&2
      exit 1
    fi
    sleep 2
  done
  echo "Migrations are applied."
fi

echo "Starting application..."
exec node server.js
