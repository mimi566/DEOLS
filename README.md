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

## 🚀 Quick VPS Installation

Run this command as `root` on a fresh **Debian 12 (Bookworm)** server:

```bash
curl -sSL https://raw.githubusercontent.com/mimi566/DEOLS/main/install.sh | bash
```

Or install via manual git clone from the public repository:

```bash
git clone https://github.com/mimi566/DEOLS.git /opt/deols
cd /opt/deols
bash install.sh
```

The automated installer will:
- Update Debian packages & install essential utilities
- Install Node.js 20.x LTS, OpenLiteSpeed, LSPHP 8.3 & 8.2, MariaDB 10.11+, WP-CLI, Certbot & Cloudflare DNS plugin
- Configure UFW firewall & Fail2ban security jails
- Launch the DEOLS daemon as a systemd service on port `8443`
- **Generate secure root admin credentials and print them in your terminal**

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
git clone https://github.com/mimi566/DEOLS.git /opt/deols
cd /opt/deols

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

## 📖 Comprehensive Deployment & Administration Guide

This guide provides complete instructions for administering servers with **DEOLS**, designed to match and exceed the capabilities of panels like [CyberPanel](https://github.com/usmannasir/cyberpanel) while maintaining an ultra-lightweight footprint (< 50MB RAM) on Debian 12.

---

### 1. Architecture & Security Model

DEOLS is built on a **Zero-Trust Root SSH Security Model** modeled after CyberPanel's command-line password management:
- **No Web-Based Registration**: The panel cannot be initialized or claimed by arbitrary web visitors.
- **SSH-Only Admin Generation & Resets**: Administrative passwords can only be generated or reset via root SSH terminal access (`deols admin reset`).
- **OpenLiteSpeed (OLS) Native Integration**: Direct control over the OpenLiteSpeed web server daemon, configuration files, and the official OLS WebAdmin console on port `7080`.
- **LSPHP High-Performance Process Manager**: Native PHP-LSAPI integration providing up to 3x higher throughput compared to Apache or Nginx PHP-FPM.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DEBIAN 12 (BOOKWORM) SERVER                    │
├────────────────────────────────┬───────────────────────────────────────┤
│    DEOLS PANEL DAEMON          │       OPENLITESPEED WEB ENGINE        │
│    • Port: 8443 (HTTPS)        │       • Port: 80 / 443 (HTTP/3 QUIC)  │
│    • Fastify + Argon2id + JWT  │       • OLS WebAdmin: 7080 (HTTPS)    │
│    • Root SSH CLI Utility      │       • Native LSPHP 8.2 / 8.3        │
│    • Memory: < 50MB RSS        │       • LSCache Engine (/cachedata)   │
├────────────────────────────────┴───────────────────────────────────────┤
│    SERVICES & SECURITY LAYER                                           │
│    • MariaDB 10.11+ Database Engine                                    │
│    • UFW Firewall + Fail2ban (SSH & WordPress Jails)                   │
│    • Certbot SSL Automation + Cloudflare DNS-01 API                    │
│    • Python Virtualenvs & Systemd Service Supervisor                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 2. System Requirements & Port Matrix

#### Minimum Hardware Requirements
| Resource | Minimum | Recommended (Production) |
|---|---|---|
| **Operating System** | Debian 12 (Bookworm) 64-bit | Debian 12 (Bookworm) 64-bit |
| **CPU** | 1 vCPU (x86_64) | 2+ vCPU cores |
| **RAM** | 1 GB | 2 GB+ (for Redis + multiple WP sites) |
| **Disk** | 10 GB SSD / NVMe | 25 GB+ NVMe SSD |

#### Network & Firewall Ports
Ensure your cloud provider security groups (AWS, Hetzner, DigitalOcean, Linode) allow the following ports:

| Port | Protocol | Purpose | Direction |
|---|---|---|---|
| `22` | TCP | SSH Server Access | Inbound |
| `80` | TCP | HTTP Web Traffic (Let's Encrypt HTTP-01) | Inbound |
| `443` | TCP / UDP | HTTPS Web Traffic + HTTP/3 (QUIC) | Inbound |
| `8443` | TCP | DEOLS Panel Web Interface | Inbound |
| `7080` | TCP | OpenLiteSpeed WebAdmin Console | Inbound |

---

### 3. Step-by-Step VPS Installation Guide

You can deploy DEOLS on any VPS provider (such as **Hetzner Cloud**, **DigitalOcean Droplets**, **Linode / Akamai**, **Vultr**, **AWS EC2**, or **OVH**).

#### Step 1: Provision your VPS
1. Select **Debian 12 (Bookworm) 64-bit** as your base operating system.
2. Choose at least 1 vCPU and 1 GB RAM (2 GB+ recommended for production WordPress with Redis cache).
3. Ensure inbound firewall ports `80`, `443`, `8443`, `7080`, and `22` are open.

#### Step 2: Connect to your VPS via SSH as Root
```bash
ssh root@YOUR_VPS_IP
```

#### Step 3: Run the DEOLS Installer
Execute the automated one-line installer from the public GitHub repository:

```bash
curl -sSL https://raw.githubusercontent.com/mimi566/DEOLS/main/install.sh | bash
```

*Alternative (Manual Git Clone method):*
```bash
git clone https://github.com/mimi566/DEOLS.git /opt/deols
cd /opt/deols
bash install.sh
```

#### What the Installer Configures Automatically:
1. Updates Debian packages and installs core compilation and network tools.
2. Installs Node.js 20.x LTS.
3. Installs OpenLiteSpeed web server, LSPHP 8.3 and 8.2 with full extensions (MySQL, Redis, Memcached, OPcache, cURL, Imagick).
4. Installs and secures MariaDB 10.11+ server.
5. Installs WP-CLI for automated WordPress provisioning.
6. Installs Certbot and the `python3-certbot-dns-cloudflare` plugin.
7. Enables UFW firewall and activates Fail2ban protection.
8. Configures the `deols` systemd daemon and symlinks the `deols` CLI command to `/usr/local/bin/deols`.
9. **Generates and prints secure credentials in your terminal for both the DEOLS Panel and OpenLiteSpeed WebAdmin!**

---

### 4. Root SSH Password Management (CyberPanel-Style)

In DEOLS, administrative passwords **cannot be modified, registered, or reset through public web browsers**. This prevents unauthorized account takeovers and brute-force web vulnerabilities.

#### Reset or Generate DEOLS Panel Password (Root SSH Only)
To generate a new secure random password for the DEOLS administrator:

```bash
deols admin reset
```

**Output:**
```
════════════════════════════════════════════════════════════
   DEOLS Admin Password Updated Successfully (Root SSH)    
════════════════════════════════════════════════════════════
  Panel URL:     https://192.0.2.1:8443
  Username:      admin
  New Password:  kX9#mP2$vL8!qZ4*
════════════════════════════════════════════════════════════
```

#### Set a Custom Password for DEOLS Panel
```bash
deols admin setpass "YourSuperSecretPassword123!"
```

#### View Configured Administrators
```bash
deols admin show
```

---

### 5. OpenLiteSpeed (OLS) & WebAdmin Management

OpenLiteSpeed includes an enterprise-grade administrative GUI running on port `7080` for low-level tuning, listener configurations, SSL ciphers, and virtual host settings.

#### Accessing OLS WebAdmin Console
1. Open your browser and navigate to:
   ```
   https://YOUR_SERVER_IP:7080
   ```
2. When prompted by your browser regarding the self-signed certificate, select **Advanced &rarr; Proceed**.
3. Log in with:
   - **Username**: `admin`
   - **Password**: Your OLS admin password (printed during installation or reset via CLI)

#### Reset OLS WebAdmin Password via SSH
Just like CyberPanel's `admpass.sh` wrapper, you can reset the OLS WebAdmin password directly from your terminal:

```bash
# Generate a new secure random password for OLS WebAdmin:
deols ols reset-pass

# Or set a specific password:
deols ols password "YourNewOLSPassword123!"
```

#### CyberPanel-Identical Virtual Host & Dual-Listener Architecture

DEOLS manages OpenLiteSpeed using the exact same robust dual-listener and isolated virtual host architecture pioneered by CyberPanel, ensuring 100% native compatibility with both high-traffic production web traffic and the official OLS WebAdmin GUI:

1. **Dual Listener Routing (`Default` on Port 80 & `DefaultHTTPS` on Port 443)**:
   - Configured centrally inside `/usr/local/lsws/conf/httpd_config.conf`.
   - Every website provisioned by DEOLS is automatically registered and mapped under **both** listeners:
     ```apache
     listener Default {
       address                 *:80
       binding                 *:80
       secure                  0
       map                     example.com example.com, www.example.com, *.example.com
     }

     listener DefaultHTTPS {
       address                 *:443
       binding                 *:443
       secure                  1
       keyFile                 /usr/local/lsws/admin/conf/webadmin.key
       certFile                /usr/local/lsws/admin/conf/webadmin.crt
       map                     example.com example.com, www.example.com, *.example.com
     }
     ```
   - Supports seamless Server Name Indication (SNI) routing so each site serves its own Let's Encrypt certificate on port 443.

2. **Per-VHost Isolated PHP Sockets (`uds://tmp/lshttpd/lsphp83_<domain>.sock`)**:
   - Each virtual host executes within its own dedicated Unix domain socket (`uds://tmp/lshttpd/lsphp83_example_com.sock`).
   - Prevents cross-site privilege escalation, limits memory leaks, and provides true multi-tenant process isolation.

3. **Full OLS WebAdmin Visibility**:
   - Every site registered in DEOLS appears inside the official OpenLiteSpeed WebAdmin console (**Virtual Hosts** and **Listeners** tabs) without syntax conflicts.

4. **One-Click Re-Synchronization**:
   - Run `deols ols sync` from root SSH or click **Sync with OLS** in the DEOLS web panel anytime to verify, heal, and resync all website definitions into `httpd_config.conf`.

#### Managing OLS from the DEOLS Panel
You can also manage OpenLiteSpeed directly inside the DEOLS web panel under **Server &rarr; OLS WebAdmin**:
- View live service status (Active / Stopped, PID, Memory RSS, Uptime).
- Direct one-click link to launch the WebAdmin console (`https://YOUR_SERVER_IP:7080`).
- **Interactive Virtual Hosts Table**: Inspect all active OLS virtual hosts, root paths, SSL statuses, and mapped listeners.
- **Active Listeners Table**: Real-time view of Port 80 & 443 listeners and their virtual host mappings.
- **Config Inspector Modal**: View raw `vhconf.conf` and `httpd_config.conf` directives for any domain directly in your browser.
- **Sync with OLS**: One-click re-synchronization of all panel websites into OLS WebAdmin.
- **Global Header Restart Button**: Dedicated **Restart OLS** button in the top-right header navigation bar for instant, zero-downtime server restarts with live spin feedback from any screen in the panel.
- Trigger zero-downtime **Graceful Restarts** (`/usr/local/lsws/bin/lswsctrl restart`).
- **Reload Configuration** without dropping active connections.
- Reset the OLS WebAdmin password through an authenticated administrator session.

---

### 6. Complete CLI Reference Manual

The `deols` command-line utility is installed at `/usr/local/bin/deols`. You can run it from any terminal session as `root`:

| Command | Description |
|---|---|
| `deols admin reset` | Generate a new random password for DEOLS admin and output credentials |
| `deols admin setpass <pass>` | Set a custom password for DEOLS admin user |
| `deols admin show` | List existing panel administrators |
| `deols ols sync` | Synchronize all DEOLS sites with OLS Virtual Hosts & dual listeners |
| `deols ols reset-pass` | Generate a new random password for OLS WebAdmin (port 7080) |
| `deols ols password <pass>` | Set a custom password for OLS WebAdmin |
| `deols ols restart` | Gracefully restart the OpenLiteSpeed web server |
| `deols service daemon-reload` | Reload systemd manager configuration (`systemctl daemon-reload`) |
| `deols service restart <name>` | Restart a systemd service (e.g. `automation-custom-service.service`) |
| `deols service status <name>` | Inspect real-time `systemctl status` output for a service |
| `deols service list` | List all custom systemd units in `/etc/systemd/system` |
| `deols cron list` | List all automated background tasks and their statuses |
| `deols cron run <task-id>` | Execute an automation task immediately (e.g. sys-wp-cron) |
| `deols cron run-wp` | Run global WP-Cron across all hosted WordPress sites |
| `deols cron logs <task-id>` | View execution log history for an automation task |
| `deols status` | Display status of DEOLS daemon, OpenLiteSpeed, and MariaDB |
| `deols restart` | Restart the DEOLS panel background service (`deols.service`) |
| `deols info` | Display panel version, listening port, and server paths |
| `deols help` | Show the CLI command reference manual |

---

### 7. WordPress Site Hosting & LSCache Walkthrough

DEOLS automates the creation of high-performance WordPress sites in seconds.

#### Creating a WordPress Site:
1. In the DEOLS panel, navigate to **Hosting &rarr; Sites**.
2. Click **+ Add WordPress Site**.
3. Fill in the site details:
   - **Domain Name**: e.g., `example.com`
   - **Enable Wildcard**: Check to automatically route `*.example.com`
   - **PHP Version**: Select `LSPHP 8.3` (recommended) or `LSPHP 8.2`
   - **Site Title**: e.g., `My High Speed Blog`
   - **Admin Username**: e.g., `wpadmin`
   - **Admin Password**: e.g., `SecureWpPass!2026`
   - **Admin Email**: e.g., `admin@example.com`
4. Click **Deploy Site**.

#### What DEOLS Does Automatically:
- Generates an OpenLiteSpeed Virtual Host file at `/usr/local/lsws/conf/vhosts/example.com/vhconf.conf`.
- Registers the virtual host and domain mappings in `/usr/local/lsws/conf/httpd_config.conf`.
- Creates document root `/var/www/example.com/html` with proper `nobody:nogroup` ownership.
- Creates a dedicated MariaDB database and user with random, cryptographically secure passwords.
- Downloads WordPress core and generates `wp-config.php` via WP-CLI.
- Installs and activates the **LiteSpeed Cache (LSCache)** plugin with optimized caching rules.
- Gracefully reloads OpenLiteSpeed with zero downtime.

---

### 8. SSL / TLS Certificate Automation & Wildcard Cloudflare Guide

DEOLS supports both **Standard Single-Domain SSL (HTTP-01)** and **Automated Wildcard SSL (`*.domain.com`) via Cloudflare DNS-01 API**.

#### Standard Let's Encrypt SSL (HTTP-01)
*Best for standard websites without subdomains.*
1. Go to **Hosting &rarr; SSL / TLS** &rarr; click **+ Issue SSL Certificate**.
2. Select **Standard SSL (HTTP-01)** tab.
3. Enter your domain (e.g. `example.com`), notification email, and check whether to include `www.example.com`.
4. Click **Issue Certificate**. Certbot verifies ownership via webroot HTTP-01 challenge and automatically binds the certificate to the OpenLiteSpeed virtual host.

---

#### 🌟 Wildcard SSL with Cloudflare DNS-01 API (Complete Walkthrough)

Wildcard certificates issue a single master certificate valid for both your apex domain (`example.com`) and **any current or future subdomain** (`*.example.com`, e.g., `store.example.com`, `app.example.com`, `user1.example.com`).

##### Step 1: Configure Cloudflare DNS Records
In your Cloudflare dashboard for your domain:
1. Create an **A Record**:
   - **Name:** `@` (or `example.com`)
   - **IPv4 Address:** Your VPS IP address
   - **Proxy Status:** DNS Only (gray cloud) or Proxied (orange cloud)
2. Create a **Wildcard A Record**:
   - **Name:** `*`
   - **IPv4 Address:** Your VPS IP address
   - **Proxy Status:** DNS Only (gray cloud)

##### Step 2: Get your Cloudflare API Credentials
DEOLS supports two authentication methods for Cloudflare:

* **Method A: Global API Key & Account Email (Recommended for ease of use)**
  1. Log into Cloudflare &rarr; click your profile avatar in the top-right &rarr; **My Profile**.
  2. In the left menu, select **API Tokens**.
  3. Scroll down to **Global API Key** &rarr; click **View**.
  4. Copy your Global API Key. In DEOLS, use your Cloudflare account email and this key.

* **Method B: Scoped API Token**
  1. Go to **My Profile &rarr; API Tokens** &rarr; click **Create Token**.
  2. Use the **Edit zone DNS** template.
  3. Under **Zone Resources**, select: `Include` &rarr; `Specific zone` &rarr; `yourdomain.com`.
  4. Click **Continue to summary** &rarr; **Create Token**. Copy the generated Bearer token.

##### Step 3: Test Cloudflare Connection in DEOLS
1. Open your DEOLS panel &rarr; navigate to **Hosting &rarr; SSL / TLS**.
2. Click **+ Issue SSL Certificate** &rarr; ensure the **Wildcard SSL (Cloudflare DNS)** tab is selected.
3. Fill in:
   - **Base Domain:** e.g., `example.com`
   - **Let's Encrypt Email:** `admin@example.com`
   - **Auth Method:** Choose *Global API Key* or *API Token*.
   - Enter your Cloudflare Email and Key / Token.
4. **Click the "Test Connection" button:**
   - DEOLS directly contacts the Cloudflare API v4 to verify your credentials.
   - It checks whether your domain zone exists and is active on your Cloudflare account.
   - You will see real-time status feedback:
     ```
     ✓ Connected! Zone "example.com" is verified on Cloudflare and ready for wildcard SSL installation.
     ```
   - If invalid credentials or wrong domain, an alert displays the exact error so you can fix it before attempting issuance.

##### Step 4: 1-Click "Install Wildcard SSL"
Click **Install Wildcard SSL**. DEOLS automatically performs the entire pipeline:
1. Generates a secure credentials configuration file (`chmod 600`) at `/opt/deols/data/dns/cloudflare_<domain>.ini`.
2. Executes Certbot using the `--dns-cloudflare` authenticator, creating a temporary TXT verification record on Cloudflare DNS.
3. Automatically provisions the certificate covering `example.com` and `*.example.com`.
4. **Updates the OpenLiteSpeed Virtual Host SSL Configuration (`vhssl`):**
   ```
   vhssl {
     keyFile    /etc/letsencrypt/live/example.com/privkey.pem
     certFile   /etc/letsencrypt/live/example.com/fullchain.pem
     certChain  1
   }
   ```
5. **Updates the OpenLiteSpeed Listener Mappings (`httpd_config.conf`):**
   Automatically maps both the apex domain and the wildcard to the virtual host listener:
   ```
   map example.com example.com, *.example.com
   ```
6. **Gracefully reloads OpenLiteSpeed** with zero downtime.

#### Automatic Renewal
DEOLS installs a daily automated renewal daemon. Every 60 days, Certbot automatically re-verifies via Cloudflare DNS and executes the OLS deploy hook (`lswsctrl restart`) with zero manual intervention.

#### 🔍 Intelligent DNS Diagnostics & Failure Fallback (DNSChecker.org Integration)
If an SSL issuance request fails (e.g., domain does not point to your server IP, port 80 is unreachable, or DNS records have not propagated globally):
- **Real-Time DNS Verification:** DEOLS compares your server's public IP address against your domain's live DNS A-records.
- **In-Modal Fallback Diagnostics:** Instead of a generic failure message, the UI presents an interactive diagnostic alert showing:
  - **Required Server IP:** Your VPS public IP address.
  - **Domain Resolves To:** The IP addresses currently returned by global DNS.
- **Direct DNSChecker.org Link:** Includes a one-click button linking directly to `https://dnschecker.org/#A/<your-domain>` so you can inspect worldwide DNS propagation across 50+ international locations.
- **Seamless Retry:** Keeps your inputs preserved so you can verify DNS on [DNSChecker.org](https://dnschecker.org/) and retry with one click once propagation finishes.

---

### 9. File Manager & Permissions

- Navigate to **Hosting &rarr; File Manager** to explore directories, upload themes, edit code, and extract `.zip` or `.tar.gz` archives.
- **Path Traversal Protection**: The file manager is securely jailed to `/var/www` to prevent unauthorized inspection of system files.
- **Repair Permissions**: If file permissions become corrupted after manual SFTP uploads, click **Fix Permissions** in the Sites view to restore `nobody:nogroup` ownership and standard `755`/`644` permissions.

---

### 10. Database Management (MariaDB)

- Navigate to **Hosting &rarr; Databases**.
- Create and delete MariaDB databases and database users.
- Connect remotely or via SSH using standard MariaDB client:
  ```bash
  mysql -u root
  ```

---

### 11. Git-Based Push-to-Deploy

Automate deployments from GitHub, GitLab, or Gitea repositories directly to your web directory:
1. Navigate to **Deploy &rarr; Git Deploy**.
2. Add your deployment SSH key or copy the server's public key to your repository deploy keys.
3. Configure repository URL, target directory (e.g., `/var/www/example.com/html/wp-content/themes/mytheme`), and branch (`main`).
4. Copy the unique Webhook URL provided by DEOLS and paste it into GitHub Repository Settings &rarr; Webhooks.
5. On every `git push`, DEOLS will pull the latest code and execute optional build hooks.

---

### 12. Python Daemon Service Engine

Run Python automation scripts, FastAPI services, Telegram bots, or background workers as native systemd services:
1. Navigate to **Deploy &rarr; Python Services**.
2. Click **+ Add Python Service**.
3. Provide service name, upload your script or directory, and specify requirements.
4. DEOLS automatically:
   - Sets up an isolated Python virtual environment (`python3 -m venv venv`).
   - Runs `pip install -r requirements.txt`.
   - Generates and enables a systemd unit (`deols-py-<name>.service`).
   - Monitors live process status, memory, and logs.

---

### 13. Custom Systemd Service Manager & Live Nano Unit Editor (`/etc/systemd/system/*.service`)

DEOLS provides a full-featured, browser-based **Systemd Service Manager & Live Unit Editor** under **Server &rarr; Services**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  GNU nano 7.2 • /etc/systemd/system/automation-custom-service.service       │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Unit]                                                                     │
│  Description=Custom Background Automation Service                           │
│  After=network.target                                                       │
│                                                                             │
│  [Service]                                                                  │
│  Type=simple                                                                │
│  User=root                                                                  │
│  WorkingDirectory=/opt/automation                                           │
│  ExecStart=/usr/bin/python3 /opt/automation/worker.py                       │
│  Restart=always                                                             │
│  RestartSec=5                                                               │
│  StandardOutput=journal                                                     │
│  StandardError=journal                                                      │
│  SyslogIdentifier=automation-custom-service                                 │
│                                                                             │
│  [Install]                                                                  │
│  WantedBy=multi-user.target                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  [^O] Save & Apply   [^R] daemon-reload   [⚡] Restart   [^L] Journal Logs   │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Key Capabilities:
- **Live Terminal-Style Code Editor (Nano Box)**: Directly edit `/etc/systemd/system/<service-name>.service` (e.g. `automation-custom-service.service`) with syntax styling, monospace typography, and save shortcuts.
- **`daemon-reload` Button**: Single-click `systemctl daemon-reload` with live feedback and status refresh.
- **`Restart` Button**: Immediate graceful restart of any custom service unit (`systemctl restart <name>`).
- **Live Status & Boot State**: Real-time status badge (`active (running)`, `inactive (dead)`, `failed`), boot auto-start toggle (`enabled` / `disabled`), and raw `systemctl status -l --no-pager` terminal output.
- **Journalctl Log Viewer**: Live streaming inspection of recent unit logs (`journalctl -u <name> -n 100`).
- **Terminal CLI Shortcut**: Generates ready-to-copy terminal commands (`nano /etc/systemd/system/automation-custom-service.service`).
- **Preset Service Templates**: Instant boilerplate injection for:
  - **Python Automation Watcher** (`automation-custom-service.service`)
  - **Node.js Worker Daemon**
  - **Shell Script Automation Watcher**
  - **Generic Systemd Service**

---

### 14. Server Timezone & Live Header Clock

DEOLS includes an interactive **Timezone & Live Clock** in the top navigation header:
- **Header Clock Pill**: Live ticking clock with current server timezone badge (e.g. `18:37:00 UTC` or `Asia/Kolkata`).
- **One-Click Timezone Changer**: Click the header clock to open the configuration modal and switch between global IANA timezones (`timedatectl set-timezone`).
- **Post-Change Service Sync Prompt**: After changing the server timezone, DEOLS alerts you with single-click actions to synchronize background services:
  - **⚡ Restart OpenLiteSpeed (OLS)**: Re-synchronizes web server access log timestamps and cache expiration headers.
  - **⟳ Reload Server Daemon**: Restarts DEOLS daemon and background workers to update cron tickers immediately.

---

### 15. Server-Side Automation & Background Cron Engine

DEOLS includes a built-in **Server-Side Automation Daemon** that runs scheduled maintenance, WordPress event triggers, and custom automation tasks with execution timing and persistent logging.

#### 1. Core Built-In System Tasks
| Task ID | Task Name | Schedule | Function |
|---|---|---|---|
| `sys-wp-cron` | **Global WordPress WP-Cron Automation** | `*/5 * * * *` (Every 5m) | Executes `wp cron event run --due-now` via WP-CLI across all active WordPress sites, eliminating reliance on frontend browser traffic |
| `sys-ssl-renew` | **Automated SSL Renewal & Health Check** | `0 3 * * *` (Daily 3am) | Automatically checks and renews Let's Encrypt certificates due within 30 days and triggers graceful OLS reload |
| `sys-ols-cache` | **OpenLiteSpeed Cache & Storage Maintenance** | `0 4 * * *` (Daily 4am) | Purges expired page cache records in `/usr/local/lsws/cachedata` to prevent disk bloat |
| `sys-db-optimize` | **MariaDB Database Optimization** | `0 2 * * 0` (Weekly Sun 2am) | Optimizes database tables and rebuilds index statistics for peak query performance |

#### 2. Custom Scheduled Server-Side Tasks
You can schedule custom shell commands, Python scripts, backup utilities, or webhooks directly from the UI or CLI:
- Configure custom 5-part cron schedules (`*/15 * * * *`, `0 2 * * *`, etc.).
- **⚡ Run Now:** One-click manual test run with live terminal output modal showing exit codes, duration (in ms), and stdout/stderr.
- **📋 Execution Logs:** Persistent log history saved to `/opt/deols/data/logs/automation/<task-id>.log`.

#### 3. Standalone Systemd Service Unit
In addition to running inside the DEOLS panel daemon, the automation engine can also run as an independent systemd service:
```bash
cp /opt/deols/systemd/deols-cron.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now deols-cron.service
```

#### 4. Automated End-to-End Pipeline Verification Test
Run the automated test suite anytime to verify all paths, database setup, virtual hosts, dual listeners, wildcard SSL, and cron automation:
```bash
npm run test:pipeline
```
This runs 35 automated assertion checks covering the full provisioning pipeline in an isolated sandbox.

---

### 14. Security Hardening & Anti-Attack Shield

#### Fail2ban Jails
DEOLS automatically configures and monitors Fail2ban jails:
- **SSH Protection**: Bans IPs after 5 failed SSH authentication attempts.
- **WordPress Protection**: Monitors `/var/log/auth.log` and OLS access logs to instantly ban brute-force attacks against `wp-login.php` and `xmlrpc.php`.

#### Emergency Anti-Attack Shield
During active DDoS, layer-7 brute-force, or heavy scraper attacks, activate **Emergency Shield** from the Security page or Dashboard header:
- Automatically drops all `xmlrpc.php` requests globally.
- Enforces strict request rate limits in OpenLiteSpeed (10 req/sec per IP).
- Tightens Fail2ban ban thresholds to 2 failed attempts with 24-hour bans.
- Activates HTTP verification checks for suspicious user agents.

---

### 15. System Maintenance & Log Locations

#### Essential File Paths
| Component | Location |
|---|---|
| **DEOLS Panel Directory** | `/opt/deols` |
| **DEOLS Data Store** | `/opt/deols/data` (`users.json`, `sites.json`, `secrets.json`) |
| **DEOLS Environment Config** | `/opt/deols/.env` |
| **DEOLS CLI Executable** | `/usr/local/bin/deols` &rarr; `/opt/deols/bin/deols-cli.js` |
| **OpenLiteSpeed Root** | `/usr/local/lsws` |
| **OLS Server Config** | `/usr/local/lsws/conf/httpd_config.conf` |
| **OLS Virtual Hosts** | `/usr/local/lsws/conf/vhosts/<domain>/vhconf.conf` |
| **OLS WebAdmin Htpasswd** | `/usr/local/lsws/admin/conf/htpasswd` |
| **OLS Logs** | `/usr/local/lsws/logs/error.log`, `/usr/local/lsws/logs/access.log` |
| **Website Document Roots** | `/var/www/<domain>/html` |
| **Certbot Certificates** | `/etc/letsencrypt/live/<domain>/` |

#### Checking Service Logs
```bash
# DEOLS Panel Logs
journalctl -u deols -f

# OpenLiteSpeed Logs
tail -f /usr/local/lsws/logs/error.log

# Fail2ban Status
fail2ban-client status
```

#### Upgrading DEOLS
To update DEOLS to the latest release:
```bash
cd /opt/deols
git pull origin main
npm install --omit=dev
systemctl restart deols
```

---

### 16. Troubleshooting & FAQ

#### Q: How do I recover a forgotten DEOLS admin password?
**A:** Connect to your server terminal as `root` via SSH and run:
```bash
deols admin reset
```
This generates a new random password and prints the credentials.

#### Q: How do I recover a forgotten OpenLiteSpeed WebAdmin password?
**A:** Run from root SSH:
```bash
deols ols reset-pass
# Or:
deols ols password "YourNewPassword"
```

#### Q: Browser shows "Your connection is not private" on port 8443 or 7080.
**A:** DEOLS and OLS WebAdmin generate self-signed SSL certificates on initial installation. Click **Advanced &rarr; Proceed to Server** in your browser. Once logged in, you can configure a valid Let's Encrypt hostname certificate under **Hosting &rarr; SSL / TLS**.

#### Q: How do I restart all server services?
**A:** Run:
```bash
deols restart                 # Restarts DEOLS panel
deols ols restart             # Restarts OpenLiteSpeed
systemctl restart mariadb     # Restarts MariaDB
```

---

[MIT License](./LICENSE) — Free and open source forever.

---

<p align="center">
  Built with ⚡ for the OpenLiteSpeed community
</p>
