// ─────────────────────────────────────────────────────────────
// DEOLS Terminal API — WebSocket PTY Terminal
// ─────────────────────────────────────────────────────────────

export default async function terminalRoutes(app) {
  // WebSocket terminal endpoint
  app.get(
    '/ws',
    { websocket: true, preHandler: [app.authenticate] },
    (socket, request) => {
      let ptyProcess = null;

      try {
        // node-pty is an optional dependency — only works on Linux
        import('node-pty').then((pty) => {
          ptyProcess = pty.spawn('/bin/bash', [], {
            name: 'xterm-256color',
            cols: 120,
            rows: 40,
            cwd: '/root',
            env: {
              ...process.env,
              TERM: 'xterm-256color',
            },
          });

          ptyProcess.onData((data) => {
            try {
              socket.send(JSON.stringify({ type: 'output', data }));
            } catch { /* client disconnected */ }
          });

          ptyProcess.onExit(({ exitCode }) => {
            try {
              socket.send(JSON.stringify({ type: 'exit', code: exitCode }));
              socket.close();
            } catch { /* already closed */ }
          });

          socket.on('message', (raw) => {
            try {
              const msg = JSON.parse(raw.toString());
              switch (msg.type) {
                case 'input':
                  ptyProcess.write(msg.data);
                  break;
                case 'resize':
                  ptyProcess.resize(msg.cols || 120, msg.rows || 40);
                  break;
              }
            } catch { /* invalid message */ }
          });
        }).catch((err) => {
          socket.send(JSON.stringify({
            type: 'error',
            data: 'Terminal not available: ' + err.message,
          }));
        });
      } catch (err) {
        socket.send(JSON.stringify({ type: 'error', data: err.message }));
      }

      socket.on('close', () => {
        if (ptyProcess) {
          try { ptyProcess.kill(); } catch { /* already dead */ }
        }
      });
    }
  );

  // ─── Execute single command (non-interactive) ──────────
  app.post(
    '/exec',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { command, cwd = '/root', timeout = 30000 } = request.body || {};
      if (!command) return reply.code(400).send({ error: 'Command required' });

      // Blocklist dangerous patterns
      const blocked = ['rm -rf /', 'mkfs', ':(){', 'dd if='];
      if (blocked.some((b) => command.includes(b))) {
        return reply.code(403).send({ error: 'Command blocked for safety' });
      }

      const { shell } = await import('../utils/shell.js');
      const result = await shell(command, { cwd, timeout });
      return result;
    }
  );
}
