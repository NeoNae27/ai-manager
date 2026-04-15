export type RequestScenario =
  | 'chat'
  | 'rag'
  | 'tool_execution'
  | 'summary'
  | 'document_generation';

export interface RequestContext {
  requestId: string;
  sessionId?: string;
  userId?: string;
  projectId?: string;
  scenario?: RequestScenario;
  traceId?: string;
  debug?: boolean;
  metadata?: Record<string, unknown>;
}
