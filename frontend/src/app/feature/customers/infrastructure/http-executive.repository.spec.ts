import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { HttpExecutiveRepository } from './http-executive.repository';
import { ExecutiveOption } from '../domain/models/executive.model';
import {
  ExecutiveInfrastructureError,
  ExecutiveUnauthorizedError
} from '../domain/errors/executive.errors';

/**
 * HttpExecutiveRepository: GET /api/executives (contrato GREEN-H2-API-EJECUTIVOS-001: 200 y 401).
 */
const URL = `${environment.apiBaseUrl}/api/executives`;

function crear() {
  TestBed.configureTestingModule({
    providers: [HttpExecutiveRepository, provideHttpClient(), provideHttpClientTesting()]
  });
  return {
    repo: TestBed.inject(HttpExecutiveRepository),
    httpMock: TestBed.inject(HttpTestingController)
  };
}

describe('HttpExecutiveRepository', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('200: pide GET /api/executives y devuelve las opciones {value, label}', () => {
    const { repo, httpMock } = crear();
    const opciones: ExecutiveOption[] = [{ value: '665f1c2a9b1e8a0012345678', label: 'Daniela Ríos' }];
    let recibido: ExecutiveOption[] | undefined;
    repo.listExecutives().subscribe(o => (recibido = o));

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush(opciones);

    expect(recibido).toEqual(opciones);
  });

  it('401 UNAUTHORIZED → ExecutiveUnauthorizedError', () => {
    const { repo, httpMock } = crear();
    let recibido: Error | undefined;
    repo.listExecutives().subscribe({ error: (e: Error) => (recibido = e) });
    httpMock.expectOne(URL).flush({ code: 'UNAUTHORIZED', message: 'x', details: [] }, { status: 401, statusText: 'x' });
    expect(recibido).toBeInstanceOf(ExecutiveUnauthorizedError);
  });

  it('otro código → ExecutiveInfrastructureError con el código y la ruta', () => {
    const { repo, httpMock } = crear();
    let recibido: Error | undefined;
    repo.listExecutives().subscribe({ error: (e: Error) => (recibido = e) });
    httpMock.expectOne(URL).flush({}, { status: 503, statusText: 'x' });
    expect(recibido).toBeInstanceOf(ExecutiveInfrastructureError);
    expect((recibido as ExecutiveInfrastructureError).status).toBe(503);
    expect((recibido as ExecutiveInfrastructureError).path).toBe(URL);
  });
});
