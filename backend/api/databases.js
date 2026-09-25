// ─────────────────────────────────────────────────────────────
// DEOLS Databases API — MariaDB Management
// ─────────────────────────────────────────────────────────────

import { config } from '../config.js';
import { shell } from '../utils/shell.js';

export default async function databaseRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  // ─── List Databases ────────────────────────────────────
  app.get('/', async (request, reply) => {
    const result = await shell(
      `mysql -u root -e "SELECT SCHEMA_NAME, DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME NOT IN ('information_schema','mysql','performance_schema','sys')" -B -N`
    );
    if (result.code !== 0) {
      return reply.code(500).send({ error: 'Failed to list databases', details: result.stderr });
    }

    const databases = result.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, charset, collation] = line.split('\t');
        return { name, charset, collation };
      });

    return { databases };
  });

  // ─── Create Database ───────────────────────────────────
  app.post('/', async (request, reply) => {
    const { name, charset = 'utf8mb4', collation = 'utf8mb4_unicode_ci' } = request.body || {};
    if (!name) return reply.code(400).send({ error: 'Database name required' });

    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '');
    const result = await shell(
      `mysql -u root -e "CREATE DATABASE \\\`${safeName}\\\` CHARACTER SET ${charset} COLLATE ${collation};"`
    );

    if (result.code !== 0) {
      return reply.code(500).send({ error: 'Failed to create database', details: result.stderr });
    }

    return { success: true, database: safeName };
  });

  // ─── Delete Database ───────────────────────────────────
  app.delete('/:name', async (request, reply) => {
    const safeName = request.params.name.replace(/[^a-zA-Z0-9_]/g, '');
    const result = await shell(`mysql -u root -e "DROP DATABASE IF EXISTS \\\`${safeName}\\\`;"`);

    if (result.code !== 0) {
      return reply.code(500).send({ error: 'Failed to drop database', details: result.stderr });
    }

    return { success: true };
  });

  // ─── List Database Users ───────────────────────────────
  app.get('/users', async (request, reply) => {
    const result = await shell(
      `mysql -u root -e "SELECT User, Host FROM mysql.user WHERE User NOT IN ('root','mysql.sys','mysql.session','mysql.infoschema','mariadb.sys','debian-sys-maint')" -B -N`
    );

    const users = (result.stdout || '')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [user, host] = line.split('\t');
        return { user, host };
      });

    return { users };
  });

  // ─── Create Database User ─────────────────────────────
  app.post('/users', async (request, reply) => {
    const { username, password, database, host = 'localhost' } = request.body || {};
    if (!username || !password) {
      return reply.code(400).send({ error: 'Username and password required' });
    }

    const safeUser = username.replace(/[^a-zA-Z0-9_]/g, '');
    let sql = `CREATE USER '${safeUser}'@'${host}' IDENTIFIED BY '${password}';`;

    if (database) {
      const safeDb = database.replace(/[^a-zA-Z0-9_]/g, '');
      sql += ` GRANT ALL PRIVILEGES ON \\\`${safeDb}\\\`.* TO '${safeUser}'@'${host}'; FLUSH PRIVILEGES;`;
    }

    const result = await shell(`mysql -u root -e "${sql}"`);
    if (result.code !== 0) {
      return reply.code(500).send({ error: 'Failed to create user', details: result.stderr });
    }

    return { success: true, username: safeUser };
  });

  // ─── Delete Database User ─────────────────────────────
  app.delete('/users/:username', async (request, reply) => {
    const safeUser = request.params.username.replace(/[^a-zA-Z0-9_]/g, '');
    const host = request.query.host || 'localhost';

    const result = await shell(`mysql -u root -e "DROP USER IF EXISTS '${safeUser}'@'${host}';"`);
    if (result.code !== 0) {
      return reply.code(500).send({ error: 'Failed to delete user', details: result.stderr });
    }

    return { success: true };
  });

  // ─── Change Database User Password ────────────────────
  app.put('/users/:username/password', async (request, reply) => {
    const { password, host = 'localhost', syncDomain } = request.body || {};
    if (!password) return reply.code(400).send({ error: 'Password is required' });

    const safeUser = request.params.username.replace(/[^a-zA-Z0-9_]/g, '');
    const safePass = password.replace(/['"\\]/g, '');

    const result = await shell(
      `mysql -u root -e "ALTER USER '${safeUser}'@'${host}' IDENTIFIED BY '${safePass}'; FLUSH PRIVILEGES;" 2>/dev/null || mariadb -u root -e "SET PASSWORD FOR '${safeUser}'@'${host}' = PASSWORD('${safePass}'); FLUSH PRIVILEGES;"`
    );

    if (result.code !== 0) {
      return reply.code(500).send({ error: 'Failed to update database password', details: result.stderr });
    }

    // Automatically update wp-config.php if syncDomain is specified
    if (syncDomain) {
      const { existsSync, readFileSync, writeFileSync } = await import('fs');
      const { join } = await import('path');
      const cleanDomain = syncDomain.replace(/[^a-z0-9.\-]/gi, '').toLowerCase();
      const wpConfigPath = join(config.webRoot, cleanDomain, 'public_html', 'wp-config.php');

      if (existsSync(wpConfigPath)) {
        try {
          let content = readFileSync(wpConfigPath, 'utf-8');
          content = content.replace(
            /define\(\s*['"]DB_PASSWORD['"]\s*,\s*['"].*?['"]\s*\);/g,
            `define( 'DB_PASSWORD', '${safePass}' );`
          );
          writeFileSync(wpConfigPath, content);
        } catch {}
      }
    }

    return { success: true, username: safeUser };
  });

  // ─── Repair & Optimize Database ───────────────────────
  app.post('/:name/repair', async (request, reply) => {
    const safeName = request.params.name.replace(/[^a-zA-Z0-9_]/g, '');
    const result = await shell(`mysqlcheck -u root --auto-repair --optimize --databases "${safeName}" 2>&1`);

    return {
      success: result.code === 0,
      output: result.stdout || result.stderr,
      database: safeName,
    };
  });
}
