// ─────────────────────────────────────────────────────────────
// DEOLS System API — Server Metrics & System Information
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
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

  // ─── Get Server Timezone & Clock ───────────────────────
  app.get('/timezone', async () => {
    let timezone = null;

    // 1. Check DEOLS persisted settings first
    try {
      const settingsPath = join(config.dataDir, 'settings.json');
      if (existsSync(settingsPath)) {
        const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        if (settings.timezone) timezone = settings.timezone;
      }
    } catch {}

    // 2. Query timedatectl
    if (!timezone) {
      try {
        const res = await shell('timedatectl show -p Timezone --value 2>/dev/null');
        if (res.code === 0 && res.stdout.trim()) {
          timezone = res.stdout.trim();
        }
      } catch {}
    }

    // 3. Check /etc/localtime symlink target (standard Linux)
    if (!timezone) {
      try {
        const linkRes = await shell('readlink -f /etc/localtime 2>/dev/null');
        if (linkRes.stdout && linkRes.stdout.includes('zoneinfo/')) {
          timezone = linkRes.stdout.split('zoneinfo/')[1].trim();
        }
      } catch {}
    }

    // 4. Check /etc/timezone file if present
    if (!timezone && existsSync('/etc/timezone')) {
      try {
        const content = readFileSync('/etc/timezone', 'utf-8').trim();
        if (content) timezone = content;
      } catch {}
    }

    // 5. Fallback
    if (!timezone) {
      timezone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    }

    // Ensure Node process environment matches
    process.env.TZ = timezone;

    const now = new Date();
    let formatted = '';
    try {
      formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now);
    } catch {
      formatted = now.toISOString();
    }

    return {
      timezone,
      currentTime: now.toISOString(),
      formatted,
      timestamp: now.getTime(),
    };
  });

  // ─── Set Server Timezone ───────────────────────────────
  app.post('/timezone', async (request, reply) => {
    const { timezone } = request.body || {};
    if (!timezone || typeof timezone !== 'string') {
      return reply.code(400).send({ error: 'Timezone string is required (e.g. UTC, Asia/Kolkata)' });
    }

    const cleanTz = timezone.trim();
    // Validate IANA timezone
    try {
      Intl.DateTimeFormat(undefined, { timeZone: cleanTz });
    } catch {
      return reply.code(400).send({ error: `Invalid timezone identifier: '${cleanTz}'` });
    }

    let details = [];

    // 1. Update systemd timedatectl
    try {
      const timedateRes = await shell(`timedatectl set-timezone "${cleanTz}" 2>&1`);
      if (timedateRes.code === 0) details.push('timedatectl');
    } catch {}

    // 2. Always sync /etc/localtime symlink
    try {
      await shell(`ln -sf "/usr/share/zoneinfo/${cleanTz}" /etc/localtime 2>/dev/null || true`);
      details.push('/etc/localtime');
    } catch {}

    // 3. Always update /etc/timezone so legacy tools see it
    try {
      await shell(`echo "${cleanTz}" > /etc/timezone 2>/dev/null || true`);
      details.push('/etc/timezone');
    } catch {}

    // 4. Update Node.js process runtime timezone environment variable immediately
    process.env.TZ = cleanTz;

    // 5. Persist to DEOLS settings
    try {
      const settingsPath = join(config.dataDir, 'settings.json');
      let settings = {};
      if (existsSync(settingsPath)) {
        try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch {}
      }
      settings.timezone = cleanTz;
      settings.updatedAt = new Date().toISOString();
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), { mode: 0o600 });
    } catch {}

    const now = new Date();
    let formatted = '';
    try {
      formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: cleanTz,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now);
    } catch {
      formatted = now.toISOString();
    }

    return {
      success: true,
      message: `Server timezone successfully updated to ${cleanTz}`,
      timezone: cleanTz,
      formatted,
      currentTime: now.toISOString(),
      timestamp: now.getTime(),
      details: details.join(', '),
      requiresRestart: true,
    };
  });

  // ─── Reload Server / Panel Daemon ─────────────────────
  const handleSystemReload = async (request, reply) => {
    setTimeout(async () => {
      await shell('systemctl reload-or-restart deols 2>/dev/null || systemctl restart deols 2>/dev/null || true');
    }, 500);

    return {
      success: true,
      message: 'Server daemon reload signal dispatched successfully',
      timestamp: new Date().toISOString(),
    };
  };

  app.post('/reload', handleSystemReload);
  app.get('/reload', handleSystemReload);
}
