import { ServerProviderManagerClient } from './server-provider-manager-client.js';

const DEFAULT_SERVER_URL = 'http://127.0.0.1:3000';
const DEFAULT_API_PREFIX = '/api/v1';

const normalizeUrlPart = (value: string): string => value.trim().replace(/\/+$/, '');

const resolveServerBaseUrl = (): string =>
  normalizeUrlPart(process.env.CLI_SERVER_URL?.trim() || DEFAULT_SERVER_URL);

const resolveApiPrefix = (): string => {
  const prefix = process.env.CLI_SERVER_API_PREFIX?.trim() || DEFAULT_API_PREFIX;

  if (!prefix.startsWith('/')) {
    throw new Error('CLI_SERVER_API_PREFIX must start with "/".');
  }

  return prefix.replace(/\/+$/, '') || '/';
};

export const createApplicationProviderManager = (): ServerProviderManagerClient =>
  new ServerProviderManagerClient({
    serverBaseUrl: resolveServerBaseUrl(),
    apiPrefix: resolveApiPrefix(),
  });
