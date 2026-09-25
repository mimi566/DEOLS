#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// DEOLS CLI — Server Management & Root Password Utility
// Usage: deols <command> [options]
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
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

async function handleOLSSync() {
  ensureRoot();
  console.log('\n\x1b[36mSynchronizing DEOLS websites with OpenLiteSpeed Virtual Hosts & Dual Listeners...\x1b[0m');
  try {
    const olsConfigMod = await import(`file://${join(ROOT_DIR, 'backend', 'utils', 'ols-config.js').replace(/\\/g, '/')}`);
    const result = olsConfigMod.syncAllVirtualHosts();
    const lswsctrl = join(config.olsRoot || '/usr/local/lsws', 'bin', 'lswsctrl');
    if (existsSync(lswsctrl)) {
      execSync(`${lswsctrl} restart >/dev/null 2>&1 || true`);
    }
    console.log(`\x1b[32m✓ Successfully synchronized ${result.syncedCount} site(s) with OLS WebAdmin virtual hosts and dual listeners (Port 80 & Port 443).\x1b[0m\n`);
  } catch (err) {
    console.error(`\x1b[31m[ERROR] Failed to synchronize with OLS: ${err.message}\x1b[0m\n`);
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

async function handleCronCLI(subcmd, args) {
  try {
    const autoMod = await import(`file://${join(ROOT_DIR, 'backend', 'services', 'automation.js').replace(/\\/g, '/')}`);

    if (subcmd === 'list' || !subcmd) {
      const tasks = autoMod.loadTasks();
      console.log('\n\x1b[36m\x1b[1mDEOLS Server-Side Automation Tasks:\x1b[0m');
      console.log('────────────────────────────────────────────────────────────────────────');
      for (const t of tasks) {
        const statusColor = t.lastStatus === 'success' ? '\x1b[32m' : (t.lastStatus === 'failed' ? '\x1b[31m' : '\x1b[33m');
        console.log(`  \x1b[1m${t.id.padEnd(16)}\x1b[0m \x1b[35m[${t.schedule}]\x1b[0m ${t.name}`);
        console.log(`    Status: ${statusColor}${t.lastStatus || 'idle'}\x1b[0m | Enabled: ${t.enabled ? 'Yes' : 'No'} | Last Run: ${t.lastRun ? new Date(t.lastRun).toLocaleString() : 'Never'}`);
      }
      console.log('────────────────────────────────────────────────────────────────────────\n');
    } else if (subcmd === 'run') {
      const taskId = args[0] || 'sys-wp-cron';
      console.log(`\n\x1b[36mExecuting automation task [${taskId}]...\x1b[0m`);
      const res = await autoMod.runTaskNow(taskId);
      console.log(`Status: ${res.status === 'success' ? '\x1b[32mSUCCESS\x1b[0m' : '\x1b[31mFAILED\x1b[0m'} (Duration: ${res.durationMs}ms)`);
      if (res.output) {
        console.log('\nOutput:\n' + res.output);
      }
      console.log();
    } else if (subcmd === 'run-wp') {
      console.log('\n\x1b[36mRunning Global WordPress WP-Cron across all hosted sites...\x1b[0m');
      const res = await autoMod.runTaskNow('sys-wp-cron');
      console.log(`Status: ${res.status === 'success' ? '\x1b[32mSUCCESS\x1b[0m' : '\x1b[31mFAILED\x1b[0m'} (Duration: ${res.durationMs}ms)`);
      if (res.output) console.log(res.output);
      console.log();
    } else if (subcmd === 'logs') {
      const taskId = args[0];
      if (!taskId) {
        console.error('\x1b[31m[ERROR] Please specify task ID (e.g. deols cron logs sys-wp-cron)\x1b[0m');
        process.exit(1);
      }
      const logs = autoMod.getTaskLogs(taskId);
      console.log(`\n\x1b[36mLogs for [${taskId}]:\x1b[0m\n${logs}\n`);
    } else {
      console.log('\x1b[31mUnknown cron command. Available: list, run <id>, run-wp, logs <id>\x1b[0m');
    }
  } catch (err) {
    console.error(`\x1b[31m[ERROR] Failed to run cron CLI: ${err.message}\x1b[0m`);
  }
}

function handleServiceCLI(subcmd, args) {
  if (subcmd === 'daemon-reload' || subcmd === 'reload') {
    try {
      execSync('systemctl daemon-reload', { stdio: 'inherit' });
      console.log('\x1b[32m✓ systemd daemon reloaded successfully.\x1b[0m');
    } catch (err) {
      console.error('\x1b[31mFailed to execute systemctl daemon-reload.\x1b[0m', err.message);
    }
  } else if (subcmd === 'restart') {
    const svc = args[0];
    if (!svc) {
      console.error('\x1b[31mUsage: deols service restart <service-name>\x1b[0m');
      process.exit(1);
    }
    const clean = svc.endsWith('.service') ? svc : `${svc}.service`;
    try {
      execSync(`systemctl restart ${clean}`, { stdio: 'inherit' });
      console.log(`\x1b[32m✓ Service ${clean} restarted.\x1b[0m`);
    } catch (err) {
      console.error(`\x1b[31mFailed to restart ${clean}.\x1b[0m`);
    }
  } else if (subcmd === 'status') {
    const svc = args[0];
    if (!svc) {
      console.error('\x1b[31mUsage: deols service status <service-name>\x1b[0m');
      process.exit(1);
    }
    const clean = svc.endsWith('.service') ? svc : `${svc}.service`;
    try {
      execSync(`systemctl status ${clean} --no-pager`, { stdio: 'inherit' });
    } catch {
      // systemctl status exits non-zero if inactive
    }
  } else if (subcmd === 'list' || subcmd === 'custom') {
    const dir = config.systemdDir || (process.platform === 'linux' ? '/etc/systemd/system' : join(config.dataDir, 'systemd'));
    console.log(`\n\x1b[36m\x1b[1m─── Custom Systemd Services (${dir}) ───\x1b[0m`);
    try {
      if (!existsSync(dir)) {
        console.log('  Directory does not exist yet.');
      } else {
        const files = readdirSync(dir).filter(f => f.endsWith('.service') && !f.includes('@'));
        if (files.length === 0) {
          console.log('  No custom services found.');
        } else {
          for (const f of files) {
            let active = 'unknown';
            try {
              active = execSync(`systemctl is-active ${f} 2>/dev/null`, { encoding: 'utf-8' }).trim();
            } catch {}
            console.log(`  ${active === 'active' ? '\x1b[32m●\x1b[0m' : '\x1b[31m○\x1b[0m'} ${f.padEnd(32)} [${active}] (nano ${join(dir, f)})`);
          }
        }
      }
    } catch (err) {
      console.error('Failed to list services:', err.message);
    }
    console.log();
  } else {
    console.log('\x1b[31mUnknown service command. Available: daemon-reload, restart <name>, status <name>, list\x1b[0m');
  }
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
  \x1b[32mdeols ols sync\x1b[0m                      Synchronize all sites with OLS Virtual Hosts & dual listeners
  \x1b[32mdeols ols reset-pass\x1b[0m                Generate a new random password for OLS WebAdmin (port 7080)
  \x1b[32mdeols ols password <password>\x1b[0m       Set a custom password for OLS WebAdmin
  \x1b[32mdeols ols restart\x1b[0m                   Gracefully restart OpenLiteSpeed server

\x1b[36mCRON & SERVER-SIDE AUTOMATION COMMANDS:\x1b[0m
  \x1b[32mdeols cron list\x1b[0m                     List all automated background tasks and their statuses
  \x1b[32mdeols cron run <task-id>\x1b[0m            Execute an automation task immediately (e.g. sys-wp-cron)
  \x1b[32mdeols cron run-wp\x1b[0m                   Run global WP-Cron across all hosted WordPress sites
  \x1b[32mdeols cron logs <task-id>\x1b[0m           View execution log history for an automation task

\x1b[36mSYSTEMD & CUSTOM SERVICE COMMANDS:\x1b[0m
  \x1b[32mdeols service daemon-reload\x1b[0m         Reload systemd manager configuration (systemctl daemon-reload)
  \x1b[32mdeols service restart <name>\x1b[0m        Restart a systemd service (e.g. automation-custom-service.service)
  \x1b[32mdeols service status <name>\x1b[0m         Inspect real-time systemctl status for a service
  \x1b[32mdeols service list\x1b[0m                  List all custom systemd units in /etc/systemd/system

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
    } else if (subcmd === 'sync') {
      await handleOLSSync();
    } else if (subcmd === 'restart') {
      try {
        execSync(`${join(config.olsRoot || '/usr/local/lsws', 'bin', 'lswsctrl')} restart`, { stdio: 'inherit' });
        console.log('\x1b[32m✓ OpenLiteSpeed restarted.\x1b[0m');
      } catch (err) {
        console.error('\x1b[31mFailed to restart OpenLiteSpeed.\x1b[0m');
      }
    } else {
      console.log('\x1b[31mUnknown ols command. Available: sync, reset-pass, password <password>, restart\x1b[0m');
    }
    break;

  case 'cron':
  case 'automation':
    await handleCronCLI(subcmd, args);
    break;

  case 'service':
  case 'services':
    handleServiceCLI(subcmd, args);
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
