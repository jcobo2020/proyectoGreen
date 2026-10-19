/**
 * Tests de contrato e integración — /api/customers (WI-H2-API-CLIENTES-001)
 * AC-01..AC-07 · RN-01, RN-02, RN-03, RN-05, RN-06, RN-07, RN-08, RN-09, RN-10, RN-AUTH
 */
import request from 'supertest';
import { Application } from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createApp } from '../app';
import { CustomerModel } from '../models/customer';
import { CounterModel } from '../models/counter';
import { listCustomersPipeline } from '../services/CustomerService';

let app: Application;
let replSet: MongoMemoryReplSet;
let jwtSecret: string;
let validToken: string;

const YEAR = new Date().getUTCFullYear();

function makeToken(secret: string, overrides: Record<string, unknown> = {}): string {
  const payload = {
    sub: 'executive-test-001',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  return jwt.sign(payload, secret, { algorithm: 'HS256', noTimestamp: true });
}

function auth(req: request.Test): request.Test {
  return req.set('Authorization', `Bearer ${validToken}`);
}

function executives() {
  return mongoose.connection.collection('executives');
}

function opportunities() {
  return mongoose.connection.collection('opportunities');
}

async function seedExecutive(name: string, active = true): Promise<string> {
  const result = await executives().insertOne({ name, active });
  return result.insertedId.toString();
}

function naturalBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    personType: 'natural',
    idType: 'cedula',
    idNumber: '0102030405',
    firstNames: 'Ana María',
    lastNames: 'Pérez Gómez',
    email: 'ana.perez@example.com',
    mobilePhone: '0991234567',
    city: 'Quito',
    address: 'Av. Amazonas N24-03',
    sourceChannel: 'referido',
    notes: 'Cliente de prueba',
    ...overrides,
  };
}

function legalBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    personType: 'legal',
    idType: 'ruc',
    idNumber: '1790012345001',
    legalName: 'Comercial Andina S.A.',
    email: 'contacto@andina.example.com',
    sourceChannel: 'web',
    contactName: 'Luis Torres',
    contactTitle: 'Gerente de compras',
    contactEmail: 'luis.torres@andina.example.com',
    ...overrides,
  };
}

function messagesOf(res: request.Response): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of res.body.details as Array<{ field: string; message: string }>) {
    map[d.field] = d.message;
  }
  return map;
}

beforeAll(async () => {
  jwtSecret = crypto.randomBytes(32).toString('hex');
  process.env['JWT_SECRET'] = jwtSecret;
  process.env['JWT_SECRET_PREVIOUS'] = '';

  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uri = replSet.getUri();
  process.env['MONGODB_URI'] = uri;

  await mongoose.connect(uri);
  await CustomerModel.syncIndexes();
  app = createApp(mongoose);
  validToken = makeToken(jwtSecret);
}, 90000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
}, 30000);

