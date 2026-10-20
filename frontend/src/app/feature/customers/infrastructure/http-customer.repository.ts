import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CreateCustomerPayload, Customer, CustomerFieldError } from '../domain/models/customer.model';
import { CustomerRepositoryPort } from '../domain/ports/customer-repository.port';
import {
  CustomerInfrastructureError,
  CustomerUnauthorizedError,
  DuplicateCustomerError,
  InvalidCustomerInputError
} from '../domain/errors/customer.errors';

@Injectable()
export class HttpCustomerRepository implements CustomerRepositoryPort {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** POST /api/customers — alta de un cliente (§2) */
  createCustomer(payload: CreateCustomerPayload): Observable<Customer> {
    const url = `${this.base}/api/customers`;
    return this.http
      .post<Customer>(url, payload)
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => this.traducir(err, url))));
  }

  /**
   * Traduce el código HTTP a un error de dominio (§2: 400, 401, 409; el resto, infraestructura).
   * R4-SEG-5 / R4-OBS-1: el log lleva el código y la ruta, nunca el cuerpo ni el token.
   */
  private traducir(err: HttpErrorResponse, path: string): Error {
    console.error(`[HTTP Error] ${err.status} · ${path}`);

    switch (err.status) {
      case 400:
        return new InvalidCustomerInputError(this.detalles(err.error?.details));
      case 401:
        return new CustomerUnauthorizedError();
      case 409:
        return new DuplicateCustomerError();
      default:
        return new CustomerInfrastructureError(err.status, path);
    }
  }

  /** details de un VALIDATION_ERROR: solo los elementos con la forma {field, message}. */
  private detalles(details: unknown): CustomerFieldError[] {
    if (!Array.isArray(details)) return [];
    return details.filter(
      (d): d is CustomerFieldError =>
        typeof d?.field === 'string' && typeof d?.message === 'string'
    );
  }
}
