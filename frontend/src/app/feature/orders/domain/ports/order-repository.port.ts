import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { OrdersPage, PublicOrder, CreateOrderPayload } from '../models/order.model';

/**
 * Puerto del repositorio de pedidos.
 * La implementación HTTP está en infrastructure/http-order.repository.ts.
 */
export interface OrderRepositoryPort {
  listOrders(page: number, pageSize: number): Observable<OrdersPage>;
  createOrder(payload: CreateOrderPayload): Observable<PublicOrder>;
}

export const ORDER_REPOSITORY = new InjectionToken<OrderRepositoryPort>(
  'ORDER_REPOSITORY'
);
