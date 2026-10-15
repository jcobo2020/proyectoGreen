import { vi, Mock } from 'vitest';

/**
 * Versión spy de un interfaz: cada método queda reemplazado por un Mock de Vitest.
 */
export type SpyObj<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in keyof T]: T[K] extends (...args: any[]) => any ? Mock : T[K];
};

/**
 * Crea un objeto spy con métodos simulados usando vi.fn() de Vitest.
 * Equivalente a jasmine.createSpyObj pero sin dependencia de Jasmine.
 *
 * @param _baseName  Nombre descriptivo del doble (solo documentación)
 * @param methodNames Lista de métodos del interfaz que se van a espiar
 */
export function createSpyObj<T>(
  _baseName: string,
  methodNames: (keyof T)[]
): SpyObj<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj: Record<string, Mock> = {};
  for (const name of methodNames) {
    obj[name as string] = vi.fn();
  }
  return obj as unknown as SpyObj<T>;
}
