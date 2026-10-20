/**
 * Tests de contrato e integración — /api/customers (WI-H2-API-CLIENTES-001)
 * Ronda 3, contra la spec v6 (pack v7).
 * AC-01..AC-07 · RN-01, RN-02, RN-03, RN-05, RN-06, RN-07, RN-08, RN-09, RN-10, RN-11, RN-12, RN-13, RN-AUTH
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
import { OrderModel } from '../models/order';
import { CustomerService, listCustomersPipeline } from '../services/CustomerService';
import { CustomerController } from '../controllers/CustomerController';
import { swaggerSpec } from '../config/swagger';

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

describe('R4-SEG-3 · R4-SEG-4 — la forma de los errores', () => {
  it('los errores de /api/customers viajan como {code, message, details}', async () => {
    const unauthorized = await request(app).get('/api/customers');
    expect(Object.keys(unauthorized.body).sort()).toEqual(['code', 'details', 'message']);

    const notFound = await auth(request(app).get(`/api/customers/${new mongoose.Types.ObjectId().toString()}`));
    expect(Object.keys(notFound.body).sort()).toEqual(['code', 'details', 'message']);
  });

  it('los errores de /api/orders conservan la forma de su propio contrato (sin details)', async () => {
    const unauthorized = await request(app).get('/api/orders');
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body).toEqual({ code: 'UNAUTHORIZED', message: expect.any(String) });

    const notFound = await auth(request(app).get(`/api/orders/${new mongoose.Types.ObjectId().toString()}`));
    expect(notFound.status).toBe(404);
    expect(notFound.body).not.toHaveProperty('details');
  });

  it('un 500 de /api/orders sigue siendo {code, message}', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(OrderModel, 'countDocuments').mockImplementationOnce(
      (() => Promise.reject(new Error('base caída'))) as never
    );
    const res = await auth(request(app).get('/api/orders'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
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
    // El 201 es {id, code, ...los datos enviados, createdAt}: no lleva updatedAt
    expect(res.body).not.toHaveProperty('updatedAt');

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

  it('R4-OBS-2 · registra el evento customer_created con su code y nunca el correo ni el teléfono', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const res = await auth(request(app).post('/api/customers')).send(naturalBody());
    expect(res.status).toBe(201);

    const lines = logSpy.mock.calls.map((c) => String(c[0]));
    const event = lines.map((l) => JSON.parse(l)).find((e) => e.event === 'customer_created');
    expect(event).toEqual({ event: 'customer_created', code: res.body.code });

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

describe('RN-11 — el correo se guarda y se devuelve en minúsculas y sin espacios', () => {
  it('POST con «Ana@X.com» responde 201 con email «ana@x.com»', async () => {
    const res = await auth(request(app).post('/api/customers')).send(naturalBody({ email: 'Ana@X.com' }));
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('ana@x.com');
  });

  it('POST con «Ana@X.com » y un contactEmail en mayúsculas: los guarda normalizados', async () => {
    const res = await auth(request(app).post('/api/customers')).send(
      legalBody({ email: ' Ana@X.com ', contactEmail: 'Luis.Torres@Andina.Example.COM' })
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'ana@x.com', contactEmail: 'luis.torres@andina.example.com' });
    const stored = await CustomerModel.findById(res.body.id).lean();
    expect(stored).toMatchObject({ email: 'ana@x.com', contactEmail: 'luis.torres@andina.example.com' });
  });

  it('PUT también normaliza email y contactEmail', async () => {
    const created = await auth(request(app).post('/api/customers')).send(naturalBody());
    const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'NUEVA@Example.com ',
      contactEmail: ' Juan@Example.COM',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: 'nueva@example.com', contactEmail: 'juan@example.com' });
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

  it('idType ausente → «Tipo de identificación es obligatorio.»; fuera de cedula | ruc | passport → «El valor de Tipo de identificación no es válido.»', async () => {
    const missing = await auth(request(app).post('/api/customers')).send(naturalBody({ idType: undefined }));
    expect(missing.status).toBe(400);
    expect(messagesOf(missing)).toEqual({ idType: 'Tipo de identificación es obligatorio.' });

    const other = await auth(request(app).post('/api/customers')).send(naturalBody({ idType: 'dni' }));
    expect(other.status).toBe(400);
    expect(messagesOf(other)).toEqual({ idType: 'El valor de Tipo de identificación no es válido.' });
  });

  it('idNumber ausente con un idType desconocido → los dos campos con su mensaje', async () => {
    const res = await auth(request(app).post('/api/customers')).send(naturalBody({ idType: 'dni', idNumber: undefined }));
    expect(res.status).toBe(400);
    expect(messagesOf(res)).toEqual({
      idType: 'El valor de Tipo de identificación no es válido.',
      idNumber: 'Número de identificación es obligatorio.',
    });
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

  it('correo inválido → 400 «Ingresa un correo válido.»', async () => {
    const res = await auth(request(app).post('/api/customers')).send(naturalBody({ email: 'ana@' }));
    expect(res.status).toBe(400);
    expect(messagesOf(res)).toEqual({ email: 'Ingresa un correo válido.' });
  });

  it('natural sin apellidos → 400 «Completa el nombre.»', async () => {
    const res = await auth(request(app).post('/api/customers')).send(naturalBody({ lastNames: undefined }));
    expect(res.status).toBe(400);
    expect(messagesOf(res)).toEqual({ lastNames: 'Completa el nombre.' });
  });

  it('sin canal de origen → 400 «Selecciona el canal de origen.»', async () => {
    const res = await auth(request(app).post('/api/customers')).send(naturalBody({ sourceChannel: '' }));
    expect(res.status).toBe(400);
    expect(messagesOf(res)).toEqual({ sourceChannel: 'Selecciona el canal de origen.' });
  });

  it('correo del contacto principal inválido → 400 «Ingresa un correo válido.»', async () => {
    const res = await auth(request(app).post('/api/customers')).send(legalBody({ contactEmail: 'luis@' }));
    expect(res.status).toBe(400);
    expect(messagesOf(res)).toEqual({ contactEmail: 'Ingresa un correo válido.' });
  });

  it('un campo con un tipo que no es el suyo → 400 «El valor de <etiqueta> no es válido.»', async () => {
    const res = await auth(request(app).post('/api/customers')).send(
      naturalBody({ city: 42, legalName: 7, mobilePhone: true, accountExecutiveId: 12, contactEmail: 5 })
    );
    expect(res.status).toBe(400);
    expect(messagesOf(res)).toEqual({
      city: 'El valor de Ciudad no es válido.',
      legalName: 'El valor de Razón social no es válido.',
      mobilePhone: 'El valor de Teléfono celular no es válido.',
      accountExecutiveId: 'El valor de Ejecutivo asignado no es válido.',
      contactEmail: 'El valor de Correo no es válido.',
    });
  });

  it('obligatorios con un tipo que no es el suyo → 400 «El valor de <etiqueta> no es válido.»', async () => {
    const res = await auth(request(app).post('/api/customers')).send(
      naturalBody({ idNumber: 102030405, email: 7, sourceChannel: 3, firstNames: ['Ana'] })
    );
    expect(res.status).toBe(400);
    expect(messagesOf(res)).toEqual({
      idNumber: 'El valor de Número de identificación no es válido.',
      email: 'El valor de Correo electrónico no es válido.',
      sourceChannel: 'El valor de Canal de origen no es válido.',
      firstNames: 'El valor de Nombres no es válido.',
    });
  });
});

describe('POST /api/customers — AC-03 · RN-12: los obligatorios del alta dicen lo mismo que la pantalla', () => {
  it('POST sin personType, idType, idNumber ni email: 400 con details de cada uno y su mensaje literal', async () => {
    const res = await auth(request(app).post('/api/customers')).send(
      naturalBody({ personType: undefined, idType: undefined, idNumber: undefined, email: undefined })
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(messagesOf(res)).toEqual({
      personType: 'Tipo de persona es obligatorio.',
      idType: 'Tipo de identificación es obligatorio.',
      idNumber: 'Número de identificación es obligatorio.',
      email: 'Correo electrónico es obligatorio.',
    });
  });

  it.each([
    ['personType', 'Tipo de persona es obligatorio.'],
    ['idType', 'Tipo de identificación es obligatorio.'],
    ['idNumber', 'Número de identificación es obligatorio.'],
    ['email', 'Correo electrónico es obligatorio.'],
  ])('POST sin %s → 400 «%s»', async (field, message) => {
    const res = await auth(request(app).post('/api/customers')).send(naturalBody({ [field]: undefined }));
    expect(res.status).toBe(400);
    expect(messagesOf(res)[field]).toBe(message);
  });

  it('un obligatorio en blanco o null cuenta como ausente', async () => {
    const res = await auth(request(app).post('/api/customers')).send(naturalBody({ email: '   ', idNumber: null }));
    expect(res.status).toBe(400);
    expect(messagesOf(res)).toEqual({
      email: 'Correo electrónico es obligatorio.',
      idNumber: 'Número de identificación es obligatorio.',
    });
  });

  it('personType=«otra» → 400 «El valor de Tipo de persona no es válido.»', async () => {
    const res = await auth(request(app).post('/api/customers')).send(naturalBody({ personType: 'otra' }));
    expect(res.status).toBe(400);
    expect(messagesOf(res)).toEqual({ personType: 'El valor de Tipo de persona no es válido.' });
  });

  it('cuerpo vacío → 400 con todos los obligatorios y su mensaje literal', async () => {
    const res = await auth(request(app).post('/api/customers')).send({});
    expect(res.status).toBe(400);
    expect(messagesOf(res)).toEqual({
      personType: 'Tipo de persona es obligatorio.',
      idType: 'Tipo de identificación es obligatorio.',
      idNumber: 'Número de identificación es obligatorio.',
      email: 'Correo electrónico es obligatorio.',
      sourceChannel: 'Selecciona el canal de origen.',
    });
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

  it('POST con un accountExecutiveId que no es un ObjectId → 400 «Selecciona un ejecutivo válido.»', async () => {
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
    ['pageSize=101', 'pageSize', 'El tamaño de página no es válido.'],
    ['pageSize=0', 'pageSize', 'El tamaño de página no es válido.'],
    ['pageSize=abc', 'pageSize', 'El tamaño de página no es válido.'],
    ['page=100001', 'page', 'La página no es válida.'],
    ['page=0', 'page', 'La página no es válida.'],
    ['page=1.5', 'page', 'La página no es válida.'],
    ['page=-1', 'page', 'La página no es válida.'],
    ['page=1&page=2', 'page', 'La página no es válida.'],
  ])('400 · %s → VALIDATION_ERROR en %s con «%s»', async (query, field, message) => {
    const res = await auth(request(app).get(`/api/customers?${query}`));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toEqual([{ field, message }]);
  });

  it('400 · los dos fuera de rango → un detalle por campo', async () => {
    const res = await auth(request(app).get('/api/customers?page=100001&pageSize=101'));
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([
      { field: 'page', message: 'La página no es válida.' },
      { field: 'pageSize', message: 'El tamaño de página no es válido.' },
    ]);
  });

  it('200 · pageSize=100 y page=100000 son los máximos admitidos', async () => {
    const res = await auth(request(app).get('/api/customers?pageSize=100&page=100000'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], pageSize: 100, page: 100000 });
  });

  it('200 · cada fila trae solo los campos del contrato: id, name, idNumber, city, primaryContact, accountExecutive, openOpportunities, openValue', async () => {
    const executiveId = await seedExecutive('Marta Ruiz');
    const legal = await auth(request(app).post('/api/customers')).send(legalBody({ city: 'Cuenca', accountExecutiveId: executiveId }));
    await new Promise((r) => setTimeout(r, 5));
    const natural = await auth(request(app).post('/api/customers')).send(naturalBody());

    const res = await auth(request(app).get('/api/customers'));
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      {
        id: natural.body.id,
        name: 'Ana María Pérez Gómez',
        idNumber: '0102030405',
        city: 'Quito',
        accountExecutive: '',
        openOpportunities: 0,
        openValue: 0,
      },
      {
        id: legal.body.id,
        name: 'Comercial Andina S.A.',
        idNumber: '1790012345001',
        city: 'Cuenca',
        primaryContact: 'Luis Torres',
        accountExecutive: 'Marta Ruiz',
        openOpportunities: 0,
        openValue: 0,
      },
    ]);
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

  it('200 · openValue se redondea a 2 decimales', async () => {
    const created = await auth(request(app).post('/api/customers')).send(naturalBody());
    const customerId = new mongoose.Types.ObjectId(created.body.id as string);
    await opportunities().insertMany([
      { customerId, status: 'open', value: 0.1 },
      { customerId, status: 'open', value: 0.2 },
      { customerId, status: 'open', value: 10.005 },
    ]);
    const res = await auth(request(app).get('/api/customers'));
    expect(res.body.items[0]).toMatchObject({ openOpportunities: 3, openValue: 10.31 });
  });

  it('R4-ARQ-4 · sin ejecutivo ni oportunidades: accountExecutive vacío y 0/0', async () => {
    await auth(request(app).post('/api/customers')).send(naturalBody());
    const res = await auth(request(app).get('/api/customers'));
    expect(res.body.items[0]).toMatchObject({ accountExecutive: '', openOpportunities: 0, openValue: 0 });
  });

  it('R4-ARQ-4 · un fallo de la base hace fallar la petición entera: 500 {code, message, details}', async () => {
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
    expect(res.body.items[0]).toMatchObject({ accountExecutive: 'Marta Ruiz' });
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

    const detail = await auth(request(app).get(`/api/customers/${created.body.id}`));
    expect(detail.body.accountExecutive).toBe('Marta Ruiz');
  });
});

describe('R4-REND-1 — las consultas usan sus índices (la medición del p95 va en npm run evidence)', () => {
  it('el listado ordena con el índice {createdAt: -1, _id: -1}, sin ordenar en memoria', async () => {
    await auth(request(app).post('/api/customers')).send(naturalBody());
    const plan = await CustomerModel.aggregate(listCustomersPipeline(1, 20)).explain('queryPlanner');
    const text = JSON.stringify(plan);
    expect(text).toContain('createdAt_-1__id_-1');
    expect(text).toContain('IXSCAN');
    expect(text).not.toContain('"stage":"SORT"');
  });

  it('la unicidad de la identificación se comprueba con el índice único de idNumber', async () => {
    const plan = await CustomerModel.find({ idNumber: '0102030405' }).limit(1).explain('queryPlanner');
    const text = JSON.stringify(plan);
    expect(text).toContain('idNumber_1');
    expect(text).not.toContain('COLLSCAN');
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
      accountExecutive: '',
      createdAt: created.body.createdAt,
    });
    expect(typeof res.body.updatedAt).toBe('string');
    expect(res.body).not.toHaveProperty('_id');
  });

  it('200 · la ficha trae el nombre de su ejecutivo (accountExecutive)', async () => {
    const executiveId = await seedExecutive('Marta Ruiz');
    const created = await auth(request(app).post('/api/customers')).send(legalBody({ accountExecutiveId: executiveId }));
    const res = await auth(request(app).get(`/api/customers/${created.body.id}`));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ accountExecutiveId: executiveId, accountExecutive: 'Marta Ruiz' });
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

    expect(typeof res.body.updatedAt).toBe('string');

    const stored = await CustomerModel.findById(created.body.id).lean();
    expect(stored?.city).toBe('Guayaquil');
  });

  it('RN-03 · PUT sin canal: 200 y conserva el canal guardado', async () => {
    const created = await auth(request(app).post('/api/customers')).send(naturalBody());
    const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'ana.perez@example.com',
      city: 'Loja',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sourceChannel: 'referido', city: 'Loja' });
  });

  it('RN-03 · PUT de una natural con firstNames vacío: 400 «Completa el nombre.»', async () => {
    const created = await auth(request(app).post('/api/customers')).send(naturalBody());
    const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'ana.perez@example.com',
      firstNames: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(messagesOf(res)).toEqual({ firstNames: 'Completa el nombre.' });
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

  it('400 · sin correo → «Correo electrónico es obligatorio.»; inválido → «Ingresa un correo válido.»', async () => {
    const created = await auth(request(app).post('/api/customers')).send(naturalBody());
    const cases: Array<[Record<string, unknown>, string]> = [
      [{}, 'Correo electrónico es obligatorio.'],
      [{ email: 'mal' }, 'Ingresa un correo válido.'],
      [{ email: 42 }, 'El valor de Correo electrónico no es válido.'],
    ];
    for (const [body, message] of cases) {
      const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(messagesOf(res)).toEqual({ email: message });
    }
  });

  it('400 · el canal, si viene, no puede ir vacío ni ser otra cosa que texto', async () => {
    const created = await auth(request(app).post('/api/customers')).send(naturalBody());
    for (const [sourceChannel, message] of [
      [null, 'Selecciona el canal de origen.'],
      [7, 'El valor de Canal de origen no es válido.'],
    ] as const) {
      const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
        email: 'ana.perez@example.com',
        sourceChannel,
      });
      expect(res.status).toBe(400);
      expect(messagesOf(res)).toEqual({ sourceChannel: message });
    }
  });

  it('200 · un contactEmail vacío quita el correo del contacto', async () => {
    const created = await auth(request(app).post('/api/customers')).send(legalBody());
    const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'contacto@andina.example.com',
      contactEmail: '',
    });
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('contactEmail');
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
    expect(messagesOf(res)).toEqual({ firstNames: 'El valor de Nombres no es válido.' });

    const res2 = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'ana.perez@example.com',
      lastNames: '',
    });
    expect(res2.status).toBe(400);
    expect(messagesOf(res2)).toEqual({ lastNames: 'Completa el nombre.' });
  });

  it('RN-09 · PUT de un cliente cuyo ejecutivo se desactivó, reenviando ese mismo ejecutivo: 200', async () => {
    const executiveId = await seedExecutive('Marta Ruiz');
    const created = await auth(request(app).post('/api/customers')).send(naturalBody({ accountExecutiveId: executiveId }));
    expect(created.status).toBe(201);
    await executives().updateOne({ _id: new mongoose.Types.ObjectId(executiveId) }, { $set: { active: false } });

    const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'ana.perez@example.com',
      accountExecutiveId: executiveId.toUpperCase(),
      city: 'Ambato',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ accountExecutiveId: executiveId, city: 'Ambato' });

    const detail = await auth(request(app).get(`/api/customers/${created.body.id}`));
    expect(detail.body.accountExecutive).toBe('Marta Ruiz');
  });

  it('RN-09 · PUT que cambia a otro ejecutivo inexistente → 400', async () => {
    const executiveId = await seedExecutive('Marta Ruiz');
    const created = await auth(request(app).post('/api/customers')).send(naturalBody({ accountExecutiveId: executiveId }));
    const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'ana.perez@example.com',
      accountExecutiveId: new mongoose.Types.ObjectId().toString(),
    });
    expect(res.status).toBe(400);
    expect(messagesOf(res)).toEqual({ accountExecutiveId: 'Selecciona un ejecutivo válido.' });
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

// ────────────────────────────────────────────────────────────────────────────
// Ronda 3 (spec v6): RN-02, RN-06, RN-12, RN-13, R4-ARQ-4, R4-OBS-3 y la forma de los errores
// ────────────────────────────────────────────────────────────────────────────

/** Todo lo que se escribió en la consola, en una sola cadena. */
function consoleText(...spies: jest.SpyInstance[]): string {
  return spies
    .flatMap((spy) => spy.mock.calls)
    .map((call) => call.map((arg: unknown) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '))
    .join('\n');
}

/** Las líneas JSON de un espía de la consola. */
function jsonLines(spy: jest.SpyInstance): Array<Record<string, unknown>> {
  return spy.mock.calls.flatMap((call) => {
    try {
      return [JSON.parse(String(call[0])) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
}

describe('PUT /api/customers/:id — RN-13: campos vacíos en la edición', () => {
  it('PUT con notes «» deja notes vacío (deja de tenerlas)', async () => {
    const created = await auth(request(app).post('/api/customers')).send(naturalBody());
    expect(created.body.notes).toBe('Cliente de prueba');
    const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'ana.perez@example.com',
      notes: '',
    });
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('notes');
    const stored = await CustomerModel.findById(created.body.id).lean();
    expect(stored?.notes).toBeUndefined();
  });

  it('un texto opcional enviado como null o en blanco también se vacía', async () => {
    const created = await auth(request(app).post('/api/customers')).send(naturalBody());
    const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'ana.perez@example.com',
      city: null,
      mobilePhone: '   ',
      address: '',
    });
    expect(res.status).toBe(200);
    for (const field of ['city', 'mobilePhone', 'address']) {
      expect(res.body).not.toHaveProperty(field);
    }
    const detail = await auth(request(app).get(`/api/customers/${created.body.id}`));
    expect(detail.body).not.toHaveProperty('city');
  });

  it('PUT con accountExecutiveId «» o null conserva el ejecutivo, aunque esté inactivo', async () => {
    const executiveId = await seedExecutive('Marta Ruiz');
    const created = await auth(request(app).post('/api/customers')).send(naturalBody({ accountExecutiveId: executiveId }));
    await executives().updateOne({ _id: new mongoose.Types.ObjectId(executiveId) }, { $set: { active: false } });

    for (const accountExecutiveId of ['', null, undefined]) {
      const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
        email: 'ana.perez@example.com',
        accountExecutiveId,
      });
      expect(res.status).toBe(200);
      expect(res.body.accountExecutiveId).toBe(executiveId);
    }
    const detail = await auth(request(app).get(`/api/customers/${created.body.id}`));
    expect(detail.body).toMatchObject({ accountExecutiveId: executiveId, accountExecutive: 'Marta Ruiz' });
  });

  it('PUT sin city no la cambia (ni nada que no se envíe)', async () => {
    const created = await auth(request(app).post('/api/customers')).send(naturalBody());
    const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'ana.perez@example.com',
      notes: 'Nueva nota',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      city: 'Quito',
      mobilePhone: '0991234567',
      address: 'Av. Amazonas N24-03',
      sourceChannel: 'referido',
      firstNames: 'Ana María',
      lastNames: 'Pérez Gómez',
      notes: 'Nueva nota',
    });
  });

  it('un texto opcional con un tipo que no es el suyo → 400 «El valor de Ciudad no es válido.»', async () => {
    const created = await auth(request(app).post('/api/customers')).send(naturalBody());
    const res = await auth(request(app).put(`/api/customers/${created.body.id}`)).send({
      email: 'ana.perez@example.com',
      city: 42,
    });
    expect(res.status).toBe(400);
    expect(messagesOf(res)).toEqual({ city: 'El valor de Ciudad no es válido.' });
  });
});

