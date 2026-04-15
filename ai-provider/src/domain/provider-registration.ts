import type { ModelConfig } from './model.js';
import type { ProviderAuthConfig, ProviderConfig, ProviderId, ProviderKind } from './provider.js';

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  kind: ProviderKind;
  description: string;
  defaultBaseUrl: string;
  auth: ProviderAuthConfig;
}

export interface ProviderRegistrationInput {
  providerId: ProviderId;
  baseUrl: string;
  timeoutMs?: number;
  enabled?: boolean;
  defaultModelId?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderConnectionStatus {
  providerId: ProviderId;
  baseUrl: string;
  ok: boolean;
  checkedAt: string;
  latencyMs: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface RegisteredProvider {
  config: ProviderConfig;
  models: ModelConfig[];
  connection: ProviderConnectionStatus;
  createdAt: string;
  updatedAt: string;
}
