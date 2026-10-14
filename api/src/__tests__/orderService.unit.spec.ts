/**
 * Tests unitarios de OrderService con dobles de IProductCatalog, IUnitOfWork e IOrderRepository.
 * Sin base de datos real: todos los puertos son mocks.
 */
import mongoose from 'mongoose';
import { OrderService, toPublicOrder, generateOrderCode } from '../services/OrderService';
import {
  IProductCatalog,
  IUnitOfWork,
  IOrderRepository,
  PublicProduct,
  OrderData,
} from '../lib/ports';
import { TransactionContext } from '../lib/transaction';
import {
  ProductNotFoundError,
  InsufficientStockError,
  InternalError,
  OrderNotFoundError,
  OrderForbiddenError,
  InvalidOrderIdError,
} from '../lib/errors';

// ─── Helpers: dobles de prueba ────────────────────────────────────────────────

function makeMockProductCatalog(overrides: Partial<IProductCatalog> = {}): IProductCatalog {
  return {
    findActiveByIds: jest.fn().mockResolvedValue([]),
    reserveStock: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

function makeMockUnitOfWork(overrides: Partial<IUnitOfWork> = {}): IUnitOfWork {
  return {
    run: jest.fn().mockImplementation(async (fn: (tx: TransactionContext) => Promise<unknown>) => {
      const fakeTx = {} as TransactionContext;
      return fn(fakeTx);
    }),
    ...overrides,
  };
}

function makeOrderData(overrides: Partial<OrderData> = {}): OrderData {
  return {
    id: new mongoose.Types.ObjectId().toString(),
    code: 'ORD-20240101-ABCDEF',
    customerId: 'customer-test-001',
    status: 'pending_confirmation',
    items: [],
    total: 0,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeMockOrderRepository(overrides: Partial<IOrderRepository> = {}): IOrderRepository {
  return {
    create: jest.fn().mockResolvedValue(makeOrderData()),
    listByCustomer: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    findById: jest.fn().mockResolvedValue(null),
    findByIdInTx: jest.fn().mockResolvedValue(null),
    confirmInTx: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

const CUSTOMER_ID = 'customer-test-001';

function makeProduct(overrides: Partial<PublicProduct> = {}): PublicProduct {
  return {
    id: new mongoose.Types.ObjectId().toString(),
    sku: 'SKU-001',
    name: 'Producto Test',
    unitPrice: 10.00,
    available: 100,
    ...overrides,
  };
}

// ─── generateOrderCode ────────────────────────────────────────────────────────

describe('generateOrderCode()', () => {
  it('genera un código con el formato ORD-AAAAMMDD-XXXXXX', () => {
    const code = generateOrderCode();
    expect(code).toMatch(/^ORD-\d{8}-[0-9A-Z]{6}$/);
  });

  it('genera códigos distintos en llamadas sucesivas (alta probabilidad)', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateOrderCode()));
    expect(codes.size).toBeGreaterThan(1);
  });

  it('solo usa el alfabeto Crockford base32', () => {
    const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{6}$/;
    for (let i = 0; i < 50; i++) {
      const code = generateOrderCode();
      const suffix = code.split('-')[2]!;
      expect(suffix).toMatch(CROCKFORD);
    }
  });
});

// ─── toPublicOrder ────────────────────────────────────────────────────────────

describe('toPublicOrder()', () => {
  it('omite confirmedAt cuando el status es pending_confirmation', () => {
    const data = makeOrderData({ status: 'pending_confirmation', confirmedAt: undefined });
    const result = toPublicOrder(data);
    expect(result).not.toHaveProperty('confirmedAt');
    expect(result.status).toBe('pending_confirmation');
  });

  it('incluye confirmedAt cuando el status es confirmed', () => {
    const confirmedAt = new Date('2024-06-01T12:00:00Z');
    const data = makeOrderData({ status: 'confirmed', confirmedAt });
    const result = toPublicOrder(data);
    expect(result).toHaveProperty('confirmedAt');
    expect(result.confirmedAt).toBe(confirmedAt.toISOString());
  });

  it('proyecta los items con 2 decimales (redondeo)', () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const data = makeOrderData({
      items: [
        {
          productId,
          sku: 'SKU-001',
          name: 'Prod',
          unitPrice: 9.999,
          quantity: 2,
          lineTotal: 19.998,
        },
      ],
      total: 19.998,
    });
    const result = toPublicOrder(data);
    expect(result.items[0]!.unitPrice).toBe(10.00);
    expect(result.items[0]!.lineTotal).toBe(20.00);
    expect(result.total).toBe(20.00);
    expect(result.items[0]!.productId).toBe(productId);
  });

  it('proyecta id, code, status, createdAt, updatedAt correctamente', () => {
    const id = new mongoose.Types.ObjectId().toString();
    const data = makeOrderData({ id, code: 'ORD-20240601-XYZABC', status: 'pending_confirmation' });
    const result = toPublicOrder(data);
    expect(result.id).toBe(id);
    expect(result.code).toBe('ORD-20240601-XYZABC');
    expect(result.status).toBe('pending_confirmation');
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
  });
});

// ─── OrderService.create ──────────────────────────────────────────────────────

describe('OrderService.create()', () => {
  it('lanza ProductNotFoundError si ningún producto existe', async () => {
    const catalog = makeMockProductCatalog({
      findActiveByIds: jest.fn().mockResolvedValue([]),
    });
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository();
    const service = new OrderService(catalog, uow, repo);

    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(
      service.create({ customerId: CUSTOMER_ID, items: [{ productId: fakeId, quantity: 1 }] })
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });

    expect(repo.create).not.toHaveBeenCalled();
  });

  it('lanza ProductNotFoundError con los ids que faltan', async () => {
    const existingProduct = makeProduct();
    const missingId = new mongoose.Types.ObjectId().toString();

    const catalog = makeMockProductCatalog({
      findActiveByIds: jest.fn().mockResolvedValue([existingProduct]),
    });
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository();
    const service = new OrderService(catalog, uow, repo);

    try {
      await service.create({
        customerId: CUSTOMER_ID,
        items: [
          { productId: existingProduct.id, quantity: 1 },
          { productId: missingId, quantity: 1 },
        ],
      });
      fail('Debería haber lanzado');
    } catch (err) {
      expect((err as ProductNotFoundError).code).toBe('PRODUCT_NOT_FOUND');
      const details = (err as ProductNotFoundError).details;
      expect(details.some((d) => d.productId === missingId)).toBe(true);
    }
  });

  it('lanza InsufficientStockError si alguna línea supera la disponibilidad', async () => {
    const product = makeProduct({ available: 2 });
    const catalog = makeMockProductCatalog({
      findActiveByIds: jest.fn().mockResolvedValue([product]),
    });
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository();
    const service = new OrderService(catalog, uow, repo);

    await expect(
      service.create({ customerId: CUSTOMER_ID, items: [{ productId: product.id, quantity: 5 }] })
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    expect(repo.create).not.toHaveBeenCalled();
  });

  it('InsufficientStockError tiene los details correctos para múltiples líneas', async () => {
    const prod1 = makeProduct({ id: new mongoose.Types.ObjectId().toString(), available: 1 });
    const prod2 = makeProduct({ id: new mongoose.Types.ObjectId().toString(), available: 2, sku: 'SKU-002' });

    const catalog = makeMockProductCatalog({
      findActiveByIds: jest.fn().mockResolvedValue([prod1, prod2]),
    });
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository();
    const service = new OrderService(catalog, uow, repo);

    try {
      await service.create({
        customerId: CUSTOMER_ID,
        items: [
          { productId: prod1.id, quantity: 5 },   // 5 > 1
          { productId: prod2.id, quantity: 10 },  // 10 > 2
        ],
      });
      fail('Debería haber lanzado');
    } catch (err) {
      expect((err as InsufficientStockError).code).toBe('INSUFFICIENT_STOCK');
      const details = (err as InsufficientStockError).details;
      expect(details).toHaveLength(2);
      const d1 = details.find((d) => d.productId === prod1.id)!;
      expect(d1.requested).toBe(5);
      expect(d1.available).toBe(1);
      const d2 = details.find((d) => d.productId === prod2.id)!;
      expect(d2.requested).toBe(10);
      expect(d2.available).toBe(2);
    }
  });

  it('calcula el total como la suma de unitPrice × quantity para cada línea', async () => {
    const prod1 = makeProduct({ id: new mongoose.Types.ObjectId().toString(), unitPrice: 10.00, available: 50 });
    const prod2 = makeProduct({ id: new mongoose.Types.ObjectId().toString(), unitPrice: 5.50, available: 50, sku: 'SKU-002' });

    const createdOrder = makeOrderData({
      items: [
        { productId: prod1.id, sku: prod1.sku, name: prod1.name, unitPrice: 10.00, quantity: 2, lineTotal: 20.00 },
        { productId: prod2.id, sku: prod2.sku, name: prod2.name, unitPrice: 5.50, quantity: 4, lineTotal: 22.00 },
      ],
      total: 42.00,
    });

    const catalog = makeMockProductCatalog({
      findActiveByIds: jest.fn().mockResolvedValue([prod1, prod2]),
    });
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository({
      create: jest.fn().mockResolvedValue(createdOrder),
    });
    const service = new OrderService(catalog, uow, repo);

    const result = await service.create({
      customerId: CUSTOMER_ID,
      items: [
        { productId: prod1.id, quantity: 2 },
        { productId: prod2.id, quantity: 4 },
      ],
    });

    expect(result.total).toBe(42.00);
    expect(result.items[0]!.lineTotal).toBe(20.00);
    expect(result.items[1]!.lineTotal).toBe(22.00);

    // Verificar que el repositorio recibió los datos correctos
    const repoCall = (repo.create as jest.Mock).mock.calls[0][0];
    expect(repoCall.total).toBe(42.00);
    expect(repoCall.items[0].lineTotal).toBe(20.00);
    expect(repoCall.items[1].lineTotal).toBe(22.00);
  });

  it('reintenta con nuevo código si el repositorio lanza E11000 (hasta 3 reintentos)', async () => {
    const product = makeProduct({ available: 10 });
    const catalog = makeMockProductCatalog({
      findActiveByIds: jest.fn().mockResolvedValue([product]),
    });
    const uow = makeMockUnitOfWork();

    const e11000 = Object.assign(new Error('E11000'), { code: 11000 });
    const successOrder = makeOrderData();
    let callCount = 0;
    const repo = makeMockOrderRepository({
      create: jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 4) throw e11000;
        return successOrder;
      }),
    });
    const service = new OrderService(catalog, uow, repo);

    const result = await service.create({
      customerId: CUSTOMER_ID,
      items: [{ productId: product.id, quantity: 1 }],
    });

    expect(result.id).toBe(successOrder.id);
    expect(repo.create).toHaveBeenCalledTimes(4); // 3 E11000 + 1 éxito
  });

  it('lanza InternalError si el repositorio lanza E11000 4 veces (MAX_CODE_ATTEMPTS agotado)', async () => {
    const product = makeProduct({ available: 10 });
    const catalog = makeMockProductCatalog({
      findActiveByIds: jest.fn().mockResolvedValue([product]),
    });
    const uow = makeMockUnitOfWork();
    const e11000 = Object.assign(new Error('E11000'), { code: 11000 });
    const repo = makeMockOrderRepository({
      create: jest.fn().mockRejectedValue(e11000),
    });
    const service = new OrderService(catalog, uow, repo);

    await expect(
      service.create({ customerId: CUSTOMER_ID, items: [{ productId: product.id, quantity: 1 }] })
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });

    expect(repo.create).toHaveBeenCalledTimes(4);
  });

  it('llama al repositorio con los datos correctos (customerId, items con precios del catálogo)', async () => {
    const product = makeProduct({ unitPrice: 7.50, available: 50 });
    const catalog = makeMockProductCatalog({
      findActiveByIds: jest.fn().mockResolvedValue([product]),
    });
    const uow = makeMockUnitOfWork();
    const orderResult = makeOrderData({ customerId: CUSTOMER_ID });
    const repo = makeMockOrderRepository({
      create: jest.fn().mockResolvedValue(orderResult),
    });
    const service = new OrderService(catalog, uow, repo);

    await service.create({
      customerId: CUSTOMER_ID,
      items: [{ productId: product.id, quantity: 4 }],
    });

    const repoCall = (repo.create as jest.Mock).mock.calls[0][0];
    expect(repoCall.customerId).toBe(CUSTOMER_ID);
    expect(repoCall.items[0].productId).toBe(product.id);
    expect(repoCall.items[0].unitPrice).toBe(7.50);
    expect(repoCall.items[0].quantity).toBe(4);
    expect(repoCall.items[0].lineTotal).toBe(30.00); // 7.50 × 4
    expect(repoCall.total).toBe(30.00);
  });
});

