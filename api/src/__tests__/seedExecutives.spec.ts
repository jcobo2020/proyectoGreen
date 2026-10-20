/**
 * Tests del esquema y de la siembra de executives (WI-H2-API-EJECUTIVOS-001, evolución a la v6 en WI-H2-API-EJECUTIVOS-003)
 * §3 (índices {name} único sin distinguir mayúsculas, tildes ni la ñ, y {active, name} con intercalación es),
 * AC-03 / RN-03 (la siembra crea los del equipo que falten y nunca toca a los que existen; con nombres
 * previos repetidos con esa equivalencia sale con error sin sembrar y sin escribir nombres) y R4-ARQ-2.
 * No escriben ficheros versionados: la evidencia de migración sale de ejecutar `npm run seed:executives`.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../app';
import { ExecutiveModel, EXECUTIVE_NAME_COLLATION } from '../models/executive';
import { ExecutiveService, normalizeExecutiveName, uniqueExecutiveNames } from '../services/ExecutiveService';
import * as connectDBModule from '../config/connectDB';
import { parseExecutiveSeed } from '../validators/executive.validator';
import {
  readExecutiveSeedFile,
  runSeedExecutives,
  seedExecutivesCli,
  TEAM_EXECUTIVES_FILE,
  SeedExecutivesError,
  connectForSeed,
} from '../scripts/seedExecutives';
import { ValidationError } from '../lib/errors';

/** La lista del equipo de la spec (§1 y RN-03), tal como va versionada en api/data/executives.json */
const TEAM = ['Daniela Ríos', 'Mauricio León', 'Paola Cedeño', 'Andrés Villacís', 'Karla Mendoza'];

let replSet: MongoMemoryReplSet;
let tmpDir: string;

/**
 * Los índices que la siembra tiene que dejar (§3, v6): {name} único sin distinguir mayúsculas, tildes
 * ni la ñ (intercalación raíz de Unicode, fuerza 1) y {active, name} con la intercalación es del orden.
 */
async function expectExecutiveSchema(): Promise<void> {
  const indexes = await ExecutiveModel.collection.listIndexes().toArray();
  const byName = new Map(indexes.map((i) => [i.name as string, i]));
  expect(byName.get('name_1')).toMatchObject({ key: { name: 1 }, unique: true, collation: { locale: 'en', strength: 1 } });
  expect(byName.get('active_1_name_1')).toMatchObject({
    key: { active: 1, name: 1 },
    collation: { locale: 'es', strength: 2 },
  });
}

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri());
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-executives-'));
}, 90000);

afterAll(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  await mongoose.disconnect();
  await replSet.stop();
}, 30000);

beforeEach(async () => {
  await ExecutiveModel.deleteMany({});
});

