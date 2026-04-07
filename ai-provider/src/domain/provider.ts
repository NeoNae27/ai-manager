export type ProviderKind = 'local' | 'cloud';

export type ProviderId = 'ollama' | 'lmstudio' | (string & {});

export type AuthType = 'none' | 'apiKey' | 'bearer';

export interface ProviderAuthConfig {
  type: AuthType;
  tokenEnvVar?: string;
  headerName?: string;
}

export interface ProviderConfig {
  id: ProviderId;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  auth: ProviderAuthConfig;
  enabled: boolean;
  timeoutMs: number;
  defaultModelId?: string;
  metadata?: Record<string, unknown>;
}
