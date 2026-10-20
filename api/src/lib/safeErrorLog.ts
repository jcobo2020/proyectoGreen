/**
 * Lo que se registra de un error no previsto (R4-OBS-3): su nombre, su código y en qué punto del
 * código saltó. Nunca su mensaje ni el cuerpo de la petición: el mensaje de un error de la base o
 * del parseo del JSON puede llevar los datos enviados (correo, teléfono, identificación), y ni los
 * datos personales ni los tokens se escriben en los logs (constitución, restricciones de seguridad).
 */
export interface SafeErrorDescription {
  name: string;
  code?: string | number;
  type?: string;
  stack: string[];
}

export function describeErrorSafely(err: unknown): SafeErrorDescription {
  if (typeof err !== 'object' || err === null) {
    return { name: typeof err, stack: [] };
  }
  const source = err as { name?: unknown; code?: unknown; type?: unknown; stack?: unknown };
  const description: SafeErrorDescription = {
    name: typeof source.name === 'string' ? source.name : 'Error',
    // Solo las líneas «at …» de la pila: la primera repite el mensaje
    stack:
      typeof source.stack === 'string'
        ? source.stack
            .split('\n')
            .filter((line) => /^\s+at /.test(line))
            .map((line) => line.trim())
        : [],
  };
  if (typeof source.code === 'string' || typeof source.code === 'number') description.code = source.code;
  if (typeof source.type === 'string') description.type = source.type;
  return description;
}
