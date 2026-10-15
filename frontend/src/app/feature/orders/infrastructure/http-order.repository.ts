import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { OrdersPage, PublicOrder, CreateOrderPayload } from '../domain/models/order.model';
import { OrderRepositoryPort } from '../domain/ports/order-repository.port';
import {
  InvalidOrderInputError,
  OrderForbiddenError,
  OrderInfrastructureError,
  OrderNotFoundError,
  OrderNotPendingError,
  OrderUnauthorizedError,
  InsufficientStockError,
  ProductNotFoundError
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

  createOrder(payload: CreateOrderPayload): Observable<PublicOrder> {
    const url = `${this.base}/api/orders`;
    return this.http
      .post<PublicOrder>(url, payload)
      .pipe(catchError((err) => throwError(() => this.traducirCrear(err, url))));
  }

  /** GET /api/orders/:id — carga el pedido para la pantalla /orders/:id/confirm (§2) */
  getOrder(id: string): Observable<PublicOrder> {
    const url = `${this.base}/api/orders/${id}`;
    return this.http
      .get<PublicOrder>(url)
      .pipe(catchError((err) => throwError(() => this.traducir(err, url))));
  }

  /** POST /api/orders/:id/confirm — confirma el pedido pendiente (§2) */
  confirmOrder(id: string): Observable<PublicOrder> {
    const url = `${this.base}/api/orders/${id}/confirm`;
    return this.http
      .post<PublicOrder>(url, {})
      .pipe(catchError((err) => throwError(() => this.traducirConfirmar(err, url))));
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

  private traducirCrear(err: HttpErrorResponse, path: string): Error {
    // R4-OBS-1: registrar error sin token ni datos del cliente
    console.error(`[HTTP Error] ${err.status} · ${path}`);

    switch (err.status) {
      case 400:
        return new InvalidOrderInputError(err.error?.details);
      case 401:
        return new OrderUnauthorizedError();
      case 404:
        return new ProductNotFoundError(err.error?.details);
      case 409:
        return new InsufficientStockError(err.error?.details ?? []);
      default:
        return new OrderInfrastructureError(err.status, path);
    }
  }

  /**
   * Traducción de errores para POST /api/orders/:id/confirm (§2).
   * 400 → InvalidOrderInputError, 401 → OrderUnauthorizedError,
   * 403 → OrderForbiddenError, 404 → OrderNotFoundError,
   * 409 + ORDER_NOT_PENDING → OrderNotPendingError,
   * 409 + INSUFFICIENT_STOCK (u otro) → InsufficientStockError,
   * resto → OrderInfrastructureError.
   */
  private traducirConfirmar(err: HttpErrorResponse, path: string): Error {
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
      case 409:
        if (err.error?.code === 'ORDER_NOT_PENDING') {
          return new OrderNotPendingError();
        }
        return new InsufficientStockError(err.error?.details ?? []);
      default:
        return new OrderInfrastructureError(err.status, path);
    }
  }
}
