export type OpenAICompatibleRole = 'system' | 'user' | 'assistant' | 'tool';

export interface OpenAICompatibleToolFunction {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface OpenAICompatibleTool {
  type: 'function';
  function: OpenAICompatibleToolFunction;
}

export interface OpenAICompatibleToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAICompatibleMessage {
  role: OpenAICompatibleRole;
  content?: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: OpenAICompatibleToolCall[];
}

export interface OpenAICompatibleChatRequest {
  model: string;
  messages: OpenAICompatibleMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string[];
  seed?: number;
  tools?: OpenAICompatibleTool[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  response_format?: { type: 'json_object' };
}

export interface OpenAICompatibleUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface OpenAICompatibleChoice {
  index: number;
  finish_reason?: string | null;
  message: OpenAICompatibleMessage;
}

export interface OpenAICompatibleChatResponse {
  id: string;
  model: string;
  choices: OpenAICompatibleChoice[];
  usage?: OpenAICompatibleUsage;
}
