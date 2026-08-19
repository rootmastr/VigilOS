#!/bin/bash
# ============================================
# VigilOS - Full Deployment Guide
# Step by step from laptop to server
# ============================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

clear
echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║            VigilOS - Full Deployment Guide                 ║"
echo "║            From Laptop to Ubuntu Server                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ═══════════════════════════════════════════════════════════════
# STEP 0: Check prerequisites
# ═══════════════════════════════════════════════════════════════
echo -e "${YELLOW}[STEP 0] Checking prerequisites...${NC}"

if ! command -v git &> /dev/null; then
    echo -e "${RED}Error: git is not installed${NC}"
    exit 1
fi

if ! command -v ssh &> /dev/null; then
    echo -e "${RED}Error: ssh is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Git and SSH are installed${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════
# STEP 1: Prepare server info
# ═══════════════════════════════════════════════════════════════
echo -e "${YELLOW}[STEP 1] Server Information${NC}"
echo -e "${CYAN}Please provide your Ubuntu server details:${NC}"
echo ""

read -p "Server IP address: " SERVER_INPUT
# Strip protocol prefix if provided
SERVER_IP=$(echo "$SERVER_INPUT" | sed -E 's|^https?://||; s|/.*||; s|:.*||')
read -p "Server SSH port [22]: " SSH_PORT
SSH_PORT=${SSH_PORT:-22}
read -p "Server SSH username [root]: " SSH_USER
SSH_USER=${SSH_USER:-root}
read -p "GitHub repository URL [https://github.com/rootmastr/VigilOS.git]: " REPO_URL
REPO_URL=${REPO_URL:-"https://github.com/rootmastr/VigilOS.git"}

echo ""
echo -e "${GREEN}Server: ${SSH_USER}@${SERVER_IP}:${SSH_PORT}${NC}"
echo -e "${GREEN}Repository: ${REPO_URL}${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════
# STEP 2: Test SSH connection
# ═══════════════════════════════════════════════════════════════
echo -e "${YELLOW}[STEP 2] Testing SSH connection to server...${NC}"

if ssh -p "$SSH_PORT" -o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=accept-new "${SSH_USER}@${SERVER_IP}" "echo 'SSH connection successful'" 2>/dev/null; then
    echo -e "${GREEN}✓ SSH connection successful${NC}"
else
    echo -e "${RED}✗ SSH connection failed${NC}"
    echo -e "${YELLOW}Please ensure:${NC}"
    echo "  1. Server is running"
    echo "  2. SSH is enabled"
    echo "  3. Correct IP, port, and username"
    echo "  4. SSH key is configured (or use ssh-copy-id)"
    echo ""
    echo -e "${YELLOW}To setup SSH key:${NC}"
    echo "  ssh-copy-id -p ${SSH_PORT} ${SSH_USER}@${SERVER_IP}"
    echo ""
    read -p "Continue anyway? (y/N): " CONTINUE
    if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
        exit 1
    fi
fi
echo ""

# ═══════════════════════════════════════════════════════════════
# STEP 3: Push code to GitHub
# ═══════════════════════════════════════════════════════════════
echo -e "${YELLOW}[STEP 3] Pushing code to GitHub...${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if this is a git repository
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}Initializing git repository...${NC}"
    git init
    git branch -M main
fi

# Check remote
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ -z "$REMOTE_URL" ]; then
    echo -e "${YELLOW}Setting remote origin...${NC}"
    git remote add origin "$REPO_URL"
else
    echo -e "${GREEN}Remote already set: $REMOTE_URL${NC}"
fi

# Stage and commit
echo -e "${YELLOW}Staging files...${NC}"
git add .

if ! git diff --cached --quiet; then
    COMMIT_MSG="deploy: VigilOS $(date '+%Y-%m-%d %H:%M:%S')"
    echo -e "${YELLOW}Committing: $COMMIT_MSG${NC}"
    git commit -m "$COMMIT_MSG"
else
    echo -e "${YELLOW}No changes to commit${NC}"
fi

# Push to GitHub
echo -e "${YELLOW}Pushing to GitHub...${NC}"
git push -u origin main 2>/dev/null || git push origin main

echo -e "${GREEN}✓ Code pushed to GitHub${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════
# STEP 4: Deploy to server
# ═══════════════════════════════════════════════════════════════
echo -e "${YELLOW}[STEP 4] Deploying to server...${NC}"
echo -e "${CYAN}Running deploy-server.sh on ${SSH_USER}@${SERVER_IP}...${NC}"
echo ""

# Copy deploy script to server
echo -e "${YELLOW}Copying deploy script to server...${NC}"
scp -P "$SSH_PORT" -o StrictHostKeyChecking=accept-new deploy-server.sh "${SSH_USER}@${SERVER_IP}:/tmp/"

# Execute deploy script on server
echo -e "${YELLOW}Executing deploy script on server...${NC}"
ssh -t -p "$SSH_PORT" "${SSH_USER}@${SERVER_IP}" "chmod +x /tmp/deploy-server.sh && sudo /tmp/deploy-server.sh"

echo ""
echo -e "${GREEN}✓ Deployment complete!${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════
# STEP 5: Verify deployment
# ═══════════════════════════════════════════════════════════════
echo -e "${YELLOW}[STEP 5] Verifying deployment...${NC}"

echo -e "${CYAN}Testing frontend...${NC}"
if curl -s -o /dev/null -w "%{http_code}" "http://${SERVER_IP}:8181" | grep -q "200"; then
    echo -e "${GREEN}✓ Frontend is accessible${NC}"
else
    echo -e "${RED}✗ Frontend not accessible yet (may need a few seconds to start)${NC}"
fi

echo -e "${CYAN}Testing backend API...${NC}"
if curl -s -o /dev/null -w "%{http_code}" "http://${SERVER_IP}:4141/api/v1/health" | grep -q "200"; then
    echo -e "${GREEN}✓ Backend API is accessible${NC}"
else
    echo -e "${RED}✗ Backend API not accessible yet${NC}"
fi

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗"
echo -e "║                    Deployment Summary                      ║"
echo -e "╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Frontend:    http://${SERVER_IP}:8181${NC}"
echo -e "${GREEN}Backend API: http://${SERVER_IP}:4141/api/v1${NC}"
echo -e "${GREEN}WebSocket:   ws://${SERVER_IP}:4141/ws${NC}"
echo -e "${GREEN}Socket.io:   http://${SERVER_IP}:8181/socket.io/${NC}"
echo ""
echo -e "${YELLOW}Default login:${NC}"
echo -e "  Email:    ${GREEN}admin@vigilos.id${NC}"
echo -e "  Password: ${GREEN}admin123${NC}"
echo ""
echo -e "${YELLOW}Useful server commands:${NC}"
echo "  ssh -p ${SSH_PORT} ${SSH_USER}@${SERVER_IP}"
echo "  cd /opt/vigilos"
echo "  docker-compose -f docker-compose.prod.yml logs -f        # View logs"
echo "  docker-compose -f docker-compose.prod.yml ps             # Check status"
echo "  docker-compose -f docker-compose.prod.yml restart        # Restart all"
echo ""
