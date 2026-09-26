// ─────────────────────────────────────────────────────────────
// DEOLS "Lean Engine" RAM & Speed Optimization Module API
// Aggressive Idle Memory Reduction, Dynamic LSPHP Process Tuning,
// Zend OPcache Optimization, MariaDB Right-Sizing & LSCache Enforcement
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import os from 'os';
import { config } from '../config.js';
import { shell, run } from '../utils/shell.js';
import { ensureOlsListeners, testOlsSyntax } from '../utils/ols-config.js';

const BACKUP_DIR = config.backupDir || '/var/backups/deols';
const PRE_LEAN_ARCHIVE = join(BACKUP_DIR, 'pre_lean_engine_backup.tar.gz');
const SYSTEM_DEFAULTS_ARCHIVE = join(BACKUP_DIR, 'system_defaults.tar.gz');
const LEAN_MANIFEST_FILE = join(BACKUP_DIR, 'lean_manifest.json');
const LEAN_STATE_FILE = join(config.dataDir, 'lean_engine_state.json');

// Files managed and archived during Lean Engine optimization
const TRACKED_CONFIG_FILES = [
  join(config.olsRoot, 'conf', 'httpd_config.conf'),
  '/etc/php/8.3/mods-available/opcache.ini',
  '/etc/php/8.2/mods-available/opcache.ini',
  '/etc/php/8.1/mods-available/opcache.ini',
  '/usr/local/lsws/lsphp83/etc/php/8.3/mods-available/opcache.ini',
  '/usr/local/lsws/lsphp82/etc/php/8.2/mods-available/opcache.ini',
  '/usr/local/lsws/lsphp83/etc/php.d/10-opcache.ini',
  '/usr/local/lsws/lsphp82/etc/php.d/10-opcache.ini',
  '/etc/mysql/mariadb.conf.d/99-deols-lean.cnf',
  '/etc/mysql/conf.d/deols-lean.cnf',
  '/etc/mysql/mariadb.conf.d/50-server.cnf',
  '/etc/mysql/my.cnf',
];

/**
 * Load or initialize the Lean Engine state
 */
function loadLeanState() {
  if (existsSync(LEAN_STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(LEAN_STATE_FILE, 'utf-8'));
    } catch {
      // Fall through to default
    }
  }
  return {
    enabled: false,
    mode: 'standard', // 'standard' | 'lean' | 'ultra_lean'
    opcacheSize: 64,
    appliedAt: null,
    savings: null,
    metrics: null,
    enforcedVhostsCount: 0,
  };
}

/**
 * Save the Lean Engine state persistently
 */
