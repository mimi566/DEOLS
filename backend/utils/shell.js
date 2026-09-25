// ─────────────────────────────────────────────────────────────
// DEOLS Shell Execution Utility
// Provides safe, logged command execution for all services
// ─────────────────────────────────────────────────────────────

import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Execute a shell command safely with timeout and logging.
 * @param {string} command - Command string to execute
 * @param {object} opts - Options: { timeout, cwd, env, maxBuffer }
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
export async function shell(command, opts = {}) {
  const {
    timeout = 60_000,
    cwd = '/tmp',
    env = process.env,
    maxBuffer = 10 * 1024 * 1024, // 10 MB
  } = opts;

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout,
      cwd,
      env,
      maxBuffer,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), code: 0 };
  } catch (err) {
    return {
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || err.message,
      code: err.code || 1,
    };
  }
}

/**
 * Execute a binary directly (safer than shell — no injection risk).
 * @param {string} binary - Absolute path to binary
 * @param {string[]} args - Array of arguments
 * @param {object} opts - Options
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
export async function run(binary, args = [], opts = {}) {
  const {
    timeout = 120_000,
    cwd = '/tmp',
    env = process.env,
    maxBuffer = 10 * 1024 * 1024,
  } = opts;

  try {
    const { stdout, stderr } = await execFileAsync(binary, args, {
      timeout,
      cwd,
      env,
      maxBuffer,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), code: 0 };
  } catch (err) {
    return {
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || err.message,
      code: err.code || 1,
    };
  }
}

/**
 * Spawn a long-running process and stream output.
 * @param {string} binary - Binary path
 * @param {string[]} args - Arguments
 * @param {object} opts - Options
 * @returns {ChildProcess}
 */
export function spawnProcess(binary, args = [], opts = {}) {
  const { cwd = '/tmp', env = process.env } = opts;
  return spawn(binary, args, {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/**
 * Generate a cryptographically secure random password.
 * @param {number} length - Password length
 * @returns {string}
 */
export function generatePassword(length = 24) {
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
  const { randomBytes } = await import('crypto');
  const bytes = randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

/**
 * Sanitize a domain name — only allow valid characters.
 * @param {string} domain
 * @returns {string}
 */
export function sanitizeDomain(domain) {
  return domain
    .toLowerCase()
    .replace(/[^a-z0-9.\-*]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.\-]+|[.\-]+$/g, '');
}

/**
 * Validate a domain name format.
 * @param {string} domain
 * @returns {boolean}
 */
export function isValidDomain(domain) {
  const pattern = /^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
  return pattern.test(domain.toLowerCase());
}
