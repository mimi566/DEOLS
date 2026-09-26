// ─────────────────────────────────────────────────────────────
// DEOLS Multi-Tenant User Isolation & Resource Quota Service
// cgroups v2 + Systemd Service Slices + Linux ext4 Quotas
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { config } from '../config.js';
import { shell, run, sanitizeDomain } from '../utils/shell.js';

const SLICES_DIR = process.platform === 'linux' ? '/etc/systemd/system' : join(config.dataDir, 'systemd-slices');

/**
 * Generate a canonical POSIX system username for a site domain
 * Format: u_{domain_prefix} (max 14 chars, alphanumeric + underscore)
 */
export function generateSystemUsername(domain) {
  const clean = sanitizeDomain(domain).replace(/[^a-z0-9]/g, '_');
  return ('u_' + clean).substring(0, 14);
}

/**
 * Ensure an isolated, non-privileged system user exists for the site
 */
export async function ensureSystemUser(username, domain) {
  if (process.platform !== 'linux') {
    return { success: true, username, simulated: true };
  }

  const cleanUser = username.replace(/[^a-z0-9_-]/gi, '');
  const siteDir = join(config.webRoot, domain);

  try {
    // 1. Check if user already exists
    const checkRes = await shell(`id -u "${cleanUser}" 2>/dev/null`);
    if (checkRes.code !== 0) {
      // Create system user with nologin shell and primary/supplementary group www-data
      await shell(
        `useradd -r -s /usr/sbin/nologin -d "${siteDir}" -g www-data -M "${cleanUser}" 2>/dev/null || ` +
        `useradd -s /usr/sbin/nologin -d "${siteDir}" -g www-data -M "${cleanUser}" 2>/dev/null || true`
      );
    }

    // Ensure user is in www-data group for web server communication
    await shell(`usermod -a -G www-data "${cleanUser}" 2>/dev/null || true`);

    return { success: true, username: cleanUser };
  } catch (err) {
    return { success: false, error: err.message, username: cleanUser };
  }
}

/**
 * Enforce strict POSIX permissions and ownership on site directory
 */
export async function enforceDirectorySecurity(domain, username) {
  const siteDir = join(config.webRoot, domain);
  const docRoot = join(siteDir, 'public_html');
  const logsDir = join(siteDir, 'logs');

  if (!existsSync(siteDir)) return;

  if (process.platform === 'linux') {
    try {
      const cleanUser = username.replace(/[^a-z0-9_-]/gi, '');
      // 1. Set base directory ownership to {user}:www-data
      await shell(`chown -R ${cleanUser}:www-data "${siteDir}" 2>/dev/null || true`);
      // 2. Set directory permissions to 750 (Owner full, Group read/exec, World none)
      await shell(`chmod 750 "${siteDir}" 2>/dev/null || true`);
      // 3. Document root permissions
      if (existsSync(docRoot)) {
        await shell(`find "${docRoot}" -type d -exec chmod 755 {} \\; 2>/dev/null || true`);
        await shell(`find "${docRoot}" -type f -exec chmod 644 {} \\; 2>/dev/null || true`);
      }
      // 4. Logs directory permissions
      if (existsSync(logsDir)) {
        await shell(`chmod 775 "${logsDir}" 2>/dev/null || true`);
      }
    } catch {}
  }
}

/**
 * Generate or update a dedicated Systemd Slice for cgroups v2 resource limits
 * (CPU hard quota, MemoryHigh soft limit, MemoryMax hard limit, TasksMax)
 */
export async function createOrUpdateSystemdSlice(username, limits = {}) {
  const cleanUser = username.replace(/[^a-z0-9_-]/gi, '');
  if (!existsSync(SLICES_DIR)) {
    mkdirSync(SLICES_DIR, { recursive: true });
  }

  const cpuPercent = Math.max(10, Math.min(400, parseInt(limits.cpuPercent || limits.cpu_percent || 100, 10)));
  const ramMb = Math.max(128, Math.min(65536, parseInt(limits.ramMb || limits.ram_mb || 512, 10)));
  const ramMaxMb = Math.max(ramMb, Math.min(65536, parseInt(limits.ramMaxMb || limits.ram_max_mb || Math.round(ramMb * 1.25), 10)));
  const tasksMax = Math.max(20, Math.min(1000, parseInt(limits.tasksMax || limits.tasks_max || 150, 10)));

  const slicePath = join(SLICES_DIR, `deols-user-${cleanUser}.slice`);
  const sliceContent = `# ─────────────────────────────────────────────────────────────
# DEOLS Multi-Tenant Resource Isolation Slice
# Target User: ${cleanUser} | Updated: ${new Date().toISOString()}
# ─────────────────────────────────────────────────────────────

[Unit]
Description=DEOLS Isolated Resource Slice for ${cleanUser}
Before=slices.target

[Slice]
# CPU hard limit (${cpuPercent}% = ${(cpuPercent / 100).toFixed(1)} CPU cores)
CPUQuota=${cpuPercent}%

# RAM Soft Limit (triggers page cache reclaim)
MemoryHigh=${ramMb}M

# RAM Hard Limit (OOM-killer boundary isolated to user tree)
MemoryMax=${ramMaxMb}M

# Process limit (anti-fork bomb guardrail)
TasksMax=${tasksMax}
`;

  writeFileSync(slicePath, sliceContent, 'utf-8');

  if (process.platform === 'linux') {
    try {
      await shell('systemctl daemon-reload 2>/dev/null || true');
    } catch {}
  }

  return {
    slicePath,
    cpuPercent,
    ramMb,
    ramMaxMb,
    tasksMax,
  };
}

