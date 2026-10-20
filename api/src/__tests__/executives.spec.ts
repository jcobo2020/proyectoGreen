/**
 * Tests de contrato — GET /api/executives (WI-H2-API-EJECUTIVOS-001)
 * AC-01 (RN-01, RN-02), AC-02 (RN-AUTH) y las restricciones R4-SEG-*, R4-REND-1, R4-OBS-1.
 */
import request from 'supertest';
import { Application } from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createApp } from '../app';
import { ExecutiveModel } from '../models/executive';
import { ExecutiveService } from '../services/ExecutiveService';
import { ExecutiveController } from '../controllers/ExecutiveController';

let app: Application;
let replSet: MongoMemoryReplSet;
let jwtSecret: string;
let validToken: string;

function makeToken(secret: string, overrides: Record<string, unknown> = {}): string {
  const payload = {
    sub: 'executive-test-001',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  return jwt.sign(payload, secret, { algorithm: 'HS256', noTimestamp: true });
}

beforeAll(async () => {
  // Secreto de prueba generado al arrancar (nunca un literal)
  jwtSecret = crypto.randomBytes(32).toString('hex');
  process.env['JWT_SECRET'] = jwtSecret;
  process.env['JWT_SECRET_PREVIOUS'] = '';

  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri());
  await ExecutiveModel.syncIndexes();

  app = createApp(mongoose);
  validToken = makeToken(jwtSecret);
}, 90000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
}, 30000);

beforeEach(async () => {
  await ExecutiveModel.deleteMany({});
});

