import type { AIProvider } from './provider.js';
import type { ProviderConfig, ProviderId } from '../domain/provider.js';

export interface ProviderFactory {
  create(config: ProviderConfig): AIProvider;
}

export interface ProviderRegistry {
  register(provider: AIProvider): void;
  registerMany(providers: AIProvider[]): void;
  get(providerId: ProviderId): AIProvider;
  has(providerId: ProviderId): boolean;
  list(): AIProvider[];
  getDefault(): AIProvider | undefined;
}
