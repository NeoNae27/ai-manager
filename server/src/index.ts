import type { Server } from 'node:http';

import { createServerApp } from './bootstrap/create-server-app.js';
import { createServerDependencies } from './bootstrap/create-server-dependencies.js';
import { loadServerConfig } from './config/server-config.js';

const startServer = async (): Promise<{
  server: Server;
  close: () => Promise<void>;
}> => {
  const config = loadServerConfig();
  const dependencies = createServerDependencies(config);
  const app = createServerApp(dependencies);

  const server = await new Promise<Server>((resolve, reject) => {
    const httpServer = app.listen(config.port, config.host, () => resolve(httpServer));
    httpServer.once('error', reject);
  });

  const close = async (): Promise<void> =>
    new Promise((resolve, reject) => {
      server.close((error) => {
        dependencies.database.close();

        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

  return {
    server,
    close,
  };
};

const registerShutdown = (close: () => Promise<void>): void => {
  const shutdown = async (): Promise<void> => {
    try {
      await close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to shut down server gracefully.', error);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    void shutdown();
  });

  process.once('SIGTERM', () => {
    void shutdown();
  });
};

try {
  const { server, close } = await startServer();
  registerShutdown(close);

  const address = server.address();
  const renderedAddress =
    typeof address === 'string'
      ? address
      : address
        ? `http://${address.address}:${address.port}`
        : 'unknown';

  console.log(`Server is running at ${renderedAddress}`);
} catch (error) {
  console.error('Failed to start server.', error);
  process.exit(1);
}
