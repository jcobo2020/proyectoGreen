/**
 * Migración de esquema — Customer y Counter (WI-H2-API-CLIENTES-001).
 * Crea las colecciones customers y counters con sus índices y lista lo que la base tiene.
 * En `npm test` solo lo comprueba: no escribe ningún fichero. El migration_log del work item
 * lo genera `npm run evidence`, que pasa la ruta destino en MIGRATION_LOG_FILE.
 */
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import fs from 'fs';
import path from 'path';
import { CustomerModel } from '../models/customer';
import { CounterModel } from '../models/counter';

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri());

  // Aplicar el esquema: crear colecciones y sincronizar los índices declarados
  await CustomerModel.createCollection();
  await CounterModel.createCollection();
  await CustomerModel.syncIndexes();
  await CounterModel.syncIndexes();
}, 90000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
}, 30000);

describe('Migración de esquema — Customer y Counter', () => {
  it('customers tiene los índices únicos de code e idNumber y el del listado {createdAt, _id}', async () => {
    const indexes = await CustomerModel.collection.listIndexes().toArray();

    expect(indexes.find((i) => i.key['code'] === 1 && i.unique === true)).toBeDefined();
    expect(indexes.find((i) => i.key['idNumber'] === 1 && i.unique === true)).toBeDefined();
    expect(
      indexes.find((i) => i.key['createdAt'] === -1 && i.key['_id'] === -1 && Object.keys(i.key).length === 2)
    ).toBeDefined();
  });

  it('el listado ordenado usa el índice {createdAt, _id}', async () => {
    const plan = await CustomerModel.find({}).sort({ createdAt: -1, _id: -1 }).limit(20).explain('queryPlanner');
    const text = JSON.stringify(plan);
    expect(text).toContain('createdAt_-1__id_-1');
    expect(text).not.toContain('"stage":"SORT"');
  });

  it('el índice único de idNumber rechaza una identificación repetida', async () => {
    const base = {
      personType: 'natural',
      idType: 'cedula',
      idNumber: '0999999999',
      firstNames: 'M',
      lastNames: 'G',
      email: 'm@example.com',
      sourceChannel: 'web',
    };
    await CustomerModel.create({ ...base, code: 'PRO-2026-990' });
    await expect(CustomerModel.create({ ...base, code: 'PRO-2026-991' })).rejects.toThrow(/duplicate key/);
    await CustomerModel.deleteMany({});
  });

  it('lista lo que la base tiene tras aplicar el esquema (migration_log)', async () => {
    const collections = await mongoose.connection.db!.listCollections().toArray();
    const names = collections.map((c) => c.name as string).sort();
    const customerIndexes = await CustomerModel.collection.listIndexes().toArray();
    const counterIndexes = await CounterModel.collection.listIndexes().toArray();

    const describe = (idx: { name?: string; key: Record<string, unknown>; unique?: boolean }) =>
      `  - ${idx.name as string}: ${JSON.stringify(idx.key)}${idx.unique ? ' [UNIQUE]' : ''}`;

    const log = [
      '=== Migration Log — WI-H2-API-CLIENTES-001 (Customer, Counter) ===',
      `Fecha: ${new Date().toISOString()}`,
      `MongoDB: ${(await mongoose.connection.db!.admin().serverInfo()).version as string}`,
      '',
      `Colecciones: ${names.join(', ')}`,
      '',
      "Índices en la colección 'customers':",
      ...customerIndexes.map(describe),
      '',
      "Índices en la colección 'counters':",
      ...counterIndexes.map(describe),
      '',
      'Resultado: OK — colecciones customers y counters creadas con sus índices',
    ].join('\n');

    // Solo con un comando aparte (npm run evidence): ninguna prueba reescribe un fichero versionado
    const target = process.env['MIGRATION_LOG_FILE'];
    if (target) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, log + '\n', 'utf8');
    }

    expect(names).toEqual(expect.arrayContaining(['customers', 'counters']));
    expect(log).toContain('idNumber_1: {"idNumber":1} [UNIQUE]');
    expect(log).toContain('createdAt_-1__id_-1: {"createdAt":-1,"_id":-1}');
  });
});
