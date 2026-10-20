import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateCustomerPayload, Customer } from '../models/customer.model';

/**
 * Puerto del repositorio de clientes.
 * La implementación HTTP está en infrastructure/http-customer.repository.ts.
 */
export interface CustomerRepositoryPort {
  /** POST /api/customers — alta de un cliente */
  createCustomer(payload: CreateCustomerPayload): Observable<Customer>;
}

export const CUSTOMER_REPOSITORY = new InjectionToken<CustomerRepositoryPort>(
  'CUSTOMER_REPOSITORY'
);
