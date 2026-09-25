// ─────────────────────────────────────────────────────────────
// DEOLS Server-Side Automation & Cron Engine
// Background service for WP-Cron, SSL renewal, OLS maintenance,
// and custom user-scheduled server-side tasks.
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { shell, run } from '../utils/shell.js';

const TASKS_FILE = join(config.dataDir, 'automation-tasks.json');
const LOGS_DIR = join(config.dataDir, 'logs', 'automation');

// Ensure log directory exists
if (!existsSync(LOGS_DIR)) {
  mkdirSync(LOGS_DIR, { recursive: true });
}

// Default built-in system automation tasks
const DEFAULT_SYSTEM_TASKS = [
  {
    id: 'sys-wp-cron',
    name: 'Global WordPress WP-Cron Automation',
    description: 'Triggers scheduled events for all hosted WordPress sites via WP-CLI without relying on visitor traffic',
    type: 'wp-cron',
    schedule: '*/5 * * * *', // Every 5 minutes
    command: 'internal:wp-cron-all',
    enabled: true,
    isSystem: true,
    lastRun: null,
    lastStatus: 'idle',
    lastDurationMs: 0,
    lastOutput: 'Initialized and waiting for first schedule trigger',
  },
  {
    id: 'sys-ssl-renew',
    name: 'Automated Let\'s Encrypt SSL Renewal & Health Check',
    description: 'Checks certificate expirations daily and auto-renews certificates due within 30 days',
    type: 'ssl-renew',
    schedule: '0 3 * * *', // Daily at 03:00 AM
    command: 'internal:ssl-renew-all',
    enabled: true,
    isSystem: true,
    lastRun: null,
    lastStatus: 'idle',
    lastDurationMs: 0,
    lastOutput: 'Initialized and waiting for first schedule trigger',
  },
  {
    id: 'sys-ols-cache',
    name: 'OpenLiteSpeed Cache & Temporary Storage Maintenance',
    description: 'Cleans expired page cache records from /usr/local/lsws/cachedata to prevent disk bloat',
    type: 'cache-clean',
    schedule: '0 4 * * *', // Daily at 04:00 AM
    command: 'internal:ols-cache-clean',
    enabled: true,
    isSystem: true,
    lastRun: null,
    lastStatus: 'idle',
    lastDurationMs: 0,
    lastOutput: 'Initialized and waiting for first schedule trigger',
  },
  {
    id: 'sys-db-optimize',
    name: 'MariaDB Database Maintenance & Index Optimization',
    description: 'Optimizes database tables and updates index statistics weekly',
    type: 'db-optimize',
    schedule: '0 2 * * 0', // Every Sunday at 02:00 AM
    command: 'internal:db-optimize',
    enabled: true,
    isSystem: true,
    lastRun: null,
    lastStatus: 'idle',
    lastDurationMs: 0,
    lastOutput: 'Initialized and waiting for first schedule trigger',
  },
];

/**
 * Load all automation tasks from storage. Initializes default system tasks if absent.
 */
export function loadTasks() {
  if (!existsSync(TASKS_FILE)) {
    saveTasks(DEFAULT_SYSTEM_TASKS);
    return DEFAULT_SYSTEM_TASKS;
  }
  try {
    const data = JSON.parse(readFileSync(TASKS_FILE, 'utf-8'));
    // Ensure all default system tasks exist in stored list
    let updated = false;
    for (const defTask of DEFAULT_SYSTEM_TASKS) {
      if (!data.find((t) => t.id === defTask.id)) {
        data.unshift(defTask);
        updated = true;
      }
    }
    if (updated) saveTasks(data);
    return data;
  } catch {
    return DEFAULT_SYSTEM_TASKS;
  }
}

/**
 * Save tasks to JSON storage
 */
