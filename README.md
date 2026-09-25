# DEOLS — Debian OpenLiteSpeed Management Panel

<p align="center">
  <strong>⚡ Ultra-lightweight, zero-bloat server management panel</strong><br>
  <em>Built for Debian 12 + OpenLiteSpeed + WordPress at scale</em>
</p>

---

## ✨ Overview

**DEOLS** is a free, open-source, high-performance server management panel purpose-built for **Debian 12 (Bookworm)** and **OpenLiteSpeed**. It automates WordPress hosting, SSL management, security hardening, and custom service deployment with a clean, modern UI and minimal memory footprint.

| Feature | Details |
|---|---|
| **OS** | Debian 12 (Bookworm) x86_64 |
| **Web Server** | OpenLiteSpeed + LSPHP 8.2 / 8.3 |
| **Database** | MariaDB 10.11+ |
| **Panel Backend** | Node.js (Fastify) — < 50MB idle RAM |
| **Panel Frontend** | Vanilla JS SPA — premium dark/light UI |
| **License** | MIT (100% Free & Open Source) |

---

## 🚀 One-Line Installation

```bash
curl -sSL https://raw.githubusercontent.com/deols/deols/main/install.sh | bash
```

The installer will automatically:
- Update system packages
- Install Node.js 20.x, OpenLiteSpeed, LSPHP 8.3, MariaDB, WP-CLI, Certbot
- Configure UFW firewall & Fail2ban
- Start the DEOLS daemon on port `8443`

---

## 🎯 Core Features

### A. One-Click WordPress Deployment
- Automated OLS Virtual Host creation
- Auto-generated MariaDB database + secure credentials
- WP-CLI-driven WordPress installation
- Pre-configured **LiteSpeed Cache (LSCache)** plugin
- **Wildcard subdomain** support (`*.domain.com`)

### B. Automated SSL Management
- Standard Let's Encrypt SSL via Certbot webroot
- **Wildcard SSL** via DNS-01 API (Cloudflare, DigitalOcean, etc.)
- Auto-renewal with OLS graceful restart hook

### C. File Manager
- Browse, Upload, Edit, Delete, Extract (`.zip`, `.tar.gz`)
- CHMOD permissions management
- One-click permission repair utility

### D. Cache Control
- Global and per-site OLS full-page cache purge
- Redis / Memcached management (install, toggle, flush)

### E. Git Deploy
- SSH key management for deployment users
- Repository sync with automated `git pull`
- GitHub/GitLab webhook endpoints for auto-deploy

### F. Cron Job Manager
- Visual crontab editor with validation
- WordPress system cron presets

### G. Python Service Engine
- Upload Python scripts with auto-generated `venv`
- Install `requirements.txt` dependencies
- Auto-create systemd service files
- Full lifecycle management (start/stop/restart/logs)

### H. Security Hardening
- UFW firewall rules manager
- Fail2ban configuration for SSH + WordPress
- **🛡️ Emergency Anti-Attack Mode** — single-button lockdown:
  - Block XMLRPC globally
  - Enforce aggressive OLS rate limits
  - Tighten Fail2ban thresholds
  - Enable anti-crawler protection

---

## 📁 Project Structure

```
DEOLS/
├── README.md
├── LICENSE                     # MIT License
├── package.json
├── install.sh                  # One-line Debian 12 installer
├── systemd/
│   └── deols.service           # Systemd service unit
├── backend/
│   ├── index.js                # Fastify daemon entry point
│   ├── config.js               # Centralized configuration
│   ├── utils/
│   │   └── shell.js            # Safe command execution utilities
│   ├── api/
│   │   ├── auth.js             # Authentication (Argon2id + JWT)
│   │   ├── sites.js            # WordPress site provisioning
│   │   ├── ssl.js              # Let's Encrypt SSL management
│   │   ├── databases.js        # MariaDB CRUD
│   │   ├── files.js            # File manager (browse/upload/edit)
│   │   ├── terminal.js         # WebSocket PTY terminal
│   │   ├── cron.js             # Cron job manager
│   │   ├── firewall.js         # UFW rules management
│   │   ├── services.js         # Systemd service control
│   │   ├── git.js              # SSH keys + Git sync engine
│   │   ├── cache.js            # OLS/Redis/Memcached cache
│   │   ├── system.js           # System metrics & info
│   │   ├── python.js           # Python service engine
│   │   └── security.js         # Fail2ban + Anti-attack mode
│   └── templates/
│       └── vhconf.template     # OLS vhost config template
└── frontend/
    ├── index.html              # SPA shell
    ├── build.js                # Static asset builder
    ├── src/
    │   ├── styles.css          # Premium CSS design system
    │   └── app.js              # SPA application (vanilla JS)
    └── dist/                   # Production static assets
```

---

## ⚙️ Configuration

Environment variables (set in `/opt/deols/.env`):

| Variable | Default | Description |
|---|---|---|
| `DEOLS_PORT` | `8443` | Panel listening port |
| `DEOLS_HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `production` | Environment mode |
| `DEOLS_DATA_DIR` | `/opt/deols/data` | Persistent data directory |
| `DB_HOST` | `127.0.0.1` | MariaDB host |
| `DB_PASSWORD` | *(empty)* | MariaDB root password |

---

## 🛠️ Development

```bash
# Clone the repo
git clone https://github.com/deols/deols.git
cd deols

# Install dependencies
npm install

# Run in development mode (with auto-reload)
npm run dev

# Build frontend for production
npm run build:frontend
```

---

## 📦 Service Management

```bash
# Start / Stop / Restart
systemctl start deols
systemctl stop deols
systemctl restart deols

# View logs
journalctl -u deols -f

# Check status
systemctl status deols
```

---

## 🔐 Security

- **Authentication**: Argon2id password hashing + JWT tokens in httpOnly cookies
- **Rate Limiting**: Login endpoint limited to 5 attempts per 5 minutes
- **Path Traversal Protection**: File manager restricted to `/var/www` root
- **Command Safety**: Dangerous shell commands blocklisted
- **Secrets**: Auto-generated JWT and cookie secrets with `0600` permissions
- **Critical Service Guards**: Cannot stop SSH or DEOLS daemon via panel

---

## 📄 License

[MIT License](./LICENSE) — Free and open source forever.

---

<p align="center">
  Built with ⚡ for the OpenLiteSpeed community
</p>
