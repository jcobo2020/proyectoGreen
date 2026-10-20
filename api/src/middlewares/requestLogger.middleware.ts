import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) ?? uuidv4();
  const startTime = Date.now();
  // La ruta completa se toma al entrar: dentro de un router montado, req.path pierde el prefijo (/api)
  const path = req.originalUrl.split('?')[0];

  // Añadimos el requestId a la request para uso posterior
  (req as Request & { requestId: string }).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    // Log estructurado JSON — sin token ni datos personales
    console.log(
      JSON.stringify({
        method: req.method,
        path,
        status: res.statusCode,
        duration,
        requestId,
      })
    );
  });

  next();
}