describe('Esquema de Executive (§3)', () => {
  it('crea la colección executives con {name} único sin distinguir mayúsculas, tildes ni la ñ y {active, name} con intercalación es', async () => {
    await ExecutiveModel.syncIndexes();
    const indexes = await ExecutiveModel.collection.listIndexes().toArray();

    expect(ExecutiveModel.collection.collectionName).toBe('executives');
    const nameIndex = indexes.find((i) => JSON.stringify(i.key) === JSON.stringify({ name: 1 }));
    expect(nameIndex?.unique).toBe(true);
    expect(nameIndex?.collation).toMatchObject({ locale: 'en', strength: 1 });
    expect(EXECUTIVE_NAME_COLLATION).toEqual({ locale: 'en', strength: 1 });
    const listIndex = indexes.find((i) => JSON.stringify(i.key) === JSON.stringify({ active: 1, name: 1 }));
    expect(listIndex).toBeDefined();
    expect(listIndex?.collation).toMatchObject({ locale: 'es', strength: 2 });
  });

  it('active vale true por defecto y name es obligatorio y único', async () => {
    await ExecutiveModel.syncIndexes();
    const doc = await ExecutiveModel.create({ name: 'Ana López' });
    expect(doc.active).toBe(true);

    await expect(ExecutiveModel.create({ active: true })).rejects.toThrow();
    await expect(ExecutiveModel.create({ name: 'Ana López' })).rejects.toThrow();
  });

  it('RN-03 · el nombre es único sin distinguir mayúsculas ni tildes: el índice rechaza «daniela rios» y «DANIELA RÍOS» si ya está «Daniela Ríos»', async () => {
    await ExecutiveModel.syncIndexes();
    await ExecutiveModel.create({ name: 'Daniela Ríos' });

    await expect(ExecutiveModel.create({ name: 'daniela rios' })).rejects.toThrow(/duplicate key/);
    await expect(ExecutiveModel.create({ name: 'DANIELA RÍOS' })).rejects.toThrow(/duplicate key/);
    await expect(ExecutiveModel.create({ name: 'Daniela Rios' })).rejects.toThrow(/duplicate key/);
    expect(await ExecutiveModel.countDocuments()).toBe(1);
  });

  it('RN-03 · ni la ñ: el índice rechaza «Nana Torres» y «nana torres» si ya está «Ñaña Torres»', async () => {
    await ExecutiveModel.syncIndexes();
    await ExecutiveModel.create({ name: 'Ñaña Torres' });

    await expect(ExecutiveModel.create({ name: 'Nana Torres' })).rejects.toThrow(/duplicate key/);
    await expect(ExecutiveModel.create({ name: 'nana torres' })).rejects.toThrow(/duplicate key/);
    await expect(ExecutiveModel.create({ name: 'ÑAÑA TORRES' })).rejects.toThrow(/duplicate key/);
    expect(await ExecutiveModel.countDocuments()).toBe(1);
  });

  it('RN-03 · la equivalencia no es la de la intercalación es: con es (aun con fuerza 1) la ñ es otra letra', async () => {
    // Por eso el índice único no usa la intercalación es del orden: con ella «Nana» y «Ñaña» serían dos
    const probe = mongoose.connection.db!.collection('executives_collation_probe');
    await probe.drop().catch(() => undefined);
    await probe.createIndex({ name: 1 }, { unique: true, collation: { locale: 'es', strength: 1 } });
    try {
      await probe.insertOne({ name: 'Ñaña Torres' });
      await expect(probe.insertOne({ name: 'Nana Torres' })).resolves.toBeDefined();
    } finally {
      await probe.drop();
    }
  });

  it('RN-03 · otros nombres distintos siguen siendo distintos (la equivalencia solo quita mayúsculas, tildes y la ñ)', async () => {
    await ExecutiveModel.syncIndexes();
    await ExecutiveModel.create([{ name: 'Ana López' }, { name: 'Ana Lopes' }, { name: 'Anna López' }, { name: 'Nana Torre' }, { name: 'Ñaña Torres' }]);
    expect(await ExecutiveModel.countDocuments()).toBe(5);
  });
});

describe('normalizeExecutiveName', () => {
  it('recorta y colapsa espacios', () => {
    expect(normalizeExecutiveName('  Ana   López ')).toBe('Ana López');
  });
});

describe('uniqueExecutiveNames — la misma equivalencia que el índice único (RN-03)', () => {
  it('«daniela rios», «DANIELA RÍOS» y «Daniela Ríos» son el mismo; se queda la primera forma', () => {
    expect(uniqueExecutiveNames(['Daniela Ríos', 'daniela rios', 'DANIELA RÍOS'])).toEqual(['Daniela Ríos']);
  });

  it('«Ñaña Torres», «Nana Torres» y «nana torres» son el mismo', () => {
    expect(uniqueExecutiveNames(['Ñaña Torres', 'Nana Torres', 'nana torres'])).toEqual(['Ñaña Torres']);
  });

  it('nombres distintos siguen siendo distintos', () => {
    expect(uniqueExecutiveNames(['Ana López', 'Anna López', 'Ana Lopes'])).toEqual(['Ana López', 'Anna López', 'Ana Lopes']);
  });
});

