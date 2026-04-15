import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../errors/http-error.js';
import type { Logger } from '../../logging/logger.js';

export const notFoundHandler = (logger: Logger) => (
  request: Request,
  _response: Response,
  next: NextFunction,
): void => {
  logger.scope('http').warn('Route not found.', {
    method: request.method,
    path: request.originalUrl,
  });

  next(new HttpError(404, 'route_not_found', 'Route not found.'));
};
