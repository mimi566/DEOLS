// ─────────────────────────────────────────────────────────────
// DEOLS Git API — SSH Keys & Repository Sync Engine
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { run, shell } from '../utils/shell.js';

const GIT_SYNC_FILE = join(config.dataDir, 'git-sync.json');

function loadSyncConfig() {
  if (!existsSync(GIT_SYNC_FILE)) return [];
  return JSON.parse(readFileSync(GIT_SYNC_FILE, 'utf-8'));
}

function saveSyncConfig(syncs) {
  writeFileSync(GIT_SYNC_FILE, JSON.stringify(syncs, null, 2));
}

export default async function gitRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  // ─── List SSH Keys ─────────────────────────────────────
  app.get('/ssh-keys', async (request, reply) => {
    const user = request.query.user || 'root';
    const keyFile = user === 'root' ? '/root/.ssh/authorized_keys' : `/home/${user}/.ssh/authorized_keys`;

    if (!existsSync(keyFile)) return { keys: [] };

    const content = readFileSync(keyFile, 'utf-8');
    const keys = content
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('#'))
      .map((line, index) => {
        const parts = line.trim().split(/\s+/);
        return {
          id: index,
          type: parts[0] || 'unknown',
          key: parts[1] || '',
          comment: parts.slice(2).join(' ') || 'No comment',
          raw: line.trim(),
        };
      });

    return { keys };
  });

  // ─── Add SSH Key ───────────────────────────────────────
  app.post('/ssh-keys', async (request, reply) => {
    const { key, user = 'root' } = request.body || {};
    if (!key) return reply.code(400).send({ error: 'SSH public key required' });

    // Validate key format
    const validPrefixes = ['ssh-rsa', 'ssh-ed25519', 'ecdsa-sha2', 'ssh-dss'];
    if (!validPrefixes.some((p) => key.trim().startsWith(p))) {
      return reply.code(400).send({ error: 'Invalid SSH key format' });
    }

    const sshDir = user === 'root' ? '/root/.ssh' : `/home/${user}/.ssh`;
    const keyFile = join(sshDir, 'authorized_keys');

    if (!existsSync(sshDir)) {
      mkdirSync(sshDir, { recursive: true, mode: 0o700 });
    }

    appendFileSync(keyFile, '\n' + key.trim() + '\n');
    await shell(`chmod 600 ${keyFile}`);

    return { success: true };
  });

  // ─── Remove SSH Key ───────────────────────────────────
  app.delete('/ssh-keys/:index', async (request, reply) => {
    const { index } = request.params;
    const user = request.query.user || 'root';
    const keyFile = user === 'root' ? '/root/.ssh/authorized_keys' : `/home/${user}/.ssh/authorized_keys`;

    if (!existsSync(keyFile)) return reply.code(404).send({ error: 'No keys found' });

    const lines = readFileSync(keyFile, 'utf-8').split('\n');
    const activeKeys = lines.filter((l) => l.trim() && !l.startsWith('#'));
    const idx = parseInt(index, 10);

    if (idx < 0 || idx >= activeKeys.length) {
      return reply.code(404).send({ error: 'Key not found' });
    }

    const targetKey = activeKeys[idx];
    const newContent = lines.filter((l) => l.trim() !== targetKey.trim()).join('\n');
    writeFileSync(keyFile, newContent);

    return { success: true };
  });

  // ─── List Git Sync Connections ─────────────────────────
  app.get('/sync', async () => {
    return { connections: loadSyncConfig() };
  });

  // ─── Create Git Sync Connection ────────────────────────
  app.post('/sync', async (request, reply) => {
    const {
      domain,
      repoUrl,
      branch = 'main',
      targetPath,
      autoSync = false,
    } = request.body || {};

    if (!domain || !repoUrl) {
      return reply.code(400).send({ error: 'Domain and repository URL required' });
    }

    const destPath = targetPath || join(config.webRoot, domain, 'public_html');

    // Clone or pull the repo
    if (!existsSync(join(destPath, '.git'))) {
      const result = await run(config.bin.git, [
        'clone', '--branch', branch, '--single-branch', repoUrl, destPath,
      ], { timeout: 300_000, cwd: '/tmp' });

      if (result.code !== 0) {
        return reply.code(500).send({ error: 'Git clone failed', details: result.stderr });
      }
    }

    // Fix ownership
    await shell(`chown -R nobody:nogroup ${destPath}`);

    const syncEntry = {
      id: crypto.randomUUID(),
      domain,
      repoUrl,
      branch,
      targetPath: destPath,
      autoSync,
      lastSync: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const syncs = loadSyncConfig();
    syncs.push(syncEntry);
    saveSyncConfig(syncs);

    return { success: true, connection: syncEntry };
  });

  // ─── Trigger Git Pull ─────────────────────────────────
  app.post('/sync/:id/pull', async (request, reply) => {
    const syncs = loadSyncConfig();
    const sync = syncs.find((s) => s.id === request.params.id);
    if (!sync) return reply.code(404).send({ error: 'Sync connection not found' });

    const result = await run(config.bin.git, ['pull', 'origin', sync.branch], {
      cwd: sync.targetPath,
      timeout: 120_000,
    });

    if (result.code !== 0) {
      return reply.code(500).send({ error: 'Git pull failed', details: result.stderr });
    }

    // Update last sync time
    sync.lastSync = new Date().toISOString();
    saveSyncConfig(syncs);

    // Fix ownership after pull
    await shell(`chown -R nobody:nogroup ${sync.targetPath}`);

    return { success: true, output: result.stdout };
  });

  // ─── Delete Git Sync Connection ────────────────────────
  app.delete('/sync/:id', async (request, reply) => {
    const syncs = loadSyncConfig();
    const idx = syncs.findIndex((s) => s.id === request.params.id);
    if (idx === -1) return reply.code(404).send({ error: 'Not found' });

    syncs.splice(idx, 1);
    saveSyncConfig(syncs);

    return { success: true };
  });

  // ─── Webhook Endpoint (GitHub/GitLab) ──────────────────
  app.post('/webhook/:id', async (request, reply) => {
    const syncs = loadSyncConfig();
    const sync = syncs.find((s) => s.id === request.params.id);
    if (!sync || !sync.autoSync) {
      return reply.code(404).send({ error: 'Webhook not configured' });
    }

    // Verify payload has the right branch
    const payload = request.body || {};
    const ref = payload.ref || '';
    if (ref && !ref.endsWith(`/${sync.branch}`)) {
      return { skipped: true, message: `Push to ${ref}, not ${sync.branch}` };
    }

    // Execute pull
    const result = await run(config.bin.git, ['pull', 'origin', sync.branch], {
      cwd: sync.targetPath,
      timeout: 120_000,
    });

    sync.lastSync = new Date().toISOString();
    saveSyncConfig(syncs);

    await shell(`chown -R nobody:nogroup ${sync.targetPath}`);

    return { success: result.code === 0, output: result.stdout };
  });
}
