import type { Server } from 'node:http';

import { createServerApp } from './bootstrap/create-server-app.js';
import { createServerDependencies } from './bootstrap/create-server-dependencies.js';
import { loadServerConfig } from './config/server-config.js';
import { createLogger } from './logging/logger.js';

const logger = createLogger('server');

const startServer = async (): Promise<{
  server: Server;
  close: () => Promise<void>;
}> => {
  const config = loadServerConfig();
  logger.info('Server configuration loaded.', {
    host: config.host,
    port: config.port,
    apiPrefix: config.apiPrefix,
    databasePath: config.databasePath,
    telegramConfigured: Boolean(config.telegramBotToken),
  });
  logger.info('Starting server.');

  const dependencies = await createServerDependencies(config, logger);
  const app = createServerApp(dependencies);

  const server = await new Promise<Server>((resolve, reject) => {
    const httpServer = app.listen(config.port, config.host, () => resolve(httpServer));
    httpServer.once('error', reject);
  });

  const close = async (): Promise<void> =>
    new Promise((resolve, reject) => {
      server.close((error) => {
        dependencies.telegramChannelService.dispose();
        dependencies.database.close();

        if (error) {
          logger.error('Graceful shutdown failed.', {
            error: error instanceof Error ? error.message : String(error),
          });
          reject(error);
          return;
        }

        logger.info('Graceful shutdown completed.');
        resolve();
      });
    });

  return {
    server,
    close,
  };
};

const registerShutdown = (close: () => Promise<void>): void => {
  const shutdown = async (signal: 'SIGINT' | 'SIGTERM'): Promise<void> => {
    logger.info('Shutdown signal received.', { signal });

    try {
      await close();
      process.exit(0);
    } catch (error) {
      logger.error('Failed to shut down server gracefully.', {
        signal,
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
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

  logger.info('Server started successfully.', {
    address: renderedAddress,
  });
} catch (error) {
  logger.error('Failed to start server.', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}
