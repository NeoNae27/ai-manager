export type JsonMode = 'off' | 'object';

export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | {
      type: 'tool';
      name: string;
    };

export interface GenerationConfig {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stop?: string[];
  stream?: boolean;
  jsonMode?: JsonMode;
  seed?: number;
  toolChoice?: ToolChoice;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export type FinishReason =
  | 'stop'
  | 'length'
  | 'tool_calls'
  | 'content_filter'
  | 'error'
  | 'unknown';
