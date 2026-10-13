/**
 * Ofusca un valor sensible para logs: muestra solo los primeros y últimos caracteres.
 */
export function obfuscateValue(value: string): string {
  if (!value || value.length <= 4) {
    return '****';
  }
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}
