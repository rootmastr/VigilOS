#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# VigilOS Server Deploy Script
# Usage: bash deploy.sh [pull|migrate|restart|full]
# ══════════════════════════════════════════════════════════════════════════════

set -e

# ── Config ──────────────────────────────────────────────────────────────────
APP_DIR="/opt/vigilos/vigil-server"
BRANCH="main"
LOG_FILE="/var/log/vigilos-deploy.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[DEPLOY]${NC} $1" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"; exit 1; }

timestamp() { date '+%Y-%m-%d %H:%M:%S'; }

# ── Functions ───────────────────────────────────────────────────────────────

pull_code() {
    log "$(timestamp) — Pulling latest code from GitHub..."
    cd "$APP_DIR" || error "Directory not found: $APP_DIR"
    git fetch origin "$BRANCH"
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse "origin/$BRANCH")
    
    if [ "$LOCAL" = "$REMOTE" ]; then
        log "Already up to date ($LOCAL)"
        return 1
    fi
    
    git pull origin "$BRANCH"
    log "Updated: $LOCAL -> $(git rev-parse HEAD)"
    return 0
}

install_deps() {
    log "$(timestamp) — Installing dependencies..."
    cd "$APP_DIR"
    npm ci --production 2>&1 | tail -5
    log "Dependencies installed"
}

run_migrations() {
    log "$(timestamp) — Running Prisma migrations..."
    cd "$APP_DIR"
    npx prisma generate 2>&1 | tail -3
    npx prisma migrate deploy 2>&1 | tail -5
    log "Migrations complete"
}

restart_server() {
    log "$(timestamp) — Restarting server..."
    cd "$APP_DIR"
    
    # Try PM2 first
    if command -v pm2 &> /dev/null; then
        pm2 restart vigil-server 2>/dev/null || pm2 start src/server.js --name vigil-server
        log "Server restarted via PM2"
        pm2 status vigil-server
    # Try systemd
    elif systemctl is-active --quiet vigil-server 2>/dev/null; then
        sudo systemctl restart vigil-server
        log "Server restarted via systemd"
    # Fallback: kill and start
    else
        pkill -f "node.*server.js" 2>/dev/null || true
        sleep 2
        nohup node src/server.js > /var/log/vigilos-server.log 2>&1 &
        log "Server started (PID: $!)"
    fi
}

health_check() {
    log "$(timestamp) — Running health check..."
    sleep 3
    PORT=$(grep PORT "$APP_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d '"' || echo "4141")
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/api/v1/health" 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "200" ]; then
        log "Health check PASSED (HTTP $HTTP_CODE)"
    else
        warn "Health check returned HTTP $HTTP_CODE — check logs"
    fi
}

# ── Main ────────────────────────────────────────────────────────────────────

case "${1:-full}" in
    pull)
        pull_code
        ;;
    migrate)
        run_migrations
        ;;
    restart)
        restart_server
        health_check
        ;;
    full)
        log "═══════════════════════════════════════════════════════════"
        log " VigilOS Deploy — $(timestamp)"
        log "═══════════════════════════════════════════════════════════"
        
        UPDATED=true
        pull_code || UPDATED=false
        
        if [ "$UPDATED" = true ]; then
            install_deps
            run_migrations
            restart_server
            health_check
            log "═══════════════════════════════════════════════════════════"
            log " Deploy complete!"
            log "═══════════════════════════════════════════════════════════"
        else
            log "No changes to deploy"
        fi
        ;;
    *)
        echo "Usage: $0 [pull|migrate|restart|full]"
        echo ""
        echo "  pull     - Pull latest code only"
        echo "  migrate  - Run Prisma migrations only"
        echo "  restart  - Restart server only"
        echo "  full     - Full deploy (default)"
        exit 1
        ;;
esac