// ─── OrderService.list ────────────────────────────────────────────────────────

describe('OrderService.list()', () => {
  it('delega en el repositorio con los parámetros correctos', async () => {
    const catalog = makeMockProductCatalog();
    const uow = makeMockUnitOfWork();
    const orders = [makeOrderData(), makeOrderData()];
    const repo = makeMockOrderRepository({
      listByCustomer: jest.fn().mockResolvedValue({ items: orders, total: 2 }),
    });
    const service = new OrderService(catalog, uow, repo);

    const result = await service.list({ customerId: CUSTOMER_ID, page: 2, pageSize: 10 });

    expect(repo.listByCustomer).toHaveBeenCalledWith(CUSTOMER_ID, 2, 10);
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
  });

  it('devuelve lista vacía si el repositorio devuelve 0 pedidos', async () => {
    const catalog = makeMockProductCatalog();
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository({
      listByCustomer: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    });
    const service = new OrderService(catalog, uow, repo);

    const result = await service.list({ customerId: CUSTOMER_ID, page: 1, pageSize: 20 });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('proyecta cada pedido a PublicOrder', async () => {
    const confirmedAt = new Date('2024-06-01T12:00:00Z');
    const order = makeOrderData({ status: 'confirmed', confirmedAt });
    const catalog = makeMockProductCatalog();
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository({
      listByCustomer: jest.fn().mockResolvedValue({ items: [order], total: 1 }),
    });
    const service = new OrderService(catalog, uow, repo);

    const result = await service.list({ customerId: CUSTOMER_ID, page: 1, pageSize: 20 });

    expect(result.items[0]!.status).toBe('confirmed');
    expect(result.items[0]!.confirmedAt).toBe(confirmedAt.toISOString());
  });
});

// ─── OrderService.getById ─────────────────────────────────────────────────────

describe('OrderService.getById()', () => {
  it('lanza InvalidOrderIdError si el id no es un ObjectId válido', async () => {
    const catalog = makeMockProductCatalog();
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository();
    const service = new OrderService(catalog, uow, repo);

    await expect(
      service.getById('not-valid-id', CUSTOMER_ID)
    ).rejects.toMatchObject({ code: 'INVALID_ORDER_ID' });

    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('lanza OrderNotFoundError si el repositorio devuelve null', async () => {
    const catalog = makeMockProductCatalog();
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository({
      findById: jest.fn().mockResolvedValue(null),
    });
    const service = new OrderService(catalog, uow, repo);

    await expect(
      service.getById(new mongoose.Types.ObjectId().toString(), CUSTOMER_ID)
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });

  it('lanza OrderForbiddenError si el pedido pertenece a otro cliente', async () => {
    const order = makeOrderData({ customerId: 'otro-cliente' });
    const catalog = makeMockProductCatalog();
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository({
      findById: jest.fn().mockResolvedValue(order),
    });
    const service = new OrderService(catalog, uow, repo);

    await expect(
      service.getById(order.id, CUSTOMER_ID)
    ).rejects.toMatchObject({ code: 'ORDER_FORBIDDEN' });
  });

  it('devuelve el PublicOrder si el pedido existe y pertenece al cliente', async () => {
    const order = makeOrderData({ customerId: CUSTOMER_ID });
    const catalog = makeMockProductCatalog();
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository({
      findById: jest.fn().mockResolvedValue(order),
    });
    const service = new OrderService(catalog, uow, repo);

    const result = await service.getById(order.id, CUSTOMER_ID);

    expect(result.id).toBe(order.id);
    expect(result.status).toBe(order.status);
  });
});

// ─── OrderService.confirm ─────────────────────────────────────────────────────

describe('OrderService.confirm()', () => {
  it('lanza InvalidOrderIdError si el id no es un ObjectId válido', async () => {
    const catalog = makeMockProductCatalog();
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository();
    const service = new OrderService(catalog, uow, repo);

    await expect(
      service.confirm('bad-id', CUSTOMER_ID)
    ).rejects.toMatchObject({ code: 'INVALID_ORDER_ID' });

    // No debería llegar al repositorio
    expect(repo.findById).not.toHaveBeenCalled();
    expect(uow.run).not.toHaveBeenCalled();
  });

  it('lanza OrderNotFoundError si el pedido no existe (pre-check)', async () => {
    const catalog = makeMockProductCatalog();
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository({
      findById: jest.fn().mockResolvedValue(null),
    });
    const service = new OrderService(catalog, uow, repo);

    await expect(
      service.confirm(new mongoose.Types.ObjectId().toString(), CUSTOMER_ID)
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });

    expect(uow.run).not.toHaveBeenCalled();
  });

  it('lanza OrderForbiddenError si el pedido es de otro cliente (pre-check)', async () => {
    const order = makeOrderData({ customerId: 'otro-cliente' });
    const catalog = makeMockProductCatalog();
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository({
      findById: jest.fn().mockResolvedValue(order),
    });
    const service = new OrderService(catalog, uow, repo);

    await expect(
      service.confirm(order.id, CUSTOMER_ID)
    ).rejects.toMatchObject({ code: 'ORDER_FORBIDDEN' });

    expect(uow.run).not.toHaveBeenCalled();
  });

  it('confirma el pedido: llama a confirmInTx, descontando stock con reserveStock', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const pendingOrder = makeOrderData({
      customerId: CUSTOMER_ID,
      status: 'pending_confirmation',
      items: [{ productId, sku: 'SKU-1', name: 'Prod', unitPrice: 10, quantity: 2, lineTotal: 20 }],
    });
    const confirmedOrder = makeOrderData({
      ...pendingOrder,
      status: 'confirmed',
      confirmedAt: new Date(),
    });

    const catalog = makeMockProductCatalog({
      reserveStock: jest.fn().mockResolvedValue({ ok: true }),
    });
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository({
      findById: jest.fn().mockResolvedValue(pendingOrder),
      confirmInTx: jest.fn().mockResolvedValue(pendingOrder), // devuelve el doc anterior
      findByIdInTx: jest.fn().mockResolvedValue(confirmedOrder),
    });
    const service = new OrderService(catalog, uow, repo);

    const result = await service.confirm(pendingOrder.id, CUSTOMER_ID);

    expect(result.status).toBe('confirmed');
    expect(result).toHaveProperty('confirmedAt');
    expect(catalog.reserveStock).toHaveBeenCalledWith(
      [{ productId, quantity: 2 }],
      expect.anything()
    );
    expect(repo.confirmInTx).toHaveBeenCalledWith(pendingOrder.id, CUSTOMER_ID, expect.anything());
  });

  it('es idempotente: si confirmInTx devuelve null y el estado es confirmed, devuelve 200', async () => {
    const confirmedOrder = makeOrderData({
      customerId: CUSTOMER_ID,
      status: 'confirmed',
      confirmedAt: new Date(),
    });

    const catalog = makeMockProductCatalog();
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository({
      findById: jest.fn().mockResolvedValue(confirmedOrder),
      confirmInTx: jest.fn().mockResolvedValue(null), // no aplica: ya confirmado
      findByIdInTx: jest.fn().mockResolvedValue(confirmedOrder),
    });
    const service = new OrderService(catalog, uow, repo);

    const result = await service.confirm(confirmedOrder.id, CUSTOMER_ID);

    expect(result.status).toBe('confirmed');
    // No descontó stock
    expect(catalog.reserveStock).not.toHaveBeenCalled();
  });

  it('lanza InternalError si confirmInTx devuelve null y findByIdInTx devuelve un pedido en estado inesperado (no confirmed)', async () => {
    // §4: «si no casa y el pedido está en cualquier otro estado, se aborta con InternalError»
    // confirmInTx devuelve null → el pedido no estaba pending_confirmation dentro de la tx.
    // findByIdInTx devuelve el pedido con status 'pending_confirmation' (u otro distinto de confirmed).
    // → OrderService debe lanzar InternalError (estado inesperado).
    const pendingOrder = makeOrderData({
      customerId: CUSTOMER_ID,
      status: 'pending_confirmation',
    });
    const sameOrderStillPending = makeOrderData({
      ...pendingOrder,
      status: 'pending_confirmation', // no es 'confirmed' → estado inesperado
    });

    const catalog = makeMockProductCatalog();
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository({
      findById: jest.fn().mockResolvedValue(pendingOrder),
      confirmInTx: jest.fn().mockResolvedValue(null),        // update no aplicó
      findByIdInTx: jest.fn().mockResolvedValue(sameOrderStillPending), // sigue pending
    });
    const service = new OrderService(catalog, uow, repo);

    await expect(
      service.confirm(pendingOrder.id, CUSTOMER_ID)
    ).rejects.toBeInstanceOf(InternalError);

    // No se intentó descontar stock
    expect(catalog.reserveStock).not.toHaveBeenCalled();
  });

  it('lanza InternalError si findByIdInTx devuelve null tras reserveStock exitoso', async () => {
    // §4: rama donde confirmInTx SÍ aplicó el update (devuelve el doc anterior),
    // reserveStock devuelve ok:true, pero findByIdInTx devuelve null (pedido desapareció).
    // → OrderService debe lanzar InternalError.
    const productId = new mongoose.Types.ObjectId().toString();
    const pendingOrder = makeOrderData({
      customerId: CUSTOMER_ID,
      status: 'pending_confirmation',
      items: [{ productId, sku: 'SKU-1', name: 'Prod', unitPrice: 10, quantity: 2, lineTotal: 20 }],
    });

    const catalog = makeMockProductCatalog({
      reserveStock: jest.fn().mockResolvedValue({ ok: true }),
    });
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository({
      findById: jest.fn().mockResolvedValue(pendingOrder),
      confirmInTx: jest.fn().mockResolvedValue(pendingOrder), // update aplicó
      findByIdInTx: jest.fn().mockResolvedValue(null),         // pedido desapareció tras stock
    });
    const service = new OrderService(catalog, uow, repo);

    await expect(
      service.confirm(pendingOrder.id, CUSTOMER_ID)
    ).rejects.toBeInstanceOf(InternalError);

    // Sí se intentó descontar stock (el error ocurre después)
    expect(catalog.reserveStock).toHaveBeenCalled();
  });

  it('lanza InsufficientStockError si reserveStock devuelve ok:false', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const pendingOrder = makeOrderData({
      customerId: CUSTOMER_ID,
      status: 'pending_confirmation',
      items: [{ productId, sku: 'SKU-1', name: 'Prod', unitPrice: 10, quantity: 5, lineTotal: 50 }],
    });

    const catalog = makeMockProductCatalog({
      reserveStock: jest.fn().mockResolvedValue({
        ok: false,
        insufficient: [{ productId, requested: 5, available: 2 }],
      }),
    });
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository({
      findById: jest.fn().mockResolvedValue(pendingOrder),
      confirmInTx: jest.fn().mockResolvedValue(pendingOrder), // el update se aplicó
      findByIdInTx: jest.fn().mockResolvedValue(pendingOrder),
    });
    const service = new OrderService(catalog, uow, repo);

    try {
      await service.confirm(pendingOrder.id, CUSTOMER_ID);
      fail('Debería haber lanzado InsufficientStockError');
    } catch (err) {
      expect((err as InsufficientStockError).code).toBe('INSUFFICIENT_STOCK');
      const details = (err as InsufficientStockError).details;
      expect(details[0]!.productId).toBe(productId);
      expect(details[0]!.requested).toBe(5);
      expect(details[0]!.available).toBe(2);
    }
  });

  it('lanza OrderNotFoundError si confirmInTx devuelve null y findByIdInTx devuelve null (pedido desaparecido en transacción)', async () => {
    // Si el pedido desapareció entre el pre-check y la transacción, el servicio lanza ORDER_NOT_FOUND
    const pendingOrder = makeOrderData({ customerId: CUSTOMER_ID });
    const catalog = makeMockProductCatalog();
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository({
      findById: jest.fn().mockResolvedValue(pendingOrder),
      confirmInTx: jest.fn().mockResolvedValue(null),
      findByIdInTx: jest.fn().mockResolvedValue(null), // pedido desaparecido
    });
    const service = new OrderService(catalog, uow, repo);

    await expect(
      service.confirm(pendingOrder.id, CUSTOMER_ID)
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });

  it('lanza OrderForbiddenError si confirmInTx devuelve null y findByIdInTx devuelve pedido de otro cliente', async () => {
    const pendingOrder = makeOrderData({ customerId: CUSTOMER_ID });
    const otherClientOrder = makeOrderData({ customerId: 'otro-cliente', status: 'pending_confirmation' });

    const catalog = makeMockProductCatalog();
    const uow = makeMockUnitOfWork();
    const repo = makeMockOrderRepository({
      findById: jest.fn().mockResolvedValue(pendingOrder),
      confirmInTx: jest.fn().mockResolvedValue(null),
      findByIdInTx: jest.fn().mockResolvedValue(otherClientOrder),
    });
    const service = new OrderService(catalog, uow, repo);

    await expect(
      service.confirm(pendingOrder.id, CUSTOMER_ID)
    ).rejects.toMatchObject({ code: 'ORDER_FORBIDDEN' });
  });
});
