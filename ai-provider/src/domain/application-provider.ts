import type { ProviderId } from './provider.js';
import type { ProviderDefinition } from './provider-registration.js';
import type { ProviderRegistrationInput, RegisteredProvider } from './provider-registration.js';
import type { ModelConfig } from './model.js';
import type { ProviderConnectionStatus } from './provider-registration.js';

export interface RegisterProviderOptions {
  baseUrl?: string;
  timeoutMs?: number;
  enabled?: boolean;
  defaultModelId?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderSummary {
  providerId: ProviderId;
  name: string;
  baseUrl: string;
  enabled: boolean;
  selected: boolean;
  modelCount: number;
  healthy: boolean;
  lastCheckedAt: string;
}

export interface ProviderHealthCheckResult {
  providerId: ProviderId;
  status: ProviderConnectionStatus;
}

export interface ProviderModelListResult {
  providerId: ProviderId;
  models: ModelConfig[];
}

export interface ApplicationProviderManagerContract {
  listSupportedProviders(): ProviderDefinition[];
  listProviders(): Promise<ProviderSummary[]>;
  getCurrentProvider(): Promise<RegisteredProvider | undefined>;
  setSelectedProvider(providerId: ProviderId): Promise<RegisteredProvider>;
  registerOllamaProvider(options?: RegisterProviderOptions): Promise<RegisteredProvider>;
  registerLMStudioProvider(options?: RegisterProviderOptions): Promise<RegisteredProvider>;
  saveProvider(providerId: ProviderId, options: RegisterProviderOptions): Promise<RegisteredProvider>;
  pingProvider(providerId: ProviderId, options?: RegisterProviderOptions): Promise<ProviderHealthCheckResult>;
  getProviderModels(providerId: ProviderId, options?: RegisterProviderOptions): Promise<ProviderModelListResult>;
  buildRegistrationInput(providerId: ProviderId, options?: RegisterProviderOptions): ProviderRegistrationInput;
}
