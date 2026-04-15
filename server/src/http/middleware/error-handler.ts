import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../errors/http-error.js';
import type { ErrorResponse } from '../dto/providers.js';
import type { Logger } from '../../logging/logger.js';

const toErrorResponse = (error: HttpError): ErrorResponse => ({
  error: {
    code: error.code,
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  },
});

export const errorHandler = (logger: Logger) => (
  error: unknown,
  request: Request,
  response: Response<ErrorResponse>,
  _next: NextFunction,
): void => {
  const httpError =
    error instanceof HttpError
      ? error
      : new HttpError(500, 'internal_error', 'Unexpected server error.');

  logger.scope('http').error('Request failed.', {
    method: request.method,
    path: request.originalUrl,
    statusCode: httpError.statusCode,
    code: httpError.code,
    message: httpError.message,
  });

  response.status(httpError.statusCode).json(toErrorResponse(httpError));
};