describe('parseExecutiveSeed (validación de la entrada del seed)', () => {
  it('acepta una lista de nombres y la devuelve normalizada y sin repetidos', () => {
    expect(parseExecutiveSeed([' Ana López', 'Bruno Díaz', 'Ana  López'])).toEqual(['Ana López', 'Bruno Díaz']);
  });

  it('acepta una lista vacía', () => {
    expect(parseExecutiveSeed([])).toEqual([]);
  });

  it('rechaza lo que no es una lista', () => {
    expect(() => parseExecutiveSeed({ name: 'Ana' })).toThrow(ValidationError);
  });

  it('rechaza elementos que no son texto o están vacíos, señalando su posición', () => {
    try {
      parseExecutiveSeed(['Ana López', 42, '   ']);
      throw new Error('debía fallar');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details).toEqual([
        { field: '[1]', message: 'Cada ejecutivo debe ser un nombre de texto no vacío' },
        { field: '[2]', message: 'Cada ejecutivo debe ser un nombre de texto no vacío' },
      ]);
    }
  });
});

describe('La lista del equipo versionada (§1 y RN-03)', () => {
  it('api/data/executives.json trae exactamente los 5 ejecutivos del equipo', () => {
    expect(path.relative(path.resolve(__dirname, '../..'), TEAM_EXECUTIVES_FILE)).toBe(path.join('data', 'executives.json'));
    expect(readExecutiveSeedFile(TEAM_EXECUTIVES_FILE)).toEqual(TEAM);
  });
});

describe('ExecutiveService.seedMissing — RN-03: crea los que falten y nunca toca a los que existen', () => {
  const service = new ExecutiveService();

  beforeEach(async () => {
    await ExecutiveModel.syncIndexes();
  });

  it('crea los que no existen, con active = true, y es idempotente', async () => {
    const first = await service.seedMissing(TEAM);
    expect(first).toEqual({ created: 5, unchanged: 0 });
    expect(await ExecutiveModel.countDocuments({ active: true })).toBe(5);

    const second = await service.seedMissing(TEAM);
    expect(second).toEqual({ created: 0, unchanged: 5 });
    expect(await ExecutiveModel.countDocuments()).toBe(5);
  });

  it('no reactiva a un ejecutivo dado de baja', async () => {
    const existing = await ExecutiveModel.create({ name: 'Paola Cedeño', active: false });

    const result = await service.seedMissing(TEAM);
    expect(result).toEqual({ created: 4, unchanged: 1 });

    const after = await ExecutiveModel.findById(existing._id);
    expect(after?.active).toBe(false);
  });

  it('no cambia el nombre de uno que ya existe con otras mayúsculas o tildes ni crea otro', async () => {
    const existing = await ExecutiveModel.create({ name: 'daniela rios' });

    const result = await service.seedMissing(['Daniela Ríos']);
    expect(result).toEqual({ created: 0, unchanged: 1 });
    expect(await ExecutiveModel.countDocuments()).toBe(1);
    expect((await ExecutiveModel.findById(existing._id))?.name).toBe('daniela rios');
  });

  it('con «Ñaña Torres» en la base, «Nana Torres» en la lista no crea otro ni la toca', async () => {
    const existing = await ExecutiveModel.create({ name: 'Ñaña Torres', active: false });

    expect(await service.seedMissing(['Nana Torres'])).toEqual({ created: 0, unchanged: 1 });
    const after = await ExecutiveModel.findById(existing._id).lean();
    expect(after).toMatchObject({ name: 'Ñaña Torres', active: false });
    expect(await ExecutiveModel.countDocuments()).toBe(1);
  });

  it('un repetido con otras mayúsculas, tildes o ñ dentro de la misma lista cuenta una vez y no crea otro', async () => {
    // El servicio quita los repetidos con la equivalencia del índice antes de escribir: no depende
    // del orden en que la base ejecute las escrituras
    const bulkWrite = jest.spyOn(ExecutiveModel, 'bulkWrite');
    try {
      const result = await service.seedMissing(['Daniela Ríos', 'daniela rios', 'DANIELA RÍOS']);
      expect(result).toEqual({ created: 1, unchanged: 0 });
      expect(bulkWrite).toHaveBeenCalledTimes(1);
      expect(bulkWrite.mock.calls[0][0]).toHaveLength(1);
    } finally {
      bulkWrite.mockRestore();
    }
    expect(await ExecutiveModel.countDocuments()).toBe(1);
    expect((await ExecutiveModel.findOne({}).lean())?.name).toBe('Daniela Ríos');
  });

  it('las tildes y la ñ no distinguen: «Daniela Rios» y «Daniela Ríos» son uno, «Nana Torres» y «Ñaña Torres» otro', async () => {
    expect(await service.seedMissing(['Daniela Ríos', 'Daniela Rios', 'Ñaña Torres', 'Nana Torres'])).toEqual({
      created: 2,
      unchanged: 0,
    });
    expect((await ExecutiveModel.find({}).lean()).map((d) => d.name).sort()).toEqual(['Daniela Ríos', 'Ñaña Torres']);
  });

  it('cada escritura busca el nombre con la intercalación del índice único', async () => {
    const bulkWrite = jest.spyOn(ExecutiveModel, 'bulkWrite');
    try {
      await service.seedMissing(['Ana López']);
      const ops = bulkWrite.mock.calls[0][0] as Array<{ updateOne: { collation: unknown } }>;
      expect(ops[0].updateOne.collation).toEqual(EXECUTIVE_NAME_COLLATION);
    } finally {
      bulkWrite.mockRestore();
    }
  });

  it('no toca a los ejecutivos que no están en la lista', async () => {
    await ExecutiveModel.create({ name: 'Carlos Pérez', active: false });
    await service.seedMissing(['Ana López']);

    const carlos = await ExecutiveModel.findOne({ name: 'Carlos Pérez' });
    expect(carlos?.active).toBe(false);
  });

  it('una lista vacía no escribe nada', async () => {
    expect(await service.seedMissing([])).toEqual({ created: 0, unchanged: 0 });
    expect(await ExecutiveModel.countDocuments()).toBe(0);
  });
});

