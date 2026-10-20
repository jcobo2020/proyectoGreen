/**
 * Tests de contrato — GET /api/executives (WI-H2-API-EJECUTIVOS-001, evolución a la v6 en WI-H2-API-EJECUTIVOS-003)
 * AC-01 (RN-01, RN-02), AC-02 (RN-AUTH), el 404 y el 500 que declara la v6, y las restricciones
 * R4-SEG-*, R4-REND-1, R4-OBS-1.
 * AC-03 (RN-03, la siembra) está en seedExecutives.spec.ts.
 */
import request from 'supertest';
import { Application } from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createApp } from '../app';
import { ExecutiveModel, EXECUTIVE_COLLATION } from '../models/executive';
import { ExecutiveService } from '../services/ExecutiveService';
import { ExecutiveController } from '../controllers/ExecutiveController';
import { swaggerSpec } from '../config/swagger';

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

  it('RN-01 · orden alfabético español: las tildes, las minúsculas y la ñ no van al final', async () => {
    // En orden binario (sin intercalación) «andrés…», «Álvaro…», «Ñusta…» y «Óscar…» irían detrás de «Zoe…»
    await ExecutiveModel.create([
      { name: 'Zoe Vera' },
      { name: 'Óscar Paz' },
      { name: 'andrés Gil' },
      { name: 'Beatriz Lara' },
      { name: 'Ñusta Rey' },
      { name: 'Nora Sol' },
      { name: 'Álvaro Díaz' },
      { name: 'Oliva Tapia' },
    ]);

    const res = await request(app)
      .get('/api/executives')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect((res.body as Array<{ label: string }>).map((o) => o.label)).toEqual([
      'Álvaro Díaz',
      'andrés Gil',
      'Beatriz Lara',
      'Nora Sol',
      'Ñusta Rey',
      'Oliva Tapia',
      'Óscar Paz',
      'Zoe Vera',
    ]);
  });

  it('RN-01 · el equipo del prototipo sale en orden alfabético español', async () => {
    await ExecutiveModel.create(
      ['Daniela Ríos', 'Mauricio León', 'Paola Cedeño', 'Andrés Villacís', 'Karla Mendoza'].map((name) => ({ name }))
    );

    const res = await request(app)
      .get('/api/executives')
      .set('Authorization', `Bearer ${validToken}`);

    expect((res.body as Array<{ label: string }>).map((o) => o.label)).toEqual([
      'Andrés Villacís',
      'Daniela Ríos',
      'Karla Mendoza',
      'Mauricio León',
      'Paola Cedeño',
    ]);
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
  // R4-SEG-3: también el 401 viaja como {code, message, details}, con details vacío
  function expectUnauthorized(res: request.Response): void {
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 'UNAUTHORIZED', message: expect.any(String), details: [] });
    expect(res.body.message).not.toBe('');
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

describe('/api/executives — la autenticación va antes que todo (constitución: toda ruta de /api exige usuario)', () => {
  const UNAUTHORIZED = { code: 'UNAUTHORIZED', message: expect.any(String), details: [] };

  it('un método no declarado sin token responde 401 con details, no 404', async () => {
    for (const res of [
      await request(app).post('/api/executives').send({ name: 'x' }),
      await request(app).delete('/api/executives'),
      await request(app).put('/api/executives'),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual(UNAUTHORIZED);
    }
  });

  it('una subruta sin token responde 401 con details, no 404', async () => {
    const res = await request(app).get('/api/executives/123');
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
  });

  it('sin token y con un cuerpo que no es JSON válido responde 401, no 400', async () => {
    const res = await request(app)
      .post('/api/executives')
      .set('Content-Type', 'application/json')
      .send('{no es json');
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
  });

  it('con token, un método no declarado o una subruta responden 404 NOT_FOUND con details vacío', async () => {
    for (const res of [
      await request(app).post('/api/executives').set('Authorization', `Bearer ${validToken}`).send({}),
      await request(app).get('/api/executives/123').set('Authorization', `Bearer ${validToken}`),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 'NOT_FOUND', message: expect.any(String), details: [] });
    }
  });
});

describe('GET /api/executives — R4-REND-1: consulta por el índice {active, name}', () => {
  it('find({active: true}).sort({name: 1}) con intercalación es usa el índice active_1_name_1 (IXSCAN, sin SORT en memoria)', async () => {
    await ExecutiveModel.create([
      { name: 'Ana López', active: true },
      { name: 'Bruno Díaz', active: false },
    ]);

    const explain = (await ExecutiveModel.find({ active: true })
      .collation(EXECUTIVE_COLLATION)
      .sort({ name: 1 })
      .explain('queryPlanner')) as unknown;
    const plan = JSON.stringify(explain);

    expect(plan).toContain('IXSCAN');
    expect(plan).toContain('active_1_name_1');
    expect(plan).not.toContain('"stage":"SORT"');
  });

  it('la consulta del servicio es la que usa el índice: listActive pide la misma intercalación', async () => {
    const collationSpy = jest.spyOn(mongoose.Query.prototype, 'collation');
    try {
      await new ExecutiveService().listActive();
      expect(collationSpy).toHaveBeenCalledWith(EXECUTIVE_COLLATION);
    } finally {
      collationSpy.mockRestore();
    }
  });

  it('el orden lo pide la consulta del servicio, no lo regala el índice: con el índice oculto sigue en orden español', async () => {
    // Insertados fuera de orden; con active_1_name_1 oculto el planificador no puede devolverlos
    // en el orden del índice: sin .sort() saldrían en el de inserción, y sin la intercalación, en binario
    await ExecutiveModel.syncIndexes();
    await ExecutiveModel.create(['Zoe Vera', 'andrés Gil', 'Óscar Paz', 'Álvaro Díaz', 'Ñusta Rey', 'Nora Sol'].map((name) => ({ name })));
    const db = mongoose.connection.db!;
    await db.command({ collMod: 'executives', index: { name: 'active_1_name_1', hidden: true } });
    try {
      const options = await new ExecutiveService().listActive();
      expect(options.map((o) => o.label)).toEqual(['Álvaro Díaz', 'andrés Gil', 'Nora Sol', 'Ñusta Rey', 'Óscar Paz', 'Zoe Vera']);
    } finally {
      await db.command({ collMod: 'executives', index: { name: 'active_1_name_1', hidden: false } });
    }
  });

  it('sin la intercalación del índice, la misma consulta ordenaría en memoria (la prueba distingue)', async () => {
    await ExecutiveModel.create([{ name: 'Ana López' }]);
    const explain = (await ExecutiveModel.find({ active: true }).sort({ name: 1 }).explain('queryPlanner')) as unknown;
    expect(JSON.stringify(explain)).toContain('"stage":"SORT"');
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
      // La ruta completa, con el prefijo /api (el requestLogger que ya corrigió /api/customers)
      expect(entry).toMatchObject({ method: 'GET', path: '/api/executives', status: 200 });
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
      expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Error interno del servidor', details: [] });
      expect(JSON.stringify(res.body)).not.toContain('detalle interno');
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('/api/executives — Swagger veraz con la v6 del contrato', () => {
  type Operation = { responses: Record<string, { content?: { 'application/json'?: { schema?: { $ref?: string } } } }> };
  const spec = swaggerSpec as {
    paths: Record<string, Record<string, Operation>>;
    components: { schemas: Record<string, { properties?: Record<string, { enum?: string[] }>; required?: string[] }> };
  };

  it('GET documenta 200, 401, 404 y 500, los cuatro del contrato, y ningún otro método', () => {
    expect(Object.keys(spec.paths['/api/executives']).sort()).toEqual(['get']);
    expect(Object.keys(spec.paths['/api/executives'].get.responses).sort()).toEqual(['200', '401', '404', '500']);
  });

  it('cada error documenta su código del catálogo con {code, message, details}', () => {
    const responses = spec.paths['/api/executives'].get.responses;
    const codeOf = (status: string): string[] | undefined => {
      const ref = responses[status].content?.['application/json']?.schema?.$ref ?? '';
      const schema = spec.components.schemas[ref.replace('#/components/schemas/', '')];
      expect(schema?.required).toEqual(['code', 'message', 'details']);
      return schema?.properties?.['code']?.enum;
    };
    expect(codeOf('401')).toEqual(['UNAUTHORIZED']);
    expect(codeOf('404')).toEqual(['NOT_FOUND']);
    expect(codeOf('500')).toEqual(['INTERNAL_ERROR']);
  });
});
