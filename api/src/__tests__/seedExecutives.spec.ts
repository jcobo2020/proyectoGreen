/**
 * Tests del esquema y de la siembra de executives (WI-H2-API-EJECUTIVOS-001)
 * §3 (índices {name} único y {active, name}) y R4-ARQ-2 (seed idempotente: upsert por name, active = true).
 * No escriben ficheros versionados: la evidencia de migración sale de ejecutar `npm run seed:executives`.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { ExecutiveModel } from '../models/executive';
import { ExecutiveService, normalizeExecutiveName } from '../services/ExecutiveService';
import { parseExecutiveSeed } from '../validators/executive.validator';
import { readExecutiveSeedFile, runSeedExecutives, seedExecutivesCli } from '../scripts/seedExecutives';
import { ValidationError } from '../lib/errors';

let replSet: MongoMemoryReplSet;
let tmpDir: string;

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
  it('crea la colección executives con el índice único {name} y el índice {active, name}', async () => {
    await ExecutiveModel.syncIndexes();
    const indexes = await ExecutiveModel.collection.listIndexes().toArray();

    expect(ExecutiveModel.collection.collectionName).toBe('executives');
    const nameIndex = indexes.find((i) => JSON.stringify(i.key) === JSON.stringify({ name: 1 }));
    expect(nameIndex?.unique).toBe(true);
    const listIndex = indexes.find((i) => JSON.stringify(i.key) === JSON.stringify({ active: 1, name: 1 }));
    expect(listIndex).toBeDefined();
  });

  it('active vale true por defecto y name es obligatorio y único', async () => {
    await ExecutiveModel.syncIndexes();
    const doc = await ExecutiveModel.create({ name: 'Ana López' });
    expect(doc.active).toBe(true);

    await expect(ExecutiveModel.create({ active: true })).rejects.toThrow();
    await expect(ExecutiveModel.create({ name: 'Ana López' })).rejects.toThrow();
  });
});

describe('normalizeExecutiveName', () => {
  it('recorta y colapsa espacios', () => {
    expect(normalizeExecutiveName('  Ana   López ')).toBe('Ana López');
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

describe('ExecutiveService.seedActive — R4-ARQ-2: upsert por name, active = true', () => {
  const service = new ExecutiveService();

  it('crea los que no existen y es idempotente', async () => {
    await ExecutiveModel.syncIndexes();
    const first = await service.seedActive(['Ana López', 'Bruno Díaz']);
    expect(first).toEqual({ created: 2, updated: 0, unchanged: 0 });

    const second = await service.seedActive(['Ana López', 'Bruno Díaz']);
    expect(second).toEqual({ created: 0, updated: 0, unchanged: 2 });
    expect(await ExecutiveModel.countDocuments()).toBe(2);
  });

  it('deja active = true a un ejecutivo existente inactivo', async () => {
    await ExecutiveModel.syncIndexes();
    const existing = await ExecutiveModel.create({ name: 'Ana López', active: false });

    const result = await service.seedActive(['Ana López']);
    expect(result).toEqual({ created: 0, updated: 1, unchanged: 0 });

    const after = await ExecutiveModel.findById(existing._id);
    expect(after?.active).toBe(true);
  });

  it('no toca a los ejecutivos que no están en la lista', async () => {
    await ExecutiveModel.syncIndexes();
    await ExecutiveModel.create({ name: 'Carlos Pérez', active: false });
    await service.seedActive(['Ana López']);

    const carlos = await ExecutiveModel.findOne({ name: 'Carlos Pérez' });
    expect(carlos?.active).toBe(false);
  });

  it('una lista vacía no escribe nada', async () => {
    expect(await service.seedActive([])).toEqual({ created: 0, updated: 0, unchanged: 0 });
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
    const lines: string[] = [];
    const result = await runSeedExecutives(['Ana López', 'Bruno Díaz'], (l) => lines.push(l));

    expect(result).toEqual({ created: 2, updated: 0, unchanged: 0 });
    const output = lines.join('\n');
    expect(output).toContain('executives');
    expect(output).toContain('active_1_name_1');
    expect(output).toContain('name_1');
    expect(output).toContain('[UNIQUE]');
    expect(output).toContain('Ejecutivos activos: 2');
  });

  describe('seedExecutivesCli (npm run seed:executives -- <fichero.json>)', () => {
    function deps() {
      const out: string[] = [];
      const err: string[] = [];
      const connect = jest.fn(async () => undefined);
      const disconnect = jest.fn(async () => undefined);
      return { out, err, connect, disconnect, cli: { connect, disconnect, log: (l: string) => out.push(l), logError: (l: string) => err.push(l) } };
    }

    it('sin fichero sale con 1 y explica el uso, sin conectar', async () => {
      const d = deps();
      expect(await seedExecutivesCli([], d.cli)).toBe(1);
      expect(d.err.join('\n')).toContain('VALIDATION_ERROR');
      expect(d.err.join('\n')).toContain('npm run seed:executives');
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

    it('si falla la conexión sale con 1 con el mensaje del error', async () => {
      const d = deps();
      d.cli.connect = jest.fn(async () => {
        throw new Error('MONGODB_URI no está definida');
      });
      const file = path.join(tmpDir, 'equipo2.json');
      fs.writeFileSync(file, JSON.stringify(['Ana López']), 'utf8');
      expect(await seedExecutivesCli([file], d.cli)).toBe(1);
      expect(d.err.join('\n')).toContain('MONGODB_URI no está definida');
    });
  });
});