describe('AC-03 · npm run seed:executives dos veces, y otra tras dar de baja a «Paola Cedeño»', () => {
  const cliDeps = {
    connect: async () => undefined,
    disconnect: async () => undefined,
    log: () => undefined,
    logError: () => undefined,
  };

  it('deja los 5 del equipo, Paola inactiva y fuera de GET /api/executives, y «daniela rios» no crea otro', async () => {
    // Collection limpia y sin índices: la siembra crea el esquema ella misma
    await ExecutiveModel.collection.drop().catch(() => undefined);

    // Sin argumento: la lista versionada del equipo; la primera siembra crea el esquema
    expect(await seedExecutivesCli([], cliDeps)).toBe(0);
    await expectExecutiveSchema();
    expect(await seedExecutivesCli([], cliDeps)).toBe(0);
    expect(await ExecutiveModel.countDocuments()).toBe(5);

    // Baja de Paola (la gobernará «Administración»; aquí, directamente en la base)
    await ExecutiveModel.updateOne({ name: 'Paola Cedeño' }, { $set: { active: false } });
    expect(await seedExecutivesCli([], cliDeps)).toBe(0);

    // «daniela rios» (sin mayúsculas ni tilde) es la misma que «Daniela Ríos»
    const lowercaseFile = path.join(tmpDir, 'daniela-minusculas.json');
    fs.writeFileSync(lowercaseFile, JSON.stringify(['daniela rios']), 'utf8');
    expect(await seedExecutivesCli([lowercaseFile], cliDeps)).toBe(0);

    const docs = await ExecutiveModel.find({}).lean();
    expect(docs.map((d) => d.name).sort()).toEqual([...TEAM].sort());
    expect(docs.find((d) => d.name === 'Paola Cedeño')?.active).toBe(false);
    expect(docs.filter((d) => d.active)).toHaveLength(4);

    // Y GET /api/executives no la ofrece
    process.env['JWT_SECRET'] = crypto.randomBytes(32).toString('hex');
    const token = jwt.sign(
      { sub: 'executive-test-ac03', exp: Math.floor(Date.now() / 1000) + 3600 },
      process.env['JWT_SECRET'],
      { algorithm: 'HS256', noTimestamp: true }
    );
    const res = await request(createApp(mongoose)).get('/api/executives').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect((res.body as Array<{ label: string }>).map((o) => o.label)).toEqual([
      'Andrés Villacís',
      'Daniela Ríos',
      'Karla Mendoza',
      'Mauricio León',
    ]);
  });
});

