import type { ProviderConfigurationStore } from '../../../ai-provider/src/contracts/provider-management.js';
import type { ProviderConfig, ProviderId } from '../../../ai-provider/src/domain/provider.js';
import type {
  ProviderConnectionStatus,
  RegisteredProvider,
} from '../../../ai-provider/src/domain/provider-registration.js';
import type { ModelConfig } from '../../../ai-provider/src/domain/model.js';
import { SqliteDatabase } from './sqlite-database.js';

interface ProviderRow {
  id: string;
  kind: string;
  name: string;
  base_url: string;
  auth_json: string;
  enabled: number;
  timeout_ms: number;
  default_model_id: string | null;
  metadata_json: string | null;
  connection_ok: number;
  connection_checked_at: string;
  connection_latency_ms: number;
  connection_message: string;
  connection_details_json: string | null;
  models_json: string;
  created_at: string;
  updated_at: string;
}

const SELECTED_PROVIDER_KEY = 'selectedProviderId';

const parseJson = <T>(value: string | null): T | undefined => {
  if (!value) {
    return undefined;
  }

  return JSON.parse(value) as T;
};

const stringifyJson = (value: unknown): string | null =>
  value === undefined ? null : JSON.stringify(value);

const toRegisteredProvider = (row: ProviderRow): RegisteredProvider => {
  const metadata = parseJson<Record<string, unknown>>(row.metadata_json);
  const details = parseJson<Record<string, unknown>>(row.connection_details_json);
  const config: ProviderConfig = {
    id: row.id,
    kind: row.kind as ProviderConfig['kind'],
    name: row.name,
    baseUrl: row.base_url,
    auth: JSON.parse(row.auth_json) as ProviderConfig['auth'],
    enabled: Boolean(row.enabled),
    timeoutMs: row.timeout_ms,
    ...(row.default_model_id ? { defaultModelId: row.default_model_id } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };

  const connection: ProviderConnectionStatus = {
    providerId: row.id,
    baseUrl: row.base_url,
    ok: Boolean(row.connection_ok),
    checkedAt: row.connection_checked_at,
    latencyMs: row.connection_latency_ms,
    message: row.connection_message,
    ...(details !== undefined ? { details } : {}),
  };

  return {
    config,
    models: JSON.parse(row.models_json) as ModelConfig[],
    connection,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export class SqliteProviderConfigurationStore implements ProviderConfigurationStore {
  readonly #database: SqliteDatabase;

  constructor(database: SqliteDatabase) {
    this.#database = database;
  }

  async list(): Promise<RegisteredProvider[]> {
    const rows = this.#database.connection
      .prepare<[], ProviderRow>('SELECT * FROM providers ORDER BY updated_at DESC, id ASC')
      .all();

    return rows.map((row: ProviderRow) => toRegisteredProvider(row));
  }

  async get(providerId: ProviderId): Promise<RegisteredProvider | undefined> {
    const row = this.#database.connection
      .prepare<[ProviderId], ProviderRow>('SELECT * FROM providers WHERE id = ?')
      .get(providerId);

    return row ? toRegisteredProvider(row) : undefined;
  }

  async save(provider: RegisteredProvider): Promise<void> {
    this.#database.connection
      .prepare(
        `
          INSERT INTO providers (
            id,
            kind,
            name,
            base_url,
            auth_json,
            enabled,
            timeout_ms,
            default_model_id,
            metadata_json,
            connection_ok,
            connection_checked_at,
            connection_latency_ms,
            connection_message,
            connection_details_json,
            models_json,
            created_at,
            updated_at
          ) VALUES (
            @id,
            @kind,
            @name,
            @base_url,
            @auth_json,
            @enabled,
            @timeout_ms,
            @default_model_id,
            @metadata_json,
            @connection_ok,
            @connection_checked_at,
            @connection_latency_ms,
            @connection_message,
            @connection_details_json,
            @models_json,
            @created_at,
            @updated_at
          )
          ON CONFLICT(id) DO UPDATE SET
            kind = excluded.kind,
            name = excluded.name,
            base_url = excluded.base_url,
            auth_json = excluded.auth_json,
            enabled = excluded.enabled,
            timeout_ms = excluded.timeout_ms,
            default_model_id = excluded.default_model_id,
            metadata_json = excluded.metadata_json,
            connection_ok = excluded.connection_ok,
            connection_checked_at = excluded.connection_checked_at,
            connection_latency_ms = excluded.connection_latency_ms,
            connection_message = excluded.connection_message,
            connection_details_json = excluded.connection_details_json,
            models_json = excluded.models_json,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at
        `,
      )
      .run({
        id: provider.config.id,
        kind: provider.config.kind,
        name: provider.config.name,
        base_url: provider.config.baseUrl,
        auth_json: JSON.stringify(provider.config.auth),
        enabled: provider.config.enabled ? 1 : 0,
        timeout_ms: provider.config.timeoutMs,
        default_model_id: provider.config.defaultModelId ?? null,
        metadata_json: stringifyJson(provider.config.metadata),
        connection_ok: provider.connection.ok ? 1 : 0,
        connection_checked_at: provider.connection.checkedAt,
        connection_latency_ms: provider.connection.latencyMs,
        connection_message: provider.connection.message,
        connection_details_json: stringifyJson(provider.connection.details),
        models_json: JSON.stringify(provider.models),
        created_at: provider.createdAt,
        updated_at: provider.updatedAt,
      });
  }

  async delete(providerId: ProviderId): Promise<void> {
    const transaction = this.#database.connection.transaction((id: ProviderId) => {
      this.#database.connection.prepare('DELETE FROM providers WHERE id = ?').run(id);

      const selectedProviderId = this.#database.connection
        .prepare<[string], { value: string | null }>(
          'SELECT value FROM app_state WHERE key = ?',
        )
        .get(SELECTED_PROVIDER_KEY);

      if (selectedProviderId?.value === id) {
        this.#database.connection
          .prepare('DELETE FROM app_state WHERE key = ?')
          .run(SELECTED_PROVIDER_KEY);
      }
    });

    transaction(providerId);
  }

  async getSelectedProviderId(): Promise<ProviderId | undefined> {
    const row = this.#database.connection
      .prepare<[string], { value: string | null }>('SELECT value FROM app_state WHERE key = ?')
      .get(SELECTED_PROVIDER_KEY);

    return row?.value ? (row.value as ProviderId) : undefined;
  }

  async setSelectedProviderId(providerId: ProviderId): Promise<void> {
    this.#database.connection
      .prepare(
        `
          INSERT INTO app_state (key, value)
          VALUES (@key, @value)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `,
      )
      .run({
        key: SELECTED_PROVIDER_KEY,
        value: providerId,
      });
  }
}
