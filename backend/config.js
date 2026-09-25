// ─────────────────────────────────────────────────────────────
// DEOLS Configuration Module
// ─────────────────────────────────────────────────────────────

import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DEOLS_DATA_DIR || '/opt/deols/data';

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Persistent secrets file
const secretsPath = join(DATA_DIR, 'secrets.json');

function loadOrCreateSecrets() {
  if (existsSync(secretsPath)) {
    try {
      return JSON.parse(readFileSync(secretsPath, 'utf-8'));
    } catch {
      // Corrupted file, regenerate
    }
  }
  const secrets = {
    jwtSecret: randomBytes(48).toString('hex'),
    cookieSecret: randomBytes(32).toString('hex'),
    createdAt: new Date().toISOString(),
  };
  writeFileSync(secretsPath, JSON.stringify(secrets, null, 2), {
    mode: 0o600,
  });
  return secrets;
}

const secrets = loadOrCreateSecrets();

export const config = {
  // Server
  port: parseInt(process.env.DEOLS_PORT || '8443', 10),
  host: process.env.DEOLS_HOST || '0.0.0.0',
  isDev: process.env.NODE_ENV !== 'production',
  logLevel: process.env.DEOLS_LOG_LEVEL || 'info',

  // Secrets
  jwtSecret: process.env.DEOLS_JWT_SECRET || secrets.jwtSecret,
  cookieSecret: process.env.DEOLS_COOKIE_SECRET || secrets.cookieSecret,

  // Paths
  dataDir: DATA_DIR,
  olsRoot: process.env.OLS_ROOT || '/usr/local/lsws',
  vhostsDir: process.env.OLS_VHOSTS_DIR || '/usr/local/lsws/conf/vhosts',
  webRoot: process.env.WEB_ROOT || '/var/www',
  cacheDir: process.env.OLS_CACHE_DIR || '/usr/local/lsws/cachedata',
  systemdDir: process.env.SYSTEMD_DIR || (process.platform === 'linux' ? '/etc/systemd/system' : join(DATA_DIR, 'systemd')),
  backupDir: process.env.BACKUP_DIR || (process.platform === 'linux' ? '/var/backups/deols' : join(DATA_DIR, 'backups')),

  // Database
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'deols',
  },

  // Binaries
  bin: {
    certbot: process.env.CERTBOT_BIN || (existsSync('/usr/bin/certbot') ? '/usr/bin/certbot' : (existsSync('/snap/bin/certbot') ? '/snap/bin/certbot' : 'certbot')),
    wp: process.env.WP_CLI_BIN || '/usr/local/bin/wp',
    git: process.env.GIT_BIN || '/usr/bin/git',
    lswsctrl: process.env.LSWSCTRL_BIN || '/usr/local/lsws/bin/lswsctrl',
    ufw: process.env.UFW_BIN || '/usr/sbin/ufw',
    fail2ban: process.env.FAIL2BAN_BIN || '/usr/bin/fail2ban-client',
    python3: process.env.PYTHON3_BIN || '/usr/bin/python3',
    systemctl: '/bin/systemctl',
  },
};
