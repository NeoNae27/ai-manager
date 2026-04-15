import type { FinishReason, TokenUsage } from '../../../../ai-provider/src/domain/generation.js';
import type { Message, MessageContentPart, ToolCall } from '../../../../ai-provider/src/domain/message.js';
import type { ProviderId } from '../../../../ai-provider/src/domain/provider.js';
import type { SandboxChatRequest, SandboxChatResponse } from '../../application/chat-api-service.js';
import { HttpError } from '../errors/http-error.js';

type JsonRecord = Record<string, unknown>;

const messageRoles = new Set(['system', 'user', 'assistant', 'tool']);
const contentPartTypes = new Set(['text', 'image_url']);
const detailLevels = new Set(['auto', 'low', 'high']);

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (
  value: unknown,
  field: string,
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
): string => {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'validation_error', `${field} must be a string.`);
  }

  if (!allowEmpty && value.trim().length === 0) {
    throw new HttpError(400, 'validation_error', `${field} must be a non-empty string.`);
  }

  return allowEmpty ? value : value.trim();
};

const readOptionalString = (value: unknown, field: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return readString(value, field);
};

const readOptionalRecord = (value: unknown, field: string): JsonRecord | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new HttpError(400, 'validation_error', `${field} must be an object.`);
  }

  return value;
};

const parseToolCall = (value: unknown, index: number): ToolCall => {
  if (!isRecord(value)) {
    throw new HttpError(400, 'validation_error', `toolCalls[${index}] must be an object.`);
  }

  const type = readString(value.type, `toolCalls[${index}].type`);

  if (type !== 'function') {
    throw new HttpError(400, 'validation_error', `toolCalls[${index}].type must be "function".`);
  }

  return {
    id: readString(value.id, `toolCalls[${index}].id`),
    type: 'function',
    name: readString(value.name, `toolCalls[${index}].name`),
    arguments: readString(value.arguments, `toolCalls[${index}].arguments`, { allowEmpty: true }),
  };
};

const parseMessageContentPart = (value: unknown, index: number): MessageContentPart => {
  if (!isRecord(value)) {
    throw new HttpError(400, 'validation_error', `content[${index}] must be an object.`);
  }

  const type = readString(value.type, `content[${index}].type`);

  if (!contentPartTypes.has(type)) {
    throw new HttpError(
      400,
      'validation_error',
      `content[${index}].type must be one of: ${[...contentPartTypes].join(', ')}.`,
    );
  }

  if (type === 'text') {
    return {
      type: 'text',
      text: readString(value.text, `content[${index}].text`, { allowEmpty: true }),
    };
  }

  const detail = readOptionalString(value.detail, `content[${index}].detail`);
  const mimeType = readOptionalString(value.mimeType, `content[${index}].mimeType`);

  if (detail && !detailLevels.has(detail)) {
    throw new HttpError(
      400,
      'validation_error',
      `content[${index}].detail must be one of: ${[...detailLevels].join(', ')}.`,
    );
  }

  return {
    type: 'image_url',
    imageUrl: readString(value.imageUrl, `content[${index}].imageUrl`),
    ...(mimeType ? { mimeType } : {}),
    ...(detail ? { detail: detail as 'auto' | 'low' | 'high' } : {}),
  };
};

const parseMessageContent = (value: unknown): Message['content'] => {
  if (typeof value === 'string') {
    return value;
  }

  if (!Array.isArray(value)) {
    throw new HttpError(400, 'validation_error', 'message content must be a string or an array.');
  }

  return value.map((part, index) => parseMessageContentPart(part, index));
};

const parseMessage = (value: unknown, index: number): Message => {
  if (!isRecord(value)) {
    throw new HttpError(400, 'validation_error', `messages[${index}] must be an object.`);
  }

  const role = readString(value.role, `messages[${index}].role`);

  if (!messageRoles.has(role)) {
    throw new HttpError(
      400,
      'validation_error',
      `messages[${index}].role must be one of: ${[...messageRoles].join(', ')}.`,
    );
  }

  const toolCalls = value.toolCalls;
  const name = value.name !== undefined ? readString(value.name, `messages[${index}].name`) : undefined;
  const toolCallId =
    value.toolCallId !== undefined
      ? readString(value.toolCallId, `messages[${index}].toolCallId`)
      : undefined;
  const metadata =
    value.metadata !== undefined
      ? readOptionalRecord(value.metadata, `messages[${index}].metadata`)
      : undefined;

  return {
    role: role as Message['role'],
    content: parseMessageContent(value.content),
    ...(name ? { name } : {}),
    ...(toolCallId ? { toolCallId } : {}),
    ...(Array.isArray(toolCalls)
      ? { toolCalls: toolCalls.map((toolCall, toolCallIndex) => parseToolCall(toolCall, toolCallIndex)) }
      : toolCalls === undefined
        ? {}
        : (() => {
            throw new HttpError(400, 'validation_error', `messages[${index}].toolCalls must be an array.`);
          })()),
    ...(metadata ? { metadata } : {}),
  };
};

const getTextContent = (message: Message): string =>
  typeof message.content === 'string'
    ? message.content.trim()
    : message.content
        .filter((part): part is Extract<MessageContentPart, { type: 'text' }> => part.type === 'text')
        .map((part) => part.text.trim())
        .join('');

export interface SandboxChatResponseDto {
  message: Message;
  model: {
    providerId: ProviderId;
    id: string;
    label: string;
  };
  finishReason: FinishReason;
  usage?: TokenUsage;
}

export const parseSandboxChatRequest = (value: unknown): SandboxChatRequest => {
  if (!isRecord(value)) {
    throw new HttpError(400, 'validation_error', 'Request body must be a JSON object.');
  }

  if (!Array.isArray(value.messages)) {
    throw new HttpError(400, 'validation_error', 'messages must be an array.');
  }

  if (value.messages.length === 0) {
    throw new HttpError(400, 'validation_error', 'messages must contain at least one message.');
  }

  const messages = value.messages.map((message, index) => parseMessage(message, index));
  const lastMessage = messages[messages.length - 1];

  if (!lastMessage || getTextContent(lastMessage).length === 0) {
    throw new HttpError(
      400,
      'validation_error',
      'The last message must contain non-empty text content.',
    );
  }

  return {
    ...(value.providerId !== undefined
      ? { providerId: readString(value.providerId, 'providerId') as ProviderId }
      : {}),
    ...(value.modelId !== undefined ? { modelId: readString(value.modelId, 'modelId') } : {}),
    messages,
  };
};

export const toSandboxChatResponse = (
  response: SandboxChatResponse,
): SandboxChatResponseDto => response;