describe('Script seed:executives', () => {
  it('lee y valida el fichero JSON', () => {
    const file = path.join(tmpDir, 'ok.json');
    fs.writeFileSync(file, JSON.stringify(['Ana López']), 'utf8');
    expect(readExecutiveSeedFile(file)).toEqual(['Ana López']);
  });

  it('falla con un mensaje claro si el fichero no es JSON', () => {
    const file = path.join(tmpDir, 'roto.json');
    fs.writeFileSync(file, 'no es json', 'utf8');
    expect(() => readExecutiveSeedFile(file)).toThrow(ValidationError);
  });

  it('crea el esquema, siembra y lista lo que la base tiene', async () => {
    // Sin colección ni índices previos: no depende de lo que hayan dejado otras pruebas
    await ExecutiveModel.collection.drop().catch(() => undefined);
    const lines: string[] = [];
    const result = await runSeedExecutives(['Ana López', 'Bruno Díaz'], (l) => lines.push(l));

    expect(result).toEqual({ created: 2, unchanged: 0 });
    const output = lines.join('\n');
    expect(output).toContain('executives');
    expect(output).toContain('active_1_name_1');
    expect(output).toContain('name_1');
    expect(output).toContain('[UNIQUE]');
    expect(output).toContain('name_1: {"name":1} [UNIQUE] [collation en strength 1]');
    expect(output).toContain('active_1_name_1: {"active":1,"name":1} [collation es strength 2]');
    expect(output).toContain('Creados: 2 · Ya existían (sin tocar): 0');
    expect(output).toContain('Ejecutivos activos: 2');
    await expectExecutiveSchema();
  });

  describe('seedExecutivesCli (npm run seed:executives [-- <fichero.json>])', () => {
    function deps() {
      const out: string[] = [];
      const err: string[] = [];
      const connect = jest.fn(async () => undefined);
      const disconnect = jest.fn(async () => undefined);
      return { out, err, connect, disconnect, cli: { connect, disconnect, log: (l: string) => out.push(l), logError: (l: string) => err.push(l) } };
    }

    it('sin fichero siembra la lista versionada del equipo y sale con 0 sin escribir nombres', async () => {
      const d = deps();
      expect(await seedExecutivesCli([], d.cli)).toBe(0);
      expect(d.connect).toHaveBeenCalledTimes(1);
      expect(d.disconnect).toHaveBeenCalledTimes(1);
      expect(d.out.join('\n')).toContain('Nombres en la lista: 5');
      for (const name of TEAM) expect(d.out.join('\n')).not.toContain(name);
    });

    it('con un fichero que no existe sale con 1 y VALIDATION_ERROR, sin conectar', async () => {
      const d = deps();
      expect(await seedExecutivesCli([path.join(tmpDir, 'no-existe.json')], d.cli)).toBe(1);
      expect(d.err.join('\n')).toContain('VALIDATION_ERROR');
      expect(d.connect).not.toHaveBeenCalled();
    });

    it('con un fichero inválido sale con 1 sin conectar', async () => {
      const d = deps();
      const file = path.join(tmpDir, 'invalido.json');
      fs.writeFileSync(file, JSON.stringify(['', 3]), 'utf8');
      expect(await seedExecutivesCli([file], d.cli)).toBe(1);
      expect(d.err.join('\n')).toContain('[0]');
      expect(d.connect).not.toHaveBeenCalled();
    });

    it('con un fichero válido conecta, siembra, desconecta y sale con 0 sin escribir nombres', async () => {
      const d = deps();
      const file = path.join(tmpDir, 'equipo.json');
      fs.writeFileSync(file, JSON.stringify(['Ana López']), 'utf8');
      expect(await seedExecutivesCli([file], d.cli)).toBe(0);
      expect(d.connect).toHaveBeenCalledTimes(1);
      expect(d.disconnect).toHaveBeenCalledTimes(1);
      expect(d.out.join('\n')).toContain('Creados: 1');
      expect(d.out.join('\n')).not.toContain('Ana López');
    });

    it('la siembra conecta sin autoIndex: ningún índice se intenta crear antes de comprobar los repetidos', async () => {
    const previous = process.env['MONGODB_URI'];
    process.env['MONGODB_URI'] = 'mongodb://127.0.0.1:1/seed-sin-autoindex';
    const connect = jest.spyOn(connectDBModule, 'connectDB').mockResolvedValue(mongoose);
    try {
      await connectForSeed();
      expect(connect).toHaveBeenCalledWith('mongodb://127.0.0.1:1/seed-sin-autoindex', { autoIndex: false });
    } finally {
      connect.mockRestore();
      if (previous === undefined) delete process.env['MONGODB_URI'];
      else process.env['MONGODB_URI'] = previous;
    }
  });

  it('sin MONGODB_URI la conexión de la siembra falla con un SeedExecutivesError legible', async () => {
      const previous = process.env['MONGODB_URI'];
      delete process.env['MONGODB_URI'];
      try {
        await expect(connectForSeed()).rejects.toThrow(SeedExecutivesError);
        await expect(connectForSeed()).rejects.toThrow(/MONGODB_URI/);
      } finally {
        if (previous !== undefined) process.env['MONGODB_URI'] = previous;
      }
    });

    it('si falla la conexión sale con 1 con el mensaje de la configuración (no es un dato personal)', async () => {
      const d = deps();
      d.cli.connect = jest.fn(async () => {
        throw new SeedExecutivesError('MONGODB_URI no está definida');
      });
      const file = path.join(tmpDir, 'equipo2.json');
      fs.writeFileSync(file, JSON.stringify(['Ana López']), 'utf8');
      expect(await seedExecutivesCli([file], d.cli)).toBe(1);
      expect(d.err.join('\n')).toContain('MONGODB_URI no está definida');
    });
  });
});

