#!/bin/bash
# Local development helper
# Usage:
#   ./dev.sh up       - Start local Postgres + PowerSync
#   ./dev.sh down     - Stop everything
#   ./dev.sh logs     - Tail logs
#   ./dev.sh db:push  - Push Drizzle schema to local DB
#   ./dev.sh db:seed  - Bootstrap admin user
#   ./dev.sh reset    - Nuke local DB volume and start fresh
#   ./dev.sh status   - Show container status

set -e
cd "$(dirname "$0")"

case "${1:-help}" in
  up)
    echo "Starting local dev stack..."
    docker compose -f docker-compose.dev.yml up -d
    echo ""
    echo "Waiting for Postgres..."
    until docker exec dev_db pg_isready -U pos -d clothing_pos > /dev/null 2>&1; do
      sleep 1
    done
    echo "Postgres ready on localhost:5433"
    echo "PowerSync will be ready on localhost:8080 (may take ~10s)"
    echo ""
    echo "Run 'pnpm dev' to start the SvelteKit app"
    ;;
  down)
    docker compose -f docker-compose.dev.yml down
    ;;
  logs)
    docker compose -f docker-compose.dev.yml logs -f ${2:-}
    ;;
  db:push)
    echo "Pushing Drizzle schema to local DB..."
    pnpm db:push
    ;;
  db:seed)
    echo "Bootstrapping admin user..."
    pnpm db:bootstrap
    ;;
  reset)
    echo "Nuking local dev DB..."
    docker compose -f docker-compose.dev.yml down -v
    echo "Done. Run './dev.sh up' to start fresh."
    ;;
  status)
    docker compose -f docker-compose.dev.yml ps
    ;;
  *)
    echo "Usage: ./dev.sh {up|down|logs|db:push|db:seed|reset|status}"
    ;;
esac
