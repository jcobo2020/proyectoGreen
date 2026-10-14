/**
 * Tests de integración y contrato — GET /api/products
 * AC-06, RN-06
 */
import request from 'supertest';
import { Application } from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createApp } from '../app';
import { ProductModel } from '../models/product';

let app: Application;
let replSet: MongoMemoryReplSet;
let jwtSecret: string;
let validToken: string;

// Genera un token válido con sub y exp
function makeToken(secret: string, overrides: Record<string, unknown> = {}): string {
  const payload = {
    sub: 'customer-test-123',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  return jwt.sign(payload, secret, { algorithm: 'HS256', noTimestamp: true });
}

beforeAll(async () => {
  // Generar secreto JWT de forma aleatoria para los tests
  jwtSecret = crypto.randomBytes(32).toString('hex');
  process.env['JWT_SECRET'] = jwtSecret;
  process.env['JWT_SECRET_PREVIOUS'] = '';

  // Arrancar réplica de MongoDB en memoria (necesaria para transacciones)
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replSet.getUri();
  process.env['MONGODB_URI'] = uri;

  await mongoose.connect(uri);
  app = createApp(mongoose);

  validToken = makeToken(jwtSecret);
}, 90000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
}, 30000);

beforeEach(async () => {
  // Limpiar colección entre tests
  await ProductModel.deleteMany({});
});

// ────────────────────────────────────────────────────────────────────────────────
// AC-06 · GET /api/products — caso feliz
// ────────────────────────────────────────────────────────────────────────────────

