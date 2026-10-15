import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { OrderConfirmComponent } from './order-confirm.component';
import { GetOrderUseCase, ConfirmOrderUseCase } from '../../application/order.use-cases';
import { PublicOrder } from '../../domain/models/order.model';
import {
  OrderNotFoundError,
  OrderForbiddenError,
  OrderUnauthorizedError,
  InsufficientStockError,
  InvalidOrderInputError,
  OrderInfrastructureError
} from '../../domain/errors/order.errors';
import { createSpyObj } from '../../../../../testing/spy-obj';

const PEDIDO_PENDIENTE: PublicOrder = {
  id: 'abc123',
  code: 'ORD-001',
  status: 'pending_confirmation',
  items: [
    { productId: 'p1', sku: 'SKU-01', name: 'Producto A', unitPrice: 10, quantity: 2, lineTotal: 20 }
  ],
  total: 20,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
};

const PEDIDO_CONFIRMADO: PublicOrder = {
  ...PEDIDO_PENDIENTE,
  status: 'confirmed',
  confirmedAt: '2024-01-01T10:00:00Z'
};

function crear(
  getOrderResult: Parameters<typeof of>[0] | Error = PEDIDO_PENDIENTE,
  confirmOrderResult: Parameters<typeof of>[0] | Error = PEDIDO_CONFIRMADO
) {
  const getOrderSpy = createSpyObj<GetOrderUseCase>('GetOrderUseCase', ['execute']);
  const confirmOrderSpy = createSpyObj<ConfirmOrderUseCase>('ConfirmOrderUseCase', ['execute']);

  if (getOrderResult instanceof Error) {
    getOrderSpy.execute.mockReturnValue(throwError(() => getOrderResult));
  } else {
    getOrderSpy.execute.mockReturnValue(of(getOrderResult));
  }

  if (confirmOrderResult instanceof Error) {
    confirmOrderSpy.execute.mockReturnValue(throwError(() => confirmOrderResult));
  } else {
    confirmOrderSpy.execute.mockReturnValue(of(confirmOrderResult));
  }

  TestBed.configureTestingModule({
    imports: [OrderConfirmComponent],
    providers: [
      { provide: GetOrderUseCase, useValue: getOrderSpy },
      { provide: ConfirmOrderUseCase, useValue: confirmOrderSpy },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: (_: string) => 'abc123' } } }
      }
    ]
  });

  const fixture = TestBed.createComponent(OrderConfirmComponent);
  const component = fixture.componentInstance;
  return { fixture, component, getOrderSpy, confirmOrderSpy };
}

