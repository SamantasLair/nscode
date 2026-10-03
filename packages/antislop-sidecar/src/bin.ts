#!/usr/bin/env node

import { SidecarServer } from './server.js';

function parseArgs(): { port: number; host: string; token?: string } {
  const args = process.argv.slice(2);
  let port = process.env.ANTISLOP_PORT ? parseInt(process.env.ANTISLOP_PORT, 10) : 4949;
  let host = process.env.ANTISLOP_HOST || '127.0.0.1';
  let token = process.env.ANTISLOP_TOKEN || undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' && i + 1 < args.length) {
      port = parseInt(args[++i]!, 10);
    } else if (arg === '--host' && i + 1 < args.length) {
      host = args[++i]!;
    } else if (arg === '--token' && i + 1 < args.length) {
      token = args[++i]!;
    }
  }

  return { port, host, token };
}

async function main(): Promise<void> {
  const { port, host, token } = parseArgs();

  const server = new SidecarServer({
    port,
    host,
    authToken: token,
  });

  try {
    await server.start();
    const boundPort = server.getPort();
    process.stdout.write(
      `[Antislop Sidecar] Daemon listening on ws://${host}:${boundPort} (PID: ${process.pid})\n`
    );

    const shutdown = async (signal: string) => {
      process.stdout.write(`\n[Antislop Sidecar] Received ${signal}, shutting down gracefully...\n`);
      try {
        await server.stop();
        process.exit(0);
      } catch (err) {
        process.stderr.write(`[Antislop Sidecar] Error during shutdown: ${err}\n`);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    process.stderr.write(`[Antislop Sidecar] Fatal startup error: ${err}\n`);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  main();
}
