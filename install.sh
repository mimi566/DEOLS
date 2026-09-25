#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# DEOLS — One-Line Installer for Debian 12 (Bookworm)
# Usage: curl -sSL https://raw.githubusercontent.com/mimi566/DEOLS/main/install.sh | bash
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
  certbot python3-certbot-dns-cloudflare

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
  apt-get update -qq
  apt-get install -y -qq openlitespeed lsphp83 lsphp83-common \
    lsphp83-mysql lsphp83-curl lsphp83-opcache
fi

# Install LSPHP extensions safely (skip non-existent ones such as json/ioncube in PHP 8.x)
for pkg in lsphp83-intl lsphp83-imagick lsphp83-redis lsphp83-memcached lsphp83-imap; do
  apt-get install -y -qq "$pkg" 2>/dev/null || true
done

# Install LSPHP 8.2 support
for pkg in lsphp82 lsphp82-common lsphp82-mysql lsphp82-curl lsphp82-opcache lsphp82-intl lsphp82-imagick lsphp82-redis; do
  apt-get install -y -qq "$pkg" 2>/dev/null || true
done

# Set up standard symlinks
if [[ -f /usr/local/lsws/lsphp83/bin/lsphp ]]; then
  mkdir -p /usr/local/lsws/fcgi-bin 2>/dev/null || true
  ln -sf /usr/local/lsws/lsphp83/bin/lsphp /usr/local/lsws/fcgi-bin/lsphp83 2>/dev/null || true
  ln -sf /usr/local/lsws/lsphp83/bin/lsphp /usr/local/lsws/fcgi-bin/lsphp 2>/dev/null || true
fi

systemctl enable lsws 2>/dev/null || true
systemctl start lsws 2>/dev/null || true
echo -e "${GREEN}✓ OpenLiteSpeed installed${NC}"

# ─── Install MariaDB ────────────────────────────────────

echo -e "${CYAN}[5/8] Installing MariaDB…${NC}"
if ! command -v mysql &>/dev/null; then
  apt-get install -y -qq mariadb-server mariadb-client
  systemctl enable mariadb 2>/dev/null || true
  systemctl start mariadb 2>/dev/null || true

  # Secure installation (non-interactive)
  mysql -u root <<EOF 2>/dev/null || true
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
  curl -fsSL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o /usr/local/bin/wp 2>/dev/null || true
  chmod +x /usr/local/bin/wp 2>/dev/null || true
fi
echo -e "${GREEN}✓ WP-CLI $(wp --version 2>/dev/null || echo 'installed')${NC}"

# ─── Install DEOLS Panel ────────────────────────────────

echo -e "${CYAN}[7/8] Setting up DEOLS Panel…${NC}"

# Clone or copy DEOLS
if [[ -d "$DEOLS_DIR/.git" ]]; then
  echo -e "${YELLOW}DEOLS directory exists, updating…${NC}"
  cd "$DEOLS_DIR"
  git pull origin main 2>/dev/null || true
elif [[ -d "$DEOLS_DIR" && -f "$DEOLS_DIR/package.json" ]]; then
  echo -e "${YELLOW}DEOLS directory exists, proceeding…${NC}"
  cd "$DEOLS_DIR"
else
  # If running from cloned repo
  if [[ -f "./package.json" ]] && grep -q '"deols"' ./package.json 2>/dev/null; then
    mkdir -p "$DEOLS_DIR"
    cp -r . "$DEOLS_DIR"
  else
    rm -rf "$DEOLS_DIR" 2>/dev/null || true
    git clone https://github.com/mimi566/DEOLS.git "$DEOLS_DIR"
  fi
fi

cd "$DEOLS_DIR"

# Install Node.js dependencies
npm install --omit=dev --silent --no-audit --no-fund

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