describe('OrderConfirmComponent', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── Estado: cargando ───────────────────────────────────────────────────────
  describe('estado loading', () => {
    it('muestra el estado loading antes de recibir respuesta', () => {
      const { component } = crear();
      // Antes de ngOnInit el estado por defecto es 'loading'
      expect(component.viewState()).toBe('loading');
    });

    it('llama a getOrderUseCase con el id de la ruta', () => {
      const { component, getOrderSpy } = crear();
      component.ngOnInit();
      expect(getOrderSpy.execute).toHaveBeenCalledWith('abc123');
    });
  });

  // ── Estado: datos (pedido pendiente) ──────────────────────────────────────
  describe('estado data con pedido pendiente', () => {
    it('pasa a estado data al cargar el pedido', () => {
      const { component } = crear();
      component.ngOnInit();
      expect(component.viewState()).toBe('data');
    });

    it('guarda el pedido en la señal order', () => {
      const { component } = crear();
      component.ngOnInit();
      expect(component.order()).toEqual(PEDIDO_PENDIENTE);
    });

    it('muestra el botón Confirmar pedido cuando el estado es pending_confirmation', () => {
      const { fixture } = crear();
      fixture.detectChanges();
      const btn: HTMLElement = fixture.nativeElement.querySelector('.btn-confirmar');
      expect(btn).not.toBeNull();
    });
  });

  // ── Estado: confirmado (AC-02) ─────────────────────────────────────────────
  describe('AC-02 — pedido confirmado', () => {
    it('tras confirmar, muestra el pedido con status confirmed', () => {
      const { component } = crear();
      component.ngOnInit();
      component.confirmar();
      expect(component.order()!.status).toBe('confirmed');
    });

    it('tras confirmar, el botón desaparece (status !== pending_confirmation)', () => {
      const { fixture, component } = crear();
      fixture.detectChanges(); // inicializa la vista
      component.confirmar();
      fixture.detectChanges(); // refleja los cambios de señal
      const btn: HTMLElement = fixture.nativeElement.querySelector('.btn-confirmar');
      expect(btn).toBeNull();
    });

    it('muestra el aviso de éxito con el código del pedido tras confirmar', () => {
      const { fixture, component } = crear();
      fixture.detectChanges(); // inicializa la vista
      component.confirmar();
      fixture.detectChanges(); // refleja los cambios de señal
      const banner: HTMLElement = fixture.nativeElement.querySelector('.success-banner');
      expect(banner).not.toBeNull();
      expect(banner.textContent).toContain('ORD-001');
    });

    it('llama a confirmOrderUseCase con el id correcto', () => {
      const { component, confirmOrderSpy } = crear();
      component.ngOnInit();
      component.confirmar();
      expect(confirmOrderSpy.execute).toHaveBeenCalledWith('abc123');
    });
  });

  // ── R4-PRUEBAS-6 — doble pulsación ────────────────────────────────────────
  describe('R4-PRUEBAS-6 — doble pulsación', () => {
    it('una segunda llamada a confirmar() mientras está en vuelo no dispara otra petición', () => {
      // Usamos un Subject que nunca emite para simular una petición que
      // sigue en vuelo: así confirmando() permanece true de forma natural
      // (sin forzar la señal a mano) cuando se llama al segundo confirmar().
      const enVuelo$ = new Subject<PublicOrder>();

      const getOrderSpy = createSpyObj<GetOrderUseCase>('GetOrderUseCase', ['execute']);
      const confirmOrderSpy = createSpyObj<ConfirmOrderUseCase>('ConfirmOrderUseCase', ['execute']);

      getOrderSpy.execute.mockReturnValue(of(PEDIDO_PENDIENTE));
      // La primera y sucesivas llamadas devuelven el Subject que nunca emite
      confirmOrderSpy.execute.mockReturnValue(enVuelo$);

      TestBed.configureTestingModule({
        imports: [OrderConfirmComponent],
        providers: [
          { provide: GetOrderUseCase, useValue: getOrderSpy },
          { provide: ConfirmOrderUseCase, useValue: confirmOrderSpy },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: { get: (_: string) => 'abc123' } } }
          }
        ]
      });

      const fixture = TestBed.createComponent(OrderConfirmComponent);
      const component = fixture.componentInstance;
      component.ngOnInit(); // carga el pedido (getOrder resuelve OK)

      // Primer clic: pone confirmando = true y se queda esperando al Subject
      component.confirmar();
      // En este punto confirmando() es true (la petición está en vuelo)
      expect(component.confirmando()).toBe(true);

      // Segundo clic: la guardia detecta confirmando() === true y retorna sin llamar
      component.confirmar();

      // execute solo fue invocado una vez (por el primer clic)
      expect(confirmOrderSpy.execute).toHaveBeenCalledTimes(1);

      // Limpieza: completamos el Subject para no dejar suscripciones abiertas
      enVuelo$.complete();
    });
  });

  // ── AC-04 — forbidden (403) ───────────────────────────────────────────────
  describe('AC-04 — 403 forbidden', () => {
    it('al cargar: pasa al estado forbidden', () => {
      const { component } = crear(new OrderForbiddenError());
      component.ngOnInit();
      expect(component.viewState()).toBe('forbidden');
    });

    it('al confirmar: pasa al estado forbidden', () => {
      const { component } = crear(PEDIDO_PENDIENTE, new OrderForbiddenError());
      component.ngOnInit();
      component.confirmar();
      expect(component.viewState()).toBe('forbidden');
    });

    it('al confirmar con 403: registra order_confirm_failed con código ORDER_FORBIDDEN', () => {
      const { component } = crear(PEDIDO_PENDIENTE, new OrderForbiddenError());
      component.ngOnInit();
      component.confirmar();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('ORDER_FORBIDDEN')
      );
    });
  });

  // ── AC-04 — not found (404) ───────────────────────────────────────────────
  describe('AC-04 — 404 not found', () => {
    it('al cargar: pasa al estado not-found', () => {
      const { component } = crear(new OrderNotFoundError());
      component.ngOnInit();
      expect(component.viewState()).toBe('not-found');
    });

    it('al confirmar: pasa al estado not-found', () => {
      const { component } = crear(PEDIDO_PENDIENTE, new OrderNotFoundError());
      component.ngOnInit();
      component.confirmar();
      expect(component.viewState()).toBe('not-found');
    });

    it('al confirmar con 404: registra order_confirm_failed con código ORDER_NOT_FOUND', () => {
      const { component } = crear(PEDIDO_PENDIENTE, new OrderNotFoundError());
      component.ngOnInit();
      component.confirmar();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('ORDER_NOT_FOUND')
      );
    });
  });

  // ── Estado: error genérico ────────────────────────────────────────────────
  describe('estado error', () => {
    it('al cargar con error 500: pasa a estado error', () => {
      const { component } = crear(new OrderInfrastructureError(500, '/api/orders/abc123'));
      component.ngOnInit();
      expect(component.viewState()).toBe('error');
    });

    it('al cargar con InvalidOrderInputError (400): pasa a estado error', () => {
      const { component } = crear(new InvalidOrderInputError());
      component.ngOnInit();
      expect(component.viewState()).toBe('error');
    });

    it('al confirmar con error 500: pasa a estado error y registra order_confirm_failed', () => {
      const { component } = crear(PEDIDO_PENDIENTE, new OrderInfrastructureError(500, '/api/orders/abc123/confirm'));
      component.ngOnInit();
      component.confirmar();
      expect(component.viewState()).toBe('error');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('order_confirm_failed')
      );
    });

    it('reintentar vuelve a llamar a getOrderUseCase', () => {
      const { component, getOrderSpy } = crear(new OrderInfrastructureError(500, '/api/orders/abc123'));
      component.ngOnInit();
      component.reintentar();
      expect(getOrderSpy.execute).toHaveBeenCalledTimes(2);
    });
  });

  // ── Estado: stock insuficiente (409) ──────────────────────────────────────
  describe('error de stock insuficiente (409)', () => {
    it('al confirmar con InsufficientStockError: muestra mensaje de stock', () => {
      const stockError = new InsufficientStockError([
        { productId: 'p1', requested: 5, available: 2 }
      ]);
      const { component, fixture } = crear(PEDIDO_PENDIENTE, stockError);
      fixture.detectChanges();
      component.confirmar();
      fixture.detectChanges();
      expect(component.stockError()).toBeTruthy();
    });

    it('al confirmar con InsufficientStockError: registra order_confirm_failed con INSUFFICIENT_STOCK', () => {
      const stockError = new InsufficientStockError([
        { productId: 'p1', requested: 5, available: 2 }
      ]);
      const { component } = crear(PEDIDO_PENDIENTE, stockError);
      component.ngOnInit();
      component.confirmar();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('INSUFFICIENT_STOCK')
      );
    });

    it('al confirmar con InsufficientStockError: el pedido sigue en data (no cambia de vista)', () => {
      const stockError = new InsufficientStockError([
        { productId: 'p1', requested: 5, available: 2 }
      ]);
      const { component } = crear(PEDIDO_PENDIENTE, stockError);
      component.ngOnInit();
      component.confirmar();
      expect(component.viewState()).toBe('data');
    });
  });

  // ── Estado: unauthorized (401) ────────────────────────────────────────────
  describe('error 401 unauthorized', () => {
    it('al cargar con 401: redirige al proveedor de identidad', () => {
      const locationSpy = vi.spyOn(window, 'location', 'get').mockReturnValue({
        ...window.location,
        href: ''
      } as Location);
      let assignedHref = '';
      Object.defineProperty(window, 'location', {
        value: { ...window.location, set href(v: string) { assignedHref = v; } },
        writable: true
      });

      const { component } = crear(new OrderUnauthorizedError());
      component.ngOnInit();

      expect(assignedHref).toContain('returnUrl');
      locationSpy.mockRestore();
    });
  });

  // ── R4-OBS-2 — eventos de telemetría ──────────────────────────────────────
  describe('R4-OBS-2 — order_confirm_failed', () => {
    it('registra el evento con la ruta correcta al fallar la confirmación', () => {
      const { component } = crear(PEDIDO_PENDIENTE, new OrderInfrastructureError(500, ''));
      component.ngOnInit();
      component.confirmar();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('/api/orders/abc123/confirm')
      );
    });
  });
});
