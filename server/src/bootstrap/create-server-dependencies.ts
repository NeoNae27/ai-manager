import {
  ApplicationProviderManager,
  ProviderRegistrationService,
} from '../../../ai-provider/src/index.js';
import { ChatApiService } from '../application/chat-api-service.js';
import { ChannelApiService } from '../application/channel-api-service.js';
import { TelegramChannelService } from '../application/telegram-channel-service.js';
import type { ServerConfig } from '../config/server-config.js';
import { HealthService } from '../application/health-service.js';
import { ProviderApiService } from '../application/provider-api-service.js';
import { SqliteDatabase } from '../infrastructure/sqlite-database.js';
import { SqliteChannelStore } from '../infrastructure/sqlite-channel-store.js';
import { SqliteProviderConfigurationStore } from '../infrastructure/sqlite-provider-configuration-store.js';
import type { Logger } from '../logging/logger.js';

export interface ServerDependencies {
  config: ServerConfig;
  logger: Logger;
  database: SqliteDatabase;
  healthService: HealthService;
  providerApiService: ProviderApiService;
  chatApiService: ChatApiService;
  channelApiService: ChannelApiService;
  telegramChannelService: TelegramChannelService;
}

export const createServerDependencies = async (
  config: ServerConfig,
  logger: Logger,
): Promise<ServerDependencies> => {
  const bootstrapLogger = logger.scope('bootstrap');
  bootstrapLogger.info('Initializing server dependencies.', {
    databasePath: config.databasePath,
    apiPrefix: config.apiPrefix,
  });

  const database = new SqliteDatabase(config.databasePath);
  database.initialize();
  bootstrapLogger.info('Database initialized.', {
    databasePath: config.databasePath,
  });

  const store = new SqliteProviderConfigurationStore(database);
  const channelStore = new SqliteChannelStore(database);
  const providerRegistrationService = new ProviderRegistrationService({ store });
  const providerManager = new ApplicationProviderManager(providerRegistrationService);
  const chatApiService = new ChatApiService(providerRegistrationService, logger.scope('chat'));
  const telegramChannelService = new TelegramChannelService(
    channelStore,
    chatApiService,
    logger.scope('telegram'),
  );

  channelStore.ensureTelegramChannel();
  bootstrapLogger.info('Channel store is ready.');

  if (config.telegramBotToken && !channelStore.getTelegramBotConfig()?.token) {
    try {
      bootstrapLogger.info('Connecting Telegram bot from environment configuration.');
      await telegramChannelService.connect(config.telegramBotToken);
    } catch {
      bootstrapLogger.warn('Failed to initialize Telegram bot from environment configuration.');
      channelStore.setTelegramChannelStatus('error', 'Failed to initialize Telegram bot from TELEGRAM_BOT_TOKEN.');
    }
  }

  await telegramChannelService.initialize();
  bootstrapLogger.info('Server dependencies initialized successfully.');

  return {
    config,
    logger,
    database,
    healthService: new HealthService(database),
    providerApiService: new ProviderApiService(providerManager, logger.scope('provider')),
    chatApiService,
    channelApiService: new ChannelApiService(channelStore, telegramChannelService, logger.scope('channel')),
    telegramChannelService,
  };
};
