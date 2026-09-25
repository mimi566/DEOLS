// ─────────────────────────────────────────────────────────────
// DEOLS OpenLiteSpeed (OLS) Management & WebAdmin API
// CyberPanel-like OLS Engine Control & WebAdmin Integration
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { shell, run } from '../utils/shell.js';
import { config } from '../config.js';

export default async function olsRoutes(app) {
  // All OLS routes require panel authentication
  app.addHook('preHandler', app.authenticate);

  // ─── OLS Status & WebAdmin Info ──────────────────────────
  app.get('/status', async (request, reply) => {
    const olsRoot = config.olsRoot || '/usr/local/lsws';
    const lswsctrl = config.bin.lswsctrl || join(olsRoot, 'bin', 'lswsctrl');
    const lshttpd = join(olsRoot, 'bin', 'lshttpd');

    // 1. Service Status
    let isActive = false;
    let serviceStatusText = 'inactive';
    try {
      const res = await shell('systemctl is-active lsws 2>/dev/null');
      isActive = res.stdout.trim() === 'active';
      serviceStatusText = res.stdout.trim() || 'inactive';
    } catch {}

    // 2. OLS Version
    let version = 'Unknown';
    if (existsSync(lshttpd)) {
      try {
        const vRes = await shell(`"${lshttpd}" -v 2>&1 | head -n 1`);
        const match = vRes.stdout.match(/OpenLiteSpeed\/([0-9.]+)/i) || vRes.stdout.match(/LiteSpeed\/([0-9.]+)/i);
        if (match) version = match[1];
      } catch {}
    }

    // 3. WebAdmin Port
    let adminPort = 7080;
    const adminConf = join(olsRoot, 'admin', 'conf', 'admin_config.conf');
    if (existsSync(adminConf)) {
      try {
        const confText = readFileSync(adminConf, 'utf-8');
        const portMatch = confText.match(/address\s+[*0-9.:]*:(\d+)/i);
        if (portMatch) adminPort = parseInt(portMatch[1], 10);
      } catch {}
    }

    // 4. Memory & Process stats
    let pid = null;
    let memoryMB = 0;
    let uptime = 'N/A';
    try {
      const pidRes = await shell('pgrep -o lshttpd 2>/dev/null');
      if (pidRes.stdout) {
        pid = parseInt(pidRes.stdout.split('\n')[0], 10);
        const memRes = await shell(`ps -p ${pid} -o rss=,etime= 2>/dev/null`);
        const parts = memRes.stdout.trim().split(/\s+/);
        if (parts[0]) memoryMB = Math.round(parseInt(parts[0], 10) / 1024);
        if (parts[1]) uptime = parts[1];
      }
    } catch {}

    // Host determination for WebAdmin URL
    const clientHost = request.headers.host ? request.headers.host.split(':')[0] : 'localhost';
    const adminUrl = `https://${clientHost}:${adminPort}`;

    return {
      active: isActive,
      status: serviceStatusText,
      version,
      adminPort,
      adminUrl,
      adminConfigExists: existsSync(adminConf),
      htpasswdExists: existsSync(join(olsRoot, 'admin', 'conf', 'htpasswd')),
      pid,
      memoryMB,
      uptime,
      installed: existsSync(lswsctrl),
      olsRoot,
    };
  });

  // ─── Restart OpenLiteSpeed ──────────────────────────────
  app.post('/restart', async (request, reply) => {
    const olsRoot = config.olsRoot || '/usr/local/lsws';
    const lswsctrl = config.bin.lswsctrl || join(olsRoot, 'bin', 'lswsctrl');

    let result;
    if (existsSync(lswsctrl)) {
      result = await shell(`"${lswsctrl}" restart`);
    } else {
      result = await shell('systemctl restart lsws');
    }

    if (result.code !== 0) {
      return reply.code(500).send({
        error: 'Failed to restart OpenLiteSpeed',
        details: result.stderr || result.stdout,
      });
    }

    return {
      success: true,
      message: 'OpenLiteSpeed gracefully restarted',
      output: result.stdout,
    };
  });

  // ─── Reload Config (Zero-Downtime) ──────────────────────
  app.post('/reload', async (request, reply) => {
    const olsRoot = config.olsRoot || '/usr/local/lsws';
    const lswsctrl = config.bin.lswsctrl || join(olsRoot, 'bin', 'lswsctrl');

    let result;
    if (existsSync(lswsctrl)) {
      result = await shell(`"${lswsctrl}" reload`);
    } else {
      result = await shell('systemctl reload lsws 2>/dev/null || systemctl restart lsws');
    }

    return {
      success: result.code === 0,
      message: result.code === 0 ? 'OpenLiteSpeed configuration reloaded' : 'Reload returned non-zero code',
      output: result.stdout || result.stderr,
    };
  });

  // ─── Change OLS WebAdmin Password ────────────────────────
  app.post('/password', async (request, reply) => {
    const { password } = request.body || {};
    if (!password || password.length < 6) {
      return reply.code(400).send({ error: 'Password must be at least 6 characters' });
    }

    const olsRoot = config.olsRoot || '/usr/local/lsws';
    const admpassScript = join(olsRoot, 'admin', 'misc', 'admpass.sh');
    const htpasswdFile = join(olsRoot, 'admin', 'conf', 'htpasswd');
    const username = 'admin';

    let success = false;
    let method = 'none';

    // Try admpass.sh script
    if (existsSync(admpassScript)) {
      try {
        const res = await shell(
          `printf "%s\\n%s\\n%s\\n" "${username}" "${password}" "${password}" | "${admpassScript}"`
        );
        if (res.code === 0) {
          success = true;
          method = 'admpass.sh';
        }
      } catch {}
    }

    // Fallback: openssl MD5 / crypt
    if (!success) {
      try {
        const hashRes = await shell(`openssl passwd -1 "${password}"`);
        const hash = hashRes.stdout.trim();
        if (hash) {
          const dir = dirname(htpasswdFile);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(htpasswdFile, `${username}:${hash}\n`, { mode: 0o600 });
          success = true;
          method = 'openssl-htpasswd';
        }
      } catch (err) {
        return reply.code(500).send({ error: `Failed to set OLS password: ${err.message}` });
      }
    }

    if (!success) {
      return reply.code(500).send({ error: 'Failed to update OLS WebAdmin password' });
    }

    // Gracefully restart OLS to apply htpasswd update
    const lswsctrl = config.bin.lswsctrl || join(olsRoot, 'bin', 'lswsctrl');
    if (existsSync(lswsctrl)) {
      await shell(`"${lswsctrl}" restart 2>/dev/null || true`);
    }

    return {
      success: true,
      message: 'OLS WebAdmin password successfully updated for user: admin',
      method,
    };
  });
}
