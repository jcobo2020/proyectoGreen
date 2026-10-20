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

export class InvalidOrderIdError extends Error implements AppError {
  statusCode = 400;
  code = 'INVALID_ORDER_ID';

  constructor(message = 'El id del pedido no es un ObjectId') {
    super(message);
    this.name = 'InvalidOrderIdError';
  }
}

export class OrderForbiddenError extends Error implements AppError {
  statusCode = 403;
  code = 'ORDER_FORBIDDEN';

  constructor(message = 'El pedido es de otro cliente') {
    super(message);
    this.name = 'OrderForbiddenError';
  }
}

export class OrderNotFoundError extends Error implements AppError {
  statusCode = 404;
  code = 'ORDER_NOT_FOUND';

  constructor(message = 'No existe el pedido') {
    super(message);
    this.name = 'OrderNotFoundError';
  }
}

export class ProductNotFoundError extends Error implements AppError {
  statusCode = 404;
  code = 'PRODUCT_NOT_FOUND';
  details: Array<{ productId: string }>;

  constructor(message: string, details: Array<{ productId: string }>) {
    super(message);
    this.name = 'ProductNotFoundError';
    this.details = details;
  }
}

export class InsufficientStockError extends Error implements AppError {
  statusCode = 409;
  code = 'INSUFFICIENT_STOCK';
  details: Array<{ productId: string; requested: number; available: number }>;

  constructor(
    message: string,
    details: Array<{ productId: string; requested: number; available: number }>
  ) {
    super(message);
    this.name = 'InsufficientStockError';
    this.details = details;
  }
}

export class CustomerNotFoundError extends Error implements AppError {
  statusCode = 404;
  code = 'CUSTOMER_NOT_FOUND';

  constructor(message = 'No existe un cliente con ese id') {
    super(message);
    this.name = 'CustomerNotFoundError';
  }
}

export class CustomerDuplicateError extends Error implements AppError {
  statusCode = 409;
  code = 'CUSTOMER_DUPLICATE';
  details: Array<{ field: string; message: string }>;

  constructor(message = 'Ya existe un cliente con esta identificación.') {
    super(message);
    this.name = 'CustomerDuplicateError';
    this.details = [{ field: 'idNumber', message }];
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
