// ─────────────────────────────────────────────────────────────
// DEOLS phpMyAdmin Service
// Automated Installation, Configuration, OLS Integration, and Auto-Login
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
 * Ensure standard phpMyAdmin configuration (Cookie Auth)
 */
export function ensurePmaConfiguration(pmaPath) {
  const cfgFile = join(pmaPath, 'config.inc.php');
  const blowfishSecret = config.cookieSecret || generatePassword(32, false);

  const configContent = `<?php
/**
 * phpMyAdmin Configuration - Managed by DEOLS
 * Standard Secure Cookie Authentication
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

  try {
    writeFileSync(cfgFile, configContent, 'utf-8');
    if (process.platform === 'linux') {
      shell(`chmod 644 "${cfgFile}" 2>/dev/null || true`);
      shell(`chown nobody:nogroup "${cfgFile}" 2>/dev/null || true`);
    }
  } catch {}
}

/**
 * Write helper auto-submit script into phpMyAdmin directory
 */
export async function writeAutologinBridge(pmaPath) {
  const bridgeContent = `<?php
/**
 * DEOLS phpMyAdmin Background Auto-Submit Helper
 */
declare(strict_types=1);

$user = $_POST['pma_username'] ?? ($_GET['u'] ?? '');
$pass = $_POST['pma_password'] ?? ($_GET['p'] ?? '');
$db = $_POST['db'] ?? ($_GET['db'] ?? '');

if (empty($user)) {
    header('Location: index.php');
    exit;
}
?>
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Opening phpMyAdmin…</title>
  <style>
    body { background: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { text-align: center; }
    .spinner { width: 36px; height: 36px; border: 3px solid rgba(56,189,248,0.2); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h3 style="margin:0 0 8px;">Connecting to phpMyAdmin…</h3>
    <p style="color:#94a3b8;margin:0;font-size:0.9rem;">Logging into database in the background…</p>
    <form id="pmaForm" method="POST" action="index.php" style="display:none;">
      <input type="hidden" name="pma_username" value="<?php echo htmlspecialchars($user, ENT_QUOTES, 'UTF-8'); ?>">
      <input type="hidden" name="pma_password" value="<?php echo htmlspecialchars($pass, ENT_QUOTES, 'UTF-8'); ?>">
      <input type="hidden" name="server" value="1">
      <?php if (!empty($db)): ?>
      <input type="hidden" name="target" value="index.php?route=/database/structure&db=<?php echo urlencode($db); ?>">
      <input type="hidden" name="db" value="<?php echo htmlspecialchars($db, ENT_QUOTES, 'UTF-8'); ?>">
      <?php endif; ?>
    </form>
  </div>
  <script>
    document.getElementById('pmaForm').submit();
  </script>
</body>
</html>
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
 * Synchronize all system phpMyAdmin configuration files
 */
export async function syncAllPmaConfigs() {
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
      ensurePmaConfiguration(dir);
      await writeAutologinBridge(dir);
    }
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
      message: 'phpMyAdmin ready with 1-Click Database Auto-Login!',
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
 * Generate 1-Click Database Auto-Login Payload and Credentials
 */
export async function generatePmaSsoSession(dbName = null, domain = null, reqHost = null) {
  const pmaPath = getPmaPath();
  await ensureOlsPmaContext(pmaPath);

  // Look up credentials for site
  const creds = getSiteDatabaseCredentials(dbName, domain);
  const user = creds?.user || (domain ? 'u_' + domain.replace(/[^a-z0-9]/gi, '').substring(0, 10) : 'root');
  const pass = creds?.pass || '';
  const db = creds?.db || dbName || '';

  // Ensure user is permitted in MariaDB from %, 127.0.0.1, and localhost
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

  const actionUrl = `http://${host}/phpmyadmin/index.php`;

  return {
    success: true,
    user,
    pass,
    db,
    serverIp: host,
    actionUrl,
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
