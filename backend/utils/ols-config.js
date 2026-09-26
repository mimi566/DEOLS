// ─────────────────────────────────────────────────────────────
// DEOLS OpenLiteSpeed Configuration Engine (CyberPanel Model)
// Manages httpd_config.conf, Virtual Hosts, and Listeners
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { config } from '../config.js';

/**
 * Ensure Default (Port 80) and DefaultHTTPS / HTTPS (Port 443) listeners exist in httpd_config.conf
 * Exactly like CyberPanel's dual-listener SNI architecture.
 */
export function ensureOlsListeners(httpdConfPath = null) {
  const confPath = httpdConfPath || join(config.olsRoot, 'conf', 'httpd_config.conf');
  if (!existsSync(confPath)) return;

  let content = readFileSync(confPath, 'utf-8');
  let modified = false;

  // 1. Strip any legacy/invalid 'binding' directives from listeners
  if (/binding\s+[*0-9.:]*/i.test(content)) {
    content = content.replace(/\n\s*binding\s+[*0-9.:]*/gi, '');
    modified = true;
  }

  // 2. Identify all defined virtual hosts in httpd_config.conf
  const definedVhosts = [];
  const vhRegex = /virtualhost\s+([^\s{]+)/gi;
  let vhMatch;
  while ((vhMatch = vhRegex.exec(content)) !== null) {
    if (vhMatch[1] && !definedVhosts.includes(vhMatch[1])) {
      definedVhosts.push(vhMatch[1]);
    }
  }

  // 3. Ensure valid SSL certificate & key files in /usr/local/lsws/conf/
  const confDir = join(config.olsRoot, 'conf');
  if (!existsSync(confDir)) {
    try { mkdirSync(confDir, { recursive: true }); } catch {}
  }

  let certPath = join(confDir, 'example.crt');
  let keyPath = join(confDir, 'example.key');

  const srvCert = join(confDir, 'server.crt');
  const srvKey = join(confDir, 'server.key');
  if (existsSync(srvCert) && existsSync(srvKey)) {
    certPath = srvCert;
    keyPath = srvKey;
  } else if (!existsSync(certPath) || !existsSync(keyPath)) {
    // Generate self-signed certificate if neither example nor server cert exists
    if (process.platform === 'linux') {
      try {
        execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 3650 -nodes -subj "/CN=localhost" 2>/dev/null && chmod 644 "${keyPath}" "${certPath}" 2>/dev/null || true`);
      } catch {}
    }
    // Fallback stub files if still missing (dev/windows)
    if (!existsSync(keyPath)) {
      try { writeFileSync(keyPath, '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n', { mode: 0o644 }); } catch {}
    }
    if (!existsSync(certPath)) {
      try { writeFileSync(certPath, '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n', { mode: 0o644 }); } catch {}
    }
  }

  // Ensure key & certificate have world-readable permissions (0644) for OLS worker processes
  if (process.platform === 'linux') {
    try {
      if (existsSync(keyPath)) chmodSync(keyPath, 0o644);
      if (existsSync(certPath)) chmodSync(certPath, 0o644);
    } catch {}
  }

  // 4. Automatically fix any legacy references to webadmin.key or webadmin.crt (which have 0700 permissions)
  if (content.includes('webadmin.key') || content.includes('webadmin.crt')) {
    content = content.replace(/\/usr\/local\/lsws\/admin\/conf\/webadmin\.key/g, keyPath);
    content = content.replace(/\/usr\/local\/lsws\/admin\/conf\/webadmin\.crt/g, certPath);
    modified = true;
  }

  // 5. Clean up conflicting or legacy DefaultHTTPS listener name
  if (/listener\s+DefaultHTTPS\s*\{/i.test(content)) {
    if (/listener\s+HTTPS\s*\{/i.test(content)) {
      content = content.replace(/\n?listener\s+DefaultHTTPS\s*\{[^}]*\}/s, '');
      modified = true;
    } else {
      content = content.replace(/listener\s+DefaultHTTPS\s*\{/i, 'listener HTTPS {');
      modified = true;
    }
  }

  // 6. Clean up any invalid mapping lines in listeners that point to non-existent virtual hosts
  content = content.replace(/(listener\s+[^\s{]+\s*\{[\s\S]*?\})/gi, (listenerBlock) => {
    let updatedListener = listenerBlock;
    const mapLines = [...updatedListener.matchAll(/map\s+([^\s]+)\s+([^\r\n]+)/gi)];
    for (const mMap of mapLines) {
      const vhName = mMap[1];
      if (!definedVhosts.includes(vhName)) {
        const cleanRegex = new RegExp(`\\n?\\s*map\\s+${vhName.replace(/\./g, '\\.')}\\s+[^\\r\\n]*`, 'gi');
        updatedListener = updatedListener.replace(cleanRegex, '');
        modified = true;
      }
    }
    return updatedListener;
  });

  const defaultMapLine = definedVhosts.includes('Example') ? '  map                     Example *' : (definedVhosts.length > 0 ? `  map                     ${definedVhosts[0]} *` : '');

  // 7. Ensure listener Default (Port 80) is listening on *:80
  if (/listener\s+Default\s*\{/i.test(content)) {
    if (/listener\s+Default\s*\{[^}]*8088/s.test(content)) {
      content = content.replace(/(listener\s+Default\s*\{[^}]*address\s+)[*0-9.:]*:8088/is, '$1*:80');
      modified = true;
    }
    if (!/listener\s+Default\s*\{[^}]*map\s+/is.test(content) && defaultMapLine) {
      content = content.replace(/(listener\s+Default\s*\{)/i, `$1\n${defaultMapLine}`);
      modified = true;
    }
  } else {
    const hasAnyPort80 = /listener\s+[^\r\n]+\s*\{[^}]*address\s+[*0-9.:]*:80\b/s.test(content);
    if (!hasAnyPort80) {
      const defaultPort80Block = `
listener Default {
  address                 *:80
  secure                  0
${defaultMapLine ? defaultMapLine + '\n' : ''}}
`;
      content += defaultPort80Block;
      modified = true;
    }
  }

  // 8. Ensure canonical listener HTTPS (Port 443) exists with standard General & SSL directives
  if (!/listener\s+HTTPS\s*\{/i.test(content) && !/listener\s+[^\r\n]+\s*\{[^}]*address\s+[*0-9.:]*:443\b/s.test(content)) {
    const defaultPort443Block = `
listener HTTPS {
  address                 *:443
  secure                  1
  keyFile                 ${keyPath}
  certFile                ${certPath}
${defaultMapLine ? defaultMapLine + '\n' : ''}}
`;
    content += defaultPort443Block;
    modified = true;
  } else if (/listener\s+HTTPS\s*\{/i.test(content)) {
    content = content.replace(/listener\s+HTTPS\s*\{([^}]*)\}/i, (block, body) => {
      let updatedBody = body;
      // Ensure address is *:443
      if (!/address\s+[*0-9.:]*:443\b/i.test(updatedBody)) {
        if (/address\s+/i.test(updatedBody)) {
          updatedBody = updatedBody.replace(/address\s+[^\r\n]+/i, 'address                 *:443');
        } else {
          updatedBody = '\n  address                 *:443' + updatedBody;
        }
        modified = true;
      }
      // Ensure secure 1
      if (!/secure\s+1/i.test(updatedBody)) {
        if (/secure\s+\d+/i.test(updatedBody)) {
          updatedBody = updatedBody.replace(/secure\s+\d+/i, 'secure                  1');
        } else {
          updatedBody += '\n  secure                  1';
        }
        modified = true;
      }
      // Ensure keyFile is correct and not webadmin
      if (!/keyFile\s+/i.test(updatedBody) || /keyFile\s+[^\r\n]*webadmin/i.test(updatedBody)) {
        if (/keyFile\s+/i.test(updatedBody)) {
          updatedBody = updatedBody.replace(/keyFile\s+[^\r\n]+/i, `keyFile                 ${keyPath}`);
        } else {
          updatedBody += `\n  keyFile                 ${keyPath}`;
        }
        modified = true;
      }
      // Ensure certFile is correct and not webadmin
      if (!/certFile\s+/i.test(updatedBody) || /certFile\s+[^\r\n]*webadmin/i.test(updatedBody)) {
        if (/certFile\s+/i.test(updatedBody)) {
          updatedBody = updatedBody.replace(/certFile\s+[^\r\n]+/i, `certFile                ${certPath}`);
        } else {
          updatedBody += `\n  certFile                ${certPath}`;
        }
        modified = true;
      }
      if (!/map\s+/i.test(updatedBody) && defaultMapLine) {
        updatedBody += `\n${defaultMapLine}`;
        modified = true;
      }
      return `listener HTTPS {${updatedBody}\n}`;
    });
  }

  if (modified) {
    writeFileSync(confPath, content, 'utf-8');
  }
}

/**
 * Add or update Virtual Host definition and listener mappings in httpd_config.conf
 * Creates both HTTP (:80) and HTTPS (:443) mappings like CyberPanel.
 */
export function addVirtualHostToOls(domain, enableWildcard = false) {
  const httpdConf = join(config.olsRoot, 'conf', 'httpd_config.conf');
  if (!existsSync(httpdConf)) return;

  ensureOlsListeners(httpdConf);

  let content = readFileSync(httpdConf, 'utf-8');
  const vhconfPath = join(config.vhostsDir, domain, 'vhconf.conf');

  // 1. Virtual Host block in httpd_config.conf
  const vhostRegex = new RegExp(`virtualhost\\s+${domain.replace(/\./g, '\\.')}\\s*\\{[^}]*\\}`, 'g');
  const vhostEntry = `virtualhost ${domain} {
  vhRoot                  /var/www/${domain}
  configFile              ${vhconfPath}
  allowSymbolLink         1
  enableScript            1
  restrained              1
  setUIDMode              0
}
`;

  if (vhostRegex.test(content)) {
    content = content.replace(vhostRegex, vhostEntry.trim());
  } else {
    content += `\n${vhostEntry}`;
  }

  // 2. Format listener mapping domains: "domain.com, www.domain.com" or "domain.com, www.domain.com, *.domain.com"
  const mappedDomains = `${domain}, www.${domain}${enableWildcard ? ', *.' + domain : ''}`;
  const mapLine = `  map                     ${domain} ${mappedDomains}`;

  // Helper to update listener block mappings
  const updateListener = (listenerName, defaultPort) => {
    const listenerRegex = new RegExp(`(listener\\s+${listenerName}\\s*\\{[^}]*?)(\\n?\\s*map\\s+${domain.replace(/\./g, '\\.')}\\s+[^\\n]*)?([^}]*\\})`, 's');

    if (listenerRegex.test(content)) {
      content = content.replace(listenerRegex, (match, before, oldMap, after) => {
        // Strip out any existing mapping line for this domain in 'before' and 'after'
        const cleanBefore = before.replace(new RegExp(`\\n?\\s*map\\s+${domain.replace(/\./g, '\\.')}\\s+[^\\n]*`, 'g'), '');
        const cleanAfter = after.replace(new RegExp(`\\n?\\s*map\\s+${domain.replace(/\./g, '\\.')}\\s+[^\\n]*`, 'g'), '');
        return `${cleanBefore}\n${mapLine}${cleanAfter}`;
      });
    } else {
      // Fallback: match any listener containing the port
      const portRegex = new RegExp(`(listener\\s+[^{]+\\{[^}]*address\\s+[*0-9.:]*:${defaultPort}\\b[^}]*?)(\\n?\\s*map\\s+${domain.replace(/\./g, '\\.')}\\s+[^\\n]*)?([^}]*\\})`, 's');
      if (portRegex.test(content)) {
        content = content.replace(portRegex, (match, before, oldMap, after) => {
          const cleanBefore = before.replace(new RegExp(`\\n?\\s*map\\s+${domain.replace(/\./g, '\\.')}\\s+[^\\n]*`, 'g'), '');
          const cleanAfter = after.replace(new RegExp(`\\n?\\s*map\\s+${domain.replace(/\./g, '\\.')}\\s+[^\\n]*`, 'g'), '');
          return `${cleanBefore}\n${mapLine}${cleanAfter}`;
        });
      }
    }
  };

  // Map to both HTTP (:80) and HTTPS (:443)
  updateListener('Default', 80);
  updateListener('HTTPS', 443);
  updateListener('DefaultHTTPS', 443);

  writeFileSync(httpdConf, content);
}

/**
 * Remove Virtual Host definition and listener mappings from httpd_config.conf
 */
export function removeVirtualHostFromOls(domain) {
  const httpdConf = join(config.olsRoot, 'conf', 'httpd_config.conf');
  if (!existsSync(httpdConf)) return;

  let content = readFileSync(httpdConf, 'utf-8');
  const escDomain = domain.replace(/\./g, '\\.');

  // Remove vhost block
  const vhostRegex = new RegExp(`\\n?virtualhost\\s+${escDomain}\\s*\\{[^}]*\\}`, 'g');
  content = content.replace(vhostRegex, '');

  // Remove map line from all listeners
  const mapRegex = new RegExp(`\\n?\\s*map\\s+${escDomain}\\s+[^\\n]*`, 'g');
  content = content.replace(mapRegex, '');

  writeFileSync(httpdConf, content);
}

/**
 * Update Virtual Host SSL configuration and wildcard listener mappings
 */
export function updateVirtualHostSSL(domain, isWildcard = false) {
  const vhconfPath = join(config.vhostsDir, domain, 'vhconf.conf');
  if (existsSync(vhconfPath)) {
    let content = readFileSync(vhconfPath, 'utf-8');

    const sslBlock = `
