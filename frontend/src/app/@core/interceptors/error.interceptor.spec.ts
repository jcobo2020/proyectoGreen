import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting()
      ]
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  it('registra error en consola con ruta y código cuando hay un error HTTP', () => {
    http.get('/api/orders').subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/orders');
    req.flush({ message: 'Error' }, { status: 500, statusText: 'Internal Server Error' });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('500')
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('/api/orders')
    );
  });

  it('no registra token ni datos del cliente en el log de error', () => {
    sessionStorage.setItem('token', 'secreto-token');
    http.get('/api/orders').subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/orders');
    req.flush({ message: 'Error' }, { status: 401, statusText: 'Unauthorized' });

    const calls = (console.error as ReturnType<typeof vi.spyOn>).mock.calls;
    const loggedText = calls.flat().join(' ');
    expect(loggedText).not.toContain('secreto-token');
    sessionStorage.clear();
  });

  it('propaga el error al suscriptor', () => {
    const errorSpy = vi.fn();
    http.get('/api/orders').subscribe({ error: errorSpy });
    const req = httpMock.expectOne('/api/orders');
    req.flush({}, { status: 400, statusText: 'Bad Request' });
    expect(errorSpy).toHaveBeenCalled();
  });
});
