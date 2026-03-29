#!/bin/bash
set -euo pipefail

DOMAIN="anchorshop.cloud"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "--- Starting Deployment for $DOMAIN ---"

if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    sudo dnf install -y dnf-plugins-core
    sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    sudo systemctl enable --now docker
fi

cd "$REPO_DIR"
git pull origin main

if [ ! -f .env ]; then
    echo "Error: .env file not found. Create it manually before deploying."
    exit 1
fi

# Source env vars for use in this script
set -a
source .env
set +a

# Ensure downloads directory exists before docker compose mounts it
mkdir -p "$REPO_DIR/downloads"

docker compose build
docker compose up -d --remove-orphans

# Clean up Docker resources to prevent disk fill
docker builder prune --keep-storage 2gb -f
docker image prune -f
docker container prune -f

echo "Waiting for database..."
MAX_RETRIES=30
COUNT=0
DB_USER="${POSTGRES_USER:-pos_user}"
DB_NAME="${POSTGRES_DB:-clothing_pos}"
until docker compose exec pos_db pg_isready -U "$DB_USER" -d "$DB_NAME" &> /dev/null; do
    COUNT=$((COUNT + 1))
    [ "$COUNT" -ge "$MAX_RETRIES" ] && { echo "Error: DB timed out."; exit 1; }
    sleep 2
done

echo "Checking database connection and applying schema..."
docker compose exec pos_app pnpm db:migrate

echo "--- Deployment Complete ---"
