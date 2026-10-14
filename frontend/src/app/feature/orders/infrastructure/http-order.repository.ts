import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { OrdersPage } from '../domain/models/order.model';
import { OrderRepositoryPort } from '../domain/ports/order-repository.port';
import {
  InvalidOrderInputError,
  OrderForbiddenError,
  OrderInfrastructureError,
  OrderNotFoundError,
  OrderUnauthorizedError
} from '../domain/errors/order.errors';

@Injectable()
export class HttpOrderRepository implements OrderRepositoryPort {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  listOrders(page: number, pageSize: number): Observable<OrdersPage> {
    const url = `${this.base}/api/orders`;
    return this.http
      .get<OrdersPage>(url, { params: { page: String(page), pageSize: String(pageSize) } })
      .pipe(catchError((err) => throwError(() => this.traducir(err, url))));
  }

  private traducir(err: HttpErrorResponse, path: string): Error {
    // R4-OBS-1: registrar error sin token ni datos del cliente
    console.error(`[HTTP Error] ${err.status} · ${path}`);

    switch (err.status) {
      case 400:
        return new InvalidOrderInputError(err.error?.details);
      case 401:
        return new OrderUnauthorizedError();
      case 403:
        return new OrderForbiddenError();
      case 404:
        return new OrderNotFoundError();
      default:
        return new OrderInfrastructureError(err.status, path);
    }
  }
}
