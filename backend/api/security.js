// ─────────────────────────────────────────────────────────────
// DEOLS Security API — Fail2ban, Anti-Attack Mode, Hardening
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { shell, run } from '../utils/shell.js';

const SECURITY_STATE_FILE = join(config.dataDir, 'security-state.json');

function loadSecurityState() {
  if (!existsSync(SECURITY_STATE_FILE)) {
    return { antiAttackMode: false, enabledAt: null };
  }
  return JSON.parse(readFileSync(SECURITY_STATE_FILE, 'utf-8'));
}

function saveSecurityState(state) {
  writeFileSync(SECURITY_STATE_FILE, JSON.stringify(state, null, 2));
}

export default async function securityRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  // ─── Security Overview ────────────────────────────────
  app.get('/status', async () => {
    const state = loadSecurityState();

    const f2bStatus = await run(config.bin.fail2ban, ['status']);
    const ufwStatus = await run(config.bin.ufw, ['status']);

    return {
      antiAttackMode: state.antiAttackMode,
      fail2ban: {
        active: !f2bStatus.stderr.includes('not running'),
        output: f2bStatus.stdout,
      },
      firewall: {
        output: ufwStatus.stdout,
      },
    };
  });

  // ─── Fail2ban Status ──────────────────────────────────
  app.get('/fail2ban', async () => {
    const status = await run(config.bin.fail2ban, ['status']);
    return { output: status.stdout };
  });

  // ─── Fail2ban Jail Status ─────────────────────────────
  app.get('/fail2ban/:jail', async (request) => {
    const { jail } = request.params;
    const result = await run(config.bin.fail2ban, ['status', jail]);
    return { jail, output: result.stdout };
  });

  // ─── Fail2ban Unban IP ────────────────────────────────
  app.post('/fail2ban/unban', async (request, reply) => {
    const { ip, jail } = request.body || {};
    if (!ip) return reply.code(400).send({ error: 'IP address required' });

    const args = jail
      ? ['set', jail, 'unbanip', ip]
      : ['unban', ip];

    const result = await run(config.bin.fail2ban, args);
    return { success: result.code === 0, output: result.stdout || result.stderr };
  });

  // ─── Setup Fail2ban for WordPress ─────────────────────
  app.post('/fail2ban/setup-wordpress', async () => {
    // Create WordPress login filter
    const wpFilter = `[Definition]
failregex = ^<HOST> .* "POST /wp-login.php
            ^<HOST> .* "POST /xmlrpc.php
ignoreregex =
`;
    writeFileSync('/etc/fail2ban/filter.d/wordpress.conf', wpFilter);

    // Create WordPress jail
    const wpJail = `[wordpress]
enabled = true
port = http,https
filter = wordpress
logpath = /var/www/*/logs/access.log
maxretry = 5
bantime = 3600
findtime = 600

[wordpress-xmlrpc]
enabled = true
port = http,https
filter = wordpress
logpath = /var/www/*/logs/access.log
maxretry = 2
bantime = 86400
findtime = 600
`;
    writeFileSync('/etc/fail2ban/jail.d/wordpress.conf', wpJail);

    // SSH jail
    const sshJail = `[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
findtime = 600
`;
    writeFileSync('/etc/fail2ban/jail.d/sshd.conf', sshJail);

    await run(config.bin.systemctl, ['restart', 'fail2ban']);

    return { success: true, message: 'Fail2ban configured for WordPress, XMLRPC, and SSH' };
  });

  // ─── EMERGENCY Anti-Attack Toggle ─────────────────────
  app.post('/anti-attack', async (request, reply) => {
    const { enable } = request.body || {};
    const state = loadSecurityState();

    if (enable) {
      // ── ACTIVATE ANTI-ATTACK MODE ──

      // 1. Block XMLRPC globally
      await shell(
        `find /var/www -name ".htaccess" -exec sh -c 'echo "\\n# DEOLS Anti-Attack\\n<Files xmlrpc.php>\\nOrder Deny,Allow\\nDeny from all\\n</Files>" >> {}' \\;`
      );

      // 2. Enable aggressive rate limiting in OLS
      const olsConf = join(config.olsRoot, 'conf', 'httpd_config.conf');
      if (existsSync(olsConf)) {
        let content = readFileSync(olsConf, 'utf-8');
        if (!content.includes('# DEOLS_ANTI_ATTACK')) {
          content += `
# DEOLS_ANTI_ATTACK
perClientConnLimit       10
staticReqPerSec          50
dynReqPerSec             10
outBandwidth             0
inBandwidth              0
`;
          writeFileSync(olsConf, content);
        }
      }

      // 3. Tighten Fail2ban
      const aggressiveJail = `# DEOLS_ANTI_ATTACK
[wordpress-emergency]
enabled = true
port = http,https
filter = wordpress
logpath = /var/www/*/logs/access.log
maxretry = 2
bantime = 86400
findtime = 300
`;
      writeFileSync('/etc/fail2ban/jail.d/emergency.conf', aggressiveJail);
      await run(config.bin.systemctl, ['restart', 'fail2ban']);

      // 4. Tighten UFW — drop everything except essentials
      await run(config.bin.ufw, ['default', 'deny', 'incoming']);
      await run(config.bin.ufw, ['allow', '22/tcp']);
      await run(config.bin.ufw, ['allow', '80/tcp']);
      await run(config.bin.ufw, ['allow', '443/tcp']);
      await run(config.bin.ufw, ['allow', String(config.port) + '/tcp']);

      // 5. Restart OLS to apply
      await run(config.bin.lswsctrl, ['restart']);

      state.antiAttackMode = true;
      state.enabledAt = new Date().toISOString();
      saveSecurityState(state);

      return {
        success: true,
        message: 'ANTI-ATTACK MODE ACTIVATED — XMLRPC blocked, rate limits enforced, fail2ban tightened',
      };
    } else {
      // ── DEACTIVATE ANTI-ATTACK MODE ──

      // 1. Remove XMLRPC blocks
      await shell(
        `find /var/www -name ".htaccess" -exec sed -i '/# DEOLS Anti-Attack/,/\\/Files>/d' {} \\;`
      );

      // 2. Remove aggressive OLS config
      const olsConf = join(config.olsRoot, 'conf', 'httpd_config.conf');
      if (existsSync(olsConf)) {
        let content = readFileSync(olsConf, 'utf-8');
        content = content.replace(/\n# DEOLS_ANTI_ATTACK[\s\S]*?inBandwidth\s+\d+\n?/, '\n');
        writeFileSync(olsConf, content);
      }

      // 3. Remove emergency jail
      if (existsSync('/etc/fail2ban/jail.d/emergency.conf')) {
        await shell('rm -f /etc/fail2ban/jail.d/emergency.conf');
        await run(config.bin.systemctl, ['restart', 'fail2ban']);
      }

      // 4. Restart OLS
      await run(config.bin.lswsctrl, ['restart']);

      state.antiAttackMode = false;
      state.disabledAt = new Date().toISOString();
      saveSecurityState(state);

      return { success: true, message: 'Anti-attack mode deactivated' };
    }
  });

  // ─── Harden Server ────────────────────────────────────
  app.post('/harden', async () => {
    const actions = [];

    // 1. Disable root password login (SSH key only)
    const sshdConf = '/etc/ssh/sshd_config';
    if (existsSync(sshdConf)) {
      let sshConfig = readFileSync(sshdConf, 'utf-8');
      sshConfig = sshConfig.replace(/#?PasswordAuthentication\s+yes/, 'PasswordAuthentication no');
      sshConfig = sshConfig.replace(/#?PermitRootLogin\s+yes/, 'PermitRootLogin prohibit-password');
      writeFileSync(sshdConf, sshConfig);
      await run(config.bin.systemctl, ['restart', 'sshd']);
      actions.push('SSH: Disabled password auth, root login restricted to key-only');
    }

    // 2. Install and configure Fail2ban if not present
    const f2bCheck = await run(config.bin.systemctl, ['is-active', 'fail2ban']);
    if (f2bCheck.stdout !== 'active') {
      await shell('apt-get install -y fail2ban && systemctl enable fail2ban && systemctl start fail2ban', {
        timeout: 120_000,
      });
      actions.push('Fail2ban: Installed and enabled');
    }

    // 3. Enable UFW with defaults
    await run(config.bin.ufw, ['default', 'deny', 'incoming']);
    await run(config.bin.ufw, ['default', 'allow', 'outgoing']);
    await run(config.bin.ufw, ['allow', '22/tcp']);
    await run(config.bin.ufw, ['allow', '80/tcp']);
    await run(config.bin.ufw, ['allow', '443/tcp']);
    await run(config.bin.ufw, ['allow', String(config.port) + '/tcp']);
    await shell(`echo "y" | ${config.bin.ufw} enable`);
    actions.push('UFW: Enabled with default deny, essential ports allowed');

    // 4. Disable unused services
    const unused = ['avahi-daemon', 'cups', 'bluetooth'];
    for (const svc of unused) {
      const check = await run(config.bin.systemctl, ['is-active', svc]);
      if (check.stdout === 'active') {
        await run(config.bin.systemctl, ['stop', svc]);
        await run(config.bin.systemctl, ['disable', svc]);
        actions.push(`Disabled: ${svc}`);
      }
    }

    return { success: true, actions };
  });
}
