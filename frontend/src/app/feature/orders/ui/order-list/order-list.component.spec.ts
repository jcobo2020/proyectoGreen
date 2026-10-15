import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { provideRouter } from '@angular/router';
import { createSpyObj } from '../../../../../testing/spy-obj';
import { OrderListComponent } from './order-list.component';
import { ListOrdersUseCase } from '../../application/order.use-cases';
import { OrderRepositoryPort, ORDER_REPOSITORY } from '../../domain/ports/order-repository.port';
import { OrdersPage } from '../../domain/models/order.model';
import {
  InvalidOrderInputError,
  OrderInfrastructureError,
  OrderUnauthorizedError
} from '../../domain/errors/order.errors';

/**
 * Configuración canónica según DEV1-2:
 * - Se dobla el REPOSITORIO por su puerto (ORDER_REPOSITORY con createSpyObj).
 * - Se usa el ListOrdersUseCase REAL (no un spy del caso de uso).
 */
function crear() {
  const repoSpy = createSpyObj<OrderRepositoryPort>('OrderRepositoryPort', ['listOrders']);

  TestBed.configureTestingModule({
    imports: [OrderListComponent],
    providers: [
      provideRouter([]),
      ListOrdersUseCase,
      { provide: ORDER_REPOSITORY, useValue: repoSpy }
    ]
  });

  const fixture = TestBed.createComponent(OrderListComponent);
  const component = fixture.componentInstance;
  return { fixture, component, repoSpy };
}

const paginaVacia: OrdersPage = { items: [], total: 0, page: 1, pageSize: 20 };
const paginaConDatos: OrdersPage = {
  items: [
    { id: 'o1', code: 'ORD-001', createdAt: '2024-01-15T10:00:00Z', updatedAt: '2024-01-15T10:00:00Z', total: 150.5, status: 'confirmed', items: [] },
    { id: 'o2', code: 'ORD-002', createdAt: '2024-01-16T11:00:00Z', updatedAt: '2024-01-16T11:00:00Z', total: 200, status: 'pending_confirmation', items: [] }
  ],
  total: 2,
  page: 1,
  pageSize: 20
};

