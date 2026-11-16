/**
 * Modelo de dominio para un reporte de ventas.
 * Campos que devuelve GET /api/reports (§2 de GREEN-H2-UX-REPORTES-001).
 */
export interface Report {
  id: string;
  ejecutivo: string;
  equipo: string;
  abiertas: string;
  valorAbierto: number;
  ganado: number;
  conversion: string;
  actVencidas: string;
}

export interface ReportsPage {
  items: Report[];
  total: number;
  page: number;
  pageSize: number;
}

/** Parámetros de query para GET /api/reports. */
export interface ReportsQuery {
  page?: number;
  pageSize?: number;
}

/** Opciones del selector de período (§2 grupo 1). */
export type PeriodoOpcion = 'Este mes' | 'Mes anterior' | 'Este trimestre' | 'Este año';

export const PERIODO_OPCIONES: PeriodoOpcion[] = [
  'Este mes',
  'Mes anterior',
  'Este trimestre',
  'Este año'
];
