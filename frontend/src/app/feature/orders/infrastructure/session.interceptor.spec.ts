import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ordersSessionInterceptor } from './session.interceptor';

/**
 * Spec de ordersSessionInterceptor (R4-ARQ-3, R4-ARQ-6):
 * - Ante 401: limpia sessionStorage y redirige al proveedor con returnUrl.
 * - Ante otros errores: los deja pasar sin transformar.
 */
describe('ordersSessionInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let locationHref: string;

  beforeEach(() => {
    locationHref = '';
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        get href() { return locationHref; },
        set href(v: string) { locationHref = v; },
        get pathname() { return '/orders'; }
      },
      writable: true,
      configurable: true
    });

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([ordersSessionInterceptor])),
        provideHttpClientTesting()
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    sessionStorage.setItem('token', 'jwt-valido');
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('ante un 401 limpia el token de sessionStorage', () => {
    expect(sessionStorage.getItem('token')).toBe('jwt-valido');

    http.get('/api/orders').subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/orders');
    req.flush(
      { code: 'UNAUTHORIZED', message: 'Sin token válido' },
      { status: 401, statusText: 'Unauthorized' }
    );

    expect(sessionStorage.getItem('token')).toBeNull();
  });

  it('ante un 401 redirige al proveedor de identidad con returnUrl', () => {
    http.get('/api/orders').subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/orders');
    req.flush(
      { code: 'UNAUTHORIZED', message: 'Sin token válido' },
      { status: 401, statusText: 'Unauthorized' }
    );

    expect(locationHref).toContain('returnUrl');
    expect(locationHref).toContain(encodeURIComponent('/orders'));
  });

  it('ante un 401 propaga el error al suscriptor', () => {
    const errorSpy = vi.fn();
    http.get('/api/orders').subscribe({ error: errorSpy });
    const req = httpMock.expectOne('/api/orders');
    req.flush(
      { code: 'UNAUTHORIZED', message: 'Sin token válido' },
      { status: 401, statusText: 'Unauthorized' }
    );

    expect(errorSpy).toHaveBeenCalled();
  });

  it('ante un 400 NO redirige al proveedor (deja pasar el error)', () => {
    http.get('/api/orders').subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/orders');
    req.flush(
      { code: 'VALIDATION_ERROR', message: 'Página inválida' },
      { status: 400, statusText: 'Bad Request' }
    );

    // No redirige ante 400
    expect(locationHref).toBe('');
    // El token sigue en sessionStorage
    expect(sessionStorage.getItem('token')).toBe('jwt-valido');
  });

  it('ante un 500 NO redirige al proveedor (deja pasar el error)', () => {
    const errorSpy = vi.fn();
    http.get('/api/orders').subscribe({ error: errorSpy });
    const req = httpMock.expectOne('/api/orders');
    req.flush(
      { code: 'INTERNAL_ERROR', message: 'Error interno' },
      { status: 500, statusText: 'Internal Server Error' }
    );

    expect(locationHref).toBe('');
    expect(errorSpy).toHaveBeenCalled();
  });
});