describe('GET /api/executives — AC-01: ejecutivos activos como opciones', () => {
  it('RN-01 · 200 [] cuando no hay ejecutivos', async () => {
    const res = await request(app)
      .get('/api/executives')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('RN-01 · 200 [] cuando solo hay ejecutivos inactivos', async () => {
    await ExecutiveModel.create([
      { name: 'Inactiva Uno', active: false },
      { name: 'Inactivo Dos', active: false },
    ]);

    const res = await request(app)
      .get('/api/executives')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('RN-01 · un ejecutivo inactivo no aparece y los activos salen ordenados por nombre', async () => {
    await ExecutiveModel.create([
      { name: 'Marta Ruiz', active: true },
      { name: 'Ana López', active: true },
      { name: 'Carlos Pérez', active: false },
      { name: 'Bruno Díaz' }, // active por defecto = true
    ]);

    const res = await request(app)
      .get('/api/executives')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    const labels = (res.body as Array<{ label: string }>).map((o) => o.label);
    expect(labels).toEqual(['Ana López', 'Bruno Díaz', 'Marta Ruiz']);
    expect(labels).not.toContain('Carlos Pérez');
  });

  it('RN-02 · cada opción es {value: _id (ObjectId válido), label: name} y nada más', async () => {
    const created = await ExecutiveModel.create([
      { name: 'Ana López', active: true },
      { name: 'Bruno Díaz', active: true },
    ]);

    const res = await request(app)
      .get('/api/executives')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    for (const option of res.body as Array<Record<string, unknown>>) {
      expect(Object.keys(option).sort()).toEqual(['label', 'value']);
      expect(typeof option['value']).toBe('string');
      expect(typeof option['label']).toBe('string');
      expect(mongoose.Types.ObjectId.isValid(option['value'] as string)).toBe(true);
      expect(new mongoose.Types.ObjectId(option['value'] as string).toString()).toBe(option['value']);

      const stored = created.find((d) => d._id.toString() === option['value']);
      expect(stored).toBeDefined();
      expect(option['label']).toBe(stored!.name);
    }
  });

  it('R4-SEG-2 · cualquier usuario autenticado lee la lista (sin permisos por rol, no hay 403)', async () => {
    await ExecutiveModel.create({ name: 'Ana López', active: true });
    const otherUserToken = makeToken(jwtSecret, { sub: 'otro-usuario', role: 'cualquiera' });

    const res = await request(app)
      .get('/api/executives')
      .set('Authorization', `Bearer ${otherUserToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /api/executives — AC-02 / RN-AUTH: 401 sin token válido', () => {
  function expectUnauthorized(res: request.Response): void {
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(typeof res.body.message).toBe('string');
  }

  it('401 UNAUTHORIZED sin cabecera Authorization', async () => {
    const res = await request(app).get('/api/executives');
    expectUnauthorized(res);
  });

  it('401 UNAUTHORIZED con un esquema que no es Bearer', async () => {
    const res = await request(app).get('/api/executives').set('Authorization', `Basic ${validToken}`);
    expectUnauthorized(res);
  });

  it('401 UNAUTHORIZED con un token firmado con otra clave', async () => {
    const foreign = makeToken(crypto.randomBytes(32).toString('hex'));
    const res = await request(app).get('/api/executives').set('Authorization', `Bearer ${foreign}`);
    expectUnauthorized(res);
  });

  it('401 UNAUTHORIZED con un token caducado', async () => {
    const expired = makeToken(jwtSecret, { exp: Math.floor(Date.now() / 1000) - 3600 });
    const res = await request(app).get('/api/executives').set('Authorization', `Bearer ${expired}`);
    expectUnauthorized(res);
  });

  it('401 UNAUTHORIZED con un token sin firma (alg none)', async () => {
    const unsigned = jwt.sign({ sub: 'x', exp: Math.floor(Date.now() / 1000) + 3600 }, '', {
      algorithm: 'none',
    });
    const res = await request(app).get('/api/executives').set('Authorization', `Bearer ${unsigned}`);
    expectUnauthorized(res);
  });

  it('401 no consulta la base: no filtra ejecutivos a quien no tiene sesión', async () => {
    await ExecutiveModel.create({ name: 'Ana López', active: true });
    const res = await request(app).get('/api/executives');
    expectUnauthorized(res);
    expect(JSON.stringify(res.body)).not.toContain('Ana López');
  });
});

describe('GET /api/executives — R4-REND-1: consulta por el índice {active, name}', () => {
  it('find({active: true}).sort({name: 1}) usa el índice active_1_name_1 (IXSCAN, sin SORT en memoria)', async () => {
    await ExecutiveModel.create([
      { name: 'Ana López', active: true },
      { name: 'Bruno Díaz', active: false },
    ]);

    const explain = (await ExecutiveModel.find({ active: true })
      .sort({ name: 1 })
      .explain('queryPlanner')) as unknown;
    const plan = JSON.stringify(explain);

    expect(plan).toContain('IXSCAN');
    expect(plan).toContain('active_1_name_1');
    expect(plan).not.toContain('"stage":"SORT"');
  });

  it('p95 por debajo de 100 ms en local', async () => {
    await ExecutiveModel.create(
      Array.from({ length: 30 }, (_, i) => ({ name: `Ejecutivo ${String(i).padStart(2, '0')}`, active: i % 3 !== 0 }))
    );

    const durations: number[] = [];
    for (let i = 0; i < 40; i++) {
      const start = process.hrtime.bigint();
      const res = await request(app).get('/api/executives').set('Authorization', `Bearer ${validToken}`);
      durations.push(Number(process.hrtime.bigint() - start) / 1e6);
      expect(res.status).toBe(200);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
    console.log(JSON.stringify({ metric: 'GET /api/executives p95 ms', p95: Math.round(p95 * 100) / 100 }));
    expect(p95).toBeLessThan(100);
  });
});

describe('GET /api/executives — R4-OBS-1: log estructurado por petición', () => {
  it('escribe un JSON con método, ruta, status, duración y requestId, sin el token', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await request(app)
        .get('/api/executives')
        .set('Authorization', `Bearer ${validToken}`)
        .set('X-Request-Id', 'req-ejecutivos-001');

      const lines = spy.mock.calls.map((c) => String(c[0]));
      const entry = lines
        .map((l) => {
          try {
            return JSON.parse(l) as Record<string, unknown>;
          } catch {
            return null;
          }
        })
        .find((e) => e !== null && e['requestId'] === 'req-ejecutivos-001');

      expect(entry).toBeDefined();
      // El requestLogger compartido con /api/orders registra req.path, que dentro del router
      // montado en /api queda sin el prefijo: hoy escribe '/executives' (igual que '/orders').
      expect(entry).toMatchObject({ method: 'GET', status: 200 });
      expect(String(entry!['path'])).toMatch(/\/executives$/);
      expect(typeof entry!['duration']).toBe('number');
      expect(lines.join('\n')).not.toContain(validToken);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('GET /api/executives — R4-SEG-3: un fallo inesperado pasa por el errorHandler', () => {
  it('responde 500 INTERNAL_ERROR sin exponer el detalle interno', async () => {
    const failing = new ExecutiveService();
    jest.spyOn(failing, 'listActive').mockRejectedValue(new Error('detalle interno de Mongo'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const appWithFailure = createApp(mongoose, { executiveController: new ExecutiveController(failing) });
      const res = await request(appWithFailure)
        .get('/api/executives')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
      expect(JSON.stringify(res.body)).not.toContain('detalle interno');
    } finally {
      errorSpy.mockRestore();
    }
  });
});
