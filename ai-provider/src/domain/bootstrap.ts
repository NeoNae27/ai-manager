export interface BootstrapContext {
  systemPrompt?: string;
  toolPolicyPrompt?: string;
  safetyPolicyPrompt?: string;
  promptTemplateId?: string;
  allowedIntegrationIds?: string[];
  allowedToolIds?: string[];
  metadata?: Record<string, unknown>;
}
