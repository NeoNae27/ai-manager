import {
  ApplicationProviderManager,
  ProviderRegistrationService,
} from '../../../ai-provider/src/index.js';
import { ChatApiService } from '../application/chat-api-service.js';
import type { ServerConfig } from '../config/server-config.js';
import { HealthService } from '../application/health-service.js';
import { ProviderApiService } from '../application/provider-api-service.js';
import { SqliteDatabase } from '../infrastructure/sqlite-database.js';
import { SqliteProviderConfigurationStore } from '../infrastructure/sqlite-provider-configuration-store.js';

export interface ServerDependencies {
  config: ServerConfig;
  database: SqliteDatabase;
  healthService: HealthService;
  providerApiService: ProviderApiService;
  chatApiService: ChatApiService;
}

export const createServerDependencies = (config: ServerConfig): ServerDependencies => {
  const database = new SqliteDatabase(config.databasePath);
  database.initialize();

  const store = new SqliteProviderConfigurationStore(database);
  const providerRegistrationService = new ProviderRegistrationService({ store });
  const providerManager = new ApplicationProviderManager(providerRegistrationService);

  return {
    config,
    database,
    healthService: new HealthService(database),
    providerApiService: new ProviderApiService(providerManager),
    chatApiService: new ChatApiService(providerRegistrationService),
  };
};
