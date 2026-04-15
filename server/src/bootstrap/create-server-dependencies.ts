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

export interface ServerDependencies {
  config: ServerConfig;
  database: SqliteDatabase;
  healthService: HealthService;
  providerApiService: ProviderApiService;
  chatApiService: ChatApiService;
  channelApiService: ChannelApiService;
  telegramChannelService: TelegramChannelService;
}

export const createServerDependencies = async (config: ServerConfig): Promise<ServerDependencies> => {
  const database = new SqliteDatabase(config.databasePath);
  database.initialize();

  const store = new SqliteProviderConfigurationStore(database);
  const channelStore = new SqliteChannelStore(database);
  const providerRegistrationService = new ProviderRegistrationService({ store });
  const providerManager = new ApplicationProviderManager(providerRegistrationService);
  const chatApiService = new ChatApiService(providerRegistrationService);
  const telegramChannelService = new TelegramChannelService(channelStore, chatApiService);

  channelStore.ensureTelegramChannel();

  if (config.telegramBotToken && !channelStore.getTelegramBotConfig()?.token) {
    try {
      await telegramChannelService.connect(config.telegramBotToken);
    } catch {
      channelStore.setTelegramChannelStatus('error', 'Failed to initialize Telegram bot from TELEGRAM_BOT_TOKEN.');
    }
  }

  await telegramChannelService.initialize();

  return {
    config,
    database,
    healthService: new HealthService(database),
    providerApiService: new ProviderApiService(providerManager),
    chatApiService,
    channelApiService: new ChannelApiService(channelStore, telegramChannelService),
    telegramChannelService,
  };
};
