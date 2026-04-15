export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type MessageContentPart =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image_url';
      imageUrl: string;
      mimeType?: string;
      detail?: 'auto' | 'low' | 'high';
    };

export type MessageContent = string | MessageContentPart[];

export interface ToolCall {
  id: string;
  type: 'function';
  name: string;
  arguments: string;
}

export interface ToolResult {
  toolCallId: string;
  output: string;
}

export interface Message {
  role: MessageRole;
  content: MessageContent;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  metadata?: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}