describe('OrderListComponent', () => {
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

  // ─── Estado: cargando ───────────────────────────────────────────────────────

  describe('estado cargando', () => {
    it('muestra el estado cargando mientras la petición está en vuelo (sin resolver)', () => {
      /**
       * DEV1-3: Con la petición en vuelo (Subject nunca completado), ngOnInit se ejecuta,
       * el componente pasa a 'loading' y el DOM lo refleja tras detectChanges.
       */
      const { fixture, repoSpy } = crear();
      const peticionEnVuelo = new Subject<OrdersPage>();
      repoSpy.listOrders.mockReturnValue(peticionEnVuelo.asObservable());

      // ngOnInit dispara la carga
      fixture.detectChanges();

      // La petición sigue en vuelo; el estado debe ser 'loading'
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-cargando')).not.toBeNull();
      expect(el.querySelector('.estado-datos')).toBeNull();
      expect(el.querySelector('.estado-error')).toBeNull();
      expect(el.querySelector('.estado-vacio')).toBeNull();

      // Limpieza
      peticionEnVuelo.complete();
    });
  });

  // ─── Estado: vacío ───────────────────────────────────────────────────────────

  describe('estado vacío', () => {
    it('muestra "Todavía no tienes pedidos" y enlace "Nuevo pedido" cuando no hay pedidos', () => {
      const { fixture, repoSpy } = crear();
      repoSpy.listOrders.mockReturnValue(of(paginaVacia));

      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-vacio')).not.toBeNull();
      expect(el.textContent).toContain('Todavía no tienes pedidos');
      expect(el.querySelector('a')?.textContent).toContain('Nuevo pedido');
    });
  });

  // ─── Estado: con datos (200) ──────────────────────────────────────────────────

  describe('estado con datos (200)', () => {
    it('pinta la tabla con los pedidos devueltos por el servidor', () => {
      const { fixture, repoSpy } = crear();
      repoSpy.listOrders.mockReturnValue(of(paginaConDatos));

      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-datos')).not.toBeNull();
      expect(el.querySelector('table')).not.toBeNull();
      const filas = el.querySelectorAll('tbody tr');
      expect(filas.length).toBe(2);
      expect(el.textContent).toContain('ORD-001');
      expect(el.textContent).toContain('ORD-002');
    });
  });

  // ─── Estado: error ──────────────────────────────────────────────────────────

  describe('estado error', () => {
    it('muestra el mensaje de error y el botón Reintentar ante un error 500', () => {
      const { fixture, repoSpy } = crear();
      const error = new OrderInfrastructureError(500, '/api/orders');
      repoSpy.listOrders.mockReturnValue(throwError(() => error));

      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-error')).not.toBeNull();
      expect(el.querySelector('button')?.textContent).toContain('Reintentar');
    });

    it('reintentar llama de nuevo al repositorio', () => {
      const { fixture, component, repoSpy } = crear();
      const error = new OrderInfrastructureError(500, '/api/orders');
      repoSpy.listOrders.mockReturnValue(throwError(() => error));

      fixture.detectChanges();
      expect(repoSpy.listOrders).toHaveBeenCalledTimes(1);

      // Ahora la siguiente llamada devuelve datos
      repoSpy.listOrders.mockReturnValue(of(paginaConDatos));
      component.reintentar();
      fixture.detectChanges();

      expect(repoSpy.listOrders).toHaveBeenCalledTimes(2);
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-datos')).not.toBeNull();
    });
  });

  // ─── Estado: sin permiso (401) ───────────────────────────────────────────────

  describe('estado sin permiso (401)', () => {
    it('ante un 401 redirige al proveedor de identidad con returnUrl', () => {
      const { fixture, repoSpy } = crear();
      const error = new OrderUnauthorizedError();
      repoSpy.listOrders.mockReturnValue(throwError(() => error));

      fixture.detectChanges();

      expect(locationHref).toContain('returnUrl');
      expect(locationHref).toContain(encodeURIComponent('/orders'));
    });
  });

  // ─── Estado: 400 vuelve a página 1 ───────────────────────────────────────────

  describe('estado 400', () => {
    it('ante un error 400 en página > 1, vuelve a cargar la página 1 y muestra los datos', () => {
      /**
       * DEV1-3: Con mockReturnValueOnce controlamos que la primera llamada (página 2)
       * devuelva un 400 y la segunda (la recarga interna a página 1) devuelva datos.
       * Ambas llamadas son síncronas (throwError y of son síncronos), por lo que
       * tras fixture.detectChanges() el DOM refleja el estado final.
       */
      const { fixture, component, repoSpy } = crear();

      // Primera llamada (ngOnInit → página 1): éxito — el componente está en estado 'data'
      repoSpy.listOrders.mockReturnValueOnce(of(paginaConDatos));
      fixture.detectChanges();

      // Verificamos que arrancó con datos
      expect(fixture.nativeElement.querySelector('.estado-datos')).not.toBeNull();

      // Segunda llamada (cargar(2) → página 2): devuelve 400
      // Tercera llamada (recarga interna → página 1): devuelve datos
      const error400 = new InvalidOrderInputError();
      repoSpy.listOrders
        .mockReturnValueOnce(throwError(() => error400))
        .mockReturnValueOnce(of(paginaConDatos));

      component.cargar(2);
      fixture.detectChanges();

      // Después de la recarga a página 1, el DOM debe mostrar datos
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-datos')).not.toBeNull();
      expect(el.querySelector('.estado-error')).toBeNull();

      // La última llamada al repositorio fue con página 1
      const llamadas = repoSpy.listOrders.mock.calls;
      // Llamadas: [1,20] (ngOnInit), [2,20] (cargar(2)), [1,20] (recarga interna)
      expect(llamadas.length).toBe(3);
      expect(llamadas[llamadas.length - 1][0]).toBe(1);
    });

    it('ante un error 400 en página 1, muestra el estado error en el DOM', () => {
      const { fixture, repoSpy } = crear();
      const error = new InvalidOrderInputError();
      repoSpy.listOrders.mockReturnValue(throwError(() => error));

      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-error')).not.toBeNull();
      expect(el.querySelector('.estado-datos')).toBeNull();
    });
  });

  // ─── RN-01: los pedidos reflejan el último estado sin recargar manualmente ──

  describe('AC-05 · RN-01', () => {
    it('después de confirmar, el listado muestra el último estado sin recargar (el repo devuelve el estado actual)', () => {
      const { fixture, repoSpy } = crear();
      // El repositorio devuelve el estado confirmado directamente (el backend lo gestiona)
      const paginaConConfirmado: OrdersPage = {
        items: [{ id: 'o1', code: 'ORD-001', createdAt: '2024-01-15T10:00:00Z', updatedAt: '2024-01-15T10:00:00Z', total: 150.5, status: 'confirmed', items: [] }],
        total: 1, page: 1, pageSize: 20
      };
      repoSpy.listOrders.mockReturnValue(of(paginaConConfirmado));

      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('confirmed');
    });
  });
});
