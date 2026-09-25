// ─────────────────────────────────────────────────────────────
// DEOLS SSL API — Certbot Wrapper & Cloudflare Wildcard SSL
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
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

  // ─── Issue Standard SSL (HTTP-01) ──────────────────────
  app.post('/issue', async (request, reply) => {
    const { domain, email, includeWww = true } = request.body || {};
    if (!domain) return reply.code(400).send({ error: 'Domain required' });

    const cleanDomain = domain.replace(/^\*\./, '').toLowerCase().trim();
    const docRoot = join(config.webRoot, cleanDomain, 'html');
    const legacyDocRoot = join(config.webRoot, cleanDomain, 'public_html');
    const targetRoot = existsSync(docRoot) ? docRoot : (existsSync(legacyDocRoot) ? legacyDocRoot : null);

    if (!targetRoot) {
      return reply.code(404).send({ error: `Site document root not found for ${cleanDomain}` });
    }

    const domains = ['-d', cleanDomain];
    if (includeWww) domains.push('-d', `www.${cleanDomain}`);

    try {
      const result = await run(config.bin.certbot, [
        'certonly',
        '--webroot',
        '-w', targetRoot,
        ...domains,
        '--email', email || `admin@${cleanDomain}`,
        '--agree-tos',
        '--non-interactive',
        '--deploy-hook', `${config.bin.lswsctrl} restart`,
      ], { timeout: 120_000 });

      if (result.code !== 0) {
        const dnsInfo = await checkDomainDNS(cleanDomain);
        return reply.code(400).send({
          error: 'SSL certificate verification failed.',
          details: result.stderr || result.stdout,
          dnsMismatch: !dnsInfo.matches,
          serverIp: dnsInfo.serverIp,
          resolvedIps: dnsInfo.resolvedIps,
          dnsCheckerUrl: dnsInfo.dnsCheckerUrl,
          suggestion: !dnsInfo.matches
            ? `Your domain "${cleanDomain}" does not appear to point to this server IP (${dnsInfo.serverIp || 'unknown'}). It currently resolves to [${dnsInfo.resolvedIps.join(', ') || 'nowhere'}]. Please check your DNS on https://dnschecker.org/#A/${cleanDomain}`
            : `Domain resolves to server IP, but HTTP-01 verification failed. Ensure port 80 is not blocked by a firewall.`,
        });
      }

      // Update OLS vhost to use SSL cert and ensure both port 80 & 443 listeners are mapped
      updateVirtualHostSSL(cleanDomain, false);

      // Restart OLS
      await run(config.bin.lswsctrl, ['restart']);

      // Update site record
      const sites = loadSites();
      const idx = sites.findIndex((s) => s.domain === cleanDomain);
      if (idx !== -1) {
        sites[idx].ssl = true;
        sites[idx].sslType = 'standard';
        sites[idx].sslExpiry = getSSLExpiry(cleanDomain);
        saveSites(sites);
      }

      return { success: true, message: `SSL issued for ${cleanDomain}` };
    } catch (err) {
      const dnsInfo = await checkDomainDNS(cleanDomain);
      return reply.code(500).send({
        error: 'SSL issuance failed.',
        details: err.message,
        dnsMismatch: !dnsInfo.matches,
        serverIp: dnsInfo.serverIp,
        resolvedIps: dnsInfo.resolvedIps,
        dnsCheckerUrl: dnsInfo.dnsCheckerUrl,
      });
    }
  });

  // ─── Issue Wildcard SSL with Cloudflare DNS-01 ──────────
  app.post('/wildcard', async (request, reply) => {
    const { domain, email, cfEmail, cfApiKey, cfApiToken } = request.body || {};
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

    // 4. Run Certbot DNS-01
    try {
      const args = [
        'certonly',
        '--dns-cloudflare',
        '--dns-cloudflare-credentials', credFile,
        '--dns-cloudflare-propagation-seconds', '20',
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

  // ─── List SSL Certificates ─────────────────────────────
  app.get('/certificates', async () => {
    const result = await run(config.bin.certbot, ['certificates', '--quiet']);
    return { raw: result.stdout, certificates: parseCertbotOutput(result.stdout) };
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
