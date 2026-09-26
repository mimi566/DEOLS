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
 * Write the robust, error-handled autologin.php bridge script into target directory
 */
export async function writeAutologinBridge(pmaPath) {
  const bridgeContent = `<?php
/**
 * DEOLS phpMyAdmin 1-Click Single Sign-On (SSO) Auto-Login Bridge
 */
declare(strict_types=1);
error_reporting(0);
ini_set('display_errors', '0');

// Ensure writable session path
if (!is_writable((string)session_save_path())) {
    @session_save_path('/tmp');
}

ini_set('session.use_cookies', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_path', '/');
session_name('DEOLSSession');
@session_start();

$ssoToken = $_GET['sso'] ?? ($_POST['sso'] ?? '');

if (empty($ssoToken)) {
    if (empty($_SESSION['PMA_single_signon_user'])) {
        http_response_code(403);
        die('Access Denied: Missing SSO Token.');
    }
    header('Location: index.php');
    exit;
}

// Find secret key
$secretKey = '';
$keyFiles = [
    '/opt/deols/config/sso_secret.key',
    __DIR__ . '/sso_secret.key',
    '/etc/phpmyadmin/sso_secret.key',
    '/opt/deols/data/config/sso_secret.key'
];
foreach ($keyFiles as $kf) {
    if (file_exists($kf)) {
        $secretKey = trim((string)@file_get_contents($kf));
        if (!empty($secretKey)) break;
    }
}
if (empty($secretKey) && file_exists(__DIR__ . '/config.inc.php')) {
    $c = (string)@file_get_contents(__DIR__ . '/config.inc.php');
    if (preg_match("/\\\$cfg\\['blowfish_secret'\\]\\s*=\\s*['\"]([^'\"]+)['\"];/", $c, $m)) {
        $secretKey = $m[1];
    }
}
if (empty($secretKey)) $secretKey = 'deols_pma_secret_blowfish_32chars';

$decodedData = null;

// URL-Safe HMAC Token verification (data.sig)
if (strpos($ssoToken, '.') !== false) {
    [$dataB64, $sig] = explode('.', $ssoToken, 2);
    $expectedSig = rtrim(strtr(base64_encode(hash_hmac('sha256', $dataB64, $secretKey, true)), '+/', '-_'), '=');
    if (hash_equals($expectedSig, rtrim($sig, '='))) {
        $decodedData = json_decode(base64_decode(strtr($dataB64, '-_', '+/')), true);
    }
}

// Fallback base64 / json
if (!$decodedData) {
    $clean = str_replace(' ', '+', $ssoToken);
    $raw = base64_decode(strtr($clean, '-_', '+/'));
    if ($raw && strpos($raw, ':') !== false) {
        [$ivB64, $encB64] = explode(':', $raw, 2);
        $k = hash('sha256', $secretKey, true);
        $dec = openssl_decrypt(base64_decode($encB64), 'AES-256-CBC', $k, OPENSSL_RAW_DATA, base64_decode($ivB64));
        if ($dec) $decodedData = json_decode($dec, true);
    } elseif ($raw) {
        $decodedData = json_decode($raw, true);
    }
}

if (!$decodedData || empty($decodedData['db_user'] ?? $decodedData['user'])) {
    http_response_code(400);
    die('Invalid or Corrupted SSO Token.');
}

$dbUser = $decodedData['db_user'] ?? $decodedData['user'];
$dbPass = $decodedData['db_pass'] ?? ($decodedData['pass'] ?? '');
$dbName = $decodedData['db_name'] ?? ($decodedData['db'] ?? '');
$expires = $decodedData['expires'] ?? ($decodedData['time'] ? ($decodedData['time'] + 300) : 0);

if ($expires > 0 && time() > (int)$expires) {
    http_response_code(400);
    die('SSO Token Expired.');
}

// 1. Populate phpMyAdmin Single Sign-On Session
$_SESSION['PMA_single_signon_user'] = $dbUser;
$_SESSION['PMA_single_signon_password'] = $dbPass;
$_SESSION['PMA_single_signon_host'] = '127.0.0.1';
$_SESSION['PMA_single_signon_port'] = 3306;
$_SESSION['PMA_single_signon_cfgupdate'] = [
    'host' => '127.0.0.1',
    'port' => 3306,
];

session_write_close();

setcookie('DEOLSSession', session_id(), [
    'expires' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false,
    'httponly' => true,
    'samesite' => 'Lax'
]);

$dest = 'index.php' . (!empty($dbName) ? '?route=/database/structure&db=' . urlencode($dbName) : '');
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
 * Synchronize all system phpMyAdmin configuration and autologin files
 */
export async function syncAllPmaConfigs() {
  const secret = getSsoSecret();
  const configContent = `<?php
/**
 * phpMyAdmin SSO Configuration for DEOLS
 */
declare(strict_types=1);

$cfg['blowfish_secret'] = '${secret}';

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

  const targetDirs = [
    '/opt/deols/phpmyadmin',
    '/usr/share/phpmyadmin',
    '/var/www/phpmyadmin',
    '/var/www/html/phpmyadmin',
    '/usr/local/lsws/Example/html/phpmyadmin',
    '/etc/phpmyadmin',
    '/var/lib/phpmyadmin',
    join(config.dataDir, 'phpmyadmin'),
  ];

  for (const dir of targetDirs) {
    if (existsSync(dir)) {
      try {
        writeFileSync(join(dir, 'config.inc.php'), configContent, 'utf-8');
        await writeAutologinBridge(dir);
        if (process.platform === 'linux') {
          await shell(`chown -R nobody:nogroup "${dir}" 2>/dev/null || true`);
          await shell(`chmod 644 "${join(dir, 'config.inc.php')}" "${join(dir, 'autologin.php')}" 2>/dev/null || true`);
        }
      } catch {}
    }
  }

  // Also write conf.d/01-deols.php if /etc/phpmyadmin/conf.d exists
  if (existsSync('/etc/phpmyadmin/conf.d')) {
    try {
      writeFileSync('/etc/phpmyadmin/conf.d/01-deols.php', configContent, 'utf-8');
      if (process.platform === 'linux') {
        await shell('chmod 644 /etc/phpmyadmin/conf.d/01-deols.php 2>/dev/null || true');
      }
    } catch {}
  }
}

