import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../errors/http-error.js';

export const notFoundHandler = (_request: Request, _response: Response, next: NextFunction): void => {
  next(new HttpError(404, 'route_not_found', 'Route not found.'));
};
