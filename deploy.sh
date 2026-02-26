#!/bin/bash

# Configuration
DOMAIN="anchorshop.cloud"
REPO_DIR="/root/clothing-pos" # Adjust if different

echo "--- Starting Deployment for $DOMAIN ---"

# 1. Install Docker & Docker Compose if missing (AlmaLinux/CentOS)
if ! [ -x "$(command -v docker)" ]; then
    echo "Installing Docker..."
    sudo dnf install -y dnf-plugins-core
    sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    sudo systemctl enable --now docker
fi

# 2. Navigate to repo and update
cd "$REPO_DIR" || exit
echo "Updating code from git..."
git pull origin main

# 3. Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    POSTGRES_PASSWORD=$(openssl rand -base64 12)
    cat <<EOF > .env
POSTGRES_USER=pos_user
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=clothing_pos
DATABASE_URL=postgres://pos_user:$POSTGRES_PASSWORD@db:5432/clothing_pos
EOF
fi

# 4. Build and restart containers
echo "Building and restarting containers..."
docker compose build
docker compose up -d

# 5. Wait for DB to be ready and run migrations
echo "Running database migrations..."
# Wait for app container to be up
sleep 10
docker compose exec app pnpm db:push

echo "--- Deployment Complete ---"
echo "Note: Ensure your Cloudflare SSL cert and key are in 'ssl/cloudflare/'"
