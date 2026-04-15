import type { ProviderConfig } from '../../domain/provider.js';
import type { ModelConfig } from '../../domain/model.js';

export interface OllamaProviderConfig extends ProviderConfig {
  id: 'ollama';
  keepAlive?: string;
}

export interface OllamaModelConfig extends ModelConfig {
  providerId: 'ollama';
  family?: string;
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface OllamaGenerateRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream?: boolean;
  format?: 'json';
  keep_alive?: string;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
    stop?: string[];
    seed?: number;
  };
}

export interface OllamaGenerateResponse {
  model: string;
  created_at?: string;
  message: OllamaChatMessage;
  done: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
}

export interface OllamaTransport {
  generate(request: OllamaGenerateRequest): Promise<OllamaGenerateResponse>;
}
