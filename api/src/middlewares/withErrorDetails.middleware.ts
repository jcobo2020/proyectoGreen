import { Request, Response, NextFunction } from 'express';

/**
 * Marca la petición para que todo error viaje como {code, message, details} (R4-SEG-3 de
 * GREEN-H2-API-CLIENTES-001), también el 401 del middleware compartido y el 500. Se monta
 * solo en las rutas de ese contrato: los errores de /api/orders conservan su forma (R4-SEG-4).
 */
export function withErrorDetails(_req: Request, res: Response, next: NextFunction): void {
  res.locals['alwaysErrorDetails'] = true;
  next();
}
