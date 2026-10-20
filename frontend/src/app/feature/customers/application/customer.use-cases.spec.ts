import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { createSpyObj } from '../../../../testing/spy-obj';
import { CreateCustomerUseCase } from './customer.use-cases';
import { CUSTOMER_REPOSITORY, CustomerRepositoryPort } from '../domain/ports/customer-repository.port';
import { CreateCustomerPayload, Customer } from '../domain/models/customer.model';

describe('CreateCustomerUseCase', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('delega en el puerto el alta con el cuerpo tal cual y devuelve el cliente creado', () => {
    const repo = createSpyObj<CustomerRepositoryPort>('CustomerRepositoryPort', ['createCustomer']);
    TestBed.configureTestingModule({
      providers: [CreateCustomerUseCase, { provide: CUSTOMER_REPOSITORY, useValue: repo }]
    });
    const cuerpo: CreateCustomerPayload = {
      personType: 'legal',
      idType: 'ruc',
      idNumber: '0912345678001',
      legalName: 'Acme S.A.',
      email: 'info@acme.ec',
      sourceChannel: 'cuenta_estrategica'
    };
    const creado: Customer = { ...cuerpo, id: 'c-1', code: 'PRO-2026-001', createdAt: '2026-10-19T10:00:00.000Z' };
    repo.createCustomer.mockReturnValue(of(creado));

    let recibido: Customer | undefined;
    TestBed.inject(CreateCustomerUseCase).execute(cuerpo).subscribe(c => (recibido = c));

    expect(repo.createCustomer).toHaveBeenCalledWith(cuerpo);
    expect(recibido).toEqual(creado);
  });
});
