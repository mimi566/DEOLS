#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// DEOLS CLI — Server Management & Root Password Utility
// Usage: deols <command> [options]
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// Dynamically import config
const configPath = join(ROOT_DIR, 'backend', 'config.js');
let config;
try {
  const mod = await import(`file://${configPath.replace(/\\/g, '/')}`);
  config = mod.config;
} catch {
  config = {
    dataDir: process.env.DEOLS_DATA_DIR || '/opt/deols/data',
    port: parseInt(process.env.DEOLS_PORT || '8443', 10),
    olsRoot: process.env.OLS_ROOT || '/usr/local/lsws',
  };
}

const USERS_FILE = join(config.dataDir, 'users.json');

// ─── Helpers ─────────────────────────────────────────────────

function ensureRoot() {
  if (process.getuid && process.getuid() !== 0) {
    console.error('\x1b[31m[ERROR] This command must be executed as root (or via sudo).\x1b[0m');
    process.exit(1);
  }
}

function loadUsers() {
  if (!existsSync(USERS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(USERS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveUsers(users) {
  if (!existsSync(config.dataDir)) mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
}

function generateRandomPassword(length = 16) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  const bytes = randomBytes(length);
  let pass = '';
  for (let i = 0; i < length; i++) {
    pass += chars[bytes[i] % chars.length];
  }
  return pass;
}

function getServerIP() {
  try {
    const ip = execSync("hostname -I 2>/dev/null | awk '{print $1}'", { encoding: 'utf-8' }).trim();
    if (ip) return ip;
  } catch {}
  return 'YOUR_SERVER_IP';
}

// ─── Command Handlers ────────────────────────────────────────

async function handleAdminReset(customPassword = null) {
  ensureRoot();
  const argon2 = await import('argon2');

  const users = loadUsers();
  let admin = users.find((u) => u.role === 'admin' || u.username === 'admin');

  const newPassword = customPassword || generateRandomPassword(16);
  const hash = await argon2.hash(newPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const username = admin ? admin.username : 'admin';

  if (admin) {
    admin.passwordHash = hash;
    admin.updatedAt = new Date().toISOString();
  } else {
    admin = {
      id: crypto.randomUUID ? crypto.randomUUID() : randomBytes(16).toString('hex'),
      username: 'admin',
      email: 'admin@localhost',
      passwordHash: hash,
      role: 'admin',
      createdAt: new Date().toISOString(),
    };
    users.push(admin);
  }

  saveUsers(users);

  const serverIP = getServerIP();
  const port = config.port || 8443;

  console.log('\n\x1b[32m\x1b[1m════════════════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[32m\x1b[1m   DEOLS Admin Password Updated Successfully (Root SSH)    \x1b[0m');
  console.log('\x1b[32m\x1b[1m════════════════════════════════════════════════════════════\x1b[0m');
  console.log(`  \x1b[36mPanel URL:\x1b[0m     https://${serverIP}:${port}`);
  console.log(`  \x1b[36mUsername:\x1b[0m      \x1b[1m${username}\x1b[0m`);
  console.log(`  \x1b[36mNew Password:\x1b[0m  \x1b[33m\x1b[1m${newPassword}\x1b[0m`);
  console.log('\x1b[32m\x1b[1m════════════════════════════════════════════════════════════\x1b[0m');
  console.log('  \x1b[90mSecurity Note: Store these credentials in a safe password manager.\x1b[0m');
  console.log('  \x1b[90mFor security, DEOLS passwords cannot be reset from the web UI.\x1b[0m\n');
}

function handleAdminShow() {
  ensureRoot();
  const users = loadUsers();
  const admins = users.filter((u) => u.role === 'admin' || u.username === 'admin');
  if (admins.length === 0) {
    console.log('\x1b[33mNo admin account found. Run `deols admin reset` to generate one.\x1b[0m');
    return;
  }
  console.log('\n\x1b[36mDEOLS Administrators:\x1b[0m');
  admins.forEach((a) => {
    console.log(`  • Username: \x1b[1m${a.username}\x1b[0m | Email: ${a.email || 'None'} | Created: ${a.createdAt || 'N/A'}`);
  });
  console.log('');
}

function handleOLSPassword(customPassword = null) {
  ensureRoot();
  const olsRoot = config.olsRoot || '/usr/local/lsws';
  const admpassScript = join(olsRoot, 'admin', 'misc', 'admpass.sh');
  const htpasswdFile = join(olsRoot, 'admin', 'conf', 'htpasswd');

  const newPassword = customPassword || generateRandomPassword(16);
  const username = 'admin';

  let success = false;

  // Try using admpass.sh first if available
  if (existsSync(admpassScript)) {
    try {
      execSync(`printf "%s\\n%s\\n%s\\n" "${username}" "${newPassword}" "${newPassword}" | ${admpassScript} >/dev/null 2>&1`);
      success = true;
    } catch {
      success = false;
    }
  }

  // Fallback to openssl or direct htpasswd update
  if (!success) {
    try {
      const hash = execSync(`openssl passwd -1 "${newPassword}" 2>/dev/null`, { encoding: 'utf-8' }).trim();
      if (hash) {
        if (!existsSync(dirname(htpasswdFile))) mkdirSync(dirname(htpasswdFile), { recursive: true });
        writeFileSync(htpasswdFile, `${username}:${hash}\n`, { mode: 0o600 });
        success = true;
      }
    } catch {}
  }

  if (success) {
    // Restart or reload OLS admin listener
    try {
      execSync(`${join(olsRoot, 'bin', 'lswsctrl')} restart >/dev/null 2>&1`);
    } catch {}

    const serverIP = getServerIP();
    console.log('\n\x1b[32m\x1b[1m════════════════════════════════════════════════════════════\x1b[0m');
    console.log('\x1b[32m\x1b[1m   OpenLiteSpeed (OLS) WebAdmin Password Updated           \x1b[0m');
    console.log('\x1b[32m\x1b[1m════════════════════════════════════════════════════════════\x1b[0m');
    console.log(`  \x1b[36mWebAdmin URL:\x1b[0m  https://${serverIP}:7080`);
    console.log(`  \x1b[36mUsername:\x1b[0m      \x1b[1madmin\x1b[0m`);
    console.log(`  \x1b[36mPassword:\x1b[0m      \x1b[33m\x1b[1m${newPassword}\x1b[0m`);
    console.log('\x1b[32m\x1b[1m════════════════════════════════════════════════════════════\x1b[0m\n');
  } else {
    console.error('\x1b[31m[ERROR] Failed to update OLS WebAdmin password. Verify that OpenLiteSpeed is installed at /usr/local/lsws.\x1b[0m');
    process.exit(1);
  }
}

function handleRestart() {
  ensureRoot();
  console.log('\x1b[36mRestarting DEOLS panel daemon...\x1b[0m');
  try {
    execSync('systemctl restart deols', { stdio: 'inherit' });
    console.log('\x1b[32m✓ DEOLS panel restarted successfully.\x1b[0m');
  } catch (err) {
    console.error('\x1b[31mFailed to restart deols service.\x1b[0m');
  }
}

function handleStatus() {
  console.log('\n\x1b[36m\x1b[1m─── DEOLS System Status ───\x1b[0m');
  try {
    const deolsActive = execSync('systemctl is-active deols 2>/dev/null', { encoding: 'utf-8' }).trim();
    console.log(`  DEOLS Panel Daemon:    ${deolsActive === 'active' ? '\x1b[32m● active (running)\x1b[0m' : '\x1b[31m● ' + deolsActive + '\x1b[0m'}`);
  } catch {
    console.log('  DEOLS Panel Daemon:    \x1b[31m● inactive / not installed\x1b[0m');
  }

  try {
    const lswsActive = execSync('systemctl is-active lsws 2>/dev/null', { encoding: 'utf-8' }).trim();
    console.log(`  OpenLiteSpeed Server:  ${lswsActive === 'active' ? '\x1b[32m● active (running)\x1b[0m' : '\x1b[31m● ' + lswsActive + '\x1b[0m'}`);
  } catch {
    console.log('  OpenLiteSpeed Server:  \x1b[31m● inactive / not installed\x1b[0m');
  }

  try {
    const mariadbActive = execSync('systemctl is-active mariadb 2>/dev/null', { encoding: 'utf-8' }).trim();
    console.log(`  MariaDB Database:      ${mariadbActive === 'active' ? '\x1b[32m● active (running)\x1b[0m' : '\x1b[31m● ' + mariadbActive + '\x1b[0m'}`);
  } catch {
    console.log('  MariaDB Database:      \x1b[31m● inactive / not installed\x1b[0m');
  }

  const serverIP = getServerIP();
  console.log(`\n  DEOLS URL:     https://${serverIP}:${config.port || 8443}`);
  console.log(`  OLS WebAdmin:  https://${serverIP}:7080\n`);
}

function handleInfo() {
  console.log('\n\x1b[36m\x1b[1m════════════════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[36m\x1b[1m  DEOLS — Debian OpenLiteSpeed Management Panel             \x1b[0m');
  console.log('\x1b[36m\x1b[1m════════════════════════════════════════════════════════════\x1b[0m');
  console.log('  Version:     1.0.0');
  console.log('  OS:          Debian 12 (Bookworm)');
  console.log('  Web Engine:  OpenLiteSpeed');
  console.log('  Panel Port:  ' + (config.port || 8443));
  console.log('  OLS Admin:   7080');
  console.log('  Data Dir:    ' + (config.dataDir || '/opt/deols/data'));
  console.log('\x1b[36m\x1b[1m════════════════════════════════════════════════════════════\x1b[0m\n');
}

function showHelp() {
  console.log(`
\x1b[1mDEOLS CLI — Debian OpenLiteSpeed Management Tool\x1b[0m

\x1b[36mUSAGE:\x1b[0m
  deols <command> [arguments]

\x1b[36mADMIN & PASSWORD COMMANDS (ROOT SSH ONLY):\x1b[0m
  \x1b[32mdeols admin reset\x1b[0m                   Generate a new secure random password for DEOLS admin
  \x1b[32mdeols admin setpass <password>\x1b[0m      Set a custom password for DEOLS admin
  \x1b[32mdeols admin show\x1b[0m                    Show list of configured administrators

\x1b[36mOPENLITESPEED (OLS) COMMANDS:\x1b[0m
  \x1b[32mdeols ols reset-pass\x1b[0m                Generate a new random password for OLS WebAdmin (port 7080)
  \x1b[32mdeols ols password <password>\x1b[0m       Set a custom password for OLS WebAdmin
  \x1b[32mdeols ols restart\x1b[0m                   Gracefully restart OpenLiteSpeed server

\x1b[36mSERVICE & SYSTEM COMMANDS:\x1b[0m
  \x1b[32mdeols status\x1b[0m                        Display status of DEOLS, OLS, and MariaDB services
  \x1b[32mdeols restart\x1b[0m                       Restart the DEOLS panel daemon
  \x1b[32mdeols info\x1b[0m                          Display panel version and server details
  \x1b[32mdeols help\x1b[0m                          Show this help manual
`);
}

// ─── Entry Point ─────────────────────────────────────────────

const [,, cmd, subcmd, ...args] = process.argv;

switch (cmd) {
  case 'admin':
    if (subcmd === 'reset') {
      await handleAdminReset();
    } else if (subcmd === 'setpass' || subcmd === 'password') {
      const pass = args[0];
      if (!pass || pass.length < 8) {
        console.error('\x1b[31m[ERROR] Password must be at least 8 characters.\x1b[0m');
        process.exit(1);
      }
      await handleAdminReset(pass);
    } else if (subcmd === 'show' || subcmd === 'list') {
      handleAdminShow();
    } else {
      console.log('\x1b[31mUnknown admin command. Available: reset, setpass <password>, show\x1b[0m');
    }
    break;

  case 'ols':
    if (subcmd === 'reset-pass') {
      handleOLSPassword();
    } else if (subcmd === 'password' || subcmd === 'setpass') {
      const pass = args[0];
      if (!pass || pass.length < 6) {
        console.error('\x1b[31m[ERROR] Password must be at least 6 characters.\x1b[0m');
        process.exit(1);
      }
      handleOLSPassword(pass);
    } else if (subcmd === 'restart') {
      try {
        execSync(`${join(config.olsRoot || '/usr/local/lsws', 'bin', 'lswsctrl')} restart`, { stdio: 'inherit' });
        console.log('\x1b[32m✓ OpenLiteSpeed restarted.\x1b[0m');
      } catch (err) {
        console.error('\x1b[31mFailed to restart OpenLiteSpeed.\x1b[0m');
      }
    } else {
      console.log('\x1b[31mUnknown ols command. Available: reset-pass, password <password>, restart\x1b[0m');
    }
    break;

  case 'restart':
    handleRestart();
    break;

  case 'status':
    handleStatus();
    break;

  case 'info':
  case 'version':
  case '-v':
  case '--version':
    handleInfo();
    break;

  case 'help':
  case '--help':
  case '-h':
  default:
    showHelp();
    break;
}
