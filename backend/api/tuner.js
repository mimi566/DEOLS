// ─────────────────────────────────────────────────────────────
// DEOLS Advanced Server Auto-Tuner & Backup System API
// Dynamic Resource Optimization, OLS/MariaDB Tuning & Snapshot Engine
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { config } from '../config.js';
import { shell, run } from '../utils/shell.js';
import { ensureOlsListeners } from '../utils/ols-config.js';

const BACKUP_DIR = config.backupDir || '/var/backups/deols';
const SYSTEM_DEFAULTS_ARCHIVE = join(BACKUP_DIR, 'system_defaults.tar.gz');
const PRE_TUNING_ARCHIVE = join(BACKUP_DIR, 'pre_tuning_backup.tar.gz');
const MANIFEST_FILE = join(BACKUP_DIR, 'backup_manifest.json');
const TUNER_STATE_FILE = join(config.dataDir, 'tuner_state.json');

// Files managed and archived during tuning
const TRACKED_CONFIG_FILES = [
  join(config.olsRoot, 'conf', 'httpd_config.conf'),
  '/etc/mysql/mariadb.conf.d/50-server.cnf',
  '/etc/mysql/my.cnf',
  '/etc/redis/redis.conf',
  '/etc/sysctl.d/99-deols-tuner.conf',
];

/**
 * Load or initialize the tuner state
 */
function loadTunerState() {
  if (existsSync(TUNER_STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(TUNER_STATE_FILE, 'utf-8'));
    } catch {
      // Fall through to default
    }
  }
  return {
    enabled: false,
    currentProfile: 'native',
    enableRedis: false,
    appliedAt: null,
    allocations: null,
  };
}

/**
 * Save the tuner state persistently
 */
