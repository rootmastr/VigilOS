#!/bin/bash
# ============================================
# VigilOS - Push to GitHub
# Run this from your laptop
# ============================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}=== VigilOS - Push to GitHub ===${NC}"

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo -e "${RED}Error: git is not installed${NC}"
    exit 1
fi

# Navigate to project directory
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
    echo -e "${YELLOW}No remote found. Please set your GitHub remote:${NC}"
    echo "  git remote add origin https://github.com/rootmastr/VigilOS.git"
    echo ""
    read -p "Or enter your GitHub repo URL: " REPO_URL
    if [ -n "$REPO_URL" ]; then
        git remote add origin "$REPO_URL"
    else
        echo -e "${RED}Error: No remote URL provided${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}Remote: $(git remote get-url origin)${NC}"

# Stage all files
echo -e "${YELLOW}Staging files...${NC}"
git add .

# Check if there are changes to commit
if git diff --cached --quiet; then
    echo -e "${YELLOW}No changes to commit${NC}"
else
    # Commit
    COMMIT_MSG="deploy: VigilOS $(date '+%Y-%m-%d %H:%M:%S')"
    echo -e "${YELLOW}Committing: $COMMIT_MSG${NC}"
    git commit -m "$COMMIT_MSG"
fi

# Push to GitHub
echo -e "${YELLOW}Pushing to GitHub...${NC}"
git push -u origin main 2>/dev/null || git push origin main

echo ""
echo -e "${GREEN}=== Successfully pushed to GitHub! ===${NC}"
echo -e "${GREEN}Repository: $(git remote get-url origin)${NC}"
echo ""
echo -e "${YELLOW}Next: Run deploy-server.sh on your Ubuntu server${NC}"
