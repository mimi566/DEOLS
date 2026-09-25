// ─────────────────────────────────────────────────────────────
// DEOLS Python Service Engine API
// Manage custom Python scripts, venvs, and systemd services
// ─────────────────────────────────────────────────────────────

import {
  existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync,
} from 'fs';
import { join, basename } from 'path';
import { config } from '../config.js';
import { shell, run } from '../utils/shell.js';

const PYTHON_DIR = join(config.dataDir, 'python-services');
const SERVICES_FILE = join(config.dataDir, 'python-services.json');

function loadPyServices() {
  if (!existsSync(SERVICES_FILE)) return [];
  return JSON.parse(readFileSync(SERVICES_FILE, 'utf-8'));
}

function savePyServices(services) {
  writeFileSync(SERVICES_FILE, JSON.stringify(services, null, 2));
}

export default async function pythonRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  // ─── List Python Services ─────────────────────────────
  app.get('/', async () => {
    const services = loadPyServices();

    // Check live status for each
    for (const svc of services) {
      const status = await run(config.bin.systemctl, ['is-active', svc.serviceName]);
      svc.active = status.stdout === 'active';
    }

    return { services };
  });

  // ─── Create Python Service ────────────────────────────
  app.post('/', async (request, reply) => {
    const {
      name,
      description = '',
      scriptContent,
      requirements = '',
      pythonVersion = '3',
      port = null,
      env = {},
    } = request.body || {};

    if (!name || !scriptContent) {
      return reply.code(400).send({ error: 'Name and scriptContent required' });
    }

    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    const serviceDir = join(PYTHON_DIR, safeName);
    const serviceName = `deols-py-${safeName}`;

    try {
      // 1. Create service directory
      mkdirSync(serviceDir, { recursive: true });

      // 2. Write Python script
      writeFileSync(join(serviceDir, 'main.py'), scriptContent);

      // 3. Write requirements.txt if provided
      if (requirements.trim()) {
        writeFileSync(join(serviceDir, 'requirements.txt'), requirements);
      }

      // 4. Create virtual environment
      await run(config.bin.python3, ['-m', 'venv', join(serviceDir, 'venv')], {
        cwd: serviceDir,
        timeout: 60_000,
      });

      // 5. Install requirements
      if (requirements.trim()) {
        await run(join(serviceDir, 'venv', 'bin', 'pip'), [
          'install', '-r', join(serviceDir, 'requirements.txt'),
        ], { cwd: serviceDir, timeout: 300_000 });
      }

      // 6. Generate systemd service file
      const envLines = Object.entries(env)
        .map(([k, v]) => `Environment=${k}=${v}`)
        .join('\n');

      const serviceUnit = `[Unit]
Description=DEOLS Python Service: ${name}
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=${serviceDir}
ExecStart=${join(serviceDir, 'venv', 'bin', 'python')} ${join(serviceDir, 'main.py')}
Restart=always
RestartSec=5
${envLines}
${port ? `Environment=PORT=${port}` : ''}

StandardOutput=journal
StandardError=journal
SyslogIdentifier=${serviceName}

[Install]
WantedBy=multi-user.target
`;

      const unitPath = `/etc/systemd/system/${serviceName}.service`;
      writeFileSync(unitPath, serviceUnit);

      // 7. Reload systemd and start
      await run(config.bin.systemctl, ['daemon-reload']);
      await run(config.bin.systemctl, ['enable', serviceName]);
      await run(config.bin.systemctl, ['start', serviceName]);

      // 8. Save record
      const svcRecord = {
        id: crypto.randomUUID(),
        name,
        safeName,
        serviceName,
        serviceDir,
        port,
        description,
        active: true,
        createdAt: new Date().toISOString(),
      };

      const services = loadPyServices();
      services.push(svcRecord);
      savePyServices(services);

      return { success: true, service: svcRecord };
    } catch (err) {
      return reply.code(500).send({ error: 'Failed to create Python service', details: err.message });
    }
  });

  // ─── Update Script Content ────────────────────────────
  app.put('/:id/script', async (request, reply) => {
    const services = loadPyServices();
    const svc = services.find((s) => s.id === request.params.id);
    if (!svc) return reply.code(404).send({ error: 'Service not found' });

    const { scriptContent, requirements } = request.body || {};

    if (scriptContent) {
      writeFileSync(join(svc.serviceDir, 'main.py'), scriptContent);
    }

    if (requirements !== undefined) {
      writeFileSync(join(svc.serviceDir, 'requirements.txt'), requirements);
      await run(join(svc.serviceDir, 'venv', 'bin', 'pip'), [
        'install', '-r', join(svc.serviceDir, 'requirements.txt'),
      ], { cwd: svc.serviceDir, timeout: 300_000 });
    }

    // Restart the service
    await run(config.bin.systemctl, ['restart', svc.serviceName]);

    return { success: true };
  });

  // ─── Start / Stop / Restart ───────────────────────────
  app.post('/:id/:action', async (request, reply) => {
    const { id, action } = request.params;
    if (!['start', 'stop', 'restart'].includes(action)) {
      return reply.code(400).send({ error: 'Invalid action' });
    }

    const services = loadPyServices();
    const svc = services.find((s) => s.id === id);
    if (!svc) return reply.code(404).send({ error: 'Service not found' });

    const result = await run(config.bin.systemctl, [action, svc.serviceName]);
    return { success: result.code === 0, output: result.stdout || result.stderr };
  });

  // ─── View Logs ─────────────────────────────────────────
  app.get('/:id/logs', async (request, reply) => {
    const services = loadPyServices();
    const svc = services.find((s) => s.id === request.params.id);
    if (!svc) return reply.code(404).send({ error: 'Service not found' });

    const lines = request.query.lines || 100;
    const result = await run('journalctl', [
      '-u', svc.serviceName,
      '-n', String(lines),
      '--no-pager',
    ]);

    return { logs: result.stdout };
  });

  // ─── Delete Python Service ────────────────────────────
  app.delete('/:id', async (request, reply) => {
    const services = loadPyServices();
    const idx = services.findIndex((s) => s.id === request.params.id);
    if (idx === -1) return reply.code(404).send({ error: 'Service not found' });

    const svc = services[idx];

    // Stop and disable
    await run(config.bin.systemctl, ['stop', svc.serviceName]);
    await run(config.bin.systemctl, ['disable', svc.serviceName]);

    // Remove unit file
    const unitPath = `/etc/systemd/system/${svc.serviceName}.service`;
    if (existsSync(unitPath)) unlinkSync(unitPath);
    await run(config.bin.systemctl, ['daemon-reload']);

    // Remove service directory
    await shell(`rm -rf ${svc.serviceDir}`);

    // Remove from records
    services.splice(idx, 1);
    savePyServices(services);

    return { success: true };
  });
}
