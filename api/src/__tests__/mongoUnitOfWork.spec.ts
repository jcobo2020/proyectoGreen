/**
 * Tests unitarios/integración de MongoUnitOfWork.
 *
 * Comprueba:
 * - El callback se ejecuta correctamente y devuelve el resultado de fn.
 * - Los errores de dominio (AppError) se propagan tal cual.
 * - Los errores no previstos se traducen a InternalError (500).
 * - Se reintenta fn hasta MAX_ATTEMPTS (3) cuando el driver detecta
 *   TransientTransactionError; al cuarto intento (attempts > MAX_ATTEMPTS)
 *   se lanza InternalError — fn habrá sido llamada exactamente 3 veces
 *   y el intento 4 (attempts=4 > MAX_ATTEMPTS=3) lanza InternalError antes
 *   de invocar fn, con lo que fn se vio llamada 3 veces en total.
 */
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoUnitOfWork, SessionFactory } from '../lib/MongoUnitOfWork';
import { InternalError, OrderNotFoundError } from '../lib/errors';
import { TransactionContext } from '../lib/transaction';

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const uri = replSet.getUri();
  await mongoose.connect(uri);
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
}, 30000);

// ─── Helpers para tests con sesión mock ─────────────────────────────────────

/**
 * Crea una sesión mock cuyo withTransaction invoca el callback exactamente
 * `timesToCall` veces antes de resolver. Sirve para simular que el driver
 * reinvoca el callback por TransientTransactionError.
 */
function makeMockSessionFactory(timesToCall: number): SessionFactory {
  return async () => {
    const mockSession = {
      withTransaction: async (
        callback: () => Promise<unknown>,
        _options?: unknown
      ) => {
        let lastError: unknown;
        for (let i = 0; i < timesToCall; i++) {
          try {
            await callback();
            return; // si callback no lanza, salir
          } catch (err) {
            lastError = err;
            // Simula driver: si el error no es transient (no tiene la etiqueta),
            // relanzar inmediatamente como haría MongoDB
          }
        }
        throw lastError;
      },
      endSession: async () => {
        // no-op
      },
    };
    return mockSession as unknown as mongoose.ClientSession;
  };
}

// ─── Tests de integración real ───────────────────────────────────────────────

describe('MongoUnitOfWork — integración real', () => {
  it('ejecuta fn y devuelve su resultado', async () => {
    const uow = new MongoUnitOfWork();
    const result = await uow.run(async (_tx: TransactionContext) => 42);
    expect(result).toBe(42);
  });

  it('ejecuta fn con un TransactionContext válido (opaco)', async () => {
    const uow = new MongoUnitOfWork();
    let receivedTx: TransactionContext | undefined;

    await uow.run(async (tx: TransactionContext) => {
      receivedTx = tx;
    });

    // El TX es opaco pero debe ser un objeto no nulo
    expect(receivedTx).toBeDefined();
    expect(typeof receivedTx).toBe('object');
  });

  it('propaga errores de dominio (AppError) sin envolverlos', async () => {
    const uow = new MongoUnitOfWork();
    const domainError = new OrderNotFoundError();

    await expect(
      uow.run(async (_tx: TransactionContext) => {
        throw domainError;
      })
    ).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('traduce errores no previstos a InternalError (500)', async () => {
    const uow = new MongoUnitOfWork();

    await expect(
      uow.run(async (_tx: TransactionContext) => {
        throw new Error('Error de infraestructura inesperado');
      })
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    });
  });

  it('InternalError lanzado desde fn se propaga como InternalError (dominio)', async () => {
    const uow = new MongoUnitOfWork();

    // InternalError es AppError, así que debe propagarse tal cual sin doble envoltura
    await expect(
      uow.run(async (_tx: TransactionContext) => {
        throw new InternalError();
      })
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    });
  });

  it('varios runs independientes no interfieren entre sí', async () => {
    const uow = new MongoUnitOfWork();

    const [r1, r2] = await Promise.all([
      uow.run(async (_tx) => 'result-1'),
      uow.run(async (_tx) => 'result-2'),
    ]);

    expect(r1).toBe('result-1');
    expect(r2).toBe('result-2');
  });
});

