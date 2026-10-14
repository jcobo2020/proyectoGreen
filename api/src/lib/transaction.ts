import { ClientSession } from 'mongoose';

/**
 * TransactionContext — tipo opaco (branded) del dominio.
 * Solo la infraestructura sabe que envuelve una ClientSession de MongoDB.
 */
declare const _brand: unique symbol;
export type TransactionContext = { readonly [_brand]: 'TransactionContext' };

/** Crea un TransactionContext a partir de una ClientSession (solo infraestructura). */
export function makeTransactionContext(session: ClientSession): TransactionContext {
  return session as unknown as TransactionContext;
}

/** Extrae la ClientSession del TransactionContext (solo infraestructura). */
export function unwrapSession(ctx: TransactionContext): ClientSession {
  return ctx as unknown as ClientSession;
}