describe('RN-02 · RN-01 — el número de identificación se guarda sin espacios y en mayúsculas', () => {
  it('POST con «ab 12345 » guarda «AB12345», y después «AB12345» responde 409', async () => {
    const first = await auth(request(app).post('/api/customers')).send(
      naturalBody({ idType: 'passport', idNumber: ' ab 12345 ' })
    );
    expect(first.status).toBe(201);
    expect(first.body.idNumber).toBe('AB12345');
    const stored = await CustomerModel.findById(first.body.id).lean();
    expect(stored?.idNumber).toBe('AB12345');

    const second = await auth(request(app).post('/api/customers')).send(
      naturalBody({ idType: 'passport', idNumber: 'AB12345', email: 'otro@example.com' })
    );
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('CUSTOMER_DUPLICATE');
    expect(await CustomerModel.countDocuments()).toBe(1);
  });

  it('una cédula escrita con espacios se valida y se guarda sin ellos', async () => {
    const res = await auth(request(app).post('/api/customers')).send(naturalBody({ idNumber: '01 0203 0405' }));
    expect(res.status).toBe(201);
    expect(res.body.idNumber).toBe('0102030405');
  });
});

describe('RN-06 — el año del código sale de la fecha de creación guardada, en UTC', () => {
  function appWithClock(instant: Date): Application {
    return createApp(mongoose, { customerController: new CustomerController(new CustomerService(() => instant)) });
  }

  it('el último milisegundo de 2030 en UTC da PRO-2030 y es el createdAt que se guarda', async () => {
    const instant = new Date('2030-12-31T23:59:59.999Z');
    const res = await auth(request(appWithClock(instant)).post('/api/customers')).send(naturalBody());
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('PRO-2030-001');
    expect(res.body.createdAt).toBe(instant.toISOString());
    const stored = await CustomerModel.findById(res.body.id).lean();
    expect(stored?.createdAt.toISOString()).toBe(instant.toISOString());
    expect(await CounterModel.findById('customers-2030').lean()).toMatchObject({ seq: 1 });
  });

  it('un instante que en Ecuador (UTC-5) aún es 2030 pero en UTC ya es 2031 da PRO-2031', async () => {
    const instant = new Date('2031-01-01T03:00:00.000Z');
    const res = await auth(request(appWithClock(instant)).post('/api/customers')).send(naturalBody());
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('PRO-2031-001');
    expect(new Date(res.body.createdAt).getUTCFullYear()).toBe(2031);
  });
});

