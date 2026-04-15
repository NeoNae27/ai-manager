export interface LogFields {
  [key: string]: unknown;
}

export interface Logger {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  scope(scope: string): Logger;
}

const formatValue = (value: unknown): string => {
  if (value === undefined) {
    return 'undefined';
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return /\s/.test(value) ? JSON.stringify(value) : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (value instanceof Error) {
    return value.message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

class ConsoleLogger implements Logger {
  readonly #scopeName: string;

  constructor(scopeName: string) {
    this.#scopeName = scopeName;
  }

  info(message: string, fields?: LogFields): void {
    this.#log('INFO', message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.#log('WARN', message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.#log('ERROR', message, fields);
  }

  scope(scopeName: string): Logger {
    return new ConsoleLogger(`${this.#scopeName}.${scopeName}`);
  }

  #log(level: 'INFO' | 'WARN' | 'ERROR', message: string, fields?: LogFields): void {
    const timestamp = new Date().toISOString();
    const serializedFields = fields
      ? Object.entries(fields)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => `${key}=${formatValue(value)}`)
          .join(' ')
      : '';
    const line = `[${timestamp}] [${level}] [${this.#scopeName}] ${message}${serializedFields ? ` ${serializedFields}` : ''}`;

    if (level === 'ERROR') {
      console.error(line);
      return;
    }

    if (level === 'WARN') {
      console.warn(line);
      return;
    }

    console.log(line);
  }
}

export const createLogger = (scopeName: string): Logger => new ConsoleLogger(scopeName);
