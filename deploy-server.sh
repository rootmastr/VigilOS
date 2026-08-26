#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# VigilOS Server Deploy Script
# Run on Ubuntu server: sudo bash deploy-server.sh [full|pull|restart|status|logs]
# ══════════════════════════════════════════════════════════════════════════════

set -e

# ── Config ──────────────────────────────────────────────────────────────────
APP_DIR="/opt/vigilos"
REPO_URL="https://github.com/rootmastr/VigilOS.git"
BRANCH="main"
COMPOSE_FILE="docker-compose.prod.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[→]${NC} $1"; }

# ── Check root ──────────────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    err "Run as root: sudo bash deploy-server.sh $1"
fi

# ── Install Docker ──────────────────────────────────────────────────────────
install_docker() {
    if command -v docker &> /dev/null; then
        log "Docker already installed"
        return
    fi

    info "Installing Docker..."
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    log "Docker installed"
}

# ── Clone / Pull repo ──────────────────────────────────────────────────────
sync_repo() {
    mkdir -p "$APP_DIR"
    cd "$APP_DIR"

    if [ -d ".git" ]; then
        info "Pulling latest changes..."
        git fetch origin "$BRANCH"
        LOCAL=$(git rev-parse HEAD)
        REMOTE=$(git rev-parse "origin/$BRANCH")
        if [ "$LOCAL" = "$REMOTE" ]; then
            log "Already up to date"
            return 1
        fi
        git pull origin "$BRANCH"
        log "Updated: $LOCAL → $(git rev-parse --short HEAD)"
        return 0
    else
        if [ "$(ls -A 2>/dev/null)" ]; then
            warn "Cleaning existing files in $APP_DIR..."
            rm -rf "$APP_DIR"/* "$APP_DIR"/.[!.]* 2>/dev/null || true
        fi
        info "Cloning repository..."
        git clone -b "$BRANCH" --depth 1 "$REPO_URL" .
        log "Repository cloned"
        return 0
    fi
}

# ── Create .env ─────────────────────────────────────────────────────────────
setup_env() {
    if [ -f ".env" ]; then
        log ".env already exists"
        return
    fi

    info "Generating .env with random secrets..."
    SERVER_IP=$(hostname -I | awk '{print $1}')
    cat > .env << EOF
# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=vigil_prod
DB_USER=vigil_admin
DB_PASSWORD=$(openssl rand -hex 32)

# Redis
REDIS_URL=redis://redis:6379

# InfluxDB
INFLUX_URL=http://influxdb:8086
INFLUX_TOKEN=$(openssl rand -hex 32)
INFLUX_PASSWORD=$(openssl rand -hex 16)

# JWT
JWT_SECRET=$(openssl rand -hex 64)
JWT_EXPIRY=24h

# Encryption
ENCRYPTION_KEY=$(openssl rand -hex 32)

# MQTT
MQTT_BROKER=mqtt://mosquitto:1883
MQTT_USERNAME=vigil_server
MQTT_PASSWORD=$(openssl rand -hex 16)

# Server
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# CORS
CORS_ORIGIN=http://${SERVER_IP}:8181,http://localhost:8181,http://localhost:52604,http://localhost:5173
EOF
    log ".env created with generated secrets"
}

# ── Build & Deploy ──────────────────────────────────────────────────────────
deploy_containers() {
    cd "$APP_DIR"

    info "Stopping existing containers..."
    docker-compose -f "$COMPOSE_FILE" down 2>/dev/null || true

    info "Building containers (no cache)..."
    docker-compose -f "$COMPOSE_FILE" build --no-cache

    info "Starting containers..."
    docker-compose -f "$COMPOSE_FILE" up -d

    info "Waiting for services to be healthy..."
    sleep 15

    log "Containers started"
}

# ── Run migrations ──────────────────────────────────────────────────────────
run_migrations() {
    cd "$APP_DIR"
    info "Running Prisma migrations..."
    docker-compose -f "$COMPOSE_FILE" exec -T server npx prisma generate 2>/dev/null || true
    docker-compose -f "$COMPOSE_FILE" exec -T server npx prisma migrate deploy 2>/dev/null || true
    log "Migrations complete"
}

# ── Health check ────────────────────────────────────────────────────────────
health_check() {
    cd "$APP_DIR"
    SERVER_IP=$(hostname -I | awk '{print $1}')

    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"

    # Container status
    docker-compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    echo ""

    # HTTP checks
    for svc in "Frontend:8181" "Backend:4141"; do
        NAME="${svc%%:*}"
        PORT="${svc##*:}"
        CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}" 2>/dev/null || echo "000")
        if [ "$CODE" = "200" ] || [ "$CODE" = "301" ] || [ "$CODE" = "302" ]; then
            log "$NAME: HTTP $CODE ✓"
        else
            warn "$NAME: HTTP $CODE"
        fi
    done

    echo ""
    echo -e "${GREEN}Frontend:    http://${SERVER_IP}:8181${NC}"
    echo -e "${GREEN}Backend API: http://${SERVER_IP}:4141/api/v1${NC}"
    echo -e "${GREEN}WebSocket:   ws://${SERVER_IP}:4141/ws${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
}

# ── Show status ─────────────────────────────────────────────────────────────
show_status() {
    cd "$APP_DIR"
    echo -e "${CYAN}══════════ Container Status ══════════${NC}"
    docker-compose -f "$COMPOSE_FILE" ps
    echo ""
    echo -e "${CYAN}══════════ Recent Logs (last 20) ══════════${NC}"
    docker-compose -f "$COMPOSE_FILE" logs --tail=20
}

# ── Show logs ───────────────────────────────────────────────────────────────
show_logs() {
    cd "$APP_DIR"
    docker-compose -f "$COMPOSE_FILE" logs -f --tail=100
}

# ── Main ────────────────────────────────────────────────────────────────────
echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║         VigilOS Server Deploy                       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

case "${1:-full}" in
    full)
        install_docker
        UPDATED=true
        sync_repo || UPDATED=false
        if [ "$UPDATED" = true ]; then
            setup_env
            deploy_containers
            run_migrations
            health_check
        fi
        ;;
    pull)
        sync_repo || true
        ;;
    restart)
        cd "$APP_DIR"
        docker-compose -f "$COMPOSE_FILE" restart
        health_check
        ;;
    stop)
        cd "$APP_DIR"
        docker-compose -f "$COMPOSE_FILE" down
        log "All containers stopped"
        ;;
    start)
        cd "$APP_DIR"
        docker-compose -f "$COMPOSE_FILE" up -d
        health_check
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    migrate)
        run_migrations
        ;;
    *)
        echo "Usage: $0 [full|pull|restart|stop|start|status|logs|migrate]"
        echo ""
        echo "  full     — Full deploy (install docker + pull + build + start)"
        echo "  pull     — Pull latest code only"
        echo "  restart  — Restart all containers"
        echo "  stop     — Stop all containers"
        echo "  start    — Start all containers"
        echo "  status   — Show container status"
        echo "  logs     — Tail container logs"
        echo "  migrate  — Run Prisma migrations"
        exit 1
        ;;
esac
