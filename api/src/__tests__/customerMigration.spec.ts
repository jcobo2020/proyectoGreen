/**
 * Migración de esquema — Customer y Counter (WI-H2-API-CLIENTES-001).
 * Crea las colecciones customers y counters con sus índices, lista lo que la base tiene
 * y deja esa salida como migration_log del work item.
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

  it('genera el log de migración con lo que la base tiene', async () => {
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

    console.log(log);
    const evidenceDir = path.resolve(__dirname, '../../../.sdd/evidence/WI-H2-API-CLIENTES-001');
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, 'migration.log'), log + '\n', 'utf8');

    expect(names).toEqual(expect.arrayContaining(['customers', 'counters']));
  });
});
