// ─────────────────────────────────────────────────────────────
// DEOLS System API — Server Metrics & System Information
// ─────────────────────────────────────────────────────────────

import { shell } from '../utils/shell.js';

export default async function systemRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  // ─── System Overview ──────────────────────────────────
  app.get('/overview', async () => {
    const si = await import('systeminformation');

    const [cpu, mem, disk, os, time, load, net] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
      si.time(),
      si.currentLoad(),
      si.networkInterfaces(),
    ]);

    return {
      hostname: os.hostname,
      os: `${os.distro} ${os.release}`,
      kernel: os.kernel,
      arch: os.arch,
      uptime: time.uptime,
      cpu: {
        model: `${cpu.manufacturer} ${cpu.brand}`,
        cores: cpu.cores,
        speed: cpu.speed,
        load: Math.round(load.currentLoad * 100) / 100,
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        usedPercent: Math.round((mem.used / mem.total) * 100),
      },
      disk: disk
        .filter((d) => d.mount === '/' || d.mount.startsWith('/var'))
        .map((d) => ({
          mount: d.mount,
          type: d.type,
          size: d.size,
          used: d.used,
          available: d.available,
          usedPercent: Math.round(d.use),
        })),
      network: net
        .filter((n) => n.operstate === 'up')
        .map((n) => ({
          iface: n.iface,
          ip4: n.ip4,
          ip6: n.ip6,
          mac: n.mac,
          speed: n.speed,
        })),
    };
  });

  // ─── Real-time CPU/Memory (lightweight poll) ──────────
  app.get('/stats', async () => {
    const si = await import('systeminformation');
    const [load, mem] = await Promise.all([si.currentLoad(), si.mem()]);

    return {
      cpu: Math.round(load.currentLoad * 100) / 100,
      memory: {
        used: mem.used,
        total: mem.total,
        percent: Math.round((mem.used / mem.total) * 100),
      },
      timestamp: Date.now(),
    };
  });

  // ─── Process List ─────────────────────────────────────
  app.get('/processes', async () => {
    const si = await import('systeminformation');
    const procs = await si.processes();

    return {
      total: procs.all,
      running: procs.running,
      sleeping: procs.sleeping,
      top: procs.list
        .sort((a, b) => b.cpu - a.cpu)
        .slice(0, 25)
        .map((p) => ({
          pid: p.pid,
          name: p.name,
          cpu: p.cpu,
          mem: p.mem,
          user: p.user,
          started: p.started,
          command: p.command?.substring(0, 120),
        })),
    };
  });

  // ─── OLS Status ───────────────────────────────────────
  app.get('/ols', async () => {
    const status = await shell('/usr/local/lsws/bin/lswsctrl status');
    const version = await shell('/usr/local/lsws/bin/lshttpd -v 2>&1 || echo "unknown"');

    return {
      status: status.stdout,
      version: version.stdout,
      running: status.stdout.includes('running'),
    };
  });

  // ─── Server Reboot ────────────────────────────────────
  app.post('/reboot', async (request, reply) => {
    const { confirm } = request.body || {};
    if (confirm !== 'REBOOT') {
      return reply.code(400).send({ error: 'Send { confirm: "REBOOT" } to confirm' });
    }

    // Schedule reboot in 5 seconds to allow response
    shell('shutdown -r +0 "DEOLS Panel initiated reboot"');
    return { success: true, message: 'Server rebooting in 5 seconds' };
  });
}
