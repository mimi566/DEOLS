// ─────────────────────────────────────────────────────────────
// DEOLS — Debian OpenLiteSpeed Management Panel
// Core Daemon Entry Point (Fastify)
// ─────────────────────────────────────────────────────────────

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyWebsocket from '@fastify/websocket';
import fastifyRateLimit from '@fastify/rate-limit';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Config
import { config } from './config.js';

// API Route Modules
import authRoutes from './api/auth.js';
import sitesRoutes from './api/sites.js';
import sslRoutes from './api/ssl.js';
import databaseRoutes from './api/databases.js';
import filesRoutes from './api/files.js';
import terminalRoutes from './api/terminal.js';
import cronRoutes from './api/cron.js';
import firewallRoutes from './api/firewall.js';
import servicesRoutes from './api/services.js';
import gitRoutes from './api/git.js';
import cacheRoutes from './api/cache.js';
import systemRoutes from './api/system.js';
import pythonRoutes from './api/python.js';
import securityRoutes from './api/security.js';
import olsRoutes from './api/ols.js';

// Background Server-Side Automation Daemon
import { startAutomationDaemon, stopAutomationDaemon } from './services/automation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PANEL_VERSION = '1.0.0';

// ─── Bootstrap ──────────────────────────────────────────────

async function bootstrap() {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport: config.isDev
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
    trustProxy: true,
    maxParamLength: 512,
  });

  // ─── Content Parsers ────────────────────────────────────
  // Gracefully handle empty or missing JSON bodies for POST/PUT without throwing 400 Bad Request
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || body.trim() === '') {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (req, body, done) => {
    if (!body || body.trim() === '') return done(null, {});
    try {
      done(null, JSON.parse(body));
    } catch {
      done(null, { text: body });
    }
  });

  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => {
    done(null, {});
  });

  // ─── Global Plugins ─────────────────────────────────────

  await app.register(fastifyCors, {
    origin: config.isDev ? true : [`https://localhost:${config.port}`],
    credentials: true,
  });

  await app.register(fastifyRateLimit, {
    max: 120,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1', '::1'],
  });

  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: 'deols_token', signed: false },
    sign: { expiresIn: '24h' },
  });

  await app.register(fastifyCookie, {
    secret: config.cookieSecret,
  });

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 512 * 1024 * 1024, // 512 MB
      files: 10,
    },
  });

  await app.register(fastifyWebsocket);

  // ─── Auth Decorator ─────────────────────────────────────

  app.decorate('authenticate', async (request, reply) => {
    try {
      // Try cookie first, then Authorization header
      const token =
        request.cookies?.deols_token ||
        request.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (!token) {
        return reply.code(401).send({ error: 'Authentication required' });
      }
      request.user = app.jwt.verify(token);
    } catch (err) {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }
  });

  // ─── API Routes ─────────────────────────────────────────

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(sitesRoutes, { prefix: '/api/sites' });
  await app.register(sslRoutes, { prefix: '/api/ssl' });
  await app.register(databaseRoutes, { prefix: '/api/databases' });
  await app.register(filesRoutes, { prefix: '/api/files' });
  await app.register(terminalRoutes, { prefix: '/api/terminal' });
  await app.register(cronRoutes, { prefix: '/api/cron' });
  await app.register(firewallRoutes, { prefix: '/api/firewall' });
  await app.register(servicesRoutes, { prefix: '/api/services' });
  await app.register(gitRoutes, { prefix: '/api/git' });
  await app.register(cacheRoutes, { prefix: '/api/cache' });
  await app.register(systemRoutes, { prefix: '/api/system' });
  await app.register(pythonRoutes, { prefix: '/api/python' });
  await app.register(securityRoutes, { prefix: '/api/security' });
  await app.register(olsRoutes, { prefix: '/api/ols' });

  // ─── Panel Info Endpoint ────────────────────────────────

  app.get('/api/info', async () => ({
    name: 'DEOLS',
    version: PANEL_VERSION,
    os: 'Debian 12 (Bookworm)',
    engine: 'OpenLiteSpeed',
  }));

  // ─── Static Frontend Assets ─────────────────────────────

  const frontendPath = join(__dirname, '..', 'frontend', 'dist');
  if (existsSync(frontendPath)) {
    await app.register(fastifyStatic, {
      root: frontendPath,
      prefix: '/',
      wildcard: false,
      setHeaders: (res, path) => {
        if (path.endsWith('.html') || path.endsWith('.js') || path.endsWith('.css')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    });

    // SPA fallback — serve index.html for all non-API routes
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Endpoint not found' });
      }
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      return reply.sendFile('index.html');
    });
  }

  // ─── Global Error Handler ──────────────────────────────

  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode || 500;
    reply.code(statusCode).send({
      error: statusCode >= 500 ? 'Internal server error' : error.message,
      ...(config.isDev && { stack: error.stack }),
    });
  });

  // ─── Start Server ──────────────────────────────────────

  try {
    await app.listen({
      port: config.port,
      host: config.host,
    });
    app.log.info(
      `\n` +
      `╔══════════════════════════════════════════════╗\n` +
      `║   DEOLS Panel v${PANEL_VERSION} — Running               ║\n` +
      `║   → https://${config.host}:${config.port}                 ║\n` +
      `╚══════════════════════════════════════════════╝`
    );

    // Auto-repair OpenLiteSpeed listeners (remap 8088 to 80, setup 443) and sync virtual hosts
    try {
      const { syncAllVirtualHosts } = await import('./utils/ols-config.js');
      syncAllVirtualHosts();
      app.log.info('✓ OpenLiteSpeed dual listeners (Port 80 & 443) and Virtual Hosts synchronized');
    } catch (e) {
      app.log.warn(`OLS initial sync warning: ${e.message}`);
    }

    // Initialize and start server-side automation & cron engine
    startAutomationDaemon();
    app.log.info('✓ Server-side automation daemon started (WP-Cron, SSL renewal, OLS maintenance)');
  } catch (err) {
    app.log.fatal(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal) => {
    app.log.info(`Received ${signal}. Shutting down gracefully…`);
    stopAutomationDaemon();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
