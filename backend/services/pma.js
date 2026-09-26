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
 * Ensure config.inc.php is configured for Single Sign-On (SSO)
 */
export function ensurePmaConfiguration(pmaPath) {
  const cfgFile = join(pmaPath, 'config.inc.php');
  const blowfishSecret = generatePassword(32, false);
  const configContent = `<?php
/**
 * phpMyAdmin Configuration - Managed by DEOLS
 * Single Sign-On (SSO) and Secure MariaDB Bridge
 */
declare(strict_types=1);

$cfg['blowfish_secret'] = '${blowfishSecret}';

$i = 0;
$i++;
$cfg['Servers'][$i]['auth_type'] = 'signon';
$cfg['Servers'][$i]['SignonSession'] = 'DEOLS_PMA_SSO';
$cfg['Servers'][$i]['SignonURL'] = 'autologin.php';
$cfg['Servers'][$i]['SignonCookieParams'] = ['path' => '/'];
$cfg['Servers'][$i]['host'] = 'localhost';
$cfg['Servers'][$i]['connect_type'] = 'socket';
$cfg['Servers'][$i]['compress'] = false;
$cfg['Servers'][$i]['AllowNoPassword'] = true;
$cfg['Servers'][$i]['extension'] = 'mysqli';

$cfg['UploadDir'] = '';
$cfg['SaveDir'] = '';
$cfg['TempDir'] = '/tmp';
$cfg['SendErrorReports'] = 'never';
$cfg['MaxRows'] = 50;
$cfg['DefaultLang'] = 'en';
$cfg['ServerDefault'] = 1;
`;

  if (!existsSync(cfgFile)) {
    try {
      writeFileSync(cfgFile, configContent, 'utf-8');
    } catch {}
  } else {
    try {
      const current = readFileSync(cfgFile, 'utf-8');
      if (!current.includes('DEOLS_PMA_SSO') || current.includes("'auth_type'] = 'cookie'") || current.includes('"auth_type"] = "cookie"')) {
        writeFileSync(cfgFile, configContent, 'utf-8');
      }
    } catch {}
  }
}

/**
 * Write the autologin.php bridge script into phpMyAdmin directory
 */
export async function writeAutologinBridge(pmaPath) {
  const bridgeContent = `<?php
/**
 * DEOLS phpMyAdmin 1-Click Single Sign-On (SSO) Auto-Login Bridge
 */
declare(strict_types=1);

// Configure session cookies to match phpMyAdmin
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.use_cookies', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_path', '/');
    session_name('DEOLS_PMA_SSO');
    @session_start();
}

$token = $_GET['token'] ?? ($_POST['token'] ?? '');
$tokenFile = '/tmp/deols_pma_tokens.json';

if (!empty($token) && file_exists($tokenFile)) {
    $content = @file_get_contents($tokenFile);
    $tokens = $content ? json_decode($content, true) : [];

    if (is_array($tokens) && isset($tokens[$token])) {
        $data = $tokens[$token];
        // Validate token age (valid for 180 seconds)
        if (isset($data['time']) && (time() - (int)$data['time']) < 180) {
            // Delete one-time token
            unset($tokens[$token]);
            @file_put_contents($tokenFile, json_encode($tokens));
            @chmod($tokenFile, 0666);

            // Populate phpMyAdmin Signon Session
            $_SESSION['PMA_single_signon_user'] = $data['user'];
            $_SESSION['PMA_single_signon_password'] = $data['pass'];
            $_SESSION['PMA_single_signon_host'] = 'localhost';
            $_SESSION['PMA_single_signon_port'] = '';
            $_SESSION['PMA_single_signon_controluser'] = '';
            $_SESSION['PMA_single_signon_controlpass'] = '';

            // Flush session to disk before HTTP redirect
            session_write_close();

            $targetDb = !empty($data['db']) ? urlencode($data['db']) : '';
            $dest = 'index.php' . ($targetDb ? '?route=/database/structure&db=' . $targetDb : '');
            header('Location: ' . $dest);
            exit;
        }
    }
}

// Fallback login form if session expired
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !empty($_POST['pma_username'])) {
    $_SESSION['PMA_single_signon_user'] = $_POST['pma_username'];
    $_SESSION['PMA_single_signon_password'] = $_POST['pma_password'] ?? '';
    $_SESSION['PMA_single_signon_host'] = 'localhost';
    $_SESSION['PMA_single_signon_port'] = '';
    session_write_close();
    header('Location: index.php');
    exit;
}

// If already authenticated, go straight to index
if (!empty($_SESSION['PMA_single_signon_user'])) {
    header('Location: index.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>phpMyAdmin &mdash; DEOLS Login</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; padding: 32px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); width: 340px; border: 1px solid #334155; }
    h2 { margin: 0 0 16px; font-size: 1.25rem; text-align: center; color: #38bdf8; }
    label { display: block; margin-bottom: 6px; font-size: 0.85rem; color: #94a3b8; }
    input { width: 100%; box-sizing: border-box; padding: 10px; margin-bottom: 16px; border: 1px solid #475569; border-radius: 6px; background: #0f172a; color: #fff; }
    button { width: 100%; padding: 10px; border: none; border-radius: 6px; background: #0284c7; color: #fff; font-weight: 600; cursor: pointer; font-size: 0.95rem; }
    button:hover { background: #0369a1; }
  </style>
</head>
<body>
  <div class="card">
    <h2>🗄️ phpMyAdmin Login</h2>
    <form method="POST" action="autologin.php">
      <label>Database User</label>
      <input type="text" name="pma_username" placeholder="Database user" required autofocus>
      <label>Database Password</label>
      <input type="password" name="pma_password" placeholder="Password">
      <button type="submit">Log In to Database</button>
    </form>
  </div>
</body>
</html>
`;

  try {
    writeFileSync(join(pmaPath, 'autologin.php'), bridgeContent, 'utf-8');
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

  // Ensure bridge script and configuration exist
  ensurePmaConfiguration(pmaDir);
  await writeAutologinBridge(pmaDir);

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
  // Ensure autologin bridge and config exist
  await ensureOlsPmaContext(pmaPath);

  // Look up credentials for site
  const creds = getSiteDatabaseCredentials(dbName, domain);
  const user = creds?.user || (domain ? 'u_' + domain.replace(/[^a-z0-9]/gi, '').substring(0, 10) : 'root');
  const pass = creds?.pass || '';
  const db = creds?.db || dbName || '';

  // Generate random crypto token
  const token = crypto.randomBytes(24).toString('hex');

  // Save to /tmp/deols_pma_tokens.json
  const tokenFile = '/tmp/deols_pma_tokens.json';
  let tokens = {};
  if (existsSync(tokenFile)) {
    try {
      tokens = JSON.parse(readFileSync(tokenFile, 'utf-8'));
    } catch {}
  }

  // Purge expired tokens (> 180s old)
  const now = Math.floor(Date.now() / 1000);
  for (const k of Object.keys(tokens)) {
    if (tokens[k]?.time && (now - tokens[k].time) > 180) {
      delete tokens[k];
    }
  }

  tokens[token] = {
    user,
    pass,
    db,
    time: now,
  };

  try {
    writeFileSync(tokenFile, JSON.stringify(tokens), { mode: 0o666 });
    if (process.platform === 'linux') {
      await shell('chmod 666 /tmp/deols_pma_tokens.json 2>/dev/null || true');
    }
  } catch {}

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

  const ssoUrl = `http://${host}/phpmyadmin/autologin.php?token=${token}`;

  return {
    success: true,
    token,
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
