import type { ProviderConfig } from '../../domain/provider.js';
import type { ModelConfig } from '../../domain/model.js';
import type {
  OpenAICompatibleChatRequest,
  OpenAICompatibleChatResponse,
} from '../openai-compatible/contracts.js';

export interface LMStudioProviderConfig extends ProviderConfig {
  id: 'lmstudio';
  compatibilityMode?: 'chat.completions' | 'responses';
}

export interface LMStudioModelConfig extends ModelConfig {
  providerId: 'lmstudio';
  publisher?: string;
}

export interface LMStudioTransport {
  generate(request: OpenAICompatibleChatRequest): Promise<OpenAICompatibleChatResponse>;
}