describe('RN-12 · R4-OBS-3 — un cuerpo que no es un JSON válido', () => {
  const malformed = '{"email":"ana.perez@example.com","mobilePhone":"0991234567",';

  it.each([
    ['POST /api/customers', () => auth(request(app).post('/api/customers'))],
    ['PUT /api/customers/:id', () => auth(request(app).put(`/api/customers/${new mongoose.Types.ObjectId().toString()}`))],
  ])('%s → 400 VALIDATION_ERROR con details vacío, sin registrar el cuerpo', async (_name, build) => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const res = await build().set('Content-Type', 'application/json').send(malformed);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'El cuerpo de la petición no es un JSON válido.',
      details: [],
    });
    expect(await CustomerModel.countDocuments()).toBe(0);
    const logged = consoleText(errorSpy, logSpy);
    expect(logged).not.toContain('ana.perez@example.com');
    expect(logged).not.toContain('0991234567');
    // R4-OBS-1: la petición rechazada también queda en el log por petición
    expect(jsonLines(logSpy).find((line) => 'requestId' in line)).toMatchObject({ status: 400 });
  });

  it('/api/orders conserva la forma de su contrato ({code, message}) y tampoco registra el cuerpo', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const res = await auth(request(app).post('/api/orders')).set('Content-Type', 'application/json').send(malformed);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
    const logged = consoleText(errorSpy, logSpy);
    expect(logged).not.toContain('ana.perez@example.com');
    expect(logged).not.toContain('0991234567');
    const [entry] = jsonLines(errorSpy);
    expect(entry).toMatchObject({ event: 'unexpected_error', error: { name: 'SyntaxError', type: 'entity.parse.failed' } });
    expect(entry['error']).not.toHaveProperty('message');
  });
});

