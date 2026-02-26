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

docker compose build
docker compose up -d --remove-orphans

echo "Waiting for database..."
MAX_RETRIES=30
COUNT=0
until docker compose exec db pg_isready -U pos_user -d clothing_pos &> /dev/null; do
    COUNT=$((COUNT + 1))
    [ "$COUNT" -ge "$MAX_RETRIES" ] && { echo "Error: DB timed out."; exit 1; }
    sleep 2
done

docker compose exec app pnpm db:push

if grep -q "ADMIN_PASSWORD" .env; then
    docker compose exec app pnpm run db:bootstrap
fi

docker compose restart nginx
echo "--- Deployment Complete ---"