describe('GET /api/products — AC-06: catálogo de productos activos', () => {
  it('200 · devuelve lista vacía cuando no hay productos activos', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });
  });

  it('200 · devuelve solo productos activos con precio y disponibilidad', async () => {
    await ProductModel.create([
      { sku: 'SKU-A', name: 'Producto A', unitPrice: 10.5, available: 100, active: true },
      { sku: 'SKU-B', name: 'Producto B', unitPrice: 20.0, available: 0, active: true },
      { sku: 'SKU-C', name: 'Producto C', unitPrice: 5.99, available: 50, active: false }, // inactivo
    ]);

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(2);

    // Verifica que el producto inactivo no está
    const skus = res.body.items.map((p: { sku: string }) => p.sku);
    expect(skus).not.toContain('SKU-C');

    // Verifica la forma de PublicProduct
    const productA = res.body.items.find((p: { sku: string }) => p.sku === 'SKU-A');
    expect(productA).toMatchObject({
      sku: 'SKU-A',
      name: 'Producto A',
      unitPrice: 10.5,
      available: 100,
    });
    expect(productA).toHaveProperty('id');
    // No debe exponer campos internos
    expect(productA).not.toHaveProperty('_id');
    expect(productA).not.toHaveProperty('active');
    expect(productA).not.toHaveProperty('__v');
  });

  it('200 · los productos están ordenados por name y después por sku', async () => {
    await ProductModel.create([
      { sku: 'SKU-Z', name: 'Zarza', unitPrice: 1.0, available: 1, active: true },
      { sku: 'SKU-B', name: 'Aloe', unitPrice: 2.0, available: 2, active: true },
      { sku: 'SKU-A', name: 'Aloe', unitPrice: 3.0, available: 3, active: true },
    ]);

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    const names = res.body.items.map((p: { name: string; sku: string }) => ({
      name: p.name,
      sku: p.sku,
    }));
    expect(names).toEqual([
      { name: 'Aloe', sku: 'SKU-A' },
      { name: 'Aloe', sku: 'SKU-B' },
      { name: 'Zarza', sku: 'SKU-Z' },
    ]);
  });

  it('200 · paginación con page y pageSize personalizados', async () => {
    // Crear 5 productos activos
    const products = Array.from({ length: 5 }, (_, i) => ({
      sku: `SKU-${String(i).padStart(3, '0')}`,
      name: `Producto ${String(i).padStart(3, '0')}`,
      unitPrice: (i + 1) * 1.5,
      available: i * 10,
      active: true,
    }));
    await ProductModel.create(products);

    const res = await request(app)
      .get('/api/products?page=2&pageSize=2')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.pageSize).toBe(2);
    expect(res.body.total).toBe(5);
    expect(res.body.items).toHaveLength(2);
  });

  it('200 · unitPrice tiene 2 decimales', async () => {
    await ProductModel.create([
      { sku: 'SKU-DEC', name: 'Producto Decimal', unitPrice: 9.99, available: 10, active: true },
    ]);

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items[0].unitPrice).toBe(9.99);
  });

  it('200 · available es entero ≥ 0', async () => {
    await ProductModel.create([
      { sku: 'SKU-AVAIL', name: 'Producto Disponible', unitPrice: 5.0, available: 0, active: true },
    ]);

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items[0].available).toBe(0);
    expect(Number.isInteger(res.body.items[0].available)).toBe(true);
  });

  it('200 · page y pageSize por defecto son 1 y 50', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(50);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Errores 400 — validación de query
// ────────────────────────────────────────────────────────────────────────────────

describe('GET /api/products — 400 validación de query', () => {
  it('400 · page = 0 (fuera de rango)', async () => {
    const res = await request(app)
      .get('/api/products?page=0')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('details');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.some((d: { field: string }) => d.field === 'page')).toBe(true);
  });

  it('400 · page = -1 (negativo)', async () => {
    const res = await request(app)
      .get('/api/products?page=-1')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · page no entero (decimal)', async () => {
    const res = await request(app)
      .get('/api/products?page=1.5')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · page no numérico (texto)', async () => {
    const res = await request(app)
      .get('/api/products?page=abc')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · pageSize = 0 (fuera de rango)', async () => {
    const res = await request(app)
      .get('/api/products?pageSize=0')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details.some((d: { field: string }) => d.field === 'pageSize')).toBe(true);
  });

  it('400 · pageSize = 101 (excede máximo)', async () => {
    const res = await request(app)
      .get('/api/products?pageSize=101')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · pageSize no entero (decimal)', async () => {
    const res = await request(app)
      .get('/api/products?pageSize=10.5')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · pageSize no numérico', async () => {
    const res = await request(app)
      .get('/api/products?pageSize=xyz')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · ambos parámetros inválidos incluye details de los dos campos', async () => {
    const res = await request(app)
      .get('/api/products?page=0&pageSize=200')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details.some((d: { field: string }) => d.field === 'page')).toBe(true);
    expect(res.body.details.some((d: { field: string }) => d.field === 'pageSize')).toBe(true);
  });

  it('400 · parámetro de query desconocido', async () => {
    const res = await request(app)
      .get('/api/products?unknownParam=foo')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body).toHaveProperty('message');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.some((d: { field: string }) => d.field === 'unknownParam')).toBe(true);
  });

  it('400 · parámetro desconocido junto a page válido sigue siendo 400', async () => {
    const res = await request(app)
      .get('/api/products?page=1&extra=bar')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details.some((d: { field: string }) => d.field === 'extra')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// RN-06 · Errores 401 — autenticación
// ────────────────────────────────────────────────────────────────────────────────

describe('GET /api/products — RN-06: 401 sin token válido', () => {
  it('401 · sin cabecera Authorization', async () => {
    const res = await request(app).get('/api/products');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body).toHaveProperty('message');
  });

  it('401 · cabecera Authorization sin Bearer', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Token ${validToken}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('401 · token con firma inválida', async () => {
    const otherSecret = crypto.randomBytes(32).toString('hex');
    const badToken = makeToken(otherSecret);

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${badToken}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('401 · token caducado', async () => {
    const expiredToken = jwt.sign(
      { sub: 'customer-123', exp: Math.floor(Date.now() / 1000) - 3700 },
      jwtSecret,
      { algorithm: 'HS256', noTimestamp: true }
    );

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('401 · token sin claim sub', async () => {
    const tokenWithoutSub = jwt.sign(
      { exp: Math.floor(Date.now() / 1000) + 3600, customField: 'value' },
      jwtSecret,
      { algorithm: 'HS256', noTimestamp: true }
    );

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${tokenWithoutSub}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('401 · token sin claim exp', async () => {
    // Firmar sin exp — jsonwebtoken requiere noTimestamp para no añadir iat
    const tokenWithoutExp = jwt.sign(
      { sub: 'customer-123' },
      jwtSecret,
      { algorithm: 'HS256', noTimestamp: true }
    );

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${tokenWithoutExp}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('401 · sub vacío da 401', async () => {
    const tokenEmptySub = jwt.sign(
      { sub: '', exp: Math.floor(Date.now() / 1000) + 3600 },
      jwtSecret,
      { algorithm: 'HS256', noTimestamp: true }
    );

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${tokenEmptySub}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('401 · token con algoritmo none rechazado', async () => {
    // Construir manualmente un token con alg: none
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'customer-123', exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64url');
    const noneToken = `${header}.${payload}.`;

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${noneToken}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('401 · rotación: token firmado con secreto anterior es aceptado', async () => {
    const prevSecret = crypto.randomBytes(32).toString('hex');
    const tokenWithPrevSecret = makeToken(prevSecret);

    // El middleware lee JWT_SECRET_PREVIOUS de process.env en cada petición
    process.env['JWT_SECRET_PREVIOUS'] = prevSecret;

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${tokenWithPrevSecret}`);

    // Restaurar
    process.env['JWT_SECRET_PREVIOUS'] = '';

    expect(res.status).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// WI-ORD-API-010 · Tests de contrato explícitos — GET /api/products
// Confirman los códigos de estado declarados en §2 del contrato
// ────────────────────────────────────────────────────────────────────────────────

describe('GET /api/products — contrato de códigos de estado (WI-ORD-API-010)', () => {
  it('afirma 200 cuando la petición es válida y el token es correcto', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('pageSize');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('afirma 401 cuando no hay cabecera Authorization', async () => {
    const res = await request(app).get('/api/products');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body).toHaveProperty('message');
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Tests unitarios de ProductService
// ────────────────────────────────────────────────────────────────────────────────

describe('ProductService — unitarios', () => {
  it('listActive filtra solo productos activos', async () => {
    await ProductModel.create([
      { sku: 'UNIT-A', name: 'Activo A', unitPrice: 1.0, available: 10, active: true },
      { sku: 'UNIT-B', name: 'Inactivo B', unitPrice: 2.0, available: 5, active: false },
    ]);

    const { ProductService: PS } = await import('../services/ProductService');
    const service = new PS();
    const result = await service.listActive({ page: 1, pageSize: 50 });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.sku).toBe('UNIT-A');
  });

  it('listActive ordena por name y sku', async () => {
    await ProductModel.create([
      { sku: 'Z-SKU', name: 'Beta', unitPrice: 1.0, available: 1, active: true },
      { sku: 'A-SKU', name: 'Alpha', unitPrice: 2.0, available: 2, active: true },
      { sku: 'B-SKU', name: 'Alpha', unitPrice: 3.0, available: 3, active: true },
    ]);

    const { ProductService: PS } = await import('../services/ProductService');
    const service = new PS();
    const result = await service.listActive({ page: 1, pageSize: 50 });

    expect(result.items[0]!.sku).toBe('A-SKU');
    expect(result.items[1]!.sku).toBe('B-SKU');
    expect(result.items[2]!.sku).toBe('Z-SKU');
  });

  it('listActive pagina correctamente', async () => {
    await ProductModel.create([
      { sku: 'P-001', name: 'Prod 001', unitPrice: 1.0, available: 1, active: true },
      { sku: 'P-002', name: 'Prod 002', unitPrice: 2.0, available: 2, active: true },
      { sku: 'P-003', name: 'Prod 003', unitPrice: 3.0, available: 3, active: true },
    ]);

    const { ProductService: PS } = await import('../services/ProductService');
    const service = new PS();
    const result = await service.listActive({ page: 2, pageSize: 2 });

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(2);
  });

  it('toPublicProduct proyecta correctamente sin exponer campos internos', async () => {
    const { toPublicProduct } = await import('../services/ProductService');
    const doc = await ProductModel.create({
      sku: 'TPUB-001',
      name: 'Test Public',
      unitPrice: 12.345,
      available: 7,
      active: true,
    });

    const pub = toPublicProduct(doc as unknown as Parameters<typeof toPublicProduct>[0]);
    expect(pub).toHaveProperty('id');
    expect(typeof pub.id).toBe('string');
    expect(pub.sku).toBe('TPUB-001');
    expect(pub.name).toBe('Test Public');
    // 2 decimales: 12.345 → 12.35 (redondeo)
    expect(pub.unitPrice).toBe(12.35);
    expect(pub.available).toBe(7);
    expect(pub).not.toHaveProperty('_id');
    expect(pub).not.toHaveProperty('active');
  });
});
