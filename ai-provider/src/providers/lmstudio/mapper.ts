import type { GenerationRequest, GenerationResult } from '../../contracts/generation.js';
import type { FinishReason, ToolChoice } from '../../domain/generation.js';
import type { Message, MessageContent } from '../../domain/message.js';
import type {
  OpenAICompatibleChatRequest,
  OpenAICompatibleChatResponse,
  OpenAICompatibleMessage,
} from '../openai-compatible/contracts.js';

const normalizeContent = (content: MessageContent): string => {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
};

const mapToolChoice = (
  toolChoice?: ToolChoice,
): OpenAICompatibleChatRequest['tool_choice'] => {
  if (!toolChoice) {
    return undefined;
  }

  if (typeof toolChoice === 'string') {
    return toolChoice;
  }

  return {
    type: 'function',
    function: {
      name: toolChoice.name,
    },
  };
};

const toOpenAIMessage = (message: Message): OpenAICompatibleMessage => ({
  role: message.role,
  content: normalizeContent(message.content),
  ...(message.name ? { name: message.name } : {}),
  ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
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

const toFinishReason = (reason?: string | null): FinishReason => {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
      return 'tool_calls';
    case 'content_filter':
      return 'content_filter';
    default:
      return 'unknown';
  }
};

export const mapToLMStudioRequest = (request: GenerationRequest): OpenAICompatibleChatRequest => {
  const toolChoice = mapToolChoice(request.generation?.toolChoice);

  return {
    model: request.model.name,
    messages: request.messages.map(toOpenAIMessage),
    ...(request.generation?.stream !== undefined ? { stream: request.generation.stream } : {}),
    ...(request.generation?.temperature !== undefined
      ? { temperature: request.generation.temperature }
      : {}),
    ...(request.generation?.topP !== undefined ? { top_p: request.generation.topP } : {}),
    ...(request.generation?.maxTokens !== undefined
      ? { max_tokens: request.generation.maxTokens }
      : {}),
    ...(request.generation?.stop !== undefined ? { stop: request.generation.stop } : {}),
    ...(request.generation?.seed !== undefined ? { seed: request.generation.seed } : {}),
    ...(request.tools
      ? {
          tools: request.tools.map((tool) => ({
            type: 'function',
            function: {
              name: tool.name,
              ...(tool.description ? { description: tool.description } : {}),
              ...(tool.parameters ? { parameters: tool.parameters } : {}),
            },
          })),
        }
      : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
    ...(request.generation?.jsonMode === 'object'
      ? { response_format: { type: 'json_object' as const } }
      : {}),
  };
};

export const mapFromLMStudioResponse = (
  request: GenerationRequest,
  response: OpenAICompatibleChatResponse,
): GenerationResult => {
  const choice = response.choices[0];

  if (!choice) {
    throw new Error('LM Studio response does not contain choices.');
  }

  return {
    model: request.model,
    message: {
      role: choice.message.role,
      content: choice.message.content ?? '',
      ...(choice.message.name ? { name: choice.message.name } : {}),
      ...(choice.message.tool_call_id ? { toolCallId: choice.message.tool_call_id } : {}),
      ...(choice.message.tool_calls
        ? {
            toolCalls: choice.message.tool_calls.map((toolCall) => ({
              id: toolCall.id,
              type: 'function',
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            })),
          }
        : {}),
    },
    ...(response.usage
      ? {
          usage: {
            ...(response.usage.prompt_tokens !== undefined
              ? { inputTokens: response.usage.prompt_tokens }
              : {}),
            ...(response.usage.completion_tokens !== undefined
              ? { outputTokens: response.usage.completion_tokens }
              : {}),
            ...(response.usage.total_tokens !== undefined
              ? { totalTokens: response.usage.total_tokens }
              : {}),
          },
        }
      : {}),
    finishReason: toFinishReason(choice.finish_reason),
    providerMetadata: {
      responseId: response.id,
      responseModel: response.model,
    },
    raw: response,
  };
};
