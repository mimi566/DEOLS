// ─────────────────────────────────────────────────────────────
// DEOLS Services API — Systemd Service Management
// ─────────────────────────────────────────────────────────────

import { config } from '../config.js';
import { run } from '../utils/shell.js';

const MANAGED_SERVICES = [
  'lsws',
  'mariadb',
  'redis-server',
  'memcached',
  'fail2ban',
  'ufw',
  'cron',
  'ssh',
];

export default async function servicesRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  // ─── List Managed Services ────────────────────────────
  app.get('/', async () => {
    const services = [];

    for (const name of MANAGED_SERVICES) {
      const status = await run(config.bin.systemctl, ['is-active', name]);
      const enabled = await run(config.bin.systemctl, ['is-enabled', name]);

      services.push({
        name,
        active: status.stdout === 'active',
        enabled: enabled.stdout === 'enabled',
        status: status.stdout,
      });
    }

    return { services };
  });

  // ─── Get Service Status ───────────────────────────────
  app.get('/:name/status', async (request, reply) => {
    const { name } = request.params;
    const result = await run(config.bin.systemctl, ['status', name, '--no-pager']);
    return { name, output: result.stdout || result.stderr };
  });

  // ─── Start Service ────────────────────────────────────
  app.post('/:name/start', async (request, reply) => {
    const { name } = request.params;
    const result = await run(config.bin.systemctl, ['start', name]);
    return {
      success: result.code === 0,
      output: result.stdout || result.stderr,
    };
  });

  // ─── Stop Service ─────────────────────────────────────
  app.post('/:name/stop', async (request, reply) => {
    const { name } = request.params;
    // Prevent stopping critical services
    if (['ssh', 'deols'].includes(name)) {
      return reply.code(403).send({ error: `Cannot stop ${name} service via panel` });
    }

    const result = await run(config.bin.systemctl, ['stop', name]);
    return {
      success: result.code === 0,
      output: result.stdout || result.stderr,
    };
  });

  // ─── Restart Service ──────────────────────────────────
  app.post('/:name/restart', async (request, reply) => {
    const { name } = request.params;
    const result = await run(config.bin.systemctl, ['restart', name]);
    return {
      success: result.code === 0,
      output: result.stdout || result.stderr,
    };
  });

  // ─── Enable Service ───────────────────────────────────
  app.post('/:name/enable', async (request, reply) => {
    const { name } = request.params;
    const result = await run(config.bin.systemctl, ['enable', name]);
    return {
      success: result.code === 0,
      output: result.stdout || result.stderr,
    };
  });

  // ─── Disable Service ──────────────────────────────────
  app.post('/:name/disable', async (request, reply) => {
    const { name } = request.params;
    if (['ssh', 'deols'].includes(name)) {
      return reply.code(403).send({ error: `Cannot disable ${name} service` });
    }

    const result = await run(config.bin.systemctl, ['disable', name]);
    return {
      success: result.code === 0,
      output: result.stdout || result.stderr,
    };
  });

  // ─── Service Logs ─────────────────────────────────────
  app.get('/:name/logs', async (request, reply) => {
    const { name } = request.params;
    const lines = request.query.lines || 100;

    const result = await run('journalctl', [
      '-u', name,
      '-n', String(lines),
      '--no-pager',
      '-o', 'short-iso',
    ]);

    return { name, logs: result.stdout };
  });
}
