// ─────────────────────────────────────────────────────────────
// DEOLS Services API — Systemd Service & Custom Unit Manager
// ─────────────────────────────────────────────────────────────

import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { config } from '../config.js';
import { run, shell } from '../utils/shell.js';

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

const PROTECTED_SERVICES = [
  'ssh',
  'sshd',
  'deols',
  'systemd',
  'systemd-journald',
  'systemd-logind',
  'systemd-udevd',
  'networking',
  'dbus',
];

const PRESET_TEMPLATES = {
  'automation-custom-service': {
    title: 'Python Automation Watcher (automation-custom-service.service)',
    description: 'Autonomous Python script watcher with auto-restart and journal logging',
    content: `[Unit]
Description=Custom Background Automation Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/automation
ExecStart=/usr/bin/python3 /opt/automation/worker.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=automation-custom-service

[Install]
WantedBy=multi-user.target
`
  },
  'node-worker': {
    title: 'Node.js Worker Daemon',
    description: 'Background worker daemon running under unprivileged www-data user',
    content: `[Unit]
Description=Node.js Background Worker Service
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/node-app
ExecStart=/usr/bin/node /var/www/node-app/worker.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal
SyslogIdentifier=node-worker

[Install]
WantedBy=multi-user.target
`
  },
  'shell-watcher': {
    title: 'Shell Script Automation Watcher',
    description: 'Continuous bash loop/watcher monitoring server events',
    content: `[Unit]
Description=Shell Automation Watcher Service
After=network.target

[Service]
Type=simple
User=root
ExecStart=/bin/bash /opt/scripts/watcher.sh
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=shell-watcher

[Install]
WantedBy=multi-user.target
`
  },
  'generic-service': {
    title: 'Generic Systemd Service',
    description: 'Standard boilerplate systemd service unit',
    content: `[Unit]
Description=Custom Background Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt
ExecStart=/usr/bin/python3 /opt/service.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`
  }
};

function ensureSystemdDir() {
  const dir = config.systemdDir || '/etc/systemd/system';
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // Ignore if system directory permission denied in dev mode
    }
  }
  return dir;
}

function cleanServiceName(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let name = raw.trim();
  // Strip path traversal characters
  name = basename(name).replace(/[^a-zA-Z0-9_\-\.]/g, '');
  if (!name) return null;
  if (!name.endsWith('.service')) {
    name = `${name}.service`;
  }
  return name;
}

function isProtected(serviceName) {
  const base = serviceName.replace(/\.service$/, '').toLowerCase();
  return PROTECTED_SERVICES.includes(base) || base.startsWith('systemd-');
}

