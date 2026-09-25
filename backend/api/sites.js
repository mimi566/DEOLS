// ─────────────────────────────────────────────────────────────
// DEOLS Sites API — WordPress Site Provisioning & Management
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { shell, run, sanitizeDomain, isValidDomain } from '../utils/shell.js';
import {
  ensureOlsListeners,
  addVirtualHostToOls,
  removeVirtualHostFromOls,
  generateCyberpanelVhConf,
  getVirtualHostConfig,
  updateVirtualHostSSL,
} from '../utils/ols-config.js';

const SITES_FILE = join(config.dataDir, 'sites.json');

function loadSites() {
  if (!existsSync(SITES_FILE)) return [];
  try {
    return JSON.parse(readFileSync(SITES_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveSites(sites) {
  writeFileSync(SITES_FILE, JSON.stringify(sites, null, 2));
}

export default async function sitesRoutes(app) {
  // All routes require authentication
  app.addHook('preHandler', app.authenticate);

  // ─── List Sites ─────────────────────────────────────────
  app.get('/', async () => {
    return { sites: loadSites() };
  });

  // ─── Get Single Site ────────────────────────────────────
  app.get('/:domain', async (request, reply) => {
    const sites = loadSites();
    const site = sites.find((s) => s.domain === request.params.domain);
    if (!site) return reply.code(404).send({ error: 'Site not found' });
    return site;
  });

  // ─── Create WordPress Site ──────────────────────────────
  app.post('/', async (request, reply) => {
    const {
      domain,
      phpVersion = '83',
      siteTitle = 'My WordPress Site',
      adminUser = 'admin',
      adminEmail = 'admin@' + (request.body?.domain || 'localhost'),
      adminPassword,
      enableWildcard = false,
      enableLSCache = true,
    } = request.body || {};

    if (!domain) {
      return reply.code(400).send({ error: 'Domain is required' });
    }

    const cleanDomain = sanitizeDomain(domain);
    if (!isValidDomain(cleanDomain)) {
      return reply.code(400).send({ error: 'Invalid domain format' });
    }

    const sites = loadSites();
    if (sites.find((s) => s.domain === cleanDomain)) {
      return reply.code(409).send({ error: 'Site already exists' });
    }

    const siteRoot = join(config.webRoot, cleanDomain);
    const docRoot = join(siteRoot, 'public_html');
    const logsDir = join(siteRoot, 'logs');

    try {
      // 1. Create directory structure
      mkdirSync(docRoot, { recursive: true });
      mkdirSync(logsDir, { recursive: true });

      // 2. Generate DB credentials
      const dbName = 'wp_' + cleanDomain.replace(/[^a-z0-9]/g, '_').substring(0, 40);
      const dbUser = 'u_' + cleanDomain.replace(/[^a-z0-9]/g, '_').substring(0, 14);
      const { generatePassword } = await import('../utils/shell.js');
      const dbPass = generatePassword(20);

      // 3. Create MariaDB database and user
      await shell(
        `mysql -u root -e "CREATE DATABASE IF NOT EXISTS \\\`${dbName}\\\`; ` +
        `CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}'; ` +
        `GRANT ALL PRIVILEGES ON \\\`${dbName}\\\`.* TO '${dbUser}'@'localhost'; ` +
        `FLUSH PRIVILEGES;"`
      );

      // 4. Download and extract WordPress core files
      let downloaded = false;
      try {
        const wpDl = await run(config.bin.wp, [
          'core', 'download',
          '--path=' + docRoot,
          '--locale=en_US',
          '--allow-root',
        ], { cwd: docRoot });
        downloaded = wpDl.code === 0 && existsSync(join(docRoot, 'wp-load.php'));
      } catch {}

      // Fallback: If WP-CLI download failed, download official WordPress tarball directly
      if (!downloaded || !existsSync(join(docRoot, 'wp-load.php'))) {
        try {
          await shell(`curl -fsSL https://wordpress.org/latest.tar.gz | tar -xz --strip-components=1 -C "${docRoot}"`);
        } catch {}
      }

      // 5. Create wp-config.php
      let configCreated = false;
      try {
        const wpCfg = await run(config.bin.wp, [
          'config', 'create',
          '--path=' + docRoot,
          `--dbname=${dbName}`,
          `--dbuser=${dbUser}`,
          `--dbpass=${dbPass}`,
          '--dbhost=localhost',
          '--dbprefix=wp_',
          '--allow-root',
        ], { cwd: docRoot });
        configCreated = wpCfg.code === 0 && existsSync(join(docRoot, 'wp-config.php'));
      } catch {}

      // Fallback: Write wp-config.php manually if needed
      if (!configCreated && !existsSync(join(docRoot, 'wp-config.php'))) {
        const wpConfigContent = `<?php
define( 'DB_NAME', '${dbName}' );
define( 'DB_USER', '${dbUser}' );
define( 'DB_PASSWORD', '${dbPass}' );
define( 'DB_HOST', 'localhost' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );

define( 'AUTH_KEY',         '${dbPass}_auth' );
define( 'SECURE_AUTH_KEY',  '${dbPass}_sec' );
define( 'LOGGED_IN_KEY',    '${dbPass}_log' );
define( 'NONCE_KEY',        '${dbPass}_non' );
define( 'AUTH_SALT',        '${dbPass}_asalt' );
define( 'SECURE_AUTH_SALT', '${dbPass}_ssalt' );
define( 'LOGGED_IN_SALT',   '${dbPass}_lsalt' );
define( 'NONCE_SALT',       '${dbPass}_nsalt' );

$table_prefix = 'wp_';
define( 'WP_DEBUG', false );

if ( ! defined( 'ABSPATH' ) ) {
  define( 'ABSPATH', __DIR__ . '/' );
}
require_once ABSPATH . 'wp-settings.php';
`;
        writeFileSync(join(docRoot, 'wp-config.php'), wpConfigContent);
      }

      const siteAdminPass = adminPassword || generatePassword(16);

      // 6. Install WordPress via WP-CLI
      try {
        await run(config.bin.wp, [
          'core', 'install',
          '--path=' + docRoot,
          `--url=http://${cleanDomain}`,
          `--title=${siteTitle}`,
          `--admin_user=${adminUser}`,
          `--admin_email=${adminEmail}`,
          `--admin_password=${siteAdminPass}`,
          '--skip-email',
          '--allow-root',
        ], { cwd: docRoot });
      } catch {}

      // 7. Install LiteSpeed Cache plugin
      if (enableLSCache) {
        try {
          await run(config.bin.wp, [
            'plugin', 'install', 'litespeed-cache',
            '--activate',
            '--path=' + docRoot,
            '--allow-root',
          ], { cwd: docRoot });
        } catch {}
      }

      // 8. Set correct file permissions
      await shell(`chown -R nobody:nogroup "${siteRoot}"`);
      await shell(`find "${docRoot}" -type d -exec chmod 755 {} \\; 2>/dev/null || true`);
      await shell(`find "${docRoot}" -type f -exec chmod 644 {} \\; 2>/dev/null || true`);

      // 7. Ensure OLS dual listeners (Default :80 and DefaultHTTPS :443) exist
      ensureOlsListeners();

      // 8. Generate CyberPanel-compatible OLS Virtual Host config with isolated PHP socket
      const vhostConfDir = join(config.vhostsDir, cleanDomain);
      mkdirSync(vhostConfDir, { recursive: true });

      const vhconfContent = generateCyberpanelVhConf(cleanDomain, docRoot, logsDir, phpVersion, enableWildcard);
      writeFileSync(join(vhostConfDir, 'vhconf.conf'), vhconfContent);

      // 9. Add Virtual Host to OLS and map to both port 80 and port 443 listeners
      addVirtualHostToOls(cleanDomain, enableWildcard);

      // 10. Graceful restart OLS
      await run(config.bin.lswsctrl, ['restart']);

      // 10. Save site record
      const site = {
        id: crypto.randomUUID(),
        domain: cleanDomain,
        docRoot,
        phpVersion,
        dbName,
        dbUser,
        ssl: false,
        wildcard: enableWildcard,
        lsCache: enableLSCache,
        status: 'active',
        createdAt: new Date().toISOString(),
        adminUser,
        adminPassword: siteAdminPass,
      };

      sites.push(site);
      saveSites(sites);

      return {
        success: true,
        site,
        credentials: {
          wpAdmin: adminUser,
          wpPassword: siteAdminPass,
          dbName,
          dbUser,
          dbPassword: dbPass,
        },
      };
    } catch (err) {
      return reply.code(500).send({
        error: 'Failed to provision site',
        details: err.message,
      });
    }
  });

  // ─── Delete Site ────────────────────────────────────────
  app.delete('/:domain', async (request, reply) => {
    const { domain } = request.params;
    const { removeFiles = false, removeDatabase = false } = request.query;

    const sites = loadSites();
    const idx = sites.findIndex((s) => s.domain === domain);
    if (idx === -1) return reply.code(404).send({ error: 'Site not found' });

    const site = sites[idx];

    try {
      // Remove OLS vhost config directory
      await shell(`rm -rf ${join(config.vhostsDir, domain)}`);
      // Unmap from all OLS listeners and remove virtual host definition from httpd_config.conf
      removeVirtualHostFromOls(domain);

      // Optionally remove files
      if (removeFiles) {
        await shell(`rm -rf ${join(config.webRoot, domain)}`);
      }

      // Optionally remove database
      if (removeDatabase && site.dbName) {
        await shell(
          `mysql -u root -e "DROP DATABASE IF EXISTS \\\`${site.dbName}\\\`; DROP USER IF EXISTS '${site.dbUser}'@'localhost';"`
        );
      }

      // Restart OLS
      await run(config.bin.lswsctrl, ['restart']);

      // Remove from sites list
      sites.splice(idx, 1);
      saveSites(sites);

      return { success: true, message: `Site ${domain} removed` };
    } catch (err) {
      return reply.code(500).send({ error: 'Failed to delete site', details: err.message });
    }
  });

  // ─── Repair Permissions ─────────────────────────────────
  app.post('/:domain/repair-permissions', async (request, reply) => {
    const sites = loadSites();
    const site = sites.find((s) => s.domain === request.params.domain);
    if (!site) return reply.code(404).send({ error: 'Site not found' });

    await shell(`chown -R nobody:nogroup ${site.docRoot}`);
    await shell(`find ${site.docRoot} -type d -exec chmod 755 {} \\;`);
    await shell(`find ${site.docRoot} -type f -exec chmod 644 {} \\;`);
    await shell(`chmod 600 ${join(site.docRoot, 'wp-config.php')}`);

    return { success: true, message: 'Permissions repaired' };
  });

  // ─── Toggle Site Status ────────────────────────────────
  app.put('/:domain/status', async (request, reply) => {
    const { status } = request.body || {};
    if (!['active', 'suspended'].includes(status)) {
      return reply.code(400).send({ error: 'Invalid status' });
    }

    const sites = loadSites();
    const idx = sites.findIndex((s) => s.domain === request.params.domain);
    if (idx === -1) return reply.code(404).send({ error: 'Site not found' });

    sites[idx].status = status;
    saveSites(sites);

    return { success: true, site: sites[idx] };
  });

  // ─── Site Full Details (For Management Dashboard) ────────
  app.get('/:domain/details', async (request, reply) => {
    const sites = loadSites();
    const site = sites.find((s) => s.domain === request.params.domain);
    if (!site) return reply.code(404).send({ error: 'Site not found' });

    let serverIp = '127.0.0.1';
    try {
      const res = await shell("hostname -I 2>/dev/null | awk '{print $1}'");
      serverIp = res.stdout.trim() || '127.0.0.1';
    } catch {}

    const cleanUser = site.siteUser || site.domain.replace(/[^a-z0-9]/gi, '').substring(0, 16);
    const docRoot = site.docRoot || join(config.webRoot, site.domain, 'public_html');
    const vhconfPath = join(config.vhostsDir, site.domain, 'vhconf.conf');

    return {
      domain: site.domain,
      siteUser: cleanUser,
      serverIp,
      rootDirectory: site.domain,
      docRoot,
      phpVersion: site.phpVersion || '83',
      ssl: !!site.ssl,
      wildcard: !!site.wildcard,
      dbName: site.dbName || `wp_${site.domain.replace(/[^a-z0-9]/gi, '_')}`,
      dbUser: site.dbUser || `u_${site.domain.replace(/[^a-z0-9]/gi, '').substring(0, 10)}`,
      dbHost: 'localhost:3306',
      status: site.status || 'active',
      createdAt: site.createdAt || new Date().toISOString(),
      vhconfPath,
      vhconfExists: existsSync(vhconfPath),
    };
  });

  // ─── Get Virtual Host Config (vhconf.conf) ──────────────
  app.get('/:domain/vhost', async (request, reply) => {
    const { domain } = request.params;
    const vh = getVirtualHostConfig(domain);
    return {
      domain,
      vhconfPath: vh.vhconfPath,
      content: vh.vhconfContent || '',
      exists: existsSync(vh.vhconfPath),
    };
  });

  // ─── Update Virtual Host Config & Reload OLS ────────────
  app.put('/:domain/vhost', async (request, reply) => {
    const { domain } = request.params;
    const { content } = request.body || {};
    if (typeof content !== 'string') {
      return reply.code(400).send({ error: 'Configuration content is required' });
    }

    const vhconfDir = join(config.vhostsDir, domain);
    if (!existsSync(vhconfDir)) mkdirSync(vhconfDir, { recursive: true });
    const vhconfPath = join(vhconfDir, 'vhconf.conf');

    try {
      writeFileSync(vhconfPath, content, 'utf-8');
      const lswsctrl = config.bin?.lswsctrl || join(config.olsRoot, 'bin', 'lswsctrl');
      if (existsSync(lswsctrl)) {
        await shell(`"${lswsctrl}" reload`);
      } else {
        await shell('systemctl reload lsws 2>/dev/null || systemctl restart lsws 2>/dev/null || true');
      }

      return {
        success: true,
        message: 'OpenLiteSpeed Virtual Host configuration saved and reloaded (zero downtime)!',
        vhconfPath,
      };
    } catch (err) {
      return reply.code(500).send({ error: 'Failed to write vhconf.conf', details: err.message });
    }
  });

  // ─── Update Site Domain Settings (PHP version, docRoot) ─
  app.put('/:domain/settings', async (request, reply) => {
    const { domain } = request.params;
    const { phpVersion, rootDirectory } = request.body || {};

    const sites = loadSites();
    const idx = sites.findIndex((s) => s.domain === domain);
    if (idx === -1) return reply.code(404).send({ error: 'Site not found' });

    if (phpVersion) sites[idx].phpVersion = phpVersion;
    if (rootDirectory) {
      sites[idx].docRoot = join(config.webRoot, rootDirectory, 'public_html');
    }
    saveSites(sites);

    if (phpVersion) {
      const vhconfPath = join(config.vhostsDir, domain, 'vhconf.conf');
      if (existsSync(vhconfPath)) {
        try {
          let conf = readFileSync(vhconfPath, 'utf-8');
          conf = conf.replace(/path\s+\$SERVER_ROOT\/lsphp\d+\/bin\/lsphp/g, `path                    $SERVER_ROOT/lsphp${phpVersion}/bin/lsphp`);
          conf = conf.replace(/type\s+lsapi:lsphp\d+/g, `type                    lsapi:lsphp${phpVersion}`);
          writeFileSync(vhconfPath, conf, 'utf-8');
          await shell('systemctl reload lsws 2>/dev/null || true');
        } catch {}
      }
    }

    return {
      success: true,
      message: 'Domain and OpenLiteSpeed settings updated successfully!',
      site: sites[idx],
    };
  });

  // ─── Update Site User Password ──────────────────────────
  app.post('/:domain/user-password', async (request, reply) => {
    const { domain } = request.params;
    const { password } = request.body || {};
    if (!password || password.length < 6) {
      return reply.code(400).send({ error: 'Password must be at least 6 characters' });
    }

    const sites = loadSites();
    const idx = sites.findIndex((s) => s.domain === domain);
    if (idx === -1) return reply.code(404).send({ error: 'Site not found' });

    sites[idx].sitePassword = password;
    saveSites(sites);

    const siteUser = sites[idx].siteUser || domain.replace(/[^a-z0-9]/gi, '').substring(0, 16);
    try {
      await shell(`echo "${siteUser}:${password}" | chpasswd 2>/dev/null || true`);
    } catch {}

    return {
      success: true,
      message: `Password for site user '${siteUser}' updated successfully!`,
    };
  });

  // ─── Site Error & Access Logs ───────────────────────────
  app.get('/:domain/logs', async (request, reply) => {
    const { domain } = request.params;
    const { type = 'error' } = request.query;

    const logPath = type === 'access'
      ? join(config.webRoot, domain, 'logs', 'access.log')
      : join(config.webRoot, domain, 'logs', 'error.log');

    let lines = '';
    if (existsSync(logPath)) {
      try {
        const res = await shell(`tail -n 150 "${logPath}" 2>/dev/null`);
        lines = res.stdout || '';
      } catch {
        lines = 'Unable to read log file.';
      }
    } else {
      lines = `Log file not found at: ${logPath}\nNo requests logged yet or site was recently provisioned.`;
    }

    return { domain, type, path: logPath, lines };
  });

  // ─── Clear Site Logs ────────────────────────────────────
  app.post('/:domain/logs/clear', async (request, reply) => {
    const { domain } = request.params;
    const { type = 'both' } = request.body || {};

    const errorLog = join(config.webRoot, domain, 'logs', 'error.log');
    const accessLog = join(config.webRoot, domain, 'logs', 'access.log');

    try {
      if (type === 'error' || type === 'both') {
        if (existsSync(errorLog)) writeFileSync(errorLog, '');
      }
      if (type === 'access' || type === 'both') {
        if (existsSync(accessLog)) writeFileSync(accessLog, '');
      }
      return { success: true, message: 'Logs cleared successfully' };
    } catch (err) {
      return reply.code(500).send({ error: 'Failed to clear logs', details: err.message });
    }
  });

  // ─── Purge Site LSCache ──────────────────────────────────
  app.post('/:domain/cache/purge', async (request, reply) => {
    const { domain } = request.params;
    try {
      await shell(`rm -rf /tmp/lscache/${domain}/* /usr/local/lsws/cachedata/${domain}/* 2>/dev/null || true`);
      return {
        success: true,
        message: `LiteSpeed Cache (LSCache) for '${domain}' successfully purged!`,
      };
    } catch (err) {
      return reply.code(500).send({ error: 'Failed to purge cache', details: err.message });
    }
  });

  // ─── Trigger WordPress WP-Cron ──────────────────────────
  app.post('/:domain/wp-cron', async (request, reply) => {
    const { domain } = request.params;
    try {
      const res = await shell(`curl -s -k -L -m 10 "https://127.0.0.1/wp-cron.php?doing_wp_cron" -H "Host: ${domain}" 2>&1 || curl -s -k -L -m 10 "http://127.0.0.1/wp-cron.php?doing_wp_cron" -H "Host: ${domain}" 2>&1`);
      return {
        success: true,
        message: `WordPress WP-Cron background task executed for '${domain}'!`,
        output: res.stdout || 'WP-Cron executed.',
      };
    } catch (err) {
      return reply.code(500).send({ error: 'WP-Cron execution failed', details: err.message });
    }
  });

  // ─── Repair & Optimize Database ─────────────────────────
  app.post('/:domain/db/repair', async (request, reply) => {
    const { domain } = request.params;
    const sites = loadSites();
    const site = sites.find((s) => s.domain === domain);
    if (!site?.dbName) return reply.code(400).send({ error: 'No database associated with this site' });

    try {
      const res = await shell(`mysqlcheck -u root --auto-repair --optimize --databases "${site.dbName}" 2>&1`);
      return {
        success: true,
        message: `Database '${site.dbName}' repaired and optimized successfully!`,
        output: res.stdout,
      };
    } catch (err) {
      return reply.code(500).send({ error: 'Database repair failed', details: err.message });
    }
  });
}