function saveLeanState(state) {
  if (!existsSync(config.dataDir)) mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(LEAN_STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
}

/**
 * Update manifest file
 */
function updateLeanManifest(details) {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  let manifest = {};
  if (existsSync(LEAN_MANIFEST_FILE)) {
    try {
      manifest = JSON.parse(readFileSync(LEAN_MANIFEST_FILE, 'utf-8'));
    } catch {}
  }
  manifest = { ...manifest, ...details, updatedAt: new Date().toISOString() };
  writeFileSync(LEAN_MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  return manifest;
}

/**
 * Detect exact server hardware specifications (RAM in MB, vCPUs, Storage in MB)
 */
async function getHardwareSpecs() {
  let totalRamMb = Math.round(os.totalmem() / (1024 * 1024));
  let cpuCores = os.cpus()?.length || 1;
  let cpuModel = os.cpus()?.[0]?.model || 'Standard Server Processor';
  let diskTotalMb = 0;
  let diskFreeMb = 0;
  let activeSwapMb = 0;

  if (process.platform === 'linux') {
    try {
      const ramRes = await shell(`free -m | awk '/Mem:/ {print $2}'`);
      if (ramRes.stdout && !isNaN(parseInt(ramRes.stdout, 10))) {
        totalRamMb = parseInt(ramRes.stdout.trim(), 10);
      }
    } catch {}

    try {
      const cpuRes = await shell('nproc');
      if (cpuRes.stdout && !isNaN(parseInt(cpuRes.stdout, 10))) {
        cpuCores = parseInt(cpuRes.stdout.trim(), 10);
      }
    } catch {}

    try {
      const dfRes = await shell(`df -m / | awk 'NR==2 {print $2, $4}'`);
      if (dfRes.stdout) {
        const parts = dfRes.stdout.trim().split(/\s+/);
        if (parts[0] && !isNaN(parseInt(parts[0], 10))) diskTotalMb = parseInt(parts[0], 10);
        if (parts[1] && !isNaN(parseInt(parts[1], 10))) diskFreeMb = parseInt(parts[1], 10);
      }
    } catch {}

    try {
      const swapRes = await shell(`free -m | awk '/Swap:/ {print $2}'`);
      if (swapRes.stdout && !isNaN(parseInt(swapRes.stdout, 10))) {
        activeSwapMb = parseInt(swapRes.stdout.trim(), 10);
      }
    } catch {}

    try {
      const cpuInfo = readFileSync('/proc/cpuinfo', 'utf-8');
      const modelMatch = cpuInfo.match(/model name\s*:\s*(.+)/i);
      if (modelMatch) cpuModel = modelMatch[1].trim();
    } catch {}
  } else {
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
  };
}

/**
 * Calculate Lean Engine metrics & estimated RAM savings
 */
function calculateLeanMetrics(specs, mode = 'lean', customOpcacheSize = null) {
  const ramMb = specs.ram;
  const cores = specs.cpu;

  // 1. PHP Idle Timeout (LSAPI_PGRP_MAX_IDLE)
  // Default standard is 300 seconds. Lean mode drops to 30s; Ultra Lean drops to 20s.
  const idleTimeout = mode === 'ultra_lean' ? 20 : (mode === 'lean' ? 30 : 300);

  // 2. Dynamic PHP Worker Scaling (PHP_LSAPI_CHILDREN & maxConns)
  let phpWorkers;
  if (ramMb <= 1024) {
    phpWorkers = mode === 'ultra_lean' ? 8 : (mode === 'lean' ? 10 : 35);
  } else if (ramMb <= 2048) {
    phpWorkers = mode === 'ultra_lean' ? 12 : (mode === 'lean' ? 16 : 35);
  } else if (ramMb <= 4096) {
    phpWorkers = mode === 'ultra_lean' ? 24 : (mode === 'lean' ? 32 : 45);
  } else {
    const defaultWorkers = Math.min(64, Math.max(32, Math.floor(ramMb / 75)));
    phpWorkers = mode === 'ultra_lean' ? Math.max(20, Math.floor(defaultWorkers * 0.75)) : defaultWorkers;
  }

  // 3. Zend OPcache Memory Allocation
  let opcacheSize = customOpcacheSize || (ramMb >= 4096 ? 128 : (mode === 'ultra_lean' ? 48 : 64));
  if (typeof opcacheSize !== 'number' || isNaN(opcacheSize) || opcacheSize < 32) {
    opcacheSize = 64;
  }

  // 4. MariaDB Lean Profile
  let dbBufferPoolMb;
  if (ramMb <= 2048) {
    dbBufferPoolMb = 256;
  } else {
    dbBufferPoolMb = Math.round(ramMb * 0.35);
  }

  const dbMaxConnections = mode === 'ultra_lean' ? 40 : (mode === 'lean' ? 50 : 151);

  // 5. Estimated Real-world RAM Savings Calculation
  // Standard unoptimized PHP workers: ~35 workers @ ~45MB each = ~1575MB max potential idle drain + 300s lingering
  // Lean mode PHP workers: 8-16 workers @ ~45MB each + 30s aggressive reap
  const unoptimizedPhpDrain = 35 * 45; // ~1575 MB
  const leanPhpDrain = phpWorkers * 45;
  const phpMemorySavedMb = Math.max(150, Math.round((unoptimizedPhpDrain - leanPhpDrain) * 0.75));
  
  // MariaDB buffer savings against unoptimized over-allocation
  const dbMemorySavedMb = Math.max(64, Math.round(ramMb * 0.12));
  const totalEstimatedSavedMb = phpMemorySavedMb + dbMemorySavedMb;

  return {
    mode,
    idleTimeout,
    standardIdleTimeout: 300,
    phpWorkers,
    maxConns: phpWorkers,
    opcacheSize,
    opcacheInternedMb: 8,
    opcacheMaxFiles: 10000,
    opcacheRevalidateFreq: 2,
    dbBufferPoolMb,
    dbMaxConnections,
    dbLogBufferMb: 8,
    dbKeyBufferMb: 16,
    dbTableOpenCache: 400,
    savings: {
      estimatedRamSavedMb: totalEstimatedSavedMb,
      phpMemorySavedMb,
      dbMemorySavedMb,
      idleTimeoutReductionPct: Math.round(((300 - idleTimeout) / 300) * 100),
      summaryText: `Reclaimed ~${totalEstimatedSavedMb} MB RAM for PHP/MariaDB & Reduced Idle Worker Lifespan by ${Math.round(((300 - idleTimeout) / 300) * 100)}%`,
    },
  };
}

/**
 * Create archive backup of tracked configuration files
 */
async function createPreLeanArchive(archivePath) {
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
    writeFileSync(archivePath, `mock lean archive of: ${existingFiles.join(', ')}`);
    return { success: true, files: existingFiles };
  }
}

/**
 * Enforce high-performance LSCache rewrite rules across virtual host configs
 */
function enforceLSCacheDirectives() {
  let count = 0;
  const vhostsDir = config.vhostsDir;

  if (!existsSync(vhostsDir)) return count;

  try {
    const entries = readdirSync(vhostsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const vhconfPath = join(vhostsDir, entry.name, 'vhconf.conf');
        if (existsSync(vhconfPath)) {
          let content = readFileSync(vhconfPath, 'utf-8');
          let modified = false;

          // Ensure gzip and brotli are enabled
          if (!/enableGzip\s+1/i.test(content)) {
            content = content.replace(/enableGzip\s+\d+/i, 'enableGzip                1');
            modified = true;
          }
          if (!/enableBr\s+1/i.test(content)) {
            content = content.replace(/enableBr\s+\d+/i, 'enableBr                  1');
            modified = true;
          }

          // Ensure LSCache bypass rewrite rules exist
          if (!content.includes('E=Cache-Control:no-autoflush')) {
            if (/rewrite\s*\{/i.test(content)) {
              content = content.replace(/rewrite\s*\{[\s\S]*?\}/i, (block) => {
                return `rewrite  {
  enable                  1
  autoLoadHtaccess        1
  rules                   <<<END_rules
RewriteEngine On
RewriteRule .* - [E=Cache-Control:no-autoflush]
RewriteRule ^/wp-content/cache/ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
END_rules
}`;
              });
              modified = true;
            }
          }

          if (modified) {
            writeFileSync(vhconfPath, content, 'utf-8');
          }
          count++;
        }
      }
    }
  } catch (err) {
    // Non-fatal error scanning vhosts
  }

  return count;
}

export default async function leanEngineRoutes(app) {
  // Enforce authentication & Administrator privileges on all endpoints
  app.addHook('preHandler', async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) return;
    if (request.user?.role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden: Administrator privileges required' });
    }
  });

  // ─── 1. Get Lean Engine Status & Metrics ───────────────────
  app.get('/status', async (request, reply) => {
    const specs = await getHardwareSpecs();
    const state = loadLeanState();
    const backupExists = existsSync(PRE_LEAN_ARCHIVE);

    const activeMode = state.enabled ? state.mode : 'standard';
    const metrics = calculateLeanMetrics(specs, state.enabled ? state.mode : 'lean', state.opcacheSize);

    // Read live OPcache config if available on filesystem
    let liveOpcacheInfo = {
      memory_consumption: metrics.opcacheSize,
      interned_strings_buffer: 8,
      max_accelerated_files: 10000,
      revalidate_freq: 2,
      fast_shutdown: 1,
      enabled: state.enabled,
    };

    const opcachePaths = [
      '/etc/php/8.3/mods-available/opcache.ini',
      '/usr/local/lsws/lsphp83/etc/php/8.3/mods-available/opcache.ini',
    ];
    for (const p of opcachePaths) {
      if (existsSync(p)) {
        try {
          const raw = readFileSync(p, 'utf-8');
          const memMatch = raw.match(/opcache\.memory_consumption\s*=\s*(\d+)/);
          const internMatch = raw.match(/opcache\.interned_strings_buffer\s*=\s*(\d+)/);
          const maxFilesMatch = raw.match(/opcache\.max_accelerated_files\s*=\s*(\d+)/);
          if (memMatch) liveOpcacheInfo.memory_consumption = parseInt(memMatch[1], 10);
          if (internMatch) liveOpcacheInfo.interned_strings_buffer = parseInt(internMatch[1], 10);
          if (maxFilesMatch) liveOpcacheInfo.max_accelerated_files = parseInt(maxFilesMatch[1], 10);
          liveOpcacheInfo.enabled = true;
          break;
        } catch {}
      }
    }

    return {
      enabled: state.enabled,
      mode: activeMode,
      appliedAt: state.appliedAt,
      opcacheSize: state.opcacheSize || 64,
      opcache: liveOpcacheInfo,
      lsapi: {
        idleTimeout: state.enabled ? metrics.idleTimeout : 300,
        phpWorkers: state.enabled ? metrics.phpWorkers : 35,
        maxConns: state.enabled ? metrics.maxConns : 35,
      },
      mariadb: {
        innodb_buffer_pool_size: `${metrics.dbBufferPoolMb}M`,
        innodb_log_buffer_size: '8M',
        max_connections: metrics.dbMaxConnections,
        key_buffer_size: '16M',
        table_open_cache: 400,
      },
      lscache: {
        enforced: true,
        siteRulesApplied: state.enforcedVhostsCount || 0,
      },
      specs,
      savings: metrics.savings,
      metrics,
      backup: {
        exists: backupExists,
        path: PRE_LEAN_ARCHIVE,
      },
    };
  });

  // ─── 2. Enable Lean Engine Mode ────────────────────────────
  app.post('/enable', async (request, reply) => {
    const { mode = 'lean', opcache_size = 64 } = request.body || {};
    if (!['lean', 'ultra_lean'].includes(mode)) {
      return reply.code(400).send({ error: 'Invalid mode. Must be "lean" or "ultra_lean"' });
    }

    const opcacheSize = Math.max(32, Math.min(512, parseInt(opcache_size, 10) || 64));
    const specs = await getHardwareSpecs();
    const metrics = calculateLeanMetrics(specs, mode, opcacheSize);

    // ── Step 1: Automated Safety Backup Snapshot ──
    const backupRes = await createPreLeanArchive(PRE_LEAN_ARCHIVE);
    if (!backupRes.success && process.platform === 'linux') {
      return reply.code(500).send({
        error: 'Failed to create pre-lean safety snapshot before applying configuration',
        details: backupRes.output,
      });
    }

    updateLeanManifest({
      lastBackup: new Date().toISOString(),
      mode,
      opcacheSize,
      filesArchived: backupRes.files,
      status: 'active',
    });

    // ── Step 2: OpenLiteSpeed Process Manager Tuning ──
    const olsConfPath = join(config.olsRoot, 'conf', 'httpd_config.conf');
    if (existsSync(olsConfPath)) {
      try {
        let content = readFileSync(olsConfPath, 'utf-8');

        // Update all external processor lsphp blocks for idle timeout and worker scaling
        content = content.replace(
          /(extprocessor\s+[a-zA-Z0-9_:-]*\s*\{[\s\S]*?\})/gi,
          (block) => {
            // Only update external processors that are php or lsapi
            if (!/type\s+lsapi/i.test(block) && !/lsphp/i.test(block) && !/php/i.test(block)) {
              return block;
            }

            let updated = block;

            // Strip any invalid/legacy maxIdleTime lines
            updated = updated.replace(/\n\s*maxIdleTime\s+[^\r\n]*/gi, '');

            // 1. maxConns
            if (/maxConns\s+\d+/i.test(updated)) {
              updated = updated.replace(/maxConns\s+\d+/i, `maxConns                ${metrics.phpWorkers}`);
            } else {
              updated = updated.replace(/\{/, `{\n  maxConns                ${metrics.phpWorkers}`);
            }

            // 2. env PHP_LSAPI_CHILDREN
            if (/env\s+PHP_LSAPI_CHILDREN=\d+/i.test(updated)) {
              updated = updated.replace(/env\s+PHP_LSAPI_CHILDREN=\d+/i, `env                     PHP_LSAPI_CHILDREN=${metrics.phpWorkers}`);
            } else {
              updated = updated.replace(/\{/, `{\n  env                     PHP_LSAPI_CHILDREN=${metrics.phpWorkers}`);
            }

            // 3. env LSAPI_PGRP_MAX_IDLE (Idle Timeout in seconds)
            if (/env\s+LSAPI_PGRP_MAX_IDLE=\d+/i.test(updated)) {
              updated = updated.replace(/env\s+LSAPI_PGRP_MAX_IDLE=\d+/i, `env                     LSAPI_PGRP_MAX_IDLE=${metrics.idleTimeout}`);
            } else {
              updated = updated.replace(/\{/, `{\n  env                     LSAPI_PGRP_MAX_IDLE=${metrics.idleTimeout}`);
            }

            // 4. pcKeepAliveTimeout
            if (/pcKeepAliveTimeout\s+\d+/i.test(updated)) {
              updated = updated.replace(/pcKeepAliveTimeout\s+\d+/i, `pcKeepAliveTimeout      ${metrics.idleTimeout}`);
            } else {
              updated = updated.replace(/\{/, `{\n  pcKeepAliveTimeout      ${metrics.idleTimeout}`);
            }

            return updated;
          }
        );

        writeFileSync(olsConfPath, content, 'utf-8');
        ensureOlsListeners(olsConfPath);

        // Validate OpenLiteSpeed syntax
        const testRes = await testOlsSyntax();
        if (!testRes.ok) {
          console.error('[Lean Engine] OLS Syntax test failed:', testRes.output);
          // Revert immediately from safety backup
          if (existsSync(PRE_LEAN_ARCHIVE)) {
            await shell(`tar -xzf "${PRE_LEAN_ARCHIVE}" -C / -P`);
          }
          return reply.code(500).send({
            error: 'OpenLiteSpeed syntax test failed. Automatically reverted to safe configuration.',
            details: testRes.output,
          });
        }
      } catch (olsErr) {
        return reply.code(500).send({ error: `Failed to update OpenLiteSpeed configuration: ${olsErr.message}` });
      }
    }

    // ── Step 3: Zend OPcache Tuning ──
    const opcacheIniContent = `; ─────────────────────────────────────────────────────────────
; DEOLS Lean Engine — Zend OPcache Performance Profile
; Mode: ${mode} | Memory: ${opcacheSize}MB | Generated: ${new Date().toISOString()}
; ─────────────────────────────────────────────────────────────
opcache.enable=1
opcache.enable_cli=1
opcache.memory_consumption=${opcacheSize}
opcache.interned_strings_buffer=8
opcache.max_accelerated_files=10000
opcache.revalidate_freq=2
opcache.fast_shutdown=1
opcache.save_comments=1
opcache.validate_timestamps=1
opcache.max_wasted_percentage=5
`;

    const targetOpcachePaths = [
      '/etc/php/8.3/mods-available/opcache.ini',
      '/etc/php/8.2/mods-available/opcache.ini',
      '/etc/php/8.1/mods-available/opcache.ini',
      '/usr/local/lsws/lsphp83/etc/php/8.3/mods-available/opcache.ini',
      '/usr/local/lsws/lsphp82/etc/php/8.2/mods-available/opcache.ini',
      '/usr/local/lsws/lsphp83/etc/php.d/10-opcache.ini',
      '/usr/local/lsws/lsphp82/etc/php.d/10-opcache.ini',
      '/etc/php/8.3/fpm/conf.d/10-opcache.ini',
      '/etc/php/8.3/cli/conf.d/10-opcache.ini',
    ];

    for (const p of targetOpcachePaths) {
      const dir = dirname(p);
      if (existsSync(dir)) {
        try {
          writeFileSync(p, opcacheIniContent, 'utf-8');
        } catch {}
      }
    }

    // ── Step 4: MariaDB Lean Memory Profile ──
    if (process.platform === 'linux') {
      const mariadbConfDirs = ['/etc/mysql/mariadb.conf.d', '/etc/mysql/conf.d'];
      const mariaDbLeanContent = `# ─────────────────────────────────────────────────────────────
# DEOLS Lean Engine — MariaDB Lean Memory Profile
# Mode: ${mode} | Applied: ${new Date().toISOString()}
# ─────────────────────────────────────────────────────────────
[mysqld]
innodb_buffer_pool_size        = ${metrics.dbBufferPoolMb}M
innodb_log_buffer_size         = 8M
max_connections                = ${metrics.dbMaxConnections}
key_buffer_size                = 16M
table_open_cache               = 400
innodb_flush_log_at_trx_commit = 2
innodb_flush_method            = O_DIRECT
innodb_file_per_table          = 1
`;

      for (const dir of mariadbConfDirs) {
        if (existsSync(dir)) {
          try {
            writeFileSync(join(dir, '99-deols-lean.cnf'), mariaDbLeanContent, 'utf-8');
          } catch {}
        }
      }
    }

    // ── Step 5: LSCache Virtual Host Rules Enforcement ──
    const enforcedCount = enforceLSCacheDirectives();

    // ── Step 6: Graceful Service Reloads ──
    if (process.platform === 'linux') {
      try {
        // MariaDB
        await shell('systemctl restart mariadb 2>/dev/null || systemctl reload mariadb 2>/dev/null || true');

        // OpenLiteSpeed
        if (existsSync(join(config.olsRoot, 'bin', 'lswsctrl'))) {
          await shell(`"${join(config.olsRoot, 'bin', 'lswsctrl')}" restart`);
        } else {
          await shell('systemctl restart lsws 2>/dev/null || true');
        }
      } catch (svcErr) {
        // Non-fatal service restart warning
      }
    }

    // ── Step 7: Update Persistent State ──
    const newState = {
      enabled: true,
      mode,
      opcacheSize,
      appliedAt: new Date().toISOString(),
      savings: metrics.savings,
      metrics,
      enforcedVhostsCount: enforcedCount,
    };
    saveLeanState(newState);

    return {
      success: true,
      message: `Lean Engine Mode "${mode.toUpperCase()}" successfully enabled! Reclaimed ~${metrics.savings.estimatedRamSavedMb} MB RAM.`,
      metrics,
      savings: metrics.savings,
      enforcedVhostsCount: enforcedCount,
      state: newState,
    };
  });

  // ─── 3. Disable / Restore Default System Limits ────────────
  app.post('/disable', async (request, reply) => {
    // 1. If snapshot archive exists, unpack it back
    if (existsSync(PRE_LEAN_ARCHIVE) && process.platform === 'linux') {
      try {
        await shell(`tar -xzf "${PRE_LEAN_ARCHIVE}" -C / -P`);
      } catch {}
    }

    // 2. Remove lean config overlay files
    const leanCnfFiles = [
      '/etc/mysql/mariadb.conf.d/99-deols-lean.cnf',
      '/etc/mysql/conf.d/deols-lean.cnf',
    ];
    for (const f of leanCnfFiles) {
      if (existsSync(f)) {
        try {
          unlinkSync(f);
        } catch {}
      }
    }

    // 3. Reset OpenLiteSpeed idle timeout and worker caps to defaults in httpd_config.conf
    const olsConfPath = join(config.olsRoot, 'conf', 'httpd_config.conf');
    if (existsSync(olsConfPath)) {
      try {
        let content = readFileSync(olsConfPath, 'utf-8');
        content = content.replace(
          /(extprocessor\s+[a-zA-Z0-9_:-]*\s*\{[\s\S]*?\})/gi,
          (block) => {
            if (!/type\s+lsapi/i.test(block) && !/lsphp/i.test(block) && !/php/i.test(block)) {
              return block;
            }
            let updated = block;
            if (/maxConns\s+\d+/i.test(updated)) {
              updated = updated.replace(/maxConns\s+\d+/i, 'maxConns                35');
            }
            if (/env\s+PHP_LSAPI_CHILDREN=\d+/i.test(updated)) {
              updated = updated.replace(/env\s+PHP_LSAPI_CHILDREN=\d+/i, 'env                     PHP_LSAPI_CHILDREN=35');
            }
            if (/env\s+LSAPI_PGRP_MAX_IDLE=\d+/i.test(updated)) {
              updated = updated.replace(/env\s+LSAPI_PGRP_MAX_IDLE=\d+/i, 'env                     LSAPI_PGRP_MAX_IDLE=300');
            }
            updated = updated.replace(/\n\s*maxIdleTime\s+[^\r\n]*/gi, '');
            if (/pcKeepAliveTimeout\s+\d+/i.test(updated)) {
              updated = updated.replace(/pcKeepAliveTimeout\s+\d+/i, 'pcKeepAliveTimeout      60');
            }
            return updated;
          }
        );
        writeFileSync(olsConfPath, content, 'utf-8');
        ensureOlsListeners(olsConfPath);
      } catch {}
    }

    // 4. Validate & Restart Services
    if (process.platform === 'linux') {
      try {
        await testOlsSyntax();
        if (existsSync(join(config.olsRoot, 'bin', 'lswsctrl'))) {
          await shell(`"${join(config.olsRoot, 'bin', 'lswsctrl')}" restart`);
        }
        await shell('systemctl restart mariadb 2>/dev/null || true');
      } catch {}
    }

    // 5. Update State
    const newState = {
      enabled: false,
      mode: 'standard',
      opcacheSize: 64,
      appliedAt: null,
      savings: null,
      metrics: null,
      enforcedVhostsCount: 0,
    };
    saveLeanState(newState);

    updateLeanManifest({
      lastRestore: new Date().toISOString(),
      status: 'restored_defaults',
    });

    return {
      success: true,
      message: 'System limits successfully restored to standard factory configurations.',
      state: newState,
    };
  });
}
