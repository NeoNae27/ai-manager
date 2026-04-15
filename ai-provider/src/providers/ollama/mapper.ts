import type { GenerationRequest, GenerationResult } from '../../contracts/generation.js';
import type { FinishReason } from '../../domain/generation.js';
import type { Message, MessageContent } from '../../domain/message.js';
import type { OllamaGenerateRequest, OllamaGenerateResponse, OllamaChatMessage } from './types.js';

const normalizeContent = (content: MessageContent): string => {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
};

const toOllamaMessage = (message: Message): OllamaChatMessage => ({
  role: message.role,
  content: normalizeContent(message.content),
  ...(message.toolCalls
    ? {
        tool_calls: message.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: toolCall.arguments,
          },
        })),
      }
    : {}),
});

const toFinishReason = (reason?: string): FinishReason => {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
      return 'tool_calls';
    default:
      return 'unknown';
  }
};

export const mapToOllamaRequest = (
  request: GenerationRequest,
  keepAlive?: string,
): OllamaGenerateRequest => {
  const options: NonNullable<OllamaGenerateRequest['options']> = {};

  if (request.generation?.temperature !== undefined) {
    options.temperature = request.generation.temperature;
  }

  if (request.generation?.topP !== undefined) {
    options.top_p = request.generation.topP;
  }

  if (request.generation?.maxTokens !== undefined) {
    options.num_predict = request.generation.maxTokens;
  }

  if (request.generation?.stop !== undefined) {
    options.stop = request.generation.stop;
  }

  if (request.generation?.seed !== undefined) {
    options.seed = request.generation.seed;
  }

  return {
    model: request.model.name,
    messages: request.messages.map(toOllamaMessage),
    ...(request.generation?.stream !== undefined ? { stream: request.generation.stream } : {}),
    ...(request.generation?.jsonMode === 'object' ? { format: 'json' as const } : {}),
    ...(keepAlive ? { keep_alive: keepAlive } : {}),
    ...(Object.keys(options).length > 0 ? { options } : {}),
  };
};

export const mapFromOllamaResponse = (
  request: GenerationRequest,
  response: OllamaGenerateResponse,
): GenerationResult => {
  const usage =
    response.prompt_eval_count !== undefined || response.eval_count !== undefined
      ? {
          ...(response.prompt_eval_count !== undefined
            ? { inputTokens: response.prompt_eval_count }
            : {}),
          ...(response.eval_count !== undefined ? { outputTokens: response.eval_count } : {}),
          ...(response.prompt_eval_count !== undefined && response.eval_count !== undefined
            ? { totalTokens: response.prompt_eval_count + response.eval_count }
            : {}),
        }
      : undefined;

  return {
    model: request.model,
    message: {
      role: response.message.role,
      content: response.message.content,
    },
    ...(usage ? { usage } : {}),
    finishReason: toFinishReason(response.done_reason),
    providerMetadata: {
      createdAt: response.created_at,
      totalDuration: response.total_duration,
      done: response.done,
    },
    raw: response,
  };
};
