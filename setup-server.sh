#!/bin/bash
# ============================================
# VigilOS - Initial Server Setup
# Run this on a fresh Ubuntu server
# ============================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}=== VigilOS - Initial Server Setup ===${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Please run as root (sudo)${NC}"
    exit 1
fi

# Update system
echo -e "${YELLOW}Updating system...${NC}"
apt-get update && apt-get upgrade -y

# Install essential packages
echo -e "${YELLOW}Installing essential packages...${NC}"
apt-get install -y \
    curl \
    wget \
    git \
    vim \
    htop \
    net-tools \
    ufw \
    fail2ban \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

# Configure firewall
echo -e "${YELLOW}Configuring firewall...${NC}"
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 1883/tcp    # MQTT
ufw allow 9001/tcp    # MQTT WebSocket
echo "y" | ufw enable

# Configure fail2ban
echo -e "${YELLOW}Configuring fail2ban...${NC}"
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
EOF
systemctl enable fail2ban
systemctl start fail2ban

# Install Docker
echo -e "${YELLOW}Installing Docker...${NC}"
apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker
systemctl start docker

# Install Docker Compose
echo -e "${YELLOW}Installing Docker Compose...${NC}"
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Create deployment user
echo -e "${YELLOW}Creating deployment user...${NC}"
useradd -m -s /bin/bash vigil 2>/dev/null || true
usermod -aG docker vigil 2>/dev/null || true

# Create app directory
mkdir -p /opt/vigilos
chown vigil:vigil /opt/vigilos

# Create deployment script
cat > /opt/vigilos/deploy.sh << 'DEPLOY_SCRIPT'
#!/bin/bash
set -e
cd /opt/vigilos
git pull origin main
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
echo "Deployment complete!"
DEPLOY_SCRIPT
chmod +x /opt/vigilos/deploy.sh
chown vigil:vigil /opt/vigilos/deploy.sh

# Setup automatic security updates
echo -e "${YELLOW}Setting up automatic security updates...${NC}"
apt-get install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

echo ""
echo -e "${GREEN}=== Server setup complete! ===${NC}"
echo -e "${GREEN}Next steps:${NC}"
echo "  1. SSH as vigil user: ssh vigil@YOUR_SERVER_IP"
echo "  2. Run deploy script: sudo /opt/vigilos/deploy.sh"
echo ""
echo -e "${YELLOW}Firewall status:${NC}"
ufw status
