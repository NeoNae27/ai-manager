import type {
  ApplicationProviderManagerContract,
  ProviderHealthCheckResult,
  ProviderModelListResult,
  ProviderSummary,
} from '../../../../ai-provider/src/domain/application-provider.js';
import type { ModelConfig } from '../../../../ai-provider/src/domain/model.js';
import type {
  ProviderDefinition,
  RegisteredProvider,
} from '../../../../ai-provider/src/domain/provider-registration.js';
import type { ProviderId } from '../../../../ai-provider/src/domain/provider.js';
import type { HealthStatus } from '../../application/health-service.js';
import { HttpError } from '../errors/http-error.js';

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readOptionalString = (value: unknown, field: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, 'validation_error', `${field} must be a non-empty string.`);
  }

  return value.trim();
};

const readOptionalBoolean = (value: unknown, field: string): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new HttpError(400, 'validation_error', `${field} must be a boolean.`);
  }

  return value;
};

const readOptionalPositiveInteger = (value: unknown, field: string): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new HttpError(400, 'validation_error', `${field} must be a positive integer.`);
  }

  return value;
};

const readOptionalMetadata = (value: unknown): Record<string, unknown> | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new HttpError(400, 'validation_error', 'metadata must be an object.');
  }

  return value;
};

const readProviderId = (value: unknown, field = 'providerId'): ProviderId => {
  const providerId = readOptionalString(value, field);

  if (!providerId) {
    throw new HttpError(400, 'validation_error', `${field} is required.`);
  }

  return providerId as ProviderId;
};

export interface CreateProviderRequest {
  providerId: ProviderId;
  baseUrl?: string;
  timeoutMs?: number;
  enabled?: boolean;
  defaultModelId?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderOperationOptionsRequest {
  baseUrl?: string;
  timeoutMs?: number;
  enabled?: boolean;
  defaultModelId?: string;
  metadata?: Record<string, unknown>;
}

export interface HealthResponse {
  health: HealthStatus;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ProviderDefinitionDto extends ProviderDefinition {}

export interface RegisteredProviderDto extends RegisteredProvider {}

export interface ProviderSummaryDto extends ProviderSummary {}

export interface ProviderModelDto extends ModelConfig {}

export interface ProviderResponse {
  provider: RegisteredProviderDto;
}

export interface CurrentProviderResponse {
  provider: RegisteredProviderDto | null;
}

export interface ProviderListResponse {
  providers: ProviderSummaryDto[];
}

export interface ProviderDefinitionsResponse {
  providers: ProviderDefinitionDto[];
}

export interface PingProviderResponse {
  result: ProviderHealthCheckResult;
}

export interface ProviderModelsResponse {
  result: ProviderModelListResult;
}

export const parseCreateProviderRequest = (value: unknown): CreateProviderRequest => {
  if (!isRecord(value)) {
    throw new HttpError(400, 'validation_error', 'Request body must be a JSON object.');
  }

  const baseUrl = readOptionalString(value.baseUrl, 'baseUrl');
  const timeoutMs = readOptionalPositiveInteger(value.timeoutMs, 'timeoutMs');
  const enabled = readOptionalBoolean(value.enabled, 'enabled');
  const defaultModelId = readOptionalString(value.defaultModelId, 'defaultModelId');
  const metadata = readOptionalMetadata(value.metadata);

  return {
    providerId: readProviderId(value.providerId),
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(enabled !== undefined ? { enabled } : {}),
    ...(defaultModelId !== undefined ? { defaultModelId } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
};

export const parseProviderOperationOptionsRequest = (
  value: unknown,
): ProviderOperationOptionsRequest => {
  if (value === undefined || value === null) {
    return {};
  }

  if (!isRecord(value)) {
    throw new HttpError(400, 'validation_error', 'Request body must be a JSON object.');
  }

  const baseUrl = readOptionalString(value.baseUrl, 'baseUrl');
  const timeoutMs = readOptionalPositiveInteger(value.timeoutMs, 'timeoutMs');
  const enabled = readOptionalBoolean(value.enabled, 'enabled');
  const defaultModelId = readOptionalString(value.defaultModelId, 'defaultModelId');
  const metadata = readOptionalMetadata(value.metadata);

  return {
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(enabled !== undefined ? { enabled } : {}),
    ...(defaultModelId !== undefined ? { defaultModelId } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
};

export const parseProviderIdParam = (value: unknown): ProviderId => readProviderId(value, 'providerId');

export const toHealthResponse = (health: HealthStatus): HealthResponse => ({
  health,
});

export const toProviderDefinitionsResponse = (
  providers: ProviderDefinition[],
): ProviderDefinitionsResponse => ({
  providers,
});

export const toProviderListResponse = (providers: ProviderSummary[]): ProviderListResponse => ({
  providers,
});

export const toProviderResponse = (provider: RegisteredProvider): ProviderResponse => ({
  provider,
});

export const toCurrentProviderResponse = (
  provider: RegisteredProvider | undefined,
): CurrentProviderResponse => ({
  provider: provider ?? null,
});

export const toPingProviderResponse = (
  result: ProviderHealthCheckResult,
): PingProviderResponse => ({
  result,
});

export const toProviderModelsResponse = (
  result: ProviderModelListResult,
): ProviderModelsResponse => ({
  result,
});

export const ensureProviderManager = (
  providerManager: ApplicationProviderManagerContract,
): ApplicationProviderManagerContract => providerManager;