# Install systemd services
cp "$DEOLS_DIR/systemd/deols.service" /etc/systemd/system/deols.service
if [[ -f "$DEOLS_DIR/systemd/deols-cron.service" ]]; then
  cp "$DEOLS_DIR/systemd/deols-cron.service" /etc/systemd/system/deols-cron.service
  systemctl enable deols-cron 2>/dev/null || true
  systemctl start deols-cron 2>/dev/null || true
fi
systemctl daemon-reload
systemctl enable deols 2>/dev/null || true
systemctl start deols 2>/dev/null || true

# Configure UFW
ufw default deny incoming 2>/dev/null || true
ufw default allow outgoing 2>/dev/null || true
ufw allow 22/tcp 2>/dev/null || true     # SSH
SSH_PORT=$(ss -tlnp 2>/dev/null | grep -E 'sshd|ssh' | awk '{print $4}' | awk -F: '{print $NF}' | head -n1 || true)
if [[ -n "$SSH_PORT" && "$SSH_PORT" != "22" ]]; then
  ufw allow "${SSH_PORT}/tcp" 2>/dev/null || true
fi
ufw allow 80/tcp 2>/dev/null || true     # HTTP
ufw allow 443/tcp 2>/dev/null || true    # HTTPS
ufw allow ${DEOLS_PORT}/tcp 2>/dev/null || true  # DEOLS Panel
ufw allow 7080/tcp 2>/dev/null || true   # OLS WebAdmin
echo "y" | ufw enable 2>/dev/null || true

# Configure Fail2ban
systemctl enable fail2ban 2>/dev/null || true
# Create web root directory
mkdir -p /var/www

# Symlink deols CLI utility globally
chmod +x "$DEOLS_DIR/bin/deols-cli.js" "$DEOLS_DIR/bin/deols-automation.js" 2>/dev/null || true
ln -sf "$DEOLS_DIR/bin/deols-cli.js" /usr/local/bin/deols

# Generate initial secure credentials via Root SSH
echo -e "${CYAN}Generating secure root admin credentials…${NC}"
ADMIN_PASS=$(node -e "const b=crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g,'X').slice(0,12)+'!9';console.log(b)")
node "$DEOLS_DIR/bin/deols-cli.js" admin setpass "$ADMIN_PASS" >/dev/null 2>&1 || true

OLS_PASS=$(node -e "const b=crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g,'X').slice(0,12)+'!9';console.log(b)")
node "$DEOLS_DIR/bin/deols-cli.js" ols password "$OLS_PASS" >/dev/null 2>&1 || true

echo -e "${GREEN}✓ Firewall and services configured${NC}"
echo -e "${GREEN}✓ CLI command 'deols' installed to /usr/local/bin/deols${NC}"

# ─── Summary ────────────────────────────────────────────

SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[[ -z "$SERVER_IP" ]] && SERVER_IP="YOUR_SERVER_IP"

echo ""
echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          ✅  DEOLS Installation Complete!                    ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║   DEOLS Panel:  http://${SERVER_IP}:${DEOLS_PORT}               ║"
echo "║   Username:     admin                                        ║"
echo "║   Password:     ${ADMIN_PASS}                         ║"
echo "║                                                              ║"
echo "║   OLS WebAdmin: https://${SERVER_IP}:7080                    ║"
echo "║   Username:     admin                                        ║"
echo "║   Password:     ${OLS_PASS}                         ║"
echo "║                                                              ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║   SECURITY NOTICE (Root SSH Only):                           ║"
echo "║   Web-based password reset is disabled for safety.           ║"
echo "║   • Reset Panel Password: deols admin reset                  ║"
echo "║   • Set Panel Password:   deols admin setpass <password>     ║"
echo "║   • Reset OLS Password:   deols ols reset-pass               ║"
echo "║   • Check System Status:  deols status                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "Service Control: ${CYAN}systemctl {start|stop|restart|status} deols${NC}"
echo -e "CLI Manual:      ${CYAN}deols help${NC}"
echo ""
