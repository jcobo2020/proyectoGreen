import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpOrderRepository } from './http-order.repository';
import {
  InvalidOrderInputError,
  OrderForbiddenError,
  OrderInfrastructureError,
  OrderNotFoundError,
  OrderUnauthorizedError
} from '../domain/errors/order.errors';

function crear() {
  TestBed.configureTestingModule({
    providers: [
      HttpOrderRepository,
      provideHttpClient(),
      provideHttpClientTesting()
    ]
  });
  return {
    repo: TestBed.inject(HttpOrderRepository),
    httpMock: TestBed.inject(HttpTestingController)
  };
}

describe('HttpOrderRepository', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  describe('listOrders — caso feliz (200)', () => {
    it('devuelve la página de pedidos del servidor', () => {
      const { repo, httpMock } = crear();
      const respuesta = {
        items: [{ id: 'o1', code: 'ORD-001', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', total: 100, status: 'confirmed', items: [] }],
        total: 1, page: 1, pageSize: 20
      };

      let resultado: unknown;
      repo.listOrders(1, 20).subscribe(r => resultado = r);

      const req = httpMock.expectOne(r => r.url.includes('/api/orders'));
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('pageSize')).toBe('20');
      req.flush(respuesta);

      expect(resultado).toEqual(respuesta);
      httpMock.verify();
    });
  });

  describe('listOrders — traducción de errores HTTP a errores de dominio', () => {
    it('400 → InvalidOrderInputError', () => {
      const { repo, httpMock } = crear();
      let error: unknown;
      repo.listOrders(0, 20).subscribe({ error: e => error = e });

      const req = httpMock.expectOne(r => r.url.includes('/api/orders'));
      req.flush(
        { code: 'VALIDATION_ERROR', message: 'page inválida', details: [] },
        { status: 400, statusText: 'Bad Request' }
      );

      expect(error).toBeInstanceOf(InvalidOrderInputError);
      httpMock.verify();
    });

    it('401 → OrderUnauthorizedError', () => {
      const { repo, httpMock } = crear();
      let error: unknown;
      repo.listOrders(1, 20).subscribe({ error: e => error = e });

      const req = httpMock.expectOne(r => r.url.includes('/api/orders'));
      req.flush(
        { code: 'UNAUTHORIZED', message: 'Sin token válido' },
        { status: 401, statusText: 'Unauthorized' }
      );

      expect(error).toBeInstanceOf(OrderUnauthorizedError);
      httpMock.verify();
    });

    it('403 → OrderForbiddenError', () => {
      const { repo, httpMock } = crear();
      let error: unknown;
      repo.listOrders(1, 20).subscribe({ error: e => error = e });

      const req = httpMock.expectOne(r => r.url.includes('/api/orders'));
      req.flush(
        { code: 'FORBIDDEN', message: 'Sin permiso' },
        { status: 403, statusText: 'Forbidden' }
      );

      expect(error).toBeInstanceOf(OrderForbiddenError);
      httpMock.verify();
    });

    it('404 → OrderNotFoundError', () => {
      const { repo, httpMock } = crear();
      let error: unknown;
      repo.listOrders(1, 20).subscribe({ error: e => error = e });

      const req = httpMock.expectOne(r => r.url.includes('/api/orders'));
      req.flush(
        { code: 'NOT_FOUND', message: 'No encontrado' },
        { status: 404, statusText: 'Not Found' }
      );

      expect(error).toBeInstanceOf(OrderNotFoundError);
      httpMock.verify();
    });

    it('500 → OrderInfrastructureError', () => {
      const { repo, httpMock } = crear();
      let error: unknown;
      repo.listOrders(1, 20).subscribe({ error: e => error = e });

      const req = httpMock.expectOne(r => r.url.includes('/api/orders'));
      req.flush(
        { code: 'INTERNAL_ERROR', message: 'Error interno' },
        { status: 500, statusText: 'Internal Server Error' }
      );

      expect(error).toBeInstanceOf(OrderInfrastructureError);
      httpMock.verify();
    });

    it('registra en consola el error con ruta y código (sin token ni datos del cliente)', () => {
      const { repo, httpMock } = crear();
      repo.listOrders(1, 20).subscribe({ error: () => {} });

      const req = httpMock.expectOne(r => r.url.includes('/api/orders'));
      req.flush({}, { status: 500, statusText: 'Internal Server Error' });

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('500')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('/api/orders')
      );
      httpMock.verify();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createOrder
// ─────────────────────────────────────────────────────────────────────────────

import {
  InsufficientStockError,
  ProductNotFoundError
} from '../domain/errors/order.errors';
import { CreateOrderPayload, PublicOrder } from '../domain/models/order.model';

describe('HttpOrderRepository · createOrder', () => {
  const payload: CreateOrderPayload = {
    items: [{ productId: 'prod-001', quantity: 2 }]
  };

  const pedidoCreado: PublicOrder = {
    id: 'order-abc',
    code: 'ORD-001',
    status: 'pending_confirmation',
    items: [{ productId: 'prod-001', sku: 'SKU-001', name: 'Prod A', unitPrice: 10, quantity: 2, lineTotal: 20 }],
    total: 20,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('201 → devuelve el pedido creado', () => {
    const { repo, httpMock } = crear();
    let resultado: unknown;
    repo.createOrder(payload).subscribe(r => resultado = r);

    const req = httpMock.expectOne(r => r.url.includes('/api/orders') && r.method === 'POST');
    req.flush(pedidoCreado, { status: 201, statusText: 'Created' });

    expect(resultado).toEqual(pedidoCreado);
    httpMock.verify();
  });

  it('400 → InvalidOrderInputError', () => {
    const { repo, httpMock } = crear();
    let error: unknown;
    repo.createOrder(payload).subscribe({ error: e => error = e });

    const req = httpMock.expectOne(r => r.url.includes('/api/orders') && r.method === 'POST');
    req.flush(
      { code: 'VALIDATION_ERROR', message: 'inválido', details: [] },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(error).toBeInstanceOf(InvalidOrderInputError);
    httpMock.verify();
  });

  it('401 → OrderUnauthorizedError', () => {
    const { repo, httpMock } = crear();
    let error: unknown;
    repo.createOrder(payload).subscribe({ error: e => error = e });

    const req = httpMock.expectOne(r => r.url.includes('/api/orders') && r.method === 'POST');
    req.flush(
      { code: 'UNAUTHORIZED', message: 'Sin token' },
      { status: 401, statusText: 'Unauthorized' }
    );

    expect(error).toBeInstanceOf(OrderUnauthorizedError);
    httpMock.verify();
  });

  it('404 → ProductNotFoundError', () => {
    const { repo, httpMock } = crear();
    let error: unknown;
    repo.createOrder(payload).subscribe({ error: e => error = e });

    const req = httpMock.expectOne(r => r.url.includes('/api/orders') && r.method === 'POST');
    req.flush(
      { code: 'PRODUCT_NOT_FOUND', message: 'No existe', details: [{ productId: 'prod-001' }] },
      { status: 404, statusText: 'Not Found' }
    );

    expect(error).toBeInstanceOf(ProductNotFoundError);
    httpMock.verify();
  });

  it('409 → InsufficientStockError', () => {
    const { repo, httpMock } = crear();
    let error: unknown;
    repo.createOrder(payload).subscribe({ error: e => error = e });

    const req = httpMock.expectOne(r => r.url.includes('/api/orders') && r.method === 'POST');
    req.flush(
      { code: 'INSUFFICIENT_STOCK', message: 'Stock insuficiente', details: [{ productId: 'prod-001', requested: 2, available: 1 }] },
      { status: 409, statusText: 'Conflict' }
    );

    expect(error).toBeInstanceOf(InsufficientStockError);
    const stockError = error as InsufficientStockError;
    expect(stockError.details[0].available).toBe(1);
    httpMock.verify();
  });

  it('500 → OrderInfrastructureError', () => {
    const { repo, httpMock } = crear();
    let error: unknown;
    repo.createOrder(payload).subscribe({ error: e => error = e });

    const req = httpMock.expectOne(r => r.url.includes('/api/orders') && r.method === 'POST');
    req.flush(
      { code: 'INTERNAL_ERROR', message: 'Error interno' },
      { status: 500, statusText: 'Internal Server Error' }
    );

    expect(error).toBeInstanceOf(OrderInfrastructureError);
    httpMock.verify();
  });

  it('registra en consola el error con ruta y código (R4-OBS-1)', () => {
    const { repo, httpMock } = crear();
    repo.createOrder(payload).subscribe({ error: () => {} });

    const req = httpMock.expectOne(r => r.url.includes('/api/orders') && r.method === 'POST');
    req.flush({}, { status: 409, statusText: 'Conflict' });

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('409'));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('/api/orders'));
    httpMock.verify();
  });
});
