import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { createSpyObj } from '../../../../../testing/spy-obj';
import { OrderNewComponent } from './order-new.component';
import { ListProductsUseCase, CreateOrderUseCase } from '../../application/order.use-cases';
import { ProductRepositoryPort, PRODUCT_REPOSITORY } from '../../domain/ports/product-repository.port';
import { OrderRepositoryPort, ORDER_REPOSITORY } from '../../domain/ports/order-repository.port';
import { ProductsPage, PublicProduct } from '../../domain/models/product.model';
import { PublicOrder } from '../../domain/models/order.model';
import {
  OrderUnauthorizedError,
  InsufficientStockError,
  ProductNotFoundError,
  InvalidOrderInputError,
  OrderInfrastructureError
} from '../../domain/errors/order.errors';

/**
 * Configuración canónica: se dobla el REPOSITORIO por su puerto.
 * El componente usa los casos de uso REALES, que dependen del puerto doblado.
 */
function crear() {
  const productRepoSpy = createSpyObj<ProductRepositoryPort>(
    'ProductRepositoryPort',
    ['listProducts']
  );
  const orderRepoSpy = createSpyObj<OrderRepositoryPort>(
    'OrderRepositoryPort',
    ['listOrders', 'createOrder']
  );
  const routerSpy = createSpyObj<Router>('Router', ['navigate']);

  TestBed.configureTestingModule({
    imports: [OrderNewComponent],
    providers: [
      ListProductsUseCase,
      CreateOrderUseCase,
      { provide: PRODUCT_REPOSITORY, useValue: productRepoSpy },
      { provide: ORDER_REPOSITORY, useValue: orderRepoSpy },
      { provide: Router, useValue: routerSpy }
    ]
  });

  const fixture = TestBed.createComponent(OrderNewComponent);
  const component = fixture.componentInstance;
  return { fixture, component, productRepoSpy, orderRepoSpy, routerSpy };
}

// ─── Datos de prueba ─────────────────────────────────────────────────────────

const productoA: PublicProduct = {
  id: 'prod-001',
  sku: 'SKU-001',
  name: 'Producto A',
  unitPrice: 10.00,
  available: 20
};

const productoB: PublicProduct = {
  id: 'prod-002',
  sku: 'SKU-002',
  name: 'Producto B',
  unitPrice: 25.50,
  available: 5
};

const paginaProductos: ProductsPage = {
  items: [productoA, productoB],
  total: 2,
  page: 1,
  pageSize: 50
};

const pedidoCreado: PublicOrder = {
  id: 'order-abc123',
  code: 'ORD-001',
  status: 'pending_confirmation',
  items: [{ productId: 'prod-001', sku: 'SKU-001', name: 'Producto A', unitPrice: 10.00, quantity: 2, lineTotal: 20.00 }],
  total: 20.00,
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T10:00:00Z'
};

// ─── Suite de pruebas ────────────────────────────────────────────────────────

