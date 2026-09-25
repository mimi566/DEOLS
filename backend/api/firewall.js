// ─────────────────────────────────────────────────────────────
// DEOLS Firewall API — UFW Management
// ─────────────────────────────────────────────────────────────

import { config } from '../config.js';
import { run, shell } from '../utils/shell.js';

export default async function firewallRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  // ─── Get Firewall Status ──────────────────────────────
  app.get('/status', async () => {
    const result = await run(config.bin.ufw, ['status', 'verbose']);
    const lines = result.stdout.split('\n');
    const statusLine = lines.find((l) => l.startsWith('Status:'));
    const active = statusLine ? statusLine.includes('active') : false;

    return {
      active,
      raw: result.stdout,
    };
  });

  // ─── List Rules ────────────────────────────────────────
  app.get('/rules', async () => {
    const result = await run(config.bin.ufw, ['status', 'numbered']);
    const rules = [];
    const lines = result.stdout.split('\n');

    for (const line of lines) {
      const match = line.match(/\[\s*(\d+)\]\s+(.+)/);
      if (match) {
        rules.push({
          number: parseInt(match[1]),
          rule: match[2].trim(),
        });
      }
    }

    return { rules };
  });

  // ─── Enable Firewall ──────────────────────────────────
  app.post('/enable', async () => {
    // Ensure SSH and panel port are allowed first
    await run(config.bin.ufw, ['allow', '22/tcp']);
    await run(config.bin.ufw, ['allow', '80/tcp']);
    await run(config.bin.ufw, ['allow', '443/tcp']);
    await run(config.bin.ufw, ['allow', String(config.port) + '/tcp']);

    const result = await shell(`echo "y" | ${config.bin.ufw} enable`);
    return { success: result.code === 0, output: result.stdout };
  });

  // ─── Disable Firewall ─────────────────────────────────
  app.post('/disable', async () => {
    const result = await run(config.bin.ufw, ['disable']);
    return { success: result.code === 0, output: result.stdout };
  });

  // ─── Add Rule ─────────────────────────────────────────
  app.post('/rules', async (request, reply) => {
    const { action = 'allow', port, protocol = 'tcp', from = 'any', to = 'any' } = request.body || {};
    if (!port) return reply.code(400).send({ error: 'Port required' });

    const validActions = ['allow', 'deny', 'reject'];
    if (!validActions.includes(action)) {
      return reply.code(400).send({ error: 'Invalid action' });
    }

    const args = [action, 'from', from, 'to', to, 'port', String(port), 'proto', protocol];
    const result = await run(config.bin.ufw, args);

    return { success: result.code === 0, output: result.stdout || result.stderr };
  });

  // ─── Delete Rule ──────────────────────────────────────
  app.delete('/rules/:number', async (request, reply) => {
    const { number } = request.params;
    const result = await shell(`echo "y" | ${config.bin.ufw} delete ${number}`);

    return { success: result.code === 0, output: result.stdout || result.stderr };
  });

  // ─── Reset Firewall ───────────────────────────────────
  app.post('/reset', async () => {
    const result = await shell(`echo "y" | ${config.bin.ufw} reset`);
    return { success: result.code === 0, output: result.stdout };
  });
}
