import { resolve } from 'node:path';

export interface ServerConfig {
  host: string;
  port: number;
  databasePath: string;
  apiPrefix: string;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3000;
const DEFAULT_API_PREFIX = '/api/v1';
const DEFAULT_DATABASE_PATH = resolve(process.cwd(), 'data/server.sqlite');

const parsePort = (rawValue: string | undefined): number => {
  if (!rawValue) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new Error('SERVER_PORT must be an integer between 1 and 65535.');
  }

  return parsed;
};

const normalizeApiPrefix = (rawValue: string | undefined): string => {
  const prefix = rawValue?.trim() || DEFAULT_API_PREFIX;

  if (!prefix.startsWith('/')) {
    throw new Error('SERVER_API_PREFIX must start with "/".');
  }

  return prefix.replace(/\/+$/, '') || '/';
};

export const loadServerConfig = (): ServerConfig => ({
  host: process.env.SERVER_HOST?.trim() || DEFAULT_HOST,
  port: parsePort(process.env.SERVER_PORT),
  databasePath: resolve(process.env.SERVER_DB_PATH?.trim() || DEFAULT_DATABASE_PATH),
  apiPrefix: normalizeApiPrefix(process.env.SERVER_API_PREFIX),
});