describe('RN-03 · con nombres previos repetidos (mayúsculas, tildes o ñ) la siembra sale con error sin sembrar', () => {
  const PEOPLE = ['Nana Torres', 'Ñaña Torres'];

  function capture() {
    const out: string[] = [];
    const err: string[] = [];
    return {
      out,
      err,
      deps: {
        connect: async () => undefined,
        disconnect: async () => undefined,
        log: (l: string) => out.push(l),
        logError: (l: string) => err.push(l),
      },
    };
  }

  /** Datos previos sin índices (una base anterior, o la v4 con su índice que sí distinguía la ñ). */
  async function previousData(names: string[]): Promise<void> {
    await ExecutiveModel.collection.drop().catch(() => undefined);
    await ExecutiveModel.collection.insertMany(names.map((name) => ({ name, active: true })));
  }

  async function expectFailsWithoutSeedingNorNames(names: string[]): Promise<void> {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sync = jest.spyOn(ExecutiveModel, 'syncIndexes');
    try {
      const c = capture();
      expect(await seedExecutivesCli([], c.deps)).toBe(1);

      const stderr = c.err.join('\n');
      expect(stderr).toContain('npm run seed:executives');
      expect(stderr).toMatch(/mismo nombre sin distinguir mayúsculas, tildes ni la ñ/);
      expect(stderr).toMatch(/No se ha sembrado nada/);
      const everything = [
        ...c.out,
        ...c.err,
        ...consoleError.mock.calls.flat(),
        ...consoleLog.mock.calls.flat(),
        ...consoleWarn.mock.calls.flat(),
      ]
        .map(String)
        .join('\n');
      for (const name of [...names, ...TEAM]) expect(everything).not.toContain(name);
      expect(everything).not.toContain('dup key');

      // Ni siquiera intentó crear el índice único (la base registraría el nombre repetido en su propio log)
      expect(sync).not.toHaveBeenCalled();
      expect((await ExecutiveModel.collection.listIndexes().toArray()).map((i) => i.name)).not.toContain('name_1');
      // No sembró nada: siguen los de antes
      expect(await ExecutiveModel.countDocuments()).toBe(names.length);
    } finally {
      sync.mockRestore();
      consoleError.mockRestore();
      consoleLog.mockRestore();
      consoleWarn.mockRestore();
    }
  }

  it('con «Nana Torres» y «Ñaña Torres» previos sale con 1, dice qué hacer, no siembra y no escribe ningún nombre', async () => {
    await previousData(PEOPLE);
    await expectFailsWithoutSeedingNorNames(PEOPLE);
  });

  it('con «Daniela Rios» y «Daniela Ríos» previos (solo difieren en una tilde) también', async () => {
    const names = ['Daniela Rios', 'Daniela Ríos'];
    await previousData(names);
    await expectFailsWithoutSeedingNorNames(names);
  });

  it('con «Karla Mendoza» y «karla mendoza» previos (solo difieren en mayúsculas) también', async () => {
    const names = ['Karla Mendoza', 'karla mendoza'];
    await previousData(names);
    await expectFailsWithoutSeedingNorNames(names);
  });

  it('dice cuántos nombres se repiten, sin decir cuáles', async () => {
    await previousData([...PEOPLE, 'Karla Mendoza', 'KARLA MENDOZA', 'Ana López']);
    const c = capture();
    expect(await seedExecutivesCli([], c.deps)).toBe(1);
    expect(c.err.join('\n')).toMatch(/2 nombres se repiten/);
  });

  it('una base de la v4 (name_1 con la intercalación es, que distinguía tildes y ñ) y sin repetidos: la siembra sustituye el índice', async () => {
    await ExecutiveModel.collection.drop().catch(() => undefined);
    await ExecutiveModel.collection.createIndex({ name: 1 }, { unique: true, collation: { locale: 'es', strength: 2 } });
    await ExecutiveModel.collection.insertOne({ name: 'Ana López', active: true });

    const c = capture();
    expect(await seedExecutivesCli([], c.deps)).toBe(0);
    await expectExecutiveSchema();
    expect(await ExecutiveModel.countDocuments()).toBe(6);
  });

  it('aunque syncIndexes no avise (la carrera con el autoIndex de Mongoose), comprueba los índices y sale con 1', async () => {
    // Sin repetidos ni índices: la comprobación previa pasa, syncIndexes «no hace nada» y la de después lo detecta
    await ExecutiveModel.collection.drop().catch(() => undefined);
    await ExecutiveModel.collection.insertOne({ name: 'Ana López', active: true });
    const sync = jest.spyOn(ExecutiveModel, 'syncIndexes').mockResolvedValue([]);
    try {
      const c = capture();
      expect(await seedExecutivesCli([], c.deps)).toBe(1);
      expect(c.err.join('\n')).toContain('name_1');
      expect(await ExecutiveModel.countDocuments()).toBe(1);
    } finally {
      sync.mockRestore();
    }
  });

  it('si la creación del índice falla por un repetido que entró después de comprobar, no propaga el nombre y sale con 1', async () => {
    await ExecutiveModel.collection.drop().catch(() => undefined);
    await ExecutiveModel.collection.insertOne({ name: 'Ana López', active: true });
    const sync = jest
      .spyOn(ExecutiveModel, 'syncIndexes')
      .mockRejectedValue(Object.assign(new Error('E11000 duplicate key error dup key: { name: "Ana López" }'), { code: 11000 }));
    try {
      const c = capture();
      expect(await seedExecutivesCli([], c.deps)).toBe(1);
      expect(c.err.join('\n')).toContain('name_1');
      expect(c.err.join('\n')).not.toContain('Ana López');
      expect(await ExecutiveModel.countDocuments()).toBe(1);
    } finally {
      sync.mockRestore();
    }
  });

  it('un error inesperado se registra sin su mensaje (puede llevar un nombre)', async () => {
    const c = capture();
    c.deps.connect = async () => {
      throw Object.assign(new Error('E11000 duplicate key error dup key: { name: "Karla Mendoza" }'), { code: 11000 });
    };
    expect(await seedExecutivesCli([], c.deps)).toBe(1);
    const stderr = c.err.join('\n');
    expect(stderr).toContain('11000');
    expect(stderr).not.toContain('Karla Mendoza');
    expect(stderr).not.toContain('dup key');
  });
});
