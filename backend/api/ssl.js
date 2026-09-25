// ─────────────────────────────────────────────────────────────
// DEOLS SSL API — Certbot Wrapper & Cloudflare Wildcard SSL
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';
import { promises as dnsPromises } from 'dns';
import { config } from '../config.js';
import { shell, run } from '../utils/shell.js';
import { updateVirtualHostSSL } from '../utils/ols-config.js';

const SITES_FILE = join(config.dataDir, 'sites.json');

async function checkDomainDNS(domain) {
  let resolvedIps = [];
  try {
    resolvedIps = await dnsPromises.resolve4(domain);
  } catch {
    resolvedIps = [];
  }

  let serverIp = null;
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    serverIp = data.ip;
  } catch {}

  if (!serverIp) {
    try {
      const res = await shell("hostname -I 2>/dev/null | awk '{print $1}'");
      serverIp = res.stdout.trim() || null;
    } catch {}
  }

  const matches = serverIp ? resolvedIps.includes(serverIp) : false;
  return {
    domain,
    serverIp,
    resolvedIps,
    matches,
    dnsCheckerUrl: `https://dnschecker.org/#A/${domain}`,
  };
}

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

export default async function sslRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  // ─── Test Cloudflare API Credentials ───────────────────
  app.post('/cloudflare/test', async (request, reply) => {
    const { domain, email, apiKey, apiToken } = request.body || {};
    if (!domain) {
      return reply.code(400).send({ error: 'Domain is required' });
    }

    const cleanDomain = domain.replace(/^\*\./, '').toLowerCase().trim();
    const parts = cleanDomain.split('.');
    const rootZone = parts.length > 2 ? parts.slice(-2).join('.') : cleanDomain;

    const headers = { 'Content-Type': 'application/json' };

    if (apiToken && apiToken.trim()) {
      headers['Authorization'] = `Bearer ${apiToken.trim()}`;
    } else if (apiKey && email) {
      headers['X-Auth-Email'] = email.trim();
      headers['X-Auth-Key'] = apiKey.trim();
    } else {
      return reply.code(400).send({
        error: 'Please provide either Cloudflare API Token OR Cloudflare Account Email & Global API Key',
      });
    }

    try {
      // Query zones matching the root domain
      const cfRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(rootZone)}&status=active`,
        { method: 'GET', headers }
      );

      const data = await cfRes.json();

      if (!data.success) {
        const errorMsg = data.errors?.[0]?.message || 'Authentication failed. Please verify your credentials.';
        return reply.code(400).send({
          success: false,
          connected: false,
          error: `Cloudflare error: ${errorMsg}`,
        });
      }

      if (!data.result || data.result.length === 0) {
        return reply.send({
          success: false,
          connected: true,
          error: `Connected to Cloudflare, but zone "${rootZone}" was not found in this account. Please check the domain name.`,
        });
      }

      const zone = data.result[0];
      return reply.send({
        success: true,
        connected: true,
        zoneId: zone.id,
        zoneName: zone.name,
        message: `✓ Connected! Zone "${zone.name}" is verified on Cloudflare and ready for wildcard SSL installation.`,
      });
    } catch (err) {
      return reply.code(500).send({
        success: false,
        connected: false,
        error: `Network error connecting to Cloudflare: ${err.message}`,
      });
    }
  });

  // ─── Pre-flight DNS Verification Endpoint ────────────
  app.get('/check-dns/:domain', async (request) => {
    const { domain } = request.params;
    const cleanDomain = domain.replace(/^\*\./, '').toLowerCase().trim();
    return await checkDomainDNS(cleanDomain);
  });

  // ─── Prepare and Overwrite Stale/Broken SSL Files ──────────────────
  async function prepareCertbotForFreshOverwrite(domain, forceOverwrite = false) {
    // 1. Remove any stale certbot locks left by previous aborted runs
    try {
      await shell('rm -f /var/lock/certbot.lock /var/lib/letsencrypt/lock /etc/letsencrypt/lock /tmp/certbot* 2>/dev/null || true');
    } catch {}

    // 2. Remove duplicate lineages created by previous failed runs (e.g. domain-0001, domain-0002)
    try {
      await shell(`rm -rf /etc/letsencrypt/live/${domain}-00* /etc/letsencrypt/archive/${domain}-00* /etc/letsencrypt/renewal/${domain}-00*.conf 2>/dev/null || true`);
    } catch {}

    // 3. Inspect if existing cert files are missing, zero-bytes, or corrupted from a prior failed attempt
    const liveDir = `/etc/letsencrypt/live/${domain}`;
    const renewalFile = `/etc/letsencrypt/renewal/${domain}.conf`;
    const archiveDir = `/etc/letsencrypt/archive/${domain}`;

    let shouldClean = forceOverwrite;
    if (!shouldClean) {
      if (existsSync(liveDir)) {
        try {
          const fullchain = join(liveDir, 'fullchain.pem');
          const privkey = join(liveDir, 'privkey.pem');
          if (!existsSync(fullchain) || !existsSync(privkey) || statSync(fullchain).size === 0 || statSync(privkey).size === 0) {
            shouldClean = true;
          }
        } catch {
          shouldClean = true;
        }
      } else if (existsSync(renewalFile) || existsSync(archiveDir)) {
        // Renewal config or archive directory exists without a valid live directory -> failed mid-way
        shouldClean = true;
      }
    }

    if (shouldClean) {
      try {
        await shell(`rm -rf /etc/letsencrypt/live/${domain} /etc/letsencrypt/archive/${domain} /etc/letsencrypt/renewal/${domain}.conf 2>/dev/null || true`);
      } catch {}
    }
  }

  // ─── Standard SSL (HTTP-01) Handler ─────────────────────
  const handleStandardSSLIssue = async (request, reply) => {
    const { domain, email, includeWww = true, overwrite = false } = request.body || {};
    if (!domain) return reply.code(400).send({ error: 'Domain required' });

    const cleanDomain = domain.replace(/^\*\./, '').toLowerCase().trim();
    const siteRoot = join(config.webRoot, cleanDomain);
    const docRoot = join(siteRoot, 'public_html');
    const legacyDocRoot = join(siteRoot, 'html');
    const targetRoot = existsSync(docRoot) ? docRoot : (existsSync(legacyDocRoot) ? legacyDocRoot : siteRoot);

    // 1. DNS Pre-check
    const dnsInfo = await checkDomainDNS(cleanDomain);

    // Only include www subdomain if it actually resolves to this server IP
    let includeWwwVerified = false;
    if (includeWww) {
      try {
        const wwwIps = await dnsPromises.resolve4(`www.${cleanDomain}`);
        if (dnsInfo.serverIp && wwwIps.includes(dnsInfo.serverIp)) {
          includeWwwVerified = true;
        }
      } catch {}
    }

    const domains = ['-d', cleanDomain];
    if (includeWwwVerified) {
      domains.push('-d', `www.${cleanDomain}`);
    }

    let certResult;

    // Clean up stale locks and previous failed cert files to guarantee fresh overwrite
    await prepareCertbotForFreshOverwrite(cleanDomain, overwrite);

    // 2. Stop OpenLiteSpeed (and any rogue apache2/nginx) to free up ports 80/443 for Certbot Standalone verification
    try {
      await shell('systemctl stop lsws 2>/dev/null || /usr/local/lsws/bin/lswsctrl stop 2>/dev/null || true');
      await shell('systemctl stop apache2 2>/dev/null || systemctl stop nginx 2>/dev/null || true');
    } catch {}

    try {
      // 3. Generate certificate via certbot standalone mode (with --cert-name, --force-renewal, --expand to overwrite on retry)
      certResult = await run(config.bin.certbot, [
        'certonly',
        '--standalone',
        '--preferred-challenges', 'http',
        '--cert-name', cleanDomain,
        '--force-renewal',
        '--expand',
        ...domains,
        '--email', email || `admin@${cleanDomain}`,
        '--agree-tos',
        '--non-interactive',
      ], { timeout: 120_000 });
    } catch (err) {
      certResult = { code: 1, stderr: err.message };
    } finally {
      // 4. Always restart OpenLiteSpeed
      try {
        await shell('systemctl start lsws 2>/dev/null || /usr/local/lsws/bin/lswsctrl start 2>/dev/null || true');
      } catch {}
    }

    // 5. Fallback: if standalone failed (e.g. port blocked or container restriction), attempt webroot
    if (certResult.code !== 0 && targetRoot && existsSync(targetRoot)) {
      try {
        const acmeDir = join(targetRoot, '.well-known', 'acme-challenge');
        try {
          mkdirSync(acmeDir, { recursive: true });
          await shell(`chmod -R 755 ${join(targetRoot, '.well-known')} 2>/dev/null || true`);
        } catch {}

        const webrootResult = await run(config.bin.certbot, [
          'certonly',
          '--webroot',
          '-w', targetRoot,
          '--cert-name', cleanDomain,
          '--force-renewal',
          '--expand',
          ...domains,
          '--email', email || `admin@${cleanDomain}`,
          '--agree-tos',
          '--non-interactive',
        ], { timeout: 120_000 });
        if (webrootResult.code === 0) {
          certResult = webrootResult;
        }
      } catch {}
    }

    if (certResult.code !== 0) {
      const freshDns = await checkDomainDNS(cleanDomain);
      return reply.code(400).send({
        error: 'SSL certificate verification failed.',
        details: certResult.stderr || certResult.stdout || 'Certbot standalone verification failed',
        dnsMismatch: !freshDns.matches,
        serverIp: freshDns.serverIp,
        resolvedIps: freshDns.resolvedIps,
        dnsCheckerUrl: freshDns.dnsCheckerUrl,
        suggestion: !freshDns.matches
          ? `Your domain "${cleanDomain}" does not appear to point to this server IP (${freshDns.serverIp || 'unknown'}). It currently resolves to [${freshDns.resolvedIps.join(', ') || 'nowhere'}]. Please check your DNS on https://dnschecker.org/#A/${cleanDomain}`
          : `Domain resolves to server IP (${freshDns.serverIp}), but Let's Encrypt challenge verification failed. Ensure port 80 is not blocked by external cloud provider firewalls.`,
      });
    }

    // 6. Update OLS vhost to inject vhssl block pointing to /etc/letsencrypt/live/<domain>/
    updateVirtualHostSSL(cleanDomain, false);

    // 7. Restart OLS to apply certificate
    await shell('systemctl reload lsws 2>/dev/null || /usr/local/lsws/bin/lswsctrl restart 2>/dev/null || true');

    // 8. Update site record
    const sites = loadSites();
    const idx = sites.findIndex((s) => s.domain === cleanDomain);
    if (idx !== -1) {
      sites[idx].ssl = true;
      sites[idx].sslType = 'standard';
      sites[idx].sslExpiry = getSSLExpiry(cleanDomain);
      saveSites(sites);
    }

    return {
      success: true,
      message: `SSL certificate successfully installed and configured for ${cleanDomain}!`,
      sslExpiry: getSSLExpiry(cleanDomain),
    };
  };

  // Register both /issue and /request endpoints
  app.post('/issue', handleStandardSSLIssue);
  app.post('/request', handleStandardSSLIssue);

  // ─── Issue Wildcard SSL with Cloudflare DNS-01 ──────────
  app.post('/wildcard', async (request, reply) => {
    const { domain, email, cfEmail, cfApiKey, cfApiToken, overwrite = false } = request.body || {};
    if (!domain) return reply.code(400).send({ error: 'Domain is required' });

    const baseDomain = domain.replace(/^\*\./, '').toLowerCase().trim();

    // 1. Ensure dns directory exists
    const dnsDir = join(config.dataDir, 'dns');
    if (!existsSync(dnsDir)) mkdirSync(dnsDir, { recursive: true });

    // 2. Prepare Cloudflare credentials file (mode 0600)
    const credFile = join(dnsDir, `cloudflare_${baseDomain}.ini`);
    let credContent = '';

    if (cfApiToken && cfApiToken.trim()) {
      credContent = `dns_cloudflare_api_token = ${cfApiToken.trim()}\n`;
    } else if (cfApiKey && cfEmail) {
      credContent = `dns_cloudflare_email = ${cfEmail.trim()}\ndns_cloudflare_api_key = ${cfApiKey.trim()}\n`;
    } else {
      return reply.code(400).send({
        error: 'Cloudflare credentials required. Provide either Cloudflare API Token OR Cloudflare Email and Global API Key.',
      });
    }

    try {
      writeFileSync(credFile, credContent, { mode: 0o600 });
    } catch (err) {
      return reply.code(500).send({ error: `Failed to write Cloudflare credentials file: ${err.message}` });
    }

    // 3. Ensure python3-certbot-dns-cloudflare is installed on the host
    try {
      await shell('dpkg -s python3-certbot-dns-cloudflare >/dev/null 2>&1 || (DEBIAN_FRONTEND=noninteractive apt-get update -qq && apt-get install -y -qq python3-certbot-dns-cloudflare)');
    } catch {}

    // Clean up stale locks and previous failed cert files to guarantee fresh overwrite
    await prepareCertbotForFreshOverwrite(baseDomain, overwrite);

    // 4. Run Certbot DNS-01
    try {
      const args = [
        'certonly',
        '--dns-cloudflare',
        '--dns-cloudflare-credentials', credFile,
        '--dns-cloudflare-propagation-seconds', '20',
        '--cert-name', baseDomain,
        '--force-renewal',
        '--expand',
        '-d', baseDomain,
        '-d', `*.${baseDomain}`,
        '--email', email || cfEmail || `admin@${baseDomain}`,
        '--agree-tos',
        '--non-interactive',
        '--deploy-hook', `${config.bin.lswsctrl} restart`,
      ];

      const result = await run(config.bin.certbot, args, { timeout: 240_000 });

      if (result.code !== 0) {
        const dnsInfo = await checkDomainDNS(baseDomain);
        return reply.code(400).send({
          error: 'Certbot Wildcard SSL issuance failed.',
          details: result.stderr || result.stdout,
          dnsMismatch: !dnsInfo.matches,
          serverIp: dnsInfo.serverIp,
          resolvedIps: dnsInfo.resolvedIps,
          dnsCheckerUrl: dnsInfo.dnsCheckerUrl,
          suggestion: `Please check your DNS records and worldwide propagation on https://dnschecker.org/#A/${baseDomain}`,
        });
      }

      // 5. Update OLS Virtual Host SSL block and dual-listener wildcard mappings (*.domain.com)
      updateVirtualHostSSL(baseDomain, true);

      // 7. Restart OpenLiteSpeed
      await run(config.bin.lswsctrl, ['restart']);

      // 8. Update site record in sites.json
      const sites = loadSites();
      const idx = sites.findIndex((s) => s.domain === baseDomain);
      if (idx !== -1) {
        sites[idx].ssl = true;
        sites[idx].sslType = 'wildcard';
        sites[idx].wildcard = true;
        sites[idx].sslExpiry = getSSLExpiry(baseDomain);
        saveSites(sites);
      }

      return {
        success: true,
        message: `Wildcard SSL successfully issued for ${baseDomain} and *.${baseDomain}. OLS vhost and listener mapped!`,
      };
    } catch (err) {
      return reply.code(500).send({ error: 'Wildcard SSL issuance failed', details: err.message });
    }
  });

  // ─── List SSL Overview for all Sites & Certificates ─────
  app.get('/overview', async () => {
    const sites = loadSites();
    let certbotOutput = '';
    try {
      const res = await run(config.bin.certbot, ['certificates', '--quiet']);
      certbotOutput = res.stdout || '';
    } catch {}

    const certbotCerts = parseCertbotOutput(certbotOutput);

    const siteSSLList = [];
    for (const site of sites) {
      const domain = site.domain;
      const liveDir = `/etc/letsencrypt/live/${domain}`;
      const fullchain = join(liveDir, 'fullchain.pem');
      const privkey = join(liveDir, 'privkey.pem');

      let hasValidCert = existsSync(fullchain) && existsSync(privkey);
      let sslType = 'none';
      let domainsCovered = [domain];
      let expiryText = 'Not Installed';
      let daysRemaining = null;

      if (hasValidCert) {
        try {
          const sanRes = await shell(`openssl x509 -in "${fullchain}" -noout -text 2>/dev/null | grep -A 1 "Subject Alternative Name" | tail -n 1`);
          const enddateRes = await shell(`openssl x509 -in "${fullchain}" -noout -enddate 2>/dev/null`);

          if (sanRes.stdout) {
            const rawDomains = sanRes.stdout.split(',').map((d) => d.replace(/DNS:/gi, '').trim()).filter(Boolean);
            if (rawDomains.length) domainsCovered = rawDomains;
          }

          const isWildcard = domainsCovered.some((d) => d.startsWith('*.')) || site.wildcard || site.sslType === 'wildcard';
          sslType = isWildcard ? 'wildcard' : 'standard';

          if (enddateRes.stdout) {
            const dateStr = enddateRes.stdout.replace('notAfter=', '').trim();
            const expDate = new Date(dateStr);
            if (!isNaN(expDate.getTime())) {
              const diffMs = expDate.getTime() - Date.now();
              daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
              expiryText = `${expDate.toISOString().split('T')[0]} (${daysRemaining}d left)`;
            }
          }
        } catch {
          sslType = site.wildcard ? 'wildcard' : 'standard';
        }
      } else if (site.ssl) {
        sslType = site.sslType || (site.wildcard ? 'wildcard' : 'standard');
      }

      siteSSLList.push({
        domain,
        ssl: hasValidCert || !!site.ssl,
        sslType,
        isWildcard: sslType === 'wildcard',
        domainsCovered: domainsCovered.join(', '),
        expiry: expiryText,
        daysRemaining,
        certPath: hasValidCert ? fullchain : null,
      });
    }

    return {
      sites: siteSSLList,
      certificates: certbotCerts,
      totalSites: sites.length,
      securedSites: siteSSLList.filter((s) => s.ssl).length,
      wildcardSites: siteSSLList.filter((s) => s.sslType === 'wildcard').length,
    };
  });

  // ─── List SSL Certificates ─────────────────────────────
  app.get('/certificates', async () => {
    const result = await run(config.bin.certbot, ['certificates', '--quiet']);
    const certs = parseCertbotOutput(result.stdout || '');
    return { raw: result.stdout, certificates: certs };
  });

  // ─── Renew All Certificates ────────────────────────────
  app.post('/renew', async () => {
    const result = await run(config.bin.certbot, [
      'renew',
      '--deploy-hook', `${config.bin.lswsctrl} restart`,
    ], { timeout: 300_000 });

    return { success: result.code === 0, output: result.stdout || result.stderr };
  });

  // ─── Revoke Certificate ────────────────────────────────
  app.delete('/:domain', async (request, reply) => {
    const { domain } = request.params;
    const cleanDomain = domain.replace(/^\*\./, '').toLowerCase().trim();

    const result = await run(config.bin.certbot, [
      'revoke',
      '--cert-name', cleanDomain,
      '--non-interactive',
      '--delete-after-revoke',
    ]);

    if (result.code !== 0) {
      return reply.code(500).send({ error: 'Revoke failed', details: result.stderr });
    }

    const sites = loadSites();
    const idx = sites.findIndex((s) => s.domain === cleanDomain);
    if (idx !== -1) {
      sites[idx].ssl = false;
      sites[idx].sslType = null;
      sites[idx].sslExpiry = null;
      saveSites(sites);
    }

    return { success: true };
  });
}

// ─── Helpers ─────────────────────────────────────────────


function getSSLExpiry(domain) {
  try {
    const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
    if (!existsSync(certPath)) return null;
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 90);
    return expiry.toISOString();
  } catch {
    return null;
  }
}

function parseCertbotOutput(output) {
  const certs = [];
  const blocks = output.split('Certificate Name:');
  for (const block of blocks.slice(1)) {
    const lines = block.trim().split('\n');
    const cert = { name: lines[0]?.trim() };
    for (const line of lines) {
      if (line.includes('Domains:')) cert.domains = line.split(':')[1]?.trim();
      if (line.includes('Expiry Date:')) cert.expiry = line.split(':').slice(1).join(':').trim();
      if (line.includes('Certificate Path:')) cert.path = line.split(':')[1]?.trim();
    }
    certs.push(cert);
  }
  return certs;
}
