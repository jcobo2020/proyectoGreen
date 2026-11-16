import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { reportsSessionInterceptor } from './session.interceptor';

/**
 * reportsSessionInterceptor: ante un 401 limpia la sesión (R4-SEG-1);
 * el resto lo deja pasar sin transformar.
 */
describe('reportsSessionInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokenDePrueba: string;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([reportsSessionInterceptor])),
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
    TestBed.resetTestingModule();
  });

  it('ante un 401 limpia el token de sesión y propaga el error (R4-SEG-1)', () => {
    let recibido: HttpErrorResponse | undefined;
    http.get('/api/reports').subscribe({ error: (e: HttpErrorResponse) => (recibido = e) });
    httpMock.expectOne('/api/reports').flush(
      { code: 'UNAUTHORIZED' },
      { status: 401, statusText: 'Unauthorized' }
    );

    expect(sessionStorage.getItem('token')).toBeNull();
    expect(recibido?.status).toBe(401);
  });

  it('deja pasar un 400 sin tocar la sesión', () => {
    let recibido: HttpErrorResponse | undefined;
    http.get('/api/reports').subscribe({ error: (e: HttpErrorResponse) => (recibido = e) });
    httpMock.expectOne('/api/reports').flush(
      { code: 'VALIDATION_ERROR' },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(recibido?.status).toBe(400);
    expect(sessionStorage.getItem('token')).toBe(tokenDePrueba);
  });

  it('deja pasar un 500 sin tocar la sesión', () => {
    let recibido: HttpErrorResponse | undefined;
    http.get('/api/reports').subscribe({ error: (e: HttpErrorResponse) => (recibido = e) });
    httpMock.expectOne('/api/reports').flush(
      { message: 'Internal Server Error' },
      { status: 500, statusText: 'Internal Server Error' }
    );

    expect(recibido?.status).toBe(500);
    expect(sessionStorage.getItem('token')).toBe(tokenDePrueba);
  });

  it('deja pasar una respuesta 200 correctamente', () => {
    let resultado: unknown;
    http.get('/api/reports').subscribe(r => (resultado = r));
    httpMock.expectOne('/api/reports').flush({ items: [], total: 0, page: 1, pageSize: 20 });

    expect(resultado).toBeTruthy();
    expect(sessionStorage.getItem('token')).toBe(tokenDePrueba);
  });
});
