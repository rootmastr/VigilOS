#!/bin/bash
# ============================================
# VigilOS - Deploy to Ubuntu Server
# Run this on your Ubuntu server
# ============================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

APP_DIR="/opt/vigilos"
REPO_URL="https://github.com/rootmastr/VigilOS.git"
BRANCH="main"

echo -e "${YELLOW}=== VigilOS - Server Deployment ===${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Please run as root (sudo)${NC}"
    exit 1
fi

# Install Docker if not installed
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Installing Docker...${NC}"
    apt-get update
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    echo -e "${GREEN}Docker installed successfully${NC}"
fi

# Install Docker Compose if not installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}Installing Docker Compose...${NC}"
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}Docker Compose installed successfully${NC}"
fi

# Create app directory
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# Clone or pull repository
if [ -d ".git" ]; then
    echo -e "${YELLOW}Pulling latest changes...${NC}"
    git pull origin "$BRANCH"
else
    # Directory exists but no .git — clean it first
    if [ "$(ls -A)" ]; then
        echo -e "${YELLOW}Cleaning existing files in $APP_DIR...${NC}"
        rm -rf "$APP_DIR"/*
        rm -rf "$APP_DIR"/.[!.]*
    fi
    echo -e "${YELLOW}Cloning repository...${NC}"
    git clone -b "$BRANCH" --depth 1 "$REPO_URL" .
fi

# Fix: If repo cloned into subdirectory, move contents up
if [ -d "VigilOS" ] && [ -d "VigilOS/.git" ]; then
    echo -e "${YELLOW}Moving repo contents from VigilOS/ to $APP_DIR/...${NC}"
    mv VigilOS/* VigilOS/.* . 2>/dev/null || true
    rmdir VigilOS 2>/dev/null || true
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    SERVER_IP=$(hostname -I | awk '{print $1}')
    cat > .env << EOF
# Database Configuration
DB_HOST=postgres
DB_PORT=5432
DB_NAME=vigil_prod
DB_USER=vigil_admin
DB_PASSWORD=$(openssl rand -hex 32)

# Redis Configuration
REDIS_URL=redis://redis:6379

# InfluxDB Configuration
INFLUX_URL=http://influxdb:8086
INFLUX_TOKEN=$(openssl rand -hex 32)
INFLUX_PASSWORD=$(openssl rand -hex 16)

# JWT Configuration
JWT_SECRET=$(openssl rand -hex 64)
JWT_EXPIRY=24h

# Encryption
ENCRYPTION_KEY=$(openssl rand -hex 32)

# MQTT Configuration
MQTT_BROKER=mqtt://mosquitto:1883
MQTT_USERNAME=vigil_server
MQTT_PASSWORD=$(openssl rand -hex 16)

# Server Configuration
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# CORS Configuration
CORS_ORIGIN=http://${SERVER_IP}:8181,http://localhost:8181
EOF
    echo -e "${GREEN}.env file created with generated secrets${NC}"
    echo -e "${YELLOW}Important: Edit .env file to set your domain and other settings${NC}"
fi

# Create SSL directory and self-signed certificate
mkdir -p ssl
if [ ! -f "ssl/cert.pem" ]; then
    echo -e "${YELLOW}Creating self-signed SSL certificate...${NC}"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout ssl/key.pem \
        -out ssl/cert.pem \
        -subj "/C=ID/ST=Jakarta/L=Jakarta/O=VigilOS/CN=localhost"
    echo -e "${GREEN}Self-signed SSL certificate created${NC}"
    echo -e "${YELLOW}For production, replace with a real SSL certificate${NC}"
fi

# Stop existing containers
echo -e "${YELLOW}Stopping existing containers...${NC}"
docker-compose -f docker-compose.prod.yml down 2>/dev/null || true

# Build and start containers
echo -e "${YELLOW}Building and starting containers...${NC}"
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be healthy
echo -e "${YELLOW}Waiting for services to start...${NC}"
sleep 10

# Check container status
echo -e "${YELLOW}Container status:${NC}"
docker-compose -f docker-compose.prod.yml ps

# Run database migrations
echo -e "${YELLOW}Running database migrations...${NC}"
docker-compose -f docker-compose.prod.yml exec -T server npx prisma migrate deploy 2>/dev/null || echo -e "${YELLOW}Skipping migrations (will run on first start)${NC}"

echo ""
echo -e "${GREEN}=== VigilOS deployed successfully! ===${NC}"
echo -e "${GREEN}Frontend: http://$(hostname -I | awk '{print $1}'):8181${NC}"
echo -e "${GREEN}Backend API: http://$(hostname -I | awk '{print $1}'):4141/api/${NC}"
echo -e "${GREEN}WebSocket: ws://$(hostname -I | awk '{print $1}'):4141/ws${NC}"
echo -e "${GREEN}Socket.io: http://$(hostname -I | awk '{print $1}'):8181/socket.io/${NC}"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  cd $APP_DIR"
echo "  docker-compose -f docker-compose.prod.yml logs -f        # View logs"
echo "  docker-compose -f docker-compose.prod.yml ps             # Check status"
echo "  docker-compose -f docker-compose.prod.yml restart        # Restart all"
echo "  docker-compose -f docker-compose.prod.yml down           # Stop all"
echo "  docker-compose -f docker-compose.prod.yml pull && docker-compose -f docker-compose.prod.yml up -d  # Update"
