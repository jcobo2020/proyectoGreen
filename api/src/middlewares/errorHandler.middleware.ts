import { Request, Response, NextFunction } from 'express';
import {
  isAppError,
  ValidationError,
  ProductNotFoundError,
  InsufficientStockError,
} from '../lib/errors';
import { describeErrorSafely } from '../lib/safeErrorLog';

/** RN-12 de GREEN-H2-API-CLIENTES-001: un cuerpo que no es un JSON válido. */
export const INVALID_JSON_BODY_MESSAGE = 'El cuerpo de la petición no es un JSON válido.';

export function notFound(req: Request, res: Response, _next: NextFunction): void {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: `Ruta no encontrada: ${req.method} ${req.path}`,
    ...detailsFor(undefined, res),
  });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Un cuerpo JSON mal formado (express.json): en las rutas que lo piden es el 400 de RN-12
  if (isInvalidJsonBody(err) && res.locals['alwaysErrorDetails'] === true) {
    const invalidBody = new ValidationError(INVALID_JSON_BODY_MESSAGE, []);
    res.status(invalidBody.statusCode).json({
      code: invalidBody.code,
      message: invalidBody.message,
      details: invalidBody.details,
    });
    return;
  }

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

  // Error no previsto: se registra sin el cuerpo de la petición ni el mensaje del error
  // (R4-OBS-3) y nunca se exponen detalles internos
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'unexpected_error',
      method: req.method,
      path: req.originalUrl.split('?')[0],
      requestId: (req as Request & { requestId?: string }).requestId,
      error: describeErrorSafely(err),
    })
  );
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'Error interno del servidor',
    ...detailsFor(undefined, res),
  });
}

/** El error con el que express.json() rechaza un cuerpo que no se puede parsear. */
function isInvalidJsonBody(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { type?: unknown }).type === 'entity.parse.failed';
}

/** details viaja si el error lo trae o si la ruta lo pide siempre (res.locals.alwaysErrorDetails). */
function detailsFor(details: unknown, res: Response): { details?: unknown } {
  if (details !== undefined) return { details };
  return res.locals['alwaysErrorDetails'] === true ? { details: [] } : {};
}
