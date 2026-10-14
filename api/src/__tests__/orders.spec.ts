/**
 * Tests de integración y contrato — /api/orders
 * AC-01, AC-02, AC-03, AC-04, AC-05, AC-07, AC-08
 * RN-01, RN-02, RN-03, RN-04, RN-05, RN-06
 */
import request from 'supertest';
import { Application } from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createApp } from '../app';
import { ProductModel } from '../models/product';
import { OrderModel } from '../models/order';
import { OrderController } from '../controllers/OrderController';
import { OrderService } from '../services/OrderService';
import { ProductService } from '../services/ProductService';
import { MongoUnitOfWork } from '../lib/MongoUnitOfWork';
import { IOrderRepository, OrderData } from '../lib/ports';
import { InternalError } from '../lib/errors';

let app: Application;
let replSet: MongoMemoryReplSet;
let jwtSecret: string;

// IDs de clientes de prueba
const CUSTOMER_A = 'customer-A-test';
const CUSTOMER_B = 'customer-B-test';

function makeToken(secret: string, sub: string = CUSTOMER_A, overrides: Record<string, unknown> = {}): string {
  const payload = {
    sub,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  return jwt.sign(payload, secret, { algorithm: 'HS256', noTimestamp: true });
}

let tokenA: string;
let tokenB: string;

beforeAll(async () => {
  jwtSecret = crypto.randomBytes(32).toString('hex');
  process.env['JWT_SECRET'] = jwtSecret;
  process.env['JWT_SECRET_PREVIOUS'] = '';

  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uri = replSet.getUri();
  process.env['MONGODB_URI'] = uri;

  await mongoose.connect(uri);

  // Sincronizar índices
  await ProductModel.syncIndexes();
  await OrderModel.syncIndexes();

  app = createApp(mongoose);

  tokenA = makeToken(jwtSecret, CUSTOMER_A);
  tokenB = makeToken(jwtSecret, CUSTOMER_B);
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
}, 30000);

beforeEach(async () => {
  await ProductModel.deleteMany({});
  await OrderModel.deleteMany({});
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createProduct(overrides: Partial<{
  sku: string; name: string; unitPrice: number; available: number; active: boolean;
}> = {}) {
  return ProductModel.create({
    sku: `SKU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    name: 'Producto de prueba',
    unitPrice: 10.00,
    available: 100,
    active: true,
    ...overrides,
  });
}

async function createOrderViaApi(token: string, items: Array<{ productId: string; quantity: number }>) {
  return request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ items });
}

// ─────────────────────────────────────────────────────────────────────────────
// RN-06 / AC-07 · 401 sin token válido
// ─────────────────────────────────────────────────────────────────────────────

describe('RN-06 · AC-07 · 401 sin token válido en todos los endpoints', () => {
  it('POST /api/orders sin token → 401 UNAUTHORIZED', async () => {
    const res = await request(app).post('/api/orders').send({ items: [] });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/orders sin token → 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/orders/:id sin token → 401 UNAUTHORIZED', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/orders/${fakeId}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/orders/:id/confirm sin token → 401 UNAUTHORIZED', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).post(`/api/orders/${fakeId}/confirm`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/orders con token sin sub → 401 UNAUTHORIZED', async () => {
    const badToken = jwt.sign(
      { exp: Math.floor(Date.now() / 1000) + 3600 },
      jwtSecret,
      { algorithm: 'HS256', noTimestamp: true }
    );
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${badToken}`)
      .send({ items: [] });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/orders con token sin exp → 401 UNAUTHORIZED', async () => {
    const badToken = jwt.sign(
      { sub: CUSTOMER_A },
      jwtSecret,
      { algorithm: 'HS256', noTimestamp: true }
    );
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${badToken}`)
      .send({ items: [] });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-01 · POST /api/orders — caso feliz
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-01 · POST /api/orders — crear pedido válido', () => {
  it('201 · crea pedido en estado pending_confirmation con código y total correctos', async () => {
    const prod = await createProduct({ unitPrice: 15.00, available: 50 });

    const res = await createOrderViaApi(tokenA, [
      { productId: prod._id.toString(), quantity: 3 },
    ]);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending_confirmation');
    expect(res.body.code).toMatch(/^ORD-\d{8}-[0-9A-Z]{6}$/);
    expect(res.body.total).toBe(45.00);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].productId).toBe(prod._id.toString());
    expect(res.body.items[0].sku).toBe(prod.sku);
    expect(res.body.items[0].name).toBe(prod.name);
    expect(res.body.items[0].unitPrice).toBe(15.00);
    expect(res.body.items[0].quantity).toBe(3);
    expect(res.body.items[0].lineTotal).toBe(45.00);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('createdAt');
    expect(res.body).toHaveProperty('updatedAt');
    expect(res.body).not.toHaveProperty('confirmedAt');
  });

  it('201 · con múltiples productos calcula el total correcto', async () => {
    const prod1 = await createProduct({ unitPrice: 10.00, available: 50 });
    const prod2 = await createProduct({ unitPrice: 5.50, available: 50 });

    const res = await createOrderViaApi(tokenA, [
      { productId: prod1._id.toString(), quantity: 2 },
      { productId: prod2._id.toString(), quantity: 4 },
    ]);

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(42.00); // 20 + 22
    expect(res.body.items).toHaveLength(2);
  });

  it('201 · no reserva stock al crear (disponible no cambia)', async () => {
    const prod = await createProduct({ unitPrice: 10.00, available: 10 });

    await createOrderViaApi(tokenA, [
      { productId: prod._id.toString(), quantity: 5 },
    ]);

    const updated = await ProductModel.findById(prod._id);
    expect(updated!.available).toBe(10); // sin cambio
  });

  it('201 · el customerId del pedido es el sub del token', async () => {
    const prod = await createProduct({ available: 10 });
    const res = await createOrderViaApi(tokenA, [
      { productId: prod._id.toString(), quantity: 1 },
    ]);
    expect(res.status).toBe(201);

    const order = await OrderModel.findById(res.body.id);
    expect(order!.customerId).toBe(CUSTOMER_A);
  });

  it('500 · POST /api/orders fuerza 500 cuando la capa de repositorio falla inesperadamente', async () => {
    // El repositorio real falla: el servicio real propaga el error hasta el errorHandler → 500
    const brokenRepo: IOrderRepository = {
      create: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      listByCustomer: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      findById: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      findByIdInTx: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      confirmInTx: jest.fn().mockRejectedValue(new Error('DB connection lost')),
    };

    const productService = new ProductService();
    const unitOfWork = new MongoUnitOfWork();
    const brokenService = new OrderService(productService, unitOfWork, brokenRepo);
    const brokenApp = createApp(mongoose, {
      orderController: new OrderController(brokenService),
    });

    const prod = await createProduct({ available: 10 });
    const res = await request(brokenApp)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items: [{ productId: prod._id.toString(), quantity: 1 }] });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(res.body).not.toHaveProperty('stack');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RN-05 · Precios los calcula el servidor
// ─────────────────────────────────────────────────────────────────────────────

describe('RN-05 · Los precios los calcula el servidor', () => {
  it('400 · body con campo price es rechazado con VALIDATION_ERROR', async () => {
    const prod = await createProduct({ available: 10 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        items: [{ productId: prod._id.toString(), quantity: 1 }],
        price: 99.99, // campo no permitido en body
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · item con campo price es rechazado con VALIDATION_ERROR', async () => {
    const prod = await createProduct({ available: 10 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        items: [{ productId: prod._id.toString(), quantity: 1, price: 99.99 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · item con campo total es rechazado con VALIDATION_ERROR', async () => {
    const prod = await createProduct({ available: 10 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        items: [{ productId: prod._id.toString(), quantity: 1, total: 10.00 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('total es la suma de unitPrice por cantidad (con precio del catálogo)', async () => {
    const prod = await createProduct({ unitPrice: 7.50, available: 50 });

    const res = await createOrderViaApi(tokenA, [
      { productId: prod._id.toString(), quantity: 4 },
    ]);

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(30.00); // 7.50 × 4
    expect(res.body.items[0].unitPrice).toBe(7.50);
    expect(res.body.items[0].lineTotal).toBe(30.00);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-08 · Validación de entrada
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-08 · POST /api/orders — validación de entrada', () => {
  it('400 · items vacío → VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items: [] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('400 · sin items → VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · más de 50 líneas → VALIDATION_ERROR', async () => {
    const items = Array.from({ length: 51 }, () => ({
      productId: new mongoose.Types.ObjectId().toString(),
      quantity: 1,
    }));

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · quantity = 0 → VALIDATION_ERROR', async () => {
    const prod = await createProduct();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items: [{ productId: prod._id.toString(), quantity: 0 }] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details.some((d: { field: string }) => d.field.includes('quantity'))).toBe(true);
  });

  it('400 · quantity = 100 → VALIDATION_ERROR', async () => {
    const prod = await createProduct();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items: [{ productId: prod._id.toString(), quantity: 100 }] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · productId no ObjectId válido → VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items: [{ productId: 'not-an-objectid', quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · productId duplicado → VALIDATION_ERROR', async () => {
    const prod = await createProduct({ available: 50 });
    const id = prod._id.toString();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items: [
        { productId: id, quantity: 1 },
        { productId: id, quantity: 2 },
      ] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · quantity decimal → VALIDATION_ERROR', async () => {
    const prod = await createProduct();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items: [{ productId: prod._id.toString(), quantity: 1.5 }] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · múltiples campos inválidos → un elemento de details por campo', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items: [
        { productId: 'bad-id', quantity: 0 },
      ] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details.length).toBeGreaterThanOrEqual(2);
  });

  it('400 · items:[null] → VALIDATION_ERROR (no 500)', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items: [null] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · parámetro de query desconocido en POST /api/orders → VALIDATION_ERROR', async () => {
    const prod = await createProduct({ available: 10 });
    const res = await request(app)
      .post('/api/orders?foo=bar')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items: [{ productId: prod._id.toString(), quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RN-03 · Stock al crear (comprobación bloqueante pero sin reservar)
// ─────────────────────────────────────────────────────────────────────────────

describe('RN-03 · Crear con cantidad mayor que la disponible → 409', () => {
  it('409 · cantidad pedida > disponible → INSUFFICIENT_STOCK con details', async () => {
    const prod = await createProduct({ available: 5 });

    const res = await createOrderViaApi(tokenA, [
      { productId: prod._id.toString(), quantity: 10 },
    ]);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details[0].productId).toBe(prod._id.toString());
    expect(res.body.details[0].requested).toBe(10);
    expect(res.body.details[0].available).toBe(5);
  });

  it('404 · productId inexistente → PRODUCT_NOT_FOUND', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await createOrderViaApi(tokenA, [
      { productId: fakeId, quantity: 1 },
    ]);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details[0].productId).toBe(fakeId);
  });

  it('404 · producto inactivo → PRODUCT_NOT_FOUND', async () => {
    const prod = await createProduct({ active: false });

    const res = await createOrderViaApi(tokenA, [
      { productId: prod._id.toString(), quantity: 1 },
    ]);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-05 / RN-01 · GET /api/orders — listado del cliente
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-05 · RN-01 · GET /api/orders — listado del cliente', () => {
  it('200 · devuelve solo los pedidos del cliente autenticado', async () => {
    const prod = await createProduct({ available: 50 });

    // Crear pedidos para dos clientes distintos
    await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 1 }]);
    await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 2 }]);
    await createOrderViaApi(tokenB, [{ productId: prod._id.toString(), quantity: 3 }]);

    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(2);
    // Todos deben ser de CUSTOMER_A
    for (const order of res.body.items) {
      // No expone customerId en la respuesta pública, pero el DB sí lo tiene
      expect(order).toHaveProperty('id');
      expect(order).toHaveProperty('status');
    }
  });

  it('200 · ordenados del más reciente al más antiguo', async () => {
    const prod = await createProduct({ available: 50 });

    const r1 = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 1 }]);
    const r2 = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 2 }]);

    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    // El más reciente primero
    expect(res.body.items[0].id).toBe(r2.body.id);
    expect(res.body.items[1].id).toBe(r1.body.id);
  });

  it('200 · lista vacía si no hay pedidos', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it('200 · paginación page y pageSize', async () => {
    const prod = await createProduct({ available: 50 });

    for (let i = 0; i < 5; i++) {
      await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 1 }]);
    }

    const res = await request(app)
      .get('/api/orders?page=2&pageSize=2')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.pageSize).toBe(2);
    expect(res.body.total).toBe(5);
    expect(res.body.items).toHaveLength(2);
  });

  it('200 · page y pageSize por defecto (1 y 20)', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(20);
  });

  it('400 · page fuera de rango → VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/orders?page=0')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · pageSize fuera de rango (> 50) → VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/orders?pageSize=51')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · parámetro de query desconocido → VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/orders?foo=bar')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('RN-01 · confirmar actualiza el estado en el listado', async () => {
    const prod = await createProduct({ available: 10 });
    const createRes = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 1 }]);
    const orderId = createRes.body.id;

    // Confirmar
    await request(app)
      .post(`/api/orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`);

    // Verificar que el listado refleja el nuevo estado
    const listRes = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(listRes.status).toBe(200);
    const order = listRes.body.items.find((o: { id: string }) => o.id === orderId);
    expect(order.status).toBe('confirmed');
  });

  it('500 · GET /api/orders fuerza 500 cuando la capa de repositorio falla inesperadamente', async () => {
    const brokenRepo: IOrderRepository = {
      create: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      listByCustomer: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      findById: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      findByIdInTx: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      confirmInTx: jest.fn().mockRejectedValue(new Error('DB connection lost')),
    };

    const productService = new ProductService();
    const unitOfWork = new MongoUnitOfWork();
    const brokenService = new OrderService(productService, unitOfWork, brokenRepo);
    const brokenApp = createApp(mongoose, {
      orderController: new OrderController(brokenService),
    });

    const res = await request(brokenApp)
      .get('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(res.body).not.toHaveProperty('stack');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-02 · GET /api/orders/:id — detalle
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-02 · GET /api/orders/:id — detalle', () => {
  it('200 · devuelve el pedido del cliente autenticado', async () => {
    const prod = await createProduct({ unitPrice: 20.00, available: 10 });
    const createRes = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 2 }]);
    const orderId = createRes.body.id;

    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orderId);
    expect(res.body.status).toBe('pending_confirmation');
    expect(res.body.total).toBe(40.00);
  });

  it('400 · id no ObjectId válido → INVALID_ORDER_ID', async () => {
    const res = await request(app)
      .get('/api/orders/not-valid-id')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ORDER_ID');
  });

  it('400 · parámetro de query desconocido → VALIDATION_ERROR', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .get(`/api/orders/${fakeId}?foo=bar`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('404 · pedido inexistente → ORDER_NOT_FOUND', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .get(`/api/orders/${fakeId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ORDER_NOT_FOUND');
  });

  it('RN-02 · 403 · pedido de otro cliente → ORDER_FORBIDDEN', async () => {
    const prod = await createProduct({ available: 10 });
    const createRes = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 1 }]);
    const orderId = createRes.body.id;

    // CUSTOMER_B intenta ver el pedido de CUSTOMER_A
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORDER_FORBIDDEN');
  });

  it('RN-01 · confirmar actualiza el estado en el detalle', async () => {
    const prod = await createProduct({ available: 10 });
    const createRes = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 1 }]);
    const orderId = createRes.body.id;

    // Confirmar
    await request(app)
      .post(`/api/orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`);

    // Verificar que el detalle refleja el nuevo estado
    const detailRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.status).toBe('confirmed');
    expect(detailRes.body).toHaveProperty('confirmedAt');
  });

  it('500 · GET /api/orders/:id fuerza 500 cuando la capa de repositorio falla inesperadamente', async () => {
    const brokenRepo: IOrderRepository = {
      create: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      listByCustomer: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      findById: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      findByIdInTx: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      confirmInTx: jest.fn().mockRejectedValue(new Error('DB connection lost')),
    };

    const productService = new ProductService();
    const unitOfWork = new MongoUnitOfWork();
    const brokenService = new OrderService(productService, unitOfWork, brokenRepo);
    const brokenApp = createApp(mongoose, {
      orderController: new OrderController(brokenService),
    });

    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(brokenApp)
      .get(`/api/orders/${fakeId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(res.body).not.toHaveProperty('stack');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-03 / AC-04 · POST /api/orders/:id/confirm
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-03 · POST /api/orders/:id/confirm — confirmar pedido', () => {
  it('200 · confirma el pedido y descuenta el stock', async () => {
    const prod = await createProduct({ unitPrice: 10.00, available: 20 });
    const createRes = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 5 }]);
    const orderId = createRes.body.id;

    const res = await request(app)
      .post(`/api/orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
    expect(res.body).toHaveProperty('confirmedAt');
    expect(res.body.id).toBe(orderId);

    // Verificar que el stock se descontó
    const updatedProd = await ProductModel.findById(prod._id);
    expect(updatedProd!.available).toBe(15); // 20 - 5
  });

  it('400 · id no ObjectId válido → INVALID_ORDER_ID', async () => {
    const res = await request(app)
      .post('/api/orders/not-valid-id/confirm')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ORDER_ID');
  });

  it('400 · parámetro de query desconocido → VALIDATION_ERROR', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .post(`/api/orders/${fakeId}/confirm?foo=bar`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('404 · pedido inexistente → ORDER_NOT_FOUND', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .post(`/api/orders/${fakeId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ORDER_NOT_FOUND');
  });

  it('RN-02 · 403 · pedido de otro cliente → ORDER_FORBIDDEN', async () => {
    const prod = await createProduct({ available: 10 });
    const createRes = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 1 }]);
    const orderId = createRes.body.id;

    const res = await request(app)
      .post(`/api/orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORDER_FORBIDDEN');
  });

  it('409 · stock insuficiente al confirmar → INSUFFICIENT_STOCK', async () => {
    const prod = await createProduct({ available: 5 });
    // Crear pedido (disponible = 5, pedimos 5 → pasa la comprobación al crear)
    const createRes = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 5 }]);
    const orderId = createRes.body.id;

    // Reducir el stock manualmente a 2 (simulando otra operación)
    await ProductModel.findByIdAndUpdate(prod._id, { available: 2 });

    const res = await request(app)
      .post(`/api/orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details[0].productId).toBe(prod._id.toString());
    expect(res.body.details[0].requested).toBe(5);
    expect(res.body.details[0].available).toBe(2);

    // El pedido sigue pending_confirmation
    const order = await OrderModel.findById(orderId);
    expect(order!.status).toBe('pending_confirmation');
  });

  it('El cuerpo enviado al confirmar se ignora', async () => {
    const prod = await createProduct({ available: 10 });
    const createRes = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 1 }]);
    const orderId = createRes.body.id;

    const res = await request(app)
      .post(`/api/orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'cancelled', total: 999 }); // body ignorado

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
  });

  it('500 · POST /api/orders/:id/confirm fuerza 500 cuando la capa de repositorio falla inesperadamente', async () => {
    const brokenRepo: IOrderRepository = {
      create: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      listByCustomer: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      findById: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      findByIdInTx: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      confirmInTx: jest.fn().mockRejectedValue(new Error('DB connection lost')),
    };

    const productService = new ProductService();
    const unitOfWork = new MongoUnitOfWork();
    const brokenService = new OrderService(productService, unitOfWork, brokenRepo);
    const brokenApp = createApp(mongoose, {
      orderController: new OrderController(brokenService),
    });

    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(brokenApp)
      .post(`/api/orders/${fakeId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(res.body).not.toHaveProperty('stack');
  });

  it('evento stock_insufficient se emite cuando el stock no alcanza al confirmar', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const prod = await createProduct({ available: 5 });
      const createRes = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 5 }]);
      const orderId = createRes.body.id;

      // Reducir stock a 2 para que la confirmación falle
      await ProductModel.findByIdAndUpdate(prod._id, { available: 2 });

      const res = await request(app)
        .post(`/api/orders/${orderId}/confirm`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(409);

      // Verificar que el evento stock_insufficient fue emitido
      const loggedEvents = consoleSpy.mock.calls
        .map((call) => {
          try { return JSON.parse(call[0] as string); } catch { return null; }
        })
        .filter(Boolean);

      const stockInsuffEvent = loggedEvents.find(
        (e: { event?: string }) => e.event === 'stock_insufficient'
      );
      expect(stockInsuffEvent).toBeDefined();
      expect(stockInsuffEvent.orderId).toBe(orderId);
      expect(stockInsuffEvent.customerId).toBe(CUSTOMER_A);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-04 · Idempotencia al confirmar
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-04 · Idempotencia al confirmar un pedido ya confirmado', () => {
  it('200 · confirmar un pedido ya confirmado devuelve 200 sin descontar de nuevo', async () => {
    const prod = await createProduct({ available: 10 });
    const createRes = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 3 }]);
    const orderId = createRes.body.id;

    // Primera confirmación
    const res1 = await request(app)
      .post(`/api/orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res1.status).toBe(200);
    expect(res1.body.status).toBe('confirmed');

    // Verificar stock después de la primera confirmación
    const afterFirst = await ProductModel.findById(prod._id);
    expect(afterFirst!.available).toBe(7); // 10 - 3

    // Segunda confirmación (idempotente)
    const res2 = await request(app)
      .post(`/api/orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res2.status).toBe(200);
    expect(res2.body.status).toBe('confirmed');
    expect(res2.body.id).toBe(orderId);

    // El stock NO debe haber vuelto a bajar
    const afterSecond = await ProductModel.findById(prod._id);
    expect(afterSecond!.available).toBe(7); // sin cambio
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RN-04 · Concurrencia
// ─────────────────────────────────────────────────────────────────────────────

describe('RN-04 · Concurrencia — confirmaciones simultáneas', () => {
  it('dos confirmaciones simultáneas del MISMO pedido → ambas 200 con un solo descuento', async () => {
    const prod = await createProduct({ available: 10 });
    const createRes = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 3 }]);
    const orderId = createRes.body.id;

    // Lanzar las dos confirmaciones en paralelo
    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/orders/${orderId}/confirm`)
        .set('Authorization', `Bearer ${tokenA}`),
      request(app)
        .post(`/api/orders/${orderId}/confirm`)
        .set('Authorization', `Bearer ${tokenA}`),
    ]);

    // Ambas deben ser 200
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.status).toBe('confirmed');
    expect(res2.body.status).toBe('confirmed');

    // El stock solo debe haber bajado una vez
    const finalProd = await ProductModel.findById(prod._id);
    expect(finalProd!.available).toBe(7); // 10 - 3 (una sola vez)
  });

  it('dos confirmaciones simultáneas de pedidos DISTINTOS sobre el último stock → una 200 y una 409', async () => {
    const prod = await createProduct({ available: 3 }); // stock justo para UN pedido de 3

    // Crear dos pedidos distintos del mismo cliente (ambos piden 3 unidades)
    const cr1 = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 3 }]);
    const cr2 = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 3 }]);
    const orderId1 = cr1.body.id;
    const orderId2 = cr2.body.id;

    // Lanzar confirmaciones en paralelo
    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/orders/${orderId1}/confirm`)
        .set('Authorization', `Bearer ${tokenA}`),
      request(app)
        .post(`/api/orders/${orderId2}/confirm`)
        .set('Authorization', `Bearer ${tokenA}`),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // Una debe ser 200, la otra 409
    expect(statuses).toEqual([200, 409]);

    // El stock disponible debe ser 0
    const finalProd = await ProductModel.findById(prod._id);
    expect(finalProd!.available).toBe(0);

    // El pedido que recibió 409 sigue en pending_confirmation
    const loser = res1.status === 409 ? orderId1 : orderId2;
    const loserOrder = await OrderModel.findById(loser);
    expect(loserOrder!.status).toBe('pending_confirmation');
  });

  it('carrera crear→confirmar: otra confirmación agota el stock antes → 409', async () => {
    const prod = await createProduct({ available: 3 });

    // Crear el primer pedido (va a confirmarse con éxito)
    const cr1 = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 3 }]);

    // Crear el segundo pedido
    const cr2 = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 3 }]);

    // Confirmar el primero (agota el stock)
    const r1 = await request(app)
      .post(`/api/orders/${cr1.body.id}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(r1.status).toBe(200);

    // Ahora el stock está en 0 → el segundo pedido no puede confirmarse
    const r2 = await request(app)
      .post(`/api/orders/${cr2.body.id}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(r2.status).toBe(409);
    expect(r2.body.code).toBe('INSUFFICIENT_STOCK');
    expect(r2.body.details[0].available).toBe(0);

    const loserOrder = await OrderModel.findById(cr2.body.id);
    expect(loserOrder!.status).toBe('pending_confirmation');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E11000 · Colisión de código — reintentos y 500 al cuarto fallo
// ─────────────────────────────────────────────────────────────────────────────

describe('E11000 · Colisión de código en POST /api/orders', () => {
  it('500 · cuatro colisiones E11000 consecutivas devuelven INTERNAL_ERROR', async () => {
    // Mockear OrderModel.create para que siempre lance E11000.
    // La spec dice: 1 intento original + 3 reintentos = 4 intentos totales.
    // Al cuarto fallo → 500 INTERNAL_ERROR.
    const e11000 = Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });

    const { OrderModel: OM } = await import('../models/order');
    const spy = jest.spyOn(OM, 'create').mockRejectedValue(e11000);

    try {
      const prod = await createProduct({ available: 10 });
      const res = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 1 }]);

      expect(res.status).toBe(500);
      expect(res.body.code).toBe('INTERNAL_ERROR');
      // 1 original + 3 reintentos = 4 intentos totales (MAX_CODE_ATTEMPTS = 4)
      expect(spy).toHaveBeenCalledTimes(4);
    } finally {
      spy.mockRestore();
    }
  });

  it('201 · tres colisiones E11000 y cuarta con éxito → 201', async () => {
    // 3 colisiones (intentos 1, 2, 3) + éxito en el 4º intento → 201.
    const { OrderModel: OM } = await import('../models/order');
    let callCount = 0;
    // Mock: falla las primeras 3 veces, tiene éxito la 4ª
    const realCreate = OM.create.bind(OM);
    const spy = jest.spyOn(OM, 'create').mockImplementation(async (...args: unknown[]) => {
      callCount++;
      if (callCount < 4) {
        throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
      }
      return realCreate(...(args as Parameters<typeof OM.create>));
    });

    try {
      const prod = await createProduct({ available: 10 });
      const res = await createOrderViaApi(tokenA, [{ productId: prod._id.toString(), quantity: 1 }]);

      expect(res.status).toBe(201);
      expect(spy).toHaveBeenCalledTimes(4);
    } finally {
      spy.mockRestore();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 500 con fallo DENTRO de la transacción (tras escritura)
// ─────────────────────────────────────────────────────────────────────────────

describe('500 · fallo DENTRO de la transacción tras escritura en confirm', () => {
  it(
    '500 · findByIdInTx falla tras confirmInTx exitoso → pedido sigue pending_confirmation y stock intacto',
    async () => {
      // Crear producto con stock real
      const prod = await createProduct({ available: 10 });
      // Crear pedido real
      const createRes = await createOrderViaApi(tokenA, [
        { productId: prod._id.toString(), quantity: 3 },
      ]);
      const orderId = createRes.body.id;

      // Repositorio híbrido:
      // - findById real (pre-check fuera de la transacción funciona)
      // - confirmInTx real (escribe el cambio dentro de la transacción)
      // - findByIdInTx lanza un error inesperado (falla DENTRO de la tx, tras la escritura)
      // Esto hace que la transacción aborte y MongoDB deshaga el update
      const { MongoOrderRepository } = await import('../lib/MongoOrderRepository');
      const realRepo = new MongoOrderRepository();

      const hybridRepo: IOrderRepository = {
        create: realRepo.create.bind(realRepo),
        listByCustomer: realRepo.listByCustomer.bind(realRepo),
        findById: realRepo.findById.bind(realRepo),
        confirmInTx: realRepo.confirmInTx.bind(realRepo),
        findByIdInTx: jest.fn().mockRejectedValue(new Error('fallo de infraestructura tras escritura')),
      };

      const productService = new ProductService();
      const unitOfWork = new MongoUnitOfWork();
      const hybridService = new OrderService(productService, unitOfWork, hybridRepo);
      const hybridApp = createApp(mongoose, {
        orderController: new OrderController(hybridService),
      });

      const res = await request(hybridApp)
        .post(`/api/orders/${orderId}/confirm`)
        .set('Authorization', `Bearer ${tokenA}`);

      // Debe responder 500 INTERNAL_ERROR
      expect(res.status).toBe(500);
      expect(res.body.code).toBe('INTERNAL_ERROR');
      expect(res.body).not.toHaveProperty('stack');

      // El pedido debe seguir en pending_confirmation (transacción abortada)
      const order = await OrderModel.findById(orderId);
      expect(order!.status).toBe('pending_confirmation');

      // El stock debe estar intacto (la transacción se abortó antes del descuento,
      // o el descuento se deshizo al abortar)
      const updatedProd = await ProductModel.findById(prod._id);
      expect(updatedProd!.available).toBe(10);
    },
    30000
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Validación de query params con notación hexadecimal
// ─────────────────────────────────────────────────────────────────────────────

describe('Validación de query params — rechazo de notación no decimal', () => {
  it('400 · GET /api/orders con ?pageSize=0x10 → VALIDATION_ERROR (salta máximo en notación hex)', async () => {
    const res = await request(app)
      .get('/api/orders?pageSize=0x10')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · GET /api/orders con ?page=0x1 → VALIDATION_ERROR (notación hexadecimal no aceptada)', async () => {
    const res = await request(app)
      .get('/api/orders?page=0x1')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · GET /api/orders con ?pageSize=1.5 → VALIDATION_ERROR (decimal no aceptado)', async () => {
    const res = await request(app)
      .get('/api/orders?pageSize=1.5')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 · GET /api/orders con ?page=1abc → VALIDATION_ERROR (alfanumérico no aceptado)', async () => {
    const res = await request(app)
      .get('/api/orders?page=1abc')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
