// ─────────────────────────────────────────────────────────────
// DEOLS SSL API — Certbot Wrapper for Let's Encrypt
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { shell, run } from '../utils/shell.js';

const SITES_FILE = join(config.dataDir, 'sites.json');

function loadSites() {
  if (!existsSync(SITES_FILE)) return [];
  return JSON.parse(readFileSync(SITES_FILE, 'utf-8'));
}

function saveSites(sites) {
  writeFileSync(SITES_FILE, JSON.stringify(sites, null, 2));
}

export default async function sslRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  // ─── Issue Standard SSL ────────────────────────────────
  app.post('/issue', async (request, reply) => {
    const { domain, email, includeWww = true } = request.body || {};
    if (!domain) return reply.code(400).send({ error: 'Domain required' });

    const docRoot = join(config.webRoot, domain, 'public_html');
    if (!existsSync(docRoot)) {
      return reply.code(404).send({ error: 'Site document root not found' });
    }

    const domains = ['-d', domain];
    if (includeWww) domains.push('-d', `www.${domain}`);

    try {
      const result = await run(config.bin.certbot, [
        'certonly',
        '--webroot',
        '-w', docRoot,
        ...domains,
        '--email', email || `admin@${domain}`,
        '--agree-tos',
        '--non-interactive',
        '--deploy-hook', `${config.bin.lswsctrl} restart`,
      ], { timeout: 120_000 });

      if (result.code !== 0) {
        return reply.code(500).send({ error: 'Certbot failed', details: result.stderr });
      }

      // Update OLS vhost to use SSL cert
      await updateVhostSSL(domain);

      // Restart OLS
      await run(config.bin.lswsctrl, ['restart']);

      // Update site record
      const sites = loadSites();
      const idx = sites.findIndex((s) => s.domain === domain);
      if (idx !== -1) {
        sites[idx].ssl = true;
        sites[idx].sslType = 'standard';
        sites[idx].sslExpiry = getSSLExpiry(domain);
        saveSites(sites);
      }

      return { success: true, message: `SSL issued for ${domain}` };
    } catch (err) {
      return reply.code(500).send({ error: 'SSL issuance failed', details: err.message });
    }
  });

  // ─── Issue Wildcard SSL (DNS-01) ───────────────────────
  app.post('/wildcard', async (request, reply) => {
    const { domain, email, dnsPlugin = 'cloudflare', credentialsFile } = request.body || {};
    if (!domain) return reply.code(400).send({ error: 'Domain required' });

    const baseDomain = domain.replace(/^\*\./, '');

    try {
      const args = [
        'certonly',
        '--dns-' + dnsPlugin,
        '--dns-' + dnsPlugin + '-credentials', credentialsFile || `/opt/deols/data/dns/${dnsPlugin}.ini`,
        '-d', baseDomain,
        '-d', `*.${baseDomain}`,
        '--email', email || `admin@${baseDomain}`,
        '--agree-tos',
        '--non-interactive',
        '--deploy-hook', `${config.bin.lswsctrl} restart`,
      ];

      const result = await run(config.bin.certbot, args, { timeout: 180_000 });

      if (result.code !== 0) {
        return reply.code(500).send({ error: 'Wildcard SSL failed', details: result.stderr });
      }

      await updateVhostSSL(baseDomain);
      await run(config.bin.lswsctrl, ['restart']);

      const sites = loadSites();
      const idx = sites.findIndex((s) => s.domain === baseDomain);
      if (idx !== -1) {
        sites[idx].ssl = true;
        sites[idx].sslType = 'wildcard';
        sites[idx].sslExpiry = getSSLExpiry(baseDomain);
        saveSites(sites);
      }

      return { success: true, message: `Wildcard SSL issued for *.${baseDomain}` };
    } catch (err) {
      return reply.code(500).send({ error: 'Wildcard SSL failed', details: err.message });
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

    const result = await run(config.bin.certbot, [
      'revoke',
      '--cert-name', domain,
      '--non-interactive',
      '--delete-after-revoke',
    ]);

    if (result.code !== 0) {
      return reply.code(500).send({ error: 'Revoke failed', details: result.stderr });
    }

    const sites = loadSites();
    const idx = sites.findIndex((s) => s.domain === domain);
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

async function updateVhostSSL(domain) {
  const vhconfPath = join(config.vhostsDir, domain, 'vhconf.conf');
  if (!existsSync(vhconfPath)) return;

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

  // Remove existing vhssl block if present, then append new one
  content = content.replace(/\nvhssl\s*\{[^}]*\}/s, '');
  content += sslBlock;

  writeFileSync(vhconfPath, content);
}

function getSSLExpiry(domain) {
  try {
    const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
    if (!existsSync(certPath)) return null;
    // Read cert and parse expiry with openssl
    // Simplified: just return 90 days from now
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