// ─── Tests del límite MAX_ATTEMPTS con sesión mock ───────────────────────────

describe('MongoUnitOfWork — límite MAX_ATTEMPTS (sesión mock)', () => {
  /**
   * MAX_ATTEMPTS = 3 (definido en MongoUnitOfWork.ts).
   *
   * El driver llama al callback de withTransaction hasta que se agota el tiempo.
   * IUnitOfWork lleva su propio contador: si attempts > MAX_ATTEMPTS lanza
   * InternalError para detener los reintentos.
   *
   * Con una sesión mock que invoca el callback 4 veces:
   *   - Intento 1 (attempts=1): fn se llama → fn lanza transientError → driver reintenta
   *   - Intento 2 (attempts=2): fn se llama → fn lanza transientError → driver reintenta
   *   - Intento 3 (attempts=3): fn se llama → fn lanza transientError → driver reintenta
   *   - Intento 4 (attempts=4 > 3): MongoUnitOfWork lanza InternalError ANTES de llamar fn
   *
   * Resultado esperado:
   *   - fn fue llamada exactamente 3 veces
   *   - el error final es InternalError (500 INTERNAL_ERROR)
   */
  it('lanza InternalError y llama a fn exactamente MAX_ATTEMPTS (3) veces cuando el driver reintenta más de 3 veces', async () => {
    // La sesión mock invoca el callback hasta 4 veces, simulando que el driver
    // sigue reintentando tras cada fallo con TransientTransactionError.
    const mockFactory = makeMockSessionFactory(4);
    const uow = new MongoUnitOfWork(mockFactory);

    let fnCallCount = 0;

    await expect(
      uow.run(async (_tx: TransactionContext) => {
        fnCallCount++;
        // Simular fallo transitorio en cada intento
        const err = new Error('WriteConflict simulado');
        throw err;
      })
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    });

    // fn debe haberse llamado exactamente MAX_ATTEMPTS (3) veces:
    // el 4.º ciclo del driver es cortado por MongoUnitOfWork lanzando InternalError
    // antes de invocar fn.
    expect(fnCallCount).toBe(3);
  });

  it('un solo intento que tiene éxito NO lanza InternalError', async () => {
    const mockFactory = makeMockSessionFactory(1);
    const uow = new MongoUnitOfWork(mockFactory);

    let fnCallCount = 0;
    const result = await uow.run(async (_tx: TransactionContext) => {
      fnCallCount++;
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(fnCallCount).toBe(1);
  });

  it('exactamente 3 intentos (igual a MAX_ATTEMPTS) que tienen éxito en el 3.º NO lanza InternalError', async () => {
    // El mock llama el callback 3 veces; fn lanza en las 2 primeras y tiene
    // éxito en la 3.ª. El UoW debe tolerar hasta MAX_ATTEMPTS y devolver el resultado.
    let callCount = 0;
    const mockFactory: SessionFactory = async () => {
      const mockSession = {
        withTransaction: async (callback: () => Promise<unknown>, _options?: unknown) => {
          let lastError: unknown;
          for (let i = 0; i < 3; i++) {
            try {
              await callback();
              return;
            } catch (err) {
              lastError = err;
            }
          }
          throw lastError;
        },
        endSession: async () => {},
      };
      return mockSession as unknown as mongoose.ClientSession;
    };

    const uow = new MongoUnitOfWork(mockFactory);
    const result = await uow.run(async (_tx: TransactionContext) => {
      callCount++;
      if (callCount < 3) {
        throw new Error('fallo transitorio simulado');
      }
      return 'exito-en-tercer-intento';
    });

    expect(result).toBe('exito-en-tercer-intento');
    expect(callCount).toBe(3);
  });
});
