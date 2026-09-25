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

      // 4. Download and configure WordPress via WP-CLI
      await run(config.bin.wp, [
        'core', 'download',
        '--path=' + docRoot,
        '--locale=en_US',
      ], { cwd: docRoot });

      await run(config.bin.wp, [
        'config', 'create',
        '--path=' + docRoot,
        `--dbname=${dbName}`,
        `--dbuser=${dbUser}`,
        `--dbpass=${dbPass}`,
        '--dbhost=localhost',
        '--dbprefix=wp_',
      ], { cwd: docRoot });

      const siteAdminPass = adminPassword || generatePassword(16);

      await run(config.bin.wp, [
        'core', 'install',
        '--path=' + docRoot,
        `--url=https://${cleanDomain}`,
        `--title=${siteTitle}`,
        `--admin_user=${adminUser}`,
        `--admin_email=${adminEmail}`,
        `--admin_password=${siteAdminPass}`,
        '--skip-email',
      ], { cwd: docRoot });

      // 5. Install LiteSpeed Cache plugin
      if (enableLSCache) {
        await run(config.bin.wp, [
          'plugin', 'install', 'litespeed-cache',
          '--activate',
          '--path=' + docRoot,
        ], { cwd: docRoot });
      }

      // 6. Set correct file permissions
      await shell(`chown -R nobody:nogroup ${siteRoot}`);
      await shell(`find ${docRoot} -type d -exec chmod 755 {} \\;`);
      await shell(`find ${docRoot} -type f -exec chmod 644 {} \\;`);

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
}

