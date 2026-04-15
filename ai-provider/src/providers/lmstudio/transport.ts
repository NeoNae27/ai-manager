import type {
  OpenAICompatibleChatRequest,
  OpenAICompatibleChatResponse,
} from '../openai-compatible/contracts.js';
import type { LMStudioTransport } from './types.js';
import { postJson } from '../shared/http.js';

const getLMStudioChatPath = (baseUrl: string): string => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  return normalizedBaseUrl.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions';
};

export const createLMStudioTransport = (
  baseUrl: string,
  timeoutMs: number,
): LMStudioTransport => ({
  generate: (request: OpenAICompatibleChatRequest): Promise<OpenAICompatibleChatResponse> =>
    postJson<OpenAICompatibleChatResponse>(
      baseUrl,
      getLMStudioChatPath(baseUrl),
      timeoutMs,
      request,
    ),
});