describe('R4-ARQ-4 · R4-OBS-3 — un error no previsto: 500 con details y sin el cuerpo en el log', () => {
  const INTERNAL = { code: 'INTERNAL_ERROR', message: 'Error interno del servidor', details: [] };

  it('POST /api/customers: 500 {code, message, details} y el log no lleva el cuerpo ni el mensaje del error', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(CustomerModel, 'create').mockImplementationOnce((() =>
      Promise.reject(new Error('fallo al guardar ana.perez@example.com 0991234567'))) as never);

    const res = await auth(request(app).post('/api/customers')).send(naturalBody());

    expect(res.status).toBe(500);
    expect(res.body).toEqual(INTERNAL);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [entry] = jsonLines(errorSpy);
    expect(entry).toMatchObject({ level: 'error', event: 'unexpected_error', method: 'POST', path: '/api/customers' });
    expect(typeof entry['requestId']).toBe('string');
    expect((entry['error'] as { name: string; stack: string[] }).name).toBe('Error');
    expect((entry['error'] as { stack: string[] }).stack.length).toBeGreaterThan(0);
    const logged = consoleText(errorSpy, logSpy);
    for (const personal of ['ana.perez@example.com', '0991234567', 'Pérez Gómez', '0102030405']) {
      expect(logged).not.toContain(personal);
    }
  });

  it('GET /api/customers/:id: 500 {code, message, details}', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(CustomerModel, 'aggregate').mockImplementationOnce((() => Promise.reject(new Error('base caída'))) as never);
    const res = await auth(request(app).get(`/api/customers/${new mongoose.Types.ObjectId().toString()}`));
    expect(res.status).toBe(500);
    expect(res.body).toEqual(INTERNAL);
  });

  it('PUT /api/customers/:id: 500 {code, message, details}', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(CustomerModel, 'findById').mockImplementationOnce(() => {
      throw new Error('base caída');
    });
    const res = await auth(request(app).put(`/api/customers/${new mongoose.Types.ObjectId().toString()}`)).send({
      email: 'ana.perez@example.com',
    });
    expect(res.status).toBe(500);
    expect(res.body).toEqual(INTERNAL);
  });

  it('un error que no es un objeto también se registra sin datos', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(CustomerModel, 'aggregate').mockImplementationOnce((() => Promise.reject('texto suelto')) as never);
    const res = await auth(request(app).get('/api/customers'));
    expect(res.status).toBe(500);
    expect(jsonLines(errorSpy)[0]).toMatchObject({ error: { name: 'string', stack: [] } });
    expect(consoleText(errorSpy)).not.toContain('texto suelto');
  });
});

