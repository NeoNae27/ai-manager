import {
  JsonFileProviderConfigurationStore,
  ProviderRegistrationService,
  ApplicationProviderManager,
} from './ai-provider/src/index.js';

const store = new JsonFileProviderConfigurationStore('./data/providers.json');
const registrationService = new ProviderRegistrationService({ store });
const providerManager = new ApplicationProviderManager(registrationService);

await providerManager.registerLMStudioProvider({
  baseUrl: 'http://127.0.0.1:1234/v1',
});

const lmstudioHealth = await providerManager.pingProvider('lmstudio', {
  baseUrl: 'http://127.0.0.1:1234/v1',
});

const lmstudioModels = await providerManager.getProviderModels('lmstudio');
await providerManager.setSelectedProvider('lmstudio');
