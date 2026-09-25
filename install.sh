#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# DEOLS — One-Line Installer for Debian 12 (Bookworm)
# Usage: curl -sSL https://raw.githubusercontent.com/deols/deols/main/install.sh | bash
# ─────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

DEOLS_DIR="/opt/deols"
DEOLS_PORT="${DEOLS_PORT:-8443}"
NODE_VERSION="20"

# ─── Pre-flight Checks ──────────────────────────────────

echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║        DEOLS — Debian OpenLiteSpeed Panel           ║"
echo "║        Automated Installer v1.0.0                   ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Must be root
if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}Error: This installer must be run as root${NC}"
  exit 1
fi

# Must be Debian 12
if ! grep -q "bookworm" /etc/os-release 2>/dev/null; then
  echo -e "${YELLOW}Warning: This installer is designed for Debian 12 (Bookworm)${NC}"
  echo -e "Current OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2)"
  read -p "Continue anyway? (y/N): " CONTINUE
  [[ "$CONTINUE" != "y" && "$CONTINUE" != "Y" ]] && exit 1
fi

echo -e "${GREEN}✓ Running as root on Debian${NC}"

# ─── System Update ───────────────────────────────────────

echo -e "\n${CYAN}[1/8] Updating system packages…${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# ─── Install Essential Dependencies ─────────────────────

echo -e "${CYAN}[2/8] Installing dependencies…${NC}"
apt-get install -y -qq \
  curl wget gnupg2 ca-certificates lsb-release apt-transport-https \
  software-properties-common git unzip zip tar \
  ufw fail2ban \
  build-essential python3 python3-venv python3-pip \
  certbot

# ─── Install Node.js ────────────────────────────────────

echo -e "${CYAN}[3/8] Installing Node.js ${NODE_VERSION}.x…${NC}"
if ! command -v node &>/dev/null; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y -qq nodejs
fi
echo -e "${GREEN}✓ Node.js $(node -v) installed${NC}"

# ─── Install OpenLiteSpeed ───────────────────────────────

echo -e "${CYAN}[4/8] Installing OpenLiteSpeed + LSPHP…${NC}"
if ! command -v /usr/local/lsws/bin/lswsctrl &>/dev/null; then
  wget -qO - https://repo.litespeed.sh | bash
  apt-get install -y -qq openlitespeed lsphp83 lsphp83-common \
    lsphp83-mysql lsphp83-curl lsphp83-imagick lsphp83-imap \
    lsphp83-intl lsphp83-json lsphp83-memcached lsphp83-redis \
    lsphp83-opcache lsphp83-ioncube

  # Also install PHP 8.2 as an option
  apt-get install -y -qq lsphp82 lsphp82-common lsphp82-mysql \
    lsphp82-curl lsphp82-imagick lsphp82-opcache 2>/dev/null || true

  systemctl enable lsws
  systemctl start lsws
fi
echo -e "${GREEN}✓ OpenLiteSpeed installed${NC}"

# ─── Install MariaDB ────────────────────────────────────

echo -e "${CYAN}[5/8] Installing MariaDB…${NC}"
if ! command -v mysql &>/dev/null; then
  apt-get install -y -qq mariadb-server mariadb-client
  systemctl enable mariadb
  systemctl start mariadb

  # Secure installation (non-interactive)
  mysql -u root <<EOF
DELETE FROM mysql.user WHERE User='';
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
FLUSH PRIVILEGES;
EOF
fi
echo -e "${GREEN}✓ MariaDB installed and secured${NC}"

# ─── Install WP-CLI ──────────────────────────────────────

echo -e "${CYAN}[6/8] Installing WP-CLI…${NC}"
if ! command -v wp &>/dev/null; then
  curl -sO https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
  chmod +x wp-cli.phar
  mv wp-cli.phar /usr/local/bin/wp
fi
echo -e "${GREEN}✓ WP-CLI $(wp --version 2>/dev/null || echo 'installed')${NC}"

# ─── Install DEOLS Panel ────────────────────────────────

echo -e "${CYAN}[7/8] Setting up DEOLS Panel…${NC}"

# Clone or copy DEOLS
if [[ -d "$DEOLS_DIR" ]]; then
  echo -e "${YELLOW}DEOLS directory exists, updating…${NC}"
  cd "$DEOLS_DIR"
  git pull origin main 2>/dev/null || true
else
  # If running from cloned repo
  if [[ -f "./package.json" ]] && grep -q '"deols"' ./package.json 2>/dev/null; then
    cp -r . "$DEOLS_DIR"
  else
    git clone https://github.com/deols/deols.git "$DEOLS_DIR"
  fi
fi

cd "$DEOLS_DIR"

# Install Node.js dependencies
npm install --omit=dev --silent

# Create data directory
mkdir -p "$DEOLS_DIR/data"
mkdir -p "$DEOLS_DIR/data/dns"
chmod 700 "$DEOLS_DIR/data"

# Create .env file if not exists
if [[ ! -f "$DEOLS_DIR/.env" ]]; then
  cat > "$DEOLS_DIR/.env" <<ENVEOF
NODE_ENV=production
DEOLS_PORT=${DEOLS_PORT}
DEOLS_HOST=0.0.0.0
DEOLS_DATA_DIR=${DEOLS_DIR}/data
ENVEOF
  chmod 600 "$DEOLS_DIR/.env"
fi

echo -e "${GREEN}✓ DEOLS Panel installed${NC}"

# ─── Configure Systemd & Firewall ───────────────────────

echo -e "${CYAN}[8/8] Configuring systemd service & firewall…${NC}"

# Install systemd service
cp "$DEOLS_DIR/systemd/deols.service" /etc/systemd/system/deols.service
systemctl daemon-reload
systemctl enable deols
systemctl start deols

# Configure UFW
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP
ufw allow 443/tcp    # HTTPS
ufw allow ${DEOLS_PORT}/tcp  # DEOLS Panel
ufw allow 7080/tcp   # OLS WebAdmin (optional, can be removed)
echo "y" | ufw enable

# Configure Fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# Create web root directory
mkdir -p /var/www

echo -e "${GREEN}✓ Firewall and services configured${NC}"

# ─── Summary ────────────────────────────────────────────

SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║   ✅  DEOLS Installation Complete!                  ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
echo "║   Panel URL:  https://${SERVER_IP}:${DEOLS_PORT}     ║"
echo "║                                                      ║"
echo "║   On first visit, you will be prompted to create     ║"
echo "║   your admin account.                                ║"
echo "║                                                      ║"
echo "║   OLS Admin:  https://${SERVER_IP}:7080              ║"
echo "║                                                      ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║   Installed:                                         ║"
echo "║   • OpenLiteSpeed + LSPHP 8.3                       ║"
echo "║   • MariaDB Server                                  ║"
echo "║   • Node.js $(node -v)                              ║"
echo "║   • WP-CLI                                          ║"
echo "║   • Certbot (Let's Encrypt)                         ║"
echo "║   • UFW Firewall (enabled)                          ║"
echo "║   • Fail2ban (active)                               ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "Manage: ${CYAN}systemctl {start|stop|restart|status} deols${NC}"
echo ""