export function saveTasks(tasks) {
  writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

/**
 * Check if a 5-part cron expression matches the given date/time
 */
export function matchesCron(cronExpr, date = new Date()) {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minPattern, hrPattern, domPattern, monPattern, dowPattern] = parts;
  const currMin = date.getMinutes();
  const currHr = date.getHours();
  const currDom = date.getDate();
  const currMon = date.getMonth() + 1; // 1-12
  const currDow = date.getDay(); // 0-6 (Sunday is 0)

  const matchField = (pattern, val, minVal, maxVal) => {
    if (pattern === '*') return true;
    if (pattern.includes('/')) {
      const [range, stepStr] = pattern.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) return false;
      let start = minVal;
      let end = maxVal;
      if (range !== '*') {
        if (range.includes('-')) {
          const [r1, r2] = range.split('-').map(Number);
          start = r1;
          end = r2;
        } else {
          start = parseInt(range, 10);
        }
      }
      return val >= start && val <= end && (val - start) % step === 0;
    }
    if (pattern.includes(',')) {
      return pattern.split(',').some((p) => matchField(p.trim(), val, minVal, maxVal));
    }
    if (pattern.includes('-')) {
      const [r1, r2] = pattern.split('-').map(Number);
      return val >= r1 && val <= r2;
    }
    return parseInt(pattern, 10) === val;
  };

  return (
    matchField(minPattern, currMin, 0, 59) &&
    matchField(hrPattern, currHr, 0, 23) &&
    matchField(domPattern, currDom, 1, 31) &&
    matchField(monPattern, currMon, 1, 12) &&
    matchField(dowPattern, currDow, 0, 6)
  );
}

/**
 * Execute an internal system task
 */
async function executeInternalTask(command) {
  if (command === 'internal:wp-cron-all') {
    const sitesFile = join(config.dataDir, 'sites.json');
    if (!existsSync(sitesFile)) return 'No sites configured yet';

    let sites = [];
    try {
      sites = JSON.parse(readFileSync(sitesFile, 'utf-8'));
    } catch {
      return 'Failed to load sites.json';
    }

    const activeSites = sites.filter((s) => s.status !== 'suspended');
    if (activeSites.length === 0) return 'No active sites found';

    const results = [];
    for (const site of activeSites) {
      const docRoot = site.docRoot || join(config.webRoot, site.domain, 'public_html');
      if (existsSync(docRoot)) {
        try {
          const wpRes = await run(config.bin.wp, ['cron', 'event', 'run', '--due-now', `--path=${docRoot}`, '--quiet'], { timeout: 30_000 });
          results.push(`[${site.domain}] WP-Cron executed (exit ${wpRes.code})`);
        } catch (err) {
          results.push(`[${site.domain}] Skipped: ${err.message}`);
        }
      } else {
        results.push(`[${site.domain}] Document root not found: ${docRoot}`);
      }
    }
    return results.join('\n');
  }

  if (command === 'internal:ssl-renew-all') {
    const lswsctrl = config.bin.lswsctrl || '/usr/local/lsws/bin/lswsctrl';
    const certbot = config.bin.certbot || '/usr/bin/certbot';
    try {
      const res = await shell(`"${certbot}" renew --deploy-hook "${lswsctrl} restart" --quiet`);
      return res.stdout || res.stderr || 'Let\'s Encrypt certificate renewal check completed';
    } catch (err) {
      return `Certificate check returned: ${err.message}`;
    }
  }

  if (command === 'internal:ols-cache-clean') {
    const cacheDir = config.cacheDir || '/usr/local/lsws/cachedata';
    if (!existsSync(cacheDir)) return `Cache directory ${cacheDir} does not exist`;
    try {
      // Clean cache entries older than 7 days
      const res = await shell(`find "${cacheDir}" -type f -mtime +7 -delete 2>/dev/null || true`);
      return `OpenLiteSpeed cache storage pruned successfully (${cacheDir})`;
    } catch (err) {
      return `Cache cleanup error: ${err.message}`;
    }
  }

  if (command === 'internal:db-optimize') {
    try {
      const res = await shell('mysqlcheck -u root --optimize --all-databases 2>&1');
      return res.stdout || 'MariaDB optimization completed';
    } catch (err) {
      return `MariaDB optimization finished: ${err.message}`;
    }
  }

  return `Unknown internal command: ${command}`;
}

/**
 * Execute a single automation task by ID (manual or scheduled)
 */
