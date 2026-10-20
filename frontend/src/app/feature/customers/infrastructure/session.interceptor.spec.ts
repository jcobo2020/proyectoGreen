import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { customersSessionInterceptor } from './session.interceptor';

/**
 * customersSessionInterceptor: ante un 401 limpia la sesión y deja pasar el error (la pantalla
 * enseña el mensaje); el resto lo deja pasar sin transformar.
 */
describe('customersSessionInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokenDePrueba: string;
  const locationOriginal = window.location;
  /** Cada navegación que intente el código (asignar href, assign, replace) queda aquí. */
  let navegaciones: string[];

  beforeEach(() => {
    navegaciones = [];
    Object.defineProperty(window, 'location', {
      value: {
        get href() { return 'http://localhost/nuevo-prospecto'; },
        set href(v: string) { navegaciones.push(v); },
        get pathname() { return '/nuevo-prospecto'; },
        assign: (v: string) => navegaciones.push(v),
        replace: (v: string) => navegaciones.push(v)
      },
      writable: true,
      configurable: true
    });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([customersSessionInterceptor])),
        provideHttpClientTesting()
      ]
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    tokenDePrueba = crypto.randomUUID();
    sessionStorage.setItem('token', tokenDePrueba);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
    Object.defineProperty(window, 'location', { value: locationOriginal, writable: true, configurable: true });
    TestBed.resetTestingModule();
  });

  it('ante un 401 limpia el token y propaga el 401 sin redirigir (la pantalla enseña el mensaje)', () => {
    let recibido: HttpErrorResponse | undefined;
    http.post('/api/customers', {}).subscribe({ error: (e: HttpErrorResponse) => (recibido = e) });
    httpMock.expectOne('/api/customers').flush({ code: 'UNAUTHORIZED' }, { status: 401, statusText: 'x' });

    expect(sessionStorage.getItem('token')).toBeNull();
    expect(recibido?.status).toBe(401);
    expect(navegaciones).toEqual([]);
  });

  it('deja pasar sin transformar un 409, sin tocar la sesión', () => {
    let recibido: HttpErrorResponse | undefined;
    http.post('/api/customers', {}).subscribe({ error: (e: HttpErrorResponse) => (recibido = e) });
    httpMock.expectOne('/api/customers').flush({ code: 'CUSTOMER_DUPLICATE' }, { status: 409, statusText: 'x' });

    expect(recibido).toBeInstanceOf(HttpErrorResponse);
    expect(recibido?.status).toBe(409);
    expect(recibido?.error).toEqual({ code: 'CUSTOMER_DUPLICATE' });
    expect(sessionStorage.getItem('token')).toBe(tokenDePrueba);
    expect(navegaciones).toEqual([]);
  });
});
