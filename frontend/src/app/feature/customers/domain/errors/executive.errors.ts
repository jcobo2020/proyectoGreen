/**
 * Errores de dominio de la carga de ejecutivos (GET /api/executives).
 */

/** 401 UNAUTHORIZED: sin un token válido. */
export class ExecutiveUnauthorizedError extends Error {
  override readonly name = 'ExecutiveUnauthorizedError';
  constructor() {
    super('No autenticado');
  }
}

/** Cualquier otro código: el contrato solo declara 200 y 401. */
export class ExecutiveInfrastructureError extends Error {
  override readonly name = 'ExecutiveInfrastructureError';
  constructor(
    public readonly status: number,
    public readonly path: string
  ) {
    super(`Error de infraestructura ${status} en ${path}`);
  }
}
