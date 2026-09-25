// ─────────────────────────────────────────────────────────────
// DEOLS Auth API — Login, Logout, Session Management
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';

const USERS_FILE = join(config.dataDir, 'users.json');

function loadUsers() {
  if (!existsSync(USERS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(USERS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveUsers(users) {
  if (!existsSync(config.dataDir)) mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
}

export default async function authRoutes(app) {
  // ─── Setup Guard (Web creation disabled — Root SSH only) ─
  app.post('/setup', async (request, reply) => {
    return reply.code(403).send({
      error: 'Web-based account setup is disabled for security. Please connect to your server via root SSH and run: deols admin reset',
    });
  });

  // ─── Login ──────────────────────────────────────────────
  app.post(
    '/login',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '5 minutes' },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body || {};
      if (!username || !password) {
        return reply.code(400).send({ error: 'Username and password required' });
      }

      const users = loadUsers();
      const user = users.find((u) => u.username === username);
      if (!user) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      const argon2 = await import('argon2');
      const valid = await argon2.verify(user.passwordHash, password);
      if (!valid) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      const token = app.jwt.sign({ id: user.id, username: user.username, role: user.role });
      reply
        .setCookie('deols_token', token, {
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
          maxAge: 86400,
        })
        .send({
          success: true,
          token,
          user: { id: user.id, username: user.username, role: user.role },
        });
    }
  );

  // ─── Logout ─────────────────────────────────────────────
  app.post('/logout', async (request, reply) => {
    reply.clearCookie('deols_token', { path: '/' }).send({ success: true });
  });

  // ─── Current User ──────────────────────────────────────
  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const users = loadUsers();
    const user = users.find((u) => u.id === request.user.id);
    if (!user) return { error: 'User not found' };
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };
  });

  // ─── Check if setup is needed ──────────────────────────
  app.get('/status', async () => {
    const users = loadUsers();
    return { initialized: users.length > 0 };
  });

  // ─── Change Password (Disabled via Web — Root SSH only) 
  app.put('/password', { preHandler: [app.authenticate] }, async (request, reply) => {
    return reply.code(403).send({
      error: 'Password modification via web interface is disabled for server security. Please login to root SSH and execute: deols admin setpass <password> or deols admin reset',
    });
  });
}
