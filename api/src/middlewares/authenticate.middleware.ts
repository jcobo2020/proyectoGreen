import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../lib/errors';

// Extendemos Express.Request para añadir customerId
declare global {
  namespace Express {
    interface Request {
      customerId?: string;
    }
  }
}

interface JwtPayload {
  sub?: string;
  exp?: number;
  [key: string]: unknown;
}

const CLOCK_TOLERANCE_SECONDS = 30;

function verifyWithSecret(token: string, secret: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    }) as JwtPayload;
    return payload;
  } catch {
    return null;
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError());
  }

  const token = authHeader.slice(7);

  // Leer secretos de process.env en cada petición para soportar configuración dinámica en tests
  const jwtSecret = process.env['JWT_SECRET'] ?? '';
  const jwtSecretPrevious = process.env['JWT_SECRET_PREVIOUS'] ?? '';

  if (!jwtSecret) {
    return next(new UnauthorizedError());
  }

  // Intentar verificar con el secreto actual
  let payload = verifyWithSecret(token, jwtSecret);

  // Si falla y hay secreto previo (rotación), intentar con él
  if (!payload && jwtSecretPrevious) {
    payload = verifyWithSecret(token, jwtSecretPrevious);
  }

  if (!payload) {
    return next(new UnauthorizedError());
  }

  // sub obligatorio y no vacío
  if (!payload.sub || payload.sub.trim() === '') {
    return next(new UnauthorizedError());
  }

  // exp obligatorio: jwt.verify ya lo valida con clockTolerance,
  // pero si el token no tiene exp en absoluto lo rechazamos explícitamente
  if (payload.exp === undefined) {
    return next(new UnauthorizedError());
  }

  req.customerId = payload.sub;
  next();
}
