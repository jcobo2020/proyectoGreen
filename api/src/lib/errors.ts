export interface AppError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

export class ValidationError extends Error implements AppError {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  details: Array<{ field: string; message: string }>;

  constructor(message: string, details: Array<{ field: string; message: string }>) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class UnauthorizedError extends Error implements AppError {
  statusCode = 401;
  code = 'UNAUTHORIZED';

  constructor(message = 'Sin token o token inválido o caducado') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class InternalError extends Error implements AppError {
  statusCode = 500;
  code = 'INTERNAL_ERROR';

  constructor(message = 'Error interno del servidor') {
    super(message);
    this.name = 'InternalError';
  }
}

export function isAppError(err: unknown): err is AppError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    'code' in err &&
    'message' in err
  );
}
