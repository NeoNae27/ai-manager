import type { ProviderId } from './provider.js';

export type ModelUseCase =
  | 'chat'
  | 'summary'
  | 'document_generation'
  | 'reasoning'
  | 'tool_use'
  | 'search';

export interface ModelCapabilities {
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsJsonMode: boolean;
  supportsVision: boolean;
  supportsSystemPrompt: boolean;
}

export interface ModelConfig {
  id: string;
  providerId: ProviderId;
  name: string;
  label: string;
  contextWindow: number;
  maxOutputTokens?: number;
  capabilities: ModelCapabilities;
  supportedUseCases: ModelUseCase[];
  metadata?: Record<string, unknown>;
}
