import type { OllamaTransport, OllamaGenerateRequest, OllamaGenerateResponse } from './types.js';
import { postJson } from '../shared/http.js';

const getOllamaChatPath = (baseUrl: string): string => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  return normalizedBaseUrl.endsWith('/api') ? '/chat' : '/api/chat';
};

export const createOllamaTransport = (
  baseUrl: string,
  timeoutMs: number,
): OllamaTransport => ({
  generate: (request: OllamaGenerateRequest): Promise<OllamaGenerateResponse> =>
    postJson<OllamaGenerateResponse>(baseUrl, getOllamaChatPath(baseUrl), timeoutMs, request),
});