describe('OrderNewComponent', () => {
  let locationHref: string;

  beforeEach(() => {
    locationHref = '';
    Object.defineProperty(window, 'location', {
      value: { ...window.location, set href(v: string) { locationHref = v; } },
      writable: true,
      configurable: true
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  // ─── Estado: cargando ─────────────────────────────────────────────────────

  describe('estado cargando', () => {
    it('muestra el estado cargando mientras la petición está en vuelo', () => {
      const { fixture, productRepoSpy } = crear();
      const peticionEnVuelo = new Subject<ProductsPage>();
      productRepoSpy.listProducts.mockReturnValue(peticionEnVuelo.asObservable());

      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-cargando')).not.toBeNull();
      expect(el.querySelector('.orden-nueva')).toBeNull();

      peticionEnVuelo.complete();
    });
  });

  // ─── Estado: error al cargar catálogo ────────────────────────────────────

  describe('estado error', () => {
    it('muestra el estado error y el botón Reintentar ante un error 500 al cargar', () => {
      const { fixture, productRepoSpy } = crear();
      const error = new OrderInfrastructureError(500, '/api/products');
      productRepoSpy.listProducts.mockReturnValue(throwError(() => error));

      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-error')).not.toBeNull();
      expect(el.querySelector('button')?.textContent).toContain('Reintentar');
    });

    it('reintentar recarga el catálogo', () => {
      const { fixture, component, productRepoSpy } = crear();
      const error = new OrderInfrastructureError(500, '/api/products');
      productRepoSpy.listProducts.mockReturnValueOnce(throwError(() => error));
      productRepoSpy.listProducts.mockReturnValueOnce(of(paginaProductos));

      fixture.detectChanges();
      component.reintentar();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.orden-nueva')).not.toBeNull();
      expect(productRepoSpy.listProducts).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Estado: sin permiso (401) ────────────────────────────────────────────

  describe('estado sin permiso (401)', () => {
    it('ante un 401 al cargar redirige al proveedor de identidad con returnUrl', () => {
      const { fixture, productRepoSpy } = crear();
      const error = new OrderUnauthorizedError();
      productRepoSpy.listProducts.mockReturnValue(throwError(() => error));

      fixture.detectChanges();

      expect(locationHref).toContain('returnUrl');
      expect(locationHref).toContain(encodeURIComponent('/orders/new'));
    });

    it('ante un 401 al crear redirige al proveedor de identidad', () => {
      const { fixture, component, productRepoSpy, orderRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));
      orderRepoSpy.createOrder.mockReturnValue(throwError(() => new OrderUnauthorizedError()));

      fixture.detectChanges();
      component.setQuantity('prod-001', 2);
      component.continuar();

      expect(locationHref).toContain('returnUrl');
    });
  });

  // ─── Estado: con datos (200) ──────────────────────────────────────────────

  describe('estado con datos', () => {
    it('muestra la tabla de productos del catálogo', () => {
      const { fixture, productRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));

      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.tabla-productos')).not.toBeNull();
      expect(el.textContent).toContain('Producto A');
      expect(el.textContent).toContain('Producto B');
    });

    it('muestra los campos name, sku, unitPrice, available en la tabla', () => {
      const { fixture, productRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));

      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('Producto A');
      expect(el.textContent).toContain('SKU-001');
      expect(el.textContent).toContain('20');
    });
  });

  // ─── AC-06: validación de cantidades ─────────────────────────────────────

  describe('AC-06 · validación de cantidades', () => {
    it('«Continuar» está deshabilitado cuando no hay cantidades seleccionadas', () => {
      const { fixture, productRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));

      fixture.detectChanges();

      const btn = fixture.nativeElement.querySelector('.btn-continuar') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('«Continuar» está habilitado cuando hay al menos una cantidad válida (1-99)', () => {
      const { fixture, component, productRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));

      fixture.detectChanges();
      component.setQuantity('prod-001', 3);
      fixture.detectChanges();

      const btn = fixture.nativeElement.querySelector('.btn-continuar') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('«Continuar» está deshabilitado si la cantidad es 0', () => {
      const { fixture, component, productRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));

      fixture.detectChanges();
      component.setQuantity('prod-001', 0);
      fixture.detectChanges();

      expect(component.continuarDeshabilitado()).toBe(true);
    });

    it('«Continuar» está deshabilitado si la cantidad supera 99', () => {
      const { fixture, component, productRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));

      fixture.detectChanges();
      component.setQuantity('prod-001', 100);
      fixture.detectChanges();

      expect(component.continuarDeshabilitado()).toBe(true);
    });

    it('«Continuar» está deshabilitado si la cantidad supera el disponible mostrado', () => {
      const { fixture, component, productRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));

      fixture.detectChanges();
      // productoB tiene available=5
      component.setQuantity('prod-002', 6);
      fixture.detectChanges();

      expect(component.continuarDeshabilitado()).toBe(true);
    });

    it('«Continuar» está habilitado si la cantidad es exactamente el disponible', () => {
      const { fixture, component, productRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));

      fixture.detectChanges();
      // productoB tiene available=5
      component.setQuantity('prod-002', 5);
      fixture.detectChanges();

      expect(component.continuarDeshabilitado()).toBe(false);
    });
  });

  // ─── AC-01: navegación a /orders/:id/confirm ──────────────────────────────

  describe('AC-01 · navegación (201 → /orders/:id/confirm)', () => {
    it('navega a /orders/:id/confirm con el id del pedido creado', () => {
      const { fixture, component, productRepoSpy, orderRepoSpy, routerSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));
      orderRepoSpy.createOrder.mockReturnValue(of(pedidoCreado));

      fixture.detectChanges();
      component.setQuantity('prod-001', 2);
      component.continuar();

      expect(routerSpy.navigate).toHaveBeenCalledWith(['/orders', 'order-abc123', 'confirm']);
    });

    it('envía solo productId y quantity en el payload (no precio ni total)', () => {
      const { fixture, component, productRepoSpy, orderRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));
      orderRepoSpy.createOrder.mockReturnValue(of(pedidoCreado));

      fixture.detectChanges();
      component.setQuantity('prod-001', 2);
      component.continuar();

      const llamada = orderRepoSpy.createOrder.mock.calls[0][0];
      expect(llamada).toEqual({ items: [{ productId: 'prod-001', quantity: 2 }] });
      // No hay campos de precio ni total
      expect(llamada.items[0]).not.toHaveProperty('price');
      expect(llamada.items[0]).not.toHaveProperty('total');
    });
  });

  // ─── AC-03: 409 INSUFFICIENT_STOCK ───────────────────────────────────────

  describe('AC-03 · 409 INSUFFICIENT_STOCK', () => {
    it('marca las líneas afectadas con el disponible del servidor y no navega', () => {
      const { fixture, component, productRepoSpy, orderRepoSpy, routerSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));
      const stockError = new InsufficientStockError([
        { productId: 'prod-001', requested: 5, available: 3 }
      ]);
      orderRepoSpy.createOrder.mockReturnValue(throwError(() => stockError));

      fixture.detectChanges();
      component.setQuantity('prod-001', 5);
      component.continuar();
      fixture.detectChanges();

      // No navega
      expect(routerSpy.navigate).not.toHaveBeenCalled();
      // Marca el error de stock
      expect(component.stockErrors()['prod-001']).toEqual({
        productId: 'prod-001',
        requested: 5,
        available: 3
      });
    });

    it('muestra el mensaje de error de stock en el DOM', () => {
      const { fixture, component, productRepoSpy, orderRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));
      const stockError = new InsufficientStockError([
        { productId: 'prod-001', requested: 5, available: 3 }
      ]);
      orderRepoSpy.createOrder.mockReturnValue(throwError(() => stockError));

      fixture.detectChanges();
      component.setQuantity('prod-001', 5);
      component.continuar();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.mensaje-error-stock')).not.toBeNull();
      expect(el.textContent).toContain('Stock insuficiente');
    });

    it('registra order_create_failed con código INSUFFICIENT_STOCK (R4-OBS-2)', () => {
      const { fixture, component, productRepoSpy, orderRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));
      const stockError = new InsufficientStockError([
        { productId: 'prod-001', requested: 5, available: 3 }
      ]);
      orderRepoSpy.createOrder.mockReturnValue(throwError(() => stockError));

      fixture.detectChanges();
      component.setQuantity('prod-001', 5);
      component.continuar();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('INSUFFICIENT_STOCK')
      );
    });
  });

  // ─── R4-PRUEBAS-6: doble pulsación ───────────────────────────────────────

  describe('doble pulsación', () => {
    it('con la petición en vuelo, el segundo clic no dispara otra', () => {
      const { fixture, component, productRepoSpy, orderRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));

      const peticionEnVuelo = new Subject<PublicOrder>();
      orderRepoSpy.createOrder.mockReturnValue(peticionEnVuelo.asObservable());

      fixture.detectChanges();
      component.setQuantity('prod-001', 2);

      component.continuar(); // primer clic — petición en vuelo
      component.continuar(); // segundo clic — no debe disparar otra
      component.continuar(); // tercer clic — tampoco

      expect(orderRepoSpy.createOrder).toHaveBeenCalledTimes(1);

      peticionEnVuelo.complete();
    });
  });

  // ─── R4-PRUEBAS-7: resumen lateral conserva cantidades ───────────────────

  describe('resumen lateral', () => {
    it('muestra el total estimado calculado con precios ya cargados (R4-REND-2)', () => {
      const { fixture, component, productRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));

      fixture.detectChanges();
      component.setQuantity('prod-001', 2); // 2 × 10.00 = 20.00
      fixture.detectChanges();

      expect(component.totalEstimado()).toBeCloseTo(20.00);
    });

    it('conserva las cantidades al cambiar de página del catálogo', () => {
      const { fixture, component, productRepoSpy } = crear();
      const pagina2: ProductsPage = {
        items: [{ id: 'prod-003', sku: 'SKU-003', name: 'Producto C', unitPrice: 5, available: 10 }],
        total: 3,
        page: 2,
        pageSize: 1 // pageSize 1 para tener múltiples páginas
      };

      productRepoSpy.listProducts
        .mockReturnValueOnce(of({ ...paginaProductos, pageSize: 1, total: 3 }))
        .mockReturnValueOnce(of(pagina2));

      fixture.detectChanges();
      component.setQuantity('prod-001', 3); // cantidad en página 1

      // Cambiar a página 2
      component.irAPagina(2);
      fixture.detectChanges();

      // La cantidad de prod-001 se conserva aunque no esté en la vista actual
      expect(component.getQuantity('prod-001')).toBe(3);
    });
  });

  // ─── Error 404 (ProductNotFound) ──────────────────────────────────────────

  describe('error 404 PRODUCT_NOT_FOUND', () => {
    it('muestra el estado error con mensaje de productos no disponibles', () => {
      const { fixture, component, productRepoSpy, orderRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));
      orderRepoSpy.createOrder.mockReturnValue(
        throwError(() => new ProductNotFoundError([{ productId: 'prod-001' }]))
      );

      fixture.detectChanges();
      component.setQuantity('prod-001', 2);
      component.continuar();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-error')).not.toBeNull();
      expect(el.textContent).toContain('no están disponibles');
    });

    it('registra order_create_failed con código PRODUCT_NOT_FOUND (R4-OBS-2)', () => {
      const { fixture, component, productRepoSpy, orderRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));
      orderRepoSpy.createOrder.mockReturnValue(
        throwError(() => new ProductNotFoundError([{ productId: 'prod-001' }]))
      );

      fixture.detectChanges();
      component.setQuantity('prod-001', 2);
      component.continuar();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('PRODUCT_NOT_FOUND')
      );
    });
  });

  // ─── Error 500 (InfrastructureError) ─────────────────────────────────────

  describe('error 500 al crear', () => {
    it('muestra el estado error al recibir un 500 al crear el pedido', () => {
      const { fixture, component, productRepoSpy, orderRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));
      orderRepoSpy.createOrder.mockReturnValue(
        throwError(() => new OrderInfrastructureError(500, '/api/orders'))
      );

      fixture.detectChanges();
      component.setQuantity('prod-001', 2);
      component.continuar();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-error')).not.toBeNull();
    });

    it('registra order_create_failed con el código de estado (R4-OBS-2)', () => {
      const { fixture, component, productRepoSpy, orderRepoSpy } = crear();
      productRepoSpy.listProducts.mockReturnValue(of(paginaProductos));
      orderRepoSpy.createOrder.mockReturnValue(
        throwError(() => new OrderInfrastructureError(500, '/api/orders'))
      );

      fixture.detectChanges();
      component.setQuantity('prod-001', 2);
      component.continuar();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('500')
      );
    });
  });
});
