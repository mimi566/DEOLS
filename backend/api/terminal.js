import { existsSync } from 'fs';
import { spawn } from 'child_process';

export default async function terminalRoutes(app) {
  // ─── WebSocket Terminal Endpoint ────────────────────────
  app.get(
    '/ws',
    { websocket: true },
    (socket, request) => {
      // Authenticate via query param token, cookie, or auth header
      const token =
        request.query?.token ||
        request.cookies?.deols_token ||
        request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        socket.send(JSON.stringify({ type: 'error', data: 'Authentication required' }));
        socket.close();
        return;
      }

      try {
        app.jwt.verify(token);
      } catch (err) {
        socket.send(JSON.stringify({ type: 'error', data: 'Invalid or expired token' }));
        socket.close();
        return;
      }

      const defaultCwd = existsSync('/root') ? '/root' : (existsSync('/opt/deols') ? '/opt/deols' : '/tmp');
      let ptyProcess = null;
      let fallbackProcess = null;

      // 1. Try node-pty (real pseudo-terminal for xterm.js / full interactive bash)
      import('node-pty')
        .then((pty) => {
          ptyProcess = pty.spawn('/bin/bash', [], {
            name: 'xterm-256color',
            cols: 120,
            rows: 40,
            cwd: defaultCwd,
            env: {
              ...process.env,
              TERM: 'xterm-256color',
            },
          });

          ptyProcess.onData((data) => {
            try {
              socket.send(JSON.stringify({ type: 'output', data }));
            } catch {}
          });

          ptyProcess.onExit(({ exitCode }) => {
            try {
              socket.send(JSON.stringify({ type: 'exit', code: exitCode }));
              socket.close();
            } catch {}
          });

          socket.on('message', (raw) => {
            try {
              const msg = JSON.parse(raw.toString());
              if (msg.type === 'input') ptyProcess.write(msg.data);
              else if (msg.type === 'resize') ptyProcess.resize(msg.cols || 120, msg.rows || 40);
            } catch {}
          });
        })
        .catch(() => {
          // 2. Fallback: standard child_process spawn
          try {
            fallbackProcess = spawn('/bin/bash', ['-i'], {
              cwd: defaultCwd,
              env: process.env,
            });

            fallbackProcess.stdout.on('data', (d) => {
              try { socket.send(JSON.stringify({ type: 'output', data: d.toString() })); } catch {}
            });

            fallbackProcess.stderr.on('data', (d) => {
              try { socket.send(JSON.stringify({ type: 'output', data: d.toString() })); } catch {}
            });

            fallbackProcess.on('close', (code) => {
              try { socket.send(JSON.stringify({ type: 'exit', code })); socket.close(); } catch {}
            });

            socket.on('message', (raw) => {
              try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === 'input') fallbackProcess.stdin.write(msg.data);
              } catch {}
            });
          } catch (spawnErr) {
            socket.send(JSON.stringify({ type: 'error', data: `Terminal failed to spawn: ${spawnErr.message}` }));
          }
        });

      socket.on('close', () => {
        if (ptyProcess) {
          try { ptyProcess.kill(); } catch {}
        }
        if (fallbackProcess) {
          try { fallbackProcess.kill(); } catch {}
        }
      });
    }
  );

  // ─── Execute Single Command (Non-Interactive Fallback) ───
  app.post(
    '/exec',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { command, cwd, timeout = 30000 } = request.body || {};
      if (!command) return reply.code(400).send({ error: 'Command required' });

      // Blocklist destructive commands
      const blocked = ['rm -rf /', 'mkfs', ':(){', 'dd if='];
      if (blocked.some((b) => command.includes(b))) {
        return reply.code(403).send({ error: 'Command blocked for safety' });
      }

      const targetCwd = cwd || (existsSync('/root') ? '/root' : (existsSync('/opt/deols') ? '/opt/deols' : '/tmp'));
      const { shell } = await import('../utils/shell.js');
      const result = await shell(command, { cwd: targetCwd, timeout });
      return result;
    }
  );
}
