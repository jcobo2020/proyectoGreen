import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateCustomerPayload, Customer } from '../domain/models/customer.model';
import { CUSTOMER_REPOSITORY } from '../domain/ports/customer-repository.port';

/**
 * Caso de uso: «Guardar cliente» (POST /api/customers).
 * Que la identificación no se repita lo decide el backend (R4-ARQ-4): aquí no se comprueba.
 */
@Injectable()
export class CreateCustomerUseCase {
  private readonly repo = inject(CUSTOMER_REPOSITORY);

  execute(payload: CreateCustomerPayload): Observable<Customer> {
    return this.repo.createCustomer(payload);
  }
}
