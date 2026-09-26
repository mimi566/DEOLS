// ─────────────────────────────────────────────────────────────
// DEOLS phpMyAdmin Service
// Automated Installation, Configuration, OLS Integration, and SSO
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { shell, generatePassword } from '../utils/shell.js';

const PMA_DIR = process.platform === 'linux' ? '/opt/deols/phpmyadmin' : join(config.dataDir, 'phpmyadmin');
const SYSTEM_PMA_DIR = '/usr/share/phpmyadmin';

/**
 * Get the active phpMyAdmin filesystem path
 */
export function getPmaPath() {
  if (existsSync(join(PMA_DIR, 'index.php'))) return PMA_DIR;
  if (existsSync(join(SYSTEM_PMA_DIR, 'index.php'))) return SYSTEM_PMA_DIR;
  if (existsSync('/var/www/phpmyadmin/index.php')) return '/var/www/phpmyadmin';
  return PMA_DIR;
}

/**
 * Check if phpMyAdmin is installed and ready on the server
 */
export async function getPmaStatus() {
  const pmaPath = getPmaPath();
  const installed = existsSync(join(pmaPath, 'index.php'));

  let serverIp = '127.0.0.1';
  if (process.platform === 'linux') {
    try {
      const res = await shell("hostname -I 2>/dev/null | awk '{print $1}'");
      serverIp = res.stdout.trim() || '127.0.0.1';
    } catch {}
  }

  const defaultUrl = `http://${serverIp}/phpmyadmin/`;

  return {
    installed,
    path: pmaPath,
    version: installed ? '5.2.x' : null,
    serverIp,
    url: defaultUrl,
  };
}

/**
 * Automatically install and configure phpMyAdmin
 */
export async function installPhpMyAdmin() {
  if (process.platform !== 'linux') {
    // Dev mock
    mkdirSync(PMA_DIR, { recursive: true });
    writeFileSync(join(PMA_DIR, 'index.php'), '<?php echo "phpMyAdmin Mock"; ?>');
    return { success: true, path: PMA_DIR, simulated: true };
  }

  try {
    mkdirSync(PMA_DIR, { recursive: true });

    // 1. Try apt-get install or download standalone package
    const checkApt = await shell('which phpmyadmin 2>/dev/null || ls /usr/share/phpmyadmin/index.php 2>/dev/null');
    if (!checkApt.stdout.trim()) {
      // Download official phpMyAdmin 5.2.1 standalone tarball
      await shell(
        `curl -fsSL https://files.phpmyadmin.net/phpMyAdmin/5.2.1/phpMyAdmin-5.2.1-all-languages.tar.gz | tar -xz --strip-components=1 -C "${PMA_DIR}" 2>/dev/null || ` +
        `wget -qO- https://files.phpmyadmin.net/phpMyAdmin/5.2.1/phpMyAdmin-5.2.1-all-languages.tar.gz | tar -xz --strip-components=1 -C "${PMA_DIR}" 2>/dev/null || ` +
        `apt-get update -qq && apt-get install -y -qq phpmyadmin 2>/dev/null || true`
      );
    }

    const activePath = getPmaPath();

    // 2. Generate secure config.inc.php with blowfish secret
    const blowfishSecret = generatePassword(32, false);
    const configContent = `<?php
/**
 * phpMyAdmin Configuration - Managed by DEOLS
 */
declare(strict_types=1);

$cfg['blowfish_secret'] = '${blowfishSecret}';

$i = 0;
$i++;
$cfg['Servers'][$i]['auth_type'] = 'cookie';
$cfg['Servers'][$i]['host'] = '127.0.0.1';
$cfg['Servers'][$i]['port'] = '3306';
$cfg['Servers'][$i]['connect_type'] = 'tcp';
$cfg['Servers'][$i]['compress'] = false;
$cfg['Servers'][$i]['AllowNoPassword'] = false;
$cfg['Servers'][$i]['extension'] = 'mysqli';

$cfg['UploadDir'] = '';
$cfg['SaveDir'] = '';
$cfg['TempDir'] = '/tmp';
$cfg['SendErrorReports'] = 'never';
$cfg['MaxRows'] = 50;
$cfg['DefaultLang'] = 'en';
$cfg['ServerDefault'] = 1;
`;

    writeFileSync(join(activePath, 'config.inc.php'), configContent, 'utf-8');

    // 3. Set proper permissions for OpenLiteSpeed (nobody:nogroup)
    await shell(`chown -R nobody:nogroup "${activePath}" 2>/dev/null || chown -R nobody:www-data "${activePath}" 2>/dev/null || true`);
    await shell(`find "${activePath}" -type d -exec chmod 755 {} \\; 2>/dev/null || true`);
    await shell(`find "${activePath}" -type f -exec chmod 644 {} \\; 2>/dev/null || true`);
    await shell(`chmod 644 "${join(activePath, 'config.inc.php')}" 2>/dev/null || true`);

    // 4. Ensure OpenLiteSpeed has /phpmyadmin context in httpd_config.conf
    await ensureOlsPmaContext(activePath);

    return {
      success: true,
      message: 'phpMyAdmin installed and configured successfully!',
      path: activePath,
    };
  } catch (err) {
    return {
      success: false,
      error: 'Failed to install phpMyAdmin',
      details: err.message,
    };
  }
}

/**
 * Ensure OpenLiteSpeed global context for /phpmyadmin exists
 */
export async function ensureOlsPmaContext(pmaPath) {
  const httpdConf = join(config.olsRoot, 'conf', 'httpd_config.conf');
  if (!existsSync(httpdConf)) return;

  try {
    let content = readFileSync(httpdConf, 'utf-8');
    const pmaDir = pmaPath || getPmaPath();

    // Check if context /phpmyadmin already exists in httpd_config.conf
    if (!/context\s+\/phpmyadmin/i.test(content)) {
      const pmaContext = `
context /phpmyadmin/ {
  location                ${pmaDir}/
  allowBrowse             1
  addDefaultCharset       off
}
`;
      // Append to httpd_config.conf
      content += pmaContext;
      writeFileSync(httpdConf, content, 'utf-8');
      await shell('systemctl reload lsws 2>/dev/null || /usr/local/lsws/bin/lswsctrl reload 2>/dev/null || true');
    }
  } catch {}
}

/**
 * Generate direct URL to phpMyAdmin for a specific database/domain
 */
export async function getPmaLaunchUrl(dbName = null, domain = null) {
  let host = domain;
  let serverIp = '127.0.0.1';

  if (process.platform === 'linux') {
    try {
      const res = await shell("hostname -I 2>/dev/null | awk '{print $1}'");
      serverIp = res.stdout.trim() || '127.0.0.1';
    } catch {}
  }

  if (!host) {
    host = serverIp;
  }

  let baseUrl = `http://${host}/phpmyadmin/`;
  if (dbName) {
    baseUrl += `index.php?route=/database/structure&db=${encodeURIComponent(dbName)}`;
  }

  return {
    url: baseUrl,
    dbName,
    domain,
    serverIp,
  };
}
