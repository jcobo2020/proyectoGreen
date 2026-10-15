/**
 * Errores de dominio de la feature orders.
 * El repositorio HTTP los lanza; la UI los interpreta para mostrar el estado correcto.
 */

export class OrderNotFoundError extends Error {
  override readonly name = 'OrderNotFoundError';
  constructor() {
    super('Pedido no encontrado');
  }
}

export class OrderForbiddenError extends Error {
  override readonly name = 'OrderForbiddenError';
  constructor() {
    super('Sin permiso para acceder a este pedido');
  }
}

export class OrderNotPendingError extends Error {
  override readonly name = 'OrderNotPendingError';
  constructor() {
    super('El pedido no está en estado pendiente');
  }
}

export class InvalidOrderInputError extends Error {
  override readonly name = 'InvalidOrderInputError';
  constructor(public readonly details?: unknown) {
    super('Parámetros de pedido no válidos');
  }
}

export class OrderUnauthorizedError extends Error {
  override readonly name = 'OrderUnauthorizedError';
  constructor() {
    super('No autenticado');
  }
}

export class OrderInfrastructureError extends Error {
  override readonly name = 'OrderInfrastructureError';
  constructor(
    public readonly status: number,
    public readonly path: string
  ) {
    super(`Error de infraestructura ${status} en ${path}`);
  }
}

export class InsufficientStockError extends Error {
  override readonly name = 'InsufficientStockError';
  constructor(
    public readonly details: Array<{ productId: string; requested: number; available: number }>
  ) {
    super('Stock insuficiente para uno o más productos');
  }
}

export class ProductNotFoundError extends Error {
  override readonly name = 'ProductNotFoundError';
  constructor(public readonly details?: Array<{ productId: string }>) {
    super('Uno o más productos no existen o no están activos');
  }
}
