import { Request, Response, NextFunction } from 'express';
import {
  isAppError,
  ValidationError,
  ProductNotFoundError,
  InsufficientStockError,
} from '../lib/errors';

export function notFound(req: Request, res: Response, _next: NextFunction): void {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: `Ruta no encontrada: ${req.method} ${req.path}`,
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (isAppError(err)) {
    if (err instanceof ValidationError) {
      res.status(err.statusCode).json({
        code: err.code,
        message: err.message,
        details: err.details,
      });
      return;
    }

    if (err instanceof ProductNotFoundError) {
      res.status(err.statusCode).json({
        code: err.code,
        message: err.message,
        details: err.details,
      });
      return;
    }

    if (err instanceof InsufficientStockError) {
      res.status(err.statusCode).json({
        code: err.code,
        message: err.message,
        details: err.details,
      });
      return;
    }

    // Resto de errores de dominio: {code, message}, y details si el error lo trae o si el
    // contrato de la ruta lo exige siempre (withErrorDetails; /api/orders conserva su forma)
    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      ...detailsFor(err.details, res),
    });
    return;
  }

  // Error no previsto: nunca exponer detalles internos
  console.error('Error no previsto:', err);
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'Error interno del servidor',
    ...detailsFor(undefined, res),
  });
}

/** details viaja si el error lo trae o si la ruta lo pide siempre (res.locals.alwaysErrorDetails). */
function detailsFor(details: unknown, res: Response): { details?: unknown } {
  if (details !== undefined) return { details };
  return res.locals['alwaysErrorDetails'] === true ? { details: [] } : {};
}