export default async function servicesRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  // ─── List Managed Core Services ───────────────────────
  app.get('/', async () => {
    const services = [];

    for (const name of MANAGED_SERVICES) {
      const status = await run(config.bin.systemctl, ['is-active', name]);
      const enabled = await run(config.bin.systemctl, ['is-enabled', name]);

      services.push({
        name,
        active: status.stdout === 'active',
        enabled: enabled.stdout === 'enabled',
        status: status.stdout || 'unknown',
      });
    }

    return { services };
  });

  // ─── Global Systemd Daemon Reload ─────────────────────
  app.post('/daemon-reload', async (request, reply) => {
    const result = await run(config.bin.systemctl, ['daemon-reload']);
    return {
      success: result.code === 0,
      message: result.code === 0 ? 'systemd daemon reloaded successfully' : 'Failed to reload systemd daemon',
      output: result.stdout || result.stderr,
      timestamp: new Date().toISOString(),
    };
  });

  // ─── Custom Service Unit Templates ────────────────────
  app.get('/custom/templates', async () => {
    return { templates: PRESET_TEMPLATES };
  });

  // ─── List Custom Systemd Services (/etc/systemd/system/*.service) ───
  app.get('/custom', async () => {
    const dir = ensureSystemdDir();
    const services = [];

    if (existsSync(dir)) {
      try {
        const files = readdirSync(dir);
        for (const file of files) {
          if (!file.endsWith('.service')) continue;
          if (file.includes('@')) continue; // Ignore template instances

          const fullPath = join(dir, file);
          let stat;
          try {
            stat = statSync(fullPath);
            if (!stat.isFile()) continue;
          } catch {
            continue;
          }

          // Read brief description from Unit file
          let description = '';
          try {
            const content = readFileSync(fullPath, 'utf-8');
            const match = content.match(/^Description\s*=\s*(.+)$/im);
            if (match) description = match[1].trim();
          } catch {
            // Ignore read errors
          }

          const base = file.replace(/\.service$/, '');
          const status = await run(config.bin.systemctl, ['is-active', file]);
          const enabled = await run(config.bin.systemctl, ['is-enabled', file]);

          services.push({
            name: base,
            serviceName: file,
            path: fullPath,
            description: description || base,
            active: status.stdout === 'active',
            enabled: enabled.stdout === 'enabled',
            status: status.stdout || 'unknown',
            isProtected: isProtected(file),
            updatedAt: stat.mtime.toISOString(),
            size: stat.size,
          });
        }
      } catch (err) {
        app.log.warn(`Failed to scan custom services in ${dir}: ${err.message}`);
      }
    }

    return { services };
  });

  // ─── Get Single Custom Service Details & Code ─────────
  app.get('/custom/:name', async (request, reply) => {
    const { name } = request.params;
    const serviceName = cleanServiceName(name);
    if (!serviceName) {
      return reply.code(400).send({ error: 'Invalid service unit name' });
    }

    const dir = ensureSystemdDir();
    const unitPath = join(dir, serviceName);

    let content = '';
    let exists = existsSync(unitPath);

    if (exists) {
      try {
        content = readFileSync(unitPath, 'utf-8');
      } catch (err) {
        return reply.code(500).send({ error: `Failed to read service file: ${err.message}` });
      }
    } else {
      // Check if user requested a preset template or automation-custom-service by default
      const base = serviceName.replace(/\.service$/, '');
      if (PRESET_TEMPLATES[base]) {
        content = PRESET_TEMPLATES[base].content;
      }
    }

    // Get live systemctl status
    const statusRes = await run(config.bin.systemctl, ['status', serviceName, '--no-pager', '-l']);
    const isActiveRes = await run(config.bin.systemctl, ['is-active', serviceName]);
    const isEnabledRes = await run(config.bin.systemctl, ['is-enabled', serviceName]);

    return {
      name: serviceName.replace(/\.service$/, ''),
      serviceName,
      path: unitPath,
      exists,
      content,
      isProtected: isProtected(serviceName),
      active: isActiveRes.stdout === 'active',
      enabled: isEnabledRes.stdout === 'enabled',
      statusText: isActiveRes.stdout || 'unknown',
      statusOutput: statusRes.stdout || statusRes.stderr || 'No status available',
    };
  });

  // ─── Save / Create Custom Systemd Service ─────────────
  app.post('/custom', async (request, reply) => {
    const { name, content, enable = true, restart = false } = request.body || {};
    const serviceName = cleanServiceName(name);

    if (!serviceName) {
      return reply.code(400).send({ error: 'Service unit name is required (e.g. automation-custom-service.service)' });
    }

    if (isProtected(serviceName)) {
      return reply.code(403).send({ error: `Cannot overwrite core system service: ${serviceName}` });
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      return reply.code(400).send({ error: 'Service unit content cannot be empty' });
    }

    // Basic systemd unit file validation
    if (!content.includes('[Service]') && !content.includes('[Unit]')) {
      return reply.code(400).send({ error: 'Invalid unit content. Must include at least [Service] or [Unit] section.' });
    }

    const dir = ensureSystemdDir();
    const unitPath = join(dir, serviceName);

    try {
      writeFileSync(unitPath, content.trim() + '\n', { mode: 0o644 });
    } catch (err) {
      return reply.code(500).send({ error: `Failed to write unit file ${unitPath}: ${err.message}` });
    }

    // 1. Reload systemd daemon
    await run(config.bin.systemctl, ['daemon-reload']);

    // 2. Enable if requested
    if (enable) {
      await run(config.bin.systemctl, ['enable', serviceName]);
    }

    // 3. Restart if requested
    let restartOutput = '';
    if (restart) {
      const r = await run(config.bin.systemctl, ['restart', serviceName]);
      restartOutput = r.stdout || r.stderr;
    }

    return {
      success: true,
      message: `Systemd unit ${serviceName} saved and daemon reloaded successfully!`,
      serviceName,
      path: unitPath,
      restartOutput,
    };
  });

  // ─── Custom Service Actions (Start / Stop / Restart / Enable / Disable) ───
  app.post('/custom/:name/:action', async (request, reply) => {
    const { name, action } = request.params;
    const serviceName = cleanServiceName(name);

    if (!serviceName) {
      return reply.code(400).send({ error: 'Invalid service name' });
    }

    const validActions = ['start', 'stop', 'restart', 'enable', 'disable', 'reload'];
    if (!validActions.includes(action)) {
      return reply.code(400).send({ error: `Invalid action '${action}'. Allowed: ${validActions.join(', ')}` });
    }

    if (['stop', 'disable'].includes(action) && isProtected(serviceName)) {
      return reply.code(403).send({ error: `Cannot ${action} protected system service: ${serviceName}` });
    }

    const result = await run(config.bin.systemctl, [action, serviceName]);
    const isActive = await run(config.bin.systemctl, ['is-active', serviceName]);

    return {
      success: result.code === 0,
      message: result.code === 0 ? `Service ${serviceName} ${action} completed successfully` : `Failed to ${action} ${serviceName}`,
      output: result.stdout || result.stderr,
      active: isActive.stdout === 'active',
      statusText: isActive.stdout || 'unknown',
    };
  });

  // ─── Delete Custom Systemd Service ────────────────────
  app.delete('/custom/:name', async (request, reply) => {
    const { name } = request.params;
    const serviceName = cleanServiceName(name);

    if (!serviceName) {
      return reply.code(400).send({ error: 'Invalid service name' });
    }

    if (isProtected(serviceName)) {
      return reply.code(403).send({ error: `Cannot delete protected system service: ${serviceName}` });
    }

    const dir = ensureSystemdDir();
    const unitPath = join(dir, serviceName);

    if (!existsSync(unitPath)) {
      return reply.code(404).send({ error: `Service unit file ${unitPath} does not exist` });
    }

    // Stop and disable service before deleting
    await run(config.bin.systemctl, ['stop', serviceName]);
    await run(config.bin.systemctl, ['disable', serviceName]);

    try {
      unlinkSync(unitPath);
    } catch (err) {
      return reply.code(500).send({ error: `Failed to remove ${unitPath}: ${err.message}` });
    }

    // Reload daemon to remove from systemd registry
    await run(config.bin.systemctl, ['daemon-reload']);
    await run(config.bin.systemctl, ['reset-failed']);

    return {
      success: true,
      message: `Service unit ${serviceName} deleted and systemd daemon reloaded`,
    };
  });

  // ─── Custom Service Journalctl Logs ───────────────────
  app.get('/custom/:name/logs', async (request, reply) => {
    const { name } = request.params;
    const serviceName = cleanServiceName(name);
    if (!serviceName) {
      return reply.code(400).send({ error: 'Invalid service name' });
    }

    const lines = parseInt(request.query.lines || '100', 10);
    const result = await run('journalctl', [
      '-u', serviceName,
      '-n', String(lines),
      '--no-pager',
      '-o', 'short-iso',
    ]);

    return {
      name: serviceName,
      logs: result.stdout || result.stderr || 'No journal log entries found.',
    };
  });

  // ─── Managed Service Endpoints (Compatibility) ────────
  app.get('/:name/status', async (request, reply) => {
    const { name } = request.params;
    const result = await run(config.bin.systemctl, ['status', name, '--no-pager']);
    return { name, output: result.stdout || result.stderr };
  });

  app.post('/:name/start', async (request, reply) => {
    const { name } = request.params;
    const result = await run(config.bin.systemctl, ['start', name]);
    return { success: result.code === 0, output: result.stdout || result.stderr };
  });

  app.post('/:name/stop', async (request, reply) => {
    const { name } = request.params;
    if (['ssh', 'deols'].includes(name)) {
      return reply.code(403).send({ error: `Cannot stop ${name} service via panel` });
    }
    const result = await run(config.bin.systemctl, ['stop', name]);
    return { success: result.code === 0, output: result.stdout || result.stderr };
  });

  app.post('/:name/restart', async (request, reply) => {
    const { name } = request.params;
    const result = await run(config.bin.systemctl, ['restart', name]);
    return { success: result.code === 0, output: result.stdout || result.stderr };
  });

  app.post('/:name/enable', async (request, reply) => {
    const { name } = request.params;
    const result = await run(config.bin.systemctl, ['enable', name]);
    return { success: result.code === 0, output: result.stdout || result.stderr };
  });

  app.post('/:name/disable', async (request, reply) => {
    const { name } = request.params;
    if (['ssh', 'deols'].includes(name)) {
      return reply.code(403).send({ error: `Cannot disable ${name} service` });
    }
    const result = await run(config.bin.systemctl, ['disable', name]);
    return { success: result.code === 0, output: result.stdout || result.stderr };
  });

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
