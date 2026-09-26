// ─────────────────────────────────────────────────────────────
// DEOLS phpMyAdmin Service
// Automated Installation, Configuration, OLS Integration, and SSO
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
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
 * Retrieve or generate persistent SSO secret key
 */
export function getSsoSecret() {
  const configDir = process.platform === 'linux' ? '/opt/deols/config' : join(config.dataDir, 'config');
  try {
    mkdirSync(configDir, { recursive: true });
  } catch {}

  const keyFile = join(configDir, 'sso_secret.key');

  if (existsSync(keyFile)) {
    try {
      const k = readFileSync(keyFile, 'utf-8').trim();
      if (k.length >= 16) return k;
    } catch {}
  }

  const newKey = config.jwtSecret || config.cookieSecret || generatePassword(32, false);
  try {
    writeFileSync(keyFile, newKey, { mode: 0o644 });
    if (process.platform === 'linux') {
      shell(`chmod 644 "${keyFile}" 2>/dev/null || true`);
      shell(`chown nobody:nogroup "${keyFile}" 2>/dev/null || true`);
    }
  } catch {}

  return newKey;
}

/**
 * Create URL-safe HMAC-SHA256 signed SSO Token (No special chars or URL mutations)
 */
export function createSsoToken(payload, secret) {
  const dataB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(dataB64).digest('base64url');
  return `${dataB64}.${sig}`;
}

/**
 * Ensure config.inc.php is configured for Single Sign-On (SSO) mode
 */
