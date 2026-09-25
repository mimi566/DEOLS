// ─────────────────────────────────────────────────────────────
// DEOLS Cache API — OLS Cache & Redis/Memcached Management
// ─────────────────────────────────────────────────────────────

import { existsSync } from 'fs';
import { config } from '../config.js';
import { shell, run } from '../utils/shell.js';

export default async function cacheRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  // ─── Purge All OLS Cache ──────────────────────────────
  app.post('/ols/purge', async () => {
    const cacheDir = config.cacheDir;
    if (existsSync(cacheDir)) {
      await shell(`rm -rf ${cacheDir}/*`);
    }
    return { success: true, message: 'OLS full-page cache purged' };
  });

  // ─── Purge Site-Specific OLS Cache ────────────────────
  app.post('/ols/purge/:domain', async (request) => {
    const { domain } = request.params;
    // OLS stores cache per-vhost
    const siteCacheDir = `${config.cacheDir}/${domain}`;
    if (existsSync(siteCacheDir)) {
      await shell(`rm -rf ${siteCacheDir}/*`);
    }
    return { success: true, message: `Cache purged for ${domain}` };
  });

  // ─── OLS Cache Stats ─────────────────────────────────
  app.get('/ols/stats', async () => {
    const result = await shell(`du -sh ${config.cacheDir} 2>/dev/null || echo "0"`);
    return { size: result.stdout.split('\t')[0] || '0' };
  });

  // ─── Redis Status ────────────────────────────────────
  app.get('/redis/status', async () => {
    const active = await run(config.bin.systemctl, ['is-active', 'redis-server']);
    const info = await shell('redis-cli INFO server 2>/dev/null || echo "not installed"');

    return {
      installed: !info.stdout.includes('not installed'),
      active: active.stdout === 'active',
      info: info.stdout,
    };
  });

  // ─── Redis Flush ──────────────────────────────────────
  app.post('/redis/flush', async () => {
    const result = await shell('redis-cli FLUSHALL');
    return { success: result.code === 0, output: result.stdout };
  });

  // ─── Redis Toggle ─────────────────────────────────────
  app.post('/redis/toggle', async (request) => {
    const { action } = request.body || {};
    if (!['start', 'stop', 'restart'].includes(action)) {
      return { error: 'Invalid action' };
    }

    const result = await run(config.bin.systemctl, [action, 'redis-server']);
    return { success: result.code === 0 };
  });

  // ─── Install Redis ────────────────────────────────────
  app.post('/redis/install', async () => {
    const result = await shell(
      'apt-get update && apt-get install -y redis-server && systemctl enable redis-server && systemctl start redis-server',
      { timeout: 120_000 }
    );
    return { success: result.code === 0, output: result.stdout || result.stderr };
  });

  // ─── Memcached Status ─────────────────────────────────
  app.get('/memcached/status', async () => {
    const active = await run(config.bin.systemctl, ['is-active', 'memcached']);
    const stats = await shell('echo "stats" | nc -q 1 127.0.0.1 11211 2>/dev/null || echo "not installed"');

    return {
      installed: !stats.stdout.includes('not installed'),
      active: active.stdout === 'active',
      stats: stats.stdout,
    };
  });

  // ─── Memcached Flush ──────────────────────────────────
  app.post('/memcached/flush', async () => {
    const result = await shell('echo "flush_all" | nc -q 1 127.0.0.1 11211');
    return { success: result.code === 0, output: result.stdout };
  });

  // ─── Memcached Toggle ─────────────────────────────────
  app.post('/memcached/toggle', async (request) => {
    const { action } = request.body || {};
    if (!['start', 'stop', 'restart'].includes(action)) {
      return { error: 'Invalid action' };
    }

    const result = await run(config.bin.systemctl, [action, 'memcached']);
    return { success: result.code === 0 };
  });

  // ─── Install Memcached ────────────────────────────────
  app.post('/memcached/install', async () => {
    const result = await shell(
      'apt-get update && apt-get install -y memcached && systemctl enable memcached && systemctl start memcached',
      { timeout: 120_000 }
    );
    return { success: result.code === 0, output: result.stdout || result.stderr };
  });
}
