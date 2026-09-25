// ─────────────────────────────────────────────────────────────
// DEOLS Sites API — WordPress Site Provisioning & Management
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { shell, run, sanitizeDomain, isValidDomain } from '../utils/shell.js';

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

      // 7. Generate OLS Virtual Host config
      const vhostConfDir = join(config.vhostsDir, cleanDomain);
      mkdirSync(vhostConfDir, { recursive: true });

      const vhconfContent = generateVhostConfig(cleanDomain, docRoot, logsDir, phpVersion, enableWildcard);
      writeFileSync(join(vhostConfDir, 'vhconf.conf'), vhconfContent);

      // 8. Add vhost to OLS httpd_config
      await addVhostToHttpdConfig(cleanDomain, enableWildcard);

      // 9. Graceful restart OLS
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
      // Remove OLS vhost config
      await shell(`rm -rf ${join(config.vhostsDir, domain)}`);
      await removeVhostFromHttpdConfig(domain);

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

// ─── VHost Config Generator ────────────────────────────────

function generateVhostConfig(domain, docRoot, logsDir, phpVersion, enableWildcard) {
  const phpSuffix = phpVersion || '83';
  const wildcardDirective = enableWildcard
    ? `
member *.${domain} {
  vhDomain *.${domain}
}`
    : '';

  return `
docRoot                   ${docRoot}
vhDomain                  ${domain}
vhAliases                 www.${domain}${enableWildcard ? ', *.' + domain : ''}
adminEmails               admin@${domain}
enableGzip                1
enableBr                  1

index {
  useServer               0
  indexFiles               index.php, index.html
}

errorlog ${logsDir}/error.log {
  useServer               0
  logLevel                WARN
  rollingSize             10M
}

accesslog ${logsDir}/access.log {
  useServer               0
  logFormat               "%h %l %u %t \\"%r\\" %>s %b"
  rollingSize             10M
  keepDays                30
}

scripthandler {
  add                     lsapi:lsphp${phpSuffix} php
}

extprocessor lsphp${phpSuffix} {
  type                    lsapi
  address                 uds://tmp/lshttpd/lsphp${phpSuffix}.sock
  maxConns                10
  env                     PHP_LSAPI_CHILDREN=10
  initTimeout             60
  retryTimeout            0
  pcKeepAliveTimeout      60
  respBuffer              0
  autoStart               2
  path                    /usr/local/lsws/lsphp${phpSuffix}/bin/lsphp
  backlog                 100
  instances               1
  priority                0
  memSoftLimit            2047M
  memHardLimit            2047M
  procSoftLimit           1400
  procHardLimit           1500
}

rewrite {
  enable                  1
  autoLoadHtaccess        1
  rules <<<END_rules
RewriteEngine On
RewriteRule .* - [E=Cache-Control:no-autoflush]
RewriteRule ^/wp-content/cache/ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
END_rules
}

context / {
  location                ${docRoot}
  allowBrowse             1
  extraHeaders            <<<END_extraHeaders
    X-Frame-Options SAMEORIGIN
    X-Content-Type-Options nosniff
    X-XSS-Protection 1;mode=block
    Referrer-Policy strict-origin-when-cross-origin
END_extraHeaders
}

${wildcardDirective}
`;
}

// ─── OLS httpd_config.conf helpers ─────────────────────────

async function addVhostToHttpdConfig(domain, enableWildcard) {
  const httpdConf = join(config.olsRoot, 'conf', 'httpd_config.conf');
  let content = readFileSync(httpdConf, 'utf-8');

  const vhostEntry = `
virtualhost ${domain} {
  vhRoot                  /var/www/${domain}
  configFile              ${config.vhostsDir}/${domain}/vhconf.conf
  allowSymbolLink         1
  enableScript            1
  restrained              1
}
`;

  const listenerMapping = `  map                     ${domain} ${domain}${enableWildcard ? ', *.' + domain : ', www.' + domain}`;

  // Append vhost definition
  content += vhostEntry;

  // Add to listener mapping (find the Default SSL listener block)
  content = content.replace(
    /(listener\s+Default\s*\{[^}]*)(})/s,
    `$1${listenerMapping}\n$2`
  );

  writeFileSync(httpdConf, content);
}

async function removeVhostFromHttpdConfig(domain) {
  const httpdConf = join(config.olsRoot, 'conf', 'httpd_config.conf');
  let content = readFileSync(httpdConf, 'utf-8');

  // Remove vhost block
  const vhostRegex = new RegExp(
    `\\n?virtualhost\\s+${domain.replace(/\./g, '\\.')}\\s*\\{[^}]*\\}`,
    'g'
  );
  content = content.replace(vhostRegex, '');

  // Remove listener mapping
  const mapRegex = new RegExp(
    `\\n?\\s*map\\s+${domain.replace(/\./g, '\\.')}\\s+[^\\n]*`,
    'g'
  );
  content = content.replace(mapRegex, '');

  writeFileSync(httpdConf, content);
}
