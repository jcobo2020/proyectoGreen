import { CustomerFieldError } from '../models/customer.model';

/**
 * Errores de dominio del alta de clientes. El repositorio HTTP los lanza a partir
 * del código de POST /api/customers; la UI decide qué mostrar según la clase.
 */

/** 400 VALIDATION_ERROR: details lista cada campo con su mensaje literal. */
export class InvalidCustomerInputError extends Error {
  override readonly name = 'InvalidCustomerInputError';
  constructor(public readonly details: CustomerFieldError[]) {
    super('Datos del cliente no válidos');
  }
}

/** 409 CUSTOMER_DUPLICATE: la identificación ya existe (lo decide el servidor, RN-01). */
export class DuplicateCustomerError extends Error {
  override readonly name = 'DuplicateCustomerError';
  constructor() {
    super('Identificación duplicada');
  }
}

/** 401 UNAUTHORIZED: sin un token válido. */
export class CustomerUnauthorizedError extends Error {
  override readonly name = 'CustomerUnauthorizedError';
  constructor() {
    super('No autenticado');
  }
}

/** Cualquier otro código (p. ej. 500 INTERNAL_ERROR). */
export class CustomerInfrastructureError extends Error {
  override readonly name = 'CustomerInfrastructureError';
  constructor(
    public readonly status: number,
    public readonly path: string
  ) {
    super(`Error de infraestructura ${status} en ${path}`);
  }
}
