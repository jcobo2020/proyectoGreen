import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { createSpyObj } from '../../../../testing/spy-obj';
import { ListOrdersUseCase } from './order.use-cases';
import { OrderRepositoryPort, ORDER_REPOSITORY } from '../domain/ports/order-repository.port';
import { OrdersPage } from '../domain/models/order.model';
import { InvalidOrderInputError, OrderUnauthorizedError } from '../domain/errors/order.errors';

function crear() {
  const repoSpy = createSpyObj<OrderRepositoryPort>('OrderRepositoryPort', ['listOrders']);
  TestBed.configureTestingModule({
    providers: [
      ListOrdersUseCase,
      { provide: ORDER_REPOSITORY, useValue: repoSpy }
    ]
  });
  return { useCase: TestBed.inject(ListOrdersUseCase), repoSpy };
}

describe('ListOrdersUseCase', () => {
  const paginaEjemplo: OrdersPage = {
    items: [{ id: 'o1', code: 'ORD-001', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', total: 100, status: 'confirmed', items: [] }],
    total: 1,
    page: 1,
    pageSize: 20
  };

  it('llama al puerto con la página dada y pageSize 20', () => {
    const { useCase, repoSpy } = crear();
    repoSpy.listOrders.mockReturnValue(of(paginaEjemplo));

    useCase.execute(1).subscribe();

    expect(repoSpy.listOrders).toHaveBeenCalledWith(1, 20);
  });

  it('devuelve los pedidos que retorna el puerto', () => {
    const { useCase, repoSpy } = crear();
    repoSpy.listOrders.mockReturnValue(of(paginaEjemplo));

    let resultado: OrdersPage | undefined;
    useCase.execute(1).subscribe(p => resultado = p);

    expect(resultado).toEqual(paginaEjemplo);
  });

  it('usa page 1 por defecto', () => {
    const { useCase, repoSpy } = crear();
    repoSpy.listOrders.mockReturnValue(of(paginaEjemplo));

    useCase.execute().subscribe();

    expect(repoSpy.listOrders).toHaveBeenCalledWith(1, 20);
  });

  it('propaga el error de dominio InvalidOrderInputError', () => {
    const { useCase, repoSpy } = crear();
    const error = new InvalidOrderInputError();
    repoSpy.listOrders.mockReturnValue(throwError(() => error));

    let capturado: unknown;
    useCase.execute(0).subscribe({ error: e => capturado = e });

    expect(capturado).toBeInstanceOf(InvalidOrderInputError);
  });

  it('propaga el error de dominio OrderUnauthorizedError', () => {
    const { useCase, repoSpy } = crear();
    const error = new OrderUnauthorizedError();
    repoSpy.listOrders.mockReturnValue(throwError(() => error));

    let capturado: unknown;
    useCase.execute(1).subscribe({ error: e => capturado = e });

    expect(capturado).toBeInstanceOf(OrderUnauthorizedError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ListProductsUseCase
// ─────────────────────────────────────────────────────────────────────────────

import { ListProductsUseCase, CreateOrderUseCase } from './order.use-cases';
import { ProductRepositoryPort, PRODUCT_REPOSITORY } from '../domain/ports/product-repository.port';
import { ProductsPage } from '../domain/models/product.model';
import { CreateOrderPayload, PublicOrder } from '../domain/models/order.model';
import { InsufficientStockError, ProductNotFoundError } from '../domain/errors/order.errors';

function crearListProductos() {
  const repoSpy = createSpyObj<ProductRepositoryPort>('ProductRepositoryPort', ['listProducts']);
  TestBed.configureTestingModule({
    providers: [
      ListProductsUseCase,
      { provide: PRODUCT_REPOSITORY, useValue: repoSpy }
    ]
  });
  return { useCase: TestBed.inject(ListProductsUseCase), repoSpy };
}

describe('ListProductsUseCase', () => {
  const paginaEjemplo: ProductsPage = {
    items: [{ id: 'p1', sku: 'SKU-001', name: 'Producto A', unitPrice: 10, available: 20 }],
    total: 1,
    page: 1,
    pageSize: 50
  };

  afterEach(() => TestBed.resetTestingModule());

  it('llama al puerto con la página dada y pageSize 50 (R4-REND-1)', () => {
    const { useCase, repoSpy } = crearListProductos();
    repoSpy.listProducts.mockReturnValue(of(paginaEjemplo));

    useCase.execute(1).subscribe();

    expect(repoSpy.listProducts).toHaveBeenCalledWith(1, 50);
  });

  it('devuelve los productos que retorna el puerto', () => {
    const { useCase, repoSpy } = crearListProductos();
    repoSpy.listProducts.mockReturnValue(of(paginaEjemplo));

    let resultado: ProductsPage | undefined;
    useCase.execute(1).subscribe(p => resultado = p);

    expect(resultado).toEqual(paginaEjemplo);
  });

  it('usa page 1 por defecto', () => {
    const { useCase, repoSpy } = crearListProductos();
    repoSpy.listProducts.mockReturnValue(of(paginaEjemplo));

    useCase.execute().subscribe();

    expect(repoSpy.listProducts).toHaveBeenCalledWith(1, 50);
  });

  it('propaga el error de dominio del puerto', () => {
    const { useCase, repoSpy } = crearListProductos();
    const error = new OrderUnauthorizedError();
    repoSpy.listProducts.mockReturnValue(throwError(() => error));

    let capturado: unknown;
    useCase.execute(1).subscribe({ error: e => capturado = e });

    expect(capturado).toBeInstanceOf(OrderUnauthorizedError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CreateOrderUseCase
// ─────────────────────────────────────────────────────────────────────────────

function crearCreateOrder() {
  const repoSpy = createSpyObj<OrderRepositoryPort>('OrderRepositoryPort', ['listOrders', 'createOrder']);
  TestBed.configureTestingModule({
    providers: [
      CreateOrderUseCase,
      { provide: ORDER_REPOSITORY, useValue: repoSpy }
    ]
  });
  return { useCase: TestBed.inject(CreateOrderUseCase), repoSpy };
}

describe('CreateOrderUseCase', () => {
  const pedidoCreado: PublicOrder = {
    id: 'order-123',
    code: 'ORD-001',
    status: 'pending_confirmation',
    items: [{ productId: 'p1', sku: 'SKU-001', name: 'Producto A', unitPrice: 10, quantity: 2, lineTotal: 20 }],
    total: 20,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  };

  const payload: CreateOrderPayload = {
    items: [{ productId: 'p1', quantity: 2 }]
  };

  afterEach(() => TestBed.resetTestingModule());

  it('llama al puerto con el payload dado', () => {
    const { useCase, repoSpy } = crearCreateOrder();
    repoSpy.createOrder.mockReturnValue(of(pedidoCreado));

    useCase.execute(payload).subscribe();

    expect(repoSpy.createOrder).toHaveBeenCalledWith(payload);
  });

  it('devuelve el pedido que retorna el puerto', () => {
    const { useCase, repoSpy } = crearCreateOrder();
    repoSpy.createOrder.mockReturnValue(of(pedidoCreado));

    let resultado: PublicOrder | undefined;
    useCase.execute(payload).subscribe(p => resultado = p);

    expect(resultado).toEqual(pedidoCreado);
  });

  it('propaga InsufficientStockError del puerto', () => {
    const { useCase, repoSpy } = crearCreateOrder();
    const error = new InsufficientStockError([{ productId: 'p1', requested: 5, available: 2 }]);
    repoSpy.createOrder.mockReturnValue(throwError(() => error));

    let capturado: unknown;
    useCase.execute(payload).subscribe({ error: e => capturado = e });

    expect(capturado).toBeInstanceOf(InsufficientStockError);
  });

  it('propaga ProductNotFoundError del puerto', () => {
    const { useCase, repoSpy } = crearCreateOrder();
    const error = new ProductNotFoundError([{ productId: 'p1' }]);
    repoSpy.createOrder.mockReturnValue(throwError(() => error));

    let capturado: unknown;
    useCase.execute(payload).subscribe({ error: e => capturado = e });

    expect(capturado).toBeInstanceOf(ProductNotFoundError);
  });
});
