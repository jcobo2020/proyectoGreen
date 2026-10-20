import { ValidationError } from '../lib/errors';
import { normalizeExecutiveName } from '../services/ExecutiveService';

const ITEM_MESSAGE = 'Cada ejecutivo debe ser un nombre de texto no vacío';

/**
 * Valida la entrada del seed de ejecutivos: una lista JSON de nombres.
 * Devuelve los nombres normalizados y sin repetidos.
 */
export function parseExecutiveSeed(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError('Entrada inválida', [
      { field: '$', message: 'El fichero del seed debe ser una lista JSON de nombres' },
    ]);
  }

  const details: Array<{ field: string; message: string }> = [];
  raw.forEach((item, index) => {
    if (typeof item !== 'string' || normalizeExecutiveName(item) === '') {
      details.push({ field: `[${index}]`, message: ITEM_MESSAGE });
    }
  });

  if (details.length > 0) {
    throw new ValidationError('Entrada inválida', details);
  }

  return Array.from(new Set((raw as string[]).map(normalizeExecutiveName)));
}
