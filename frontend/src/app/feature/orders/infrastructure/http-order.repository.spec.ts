import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpOrderRepository } from './http-order.repository';
import {
  InvalidOrderInputError,
  OrderForbiddenError,
  OrderInfrastructureError,
  OrderNotFoundError,
  OrderUnauthorizedError
} from '../domain/errors/order.errors';

function crear() {
  TestBed.configureTestingModule({
    providers: [
      HttpOrderRepository,
      provideHttpClient(),
      provideHttpClientTesting()
    ]
  });
  return {
    repo: TestBed.inject(HttpOrderRepository),
    httpMock: TestBed.inject(HttpTestingController)
  };
}

describe('HttpOrderRepository', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  describe('listOrders — caso feliz (200)', () => {
    it('devuelve la página de pedidos del servidor', () => {
      const { repo, httpMock } = crear();
      const respuesta = {
        items: [{ code: 'ORD-001', createdAt: '2024-01-01T00:00:00Z', total: 100, status: 'confirmed' }],
        total: 1, page: 1, pageSize: 20
      };

      let resultado: unknown;
      repo.listOrders(1, 20).subscribe(r => resultado = r);

      const req = httpMock.expectOne(r => r.url.includes('/api/orders'));
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('pageSize')).toBe('20');
      req.flush(respuesta);

      expect(resultado).toEqual(respuesta);
      httpMock.verify();
    });
  });

  describe('listOrders — traducción de errores HTTP a errores de dominio', () => {
    it('400 → InvalidOrderInputError', () => {
      const { repo, httpMock } = crear();
      let error: unknown;
      repo.listOrders(0, 20).subscribe({ error: e => error = e });

      const req = httpMock.expectOne(r => r.url.includes('/api/orders'));
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
      repo.listOrders(1, 20).subscribe({ error: e => error = e });

      const req = httpMock.expectOne(r => r.url.includes('/api/orders'));
      req.flush(
        { code: 'UNAUTHORIZED', message: 'Sin token válido' },
        { status: 401, statusText: 'Unauthorized' }
      );

      expect(error).toBeInstanceOf(OrderUnauthorizedError);
      httpMock.verify();
    });

    it('403 → OrderForbiddenError', () => {
      const { repo, httpMock } = crear();
      let error: unknown;
      repo.listOrders(1, 20).subscribe({ error: e => error = e });

      const req = httpMock.expectOne(r => r.url.includes('/api/orders'));
      req.flush(
        { code: 'FORBIDDEN', message: 'Sin permiso' },
        { status: 403, statusText: 'Forbidden' }
      );

      expect(error).toBeInstanceOf(OrderForbiddenError);
      httpMock.verify();
    });

    it('404 → OrderNotFoundError', () => {
      const { repo, httpMock } = crear();
      let error: unknown;
      repo.listOrders(1, 20).subscribe({ error: e => error = e });

      const req = httpMock.expectOne(r => r.url.includes('/api/orders'));
      req.flush(
        { code: 'NOT_FOUND', message: 'No encontrado' },
        { status: 404, statusText: 'Not Found' }
      );

      expect(error).toBeInstanceOf(OrderNotFoundError);
      httpMock.verify();
    });

    it('500 → OrderInfrastructureError', () => {
      const { repo, httpMock } = crear();
      let error: unknown;
      repo.listOrders(1, 20).subscribe({ error: e => error = e });

      const req = httpMock.expectOne(r => r.url.includes('/api/orders'));
      req.flush(
        { code: 'INTERNAL_ERROR', message: 'Error interno' },
        { status: 500, statusText: 'Internal Server Error' }
      );

      expect(error).toBeInstanceOf(OrderInfrastructureError);
      httpMock.verify();
    });

    it('registra en consola el error con ruta y código (sin token ni datos del cliente)', () => {
      const { repo, httpMock } = crear();
      repo.listOrders(1, 20).subscribe({ error: () => {} });

      const req = httpMock.expectOne(r => r.url.includes('/api/orders'));
      req.flush({}, { status: 500, statusText: 'Internal Server Error' });

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('500')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('/api/orders')
      );
      httpMock.verify();
    });
  });
});