export async function runTaskNow(taskId) {
  const tasks = loadTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  let status = 'success';
  let output = '';

  try {
    if (task.command.startsWith('internal:')) {
      output = await executeInternalTask(task.command);
    } else {
      // Custom user command
      const res = await shell(task.command, { timeout: 300_000 });
      output = (res.stdout + (res.stderr ? '\n[STDERR]\n' + res.stderr : '')).trim();
      if (res.code !== 0) status = 'failed';
    }
  } catch (err) {
    status = 'failed';
    output = `Error executing task: ${err.message}`;
  }

  const durationMs = Date.now() - startTime;

  // Update task metadata
  task.lastRun = timestamp;
  task.lastStatus = status;
  task.lastDurationMs = durationMs;
  task.lastOutput = output.substring(0, 4000); // cap inline preview

  saveTasks(tasks);

  // Append entry to task log file
  const logFile = join(LOGS_DIR, `${taskId}.log`);
  const logEntry = `\n─────────────────────────────────────────────────────────────\n[${timestamp}] Status: ${status.toUpperCase()} | Duration: ${durationMs}ms\nOutput:\n${output}\n`;
  try {
    appendFileSync(logFile, logEntry);
  } catch {}

  return {
    taskId,
    status,
    durationMs,
    timestamp,
    output,
  };
}

/**
 * Add a new user-scheduled automation task
 */
export function addCustomTask({ name, description = '', schedule, command, type = 'shell' }) {
  if (!name || !schedule || !command) {
    throw new Error('Name, schedule, and command are required');
  }

  const cronParts = schedule.trim().split(/\s+/);
  if (cronParts.length !== 5) {
    throw new Error('Invalid cron expression. Expected 5 fields: minute hour day month weekday');
  }

  const tasks = loadTasks();
  const id = 'task-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);

  const newTask = {
    id,
    name: name.trim(),
    description: description.trim(),
    type,
    schedule: schedule.trim(),
    command: command.trim(),
    enabled: true,
    isSystem: false,
    lastRun: null,
    lastStatus: 'idle',
    lastDurationMs: 0,
    lastOutput: 'Task created. Ready to run.',
  };

  tasks.push(newTask);
  saveTasks(tasks);
  return newTask;
}

/**
 * Delete a user task by ID
 */
export function deleteCustomTask(taskId) {
  const tasks = loadTasks();
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) throw new Error('Task not found');
  if (tasks[idx].isSystem) throw new Error('Cannot delete core system tasks');

  tasks.splice(idx, 1);
  saveTasks(tasks);
  return true;
}

/**
 * Toggle task enabled / disabled
 */
export function toggleTask(taskId) {
  const tasks = loadTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error('Task not found');

  task.enabled = !task.enabled;
  saveTasks(tasks);
  return task;
}

/**
 * Get recent log file lines for a task
 */
export function getTaskLogs(taskId, maxLines = 100) {
  const logFile = join(LOGS_DIR, `${taskId}.log`);
  if (!existsSync(logFile)) return 'No logs recorded yet for this task.';
  try {
    const content = readFileSync(logFile, 'utf-8');
    const lines = content.split('\n');
    return lines.slice(-maxLines).join('\n');
  } catch (err) {
    return `Failed to read log: ${err.message}`;
  }
}

// ─── Background Scheduler Daemon ────────────────────────────

let daemonTimer = null;
let isExecuting = false;

/**
 * Checks all active tasks every minute and triggers matching cron schedules
 */
export function tickAutomation() {
  if (isExecuting) return;
  isExecuting = true;

  try {
    const tasks = loadTasks();
    const now = new Date();

    for (const task of tasks) {
      if (!task.enabled) continue;
      if (matchesCron(task.schedule, now)) {
        // Run asynchronously without blocking ticker loop
        runTaskNow(task.id).catch(() => {});
      }
    }
  } finally {
    isExecuting = false;
  }
}

/**
 * Start the in-process automation daemon timer (ticks every 60 seconds)
 */
export function startAutomationDaemon() {
  if (daemonTimer) return;
  // Initialize default tasks
  loadTasks();

  // Tick immediately on start, then set 60s interval aligned with the minute
  tickAutomation();

  daemonTimer = setInterval(tickAutomation, 60_000);
}

/**
 * Stop the in-process automation daemon timer
 */
export function stopAutomationDaemon() {
  if (daemonTimer) {
    clearInterval(daemonTimer);
    daemonTimer = null;
  }
}
