#!/bin/bash
# One-time setup script for a fresh Ubuntu 24.04 DigitalOcean droplet
# Run as root: bash setup-droplet.sh
set -euo pipefail

echo "=== Bidtomo Droplet Setup ==="

# 1. Update system
echo "Updating system packages..."
apt-get update && apt-get upgrade -y

# 2. Install Docker Engine
echo "Installing Docker..."
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verify Docker
docker --version
docker compose version

# 3. Install fail2ban for SSH protection
echo "Installing fail2ban..."
apt-get install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# 4. Configure UFW firewall
echo "Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw --force enable

# 5. Create app directory
echo "Setting up app directory..."
mkdir -p /opt/bidtomo
cd /opt/bidtomo

# 6. Clone repo (or user can scp/rsync)
if [ -n "${REPO_URL:-}" ]; then
  apt-get install -y git
  git clone "$REPO_URL" .
  echo "Repository cloned."
else
  echo "No REPO_URL set. Clone your repo manually:"
  echo "  cd /opt/bidtomo && git clone <your-repo-url> ."
fi

# 7. Copy env template
if [ -f .env.production.example ]; then
  cp .env.production.example .env
  echo "Copied .env.production.example to .env — edit it with your values."
fi

echo ""
echo "=== Setup complete! ==="
echo "Next steps:"
echo "  1. cd /opt/bidtomo"
echo "  2. Edit .env with your production values"
echo "  3. Run: bash scripts/deploy.sh"
