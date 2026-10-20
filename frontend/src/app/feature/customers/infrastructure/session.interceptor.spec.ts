import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { customersSessionInterceptor } from './session.interceptor';

/**
 * customersSessionInterceptor: ante un 401 limpia la sesión y lleva al inicio de sesión con
 * returnUrl; el resto lo deja pasar sin transformar.
 */
describe('customersSessionInterceptor', () => {
  const locationOriginal = window.location;
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let locationHref: string;
  let tokenDePrueba: string;

  beforeEach(() => {
    locationHref = '';
    Object.defineProperty(window, 'location', {
      value: {
        get href() { return locationHref; },
        set href(v: string) { locationHref = v; },
        get pathname() { return '/nuevo-prospecto'; }
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

  it('ante un 401 limpia el token y lleva al inicio de sesión con returnUrl=/nuevo-prospecto', () => {
    let recibido: HttpErrorResponse | undefined;
    http.post('/api/customers', {}).subscribe({ error: (e: HttpErrorResponse) => (recibido = e) });
    httpMock.expectOne('/api/customers').flush({ code: 'UNAUTHORIZED' }, { status: 401, statusText: 'x' });

    expect(sessionStorage.getItem('token')).toBeNull();
    expect(locationHref).toBe(`${environment.identityProviderUrl}?returnUrl=%2Fnuevo-prospecto`);
    expect(recibido?.status).toBe(401);
  });

  it('deja pasar sin transformar un 409, sin tocar la sesión ni navegar', () => {
    let recibido: HttpErrorResponse | undefined;
    http.post('/api/customers', {}).subscribe({ error: (e: HttpErrorResponse) => (recibido = e) });
    httpMock.expectOne('/api/customers').flush({ code: 'CUSTOMER_DUPLICATE' }, { status: 409, statusText: 'x' });

    expect(recibido).toBeInstanceOf(HttpErrorResponse);
    expect(recibido?.status).toBe(409);
    expect(recibido?.error).toEqual({ code: 'CUSTOMER_DUPLICATE' });
    expect(sessionStorage.getItem('token')).toBe(tokenDePrueba);
    expect(locationHref).toBe('');
  });
});