function saveTunerState(state) {
  if (!existsSync(config.dataDir)) mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(TUNER_STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
}

/**
 * Detect exact server hardware specifications (RAM in MB, Storage in MB, vCPUs)
 */
async function getHardwareSpecs() {
  let totalRamMb = Math.round(os.totalmem() / (1024 * 1024));
  let cpuCores = os.cpus()?.length || 1;
  let cpuModel = os.cpus()?.[0]?.model || 'Standard Server Processor';
  let diskTotalMb = 0;
  let diskFreeMb = 0;
  let activeSwapMb = 0;
  let swapFileExists = existsSync('/swapfile');

  if (process.platform === 'linux') {
    // 1. Precise RAM in MB matching `free -m`
    try {
      const ramRes = await shell(`free -m | awk '/Mem:/ {print $2}'`);
      if (ramRes.stdout && !isNaN(parseInt(ramRes.stdout, 10))) {
        totalRamMb = parseInt(ramRes.stdout.trim(), 10);
      }
    } catch {}

    // 2. Precise vCPU cores matching `nproc`
    try {
      const cpuRes = await shell('nproc');
      if (cpuRes.stdout && !isNaN(parseInt(cpuRes.stdout, 10))) {
        cpuCores = parseInt(cpuRes.stdout.trim(), 10);
      }
    } catch {}

    // 3. Precise Disk Space in MB matching `df -m /`
    try {
      const dfRes = await shell(`df -m / | awk 'NR==2 {print $2, $4}'`);
      if (dfRes.stdout) {
        const parts = dfRes.stdout.trim().split(/\s+/);
        if (parts[0] && !isNaN(parseInt(parts[0], 10))) diskTotalMb = parseInt(parts[0], 10);
        if (parts[1] && !isNaN(parseInt(parts[1], 10))) diskFreeMb = parseInt(parts[1], 10);
      }
    } catch {}

    // 4. Precise Swap in MB matching `free -m`
    try {
      const swapRes = await shell(`free -m | awk '/Swap:/ {print $2}'`);
      if (swapRes.stdout && !isNaN(parseInt(swapRes.stdout, 10))) {
        activeSwapMb = parseInt(swapRes.stdout.trim(), 10);
      }
    } catch {}

    // 5. CPU Model from /proc/cpuinfo
    try {
      const cpuInfo = readFileSync('/proc/cpuinfo', 'utf-8');
      const modelMatch = cpuInfo.match(/model name\s*:\s*(.+)/i);
      if (modelMatch) cpuModel = modelMatch[1].trim();
    } catch {}
  } else {
    // Windows/dev mock values
    diskTotalMb = 40960;
    diskFreeMb = 28672;
    activeSwapMb = 2048;
  }

  return {
    ram: totalRamMb,
    cpu: cpuCores,
    cpuModel,
    diskTotalMb,
    diskFreeMb,
    swap: activeSwapMb,
    swapFileExists,
    rawDiagCmd: `echo "CPU Cores: $(nproc)" && echo "Total RAM: $(free -m | awk '/Mem:/ {print $2}') MB" && echo "Disk Space: $(df -m / | awk 'NR==2 {print $2}') MB"`,
  };
}

/**
 * Calculate conservative real-world resource allocation
 * @param {object} specs - { ram, cpu, swap }
 * @param {string} preset - 'conservative' | 'auto' | 'aggressive'
 * @param {boolean} enableRedis - whether to allocate RAM for Redis
 */
function calculateAllocations(specs, preset = 'auto', enableRedis = false) {
  const ramMb = specs.ram;
  const cores = specs.cpu;

  // 1. OS Base Overhead: Always reserve 250 MB
  const osOverheadMb = 250;

  // 2. MariaDB innodb_buffer_pool_size
  let dbMb = 256;
  if (ramMb <= 1024) {
    dbMb = 256;
  } else if (ramMb <= 4096) {
    if (preset === 'conservative') dbMb = Math.round(ramMb * 0.35);
    else if (preset === 'aggressive') dbMb = Math.round(ramMb * 0.45);
    else dbMb = Math.round(ramMb * 0.40); // Auto = 40%
  } else {
    // RAM > 4096 MB: 50% to 60%
    if (preset === 'conservative') dbMb = Math.round(ramMb * 0.50);
    else if (preset === 'aggressive') dbMb = Math.round(ramMb * 0.60);
    else dbMb = Math.round(ramMb * 0.55); // Auto = 55%
  }

  // 3. Redis Cache (10% of Total RAM if enabled)
  const redisMb = enableRedis ? Math.max(64, Math.round(ramMb * 0.10)) : 0;

  // 4. Safe PHP Concurrency (OpenLiteSpeed)
  let availablePhpRamMb = ramMb - (osOverheadMb + dbMb + redisMb);
  if (availablePhpRamMb < 160) availablePhpRamMb = 160;

  const rawWorkers = Math.floor(availablePhpRamMb / 45);

  // Safety Guardrails based on specs
  let maxAllowedWorkers;
  if (ramMb <= 1024 || cores <= 1) {
    maxAllowedWorkers = preset === 'conservative' ? 10 : (preset === 'aggressive' ? 12 : 11);
  } else if (ramMb <= 2048) {
    maxAllowedWorkers = preset === 'conservative' ? 20 : (preset === 'aggressive' ? 25 : 22);
  } else if (ramMb <= 4096) {
    maxAllowedWorkers = preset === 'conservative' ? 50 : (preset === 'aggressive' ? 60 : 55);
  } else {
    const coreCap = cores * (preset === 'conservative' ? 25 : (preset === 'aggressive' ? 35 : 30));
    maxAllowedWorkers = Math.min(Math.floor(ramMb / 45), coreCap);
  }

  const finalWorkers = Math.max(4, Math.min(rawWorkers, maxAllowedWorkers));

  // 5. Swap memory safety recommendation
  const recommendedSwapMb = ramMb <= 2048 ? 2048 : (ramMb <= 4096 ? 2048 : 1024);

  return {
    totalRamMb: ramMb,
    cpuCores: cores,
    osOverheadMb,
    dbMb,
    redisMb,
    availablePhpRamMb,
    phpWorkers: finalWorkers,
    maxConns: finalWorkers,
    recommendedSwapMb,
    preset,
    enableRedis,
  };
}

/**
 * Create archive backup of current configuration files
 */
async function createArchive(archivePath) {
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const existingFiles = TRACKED_CONFIG_FILES.filter((file) => existsSync(file));
  if (existingFiles.length === 0) return { success: true, files: [] };

  if (process.platform === 'linux') {
    const fileList = existingFiles.map((f) => `"${f}"`).join(' ');
    const res = await shell(`tar -czf "${archivePath}" -P ${fileList}`);
    return { success: res.code === 0, files: existingFiles, output: res.stdout || res.stderr };
  } else {
    // Dev stub
    writeFileSync(archivePath, `mock archive of: ${existingFiles.join(', ')}`);
    return { success: true, files: existingFiles };
  }
}

/**
 * Update manifest file
 */
function updateManifest(details) {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  let manifest = {};
  if (existsSync(MANIFEST_FILE)) {
    try {
      manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8'));
    } catch {}
  }
  manifest = { ...manifest, ...details, updatedAt: new Date().toISOString() };
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  return manifest;
}

export default async function tunerRoutes(app) {
  // Enforce authentication & Administrator privileges on all endpoints
  app.addHook('preHandler', async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) return;
    if (request.user?.role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden: Administrator privileges required' });
    }
  });

  // ─── 1. Get Auto-Tuner Status & Hardware Metrics ─────────
  app.get('/status', async (request, reply) => {
    const specs = await getHardwareSpecs();
    const state = loadTunerState();

    const backupExists = existsSync(SYSTEM_DEFAULTS_ARCHIVE);
    let manifest = null;
    if (existsSync(MANIFEST_FILE)) {
      try {
        manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8'));
      } catch {}
    }

    // Dynamic preview of allocations for all presets
    const preview = {
      conservative: calculateAllocations(specs, 'conservative', state.enableRedis),
      auto: calculateAllocations(specs, 'auto', state.enableRedis),
      aggressive: calculateAllocations(specs, 'aggressive', state.enableRedis),
    };

    return {
      enabled: state.enabled,
      currentProfile: state.enabled ? state.currentProfile : 'native',
      enableRedis: state.enableRedis,
      appliedAt: state.appliedAt,
      backupExists,
      manifest,
      specs,
      currentAllocations: state.allocations || preview.auto,
      preview,
    };
  });

  // ─── Dynamic Live Preview Calculation ────────────────────
  app.post('/preview', async (request, reply) => {
    const { preset = 'auto', enableRedis = false } = request.body || {};
    const specs = await getHardwareSpecs();
    const allocations = calculateAllocations(specs, preset, Boolean(enableRedis));
    return { specs, allocations };
  });

  // ─── 2. Enable Auto-Tuner / Apply Preset ──────────────────
  app.post('/enable', async (request, reply) => {
    const { preset = 'auto', enableRedis = false } = request.body || {};
    if (!['auto', 'conservative', 'aggressive'].includes(preset)) {
      return reply.code(400).send({ error: 'Invalid preset. Must be auto, conservative, or aggressive' });
    }

    const specs = await getHardwareSpecs();
    const allocations = calculateAllocations(specs, preset, Boolean(enableRedis));

    // A. AUTOMATED BACKUP SEQUENCE
    if (!existsSync(BACKUP_DIR)) {
      mkdirSync(BACKUP_DIR, { recursive: true });
    }

    // 1. Check if baseline defaults archive exists; if not, archive baseline
    const baselineExists = existsSync(SYSTEM_DEFAULTS_ARCHIVE);
    if (!baselineExists) {
      const baselineResult = await createArchive(SYSTEM_DEFAULTS_ARCHIVE);
      if (!baselineResult.success) {
        return reply.code(500).send({
          error: 'Failed to create baseline system defaults backup',
          details: baselineResult.output,
        });
      }
    }

    // 2. Always create a pre-tuning snapshot
    const preTuningResult = await createArchive(PRE_TUNING_ARCHIVE);
    updateManifest({
      lastBackup: new Date().toISOString(),
      systemDefaultsExists: true,
      lastPreTuningBackup: new Date().toISOString(),
      filesArchived: preTuningResult.files,
      status: 'active',
      profile: preset,
    });

    // B. SWAP MEMORY SAFETY NET
    if (specs.ram <= 2048 && process.platform === 'linux') {
      try {
        if (!specs.swapFileExists && specs.swap < 1024) {
          await shell('fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048');
          await shell('chmod 600 /swapfile');
          await shell('mkswap /swapfile');
          await shell('swapon /swapfile');

          const fstab = existsSync('/etc/fstab') ? readFileSync('/etc/fstab', 'utf-8') : '';
          if (!fstab.includes('/swapfile')) {
            await shell('echo "/swapfile none swap sw 0 0" >> /etc/fstab');
          }
        }
      } catch (swapErr) {
        // Log swap warning but continue tuning
      }
    }

    // Configure sysctl parameters (swappiness = 10)
    if (process.platform === 'linux') {
      try {
        const sysctlContent = `# DEOLS Server Auto-Tuner Parameters\nvm.swappiness = 10\nvm.vfs_cache_pressure = 50\n`;
        writeFileSync('/etc/sysctl.d/99-deols-tuner.conf', sysctlContent);
        await shell('sysctl -p /etc/sysctl.d/99-deols-tuner.conf 2>/dev/null || true');
      } catch {}
    }

    // C. OPENLITESPEED (OLS) TUNING
    const olsConfPath = join(config.olsRoot, 'conf', 'httpd_config.conf');
    if (existsSync(olsConfPath)) {
      try {
        let content = readFileSync(olsConfPath, 'utf-8');

        // Update all external processor lsphp blocks
        content = content.replace(
          /(extprocessor\s+[a-zA-Z0-9_:-]*\s*\{[\s\S]*?\})/gi,
          (block) => {
            // Only update external processors that are php or lsapi
            if (!/type\s+lsapi/i.test(block) && !/lsphp/i.test(block) && !/php/i.test(block)) {
              return block;
            }

            let updated = block;
            // Strip any invalid/legacy directives
            updated = updated.replace(/\n\s*maxIdleTime\s+[^\r\n]*/gi, '');
            // Update maxConns
            if (/maxConns\s+\d+/i.test(updated)) {
              updated = updated.replace(/maxConns\s+\d+/i, `maxConns                ${allocations.phpWorkers}`);
            } else {
              updated = updated.replace(/\{/, `{\n  maxConns                ${allocations.phpWorkers}`);
            }
            // Update env PHP_LSAPI_CHILDREN
            if (/env\s+PHP_LSAPI_CHILDREN=\d+/i.test(updated)) {
              updated = updated.replace(/env\s+PHP_LSAPI_CHILDREN=\d+/i, `env                     PHP_LSAPI_CHILDREN=${allocations.phpWorkers}`);
            } else {
              updated = updated.replace(/\{/, `{\n  env                     PHP_LSAPI_CHILDREN=${allocations.phpWorkers}`);
            }
            return updated;
          }
        );

        writeFileSync(olsConfPath, content, 'utf-8');
        ensureOlsListeners(olsConfPath);

        // Validate OLS configuration syntax
        if (process.platform === 'linux' && existsSync(join(config.olsRoot, 'bin', 'lswsctrl'))) {
          const testRes = await shell(`"${join(config.olsRoot, 'bin', 'lswsctrl')}" test`);
          const testOutput = ((testRes.stdout || '') + ' ' + (testRes.stderr || '')).trim();
          const isOk = testRes.code === 0 || testOutput.includes('[OK]') || testOutput.includes('syntax is ok') || testOutput.includes('is valid');
          
          if (!isOk) {
            console.error('[Auto-Tuner] OLS Syntax test failed:', testOutput);
            // Revert immediately from pre-tuning backup
            if (existsSync(PRE_TUNING_ARCHIVE)) {
              await shell(`tar -xzf "${PRE_TUNING_ARCHIVE}" -C / -P`);
            }
            return reply.code(500).send({
              error: 'OpenLiteSpeed syntax test failed. Automatically reverted to safe configuration.',
              details: testOutput,
            });
          }
        }
      } catch (olsErr) {
        return reply.code(500).send({ error: `Failed to update OpenLiteSpeed configuration: ${olsErr.message}` });
      }
    }

    // D. MARIADB TUNING
    if (process.platform === 'linux') {
      try {
        const mariadbConfDir = '/etc/mysql/mariadb.conf.d';
        if (existsSync(mariadbConfDir)) {
          const tunerMariaDbConf = join(mariadbConfDir, '99-deols-tuner.cnf');
          const mariaDbContent = `# DEOLS Server Auto-Tuner Managed Configuration
# Profile: ${preset} | Generated: ${new Date().toISOString()}
[mysqld]
innodb_buffer_pool_size        = ${allocations.dbMb}M
innodb_log_file_size           = ${Math.min(256, Math.max(32, Math.round(allocations.dbMb / 4)))}M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method            = O_DIRECT
innodb_file_per_table          = 1
max_connections                = ${Math.min(250, Math.max(50, allocations.phpWorkers * 4))}
`;
          writeFileSync(tunerMariaDbConf, mariaDbContent);
        }
      } catch (dbErr) {
        // Log warning
      }
    }

    // E. REDIS TUNING (If enabled)
    if (enableRedis && process.platform === 'linux') {
      try {
        const redisConf = '/etc/redis/redis.conf';
        if (existsSync(redisConf)) {
          let redisContent = readFileSync(redisConf, 'utf-8');
          // Update or append maxmemory
          if (/^maxmemory\s+.*/m.test(redisContent)) {
            redisContent = redisContent.replace(/^maxmemory\s+.*/m, `maxmemory ${allocations.redisMb}mb`);
          } else {
            redisContent += `\nmaxmemory ${allocations.redisMb}mb\n`;
          }
          // Update or append maxmemory-policy
          if (/^maxmemory-policy\s+.*/m.test(redisContent)) {
            redisContent = redisContent.replace(/^maxmemory-policy\s+.*/m, 'maxmemory-policy allkeys-lru');
          } else {
            redisContent += `maxmemory-policy allkeys-lru\n`;
          }
          writeFileSync(redisConf, redisContent);
        }
      } catch (redisErr) {
        // Log warning
      }
    }

    // F. GRACEFUL SERVICE RELOADS
    if (process.platform === 'linux') {
      try {
        // 1. MariaDB
        await shell('systemctl restart mariadb 2>/dev/null || true');
        // 2. Redis
        if (enableRedis) {
          await shell('systemctl restart redis-server 2>/dev/null || systemctl restart redis 2>/dev/null || true');
        }
        // 3. OpenLiteSpeed graceful restart
        if (existsSync(join(config.olsRoot, 'bin', 'lswsctrl'))) {
          await shell(`"${join(config.olsRoot, 'bin', 'lswsctrl')}" restart`);
        } else {
          await shell('systemctl restart lsws 2>/dev/null || true');
        }
      } catch (svcErr) {
        // Log reload error
      }
    }

    // G. SAVE STATE
    const newState = {
      enabled: true,
      currentProfile: preset,
      enableRedis: Boolean(enableRedis),
      appliedAt: new Date().toISOString(),
      allocations,
    };
    saveTunerState(newState);

    return {
      success: true,
      message: `Server Auto-Tuner profile "${preset}" successfully activated!`,
      allocations,
      state: newState,
    };
  });

  // ─── 3. Restore Factory System Defaults ───────────────────
  app.post('/restore', async (request, reply) => {
    if (!existsSync(SYSTEM_DEFAULTS_ARCHIVE)) {
      return reply.code(404).send({
        error: 'Baseline system defaults archive not found. No prior baseline has been recorded.',
      });
    }

    if (process.platform === 'linux') {
      try {
        // 1. Stop affected services
        await shell('systemctl stop lsws 2>/dev/null || true');
        await shell('systemctl stop mariadb 2>/dev/null || true');
        await shell('systemctl stop redis-server 2>/dev/null || systemctl stop redis 2>/dev/null || true');

        // 2. Unpack baseline archive back to root filesystem
        const unpackRes = await shell(`tar -xzf "${SYSTEM_DEFAULTS_ARCHIVE}" -C / -P`);
        if (unpackRes.code !== 0) {
          return reply.code(500).send({
            error: 'Failed to unpack baseline archive',
            details: unpackRes.stdout || unpackRes.stderr,
          });
        }

        // 3. Remove tuner-created overlay files
        if (existsSync('/etc/mysql/mariadb.conf.d/99-deols-tuner.cnf')) {
          unlinkSync('/etc/mysql/mariadb.conf.d/99-deols-tuner.cnf');
        }
        if (existsSync('/etc/sysctl.d/99-deols-tuner.conf')) {
          unlinkSync('/etc/sysctl.d/99-deols-tuner.conf');
          await shell('sysctl --system 2>/dev/null || true');
        }

        // 4. Test OpenLiteSpeed syntax
        if (existsSync(join(config.olsRoot, 'bin', 'lswsctrl'))) {
          await shell(`"${join(config.olsRoot, 'bin', 'lswsctrl')}" test`);
        }

        // 5. Restart services
        await shell('systemctl start mariadb 2>/dev/null || true');
        await shell('systemctl start lsws 2>/dev/null || true');
        await shell('systemctl start redis-server 2>/dev/null || systemctl start redis 2>/dev/null || true');
      } catch (err) {
        return reply.code(500).send({ error: `Restore process encountered an error: ${err.message}` });
      }
    }

    // Update state to Disabled / Native
    const newState = {
      enabled: false,
      currentProfile: 'native',
      enableRedis: false,
      appliedAt: null,
      allocations: null,
    };
    saveTunerState(newState);

    updateManifest({
      lastRestore: new Date().toISOString(),
      status: 'restored_defaults',
    });

    return {
      success: true,
      message: 'System configuration successfully restored to native factory defaults.',
      state: newState,
    };
  });
}