beforeEach(async () => {
  await CustomerModel.deleteMany({});
  await CounterModel.deleteMany({});
  await executives().deleteMany({});
  await opportunities().deleteMany({});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────
// AC-07 · RN-AUTH — 401 en cada endpoint
// ────────────────────────────────────────────────────────────────────────────

describe('AC-07 · RN-AUTH — sin token válido responde 401 UNAUTHORIZED', () => {
  const someId = new mongoose.Types.ObjectId().toString();
  const cases: Array<[string, () => request.Test]> = [
    ['GET /api/customers', () => request(app).get('/api/customers')],
    ['POST /api/customers', () => request(app).post('/api/customers').send(naturalBody())],
    ['GET /api/customers/:id', () => request(app).get(`/api/customers/${someId}`)],
    ['PUT /api/customers/:id', () => request(app).put(`/api/customers/${someId}`).send({ email: 'a@b.co' })],
  ];

  it.each(cases)('%s sin Authorization → 401', async (_name, build) => {
    const res = await build();
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(typeof res.body.message).toBe('string');
    expect(res.body.details).toEqual([]);
  });

  it.each(cases)('%s con un token firmado con otra clave → 401', async (_name, build) => {
    const res = await build().set('Authorization', `Bearer ${makeToken(crypto.randomBytes(32).toString('hex'))}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/customers con un token caducado → 401 y no crea nada', async () => {
    const expired = makeToken(jwtSecret, { exp: Math.floor(Date.now() / 1000) - 3600 });
    const res = await request(app).post('/api/customers').set('Authorization', `Bearer ${expired}`).send(naturalBody());
    expect(res.status).toBe(401);
    expect(await CustomerModel.countDocuments()).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/customers
// ────────────────────────────────────────────────────────────────────────────

describe('POST /api/customers — AC-01: alta de un cliente válido', () => {
  it('201 · persona natural: devuelve id, código PRO-AAAA-NNN, los datos enviados y createdAt', async () => {
    const res = await auth(request(app).post('/api/customers')).send(naturalBody());

    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^[0-9a-f]{24}$/);
    expect(res.body.code).toBe(`PRO-${YEAR}-001`);
    expect(res.body).toMatchObject({
      personType: 'natural',
      idType: 'cedula',
      idNumber: '0102030405',
      firstNames: 'Ana María',
      lastNames: 'Pérez Gómez',
      email: 'ana.perez@example.com',
      mobilePhone: '0991234567',
      city: 'Quito',
      address: 'Av. Amazonas N24-03',
      sourceChannel: 'referido',
      notes: 'Cliente de prueba',
    });
    expect(new Date(res.body.createdAt).toString()).not.toBe('Invalid Date');
    expect(res.body).not.toHaveProperty('_id');

    const stored = await CustomerModel.findById(res.body.id).lean();
    expect(stored?.code).toBe(`PRO-${YEAR}-001`);
  });

  it('201 · persona jurídica con ejecutivo activo y contacto principal', async () => {
    const executiveId = await seedExecutive('Marta Ruiz');
    const res = await auth(request(app).post('/api/customers')).send(legalBody({ accountExecutiveId: executiveId }));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      personType: 'legal',
      idType: 'ruc',
      idNumber: '1790012345001',
      legalName: 'Comercial Andina S.A.',
      accountExecutiveId: executiveId,
      contactName: 'Luis Torres',
      contactTitle: 'Gerente de compras',
      contactEmail: 'luis.torres@andina.example.com',
    });
  });

  it('201 · el pasaporte admite de 5 a 20 letras o dígitos aunque parezca una cédula', async () => {
    const res = await auth(request(app).post('/api/customers')).send(
      naturalBody({ idType: 'passport', idNumber: '0102030405' })
    );
    expect(res.status).toBe(201);
    const res2 = await auth(request(app).post('/api/customers')).send(
      naturalBody({ idType: 'passport', idNumber: 'AB12345' })
    );
    expect(res2.status).toBe(201);
  });

  it('201 · los códigos siguen la secuencia anual (001, 002, 003)', async () => {
    const codes: string[] = [];
    for (const idNumber of ['0102030401', '0102030402', '0102030403']) {
      const res = await auth(request(app).post('/api/customers')).send(naturalBody({ idNumber }));
      expect(res.status).toBe(201);
      codes.push(res.body.code);
    }
    expect(codes).toEqual([`PRO-${YEAR}-001`, `PRO-${YEAR}-002`, `PRO-${YEAR}-003`]);
    const counter = await CounterModel.findById(`customers-${YEAR}`).lean();
    expect(counter?.seq).toBe(3);
  });

  it('R4-OBS-2 · registra el evento cliente_creado con su código y nunca el correo ni el teléfono', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const res = await auth(request(app).post('/api/customers')).send(naturalBody());
    expect(res.status).toBe(201);

    const lines = logSpy.mock.calls.map((c) => String(c[0]));
    const event = lines.map((l) => JSON.parse(l)).find((e) => e.event === 'cliente_creado');
    expect(event).toEqual({ event: 'cliente_creado', codigo: res.body.code });

    const all = lines.join('\n');
    expect(all).not.toContain('ana.perez@example.com');
    expect(all).not.toContain('0991234567');

    // R4-OBS-1: una línea JSON por petición, con el mismo requestLogger que /api/orders
    const requestLine = lines.map((l) => JSON.parse(l)).find((e) => e.method === 'POST' && 'requestId' in e);
    expect(requestLine).toMatchObject({ method: 'POST', status: 201 });
    expect(requestLine.path).toBe('/api/customers');
    expect(typeof requestLine.duration).toBe('number');
    expect(typeof requestLine.requestId).toBe('string');
  });
});

describe('POST /api/customers — RN-06: el código sale de un contador atómico', () => {
  it('dos POST concurrentes dan PRO-AAAA-001 y PRO-AAAA-002', async () => {
    const [a, b] = await Promise.all([
      auth(request(app).post('/api/customers')).send(naturalBody({ idNumber: '1111111111' })),
      auth(request(app).post('/api/customers')).send(naturalBody({ idNumber: '2222222222' })),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect([a.body.code, b.body.code].sort()).toEqual([`PRO-${YEAR}-001`, `PRO-${YEAR}-002`]);
  });

  it('veinte altas concurrentes nunca comparten código', async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_v, i) =>
        auth(request(app).post('/api/customers')).send(naturalBody({ idNumber: String(3000000000 + i) }))
      )
    );
    expect(responses.every((r) => r.status === 201)).toBe(true);
    const codes = new Set(responses.map((r) => r.body.code));
    expect(codes.size).toBe(20);
    expect(codes.has(`PRO-${YEAR}-020`)).toBe(true);
  });
});

describe('POST /api/customers — AC-02 · RN-01 · RN-08: identificación única', () => {
  it('POST dos veces con la misma ident: la segunda responde 409 CUSTOMER_DUPLICATE sin crear nada', async () => {
    const first = await auth(request(app).post('/api/customers')).send(naturalBody());
    expect(first.status).toBe(201);

    const second = await auth(request(app).post('/api/customers')).send(
      naturalBody({ firstNames: 'Otro', email: 'otro@example.com' })
    );
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('CUSTOMER_DUPLICATE');
    expect(second.body.message).toBe('Ya existe un cliente con esta identificación.');
    expect(second.body.details).toEqual([
      { field: 'idNumber', message: 'Ya existe un cliente con esta identificación.' },
    ]);
    expect(await CustomerModel.countDocuments()).toBe(1);
  });

  it('RN-08 · dos POST iguales a la vez: uno 201 y otro 409', async () => {
    const [a, b] = await Promise.all([
      auth(request(app).post('/api/customers')).send(naturalBody()),
      auth(request(app).post('/api/customers')).send(naturalBody()),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const conflict = a.status === 409 ? a : b;
    expect(conflict.body.code).toBe('CUSTOMER_DUPLICATE');
    expect(await CustomerModel.countDocuments()).toBe(1);
  });
});

describe('POST /api/customers — AC-03 · RN-02: formato de la identificación', () => {
  it('RUC de 12 dígitos → 400 con su mensaje literal', async () => {
    const res = await auth(request(app).post('/api/customers')).send(legalBody({ idNumber: '179001234500' }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(messagesOf(res)['idNumber']).toBe('El RUC debe tener 13 dígitos y terminar en 001.');
  });

  it('RUC de 13 dígitos que no termina en 001 → 400', async () => {
    const res = await auth(request(app).post('/api/customers')).send(legalBody({ idNumber: '1790012345002' }));
    expect(res.status).toBe(400);
    expect(messagesOf(res)['idNumber']).toBe('El RUC debe tener 13 dígitos y terminar en 001.');
  });

  it('cédula de 9 dígitos → 400 con su mensaje literal', async () => {
    const res = await auth(request(app).post('/api/customers')).send(naturalBody({ idNumber: '010203040' }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(messagesOf(res)['idNumber']).toBe('La cédula debe tener 10 dígitos.');
  });

  it('pasaporte de 4 caracteres o con símbolos → 400 «Número no válido.»', async () => {
    for (const idNumber of ['AB12', 'AB-12345']) {
      const res = await auth(request(app).post('/api/customers')).send(naturalBody({ idType: 'passport', idNumber }));
      expect(res.status).toBe(400);
      expect(messagesOf(res)['idNumber']).toBe('Número no válido.');
    }
  });

  it('idType ausente o fuera de cedula | ruc | passport → 400', async () => {
    const missing = await auth(request(app).post('/api/customers')).send(naturalBody({ idType: undefined }));
    expect(missing.status).toBe(400);
    expect(messagesOf(missing)).toHaveProperty('idType');

    const other = await auth(request(app).post('/api/customers')).send(naturalBody({ idType: 'dni' }));
    expect(other.status).toBe(400);
    expect(messagesOf(other)).toHaveProperty('idType');
  });

  it('idNumber ausente con un idType desconocido → 400 «Número no válido.»', async () => {
    const res = await auth(request(app).post('/api/customers')).send(naturalBody({ idType: 'dni', idNumber: undefined }));
    expect(res.status).toBe(400);
    expect(messagesOf(res)['idNumber']).toBe('Número no válido.');
  });
});

describe('POST /api/customers — AC-03 · RN-03: nombre, correo y canal', () => {
  it('jurídica sin nombre, con correo inválido y sin canal → 400 con el mensaje de cada campo', async () => {
    const res = await auth(request(app).post('/api/customers')).send(
      legalBody({ legalName: undefined, email: 'no-es-un-correo', sourceChannel: undefined })
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(typeof res.body.message).toBe('string');
    expect(messagesOf(res)).toEqual({
      legalName: 'Completa el nombre.',
      email: 'Ingresa un correo válido.',
      sourceChannel: 'Selecciona el canal de origen.',
    });
    expect(await CustomerModel.countDocuments()).toBe(0);
  });

  it('natural sin nombres ni apellidos → 400 «Completa el nombre.» en cada uno', async () => {
    const res = await auth(request(app).post('/api/customers')).send(
      naturalBody({ firstNames: '  ', lastNames: undefined })
    );
    expect(res.status).toBe(400);
    expect(messagesOf(res)).toEqual({
      firstNames: 'Completa el nombre.',
      lastNames: 'Completa el nombre.',
    });
  });

  it('sin correo → 400 «Ingresa un correo válido.»', async () => {
    const res = await auth(request(app).post('/api/customers')).send(naturalBody({ email: undefined }));
    expect(res.status).toBe(400);
    expect(messagesOf(res)['email']).toBe('Ingresa un correo válido.');
  });

  it('correo del contacto principal inválido → 400 «Ingresa un correo válido.»', async () => {
    const res = await auth(request(app).post('/api/customers')).send(legalBody({ contactEmail: 'luis@' }));
    expect(res.status).toBe(400);
    expect(messagesOf(res)).toEqual({ contactEmail: 'Ingresa un correo válido.' });
  });

  it('personType ausente o distinto de legal | natural → 400', async () => {
    const missing = await auth(request(app).post('/api/customers')).send(naturalBody({ personType: undefined }));
    expect(missing.status).toBe(400);
    expect(messagesOf(missing)).toHaveProperty('personType');

    const other = await auth(request(app).post('/api/customers')).send(naturalBody({ personType: 'empresa' }));
    expect(other.status).toBe(400);
    expect(messagesOf(other)).toHaveProperty('personType');
  });

  it('un texto opcional que no es texto → 400 en ese campo', async () => {
    const res = await auth(request(app).post('/api/customers')).send(naturalBody({ city: 42, legalName: 7 }));
    expect(res.status).toBe(400);
    expect(Object.keys(messagesOf(res)).sort()).toEqual(['city', 'legalName']);
  });

  it('cuerpo vacío → 400 con todos los obligatorios', async () => {
    const res = await auth(request(app).post('/api/customers')).send({});
    expect(res.status).toBe(400);
    expect(Object.keys(messagesOf(res)).sort()).toEqual(
      ['email', 'idNumber', 'idType', 'personType', 'sourceChannel'].sort()
    );
  });
});

describe('POST /api/customers — RN-09: el ejecutivo debe existir y estar activo', () => {
  it('POST con un ejecutivo inexistente → 400 «Selecciona un ejecutivo válido.»', async () => {
    const res = await auth(request(app).post('/api/customers')).send(
      naturalBody({ accountExecutiveId: new mongoose.Types.ObjectId().toString() })
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(messagesOf(res)).toEqual({ accountExecutiveId: 'Selecciona un ejecutivo válido.' });
    expect(await CustomerModel.countDocuments()).toBe(0);
  });

  it('POST con un ejecutivo inactivo → 400', async () => {
    const inactive = await seedExecutive('Pedro Inactivo', false);
    const res = await auth(request(app).post('/api/customers')).send(naturalBody({ accountExecutiveId: inactive }));
    expect(res.status).toBe(400);
    expect(messagesOf(res)['accountExecutiveId']).toBe('Selecciona un ejecutivo válido.');
  });

  it('POST con un accountExecutiveId que no es un id → 400', async () => {
    const res = await auth(request(app).post('/api/customers')).send(naturalBody({ accountExecutiveId: 'abc' }));
    expect(res.status).toBe(400);
    expect(messagesOf(res)['accountExecutiveId']).toBe('Selecciona un ejecutivo válido.');
  });

  it('un 400 del ejecutivo no consume número de la secuencia', async () => {
    await auth(request(app).post('/api/customers')).send(
      naturalBody({ accountExecutiveId: new mongoose.Types.ObjectId().toString() })
    );
    const ok = await auth(request(app).post('/api/customers')).send(naturalBody());
    expect(ok.body.code).toBe(`PRO-${YEAR}-001`);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/customers
// ────────────────────────────────────────────────────────────────────────────

describe('GET /api/customers — AC-05 · RN-07: listado paginado', () => {
  it('200 · sin clientes: {items: [], total: 0, page: 1, pageSize: 20}', async () => {
    const res = await auth(request(app).get('/api/customers'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('200 · ordenado por fecha de creación descendente', async () => {
    for (const idNumber of ['0000000001', '0000000002', '0000000003']) {
      await auth(request(app).post('/api/customers')).send(naturalBody({ idNumber }));
      await new Promise((r) => setTimeout(r, 5));
    }
    const res = await auth(request(app).get('/api/customers'));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items.map((c: { idNumber: string }) => c.idNumber)).toEqual([
      '0000000003',
      '0000000002',
      '0000000001',
    ]);
  });

  it('200 · dos clientes del mismo instante salen en orden de id (descendente)', async () => {
    const sameInstant = new Date('2026-05-01T10:00:00.000Z');
    const lowId = new mongoose.Types.ObjectId('650000000000000000000001');
    const highId = new mongoose.Types.ObjectId('650000000000000000000002');
    const base = {
      personType: 'natural',
      idType: 'cedula',
      firstNames: 'X',
      lastNames: 'Y',
      email: 'x@example.com',
      sourceChannel: 'web',
      createdAt: sameInstant,
      updatedAt: sameInstant,
    };
    await CustomerModel.collection.insertMany([
      { ...base, _id: lowId, code: 'PRO-2026-901', idNumber: '0900000001' },
      { ...base, _id: highId, code: 'PRO-2026-902', idNumber: '0900000002' },
    ]);
    const res = await auth(request(app).get('/api/customers'));
    expect(res.status).toBe(200);
    expect(res.body.items.map((c: { id: string }) => c.id)).toEqual([highId.toString(), lowId.toString()]);
  });

  it('200 · page y pageSize recortan la página y total cuenta todos', async () => {
    for (const idNumber of ['0000000011', '0000000012', '0000000013']) {
      await auth(request(app).post('/api/customers')).send(naturalBody({ idNumber }));
      await new Promise((r) => setTimeout(r, 5));
    }
    const res = await auth(request(app).get('/api/customers?page=2&pageSize=2'));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(2);
    expect(res.body.pageSize).toBe(2);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].idNumber).toBe('0000000011');
  });

  it.each([
    ['pageSize=101', 'pageSize'],
    ['pageSize=0', 'pageSize'],
    ['pageSize=abc', 'pageSize'],
    ['page=0', 'page'],
    ['page=1.5', 'page'],
    ['page=-1', 'page'],
  ])('400 · %s → VALIDATION_ERROR en %s', async (query, field) => {
    const res = await auth(request(app).get(`/api/customers?${query}`));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toEqual([expect.objectContaining({ field })]);
  });

  it('200 · pageSize=100 es el máximo admitido', async () => {
    const res = await auth(request(app).get('/api/customers?pageSize=100'));
    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(100);
  });

  it('200 · openOpportunities y openValue cuentan y suman solo las oportunidades abiertas', async () => {
    const created = await auth(request(app).post('/api/customers')).send(naturalBody());
    const customerId = new mongoose.Types.ObjectId(created.body.id as string);
    await opportunities().insertMany([
      { customerId, status: 'open', value: 1500.5 },
      { customerId, status: 'open', value: 499.5 },
      { customerId, status: 'won', value: 9999 },
      { customerId: new mongoose.Types.ObjectId(), status: 'open', value: 7 },
    ]);
    const res = await auth(request(app).get('/api/customers'));
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ openOpportunities: 2, openValue: 2000 });
  });

  it('R4-ARQ-4 · sin ejecutivo ni oportunidades: accountExecutive vacío y 0/0', async () => {
    await auth(request(app).post('/api/customers')).send(naturalBody());
    const res = await auth(request(app).get('/api/customers'));
    expect(res.body.items[0]).toMatchObject({ accountExecutive: '', openOpportunities: 0, openValue: 0 });
  });

  it('R4-ARQ-4 · un fallo de la base hace fallar la petición entera: 500 {code, message}', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(CustomerModel, 'aggregate').mockImplementationOnce(
      (() => Promise.reject(new Error('base caída'))) as never
    );
    const res = await auth(request(app).get('/api/customers'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Error interno del servidor', details: [] });
  });

  it('R4-ARQ-3 · el $lookup de oportunidades usa el índice {customerId, status} de opportunities', async () => {
    // El índice es de la colección opportunities (otro work item): aquí se crea solo en la base de la prueba
    await opportunities().createIndex({ customerId: 1, status: 1 });
    const created = await auth(request(app).post('/api/customers')).send(naturalBody());
    await opportunities().insertOne({
      customerId: new mongoose.Types.ObjectId(created.body.id as string),
      status: 'open',
      value: 10,
    });
    const plan = await CustomerModel.aggregate(listCustomersPipeline(1, 20)).explain('executionStats');
    expect(JSON.stringify(plan)).toContain('customerId_1_status_1');
  });

  it('el listado resuelve el nombre del ejecutivo asignado', async () => {
    const executiveId = await seedExecutive('Marta Ruiz');
    await auth(request(app).post('/api/customers')).send(naturalBody({ accountExecutiveId: executiveId }));
    const res = await auth(request(app).get('/api/customers'));
    expect(res.body.items[0]).toMatchObject({ accountExecutiveId: executiveId, accountExecutive: 'Marta Ruiz' });
  });
});

describe('GET /api/customers — RN-10: el cliente conserva a su ejecutivo aunque se desactive', () => {
  it('desactivar un ejecutivo no cambia el accountExecutive de sus clientes', async () => {
    const executiveId = await seedExecutive('Marta Ruiz');
    const created = await auth(request(app).post('/api/customers')).send(naturalBody({ accountExecutiveId: executiveId }));
    expect(created.status).toBe(201);

    const before = await auth(request(app).get('/api/customers'));
    await executives().updateOne({ _id: new mongoose.Types.ObjectId(executiveId) }, { $set: { active: false } });
    const after = await auth(request(app).get('/api/customers'));

    expect(before.body.items[0].accountExecutive).toBe('Marta Ruiz');
    expect(after.body.items[0].accountExecutive).toBe('Marta Ruiz');
    expect(after.body.items[0].accountExecutiveId).toBe(executiveId);

    const detail = await auth(request(app).get(`/api/customers/${created.body.id}`));
    expect(detail.body.accountExecutive).toBe('Marta Ruiz');
  });
});

describe('GET /api/customers — R4-REND-1: p95 bajo 300 ms con 50 peticiones concurrentes', () => {
  it('50 GET concurrentes del listado con p95 < 300 ms', async () => {
    const executiveId = await seedExecutive('Marta Ruiz');
    await CustomerModel.insertMany(
      Array.from({ length: 60 }, (_v, i) => ({
        code: `PRO-2026-${String(i + 1).padStart(3, '0')}`,
        personType: 'natural',
        idType: 'cedula',
        idNumber: String(4000000000 + i),
        firstNames: 'N',
        lastNames: 'A',
        email: `n${i}@example.com`,
        sourceChannel: 'web',
        accountExecutiveId: new mongoose.Types.ObjectId(executiveId),
      }))
    );
    // Calentamiento: la primera petición compila rutas y abre conexiones
    await auth(request(app).get('/api/customers'));

    const durations = await Promise.all(
      Array.from({ length: 50 }, async () => {
        const start = Date.now();
        const res = await auth(request(app).get('/api/customers'));
        expect(res.status).toBe(200);
        return Date.now() - start;
      })
    );
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
    expect(p95).toBeLessThan(300);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/customers/:id
// ────────────────────────────────────────────────────────────────────────────

describe('GET /api/customers/:id — AC-06: ficha del cliente', () => {
  it('200 · devuelve el cliente completo con id, code y createdAt', async () => {
    const created = await auth(request(app).post('/api/customers')).send(legalBody());
    const res = await auth(request(app).get(`/api/customers/${created.body.id}`));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: created.body.id,
      code: created.body.code,
      personType: 'legal',
      idType: 'ruc',
      idNumber: '1790012345001',
      legalName: 'Comercial Andina S.A.',
      email: 'contacto@andina.example.com',
      sourceChannel: 'web',
      contactEmail: 'luis.torres@andina.example.com',
      createdAt: created.body.createdAt,
    });
    expect(res.body).not.toHaveProperty('_id');
  });

  it('404 · un id que no existe → CUSTOMER_NOT_FOUND', async () => {
    const res = await auth(request(app).get(`/api/customers/${new mongoose.Types.ObjectId().toString()}`));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CUSTOMER_NOT_FOUND');
    expect(res.body.message).toBe('No existe un cliente con ese id');
    expect(res.body.details).toEqual([]);
  });

  it('404 · un id que no es un ObjectId → CUSTOMER_NOT_FOUND', async () => {
    const res = await auth(request(app).get('/api/customers/no-es-un-id'));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CUSTOMER_NOT_FOUND');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/customers/:id
// ────────────────────────────────────────────────────────────────────────────

describe('PUT /api/customers/:id — AC-04: edición de un cliente', () => {
  it('200 · actualiza contacto y datos comerciales y devuelve el cliente completo', async () => {
    const created = await auth(request(app).post('/api/customers')).send(naturalBody());
    const executiveId = await seedExecutive('Marta Ruiz');

    const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'ana.nueva@example.com',
      mobilePhone: '0987654321',
      city: 'Guayaquil',
      address: 'Malecón 2000',
      sourceChannel: 'feria',
      accountExecutiveId: executiveId,
      notes: 'Cambió de ciudad',
      firstNames: 'Ana',
      lastNames: 'Pérez',
      contactName: 'Juan',
      contactTitle: 'Asistente',
      contactEmail: 'juan@example.com',
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: created.body.id,
      code: created.body.code,
      createdAt: created.body.createdAt,
      email: 'ana.nueva@example.com',
      mobilePhone: '0987654321',
      city: 'Guayaquil',
      address: 'Malecón 2000',
      sourceChannel: 'feria',
      accountExecutiveId: executiveId,
      notes: 'Cambió de ciudad',
      firstNames: 'Ana',
      lastNames: 'Pérez',
      contactName: 'Juan',
      contactTitle: 'Asistente',
      contactEmail: 'juan@example.com',
    });

    const stored = await CustomerModel.findById(created.body.id).lean();
    expect(stored?.city).toBe('Guayaquil');
  });

  it('RN-05 · PUT con ident o tipo distintos los ignora y responde 200 con los de siempre', async () => {
    const created = await auth(request(app).post('/api/customers')).send(naturalBody());
    const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'ana.perez@example.com',
      idType: 'ruc',
      idNumber: '1790012345001',
      personType: 'legal',
      code: 'PRO-1999-999',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      personType: 'natural',
      idType: 'cedula',
      idNumber: '0102030405',
      code: created.body.code,
    });
    const stored = await CustomerModel.findById(created.body.id).lean();
    expect(stored).toMatchObject({ personType: 'natural', idType: 'cedula', idNumber: '0102030405' });
  });

  it('RN-05 · a una persona natural no se le guarda razón social, ni nombres a una jurídica', async () => {
    const natural = await auth(request(app).post('/api/customers')).send(naturalBody());
    const resNatural = await auth(request(app).put(`/api/customers/${natural.body.id}`)).send({
      email: 'ana.perez@example.com',
      legalName: 'No aplica S.A.',
    });
    expect(resNatural.status).toBe(200);
    expect(resNatural.body).not.toHaveProperty('legalName');

    const legal = await auth(request(app).post('/api/customers')).send(legalBody());
    const resLegal = await auth(request(app).put(`/api/customers/${legal.body.id}`)).send({
      email: 'contacto@andina.example.com',
      legalName: 'Comercial Andina Cía. Ltda.',
      firstNames: 'No aplica',
    });
    expect(resLegal.status).toBe(200);
    expect(resLegal.body.legalName).toBe('Comercial Andina Cía. Ltda.');
    expect(resLegal.body).not.toHaveProperty('firstNames');
  });

  it('200 · enviar accountExecutiveId vacío quita el ejecutivo asignado', async () => {
    const executiveId = await seedExecutive('Marta Ruiz');
    const created = await auth(request(app).post('/api/customers')).send(naturalBody({ accountExecutiveId: executiveId }));
    const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'ana.perez@example.com',
      accountExecutiveId: '',
    });
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('accountExecutiveId');
  });

  it('404 · un cliente que no existe → CUSTOMER_NOT_FOUND', async () => {
    const res = await auth(request(app).put(`/api/customers/${new mongoose.Types.ObjectId().toString()}`)).send({
      email: 'a@example.com',
    });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('404 · un id que no es un ObjectId → CUSTOMER_NOT_FOUND', async () => {
    const res = await auth(request(app).put('/api/customers/xyz')).send({ email: 'a@example.com' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('400 · sin correo o con correo inválido → «Ingresa un correo válido.»', async () => {
    const created = await auth(request(app).post('/api/customers')).send(naturalBody());
    for (const body of [{}, { email: 'mal' }]) {
      const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(messagesOf(res)['email']).toBe('Ingresa un correo válido.');
    }
  });

  it('400 · RN-03 en la edición: canal vacío, contacto inválido y razón social vacía', async () => {
    const created = await auth(request(app).post('/api/customers')).send(legalBody());
    const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'contacto@andina.example.com',
      sourceChannel: '',
      contactEmail: 'x@',
    });
    expect(res.status).toBe(400);
    expect(messagesOf(res)).toEqual({
      sourceChannel: 'Selecciona el canal de origen.',
      contactEmail: 'Ingresa un correo válido.',
    });

    const emptyName = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'contacto@andina.example.com',
      legalName: '   ',
    });
    expect(emptyName.status).toBe(400);
    expect(messagesOf(emptyName)).toEqual({ legalName: 'Completa el nombre.' });
  });

  it('400 · RN-03 en la edición de una natural: apellidos vacíos', async () => {
    const created = await auth(request(app).post('/api/customers')).send(naturalBody());
    const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'ana.perez@example.com',
      lastNames: '',
      firstNames: 3,
    });
    expect(res.status).toBe(400);
    expect(messagesOf(res)).toEqual({ firstNames: 'Valor no válido.' });

    const res2 = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'ana.perez@example.com',
      lastNames: '',
    });
    expect(res2.status).toBe(400);
    expect(messagesOf(res2)).toEqual({ lastNames: 'Completa el nombre.' });
  });

  it('RN-09 · PUT con un ejecutivo inactivo → 400 «Selecciona un ejecutivo válido.»', async () => {
    const created = await auth(request(app).post('/api/customers')).send(naturalBody());
    const inactive = await seedExecutive('Pedro Inactivo', false);
    const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'ana.perez@example.com',
      accountExecutiveId: inactive,
    });
    expect(res.status).toBe(400);
    expect(messagesOf(res)).toEqual({ accountExecutiveId: 'Selecciona un ejecutivo válido.' });
  });
});
