/**
 * Normalización de los datos del cliente (GREEN-H2-API-CLIENTES-001), como funciones puras con
 * nombre. Viven en lib/ porque las comparten el validador (que valida la forma normalizada) y el
 * servicio (que la guarda): una regla, un sitio.
 */

/** RN-02: el número de identificación se guarda sin espacios y en mayúsculas («ab 12345» → «AB12345»). */
export function normalizeIdNumber(idNumber: string): string {
  return idNumber.replace(/\s+/g, '').toUpperCase();
}

/** RN-11: el correo (email y contactEmail) se guarda y se devuelve en minúsculas y sin espacios alrededor. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** RN-13: un texto enviado como «», solo espacios o null está vacío. */
export function isEmptyText(value: unknown): boolean {
  return value === null || (typeof value === 'string' && value.trim() === '');
}
