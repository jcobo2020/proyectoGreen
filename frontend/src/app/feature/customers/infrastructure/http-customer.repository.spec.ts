import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { HttpCustomerRepository } from './http-customer.repository';
import { CreateCustomerPayload, Customer } from '../domain/models/customer.model';
import {
  CustomerInfrastructureError,
  CustomerUnauthorizedError,
  DuplicateCustomerError,
  InvalidCustomerInputError
} from '../domain/errors/customer.errors';

/**
 * HttpCustomerRepository: POST /api/customers y la traducción de cada código del contrato
 * (201, 400, 401, 409; el resto, infraestructura) a su error de dominio.
 */
const URL = `${environment.apiBaseUrl}/api/customers`;

const cuerpo: CreateCustomerPayload = {
  personType: 'natural',
  idType: 'cedula',
  idNumber: '0912345678',
  firstNames: 'Ana',
  lastNames: 'Pérez',
  email: 'ana@example.com',
  sourceChannel: 'cartera_propia'
};

const creado: Customer = { ...cuerpo, id: 'c-1', code: 'PRO-2026-001', createdAt: '2026-10-19T10:00:00.000Z' };

function crear() {
  TestBed.configureTestingModule({
    providers: [HttpCustomerRepository, provideHttpClient(), provideHttpClientTesting()]
  });
  return {
    repo: TestBed.inject(HttpCustomerRepository),
    httpMock: TestBed.inject(HttpTestingController)
  };
}

describe('HttpCustomerRepository', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  function fallarCon(status: number, body: object): Error {
    const { repo, httpMock } = crear();
    let recibido: Error | undefined;
    repo.createCustomer(cuerpo).subscribe({ error: (e: Error) => (recibido = e) });
    httpMock.expectOne(URL).flush(body, { status, statusText: 'x' });
    return recibido as Error;
  }

  it('201: envía el cuerpo por POST a /api/customers y devuelve el cliente creado', () => {
    const { repo, httpMock } = crear();
    let recibido: Customer | undefined;
    repo.createCustomer(cuerpo).subscribe(c => (recibido = c));

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(cuerpo);
    req.flush(creado, { status: 201, statusText: 'Created' });

    expect(recibido).toEqual(creado);
  });

  it('400 VALIDATION_ERROR → InvalidCustomerInputError con los details {field, message}', () => {
    const err = fallarCon(400, {
      code: 'VALIDATION_ERROR',
      message: 'x',
      details: [{ field: 'email', message: 'Ingresa un correo válido.' }, { nada: 1 }]
    });
    expect(err).toBeInstanceOf(InvalidCustomerInputError);
    expect((err as InvalidCustomerInputError).details).toEqual([
      { field: 'email', message: 'Ingresa un correo válido.' }
    ]);
  });

  it('400 sin details → InvalidCustomerInputError con details vacío', () => {
    const err = fallarCon(400, { code: 'VALIDATION_ERROR', message: 'x' });
    expect((err as InvalidCustomerInputError).details).toEqual([]);
  });

  it('401 UNAUTHORIZED → CustomerUnauthorizedError', () => {
    expect(fallarCon(401, { code: 'UNAUTHORIZED', message: 'x', details: [] })).toBeInstanceOf(
      CustomerUnauthorizedError
    );
  });

  it('409 CUSTOMER_DUPLICATE → DuplicateCustomerError', () => {
    expect(
      fallarCon(409, { code: 'CUSTOMER_DUPLICATE', message: 'Ya existe un cliente con esta identificación.' })
    ).toBeInstanceOf(DuplicateCustomerError);
  });

  it('500 INTERNAL_ERROR → CustomerInfrastructureError con el código y la ruta', () => {
    const err = fallarCon(500, { code: 'INTERNAL_ERROR', message: 'x', details: [] });
    expect(err).toBeInstanceOf(CustomerInfrastructureError);
    expect((err as CustomerInfrastructureError).status).toBe(500);
    expect((err as CustomerInfrastructureError).path).toBe(URL);
  });

  it('R4-SEG-5: el log del error no lleva datos del cliente ni el token', () => {
    const tokenDePrueba = crypto.randomUUID();
    sessionStorage.setItem('token', tokenDePrueba);
    fallarCon(409, {});
    const logueado = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.flat().join(' ');
    expect(logueado).toContain('409');
    expect(logueado).not.toContain('0912345678');
    expect(logueado).not.toContain('ana@example.com');
    expect(logueado).not.toContain(tokenDePrueba);
    sessionStorage.clear();
  });
});
