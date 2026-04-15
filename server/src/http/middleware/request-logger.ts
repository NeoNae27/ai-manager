import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../../logging/logger.js';

const getUserAgent = (request: Request): string | undefined => {
  const value = request.get('user-agent');
  return value?.trim() || undefined;
};

export const createRequestLogger = (logger: Logger) => (
  request: Request,
  response: Response,
  next: NextFunction,
): void => {
  const startedAt = process.hrtime.bigint();
  const childLogger = logger.scope('http');

  childLogger.info('Incoming request.', {
    method: request.method,
    path: request.originalUrl,
    ip: request.ip,
    userAgent: getUserAgent(request),
  });

  response.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    childLogger.info('Request completed.', {
      method: request.method,
      path: request.originalUrl,
      statusCode: response.statusCode,
      durationMs: durationMs.toFixed(2),
    });
  });

  next();
};