/**
 * Automatically install and configure phpMyAdmin
 */
export async function installPhpMyAdmin() {
  if (process.platform !== 'linux') {
    // Dev mock
    mkdirSync(PMA_DIR, { recursive: true });
    writeFileSync(join(PMA_DIR, 'index.php'), '<?php echo "phpMyAdmin Mock"; ?>');
    await syncAllPmaConfigs();
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

    // 2. Synchronize configs across all paths
    await syncAllPmaConfigs();

    // 3. Ensure OpenLiteSpeed has /phpmyadmin context in httpd_config.conf and symlinks
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

  // Synchronize all phpMyAdmin configs and bridges across system
  await syncAllPmaConfigs();

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

  // If on Linux, ensure user is permitted from %, 127.0.0.1, and localhost
  if (process.platform === 'linux' && user && user !== 'root') {
    try {
      const safeDb = db ? db.replace(/[^a-zA-Z0-9_]/g, '') : '';
      const safeUser = user.replace(/[^a-zA-Z0-9_]/g, '');
      const safePass = pass.replace(/['"\\]/g, '');

      let grantSql = `CREATE USER IF NOT EXISTS '${safeUser}'@'%' IDENTIFIED BY '${safePass}'; ` +
        `ALTER USER '${safeUser}'@'%' IDENTIFIED BY '${safePass}'; ` +
        `CREATE USER IF NOT EXISTS '${safeUser}'@'127.0.0.1' IDENTIFIED BY '${safePass}'; ` +
        `ALTER USER '${safeUser}'@'127.0.0.1' IDENTIFIED BY '${safePass}'; ` +
        `CREATE USER IF NOT EXISTS '${safeUser}'@'localhost' IDENTIFIED BY '${safePass}'; ` +
        `ALTER USER '${safeUser}'@'localhost' IDENTIFIED BY '${safePass}'; `;
      if (safeDb) {
        grantSql += `GRANT ALL PRIVILEGES ON \\\`${safeDb}\\\`.* TO '${safeUser}'@'%'; ` +
          `GRANT ALL PRIVILEGES ON \\\`${safeDb}\\\`.* TO '${safeUser}'@'127.0.0.1'; ` +
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