export function ensurePmaConfiguration(pmaPath) {
  const cfgFile = join(pmaPath, 'config.inc.php');
  const blowfishSecret = getSsoSecret();

  const configContent = `<?php
/**
 * phpMyAdmin SSO Configuration for DEOLS
 */
declare(strict_types=1);

$cfg['blowfish_secret'] = '${blowfishSecret}';

$i = 0;
$i++;
$cfg['Servers'][$i]['auth_type'] = 'signon';
$cfg['Servers'][$i]['SignonSession'] = 'DEOLSSession';
$cfg['Servers'][$i]['SignonURL'] = 'autologin.php';
$cfg['Servers'][$i]['LogoutURL'] = '/';
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

  try {
    writeFileSync(cfgFile, configContent, 'utf-8');
    if (process.platform === 'linux') {
      shell(`chmod 644 "${cfgFile}" 2>/dev/null || true`);
      shell(`chown nobody:nogroup "${cfgFile}" 2>/dev/null || true`);
    }
  } catch {}
}

/**
 * Write the robust, error-handled autologin.php bridge script into phpMyAdmin directory
 */
export async function writeAutologinBridge(pmaPath) {
  const bridgeContent = `<?php
/**
 * DEOLS phpMyAdmin 1-Click Single Sign-On (SSO) Auto-Login Bridge
 */
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

// Ensure session directory is writable
$sessPath = session_save_path();
if (empty($sessPath) || !is_writable($sessPath)) {
    if (is_dir('/tmp') && is_writable('/tmp')) {
        session_save_path('/tmp');
    }
}

// Session configuration matching phpMyAdmin
ini_set('session.use_cookies', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_path', '/');
session_name('DEOLSSession');
@session_start();

$ssoToken = $_GET['sso'] ?? ($_POST['sso'] ?? '');

if (empty($ssoToken)) {
    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>phpMyAdmin SSO</title><style>body{background:#0f172a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}.c{background:#1e293b;padding:24px;border-radius:12px;text-align:center;max-width:360px;}h3{color:#38bdf8;}</style></head><body><div class="c"><h3>🗄️ DEOLS phpMyAdmin</h3><p style="color:#94a3b8;">Please launch phpMyAdmin from your DEOLS control panel database section.</p></div></body></html>';
    exit;
}

// Read secret key
$secretKey = '';
$keyFiles = [
    '/opt/deols/config/sso_secret.key',
    __DIR__ . '/sso_secret.key',
    '/opt/deols/data/config/sso_secret.key'
];
foreach ($keyFiles as $kf) {
    if (file_exists($kf) && is_readable($kf)) {
        $secretKey = trim((string)@file_get_contents($kf));
        if (!empty($secretKey)) break;
    }
}

// Fallback to config.inc.php blowfish secret
if (empty($secretKey) && file_exists(__DIR__ . '/config.inc.php')) {
    $cfgContent = (string)@file_get_contents(__DIR__ . '/config.inc.php');
    if (preg_match("/\\\$cfg\\['blowfish_secret'\\]\\s*=\\s*['\"]([^'\"]+)['\"];/", $cfgContent, $m)) {
        $secretKey = $m[1];
    }
}

if (empty($secretKey)) {
    $secretKey = 'deols_pma_secret_blowfish_32chars';
}

$decodedData = null;

// Method 1: URL-safe HMAC Token (data.signature)
if (strpos($ssoToken, '.') !== false) {
    [$dataB64, $sig] = explode('.', $ssoToken, 2);
    $expectedSig = rtrim(strtr(base64_encode(hash_hmac('sha256', $dataB64, $secretKey, true)), '+/', '-_'), '=');
    $cleanSig = rtrim($sig, '=');

    if (hash_equals($expectedSig, $cleanSig)) {
        $jsonStr = base64_decode(strtr($dataB64, '-_', '+/'));
        $decodedData = json_decode($jsonStr, true);
    }
}

// Method 2: Legacy fallback
if (!$decodedData) {
    $cleanToken = str_replace(' ', '+', $ssoToken);
    $raw = base64_decode(strtr($cleanToken, '-_', '+/'));
    if ($raw && strpos($raw, ':') !== false) {
        [$ivB64, $encB64] = explode(':', $raw, 2);
        $iv = base64_decode($ivB64);
        $k = hash('sha256', $secretKey, true);
        $dec = openssl_decrypt(base64_decode($encB64), 'AES-256-CBC', $k, OPENSSL_RAW_DATA, $iv);
        if ($dec) $decodedData = json_decode($dec, true);
    } elseif ($raw) {
        $json = json_decode($raw, true);
        if ($json) $decodedData = $json;
    }
}

if (!$decodedData || !is_array($decodedData)) {
    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>phpMyAdmin SSO</title><style>body{background:#0f172a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}.c{background:#1e293b;padding:24px;border-radius:12px;text-align:center;border:1px solid #ef4444;max-width:380px;}h3{color:#ef4444;margin-top:0;}p{color:#94a3b8;line-height:1.5;}</style></head><body><div class="c"><h3>Authentication Token Error</h3><p>Unable to verify SSO token signature. Please try launching phpMyAdmin again from DEOLS.</p></div></body></html>';
    exit;
}

$dbUser = $decodedData['db_user'] ?? ($decodedData['user'] ?? '');
$dbPass = $decodedData['db_pass'] ?? ($decodedData['pass'] ?? '');
$dbName = $decodedData['db_name'] ?? ($decodedData['db'] ?? '');
$expires = $decodedData['expires'] ?? ($decodedData['time'] ? ($decodedData['time'] + 300) : 0);

if (empty($dbUser)) {
    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>phpMyAdmin SSO</title><style>body{background:#0f172a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}.c{background:#1e293b;padding:24px;border-radius:12px;text-align:center;border:1px solid #ef4444;max-width:380px;}h3{color:#ef4444;margin-top:0;}</style></head><body><div class="c"><h3>Missing Database User</h3><p style="color:#94a3b8;">No database user associated with this token.</p></div></body></html>';
    exit;
}

if ($expires > 0 && time() > (int)$expires) {
    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>phpMyAdmin SSO</title><style>body{background:#0f172a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}.c{background:#1e293b;padding:24px;border-radius:12px;text-align:center;border:1px solid #eab308;max-width:380px;}h3{color:#eab308;margin-top:0;}</style></head><body><div class="c"><h3>SSO Session Expired</h3><p style="color:#94a3b8;">The one-time login link expired. Please click "Open in phpMyAdmin" again.</p></div></body></html>';
    exit;
}

// Populate phpMyAdmin Signon Session
$_SESSION['PMA_single_signon_user'] = $dbUser;
$_SESSION['PMA_single_signon_password'] = $dbPass;
$_SESSION['PMA_single_signon_host'] = '127.0.0.1';
$_SESSION['PMA_single_signon_port'] = 3306;

session_write_close();

// Set cookie for browser
setcookie('DEOLSSession', session_id(), [
    'expires' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false,
    'httponly' => true,
    'samesite' => 'Lax'
]);

$targetDb = !empty($dbName) ? urlencode($dbName) : '';
$dest = 'index.php' . ($targetDb ? '?route=/database/structure&db=' . $targetDb : '');
header('Location: ' . $dest);
exit;
`;

  try {
    writeFileSync(join(pmaPath, 'autologin.php'), bridgeContent, 'utf-8');
    if (process.platform === 'linux') {
      await shell(`chmod 644 "${join(pmaPath, 'autologin.php')}" 2>/dev/null || true`);
      await shell(`chown nobody:nogroup "${join(pmaPath, 'autologin.php')}" 2>/dev/null || true`);
    }
  } catch {}
}

/**
 * Automatically install and configure phpMyAdmin
 */
export async function installPhpMyAdmin() {
  if (process.platform !== 'linux') {
    // Dev mock
    mkdirSync(PMA_DIR, { recursive: true });
    writeFileSync(join(PMA_DIR, 'index.php'), '<?php echo "phpMyAdmin Mock"; ?>');
    ensurePmaConfiguration(PMA_DIR);
    await writeAutologinBridge(PMA_DIR);
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

    // 2. Configure config.inc.php and autologin.php bridge
    ensurePmaConfiguration(activePath);
    await writeAutologinBridge(activePath);

    // 3. Set proper permissions for OpenLiteSpeed (nobody:nogroup)
    await shell(`chown -R nobody:nogroup "${activePath}" 2>/dev/null || chown -R nobody:www-data "${activePath}" 2>/dev/null || true`);
    await shell(`find "${activePath}" -type d -exec chmod 755 {} \\; 2>/dev/null || true`);
    await shell(`find "${activePath}" -type f -exec chmod 644 {} \\; 2>/dev/null || true`);
    await shell(`chmod 644 "${join(activePath, 'config.inc.php')}" "${join(activePath, 'autologin.php')}" 2>/dev/null || true`);

    // 4. Ensure OpenLiteSpeed has /phpmyadmin context in httpd_config.conf and symlinks
    await ensureOlsPmaContext(activePath);

    return {
      success: true,
      message: 'phpMyAdmin installed and configured with 1-Click SSO successfully!',
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
 * Ensure OpenLiteSpeed global context and symlinks for /phpmyadmin exist
 */
export async function ensureOlsPmaContext(pmaPath) {
  const pmaDir = pmaPath || getPmaPath();

  // Ensure key file exists and has proper permissions
  getSsoSecret();

  // Ensure bridge script and configuration exist in active PMA path
  ensurePmaConfiguration(pmaDir);
  await writeAutologinBridge(pmaDir);

  // If /usr/share/phpmyadmin exists, also ensure configuration there
  if (pmaDir !== SYSTEM_PMA_DIR && existsSync(join(SYSTEM_PMA_DIR, 'index.php'))) {
    ensurePmaConfiguration(SYSTEM_PMA_DIR);
    await writeAutologinBridge(SYSTEM_PMA_DIR);
  }

  if (process.platform === 'linux') {
    try {
      // 1. Ensure permissions are nobody:nogroup and 755
      await shell(`chown -R nobody:nogroup "${pmaDir}" 2>/dev/null || chown -R nobody:www-data "${pmaDir}" 2>/dev/null || true`);
      await shell(`find "${pmaDir}" -type d -exec chmod 755 {} \\; 2>/dev/null || true`);
      await shell(`find "${pmaDir}" -type f -exec chmod 644 {} \\; 2>/dev/null || true`);

      // 2. Symlink to Example vhost html directory (serves Server IP default traffic on port 80/443)
      if (existsSync('/usr/local/lsws/Example/html')) {
        await shell(`ln -sfn "${pmaDir}" /usr/local/lsws/Example/html/phpmyadmin 2>/dev/null || true`);
        await shell('chown -h nobody:nogroup /usr/local/lsws/Example/html/phpmyadmin 2>/dev/null || true');
      }

      // 3. Symlink to /var/www/html
      mkdirSync('/var/www/html', { recursive: true });
      await shell(`ln -sfn "${pmaDir}" /var/www/html/phpmyadmin 2>/dev/null || true`);
      await shell('chown -h nobody:nogroup /var/www/html/phpmyadmin 2>/dev/null || true');
    } catch {}
  }

  // 4. Also register context in httpd_config.conf
  const httpdConf = join(config.olsRoot, 'conf', 'httpd_config.conf');
  if (existsSync(httpdConf)) {
    try {
      let content = readFileSync(httpdConf, 'utf-8');
      if (!/context\s+\/phpmyadmin/i.test(content)) {
        const pmaContext = `
context /phpmyadmin/ {
  location                ${pmaDir}/
  allowBrowse             1
  addDefaultCharset       off
}
`;
        content += pmaContext;
        writeFileSync(httpdConf, content, 'utf-8');
        if (process.platform === 'linux') {
          await shell('systemctl reload lsws 2>/dev/null || /usr/local/lsws/bin/lswsctrl reload 2>/dev/null || true');
        }
      }
    } catch {}
  }
}

/**
 * Retrieve database credentials for a site from wp-config.php or sites.json
 */
export function getSiteDatabaseCredentials(dbName, domain) {
  const sitesFile = join(config.dataDir, 'sites.json');
  let sites = [];
  if (existsSync(sitesFile)) {
    try {
      sites = JSON.parse(readFileSync(sitesFile, 'utf-8'));
    } catch {}
  }

  const cleanDbName = dbName ? dbName.trim() : '';
  const cleanDomain = domain ? domain.trim().toLowerCase() : '';

  // 1. Try match by domain or dbName in sites.json
  let site = null;
  if (cleanDomain) {
    site = sites.find((s) => s.domain && s.domain.toLowerCase() === cleanDomain);
  }
  if (!site && cleanDbName) {
    site = sites.find((s) =>
      s.dbName === cleanDbName ||
      (s.domain && cleanDbName.includes(s.domain.replace(/[^a-z0-9]/gi, '_'))) ||
      (s.domain && s.domain.replace(/[^a-z0-9]/gi, '_').includes(cleanDbName.replace(/^wp_/, '')))
    );
  }

  // 2. If site found, check wp-config.php for actual live credentials
  if (site) {
    const wpConfigPath = join(site.docRoot || join(config.webRoot, site.domain, 'public_html'), 'wp-config.php');
    if (existsSync(wpConfigPath)) {
      try {
        const text = readFileSync(wpConfigPath, 'utf-8');
        const dbNameMatch = text.match(/define\s*\(\s*['"]DB_NAME['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i);
        const dbUserMatch = text.match(/define\s*\(\s*['"]DB_USER['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i);
        const dbPassMatch = text.match(/define\s*\(\s*['"]DB_PASSWORD['"]\s*,\s*['"]([^'"]*)['"]\s*\)/i);

        if (dbUserMatch && dbPassMatch) {
          return {
            user: dbUserMatch[1],
            pass: dbPassMatch[1],
            db: dbNameMatch ? dbNameMatch[1] : (cleanDbName || site.dbName),
          };
        }
      } catch {}
    }

    if (site.dbUser && site.dbPassword) {
      return {
        user: site.dbUser,
        pass: site.dbPassword,
        db: site.dbName || cleanDbName,
      };
    }
  }

  // 3. Search all /var/www/*/public_html/wp-config.php for matching dbName
  if (existsSync(config.webRoot)) {
    try {
      const dirs = readdirSync(config.webRoot);
      for (const d of dirs) {
        if (cleanDomain && d.toLowerCase() === cleanDomain) {
          const cfgPath = join(config.webRoot, d, 'public_html', 'wp-config.php');
          if (existsSync(cfgPath)) {
            const text = readFileSync(cfgPath, 'utf-8');
            const dbNameMatch = text.match(/define\s*\(\s*['"]DB_NAME['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i);
            const dbUserMatch = text.match(/define\s*\(\s*['"]DB_USER['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i);
            const dbPassMatch = text.match(/define\s*\(\s*['"]DB_PASSWORD['"]\s*,\s*['"]([^'"]*)['"]\s*\)/i);
            if (dbUserMatch && dbPassMatch) {
              return {
                user: dbUserMatch[1],
                pass: dbPassMatch[1],
                db: dbNameMatch ? dbNameMatch[1] : (cleanDbName || d),
              };
            }
          }
        }

        if (cleanDbName) {
          const cfgPath = join(config.webRoot, d, 'public_html', 'wp-config.php');
          if (existsSync(cfgPath)) {
            const text = readFileSync(cfgPath, 'utf-8');
            if (text.includes(cleanDbName)) {
              const dbNameMatch = text.match(/define\s*\(\s*['"]DB_NAME['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i);
              const dbUserMatch = text.match(/define\s*\(\s*['"]DB_USER['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i);
              const dbPassMatch = text.match(/define\s*\(\s*['"]DB_PASSWORD['"]\s*,\s*['"]([^'"]*)['"]\s*\)/i);
              if (dbUserMatch && dbPassMatch) {
                return {
                  user: dbUserMatch[1],
                  pass: dbPassMatch[1],
                  db: dbNameMatch ? dbNameMatch[1] : cleanDbName,
                };
              }
            }
          }
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Generate a 1-Click Single Sign-On (SSO) Auto-Login Token
 */
export async function generatePmaSsoSession(dbName = null, domain = null, reqHost = null) {
  const pmaPath = getPmaPath();
  await ensureOlsPmaContext(pmaPath);

  // Look up credentials for site
  const creds = getSiteDatabaseCredentials(dbName, domain);
  const user = creds?.user || (domain ? 'u_' + domain.replace(/[^a-z0-9]/gi, '').substring(0, 10) : 'root');
  const pass = creds?.pass || '';
  const db = creds?.db || dbName || '';

  const now = Math.floor(Date.now() / 1000);
  const expires = now + 180; // 3 minutes TTL
  const secretKey = getSsoSecret();

  // If on Linux, ensure user is permitted from 127.0.0.1 and localhost
  if (process.platform === 'linux' && user && user !== 'root') {
    try {
      const safeDb = db ? db.replace(/[^a-zA-Z0-9_]/g, '') : '';
      const safeUser = user.replace(/[^a-zA-Z0-9_]/g, '');
      const safePass = pass.replace(/['"\\]/g, '');

      let grantSql = `CREATE USER IF NOT EXISTS '${safeUser}'@'127.0.0.1' IDENTIFIED BY '${safePass}'; ` +
        `ALTER USER '${safeUser}'@'127.0.0.1' IDENTIFIED BY '${safePass}'; ` +
        `CREATE USER IF NOT EXISTS '${safeUser}'@'localhost' IDENTIFIED BY '${safePass}'; ` +
        `ALTER USER '${safeUser}'@'localhost' IDENTIFIED BY '${safePass}'; `;
      if (safeDb) {
        grantSql += `GRANT ALL PRIVILEGES ON \\\`${safeDb}\\\`.* TO '${safeUser}'@'127.0.0.1'; ` +
          `GRANT ALL PRIVILEGES ON \\\`${safeDb}\\\`.* TO '${safeUser}'@'localhost'; `;
      }
      grantSql += 'FLUSH PRIVILEGES;';

      await shell(`mysql -u root -e "${grantSql}" 2>/dev/null || mariadb -u root -e "${grantSql}" 2>/dev/null || true`);
    } catch {}
  }

  // Generate URL-safe HMAC-signed token
  const payload = {
    db_user: user,
    db_pass: pass,
    db_name: db,
    expires,
  };
  const ssoToken = createSsoToken(payload, secretKey);

  // Determine server IP or Host
  let serverIp = '127.0.0.1';
  if (process.platform === 'linux') {
    try {
      const res = await shell("curl -s -m 2 https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}'");
      serverIp = res.stdout.trim() || '127.0.0.1';
    } catch {}
  }

  const host = reqHost && reqHost !== 'localhost' && !reqHost.includes('127.0.0.1')
    ? reqHost
    : (serverIp !== '127.0.0.1' ? serverIp : '127.0.0.1');

  const ssoUrl = `http://${host}/phpmyadmin/autologin.php?sso=${ssoToken}`;

  return {
    success: true,
    token: ssoToken,
    ssoEnc: ssoToken,
    ssoUrl,
    user,
    db,
    serverIp: host,
  };
}

/**
 * Generate direct URL to phpMyAdmin using Server IP
 */
export async function getPmaLaunchUrl(dbName = null, domain = null) {
  let serverIp = '127.0.0.1';

  if (process.platform === 'linux') {
    try {
      const res = await shell("curl -s -m 2 https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}'");
      serverIp = res.stdout.trim() || '127.0.0.1';
    } catch {}
  }

  // Always use serverIp for phpMyAdmin URL
  const host = serverIp !== '127.0.0.1' ? serverIp : (domain || '127.0.0.1');

  let baseUrl = `http://${host}/phpmyadmin/`;
  if (dbName) {
    baseUrl += `index.php?route=/database/structure&db=${encodeURIComponent(dbName)}`;
  }

  return {
    url: baseUrl,
    dbName,
    serverIp,
    host,
  };
}
