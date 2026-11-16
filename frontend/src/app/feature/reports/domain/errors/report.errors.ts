/**
 * Errores de dominio de la feature reports.
 * El repositorio HTTP los lanza a partir del código de GET /api/reports;
 * la UI decide qué mostrar según la clase (§4 convenciones de stack).
 */

/** 400 VALIDATION_ERROR: un parámetro no es válido. */
export class InvalidReportInputError extends Error {
  override readonly name = 'InvalidReportInputError';
  constructor(public readonly details?: unknown[]) {
    super('Parámetros de reporte no válidos');
  }
}

/** 401 UNAUTHORIZED: sin sesión válida. */
export class ReportUnauthorizedError extends Error {
  override readonly name = 'ReportUnauthorizedError';
  constructor() {
    super('No autenticado');
  }
}

/** Cualquier otro código (p. ej. 500). */
export class ReportInfrastructureError extends Error {
  override readonly name = 'ReportInfrastructureError';
  constructor(
    public readonly status: number,
    public readonly path: string
  ) {
    super(`Error de infraestructura ${status} en ${path}`);
  }
}
