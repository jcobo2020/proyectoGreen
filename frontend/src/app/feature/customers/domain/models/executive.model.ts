/**
 * Opción de «Ejecutivo asignado», tal como la devuelve GET /api/executives
 * (GREEN-H2-API-EJECUTIVOS-001, RN-02): value es el _id del ejecutivo y label su nombre.
 */
export interface ExecutiveOption {
  value: string;
  label: string;
}
