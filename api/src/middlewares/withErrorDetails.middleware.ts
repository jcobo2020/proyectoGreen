import { Request, Response, NextFunction } from 'express';

/**
 * Marca la petición para que todo error viaje como {code, message, details} (R4-SEG-3 de
 * GREEN-H2-API-CLIENTES-001): el 401 del middleware compartido, el 400 de un JSON mal formado
 * (RN-12), el 404 de un método no declarado y el 500. Se monta en app.ts ANTES de express.json(),
 * para que la marca exista también cuando el parseo del cuerpo falla, y solo bajo /api/customers:
 * los errores de /api/orders conservan su forma (R4-SEG-4).
 */
export function withErrorDetails(_req: Request, res: Response, next: NextFunction): void {
  res.locals['alwaysErrorDetails'] = true;
  next();
}
