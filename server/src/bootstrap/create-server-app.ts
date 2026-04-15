import express, { Router } from 'express';
import type { Express } from 'express';
import type { ServerDependencies } from './create-server-dependencies.js';
import { createHealthRouter } from '../http/routes/health-routes.js';
import { createChatRouter } from '../http/routes/chat-routes.js';
import { createChannelRouter } from '../http/routes/channel-routes.js';
import { createProviderRouter } from '../http/routes/provider-routes.js';
import { notFoundHandler } from '../http/middleware/not-found-handler.js';
import { errorHandler } from '../http/middleware/error-handler.js';

export const createServerApp = ({
  config,
  healthService,
  providerApiService,
  chatApiService,
  channelApiService,
}: ServerDependencies): Express => {
  const app = express();
  const apiRouter = Router();

  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/health', createHealthRouter(healthService));

  apiRouter.use('/providers', createProviderRouter(providerApiService));
  apiRouter.use('/chat', createChatRouter(chatApiService));
  apiRouter.use('/channels', createChannelRouter(channelApiService));
  app.use(config.apiPrefix, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
