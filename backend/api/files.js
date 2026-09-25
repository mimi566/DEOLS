// ─────────────────────────────────────────────────────────────
// DEOLS File Manager API — Browse, Upload, Edit, Extract
// ─────────────────────────────────────────────────────────────

import {
  existsSync, readdirSync, readFileSync, writeFileSync,
  statSync, unlinkSync, renameSync, mkdirSync, chmodSync,
} from 'fs';
import { join, resolve, extname, basename, dirname } from 'path';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { config } from '../config.js';
import { shell } from '../utils/shell.js';

// Root file manager access for authenticated DEOLS administrators
const DEFAULT_ROOT = process.platform === 'win32' ? process.cwd() : '/';

function validatePath(requestedPath) {
  if (!requestedPath || requestedPath === '' || requestedPath === '.') {
    return DEFAULT_ROOT;
  }
  return resolve(requestedPath);
}

export default async function filesRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  // ─── List Directory ────────────────────────────────────
  app.get('/list', async (request, reply) => {
    const { path: dirPath = DEFAULT_ROOT } = request.query;

    try {
      const safePath = validatePath(dirPath);
      if (!existsSync(safePath)) {
        return reply.code(404).send({ error: 'Directory not found' });
      }

      const entries = readdirSync(safePath, { withFileTypes: true }).map((entry) => {
        const fullPath = join(safePath, entry.name);
        let stats = {};
        try {
          const s = statSync(fullPath);
          stats = {
            size: s.size,
            modified: s.mtime.toISOString(),
            permissions: '0' + (s.mode & 0o777).toString(8),
            isSymlink: entry.isSymbolicLink(),
          };
        } catch { /* permission denied */ }

        return {
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? 'directory' : 'file',
          extension: entry.isFile() ? extname(entry.name) : null,
          ...stats,
        };
      });

      // Sort: directories first, then alphabetically
      entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return { path: safePath, entries };
    } catch (err) {
      return reply.code(403).send({ error: err.message });
    }
  });

  // ─── Read File Content ─────────────────────────────────
  app.get('/read', async (request, reply) => {
    const { path: filePath } = request.query;
    if (!filePath) return reply.code(400).send({ error: 'Path required' });

    try {
      const safePath = validatePath(filePath);
      const stat = statSync(safePath);

      if (stat.size > 5 * 1024 * 1024) {
        return reply.code(413).send({ error: 'File too large to edit (>5MB)' });
      }

      const content = readFileSync(safePath, 'utf-8');
      return { path: safePath, content, size: stat.size };
    } catch (err) {
      return reply.code(403).send({ error: err.message });
    }
  });

  // ─── Save File Content ─────────────────────────────────
  app.put('/save', async (request, reply) => {
    const { path: filePath, content } = request.body || {};
    if (!filePath || content === undefined) {
      return reply.code(400).send({ error: 'Path and content required' });
    }

    try {
      const safePath = validatePath(filePath);
      writeFileSync(safePath, content);
      return { success: true, path: safePath };
    } catch (err) {
      return reply.code(403).send({ error: err.message });
    }
  });

  // ─── Upload File ───────────────────────────────────────
  app.post('/upload', async (request, reply) => {
    const targetDir = request.query.path || DEFAULT_ROOT;

    try {
      const safePath = validatePath(targetDir);
      if (!existsSync(safePath)) mkdirSync(safePath, { recursive: true });

      const parts = request.parts();
      const uploaded = [];

      for await (const part of parts) {
        if (part.type === 'file') {
          const dest = join(safePath, part.filename);
          await pipeline(part.file, createWriteStream(dest));
          uploaded.push({ name: part.filename, path: dest });
        }
      }

      return { success: true, uploaded };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // ─── Delete File/Directory ─────────────────────────────
  app.delete('/', async (request, reply) => {
    const { path: targetPath } = request.query;
    if (!targetPath) return reply.code(400).send({ error: 'Path required' });

    try {
      const safePath = validatePath(targetPath);
      const stat = statSync(safePath);

      if (stat.isDirectory()) {
        await shell(`rm -rf "${safePath}"`);
      } else {
        unlinkSync(safePath);
      }

      return { success: true };
    } catch (err) {
      return reply.code(403).send({ error: err.message });
    }
  });

  // ─── Rename / Move ────────────────────────────────────
  app.post('/rename', async (request, reply) => {
    const { from, to } = request.body || {};
    if (!from || !to) return reply.code(400).send({ error: 'from and to paths required' });

    try {
      const safeFrom = validatePath(from);
      const safeTo = validatePath(to);
      renameSync(safeFrom, safeTo);
      return { success: true };
    } catch (err) {
      return reply.code(403).send({ error: err.message });
    }
  });

  // ─── Create Directory ──────────────────────────────────
  app.post('/mkdir', async (request, reply) => {
    const { path: dirPath } = request.body || {};
    if (!dirPath) return reply.code(400).send({ error: 'Path required' });

    try {
      const safePath = validatePath(dirPath);
      mkdirSync(safePath, { recursive: true });
      return { success: true, path: safePath };
    } catch (err) {
      return reply.code(403).send({ error: err.message });
    }
  });

  // ─── Change Permissions ────────────────────────────────
  app.post('/chmod', async (request, reply) => {
    const { path: targetPath, mode } = request.body || {};
    if (!targetPath || !mode) return reply.code(400).send({ error: 'Path and mode required' });

    try {
      const safePath = validatePath(targetPath);
      chmodSync(safePath, parseInt(mode, 8));
      return { success: true };
    } catch (err) {
      return reply.code(403).send({ error: err.message });
    }
  });

  // ─── Extract Archive ──────────────────────────────────
  app.post('/extract', async (request, reply) => {
    const { path: archivePath, destination } = request.body || {};
    if (!archivePath) return reply.code(400).send({ error: 'Archive path required' });

    try {
      const safePath = validatePath(archivePath);
      const destPath = destination ? validatePath(destination) : dirname(safePath);
      const ext = extname(safePath).toLowerCase();

      let result;
      if (ext === '.zip') {
        result = await shell(`unzip -o "${safePath}" -d "${destPath}"`);
      } else if (safePath.endsWith('.tar.gz') || safePath.endsWith('.tgz')) {
        result = await shell(`tar -xzf "${safePath}" -C "${destPath}"`);
      } else if (safePath.endsWith('.tar.bz2')) {
        result = await shell(`tar -xjf "${safePath}" -C "${destPath}"`);
      } else if (ext === '.tar') {
        result = await shell(`tar -xf "${safePath}" -C "${destPath}"`);
      } else {
        return reply.code(400).send({ error: 'Unsupported archive format' });
      }

      if (result.code !== 0) {
        return reply.code(500).send({ error: 'Extraction failed', details: result.stderr });
      }

      return { success: true, destination: destPath };
    } catch (err) {
      return reply.code(403).send({ error: err.message });
    }
  });
}