/**
 * Apply Linux filesystem disk quota boundaries (soft limit at 90%, hard limit at 100%)
 */
export async function applyDiskQuota(username, diskMb) {
  const cleanUser = username.replace(/[^a-z0-9_-]/gi, '');
  const limitMb = Math.max(256, parseInt(diskMb, 10) || 5000);
  const hardLimitKb = Math.round(limitMb * 1024);
  const softLimitKb = Math.round(hardLimitKb * 0.9);

  if (process.platform === 'linux') {
    try {
      // Check if setquota is installed
      const whichRes = await shell('which setquota 2>/dev/null');
      if (whichRes.code === 0 && whichRes.stdout.trim()) {
        await shell(`setquota -u ${cleanUser} ${softLimitKb} ${hardLimitKb} 0 0 / 2>/dev/null || setquota -u ${cleanUser} ${softLimitKb} ${hardLimitKb} 0 0 /var 2>/dev/null || true`);
        return { success: true, softLimitKb, hardLimitKb, limitMb };
      }
    } catch {}
  }

  return { success: true, softLimitKb, hardLimitKb, limitMb, simulated: process.platform !== 'linux' };
}

/**
 * Check if Linux filesystem quotas are enabled on the host system
 */
export async function getSystemQuotaStatus() {
  let toolInstalled = false;
  let fstabConfigured = false;
  let quotaEnabled = false;
  let details = 'Quotas not supported on current platform';

  if (process.platform === 'linux') {
    try {
      // 1. Check tools
      const toolRes = await shell('which setquota 2>/dev/null');
      toolInstalled = toolRes.code === 0 && Boolean(toolRes.stdout.trim());

      // 2. Check /etc/fstab for quota options
      if (existsSync('/etc/fstab')) {
        const fstab = readFileSync('/etc/fstab', 'utf-8');
        fstabConfigured = /usrjquota|grpjquota|usrquota|grpquota|quota/i.test(fstab);
      }

      // 3. Check live mount options or repquota
      const mountRes = await shell('cat /proc/mounts 2>/dev/null');
      if (mountRes.stdout && /usrjquota|usrquota|quota/i.test(mountRes.stdout)) {
        quotaEnabled = true;
      } else {
        const repRes = await shell('repquota -u / 2>&1');
        if (repRes.code === 0) quotaEnabled = true;
      }

      if (quotaEnabled) {
        details = 'Linux ext4 filesystem quotas active and operational';
      } else if (toolInstalled && fstabConfigured) {
        details = 'Quota tools and /etc/fstab configured; remount or reboot needed to activate';
      } else if (toolInstalled) {
        details = 'Quota tools installed; /etc/fstab requires quota mount flags';
      } else {
        details = 'Quota packages (quota, quotatool) not yet installed';
      }
    } catch (err) {
      details = `Error checking quota: ${err.message}`;
    }
  }

  return {
    quotaEnabled,
    quota_enabled: quotaEnabled,
    toolInstalled,
    tool_installed: toolInstalled,
    fstabConfigured,
    fstab_configured: fstabConfigured,
    details,
  };
}

/**
 * Enable filesystem quotas automatically on Debian 12
 */