describe('R4-SEG-3 · R4-SEG-4 — un método no declarado bajo /api/customers', () => {
  it('DELETE /api/customers/:id y PATCH /api/customers → 404 con details', async () => {
    const deleted = await auth(request(app).delete(`/api/customers/${new mongoose.Types.ObjectId().toString()}`));
    expect(deleted.status).toBe(404);
    expect(deleted.body).toEqual({ code: 'NOT_FOUND', message: expect.any(String), details: [] });

    const patched = await request(app).patch('/api/customers');
    expect(patched.status).toBe(404);
    expect(patched.body.details).toEqual([]);
  });

  it('fuera de /api/customers el 404 conserva su forma {code, message}', async () => {
    const res = await auth(request(app).delete(`/api/orders/${new mongoose.Types.ObjectId().toString()}`));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 'NOT_FOUND', message: expect.any(String) });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Swagger veraz (observación del revisor de la ronda 1)
// ────────────────────────────────────────────────────────────────────────────

describe('Swagger — /api/customers documentado como lo implementa el código', () => {
  type Schema = {
    description?: string;
    required?: string[];
    allOf?: Schema[];
    oneOf?: Array<{ $ref: string }>;
    properties?: Record<string, Schema>;
  };
  const spec = swaggerSpec as {
    paths: Record<string, Record<string, { description?: string; responses: Record<string, unknown> }>>;
    components: { schemas: Record<string, Schema> };
  };
  const schemas = spec.components.schemas;
  const requiredOf = (name: string): string[] =>
    (schemas[name].allOf ?? [schemas[name]]).flatMap((part) => part.required ?? []);

  it('documenta los cuatro endpoints con sus respuestas, el 500 en todos (R4-ARQ-4)', () => {
    expect(Object.keys(spec.paths['/api/customers']).sort()).toEqual(['get', 'post']);
    expect(Object.keys(spec.paths['/api/customers/{id}']).sort()).toEqual(['get', 'put']);
    expect(Object.keys(spec.paths['/api/customers'].post.responses).sort()).toEqual(['201', '400', '401', '409', '500']);
    expect(Object.keys(spec.paths['/api/customers'].get.responses).sort()).toEqual(['200', '400', '401', '500']);
    expect(Object.keys(spec.paths['/api/customers/{id}'].get.responses).sort()).toEqual(['200', '401', '404', '500']);
    expect(Object.keys(spec.paths['/api/customers/{id}'].put.responses).sort()).toEqual(['200', '400', '401', '404', '500']);
  });

  it('el PUT documenta que los nombres del otro tipo de persona se ignoran y los vacíos de RN-13', () => {
    const update = schemas['UpdateCustomerBody'].description ?? '';
    expect(update).toContain('los nombres del otro tipo de persona se ignoran');
    expect(update).toContain('(RN-13)');
    expect(update).toContain('accountExecutiveId ausente, «» o null conserva el ejecutivo');
    expect(spec.paths['/api/customers/{id}'].put.description).toContain('Los nombres del otro tipo de persona se ignoran');
  });

  it('el 400 documenta los mensajes de RN-12 de la v6', () => {
    const validation = schemas['CustomerValidationError'].description ?? '';
    expect(validation).toContain('«El valor de <etiqueta> no es válido.»');
    expect(validation).toContain('«El cuerpo de la petición no es un JSON válido.» y details vacío');
  });

  it('el alta exige sourceChannel y el nombre según el tipo de persona', () => {
    expect(requiredOf('CreateCustomerCommon')).toEqual(['personType', 'idType', 'idNumber', 'email', 'sourceChannel']);
    expect(schemas['CreateCustomerBody'].oneOf?.map((o) => o.$ref)).toEqual([
      '#/components/schemas/CreateLegalCustomerBody',
      '#/components/schemas/CreateNaturalCustomerBody',
    ]);
    expect(requiredOf('CreateLegalCustomerBody')).toEqual(['legalName']);
    expect(requiredOf('CreateNaturalCustomerBody')).toEqual(['firstNames', 'lastNames']);
    expect(requiredOf('UpdateCustomerBody')).toEqual(['email']);
  });

  it('los esquemas de error de /api/customers llevan details, porque siempre viaja', () => {
    for (const name of [
      'CustomerValidationError',
      'CustomerUnauthorizedError',
      'CustomerNotFoundError',
      'CustomerDuplicateError',
      'CustomerInternalError',
    ]) {
      expect(schemas[name].required).toEqual(['code', 'message', 'details']);
    }
  });

  it('el 201 no documenta updatedAt y la fila del listado solo los campos del contrato', () => {
    expect(Object.keys(schemas['CreatedCustomer'].properties ?? {})).not.toContain('updatedAt');
    expect(Object.keys(schemas['CustomerListItem'].properties ?? {})).toEqual([
      'id',
      'name',
      'idNumber',
      'city',
      'primaryContact',
      'accountExecutive',
      'openOpportunities',
      'openValue',
    ]);
  });
});
