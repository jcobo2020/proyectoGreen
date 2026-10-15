import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpProductRepository } from './http-product.repository';
import {
  InvalidOrderInputError,
  OrderUnauthorizedError,
  OrderInfrastructureError
} from '../domain/errors/order.errors';

function crear() {
  TestBed.configureTestingModule({
    providers: [
      HttpProductRepository,
      provideHttpClient(),
      provideHttpClientTesting()
    ]
  });
  return {
    repo: TestBed.inject(HttpProductRepository),
    httpMock: TestBed.inject(HttpTestingController)
  };
}

describe('HttpProductRepository', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  describe('listProducts — caso feliz (200)', () => {
    it('devuelve la página de productos del servidor', () => {
      const { repo, httpMock } = crear();
      const respuesta = {
        items: [{ id: 'p1', sku: 'SKU-001', name: 'Producto A', unitPrice: 10, available: 20 }],
        total: 1,
        page: 1,
        pageSize: 50
      };

      let resultado: unknown;
      repo.listProducts(1, 50).subscribe(r => resultado = r);

      const req = httpMock.expectOne(r => r.url.includes('/api/products'));
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('pageSize')).toBe('50');
      req.flush(respuesta);

      expect(resultado).toEqual(respuesta);
      httpMock.verify();
    });
  });

  describe('listProducts — traducción de errores HTTP a errores de dominio', () => {
    it('400 → InvalidOrderInputError', () => {
      const { repo, httpMock } = crear();
      let error: unknown;
      repo.listProducts(0, 50).subscribe({ error: e => error = e });

      const req = httpMock.expectOne(r => r.url.includes('/api/products'));
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
      repo.listProducts(1, 50).subscribe({ error: e => error = e });

      const req = httpMock.expectOne(r => r.url.includes('/api/products'));
      req.flush(
        { code: 'UNAUTHORIZED', message: 'Sin token válido' },
        { status: 401, statusText: 'Unauthorized' }
      );

      expect(error).toBeInstanceOf(OrderUnauthorizedError);
      httpMock.verify();
    });

    it('500 → OrderInfrastructureError', () => {
      const { repo, httpMock } = crear();
      let error: unknown;
      repo.listProducts(1, 50).subscribe({ error: e => error = e });

      const req = httpMock.expectOne(r => r.url.includes('/api/products'));
      req.flush(
        { code: 'INTERNAL_ERROR', message: 'Error interno' },
        { status: 500, statusText: 'Internal Server Error' }
      );

      expect(error).toBeInstanceOf(OrderInfrastructureError);
      httpMock.verify();
    });

    it('registra en consola el error con ruta y código, sin token (R4-OBS-1)', () => {
      const { repo, httpMock } = crear();
      repo.listProducts(1, 50).subscribe({ error: () => {} });

      const req = httpMock.expectOne(r => r.url.includes('/api/products'));
      req.flush({}, { status: 500, statusText: 'Internal Server Error' });

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('500')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('/api/products')
      );
      // No debe contener token ni datos del cliente
      const llamada = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(llamada).not.toContain('Bearer');
      httpMock.verify();
    });
  });
});
