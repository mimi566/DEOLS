// ─────────────────────────────────────────────────────────────
// DEOLS phpMyAdmin Service
// Automated Installation, Configuration, OLS Integration, and SSO
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
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
 * Write the crash-proof autologin.php bridge script into target directory
 */
export async function writeAutologinBridge(pmaPath) {
  const bridgeContent = `<?php
/**
 * DEOLS phpMyAdmin 1-Click Single Sign-On (SSO) Auto-Login Bridge
 */
declare(strict_types=1);

// Enable strict error logging to file while suppressing fatal 500 output to browser
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

// Ensure session directory is writable
if (!is_writable((string)session_save_path())) {
    @session_save_path('/tmp');
}

// Ensure session starts under phpMyAdmin namespace
ini_set('session.use_cookies', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_path', '/');
session_name('DEOLSSession');
if (session_status() === PHP_SESSION_NONE) {
    @session_start();
}

$ssoToken = $_GET['sso'] ?? ($_POST['sso'] ?? null);

if (!$ssoToken) {
    http_response_code(400);
    die('<div style="font-family:sans-serif;padding:24px;background:#1e293b;color:#f8fafc;border-radius:12px;max-width:400px;margin:60px auto;text-align:center;"><h3>DEOLS SSO</h3><p style="color:#94a3b8;">Missing SSO token payload. Please launch from the DEOLS dashboard.</p></div>');
}

try {
    // 1. Read Secret Key used by DEOLS Node.js Backend
    $keyFile = '/opt/deols/config/sso_secret.key';
    if (!file_exists($keyFile)) {
        $keyFile = '/opt/deols/data/config/sso_secret.key';
    }
    if (!file_exists($keyFile)) {
        $keyFile = __DIR__ . '/sso_secret.key';
    }

    $encryptionKey = file_exists($keyFile) ? trim((string)@file_get_contents($keyFile)) : '';
    if (empty($encryptionKey) && file_exists(__DIR__ . '/config.inc.php')) {
        $cfg = (string)@file_get_contents(__DIR__ . '/config.inc.php');
        if (preg_match("/\\\$cfg\\['blowfish_secret'\\]\\s*=\\s*['\"]([^'\"]+)['\"];/", $cfg, $m)) {
            $encryptionKey = $m[1];
        }
    }
    if (empty($encryptionKey)) {
        $encryptionKey = 'deols_pma_secret_blowfish_32chars';
    }

    // 2. Decode Payload (Handling Base64 JSON, HMAC, and OpenSSL AES-256-CBC)
    $cleanToken = str_replace(' ', '+', (string)$ssoToken);
    $data = null;

    // A. Direct Base64 / Base64URL JSON decode
    $rawPayload = base64_decode(strtr($cleanToken, '-_', '+/'));
    if ($rawPayload) {
        $parsed = json_decode($rawPayload, true);
        if ($parsed && (isset($parsed['user']) || isset($parsed['db_user']))) {
            $data = $parsed;
        }
    }

    // B. Dot-separated HMAC Token (data.sig)
    if (!$data && strpos($cleanToken, '.') !== false) {
        [$dataB64, $sig] = explode('.', $cleanToken, 2);
        $expectedSig = rtrim(strtr(base64_encode(hash_hmac('sha256', $dataB64, $encryptionKey, true)), '+/', '-_'), '=');
        if (hash_equals($expectedSig, rtrim($sig, '='))) {
            $data = json_decode(base64_decode(strtr($dataB64, '-_', '+/')), true);
        }
    }

    // C. AES-256-CBC (IV:Ciphertext)
    if (!$data && $rawPayload && strpos($rawPayload, ':') !== false) {
        $parts = explode(':', $rawPayload, 2);
        if (count($parts) === 2) {
            $iv = base64_decode($parts[0]);
            $ciphertext = base64_decode($parts[1]);
            $k = hash('sha256', $encryptionKey, true);
            $decrypted = openssl_decrypt($ciphertext, 'aes-256-cbc', $k, OPENSSL_RAW_DATA, $iv);
            if ($decrypted) {
                $data = json_decode($decrypted, true);
            }
        }
    }

    if (!$data || (!isset($data['user']) && !isset($data['db_user']))) {
        throw new Exception("Failed to decode database credentials or invalid token format.");
    }

    $dbUser = $data['user'] ?? ($data['db_user'] ?? '');
    $dbPass = $data['pass'] ?? ($data['db_pass'] ?? '');
    $dbName = $data['db'] ?? ($data['db_name'] ?? '');
    $expires = $data['exp'] ?? ($data['expires'] ?? 0);

    // 3. Verify Token Expiry (300-second TTL)
    if ($expires > 0 && time() > (int)$expires) {
        throw new Exception("SSO session link expired. Please click 'Open in phpMyAdmin' again.");
    }

    // 4. Set phpMyAdmin Single Sign-On (SSO) Session Keys
    $_SESSION['PMA_single_signon_user'] = $dbUser;
    $_SESSION['PMA_single_signon_password'] = $dbPass;
    $_SESSION['PMA_single_signon_host'] = '127.0.0.1';
    $_SESSION['PMA_single_signon_port'] = 3306;

    // Commit session changes before redirect
    session_write_close();

    setcookie('DEOLSSession', session_id(), [
        'expires' => 0,
        'path' => '/',
        'domain' => '',
        'secure' => false,
        'httponly' => true,
        'samesite' => 'Lax'
    ]);

    // 5. Redirect cleanly into phpMyAdmin
    $dest = 'index.php' . (!empty($dbName) ? '?route=/database/structure&db=' . urlencode($dbName) : '');
    header('Location: ' . $dest);
    exit;

} catch (Exception $e) {
    error_log("[DEOLS phpMyAdmin SSO Error] " . $e->getMessage());
    http_response_code(401);
    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>phpMyAdmin SSO</title><style>body{background:#0f172a;color:#f8fafc;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}.c{background:#1e293b;padding:32px;border-radius:12px;border:1px solid #ef4444;max-width:440px;text-align:center;}h3{color:#ef4444;margin-top:0;}p{color:#94a3b8;line-height:1.5;}</style></head><body><div class="c">';
    echo '<h3>phpMyAdmin Auto-Login Failed</h3>';
    echo '<p>' . htmlspecialchars($e->getMessage()) . '</p>';
    echo '<a href="javascript:window.close()" style="display:inline-block;padding:10px 20px;background:#ef4444;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin-top:12px;">Close Window</a>';
    echo '</div></body></html>';
    exit;
}
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
  const exp = now + 300; // 5 minutes TTL

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

  // Generate Base64 Payload
  const payload = {
    user,
    pass,
    db,
    db_user: user,
    db_pass: pass,
    db_name: db,
    exp,
    expires: exp,
  };
  const ssoToken = Buffer.from(JSON.stringify(payload)).toString('base64url');

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