vhssl {
  keyFile                 /etc/letsencrypt/live/${domain}/privkey.pem
  certFile                /etc/letsencrypt/live/${domain}/fullchain.pem
  certChain               1
  sslProtocol             24
  enableECDHE             1
  renegProtection         1
  sslSessionCache         1
  sslSessionTickets       1
  enableSpdy              15
  enableQuic              1
  enableStapling          1
  ocspRespMaxAge          86400
}
`;
    // Replace or append vhssl block
    content = content.replace(/\nvhssl\s*\{[^}]*\}/s, '');
    content += sslBlock;
    writeFileSync(vhconfPath, content);
  }

  // If wildcard or standard SSL, ensure listeners in httpd_config.conf map it properly
  addVirtualHostToOls(domain, isWildcard);
}

/**
 * Generate CyberPanel-compatible vhconf.conf for OpenLiteSpeed WebAdmin
 */
export function generateCyberpanelVhConf(domain, docRoot, logsDir, phpVersion = '83', enableWildcard = false) {
  const phpSuffix = phpVersion || '83';
  const wildcardAliases = enableWildcard ? `, *.${domain}` : '';

  return `# ─────────────────────────────────────────────────────────────
# OpenLiteSpeed Virtual Host Configuration for ${domain}
# Managed by DEOLS (CyberPanel-compatible architecture)
# ─────────────────────────────────────────────────────────────

