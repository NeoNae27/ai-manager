import type { BootstrapContext } from '../domain/bootstrap.js';
import type { RequestContext } from '../domain/context.js';
import type { FinishReason, GenerationConfig, TokenUsage } from '../domain/generation.js';
import type { Message, ToolDefinition, ToolResult } from '../domain/message.js';
import type { ModelConfig } from '../domain/model.js';

export interface GenerationRequest {
  model: ModelConfig;
  messages: Message[];
  generation?: GenerationConfig;
  bootstrap?: BootstrapContext;
  context: RequestContext;
  tools?: ToolDefinition[];
  toolResults?: ToolResult[];
}

export interface GenerationResult {
  model: ModelConfig;
  message: Message;
  usage?: TokenUsage;
  finishReason: FinishReason;
  providerMetadata?: Record<string, unknown>;
  raw?: unknown;
}

export type StreamEvent =
  | {
      type: 'message.delta';
      delta: string;
    }
  | {
      type: 'tool_call.delta';
      toolCallId: string;
      delta: string;
    }
  | {
      type: 'response.completed';
      result: GenerationResult;
    }
  | {
      type: 'provider.diagnostic';
      message: string;
      metadata?: Record<string, unknown>;
    };
