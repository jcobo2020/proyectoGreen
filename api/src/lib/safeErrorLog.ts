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

/**
 * Un marco de la pila tal como lo escribe V8: «at función (fichero:línea:columna)»,
 * «at fichero:línea:columna», «at función (<anonymous>)» o «at función (native)». Nada más.
 */
const STACK_FRAME = /^at (?:[^()]+ \((?:[^()]+:\d+:\d+|<anonymous>|native)\)|[^()]+:\d+:\d+)$/;

/**
 * Los marcos de la pila, sin la cabecera. La cabecera («Nombre: mensaje») repite el mensaje, y el
 * mensaje puede ocupar varias líneas con un trozo del cuerpo (el de JSON.parse lo cita), incluso
 * líneas que empiezan por «at »: se quita entera antes de mirar las líneas. Si el mensaje no está
 * en la pila, no se sabe dónde acaba la cabecera y no se registra ningún marco. De lo que queda,
 * solo pasa lo que tiene la forma exacta de un marco.
 */
function stackFrames(stack: string, message: unknown): string[] {
  let frames = stack;
  if (typeof message === 'string' && message !== '') {
    const start = stack.indexOf(message);
    if (start < 0) return [];
    frames = stack.slice(start + message.length);
  }
  return frames
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => STACK_FRAME.test(line));
}

export function describeErrorSafely(err: unknown): SafeErrorDescription {
  if (typeof err !== 'object' || err === null) {
    return { name: typeof err, stack: [] };
  }
  const source = err as { name?: unknown; message?: unknown; code?: unknown; type?: unknown; stack?: unknown };
  const description: SafeErrorDescription = {
    name: typeof source.name === 'string' ? source.name : 'Error',
    stack: typeof source.stack === 'string' ? stackFrames(source.stack, source.message) : [],
  };
  if (typeof source.code === 'string' || typeof source.code === 'number') description.code = source.code;
  if (typeof source.type === 'string') description.type = source.type;
  return description;
}
