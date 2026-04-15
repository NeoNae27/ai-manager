import type {
  ProviderConnectionStatus,
  ProviderDefinition,
  ProviderRegistrationInput,
  RegisteredProvider,
} from '../domain/provider-registration.js';
import type { ModelConfig } from '../domain/model.js';
import type { ProviderId } from '../domain/provider.js';

export interface ProviderConfigurationStore {
  list(): Promise<RegisteredProvider[]>;
  get(providerId: ProviderId): Promise<RegisteredProvider | undefined>;
  save(provider: RegisteredProvider): Promise<void>;
  delete(providerId: ProviderId): Promise<void>;
  getSelectedProviderId(): Promise<ProviderId | undefined>;
  setSelectedProviderId(providerId: ProviderId): Promise<void>;
}

export interface ProviderRegistrationServiceContract {
  listSupportedProviders(): ProviderDefinition[];
  listRegisteredProviders(): Promise<RegisteredProvider[]>;
  getRegisteredProvider(providerId: ProviderId): Promise<RegisteredProvider | undefined>;
  getSelectedProvider(): Promise<RegisteredProvider | undefined>;
  selectProvider(providerId: ProviderId): Promise<RegisteredProvider>;
  checkConnection(input: ProviderRegistrationInput): Promise<ProviderConnectionStatus>;
  listAvailableModels(input: ProviderRegistrationInput): Promise<ModelConfig[]>;
  saveConfiguration(input: ProviderRegistrationInput): Promise<RegisteredProvider>;
  registerProvider(input: ProviderRegistrationInput): Promise<RegisteredProvider>;
}
