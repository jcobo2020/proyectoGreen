import mongoose, { ClientSession } from 'mongoose';
import { IUnitOfWork } from './ports';
import { TransactionContext, makeTransactionContext } from './transaction';
import { InternalError } from './errors';
import { isAppError } from './errors';

const MAX_ATTEMPTS = 3;

/**
 * MongoUnitOfWork — implementación de IUnitOfWork sobre MongoDB.
 *
 * Abre una sesión y ejecuta fn con session.withTransaction
 * (readConcern snapshot, writeConcern majority, maxCommitTimeMS 5000).
 *
 * El driver de MongoDB reintenta el callback de withTransaction por plazo
 * cuando detecta TransientTransactionError; IUnitOfWork envuelve fn con un
 * contador propio: si fn se intenta más de MAX_ATTEMPTS veces, lanza
 * InternalError (500) en el siguiente intento, deteniendo los reintentos.
 *
 * Los errores de dominio (AppError, como InsufficientStockError) no llevan
 * la etiqueta TransientTransactionError: el driver aborta sin reintentar y
 * relanza el mismo error.
 *
 * Agotados los reintentos o si el commit falla → lanza InternalError.
 */

export type SessionFactory = () => Promise<ClientSession>;

export class MongoUnitOfWork implements IUnitOfWork {
  private readonly sessionFactory: SessionFactory;

  constructor(sessionFactory?: SessionFactory) {
    this.sessionFactory = sessionFactory ?? (() => mongoose.startSession());
  }

  async run<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const session = await this.sessionFactory();

    try {
      let attempts = 0;
      let result: T | undefined;

      await session.withTransaction(
        async () => {
          attempts++;
          if (attempts > MAX_ATTEMPTS) {
            // Agotados los reintentos permitidos: lanzar InternalError.
            // InternalError no lleva TransientTransactionError, así que
            // el driver aborta sin volver a reintentar.
            throw new InternalError();
          }

          const tx = makeTransactionContext(session);
          result = await fn(tx);
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          maxCommitTimeMS: 5000,
        }
      );

      return result as T;
    } catch (err: unknown) {
      // Errores de dominio (AppError) se propagan tal cual
      if (isAppError(err)) {
        throw err;
      }
      // Cualquier otro error no previsto → InternalError
      throw new InternalError();
    } finally {
      await session.endSession();
    }
  }
}