export async function enableSystemQuotas() {
  if (process.platform !== 'linux') {
    return { success: false, error: 'Quotas can only be enabled on Linux' };
  }

  try {
    // 1. Install quota packages if missing
    await shell('apt-get update -qq && apt-get install -y -qq quota quotatool 2>/dev/null || true');

    // 2. Add quota options to /etc/fstab for root filesystem if missing
    if (existsSync('/etc/fstab')) {
      let fstab = readFileSync('/etc/fstab', 'utf-8');
      if (!/usrjquota|usrquota/i.test(fstab)) {
        // Look for the root partition line
        const lines = fstab.split('\n');
        const updatedLines = lines.map((line) => {
          if (line.trim().startsWith('#') || !line.trim()) return line;
          const parts = line.trim().split(/\s+/);
          if (parts[1] === '/' && (parts[2] === 'ext4' || parts[2] === 'ext3')) {
            const opts = parts[3] || 'defaults';
            if (!opts.includes('usrjquota')) {
              parts[3] = `${opts},usrjquota=aquota.user,grpjquota=aquota.group,jqfmt=vfsv1`;
              return parts.join('\t');
            }
          }
          return line;
        });
        writeFileSync('/etc/fstab', updatedLines.join('\n'));
      }
    }

    // 3. Remount root filesystem
    await shell('mount -o remount / 2>/dev/null || true');

    // 4. Create and turn on quotas
    await shell('quotacheck -cum / 2>/dev/null || true');
    await shell('quotaon -uv / 2>/dev/null || true');

    const status = await getSystemQuotaStatus();
    return {
      success: true,
      message: 'Linux ext4 filesystem quotas initialized successfully',
      status,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get real-time resource utilization for a user (CPU, RAM, Disk, Tasks)
 */
export async function getRealTimeUserMetrics(username, domain) {
  const cleanUser = username ? username.replace(/[^a-z0-9_-]/gi, '') : generateSystemUsername(domain);
  const siteDir = join(config.webRoot, domain);

  let cpuPercent = 0;
  let ramUsedBytes = 0;
  let ramMb = 0;
  let activeTasks = 0;
  let diskUsedBytes = 0;
  let diskMb = 0;

  if (process.platform === 'linux') {
    // 1. Read cgroups v2 memory & tasks if slice exists
    const sliceCgroupDir = `/sys/fs/cgroup/deols-user-${cleanUser}.slice`;
    if (existsSync(sliceCgroupDir)) {
      try {
        const memCurFile = join(sliceCgroupDir, 'memory.current');
        if (existsSync(memCurFile)) {
          const rawMem = parseInt(readFileSync(memCurFile, 'utf-8').trim(), 10);
          if (!isNaN(rawMem)) {
            ramUsedBytes = rawMem;
            ramMb = Math.round(rawMem / (1024 * 1024));
          }
        }

        const pidsCurFile = join(sliceCgroupDir, 'pids.current');
        if (existsSync(pidsCurFile)) {
          const rawPids = parseInt(readFileSync(pidsCurFile, 'utf-8').trim(), 10);
          if (!isNaN(rawPids)) activeTasks = rawPids;
        }
      } catch {}
    }

    // 2. Fallback process inspection if cgroup memory was 0
    if (ramUsedBytes === 0) {
      try {
        const psRes = await shell(`ps -u "${cleanUser}" -o %cpu,rss --no-headers 2>/dev/null`);
        if (psRes.stdout) {
          const lines = psRes.stdout.trim().split('\n');
          activeTasks = lines.length;
          let totalCpu = 0;
          let totalRssKb = 0;
          for (const l of lines) {
            const parts = l.trim().split(/\s+/);
            if (parts[0]) totalCpu += parseFloat(parts[0]) || 0;
            if (parts[1]) totalRssKb += parseInt(parts[1], 10) || 0;
          }
          cpuPercent = parseFloat(totalCpu.toFixed(1));
          ramUsedBytes = totalRssKb * 1024;
          ramMb = Math.round(totalRssKb / 1024);
        }
      } catch {}
    }

    // 3. Read disk usage via quota or du
    try {
      const quotaRes = await shell(`quota -u "${cleanUser}" -w -p 2>/dev/null`);
      if (quotaRes.stdout && quotaRes.stdout.includes('/')) {
        const lines = quotaRes.stdout.trim().split('\n');
        for (const l of lines) {
          if (l.includes('/')) {
            const parts = l.trim().split(/\s+/);
            const blocksKb = parseInt(parts[1], 10);
            if (!isNaN(blocksKb)) {
              diskUsedBytes = blocksKb * 1024;
              diskMb = Math.round(blocksKb / 1024);
              break;
            }
          }
        }
      }
    } catch {}

    // Fallback disk usage via du
    if (diskUsedBytes === 0 && existsSync(siteDir)) {
      try {
        const duRes = await shell(`du -sm "${siteDir}" 2>/dev/null`);
        if (duRes.stdout) {
          const mb = parseInt(duRes.stdout.trim().split(/\s+/)[0], 10);
          if (!isNaN(mb)) {
            diskMb = mb;
            diskUsedBytes = mb * 1024 * 1024;
          }
        }
      } catch {}
    }
  } else {
    // Windows/dev mock metrics
    cpuPercent = 1.8;
    ramMb = 42;
    ramUsedBytes = 42 * 1024 * 1024;
    diskMb = 185;
    diskUsedBytes = 185 * 1024 * 1024;
    activeTasks = 3;
  }

  return {
    cpuPercent,
    ramMb,
    ramUsedBytes,
    diskMb,
    diskUsedBytes,
    activeTasks,
  };
}