docRoot                   ${docRoot}
vhDomain                  ${domain}
vhAliases                 www.${domain}${wildcardAliases}
adminEmails               admin@${domain}
enableGzip                1
enableBr                  1
cgroups                   0

index {
  useServer               0
  indexFiles              index.php, index.html
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
  address                 uds://tmp/lshttpd/lsphp${phpSuffix}_${domain.replace(/[^a-z0-9]/g, '_')}.sock
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
`;
}

/**
 * Parse all Virtual Hosts from httpd_config.conf for OLS WebAdmin overview
 */
export function parseOlsVirtualHosts() {
  const httpdConf = join(config.olsRoot, 'conf', 'httpd_config.conf');
  if (!existsSync(httpdConf)) return [];

  const content = readFileSync(httpdConf, 'utf-8');
  const vhosts = [];

  const vhostRegex = /virtualhost\s+([^\s{]+)\s*\{([^}]*)\}/g;
  let match;

  while ((match = vhostRegex.exec(content)) !== null) {
    const name = match[1].trim();
    const body = match[2];

    const vhRootMatch = body.match(/vhRoot\s+([^\r\n]+)/);
    const configFileMatch = body.match(/configFile\s+([^\r\n]+)/);
    const allowSymbolLinkMatch = body.match(/allowSymbolLink\s+([^\r\n]+)/);
    const enableScriptMatch = body.match(/enableScript\s+([^\r\n]+)/);
    const restrainedMatch = body.match(/restrained\s+([^\r\n]+)/);
    const setUIDModeMatch = body.match(/setUIDMode\s+([^\r\n]+)/);

    const vhRoot = vhRootMatch ? vhRootMatch[1].trim() : '';
    const configFile = configFileMatch ? configFileMatch[1].trim() : '';
    const configExists = configFile ? existsSync(configFile) : false;

    let hasSSL = false;
    let phpSocket = '';
    if (configExists) {
      try {
        const vhContent = readFileSync(configFile, 'utf-8');
        hasSSL = /vhssl\s*\{/.test(vhContent);
        const sockMatch = vhContent.match(/address\s+uds:\/\/tmp\/lshttpd\/([^\s\r\n]+)/);
        if (sockMatch) phpSocket = sockMatch[1];
      } catch {}
    }

    // Find which listeners map this vhost and what domain aliases
    const listeners = [];
    const mappedDomains = new Set();
    const listenerBlocksRegex = /listener\s+([^\s{]+)\s*\{([^}]*)\}/g;
    let lMatch;
    while ((lMatch = listenerBlocksRegex.exec(content)) !== null) {
      const lName = lMatch[1].trim();
      const lBody = lMatch[2];
      const escName = name.replace(/\./g, '\\.');
      const mapRegex = new RegExp(`map\\s+${escName}\\s+([^\\r\\n]+)`, 'g');
      let mMatch;
      while ((mMatch = mapRegex.exec(lBody)) !== null) {
        listeners.push(lName);
        mMatch[1].split(',').forEach((d) => mappedDomains.add(d.trim()));
      }
    }

    vhosts.push({
      name,
      vhRoot,
      configFile,
      configExists,
      hasSSL,
      phpSocket,
      allowSymbolLink: allowSymbolLinkMatch ? allowSymbolLinkMatch[1].trim() : '1',
      enableScript: enableScriptMatch ? enableScriptMatch[1].trim() : '1',
      restrained: restrainedMatch ? restrainedMatch[1].trim() : '1',
      setUIDMode: setUIDModeMatch ? setUIDModeMatch[1].trim() : '0',
      listeners: [...new Set(listeners)],
      mappedDomains: [...mappedDomains],
    });
  }

  return vhosts;
}

/**
 * Parse all Listeners and their Virtual Host mappings from httpd_config.conf
 */
export function parseOlsListeners() {
  const httpdConf = join(config.olsRoot, 'conf', 'httpd_config.conf');
  if (!existsSync(httpdConf)) return [];

  const content = readFileSync(httpdConf, 'utf-8');
  const listeners = [];

  const listenerRegex = /listener\s+([^\s{]+)\s*\{([^}]*)\}/g;
  let match;

  while ((match = listenerRegex.exec(content)) !== null) {
    const name = match[1].trim();
    const body = match[2];

    const addressMatch = body.match(/address\s+([^\r\n]+)/);
    const bindingMatch = body.match(/binding\s+([^\r\n]+)/);
    const secureMatch = body.match(/secure\s+([^\r\n]+)/);
    const certFileMatch = body.match(/certFile\s+([^\r\n]+)/);
    const keyFileMatch = body.match(/keyFile\s+([^\r\n]+)/);

    const mappings = [];
    const mapRegex = /map\s+([^\s]+)\s+([^\r\n]+)/g;
    let mMap;
    while ((mMap = mapRegex.exec(body)) !== null) {
      mappings.push({
        vhost: mMap[1].trim(),
        domains: mMap[2].trim(),
      });
    }

    listeners.push({
      name,
      address: addressMatch ? addressMatch[1].trim() : '',
      binding: bindingMatch ? bindingMatch[1].trim() : '',
      secure: secureMatch ? secureMatch[1].trim() === '1' : false,
      certFile: certFileMatch ? certFileMatch[1].trim() : '',
      keyFile: keyFileMatch ? keyFileMatch[1].trim() : '',
      mappings,
    });
  }

  return listeners;
}

/**
 * Get raw virtual host configuration file and httpd_config snippet
 */
export function getVirtualHostConfig(domain) {
  const vhconfPath = join(config.vhostsDir, domain, 'vhconf.conf');
  let vhconfContent = null;
  if (existsSync(vhconfPath)) {
    vhconfContent = readFileSync(vhconfPath, 'utf-8');
  }

  const httpdConf = join(config.olsRoot, 'conf', 'httpd_config.conf');
  let httpdSnippet = null;
  if (existsSync(httpdConf)) {
    const fullConf = readFileSync(httpdConf, 'utf-8');
    const vhostRegex = new RegExp(`virtualhost\\s+${domain.replace(/\\./g, '\\.')}\\s*\\{[^}]*\\}`, 'g');
    const match = fullConf.match(vhostRegex);
    if (match) httpdSnippet = match[0];
  }

  return { domain, vhconfPath, vhconfContent, httpdSnippet };
}

/**
 * Resync all sites in DEOLS database with OLS httpd_config.conf and vhosts
 * Ensures every site has CyberPanel-style dual-listener mapping and vhconf.
 */
export function syncAllVirtualHosts() {
  const sitesFile = join(config.dataDir, 'sites.json');
  let sites = [];
  if (existsSync(sitesFile)) {
    try {
      sites = JSON.parse(readFileSync(sitesFile, 'utf-8'));
    } catch {}
  }

  const httpdConf = join(config.olsRoot, 'conf', 'httpd_config.conf');
  ensureOlsListeners(httpdConf);

  const synced = [];
  for (const site of sites) {
    const vhostConfDir = join(config.vhostsDir, site.domain);
    if (!existsSync(vhostConfDir)) {
      mkdirSync(vhostConfDir, { recursive: true });
    }

    const vhconfPath = join(vhostConfDir, 'vhconf.conf');
    if (!existsSync(vhconfPath)) {
      const docRoot = site.docRoot || join(config.webRoot, site.domain, 'public_html');
      const logsDir = join(config.webRoot, site.domain, 'logs');
      if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
      const conf = generateCyberpanelVhConf(site.domain, docRoot, logsDir, site.phpVersion || '83', site.wildcard);
      writeFileSync(vhconfPath, conf);
    }

    if (site.ssl) {
      updateVirtualHostSSL(site.domain, site.wildcard);
    } else {
      addVirtualHostToOls(site.domain, site.wildcard);
    }
    synced.push(site.domain);
  }

  return { success: true, syncedCount: synced.length, sites: synced };
}

