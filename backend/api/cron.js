// ─────────────────────────────────────────────────────────────
// DEOLS Cron Job Manager API
// ─────────────────────────────────────────────────────────────

import { shell } from '../utils/shell.js';

export default async function cronRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  // ─── List Cron Jobs ────────────────────────────────────
  app.get('/', async (request, reply) => {
    const user = request.query.user || 'root';
    const result = await shell(`crontab -u ${user} -l 2>/dev/null || echo ""`);

    const jobs = result.stdout
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('#'))
      .map((line, index) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 6) return null;
        return {
          id: index,
          minute: parts[0],
          hour: parts[1],
          dayOfMonth: parts[2],
          month: parts[3],
          dayOfWeek: parts[4],
          command: parts.slice(5).join(' '),
          schedule: parts.slice(0, 5).join(' '),
          raw: line.trim(),
          enabled: !line.trim().startsWith('#'),
        };
      })
      .filter(Boolean);

    return { user, jobs };
  });

  // ─── Add Cron Job ──────────────────────────────────────
  app.post('/', async (request, reply) => {
    const { schedule, command, user = 'root' } = request.body || {};
    if (!schedule || !command) {
      return reply.code(400).send({ error: 'Schedule and command required' });
    }

    // Validate cron schedule format
    const cronRegex = /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;
    if (!cronRegex.test(schedule.trim())) {
      return reply.code(400).send({ error: 'Invalid cron schedule format' });
    }

    const newLine = `${schedule.trim()} ${command}`;
    const result = await shell(
      `(crontab -u ${user} -l 2>/dev/null; echo "${newLine}") | crontab -u ${user} -`
    );

    if (result.code !== 0) {
      return reply.code(500).send({ error: 'Failed to add cron job', details: result.stderr });
    }

    return { success: true, job: newLine };
  });

  // ─── Delete Cron Job by Index ──────────────────────────
  app.delete('/:index', async (request, reply) => {
    const { index } = request.params;
    const user = request.query.user || 'root';
    const idx = parseInt(index, 10);

    const result = await shell(`crontab -u ${user} -l 2>/dev/null || echo ""`);
    const lines = result.stdout.split('\n');
    const activeLines = lines.filter((l) => l.trim() && !l.startsWith('#'));

    if (idx < 0 || idx >= activeLines.length) {
      return reply.code(404).send({ error: 'Cron job not found' });
    }

    // Remove the line at the given index
    const targetLine = activeLines[idx];
    const newLines = lines.filter((l) => l.trim() !== targetLine.trim());
    const newCrontab = newLines.join('\n');

    const writeResult = await shell(`echo "${newCrontab}" | crontab -u ${user} -`);
    if (writeResult.code !== 0) {
      return reply.code(500).send({ error: 'Failed to remove cron job' });
    }

    return { success: true };
  });

  // ─── Toggle Cron Job (Enable/Disable) ──────────────────
  app.put('/:index/toggle', async (request, reply) => {
    const { index } = request.params;
    const user = request.query.user || 'root';
    const idx = parseInt(index, 10);

    const result = await shell(`crontab -u ${user} -l 2>/dev/null || echo ""`);
    const lines = result.stdout.split('\n');
    let counter = -1;

    const newLines = lines.map((line) => {
      if (line.trim() && !line.startsWith('#')) {
        counter++;
        if (counter === idx) {
          return '# ' + line; // Disable
        }
      } else if (line.trim().startsWith('#') && line.trim().length > 1) {
        // Check if this is a disabled job
        const uncommented = line.replace(/^#\s*/, '');
        const cronRegex = /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+/;
        if (cronRegex.test(uncommented)) {
          counter++;
          if (counter === idx) {
            return uncommented; // Enable
          }
        }
      }
      return line;
    });

    const writeResult = await shell(`echo "${newLines.join('\n')}" | crontab -u ${user} -`);
    if (writeResult.code !== 0) {
      return reply.code(500).send({ error: 'Failed to toggle cron job' });
    }

    return { success: true };
  });

  // ─── Add WP-Cron Preset ────────────────────────────────
  app.post('/wp-cron', async (request, reply) => {
    const { domain, interval = '*/5' } = request.body || {};
    if (!domain) return reply.code(400).send({ error: 'Domain required' });

    const wpPath = `/var/www/${domain}/public_html`;
    const command = `cd ${wpPath} && /usr/local/bin/wp cron event run --due-now --path=${wpPath} > /dev/null 2>&1`;
    const schedule = `${interval} * * * *`;

    const result = await shell(
      `(crontab -u root -l 2>/dev/null; echo "${schedule} ${command}") | crontab -u root -`
    );

    if (result.code !== 0) {
      return reply.code(500).send({ error: 'Failed to set WP-Cron', details: result.stderr });
    }

    return { success: true, message: `WP-Cron set for ${domain} every ${interval} minutes` };
  });
}
